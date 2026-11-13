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

import org.springframework.boot.context.properties.ConfigurationProperties;

import javax.annotation.PostConstruct;

/**
 * ES 重建 starter 配置项（前缀 {@code esquerystudio.elasticsearch}）。
 *
 * Q 阶段全面清场：删除所有 deprecated 兼容存根（indexPrefix/jobIndexName/auditIndexName/windowPropagationMs/windowCacheTtlMs），
 * 配置项化繁为简——索引名走 @Document SpEL，窗口期走 ES audit_store 直查、本地 cache 已删除。
 *
 * @author aicoding
 */
@ConfigurationProperties(prefix = "esquerystudio.elasticsearch")
public class ESQueryStudioElasticsearchProperties {

    /** 是否启用内置运维 Controller 与静态面板。 */
    private boolean webEnabled = true;

    /** 物理索引版本号时间格式（物理索引名为 原名_v时间戳）。 */
    private String versionFormat = "yyyyMMddHHmmss";

    /**
     * 装配模式（* <ul>
     *   <li>{@code client}（默认）—— 业务应用侧：只装索引声明；期望配置端点与自包含单页
     *       由 {@code DesiredStateController} 提供，<b>  才引入</b>，本开关引入时尚不存在，
     *       不装控制台、不装 AOP 切面、不装控制集群解析、不装 ES 管理客户端；</li>
     *   <li>{@code console} —— 宿主侧：全量装配。</li>
     * </ul>
     * 默认取 client 是刻意的：业务应用不做任何配置就是最轻的形态，
     * 「变重」必须显式声明，避免宿主稀里糊涂背上整个控制面。
     */
    private String mode = "client";
    /**
     * 连接环境页面模板（与宿主 grantedPages 同一套页面 key 白名单结构）——
     * 键=连接 env（PROD/STAGING/QA/DEV），值=页面 key 白名单集合；
     * 默认空=不启用（未配置 env 原样透传，向后兼容）。语义详见
     * {@link io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver}。
     */
    private java.util.Map<String, java.util.Set<String>> envPages = new java.util.HashMap<>();

    public java.util.Map<String, java.util.Set<String>> getEnvPages() { return envPages; }

    public void setEnvPages(java.util.Map<String, java.util.Set<String>> envPages) { this.envPages = envPages; }


    private Retry retry = new Retry();
    private Lock lock = new Lock();
    private Orchestration orchestration = new Orchestration();
    private Migrate migrate = new Migrate();
    private Console console = new Console();
    private ConfigValidation configValidation = new ConfigValidation();
    private Mapping mapping = new Mapping();
    private Adhoc adhoc = new Adhoc();
    private Compat compat = new Compat();

    /**
     * Q3 启动期 fail-fast：核心配置不变量在启动时校验，违反即拒绝启动而非运行时静默错误。
     */
    @PostConstruct
    public void validate() {
        if (retry.maxAttempts < 1) {
            throw new IllegalStateException("esquerystudio.elasticsearch.retry.max-attempts 必须 >= 1，实际=" + retry.maxAttempts);
        }
        if (retry.initBackoffMs < 0 || retry.maxBackoffMs < retry.initBackoffMs) {
            throw new IllegalStateException("esquerystudio.elasticsearch.retry 退避参数非法：init=" + retry.initBackoffMs + ", max=" + retry.maxBackoffMs);
        }
        if (lock.leaseMs <= 0) {
            throw new IllegalStateException("esquerystudio.elasticsearch.lock.lease-ms 必须 > 0，实际=" + lock.leaseMs);
        }
        if (orchestration.timeoutMs <= 0 || orchestration.pollIntervalMs <= 0) {
            throw new IllegalStateException("esquerystudio.elasticsearch.orchestration 时间参数非法：poll=" + orchestration.pollIntervalMs
                    + ", timeout=" + orchestration.timeoutMs);
        }
        if (lock.leaseMs < orchestration.timeoutMs) {
            throw new IllegalStateException("esquerystudio.elasticsearch.lock.lease-ms (" + lock.leaseMs
                    + ") 必须 >= orchestration.timeout-ms (" + orchestration.timeoutMs
                    + ")，否则长 reindex 中途锁会被强夺");
        }
        if (versionFormat == null || versionFormat.isEmpty()) {
            throw new IllegalStateException("esquerystudio.elasticsearch.version-format 不可为空");
        }
        try {
            java.time.format.DateTimeFormatter.ofPattern(versionFormat);
        } catch (Exception e) {
            throw new IllegalStateException("esquerystudio.elasticsearch.version-format 非法 DateTimeFormatter pattern: " + versionFormat, e);
        }
        if (!"client".equals(mode) && !"console".equals(mode)) {
            throw new IllegalStateException("esquerystudio.elasticsearch.mode 必须为 client / console，实际=" + mode);
        }
        if (!"auto".equals(console.controlMode) && !"spring".equals(console.controlMode)) {
            throw new IllegalStateException("esquerystudio.elasticsearch.console.control-mode 必须为 auto / spring，实际=" + console.controlMode);
        }
        if (migrate.defaultSlices < 1) {
            throw new IllegalStateException("esquerystudio.elasticsearch.migrate.default-slices 必须 >= 1，实际=" + migrate.defaultSlices);
        }
        if (migrate.defaultBatchSize < 1) {
            throw new IllegalStateException("esquerystudio.elasticsearch.migrate.default-batch-size 必须 >= 1，实际=" + migrate.defaultBatchSize);
        }
        if (migrate.scrollKeepAliveSec < 1) {
            throw new IllegalStateException("esquerystudio.elasticsearch.migrate.scroll-keep-alive-sec 必须 >= 1，实际=" + migrate.scrollKeepAliveSec);
        }
        if (migrate.connectTimeoutMs <= 0 || migrate.socketTimeoutMs <= 0) {
            throw new IllegalStateException("esquerystudio.elasticsearch.migrate 超时参数非法：connect=" + migrate.connectTimeoutMs
                    + ", socket=" + migrate.socketTimeoutMs);
        }
        if (console.auth.tokenTtlMs <= 0) {
            throw new IllegalStateException("esquerystudio.elasticsearch.console.auth.token-ttl-ms 必须 > 0，实际=" + console.auth.tokenTtlMs);
        }
        if (!"strict".equals(configValidation.mode) && !"warn".equals(configValidation.mode)
                && !"off".equals(configValidation.mode)) {
            throw new IllegalStateException("esquerystudio.elasticsearch.config-validation.mode 必须为 strict / warn / off，实际=" + configValidation.mode);
        }
        if (mapping == null || (!"startup".equals(mapping.autoRegister) && !"off".equals(mapping.autoRegister))) {
            throw new IllegalStateException("esquerystudio.elasticsearch.mapping.auto-register 必须为 startup / off，实际="
                    + (mapping == null ? null : mapping.autoRegister));
        }
        if (!"fail".equals(mapping.conflictPolicy) && !"warn".equals(mapping.conflictPolicy)) {
            throw new IllegalStateException("esquerystudio.elasticsearch.mapping.conflict-policy 必须为 fail / warn，实际=" + mapping.conflictPolicy);
        }
        if (!"skip".equals(mapping.missingIndexPolicy) && !"fail".equals(mapping.missingIndexPolicy)) {
            throw new IllegalStateException("esquerystudio.elasticsearch.mapping.missing-index-policy 必须为 skip / fail，实际=" + mapping.missingIndexPolicy);
        }
        if (adhoc.confirmTimeoutMs <= 0) {
            throw new IllegalStateException("esquerystudio.elasticsearch.adhoc.confirm-timeout-ms 必须 > 0，实际=" + adhoc.confirmTimeoutMs);
        }
        if (adhoc.confirmTimeoutMs > Adhoc.MAX_CONFIRM_TIMEOUT_MS) {
            // 防 long 溢出：等待门算 deadline = now + confirmTimeoutMs，超大值会溢出成负数，
            // 结果「设了个超大超时反而立刻超时」—— 配置反直觉地静默失效，必须启动即拒。
            throw new IllegalStateException("esquerystudio.elasticsearch.adhoc.confirm-timeout-ms 不得超过 "
                    + Adhoc.MAX_CONFIRM_TIMEOUT_MS + "（7 天），实际=" + adhoc.confirmTimeoutMs
                    + "。过大的值会导致超时死线溢出，反而立刻超时。");
        }
        if (console.auth.enabled && (console.auth.fallbackUsername.isEmpty() || console.auth.fallbackPassword.isEmpty())) {
            throw new IllegalStateException("esquerystudio.elasticsearch.console.auth 兜底账号/密码不可为空");
        }
        /* 委托模式配置非法会同时禁用内置登录（见 AutoConfiguration）：拼错 mode 或漏填该模式
           必填项 → 部署启动正常但所有身份都 401，连 ADMIN 都进不来。启动即失败比线上锁死好。 */
        String delegateMode = console.auth.delegate == null || console.auth.delegate.getMode() == null
                ? "" : console.auth.delegate.getMode().trim().toLowerCase(java.util.Locale.ROOT);
        if (!delegateMode.isEmpty()) {
            switch (delegateMode) {
                case "jwt":
                    if (isBlank(console.auth.delegate.getJwt().getSecret())
                            && isBlank(console.auth.delegate.getJwt().getPublicKey())) {
                        throw new IllegalStateException("delegate.mode=jwt 必须配置 delegate.jwt.secret 或 delegate.jwt.public-key，"
                                + "否则所有令牌验签失败且内置登录已关闭");
                    }
                    break;
                case "endpoint":
                    if (isBlank(console.auth.delegate.getEndpoint().getVerifyUrl())) {
                        throw new IllegalStateException("delegate.mode=endpoint 必须配置 delegate.endpoint.verify-url，"
                                + "否则所有令牌校验失败且内置登录已关闭");
                    }
                    break;
                case "header":
                    if (isBlank(console.auth.delegate.getHeader().getUserHeader())) {
                        throw new IllegalStateException("delegate.mode=header 必须配置 delegate.header.user-header，"
                                + "否则无法识别任何身份且内置登录已关闭");
                    }
                    break;
                default:
                    throw new IllegalStateException("esquerystudio.elasticsearch.console.delegate.mode 必须为 jwt / endpoint / header（留空=关闭委托），实际="
                            + console.auth.delegate.getMode());
            }
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    /** 重建锁参数（以 indexKey 为锁文档 _id 的 ES 文档锁）。 */
    public static class Lock {
        /** 是否启用分布式锁（默认 true）。单实例或测试场景可关。 */
        private boolean enabled = true;
        /** 锁索引名。默认空 → {@link ESQueryStudioConsoleAutoConfiguration} 的 resolveLockIndexName 按默认规则拼出（唯一推导处）。 */
        private String indexName = "";
        /** 默认租约毫秒数（须 ≥ orchestration.timeoutMs，否则长 reindex 会被中途强夺）。 */
        private long leaseMs = 3_600_000L;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getIndexName() { return indexName; }
        public void setIndexName(String indexName) { this.indexName = indexName; }
        public long getLeaseMs() { return leaseMs; }
        public void setLeaseMs(long leaseMs) { this.leaseMs = leaseMs; }
    }

    /** 编程式一键编排的轮询/超时参数。 */
    public static class Orchestration {
        /** reindex 进度轮询间隔毫秒。 */
        private long pollIntervalMs = 2_000L;
        /** 单次编排总超时毫秒（默认 30 分钟）。 */
        private long timeoutMs = 1_800_000L;

        public long getPollIntervalMs() { return pollIntervalMs; }
        public void setPollIntervalMs(long pollIntervalMs) { this.pollIntervalMs = pollIntervalMs; }
        public long getTimeoutMs() { return timeoutMs; }
        public void setTimeoutMs(long timeoutMs) { this.timeoutMs = timeoutMs; }
    }

    /** 写入重试参数。 */
    public static class Retry {
        /**
         * 最大尝试次数，<b>含首次</b>（不是「重试次数」）。
         *
         * <p>故 {@code 1} = 只调用一次 = <b>完全关闭重试</b>，这也是关闭重试的<b>唯一方式</b>
         * （本类刻意不设 {@code enabled}，避免两个开关语义重叠）。校验要求 {@code >= 1}。</p>
         */
        private int maxAttempts = 5;
        /** 首次退避毫秒；须 ≤ {@link #maxBackoffMs}（越界在启动校验处拒绝）。 */
        private long initBackoffMs = 500L;
        /** 退避上限毫秒（指数退避逐次翻倍后封顶于此）。 */
        private long maxBackoffMs = 8_000L;

        public int getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
        public long getInitBackoffMs() { return initBackoffMs; }
        public void setInitBackoffMs(long initBackoffMs) { this.initBackoffMs = initBackoffMs; }
        public long getMaxBackoffMs() { return maxBackoffMs; }
        public void setMaxBackoffMs(long maxBackoffMs) { this.maxBackoffMs = maxBackoffMs; }
    }

    /** 控制台（面板+接口）安全参数（前缀 {@code esquerystudio.elasticsearch.console}）。 新增。 */
    public static class Console {
        private Auth auth = new Auth();
        private Security security = new Security();

        /** 控制台安全响应头配置（frame-ancestors 等；nosniff/no-store 无配置项恒生效）。 */
        public static class Security {
            /** iframe 嵌入白名单（CSP frame-ancestors 值）；空=不下发任何 frame 头
             *  ——同源 iframe 嵌入是声明特性，默认不限制可嵌域。 */
            private String frameAncestors = "";

            public String getFrameAncestors() { return frameAncestors; }
            public void setFrameAncestors(String frameAncestors) { this.frameAncestors = frameAncestors; }
        }

        public Security getSecurity() { return security; }
        public void setSecurity(Security security) { this.security = security; }
        /**  多集群连接档案索引名（存控制集群，密码只留服务端）。 */
        private String connIndexName = "esquerystudio_conn";
        /** MCP API key 索引名（控制集群；只存 SHA-256，不存明文）。 */
        private String mcpKeyIndexName = "esquerystudio_mcp_keys";
        /**  控制集群自举档案目录；空 → {@code ${user.home}/.esquerystudio/<appName>/}。 */
        private String homeDir = "";
        /**  控制集群解析模式：auto（自举档案→spring 探测→Setup 向导）/ spring（钉死宿主 ES，向导永不出现）。 */
        private String controlMode = "auto";
        /**  连接档案后台周期探活开关（列表/顶栏状态点数据源）。 */
        private boolean connProbeEnabled = true;
        /**  探活间隔秒（最小 10）。 */
        private int connProbeIntervalSeconds = 60;
        /**
         * .2 数据面是否暴露「宿主集群」目标。纯管理平台形态（宿主）设 false：
         * 控制集群降级为纯元数据存储，切换器只列自定义连接档案，后端同步拒绝 host 目标直捣。
         */
        private boolean hostClusterVisible = true;
        /**
         * 控制台元数据存储模式：{@code control-es}（默认，落控制集群 ES 索引）/
         * {@code jdbc}（落宿主 DataSource 的数据库表，适合拥有自己数据库的底座）/
         * {@code sqlite}（落本地 SQLite 库文件，见 {@link #sqlitePath}——零外部服务依赖，
         * 作业与审计重启后历史可查；classpath 缺 sqlite 驱动时回落 control-es 并 WARN）。
         * 影响<b>作业元数据与控制台操作审计</b>两处（两者同宿）；集群连接档案恒走控制集群；
         * 宿主自注册 AdhocJobStore/ConsoleOpsAuditStore Bean 则完全接管。
         */
        private String store = "control-es";
        /**
         * {@code store=sqlite} 时的本地库文件路径；空 → {@code ~/.esquerystudio/<appName>/jobs.db}
         * （与控制集群自举档案同目录）。仅 sqlite 档消费。
         */
        private String sqlitePath = "";
        /**
         * 未绑定首连初始化令牌（可选加固）：非空时 setup/test|apply 必须携带
         * {@code X-Setup-Token}，防止暴露在网络的未绑定实例被匿名绑定到攻击者集群。
         * 默认空=保持历史首连向导行为；委托部署仍以宿主 ADMIN 身份为准。
         */
        private String setupToken = "";
        /** 2.5.0 菜单 SPI：页面级授权（仅 delegated 身份 + 宿主下发 grantedPages 时生效）。 */
        private PageAuth pageAuth = new PageAuth();
        /** 连接中心自动同步参数(前缀 esquerystudio.elasticsearch.console.conn-sync,连接中心自动同步批)。 */
        private ConnSync connSync = new ConnSync();
        /** 20260922 监控快照落库参数（前缀 esquerystudio.elasticsearch.console.monitor）：服务端定时任务=唯一写入方。 */
        private Monitor monitor = new Monitor();

        public Auth getAuth() { return auth; }
        public void setAuth(Auth auth) { this.auth = auth; }
        public String getConnIndexName() { return connIndexName; }
        public void setConnIndexName(String connIndexName) { this.connIndexName = connIndexName; }
        public String getMcpKeyIndexName() { return mcpKeyIndexName; }
        public void setMcpKeyIndexName(String mcpKeyIndexName) { this.mcpKeyIndexName = mcpKeyIndexName; }
        public String getHomeDir() { return homeDir; }
        public void setHomeDir(String homeDir) { this.homeDir = homeDir; }
        public String getControlMode() { return controlMode; }
        public void setControlMode(String controlMode) { this.controlMode = controlMode; }
        public boolean isConnProbeEnabled() { return connProbeEnabled; }
        public void setConnProbeEnabled(boolean connProbeEnabled) { this.connProbeEnabled = connProbeEnabled; }
        public int getConnProbeIntervalSeconds() { return connProbeIntervalSeconds; }
        public void setConnProbeIntervalSeconds(int connProbeIntervalSeconds) { this.connProbeIntervalSeconds = connProbeIntervalSeconds; }
        public boolean isHostClusterVisible() { return hostClusterVisible; }
        public void setHostClusterVisible(boolean hostClusterVisible) { this.hostClusterVisible = hostClusterVisible; }
        public String getSetupToken() { return setupToken; }
        public void setSetupToken(String setupToken) { this.setupToken = setupToken; }
        public String getStore() { return store; }
        public void setStore(String store) { this.store = store; }
        public String getSqlitePath() { return sqlitePath; }
        public void setSqlitePath(String sqlitePath) { this.sqlitePath = sqlitePath; }
        public PageAuth getPageAuth() { return pageAuth; }
        public void setPageAuth(PageAuth pageAuth) { this.pageAuth = pageAuth; }
        public ConnSync getConnSync() { return connSync; }
        public void setConnSync(ConnSync connSync) { this.connSync = connSync; }
        public Monitor getMonitor() { return monitor; }
        public void setMonitor(Monitor monitor) { this.monitor = monitor; }
    }

    /**
     * 监控快照落库参数（前缀 {@code esquerystudio.elasticsearch.console.monitor}，20260922）：
     * 多集群监控历史的唯一写入方是服务端定时任务——每轮把全部连接的最近探活结果
     * （连通/时延/版本）落控制集群 ES 的 {@code esquerystudio_monitor-yyyy.MM.dd}
     * 日期索引，与审计共用双闸环形清理（合计不超总量上限）。用户页面轮询只读不入库。
     */
    public static class Monitor {
        /** 总开关（默认 true）：false=不启动监控落库调度（探活展示不受影响）。 */
        private boolean enabled = true;
        /** 落库节奏秒（默认 60，下限钳 10；与探活间隔解耦可独立调整）。 */
        private int intervalSeconds = 60;
        /** 指标采集节奏秒（指标时序批：默认 60，下限 30 由采集器侧钳制；与探活落库解耦可独立调整）。 */
        private int metricsIntervalSeconds = 60;
        /** 监控日期索引前缀（查询/清理打 {@code <前缀>-*}）。 */
        private String indexName = "esquerystudio_monitor";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public int getIntervalSeconds() { return intervalSeconds; }
        public void setIntervalSeconds(int intervalSeconds) { this.intervalSeconds = intervalSeconds; }
        public int getMetricsIntervalSeconds() { return metricsIntervalSeconds; }
        public void setMetricsIntervalSeconds(int metricsIntervalSeconds) { this.metricsIntervalSeconds = metricsIntervalSeconds; }
        public String getIndexName() { return indexName; }
        public void setIndexName(String indexName) { this.indexName = indexName; }
    }

    /**
     * 控制台页面级授权参数（前缀 {@code esquerystudio.elasticsearch.console.page-auth}）。2.5.0 菜单 SPI 新增。
     *
     * <p>仅对 delegated 身份且宿主下发了 grantedPages 的请求生效；内置身份 / 宿主未下发 / 本开关关闭
     * 时退化为  三档角色拦截，行为与 2.4.0 完全一致（向后兼容）。</p>
     */
    public static class PageAuth {
        /** 页面级授权开关（默认 true）。false = 逃生阀：线上异常时紧急回退纯角色档，无需回滚版本。 */
        private boolean enabled = true;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }

    /**
     * 连接中心自动同步参数(前缀 {@code esquerystudio.elasticsearch.console.conn-sync},连接中心自动同步批)。
     * 双门:宿主注册 {@code ClusterConnContributor} Bean <b>且</b> {@code enabled=true} 才启用;
     * 任一缺席=零行为(不建线程、不落库),与审计 SPI「不注册零影响」同哲学。
     */
    public static class ConnSync {
        /** 总开关(默认 false)。 */
        private boolean enabled = false;
        /** 同步周期秒(引擎侧下限钳 60):默认 3600 对齐连接中心 1h 快照节奏。 */
        private int intervalSeconds = 3600;
        /** 启动后首跑延迟秒。 */
        private int initialDelaySeconds = 30;
        /** 同步档案默认 minRole(贡献者未显式给时)。 */
        private String minRole = "VIEWER";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public int getIntervalSeconds() { return intervalSeconds; }
        public void setIntervalSeconds(int intervalSeconds) { this.intervalSeconds = intervalSeconds; }
        public int getInitialDelaySeconds() { return initialDelaySeconds; }
        public void setInitialDelaySeconds(int initialDelaySeconds) { this.initialDelaySeconds = initialDelaySeconds; }
        public String getMinRole() { return minRole; }
        public void setMinRole(String minRole) { this.minRole = minRole; }
    }

    /** 控制台鉴权参数（前缀 {@code esquerystudio.elasticsearch.console.auth}）。 */
    public static class Auth {
        /** 是否启用控制台鉴权（默认 true；关闭后恢复  及以前的裸奔行为，仅限内网/演示）。 */
        private boolean enabled = true;
        /** 兜底默认账号：仅当用户索引一个账号都没有时可登录（角色 ADMIN）。 */
        private String fallbackUsername = "admin";
        /** 兜底默认密码。 */
        private String fallbackPassword = "esquerystudio";
        /** token 有效期毫秒（默认 12 小时）。 */
        private long tokenTtlMs = 43_200_000L;
        /** token HMAC secret；空 → 启动随机生成（重启后需重新登录；多实例部署必须显式配置保证互通）。 */
        private String tokenSecret = "";
        /** 连接档案凭据加密密钥（base64 的 32 字节 AES-256）；空 → 自动生成并落
         *  自举档案目录 conn.key（单实例零配置；多实例必须显式配置共享同一密钥，
         *  否则各实例互相解不开对方加密的档案）。存量明文档案读取透明兼容，
         *  再次保存时自动升级为密文。 */
        private String connSecret = "";
        /** 控制台用户索引名。 */
        private String userIndexName = "esquerystudio_user";
        /** 控制台操作审计索引名：环形开启时为「日期索引前缀」，关闭时为固定单索引名。 */
        private String opsAuditIndexName = "esquerystudio_ops_audit";
        /** 20260922 环形保留约定（统一只用控制集群 ES 单载体）：按日索引 + 双闸清理。 */
        private AuditRetention auditRetention = new AuditRetention();
        /**
         * 宿主审计并入开关（裁决<b>默认关</b>）：开启后宿主注册的
         * ConsoleAuditContributor 记录才并入控制台审计视图（原「注册即生效」语义）。
         * 关闭理由：宿主侧记录多为匿名登录族（trusted-login 时无会话切面，username 结构性
         * null），非本控制台请求进控制台审计视图不可读也不可追责。
         */
        private boolean hostAuditMerge = false;
        /**  配置式宿主鉴权委托（零 Java 代码对接，代码 SPI Bean 优先）。 */
        private Delegate delegate = new Delegate();
        /**
         * 内置账号登录总开关（三态，默认 null=自动）。
         *
         * <p>自动语义：<b>未配置宿主委托（delegate）时开启</b>（独立部署靠内置账号登录）；
         * <b>配置了任何宿主委托时关闭</b>——否则默认兜底账号 admin/esquerystudio 会通过
         * 免鉴权的 /auth/login 拿到本地 ADMIN（grantedPages=null，绕过全部页面门），
         * 等于给宿主鉴权开了一个永久后门。</p>
         *
         * <p>true=强制开启（旧部署兼容逃生阀，启动会 ERROR 告警）；false=强制关闭。</p>
         */
        private Boolean builtinLoginEnabled = null;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getFallbackUsername() { return fallbackUsername; }
        public void setFallbackUsername(String fallbackUsername) { this.fallbackUsername = fallbackUsername; }
        public String getFallbackPassword() { return fallbackPassword; }
        public void setFallbackPassword(String fallbackPassword) { this.fallbackPassword = fallbackPassword; }
        public long getTokenTtlMs() { return tokenTtlMs; }
        public void setTokenTtlMs(long tokenTtlMs) { this.tokenTtlMs = tokenTtlMs; }
        public String getTokenSecret() { return tokenSecret; }
        public void setTokenSecret(String tokenSecret) { this.tokenSecret = tokenSecret; }
        public String getConnSecret() { return connSecret; }
        public void setConnSecret(String connSecret) { this.connSecret = connSecret; }
        public String getUserIndexName() { return userIndexName; }
        public void setUserIndexName(String userIndexName) { this.userIndexName = userIndexName; }
        public String getOpsAuditIndexName() { return opsAuditIndexName; }
        public void setOpsAuditIndexName(String opsAuditIndexName) { this.opsAuditIndexName = opsAuditIndexName; }
        public AuditRetention getAuditRetention() { return auditRetention; }
        public void setAuditRetention(AuditRetention auditRetention) { this.auditRetention = auditRetention; }
        public boolean isHostAuditMerge() { return hostAuditMerge; }
        public void setHostAuditMerge(boolean hostAuditMerge) { this.hostAuditMerge = hostAuditMerge; }
        public Delegate getDelegate() { return delegate; }
        public void setDelegate(Delegate delegate) { this.delegate = delegate; }
        public Boolean getBuiltinLoginEnabled() { return builtinLoginEnabled; }
        public void setBuiltinLoginEnabled(Boolean builtinLoginEnabled) { this.builtinLoginEnabled = builtinLoginEnabled; }
    }

    /**
     * 审计环形保留参数（前缀 {@code esquerystudio.elasticsearch.console.auth.audit-retention}，20260922）：
     * 统一只用控制集群 ES 单载体的环形约定——审计写 {@code <索引名前缀>-yyyy.MM.dd}
     * 按日索引，{@link io.github.dengmeiluan.esquerystudio.console.auth.AuditIndexRetentionSweeper} 按
     * 双闸（超龄 + 总量）整索引删最旧。{@code enabled=false} 一键回到旧固定单索引行为
     * （既不滚动也不清理），是发版期的回退开关。
     */
    public static class AuditRetention {
        /** 总开关（默认 true）：审计按日环形写 + 周期双闸清理；false=旧固定单索引行为。 */
        private boolean enabled = true;
        /** 超龄闸（天）：严格早于「今天-N 天」的日期索引整索引删除（恰好第 N 天保留）。 */
        private long maxDays = 90;
        /** 总量闸（字节）：日期索引族 store.size 合计上限，超限从最旧删起（默认 30GB）。 */
        private long maxTotalBytes = 30L * 1024L * 1024L * 1024L;
        /** 演练模式：清理轮只记待删清单不执行删除（上线初期观察面）。 */
        private boolean dryRun = false;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public long getMaxDays() { return maxDays; }
        public void setMaxDays(long maxDays) { this.maxDays = maxDays; }
        public long getMaxTotalBytes() { return maxTotalBytes; }
        public void setMaxTotalBytes(long maxTotalBytes) { this.maxTotalBytes = maxTotalBytes; }
        public boolean isDryRun() { return dryRun; }
        public void setDryRun(boolean dryRun) { this.dryRun = dryRun; }
    }

    /**
     *  配置式宿主鉴权委托（前缀 {@code esquerystudio.elasticsearch.console.auth.delegate}）：
     * 不写一行 Java 即可把控制台登录接到宿主凭据体系。mode 不配 = 不启用；
     * 宿主若注册了 {@code ConsoleAuthDelegate} 代码 SPI Bean，代码 SPI 优先（本配置被忽略）。
     */
    public static class Delegate {
        /** 委托模式：jwt（本地验签）/ endpoint（回调宿主校验接口）/ header（信任网关注入头）；不配 = 不启用。 */
        private String mode = "";
        /** 携带宿主凭据的请求头（jwt/endpoint 模式取 token 用；Bearer 前缀自动剥离）。 */
        private String tokenHeader = "Authorization";
        private Jwt jwt = new Jwt();
        private Endpoint endpoint = new Endpoint();
        private Header header = new Header();
        /** 角色映射：console 角色 → 宿主角色逗号串（如 ADMIN=admin,superuser）；宿主角色未命中一律 VIEWER。 */
        private java.util.Map<String, String> roleMapping = new java.util.LinkedHashMap<>();

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public String getTokenHeader() { return tokenHeader; }
        public void setTokenHeader(String tokenHeader) { this.tokenHeader = tokenHeader; }
        public Jwt getJwt() { return jwt; }
        public void setJwt(Jwt jwt) { this.jwt = jwt; }
        public Endpoint getEndpoint() { return endpoint; }
        public void setEndpoint(Endpoint endpoint) { this.endpoint = endpoint; }
        public Header getHeader() { return header; }
        public void setHeader(Header header) { this.header = header; }
        public java.util.Map<String, String> getRoleMapping() { return roleMapping; }
        public void setRoleMapping(java.util.Map<String, String> roleMapping) { this.roleMapping = roleMapping; }

        /** jwt 模式：本地验签宿主 JWT（HS256 共享密钥 / RS256 公钥二选一）。 */
        public static class Jwt {
            /** HS256 共享密钥（支持 ${ENV} 引用）。 */
            private String secret = "";
            /** RS256 PEM 公钥（与 secret 二选一，两者都配以 alg 为准）。 */
            private String publicKey = "";
            /** 用户名 claim（支持 a.b.c 点分路径）。 */
            private String usernameClaim = "sub";
            /** 角色 claim（支持 a.b.c 点分路径；值为数组或逗号串）。 */
            private String rolesClaim = "roles";
            /** 展示名 claim（点分路径，如 name / user.nickname）；空 = 不取，顶栏回落 username。 */
            private String displayNameClaim = "";
            /**
             * 是否强制要求 {@code exp}（默认 true）：缺 exp 的令牌等同永久凭证，生产必须拒绝。
             * 旧宿主未签发 exp 时可显式置 false 兼容（启动会 WARN），但字符串/非数值 exp 始终拒绝。
             */
            private boolean requireExp = true;

            public String getSecret() { return secret; }
            public void setSecret(String secret) { this.secret = secret; }
            public String getPublicKey() { return publicKey; }
            public void setPublicKey(String publicKey) { this.publicKey = publicKey; }
            public String getUsernameClaim() { return usernameClaim; }
            public void setUsernameClaim(String usernameClaim) { this.usernameClaim = usernameClaim; }
            public String getRolesClaim() { return rolesClaim; }
            public void setRolesClaim(String rolesClaim) { this.rolesClaim = rolesClaim; }
            public String getDisplayNameClaim() { return displayNameClaim; }
            public void setDisplayNameClaim(String displayNameClaim) { this.displayNameClaim = displayNameClaim; }
            public boolean isRequireExp() { return requireExp; }
            public void setRequireExp(boolean requireExp) { this.requireExp = requireExp; }
        }

        /** endpoint 模式：把凭据转发宿主校验接口，2xx 即认。 */
        public static class Endpoint {
            /** 宿主校验接口 URL（POST）。 */
            private String verifyUrl = "";
            /** 透传请求头白名单（逗号分隔；默认只透传 token-header）。 */
            private String forwardHeaders = "";
            /** 返回 JSON 里用户名字段路径（a.b.c）。 */
            private String usernamePath = "username";
            /** 返回 JSON 里角色字段路径（数组或逗号串）。 */
            private String rolesPath = "roles";
            /** 返回 JSON 里展示名字段路径（；空 = 不取。 */
            private String displayNamePath = "";
            /** 校验结果短缓存秒数（按 token 缓存，降低宿主接口压力）。 */
            private int cacheSeconds = 30;

            public String getVerifyUrl() { return verifyUrl; }
            public void setVerifyUrl(String verifyUrl) { this.verifyUrl = verifyUrl; }
            public String getForwardHeaders() { return forwardHeaders; }
            public void setForwardHeaders(String forwardHeaders) { this.forwardHeaders = forwardHeaders; }
            public String getUsernamePath() { return usernamePath; }
            public void setUsernamePath(String usernamePath) { this.usernamePath = usernamePath; }
            public String getRolesPath() { return rolesPath; }
            public void setRolesPath(String rolesPath) { this.rolesPath = rolesPath; }
            public String getDisplayNamePath() { return displayNamePath; }
            public void setDisplayNamePath(String displayNamePath) { this.displayNamePath = displayNamePath; }
            public int getCacheSeconds() { return cacheSeconds; }
            public void setCacheSeconds(int cacheSeconds) { this.cacheSeconds = cacheSeconds; }
        }

        /** header 模式：信任网关/上游代理注入的身份头（必须配合网关剥离外部同名头，否则可伪造）。 */
        public static class Header {
            /** 用户名头（非空即信任）。 */
            private String userHeader = "";
            /** 角色头（逗号分隔，经 role-mapping 映射）。 */
            private String rolesHeader = "";
            /** 展示名头（；值若经 URL 编码可携中文，服务端自动解码）；空 = 不取。 */
            private String displayNameHeader = "";
            /** 受信代理清单（精确 IP 或 CIDR，如 10.0.0.5,10.8.0.0/16）。非空时身份头仅在
             * remoteAddr 命中清单时被采信（推荐：显式网关地址，私网整体信任面收窄到具体代理）；
             * 留空维持默认行为（回环/私网/链路本地即信）。 */
            private java.util.List<String> trustedProxies = java.util.Collections.emptyList();

            public String getUserHeader() { return userHeader; }
            public void setUserHeader(String userHeader) { this.userHeader = userHeader; }
            public String getRolesHeader() { return rolesHeader; }
            public void setRolesHeader(String rolesHeader) { this.rolesHeader = rolesHeader; }
            public String getDisplayNameHeader() { return displayNameHeader; }
            public void setDisplayNameHeader(String displayNameHeader) { this.displayNameHeader = displayNameHeader; }
            public java.util.List<String> getTrustedProxies() { return trustedProxies; }
            public void setTrustedProxies(java.util.List<String> trustedProxies) {
                this.trustedProxies = trustedProxies == null
                        ? java.util.Collections.emptyList() : trustedProxies; }
        }
    }

    /**
     *  启动期索引配置校验（前缀 {@code esquerystudio.elasticsearch.config-validation}）：
     * 对所有注册 provider 实体的 @Setting/@Mapping JSON 做 L1 静态 Lint + L2 临时索引 Dry-run，
     * 把「代码里写错索引配置、发到服务上建索引才炸」提前到启动那一刻暴露。
     */
    public static class ConfigValidation {
        /** strict=确定性配置错误挡启动（默认，傻瓜化狠模式）/ warn=只告警 / off=关闭 */
        private String mode = "strict";
        /** 启动期是否追加 L2 dry-run（临时索引试建）；ES 不可达按可用性问题降级 WARN，不误杀启动 */
        private boolean dryRunOnStartup = true;

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public boolean isDryRunOnStartup() { return dryRunOnStartup; }
        public void setDryRunOnStartup(boolean dryRunOnStartup) { this.dryRunOnStartup = dryRunOnStartup; }
    }

    /** 启动期索引映射对账参数（前缀 {@code esquerystudio.elasticsearch.mapping}）。 */
    public static class Mapping {
        /** 自动注册时机：startup（默认）/ off。 */
        private String autoRegister = "startup";
        /** 映射冲突处理策略：fail（默认）/ warn。 */
        private String conflictPolicy = "fail";
        /** 目标索引不存在时的处理策略：skip（默认）/ fail。 */
        private String missingIndexPolicy = "skip";

        public String getAutoRegister() { return autoRegister; }
        public void setAutoRegister(String autoRegister) { this.autoRegister = autoRegister; }
        public String getConflictPolicy() { return conflictPolicy; }
        public void setConflictPolicy(String conflictPolicy) { this.conflictPolicy = conflictPolicy; }
        public String getMissingIndexPolicy() { return missingIndexPolicy; }
        public void setMissingIndexPolicy(String missingIndexPolicy) { this.missingIndexPolicy = missingIndexPolicy; }
    }

    /** 跨集群迁移（客户端 scroll+bulk）参数（前缀 {@code esquerystudio.elasticsearch.migrate}）。 */
    public static class Migrate {
        /** 迁移能力子开关（与 web-enabled 同时为 true 才暴露接口/面板）。 */
        private boolean enabled = true;
        /** sliced scroll 路数 / worker 数（建议 ≈ 源索引主分片数）。 */
        private int defaultSlices = 4;
        /** 每 scroll/bulk 批大小。 */
        private int defaultBatchSize = 2000;
        /** scroll 上下文存活秒。 */
        private int scrollKeepAliveSec = 120;
        /** 临时旧集群 client 连接超时毫秒。 */
        private int connectTimeoutMs = 5000;
        /** 临时旧集群 client socket 超时毫秒。 */
        private int socketTimeoutMs = 60000;
        /** 迁移作业索引名（空→由 MigrateJobES 的 @Document SpEL 拼 ${POLARDB_PROFILES_ACTIVE}${spring.application.name}_esquerystudio_migrate_job）。 */
        private String jobIndexName = "";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public int getDefaultSlices() { return defaultSlices; }
        public void setDefaultSlices(int defaultSlices) { this.defaultSlices = defaultSlices; }
        public int getDefaultBatchSize() { return defaultBatchSize; }
        public void setDefaultBatchSize(int defaultBatchSize) { this.defaultBatchSize = defaultBatchSize; }
        public int getScrollKeepAliveSec() { return scrollKeepAliveSec; }
        public void setScrollKeepAliveSec(int scrollKeepAliveSec) { this.scrollKeepAliveSec = scrollKeepAliveSec; }
        public int getConnectTimeoutMs() { return connectTimeoutMs; }
        public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }
        public int getSocketTimeoutMs() { return socketTimeoutMs; }
        public void setSocketTimeoutMs(int socketTimeoutMs) { this.socketTimeoutMs = socketTimeoutMs; }
        public String getJobIndexName() { return jobIndexName; }
        public void setJobIndexName(String jobIndexName) { this.jobIndexName = jobIndexName; }
    }

    public boolean isWebEnabled() { return webEnabled; }
    public void setWebEnabled(boolean webEnabled) { this.webEnabled = webEnabled; }
    public String getVersionFormat() { return versionFormat; }
    public void setVersionFormat(String versionFormat) { this.versionFormat = versionFormat; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public Retry getRetry() { return retry; }
    public void setRetry(Retry retry) { this.retry = retry; }
    public Lock getLock() { return lock; }
    public void setLock(Lock lock) { this.lock = lock; }
    public Orchestration getOrchestration() { return orchestration; }
    public void setOrchestration(Orchestration orchestration) { this.orchestration = orchestration; }
    public Migrate getMigrate() { return migrate; }
    public void setMigrate(Migrate migrate) { this.migrate = migrate; }
    public Console getConsole() { return console; }
    public void setConsole(Console console) { this.console = console; }

    public ConfigValidation getConfigValidation() { return configValidation; }
    public void setConfigValidation(ConfigValidation configValidation) { this.configValidation = configValidation; }

    public Mapping getMapping() { return mapping; }
    public void setMapping(Mapping mapping) { this.mapping = mapping; }

    public Adhoc getAdhoc() { return adhoc; }
    public void setAdhoc(Adhoc adhoc) { this.adhoc = adhoc; }

    /** Adhoc 托管重建参数（前缀 {@code esquerystudio.elasticsearch.adhoc}）。 新增。 */
    public static class Adhoc {

        /** 等待超时上限（7 天）：再大就会让 deadline 计算溢出，反而立刻超时。 */
        public static final long MAX_CONFIRM_TIMEOUT_MS = 7L * 24 * 60 * 60 * 1000;

        /**
         * 人工确认切换的等待超时（毫秒），默认 30 分钟。
         *
         * <p>超时后按 abort 处理，且对 WRITE_BLOCK 策略<b>强制解除写阻断</b> ——
         * 绝不允许一个 worker 线程无限期挂着，更不允许业务因为「人忘了点确认」而永久写不进。</p>
         */
        private long confirmTimeoutMs = 1_800_000L;

        public long getConfirmTimeoutMs() { return confirmTimeoutMs; }
        public void setConfirmTimeoutMs(long confirmTimeoutMs) { this.confirmTimeoutMs = confirmTimeoutMs; }
    }

    public Compat getCompat() { return compat; }
    public void setCompat(Compat compat) { this.compat = compat; }

    /**  date 兼容开关（前缀 {@code esquerystudio.elasticsearch.compat}）。 */
    public static class Compat {

        /**
         * 是否注册 epoch↔日期转换器，默认 <b>false</b>（不装）。
         *
         * <p><b>⚠ 它救不了带日期注解的字段</b>：带
         * {@code @Field(type = FieldType.Date, format = ...)} 的属性由 sdes 安装的
         * <b>属性级</b>转换器接管，抢在本开关注册的 {@code ElasticsearchCustomConversions}
         * 之前生效。对这类字段<b>打开开关什么也不会发生，而且不报错</b> ——
         * 使用者很容易误以为已经修好。这类字段应改 {@code @Field(format = ...)}
         * 或把实体类型换成 {@code Long} 自行转换。（ES 6.7.2 实测）</p>
         *
         * <p>能救的是<b>不带</b>日期注解、而存储形态是 epoch 数值的
         * {@code Timestamp} / {@code Date} / {@code Instant} 字段。</p>
         *
         * <p>写侧：实测为 no-op（sdes 4.0.9 本就把 {@code Timestamp} 写成 epoch 毫秒），
         * 故开启<b>不会</b>改变既有写出形态，也不会制造「多形态并存」。</p>
         */
        private boolean dateConverters = false;

        public boolean isDateConverters() { return dateConverters; }
        public void setDateConverters(boolean dateConverters) { this.dateConverters = dateConverters; }
    }
}
