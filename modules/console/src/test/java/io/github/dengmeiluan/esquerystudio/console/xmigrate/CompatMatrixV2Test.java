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
 * 兼容矩阵新批规则契约：version-floor（目标版本低于设置引入地板即剔；目标版本未知/相等/
 * 高于均不剔）与 store-type-vendor（首个值级规则：厂商特有 store 类型跨厂商剔除；目标厂商
 * 未知不剔、转人工确认 advice；目标为归属厂商保留）。另覆盖 planned 清单的规则溯源
 * （rule 字段新增，key/reason 等旧字段原样保留）。
 */
public class CompatMatrixV2Test {

    private static CompatMatrix.TargetSnapshot target(final String version, final String vendorId) {
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
            public boolean pluginsReliable() {
                return true;
            }

            @Override
            public String vendorId() {
                return vendorId;
            }
        };
    }

    /* ───────── 规则 7：version-floor ───────── */

    @Test
    public void 目标版本低于地板剔除_理由带两侧版本() {
        Map<String, Object> settings = settings("index.hidden", "true",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.6.0", "oss"));
        assertThat(planned.removedSettings).hasSize(1);
        assertThat(planned.removedSettings.get(0))
                .containsEntry("key", "index.hidden")
                .containsEntry("rule", "version-floor")
                .containsEntry("reason", "目标 7.6.0 低于该设置最低版本 7.7.0");
        assertThat(settings).doesNotContainKey("index.hidden").containsKey("index.number_of_shards");
    }

    @Test
    public void 地板相等与高于地板均不剔() {
        Map<String, Object> equalFloor = settings("index.hidden", "true");
        assertThat(apply(equalFloor, emptyMappings(), target("7.7.0", "oss")).removedSettings)
                .as("7.7.0 = index.hidden 地板 7.7.0：相等不剔").isEmpty();
        assertThat(equalFloor).containsKey("index.hidden");

        Map<String, Object> aboveFloor = settings("index.final_pipeline", "pipe-x");
        assertThat(apply(aboveFloor, emptyMappings(), target("7.12.0", "oss")).removedSettings)
                .as("7.12.0 = index.final_pipeline 地板 7.12.0：相等不剔").isEmpty();

        Map<String, Object> newer = settings("index.final_pipeline", "pipe-x");
        assertThat(apply(newer, emptyMappings(), target("8.0.0", "oss")).removedSettings)
                .as("高于地板不剔").isEmpty();

        Map<String, Object> idleFloor = settings("index.search.idle.after", "30s");
        assertThat(apply(idleFloor, emptyMappings(), target("7.0.0", "oss")).removedSettings)
                .as("7.0.0 = index.search.idle.after 地板 7.0.0：相等不剔").isEmpty();
        assertThat(idleFloor).containsKey("index.search.idle.after");
    }

    @Test
    public void 目标版本未知或不可解析不剔() {
        Map<String, Object> unknown = settings("index.final_pipeline", "pipe-x",
                "index.hidden", "true");
        assertThat(apply(unknown, emptyMappings(), target(null, "oss")).removedSettings)
                .as("目标版本未知（探测失败）：保守不剔").isEmpty();
        assertThat(unknown).containsKeys("index.final_pipeline", "index.hidden");

        Map<String, Object> unparsable = settings("index.hidden", "true");
        assertThat(apply(unparsable, emptyMappings(), target("7.x", "oss")).removedSettings)
                .as("版本形态解析不了按未知处理：不剔").isEmpty();
        assertThat(unparsable).containsKey("index.hidden");
    }

    /* ───────── 规则 8：store-type-vendor（值级） ───────── */

    @Test
    public void hybridfs跨厂商剔除_理由带归属厂商与目标厂商() {
        Map<String, Object> settings = settings("index.store.type", "hybridfs",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.10.2", "aws"));
        assertThat(planned.removedSettings).hasSize(1);
        assertThat(planned.removedSettings.get(0))
                .containsEntry("key", "index.store.type")
                .containsEntry("rule", "store-type-vendor")
                .containsEntry("reason", "hybridfs 为阿里云特有 store 类型，目标为 aws");
        assertThat(settings).doesNotContainKey("index.store.type").containsKey("index.number_of_shards");
    }

    @Test
    public void 目标为值归属厂商时保留() {
        Map<String, Object> settings = settings("index.store.type", "hybridfs");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.10.2", "aliyun"));
        assertThat(planned.removedSettings).isEmpty();
        assertThat(settings).as("目标厂商=值归属厂商（aliyun）：hybridfs 保留")
                .containsKey("index.store.type");
        assertThat(planned.advice).isEmpty();
    }

    @Test
    public void 目标厂商未知不剔_给人工确认advice() {
        Map<String, Object> settings = settings("index.store.type", "hybridfs");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.10.2", "unknown"));
        assertThat(planned.removedSettings).as("目标厂商未知不基于猜测剔除").isEmpty();
        assertThat(settings).containsKey("index.store.type");
        assertThat(planned.advice).hasSize(1);
        assertThat(planned.advice.get(0))
                .containsEntry("kind", "store")
                .containsEntry("key", "index.store.type");
        assertThat(String.valueOf(planned.advice.get(0).get("message"))).contains("人工确认");
    }

    @Test
    public void 非厂商特有store值不受该规则影响() {
        Map<String, Object> settings = settings("index.store.type", "default",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(), target("7.10.2", "aws"));
        assertThat(planned.removedSettings).isEmpty();
        assertThat(planned.advice).isEmpty();
        assertThat(settings).containsKey("index.store.type");
    }

    /* ───────── planned 清单规则溯源（新字段 rule，旧字段保留） ───────── */

    @Test
    public void pluginAnalysis剔除与降级条目带rule溯源_旧字段保留() {
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("my_ik", settings("type", "ik_max_word"))));
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}");
        /* 目标缺 analysis-ik（只有 pinyin）：组件定义剔除 + 字段引用降级 */
        CompatMatrix.Planned planned = apply(settings, mappings,
                new CompatMatrix.TargetSnapshot() {
                    @Override
                    public String version() {
                        return "7.10.2";
                    }

                    @Override
                    public Set<String> plugins() {
                        return new HashSet<>(Arrays.asList("analysis-pinyin"));
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
                });

        assertThat(planned.removedAnalysis).hasSize(1);
        assertThat(planned.removedAnalysis.get(0))
                .containsEntry("kind", "tokenizer")
                .containsEntry("name", "my_ik")
                .containsEntry("rule", "plugin-analysis")
                .containsKey("reason");
        assertThat(planned.downgradedFields).hasSize(1);
        assertThat(planned.downgradedFields.get(0))
                .containsEntry("field", "title")
                .containsEntry("from", "ik_max_word")
                .containsEntry("to", "standard")
                .containsEntry("rule", "plugin-analysis")
                .containsKey("reason");
    }

    /* ───────── 工具 ───────── */

    private static CompatMatrix.Planned apply(Map<String, Object> settings, Map<String, Object> mappings,
                                              CompatMatrix.TargetSnapshot target) {
        return CompatMatrix.apply(settings, mappings, target, null);
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

    /** 覆盖全部插件组件的清单（负例基线：任何组件都可用）。 */
    private static Set<String> fullPlugins() {
        return new HashSet<>(Arrays.asList("analysis-ik", "analysis-pinyin", "analysis-stconvert",
                "analysis-smartcn", "analysis-hanlp", "aliws", "thulac", "ansj"));
    }
}
