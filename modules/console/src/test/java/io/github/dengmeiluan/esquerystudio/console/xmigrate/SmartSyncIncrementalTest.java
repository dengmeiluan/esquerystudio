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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * smart_sync incremental 模式契约：目标索引必须已存在（缺索引「目标索引不存在或不可读」
 * 前缀报错 → 404 DEST_NOT_FOUND 通道）；计划五清单（addedFields/skippedConflicts/
 * updatedSettings/staticBlocked/addedAliases，兼容矩阵照跑——新增字段引用目标缺失组件降级）；
 * apply=false 纯预览零写（mode/planDigest 回显）；apply=true 执行序 PUT _mapping（merge）→
 * PUT _settings（动态键）→ 补别名（filter 元数据透传），每步进 executed；静态差异只进
 * staticBlocked 呈报不动；漂移门拒绝过期计划；非法 mode 拒绝；旧 11 参形态 mode=create
 * 行为不变。纯路径表桩（写请求全部被覆写记录），不触真实集群。
 */
public class SmartSyncIncrementalTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── apply=false 纯预览 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 预览零写_五清单与计划体齐备() {
        ScriptedIncremental sync = stubIncremental();

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                true, null, false, false, null, "incremental");

        assertThat(out.get("mode")).isEqualTo("incremental");
        assertThat(out.get("verdict")).isEqualTo("PLANNED");
        assertThat(out.get("applied")).isEqualTo(false);
        assertThat(out.get("destIndex")).isEqualTo("orders_v2");
        assertThat(String.valueOf(out.get("planDigest"))).matches("[0-9a-f]{16}");
        assertThat(sync.writes).as("纯预览：桩侧零写请求").isEmpty();
        assertThat((List<?>) out.get("executed")).isEmpty();

        Map<String, Object> incremental = (Map<String, Object>) out.get("incremental");
        List<Map<String, Object>> addedFields = (List<Map<String, Object>>) incremental.get("addedFields");
        assertThat(addedFields).hasSize(3);
        assertThat(addedFields.get(0)).containsEntry("field", "extra.inner").containsEntry("type", "text");
        assertThat(addedFields.get(1)).containsEntry("field", "remark").containsEntry("type", "text");
        assertThat(addedFields.get(2)).containsEntry("field", "title").containsEntry("type", "text");

        List<Map<String, Object>> conflicts = (List<Map<String, Object>>) incremental.get("skippedConflicts");
        assertThat(conflicts).hasSize(1);
        assertThat(conflicts.get(0))
                .containsEntry("field", "sku")
                .containsEntry("sourceType", "keyword")
                .containsEntry("targetType", "text")
                .containsEntry("detail", "type: keyword -> text");

        List<Map<String, Object>> updated = (List<Map<String, Object>>) incremental.get("updatedSettings");
        assertThat(updated).hasSize(2);
        assertThat(updated.get(0))
                .containsEntry("key", "index.max_result_window")
                .containsEntry("sourceValue", "20000")
                .containsEntry("targetValue", null);
        assertThat(updated.get(1))
                .containsEntry("key", "index.refresh_interval")
                .containsEntry("sourceValue", "30s")
                .containsEntry("targetValue", "1s");

        List<Map<String, Object>> blocked = (List<Map<String, Object>>) incremental.get("staticBlocked");
        assertThat(blocked).hasSize(1);
        assertThat(blocked.get(0))
                .containsEntry("key", "index.number_of_shards")
                .containsEntry("sourceValue", "12")
                .containsEntry("targetValue", "3");
        assertThat(String.valueOf(blocked.get(0).get("reason"))).contains("静态设置");
        assertThat((List<?>) incremental.get("addedAliases"))
                .as("目标已有 a_read：只补 a_write").containsExactly("a_write");

        /* 兼容矩阵照跑：apack 剔除、ik 组件剔除、新增字段 title 引用降级 */
        Map<String, Object> planned = (Map<String, Object>) out.get("planned");
        List<Map<String, Object>> removedSettings = (List<Map<String, Object>>) planned.get("removedSettings");
        assertThat(removedSettings).hasSize(1);
        assertThat(removedSettings.get(0)).containsEntry("key", "index.apack.knn");
        List<Map<String, Object>> removedAnalysis = (List<Map<String, Object>>) planned.get("removedAnalysis");
        assertThat(removedAnalysis).hasSize(1);
        assertThat(removedAnalysis.get(0))
                .containsEntry("kind", "tokenizer").containsEntry("name", "my_ik");
        List<Map<String, Object>> downgraded = (List<Map<String, Object>>) planned.get("downgradedFields");
        assertThat(downgraded).hasSize(1);
        assertThat(downgraded.get(0))
                .containsEntry("field", "title").containsEntry("from", "ik_max_word")
                .containsEntry("to", "standard");

        Map<String, Object> body = (Map<String, Object>) out.get("body");
        Map<String, Object> bodySettingsIndex = (Map<String, Object>)
                ((Map<String, Object>) body.get("settings")).get("index");
        assertThat(bodySettingsIndex.keySet()).containsExactlyInAnyOrder("refresh_interval", "max_result_window");
        Map<String, Object> bodyProps = (Map<String, Object>)
                ((Map<String, Object>) body.get("mappings")).get("properties");
        assertThat(bodyProps.keySet()).containsExactlyInAnyOrder("extra", "remark", "title");
        Map<String, Object> titleDef = (Map<String, Object>) bodyProps.get("title");
        assertThat(titleDef).containsEntry("analyzer", "standard").containsEntry("type", "text");
        Map<String, Object> extraProps = (Map<String, Object>)
                ((Map<String, Object>) bodyProps.get("extra")).get("properties");
        assertThat(extraProps.keySet()).containsExactly("inner");
        assertThat((List<?>) body.get("aliases")).containsExactly("a_write");

        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertThat((List<?>) aliases.get("synced")).containsExactly("a_write");
        assertThat((List<?>) aliases.get("skipped")).containsExactly("a_read");
    }

    /* ───────── 目标索引缺失 → DEST_NOT_FOUND 通道 ───────── */

    @Test
    public void 目标索引不存在走既有DEST_NOT_FOUND报错() {
        ScriptedIncremental sync = stubIncremental();
        sync.targetGet.remove("/orders_v2/_settings?flat_settings=true");

        assertThatThrownBy(() -> sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                false, null, false, false, null, "incremental"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("目标索引不存在或不可读")
                .hasMessageContaining("orders_v2");
        assertThat(sync.writes).isEmpty();
    }

    /* ───────── apply=true 执行序 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 执行序mapping先行settings次之别名最后() {
        ScriptedIncremental sync = stubIncremental();

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                true, null, false, true, null, "incremental");

        assertThat(out.get("verdict")).isEqualTo("APPLIED");
        assertThat(out.get("applied")).isEqualTo(true);
        assertThat(sync.writes).hasSize(3);
        assertThat(sync.writes.get(0)).startsWith("PUT /orders_v2/_mapping ").contains("\"properties\"");
        assertThat(sync.writes.get(0)).as("字段冲突 sku 不进 PUT 体").doesNotContain("\"sku\"");
        assertThat(sync.writes.get(1)).startsWith("PUT /orders_v2/_settings ")
                .contains("\"refresh_interval\"").doesNotContain("number_of_shards");
        assertThat(sync.writes.get(2)).startsWith("POST /_aliases ")
                .contains("a_write").contains("\"filter\"").doesNotContain("a_read");

        List<Map<String, Object>> executed = (List<Map<String, Object>>) out.get("executed");
        assertThat(executed).hasSize(3);
        assertThat(executed.get(0)).containsEntry("step", "put_mapping").containsEntry("status", 200);
        assertThat(executed.get(1)).containsEntry("step", "put_settings").containsEntry("status", 200);
        assertThat(executed.get(2)).containsEntry("step", "add_aliases")
                .containsEntry("status", 200).containsEntry("detail", "1/1 个别名写成功");
        assertThat(out).doesNotContainKey("lastError");
        assertThat((List<?>) ((Map<String, Object>) out.get("aliases")).get("synced"))
                .containsExactly("a_write");
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 单步失败继续其余步骤_verdict为FAILED() {
        ScriptedIncremental sync = stubIncremental();
        sync.mappingStatus = 400;
        sync.mappingError = "{\"error\":{\"root_cause\":[{\"type\":\"mapper_parsing_exception\","
                + "\"reason\":\"mapping merge failed\"}]}}";

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                true, null, false, true, null, "incremental");

        assertThat(out.get("verdict")).isEqualTo("FAILED");
        assertThat(out.get("applied")).isEqualTo(false);
        List<Map<String, Object>> executed = (List<Map<String, Object>>) out.get("executed");
        assertThat(executed).hasSize(3);
        assertThat(executed.get(0)).containsEntry("step", "put_mapping").containsEntry("status", 400);
        assertThat(String.valueOf(executed.get(0).get("detail"))).contains("mapper_parsing_exception");
        assertThat(executed.get(1)).containsEntry("step", "put_settings").containsEntry("status", 200);
        assertThat(executed.get(2)).containsEntry("step", "add_aliases").containsEntry("status", 200);
        assertThat(String.valueOf(out.get("lastError"))).contains("失败步骤");
    }

    /* ───────── 漂移门 ───────── */

    @Test
    public void 计划漂移时拒绝执行_零写() {
        ScriptedIncremental sync = stubIncremental();
        Map<String, Object> preview = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                true, null, false, false, null, "incremental");
        String staleDigest = String.valueOf(preview.get("planDigest"));

        /* 两次调用之间源结构变化：新增一个 settings 键（模拟漂移） */
        sync.getSource.put("/orders/_settings?flat_settings=true", indexBody("orders", "settings", map(
                "index.number_of_shards", "12",
                "index.number_of_replicas", "1",
                "index.refresh_interval", "30s",
                "index.max_result_window", "20000",
                "index.merge.policy.max_merged_segment", "5gb",
                "index.apack.knn", "true",
                "index.unassigned.node_left.delayed_timeout", "10m",
                "index.analysis", map("tokenizer", map("my_ik", map("type", "ik_max_word"))))));

        assertThatThrownBy(() -> sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                true, null, false, true, staleDigest, "incremental"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("计划摘要不匹配，拒绝执行")
                .hasMessageContaining(staleDigest);
        assertThat(sync.writes).as("漂移拒绝发生在任何写之前").isEmpty();
    }

    /* ───────── autoTune 在增量模式不收敛 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void autoTune增量模式不收敛分片_中文告知() {
        ScriptedIncremental sync = stubIncremental();

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                false, null, true, false, null, "incremental");

        assertThat((List<?>) out.get("autoTuned")).isEmpty();
        assertThat((List<String>) out.get("warnings"))
                .anyMatch(w -> w.contains("incremental 模式不自动调整分片数"));
        List<Map<String, Object>> blocked = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("incremental")).get("staticBlocked");
        assertThat(blocked).hasSize(1);
        assertThat(blocked.get(0)).containsEntry("key", "index.number_of_shards");
    }

    /* ───────── 源/目标分析组件差异（index.analysis 单键口径） ───────── */

    /** 源 analysis 剩余组件（内置依赖不被矩阵剔除）与目标不一致 → staticBlocked 报
     *  index.analysis 单键条目（sourceValue=矩阵剔除后剩余嵌套对象、targetValue=null、
     *  reason 与其它静态键同文案）；目标带相同组件时双侧一致不报。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 分析组件差异进staticBlocked_一致时不报() {
        ScriptedIncremental sync = stubIncremental();
        sync.getSource.put("/orders/_settings?flat_settings=true", indexBody("orders", "settings", map(
                "index.number_of_shards", "12",
                "index.number_of_replicas", "1",
                "index.refresh_interval", "30s",
                "index.max_result_window", "20000",
                "index.merge.policy.max_merged_segment", "5gb",
                "index.apack.knn", "true",
                "index.unassigned.node_left.delayed_timeout", "10m",
                "index.analysis", map(
                        "tokenizer", map("my_ik", map("type", "ik_max_word")),
                        "filter", map("my_lower", map("type", "lowercase"))))));

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                false, null, false, false, null, "incremental");
        List<Map<String, Object>> blocked = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("incremental")).get("staticBlocked");
        assertThat(blocked).hasSize(2);
        assertThat(blocked.get(0))
                .containsEntry("key", "index.analysis")
                .containsEntry("sourceValue", map("filter", map("my_lower", map("type", "lowercase"))))
                .containsEntry("targetValue", null);
        assertThat(String.valueOf(blocked.get(0).get("reason"))).contains("静态设置");
        assertThat(blocked.get(1)).containsEntry("key", "index.number_of_shards");

        /* 目标带与源矩阵剔除后相同的剩余组件：双侧一致不报 */
        sync.targetGet.put("/orders_v2/_settings?flat_settings=true", indexBody("orders_v2", "settings", map(
                "index.number_of_shards", "3",
                "index.number_of_replicas", "1",
                "index.refresh_interval", "1s",
                "index.merge.policy.max_merged_segment", "5gb",
                "index.analysis", map("filter", map("my_lower", map("type", "lowercase"))))));
        Map<String, Object> out2 = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                false, null, false, false, null, "incremental");
        List<Map<String, Object>> blocked2 = (List<Map<String, Object>>)
                ((Map<String, Object>) out2.get("incremental")).get("staticBlocked");
        assertThat(blocked2).hasSize(1);
        assertThat(blocked2.get(0)).containsEntry("key", "index.number_of_shards");
    }

    /* ───────── 非法 mode 与旧签名 ───────── */

    @Test
    public void 非法mode拒绝() {
        ScriptedIncremental sync = stubIncremental();
        assertThatThrownBy(() -> sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                false, null, false, false, null, "patch"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mode 必须为 create 或 incremental");
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 旧签名委托create模式_行为与回显不变() {
        ScriptedIncremental sync = stubIncremental();

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                false, null, false, false, null);

        assertThat(out.get("mode")).isEqualTo("create");
        assertThat(out.get("verdict")).isEqualTo("PLANNED");
        assertThat(out).doesNotContainKey("incremental");
        assertThat(sync.writes).isEmpty();
    }

    /* ───────── 桩与工具 ───────── */

    /**
     * 路径表桩：源/宿主目标两通道按路径回放 JSON；三类增量写（_mapping/_settings/_aliases）
     * 与建索引 PUT 全部记录请求体。远端 client 为本地假句柄（不触网）。
     */
    private static class ScriptedIncremental extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final List<String> writes = new ArrayList<>();
        int mappingStatus = 200;
        String mappingError = "";

        ScriptedIncremental() {
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
            return jsonMap(getSource.get(path));
        }

        @Override
        Map<String, Object> targetGet(String path) {
            return jsonMap(targetGet.get(path));
        }

        @Override
        StructureSyncService.PutResult targetPut(String destIndex, String jsonBody) {
            writes.add("PUT /" + destIndex + " " + jsonBody);
            return new StructureSyncService.PutResult(200, "{\"acknowledged\":true}");
        }

        @Override
        StructureSyncService.PutResult targetPutMapping(String destIndex, String jsonBody) {
            writes.add("PUT /" + destIndex + "/_mapping " + jsonBody);
            return new StructureSyncService.PutResult(mappingStatus, mappingError);
        }

        @Override
        StructureSyncService.PutResult targetPutSettings(String destIndex, String jsonBody) {
            writes.add("PUT /" + destIndex + "/_settings " + jsonBody);
            return new StructureSyncService.PutResult(200, "{\"acknowledged\":true}");
        }

        @Override
        StructureSyncService.PutResult targetPostAliases(String jsonBody) {
            writes.add("POST /_aliases " + jsonBody);
            return new StructureSyncService.PutResult(200, "{\"acknowledged\":true}");
        }
    }

    /** 源(aliyun 习惯键+ik 引用+别名 a_read/a_write) vs 目标(已有索引：动态键不同、sku 类型冲突、缺字段)。 */
    private static ScriptedIncremental stubIncremental() {
        ScriptedIncremental sync = new ScriptedIncremental();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/_nodes/plugins", pluginsJson("analysis-ik"));
        sync.getSource.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
        sync.getSource.put("/orders/_settings?flat_settings=true", indexBody("orders", "settings", map(
                "index.number_of_shards", "12",
                "index.number_of_replicas", "1",
                "index.refresh_interval", "30s",
                "index.max_result_window", "20000",
                "index.merge.policy.max_merged_segment", "5gb",
                "index.apack.knn", "true",
                "index.analysis", map("tokenizer", map("my_ik", map("type", "ik_max_word"))))));
        sync.getSource.put("/orders/_mapping", indexBody("orders", "mappings", map("properties", map(
                "title", map("type", "text", "analyzer", "ik_max_word"),
                "sku", map("type", "keyword"),
                "remark", map("type", "text"),
                "name", map("type", "keyword"),
                "extra", map("properties", map("inner", map("type", "text")))))));
        sync.getSource.put("/orders/_alias", indexBody("orders", "aliases", map(
                "a_read", map(),
                "a_write", map("filter", map("term", map("env", "uat"))))));
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-pinyin"));
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
        sync.targetGet.put("/orders_v2/_settings?flat_settings=true", indexBody("orders_v2", "settings", map(
                "index.number_of_shards", "3",
                "index.number_of_replicas", "1",
                "index.refresh_interval", "1s",
                "index.merge.policy.max_merged_segment", "5gb")));
        sync.targetGet.put("/orders_v2/_mapping", indexBody("orders_v2", "mappings", map("properties", map(
                "sku", map("type", "text"),
                "name", map("type", "keyword"),
                "extra", map()))));
        sync.targetGet.put("/orders_v2/_alias", indexBody("orders_v2", "aliases", map("a_read", map())));
        return sync;
    }

    private static Map<String, Object> jsonMap(String raw) {
        if (raw == null) {
            throw new IllegalStateException("桩缺少响应");
        }
        try {
            return MAPPER.readValue(raw, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("桩响应不是合法 JSON", e);
        }
    }

    /** {@code {index:{section:value}}} 形态的索引级响应（settings/mapping/alias 共用）。 */
    private static String indexBody(String index, String section, Object value) {
        Map<String, Object> idx = new LinkedHashMap<>();
        idx.put(section, value);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put(index, idx);
        return json(root);
    }

    private static String json(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
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

    private static String versionJson(String number, String distribution) {
        return "{\"version\":{\"number\":\"" + number + "\",\"distribution\":\"" + distribution + "\"}}";
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
