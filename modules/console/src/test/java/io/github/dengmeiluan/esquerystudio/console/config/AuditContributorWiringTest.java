/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.console.config;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuditContributor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import org.junit.Test;

import javax.sql.DataSource;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 审计 SPI 装配级布线测试——直接调用
 * {@code ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration#consoleOpsAuditStore}
 * 的 @Bean 方法体（jdbc 档 + 桩 DataSource + ObjectProvider 桩），锁定装配分支：
 * <ul>
 *   <li>宿主注册 {@link ConsoleAuditContributor} 且显式开启 host-audit-merge → 查询期并入
 *       宿主记录（合并层生效，宿主记录 source=host）；</li>
 *   <li>宿主注册但未开启（<b>裁决默认关</b>：宿主侧多为匿名登录族，username
 *       结构性 null 不可读，非本控制台请求不进控制台审计视图）→ 不包合并层；</li>
 *   <li>宿主未注册（getIfAvailable=null）→ 裸 JdbcConsoleOpsAuditStore——「不注册零影响」。</li>
 * </ul>
 * 单测（HostAuditMergeStoreTest/EsConsoleAuditContributorTest）证的是合并与映射逻辑本身，
 * 本测试证的是自动装配分支真的把两者接起来——SPI 从接口到 @Bean 到查询的全链闭环。
 */
public class AuditContributorWiringTest {

    /* ── 空 JDBC 档（JDK 动态代理，仓内测试基线=直构造无 mockito） ── */

    private static ResultSet emptyRs() {
        InvocationHandler h = (p, m, a) -> {
            switch (m.getName()) {
                case "next": return false;
                case "close": case "wasNull": return false;
                case "getString": return null;
                case "getLong": return 0L;
                case "getInt": return 0;
                default: throw new UnsupportedOperationException("RS." + m.getName());
            }
        };
        return (ResultSet) Proxy.newProxyInstance(AuditContributorWiringTest.class.getClassLoader(),
                new Class<?>[]{ResultSet.class}, h);
    }

    private static DataSource emptyDb() {
        InvocationHandler psH = (p, m, a) -> {
            switch (m.getName()) {
                case "executeQuery": return emptyRs();
                case "executeUpdate": return 1;
                case "setString": case "setLong": case "setInt": case "setObject": case "setNull": case "close": return null;
                default: throw new UnsupportedOperationException("PS." + m.getName());
            }
        };
        InvocationHandler stH = (p, m, a) -> {
            switch (m.getName()) {
                case "execute": return true;             /* DDL：建表/索引/ALTER 全吞 */
                case "executeQuery": return emptyRs();   /* 富列探测 → richColumns=true */
                case "close": return null;
                default: throw new UnsupportedOperationException("Stmt." + m.getName());
            }
        };
        InvocationHandler connH = (p, m, a) -> {
            switch (m.getName()) {
                case "prepareStatement":
                    return PreparedStatement.class.cast(Proxy.newProxyInstance(
                            AuditContributorWiringTest.class.getClassLoader(), new Class<?>[]{PreparedStatement.class}, psH));
                case "createStatement":
                    return Statement.class.cast(Proxy.newProxyInstance(
                            AuditContributorWiringTest.class.getClassLoader(), new Class<?>[]{Statement.class}, stH));
                case "close": case "setAutoCommit": case "commit": return null;
                default: throw new UnsupportedOperationException("Conn." + m.getName());
            }
        };
        InvocationHandler dsH = (p, m, a) -> {
            if ("getConnection".equals(m.getName())) {
                return Connection.class.cast(Proxy.newProxyInstance(
                        AuditContributorWiringTest.class.getClassLoader(), new Class<?>[]{Connection.class}, connH));
            }
            throw new UnsupportedOperationException("DS." + m.getName());
        };
        return (DataSource) Proxy.newProxyInstance(AuditContributorWiringTest.class.getClassLoader(),
                new Class<?>[]{DataSource.class}, dsH);
    }

    /** ObjectProvider 桩：固定返回给定单例（null=未注册）。 */
    private static <T> org.springframework.beans.factory.ObjectProvider<T> provider(T value) {
        return new org.springframework.beans.factory.ObjectProvider<T>() {
            @Override public T getObject() { if (value == null) throw new UnsupportedOperationException(); return value; }
            @Override public T getObject(Object... args) { return getObject(); }
            @Override public T getIfAvailable() { return value; }
            @Override public T getIfUnique() { return value; }
        };
    }

    private static ESQueryStudioElasticsearchProperties jdbcProps() {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        props.getConsole().setStore("jdbc");
        return props;
    }

    private static ESQueryStudioElasticsearchProperties jdbcPropsWithHostMerge() {
        ESQueryStudioElasticsearchProperties props = jdbcProps();
        props.getConsole().getAuth().setHostAuditMerge(true);
        return props;
    }

    private static ConsoleOpsAuditStore build(ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration cfg,
                                              ESQueryStudioElasticsearchProperties props,
                                              ConsoleAuditContributor contributor) {
        return cfg.consoleOpsAuditStore(null, props, provider(emptyDb()), provider(contributor),
                new org.springframework.core.env.StandardEnvironment());
    }

    /** 宿主记录桩：一条 ts=200 的 HOST_OP 记录。 */
    private static final ConsoleAuditContributor HOST_ONE = (u, a, size, from, since) -> Collections.singletonList(
            ConsoleOpsAuditEvent.builder()
                    .username("fs_ou_host").role("ADMIN").method("POST").uri("/api/broker/route")
                    .action("HOST_OP").httpStatus(200).timestamp(200L).ip("10.8.0.5")
                    .build());

    @Test
    public void 宿主注册贡献者且显式开启hostMerge_装配分支包上合并层_查询并入宿主记录且source_stamp为host() {
        ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration cfg = new ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration();
        ConsoleOpsAuditStore store = build(cfg, jdbcPropsWithHostMerge(), HOST_ONE);

        List<ConsoleOpsAuditEvent> out = store.search(null, null, 10, 0, null);
        assertEquals("jdbc 桩 0 条 + 宿主 1 条 = 合并 1 条", 1, out.size());
        assertEquals("fs_ou_host", out.get(0).getUsername());
        assertEquals("宿主记录 source 由合并层 stamp", "host", out.get(0).getSource());
        assertEquals("HOST_OP", out.get(0).getAction());
    }

    /** 裁决锚：宿主注册但未显式开启 host-audit-merge（默认关）→ 不包合并层，
     *  非本控制台请求（匿名登录族等 null 用户宿主记录）不进控制台审计视图。 */
    @Test
    public void 宿主注册但默认关hostMerge_装配分支不包合并层_宿主记录不进控制台审计() {
        ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration cfg = new ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration();
        ConsoleOpsAuditStore store = build(cfg, jdbcProps(), HOST_ONE);

        List<ConsoleOpsAuditEvent> out = store.search(null, null, 10, 0, null);
        assertTrue("默认关：宿主记录不并入控制台审计视图", out.isEmpty());
    }

    @Test
    public void 宿主未注册_装配分支不包合并层_查询仅控制台记录() {
        ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration cfg = new ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration();
        ConsoleOpsAuditStore store = build(cfg, jdbcProps(), null);

        List<ConsoleOpsAuditEvent> out = store.search(null, null, 10, 0, null);
        assertTrue("无贡献者时查询走裸 jdbc 档（0 条），不因缺贡献者报错", out.isEmpty());
    }
}
