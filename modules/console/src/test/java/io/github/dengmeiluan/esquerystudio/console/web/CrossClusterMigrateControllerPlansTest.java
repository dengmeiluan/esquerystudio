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

package io.github.dengmeiluan.esquerystudio.console.web;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePermissionsController;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioConsoleAutoConfiguration;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanRecord;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.StructureSyncService;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 同步计划复用的 REST 接线锁（与 MCP plan_list / plan_apply 同构）：smart-sync 预览 savePlan 回显 planId、
 * 执行形态明确 400；GET plans 行形态/倒序/连接模型可见面/低角色脱敏；POST plans/apply 计划不存在 404
 * PLAN_NOT_FOUND、权限与 smart-sync 执行同口径（源连接写键 + 宿主目标写键）、按存储参数重跑并记账、
 * 漂移异常经 advice 映射 409 PLAN_DRIFT、incremental 计划走带 mode 的全参形态；权限矩阵写面登记。
 * 纯 JUnit 直构造（服务面为桩），不触真实集群。
 */
public class CrossClusterMigrateControllerPlansTest {

    /** 统一入口桩：记录 smartSync 参数；执行形态按真实服务层的漂移门模板拒绝过期摘要。 */
    private static class FakeMigrateService extends CrossClusterMigrateService {
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

        FakeMigrateService() {
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
            if (apply && expectPlanDigest != null && !expectPlanDigest.equals(currentDigest)) {
                throw new IllegalStateException("计划摘要不匹配，拒绝执行：期望 " + expectPlanDigest
                        + "，实际 " + currentDigest + "（source structure drifted, re-run smart-sync preview）");
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            out.put("applied", apply);
            out.put("mode", "create");
            out.put("destIndex", destIndex == null || destIndex.isEmpty() ? sourceIndex : destIndex);
            out.put("planDigest", currentDigest);
            out.put("warnings", new ArrayList<String>());
            return out;
        }
    }

    /** 结构同步服务全参形态桩（incremental 计划的执行面）。 */
    private static class StubStructureSync extends StructureSyncService {
        String lastMode;
        Boolean lastApply;
        String lastExpectPlanDigest;
        boolean srcConnResolved;
        boolean destConnResolved;
        int smartCalls;

        StubStructureSync() { super(null, null, null); }

        @Override
        public Map<String, Object> smartSync(String srcConnId, RemoteClusterConn conn, String sourceIndex,
                                             String destConnId, RemoteClusterConn destConn, String destIndex,
                                             boolean syncAliases, String fallbackAnalyzer, boolean autoTune,
                                             boolean apply, String expectPlanDigest, String mode) {
            lastMode = mode;
            lastApply = apply;
            lastExpectPlanDigest = expectPlanDigest;
            srcConnResolved = conn != null;
            destConnResolved = destConn != null;
            smartCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            out.put("applied", apply);
            out.put("mode", mode);
            out.put("planDigest", "digestabcdef01234567");
            out.put("warnings", new ArrayList<String>());
            return out;
        }
    }

    /* ───────── smart-sync savePlan ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void smartSync预览携savePlan_回显planId并进计划列表() {
        FakeMigrateService service = new FakeMigrateService();
        CrossClusterMigrateController ctrl = controller(service, new StubStructureSync());
        HttpServletRequest admin = request(admin());

        Map<String, Object> out = ctrl.smartSync(body(
                "srcConnId", "c1", "sourceIndex", "orders", "destConnId", "host", "destIndex", "orders_v2",
                "syncAliases", Boolean.TRUE, "downgradedAnalyzerFallback", "ik_max_word", "autoTune", Boolean.TRUE,
                "savePlan", Boolean.TRUE), admin);

        String planId = String.valueOf(out.get("planId"));
        assertTrue(planId.matches("orders_v2_\\d+_[0-9a-f]{16}"));
        assertEquals("PLANNED", out.get("verdict"));
        assertEquals(Boolean.FALSE, service.lastApply);
        Map<String, Object> list = ctrl.plans(admin);
        assertEquals(50, ((Number) list.get("cappedAt")).intValue());
        assertFalse(list.containsKey("warning"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) list.get("plans");
        assertEquals(1, rows.size());
        assertEquals(planId, rows.get(0).get("planId"));
        assertEquals("c1", rows.get(0).get("srcConnId"));
        assertEquals("digest0123456789abcdef", rows.get(0).get("planDigest"));
    }

    @Test
    public void smartSync执行形态携savePlan_400() {
        FakeMigrateService service = new FakeMigrateService();
        CrossClusterMigrateController ctrl = controller(service, new StubStructureSync());
        try {
            ctrl.smartSync(body("srcConnId", "c1", "sourceIndex", "orders", "destConnId", "host",
                    "apply", Boolean.TRUE, "savePlan", Boolean.TRUE), request(admin()));
            fail("执行形态携 savePlan 必须拒绝");
        } catch (IllegalArgumentException e) {
            assertEquals("savePlan 仅预览形态可用", e.getMessage());
            ResponseEntity<Map<String, Object>> mapped =
                    new InternalEsMigrateExceptionAdvice().illegalArg(e, null);
            assertEquals(400, mapped.getStatusCodeValue());
            assertEquals("BAD_REQUEST", mapped.getBody().get("code"));
        }
        assertEquals("拒绝时不触服务面", 0, service.smartCalls);
    }

    /* ───────── GET plans ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void plans_行形态与键序_按savedAtMs倒序() {
        StubStructureSync sync = new StubStructureSync();
        CrossClusterMigrateController ctrl = controller(new FakeMigrateService(), sync);
        sync.planStore().save(plan("p-old", "c1", "host", "create", 1000L));
        sync.planStore().save(plan("p-new", "c2", "host", "create", 3000L));

        Map<String, Object> list = ctrl.plans(request(admin()));

        assertEquals(50, ((Number) list.get("cappedAt")).intValue());
        List<Map<String, Object>> rows = (List<Map<String, Object>>) list.get("plans");
        assertEquals(Arrays.asList("p-new", "p-old"),
                Arrays.asList(rows.get(0).get("planId"), rows.get(1).get("planId")));
        assertEquals("行键序即契约顺序", Arrays.asList("planId", "srcConnId", "sourceIndex", "destConnId",
                "destIndex", "mode", "autoTune", "syncAliases", "planDigest", "savedAtMs", "appliedAtMs",
                "appliedCount"), new ArrayList<>(rows.get(0).keySet()));
        assertEquals("c2", rows.get(0).get("srcConnId"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void plans_连接模型只列源连接写键可达_低于REBUILD_OP脱敏源档案() {
        StubStructureSync sync = new StubStructureSync();
        CrossClusterMigrateController ctrl = controller(new FakeMigrateService(), sync);
        sync.planStore().save(plan("p-c1", "c1", "host", "create", 1000L));
        sync.planStore().save(plan("p-c2", "c2", "host", "create", 2000L));

        List<Map<String, Object>> viewerRows = (List<Map<String, Object>>)
                ctrl.plans(request(viewer("u-c1", ConsoleRole.VIEWER, "conn:c1:w:xmigrate"))).get("plans");
        assertEquals("持 c1 写键不见 c2 的计划", 1, viewerRows.size());
        assertEquals("p-c1", viewerRows.get(0).get("planId"));
        assertNull("低于 REBUILD_OP 脱敏源档案 id（与作业列表同口径）", viewerRows.get(0).get("srcConnId"));
        assertEquals("orders", viewerRows.get(0).get("sourceIndex"));

        List<Map<String, Object>> opRows = (List<Map<String, Object>>)
                ctrl.plans(request(viewer("u-op", ConsoleRole.REBUILD_OP, "conn:c1:w:xmigrate"))).get("plans");
        assertEquals(1, opRows.size());
        assertEquals("c1", opRows.get(0).get("srcConnId"));

        assertEquals("ADMIN 全局可见", 2,
                ((List<?>) ctrl.plans(request(admin())).get("plans")).size());
    }

    /* ───────── POST plans/apply ───────── */

    @Test
    public void plansApply_计划不存在_404_PLAN_NOT_FOUND() {
        FakeMigrateService service = new FakeMigrateService();
        CrossClusterMigrateController ctrl = controller(service, new StubStructureSync());

        ResponseEntity<Map<String, Object>> response =
                ctrl.plansApply(body("planId", "nope"), request(admin()));

        assertEquals(404, response.getStatusCodeValue());
        assertEquals("PLAN_NOT_FOUND", response.getBody().get("code"));
        assertEquals("同步计划不存在: nope", response.getBody().get("message"));
        assertEquals("404 体与同族错误一致附 endpoint", "POST /internal/es/xmigrate/plans/apply",
                response.getBody().get("endpoint"));
        assertEquals(0, service.smartCalls);
    }

    @Test
    public void plansApply_缺planId_400() {
        CrossClusterMigrateController ctrl = controller(new FakeMigrateService(), new StubStructureSync());
        try {
            ctrl.plansApply(new LinkedHashMap<String, Object>(), request(admin()));
            fail("缺 planId 必须拒绝");
        } catch (IllegalArgumentException e) {
            assertEquals("planId 不能为空", e.getMessage());
            assertEquals(400, new InternalEsMigrateExceptionAdvice().illegalArg(e, null).getStatusCodeValue());
        }
    }

    @Test
    public void plansApply_权限与smartSync执行同口径() {
        FakeMigrateService service = new FakeMigrateService();
        StubStructureSync sync = new StubStructureSync();
        CrossClusterMigrateController ctrl = controller(service, sync);
        sync.planStore().save(plan("p-c2", "c2", "host", "create", 1000L));

        expectForbidden(() -> ctrl.plansApply(body("planId", "p-c2"),
                request(viewer("u-c1", ConsoleRole.VIEWER, "conn:c1:w:xmigrate"))), "持 c1 写键执行 c2 源的计划");
        expectForbidden(() -> ctrl.plansApply(body("planId", "p-c2"),
                request(viewer("u-c2", ConsoleRole.VIEWER, "conn:c2:w:xmigrate"))), "无宿主目标写键");
        assertEquals("被拒时不触服务面", 0, service.smartCalls);

        HttpServletRequest granted = request(
                viewer("u-c2", ConsoleRole.VIEWER, "conn:c2:w:xmigrate", "conn:host:w:xmigrate"));
        ResponseEntity<Map<String, Object>> response = ctrl.plansApply(body("planId", "p-c2"), granted);

        assertEquals(200, response.getStatusCodeValue());
        assertEquals(Boolean.TRUE, service.lastApply);
        assertEquals("c2", service.lastSrcConnId);
        assertEquals("digest0123456789abcdef", service.lastExpectPlanDigest);
        assertEquals("p-c2", response.getBody().get("planId"));
        assertEquals("APPLIED", response.getBody().get("verdict"));
        assertEquals(1, sync.planStore().find("p-c2").getAppliedCount().intValue());
    }

    @Test
    public void plansApply_按存储参数重跑_expectPlanDigest优先() {
        FakeMigrateService service = new FakeMigrateService();
        CrossClusterMigrateController ctrl = controller(service, new StubStructureSync());
        HttpServletRequest admin = request(admin());
        String planId = String.valueOf(ctrl.smartSync(body(
                "srcConnId", "c1", "sourceIndex", "orders", "destConnId", "host", "destIndex", "orders_v2",
                "syncAliases", Boolean.TRUE, "downgradedAnalyzerFallback", "ik_max_word", "autoTune", Boolean.TRUE,
                "savePlan", Boolean.TRUE), admin).get("planId"));
        service.currentDigest = "digestcustom00000ffff";

        Map<String, Object> out = ctrl.plansApply(
                body("planId", planId, "expectPlanDigest", "digestcustom00000ffff"), admin).getBody();

        assertEquals("orders_v2", service.lastDestIndex);
        assertEquals(Boolean.TRUE, service.lastSyncAliases);
        assertEquals(Boolean.TRUE, service.lastAutoTune);
        assertEquals("ik_max_word", service.lastFallback);
        assertEquals("digestcustom00000ffff", service.lastExpectPlanDigest);
        assertEquals(planId, out.get("planId"));
        assertEquals(1, ((Number) onlyRow(ctrl, admin).get("appliedCount")).intValue());
    }

    @Test
    public void plansApply_漂移_异常文案同族_经advice映射409_PLAN_DRIFT() {
        FakeMigrateService service = new FakeMigrateService();
        CrossClusterMigrateController ctrl = controller(service, new StubStructureSync());
        HttpServletRequest admin = request(admin());
        String planId = String.valueOf(ctrl.smartSync(body(
                "srcConnId", "c1", "sourceIndex", "orders", "destConnId", "host",
                "savePlan", Boolean.TRUE), admin).get("planId"));
        service.currentDigest = "digestfedcba9876543";

        try {
            ctrl.plansApply(body("planId", planId), admin);
            fail("源结构漂移必须拒绝执行");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage().startsWith("计划摘要不匹配，拒绝执行：期望 digest0123456789abcdef"));
            ResponseEntity<Map<String, Object>> mapped =
                    new InternalEsMigrateExceptionAdvice().illegalState(e, null);
            assertEquals(409, mapped.getStatusCodeValue());
            assertEquals("PLAN_DRIFT", mapped.getBody().get("code"));
        }
        assertEquals("漂移被拒不回写", 0,
                ((Number) onlyRow(ctrl, admin).get("appliedCount")).intValue());
    }

    @Test
    public void plansApply_incremental计划_走带mode的全参形态() {
        FakeMigrateService service = new FakeMigrateService();
        StubStructureSync sync = new StubStructureSync();
        CrossClusterMigrateController ctrl = controller(service, sync);
        sync.planStore().save(plan("p-inc", "c1", "c9", "incremental", 1000L));

        Map<String, Object> out = ctrl.plansApply(body("planId", "p-inc"), request(admin())).getBody();

        assertEquals("incremental", sync.lastMode);
        assertEquals(Boolean.TRUE, sync.lastApply);
        assertEquals("digest0123456789abcdef", sync.lastExpectPlanDigest);
        assertTrue("源/目标连接档案均经控制器解析", sync.srcConnResolved && sync.destConnResolved);
        assertEquals("create 形态的统一入口不受影响", 0, service.smartCalls);
        assertEquals("p-inc", out.get("planId"));
        assertEquals(1, sync.planStore().find("p-inc").getAppliedCount().intValue());
    }

    @Test
    public void plansApply_结构同步服务缺位_明确报错() {
        CrossClusterMigrateController ctrl = new CrossClusterMigrateController(new FakeMigrateService(),
                connStore(), new EnvPagesResolver(connStore(), new ESQueryStudioElasticsearchProperties()), true);
        try {
            ctrl.plansApply(body("planId", "p-1"), request(admin()));
            fail("结构同步服务缺位必须明确报错");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage().contains("structure sync service is not available"));
        }
    }

    /**
     * 容器装配守卫：零组件扫描、只注册自动配置（独立部署与标准宿主的真实装配路径）下，计划端点依赖的
     * 结构同步服务由容器按协作者自动构建；控制集群未绑定时列表如实降级（空 + warning），
     * 而不是报「服务缺位」。
     */
    @Test
    public void 容器装配_零组件扫描下计划存储自动就位_控制集群未绑定时如实降级() {
        new WebApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class))
                .withPropertyValues("esquerystudio.elasticsearch.mode=console")
                .run(ctx -> {
                    assertNull("无组件扫描装配必须启动成功", ctx.getStartupFailure());
                    CrossClusterMigrateController controller = ctx.getBean(CrossClusterMigrateController.class);
                    Map<String, Object> list = controller.plans(request(admin()));
                    assertEquals(50, ((Number) list.get("cappedAt")).intValue());
                    assertTrue(((List<?>) list.get("plans")).isEmpty());
                    assertTrue(String.valueOf(list.get("warning")).contains("同步计划存储读取失败"));
                });
    }

    /* ───────── 权限矩阵登记 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 权限矩阵_写面登记plansApply_计划列表是读面不登记() throws Exception {
        Field f = ConsolePermissionsController.class.getDeclaredField("WRITE_ENDPOINT_PATHS");
        f.setAccessible(true);
        List<String> writePaths = (List<String>) f.get(null);

        assertTrue("按计划执行是迁移写面，须登记（与 smart-sync 同族）",
                writePaths.contains("/internal/es/xmigrate/plans/apply"));
        assertFalse("计划列表是观测面，不进写面", writePaths.contains("/internal/es/xmigrate/plans"));
        int smartSync = writePaths.indexOf("/internal/es/xmigrate/smart-sync");
        int plansApply = writePaths.indexOf("/internal/es/xmigrate/plans/apply");
        assertTrue("紧随 smart-sync 行登记", plansApply == smartSync + 1);
    }

    /* ───────── 工具 ───────── */

    private static CrossClusterMigrateController controller(FakeMigrateService service, StubStructureSync sync) {
        CrossClusterMigrateController ctrl = new CrossClusterMigrateController(service, connStore(),
                new EnvPagesResolver(connStore(), new ESQueryStudioElasticsearchProperties()), true);
        ctrl.setStructureSyncService(sync);
        return ctrl;
    }

    private static PlanRecord plan(String planId, String srcConnId, String destConnId, String mode, long savedAtMs) {
        PlanRecord record = new PlanRecord();
        record.setPlanId(planId);
        record.setSrcConnId(srcConnId);
        record.setSourceIndex("orders");
        record.setDestConnId(destConnId);
        record.setDestIndex("orders_v2");
        record.setMode(mode);
        record.setSyncAliases(false);
        record.setAutoTune(false);
        record.setPlanDigest("digest0123456789abcdef");
        record.setSavedAtMs(savedAtMs);
        record.setAppliedCount(0);
        return record;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> onlyRow(CrossClusterMigrateController ctrl, HttpServletRequest request) {
        return ((List<Map<String, Object>>) ctrl.plans(request).get("plans")).get(0);
    }

    private static void expectForbidden(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    private static ConnStore connStore() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return new RemoteClusterConn(); }
            @Override public String getName(String id) { return id; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static HttpServletRequest request(ConsolePrincipal principal) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        InvocationHandler h = (proxy, method, args) -> {
            switch (method.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                case "getHeader": return null;
                case "getMethod": return "POST";
                case "getRequestURI": return "/internal/es/xmigrate/plans/apply";
                default: throw new UnsupportedOperationException(method.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                CrossClusterMigrateControllerPlansTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal admin() {
        return new ConsolePrincipal("admin-x", ConsoleRole.ADMIN, false);
    }

    private static ConsolePrincipal viewer(String username, ConsoleRole role, String... grants) {
        return new ConsolePrincipal(username, role, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    private static Map<String, Object> body(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }
}
