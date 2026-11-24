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
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorHistoryStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.MonitorMetricsStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * 5 个只读工具（es_xmigrate 扩 2 + 现有组扩 3）的 MCP 接线锁：
 * case 分派、组归属、连接参数缺失拒绝、reconcile 双侧计数组装与 fail-fast 边界。
 */
public class ReconcileTools1120Test {

    private static final List<String> NEW_TOOLS = Collections.unmodifiableList(Arrays.asList(
            "es_xmigrate_reconcile", "es_xmigrate_conflicts", "es_connection_probe",
            "es_monitor_metrics", "es_monitor_history"));

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }
    }

    /** 桩掉迁移编排：progress 供 conflicts/reconcile 周边断言（不触碰真实 ES）。 */
    private static class StubMigrateService extends CrossClusterMigrateService {
        final MigrateJobES job = new MigrateJobES();

        StubMigrateService() {
            super(null, null, null, null, null, null, null, null, null);
            job.setJobId("xm-job-1");
            job.setSourceIndex("legacy_orders");
            job.setDestIndex("orders_v2");
            job.setSrcConnId("legacy-src");
            job.setStatus("DONE");
            job.setConflicts(12345L);
            job.setConflictSamples(Arrays.asList("id-1", "id-2", "id-3"));
        }

        @Override
        public MigrateJobES progress(String jobId) {
            if (!"xm-job-1".equals(jobId)) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            return job;
        }
    }

    private static class StubConnStore implements ConnStore {
        final RemoteClusterConn conn;

        StubConnStore() {
            conn = new RemoteClusterConn("http", "10.0.0.9", 9200, "legacy", "pw");
            conn.setMinRole("VIEWER");
        }

        @Override
        public List<Map<String, Object>> list() { return Collections.emptyList(); }

        @Override
        public RemoteClusterConn get(String id) {
            return "legacy-src".equals(id) || "qa".equals(id) ? conn : null;
        }

        @Override
        public String getName(String id) { return null; }

        @Override
        public String getVersion(String id) { return null; }

        @Override
        public Map<String, Object> save(String id, String name, String url, String username, String password,
                                         String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void updateVersion(String id, String esVersion) { /* no-op */ }

        @Override
        public void delete(String id) { /* no-op */ }
    }

    /** 双侧计数钩子替换：源/目标计数不触碰真实集群，记录传参供断言。 */
    private static class CountingController extends McpController {
        Long sourceCount = 30114L;
        Long destCount = 10000L;
        RemoteClusterConn lastSourceConn;
        String lastSourceIndex;
        String lastDestIndex;

        CountingController() {
            super(new FakeAdmin(), "secret", null, null, new StubConnStore());
        }

        @Override
        protected Long xmigrateReconcileSourceCount(RemoteClusterConn conn, String sourceIndex) {
            this.lastSourceConn = conn;
            this.lastSourceIndex = sourceIndex;
            return sourceCount;
        }

        @Override
        protected Long xmigrateReconcileDestCount(String destIndex) {
            this.lastDestIndex = destIndex;
            return destCount;
        }
    }

    /** 探活桩：记录被探的连接 id，返回固定健康面。 */
    private static class StubProber
            extends io.github.dengmeiluan.esquerystudio.console.multicluster.ConnHealthProber {
        String lastProbedId;

        StubProber() { super(null, null, 30); }

        @Override
        public Map<String, Object> probeOne(String connId) {
            this.lastProbedId = connId;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", "GREEN");
            out.put("latencyMs", 12L);
            out.put("lastProbeAt", 1774000000000L);
            out.put("error", null);
            out.put("version", "7.17.9");
            return out;
        }
    }

    /** 指标时序桩：记录查询参数，回一条固定记录。 */
    private static class StubMetricsStore extends MonitorMetricsStore {
        String lastConnId;
        String lastScope;
        int lastSize = -1;
        Long lastFromMs;
        Long lastToMs;
        String lastInterval;

        StubMetricsStore() { super(() -> null, "esquerystudio_monitor"); }

        @Override
        public List<Map<String, Object>> search(String connId, String connName, String scope, int size, int from,
                                                Long fromMs, Long toMs) {
            this.lastConnId = connId;
            this.lastScope = scope;
            this.lastSize = size;
            this.lastFromMs = fromMs;
            this.lastToMs = toMs;
            List<Map<String, Object>> rows = new ArrayList<>();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("connId", connId);
            rows.add(row);
            return rows;
        }

        @Override
        public List<Map<String, Object>> searchAgg(String connId, String connName, String scope,
                                                    Long fromMs, Long toMs, String interval, String agg) {
            this.lastConnId = connId;
            this.lastScope = scope;
            this.lastInterval = interval;
            this.lastFromMs = fromMs;
            this.lastToMs = toMs;
            return Collections.singletonList(new LinkedHashMap<>(Collections.singletonMap("interval", interval)));
        }
    }

    /** 探活历史桩：记录查询参数，回一条固定记录。 */
    private static class StubHistoryStore extends MonitorHistoryStore {
        String lastConnId;
        String lastStatus;
        int lastSize = -1;
        Long lastFromMs;
        Long lastToMs;

        StubHistoryStore() { super(() -> null, "esquerystudio_monitor"); }

        @Override
        public List<Map<String, Object>> search(String connId, String status, int size, int from,
                                                Long fromMs, Long toMs) {
            this.lastConnId = connId;
            this.lastStatus = status;
            this.lastSize = size;
            this.lastFromMs = fromMs;
            this.lastToMs = toMs;
            return Collections.singletonList(new LinkedHashMap<>(Collections.singletonMap("status", "GREEN")));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> call(McpController controller, String authorization, String name,
                                     Map<String, Object> arguments) {
        Map<String, Object> params = new LinkedHashMap<>();
        String qualified = McpController.TOOL_ACTIONS.get(name);
        if (qualified == null) {
            params.put("name", name);
            params.put("arguments", arguments);
        } else {
            /* 内部路由名自动换算成「组 + action」的客户端调用形状。 */
            int colon = qualified.indexOf(':');
            Map<String, Object> merged = new LinkedHashMap<>();
            merged.put("action", qualified.substring(colon + 1));
            merged.putAll(arguments);
            params.put("name", qualified.substring(0, colon));
            params.put("arguments", merged);
        }
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "rc");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(authorization, req).getBody();
        return (Map<String, Object>) body.get("result");
    }

    private String errorText(Map<String, Object> result) {
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }

    @Test
    public void fiveToolsRegisteredAndGrouped() {
        for (String tool : NEW_TOOLS) {
            assertTrue("TOOL_ACTIONS must contain " + tool, McpController.TOOL_ACTIONS.containsKey(tool));
            assertFalse(tool + " is read-only", McpController.WRITE_TOOLS.contains(tool));
            assertFalse(tool + " is not destructive", McpController.DESTRUCTIVE_TOOLS.contains(tool));
        }
        Map<String, String> connections = McpController.GROUP_ACTIONS.get("es_connections");
        assertEquals("es_connection_probe", connections.get("probe"));
        Map<String, String> cluster = McpController.GROUP_ACTIONS.get("es_cluster");
        assertEquals("es_monitor_metrics", cluster.get("monitor_metrics"));
        assertEquals("es_monitor_history", cluster.get("monitor_history"));
        Map<String, String> xmigrate = McpController.GROUP_ACTIONS.get("es_xmigrate");
        assertEquals("es_xmigrate_reconcile", xmigrate.get("reconcile"));
        assertEquals("es_xmigrate_conflicts", xmigrate.get("conflicts"));
        assertEquals(17, McpController.GROUP_ACTIONS.size());
    }

    @Test
    public void fiveToolsFailFastWithoutServices() {
        /* 直建形态（短构造器）不注入任何服务面：5 个工具必须以 isError 明确拒绝。 */
        McpController controller = new McpController(new FakeAdmin(), "secret");
        for (String tool : NEW_TOOLS) {
            Map<String, Object> arguments = new LinkedHashMap<>();
            arguments.put("srcConnId", "legacy-src");
            arguments.put("sourceIndex", "legacy_orders");
            arguments.put("destConnId", "host");
            arguments.put("destIndex", "orders_v2");
            arguments.put("jobId", "xm-job-1");
            arguments.put("connection", "qa");
            Map<String, Object> result = call(controller, "Bearer secret", tool, arguments);
            assertNotNull(tool + " must return a result, not a protocol error", result);
            assertEquals(tool + " must be an isError result", Boolean.TRUE, result.get("isError"));
        }
        /* 每个工具的报错文案指向自己缺的服务面（不串味）。 */
        assertTrue(errorText(call(controller, "Bearer secret", "es_xmigrate_reconcile",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "host", "destIndex", "orders_v2")))
                .contains("Cross-cluster migrate service is not available"));
        assertTrue(errorText(call(controller, "Bearer secret", "es_xmigrate_conflicts",
                args("jobId", "xm-job-1"))).contains("Cross-cluster migrate service is not available"));
        /* probe 的缺位文案：带 router/connStore 直建（target 校验可过），只缺探活器。 */
        McpController probeless = new McpController(new FakeAdmin(), "secret", null,
                new EsClientRouter(null, null, null), new StubConnStore());
        assertTrue(errorText(call(probeless, "Bearer secret", "es_connection_probe",
                args("connection", "qa"))).contains("Connection health prober is not available"));
        assertTrue(errorText(call(controller, "Bearer secret", "es_monitor_metrics", new LinkedHashMap<>()))
                .contains("Monitor metrics store is not available"));
        assertTrue(errorText(call(controller, "Bearer secret", "es_monitor_history", new LinkedHashMap<>()))
                .contains("Monitor history store is not available"));
    }

    @Test
    public void reconcileAssemblesBothCounts() {
        CountingController controller = new CountingController();
        controller.setCrossClusterMigrateService(new StubMigrateService());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_reconcile", args(
                "srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                "destConnId", "host", "destIndex", "orders_v2"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        Map<?, ?> view = (Map<?, ?>) result.get("structuredContent");
        /* 双侧计数组装：srcCount/destCount/diff 一次返回（diff=源-目标，缺失为正数）。 */
        assertEquals(30114L, view.get("srcCount"));
        assertEquals(10000L, view.get("destCount"));
        assertEquals(20114L, view.get("diff"));
        assertEquals("legacy_orders", view.get("sourceIndex"));
        assertEquals("orders_v2", view.get("destIndex"));
        assertEquals("host", view.get("destConnId"));
        /* 源侧档案解析走 ConnStore（缺档案/缺参数拒绝内联凭据通道）。 */
        assertNotNull(controller.lastSourceConn);
        assertEquals("legacy_orders", controller.lastSourceIndex);
        assertEquals("orders_v2", controller.lastDestIndex);

        /* 分组调用归一化：action=reconcile 派发到同一 case。 */
        Map<String, Object> groupCall = call(controller, "Bearer secret", "es_xmigrate",
                args("action", "reconcile", "srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "host", "destIndex", "orders_v2"));
        assertEquals(Boolean.FALSE, groupCall.get("isError"));
        assertEquals(20114L, ((Map<?, ?>) groupCall.get("structuredContent")).get("diff"));

        /* 单侧计数不可得时 diff 如实为 null，不猜零。 */
        controller.destCount = null;
        Map<String, Object> unknown = call(controller, "Bearer secret", "es_xmigrate_reconcile", args(
                "srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                "destConnId", "host", "destIndex", "orders_v2"));
        assertNull(((Map<?, ?>) unknown.get("structuredContent")).get("diff"));
    }

    @Test
    public void reconcileRejectsMissingAndUnknownInputs() {
        CountingController controller = new CountingController();
        controller.setCrossClusterMigrateService(new StubMigrateService());

        /* 缺 srcConnId：与组内其余工具同口径（只认已存源档案）。 */
        Map<String, Object> noSrc = call(controller, "Bearer secret", "es_xmigrate_reconcile", args(
                "sourceIndex", "legacy_orders", "destConnId", "host", "destIndex", "orders_v2"));
        assertEquals(Boolean.TRUE, noSrc.get("isError"));
        assertTrue("missing srcConnId must be rejected, got: " + errorText(noSrc),
                errorText(noSrc).contains("srcConnId"));
        /* 源档案不存在：如实拒绝。 */
        Map<String, Object> badSrc = call(controller, "Bearer secret", "es_xmigrate_reconcile", args(
                "srcConnId", "nope", "sourceIndex", "legacy_orders",
                "destConnId", "host", "destIndex", "orders_v2"));
        assertEquals(Boolean.TRUE, badSrc.get("isError"));
        assertTrue(errorText(badSrc).contains("连接不存在"));
        /* 目标连接路由缺位（直建无 router）：非 host 的 destConnId 不允许静默回落宿主。 */
        Map<String, Object> noRoute = call(controller, "Bearer secret", "es_xmigrate_reconcile", args(
                "srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                "destConnId", "qa", "destIndex", "orders_v2"));
        assertEquals(Boolean.TRUE, noRoute.get("isError"));
        assertTrue("dest routing must be explicit, got: " + errorText(noRoute),
                errorText(noRoute).contains("Connection routing is not available"));
    }

    @Test
    public void conflictsReturnsSamplesAndCap() {
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(new StubMigrateService());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_conflicts",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        Map<?, ?> view = (Map<?, ?>) result.get("structuredContent");
        assertEquals("xm-job-1", view.get("jobId"));
        assertEquals(12345L, view.get("conflicts"));
        assertEquals(Arrays.asList("id-1", "id-2", "id-3"), view.get("conflictSamples"));
        assertEquals(1000, view.get("sampleCap"));

        /* 作业不存在如实报错；缺 jobId 走参数校验。 */
        Map<String, Object> missing = call(controller, "Bearer secret", "es_xmigrate_conflicts",
                args("jobId", "nope"));
        assertEquals(Boolean.TRUE, missing.get("isError"));
        Map<String, Object> noArg = call(controller, "Bearer secret", "es_xmigrate_conflicts", new LinkedHashMap<>());
        assertEquals(Boolean.TRUE, noArg.get("isError"));
        assertTrue(errorText(noArg).contains("Missing required argument: jobId"));
    }

    @Test
    public void connectionProbeDispatchesToProber() {
        StubProber prober = new StubProber();
        McpController controller = new McpController(new FakeAdmin(), "secret", null,
                new EsClientRouter(null, null, null), new StubConnStore());
        controller.setConnHealthProber(prober);

        Map<String, Object> result = call(controller, "Bearer secret", "es_connection_probe",
                args("connection", "qa"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals("qa", prober.lastProbedId);
        assertEquals("GREEN", ((Map<?, ?>) result.get("structuredContent")).get("status"));

        /* host 是控制集群而非连接档案：拒绝并指路，不伪造探活。 */
        Map<String, Object> host = call(controller, "Bearer secret", "es_connection_probe",
                args("connection", "host"));
        assertEquals(Boolean.TRUE, host.get("isError"));
        assertTrue(errorText(host).contains("es_cluster_health"));
        /* 缺 connection 参数拒绝。 */
        Map<String, Object> noArg = call(controller, "Bearer secret", "es_connection_probe",
                new LinkedHashMap<>());
        assertEquals(Boolean.TRUE, noArg.get("isError"));
        assertTrue(errorText(noArg).contains("Missing required argument: connection"));
    }

    @Test
    public void monitorMetricsDispatchesWithWindowAndInterval() {
        StubMetricsStore store = new StubMetricsStore();
        McpController controller = new McpController(new FakeAdmin(), "secret", null,
                new EsClientRouter(null, null, null), new StubConnStore());
        controller.setMonitorMetricsStore(store);

        Map<String, Object> raw = call(controller, "Bearer secret", "es_monitor_metrics", args(
                "scope", "node", "fromMs", 1000L, "toMs", 2000L, "size", 50));
        assertEquals(Boolean.FALSE, raw.get("isError"));
        assertEquals("node", store.lastScope);
        assertEquals(50, store.lastSize);
        assertEquals(Long.valueOf(1000L), store.lastFromMs);
        assertEquals(Long.valueOf(2000L), store.lastToMs);
        assertEquals(1, ((List<?>) ((Map<?, ?>) raw.get("structuredContent")).get("records")).size());

        /* interval 切聚合通道；非法 interval 拒绝（不静默当缺省用）。 */
        Map<String, Object> agg = call(controller, "Bearer secret", "es_monitor_metrics", args(
                "interval", "10m", "connection", "qa"));
        assertEquals(Boolean.FALSE, agg.get("isError"));
        assertEquals("10m", store.lastInterval);
        assertEquals("qa", store.lastConnId);
        Map<String, Object> bad = call(controller, "Bearer secret", "es_monitor_metrics",
                args("interval", "10x"));
        assertEquals(Boolean.TRUE, bad.get("isError"));
        assertTrue(errorText(bad).contains("非法 interval"));
    }

    @Test
    public void monitorHistoryDispatchesWithFilters() {
        StubHistoryStore store = new StubHistoryStore();
        McpController controller = new McpController(new FakeAdmin(), "secret", null,
                new EsClientRouter(null, null, null), new StubConnStore());
        controller.setMonitorHistoryStore(store);

        Map<String, Object> result = call(controller, "Bearer secret", "es_monitor_history", args(
                "connection", "qa", "status", "RED", "size", 10, "fromMs", 1000L, "toMs", 2000L));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals("qa", store.lastConnId);
        assertEquals("RED", store.lastStatus);
        assertEquals(10, store.lastSize);
        assertEquals(Long.valueOf(1000L), store.lastFromMs);
        assertEquals(Long.valueOf(2000L), store.lastToMs);
        assertEquals(1, ((List<?>) ((Map<?, ?>) result.get("structuredContent")).get("records")).size());

        /* connection=host 归一为全量（监控采集按档案 id 落库，host 无档案语义）。 */
        Map<String, Object> hostView = call(controller, "Bearer secret", "es_monitor_history",
                args("connection", "host"));
        assertEquals(Boolean.FALSE, hostView.get("isError"));
        assertNull(store.lastConnId);
    }
}
