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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditQuery;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.McpTargetRouter;
import io.github.dengmeiluan.esquerystudio.console.multicluster.McpTargetScope;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.DestCreateMode;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateRequest;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanRecord;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.TuneMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.UUID;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.time.Instant;

/**
 * MCP (Model Context Protocol) endpoint for the server-mode console.
 *
 * <p>Transport: JSON-RPC 2.0 over HTTP POST at {@code /esmcp} by default (configurable via
 * {@code esquerystudio.mcp.path}); a GET on the same path
 * returns the server card and tool catalog for discovery. The endpoint is disabled
 * unless {@code esquerystudio.mcp.enabled=true}, and every request must carry
 * {@code Authorization: Bearer <esquerystudio.mcp.token>}.</p>
 *
 * <p>API keys are read-only by default: mutating tools require both an allowlist
 * entry and {@code write} permission on the target connection. The service token is
 * the deployment administrator; browser and local Node bridges keep their own
 * explicit write switches. An MCP client should never be able to delete an index
 * just because it can list one.</p>
 */
@RestController
@RequestMapping("${esquerystudio.mcp.path:/esmcp}")
@ConditionalOnProperty(prefix = "esquerystudio.mcp", name = "enabled", havingValue = "true")
public class McpServerCore implements org.springframework.beans.factory.InitializingBean {

    private static final Logger LOG = LoggerFactory.getLogger(McpServerCore.class);

    /** Mounted MCP transport path; overridable for hosts that already own {@code /mcp}. */
    @Value("${esquerystudio.mcp.path:/esmcp}")
    private String configuredMcpPath = "/esmcp";

    /** Fail fast on a malformed mount path instead of silently serving an unreachable endpoint. */
    @Override
    public void afterPropertiesSet() {
        McpPaths.requireValid(configuredMcpPath);
    }

    /** Normalized mount path (leading slash, no trailing slash); blank falls back to /esmcp. */
    private String mcpEndpointPath() {
        return McpPaths.normalize(configuredMcpPath);
    }

    /** Transport-neutral view: an explicitly published context wins, else reflect over Spring's request attributes. */
    protected McpRequestContext requestContext() {
        McpRequestContext ctx = McpRequestContextHolder.current();
        if (ctx != null) return ctx;
        try {
            return ReflectiveMcpRequestContext.from(
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes());
        } catch (Throwable ignored) {
            return null;
        }
    }

    /** Path the current request actually matched (mirrors the mounted pattern, incl. test overrides). */
    private String mountedMcpPath() {
        try {
            McpRequestContext ctx = requestContext();
            String pattern = ctx == null ? null : ctx.matchedPattern();
            if (pattern != null && !pattern.trim().isEmpty()) {
                return pattern.trim();
            }
        } catch (Throwable ignored) {
            // no web context (direct calls in tests): fall back to the configured path
        }
        return mcpEndpointPath();
    }
    /** 服务级 token 的进程内最近调用（key 调用会持久化到 key.recentCalls）。 */
    private final java.util.Deque<Map<String, Object>> serviceCalls = new java.util.ArrayDeque<>();
    /** 2026-07-28 官方 Tasks 扩展的可选任务台账；仅对显式声明扩展的客户端生效。 */
    private final McpTaskRegistry taskRegistry;
    /** 当前工作线程的任务控制面：callTool 的大 switch 用它上报进度/检查取消，
     *  避免把控制对象一路穿过几十个 case 的签名。工作线程结束即清理，绝不跨请求泄漏。 */
    private static final ThreadLocal<McpTaskRegistry.TaskControl> ACTIVE_CONTROL = new ThreadLocal<>();
    private static final String TASKS_EXTENSION = "io.modelcontextprotocol/tasks";
    private static final String APPS_EXTENSION = "io.modelcontextprotocol/ui";
    private static final String MCP_APP_URI = "ui://esquerystudio/tool-console";
    private static final String MCP_APP_MIME = "text/html;profile=mcp-app";
    private static final String MCP_APP_HTML = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>"
            + ":root{color-scheme:dark}body{margin:0;background:#0d1718;color:#d9f6f1;font:13px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}"
            + "main{max-width:720px;padding:28px 26px}h1{margin:6px 0 8px;font-size:22px;letter-spacing:-.03em}"
            + ".eyebrow{color:#4cc9f0;font:10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.16em}"
            + "p{color:#8db7b1;max-width:620px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}"
            + ".cell{border:1px solid #1c3435;border-radius:6px;padding:10px;background:#102021}"
            + ".cell b{display:block;color:#d9f6f1}.cell span{color:#6f9994;font-size:11px}"
            + "code{color:#4cc9f0}@media(max-width:520px){.grid{grid-template-columns:1fr}}"
            + "</style></head><body><main><div class=\"eyebrow\">ESQUERYSTUDIO / MCP APP</div>"
            + "<h1>Elasticsearch control surface</h1><p>This app renders the ESQueryStudio connection, index and diagnostic tools inside an MCP host. "
            + "Tool results remain available as text when the host does not support MCP Apps.</p>"
            + "<div class=\"grid\"><div class=\"cell\"><b>17 tools</b><span>action-typed, one per domain</span></div>"
            + "<div class=\"cell\"><b>Read / write</b><span>per connection permission</span></div>"
            + "<div class=\"cell\"><b>Audited</b><span>IP · UA · requestId</span></div></div>"
            + "<p style=\"margin-top:20px\">Use <code>es_connections action=list</code> to discover the scope of your key.</p></main></body></html>";
    private static final long TASK_TTL_MS = McpTaskRegistry.TASK_TTL_MS;
    private static final long TASK_POLL_INTERVAL_MS = McpTaskRegistry.POLL_INTERVAL_MS;
    /** MRTR（multi round-trip requests）：破坏性写操作在支持 elicitation 的 2026 客户端上二次确认。 */
    private static final Set<String> MRTR_CONFIRM_TOOLS = Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(
            "es_delete_by_query", "es_delete_index", "es_delete_doc", "es_delete_data_stream", "es_rest",
            "es_adhoc_start", "es_adhoc_abort", "es_adhoc_confirm_switch",
            "es_adhoc_retry", "es_adhoc_delete_jobs",
            "es_xmigrate_start", "es_xmigrate_resume", "es_xmigrate_abort", "es_xmigrate_delete_jobs",
            "es_xmigrate_sync_structure", "es_xmigrate_smart_sync", "es_xmigrate_plan_apply")));
    private static final long MRTR_STATE_TTL_MS = 300_000L;
    private final byte[] mrtrSecret;
    /** 高频只读轮询方法：不落审计、不写最近调用（tasks/cancel 等动作仍完整留档）。 */
    private static final Set<String> QUIET_METHODS = Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(
            "notifications/cancelled", "tasks/get", "tasks/list", "tasks/update")));
    private static final Set<String> TASK_TOOLS = Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(
            "es_reindex", "es_bulk", "es_update_by_query", "es_delete_by_query",
            "es_create_snapshot", "es_restore_snapshot", "es_force_merge", "es_sql", "es_rest")));
    private static final String PROTOCOL_VERSION = "2026-07-28";
    private static final String LEGACY_PROTOCOL_VERSION = "2025-06-18";
    private static final List<String> SUPPORTED_PROTOCOL_VERSIONS = Collections.unmodifiableList(
            Arrays.asList(PROTOCOL_VERSION, "2025-11-25", LEGACY_PROTOCOL_VERSION, "2025-03-26", "2024-11-05"));
    private static final long CACHE_TTL_MS = 60_000L;
    private static final String SERVER_NAME = "ESQueryStudio";
    public static final Map<String, Map<String, String>> GROUP_ACTIONS = buildGroupActions();
    public static final List<String> GROUP_TOOL_NAMES = Collections.unmodifiableList(new ArrayList<>(GROUP_ACTIONS.keySet()));

    /** GUI 客户端精简工具面：保留全部 17 个 action 组，仅清空 resources/prompts；
     *  通过 {mcp.path}?surface=compact 或 X-MCP-Surface: compact 启用。 */
    public static final List<String> COMPACT_GROUP_NAMES = Collections.unmodifiableList(
            new ArrayList<>(GROUP_ACTIONS.keySet()));
    /** 内部路由名（如 es_cluster_health）→「组:action」限定名（es_cluster:health）。
     *  白名单、签发面与推荐列表的唯一词表；存量 key 的细粒度白名单值经此一次反查迁移。 */
    public static final Map<String, String> TOOL_ACTIONS = buildToolActions();
    /** 「组:action」限定名 → 内部路由名；签发面把限定名还原成 handler 分类（写/管理/页面）时使用。 */
    public static final Map<String, String> ACTION_TOOLS = buildActionTools();
    /** 全部「组:action」限定名（顺序即组序）；服务 token 的白名单即全表。 */
    public static final List<String> ACTION_TOOL_NAMES =
            Collections.unmodifiableList(new ArrayList<>(TOOL_ACTIONS.values()));
    private static Map<String, Map<String, String>> buildGroupActions() {
        Map<String, Map<String, String>> groups = new LinkedHashMap<>();
        groups.put("es_connections", actions("list", "es_list_connections", "probe", "es_connection_probe"));
        groups.put("es_search", actions("search", "es_search", "count", "es_count", "msearch", "es_msearch", "mget", "es_mget", "explain", "es_explain_doc", "search_shards", "es_search_shards", "rank_eval", "es_rank_eval", "terms_enum", "es_terms_enum", "field_caps", "es_field_caps", "validate", "es_validate_query", "search_template", "es_search_template", "render_template", "es_render_template", "scroll_start", "es_scroll_start", "scroll_next", "es_scroll_next", "scroll_clear", "es_scroll_clear", "pit_open", "es_pit_open", "pit_search", "es_pit_search", "pit_close", "es_pit_close"));
        groups.put("es_sql", actions("query", "es_sql", "cursor", "es_sql_cursor", "close", "es_sql_close", "translate", "es_sql_translate"));
        groups.put("es_documents", actions("get", "es_get_doc", "index", "es_index_doc", "update", "es_update_doc", "delete", "es_delete_doc", "bulk", "es_bulk", "term_vectors", "es_term_vectors", "mtermvectors", "es_mtermvectors"));
        groups.put("es_indices", actions("list", "es_list_indices", "detail", "es_index_detail", "stats", "es_get_index_stats", "settings", "es_get_settings", "update_settings", "es_update_settings", "settings_defaults", "es_index_settings_defaults", "mapping", "es_get_mapping", "put_mapping", "es_put_mapping", "aliases", "es_get_aliases", "alias", "es_alias", "create", "es_create_index", "delete", "es_delete_index", "clone", "es_clone_index", "shrink", "es_shrink_index", "split", "es_split_index", "refresh", "es_refresh_index", "flush", "es_flush_index", "close", "es_index_close", "open", "es_index_open", "force_merge", "es_force_merge", "rollover", "es_rollover", "resolve", "es_resolve_index", "recovery", "es_index_recovery", "segments", "es_index_segments", "config_validate", "es_config_validate", "config_drift", "es_config_drift"));
        groups.put("es_data_streams", actions("list", "es_list_data_streams", "get", "es_get_data_stream", "stats", "es_data_stream_stats", "create", "es_create_data_stream", "delete", "es_delete_data_stream"));
        groups.put("es_templates", actions("list", "es_list_templates", "put", "es_put_template", "delete", "es_delete_template", "component_list", "es_list_component_templates"));
        groups.put("es_analysis", actions("analyze", "es_analyze", "settings", "es_analysis_settings", "update_settings", "es_update_analysis_settings", "reload", "es_reload_analyzers", "synonyms_upsert", "es_synonyms_upsert"));
        groups.put("es_cluster", actions("health", "es_cluster_health", "stats", "es_cluster_stats", "state", "es_cluster_state", "nodes", "es_list_nodes", "nodes_stats", "es_nodes_stats", "cat_shards", "es_cat_shards", "cat_allocation", "es_cat_allocation", "allocation_explain", "es_allocation_explain", "shard_stores", "es_shard_stores", "pending_tasks", "es_pending_tasks", "hot_threads", "es_hot_threads", "remote_clusters", "es_remote_clusters", "plugins", "es_plugins", "settings", "es_get_cluster_settings", "update_settings", "es_update_cluster_settings", "reroute", "es_reroute", "tasks", "es_list_tasks", "task_detail", "es_task_detail", "task_cancel", "es_task_cancel", "monitor_metrics", "es_monitor_metrics", "monitor_history", "es_monitor_history", "ops_audit", "es_ops_audit", "insight_impact", "es_insight_settings_impact", "ring_usage", "es_ring_usage"));
        groups.put("es_batch", actions("update_by_query", "es_update_by_query", "delete_by_query", "es_delete_by_query", "reindex", "es_reindex", "reindex_preview", "es_reindex_preview"));
        groups.put("es_transforms", actions("list", "es_list_transforms", "get", "es_get_transform", "stats", "es_transform_stats", "put", "es_put_transform", "start", "es_start_transform", "stop", "es_stop_transform", "delete", "es_delete_transform"));
        groups.put("es_snapshots", actions("repos", "es_list_snapshot_repos", "repo_put", "es_put_snapshot_repo", "repo_delete", "es_delete_snapshot_repo", "list", "es_list_snapshots", "status", "es_snapshot_status", "create", "es_create_snapshot", "delete", "es_delete_snapshot", "restore", "es_restore_snapshot"));
        groups.put("es_lifecycle", actions("ilm_policies", "es_ilm_policies", "ilm_explain", "es_ilm_explain", "ilm_status", "es_ilm_status", "ilm_put", "es_put_ilm_policy", "ilm_delete", "es_delete_ilm_policy", "ilm_move", "es_ilm_move", "ilm_start", "es_ilm_start", "ilm_stop", "es_ilm_stop", "slm_policies", "es_slm_policies", "slm_put", "es_put_slm_policy", "slm_delete", "es_delete_slm_policy", "slm_status", "es_slm_status", "slm_execute", "es_slm_execute"));
        groups.put("es_automation", actions("watchers", "es_watcher", "watch_put", "es_put_watch", "watch_delete", "es_delete_watch", "watch_execute", "es_execute_watch", "ingest_list", "es_ingest_pipelines", "ingest_put", "es_put_ingest_pipeline", "ingest_delete", "es_delete_ingest_pipeline", "scripts", "es_list_scripts", "script_put", "es_put_script", "script_delete", "es_delete_script"));
        groups.put("es_rest", actions("call", "es_rest"));
        groups.put("es_adhoc_rebuild", actions(
                "prepare", "es_adhoc_prepare", "start", "es_adhoc_start", "status", "es_adhoc_status",
                "abort", "es_adhoc_abort", "confirm_switch", "es_adhoc_confirm_switch", "jobs", "es_adhoc_jobs",
                "retry", "es_adhoc_retry", "delete_jobs", "es_adhoc_delete_jobs", "throttle", "es_adhoc_throttle",
                "events", "es_adhoc_events"));
        groups.put("es_xmigrate", actions(
                "preflight", "es_xmigrate_preflight", "start", "es_xmigrate_start", "status", "es_xmigrate_status",
                "jobs", "es_xmigrate_jobs", "fetch_config", "es_xmigrate_fetch_config",
                "resume", "es_xmigrate_resume", "abort", "es_xmigrate_abort",
                "reconcile", "es_xmigrate_reconcile", "conflicts", "es_xmigrate_conflicts",
                "events", "es_xmigrate_events",
                "connect_check", "es_xmigrate_connect_check", "resolve_preview", "es_xmigrate_resolve_preview",
                "dest_indices", "es_xmigrate_dest_indices", "delete_jobs", "es_xmigrate_delete_jobs",
                "sync_structure", "es_xmigrate_sync_structure",
                "probe_capabilities", "es_xmigrate_probe_capabilities",
                "compare_capabilities", "es_xmigrate_compare_capabilities",
                "diff_structure", "es_xmigrate_diff_structure",
                "verify_equivalence", "es_xmigrate_verify_equivalence",
                "throttle", "es_xmigrate_throttle",
                "smart_sync", "es_xmigrate_smart_sync",
                "plan_list", "es_xmigrate_plan_list", "plan_apply", "es_xmigrate_plan_apply"));
        return Collections.unmodifiableMap(groups);
    }
    private static Map<String, String> actions(String... pairs) {
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(pairs[i], pairs[i + 1]);
        return out;
    }
    /** 组级 MCP annotations 静态表（tools/list 逐组输出）：readOnlyHint=true 仅限零写
        action 的组；destructiveHint=true 仅限含 DESTRUCTIVE action 的组；idempotentHint
        同 readOnlyHint；openWorldHint=true 全组。值按组静态声明，不随 key 白名单裁剪变化。 */
    public static final Map<String, Map<String, Object>> TOOL_ANNOTATIONS = buildToolAnnotations();
    private static Map<String, Map<String, Object>> buildToolAnnotations() {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        out.put("es_connections", annotations(true, false));
        out.put("es_search", annotations(true, false));
        out.put("es_sql", annotations(true, false));
        out.put("es_documents", annotations(false, true));
        out.put("es_indices", annotations(false, true));
        out.put("es_data_streams", annotations(false, true));
        out.put("es_templates", annotations(false, true));
        out.put("es_analysis", annotations(false, false));
        out.put("es_cluster", annotations(false, false));
        out.put("es_batch", annotations(false, true));
        out.put("es_transforms", annotations(false, true));
        out.put("es_snapshots", annotations(false, true));
        out.put("es_lifecycle", annotations(false, true));
        out.put("es_automation", annotations(false, true));
        out.put("es_rest", annotations(false, true));
        out.put("es_adhoc_rebuild", annotations(false, true));
        out.put("es_xmigrate", annotations(false, true));
        return Collections.unmodifiableMap(out);
    }
    private static Map<String, Object> annotations(boolean readOnly, boolean destructive) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("readOnlyHint", readOnly);
        out.put("destructiveHint", destructive);
        out.put("idempotentHint", readOnly);
        out.put("openWorldHint", true);
        return out;
    }
    private static Map<String, String> buildToolActions() {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, Map<String, String>> group : buildGroupActions().entrySet()) {
            for (Map.Entry<String, String> action : group.getValue().entrySet()) {
                out.put(action.getValue(), group.getKey() + ":" + action.getKey());
            }
        }
        return Collections.unmodifiableMap(out);
    }
    private static Map<String, String> buildActionTools() {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : TOOL_ACTIONS.entrySet()) {
            out.put(entry.getValue(), entry.getKey());
        }
        return Collections.unmodifiableMap(out);
    }
    private static String groupDescription(String name) {
        switch (name) {
            case "es_connections": return "List or inspect MCP connections; probe one stored profile.";
            case "es_search": return "Search, count, multi-search, explain, scroll, PIT and search-time helpers.";
            case "es_sql": return "Run ES-SQL, cursors and SQL-to-DSL translation.";
            case "es_documents": return "Read and mutate documents, bulk operations and term vectors.";
            case "es_indices": return "Index catalog, settings, mappings, aliases, index lifecycle and config lab validation/drift.";
            case "es_data_streams": return "Data stream catalog and lifecycle.";
            case "es_templates": return "Index templates and component templates.";
            case "es_analysis": return "Analyze text, analysis settings, reload analyzers and synonyms.";
            case "es_cluster": return "Cluster health, nodes, shard diagnostics, settings, reroute, tasks, collected monitor series, ops audit, settings impact and ring usage.";
            case "es_batch": return "Batch update, delete, reindex and reindex preview.";
            case "es_transforms": return "Transform lifecycle.";
            case "es_snapshots": return "Snapshot repositories and snapshots.";
            case "es_lifecycle": return "ILM and SLM lifecycle policies.";
            case "es_automation": return "Watcher, ingest pipelines and stored scripts.";
            case "es_rest": return "Raw Elasticsearch REST passthrough; write methods need write permission.";
            case "es_adhoc_rebuild": return "Managed adhoc rebuild lifecycle: probe source, start, status, abort, confirm switch, job list, retry, throttle and events.";
            case "es_xmigrate": return "Cross-cluster migration lifecycle: connect check, resolve preview, preflight, start, progress, job list, fetch source config, count reconcile, conflict samples, job event timeline replay (ts/stage/message/level, owner-or-ADMIN), dest index list, resume, abort, job cleanup, adaptive structure sync (proactive compat matrix plus target-error pruning, dry-run plan with planDigest and alias sync), one-shot smart sync (probe, compare, plan and apply in a single call; apply=false is a read-only preview that needs no write permission — smart_sync is listed in annotations.readOnlyActions for that default read-only shape, while apply=true turns it into a write that needs write permission and confirmation; mode=incremental targets an existing index and back-fills newly added production fields via mapping merge; savePlan=true on a preview persists that plan and returns planId), saved-plan reuse (plan_list lists saved sync plans newest first, read-only, capped at 50; plan_apply re-runs a saved plan by planId behind the same planDigest drift gate as smart_sync apply — expectPlanDigest optionally overrides the stored digest, a stale plan is rejected as PLAN_DRIFT before any write, a missing planId is PLAN_NOT_FOUND — and needs write permission and confirmation; the esquerystudio://xmigrate/plan/{id} resource returns the saved plan with its preview snapshot), target capability probe (vendor/version/plugins/nodes), capability comparison risk matrix, structure diff verification (pass autoTunedShards/removedKeys from the previous sync report to exempt planned changes), data equivalence verification (counts, sample hash, optional aggregation; structureOnly=true compares structure digests only, the final gate for pure structure sync) and running-job throttle.";
            default: return "Grouped Elasticsearch tool.";
        }
    }
    public static final List<String> WRITE_TOOLS = Collections.unmodifiableList(Arrays.asList(
            "es_index_doc", "es_update_doc", "es_delete_doc", "es_bulk", "es_task_cancel",
            "es_create_index", "es_delete_index", "es_put_mapping", "es_update_settings",
            "es_alias", "es_rollover", "es_force_merge", "es_put_template", "es_delete_template",
            "es_create_data_stream", "es_delete_data_stream", "es_clone_index", "es_shrink_index", "es_split_index",
            "es_put_transform", "es_start_transform", "es_stop_transform", "es_delete_transform",
            "es_update_by_query", "es_delete_by_query", "es_reindex",
            "es_refresh_index", "es_flush_index", "es_index_close", "es_index_open",
            "es_update_analysis_settings", "es_reload_analyzers", "es_synonyms_upsert",
            "es_put_watch", "es_delete_watch", "es_execute_watch",
            "es_put_slm_policy", "es_delete_slm_policy",
            "es_put_ingest_pipeline", "es_delete_ingest_pipeline",
            "es_slm_execute",
            "es_update_cluster_settings", "es_reroute",
            "es_create_snapshot", "es_delete_snapshot", "es_restore_snapshot", "es_put_snapshot_repo", "es_delete_snapshot_repo",
            "es_put_ilm_policy", "es_delete_ilm_policy", "es_ilm_move", "es_ilm_start", "es_ilm_stop",
            "es_put_script", "es_delete_script",
            "es_adhoc_start", "es_adhoc_abort", "es_adhoc_confirm_switch",
            "es_adhoc_retry", "es_adhoc_delete_jobs", "es_adhoc_throttle",
            "es_xmigrate_start", "es_xmigrate_resume", "es_xmigrate_abort", "es_xmigrate_delete_jobs",
            "es_xmigrate_sync_structure", "es_xmigrate_smart_sync", "es_xmigrate_throttle",
            "es_xmigrate_plan_apply"));
    /** 可能删除/覆盖数据或中断集群状态的工具；用于 MCP annotations.destructiveHint。 */
    public static final List<String> DESTRUCTIVE_TOOLS = Collections.unmodifiableList(Arrays.asList(
            "es_delete_index", "es_delete_doc", "es_delete_by_query", "es_delete_snapshot",
            "es_restore_snapshot", "es_delete_template", "es_delete_data_stream", "es_delete_transform",
            "es_delete_ingest_pipeline", "es_delete_snapshot_repo", "es_delete_slm_policy", "es_delete_watch",
            "es_delete_ilm_policy", "es_delete_script", "es_bulk", "es_rest",
            "es_adhoc_abort", "es_adhoc_confirm_switch",
            "es_xmigrate_start", "es_xmigrate_abort"));
    /** 组级「只读 action 名单」（tools/list 逐组随 annotations.readOnlyActions 下发）：action 的
        实现名不在 {@link #WRITE_TOOLS} 即只读。两个参数守卫型 action 按缺省只读语义自然落入：
        es_xmigrate:smart_sync（实现名在 WRITE_TOOLS，缺省 apply=false 只读预览——显式补入名单；
        apply=true 落盘目标或 savePlan=true 写计划存储时仍按组级 readOnlyHint=false 走写流程）与
        es_rest:call（实现名不在 WRITE_TOOLS，缺省 method=GET 只读；写方法需写权限）。
        es_xmigrate:delete_jobs 是写动作，绝不在只读名单。 */
    public static final Map<String, List<String>> READ_ONLY_ACTIONS = buildReadOnlyActions();
    private static Map<String, List<String>> buildReadOnlyActions() {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (Map.Entry<String, Map<String, String>> group : GROUP_ACTIONS.entrySet()) {
            List<String> readOnly = new ArrayList<>();
            for (Map.Entry<String, String> action : group.getValue().entrySet()) {
                if (!WRITE_TOOLS.contains(action.getValue())) readOnly.add(action.getKey());
            }
            if ("es_xmigrate".equals(group.getKey())) readOnly.add("smart_sync");
            out.put(group.getKey(), Collections.unmodifiableList(readOnly));
        }
        return Collections.unmodifiableMap(out);
    }
    /** 只允许 ADMIN key 使用的系统管理类工具；非 ADMIN 不展示、不签发、不执行。 */
    private static final String SERVER_VERSION = resolveServerVersion();
    public static final List<String> ADMIN_ONLY_TOOLS = Collections.unmodifiableList(Arrays.asList(
            "es_cluster_state",
            "es_ingest_pipelines", "es_put_ingest_pipeline", "es_delete_ingest_pipeline",
            "es_list_transforms", "es_get_transform", "es_transform_stats",
            "es_put_transform", "es_start_transform", "es_stop_transform", "es_delete_transform",
            "es_put_watch", "es_delete_watch", "es_execute_watch",
            "es_put_snapshot_repo", "es_delete_snapshot_repo",
            "es_put_slm_policy", "es_delete_slm_policy"));
    /** 只读资源 URI（含模板）；资源不计入工具调用配额，只受连接 read 权限约束。 */
    public static final List<String> RESOURCE_URIS = Collections.unmodifiableList(Arrays.asList(
            "esquerystudio://connections",
            "esquerystudio://connection/{connection}",
            "esquerystudio://cluster/{connection}",
            "esquerystudio://indices/{connection}",
            "esquerystudio://aliases/{connection}",
            "esquerystudio://data_streams/{connection}",
            "esquerystudio://component_templates/{connection}",
            "esquerystudio://index/{connection}/{index}",
            "esquerystudio://index/{connection}/{index}/mapping",
            "esquerystudio://xmigrate/jobs",
            "esquerystudio://xmigrate/job/{id}/events",
            "esquerystudio://xmigrate/plan/{id}",
            "esquerystudio://tasks/active",
            "esquerystudio://task/{id}"));
    /** 引导提示词；客户端可直接把证据收集步骤交给模型执行。 */
    public static final List<String> PROMPT_NAMES = Collections.unmodifiableList(Arrays.asList(
            "diagnose_slow_query", "design_index_mapping", "migrate_index",
            "review_cluster_capacity", "triage_failed_search", "cross_cloud_structure_sync",
            "deploy_and_connect"));

    protected final EsIndexAdmin esIndexAdmin;
    private final String token;
    private final McpAccessService accessService;
    private final McpTargetRouter clientRouter;
    private final ConnStore connStore;
    private boolean hostClusterVisible = true;
    private final ObjectMapper objectMapper = new ObjectMapper();
    /** 托管重建（adhoc）作业编排；与 mcpController 同在 ConsoleModeConfiguration 装配，
     *  经 setter 注入避免扩展构造器（宿主/测试多用短构造器直建）。缺位时 adhoc 工具明确报错。 */
    private McpAdhocService adhocRebuildService;
    /** 跨集群迁移编排；经 setter 注入，migrate.enabled=false 时缺位，xmigrate 工具明确报错。 */
    private McpMigrateService crossClusterMigrateService;

    public McpServerCore(EsIndexAdmin esIndexAdmin,
                         @Value("${esquerystudio.mcp.token:}") String token) {
        this(esIndexAdmin, token, null, null, null);
    }

    public McpServerCore(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService) {
        this(esIndexAdmin, token, accessService, null, null);
    }

    public McpServerCore(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         McpTargetRouter clientRouter) {
        this(esIndexAdmin, token, accessService, clientRouter, null);
    }

    public McpServerCore(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         McpTargetRouter clientRouter,
                         ConnStore connStore) {
        this.esIndexAdmin = esIndexAdmin;
        this.token = token == null ? "" : token.trim();
        this.mrtrSecret = sha256Bytes((this.token.isEmpty() ? "esq-mrtr-" + UUID.randomUUID() : this.token + "|mrtr")
                .getBytes(StandardCharsets.UTF_8));
        this.accessService = accessService;
        this.clientRouter = clientRouter;
        this.connStore = connStore;
        this.taskRegistry = new McpTaskRegistry();
    }

    /** 完整装配：带调用预算（毫秒），宿主可用配置覆盖默认 3 分钟。 */
    public McpServerCore(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         McpTargetRouter clientRouter,
                         ConnStore connStore, long callTimeoutMs) {
        this.esIndexAdmin = esIndexAdmin;
        this.token = token == null ? "" : token.trim();
        this.mrtrSecret = sha256Bytes((this.token.isEmpty() ? "esq-mrtr-" + UUID.randomUUID() : this.token + "|mrtr")
                .getBytes(StandardCharsets.UTF_8));
        this.accessService = accessService;
        this.clientRouter = clientRouter;
        this.connStore = connStore;
        this.taskRegistry = new McpTaskRegistry(callTimeoutMs);
    }

    /** 进程关闭时中断全部在途任务（容器会调用）。 */
    public void shutdownTasks() {
        taskRegistry.shutdown();
    }

    /** 与宿主的 host-cluster-visible 同口径；纯管理平台不把控制集群当数据面目标。 */
    public void setHostClusterVisible(boolean hostClusterVisible) {
        this.hostClusterVisible = hostClusterVisible;
    }

    /** 同容器按类型注入 adhoc 作业编排；宿主自定义装配缺失时保持 null，工具调用处 fail-fast。 */
    @Autowired(required = false)
    public void setAdhocRebuildService(McpAdhocService adhocRebuildService) {
        this.adhocRebuildService = adhocRebuildService;
    }

    private void requireAdhocService() {
        if (adhocRebuildService == null) {
            throw new IllegalStateException("Adhoc rebuild service is not available in this deployment");
        }
    }

    /** 跨集群迁移编排注入点；宿主自定义装配缺失时保持 null，工具调用处 fail-fast。 */
    @Autowired(required = false)
    public void setCrossClusterMigrateService(McpMigrateService crossClusterMigrateService) {
        this.crossClusterMigrateService = crossClusterMigrateService;
    }

    /** 共享任务台账（跨重启/多实例可读与跨实例取消）；不装配则保持纯进程内台账。 */
    @Autowired(required = false)
    public void setTaskStore(McpTaskStore taskStore) {
        taskRegistry.attachStore(taskStore);
    }

    private void requireXmigrateService() {
        if (crossClusterMigrateService == null) {
            throw new IllegalStateException("Cross-cluster migrate service is not available in this deployment");
        }
    }

    /** 结构同步服务直连面：smart_sync mode / diff_structure 豁免参数 / verify_equivalence
     *  structureOnly 的全参重载只在 {@code StructureSyncService} 暴露（CrossClusterMigrateService
     *  统一入口仍是旧签名）。与该服务内部实例同款构造依赖（宿主 client 懒供给 + 本地管理面 +
     *  远端工厂），懒建单例；setter 供测试注入桩替换（生产无对应 bean）。 */
    protected volatile McpStructureSyncService structureSyncService;

    public void setStructureSyncService(McpStructureSyncService structureSyncService) {
        this.structureSyncService = structureSyncService;
    }

    protected McpStructureSyncService structureSync() {
        McpStructureSyncService service = structureSyncService;
        if (service == null) {
            throw new IllegalStateException("Structure sync service is not available in this deployment");
        }
        return service;
    }

    /** 连接探活/监控时序服务面；探活关闭或部署缺位时保持 null，工具调用处 fail-fast。 */
    private McpConnHealthProber connHealthProber;
    private McpMonitorMetricsStore monitorMetricsStore;
    private McpMonitorHistoryStore monitorHistoryStore;

    @Autowired(required = false)
    public void setConnHealthProber(McpConnHealthProber connHealthProber) {
        this.connHealthProber = connHealthProber;
    }

    @Autowired(required = false)
    public void setMonitorMetricsStore(McpMonitorMetricsStore monitorMetricsStore) {
        this.monitorMetricsStore = monitorMetricsStore;
    }

    @Autowired(required = false)
    public void setMonitorHistoryStore(McpMonitorHistoryStore monitorHistoryStore) {
        this.monitorHistoryStore = monitorHistoryStore;
    }

    /** 只读辅助工具面（Scout 收尾批）：配置实验室、settings 影响分析、操作审计流水与
     *  环形治理用量；全部经 setter 注入，宿主装配缺位时保持 null，工具调用处 fail-fast。 */
    private McpConfigLabService configLabService;
    private McpInsightService insightService;
    private ConsoleOpsAuditStore consoleOpsAuditStore;
    private McpRingUsage ringUsageController;

    @Autowired(required = false)
    public void setConfigLabService(McpConfigLabService configLabService) {
        this.configLabService = configLabService;
    }

    @Autowired(required = false)
    public void setInsightService(McpInsightService insightService) {
        this.insightService = insightService;
    }

    @Autowired(required = false)
    public void setConsoleOpsAuditStore(ConsoleOpsAuditStore consoleOpsAuditStore) {
        this.consoleOpsAuditStore = consoleOpsAuditStore;
    }

    @Autowired(required = false)
    public void setRingUsageController(McpRingUsage ringUsageController) {
        this.ringUsageController = ringUsageController;
    }

    /**
     * MCP 侧只认已存源连接档案（srcConnId），不收内联凭据——与 REST 侧
     * 连接模型的安全规则同口径（手输源连接一律拒绝）。角色低于档案 minRole 拒。
     */
    private RemoteClusterConn xmigrateSourceConn(String srcConnId, AuthContext auth) {
        String connId = srcConnId == null ? "" : srcConnId.trim();
        if (connId.isEmpty()) {
            throw new IllegalArgumentException(
                    "srcConnId is required: MCP xmigrate only accepts a stored source connection profile");
        }
        return xmigrateStoredConn(connId, auth);
    }

    /**
     * 目标侧连接档案解析（v3 destConnId）：空或 {@code host}=宿主集群（返回 null，不建远端连接）；
     * 其余与源侧同门（档案存在 + key 角色不低于档案 minRole），同样不收内联凭据。
     */
    private RemoteClusterConn xmigrateDestConn(String destConnId, AuthContext auth) {
        String connId = destConnId == null ? "" : destConnId.trim();
        if (connId.isEmpty() || "host".equalsIgnoreCase(connId)) {
            return null;
        }
        return xmigrateStoredConn(connId, auth);
    }

    /** 已存连接档案解析公共段：档案存在性 + key 角色不低于档案 minRole。 */
    private RemoteClusterConn xmigrateStoredConn(String connId, AuthContext auth) {
        if (connStore == null) {
            throw new IllegalStateException("Connection store is not available in this deployment");
        }
        RemoteClusterConn conn = connStore.get(connId);
        if (conn == null) {
            throw new IllegalArgumentException("连接不存在或已被删除: " + connId);
        }
        if (auth.key != null) {
            ConsoleRole keyRole = ConsoleRole.parse(auth.key.role);
            ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
            if (!keyRole.atLeast(required)) {
                throw new IllegalArgumentException("Key role " + keyRole.name()
                        + " is below connection minRole " + required.name() + ": " + connId);
            }
        }
        return conn;
    }

    /** 续跑/中止/单条删除的归属判定：创建者本人或 ADMIN（与 REST requireJobSource 同口径）。 */
    private void xmigrateRequireOwner(MigrateJobES job, AuthContext auth) {
        if (auth.key == null || ConsoleRole.parse(auth.key.role).atLeast(ConsoleRole.ADMIN)) {
            return;
        }
        String owner = job.getOwnerUsername() == null ? "" : job.getOwnerUsername().trim();
        if (owner.isEmpty() || owner.equals(auth.key.prefix)) {
            return;
        }
        throw new IllegalArgumentException("迁移作业 " + job.getJobId() + " 由 " + owner
                + " 创建：该操作仅限创建者本人或 ADMIN");
    }

    /** 读面视图：统一转 Map 供 structuredContent 直读；低于 REBUILD_OP 的 key 再脱敏
        源集群端点/源档案/捕获 settings/错误样本（与 REST 同口径）。 */
    private Object xmigrateJobView(MigrateJobES job, AuthContext auth) {
        Map<String, Object> copy = objectMapper.convertValue(job, Map.class);
        if (auth.key == null || ConsoleRole.parse(auth.key.role).atLeast(ConsoleRole.REBUILD_OP)) {
            return copy;
        }
        copy.remove("remoteEndpoint");
        copy.remove("srcConnId");
        copy.remove("savedSettings");
        copy.remove("errorSamples");
        return copy;
    }

    /**
     * 对账源侧文档数：low-level {@code _count}（跨大版本稳定，与
     * CrossClusterMigrateService.countRemote 同口径），经 RemoteEsClientFactory
     * 临时连源集群、用完即关。protected 供测试替换（真实链路触碰远端集群）。
     */
    protected Long xmigrateReconcileSourceCount(RemoteClusterConn conn, String sourceIndex) {
        requireXmigrateService();
        return crossClusterMigrateService.reconcileSourceCount(conn, sourceIndex);
    }

    /**
     * 对账目标侧文档数：走 es_count 同一条 {@code EsIndexAdmin.count} 链路（含索引守卫），
     * 由调用方 openScope(destConnId) 决定落在哪个宿主侧连接。protected 供测试替换。
     */
    protected Long xmigrateReconcileDestCount(String destIndex) {
        try {
            Map<String, Object> counted = esIndexAdmin.count(destIndex, "");
            Object cnt = counted == null ? null : counted.get("count");
            return cnt instanceof Number ? ((Number) cnt).longValue() : null;
        } catch (Exception e) {
            throw new IllegalStateException("读取目标索引文档数失败 [" + destIndex + "]: " + e.getMessage());
        }
    }

    /** 供内部/测试使用的 JSON discovery 重载；HTTP 映射只挂在带 Accept 的方法上。 */
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> discover(String authorization) {
        return (ResponseEntity<Map<String, Object>>) discover(authorization, null);
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> discover(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "Accept", required = false) String accept) {
        try {
            AuthContext auth = authenticate(authorization);
            Map<String, Object> client = clientMeta();
            LOG.info("[mcp-discovery] key={} ip={} remote={} ua={}",
                    auth.key == null ? "service-token" : auth.key.prefix,
                    client.get("ip"), client.get("remoteIp"), client.get("ua"));
            if (auth.key != null && accessService != null) {
                accessService.recordCall(auth.key, "server/discover", "server/discover", client, true, 0);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("protocolVersion", PROTOCOL_VERSION);
            out.put("supportedVersions", SUPPORTED_PROTOCOL_VERSIONS);
            out.put("ttlMs", CACHE_TTL_MS);
            out.put("cacheScope", "private");
            out.put("serverInfo", serverInfo());
            out.put("transport", "json-rpc-over-http");
            out.put("endpoint", mountedMcpPath());
            out.put("auth", auth.key == null ? "service-token" : "api-key");
            if (auth.key != null) {
                out.put("role", auth.key.role);
                out.put("connections", auth.key.connections == null || auth.key.connections.isEmpty()
                        ? Collections.singletonList("host") : auth.key.connections);
                out.put("permissions", auth.key.permissions == null || auth.key.permissions.isEmpty()
                        ? Collections.singletonList("read") : auth.key.permissions);
                out.put("connectionPermissions", auth.key.connectionPermissions == null
                        ? Collections.emptyMap() : auth.key.connectionPermissions);
            }
            out.put("tools", tools(auth.allowedTools));
            List<String> recommended = recommendedGroups(auth.allowedTools);
            out.put("recommendedTools", recommended);
            out.put("maxRecommendedTools", recommended.size());
            out.put("resources", resources(auth));
            out.put("resourceTemplates", resourceTemplates());
            out.put("prompts", prompts());
            out.put("capabilities", capabilities());
            out.put("instructions", instructions());
            List<Map<String, Object>> recent = new ArrayList<>();
            if (auth.key != null && auth.key.recentCalls != null) {
                for (Map<String, Object> call : auth.key.recentCalls) {
                    recent.add(new LinkedHashMap<>(call));
                }
            } else {
                synchronized (serviceCalls) {
                    for (Map<String, Object> call : serviceCalls) recent.add(new LinkedHashMap<>(call));
                }
            }
            out.put("recentCalls", recent);
            return ResponseEntity.ok(out);
        } catch (McpAccessException e) {
            logDenied(e);
            return deny(e, null);
        }
    }

    @PostMapping
    public ResponseEntity<?> rpc(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) Map<String, Object> request) {
        final AuthContext auth;
        try {
            auth = authenticate(authorization);
        } catch (McpAccessException e) {
            logDenied(e);
            return deny(e, null);
        }
        if (request == null) return ResponseEntity.badRequest().body(error(null, -32600, "Invalid Request"));

        Object id = request.get("id");
        String method = String.valueOf(request.get("method") == null ? "" : request.get("method"));
        if (method.isEmpty()) return ResponseEntity.ok(error(id, -32600, "Invalid Request"));

        Map<String, Object> auditMeta = clientMeta();
        String auditTool = method;
        if ("tools/call".equals(method)) {
            try {
                auditTool = auditToolName(request.get("params"));
            } catch (RuntimeException ignored) {
                /* 参数损坏时仍记录方法名，审计不能因为取不到工具名而丢失。 */
            }
        }
        final long auditStarted = System.currentTimeMillis();
        final boolean[] auditOk = {true};
        try {
            switch (method) {
                case "initialize":
                    return ResponseEntity.ok(result(id, initializeResult(request.get("params"), auth.allowedTools)));
                case "server/discover":
                    return ResponseEntity.ok(result(id, discoverResult(auth.allowedTools)));
                case "notifications/initialized":
                    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
                case "ping":
                    return ResponseEntity.ok(result(id, Collections.<String, Object>emptyMap()));
                case "tools/list": {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("tools", tools(auth.allowedTools));
                    return ResponseEntity.ok(result(id, cacheable(payload)));
                }
                case "resources/list": {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("resources", resources(auth));
                    return ResponseEntity.ok(result(id, cacheable(payload)));
                }
                case "resources/templates/list": {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("resourceTemplates", resourceTemplates());
                    return ResponseEntity.ok(result(id, cacheable(payload)));
                }
                case "resources/read": {
                    if (auth.key != null) {
                        try {
                            accessService.consume(auth.key, "resources/read");
                        } catch (McpAccessException e) {
                            return deny(e, id);
                        }
                    }
                    try {
                        /* 资源读取也会打 ES：与 tools/call 共用 180s 预算与取消台账，
                           避免慢集群把 HTTP 线程挂到客户端超时。 */
                        return ResponseEntity.ok(result(id, cacheable(readWithinBudget(
                                "resources/read", auth, auditMeta, control -> readResource(request.get("params"), auth)))));
                    } catch (Exception e) {
                        if (auth.key != null) accessService.recordError(auth.key);
                        throw e;
                    }
                }
                case "prompts/list": {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("prompts", prompts());
                    return ResponseEntity.ok(result(id, cacheable(payload)));
                }
                case "prompts/get":
                    return ResponseEntity.ok(result(id, getPrompt(request.get("params"))));
                case "completion/complete":
                    return ResponseEntity.ok(result(id, readWithinBudget(
                            "completion/complete", auth, auditMeta, control -> complete(request.get("params"), auth))));
                case "tools/call":
                    /* MCP 语义：工具执行失败是 result.isError，不是 JSON-RPC error；
                       与纯前端 browserMcp 的返回形状保持一致，客户端才能统一渲染。 */
                    Object callParams = normalizeGroupCall(request.get("params"));
                    /* 单轨工具面：只有 17 个 action 组工具；组外名字（含旧细粒度名）
                       一律按未知工具拒绝，不再分派。 */
                    String requestedName = toolName(request.get("params"));
                    if (!GROUP_ACTIONS.containsKey(requestedName)) {
                        auditOk[0] = false;
                        if (auth.key != null) accessService.recordError(auth.key);
                        return ResponseEntity.ok(result(id, toolError("Unknown tool: " + requestedName)));
                    }
                    String toolName = toolName(callParams);
                    String actionName = TOOL_ACTIONS.getOrDefault(toolName, toolName);
                    /* 静态服务 token 保留「未知工具」原语义；只有受限 key 才提前给 not-allowed。 */
                    if (auth.key != null && !auth.allowedTools.contains(actionName)) {
                        auditOk[0] = false;
                        return ResponseEntity.ok(result(id, toolError("Tool not allowed for this key: " + actionName)));
                    }
                    String target = "host";
                    boolean targetAware = !"es_list_connections".equals(toolName);
                    if (targetAware) {
                        try {
                            target = resolveTarget(auth, callParams);
                            enforceTargetPermission(auth, target, toolName, callParams);
                        } catch (IllegalArgumentException e) {
                            auditOk[0] = false;
                            return ResponseEntity.ok(result(id, toolError(e.getMessage())));
                        }
                    }
                    /* MRTR：支持 elicitation 的 2026 客户端在高危写操作前收到 input_required，
                       确认后才消耗配额并真正执行；不声明 elicitation 的客户端保持原行为。 */
                    if (clientDeclaresElicitation(request) && mrtrNeedsConfirmation(toolName, callParams)) {
                        Map<String, Object> callMap = asMapObject(callParams);
                        Map<String, Object> callArgs = asMapObject(callMap.get("arguments"));
                        Object responses = callMap.get("inputResponses");
                        Object state = callMap.get("requestState");
                        if (responses == null && callArgs.containsKey("inputResponses")) {
                            responses = callArgs.get("inputResponses");
                            state = callArgs.get("requestState");
                        }
                        if (responses == null) {
                            return ResponseEntity.ok(result(id, mrtrInputRequired(toolName, callArgs)));
                        }
                        /* 验签前剥净两键：challenge 签的是业务参数摘要，回执若把
                           inputResponses/requestState 嵌进 arguments，含两键的摘要恒不匹配。 */
                        Map<String, Object> cleanArgs = new LinkedHashMap<>(callArgs);
                        cleanArgs.remove("inputResponses");
                        cleanArgs.remove("requestState");
                        try {
                            verifyMrtrState(state == null ? "" : String.valueOf(state), toolName, cleanArgs);
                        } catch (IllegalArgumentException e) {
                            auditOk[0] = false;
                            return ResponseEntity.ok(error(id, -32602, e.getMessage()));
                        }
                        if (!mrtrConfirmed(responses)) {
                            return ResponseEntity.ok(result(id, mrtrCancelled(toolName)));
                        }
                        Map<String, Object> cleanParams = new LinkedHashMap<>(callMap);
                        cleanParams.put("arguments", cleanArgs);
                        callParams = cleanParams;
                    }
                    try {
                        if (auth.key != null) accessService.consume(auth.key, actionName);
                    } catch (McpAccessException e) {
                        auditOk[0] = false;
                        return deny(e, id);
                    }
                    McpTargetScope scope = null;
                    final boolean wantsTask = TASK_TOOLS.contains(toolName) && clientDeclaresTasks(request);
                    try {
                        Object toolResult;
                        if (wantsTask) {
                            /* Tasks 扩展：立即返回 working 任务，执行转移到有界工作池。
                               客户端断线后仍可 tasks/get 续传；tasks/cancel 真正中断执行。
                               目标绑定不能跨线程继承 ThreadLocal——执行体自己按 target 重开作用域。 */
                            McpTaskRegistry.Task task = submitToolTask(
                                    callParams, auth, toolName, target, auditMeta);
                            auditOk[0] = true;
                            return ResponseEntity.ok(result(id, taskCreatedEnvelope(task)));
                        }
                        toolResult = callToolWithinBudget(callParams, auth, toolName, target, auditMeta);
                        if (toolResult instanceof Map && Boolean.TRUE.equals(((Map<?, ?>) toolResult).get("isError"))) {
                            auditOk[0] = false;
                        }
                        return ResponseEntity.ok(result(id, toolResult));
                    } catch (McpTaskRegistry.TaskCancelled e) {
                        auditOk[0] = false;
                        return ResponseEntity.ok(result(id, taskCancelledEnvelope(toolName, e.reason)));
                    } catch (Exception e) {
                        auditOk[0] = false;
                        if (auth.key != null) accessService.recordError(auth.key);
                        return ResponseEntity.ok(result(id,
                                toolError(String.valueOf(e.getMessage()), toolErrorCode(e))));
                    } finally {
                        if (scope != null) scope.close();
                    }
                case "tasks/get":
                    return ResponseEntity.ok(result(id, getTask(request.get("params"), auth)));
                case "tasks/update":
                    /* Tasks 扩展的 update 只承载客户端备注/进度回写，服务端不受理状态改写。 */
                    return ResponseEntity.ok(result(id, Collections.<String, Object>emptyMap()));
                case "tasks/cancel":
                    return ResponseEntity.ok(result(id, cancelTask(request.get("params"), auth)));
                case "tasks/list": {
                    /* 控制台「在途任务」与客户端自省共用：owner 作用域，不带结果体。 */
                    Map<String, Object> params = asMapObject(request.get("params"));
                    boolean activeOnly = Boolean.TRUE.equals(params.get("activeOnly"));
                    int limit = params.get("limit") instanceof Number
                            ? ((Number) params.get("limit")).intValue() : 20;
                    List<Map<String, Object>> rows = taskRegistry.list(taskOwner(auth), activeOnly, limit);
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("tasks", rows);
                    payload.put("count", rows.size());
                    payload.put("callTimeoutMs", taskRegistry.callTimeoutMs());
                    return ResponseEntity.ok(result(id, payload));
                }
                case "notifications/cancelled":
                    cancelByRequest(request.get("params"), auth);
                    return ResponseEntity.status(HttpStatus.ACCEPTED).build();
                default:
                    return ResponseEntity.ok(error(id, -32601, "Method not found: " + method));
            }
        } catch (IllegalArgumentException e) {
            auditOk[0] = false;
            return ResponseEntity.ok(error(id, -32602, e.getMessage()));
        } catch (Exception e) {
            auditOk[0] = false;
            return ResponseEntity.ok(error(id, -32603, String.valueOf(e.getMessage())));
        } finally {
            /* 轮询类方法不进审计：页面「调用任务」条会周期读 tasks/list，若逐条落审计会在
               一天内产生数万条噪音，把真正的调用留档淹没（配额不消耗，但账本会被污染）。 */
            if (!QUIET_METHODS.contains(method)) {
                auditCall(auth, method, auditTool, auditMeta, auditOk[0], System.currentTimeMillis() - auditStarted);
            }
        }
    }

    private static final class AuthContext {
        private final McpKeyRecord key;
        private final List<String> allowedTools;

        private AuthContext(McpKeyRecord key, List<String> allowedTools) {
            this.key = key;
            this.allowedTools = allowedTools == null ? Collections.<String>emptyList()
                    : Collections.unmodifiableList(new ArrayList<>(allowedTools));
        }
    }

    private AuthContext authenticate(String authorization) {
        if (authorization == null || authorization.trim().isEmpty()) {
            if (token.isEmpty() && accessService == null) {
                throw new McpAccessException(503, "MCP_TOKEN_NOT_CONFIGURED",
                        "MCP is enabled but neither esquerystudio.mcp.token nor an API key store is configured");
            }
            throw new McpAccessException(401, "MCP_UNAUTHORIZED", "Missing MCP bearer token");
        }
        if (!token.isEmpty() && tokenMatches(authorization)) {
            return new AuthContext(null, ACTION_TOOL_NAMES);
        }
        String raw = authorization.startsWith("Bearer ") ? authorization.substring(7).trim() : "";
        /* 不按用户可控的 key 前缀决定是否进入认证；任何非静态 token 都交给 key store
           校验，由 store 做哈希查找并返回统一的 401。 */
        if (accessService != null) {
            try {
                McpKeyRecord key = accessService.authenticate(raw);
                List<String> allowed = new ArrayList<>();
                /* 工具目录按「任意连接」汇总；真正执行时按目标连接的有效权限再判一次。
                   白名单是「组:action」粒度：存量 key 的细粒度工具名经 TOOL_ACTIONS
                   一次反查到所属 action（签发面新签的 key 已直接落限定名）。
                   toolPack=full 的全量常青包跳过逐项命中检查，按「当前」目录整体纳入——
                   服务端升级新增 action 自动可用（读写边界/ADMIN 专属/连接授权照常过滤），
                   免除每次发版后人工补勾。 */
                boolean anyRead = key.hasAnyRead();
                boolean anyWrite = key.hasAnyWrite();
                boolean packFull = "full".equals(key.toolPack);
                if (key.allowedTools != null) {
                    for (Map.Entry<String, Map<String, String>> group : GROUP_ACTIONS.entrySet()) {
                        for (Map.Entry<String, String> action : group.getValue().entrySet()) {
                            String tool = action.getValue();
                            if (!"ADMIN".equalsIgnoreCase(key.role) && ADMIN_ONLY_TOOLS.contains(tool)) continue;
                            /* 参数守卫型工具（es_rest 的 GET/HEAD、smart_sync 的 apply=false
                               只读预览）目录级对只读 key 放行，连接级再按参数细判写权限。 */
                            boolean paramGuarded = "es_rest".equals(tool) || "es_xmigrate_smart_sync".equals(tool);
                            boolean permitted = paramGuarded
                                    ? (anyRead || anyWrite)
                                    : (WRITE_TOOLS.contains(tool) ? anyWrite : anyRead);
                            String qualified = group.getKey() + ":" + action.getKey();
                            if ((packFull || key.allowedTools.contains(tool) || key.allowedTools.contains(qualified)) && permitted) {
                                allowed.add(qualified);
                            }
                        }
                    }
                }
                return new AuthContext(key, allowed);
            } catch (McpAccessException e) {
                if (token.isEmpty()) throw e;
                throw new McpAccessException(401, "MCP_UNAUTHORIZED", "Missing or invalid MCP bearer token");
            }
        }
        if (token.isEmpty()) {
            throw new McpAccessException(503, "MCP_TOKEN_NOT_CONFIGURED",
                    "MCP is enabled but esquerystudio.mcp.token is not configured");
        }
        throw new McpAccessException(401, "MCP_UNAUTHORIZED", "Missing or invalid MCP bearer token");
    }

    private ResponseEntity<Map<String, Object>> deny(McpAccessException e, Object id) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("code", -32000);
        err.put("message", e.getMessage());
        err.put("data", e.getCode());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jsonrpc", "2.0");
        body.put("id", id);
        body.put("error", err);
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(e.getStatus());
        if (e.getRetryAfterSeconds() > 0) builder.header("Retry-After", String.valueOf(e.getRetryAfterSeconds()));
        return builder.body(body);
    }

    /** 审计名保留 action 组与动作，例如 es_indices:create；兼容旧名时仍是原工具名。 */
    private String auditToolName(Object paramsValue) {
        String name = toolName(paramsValue);
        if (!(paramsValue instanceof Map)) return name;
        Object arguments = ((Map<?, ?>) paramsValue).get("arguments");
        if (!(arguments instanceof Map)) return name;
        Object action = ((Map<?, ?>) arguments).get("action");
        String actionText = action == null ? "" : String.valueOf(action).trim();
        return actionText.isEmpty() ? name : name + ":" + actionText;
    }

    /** action 型分组工具归一化为内部路由名（组面是唯一工具面，action 必填）。 */
    @SuppressWarnings("unchecked")
    private Object normalizeGroupCall(Object paramsValue) {
        if (!(paramsValue instanceof Map)) return paramsValue;
        Map<?, ?> params = (Map<?, ?>) paramsValue;
        String name = params.get("name") == null ? "" : String.valueOf(params.get("name"));
        Map<String, String> actions = GROUP_ACTIONS.get(name);
        if (actions == null) return paramsValue;
        Map<String, Object> args = new LinkedHashMap<>();
        Object rawArgs = params.get("arguments");
        if (rawArgs instanceof Map) {
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) rawArgs).entrySet()) {
                args.put(String.valueOf(entry.getKey()), entry.getValue());
            }
        }
        Object actionValue = args.remove("action");
        String action = actionValue == null ? "" : String.valueOf(actionValue).trim();
        if (action.isEmpty()) {
            throw new IllegalArgumentException("Missing action for " + name + "; expected one of " + actions.keySet());
        }
        String legacy = actions.get(action);
        if (legacy == null) {
            throw new IllegalArgumentException("Unknown action " + action + " for " + name
                    + "; expected one of " + actions.keySet());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : params.entrySet()) {
            out.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        out.put("name", legacy);
        out.put("arguments", args);
        return out;
    }

    private String toolName(Object paramsValue) {
        if (!(paramsValue instanceof Map)) return "";
        Object name = ((Map<?, ?>) paramsValue).get("name");
        return name == null ? "" : String.valueOf(name);
    }

    /** 解析本次工具调用的连接目标；key 的连接集合是硬边界，不能靠参数越界。 */
    private String resolveTarget(AuthContext auth, Object paramsValue) {
        String requested = "";
        if (paramsValue instanceof Map) {
            Object arguments = ((Map<?, ?>) paramsValue).get("arguments");
            if (arguments instanceof Map) {
                Object value = ((Map<?, ?>) arguments).get("connection");
                if (value != null) requested = String.valueOf(value).trim();
            }
        }
        List<String> allowed = null;
        if (auth.key != null) {
            allowed = auth.key.connections == null || auth.key.connections.isEmpty()
                    ? Collections.singletonList("host") : auth.key.connections;
            if (requested.isEmpty()) return allowed.get(0);
            if (!allowed.contains(requested)) {
                throw new IllegalArgumentException("Connection not allowed for this key: " + requested);
            }
        }
        if (requested.isEmpty()) return "host";
        if ("host".equalsIgnoreCase(requested) && !hostClusterVisible) {
            throw new IllegalArgumentException("Host cluster is disabled in this deployment; choose a connection");
        }
        if (!"host".equalsIgnoreCase(requested)) {
            if (clientRouter == null) {
                throw new IllegalArgumentException("Connection routing is not available in this deployment");
            }
            if (connStore != null) {
                RemoteClusterConn conn = connStore.get(requested);
                if (conn == null) throw new IllegalArgumentException("Connection not found: " + requested);
                if (auth.key != null) {
                    ConsoleRole keyRole = ConsoleRole.parse(auth.key.role);
                    ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
                    if (!keyRole.atLeast(required)) {
                        throw new IllegalArgumentException("Key role " + keyRole.name()
                                + " is below connection minRole " + required.name() + ": " + requested);
                    }
                }
            }
        }
        return requested;
    }

    /**
     * 连接级权限闸：同一个 key 可以「QA/UAT 可写、生产只读」。
     * 工具清单只证明 key 拥有某种能力，真正落到哪个连接由这里判定。
     */
    private void enforceTargetPermission(AuthContext auth, String target, String toolName, Object paramsValue) {
        if (auth.key == null) return;
        Map<?, ?> args = Collections.emptyMap();
        if (paramsValue instanceof Map) {
            Object raw = ((Map<?, ?>) paramsValue).get("arguments");
            if (raw instanceof Map) args = (Map<?, ?>) raw;
        }
        boolean write = requiresWrite(toolName, args);
        List<String> permissions = auth.key.permissionsFor(target);
        if (write && !permissions.contains("write")) {
            throw new IllegalArgumentException("Connection " + target
                    + " is read-only for this key; write is not allowed");
        }
        if (!write && !permissions.contains("read")) {
            throw new IllegalArgumentException("Connection " + target
                    + " has no read permission for this key");
        }
    }

    private boolean requiresWrite(String toolName, Map<?, ?> args) {
        if (WRITE_TOOLS.contains(toolName)) {
            /* smart_sync 只读预览形态：apply=false 且 savePlan=false 时只产出同步计划，不向目标集群
               发 PUT、不写控制面计划索引，不占写权限；savePlan=true 写计划存储，按写工具裁决。 */
            return !("es_xmigrate_smart_sync".equals(toolName)
                    && !Boolean.TRUE.equals(args.get("apply"))
                    && !Boolean.TRUE.equals(args.get("savePlan")));
        }
        if ("es_rest".equals(toolName)) {
            String method = args.get("method") == null ? "" : String.valueOf(args.get("method"));
            String path = args.get("path") == null ? "" : String.valueOf(args.get("path"));
            return !McpRestClassifier.isReadOnly(method, path);
        }
        return false;
    }

    /** 服务级 token 即部署级管理员；API key 以签发时角色快照判定。 */
    private boolean isAdmin(AuthContext auth) {
        return auth.key == null || "ADMIN".equalsIgnoreCase(auth.key.role);
    }

    /** 认证失败也要留 IP/UA，便于区分“客户端配错 key”与“网络/代理问题”。 */
    private void logDenied(McpAccessException e) {
        Map<String, Object> meta = clientMeta();
        LOG.warn("[mcp-denied] status={} code={} message={} key={} requestId={} ip={} remote={} http={} ua={}",
                e.getStatus(), e.getCode(), e.getMessage(),
                e.getKeyPrefix() == null || e.getKeyPrefix().isEmpty() ? "-" : e.getKeyPrefix(),
                meta.get("requestId"), meta.get("ip"), meta.get("remoteIp"), meta.get("http"), meta.get("ua"));
    }

    /** 每次 MCP 调用都留档：服务端日志用于后端排查，key 调用同时持久化最近 100 条。 */
    private void auditCall(AuthContext auth, String method, String tool, Map<String, Object> meta,
                           boolean ok, long durationMs) {
        String key = auth.key == null ? "service-token" : auth.key.prefix;
        LOG.info("[mcp-call] key={} method={} tool={} ok={} ms={} requestId={} ip={} remote={} http={} ua={}",
                key, method, tool, ok, durationMs, meta.get("requestId"), meta.get("ip"), meta.get("remoteIp"),
                meta.get("http"), meta.get("ua"));
        if (auth.key != null && accessService != null) {
            accessService.recordCall(auth.key, method, tool, meta, ok, durationMs);
            return;
        }
        Map<String, Object> call = new LinkedHashMap<>();
        call.put("method", method);
        call.put("tool", tool == null || tool.trim().isEmpty() ? method : tool);
        call.put("at", System.currentTimeMillis());
        call.put("ok", ok);
        call.put("ms", Math.max(0L, durationMs));
        call.putAll(meta);
        synchronized (serviceCalls) {
            serviceCalls.addFirst(call);
            while (serviceCalls.size() > 100) serviceCalls.removeLast();
        }
    }

    /** 调用方 IP/UA 等排查字段；优先取反向代理 X-Forwarded-For 首跳，同时保留 remoteAddr。 */
    private Map<String, Object> clientMeta() {
        McpRequestContext request = requestContext();
        if (request == null) return Collections.emptyMap();
        String remote = request.remoteAddr();
        String forwarded = request.header("X-Forwarded-For");
        String ip = forwarded == null || forwarded.trim().isEmpty()
                ? remote : forwarded.split(",")[0].trim();
        String requestId = request.header("X-Request-Id");
        if (requestId == null || requestId.trim().isEmpty()) {
            requestId = UUID.randomUUID().toString();
        }
        request.setResponseHeader("X-Request-Id", requestId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", truncate(requestId, 80));
        if (ip != null && !ip.trim().isEmpty()) out.put("ip", ip);
        if (remote != null && !remote.equals(ip)) out.put("remoteIp", remote);
        String userAgent = request.header("User-Agent");
        if (userAgent != null && !userAgent.trim().isEmpty()) out.put("ua", truncate(userAgent, 240));
        String origin = request.header("Origin");
        if (origin != null && !origin.trim().isEmpty()) out.put("origin", truncate(origin, 240));
        String uri = request.requestUri() == null ? "" : request.requestUri();
        out.put("transport", "http");
        out.put("http", request.method() + " " + uri);
        return out;
    }

    private String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    /** 定长时间比较，避免 token 逐字符比较的时序侧信道。 */
    private boolean tokenMatches(String authorization) {
        if (authorization == null) return false;
        byte[] expected = ("Bearer " + token).getBytes(StandardCharsets.UTF_8);
        byte[] actual = authorization.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual);
    }

    private Map<String, Object> capabilities() {
        Map<String, Object> capabilities = new LinkedHashMap<>();
        capabilities.put("tools", Collections.<String, Object>singletonMap("listChanged", false));
        Map<String, Object> extensions = new LinkedHashMap<>();
        extensions.put(TASKS_EXTENSION, new LinkedHashMap<String, Object>());
        extensions.put(APPS_EXTENSION, new LinkedHashMap<String, Object>());
        capabilities.put("extensions", extensions);
        if (!compactSurface()) {
            Map<String, Object> resourcesCap = new LinkedHashMap<>();
            resourcesCap.put("subscribe", false);
            resourcesCap.put("listChanged", false);
            capabilities.put("resources", resourcesCap);
            capabilities.put("prompts", Collections.<String, Object>singletonMap("listChanged", false));
        }
        return capabilities;
    }

    private String instructions() {
        return "ESQueryStudio exposes Elasticsearch tools with per-connection permissions. "
                + "Call es_connections with action=list first, then pass connection on every call. "
                + "Read tools require read; writes require write and an explicitly write-enabled key or local switch. "
                + "The client-facing surface is 17 action-typed tools; pass action plus its arguments. "
                + "recommendedTools lists the groups to load first; maxRecommendedTools=" + GROUP_TOOL_NAMES.size() + ". "
                + "Resources expose connection, cluster and index metadata; prompts provide guided diagnostics; "
                + "completion/complete fills connection and index arguments. "
                + "Tool failures are returned as isError results, not protocol errors.";
    }

    private Map<String, Object> initializeResult(Object paramsValue, List<String> allowed) {
        String requested = "";
        if (paramsValue instanceof Map) {
            Object value = ((Map<?, ?>) paramsValue).get("protocolVersion");
            if (value != null) requested = String.valueOf(value).trim();
        }
        /* 老客户端继续走 initialize；新客户端可省略 initialize 改用 server/discover。
           明确请求的受支持版本原样回显；未知版本回落到广泛兼容的 2025-06-18，避免老 SDK
           把“服务器回最新版”当成 Unsupported protocol version。无请求头才用最新版。 */
        String negotiated = requested.isEmpty() ? PROTOCOL_VERSION
                : (SUPPORTED_PROTOCOL_VERSIONS.contains(requested) ? requested : LEGACY_PROTOCOL_VERSION);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("protocolVersion", negotiated);
        result.put("supportedVersions", SUPPORTED_PROTOCOL_VERSIONS);
        result.put("capabilities", capabilities());
        result.put("serverInfo", serverInfo());
        result.put("instructions", instructions());
        List<String> recommended = recommendedGroups(allowed);
        result.put("recommendedTools", recommended);
        result.put("maxRecommendedTools", recommended.size());
        return result;
    }

    private Map<String, Object> discoverResult(List<String> allowed) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("supportedVersions", SUPPORTED_PROTOCOL_VERSIONS);
        result.put("capabilities", capabilities());
        /* 2026-07-28 stateless discovery 要求服务身份可被发现；不能只在 initialize 里给。 */
        result.put("serverInfo", serverInfo());
        result.put("instructions", instructions());
        result.put("endpoint", mountedMcpPath());
        List<String> recommended = recommendedGroups(allowed);
        result.put("recommendedTools", recommended);
        result.put("maxRecommendedTools", recommended.size());
        return cacheable(result);
    }

    /** 2026-07-28 的缓存提示字段；列表/资源/发现结果统一带稳定 TTL，客户端可安全缓存。 */
    private Map<String, Object> cacheable(Map<String, Object> payload) {
        payload.put("ttlMs", CACHE_TTL_MS);
        payload.put("cacheScope", "private");
        return payload;
    }

    /** GUI 客户端精简面：query 参数优先，其次请求头；只影响 discovery，不影响 key 的工具权限。 */
    private boolean compactSurface() {
        McpRequestContext request = requestContext();
        if (request == null) return false;
        String surface = request.parameter("surface");
        if (surface == null || surface.trim().isEmpty()) {
            surface = request.header("X-MCP-Surface");
        }
        return surface != null && "compact".equalsIgnoreCase(surface.trim());
    }

    private static String resolveServerVersion() {
        String version = McpServerCore.class.getPackage() == null
                ? null : McpServerCore.class.getPackage().getImplementationVersion();
        return version == null || version.trim().isEmpty() ? "dev" : version;
    }

    private Map<String, Object> serverInfo() {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("name", SERVER_NAME);
        info.put("version", SERVER_VERSION);
        info.put("mode", "server");
        info.put("surface", compactSurface() ? "compact" : "full");
        return info;
    }

    /** resources/list：静态连接清单 + 当前身份可访问的连接资源。
     *  name 是给客户端 UI 展示的人类可读名称，不能塞连接 id（WorkBuddy 等客户端会把 name 直接列出来）。 */
    private List<Map<String, Object>> resources(AuthContext auth) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (compactSurface()) return out;
        out.add(mcpAppResource());
        out.add(resource("esquerystudio://connections", "连接目录", "MCP 连接",
                "当前 MCP 身份可访问的连接及读写范围。"));
        List<Map<String, Object>> connections;
        try {
            connections = listConnections(auth);
        } catch (RuntimeException e) {
            /* 控制集群尚未绑定时资源目录仍可发现；连接读取会返回真实 Setup 错误。 */
            connections = Collections.emptyList();
        }
        for (Map<String, Object> conn : connections) {
            String id = String.valueOf(conn.get("id"));
            String name = String.valueOf(conn.get("name") == null ? id : conn.get("name")).trim();
            if (name.isEmpty() || name.equals("null")) name = id;
            out.add(resource("esquerystudio://connection/" + encodeSegment(id), "连接 · " + name,
                    name,
                    "连接 " + name + "（" + id + "）的实时健康与统计。"));
        }
        if (crossClusterMigrateService != null) {
            out.add(resource("esquerystudio://xmigrate/jobs", "迁移作业摘要", "Migrate jobs",
                    "跨集群迁移作业摘要（每作业一行：jobId/state/srcConnId/sourceIndex/destConnId/destIndex/updatedMs；"
                            + "终态与运行中都在；读取需 es_xmigrate:jobs 权限）。"));
        }
        return out;
    }

    /** MCP Apps 扩展：静态 HTML 资源，由 action 工具的 _meta.ui.resourceUri 绑定。 */
    private Map<String, Object> mcpAppResource() {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("uri", MCP_APP_URI);
        item.put("name", "ESQueryStudio Tool Console");
        item.put("title", "ESQueryStudio Tool Console");
        item.put("description", "MCP Apps surface for ESQueryStudio tools.");
        item.put("mimeType", MCP_APP_MIME);
        item.put("_meta", Collections.singletonMap("ui", appUiMeta()));
        return item;
    }

    private Map<String, Object> appUiMeta() {
        Map<String, Object> csp = new LinkedHashMap<>();
        csp.put("connectDomains", Collections.emptyList());
        csp.put("resourceDomains", Collections.emptyList());
        csp.put("frameDomains", Collections.emptyList());
        csp.put("baseUriDomains", Collections.emptyList());
        Map<String, Object> ui = new LinkedHashMap<>();
        ui.put("csp", csp);
        ui.put("permissions", new LinkedHashMap<String, Object>());
        ui.put("prefersBorder", true);
        return ui;
    }

    private Map<String, Object> resource(String uri, String name, String title, String description) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("uri", uri);
        item.put("name", name);
        item.put("title", title);
        item.put("description", description);
        item.put("mimeType", "application/json");
        return item;
    }

    /** resources/templates/list：带占位符的只读资源模板。 */
    private List<Map<String, Object>> resourceTemplates() {
        List<Map<String, Object>> out = new ArrayList<>();
        if (compactSurface()) return out;
        out.add(resourceTemplate("esquerystudio://connection/{connection}", "连接详情", "Connection detail",
                "单个连接的实时健康与统计。"));
        out.add(resourceTemplate("esquerystudio://cluster/{connection}", "集群概览", "Cluster overview",
                "单个连接的健康、统计与节点信息。"));
        out.add(resourceTemplate("esquerystudio://indices/{connection}", "索引目录", "Index catalog",
                "单个连接的非系统索引清单。"));
        out.add(resourceTemplate("esquerystudio://aliases/{connection}", "别名目录", "Alias catalog",
                "单个连接的索引别名清单。"));
        out.add(resourceTemplate("esquerystudio://data_streams/{connection}", "数据流目录", "Data stream catalog",
                "单个连接的数据流及其后备索引。"));
        out.add(resourceTemplate("esquerystudio://component_templates/{connection}", "组件模板目录", "Component template catalog",
                "单个连接的可组合组件模板。"));
        out.add(resourceTemplate("esquerystudio://index/{connection}/{index}", "索引详情", "Index detail",
                "单个索引的 Mapping、设置、别名与统计。"));
        out.add(resourceTemplate("esquerystudio://index/{connection}/{index}/mapping", "索引 Mapping", "Index mapping",
                "单个索引的实时 Mapping 与扁平字段树。"));
        out.add(resourceTemplate("esquerystudio://xmigrate/jobs", "迁移作业摘要", "Migrate jobs",
                "跨集群迁移作业摘要（每作业一行：jobId/state/srcConnId/sourceIndex/destConnId/destIndex/updatedMs；"
                        + "终态与运行中都在；读取需 es_xmigrate:jobs 权限）。"));
        out.add(resourceTemplate("esquerystudio://xmigrate/job/{id}/events", "迁移作业事件流", "Migrate job events",
                "单个迁移作业的事件时间线（{ts,stage,message,level}，与 REST /jobs/{id}/events 同构；"
                        + "读取需 es_xmigrate:status 权限且作业归属为创建者本人或 ADMIN）。"));
        out.add(resourceTemplate("esquerystudio://xmigrate/plan/{id}", "同步计划快照", "Smart sync plan",
                "单个 smart_sync 同步计划的记录与预览快照（保存时的参数、planDigest、执行记账，以及 planned 清单 /"
                        + " autoTuned / advice / warnings / body 或增量五清单全量；读取需 es_xmigrate:plan_list 权限）。"));
        return out;
    }

    private Map<String, Object> resourceTemplate(String uriTemplate, String name, String title, String description) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("uriTemplate", uriTemplate);
        item.put("name", name);
        item.put("title", title);
        item.put("description", description);
        item.put("mimeType", "application/json");
        return item;
    }

    /**
     * resources/read：资源只读，仍严格走 key 的连接边界与逐连接 read 权限；
     * 资源不占用 tools/call 配额，但不会绕过 key 的工具白名单。
     */
    private Map<String, Object> readResource(Object paramsValue, AuthContext auth) throws IOException {
        if (!(paramsValue instanceof Map)) throw new IllegalArgumentException("params must be an object");
        Object rawUri = ((Map<?, ?>) paramsValue).get("uri");
        String uri = rawUri == null ? "" : String.valueOf(rawUri).trim();
        if (MCP_APP_URI.equals(uri)) return mcpAppContents(uri);
        String prefix = "esquerystudio://";
        if (!uri.startsWith(prefix)) throw new IllegalArgumentException("Unsupported resource URI: " + uri);
        String path = uri.substring(prefix.length());
        while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        String[] parts = path.split("/");
        if (parts.length == 1 && "connections".equals(parts[0])) {
            return resourceContents(uri, listConnections(auth));
        }
        if (parts.length == 2 && "connection".equals(parts[0])) {
            String connection = decodeSegment(parts[1]);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("connection", connection);
            out.put("health", invokeReadTool("es_cluster_health", connectionArgs(connection), auth));
            out.put("stats", invokeReadTool("es_cluster_stats", connectionArgs(connection), auth));
            return resourceContents(uri, out);
        }
        if (parts.length == 2 && "cluster".equals(parts[0])) {
            String connection = decodeSegment(parts[1]);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("connection", connection);
            out.put("health", invokeReadTool("es_cluster_health", connectionArgs(connection), auth));
            out.put("stats", invokeReadTool("es_cluster_stats", connectionArgs(connection), auth));
            out.put("nodes", invokeReadTool("es_list_nodes", connectionArgs(connection), auth));
            return resourceContents(uri, out);
        }
        if (parts.length == 2 && "indices".equals(parts[0])) {
            String connection = decodeSegment(parts[1]);
            return resourceContents(uri, invokeReadTool("es_list_indices", connectionArgs(connection), auth));
        }
        if (parts.length == 2 && "aliases".equals(parts[0])) {
            String connection = decodeSegment(parts[1]);
            return resourceContents(uri, invokeReadTool("es_get_aliases", connectionArgs(connection), auth));
        }
        if (parts.length == 2 && "data_streams".equals(parts[0])) {
            String connection = decodeSegment(parts[1]);
            return resourceContents(uri, invokeReadTool("es_list_data_streams", connectionArgs(connection), auth));
        }
        if (parts.length == 2 && "component_templates".equals(parts[0])) {
            String connection = decodeSegment(parts[1]);
            return resourceContents(uri, invokeReadTool("es_list_component_templates", connectionArgs(connection), auth));
        }
        if (parts.length >= 3 && "index".equals(parts[0])) {
            String connection = decodeSegment(parts[1]);
            String index = decodeSegment(parts[2]);
            Map<String, Object> args = connectionArgs(connection);
            args.put("index", index);
            if (parts.length == 4 && "mapping".equals(parts[3])) {
                return resourceContents(uri, invokeReadTool("es_get_mapping", args, auth));
            }
            if (parts.length == 3) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("connection", connection);
                out.put("index", index);
                out.put("mapping", invokeReadTool("es_get_mapping", args, auth));
                out.put("settings", invokeReadTool("es_get_settings", args, auth));
                out.put("aliases", invokeReadTool("es_get_aliases", args, auth));
                out.put("stats", invokeReadTool("es_get_index_stats", args, auth));
                return resourceContents(uri, out);
            }
        }
        /* 任务资源：Agent 断线后按 id 续查，不必回读整屏调用日志。 */
        if (parts.length == 2 && "task".equals(parts[0])) {
            String taskId = decodeSegment(parts[1]);
            Map<String, Object> task = taskRegistry.view(taskId, taskOwner(auth));
            if (task == null) throw new IllegalArgumentException("任务不存在或不属于当前凭证: " + taskId);
            task.remove("result");
            return resourceContents(uri, task);
        }
        if (parts.length == 2 && "tasks".equals(parts[0]) && "active".equals(parts[1])) {
            Map<String, Object> payload = new LinkedHashMap<>();
            List<Map<String, Object>> rows = taskRegistry.list(taskOwner(auth), true, 20);
            payload.put("tasks", rows);
            payload.put("count", rows.size());
            payload.put("callTimeoutMs", taskRegistry.callTimeoutMs());
            return resourceContents(uri, payload);
        }
        if (parts.length == 2 && "xmigrate".equals(parts[0]) && "jobs".equals(parts[1])) {
            requireXmigrateResourceTool(auth, "es_xmigrate:jobs");
            return resourceContents(uri, xmigrateJobsResource(auth));
        }
        if (parts.length == 4 && "xmigrate".equals(parts[0]) && "job".equals(parts[1])
                && "events".equals(parts[3])) {
            /* 单作业事件流：与 REST /jobs/{id}/events 同构；可见性按作业归属口径
               （创建者本人或 ADMIN，legacy 无归属作业公开可读——与续跑/中止同门）。 */
            requireXmigrateResourceTool(auth, "es_xmigrate:status");
            requireXmigrateService();
            MigrateJobES job = crossClusterMigrateService.progress(decodeSegment(parts[2]));
            xmigrateRequireOwner(job, auth);
            return resourceContents(uri, crossClusterMigrateService.events(job.getJobId()));
        }
        if (parts.length == 3 && "xmigrate".equals(parts[0]) && "plan".equals(parts[1])) {
            /* 同步计划快照：记录 + 保存时的预览报告全量；计划不存在按参数错误回（与作业不存在同通道）。 */
            requireXmigrateResourceTool(auth, "es_xmigrate:plan_list");
            requireXmigrateService();
            String planId = decodeSegment(parts[2]);
            PlanRecord plan = structureSync().planStore().find(planId);
            if (plan == null) {
                throw new IllegalArgumentException(McpPlanStore.NOT_FOUND_PREFIX + planId);
            }
            return resourceContents(uri, xmigratePlanView(plan, true, auth));
        }
        throw new IllegalArgumentException("Unsupported resource URI: " + uri);
    }

    /**
     * 计划读面视图：{@link PlanRecord#toSummary()} 的 12 键，{@code withSnapshot=true} 时另带
     * 回退分析器与预览快照。低于 REBUILD_OP 的 key 脱敏源档案 id（与作业读面 xmigrateJobView 同口径），
     * 快照里回显的源连接标识一并抹去。
     */
    private Map<String, Object> xmigratePlanView(PlanRecord plan, boolean withSnapshot, AuthContext auth) {
        boolean redact = auth.key != null
                && !ConsoleRole.parse(auth.key.role).atLeast(ConsoleRole.REBUILD_OP);
        Map<String, Object> out = plan.toSummary();
        if (!withSnapshot) {
            if (redact) out.remove("srcConnId");
            return out;
        }
        out.put("fallbackAnalyzer", plan.getFallbackAnalyzer());
        Map<String, Object> snapshot = new LinkedHashMap<>();
        if (plan.getSnapshot() != null && !plan.getSnapshot().isEmpty()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = objectMapper.readValue(plan.getSnapshot(), Map.class);
                snapshot.putAll(parsed);
            } catch (Exception e) {
                LOG.warn("[mcp-resource] sync plan snapshot is unreadable planId={}", plan.getPlanId(), e);
            }
        }
        if (redact) {
            out.remove("srcConnId");
            if (snapshot.get("source") instanceof Map) {
                ((Map<?, ?>) snapshot.get("source")).remove("connection");
            }
        }
        out.put("snapshot", snapshot);
        return out;
    }

    /** xmigrate 资源的工具白名单门：与既有资源经 invokeReadTool 的工具白名单判定同口径。 */
    private void requireXmigrateResourceTool(AuthContext auth, String qualifiedAction) {
        if (auth.key != null && !auth.allowedTools.contains(qualifiedAction)) {
            throw new IllegalArgumentException(
                    "Resource requires a tool that is not allowed for this key: " + qualifiedAction);
        }
    }

    /** esquerystudio://xmigrate/jobs 的资源体：作业摘要（每作业一行，终态与运行中都在）；
        低于 REBUILD_OP 的 key 脱敏源档案 id（与作业视图 xmigrateJobView 同口径），
        迁移写入端恒宿主集群（destConnId 固定回显 host）。 */
    private List<Map<String, Object>> xmigrateJobsResource(AuthContext auth) {
        requireXmigrateService();
        boolean redactConn = auth.key != null
                && !ConsoleRole.parse(auth.key.role).atLeast(ConsoleRole.REBUILD_OP);
        List<Map<String, Object>> lines = new ArrayList<>();
        for (MigrateJobES job : crossClusterMigrateService.jobs(20)) {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("jobId", job.getJobId());
            line.put("state", job.getStatus());
            if (!redactConn) line.put("srcConnId", job.getSrcConnId());
            line.put("sourceIndex", job.getSourceIndex());
            line.put("destConnId", "host");
            line.put("destIndex", job.getDestIndex());
            Long updatedMs = job.getUpdateTime();
            if (updatedMs == null) updatedMs = job.getFinishedAtMs();
            if (updatedMs == null) updatedMs = job.getStartedAtMs();
            if (updatedMs == null) updatedMs = job.getCreateTime();
            line.put("updatedMs", updatedMs);
            lines.add(line);
        }
        return lines;
    }

    private Map<String, Object> connectionArgs(String connection) {
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("connection", connection);
        return args;
    }

    private Map<String, Object> mcpAppContents(String uri) throws IOException {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("uri", uri);
        content.put("mimeType", MCP_APP_MIME);
        content.put("text", MCP_APP_HTML);
        content.put("_meta", Collections.singletonMap("ui", appUiMeta()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("contents", Collections.singletonList(content));
        return out;
    }

    private Map<String, Object> resourceContents(String uri, Object data) throws IOException {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("uri", uri);
        content.put("mimeType", "application/json");
        content.put("text", objectMapper.writeValueAsString(data));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("contents", Collections.singletonList(content));
        return out;
    }

    /** 资源内部复用工具实现；先按 key 工具白名单、连接边界、连接 read 权限逐层判定。 */
    private Object invokeReadTool(String tool, Map<String, Object> args, AuthContext auth) throws IOException {
        if (auth.key != null && !auth.allowedTools.contains(TOOL_ACTIONS.getOrDefault(tool, tool))) {
            throw new IllegalArgumentException("Resource requires a tool that is not allowed for this key: " + tool);
        }
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", tool);
        params.put("arguments", args);
        String target = resolveTarget(auth, params);
        enforceTargetPermission(auth, target, tool, params);
        McpTargetScope scope =
                clientRouter == null ? null : clientRouter.openScope(target);
        try {
            Object result = callTool(params, auth);
            if (result instanceof Map) {
                Object structured = ((Map<?, ?>) result).get("structuredContent");
                if (structured != null) return structured;
            }
            return result;
        } finally {
            if (scope != null) scope.close();
        }
    }

    private List<Map<String, Object>> prompts() {
        List<Map<String, Object>> out = new ArrayList<>();
        if (compactSurface()) return out;
        out.add(prompt("diagnose_slow_query", "Diagnose a slow query",
                "Evidence-first latency diagnosis using profile, shard timing and cluster pressure.",
                Arrays.asList(
                        promptArg("connection", "Connection id to investigate.", true),
                        promptArg("index", "Target index or alias; omit for a cluster-wide triage.", false),
                        promptArg("query", "The query or DSL to diagnose; omit to start from symptoms.", false))));
        out.add(prompt("design_index_mapping", "Design an index mapping",
                "Propose a mapping and index settings from sample documents and access patterns.",
                Arrays.asList(
                        promptArg("index", "Index name or purpose.", true),
                        promptArg("sample", "One or more sample documents or a field list.", false),
                        promptArg("access", "Known filters, sorts, aggregations and retention.", false))));
        out.add(prompt("migrate_index", "Plan an index migration",
                "Plan and verify a reindex or cross-cluster migration with zero-surprise cutover.",
                Arrays.asList(
                        promptArg("source", "Source index and optional connection (connection:index).", true),
                        promptArg("target", "Target index and optional connection (connection:index).", true),
                        promptArg("notes", "Mapping changes, downtime budget or validation rules.", false))));
        out.add(prompt("review_cluster_capacity", "Review cluster capacity",
                "Rank capacity, shard and thread-pool risks with concrete next actions.",
                Arrays.asList(
                        promptArg("connection", "Connection id to review.", true),
                        promptArg("window", "Observation window or traffic context.", false))));
        out.add(prompt("triage_failed_search", "Triage a failed search",
                "Diagnose failures and partial shard results with allocation and shard evidence.",
                Arrays.asList(
                        promptArg("connection", "Connection id to investigate.", true),
                        promptArg("index", "Index or alias that failed.", false),
                        promptArg("symptom", "Error message, status code or observed behavior.", true))));
        out.add(prompt("cross_cloud_structure_sync", "Cross-cloud structure sync",
                "Cross-cloud index structure sync workflow: probe both clusters, compare capabilities, plan with dry-run, validate, execute, then verify with structure diff and data equivalence.",
                Arrays.asList(
                        promptArg("srcConnId", "Source connection profile id.", true),
                        promptArg("destConnId", "Target connection id; use host for the control cluster.", true),
                        promptArg("sourceIndex", "Source index name.", false),
                        promptArg("destIndex", "Target index name; defaults to sourceIndex.", false))));
        out.add(prompt("deploy_and_connect", "Deploy and connect",
                "One-shot AI onboarding: deploy ESQueryStudio (server jar, host embed, Chrome extension, Windows exe or local Node) and connect an MCP client with verified permissions.",
                Arrays.asList(
                        promptArg("mode", "Deployment mode: server | host | browser | local-exe | local-node; defaults to server.", false),
                        promptArg("client", "Target MCP client id, e.g. claude-code, cursor, qoder, workbuddy; defaults to generic.", false),
                        promptArg("endpoint", "Console base URL for server/host modes; defaults to http://localhost:5601.", false),
                        promptArg("os", "Target OS: windows | macos | linux; defaults to auto.", false))));
        return out;
    }

    private Map<String, Object> prompt(String name, String title, String description,
                                       List<Map<String, Object>> arguments) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", name);
        item.put("title", title);
        item.put("description", description);
        item.put("arguments", arguments);
        return item;
    }

    private Map<String, Object> promptArg(String name, String description, boolean required) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", name);
        item.put("description", description);
        item.put("required", required);
        return item;
    }

    /**
     * completion/complete：为 prompts / resources 的 connection 参数提供连接 id 补全。
     * 只暴露当前 key 可见的连接，不读 ES，不消耗配额。xmigrate 形态的别名参数
     * （srcConnId/destConnId/sourceIndex/destIndex/jobId）复用同名数据源：连接/索引
     * 补全沿用既有白名单门；jobId 补全只在 key 允许 es_xmigrate:status 时回填
     * （迁移作业 id 清单，限前 20 个）。
     */
    private Map<String, Object> complete(Object paramsValue, AuthContext auth) throws IOException {
        if (!(paramsValue instanceof Map)) throw new IllegalArgumentException("params must be an object");
        Object argumentValue = ((Map<?, ?>) paramsValue).get("argument");
        Map<?, ?> argument = argumentValue instanceof Map ? (Map<?, ?>) argumentValue : Collections.emptyMap();
        String name = argument.get("name") == null ? "" : String.valueOf(argument.get("name")).trim();
        String prefix = argument.get("value") == null ? "" : String.valueOf(argument.get("value")).trim().toLowerCase(java.util.Locale.ROOT);
        List<String> values = new ArrayList<>();
        if ("connection".equals(name) || "srcConnId".equals(name) || "destConnId".equals(name)) {
            try {
                for (Map<String, Object> conn : listConnections(auth)) {
                    String id = String.valueOf(conn.get("id"));
                    if (prefix.isEmpty() || id.toLowerCase(java.util.Locale.ROOT).startsWith(prefix)) values.add(id);
                }
            } catch (RuntimeException e) {
                /* 控制集群未绑定或连接目录不可用时返回空补全，不把异常变成协议错误。 */
            }
        } else if ("index".equals(name) || "source".equals(name) || "target".equals(name)
                || "sourceIndex".equals(name) || "destIndex".equals(name)) {
            /* 只有 key 本身允许 es_list_indices 时才回填索引名，避免用补全绕过工具白名单。 */
            if (auth.key == null || auth.allowedTools.contains(TOOL_ACTIONS.get("es_list_indices"))) {
                try {
                    Object data = invokeReadTool("es_list_indices", new LinkedHashMap<String, Object>(), auth);
                    List<?> rows = null;
                    if (data instanceof List) rows = (List<?>) data;
                    else if (data instanceof Map && ((Map<?, ?>) data).get("result") instanceof List) {
                        rows = (List<?>) ((Map<?, ?>) data).get("result");
                    }
                    if (rows != null) {
                        for (Object row : rows) {
                            if (!(row instanceof Map)) continue;
                            Object index = ((Map<?, ?>) row).get("index");
                            if (index == null) continue;
                            String value = String.valueOf(index);
                            if (prefix.isEmpty() || value.toLowerCase(java.util.Locale.ROOT).startsWith(prefix)) values.add(value);
                        }
                    }
                } catch (RuntimeException e) {
                    /* 列表失败或连接不可达时返回空补全。 */
                }
            }
        } else if ("jobId".equals(name)) {
            /* 迁移作业 id 清单：与 status 工具同一可见口径（key 须允许 es_xmigrate:status），
               限前 20 个；服务缺位/读取失败返回空补全。 */
            if (auth.key == null || auth.allowedTools.contains("es_xmigrate:status")) {
                try {
                    if (crossClusterMigrateService != null) {
                        for (MigrateJobES job : crossClusterMigrateService.jobs(20)) {
                            String jobId = job.getJobId() == null ? "" : job.getJobId().trim();
                            if (jobId.isEmpty()) continue;
                            if (prefix.isEmpty() || jobId.toLowerCase(java.util.Locale.ROOT).startsWith(prefix)) {
                                values.add(jobId);
                            }
                        }
                    }
                } catch (RuntimeException e) {
                    /* 作业台账不可用时返回空补全。 */
                }
            }
        }
        int total = values.size();
        if (values.size() > 50) values = new ArrayList<>(values.subList(0, 50));
        Map<String, Object> completion = new LinkedHashMap<>();
        completion.put("values", values);
        completion.put("total", total);
        completion.put("hasMore", total > values.size());
        return Collections.<String, Object>singletonMap("completion", completion);
    }

    private Map<String, Object> getPrompt(Object paramsValue) {
        if (!(paramsValue instanceof Map)) throw new IllegalArgumentException("params must be an object");
        Map<?, ?> params = (Map<?, ?>) paramsValue;
        String name = params.get("name") == null ? "" : String.valueOf(params.get("name")).trim();
        Map<?, ?> args = params.get("arguments") instanceof Map
                ? (Map<?, ?>) params.get("arguments") : Collections.emptyMap();
        String description;
        String text;
        if ("diagnose_slow_query".equals(name)) {
            String connection = promptArgValue(args, "connection", true);
            String index = promptArgValue(args, "index", false);
            String query = promptArgValue(args, "query", false);
            description = "Diagnose a slow query with profile and shard evidence.";
            text = "Act as an Elasticsearch performance engineer. Diagnose latency on connection `" + connection + "`"
                    + (index.isEmpty() ? "" : " against index `" + index + "`") + ".\n\n"
                    + "1. Call `es_get_mapping` and `es_field_caps` to confirm field types, analyzers and sortability.\n"
                    + "2. Call `es_search` with `profile=true` (or `es_explain_doc`) and inspect the profile tree.\n"
                    + "3. Call `es_search_shards` and `es_nodes_stats` to separate query cost from shard/thread-pool pressure.\n"
                    + "4. If a rewrite looks promising, compare it with `es_rank_eval` and validate it with `es_validate_query`.\n"
                    + "5. Report root cause, the smallest safe change, expected gain, verification query and rollback.\n\n"
                    + "Query or symptoms: " + (query.isEmpty() ? "(not provided; ask for the slow query or inspect logs)" : query);
        } else if ("design_index_mapping".equals(name)) {
            String index = promptArgValue(args, "index", true);
            String sample = promptArgValue(args, "sample", false);
            String access = promptArgValue(args, "access", false);
            description = "Design a mapping and settings proposal with validation steps.";
            text = "Act as an Elasticsearch index-modeling expert. Design the mapping for `" + index + "`.\n\n"
                    + "Start from the sample documents/fields and access patterns below. Cover: field types, doc_values, "
                    + "analyzer choice, multi-fields, runtime fields, dynamic mapping policy, shard/replica sizing and retention.\n"
                    + "Use `es_index_settings_defaults` and `es_get_settings` to ground settings in the live cluster, "
                    + "then propose a concrete create-index body and validate representative queries with `es_validate_query`.\n\n"
                    + "Sample documents or fields: " + (sample.isEmpty() ? "(not provided; ask for one)" : sample) + "\n"
                    + "Access patterns: " + (access.isEmpty() ? "(not provided; ask for filters, sorts, aggregations and retention)" : access);
        } else if ("migrate_index".equals(name)) {
            String source = promptArgValue(args, "source", true);
            String target = promptArgValue(args, "target", true);
            String notes = promptArgValue(args, "notes", false);
            description = "Plan a reindex or cross-cluster migration with verified cutover.";
            text = "Plan and verify a migration from `" + source + "` to `" + target + "`.\n\n"
                    + "1. Compare mappings with `es_get_mapping` and run `es_reindex_preview` for incompatible fields.\n"
                    + "2. Check target settings (`es_get_settings`, `es_index_settings_defaults`) and disk/alias state.\n"
                    + "3. 结构兼容：跨集群（尤其跨厂商，如生产阿里云 ES → UAT 腾讯云 ES）先用 es_xmigrate 的 probe_capabilities 探测源/目标厂商、版本与插件；再用 sync_structure 且 dryRun=true 预览兼容剔除计划——planned 为兼容矩阵预剔除（如阿里云 apack 私有设置、目标缺失插件的分析组件、节点属性路由），reactive 为建索引报错兜底剔除，advice 为分片数/副本/ILM 建议；确认计划后以 dryRun=false 执行（需 MRTR 二次确认），执行时携带 dryRun 预览返回的 planDigest（expectPlanDigest）防源结构漂移，需别名随迁时加 syncAliases=true。\n"
                    + "4. Execute with `es_reindex` for same-cluster moves, or cross-cluster via `es_xmigrate` (`action=preflight`, then `start`, then poll `status`); same-cluster reindex progress comes from `es_task_detail`.\n"
                    + "5. Verify equivalence with `es_xmigrate` `action=verify_equivalence` (jobId form after a migration job, or srcConnId+sourceIndex+destConnId+destIndex form): it compares document counts, hashes a sorted-_doc id sample and an optional terms aggregation (aggField), and returns verdict EQUIVALENT/DIVERGENT/INCONCLUSIVE; switch aliases with `es_alias` only after EQUIVALENT.\n"
                    + "6. State the cutover order, validation gates and rollback. Do not delete the source until verification passes.\n\n"
                    + "Extra constraints: " + (notes.isEmpty() ? "(none provided)" : notes);
        } else if ("review_cluster_capacity".equals(name)) {
            String connection = promptArgValue(args, "connection", true);
            String window = promptArgValue(args, "window", false);
            description = "Rank cluster capacity, shard and thread-pool risks.";
            text = "Review capacity for connection `" + connection + "`" + (window.isEmpty() ? "" : " (" + window + ")") + ".\n\n"
                    + "Collect `es_cluster_health`, `es_cluster_stats`, `es_cat_allocation`, `es_nodes_stats`, "
                    + "`es_allocation_explain`, `es_shard_stores`, `es_hot_threads` and `es_pending_tasks`.\n"
                    + "Rank risks by user impact: unassigned shards, disk watermark, JVM/heap pressure, hot threads, "
                    + "shard imbalance and oversized indices. For each risk give evidence, the smallest safe action, "
                    + "the expected effect and how to verify it afterwards.";
        } else if ("triage_failed_search".equals(name)) {
            String connection = promptArgValue(args, "connection", true);
            String index = promptArgValue(args, "index", false);
            String symptom = promptArgValue(args, "symptom", true);
            description = "Triage failed searches with allocation and shard evidence.";
            text = "Triage a failed search on connection `" + connection + "`"
                    + (index.isEmpty() ? "" : " for index `" + index + "`") + ".\n\n"
                    + "Symptom: " + symptom + "\n\n"
                    + "1. Reproduce with `es_search` or `es_count`, capturing partial shard failures.\n"
                    + "2. Call `es_cluster_health`, `es_cat_allocation`, `es_shard_stores` and `es_allocation_explain` "
                    + "to distinguish missing shards, mapping conflicts, circuit breakers and node loss.\n"
                    + "3. Check `es_pending_tasks` and `es_hot_threads` before assuming data loss.\n"
                    + "4. Return the root cause, the exact recovery action, verification and a prevention check.";
        } else if ("cross_cloud_structure_sync".equals(name)) {
            String srcConnId = promptArgValue(args, "srcConnId", true);
            String destConnId = promptArgValue(args, "destConnId", true);
            String sourceIndex = promptArgValue(args, "sourceIndex", false);
            String destIndex = promptArgValue(args, "destIndex", false);
            description = "Cross-cloud index structure sync: one-shot smart_sync (read-only plan preview, then apply with "
                    + "planDigest), or step-by-step probe, compare, sync_structure, diff and equivalence verification.";
            text = "Cross-cloud index structure sync from `" + srcConnId + "` to `" + destConnId + "`"
                    + (sourceIndex.isEmpty() ? "" : " for index `" + sourceIndex
                    + (destIndex.isEmpty() ? "" : "` → `" + destIndex) + "`") + ".\n\n"
                    + "首选一步式 smart_sync：一句话描述意图——把生产索引结构自动同步到 UAT，自动剔除非兼容属性。"
                    + "smart_sync {srcConnId, sourceIndex, destConnId, destIndex?, syncAliases?, downgradedAnalyzerFallback?, autoTune?, mode?, apply} "
                    + "一次完成双侧探测、能力对比、计划生成与执行：apply=false（缺省）只读预览同步计划，"
                    + "返回 verdict PLANNED 与 planDigest（免写权限、免二次确认），计划剔除/降级条目带规则 id 溯源"
                    + "（version-floor 目标版本地板 / store-type-vendor 厂商特有存储类型 / plugin-analysis 缺插件分析组件）；"
                    + "确认计划后 apply=true 并携带 expectPlanDigest 执行（需写权限与二次确认，apply 前后计划摘要守恒，"
                    + "源结构漂移时返回 PLAN_DRIFT 拒绝执行）；autoTune=true 时按目标硬件规格自动整形"
                    + "（如分片数超目标数据节点数时收敛）。目标索引已存在时改用 mode=incremental：生产新增字段后让 "
                    + "UAT 跟随同步——计划五清单如实呈报（addedFields 新增字段 / skippedConflicts 冲突字段跳过 / "
                    + "updatedSettings 动态 settings 差异 / staticBlocked 静态设置差异只建议不动 / addedAliases 补加别名），"
                    + "apply=true 时经漂移门后按序执行 PUT _mapping 合并补字段 → PUT _settings 更新动态白名单键 → 补别名，"
                    + "每步结果进 executed；目标索引不存在返回 DEST_NOT_FOUND。预览时可携 savePlan=true 保存同步计划（响应回显 planId）；"
                    + "跨会话用 plan_list 查看已存计划，plan_apply {planId} 直接按计划执行——漂移门自动采用保存时的计划摘要，"
                    + "源结构已变化即 409 PLAN_DRIFT 拒绝，重新 smart_sync 预览即可。\n\n"
                    + "进阶（需要逐步控制或诊断细节时分步执行）：\n"
                    + "1. probe_capabilities on source (srcConnId) and target (destConnId) to capture version/vendor/plugins.\n"
                    + "2. compare_capabilities {srcConnId, destConnId} for the risk matrix (vendor change, missing plugins, version gap).\n"
                    + "3. sync_structure {dryRun:true} to preview removals/downgrades and the adapted create body with planDigest.\n"
                    + "4. Optionally es_indices:config_validate on the planned body.\n"
                    + "5. sync_structure {dryRun:false, expectPlanDigest} to execute (requires write permission and confirmation).\n"
                    + "6. migrate_index with destCreateMode NONE when structure is already synced; monitor with jobs/status; reconcile counts.\n"
                    + "7. diff_structure to verify the target matches the plan (expectedRemovals vs unexpected)；autoTune 收敛过或"
                    + "上次计划剔除过的键可回传 autoTunedShards/removedKeys（上次同步报告值），计划内变更豁免不误报 unexpected。\n"
                    + "8. verify_equivalence {srcConnId, sourceIndex, destConnId, destIndex, sampleSize, aggField?} for the final data check "
                    + "(counts + sample hash + optional aggregation, verdict must be EQUIVALENT)；纯结构同步场景用 structureOnly=true "
                    + "只比双侧结构摘要，是纯结构同步的终局验证。";
        } else if ("deploy_and_connect".equals(name)) {
            String mode = promptArgValue(args, "mode", false);
            if (mode.isEmpty()) mode = "server";
            String client = promptArgValue(args, "client", false);
            if (client.isEmpty()) client = "generic";
            String endpoint = promptArgValue(args, "endpoint", false);
            if (endpoint.isEmpty()) endpoint = "http://localhost:5601";
            String os = promptArgValue(args, "os", false);
            if (os.isEmpty()) os = "auto";
            String serverStep = "下载 `esquerystudio-server-<ver>.jar` → `java -jar esquerystudio-server-<ver>.jar`（默认端口 5601）→ 打开 `" + endpoint + "/esquerystudio.html`。";
            String modeLabel;
            String step;
            if ("host".equals(mode)) {
                modeLabel = "嵌入现有 Spring Boot 宿主（console / platform starter）";
                step = "宿主二选一：完整控制台（Boot 2.7）引入 `esquerystudio-console` + `esquerystudio-platform`，或任意 Boot 2.3–4.2 宿主引入 `esquerystudio-boot-support`（查询工作台 + 17 组 MCP，服务 token）→ 放行 `/esquerystudio.html` 与 `" + mcpEndpointPath() + "` → 重启宿主；QuoteHub 的 context-path 为 `/quotehub`，MCP 端点是 `" + endpoint + "/quotehub" + mcpEndpointPath() + "`。";
            } else if ("browser".equals(mode)) {
                modeLabel = "Chrome MV3 扩展（纯前端直连 ES）";
                step = "下载 `esquerystudio-chrome-<ver>.zip` → 解压 → 打开 `chrome://extensions` 并启用开发者模式 → 「加载已解压的扩展程序」→ 打开控制台并添加本机 ES 连接。";
            } else if ("local-exe".equals(mode)) {
                modeLabel = "Windows 单文件 stdio MCP（esquerystudio-mcp.exe）";
                step = "下载 `esquerystudio-mcp.exe` → 准备本机 `mcp.json` 连接档案 → 客户端 `command` 指向该 exe；写工具需加 `--allow-write`。";
            } else if ("local-node".equals(mode)) {
                modeLabel = "本地 Node stdio MCP（mcp/ 目录）";
                step = "取得仓库 `mcp/` 目录 → `cd mcp && npm install -g .` → `esquerystudio-mcp --config <path>`；写工具需加 `--allow-write`。";
            } else if ("server".equals(mode)) {
                modeLabel = "Spring Boot 独立服务端（java -jar）";
                step = serverStep;
            } else {
                modeLabel = mode + "（未知形态，按仓库文档核对）";
                step = serverStep;
            }
            boolean remote = "server".equals(mode) || "host".equals(mode);
            String endpointLine = remote
                    ? "MCP 端点 `" + endpoint + mcpEndpointPath() + "`（宿主有 context-path 时按宿主前缀，如 QuoteHub 为 `" + endpoint + "/quotehub" + mcpEndpointPath() + "`）；控制台 `" + endpoint + "/esquerystudio.html`"
                    : "browser".equals(mode)
                        ? "本形态没有可被外部进程连接的 HTTP 端点；页面内 Agent 使用 `window.ESQueryStudioMCP`。"
                        : "本形态走 stdio，不需要 HTTP 端点；连接凭据留在本机。";
            String mcpEndpoint = remote ? endpoint + mcpEndpointPath() : "(stdio，无 HTTP 端点)";
            String consoleCheck = remote
                    ? "`GET " + endpoint + "/esquerystudio.html` 返回 200；登录后「MCP 接入」页的协议自检通过。"
                    : "browser".equals(mode)
                        ? "扩展页打开后「MCP 接入」页的协议自检通过（页面内桥）。"
                        : "`esquerystudio-mcp --version` 输出版本；客户端 `tools/list` 能看到 17 组 action 工具。";
            description = "One-shot AI onboarding: deploy ESQueryStudio (server jar, host embed, Chrome extension, Windows exe or local Node) and connect an MCP client with verified permissions.";
            text = "你是 ESQueryStudio 的部署与接入助手。目标：在 " + os + " 上以「" + modeLabel + "」方式完成搭建，并把「" + client + "」接入为 MCP 客户端。只做必要动作；每一步都验证并回报证据，失败时给出原始错误与下一步，禁止伪成功。\n\n"
                    + "【产品事实】\n"
                    + "- 仓库与唯一滚动 Release：https://github.com/dengmeiluan/esquerystudio （`releases/latest`；资产名含版本号，先列资产再下载，不要猜文件名）。\n"
                    + "- 工具面：17 个 action 组 / 171 个 action、14 个只读资源 + 1 个 MCP App、7 个引导提示词；精简面保留 17 组工具但 0 资源 / 0 提示词。\n"
                    + "- 长调用：单次工具调用硬预算 180 秒，到点返回 `cancelled/DEADLINE`；reindex / update-by-query / delete-by-query / restore 等长任务用异步端点或 `tasks/get` 续传，不要阻塞等待；`tasks/cancel` 与 `notifications/cancelled` 会真中断（断连接 / 撤 ES 任务）。\n"
                    + "- 凭据：MCP key 只在控制台「MCP 接入 → 密钥」或管理 API 签发；key 不写入仓库、日志、截图或终端历史。\n\n"
                    + "【本次选择】\n"
                    + "- 形态：" + modeLabel + "\n"
                    + "- 客户端：" + client + "\n"
                    + "- 端点 / 上下文：" + endpointLine + "\n"
                    + "- 操作系统：" + os + "\n\n"
                    + "【执行步骤】\n"
                    + "0. 预检：确认 OS / 架构、JDK（server 需 8+）/ Node（local-node 需 18+）/ Chrome（browser 需 MV3）、端口占用与 GitHub 可达；记录实际值。\n"
                    + "1. 取资产：`GET https://api.github.com/repos/dengmeiluan/esquerystudio/releases/latest`，按名称选择资产并核对 `SHA256SUMS`（或 API digest）。\n"
                    + "2. 安装并启动：" + step + "\n"
                    + "3. 打开控制台并确认可登录：" + consoleCheck + "\n"
                    + "4. 签发 MCP key：ADMIN 登录 → MCP 接入 → 密钥 → 签发；按用途选择只读 / QA-UAT 可写 / 批量写，逐连接设置 read/write，记录过期与配额。管理 API 形态：`POST {context-path}/internal/es/index/mcp/keys`。\n"
                    + "5. 配置客户端（优先 CLI，失败再手写）：\n"
                    + "   `node mcp/esquerystudio-mcp-cli.mjs install --client " + client + " --url " + mcpEndpoint + " --token <key> --write`\n"
                    + "   本地 stdio：`node mcp/esquerystudio-mcp-cli.mjs install --client " + client + " --local --write`\n"
                    + "   Windows 单文件：把 `esquerystudio-mcp.exe` 的绝对路径写进客户端 `command`（对标 `dbx-mcp.exe`）。\n"
                    + "6. 验证：`esquerystudio-mcp-cli probe --url " + mcpEndpoint + " --token <key> --json`；再真实往返 `server/discover`、`tools/list`、`resources/list`、`prompts/list`，确认 17 组 / 171 action / 14 资源 + 1 App / 7 提示词（精简面 0 资源 / 0 提示词），并做一次只读工具调用。\n"
                    + "7. 回报：版本、端点、客户端配置文件路径、验证输出、实际权限边界、回滚方式。\n\n"
                    + "【其他形态速查】\n"
                    + "- server：下载 `esquerystudio-server-<ver>.jar` → `java -jar` → `http://localhost:5601/esquerystudio.html`。\n"
                    + "- host：完整控制台（Boot 2.7）引入 `esquerystudio-console` / `esquerystudio-platform`；任意 Boot 2.3–4.2 宿主引入 `esquerystudio-boot-support`（含 17 组 `/esmcp`，服务 token）。放行 `/esquerystudio.html` 与 `" + mcpEndpointPath() + "`；QuoteHub 的 MCP 端点是 `<host>/quotehub" + mcpEndpointPath() + "`。\n"
                    + "- browser：解压扩展 → `chrome://extensions` 加载已解压的扩展程序 → 页面内使用 `window.ESQueryStudioMCP`。\n"
                    + "- local-exe：Windows 下载 `esquerystudio-mcp.exe`；签名状态见同目录 `esquerystudio-mcp.json` 的 `signature`（未签名时首次可能触发 SmartScreen；只从官方 Release 下载并核对摘要）。\n"
                    + "- local-node：`cd mcp && npm install -g .`（或直接 `node esquerystudio-mcp.mjs`），写工具需 `--allow-write`。\n\n"
                    + "【安全与边界】\n"
                    + "- 生产默认只读；写操作需显式授权与 MRTR 二次确认。跨云结构同步先 `smart_sync` `apply=false` 预览，确认 `planDigest` 后再 `apply=true`。\n"
                    + "- 不把 key 打印到终端历史；使用环境变量或客户端密钥存储。\n"
                    + "- 浏览器模式没有外部 HTTP 端点；本地模式连接凭据留在本机。";
        } else {
            throw new IllegalArgumentException("Unknown prompt: " + name);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "text");
        content.put("text", text);
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("role", "user");
        message.put("content", content);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("description", description);
        out.put("messages", Collections.singletonList(message));
        return out;
    }

    private String promptArgValue(Map<?, ?> args, String key, boolean required) {
        Object raw = args.get(key);
        String value = raw == null ? "" : String.valueOf(raw).trim();
        if (required && value.isEmpty()) throw new IllegalArgumentException("Missing required argument: " + key);
        return value;
    }

    private String encodeSegment(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String decodeSegment(String value) {
        try {
            return java.net.URLDecoder.decode(value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, Object> callTool(Object paramsValue, AuthContext auth) throws IOException {
        if (!(paramsValue instanceof Map)) throw new IllegalArgumentException("params must be an object");
        Map<?, ?> params = (Map<?, ?>) paramsValue;
        String name = String.valueOf(params.get("name") == null ? "" : params.get("name"));
        Object argsValue = params.get("arguments");
        Map<?, ?> args = argsValue instanceof Map ? (Map<?, ?>) argsValue : Collections.emptyMap();
        Object data;
        switch (name) {
            case "es_list_connections":
                data = listConnections(auth);
                break;
            case "es_list_indices":
                data = esIndexAdmin.listClusterIndices();
                break;
            case "es_cluster_health":
                data = esIndexAdmin.clusterHealth();
                break;
            case "es_get_mapping":
                data = esIndexAdmin.getMappingDetail(requiredString(args, "index"));
                break;
            case "es_get_doc":
                data = esIndexAdmin.getDoc(requiredString(args, "index"), requiredString(args, "id"));
                break;
            case "es_get_settings":
                data = esIndexAdmin.rawGuarded("GET", "/" + encodeIndex(args) + "/_settings", "");
                break;
            case "es_get_aliases":
                data = esIndexAdmin.rawGuarded("GET", "/_cat/aliases?format=json", "");
                break;
            case "es_list_templates":
                data = esIndexAdmin.listTemplates();
                break;
            case "es_list_nodes":
                if (isAdmin(auth)) {
                    /* ADMIN key 与浏览器/本地 Node 形态同形：原始 _cat/nodes 行。 */
                    data = esIndexAdmin.raw("GET", "/_cat/nodes?format=json", "");
                } else {
                    /* 非 ADMIN 不给 host/节点拓扑，只给指标行（与拓扑页脱敏同口径）。 */
                    java.util.List<Map<String, Object>> nodes = esIndexAdmin.nodesStatsBrief();
                    for (Map<String, Object> node : nodes) node.remove("host");
                    data = nodes;
                }
                break;
            case "es_list_tasks":
                data = esIndexAdmin.listTasks(optionalString(args, "actions"), true);
                break;
            case "es_index_recovery":
                data = rawOrGuarded(isAdmin(auth), "GET", "/" + encodeIndex(args) + "/_recovery", "");
                break;
            case "es_cat_shards": {
                String shardIndex = optionalString(args, "index");
                data = rawOrGuarded(isAdmin(auth), "GET", "/_cat/shards"
                        + (shardIndex == null ? "" : "/" + encodeValue(shardIndex)) + "?format=json", "");
                break;
            }
            case "es_cluster_state": {
                String metrics = optionalString(args, "metrics");
                if (metrics == null || metrics.isEmpty()) metrics = "metadata";
                String stateIndex = optionalString(args, "index");
                data = rawOrGuarded(isAdmin(auth), "GET", "/_cluster/state/" + encodeValue(metrics)
                        + (stateIndex == null ? "" : "/" + encodeValue(stateIndex)), "");
                break;
            }
            case "es_mtermvectors": {
                String termIndex = optionalString(args, "index");
                data = rawOrGuarded(isAdmin(auth), "POST",
                        (termIndex == null ? "" : "/" + encodeValue(termIndex)) + "/_mtermvectors",
                        jsonObject(args.get("body"), "body"));
                break;
            }
            case "es_index_segments":
                data = rawOrGuarded(isAdmin(auth), "GET", "/" + encodeIndex(args) + "/_segments", "");
                break;
            case "es_list_transforms":
                data = rawOrGuarded(isAdmin(auth), "GET", "/_transform", "");
                break;
            case "es_get_transform":
                data = rawOrGuarded(isAdmin(auth), "GET", "/_transform/" + encodeName(args, "id"), "");
                break;
            case "es_transform_stats":
                data = rawOrGuarded(isAdmin(auth), "GET", "/_transform/" + encodeName(args, "id") + "/_stats", "");
                break;
            case "es_put_transform":
                data = rawOrGuarded(isAdmin(auth), "PUT", "/_transform/" + encodeName(args, "id"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_start_transform":
                data = rawOrGuarded(isAdmin(auth), "POST", "/_transform/" + encodeName(args, "id") + "/_start", "");
                break;
            case "es_stop_transform":
                data = rawOrGuarded(isAdmin(auth), "POST", "/_transform/" + encodeName(args, "id") + "/_stop", "");
                break;
            case "es_delete_transform":
                data = rawOrGuarded(isAdmin(auth), "DELETE", "/_transform/" + encodeName(args, "id"), "");
                break;
            case "es_get_index_stats":
                if (isAdmin(auth)) {
                    data = esIndexAdmin.raw("GET", "/" + encodeIndex(args) + "/_stats", "");
                } else {
                    data = esIndexAdmin.indexStatsSummary(requiredString(args, "index"));
                }
                break;
            case "es_search":
                data = esIndexAdmin.searchDsl(
                        requiredString(args, "index"),
                        searchBody(args),
                        Boolean.TRUE.equals(args.get("explain")),
                        Boolean.TRUE.equals(args.get("profile")));
                break;
            case "es_count":
                data = esIndexAdmin.count(requiredString(args, "index"), countBody(args));
                break;
            case "es_sql":
                /* Cancellable abort 是取消/止损主通道：ES SQL 无 timeout query 参数（7.10 会 400），
                   MCP 3 分钟预算到点也走同一 abort。 */
                data = esIndexAdmin.sqlQuery(sqlBody(args), null, httpCancelSink());
                break;
            case "es_explain_doc":
                data = esIndexAdmin.explainDoc(
                        requiredString(args, "index"),
                        requiredString(args, "id"),
                        explainBody(args));
                break;
            case "es_msearch":
                data = esIndexAdmin.rawGuarded("POST", "/_msearch", msearchBody(args));
                break;
            case "es_mget": {
                Object rawIds = args.get("ids");
                if (!(rawIds instanceof List) || ((List<?>) rawIds).isEmpty()) {
                    throw new IllegalArgumentException("ids must be a non-empty array");
                }
                List<String> ids = new ArrayList<>();
                for (Object id : (List<?>) rawIds) ids.add(String.valueOf(id));
                Map<String, Object> body = Collections.singletonMap("ids", ids);
                data = esIndexAdmin.rawGuarded("POST", "/" + encodeIndex(args) + "/_mget",
                        objectMapper.writeValueAsString(body));
                break;
            }
            case "es_scroll_start": {
                String scroll = optionalString(args, "scroll");
                if (scroll == null || scroll.isEmpty()) scroll = "1m";
                data = esIndexAdmin.rawGuarded("POST",
                        "/" + encodeIndex(args) + "/_search?scroll=" + java.net.URLEncoder.encode(scroll, "UTF-8"),
                        searchBody(args));
                break;
            }
            case "es_scroll_next": {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("scroll", optionalString(args, "scroll") == null ? "1m" : optionalString(args, "scroll"));
                body.put("scroll_id", requiredString(args, "scrollId"));
                data = esIndexAdmin.rawGuarded("POST", "/_search/scroll",
                        objectMapper.writeValueAsString(body));
                break;
            }
            case "es_scroll_clear": {
                Object rawIds = args.get("scrollIds");
                List<String> ids = new ArrayList<>();
                if (rawIds instanceof List) {
                    for (Object id : (List<?>) rawIds) ids.add(String.valueOf(id));
                } else {
                    String id = optionalString(args, "scrollId");
                    if (id != null && !id.isEmpty()) ids.add(id);
                }
                if (ids.isEmpty()) throw new IllegalArgumentException("scrollId or scrollIds is required");
                data = esIndexAdmin.rawGuarded("DELETE", "/_search/scroll",
                        objectMapper.writeValueAsString(Collections.singletonMap("scroll_id", ids)));
                break;
            }
            case "es_resolve_index":
                data = esIndexAdmin.rawGuarded("GET", "/_resolve/index/"
                        + java.net.URLEncoder.encode(requiredString(args, "name"), "UTF-8"), "");
                break;
            case "es_search_shards": {
                String routing = optionalString(args, "routing");
                String qs = routing == null || routing.isEmpty() ? ""
                        : "?routing=" + java.net.URLEncoder.encode(routing, "UTF-8");
                data = esIndexAdmin.rawGuarded("GET", "/" + encodeIndex(args) + "/_search_shards" + qs, "");
                break;
            }
            case "es_rank_eval":
                data = esIndexAdmin.rawGuarded("POST", "/" + encodeIndex(args) + "/_rank_eval",
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_cluster_stats":
                data = esIndexAdmin.rawGuarded("GET", "/_cluster/stats", "");
                break;
            case "es_refresh_index":
                data = esIndexAdmin.rawGuarded("POST", "/" + encodeIndex(args) + "/_refresh", "");
                break;
            case "es_flush_index":
                data = esIndexAdmin.rawGuarded("POST", "/" + encodeIndex(args) + "/_flush", "");
                break;
            case "es_index_close":
                data = esIndexAdmin.rawGuarded("POST", "/" + encodeIndex(args) + "/_close", "");
                break;
            case "es_index_open":
                data = esIndexAdmin.rawGuarded("POST", "/" + encodeIndex(args) + "/_open", "");
                break;
            case "es_bulk":
                data = esIndexAdmin.bulk(optionalString(args, "index"), bulkNdjson(args), bulkOpts(args));
                break;
            case "es_terms_enum": {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("field", requiredString(args, "field"));
                Object query = queryClause(args.get("query"));
                if (query != null) body.put("query", query);
                Object size = args.get("size");
                if (size instanceof Number) body.put("size", Math.max(1, Math.min(1000, ((Number) size).intValue())));
                if (Boolean.TRUE.equals(args.get("caseInsensitive"))) body.put("case_insensitive", true);
                data = esIndexAdmin.rawGuarded("POST", "/" + encodeIndex(args) + "/_terms_enum",
                        objectMapper.writeValueAsString(body));
                break;
            }
            case "es_field_caps": {
                String fields = optionalString(args, "fields");
                if (fields == null || fields.isEmpty()) fields = "*";
                data = esIndexAdmin.rawGuarded("GET", "/" + encodeIndex(args)
                        + "/_field_caps?fields=" + java.net.URLEncoder.encode(fields, "UTF-8"), "");
                break;
            }
            case "es_task_cancel":
                data = esIndexAdmin.cancelTask(requiredString(args, "taskId"));
                break;
            case "es_sql_cursor":
                data = esIndexAdmin.sqlCursor(requiredString(args, "cursor"),
                        optionalString(args, "timeZone"),
                        args.get("columnar") == null ? null : Boolean.valueOf(String.valueOf(args.get("columnar"))));
                break;
            case "es_sql_close":
                data = esIndexAdmin.sqlClose(requiredString(args, "cursor"));
                break;
            case "es_sql_translate":
                data = esIndexAdmin.sqlTranslate(jsonObject(args.get("body"), "body"));
                break;
            case "es_pit_open":
                data = esIndexAdmin.pitOpenClamped(requiredString(args, "index"), optionalString(args, "keepAlive"));
                break;
            case "es_pit_search":
                data = esIndexAdmin.pitSearchClamped(bodyText(args.get("body")));
                break;
            case "es_pit_close":
                data = esIndexAdmin.pitClose(requiredString(args, "pitId"));
                break;
            case "es_create_index": {
                String index = requiredString(args, "index");
                boolean created = esIndexAdmin.createIndexChecked(index,
                        optionalJson(args.get("settings"), "settings"),
                        optionalJson(args.get("mappings"), "mappings"));
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("acknowledged", created);
                result.put("index", index);
                data = result;
                break;
            }
            case "es_delete_index": {
                String index = requiredString(args, "index");
                boolean deleted = esIndexAdmin.deleteIndexChecked(index);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("acknowledged", deleted);
                result.put("index", index);
                data = result;
                break;
            }
            case "es_put_mapping":
                data = esIndexAdmin.putMapping(requiredString(args, "index"),
                        jsonObject(args.get("mappings"), "mappings"));
                break;
            case "es_update_settings":
                data = esIndexAdmin.updateSettingsDynamic(requiredString(args, "index"),
                        objectArg(args.get("settings"), "settings"));
                break;
            case "es_alias": {
                Object rawActions = args.get("actions");
                if (!(rawActions instanceof List) || ((List<?>) rawActions).isEmpty()) {
                    throw new IllegalArgumentException("actions must be a non-empty array");
                }
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("actions", rawActions);
                data = esIndexAdmin.aliasActions(objectMapper.writeValueAsString(body));
                break;
            }
            case "es_rollover": {
                String alias = requiredString(args, "alias");
                Object conditions = args.get("conditions");
                String body = conditions == null ? null
                        : objectMapper.writeValueAsString(Collections.singletonMap("conditions",
                        conditions instanceof String
                                ? objectMapper.readValue((String) conditions, Object.class) : conditions));
                data = esIndexAdmin.rolloverAlias(alias, body,
                        Boolean.TRUE.equals(args.get("dryRun")));
                break;
            }
            case "es_force_merge": {
                int segments = args.get("maxNumSegments") instanceof Number
                        ? Math.max(1, Math.min(1000, ((Number) args.get("maxNumSegments")).intValue())) : 1;
                data = esIndexAdmin.forceMerge(requiredString(args, "index"), segments, httpCancelSink());
                break;
            }
            case "es_put_template": {
                String kind = optionalString(args, "kind");
                if (kind == null || kind.isEmpty()) kind = "index";
                String body = jsonObject(args.get("template"), "template");
                data = isAdmin(auth)
                        ? esIndexAdmin.putTemplateAdmin(kind, requiredString(args, "name"), body)
                        : esIndexAdmin.putTemplate(kind, requiredString(args, "name"), body);
                break;
            }
            case "es_delete_template": {
                String kind = optionalString(args, "kind");
                if (kind == null || kind.isEmpty()) kind = "index";
                String templateName = requiredString(args, "name");
                data = isAdmin(auth)
                        ? esIndexAdmin.deleteTemplate(kind, templateName)
                        : esIndexAdmin.deleteTemplateGuarded(kind, templateName);
                break;
            }
            case "es_list_data_streams":
                data = rawOrGuarded(isAdmin(auth), "GET", "/_data_stream", "");
                break;
            case "es_get_data_stream":
                data = rawOrGuarded(isAdmin(auth), "GET", "/_data_stream/" + encodeName(args, "name"), "");
                break;
            case "es_data_stream_stats":
                data = rawOrGuarded(isAdmin(auth), "GET",
                        "/_data_stream/" + encodeName(args, "name") + "/_stats", "");
                break;
            case "es_create_data_stream":
                data = rawOrGuarded(isAdmin(auth), "PUT", "/_data_stream/" + encodeName(args, "name"), "");
                break;
            case "es_delete_data_stream":
                data = rawOrGuarded(isAdmin(auth), "DELETE", "/_data_stream/" + encodeName(args, "name"), "");
                break;
            case "es_list_component_templates":
                data = rawOrGuarded(isAdmin(auth), "GET", "/_component_template", "");
                break;
            case "es_clone_index":
                data = rawOrGuarded(isAdmin(auth), "POST",
                        "/" + encodeIndex(args) + "/_clone/" + encodeName(args, "target"), optionalBody(args));
                break;
            case "es_shrink_index":
                data = rawOrGuarded(isAdmin(auth), "POST",
                        "/" + encodeIndex(args) + "/_shrink/" + encodeName(args, "target"), optionalBody(args));
                break;
            case "es_split_index":
                data = rawOrGuarded(isAdmin(auth), "POST",
                        "/" + encodeIndex(args) + "/_split/" + encodeName(args, "target"), optionalBody(args));
                break;
            case "es_update_by_query": {
                Map<String, Object> body = new LinkedHashMap<>();
                Object query = queryClause(args.get("query"));
                if (query != null) body.put("query", query);
                Object script = args.get("script");
                if (script != null) {
                    body.put("script", script instanceof String
                            ? objectMapper.readValue((String) script, Object.class) : script);
                }
                data = runBatchAsyncAware("update_by_query",
                        requiredString(args, "index"),
                        objectMapper.writeValueAsString(body), queryOpts(args));
                break;
            }
            case "es_delete_by_query": {
                Object query = queryClause(args.get("query"));
                if (query == null) throw new IllegalArgumentException("query is required for delete_by_query");
                data = runBatchAsyncAware("delete_by_query",
                        requiredString(args, "index"),
                        objectMapper.writeValueAsString(Collections.singletonMap("query", query)),
                        queryOpts(args));
                break;
            }
            case "es_reindex":
                data = runBatchAsyncAware("reindex", null,
                        jsonObject(args.get("body"), "body"), queryOpts(args));
                break;
            case "es_analyze":
                data = esIndexAdmin.analyze(optionalString(args, "index"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_validate_query":
                data = esIndexAdmin.validateQuery(requiredString(args, "index"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_term_vectors":
                data = esIndexAdmin.termVectors(requiredString(args, "index"),
                        requiredString(args, "id"), optionalString(args, "fields"));
                break;
            case "es_search_template":
                data = esIndexAdmin.searchTemplate(requiredString(args, "index"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_render_template":
                data = esIndexAdmin.renderTemplate(jsonObject(args.get("body"), "body"));
                break;
            case "es_analysis_settings":
                data = esIndexAdmin.getAnalysisSettings(requiredString(args, "index"));
                break;
            case "es_update_analysis_settings":
                data = esIndexAdmin.updateAnalysisSettings(requiredString(args, "index"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_reload_analyzers":
                data = esIndexAdmin.reloadSearchAnalyzers(requiredString(args, "index"));
                break;
            case "es_synonyms_upsert": {
                Object rawEntries = args.get("entries");
                if (!(rawEntries instanceof List)) {
                    throw new IllegalArgumentException("entries must be an array of synonym rules");
                }
                List<String> entries = new ArrayList<>();
                for (Object entry : (List<?>) rawEntries) entries.add(String.valueOf(entry));
                data = esIndexAdmin.synonymsGraphUpsert(requiredString(args, "index"),
                        optionalString(args, "filter"), entries,
                        Boolean.TRUE.equals(args.get("expand")));
                break;
            }
            case "es_reindex_preview": {
                Object clause = queryClause(args.get("query"));
                String queryJson = clause == null ? null
                        : objectMapper.writeValueAsString(Collections.singletonMap("query", clause));
                data = esIndexAdmin.reindexPreview(requiredString(args, "source"), queryJson);
                break;
            }
            case "es_index_settings_defaults":
                data = esIndexAdmin.getIndexSettingsWithDefaults(requiredString(args, "index"));
                break;
            case "es_index_detail": {
                int sample = args.get("sampleSize") instanceof Number
                        ? Math.max(0, Math.min(20, ((Number) args.get("sampleSize")).intValue())) : 5;
                data = esIndexAdmin.inspect(requiredString(args, "index"), sample);
                break;
            }
            case "es_allocation_explain":
                data = esIndexAdmin.allocationExplain(optionalJson(args.get("body"), "body"));
                break;
            case "es_shard_stores":
                data = esIndexAdmin.shardStores(requiredString(args, "index"),
                        optionalString(args, "status"));
                break;
            case "es_pending_tasks":
                data = esIndexAdmin.pendingTasks();
                break;
            case "es_slm_policies":
                data = esIndexAdmin.slmPolicies();
                break;
            case "es_put_slm_policy":
                data = rawOrGuarded(isAdmin(auth), "PUT", "/_slm/policy/" + encodeName(args, "policyId"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_delete_slm_policy":
                data = rawOrGuarded(isAdmin(auth), "DELETE", "/_slm/policy/" + encodeName(args, "policyId"), "");
                break;
            case "es_slm_status":
                data = esIndexAdmin.slmStatus();
                break;
            case "es_slm_execute":
                data = esIndexAdmin.slmExecute(requiredString(args, "policyId"));
                break;
            case "es_nodes_stats":
                data = isAdmin(auth) ? esIndexAdmin.nodesStats() : esIndexAdmin.nodesStatsBrief();
                break;
            case "es_hot_threads": {
                int threads = args.get("threads") instanceof Number
                        ? Math.max(1, Math.min(100, ((Number) args.get("threads")).intValue())) : 3;
                data = Collections.singletonMap("raw", esIndexAdmin.hotThreads(threads,
                        optionalString(args, "interval"), optionalString(args, "type"),
                        optionalString(args, "nodeId")));
                break;
            }
            case "es_remote_clusters":
                data = esIndexAdmin.remoteClusters();
                break;
            case "es_plugins":
                data = esIndexAdmin.pluginsList();
                break;
            case "es_watcher":
                data = esIndexAdmin.watcherList();
                break;
            case "es_put_watch":
                data = rawOrGuarded(isAdmin(auth), "PUT", "/_watcher/watch/" + encodeName(args, "id"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_delete_watch":
                data = rawOrGuarded(isAdmin(auth), "DELETE", "/_watcher/watch/" + encodeName(args, "id"), "");
                break;
            case "es_execute_watch":
                data = rawOrGuarded(isAdmin(auth), "POST", "/_watcher/watch/" + encodeName(args, "id") + "/_execute", "");
                break;
            case "es_ingest_pipelines": {
                String id = optionalString(args, "id");
                String path = id == null || id.isEmpty() ? "/_ingest/pipeline"
                        : "/_ingest/pipeline/" + java.net.URLEncoder.encode(id, "UTF-8");
                data = esIndexAdmin.rawGuarded("GET", path, "");
                break;
            }
            case "es_put_ingest_pipeline":
                data = rawOrGuarded(isAdmin(auth), "PUT", "/_ingest/pipeline/" + encodeName(args, "id"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_delete_ingest_pipeline":
                data = rawOrGuarded(isAdmin(auth), "DELETE", "/_ingest/pipeline/" + encodeName(args, "id"), "");
                break;
            case "es_cat_allocation":
                data = esIndexAdmin.rawGuarded("GET", "/_cat/allocation?format=json&bytes=b", "");
                break;
            case "es_get_cluster_settings":
                data = esIndexAdmin.getClusterSettings();
                break;
            case "es_update_cluster_settings":
                data = esIndexAdmin.putClusterSettings(jsonObject(args.get("body"), "body"));
                break;
            case "es_reroute":
                data = esIndexAdmin.clusterReroute(jsonObject(args.get("body"), "body"),
                        Boolean.TRUE.equals(args.get("dryRun")),
                        args.get("explain") == null || Boolean.TRUE.equals(args.get("explain")),
                        Boolean.TRUE.equals(args.get("retryFailed")));
                break;
            case "es_list_snapshot_repos": {
                java.util.List<Map<String, Object>> repos = esIndexAdmin.listSnapshotRepositories();
                data = isAdmin(auth) ? repos : EsIndexAdmin.maskSnapshotRepoSecrets(repos);
                break;
            }
            case "es_put_snapshot_repo":
                data = rawOrGuarded(isAdmin(auth), "PUT", "/_snapshot/" + encodeName(args, "repo"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_delete_snapshot_repo":
                data = rawOrGuarded(isAdmin(auth), "DELETE", "/_snapshot/" + encodeName(args, "repo"), "");
                break;
            case "es_list_snapshots":
                data = esIndexAdmin.listSnapshots(requiredString(args, "repo"));
                break;
            case "es_snapshot_status":
                data = esIndexAdmin.snapshotStatus(optionalString(args, "repo"),
                        optionalString(args, "name"));
                break;
            case "es_create_snapshot": {
                String body = optionalJson(args.get("body"), "body");
                data = isAdmin(auth)
                        ? esIndexAdmin.createSnapshot(requiredString(args, "repo"),
                        requiredString(args, "name"), body)
                        : esIndexAdmin.createSnapshotGuarded(requiredString(args, "repo"),
                        requiredString(args, "name"), body);
                break;
            }
            case "es_delete_snapshot": {
                String repo = requiredString(args, "repo");
                String snapshot = requiredString(args, "name");
                data = isAdmin(auth)
                        ? esIndexAdmin.deleteSnapshot(repo, snapshot)
                        : esIndexAdmin.deleteSnapshotGuarded(repo, snapshot);
                break;
            }
            case "es_restore_snapshot": {
                String body = optionalJson(args.get("body"), "body");
                String repo = requiredString(args, "repo");
                String snapshot = requiredString(args, "name");
                data = isAdmin(auth)
                        ? esIndexAdmin.restoreSnapshot(repo, snapshot, body)
                        : esIndexAdmin.restoreSnapshotGuarded(repo, snapshot, body);
                break;
            }
            case "es_ilm_policies":
                data = esIndexAdmin.listIlmPolicies();
                break;
            case "es_ilm_explain":
                data = esIndexAdmin.explainIlm(requiredString(args, "index"));
                break;
            case "es_ilm_status":
                data = esIndexAdmin.ilmStatus();
                break;
            case "es_put_ilm_policy":
                data = esIndexAdmin.putIlmPolicy(requiredString(args, "name"),
                        jsonObject(args.get("policy"), "policy"));
                break;
            case "es_delete_ilm_policy":
                data = esIndexAdmin.deleteIlmPolicy(requiredString(args, "name"));
                break;
            case "es_ilm_move":
                data = esIndexAdmin.ilmMove(requiredString(args, "index"),
                        jsonObject(args.get("body"), "body"));
                break;
            case "es_ilm_start":
                data = esIndexAdmin.ilmStart();
                break;
            case "es_ilm_stop":
                data = esIndexAdmin.ilmStop();
                break;
            case "es_list_scripts":
                data = esIndexAdmin.listStoredScripts();
                break;
            case "es_put_script":
                data = esIndexAdmin.putStoredScript(requiredString(args, "id"),
                        jsonObject(args.get("script"), "script"));
                break;
            case "es_delete_script":
                data = esIndexAdmin.deleteStoredScript(requiredString(args, "id"));
                break;
            case "es_task_detail":
                data = esIndexAdmin.taskDetail(requiredString(args, "taskId"));
                break;
            case "es_index_doc":
                data = esIndexAdmin.putDoc(
                        requiredString(args, "index"),
                        requiredString(args, "id"),
                        documentJson(args.get("document"), "document"),
                        "true");
                break;
            case "es_update_doc":
                data = esIndexAdmin.updatePartial(
                        requiredString(args, "index"),
                        requiredString(args, "id"),
                        documentJson(args.get("document"), "document"));
                break;
            case "es_delete_doc":
                data = esIndexAdmin.deleteById(
                        requiredString(args, "index"),
                        requiredString(args, "id"));
                break;
            case "es_rest":
                /* ADMIN key 与 ADMIN 登录同权（raw 逃生通道）；非 ADMIN 仍走控制面守卫。
                   连接级读写已在 resolveTarget 后按目标连接判定，不会因 raw 放开越界到只读生产。
                   Cancellable 一登记：取消即 abort 连接——同步等待不再只能「改状态词」。
                   透传若带异步 task 回执（wait_for_completion=false），task id 一并登记，
                   取消时连 ES 任务一起撤。 */
                String restMethod = requiredString(args, "method");
                String restPath = requiredString(args, "path");
                String restBody = bodyText(args.get("body"));
                Map<String, Object> restData = esIndexAdmin.rawCancellable(
                        restMethod, restPath, restBody, !isAdmin(auth), httpCancelSink());
                attachEsTaskFromRawBody(ACTIVE_CONTROL.get(), restData);
                data = restData;
                break;
            case "es_adhoc_prepare": {
                requireAdhocService();
                data = adhocRebuildService.prepare(requiredString(args, "index"));
                break;
            }
            case "es_adhoc_start": {
                requireAdhocService();
                Map<String, Object> rebuildReq = new LinkedHashMap<>();
                for (String key : new String[]{"index", "strategy", "timeField", "destIndex", "settingsJson",
                        "mappingJson", "bufferMs", "deleteOldIndex", "confirmDirectSwap", "pauseBeforeSwitch"}) {
                    if (args.containsKey(key)) rebuildReq.put(key, args.get(key));
                }
                /* 作业归属记 key 前缀（与审计同口径）；服务 token 无 key 身份，维持连接级语义。 */
                data = adhocRebuildService.start(rebuildReq,
                        auth.key == null ? null : auth.key.prefix,
                        auth.key == null ? null : auth.key.role);
                break;
            }
            case "es_adhoc_status":
                requireAdhocService();
                data = adhocRebuildService.status(requiredString(args, "jobId"));
                break;
            case "es_adhoc_abort":
                requireAdhocService();
                data = adhocRebuildService.abort(requiredString(args, "jobId"));
                break;
            case "es_adhoc_confirm_switch":
                requireAdhocService();
                data = adhocRebuildService.confirmSwitch(requiredString(args, "jobId"));
                break;
            case "es_adhoc_retry":
                requireAdhocService();
                data = adhocRebuildService.retry(requiredString(args, "jobId"));
                break;
            case "es_adhoc_delete_jobs": {
                requireAdhocService();
                String jobId = optionalString(args, "jobId");
                if (jobId != null) {
                    data = adhocRebuildService.delete(jobId);
                    break;
                }
                Object days = args.get("olderThanDays");
                if (days instanceof Number) {
                    data = adhocRebuildService.deleteOlderThan(((Number) days).intValue(), null);
                    break;
                }
                throw new IllegalArgumentException("jobId 与 olderThanDays 必须二选一");
            }
            case "es_adhoc_throttle":
                requireAdhocService();
                Object rps = args.get("requestsPerSecond");
                if (!(rps instanceof Number)) {
                    throw new IllegalArgumentException("requestsPerSecond 必须为数字（-1 表示恢复全速）");
                }
                data = adhocRebuildService.throttle(requiredString(args, "jobId"), ((Number) rps).doubleValue());
                break;
            case "es_adhoc_events":
                requireAdhocService();
                data = adhocRebuildService.events(requiredString(args, "jobId"));
                break;
            case "es_adhoc_jobs": {
                requireAdhocService();
                List<Map<String, Object>> allJobs = adhocRebuildService.listJobs();
                /* service token / ADMIN key 是全局视角；受限 key 只见当前目标连接的作业，
                   与控制台 adhoc 列表的连接模型过滤同口径，防止跨目标元数据外泄。 */
                if (isAdmin(auth)) {
                    data = allJobs;
                    break;
                }
                String jobsTarget = clientRouter == null
                        ? "host" : clientRouter.requireCapturedTarget();
                List<Map<String, Object>> scopedJobs = new ArrayList<>();
                for (Map<String, Object> job : allJobs) {
                    Object jobTarget = job.get("targetId");
                    if ((jobTarget == null ? "host" : String.valueOf(jobTarget)).equals(jobsTarget)) {
                        scopedJobs.add(job);
                    }
                }
                data = scopedJobs;
                break;
            }
            case "es_xmigrate_preflight": {
                requireXmigrateService();
                MigrateRequest preflightReq = new MigrateRequest();
                preflightReq.setSourceIndex(requiredString(args, "sourceIndex"));
                preflightReq.setDestIndex(requiredString(args, "destIndex"));
                data = crossClusterMigrateService.preflight(preflightReq);
                break;
            }
            case "es_xmigrate_start": {
                requireXmigrateService();
                MigrateRequest migrateReq = new MigrateRequest();
                String startConnId = optionalString(args, "srcConnId");
                migrateReq.setSrcConnId(startConnId);
                migrateReq.setSourceIndex(requiredString(args, "sourceIndex"));
                migrateReq.setDestIndex(requiredString(args, "destIndex"));
                String createMode = optionalString(args, "destCreateMode");
                if (createMode != null && !createMode.isEmpty()) {
                    migrateReq.setDestCreateMode(DestCreateMode.valueOf(createMode.trim().toUpperCase(Locale.ROOT)));
                }
                String tune = optionalString(args, "tuneMode");
                if (tune != null && !tune.isEmpty()) {
                    migrateReq.setTuneMode(TuneMode.valueOf(tune.trim().toUpperCase(Locale.ROOT)));
                }
                if (args.get("slices") instanceof Number) {
                    migrateReq.setSlices(((Number) args.get("slices")).intValue());
                }
                if (args.get("batchSize") instanceof Number) {
                    migrateReq.setBatchSize(((Number) args.get("batchSize")).intValue());
                }
                migrateReq.setForceMerge(Boolean.TRUE.equals(args.get("forceMerge")));
                /* 源连接只认已存档案（服务端取密，凭据不经 MCP 通道）；归属记 key 前缀（与 adhoc 同口径）。 */
                migrateReq.setConn(xmigrateSourceConn(startConnId, auth));
                String jobId = crossClusterMigrateService.start(migrateReq,
                        auth.key == null ? null : auth.key.prefix,
                        auth.key == null ? null : auth.key.role);
                Map<String, Object> started = new LinkedHashMap<>();
                started.put("ok", true);
                started.put("jobId", jobId);
                data = started;
                break;
            }
            case "es_xmigrate_status": {
                requireXmigrateService();
                MigrateJobES job = crossClusterMigrateService.progress(requiredString(args, "jobId"));
                data = xmigrateJobView(job, auth);
                break;
            }
            case "es_xmigrate_jobs": {
                requireXmigrateService();
                int limit = args.get("limit") instanceof Number
                        ? Math.max(1, Math.min(500, ((Number) args.get("limit")).intValue())) : 20;
                List<Object> out = new ArrayList<>();
                for (MigrateJobES job : crossClusterMigrateService.jobs(limit)) {
                    out.add(xmigrateJobView(job, auth));
                }
                data = out;
                break;
            }
            case "es_xmigrate_fetch_config":
                requireXmigrateService();
                data = crossClusterMigrateService.fetchSourceConfig(
                        xmigrateSourceConn(requiredString(args, "srcConnId"), auth),
                        requiredString(args, "sourceIndex"));
                break;
            case "es_xmigrate_resume": {
                requireXmigrateService();
                String resumeJobId = requiredString(args, "jobId");
                String resumeConnId = requiredString(args, "srcConnId");
                MigrateJobES job = crossClusterMigrateService.progress(resumeJobId);
                xmigrateRequireOwner(job, auth);
                if (job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()
                        && !job.getSrcConnId().trim().equals(resumeConnId.trim())) {
                    throw new IllegalArgumentException("续跑必须使用该作业的源连接档案 " + job.getSrcConnId());
                }
                crossClusterMigrateService.resume(resumeJobId, xmigrateSourceConn(resumeConnId, auth));
                Map<String, Object> resumed = new LinkedHashMap<>();
                resumed.put("ok", true);
                resumed.put("jobId", resumeJobId);
                data = resumed;
                break;
            }
            case "es_xmigrate_abort": {
                requireXmigrateService();
                String abortJobId = requiredString(args, "jobId");
                xmigrateRequireOwner(crossClusterMigrateService.progress(abortJobId), auth);
                crossClusterMigrateService.abort(abortJobId);
                Map<String, Object> aborted = new LinkedHashMap<>();
                aborted.put("ok", true);
                aborted.put("aborted", abortJobId);
                data = aborted;
                break;
            }
            case "es_xmigrate_reconcile": {
                requireXmigrateService();
                /* 双连接对账：源侧只认已存档案（与组内其余工具同口径）；
                   目标侧 destConnId 独立于 connection 参数，走同一套集合/minRole/读权限门。 */
                RemoteClusterConn reconcileConn = xmigrateSourceConn(requiredString(args, "srcConnId"), auth);
                String reconcileSource = requiredString(args, "sourceIndex");
                String destConnId = requiredString(args, "destConnId");
                String reconcileDest = requiredString(args, "destIndex");
                Map<String, Object> destParams = new LinkedHashMap<>();
                destParams.put("name", "es_xmigrate_reconcile");
                destParams.put("arguments", Collections.singletonMap("connection", destConnId));
                enforceTargetPermission(auth, resolveTarget(auth, destParams), "es_xmigrate_reconcile", destParams);
                Long srcCount = xmigrateReconcileSourceCount(reconcileConn, reconcileSource);
                Long destCount;
                McpTargetScope destScope =
                        clientRouter == null ? null : clientRouter.openScope(destConnId);
                try {
                    destCount = xmigrateReconcileDestCount(reconcileDest);
                } finally {
                    if (destScope != null) destScope.close();
                }
                Map<String, Object> reconciled = new LinkedHashMap<>();
                reconciled.put("sourceIndex", reconcileSource);
                reconciled.put("destConnId", destConnId);
                reconciled.put("destIndex", reconcileDest);
                reconciled.put("srcCount", srcCount);
                reconciled.put("destCount", destCount);
                reconciled.put("diff", srcCount == null || destCount == null ? null : srcCount - destCount);
                data = reconciled;
                break;
            }
            case "es_xmigrate_conflicts": {
                requireXmigrateService();
                MigrateJobES conflictJob = crossClusterMigrateService.progress(requiredString(args, "jobId"));
                Map<String, Object> conflictsOut = new LinkedHashMap<>();
                conflictsOut.put("jobId", conflictJob.getJobId());
                conflictsOut.put("conflicts", conflictJob.getConflicts());
                List<String> conflictSamples = conflictJob.getConflictSamples();
                conflictsOut.put("conflictSamples",
                        conflictSamples == null ? Collections.<String>emptyList() : conflictSamples);
                conflictsOut.put("sampleCap", 1000);
                conflictsOut.put("note", "冲突 _id 样本为环形收集，上限 1000 条；总冲突数见 conflicts 字段");
                data = conflictsOut;
                break;
            }
            case "es_xmigrate_events": {
                /* 作业事件时间线：与 REST /jobs/{id}/events 同构（ts/stage/message/level，升序），
                   归属只认创建者本人或 ADMIN（与事件资源同一口径）；断线后 Agent 可按 jobId 回放。 */
                requireXmigrateService();
                MigrateJobES eventJob = crossClusterMigrateService.progress(requiredString(args, "jobId"));
                xmigrateRequireOwner(eventJob, auth);
                data = crossClusterMigrateService.events(eventJob.getJobId());
                break;
            }
            case "es_xmigrate_connect_check":
                /* 连通自检只认已存源连接档案（srcConnId）——与组内其余工具同口径，不收内联凭据。 */
                requireXmigrateService();
                data = crossClusterMigrateService.connectCheck(
                        xmigrateSourceConn(requiredString(args, "srcConnId"), auth));
                break;
            case "es_xmigrate_resolve_preview":
                /* 变量解析预览：与 REST resolve-preview 同参同服务，密码值不回显。 */
                requireXmigrateService();
                data = crossClusterMigrateService.resolvePreview(
                        xmigrateSourceConn(requiredString(args, "srcConnId"), auth));
                break;
            case "es_xmigrate_dest_indices":
                /* 迁移写入端（宿主/控制集群）索引清单——目标索引补全专用。 */
                requireXmigrateService();
                data = crossClusterMigrateService.destIndices();
                break;
            case "es_xmigrate_delete_jobs": {
                /* 与 es_adhoc_delete_jobs 同参同返回形态：jobId 或 olderThanDays 二选一。
                   单条删除与续跑/中止同门：仅创建者本人或 ADMIN。 */
                requireXmigrateService();
                String deleteJobId = optionalString(args, "jobId");
                if (deleteJobId != null) {
                    xmigrateRequireOwner(crossClusterMigrateService.progress(deleteJobId), auth);
                    data = crossClusterMigrateService.delete(deleteJobId);
                    break;
                }
                Object days = args.get("olderThanDays");
                if (days instanceof Number) {
                    data = crossClusterMigrateService.deleteOlderThan(((Number) days).intValue(), null);
                    break;
                }
                throw new IllegalArgumentException("jobId 与 olderThanDays 必须二选一");
            }
            case "es_xmigrate_sync_structure": {
                /* 结构同步（v3 全参）：源侧只认已存档案（与组内其余工具同口径）；destConnId 可选
                   （缺省/host=宿主集群）；dryRun=true 只产出计划（只读语义，MRTR 二次确认在
                   mrtrNeedsConfirmation 处按参数跳过）；expectPlanDigest 配对 dryRun=false 执行——
                   dryRun=true 时带上明确拒绝（预览不存在计划漂移校验）。 */
                requireXmigrateService();
                String syncSrcConnId = requiredString(args, "srcConnId");
                String syncDestConnId = optionalString(args, "destConnId");
                String syncDestEcho = syncDestConnId == null || "host".equalsIgnoreCase(syncDestConnId)
                        ? null : syncDestConnId;
                boolean syncDryRun = Boolean.TRUE.equals(args.get("dryRun"));
                String expectPlanDigest = optionalString(args, "expectPlanDigest");
                if (expectPlanDigest != null && !expectPlanDigest.isEmpty() && syncDryRun) {
                    throw new IllegalArgumentException("expectPlanDigest only valid with dryRun=false");
                }
                /* 宿主目标（空或 host）的权限按 host 显式判定（REST requireDestWrite 同口径），不落到
                   connection 参数的缺省连接；dryRun=true 只读预览只要求读，执行形态要求写。 */
                if (syncDestEcho == null) {
                    Map<String, Object> syncHostParams = new LinkedHashMap<>();
                    syncHostParams.put("name", "es_xmigrate_sync_structure");
                    syncHostParams.put("arguments", args);
                    enforceTargetPermission(auth, "host", "es_xmigrate_sync_structure", syncHostParams);
                }
                data = crossClusterMigrateService.syncStructure(
                        xmigrateSourceConn(syncSrcConnId, auth),
                        requiredString(args, "sourceIndex"),
                        optionalString(args, "destIndex"),
                        optionalString(args, "downgradedAnalyzerFallback"),
                        syncDryRun,
                        Boolean.TRUE.equals(args.get("syncAliases")),
                        syncDestEcho,
                        xmigrateDestConn(syncDestEcho, auth),
                        expectPlanDigest == null || expectPlanDigest.isEmpty() ? null : expectPlanDigest);
                break;
            }
            case "es_xmigrate_smart_sync": {
                /* 一步式结构同步：apply=false（缺省）只读预览（免写权限、免 MRTR 二次确认，
                   同 sync_structure dryRun 语义）；apply=true 执行（需写权限与 MRTR），携带预览
                   返回的 expectPlanDigest 防源结构漂移；destConnId 必填（宿主用 host），
                   连接档案解析与计划整形由服务层负责。mode 增强形态（create=缺省新建 /
                   incremental=目标已有索引补同步）走结构同步服务的 12 参全参重载；
                   不带 mode 时维持既有统一入口调用面。 */
                requireXmigrateService();
                boolean smartApply = Boolean.TRUE.equals(args.get("apply"));
                String smartExpectDigest = optionalString(args, "expectPlanDigest");
                if (smartExpectDigest != null && !smartExpectDigest.isEmpty() && !smartApply) {
                    throw new IllegalArgumentException("expectPlanDigest only valid with apply=true");
                }
                /* savePlan 把本次预览计划落盘并回显 planId，仅预览形态可用：执行形态以执行报告为准。 */
                boolean savePlan = Boolean.TRUE.equals(args.get("savePlan"));
                if (savePlan && smartApply) {
                    throw new IllegalArgumentException("savePlan 仅预览形态可用");
                }
                String smartDestConnId = requiredString(args, "destConnId");
                /* 宿主目标（空或 host）的写权限按 host 显式判定（REST requireDestWrite 同口径），
                   不落到 connection 参数的缺省连接；预览形态（apply/savePlan 均 false）只要求读。 */
                if (smartDestConnId.isEmpty() || "host".equalsIgnoreCase(smartDestConnId)) {
                    Map<String, Object> smartHostParams = new LinkedHashMap<>();
                    smartHostParams.put("name", "es_xmigrate_smart_sync");
                    smartHostParams.put("arguments", args);
                    enforceTargetPermission(auth, "host", "es_xmigrate_smart_sync", smartHostParams);
                }
                String smartMode = optionalString(args, "mode");
                if (smartMode == null || smartMode.isEmpty()) {
                    data = crossClusterMigrateService.smartSync(
                            requiredString(args, "srcConnId"),
                            requiredString(args, "sourceIndex"),
                            smartDestConnId,
                            optionalString(args, "destIndex"),
                            Boolean.TRUE.equals(args.get("syncAliases")),
                            optionalString(args, "downgradedAnalyzerFallback"),
                            Boolean.TRUE.equals(args.get("autoTune")),
                            smartApply,
                            smartExpectDigest == null || smartExpectDigest.isEmpty() ? null : smartExpectDigest);
                } else {
                    String normalizedMode = smartMode.toLowerCase(Locale.ROOT);
                    if (!"create".equals(normalizedMode) && !"incremental".equals(normalizedMode)) {
                        throw new IllegalArgumentException("mode 必须为 create 或 incremental: " + smartMode);
                    }
                    String smartSrcConnId = requiredString(args, "srcConnId");
                    data = structureSync().smartSync(
                            smartSrcConnId,
                            xmigrateStoredConn(smartSrcConnId, auth),
                            requiredString(args, "sourceIndex"),
                            smartDestConnId,
                            xmigrateDestConn(smartDestConnId, auth),
                            optionalString(args, "destIndex"),
                            Boolean.TRUE.equals(args.get("syncAliases")),
                            optionalString(args, "downgradedAnalyzerFallback"),
                            Boolean.TRUE.equals(args.get("autoTune")),
                            smartApply,
                            smartExpectDigest == null || smartExpectDigest.isEmpty() ? null : smartExpectDigest,
                            normalizedMode);
                }
                if (savePlan) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> smartReport = (Map<String, Object>) data;
                    PlanRecord savedPlan = structureSync().planStore().savePlan(
                            requiredString(args, "srcConnId"),
                            requiredString(args, "sourceIndex"),
                            requiredString(args, "destConnId"),
                            optionalString(args, "destIndex"),
                            Boolean.TRUE.equals(args.get("syncAliases")),
                            optionalString(args, "downgradedAnalyzerFallback"),
                            Boolean.TRUE.equals(args.get("autoTune")),
                            smartReport);
                    smartReport.put("planId", savedPlan.getPlanId());
                }
                break;
            }
            case "es_xmigrate_plan_list": {
                /* 已存同步计划列表（只读）：按 savedAtMs 倒序、容量上限 cappedAt。存储读取失败时只返回
                   进程内保存的计划并附 warning——不把读失败伪装成「没有计划」。 */
                requireXmigrateService();
                McpPlanListing listing = structureSync().planStore().list();
                List<Map<String, Object>> planRows = new ArrayList<>();
                for (PlanRecord plan : listing.getPlans()) {
                    planRows.add(xmigratePlanView(plan, false, auth));
                }
                Map<String, Object> planListOut = new LinkedHashMap<>();
                planListOut.put("plans", planRows);
                planListOut.put("cappedAt", McpPlanStore.CAP);
                if (listing.getWarning() != null) {
                    planListOut.put("warning", listing.getWarning());
                }
                data = planListOut;
                break;
            }
            case "es_xmigrate_plan_apply": {
                /* 按已存计划执行（写 + MRTR 二次确认）：按计划保存的参数重跑 smart_sync，漂移门摘要取
                   expectPlanDigest、缺省用计划保存时的 planDigest——与 smart_sync apply 是同一条漂移门
                   （不一致抛「计划摘要不匹配，拒绝执行」= PLAN_DRIFT，任何写请求之前拦截），执行成功后
                   回写 appliedAtMs/appliedCount。create 计划走统一入口、incremental 计划走结构同步服务
                   的全参形态，与 smart_sync 的两种调用面一一对应；档案存在性与 key 角色门与 smart_sync
                   带 mode 的调用面同口径。 */
                requireXmigrateService();
                String applyPlanId = requiredString(args, "planId");
                McpPlanStore planStore = structureSync().planStore();
                PlanRecord plan = planStore.find(applyPlanId);
                if (plan == null) {
                    throw new IllegalStateException(McpPlanStore.NOT_FOUND_PREFIX + applyPlanId);
                }
                String planSrcConnId = plan.getSrcConnId() == null ? "" : plan.getSrcConnId().trim();
                String planDestConnId = plan.getDestConnId() == null ? "" : plan.getDestConnId().trim();
                boolean planSyncAliases = Boolean.TRUE.equals(plan.getSyncAliases());
                boolean planAutoTune = Boolean.TRUE.equals(plan.getAutoTune());
                boolean incremental = "incremental".equals(plan.getMode());
                RemoteClusterConn planSrcConn = xmigrateStoredConn(planSrcConnId, auth);
                RemoteClusterConn planDestConn = xmigrateDestConn(planDestConnId, auth);
                /* 写落在哪个集群，就在哪个连接上要求写权限（与 reconcile 的目标侧同口径）；目标为空
                   或 host 时按 host 显式判定（REST requireDestWrite 同口径），不落到 connection 参数
                   的缺省连接。 */
                boolean planDestIsHost = planDestConnId.isEmpty() || "host".equalsIgnoreCase(planDestConnId);
                Map<String, Object> planDestParams = new LinkedHashMap<>();
                planDestParams.put("name", "es_xmigrate_plan_apply");
                planDestParams.put("arguments", Collections.singletonMap("connection",
                        planDestIsHost ? "host" : planDestConnId));
                enforceTargetPermission(auth, planDestIsHost ? "host" : resolveTarget(auth, planDestParams),
                        "es_xmigrate_plan_apply", planDestParams);
                data = planStore.applyWithDigest(plan, optionalString(args, "expectPlanDigest"), gateDigest -> incremental
                        ? structureSync().smartSync(planSrcConnId, planSrcConn, plan.getSourceIndex(), planDestConnId,
                                planDestConn, plan.getDestIndex(), planSyncAliases, plan.getFallbackAnalyzer(),
                                planAutoTune, true, gateDigest, "incremental")
                        : crossClusterMigrateService.smartSync(planSrcConnId, plan.getSourceIndex(), planDestConnId,
                                plan.getDestIndex(), planSyncAliases, plan.getFallbackAnalyzer(),
                                planAutoTune, true, gateDigest));
                break;
            }
            case "es_xmigrate_probe_capabilities": {
                /* 探测目标集群能力（只读）：connection=host 探宿主控制集群，否则按已存连接档案探测；
                   index 给出时附索引画像（与 preflight 增强同源）。 */
                requireXmigrateService();
                String probeConnId = requiredString(args, "connection");
                String probeIndex = optionalString(args, "index");
                Map<String, Object> probed = "host".equalsIgnoreCase(probeConnId)
                        ? crossClusterMigrateService.probeHostCapabilities(probeIndex)
                        : crossClusterMigrateService.probeCapabilities(
                                xmigrateSourceConn(probeConnId, auth), probeIndex);
                Map<String, Object> probeOut = new LinkedHashMap<>();
                probeOut.put("connection", probeConnId);
                probeOut.putAll(probed);
                data = probeOut;
                break;
            }
            case "es_xmigrate_compare_capabilities": {
                /* 双侧能力对比（只读）：源侧只认已存档案（与组内其余工具同口径），风险矩阵
                   （vendor_change/plugin_missing/version_downgrade/shard_oversize）由服务层产出。 */
                requireXmigrateService();
                String cmpSrcConnId = requiredString(args, "srcConnId");
                String cmpDestConnId = optionalString(args, "destConnId");
                String cmpDestEcho = cmpDestConnId == null || "host".equalsIgnoreCase(cmpDestConnId)
                        ? null : cmpDestConnId;
                data = crossClusterMigrateService.compareCapabilities(
                        cmpSrcConnId,
                        xmigrateSourceConn(cmpSrcConnId, auth),
                        optionalString(args, "sourceIndex"),
                        cmpDestEcho,
                        xmigrateDestConn(cmpDestEcho, auth),
                        optionalString(args, "destIndex"));
                break;
            }
            case "es_xmigrate_diff_structure": {
                /* 结构 diff（只读）：源侧只认已存档案；目标索引必须已存在（不存在由服务层如实报错）；
                   destIndex 缺省与源同名（与 sync_structure 同形），服务层负责回退与回显。
                   豁免增强形态（autoTunedShards/removedKeys 回传上次同步报告值，让复检不被
                   自己的计划内优化误报 unexpected）走结构同步服务的 6 参全参重载；
                   两参均缺省时维持既有统一入口调用面。 */
                requireXmigrateService();
                String diffSrcConnId = requiredString(args, "srcConnId");
                String diffDestConnId = optionalString(args, "destConnId");
                String diffDestEcho = diffDestConnId == null || "host".equalsIgnoreCase(diffDestConnId)
                        ? null : diffDestConnId;
                Integer autoTunedShards = optionalPositiveInteger(args, "autoTunedShards");
                List<String> removedKeys = optionalNonEmptyStringList(args, "removedKeys");
                if (autoTunedShards == null && removedKeys == null) {
                    data = crossClusterMigrateService.diffStructure(
                            xmigrateSourceConn(diffSrcConnId, auth),
                            requiredString(args, "sourceIndex"),
                            xmigrateDestConn(diffDestEcho, auth),
                            optionalString(args, "destIndex"));
                } else {
                    data = structureSync().diffStructure(
                            xmigrateSourceConn(diffSrcConnId, auth),
                            requiredString(args, "sourceIndex"),
                            xmigrateDestConn(diffDestEcho, auth),
                            optionalString(args, "destIndex"),
                            autoTunedShards,
                            removedKeys);
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> diffOut = (Map<String, Object>) data;
                diffOut.put("destConnId", diffDestEcho);
                break;
            }
            case "es_xmigrate_verify_equivalence": {
                /* 数据等价校验（只读）：jobId 形态沿用作业登记的源/目标，或 srcConnId+sourceIndex
                   形态显式指定；服务层按 count 对比、_doc 序 id 样本双侧 mget 后 canonical 摘要
                   逐 id 对比、可选 terms 聚合对比，产出 verdict EQUIVALENT/DIVERGENT/INCONCLUSIVE。
                   structureOnly=true 切纯结构摘要对比（纯结构同步后的终局验证），走结构同步
                   服务的 10 参全参重载（jobId 形态在调用层解析作业登记的源/目标档案）；
                   缺省 false 维持既有统一入口调用面。 */
                requireXmigrateService();
                String verifyJobId = optionalString(args, "jobId");
                String verifySrcConnId = optionalString(args, "srcConnId");
                if ((verifyJobId == null || verifyJobId.isEmpty())
                        && (verifySrcConnId == null || verifySrcConnId.isEmpty())) {
                    throw new IllegalArgumentException("jobId 与 srcConnId 必须二选一");
                }
                Object structureOnlyRaw = args.get("structureOnly");
                if (structureOnlyRaw != null && !(structureOnlyRaw instanceof Boolean)) {
                    throw new IllegalArgumentException("structureOnly 需为布尔值，实际: " + structureOnlyRaw);
                }
                String sampleFieldsRaw = optionalString(args, "sampleFields");
                List<String> sampleFieldsList = new ArrayList<>();
                if (sampleFieldsRaw != null && !sampleFieldsRaw.isEmpty()) {
                    for (String part : sampleFieldsRaw.split(",")) {
                        String field = part.trim();
                        if (!field.isEmpty()) sampleFieldsList.add(field);
                    }
                }
                if (Boolean.TRUE.equals(structureOnlyRaw)) {
                    String soSrcConnId = verifySrcConnId;
                    String soSourceIndex = optionalString(args, "sourceIndex");
                    String soDestIndex = optionalString(args, "destIndex");
                    if (verifyJobId != null && !verifyJobId.isEmpty()) {
                        MigrateJobES soJob = crossClusterMigrateService.progress(verifyJobId);
                        String soJobSrc = soJob.getSrcConnId();
                        if (soJobSrc == null || soJobSrc.trim().isEmpty()) {
                            throw new IllegalArgumentException(
                                    "该作业未记录源连接档案，无法验证（历史手输连接的作业不支持）: " + verifyJobId);
                        }
                        soSrcConnId = soJobSrc;
                        soSourceIndex = soJob.getSourceIndex();
                        soDestIndex = soJob.getDestIndex();
                    }
                    String soDestConnId = optionalString(args, "destConnId");
                    String soDestEcho = soDestConnId == null || soDestConnId.isEmpty()
                            || "host".equalsIgnoreCase(soDestConnId) ? null : soDestConnId;
                    data = structureSync().verifyEquivalence(
                            xmigrateStoredConn(soSrcConnId == null ? "" : soSrcConnId.trim(), auth),
                            soSourceIndex,
                            soDestEcho,
                            xmigrateDestConn(soDestEcho, auth),
                            soDestIndex,
                            optionalInteger(args, "sampleSize"),
                            sampleFieldsList,
                            optionalString(args, "aggField"),
                            optionalInteger(args, "aggSize"),
                            true);
                } else {
                    data = crossClusterMigrateService.verifyEquivalence(
                            verifyJobId,
                            verifySrcConnId,
                            optionalString(args, "sourceIndex"),
                            optionalString(args, "destConnId"),
                            optionalString(args, "destIndex"),
                            optionalInteger(args, "sampleSize"),
                            sampleFieldsList,
                            optionalString(args, "aggField"),
                            optionalInteger(args, "aggSize"));
                }
                break;
            }
            case "es_xmigrate_throttle": {
                /* 运行中调速（写）：与 abort 同门（创建者本人或 ADMIN）；rps ≥ -1（-1=不限速），
                   非法值在此与服务层双重明确报错。 */
                requireXmigrateService();
                String throttleJobId = requiredString(args, "jobId");
                Object rpsRaw = args.get("rps");
                if (!(rpsRaw instanceof Number)) {
                    throw new IllegalArgumentException("rps 必须为数字（-1 表示不限速）");
                }
                int throttleRps = ((Number) rpsRaw).intValue();
                if (throttleRps < -1) {
                    throw new IllegalArgumentException("rps 非法: " + throttleRps
                            + "（须 ≥ -1，-1 表示不限速）");
                }
                xmigrateRequireOwner(crossClusterMigrateService.progress(throttleJobId), auth);
                data = crossClusterMigrateService.throttle(throttleJobId, throttleRps);
                break;
            }
            case "es_connection_probe": {
                if (connHealthProber == null) {
                    throw new IllegalStateException(
                            "Connection health prober is not available in this deployment (conn-probe-enabled=false)");
                }
                String probeId = requiredString(args, "connection");
                if ("host".equalsIgnoreCase(probeId)) {
                    throw new IllegalArgumentException("host 是控制集群而非连接档案；宿主连通性请改用 es_cluster_health");
                }
                data = connHealthProber.probeOne(probeId);
                break;
            }
            case "es_monitor_metrics": {
                if (monitorMetricsStore == null) {
                    throw new IllegalStateException("Monitor metrics store is not available in this deployment");
                }
                String metricsScope = optionalString(args, "scope");
                if (metricsScope == null || metricsScope.isEmpty()) metricsScope = "cluster";
                String metricsConn = optionalString(args, "connection");
                String normMetricsConn = metricsConn == null || metricsConn.isEmpty()
                        || "host".equalsIgnoreCase(metricsConn) ? null : metricsConn;
                Long fromMs = optionalLong(args, "fromMs");
                Long toMs = optionalLong(args, "toMs");
                List<Map<String, Object>> metricRecords;
                String interval = optionalString(args, "interval");
                if (interval == null || interval.isEmpty()) {
                    int size = args.get("size") instanceof Number
                            ? Math.max(1, Math.min(2000, ((Number) args.get("size")).intValue())) : 2000;
                    metricRecords = monitorMetricsStore.search(normMetricsConn, null, metricsScope, size, 0, fromMs, toMs);
                } else {
                    if (!interval.matches("\\d+[smhd]")) {
                        throw new IllegalArgumentException("非法 interval（须形如 60s/10m/1h/1d）: " + interval);
                    }
                    metricRecords = monitorMetricsStore.searchAgg(normMetricsConn, null, metricsScope,
                            fromMs, toMs, interval, "avg");
                }
                Map<String, Object> metricsOut = new LinkedHashMap<>();
                metricsOut.put("records", metricRecords);
                data = metricsOut;
                break;
            }
            case "es_monitor_history": {
                if (monitorHistoryStore == null) {
                    throw new IllegalStateException("Monitor history store is not available in this deployment");
                }
                String historyConn = optionalString(args, "connection");
                String normHistoryConn = historyConn == null || historyConn.isEmpty()
                        || "host".equalsIgnoreCase(historyConn) ? null : historyConn;
                int historySize = args.get("size") instanceof Number
                        ? Math.max(1, Math.min(1000, ((Number) args.get("size")).intValue())) : 200;
                List<Map<String, Object>> historyRecords = monitorHistoryStore.search(normHistoryConn,
                        optionalString(args, "status"), historySize, 0,
                        optionalLong(args, "fromMs"), optionalLong(args, "toMs"));
                Map<String, Object> historyOut = new LinkedHashMap<>();
                historyOut.put("records", historyRecords);
                data = historyOut;
                break;
            }
            case "es_config_validate": {
                if (configLabService == null) {
                    throw new IllegalStateException("Config lab service is not available in this deployment");
                }
                /* 与 REST /config-lab/validate 同参同服务：settings/mapping 为 JSON 字符串，
                   dryRun 会在目标集群瞬时建删临时索引做落地校验。 */
                data = configLabService.validate(
                        optionalString(args, "settings"), optionalString(args, "mapping"),
                        Boolean.TRUE.equals(args.get("dryRun")));
                break;
            }
            case "es_config_drift": {
                if (configLabService == null) {
                    throw new IllegalStateException("Config lab service is not available in this deployment");
                }
                /* 代码注解（@Setting/@Mapping 注册的 indexKey）与线上实际的漂移对比详情。 */
                data = configLabService.drift(requiredString(args, "indexKey"));
                break;
            }
            case "es_ops_audit": {
                if (consoleOpsAuditStore == null) {
                    throw new IllegalStateException("Console ops audit store is not available in this deployment");
                }
                /* 权限口径照抄 REST /auth/ops-audit：全量审计是 REBUILD_OP+ 硬门
                   （拦截器 rank3），静态服务 token 视为部署管理员放行。 */
                if (auth.key != null && !ConsoleRole.parse(auth.key.role).atLeast(ConsoleRole.REBUILD_OP)) {
                    throw new IllegalArgumentException(
                            "全量审计需要 AUDIT_OP/ADMIN 角色: required=REBUILD_OP");
                }
                int auditSize = args.get("size") instanceof Number
                        ? Math.max(1, Math.min(1000, ((Number) args.get("size")).intValue())) : 100;
                int auditFrom = args.get("from") instanceof Number
                        ? Math.max(0, Math.min(10000, ((Number) args.get("from")).intValue())) : 0;
                List<ConsoleOpsAuditEvent> auditRecords = consoleOpsAuditStore.search(ConsoleOpsAuditQuery.builder()
                        .username(optionalString(args, "username"))
                        .action(optionalString(args, "action"))
                        .uriPrefix(optionalString(args, "uriPrefix"))
                        .kw(optionalString(args, "kw"))
                        .fromMs(optionalLong(args, "fromMs"))
                        .toMs(optionalLong(args, "toMs"))
                        .size(auditSize)
                        .from(auditFrom)
                        .build());
                data = opsAuditRows(auditRecords);
                break;
            }
            case "es_insight_settings_impact": {
                if (insightService == null) {
                    throw new IllegalStateException("Insight service is not available in this deployment");
                }
                /* 与 REST /insight/settings-impact 同参：只读影响分析（分类/门禁/重建预估）。 */
                Map<String, Object> impactChanges;
                if (args.get("changes") instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> cast = (Map<String, Object>) args.get("changes");
                    impactChanges = cast;
                } else {
                    impactChanges = null;
                }
                data = insightService.settingsImpact(requiredString(args, "index"), impactChanges);
                break;
            }
            case "es_ring_usage": {
                if (ringUsageController == null) {
                    throw new IllegalStateException("Ring usage endpoint is not available in this deployment");
                }
                /* 与 REST /ring-usage 同口径：审计+监控索引族占用与总量上限；
                   控制面索引前缀只对 ADMIN 可见（非 ADMIN key 脱敏，服务 token 视为管理员）。 */
                Map<String, Object> ringUsage = new LinkedHashMap<>(ringUsageController.usage());
                if (auth.key != null && !ConsoleRole.parse(auth.key.role).atLeast(ConsoleRole.ADMIN)) {
                    ringUsage.remove("auditPrefix");
                    ringUsage.remove("monitorPrefix");
                }
                data = ringUsage;
                break;
            }
            default:
                throw new IllegalArgumentException("Unknown tool: " + name);
        }
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "text");
        content.put("text", objectMapper.writeValueAsString(data));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", Collections.singletonList(content));
        /* MCP 2025-06-18 structuredContent：对象直接透传，数组/标量包成 result，
           客户端既可按文本解析，也可直接读结构化字段。 */
        if (data instanceof Map) {
            result.put("structuredContent", data);
        } else {
            result.put("structuredContent", Collections.singletonMap("result", data));
        }
        result.put("isError", false);
        return result;
    }

    /** 操作审计行形状与 REST /auth/ops-audit 的 wire 完全一致（记录键即事件维度全集），
        客户端在两个接入面看到的字段不做二义。 */
    private static Map<String, Object> opsAuditRows(List<ConsoleOpsAuditEvent> records) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (ConsoleOpsAuditEvent e : records) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("timestamp", e.getTimestamp());
            r.put("username", e.getUsername());
            if (e.getDisplayName() != null) {
                r.put("displayName", e.getDisplayName());
            }
            r.put("role", e.getRole());
            r.put("method", e.getMethod());
            r.put("uri", e.getUri());
            r.put("action", e.getAction());
            r.put("httpStatus", e.getHttpStatus());
            if (e.getDetail() != null) {
                r.put("detail", e.getDetail());
            }
            if (e.getConnId() != null) {
                r.put("connId", e.getConnId());
            }
            if (e.getConnName() != null) {
                r.put("connName", e.getConnName());
            }
            if (e.getIp() != null) {
                r.put("ip", e.getIp());
            }
            if (e.getCostMs() != null) {
                r.put("costMs", e.getCostMs());
            }
            r.put("source", e.getSource() == null ? "console" : e.getSource());
            rows.add(Collections.unmodifiableMap(r));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", Collections.unmodifiableList(rows));
        return Collections.unmodifiableMap(out);
    }

    private String msearchBody(Map<?, ?> args) throws IOException {
        Object raw = args.get("searches");
        if (!(raw instanceof List) || ((List<?>) raw).isEmpty()) {
            throw new IllegalArgumentException("searches must be a non-empty array");
        }
        String defaultIndex = optionalString(args, "index");
        StringBuilder ndjson = new StringBuilder();
        for (Object item : (List<?>) raw) {
            if (!(item instanceof Map)) throw new IllegalArgumentException("each search must be an object");
            Map<?, ?> search = (Map<?, ?>) item;
            String index = optionalString(search, "index");
            if ((index == null || index.isEmpty()) && defaultIndex != null) index = defaultIndex;
            if (index == null || index.isEmpty()) throw new IllegalArgumentException("each search needs index");
            Map<String, Object> header = new LinkedHashMap<>();
            header.put("index", index);
            ndjson.append(objectMapper.writeValueAsString(header)).append('\n');
            Map<String, Object> body = new LinkedHashMap<>();
            Object rawBody = search.get("body");
            if (rawBody != null) {
                Object parsed = rawBody instanceof String
                        ? objectMapper.readValue(((String) rawBody).trim(), Object.class) : rawBody;
                if (!(parsed instanceof Map)) throw new IllegalArgumentException("search body must be an object");
                @SuppressWarnings("unchecked")
                Map<String, Object> parsedBody = (Map<String, Object>) parsed;
                body.putAll(parsedBody);
            }
            Object size = search.get("size");
            if (size instanceof Number) {
                body.put("size", Math.max(1, Math.min(100, ((Number) size).intValue())));
            } else if (!body.containsKey("size")) {
                body.put("size", 10);
            }
            Object clause = queryClause(search.get("query"));
            if (clause != null) body.put("query", clause);
            else if (!body.containsKey("query")) {
                body.put("query", Collections.<String, Object>singletonMap("match_all", Collections.emptyMap()));
            }
            ndjson.append(objectMapper.writeValueAsString(body)).append('\n');
        }
        return ndjson.toString();
    }

    private String bulkNdjson(Map<?, ?> args) throws IOException {
        Object raw = args.get("operations");
        if (!(raw instanceof List) || ((List<?>) raw).isEmpty()) {
            throw new IllegalArgumentException("operations must be a non-empty array");
        }
        String defaultIndex = optionalString(args, "index");
        StringBuilder ndjson = new StringBuilder();
        for (Object item : (List<?>) raw) {
            if (!(item instanceof Map)) throw new IllegalArgumentException("each operation must be an object");
            Map<?, ?> op = (Map<?, ?>) item;
            String action = optionalString(op, "action");
            if (action == null || action.isEmpty()) action = "index";
            action = action.toLowerCase(java.util.Locale.ROOT);
            if (!Arrays.asList("index", "create", "update", "delete").contains(action)) {
                throw new IllegalArgumentException("unsupported bulk action: " + action);
            }
            String index = optionalString(op, "index");
            if ((index == null || index.isEmpty()) && defaultIndex != null) index = defaultIndex;
            if (index == null || index.isEmpty()) throw new IllegalArgumentException("each operation needs index");
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("_index", index);
            String id = optionalString(op, "id");
            if (id != null && !id.isEmpty()) meta.put("_id", id);
            ndjson.append(objectMapper.writeValueAsString(Collections.singletonMap(action, meta))).append('\n');
            if (!"delete".equals(action)) {
                Object document = op.get("document");
                if (document == null) throw new IllegalArgumentException("bulk " + action + " needs document");
                Object parsed = document instanceof String ? objectMapper.readValue((String) document, Object.class) : document;
                if (!(parsed instanceof Map)) throw new IllegalArgumentException("bulk document must be an object");
                Map<String, Object> line = "update".equals(action)
                        ? Collections.singletonMap("doc", parsed) : (Map<String, Object>) parsed;
                ndjson.append(objectMapper.writeValueAsString(line)).append('\n');
            }
        }
        return ndjson.toString();
    }

    private Map<String, String> bulkOpts(Map<?, ?> args) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String key : Arrays.asList("refresh", "pipeline", "timeout", "waitForActiveShards")) {
            String value = optionalString(args, key);
            if (value != null && !value.isEmpty()) out.put(key, value);
        }
        return out;
    }

    /** _update_by_query / _delete_by_query / _reindex 的查询参数；键与服务端方法一致。 */
    /**
     * 批量写（reindex / update_by_query / delete_by_query）的「异步端点 + 续传」形态。
     *
     * <p>为什么不能只靠中断线程：RHLC 的 socket 读不响应 {@link Thread#interrupt()}，
     * 取消后线程仍会握着连接等 ES 返回——那等于「前端说取消了，生产上还在跑」。
     * 因此这里统一走 ES 自己的异步任务端点（{@code wait_for_completion=false}），
     * 立刻拿到 {@code node:num}，随后用短轮询（1s）读进度；取消时对 {@code node:num}
     * 下发 {@code _tasks/{id}/_cancel}，这才是真正停止生产侧写入的手段。</p>
     *
     * <p>用户显式要求 {@code waitForCompletion} 时保留原语义（由调用方自担长等待）。</p>
     */
    private Map<String, Object> runBatchAsyncAware(String kind, String index, String body,
                                                   Map<String, String> opts) throws IOException {
        McpTaskRegistry.TaskControl control = ACTIVE_CONTROL.get();
        boolean callerChoseWait = opts.containsKey("waitForCompletion");
        if (control == null || callerChoseWait) {
            return dispatchBatch(kind, index, body, opts);
        }
        Map<String, String> asyncOpts = new LinkedHashMap<>(opts);
        asyncOpts.put("waitForCompletion", "false");
        Map<String, Object> submitted = dispatchBatch(kind, index, body, asyncOpts);
        String esTaskId = firstTaskId(submitted);
        if (esTaskId == null) return submitted; /* 少数集群直接同步返回结果 */
        control.attachEsTask(esTaskId);
        control.stage("polling");
        long deadline = System.currentTimeMillis() + taskRegistry.callTimeoutMs();
        long nextReport = 0L;
        while (System.currentTimeMillis() < deadline) {
            if (control.cancelled()) {
                cancelEsTask(esTaskId, null);
                throw new McpTaskRegistry.TaskCancelled(control.cancelReason());
            }
            Map<String, Object> detail = esIndexAdmin.taskDetail(esTaskId);
            Map<String, Object> task = detail.get("task") instanceof Map
                    ? asMapObject(detail.get("task")) : detail;
            boolean completed = Boolean.TRUE.equals(task.get("completed"));
            Map<String, Object> status = asMapObject(task.get("status"));
            if (completed) {
                Map<String, Object> out = new LinkedHashMap<>(submitted);
                out.put("taskId", esTaskId);
                out.put("completed", Boolean.TRUE);
                out.put("tookMs", status.get("took"));
                for (String key : Arrays.asList("created", "updated", "deleted", "version_conflicts", "failures")) {
                    if (status.containsKey(key)) out.put(key, status.get(key));
                }
                return out;
            }
            long now = System.currentTimeMillis();
            if (now >= nextReport) {
                Map<String, Object> progress = new LinkedHashMap<>();
                progress.put("phase", kind);
                progress.put("esTaskId", esTaskId);
                progress.put("total", status.get("total"));
                progress.put("completed", status.get("created") != null ? status.get("created")
                        : status.get("updated") != null ? status.get("updated") : status.get("deleted"));
                progress.put("batches", status.get("batches"));
                progress.put("retries", status.get("retries"));
                control.progress(progress);
                nextReport = now + 1_000L;
            }
            try {
                Thread.sleep(250L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new McpTaskRegistry.TaskCancelled(control.cancelReason());
            }
        }
        cancelEsTask(esTaskId, null);
        throw new IllegalStateException("MCP_CALL_TIMEOUT: 批量任务超过 "
                + taskRegistry.callTimeoutMs() + "ms 预算，已取消 ES 任务 " + esTaskId);
    }

    private Map<String, Object> dispatchBatch(String kind, String index, String body,
                                              Map<String, String> opts) throws IOException {
        if ("reindex".equals(kind)) return esIndexAdmin.reindexAdvanced(body, opts);
        if ("update_by_query".equals(kind)) return esIndexAdmin.updateByQuery(index, body, opts);
        return esIndexAdmin.deleteByQuery(index, body, opts);
    }

    /** 从提交回执里取 ES 任务 id：{@code {task:"node:num"}} 或 {@code {taskId:"node:num"}}。 */
    private static String firstTaskId(Map<String, Object> submitted) {
        if (submitted == null) return null;
        Object direct = submitted.get("taskId");
        if (direct == null) direct = submitted.get("task");
        if (direct instanceof Map) direct = ((Map<?, ?>) direct).get("id");
        if (direct == null) return null;
        String value = String.valueOf(direct).trim();
        return value.contains(":") ? value : null;
    }

    private Map<String, String> queryOpts(Map<?, ?> args) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String key : Arrays.asList("conflicts", "slices", "refresh", "waitForCompletion",
                "requestsPerSecond", "scroll", "timeout", "waitForActiveShards", "maxDocs")) {
            Object value = args.get(key);
            if (value != null && !String.valueOf(value).trim().isEmpty()) {
                out.put(key, String.valueOf(value).trim());
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private String searchBody(Map<?, ?> args) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        Object rawBody = args.get("body");
        if (rawBody != null) {
            Object parsed = rawBody instanceof String
                    ? objectMapper.readValue(((String) rawBody).trim(), Object.class) : rawBody;
            if (!(parsed instanceof Map)) {
                throw new IllegalArgumentException("body must be an object or a JSON object string");
            }
            body.putAll((Map<String, Object>) parsed);
        }
        Object size = args.get("size");
        if (size instanceof Number) {
            body.put("size", Math.max(1, Math.min(100, ((Number) size).intValue())));
        } else if (!body.containsKey("size")) {
            body.put("size", 10);
        }
        Object clause = queryClause(args.get("query"));
        if (clause != null) body.put("query", clause);
        else if (!body.containsKey("query")) body.put("query", Collections.<String, Object>singletonMap("match_all", Collections.emptyMap()));
        return objectMapper.writeValueAsString(body);
    }

    private String sqlBody(Map<?, ?> args) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", requiredString(args, "query"));
        Object fetchSize = args.get("fetchSize");
        if (fetchSize instanceof Number) body.put("fetch_size", Math.max(1, Math.min(5000, ((Number) fetchSize).intValue())));
        return objectMapper.writeValueAsString(body);
    }

    /**
     * 接受查询子句对象，或 JSON 字符串（可以是子句本身，也可以是完整的
     * {@code {"query": ...}} 搜索体）。统一返回子句，供 _search / _explain 包装。
     */
    private Object queryClause(Object raw) throws IOException {
        if (raw == null) return null;
        Object parsed = raw;
        if (raw instanceof String) {
            String text = ((String) raw).trim();
            if (text.isEmpty()) return null;
            parsed = objectMapper.readValue(text, Object.class);
        }
        if (!(parsed instanceof Map)) throw new IllegalArgumentException("query must be an object or a JSON object string");
        Map<?, ?> map = (Map<?, ?>) parsed;
        return map.containsKey("query") ? map.get("query") : map;
    }

    private List<Map<String, Object>> listConnections(AuthContext auth) {
        List<String> allowed = auth.key == null ? null
                : (auth.key.connections == null || auth.key.connections.isEmpty()
                ? Collections.singletonList("host") : auth.key.connections);
        List<Map<String, Object>> out = new ArrayList<>();
        if (hostClusterVisible && (allowed == null || allowed.contains("host"))) {
            Map<String, Object> host = new LinkedHashMap<>();
            host.put("id", "host");
            host.put("name", "Host / control cluster");
            host.put("active", true);
            out.add(host);
        }
        if (connStore != null) {
            try {
                for (Map<String, Object> conn : connStore.list()) {
                    String id = String.valueOf(conn.get("id"));
                    if (allowed != null && !allowed.contains(id)) continue;
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", id);
                    item.put("name", conn.get("name"));
                    item.put("env", conn.get("env"));
                    item.put("minRole", conn.get("minRole"));
                    item.put("active", false);
                    out.add(item);
                }
            } catch (RuntimeException e) {
                /* 控制集群未绑定时仍保留 host；连接目录读取失败不拖垮发现/补全。 */
            }
        }
        return out;
    }

    private String countBody(Map<?, ?> args) throws IOException {
        Object clause = queryClause(args.get("query"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", clause == null
                ? Collections.<String, Object>singletonMap("match_all", Collections.emptyMap()) : clause);
        return objectMapper.writeValueAsString(body);
    }

    private String bodyText(Object raw) throws IOException {
        if (raw == null) return "";
        if (raw instanceof String) return (String) raw;
        return objectMapper.writeValueAsString(raw);
    }

    private String documentJson(Object raw, String key) throws IOException {
        if (raw == null) throw new IllegalArgumentException("Missing required argument: " + key);
        Object parsed = raw instanceof String ? objectMapper.readValue((String) raw, Object.class) : raw;
        if (!(parsed instanceof Map)) throw new IllegalArgumentException(key + " must be an object or a JSON object string");
        return objectMapper.writeValueAsString(parsed);
    }

    /** 可选 JSON 对象参数：缺省/null/空串返回 null，其余必须是对象或 JSON 对象字符串。 */
    private String optionalJson(Object raw, String key) throws IOException {
        if (raw == null) return null;
        if (raw instanceof String && ((String) raw).trim().isEmpty()) return null;
        return jsonObject(raw, key);
    }

    private String jsonObject(Object raw, String key) throws IOException {
        if (raw == null) throw new IllegalArgumentException("Missing required argument: " + key);
        Object parsed = raw instanceof String ? objectMapper.readValue(((String) raw).trim(), Object.class) : raw;
        if (!(parsed instanceof Map)) throw new IllegalArgumentException(key + " must be an object or a JSON object string");
        return objectMapper.writeValueAsString(parsed);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> objectArg(Object raw, String key) throws IOException {
        if (raw == null) throw new IllegalArgumentException("Missing required argument: " + key);
        Object parsed = raw instanceof String ? objectMapper.readValue(((String) raw).trim(), Object.class) : raw;
        if (!(parsed instanceof Map)) throw new IllegalArgumentException(key + " must be an object or a JSON object string");
        return (Map<String, Object>) parsed;
    }

    private String explainBody(Map<?, ?> args) throws IOException {
        Object clause = queryClause(args.get("query"));
        if (clause == null) clause = Collections.singletonMap("match_all", Collections.emptyMap());
        return objectMapper.writeValueAsString(Collections.singletonMap("query", clause));
    }

    private String encodeIndex(Map<?, ?> args) {
        return encodeName(args, "index");
    }

    private String encodeName(Map<?, ?> args, String key) {
        try {
            return java.net.URLEncoder.encode(requiredString(args, key), "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String encodeValue(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** clone/shrink/split 的 body 可选；缺省发空 body，由 ES 使用源索引设置。 */
    private String optionalBody(Map<?, ?> args) throws IOException {
        String body = optionalJson(args.get("body"), "body");
        return body == null ? "" : body;
    }

    /** 管理员走 raw 逃生通道；普通 key 仍走系统管理面守卫并如实报错。 */
    private Map<String, Object> rawOrGuarded(boolean admin, String method, String path, String body)
            throws IOException {
        return admin ? esIndexAdmin.raw(method, path, body) : esIndexAdmin.rawGuarded(method, path, body);
    }

    private String optionalString(Map<?, ?> args, String key) {
        Object value = args.get(key);
        return value == null ? null : String.valueOf(value).trim();
    }

    /** 可选毫秒时间戳（监控时序窗口用）；字符串数字也接受，非法值如实抛错不静默清空。 */
    private Long optionalLong(Map<?, ?> args, String key) {
        Object value = args.get(key);
        if (value == null) return null;
        if (value instanceof Number) return ((Number) value).longValue();
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) return null;
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(key + " 需为毫秒时间戳数字，实际: " + value);
        }
    }

    /** 可选整数（样本数/聚合桶数等）；字符串数字也接受，非法值如实抛错不静默清空；
     *  Number 形态带小数部分直接拒绝（不静默截断，与浏览器/local-mcp 同文案）。 */
    private Integer optionalInteger(Map<?, ?> args, String key) {
        Object value = args.get(key);
        if (value == null) return null;
        if (value instanceof Number) {
            double d = ((Number) value).doubleValue();
            if (d != Math.rint(d)) {
                throw new IllegalArgumentException(key + " 需为正整数，实际: " + value);
            }
            return ((Number) value).intValue();
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) return null;
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(key + " 需为整数，实际: " + value);
        }
    }

    /** 可选正整数（diff_structure 的 autoTunedShards 豁免回传）；非正数如实抛错带字段名。 */
    private Integer optionalPositiveInteger(Map<?, ?> args, String key) {
        Integer value = optionalInteger(args, key);
        if (value != null && value <= 0) {
            throw new IllegalArgumentException(key + " 需为正整数，实际: " + value);
        }
        return value;
    }

    /** 可选字符串数组（diff_structure 的 removedKeys 豁免回传）；元素须为非空字符串，
        空数组视同缺省（服务层两参均空时与 4 参形态完全一致）。 */
    private List<String> optionalNonEmptyStringList(Map<?, ?> args, String key) {
        Object raw = args.get(key);
        if (raw == null) return null;
        if (!(raw instanceof List)) {
            throw new IllegalArgumentException(key + " 需为字符串数组，实际: " + raw);
        }
        List<String> out = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            if (item == null || String.valueOf(item).trim().isEmpty()) {
                throw new IllegalArgumentException(key + " 数组元素必须为非空字符串");
            }
            out.add(String.valueOf(item).trim());
        }
        return out.isEmpty() ? null : out;
    }

    private String requiredString(Map<?, ?> args, String key) {
        Object value = args.get(key);
        if (value == null || String.valueOf(value).trim().isEmpty()) {
            throw new IllegalArgumentException("Missing required argument: " + key);
        }
        return String.valueOf(value).trim();
    }

    private Map<String, Object> toolError(String message) {
        return toolError(message, null);
    }

    /** 工具执行失败的 result 形态：文本 message 保持不变；带 code 时附
        structuredContent:{code,message}（与 REST 端 InternalEsMigrateExceptionAdvice 的
        结构化错误同构，客户端可按 code 精确分支而不解析中文文本）。 */
    private Map<String, Object> toolError(String message, String code) {
        String text = message == null || message.isEmpty() ? "Tool execution failed" : message;
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "text");
        content.put("text", text);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", Collections.singletonList(content));
        if (code != null) {
            Map<String, Object> structured = new LinkedHashMap<>();
            structured.put("code", code);
            structured.put("message", text);
            result.put("structuredContent", structured);
        }
        result.put("isError", true);
        return result;
    }

    /**
     * tools/call 异常 → 结构化 code。与
     * {@code InternalEsMigrateExceptionAdvice}（REST /internal/es/xmigrate 的局部异常
     * 处理）的 message→code 判定同构复制（advice 是 @RestControllerAdvice 专属件不宜
     * 反向依赖，选低耦合方案）；异常类型先分流：IllegalArgumentException=BAD_REQUEST、
     * SecurityException=CONN_FORBIDDEN，IllegalStateException 按消息前缀/包含匹配
     * （服务层消息为固定模板），其余兜底 INTERNAL。
     */
    /** Delegates to the shared mapping so console and host transports report identical codes. */
    static String toolErrorCode(Throwable e) {
        return McpErrors.toolErrorCode(e);
    }

    private Map<String, Object> result(Object id, Object result) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jsonrpc", "2.0");
        out.put("id", id);
        /* MCP 2026-07-28：result 需带 resultType；缺省虽按 complete 处理，仍显式下发。 */
        Object body = result;
        if (result instanceof Map) {
            Map<String, Object> copy = new LinkedHashMap<>((Map<String, Object>) result);
            if (!copy.containsKey("resultType")) copy.put("resultType", "complete");
            body = copy;
        }
        out.put("result", body);
        return out;
    }

    /** 2026-07-28 Tasks 扩展：客户端必须在请求 _meta 中显式声明，服务端绝不向未声明客户端返回任务。 */
    private boolean clientDeclaresTasks(Map<String, Object> request) {
        if (request == null) return false;
        Map<String, Object> meta = asMapObject(request.get("_meta"));
        if (meta.isEmpty()) {
            Map<String, Object> params = asMapObject(request.get("params"));
            meta = asMapObject(params.get("_meta"));
        }
        Map<String, Object> caps = asMapObject(meta.get("io.modelcontextprotocol/clientCapabilities"));
        Map<String, Object> extensions = asMapObject(caps.get("extensions"));
        return extensions.containsKey(TASKS_EXTENSION);
    }

    /** MRTR 的客户端能力来源：2026 请求的 params._meta 或顶层 _meta。 */
    private boolean clientDeclaresElicitation(Map<String, Object> request) {
        if (request == null) return false;
        Map<String, Object> meta = asMapObject(request.get("_meta"));
        if (meta.isEmpty()) {
            meta = asMapObject(asMapObject(request.get("params")).get("_meta"));
        }
        Map<String, Object> caps = asMapObject(meta.get("io.modelcontextprotocol/clientCapabilities"));
        return caps.containsKey("elicitation");
    }

    private boolean mrtrNeedsConfirmation(String toolName, Object callParams) {
        if (!MRTR_CONFIRM_TOOLS.contains(toolName)) return false;
        Map<String, Object> args = asMapObject(asMapObject(callParams).get("arguments"));
        if ("es_rest".equals(toolName)) {
            String method = String.valueOf(args.get("method") == null ? "GET" : args.get("method"))
                    .trim().toUpperCase(Locale.ROOT);
            return !"GET".equals(method) && !"HEAD".equals(method);
        }
        /* 结构同步 dry-run 参数感知：只产出兼容剔除计划、不向目标发 PUT（只读语义），跳过二次确认；
           dryRun=false（缺省）维持 MRTR——真正建索引仍是高危写。 */
        if ("es_xmigrate_sync_structure".equals(toolName) && Boolean.TRUE.equals(args.get("dryRun"))) {
            return false;
        }
        /* smart_sync 预览参数感知：apply=false（缺省）只读预览同步计划，跳过二次确认；
           apply=true 维持 MRTR——真正在目标建索引仍是高危写。 */
        if ("es_xmigrate_smart_sync".equals(toolName) && !Boolean.TRUE.equals(args.get("apply"))) {
            return false;
        }
        return true;
    }

    private Map<String, Object> mrtrInputRequired(String toolName, Map<String, Object> args) {
        Map<String, Object> confirm = new LinkedHashMap<>();
        confirm.put("type", "boolean");
        confirm.put("title", "确认执行");
        confirm.put("description", "该操作可能删除或覆盖数据，确认后才会执行。");
        confirm.put("default", Boolean.FALSE);
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", Collections.singletonMap("confirm", confirm));
        schema.put("required", Collections.singletonList("confirm"));
        Map<String, Object> elicitation = new LinkedHashMap<>();
        elicitation.put("message", "工具 " + toolName + " 是高危写操作，是否继续？");
        elicitation.put("requestedSchema", schema);
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("method", "elicitation/create");
        request.put("params", elicitation);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("resultType", "input_required");
        out.put("inputRequests", Collections.singletonMap("confirm", request));
        out.put("requestState", mrtrSign(toolName, args));
        return out;
    }

    private Map<String, Object> mrtrCancelled(String toolName) {
        Map<String, Object> text = new LinkedHashMap<>();
        text.put("type", "text");
        text.put("text", "已取消：未执行 " + toolName);
        Map<String, Object> structured = new LinkedHashMap<>();
        structured.put("cancelled", Boolean.TRUE);
        structured.put("tool", toolName);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", Collections.singletonList(text));
        out.put("structuredContent", structured);
        out.put("isError", Boolean.FALSE);
        return out;
    }

    private boolean mrtrConfirmed(Object responsesValue) {
        Map<String, Object> responses = asMapObject(responsesValue);
        Map<String, Object> confirm = asMapObject(responses.get("confirm"));
        String action = String.valueOf(confirm.get("action") == null ? "" : confirm.get("action"));
        Map<String, Object> content = asMapObject(confirm.get("content"));
        return "accept".equalsIgnoreCase(action) && Boolean.TRUE.equals(content.get("confirm"));
    }

    private String mrtrSign(String toolName, Map<String, Object> args) {
        long expiresAt = System.currentTimeMillis() + MRTR_STATE_TTL_MS;
        String payload = "v1\n" + toolName + "\n" + mrtrDigest(args) + "\n" + expiresAt;
        String encoded = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return encoded + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(hmacSha256(encoded));
    }

    /** requestState 是攻击者可控输入：验签、绑定工具/参数摘要并检查 5 分钟有效期。 */
    private void verifyMrtrState(String state, String toolName, Map<String, Object> args) {
        int dot = state.lastIndexOf('.');
        if (dot <= 0 || dot == state.length() - 1) {
            throw new IllegalArgumentException("Invalid or missing confirmation state");
        }
        String encoded = state.substring(0, dot);
        String signature = state.substring(dot + 1);
        String expected = Base64.getUrlEncoder().withoutPadding().encodeToString(hmacSha256(encoded));
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
                signature.getBytes(StandardCharsets.US_ASCII))) {
            throw new IllegalArgumentException("Invalid confirmation state signature");
        }
        String payload;
        try {
            payload = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid confirmation state encoding");
        }
        String[] parts = payload.split("\n", -1);
        if (parts.length != 4 || !"v1".equals(parts[0]) || !toolName.equals(parts[1])
                || !mrtrDigest(args).equals(parts[2])) {
            throw new IllegalArgumentException("Confirmation state does not match this tool call");
        }
        long expiresAt;
        try {
            expiresAt = Long.parseLong(parts[3]);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid confirmation state expiry");
        }
        if (expiresAt < System.currentTimeMillis()) {
            throw new IllegalArgumentException("Confirmation state expired; call the tool again");
        }
    }

    private String mrtrDigest(Map<String, Object> args) {
        try {
            String json = objectMapper.writeValueAsString(sortedJson(args));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to compute MRTR arguments digest", e);
        }
    }

    private Object sortedJson(Object value) {
        if (value instanceof Map) {
            Map<String, Object> sorted = new TreeMap<>();
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                sorted.put(String.valueOf(entry.getKey()), sortedJson(entry.getValue()));
            }
            return sorted;
        }
        if (value instanceof List) {
            List<Object> sorted = new ArrayList<>();
            for (Object item : (List<?>) value) sorted.add(sortedJson(item));
            return sorted;
        }
        return value;
    }

    private byte[] hmacSha256(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(mrtrSecret, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to sign MRTR state", e);
        }
    }

    private static byte[] sha256Bytes(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private Map<String, Object> createTaskResult(Object toolResult, AuthContext auth) {
        /* 兼容旧调用点：仅用于内部转包，不创建真任务（真任务见 submitToolTask）。 */
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("taskId", UUID.randomUUID().toString());
        out.put("status", McpTaskRegistry.COMPLETED);
        out.put("ttlMs", TASK_TTL_MS);
        out.put("pollIntervalMs", TASK_POLL_INTERVAL_MS);
        out.put("resultType", "task");
        out.put("result", toolResult);
        return out;
    }

    /**
     * 提交真任务：工作线程里自开目标作用域（ThreadLocal 不跨线程继承），执行整次工具调用。
     * 所有 {@link #TASK_TOOLS} 工具都走这里——客户端拿 {@code working} 立刻返回，
     * 不阻塞 HTTP 线程，也不会因为客户端断线而丢掉已完成的结果。
     */
    private McpTaskRegistry.Task submitToolTask(Object callParams, AuthContext auth, String toolName,
                                                String target, Map<String, Object> auditMeta) {
        final String owner = taskOwner(auth);
        final String requestId = auditMeta == null ? "" : String.valueOf(auditMeta.get("requestId"));
        McpTaskRegistry.Task task = taskRegistry.submit(owner, toolName, target, requestId, control -> {
            control.stage("running");
            McpTargetScope scoped =
                    clientRouter == null ? null : clientRouter.openScope(target);
            ACTIVE_CONTROL.set(control);
            try {
                Map<String, Object> data = callTool(callParams, auth);
                if (control.cancelled()) {
                    /* 取消后结果不冒充成功；取消语义优先于写入完成。 */
                    throw new McpTaskRegistry.TaskCancelled(control.cancelReason());
                }
                attachEsTaskFromResult(control, data);
                Map<String, Object> progress = new LinkedHashMap<>();
                progress.put("phase", "done");
                control.progress(progress);
                return data;
            } catch (McpTaskRegistry.TaskCancelled e) {
                throw e;
            } catch (Exception e) {
                if (control.cancelled()) throw new McpTaskRegistry.TaskCancelled(control.cancelReason());
                throw e;
            } finally {
                ACTIVE_CONTROL.remove();
                if (scoped != null) scoped.close();
            }
        });
        /* 取消钩子：把已知 ES 任务一起撤掉。ES 取消本身也要目标作用域。 */
        task.esCancel = esTaskId -> cancelEsTask(esTaskId, target);
        return task;
    }

    /** 从结果里捞出 ES 任务 id（reindex / by-query / restore 都会回 task 或 taskId）。 */
    private void attachEsTaskFromResult(McpTaskRegistry.TaskControl control, Map<String, Object> data) {
        if (data == null) return;
        Object direct = data.get("taskId");
        if (direct == null) direct = data.get("task");
        if (direct instanceof Map) {
            Object nested = ((Map<?, ?>) direct).get("id");
            direct = nested == null ? null : nested;
        }
        if (direct != null) control.attachEsTask(String.valueOf(direct));
    }

    /** 透传响应体里的异步 task 回执（{@code {"task":"node:num"}}）同样登记，取消时一并撤 ES 任务。 */
    private void attachEsTaskFromRawBody(McpTaskRegistry.TaskControl control, Map<String, Object> data) {
        if (control == null || data == null) return;
        Object body = data.get("body");
        if (!(body instanceof String) || ((String) body).indexOf("\"task\"") < 0) return;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue((String) body, Map.class);
            attachEsTaskFromResult(control, parsed);
        } catch (Exception ignore) {
            /* 透传响应不是 JSON：无任务回执可登记 */
        }
    }

    /** 任务工作线程内的 HTTP abort 登记口；不在任务上下文（无 control）返回 null。 */
    private static java.util.function.Consumer<org.elasticsearch.client.Cancellable> httpCancelSink() {
        McpTaskRegistry.TaskControl control = ACTIVE_CONTROL.get();
        return control == null ? null : cancellable -> control.attachHttpCancel(cancellable::cancel);
    }

    private void cancelEsTask(String esTaskId, String target) {
        McpTargetScope scoped =
                clientRouter == null ? null : clientRouter.openScope(target);
        try {
            esIndexAdmin.cancelTask(esTaskId);
        } catch (Exception e) {
            LOG.warn("[mcp-task] failed to cancel ES task {} on {}", esTaskId, target, e);
        } finally {
            if (scoped != null) scoped.close();
        }
    }

    /** 首次任务回执：只给客户端 taskId 与状态，不内联结果（结果留给 tasks/get 续传）。 */
    private Map<String, Object> taskCreatedEnvelope(McpTaskRegistry.Task task) {
        Map<String, Object> view = taskRegistry.view(task);
        Map<String, Object> out = new LinkedHashMap<>();
        for (String key : Arrays.asList("taskId", "status", "stage", "createdAt", "lastUpdatedAt",
                "deadlineAt", "ttlMs", "pollIntervalMs", "tool")) {
            if (view.containsKey(key)) out.put(key, view.get(key));
        }
        out.put("resultType", "task");
        out.put("cancelMethod", "tasks/cancel");
        return out;
    }

    private Map<String, Object> taskCancelledEnvelope(String toolName, String reason) {
        Map<String, Object> text = new LinkedHashMap<>();
        text.put("type", "text");
        text.put("text", "已取消：未完成 " + toolName + "（" + ("DEADLINE".equals(reason)
                ? "超过单次调用 3 分钟预算，已自动掐断" : "客户端取消") + "）");
        Map<String, Object> structured = new LinkedHashMap<>();
        structured.put("cancelled", Boolean.TRUE);
        structured.put("tool", toolName);
        structured.put("cancelReason", reason == null ? "CLIENT" : reason);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", Collections.singletonList(text));
        out.put("structuredContent", structured);
        out.put("isError", false);
        return out;
    }

    /**
     * 同步调用也要有预算：3 分钟到点即中断工作线程并回 {@code MCP_CALL_TIMEOUT}，
     * 让客户端拿到可判断的错误码而不是悬挂的连接。
     */
    /**
     * 资源读取与补全也会打 ES：与 tools/call 共用同一条 180s 死线和在途任务台账，
     * 客户端可用 {@code notifications/cancelled} 按 requestId 真中断，避免慢集群挂住 HTTP 线程。
     */
    private Map<String, Object> readWithinBudget(String opName, AuthContext auth,
                                                 Map<String, Object> auditMeta,
                                                 McpTaskRegistry.Work body) throws IOException {
        final String owner = taskOwner(auth);
        final String requestId = auditMeta == null ? "" : String.valueOf(auditMeta.get("requestId"));
        McpTaskRegistry.Task task = taskRegistry.submit(owner, opName, "host", requestId, control -> {
            ACTIVE_CONTROL.set(control);
            try {
                return body.run(control);
            } finally {
                ACTIVE_CONTROL.remove();
            }
        });
        task.esCancel = esTaskId -> cancelEsTask(esTaskId, "host");
        try {
            return taskRegistry.await(task, taskRegistry.callTimeoutMs());
        } catch (McpTaskRegistry.TaskCancelled e) {
            throw e;
        } catch (java.util.concurrent.ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof McpTaskRegistry.TaskCancelled) throw (McpTaskRegistry.TaskCancelled) cause;
            if (cause instanceof RuntimeException) throw (RuntimeException) cause;
            if (cause instanceof IOException) throw (IOException) cause;
            if (cause instanceof Error) throw (Error) cause;
            throw new IllegalStateException(cause == null ? e.getMessage() : cause.getMessage(), cause);
        } catch (java.util.concurrent.TimeoutException e) {
            throw new IllegalStateException("MCP_CALL_TIMEOUT: 单次调用超过 "
                    + taskRegistry.callTimeoutMs() + "ms 预算，已自动掐断；长任务请声明 Tasks 扩展开启异步续传");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("MCP_CALL_INTERRUPTED: 调用线程被中断");
        }
    }

    private Map<String, Object> callToolWithinBudget(Object callParams, AuthContext auth,
                                                     String toolName, String target,
                                                     Map<String, Object> auditMeta) throws IOException {
        final String owner = taskOwner(auth);
        /* requestId 必须带上：未声明 Tasks 的客户端靠核心 notifications/cancelled 取消在途调用，
           这里传空串会让那条通知永远匹配不到——「所有请求都能取消」就成了一句空话。 */
        final String requestId = auditMeta == null ? "" : String.valueOf(auditMeta.get("requestId"));
        McpTaskRegistry.Task task = taskRegistry.submit(owner, toolName, target, requestId, control -> {
            /* 工作线程不继承请求线程的 ThreadLocal 目标绑定，必须自己开作用域。 */
            McpTargetScope scoped =
                    clientRouter == null ? null : clientRouter.openScope(target);
            ACTIVE_CONTROL.set(control);
            try {
                Map<String, Object> data = callTool(callParams, auth);
                attachEsTaskFromResult(control, data);
                return data;
            } finally {
                ACTIVE_CONTROL.remove();
                if (scoped != null) scoped.close();
            }
        });
        task.esCancel = esTaskId -> cancelEsTask(esTaskId, target);
        try {
            return taskRegistry.await(task, taskRegistry.callTimeoutMs());
        } catch (McpTaskRegistry.TaskCancelled e) {
            throw e;
        } catch (java.util.concurrent.ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof McpTaskRegistry.TaskCancelled) throw (McpTaskRegistry.TaskCancelled) cause;
            if (cause instanceof RuntimeException) throw (RuntimeException) cause;
            if (cause instanceof Error) throw (Error) cause;
            throw new IllegalStateException(cause == null ? e.getMessage() : cause.getMessage(), cause);
        } catch (java.util.concurrent.TimeoutException e) {
            throw new IllegalStateException("MCP_CALL_TIMEOUT: 单次调用超过 "
                    + taskRegistry.callTimeoutMs() + "ms 预算，已自动掐断；长任务请声明 Tasks 扩展开启异步续传");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("MCP_CALL_INTERRUPTED: 调用线程被中断");
        }
    }

    private Map<String, Object> getTask(Object paramsValue, AuthContext auth) {
        Map<String, Object> params = asMapObject(paramsValue);
        String taskId = String.valueOf(params.get("taskId") == null ? "" : params.get("taskId")).trim();
        if (taskId.isEmpty()) throw new IllegalArgumentException("taskId 不能为空");
        Map<String, Object> task = taskRegistry.view(taskId, taskOwner(auth));
        if (task == null) throw new IllegalArgumentException("任务不存在或不属于当前凭证: " + taskId);
        return task;
    }

    /** tasks/cancel：真中断执行 + 撤 ES 任务；返回取消后的任务视图（幂等）。 */
    private Map<String, Object> cancelTask(Object paramsValue, AuthContext auth) {
        Map<String, Object> params = asMapObject(paramsValue);
        String taskId = String.valueOf(params.get("taskId") == null ? "" : params.get("taskId")).trim();
        if (taskId.isEmpty()) throw new IllegalArgumentException("taskId 不能为空");
        Map<String, Object> task = taskRegistry.cancel(taskId, taskOwner(auth), "CLIENT");
        if (task == null) throw new IllegalArgumentException("任务不存在或不属于当前凭证: " + taskId);
        return task;
    }

    /** notifications/cancelled：按请求 id 取消在途调用（MCP 2025/2026 核心取消语义）。 */
    private void cancelByRequest(Object paramsValue, AuthContext auth) {
        Map<String, Object> params = asMapObject(paramsValue);
        String requestId = String.valueOf(params.get("requestId") == null ? "" : params.get("requestId")).trim();
        if (requestId.isEmpty()) return;
        taskRegistry.cancelByRequestId(requestId, taskOwner(auth));
    }

    private String taskOwner(AuthContext auth) {
        return auth == null || auth.key == null ? "service" : auth.key.id;
    }

    private Map<String, Object> asMapObject(Object value) {
        if (!(value instanceof Map)) return Collections.emptyMap();
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) value;
        return map;
    }

    private Map<String, Object> error(Object id, int code, String message) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("code", code);
        err.put("message", message);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jsonrpc", "2.0");
        out.put("id", id);
        out.put("error", err);
        return out;
    }

    /** 客户端看到的工具面：17 个 action 型分组工具；白名单按「组:action」粒度过滤。 */
    private List<Map<String, Object>> tools(List<String> allowed) {
        List<Map<String, Object>> out = new ArrayList<>();
        boolean compact = compactSurface();
        for (Map.Entry<String, Map<String, String>> group : GROUP_ACTIONS.entrySet()) {
            if (compact && !COMPACT_GROUP_NAMES.contains(group.getKey())) continue;
            List<String> actions = new ArrayList<>();
            for (Map.Entry<String, String> action : group.getValue().entrySet()) {
                if (allowed == null || allowed.contains(TOOL_ACTIONS.get(action.getValue()))) actions.add(action.getKey());
            }
            if (!actions.isEmpty()) out.add(groupTool(group.getKey(), actions));
        }
        return out;
    }

    /** discovery 的推荐列表按凭证实际可见的组收敛，受限 key 不会被推荐未授权的组。 */
    private List<String> recommendedGroups(List<String> allowed) {
        List<String> out = new ArrayList<>();
        boolean compact = compactSurface();
        for (Map.Entry<String, Map<String, String>> group : GROUP_ACTIONS.entrySet()) {
            if (compact && !COMPACT_GROUP_NAMES.contains(group.getKey())) continue;
            for (String legacy : group.getValue().values()) {
                if (allowed == null || allowed.contains(TOOL_ACTIONS.get(legacy))) {
                    out.add(group.getKey());
                    break;
                }
            }
        }
        return out;
    }

    private Map<String, Object> groupTool(String name, List<String> actions) {
        Map<String, Object> properties = new LinkedHashMap<>();
        Map<String, Object> actionProperty = string("string",
                "Action to execute. One of: " + String.join(", ", actions));
        actionProperty.put("enum", actions);
        if ("es_xmigrate".equals(name)) {
            actionProperty.put("description", "Action to execute. One of: " + String.join(", ", actions)
                    + ". 新参语义：smart_sync 支持 mode=create（缺省，目标新建索引）/ incremental"
                    + "（目标已有索引、生产新增字段后补同步）；diff_structure 可回传上次同步报告的"
                    + " autoTunedShards/removedKeys，计划内变更豁免不误报；verify_equivalence 支持"
                    + " structureOnly=true 做纯结构同步后的终局结构验证；smart_sync 预览可携 savePlan=true"
                    + " 把计划落盘并返回 planId；plan_list（只读）列出已存计划，plan_apply 按 planId 执行"
                    + " 已存计划（写，需二次确认，漂移门与 smart_sync apply 相同）。");
        }
        properties.put("action", actionProperty);
        properties.put("connection", string("string",
                "Connection id; optional. Use host for the control cluster, or an id returned by discovery."));
        for (String field : new String[]{"index", "id", "name", "target", "alias", "query", "body", "document",
                "settings", "fields", "method", "path", "taskId", "repo", "snapshot", "policy", "source", "dest",
                "text", "analyzer", "field", "value", "params", "actions", "script", "ids", "documents", "indexes",
                "requests", "slices", "maxDocs", "refresh", "pipeline", "routing", "size", "from", "scroll",
                "waitForCompletion", "include", "exclude", "format", "level", "metric", "verbose"}) {
            properties.putIfAbsent(field, string("string", field + " (action-specific)"));
        }
        /* es_xmigrate 组的专用参数：sync_structure 的 dry-run/别名随迁/分析器回退/计划摘要校验参数，
           smart_sync 的一步式执行/自动整形/目标侧模式参数，diff_structure 的豁免回传参数，
           verify_equivalence 的样本/聚合/纯结构参数，throttle 的速率参数 */
        if ("es_xmigrate".equals(name)) {
            properties.put("dryRun", string("boolean",
                    "sync_structure: true 时只产出兼容剔除计划（planned/advice），不向目标集群发 PUT"));
            properties.put("apply", string("boolean",
                    "smart_sync: true 时执行同步（需写权限与二次确认）；缺省 false 只读预览计划（免写权限）"));
            properties.put("savePlan", string("boolean",
                    "smart_sync: true 时把本次预览计划落盘并在响应里返回 planId（供 plan_list / plan_apply 复用）；"
                            + "仅预览形态可用（apply=false，缺省），apply=true 时带上报 400"));
            properties.put("planId", string("string",
                    "plan_apply: 已存同步计划 id（smart_sync savePlan=true 返回）；计划不存在报 PLAN_NOT_FOUND"));
            properties.put("mode", string("string",
                    "smart_sync 目标侧模式：create（缺省）=目标新建索引；incremental=目标已有索引、生产新增字段后补同步"
                            + "（PUT _mapping 合并 + 动态 settings 白名单更新 + 补别名；目标索引不存在报 DEST_NOT_FOUND）"));
            properties.put("autoTune", string("boolean",
                    "smart_sync: true 时按目标硬件规格自动整形（分片数超目标数据节点数时收敛）；缺省 false"));
            properties.put("autoTunedShards", string("number",
                    "diff_structure: 回传上次 smart_sync 报告的 autoTune 收敛后分片数，分片差异按计划内豁免不误报 unexpected"));
            properties.put("removedKeys", string("array",
                    "diff_structure: 回传上次 smart_sync/sync_structure 报告的计划内剔除/变更键清单（字符串数组），"
                            + "命中 onlyInSource 差异按计划内豁免，复检不被自己的优化误报"));
            properties.put("structureOnly", string("boolean",
                    "verify_equivalence: true=纯结构摘要对比（双侧 settings/mappings canonical 摘要，纯结构同步的终局验证）；"
                            + "缺省 false 做数据等价校验（count+样本摘要+可选聚合）"));
            properties.put("syncAliases", string("boolean",
                    "sync_structure/smart_sync: true 时建索引成功后按源别名逐个随迁（filter/routing 元数据原样）"));
            properties.put("downgradedAnalyzerFallback", string("string",
                    "sync_structure/smart_sync: 降级字段的回退分析器；缺省回退 standard 分析器（normalizer 属性总是剔除）"));
            properties.put("expectPlanDigest", string("string",
                    "sync_structure/smart_sync: 预览返回的 planDigest；仅执行时合法（dryRun=false / apply=true），防预览后源结构漂移；"
                            + "plan_apply: 可选，缺省用计划保存时的 planDigest 做漂移门"));
            properties.put("srcConnId", string("string", "跨集群 action 的源连接档案 id（start/resume/fetch_config/reconcile/verify_equivalence 等）"));
            properties.put("destConnId", string("string", "目标侧连接 id（host=宿主集群；缺省按 action 各自默认，smart_sync 必填）"));
            properties.put("sourceIndex", string("string", "源索引名（旧集群侧）"));
            properties.put("destIndex", string("string", "目标索引名（缺省多与 sourceIndex 同名）"));
            properties.put("jobId", string("string", "迁移作业 id（status/resume/abort/conflicts/throttle/verify_equivalence）"));
            properties.put("sampleSize", string("number", "verify_equivalence: _doc 序取样条数，钳制 10-500（缺省 100）"));
            properties.put("sampleFields", string("string", "verify_equivalence: 参与摘要对比的字段，逗号分隔"));
            properties.put("aggField", string("string", "verify_equivalence: 可选 terms 聚合对比字段"));
            properties.put("aggSize", string("number", "verify_equivalence: 聚合桶数，钳制 1-50（缺省 10）"));
            properties.put("rps", string("string", "throttle: 每秒文档数，-1 表示不限速"));
        }
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", Collections.singletonList("action"));
        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("name", name);
        tool.put("description", groupDescription(name) + " Actions: " + String.join(", ", actions)
                + ". Pass action plus that action's arguments.");
        tool.put("inputSchema", schema);
        /* 组级 annotations 四提示维持既有口径（有写 action 的组 readOnlyHint=false）；
           readOnlyActions 是组内只读 action 名单（混合组的免确认白名单粒度）。 */
        Map<String, Object> servedAnnotations = new LinkedHashMap<>(TOOL_ANNOTATIONS.get(name));
        servedAnnotations.put("readOnlyActions", READ_ONLY_ACTIONS.get(name));
        tool.put("annotations", servedAnnotations);
        Map<String, Object> ui = new LinkedHashMap<>();
        ui.put("resourceUri", MCP_APP_URI);
        tool.put("_meta", Collections.singletonMap("ui", ui));
        return tool;
    }

    private Map<String, Object> string(String type, String description) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", type);
        out.put("description", description);
        return out;
    }
}
