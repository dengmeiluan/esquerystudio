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

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 兼容矩阵扩表规则契约（每规则至少一正一反）：version-floor 新增键与前缀族
 * （index.soft_deletes.enabled/index.default_pipeline 6.5.0、index.number_of_routing_shards 6.1.0、
 * index.write.wait_for_active_shards 7.7.0、index.sort. 前缀 6.0.0、index.xpack. 前缀 6.5.0；
 * 目标版本未知保守不剔）、vendor-private 补 aws/OpenSearch 系前缀（index.knn./index.remote_store.）、
 * codec-vendor 值级规则（zstd/zstd_no_dict 为 OpenSearch 特有，目标厂商未知不剔转人工确认 advice）、
 * pipeline-missing 探针规则（index.final_pipeline/index.default_pipeline 引用的 ingest pipeline
 * 目标缺失即剔，探测异常保守不剔）、腾讯云 analysis-qq 组件（qq_smart/qq_max 族固定映射）、
 * mapping 上限 advice（total_fields>1000/nested_fields>50 只建议不动）。
 */
public class CompatMatrixV3Test {

    private static CompatMatrix.TargetSnapshot target(final String version, final String vendorId) {
        return target(version, vendorId, true);
    }

    /** pipeline 存在性可注入的快照形态。 */
    private static CompatMatrix.TargetSnapshot target(final String version, final String vendorId,
                                                      final boolean pipelineExists) {
        return new CompatMatrix.TargetSnapshot() {
            @Override
            public String version() {
                return version;
            }

            @Override
            public Set<String> plugins() {
                return fullPlugins();
            }

            @Override
            public Integer dataNodeCount() {
                return 2;
            }

            @Override
            public boolean ilmPolicyExists(String policy) {
                return true;
            }

            @Override
            public boolean ingestPipelineExists(String pipeline) {
                return pipelineExists;
            }

            @Override
            public boolean pluginsReliable() {
                return true;
            }

            @Override
            public String vendorId() {
                return vendorId;
            }
        };
    }

    /* ───────── version-floor 扩表：新增精确键 ───────── */

    @Test
    public void softDeletes与defaultPipeline低于6_5_0剔除() {
        Map<String, Object> settings = settings(
                "index.soft_deletes.enabled", "true",
                "index.default_pipeline", "pipe-x",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("6.4.2", "oss"));
        assertThat(planned.removedSettings).hasSize(2);
        assertThat(planned.removedSettings).allSatisfy(
                row -> assertThat(row).containsEntry("rule", "version-floor"));
        assertThat(planned.removedSettings.get(0))
                .containsEntry("key", "index.soft_deletes.enabled")
                .containsEntry("reason", "目标 6.4.2 低于该设置最低版本 6.5.0");
        assertThat(planned.removedSettings.get(1))
                .containsEntry("key", "index.default_pipeline");
        assertThat(settings).containsOnlyKeys("index.number_of_shards");
    }

    @Test
    public void 等于6_5_0地板时softDeletes保留() {
        Map<String, Object> settings = settings(
                "index.soft_deletes.enabled", "true",
                "index.default_pipeline", "pipe-x");
        assertThat(apply(settings, emptyMappings(), target("6.5.0", "oss")).removedSettings).isEmpty();
        assertThat(settings).containsKeys("index.soft_deletes.enabled", "index.default_pipeline");
    }

    @Test
    public void routingShards低于6_1_0剔除_等于保留() {
        Map<String, Object> below = settings("index.number_of_routing_shards", "24");
        CompatMatrix.Planned planned = apply(below, emptyMappings(), target("6.0.0", "oss"));
        assertThat(planned.removedSettings).hasSize(1);
        assertThat(planned.removedSettings.get(0))
                .containsEntry("key", "index.number_of_routing_shards")
                .containsEntry("reason", "目标 6.0.0 低于该设置最低版本 6.1.0");

        Map<String, Object> equal = settings("index.number_of_routing_shards", "24");
        assertThat(apply(equal, emptyMappings(), target("6.1.0", "oss")).removedSettings).isEmpty();
        assertThat(equal).containsKey("index.number_of_routing_shards");
    }

    @Test
    public void writeWaitForActiveShards低于7_7_0剔除_等于保留() {
        Map<String, Object> below = settings("index.write.wait_for_active_shards", "1");
        CompatMatrix.Planned planned = apply(below, emptyMappings(), target("7.6.2", "oss"));
        assertThat(planned.removedSettings).hasSize(1);
        assertThat(planned.removedSettings.get(0))
                .containsEntry("key", "index.write.wait_for_active_shards")
                .containsEntry("reason", "目标 7.6.2 低于该设置最低版本 7.7.0");

        Map<String, Object> equal = settings("index.write.wait_for_active_shards", "1");
        assertThat(apply(equal, emptyMappings(), target("7.7.0", "oss")).removedSettings).isEmpty();
        assertThat(equal).containsKey("index.write.wait_for_active_shards");
    }

    /* ───────── version-floor 扩表：前缀族 ───────── */

    @Test
    public void sort前缀族子键低于6_0_0整族剔除() {
        Map<String, Object> settings = settings(
                "index.sort.field", "timestamp",
                "index.sort.order", "desc",
                "index.sortx.field", "timestamp");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("5.6.16", "oss"));
        assertThat(planned.removedSettings).hasSize(2);
        assertThat(planned.removedSettings).allSatisfy(row -> {
            assertThat(row).containsEntry("rule", "version-floor");
            assertThat(String.valueOf(row.get("key"))).startsWith("index.sort.");
        });
        assertThat(settings).as("前缀必须精确到 index.sort.（点号），index.sortx. 不受影响")
                .containsOnlyKeys("index.sortx.field");
    }

    @Test
    public void sort前缀族等于6_0_0保留() {
        Map<String, Object> settings = settings("index.sort.field", "timestamp");
        assertThat(apply(settings, emptyMappings(), target("6.0.0", "oss")).removedSettings).isEmpty();
        assertThat(settings).containsKey("index.sort.field");
    }

    @Test
    public void xpack内部前缀族低于6_5_0整族剔除() {
        Map<String, Object> settings = settings(
                "index.xpack.ccr.following_index", "false",
                "index.xpack.version", "");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("6.4.0", "oss"));
        assertThat(planned.removedSettings).hasSize(2);
        assertThat(planned.removedSettings).allSatisfy(
                row -> assertThat(String.valueOf(row.get("key"))).startsWith("index.xpack."));
        assertThat(settings).isEmpty();
    }

    @Test
    public void 新增键在目标版本未知时保守不剔() {
        Map<String, Object> settings = settings(
                "index.soft_deletes.enabled", "true",
                "index.number_of_routing_shards", "24",
                "index.sort.field", "timestamp",
                "index.write.wait_for_active_shards", "1",
                "index.xpack.version", "");
        assertThat(apply(settings, emptyMappings(), target(null, "oss")).removedSettings)
                .as("目标版本未知（探测失败）：保守不剔，留反应式兜底").isEmpty();
        assertThat(settings).hasSize(5);

        Map<String, Object> unparsable = settings("index.sort.field", "timestamp");
        assertThat(apply(unparsable, emptyMappings(), target("7.x", "oss")).removedSettings)
                .as("版本形态解析不了按未知处理：不剔").isEmpty();
    }

    /* ───────── vendor-private 扩表：aws/OpenSearch 系前缀 ───────── */

    @Test
    public void knn与remoteStore前缀跨厂商剔除_理由带归属厂商() {
        Map<String, Object> settings = settings(
                "index.knn", "true",
                "index.knn.algo_param.ef_search", "128",
                "index.remote_store.repository", "my-repo",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.10.2", "oss"));
        assertThat(planned.removedSettings).hasSize(3);
        assertThat(planned.removedSettings).allSatisfy(
                row -> assertThat(String.valueOf(row.get("reason")))
                        .isEqualTo("vendor private setting (aws) not supported by target vendor oss"));
        assertThat(settings).containsOnlyKeys("index.number_of_shards");
    }

    @Test
    public void 目标为aws时OpenSearch前缀保留_未知厂商不剔() {
        Map<String, Object> awsTarget = settings("index.knn", "true",
                "index.remote_store.repository", "my-repo");
        assertThat(apply(awsTarget, emptyMappings(), target("7.10.2", "aws")).removedSettings).isEmpty();
        assertThat(awsTarget).containsKeys("index.knn", "index.remote_store.repository");

        Map<String, Object> unknownVendor = settings("index.knn", "true");
        CompatMatrix.Planned planned = apply(unknownVendor, emptyMappings(), target("7.10.2", "unknown"));
        assertThat(planned.removedSettings).as("目标厂商未知不基于猜测剔除").isEmpty();
        assertThat(planned.warnings).containsExactly(
                "目标厂商未知，跳过厂商私有设置剔除：index.knn");
    }

    /* ───────── codec-vendor（值级新表） ───────── */

    @Test
    public void zstd跨厂商剔除_理由带归属与目标厂商() {
        Map<String, Object> settings = settings("index.codec", "zstd",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.10.2", "tencent"));
        assertThat(planned.removedSettings).hasSize(1);
        assertThat(planned.removedSettings.get(0))
                .containsEntry("key", "index.codec")
                .containsEntry("rule", "codec-vendor")
                .containsEntry("reason", "zstd 为AWS（OpenSearch）特有压缩编码，目标为 tencent");
        assertThat(settings).doesNotContainKey("index.codec").containsKey("index.number_of_shards");

        Map<String, Object> noDict = settings("index.codec", "zstd_no_dict");
        assertThat(apply(noDict, emptyMappings(), target("7.10.2", "elastic")).removedSettings)
                .as("zstd_no_dict 同为 OpenSearch 特有值").hasSize(1);
    }

    @Test
    public void 目标为值归属厂商时zstd保留_通用codec值不剔() {
        Map<String, Object> awsTarget = settings("index.codec", "zstd");
        CompatMatrix.Planned planned = apply(awsTarget, emptyMappings(), target("2.11.0", "aws"));
        assertThat(planned.removedSettings).isEmpty();
        assertThat(planned.advice).isEmpty();
        assertThat(awsTarget).containsKey("index.codec");

        Map<String, Object> common = settings("index.codec", "best_compression",
                "index.store.type", "default");
        assertThat(apply(common, emptyMappings(), target("7.10.2", "tencent")).removedSettings)
                .as("best_compression/default 为通用值不剔").isEmpty();
    }

    @Test
    public void 目标厂商未知时zstd不剔_给人工确认advice() {
        Map<String, Object> settings = settings("index.codec", "zstd");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.10.2", "unknown"));
        assertThat(planned.removedSettings).isEmpty();
        assertThat(settings).containsKey("index.codec");
        assertThat(planned.advice).hasSize(1);
        assertThat(planned.advice.get(0))
                .containsEntry("kind", "codec")
                .containsEntry("key", "index.codec");
        assertThat(String.valueOf(planned.advice.get(0).get("message"))).contains("人工确认");
    }

    /* ───────── pipeline-missing（探针规则） ───────── */

    @Test
    public void 目标缺失ingestPipeline时剔除default与finalPipeline() {
        Map<String, Object> settings = settings(
                "index.default_pipeline", "pipe-enrich",
                "index.final_pipeline", "pipe-audit",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target("7.12.0", "oss", false));
        assertThat(planned.removedSettings).hasSize(2);
        assertThat(planned.removedSettings).allSatisfy(
                row -> assertThat(row).containsEntry("rule", "pipeline-missing"));
        assertThat(planned.removedSettings.get(0))
                .containsEntry("key", "index.default_pipeline")
                .containsEntry("reason", "目标缺少 ingest pipeline pipe-enrich");
        assertThat(planned.removedSettings.get(1))
                .containsEntry("key", "index.final_pipeline")
                .containsEntry("reason", "目标缺少 ingest pipeline pipe-audit");
        assertThat(settings).containsOnlyKeys("index.number_of_shards");
    }

    @Test
    public void pipeline存在时保留_探针优先于版本地板() {
        Map<String, Object> exists = settings("index.final_pipeline", "pipe-x");
        assertThat(apply(exists, emptyMappings(), target("7.12.0", "oss", true)).removedSettings)
                .as("探针返回存在：不剔").isEmpty();
        assertThat(exists).containsKey("index.final_pipeline");

        /* 目标 7.6.0 且 pipeline 缺失：探针规则先命中（更具体理由），不再重复走版本地板 */
        Map<String, Object> both = settings("index.final_pipeline", "pipe-x");
        CompatMatrix.Planned planned = apply(both, emptyMappings(), target("7.6.0", "oss", false));
        assertThat(planned.removedSettings).hasSize(1);
        assertThat(planned.removedSettings.get(0))
                .containsEntry("rule", "pipeline-missing")
                .containsEntry("reason", "目标缺少 ingest pipeline pipe-x");
    }

    @Test
    public void 空值与其它键不受pipeline规则影响() {
        Map<String, Object> settings = settings(
                "index.default_pipeline", "  ",
                "index.refresh_interval", "30s");
        assertThat(apply(settings, emptyMappings(), target("7.12.0", "oss", false)).removedSettings)
                .as("空白值视为未引用 pipeline：不剔").isEmpty();
        assertThat(settings).hasSize(2);
    }

    /* ───────── PLUGIN_COMPONENTS/COMPONENT_PLUGIN 补齐 ───────── */

    @Test
    public void 腾讯云qq分词组件缺失时剔定义并降级字段() {
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("my_qq", settings("type", "qq_smart"))));
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"qq_smart\"}}");
        CompatMatrix.Planned planned = applyWithPlugins(settings, mappings,
                plugins("analysis-ik"), "oss", "tencent");

        assertThat(planned.removedAnalysis).hasSize(1);
        assertThat(planned.removedAnalysis.get(0))
                .containsEntry("kind", "tokenizer")
                .containsEntry("name", "my_qq")
                .containsEntry("reason", "目标集群缺少插件 analysis-qq，组件 qq_smart 不可用");
        assertThat(planned.downgradedFields).hasSize(1);
        assertThat(planned.downgradedFields.get(0))
                .containsEntry("field", "title")
                .containsEntry("from", "qq_smart")
                .containsEntry("to", "standard");
        assertThat(((Map<?, ?>) ((Map<?, ?>) mappings.get("properties")).get("title")).get("analyzer"))
                .isEqualTo("standard");
    }

    @Test
    public void 目标装有analysis_qq时qq组件保留() {
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("my_qq", settings("type", "qq_max"))));
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"qq_max\"}}");
        CompatMatrix.Planned planned = applyWithPlugins(settings, mappings,
                plugins("analysis-qq"), "tencent", "tencent");
        assertThat(planned.removedAnalysis).isEmpty();
        assertThat(planned.downgradedFields).isEmpty();
        assertThat(settings).containsKey("index.analysis");
        assertThat(((Map<?, ?>) ((Map<?, ?>) mappings.get("properties")).get("title")).get("analyzer"))
                .isEqualTo("qq_max");
    }

    @Test
    public void 固定映射为增量补充_历史插件id仍按包含命中() {
        assertThat(CompatMatrix.coversKnownComponent("apack-aliws"))
                .as("apack-aliws 覆盖 aliws 组件（包含启发保留）").isTrue();
        assertThat(CompatMatrix.coversKnownComponent("analysis-qq"))
                .as("analysis-qq 为矩阵已知插件（固定映射新增）").isTrue();
        assertThat(CompatMatrix.coversKnownComponent("mapper-murmur3")).isFalse();

        /* 插件 id 恰为组件名（thulac）：固定映射 analysis-thulac 之外仍按包含命中 */
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("t", settings("type", "thulac"))));
        CompatMatrix.Planned kept = applyWithPlugins(settings, emptyMappings(),
                plugins("thulac"), "oss", "oss");
        assertThat(kept.removedAnalysis).isEmpty();
    }

    /* ───────── mapping 上限 advice ───────── */

    @Test
    public void totalFields超1000给advice_等于或低于不给() {
        Map<String, Object> over = settings("index.mapping.total_fields.limit", "5000");
        CompatMatrix.Planned planned = apply(over, emptyMappings(), target("7.10.2", "oss"));
        assertThat(planned.advice).hasSize(1);
        assertThat(planned.advice.get(0))
                .containsEntry("kind", "mapping_limit")
                .containsEntry("key", "index.mapping.total_fields.limit")
                .containsEntry("message",
                        "源值 5000 超过目标默认上限 1000，目标默认上限较低，超限可能建索引失败");
        assertThat(over).as("只建议不动数据").containsKey("index.mapping.total_fields.limit");

        Map<String, Object> boundary = settings("index.mapping.total_fields.limit", "1000");
        assertThat(apply(boundary, emptyMappings(), target("7.10.2", "oss")).advice)
                .as("等于默认上限不告警").isEmpty();
    }

    @Test
    public void nestedFields超50给advice_等于或低于不给() {
        Map<String, Object> over = settings("index.mapping.nested_fields.limit", "100");
        CompatMatrix.Planned planned = apply(over, emptyMappings(), target("7.10.2", "oss"));
        assertThat(planned.advice).hasSize(1);
        assertThat(planned.advice.get(0))
                .containsEntry("kind", "mapping_limit")
                .containsEntry("key", "index.mapping.nested_fields.limit")
                .containsEntry("message",
                        "源值 100 超过目标默认上限 50，目标默认上限较低，超限可能建索引失败");

        Map<String, Object> boundary = settings("index.mapping.nested_fields.limit", "50");
        assertThat(apply(boundary, emptyMappings(), target("7.10.2", "oss")).advice).isEmpty();
    }

    /* ───────── 工具 ───────── */

    private static CompatMatrix.Planned apply(Map<String, Object> settings, Map<String, Object> mappings,
                                              CompatMatrix.TargetSnapshot target) {
        return CompatMatrix.apply(settings, mappings, target, null);
    }

    /** 指定目标插件清单与双侧厂商的 apply（qq/thulac 组件用例）。 */
    private static CompatMatrix.Planned applyWithPlugins(Map<String, Object> settings,
                                                         Map<String, Object> mappings,
                                                         Set<String> targetPlugins,
                                                         String targetVendor, String sourceVendor) {
        return CompatMatrix.apply(settings, mappings, new CompatMatrix.TargetSnapshot() {
            @Override
            public String version() {
                return "7.10.2";
            }

            @Override
            public Set<String> plugins() {
                return targetPlugins;
            }

            @Override
            public Integer dataNodeCount() {
                return 2;
            }

            @Override
            public boolean ilmPolicyExists(String policy) {
                return true;
            }

            @Override
            public boolean pluginsReliable() {
                return true;
            }

            @Override
            public String vendorId() {
                return targetVendor;
            }
        }, null, sourceVendor);
    }

    private static Set<String> plugins(String... ids) {
        return new HashSet<>(Arrays.asList(ids));
    }

    private static Map<String, Object> settings(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }

    private static Map<String, Object> mappings(String fieldsJson) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            out.put("properties", new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(fieldsJson, Map.class));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        return out;
    }

    private static Map<String, Object> emptyMappings() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("properties", new LinkedHashMap<String, Object>());
        return out;
    }

    /** 覆盖全部插件组件的清单（负例基线：任何组件都可用；qq 组件按固定映射需要 analysis-qq）。 */
    private static Set<String> fullPlugins() {
        return new HashSet<>(Arrays.asList("analysis-ik", "analysis-pinyin", "analysis-stconvert",
                "analysis-smartcn", "analysis-hanlp", "aliws", "thulac", "ansj", "analysis-qq"));
    }
}
