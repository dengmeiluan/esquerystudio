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

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.*;

/**
 * 跨集群迁移写面工具（start/resume/abort/delete_jobs/sync_structure/smart_sync/throttle）
 * 的页面归属修复看守：此前 TOOL_PAGE 缺 es_xmigrate_* 映射，页面解析为 null 时可签发面
 * 与写覆盖校验双双 fail-closed——页面授权用户永远签不下迁移写工具（含 smart_sync）。
 */
public class McpXmigrateToolPageTest {

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
    public void 迁移页写授权用户可签发面包含smart_sync与start() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"));
        MockHttpServletRequest req = request(principal("mig", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:w:xmigrate"));

        List<?> tools = (List<?>) asMap(controller.list(req)).get("availableTools");
        assertTrue("smart_sync 必须出现在迁移页写授权用户的可签发面",
                tools.contains("es_xmigrate:smart_sync"));
        assertTrue(tools.contains("es_xmigrate:start"));
        assertTrue(tools.contains("es_xmigrate:sync_structure"));
    }

    @Test
    public void 无迁移页写授权时smart_sync不在可签发面() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"));
        MockHttpServletRequest req = request(principal("mig-ro", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:indices"));

        List<?> tools = (List<?>) asMap(controller.list(req)).get("availableTools");
        assertFalse(tools.contains("es_xmigrate:smart_sync"));
        assertFalse(tools.contains("es_xmigrate:start"));
        /* 读面迁移工具不受页面写授权约束，应照常可选 */
        assertTrue(tools.contains("es_xmigrate:probe_capabilities"));
        assertTrue(tools.contains("es_xmigrate:diff_structure"));
    }

    @Test
    public void 写覆盖校验按xmigrate页放行与拒绝() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa", "uat"));

        MockHttpServletRequest granted = request(principal("mig", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:w:xmigrate"));
        ResponseEntity<?> created = controller.create(body(
                "name", "mig-agent",
                "connections", Collections.singletonList("qa"),
                "connectionPermissions", body("qa", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_xmigrate:smart_sync", "es_xmigrate:start")), granted);
        assertEquals("迁移页写授权应能签下 smart_sync/start", 201, created.getStatusCodeValue());
        List<?> allowed = (List<?>) ((Map<?, ?>) asMap(created).get("key")).get("allowedTools");
        assertTrue(allowed.contains("es_xmigrate:smart_sync"));

        McpKeyController deniedController = new McpKeyController(store, connStore("qa", "uat"));
        MockHttpServletRequest denied = request(principal("other", ConsoleRole.OPERATOR,
                "conn:uat:devtools", "conn:uat:w:indices"));
        ResponseEntity<?> rejected = deniedController.create(body(
                "name", "mig-agent-2",
                "connections", Collections.singletonList("uat"),
                "connectionPermissions", body("uat", Arrays.asList("read", "write")),
                "allowedTools", Arrays.asList("es_xmigrate:smart_sync")), denied);
        assertEquals(403, rejected.getStatusCodeValue());
        assertTrue("拒绝消息应点名 xmigrate 页（而非 null）",
                String.valueOf(asMap(rejected).get("message")).contains("xmigrate"));
    }

    /** plan_apply 是迁移写面工具：与 smart_sync 同样归 xmigrate 页（缺映射时页面作用域 key 签不下）；
     *  plan_list 是读面，不受页面写授权约束。 */
    @Test
    public void 迁移页写授权用户可签发面包含plan_apply_读面plan_list不受写授权约束() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store, connStore("qa"));
        MockHttpServletRequest granted = request(principal("mig", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:w:xmigrate"));
        assertTrue("plan_apply 必须出现在迁移页写授权用户的可签发面",
                ((List<?>) asMap(controller.list(granted)).get("availableTools"))
                        .contains("es_xmigrate:plan_apply"));

        MockHttpServletRequest ungranted = request(principal("mig-ro", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:indices"));
        List<?> tools = (List<?>) asMap(controller.list(ungranted)).get("availableTools");
        assertFalse("无迁移页写授权时 plan_apply 不在可签发面", tools.contains("es_xmigrate:plan_apply"));
        assertTrue("plan_list 是读面，照常可选", tools.contains("es_xmigrate:plan_list"));

        McpKeyController deniedController = new McpKeyController(store, connStore("qa", "uat"));
        MockHttpServletRequest other = request(principal("other", ConsoleRole.OPERATOR,
                "conn:uat:devtools", "conn:uat:w:indices"));
        ResponseEntity<?> rejected = deniedController.create(body(
                "name", "plan-agent",
                "connections", Collections.singletonList("uat"),
                "connectionPermissions", body("uat", Arrays.asList("read", "write")),
                "allowedTools", Collections.singletonList("es_xmigrate:plan_apply")), other);
        assertEquals(403, rejected.getStatusCodeValue());
        assertTrue("拒绝消息应点名 xmigrate 页（而非 null）",
                String.valueOf(asMap(rejected).get("message")).contains("xmigrate"));
    }
}
