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
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateRequest;
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
 * es_xmigrate 组（第 17 组）的 MCP 接线锁：
 * case 分派、GROUP_ACTIONS 映射、WRITE/DESTRUCTIVE/MRTR 归属与 fail-fast 边界。
 */
public class XmigrateTools1120Test {

    private static final List<String> XMIGRATE_TOOLS = Collections.unmodifiableList(Arrays.asList(
            "es_xmigrate_preflight", "es_xmigrate_start", "es_xmigrate_status", "es_xmigrate_jobs",
            "es_xmigrate_fetch_config", "es_xmigrate_resume", "es_xmigrate_abort"));

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }
    }

    /** 桩掉全部服务面：只记录调用参数，供 case 分派断言（不触碰真实 ES）。 */
    private static class StubMigrateService extends CrossClusterMigrateService {
        MigrateRequest lastPreflightReq;
        MigrateRequest lastStartReq;
        String lastStartOwner;
        String lastStartRole;
        String lastProgressJobId;
        int lastJobsLimit = -1;
        RemoteClusterConn lastFetchConn;
        String lastFetchSourceIndex;
        String lastResumeJobId;
        RemoteClusterConn lastResumeConn;
        String lastAbortJobId;
        final MigrateJobES job = new MigrateJobES();

        StubMigrateService() {
            super(null, null, null, null, null, null, null, null, null);
            job.setJobId("xm-job-1");
            job.setSourceIndex("legacy_orders");
            job.setDestIndex("orders_v2");
            job.setSrcConnId("legacy-src");
            job.setStatus("RUNNING");
            job.setRemoteEndpoint("http://10.0.0.9:9200");
        }

        @Override
        public Map<String, Object> preflight(MigrateRequest req) {
            this.lastPreflightReq = req;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("destExists", Boolean.TRUE);
            out.put("sourceIndex", req.getSourceIndex());
            out.put("destIndex", req.getDestIndex());
            return out;
        }

        @Override
        public String start(MigrateRequest req, String ownerUsername, String ownerRole) {
            this.lastStartReq = req;
            this.lastStartOwner = ownerUsername;
            this.lastStartRole = ownerRole;
            return "xm-job-1";
        }

        @Override
        public MigrateJobES progress(String jobId) {
            this.lastProgressJobId = jobId;
            if (!"xm-job-1".equals(jobId)) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            return job;
        }

        @Override
        public List<MigrateJobES> jobs(int limit) {
            this.lastJobsLimit = limit;
            List<MigrateJobES> out = new ArrayList<>();
            out.add(job);
            return out;
        }

        @Override
        public Map<String, Object> fetchSourceConfig(RemoteClusterConn conn, String sourceIndex) {
            this.lastFetchConn = conn;
            this.lastFetchSourceIndex = sourceIndex;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("mapping", "{\"properties\":{}}");
            out.put("settings", "{\"index\":{}}");
            return out;
        }

        @Override
        public String resume(String jobId, RemoteClusterConn conn) {
            this.lastResumeJobId = jobId;
            this.lastResumeConn = conn;
            return jobId;
        }

        @Override
        public void abort(String jobId) {
            this.lastAbortJobId = jobId;
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

    private McpController controllerWithService(StubMigrateService service) {
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);
        return controller;
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
        req.put("id", "xm");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(authorization, req).getBody();
        return (Map<String, Object>) body.get("result");
    }

    private String errorText(Map<String, Object> result) {
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    @Test
    public void xmigrateToolsFailFastWithoutService() {
        /* 直建形态（短构造器）不注入 crossClusterMigrateService：
           xmigrate 工具必须以 isError 明确拒绝，而不是 NPE 或伪成功。 */
        McpController controller = new McpController(new FakeAdmin(), "secret");
        for (String tool : new String[]{"es_xmigrate_preflight", "es_xmigrate_start", "es_xmigrate_status",
                "es_xmigrate_jobs", "es_xmigrate_fetch_config", "es_xmigrate_resume", "es_xmigrate_abort"}) {
            Map<String, Object> arguments = new LinkedHashMap<>();
            arguments.put("jobId", "xm-job-1");
            arguments.put("srcConnId", "legacy-src");
            arguments.put("sourceIndex", "legacy_orders");
            arguments.put("destIndex", "orders_v2");
            Map<String, Object> result = call(controller, "Bearer secret", tool, arguments);
            assertNotNull(tool + " must return a result, not a protocol error", result);
            assertEquals(tool + " must be an isError result", Boolean.TRUE, result.get("isError"));
            assertTrue(tool + " must explain the missing service boundary, got: " + errorText(result),
                    errorText(result).contains("Cross-cluster migrate service is not available"));
        }
    }

    @Test
    public void xmigrateGroupMapsSevenLegacyActions() {
        Map<String, String> actions = McpController.GROUP_ACTIONS.get("es_xmigrate");
        assertNotNull("es_xmigrate group must exist", actions);
        List<String> actionKeys = new ArrayList<>(actions.keySet());
        assertEquals(Arrays.asList("preflight", "start", "status", "jobs", "fetch_config", "resume", "abort",
                "reconcile", "conflicts", "connect_check", "resolve_preview", "dest_indices", "delete_jobs",
                "sync_structure", "probe_capabilities", "compare_capabilities", "diff_structure",
                "verify_equivalence", "throttle"),
                actionKeys);
        assertEquals("es_xmigrate_preflight", actions.get("preflight"));
        assertEquals("es_xmigrate_start", actions.get("start"));
        assertEquals("es_xmigrate_status", actions.get("status"));
        assertEquals("es_xmigrate_jobs", actions.get("jobs"));
        assertEquals("es_xmigrate_fetch_config", actions.get("fetch_config"));
        assertEquals("es_xmigrate_resume", actions.get("resume"));
        assertEquals("es_xmigrate_abort", actions.get("abort"));
        assertEquals("es_xmigrate_reconcile", actions.get("reconcile"));
        assertEquals("es_xmigrate_conflicts", actions.get("conflicts"));
        for (String tool : XMIGRATE_TOOLS) {
            assertTrue("TOOL_ACTIONS must contain " + tool, McpController.TOOL_ACTIONS.containsKey(tool));
        }
    }

    @Test
    public void xmigrateWriteAndDestructiveMembership() {
        /* start/resume/abort 是写工具；start/abort 兼具破坏性（与 adhoc_abort 的先例同判）。 */
        for (String tool : new String[]{"es_xmigrate_start", "es_xmigrate_resume", "es_xmigrate_abort"}) {
            assertTrue(tool + " must be a write tool", McpController.WRITE_TOOLS.contains(tool));
        }
        for (String tool : new String[]{"es_xmigrate_preflight", "es_xmigrate_status", "es_xmigrate_jobs",
                "es_xmigrate_fetch_config"}) {
            assertFalse(tool + " must stay read-only", McpController.WRITE_TOOLS.contains(tool));
        }
        assertTrue(McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_start"));
        assertTrue(McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_abort"));
        assertFalse("resume is a recovery path, not destructive",
                McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_resume"));
    }

    @Test
    public void xmigrateCaseDispatchWithStubService() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = controllerWithService(service);

        Map<String, Object> preflightResult = call(controller, "Bearer secret", "es_xmigrate_preflight",
                args("sourceIndex", "legacy_orders", "destIndex", "orders_v2"));
        assertEquals(Boolean.FALSE, preflightResult.get("isError"));
        assertEquals("legacy_orders", service.lastPreflightReq.getSourceIndex());
        assertEquals("orders_v2", service.lastPreflightReq.getDestIndex());
        assertEquals(Boolean.TRUE, ((Map<?, ?>) preflightResult.get("structuredContent")).get("destExists"));

        /* start 只收 srcConnId：缺 srcConnId 拒绝内联凭据通道，档案解析走 ConnStore。 */
        Map<String, Object> noConn = call(controller, "Bearer secret", "es_xmigrate_start",
                args("sourceIndex", "legacy_orders", "destIndex", "orders_v2"));
        assertEquals(Boolean.TRUE, noConn.get("isError"));
        assertTrue("missing srcConnId must be rejected, got: " + errorText(noConn),
                errorText(noConn).contains("srcConnId is required"));
        assertNull(service.lastStartReq);

        Map<String, Object> started = call(controller, "Bearer secret", "es_xmigrate_start", args(
                "srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destIndex", "orders_v2",
                "destCreateMode", "COPY_FROM_SOURCE", "tuneMode", "GENTLE", "slices", 4,
                "batchSize", 500, "forceMerge", Boolean.TRUE));
        assertEquals(Boolean.FALSE, started.get("isError"));
        assertNotNull(service.lastStartReq.getConn());
        assertEquals("legacy-src", service.lastStartReq.getSrcConnId());
        assertEquals("legacy_orders", service.lastStartReq.getSourceIndex());
        assertEquals(io.github.dengmeiluan.esquerystudio.console.xmigrate.DestCreateMode.COPY_FROM_SOURCE,
                service.lastStartReq.getDestCreateMode());
        assertEquals(io.github.dengmeiluan.esquerystudio.console.xmigrate.TuneMode.GENTLE,
                service.lastStartReq.getTuneMode());
        assertEquals(4, service.lastStartReq.getSlices());
        assertEquals(500, service.lastStartReq.getBatchSize());
        assertTrue(service.lastStartReq.isForceMerge());
        /* 服务 token 无 key 身份：owner/role 维持连接级语义（与 adhoc start 同口径）。 */
        assertNull(service.lastStartOwner);
        assertNull(service.lastStartRole);
        assertEquals("xm-job-1", ((Map<?, ?>) started.get("structuredContent")).get("jobId"));

        Map<String, Object> status = call(controller, "Bearer secret", "es_xmigrate_status",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, status.get("isError"));
        assertEquals("xm-job-1", service.lastProgressJobId);
        assertEquals("xm-job-1", ((Map<?, ?>) status.get("structuredContent")).get("jobId"));

        /* 分组调用归一化：action=status 派发到 es_xmigrate_status。 */
        Map<String, Object> groupCall = call(controller, "Bearer secret", "es_xmigrate",
                args("action", "status", "jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, groupCall.get("isError"));
        assertEquals("xm-job-1", ((Map<?, ?>) groupCall.get("structuredContent")).get("jobId"));

        Map<String, Object> jobs = call(controller, "Bearer secret", "es_xmigrate_jobs",
                args("limit", 5));
        assertEquals(Boolean.FALSE, jobs.get("isError"));
        assertEquals(5, service.lastJobsLimit);
        List<?> jobRows = (List<?>) ((Map<?, ?>) jobs.get("structuredContent")).get("result");
        assertEquals(1, jobRows.size());

        Map<String, Object> fetchConfig = call(controller, "Bearer secret", "es_xmigrate_fetch_config",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders"));
        assertEquals(Boolean.FALSE, fetchConfig.get("isError"));
        assertNotNull(service.lastFetchConn);
        assertEquals("legacy_orders", service.lastFetchSourceIndex);

        /* resume 必须命中作业自己的源档案；换档案连接如实拒绝。 */
        Map<String, Object> wrongConn = call(controller, "Bearer secret", "es_xmigrate_resume",
                args("jobId", "xm-job-1", "srcConnId", "qa"));
        assertEquals(Boolean.TRUE, wrongConn.get("isError"));
        assertTrue("resume must pin the job source profile, got: " + errorText(wrongConn),
                errorText(wrongConn).contains("续跑必须使用该作业的源连接档案"));
        assertNull(service.lastResumeJobId);

        Map<String, Object> resumed = call(controller, "Bearer secret", "es_xmigrate_resume",
                args("jobId", "xm-job-1", "srcConnId", "legacy-src"));
        assertEquals(Boolean.FALSE, resumed.get("isError"));
        assertEquals("xm-job-1", service.lastResumeJobId);
        assertNotNull(service.lastResumeConn);

        Map<String, Object> aborted = call(controller, "Bearer secret", "es_xmigrate_abort",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, aborted.get("isError"));
        assertEquals("xm-job-1", service.lastAbortJobId);
        assertEquals("xm-job-1", ((Map<?, ?>) aborted.get("structuredContent")).get("aborted"));
    }

    @Test
    public void xmigrateJobViewSanitizedBelowRebuildOp() {
        /* VIEWER key 读进度：源集群端点/源档案/捕获 settings/错误样本脱敏（与 REST 读面同口径），
           服务 token 保持全量视角。 */
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String secret = (String) store.create("xm-view", "alice", "VIEWER",
                Collections.singletonList("es_xmigrate_status"), Collections.singletonList("qa"),
                Collections.singletonList("read"), Collections.emptyMap(), 60, 100, 100, null).get("secret");
        /* EsClientRouter 三参全 null：openScope 只操作线程绑定，不触碰连接依赖。 */
        McpController restricted = new McpController(new FakeAdmin(), "",
                new McpAccessService(store), new EsClientRouter(null, null, null), new StubConnStore());
        restricted.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(restricted, "Bearer " + secret, "es_xmigrate_status",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        Map<?, ?> view = (Map<?, ?>) result.get("structuredContent");
        assertEquals("xm-job-1", view.get("jobId"));
        assertFalse("viewer must not see the remote endpoint", view.containsKey("remoteEndpoint"));
        assertFalse("viewer must not see the source profile id", view.containsKey("srcConnId"));
        assertFalse("viewer must not see captured settings", view.containsKey("savedSettings"));
        assertFalse("viewer must not see error samples", view.containsKey("errorSamples"));

        Map<String, Object> serviceTokenView = call(controllerWithService(service), "Bearer secret",
                "es_xmigrate_status", args("jobId", "xm-job-1"));
        assertEquals("http://10.0.0.9:9200",
                ((Map<?, ?>) serviceTokenView.get("structuredContent")).get("remoteEndpoint"));
    }

    @Test
    public void xmigrateStartIsMrtrGatedForElicitationClients() {
        /* start 属 MRTR 确认清单：声明 elicitation 的 2026 客户端先拿 input_required，
           拒绝后不执行；status 读面不受 MRTR 门。 */
        StubMigrateService service = new StubMigrateService();
        McpController controller = controllerWithService(service);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_xmigrate");
        params.put("arguments", args("action", "start", "srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                "destIndex", "orders_v2"));
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "mrtr");
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
        assertEquals("input_required", firstResult.get("resultType"));
        assertEquals("elicitation/create",
                ((Map<?, ?>) ((Map<?, ?>) firstResult.get("inputRequests")).get("confirm")).get("method"));
        assertNull("confirmation must not start the migration", service.lastStartReq);

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
        assertNull("decline must not start the migration", service.lastStartReq);

        Map<String, Object> statusParams = new LinkedHashMap<>();
        statusParams.put("name", "es_xmigrate");
        statusParams.put("arguments", args("action", "status", "jobId", "xm-job-1"));
        Map<String, Object> statusReq = new LinkedHashMap<>();
        statusReq.put("jsonrpc", "2.0");
        statusReq.put("id", "mrtr-read");
        statusReq.put("method", "tools/call");
        statusReq.put("_meta", meta);
        statusReq.put("params", statusParams);
        @SuppressWarnings("unchecked")
        Map<String, Object> statusBody = (Map<String, Object>) controller.rpc("Bearer secret", statusReq).getBody();
        assertEquals("read tools must not be MRTR-gated", Boolean.FALSE,
                ((Map<?, ?>) statusBody.get("result")).get("isError"));
        assertEquals("xm-job-1", service.lastProgressJobId);
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }
}
