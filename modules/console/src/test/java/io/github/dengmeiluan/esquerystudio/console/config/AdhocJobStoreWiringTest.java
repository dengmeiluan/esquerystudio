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

import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocJobStore;
import io.github.dengmeiluan.esquerystudio.console.adhoc.EsAdhocJobStore;
import io.github.dengmeiluan.esquerystudio.console.adhoc.JdbcAdhocJobStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code AdhocJobStore} 三选一装配的接线证明（照审计 {@code consoleOpsAuditStore} 范式）。
 *
 * <p>断言的是「容器里注入的 store 是哪一种实现」与「显式配 jdbc 却缺 DataSource 时上下文响亮失败」，
 * 不触真 ES/DB —— {@code JdbcAdhocJobStore}/{@code EsAdhocJobStore} 构造均为懒解析，不在装配期连接。</p>
 *
 * <p>三选一 Bean 落在 {@code ConsoleModeConfiguration}（{@code havingValue="console"}），
 * 故每个场景都必须带 {@code esquerystudio.elasticsearch.mode=console}，否则整块不装、拿不到任何 store。</p>
 */
public class AdhocJobStoreWiringTest {

    private ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class))
                .withPropertyValues("esquerystudio.elasticsearch.mode=console");
    }

    /** 场景①：store=jdbc + 宿主提供 DataSource → 注入 JdbcAdhocJobStore。 */
    @Test
    public void jdbcStoreWithDataSourceWiresJdbcAdhocJobStore() {
        runner()
                .withUserConfiguration(HostDataSourceConfiguration.class)
                .withPropertyValues("esquerystudio.elasticsearch.console.store=jdbc")
                .run(ctx -> {
                    assertThat(ctx.getStartupFailure())
                            .as("有 DataSource 时 store=jdbc 必须启动成功").isNull();
                    assertThat(ctx.getBean(AdhocJobStore.class))
                            .as("store=jdbc + 有 DataSource → 必须是 JdbcAdhocJobStore")
                            .isInstanceOf(JdbcAdhocJobStore.class);
                });
    }

    /** 场景②：不设 store（默认 control-es）→ 注入 EsAdhocJobStore。 */
    @Test
    public void defaultStoreWiresEsAdhocJobStore() {
        runner().run(ctx -> {
            assertThat(ctx.getStartupFailure())
                    .as("默认 store 必须启动成功").isNull();
            assertThat(ctx.getBean(AdhocJobStore.class))
                    .as("不设 store（默认 control-es）→ 必须是 EsAdhocJobStore")
                    .isInstanceOf(EsAdhocJobStore.class);
        });
    }

    /**
     * 场景③：store=jdbc 但无 DataSource → 上下文启动失败，根因是 IllegalStateException 并点名开关。
     *
     * <p><b>判别力隔离</b>：{@code esquerystudio.elasticsearch.console.store} 开关被三个 Bean 共读，
     * jdbc 无 DataSource 时都会抛同款异常。若不隔离，本条会靠别的 Bean 变绿，
     * 变异步骤（删掉 {@code adhocJobStore} 的抛异常）便无法察觉。故：
     * <ul>
     *   <li>{@code console.auth.enabled=false} —— 让审计 {@code consoleOpsAuditStore} 缺席
     *       （作业持久化不受 auth 开关管辖）；</li>
     *   <li>宿主注入自定义 {@code ConnStore} —— {@code connStore} 带 {@code @ConditionalOnMissingBean}，
     *       宿主 Bean 让它让位，不再抢先抛。</li>
     * </ul>
     * 两者都关掉后，唯一还会因缺 DataSource 而抛的就只剩 {@code adhocJobStore}。</p>
     */
    @Test
    public void jdbcStoreWithoutDataSourceFailsFast() {
        runner()
                .withUserConfiguration(HostConnStoreConfiguration.class)
                .withPropertyValues("esquerystudio.elasticsearch.console.store=jdbc",
                        "esquerystudio.elasticsearch.console.auth.enabled=false")
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    Throwable root = org.springframework.core.NestedExceptionUtils
                            .getRootCause(ctx.getStartupFailure());
                    assertThat(root)
                            .as("显式配 jdbc 却无 DataSource 是配置错误，必须响亮失败（与审计契约一致）")
                            .isInstanceOf(IllegalStateException.class);
                    assertThat(root.getMessage())
                            .as("失败信息必须点名 esquerystudio.elasticsearch.console.store=jdbc，否则接入方不知道该配什么")
                            .contains("esquerystudio.elasticsearch.console.store=jdbc");
                });
    }

    /** 模拟宿主提供的嵌入式 H2 DataSource（构造不连库，仅供 store=jdbc 分支取用）。 */
    @Configuration(proxyBeanMethods = false)
    static class HostDataSourceConfiguration {

        @Bean
        public DataSource dataSource() {
            JdbcDataSource ds = new JdbcDataSource();
            ds.setURL("jdbc:h2:mem:adhoc_wiring_" + UUID.randomUUID().toString().replace("-", "")
                    + ";DB_CLOSE_DELAY=-1");
            ds.setUser("sa");
            ds.setPassword("");
            return ds;
        }
    }

    /**
     * 模拟宿主自注册 {@code ConnStore}（不触 store 开关，故不会因缺 DataSource 抢先抛），
     * 让 starter 的 {@code connStore} @Bean 因 {@code @ConditionalOnMissingBean} 让位。
     * 用于把场景③的判别力隔离到 {@code adhocJobStore} 上。空实现即可，本测试不调它。
     */
    @Configuration(proxyBeanMethods = false)
    static class HostConnStoreConfiguration {

        @Bean
        public ConnStore connStore() {
            return new ConnStore() {
                @Override
                public List<Map<String, Object>> list() {
                    return java.util.Collections.emptyList();
                }

                @Override
                public RemoteClusterConn get(String id) {
                    return null;
                }

                @Override
                public String getName(String id) {
                    return null;
                }

                @Override
                public String getVersion(String id) {
                    return null;
                }

                @Override
                public Map<String, Object> save(String id, String name, String url, String username,
                                                String password, String minRole, Integer connectTimeoutMs,
                                                Integer socketTimeoutMs, String env) {
                    return java.util.Collections.emptyMap();
                }

                @Override
                public void updateVersion(String id, String esVersion) {
                }

                @Override
                public void delete(String id) {
                }
            };
        }
    }
}
