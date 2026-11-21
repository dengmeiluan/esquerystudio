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
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * es_xmigrate 组 sync_structure（dry-run/别名随迁参数）与 probe_capabilities（只读探测）的
 * MCP 接线锁：组映射与实现名表、WRITE/MRTR 归属（dryRun=true 参数感知跳过二次确认）、
 * case 分派与参数透传、缺服务面 fail-fast、elicitation 二次确认与宿主/档案双探测分支。
 */
public class XmigrateSyncStructureToolsTest {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }
    }

    /** 桩迁移面：记录 syncStructure（v3 全参）/compare/diff/throttle 调用参数，返回固定结果（不触真实集群）。 */
    private static class StubMigrateService extends CrossClusterMigrateService {
        RemoteClusterConn lastSyncConn;
        String lastSyncSourceIndex;
        String lastSyncDestIndex;
        String lastSyncFallback;
        Boolean lastDryRun;
        Boolean lastSyncAliases;
        String lastSyncDestConnId;
        RemoteClusterConn lastSyncDestConn;
        String lastExpectPlanDigest;
        int syncCalls;

        String lastCmpSrcConnId;
        RemoteClusterConn lastCmpSrcConn;
        String lastCmpSourceIndex;
        String lastCmpDestConnId;
        RemoteClusterConn lastCmpDestConn;
        String lastCmpDestIndex;
        int cmpCalls;

        RemoteClusterConn lastDiffSrcConn;
        String lastDiffSourceIndex;
        RemoteClusterConn lastDiffDestConn;
        String lastDiffDestIndex;
        int diffCalls;

        String lastThrottleJobId;
        int lastThrottleRps;
        int throttleCalls;

        StubMigrateService() {
            super(null, null, null, null, null, null, null, null, null);
        }

        @Override
        public Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                                 String fallbackAnalyzer, boolean dryRun, boolean syncAliases,
                                                 String destConnId, RemoteClusterConn destConn,
                                                 String expectPlanDigest) {
            this.lastSyncConn = conn;
            this.lastSyncSourceIndex = sourceIndex;
            this.lastSyncDestIndex = destIndex;
            this.lastSyncFallback = fallbackAnalyzer;
            this.lastDryRun = dryRun;
            this.lastSyncAliases = syncAliases;
            this.lastSyncDestConnId = destConnId;
            this.lastSyncDestConn = destConn;
            this.lastExpectPlanDigest = expectPlanDigest;
            this.syncCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("created", Boolean.TRUE);
            out.put("dryRun", dryRun);
            out.put("destConnId", destConnId);
            out.put("destIndex", destIndex == null || destIndex.trim().isEmpty() ? sourceIndex : destIndex);
            out.put("planDigest", "abc123def4567890");
            out.put("rounds", 3);
            out.put("removedSettings", Collections.singletonList(
                    Collections.singletonMap("key", "index.apack.knn")));
            out.put("removedAnalysis", Collections.emptyList());
            out.put("downgradedFields", Collections.emptyList());
            out.put("warnings", Collections.emptyList());
            return out;
        }

        @Override
        public Map<String, Object> compareCapabilities(String srcConnId, RemoteClusterConn srcConn,
                                                       String sourceIndex, String destConnId,
                                                       RemoteClusterConn destConn, String destIndex) {
            this.lastCmpSrcConnId = srcConnId;
            this.lastCmpSrcConn = srcConn;
            this.lastCmpSourceIndex = sourceIndex;
            this.lastCmpDestConnId = destConnId;
            this.lastCmpDestConn = destConn;
            this.lastCmpDestIndex = destIndex;
            this.cmpCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("diff", Collections.singletonMap("vendorChanged", Boolean.TRUE));
            return out;
        }

        @Override
        public Map<String, Object> diffStructure(RemoteClusterConn srcConn, String sourceIndex,
                                                 RemoteClusterConn destConn, String destIndex) {
            this.lastDiffSrcConn = srcConn;
            this.lastDiffSourceIndex = sourceIndex;
            this.lastDiffDestConn = destConn;
            this.lastDiffDestIndex = destIndex;
            this.diffCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("compatible", Boolean.TRUE);
            return out;
        }

        @Override
        public Map<String, Object> throttle(String jobId, int rps) {
            this.lastThrottleJobId = jobId;
            this.lastThrottleRps = rps;
            this.throttleCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", Boolean.TRUE);
            out.put("jobId", jobId);
            out.put("rps", rps);
            out.put("appliedAt", System.currentTimeMillis());
            return out;
        }

        @Override
        public Map<String, Object> probeCapabilities(RemoteClusterConn conn, String index) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("version", "7.10.2");
            out.put("plugins", Collections.singletonList("analysis-ik"));
            out.put("managed", Boolean.TRUE);
            return out;
        }

        @Override
        public Map<String, Object> probeHostCapabilities(String index) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("version", "7.17.9");
            out.put("managed", Boolean.FALSE);
            return out;
        }

        @Override
        public io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES progress(String jobId) {
            io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES job =
                    new io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES();
            job.setJobId(jobId);
            job.setStatus(io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker.STATUS_RUNNING);
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
            return "legacy-src".equals(id) || "legacy-dest".equals(id) ? conn : null;
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

    /* ───────── 组映射与静态清单 ───────── */

    @Test
    public void 组内18个action_尾部为compare_diff_throttle() {
        Map<String, String> xmigrate = McpController.GROUP_ACTIONS.get("es_xmigrate");
        assertEquals(18, xmigrate.size());
        assertEquals(Arrays.asList("preflight", "start", "status", "jobs", "fetch_config", "resume", "abort",
                "reconcile", "conflicts", "connect_check", "resolve_preview", "dest_indices", "delete_jobs",
                "sync_structure", "probe_capabilities", "compare_capabilities", "diff_structure", "throttle"),
                new ArrayList<>(xmigrate.keySet()));
        assertEquals("es_xmigrate_sync_structure", xmigrate.get("sync_structure"));
        assertEquals("es_xmigrate:sync_structure", McpController.TOOL_ACTIONS.get("es_xmigrate_sync_structure"));
        assertTrue("限定名清单（组:action）随之扩充",
                McpController.ACTION_TOOL_NAMES.contains("es_xmigrate:sync_structure"));
        assertEquals("es_xmigrate_probe_capabilities", xmigrate.get("probe_capabilities"));
        assertEquals("es_xmigrate_compare_capabilities", xmigrate.get("compare_capabilities"));
        assertEquals("es_xmigrate:compare_capabilities",
                McpController.TOOL_ACTIONS.get("es_xmigrate_compare_capabilities"));
        assertEquals("es_xmigrate_diff_structure", xmigrate.get("diff_structure"));
        assertEquals("es_xmigrate_throttle", xmigrate.get("throttle"));
        assertEquals("实现名总数随组 +3", 166, McpController.ACTION_TOOL_NAMES.size());
    }

    /** 与组内 start 同档：写工具 + MRTR 二次确认；建索引不覆盖既有索引，不进破坏性清单。
     *  probe_capabilities/compare_capabilities/diff_structure 只读：不进写/破坏性/MRTR 任何清单。
     *  throttle 变更运行行为：进写清单（与 es_adhoc_throttle 同档），不进破坏性/MRTR。 */
    @Test
    public void 写与MRTR归属_不进破坏性清单() throws Exception {
        assertTrue("sync_structure 属写工具（目标集群建索引）",
                McpController.WRITE_TOOLS.contains("es_xmigrate_sync_structure"));
        Field mrtr = McpController.class.getDeclaredField("MRTR_CONFIRM_TOOLS");
        mrtr.setAccessible(true);
        @SuppressWarnings("unchecked")
        java.util.Set<String> mrtrTools = (java.util.Set<String>) mrtr.get(null);
        assertTrue("sync_structure 须进 MRTR 二次确认清单（与 start 同档）",
                mrtrTools.contains("es_xmigrate_sync_structure"));
        assertFalse("不覆盖既有索引，非破坏性",
                McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_sync_structure"));
        assertFalse("probe_capabilities 只读探测",
                McpController.WRITE_TOOLS.contains("es_xmigrate_probe_capabilities"));
        assertFalse(McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_probe_capabilities"));
        assertFalse("只读不进 MRTR 清单", mrtrTools.contains("es_xmigrate_probe_capabilities"));
        assertTrue("throttle 变更运行行为，属写工具（与 es_adhoc_throttle 同档）",
                McpController.WRITE_TOOLS.contains("es_xmigrate_throttle"));
        assertFalse("调速不删数据，非破坏性",
                McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_throttle"));
        assertFalse("调速不需要 MRTR 二次确认（可再调回，无不可逆后果）",
                mrtrTools.contains("es_xmigrate_throttle"));
        for (String read : new String[]{"es_xmigrate_compare_capabilities", "es_xmigrate_diff_structure"}) {
            assertFalse("只读判读不进写清单 " + read, McpController.WRITE_TOOLS.contains(read));
            assertFalse(McpController.DESTRUCTIVE_TOOLS.contains(read));
            assertFalse("只读不进 MRTR 清单 " + read, mrtrTools.contains(read));
        }
    }

    /** REST 侧鉴权档位断言在 auth 包的 ConsoleAuthInterceptorRoleMapTest（requiredRole 包内可见）。 */

    /* ───────── case 分派 ───────── */

    @Test
    public void case分派_参数透传与结果回传() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destIndex", "orders_v2", "downgradedAnalyzerFallback", "ik_max_word"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.syncCalls);
        assertNotNull("源侧只认已存档案（与组内其余工具同口径）", service.lastSyncConn);
        assertEquals("legacy_orders", service.lastSyncSourceIndex);
        assertEquals("orders_v2", service.lastSyncDestIndex);
        assertEquals("ik_max_word", service.lastSyncFallback);
        Map<?, ?> view = (Map<?, ?>) result.get("structuredContent");
        assertEquals(Boolean.TRUE, view.get("created"));
        assertEquals(3, ((Number) view.get("rounds")).intValue());
    }

    /** destIndex/回退分词器可省：省略时透传 null，由服务端取缺省（同名/standard）。 */
    @Test
    public void destIndex与回退分词器可省() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertNull(service.lastSyncDestIndex);
        assertNull(service.lastSyncFallback);
        assertEquals("服务端缺省同名", "legacy_orders",
                ((Map<?, ?>) result.get("structuredContent")).get("destIndex"));
    }

    /** 缺 srcConnId：拒绝内联凭据通道（与组内 start/fetch_config 同口径）。 */
    @Test
    public void 缺srcConnId拒绝() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("sourceIndex", "legacy_orders"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain srcConnId is required, got: " + errorText(result),
                errorText(result).contains("srcConnId"));
        assertEquals("拒绝时不触服务面", 0, service.syncCalls);
    }

    /** 分组调用归一化：action=sync_structure 经组名派发到内部实现名。 */
    @Test
    public void 分组action形态归一化() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate",
                args("action", "sync_structure", "srcConnId", "legacy-src", "sourceIndex", "legacy_orders"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.syncCalls);
    }

    /* ───────── fail-fast 与 MRTR ───────── */

    /** migrate.enabled=false（服务面缺位）时 fail-fast：明确报错，不 NPE、不伪成功。 */
    @Test
    public void 缺服务面failFast() {
        McpController controller = new McpController(new FakeAdmin(), "secret");
        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders"));
        assertNotNull(result);
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain the missing service boundary, got: " + errorText(result),
                errorText(result).contains("Cross-cluster migrate service is not available"));
    }

    /** 声明 elicitation 的 2026 客户端：先拿 input_required，拒绝后不触服务面。 */
    @Test
    public void elicitation客户端先确认后执行() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_xmigrate");
        params.put("arguments", args("action", "sync_structure", "srcConnId", "legacy-src",
                "sourceIndex", "legacy_orders"));
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "mrtr-sync");
        req.put("method", "tools/call");
        Map<String, Object> caps = new LinkedHashMap<>();
        caps.put("elicitation", new LinkedHashMap<String, Object>());
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("io.modelcontextprotocol/clientCapabilities", caps);
        req.put("_meta", meta);
        req.put("params", params);

        @SuppressWarnings("unchecked")
        Map<String, Object> first = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        Map<?, ?> firstResult = (Map<?, ?>) first.get("result");
        assertEquals("缺省（dryRun=false）维持 MRTR", "input_required", firstResult.get("resultType"));
        assertNull("确认前不得执行", service.lastSyncConn);

        Map<String, Object> declineParams = new LinkedHashMap<>(params);
        Map<String, Object> decline = new LinkedHashMap<>();
        Map<String, Object> declineConfirm = new LinkedHashMap<>();
        declineConfirm.put("action", "decline");
        decline.put("confirm", declineConfirm);
        declineParams.put("inputResponses", decline);
        declineParams.put("requestState", String.valueOf(firstResult.get("requestState")));
        req.put("params", declineParams);
        @SuppressWarnings("unchecked")
        Map<String, Object> declined = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        assertTrue(String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) declined.get("result"))
                .get("content")).get(0)).get("text")).contains("已取消"));
        assertEquals("拒绝后不执行", 0, service.syncCalls);
    }

    /** dryRun=true 参数感知：只读预览跳过 MRTR 二次确认，elicitation 客户端直接执行。 */
    @Test
    public void dryRun跳过MRTR二次确认() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_xmigrate");
        params.put("arguments", args("action", "sync_structure", "srcConnId", "legacy-src",
                "sourceIndex", "legacy_orders", "dryRun", Boolean.TRUE));
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "mrtr-dry");
        req.put("method", "tools/call");
        Map<String, Object> caps = new LinkedHashMap<>();
        caps.put("elicitation", new LinkedHashMap<String, Object>());
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("io.modelcontextprotocol/clientCapabilities", caps);
        req.put("_meta", meta);
        req.put("params", params);

        @SuppressWarnings("unchecked")
        Map<String, Object> direct = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        Map<?, ?> result = (Map<?, ?>) direct.get("result");
        assertFalse("dry-run 不发 input_required（无确认请求）", result.containsKey("inputRequests"));
        assertEquals("直接执行", 1, service.syncCalls);
        assertEquals(Boolean.TRUE, service.lastDryRun);
        assertEquals("dry-run 报告透传", Boolean.TRUE,
                ((Map<?, ?>) result.get("structuredContent")).get("dryRun"));
    }

    /** dryRun 参数透传：缺省 false、显式 false 均为真写（MRTR 面）；true 为预览。 */
    @Test
    public void dryRun与syncAliases参数透传() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "dryRun", Boolean.TRUE, "syncAliases", Boolean.TRUE));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(Boolean.TRUE, service.lastDryRun);
        assertEquals(Boolean.TRUE, service.lastSyncAliases);

        call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders"));
        assertEquals("缺省 dryRun=false", Boolean.FALSE, service.lastDryRun);
        assertEquals("缺省 syncAliases=false", Boolean.FALSE, service.lastSyncAliases);
    }

    /* ───────── sync_structure v3：destConnId / expectPlanDigest ───────── */

    /** v3 透传：destConnId 按档案解析成连接、expectPlanDigest 原样透传（dryRun=false）。 */
    @Test
    public void sync_structure_v3参数透传() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "expectPlanDigest", "abc123def4567890"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals("legacy-dest", service.lastSyncDestConnId);
        assertNotNull("destConnId 按档案解析成连接（host 之外走连接档案）", service.lastSyncDestConn);
        assertEquals("abc123def4567890", service.lastExpectPlanDigest);
        assertEquals("destConnId 随报告回显", "legacy-dest",
                ((Map<?, ?>) result.get("structuredContent")).get("destConnId"));
    }

    /** destConnId=host 与缺省同义：目标走宿主集群（destConn null、回显 null）。 */
    @Test
    public void sync_structure_destConnId_host归一宿主() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destConnId", "host"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertNull("host=宿主集群（destConn 不建远端连接）", service.lastSyncDestConn);
        assertNull("host 归一为 null 回显", service.lastSyncDestConnId);
    }

    /** dryRun=true 时带 expectPlanDigest：明确拒绝（预览不存在计划漂移校验）。 */
    @Test
    public void sync_structure_dryRun拒绝expectPlanDigest() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_sync_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "dryRun", Boolean.TRUE, "expectPlanDigest", "abc123def4567890"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain the digest/dryRun conflict, got: " + errorText(result),
                errorText(result).contains("expectPlanDigest only valid with dryRun=false"));
        assertEquals("拒绝时不触服务面", 0, service.syncCalls);
    }

    /* ───────── compare_capabilities / diff_structure / throttle ───────── */

    /** compare_capabilities：srcConnId 必填按档案解析，sourceIndex/destIndex/destConnId 可选透传。 */
    @Test
    public void compare_capabilities参数透传() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_compare_capabilities",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destConnId", "legacy-dest"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.cmpCalls);
        assertEquals("legacy-src", service.lastCmpSrcConnId);
        assertNotNull(service.lastCmpSrcConn);
        assertEquals("legacy_orders", service.lastCmpSourceIndex);
        assertEquals("legacy-dest", service.lastCmpDestConnId);
        assertNotNull(service.lastCmpDestConn);

        call(controller, "Bearer secret", "es_xmigrate_compare_capabilities",
                args("srcConnId", "legacy-src"));
        assertEquals("可选参数缺省透传 null", 2, service.cmpCalls);
        assertNull(service.lastCmpSourceIndex);
        assertNull(service.lastCmpDestConnId);
        assertNull("缺省目标=宿主集群（不建远端连接）", service.lastCmpDestConn);
    }

    /** compare_capabilities 缺 srcConnId：拒绝内联凭据通道（与组内其余工具同口径）。 */
    @Test
    public void compare_capabilities缺srcConnId拒绝() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_compare_capabilities",
                args("sourceIndex", "legacy_orders"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain srcConnId is required, got: " + errorText(result),
                errorText(result).contains("srcConnId"));
        assertEquals(0, service.cmpCalls);
    }

    /** diff_structure：sourceIndex/destIndex 必填、destConnId 可选（缺省=宿主）。 */
    @Test
    public void diff_structure参数透传() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_diff_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destIndex", "orders_v2"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.diffCalls);
        assertEquals("legacy_orders", service.lastDiffSourceIndex);
        assertEquals("orders_v2", service.lastDiffDestIndex);
        assertNotNull(service.lastDiffSrcConn);
        assertNull("缺省目标=宿主集群", service.lastDiffDestConn);

        /* destIndex 可选：缺省 null 透传（服务层回退与 sourceIndex 同名，与 sync_structure 同形） */
        Map<String, Object> omitted = call(controller, "Bearer secret", "es_xmigrate_diff_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders"));
        assertEquals(Boolean.FALSE, omitted.get("isError"));
        assertEquals("缺省 destIndex 透传 null 由服务层回退", 2, service.diffCalls);
        assertNull(service.lastDiffDestIndex);
    }

    /** throttle：jobId/rps 必填、rps ≥ -1（-1=不限速）；非法值明确报错。 */
    @Test
    public void throttle参数透传与非法值拒绝() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_throttle",
                args("jobId", "orders_v2_1", "rps", 2000));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.throttleCalls);
        assertEquals("orders_v2_1", service.lastThrottleJobId);
        assertEquals(2000, service.lastThrottleRps);
        assertEquals(Boolean.TRUE, ((Map<?, ?>) result.get("structuredContent")).get("ok"));

        call(controller, "Bearer secret", "es_xmigrate_throttle",
                args("jobId", "orders_v2_1", "rps", -1));
        assertEquals("-1=不限速透传", -1, service.lastThrottleRps);

        Map<String, Object> bad = call(controller, "Bearer secret", "es_xmigrate_throttle",
                args("jobId", "orders_v2_1", "rps", -2));
        assertEquals("rps < -1 拒绝", Boolean.TRUE, bad.get("isError"));
        assertTrue("must explain the invalid rps, got: " + errorText(bad),
                errorText(bad).contains("-1"));

        Map<String, Object> missing = call(controller, "Bearer secret", "es_xmigrate_throttle",
                args("jobId", "orders_v2_1"));
        assertEquals("缺 rps 拒绝", Boolean.TRUE, missing.get("isError"));
        assertTrue(errorText(missing).contains("rps"));

        Map<String, Object> nonNumeric = call(controller, "Bearer secret", "es_xmigrate_throttle",
                args("jobId", "orders_v2_1", "rps", "fast"));
        assertEquals("rps 非数字拒绝", Boolean.TRUE, nonNumeric.get("isError"));
        assertTrue(errorText(nonNumeric).contains("rps"));
        assertEquals("非法值不触服务面", 2, service.throttleCalls);
    }

    /* ───────── probe_capabilities ───────── */

    /** 已存连接档案探测：connection 参数经路由/档案校验后委托 probeCapabilities，回传带 connection。 */
    @Test
    public void probe_capabilities按档案探测() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null,
                new io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter(null, null, null),
                new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_probe_capabilities",
                args("connection", "legacy-src"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        Map<?, ?> view = (Map<?, ?>) result.get("structuredContent");
        assertEquals("legacy-src", String.valueOf(view.get("connection")));
        assertEquals("7.10.2", view.get("version"));
        assertEquals(Boolean.TRUE, view.get("managed"));
    }

    /** connection=host 走宿主集群探测分支。 */
    @Test
    public void probe_capabilities宿主分支() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_probe_capabilities",
                args("connection", "host"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals("host", String.valueOf(
                ((Map<?, ?>) result.get("structuredContent")).get("connection")));
        assertEquals("7.17.9", ((Map<?, ?>) result.get("structuredContent")).get("version"));
    }

    /** 缺 connection：与组内 srcConnId 工具同口径 fail-fast。 */
    @Test
    public void probe_capabilities缺connection拒绝() {
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(new StubMigrateService());
        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_probe_capabilities",
                args("index", "legacy_orders"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain the required connection argument, got: " + errorText(result),
                errorText(result).contains("connection"));
    }

    /* ───────── 工具 ───────── */

    @SuppressWarnings("unchecked")
    private static Map<String, Object> call(McpController controller, String authorization, String name,
                                            Map<String, Object> arguments) {
        Map<String, Object> params = new LinkedHashMap<>();
        String qualified = McpController.TOOL_ACTIONS.get(name);
        if (qualified == null) {
            params.put("name", name);
            params.put("arguments", arguments);
        } else {
            int colon = qualified.indexOf(':');
            Map<String, Object> merged = new LinkedHashMap<>();
            merged.put("action", qualified.substring(colon + 1));
            merged.putAll(arguments);
            params.put("name", qualified.substring(0, colon));
            params.put("arguments", merged);
        }
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "xs");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(authorization, req).getBody();
        return (Map<String, Object>) body.get("result");
    }

    private static String errorText(Map<String, Object> result) {
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }
}
