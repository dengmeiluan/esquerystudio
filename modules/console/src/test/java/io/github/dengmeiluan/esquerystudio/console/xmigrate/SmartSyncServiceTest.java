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
 * smart_sync 智能结构同步契约：destConnId 必填（空值 IllegalArgumentException，消息含
 * destConnId）；apply=false 纯只读（verdict=PLANNED，桩侧零写请求）；planned 清单含规则
 * 溯源（rule/reason 在列，旧字段保留）；autoTune 分片按目标数据节点数收敛与判据不可靠
 * 跳过两态；version-floor / store-type-vendor 两规则经全流程正反例；apply=true 落盘
 * verdict=APPLIED 并附 reactive 清单；expectPlanDigest 漂移拒绝（服务层
 * IllegalStateException「计划摘要不匹配，拒绝执行」前缀 = 409 PLAN_DRIFT 的映射依据）。
 * 纯 JUnit 路径表桩（假远端 client 只提供 low-level 句柄，请求全部被覆写），不触真实集群。
 */
public class SmartSyncServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── destConnId 必填 ───────── */

    @Test
    public void destConnId空值拒绝() {
        CrossClusterMigrateService service = new CrossClusterMigrateService(
                () -> {
                    throw new RuntimeException("local-client-must-not-be-touched");
                },
                new EsIndexAdmin(null), fakeFactory(),
                null, null, null, null, null, null);
        assertThatThrownBy(() -> service.smartSync("src-1", "orders", "   ", "orders_v2",
                false, null, false, false, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("destConnId");
    }

    /* ───────── apply=false 纯只读 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void apply为false纯只读_verdict为PLANNED_不发写请求() {
        ScriptedSmart sync = stubSmart();
        sync.putStatuses.clear(); // 陷阱位：apply=false 下绝不该被消费

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, false, null);

        assertThat(out.get("verdict")).isEqualTo("PLANNED");
        assertThat(out.get("applied")).isEqualTo(false);
        assertThat(String.valueOf(out.get("planDigest"))).matches("[0-9a-f]{16}");
        assertThat(sync.putBodies).as("纯只读：桩侧未收到任何 PUT").isEmpty();
        assertThat(sync.postAliasBodies).as("纯只读：不写别名").isEmpty();
        assertThat(out.get("destConnId")).isEqualTo("host");
        assertThat(out.get("destIndex")).isEqualTo("orders");
        assertThat(((Number) out.get("rounds")).intValue()).isEqualTo(0);
        Map<String, Object> body = (Map<String, Object>) out.get("body");
        assertThat(body).containsKeys("settings", "mappings", "aliases");
        Map<String, Object> source = (Map<String, Object>) out.get("source");
        assertThat(source.get("index")).isEqualTo("orders");
        assertThat(source).containsKeys("version", "vendor", "plugins", "dataNodeCount", "pluginsReliable");
        Map<String, Object> target = (Map<String, Object>) out.get("target");
        assertThat(target).containsKeys("version", "vendor", "plugins", "dataNodeCount", "pluginsReliable");
        assertThat((List<?>) out.get("autoTuned")).isEmpty();
    }

    /* ───────── planned 规则溯源 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void planned清单含规则溯源_rule与reason在列() {
        ScriptedSmart sync = stubSmart();

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, false, null);

        Map<String, Object> planned = (Map<String, Object>) out.get("planned");
        List<Map<String, Object>> removedSettings = (List<Map<String, Object>>) planned.get("removedSettings");
        assertThat(removedSettings).hasSize(1);
        assertThat(removedSettings.get(0))
                .containsEntry("key", "index.apack.knn")
                .containsEntry("rule", "apack-private")
                .containsEntry("reason", "阿里云 apack 私有设置，跨环境不可迁移");
        List<Map<String, Object>> removedAnalysis = (List<Map<String, Object>>) planned.get("removedAnalysis");
        assertThat(removedAnalysis).isNotEmpty();
        assertThat(removedAnalysis).allSatisfy(
                row -> assertThat(row).containsEntry("rule", "plugin-analysis").containsKey("reason"));
        List<Map<String, Object>> downgraded = (List<Map<String, Object>>) planned.get("downgradedFields");
        assertThat(downgraded).hasSize(1);
        assertThat(downgraded.get(0))
                .containsEntry("field", "title")
                .containsEntry("rule", "plugin-analysis")
                .containsKeys("from", "to", "reason");
    }

    /* ───────── autoTune ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void autoTune按目标数据节点数收敛分片() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/orders/_settings?flat_settings=true",
                ordersBody("settings", map("index.number_of_shards", "12")));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties", map())));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson());
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, true, false, null);

        List<Map<String, Object>> autoTuned = (List<Map<String, Object>>) out.get("autoTuned");
        assertThat(autoTuned).hasSize(1);
        assertThat(autoTuned.get(0))
                .containsEntry("key", "index.number_of_shards")
                .containsEntry("from", 12)
                .containsEntry("to", 3);
        assertThat(String.valueOf(autoTuned.get(0).get("reason"))).contains("数据节点");
        Map<String, Object> bodyIndex = (Map<String, Object>)
                ((Map<String, Object>) ((Map<String, Object>) out.get("body")).get("settings")).get("index");
        assertThat(bodyIndex.get("number_of_shards")).isEqualTo("3");
        assertThat((List<?>) out.get("warnings")).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    public void autoTune判据不可靠时不收敛并中文告知() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/orders/_settings?flat_settings=true",
                ordersBody("settings", map("index.number_of_shards", "12")));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties", map())));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        /* 目标 _nodes/plugins 探测失败：pluginsReliable=false，autoTune 判据不可靠 */
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, true, false, null);

        assertThat((List<?>) out.get("autoTuned")).isEmpty();
        Map<String, Object> bodyIndex = (Map<String, Object>)
                ((Map<String, Object>) ((Map<String, Object>) out.get("body")).get("settings")).get("index");
        assertThat(bodyIndex.get("number_of_shards")).as("判据不可靠时分片数不被改动").isEqualTo("12");
        assertThat((List<String>) out.get("warnings"))
                .anyMatch(w -> w.contains("未自动收敛"));
    }

    /* ───────── version-floor 全流程 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void versionFloor低于地板的键经smartSync剔除_高于地板保留() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("7.13.0", "default"));
        sync.getSource.put("/orders/_settings?flat_settings=true", ordersBody("settings", map(
                "index.search.idle.after", "30s",
                "index.hidden", "true",
                "index.final_pipeline", "pipe-x")));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties", map())));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        sync.targetGet.put("/", versionJson("7.6.0", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson());
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, false, null);

        List<Map<String, Object>> removed = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("planned")).get("removedSettings");
        assertThat(removed).hasSize(2);
        assertThat(removed).allSatisfy(row -> assertThat(row).containsEntry("rule", "version-floor"));
        assertThat(removed.get(0)).containsEntry("key", "index.hidden")
                .containsEntry("reason", "目标 7.6.0 低于该设置最低版本 7.7.0");
        assertThat(removed.get(1)).containsEntry("key", "index.final_pipeline")
                .containsEntry("reason", "目标 7.6.0 低于该设置最低版本 7.12.0");
        Map<String, Object> bodyIndex = (Map<String, Object>)
                ((Map<String, Object>) ((Map<String, Object>) out.get("body")).get("settings")).get("index");
        assertThat(bodyIndex).doesNotContainKey("hidden").doesNotContainKey("final_pipeline");
        assertThat(bodyIndex.get("search")).as("7.6.0 ≥ 7.0.0：index.search.idle.after 保留")
                .isNotNull();
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 目标版本未知时versionFloor不剔除_保守留兜底() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("7.13.0", "default"));
        sync.getSource.put("/orders/_settings?flat_settings=true", ordersBody("settings", map(
                "index.search.idle.after", "30s",
                "index.hidden", "true",
                "index.final_pipeline", "pipe-x")));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties", map())));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        /* 目标 / 探测失败：版本未知 → version-floor 保守不剔 */
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, false, null);

        List<Map<String, Object>> removed = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("planned")).get("removedSettings");
        assertThat(removed).isEmpty();
        Map<String, Object> bodyIndex = (Map<String, Object>)
                ((Map<String, Object>) ((Map<String, Object>) out.get("body")).get("settings")).get("index");
        assertThat(bodyIndex.get("hidden")).isEqualTo("true");
        assertThat(bodyIndex.get("final_pipeline")).isEqualTo("pipe-x");
        assertThat((List<String>) out.get("warnings"))
                .anyMatch(w -> w.contains("未能读取目标集群版本信息"));
    }

    /* ───────── store-type-vendor 全流程 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void storeTypeVendor跨厂商剔除阿里云特有store类型() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/orders/_settings?flat_settings=true",
                ordersBody("settings", map("index.store.type", "hybridfs")));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties", map())));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson());
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, false, null);

        List<Map<String, Object>> removed = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("planned")).get("removedSettings");
        assertThat(removed).hasSize(1);
        assertThat(removed.get(0))
                .containsEntry("key", "index.store.type")
                .containsEntry("rule", "store-type-vendor")
                .containsEntry("reason", "hybridfs 为阿里云特有 store 类型，目标为 oss");
        Map<String, Object> bodySettings = (Map<String, Object>)
                ((Map<String, Object>) out.get("body")).get("settings");
        assertThat(bodySettings).as("唯一的 settings 键被剔除后，计划 PUT 体不带 index.store 节")
                .doesNotContainKey("index");
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 目标厂商未知时storeType不剔_给人工确认建议() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/orders/_settings?flat_settings=true",
                ordersBody("settings", map("index.store.type", "hybridfs")));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties", map())));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        /* 目标 / 探测失败：厂商未知 → 不剔，转人工确认 advice */
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, false, null);

        List<Map<String, Object>> removed = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("planned")).get("removedSettings");
        assertThat(removed).isEmpty();
        Map<String, Object> bodyIndex = (Map<String, Object>)
                ((Map<String, Object>) ((Map<String, Object>) out.get("body")).get("settings")).get("index");
        assertThat(bodyIndex).as("目标厂商未知不剔：store.type 原样保留在计划 PUT 体").containsKey("store");
        List<Map<String, Object>> advice = (List<Map<String, Object>>)
                ((Map<String, Object>) out.get("planned")).get("advice");
        assertThat(advice).anySatisfy(row -> {
            assertThat(row.get("kind")).isEqualTo("store");
            assertThat(String.valueOf(row.get("message"))).contains("人工确认");
        });
    }

    /* ───────── apply=true 落盘 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void apply为true落盘成功_verdict为APPLIED() {
        ScriptedSmart sync = stubSmart();

        Map<String, Object> out = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, true, null);

        assertThat(out.get("verdict")).isEqualTo("APPLIED");
        assertThat(out.get("applied")).isEqualTo(true);
        assertThat(sync.putBodies).hasSize(1);
        assertThat(sync.putBodies.get(0)).contains("\"settings\"");
        assertThat(((Number) out.get("rounds")).intValue()).isEqualTo(1);
        Map<String, Object> reactive = (Map<String, Object>) out.get("reactive");
        assertThat((List<?>) reactive.get("removedSettings")).isEmpty();
        assertThat((List<?>) reactive.get("removedAnalysis")).isEmpty();
        assertThat((List<?>) reactive.get("downgradedFields")).isEmpty();
        assertThat(out).doesNotContainKey("lastError");
    }

    /* ───────── PLAN_DRIFT 拒绝 ───────── */

    @Test
    public void 计划漂移时拒绝落盘_不发PUT() {
        ScriptedSmart sync = stubSmart();
        Map<String, Object> preview = sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, false, null);
        String staleDigest = String.valueOf(preview.get("planDigest"));

        /* 两次调用之间源结构变化：settings 新增一键（模拟漂移） */
        sync.getSource.put("/orders/_settings?flat_settings=true", ordersBody("settings", map(
                "index.number_of_shards", "1",
                "index.apack.knn", "true",
                "index.refresh_interval", "30s")));

        assertThatThrownBy(() -> sync.smartSync("src-1", conn(), "orders", "host", null, null,
                false, null, false, true, staleDigest))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("计划摘要不匹配，拒绝执行")
                .hasMessageContaining(staleDigest)
                .hasMessageContaining("source structure drifted");
        assertThat(sync.putBodies).as("漂移拒绝发生在 PUT 之前").isEmpty();
    }

    /* ───────── 桩与工具 ───────── */

    /** 宿主目标的最小桩：源 aliyun(apack)+ik 引用 → 矩阵剔 apack、剔 ik 组件并降级字段。 */
    private static ScriptedSmart stubSmart() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("6.8.5", "apack"));
        sync.getSource.put("/_nodes/plugins", pluginsJson("analysis-ik", "apack-aliws"));
        sync.getSource.put("/orders/_settings?flat_settings=true", ordersBody("settings", map(
                "index.number_of_shards", "1",
                "index.apack.knn", "true",
                "index.analysis", map("tokenizer", map("my_ik", map("type", "ik_max_word"))))));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties",
                        map("title", map("type", "text", "analyzer", "ik_max_word")))));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-pinyin"));
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
        sync.putStatuses.add(200);
        sync.putErrors.add("");
        return sync;
    }

    /**
     * 路径表桩：源/宿主目标两通道各自按路径回放 JSON；宿主 PUT 与别名写分别记录请求体。
     * 远端 client 为本地假句柄（不触网）——所有请求均被覆写点拦截。
     */
    private static class ScriptedSmart extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final List<Integer> putStatuses = new ArrayList<>();
        final List<String> putErrors = new ArrayList<>();
        final List<String> putBodies = new ArrayList<>();
        final List<String> postAliasBodies = new ArrayList<>();
        private int putCall;

        ScriptedSmart() {
            super(() -> {
                throw new RuntimeException("local-client-must-not-be-touched");
            }, new EsIndexAdmin(null), new RemoteEsClientFactory(1000, 1000) {
                @Override
                public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                    /* 假 client：仅提供 low-level 句柄（sourceGet/targetGet 均已覆写，不会真正触网） */
                    return new org.elasticsearch.client.RestHighLevelClient(
                            RestClient.builder(new HttpHost("127.0.0.1", 1)));
                }
            });
        }

        @Override
        Map<String, Object> sourceGet(RestClient ll, String path) {
            if (path.endsWith("/_alias") && !getSource.containsKey(path)) {
                return jsonMap("{\"orders\":{\"aliases\":{}}}");
            }
            return jsonMap(getSource.get(path));
        }

        @Override
        Map<String, Object> targetGet(String path) {
            return jsonMap(targetGet.get(path));
        }

        @Override
        StructureSyncService.PutResult targetPut(String destIndex, String jsonBody) {
            putBodies.add(jsonBody);
            int idx = Math.min(putCall, putStatuses.size() - 1);
            putCall++;
            return new StructureSyncService.PutResult(putStatuses.get(idx), putErrors.get(idx));
        }

        @Override
        StructureSyncService.PutResult targetPostAliases(String jsonBody) {
            postAliasBodies.add(jsonBody);
            return new StructureSyncService.PutResult(200, "{\"acknowledged\":true}");
        }
    }

    private static RemoteEsClientFactory fakeFactory() {
        return new RemoteEsClientFactory(1000, 1000) {
            @Override
            public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                return new org.elasticsearch.client.RestHighLevelClient(
                        RestClient.builder(new HttpHost("127.0.0.1", 1)));
            }
        };
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

    /** {@code {orders:{section:value}}} 形态的索引级响应（settings/mapping/alias 共用）。 */
    private static String ordersBody(String section, Object value) {
        Map<String, Object> idx = new LinkedHashMap<>();
        idx.put(section, value);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("orders", idx);
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
