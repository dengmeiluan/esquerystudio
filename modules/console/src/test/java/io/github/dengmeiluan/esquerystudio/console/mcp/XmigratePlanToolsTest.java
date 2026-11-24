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
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanRecord;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.StructureSyncService;
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
 * es_xmigrate 组同步计划复用的 MCP 接线锁：组映射与静态清单（plan_list 只读、plan_apply 写 + MRTR）、
 * smart_sync savePlan（预览落盘回显 planId，执行形态明确拒绝）、plan_list 形态与只读权限、
 * plan_apply（404 PLAN_NOT_FOUND、漂移 409 PLAN_DRIFT 同族文案、按存储参数重跑、执行记账回写、
 * expectPlanDigest 覆盖、create/incremental 分派、写权限、MRTR 二次确认）、计划资源（模板、快照全量、
 * 不存在、工具白名单、低角色脱敏）。服务面全部为桩，不触真实集群。
 */
public class XmigratePlanToolsTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String PLAN_URI = "esquerystudio://xmigrate/plan/{id}";

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }
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

    /**
     * 统一入口桩（不带 mode 的 smart_sync 调用面，也是 create 计划的执行面）：记录调用参数；
     * 执行时按真实服务层的漂移门模板拒绝过期摘要。
     */
    private static class StubMigrateService extends CrossClusterMigrateService {
        String currentDigest = "digest0123456789abcdef";
        String lastSrcConnId;
        String lastSourceIndex;
        String lastDestConnId;
        String lastDestIndex;
        Boolean lastSyncAliases;
        String lastFallback;
        Boolean lastAutoTune;
        Boolean lastApply;
        String lastExpectPlanDigest;
        int smartCalls;

        StubMigrateService() {
            super(null, null, null, null, null, null, null, null, null);
        }

        @Override
        public Map<String, Object> smartSync(String srcConnId, String sourceIndex, String destConnId,
                                             String destIndex, boolean syncAliases,
                                             String downgradedAnalyzerFallback, boolean autoTune,
                                             boolean apply, String expectPlanDigest) {
            lastSrcConnId = srcConnId;
            lastSourceIndex = sourceIndex;
            lastDestConnId = destConnId;
            lastDestIndex = destIndex;
            lastSyncAliases = syncAliases;
            lastFallback = downgradedAnalyzerFallback;
            lastAutoTune = autoTune;
            lastApply = apply;
            lastExpectPlanDigest = expectPlanDigest;
            smartCalls++;
            return report(srcConnId, "create", sourceIndex, destIndex, apply, expectPlanDigest);
        }

        Map<String, Object> report(String srcConnId, String mode, String sourceIndex, String destIndex,
                                   boolean apply, String expectPlanDigest) {
            if (apply && expectPlanDigest != null && !expectPlanDigest.equals(currentDigest)) {
                throw new IllegalStateException("计划摘要不匹配，拒绝执行：期望 " + expectPlanDigest
                        + "，实际 " + currentDigest + "（source structure drifted, re-run smart-sync preview）");
            }
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("connection", srcConnId);
            source.put("index", sourceIndex);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            out.put("applied", apply);
            out.put("mode", mode);
            out.put("destConnId", lastDestConnId);
            out.put("destIndex", destIndex == null || destIndex.isEmpty() ? sourceIndex : destIndex);
            out.put("planDigest", currentDigest);
            out.put("source", source);
            out.put("planned", Collections.singletonMap("removedSettings", new ArrayList<>()));
            out.put("warnings", new ArrayList<String>());
            return out;
        }
    }

    /** 结构同步服务全参形态桩（带 mode 的调用面，也是 incremental 计划的执行面）。 */
    private static class StubStructureSync extends StructureSyncService {
        String lastMode;
        Boolean lastApply;
        String lastExpectPlanDigest;
        String lastFallback;
        Boolean lastSyncAliases;
        Boolean lastAutoTune;
        boolean destConnResolved;
        int smartCalls;

        StubStructureSync() { super(null, null, null); }

        @Override
        public Map<String, Object> smartSync(String srcConnId, RemoteClusterConn conn, String sourceIndex,
                                             String destConnId, RemoteClusterConn destConn, String destIndex,
                                             boolean syncAliases, String fallbackAnalyzer, boolean autoTune,
                                             boolean apply, String expectPlanDigest, String mode) {
            this.lastMode = mode;
            this.lastApply = apply;
            this.lastExpectPlanDigest = expectPlanDigest;
            this.lastFallback = fallbackAnalyzer;
            this.lastSyncAliases = syncAliases;
            this.lastAutoTune = autoTune;
            this.destConnResolved = destConn != null;
            this.smartCalls++;
            String digest = "incremental".equals(mode) ? "digestabcdef01234567" : "digest0123456789abcdef";
            if (apply && expectPlanDigest != null && !expectPlanDigest.equals(digest)) {
                throw new IllegalStateException("计划摘要不匹配，拒绝执行：期望 " + expectPlanDigest
                        + "，实际 " + digest + "（source structure drifted, re-run smart-sync preview）");
            }
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("connection", srcConnId);
            source.put("index", sourceIndex);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            out.put("applied", apply);
            out.put("mode", mode);
            out.put("destIndex", destIndex == null || destIndex.isEmpty() ? sourceIndex : destIndex);
            out.put("planDigest", digest);
            out.put("source", source);
            out.put("incremental", Collections.singletonMap("addedFields", new ArrayList<>()));
            out.put("warnings", new ArrayList<String>());
            return out;
        }
    }

    /* ───────── 组映射与静态清单 ───────── */

    @Test
    public void 组映射与静态清单_plan_list只读_plan_apply写且MRTR() throws Exception {
        Map<String, String> xmigrate = McpController.GROUP_ACTIONS.get("es_xmigrate");
        assertEquals(23, xmigrate.size());
        assertEquals("es_xmigrate_plan_list", xmigrate.get("plan_list"));
        assertEquals("es_xmigrate_plan_apply", xmigrate.get("plan_apply"));
        assertEquals("es_xmigrate:plan_list", McpController.TOOL_ACTIONS.get("es_xmigrate_plan_list"));
        assertEquals("es_xmigrate:plan_apply", McpController.TOOL_ACTIONS.get("es_xmigrate_plan_apply"));
        assertTrue(McpController.ACTION_TOOL_NAMES.containsAll(
                Arrays.asList("es_xmigrate:plan_list", "es_xmigrate:plan_apply")));

        assertTrue("plan_apply 在目标集群建索引/补结构，属写工具",
                McpController.WRITE_TOOLS.contains("es_xmigrate_plan_apply"));
        assertFalse("plan_list 只读", McpController.WRITE_TOOLS.contains("es_xmigrate_plan_list"));
        List<String> readOnly = McpController.READ_ONLY_ACTIONS.get("es_xmigrate");
        assertTrue("plan_list 进只读 action 名单", readOnly.contains("plan_list"));
        assertFalse("plan_apply 不得进只读名单", readOnly.contains("plan_apply"));

        java.util.Set<String> mrtr = reflectiveSet("MRTR_CONFIRM_TOOLS");
        assertTrue("plan_apply 须进 MRTR 二次确认清单（与 smart_sync 执行同档）",
                mrtr.contains("es_xmigrate_plan_apply"));
        assertFalse("plan_list 只读不进 MRTR", mrtr.contains("es_xmigrate_plan_list"));

        for (String tool : new String[]{"es_xmigrate_plan_list", "es_xmigrate_plan_apply"}) {
            assertFalse("不覆盖既有索引，非破坏性", McpController.DESTRUCTIVE_TOOLS.contains(tool));
            assertFalse("非系统管理类", McpController.ADMIN_ONLY_TOOLS.contains(tool));
            assertFalse("同步非长任务，不任务化", reflectiveSet("TASK_TOOLS").contains(tool));
        }

        assertEquals("资源 URI 11→12，任务资源再 +2（tasks/active、task/{id}）",
                14, McpController.RESOURCE_URIS.size());
        assertTrue(McpController.RESOURCE_URIS.contains(PLAN_URI));
    }

    /** tools/list：action 枚举含两个新 action，参数面含 savePlan/planId，action 描述讲清语义。 */
    @Test
    @SuppressWarnings("unchecked")
    public void tools_list枚举与参数面含计划复用三参() {
        Map<String, Object> xmigrateTool = xmigrateTool(new McpController(new FakeAdmin(), "secret"));
        Map<String, Object> schema = (Map<String, Object>) xmigrateTool.get("inputSchema");
        Map<String, Object> actionProperty =
                (Map<String, Object>) ((Map<String, Object>) schema.get("properties")).get("action");
        List<String> actions = (List<String>) actionProperty.get("enum");
        assertTrue(actions.contains("plan_list"));
        assertTrue(actions.contains("plan_apply"));
        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        assertTrue(properties.containsKey("savePlan"));
        assertTrue(properties.containsKey("planId"));
        assertTrue(properties.containsKey("expectPlanDigest"));
        String actionDesc = String.valueOf(actionProperty.get("description"));
        for (String keyword : new String[]{"savePlan", "plan_list", "plan_apply"}) {
            assertTrue("action 描述须讲清 " + keyword + ": " + actionDesc, actionDesc.contains(keyword));
        }
        assertTrue("savePlan 仅预览形态可用须写进参数说明",
                String.valueOf(((Map<String, Object>) properties.get("savePlan")).get("description"))
                        .contains("仅预览形态可用"));
    }

    /* ───────── smart_sync savePlan ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void smart_sync预览携savePlan_落盘回显planId_列表可见() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destConnId", "host",
                        "destIndex", "orders_v2", "syncAliases", Boolean.TRUE,
                        "downgradedAnalyzerFallback", "ik_max_word", "autoTune", Boolean.TRUE,
                        "savePlan", Boolean.TRUE));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals("预览形态不落盘目标", Boolean.FALSE, migrate.lastApply);
        Map<String, Object> preview = (Map<String, Object>) result.get("structuredContent");
        String planId = String.valueOf(preview.get("planId"));
        assertTrue("planId 与迁移作业 id 同规则: " + planId, planId.matches("orders_v2_\\d+_[0-9a-f]{16}"));

        Map<String, Object> list = planList(controller, "Bearer secret");
        assertEquals(50, ((Number) list.get("cappedAt")).intValue());
        assertFalse("存储正常不带 warning", list.containsKey("warning"));
        List<Map<String, Object>> plans = (List<Map<String, Object>>) list.get("plans");
        assertEquals(1, plans.size());
        Map<String, Object> row = plans.get(0);
        assertEquals(planId, row.get("planId"));
        assertEquals("legacy-src", row.get("srcConnId"));
        assertEquals("legacy_orders", row.get("sourceIndex"));
        assertEquals("host", row.get("destConnId"));
        assertEquals("orders_v2", row.get("destIndex"));
        assertEquals("create", row.get("mode"));
        assertEquals(Boolean.TRUE, row.get("autoTune"));
        assertEquals(Boolean.TRUE, row.get("syncAliases"));
        assertEquals("digest0123456789abcdef", row.get("planDigest"));
        assertTrue(((Number) row.get("savedAtMs")).longValue() > 0L);
        assertNull("从未执行 appliedAtMs 为空", row.get("appliedAtMs"));
        assertEquals(0, ((Number) row.get("appliedCount")).intValue());
        assertEquals("行键序即契约顺序", Arrays.asList("planId", "srcConnId", "sourceIndex", "destConnId",
                "destIndex", "mode", "autoTune", "syncAliases", "planDigest", "savedAtMs", "appliedAtMs",
                "appliedCount"), new ArrayList<>(row.keySet()));
    }

    /** 带 mode 的调用面同样支持 savePlan：计划按报告里的 mode 落库。 */
    @Test
    public void smart_sync带mode携savePlan_按报告mode落盘() {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "destIndex", "orders_v2", "mode", "incremental",
                        "savePlan", Boolean.TRUE));

        assertEquals(Boolean.FALSE, result.get("isError"));
        String planId = String.valueOf(((Map<?, ?>) result.get("structuredContent")).get("planId"));
        PlanRecord saved = sync.planStore().find(planId);
        assertNotNull(saved);
        assertEquals("incremental", saved.getMode());
        assertEquals("legacy-dest", saved.getDestConnId());
    }

    /** savePlan 仅预览形态可用：执行形态带上明确拒绝（400 同族），不触服务面。 */
    @Test
    public void smart_sync执行形态携savePlan_明确拒绝() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destConnId", "host",
                        "apply", Boolean.TRUE, "savePlan", Boolean.TRUE));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue(errorText(result).contains("savePlan 仅预览形态可用"));
        assertEquals("参数错误码", "BAD_REQUEST",
                ((Map<?, ?>) result.get("structuredContent")).get("code"));
        assertEquals("拒绝时不触服务面", 0, migrate.smartCalls);
    }

    @Test
    public void smart_sync不带savePlan_响应无planId() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destConnId", "host"));

        assertEquals(Boolean.FALSE, result.get("isError"));
        assertFalse(((Map<?, ?>) result.get("structuredContent")).containsKey("planId"));
        assertTrue(((List<?>) planList(controller, "Bearer secret").get("plans")).isEmpty());
    }

    /* ───────── plan_list ───────── */

    @Test
    public void planList_按savedAtMs倒序() {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);
        sync.planStore().save(plan("p-old", 1000L));
        sync.planStore().save(plan("p-new", 3000L));
        sync.planStore().save(plan("p-mid", 2000L));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> plans = (List<Map<String, Object>>)
                planList(controller, "Bearer secret").get("plans");

        assertEquals(Arrays.asList("p-new", "p-mid", "p-old"), Arrays.asList(
                plans.get(0).get("planId"), plans.get(1).get("planId"), plans.get(2).get("planId")));
    }

    /** 存储读取失败：plans 为空 + warning，不把读失败伪装成「没有计划」。 */
    @Test
    public void planList_存储读失败_返回空并附warning() {
        StubStructureSync sync = new StubStructureSync();
        sync.setPlanStore(new io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanStore(() -> {
            throw new IllegalStateException("control cluster unbound");
        }));
        McpController controller = wired(new StubMigrateService(), sync);

        Map<String, Object> list = planList(controller, "Bearer secret");

        assertTrue(((List<?>) list.get("plans")).isEmpty());
        assertEquals(50, ((Number) list.get("cappedAt")).intValue());
        assertTrue(String.valueOf(list.get("warning")).contains("同步计划存储读取失败"));
    }

    @Test
    public void planList_只读key可调_无该action的key被拒() {
        StubStructureSync sync = new StubStructureSync();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpController controller = keyed(store, new StubMigrateService(), sync);

        Map<String, Object> allowed = call(controller, "Bearer " + issueKey(store, "plan-reader", "VIEWER",
                Collections.singletonList("es_xmigrate:plan_list"), Collections.singletonList("read")),
                "es_xmigrate_plan_list", new LinkedHashMap<String, Object>());
        assertEquals(Boolean.FALSE, allowed.get("isError"));

        Map<String, Object> denied = call(controller, "Bearer " + issueKey(store, "jobs-only", "VIEWER",
                Collections.singletonList("es_xmigrate:jobs"), Collections.singletonList("read")),
                "es_xmigrate_plan_list", new LinkedHashMap<String, Object>());
        assertEquals(Boolean.TRUE, denied.get("isError"));
        assertTrue(errorText(denied).contains("es_xmigrate:plan_list"));
    }

    /* ───────── plan_apply ───────── */

    @Test
    public void planApply_缺planId报参数错误() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_plan_apply",
                new LinkedHashMap<String, Object>());

        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue(errorText(result).contains("planId"));
        assertEquals("BAD_REQUEST", ((Map<?, ?>) result.get("structuredContent")).get("code"));
        assertEquals(0, migrate.smartCalls);
    }

    /** planId 不存在：文案「同步计划不存在: <id>」，结构化错误码 PLAN_NOT_FOUND（404 同族）。 */
    @Test
    public void planApply_计划不存在_404同族() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_plan_apply",
                args("planId", "no-such-plan"));

        assertEquals(Boolean.TRUE, result.get("isError"));
        assertEquals("同步计划不存在: no-such-plan", errorText(result));
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) result.get("structuredContent")).get("code"));
        assertEquals("计划不存在时不触服务面", 0, migrate.smartCalls);
    }

    @Test
    public void planApply_create计划_按存储参数重跑_成功回写记账() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());
        String planId = saveCreatePlan(controller);

        Map<String, Object> first = call(controller, "Bearer secret", "es_xmigrate_plan_apply",
                args("planId", planId));

        assertEquals(Boolean.FALSE, first.get("isError"));
        assertEquals("按计划保存的参数重跑执行形态", true, migrate.lastApply);
        assertEquals("legacy-src", migrate.lastSrcConnId);
        assertEquals("legacy_orders", migrate.lastSourceIndex);
        assertEquals("host", migrate.lastDestConnId);
        assertEquals("orders_v2", migrate.lastDestIndex);
        assertEquals(Boolean.TRUE, migrate.lastSyncAliases);
        assertEquals(Boolean.TRUE, migrate.lastAutoTune);
        assertEquals("ik_max_word", migrate.lastFallback);
        assertEquals("漂移门摘要缺省用计划保存时的 planDigest", "digest0123456789abcdef",
                migrate.lastExpectPlanDigest);
        Map<?, ?> report = (Map<?, ?>) first.get("structuredContent");
        assertEquals("响应形态同 smart_sync 执行形态", "APPLIED", report.get("verdict"));
        assertEquals("并回显 planId", planId, report.get("planId"));

        call(controller, "Bearer secret", "es_xmigrate_plan_apply", args("planId", planId));
        Map<String, Object> row = onlyPlan(controller);
        assertEquals(2, ((Number) row.get("appliedCount")).intValue());
        assertTrue(((Number) row.get("appliedAtMs")).longValue() > 0L);
    }

    /** 源结构漂移：与 smart_sync apply 同一条漂移门，文案同族、错误码 PLAN_DRIFT，记账不动。 */
    @Test
    public void planApply_漂移_PLAN_DRIFT同族文案_不回写() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());
        String planId = saveCreatePlan(controller);
        migrate.currentDigest = "digestfedcba9876543";

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_plan_apply",
                args("planId", planId));

        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue(errorText(result), errorText(result).startsWith("计划摘要不匹配，拒绝执行：期望 digest0123456789abcdef"));
        assertTrue(errorText(result).contains("source structure drifted, re-run smart-sync preview"));
        assertEquals("PLAN_DRIFT", ((Map<?, ?>) result.get("structuredContent")).get("code"));
        Map<String, Object> row = onlyPlan(controller);
        assertEquals(0, ((Number) row.get("appliedCount")).intValue());
        assertNull(row.get("appliedAtMs"));
    }

    @Test
    public void planApply_expectPlanDigest覆盖存储摘要() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());
        String planId = saveCreatePlan(controller);
        migrate.currentDigest = "digestcustom00000ffff";

        Map<String, Object> drift = call(controller, "Bearer secret", "es_xmigrate_plan_apply",
                args("planId", planId, "expectPlanDigest", "digestcustom00000ffff"));

        assertEquals("调用方期望值与当前摘要一致即放行", Boolean.FALSE, drift.get("isError"));
        assertEquals("digestcustom00000ffff", migrate.lastExpectPlanDigest);
    }

    @Test
    public void planApply_incremental计划_走带mode的全参形态() {
        StubMigrateService migrate = new StubMigrateService();
        StubStructureSync sync = new StubStructureSync();
        /* 目标是非宿主连接：计划的目标连接经路由解析（连接档案 + key 角色），与 reconcile 的目标侧同口径 */
        McpController controller = new McpController(new FakeAdmin(), "secret", null,
                new EsClientRouter(null, null, null), new StubConnStore());
        controller.setCrossClusterMigrateService(migrate);
        controller.setStructureSyncService(sync);
        Map<String, Object> saved = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders",
                        "destConnId", "legacy-dest", "destIndex", "orders_v2", "mode", "incremental",
                        "syncAliases", Boolean.TRUE, "savePlan", Boolean.TRUE));
        String planId = String.valueOf(((Map<?, ?>) saved.get("structuredContent")).get("planId"));
        int migrateCalls = migrate.smartCalls;

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_plan_apply",
                args("planId", planId));

        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals("incremental", sync.lastMode);
        assertEquals(Boolean.TRUE, sync.lastApply);
        assertEquals("digestabcdef01234567", sync.lastExpectPlanDigest);
        assertEquals(Boolean.TRUE, sync.lastSyncAliases);
        assertTrue("非宿主目标档案被解析", sync.destConnResolved);
        assertEquals("create 形态的统一入口不受影响", migrateCalls, migrate.smartCalls);
    }

    /** plan_apply 是纯写工具：只读 key 的白名单里没有它；有写能力但目标连接只读时被连接级权限闸拒绝。 */
    @Test
    public void planApply_只读key不可用_目标连接只读时被拒() {
        StubStructureSync sync = new StubStructureSync();
        StubMigrateService migrate = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpController controller = keyed(store, migrate, sync);
        String planId = seedCreatePlan(sync);

        Map<String, Object> notAllowed = call(controller, "Bearer " + issueKey(store, "plan-readonly", "VIEWER",
                Arrays.asList("es_xmigrate:plan_apply", "es_xmigrate:plan_list"),
                Collections.singletonList("read")),
                "es_xmigrate_plan_apply", args("planId", planId));
        assertEquals(Boolean.TRUE, notAllowed.get("isError"));
        assertTrue(errorText(notAllowed), errorText(notAllowed).contains("es_xmigrate:plan_apply"));

        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("qa", Collections.singletonList("write"));
        String writableSecret = (String) store.create("plan-other-conn", "tester", "VIEWER",
                Collections.singletonList("es_xmigrate:plan_apply"), Arrays.asList("host", "qa"),
                Collections.singletonList("read"), scoped, 60, 100, 100, null).get("secret");
        Map<String, Object> readOnly = call(controller, "Bearer " + writableSecret,
                "es_xmigrate_plan_apply", args("planId", planId));
        assertEquals(Boolean.TRUE, readOnly.get("isError"));
        assertTrue(errorText(readOnly), errorText(readOnly).contains("read-only"));
        assertEquals("被拒时不触服务面", 0, migrate.smartCalls);
    }

    /** 计划目标是宿主集群时同样按 host 要求写权限（REST requireDestWrite 同口径）：key 连接集合
     *  首位可写（qa=write）不能替代 host 的写权限。 */
    @Test
    public void planApply_宿主目标计划_host只读时被拒() {
        StubMigrateService migrate = new StubMigrateService();
        StubStructureSync sync = new StubStructureSync();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpController controller = keyed(store, migrate, sync);
        String planId = seedCreatePlan(sync);

        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("qa", Collections.singletonList("write"));
        scoped.put("host", Collections.singletonList("read"));
        String secret = (String) store.create("plan-qa-first-host-ro", "tester", "VIEWER",
                Collections.singletonList("es_xmigrate:plan_apply"), Arrays.asList("qa", "host"),
                Collections.singletonList("read"), scoped, 60, 100, 100, null).get("secret");
        Map<String, Object> result = call(controller, "Bearer " + secret, "es_xmigrate_plan_apply",
                args("planId", planId));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("宿主目标写权限按 host 判定, got: " + errorText(result),
                errorText(result).contains("read-only"));
        assertEquals("被拒时不触服务面", 0, migrate.smartCalls);
    }

    /** 计划的目标不是本次 connection 参数所指连接时，写权限按计划的目标连接裁决。 */
    @Test
    public void planApply_目标连接只读或不在key连接集合时被拒() {
        StubMigrateService migrate = new StubMigrateService();
        StubStructureSync sync = new StubStructureSync();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpController controller = new McpController(new FakeAdmin(), "",
                new McpAccessService(store), new EsClientRouter(null, null, null), new StubConnStore());
        controller.setCrossClusterMigrateService(migrate);
        controller.setStructureSyncService(sync);
        PlanRecord record = plan("p-dest", System.currentTimeMillis());
        record.setDestConnId("legacy-dest");
        sync.planStore().save(record);

        /* 宿主可写、目标连接只读：通用连接闸查的是缺省目标 host，由计划的目标连接门拦下 */
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("legacy-dest", Collections.singletonList("read"));
        String destReadOnly = (String) store.create("plan-dest-ro", "tester", "VIEWER",
                Collections.singletonList("es_xmigrate:plan_apply"), Arrays.asList("host", "legacy-dest"),
                Collections.singletonList("write"), scoped, 60, 100, 100, null).get("secret");
        Map<String, Object> readOnly = call(controller, "Bearer " + destReadOnly, "es_xmigrate_plan_apply",
                args("planId", "p-dest"));
        assertEquals(Boolean.TRUE, readOnly.get("isError"));
        assertTrue(errorText(readOnly), errorText(readOnly).contains("legacy-dest is read-only"));

        String destNotGranted = (String) store.create("plan-dest-absent", "tester", "VIEWER",
                Collections.singletonList("es_xmigrate:plan_apply"), Collections.singletonList("host"),
                Collections.singletonList("write"), new LinkedHashMap<String, List<String>>(),
                60, 100, 100, null).get("secret");
        Map<String, Object> notGranted = call(controller, "Bearer " + destNotGranted, "es_xmigrate_plan_apply",
                args("planId", "p-dest"));
        assertEquals(Boolean.TRUE, notGranted.get("isError"));
        assertTrue(errorText(notGranted),
                errorText(notGranted).contains("Connection not allowed for this key: legacy-dest"));
        assertEquals("被拒时不触服务面", 0, migrate.smartCalls);
    }

    /** plan_apply 是写动作：声明 elicitation 的客户端先拿 input_required，拒绝后不执行。 */
    @Test
    public void planApply_需MRTR二次确认_planList免确认() {
        StubMigrateService migrate = new StubMigrateService();
        McpController controller = wired(migrate, new StubStructureSync());
        String planId = saveCreatePlan(controller);
        int callsBefore = migrate.smartCalls;
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_xmigrate");
        params.put("arguments", args("action", "plan_apply", "planId", planId));
        Map<String, Object> req = elicitationRequest(params);

        @SuppressWarnings("unchecked")
        Map<String, Object> first = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        assertEquals("input_required", ((Map<?, ?>) first.get("result")).get("resultType"));
        assertEquals("确认前不得执行", callsBefore, migrate.smartCalls);

        Map<String, Object> declineParams = new LinkedHashMap<>(params);
        Map<String, Object> decline = new LinkedHashMap<>();
        Map<String, Object> declineConfirm = new LinkedHashMap<>();
        declineConfirm.put("action", "decline");
        decline.put("confirm", declineConfirm);
        declineParams.put("inputResponses", decline);
        declineParams.put("requestState", String.valueOf(((Map<?, ?>) first.get("result")).get("requestState")));
        req.put("params", declineParams);
        @SuppressWarnings("unchecked")
        Map<String, Object> declined = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        assertTrue(String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) declined.get("result"))
                .get("content")).get(0)).get("text")).contains("已取消"));
        assertEquals("拒绝后不执行", callsBefore, migrate.smartCalls);

        Map<String, Object> listParams = new LinkedHashMap<>();
        listParams.put("name", "es_xmigrate");
        listParams.put("arguments", args("action", "plan_list"));
        req.put("params", listParams);
        @SuppressWarnings("unchecked")
        Map<String, Object> listed = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        assertFalse("plan_list 只读，不发 input_required",
                ((Map<?, ?>) listed.get("result")).containsKey("inputRequests"));
    }

    /* ───────── 资源 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 资源_计划快照模板与全量读取() throws Exception {
        StubStructureSync sync = new StubStructureSync();
        McpController controller = wired(new StubMigrateService(), sync);
        String planId = saveCreatePlan(controller);

        Map<String, Object> templates = rpc(controller, "Bearer secret", "resources/templates/list", null);
        List<Map<String, Object>> rows = (List<Map<String, Object>>)
                ((Map<?, ?>) templates.get("result")).get("resourceTemplates");
        List<String> uris = new ArrayList<>();
        for (Map<String, Object> template : rows) {
            uris.add(String.valueOf(template.get("uriTemplate")));
        }
        assertTrue(uris.contains(PLAN_URI));

        Map<String, Object> plan = readResource(controller, "Bearer secret",
                "esquerystudio://xmigrate/plan/" + planId);
        assertEquals(planId, plan.get("planId"));
        assertEquals("legacy-src", plan.get("srcConnId"));
        assertEquals("ik_max_word", plan.get("fallbackAnalyzer"));
        assertEquals("digest0123456789abcdef", plan.get("planDigest"));
        Map<String, Object> snapshot = (Map<String, Object>) plan.get("snapshot");
        assertEquals("快照是保存时的预览报告", "PLANNED", snapshot.get("verdict"));
        assertTrue(snapshot.containsKey("planned"));
        assertEquals("legacy-src", ((Map<?, ?>) snapshot.get("source")).get("connection"));
    }

    @Test
    public void 资源_计划不存在_错误文案同族() throws Exception {
        McpController controller = wired(new StubMigrateService(), new StubStructureSync());

        Map<String, Object> body = rpc(controller, "Bearer secret", "resources/read",
                singleton("uri", "esquerystudio://xmigrate/plan/nope"));

        assertNotNull(body.get("error"));
        assertEquals("同步计划不存在: nope", String.valueOf(((Map<?, ?>) body.get("error")).get("message")));
    }

    @Test
    public void 资源_权限门与jobs资源同口径_低角色脱敏源档案() throws Exception {
        StubStructureSync sync = new StubStructureSync();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        McpController controller = keyed(store, new StubMigrateService(), sync);
        String planId = seedCreatePlan(sync);
        String uri = "esquerystudio://xmigrate/plan/" + planId;

        String bareSecret = issueKey(store, "no-plan-list", "VIEWER",
                Collections.singletonList("es_xmigrate:jobs"), Collections.singletonList("read"));
        Map<String, Object> denied = rpc(controller, "Bearer " + bareSecret, "resources/read", singleton("uri", uri));
        assertNotNull("无 es_xmigrate:plan_list 的 key 连工具白名单都过不去", denied.get("error"));
        assertTrue(String.valueOf(((Map<?, ?>) denied.get("error")).get("message")).contains("es_xmigrate:plan_list"));

        String viewerSecret = issueKey(store, "plan-viewer", "VIEWER",
                Collections.singletonList("es_xmigrate:plan_list"), Collections.singletonList("read"));
        Map<String, Object> redacted = readResource(controller, "Bearer " + viewerSecret, uri);
        assertFalse("低于 REBUILD_OP 的 key 不见源档案 id", redacted.containsKey("srcConnId"));
        assertFalse("快照里回显的源连接标识一并抹去",
                ((Map<?, ?>) ((Map<?, ?>) redacted.get("snapshot")).get("source")).containsKey("connection"));

        String opSecret = issueKey(store, "plan-op", "REBUILD_OP",
                Collections.singletonList("es_xmigrate:plan_list"), Collections.singletonList("read"));
        assertEquals("legacy-src", readResource(controller, "Bearer " + opSecret, uri).get("srcConnId"));
    }

    /* ───────── 工具 ───────── */

    private static McpController wired(StubMigrateService migrate, StubStructureSync sync) {
        McpController controller = new McpController(new FakeAdmin(), "secret", null, null, new StubConnStore());
        controller.setCrossClusterMigrateService(migrate);
        controller.setStructureSyncService(sync);
        return controller;
    }

    private static McpController keyed(InMemoryMcpKeyStore store, StubMigrateService migrate,
                                       StubStructureSync sync) {
        McpController controller = new McpController(new FakeAdmin(), "",
                new McpAccessService(store), null, new StubConnStore());
        controller.setCrossClusterMigrateService(migrate);
        controller.setStructureSyncService(sync);
        return controller;
    }

    private static String issueKey(InMemoryMcpKeyStore store, String name, String role, List<String> tools,
                                   List<String> permissions) {
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("host", permissions);
        return (String) store.create(name, "tester", role, tools, Collections.singletonList("host"),
                permissions, scoped, 60, 100, 100, null).get("secret");
    }

    /** 经 smart_sync 预览落一条 create 计划，返回 planId。 */
    private static String saveCreatePlan(McpController controller) {
        Map<String, Object> saved = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "legacy-src", "sourceIndex", "legacy_orders", "destConnId", "host",
                        "destIndex", "orders_v2", "syncAliases", Boolean.TRUE,
                        "downgradedAnalyzerFallback", "ik_max_word", "autoTune", Boolean.TRUE,
                        "savePlan", Boolean.TRUE));
        assertEquals(Boolean.FALSE, saved.get("isError"));
        return String.valueOf(((Map<?, ?>) saved.get("structuredContent")).get("planId"));
    }

    private static Map<String, Object> planList(McpController controller, String authorization) {
        Map<String, Object> result = call(controller, authorization, "es_xmigrate_plan_list",
                new LinkedHashMap<String, Object>());
        assertEquals(Boolean.FALSE, result.get("isError"));
        return (Map<String, Object>) result.get("structuredContent");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> onlyPlan(McpController controller) {
        return ((List<Map<String, Object>>) planList(controller, "Bearer secret").get("plans")).get(0);
    }

    private static PlanRecord plan(String planId, long savedAtMs) {
        PlanRecord record = new PlanRecord();
        record.setPlanId(planId);
        record.setSrcConnId("legacy-src");
        record.setSourceIndex("legacy_orders");
        record.setDestConnId("host");
        record.setDestIndex("orders_v2");
        record.setMode("create");
        record.setSyncAliases(Boolean.TRUE);
        record.setAutoTune(Boolean.TRUE);
        record.setFallbackAnalyzer("ik_max_word");
        record.setPlanDigest("digest0123456789abcdef");
        record.setSavedAtMs(savedAtMs);
        record.setAppliedCount(0);
        record.setSnapshot("{\"verdict\":\"PLANNED\",\"planDigest\":\"digest0123456789abcdef\","
                + "\"source\":{\"connection\":\"legacy-src\"},\"planned\":{}}");
        return record;
    }

    /** 持 key 的控制器没有服务级 token：直接往存储里放一条 create 计划，返回 planId。 */
    private static String seedCreatePlan(StubStructureSync sync) {
        PlanRecord record = plan("p-seeded-" + System.nanoTime(), System.currentTimeMillis());
        sync.planStore().save(record);
        return record.getPlanId();
    }

    private static Map<String, Object> xmigrateTool(McpController controller) {
        Map<String, Object> body = rpc(controller, "Bearer secret", "tools/list", null);
        List<Map<String, Object>> tools = (List<Map<String, Object>>) ((Map<?, ?>) body.get("result")).get("tools");
        for (Map<String, Object> tool : tools) {
            if ("es_xmigrate".equals(tool.get("name"))) return tool;
        }
        throw new IllegalStateException("tools/list 缺 es_xmigrate 组");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> rpc(McpController controller, String authorization, String method,
                                           Map<String, Object> params) {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "plan");
        req.put("method", method);
        if (params != null) {
            req.put("params", params);
        }
        return (Map<String, Object>) controller.rpc(authorization, req).getBody();
    }

    private static Map<String, Object> elicitationRequest(Map<String, Object> params) {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "mrtr-plan");
        req.put("method", "tools/call");
        Map<String, Object> caps = new LinkedHashMap<>();
        caps.put("elicitation", new LinkedHashMap<String, Object>());
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("io.modelcontextprotocol/clientCapabilities", caps);
        req.put("_meta", meta);
        req.put("params", params);
        return req;
    }

    private static Map<String, Object> readResource(McpController controller, String authorization, String uri)
            throws Exception {
        Map<String, Object> body = rpc(controller, authorization, "resources/read", singleton("uri", uri));
        assertNull("资源读取不应出错: " + body.get("error"), body.get("error"));
        String text = String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("result"))
                .get("contents")).get(0)).get("text"));
        return MAPPER.readValue(text, Map.class);
    }

    private static Map<String, Object> singleton(String key, Object value) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(key, value);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> call(McpController controller, String authorization, String name,
                                            Map<String, Object> arguments) {
        Map<String, Object> params = new LinkedHashMap<>();
        String qualified = McpController.TOOL_ACTIONS.get(name);
        int colon = qualified.indexOf(':');
        Map<String, Object> merged = new LinkedHashMap<>();
        merged.put("action", qualified.substring(colon + 1));
        merged.putAll(arguments);
        params.put("name", qualified.substring(0, colon));
        params.put("arguments", merged);
        Map<String, Object> body = rpc(controller, authorization, "tools/call", params);
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

    @SuppressWarnings("unchecked")
    private static java.util.Set<String> reflectiveSet(String field) throws Exception {
        Field f = McpServerCore.class.getDeclaredField(field);
        f.setAccessible(true);
        return (java.util.Set<String>) f.get(null);
    }
}
