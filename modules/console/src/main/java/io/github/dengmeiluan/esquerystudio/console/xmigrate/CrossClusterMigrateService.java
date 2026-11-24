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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import io.github.dengmeiluan.esquerystudio.console.multicluster.HostEsVersionProvider;
import org.elasticsearch.action.admin.indices.refresh.RefreshRequest;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * 跨集群迁移编排：客户端 scroll 读旧集群 + bulk {@code op_type=create} 写新集群。
 *
 * <p>与同集群「零停机重建」完全解耦：独立作业索引、独立线程模型，不取重建锁、不碰别名/写阻塞/审计。</p>
 *
 * <p>线程模型：每次迁移建一个固定线程池跑 N 个 {@link SliceWorker}，另起一个监管线程 await 全部 worker 完成后
 * 统一收尾（还原 settings → refresh →（可选 forceMerge）→ 等 green → 落终态 → 关旧集群临时 client）。
 * {@code start/resume} 立即返回 jobId，进度异步推进、持久化到新集群 ES 供面板轮询。</p>
 */
public class CrossClusterMigrateService implements io.github.dengmeiluan.esquerystudio.console.mcp.McpMigrateService {

    private static final Logger logger = LoggerFactory.getLogger(CrossClusterMigrateService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 进度持久化节流（毫秒）：减少 worker 高频写作业索引。 */
    private static final long PERSIST_THROTTLE_MS = 1500L;

    /** 请求侧切片/批量上限：slices 直接映射线程池大小、batch 直传 scroll size——
     *  不钳制时一次请求即可建十万线程（认证后的资源耗尽面）。 */
    private static final int MAX_SLICES = 32;
    private static final int MAX_BATCH_SIZE = 10_000;

    /**
     * preflight 预计耗时用的经验速率（条/秒）：粗估常数（按典型调优档观测的量级取整），
     * 仅供启动确认弹层展示量级，不参与任何控制决策；实际速率随集群负载与文档大小波动。
     */
    static final long EST_RATE_AGGRESSIVE_PER_SEC = 10_000L;
    static final long EST_RATE_GENTLE_PER_SEC = 3_000L;

    /** 捕获/还原的目标索引动态 settings 键。 */
    private static final String K_REFRESH = "index.refresh_interval";
    private static final String K_REPLICAS = "index.number_of_replicas";
    private static final String K_TRANSLOG_DURABILITY = "index.translog.durability";
    private static final String K_FLUSH_THRESHOLD = "index.translog.flush_threshold_size";

    private final java.util.function.Supplier<RestHighLevelClient> localClient;
    private final EsIndexAdmin localAdmin;
    private final RemoteEsClientFactory remoteClientFactory;
    private final MigrateJobTracker tracker;
    private final RunningMigrations running;
    private final IndexMetaRegistry indexMetaRegistry;
    private final ESQueryStudioElasticsearchProperties properties;
    private final Environment environment;
    /** 台账 #69：目标（宿主）集群版本探测；null 表示未注入，守卫按「未知」处理——不假装已知。 */
    private final HostEsVersionProvider hostVersionProvider;
    /** 结构同步（自适应兼容剔除）：与迁移共用源/目标 client 形态，组合委托。 */
    private final StructureSyncService structureSync;

    /** 本地 client 改 Supplier 懒解析（宿主零 ES 依赖形态下经 ControlClusterResolver 供给）。 */
    public CrossClusterMigrateService(java.util.function.Supplier<RestHighLevelClient> localClient, EsIndexAdmin localAdmin,
                                      RemoteEsClientFactory remoteClientFactory, MigrateJobTracker tracker,
                                      RunningMigrations running, IndexMetaRegistry indexMetaRegistry,
                                      ESQueryStudioElasticsearchProperties properties, Environment environment,
                                      HostEsVersionProvider hostVersionProvider) {
        this.localClient = localClient;
        this.localAdmin = localAdmin;
        this.remoteClientFactory = remoteClientFactory;
        this.tracker = tracker;
        this.running = running;
        this.indexMetaRegistry = indexMetaRegistry;
        this.properties = properties;
        this.environment = environment;
        this.hostVersionProvider = hostVersionProvider;
        this.structureSync = new StructureSyncService(localClient, localAdmin, remoteClientFactory);
    }

    // ---------------------------------------------------------------- 环境变量解析

    /**
     * 把连接里的"变量名引用 / {@code ${表达式}}"解析为真实字面值（从本进程 Spring {@link Environment}：
     * OS env + 已加载 nacos 共享配置 + 应用属性）。密码在此解析、仅服务端使用，绝不回显。
     */
    private RemoteClusterConn resolveConn(RemoteClusterConn in) {
        if (in == null) {
            throw new IllegalArgumentException("缺少旧集群连接信息 conn");
        }
        RemoteClusterConn out = new RemoteClusterConn();
        String scheme = resolveField(in.getScheme(), null);
        out.setScheme(scheme == null || scheme.isEmpty() ? "http" : scheme);
        out.setHost(resolveField(in.getHost(), in.getHostRef()));
        out.setUsername(resolveField(in.getUsername(), in.getUserRef()));
        out.setPassword(resolveField(in.getPassword(), in.getPasswordRef()));
        Integer port = resolvePortField(in);
        out.setPort(port != null ? port : (in.getPort() > 0 ? in.getPort() : 9200));
        return out;
    }

    /** ref 只允许源连接相关变量，禁止借迁移预览读取任意 Spring/环境配置（如 datasource 密码）。 */
    private static boolean allowedRef(String ref) {
        if (ref == null) return false;
        String k = ref.trim();
        if (k.isEmpty()) return false;
        if (k.matches("(SOURCE|ES|MIGRATE)_[A-Z0-9_]+")) return true;
        /* 控制台鉴权/令牌配置属本应用秘密，迁移源连接解析面绝不开放（token-secret 泄露=可伪造 ADMIN）。
           仅保留迁移自身的连接参数域。 */
        return k.startsWith("esquerystudio.elasticsearch.migrate.");
    }

    private static boolean sensitiveRef(String ref) {
        if (ref == null) return false;
        String k = ref.toLowerCase(java.util.Locale.ROOT);
        return k.contains("password") || k.contains("passwd") || k.contains("secret")
                || k.contains("token") || k.contains("credential") || k.contains("apikey")
                || k.contains("accesskey") || k.contains("privatekey");
    }

    private static void requireAllowedPlaceholders(String literal) {
        if (literal == null || !literal.contains("${")) return;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\\$\\{([^}:]+)(?::[^}]*)?}").matcher(literal);
        while (m.find()) {
            if (!allowedRef(m.group(1))) {
                throw new IllegalArgumentException("变量引用不允许：" + m.group(1)
                        + "（仅允许 SOURCE_/ES_/MIGRATE_ 或 esquerystudio.elasticsearch.* 源连接变量）");
            }
        }
    }

    /** ref 非空→按名取属性；否则字面值含 {@code ${}} 则解析占位符；解析不出（残留 ${）返回 null。 */
    private String resolveField(String literal, String ref) {
        if (ref != null && !ref.trim().isEmpty()) {
            if (!allowedRef(ref)) {
                throw new IllegalArgumentException("变量引用不允许：" + ref
                        + "（仅允许 SOURCE_/ES_/MIGRATE_ 或 esquerystudio.elasticsearch.* 源连接变量）");
            }
            String v = environment.getProperty(ref.trim());
            return v == null || v.isEmpty() ? null : v;
        }
        if (literal == null || literal.isEmpty()) {
            return literal;
        }
        if (literal.contains("${")) {
            requireAllowedPlaceholders(literal);
            String resolved = environment.resolvePlaceholders(literal);
            return resolved.contains("${") ? null : resolved; // 残留占位符=未解析
        }
        return literal;
    }

    private Integer resolvePortField(RemoteClusterConn in) {
        if (in.getPortRef() == null || in.getPortRef().trim().isEmpty()) {
            return null; // 无 ref → 用字面 port
        }
        if (!allowedRef(in.getPortRef())) {
            throw new IllegalArgumentException("变量引用不允许：" + in.getPortRef());
        }
        String v = environment.getProperty(in.getPortRef().trim());
        if (v == null || v.isEmpty()) {
            return null;
        }
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            /* 不回声解析值：portRef 可能误指向秘密配置，报错文本同样会泄露。 */
            throw new IllegalArgumentException("portRef 解析出的值不是数字（值不回声）");
        }
    }

    /**
     * 解析预览：返回解析后的 scheme/host/port/username 与"密码是否已解析"，<b>绝不返回密码值</b>；
     * 列出未解析成功的字段供前端提示。
     */
    public Map<String, Object> resolvePreview(RemoteClusterConn raw) {
        RemoteClusterConn r = resolveConn(raw);
        Map<String, Object> out = new LinkedHashMap<>();
        boolean sensitiveScheme = containsSensitivePlaceholder(raw.getScheme());
        boolean sensitiveHost = sensitiveRef(raw.getHostRef()) || containsSensitivePlaceholder(raw.getHost());
        boolean sensitivePort = sensitiveRef(raw.getPortRef());
        out.put("scheme", sensitiveScheme ? null : r.getScheme());
        out.put("host", sensitiveHost ? null : r.getHost());
        out.put("port", sensitivePort ? null : r.getPort());
        boolean sensitiveUser = sensitiveRef(raw.getUserRef()) || containsSensitivePlaceholder(raw.getUsername());
        out.put("username", sensitiveUser ? null : r.getUsername());
        out.put("passwordResolved", r.getPassword() != null && !r.getPassword().isEmpty());
        List<String> unresolved = new ArrayList<>();
        if (sensitiveScheme) unresolved.add("scheme");
        if (sensitiveHost || r.getHost() == null || r.getHost().isEmpty()) {
            unresolved.add("host");
        }
        if (sensitivePort) unresolved.add("port");
        // 仅当用户给了 ref/${} 但没解析出来时，才把 user/password 记为未解析
        if (sensitiveUser || (refRequested(raw.getUserRef(), raw.getUsername())
                && (r.getUsername() == null || r.getUsername().isEmpty()))) {
            unresolved.add("username");
        }
        if (refRequested(raw.getPasswordRef(), raw.getPassword()) && (r.getPassword() == null || r.getPassword().isEmpty())) {
            unresolved.add("password");
        }
        out.put("unresolved", unresolved);
        return out;
    }

    private static boolean containsSensitivePlaceholder(String literal) {
        if (literal == null || !literal.contains("${")) return false;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\\$\\{([^}:]+)(?::[^}]*)?}").matcher(literal);
        while (m.find()) {
            if (sensitiveRef(m.group(1))) return true;
        }
        return false;
    }

    private boolean refRequested(String ref, String literal) {
        return (ref != null && !ref.trim().isEmpty()) || (literal != null && literal.contains("${"));
    }

    // ---------------------------------------------------------------- connect-check

    /**
     * 旧集群连通性自检：列出旧集群全部业务索引（name/health/docCount...），凭据走 body 不进 query/日志。
     */
    public List<Map<String, Object>> connectCheck(RemoteClusterConn conn) {
        RemoteClusterConn resolved = resolveConn(conn);
        try (RestHighLevelClient remote = remoteClientFactory.build(resolved)) {
            EsIndexAdmin admin = new EsIndexAdmin(remote.getLowLevelClient());
            List<Map<String, Object>> rows = admin.listClusterIndices();
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                if (!admin.isControlIndex(String.valueOf(row.get("index")))) out.add(row);
            }
            return out;
        } catch (Exception e) {
            /* 失败信息不回显远端集群内网地址（rank3 用户可达端点，拓扑指纹统一脱敏） */
            throw new IllegalStateException(io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper.sanitizeTopology(
                    "连接旧集群失败 [" + resolved.endpoint() + "]: " + rootMsg(e)));
        }
    }

    /**
     * 从旧集群读取指定索引的 mapping + settings（可编辑版），供前端预览/修改后再创建目标索引。
     * 返回 {"mapping": "...", "settings": "..."}，与 COPY_FROM_SOURCE 建索引用的 JSON 一致。
     */
    public Map<String, Object> fetchSourceConfig(RemoteClusterConn conn, String sourceIndex) {
        if (sourceIndex == null || sourceIndex.trim().isEmpty()) {
            throw new IllegalArgumentException("sourceIndex 不能为空");
        }
        localAdmin.guardExactDataIndex(sourceIndex.trim());
        RemoteClusterConn resolved = resolveConn(conn);
        try (RestHighLevelClient remote = remoteClientFactory.build(resolved)) {
            RestClient ll = remote.getLowLevelClient();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("mapping", fetchSourceMapping(ll, sourceIndex.trim()));
            result.put("settings", fetchSourceSettings(ll, sourceIndex.trim()));
            return result;
        } catch (Exception e) {
            throw new IllegalStateException("读取源索引配置失败 [" + resolved.endpoint() + "/" + sourceIndex + "]: " + rootMsg(e));
        }
    }

    /**
     * 结构同步（自适应兼容剔除）：读源索引 settings/mapping 后在目标（宿主）集群建索引，
     * 兼容矩阵预剔除 + 按目标真实报错逐轮兜底剔除非兼容 settings 键与自定义 analysis 组件、
     * 降级字段分词引用。见 {@link StructureSyncService}；本方法只负责源连接解析与委托。
     */
    public Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                             String fallbackAnalyzer) {
        return structureSync.syncStructure(resolveConn(conn), sourceIndex, destIndex, fallbackAnalyzer,
                false, false);
    }

    /** dry-run / 别名随迁形态：参数透传（报告 v2 见 {@link StructureSyncService#syncStructure}）。 */
    public Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                             String fallbackAnalyzer, boolean dryRun, boolean syncAliases) {
        return syncStructure(conn, sourceIndex, destIndex, fallbackAnalyzer, dryRun, syncAliases,
                null, null, null);
    }

    /**
     * 结构同步（v3 全参形态，报告契约见 {@link StructureSyncService#syncStructure}）：
     * 目标可经 {@code destConnId} 指定非宿主集群（null/空=宿主），执行可带
     * {@code expectPlanDigest} 拒绝源结构漂移后的过期计划。连接 id→档案的解析在
     * Web/MCP 层完成，本层只收已解析的 {@code destConn}（手输/档案均可，经与源同款
     * 的 {@link #resolveConn} 变量解析）。
     */
    public Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                             String fallbackAnalyzer, boolean dryRun, boolean syncAliases,
                                             String destConnId, RemoteClusterConn destConn,
                                             String expectPlanDigest) {
        return structureSync.syncStructure(resolveConn(conn), sourceIndex, destIndex, fallbackAnalyzer,
                dryRun, syncAliases, destConnId, destConn == null ? null : resolveConn(destConn),
                expectPlanDigest);
    }

    /**
     * 双侧集群能力对比（sync_structure 前置判读，只读）：风险矩阵（vendor_change /
     * plugin_missing / version_downgrade / shard_oversize）见
     * {@link StructureSyncService#compareCapabilities}。源侧连接同 {@link #syncStructure}
     * 口径；{@code destConn} null=目标走宿主集群。
     */
    public Map<String, Object> compareCapabilities(String srcConnId, RemoteClusterConn srcConn, String sourceIndex,
                                                   String destConnId, RemoteClusterConn destConn,
                                                   String destIndex) {
        return structureSync.compareCapabilities(srcConnId, resolveConn(srcConn), sourceIndex,
                destConnId, destConn == null ? null : resolveConn(destConn), destIndex);
    }

    /**
     * 双侧索引结构 diff（源结构 vs 目标既有索引，只读）：expectedRemovals 与 unexpected
     * 判定见 {@link StructureSyncService#diffStructure}。目标索引不存在时如实报错。
     */
    public Map<String, Object> diffStructure(RemoteClusterConn srcConn, String sourceIndex,
                                             RemoteClusterConn destConn, String destIndex) {
        return structureSync.diffStructure(resolveConn(srcConn), sourceIndex,
                destConn == null ? null : resolveConn(destConn), destIndex);
    }

    /**
     * 智能结构同步（smart_sync）统一入口：源/目标均为已存连接档案 id（目标 {@code host}=宿主集群，
     * <b>必填</b>——空值 IllegalArgumentException）。档案经 {@link #setConnProfileResolver} 注入的
     * 解析器取密（密码明文仅服务端流转）；{@code apply=false} 纯只读出计划（verdict=PLANNED），
     * {@code apply=true} 落盘（verdict=APPLIED；{@code expectPlanDigest} 非空且与当前计划摘要
     * 不一致时拒绝落盘=计划漂移）。兼容矩阵预剔除（planned 含规则溯源）、autoTune 分片收敛与
     * 报告契约见 {@link StructureSyncService#smartSync(String, RemoteClusterConn, String, String,
     * RemoteClusterConn, String, boolean, String, boolean, boolean, String)}。
     */
    public Map<String, Object> smartSync(String srcConnId, String sourceIndex, String destConnId, String destIndex,
                                         boolean syncAliases, String downgradedAnalyzerFallback,
                                         boolean autoTune, boolean apply, String expectPlanDigest) {
        String destId = destConnId == null ? "" : destConnId.trim();
        if (destId.isEmpty()) {
            throw new IllegalArgumentException("destConnId 不能为空（host=宿主集群，或填已存目标连接档案 id）");
        }
        String srcId = srcConnId == null ? "" : srcConnId.trim();
        if (srcId.isEmpty()) {
            throw new IllegalArgumentException("srcConnId 不能为空（smart_sync 需已存源连接档案）");
        }
        boolean host = "host".equalsIgnoreCase(destId);
        return structureSync.smartSync(srcId, resolveProfile(srcId), sourceIndex, destId,
                host ? null : resolveProfile(destId), destIndex, syncAliases, downgradedAnalyzerFallback,
                autoTune, apply, expectPlanDigest);
    }

    /** 连接档案解析器（id → 含密连接）：由持有 ConnStore 的装配层注入（Web Controller 构造时），
     * 供 {@link #verifyEquivalence(String, String, String, String, String, Integer, List, String, Integer)}
     * 的 id 形态在服务内完成档案解析；未注入时 id 形态明确报错（不静默降级）。 */
    private volatile java.util.function.Function<String, RemoteClusterConn> connProfileResolver;

    public void setConnProfileResolver(java.util.function.Function<String, RemoteClusterConn> resolver) {
        this.connProfileResolver = resolver;
    }

    /**
     * 迁移后等价性验证（verify_equivalence，只读）的统一入口：
     * <ul>
     * <li><b>jobId 形态</b>：从作业档案取 srcConnId/sourceIndex/destIndex（作业未记录源连接
     * 档案时拒绝——与 reconcile 同口径）；destConnId 仍可选（缺省/host=宿主集群）。</li>
     * <li><b>srcConnId+sourceIndex 形态</b>：同 sync_structure 的档案校验（srcConnId 必须是
     * 已存档案；destConnId 可选缺省宿主；destIndex 可选缺省 sourceIndex）。</li>
     * </ul>
     * 连接档案经 {@link #setConnProfileResolver} 注入的解析器取密（密码明文仅服务端流转）；
     * 作业归属（创建者本人或 ADMIN）与连接写键校验在 Web/MCP 调用层完成（与 resume 同口径）。
     * 参数钳制（sampleSize 默认 100 钳 10..500、aggSize 默认 10 钳 1..50）、对比语义与返回
     * 契约见 {@link StructureSyncService#verifyEquivalence}。
     */
    public Map<String, Object> verifyEquivalence(String jobId, String srcConnId, String sourceIndex,
            String destConnId, String destIndex, Integer sampleSize, List<String> sampleFields,
            String aggField, Integer aggSize) {
        if (jobId != null && !jobId.trim().isEmpty()) {
            MigrateJobES job = progress(jobId.trim());
            String jobSrc = job.getSrcConnId();
            if (jobSrc == null || jobSrc.trim().isEmpty()) {
                throw new IllegalArgumentException(
                        "该作业未记录源连接档案，无法验证（历史手输连接的作业不支持）: " + jobId.trim());
            }
            srcConnId = jobSrc;
            sourceIndex = job.getSourceIndex();
            destIndex = job.getDestIndex();
        }
        String connId = srcConnId == null ? "" : srcConnId.trim();
        if (connId.isEmpty()) {
            throw new IllegalArgumentException("srcConnId 不能为空（或提供 jobId 从作业档案取参）");
        }
        String destId = destConnId == null ? null
                : (destConnId.trim().isEmpty() || "host".equalsIgnoreCase(destConnId.trim())
                        ? null : destConnId.trim());
        return verifyEquivalence(resolveProfile(connId), sourceIndex, destId,
                destId == null ? null : resolveProfile(destId), destIndex,
                sampleSize, sampleFields, aggField, aggSize);
    }

    /** 已解析连接形态（Web 层完成档案解析与鉴权后透传）；核心对比委托
     * {@link StructureSyncService#verifyEquivalence}，源/目标连接均经 {@link #resolveConn}
     * 变量解析（与 syncStructure 同口径）。 */
    public Map<String, Object> verifyEquivalence(RemoteClusterConn srcConn, String sourceIndex,
            String destConnId, RemoteClusterConn destConn, String destIndex, Integer sampleSize,
            List<String> sampleFields, String aggField, Integer aggSize) {
        return structureSync.verifyEquivalence(resolveConn(srcConn), sourceIndex, destConnId,
                destConn == null ? null : resolveConn(destConn), destIndex,
                sampleSize, sampleFields, aggField, aggSize);
    }

    /** 已存连接档案取密（含明文密码，仅服务端流转）；解析器未装配/档案不存在明确报错。 */
    private RemoteClusterConn resolveProfile(String connId) {
        java.util.function.Function<String, RemoteClusterConn> resolver = connProfileResolver;
        if (resolver == null) {
            throw new IllegalStateException("连接档案解析器未装配（verifyEquivalence 的 id 形态需要 ConnStore 注入）: "
                    + connId);
        }
        RemoteClusterConn conn = resolver.apply(connId);
        if (conn == null) {
            throw new IllegalArgumentException("连接不存在或已被删除: " + connId);
        }
        return conn;
    }

    /**
     * 集群能力探测（MCP {@code probe_capabilities} / 预检复用）：对指定已存连接探测
     * 版本/发行版/厂商推断/插件清单/节点规模；{@code index} 给出时附索引画像
     * （别名/字节量/字段类型计数/分片与文档数，与 preflight 增强同源）。
     * {@code managed}=厂商非开源自建/未知（托管服务面）。
     */
    public Map<String, Object> probeCapabilities(RemoteClusterConn conn, String index) {
        RemoteClusterConn resolved = resolveConn(conn);
        try (RestHighLevelClient remote = remoteClientFactory.build(resolved)) {
            RestClient ll = remote.getLowLevelClient();
            Map<String, Object> out = new LinkedHashMap<>(StructureSyncService.probeCluster(
                    path -> performLowLevel(ll, new Request("GET", path))));
            if (index != null && !index.trim().isEmpty()) {
                out.putAll(indexProfile(ll, index.trim()));
            }
            out.put("managed", managedVendor(out));
            return out;
        } catch (Exception e) {
            throw new IllegalStateException(io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper
                    .sanitizeTopology("连接集群失败 [" + resolved.endpoint() + "]: " + rootMsg(e)), e);
        }
    }

    /** 宿主（目标）集群能力探测：connection=host 时使用；与 destIndices 同一道宿主可见性闸门。 */
    public Map<String, Object> probeHostCapabilities(String index) {
        if (!properties.getConsole().isHostClusterVisible()) {
            throw new IllegalStateException("宿主集群数据面已隐藏（host-cluster-visible=false），能力探测不可用");
        }
        try {
            RestClient ll = localClient.get().getLowLevelClient();
            Map<String, Object> out = new LinkedHashMap<>(StructureSyncService.probeCluster(
                    path -> performLowLevel(ll, new Request("GET", path))));
            if (index != null && !index.trim().isEmpty()) {
                localAdmin.guardExactDataIndex(index.trim());
                out.putAll(indexProfile(ll, index.trim()));
            }
            out.put("managed", managedVendor(out));
            return out;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("探测宿主集群能力失败: " + rootMsg(e), e);
        }
    }

    private static boolean managedVendor(Map<String, Object> probe) {
        Object vendor = probe.get("vendor");
        Object id = vendor instanceof Map ? ((Map<?, ?>) vendor).get("id") : null;
        return !"oss".equals(id) && !"unknown".equals(id);
    }

    /**
     * 索引画像（preflight 增强与 probe_capabilities 共用）：别名清单、存储字节量、
     * 字段类型计数、主分片数、文档数；各子项失败逐项置 null/空，不整体抛出。
     */
    private Map<String, Object> indexProfile(RestClient ll, String index) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<String> aliases = new ArrayList<>();
        try {
            Map<String, Object> root = performLowLevel(ll, new Request("GET", "/" + index + "/_alias"));
            Object first = root.isEmpty() ? null : root.values().iterator().next();
            Object aliasNode = first instanceof Map ? ((Map<?, ?>) first).get("aliases") : null;
            if (aliasNode instanceof Map) {
                aliases.addAll(((Map<?, ?>) aliasNode).keySet().stream()
                        .map(String::valueOf).collect(java.util.stream.Collectors.toList()));
            }
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] indexProfile aliases failed {}: {}", index, e.getMessage(), e);
        }
        out.put("sourceAliases", aliases);
        out.put("sourceBytes", readRemoteStoreBytes(ll, index));
        out.put("srcShards", readRemoteShardCount(ll, index));
        out.put("srcDocCount", countRemoteLowLevel(ll, index));
        try {
            String mappingJson = fetchSourceMapping(ll, index);
            out.put("fieldTypeCounts", fieldTypeCounts(mappingJson));
            out.put("formatlessDateFields", FormatlessDateFields.scan(mappingJson));
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] indexProfile mapping failed {}: {}", index, e.getMessage(), e);
            out.put("fieldTypeCounts", new LinkedHashMap<String, Object>());
            out.put("formatlessDateFields", new ArrayList<String>());
        }
        return out;
    }

    /** 源索引存储字节量（{@code _stats} 的 primaries.store.size_in_bytes）；读不到如实 null。 */
    private Long readRemoteStoreBytes(RestClient ll, String index) {
        try {
            Map<String, Object> root = performLowLevel(ll, new Request("GET", "/" + index + "/_stats"));
            Object all = root.get("_all");
            Object primaries = all instanceof Map ? ((Map<?, ?>) all).get("primaries") : null;
            Object store = primaries instanceof Map ? ((Map<?, ?>) primaries).get("store") : null;
            Object bytes = store instanceof Map ? ((Map<?, ?>) store).get("size_in_bytes") : null;
            return bytes instanceof Number ? ((Number) bytes).longValue() : null;
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] readRemoteStoreBytes failed {}: {}", index, e.getMessage(), e);
            return null;
        }
    }

    /** low-level {@code _count}（indexProfile 用；与 countRemote 同口径但复用已建连接）。 */
    private Long countRemoteLowLevel(RestClient ll, String index) {
        try {
            Map<String, Object> root = performLowLevel(ll, new Request("GET", "/" + index + "/_count"));
            Object cnt = root.get("count");
            return cnt instanceof Number ? ((Number) cnt).longValue() : null;
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] countRemoteLowLevel failed {}: {}", index, e.getMessage(), e);
            return null;
        }
    }

    /**
     * mapping 字段类型计数（{@code {type: N}}）：递归含嵌套对象与 multi-fields；
     * 无 type 的容器（object/nested 声明本身）不计。静态包内可见供测试直调。
     */
    static Map<String, Object> fieldTypeCounts(String mappingJson) {
        Map<String, Object> counts = new LinkedHashMap<>();
        if (mappingJson == null || mappingJson.trim().isEmpty()) {
            return counts;
        }
        try {
            Map<String, Object> body = OBJECT_MAPPER.readValue(mappingJson, Map.class);
            countFieldTypes(body, counts);
        } catch (Exception e) {
            // 解析失败返回空计数（预检尽力而为契约，不阻断）
            return new LinkedHashMap<>();
        }
        return counts;
    }

    @SuppressWarnings("unchecked")
    private static void countFieldTypes(Map<String, Object> node, Map<String, Object> counts) {
        if (node == null) {
            return;
        }
        Object properties = node.get("properties");
        if (properties instanceof Map) {
            for (Object child : ((Map<String, Object>) properties).values()) {
                if (child instanceof Map) {
                    Map<String, Object> field = (Map<String, Object>) child;
                    Object type = field.get("type");
                    if (type instanceof String) {
                        bump(counts, String.valueOf(type));
                    }
                    countFieldTypes(field, counts); // 嵌套对象下行
                    Object multi = field.get("fields");
                    if (multi instanceof Map) {
                        for (Object sub : ((Map<String, Object>) multi).values()) {
                            if (sub instanceof Map) {
                                Object subType = ((Map<String, Object>) sub).get("type");
                                if (subType instanceof String) {
                                    bump(counts, String.valueOf(subType));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private static void bump(Map<String, Object> counts, String type) {
        Object prev = counts.get(type);
        counts.put(type, (prev instanceof Number ? ((Number) prev).longValue() : 0L) + 1L);
    }

    // ---------------------------------------------------------------- start

    /**
     * 迁移前预检：目标索引是否已存在 + 规模预估。已存在时（COPY_FROM_SOURCE/FROM_ENTITY 会跳过建索引、
     * bulk op_type=create 幂等写），同名文档会被静默跳过，结果是「合并」——前端据此在启动确认弹层
     * 前置警告，避免「以为会清空重建、实际是合并」的数据安全误判。
     *
     * <p>预估字段（取不到都如实置 null/空，不阻断预检——预检的契约是尽力而为）：
     * {@code srcDocCount} 源 docs 数（{@code _count}，与 start 取 total 同口径）、
     * {@code srcShards} 源主分片数、{@code destShards} 目标主分片数（目标存在时才读）、
     * {@code estSeconds} 预计耗时（源 docs 数 ÷ 调优档经验速率，粗估）。</p>
     *
     * <p>增强字段：{@code sourceBytes} 源索引存储字节量、{@code fieldTypeCounts} 源 mapping
     * 字段类型计数、{@code sourceAliases} 源别名清单、{@code recommended}
     * （slices/batchSize/requestsPerSecond 启发式推荐）、{@code advice}
     * （formatless_date/version_gap/shard_oversize/alias_attached 中文建议）。conn 未填时
     * 源侧字段全部缺席（null/空），advice 里源侧判据同样缺席——不冒充已知。</p>
     */
    public Map<String, Object> preflight(MigrateRequest req) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sourceIndex", req.getSourceIndex());
        out.put("destIndex", req.getDestIndex());
        boolean destExists = false;
        try {
            destExists = localAdmin.indexExists(req.getDestIndex());
        } catch (java.io.IOException e) {
            // 预检失败不阻断启动，仅不展示 dest 警告（静默降级补 WARN，运维留痕）
            logger.warn("[CrossClusterMigrateService] preflight indexExists failed dest={}: {}",
                    req.getDestIndex(), e.getMessage(), e);
        }
        out.put("destExists", destExists);

        /* 源侧规模预估：conn 未填（表单早段/仅带 srcConnId）属常态，静默跳过；
           已填但取数失败（连通/凭据问题）落 WARN，字段置 null 如实表达未知。 */
        Map<String, Object> profile = null;
        String sourceVersion = null;
        String sourceVendor = null;
        boolean vendorPrivateSettings = false;
        if (req.getConn() != null) {
            try (RestHighLevelClient remote = remoteClientFactory.build(resolveConn(req.getConn()))) {
                RestClient ll = remote.getLowLevelClient();
                profile = indexProfile(ll, req.getSourceIndex());
                sourceVersion = readRemoteVersion(ll);
                /* 兼容预警轻量探测：源厂商推断 + 源 settings 厂商私有前缀扫描（不跑全量矩阵） */
                sourceVendor = vendorIdOf(StructureSyncService.probeCluster(
                        path -> performLowLevel(ll, new Request("GET", path))));
                vendorPrivateSettings = hasVendorPrivateSettings(readRemoteFlatSettings(ll, req.getSourceIndex()));
            } catch (Exception e) {
                logger.warn("[CrossClusterMigrateService] preflight 源侧规模预估失败 src={}: {}",
                        req.getSourceIndex(), e.getMessage(), e);
            }
        }
        Long srcDocCount = profile == null ? null : (Long) profile.get("srcDocCount");
        Integer srcShards = profile == null ? null : (Integer) profile.get("srcShards");
        out.put("srcDocCount", srcDocCount);
        out.put("srcShards", srcShards);
        out.put("sourceBytes", profile == null ? null : profile.get("sourceBytes"));
        out.put("fieldTypeCounts", profile == null ? new LinkedHashMap<String, Object>()
                : profile.get("fieldTypeCounts"));
        out.put("sourceAliases", profile == null ? new ArrayList<String>() : profile.get("sourceAliases"));
        out.put("destShards", destExists ? readLocalShardCount(req.getDestIndex()) : null);
        out.put("estSeconds", estimateSeconds(srcDocCount, req.getTuneMode()));

        Integer dataNodes = readLocalDataNodeCount();
        String targetVersion = hostVersionProvider == null ? null : hostVersionProvider.currentVersion();
        Map<String, Object> recommended = new LinkedHashMap<>();
        recommended.put("slices", recommendedSlices(srcShards, dataNodes));
        recommended.put("batchSize", 500);
        recommended.put("requestsPerSecond", srcDocCount == null ? null
                : (srcDocCount > 5_000_000L ? -1 : 2000));
        out.put("recommended", recommended);
        out.put("advice", buildPreflightAdvice(profile, sourceVersion, targetVersion, srcShards, dataNodes,
                sourceVendor, probeHostVendor(), vendorPrivateSettings));
        return out;
    }

    /** probe 结果里的厂商 id（{@code vendor.id}）；探测不到返回 null。 */
    private static String vendorIdOf(Map<String, Object> probe) {
        Object vendor = probe.get("vendor");
        Object id = vendor instanceof Map ? ((Map<?, ?>) vendor).get("id") : null;
        return id == null ? null : String.valueOf(id);
    }

    /** 宿主集群厂商 id（preflight 兼容预警轻量探测）；探测失败如实 null。 */
    private String probeHostVendor() {
        try {
            RestClient ll = localClient.get().getLowLevelClient();
            return vendorIdOf(StructureSyncService.probeCluster(
                    path -> performLowLevel(ll, new Request("GET", path))));
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] probeHostVendor failed: {}", e.getMessage(), e);
            return null;
        }
    }

    /** 厂商私有 settings 前缀（与 CompatMatrix 的 VENDOR_PRIVATE_PREFIXES 同口径的轻量表）。 */
    private static final List<String> VENDOR_PRIVATE_SETTING_PREFIXES = java.util.Arrays.asList(
            "index.apack.", "index.aliyun.", "index.tencent.", "index.qcloud.", "index.cloud_aws.");

    /** 源索引 settings 是否含厂商私有键（flat 键表）；读不到/无命中如实 false。 */
    static boolean hasVendorPrivateSettings(Map<String, Object> flatSettings) {
        if (flatSettings == null) {
            return false;
        }
        for (String key : flatSettings.keySet()) {
            for (String prefix : VENDOR_PRIVATE_SETTING_PREFIXES) {
                if (key.startsWith(prefix)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 源索引 flat settings（{@code _settings?flat_settings=true}）；读取失败如实 null。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> readRemoteFlatSettings(RestClient ll, String index) {
        try {
            Request req = new Request("GET", "/" + index + "/_settings");
            req.addParameter("flat_settings", "true");
            Map<String, Object> root = performLowLevel(ll, req);
            Map<String, Object> idx = (Map<String, Object>) root.values().iterator().next();
            Object settings = idx.get("settings");
            return settings instanceof Map ? (Map<String, Object>) settings : null;
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] readRemoteFlatSettings failed {}: {}",
                    index, e.getMessage(), e);
            return null;
        }
    }

    /** 源集群版本号（{@code GET /} 的 version.number）；读不到如实 null。 */
    private String readRemoteVersion(RestClient ll) {
        try {
            Map<String, Object> root = performLowLevel(ll, new Request("GET", "/"));
            Object versionNode = root.get("version");
            Object number = versionNode instanceof Map ? ((Map<?, ?>) versionNode).get("number") : null;
            return number == null ? null : String.valueOf(number);
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] readRemoteVersion failed: {}", e.getMessage(), e);
            return null;
        }
    }

    /** 目标（宿主）数据节点数（{@code _cluster/health} 的 number_of_data_nodes）；读不到 null。 */
    private Integer readLocalDataNodeCount() {
        try {
            Map<String, Object> root = performLowLevel(localClient.get().getLowLevelClient(),
                    new Request("GET", "/_cluster/health"));
            Object v = root.get("number_of_data_nodes");
            return v instanceof Number ? ((Number) v).intValue() : null;
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] readLocalDataNodeCount failed: {}", e.getMessage(), e);
            return null;
        }
    }

    /** 推荐切片数启发式：min(源分片数, max(2, 目标数据节点×2), 8)；未知项按保守值参与。 */
    static int recommendedSlices(Integer srcShards, Integer dataNodes) {
        int floor = dataNodes == null ? 2 : Math.max(2, dataNodes * 2);
        int slices = Math.min(floor, 8);
        if (srcShards != null) {
            slices = Math.min(srcShards, slices);
        }
        return Math.max(1, slices);
    }

    /** 预检建议（中文一句）：判据缺席的项不产生建议，不冒充已知。包内可见供测试直调。 */
    static List<Map<String, Object>> buildPreflightAdvice(Map<String, Object> profile,
                                                          String sourceVersion, String targetVersion,
                                                          Integer srcShards, Integer dataNodes) {
        return buildPreflightAdvice(profile, sourceVersion, targetVersion, srcShards, dataNodes,
                null, null, false);
    }

    /**
     * 预检建议全参形态（兼容预警批）：{@code kind=compat} 条目在源→目标跨厂商
     * （双侧厂商都探测到且不同）或源 settings 含厂商私有键时追加，提示先跑
     * sync_structure dry-run 预览；判据缺席（任一侧厂商未知且无私有键）不产生。
     */
    static List<Map<String, Object>> buildPreflightAdvice(Map<String, Object> profile,
                                                          String sourceVersion, String targetVersion,
                                                          Integer srcShards, Integer dataNodes,
                                                          String sourceVendor, String targetVendor,
                                                          boolean vendorPrivateSettings) {
        List<Map<String, Object>> advice = new ArrayList<>();
        if (profile != null) {
            Object formatless = profile.get("formatlessDateFields");
            if (formatless instanceof List && !((List<?>) formatless).isEmpty()) {
                List<?> fields = (List<?>) formatless;
                advice.add(entry("code", "formatless_date", "message", "源 mapping 有 " + fields.size()
                        + " 个无 format 的 date 字段（" + joinLimit(fields, 5) + "），"
                        + "若存有 10 位 epoch 秒值，ES 会按毫秒解释为 1970 年附近时间"));
            }
        }
        if (sourceVersion != null && targetVersion != null
                && majorMinorDiffers(sourceVersion, targetVersion)) {
            advice.add(entry("code", "version_gap", "message", "源集群版本 " + sourceVersion
                    + " 与目标集群版本 " + targetVersion + " 主/次版本不一致，"
                    + "字段解析与默认行为可能存在差异"));
        }
        if (srcShards != null && dataNodes != null && srcShards > 3 * dataNodes) {
            advice.add(entry("code", "shard_oversize", "message", "源分片 " + srcShards
                    + " 片相对目标 " + dataNodes + " 个数据节点过碎，建议 ≤ " + (3 * dataNodes)));
        }
        if (profile != null) {
            Object aliases = profile.get("sourceAliases");
            if (aliases instanceof List && !((List<?>) aliases).isEmpty()) {
                advice.add(entry("code", "alias_attached", "message", "源索引挂有别名（"
                        + joinLimit((List<?>) aliases, 5) + "），迁移本体不随迁别名，"
                        + "切流前需在目标侧补挂（结构同步可用 syncAliases=true 随迁）"));
            }
        }
        boolean vendorChanged = sourceVendor != null && targetVendor != null
                && !sourceVendor.equals(targetVendor);
        if (vendorChanged || vendorPrivateSettings) {
            String why = vendorChanged
                    ? "源厂商 " + sourceVendor + " 与目标厂商 " + targetVendor + " 不同，私有 settings 与插件差异需预剔除"
                    : "源索引含厂商私有 settings，跨环境不可迁移";
            advice.add(entry("code", "compat", "kind", "compat",
                    "message", why + "，structure sync recommended: run sync_structure dryRun preview before start"));
        }
        return advice;
    }

    /** 清单拼接（最多列 limit 项，超出以「等 N 项」收尾）。 */
    private static String joinLimit(List<?> items, int limit) {
        StringBuilder sb = new StringBuilder();
        int shown = 0;
        for (Object item : items) {
            if (shown >= limit) {
                sb.append("等 ").append(items.size()).append(" 项");
                return sb.toString();
            }
            if (shown > 0) {
                sb.append("、");
            }
            sb.append(item);
            shown++;
        }
        return sb.toString();
    }

    private static boolean majorMinorDiffers(String a, String b) {
        String[] pa = a.trim().split("\\.");
        String[] pb = b.trim().split("\\.");
        return pa.length >= 2 && pb.length >= 2 && (!pa[0].equals(pb[0]) || !pa[1].equals(pb[1]));
    }

    private static Map<String, Object> entry(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }

    /** 预计耗时（秒）= 源 docs 数 ÷ 调优档经验速率（整除粗估）；源数未知返回 null，不假装可估。 */
    static Long estimateSeconds(Long srcDocCount, TuneMode tune) {
        if (srcDocCount == null) {
            return null;
        }
        long rate = tune == TuneMode.GENTLE ? EST_RATE_GENTLE_PER_SEC : EST_RATE_AGGRESSIVE_PER_SEC;
        return srcDocCount / rate;
    }

    /** 源主分片数：low-level {@code _settings} + flat 解析（跨大版本稳定）；失败 WARN 并返回 null。 */
    private Integer readRemoteShardCount(RestClient ll, String index) {
        try {
            Request req = new Request("GET", "/" + index + "/_settings");
            req.addParameter("flat_settings", "true");
            Map<String, Object> root = performLowLevel(ll, req);
            @SuppressWarnings("unchecked")
            Map<String, Object> idx = (Map<String, Object>) root.values().iterator().next();
            return shardCountFromFlatSettings(idx);
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] readRemoteShardCount failed index={}: {}",
                    index, e.getMessage(), e);
            return null;
        }
    }

    /** 目标主分片数：目标存在时才读（见 preflight）；纯展示增强，读不到如实 null、不打断预检。 */
    private Integer readLocalShardCount(String index) {
        try {
            Request req = new Request("GET", "/" + index + "/_settings");
            req.addParameter("flat_settings", "true");
            Response resp = localClient.get().getLowLevelClient().performRequest(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            return shardCountFromFlatSettings((Map<String, Object>) root.get(index));
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] readLocalShardCount failed index={}: {}",
                    index, e.getMessage(), e);
            return null;
        }
    }

    /** flat_settings 形态的 {@code _settings} 响应节里取主分片数；读不到或非数字返回 null。 */
    static Integer shardCountFromFlatSettings(Map<String, Object> idxSection) {
        if (idxSection == null) {
            return null;
        }
        String v = readFlat(idxSection, "index.number_of_shards", null);
        if (v == null) {
            return null;
        }
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 发起迁移（异步）。同步完成 校验→连通→建/跳目标索引→捕获并调优 settings，随后提交 worker 并返回 jobId。
     */
    public String start(MigrateRequest req) {
        return start(req, null, null);
    }

    /**
     * 发起迁移（带创建者身份）：连接模型下 resume/abort 只允许创建者本人或 ADMIN。
     *
     * @param ownerUsername 创建者；null=旧装配/内部调用（维持连接级语义）
     * @param ownerRole     创建时角色快照
     */
    public String start(MigrateRequest req, String ownerUsername, String ownerRole) {
        validate(req);
        guardDestMajor();
        int slices = req.getSlices() > 0 ? Math.min(req.getSlices(), MAX_SLICES) : properties.getMigrate().getDefaultSlices();
        int batch = req.getBatchSize() > 0 ? Math.min(req.getBatchSize(), MAX_BATCH_SIZE) : properties.getMigrate().getDefaultBatchSize();
        int keepAlive = req.getScrollKeepAliveSec() > 0
                ? req.getScrollKeepAliveSec() : properties.getMigrate().getScrollKeepAliveSec();

        RemoteClusterConn conn = resolveConn(req.getConn());
        RestHighLevelClient remote = remoteClientFactory.build(conn);
        boolean tuned = false;
        String dest = req.getDestIndex();
        Map<String, String> savedSettings = null;
        try {
            RestClient remoteLL = remote.getLowLevelClient();
            // 连通 + 源存在校验（low-level HEAD，跨大版本稳定）+ 取总量
            if (!remoteIndexExists(remoteLL, req.getSourceIndex())) {
                throw new IllegalStateException("旧集群源索引不存在: " + req.getSourceIndex());
            }
            Long total = countRemote(remote, req.getSourceIndex());

            /* jobId 不可预测：此前 dest_<毫秒> 可枚举，同连接内可猜中他人 jobId 读进度/续跑。
               保留 dest_ 前缀（日志检索/前端展示兼容），追加 64bit 随机段。
               事件环先于 handle 建立：连接/预检/调优节点先落 bootstrap 清单，随 handle 一并接管。 */
            String jobId = dest + "_" + System.currentTimeMillis() + "_"
                    + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            List<Map<String, Object>> bootstrapEvents = new ArrayList<>();
            addEvent(bootstrapEvents, "connect", "info",
                    "源集群连通自检通过，源索引存在（文档总数 " + (total == null ? "未知" : total) + "）");

            List<String> formatlessDates = ensureDestIndex(req, remoteLL);
            addEvent(bootstrapEvents, "preflight", "info",
                    "目标索引准备完成（destCreateMode=" + req.getDestCreateMode() + "）");

            savedSettings = captureSettings(dest);
            applyTune(dest, req.getTuneMode());
            tuned = true;
            addEvent(bootstrapEvents, "tune", "info",
                    "已应用迁移调优 settings（tuneMode=" + req.getTuneMode() + "，收尾自动还原）");

            MigrateJobES meta = buildMeta(jobId, req, conn, slices, batch, total, savedSettings,
                    ownerUsername, ownerRole);
            meta.setFormatlessDateFields(new ArrayList<>(formatlessDates));

            ExecutorService executor = Executors.newFixedThreadPool(slices, namedThreadFactory(jobId));
            MigrationHandle handle = new ThrottledMigrationHandle(jobId, conn, executor, meta, PERSIST_THROTTLE_MS);
            handle.restoreEvents(bootstrapEvents);
            for (int i = 0; i < slices; i++) {
                handle.markSlice(i, MigrateJobTracker.SLICE_PENDING);
            }
            handle.markStarted(); // 观测打点：首份快照即带 startedAtMs
            handle.addEvent("start", "info", "迁移启动：slices=" + slices + " batchSize=" + batch
                    + " total=" + (total == null ? "未知" : total));
            running.register(handle);
            tracker.save(handle.toJobEs());

            List<Integer> sliceIds = new ArrayList<>();
            for (int i = 0; i < slices; i++) {
                sliceIds.add(i);
            }
            launch(handle, remote, req.getSourceIndex(), dest, slices, batch, keepAlive, sliceIds, req.isForceMerge());
            logger.info("[CrossClusterMigrateService] start jobId={} {} -> {} slices={} batch={} total={}",
                    jobId, req.getSourceIndex(), dest, slices, batch, total);
            return jobId;
        } catch (RuntimeException e) {
            // 启动期失败：已调优则尽力还原，关临时 client
            if (tuned && savedSettings != null) {
                restoreSettingsQuietly(dest, savedSettings);
            }
            closeQuietly(remote);
            throw e;
        } catch (Exception e) {
            if (tuned && savedSettings != null) {
                restoreSettingsQuietly(dest, savedSettings);
            }
            closeQuietly(remote);
            throw new IllegalStateException("发起迁移失败: " + rootMsg(e), e);
        }
    }

    // ---------------------------------------------------------------- resume

    /**
     * 续跑：仅重跑非 DONE 的 slice（create 幂等，已写文档自动跳过）。需重新供给旧集群凭据。
     */
    public String resume(String jobId, RemoteClusterConn conn) {
        if (running.isRunning(jobId)) {
            throw new IllegalStateException("作业仍在运行中，无需 resume: " + jobId);
        }
        guardDestMajor();
        MigrateJobES persisted = tracker.findById(jobId);
        if (persisted == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        String status = persisted.getStatus();
        if (MigrateJobTracker.STATUS_DONE.equals(status)) {
            throw new IllegalStateException("作业已完成，无需 resume: " + jobId);
        }

        RemoteClusterConn resolved = resolveConn(conn);
        RestHighLevelClient remote = remoteClientFactory.build(resolved);
        boolean tuned = false;
        String dest = persisted.getDestIndex();
        /* 旧作业（可能由历史版本写入）续跑前同样过精确业务索引守卫。 */
        localAdmin.guardExactDataIndex(String.valueOf(persisted.getSourceIndex()));
        localAdmin.guardExactDataIndex(String.valueOf(dest));
        Map<String, String> savedSettings = persisted.getSavedSettings() == null
                ? new LinkedHashMap<>() : new LinkedHashMap<>(persisted.getSavedSettings());
        try {
            int slices = persisted.getSlices() == null ? 1
                    : Math.min(persisted.getSlices(), MAX_SLICES);
            int batch = persisted.getBatchSize() == null
                    ? properties.getMigrate().getDefaultBatchSize()
                    : Math.min(persisted.getBatchSize(), MAX_BATCH_SIZE);
            int keepAlive = properties.getMigrate().getScrollKeepAliveSec();
            TuneMode tuneMode = parseTune(persisted.getTuneMode(), jobId);

            // settings 可能已被还原，resume 重新调优（用首启捕获的原值，不重复捕获以免把"调优态"误存为原值）
            applyTune(dest, tuneMode);
            tuned = true;

            MigrateJobES meta = cloneMetaForResume(persisted, savedSettings);
            ExecutorService executor = Executors.newFixedThreadPool(Math.max(1, slices), namedThreadFactory(jobId));
            MigrationHandle handle = new ThrottledMigrationHandle(jobId, resolved, executor, meta, PERSIST_THROTTLE_MS);
            handle.restoreSliceErrors(persisted.getSliceErrors()); // 上次运行的 slice 失败观测不因 resume 丢失（旧文档 null 安全）
            handle.restoreEvents(persisted.getEvents()); // 历史事件跨 resume 保留（旧文档 null 安全）

            // 还原已完成 slice 的计数 + 标 DONE；收集需重跑的 slice
            List<Integer> rerun = new ArrayList<>();
            Map<String, String> sliceStatus = persisted.getSliceStatus() == null
                    ? new LinkedHashMap<>() : persisted.getSliceStatus();
            Map<String, Long> sliceMigrated = persisted.getSliceMigrated() == null
                    ? new LinkedHashMap<>() : persisted.getSliceMigrated();
            for (int i = 0; i < slices; i++) {
                String st = sliceStatus.get(String.valueOf(i));
                if (MigrateJobTracker.SLICE_DONE.equals(st)) {
                    handle.markSlice(i, MigrateJobTracker.SLICE_DONE);
                    Long c = sliceMigrated.get(String.valueOf(i));
                    if (c != null && c > 0) {
                        // 全局口径改由 priorMigrated 基线 + 本次累计合成，此处只还原 slice 粒度观测
                        handle.restoreSliceMigratedCount(i, c);
                    }
                } else {
                    handle.markSlice(i, MigrateJobTracker.SLICE_PENDING);
                    rerun.add(i);
                    /* 非 DONE slice 的历史写入量同样还原到 slice 观测（全局口径由 priorMigrated
                       基线合成）：重跑后详情视图里该 slice 显示「本次+上轮」连续计数，而非只显示
                       本次——否则曾中止的 slice 看起来比实际少 */
                    Long c = sliceMigrated.get(String.valueOf(i));
                    if (c != null && c > 0) {
                        handle.restoreSliceMigratedCount(i, c);
                    }
                }
            }
            handle.setStatus(MigrateJobTracker.STATUS_RUNNING);
            handle.markStarted(); // resume 重置耗时口径：startedAtMs 刷新、旧 finishedAtMs 清空
            if (!running.registerIfAbsent(handle)) {
                throw new IllegalStateException("作业仍在运行中，无需 resume: " + jobId);
            }
            tracker.save(handle.toJobEs());

            if (rerun.isEmpty()) {
                rerun.add(0); // 理论不会发生（全 DONE 应为 DONE 状态），兜底重跑 slice0
            }
            handle.addEvent("start", "info", "resume 续跑：重跑 slice " + rerun
                    + "（create 幂等，已写文档自动跳过）");
            launch(handle, remote, persisted.getSourceIndex(), dest, slices, batch, keepAlive, rerun, false);
            logger.info("[CrossClusterMigrateService] resume jobId={} rerunSlices={}", jobId, rerun);
            return jobId;
        } catch (RuntimeException e) {
            if (tuned) {
                restoreSettingsQuietly(dest, savedSettings);
            }
            closeQuietly(remote);
            throw e;
        } catch (Exception e) {
            if (tuned) {
                restoreSettingsQuietly(dest, savedSettings);
            }
            closeQuietly(remote);
            throw new IllegalStateException("resume 失败: " + rootMsg(e), e);
        }
    }

    // ---------------------------------------------------------------- abort

    /**
     * 中止迁移：运行中→置 abort 标志，由监管线程优雅收尾（停 worker、还原 settings、标 ABORTED）；
     * 已 INTERRUPTED（无运行态）→直接还原 settings 并标 ABORTED。已写文档保留（create 幂等可重跑）。
     */
    public void abort(String jobId) {
        MigrationHandle handle = running.get(jobId);
        if (handle != null) {
            handle.setMessage("用户请求中止");
            handle.abort();
            handle.getExecutor().shutdown(); // 不再接新任务；当次跑完即停
            logger.info("[CrossClusterMigrateService] abort signaled jobId={}", jobId);
            return;
        }
        // 无运行态：可能是 INTERRUPTED/FAILED，尽力还原 settings + 标 ABORTED
        MigrateJobES persisted = tracker.findById(jobId);
        if (persisted == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        if (persisted.getSavedSettings() != null && !persisted.getSavedSettings().isEmpty()) {
            restoreSettingsQuietly(persisted.getDestIndex(), persisted.getSavedSettings());
        }
        persisted.setStatus(MigrateJobTracker.STATUS_ABORTED);
        persisted.setMessage("用户中止（无运行态，已尽力还原目标索引 settings）");
        if (persisted.getFinishedAtMs() == null) {
            persisted.setFinishedAtMs(System.currentTimeMillis()); // ABORTED 也是终态，补尾值（旧文档缺字段场景）
        }
        tracker.save(persisted);
        logger.info("[CrossClusterMigrateService] abort (no running handle) jobId={}", jobId);
    }

    // ---------------------------------------------------------------- 查询

    /**
     * 单作业进度快照：运行中作业优先读活句柄（{@code toJobEs()} 实时计数/事件/冲突样本
     * 快照，与 events 端点同口径——conflicts 端点据此避免只读到节流持久化快照的滞后）；
     * 无运行态（终态/重启后）回落持久化文档。
     */
    public MigrateJobES progress(String jobId) {
        MigrationHandle handle = running.get(jobId);
        if (handle != null) {
            return handle.toJobEs();
        }
        MigrateJobES job = tracker.findById(jobId);
        if (job == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        return job;
    }

    public List<MigrateJobES> jobs(int limit) {
        return tracker.listRecent(limit);
    }

    // ---------------------------------------------------------------- 运行中调速

    /**
     * 带运行中调速的作业句柄：{@code requestsPerSecond} 为可变字段（-1=不限速；0 经
     * {@link #throttle} 拒绝，不可达），{@link #throttle} 更新后由搬运循环每批读取当前值
     * 生效——{@link SliceWorker} 每批 bulk 写完即回调 {@link MigrationHandle#addMigrated(int, long)}，
     * 覆写点按本批条数计算等待时长（批粒度限速，与浏览器桥同口径）。包内可见供测试直建。
     */
    static class ThrottledMigrationHandle extends MigrationHandle {

        volatile int requestsPerSecond = -1;

        ThrottledMigrationHandle(String jobId, RemoteClusterConn conn, ExecutorService executor,
                                 MigrateJobES meta, long persistThrottleMs) {
            super(jobId, conn, executor, meta, persistThrottleMs);
        }

        @Override
        public void addMigrated(int sliceId, long n) {
            super.addMigrated(sliceId, n);
            paceBatch(n);
        }

        /** 批粒度限速：本批 n 条 ÷ 当前 rps；中断（中止/停机）只恢复标志立即放行。 */
        private void paceBatch(long n) {
            int rps = requestsPerSecond;
            if (rps <= 0 || n <= 0) {
                return;
            }
            long sleepMs = n * 1000L / rps;
            if (sleepMs <= 0) {
                return;
            }
            try {
                Thread.sleep(sleepMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /**
     * 运行中调速：更新作业句柄的 {@code requestsPerSecond}，下一批搬运即按新值限速。
     * 作业不存在（IllegalArgumentException）/ 非运行态（IllegalStateException）明确报错；
     * 运行中返回 {@code {ok:true, jobId, rps, appliedAt:epochMillis}}，并记一条
     * {@code stage=THROTTLE} 作业事件（{@code {ts,stage,message,level}}，message 含 rps 值）。
     *
     * @param rps 每秒文档数上限；-1 恢复不限速（0 与 &lt;-1 均非法——不限速请传 -1）
     */
    public Map<String, Object> throttle(String jobId, int rps) {
        if (rps == 0) {
            throw new IllegalArgumentException("rps 0 不允许：不限速请传 -1");
        }
        if (rps < -1) {
            throw new IllegalArgumentException("rps 非法: " + rps + "（须 ≥ -1，-1 表示不限速）");
        }
        MigrationHandle handle = running == null ? null : running.get(jobId);
        if (handle == null) {
            MigrateJobES persisted = tracker == null ? null : tracker.findById(jobId);
            if (persisted == null) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            throw new IllegalStateException("作业非运行态（状态 " + persisted.getStatus()
                    + "），运行中调速不可用: " + jobId);
        }
        if (!(handle instanceof ThrottledMigrationHandle)) {
            throw new IllegalStateException("作业句柄不支持运行中调速: " + jobId);
        }
        ThrottledMigrationHandle throttled = (ThrottledMigrationHandle) handle;
        throttled.requestsPerSecond = rps;
        throttled.addEvent("THROTTLE", "info", rps > 0
                ? "调速为 " + rps + " docs/s（批粒度限速）" : "恢复不限速");
        logger.info("[CrossClusterMigrateService] throttle jobId={} rps={}", jobId, rps);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("jobId", jobId);
        out.put("rps", rps);
        out.put("appliedAt", System.currentTimeMillis());
        return out;
    }

    // ---------------------------------------------------------------- 治理：删除 / 对账

    /** 终态判定：DONE/FAILED/ABORTED/INTERRUPTED（可删除、无在途搬运线程）。 */
    static boolean isTerminalStatus(String status) {
        return MigrateJobTracker.STATUS_DONE.equals(status) || MigrateJobTracker.STATUS_FAILED.equals(status)
                || MigrateJobTracker.STATUS_ABORTED.equals(status) || MigrateJobTracker.STATUS_INTERRUPTED.equals(status);
    }

    /**
     * 删除单条迁移作业记录（治理面，只清控制面文档、不触碰两侧索引数据）。
     * 仅终态可删：运行中作业的记录是进度/续跑/settings 还原依据，删了会留下
     * 无法观测也无法中止的孤儿搬运线程——非终态以 IllegalState 拒绝（端点 409）。
     */
    public Map<String, Object> delete(String jobId) {
        MigrateJobES job = tracker.findById(jobId);
        if (job == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        String status = job.getStatus();
        if (!isTerminalStatus(status)) {
            throw new IllegalStateException("作业仍在运行中（状态 " + status + "），不能删除；请先中止或等待完成: " + jobId);
        }
        tracker.delete(jobId);
        tracker.refresh();
        logger.info("[CrossClusterMigrateService] delete job {} (status={})", jobId, status);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jobId", jobId);
        out.put("deleted", true);
        return out;
    }

    /**
     * 批量清理 {@code days} 天前结束（finishedAtMs 早于截点）的终态作业，返回 {@code {deleted:N}}。
     *
     * <p>批量清理是治理面动作：静态模型（scope=null）下全站共用一份作业台账，
     * 按天清理作用于台账内全部终态记录，不按创建者区分。</p>
     *
     * <p>{@code scope} 非 null 时只删通过判定的作业——连接模型下由 Controller 传入
     * 源连接写键过滤（与作业列表可见面同口径，防跨连接误删）。可见窗口与列表页同口径
     * （listRecent 500）：更早的记录本轮不可见也不清理，量级超限时多次调用逐窗推进。</p>
     */
    public Map<String, Object> deleteOlderThan(int days, java.util.function.Predicate<MigrateJobES> scope) {
        if (days <= 0) {
            throw new IllegalArgumentException("olderThanDays 必须为正整数");
        }
        long cutoff = System.currentTimeMillis() - days * 86_400_000L;
        int deleted = 0;
        for (MigrateJobES job : tracker.listRecent(500)) {
            if (!isTerminalStatus(job.getStatus())) {
                continue;
            }
            Long finishedAt = job.getFinishedAtMs();
            if (finishedAt == null || finishedAt >= cutoff) {
                continue;
            }
            if (scope != null && !scope.test(job)) {
                continue;
            }
            tracker.delete(job.getJobId());
            deleted++;
        }
        if (deleted > 0) {
            tracker.refresh();
        }
        logger.info("[CrossClusterMigrateService] deleteOlderThan days={} deleted={}", days, deleted);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", deleted);
        return out;
    }

    /**
     * 双侧文档数对账：源集群按作业的源连接档案取密建连、low-level {@code _count} 取数
     * （与 start 取 total 同口径），目标恒为宿主/控制集群（迁移写入端不变式）。用完即关源连接。
     *
     * <p>任一侧取数失败该侧如实置 null、diff 置 null（预检的「尽力而为」契约同款，
     * 不冒充 0）；建连失败抛 IllegalState（端点 409 REMOTE_CONNECT_FAILED）。</p>
     */
    public Map<String, Object> reconcile(RemoteClusterConn sourceConn, String sourceIndex, String destIndex) {
        if (sourceConn == null) {
            throw new IllegalArgumentException("缺少源集群连接信息，无法对账源侧文档数");
        }
        RemoteClusterConn resolved = resolveConn(sourceConn);
        Long sourceCount;
        try (RestHighLevelClient remote = remoteClientFactory.build(resolved)) {
            sourceCount = countRemote(remote, sourceIndex);
        } catch (Exception e) {
            /* 失败信息不回显远端集群内网地址（与 connectCheck 的拓扑脱敏同口径）。 */
            throw new IllegalStateException(io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper.sanitizeTopology(
                    "连接旧集群失败 [" + resolved.endpoint() + "]: " + rootMsg(e)));
        }
        Long destCount = countLocal(destIndex);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sourceIndex", sourceIndex);
        out.put("destIndex", destIndex);
        out.put("sourceCount", sourceCount);
        out.put("destCount", destCount);
        out.put("diff", sourceCount == null || destCount == null ? null : sourceCount - destCount);
        return out;
    }

    /**
     * 列出迁移写入端（宿主/控制集群）的业务索引。迁移目标恒定是 {@code localClient}，
     * 与前端顶栏所选数据面目标无关——目标索引补全必须用本清单，不能复用跟随 X-Es-Target 的清单。
     */
    public List<Map<String, Object>> destIndices() {
        /* xmigrate 不经 EsTargetInterceptor（只挂 /internal/es/index/**），host-cluster-visible=false
           的纯管理平台形态下 /cluster/** 全部 403 HOST_DISABLED——这里若不拦即成宿主索引
           元数据的旁路泄露口。 */
        if (!properties.getConsole().isHostClusterVisible()) {
            throw new IllegalStateException("宿主集群数据面已隐藏（host-cluster-visible=false），迁移目标清单不可用");
        }
        try {
            EsIndexAdmin admin = new EsIndexAdmin(localClient.get().getLowLevelClient());
            List<Map<String, Object>> rows = admin.listClusterIndices();
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                if (!admin.isControlIndex(String.valueOf(row.get("index")))) out.add(row);
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("读取目标（宿主）集群索引清单失败: " + rootMsg(e));
        }
    }

    // ---------------------------------------------------------------- 内部：编排

    private void launch(MigrationHandle handle, RestHighLevelClient remote, String sourceIndex, String dest,
                        int slices, int batch, int keepAlive, List<Integer> sliceIds, boolean forceMerge) {
        ExecutorService executor = handle.getExecutor();
        for (int id : sliceIds) {
            executor.submit(new SliceWorker(id, slices, sourceIndex, dest, batch, keepAlive,
                    remote.getLowLevelClient(), localClient.get(), handle, tracker, properties.getRetry()));
        }
        executor.shutdown(); // 不再接新任务，已提交的继续跑
        Thread supervisor = new Thread(() -> superviseAndFinalize(handle, remote, dest, forceMerge),
                "xmigrate-supervisor-" + handle.getJobId());
        supervisor.setDaemon(true);
        supervisor.start();
    }

    /** 监管线程：await 全部 worker → 还原 settings → refresh →（可选 forceMerge）→ 等 green → 落终态 → 关 client。 */
    private void superviseAndFinalize(MigrationHandle handle, RestHighLevelClient remote, String dest, boolean forceMerge) {
        try {
            ExecutorService executor = handle.getExecutor();
            while (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                tracker.save(handle.toJobEs()); // 长任务期间周期性落进度
            }
            boolean aborted = handle.isAborted();
            /* 收尾透明化：还原/刷新/合并/等 green 的失败不再静默（吞掉后作业照常标完成，
               新写入可能长期不可搜索而使用者无从得知）——全部收进完成结论如实告知 */
            java.util.List<String> finalizeWarnings = new java.util.ArrayList<>();
            restoreSettingsQuietly(dest, handle.getMeta().getSavedSettings(), finalizeWarnings);
            handle.addEvent("finalize", "info", "收尾开始：还原目标索引 settings（refresh/副本数/translog）");
            if (!aborted) {
                try {
                    localClient.get().indices().refresh(new RefreshRequest(dest), RequestOptions.DEFAULT);
                    handle.addEvent("finalize", "info", "收尾 refresh 完成，新写入已可见");
                } catch (Exception e) {
                    logger.warn("[CrossClusterMigrateService] refresh failed dest={}: {}", dest, e.getMessage(), e);
                    handle.addEvent("finalize", "warn", "收尾 refresh 失败：部分新写入可能暂不可搜索，可手动 POST /"
                            + dest + "/_refresh 后复查");
                    finalizeWarnings.add("收尾刷新失败（" + rootMsg(e) + "）：部分新写入可能暂不可搜索，可手动 POST /"
                            + dest + "/_refresh 后复查");
                }
                if (forceMerge) {
                    try {
                        localAdmin.forceMerge(dest, 1);
                    } catch (Exception e) {
                        logger.warn("[CrossClusterMigrateService] forceMerge failed dest={}: {}", dest, e.getMessage(), e);
                        finalizeWarnings.add("收尾段合并失败（" + rootMsg(e) + "）：不影响数据完整，可稍后手动 force merge");
                    }
                }
                waitGreenQuietly(dest, finalizeWarnings);
                /* 终态对账：目标实际可见条数低于本作业已处理量（新写入 + 已存在跳过）时，
                   必有写入确认了却未落盘（刷新失败/异步 translog 丢失）——bulk 计数不可
                   唯一信任，缺口如实写进完成结论并给出幂等补齐路径。
                   续跑作业除外：被中止 slice 重跑时其上轮已写入部分会以 409 计入 conflicts，
                   与 priorMigrated 基线口径重叠（同一批文档两侧各计一次），processed 系统性
                   偏高属预期——此场景对账降级为参考信息，不发缺口告警（重跑也无法消除） */
                Long destCount = countLocal(dest);
                boolean resumedJob = handle.getMeta().getPriorMigrated() != null || handle.getMeta().getPriorConflicts() != null;
                if (destCount != null) {
                    MigrateJobES s0 = handle.toJobEs();
                    long processed = nz(s0.getMigrated()) + nz(s0.getConflicts());
                    if (destCount < processed && resumedJob) {
                        finalizeWarnings.add("目标实际可见 " + destCount + " 条，已处理累计 " + processed
                                + " 条（续跑作业含历史基线与重放跳过的口径重叠，差值仅供参考，不代表缺数据）");
                    } else if (destCount < processed) {
                        finalizeWarnings.add("目标实际可见 " + destCount + " 条，低于已处理 " + processed
                                + " 条（缺 " + (processed - destCount) + "）：部分写入未生效，重跑本作业可按 create "
                                + "幂等补齐（已存在的自动跳过）");
                    }
                }
                /* 增量窗口复查：源在本次迁移窗口内（start 取 total 之后）的新增写入不会进入
                   本次 scroll 结果；与作业 total 的差值如实告知，并给出幂等增量补齐路径。 */
                Long srcCountNow = countRemote(remote, handle.getMeta().getSourceIndex());
                Long total = handle.getMeta().getTotal();
                if (srcCountNow != null && total != null && srcCountNow > total) {
                    finalizeWarnings.add("迁移窗口内源新增约 " + (srcCountNow - total)
                            + " 条（快照后写入），如需最新数据可再跑一次迁移按 create 增量补齐");
                }
            }
            handle.setStatus(resolveFinalStatus(handle, aborted));
            handle.setMessage(buildFinalMessage(handle, aborted, finalizeWarnings));
            handle.addEvent("final", MigrateJobTracker.STATUS_FAILED.equals(handle.getStatus()) ? "error" : "info",
                    "终态 " + handle.getStatus() + "：" + handle.toJobEs().getMessage());
            handle.markFinished(); // 观测打点：终态快照带 finishedAtMs（耗时=finishedAtMs-startedAtMs）
            handle.forcePersistSlot();
            tracker.save(handle.toJobEs());
            logger.info("[CrossClusterMigrateService] finalize jobId={} status={} migrated={} conflicts={} errors={}",
                    handle.getJobId(), handle.getStatus(),
                    handle.toJobEs().getMigrated(), handle.toJobEs().getConflicts(), handle.toJobEs().getErrors());
        } catch (Exception e) {
            logger.error("[CrossClusterMigrateService] finalize error jobId={}", handle.getJobId(), e);
            handle.setStatus(MigrateJobTracker.STATUS_FAILED);
            handle.setMessage("收尾异常: " + rootMsg(e));
            handle.addEvent("final", "error", "终态 FAILED：收尾异常 " + rootMsg(e));
            handle.markFinished(); // 收尾异常也是终态，耗时口径不缺尾值
            handle.forcePersistSlot();
            tracker.save(handle.toJobEs());
        } finally {
            closeQuietly(remote);
            running.remove(handle.getJobId());
        }
    }

    /** bootstrap 事件构造（handle 建立前的节点先落清单，随 handle.restoreEvents 接管）。 */
    private static void addEvent(List<Map<String, Object>> events, String stage, String level, String message) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("ts", System.currentTimeMillis());
        event.put("stage", stage);
        event.put("message", message);
        event.put("level", level);
        events.add(event);
    }

    /**
     * 作业事件时间线：{@code {jobId, events:[{ts,stage,message,level}]}}（ts 升序）。
     * 运行中作业读活句柄事件环（最新）；无运行态（终态/重启后）读持久化快照的事件
     * （事件随 toJobEs 持久化，重启后历史事件仍可回放——与 adhoc 的 stageEvents 同口径）。
     */
    public Map<String, Object> events(String jobId) {
        MigrationHandle handle = running.get(jobId);
        List<Map<String, Object>> events;
        if (handle != null) {
            events = handle.snapshotEvents();
        } else {
            MigrateJobES job = tracker.findById(jobId);
            if (job == null) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            events = job.getEvents() == null ? Collections.<Map<String, Object>>emptyList() : job.getEvents();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jobId", jobId);
        out.put("events", events);
        return out;
    }

    /**
     * 冲突样本分页（{@code GET /jobs/{id}/conflicts?cursor=&limit=}）：
     * 服务端样本上限 {@link MigrationHandle#MAX_CONFLICT_SAMPLES}，{@code cursor} 为上次返回的
     * 末位偏移（首页空串/0），返回 {@code {samples:[{_id,ts,reason?}], nextCursor, total,
     * truncated}}；{@code nextCursor=null} 表示样本已翻完，{@code total} 为冲突全量计数，
     * {@code truncated} = total 超出本页样本数（与纯前端模式同口径，尾注展示依据）。
     */
    public static Map<String, Object> conflictsPage(List<Map<String, Object>> ring, Long total,
                                                    String cursor, int limit) {
        List<Map<String, Object>> samples = ring == null ? Collections.<Map<String, Object>>emptyList() : ring;
        int start = Math.max(0, parseCursor(cursor));
        int size = Math.max(1, Math.min(limit <= 0 ? 100 : limit, MAX_CONFLICT_PAGE_LIMIT));
        if (start >= samples.size()) {
            /* 游标越过样本尾部（作业已终态/后续写入重排）：如实空页，不回卷重放 */
            long totalLong = total == null ? 0L : total;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("samples", Collections.<Map<String, Object>>emptyList());
            out.put("nextCursor", null);
            out.put("total", totalLong);
            out.put("truncated", totalLong > 0);
            return out;
        }
        int end = Math.min(start + size, samples.size());
        long totalLong = total == null ? 0L : total;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("samples", new ArrayList<>(samples.subList(start, end)));
        out.put("nextCursor", end < samples.size() ? String.valueOf(end) : null);
        out.put("total", totalLong);
        out.put("truncated", totalLong > end - start);
        return out;
    }

    /** 单页冲突样本条数上限（防御性钳制；服务端环上限 1000）。 */
    static final int MAX_CONFLICT_PAGE_LIMIT = 1000;

    private static int parseCursor(String cursor) {
        if (cursor == null || cursor.trim().isEmpty()) {
            return 0;
        }
        try {
            return Integer.parseInt(cursor.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private String resolveFinalStatus(MigrationHandle handle, boolean aborted) {
        if (aborted) {
            return MigrateJobTracker.STATUS_ABORTED;
        }
        MigrateJobES snap = handle.toJobEs();
        for (String st : snap.getSliceStatus().values()) {
            if (MigrateJobTracker.SLICE_FAILED.equals(st) || MigrateJobTracker.SLICE_PENDING.equals(st)) {
                return MigrateJobTracker.STATUS_FAILED;
            }
        }
        return MigrateJobTracker.STATUS_DONE;
    }

    private String buildFinalMessage(MigrationHandle handle, boolean aborted) {
        return buildFinalMessage(handle, aborted, java.util.Collections.emptyList());
    }

    /** 包内可见供测试直调（完成结论的拼接语义是迁移可观测性的公开承诺）。 */
    String buildFinalMessage(MigrationHandle handle, boolean aborted, java.util.List<String> warnings) {
        MigrateJobES s = handle.toJobEs();
        StringBuilder msg = new StringBuilder();
        if (aborted) {
            msg.append("已中止；已搬 ").append(n(s.getMigrated())).append("，可 resume 续跑");
        } else {
            msg.append("迁移结束：搬入 ").append(n(s.getMigrated())).append("，跳过(冲突/增量) ").append(n(s.getConflicts()))
                    .append("，失败 ").append(n(s.getErrors()));
        }
        for (String w : warnings) {
            msg.append("；注意：").append(w);
        }
        return msg.toString();
    }

    // ---------------------------------------------------------------- 内部：目标索引

    /**
     * 建/跳过目标索引，并返回目标 mapping 中<b>无 format 的 date 字段</b>清单（ 如实告知）。
     *
     * <p>清单只由 mapping 得出，<b>不采样文档、不判断值</b>——判断字段里是否真存着 10 位 epoch
     * 需要读源文档，而 {@code date-forms} 采样端点已在做那件事，此处再做一份就是第二份实现。</p>
     */
    private List<String> ensureDestIndex(MigrateRequest req, RestClient remoteLL) throws Exception {
        String dest = req.getDestIndex();
        boolean exists = localAdmin.indexExists(dest);
        switch (req.getDestCreateMode()) {
            case NONE:
                if (!exists) {
                    throw new IllegalStateException("destCreateMode=NONE 要求目标索引已存在，但新集群无索引: " + dest
                            + "（请先由应用建好，或改用 COPY_FROM_SOURCE / FROM_ENTITY）");
                }
                // 索引是别人建的，其 mapping 不由本次迁移决定，不代为解读
                return Collections.emptyList();
            case COPY_FROM_SOURCE:
                if (exists) {
                    logger.info("[CrossClusterMigrateService] dest 已存在，跳过 COPY_FROM_SOURCE 建索引: {}", dest);
                    return Collections.emptyList();
                }
                // low-level 读源 mapping/settings（跨大版本稳定，6.x 也可），剥 type 包装 + 剔除不可迁移键，
                // 据此建新索引——忠实继承 6.8 结构，而非退化为 ES 动态映射默认。
                String mappingJson, settingsJson;
                try {
                    mappingJson = fetchSourceMapping(remoteLL, req.getSourceIndex());
                    settingsJson = fetchSourceSettings(remoteLL, req.getSourceIndex());
                } catch (Exception e) {
                    throw new IllegalStateException("从旧集群读取 mapping/settings 失败: " + rootMsg(e), e);
                }
                String[] compat = applyCompatMatrix(dest, req.getSourceIndex(), settingsJson, mappingJson);
                settingsJson = compat[0];
                mappingJson = compat[1];
                localAdmin.createIndex(dest, settingsJson, mappingJson);
                logger.info("[CrossClusterMigrateService] COPY_FROM_SOURCE 建索引 {} <- 源 {} mapping+settings", dest, req.getSourceIndex());
                return noteFormatlessDates(dest, mappingJson);
            case FROM_ENTITY:
                if (exists) {
                    logger.info("[CrossClusterMigrateService] dest 已存在，跳过 FROM_ENTITY 建索引: {}", dest);
                    return Collections.emptyList();
                }
                RebuildableIndexMeta meta = indexMetaRegistry.getByKey(req.getIndexKey());
                localAdmin.createIndex(dest, meta.getSettingsJson(), meta.getMappingJson());
                return noteFormatlessDates(dest, meta.getMappingJson());
            case REBUILD:
                /* w57:删旧重建 — 先删已有索引(含全部数据),再按源结构建新索引。
                 * 与 COPY_FROM_SOURCE 的区别:COPY 遇已存在跳过(合并写),REBUILD 强制从零开始。
                 * 安全:删除动作发在迁移启动前,失败则中止迁移(不会出现"删了没建"的半途态,建失败也不会再删)。 */
                if (exists) {
                    logger.warn("[CrossClusterMigrateService] REBUILD: 删除已有目标索引 {} (含全部数据!)", dest);
                    localAdmin.deleteIndex(dest);
                }
                try {
                    mappingJson = fetchSourceMapping(remoteLL, req.getSourceIndex());
                    settingsJson = fetchSourceSettings(remoteLL, req.getSourceIndex());
                } catch (Exception e) {
                    throw new IllegalStateException("REBUILD: 从旧集群读取 mapping/settings 失败: " + rootMsg(e), e);
                }
                compat = applyCompatMatrix(dest, req.getSourceIndex(), settingsJson, mappingJson);
                settingsJson = compat[0];
                mappingJson = compat[1];
                localAdmin.createIndex(dest, settingsJson, mappingJson);
                logger.info("[CrossClusterMigrateService] REBUILD: 目标索引 {} 已删除并按源结构重建", dest);
                return noteFormatlessDates(dest, mappingJson);
            default:
                throw new IllegalArgumentException("未知 destCreateMode: " + req.getDestCreateMode());
        }
    }

    /** 扫出无 format 的 date 字段并记一条 INFO；返回清单供落进作业记录。 */
    private List<String> noteFormatlessDates(String dest, String mappingJson) {
        List<String> fields = FormatlessDateFields.scan(mappingJson);
        String notice = FormatlessDateFields.describe(fields);
        if (notice != null) {
            logger.info("[CrossClusterMigrateService] {} {}", dest, notice);
        }
        return fields;
    }

    /**
     * 建目标索引前的兼容矩阵预剔除（COPY_FROM_SOURCE/REBUILD 路径）：按目标（宿主）集群
     * 能力 snapshot 跑 {@link CompatMatrix#apply}——跨厂商私有 settings、目标缺失插件的
     * 分析组件（级联剔除引用它的 analyzer 并降级字段分词引用）在 PUT 之前剔除。
     * 预剔除/探测失败不阻断建索引（矩阵是预判增强；PUT 失败的反应式兜底语义不变），
     * 返回 {@code [适配后 settingsJson, 适配后 mappingJson]}。
     */
    String[] applyCompatMatrix(String dest, String sourceIndex, String settingsJson, String mappingJson) {
        try {
            Map<String, Object> wrap = OBJECT_MAPPER.readValue(settingsJson, Map.class);
            Object indexNode = wrap.get("index");
            if (!(indexNode instanceof Map) || ((Map<?, ?>) indexNode).isEmpty()) {
                return new String[]{settingsJson, mappingJson};
            }
            Map<String, Object> flat = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : ((Map<String, Object>) indexNode).entrySet()) {
                flat.put("index." + e.getKey(), e.getValue());
            }
            Map<String, Object> mappings = OBJECT_MAPPER.readValue(mappingJson, Map.class);
            CompatMatrix.Planned planned = CompatMatrix.apply(flat, mappings, hostSnapshot(), null);
            if (!planned.removedSettings.isEmpty() || !planned.removedAnalysis.isEmpty()
                    || !planned.downgradedFields.isEmpty()) {
                logger.info("[CrossClusterMigrateService] compat matrix pre-prune dest={} src={} "
                                + "settings={} analysis={} fields={}",
                        dest, sourceIndex, planned.removedSettings.size(),
                        planned.removedAnalysis.size(), planned.downgradedFields.size());
            }
            Map<String, Object> adapted = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : flat.entrySet()) {
                adapted.put(e.getKey().substring("index.".length()), e.getValue());
            }
            Map<String, Object> outWrap = new LinkedHashMap<>();
            outWrap.put("index", adapted);
            return new String[]{OBJECT_MAPPER.writeValueAsString(outWrap),
                    OBJECT_MAPPER.writeValueAsString(mappings)};
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] compat matrix pre-prune skipped dest={}: {}",
                    dest, e.getMessage(), e);
            return new String[]{settingsJson, mappingJson};
        }
    }

    /**
     * 目标（宿主）集群能力 snapshot：探测逻辑与 StructureSyncService 的 targetSnapshot
     * 同口径（版本/插件聚合/数据节点数/厂商推断；探测不到的项如实缺省，规则自行跳过）。
     */
    @SuppressWarnings("unchecked")
    private CompatMatrix.TargetSnapshot hostSnapshot() {
        Map<String, Object> probe = new LinkedHashMap<>();
        try {
            RestClient ll = localClient.get().getLowLevelClient();
            probe.putAll(StructureSyncService.probeCluster(
                    path -> performLowLevel(ll, new Request("GET", path))));
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] host capability probe failed, "
                    + "compat matrix runs with unknown target: {}", e.getMessage(), e);
        }
        return new CompatMatrix.TargetSnapshot() {
            @Override
            public String version() {
                return probe.get("version") == null ? null : String.valueOf(probe.get("version"));
            }

            @Override
            public Set<String> plugins() {
                Object plugins = probe.get("plugins");
                return plugins instanceof List ? new LinkedHashSet<>((List<String>) plugins)
                        : Collections.<String>emptySet();
            }

            @Override
            public Integer dataNodeCount() {
                Object v = probe.get("dataNodeCount");
                return v instanceof Number ? ((Number) v).intValue() : null;
            }

            @Override
            public boolean ilmPolicyExists(String policy) {
                return hostIlmPolicyExists(policy);
            }

            @Override
            public boolean pluginsReliable() {
                return Boolean.TRUE.equals(probe.get("pluginsReliable"));
            }

            @Override
            public String vendorId() {
                Object vendor = probe.get("vendor");
                Object id = vendor instanceof Map ? ((Map<?, ?>) vendor).get("id") : null;
                return id == null ? "unknown" : String.valueOf(id);
            }
        };
    }

    /** 宿主 ILM 策略存在性探针：非 404 按存在；探测异常同样按存在（不误删）。 */
    private boolean hostIlmPolicyExists(String policy) {
        try {
            String encoded = java.net.URLEncoder.encode(policy.trim(), "UTF-8").replace("+", "%20");
            localClient.get().getLowLevelClient()
                    .performRequest(new Request("GET", "/_ilm/policy/" + encoded));
            return true;
        } catch (org.elasticsearch.client.ResponseException re) {
            return re.getResponse().getStatusLine().getStatusCode() != 404;
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] ilm policy probe failed {}: {}",
                    policy, e.getMessage(), e);
            return true;
        }
    }

    /** low-level HEAD 判远端索引存在（跨大版本稳定）。 */
    private boolean remoteIndexExists(RestClient ll, String index) {
        try {
            Response r = ll.performRequest(new Request("HEAD", "/" + index));
            return r.getStatusLine().getStatusCode() == 200;
        } catch (org.elasticsearch.client.ResponseException re) {
            if (re.getResponse().getStatusLine().getStatusCode() == 404) {
                return false;
            }
            throw new IllegalStateException("检查旧集群源索引失败: " + rootMsg(re), re);
        } catch (Exception e) {
            throw new IllegalStateException("检查旧集群源索引失败: " + rootMsg(e), e);
        }
    }

    /**
     * low-level 读源 {@code _mapping}，归一为 7.x 可用的<b>无类型</b> mapping body（{@code {properties:...}}）。
     * 6.x 形如 {@code {"<idx>":{"mappings":{"<type>":{properties:...}}}}}——剥掉单 type 包装；7.x 直接是无类型。
     * 防御性剔除 7.x 已移除的 {@code _all}。
     */
    @SuppressWarnings("unchecked")
    private String fetchSourceMapping(RestClient ll, String src) throws Exception {
        Map<String, Object> root = performLowLevel(ll, new Request("GET", "/" + src + "/_mapping"));
        Map<String, Object> idx = (Map<String, Object>) root.values().iterator().next();
        Map<String, Object> mappings = (Map<String, Object>) idx.get("mappings");
        Map<String, Object> body;
        if (mappings == null || mappings.isEmpty()) {
            body = new LinkedHashMap<>();
        } else if (mappings.containsKey("properties") || mappings.containsKey("dynamic_templates") || mappings.containsKey("_meta")) {
            body = mappings; // 7.x 无类型
        } else {
            body = (Map<String, Object>) mappings.values().iterator().next(); // 6.x 取单 type body
        }
        body.remove("_all"); // 7.x 已移除
        return OBJECT_MAPPER.writeValueAsString(body);
    }

    /**
     * low-level 读源 {@code _settings}，仅复制<b>可迁移</b>键（number_of_shards/replicas、refresh_interval、
     * max_result_window、analysis、similarity），剔除内部/不可变键（uuid/version/creation_date/provided_name/blocks/store）。
     */
    @SuppressWarnings("unchecked")
    private String fetchSourceSettings(RestClient ll, String src) throws Exception {
        Map<String, Object> root = performLowLevel(ll, new Request("GET", "/" + src + "/_settings"));
        Map<String, Object> idx = (Map<String, Object>) root.values().iterator().next();
        Map<String, Object> settings = (Map<String, Object>) idx.get("settings");
        Map<String, Object> index = settings == null ? null : (Map<String, Object>) settings.get("index");
        Map<String, Object> out = new LinkedHashMap<>();
        if (index != null) {
            for (String k : new String[]{"number_of_shards", "number_of_replicas", "refresh_interval", "max_result_window"}) {
                if (index.get(k) != null) {
                    out.put(k, index.get(k));
                }
            }
            if (index.get("analysis") != null) {
                out.put("analysis", index.get("analysis"));
            }
            if (index.get("similarity") != null) {
                out.put("similarity", index.get("similarity"));
            }
        }
        Map<String, Object> wrap = new LinkedHashMap<>();
        wrap.put("index", out);
        /* 还原 ES 脱敏的插件组件引用（校准误差根治）——
           源索引若使用插件注册的 analyzer（如 hanlp），GET _settings 返回的
           analyzer.tokenizer 值会被 ES 脱敏为 "***"（真实组件名不在 index settings
           中，ES 序列化时以 *** 占位）。把这个脱敏副本原样用于校准/建索引必然失败：
           目标 ES 找不到名为 *** 的 tokenizer——即使目标集群装有相同插件。
           此处用源集群 _nodes/analysis 反查插件注册 analyzer 的真实定义并还原；
           查不到的保持 *** 原样，由 L1 WARN 与 dry-run 显式报错（目标集群确实缺
           插件是真问题，不掩盖）。 */
        restoreMaskedAnalyzers(ll, out);
        return OBJECT_MAPPER.writeValueAsString(wrap);
    }

    /**
     * 还原 settings.analysis.analyzer 中被 ES 脱敏为 "***" 的 tokenizer 引用：
     * GET /_nodes/analysis 收集全部节点上已注册 analyzer 的真实定义（插件注册的
     * 在此可见，含真名 tokenizer），按 analyzer 名逐个回填。跨节点取并集——
     * 插件可能只装在部分数据节点，任一节点可解析即够（建索引在任一含该索引分片的
     * 节点上完成即可）。整体不可达/形态不符时静默保持原样，不掩盖真问题。
     */
    @SuppressWarnings("unchecked")
    private void restoreMaskedAnalyzers(RestClient ll, Map<String, Object> out) {
        try {
            Map<String, Object> index = (Map<String, Object>) out.get("index");
            Map<String, Object> analysis = index == null ? null : (Map<String, Object>) index.get("analysis");
            Map<String, Object> analyzers = analysis == null ? null : (Map<String, Object>) analysis.get("analyzer");
            if (analyzers == null || analyzers.isEmpty()) return;
            boolean masked = analyzers.values().stream().anyMatch(v ->
                    v instanceof Map && "***".equals(((Map<String, Object>) v).get("tokenizer")));
            if (!masked) return;
            Map<String, Object> nodesRoot = performLowLevel(ll, new Request("GET", "/_nodes/analysis"));
            Map<String, Object> nodes = nodesRoot == null ? null : (Map<String, Object>) nodesRoot.get("nodes");
            if (nodes == null || nodes.isEmpty()) return;
            Map<String, Object> resolved = new HashMap<>();
            for (Object n : nodes.values()) {
                if (!(n instanceof Map)) continue;
                Map<String, Object> na = (Map<String, Object>) ((Map<String, Object>) n).get("analysis");
                if (na == null) continue;
                Map<String, Object> naAnalyzers = (Map<String, Object>) na.get("analyzers");
                if (naAnalyzers instanceof Map) resolved.putAll((Map<String, Object>) naAnalyzers);
            }
            if (resolved.isEmpty()) return;
            for (Map.Entry<String, Object> e : analyzers.entrySet()) {
                if (!(e.getValue() instanceof Map)) continue;
                Map<String, Object> def = (Map<String, Object>) e.getValue();
                if (!"***".equals(def.get("tokenizer"))) continue;
                Object real = resolved.get(e.getKey());
                if (real instanceof Map) {
                    Object realTokenizer = ((Map<String, Object>) real).get("tokenizer");
                    if (realTokenizer != null) def.put("tokenizer", realTokenizer);
                }
            }
        } catch (Exception ignore) {
            /* 节点分析接口不可达/形态不符时保持 *** 原样——L1 WARN 与 dry-run 显式报错，不掩盖真问题 */
        }
    }

    /** low-level 请求执行 + JSON 解析；包内可见供测试以路径表覆写（不触真实集群）。 */
    @SuppressWarnings("unchecked")
    Map<String, Object> performLowLevel(RestClient ll, Request req) throws Exception {
        Response resp = ll.performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    // ---------------------------------------------------------------- 内部：settings 捕获/调优/还原

    /** 用 include_defaults 捕获目标索引 4 项 settings 的真实生效值，作还原依据。 */
    private Map<String, String> captureSettings(String dest) {
        Map<String, String> captured = new LinkedHashMap<>();
        try {
            Request req = new Request("GET", "/" + dest + "/_settings");
            req.addParameter("include_defaults", "true");
            req.addParameter("flat_settings", "true");
            Response resp = localClient.get().getLowLevelClient().performRequest(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> idx = (Map<String, Object>) root.get(dest);
            captured.put(K_REFRESH, readFlat(idx, K_REFRESH, "1s"));
            captured.put(K_REPLICAS, readFlat(idx, K_REPLICAS, "1"));
            captured.put(K_TRANSLOG_DURABILITY, readFlat(idx, K_TRANSLOG_DURABILITY, "request"));
            captured.put(K_FLUSH_THRESHOLD, readFlat(idx, K_FLUSH_THRESHOLD, "512mb"));
        } catch (Exception e) {
            // 取不到则用 ES 默认作还原兜底，确保收尾不会把索引留在调优态
            logger.warn("[CrossClusterMigrateService] captureSettings 失败 dest={}，用默认值兜底还原: {}", dest, e.getMessage(), e);
            captured.put(K_REFRESH, "1s");
            captured.put(K_REPLICAS, "1");
            captured.put(K_TRANSLOG_DURABILITY, "request");
            captured.put(K_FLUSH_THRESHOLD, "512mb");
        }
        return captured;
    }

    @SuppressWarnings("unchecked")
    private static String readFlat(Map<String, Object> idx, String key, String def) {
        if (idx == null) {
            return def;
        }
        // flat_settings：settings/defaults 下都是扁平 key
        Object settings = idx.get("settings");
        if (settings instanceof Map) {
            Object v = ((Map<String, Object>) settings).get(key);
            if (v != null) {
                return String.valueOf(v);
            }
        }
        Object defaults = idx.get("defaults");
        if (defaults instanceof Map) {
            Object v = ((Map<String, Object>) defaults).get(key);
            if (v != null) {
                return String.valueOf(v);
            }
        }
        return def;
    }

    private void applyTune(String dest, TuneMode mode) throws Exception {
        Map<String, Object> tune = new LinkedHashMap<>();
        if (mode == TuneMode.AGGRESSIVE) {
            tune.put(K_REFRESH, "-1");
            tune.put(K_REPLICAS, 0);
            tune.put(K_TRANSLOG_DURABILITY, "async");
            tune.put(K_FLUSH_THRESHOLD, "1gb");
        } else {
            tune.put(K_REFRESH, "30s"); // GENTLE：仅拉长 refresh，保留副本与 translog
        }
        localAdmin.updateSettingsDynamic(dest, tune);
        logger.info("[CrossClusterMigrateService] tune dest={} mode={} -> {}", dest, mode, tune);
    }

    private void restoreSettingsQuietly(String dest, Map<String, String> saved) {
        restoreSettingsQuietly(dest, saved, null);
    }

    /** 收尾版：失败除日志外还收进 warnings，随作业完成结论呈现给使用者。 */
    private void restoreSettingsQuietly(String dest, Map<String, String> saved, java.util.List<String> warnings) {
        if (saved == null || saved.isEmpty()) {
            return;
        }
        try {
            Map<String, Object> restore = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : saved.entrySet()) {
                restore.put(e.getKey(), e.getValue());
            }
            localAdmin.updateSettingsDynamic(dest, restore);
            logger.info("[CrossClusterMigrateService] restore settings dest={} -> {}", dest, restore);
        } catch (Exception e) {
            logger.error("[CrossClusterMigrateService] restore settings FAILED dest={}（请人工核对 refresh/replicas）: {}",
                    dest, e.getMessage(), e);
            if (warnings != null) {
                warnings.add("还原索引设置失败（" + rootMsg(e) + "）：refresh/副本数可能仍处迁移加速值，请人工核对 "
                        + dest + " 的 settings");
            }
        }
    }

    private void waitGreenQuietly(String dest) {
        waitGreenQuietly(dest, null);
    }

    private void waitGreenQuietly(String dest, java.util.List<String> warnings) {
        try {
            Request req = new Request("GET", "/_cluster/health/" + dest);
            req.addParameter("wait_for_status", "green");
            req.addParameter("timeout", "120s");
            localClient.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] waitGreen dest={} 未达 green（继续）: {}", dest, e.getMessage(), e);
            if (warnings != null) {
                warnings.add("收尾等待集群 green 超时（" + rootMsg(e) + "）：副本可能仍在恢复，不影响已写入数据");
            }
        }
    }

    /** 终态对账用：目标索引当前可见文档数（low-level _count，与 countRemote 同口径）。 */
    private Long countLocal(String index) {
        try {
            Request req = new Request("GET", "/" + index + "/_count");
            Response resp = localClient.get().getLowLevelClient().performRequest(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object cnt = root.get("count");
            return cnt instanceof Number ? ((Number) cnt).longValue() : null;
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] countLocal failed index={}: {}", index, e.getMessage(), e);
            return null;
        }
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }

    // ---------------------------------------------------------------- 内部：杂项

    /**
     * 台账 #69：起迁移前拦住跨大版本的目标集群，<b>不许跑进 {@link SliceWorker}</b>。
     *
     * <p>{@code SliceWorker} 写目标用 high-level {@code bulk}，RHLC 7.6.2 产出的 action 不带
     * {@code _type}，而 6.x 的 {@code _bulk} 要求 {@code _type}。读侧早已跨版本处理妥当，
     * 唯独写侧没有对称处理——失败模式是<b>迁到一半 400，留下半拷贝的目标索引</b>，
     * 所以必须在建索引/调 settings/起 worker 之前就拒绝。</p>
     *
     * <p><b>「未知」保持为「未知」</b>：{@link DestVersionGuard} 的两种拒绝给<b>不同</b>的报错文本，
     * 本方法只做透传，不在此处折叠——使用者要据此采取不同行动（#67 教训延伸）。</p>
     */
    private void guardDestMajor() {
        String destVersion = hostVersionProvider == null ? null : hostVersionProvider.currentVersion();
        DestVersionGuard.Verdict verdict = DestVersionGuard.verdict(destVersion);
        if (verdict == DestVersionGuard.Verdict.ALLOW) {
            return;
        }
        String msg = DestVersionGuard.rejectMessage(destVersion);
        logger.error("[CrossClusterMigrateService] 目标集群版本守卫拒绝起迁移 verdict={} destVersion={}",
                verdict, destVersion);
        throw new IllegalStateException(msg);
    }

    void validate(MigrateRequest req) {
        if (req.getConn() == null) {
            throw new IllegalArgumentException("缺少旧集群连接信息 conn");
        }
        // 注：conn 字段的合法性在 resolveConn 后由 RemoteEsClientFactory.build → conn.validate() 校验
        // （此处不校验，因 host/port 可能是待服务端解析的变量名/${表达式}）。
        if (isBlank(req.getSourceIndex())) {
            throw new IllegalArgumentException("sourceIndex 不可为空");
        }
        if (isBlank(req.getDestIndex())) {
            throw new IllegalArgumentException("destIndex 不可为空");
        }
        /* 源/目标都只能是精确业务索引：控制面/系统索引、通配、列表、date-math 一律不允许。
           源头控制索引被迁走等于把账号/连接/审计数据复制到业务索引；目标控制索引会被覆盖。 */
        localAdmin.guardExactDataIndex(req.getSourceIndex().trim());
        localAdmin.guardExactDataIndex(req.getDestIndex().trim());
        if (req.getDestCreateMode() == DestCreateMode.FROM_ENTITY && isBlank(req.getIndexKey())) {
            throw new IllegalArgumentException("destCreateMode=FROM_ENTITY 必须提供已注册的 indexKey");
        }
    }

    private Long countRemote(RestHighLevelClient remote, String index) {
        // 走 low-level _count：跨大版本稳定（6.x 的 hits.total 是数字，high-level search 解析会炸）
        try {
            Request req = new Request("GET", "/" + index + "/_count");
            Response resp = remote.getLowLevelClient().performRequest(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object cnt = root.get("count");
            return cnt instanceof Number ? ((Number) cnt).longValue() : null;
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] countRemote failed index={}: {}", index, e.getMessage(), e);
            return null;
        }
    }

    /** MCP 对账源侧计数：临时连源集群、用完即关（与 REST 同口径）。 */
    @Override
    public Long reconcileSourceCount(RemoteClusterConn conn, String sourceIndex) {
        try (RestHighLevelClient remote = remoteClientFactory.build(conn)) {
            return countRemote(remote, sourceIndex);
        } catch (Exception e) {
            /* 失败信息不回显源集群内网地址（与组内 listIndices 的拓扑脱敏同口径）。 */
            throw new IllegalStateException(io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper
                    .sanitizeTopology("读取源集群文档数失败 [" + sourceIndex + "]: " + e.getMessage()));
        }
    }

    private MigrateJobES buildMeta(String jobId, MigrateRequest req, RemoteClusterConn conn, int slices, int batch,
                                   Long total, Map<String, String> savedSettings,
                                   String ownerUsername, String ownerRole) {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId(jobId);
        meta.setOwnerUsername(ownerUsername);
        meta.setOwnerRole(ownerRole);
        meta.setSourceIndex(req.getSourceIndex());
        meta.setDestIndex(req.getDestIndex());
        meta.setIndexKey(req.getIndexKey());
        meta.setRemoteEndpoint(conn.endpoint());
        meta.setSrcConnId(req.getSrcConnId());
        meta.setDestCreateMode(req.getDestCreateMode().name());
        meta.setTuneMode(req.getTuneMode().name());
        meta.setSlices(slices);
        meta.setBatchSize(batch);
        meta.setTotal(total);
        meta.setCreateTime(System.currentTimeMillis());
        meta.setSavedSettings(savedSettings == null ? new LinkedHashMap<>() : savedSettings);
        return meta;
    }

    private MigrateJobES cloneMetaForResume(MigrateJobES persisted, Map<String, String> savedSettings) {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId(persisted.getJobId());
        /* 续跑不转移所有权：owner 原样保留，否则同连接他人可借 resume 接管他人作业。 */
        meta.setOwnerUsername(persisted.getOwnerUsername());
        meta.setOwnerRole(persisted.getOwnerRole());
        meta.setSourceIndex(persisted.getSourceIndex());
        meta.setDestIndex(persisted.getDestIndex());
        meta.setIndexKey(persisted.getIndexKey());
        meta.setRemoteEndpoint(persisted.getRemoteEndpoint());
        meta.setSrcConnId(persisted.getSrcConnId());
        meta.setDestCreateMode(persisted.getDestCreateMode());
        meta.setTuneMode(persisted.getTuneMode());
        meta.setSlices(persisted.getSlices());
        meta.setBatchSize(persisted.getBatchSize());
        meta.setTotal(persisted.getTotal());
        meta.setCreateTime(persisted.getCreateTime());
        meta.setSavedSettings(savedSettings);
        /* 续跑计数基线：上次持久化的 migrated/conflicts 总量。toJobEs 输出 prior + 本次累计，
           页面计数跨续跑连续累计（首次 start 不设基线，保持 null=非续跑）。 */
        meta.setPriorMigrated(persisted.getMigrated());
        meta.setPriorConflicts(persisted.getConflicts());
        return meta;
    }

    /** jobId 入参供 WARN 定位到恢复的作业（唯一调用点 resume）；null=旧文档缺字段，判据内常态不告警。 */
    private TuneMode parseTune(String s, String jobId) {
        try {
            return TuneMode.valueOf(s);
        } catch (Exception e) {
            if (s != null) {
                logger.warn("[CrossClusterMigrateService] tuneMode '{}' 不可识别,回退 AGGRESSIVE jobId={}", s, jobId);
            }
            return TuneMode.AGGRESSIVE;
        }
    }

    private java.util.concurrent.ThreadFactory namedThreadFactory(String jobId) {
        final java.util.concurrent.atomic.AtomicInteger seq = new java.util.concurrent.atomic.AtomicInteger();
        return r -> {
            Thread t = new Thread(r, "xmigrate-" + jobId + "-w" + seq.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static long n(Long v) {
        return v == null ? 0L : v;
    }

    private static String rootMsg(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage() == null ? t.toString() : t.getMessage();
    }

    private static void closeQuietly(RestHighLevelClient client) {
        try {
            client.close();
        } catch (Exception e) {
            logger.debug("[CrossClusterMigrateService] close remote client ignore: {}", e.getMessage(), e);
        }
    }
}
