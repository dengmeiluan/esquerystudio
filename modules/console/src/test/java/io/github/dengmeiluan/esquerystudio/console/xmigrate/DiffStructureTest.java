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
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 结构 diff 契约：settings 三清单（onlyInSource/onlyInTarget/valueChanged，运行时可变键忽略）、
 * mappings 三清单（字段增/删/改，type/analyzer 语义属性）、expectedRemovals（兼容矩阵对源的计划
 * 剔除/降级豁免表，对象数组 {area,key,reason} 对齐 TS/mjs）、unexpected 与 compatible 判定
 * （计划降级字段仅 analysis 引用属性差异不计 unexpected）；目标索引不存在明确报错；
 * destIndex 缺省=sourceIndex。纯路径表桩，不触真实集群。
 */
public class DiffStructureTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 全量差异：计划剔除内（apack）不算 unexpected，其余 settings/mappings 差异逐项呈报。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 差异用例_计划内豁免_计划外逐项呈报() {
        ScriptedDiff sync = stubDrifted();

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2");

        assertEquals("legacy_orders", out.get("sourceIndex"));
        assertEquals("orders_v2", out.get("destIndex"));

        Map<String, Object> settingsDiff = (Map<String, Object>) out.get("settingsDiff");
        List<Map<String, Object>> onlyInSource = (List<Map<String, Object>>) settingsDiff.get("onlyInSource");
        assertEquals(1, onlyInSource.size());
        assertEquals("index.apack.knn", onlyInSource.get(0).get("key"));
        List<Map<String, Object>> onlyInTarget = (List<Map<String, Object>>) settingsDiff.get("onlyInTarget");
        assertEquals(1, onlyInTarget.size());
        assertEquals("index.custom.setting", onlyInTarget.get(0).get("key"));
        assertEquals("x", onlyInTarget.get(0).get("targetValue"));
        List<Map<String, Object>> valueChanged = (List<Map<String, Object>>) settingsDiff.get("valueChanged");
        assertEquals(1, valueChanged.size());
        assertEquals("index.refresh_interval", valueChanged.get(0).get("key"));
        assertEquals("30s", valueChanged.get(0).get("sourceValue"));
        assertEquals("1s", valueChanged.get(0).get("targetValue"));

        Map<String, Object> mappingsDiff = (Map<String, Object>) out.get("mappingsDiff");
        assertEquals(java.util.Collections.singletonList(map("field", "remark", "type", "text")),
                mappingsDiff.get("fieldAdded"));
        assertEquals(java.util.Collections.singletonList(map("field", "extra.inner", "type", "text")),
                mappingsDiff.get("fieldRemoved"));
        List<Map<String, Object>> fieldChanged = (List<Map<String, Object>>) mappingsDiff.get("fieldChanged");
        assertEquals(1, fieldChanged.size());
        assertEquals("title", fieldChanged.get(0).get("field"));
        assertEquals("text", fieldChanged.get(0).get("sourceType"));
        assertEquals("text", fieldChanged.get(0).get("targetType"));
        assertEquals("analyzer: ik_max_word -> standard", fieldChanged.get(0).get("detail"));

        List<Map<String, Object>> expected = (List<Map<String, Object>>) out.get("expectedRemovals");
        assertEquals("expectedRemovals 为对象数组（对齐 TS/mjs）", 1, expected.size());
        assertEquals("settings", expected.get(0).get("area"));
        assertEquals("index.apack.knn", expected.get(0).get("key"));
        assertEquals("阿里云 apack 私有设置，跨环境不可迁移", expected.get(0).get("reason"));

        List<Map<String, Object>> unexpected = (List<Map<String, Object>>) out.get("unexpected");
        assertEquals("settings×2 + mappings×3（apack 豁免、title 未按计划降级不豁免）", 5, unexpected.size());
        assertEquals(Boolean.FALSE, out.get("compatible"));
    }

    /** 完全一致：三清单全空、unexpected 空、compatible=true（mappings 归一后语义等价）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 一致用例_compatible为true() {
        ScriptedDiff sync = new ScriptedDiff();
        String settings = "{\"legacy_orders\":{\"settings\":{"
                + "\"index.number_of_shards\":\"1\","
                + "\"index.number_of_replicas\":\"1\"}}}";
        String mapping = "{\"legacy_orders\":{\"mappings\":{\"properties\":"
                + "{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}}}";
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", settings);
        sync.getSource.put("/legacy_orders/_mapping", mapping);
        sync.targetGet.put("/orders_v2/_settings?flat_settings=true",
                "{\"orders_v2\":{\"settings\":{"
                        + "\"index.number_of_shards\":\"1\","
                        + "\"index.number_of_replicas\":\"2\","
                        + "\"index.creation_date\":\"1600000000000\"}}}");
        sync.targetGet.put("/orders_v2/_mapping",
                "{\"orders_v2\":{\"mappings\":{\"properties\":"
                        + "{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}}}");
        sync.targetGet.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"}}");
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-ik"));

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2");

        Map<String, Object> settingsDiff = (Map<String, Object>) out.get("settingsDiff");
        assertTrue(((List<?>) settingsDiff.get("onlyInSource")).isEmpty());
        assertTrue(((List<?>) settingsDiff.get("onlyInTarget")).isEmpty());
        assertTrue("replicas/creation_date 等运行时可变键忽略",
                ((List<?>) settingsDiff.get("valueChanged")).isEmpty());
        Map<String, Object> mappingsDiff = (Map<String, Object>) out.get("mappingsDiff");
        assertTrue(((List<?>) mappingsDiff.get("fieldAdded")).isEmpty());
        assertTrue(((List<?>) mappingsDiff.get("fieldRemoved")).isEmpty());
        assertTrue(((List<?>) mappingsDiff.get("fieldChanged")).isEmpty());
        assertTrue(((List<?>) out.get("unexpected")).isEmpty());
        assertEquals(Boolean.TRUE, out.get("compatible"));
    }

    /** 目标索引不存在：明确报错，不冒充空 diff。 */
    @Test
    public void 目标索引不存在明确报错() {
        ScriptedDiff sync = new ScriptedDiff();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        /* 目标侧不提供任何响应 */

        try {
            sync.diffStructure(conn(), "legacy_orders", null, "orders_missing");
            fail("目标索引不存在必须明确报错");
        } catch (IllegalStateException e) {
            assertTrue("报错指明目标索引: " + e.getMessage(),
                    e.getMessage().contains("目标索引不存在或不可读"));
            assertTrue(e.getMessage().contains("orders_missing"));
        }
    }

    /** 计划降级豁免：目标缺 ik 插件时 title 按计划降级（fieldChanged 差异仅 analyzer）不计
     unexpected；同字段的 type 变化（sku）不豁免；expectedRemovals 记 mappings 降级字段名。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 计划降级字段仅analysis属性差异不计unexpected() {
        ScriptedDiff sync = new ScriptedDiff();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"},"
                + "\"sku\":{\"type\":\"keyword\"}}}}}");
        sync.targetGet.put("/orders_v2/_settings?flat_settings=true",
                "{\"orders_v2\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.targetGet.put("/orders_v2/_mapping", "{\"orders_v2\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"standard\"},"
                + "\"sku\":{\"type\":\"text\"}}}}}");
        sync.targetGet.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"}}");
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-pinyin"));

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2");

        List<Map<String, Object>> expected = (List<Map<String, Object>>) out.get("expectedRemovals");
        assertEquals(1, expected.size());
        assertEquals("mappings", expected.get(0).get("area"));
        assertEquals("降级条目记字段名", "title", expected.get(0).get("key"));

        List<Map<String, Object>> fieldChanged = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("mappingsDiff")).get("fieldChanged");
        assertEquals("差异照报（豁免只作用于 unexpected）", 2, fieldChanged.size());

        List<Map<String, Object>> unexpected = (List<Map<String, Object>>) out.get("unexpected");
        assertEquals("title 按计划降级豁免，sku 的 type 变化仍计 unexpected", 1, unexpected.size());
        assertEquals("sku", unexpected.get(0).get("key"));
        assertEquals(Boolean.FALSE, out.get("compatible"));
    }

    /** 嵌套 index.analysis 单键形态（标准 ES flat 响应）：计划剔除组件造成整键 valueChanged
     * （源有 ik_max_word 子树、目标建成时已剔除），按组件级差集豁免 unexpected——
     * sync 后 verify 闭环不误报 incompatible；保留组件（keep_stop）定义差异仍照报。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 嵌套analysis整键计划剔除豁免() {
        ScriptedDiff sync = new ScriptedDiff();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{"
                        + "\"index.number_of_shards\":\"1\","
                        + "\"index.analysis\":{\"tokenizer\":{"
                        + "\"ik_max_word\":{\"type\":\"ik_max_word\"},"
                        + "\"keep_stop\":{\"type\":\"stop\"}}}}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":"
                + "{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}}}");
        sync.targetGet.put("/orders_v2/_settings?flat_settings=true",
                "{\"orders_v2\":{\"settings\":{"
                        + "\"index.number_of_shards\":\"1\","
                        + "\"index.analysis\":{\"tokenizer\":{"
                        + "\"keep_stop\":{\"type\":\"stop\"}}}}}}");
        sync.targetGet.put("/orders_v2/_mapping",
                "{\"orders_v2\":{\"mappings\":{\"properties\":"
                        + "{\"title\":{\"type\":\"text\",\"analyzer\":\"standard\"}}}}}");
        sync.targetGet.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"}}");
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-pinyin"));

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2");

        List<Map<String, Object>> unexpected = (List<Map<String, Object>>) out.get("unexpected");
        assertTrue("嵌套 analysis 整键差异被计划剔除解释，不误报: " + unexpected, unexpected.isEmpty());
        assertEquals(Boolean.TRUE, out.get("compatible"));
    }

    /** destIndex 缺省=sourceIndex（与 sync_structure 同形）：目标按同名索引读取并 echo。 */
    @Test
    public void destIndex缺省与sourceIndex同名() {
        ScriptedDiff sync = new ScriptedDiff();
        String settings = "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}";
        String mapping = "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}";
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", settings);
        sync.getSource.put("/legacy_orders/_mapping", mapping);
        sync.targetGet.put("/legacy_orders/_settings?flat_settings=true", settings);
        sync.targetGet.put("/legacy_orders/_mapping", mapping);
        sync.targetGet.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"}}");
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-ik"));

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, null);

        assertEquals("legacy_orders", out.get("sourceIndex"));
        assertEquals("destIndex 缺省回退 sourceIndex 名", "legacy_orders", out.get("destIndex"));
        assertEquals(Boolean.TRUE, out.get("compatible"));
    }

    /* ───────── 桩与工具 ───────── */

    /** 差异桩：源(aliyun 习惯键+ik 字段+嵌套) vs 目标(降级后+独有键+多字段+缺嵌套子字段)。 */
    private static ScriptedDiff stubDrifted() {
        ScriptedDiff sync = new ScriptedDiff();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", "{"
                + "\"legacy_orders\":{\"settings\":{"
                + "\"index.number_of_shards\":\"1\","
                + "\"index.number_of_replicas\":\"1\","
                + "\"index.apack.knn\":\"true\","
                + "\"index.refresh_interval\":\"30s\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"},"
                + "\"sku\":{\"type\":\"keyword\"},"
                + "\"extra\":{\"properties\":{\"inner\":{\"type\":\"text\",\"analyzer\":\"standard\"}}}"
                + "}}}}");
        sync.targetGet.put("/orders_v2/_settings?flat_settings=true", "{"
                + "\"orders_v2\":{\"settings\":{"
                + "\"index.number_of_shards\":\"1\","
                + "\"index.refresh_interval\":\"1s\","
                + "\"index.custom.setting\":\"x\"}}}");
        sync.targetGet.put("/orders_v2/_mapping", "{\"orders_v2\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"standard\"},"
                + "\"sku\":{\"type\":\"keyword\"},"
                + "\"remark\":{\"type\":\"text\"},"
                + "\"extra\":{}"
                + "}}}}");
        sync.targetGet.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"}}");
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-ik"));
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":2,\"number_of_data_nodes\":2}");
        return sync;
    }

    private static class ScriptedDiff extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();

        ScriptedDiff() {
            super(() -> {
                throw new RuntimeException("local-client-must-not-be-touched");
            }, new EsIndexAdmin(null), new RemoteEsClientFactory(1000, 1000) {
                @Override
                public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                    return new org.elasticsearch.client.RestHighLevelClient(
                            RestClient.builder(new HttpHost("127.0.0.1", 1)));
                }
            });
        }

        @Override
        Map<String, Object> sourceGet(RestClient ll, String path) {
            return json(getSource.get(path));
        }

        @Override
        Map<String, Object> targetGet(String path) {
            return json(targetGet.get(path));
        }
    }

    private static Map<String, Object> json(String raw) {
        if (raw == null) {
            throw new IllegalStateException("桩缺少响应");
        }
        try {
            return MAPPER.readValue(raw, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("桩响应不是合法 JSON", e);
        }
    }

    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }

    private static RemoteClusterConn conn() {
        return new RemoteClusterConn("http", "10.0.0.9", 9200, "legacy", "pw");
    }

    private static String pluginsJson(String... pluginIds) {
        StringBuilder plugins = new StringBuilder();
        for (String id : pluginIds) {
            if (plugins.length() > 0) {
                plugins.append(",");
            }
            plugins.append("{\"id\":\"").append(id).append("\"}");
        }
        return "{\"nodes\":{\"n1\":{\"plugins\":[" + plugins + "]}}}";
    }
}
