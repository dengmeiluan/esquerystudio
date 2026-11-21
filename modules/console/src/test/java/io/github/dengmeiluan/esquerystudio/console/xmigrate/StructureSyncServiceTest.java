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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.elasticsearch.client.RestClient;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 结构同步（反应式剔除路径）的行为契约：按目标真实报错逐轮剔 settings 键 / analysis 组件
 * 并降级字段分词引用（v2 报告：结果归入 reactive 块）；已存在索引 409 拒绝；20 轮上限；
 * 版本差异 warning；不可剔除错误如实失败。矩阵预剔除路径见 StructureSyncDryRunTest。
 *
 * <p>纯 JUnit 直构造：sourceGet/targetGet/targetPut 以路径表/脚本桩覆写，不触真实集群。</p>
 */
public class StructureSyncServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── 自适应剔除序列：unknown setting → Unknown tokenizer → 成功 ───────── */

    /** 三轮典型序列：反应式 setting 剔除 + 插件 tokenizer 剔除（连带引用它的自定义 analyzer）+ 字段引用降级。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 三轮剔除后创建成功并汇报全部清单() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", sourceSettingsJson());
        sync.getSource.put("/legacy_orders/_mapping", sourceMappingJson());
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.addAll(Arrays.asList(400, 400, 200));
        sync.putErrors.addAll(Arrays.asList(
                errorBody("unknown setting [index.qos.legacy]"),
                errorBody("Unknown tokenizer [ik_max_word]"),
                ""));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals(Boolean.TRUE, out.get("created"));
        assertEquals("legacy_orders", out.get("destIndex"));
        assertEquals("destIndex 缺省与 sourceIndex 同名", 3, ((Number) out.get("rounds")).intValue());
        assertEquals("7.10.2", ((Map<String, Object>) out.get("source")).get("version"));
        assertEquals("7.10.2", ((Map<String, Object>) out.get("target")).get("version"));
        assertTrue("同主次版本无 warning", ((List<?>) out.get("warnings")).isEmpty());
        assertFalse("成功后无 lastError", out.containsKey("lastError"));

        Map<String, Object> planned = (Map<String, Object>) out.get("planned");
        assertTrue("矩阵无可预剔项（本例全部反应式）",
                ((List<?>) planned.get("removedSettings")).isEmpty()
                        && ((List<?>) planned.get("removedAnalysis")).isEmpty()
                        && ((List<?>) planned.get("downgradedFields")).isEmpty());

        Map<String, Object> reactive = (Map<String, Object>) out.get("reactive");
        List<Map<String, Object>> removedSettings = (List<Map<String, Object>>) reactive.get("removedSettings");
        assertEquals(1, removedSettings.size());
        assertEquals("index.qos.legacy", removedSettings.get(0).get("key"));
        assertTrue("reason 保留 ES 原始错误摘要",
                String.valueOf(removedSettings.get(0).get("reason")).contains("unknown setting [index.qos.legacy]"));

        List<Map<String, Object>> removedAnalysis = (List<Map<String, Object>>) reactive.get("removedAnalysis");
        assertEquals("引用不可用 tokenizer 的自定义 analyzer 一并剔除", 1, removedAnalysis.size());
        assertEquals("analyzer", removedAnalysis.get(0).get("kind"));
        assertEquals("ik_title", removedAnalysis.get(0).get("name"));

        List<Map<String, Object>> downgraded = (List<Map<String, Object>>) reactive.get("downgradedFields");
        assertEquals("字段引用逐个降级（含嵌套与 multi-field）", 4, downgraded.size());
        Map<String, Object> title = findByField(downgraded, "title");
        assertEquals("analyzer", title.get("attr"));
        assertEquals("ik_max_word", title.get("from"));
        assertEquals("standard", title.get("to"));
        assertEquals("ik_title", findByField(downgraded, "content").get("from"));
        assertEquals("ik_max_word", findByField(downgraded, "extra.inner").get("from"));
        assertEquals("search_analyzer", findByField(downgraded, "extra.inner").get("attr"));
        assertEquals("ik_title", findByField(downgraded, "plain.kw").get("from"));

        String lastBody = sync.putBodies.get(sync.putBodies.size() - 1);
        assertFalse("报错指向的 setting 已剔除", lastBody.contains("qos"));
        assertFalse("内部键已剔除", lastBody.contains("uuid") || lastBody.contains("creation_date")
                || lastBody.contains("provided_name") || lastBody.contains("version"));
        assertTrue("可迁移键保留（嵌套形态）", lastBody.contains("\"number_of_shards\":\"1\""));
        assertFalse("被剔组件名不再出现", lastBody.contains("ik_max_word") || lastBody.contains("ik_title"));
        assertTrue("字段降级为 standard", lastBody.contains("\"analyzer\":\"standard\""));
        Map<String, Object> createBody = jsonOf(lastBody, "createBody");
        @SuppressWarnings("unchecked")
        Map<String, Object> bodyIndex = (Map<String, Object>)
                ((Map<String, Object>) createBody.get("settings")).get("index");
        assertNotNull("settings 为嵌套形态 {index:{...}}", bodyIndex);
        assertTrue("analysis 置于 index.analysis（建索引规范形态）", bodyIndex.containsKey("analysis"));
        @SuppressWarnings("unchecked")
        Map<String, Object> bodyMappings = (Map<String, Object>) createBody.get("mappings");
        assertNotNull("mappings.properties 随体带上", bodyMappings.get("properties"));
    }

    /** 引用被剔除后字段保留：mapping 里的字段定义不因引用降级而消失。 */
    @Test
    public void 字段降级后字段定义保留() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", sourceSettingsJson());
        sync.getSource.put("/legacy_orders/_mapping", sourceMappingJson());
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.addAll(Arrays.asList(400, 200));
        sync.putErrors.addAll(Arrays.asList(errorBody("Unknown tokenizer [ik_max_word]"), ""));

        sync.syncStructure(conn(), "legacy_orders", "orders_v2", null);

        String lastBody = sync.putBodies.get(1);
        assertTrue("字段本身保留", lastBody.contains("\"title\"") && lastBody.contains("\"content\""));
        assertEquals("显式 destIndex 生效", "orders_v2", sync.putDest.get(0));
    }

    /* ───────── 私有 setting / not found 报错形态 ───────── */

    /** private index setting 报错同样按方括号 key 剔除。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 私有setting报错剔除对应键() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\",\"index.vendor.qos\":\"true\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.addAll(Arrays.asList(400, 200));
        sync.putErrors.addAll(Arrays.asList(
                errorBody("private index setting [index.vendor.qos]"), ""));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals(Boolean.TRUE, out.get("created"));
        List<Map<String, Object>> removedSettings = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("reactive")).get("removedSettings");
        assertEquals(1, removedSettings.size());
        assertEquals("index.vendor.qos", removedSettings.get(0).get("key"));
    }

    /** "analyzer [x] not found" 报错形态：剔 analyzer 定义并降级直接引用它的字段。 */
    @Test
    @SuppressWarnings("unchecked")
    public void notFound报错形态剔除analyzer并降级字段() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\",\"index.analysis\":"
                        + "{\"analyzer\":{\"ik_title\":{\"type\":\"custom\",\"tokenizer\":\"standard\"}}}}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_title\"}}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.addAll(Arrays.asList(400, 200));
        sync.putErrors.addAll(Arrays.asList(errorBody("analyzer [ik_title] not found"), ""));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals(Boolean.TRUE, out.get("created"));
        Map<String, Object> reactive = (Map<String, Object>) out.get("reactive");
        List<Map<String, Object>> removedAnalysis = (List<Map<String, Object>>) reactive.get("removedAnalysis");
        assertEquals(1, removedAnalysis.size());
        assertEquals("analyzer", removedAnalysis.get(0).get("kind"));
        assertEquals("ik_title", removedAnalysis.get(0).get("name"));
        List<Map<String, Object>> downgraded = (List<Map<String, Object>>) reactive.get("downgradedFields");
        assertEquals("ik_title", findByField(downgraded, "title").get("from"));
    }

    /** normalizer 引用降级：恒剔除属性（"standard" 不是合法 normalizer 名），字段保留、
     downgradedFields 记 to=null；analyzer 引用仍降级为回退分词器。 */
    @Test
    @SuppressWarnings("unchecked")
    public void normalizer引用恒剔除属性_不替换为fallback() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"ik_smart\"},"
                + "\"tag\":{\"type\":\"keyword\",\"normalizer\":\"ik_smart\"}}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.addAll(Arrays.asList(400, 200));
        sync.putErrors.addAll(Arrays.asList(errorBody("Unknown analyzer [ik_smart]"), ""));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals(Boolean.TRUE, out.get("created"));
        List<Map<String, Object>> downgraded = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("reactive")).get("downgradedFields");
        assertEquals(2, downgraded.size());
        Map<String, Object> title = findByField(downgraded, "title");
        assertEquals("analyzer", title.get("attr"));
        assertEquals("standard", title.get("to"));
        Map<String, Object> tag = findByField(downgraded, "tag");
        assertEquals("normalizer", tag.get("attr"));
        assertNull("normalizer 无合法回退值：to=null（属性剔除）", tag.get("to"));
        String lastBody = sync.putBodies.get(1);
        assertFalse("normalizer 属性已剔除", lastBody.contains("normalizer"));
        assertTrue("字段本体保留", lastBody.contains("\"tag\""));
        assertTrue("analyzer 引用仍降级为 standard", lastBody.contains("\"analyzer\":\"standard\""));
    }

    /* ───────── 目标已存在 / 不可剔除错误 / 非 400 状态 ───────── */

    /** resource_already_exists_exception：拒绝覆盖既有索引，文案给出处置路径。 */
    @Test
    public void 目标索引已存在拒绝覆盖() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.add(400);
        sync.putErrors.add(errorBody("index [legacy_orders/1] already exists", "resource_already_exists_exception"));

        try {
            sync.syncStructure(conn(), "legacy_orders", null, null);
            fail("已存在索引必须直接拒绝");
        } catch (IllegalStateException e) {
            assertTrue("报错含目标索引已存在: " + e.getMessage(), e.getMessage().contains("目标索引已存在"));
            assertTrue("给出处置路径（不覆盖既有索引）", e.getMessage().contains("本能力不覆盖既有索引"));
            assertTrue("提示删除或换名", e.getMessage().contains("先删除或换名"));
        }
    }

    /** 与剔除规则对不上的 400：不再重试，created=false 并带已剔除清单与原始错误。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 不可剔除的400直接失败() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\",\"index.qos.legacy\":\"true\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.addAll(Arrays.asList(400, 400));
        sync.putErrors.addAll(Arrays.asList(
                errorBody("unknown setting [index.qos.legacy]"),
                errorBody("Root mapping definition has unsupported parameters: [foo : bar]")));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals(Boolean.FALSE, out.get("created"));
        assertEquals("错误对不上即终止（不再重试）", 2, ((Number) out.get("rounds")).intValue());
        assertEquals(1, ((List<?>) ((Map<String, Object>) out.get("reactive")).get("removedSettings")).size());
        assertTrue("lastError 保留原始报错", String.valueOf(out.get("lastError")).contains("unsupported parameters"));
    }

    /** 报错指向的 setting 键已不存在：无内容可剔，立即失败。 */
    @Test
    public void 报错键不存在时立即失败() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.add(400);
        sync.putErrors.add(errorBody("unknown setting [index.apack.not.here]"));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals(Boolean.FALSE, out.get("created"));
        assertEquals(1, ((Number) out.get("rounds")).intValue());
        assertTrue(String.valueOf(out.get("lastError")).contains("index.apack.not.here"));
    }

    /** 非 400 状态（404 连接失败等）：直接报错，不进入剔除循环。 */
    @Test
    public void 非400状态直接报错() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.add(404);
        sync.putErrors.add("no handler");

        try {
            sync.syncStructure(conn(), "legacy_orders", null, null);
            fail("404 必须直接报错");
        } catch (IllegalStateException e) {
            assertTrue(e.getMessage().contains("HTTP 404"));
        }
    }

    /* ───────── 循环上限 ───────── */

    /** 20 轮上限：每轮都可剔除但仍未成功时，created=false 并带 20 条剔除记录。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 循环耗尽返回createdFalse与清单() {
        StringBuilder settings = new StringBuilder("{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"");
        for (int i = 0; i < 25; i++) {
            settings.append(",\"index.qos.k").append(i).append("\":\"v\"");
        }
        settings.append("}}}");
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", settings.toString());
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        for (int i = 0; i < StructureSyncService.MAX_ROUNDS; i++) {
            sync.putStatuses.add(400);
            sync.putErrors.add(errorBody("unknown setting [index.qos.k" + i + "]"));
        }

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals(Boolean.FALSE, out.get("created"));
        assertEquals(StructureSyncService.MAX_ROUNDS, ((Number) out.get("rounds")).intValue());
        assertEquals(StructureSyncService.MAX_ROUNDS, ((List<?>)
                ((Map<String, Object>) out.get("reactive")).get("removedSettings")).size());
        assertTrue("lastError 说明不可行原因",
                String.valueOf(out.get("lastError")).contains("20 轮自适应剔除上限"));
    }

    /* ───────── 版本对比 ───────── */

    /** 主/次版本不一致 → 非阻断 warning；两侧 version.number 原样带出（v2 画像块）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 版本不一致产生warning() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("6.8.5"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.add(200);
        sync.putErrors.add("");

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertEquals("6.8.5", ((Map<String, Object>) out.get("source")).get("version"));
        assertEquals("7.10.2", ((Map<String, Object>) out.get("target")).get("version"));
        List<?> warnings = (List<?>) out.get("warnings");
        assertEquals(1, warnings.size());
        assertTrue(String.valueOf(warnings.get(0)).contains("主/次版本不一致"));
        assertTrue(String.valueOf(warnings.get(0)).contains("6.8.5"));
        assertTrue(String.valueOf(warnings.get(0)).contains("7.10.2"));
        assertEquals(Boolean.TRUE, out.get("created"));
    }

    /** 读不到目标版本：如实 warning，不阻断同步。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 版本读取失败如实warning() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.putStatuses.add(200);
        sync.putErrors.add("");

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null);

        assertNull(((Map<String, Object>) out.get("target")).get("version"));
        List<?> warnings = (List<?>) out.get("warnings");
        assertEquals(1, warnings.size());
        assertTrue(String.valueOf(warnings.get(0)).contains("未能读取目标集群版本"));
    }

    /* ───────── 入参边界 ───────── */

    @Test
    public void sourceIndex必填_destIndex缺省同名() {
        ScriptedSync sync = new ScriptedSync();
        try {
            sync.syncStructure(conn(), "  ", null, null);
            fail("空 sourceIndex 必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("sourceIndex"));
        }
        assertEquals("未发 PUT", 0, sync.putBodies.size());
    }

    /** 自定义回退分词器：downgradedFields.to 与落库 body 都用指定值。 */
    @Test
    public void 自定义回退分词器生效() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_smart\"}}}}}");
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.addAll(Arrays.asList(400, 200));
        sync.putErrors.addAll(Arrays.asList(errorBody("Unknown analyzer [ik_smart]"), ""));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, "ik_max_word");

        assertEquals(Boolean.TRUE, out.get("created"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> downgraded = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("reactive")).get("downgradedFields");
        assertEquals("ik_max_word", findByField(downgraded, "title").get("to"));
        assertTrue(sync.putBodies.get(1).contains("\"analyzer\":\"ik_max_word\""));
    }

    /* ───────── 桩与工具 ───────── */

    /**
     * 路径表/脚本桩：sourceGet 与 targetGet 按 path 回放 JSON；
     * targetPut 按状态码/错误体脚本回放（脚本耗尽后重复末值），并记录每次请求体。
     */
    private static class ScriptedSync extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final List<Integer> putStatuses = new ArrayList<>();
        final List<String> putErrors = new ArrayList<>();
        final List<String> putBodies = new ArrayList<>();
        final List<String> putDest = new ArrayList<>();
        private int putCall;

        ScriptedSync() {
            super(() -> {
                throw new RuntimeException("local-client-must-not-be-touched");
            }, new EsIndexAdmin(null), new RemoteEsClientFactory(1000, 1000) {
                @Override
                public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                    return null; // sourceGet 已覆写，远端 client 不应被使用
                }
            });
        }

        @Override
        Map<String, Object> sourceGet(RestClient ll, String path) {
            if (path.endsWith("/_alias") && !getSource.containsKey(path)) {
                return jsonOf("{\"legacy_orders\":{\"aliases\":{}}}", "sourceGet default alias");
            }
            return jsonOf(getSource.get(path), "sourceGet " + path);
        }

        @Override
        Map<String, Object> targetGet(String path) {
            return jsonOf(targetGet.get(path), "targetGet " + path);
        }

        @Override
        StructureSyncService.PutResult targetPut(String destIndex, String jsonBody) {
            putDest.add(destIndex);
            putBodies.add(jsonBody);
            int idx = Math.min(putCall, putStatuses.size() - 1);
            putCall++;
            return new StructureSyncService.PutResult(putStatuses.get(idx), putErrors.get(idx));
        }
    }

    private static Map<String, Object> jsonOf(String json, String what) {
        if (json == null) {
            throw new IllegalStateException("桩缺少响应: " + what);
        }
        try {
            return MAPPER.readValue(json, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("桩响应不是合法 JSON: " + what, e);
        }
    }

    private static RemoteClusterConn conn() {
        return new RemoteClusterConn("http", "10.0.0.9", 9200, "legacy", "pw");
    }

    private static String versionJson(String number) {
        return "{\"version\":{\"number\":\"" + number + "\",\"distribution\":\"default\",\"flavor\":\"default\"}}";
    }

    private static String errorBody(String reason) {
        return errorBody(reason, "illegal_argument_exception");
    }

    private static String errorBody(String reason, String type) {
        return "{\"error\":{\"root_cause\":[{\"type\":\"" + type + "\",\"reason\":"
                + quote(reason) + "}],\"type\":\"" + type + "\",\"reason\":" + quote(reason) + "},\"status\":400}";
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static Map<String, Object> findByField(List<Map<String, Object>> rows, String field) {
        for (Map<String, Object> row : rows) {
            if (field.equals(row.get("field"))) {
                return row;
            }
        }
        throw new AssertionError("缺少字段降级记录: " + field + " in " + rows);
    }

    /** 源 settings（flat）：含内部键、非矩阵规则覆盖的反应式 setting 与引用插件 tokenizer 的自定义 analyzer。 */
    private static String sourceSettingsJson() {
        return "{\"legacy_orders\":{\"settings\":{"
                + "\"index.number_of_shards\":\"1\","
                + "\"index.number_of_replicas\":\"1\","
                + "\"index.uuid\":\"u-1\","
                + "\"index.creation_date\":\"1600000000000\","
                + "\"index.provided_name\":\"legacy_orders\","
                + "\"index.version.created\":\"7090099\","
                + "\"index.version.upgraded\":\"7090199\","
                + "\"index.qos.legacy\":\"true\","
                + "\"index.analysis\":{\"analyzer\":{\"ik_title\":{\"type\":\"custom\",\"tokenizer\":\"ik_max_word\"}},"
                + "\"filter\":{\"my_stop\":{\"type\":\"stop\",\"stopwords\":[\"的\"]}}}"
                + "}}}";
    }

    /** 源 mapping：直接引用插件分词器、经自定义 analyzer 引用、嵌套对象与 multi-field 各一。 */
    private static String sourceMappingJson() {
        return "{\"legacy_orders\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"},"
                + "\"content\":{\"type\":\"text\",\"analyzer\":\"ik_title\"},"
                + "\"plain\":{\"type\":\"text\",\"analyzer\":\"standard\",\"fields\":"
                + "{\"kw\":{\"type\":\"text\",\"analyzer\":\"ik_title\"}}},"
                + "\"extra\":{\"properties\":{\"inner\":{\"type\":\"text\",\"search_analyzer\":\"ik_max_word\"}}}"
                + "}}}}";
    }
}
