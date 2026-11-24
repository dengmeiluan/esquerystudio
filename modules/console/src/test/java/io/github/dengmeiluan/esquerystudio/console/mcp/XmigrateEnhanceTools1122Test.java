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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.StructureSyncService;
import org.junit.Test;

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
 * es_xmigrate 组 MCP 层增强接线的锁：smart_sync mode / diff_structure 豁免参数 /
 * verify_equivalence structureOnly 的透传与运行时校验、组级 annotations.readOnlyActions
 * 只读 action 名单、tools/call 错误 structuredContent code、completion 新参数补全、
 * xmigrate 域两个资源（作业摘要 / 单作业事件流）。
 */
public class XmigrateEnhanceTools1122Test {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }

        @Override
        public List<Map<String, Object>> listClusterIndices() {
            List<Map<String, Object>> rows = new ArrayList<>();
            rows.add(row("orders_prod"));
            rows.add(row("research_report"));
            return rows;
        }

        private static Map<String, Object> row(String index) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
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

    /** 桩结构同步面：记录 smartSync 12 参 / diffStructure 6 参 / verifyEquivalence 10 参
     *  调用参数，返回固定结果（不触真实集群）；签名与服务层重载一致，漂移时编译期即失败。 */
    private static class StubStructureSync extends StructureSyncService {
        String lastSmartMode;
        String lastSmartSrcConnId;
        String lastSmartDestConnId;
        boolean lastSmartApply;
        int smartCalls;

        Integer lastDiffAutoTunedShards;
        List<String> lastDiffRemovedKeys;
        int diffCalls;

        boolean lastVerifyStructureOnly;
        String lastVerifySrcConnId;
        int verifyCalls;

        StubStructureSync() { super(null, null, null); }

        @Override
        public Map<String, Object> smartSync(String srcConnId, RemoteClusterConn conn, String sourceIndex,
                                             String destConnId, RemoteClusterConn destConn, String destIndex,
                                             boolean syncAliases, String fallbackAnalyzer, boolean autoTune,
                                             boolean apply, String expectPlanDigest, String mode) {
            this.lastSmartMode = mode;
            this.lastSmartSrcConnId = srcConnId;
            this.lastSmartDestConnId = destConnId;
            this.lastSmartApply = apply;
            this.smartCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            out.put("mode", mode);
            out.put("planDigest", "digest0123456789abcdef");
            out.put("warnings", Collections.emptyList());
            return out;
        }

        @Override
        public Map<String, Object> diffStructure(RemoteClusterConn srcConn, String sourceIndex,
                                                 RemoteClusterConn destConn, String destIndex,
                                                 Integer autoTunedShards, List<String> removedKeys) {
            this.lastDiffAutoTunedShards = autoTunedShards;
            this.lastDiffRemovedKeys = removedKeys;
            this.diffCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("compatible", Boolean.TRUE);
            out.put("expectedRemovals", Collections.emptyList());
            out.put("unexpected", Collections.emptyList());
            return out;
        }

        @Override
        public Map<String, Object> verifyEquivalence(RemoteClusterConn srcConn, String sourceIndex,
                                                     String destConnId, RemoteClusterConn destConn, String destIndex,
                                                     Integer sampleSize, List<String> sampleFields,
                                                     String aggField, Integer aggSize, boolean structureOnly) {
            this.lastVerifyStructureOnly = structureOnly;
            this.lastVerifySrcConnId = srcConn == null ? null : "resolved";
            this.verifyCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("structureOnly", Boolean.TRUE);
            out.put("verdict", "EQUIVALENT");
            out.put("structuresMatch", Boolean.TRUE);
            return out;
        }
    }

    /** 桩迁移面：jobs/progress/events 供资源与补全用例；smartSync 走旧 9 参签名
     *  （不带 mode 的调用面不变），可注入异常供错误 code 用例。 */
    private static class StubMigrateService extends CrossClusterMigrateService {
        RuntimeException smartSyncFailure;
        int smartCalls;

        StubMigrateService() {
            super(null, null, null, null, null, null, null, null, null);
        }

        static MigrateJobES job(String jobId, String status, String srcConnId, String owner) {
            MigrateJobES job = new MigrateJobES();
            job.setJobId(jobId);
            job.setStatus(status);
            job.setSrcConnId(srcConnId);
            job.setSourceIndex("legacy_orders");
            job.setDestIndex("orders_v2");
            job.setOwnerUsername(owner);
            job.setUpdateTime(1699000000000L);
            return job;
        }

        @Override
        public List<MigrateJobES> jobs(int limit) {
            return Arrays.asList(
                    job("orders_v2_1", MigrateJobTracker.STATUS_RUNNING, "legacy-src", "tester"),
                    job("orders_v2_2", MigrateJobTracker.STATUS_DONE, "legacy-src", "tester"));
        }

        @Override
        public MigrateJobES progress(String jobId) {
            return job(jobId, MigrateJobTracker.STATUS_DONE, "legacy-src", "tester");
        }

        @Override
        public Map<String, Object> events(String jobId) {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("ts", 1699000000000L);
            event.put("stage", "STARTED");
            event.put("message", "迁移启动");
            event.put("level", "INFO");
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("jobId", jobId);
            out.put("events", Collections.singletonList(event));
            return out;
        }

        @Override
        public Map<String, Object> smartSync(String srcConnId, String sourceIndex, String destConnId,
                                             String destIndex, boolean syncAliases,
                                             String downgradedAnalyzerFallback, boolean autoTune,
                                             boolean apply, String expectPlanDigest) {
            this.smartCalls++;
            if (smartSyncFailure != null) throw smartSyncFailure;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            return out;
        }
    }

    /* ───────── 任务 1：新参透传与运行时校验 ───────── */

    /** smart_sync mode=incremental：预览形态直连结构同步服务 12 参重载，mode 与档案解析透传。 */
    @Test
    public void smartSyncModeIncremental透传() {
        StubStructureSync sync = new StubStructureSync();
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, sync);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "mode", "incremental"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, sync.smartCalls);
        assertEquals("incremental", sync.lastSmartMode);
        assertEquals("legacy-src", sync.lastSmartSrcConnId);
        assertEquals("legacy-dest", sync.lastSmartDestConnId);
        assertEquals("缺省 apply=false 只读预览", false, sync.lastSmartApply);
        assertEquals("PLANNED", ((Map<?, ?>) result.get("structuredContent")).get("verdict"));
        assertEquals("incremental", ((Map<?, ?>) result.get("structuredContent")).get("mode"));
        assertEquals("统一入口不受影响（mode 缺省不进桩）", 0, migrate.smartCalls);
    }

    /** smart_sync mode=create 显式指定：同样走 12 参重载，语义与缺省一致。 */
    @Test
    public void smartSyncModeCreate显式透传() {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "host", "mode", "create"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals("create", sync.lastSmartMode);
        assertEquals("host 仍是合法目标（宿主集群）", "host", sync.lastSmartDestConnId);
    }

    /** mode 非法值：isError 拒绝并带字段名，不触服务面。 */
    @Test
    public void smartSyncMode非法值拒绝() {
        StubStructureSync sync = new StubStructureSync();
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, sync);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "mode", "patch"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("拒绝信息须带字段名 mode: " + errorText(result),
                errorText(result).contains("mode"));
        assertEquals("拒绝时不触结构同步面", 0, sync.smartCalls);
        assertEquals("拒绝时不触统一入口", 0, migrate.smartCalls);
    }

    /** diff_structure 豁免参数：autoTunedShards/removedKeys 透传 6 参重载。 */
    @Test
    public void diffStructure豁免参数透传() {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_diff_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "autoTunedShards", 6, "removedKeys", Arrays.asList("index.apack.knn", "index.refresh_interval")));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, sync.diffCalls);
        assertEquals(Integer.valueOf(6), sync.lastDiffAutoTunedShards);
        assertEquals(Arrays.asList("index.apack.knn", "index.refresh_interval"), sync.lastDiffRemovedKeys);
        assertEquals("destConnId 回显仍由调用层补充（缺省 host）",
                null, ((Map<?, ?>) result.get("structuredContent")).get("destConnId"));
    }

    /** diff_structure 豁免参数校验：非正整数 / 数组元素空串 → isError 带字段名。 */
    @Test
    public void diffStructure豁免参数非法拒绝() {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);

        Map<String, Object> zero = call(controller, "Bearer secret", "es_xmigrate_diff_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "autoTunedShards", 0));
        assertEquals(Boolean.TRUE, zero.get("isError"));
        assertTrue(errorText(zero).contains("autoTunedShards"));

        Map<String, Object> blank = call(controller, "Bearer secret", "es_xmigrate_diff_structure",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "removedKeys", Arrays.asList("index.apack.knn", " ")));
        assertEquals(Boolean.TRUE, blank.get("isError"));
        assertTrue(errorText(blank).contains("removedKeys"));
        assertEquals("拒绝时不触结构同步面", 0, sync.diffCalls);
    }

    /** verify_equivalence structureOnly=true（显式档案形态）：直连 10 参重载。 */
    @Test
    public void verifyEquivalenceStructureOnly显式档案形态() {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_verify_equivalence",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "host", "structureOnly", Boolean.TRUE));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, sync.verifyCalls);
        assertTrue("structureOnly 透传", sync.lastVerifyStructureOnly);
        assertEquals("EQUIVALENT", ((Map<?, ?>) result.get("structuredContent")).get("verdict"));
    }

    /** verify_equivalence structureOnly + jobId 形态：作业登记的源/目标档案在调用层解析。 */
    @Test
    public void verifyEquivalenceStructureOnlyJobId形态() {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_verify_equivalence",
                args("jobId", "orders_v2_2", "structureOnly", Boolean.TRUE));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, sync.verifyCalls);
        assertEquals("作业档案解析出的源连接被解析", "resolved", sync.lastVerifySrcConnId);
    }

    /** structureOnly 非布尔：isError 带字段名；structureOnly 缺省 false 走既有统一入口。 */
    @Test
    public void verifyEquivalenceStructureOnly非法与缺省() {
        StubStructureSync sync = new StubStructureSync();
        StubMigrateService migrate = new StubMigrateService() {
            @Override
            public Map<String, Object> verifyEquivalence(String jobId, String srcConnId, String sourceIndex,
                    String destConnId, String destIndex, Integer sampleSize, List<String> sampleFields,
                    String aggField, Integer aggSize) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("verdict", "EQUIVALENT");
                out.put("structureOnly", Boolean.FALSE);
                return out;
            }
        };
        McpController controller = wired(migrate, sync);

        Map<String, Object> bad = call(controller, "Bearer secret", "es_xmigrate_verify_equivalence",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "structureOnly", "yes"));
        assertEquals(Boolean.TRUE, bad.get("isError"));
        assertTrue(errorText(bad).contains("structureOnly"));

        Map<String, Object> legacy = call(controller, "Bearer secret", "es_xmigrate_verify_equivalence",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders"));
        assertEquals(Boolean.FALSE, legacy.get("isError"));
        assertEquals("缺省 structureOnly=false 走既有统一入口（数据等价校验）",
                Boolean.FALSE, ((Map<?, ?>) legacy.get("structuredContent")).get("structureOnly"));
        assertEquals("不触 10 参重载", 0, sync.verifyCalls);
    }

    /** tools/list 的 es_xmigrate 参数面含四个新参。 */
    @Test
    @SuppressWarnings("unchecked")
    public void tools_list参数面含四个新参() {
        McpController controller = new McpController(new FakeAdmin(), "secret");
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "tl");
        req.put("method", "tools/list");
        Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        List<Map<String, Object>> tools = (List<Map<String, Object>>) ((Map<?, ?>) body.get("result")).get("tools");
        Map<String, Object> xmigrate = null;
        for (Map<String, Object> tool : tools) {
            if ("es_xmigrate".equals(tool.get("name"))) xmigrate = tool;
        }
        assertNotNull(xmigrate);
        Map<String, Object> properties =
                (Map<String, Object>) ((Map<String, Object>) xmigrate.get("inputSchema")).get("properties");
        assertTrue(properties.containsKey("mode"));
        assertTrue(properties.containsKey("autoTunedShards"));
        assertTrue(properties.containsKey("removedKeys"));
        assertTrue(properties.containsKey("structureOnly"));
        String actionDesc = String.valueOf(
                ((Map<String, Object>) properties.get("action")).get("description"));
        assertTrue("action 描述须讲清新参语义", actionDesc.contains("incremental"));
        assertTrue(actionDesc.contains("autoTunedShards"));
        assertTrue(actionDesc.contains("structureOnly"));
    }

    /* ───────── 任务 2：annotations.readOnlyActions ───────── */

    /** es_xmigrate 组：只读 action 名单含判读/校验/摘要类与 smart_sync（缺省只读预览）；
     *  写 action（delete_jobs/sync_structure/start/resume/abort/throttle）不在名单；
     *  组级 readOnlyHint 口径维持 false（组内有写 action）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void annotations只读名单_esXmigrate组() {
        List<String> readOnly = McpController.READ_ONLY_ACTIONS.get("es_xmigrate");
        for (String action : new String[]{"preflight", "status", "jobs", "fetch_config", "reconcile",
                "conflicts", "events", "connect_check", "resolve_preview", "dest_indices",
                "probe_capabilities", "compare_capabilities", "diff_structure", "verify_equivalence"}) {
            assertTrue("只读 action 应在名单: " + action, readOnly.contains(action));
        }
        assertTrue("smart_sync 缺省 apply=false 只读预览，按缺省只读列入名单",
                readOnly.contains("smart_sync"));
        for (String write : new String[]{"delete_jobs", "sync_structure", "start", "resume", "abort", "throttle"}) {
            assertFalse("写 action 不得进只读名单: " + write, readOnly.contains(write));
        }

        McpController controller = new McpController(new FakeAdmin(), "secret");
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "ann");
        req.put("method", "tools/list");
        Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        List<Map<String, Object>> tools = (List<Map<String, Object>>) ((Map<?, ?>) body.get("result")).get("tools");
        Map<?, ?> xmigrate = null;
        for (Map<String, Object> tool : tools) {
            if ("es_xmigrate".equals(tool.get("name"))) xmigrate = tool;
        }
        assertNotNull(xmigrate);
        Map<String, Object> annotations = (Map<String, Object>) xmigrate.get("annotations");
        assertEquals("混合组 readOnlyHint 维持现状口径（有写 action）",
                Boolean.FALSE, annotations.get("readOnlyHint"));
        List<String> served = (List<String>) annotations.get("readOnlyActions");
        assertEquals("tools/list 下发的名单与静态表一致", readOnly, served);
    }

    /** 其余组：全读组名单=全部 action；adhoc 组 events/status/jobs/prepare 只读；
     *  es_rest:call 是参数守卫型（缺省 method=GET 只读），按缺省只读列入名单。 */
    @Test
    public void annotations只读名单_其余组交叉() {
        assertEquals("全读组（es_search）名单=全部 action",
                new ArrayList<>(McpController.GROUP_ACTIONS.get("es_search").keySet()),
                McpController.READ_ONLY_ACTIONS.get("es_search"));
        List<String> adhoc = McpController.READ_ONLY_ACTIONS.get("es_adhoc_rebuild");
        for (String action : new String[]{"events", "status", "jobs", "prepare"}) {
            assertTrue("adhoc 只读 action 应在名单: " + action, adhoc.contains(action));
        }
        assertFalse("delete_jobs 是写动作", adhoc.contains("delete_jobs"));
        assertFalse("abort 是写动作", adhoc.contains("abort"));
        assertEquals("es_rest:call 缺省 GET 只读，按缺省只读列入名单",
                Collections.singletonList("call"), McpController.READ_ONLY_ACTIONS.get("es_rest"));
        assertEquals("es_documents 只读 action 名单",
                Arrays.asList("get", "term_vectors", "mtermvectors"),
                McpController.READ_ONLY_ACTIONS.get("es_documents"));
    }

    /* ───────── 任务 3：tools/call 错误 structuredContent code ───────── */

    /** PLAN_DRIFT 触发例：服务层计划漂移 IllegalStateException → structuredContent.code
     *  =PLAN_DRIFT，文本 message 保持不变。 */
    @Test
    public void 错误结果附structuredContentCode_PLAN_DRIFT() {
        StubMigrateService migrate = new StubMigrateService();
        migrate.smartSyncFailure = new IllegalStateException("计划摘要不匹配，拒绝执行: 期望 abc 实际 def");
        McpController controller = wired(migrate, new StubStructureSync());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "apply", Boolean.TRUE));
        assertEquals(Boolean.TRUE, result.get("isError"));
        Map<?, ?> structured = (Map<?, ?>) result.get("structuredContent");
        assertNotNull("错误结果须附 structuredContent", structured);
        assertEquals("PLAN_DRIFT", structured.get("code"));
        assertEquals("文本 message 保持不变", "计划摘要不匹配，拒绝执行: 期望 abc 实际 def",
                structured.get("message"));
        assertEquals(errorText(result), structured.get("message"));
    }

    /** 其余异常类型的 code 分流：参数错误=BAD_REQUEST、未识别 RuntimeException=INTERNAL。 */
    @Test
    public void 错误结果code分流() {
        StubMigrateService illegalArg = new StubMigrateService();
        illegalArg.smartSyncFailure = new IllegalArgumentException("bad input");
        McpController controller = wired(illegalArg, new StubStructureSync());
        Map<String, Object> bad = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "apply", Boolean.TRUE, "expectPlanDigest", "d1"));
        assertEquals("BAD_REQUEST",
                ((Map<?, ?>) bad.get("structuredContent")).get("code"));

        StubMigrateService runtime = new StubMigrateService();
        runtime.smartSyncFailure = new RuntimeException("boom");
        McpController controller2 = wired(runtime, new StubStructureSync());
        Map<String, Object> internal = call(controller2, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "apply", Boolean.TRUE, "expectPlanDigest", "d1"));
        assertEquals("INTERNAL",
                ((Map<?, ?>) internal.get("structuredContent")).get("code"));
    }

    /* ───────── 任务 4：completion 新参数 ───────── */

    /** srcConnId/destConnId 复用连接补全；sourceIndex/destIndex 复用索引补全。 */
    @Test
    public void completion新增连接与索引参数() throws Exception {
        McpController controller = wired(new StubMigrateService(), new StubStructureSync());
        assertEquals(Arrays.asList("host"), complete(controller, "srcConnId", ""));
        assertEquals(Arrays.asList("host"), complete(controller, "destConnId", "ho"));
        assertEquals(Arrays.asList("orders_prod"), complete(controller, "sourceIndex", "or"));
        assertEquals(Arrays.asList("research_report"), complete(controller, "destIndex", "res"));
    }

    /** jobId 补全：迁移作业 id 清单（限前 20）；无 es_xmigrate:status 权限的 key 不回填。 */
    @Test
    public void completion补全迁移作业Id() throws Exception {
        McpController controller = wired(new StubMigrateService(), new StubStructureSync());
        List<String> values = complete(controller, "jobId", "orders");
        assertTrue(values.contains("orders_v2_1"));
        assertTrue(values.contains("orders_v2_2"));

        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String secret = (String) store.create("no-xmigrate", "tester", "VIEWER",
                Collections.singletonList("es_xmigrate:jobs"), Collections.singletonList("host"),
                Collections.singletonList("read"), null, 60, 100, 100, null).get("secret");
        McpController keyed = new McpController(new FakeAdmin(), "",
                new McpAccessService(store), null, null);
        keyed.setCrossClusterMigrateService(new StubMigrateService());
        assertEquals("只有 es_xmigrate:jobs 没有 es_xmigrate:status 的 key 不回填 jobId",
                Collections.emptyList(), complete(keyed, "Bearer " + secret, "jobId", ""));
    }

    /* ───────── 任务 5：xmigrate 域资源 ───────── */

    /** resources/list 含作业摘要资源；templates 含事件流模板；读取摘要返回逐作业一行。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 资源作业摘要与事件流模板() throws Exception {
        McpController controller = wired(new StubMigrateService(), new StubStructureSync());
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "res");
        req.put("method", "resources/list");
        Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        List<Map<String, Object>> resources =
                (List<Map<String, Object>>) ((Map<?, ?>) body.get("result")).get("resources");
        boolean found = false;
        for (Map<String, Object> resource : resources) {
            if ("esquerystudio://xmigrate/jobs".equals(resource.get("uri"))) found = true;
        }
        assertTrue("resources/list 须含迁移作业摘要资源", found);

        req.put("method", "resources/templates/list");
        body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        List<Map<String, Object>> templates =
                (List<Map<String, Object>>) ((Map<?, ?>) body.get("result")).get("resourceTemplates");
        List<String> uris = new ArrayList<>();
        for (Map<String, Object> template : templates) uris.add(String.valueOf(template.get("uriTemplate")));
        assertTrue(uris.contains("esquerystudio://xmigrate/jobs"));
        assertTrue(uris.contains("esquerystudio://xmigrate/job/{id}/events"));

        req.put("method", "resources/read");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("uri", "esquerystudio://xmigrate/jobs");
        req.put("params", params);
        body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        String text = String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("result"))
                .get("contents")).get(0)).get("text"));
        List<Map<String, Object>> lines = MAPPER.readValue(text,
                new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() { });
        assertEquals("终态与运行中都在", 2, lines.size());
        Map<String, Object> line = lines.get(0);
        assertEquals("orders_v2_1", line.get("jobId"));
        assertEquals("RUNNING", line.get("state"));
        assertEquals("legacy-src", line.get("srcConnId"));
        assertEquals("迁移写入端恒宿主集群", "host", line.get("destConnId"));
        assertEquals("orders_v2", line.get("destIndex"));
        assertEquals(1699000000000L, ((Number) line.get("updatedMs")).longValue());
    }

    /** 单作业事件流：JSON 形态与 REST /jobs/{id}/events 同构；
     *  非 owner 的受限 key 被归属门拒绝（owner-or-ADMIN）。 */
    @Test
    public void 资源单作业事件流() throws Exception {
        McpController controller = wired(new StubMigrateService(), new StubStructureSync());
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "evt");
        req.put("method", "resources/read");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("uri", "esquerystudio://xmigrate/job/orders_v2_1/events");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        String text = String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("result"))
                .get("contents")).get(0)).get("text"));
        Map<String, Object> events = MAPPER.readValue(text,
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() { });
        assertEquals("orders_v2_1", events.get("jobId"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) events.get("events");
        assertEquals(1, rows.size());
        assertEquals("STARTED", rows.get(0).get("stage"));
        assertEquals("INFO", rows.get(0).get("level"));

        /* 非 owner 的受限 key（有 es_xmigrate:status 但作业归属他人）被拒。 */
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String secret = (String) store.create("other-user", "other", "VIEWER",
                Collections.singletonList("es_xmigrate:status"), Collections.singletonList("host"),
                Collections.singletonList("read"), null, 60, 100, 100, null).get("secret");
        McpController keyed = new McpController(new FakeAdmin(), "",
                new McpAccessService(store), null, null);
        keyed.setCrossClusterMigrateService(new StubMigrateService());
        Map<String, Object> denied = (Map<String, Object>) keyed.rpc("Bearer " + secret, req).getBody();
        assertNotNull(denied.get("error"));
        assertTrue(String.valueOf(((Map<?, ?>) denied.get("error")).get("message")).contains("创建者本人或 ADMIN"));

        /* 无 es_xmigrate:status 权限的 key 连工具白名单都过不去。 */
        InMemoryMcpKeyStore bare = new InMemoryMcpKeyStore();
        String bareSecret = (String) bare.create("bare-user", "other", "VIEWER",
                Collections.singletonList("es_xmigrate:jobs"), Collections.singletonList("host"),
                Collections.singletonList("read"), null, 60, 100, 100, null).get("secret");
        McpController bareKeyed = new McpController(new FakeAdmin(), "",
                new McpAccessService(bare), null, null);
        bareKeyed.setCrossClusterMigrateService(new StubMigrateService());
        Map<String, Object> notAllowed = (Map<String, Object>) bareKeyed.rpc("Bearer " + bareSecret, req).getBody();
        assertNotNull(notAllowed.get("error"));
        assertTrue(String.valueOf(((Map<?, ?>) notAllowed.get("error")).get("message")).contains("es_xmigrate:status"));
    }

    /** 低于 REBUILD_OP 的 key 读作业摘要：srcConnId 脱敏（与作业视图同口径）。 */
    @Test
    public void 资源作业摘要低角色脱敏() throws Exception {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String secret = (String) store.create("viewer-jobs", "tester", "VIEWER",
                Collections.singletonList("es_xmigrate:jobs"), Collections.singletonList("host"),
                Collections.singletonList("read"), null, 60, 100, 100, null).get("secret");
        McpController controller = new McpController(new FakeAdmin(), "",
                new McpAccessService(store), null, null);
        controller.setCrossClusterMigrateService(new StubMigrateService());

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "redact");
        req.put("method", "resources/read");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("uri", "esquerystudio://xmigrate/jobs");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer " + secret, req).getBody();
        assertNull("低角色被工具白名单之外的问题不应出现", body.get("error"));
        String text = String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("result"))
                .get("contents")).get(0)).get("text"));
        List<Map<String, Object>> lines = MAPPER.readValue(text,
                new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() { });
        assertEquals(2, lines.size());
        for (Map<String, Object> line : lines) {
            assertFalse("低于 REBUILD_OP 的 key 不见源档案 id", line.containsKey("srcConnId"));
            assertEquals("host", line.get("destConnId"));
        }
    }

    /* ───────── 工具 ───────── */

    private static McpController wired(StubMigrateService migrate, StubStructureSync sync) {
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(migrate);
        controller.setStructureSyncService(sync);
        return controller;
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
        req.put("id", "enh");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(authorization, req).getBody();
        return (Map<String, Object>) body.get("result");
    }

    private static String errorText(Map<String, Object> result) {
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    @SuppressWarnings("unchecked")
    private static List<String> complete(McpController controller, String argumentName, String prefix)
            throws Exception {
        return complete(controller, "Bearer secret", argumentName, prefix);
    }

    @SuppressWarnings("unchecked")
    private static List<String> complete(McpController controller, String authorization, String argumentName,
                                         String prefix) throws Exception {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "cmp");
        req.put("method", "completion/complete");
        Map<String, Object> argument = new LinkedHashMap<>();
        argument.put("name", argumentName);
        argument.put("value", prefix);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("ref", Collections.singletonMap("type", "ref/prompt"));
        params.put("argument", argument);
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc(authorization, req).getBody();
        Map<?, ?> completion = (Map<?, ?>) ((Map<?, ?>) body.get("result")).get("completion");
        return (List<String>) completion.get("values");
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }
}
