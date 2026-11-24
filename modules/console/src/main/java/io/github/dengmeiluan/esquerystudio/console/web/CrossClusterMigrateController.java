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

package io.github.dengmeiluan.esquerystudio.console.web;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateRequest;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanRecord;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.StructureSyncService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * (内部) ES 跨集群迁移运维接口（客户端 scroll+bulk 搬运）。
 *
 * <p>与零停机重建接口（{@code /internal/es/index/**}）并列、解耦。由 {@code esquerystudio.elasticsearch.web-enabled} 与
 * {@code esquerystudio.elasticsearch.migrate.enabled} 同时为 true 才装配。<b>凭据类请求一律走 POST body，不进 query/日志。</b></p>
 *
 * <p> 起源集群支持引用已存连接档案（{@code srcConnId}/{@code connId}）：服务端取档案含密构造连接，
 * 密码明文不经前端；引用前校验当前登录角色满足档案 minRole（不满足 403 CONN_FORBIDDEN）。</p>
 */
@RestController
@RequestMapping("internal/es/xmigrate")
public class CrossClusterMigrateController {

    private final CrossClusterMigrateService migrateService;
    private final ConnStore connStore;
    private final EnvPagesResolver envPagesResolver;
    private final boolean pageAuthEnabled;

    public CrossClusterMigrateController(CrossClusterMigrateService migrateService, ConnStore connStore,
                                         EnvPagesResolver envPagesResolver, boolean pageAuthEnabled) {
        this.migrateService = migrateService;
        this.connStore = connStore;
        this.envPagesResolver = envPagesResolver;
        this.pageAuthEnabled = pageAuthEnabled;
        /* 等价性验证的 id 形态（服务层统一入口）需要服务内解析连接档案：装配期注入档案解析器
           （含密取档仅服务端流转，与 storedConn 同源）。 */
        migrateService.setConnProfileResolver(connStore::get);
    }

    /**
     * 结构同步服务直连面：同步计划的保存与执行记账随它持有的计划存储走，incremental 计划的执行
     * 需要 {@link StructureSyncService#smartSync} 带 mode 的全参形态（统一入口 smartSync 只有 create
     * 形态）。setter 供测试或宿主注入替换（生产无对应 bean）。
     */
    private StructureSyncService structureSyncService;

    public void setStructureSyncService(StructureSyncService structureSyncService) {
        this.structureSyncService = structureSyncService;
    }

    /**
     * 生产装配：协作者与迁移服务同源（控制集群 client / 本地管理面 / 远端工厂），容器里有即构建；
     * 宿主自定义装配缺位时保持 null，计划端点明确报错。
     */
    @Autowired(required = false)
    public void setPlanSyncDependencies(ControlClusterResolver controlClusterResolver, EsIndexAdmin esIndexAdmin,
                                        RemoteEsClientFactory remoteEsClientFactory) {
        StructureSyncService service = new StructureSyncService(controlClusterResolver::client, esIndexAdmin,
                remoteEsClientFactory);
        /* 计划存储与 MCP 侧共用进程级同一份：降级形态的进程内计划副本才互通。 */
        service.setPlanStore(PlanStore.sharedInstance(controlClusterResolver::client));
        setStructureSyncService(service);
    }

    private StructureSyncService structureSync() {
        if (structureSyncService == null) {
            throw new IllegalStateException("Cross-cluster structure sync service is not available in this deployment");
        }
        return structureSyncService;
    }

    /** 旧集群连通性自检 + 列出旧集群索引。connId 非空时用已存档案（body 可传 {}）。 */
    @PostMapping("connect-check")
    public List<Map<String, Object>> connectCheck(@RequestBody RemoteClusterConn conn,
                                                  @RequestParam(required = false) String connId,
                                                  HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.connectCheck(pick(conn, connId, request));
    }

    /**
     * 环境变量/${表达式} 解析预览：返回服务端从自身运行环境解析出的 scheme/host/port/username
     * 与"密码是否已解析"，<b>不返回密码值</b>。供"只知变量名、填不出实际值"场景确认解析结果。
     */
    @PostMapping("resolve-preview")
    public Map<String, Object> resolvePreview(@RequestBody RemoteClusterConn conn,
                                              @RequestParam(required = false) String connId,
                                              HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.resolvePreview(pick(conn, connId, request));
    }

    /** 迁移前预检：目标索引是否已存在（已存在则同名文档将跳过、结果是合并），供启动确认弹层前置警告。 */
    @PostMapping("preflight")
    public Map<String, Object> preflight(@RequestBody MigrateRequest request, HttpServletRequest http) {
        requireSourceWrite(request.getSrcConnId(), http);
        requireDestWrite(http);
        return migrateService.preflight(request);
    }

    /** 发起迁移（异步），返回 jobId。srcConnId 非空时服务端注入已存档案为源连接。 */
    @PostMapping("start")
    public Map<String, Object> start(@RequestBody MigrateRequest request, HttpServletRequest http) {
        requireSourceWrite(request.getSrcConnId(), http);
        requireDestWrite(http);
        if (request.getSrcConnId() != null && !request.getSrcConnId().trim().isEmpty()) {
            request.setConn(storedConn(request.getSrcConnId(), http));
        }
        ConsolePrincipal p = principal(http);
        String jobId = migrateService.start(request,
                p == null ? null : p.getUsername(),
                p == null ? null : p.getRole().name());
        return ok("jobId", jobId);
    }

    /**
     * 从旧集群读取指定索引的 mapping + settings，供前端预览/编辑后再创建目标索引。
     * 返回 {"mapping": "...", "settings": "..."}。connId 非空时用已存档案。
     */
    @PostMapping("fetch-config")
    public Map<String, Object> fetchConfig(@RequestBody RemoteClusterConn conn,
                                           @RequestParam String sourceIndex,
                                           @RequestParam(required = false) String connId,
                                           HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.fetchSourceConfig(pick(conn, connId, request), sourceIndex);
    }

    /**
     * 结构同步（兼容矩阵预剔除 + 自适应兜底剔除）：读源索引 settings/mapping，在目标（宿主）
     * 集群建索引；兼容矩阵按静态规则预剔除（apack 私有设置/节点属性路由/目标缺失插件组件/
     * 目标缺失 ILM 策略，planned 清单），其余按 ES 真实报错逐轮兜底剔除（reactive 清单），
     * 字段上的分词引用降级为回退分词器（默认 standard，字段保留）。目标索引已存在时拒绝
     * 覆盖（409）。body：{conn?, srcConnId?, sourceIndex, destIndex?, downgradedAnalyzerFallback?,
     * dryRun?, syncAliases?, destConnId?, expectPlanDigest?}——dryRun=true 只产出计划不发 PUT；
     * syncAliases=true 建成后随迁别名；destConnId 指定非宿主目标（缺省/host=宿主）；
     * expectPlanDigest 配对 dryRun=false 执行（dryRun=true 时拒绝），源结构漂移即拒绝。
     */
    @PostMapping("sync-structure")
    public Map<String, Object> syncStructure(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String srcConnId = str(body.get("srcConnId"));
        requireSourceWrite(srcConnId, request);
        requireDestWrite(request);
        String sourceIndex = str(body.get("sourceIndex"));
        if (sourceIndex.trim().isEmpty()) {
            throw new IllegalArgumentException("sourceIndex 不能为空");
        }
        String expectPlanDigest = str(body.get("expectPlanDigest"));
        boolean dryRun = Boolean.TRUE.equals(body.get("dryRun"));
        if (!expectPlanDigest.isEmpty() && dryRun) {
            throw new IllegalArgumentException("expectPlanDigest only valid with dryRun=false");
        }
        RemoteClusterConn manual = body.get("conn") instanceof Map
                ? JOB_COPY.convertValue(body.get("conn"), RemoteClusterConn.class) : null;
        String destConnId = normalizeDestConnId(str(body.get("destConnId")));
        return migrateService.syncStructure(pick(manual, srcConnId, request),
                sourceIndex, str(body.get("destIndex")), str(body.get("downgradedAnalyzerFallback")),
                dryRun, Boolean.TRUE.equals(body.get("syncAliases")),
                destConnId, resolveDestConn(destConnId, request),
                expectPlanDigest.isEmpty() ? null : expectPlanDigest);
    }

    /**
     * 智能结构同步（smart_sync）：一次给出意图参数（源/目标连接、别名随迁、回退分词器、autoTune、
     * 落盘开关），服务端自动「读源索引结构 → 探目标集群 → 兼容矩阵预剔除（planned 清单含规则
     * 溯源 rule/reason）→ 可选按目标数据节点数收敛分片（autoTune）→ 计划摘要」。
     * apply=false 纯只读出计划（verdict=PLANNED，无任何写请求）；apply=true 落盘建索引
     * （verdict=APPLIED，反应式兜底 ≤20 轮）；expectPlanDigest 非空且与当前计划摘要不一致
     * 拒绝落盘（409 PLAN_DRIFT）。body：{srcConnId, sourceIndex, destConnId（必填，
     * host=宿主集群）, destIndex?, syncAliases?, downgradedAnalyzerFallback?, autoTune?,
     * apply?, expectPlanDigest?, savePlan?}——savePlan=true 把本次预览计划落盘并回显 planId
     * （仅预览形态可用，apply=true 时带上报 400）。
     */
    @PostMapping("smart-sync")
    public Map<String, Object> smartSync(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String srcConnId = str(body.get("srcConnId"));
        requireSourceWrite(srcConnId, request);
        requireDestWrite(request);
        String sourceIndex = str(body.get("sourceIndex"));
        if (sourceIndex.trim().isEmpty()) {
            throw new IllegalArgumentException("sourceIndex 不能为空");
        }
        String destConnId = str(body.get("destConnId"));
        if (destConnId.isEmpty()) {
            throw new IllegalArgumentException("destConnId 不能为空（host=宿主集群，或填已存目标连接档案 id）");
        }
        /* 非宿主目标的档案可见性/写键口径与 sync-structure 一致（连接解析由服务层档案通道完成） */
        resolveDestConn(normalizeDestConnId(destConnId), request);
        String expectPlanDigest = str(body.get("expectPlanDigest"));
        boolean apply = Boolean.TRUE.equals(body.get("apply"));
        if (!expectPlanDigest.isEmpty() && !apply) {
            throw new IllegalArgumentException("expectPlanDigest only valid with apply=true");
        }
        boolean savePlan = Boolean.TRUE.equals(body.get("savePlan"));
        if (savePlan && apply) {
            throw new IllegalArgumentException("savePlan 仅预览形态可用");
        }
        boolean syncAliases = Boolean.TRUE.equals(body.get("syncAliases"));
        boolean autoTune = Boolean.TRUE.equals(body.get("autoTune"));
        String fallbackAnalyzer = str(body.get("downgradedAnalyzerFallback"));
        Map<String, Object> out = migrateService.smartSync(srcConnId, sourceIndex, destConnId,
                str(body.get("destIndex")), syncAliases, fallbackAnalyzer, autoTune, apply,
                expectPlanDigest.isEmpty() ? null : expectPlanDigest);
        if (savePlan) {
            out.put("planId", structureSync().planStore().savePlan(srcConnId, sourceIndex, destConnId,
                    str(body.get("destIndex")), syncAliases, fallbackAnalyzer, autoTune, out).getPlanId());
        }
        return out;
    }

    /**
     * 已存同步计划列表（只读，与 MCP plan_list 同构）：{@code {plans:[...], cappedAt:50}}，plans 按
     * savedAtMs 倒序，每行为 planId/srcConnId/sourceIndex/destConnId/destIndex/mode/autoTune/
     * syncAliases/planDigest/savedAtMs/appliedAtMs/appliedCount；存储读取失败时 plans 只含当前进程内
     * 保存的计划并附 warning。连接模型下只列源连接迁移写键可达的计划（与作业列表同口径）；
     * 低于 REBUILD_OP 的身份脱敏源档案 id。
     */
    @GetMapping("plans")
    public Map<String, Object> plans(HttpServletRequest request) {
        PlanStore.Listing listing = structureSync().planStore().list();
        boolean connModel = connModel(request);
        ConsolePrincipal principal = principal(request);
        boolean redact = principal == null || principal.getRole() == null
                || !principal.getRole().atLeast(ConsoleRole.REBUILD_OP);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PlanRecord plan : listing.getPlans()) {
            String srcConnId = plan.getSrcConnId() == null ? "" : plan.getSrcConnId().trim();
            if (connModel && !xmigrateWriteAllowed(srcConnId, principal)) {
                continue;
            }
            Map<String, Object> row = plan.toSummary();
            if (redact) {
                row.put("srcConnId", null);
            }
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("plans", rows);
        out.put("cappedAt", PlanStore.CAP);
        if (listing.getWarning() != null) {
            out.put("warning", listing.getWarning());
        }
        return out;
    }

    /**
     * 按已存同步计划执行（与 MCP plan_apply 同构）：按计划保存的参数重跑 smart-sync 执行形态，
     * 漂移门摘要取 expectPlanDigest、缺省用计划保存时的 planDigest（不一致 409 PLAN_DRIFT，任何写
     * 请求之前拦截）；执行成功回写 appliedAtMs/appliedCount。计划不存在 404 PLAN_NOT_FOUND。
     * 权限与 smart-sync 执行同口径：源连接档案存在且角色不低于其 minRole + 源连接迁移写键 + 宿主
     * 目标迁移写键 + 非宿主目标档案的迁移写键。body：{planId, expectPlanDigest?}。
     */
    @PostMapping("plans/apply")
    public ResponseEntity<Map<String, Object>> plansApply(@RequestBody Map<String, Object> body,
                                                          HttpServletRequest request) {
        String planId = str(body.get("planId"));
        if (planId.isEmpty()) {
            throw new IllegalArgumentException("planId 不能为空");
        }
        PlanStore planStore = structureSync().planStore();
        PlanRecord plan = planStore.find(planId);
        if (plan == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(planError("PLAN_NOT_FOUND",
                    PlanStore.NOT_FOUND_PREFIX + planId, EsErrorMapper.endpointOf(request)));
        }
        String srcConnId = plan.getSrcConnId() == null ? "" : plan.getSrcConnId().trim();
        requireSourceWrite(srcConnId, request);
        RemoteClusterConn srcConn = storedConn(srcConnId, request);
        requireDestWrite(request);
        String destConnId = plan.getDestConnId() == null ? "" : plan.getDestConnId().trim();
        RemoteClusterConn destConn = resolveDestConn(normalizeDestConnId(destConnId), request);
        String sourceIndex = plan.getSourceIndex();
        String destIndex = plan.getDestIndex();
        boolean syncAliases = Boolean.TRUE.equals(plan.getSyncAliases());
        boolean autoTune = Boolean.TRUE.equals(plan.getAutoTune());
        String fallbackAnalyzer = plan.getFallbackAnalyzer();
        boolean incremental = "incremental".equals(plan.getMode());
        String expectPlanDigest = str(body.get("expectPlanDigest"));
        Map<String, Object> out = planStore.apply(plan, expectPlanDigest.isEmpty() ? null : expectPlanDigest,
                gateDigest -> incremental
                        ? structureSync().smartSync(srcConnId, srcConn, sourceIndex, destConnId, destConn,
                                destIndex, syncAliases, fallbackAnalyzer, autoTune, true, gateDigest, "incremental")
                        : migrateService.smartSync(srcConnId, sourceIndex, destConnId, destIndex, syncAliases,
                                fallbackAnalyzer, autoTune, true, gateDigest));
        return ResponseEntity.ok(out);
    }

    /** 计划端点的结构化错误体，形态与 InternalEsMigrateExceptionAdvice 的 {@code {code,message,endpoint}} 一致。 */
    private static Map<String, Object> planError(String code, String message, String endpoint) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        if (endpoint != null && !endpoint.trim().isEmpty()) {
            body.put("endpoint", endpoint);
        }
        return body;
    }

    /**
     * 双侧集群能力对比（sync_structure 前置判读，只读）：源/目标各探测一次
     * 版本/厂商/插件/节点规模，输出风险矩阵（vendor_change / plugin_missing /
     * version_downgrade / shard_oversize）。body：{srcConnId, conn?, sourceIndex?,
     * destConnId?, destIndex?}——destConnId 缺省或 host=宿主集群。
     */
    @PostMapping("compare-capabilities")
    public Map<String, Object> compareCapabilities(@RequestBody Map<String, Object> body,
                                                   HttpServletRequest request) {
        String srcConnId = str(body.get("srcConnId"));
        requireSourceWrite(srcConnId, request);
        RemoteClusterConn manual = body.get("conn") instanceof Map
                ? JOB_COPY.convertValue(body.get("conn"), RemoteClusterConn.class) : null;
        String destConnId = normalizeDestConnId(str(body.get("destConnId")));
        return migrateService.compareCapabilities(srcConnId, pick(manual, srcConnId, request),
                str(body.get("sourceIndex")), destConnId, resolveDestConn(destConnId, request),
                str(body.get("destIndex")));
    }

    /**
     * 双侧索引结构 diff（只读）：源结构 vs 目标既有索引的 settings/mappings 键级差异，
     * 兼容矩阵计划剔除键进 expectedRemovals（豁免），计划外差异进 unexpected 并给出
     * compatible 判定；目标索引不存在时如实报错。body：{srcConnId, conn?, sourceIndex,
     * destConnId?, destIndex}。
     */
    @PostMapping("diff-structure")
    public Map<String, Object> diffStructure(@RequestBody Map<String, Object> body,
                                             HttpServletRequest request) {
        String srcConnId = str(body.get("srcConnId"));
        requireSourceWrite(srcConnId, request);
        String sourceIndex = str(body.get("sourceIndex"));
        if (sourceIndex.isEmpty()) {
            throw new IllegalArgumentException("sourceIndex 不能为空");
        }
        String destIndex = str(body.get("destIndex"));
        if (destIndex.isEmpty()) {
            /* 缺省与源同名（与 sync_structure 同形）；服务层负责回退与回显 */
            destIndex = null;
        }
        RemoteClusterConn manual = body.get("conn") instanceof Map
                ? JOB_COPY.convertValue(body.get("conn"), RemoteClusterConn.class) : null;
        String destConnId = normalizeDestConnId(str(body.get("destConnId")));
        Map<String, Object> diffOut = migrateService.diffStructure(pick(manual, srcConnId, request), sourceIndex,
                resolveDestConn(destConnId, request), destIndex);
        diffOut.put("destConnId", destConnId);
        return diffOut;
    }

    /**
     * 迁移后等价性验证（只读）：双侧 {@code _count}(match_all) 对比 + 源抽样对比（源
     * {@code _search} sort:_doc 取 id 集，两侧 {@code _mget} 取 _source 后 canonical JSON
     * SHA-256 前 16 hex 摘要逐 id 对比，sampleFields 投影后哈希）+ 可选 terms 聚合对比
     * （aggField），产出 verdict=EQUIVALENT/DIVERGENT/INCONCLUSIVE 与 warnings（钳制、
     * 索引缺失、投影字段未出现等）。目标索引不存在（404）→ 该侧 count=null + INCONCLUSIVE
     * （不是异常）。body：{jobId? | srcConnId+sourceIndex, conn?, destConnId?, destIndex?,
     * sampleSize?（默认 100，钳 10..500），sampleFields?（数组或逗号串），aggField?,
     * aggSize?（默认 10，钳 1..50）}。jobId 形态从作业档案取参，归属校验同 resume
     * （创建者本人或 ADMIN）；srcConnId 形态同 sync_structure（必须已存档案）。
     */
    @PostMapping("verify-equivalence")
    public Map<String, Object> verifyEquivalence(@RequestBody Map<String, Object> body,
                                                 HttpServletRequest request) {
        String jobId = str(body.get("jobId"));
        String srcConnId;
        String sourceIndex;
        String destIndex = str(body.get("destIndex"));
        if (!jobId.isEmpty()) {
            MigrateJobES job = migrateService.progress(jobId);
            requireJobSource(job, request, true);
            srcConnId = job.getSrcConnId() == null ? "" : job.getSrcConnId().trim();
            if (srcConnId.isEmpty()) {
                throw new IllegalArgumentException("该作业未记录源连接档案，无法验证（历史手输连接的作业不支持）: " + jobId);
            }
            sourceIndex = job.getSourceIndex() == null ? "" : job.getSourceIndex().trim();
            String jobDest = job.getDestIndex() == null ? "" : job.getDestIndex().trim();
            if (!jobDest.isEmpty()) {
                destIndex = jobDest;
            }
        } else {
            srcConnId = str(body.get("srcConnId"));
            sourceIndex = str(body.get("sourceIndex"));
        }
        requireSourceWrite(srcConnId, request);
        if (sourceIndex.isEmpty()) {
            throw new IllegalArgumentException("sourceIndex 不能为空");
        }
        RemoteClusterConn manual = body.get("conn") instanceof Map
                ? JOB_COPY.convertValue(body.get("conn"), RemoteClusterConn.class) : null;
        String destConnId = normalizeDestConnId(str(body.get("destConnId")));
        return migrateService.verifyEquivalence(pick(manual, srcConnId, request), sourceIndex, destConnId,
                resolveDestConn(destConnId, request), destIndex,
                intOrNull(body.get("sampleSize"), "sampleSize"),
                stringList(body.get("sampleFields"), "sampleFields"),
                str(body.get("aggField")), intOrNull(body.get("aggSize"), "aggSize"));
    }

    /** body 数值参数：null→null；Number 取整；非空数字串解析；其余形态 400（与兄弟端点同错误形态）。 */
    private static Integer intOrNull(Object raw, String what) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number) {
            return ((Number) raw).intValue();
        }
        if (raw instanceof String && !((String) raw).trim().isEmpty()) {
            try {
                return Integer.parseInt(((String) raw).trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException(what + " 必须为整数");
            }
        }
        throw new IllegalArgumentException(what + " 必须为整数");
    }

    /** body 字符串清单参数：数组或逗号分隔串（空白项剔除）；全空/缺省返回 null。 */
    private static List<String> stringList(Object raw, String what) {
        if (raw == null) {
            return null;
        }
        List<String> out = new ArrayList<>();
        if (raw instanceof String) {
            for (String part : ((String) raw).split(",")) {
                String trimmed = part.trim();
                if (!trimmed.isEmpty()) {
                    out.add(trimmed);
                }
            }
        } else if (raw instanceof List) {
            for (Object item : (List<?>) raw) {
                if (item != null) {
                    String trimmed = String.valueOf(item).trim();
                    if (!trimmed.isEmpty()) {
                        out.add(trimmed);
                    }
                }
            }
        } else {
            throw new IllegalArgumentException(what + " 必须为字符串数组或逗号分隔串");
        }
        return out.isEmpty() ? null : out;
    }

    /**
     * 运行中调速：更新作业 {@code requestsPerSecond}（-1 恢复不限速），下一批搬运生效。
     * 作业不存在/非运行态明确报错；连接模型下与 abort 同门（作业源连接写键 + 创建者本人
     * 或 ADMIN）。body：{jobId, rps}。
     */
    @PostMapping("throttle")
    public Map<String, Object> throttle(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String jobId = str(body.get("jobId"));
        if (jobId.isEmpty()) {
            throw new IllegalArgumentException("jobId 不能为空");
        }
        Object rpsRaw = body.get("rps");
        if (!(rpsRaw instanceof Number)) {
            throw new IllegalArgumentException("rps 必须为数字（-1 表示不限速）");
        }
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request, true);
        return migrateService.throttle(jobId, ((Number) rpsRaw).intValue());
    }

    /** destConnId 归一：空或 {@code host} 视为宿主集群（返回 null）；其余原样（已存档案 id）。 */
    private static String normalizeDestConnId(String destConnId) {
        String id = destConnId == null ? "" : destConnId.trim();
        return id.isEmpty() || "host".equalsIgnoreCase(id) ? null : id;
    }

    /** destConnId 解析：null=宿主集群；非空按已存档案取（含 minRole 校验），连接模型下另需该档案的迁移写键。 */
    private RemoteClusterConn resolveDestConn(String destConnId, HttpServletRequest request) {
        if (destConnId == null) {
            return null;
        }
        RemoteClusterConn conn = storedConn(destConnId, request);
        if (connModel(request) && !xmigrateWriteAllowed(destConnId, principal(request))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "暂无目标连接档案 " + destConnId + " 的迁移写权限");
        }
        return conn;
    }

    /** 进度快照（连接模型：只允许作业源连接的写键持有人）。 */
    @GetMapping("progress")
    public MigrateJobES progress(@RequestParam String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        return sanitizeJobFor(job, request);
    }

    /** 近期迁移作业列表（连接模型：只列源连接写键可达的作业）。 */
    @GetMapping("jobs")
    public List<MigrateJobES> jobs(@RequestParam(required = false, defaultValue = "20") int limit,
                                   HttpServletRequest request) {
        List<MigrateJobES> all = migrateService.jobs(Math.min(Math.max(limit, 1), 500));
        boolean connModel = connModel(request);
        ConsolePrincipal principal = principal(request);
        List<MigrateJobES> out = new ArrayList<>(all.size());
        for (MigrateJobES job : all) {
            if (connModel && !(job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()
                    && xmigrateWriteAllowed(job.getSrcConnId().trim(), principal))) {
                continue;
            }
            out.add(sanitizeJobFor(job, request));
        }
        return out;
    }

    /** 进度读面脱敏：源集群地址/源连接档案/连接参数/错误样本含内网拓扑与业务数据片段，
        观测级身份只保留进度状态字段；迁移专项（rank3+）排障所需完整信息保留。
        深拷贝后剥离，避免污染服务端作业缓存对象。 */
    private static MigrateJobES sanitizeJobFor(MigrateJobES job, HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal != null && principal.getRole() != null
                && principal.getRole().atLeast(ConsoleRole.REBUILD_OP)) {
            return job;
        }
        MigrateJobES copy;
        try {
            copy = JOB_COPY.convertValue(job, MigrateJobES.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "作业数据脱敏失败");
        }
        copy.setRemoteEndpoint(null);
        copy.setSrcConnId(null);
        copy.setSavedSettings(null);
        copy.setErrorSamples(null);
        copy.setConflictSamples(null);
        copy.setConflictEvents(null);
        return copy;
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JOB_COPY =
            new com.fasterxml.jackson.databind.ObjectMapper();

    /**
     * 迁移写入端（宿主/控制集群）索引清单——目标索引补全专用。
     * 迁移恒定写宿主，与数据面 X-Es-Target 无关，故不走 /cluster/** 数据面通道。
     */
    @GetMapping("dest-indices")
    public List<Map<String, Object>> destIndices(HttpServletRequest request) {
        requireDestWrite(request);
        return migrateService.destIndices();
    }

    /** 续跑（重新供给旧集群凭据；connId 非空时用已存档案）。 */
    @PostMapping("resume")
    public Map<String, Object> resume(@RequestParam String jobId, @RequestBody RemoteClusterConn conn,
                                      @RequestParam(required = false) String connId,
                                      HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request, true);
        if (connModel(request) && job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()) {
            if (connId == null || !job.getSrcConnId().trim().equals(connId.trim())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "续跑必须使用该作业的源连接档案 " + job.getSrcConnId());
            }
        }
        requireSourceWrite(connId, request);
        requireDestWrite(request);
        migrateService.resume(jobId, pick(conn, connId, request));
        return ok("jobId", jobId);
    }

    /** 中止（连接模型：只允许作业源连接的写键持有人）。 */
    @PostMapping("abort")
    public Map<String, Object> abort(@RequestParam String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request, true);
        migrateService.abort(jobId);
        return ok("aborted", jobId);
    }

    /**
     * 删除单条终态迁移作业记录（204；与 adhoc 作业删除同语义）。只清控制面作业文档，
     * 不触碰两侧索引数据。非终态（RUNNING）回 409：记录是进度/续跑/settings 还原依据，
     * 删除会留下无法观测也无法中止的孤儿搬运线程。
     */
    @DeleteMapping("jobs/{jobId}")
    public ResponseEntity<Void> deleteJob(@PathVariable("jobId") String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request, true);
        migrateService.delete(jobId);
        return ResponseEntity.noContent().build();
    }

    /**
     * 批量清理 N 天前结束的终态迁移作业，返回 {@code {deleted:N}}（olderThanDays≤0 拒绝）。
     * 连接模型下只清当前操作者持有源连接写键的作业（与作业列表可见面同口径，防跨连接误删）；
     * 静态/内置模型全局清理：批量清理是治理面动作，全站共用作业台账，
     * 按天清理作用于台账内全部终态记录，不按创建者区分。
     */
    @DeleteMapping("jobs")
    public Map<String, Object> deleteJobs(@RequestParam("olderThanDays") int olderThanDays,
                                          HttpServletRequest request) {
        if (olderThanDays <= 0) {
            throw new IllegalArgumentException("olderThanDays 必须为正整数");
        }
        java.util.function.Predicate<MigrateJobES> scope = null;
        if (connModel(request)) {
            ConsolePrincipal principal = principal(request);
            scope = job -> job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()
                    && xmigrateWriteAllowed(job.getSrcConnId().trim(), principal);
        }
        return migrateService.deleteOlderThan(olderThanDays, scope);
    }

    /**
     * 双侧文档数对账：源按作业的源连接档案取密连源（密码明文不经前端），目标恒宿主
     * （迁移写入端不变式）。返回 sourceCount/destCount/diff（任一侧取数失败如实 null）。
     */
    @GetMapping("jobs/{jobId}/reconcile")
    public Map<String, Object> reconcile(@PathVariable("jobId") String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        String srcConnId = job.getSrcConnId();
        if (srcConnId == null || srcConnId.trim().isEmpty()) {
            throw new IllegalArgumentException("该作业未记录源连接档案，无法对账（历史手输连接的作业不支持）: " + jobId);
        }
        return migrateService.reconcile(storedConn(srcConnId, request), job.getSourceIndex(), job.getDestIndex());
    }

    /**
     * 作业事件时间线：{@code {jobId, events:[{ts,stage,message,level}]}}（ts 升序，环容量 200）。
     * 运行中作业读活句柄事件环；终态/重启后的作业读持久化快照（历史事件可回放）。
     */
    @GetMapping("jobs/{jobId}/events")
    public Map<String, Object> events(@PathVariable("jobId") String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        return migrateService.events(jobId);
    }

    /**
     * 版本冲突样本分页：{@code {samples:[{_id,ts,reason?}], nextCursor, total}}。
     * samples 为服务端环形收集（上限 1000 条，超限只保全量计数）；{@code cursor} 取上次
     * 返回的 nextCursor（首页省略），{@code limit} 默认 100；nextCursor=null 表示环内样本
     * 已翻完；total 为冲突全量计数（与进度面板 conflicts 同源）。
     */
    @GetMapping("jobs/{jobId}/conflicts")
    public Map<String, Object> conflicts(@PathVariable("jobId") String jobId,
                                         @RequestParam(required = false) String cursor,
                                         @RequestParam(required = false, defaultValue = "100") int limit,
                                         HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        List<Map<String, Object>> ring = job.getConflictEvents();
        if ((ring == null || ring.isEmpty()) && job.getConflictSamples() != null
                && !job.getConflictSamples().isEmpty()) {
            /* 旧版作业文档只有纯 _id 清单：按无时间戳样本兜底分页（ts 缺席） */
            ring = new ArrayList<>();
            for (String id : job.getConflictSamples()) {
                Map<String, Object> sample = new LinkedHashMap<>();
                sample.put("_id", id);
                ring.add(sample);
            }
        }
        Map<String, Object> out = CrossClusterMigrateService.conflictsPage(ring, job.getConflicts(), cursor, limit);
        out.put("jobId", jobId);
        return out;
    }

    /**
     * 连接模型下源连接档案必须有该连接的迁移写键。<b>手输源连接一律拒绝</b>——
     * 手输连接不绑定档案，若放行则持 A 连接写键的用户可绕过源授权读取任意集群并写宿主；
     * 需要临时连接请先在连接中心建档并授予该连接 xmigrate 写键。
     */
    private void requireSourceWrite(String connId, HttpServletRequest request) {
        if (!connModel(request)) return;
        if (connId == null || connId.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "连接模型下必须选择已授权的源连接档案（不支持手输源连接）");
        }
        ConsolePrincipal principal = principal(request);
        if (!xmigrateWriteAllowed(connId.trim(), principal)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "暂无源连接档案 " + connId.trim() + " 的迁移写权限");
        }
    }

    /** conn 写键优先；混合模型静态 xmigrate 页 + 写档角色同样是合法授权（与拦截器同序）。 */
    private boolean xmigrateWriteAllowed(String target, ConsolePrincipal principal) {
        if (principal == null) return false;
        /* 超管是全局权限：连接写键/宿主目标写键都不得把 ADMIN 拦在迁移之外。 */
        if (principal.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) return true;
        if (envPagesResolver.writeAllowed(target, "xmigrate", principal.getGrantedPages())) return true;
        return envPagesResolver.staticWriteAllowed(target, "xmigrate", principal.getGrantedPages())
                && principal.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.REBUILD_OP);
    }

    /**
     * 迁移的写入端恒为宿主/控制集群：连接模型下除了源连接写键，还必须持有宿主连接的
     * xmigrate 写键。否则持 A 连接写键的用户可以把任意数据搬进宿主、覆盖宿主业务索引。
     */
    private void requireDestWrite(HttpServletRequest request) {
        if (!connModel(request)) return;
        ConsolePrincipal principal = principal(request);
        if (!xmigrateWriteAllowed("host", principal)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "暂无宿主目标集群的迁移写权限（conn:host:w:xmigrate）");
        }
    }

    /** 连接模型下作业必须记录源连接档案，且操作者持有该档案的迁移写键；旧版/手输作业不下放。 */
    private void requireJobSource(MigrateJobES job, HttpServletRequest request) {
        requireJobSource(job, request, false);
    }

    /**
     * @param mutating true=续跑/中止：在源连接写键之外再校验作业归属（创建者本人或 ADMIN）。
     *                 进度读取保持连接级（团队观测），不因归属把同事挡在排障门外。
     */
    private void requireJobSource(MigrateJobES job, HttpServletRequest request, boolean mutating) {
        if (connModel(request)) {
            String src = job == null ? null : job.getSrcConnId();
            if (src == null || src.trim().isEmpty()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "该迁移作业未记录源连接档案，连接模型下不可操作");
            }
            requireSourceWrite(src, request);
        }
        if (!mutating) return;
        /* 归属检查不依赖连接模型：静态/内置模型的作业同样记录了创建者，
           不能因为部署模型不同就让同事随意续跑/中止别人的迁移。 */
        ConsolePrincipal p = principal(request);
        if (p == null || p.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) {
            return;
        }
        String owner = job == null ? null : job.getOwnerUsername();
        if (owner == null || owner.trim().isEmpty()) return; // legacy：连接级语义
        if (owner.trim().equals(p.getUsername())) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "迁移作业 " + job.getJobId() + " 由 " + owner + " 创建：续跑/中止仅限创建者本人或 ADMIN。"
                        + "同连接其他成员可查看进度。");
    }

    private boolean connModel(HttpServletRequest request) {
        if (!pageAuthEnabled || envPagesResolver == null) return false;
        ConsolePrincipal principal = principal(request);
        // ADMIN 是全局超管：不受源连接写键/作业过滤限制
        if (principal != null && principal.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) {
            return false;
        }
        return principal != null && principal.getGrantedPages() != null
                && envPagesResolver.inConnModel(principal.getGrantedPages());
    }

    private static ConsolePrincipal principal(HttpServletRequest request) {
        Object attr = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return attr instanceof ConsolePrincipal ? (ConsolePrincipal) attr : null;
    }

    private static Map<String, Object> ok(String key, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        m.put(key, value);
        return m;
    }

    private static String str(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    /** connId 非空优先用已存档案，否则沿用手输 conn。 */
    private RemoteClusterConn pick(RemoteClusterConn manual, String connId, HttpServletRequest request) {
        if (connId == null || connId.trim().isEmpty()) {
            return manual;
        }
        return storedConn(connId, request);
    }

    /**
     * 按 id 取已存档案（含密码，仅服务端流转）；不存在拒、登录角色低于档案 minRole 拒（403）。
     */
    private RemoteClusterConn storedConn(String connId, HttpServletRequest request) {
        RemoteClusterConn conn = connStore.get(connId.trim());
        if (conn == null) {
            throw new IllegalArgumentException("连接不存在或已被删除: " + connId);
        }
        ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        ConsoleRole actual = p instanceof ConsolePrincipal ? ((ConsolePrincipal) p).getRole() : ConsoleRole.VIEWER;
        if (!actual.atLeast(required)) {
            throw new SecurityException("当前角色无权使用该集群连接（需 " + required.name() + "）");
        }
        return conn;
    }
}
