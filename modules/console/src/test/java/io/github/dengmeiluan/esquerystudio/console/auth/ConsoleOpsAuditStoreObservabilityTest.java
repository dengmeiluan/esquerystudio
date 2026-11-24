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

package io.github.dengmeiluan.esquerystudio.console.auth;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.lang.reflect.Field;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 控制台操作审计双店（JDBC 档 / ES 档）<b>落审计失败的 WARN 观测留痕</b>。
 *
 * <p><b>缺口</b>：审计落库失败此前仅 {@code LOG.debug("落审计失败（忽略）")}——审计流水是
 * 合规留痕数据，落库失败即丢数，静默不可观测。 {@code MigrationHandle#addErrors}
 * 同形态收口：失败路径必须落服务端 WARN。但审计失败与 bulk 落账不同——宿主库/ES 不可用时
 * <b>每笔操作都会失败</b>，高频刷屏会淹没日志，故节流形态取「首条 WARN + 计数静默」：
 * 首次失败 WARN 留痕，此后仅内部累计不再打（{@code addErrors} 是 n&gt;0 才打且低频，此处
 * 是每请求可复现的高频路径，两形态各有适配，同一语言=失败可观测）。</p>
 *
 * <p>既有契约顺带锁：{@code record} 永不抛（审计永不反噬业务）、search 契约不动——
 * 本测试只加观测断言，不改任何返回/异常行为。</p>
 *
 * <p>形态同 {@code MigrationHandleErrorObservabilityTest}：ListAppender 直构造；异步落库
 * 用反射读 executor 的 completedTaskCount 轮询等完成（mockito 不在依赖内，直构造是本仓
 * 测试基线）。</p>
 *
 * @author aicoding
 */
public class ConsoleOpsAuditStoreObservabilityTest {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(JdbcConsoleOpsAuditStore.class)).addAppender(appender);
        ((Logger) LoggerFactory.getLogger(EsConsoleOpsAuditStore.class)).addAppender(appender);
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(JdbcConsoleOpsAuditStore.class)).detachAppender(appender);
        ((Logger) LoggerFactory.getLogger(EsConsoleOpsAuditStore.class)).detachAppender(appender);
    }

    /** JDBC 档：落库失败（宿主库不可达）首次必须落 WARN——丢审计流水不能只进 debug。 */
    @Test
    public void jdbcStoreFirstDropLeavesWarn() throws Exception {
        JdbcConsoleOpsAuditStore store = new JdbcConsoleOpsAuditStore(brokenDataSource());

        store.record(ev("u1", "用户一", "/api/x", "rebuild.start"));

        awaitTasks(store, 1);
        assertTrue("JDBC 档落审计失败必须落服务端 WARN（首次留痕），此前只有 debug",
                countDropWarn("[esquerystudio-audit-jdbc]") >= 1);
    }

    /** JDBC 档：首条 WARN 后计数静默——第二笔失败不追加 WARN（防宿主库宕机期间刷屏）。 */
    @Test
    public void jdbcStoreThrottleSilenceAfterFirstWarn() throws Exception {
        JdbcConsoleOpsAuditStore store = new JdbcConsoleOpsAuditStore(brokenDataSource());

        store.record(ev("u1", null, "/api/x", "rebuild.start"));
        store.record(ev("u2", null, "/api/y", "rebuild.cancel"));

        awaitTasks(store, 2);
        assertEquals("首条 WARN 后必须静默（两笔失败只允许一条 WARN，防高频刷屏）",
                1, countDropWarn("[esquerystudio-audit-jdbc]"));
    }

    /** ES 档：落库失败（client 不可用）首次必须落 WARN——与 JDBC 档同一观测口径。 */
    @Test
    public void esStoreFirstDropLeavesWarn() throws Exception {
        EsConsoleOpsAuditStore store = new EsConsoleOpsAuditStore(() -> null, "esquerystudio_ops_audit");

        store.record(ev("u1", null, "/api/x", "rebuild.start"));

        awaitTasks(store, 1);
        assertTrue("ES 档落审计失败必须落服务端 WARN（首次留痕），此前只有 debug",
                countDropWarn("[esquerystudio-audit]") >= 1);
    }

    /** ES 档：首条 WARN 后计数静默。 */
    @Test
    public void esStoreThrottleSilenceAfterFirstWarn() throws Exception {
        EsConsoleOpsAuditStore store = new EsConsoleOpsAuditStore(() -> null, "esquerystudio_ops_audit");

        store.record(ev("u1", null, "/api/x", "rebuild.start"));
        store.record(ev("u2", null, "/api/y", "rebuild.cancel"));

        awaitTasks(store, 2);
        assertEquals("首条 WARN 后必须静默（两笔失败只允许一条 WARN）",
                1, countDropWarn("[esquerystudio-audit]"));
    }

    /** 既有契约顺带锁：record 永不抛（审计不反噬业务），失败只进日志面。 */
    @Test
    public void recordNeverThrowsEvenWhenBackingStoreBroken() throws Exception {
        JdbcConsoleOpsAuditStore jdbc = new JdbcConsoleOpsAuditStore(brokenDataSource());
        EsConsoleOpsAuditStore es = new EsConsoleOpsAuditStore(() -> null, "esquerystudio_ops_audit");

        jdbc.record(ev("u1", null, "/api/x", "a"));
        es.record(ev("u1", null, "/api/x", "a"));
        /* 不抛即过；同时排空异步任务，避免迟到的 WARN 污染后续用例的 appender。 */
        awaitTasks(jdbc, 1);
        awaitTasks(es, 1);
    }

    /* ── 桩与工具 ── */

    /** 富事件构造（唯一写入口）。 */
    private static ConsoleOpsAuditEvent ev(String username, String displayName, String uri, String action) {
        return ConsoleOpsAuditEvent.builder()
                .username(username).displayName(displayName).role("ADMIN")
                .method("POST").uri(uri).action(action).httpStatus(200)
                .build();
    }

    /** 永远连不上的宿主库桩：getConnection 即抛 SQLException（审计任务必失败）。 */
    private static DataSource brokenDataSource() {
        return new DataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                throw new SQLException("宿主库不可达(桩)");
            }

            @Override
            public Connection getConnection(String username, String password) throws SQLException {
                throw new SQLException("宿主库不可达(桩)");
            }

            @Override
            public <T> T unwrap(Class<T> iface) throws SQLException {
                throw new SQLException("桩不支持");
            }

            @Override
            public boolean isWrapperFor(Class<?> iface) {
                return false;
            }

            @Override
            public PrintWriter getLogWriter() {
                return null;
            }

            @Override
            public void setLogWriter(PrintWriter out) {
            }

            @Override
            public void setLoginTimeout(int seconds) {
            }

            @Override
            public int getLoginTimeout() {
                return 0;
            }

            @Override
            public java.util.logging.Logger getParentLogger() throws SQLFeatureNotSupportedException {
                throw new SQLFeatureNotSupportedException("桩不支持");
            }
        };
    }

    /** 反射读私有 executor，轮询等 N 个异步审计任务全部跑完（ListAppender 事件在任务内同步入列）。 */
    private static void awaitTasks(Object store, int n) throws Exception {
        Field f = store.getClass().getDeclaredField("executor");
        f.setAccessible(true);
        ThreadPoolExecutor pool = (ThreadPoolExecutor) f.get(store);
        long deadline = System.currentTimeMillis() + 10_000;
        while (pool.getCompletedTaskCount() < n && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
        assertTrue("异步审计任务未在时限内跑完(委托任务计数=" + pool.getCompletedTaskCount() + ")",
                pool.getCompletedTaskCount() >= n);
    }

    private int countDropWarn(String marker) {
        AtomicInteger n = new AtomicInteger();
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains(marker)) {
                n.incrementAndGet();
            }
        }
        return n.get();
    }
}
