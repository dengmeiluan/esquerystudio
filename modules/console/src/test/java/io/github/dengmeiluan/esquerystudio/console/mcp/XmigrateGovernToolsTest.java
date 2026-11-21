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

import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildService;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * es_xmigrate 组 +4（connect_check/resolve_preview/dest_indices/delete_jobs）与
 * es_adhoc_rebuild 组 +1（events）的 MCP 接线锁：组映射、case 分派、
 * WRITE/DESTRUCTIVE/MRTR 归属、delete_jobs 的 jobId/olderThanDays 二选一与 fail-fast 边界。
 */
public class XmigrateGovernToolsTest {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }
    }

    /** 桩迁移面：记录调用参数，不触碰真实 ES（delete/reconcile 也桩掉）。 */
    private static class StubMigrateService extends CrossClusterMigrateService {
        RemoteClusterConn lastConnectCheckConn;
        RemoteClusterConn lastResolvePreviewConn;
        boolean destIndicesCalled;
        String lastDeleteJobId;
        Integer lastDeleteOlderThanDays;
        final MigrateJobES job = new MigrateJobES();

        StubMigrateService() {
            super(null, null, null, null, null, null, null, null, null);
            job.setJobId("xm-job-1");
            job.setSourceIndex("legacy_orders");
            job.setDestIndex("orders_v2");
            job.setSrcConnId("legacy-src");
            job.setStatus(MigrateJobTracker.STATUS_DONE);
        }

        @Override
        public List<Map<String, Object>> connectCheck(RemoteClusterConn conn) {
            this.lastConnectCheckConn = conn;
            List<Map<String, Object>> rows = new ArrayList<>();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("index", "legacy_orders");
            row.put("health", "green");
            rows.add(row);
            return rows;
        }

        @Override
        public Map<String, Object> resolvePreview(RemoteClusterConn raw) {
            this.lastResolvePreviewConn = raw;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("host", "10.0.0.9");
            out.put("port", 9200);
            out.put("passwordResolved", Boolean.TRUE);
            return out;
        }

        @Override
        public List<Map<String, Object>> destIndices() {
            this.destIndicesCalled = true;
            return Collections.emptyList();
        }

        @Override
        public MigrateJobES progress(String jobId) {
            /* 与真实 progress 同形态：存在返回作业文档，否则 IllegalArgument（作业不存在）。 */
            if (!"xm-job-1".equals(jobId)) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            return job;
        }

        @Override
        public Map<String, Object> delete(String jobId) {
            this.lastDeleteJobId = jobId;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("jobId", jobId);
            out.put("deleted", true);
            return out;
        }

        @Override
        public Map<String, Object> deleteOlderThan(int days, java.util.function.Predicate<MigrateJobES> scope) {
            this.lastDeleteOlderThanDays = days;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("deleted", 3);
            return out;
        }
    }

    /** 桩 adhoc 面：events 按 jobId 返回固定时间线。 */
    private static class StubAdhocService extends AdhocRebuildService {
        String lastEventsJobId;

        StubAdhocService() {
            super(null, null, 0L, null, 0L);
        }

        @Override
        public Map<String, Object> events(String jobId) {
            this.lastEventsJobId = jobId;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("jobId", jobId);
            List<Map<String, Object>> events = new ArrayList<>();
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("ts", 1L);
            e.put("stage", "PENDING");
            e.put("status", "STARTED");
            e.put("detail", "作业创建");
            events.add(e);
            out.put("events", events);
            return out;
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
            return "legacy-src".equals(id) ? conn : null;
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

    @Test
    public void 新action进组映射与实现名表() {
        Map<String, String> xmigrate = McpController.GROUP_ACTIONS.get("es_xmigrate");
        assertEquals(Arrays.asList("preflight", "start", "status", "jobs", "fetch_config", "resume", "abort",
                "reconcile", "conflicts", "connect_check", "resolve_preview", "dest_indices", "delete_jobs",
                "sync_structure", "probe_capabilities", "compare_capabilities", "diff_structure", "throttle"),
                new ArrayList<>(xmigrate.keySet()));
        Map<String, String> adhoc = McpController.GROUP_ACTIONS.get("es_adhoc_rebuild");
        assertEquals(Arrays.asList("prepare", "start", "status", "abort", "confirm_switch", "jobs", "retry",
                "delete_jobs", "throttle", "events"), new ArrayList<>(adhoc.keySet()));
        for (String tool : new String[]{"es_xmigrate_connect_check", "es_xmigrate_resolve_preview",
                "es_xmigrate_dest_indices", "es_xmigrate_delete_jobs", "es_xmigrate_probe_capabilities",
                "es_adhoc_events"}) {
            assertTrue("TOOL_ACTIONS must contain " + tool, McpController.TOOL_ACTIONS.containsKey(tool));
        }
    }

    @Test
    public void delete_jobs进写与MRTR清单_其余新action只读() throws Exception {
        /* 与 es_adhoc_delete_jobs 同档：写工具 + MRTR 二次确认；不进 DESTRUCTIVE
           （删的是控制面作业记录，不碰 ES 数据——与 adhoc delete_jobs 的既有归类一致）。 */
        assertTrue(McpController.WRITE_TOOLS.contains("es_xmigrate_delete_jobs"));
        assertEquals("与 es_adhoc_delete_jobs 同档（都不在破坏性清单）",
                McpController.DESTRUCTIVE_TOOLS.contains("es_adhoc_delete_jobs"),
                McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_delete_jobs"));
        Field mrtr = McpController.class.getDeclaredField("MRTR_CONFIRM_TOOLS");
        mrtr.setAccessible(true);
        @SuppressWarnings("unchecked")
        java.util.Set<String> mrtrTools = (java.util.Set<String>) mrtr.get(null);
        assertTrue("delete_jobs 属治理写，须进 MRTR 二次确认清单", mrtrTools.contains("es_xmigrate_delete_jobs"));

        for (String tool : new String[]{"es_xmigrate_connect_check", "es_xmigrate_resolve_preview",
                "es_xmigrate_dest_indices", "es_xmigrate_probe_capabilities", "es_adhoc_events"}) {
            assertFalse(tool + " must stay read-only", McpController.WRITE_TOOLS.contains(tool));
            assertFalse(tool + " must not be destructive", McpController.DESTRUCTIVE_TOOLS.contains(tool));
        }
    }

    @Test
    public void 新xmigrate工具缺服务面failFast() {
        McpController controller = new McpController(new FakeAdmin(), "secret");
        for (String tool : new String[]{"es_xmigrate_connect_check", "es_xmigrate_resolve_preview",
                "es_xmigrate_dest_indices", "es_xmigrate_delete_jobs"}) {
            Map<String, Object> arguments = new LinkedHashMap<>();
            arguments.put("srcConnId", "legacy-src");
            arguments.put("jobId", "xm-job-1");
            Map<String, Object> result = call(controller, "Bearer secret", tool, arguments);
            assertNotNull(tool + " must return a result", result);
            assertEquals(tool + " must be an isError result", Boolean.TRUE, result.get("isError"));
            assertTrue(tool + " must explain the missing service boundary, got: " + errorText(result),
                    errorText(result).contains("Cross-cluster migrate service is not available"));
        }
        /* probe_capabilities 走 connection 路由参（host 无需路由栈），服务面缺位同样 fail-fast */
        Map<String, Object> probe = call(controller, "Bearer secret", "es_xmigrate_probe_capabilities",
                args("connection", "host"));
        assertEquals(Boolean.TRUE, probe.get("isError"));
        assertTrue(errorText(probe).contains("Cross-cluster migrate service is not available"));
        McpController adhocOnly = new McpController(new FakeAdmin(), "secret");
        Map<String, Object> events = call(adhocOnly, "Bearer secret", "es_adhoc_events", args("jobId", "adhoc-1"));
        assertEquals(Boolean.TRUE, events.get("isError"));
        assertTrue(errorText(events).contains("Adhoc rebuild service is not available"));
    }

    @Test
    public void case分派_连接面与目标清单与事件时间线() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);
        controller.setAdhocRebuildService(new StubAdhocService());

        Map<String, Object> connectCheck = call(controller, "Bearer secret", "es_xmigrate_connect_check",
                args("srcConnId", "legacy-src"));
        assertEquals(Boolean.FALSE, connectCheck.get("isError"));
        assertNotNull("源侧只认已存档案（与组内其余工具同口径）", service.lastConnectCheckConn);
        List<?> rows = (List<?>) ((Map<?, ?>) connectCheck.get("structuredContent")).get("result");
        assertEquals("legacy_orders", ((Map<?, ?>) rows.get(0)).get("index"));

        Map<String, Object> resolvePreview = call(controller, "Bearer secret", "es_xmigrate_resolve_preview",
                args("srcConnId", "legacy-src"));
        assertEquals(Boolean.FALSE, resolvePreview.get("isError"));
        assertNotNull(service.lastResolvePreviewConn);

        Map<String, Object> destIndices = call(controller, "Bearer secret", "es_xmigrate_dest_indices",
                new LinkedHashMap<>());
        assertEquals(Boolean.FALSE, destIndices.get("isError"));
        assertTrue(service.destIndicesCalled);

        Map<String, Object> events = call(controller, "Bearer secret", "es_adhoc_events", args("jobId", "adhoc-1"));
        assertEquals(Boolean.FALSE, events.get("isError"));
        assertEquals("adhoc-1", ((Map<?, ?>) events.get("structuredContent")).get("jobId"));
        List<?> timeline = (List<?>) ((Map<?, ?>) events.get("structuredContent")).get("events");
        assertEquals(1, timeline.size());
        assertEquals("STARTED", ((Map<?, ?>) timeline.get(0)).get("status"));
    }

    @Test
    public void delete_jobs_参数二选一_返回形态对齐adhoc() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> byJobId = call(controller, "Bearer secret", "es_xmigrate_delete_jobs",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, byJobId.get("isError"));
        assertEquals("xm-job-1", service.lastDeleteJobId);
        assertNull(service.lastDeleteOlderThanDays);

        service.lastDeleteJobId = null; // 两个入参形态互斥，重置后再验证另一形态
        Map<String, Object> byDays = call(controller, "Bearer secret", "es_xmigrate_delete_jobs",
                args("olderThanDays", 7));
        assertEquals(Boolean.FALSE, byDays.get("isError"));
        assertEquals(Integer.valueOf(7), service.lastDeleteOlderThanDays);
        assertNull(service.lastDeleteJobId);

        Map<String, Object> none = call(controller, "Bearer secret", "es_xmigrate_delete_jobs",
                new LinkedHashMap<>());
        assertEquals(Boolean.TRUE, none.get("isError"));
        assertTrue("jobId 与 olderThanDays 必须二选一, got: " + errorText(none),
                errorText(none).contains("二选一"));
    }

    @Test
    public void delete_jobs_单条删除归属门_非ADMIN的key删他人作业被拒_本人与ADMIN可删() {
        /* 与 resume/abort 同门（REST requireJobSource mutating 同口径）：
           非 ADMIN key 只能删自己（owner=key 前缀）创建的作业，他人作业如实拒绝。 */
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("host", Collections.singletonList("write"));
        Map<String, Object> viewerKey = store.create("viewer-ops", "alice", "VIEWER",
                Collections.singletonList("es_xmigrate:delete_jobs"), Collections.singletonList("host"),
                Collections.singletonList("write"), scoped, 60, 100, 100, null);
        String viewerSecret = (String) viewerKey.get("secret");
        String viewerPrefix = String.valueOf(((Map<?, ?>) viewerKey.get("key")).get("prefix"));
        Map<String, Object> adminKey = store.create("admin-ops", "root", "ADMIN",
                Collections.singletonList("es_xmigrate:delete_jobs"), Collections.singletonList("host"),
                Collections.singletonList("write"), scoped, 60, 100, 100, null);
        String adminSecret = (String) adminKey.get("secret");

        StubMigrateService strangerJob = new StubMigrateService();
        strangerJob.job.setOwnerUsername("esq_mcp_someone-else");
        McpController stranger = new McpController(new FakeAdmin(), "", new McpAccessService(store),
                null, new StubConnStore());
        stranger.setCrossClusterMigrateService(strangerJob);
        Map<String, Object> denied = call(stranger, "Bearer " + viewerSecret, "es_xmigrate_delete_jobs",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.TRUE, denied.get("isError"));
        assertTrue("非 ADMIN key 删他人作业必须拒绝, got: " + errorText(denied),
                errorText(denied).contains("仅限创建者本人或 ADMIN"));
        assertNull("拒绝路径不得触达删除", strangerJob.lastDeleteJobId);

        StubMigrateService ownJob = new StubMigrateService();
        ownJob.job.setOwnerUsername(viewerPrefix); // 本人（owner=key 前缀，start 的记录口径）
        McpController owner = new McpController(new FakeAdmin(), "", new McpAccessService(store),
                null, new StubConnStore());
        owner.setCrossClusterMigrateService(ownJob);
        Map<String, Object> allowed = call(owner, "Bearer " + viewerSecret, "es_xmigrate_delete_jobs",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, allowed.get("isError"));
        assertEquals("xm-job-1", ownJob.lastDeleteJobId);

        StubMigrateService adminTarget = new StubMigrateService();
        adminTarget.job.setOwnerUsername("esq_mcp_someone-else");
        McpController admin = new McpController(new FakeAdmin(), "", new McpAccessService(store),
                null, new StubConnStore());
        admin.setCrossClusterMigrateService(adminTarget);
        Map<String, Object> adminOk = call(admin, "Bearer " + adminSecret, "es_xmigrate_delete_jobs",
                args("jobId", "xm-job-1"));
        assertEquals(Boolean.FALSE, adminOk.get("isError"));
        assertEquals("xm-job-1", adminTarget.lastDeleteJobId);
    }

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
        req.put("id", "xg");
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
