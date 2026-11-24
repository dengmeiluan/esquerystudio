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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * verify_equivalence structureOnly 契约：纯结构对比跳过 count/样本/聚合（桩不提供这些响应，
 * 一旦被调用即报「桩缺少响应」——反向锁定零数据请求）；双侧 settings/mappings 剥内部元数据后
 * canonical 化 SHA-256 摘要对比，verdict 三态（EQUIVALENT/DIVERGENT（差异键清单≤20 带 truncated）/
 * INCONCLUSIVE（一侧读取失败如实判））；响应带 structureOnly 回显与两侧摘要。
 * 纯路径表桩，不触真实集群。
 */
public class VerifyEquivalenceStructureTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── EQUIVALENT ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 结构全等判定EQUIVALENT_两侧摘要一致() {
        ScriptedStructure v = stubBothSides(
                "{\"index.number_of_shards\":\"1\",\"index.refresh_interval\":\"30s\"}",
                "{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}",
                "{\"index.number_of_shards\":\"1\",\"index.refresh_interval\":\"30s\"}",
                "{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}");

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, null, null, true);

        assertThat(out.get("structureOnly")).isEqualTo(true);
        assertThat(out.get("verdict")).isEqualTo("EQUIVALENT");
        assertThat(out.get("structuresMatch")).isEqualTo(true);
        Map<String, Object> source = (Map<String, Object>) out.get("source");
        assertThat(source.get("index")).isEqualTo("legacy_orders");
        Map<String, Object> dest = (Map<String, Object>) out.get("dest");
        assertThat(dest.get("index")).isEqualTo("orders_v2");
        assertThat(dest.get("destConnId")).isNull();
        assertThat(String.valueOf(source.get("structureDigest"))).matches("[0-9a-f]{16}");
        assertThat(source.get("structureDigest")).isEqualTo(dest.get("structureDigest"));
        assertThat((List<?>) out.get("differences")).isEmpty();
        assertThat(out.get("truncated")).isEqualTo(false);
        assertThat((List<?>) out.get("warnings")).isEmpty();
    }

    /* ───────── DIVERGENT ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 结构差异判定DIVERGENT_差异键逐项呈报() {
        ScriptedStructure v = stubBothSides(
                "{\"index.number_of_shards\":\"1\",\"index.refresh_interval\":\"30s\"}",
                "{\"properties\":{\"title\":{\"type\":\"text\"},\"remark\":{\"type\":\"text\"}}}",
                "{\"index.number_of_shards\":\"1\",\"index.refresh_interval\":\"1s\"}",
                "{\"properties\":{\"title\":{\"type\":\"keyword\"}}}");

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", "c2", null, "orders_v2",
                null, null, null, null, true);

        assertThat(out.get("verdict")).isEqualTo("DIVERGENT");
        assertThat(out.get("structuresMatch")).isEqualTo(false);
        Map<String, Object> dest = (Map<String, Object>) out.get("dest");
        assertThat(dest.get("destConnId")).isEqualTo("c2");
        assertThat(((Map<String, Object>) out.get("source")).get("structureDigest"))
                .isNotEqualTo(dest.get("structureDigest"));
        assertThat((List<String>) out.get("differences")).containsExactly(
                "settings.index.refresh_interval", "mappings.remark", "mappings.title");
        assertThat(out.get("truncated")).isEqualTo(false);
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 差异超20截断_truncated置真() {
        StringBuilder src = new StringBuilder();
        StringBuilder dst = new StringBuilder();
        for (int i = 1; i <= 25; i++) {
            if (i > 1) {
                src.append(",");
                dst.append(",");
            }
            src.append("\"index.f").append(String.format("%02d", i)).append("\":\"a\"");
            dst.append("\"index.f").append(String.format("%02d", i)).append("\":\"b\"");
        }
        ScriptedStructure v = stubBothSides(
                "{" + src + "}",
                "{\"properties\":{\"title\":{\"type\":\"text\"}}}",
                "{" + dst + "}",
                "{\"properties\":{\"title\":{\"type\":\"text\"}}}");

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, null, null, true);

        assertThat(out.get("verdict")).isEqualTo("DIVERGENT");
        List<String> differences = (List<String>) out.get("differences");
        assertThat(differences).hasSize(20);
        assertThat(differences.get(0)).isEqualTo("settings.index.f01");
        assertThat(differences.get(19)).isEqualTo("settings.index.f20");
        assertThat(out.get("truncated")).isEqualTo(true);
    }

    /* ───────── INCONCLUSIVE ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 目标读取失败判定INCONCLUSIVE_摘要null如实回显() {
        ScriptedStructure v = stubBothSides(
                "{\"index.number_of_shards\":\"1\"}",
                "{\"properties\":{\"title\":{\"type\":\"text\"}}}",
                null,
                "{\"properties\":{\"title\":{\"type\":\"text\"}}}");

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, null, null, true);

        assertThat(out.get("verdict")).isEqualTo("INCONCLUSIVE");
        assertThat(out.get("structuresMatch")).isNull();
        Map<String, Object> source = (Map<String, Object>) out.get("source");
        Map<String, Object> dest = (Map<String, Object>) out.get("dest");
        assertThat(String.valueOf(source.get("structureDigest"))).matches("[0-9a-f]{16}");
        assertThat(dest.get("structureDigest")).as("读取失败侧摘要 null，不冒充等价/分化").isNull();
        List<String> warnings = (List<String>) warningsOf(out);
        assertThat(warnings).anyMatch(w -> w.contains("目标索引结构读取失败") && w.contains("orders_v2"));
    }

    /* ───────── 桩与工具 ───────── */

    /** 双侧 settings/mapping 桩（targetSettings 为 null 表示目标不可读，模拟索引不存在）。 */
    private static ScriptedStructure stubBothSides(String sourceSettings, String sourceMapping,
                                                   String targetSettings, String targetMapping) {
        ScriptedStructure v = new ScriptedStructure();
        v.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":" + sourceSettings + "}}");
        v.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":" + sourceMapping + "}}");
        if (targetSettings != null) {
            v.targetGet.put("/orders_v2/_settings?flat_settings=true",
                    "{\"orders_v2\":{\"settings\":" + targetSettings + "}}");
        }
        v.targetGet.put("/orders_v2/_mapping",
                "{\"orders_v2\":{\"mappings\":" + targetMapping + "}}");
        return v;
    }

    /** 核心桩：只覆写 GET 通道；不提供 _count/_search/_mget 响应——structureOnly 一旦发起数据请求即失败。 */
    private static class ScriptedStructure extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();

        ScriptedStructure() {
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

    private static Object warningsOf(Map<String, Object> out) {
        return out.get("warnings");
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
}
