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
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import org.junit.Test;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * es_xmigrate 组 smart_sync（一步式结构同步）的 MCP 接线锁：组映射与实现名表、
 * WRITE/MRTR 归属（apply=false 只读预览免写权限免二次确认，apply=true 需写权限与
 * MRTR）、case 分派与参数透传、destConnId 必填、expectPlanDigest 仅 apply=true 合法。
 */
public class XmigrateSmartSyncToolsTest {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }
    }

    /** 桩迁移面：记录 smartSync 调用参数，返回固定计划/执行结果（不触真实集群）。
     *  注：smartSync 的服务层方法由跨工蚁并行落地；此处先按契约签名定义桩方法，
     *  服务层落地后自动成为真覆盖，若落地签名与本桩不一致测试将直接失败暴露漂移。 */
    private static class StubMigrateService extends CrossClusterMigrateService {
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

        public Map<String, Object> smartSync(String srcConnId, String sourceIndex, String destConnId,
                                             String destIndex, boolean syncAliases,
                                             String downgradedAnalyzerFallback, boolean autoTune,
                                             boolean apply, String expectPlanDigest) {
            this.lastSrcConnId = srcConnId;
            this.lastSourceIndex = sourceIndex;
            this.lastDestConnId = destConnId;
            this.lastDestIndex = destIndex;
            this.lastSyncAliases = syncAliases;
            this.lastFallback = downgradedAnalyzerFallback;
            this.lastAutoTune = autoTune;
            this.lastApply = apply;
            this.lastExpectPlanDigest = expectPlanDigest;
            this.smartCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("verdict", apply ? "APPLIED" : "PLANNED");
            out.put("planDigest", "digest0123456789abcdef");
            out.put("source", Collections.singletonMap("version", "7.10.2"));
            out.put("target", Collections.singletonMap("version", "7.17.9"));
            out.put("planned", Collections.singletonList(
                    Collections.singletonMap("rule", "vendor-private-setting")));
            out.put("autoTuned", autoTune);
            out.put("warnings", Collections.emptyList());
            return out;
        }
    }

    /* ───────── 组映射、tools/list 与静态清单 ───────── */

    @Test
    public void 组映射与实现名表含smart_sync() {
        Map<String, String> xmigrate = McpController.GROUP_ACTIONS.get("es_xmigrate");
        assertEquals("es_xmigrate_smart_sync", xmigrate.get("smart_sync"));
        assertEquals("es_xmigrate:smart_sync", McpController.TOOL_ACTIONS.get("es_xmigrate_smart_sync"));
        assertTrue("限定名清单（组:action）随之扩充",
                McpController.ACTION_TOOL_NAMES.contains("es_xmigrate:smart_sync"));
        assertEquals("实现名总数随组 +2（plan_list / plan_apply），再 +1（xmigrate events）", 171, McpController.ACTION_TOOL_NAMES.size());
    }

    /** tools/list：es_xmigrate 组的 action 枚举含 smart_sync，参数面含 apply/autoTune。 */
    @Test
    @SuppressWarnings("unchecked")
    public void tools_list组枚举含smart_sync() {
        McpController controller = new McpController(new FakeAdmin(), "secret");
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "tl");
        req.put("method", "tools/list");
        Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        List<Map<String, Object>> tools = (List<Map<String, Object>>) ((Map<?, ?>) body.get("result")).get("tools");
        Map<String, Object> xmigrateTool = null;
        for (Map<String, Object> tool : tools) {
            if ("es_xmigrate".equals(tool.get("name"))) xmigrateTool = tool;
        }
        assertNotNull("tools/list 必须含 es_xmigrate 组", xmigrateTool);
        Map<String, Object> schema = (Map<String, Object>) xmigrateTool.get("inputSchema");
        Map<String, Object> actionProperty =
                (Map<String, Object>) ((Map<String, Object>) schema.get("properties")).get("action");
        List<String> enumValues = (List<String>) actionProperty.get("enum");
        assertTrue("action 枚举含 smart_sync", enumValues.contains("smart_sync"));
        Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
        assertTrue("参数面含 apply（smart_sync 执行开关）", properties.containsKey("apply"));
        assertTrue("参数面含 autoTune（smart_sync 目标规格整形）", properties.containsKey("autoTune"));
    }

    /** 与 sync_structure 同档：写工具 + MRTR 二次确认；不覆盖既有索引、不任务化，
     *  不进破坏性/ADMIN/TASK 清单。 */
    @Test
    public void 写与MRTR归属_不进破坏性与任务清单() throws Exception {
        assertTrue("smart_sync 属写工具（apply=true 在目标集群建索引）",
                McpController.WRITE_TOOLS.contains("es_xmigrate_smart_sync"));
        Field mrtr = McpServerCore.class.getDeclaredField("MRTR_CONFIRM_TOOLS");
        mrtr.setAccessible(true);
        @SuppressWarnings("unchecked")
        java.util.Set<String> mrtrTools = (java.util.Set<String>) mrtr.get(null);
        assertTrue("smart_sync 须进 MRTR 二次确认清单（与 sync_structure 同档）",
                mrtrTools.contains("es_xmigrate_smart_sync"));
        assertFalse("不覆盖既有索引，非破坏性",
                McpController.DESTRUCTIVE_TOOLS.contains("es_xmigrate_smart_sync"));
        assertFalse("同步非长任务，不任务化", ((java.util.Set<String>) reflectiveSet("TASK_TOOLS"))
                .contains("es_xmigrate_smart_sync"));
        assertFalse("非系统管理类", McpController.ADMIN_ONLY_TOOLS.contains("es_xmigrate_smart_sync"));
    }

    @SuppressWarnings("unchecked")
    private static java.util.Set<String> reflectiveSet(String field) throws Exception {
        Field f = McpServerCore.class.getDeclaredField(field);
        f.setAccessible(true);
        return (java.util.Set<String>) f.get(null);
    }

    /* ───────── case 分派与参数校验 ───────── */

    /** 缺 destConnId（smart_sync 必填，宿主也须显式 host）：参数错误，不触服务面。 */
    @Test
    public void 缺destConnId报参数错误() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret");
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain destConnId is required, got: " + errorText(result),
                errorText(result).contains("destConnId"));
        assertEquals("拒绝时不触服务面", 0, service.smartCalls);
    }

    /** apply=false（缺省）只读预览：无写权限的 key 也能调通，返回 PLANNED。 */
    @Test
    public void apply缺省只读key可调通返回PLANNED() {
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String readOnlyKey = issueKey(store);
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer " + readOnlyKey, "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "uat-dest"));
        assertEquals("只读 key 预览（apply=false 免写权限）", Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.smartCalls);
        assertEquals("PLANNED", ((Map<?, ?>) result.get("structuredContent")).get("verdict"));
    }

    /** apply=true 需写权限：只读 key 被连接级权限闸拒绝，不触服务面。 */
    @Test
    public void apply为真无写权限被拒() {
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String readOnlyKey = issueKey(store);
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer " + readOnlyKey, "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "uat-dest",
                        "apply", Boolean.TRUE));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain the read-only boundary, got: " + errorText(result),
                errorText(result).contains("read-only"));
        assertEquals("被拒时不触服务面", 0, service.smartCalls);
    }

    /** 宿主目标（destConnId=host）的执行形态：写权限按 host 显式判定——key 连接集合首位可写
     *  （qa=write）不能替代 host 的写权限（REST requireDestWrite 同口径），不触服务面。 */
    @Test
    public void apply为真目标host时_host只读被拒() {
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("qa", Collections.singletonList("write"));
        scoped.put("host", Collections.singletonList("read"));
        String secret = (String) store.create("qa-first-host-ro", "tester", "VIEWER",
                Collections.singletonList("es_xmigrate:smart_sync"), Arrays.asList("qa", "host"),
                Collections.singletonList("read"), scoped, 60, 100, 100, null).get("secret");
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer " + secret, "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "host",
                        "apply", Boolean.TRUE));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("宿主目标写权限按 host 判定, got: " + errorText(result),
                errorText(result).contains("read-only"));
        assertEquals("被拒时不触服务面", 0, service.smartCalls);
    }

    /** savePlan=true 把预览计划写入控制面计划索引：占写权限（只读 key 被拒）；不带 savePlan 的
     *  只读预览照旧免写（apply=false 且 savePlan=false 不占写权限）。 */
    @Test
    public void savePlan为真时只读key被拒_不带savePlan照旧免写() {
        StubMigrateService service = new StubMigrateService();
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String readOnlyKey = issueKey(store);
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> denied = call(controller, "Bearer " + readOnlyKey, "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "host",
                        "savePlan", Boolean.TRUE));
        assertEquals("savePlan=true 写计划存储，占写权限", Boolean.TRUE, denied.get("isError"));
        assertTrue(errorText(denied), errorText(denied).contains("read-only"));
        assertEquals("被拒时不触服务面", 0, service.smartCalls);

        Map<String, Object> preview = call(controller, "Bearer " + readOnlyKey, "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "uat-dest"));
        assertEquals("不带 savePlan 的只读预览照旧免写", Boolean.FALSE, preview.get("isError"));
        assertEquals(1, service.smartCalls);
    }

    /** 声明 elicitation 的 2026 客户端：apply=true 先拿 input_required，拒绝后不执行。 */
    @Test
    public void apply为真需MRTR确认() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret");
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_xmigrate");
        params.put("arguments", args("action", "smart_sync", "srcConnId", "prod-src",
                "sourceIndex", "prod_orders", "destConnId", "uat-dest", "apply", Boolean.TRUE));
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "mrtr-smart");
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
        assertEquals("apply=true 维持 MRTR", "input_required", firstResult.get("resultType"));
        assertEquals("确认前不得执行", 0, service.smartCalls);

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
        assertEquals("拒绝后不执行", 0, service.smartCalls);
    }

    /** apply=false 只读预览：声明 elicitation 的客户端也不发 input_required，直接执行。 */
    @Test
    public void apply缺省跳过MRTR直接预览() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret");
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_xmigrate");
        params.put("arguments", args("action", "smart_sync", "srcConnId", "prod-src",
                "sourceIndex", "prod_orders", "destConnId", "uat-dest"));
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

        @SuppressWarnings("unchecked")
        Map<String, Object> direct = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        Map<?, ?> result = (Map<?, ?>) direct.get("result");
        assertFalse("apply=false 预览不发 input_required（无确认请求）", result.containsKey("inputRequests"));
        assertEquals("直接执行", 1, service.smartCalls);
        assertEquals(Boolean.FALSE, service.lastApply);
    }

    /** 全参透传：autoTune/syncAliases/downgradedAnalyzerFallback/destIndex/expectPlanDigest
     *  到达服务层（apply=true 走服务 token 全权限面，不声明 elicitation）。 */
    @Test
    public void 参数透传到服务层() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret");
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "uat-dest",
                        "destIndex", "orders_uat", "syncAliases", Boolean.TRUE,
                        "downgradedAnalyzerFallback", "ik_max_word", "autoTune", Boolean.TRUE,
                        "apply", Boolean.TRUE, "expectPlanDigest", "digest0123456789abcdef"));
        assertEquals(Boolean.FALSE, result.get("isError"));
        assertEquals(1, service.smartCalls);
        assertEquals("prod-src", service.lastSrcConnId);
        assertEquals("prod_orders", service.lastSourceIndex);
        assertEquals("uat-dest", service.lastDestConnId);
        assertEquals("orders_uat", service.lastDestIndex);
        assertEquals(Boolean.TRUE, service.lastSyncAliases);
        assertEquals("ik_max_word", service.lastFallback);
        assertEquals("autoTune 透传", Boolean.TRUE, service.lastAutoTune);
        assertEquals("digest0123456789abcdef", service.lastExpectPlanDigest);
        assertEquals("APPLIED", ((Map<?, ?>) result.get("structuredContent")).get("verdict"));

        call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "uat-dest"));
        assertEquals("缺省 apply=false", Boolean.FALSE, service.lastApply);
        assertEquals("缺省 syncAliases=false", Boolean.FALSE, service.lastSyncAliases);
        assertEquals("缺省 autoTune=false", Boolean.FALSE, service.lastAutoTune);
        assertEquals("缺省 destIndex 透传 null 由服务层回退同名", null, service.lastDestIndex);
        assertEquals("缺省回退分析器透传 null", null, service.lastFallback);
    }

    /** expectPlanDigest 仅 apply=true 合法：预览形态带上明确拒绝（预览不存在计划漂移校验）。 */
    @Test
    public void apply为假拒绝expectPlanDigest() {
        StubMigrateService service = new StubMigrateService();
        McpController controller = new McpController(new FakeAdmin(), "secret");
        controller.setCrossClusterMigrateService(service);

        Map<String, Object> result = call(controller, "Bearer secret", "es_xmigrate_smart_sync",
                args("srcConnId", "prod-src", "sourceIndex", "prod_orders", "destConnId", "uat-dest",
                        "expectPlanDigest", "digest0123456789abcdef"));
        assertEquals(Boolean.TRUE, result.get("isError"));
        assertTrue("must explain the digest/apply conflict, got: " + errorText(result),
                errorText(result).contains("expectPlanDigest only valid with apply=true"));
        assertEquals("拒绝时不触服务面", 0, service.smartCalls);
    }

    /* ───────── 工具 ───────── */

    /** 签发对 host 仅读权限的 key；allowedTools 用「组:action」限定名（签发面口径）。 */
    private static String issueKey(InMemoryMcpKeyStore store) {
        return (String) store.create("smart-sync-tools", "tester", "VIEWER",
                Arrays.asList("es_xmigrate:smart_sync"),
                Collections.singletonList("host"), Collections.singletonList("read"), null,
                60, 100, 100, null).get("secret");
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
        req.put("id", "ss");
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
