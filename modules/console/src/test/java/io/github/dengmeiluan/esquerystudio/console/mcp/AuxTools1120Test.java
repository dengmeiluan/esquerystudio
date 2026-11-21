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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditQuery;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.insight.InsightService;
import io.github.dengmeiluan.esquerystudio.console.insight.analyzer.SettingsChangeAnalyzer;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorMetricsStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.RingUsageController;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * 只读辅助工具批（Scout 侦察清单收尾）的接线锁：
 * es_config_validate / es_config_drift 归 es_indices 组，
 * es_ops_audit / es_insight_settings_impact / es_ring_usage 归 es_cluster 组——
 * 组内 action 扩展不动 17 组组数；五者全 read，不进写/破坏/MRTR/TASK 清单；
 * ops_audit 的 REBUILD_OP+ 硬门与 ring_usage 的非 ADMIN 脱敏照抄 REST 口径。
 */
public class AuxTools1120Test {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }

        @Override
        public List<Map<String, Object>> listClusterIndices() {
            return Collections.emptyList();
        }

        @Override
        public Map<String, Object> reindexPreview(String index, String bodyJson) {
            return Collections.<String, Object>singletonMap("preview", true);
        }
    }

    /** 进程内固定两条流水的审计存储：只验证 MCP 分派与权限门，不测 ES 查询本身。 */
    private static ConsoleOpsAuditStore fakeAuditStore() {
        return new ConsoleOpsAuditStore() {
            @Override
            public void record(ConsoleOpsAuditEvent event) {
                /* 测试只读取侧，写入侧无需落账 */
            }

            @Override
            public List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs) {
                return Arrays.asList(
                        ConsoleOpsAuditEvent.builder()
                                .username("alice").displayName("Alice").role("ADMIN")
                                .method("POST").uri("/internal/es/index/cluster/reindex")
                                .action("REINDEX").httpStatus(200).costMs(1200L)
                                .timestamp(1771000000000L).build(),
                        ConsoleOpsAuditEvent.builder()
                                .username("bob").role("VIEWER")
                                .method("GET").uri("/internal/es/index/cluster/health")
                                .action("READ").httpStatus(200)
                                .timestamp(1771000001000L).build());
            }
        };
    }

    /** 固定占用的监控存储：环形用量只读读数，不触碰真实索引族。 */
    private static MonitorMetricsStore fakeMetricsStore() {
        return new MonitorMetricsStore(null, "esquerystudio_monitor-") {
            @Override
            public Map<String, Object> usage(String auditPrefix, long capBytes) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("auditPrefix", auditPrefix);
                out.put("monitorPrefix", "esquerystudio_monitor-");
                out.put("auditBytes", 1024L);
                out.put("monitorBytes", 2048L);
                out.put("totalBytes", 3072L);
                out.put("capBytes", capBytes);
                return out;
            }
        };
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

    private Map<String, Object> call(String name, String action, Object... argPairs) {
        Map<String, Object> arguments = args(argPairs);
        arguments.put("action", action);
        return args("name", name, "arguments", arguments);
    }

    private String errorText(Map<String, Object> result) {
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> structured(Map<String, Object> result) {
        return (Map<String, Object>) result.get("structuredContent");
    }

    /** 签发受限 key；allowedTools 用「组:action」限定名（签发面新口径）。 */
    private String issueKey(InMemoryMcpKeyStore store, String role, String... allowedTools) {
        return (String) store.create("aux-tools", "tester", role, Arrays.asList(allowedTools),
                Collections.singletonList("host"), Collections.singletonList("read"), null,
                60, 100, 100, null).get("secret");
    }

    @Test
    public void fiveAuxToolsBelongToTheirGroupsAsInGroupActions() {
        /* 组归属：config 实验室两件归 es_indices，三件控制台只读件归 es_cluster。 */
        assertEquals("es_config_validate", McpController.GROUP_ACTIONS.get("es_indices").get("config_validate"));
        assertEquals("es_config_drift", McpController.GROUP_ACTIONS.get("es_indices").get("config_drift"));
        assertEquals("es_ops_audit", McpController.GROUP_ACTIONS.get("es_cluster").get("ops_audit"));
        assertEquals("es_insight_settings_impact", McpController.GROUP_ACTIONS.get("es_cluster").get("insight_impact"));
        assertEquals("es_ring_usage", McpController.GROUP_ACTIONS.get("es_cluster").get("ring_usage"));
        /* 限定名词表能反查：实现名 →「组:action」。 */
        assertEquals("es_indices:config_validate", McpController.TOOL_ACTIONS.get("es_config_validate"));
        assertEquals("es_indices:config_drift", McpController.TOOL_ACTIONS.get("es_config_drift"));
        assertEquals("es_cluster:ops_audit", McpController.TOOL_ACTIONS.get("es_ops_audit"));
        assertEquals("es_cluster:insight_impact", McpController.TOOL_ACTIONS.get("es_insight_settings_impact"));
        assertEquals("es_cluster:ring_usage", McpController.TOOL_ACTIONS.get("es_ring_usage"));
        /* 组数不动：仍是 17 个 action 组。 */
        assertEquals(17, McpController.GROUP_TOOL_NAMES.size());
    }

    @Test
    public void allFiveAuxToolsStayReadOnly() throws Exception {
        List<String> readOnly = Arrays.asList(
                "es_config_validate", "es_config_drift", "es_ops_audit",
                "es_insight_settings_impact", "es_ring_usage");
        for (String tool : readOnly) {
            assertFalse("read-only tool must not be a write tool: " + tool,
                    McpController.WRITE_TOOLS.contains(tool));
            assertFalse("read-only tool must not be destructive: " + tool,
                    McpController.DESTRUCTIVE_TOOLS.contains(tool));
            assertFalse("read-only tool must not be admin-only: " + tool,
                    McpController.ADMIN_ONLY_TOOLS.contains(tool));
        }
        java.lang.reflect.Field mrtr = McpController.class.getDeclaredField("MRTR_CONFIRM_TOOLS");
        mrtr.setAccessible(true);
        for (String tool : readOnly) {
            assertFalse("read-only tool must not require MRTR confirmation: " + tool,
                    ((java.util.Set<String>) mrtr.get(null)).contains(tool));
        }
        java.lang.reflect.Field tasks = McpController.class.getDeclaredField("TASK_TOOLS");
        tasks.setAccessible(true);
        for (String tool : readOnly) {
            assertFalse("read-only tool must not be task-shaped: " + tool,
                    ((java.util.Set<String>) tasks.get(null)).contains(tool));
        }
    }

    @Test
    public void configLabToolsDispatchThroughGroupSurfaceAndFailFastWithoutService() {
        /* 未注入 ConfigLabService：组面分派成立（不是 Unknown action），按缺位报错。 */
        McpController c = new McpController(new FakeAdmin(), "secret");
        for (String action : Arrays.asList("config_validate", "config_drift")) {
            Map<String, Object> result = (Map<String, Object>) rpc(c, "Bearer secret", request(1, "tools/call",
                    call("es_indices", action, "settings", "{\"index.number_of_replicas\": 1}",
                            "indexKey", "research_report"))).get("result");
            assertNotNull(result);
            assertEquals(action + " must be an isError result", Boolean.TRUE, result.get("isError"));
            assertTrue(action + " must fail-fast on missing service, got: " + errorText(result),
                    errorText(result).contains("not available"));
        }
    }

    @Test
    public void insightImpactRunsTheRealAnalyzerThroughGroupSurface() {
        McpController c = new McpController(new FakeAdmin(), "secret");
        c.setInsightService(new InsightService(new SettingsChangeAnalyzer(new FakeAdmin())));
        Map<String, Object> result = (Map<String, Object>) rpc(c, "Bearer secret", request(2, "tools/call",
                call("es_cluster", "insight_impact", "index", "research_report",
                        "changes", Collections.singletonMap("index.number_of_replicas", 2)))).get("result");
        assertNotNull(result);
        assertEquals(Boolean.FALSE, result.get("isError"));
        /* 真实分析器返回的影响对象直接透传为 structuredContent。 */
        assertNotNull(structured(result));
    }

    @Test
    public void opsAuditEnforcesRank3GateAndKeepsRestWireShape() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String viewer = issueKey(store, "VIEWER", "es_cluster:ops_audit");
        String rebuildOp = issueKey(store, "REBUILD_OP", "es_cluster:ops_audit");
        McpController viewerCtl = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        viewerCtl.setConsoleOpsAuditStore(fakeAuditStore());
        McpController rank3Ctl = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        rank3Ctl.setConsoleOpsAuditStore(fakeAuditStore());

        /* VIEWER：白名单放行分派，但 REBUILD_OP+ 硬门照抄 REST，直接工具错误。 */
        Map<String, Object> denied = (Map<String, Object>) rpc(viewerCtl, "Bearer " + viewer, request(3, "tools/call",
                call("es_cluster", "ops_audit", "username", "alice", "uriPrefix", "/internal/es/index/cluster")))
                .get("result");
        assertEquals(Boolean.TRUE, denied.get("isError"));
        assertTrue("rank3 gate must mirror the REST hard gate, got: " + errorText(denied),
                errorText(denied).contains("REBUILD_OP"));

        /* REBUILD_OP：放行且按人/URI 过滤参数下推到查询对象。 */
        Map<String, Object> allowed = (Map<String, Object>) rpc(rank3Ctl, "Bearer " + rebuildOp, request(4, "tools/call",
                call("es_cluster", "ops_audit", "username", "alice", "uriPrefix", "/internal/es/index/cluster")))
                .get("result");
        assertEquals(Boolean.FALSE, allowed.get("isError"));
        Map<?, ?> wired = structured(allowed);
        List<?> records = (List<?>) wired.get("records");
        assertEquals(2, records.size());
        Map<?, ?> first = (Map<?, ?>) records.get(0);
        /* 行形状与 REST /auth/ops-audit 的 wire 一致（记录键即事件维度全集）。 */
        assertEquals("alice", first.get("username"));
        assertEquals("ADMIN", first.get("role"));
        assertEquals("POST", first.get("method"));
        assertEquals("/internal/es/index/cluster/reindex", first.get("uri"));
        assertEquals(200, first.get("httpStatus"));
        assertEquals(1200L, first.get("costMs"));
        assertEquals("console", first.get("source"));
    }

    @Test
    public void ringUsageMasksControlPlanePrefixesForNonAdminKeys() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String viewer = issueKey(store, "VIEWER", "es_cluster:ring_usage");
        McpController viewerCtl = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        viewerCtl.setRingUsageController(new RingUsageController(fakeMetricsStore(), "esquerystudio_ops_audit-", 30L * 1024 * 1024 * 1024));
        McpController serviceCtl = new McpController(new FakeAdmin(), "secret");
        serviceCtl.setRingUsageController(new RingUsageController(fakeMetricsStore(), "esquerystudio_ops_audit-", 30L * 1024 * 1024 * 1024));

        /* 非 ADMIN key：占用数值保留，控制面索引前缀脱敏（照抄 REST /ring-usage）。 */
        Map<String, Object> masked = (Map<String, Object>) rpc(viewerCtl, "Bearer " + viewer, request(5, "tools/call",
                call("es_cluster", "ring_usage"))).get("result");
        assertEquals(Boolean.FALSE, masked.get("isError"));
        Map<?, ?> maskedOut = structured(masked);
        assertFalse("non-admin must not see the audit prefix", maskedOut.containsKey("auditPrefix"));
        assertFalse("non-admin must not see the monitor prefix", maskedOut.containsKey("monitorPrefix"));
        assertEquals(3072L, maskedOut.get("totalBytes"));

        /* 静态服务 token（部署管理员）：前缀完整返回。 */
        Map<String, Object> full = (Map<String, Object>) rpc(serviceCtl, "Bearer secret", request(6, "tools/call",
                call("es_cluster", "ring_usage"))).get("result");
        assertEquals(Boolean.FALSE, full.get("isError"));
        Map<?, ?> fullOut = structured(full);
        assertEquals("esquerystudio_ops_audit-", fullOut.get("auditPrefix"));
        assertEquals("esquerystudio_monitor-", fullOut.get("monitorPrefix"));
    }

    @Test
    public void toolsListExposesNewActionsInsideTheirGroupEnums() {
        McpController c = new McpController(new FakeAdmin(), "secret");
        Map<String, Object> body = rpc(c, "Bearer secret", request(7, "tools/list", null));
        List<?> tools = (List<?>) ((Map<?, ?>) body.get("result")).get("tools");
        Map<String, Map<?, ?>> byName = new LinkedHashMap<>();
        for (Object item : tools) byName.put(String.valueOf(((Map<?, ?>) item).get("name")), (Map<?, ?>) item);
        Map<?, ?> schema = (Map<?, ?>) byName.get("es_indices").get("inputSchema");
        List<?> indicesActions = (List<?>) ((Map<?, ?>) ((Map<?, ?>) schema.get("properties")).get("action")).get("enum");
        assertTrue(indicesActions.contains("config_validate"));
        assertTrue(indicesActions.contains("config_drift"));
        Map<?, ?> clusterSchema = (Map<?, ?>) byName.get("es_cluster").get("inputSchema");
        List<?> clusterActions = (List<?>) ((Map<?, ?>) ((Map<?, ?>) clusterSchema.get("properties")).get("action")).get("enum");
        assertTrue(clusterActions.contains("ops_audit"));
        assertTrue(clusterActions.contains("insight_impact"));
        assertTrue(clusterActions.contains("ring_usage"));
    }
}
