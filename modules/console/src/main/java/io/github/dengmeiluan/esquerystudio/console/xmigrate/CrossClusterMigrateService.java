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
import java.util.List;
import java.util.Map;
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
public class CrossClusterMigrateService {

    private static final Logger logger = LoggerFactory.getLogger(CrossClusterMigrateService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 进度持久化节流（毫秒）：减少 worker 高频写作业索引。 */
    private static final long PERSIST_THROTTLE_MS = 1500L;

    /** 请求侧切片/批量上限：slices 直接映射线程池大小、batch 直传 scroll size——
     *  不钳制时一次请求即可建十万线程（认证后的资源耗尽面）。 */
    private static final int MAX_SLICES = 32;
    private static final int MAX_BATCH_SIZE = 10_000;

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
            EsIndexAdmin admin = new EsIndexAdmin(remote);
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

    // ---------------------------------------------------------------- start

    /**
     * 迁移前预检：目标索引是否已存在。已存在时（COPY_FROM_SOURCE/FROM_ENTITY 会跳过建索引、
     * bulk op_type=create 幂等写），同名文档会被静默跳过，结果是「合并」——前端据此在启动确认弹层
     * 前置警告，避免「以为会清空重建、实际是合并」的数据安全误判。
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
        return out;
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

            List<String> formatlessDates = ensureDestIndex(req, remoteLL);

            savedSettings = captureSettings(dest);
            applyTune(dest, req.getTuneMode());
            tuned = true;

            /* jobId 不可预测：此前 dest_<毫秒> 可枚举，同连接内可猜中他人 jobId 读进度/续跑。
               保留 dest_ 前缀（日志检索/前端展示兼容），追加 64bit 随机段。 */
            String jobId = dest + "_" + System.currentTimeMillis() + "_"
                    + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            MigrateJobES meta = buildMeta(jobId, req, conn, slices, batch, total, savedSettings,
                    ownerUsername, ownerRole);
            meta.setFormatlessDateFields(new ArrayList<>(formatlessDates));

            ExecutorService executor = Executors.newFixedThreadPool(slices, namedThreadFactory(jobId));
            MigrationHandle handle = new MigrationHandle(jobId, conn, executor, meta, PERSIST_THROTTLE_MS);
            for (int i = 0; i < slices; i++) {
                handle.markSlice(i, MigrateJobTracker.SLICE_PENDING);
            }
            handle.markStarted(); // 观测打点：首份快照即带 startedAtMs
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
            MigrationHandle handle = new MigrationHandle(jobId, resolved, executor, meta, PERSIST_THROTTLE_MS);
            handle.restoreSliceErrors(persisted.getSliceErrors()); // 上次运行的 slice 失败观测不因 resume 丢失（旧文档 null 安全）

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
                        handle.addMigrated(i, c);
                    }
                } else {
                    handle.markSlice(i, MigrateJobTracker.SLICE_PENDING);
                    rerun.add(i);
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

    public MigrateJobES progress(String jobId) {
        MigrateJobES job = tracker.findById(jobId);
        if (job == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        return job;
    }

    public List<MigrateJobES> jobs(int limit) {
        return tracker.listRecent(limit);
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
            EsIndexAdmin admin = new EsIndexAdmin(localClient.get());
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
            restoreSettingsQuietly(dest, handle.getMeta().getSavedSettings());
            if (!aborted) {
                refreshQuietly(dest);
                if (forceMerge) {
                    try {
                        localAdmin.forceMerge(dest, 1);
                    } catch (Exception e) {
                        logger.warn("[CrossClusterMigrateService] forceMerge failed dest={}: {}", dest, e.getMessage(), e);
                    }
                }
                waitGreenQuietly(dest);
            }
            handle.setStatus(resolveFinalStatus(handle, aborted));
            handle.setMessage(buildFinalMessage(handle, aborted));
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
            handle.markFinished(); // 收尾异常也是终态，耗时口径不缺尾值
            handle.forcePersistSlot();
            tracker.save(handle.toJobEs());
        } finally {
            closeQuietly(remote);
            running.remove(handle.getJobId());
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
        MigrateJobES s = handle.toJobEs();
        if (aborted) {
            return "已中止；已搬 " + n(s.getMigrated()) + "，可 resume 续跑";
        }
        return "迁移结束：搬入 " + n(s.getMigrated()) + "，跳过(冲突/增量) " + n(s.getConflicts())
                + "，失败 " + n(s.getErrors());
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> performLowLevel(RestClient ll, Request req) throws Exception {
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
    private String readFlat(Map<String, Object> idx, String key, String def) {
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
        }
    }

    private void refreshQuietly(String dest) {
        try {
            localClient.get().indices().refresh(new RefreshRequest(dest), RequestOptions.DEFAULT);
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] refresh failed dest={}: {}", dest, e.getMessage(), e);
        }
    }

    private void waitGreenQuietly(String dest) {
        try {
            Request req = new Request("GET", "/_cluster/health/" + dest);
            req.addParameter("wait_for_status", "green");
            req.addParameter("timeout", "120s");
            localClient.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            logger.warn("[CrossClusterMigrateService] waitGreen dest={} 未达 green（继续）: {}", dest, e.getMessage(), e);
        }
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
