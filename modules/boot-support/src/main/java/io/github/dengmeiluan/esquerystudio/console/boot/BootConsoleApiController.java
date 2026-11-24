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

package io.github.dengmeiluan.esquerystudio.console.boot;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.boot.auth.ConsoleAuthProvider;
import io.github.dengmeiluan.esquerystudio.console.boot.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.rest.EsRestClient;
import io.github.dengmeiluan.esquerystudio.rest.EsRestResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Minimal read-only bootstrap API for the existing Vue console.
 *
 * <p>The host identity is a development bootstrap: when
 * {@code esquerystudio.boot.dev-bootstrap-auth=true}, it returns an ADMIN principal and
 * proxies read-only data endpoints. Default is false (401), so a host app does not
 * accidentally expose an unauthenticated console. Real host auth lands in Phase 2.</p>
 */
@RestController
@RequestMapping(path = {"/internal/es/index", "/internal/es"})
public class BootConsoleApiController {

    private static final MediaType JSON = MediaType.APPLICATION_JSON;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final EsRestClient client;
    private final String endpoint;
    private final boolean bootstrapAuth;
    private final boolean allowWrites;
    /** MCP transport mount path; the host may already own /mcp, so the default is project-scoped. */
    @Value("${esquerystudio.mcp.path:/esmcp}")
    private String mcpPath = "/esmcp";

    /** Host-owned identity; null means no host auth (bootstrap flag may still provide a dev principal). */
    @Autowired(required = false)
    private ConsoleAuthProvider authProvider;

    private volatile String pagesPayload;

    public BootConsoleApiController(EsRestClient client,
                                    @Value("${esquerystudio.elasticsearch.url:http://localhost:9200}") String endpoint,
                                    @Value("${esquerystudio.boot.dev-bootstrap-auth:false}") boolean bootstrapAuth,
                                    @Value("${esquerystudio.boot.allow-writes:false}") boolean allowWrites) {
        this.client = client;
        this.endpoint = endpoint;
        this.bootstrapAuth = bootstrapAuth;
        this.allowWrites = allowWrites;
    }

    @GetMapping("/setup/status")
    public ResponseEntity<String> setupStatus() {
        return ok("{\"bound\":true,\"mode\":\"HOST\",\"endpoint\":\"" + escape(endpoint)
                + "\",\"appName\":\"ESQueryStudio Host\",\"hostVisible\":true,"
                + "\"authEnabled\":" + (authProvider != null) + ",\"builtinLogin\":false,"
                + "\"mcpPath\":\"" + escape(mcpEndpointPath()) + "\","
                + "\"setupTokenRequired\":false}");
    }

    /** Normalized mount path (leading slash, no trailing slash); blank falls back to /esmcp. */
    private String mcpEndpointPath() {
        String p = mcpPath == null ? "" : mcpPath.trim();
        if (p.isEmpty()) {
            p = "/esmcp";
        }
        if (!p.startsWith("/")) {
            p = "/" + p;
        }
        while (p.length() > 1 && p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        return p;
    }

    @GetMapping("/ui/config")
    public ResponseEntity<String> uiConfig() {
        return ok("{}");
    }

    @GetMapping("/pages")
    public ResponseEntity<String> pages() {
        try {
            return ok(pagesPayload());
        } catch (Exception e) {
            return ResponseEntity.status(500).contentType(JSON)
                    .body("{\"error\":\"page contract unavailable\",\"message\":\"" + escape(e.getMessage()) + "\"}");
        }
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ok("{\"status\":\"green\",\"mode\":\"host\"}");
    }

    @GetMapping("/auth/me")
    public ResponseEntity<String> me() {
        Optional<ConsolePrincipal> principal = principal();
        if (!principal.isPresent()) {
            return unauthorized();
        }
        ConsolePrincipal p = principal.get();
        String pages;
        try {
            pages = pagesPayload();
        } catch (Exception e) {
            pages = "{\"groups\":[]}";
        }
        return ok("{\"username\":\"" + escape(p.username())
                + "\",\"displayName\":\"" + escape(p.displayName())
                + "\",\"role\":\"" + escape(p.role())
                + "\",\"fallback\":false,\"delegated\":true,\"authSource\":\"host\","
                + "\"grantedPages\":" + jsonArray(p.grantedPages())
                + ",\"pages\":" + pages + "}");
    }

    @PostMapping("/auth/login")
    public ResponseEntity<String> login() {
        return bootstrapAuth ? ok("{\"token\":\"host\"}") : unauthorized();
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<String> logout() {
        return bootstrapAuth ? ok("{\"ok\":true}") : unauthorized();
    }

    @GetMapping("/clusters")
    public ResponseEntity<String> clusters() {
        if (!authenticated()) {
            return unauthorized();
        }
        URI uri = URI.create(endpoint);
        String scheme = uri.getScheme() == null ? "http" : uri.getScheme();
        String host = uri.getHost() == null ? "localhost" : uri.getHost();
        int port = uri.getPort() > 0 ? uri.getPort() : ("https".equals(scheme) ? 443 : 9200);
        return ok("[{\"id\":\"host\",\"name\":\"Host\",\"scheme\":\"" + escape(scheme)
                + "\",\"host\":\"" + escape(host) + "\",\"port\":" + port
                + ",\"username\":\"\",\"hasPassword\":false,\"authType\":\"BASIC\",\"env\":\"HOST\","
                + "\"health\":{\"status\":\"UNKNOWN\",\"latencyMs\":null,\"lastProbeAt\":null,\"error\":null}}]");
    }

    @GetMapping("/overview")
    public ResponseEntity<String> overview() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        EsRestResponse indices = client.perform("GET",
                "/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep&s=index", null);
        if (indices.status() >= 400) {
            return from(indices);
        }
        EsRestResponse health = client.perform("GET", "/_cluster/health", null);
        if (health.status() >= 400) {
            return from(health);
        }
        return ok("{\"indices\":" + orEmpty(indices.body(), "[]")
                + ",\"health\":" + orEmpty(health.body(), "{}") + ",\"mode\":\"host\"}");
    }

    @GetMapping("/cluster/health")
    public ResponseEntity<String> clusterHealth() throws Exception {
        return bootstrapAuth ? from(client.perform("GET", "/_cluster/health", null)) : unauthorized();
    }

    @GetMapping("/cluster/indices")
    public ResponseEntity<String> clusterIndices() throws Exception {
        return bootstrapAuth ? from(client.perform("GET",
                "/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep,"
                        + "creation.date.string,segments.count,docs.deleted", null)) : unauthorized();
    }

    @GetMapping("/cluster/aliases")
    public ResponseEntity<String> clusterAliases() throws Exception {
        return bootstrapAuth ? from(client.perform("GET", "/_cat/aliases?format=json", null)) : unauthorized();
    }

    @GetMapping("/cluster/shards")
    public ResponseEntity<String> clusterShards() throws Exception {
        return bootstrapAuth ? from(client.perform("GET", "/_cat/shards?format=json", null)) : unauthorized();
    }

    @GetMapping("/monitor-history")
    public ResponseEntity<String> monitorHistory() {
        return bootstrapAuth ? ok("{\"records\":[]}") : unauthorized();
    }

    @GetMapping("/cluster/mapping-detail")
    public ResponseEntity<String> mappingDetail(@RequestParam("index") String index) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        if (!safeIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        EsRestResponse response = client.perform("GET", "/" + index + "/_mapping", null);
        if (response.status() >= 400) {
            return from(response);
        }
        Map<String, Object> mapping = firstMapping(readMap(response));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("index", index);
        out.put("raw", mapping == null ? Collections.emptyMap() : mapping);
        out.put("tree", Collections.emptyMap());
        out.put("stats", Collections.emptyMap());
        return ok(MAPPER.writeValueAsString(out));
    }

    @GetMapping("/cluster/inspect")
    public ResponseEntity<String> clusterInspect(
            @RequestParam("index") String index,
            @RequestParam(value = "sampleSize", defaultValue = "5") int sampleSize) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        if (!safeIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", index);

        try {
            Map<String, Object> byIndex = new LinkedHashMap<>();
            Map<String, Object> raw = readMap(client.perform("GET", "/" + index + "/_mapping", null));
            if (raw != null) {
                for (Map.Entry<String, Object> e : raw.entrySet()) {
                    Object mappings = e.getValue() instanceof Map
                            ? ((Map<?, ?>) e.getValue()).get("mappings") : null;
                    byIndex.put(e.getKey(), mappings instanceof Map
                            ? unwrapTypeLayer((Map<String, Object>) mappings) : mappings);
                }
            }
            out.put("mappings", byIndex);
        } catch (Exception e) {
            out.put("mappingsError", e.getMessage());
        }

        try {
            Map<String, Object> settingsByIndex = new LinkedHashMap<>();
            Map<String, Object> raw = readMap(client.perform("GET", "/" + index + "/_settings", null));
            if (raw != null) {
                for (Map.Entry<String, Object> e : raw.entrySet()) {
                    Object settings = e.getValue() instanceof Map
                            ? ((Map<?, ?>) e.getValue()).get("settings") : null;
                    Object indexSettings = settings instanceof Map
                            ? ((Map<?, ?>) settings).get("index") : null;
                    Map<String, String> flat = new LinkedHashMap<>();
                    if (indexSettings instanceof Map) {
                        ((Map<?, ?>) indexSettings).forEach((k, v) -> flat.put("index." + k, String.valueOf(v)));
                    }
                    settingsByIndex.put(e.getKey(), flat);
                }
            }
            out.put("settings", settingsByIndex);
        } catch (Exception e) {
            out.put("settingsError", e.getMessage());
        }

        try {
            Map<String, Object> count = readMap(client.perform("GET", "/" + index + "/_count", null));
            Object value = count == null ? null : count.get("count");
            out.put("docCount", value instanceof Number ? ((Number) value).longValue() : -1L);
        } catch (Exception e) {
            out.put("docCountError", e.getMessage());
        }

        try {
            Map<String, Object> aliasesByIndex = new LinkedHashMap<>();
            Map<String, Object> raw = readMap(client.perform("GET", "/" + index + "/_alias", null));
            if (raw != null) {
                for (Map.Entry<String, Object> e : raw.entrySet()) {
                    Object aliases = e.getValue() instanceof Map
                            ? ((Map<?, ?>) e.getValue()).get("aliases") : null;
                    aliasesByIndex.put(e.getKey(), aliases instanceof Map
                            ? new ArrayList<>(((Map<?, ?>) aliases).keySet()) : Collections.emptyList());
                }
            }
            out.put("aliases", aliasesByIndex);
        } catch (Exception e) {
            out.put("aliasesError", e.getMessage());
        }

        if (sampleSize > 0) {
            try {
                int size = Math.min(50, sampleSize);
                Map<String, Object> search = readMap(client.perform("POST",
                        "/" + index + "/_search?size=" + size, "{\"query\":{\"match_all\":{}}}"));
                List<Map<String, Object>> docs = new ArrayList<>();
                Object hitsNode = search == null ? null : search.get("hits");
                Object hits = hitsNode instanceof Map ? ((Map<?, ?>) hitsNode).get("hits") : null;
                if (hits instanceof List) {
                    for (Object o : (List<?>) hits) {
                        if (!(o instanceof Map)) {
                            continue;
                        }
                        Map<?, ?> hit = (Map<?, ?>) o;
                        Map<String, Object> doc = new LinkedHashMap<>();
                        doc.put("_id", hit.get("_id"));
                        doc.put("_index", hit.get("_index"));
                        Object source = hit.get("_source");
                        doc.put("_source", source instanceof Map ? source : Collections.emptyMap());
                        docs.add(doc);
                    }
                }
                out.put("sample", docs);
            } catch (Exception e) {
                out.put("sampleError", e.getMessage());
            }
        }
        return ok(MAPPER.writeValueAsString(out));
    }

    @PostMapping("/cluster/query")
    public ResponseEntity<String> clusterQuery(
            @RequestParam("index") String index,
            @RequestParam(value = "size", defaultValue = "20") int size,
            @RequestBody(required = false) String body) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        if (!safeIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        return from(client.perform("POST", "/" + index + "/_search?size=" + size,
                body == null || body.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : body));
    }

    @PostMapping("/cluster/profile")
    public ResponseEntity<String> clusterProfile(
            @RequestParam("index") String index,
            @RequestBody(required = false) String body) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        if (!safeIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        return from(client.perform("POST", "/" + index + "/_search?profile=true",
                body == null || body.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : body));
    }

    @PostMapping("/cluster/sql")
    public ResponseEntity<String> clusterSql(@RequestBody(required = false) String body) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        String payload = sqlPayload(body);
        EsRestResponse response = client.perform("POST", "/_sql?format=json", payload);
        if (response.status() == 404 || response.status() == 400) {
            // Generic fallback, not a version branch: 6.7 exposes SQL under _xpack/sql.
            response = client.perform("POST", "/_xpack/sql?format=json", payload);
        }
        return from(response);
    }

    @GetMapping("/cluster/index-settings")
    public ResponseEntity<String> indexSettings(@RequestParam("index") String index) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        if (!safeIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        return from(client.perform("GET", "/" + index + "/_settings", null));
    }

    @PostMapping({"/cluster/raw", "/cluster/devtools/execute"})
    public ResponseEntity<String> raw(@RequestBody Map<String, String> req) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        String method = req.getOrDefault("method", "GET").trim().toUpperCase();
        String path = req.get("path");
        String body = req.get("body");
        if (!Arrays.asList("GET", "HEAD", "POST", "PUT", "DELETE").contains(method)) {
            return ResponseEntity.badRequest().contentType(JSON)
                    .body("{\"status\":400,\"body\":\"method not allowed\"}");
        }
        if (path == null || !path.startsWith("/") || path.contains("..") || path.contains("#")) {
            return ResponseEntity.badRequest().contentType(JSON)
                    .body("{\"status\":400,\"body\":\"path must start with / and contain no .. or #\"}");
        }
        if (body != null && body.length() > 32 * 1024 * 1024) {
            return ResponseEntity.badRequest().contentType(JSON)
                    .body("{\"status\":400,\"body\":\"request body too large\"}");
        }
        boolean readOnly = "GET".equals(method) || "HEAD".equals(method);
        if (!readOnly && !allowWrites) {
            return ResponseEntity.status(403).contentType(JSON)
                    .body("{\"status\":403,\"body\":\"writes disabled: set esquerystudio.boot.allow-writes=true\"}");
        }
        EsRestResponse response = client.perform(method, path, "HEAD".equals(method) ? null : body);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", response.status());
        out.put("body", response.body());
        return ok(MAPPER.writeValueAsString(out));
    }

    @PostMapping("/cluster/delete-by-id")
    public ResponseEntity<String> deleteById(@RequestParam("index") String index,
                                             @RequestParam("id") String id) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        return from(client.perform("DELETE", "/" + index + "/_doc/" + encode(id), null));
    }

    @PostMapping("/cluster/update-document")
    public ResponseEntity<String> updateDocument(@RequestParam("index") String index,
                                                 @RequestParam("id") String id,
                                                 @RequestBody(required = false) String doc) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        return from(client.perform("PUT", "/" + index + "/_doc/" + encode(id) + "?refresh=true",
                doc == null || doc.trim().isEmpty() ? "{}" : doc));
    }

    @PostMapping("/cluster/update-partial")
    public ResponseEntity<String> updatePartial(@RequestParam("index") String index,
                                                @RequestParam("id") String id,
                                                @RequestBody(required = false) String partial) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        String payload = "{\"doc\":" + (partial == null || partial.trim().isEmpty() ? "{}" : partial) + "}";
        return from(client.perform("POST", "/" + index + "/_update/" + encode(id) + "?refresh=true", payload));
    }

    @PostMapping("/cluster/put-mapping")
    public ResponseEntity<String> putMapping(@RequestParam("index") String index,
                                             @RequestBody(required = false) String mapping) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        EsRestResponse response = client.perform("PUT", "/" + index + "/_mapping",
                mapping == null || mapping.trim().isEmpty() ? "{}" : mapping);
        if (response.status() == 400) {
            response = client.perform("PUT", "/" + index + "/_doc/_mapping",
                    mapping == null || mapping.trim().isEmpty() ? "{}" : mapping);
        }
        return from(response);
    }

    @PostMapping("/cluster/update-settings")
    public ResponseEntity<String> updateSettings(@RequestParam("index") String index,
                                                 @RequestBody(required = false) String settings) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        return from(client.perform("PUT", "/" + index + "/_settings",
                settings == null || settings.trim().isEmpty() ? "{}" : settings));
    }

    @PostMapping("/cluster/create-index")
    public ResponseEntity<String> createIndex(@RequestParam("index") String index,
                                              @RequestBody(required = false) Map<String, String> body) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        if (body != null && body.get("settings") != null && !body.get("settings").trim().isEmpty()) {
            payload.put("settings", MAPPER.readValue(body.get("settings"), Object.class));
        }
        Object mappings = null;
        if (body != null && body.get("mapping") != null && !body.get("mapping").trim().isEmpty()) {
            mappings = MAPPER.readValue(body.get("mapping"), Object.class);
            payload.put("mappings", mappings);
        }
        EsRestResponse response = client.perform("PUT", "/" + index, MAPPER.writeValueAsString(payload));
        if (response.status() == 400 && mappings != null) {
            // Generic fallback, not a version branch: 6.x requires a type wrapper.
            Map<String, Object> typed = new LinkedHashMap<>(payload);
            typed.put("mappings", Collections.singletonMap("_doc", mappings));
            response = client.perform("PUT", "/" + index, MAPPER.writeValueAsString(typed));
        }
        if (response.status() >= 400) {
            return from(response);
        }
        return ok("{\"ok\":true,\"index\":\"" + escape(index) + "\"}");
    }

    @PostMapping("/cluster/delete-index")
    public ResponseEntity<String> deleteIndex(@RequestParam("index") String index) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        EsRestResponse response = client.perform("DELETE", "/" + index, null);
        if (response.status() >= 400) {
            return from(response);
        }
        return ok("{\"ok\":true,\"index\":\"" + escape(index) + "\"}");
    }

    @PostMapping("/cluster/force-merge")
    public ResponseEntity<String> clusterForceMerge(
            @RequestParam("index") String index,
            @RequestParam(value = "maxSegments", defaultValue = "1") int maxSegments) throws Exception {
        if (!writesAllowed()) {
            return forbidden();
        }
        if (!safeWriteIndex(index)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        if (maxSegments < 1) {
            return ResponseEntity.badRequest().body("{\"error\":\"maxSegments must be >= 1\"}");
        }
        EsRestResponse response = client.perform("POST",
                "/" + index + "/_forcemerge?max_num_segments=" + maxSegments, null);
        if (response.status() >= 400) {
            return from(response);
        }
        return ok("{\"ok\":true,\"index\":\"" + escape(index) + "\",\"maxSegments\":" + maxSegments + "}");
    }

    /** Phase 0 reads: account directory / audit surfaces are not migrated (no host user store yet)
     and the core never fabricates members or audit rows. */
    @GetMapping("/auth/users")
    public ResponseEntity<String> authUsers() {
        return authenticated() ? ok("[]") : unauthorized();
    }

    @GetMapping("/auth/ops-audit")
    public ResponseEntity<String> opsAudit() {
        return authenticated() ? ok("{\"records\":[]}") : unauthorized();
    }

    @GetMapping("/auth/audit-facets")
    public ResponseEntity<String> auditFacets() {
        return authenticated()
                ? ok("{\"actions\":[],\"conns\":[],\"users\":[],\"uris\":[]}") : unauthorized();
    }

    /** Phase 0: MCP management is a server-side surface; no keys are issued by the shared core. */
    @GetMapping("/mcp/keys")
    public ResponseEntity<String> mcpKeys() {
        return authenticated() ? ok("[]") : unauthorized();
    }

    @GetMapping("/mcp/keys/calls")
    public ResponseEntity<String> mcpKeyCalls() {
        return authenticated() ? ok("[]") : unauthorized();
    }

    @GetMapping("/cluster/templates")
    public ResponseEntity<String> templates() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        EsRestResponse indexTemplates = client.perform("GET", "/_index_template", null);
        if (indexTemplates.status() >= 400) {
            // Generic fallback, not a version branch: 6.x exposes legacy _template only.
            EsRestResponse legacy = client.perform("GET", "/_template", null);
            Map<String, Object> raw = legacy.status() >= 400 ? null : readMap(legacy);
            List<Map<String, Object>> rows = new ArrayList<>();
            if (raw != null) {
                for (Map.Entry<String, Object> e : raw.entrySet()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", e.getKey());
                    row.put("index_template", e.getValue());
                    rows.add(row);
                }
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index_templates", rows);
            out.put("component_templates", Collections.emptyList());
            out.put("legacy", true);
            return ok(MAPPER.writeValueAsString(out));
        }
        Map<String, Object> it = readMap(indexTemplates);
        EsRestResponse componentTemplates = client.perform("GET", "/_component_template", null);
        Map<String, Object> ct = componentTemplates.status() >= 400 ? null : readMap(componentTemplates);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("index_templates", it == null ? Collections.emptyList() : it.get("index_templates"));
        out.put("component_templates", ct == null ? Collections.emptyList() : ct.get("component_templates"));
        return ok(MAPPER.writeValueAsString(out));
    }

    /** Phase 0: drift baselines are host-local state; no keys are collected yet (honest empty). */
    @GetMapping("/config-lab/drift/keys")
    public ResponseEntity<String> driftKeys() {
        return authenticated() ? ok("[]") : unauthorized();
    }

    /** Phase 0: the shared core owns no control-plane indices (job locks / user index).
     Answer an explicit empty shape so the page states the boundary instead of "Not Found". */
    @GetMapping("/system-inspect")
    public ResponseEntity<String> systemInspect(@RequestParam(value = "which", defaultValue = "lock") String which) {
        if (!authenticated()) {
            return unauthorized();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", "esquerystudio-console-" + which);
        out.put("mappings", Collections.emptyMap());
        out.put("settings", Collections.emptyMap());
        out.put("docCount", 0);
        out.put("sample", Collections.emptyList());
        out.put("boundary", "本部署的共享核心不持有系统控制面索引（" + which + "）；"
                + "迁移作业锁与账号库此前由 legacy 2.3 模块提供");
        try {
            return ok(MAPPER.writeValueAsString(out));
        } catch (Exception e) {
            return ResponseEntity.status(500).contentType(JSON)
                    .body("{\"error\":\"serialize\"}");
        }
    }

    @PostMapping("/system-query")
    public ResponseEntity<String> systemQuery(
            @RequestParam(value = "which", defaultValue = "lock") String which,
            @RequestParam(value = "size", defaultValue = "10") int size,
            @RequestBody(required = false) String dsl) {
        if (!authenticated()) {
            return unauthorized();
        }
        // Same honest shape as browser mode: no server-side control index to query.
        return ok("{\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"hits\":[]},"
                + "\"boundary\":\"共享核心不持有系统控制面索引（" + escape(which) + "）\"}");
    }

    @GetMapping("/cluster/tasks")
    public ResponseEntity<String> clusterTasks(
            @RequestParam(value = "actions", required = false) String actions,
            @RequestParam(value = "detailed", defaultValue = "true") boolean detailed) throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        String path = "/_tasks?detailed=" + detailed;
        if (actions != null && !actions.trim().isEmpty()) {
            path += "&actions=" + URLEncoder.encode(actions, "UTF-8");
        }
        EsRestResponse response = client.perform("GET", path, null);
        return response.status() >= 400 ? ok("{\"tasks\":[]}") : ok(orEmpty(response.body(), "{\"tasks\":[]}"));
    }

    @GetMapping("/cluster/pending-tasks")
    public ResponseEntity<String> pendingTasks() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        EsRestResponse response = client.perform("GET", "/_cluster/pending_tasks", null);
        return response.status() >= 400 ? ok("{\"tasks\":[]}") : ok(orEmpty(response.body(), "{\"tasks\":[]}"));
    }

    @GetMapping("/cluster/snapshot/status")
    public ResponseEntity<String> snapshotStatus() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        EsRestResponse response = client.perform("GET", "/_snapshot/_status", null);
        return response.status() >= 400 ? ok("{}") : ok(orEmpty(response.body(), "{}"));
    }

    /** Phase 0: topology brief is not collected yet; return an honest empty list. */
    @GetMapping("/cluster/nodes-stats-brief")
    public ResponseEntity<String> nodesStatsBrief() {
        return bootstrapAuth ? ok("[]") : unauthorized();
    }


    @GetMapping("/cluster/settings")
    public ResponseEntity<String> clusterSettings() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        return from(client.perform("GET", "/_cluster/settings?include_defaults=true", null));
    }

    @GetMapping("/cluster/snapshot/repos")
    public ResponseEntity<String> snapshotRepos() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        Map<String, Object> raw = readMap(client.perform("GET", "/_snapshot", null));
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw != null) {
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", e.getKey());
                Object v = e.getValue();
                row.put("type", v instanceof Map ? ((Map<?, ?>) v).get("type") : null);
                row.put("settings", v instanceof Map ? ((Map<?, ?>) v).get("settings") : null);
                out.add(row);
            }
        }
        return ok(MAPPER.writeValueAsString(out));
    }

    @GetMapping("/cluster/ilm/policies")
    public ResponseEntity<String> ilmPolicies() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        Map<String, Object> raw = readMap(client.perform("GET", "/_ilm/policy", null));
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw != null) {
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", e.getKey());
                if (e.getValue() instanceof Map) {
                    row.putAll((Map<String, Object>) e.getValue());
                }
                out.add(row);
            }
        }
        return ok(MAPPER.writeValueAsString(out));
    }

    @GetMapping("/cluster/ilm/status")
    public ResponseEntity<String> ilmStatus() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        return from(client.perform("GET", "/_ilm/status", null));
    }

    @GetMapping("/cluster/slm/policies")
    public ResponseEntity<String> slmPolicies() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        EsRestResponse response = client.perform("GET", "/_slm/policy", null);
        return response.status() >= 400 ? ok("{}") : from(response);
    }

    @GetMapping("/cluster/slm/status")
    public ResponseEntity<String> slmStatus() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        EsRestResponse status = client.perform("GET", "/_slm/status", null);
        out.put("status", status.status() >= 400 ? null : MAPPER.readValue(status.body(), Object.class));
        EsRestResponse stats = client.perform("GET", "/_slm/stats", null);
        out.put("stats", stats.status() >= 400 ? null : MAPPER.readValue(stats.body(), Object.class));
        return ok(MAPPER.writeValueAsString(out));
    }

    @GetMapping("/cluster/watcher")
    public ResponseEntity<String> watcher() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        EsRestResponse stats = client.perform("GET", "/_watcher/stats", null);
        if (stats.status() >= 400) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", "HTTP " + stats.status());
            return ok(MAPPER.writeValueAsString(out));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("available", true);
        out.put("stats", MAPPER.readValue(stats.body(), Object.class));
        EsRestResponse watches = client.perform("POST", "/.watches/_search",
                "{\"size\":200,\"_source\":[\"metadata\",\"trigger\",\"actions\"]}");
        out.put("watches", watches.status() >= 400
                ? Collections.emptyMap() : MAPPER.readValue(watches.body(), Object.class));
        if (watches.status() >= 400) {
            out.put("reason", "HTTP " + watches.status());
        }
        return ok(MAPPER.writeValueAsString(out));
    }

    @GetMapping("/cluster/remote-clusters")
    public ResponseEntity<String> remoteClusters() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        EsRestResponse remotes = client.perform("GET", "/_remote/info", null);
        Object remotesBody = remotes.status() >= 400 ? Collections.emptyMap()
                : MAPPER.readValue(remotes.body(), Object.class);
        out.put("remotes", remotesBody);
        out.put("count", remotesBody instanceof Map ? ((Map<?, ?>) remotesBody).size() : 0);
        if (remotes.status() >= 400) {
            out.put("reason", "HTTP " + remotes.status());
        }
        EsRestResponse root = client.perform("GET", "/", null);
        if (root.status() < 400) {
            Map<String, Object> self = MAPPER.readValue(root.body(), Map.class);
            out.put("localClusterName", self.get("cluster_name"));
            out.put("localVersion", self.get("version"));
        }
        return ok(MAPPER.writeValueAsString(out));
    }

    @GetMapping("/cluster/plugins")
    public ResponseEntity<String> plugins() throws Exception {
        if (!authenticated()) {
            return unauthorized();
        }
        EsRestResponse rows = client.perform("GET", "/_cat/plugins?format=json&v=true", null);
        if (rows.status() >= 400) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", "HTTP " + rows.status());
            return ok(MAPPER.writeValueAsString(out));
        }
        Object parsed = MAPPER.readValue(rows.body(), Object.class);
        List<Map<String, Object>> nodes = new ArrayList<>();
        if (parsed instanceof List) {
            for (Object o : (List<?>) parsed) {
                if (o instanceof Map) {
                    nodes.add((Map<String, Object>) o);
                }
            }
        }
        Map<String, Set<String>> byPlugin = new LinkedHashMap<>();
        Set<String> allNodes = new LinkedHashSet<>();
        for (Map<String, Object> row : nodes) {
            String node = String.valueOf(row.get("name"));
            String plugin = String.valueOf(row.get("component"));
            allNodes.add(node);
            byPlugin.computeIfAbsent(plugin, k -> new LinkedHashSet<>()).add(node);
        }
        List<Map<String, Object>> summary = new ArrayList<>();
        List<String> mismatches = new ArrayList<>();
        for (Map.Entry<String, Set<String>> e : byPlugin.entrySet()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("plugin", e.getKey());
            item.put("installedOn", new ArrayList<>(e.getValue()));
            item.put("count", e.getValue().size());
            boolean complete = e.getValue().size() == allNodes.size();
            item.put("complete", complete);
            summary.add(item);
            if (!complete) {
                List<String> missing = new ArrayList<>(allNodes);
                missing.removeAll(e.getValue());
                mismatches.add(e.getKey() + " 缺少节点：" + String.join(",", missing));
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("available", true);
        out.put("nodes", nodes);
        out.put("summary", summary);
        out.put("mismatches", mismatches);
        out.put("nodeCount", allNodes.size());
        out.put("pluginCount", byPlugin.size());
        return ok(MAPPER.writeValueAsString(out));
    }

    /** Phase 0: the new core has no rebuild job store yet; return an honest empty list. */
    @GetMapping("/adhoc-rebuild/jobs")
    public ResponseEntity<String> adhocJobs() {
        return bootstrapAuth ? ok("[]") : unauthorized();
    }

    private static ResponseEntity<String> ok(String body) {
        return ResponseEntity.ok().contentType(JSON).body(body);
    }

    private static ResponseEntity<String> from(EsRestResponse response) {
        return ResponseEntity.status(response.status()).contentType(JSON).body(response.body());
    }

    private static ResponseEntity<String> unauthorized() {
        return ResponseEntity.status(401).contentType(JSON)
                .body("{\"code\":\"UNAUTHORIZED\",\"message\":\"host auth not configured\"}");
    }

    @SuppressWarnings("unchecked")
    private String pagesPayload() throws Exception {
        if (pagesPayload != null) {
            return pagesPayload;
        }
        synchronized (this) {
            if (pagesPayload != null) {
                return pagesPayload;
            }
            ClassPathResource resource = new ClassPathResource("META-INF/esquerystudio-pages.json");
            Map<String, Object> root;
            try (java.io.InputStream in = resource.getInputStream()) {
                root = MAPPER.readValue(in, Map.class);
            }
            List<Map<String, Object>> contractGroups = (List<Map<String, Object>>) root.get("groups");
            List<Map<String, Object>> contractPages = (List<Map<String, Object>>) root.get("pages");
            List<Map<String, Object>> groups = new ArrayList<>();
            if (contractGroups != null) {
                for (Map<String, Object> group : contractGroups) {
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("id", group.get("id"));
                    out.put("name", group.get("name"));
                    out.put("sort", group.get("sort"));
                    List<Map<String, Object>> pages = new ArrayList<>();
                    if (contractPages != null) {
                        for (Map<String, Object> page : contractPages) {
                            if (!String.valueOf(group.get("id")).equals(String.valueOf(page.get("group")))) {
                                continue;
                            }
                            Map<String, Object> p = new LinkedHashMap<>();
                            p.put("key", page.get("key"));
                            p.put("name", page.get("name"));
                            p.put("route", page.get("route"));
                            p.put("minVer", page.get("minVer"));
                            p.put("apiPrefixes", page.get("apiPrefixes"));
                            pages.add(p);
                        }
                    }
                    out.put("pages", pages);
                    groups.add(out);
                }
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("groups", groups);
            pagesPayload = MAPPER.writeValueAsString(payload);
        }
        return pagesPayload;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> readMap(EsRestResponse response) throws Exception {
        if (response.status() >= 400 || response.body() == null || response.body().trim().isEmpty()) {
            return null;
        }
        return MAPPER.readValue(response.body(), Map.class);
    }

    private static Map<String, Object> firstMapping(Map<String, Object> raw) {
        if (raw == null) {
            return null;
        }
        for (Object value : raw.values()) {
            Object mappings = value instanceof Map ? ((Map<?, ?>) value).get("mappings") : null;
            if (mappings instanceof Map) {
                return unwrapTypeLayer((Map<String, Object>) mappings);
            }
        }
        return null;
    }

    /** Shape-tolerant: strip a single 6.x type wrapper when present; never branch on version. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> unwrapTypeLayer(Map<String, Object> mapping) {
        if (mapping == null || mapping.containsKey("properties")) {
            return mapping;
        }
        if (mapping.size() == 1) {
            Object only = mapping.values().iterator().next();
            if (only instanceof Map && ((Map<?, ?>) only).containsKey("properties")) {
                return (Map<String, Object>) only;
            }
        }
        return mapping;
    }

    private static String orEmpty(String body, String fallback) {
        return body == null || body.trim().isEmpty() ? fallback : body;
    }

    private static boolean safeIndex(String index) {
        return index != null && index.matches("[A-Za-z0-9_.,*+-]+");
    }

    private static boolean safeWriteIndex(String index) {
        return index != null && index.matches("[A-Za-z0-9_.-]+");
    }

    private boolean writesAllowed() {
        return authenticated() && allowWrites;
    }

    private Optional<ConsolePrincipal> principal() {
        if (authProvider != null) {
            Optional<ConsolePrincipal> hosted = authProvider.currentPrincipal();
            if (hosted != null && hosted.isPresent()) {
                return hosted;
            }
        }
        if (bootstrapAuth) {
            return Optional.of(new ConsolePrincipal("host", "Host Admin", "ADMIN", null));
        }
        return Optional.empty();
    }

    private boolean authenticated() {
        return principal().isPresent();
    }

    private static String jsonArray(Set<String> values) {
        if (values == null) {
            return "null";
        }
        StringBuilder out = new StringBuilder("[");
        for (String value : values) {
            if (out.length() > 1) {
                out.append(',');
            }
            out.append('"').append(escape(value)).append('"');
        }
        return out.append(']').toString();
    }

    private static ResponseEntity<String> forbidden() {
        return ResponseEntity.status(403).contentType(JSON)
                .body("{\"code\":\"FORBIDDEN\",\"message\":\"writes disabled: set esquerystudio.boot.allow-writes=true\"}");
    }

    private static String encode(String value) throws Exception {
        return URLEncoder.encode(value == null ? "" : value, "UTF-8");
    }

    private static String sqlPayload(String body) {
        String value = body == null ? "" : body.trim();
        if (value.startsWith("{")) {
            return value;
        }
        return "{\"query\":\"" + escape(value) + "\"}";
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
