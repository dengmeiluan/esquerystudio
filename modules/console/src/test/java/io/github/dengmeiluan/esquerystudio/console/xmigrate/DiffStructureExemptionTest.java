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

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * diff_structure 豁免增强契约：autoTunedShards 非空时 index.number_of_shards 差异
 * （valueChanged/onlyInSource）豁免进 expectedRemovals（reason=autoTune 分片收敛(计划改写)）；
 * removedKeys 命中 onlyInSource 差异豁免（reason=上次同步计划内变更，未命中差异的键忽略）；
 * 两参缺省时行为与既有 4 参形态完全一致。语义：smart_sync 执行后 diff_structure 验证
 * 不再被自己的 autoTune/reactive 计划内变更误报为 unexpected。纯路径表桩，不触真实集群。
 */
public class DiffStructureExemptionTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 未传豁免参：分片差异与源独有键照报 unexpected（既有行为不变）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 未传参时行为与既有形态一致() {
        ScriptedDiff sync = stubDrifted();

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2");

        List<Map<String, Object>> unexpected = (List<Map<String, Object>>) out.get("unexpected");
        assertThat(unexpected).hasSize(2);
        assertThat(unexpected.get(0))
                .containsEntry("area", "settings")
                .containsEntry("key", "index.custom_key");
        assertThat(unexpected.get(1))
                .containsEntry("area", "settings")
                .containsEntry("key", "index.number_of_shards");
        assertThat((List<?>) out.get("expectedRemovals")).isEmpty();
        assertThat(out.get("compatible")).isEqualTo(false);
    }

    /** autoTunedShards 非空：分片差异按计划内豁免，expectedRemovals 记 autoTune 缘由。 */
    @Test
    @SuppressWarnings("unchecked")
    public void autoTunedShards豁免分片差异() {
        ScriptedDiff sync = stubDrifted();

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2",
                3, null);

        List<Map<String, Object>> unexpected = (List<Map<String, Object>>) out.get("unexpected");
        assertThat(unexpected).hasSize(1);
        assertThat(unexpected.get(0)).containsEntry("key", "index.custom_key");
        List<Map<String, Object>> expected = (List<Map<String, Object>>) out.get("expectedRemovals");
        assertThat(expected).hasSize(1);
        assertThat(expected.get(0))
                .containsEntry("area", "settings")
                .containsEntry("key", "index.number_of_shards")
                .containsEntry("reason", "autoTune 分片收敛(计划改写)");
        assertThat(out.get("compatible")).isEqualTo(false);
    }

    /** removedKeys 命中 onlyInSource 差异豁免；与 autoTunedShards 叠加后 unexpected 清零。 */
    @Test
    @SuppressWarnings("unchecked")
    public void removedKeys命中豁免_叠加分片豁免后compatible() {
        ScriptedDiff sync = stubDrifted();

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2",
                3, Arrays.asList("index.custom_key"));

        assertThat((List<?>) out.get("unexpected")).isEmpty();
        assertThat(out.get("compatible")).isEqualTo(true);
        List<Map<String, Object>> expected = (List<Map<String, Object>>) out.get("expectedRemovals");
        assertThat(expected).hasSize(2);
        /* 追加序：onlyInSource 豁免（custom_key）先于 valueChanged 豁免（分片） */
        assertThat(expected.get(0))
                .containsEntry("key", "index.custom_key")
                .containsEntry("reason", "上次同步计划内变更");
        assertThat(expected.get(1))
                .containsEntry("key", "index.number_of_shards")
                .containsEntry("reason", "autoTune 分片收敛(计划改写)");
    }

    /** removedKeys 只豁免 onlyInSource 形态：分片为 valueChanged，仅 removedKeys 不豁免分片。 */
    @Test
    @SuppressWarnings("unchecked")
    public void removedKeys不覆盖valueChanged形态() {
        ScriptedDiff sync = stubDrifted();

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2",
                null, Collections.singletonList("index.custom_key"));

        List<Map<String, Object>> unexpected = (List<Map<String, Object>>) out.get("unexpected");
        assertThat(unexpected).hasSize(1);
        assertThat(unexpected.get(0)).containsEntry("key", "index.number_of_shards");
    }

    /** 未命中任何差异的回传键忽略（差异已消失），不产生空豁免条目。 */
    @Test
    @SuppressWarnings("unchecked")
    public void removedKeys未命中差异时忽略() {
        ScriptedDiff sync = stubDrifted();

        Map<String, Object> out = sync.diffStructure(conn(), "legacy_orders", null, "orders_v2",
                null, Arrays.asList("index.gone", " ", null));

        List<Map<String, Object>> unexpected = (List<Map<String, Object>>) out.get("unexpected");
        assertThat(unexpected).hasSize(2);
        assertThat((List<?>) out.get("expectedRemovals")).isEmpty();
    }

    /* ───────── 桩与工具 ───────── */

    /** 源(分片 12+源独有键) vs 目标(分片 3)：分片 valueChanged、custom_key onlyInSource。 */
    private static ScriptedDiff stubDrifted() {
        ScriptedDiff sync = new ScriptedDiff();
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", "{"
                + "\"legacy_orders\":{\"settings\":{"
                + "\"index.number_of_shards\":\"12\","
                + "\"index.number_of_replicas\":\"1\","
                + "\"index.custom_key\":\"x\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":"
                + "{\"title\":{\"type\":\"text\",\"analyzer\":\"standard\"}}}}}");
        sync.targetGet.put("/orders_v2/_settings?flat_settings=true", "{"
                + "\"orders_v2\":{\"settings\":{"
                + "\"index.number_of_shards\":\"3\","
                + "\"index.number_of_replicas\":\"2\"}}}");
        sync.targetGet.put("/orders_v2/_mapping", "{\"orders_v2\":{\"mappings\":{\"properties\":"
                + "{\"title\":{\"type\":\"text\",\"analyzer\":\"standard\"}}}}}");
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
