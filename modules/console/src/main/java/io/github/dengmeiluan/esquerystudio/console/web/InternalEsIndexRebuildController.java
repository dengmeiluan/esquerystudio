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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexRebuildService;
import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * (内部) ES 索引控制台运维接口。
 *
 * <p> 阶段⑤：SPI 驱动的重建端点（first-migrate / rebuild / finish / full-reload /
 * cleanup / abort / jobs / lock-release / diagnostics）已整体退役，重建改由
 * {@code adhoc} 路径按索引名执行。本类保留索引诊断、巡检查询与集群级只读能力。</p>
 *
 * <p>由 {@code esquerystudio.elasticsearch.web-enabled=false} 可整体关闭本接口与静态面板。</p>
 *
 * @author aicoding
 **/
@RestController
@RequestMapping("internal/es/index")
public class InternalEsIndexRebuildController {

    private static final Logger log = LoggerFactory.getLogger(InternalEsIndexRebuildController.class);

    private final EsIndexRebuildService esIndexRebuildService;
    private final io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin;
    /** auth.enabled=false 的免鉴权部署仍按历史语义运行；开启鉴权时缺 principal 必须 fail-closed。 */
    private final boolean authRequired;

    /** 连接环境页面模板（可选注入）：拓扑类字段的“按页收窄”需要真实生效页集。 */
    private io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver envPagesResolver;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setEnvPagesResolver(io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver envPagesResolver) {
        this.envPagesResolver = envPagesResolver;
    }

    public InternalEsIndexRebuildController(EsIndexRebuildService esIndexRebuildService,
                                            io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin) {
        this(esIndexRebuildService, esIndexAdmin, true);
    }

    public InternalEsIndexRebuildController(EsIndexRebuildService esIndexRebuildService,
                                            io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin,
                                            boolean authRequired) {
        this.esIndexRebuildService = esIndexRebuildService;
        this.esIndexAdmin = esIndexAdmin;
        this.authRequired = authRequired;
    }

    /**
     * 高危端点不在缺 principal 时回落 ADMIN：拦截器绕过/未装配的部署形态必须 fail-closed，
     * 否则匿名 raw / 模板写 / 快照恢复会走 ADMIN 的无守卫通道。auth 明确关闭时维持免鉴权语义。
     */
    private boolean adminOrFail(javax.servlet.http.HttpServletRequest request) {
        Object p = request == null ? null
                : request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (p instanceof io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) {
            return ((io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) p).getRole()
                    .atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN);
        }
        if (!authRequired) return true;
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录 ES 控制台");
    }

    /**
     * 列出已登记的可重建索引 indexKey。
     */
    @GetMapping("keys")
    public List<String> listIndexKeys() {
        return esIndexRebuildService.listIndexKeys();
    }

    /**
     * 全局总览：一次返回所有已登记 indexKey 的 status 摘要 + 本实例 owner。
     * 前端 hero 一次拉完、少 N 次 RTT。
     */
    @GetMapping("overview")
    public Map<String, Object> overview() {
        return esIndexRebuildService.overview();
    }

    /**
     * 健康度仪表（C7）：动态运行时关键风险快照——锁汇总（本持/他持/过期）。
     * 前端按需刷新。
     */
    @GetMapping("health")
    public Map<String, Object> health() {
        return esIndexRebuildService.health();
    }

    /** Q1: 索引详情快照（mapping/settings/docCount/aliases/sample N 条文档）。 */
    @GetMapping("inspect")
    public Map<String, Object> inspect(@RequestParam String indexKey,
                                       @RequestParam(required = false, defaultValue = "5") int sampleSize) throws IOException {
        return esIndexRebuildService.inspect(indexKey, sampleSize);
    }

    /** Q1: starter 自家系统索引详情（ 阶段⑤后仅剩 lock；job / audit 已随 SPI 重建路径退役）。闸门见 {@link EsIndexRebuildService#inspectSystem}。 */
    @GetMapping("system-inspect")
    public Map<String, Object> systemInspect(@RequestParam String which) throws IOException {
        return esIndexRebuildService.inspectSystem(which);
    }

    /** Q1: 自由 query DSL（运维调试）。 */
    @PostMapping("query")
    public Map<String, Object> queryDsl(@RequestParam String indexKey,
                                        @RequestParam(required = false, defaultValue = "10") int size,
                                        @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws IOException {
        return esIndexRebuildService.queryDsl(indexKey, dslJson, size);
    }

    /** 系统索引 Query DSL（ 阶段⑤后 which 仅接受 lock，其余值 400）。闸门见 {@link EsIndexRebuildService#querySystem}。 */
    @PostMapping("system-query")
    public Map<String, Object> systemQuery(@RequestParam String which,
                                           @RequestParam(required = false, defaultValue = "10") int size,
                                           @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws IOException {
        return esIndexRebuildService.querySystem(which, dslJson, size);
    }

    /** 空索引重建/清空数据：基于 provider 配置重建空索引 → alias swap → 删旧。 */
    @PostMapping("rebuild-empty")
    public Map<String, Object> rebuildEmpty(@RequestParam String indexKey) throws IOException {
        return esIndexRebuildService.rebuildEmpty(indexKey);
    }

    /** Force merge 合并 segment。 */
    @PostMapping("force-merge")
    public Map<String, Object> forceMerge(@RequestParam String indexKey,
                           @RequestParam(required = false, defaultValue = "1") int maxSegments) throws IOException {
        Map<String, Object> r = esIndexRebuildService.forceMerge(indexKey, maxSegments);
        r.put("ok", true);
        return r;
    }

    /** 热更新副本数。 */
    @PostMapping("replicas")
    public void updateReplicas(@RequestParam String indexKey,
                               @RequestParam int count) throws IOException {
        esIndexRebuildService.updateReplicas(indexKey, count);
    }

    /**
     * 查看索引/别名当前状态（用于零停机验证与排障）。
     */
    @GetMapping("status")
    public Map<String, Object> status(@RequestParam String indexKey) throws IOException {
        return esIndexRebuildService.status(indexKey);
    }

    /**
     * 查询 reindex 异步任务进度。
     *
     * @param taskId reindex 任务 id（nodeId:taskNum）
     */
    @GetMapping("progress")
    public ReindexProgress progress(@RequestParam String taskId) throws IOException {
        return esIndexRebuildService.progress(taskId);
    }

    // ═══ 集群级只读查询（不限于 provider 注册的索引）═══

    /** 列出集群全部索引（排除系统索引；控制面索引仅 ADMIN 可见）。 */
    @GetMapping("cluster/indices")
    public java.util.List<Map<String, Object>> clusterIndices(
            javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        java.util.List<Map<String, Object>> list = esIndexAdmin.listClusterIndices();
        boolean admin = adminView(request);
        if (admin) return list;
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map<String, Object> item : list) {
            if (!esIndexAdmin.isControlIndex(String.valueOf(item.get("index")))) out.add(item);
        }
        return out;
    }

    /** 非 ADMIN 的集群读视图不得暴露控制面索引名（账号/连接/审计/锁索引）。 */
    private boolean adminView(javax.servlet.http.HttpServletRequest request) {
        Object p = request == null ? null
                : request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (p instanceof io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) {
            return ((io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) p).getRole()
                    .atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN);
        }
        return !authRequired;
    }

    /**
     * 页面模型下当前身份是否真实持有某页（ADMIN 恒 true）。
     *
     * <p>用于「共享读端点按调用页语义做字段级收窄」：没有页面语义的部署
     * （{@code grantedPages=null} 的静态/内置模型）恒 true=不收窄，保持历史可见性——
     * 否则会把拓扑页正常需要的节点 IP 一起抹掉（有权限的人被拦）。</p>
     */
    private boolean pageVisible(javax.servlet.http.HttpServletRequest request, String page) {
        Object attr = request == null ? null
                : request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (!(attr instanceof io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal)) {
            return !authRequired;
        }
        io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal cp =
                (io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) attr;
        if (cp.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) {
            return true;
        }
        java.util.Set<String> gp = cp.getGrantedPages();
        if (gp == null) {
            return true; // 静态/内置模型：无页语义，维持历史行为
        }
        String h = request.getHeader("X-Es-Target");
        String tid = h == null || h.trim().isEmpty() || "host".equalsIgnoreCase(h.trim())
                ? "host" : h.trim();
        java.util.Set<String> effective = envPagesResolver == null
                ? gp : envPagesResolver.effectivePages(tid, gp);
        if (effective.contains(page)) return true;
        /* 无 resolver 的直调/测试形态：按 conn:{tid}:{page} 精确键判定（与页面门同义）。 */
        return envPagesResolver == null
                && (gp.contains("conn:" + tid + ":" + page)
                    || gp.contains("conn:" + tid + ":w:" + page));
    }

    private boolean clusterScopeAllowed(javax.servlet.http.HttpServletRequest request) {
        Object attr = request == null ? null
                : request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (!(attr instanceof io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal)) {
            return !authRequired;
        }
        io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal cp =
                (io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) attr;
        if (cp.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.CLUSTER_OP)) {
            return true;
        }
        java.util.Set<String> gp = cp.getGrantedPages();
        if (gp == null) {
            return true; // 静态/内置模型：rank 由拦截器裁决，控制器不再二次收缩
        }
        if (envPagesResolver == null) {
            String h = request.getHeader("X-Es-Target");
            String tid = h == null || h.trim().isEmpty() || "host".equalsIgnoreCase(h.trim())
                    ? "host" : h.trim();
            return gp.contains("conn:" + tid + ":cluster-settings")
                    || gp.contains("conn:" + tid + ":w:cluster-settings");
        }
        String h = request.getHeader("X-Es-Target");
        String tid = h == null || h.trim().isEmpty() || "host".equalsIgnoreCase(h.trim())
                ? "host" : h.trim();
        return envPagesResolver.writeAllowed(tid, "cluster-settings", gp);
    }

    /** 集群级任意索引 inspect（只读）。自动解析 indexKey→alias。 */
    @GetMapping("cluster/inspect")
    public Map<String, Object> clusterInspect(@RequestParam String index,
                                              @RequestParam(required = false, defaultValue = "5") int sampleSize,
                                              javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        int capped = Math.max(0, Math.min(sampleSize, 50));
        Object sampleAllowed = request.getAttribute(
                io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_INSPECT_SAMPLE_ALLOWED);
        if (Boolean.FALSE.equals(sampleAllowed)) capped = 0;
        return esIndexAdmin.inspect(resolved, capped);
    }

    /**
     * 采样 date 字段的实际存储形态（只读）。
     *
     * <p>响应带 {@code sampling} 说明取样口径——前端必须一并展示：一份不说明自己怎么取样的
     * 报告，读者会默认它是随机的。</p>
     */
    @GetMapping("cluster/date-forms")
    public Map<String, Object> dateForms(@RequestParam("index") String index,
                                         @RequestParam(value = "size", defaultValue = "50") int size)
            throws java.io.IOException {
        return esIndexRebuildService.dateForms(index, size);
    }

    /** 集群级任意索引 Query DSL（只读）。自动解析 indexKey→alias。 */
    @PostMapping("cluster/query")
    public Map<String, Object> clusterQuery(@RequestParam String index,
                                            @RequestParam(required = false, defaultValue = "10") int size,
                                            @RequestParam(required = false) String routing,
                                            @RequestParam(required = false) String preference,
                                            @RequestParam(value = "search_type", required = false) String searchType,
                                            @RequestParam(value = "allow_partial_search_results", required = false) String allowPartialSearchResults,
                                            @RequestParam(value = "ignore_unavailable", required = false) String ignoreUnavailable,
                                            @RequestParam(value = "expand_wildcards", required = false) String expandWildcards,
                                            @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        /* 1063：请求级 URL 参数白名单透传（不是 body；body 写这些键会被 ES 拒绝） */
        java.util.Map<String, String> req = new java.util.LinkedHashMap<>();
        if (routing != null) req.put("routing", routing);
        if (preference != null) req.put("preference", preference);
        if (searchType != null) req.put("search_type", searchType);
        if (allowPartialSearchResults != null) req.put("allow_partial_search_results", allowPartialSearchResults);
        if (ignoreUnavailable != null) req.put("ignore_unavailable", ignoreUnavailable);
        if (expandWildcards != null) req.put("expand_wildcards", expandWildcards);
        return esIndexAdmin.queryDsl(resolved, dslJson, Math.max(0, Math.min(size, 100)), req);
    }

    /** ES SQL 查询（集群级，只读）。body 为裸 SQL 文本。自动解析 indexKey→物理索引名。 */
    @PostMapping(value = "cluster/sql", consumes = {"text/plain", "application/json"})
    public Map<String, Object> clusterSql(@org.springframework.web.bind.annotation.RequestBody String sql,
                                          javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        if (sql == null || sql.trim().isEmpty()) {
            throw new IllegalArgumentException("SQL 不能为空");
        }
        String cleaned = sql.trim();
        if (cleaned.startsWith("\"") && cleaned.endsWith("\"")) {
            cleaned = cleaned.substring(1, cleaned.length() - 1);
        }
        cleaned = resolveFromInSql(cleaned);
        Map<String, Object> out = esIndexAdmin.executeSql(cleaned, 100);
        rememberSqlCursor(out, request);
        return out;
    }

    private String resolveFromInSql(String sql) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?i)\\bFROM\\s+\"?([\\w\\-.*]+)\"?")
                .matcher(sql);
        if (!m.find()) return sql;
        String tableName = m.group(1);
        String physical = esIndexRebuildService.resolveToPhysical(tableName);
        if (physical.contains("-") || physical.contains("*")) {
            return sql.substring(0, m.start(1) - (sql.charAt(m.start(1)-1)=='"'?1:0))
                    + "\"" + physical + "\""
                    + sql.substring(m.end(1) + (m.end(1)<sql.length() && sql.charAt(m.end(1))=='"'?1:0));
        }
        return sql.substring(0, m.start(1)) + physical + sql.substring(m.end(1));
    }

    // ═══ 集群健康 ═══

    @GetMapping("cluster/health")
    public Map<String, Object> clusterHealth() throws java.io.IOException {
        return esIndexAdmin.clusterHealth();
    }

    // ═══ 文档操作（需要 resolve indexKey） ═══

    @PostMapping("cluster/delete-by-id")
    public Map<String, Object> deleteById(@RequestParam String index, @RequestParam String id) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.deleteById(resolved, id);
    }

    /**
     * 全量覆盖写入单个文档（运维修正脏数据）。body 为完整 _source JSON（整体替换，非字段级合并）。
     * 自动解析 indexKey→alias/物理索引。
     */
    @PostMapping("cluster/update-document")
    public Map<String, Object> updateDocument(@RequestParam String index, @RequestParam String id,
                                              @org.springframework.web.bind.annotation.RequestBody String docJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.updateDocument(resolved, id, docJson);
    }

    // ═══ 索引设置热更新 ═══

    @PostMapping("cluster/update-settings")
    public Map<String, Object> updateSettings(@RequestParam String index,
                                              @org.springframework.web.bind.annotation.RequestBody String settingsJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        @SuppressWarnings("unchecked")
        Map<String, Object> settings = new com.fasterxml.jackson.databind.ObjectMapper().readValue(settingsJson, Map.class);
        return esIndexAdmin.updateSettingsDynamic(resolved, settings);
    }

    // ═══ Mapping 字段管理（PUT _mapping） ═══

    /**
     * 向已有索引添加字段 mapping。ES 仅允许新增字段，不支持删除或修改已有字段类型。
     * body 为 mapping JSON，如 {"properties":{"new_field":{"type":"keyword"}}}
     */
    @PostMapping("cluster/put-mapping")
    public Map<String, Object> putMapping(@RequestParam String index,
                                           @org.springframework.web.bind.annotation.RequestBody String mappingJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.putMapping(resolved, mappingJson);
    }

    /** 手动创建索引（带 settings + mapping），供迁移前先建好目标索引。body: {"settings":"...","mapping":"..."} */
    @PostMapping("cluster/create-index")
    public Map<String, Object> createIndex(@RequestParam String index,
                                           @org.springframework.web.bind.annotation.RequestBody(required = false) Map<String, String> body) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        if (esIndexAdmin.indexExists(resolved)) {
            /* 200-with-{error:true,message} 错误体补 code+endpoint（additive，
               EsErrorMapper.body 口径）——error:true 既有键保留（前端 api.ts 200-with-error
               分支零破坏），code 供前端精确分流，endpoint 定位失败端点 */
            return EsErrorMapper.body("INDEX_EXISTS", "索引已存在: " + resolved, EsErrorMapper.endpointOf(currentRequest()));
        }
        String settingsJson = body != null ? body.get("settings") : null;
        String mappingJson = body != null ? body.get("mapping") : null;
        esIndexAdmin.createIndex(resolved, settingsJson, mappingJson);
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        r.put("ok", true);
        r.put("index", resolved);
        return r;
    }

    /** 手动删除索引（高危，不可恢复）。 */
    @PostMapping("cluster/delete-index")
    public Map<String, Object> deleteIndex(@RequestParam String index) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        if (!esIndexAdmin.indexExists(resolved)) {
            /* 错误体补 code+endpoint（additive，EsErrorMapper.body 口径，同 create-index 注） */
            return EsErrorMapper.body("INDEX_NOT_FOUND", "索引不存在: " + resolved, EsErrorMapper.endpointOf(currentRequest()));
        }
        esIndexAdmin.deleteIndex(resolved);
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        r.put("ok", true);
        r.put("index", resolved);
        return r;
    }

    /**
     * 对任意集群索引/别名执行 force_merge（受管索引走上面的 force-merge?indexKey=）。
     * 重操作：重写段文件、大量 IO、期间搜索延迟升高；不要对仍在写入的索引执行。
     * 合并出的大于 5GB 的单段不再参与后续 merge，大索引不应盲目合到 1 段。
     */
    @PostMapping("cluster/force-merge")
    public Map<String, Object> clusterForceMerge(@RequestParam String index,
                                                 @RequestParam(required = false, defaultValue = "1") int maxSegments) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        if (!esIndexAdmin.indexExists(resolved)) {
            /* 错误体补 code+endpoint（additive，EsErrorMapper.body 口径，同 create-index 注） */
            return EsErrorMapper.body("INDEX_NOT_FOUND", "索引不存在: " + resolved, EsErrorMapper.endpointOf(currentRequest()));
        }
        if (maxSegments < 1) {
            return EsErrorMapper.body("BAD_REQUEST", "maxSegments 必须大于等于 1，当前: " + maxSegments,
                    EsErrorMapper.endpointOf(currentRequest()));
        }
        Map<String, Object> fm = esIndexAdmin.forceMerge(resolved, maxSegments);
        r.put("ok", true);
        r.put("index", resolved);
        r.put("maxSegments", maxSegments);
        r.put("taskId", fm.get("task"));
        return r;
    }

    // ═══ : Query Profiler / Count 预估 / REST Playground / 部分更新 ═══

    /** Profile 查询：注入 profile:true 执行 _search，返回完整原始响应（含 profile breakdown）。 */
    @PostMapping(value = "cluster/profile", produces = "application/json")
    public String clusterProfile(@RequestParam String index,
                                 @RequestParam(required = false) String routing,
                                 @RequestParam(required = false) String preference,
                                 @RequestParam(value = "search_type", required = false) String searchType,
                                 @RequestParam(value = "allow_partial_search_results", required = false) String allowPartialSearchResults,
                                 @RequestParam(value = "ignore_unavailable", required = false) String ignoreUnavailable,
                                 @RequestParam(value = "expand_wildcards", required = false) String expandWildcards,
                                 @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        java.util.Map<String, String> req = new java.util.LinkedHashMap<>();
        if (routing != null) req.put("routing", routing);
        if (preference != null) req.put("preference", preference);
        if (searchType != null) req.put("search_type", searchType);
        if (allowPartialSearchResults != null) req.put("allow_partial_search_results", allowPartialSearchResults);
        if (ignoreUnavailable != null) req.put("ignore_unavailable", ignoreUnavailable);
        if (expandWildcards != null) req.put("expand_wildcards", expandWildcards);
        return esIndexAdmin.profile(resolved, dslJson, req);
    }

    /** dry-run 计数：提取 dsl.query 执行 _count（删除预估等高危操作前置）。 */
    @PostMapping("cluster/count")
    public Map<String, Object> clusterCount(@RequestParam String index,
                                            @org.springframework.web.bind.annotation.RequestBody(required = false) String dslJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.count(resolved, dslJson);
    }

    /** REST Playground：透传任意 ES REST 调用（method 白名单 + path 校验）。body: {method, path, body}
     *  执行摘要回填 request attribute（拦截器 afterCompletion 落入 HIGH_RISK detail）——
     *  高危操作审计从「谁调过 raw」到「谁执行了什么」。 */
    @PostMapping("cluster/raw")
    public Map<String, Object> clusterRaw(@org.springframework.web.bind.annotation.RequestBody Map<String, String> req,
                                          javax.servlet.http.HttpServletRequest request) throws IOException {
        return executePassthrough(req, request);
    }

    /**
     * DevTools 独立透传端点：与 raw 同一执行内核，但归属 devtools 页写键（也兼容 rest 写键）。
     * 这样「DevTools 无写操作」的权限面板错误消失，且 w:devtools 可单独授权、无需借 rest 页。
     */
    @PostMapping("cluster/devtools/execute")
    public Map<String, Object> clusterDevtoolsExecute(
            @org.springframework.web.bind.annotation.RequestBody Map<String, String> req,
            javax.servlet.http.HttpServletRequest request) throws IOException {
        return executePassthrough(req, request);
    }

    /** 透传请求体上限（字符量≈字节量级）：超限直接拒绝，ES 转发与客户端缓冲都不再发生。 */
    static final int RAW_BODY_LIMIT_CHARS = 32 * 1024 * 1024;

    private Map<String, Object> executePassthrough(Map<String, String> req,
                                                   javax.servlet.http.HttpServletRequest request) throws IOException {
        String rawBody = req.get("body");
        if (rawBody != null && rawBody.length() > RAW_BODY_LIMIT_CHARS) {
            throw new IllegalArgumentException("透传请求体超过上限（约 32M 字符），请拆分批量任务");
        }
        boolean admin = adminOrFail(request);
        /* 拦截器只判「能否进这个端点」；内层真实方法的读/写分档在这里做最终裁决。
           只读身份（宿主只授 conn:{id}:devtools 读键）拿到的是一条**真正的只读通道**：
           内层只读请求照常执行，内层写请求直接拒绝——而不是整个端点一起封死。
           属性缺失（老路径/未打标）= 走原有严格口径，行为不变。 */
        boolean readOnlyOnly = Boolean.TRUE.equals(
                request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
        if (readOnlyOnly && !io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor
                .isReadonlyEsRequest(req.get("method"), req.get("path"))) {
            throw new io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException(
                    "当前身份对该连接只有只读权限：内层 " + req.get("method") + " " + req.get("path")
                            + " 属写操作，已拒绝。如需写操作，请联系管理员在宿主系统中授予该连接的"
                            + "「DevTools / REST 直连」写权限");
        }
        try {
            org.springframework.web.context.request.RequestAttributes ra =
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (ra != null) {
                ra.setAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_RAW_SUMMARY,
                        req.get("method") + " " + req.get("path"),
                        org.springframework.web.context.request.RequestAttributes.SCOPE_REQUEST);
            }
        } catch (Exception e) {
            // 原 catch(Exception ignore) 整段静默——本次高危审计将缺执行摘要
            // 且无痕（审计链断点）。低频用户路径直接 WARN 不节流；回填失败不影响执行契约不变
            log.warn("[esquerystudio-raw] 审计摘要回填失败(本次高危审计缺执行摘要): {}", e.getMessage(), e);
        }
        /* PIT id 是服务端资源的持有凭据：控制台内打开的 id 绑定执行者，换号/他人不得续用。
           ES 的 ?source= 与请求体同权——只查 body 会让「GET /{index}/_search?source={"pit":...}」
           绕过归属判定；DELETE /_pit 的 id 又在根级（不是 pit.id），同样必须覆盖。 */
        String sourceBody = sourceFromPath(req.get("path"));
        guardPitOwnership(rawBody, sourceBody, req.get("method"), req.get("path"), request, admin);
        guardRawSqlCursor(rawBody, req.get("path"), request, admin);
        /* 连接模型 rest 写键持有人可使用 raw 访问业务索引，但控制面索引仍仅 ADMIN 可达 */
        Map<String, Object> result = admin
                ? esIndexAdmin.raw(req.get("method"), req.get("path"), req.get("body"))
                : sanitizeRawEnvelope(esIndexAdmin.rawGuarded(req.get("method"), req.get("path"), req.get("body")));
        rememberRawSqlCursor(req.get("path"), result, request);
        rememberPitCall(req.get("method"), req.get("path"), rawBody, sourceBody, result, request, admin);
        return result;
    }

    /** 页面端点（PIT search）只带 body 的简洁入口。 */
    private void guardPitOwnership(String body, javax.servlet.http.HttpServletRequest request, boolean admin) {
        guardPitOwnership(body, null, null, null, request, admin);
    }

    /** 本请求是否在操作某个已登记的 PIT：非归属者（非 ADMIN）拒绝。未登记=控制台外资源，维持放行。 */
    private void guardPitOwnership(String body, String sourceBody, String method, String path,
                                   javax.servlet.http.HttpServletRequest request, boolean admin) {
        guardPitOwnershipById(pitIdFromBody(body), request, admin);
        if (sourceBody != null) {
            guardPitOwnershipById(pitIdFromBody(sourceBody), request, admin);
        }
        /* 关闭 PIT 的 body 是根级 {"id":...}（不是 {"pit":{"id":...}}），旧解析永远取不到 id。 */
        if (isPitClose(method, path)) {
            guardPitOwnershipById(rootIdFromBody(body), request, admin);
            if (sourceBody != null) {
                guardPitOwnershipById(rootIdFromBody(sourceBody), request, admin);
            }
        }
    }

    /** DELETE /_pit（含带 query 形态）才是关闭 PIT；搜索/开启 PIT 不走根级 id。 */
    static boolean isPitClose(String method, String path) {
        if (method == null || path == null || !"DELETE".equalsIgnoreCase(method.trim())) return false;
        String clean = path.split("\\?")[0].toLowerCase(java.util.Locale.ROOT);
        while (clean.endsWith("/") && clean.length() > 1) clean = clean.substring(0, clean.length() - 1);
        return clean.endsWith("/_pit") || "/_pit".equals(clean);
    }

    /** ES 的 ?source= 与请求体同权：提取并解码（重复参数取首值，与 rawGuarded 的拒绝口径一致）。 */
    static String sourceFromPath(String path) {
        if (path == null) return null;
        int q = path.indexOf('?');
        if (q < 0) return null;
        String source = null;
        boolean seen = false;
        for (String pair : path.substring(q + 1).split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            final String key;
            final String value;
            try {
                key = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                value = java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
            } catch (Exception e) {
                continue; /* 编码非法：rawGuarded 对非 ADMIN fail-closed，这里不因解析失败放行归属 */
            }
            if (!"source".equals(key)) continue;
            if (seen) return source;
            seen = true;
            source = value;
        }
        return source == null || source.trim().isEmpty() ? null : source;
    }

    /** 按 id 判定归属（关闭 PIT 直接走这里，避免拼接 JSON 时被非法字符绕过判定）。 */
    private void guardPitOwnershipById(String pitId, javax.servlet.http.HttpServletRequest request, boolean admin) {
        if (pitId == null || pitId.trim().isEmpty()) return;
        ConsolePrincipal p = principal(request);
        if (p == null) return; // 免鉴权部署
        if (!io.github.dengmeiluan.esquerystudio.console.auth.PitOwnership.allows(pitId, p.getUsername(), admin)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "PIT id 由 " + io.github.dengmeiluan.esquerystudio.console.auth.PitOwnership.owner(pitId)
                            + " 开启：PIT id 即凭据，仅开启者本人或 ADMIN 可使用；"
                            + "账号切换后请重新打开 PIT（旧 id 不会随新身份放行）");
        }
    }

    /** raw 开/关 PIT 的归属登记：开启绑定当前身份，关闭释放（body 与 ?source= 两种形态都认）。 */
    private void rememberPitCall(String method, String path, String body, String sourceBody,
                                 Map<String, Object> result,
                                 javax.servlet.http.HttpServletRequest request, boolean admin) {
        if (path == null || result == null || method == null) return;
        String clean = path.split("\\?")[0];
        while (clean.endsWith("/") && clean.length() > 1) clean = clean.substring(0, clean.length() - 1);
        if (!clean.toLowerCase(java.util.Locale.ROOT).endsWith("/_pit")) return;
        ConsolePrincipal p = principal(request);
        if ("DELETE".equalsIgnoreCase(method)) {
            /* 关闭 PIT 是根级 id；?source= 形态同样释放，避免登记表残留旧 id。 */
            String bodyId = rootIdFromBody(body);
            if (bodyId != null) io.github.dengmeiluan.esquerystudio.console.auth.PitOwnership.release(bodyId);
            String sourceId = rootIdFromBody(sourceBody);
            if (sourceId != null) io.github.dengmeiluan.esquerystudio.console.auth.PitOwnership.release(sourceId);
            return;
        }
        if (!"POST".equalsIgnoreCase(method)) return;
        Object id = result.get("id");
        if (id != null && p != null) {
            io.github.dengmeiluan.esquerystudio.console.auth.PitOwnership.register(String.valueOf(id), p.getUsername(),
                    admin ? 7L * 24L * 3_600_000L : 2L * 3_600_000L);
        }
    }

    /** 根级 {"id":"..."}（DELETE /_pit 的关闭形态）；与 search body 的 pit.id 区分。 */
    static String rootIdFromBody(String body) {
        if (body == null || body.trim().isEmpty() || body.indexOf("\"id\"") < 0) return null;
        try {
            com.fasterxml.jackson.databind.JsonNode root = SCRIPT_MAPPER.readTree(body);
            com.fasterxml.jackson.databind.JsonNode id = root == null ? null : root.get("id");
            if (id == null || !id.isValueNode()) return null;
            String v = id.asText();
            return v == null || v.trim().isEmpty() ? null : v.trim();
        } catch (Exception e) {
            return null;
        }
    }

    static String pitIdFromBody(String body) {
        if (body == null || body.trim().isEmpty()) return null;
        /* 大 body（bulk 可达 32MB）先做廉价子串判定，避免每次 raw 请求整树解析。 */
        if (body.indexOf("\"pit\"") < 0) return null;
        try {
            com.fasterxml.jackson.databind.JsonNode root = SCRIPT_MAPPER.readTree(body);
            com.fasterxml.jackson.databind.JsonNode pit = root == null ? null : root.get("pit");
            com.fasterxml.jackson.databind.JsonNode id = pit == null ? null : pit.get("id");
            if (id == null || !id.isValueNode()) return null;
            String v = id.asText();
            return v == null || v.trim().isEmpty() ? null : v.trim();
        } catch (Exception e) {
            return null;
        }
    }

    private static ConsolePrincipal principal(javax.servlet.http.HttpServletRequest request) {
        Object attr = request == null ? null
                : request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return attr instanceof ConsolePrincipal ? (ConsolePrincipal) attr : null;
    }

    /** 非 ADMIN 的成功信封体与错误路径同口径脱敏：bulk 逐条 failure、_msearch 逐项 error、
     *  _shards.failures 里同样内嵌目标集群节点坐标；文本替换不改变 JSON 结构。 */
    private static Map<String, Object> sanitizeRawEnvelope(Map<String, Object> result) {
        if (result == null) {
            return null;
        }
        Object body = result.get("body");
        if (body instanceof String) {
            result.put("body", EsErrorMapper.sanitizeTopology((String) body));
        }
        return result;
    }

    /** 字段级部分更新：body 为 {"field":val,...}（_update partial doc，非整体覆盖）。 */
    @PostMapping("cluster/update-partial")
    public Map<String, Object> updatePartial(@RequestParam String index, @RequestParam String id,
                                             @org.springframework.web.bind.annotation.RequestBody String partialDocJson) throws java.io.IOException {
        String resolved = esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.updatePartial(resolved, id, partialDocJson);
    }

    // ═══ : 集群运维观测端点（tasks/allocation/hot_threads/pending/nodes_stats/analyze/aliases） ═══

    /** 列出集群当前运行中的任务（_tasks）。actions 可用、寒开列过滤 */
    @GetMapping("cluster/tasks")
    public java.util.List<Map<String, Object>> clusterTasks(@RequestParam(required = false) String actions,
                                                            @RequestParam(required = false, defaultValue = "true") boolean detailed) throws java.io.IOException {
        return esIndexAdmin.listTasks(actions, detailed);
    }

    /** 取消集群任务（仅对 cancellable=true 生效） */
    @PostMapping("cluster/tasks/cancel")
    public Map<String, Object> clusterCancelTask(@RequestParam String taskId) throws java.io.IOException {
        return esIndexAdmin.cancelTask(taskId);
    }

    /** 分片分配诊断。body 可选 {index,shard,primary}；为空则按 unassigned 自选 */
    @PostMapping("cluster/allocation-explain")
    public Map<String, Object> clusterAllocationExplain(@org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.allocationExplain(body);
    }

    /** 热点线程（纯文本，可选 nodeId 过滤单节点） */
    @GetMapping(value = "cluster/hot-threads", produces = "text/plain;charset=UTF-8")
    public String clusterHotThreads(@RequestParam(required = false, defaultValue = "3") int threads,
                                    @RequestParam(required = false, defaultValue = "500ms") String interval,
                                    @RequestParam(required = false, defaultValue = "cpu") String type,
                                    @RequestParam(required = false) String nodeId) throws java.io.IOException {
        return esIndexAdmin.hotThreads(Math.max(1, Math.min(threads, 10)), interval, type, nodeId);
    }

    /** Master 待处理任务 */
    @GetMapping("cluster/pending-tasks")
    public Map<String, Object> clusterPendingTasks() throws java.io.IOException {
        return esIndexAdmin.pendingTasks();
    }

    /** 节点运行时 stats（jvm/fs/os/thread_pool） */
    @GetMapping("cluster/nodes-stats")
    public java.util.List<Map<String, Object>> clusterNodesStats() throws java.io.IOException {
        return esIndexAdmin.nodesStats();
    }

    /** 分词器测试。index 可空或 _analyze 走全局；body 为自由 _analyze DSL */
    @PostMapping("cluster/analyze")
    public Map<String, Object> clusterAnalyze(@RequestParam(required = false) String index,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        String resolved = (index == null || index.isEmpty()) ? null : esIndexRebuildService.resolveToPhysical(index);
        return esIndexAdmin.analyze(resolved, body);
    }

    /** 别名全图（排除系统索引，扁平列表） */
    @GetMapping("cluster/aliases")
    public java.util.List<Map<String, Object>> clusterAliases(
            javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        java.util.List<Map<String, Object>> list = esIndexAdmin.listAllAliases();
        if (adminView(request)) return list;
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map<String, Object> row : list) {
            if (!esIndexAdmin.isControlIndex(String.valueOf(row.get("index")))) out.add(row);
        }
        return out;
    }

    // ═══ : 平台/分布式能力端点（templates / snapshot / shards distribution） ═══

    /** 列出索引模板 + 组件模板并集 */
    @GetMapping("cluster/templates")
    public Map<String, Object> clusterTemplates() throws java.io.IOException {
        return esIndexAdmin.listTemplates();
    }

    /** 创建/更新模板。kind 取值 index|component；body 为完整的模板 JSON */
    @PostMapping("cluster/templates/put")
    public Map<String, Object> clusterPutTemplate(@RequestParam String name,
                                                  @RequestParam(defaultValue = "index") String kind,
                                                  @org.springframework.web.bind.annotation.RequestBody String body,
                                                  javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        boolean admin = adminOrFail(request);
        /* 组件模板没有 index_patterns 可供守卫判定，却会被索引模板（可能覆盖控制面模式）
           引用：改它等于改所有未来匹配索引的 settings/mappings。按集群级动作处理。 */
        if (!admin && !"index".equalsIgnoreCase(kind) && !clusterScopeAllowed(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "组件模板是集群级共享件（被索引模板引用，影响未来所有匹配索引）："
                            + "需要 CLUSTER_OP 及以上角色，或该连接的「集群设置」写权限；"
                            + "普通索引模板仍可按 index_patterns 守卫写入");
        }
        return admin
                ? esIndexAdmin.putTemplateAdmin(kind, name, body)
                : esIndexAdmin.putTemplate(kind, name, body);
    }

    /** 删除模板 */
    @PostMapping("cluster/templates/delete")
    public Map<String, Object> clusterDeleteTemplate(@RequestParam String name,
                                                     @RequestParam(defaultValue = "index") String kind,
                                                     javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        /* 写有守卫、删无守卫是同一口径的破口：非 ADMIN 必须按模板真实 index_patterns
           判定（读回再删），不能凭模板名删掉覆盖控制面模式的集群模板。 */
        if (!adminView(request) && !"index".equalsIgnoreCase(kind) && !clusterScopeAllowed(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "组件模板是集群级共享件：删除需要 CLUSTER_OP 及以上角色，或该连接的「集群设置」写权限");
        }
        return adminView(request)
                ? esIndexAdmin.deleteTemplate(kind, name)
                : esIndexAdmin.deleteTemplateGuarded(kind, name);
    }

    /** Snapshot repositories 列表（非 ADMIN 脱敏云存储凭据） */
    @GetMapping("cluster/snapshot/repos")
    public java.util.List<Map<String, Object>> clusterSnapshotRepos(javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        java.util.List<Map<String, Object>> repos = esIndexAdmin.listSnapshotRepositories();
        return adminOrFail(request) ? repos : io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin.maskSnapshotRepoSecrets(repos);
    }

    /** 指定 repo 下快照列表（非 ADMIN 去掉控制面索引名） */
    @GetMapping("cluster/snapshot/list")
    public java.util.List<Map<String, Object>> clusterSnapshotList(@RequestParam String repo,
                                                                   javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        java.util.List<Map<String, Object>> rows = esIndexAdmin.listSnapshots(repo);
        if (adminView(request)) return rows;
        return (java.util.List<Map<String, Object>>) sanitizeSnapshotView(rows);
    }

    /** 快照读侧控制面索引脱敏：快照页只该看到业务索引名。 */
    private Object sanitizeSnapshotView(Object node) {
        if (node instanceof String) {
            return esIndexAdmin.isControlIndex((String) node) ? null : node;
        }
        if (node instanceof Map) {
            Map<?, ?> src = (Map<?, ?>) node;
            Object idx = src.get("index");
            if (idx instanceof String && esIndexAdmin.isControlIndex((String) idx)) return null;
            java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
            for (java.util.Map.Entry<?, ?> e : src.entrySet()) {
                String key = String.valueOf(e.getKey());
                if (esIndexAdmin.isControlIndex(key)) continue;
                Object value = sanitizeSnapshotView(e.getValue());
                if (value != null) out.put(key, value);
            }
            return out;
        }
        if (node instanceof java.util.List) {
            java.util.List<Object> out = new java.util.ArrayList<>();
            for (Object one : (java.util.List<?>) node) {
                Object value = sanitizeSnapshotView(one);
                if (value != null) out.add(value);
            }
            return out;
        }
        return node;
    }

    /** 创建快照（非阻塞）。body 可传 indices/include_global_state/partial 等 */
    @PostMapping("cluster/snapshot/create")
    public Map<String, Object> clusterCreateSnapshot(@RequestParam String repo,
                                                     @RequestParam String name,
                                                     @org.springframework.web.bind.annotation.RequestBody(required = false) String body,
                                                     javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        boolean admin = adminOrFail(request);
        /* 非 ADMIN：必须显式业务 indices，禁止全量/控制面/全局状态打包外带 */
        return admin
                ? esIndexAdmin.createSnapshot(repo, name, body)
                : esIndexAdmin.createSnapshotGuarded(repo, name, body);
    }

    /** 恢复快照（非阻塞）。body 可传 indices/rename_pattern/rename_replacement/include_global_state 等 */
    @PostMapping("cluster/snapshot/restore")
    public Map<String, Object> clusterRestoreSnapshot(@RequestParam String repo,
                                                      @RequestParam String name,
                                                      @org.springframework.web.bind.annotation.RequestBody(required = false) String body,
                                                      javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        boolean admin = adminOrFail(request);
        /* 非 ADMIN：必须显式业务 indices，禁止 restore-all 覆盖控制面索引 */
        return admin
                ? esIndexAdmin.restoreSnapshot(repo, name, body)
                : esIndexAdmin.restoreSnapshotGuarded(repo, name, body);
    }

    /** 删除快照（过期快照清理） */
    @DeleteMapping("cluster/snapshot/delete")
    public Map<String, Object> clusterDeleteSnapshot(@RequestParam String repo,
                                                     @RequestParam String name,
                                                     javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        boolean admin = adminOrFail(request);
        return admin
                ? esIndexAdmin.deleteSnapshot(repo, name)
                : esIndexAdmin.deleteSnapshotGuarded(repo, name);
    }

    /** 分片分布（_cat/shards）结构化 */
    @GetMapping("cluster/shards")
    public java.util.List<Map<String, Object>> clusterShards(
            @RequestParam(required = false) String index,
            javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        java.util.List<Map<String, Object>> list = esIndexAdmin.shardsDistribution(index);
        if (adminView(request)) return list;
        /* 分片行的 ip 是节点内网坐标：overview/indices 只需要 node 名做分组，
           只有拓扑页（TopologyView）真正渲染 IP。按页面语义收窄，避免“顺带泄露”；
           静态模型 pageVisible 恒 true，不受影响。 */
        boolean topologyPage = pageVisible(request, "topology");
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map<String, Object> row : list) {
            if (esIndexAdmin.isControlIndex(String.valueOf(row.get("index")))) continue;
            if (topologyPage) {
                out.add(row);
            } else {
                Map<String, Object> trimmed = new java.util.LinkedHashMap<>(row);
                trimmed.remove("ip");
                out.add(trimmed);
            }
        }
        return out;
    }

    /* ================= : 搜索沙盒 / 热Setting / Reroute / ILM ================= */

    /** DSL 沙盒（支持 explain / profile） */
    @PostMapping("cluster/search-dsl")
    public Map<String, Object> clusterSearchDsl(@RequestParam(required = false) String index,
                                                @RequestParam(defaultValue = "false") boolean explain,
                                                @RequestParam(defaultValue = "false") boolean profile,
                                                @org.springframework.web.bind.annotation.RequestBody(required = false) String body,
                                                javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        if (index == null || index.trim().isEmpty()) {
            Object p = request == null ? null
                    : request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PRINCIPAL);
            boolean admin = p instanceof io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal
                    && ((io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) p).getRole()
                        .atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN);
            if (!admin) {
                throw new io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException(
                        "全量 DSL 搜索必须显式指定索引（控制面索引不可触达）");
            }
        }
        return esIndexAdmin.searchDsl(index, body, explain, profile);
    }

    /** 获取索引 settings（含默认） */
    @GetMapping("cluster/index-settings")
    public Map<String, Object> clusterGetIndexSettings(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.getIndexSettings(index);
    }

    /** 热更新索引 settings */
    @PostMapping("cluster/index-settings/update")
    public Map<String, Object> clusterUpdateIndexSettings(@RequestParam String index,
                                                          @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.updateIndexSettings(index, body);
    }

    /** 集群 reroute（手工搜片） */
    @PostMapping("cluster/reroute")
    public Map<String, Object> clusterReroute(@RequestParam(defaultValue = "false") boolean dryRun,
                                              @RequestParam(defaultValue = "true") boolean explain,
                                              @RequestParam(defaultValue = "false") boolean retryFailed,
                                              @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.clusterReroute(body, dryRun, explain, retryFailed);
    }

    /** 诊断页“重试失败分片”：固定 retry_failed=true，不接受任意 reroute commands。 */
    @PostMapping("cluster/reroute/retry-failed")
    public Map<String, Object> clusterRerouteRetryFailed() throws java.io.IOException {
        return esIndexAdmin.clusterReroute("{}", false, false, true);
    }

    /** ILM 策略列表 */
    @GetMapping("cluster/ilm/policies")
    public java.util.List<Map<String, Object>> clusterIlmPolicies() throws java.io.IOException {
        return esIndexAdmin.listIlmPolicies();
    }

    /** 创建/更新 ILM 策略 */
    @PutMapping("cluster/ilm/policy")
    public Map<String, Object> clusterPutIlmPolicy(@RequestParam String name,
                                                   @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.putIlmPolicy(name, body);
    }

    /** 删除 ILM 策略 */
    @DeleteMapping("cluster/ilm/policy")
    public Map<String, Object> clusterDeleteIlmPolicy(@RequestParam String name) throws java.io.IOException {
        return esIndexAdmin.deleteIlmPolicy(name);
    }

    /** 索引 ILM explain */
    @GetMapping("cluster/ilm/explain")
    public Map<String, Object> clusterIlmExplain(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.explainIlm(index);
    }

    /* =============================================================
     * 集群设置 / Task 详情 / Shard Stores / Snapshot Status / Reindex Preview
     * ============================================================= */

    /** 集群级设置全景（persistent/transient/defaults）*/
    @GetMapping("cluster/settings")
    public Map<String, Object> clusterSettings() throws java.io.IOException {
        return esIndexAdmin.getClusterSettings();
    }

    /** 索引 settings 含集群默认值（include_defaults）——Settings 面板「看全」手段；
     *  只读透传，不在 ADMIN 关键词内，VIEWER 可用（raw 是 ADMIN-only，不能拿它兼职）。 */
    @GetMapping("cluster/index-settings-defaults")
    public Map<String, Object> indexSettingsWithDefaults(@RequestParam String index) throws java.io.IOException {
        /* 精确索引名守卫 + 服务端再编码：此前直接拼 raw()，%2565 双重编码可借 ES 再解码读控制面。 */
        return esIndexAdmin.getIndexSettingsWithDefaults(index);
    }

    /** 集群级设置下发（传 null 重置）*/
    @PostMapping("cluster/settings/put")
    public Map<String, Object> clusterSettingsPut(
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.putClusterSettings(body);
    }

    /** 分片存储分布 */
    @GetMapping("cluster/shard-stores")
    public Map<String, Object> clusterShardStores(@RequestParam(required = false) String index,
                                                  @RequestParam(required = false) String status) throws java.io.IOException {
        return esIndexAdmin.shardStores(index, status);
    }

    /** 快照进度详情（缺省原始透传逐字节不变；{@code ?summary=true} 走分片级归一化摘要，前端进度条直接可用） */
    @GetMapping("cluster/snapshot/status")
    public Map<String, Object> clusterSnapshotStatus(@RequestParam(required = false) String repo,
                                                     @RequestParam(required = false) String name,
                                                     @RequestParam(required = false, defaultValue = "false") boolean summary) throws java.io.IOException {
        Map<String, Object> out;
        if (summary) {
            out = esIndexAdmin.snapshotStatusSummary(repo, name);
        } else {
            out = esIndexAdmin.snapshotStatus(repo, name);
        }
        return adminView(currentRequest()) ? out : (Map<String, Object>) sanitizeSnapshotView(out);
    }

    /** 单任务详情 */
    @GetMapping("cluster/task-detail")
    public Map<String, Object> clusterTaskDetail(@RequestParam String taskId) throws java.io.IOException {
        return esIndexAdmin.taskDetail(taskId);
    }

    /** Reindex 预估（不写入任何数据）*/
    @PostMapping("cluster/reindex-preview")
    public Map<String, Object> clusterReindexPreview(@RequestParam String source,
                                                     @org.springframework.web.bind.annotation.RequestBody(required = false) String query) throws java.io.IOException {
        return esIndexAdmin.reindexPreview(source, query);
    }

    /* ======== ：一键综合体检 ======== */
    /** 一键集群体检：聚合 cluster health + 不健康索引 + pending tasks + 节点负载，产出评分与建议 */
    @GetMapping("cluster/health-report")
    public Map<String, Object> clusterHealthReport() throws java.io.IOException {
        return esIndexAdmin.healthReport();
    }

    /* ======== ：分布式运维 - SLM / Watcher / Remote Clusters ======== */
    /** SLM 快照策略列表 */
    @GetMapping("cluster/slm/policies")
    public Map<String, Object> clusterSlmPolicies() throws java.io.IOException {
        return esIndexAdmin.slmPolicies();
    }

    /** SLM 立即执行某策略 */
    @PostMapping("cluster/slm/execute")
    public Map<String, Object> clusterSlmExecute(@RequestParam String policyId) throws java.io.IOException {
        return esIndexAdmin.slmExecute(policyId);
    }

    /** SLM 全局运行状态 + 统计 */
    @GetMapping("cluster/slm/status")
    public Map<String, Object> clusterSlmStatus() throws java.io.IOException {
        return esIndexAdmin.slmStatus();
    }

    /** Watcher 告警列表 + 统计 */
    @GetMapping("cluster/watcher")
    public Map<String, Object> clusterWatcherList() throws java.io.IOException {
        return esIndexAdmin.watcherList();
    }

    /** 远程集群配置 + 连接状态（CCS/CCR） */
    @GetMapping("cluster/remote-clusters")
    public Map<String, Object> clusterRemoteClusters(javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        Map<String, Object> out = esIndexAdmin.remoteClusters();
        /* 工作台只消费 count：远端 seeds/地址属拓扑面，按页面语义收窄（远程集群页保留全量）。 */
        if (adminView(request) || pageVisible(request, "remote-clusters")) return out;
        Map<String, Object> restricted = new java.util.LinkedHashMap<>();
        restricted.put("remotes", java.util.Collections.emptyMap());
        restricted.put("count", out.get("count"));
        restricted.put("localClusterName", out.get("localClusterName"));
        restricted.put("localVersion", out.get("localVersion"));
        restricted.put("restricted", true);
        restricted.put("reason", "当前视图只需要远端连接数量；seeds/地址请在「远程集群」页查看");
        return restricted;
    }

    /** ➕：高级 Reindex — 自定义目标集群 / 自由 body / 全参数开放 */
    @PostMapping("cluster/reindex-advanced")
    public Map<String, Object> clusterReindexAdvanced(
            @RequestParam(required = false) String slices,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String waitForCompletion,
            @RequestParam(required = false) String requestsPerSecond,
            @RequestParam(required = false) String scroll,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String waitForActiveShards,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("slices", slices);
        opts.put("refresh", refresh);
        opts.put("waitForCompletion", waitForCompletion);
        opts.put("requestsPerSecond", requestsPerSecond);
        opts.put("scroll", scroll);
        opts.put("timeout", timeout);
        opts.put("waitForActiveShards", waitForActiveShards);
        return esIndexAdmin.reindexAdvanced(body, opts);
    }

    /* ======== ：分布式自定义 - 批量编辑 / SQL / 文档直编 ======== */

    /** _update_by_query：按自定义 query 批量更新 */
    @PostMapping("cluster/update-by-query")
    public Map<String, Object> clusterUpdateByQuery(
            @RequestParam String index,
            @RequestParam(required = false) String conflicts,
            @RequestParam(required = false) String slices,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String waitForCompletion,
            @RequestParam(required = false) String requestsPerSecond,
            @RequestParam(required = false) String scroll,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String waitForActiveShards,
            @RequestParam(required = false) String maxDocs,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("conflicts", conflicts); opts.put("slices", slices); opts.put("refresh", refresh);
        opts.put("waitForCompletion", waitForCompletion); opts.put("requestsPerSecond", requestsPerSecond);
        opts.put("scroll", scroll); opts.put("timeout", timeout);
        opts.put("waitForActiveShards", waitForActiveShards); opts.put("maxDocs", maxDocs);
        return esIndexAdmin.updateByQuery(index, body, opts);
    }

    /** _delete_by_query：按自定义 query 批量删除 */
    @PostMapping("cluster/delete-by-query")
    public Map<String, Object> clusterDeleteByQuery(
            @RequestParam String index,
            @RequestParam(required = false) String conflicts,
            @RequestParam(required = false) String slices,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String waitForCompletion,
            @RequestParam(required = false) String requestsPerSecond,
            @RequestParam(required = false) String scroll,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String maxDocs,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("conflicts", conflicts); opts.put("slices", slices); opts.put("refresh", refresh);
        opts.put("waitForCompletion", waitForCompletion); opts.put("requestsPerSecond", requestsPerSecond);
        opts.put("scroll", scroll); opts.put("timeout", timeout); opts.put("maxDocs", maxDocs);
        return esIndexAdmin.deleteByQuery(index, body, opts);
    }

    /** _bulk：直接下发 NDJSON（无 index 时只进行 collection） */
    @PostMapping("cluster/bulk")
    public Map<String, Object> clusterBulk(
            @RequestParam(required = false) String index,
            @RequestParam(required = false) String refresh,
            @RequestParam(required = false) String pipeline,
            @RequestParam(required = false) String timeout,
            @RequestParam(required = false) String waitForActiveShards,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        Map<String, String> opts = new java.util.LinkedHashMap<>();
        opts.put("refresh", refresh); opts.put("pipeline", pipeline);
        opts.put("timeout", timeout); opts.put("waitForActiveShards", waitForActiveShards);
        return esIndexAdmin.bulk(index, body, opts);
    }

    /** _sql 查询（JSON body）—— 与 cluster/sql（纯文本 SQL）区分 */
    @PostMapping("cluster/sql/query")
    public Map<String, Object> clusterSqlJson(@org.springframework.web.bind.annotation.RequestBody String body,
                                              javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        Map<String, Object> out = esIndexAdmin.sqlQuery(body);
        rememberSqlCursor(out, request);
        return out;
    }
    /** _sql/translate 把 SQL 转成 DSL */
    @PostMapping("cluster/sql/translate")
    public Map<String, Object> clusterSqlTranslate(@org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.sqlTranslate(body);
    }
    /** _sql 分页 cursor（cursor 即结果集凭据：仅开启者本人或 ADMIN 可续页） */
    @PostMapping("cluster/sql/cursor")
    public Map<String, Object> clusterSqlCursor(@RequestParam String cursor,
                                                @RequestParam(required = false) String timeZone,
                                                @RequestParam(required = false) Boolean columnar,
                                                javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        guardSqlCursor(cursor, request);
        Map<String, Object> out = esIndexAdmin.sqlCursor(cursor, timeZone, columnar);
        /* cursor 可能轮换：登记新 id 并释放旧 id，避免旧 id 变成无主凭据。 */
        rememberSqlCursor(out, request);
        Object next = out == null ? null : out.get("cursor");
        if (next != null && !String.valueOf(next).equals(cursor)) {
            io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.release(cursor);
        }
        return out;
    }
    /** _sql 关闭 cursor（仅开启者本人或 ADMIN；关闭后释放归属） */
    @PostMapping("cluster/sql/close")
    public Map<String, Object> clusterSqlClose(@RequestParam String cursor,
                                               javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        guardSqlCursor(cursor, request);
        try {
            return esIndexAdmin.sqlClose(cursor);
        } finally {
            io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.release(cursor);
        }
    }

    /** SQL cursor 归属登记（页面端点）：cursor 按执行者权限生成，不能成为跨身份翻页凭据。 */
    private void rememberSqlCursor(Map<String, Object> result, javax.servlet.http.HttpServletRequest request) {
        if (result == null) return;
        Object cursor = result.get("cursor");
        if (cursor == null || String.valueOf(cursor).trim().isEmpty()) return;
        ConsolePrincipal p = principal(request);
        if (p == null) return;
        io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.register(
                String.valueOf(cursor), p.getUsername(), SQL_CURSOR_TTL_MS);
    }

    private void guardSqlCursor(String cursor, javax.servlet.http.HttpServletRequest request) {
        if (cursor == null || cursor.trim().isEmpty()) return;
        ConsolePrincipal p = principal(request);
        if (p == null) return; // 免鉴权部署
        if (!io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.allows(
                cursor, p.getUsername(), adminView(request))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "SQL cursor 由 " + io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.owner(cursor)
                            + " 开启：cursor 即凭据，仅开启者本人或 ADMIN 可续页/关闭；"
                            + "账号切换后请重新执行查询（旧 cursor 不会随新身份放行）");
        }
    }

    /** raw 透传的 _sql 续页/关闭：先按 cursor 归属校验（关闭他人 cursor 不可在事后补救）。 */
    private void guardRawSqlCursor(String rawBody, String path,
                                   javax.servlet.http.HttpServletRequest request, boolean admin) {
        if (!isRawSqlPath(path)) return;
        ConsolePrincipal p = principal(request);
        if (p == null) return;
        String requested = sqlCursorFromBody(rawBody);
        if (requested != null && !io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.allows(
                requested, p.getUsername(), admin)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "SQL cursor 由 " + io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.owner(requested)
                            + " 开启：cursor 即凭据，仅开启者本人或 ADMIN 可使用");
        }
    }

    /** raw 透传的 _sql 响应登记 cursor（否则页面端点侧看到的是「控制台外 cursor」而放行）。 */
    private void rememberRawSqlCursor(String path, Map<String, Object> result,
                                      javax.servlet.http.HttpServletRequest request) {
        if (!isRawSqlPath(path) || result == null) return;
        ConsolePrincipal p = principal(request);
        if (p == null) return;
        Object body = result.get("body");
        if (!(body instanceof String)) return;
        try {
            com.fasterxml.jackson.databind.JsonNode root = SCRIPT_MAPPER.readTree((String) body);
            com.fasterxml.jackson.databind.JsonNode next = root == null ? null : root.get("cursor");
            if (next != null && next.isValueNode()) {
                io.github.dengmeiluan.esquerystudio.console.auth.SqlCursorOwnership.register(
                        next.asText(), p.getUsername(), SQL_CURSOR_TTL_MS);
            }
        } catch (Exception ignored) {
            /* 非 JSON 响应（错误体/文本）不登记 */
        }
    }

    private static boolean isRawSqlPath(String path) {
        if (path == null) return false;
        String clean = path.split("\\?")[0].toLowerCase(java.util.Locale.ROOT);
        return clean.endsWith("/_sql") || clean.endsWith("/_sql/close")
                || clean.endsWith("/_xpack/sql") || clean.endsWith("/_xpack/sql/close");
    }

    static String sqlCursorFromBody(String body) {
        if (body == null || body.trim().isEmpty() || body.indexOf("\"cursor\"") < 0) return null;
        try {
            com.fasterxml.jackson.databind.JsonNode root = SCRIPT_MAPPER.readTree(body);
            com.fasterxml.jackson.databind.JsonNode c = root == null ? null : root.get("cursor");
            if (c == null || !c.isValueNode()) return null;
            String v = c.asText();
            return v == null || v.trim().isEmpty() ? null : v.trim();
        } catch (Exception e) {
            return null;
        }
    }

    private static final long SQL_CURSOR_TTL_MS = 10L * 60L * 1000L;

    /** 单文档 GET（供 diff editor 拉取原文） */
    @GetMapping("cluster/doc")
    public Map<String, Object> clusterGetDoc(@RequestParam String index, @RequestParam String id) throws java.io.IOException {
        return esIndexAdmin.getDoc(index, id);
    }
    /** 单文档 PUT/index（幂等覆盖） */
    @PostMapping("cluster/doc")
    public Map<String, Object> clusterPutDoc(
            @RequestParam String index, @RequestParam String id,
            @RequestParam(required = false) String refresh,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.putDoc(index, id, body, refresh);
    }
    /** 单文档 _update partial */
    @PostMapping("cluster/doc/update")
    public Map<String, Object> clusterUpdateDoc(
            @RequestParam String index, @RequestParam String id,
            @RequestParam(required = false) String refresh,
            @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.updateDoc(index, id, body, refresh);
    }

    /* ====================================================================
     *  —— painless / stored scripts / rollover / ILM ops / nodes stats brief
     * ==================================================================== */

    /** POST /_scripts/painless/_execute —— 脚本沙盒 */
    @PostMapping("cluster/painless/execute")
    public Map<String, Object> painlessExecute(@org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.painlessExecute(body);
    }
    /** 已存储脚本列表 */
    @GetMapping("cluster/scripts")
    public Map<String, Object> listStoredScripts(javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        Map<String, Object> out = esIndexAdmin.listStoredScripts();
        /* 搜索模板中心只需要 mustache 模板；painless 源码属脚本站（painless-lab）语义。
           页面模型下按页收窄，避免模板页读者拿到可执行的 painless 源码。 */
        if (adminView(request) || pageVisible(request, "painless-lab")) return out;
        Object scripts = out.get("scripts");
        if (scripts instanceof Map) {
            Map<String, Object> filtered = new java.util.LinkedHashMap<>();
            for (Map.Entry<?, ?> e : ((Map<?, ?>) scripts).entrySet()) {
                Object def = e.getValue();
                String lang = def instanceof Map ? String.valueOf(((Map<?, ?>) def).get("lang")) : "";
                if ("mustache".equalsIgnoreCase(lang)) {
                    filtered.put(String.valueOf(e.getKey()), def);
                }
            }
            out.put("scripts", filtered);
            out.put("count", filtered.size());
            out.put("restricted", true);
        }
        return out;
    }
    /** 保存脚本 PUT /_scripts/{id} */
    @PostMapping("cluster/scripts/put")
    public Map<String, Object> putStoredScript(@RequestParam String id,
                                                @org.springframework.web.bind.annotation.RequestBody String body,
                                                javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        requireScriptScope(id, body, request);
        return esIndexAdmin.putStoredScript(id, body);
    }
    /** 删除脚本 DELETE /_scripts/{id} */
    @PostMapping("cluster/scripts/delete")
    public Map<String, Object> deleteStoredScript(@RequestParam String id,
                                                  javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        requireScriptScope(id, null, request);
        return esIndexAdmin.deleteStoredScript(id);
    }

    /**
     * 已存脚本是集群级共享件（所有查询/模板共用同一命名空间）：搜索模板页的写键只应管理
     * 它看得见的 mustache 模板；painless 源码的写入/删除属脚本站（painless-lab）语义。
     *
     * <p>与 GET 的字段收窄同源（模板页只回 mustache）：否则持 w:search-templates 的人
     * 可以覆盖一个 ADMIN 的 painless 脚本，或按 id 删除任意人的脚本——读面收窄、写面全开
     * 是最典型的「看起来安全」破口。静态/内置模型（grantedPages=null）维持 rank 档不变。</p>
     */
    private void requireScriptScope(String id, String body,
                                    javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        if (adminView(request) || pageVisible(request, "painless-lab")) return;
        /* 目标 id 的现状必须读回：已存在 painless 脚本时，模板页即使提交 mustache 也是
           覆盖他人脚本（写侧全开、读侧不可见）——put 与 delete 同口径。 */
        Map<String, Object> listed = esIndexAdmin.listStoredScripts();
        Object scripts = listed == null ? null : listed.get("scripts");
        Object def = scripts instanceof Map ? ((Map<?, ?>) scripts).get(id) : null;
        String existingLang = def instanceof Map ? String.valueOf(((Map<?, ?>) def).get("lang")) : "";
        if (body == null) {
            if (def != null && "mustache".equalsIgnoreCase(existingLang)) return;
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    def == null
                            ? "已存脚本 " + id + " 不存在或无法确认类型：删除脚本需要 painless-lab 页写权限"
                            : "已存脚本 " + id + " 不是 mustache 模板（lang=" + existingLang
                                    + "）：删除需要 painless-lab 页写权限");
        }
        if (def != null && !"mustache".equalsIgnoreCase(existingLang)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "已存脚本 " + id + " 不是 mustache 模板（lang=" + existingLang
                            + "）：覆盖写需要 painless-lab 页写权限；已存脚本是集群级共享件");
        }
        String lang;
        try {
            com.fasterxml.jackson.databind.JsonNode root =
                    SCRIPT_MAPPER.readTree(body);
            com.fasterxml.jackson.databind.JsonNode script = root == null ? null : root.get("script");
            com.fasterxml.jackson.databind.JsonNode l = script == null ? null : script.get("lang");
            lang = l == null ? null : l.asText();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "脚本定义无法解析：搜索模板页只能写入 mustache 模板");
        }
        if ("mustache".equals(lang)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "搜索模板页只能写入 mustache 模板（lang=" + lang
                        + "）：painless 脚本需要 painless-lab 页写权限；已存脚本是集群级共享件");
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper SCRIPT_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();
    /** 手动 rollover */
    @PostMapping("cluster/rollover")
    public Map<String, Object> rolloverAlias(@RequestParam String alias,
                                              @RequestParam(defaultValue = "false") boolean dryRun,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.rolloverAlias(alias, body, dryRun);
    }
    /** ILM move step */
    @PostMapping("cluster/ilm/move")
    public Map<String, Object> ilmMove(@RequestParam String index,
                                        @org.springframework.web.bind.annotation.RequestBody String body) throws java.io.IOException {
        return esIndexAdmin.ilmMove(index, body);
    }
    @PostMapping("cluster/ilm/start")
    public Map<String, Object> ilmStart() throws java.io.IOException { return esIndexAdmin.ilmStart(); }
    @PostMapping("cluster/ilm/stop")
    public Map<String, Object> ilmStop() throws java.io.IOException { return esIndexAdmin.ilmStop(); }
    @GetMapping("cluster/ilm/status")
    public Map<String, Object> ilmStatus() throws java.io.IOException { return esIndexAdmin.ilmStatus(); }
    /** 实时监控大屏——简化 nodes stats */
    @GetMapping("cluster/nodes-stats-brief")
    public java.util.List<Map<String, Object>> nodesStatsBrief(javax.servlet.http.HttpServletRequest request)
            throws java.io.IOException {
        java.util.List<Map<String, Object>> list = esIndexAdmin.nodesStatsBrief();
        if (adminView(request)) return list;
        /* 无任何视图消费 host（拓扑页的 IP 来自 shards）：非 ADMIN 去掉主机名，保留指标。 */
        for (Map<String, Object> row : list) {
            row.remove("host");
        }
        return list;
    }

    /* =========================================================
     *  —— 查询能力全通道 Query Bridge：SQL 宽容 / Lucene / PIT / schema 探测
     * ========================================================= */
    /** SQL 宽容执行（自动注入 field_multi_value_leniency=true） */
    @PostMapping("cluster/sql/lenient")
    public Map<String, Object> sqlLenient(@org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.sqlLenient(body == null ? "" : body);
    }
    /** Lucene query_string 通用查询：数组/nested/text 全友好 */
    @GetMapping("cluster/lucene-search")
    public Map<String, Object> luceneSearch(@RequestParam String index,
                                            @RequestParam(defaultValue = "*") String q,
                                            @RequestParam(defaultValue = "100") int size,
                                            @RequestParam(defaultValue = "0") int from,
                                            @RequestParam(required = false) String sortField,
                                            @RequestParam(required = false) String sortOrder) throws java.io.IOException {
        return esIndexAdmin.luceneSearch(index, q, size, from, sortField, sortOrder);
    }
    /** 开启 Point-in-Time（深度分页基石）。非 ADMIN 的 keep-alive 夹到资源上限。 */
    @PostMapping("cluster/pit/open")
    public Map<String, Object> pitOpen(@RequestParam String index,
                                       @RequestParam(defaultValue = "5m") String keepAlive,
                                       javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        boolean admin = adminView(request);
        Map<String, Object> out = admin
                ? esIndexAdmin.pitOpen(index, keepAlive)
                : esIndexAdmin.pitOpenClamped(index, keepAlive);
        Object id = out == null ? null : out.get("id");
        ConsolePrincipal p = principal(request);
        if (id != null && p != null) {
            io.github.dengmeiluan.esquerystudio.console.auth.PitOwnership.register(String.valueOf(id), p.getUsername(),
                    admin ? 7L * 24L * 3_600_000L : 2L * 3_600_000L);
        }
        return out;
    }
    /** PIT + search_after 分页搜索（PIT id 绑定开启者：换号/他人 id 不放行） */
    @PostMapping("cluster/pit/search")
    public Map<String, Object> pitSearch(@org.springframework.web.bind.annotation.RequestBody String body,
                                         javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        boolean admin = adminView(request);
        guardPitOwnership(body, request, admin);
        return admin ? esIndexAdmin.pitSearch(body) : esIndexAdmin.pitSearchClamped(body);
    }
    /** 关闭 PIT（仅开启者本人或 ADMIN；关闭后释放归属） */
    @PostMapping("cluster/pit/close")
    public Map<String, Object> pitClose(@RequestParam String pitId,
                                        javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        guardPitOwnershipById(pitId, request, adminView(request));
        Map<String, Object> out = esIndexAdmin.pitClose(pitId);
        io.github.dengmeiluan.esquerystudio.console.auth.PitOwnership.release(pitId);
        return out;
    }
    /** 字段结构探测（前端教育） */
    @GetMapping("cluster/resolve-schema")
    public Map<String, Object> resolveSchema(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.resolveSchema(index);
    }

    /* =========================================================================
     *  —— 索引运维中枢：mapping / analysis / synonyms / plugins
     * ========================================================================= */

    /** Mapping 详情树（nested/object/multi-fields 展开） */
    @GetMapping("cluster/mapping-detail")
    public Map<String, Object> mappingDetail(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.getMappingDetail(index);
    }

    /** 为索引新增字段（只能加，不能改/删） */
    @PostMapping("cluster/mapping-put")
    public Map<String, Object> mappingPut(@RequestParam String index,
                                          @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.putMappingField(index, body);
    }

    /** 读索引 analysis 全景 */
    @GetMapping("cluster/analysis-settings")
    public Map<String, Object> analysisSettings(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.getAnalysisSettings(index);
    }

    /** 更新 analysis（close→PUT→open 自动） */
    @PostMapping("cluster/analysis-update")
    public Map<String, Object> analysisUpdate(@RequestParam String index,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.updateAnalysisSettings(index, body);
    }

    /** 搜索分词器热重载 */
    @PostMapping("cluster/reload-analyzers")
    public Map<String, Object> reloadAnalyzers(@RequestParam String index) throws java.io.IOException {
        return esIndexAdmin.reloadSearchAnalyzers(index);
    }

    /** 插件矩阵 */
    @GetMapping("cluster/plugins")
    public Map<String, Object> plugins() throws java.io.IOException {
        return esIndexAdmin.pluginsList();
    }

    /** 便捷 —— 同义词 upsert (index-level inline synonym_graph filter) */
    @PostMapping("cluster/synonyms-upsert")
    public Map<String, Object> synonymsUpsert(@RequestParam String index,
                                              @RequestParam(defaultValue = "custom_synonyms") String filter,
                                              @RequestParam(defaultValue = "true") boolean expand,
                                              @org.springframework.web.bind.annotation.RequestBody(required = false) java.util.List<String> entries) throws java.io.IOException {
        return esIndexAdmin.synonymsGraphUpsert(index, filter, entries, expand);
    }

    /* =========================================================================
     *  —— 相关性打分实验室：explain / validate / termvectors / search 透传
     * ========================================================================= */

    /** 搜索透传（body 可含 explain:true / _name 命名子句） */
    @PostMapping("cluster/search-raw")
    public Map<String, Object> searchRaw(@RequestParam String index,
                                         @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.searchRaw(index, body);
    }

    /** 单文档打分解释 / why-not 诊断 */
    @PostMapping("cluster/explain-doc")
    public Map<String, Object> explainDoc(@RequestParam String index,
                                          @RequestParam String id,
                                          @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.explainDoc(index, id, body);
    }

    /** 查询校验 + Lucene 改写透视 */
    @PostMapping("cluster/validate-query")
    public Map<String, Object> validateQuery(@RequestParam String index,
                                             @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.validateQuery(index, body);
    }

    /** 词频取证 _termvectors */
    @GetMapping("cluster/term-vectors")
    public Map<String, Object> termVectors(@RequestParam String index,
                                           @RequestParam String id,
                                           @RequestParam(required = false) String fields) throws java.io.IOException {
        return esIndexAdmin.termVectors(index, id, fields);
    }

    /* =========================================================================
*  —— 搜索模板中心 + 别名管控台
     * ========================================================================= */

/** mustache 模板渲染预览 _render/template */
    @PostMapping("cluster/render-template")
    public Map<String, Object> renderTemplate(
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.renderTemplate(body);
    }

/** 执行搜索模板 _search/template */
    @PostMapping("cluster/search-template")
    public Map<String, Object> searchTemplate(@RequestParam String index,
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body) throws java.io.IOException {
        return esIndexAdmin.searchTemplate(index, body);
    }

/** 别名原子操作 POST /_aliases */
    @PostMapping("cluster/alias-actions")
    public Map<String, Object> aliasActions(
            @org.springframework.web.bind.annotation.RequestBody(required = false) String body,
            javax.servlet.http.HttpServletRequest request) throws java.io.IOException {
        return esIndexAdmin.aliasActions(body,
                io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.aliasActionsAddOnly(request));
    }

    /** 当前 HTTP 请求（供错误体带 endpoint 上下文，EsClusterConnController 同款）；无 web 上下文返回 null，绝不抛异常。 */
    private static javax.servlet.http.HttpServletRequest currentRequest() {
        org.springframework.web.context.request.RequestAttributes ra =
                org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        return ra instanceof org.springframework.web.context.request.ServletRequestAttributes
                ? ((org.springframework.web.context.request.ServletRequestAttributes) ra).getRequest() : null;
    }

    /* 控制器本地 handler 优先于 @RestControllerAdvice：若只留 Exception 兼容兜底，advice 的 400/409 映射永远轮不到。
       故这里显式声明同类型 handler 委派给 advice，保证业务拒绝码（LOCK_CONFLICT/STAGE_GUARD/BAD_REQUEST）语义一致 */
    private static final InternalEsRebuildExceptionAdvice EX_ADVICE = new InternalEsRebuildExceptionAdvice();

    @org.springframework.web.bind.annotation.ExceptionHandler(IllegalStateException.class)
    public org.springframework.http.ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException e) {
        return EX_ADVICE.illegalState(e);
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(IllegalArgumentException.class)
    public org.springframework.http.ResponseEntity<Map<String, Object>> handleIllegalArg(IllegalArgumentException e) {
        return EX_ADVICE.illegalArg(e);
    }

    /* 守卫拒绝与 IAE 同族但语义是保护策略拒绝（403），必须显式声明同类型本地 handler
       委派 advice——本地 handler 优先于 advice，缺此臂恒落 handleIllegalArg 被映射 400 */
    @org.springframework.web.bind.annotation.ExceptionHandler(
            io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException.class)
    public org.springframework.http.ResponseEntity<Map<String, Object>> handleControlPlaneGuard(
            io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException e) {
        return EX_ADVICE.controlPlaneGuard(e, currentRequest());
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(Exception.class)
    @org.springframework.web.bind.annotation.ResponseBody
    public org.springframework.http.ResponseEntity<Map<String, Object>> handleError(Exception e,
            javax.servlet.http.HttpServletRequest request) {
        /* -C2：状态码映射与 message 组装统一走 EsErrorMapper（与全包兜底 advice 同口径）——
           ES 端 4xx 透传原状态码不拉平成 500，5xx/网络故障映射 502，message 保留 ES 原始报错体供前端提 root_cause；
           错误体补 endpoint（method + " " + requestURI），与兜底 advice 同步 */
        return org.springframework.http.ResponseEntity.status(EsErrorMapper.httpStatusOf(e))
                .body(EsErrorMapper.esErrorBody(e, EsErrorMapper.endpointOf(request)));
    }
}
