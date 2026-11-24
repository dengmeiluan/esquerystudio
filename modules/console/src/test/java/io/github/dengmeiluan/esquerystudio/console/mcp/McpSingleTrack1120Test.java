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

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * 服务端 MCP 单轨工具面的接线锁：
 * tools/list 只出 17 个 action 组、旧细粒度名直调按未知工具拒绝、
 * SSE 传输不再存在、存量细粒度白名单自动映射到「组:action」粒度、
 * 内部分类清单（写/破坏/MRTR/ADMIN/TASK）仍锚在组面可派发的内部路由名上。
 */
public class McpSingleTrack1120Test {

    private static class FakeAdmin extends EsIndexAdmin {
        String lastSearchIndex;

        FakeAdmin() { super(null); }

        @Override
        public List<Map<String, Object>> listClusterIndices() {
            return Collections.singletonList(Collections.<String, Object>singletonMap("index", "research_report"));
        }

        @Override
        public Map<String, Object> searchDsl(String index, String bodyJson, boolean explain, boolean profile) {
            lastSearchIndex = index;
            return Collections.<String, Object>singletonMap("index", index);
        }

        @Override
        public Map<String, Object> count(String index, String bodyJson) {
            return Collections.<String, Object>singletonMap("count", 1);
        }

        @Override
        public Map<String, Object> sqlQuery(String bodyJson) {
            return Collections.<String, Object>singletonMap("rows", Collections.emptyList());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> rpc(McpController controller, String authorization, Map<String, Object> request) {
        return (Map<String, Object>) controller.rpc(authorization, request).getBody();
    }

    private Map<String, Object> request(int id, String method, Map<String, Object> params) {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", id);
        req.put("method", method);
        if (params != null) req.put("params", params);
        return req;
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return out;
    }

    private String errorText(Map<String, Object> result) {
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    /** 取组工具 inputSchema.properties.action.enum。 */
    private List<?> actionEnum(Map<?, ?> tool) {
        Map<?, ?> schema = (Map<?, ?>) tool.get("inputSchema");
        Map<?, ?> properties = (Map<?, ?>) schema.get("properties");
        Map<?, ?> action = (Map<?, ?>) properties.get("action");
        return (List<?>) action.get("enum");
    }

    @Test
    public void toolsListHasExactlySeventeenGroupToolsAndZeroLegacyNames() throws Exception {
        McpController c = new McpController(new FakeAdmin(), "secret");
        Map<String, Object> body = rpc(c, "Bearer secret", request(1, "tools/list", null));
        List<?> tools = (List<?>) ((Map<?, ?>) body.get("result")).get("tools");
        assertEquals("tools/list must expose exactly the 17 action groups",
                McpController.GROUP_TOOL_NAMES.size(), tools.size());
        for (Object item : tools) {
            String name = String.valueOf(((Map<?, ?>) item).get("name"));
            assertTrue(name + " must be a group tool", McpController.GROUP_ACTIONS.containsKey(name));
            /* 组工具的 action enum 必须非空：白名单为服务 token 时是全量 action。 */
            assertFalse(actionEnum((Map<?, ?>) item).isEmpty());
        }
        /* 151 个内部路由名里，除与组名重合的三个（es_search/es_sql/es_rest）外，
           任何一个都不应出现在 tools/list 的工具名里。 */
        for (String legacy : McpController.TOOL_ACTIONS.keySet()) {
            if (McpController.GROUP_ACTIONS.containsKey(legacy)) continue;
            for (Object item : tools) {
                assertNotEquals("legacy name must not be listed: " + legacy,
                        legacy, String.valueOf(((Map<?, ?>) item).get("name")));
            }
        }
    }

    @Test
    public void directLegacyToolCallsAreRejectedAsUnknownTool() {
        McpController c = new McpController(new FakeAdmin(), "secret");
        for (String legacy : Arrays.asList("es_xmigrate_jobs", "es_cluster_health", "es_create_index")) {
            Map<String, Object> result = (Map<String, Object>) rpc(c, "Bearer secret",
                    request(2, "tools/call", args("name", legacy,
                            "arguments", args("index", "research_report")))).get("result");
            assertNotNull(legacy + " must return a result, not a protocol error", result);
            assertEquals(legacy + " must be an isError result", Boolean.TRUE, result.get("isError"));
            assertTrue(legacy + " must read as unknown tool, got: " + errorText(result),
                    errorText(result).contains("Unknown tool"));
        }
    }

    @Test
    public void sseTransportEndpointsAreGone() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new McpController(new FakeAdmin(), "secret")).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        mvc.perform(get("/mcp/sse").header("Authorization", "Bearer secret"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/mcp/message").header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}"))
                .andExpect(status().isNotFound());
        MvcResult discover = mvc.perform(get("/mcp").header("Authorization", "Bearer secret"))
                .andExpect(status().isOk())
                .andReturn();
        String bodyText = discover.getResponse().getContentAsString();
        assertFalse("discovery must not advertise SSE endpoints", bodyText.contains("sseEndpoint"));
        assertFalse(bodyText.contains("messageEndpoint"));
    }

    @Test
    public void legacyWhitelistValuesMapToActionGranularity() throws Exception {
        /* 存量 key 的白名单值是细粒度工具名（es_search/es_sql）：认证时反查到
           所属「组:action」，组面调用与目录展示都按 action 粒度生效。 */
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String secret = (String) store.create("legacy-grain", "alice", "VIEWER",
                Arrays.asList("es_search", "es_sql"), Collections.singletonList("host"),
                Collections.singletonList("read"), null, 60, 100, 100, null).get("secret");
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "", new McpAccessService(store));

        Map<String, Object> listBody = rpc(c, "Bearer " + secret, request(3, "tools/list", null));
        List<?> tools = (List<?>) ((Map<?, ?>) listBody.get("result")).get("tools");
        Map<String, Map<?, ?>> byName = new LinkedHashMap<>();
        for (Object item : tools) byName.put(String.valueOf(((Map<?, ?>) item).get("name")), (Map<?, ?>) item);
        assertTrue("es_search group must be visible", byName.containsKey("es_search"));
        List<?> searchActions = actionEnum(byName.get("es_search"));
        assertEquals("only the whitelisted action may appear", Collections.singletonList("search"), searchActions);

        Map<String, Object> search = (Map<String, Object>) rpc(c, "Bearer " + secret, request(4, "tools/call",
                args("name", "es_search", "arguments", args("action", "search", "index", "research_report"))))
                .get("result");
        assertEquals(Boolean.FALSE, search.get("isError"));
        assertEquals("research_report", admin.lastSearchIndex);

        Map<String, Object> countDenied = (Map<String, Object>) rpc(c, "Bearer " + secret, request(5, "tools/call",
                args("name", "es_search", "arguments", args("action", "count", "index", "research_report"))))
                .get("result");
        assertEquals(Boolean.TRUE, countDenied.get("isError"));
        assertTrue(errorText(countDenied).contains("not allowed"));

        /* es_sql 的白名单值映射到 es_sql:query：SQL 组只开放 query action。 */
        List<?> sqlActions = actionEnum(byName.get("es_sql"));
        assertEquals(Collections.singletonList("query"), sqlActions);
        Map<String, Object> sql = (Map<String, Object>) rpc(c, "Bearer " + secret, request(6, "tools/call",
                args("name", "es_sql", "arguments", args("action", "query", "query", "SELECT 1"))))
                .get("result");
        assertEquals(Boolean.FALSE, sql.get("isError"));
    }

    @Test
    public void classificationListsStayConsistentWithGroupSurface() throws Exception {
        /* 写/破坏/MRTR/ADMIN/TASK 清单仍以组面可派发的内部路由名为锚：
           每个条目都能从 17 个组的 action 映射到（TOOL_ACTIONS 的键空间）。 */
        for (String tool : McpController.WRITE_TOOLS) {
            assertTrue("WRITE_TOOLS entry must be a routed internal tool: " + tool,
                    McpController.TOOL_ACTIONS.containsKey(tool));
        }
        for (String tool : McpController.DESTRUCTIVE_TOOLS) {
            assertTrue("DESTRUCTIVE_TOOLS entry must be a routed internal tool: " + tool,
                    McpController.TOOL_ACTIONS.containsKey(tool));
        }
        java.lang.reflect.Field mrtr = McpServerCore.class.getDeclaredField("MRTR_CONFIRM_TOOLS");
        mrtr.setAccessible(true);
        for (String tool : (java.util.Set<String>) mrtr.get(null)) {
            assertTrue("MRTR_CONFIRM_TOOLS entry must be a routed internal tool: " + tool,
                    McpController.TOOL_ACTIONS.containsKey(tool));
        }
        for (String tool : McpController.ADMIN_ONLY_TOOLS) {
            assertTrue("ADMIN_ONLY_TOOLS entry must be a routed internal tool: " + tool,
                    McpController.TOOL_ACTIONS.containsKey(tool));
        }
        java.lang.reflect.Field tasks = McpServerCore.class.getDeclaredField("TASK_TOOLS");
        tasks.setAccessible(true);
        for (String tool : (java.util.Set<String>) tasks.get(null)) {
            assertTrue("TASK_TOOLS entry must be a routed internal tool: " + tool,
                    McpController.TOOL_ACTIONS.containsKey(tool));
        }
        /* 限定名词表与组面一致：每个「组:action」都能还原出内部路由名。 */
        assertEquals(McpController.TOOL_ACTIONS.size(), McpController.ACTION_TOOL_NAMES.size());
        for (Map.Entry<String, String> entry : McpController.ACTION_TOOLS.entrySet()) {
            assertEquals(entry.getKey(), McpController.TOOL_ACTIONS.get(entry.getValue()));
        }
    }
}
