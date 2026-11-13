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
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.*;

public class McpKeyManagementTest {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }

        @Override
        public Map<String, Object> clusterHealth() {
            return Collections.<String, Object>singletonMap("status", "green");
        }
    }

    private ConsolePrincipal principal(String username, ConsoleRole role, String... pages) {
        Set<String> granted = pages.length == 0 ? null : new LinkedHashSet<>(Arrays.asList(pages));
        return new ConsolePrincipal(username, role, false, false, null, Collections.emptyMap(), granted);
    }

    private MockHttpServletRequest request(ConsolePrincipal principal) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        return request;
    }

    private Map<String, Object> body(Object... pairs) {
        Map<String, Object> body = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) body.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return body;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(ResponseEntity<?> response) {
        return (Map<String, Object>) response.getBody();
    }

    private ConnStore connStore(String... ids) {
        Map<String, RemoteClusterConn> byId = new LinkedHashMap<>();
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (String id : ids) {
            RemoteClusterConn conn = new RemoteClusterConn("http", "127.0.0.1", 9200, null, null);
            conn.setMinRole("VIEWER");
            conn.setEnv("QA");
            byId.put(id, conn);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            row.put("name", id);
            row.put("env", "QA");
            rows.add(row);
        }
        return (ConnStore) java.lang.reflect.Proxy.newProxyInstance(
                ConnStore.class.getClassLoader(), new Class<?>[]{ConnStore.class},
                (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "list": return rows;
                        case "get": return byId.get(String.valueOf(args[0]));
                        case "getName": return String.valueOf(args[0]);
                        default: return null;
                    }
                });
    }

    @Test
    public void connScopedDevtoolsGrantAllowsMcpListAndScopedCatalog() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:w:devtools", "conn:prod:devtools"));

        ResponseEntity<?> list = controller.list(req);
        assertEquals(200, list.getStatusCodeValue());
        Map<String, Object> body = asMap(list);
        List<?> tools = (List<?>) body.get("availableTools");
        assertTrue("DevTools grant must surface the raw REST tool", tools.contains("es_rest"));

        ResponseEntity<?> create = controller.create(body(
                "name", "viewer-agent",
                "allowedTools", Arrays.asList("es_search")), req);
        assertEquals(403, create.getStatusCodeValue()); /* es_search 未在该连接授权 */
    }

    @Test
    public void operatorWithConnScopedPagesGetsCatalogButNotUngrantedTools() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ResponseEntity<?> list = controller.list(request(principal("op", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:search")));
        assertEquals(200, list.getStatusCodeValue());
        List<?> tools = (List<?>) asMap(list).get("availableTools");
        assertTrue("connection-scoped search should be selectable", tools.contains("es_search"));
        assertFalse("write tools need a write grant", tools.contains("es_index_doc"));
    }

    @Test
    public void indexPageGrantsSurfaceLifecycleToolsAndStillRequireConnectionWrite() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"));
        MockHttpServletRequest writable = request(principal("idx", ConsoleRole.OPERATOR,
                "conn:qa:devtools",
                "conn:qa:indices", "conn:qa:w:indices",
                "conn:qa:aliases", "conn:qa:w:aliases",
                "conn:qa:templates", "conn:qa:w:templates"));
        List<?> tools = (List<?>) asMap(controller.list(writable)).get("availableTools");
        for (String tool : Arrays.asList("es_create_index", "es_delete_index", "es_alias",
                "es_rollover", "es_put_template", "es_delete_template")) {
            assertTrue(tool + " must follow its page grant", tools.contains(tool));
        }
        ResponseEntity<?> created = controller.create(body(
                "name", "index-agent",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_create_index", "es_alias")), writable);
        assertEquals(201, created.getStatusCodeValue());

        McpKeyController readOnlyController = new McpKeyController(store, connStore("qa"));
        MockHttpServletRequest readOnly = request(principal("idx-ro", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:indices", "conn:qa:aliases"));
        ResponseEntity<?> denied = readOnlyController.create(body(
                "name", "index-agent-ro",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_create_index")), readOnly);
        assertEquals(403, denied.getStatusCodeValue());
    }

    @Test
    public void ownerCanUpdateKeyMetadataAndOtherUsersCannot() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        ConsolePrincipal alice = principal("alice", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:search");
        ResponseEntity<?> created = controller.create(body(
                "name", "before",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Arrays.asList("es_search", "es_count"),
                "requestsPerMinute", 60, "dailyQuota", 1000, "monthlyQuota", 5000), request(alice));
        assertEquals(201, created.getStatusCodeValue());
        Map<String, Object> key = (Map<String, Object>) asMap(created).get("key");
        String id = String.valueOf(key.get("id"));

        ResponseEntity<?> updated = controller.update(id, body(
                "name", "after",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Collections.singletonList("es_search"),
                "requestsPerMinute", 120, "dailyQuota", 2000, "monthlyQuota", 10000,
                "expiresInDays", 30), request(alice));
        assertEquals(200, updated.getStatusCodeValue());
        McpKeyRecord record = store.find(id);
        assertEquals("after", record.name);
        assertEquals(Collections.singletonList("es_search"), record.allowedTools);
        assertEquals(120, record.requestsPerMinute);
        assertEquals(2000, record.dailyQuota);
        assertNotNull(record.expiresAt);

        ResponseEntity<?> denied = controller.update(id, body(
                "name", "hijack",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Collections.singletonList("es_search")), request(principal("bob", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:search")));
        assertEquals(403, denied.getStatusCodeValue());

        assertTrue(store.revoke(id));
        ResponseEntity<?> revoked = controller.update(id, body(
                "name", "revoked",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Collections.singletonList("es_search")), request(alice));
        assertEquals(409, revoked.getStatusCodeValue());
    }

    @Test
    public void viewerCanIssueKeyScopedToOwnConnectionGrants() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:w:devtools", "conn:qa:w:browser", "conn:qa:search",
                "conn:prod:devtools", "conn:prod:search"));
        Map<String, Object> scoped = body(
                "qa", Arrays.asList("read", "write"),
                "prod", Collections.singletonList("read"));
        ResponseEntity<?> response = controller.create(body(
                "name", "viewer-scoped",
                "connections", Arrays.asList("qa", "prod"),
                "connectionPermissions", scoped,
                "allowedTools", Arrays.asList("es_search", "es_rest", "es_index_doc"),
                "requestsPerMinute", 60,
                "dailyQuota", 1000,
                "monthlyQuota", 5000), req);
        assertEquals(201, response.getStatusCodeValue());
        Map<String, Object> key = (Map<String, Object>) asMap(response).get("key");
        assertEquals("VIEWER", key.get("role"));
        McpKeyRecord record = store.find(String.valueOf(key.get("id")));
        assertEquals("VIEWER", record.role);
        assertTrue(record.canWrite("qa"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.allowedTools.contains("es_index_doc"));
    }

    @Test
    public void viewerCannotIssueWriteToolOutsideGrantedPage() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"));
        /* 只有 devtools 写页面，不能签出 browser 页面（文档写）的 es_index_doc。 */
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:w:devtools"));
        ResponseEntity<?> response = controller.create(body(
                "name", "devtools-write-only",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_index_doc")), req);
        assertEquals(403, response.getStatusCodeValue());
    }

    @Test
    public void listExposesPerConnectionWritableToolsSoUiCannotOfferBlindWrite() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:w:devtools", "conn:prod:devtools"));
        Map<String, Object> listed = asMap(controller.list(req));
        List<Map<String, Object>> conns = (List<Map<String, Object>>) listed.get("availableConnections");
        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> conn : conns) byId.put(String.valueOf(conn.get("id")), conn);

        Map<String, Object> qa = byId.get("qa");
        assertTrue(Boolean.TRUE.equals(qa.get("write")));
        List<String> qaTools = (List<String>) qa.get("writeTools");
        assertTrue(qaTools.contains("es_rest"));
        assertFalse(qaTools.contains("es_index_doc"));

        Map<String, Object> prod = byId.get("prod");
        assertFalse(Boolean.TRUE.equals(prod.get("write")));
        assertTrue(((List<?>) prod.get("writeTools")).isEmpty());
    }

    @Test
    public void viewerCannotWriteAConnectionWithNoWriteGrant() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"));
        MockHttpServletRequest req = request(principal("x1", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:prod:devtools"));
        ResponseEntity<?> response = controller.create(body(
                "name", "bad-write",
                "connections", Arrays.asList("prod"),
                "connectionPermissions", body("prod", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_search")), req);
        assertEquals(403, response.getStatusCodeValue());
    }

    @Test
    public void adminCanIssueOneKeyWithQaUatWriteAndProdReadOnly() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "uat", "prod"));
        Map<String, Object> scoped = body(
                "qa", Arrays.asList("read", "write"),
                "uat", Arrays.asList("read", "write"),
                "prod", Collections.singletonList("read"));
        ResponseEntity<?> response = controller.create(body(
                "name", "qa-uat-rw-prod-ro",
                "role", "ADMIN",
                "connections", Arrays.asList("qa", "uat", "prod"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", scoped,
                "allowedTools", Arrays.asList("es_search", "es_index_doc", "es_rest"),
                "requestsPerMinute", 60,
                "dailyQuota", 1000,
                "monthlyQuota", 5000), request(principal("root", ConsoleRole.ADMIN)));
        assertEquals(201, response.getStatusCodeValue());
        Map<String, Object> created = asMap(response);
        Map<String, Object> key = (Map<String, Object>) created.get("key");
        Map<String, List<String>> perms = (Map<String, List<String>>) key.get("connectionPermissions");
        assertTrue(perms.get("qa").contains("write"));
        assertTrue(perms.get("uat").contains("write"));
        assertFalse(perms.get("prod").contains("write"));
        McpKeyRecord record = store.find(String.valueOf(key.get("id")));
        assertTrue(record.canWrite("qa"));
        assertTrue(record.canWrite("uat"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.canRead("prod"));
        assertTrue(record.hasAnyWrite());
    }

    @Test
    public void operatorCanIssueAPersonalKeyButCannotEscalateOrUseUngrantedTools() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        MockHttpServletRequest req = request(principal("alice", ConsoleRole.OPERATOR,
                "devtools", "search", "overview"));

        Map<String, Object> created = asMap(controller.create(body(
                "name", "alice-agent",
                "allowedTools", Arrays.asList("es_search", "es_cluster_health"),
                "requestsPerMinute", 20,
                "dailyQuota", 100,
                "monthlyQuota", 1000), req));
        assertNotNull(created.get("secret"));
        Map<String, Object> key = (Map<String, Object>) created.get("key");
        assertEquals("alice", key.get("owner"));
        assertEquals("OPERATOR", key.get("role"));
        assertFalse(String.valueOf(key.get("prefix")).isEmpty());
        assertFalse(String.valueOf(created.get("secret")).equals(key.get("keyHash")));

        ResponseEntity<?> escalated = controller.create(body("name", "bad", "role", "ADMIN"), req);
        assertEquals(403, escalated.getStatusCodeValue());

        ResponseEntity<?> unGranted = controller.create(body(
                "name", "bad", "allowedTools", Arrays.asList("es_get_mapping")), req);
        assertEquals(403, unGranted.getStatusCodeValue());

        ResponseEntity<?> emptyTools = controller.create(body(
                "name", "none", "allowedTools", Collections.emptyList()), req);
        assertEquals(400, emptyTools.getStatusCodeValue());

        Map<String, Object> listed = asMap(controller.list(req));
        assertEquals(1, ((List<?>) listed.get("keys")).size());
        assertFalse(listed.get("canManageAll").equals(Boolean.TRUE));
    }

    @Test
    public void adminSeesAllKeysAndCanRevokeAnotherUsersKey() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ConsolePrincipal alice = principal("alice", ConsoleRole.OPERATOR, "devtools", "search");
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);

        Map<String, Object> created = asMap(controller.create(body(
                "name", "alice-agent",
                "allowedTools", Arrays.asList("es_search")), request(alice)));
        String id = String.valueOf(((Map<?, ?>) created.get("key")).get("id"));

        Map<String, Object> listed = asMap(controller.list(request(admin)));
        assertTrue(Boolean.TRUE.equals(listed.get("canManageAll")));
        assertEquals(1, ((List<?>) listed.get("keys")).size());

        ResponseEntity<?> denied = controller.revoke(id, request(principal("bob", ConsoleRole.OPERATOR, "devtools")));
        assertEquals(403, denied.getStatusCodeValue());
        assertEquals(200, controller.revoke(id, request(admin)).getStatusCodeValue());
        assertFalse(((McpKeyRecord) store.find(id)).enabled);
    }

    @Test
    public void managementEndpointRoutesThroughHttp() throws Exception {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore());
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(get("/internal/es/index/mcp/keys")
                        .requestAttr(ConsoleAuthInterceptor.ATTR_PRINCIPAL,
                                principal("alice", ConsoleRole.OPERATOR, "devtools")))
                .andExpect(status().isOk());
    }

    @Test
    public void adminCanIssueAWriteKeyScopedToConnections() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        Map<String, Object> created = asMap(controller.create(body(
                "name", "writer",
                "permissions", Arrays.asList("read", "write"),
                "connections", Collections.singletonList("host"),
                "allowedTools", Arrays.asList("es_search", "es_index_doc")), request(admin)));
        Map<String, Object> key = (Map<String, Object>) created.get("key");
        assertEquals(Arrays.asList("read", "write"), key.get("permissions"));
        assertEquals(Collections.singletonList("host"), key.get("connections"));

        ResponseEntity<?> operatorWrite = controller.create(body(
                "name", "operator-write", "permissions", Arrays.asList("write")),
                request(principal("alice", ConsoleRole.OPERATOR, "devtools", "search")));
        assertEquals(403, operatorWrite.getStatusCodeValue());
    }

    @Test
    public void rotationInvalidatesOldSecretAndKeepsScopes() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);
        ConsolePrincipal alice = principal("alice", ConsoleRole.OPERATOR, "devtools", "search");
        Map<String, Object> created = asMap(controller.create(body(
                "name", "rotate-me", "allowedTools", Arrays.asList("es_search")), request(alice)));
        String oldSecret = String.valueOf(created.get("secret"));
        String id = String.valueOf(((Map<?, ?>) created.get("key")).get("id"));
        Map<String, Object> rotated = asMap(controller.rotate(id, request(alice)));
        String newSecret = String.valueOf(rotated.get("secret"));
        assertFalse(oldSecret.equals(newSecret));
        assertEquals("alice", ((Map<?, ?>) rotated.get("key")).get("owner"));
        assertNull(store.authenticate(oldSecret));
        assertNotNull(store.authenticate(newSecret));
    }

    @Test
    public void viewerWithoutDevtoolsGrantCannotIssueKeys() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore());
        ResponseEntity<?> response = controller.create(body("name", "viewer-agent"),
                request(principal("viewer", ConsoleRole.VIEWER, "overview")));
        assertEquals(403, response.getStatusCodeValue());
    }

    @Test
    public void keyAuthenticationScopesToolsAndEnforcesRateLimit() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpAccessService access = new McpAccessService(store);
        Map<String, Object> created = store.create("limited", "alice", "VIEWER",
                Arrays.asList("es_cluster_health"), Collections.singletonList("host"),
                Collections.singletonList("read"), 1, 100, 1000, null);
        String secret = String.valueOf(created.get("secret"));
        McpController controller = new McpController(new FakeAdmin(), "", access);

        Map<String, Object> listRequest = body("jsonrpc", "2.0", "id", 1, "method", "tools/list");
        Map<String, Object> listBody = (Map<String, Object>) controller.rpc("Bearer " + secret, listRequest).getBody();
        List<?> tools = (List<?>) ((Map<?, ?>) listBody.get("result")).get("tools");
        assertEquals(1, tools.size());
        assertEquals("es_cluster", ((Map<?, ?>) tools.get(0)).get("name"));

        Map<String, Object> call = body("jsonrpc", "2.0", "id", 2, "method", "tools/call",
                "params", body("name", "es_cluster_health", "arguments", Collections.emptyMap()));
        assertEquals(200, controller.rpc("Bearer " + secret, call).getStatusCodeValue());
        ResponseEntity<?> limited = controller.rpc("Bearer " + secret, call);
        assertEquals(429, limited.getStatusCodeValue());
        assertNotNull(limited.getHeaders().getFirst("Retry-After"));
        assertTrue(Long.parseLong(limited.getHeaders().getFirst("Retry-After")) > 0L);
        McpKeyRecord record = store.authenticate(secret);
        assertEquals(1L, record.requestCount);
        assertEquals(1L, record.toolCounts.get("es_cluster_health").longValue());
        assertEquals("es_cluster_health", record.lastTool);
    }

    @Test
    public void writeToolsRequireWritePermissionAndConnectionScopeIsHard() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpAccessService access = new McpAccessService(store);
        Map<String, Object> created = store.create("read-only", "alice", "VIEWER",
                Arrays.asList("es_search", "es_index_doc"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 100, 1000, null);
        String secret = String.valueOf(created.get("secret"));
        McpController controller = new McpController(new FakeAdmin(), "", access);

        Map<String, Object> listBody = (Map<String, Object>) controller.rpc("Bearer " + secret,
                body("jsonrpc", "2.0", "id", 1, "method", "tools/list")).getBody();
        List<?> tools = (List<?>) ((Map<?, ?>) listBody.get("result")).get("tools");
        assertEquals(1, tools.size());
        assertEquals("es_search", ((Map<?, ?>) tools.get(0)).get("name"));

        Map<String, Object> denied = (Map<String, Object>) controller.rpc("Bearer " + secret,
                body("jsonrpc", "2.0", "id", 2, "method", "tools/call",
                        "params", body("name", "es_search",
                                "arguments", body("index", "i", "connection", "other")))).getBody();
        Map<?, ?> result = (Map<?, ?>) denied.get("result");
        assertEquals(true, result.get("isError"));
        assertTrue(((String) ((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"))
                .contains("Connection not allowed"));
    }

    @Test
    public void revokedAndExpiredKeysAreRejected() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpAccessService access = new McpAccessService(store);
        Map<String, Object> created = store.create("k", "alice", "VIEWER",
                Arrays.asList("es_cluster_health"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 100, 1000, null);
        String secret = String.valueOf(created.get("secret"));
        McpKeyRecord record = store.authenticate(secret);
        record.expiresAt = System.currentTimeMillis() - 1000L;
        try {
            access.authenticate(secret);
            fail("expired key must be rejected");
        } catch (McpAccessException e) {
            assertEquals(401, e.getStatus());
            assertEquals("MCP_KEY_EXPIRED", e.getCode());
        }
        record.expiresAt = null;
        store.revoke(record.id);
        try {
            access.authenticate(secret);
            fail("revoked key must be rejected");
        } catch (McpAccessException e) {
            assertEquals("MCP_KEY_REVOKED", e.getCode());
        }
    }
    @Test
    public void adminOnlySystemToolsAreNotOfferedToOperators() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore());
        ConsolePrincipal operator = principal("op", ConsoleRole.OPERATOR,
                "conn:host:devtools", "conn:host:snapshots", "conn:host:watcher", "conn:host:reindex-advanced");
        List<?> tools = (List<?>) asMap(controller.list(request(operator))).get("availableTools");
        for (String tool : Arrays.asList("es_put_watch", "es_put_slm_policy", "es_put_transform",
                "es_put_snapshot_repo", "es_cluster_state")) {
            assertFalse("operator must not see ADMIN-only tool " + tool, tools.contains(tool));
        }
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN, "*");
        Map<String, Object> adminMeta = asMap(controller.list(request(admin)));
        List<?> adminTools = (List<?>) adminMeta.get("availableTools");
        assertTrue(adminTools.contains("es_put_watch"));
        assertTrue(((List<?>) adminMeta.get("adminOnlyTools")).contains("es_put_watch"));
        assertEquals(Collections.emptyList(), ((List<?>) asMap(controller.list(request(operator))).get("adminOnlyTools")));
        ResponseEntity<?> denied = controller.create(body(
                "name", "bad-admin-tool", "allowedTools", Arrays.asList("es_put_watch")), request(operator));
        assertEquals(403, denied.getStatusCodeValue());
        /* ADMIN 签发 OPERATOR key 时也不能把系统管理工具写进快照，否则该 key 永远拿不到该工具。 */
        ResponseEntity<?> wrongRole = controller.create(body(
                "name", "operator-with-watch", "role", "OPERATOR",
                "permissions", Arrays.asList("read", "write"),
                "allowedTools", Arrays.asList("es_put_watch")), request(admin));
        assertEquals(403, wrongRole.getStatusCodeValue());
    }

    @Test
    public void adminCannotIssueHigherRoleThanResolvedOwnerRole() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("host"),
                username -> "alice".equals(username) ? "VIEWER" : null);
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN, "*");
        ResponseEntity<?> denied = controller.create(body(
                "name", "too-high", "owner", "alice", "role", "OPERATOR",
                "permissions", Arrays.asList("read"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_list_indices")), request(admin));
        assertEquals(403, denied.getStatusCodeValue());
        ResponseEntity<?> allowed = controller.create(body(
                "name", "same-role", "owner", "alice", "role", "VIEWER",
                "permissions", Arrays.asList("read"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_list_indices")), request(admin));
        assertEquals(201, allowed.getStatusCodeValue());
    }

    @Test
    public void adminCannotIssueWritePermissionToViewerOwner() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("host"),
                username -> "alice".equals(username) ? "VIEWER" : null);
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN, "*");
        ResponseEntity<?> denied = controller.create(body(
                "name", "viewer-write", "owner", "alice", "role", "VIEWER",
                "permissions", Arrays.asList("read", "write"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_index_doc")), request(admin));
        assertEquals(403, denied.getStatusCodeValue());
        ResponseEntity<?> allowed = controller.create(body(
                "name", "viewer-read", "owner", "alice", "role", "VIEWER",
                "permissions", Arrays.asList("read"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_list_indices")), request(admin));
        assertEquals(201, allowed.getStatusCodeValue());
    }

    @Test
    public void adminCanIssueWriteKeyToResolvedOperatorOwner() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("host"),
                username -> "alice".equals(username) ? "OPERATOR" : null);
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN, "*");
        ResponseEntity<?> allowed = controller.create(body(
                "name", "operator-write", "owner", "alice", "role", "OPERATOR",
                "permissions", Arrays.asList("read", "write"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_index_doc")), request(admin));
        assertEquals(201, allowed.getStatusCodeValue());
    }

    @Test
    public void unresolvedOwnerRoleFailsClosedForElevatedOrWriteKeys() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("host"));
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN, "*");
        ResponseEntity<?> write = controller.create(body(
                "name", "unknown-owner-write", "owner", "alice", "role", "VIEWER",
                "permissions", Arrays.asList("read", "write"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_index_doc")), request(admin));
        assertEquals(403, write.getStatusCodeValue());
        ResponseEntity<?> elevated = controller.create(body(
                "name", "unknown-owner-operator", "owner", "alice", "role", "OPERATOR",
                "permissions", Arrays.asList("read"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_search")), request(admin));
        assertEquals(403, elevated.getStatusCodeValue());
        ResponseEntity<?> readOnly = controller.create(body(
                "name", "unknown-owner-read", "owner", "alice", "role", "VIEWER",
                "permissions", Arrays.asList("read"), "connections", Arrays.asList("host"),
                "allowedTools", Arrays.asList("es_list_indices")), request(admin));
        assertEquals(201, readOnly.getStatusCodeValue());
    }

    @Test
    public void groupNameExpandsToLegacyActions() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("host"));
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN, "*");
        ResponseEntity<?> created = controller.create(body(
                "name", "group-indices", "allowedTools", Arrays.asList("es_indices"),
                "permissions", Arrays.asList("read", "write"), "connections", Arrays.asList("host"),
                "connectionPermissions", Collections.singletonMap("host", Arrays.asList("read", "write"))), request(admin));
        assertEquals(201, created.getStatusCodeValue());
        List<?> keys = (List<?>) asMap(controller.list(request(admin))).get("keys");
        List<?> tools = (List<?>) ((Map<?, ?>) keys.get(0)).get("allowedTools");
        assertTrue(tools.contains("es_list_indices"));
        assertTrue(tools.contains("es_create_index"));
        assertTrue(tools.contains("es_index_segments"));
    }

    @Test
    public void recordCallKeepsLatestHundred() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, Object> created = store.create("audit-window", "alice", "OPERATOR",
                Arrays.asList("es_search"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 1000, 1000, null);
        String id = String.valueOf(((Map<?, ?>) created.get("key")).get("id"));
        McpKeyRecord record = store.find(id);
        McpAccessService service = new McpAccessService(store);
        for (int i = 0; i < 120; i++) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("requestId", "req-" + i);
            meta.put("ip", "203.0.113.9");
            service.recordCall(record, "tools/call", "es_search", meta, true, 1L);
        }
        assertEquals(100, record.recentCalls.size());
        assertEquals("req-119", record.recentCalls.get(0).get("requestId"));
        assertEquals("req-20", record.recentCalls.get(99).get("requestId"));
    }

    @Test
    public void recordCallPersistsClientIpMethodStatusAndDuration() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, Object> created = store.create("audit", "alice", "OPERATOR",
                Arrays.asList("es_search"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 100, 100, null);
        String id = String.valueOf(((Map<?, ?>) created.get("key")).get("id"));
        McpKeyRecord record = store.find(id);
        assertNotNull(record);
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("requestId", "req-probe-1");
        meta.put("ip", "203.0.113.9");
        meta.put("remoteIp", "10.0.0.4");
        meta.put("ua", "probe/1.0");
        meta.put("http", "POST /mcp");
        new McpAccessService(store).recordCall(record, "tools/call", "es_search", meta, false, 37L);
        Map<String, Object> call = record.recentCalls.get(0);
        assertEquals("tools/call", call.get("method"));
        assertEquals("es_search", call.get("tool"));
        assertEquals("req-probe-1", call.get("requestId"));
        assertEquals("203.0.113.9", call.get("ip"));
        assertEquals("10.0.0.4", call.get("remoteIp"));
        assertEquals(false, call.get("ok"));
        assertEquals(37L, call.get("ms"));
        McpKeyRecord reloaded = store.find(id);
        assertEquals("203.0.113.9", reloaded.recentCalls.get(0).get("ip"));
    }

    /** 宿主用户目录 + 页面授权都可知时的代签测试桩。 */
    private static final class ScopedOwnerResolver implements McpKeyOwnerResolver {
        private final String role;
        private final Set<String> pages;

        ScopedOwnerResolver(String role, String... pages) {
            this.role = role;
            this.pages = pages == null ? null : new LinkedHashSet<>(Arrays.asList(pages));
        }

        @Override
        public String roleOf(String username) {
            return "alice".equals(username) ? role : null;
        }

        @Override
        public Set<String> pagesOf(String username) {
            return "alice".equals(username) ? pages : null;
        }
    }

    @Test
    public void builtInOperatorWithoutPageModelCanIssueWriteKey() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"));
        ConsolePrincipal operator = principal("op", ConsoleRole.OPERATOR);
        ResponseEntity<?> created = controller.create(body(
                "name", "builtin-writer",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_search", "es_index_doc")), request(operator));
        assertEquals(201, created.getStatusCodeValue());
        McpKeyRecord record = store.find(String.valueOf(((Map<?, ?>) asMap(created).get("key")).get("id")));
        assertTrue("内置 OPERATOR 的写权限必须与角色门一致", record.canWrite("qa"));
        assertTrue(record.allowedTools.contains("es_index_doc"));
    }

    @Test
    public void builtInViewerCannotIssueWriteKey() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"));
        ResponseEntity<?> denied = controller.create(body(
                "name", "builtin-viewer-writer",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_search")), request(principal("viewer", ConsoleRole.VIEWER)));
        assertEquals(403, denied.getStatusCodeValue());
    }

    @Test
    public void builtInOperatorCatalogExcludesAdminOnlyTools() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore());
        List<?> tools = (List<?>) asMap(controller.list(request(principal("op", ConsoleRole.OPERATOR)))).get("availableTools");
        assertFalse("内置 OPERATOR 不得在目录里看到仅 ADMIN 工具", tools.contains("es_put_watch"));
        assertTrue(tools.contains("es_search"));
    }

    @Test
    public void adminDelegatedQuotaIsCappedByOwnerRole() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("qa"),
                new ScopedOwnerResolver("OPERATOR", "conn:qa:devtools", "conn:qa:search"));
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        ResponseEntity<?> response = controller.create(body(
                "name", "owner-quota",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Arrays.asList("es_search"),
                "requestsPerMinute", 600,
                "dailyQuota", 200000,
                "monthlyQuota", 5000000,
                "expiresInDays", 3650), request(admin));
        assertEquals("ADMIN 配额不能下沉给 OPERATOR 目标用户", 400, response.getStatusCodeValue());
        ResponseEntity<?> allowed = controller.create(body(
                "name", "owner-quota-ok",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Arrays.asList("es_search"),
                "requestsPerMinute", 120,
                "dailyQuota", 20000,
                "monthlyQuota", 500000,
                "expiresInDays", 90), request(admin));
        assertEquals(201, allowed.getStatusCodeValue());
    }

    @Test
    public void adminDelegatedKeyCannotExceedOwnerConnectionPages() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"),
                new ScopedOwnerResolver("OPERATOR", "conn:qa:devtools", "conn:qa:search"));
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        ResponseEntity<?> allowed = controller.create(body(
                "name", "owner-scoped",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Arrays.asList("es_search")), request(admin));
        assertEquals(201, allowed.getStatusCodeValue());

        ResponseEntity<?> wrongConn = controller.create(body(
                "name", "owner-scope-overreach",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("prod"),
                "permissions", Collections.singletonList("read"),
                "allowedTools", Arrays.asList("es_search")), request(admin));
        assertEquals(403, wrongConn.getStatusCodeValue());

        ResponseEntity<?> wrongTool = controller.create(body(
                "name", "owner-tool-overreach",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Arrays.asList("es_get_mapping")), request(admin));
        assertEquals(403, wrongTool.getStatusCodeValue());
    }

    @Test
    public void ownerScopePreviewReturnsTargetRoleAndConnections() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("qa", "prod"),
                new ScopedOwnerResolver("OPERATOR", "conn:qa:devtools", "conn:qa:search"));
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        ResponseEntity<?> response = controller.ownerScope("alice", request(admin));
        assertEquals(200, response.getStatusCodeValue());
        Map<String, Object> body = asMap(response);
        assertEquals("OPERATOR", body.get("role"));
        assertEquals(Boolean.TRUE, body.get("pagesKnown"));
        List<?> connections = (List<?>) body.get("connections");
        assertEquals(1, connections.size());
        assertEquals("qa", ((Map<?, ?>) connections.get(0)).get("id"));
        List<?> tools = (List<?>) body.get("availableTools");
        assertTrue(tools.contains("es_search"));
        assertFalse("目标用户没有 mapping 页权限，预览里不能出现", tools.contains("es_get_mapping"));
    }

    @Test
    public void ownerScopeForAdminTargetKeepsAdminOnlyTools() {
        McpKeyController controller = new McpKeyController(new InMemoryMcpKeyStore(), connStore("qa"),
                new McpKeyOwnerResolver() {
                    @Override public String roleOf(String username) { return "alice".equals(username) ? "ADMIN" : null; }
                    @Override public java.util.Set<String> pagesOf(String username) { return null; }
                });
        ResponseEntity<?> response = controller.ownerScope("alice", request(principal("root", ConsoleRole.ADMIN)));
        assertEquals(200, response.getStatusCodeValue());
        List<?> tools = (List<?>) asMap(response).get("availableTools");
        assertTrue("ADMIN 目标用户不应被漏发系统管理工具", tools.contains("es_put_watch"));
        List<Map<String, Object>> connections = (List<Map<String, Object>>) asMap(response).get("connections");
        assertTrue(((List<?>) connections.get(0).get("writeTools")).contains("es_put_watch"));
    }

    @Test
    public void adminDelegatedWriteFollowsOwnerPageGrantNotJustRole() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"),
                new ScopedOwnerResolver("OPERATOR", "conn:qa:devtools", "conn:qa:search"));
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        ResponseEntity<?> denied = controller.create(body(
                "name", "owner-write-no-grant",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_index_doc")), request(admin));
        assertEquals(403, denied.getStatusCodeValue());

        McpKeyController writable = new McpKeyController(store, connStore("qa"),
                new ScopedOwnerResolver("OPERATOR", "conn:qa:devtools", "conn:qa:w:devtools"));
        ResponseEntity<?> allowed = writable.create(body(
                "name", "owner-write-granted",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("qa"),
                "permissions", Collections.singletonList("read"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_rest")), request(admin));
        assertEquals(201, allowed.getStatusCodeValue());
    }

    @Test
    public void adminDelegatedRoleOnlyResolverStaysFailClosedForUnknownConnections() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "prod"),
                username -> "alice".equals(username) ? "OPERATOR" : null);
        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        ResponseEntity<?> denied = controller.create(body(
                "name", "unknown-pages",
                "owner", "alice", "role", "OPERATOR",
                "connections", Collections.singletonList("prod"),
                "permissions", Collections.singletonList("read"),
                "allowedTools", Arrays.asList("es_search")), request(admin));
        assertEquals(403, denied.getStatusCodeValue());
    }

    @Test
    public void savedFullSecretCanBeRevealedByOwnerAndAdminButNeverLeaksInList() {
        McpSecretCipher cipher = new McpSecretCipher("unit-test-mcp-master-key");
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore(cipher);
        McpKeyController controller = new McpKeyController(store, connStore("qa"), null, cipher);
        ConsolePrincipal alice = principal("alice", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:search");
        ResponseEntity<?> created = controller.create(body(
                "name", "saved-secret",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Arrays.asList("es_search")), request(alice));
        assertEquals(201, created.getStatusCodeValue());
        Map<String, Object> createdMap = asMap(created);
        String secret = String.valueOf(createdMap.get("secret"));
        Map<String, Object> key = (Map<String, Object>) createdMap.get("key");
        String id = String.valueOf(key.get("id"));
        assertEquals(Boolean.TRUE, key.get("secretSaved"));
        assertFalse("redacted must never include ciphertext", key.containsKey("secretEncrypted"));

        ResponseEntity<?> revealed = controller.revealSecret(id, request(alice));
        assertEquals(200, revealed.getStatusCodeValue());
        assertEquals(secret, asMap(revealed).get("secret"));

        ResponseEntity<?> denied = controller.revealSecret(id, request(principal("bob", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:search")));
        assertEquals(403, denied.getStatusCodeValue());

        ConsolePrincipal admin = principal("root", ConsoleRole.ADMIN);
        ResponseEntity<?> adminReveal = controller.revealSecret(id, request(admin));
        assertEquals(200, adminReveal.getStatusCodeValue());
        assertEquals(secret, asMap(adminReveal).get("secret"));
    }

    @Test
    public void legacyKeyWithoutSavedSecretReturnsExplicitRotateCode() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"), null,
                new McpSecretCipher("unit-test-mcp-master-key"));
        ConsolePrincipal alice = principal("alice", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:search");
        ResponseEntity<?> created = controller.create(body(
                "name", "legacy-secret",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Collections.singletonList("read")),
                "allowedTools", Arrays.asList("es_search")), request(alice));
        assertEquals(201, created.getStatusCodeValue());
        Map<String, Object> key = (Map<String, Object>) asMap(created).get("key");
        String id = String.valueOf(key.get("id"));
        assertEquals(Boolean.FALSE, key.get("secretSaved"));
        ResponseEntity<?> reveal = controller.revealSecret(id, request(alice));
        assertEquals(409, reveal.getStatusCodeValue());
        assertEquals("MCP_KEY_SECRET_NOT_SAVED", asMap(reveal).get("code"));
    }

    @Test
    public void cipherRoundTripAndTamperDetection() {
        McpSecretCipher cipher = new McpSecretCipher("unit-test-mcp-master-key");
        String encrypted = cipher.encrypt("esq_mcp_demo.secret-value");
        assertNotNull(encrypted);
        assertFalse("ciphertext must not contain plaintext", encrypted.contains("secret-value"));
        assertEquals("esq_mcp_demo.secret-value", cipher.decrypt(encrypted));
        assertNull(cipher.decrypt(encrypted.substring(0, encrypted.length() - 2)));
        McpSecretCipher other = new McpSecretCipher("another-master-key");
        assertNull(other.decrypt(encrypted));
    }

}
