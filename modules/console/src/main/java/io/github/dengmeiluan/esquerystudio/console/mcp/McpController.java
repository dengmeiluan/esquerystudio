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
import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildService;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditQuery;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.DestCreateMode;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateRequest;
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
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
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
 * <p>Transport: JSON-RPC 2.0 over HTTP POST at {@code /mcp}; a GET on the same path
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
@RequestMapping("/mcp")
@ConditionalOnProperty(prefix = "esquerystudio.mcp", name = "enabled", havingValue = "true")
public class McpController {

    private static final Logger LOG = LoggerFactory.getLogger(McpController.class);
    /** 服务级 token 的进程内最近调用（key 调用会持久化到 key.recentCalls）。 */
    private final java.util.Deque<Map<String, Object>> serviceCalls = new java.util.ArrayDeque<>();
    /** 2026-07-28 官方 Tasks 扩展的可选任务台账；仅对显式声明扩展的客户端生效。 */
    private final Map<String, Map<String, Object>> taskLedger = new ConcurrentHashMap<>();
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
    private static final long TASK_TTL_MS = 3_600_000L;
    private static final long TASK_POLL_INTERVAL_MS = 1_000L;
    /** MRTR（multi round-trip requests）：破坏性写操作在支持 elicitation 的 2026 客户端上二次确认。 */
    private static final Set<String> MRTR_CONFIRM_TOOLS = Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(
            "es_delete_by_query", "es_delete_index", "es_delete_doc", "es_delete_data_stream", "es_rest",
            "es_adhoc_start", "es_adhoc_abort", "es_adhoc_confirm_switch",
            "es_adhoc_retry", "es_adhoc_delete_jobs",
            "es_xmigrate_start", "es_xmigrate_resume", "es_xmigrate_abort", "es_xmigrate_delete_jobs",
            "es_xmigrate_sync_structure")));
    private static final long MRTR_STATE_TTL_MS = 300_000L;
    private final byte[] mrtrSecret;
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
     *  通过 /mcp?surface=compact 或 X-MCP-Surface: compact 启用。 */
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
                "connect_check", "es_xmigrate_connect_check", "resolve_preview", "es_xmigrate_resolve_preview",
                "dest_indices", "es_xmigrate_dest_indices", "delete_jobs", "es_xmigrate_delete_jobs",
                "sync_structure", "es_xmigrate_sync_structure",
                "probe_capabilities", "es_xmigrate_probe_capabilities",
                "compare_capabilities", "es_xmigrate_compare_capabilities",
                "diff_structure", "es_xmigrate_diff_structure",
                "verify_equivalence", "es_xmigrate_verify_equivalence",
                "throttle", "es_xmigrate_throttle"));
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
            case "es_xmigrate": return "Cross-cluster migration lifecycle: connect check, resolve preview, preflight, start, progress, job list, fetch source config, count reconcile, conflict samples, dest index list, resume, abort, job cleanup, adaptive structure sync (proactive compat matrix plus target-error pruning, dry-run plan with planDigest and alias sync), target capability probe (vendor/version/plugins/nodes), capability comparison risk matrix, structure diff verification, data equivalence verification (counts, sample hash, optional aggregation) and running-job throttle.";
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
            "es_xmigrate_sync_structure", "es_xmigrate_throttle"));
    /** 可能删除/覆盖数据或中断集群状态的工具；用于 MCP annotations.destructiveHint。 */
    public static final List<String> DESTRUCTIVE_TOOLS = Collections.unmodifiableList(Arrays.asList(
            "es_delete_index", "es_delete_doc", "es_delete_by_query", "es_delete_snapshot",
            "es_restore_snapshot", "es_delete_template", "es_delete_data_stream", "es_delete_transform",
            "es_delete_ingest_pipeline", "es_delete_snapshot_repo", "es_delete_slm_policy", "es_delete_watch",
            "es_delete_ilm_policy", "es_delete_script", "es_bulk", "es_rest",
            "es_adhoc_abort", "es_adhoc_confirm_switch",
            "es_xmigrate_start", "es_xmigrate_abort"));
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
            "esquerystudio://index/{connection}/{index}/mapping"));
    /** 引导提示词；客户端可直接把证据收集步骤交给模型执行。 */
    public static final List<String> PROMPT_NAMES = Collections.unmodifiableList(Arrays.asList(
            "diagnose_slow_query", "design_index_mapping", "migrate_index",
            "review_cluster_capacity", "triage_failed_search", "cross_cloud_structure_sync"));

    private final EsIndexAdmin esIndexAdmin;
    private final String token;
    private final McpAccessService accessService;
    private final io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter;
    private final ConnStore connStore;
    private boolean hostClusterVisible = true;
    private final ObjectMapper objectMapper = new ObjectMapper();
    /** 托管重建（adhoc）作业编排；与 mcpController 同在 ConsoleModeConfiguration 装配，
     *  经 setter 注入避免扩展构造器（宿主/测试多用短构造器直建）。缺位时 adhoc 工具明确报错。 */
    private AdhocRebuildService adhocRebuildService;
    /** 跨集群迁移编排；经 setter 注入，migrate.enabled=false 时缺位，xmigrate 工具明确报错。 */
    private CrossClusterMigrateService crossClusterMigrateService;

    public McpController(EsIndexAdmin esIndexAdmin,
                         @Value("${esquerystudio.mcp.token:}") String token) {
        this(esIndexAdmin, token, null, null, null);
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService) {
        this(esIndexAdmin, token, accessService, null, null);
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter) {
        this(esIndexAdmin, token, accessService, clientRouter, null);
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter,
                         ConnStore connStore) {
        this.esIndexAdmin = esIndexAdmin;
        this.token = token == null ? "" : token.trim();
        this.mrtrSecret = sha256Bytes((this.token.isEmpty() ? "esq-mrtr-" + UUID.randomUUID() : this.token + "|mrtr")
                .getBytes(StandardCharsets.UTF_8));
        this.accessService = accessService;
        this.clientRouter = clientRouter;
        this.connStore = connStore;
    }

    /** 与宿主的 host-cluster-visible 同口径；纯管理平台不把控制集群当数据面目标。 */
    public void setHostClusterVisible(boolean hostClusterVisible) {
        this.hostClusterVisible = hostClusterVisible;
    }

    /** 同容器按类型注入 adhoc 作业编排；宿主自定义装配缺失时保持 null，工具调用处 fail-fast。 */
    @Autowired(required = false)
    public void setAdhocRebuildService(AdhocRebuildService adhocRebuildService) {
        this.adhocRebuildService = adhocRebuildService;
    }

    private void requireAdhocService() {
        if (adhocRebuildService == null) {
            throw new IllegalStateException("Adhoc rebuild service is not available in this deployment");
        }
    }

    /** 跨集群迁移编排注入点；宿主自定义装配缺失时保持 null，工具调用处 fail-fast。 */
    @Autowired(required = false)
    public void setCrossClusterMigrateService(CrossClusterMigrateService crossClusterMigrateService) {
        this.crossClusterMigrateService = crossClusterMigrateService;
    }

    private void requireXmigrateService() {
        if (crossClusterMigrateService == null) {
            throw new IllegalStateException("Cross-cluster migrate service is not available in this deployment");
        }
    }

    /** 连接探活/监控时序服务面；探活关闭或部署缺位时保持 null，工具调用处 fail-fast。 */
    private io.github.dengmeiluan.esquerystudio.console.multicluster.ConnHealthProber connHealthProber;
    private io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorMetricsStore monitorMetricsStore;
    private io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorHistoryStore monitorHistoryStore;
    /** 对账工具源侧临时连旧集群用（与 CrossClusterMigrateService 同一工厂口径）。 */
    private io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory remoteEsClientFactory;

    @Autowired(required = false)
    public void setConnHealthProber(io.github.dengmeiluan.esquerystudio.console.multicluster.ConnHealthProber connHealthProber) {
        this.connHealthProber = connHealthProber;
    }

    @Autowired(required = false)
    public void setMonitorMetricsStore(io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorMetricsStore monitorMetricsStore) {
        this.monitorMetricsStore = monitorMetricsStore;
    }

    @Autowired(required = false)
    public void setMonitorHistoryStore(io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorHistoryStore monitorHistoryStore) {
        this.monitorHistoryStore = monitorHistoryStore;
    }

    @Autowired(required = false)
    public void setRemoteEsClientFactory(io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory remoteEsClientFactory) {
        this.remoteEsClientFactory = remoteEsClientFactory;
    }

    /** 只读辅助工具面（Scout 收尾批）：配置实验室、settings 影响分析、操作审计流水与
     *  环形治理用量；全部经 setter 注入，宿主装配缺位时保持 null，工具调用处 fail-fast。 */
    private io.github.dengmeiluan.esquerystudio.console.validate.ConfigLabService configLabService;
    private io.github.dengmeiluan.esquerystudio.console.insight.InsightService insightService;
    private ConsoleOpsAuditStore consoleOpsAuditStore;
    private io.github.dengmeiluan.esquerystudio.console.multicluster.RingUsageController ringUsageController;

    @Autowired(required = false)
    public void setConfigLabService(io.github.dengmeiluan.esquerystudio.console.validate.ConfigLabService configLabService) {
        this.configLabService = configLabService;
    }

    @Autowired(required = false)
    public void setInsightService(io.github.dengmeiluan.esquerystudio.console.insight.InsightService insightService) {
        this.insightService = insightService;
    }

    @Autowired(required = false)
    public void setConsoleOpsAuditStore(ConsoleOpsAuditStore consoleOpsAuditStore) {
        this.consoleOpsAuditStore = consoleOpsAuditStore;
    }

    @Autowired(required = false)
    public void setRingUsageController(io.github.dengmeiluan.esquerystudio.console.multicluster.RingUsageController ringUsageController) {
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
        if (remoteEsClientFactory == null) {
            throw new IllegalStateException("Remote ES client factory is not available in this deployment");
        }
        try (org.elasticsearch.client.RestHighLevelClient remote = remoteEsClientFactory.build(conn)) {
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET",
                    "/" + sourceIndex + "/_count");
            org.elasticsearch.client.Response resp = remote.getLowLevelClient().performRequest(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = objectMapper.readValue(body, Map.class);
            Object cnt = root.get("count");
            return cnt instanceof Number ? ((Number) cnt).longValue() : null;
        } catch (Exception e) {
            /* 失败信息不回显源集群内网地址（与组内 listIndices 的拓扑脱敏同口径）。 */
            throw new IllegalStateException(io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper
                    .sanitizeTopology("读取源集群文档数失败 [" + sourceIndex + "]: " + e.getMessage()));
        }
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
            out.put("endpoint", "/mcp");
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
                        return ResponseEntity.ok(result(id, cacheable(readResource(request.get("params"), auth))));
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
                    return ResponseEntity.ok(result(id, complete(request.get("params"), auth)));
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
                    io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter.TargetScope scope = null;
                    if (targetAware && clientRouter != null) scope = clientRouter.openScope(target);
                    try {
                        Object toolResult = callTool(callParams, auth);
                        if (toolResult instanceof Map && Boolean.TRUE.equals(((Map<?, ?>) toolResult).get("isError"))) {
                            auditOk[0] = false;
                        }
                        if (toolResult instanceof Map && TASK_TOOLS.contains(toolName) && clientDeclaresTasks(request)) {
                            return ResponseEntity.ok(result(id, createTaskResult(toolResult, auth)));
                        }
                        return ResponseEntity.ok(result(id, toolResult));
                    } catch (Exception e) {
                        auditOk[0] = false;
                        if (auth.key != null) accessService.recordError(auth.key);
                        return ResponseEntity.ok(result(id, toolError(String.valueOf(e.getMessage()))));
                    } finally {
                        if (scope != null) scope.close();
                    }
                case "tasks/get":
                    return ResponseEntity.ok(result(id, getTask(request.get("params"), auth)));
                case "tasks/update":
                case "tasks/cancel":
                    return ResponseEntity.ok(result(id, new LinkedHashMap<String, Object>()));
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
            auditCall(auth, method, auditTool, auditMeta, auditOk[0], System.currentTimeMillis() - auditStarted);
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
                   一次反查到所属 action（签发面新签的 key 已直接落限定名）。 */
                boolean anyRead = key.hasAnyRead();
                boolean anyWrite = key.hasAnyWrite();
                if (key.allowedTools != null) {
                    for (Map.Entry<String, Map<String, String>> group : GROUP_ACTIONS.entrySet()) {
                        for (Map.Entry<String, String> action : group.getValue().entrySet()) {
                            String tool = action.getValue();
                            if (!"ADMIN".equalsIgnoreCase(key.role) && ADMIN_ONLY_TOOLS.contains(tool)) continue;
                            boolean permitted = "es_rest".equals(tool)
                                    ? (anyRead || anyWrite)
                                    : (WRITE_TOOLS.contains(tool) ? anyWrite : anyRead);
                            String qualified = group.getKey() + ":" + action.getKey();
                            if ((key.allowedTools.contains(tool) || key.allowedTools.contains(qualified)) && permitted) {
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
        if (WRITE_TOOLS.contains(toolName)) return true;
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
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes)) return Collections.emptyMap();
        HttpServletRequest request = ((ServletRequestAttributes) attributes).getRequest();
        String remote = request.getRemoteAddr();
        String forwarded = request.getHeader("X-Forwarded-For");
        String ip = forwarded == null || forwarded.trim().isEmpty()
                ? remote : forwarded.split(",")[0].trim();
        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.trim().isEmpty()) {
            requestId = UUID.randomUUID().toString();
        }
        javax.servlet.ServletResponse servletResponse = ((ServletRequestAttributes) attributes).getResponse();
        if (servletResponse instanceof HttpServletResponse && !servletResponse.isCommitted()) {
            ((HttpServletResponse) servletResponse).setHeader("X-Request-Id", requestId);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", truncate(requestId, 80));
        if (ip != null && !ip.trim().isEmpty()) out.put("ip", ip);
        if (remote != null && !remote.equals(ip)) out.put("remoteIp", remote);
        String userAgent = request.getHeader("User-Agent");
        if (userAgent != null && !userAgent.trim().isEmpty()) out.put("ua", truncate(userAgent, 240));
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.trim().isEmpty()) out.put("origin", truncate(origin, 240));
        String uri = request.getRequestURI() == null ? "" : request.getRequestURI();
        out.put("transport", "http");
        out.put("http", request.getMethod() + " " + uri);
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
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes)) return false;
        HttpServletRequest request = ((ServletRequestAttributes) attributes).getRequest();
        String surface = request.getParameter("surface");
        if (surface == null || surface.trim().isEmpty()) {
            surface = request.getHeader("X-MCP-Surface");
        }
        return surface != null && "compact".equalsIgnoreCase(surface.trim());
    }

    private static String resolveServerVersion() {
        String version = McpController.class.getPackage() == null
                ? null : McpController.class.getPackage().getImplementationVersion();
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
        throw new IllegalArgumentException("Unsupported resource URI: " + uri);
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
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter.TargetScope scope =
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
     * 只暴露当前 key 可见的连接，不读 ES，不消耗配额。
     */
    private Map<String, Object> complete(Object paramsValue, AuthContext auth) throws IOException {
        if (!(paramsValue instanceof Map)) throw new IllegalArgumentException("params must be an object");
        Object argumentValue = ((Map<?, ?>) paramsValue).get("argument");
        Map<?, ?> argument = argumentValue instanceof Map ? (Map<?, ?>) argumentValue : Collections.emptyMap();
        String name = argument.get("name") == null ? "" : String.valueOf(argument.get("name")).trim();
        String prefix = argument.get("value") == null ? "" : String.valueOf(argument.get("value")).trim().toLowerCase(java.util.Locale.ROOT);
        List<String> values = new ArrayList<>();
        if ("connection".equals(name)) {
            try {
                for (Map<String, Object> conn : listConnections(auth)) {
                    String id = String.valueOf(conn.get("id"));
                    if (prefix.isEmpty() || id.toLowerCase(java.util.Locale.ROOT).startsWith(prefix)) values.add(id);
                }
            } catch (RuntimeException e) {
                /* 控制集群未绑定或连接目录不可用时返回空补全，不把异常变成协议错误。 */
            }
        } else if ("index".equals(name) || "source".equals(name) || "target".equals(name)) {
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
            description = "Cross-cloud index structure sync workflow: probe both clusters, compare capabilities, plan with dry-run, "
                    + "validate, execute, then verify with structure diff and data equivalence.";
            text = "Cross-cloud index structure sync from `" + srcConnId + "` to `" + destConnId + "`"
                    + (sourceIndex.isEmpty() ? "" : " for index `" + sourceIndex
                    + (destIndex.isEmpty() ? "" : "` → `" + destIndex) + "`") + ".\n\n"
                    + "1. probe_capabilities on source (srcConnId) and target (destConnId) to capture version/vendor/plugins.\n"
                    + "2. compare_capabilities {srcConnId, destConnId} for the risk matrix (vendor change, missing plugins, version gap).\n"
                    + "3. sync_structure {dryRun:true} to preview removals/downgrades and the adapted create body with planDigest.\n"
                    + "4. Optionally es_indices:config_validate on the planned body.\n"
                    + "5. sync_structure {dryRun:false, expectPlanDigest} to execute (requires write permission and confirmation).\n"
                    + "6. migrate_index with destCreateMode NONE when structure is already synced; monitor with jobs/status; reconcile counts.\n"
                    + "7. diff_structure to verify the target matches the plan (expectedRemovals vs unexpected).\n"
                    + "8. verify_equivalence {srcConnId, sourceIndex, destConnId, destIndex, sampleSize, aggField?} for the final data check (counts + sample hash + optional aggregation, verdict must be EQUIVALENT).";
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
                data = esIndexAdmin.sqlQuery(sqlBody(args));
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
                data = esIndexAdmin.forceMerge(requiredString(args, "index"), segments);
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
                data = esIndexAdmin.updateByQuery(requiredString(args, "index"),
                        objectMapper.writeValueAsString(body), queryOpts(args));
                break;
            }
            case "es_delete_by_query": {
                Object query = queryClause(args.get("query"));
                if (query == null) throw new IllegalArgumentException("query is required for delete_by_query");
                data = esIndexAdmin.deleteByQuery(requiredString(args, "index"),
                        objectMapper.writeValueAsString(Collections.singletonMap("query", query)),
                        queryOpts(args));
                break;
            }
            case "es_reindex":
                data = esIndexAdmin.reindexAdvanced(jsonObject(args.get("body"), "body"),
                        queryOpts(args));
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
                   连接级读写已在 resolveTarget 后按目标连接判定，不会因 raw 放开越界到只读生产。 */
                String restMethod = requiredString(args, "method");
                String restPath = requiredString(args, "path");
                String restBody = bodyText(args.get("body"));
                data = isAdmin(auth)
                        ? esIndexAdmin.raw(restMethod, restPath, restBody)
                        : esIndexAdmin.rawGuarded(restMethod, restPath, restBody);
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
                io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter.TargetScope destScope =
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
                   destIndex 缺省与源同名（与 sync_structure 同形），服务层负责回退与回显。 */
                requireXmigrateService();
                String diffSrcConnId = requiredString(args, "srcConnId");
                String diffDestConnId = optionalString(args, "destConnId");
                String diffDestEcho = diffDestConnId == null || "host".equalsIgnoreCase(diffDestConnId)
                        ? null : diffDestConnId;
                data = crossClusterMigrateService.diffStructure(
                        xmigrateSourceConn(diffSrcConnId, auth),
                        requiredString(args, "sourceIndex"),
                        xmigrateDestConn(diffDestEcho, auth),
                        optionalString(args, "destIndex"));
                @SuppressWarnings("unchecked")
                Map<String, Object> diffOut = (Map<String, Object>) data;
                diffOut.put("destConnId", diffDestEcho);
                break;
            }
            case "es_xmigrate_verify_equivalence": {
                /* 数据等价校验（只读）：jobId 形态沿用作业登记的源/目标，或 srcConnId+sourceIndex
                   形态显式指定；服务层按 count 对比、_doc 序 id 样本双侧 mget 后 canonical 摘要
                   逐 id 对比、可选 terms 聚合对比，产出 verdict EQUIVALENT/DIVERGENT/INCONCLUSIVE。 */
                requireXmigrateService();
                String verifyJobId = optionalString(args, "jobId");
                String verifySrcConnId = optionalString(args, "srcConnId");
                if ((verifyJobId == null || verifyJobId.isEmpty())
                        && (verifySrcConnId == null || verifySrcConnId.isEmpty())) {
                    throw new IllegalArgumentException("jobId 与 srcConnId 必须二选一");
                }
                String sampleFieldsRaw = optionalString(args, "sampleFields");
                List<String> sampleFieldsList = new ArrayList<>();
                if (sampleFieldsRaw != null && !sampleFieldsRaw.isEmpty()) {
                    for (String part : sampleFieldsRaw.split(",")) {
                        String field = part.trim();
                        if (!field.isEmpty()) sampleFieldsList.add(field);
                    }
                }
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
                Map<String, Object> ringUsage = new LinkedHashMap<>(ringUsageController.usage(null));
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

    /** 可选整数（样本数/聚合桶数等）；字符串数字也接受，非法值如实抛错不静默清空。 */
    private Integer optionalInteger(Map<?, ?> args, String key) {
        Object value = args.get(key);
        if (value == null) return null;
        if (value instanceof Number) return ((Number) value).intValue();
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) return null;
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(key + " 需为整数，实际: " + value);
        }
    }

    private String requiredString(Map<?, ?> args, String key) {
        Object value = args.get(key);
        if (value == null || String.valueOf(value).trim().isEmpty()) {
            throw new IllegalArgumentException("Missing required argument: " + key);
        }
        return String.valueOf(value).trim();
    }

    private Map<String, Object> toolError(String message) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "text");
        content.put("text", message == null || message.isEmpty() ? "Tool execution failed" : message);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", Collections.singletonList(content));
        result.put("isError", true);
        return result;
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
        String taskId = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        String timestamp = Instant.ofEpochMilli(now).toString();
        Map<String, Object> task = new LinkedHashMap<>();
        task.put("taskId", taskId);
        task.put("status", "completed");
        task.put("createdAt", timestamp);
        task.put("lastUpdatedAt", timestamp);
        task.put("ttlMs", TASK_TTL_MS);
        task.put("pollIntervalMs", TASK_POLL_INTERVAL_MS);
        task.put("result", toolResult);
        task.put("_owner", taskOwner(auth));
        taskLedger.put(taskId, task);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("taskId", taskId);
        out.put("status", "completed");
        out.put("createdAt", timestamp);
        out.put("lastUpdatedAt", timestamp);
        out.put("ttlMs", TASK_TTL_MS);
        out.put("pollIntervalMs", TASK_POLL_INTERVAL_MS);
        out.put("resultType", "task");
        return out;
    }

    private Map<String, Object> getTask(Object paramsValue, AuthContext auth) {
        Map<String, Object> params = asMapObject(paramsValue);
        String taskId = String.valueOf(params.get("taskId") == null ? "" : params.get("taskId")).trim();
        if (taskId.isEmpty()) throw new IllegalArgumentException("taskId 不能为空");
        Map<String, Object> task = taskLedger.get(taskId);
        if (task == null || !taskOwner(auth).equals(task.get("_owner"))) {
            throw new IllegalArgumentException("任务不存在或不属于当前凭证: " + taskId);
        }
        Map<String, Object> out = new LinkedHashMap<>(task);
        out.remove("_owner");
        return out;
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
           verify_equivalence 的样本与聚合参数，throttle 的速率参数 */
        if ("es_xmigrate".equals(name)) {
            properties.put("dryRun", string("boolean",
                    "sync_structure: true 时只产出兼容剔除计划（planned/advice），不向目标集群发 PUT"));
            properties.put("syncAliases", string("boolean",
                    "sync_structure: true 时建索引成功后按源别名逐个随迁（filter/routing 元数据原样）"));
            properties.put("downgradedAnalyzerFallback", string("string",
                    "sync_structure: 降级字段的回退分析器；缺省回退 standard 分析器（normalizer 属性总是剔除）"));
            properties.put("expectPlanDigest", string("string",
                    "sync_structure: dryRun 预览返回的 planDigest；仅 dryRun=false 执行时合法，防预览后源结构漂移"));
            properties.put("srcConnId", string("string", "跨集群 action 的源连接档案 id（start/resume/fetch_config/reconcile/verify_equivalence 等）"));
            properties.put("destConnId", string("string", "目标侧连接 id（host=宿主集群；缺省按 action 各自默认）"));
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
        tool.put("annotations", TOOL_ANNOTATIONS.get(name));
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
