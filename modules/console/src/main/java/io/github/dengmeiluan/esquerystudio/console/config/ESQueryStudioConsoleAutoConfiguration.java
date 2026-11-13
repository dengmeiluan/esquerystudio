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
import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildService;
import io.github.dengmeiluan.esquerystudio.console.adhoc.EsAdhocJobStore;
import io.github.dengmeiluan.esquerystudio.console.adhoc.InternalAdhocRebuildController;
import io.github.dengmeiluan.esquerystudio.console.adhoc.JdbcAdhocJobStore;
import io.github.dengmeiluan.esquerystudio.console.auth.BuiltinConsoleAuthService;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthController;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuditContributor;
import io.github.dengmeiluan.esquerystudio.console.auth.AuditIndexRetentionSweeper;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthDelegate;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog;
import io.github.dengmeiluan.esquerystudio.platform.integration.ConsoleHostIntegration;
import io.github.dengmeiluan.esquerystudio.console.ui.ConsoleUiConfigController;
import io.github.dengmeiluan.esquerystudio.platform.branding.ConsoleUiConfigService;
import io.github.dengmeiluan.esquerystudio.platform.branding.PlatformUiProperties;
import io.github.dengmeiluan.esquerystudio.console.auth.DelegatingConsoleAuthorizer;
import io.github.dengmeiluan.esquerystudio.console.auth.DedupConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.EsConsoleAuthorizer;
import io.github.dengmeiluan.esquerystudio.console.auth.HostAuditMergeStore;
import io.github.dengmeiluan.esquerystudio.console.auth.EsConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.JdbcConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.PropertiesAuthDelegate;
import io.github.dengmeiluan.esquerystudio.console.client.ConsoleAssetGuard;
import io.github.dengmeiluan.esquerystudio.console.client.DesiredStateController;
import io.github.dengmeiluan.esquerystudio.console.client.EsWriteRetryAspect;
import io.github.dengmeiluan.esquerystudio.console.client.EsWriteRetryTemplate;
import io.github.dengmeiluan.esquerystudio.console.client.StaleWriteBlockDetector;
import io.github.dengmeiluan.esquerystudio.console.control.BootstrapHomeStore;
import io.github.dengmeiluan.esquerystudio.console.control.ConsoleSetupController;
import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.control.ControlIndexInitializer;
import io.github.dengmeiluan.esquerystudio.console.control.EntityIndexNames;
import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexRebuildService;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.IndexNameResolver;
import io.github.dengmeiluan.esquerystudio.console.core.ManagedEsIndexScanner;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildLockGuard;
import io.github.dengmeiluan.esquerystudio.console.insight.InsightController;
import io.github.dengmeiluan.esquerystudio.console.insight.InsightService;
import io.github.dengmeiluan.esquerystudio.console.insight.action.ApplyIndexSettingsAction;
import io.github.dengmeiluan.esquerystudio.console.insight.action.ConfirmTokenService;
import io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedAction;
import io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionExecutor;
import io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionRegistry;
import io.github.dengmeiluan.esquerystudio.console.insight.analyzer.SettingsChangeAnalyzer;
import io.github.dengmeiluan.esquerystudio.console.lock.EsRebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.mcp.McpAccessService;
import io.github.dengmeiluan.esquerystudio.console.mcp.McpController;
import io.github.dengmeiluan.esquerystudio.console.mcp.McpKeyController;
import io.github.dengmeiluan.esquerystudio.console.mcp.McpKeyOwnerResolver;
import io.github.dengmeiluan.esquerystudio.console.mcp.JdbcMcpKeyStore;
import io.github.dengmeiluan.esquerystudio.console.mcp.McpKeyStore;
import io.github.dengmeiluan.esquerystudio.console.mcp.McpSecretCipher;
import io.github.dengmeiluan.esquerystudio.console.mcp.McpCallAuditStore;
import io.github.dengmeiluan.esquerystudio.console.mcp.EsMcpCallAuditStore;
import io.github.dengmeiluan.esquerystudio.console.mcp.JdbcMcpCallAuditStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ClusterConnContributor;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ClusterConnSyncEngine;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ClusterMetricsCollector;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnHealthProber;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClusterConnController;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.HostEsVersionProvider;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsTargetInterceptor;
import io.github.dengmeiluan.esquerystudio.console.multicluster.JdbcConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorAlertsController;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorHistoryController;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorHistoryStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorMetricsController;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorMetricsStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorSnapshotRecorder;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import io.github.dengmeiluan.esquerystudio.console.validate.ConfigLabService;
import io.github.dengmeiluan.esquerystudio.console.validate.ConfigValidationStartupRunner;
import io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigValidator;
import io.github.dengmeiluan.esquerystudio.console.validate.InternalConfigLabController;
import io.github.dengmeiluan.esquerystudio.console.web.CrossClusterMigrateController;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsErrorFallbackAdvice;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsMigrateExceptionAdvice;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsRebuildExceptionAdvice;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateBootstrapRunner;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RunningMigrations;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.data.elasticsearch.ElasticsearchDataAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.env.Environment;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * ES 零停机重建 starter 自动配置。
 *
 * <p>显式 {@code @Bean} 装配 starter 全部组件（不用 {@code @ComponentScan}，边界清晰、可被条件精确控制）。
 * 接入方只需：① 引入本依赖；② 实现 {@link ManagedEsIndex} 并注册为 bean。
 *  阶段⑤起业务侧契约收窄为「声明受管索引」（只需 {@code entityClass()}），
 * 能力接口与 SPI 重建路径已整体退役。starter 切面会自动 cut {@code ElasticsearchOperations}
 * 写方法做写重试，业务无需任何注解。</p>
 *
 * <p>{@link IndexMetaRegistry} 通过 {@code List<ManagedEsIndex>} 跨模块集合注入宿主的全部 provider；
 * 无 provider 时注入空列表、注册表为空，不影响启动。锁存储/Admin/编排件均带 {@code @ConditionalOnMissingBean}，
 * 便于接入方自定义替换。</p>
 *
 * @author aicoding
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnClass({ElasticsearchOperations.class, RestHighLevelClient.class})
@EnableConfigurationProperties({ESQueryStudioElasticsearchProperties.class, PlatformUiProperties.class})
@AutoConfigureAfter(ElasticsearchDataAutoConfiguration.class)
public class ESQueryStudioConsoleAutoConfiguration {

    private static final org.slf4j.Logger STARTUP_LOG =
            org.slf4j.LoggerFactory.getLogger(ESQueryStudioConsoleAutoConfiguration.class);

    /**
     * 启动期鉴权暴露面告警：不挂在任何条件 Bean 下——鉴权关闭是最危险形态，
     * 告警链路本身不得随条件 Bean 一起消失（此前告警挂在依赖审计 Bean 的装配链里，永不发声）。
     * 监听面仅回环时降为 WARN，其余（含未配置=绑全部网卡）升格 ERROR。
     */
    @Bean
    static org.springframework.beans.factory.SmartInitializingSingleton consoleAuthDisabledNotice(
            ESQueryStudioElasticsearchProperties properties, org.springframework.core.env.Environment environment) {
        return () -> {
            if (!properties.getConsole().getAuth().isEnabled()) {
                String addr = environment.getProperty("server.address", "");
                boolean loopbackOnly = "127.0.0.1".equals(addr) || "localhost".equals(addr) || "::1".equals(addr);
                String msg = "控制台鉴权已关闭（esquerystudio.elasticsearch.console.auth.enabled=false）："
                        + "任何可达客户端均可匿名执行控制台读写，仅限隔离网络临时排障；当前监听地址="
                        + (addr.isEmpty() ? "未配置（默认绑定全部网卡）" : addr);
                if (loopbackOnly) {
                    STARTUP_LOG.warn(msg);
                } else {
                    STARTUP_LOG.error(msg);
                }
            }
        };
    }

    /**
     * 宿主 ES 栈版本契约的启动期诊断。
     *
     * <p><b>两种模式都装、不加 mode 条件</b>：4 个签名断裂点里有两个落在
     * {@link io.github.dengmeiluan.esquerystudio.console.client.EntityFieldScanner}，那是 client 模式
     * desired-state 的必经之路 —— 只在 console 装等于让最需要这条诊断的一方拿不到它。</p>
     *
     * <p>带 {@code @ConditionalOnMissingBean}：本 Bean 是<i>诊断件</i>（只读探测 + 打日志、
     * 无副作用），宿主想换成自己的诊断是正当需求。这与 {@code consoleAssetGuard} 那类
     * <i>安全守卫</i>不同 —— 守卫不带该注解，是为了不给「静默解除」留第二条路径。</p>
     */
    @Bean
    @ConditionalOnMissingBean
    public EsStackContractValidator esStackContractValidator() {
        return new EsStackContractValidator();
    }

    @Bean
    @ConditionalOnMissingBean
    public EntityIndexNames entityIndexNames(ObjectProvider<ElasticsearchOperations> hostOpsProvider,
                                             ApplicationContext applicationContext) {
        // 索引名解析去宿主 ops 化——零 ES 依赖宿主的地基（有 ops 则行为与历史完全一致）
        return new EntityIndexNames(hostOpsProvider, applicationContext);
    }

    @Bean
    @ConditionalOnMissingBean
    public EntityMappingDeriver entityMappingDeriver(ApplicationContext applicationContext) {
        // 离线注解推导 mapping：只用裸 SimpleElasticsearchMappingContext，不要 ops
        // —— 与 EntityIndexNames 同一条路径，守住「宿主零 ES 依赖」。
        return new EntityMappingDeriver(applicationContext);
    }

    @Bean
    @ConditionalOnMissingBean
    public IndexMetaRegistry indexMetaRegistry(EntityIndexNames entityIndexNames,
                                               List<ManagedEsIndex> legacyProviders,
                                               BeanFactory beanFactory) {
        // 受管索引自动发现：扫宿主基础包里全部 @Document 实体。
        // legacyProviders 只用来检测残留手写 provider（通道已废，非空即报错）。
        // 汇总在 registry 构造前完成，故 IndexMetaRegistry 本身一行不改。
        return new IndexMetaRegistry(entityIndexNames,
                ManagedEsIndexScanner.discover(legacyProviders, beanFactory));
    }

    /**
     * client 模式挡掉控制台静态资源。条件用 havingValue="client" + matchIfMissing=true
     * ——「不配 mode」与「配 client」都要装，与 ConsoleModeConfiguration 恰好互补。
     *
     * <p><b>此处不加 {@code @ConditionalOnMissingBean}，是遵循本类既有惯例而非孤例</b>：
     * 本类 55 个 {@code @Bean} 中 52 个带该注解，它们是<i>能力 Bean</i>，使用方替换实现是正当需求；
     * 不带的 3 个恰好全是 {@code WebMvcConfigurer}——本 Bean 与 {@code esTargetWebMvcConfigurer}、
     * {@code esConsoleAuthWebMvcConfigurer} 一致。<b>不要「补上」这个注解</b>。</p>
     *
     * <p>原因：守卫是<i>安全机制</i>，性质与能力 Bean 不同。宿主若想挡更多，直接再注册一个自己的
     * {@link org.springframework.web.servlet.config.annotation.WebMvcConfigurer} 即可
     * （Spring 会把所有 configurer 的 addResourceHandlers 都执行掉），不需要替换本 Bean；
     * 若想关掉守卫，正当且显式的开关是 {@code esquerystudio.elasticsearch.mode=console}。
     * 加上 {@code @ConditionalOnMissingBean} 的唯一实际效果，是让业务方用一个空实现<b>静默</b>解除守卫
     * —— 一个开关就够了，不要第二条隐蔽路径。
     * {@code ClientModeWiringTest#hostCannotSilentlyReplaceConsoleAssetGuard} 常驻看守这一点。</p>
     */
    @Bean
    @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "mode", havingValue = "client", matchIfMissing = true)
    public ConsoleAssetGuard consoleAssetGuard() {
        return new ConsoleAssetGuard();
    }

    /**
     * 期望配置端点与自包含单页。<b>必须留在外层</b>（不进 {@code ConsoleModeConfiguration}）——
     * 它正是给 client 模式的业务应用用的，装到 console 块里会让业务侧根本没有这个页面，
     * 本波「业务侧只声明、靠人复制 payload 到 宿主」的接线就断了。
     *
     * <p>两种模式都装：宿主 自己没有声明索引（{@code listMetas()} 返空、页面显示空态），
     * 端点存在无害且便于自检。</p>
     *
     * <p><b>无鉴权</b>：依赖内网隔离，页面显著位置印有该约束。此处刻意不引入任何鉴权
     * Bean/拦截器/配置项 —— 那会增加 client 模式的重量，违反本波的目的。
     * web-enabled=false 时与其它运维 Controller 同步关闭——该开关承诺「关闭内置
     * 运维端点」，无鉴权端点更不能在关闭后残挂。</p>
     */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
    public DesiredStateController desiredStateController(IndexMetaRegistry indexMetaRegistry,
                                                        EntityMappingDeriver entityMappingDeriver) {
        // payload 要带上「重建实际会用的」注解推导 mapping，宿主 无法自己推导
        return new DesiredStateController(indexMetaRegistry, entityMappingDeriver);
    }

    /**
     *  .5（台账 #65）：启动期发现「写别名当前指向的物理索引被挡写」。
     *
     * <p><b>两种模式都装</b>。判据是「本进程声明的索引，其写别名指向的物理索引是否被挡写」——
     * 这件事该不该告警，取决于<b>本进程是不是这些索引的写入方</b>，而不取决于它跑在哪个模式。
     * console 模式下 宿主 自己通常没有 {@link ManagedEsIndex} provider，
     * {@code listMetas()} 返空、扫描遍历空清单、零开销；但它<b>一旦声明了索引就是写入方</b>，
     * 同样会被挡写打中。装在外层意味着这条诊断不会因为将来某次「宿主 也声明一个索引」
     * 而<b>静默失效</b>；只装 client 模式则留下一个依赖未来改动才暴露的缺口。</p>
     *
     * <p>宿主无 {@link RestHighLevelClient}（ 零 ES 依赖宿主）时传 null，
     * 扫描直接跳过并记一行 info——诊断功能绝不许变成启动阻塞点。</p>
     */
    @Bean
    @ConditionalOnMissingBean
    public StaleWriteBlockDetector staleWriteBlockDetector(IndexMetaRegistry indexMetaRegistry,
                                                           ObjectProvider<RestHighLevelClient> restHighLevelClientProvider) {
        return StaleWriteBlockDetector.from(indexMetaRegistry, restHighLevelClientProvider.getIfAvailable());
    }

    /**
     *  #70（台账）：ES 写重试模板 —— <b>两种模式都装</b>。
     *
     * <p>它服务的是 {@link EsWriteRetryAspect}，而后者拦的是<b>业务应用自己</b>的 ES 写入。
     * 此前两者都在 {@code ConsoleModeConfiguration} 里，于是 client 模式（业务应用，默认模式）
     * 完全不装 —— 每次 WRITE_BLOCK 重建，业务写入硬失败而非被重试救回，
     * 而 {@code ManagedEsIndex} 的 javadoc 却把「挡写 + 业务自身重试」当作安全保证的两半。</p>
     */
    @Bean
    @ConditionalOnMissingBean
    public EsWriteRetryTemplate esWriteRetryTemplate(ESQueryStudioElasticsearchProperties properties) {
        return new EsWriteRetryTemplate(properties.getRetry());
    }

    /**
     *  #70（台账）：ES 写重试切面 —— <b>两种模式都装</b>。
     *
     * <p>client 模式装它是本 Task 的目的；console 模式同样装，理由与
     * {@link #staleWriteBlockDetector} 一致：宿主 <b>一旦声明索引就同样是写入方</b>。
     * 装在外层意味着这层保护不会因为将来某次改动而静默失效。</p>
     *
     * <p><b>不再依赖 {@code RebuildAuditStore}</b>：原实现要求「重建窗口开着」才重试，
     * 而业务侧既没有该 Bean、 之后也不该知道重建这件事。可否重试完全由
     * {@link EsWriteRetryTemplate} 的异常识别决定（cluster_block / 429 / 网络抖动可重试，
     * 其余立即抛出）。详见 {@link EsWriteRetryAspect} 类注释。</p>
     */
    @Bean
    @ConditionalOnMissingBean
    public EsWriteRetryAspect esWriteRetryAspect(EsWriteRetryTemplate esWriteRetryTemplate) {
        // 内层切面 Order(1)：纯按异常特征重试，无状态、无外部依赖
        return new EsWriteRetryAspect(esWriteRetryTemplate);
    }

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "mode", havingValue = "client", matchIfMissing = true)
    static class ClientMappingReconcileConfiguration {

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.mapping", name = "auto-register",
                havingValue = "startup", matchIfMissing = true)
        public MappingReconcileBootstrapRunner mappingReconcileBootstrapRunner(
                ListableBeanFactory beanFactory,
                IndexMetaRegistry indexMetaRegistry,
                EntityMappingDeriver entityMappingDeriver,
                ESQueryStudioElasticsearchProperties properties) {
            return new MappingReconcileBootstrapRunner(
                    beanFactory, indexMetaRegistry, entityMappingDeriver, properties);
        }
    }

    // ----------------------------------------------------------------------------------------------
    //  装配分层：控制面（控制台 + 重建引擎 + 审计 + 迁移 + 鉴权）只在 console 模式装。
    // 一个 @ConditionalOnProperty 守整块，语义集中在此一处——后续新增 Bean 只要写在本类里
    // 就自动继承约束，不会出现「新增 Bean 忘记翻默认」的长期漏洞。
    // 既有细粒度开关（web-enabled / migrate.enabled / console.auth.enabled /
    // console.conn-probe-enabled / console.store）语义与默认值一律不变，继续在本类内生效。
    // ----------------------------------------------------------------------------------------------
    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "mode", havingValue = "console")
    static class ConsoleModeConfiguration {

        private static final Logger logger = LoggerFactory.getLogger(ConsoleModeConfiguration.class);

        /**
         * 控制台静态资源缓存头：assets（内容 hash）immutable 长缓存，html 入口 no-cache。
         * 与 client 模式的 {@code ConsoleAssetGuard} 互斥（guard 让资源 404，本类只在资源真被服务时生效）。
         * 允许宿主以同名类型 Bean 覆盖自定义策略（与 guard 不同——缓存是性能策略，不是安全边界）。
         */
        @Bean
        @ConditionalOnMissingBean
        public io.github.dengmeiluan.esquerystudio.console.web.ConsoleCacheConfigurer consoleCacheConfigurer() {
            return new io.github.dengmeiluan.esquerystudio.console.web.ConsoleCacheConfigurer();
        }

        // ----------------------------------------------------------------------------------------------
        //  控制集群自举：控制面（用户/连接档案/审计/作业/锁）从硬依赖宿主 spring ES 泛化为控制集群——
        // 自举档案 > 探测 spring ES > NONE（前端首连向导）；存储件一律经 Supplier 懒解析。
        // ----------------------------------------------------------------------------------------------

        @Bean
        @ConditionalOnMissingBean
        public BootstrapHomeStore bootstrapHomeStore(ESQueryStudioElasticsearchProperties properties, Environment environment) {
            return new BootstrapHomeStore(properties.getConsole().getHomeDir(),
                    environment.getProperty("spring.application.name"));
        }

        @Bean
        @ConditionalOnMissingBean
        public ControlIndexInitializer controlIndexInitializer(ESQueryStudioElasticsearchProperties properties) {
            return new ControlIndexInitializer(properties);
        }

        @Bean
        @ConditionalOnMissingBean
        public ControlClusterResolver controlClusterResolver(ObjectProvider<RestHighLevelClient> restHighLevelClientProvider,
                                                             ObjectProvider<ElasticsearchOperations> elasticsearchOperationsProvider,
                                                             BootstrapHomeStore bootstrapHomeStore,
                                                             ControlIndexInitializer controlIndexInitializer,
                                                             ESQueryStudioElasticsearchProperties properties) {
            RemoteEsClientFactory factory = new RemoteEsClientFactory(
                    properties.getMigrate().getConnectTimeoutMs(), properties.getMigrate().getSocketTimeoutMs());
            // 宿主 ES 改可选依赖（零 ES 依赖宿主传 null，resolver 内部已全链路 null 短路）
            ControlClusterResolver resolver = new ControlClusterResolver(
                    restHighLevelClientProvider.getIfAvailable(), elasticsearchOperationsProvider.getIfAvailable(),
                    bootstrapHomeStore, factory, controlIndexInitializer, properties.getConsole().getControlMode());
            resolver.init();
            return resolver;
        }

        @Bean
        @ConditionalOnMissingBean
        public EsRebuildBootstrapRunner esRebuildBootstrapRunner(
                ObjectProvider<RebuildLockStore> lockStoreProvider) {
            // M6 启动 IO 异步化：bean 装配不做 ES IO，ApplicationReadyEvent 后异步建三个 starter 索引
            return new EsRebuildBootstrapRunner(lockStoreProvider);
        }

        @Bean
        @ConditionalOnMissingBean
        public EsIndexAdmin esIndexAdmin(ObjectProvider<RestHighLevelClient> restHighLevelClientProvider,
                                         EsClientRouter esClientRouter,
                                         ESQueryStudioElasticsearchProperties properties) {
            // 宿主 client 可选（null 时数据面恒走 router，router 无目标头时兜底到控制集群）
            EsIndexAdmin admin = new EsIndexAdmin(restHighLevelClientProvider.getIfAvailable());
            // 注入多集群路由——数据面（/cluster/**）跟随 X-Es-Target 目标，控制面恒定宿主
            admin.setClientRouter(esClientRouter);
            // 数据面通用端点不得触达控制面索引（默认 esquerystudio_* 前缀 + 宿主自定义实名）
            admin.setExtraControlIndexNames(java.util.Arrays.asList(
                    properties.getConsole().getAuth().getUserIndexName(),
                    properties.getConsole().getAuth().getOpsAuditIndexName(),
                    properties.getConsole().getMcpKeyIndexName(),
                    properties.getConsole().getConnIndexName(),
                    properties.getConsole().getMonitor().getIndexName(),
                    properties.getLock().getIndexName(),
                    properties.getMigrate().getJobIndexName()));
            return admin;
        }

        /**
         * MCP 接入端点。必须显式 {@code @Bean}：starter 不组件扫描，类上的
         * {@code @RestController} 在宿主/独立部署里都是死注解，漏装配的表现是 {@code /mcp} 404。
         * 双重开关：{@code web-enabled} 保持「关闭 Web 面」的承诺，{@code mcp.enabled}
         * 才是显式对外暴露；token 缺失时端点自身返回 503（fail-closed）。
         */
        @Bean
        @ConditionalOnMissingBean
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression(
                "${esquerystudio.mcp.enabled:false} && ${esquerystudio.elasticsearch.web-enabled:true}")
        public McpKeyStore mcpKeyStore(ControlClusterResolver controlClusterResolver,
                                       ESQueryStudioElasticsearchProperties properties,
                                       ObjectProvider<DataSource> dataSourceProvider,
                                       McpSecretCipher mcpSecretCipher) {
            if ("jdbc".equalsIgnoreCase(properties.getConsole().getStore())) {
                DataSource dataSource = dataSourceProvider.getIfAvailable();
                if (dataSource == null) {
                    throw new IllegalStateException("esquerystudio.mcp.enabled=true 且 console.store=jdbc，"
                            + "但宿主未提供 DataSource Bean；请配置 spring.datasource.* 或改回 store=control-es");
                }
                return new JdbcMcpKeyStore(dataSource, mcpSecretCipher);
            }
            return new io.github.dengmeiluan.esquerystudio.console.mcp.EsMcpKeyStore(
                    controlClusterResolver::client, properties.getConsole().getMcpKeyIndexName(), mcpSecretCipher);
        }

        /** 完整 key 落盘加密主密钥：配置 key > mcp token > 本地密钥文件。 */
        @Bean
        @ConditionalOnMissingBean
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression(
                "${esquerystudio.mcp.enabled:false} && ${esquerystudio.elasticsearch.web-enabled:true}")
        public McpSecretCipher mcpSecretCipher(
                @org.springframework.beans.factory.annotation.Value("${esquerystudio.mcp.key-encryption-key:}") String configuredKey,
                @org.springframework.beans.factory.annotation.Value("${esquerystudio.mcp.token:}") String token) {
            String material = configuredKey == null ? "" : configuredKey.trim();
            if (material.isEmpty()) material = token == null ? "" : token.trim();
            return new McpSecretCipher(material);
        }

        @Bean
        @ConditionalOnMissingBean
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression(
                "${esquerystudio.mcp.enabled:false} && ${esquerystudio.elasticsearch.web-enabled:true}")
        public McpAccessService mcpAccessService(McpKeyStore mcpKeyStore,
                                                 McpCallAuditStore mcpCallAuditStore,
                                                 @org.springframework.beans.factory.annotation.Value(
                                                         "${esquerystudio.mcp.audit-retention-days:30}") int auditRetentionDays) {
            return new McpAccessService(mcpKeyStore, mcpCallAuditStore, auditRetentionDays);
        }

        /** MCP 调用审计持久化：与 key 存储同档（控制 ES / 宿主数据库），默认保留 30 天（最低 7 天）。 */
        @Bean
        @ConditionalOnMissingBean
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression(
                "${esquerystudio.mcp.enabled:false} && ${esquerystudio.elasticsearch.web-enabled:true}")
        public McpCallAuditStore mcpCallAuditStore(ControlClusterResolver controlClusterResolver,
                                                    ESQueryStudioElasticsearchProperties properties,
                                                    ObjectProvider<DataSource> dataSourceProvider,
                                                    @org.springframework.beans.factory.annotation.Value(
                                                            "${esquerystudio.mcp.audit-retention-days:30}") int retentionDays) {
            int days = Math.max(7, retentionDays);
            if ("jdbc".equalsIgnoreCase(properties.getConsole().getStore())) {
                DataSource dataSource = dataSourceProvider.getIfAvailable();
                if (dataSource == null) {
                    throw new IllegalStateException("esquerystudio.mcp.enabled=true 且 console.store=jdbc，"
                            + "但宿主未提供 DataSource Bean；无法创建 MCP 调用审计表");
                }
                return new JdbcMcpCallAuditStore(dataSource, days);
            }
            String auditIndex = properties.getConsole().getMcpKeyIndexName() + "_audit";
            return new EsMcpCallAuditStore(controlClusterResolver::client, auditIndex, days);
        }

        @Bean
        @ConditionalOnMissingBean
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression(
                "${esquerystudio.mcp.enabled:false} && ${esquerystudio.elasticsearch.web-enabled:true}")
        public McpController mcpController(EsIndexAdmin esIndexAdmin, McpAccessService mcpAccessService,
                                           EsClientRouter esClientRouter, ConnStore connStore,
                                           ESQueryStudioElasticsearchProperties properties,
                                           @org.springframework.beans.factory.annotation.Value(
                                                   "${esquerystudio.mcp.token:}") String token) {
            McpController controller = new McpController(esIndexAdmin, token, mcpAccessService,
                    esClientRouter, connStore);
            controller.setHostClusterVisible(properties.getConsole().isHostClusterVisible());
            return controller;
        }

        @Bean
        @ConditionalOnMissingBean
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression(
                "${esquerystudio.mcp.enabled:false} && ${esquerystudio.elasticsearch.web-enabled:true}")
        public McpKeyController mcpKeyController(McpKeyStore mcpKeyStore, ConnStore connStore,
                                                 ESQueryStudioElasticsearchProperties properties,
                                                 ObjectProvider<BuiltinConsoleAuthService> authProvider,
                                                 ObjectProvider<McpKeyOwnerResolver> ownerResolverProvider,
                                                 McpSecretCipher mcpSecretCipher,
                                                 McpCallAuditStore mcpCallAuditStore,
                                                 McpAccessService mcpAccessService) {
            McpKeyOwnerResolver hostOwnerResolver = ownerResolverProvider.getIfAvailable();
            McpKeyController controller = new McpKeyController(mcpKeyStore, connStore, new McpKeyOwnerResolver() {
                /* 宿主提供角色解析时优先使用；解析失败/未收录再回落内置用户目录。 */
                @Override
                public String roleOf(String username) {
                    if (hostOwnerResolver != null) {
                        try {
                            String role = hostOwnerResolver.roleOf(username);
                            if (role != null && !role.trim().isEmpty()) return role;
                        } catch (RuntimeException e) {
                            /* 宿主解析异常不视为可写，继续走内置目录或返回 null（调用方 fail-closed）。 */
                        }
                    }
                    BuiltinConsoleAuthService auth = authProvider.getIfAvailable();
                    if (auth == null) return null;
                    try {
                        for (Map<String, Object> user : auth.listUsers()) {
                            if (username.equals(String.valueOf(user.get("username")))) {
                                Object role = user.get("role");
                                return role == null ? null : String.valueOf(role);
                            }
                        }
                    } catch (Exception e) {
                        /* 用户目录不可用时保持 ADMIN 代签行为，不因解析失败误拒。 */
                    }
                    return null;
                }

                /* 页面授权只认宿主解析：内置用户目录没有菜单授权概念，不能凭空造页面键。 */
                @Override
                public java.util.Set<String> pagesOf(String username) {
                    if (hostOwnerResolver == null) return null;
                    try {
                        return hostOwnerResolver.pagesOf(username);
                    } catch (RuntimeException e) {
                        return null;
                    }
                }
            }, mcpSecretCipher, mcpCallAuditStore, mcpAccessService);
            controller.setHostClusterVisible(properties.getConsole().isHostClusterVisible());
            return controller;
        }

        // ----------------------------------------------------------------------------------------------
        //  多集群：自定义连接串成为一等公民数据源——连接档案存宿主集群（密码不出服务端），
        // EsClientRouter 按 X-Es-Target 头把数据面操作路由到目标集群；控制面（鉴权/审计/作业/锁）永远宿主。
        //  平台化：档案存储抽 SPI（ConnStore），默认控制集群 ES；esquerystudio.elasticsearch.console.store=jdbc
        // 切宿主数据库表；宿主自注册 ConnStore Bean 则完全接管（@ConditionalOnMissingBean 让位）。
        // ----------------------------------------------------------------------------------------------

        @Bean
        @ConditionalOnMissingBean
        public ConnStore connStore(ControlClusterResolver controlClusterResolver, ESQueryStudioElasticsearchProperties properties,
                                   ObjectProvider<DataSource> dataSourceProvider,
                                   org.springframework.context.ApplicationEventPublisher eventPublisher,
                                   @org.springframework.beans.factory.annotation.Value(
                                           "${spring.application.name:default}") String appName) {
            if ("jdbc".equalsIgnoreCase(properties.getConsole().getStore())) {
                DataSource ds = dataSourceProvider.getIfAvailable();
                if (ds == null) {
                    throw new IllegalStateException("esquerystudio.elasticsearch.console.store=jdbc 但宿主未提供 DataSource Bean；"
                            + "请配置 spring.datasource.* 或改回 store=control-es");
                }
                return new JdbcConnStore(ds, eventPublisher, connCrypto(properties, appName));
            }
            return new EsConnStore(controlClusterResolver::client, properties.getConsole().getConnIndexName(),
                    eventPublisher, connCrypto(properties, appName));
        }

        /** 连接档案凭据加密器：显式配置优先；未配置时密钥自动生成并落自举档案目录
         *  （与 SQLite 库/自举档案同目录，单实例零配置；多实例显式共享 conn-secret）。 */
        private io.github.dengmeiluan.esquerystudio.console.multicluster.ConnCrypto connCrypto(
                ESQueryStudioElasticsearchProperties properties, String appName) {
            String configured = properties.getConsole().getAuth().getConnSecret();
            java.nio.file.Path dir;
            String configuredDir = properties.getConsole().getHomeDir();
            if (configuredDir != null && !configuredDir.trim().isEmpty()) {
                dir = java.nio.file.Paths.get(configuredDir.trim());
            } else {
                dir = java.nio.file.Paths.get(System.getProperty("user.home"), ".esquerystudio",
                        appName == null ? "default" : appName);
            }
            return io.github.dengmeiluan.esquerystudio.console.multicluster.ConnCrypto.resolve(configured, dir);
        }

        /**
         * -67 宿主集群版本探测器：宿主没有连接档案，版本只能主动探（{@code GET /} 的 version.number）。
         * 探不到保持「未知」（null），<b>不回退成 7.x</b>——见 {@link HostEsVersionProvider} 的设计说明。
         */
        @Bean
        @ConditionalOnMissingBean
        public HostEsVersionProvider hostEsVersionProvider(ControlClusterResolver controlClusterResolver) {
            return new HostEsVersionProvider(controlClusterResolver::client);
        }

        @Bean
        @ConditionalOnMissingBean
        public EsClientRouter esClientRouter(ControlClusterResolver controlClusterResolver, ConnStore connStore,
                                             ESQueryStudioElasticsearchProperties properties,
                                             HostEsVersionProvider hostEsVersionProvider) {
            // 自建 factory（不依赖 migrate 条件 bean）：超时参数复用 migrate 配置，零新增配置项
            RemoteEsClientFactory factory = new RemoteEsClientFactory(
                    properties.getMigrate().getConnectTimeoutMs(), properties.getMigrate().getSocketTimeoutMs());
            EsClientRouter router = new EsClientRouter(controlClusterResolver::client, connStore, factory);
            // -67：把宿主版本接进同一套版本感知机制——这一行让 createIndexLegacy6 等
            // 6 个「已版本感知、只是拿不到版本」的分叉点对宿主同时可达
            router.setHostVersionProvider(hostEsVersionProvider);
            return router;
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console", name = "conn-probe-enabled", matchIfMissing = true)
        public ConnHealthProber connHealthProber(ConnStore connStore, EsClientRouter esClientRouter,
                                                 ESQueryStudioElasticsearchProperties properties) {
            //  连接健康探针：周期并发 ping 全部已存档案，列表/顶栏状态点数据源
            ConnHealthProber prober = new ConnHealthProber(connStore, esClientRouter,
                    properties.getConsole().getConnProbeIntervalSeconds());
            prober.start();
            return prober;
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public EsClusterConnController esClusterConnController(ConnStore connStore, EsClientRouter esClientRouter,
                                                               ESQueryStudioElasticsearchProperties properties,
                                                               ObjectProvider<ConnHealthProber> proberProvider,
                                                               ObjectProvider<ClusterConnSyncEngine> syncEngineProvider) {
            RemoteEsClientFactory factory = new RemoteEsClientFactory(
                    properties.getMigrate().getConnectTimeoutMs(), properties.getMigrate().getSocketTimeoutMs());
            return new EsClusterConnController(connStore, esClientRouter, factory, proberProvider.getIfAvailable(),
                    syncEngineProvider.getIfAvailable());
        }

        /** 监控历史读侧(20260922 批④):只读查询服务端定时任务落库的连接探活快照日期索引族。 */
        @Bean
        @ConditionalOnMissingBean
        public MonitorHistoryStore monitorHistoryStore(ControlClusterResolver controlClusterResolver,
                                                       ESQueryStudioElasticsearchProperties properties) {
            return new MonitorHistoryStore(controlClusterResolver::client,
                    properties.getConsole().getMonitor().getIndexName());
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public MonitorHistoryController monitorHistoryController(MonitorHistoryStore monitorHistoryStore,
                                                                 ConnStore connStore) {
            return new MonitorHistoryController(monitorHistoryStore, connStore);
        }

        /** 指标读侧(指标时序批):只读查询 kind=metrics 的 cluster/node 指标 doc(timestamp 升序供图表)。 */
        @Bean
        @ConditionalOnMissingBean
        public MonitorMetricsStore monitorMetricsStore(ControlClusterResolver controlClusterResolver,
                                                       ESQueryStudioElasticsearchProperties properties) {
            return new MonitorMetricsStore(controlClusterResolver::client,
                    properties.getConsole().getMonitor().getIndexName());
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public MonitorMetricsController monitorMetricsController(MonitorMetricsStore monitorMetricsStore,
                                                                 ConnStore connStore) {
            return new MonitorMetricsController(monitorMetricsStore, connStore);
        }

        /**  审计下拉值建议(只读 terms agg):动作/集群真实出现值+计数,VIEWER 可用,失败回空建议。
         *  store 内联构造(无独立 Bean)——部分装配测试上下文无需额外依赖链。 */
        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public io.github.dengmeiluan.esquerystudio.console.auth.AuditFacetsController auditFacetsController(
                ControlClusterResolver controlClusterResolver, ESQueryStudioElasticsearchProperties properties) {
            ESQueryStudioElasticsearchProperties.Auth auth = properties.getConsole().getAuth();
            return new io.github.dengmeiluan.esquerystudio.console.auth.AuditFacetsController(
                    new io.github.dengmeiluan.esquerystudio.console.auth.AuditFacetsStore(controlClusterResolver::client,
                            auth.getOpsAuditIndexName()));
        }

        /** R7 告警端点(只读):查同族 kind=alert 的告警/恢复 doc(复用 MonitorMetricsStore,倒序供面板)。 */
        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public MonitorAlertsController monitorAlertsController(MonitorMetricsStore monitorMetricsStore,
                                                               ConnStore connStore) {
            return new MonitorAlertsController(monitorMetricsStore, connStore);
        }

        /** R6 环形治理用量端点(只读):审计+监控两族合计与分族占用/总量上限,VIEWER 可见。 */
        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public io.github.dengmeiluan.esquerystudio.console.multicluster.RingUsageController ringUsageController(
                MonitorMetricsStore monitorMetricsStore, ESQueryStudioElasticsearchProperties properties) {
            ESQueryStudioElasticsearchProperties.Auth auth = properties.getConsole().getAuth();
            return new io.github.dengmeiluan.esquerystudio.console.multicluster.RingUsageController(monitorMetricsStore,
                    auth.getOpsAuditIndexName(), auth.getAuditRetention().getMaxTotalBytes());
        }

        /**
         * 连接中心自动同步引擎(连接中心自动同步批):双门齐备(contributor 已注册 + conn-sync.enabled)
         * 才装配并启动;任一缺席返回 null(NullBean)=零行为——与审计 SPI「不注册零影响」同哲学。
         * destroyMethod=shutdown:容器关停回收调度线程(ConnHealthProber 同款)。
         */
        @Bean(destroyMethod = "shutdown")
        @ConditionalOnMissingBean
        public ClusterConnSyncEngine clusterConnSyncEngine(ConnStore connStore, EsClientRouter esClientRouter,
                                                           ObjectProvider<ConnHealthProber> proberProvider,
                                                           ObjectProvider<ClusterConnContributor> contributorProvider,
                                                           ESQueryStudioElasticsearchProperties properties) {
            ClusterConnContributor contributor = contributorProvider.getIfAvailable();
            ESQueryStudioElasticsearchProperties.ConnSync cs = properties.getConsole().getConnSync();
            if (contributor == null || !cs.isEnabled()) {
                return null;
            }
            ClusterConnSyncEngine engine = new ClusterConnSyncEngine(connStore, esClientRouter,
                    proberProvider.getIfAvailable(), contributor,
                    cs.getIntervalSeconds(), cs.getInitialDelaySeconds(), cs.getMinRole());
            engine.start();
            return engine;
        }

        @Bean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public org.springframework.web.servlet.config.annotation.WebMvcConfigurer esTargetWebMvcConfigurer(
                EsClientRouter esClientRouter, ConnStore connStore, ESQueryStudioElasticsearchProperties properties) {
            // 拦截器需 principal 做 minRole 校验，order(20) 保证排在鉴权拦截器（order 10）之后
            EsTargetInterceptor interceptor = new EsTargetInterceptor(esClientRouter, connStore,
                    properties.getConsole().isHostClusterVisible());
            return new org.springframework.web.servlet.config.annotation.WebMvcConfigurer() {
                @Override
                public void addInterceptors(org.springframework.web.servlet.config.annotation.InterceptorRegistry registry) {
                    registry.addInterceptor(interceptor).addPathPatterns("/internal/es/index/**").order(20);
                }
            };
        }

        @Bean
        @ConditionalOnMissingBean
        public RebuildLockStore rebuildLockStore(ControlClusterResolver controlClusterResolver,
                                                 org.springframework.core.env.Environment environment,
                                                 ESQueryStudioElasticsearchProperties properties,
                                                 HostEsVersionProvider hostEsVersionProvider) {
            // H 阶段：lock 索引名与 starter 命名族保持一致（<profile><app>_esquerystudio_lock）。
            // 接入方仍可用 esquerystudio.elasticsearch.lock.index-name=... 显式覆盖整名。
            String configured = resolveLockIndexName(properties, environment);
            // -67：锁不再直接拿 RHLC，改经 LockDocPort 窄端口（版本感知 + typeless API 不可达）
            return new EsRebuildLockStore(
                    new io.github.dengmeiluan.esquerystudio.console.lock.VersionAwareLockDocPort(
                            controlClusterResolver::client, hostEsVersionProvider),
                    configured, properties.getLock().isEnabled());
        }

        /**
         * 解析 lock 索引名（<b>唯一</b>推导处，锁与控制台系统索引查询共用）。
         *
         * <p> 阶段⑤：原实现从 {@code EsRebuildJobES} 的 {@code @Document} 解析出 job 索引名
         * 再把尾段 job→lock 替换。job 实体已随 SPI 重建路径删除，故此处直接按<b>同一套默认规则</b>
         * 拼出 lock 名——默认路径下解析结果与删除前逐字相同，锁索引名不发生漂移。</p>
         */
        private static String resolveLockIndexName(ESQueryStudioElasticsearchProperties properties,
                                                   org.springframework.core.env.Environment environment) {
            String configured = properties.getLock().getIndexName();
            if (configured != null && !configured.isEmpty()) {
                return configured;
            }
            return environment.getProperty("POLARDB_PROFILES_ACTIVE", "")
                    + environment.getProperty("spring.application.name", "")
                    + "_esquerystudio_lock";
        }

        @Bean
        @ConditionalOnMissingBean
        public RebuildLockGuard rebuildLockGuard(RebuildLockStore rebuildLockStore, ESQueryStudioElasticsearchProperties properties) {
            // R1：把 acquire/renew/release 等锁动作从 service 抽出到 guard，service 不再直接持 LockStore
            return new RebuildLockGuard(rebuildLockStore, properties);
        }

        @Bean
        @ConditionalOnMissingBean
        public IndexNameResolver indexNameResolver(EsIndexAdmin esIndexAdmin,
                                                   ESQueryStudioElasticsearchProperties properties,
                                                   EntityMappingDeriver entityMappingDeriver) {
            // R1：把 nextPhysical/resolvePhysical/resolveMappingJson 等索引名相关逻辑收敛在此
            // mapping 解析的第②级「注解推导」由 entityMappingDeriver 提供
            return new IndexNameResolver(esIndexAdmin, properties, entityMappingDeriver);
        }

        @Bean
        @ConditionalOnMissingBean
        public EsIndexRebuildService esIndexRebuildService(IndexMetaRegistry indexMetaRegistry,
                                                           EsIndexAdmin esIndexAdmin,
                                                           RebuildLockGuard rebuildLockGuard,
                                                           IndexNameResolver indexNameResolver,
                                                           ESQueryStudioElasticsearchProperties properties,
                                                           org.springframework.core.env.Environment environment) {
            EsIndexRebuildService svc = new EsIndexRebuildService(indexMetaRegistry, esIndexAdmin,
                    rebuildLockGuard, indexNameResolver, properties);
            // 系统索引查询（inspect-system / system-query）要查的就是锁自己在用的那个索引，
            // 故用与 rebuildLockStore 完全相同的解析规则，避免两处分叉。
            svc.setLockIndexName(resolveLockIndexName(properties, environment));
            return svc;
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public InternalEsIndexRebuildController internalEsIndexRebuildController(EsIndexRebuildService esIndexRebuildService,
                                                                                EsIndexAdmin esIndexAdmin,
                                                                                ESQueryStudioElasticsearchProperties properties) {
            return new InternalEsIndexRebuildController(esIndexRebuildService, esIndexAdmin,
                    properties.getConsole().getAuth().isEnabled());
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public InternalEsRebuildExceptionAdvice internalEsRebuildExceptionAdvice() {
            // 把 controller 抛的 IllegalStateException / IllegalArgumentException 转结构化 {code,message}，
            // 前端按 code 精确渲染锁冲突/失锁/状态守卫等业务异常（替代 regex 抓 message）
            return new InternalEsRebuildExceptionAdvice();
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public InternalEsErrorFallbackAdvice internalEsErrorFallbackAdvice() {
            // -C2：starter 全部端点的 ES 异常兜底——把 ES 原始报错体（含 root_cause.reason）结构化透给前端，
            // 不再落到宿主全局 advice 被拍平成「内部错误:traceId」
            return new InternalEsErrorFallbackAdvice();
        }

        // ----------------------------------------------------------------------------------------------
        // 跨集群迁移（客户端 scroll+bulk）：与同集群重建并列、解耦。整组受 esquerystudio.elasticsearch.migrate.enabled 控制。
        // ----------------------------------------------------------------------------------------------

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.migrate", name = "enabled", matchIfMissing = true)
        public RunningMigrations runningMigrations() {
            return new RunningMigrations();
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.migrate", name = "enabled", matchIfMissing = true)
        public RemoteEsClientFactory remoteEsClientFactory(ESQueryStudioElasticsearchProperties properties) {
            return new RemoteEsClientFactory(properties.getMigrate().getConnectTimeoutMs(),
                    properties.getMigrate().getSocketTimeoutMs());
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.migrate", name = "enabled", matchIfMissing = true)
        public MigrateJobStore migrateJobStore(EntityIndexNames entityIndexNames,
                                               ControlClusterResolver controlClusterResolver) {
            // 索引名走 @Document SpEL（纯元数据，免宿主 ops）；读写 IO 走控制集群
            String idx = entityIndexNames.indexNameOf(MigrateJobES.class);
            return new MigrateJobStore(controlClusterResolver::operations, idx);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.migrate", name = "enabled", matchIfMissing = true)
        public MigrateJobTracker migrateJobTracker(MigrateJobStore migrateJobStore) {
            return new MigrateJobTracker(migrateJobStore);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.migrate", name = "enabled", matchIfMissing = true)
        public CrossClusterMigrateService crossClusterMigrateService(ControlClusterResolver controlClusterResolver,
                                                                     EsIndexAdmin esIndexAdmin,
                                                                     RemoteEsClientFactory remoteEsClientFactory,
                                                                     MigrateJobTracker migrateJobTracker,
                                                                     RunningMigrations runningMigrations,
                                                                     IndexMetaRegistry indexMetaRegistry,
                                                                     ESQueryStudioElasticsearchProperties properties,
                                                                     org.springframework.core.env.Environment environment,
                                                                     HostEsVersionProvider hostEsVersionProvider) {
            // 本地 client 统一经 ControlClusterResolver 懒供给（SPRING 模式≡宿主 client，零回归）
            // #69：目标集群大版本守卫需要宿主版本——探不到保持「未知」并拒绝起迁移，不假装 7.x
            return new CrossClusterMigrateService(controlClusterResolver::client, esIndexAdmin, remoteEsClientFactory,
                    migrateJobTracker, runningMigrations, indexMetaRegistry, properties, environment,
                    hostEsVersionProvider);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.migrate", name = "enabled", matchIfMissing = true)
        public MigrateBootstrapRunner migrateBootstrapRunner(MigrateJobStore migrateJobStore,
                                                             MigrateJobTracker migrateJobTracker,
                                                             RunningMigrations runningMigrations) {
            return new MigrateBootstrapRunner(migrateJobStore, migrateJobTracker, runningMigrations);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnBean(CrossClusterMigrateService.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public CrossClusterMigrateController crossClusterMigrateController(CrossClusterMigrateService crossClusterMigrateService,
                                                                           ConnStore connStore,
                                                                           org.springframework.beans.factory.ObjectProvider<io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver> envPagesProvider,
                                                                           ESQueryStudioElasticsearchProperties properties) {
            return new CrossClusterMigrateController(crossClusterMigrateService, connStore,
                    envPagesProvider.getIfAvailable(), properties.getConsole().getPageAuth().isEnabled());
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnBean(CrossClusterMigrateService.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public InternalEsMigrateExceptionAdvice internalEsMigrateExceptionAdvice() {
            return new InternalEsMigrateExceptionAdvice();
        }

        // ----------------------------------------------------------------------------------------------
        //  Adhoc 托管重建：无 provider、作用于任意逻辑索引名的一次性运维重建（控制台向导驱动）。
        // ----------------------------------------------------------------------------------------------

        @Bean
        @ConditionalOnMissingBean
        public AdhocRebuildService adhocRebuildService(EsIndexAdmin esIndexAdmin,
                                                       ControlClusterResolver controlClusterResolver,
                                                       ESQueryStudioElasticsearchProperties properties,
                                                       RebuildLockStore rebuildLockStore,
                                                       AdhocJobStore adhocJobStore,
                                                       EsClientRouter esClientRouter,
                                                       ConnStore connStore) {
            // 同 crossClusterMigrateService，经 resolver 懒供给
            // 接入重建锁——adhoc 此前只有内存态 map，无跨实例互斥，
            // 两人同时对同一索引起重建会各建新物理索引、各翻别名。
            // 接入作业持久化 store（6 参构造），重启后仍可在列表页看历史。
            // target-aware adhoc：注入路由器与连接档案——start 捕获当前选中目标，
            // worker/abort 固定在 job 目标上执行，锁按 target+逻辑名隔离。
            return new AdhocRebuildService(esIndexAdmin, controlClusterResolver::client,
                    properties.getAdhoc().getConfirmTimeoutMs(),
                    rebuildLockStore, properties.getLock().getLeaseMs(), adhocJobStore,
                    esClientRouter, connStore);
        }

        /**
         * 作业持久化 store 三选一装配，复用审计同款 {@code esquerystudio.elasticsearch.console.store} 开关
         * （见 {@code consoleOpsAuditStore}），审计与作业元数据必须同宿。
         *
         * <p>{@code store=jdbc}：取宿主 DataSource，缺失则<b>响亮失败</b>（配置错误不静默降级，与审计一致）。
         * 否则默认走控制集群的 {@link EsAdhocJobStore}（Supplier 懒解析，装配期不连 ES）——
         * 首次 save 时才建索引，ES 不可用也只在 store 内部 warn、不反噬重建，事实上的兜底。
         * {@code @ConditionalOnMissingBean} 让宿主可注入自定义实现（如 {@link InMemoryAdhocJobStore}）。</p>
         */
        @Bean
        @ConditionalOnMissingBean
        public AdhocJobStore adhocJobStore(ControlClusterResolver controlClusterResolver,
                                           ESQueryStudioElasticsearchProperties properties,
                                           ObjectProvider<DataSource> dataSourceProvider,
                                           org.springframework.core.env.Environment environment) {
            DataSource sqlite = sqliteDataSourceOrNull(properties,
                    environment.getProperty("spring.application.name", "default"));
            if (sqlite != null) {
                return new JdbcAdhocJobStore(sqlite);
            }
            if ("jdbc".equalsIgnoreCase(properties.getConsole().getStore())) {
                DataSource ds = dataSourceProvider.getIfAvailable();
                if (ds == null) {
                    throw new IllegalStateException("esquerystudio.elasticsearch.console.store=jdbc 但宿主未提供 DataSource Bean；"
                            + "请配置 spring.datasource.* 或改回 store=control-es");
                }
                return new JdbcAdhocJobStore(ds);
            }
            // adhoc 无专属索引名配置项（不新造），走 store 默认索引；
            // EsAdhocJobStore 构造对空/null 亦回落到 DEFAULT_INDEX。
            return new EsAdhocJobStore(controlClusterResolver::client, EsAdhocJobStore.DEFAULT_INDEX);
        }

        /**
         * {@code store=sqlite} 时的本地库连接源（作业与审计同宿一个 SQLite 文件）。
         * 档位未选 sqlite，或 classpath 缺 {@code org.xerial:sqlite-jdbc}（optional 依赖，
         * 不传染嵌入宿主），或建库 IO 失败 → 返回 null 由调用方回落 control-es 并留痕。
         */
        private DataSource sqliteDataSourceOrNull(ESQueryStudioElasticsearchProperties properties, String appName) {
            if (!"sqlite".equalsIgnoreCase(properties.getConsole().getStore())) {
                return null;
            }
            if (!io.github.dengmeiluan.esquerystudio.console.store.SqliteStores.driverAvailable()) {
                logger.warn("esquerystudio.elasticsearch.console.store=sqlite 但 classpath 缺 org.xerial:sqlite-jdbc，"
                        + "回落 control-es 档（作业/审计仍落控制集群）；引入该依赖后重启即生效");
                return null;
            }
            try {
                java.nio.file.Path db = io.github.dengmeiluan.esquerystudio.console.store.SqliteStores
                        .resolveDatabaseFile(properties.getConsole().getSqlitePath(), appName);
                logger.info("[Store] sqlite 档：作业+审计落 {}", db);
                return io.github.dengmeiluan.esquerystudio.console.store.SqliteStores.buildDataSource(db);
            } catch (java.io.IOException e) {
                logger.warn("esquerystudio.elasticsearch.console.store=sqlite 建库失败（{}），回落 control-es 档", e.getMessage(), e);
                return null;
            }
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public InternalAdhocRebuildController internalAdhocRebuildController(AdhocRebuildService adhocRebuildService,
                                                                            org.springframework.beans.factory.ObjectProvider<io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver> envPagesProvider,
                                                                            ESQueryStudioElasticsearchProperties properties) {
            return new InternalAdhocRebuildController(adhocRebuildService, envPagesProvider.getIfAvailable(),
                    properties.getConsole().getPageAuth().isEnabled());
        }

        // ----------------------------------------------------------------------------------------------
        //  索引配置质量门禁：L1 Lint + L2 Dry-run + L3 Advisor 三层校验内核，
        // 覆盖控制台交互校验、启动期 @Setting/@Mapping 门禁、配置漂移检测三个接入面。
        // ----------------------------------------------------------------------------------------------

        @Bean
        @ConditionalOnMissingBean
        public IndexConfigValidator indexConfigValidator(EsIndexAdmin esIndexAdmin,
                                                          EsClientRouter esClientRouter,
                                                          ConnStore connStore) {
            /* w44:注入路由/档案——dry-run 实测目标随报告透出(顶栏选错集群可自查) */
            return new IndexConfigValidator(esIndexAdmin, esClientRouter, connStore);
        }

        @Bean
        @ConditionalOnMissingBean
        public ConfigLabService configLabService(IndexConfigValidator indexConfigValidator,
                                                 EsIndexAdmin esIndexAdmin,
                                                 ControlClusterResolver controlClusterResolver,
                                                 ObjectProvider<IndexMetaRegistry> registryProvider) {
            // 同 crossClusterMigrateService，经 resolver 懒供给
            return new ConfigLabService(indexConfigValidator, esIndexAdmin, controlClusterResolver::client, registryProvider);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public InternalConfigLabController internalConfigLabController(ConfigLabService configLabService) {
            return new InternalConfigLabController(configLabService);
        }

        @Bean
        @ConditionalOnMissingBean
        public ConfigValidationStartupRunner configValidationStartupRunner(IndexConfigValidator indexConfigValidator,
                                                                           ObjectProvider<IndexMetaRegistry> registryProvider,
                                                                           ESQueryStudioElasticsearchProperties properties,
                                                                           EntityMappingDeriver entityMappingDeriver) {
            // 与重建同源校验 mapping（entityMappingDeriver 是外层无条件 Bean，此处可注入）
            return new ConfigValidationStartupRunner(indexConfigValidator, registryProvider, properties,
                    entityMappingDeriver);
        }

        // ----------------------------------------------------------------------------------------------
        //  现场内嵌智能：护栏动作协议（estimate→dry-run→confirmToken→execute→回执 + 控制台操作审计）+
        // settings 变更分析器。新增动作只需注册 GuardedAction Bean，协议层零改动。
        // 「审计」的所指见 guardedActionExecutor(...) 的 javadoc —— 那里的 {@link} 才进编译器视野。
        // ----------------------------------------------------------------------------------------------

        @Bean
        @ConditionalOnMissingBean
        public ConfirmTokenService confirmTokenService() {
            return new ConfirmTokenService();
        }

        @Bean
        @ConditionalOnMissingBean
        public SettingsChangeAnalyzer settingsChangeAnalyzer(EsIndexAdmin esIndexAdmin) {
            return new SettingsChangeAnalyzer(esIndexAdmin);
        }

        @Bean
        @ConditionalOnMissingBean
        public ApplyIndexSettingsAction applyIndexSettingsAction(SettingsChangeAnalyzer settingsChangeAnalyzer,
                                                                 EsIndexAdmin esIndexAdmin) {
            return new ApplyIndexSettingsAction(settingsChangeAnalyzer, esIndexAdmin);
        }

        @Bean
        @ConditionalOnMissingBean
        public GuardedActionRegistry guardedActionRegistry(List<GuardedAction> actions) {
            return new GuardedActionRegistry(actions);
        }

        /**
         * 护栏动作协议编排器：estimate → dry-run → confirmToken → execute → 回执 + 审计。
         *
         * <p><b>此处「审计」指控制台写操作流水 {@link ConsoleOpsAuditStore}（健在），
         * 不是  阶段⑤已删的重建窗口期记账 {@code audit/RebuildAuditStore}</b>——两者同名不同物。
         * 台账 #72 普查「描述已删事物的注释」时，本条几乎因这次撞名被误删；
         * 实测 {@link GuardedActionExecutor#execute} 六环俱在，故写死区分留给下一个人。</p>
         */
        @Bean
        @ConditionalOnMissingBean
        public GuardedActionExecutor guardedActionExecutor(GuardedActionRegistry guardedActionRegistry,
                                                           ConfirmTokenService confirmTokenService,
                                                           ObjectProvider<ConsoleOpsAuditStore> auditStoreProvider,
                                                           ESQueryStudioElasticsearchProperties properties) {
            // 审计 store 随鉴权开关可缺席，executor 内部已容忍 null
            return new GuardedActionExecutor(guardedActionRegistry, confirmTokenService,
                    auditStoreProvider.getIfAvailable(),
                    properties.getConsole().getPageAuth().isEnabled());
        }

        @Bean
        @ConditionalOnMissingBean
        public InsightService insightService(SettingsChangeAnalyzer settingsChangeAnalyzer) {
            return new InsightService(settingsChangeAnalyzer);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public InsightController insightController(InsightService insightService,
                                                   GuardedActionExecutor guardedActionExecutor) {
            return new InsightController(insightService, guardedActionExecutor);
        }

        // ----------------------------------------------------------------------------------------------
        //  控制台鉴权：默认开启（esquerystudio.elasticsearch.console.auth.enabled=false 可关）。
        // 宿主注册自己的 EsConsoleAuthorizer bean 即可整体替换内置账号体系（JWT/SSO 融入）。
        // ----------------------------------------------------------------------------------------------

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.auth", name = "enabled", matchIfMissing = true)
        public ConsoleOpsAuditStore consoleOpsAuditStore(ControlClusterResolver controlClusterResolver,
                                                         ESQueryStudioElasticsearchProperties properties,
                                                         ObjectProvider<DataSource> dataSourceProvider,
                                                         ObjectProvider<ConsoleAuditContributor> contributorProvider,
                                                         org.springframework.core.env.Environment environment) {
            // 审计存储随 store 模式切换，与作业元数据同宿（两者必须一致，运维对账不分裂）
            // 外面包 PAGE_DENIED 去重聚合层——VIEWER 停留在无权限页时的轮询心跳
            // 不再逐条刷爆审计流（同 username|uri 十分钟窗一条+抑制计数带出）
            ConsoleOpsAuditStore raw = buildRawOpsAuditStore(controlClusterResolver, properties,
                    dataSourceProvider, environment.getProperty("spring.application.name", "default"));
            // 宿主注册 ConsoleAuditContributor Bean 则查询并入宿主审计流水。
            // 裁决改默认关：宿主侧记录多为匿名登录族（trusted-login 时无会话切面，
            // username 结构性 null），非本控制台请求进控制台审计视图不可读也不可追责——宿主确需
            // 并入时显式开 esquerystudio.elasticsearch.console.auth.host-audit-merge=true（贡献者故障由合并层降级、
            // 绝不反噬控制台审计的红线不变）。
            ConsoleAuditContributor contributor = contributorProvider.getIfAvailable();
            if (contributor != null && properties.getConsole().getAuth().isHostAuditMerge()) {
                raw = new HostAuditMergeStore(raw, contributor);
            }
            return new DedupConsoleOpsAuditStore(raw);
        }

        private ConsoleOpsAuditStore buildRawOpsAuditStore(ControlClusterResolver controlClusterResolver,
                                                           ESQueryStudioElasticsearchProperties properties,
                                                           ObjectProvider<DataSource> dataSourceProvider,
                                                           String appName) {
            DataSource sqlite = sqliteDataSourceOrNull(properties, appName);
            if (sqlite != null) {
                return new JdbcConsoleOpsAuditStore(sqlite);
            }
            if ("jdbc".equalsIgnoreCase(properties.getConsole().getStore())) {
                DataSource ds = dataSourceProvider.getIfAvailable();
                if (ds == null) {
                    throw new IllegalStateException("esquerystudio.elasticsearch.console.store=jdbc 但宿主未提供 DataSource Bean；"
                            + "请配置 spring.datasource.* 或改回 store=control-es");
                }
            return new JdbcConsoleOpsAuditStore(ds);
        }
        /* 20260922 统一只用控制集群 ES 单载体约定：环形开启时按日索引写（快筛+双闸保留仅在 ES 档承诺） */
        return new EsConsoleOpsAuditStore(controlClusterResolver::client, properties.getConsole().getAuth().getOpsAuditIndexName(),
                properties.getConsole().getAuth().getAuditRetention().isEnabled());
    }

    /**
     * 日期索引双闸清理器（20260922）：管辖审计+监控两个日期索引族（合计共用总量上限，
     * 对应「监控+审计 ≤30GB」原始诉求）；环形总开关关闭或 JDBC 档（审计不落 ES）时
     * 只管监控族；两族皆无（全关）返回未 start 的空壳 Bean（零线程零调度）。
     */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.auth", name = "enabled", matchIfMissing = true)
    public AuditIndexRetentionSweeper auditIndexRetentionSweeper(
            ControlClusterResolver controlClusterResolver, ESQueryStudioElasticsearchProperties properties) {
        ESQueryStudioElasticsearchProperties.Auth auth = properties.getConsole().getAuth();
        ESQueryStudioElasticsearchProperties.Monitor monitor = properties.getConsole().getMonitor();
        List<String> prefixes = new ArrayList<>();
        if (auth.getAuditRetention().isEnabled() && !"jdbc".equalsIgnoreCase(properties.getConsole().getStore())) {
            prefixes.add(auth.getOpsAuditIndexName());
        }
        if (monitor.isEnabled()) {
            prefixes.add(monitor.getIndexName());
        }
        ESQueryStudioElasticsearchProperties.AuditRetention retention = auth.getAuditRetention();
        AuditIndexRetentionSweeper sweeper = new AuditIndexRetentionSweeper(controlClusterResolver::client,
                prefixes, retention.getMaxDays(), retention.getMaxTotalBytes(),
                retention.isDryRun());
        if (!prefixes.isEmpty()) {
            sweeper.start();
        }
        return sweeper;
    }

    /**
     * 监控快照落库器（20260922 批4）：服务端定时任务=唯一写入方——每轮把全部连接的最近
     * 探活结果落控制集群 ES 监控日期索引；用户页面轮询只读不入库。探活器/连接档案缺席（探活
     * 关闭等）时供给恒空=零写入空转；连接清单拉取失败由器内节流告警整轮跳过。
     */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.monitor", name = "enabled", matchIfMissing = true)
    public MonitorSnapshotRecorder monitorSnapshotRecorder(
            ControlClusterResolver controlClusterResolver,
            ObjectProvider<ConnStore> connStoreProvider,
            ObjectProvider<ConnHealthProber> proberProvider,
            ESQueryStudioElasticsearchProperties properties) {
        ESQueryStudioElasticsearchProperties.Monitor monitor = properties.getConsole().getMonitor();
        MonitorSnapshotRecorder recorder =
                new MonitorSnapshotRecorder(
                        controlClusterResolver::client, () -> {
                    ConnStore connStore = connStoreProvider.getIfAvailable();
                    ConnHealthProber prober = proberProvider.getIfAvailable();
                    if (connStore == null || prober == null) {
                        return Collections.emptyList();
                    }
                    List<Map<String, Object>> docs = new ArrayList<>();
                    long ts = System.currentTimeMillis();
                    for (Map<String, Object> conn : connStore.list()) {
                        docs.add(MonitorSnapshotRecorder.buildDoc(
                                conn, prober.health(String.valueOf(conn.get("id"))), ts));
                    }
                    return docs;
                        }, monitor.getIndexName(), monitor.getIntervalSeconds());
        recorder.start();
        return recorder;
    }

    /**
     * 多集群指标采集落库器（指标时序批）：服务端定时任务=唯一写入方——每轮对每个连接经
     * 路由器拉 _cluster/health + _nodes/stats 合成 cluster/node 指标 doc 落监控日期索引
     * （与探活快照同族同环形）。挂在监控总开关（esquerystudio.elasticsearch.console.monitor.enabled）下：
     * 关掉监控即连指标一起停——否则环形清理器已放行该前缀，指标会在无人清理的索引族里
     * 静默堆积。start() 由 Bean 方法调用（与探活器/快照器同款）。
     */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.monitor", name = "enabled", matchIfMissing = true)
    public ClusterMetricsCollector clusterMetricsCollector(ConnStore connStore,
                                                           EsClientRouter esClientRouter,
                                                           ControlClusterResolver controlClusterResolver,
                                                           ESQueryStudioElasticsearchProperties properties) {
        ESQueryStudioElasticsearchProperties.Monitor monitor = properties.getConsole().getMonitor();
        ClusterMetricsCollector collector = new ClusterMetricsCollector(connStore, esClientRouter::clientFor,
                controlClusterResolver::client, monitor.getIndexName(), monitor.getMetricsIntervalSeconds());
        collector.start();
        return collector;
    }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.auth", name = "enabled", matchIfMissing = true)
        public EnvPagesResolver envPagesResolver(ConnStore connStore, ESQueryStudioElasticsearchProperties properties) {
            // 类上的 @Component 在真实运行环境不参与装配（starter 组件一律走显式 @Bean，宿主/独立
            // 部署都不扫本包路径）——权限自查端点的装配条件锚定本类型，此 @Bean 即其唯一
            // 容器注册来源；拦截器与端点必须共用同一实例，不得各自 new
            return new EnvPagesResolver(connStore, properties);
        }

        @Bean
        @ConditionalOnMissingBean(EsConsoleAuthorizer.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.auth", name = "enabled", matchIfMissing = true)
        public BuiltinConsoleAuthService builtinConsoleAuthService(ControlClusterResolver controlClusterResolver,
                                                                   ESQueryStudioElasticsearchProperties properties,
                                                                   ObjectProvider<ConsoleAuthDelegate> delegateProvider) {
            ESQueryStudioElasticsearchProperties.Auth auth = properties.getConsole().getAuth();
            /* 内置登录开关三态：显式配置优先；否则「有宿主委托=关闭、独立部署=开启」。
               关闭的理由是安全默认：委托部署里默认兜底账号 admin/esquerystudio 可经免鉴权的
               /auth/login 直接拿本地 ADMIN（grantedPages=null 绕过全部页面门），
               等于在宿主鉴权之外留一把永久钥匙。 */
            boolean hasDelegate = delegateProvider.getIfAvailable() != null;
            Boolean configured = auth.getBuiltinLoginEnabled();
            boolean loginEnabled = configured != null ? configured : !hasDelegate;
            if (hasDelegate && loginEnabled) {
                logger.error("[esquerystudio-auth] 已启用宿主鉴权委托，但内置账号登录仍被强制开启"
                        + "（builtin-login-enabled=true）：本地账号（含兜底 admin）可绕过宿主鉴权直接登录，"
                        + "请确认这是临时运维安排并尽快关闭");
            }
            return new BuiltinConsoleAuthService(controlClusterResolver::client, auth.getUserIndexName(),
                    auth.getFallbackUsername(), auth.getFallbackPassword(), auth.getTokenTtlMs(),
                    auth.getTokenSecret(), loginEnabled);
        }

        @Bean
        @ConditionalOnMissingBean
        public ConsolePageCatalog consolePageCatalog() {
            // 页面契约唯一事实源；宿主注册自定义 Bean 可覆盖（如裁剪页面集）
            return ConsolePageCatalog.load();
        }

        /**
         * 运行时 UI 配置：品牌 + 功能包 + 单页排除。宿主注册 {@link ConsoleHostIntegration}
         * Bean 提供默认品牌/包选择，显式 esquerystudio.console.* 配置可覆盖。
         */
        @Bean
        @ConditionalOnMissingBean
        public ConsoleUiConfigService consoleUiConfigService(ConsolePageCatalog consolePageCatalog,
                                                             PlatformUiProperties platformUiProperties,
                                                             ObjectProvider<ConsoleHostIntegration> integrationProvider) {
            return new ConsoleUiConfigService(consolePageCatalog, platformUiProperties, integrationProvider);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public ConsoleUiConfigController consoleUiConfigController(ConsoleUiConfigService consoleUiConfigService) {
            return new ConsoleUiConfigController(consoleUiConfigService);
        }

        /**
         * 端点授权覆盖自检（984）：启动完成后把「未登记页面/共享映射」的端点打 WARN。
         * 只在页面级授权开启时装配——纯角色档模型下页面清单本就不参与执法，告警无意义。
         */
        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnBean(ConsolePageCatalog.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.page-auth", name = "enabled", matchIfMissing = true)
        public io.github.dengmeiluan.esquerystudio.console.auth.ConsoleEndpointCoverageAuditor consoleEndpointCoverageAuditor(
                ConsolePageCatalog consolePageCatalog) {
            return new io.github.dengmeiluan.esquerystudio.console.auth.ConsoleEndpointCoverageAuditor(consolePageCatalog);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnBean(BuiltinConsoleAuthService.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public ConsoleAuthController consoleAuthController(BuiltinConsoleAuthService builtinConsoleAuthService,
                                                           ConsoleOpsAuditStore consoleOpsAuditStore,
                                                           ConsolePageCatalog consolePageCatalog,
                                                           ESQueryStudioElasticsearchProperties properties) {
            return new ConsoleAuthController(builtinConsoleAuthService, consoleOpsAuditStore, consolePageCatalog,
                    properties.getConsole().getPageAuth().isEnabled(),
                    /* 与 header 委托同一份受信代理清单：登录节流的 IP 维度不能用可伪造的转发头 */
                    properties.getConsole().getAuth().getDelegate().getHeader().getTrustedProxies());
        }

        /**
         * 自定义 EsConsoleAuthorizer（无内置账号服务）时的 /auth/me 兜底：让前端拿到
         * 拦截器已认证的角色/页面授权/env 模板，不再把 404 误判成「无鉴权部署」而全开菜单。
         */
        @Bean
        @ConditionalOnMissingBean({ConsoleAuthController.class, BuiltinConsoleAuthService.class})
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression("${esquerystudio.elasticsearch.console.auth.enabled:true}")
        public io.github.dengmeiluan.esquerystudio.console.auth.ConsoleMeFallbackController consoleMeFallbackController(
                ConsolePageCatalog consolePageCatalog,
                io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver envPagesResolver,
                ESQueryStudioElasticsearchProperties properties) {
            return new io.github.dengmeiluan.esquerystudio.console.auth.ConsoleMeFallbackController(
                    consolePageCatalog, properties.getConsole().getPageAuth().isEnabled(), envPagesResolver);
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnBean(io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression("${esquerystudio.elasticsearch.console.auth.enabled:true}")
        public io.github.dengmeiluan.esquerystudio.console.auth.ConsolePermissionsController consolePermissionsController(
                ConsolePageCatalog consolePageCatalog,
                io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver envPagesResolver,
                io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore,
                ESQueryStudioElasticsearchProperties properties) {
            return new io.github.dengmeiluan.esquerystudio.console.auth.ConsolePermissionsController(consolePageCatalog,
                    envPagesResolver, connStore, properties.getConsole().getPageAuth().isEnabled());
        }

        @Bean
        @ConditionalOnMissingBean(ConsoleAuthDelegate.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.auth.delegate", name = "mode")
        public ConsoleAuthDelegate propertiesAuthDelegate(ESQueryStudioElasticsearchProperties properties) {
            //  配置式宿主鉴权：零 Java 对接；宿主代码 SPI Bean 存在则本 Bean 让位（代码优先）
            return new PropertiesAuthDelegate(properties.getConsole().getAuth().getDelegate());
        }

        /**
         * 1048：控制台端点的方法/媒体类型错误还原为 405/415（Spring 找不到 handler 时
         * 拦截器不执行，宿主全局包装会把 405 变成 HTTP 200 + code:500）。
         */
        @Bean
        public io.github.dengmeiluan.esquerystudio.console.web.InternalEsMethodNotAllowedResolver
        internalEsMethodNotAllowedResolver() {
            return new io.github.dengmeiluan.esquerystudio.console.web.InternalEsMethodNotAllowedResolver();
        }

        @Bean
        @ConditionalOnBean(EsConsoleAuthorizer.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.console.auth", name = "enabled", matchIfMissing = true)
        public org.springframework.web.servlet.config.annotation.WebMvcConfigurer esConsoleAuthWebMvcConfigurer(
                EsConsoleAuthorizer esConsoleAuthorizer, ConsoleOpsAuditStore consoleOpsAuditStore,
                ControlClusterResolver controlClusterResolver, ConnStore connStore,
                ObjectProvider<ConsoleAuthDelegate> delegateProvider,
                ConsolePageCatalog consolePageCatalog, EnvPagesResolver envPagesResolver,
                ESQueryStudioElasticsearchProperties properties, GuardedActionRegistry guardedActionRegistry) {
            // 宿主注册 ConsoleAuthDelegate 则组合之——委托先行（iframe 嵌入带宿主凭证）、内置兜底（独立开页登录）
            ConsoleAuthDelegate delegate = delegateProvider.getIfAvailable();
            EsConsoleAuthorizer effective = delegate == null ? esConsoleAuthorizer
                    : new DelegatingConsoleAuthorizer(delegate, esConsoleAuthorizer);
            boolean pageAuthEnabled = properties.getConsole().getPageAuth().isEnabled();
            if (!pageAuthEnabled) {
                // 逃生阀关闭是运维动作，启动期必须留痕（本方法只调用一次，天然一次性）：
                // 否则「页面级权限配了却不生效」在产线完全不可见
                logger.warn("控制台页面级授权已关闭（esquerystudio.elasticsearch.console.page-auth.enabled=false），"
                        + "回退纯角色档拦截；宿主下发的 grantedPages 将被忽略");
            }
            ConsoleAuthInterceptor interceptor = new ConsoleAuthInterceptor(effective, consoleOpsAuditStore,
                    controlClusterResolver, consolePageCatalog, pageAuthEnabled, envPagesResolver, connStore,
                    /* 审计来源 IP 的受信代理清单与 header 委托同源（防伪造 XFF 污染审计/绕过节流） */
                    properties.getConsole().getAuth().getDelegate().getHeader().getTrustedProxies());
            // 1031：insight 护栏动作 fail-closed 闸的注册表判据（未登记 actionId 写请求授权层拒绝）
            interceptor.setGuardedActionRegistry(guardedActionRegistry);
            /* host-cluster-visible=false 的纯管理平台：宿主专属 provider 端点与数据面同口径拒绝
               （否则残留 conn:host 授权可绕过 EsTargetInterceptor 直捣宿主）。 */
            interceptor.setHostClusterVisible(properties.getConsole().isHostClusterVisible());
            return new org.springframework.web.servlet.config.annotation.WebMvcConfigurer() {
                @Override
                public void addInterceptors(org.springframework.web.servlet.config.annotation.InterceptorRegistry registry) {
                    // order(10)：先鉴权存 principal，后面 EsTargetInterceptor（order 20）才能做 minRole 校验
                    registry.addInterceptor(interceptor)
                            .addPathPatterns("/internal/es/index/**", "/internal/es/xmigrate/**").order(10);
                }
            };
        }

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnBean(ConsoleOpsAuditStore.class)
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public ConsoleSetupController consoleSetupController(ControlClusterResolver controlClusterResolver,
                                                             ConsoleOpsAuditStore consoleOpsAuditStore,
                                                             ObjectProvider<ConsoleAuthDelegate> delegateProvider,
                                                             ObjectProvider<io.github.dengmeiluan.esquerystudio.console.auth.BuiltinConsoleAuthService> builtinAuthProvider,
                                                             ESQueryStudioElasticsearchProperties properties,
                                                             Environment environment) {
            RemoteEsClientFactory factory = new RemoteEsClientFactory(
                    properties.getMigrate().getConnectTimeoutMs(), properties.getMigrate().getSocketTimeoutMs());
            ConsoleAuthDelegate delegate = delegateProvider.getIfAvailable();
            /* 首连令牌暴露面启动期留痕（鉴权关闭的告警已移至无条件的 consoleAuthDisabledNotice）。 */
            if (properties.getConsole().getSetupToken() == null
                    || properties.getConsole().getSetupToken().trim().isEmpty()) {
                logger.warn("未配置 esquerystudio.elasticsearch.console.setup-token：未绑定窗口的匿名首连仅允许本机回环；"
                        + "远程/反向代理初始化请配置令牌");
            }
            /* authEnabled 表示后端鉴权是否真的在执法（auth.enabled），不是「内置登录是否存在」。
               自定义 EsConsoleAuthorizer 部署同样有 /auth/me 兜底与拦截器，404 只能是代理/版本错配，
               前端必须保持 fail-closed；builtinLogin 单独标识是否展示本地账号表单。 */
            boolean authEnabled = properties.getConsole().getAuth().isEnabled();
            /* builtinLogin 标识「本地账号表单是否可用」，不是「内置服务 Bean 是否存在」：
               委托部署默认关闭内置登录时 Bean 仍会装配，按 loginEnabled 口径下发，
               登录遮罩才能正确给出宿主鉴权指引而不是展示永远登不进的本地表单。 */
            io.github.dengmeiluan.esquerystudio.console.auth.BuiltinConsoleAuthService builtinService =
                    builtinAuthProvider.getIfAvailable();
            boolean builtinLogin = builtinService != null && builtinService.isLoginEnabled();
            return new ConsoleSetupController(controlClusterResolver, factory, consoleOpsAuditStore,
                    delegate, environment.getProperty("spring.application.name", "default"),
                    properties.getConsole().isHostClusterVisible(), authEnabled, builtinLogin,
                    properties.getConsole().getSetupToken());
        }

        /** 控制台 API 的基础安全响应头：nosniff 全量；auth 域（token/身份档案）禁缓存；
         *  frame-ancestors 仅在显式配置 esquerystudio.elasticsearch.console.security.frame-ancestors 时下发
         *  （宿主 iframe 嵌入是声明特性，默认不限制可嵌域——限制反而会截断合法部署）。 */
        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnProperty(prefix = "esquerystudio.elasticsearch", name = "web-enabled", matchIfMissing = true)
        public org.springframework.boot.web.servlet.FilterRegistrationBean<io.github.dengmeiluan.esquerystudio.console.auth.ConsoleSecurityHeadersFilter>
                consoleSecurityHeadersFilter(ESQueryStudioElasticsearchProperties properties) {
            String frameAncestors = properties.getConsole().getSecurity().getFrameAncestors();
            org.springframework.boot.web.servlet.FilterRegistrationBean<io.github.dengmeiluan.esquerystudio.console.auth.ConsoleSecurityHeadersFilter> reg =
                    new org.springframework.boot.web.servlet.FilterRegistrationBean<>(
                            new io.github.dengmeiluan.esquerystudio.console.auth.ConsoleSecurityHeadersFilter(
                                    frameAncestors == null || frameAncestors.trim().isEmpty() ? null : frameAncestors));
            /* 控制台 HTML/静态资源同样要过安全头：被 iframe 嵌入的是 HTML 文档而非 JSON API，
               frame-ancestors 只下发到 API 路径等于配置虚设；nosniff 对 JS/CSS 同样适用。 */
            reg.addUrlPatterns("/internal/es/index/*", "/internal/es/xmigrate/*",
                    "/esquerystudio/*", "/esquerystudio.html");
            reg.setOrder(org.springframework.core.Ordered.HIGHEST_PRECEDENCE);
            reg.setName("consoleSecurityHeadersFilter");
            return reg;
        }
    }
}
