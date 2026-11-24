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
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * MCP key 全量常青包（toolPack=full）：签全量包的 key 在鉴权期按「当前」action 目录
 * 扩容——服务端升级新增 action 自动可用，读写边界/ADMIN 专属/连接授权照常过滤；
 * 死枚举 key（toolPack=null）语义不变。旧全量 key 枚举一旦滞后即拒（本次修的复发痛点）。
 */
public class McpKeyToolPackTest {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }

        @Override
        public Map<String, Object> clusterHealth() {
            return Collections.<String, Object>singletonMap("status", "green");
        }
    }

    /** 只回 smartCalls 计数的最小服务桩（目录级 not-allowed 判定足够）。 */
    private static class StubMigrateService extends CrossClusterMigrateService {
        int smartCalls;

        StubMigrateService() {
            super(null, null, null, null, null, null, null, null, null);
        }

        @Override
        public Map<String, Object> smartSync(String srcConnId, String sourceIndex, String destConnId,
                String destIndex, boolean syncAliases, String downgradedAnalyzerFallback,
                boolean autoTune, boolean apply, String expectPlanDigest) {
            smartCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            out.put("applied", apply);
            return out;
        }
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> call(McpController controller, String authorization,
                                            Map<String, Object> arguments) {
        Map<String, Object> merged = new LinkedHashMap<>(arguments);
        merged.put("action", "smart_sync");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_xmigrate");
        params.put("arguments", merged);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "ss");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(authorization, req).getBody();
        return (Map<String, Object>) body.get("result");
    }

    private static String errorText(Map<String, Object> result) {
        Object content = result.get("content");
        if (content instanceof List) {
            for (Object item : (List<?>) content) {
                Object text = ((Map<?, ?>) item).get("text");
                if (text != null) return String.valueOf(text);
            }
        }
        return String.valueOf(result);
    }

    /** 场景基座：一把枚举滞后的 key（没有 smart_sync——模拟旧版本签发），常青与否是唯一变量。 */
    private static String issueKey(InMemoryMcpKeyStore store, String toolPack) {
        return (String) store.create("evergreen", "tester", "VIEWER",
                Arrays.asList("es_xmigrate:sync_structure", "es_xmigrate:probe_capabilities"),
                Collections.singletonList("host"), Collections.singletonList("read"),
                null, 60, 100, 100, null, toolPack).get("secret");
    }

    @Test
    public void 常青包自动纳入当前目录内的新action() {
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String evergreenKey = issueKey(store, "full");
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer " + evergreenKey,
                args("srcConnId", "prod", "sourceIndex", "orders", "destConnId", "host"));
        assertEquals("常青包：枚举里没有 smart_sync 也应放行（按当前目录扩容）",
                Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.smartCalls);
    }

    @Test
    public void 死枚举key对新action仍拒() {
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String legacyKey = issueKey(store, null);
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer " + legacyKey,
                args("srcConnId", "prod", "sourceIndex", "orders", "destConnId", "host"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("死枚举语义不变：must be rejected as not allowed, got: " + errorText(result),
                errorText(result).contains("not allowed"));
        assertEquals("服务面不得被触达", 0, service.smartCalls);
    }

    @Test
    public void 常青包不放宽读写边界() {
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String readOnlyEvergreen = issueKey(store, "full");
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer " + readOnlyEvergreen,
                args("srcConnId", "prod", "sourceIndex", "orders", "destConnId", "host", "apply", Boolean.TRUE));
        assertEquals("常青只扩目录命中，不越读写边界", Boolean.TRUE, result.get("isError"));
        assertTrue(errorText(result).contains("read-only"));
    }

    @Test
    public void 控制器解析与校验() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpKeyController controller = new McpKeyController(store);

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL,
                new ConsolePrincipal("admin", ConsoleRole.ADMIN, false, true, null, null, null));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "evergreen-key");
        body.put("allowedTools", Arrays.asList("es_search:search"));
        body.put("toolPack", "full");
        ResponseEntity<?> created = controller.create(body, req);
        assertEquals(201, created.getStatusCodeValue());
        Map<?, ?> key = (Map<?, ?>) ((Map<?, ?>) created.getBody()).get("key");
        assertEquals("full", key.get("toolPack"));

        String id = String.valueOf(key.get("id"));

        body.put("toolPack", "everything");
        assertEquals("非法包值拒绝", 400, controller.create(body, req).getStatusCodeValue());

        body.put("toolPack", "null");
        ResponseEntity<?> updated = controller.update(id, body, req);
        assertEquals(200, updated.getStatusCodeValue());
        assertNull("显式 null 清除常青标记", ((Map<?, ?>) updated.getBody()).get("toolPack"));
        assertNull("存储侧同步清除", store.find(id).toolPack);
    }

    @Test
    public void jdbc存储列往返() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:mcp_evergreen_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
        McpSecretCipher cipher = new McpSecretCipher("evergreen-test-master-key");
        JdbcMcpKeyStore store = new JdbcMcpKeyStore(ds, cipher);
        store.create("evergreen-jdbc", "tester", "VIEWER",
                Arrays.asList("es_search:search"), Collections.singletonList("host"),
                Collections.singletonList("read"), null, 60, 100, 100, null, "full");
        String id = store.list().isEmpty() ? null
                : String.valueOf(((Map<?, ?>) store.list().get(0)).get("id"));
        assertNotNull(id);
        assertEquals("列迁移后写读往返保持常青标记", "full", store.find(id).toolPack);

        store.update(id, "evergreen-jdbc", Arrays.asList("es_search:search"),
                Collections.singletonList("host"), Collections.singletonList("read"), null,
                60, 100, 100, null, null);
        assertNull("更新可摘除常青标记", store.find(id).toolPack);
    }
}
