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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * MCP API key 管理面（服务端模式）。
 *
 * <p>权限模型：
 * <ul>
 *   <li>VIEWER 只能查看自己的 key（GET），不能签发；</li>
 *   <li>任意登录人都可为本人签发 key，但连接/工具/连接级读写只能落在本人页面授权内；</li>
 *   <li>ADMIN 可代任意用户签发、查看全部、撤销任意 key；</li>
 *   <li>非 ADMIN 的可用工具受本人页面授权收窄（search / mapping / score-explain 等）。</li>
 * </ul>
 * 路由挂在 {@code /internal/es/index/**} 下，登录态、角色门、审计与环境封顶沿用控制台既有拦截器；
 * 本类只补充业务级的所有权与页面校验，不另造一套认证。</p>
 */
@RestController
@RequestMapping("/internal/es/index/mcp/keys")
public class McpKeyController {

    private static final Map<String, String> TOOL_PAGE = new LinkedHashMap<>();

    static {
        TOOL_PAGE.put("es_list_connections", "overview");
        TOOL_PAGE.put("es_list_indices", "indices");
        TOOL_PAGE.put("es_cluster_health", "overview");
        TOOL_PAGE.put("es_get_mapping", "mapping");
        TOOL_PAGE.put("es_get_doc", "browser");
        TOOL_PAGE.put("es_get_settings", "mapping");
        TOOL_PAGE.put("es_get_aliases", "aliases");
        TOOL_PAGE.put("es_list_templates", "templates");
        TOOL_PAGE.put("es_list_nodes", "topology");
        TOOL_PAGE.put("es_list_tasks", "tasks");
        TOOL_PAGE.put("es_index_recovery", "indices");
        TOOL_PAGE.put("es_cat_shards", "topology");
        TOOL_PAGE.put("es_cluster_state", "topology");
        TOOL_PAGE.put("es_mtermvectors", "query-xray");
        TOOL_PAGE.put("es_index_segments", "indices");
        TOOL_PAGE.put("es_list_transforms", "reindex-advanced");
        TOOL_PAGE.put("es_get_transform", "reindex-advanced");
        TOOL_PAGE.put("es_transform_stats", "reindex-advanced");
        TOOL_PAGE.put("es_put_transform", "reindex-advanced");
        TOOL_PAGE.put("es_start_transform", "reindex-advanced");
        TOOL_PAGE.put("es_stop_transform", "reindex-advanced");
        TOOL_PAGE.put("es_delete_transform", "reindex-advanced");
        TOOL_PAGE.put("es_get_index_stats", "indices");
        TOOL_PAGE.put("es_search", "search");
        TOOL_PAGE.put("es_count", "search");
        TOOL_PAGE.put("es_sql", "search");
        TOOL_PAGE.put("es_explain_doc", "score-explain");
        TOOL_PAGE.put("es_index_doc", "browser");
        TOOL_PAGE.put("es_update_doc", "browser");
        TOOL_PAGE.put("es_delete_doc", "browser");
        TOOL_PAGE.put("es_msearch", "search");
        TOOL_PAGE.put("es_mget", "search");
        TOOL_PAGE.put("es_scroll_start", "search");
        TOOL_PAGE.put("es_scroll_next", "search");
        TOOL_PAGE.put("es_scroll_clear", "search");
        TOOL_PAGE.put("es_resolve_index", "indices");
        TOOL_PAGE.put("es_search_shards", "search");
        TOOL_PAGE.put("es_rank_eval", "rank-debug");
        TOOL_PAGE.put("es_cluster_stats", "overview");
        TOOL_PAGE.put("es_refresh_index", "indices");
        TOOL_PAGE.put("es_flush_index", "indices");
        TOOL_PAGE.put("es_index_close", "indices");
        TOOL_PAGE.put("es_index_open", "indices");
        TOOL_PAGE.put("es_bulk", "bulk");
        TOOL_PAGE.put("es_terms_enum", "search");
        TOOL_PAGE.put("es_field_caps", "search");
        TOOL_PAGE.put("es_task_cancel", "tasks");
        TOOL_PAGE.put("es_sql_cursor", "search");
        TOOL_PAGE.put("es_sql_close", "search");
        TOOL_PAGE.put("es_sql_translate", "search");
        TOOL_PAGE.put("es_pit_open", "search");
        TOOL_PAGE.put("es_pit_search", "search");
        TOOL_PAGE.put("es_pit_close", "search");
        TOOL_PAGE.put("es_create_index", "indices");
        TOOL_PAGE.put("es_delete_index", "indices");
        TOOL_PAGE.put("es_put_mapping", "mapping");
        TOOL_PAGE.put("es_update_settings", "mapping");
        TOOL_PAGE.put("es_alias", "aliases");
        TOOL_PAGE.put("es_rollover", "aliases");
        TOOL_PAGE.put("es_force_merge", "optimizer");
        TOOL_PAGE.put("es_put_template", "templates");
        TOOL_PAGE.put("es_delete_template", "templates");
        TOOL_PAGE.put("es_list_component_templates", "templates");
        TOOL_PAGE.put("es_list_data_streams", "indices");
        TOOL_PAGE.put("es_get_data_stream", "indices");
        TOOL_PAGE.put("es_data_stream_stats", "indices");
        TOOL_PAGE.put("es_create_data_stream", "indices");
        TOOL_PAGE.put("es_delete_data_stream", "indices");
        TOOL_PAGE.put("es_clone_index", "indices");
        TOOL_PAGE.put("es_shrink_index", "indices");
        TOOL_PAGE.put("es_split_index", "indices");
        TOOL_PAGE.put("es_update_by_query", "update-by-query");
        TOOL_PAGE.put("es_delete_by_query", "update-by-query");
        TOOL_PAGE.put("es_reindex", "reindex-advanced");
        TOOL_PAGE.put("es_analyze", "analyze");
        TOOL_PAGE.put("es_validate_query", "query-xray");
        TOOL_PAGE.put("es_term_vectors", "query-xray");
        TOOL_PAGE.put("es_search_template", "search-templates");
        TOOL_PAGE.put("es_render_template", "search-templates");
        TOOL_PAGE.put("es_analysis_settings", "analysis-settings");
        TOOL_PAGE.put("es_update_analysis_settings", "analysis-settings");
        TOOL_PAGE.put("es_reload_analyzers", "analysis-settings");
        TOOL_PAGE.put("es_synonyms_upsert", "synonyms");
        TOOL_PAGE.put("es_reindex_preview", "reindex-advanced");
        TOOL_PAGE.put("es_index_settings_defaults", "index-settings");
        TOOL_PAGE.put("es_index_detail", "indices");
        TOOL_PAGE.put("es_allocation_explain", "diag");
        TOOL_PAGE.put("es_shard_stores", "topology");
        TOOL_PAGE.put("es_pending_tasks", "tasks");
        TOOL_PAGE.put("es_slm_policies", "snapshots");
        TOOL_PAGE.put("es_put_slm_policy", "snapshots");
        TOOL_PAGE.put("es_delete_slm_policy", "snapshots");
        TOOL_PAGE.put("es_slm_status", "snapshots");
        TOOL_PAGE.put("es_slm_execute", "snapshots");
        TOOL_PAGE.put("es_nodes_stats", "topology");
        TOOL_PAGE.put("es_hot_threads", "diag");
        TOOL_PAGE.put("es_remote_clusters", "remote-clusters");
        TOOL_PAGE.put("es_plugins", "diag");
        TOOL_PAGE.put("es_watcher", "watcher");
        TOOL_PAGE.put("es_put_watch", "watcher");
        TOOL_PAGE.put("es_delete_watch", "watcher");
        TOOL_PAGE.put("es_execute_watch", "watcher");
        TOOL_PAGE.put("es_ingest_pipelines", "diag");
        TOOL_PAGE.put("es_put_ingest_pipeline", "diag");
        TOOL_PAGE.put("es_delete_ingest_pipeline", "diag");
        TOOL_PAGE.put("es_cat_allocation", "topology");
        TOOL_PAGE.put("es_get_cluster_settings", "cluster-settings");
        TOOL_PAGE.put("es_update_cluster_settings", "cluster-settings");
        TOOL_PAGE.put("es_reroute", "cluster-settings");
        TOOL_PAGE.put("es_list_snapshot_repos", "snapshots");
        TOOL_PAGE.put("es_put_snapshot_repo", "snapshots");
        TOOL_PAGE.put("es_delete_snapshot_repo", "snapshots");
        TOOL_PAGE.put("es_list_snapshots", "snapshots");
        TOOL_PAGE.put("es_snapshot_status", "snapshots");
        TOOL_PAGE.put("es_create_snapshot", "snapshots");
        TOOL_PAGE.put("es_delete_snapshot", "snapshots");
        TOOL_PAGE.put("es_restore_snapshot", "snapshots");
        TOOL_PAGE.put("es_ilm_policies", "ilm");
        TOOL_PAGE.put("es_ilm_explain", "ilm");
        TOOL_PAGE.put("es_ilm_status", "ilm");
        TOOL_PAGE.put("es_put_ilm_policy", "ilm");
        TOOL_PAGE.put("es_delete_ilm_policy", "ilm");
        TOOL_PAGE.put("es_ilm_move", "ilm");
        TOOL_PAGE.put("es_ilm_start", "ilm");
        TOOL_PAGE.put("es_ilm_stop", "ilm");
        TOOL_PAGE.put("es_list_scripts", "painless-lab");
        TOOL_PAGE.put("es_put_script", "painless-lab");
        TOOL_PAGE.put("es_delete_script", "painless-lab");
        TOOL_PAGE.put("es_task_detail", "tasks");
        TOOL_PAGE.put("es_rest", "devtools");
    }

    private final McpKeyStore store;
    private final ConnStore connStore;
    private final McpKeyOwnerResolver ownerResolver;
    private final McpSecretCipher secretCipher;
    private final McpCallAuditStore auditStore;
    private final McpAccessService accessService;
    private boolean hostClusterVisible = true;

    /**
     * 本次签发的权限边界：adminSelf=调用者为自己签发（ADMIN 全量授权）；
     * 其余情况 pages/role 是「实际控制人」的页面授权与角色——非 ADMIN 为本人，
     * ADMIN 代签时为归属用户。pages==null 表示不做页面收窄（角色模型）。
     */
    private static final class Scope {
        private final boolean adminSelf;
        private final boolean delegated;
        private final Set<String> pages;
        private final ConsoleRole role;

        private Scope(boolean adminSelf, boolean delegated, Set<String> pages, ConsoleRole role) {
            this.adminSelf = adminSelf;
            this.delegated = delegated;
            this.pages = pages;
            this.role = role;
        }
    }

    public McpKeyController(McpKeyStore store) {
        this(store, null);
    }

    public McpKeyController(McpKeyStore store, ConnStore connStore) {
        this(store, connStore, null);
    }

    public McpKeyController(McpKeyStore store, ConnStore connStore, McpKeyOwnerResolver ownerResolver) {
        this(store, connStore, ownerResolver, null);
    }

    public McpKeyController(McpKeyStore store, ConnStore connStore, McpKeyOwnerResolver ownerResolver,
                            McpSecretCipher secretCipher) {
        this(store, connStore, ownerResolver, secretCipher, null, null);
    }

    public McpKeyController(McpKeyStore store, ConnStore connStore, McpKeyOwnerResolver ownerResolver,
                            McpSecretCipher secretCipher, McpCallAuditStore auditStore,
                            McpAccessService accessService) {
        this.store = store;
        this.connStore = connStore;
        this.ownerResolver = ownerResolver;
        this.secretCipher = secretCipher;
        this.auditStore = auditStore == null ? McpCallAuditStore.noop() : auditStore;
        this.accessService = accessService;
    }

    public void setHostClusterVisible(boolean hostClusterVisible) {
        this.hostClusterVisible = hostClusterVisible;
    }

    @GetMapping
    public ResponseEntity<?> list(HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;

        boolean admin = isAdmin(principal);
        List<Map<String, Object>> keys = new ArrayList<>();
        for (Map<String, Object> key : store.list()) {
            if (admin || principal.getUsername().equals(key.get("owner"))) keys.add(enrichConnectionNames(key));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("keys", keys);
        out.put("canManageAll", admin);
        out.put("caller", caller(principal));
        out.put("limits", limits(principal));
        out.put("availableTools", availableTools(principal));
        out.put("adminOnlyTools", admin ? McpController.ADMIN_ONLY_TOOLS : Collections.emptyList());
        out.put("availableConnections", availableConnections(principal));
        out.put("auditRetentionDays", accessService == null ? 30 : accessService.auditRetentionDays());
        return ResponseEntity.ok(out);
    }

    /**
     * 持久化调用审计（一次调用一条，默认保留 30 天，最低 7 天）。
     * ADMIN 可看全部；普通用户只看自己的 key。UI 审计页直接消费本端点。
     */
    @GetMapping("/calls")
    public ResponseEntity<?> calls(
            @org.springframework.web.bind.annotation.RequestParam(value = "keyId", required = false) String keyId,
            @org.springframework.web.bind.annotation.RequestParam(value = "limit", defaultValue = "500") int limit,
            HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        boolean admin = isAdmin(principal);
        int size = Math.max(1, Math.min(limit, 2000));
        List<Map<String, Object>> rows = new ArrayList<>();
        String wanted = keyId == null ? "" : keyId.trim();
        if (!wanted.isEmpty()) {
            McpKeyRecord record = store.find(wanted);
            if (record == null) return error(404, "NOT_FOUND", "密钥不存在");
            if (!admin && !principal.getUsername().equals(record.owner)) {
                return error(403, "FORBIDDEN", "只能查看自己的 key 审计");
            }
            rows.addAll(auditStore.list(wanted, size));
        } else if (admin) {
            rows.addAll(auditStore.list(null, size));
        } else {
            for (Map<String, Object> key : store.list()) {
                if (!principal.getUsername().equals(key.get("owner"))) continue;
                rows.addAll(auditStore.list(String.valueOf(key.get("id")), size));
            }
            rows.sort((a, b) -> Long.compare(numberValue(b.get("at")), numberValue(a.get("at"))));
            if (rows.size() > size) rows = new ArrayList<>(rows.subList(0, size));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("calls", rows);
        out.put("count", rows.size());
        out.put("retentionDays", accessService == null ? 30 : accessService.auditRetentionDays());
        out.put("source", "persistent");
        return ResponseEntity.ok(out);
    }

    private long numberValue(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }

    /**
     * 取回完整 key：新版本签发/轮换时已加密落盘，owner 与 ADMIN 可随时复制。
     * 旧版本 key 没有密文，返回 409 让 UI 明确提示「只能轮换后才能回显」。
     */
    @GetMapping("/{id}/secret")
    public ResponseEntity<?> revealSecret(@PathVariable("id") String id, HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        McpKeyRecord record = store.find(id);
        if (record == null) return error(404, "NOT_FOUND", "密钥不存在");
        if (!isAdmin(principal) && !principal.getUsername().equals(record.owner)) {
            return error(403, "FORBIDDEN", "只能查看自己的 key");
        }
        if (secretCipher == null || record.secretEncrypted == null || record.secretEncrypted.trim().isEmpty()) {
            return error(409, "MCP_KEY_SECRET_NOT_SAVED",
                    "该 key 由旧版本签发，完整值未曾保存；轮换后可永久复制（旧 key 立即失效）");
        }
        String secret = secretCipher.decrypt(record.secretEncrypted);
        if (secret == null || secret.trim().isEmpty()) {
            return error(409, "MCP_KEY_SECRET_UNREADABLE",
                    "完整 key 解密失败（主密钥变化或密文损坏）；请轮换该 key 重新保存");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", record.id);
        out.put("prefix", record.prefix);
        out.put("secret", secret);
        out.put("secretSaved", true);
        return ResponseEntity.ok(out);
    }

    /**
     * ADMIN 代签前的目标用户范围预览：角色 + 页面授权可解析性 + 可签发连接/工具。
     * 非 ADMIN 只允许查看本人（等价于 list 的 available* 字段）。
     */
    @GetMapping("/owner-scope")
    public ResponseEntity<?> ownerScope(@org.springframework.web.bind.annotation.RequestParam(
                                               value = "owner", required = false) String owner,
                                       HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        boolean admin = isAdmin(principal);
        String target = owner == null ? "" : owner.trim();
        boolean self = target.isEmpty() || target.equals(principal.getUsername());
        if (!self && !admin) return error(403, "FORBIDDEN", "只有 ADMIN 可以查看其他用户的签发范围");
        ConsoleRole role = self ? principal.getRole() : resolveOwnerRole(true, target, principal);
        Set<String> pages = self ? principal.getGrantedPages() : resolveOwnerPages(target);
        boolean unrestricted = admin && self;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("owner", self ? principal.getUsername() : target);
        out.put("role", role == null ? null : role.name());
        out.put("roleResolved", role != null);
        out.put("pagesKnown", pages != null);
        List<Map<String, Object>> scopedConnections = availableConnectionsFor(unrestricted, role, pages);
        if (!self && pages == null && (role == null || !role.atLeast(ConsoleRole.ADMIN))) {
            /* 目标用户页面授权不可解析时，与签发逻辑一致：只允许宿主连接（fail-closed）。 */
            scopedConnections.removeIf(connection -> !"host".equals(String.valueOf(connection.get("id"))));
        }
        out.put("connections", scopedConnections);
        out.put("availableTools", availableToolsFor(unrestricted, pages, role));
        out.put("limits", limitsFor(role == null ? ConsoleRole.VIEWER : role));
        List<String> writable = new ArrayList<>();
        for (Map<String, Object> connection : (List<Map<String, Object>>) out.get("connections")) {
            if (Boolean.TRUE.equals(connection.get("write"))) writable.add(String.valueOf(connection.get("id")));
        }
        out.put("writeConnections", writable);
        return ResponseEntity.ok(out);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody(required = false) Map<String, Object> body,
                                    HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        if (body == null) return error(400, "BAD_REQUEST", "缺少请求体");

        boolean admin = isAdmin(principal);
        String name = text(body.get("name"));
        if (name.isEmpty()) return error(400, "BAD_REQUEST", "密钥名称不能为空");
        if (name.length() > 80) return error(400, "BAD_REQUEST", "密钥名称最长 80 字符");

        String owner = text(body.get("owner"));
        if (owner.isEmpty()) owner = principal.getUsername();
        if (!admin && !principal.getUsername().equals(owner)) {
            return error(403, "FORBIDDEN", "只有 ADMIN 可以为其他用户签发 key");
        }

        ConsoleRole role;
        try {
            String roleText = text(body.get("role"));
            role = roleText.isEmpty()
                    ? (admin ? ConsoleRole.VIEWER : principal.getRole())
                    : parseRole(roleText);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        }
        if (!admin && !principal.getRole().atLeast(role)) {
            return error(403, "FORBIDDEN", "不能签发高于本人角色的 key");
        }
        ConsoleRole ownerRole = resolveOwnerRole(admin, owner, principal);
        if (admin && !owner.equals(principal.getUsername()) && ownerRole == null && role != ConsoleRole.VIEWER) {
            /* 宿主未提供目标用户角色解析时 fail-closed：只能代签 VIEWER，不能靠请求体自报高角色。 */
            return error(403, "FORBIDDEN",
                    "无法确认目标用户 " + owner + " 的角色，只能代签 VIEWER key");
        }
        if (admin && ownerRole != null && !ownerRole.atLeast(role)) {
            return error(403, "FORBIDDEN",
                    "目标用户 " + owner + " 的角色为 " + ownerRole.name() + "，不能签发更高角色 " + role.name() + " 的 key");
        }

        Scope scope = scopeFor(admin, owner, principal, ownerRole);
        List<String> permissions;
        List<String> connections;
        Map<String, List<String>> connectionPermissions;
        try {
            permissions = parsePermissions(body.get("permissions"), principal);
            connections = parseConnections(body.get("connections"), principal, scope);
            connectionPermissions = parseConnectionPermissions(
                    body.get("connectionPermissions"), connections, principal, scope);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        } catch (SecurityException e) {
            return error(403, "FORBIDDEN", e.getMessage());
        }
        String ownerWriteError = admin && !owner.equals(principal.getUsername())
                ? validateOwnerWrite(owner, ownerRole, scope, permissions, connectionPermissions, connections) : null;
        if (ownerWriteError != null) return error(403, "FORBIDDEN", ownerWriteError);

        String connectionRoleError = validateConnectionRoles(connections, role);
        if (connectionRoleError != null) return error(400, "BAD_REQUEST", connectionRoleError);

        List<String> tools;
        try {
            tools = allowedTools(body.get("allowedTools"), principal, role, permissions, connectionPermissions,
                    connections, scope);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        } catch (SecurityException e) {
            return error(403, "FORBIDDEN", e.getMessage());
        }
        if (tools.isEmpty()) return error(400, "BAD_REQUEST", "至少选择一个工具");
        String writeCoverageError = validateWriteToolPageCoverage(tools, connections, permissions,
                connectionPermissions, scope);
        if (writeCoverageError != null) return error(403, "FORBIDDEN", writeCoverageError);

        boolean delegatedIssue = admin && !owner.equals(principal.getUsername());
        ConsoleRole quotaRole = delegatedIssue
                ? (ownerRole == null ? ConsoleRole.VIEWER : ownerRole) : principal.getRole();
        Map<String, Object> caps = limitsFor(quotaRole);
        int rpm = intValue(body.get("requestsPerMinute"), 60);
        long daily = longValue(body.get("dailyQuota"), 5000L);
        long monthly = longValue(body.get("monthlyQuota"), 100000L);
        if (rpm < 1 || rpm > ((Number) caps.get("maxRequestsPerMinute")).intValue()) {
            return error(400, "BAD_REQUEST", "requestsPerMinute 超出当前角色上限");
        }
        if (daily < 1 || daily > ((Number) caps.get("maxDailyQuota")).longValue()) {
            return error(400, "BAD_REQUEST", "dailyQuota 超出当前角色上限");
        }
        if (monthly < 1 || monthly > ((Number) caps.get("maxMonthlyQuota")).longValue()) {
            return error(400, "BAD_REQUEST", "monthlyQuota 超出当前角色上限");
        }

        long expiresInDays = longValue(body.get("expiresInDays"), 0L);
        long maxDays = ((Number) caps.get("maxExpiresInDays")).longValue();
        if (expiresInDays < 0 || expiresInDays > maxDays) {
            return error(400, "BAD_REQUEST", "expiresInDays 超出当前角色上限（0=不过期）");
        }
        Long expiresAt = expiresInDays <= 0 ? null
                : System.currentTimeMillis() + expiresInDays * 86_400_000L;

        int ownedActive = 0;
        for (Map<String, Object> existing : store.list()) {
            if (owner.equals(existing.get("owner")) && Boolean.TRUE.equals(existing.get("enabled"))
                    && !Boolean.TRUE.equals(existing.get("expired"))) {
                ownedActive++;
            }
        }
        int maxKeys = quotaRole.atLeast(ConsoleRole.ADMIN) ? 100 : 10;
        if (ownedActive >= maxKeys) {
            return error(429, "MCP_KEY_LIMIT",
                    "每个用户的活跃 key 上限为 " + maxKeys + "；请先撤销不再使用的 key");
        }

        connectionPermissions = normalizeConnectionPermissions(connections, permissions, connectionPermissions);
        Map<String, Object> created = store.create(name, owner, role.name(), tools, connections, permissions,
                connectionPermissions, rpm, daily, monthly, expiresAt);
        store.invalidate();
        Object createdKey = created.get("key");
        if (createdKey instanceof Map) {
            String createdId = String.valueOf(((Map<?, ?>) createdKey).get("id"));
            audit(createdId, "create", principal);
            McpKeyRecord afterCreate = store.find(createdId);
            if (afterCreate != null) {
                Map<String, Object> response = new LinkedHashMap<>(created);
                response.put("key", afterCreate.redacted(System.currentTimeMillis()));
                created = response;
            }
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable("id") String id,
                                    @RequestBody(required = false) Map<String, Object> body,
                                    HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        if (body == null) return error(400, "BAD_REQUEST", "缺少请求体");
        McpKeyRecord record = store.find(id);
        if (record == null) return error(404, "NOT_FOUND", "密钥不存在");
        boolean admin = isAdmin(principal);
        if (!admin && !principal.getUsername().equals(record.owner)) {
            return error(403, "FORBIDDEN", "只能修改自己的 key");
        }
        if (!record.enabled) return error(409, "MCP_KEY_REVOKED", "已撤销的 key 不能修改");
        if (record.expired(System.currentTimeMillis())) return error(409, "MCP_KEY_EXPIRED", "已过期的 key 不能修改");

        String name = text(body.get("name"));
        if (name.isEmpty()) return error(400, "BAD_REQUEST", "密钥名称不能为空");
        if (name.length() > 80) return error(400, "BAD_REQUEST", "密钥名称最长 80 字符");

        ConsoleRole role;
        try {
            role = ConsoleRole.parse(record.role);
        } catch (IllegalArgumentException e) {
            return error(409, "MCP_KEY_ROLE_INVALID", "key 记录中的角色无效");
        }
        ConsoleRole ownerRole = resolveOwnerRole(admin, record.owner, principal);
        if (!admin && !principal.getRole().atLeast(role)) {
            return error(403, "FORBIDDEN", "账号角色已低于该 key 的签发角色，请撤销后重新签发");
        }
        if (admin && !record.owner.equals(principal.getUsername()) && ownerRole != null
                && !ownerRole.atLeast(role)) {
            return error(409, "MCP_KEY_ROLE_STALE",
                    "目标用户当前角色 " + ownerRole.name() + " 已低于该 key 的签发角色 " + role.name()
                            + "，请撤销后按当前角色重新签发");
        }
        Scope scope = scopeFor(admin, record.owner, principal, ownerRole);
        List<String> permissions;
        List<String> connections;
        Map<String, List<String>> connectionPermissions;
        try {
            permissions = parsePermissions(body.get("permissions"), principal);
            connections = parseConnections(body.get("connections"), principal, scope);
            connectionPermissions = parseConnectionPermissions(body.get("connectionPermissions"), connections, principal, scope);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        } catch (SecurityException e) {
            return error(403, "FORBIDDEN", e.getMessage());
        }
        String ownerWriteError = admin && !record.owner.equals(principal.getUsername())
                ? validateOwnerWrite(record.owner, ownerRole, scope, permissions, connectionPermissions, connections) : null;
        if (ownerWriteError != null) return error(403, "FORBIDDEN", ownerWriteError);
        String connectionRoleError = validateConnectionRoles(connections, role);
        if (connectionRoleError != null) return error(400, "BAD_REQUEST", connectionRoleError);

        List<String> tools;
        try {
            tools = allowedTools(body.get("allowedTools"), principal, role, permissions, connectionPermissions,
                    connections, scope);
        } catch (IllegalArgumentException e) {
            return error(400, "BAD_REQUEST", e.getMessage());
        } catch (SecurityException e) {
            return error(403, "FORBIDDEN", e.getMessage());
        }
        if (tools.isEmpty()) return error(400, "BAD_REQUEST", "至少选择一个工具");
        String writeCoverageError = validateWriteToolPageCoverage(tools, connections, permissions,
                connectionPermissions, scope);
        if (writeCoverageError != null) return error(403, "FORBIDDEN", writeCoverageError);

        boolean delegatedUpdate = admin && !record.owner.equals(principal.getUsername());
        ConsoleRole quotaRole = delegatedUpdate
                ? (ownerRole == null ? ConsoleRole.VIEWER : ownerRole) : principal.getRole();
        Map<String, Object> caps = limitsFor(quotaRole);
        int rpm = intValue(body.get("requestsPerMinute"), 60);
        long daily = longValue(body.get("dailyQuota"), 5000L);
        long monthly = longValue(body.get("monthlyQuota"), 100000L);
        if (rpm < 1 || rpm > ((Number) caps.get("maxRequestsPerMinute")).intValue()) {
            return error(400, "BAD_REQUEST", "requestsPerMinute 超出当前角色上限");
        }
        if (daily < 1 || daily > ((Number) caps.get("maxDailyQuota")).longValue()) {
            return error(400, "BAD_REQUEST", "dailyQuota 超出当前角色上限");
        }
        if (monthly < 1 || monthly > ((Number) caps.get("maxMonthlyQuota")).longValue()) {
            return error(400, "BAD_REQUEST", "monthlyQuota 超出当前角色上限");
        }
        Long expiresAt = record.expiresAt;
        if (body.containsKey("expiresInDays")) {
            long expiresInDays = longValue(body.get("expiresInDays"), 0L);
            long maxDays = ((Number) caps.get("maxExpiresInDays")).longValue();
            if (expiresInDays < 0 || expiresInDays > maxDays) {
                return error(400, "BAD_REQUEST", "expiresInDays 超出当前角色上限（0=不过期）");
            }
            expiresAt = expiresInDays <= 0 ? null : System.currentTimeMillis() + expiresInDays * 86_400_000L;
        }

        Map<String, Object> updated;
        try {
            connectionPermissions = normalizeConnectionPermissions(connections, permissions, connectionPermissions);
            updated = store.update(id, name, tools, connections, permissions, connectionPermissions,
                    rpm, daily, monthly, expiresAt);
        } catch (UnsupportedOperationException e) {
            return error(501, "MCP_KEY_UPDATE_UNSUPPORTED", "当前 key 存储不支持原地修改，请轮换或重新签发");
        }
        if (updated == null) return error(409, "MCP_KEY_REVOKED", "密钥状态已变化，请刷新后重试");
        store.invalidate();
        audit(id, "update", principal);
        McpKeyRecord afterUpdate = store.find(id);
        return ResponseEntity.ok(afterUpdate == null ? updated : afterUpdate.redacted(System.currentTimeMillis()));
    }

    @PostMapping("/{id}/rotate")
    public ResponseEntity<?> rotate(@PathVariable("id") String id, HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;
        McpKeyRecord record = store.find(id);
        if (record == null) return error(404, "NOT_FOUND", "密钥不存在");
        if (!isAdmin(principal) && !principal.getUsername().equals(record.owner)) {
            return error(403, "FORBIDDEN", "只能轮换自己的 key");
        }
        if (!record.enabled) return error(409, "MCP_KEY_REVOKED", "已撤销的 key 不能轮换");
        if (record.expired(System.currentTimeMillis())) return error(409, "MCP_KEY_EXPIRED", "已过期的 key 不能轮换");
        Map<String, Object> rotated = store.rotate(id);
        if (rotated == null) return error(404, "NOT_FOUND", "密钥不存在");
        store.invalidate();
        audit(id, "rotate", principal);
        McpKeyRecord afterRotate = store.find(id);
        if (afterRotate != null) {
            Map<String, Object> response = new LinkedHashMap<>(rotated);
            response.put("key", afterRotate.redacted(System.currentTimeMillis()));
            rotated = response;
        }
        return ResponseEntity.ok(rotated);
    }

    @PostMapping("/{id}/revoke")
    public ResponseEntity<?> revoke(@PathVariable("id") String id, HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal == null) return error(401, "UNAUTHORIZED", "请先登录控制台");
        ResponseEntity<?> pageDenied = requireDevtoolsPage(principal, false);
        if (pageDenied != null) return pageDenied;

        McpKeyRecord record = store.find(id);
        if (record == null) return error(404, "NOT_FOUND", "密钥不存在");
        if (!isAdmin(principal) && !principal.getUsername().equals(record.owner)) {
            return error(403, "FORBIDDEN", "只能撤销自己的 key");
        }
        if (!store.revoke(id)) return error(404, "NOT_FOUND", "密钥不存在");
        store.invalidate();
        audit(id, "revoke", principal);
        McpKeyRecord after = store.find(id);
        return ResponseEntity.ok(after == null ? new LinkedHashMap<String, Object>() : after.redacted(System.currentTimeMillis()));
    }

    private void audit(String id, String action, ConsolePrincipal principal) {
        if (id == null || id.isEmpty() || principal == null) return;
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("action", action);
        entry.put("at", System.currentTimeMillis());
        entry.put("actor", principal.getUsername());
        entry.put("role", principal.getRole() == null ? "" : principal.getRole().name());
        store.appendAudit(id, entry);
    }

    private ConsolePrincipal principal(HttpServletRequest request) {
        Object value = request == null ? null : request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return value instanceof ConsolePrincipal ? (ConsolePrincipal) value : null;
    }

    private boolean isAdmin(ConsolePrincipal principal) {
        return principal.getRole().atLeast(ConsoleRole.ADMIN);
    }

    private ResponseEntity<?> requireDevtoolsPage(ConsolePrincipal principal, boolean hostOnly) {
        if (isAdmin(principal)) return null;
        Set<String> pages = principal.getGrantedPages();
        if (pages == null) return null;
        if (!hasPageGrant(pages, "devtools", hostOnly) && !hasPageGrant(pages, "mcp", hostOnly)) {
            return error(403, "FORBIDDEN", hostOnly
                    ? "当前授权不含宿主连接的 DevTools 或 MCP 接入，不能签发宿主 MCP key"
                    : "当前授权不含 DevTools 或 MCP 接入，不能管理 MCP key");
        }
        return null;
    }

    /** 页面授权同时接受静态键与 conn:{id}:{page}（含写变体）——宿主菜单模型只下发后者。 */
    private boolean hasPageGrant(Set<String> pages, String page, boolean hostOnly) {
        for (String grant : pages) {
            if (grant == null) continue;
            if (grant.equals(page)) return true;
            if (hostOnly) {
                if (grant.equals("conn:host:" + page) || grant.equals("conn:host:w:" + page)) return true;
            } else if (grant.startsWith("conn:") && grant.endsWith(":" + page)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasPageGrantForConn(Set<String> pages, String page, String connId) {
        if (pages == null) return true;
        return pages.contains(page)
                || pages.contains("conn:" + connId + ":" + page)
                || pages.contains("conn:" + connId + ":w:" + page);
    }

    private Map<String, Object> caller(ConsolePrincipal principal) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("username", principal.getUsername());
        out.put("role", principal.getRole().name());
        out.put("canManageAll", isAdmin(principal));
        return out;
    }

    private Map<String, Object> enrichConnectionNames(Map<String, Object> key) {
        Object raw = key.get("connections");
        if (!(raw instanceof List)) return key;
        List<String> names = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            String id = String.valueOf(item);
            if ("host".equalsIgnoreCase(id)) {
                names.add("宿主 / 控制集群");
            } else {
                String name = connStore == null ? null : connStore.getName(id);
                names.add(name == null ? id : name);
            }
        }
        key.put("connectionNames", names);
        return key;
    }

    private List<Map<String, Object>> availableConnections(ConsolePrincipal principal) {
        return availableConnectionsFor(isAdmin(principal), principal.getRole(), principal.getGrantedPages());
    }

    /** 连接目录：restricted=false 表示 ADMIN 自己的全量授权；否则按页面键/角色收窄。 */
    private List<Map<String, Object>> availableConnectionsFor(boolean unrestricted, ConsoleRole role, Set<String> pages) {
        List<Map<String, Object>> out = new ArrayList<>();
        boolean hostGrant = unrestricted || pages == null || hasPageGrant(pages, "devtools", true)
                || hasPageGrant(pages, "mcp", true);
        if (hostClusterVisible && hostGrant) {
            Map<String, Object> host = new LinkedHashMap<>();
            host.put("id", "host");
            host.put("name", "宿主 / 控制集群");
            host.put("env", "HOST");
            host.put("read", true);
            List<String> hostWriteTools = writableToolsFor(unrestricted, role, pages, "host");
            host.put("write", !hostWriteTools.isEmpty());
            host.put("writeTools", hostWriteTools);
            host.put("writePages", writablePages(hostWriteTools));
            out.add(host);
        }
        if (connStore == null) return out;
        for (Map<String, Object> conn : connStore.list()) {
            String id = String.valueOf(conn.get("id"));
            if (!unrestricted && pages != null && !hasConnRead(pages, id) && !hasConnWrite(pages, id)) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", id);
            item.put("name", conn.get("name"));
            item.put("env", conn.get("env"));
            item.put("read", unrestricted || pages == null || hasConnRead(pages, id) || hasConnWrite(pages, id));
            List<String> writeTools = writableToolsFor(unrestricted, role, pages, id);
            item.put("write", !writeTools.isEmpty());
            /* 逐连接返回「该连接真正可写的工具」——前端据此隐藏无写权的勾选框，
               并与 validateWriteToolPageCoverage 使用同一组页面判定，避免可见可签但端点拒绝。 */
            item.put("writeTools", writeTools);
            item.put("writePages", writablePages(writeTools));
            out.add(item);
        }
        return out;
    }

    /** 该连接对当前身份真正可执行的写工具（es_rest 按 devtools 页面写权判定）。 */
    private List<String> writableToolsFor(boolean unrestricted, ConsoleRole role, Set<String> pages, String connId) {
        List<String> out = new ArrayList<>();
        for (String tool : McpController.TOOL_NAMES) {
            if (!McpController.WRITE_TOOLS.contains(tool) && !"es_rest".equals(tool)) continue;
            if (!unrestricted && role != ConsoleRole.ADMIN && McpController.ADMIN_ONLY_TOOLS.contains(tool)) continue;
            if (unrestricted) {
                out.add(tool);
            } else if (pages == null) {
                if (role != null && role.atLeast(ConsoleRole.OPERATOR)) out.add(tool);
            } else if (hasPageWrite(pages, role, connId, TOOL_PAGE.get(tool))) {
                out.add(tool);
            }
        }
        return out;
    }

    /** 写工具对应的页面集合（去重；es_rest 可能无页面映射时按 devtools 计）。 */
    private List<String> writablePages(List<String> writeTools) {
        Set<String> pages = new LinkedHashSet<>();
        for (String tool : writeTools) {
            String page = TOOL_PAGE.get(tool);
            if (page != null && !page.isEmpty()) pages.add(page);
        }
        return new ArrayList<>(pages);
    }

    /** conn:{id}:{page} / conn:{id}:w:{page} 的读可见性；静态页键对所有连接可见。 */
    private boolean hasConnRead(Set<String> pages, String connId) {
        if (pages == null) return true;
        for (String grant : pages) {
            if (grant == null) continue;
            if (!grant.startsWith("conn:")) return true;
            String prefix = "conn:" + connId + ":";
            if (grant.startsWith(prefix)) return true;
        }
        return false;
    }

    /** 该连接是否至少有任一页面写键（连接级写能力，具体工具仍按页面再判）。 */
    private boolean hasConnWrite(Set<String> pages, String connId) {
        if (pages == null) return false;
        String prefix = "conn:" + connId + ":w:";
        for (String grant : pages) {
            if (grant != null && grant.startsWith(prefix)) return true;
        }
        return false;
    }

    /** 指定页面在该连接上是否可写：conn w: 键优先；纯静态模型=页面可见 + 角色门。 */
    private boolean hasPageWrite(Set<String> pages, ConsoleRole role, String connId, String page) {
        if (page == null) return false;
        if (pages == null) return role != null && role.atLeast(ConsoleRole.OPERATOR);
        if (pages.contains("conn:" + connId + ":w:" + page)) return true;
        return pages.contains(page) && role != null && role.atLeast(ConsoleRole.OPERATOR);
    }

    private Map<String, Object> limits(ConsolePrincipal principal) {
        return limitsFor(principal.getRole());
    }

    private List<String> availableTools(ConsolePrincipal principal) {
        return availableToolsFor(isAdmin(principal), principal.getGrantedPages(), principal.getRole());
    }

    private List<String> availableToolsFor(boolean unrestricted, Set<String> pages, ConsoleRole role) {
        if (unrestricted) return new ArrayList<>(McpController.TOOL_NAMES);
        List<String> out = new ArrayList<>();
        boolean roleWrite = role != null && role.atLeast(ConsoleRole.OPERATOR);
        boolean roleAdmin = role == ConsoleRole.ADMIN;
        for (String tool : McpController.TOOL_NAMES) {
            if (!roleAdmin && McpController.ADMIN_ONLY_TOOLS.contains(tool)) continue;
            String page = TOOL_PAGE.get(tool);
            if (McpController.WRITE_TOOLS.contains(tool)) {
                /* 写工具按页面级 w: 键展示；连接上只有别的页面写权时不再误列。 */
                if (pages == null) {
                    if (roleWrite) out.add(tool);
                } else if (anyPageWrite(pages, page, roleWrite)) {
                    out.add(tool);
                }
                continue;
            }
            if (pages == null || page == null || hasPageGrant(pages, page, false)) out.add(tool);
        }
        return out;
    }

    private boolean anyPageWrite(Set<String> pages, String page, boolean roleWrite) {
        if (page == null) return false;
        for (String grant : pages) {
            if (grant == null) continue;
            if (grant.startsWith("conn:") && grant.endsWith(":w:" + page)) return true;
            if (grant.equals(page) && roleWrite) return true;
        }
        return false;
    }

    /** 角色档配额上限；ADMIN 代签按目标用户角色预览，避免把 ADMIN 配额当成目标用户配额。 */
    private Map<String, Object> limitsFor(ConsoleRole role) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (role != null && role.atLeast(ConsoleRole.ADMIN)) {
            out.put("maxRequestsPerMinute", 600);
            out.put("maxDailyQuota", 200000L);
            out.put("maxMonthlyQuota", 5000000L);
            out.put("maxExpiresInDays", 3650);
        } else if (role != null && role.atLeast(ConsoleRole.REBUILD_OP)) {
            out.put("maxRequestsPerMinute", 300);
            out.put("maxDailyQuota", 50000L);
            out.put("maxMonthlyQuota", 1000000L);
            out.put("maxExpiresInDays", 90);
        } else {
            out.put("maxRequestsPerMinute", 120);
            out.put("maxDailyQuota", 20000L);
            out.put("maxMonthlyQuota", 500000L);
            out.put("maxExpiresInDays", 90);
        }
        out.put("defaultRequestsPerMinute", 60);
        out.put("defaultDailyQuota", 5000L);
        out.put("defaultMonthlyQuota", 100000L);
        return out;
    }

    private List<String> allowedTools(Object raw, ConsolePrincipal principal, ConsoleRole role,
                                      List<String> permissions,
                                      Map<String, List<String>> connectionPermissions,
                                      List<String> connections, Scope scope) {
        if (raw != null && !(raw instanceof List)) {
            throw new IllegalArgumentException("allowedTools 必须是数组");
        }
        boolean roleAdmin = role == ConsoleRole.ADMIN;
        boolean canRead = permissions.contains("read");
        boolean canWrite = permissions.contains("write");
        if (connectionPermissions != null) {
            for (List<String> scoped : connectionPermissions.values()) {
                if (scoped == null) continue;
                canRead = canRead || scoped.contains("read");
                canWrite = canWrite || scoped.contains("write");
            }
        }
        List<String> requested = new ArrayList<>();
        if (raw instanceof List) {
            /* action 型工具名可作为签发输入：展开为该组全部 legacy action，
               后续仍逐项校验权限，不会把组内未授权动作静默带进 key。 */
            List<String> candidates = new ArrayList<>();
            for (Object item : (List<?>) raw) {
                String tool = text(item);
                if (tool.isEmpty()) continue;
                if (!McpController.TOOL_NAMES.contains(tool) && McpController.GROUP_ACTIONS.containsKey(tool)) {
                    candidates.addAll(McpController.GROUP_ACTIONS.get(tool).values());
                } else {
                    candidates.add(tool);
                }
            }
            for (String tool : candidates) {
                if (!McpController.TOOL_NAMES.contains(tool)) {
                    throw new IllegalArgumentException("未知工具: " + tool);
                }
                if (!roleAdmin && McpController.ADMIN_ONLY_TOOLS.contains(tool)) {
                    throw new SecurityException("系统管理工具仅可签发给 ADMIN 角色的 key: " + tool);
                }
                if ("es_rest".equals(tool)) {
                    if (!canRead && !canWrite) {
                        throw new IllegalArgumentException("es_rest 需要 read 或 write 权限");
                    }
                } else if (McpController.WRITE_TOOLS.contains(tool) && !canWrite) {
                    throw new IllegalArgumentException("写工具 " + tool + " 需要 write 权限");
                } else if (!McpController.WRITE_TOOLS.contains(tool) && !canRead) {
                    throw new IllegalArgumentException("读工具 " + tool + " 需要 read 权限");
                }
                if (!requested.contains(tool)) requested.add(tool);
            }
        } else {
            for (String tool : availableTools(principal)) {
                if (!roleAdmin && McpController.ADMIN_ONLY_TOOLS.contains(tool)) continue;
                boolean permitted = "es_rest".equals(tool)
                        ? (canRead || canWrite)
                        : (McpController.WRITE_TOOLS.contains(tool) ? canWrite : canRead);
                if (permitted) requested.add(tool);
            }
        }
        if (!scope.adminSelf && scope.pages != null) {
            Set<String> pages = scope.pages;
            {
                for (String tool : requested) {
                    String page = TOOL_PAGE.get(tool);
                    if (page == null) continue;
                    if (McpController.WRITE_TOOLS.contains(tool)) {
                        /* 写工具要命中「该工具所属页面」的 w: 键，而不是连接上任意写页面。
                           否则只有 devtools 写权的人能签出 browser 文档写工具，控制台却打不开。 */
                        String toolPage = TOOL_PAGE.get(tool);
                        boolean anyWritable = false;
                        for (String connId : connections) {
                            if (hasPageWrite(pages, scope.role, connId, toolPage)) { anyWritable = true; break; }
                        }
                        if (!anyWritable) {
                            throw new SecurityException("当前身份没有连接 " + connections
                                    + " 上页面 " + toolPage + " 的写授权，不能签发写工具 " + tool);
                        }
                    } else {
                        /* 读工具必须每个所选连接都可读，防止借 A 连接授权读 B 连接页面。 */
                        for (String connId : connections) {
                            if (!hasPageGrantForConn(pages, page, connId)) {
                                throw new SecurityException("连接 " + connId + " 的页面授权不包含工具 "
                                        + tool + " 所需页面 " + page);
                            }
                        }
                    }
                }
            }
        }
        return requested;
    }

    private List<String> parsePermissions(Object raw, ConsolePrincipal principal) {
        if (!isAdmin(principal)) {
            if (raw instanceof List) {
                for (Object item : (List<?>) raw) {
                    if ("write".equalsIgnoreCase(text(item))) {
                        throw new SecurityException("非 ADMIN 请用 connectionPermissions 逐连接授予写权限");
                    }
                }
            }
            return Collections.singletonList("read");
        }
        if (raw == null) return Collections.singletonList("read");
        if (!(raw instanceof List)) throw new IllegalArgumentException("permissions 必须是数组");
        List<String> out = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            String permission = text(item).toLowerCase(java.util.Locale.ROOT);
            if (permission.isEmpty()) continue;
            if (!"read".equals(permission) && !"write".equals(permission)) {
                throw new IllegalArgumentException("未知权限: " + permission);
            }
            if (!out.contains(permission)) out.add(permission);
        }
        if (out.isEmpty()) throw new IllegalArgumentException("至少选择 read 或 write 权限");
        return out;
    }

    /**
     * 连接级 write 是整连接标记，必须覆盖该 key 的所有写工具页面；否则运行时会因为
     * 「连接可写」而放过一个没有对应页面写权的工具（例如只有 devtools 写权却调用文档写）。
     */
    private String validateWriteToolPageCoverage(List<String> tools, List<String> connections, List<String> permissions,
                                                 Map<String, List<String>> connectionPermissions, Scope scope) {
        if (scope.adminSelf || scope.pages == null) return null;
        for (String connectionId : connections) {
            List<String> effective = connectionPermissions != null && connectionPermissions.containsKey(connectionId)
                    ? connectionPermissions.get(connectionId) : permissions;
            if (effective == null || !effective.contains("write")) continue;
            for (String tool : tools) {
                boolean writeCapable = McpController.WRITE_TOOLS.contains(tool) || "es_rest".equals(tool);
                if (!writeCapable) continue;
                String page = TOOL_PAGE.get(tool);
                if (!hasPageWrite(scope.pages, scope.role, connectionId, page)) {
                    return "连接 " + connectionId + " 的写权限未覆盖工具 " + tool + " 所需页面 " + page
                            + "；请拆分 key 或补齐该页面写授权";
                }
            }
        }
        return null;
    }

    /**
     * 把「未单列的连接」显式补成全局权限，保证管理面看到的就是端点执行时的完整快照，
     * 不留下「列表里没写、运行时按默认值生效」的隐式授权。
     */
    private Map<String, List<String>> normalizeConnectionPermissions(List<String> connections, List<String> permissions,
                                                                     Map<String, List<String>> connectionPermissions) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        List<String> fallback = permissions == null || permissions.isEmpty()
                ? Collections.singletonList("read") : new ArrayList<>(permissions);
        for (String connection : connections) {
            List<String> scoped = connectionPermissions == null ? null : connectionPermissions.get(connection);
            out.put(connection, scoped == null || scoped.isEmpty() ? new ArrayList<>(fallback) : new ArrayList<>(scoped));
        }
        return out;
    }

    /**
     * 连接级权限覆盖：{"qaConn":["read","write"], "prodConn":["read"]}。
     * 未列出的连接回落到全局 permissions；用于一把 key 覆盖「测试可写、生产只读」。
     */
    private Map<String, List<String>> parseConnectionPermissions(Object raw, List<String> connections,
                                                                 ConsolePrincipal principal, Scope scope) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (raw == null) return out;
        if (!(raw instanceof Map)) throw new IllegalArgumentException("connectionPermissions 必须是对象");
        for (Map.Entry<?, ?> e : ((Map<?, ?>) raw).entrySet()) {
            String connectionId = text(e.getKey());
            if (connectionId.isEmpty()) continue;
            if (!connections.contains(connectionId)) {
                throw new IllegalArgumentException("连接权限中的连接不在本次 connections 内: " + connectionId);
            }
            if (!(e.getValue() instanceof List)) {
                throw new IllegalArgumentException("连接权限 " + connectionId + " 必须是数组");
            }
            List<String> perms = new ArrayList<>();
            for (Object item : (List<?>) e.getValue()) {
                String permission = text(item).toLowerCase(java.util.Locale.ROOT);
                if (permission.isEmpty()) continue;
                if (!"read".equals(permission) && !"write".equals(permission)) {
                    throw new IllegalArgumentException("未知权限: " + permission);
                }
                if (!scope.adminSelf) {
                    String who = scope.delegated ? "目标用户" : "当前身份";
                    if ("write".equals(permission)) {
                        /* 内置身份（pages=null）没有页面模型：写权限按角色门，与拦截器一致。 */
                        boolean writable = scope.pages == null
                                ? scope.role != null && scope.role.atLeast(ConsoleRole.OPERATOR)
                                : hasConnWrite(scope.pages, connectionId);
                        if (!writable) throw new SecurityException(who + "在连接 " + connectionId + " 没有页面写授权");
                    }
                    if ("read".equals(permission) && scope.pages != null && !hasConnRead(scope.pages, connectionId)) {
                        throw new SecurityException(who + "在连接 " + connectionId + " 没有页面读授权");
                    }
                }
                if (!perms.contains(permission)) perms.add(permission);
            }
            if (perms.isEmpty()) {
                throw new IllegalArgumentException("连接权限 " + connectionId + " 至少选择 read 或 write");
            }
            out.put(connectionId, perms);
        }
        return out;
    }

    private String validateConnectionRoles(List<String> connections, ConsoleRole role) {
        if (connStore == null) return null;
        for (String id : connections) {
            if ("host".equalsIgnoreCase(id)) continue;
            RemoteClusterConn conn = connStore.get(id);
            if (conn == null) return "连接不存在或已删除: " + id;
            ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
            if (!role.atLeast(required)) {
                return "key 角色 " + role.name() + " 低于连接 " + id + " 的 minRole " + required.name();
            }
        }
        return null;
    }

    private List<String> parseConnections(Object raw, ConsolePrincipal principal, Scope scope) {
        List<Map<String, Object>> available = availableConnections(principal);
        Set<String> allowed = new java.util.LinkedHashSet<>();
        if (scope.delegated) {
            /* ADMIN 代签：只能落在这名用户真实可读/可写的连接上；目标也是 ADMIN 时全量；
               页面授权不可解析且目标非 ADMIN 时只允许宿主（fail-closed）。 */
            if (scope.pages == null) {
                if (scope.role != null && scope.role.atLeast(ConsoleRole.ADMIN)) {
                    for (Map<String, Object> connection : available) allowed.add(String.valueOf(connection.get("id")));
                } else if (hostClusterVisible) {
                    allowed.add("host");
                }
            } else {
                for (Map<String, Object> connection : available) {
                    String id = String.valueOf(connection.get("id"));
                    if (hasConnRead(scope.pages, id) || hasConnWrite(scope.pages, id)) allowed.add(id);
                }
            }
        } else {
            for (Map<String, Object> connection : available) allowed.add(String.valueOf(connection.get("id")));
        }
        if (allowed.isEmpty()) {
            throw new SecurityException("目标用户没有可签发 MCP key 的连接页面授权");
        }
        if (raw == null) {
            String first = String.valueOf(available.get(0).get("id"));
            if (!allowed.contains(first)) first = allowed.iterator().next();
            return Collections.singletonList(first);
        }
        if (!(raw instanceof List)) throw new IllegalArgumentException("connections 必须是数组");
        List<String> out = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            String id = text(item);
            if (id.isEmpty()) continue;
            if (!allowed.contains(id)) {
                throw new SecurityException(scope.delegated
                        ? "连接不在目标用户的页面授权范围内: " + id
                        : "连接不在当前身份的页面授权范围内: " + id);
            }
            if (!out.contains(id)) out.add(id);
        }
        if (out.isEmpty()) throw new IllegalArgumentException("至少选择一个连接");
        return out;
    }

    private ConsoleRole parseRole(String raw) {
        if (raw.isEmpty()) return ConsoleRole.VIEWER;
        for (ConsoleRole role : ConsoleRole.values()) {
            if (role.name().equalsIgnoreCase(raw)) return role;
        }
        throw new IllegalArgumentException("未知角色: " + raw);
    }

    /** 本次签发的实际权限边界；ADMIN 为自己签发时不收窄。 */
    private Scope scopeFor(boolean admin, String owner, ConsolePrincipal principal, ConsoleRole ownerRole) {
        boolean self = owner == null || owner.isEmpty() || owner.equals(principal.getUsername());
        if (admin && self) return new Scope(true, false, null, principal.getRole());
        Set<String> pages = admin ? resolveOwnerPages(owner) : principal.getGrantedPages();
        ConsoleRole role = admin ? ownerRole : principal.getRole();
        return new Scope(false, admin, pages, role);
    }

    /** 代签时解析目标用户的页面授权；宿主未实现 pagesOf 时返回 null（角色模型兜底）。 */
    private Set<String> resolveOwnerPages(String owner) {
        if (ownerResolver == null) return null;
        try {
            return ownerResolver.pagesOf(owner);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 代签时解析目标用户真实角色；未收录/宿主委托身份返回 null（保持 ADMIN 代签策略）。 */
    private ConsoleRole resolveOwnerRole(boolean admin, String owner, ConsolePrincipal principal) {
        if (!admin || owner == null || owner.equals(principal.getUsername())) return principal.getRole();
        if (ownerResolver == null) return null;
        try {
            String text = ownerResolver.roleOf(owner);
            return text == null || text.trim().isEmpty() ? null : ConsoleRole.parse(text.trim());
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** ADMIN 代签时不能给目标用户实际无法在控制台执行的写权限（有页面授权时按连接交集判定）。 */
    private String validateOwnerWrite(String owner, ConsoleRole ownerRole, Scope scope, List<String> permissions,
                                      Map<String, List<String>> connectionPermissions, List<String> connections) {
        if (ownerRole != null && ownerRole.atLeast(ConsoleRole.OPERATOR)) return null;
        boolean write = permissions != null && permissions.contains("write");
        if (!write && connectionPermissions != null) {
            for (List<String> scoped : connectionPermissions.values()) {
                if (scoped != null && scoped.contains("write")) {
                    write = true;
                    break;
                }
            }
        }
        if (!write) return null;
        if (scope.pages != null) {
            /* 页面授权可解析：逐连接校验，避免「控制台只读、MCP 可写」。 */
            for (String connectionId : connections) {
                List<String> effective = connectionPermissions != null && connectionPermissions.containsKey(connectionId)
                        ? connectionPermissions.get(connectionId) : permissions;
                if (effective != null && effective.contains("write") && !hasConnWrite(scope.pages, connectionId)) {
                    return "目标用户 " + owner + " 在连接 " + connectionId + " 没有页面写授权，不能签发 write";
                }
            }
            return null;
        }
        /* 页面授权不可解析：仅按角色 fail-closed；ownerRole=null 表示宿主未接入解析，按不可写拒绝。 */
        if (ownerRole != null && ownerRole.atLeast(ConsoleRole.OPERATOR)) return null;
        String roleText = ownerRole == null ? "未知（宿主未提供角色解析）" : ownerRole.name();
        return "目标用户 " + owner + " 的角色为 " + roleText
                + "，不能签发写权限；写权限至少需要 OPERATOR 角色";
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private int intValue(Object value, int fallback) {
        if (!(value instanceof Number)) return fallback;
        return ((Number) value).intValue();
    }

    private long longValue(Object value, long fallback) {
        if (!(value instanceof Number)) return fallback;
        return ((Number) value).longValue();
    }

    private ResponseEntity<Map<String, Object>> error(int status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}
