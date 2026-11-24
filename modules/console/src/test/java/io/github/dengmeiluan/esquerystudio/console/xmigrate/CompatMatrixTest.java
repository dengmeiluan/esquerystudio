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
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 主动兼容矩阵的规则契约：每条规则一正一负（命中剔除/建议与不命中不动），
 * 剔除直接改写传入的 settings/mappings（待 PUT 体即剔除后形态）。
 * 2026-11-21 兼容计划批。
 */
public class CompatMatrixTest {

    private static CompatMatrix.TargetSnapshot target(Set<String> plugins, Integer dataNodes,
                                                      Set<String> ilmPolicies) {
        return target(plugins, dataNodes, ilmPolicies, "unknown");
    }

    private static CompatMatrix.TargetSnapshot target(Set<String> plugins, Integer dataNodes,
                                                      Set<String> ilmPolicies, final String vendorId) {
        return new CompatMatrix.TargetSnapshot() {
            @Override
            public String version() {
                return "7.10.2";
            }

            @Override
            public Set<String> plugins() {
                return plugins;
            }

            @Override
            public Integer dataNodeCount() {
                return dataNodes;
            }

            @Override
            public boolean ilmPolicyExists(String policy) {
                return ilmPolicies.contains(policy);
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

    private static String removedSettingKey(CompatMatrix.Planned planned, int idx) {
        return String.valueOf(planned.removedSettings.get(idx).get("key"));
    }

    /* ───────── 规则 1：apack-private ───────── */

    @Test
    public void apack前缀键剔除_理由逐字() {
        Map<String, Object> settings = settings("index.apack.knn", "true",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertEquals(1, planned.removedSettings.size());
        assertEquals("index.apack.knn", removedSettingKey(planned, 0));
        assertEquals("阿里云 apack 私有设置，跨环境不可迁移",
                planned.removedSettings.get(0).get("reason"));
        assertFalse("剔除直接作用于待 PUT 体", settings.containsKey("index.apack.knn"));
        assertTrue(settings.containsKey("index.number_of_shards"));
    }

    @Test
    public void 非apack键不剔除() {
        Map<String, Object> settings = settings("index.apackx.knn", "true");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertTrue(planned.removedSettings.isEmpty());
        assertTrue("前缀必须精确到 index.apack.（点号）", settings.containsKey("index.apackx.knn"));
    }

    /* ───────── 规则 2：ttl-legacy ───────── */

    @Test
    public void ttl前缀键剔除() {
        Map<String, Object> settings = settings("index.ttl.label", "1d");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertEquals("index.ttl.label", removedSettingKey(planned, 0));
        assertEquals("已废弃的 TTL 设置", planned.removedSettings.get(0).get("reason"));
        assertFalse(settings.containsKey("index.ttl.label"));
    }

    @Test
    public void 非ttl键不剔除() {
        Map<String, Object> settings = settings("index.refresh_interval", "1s");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertTrue(planned.removedSettings.isEmpty());
        assertTrue(settings.containsKey("index.refresh_interval"));
    }

    /* ───────── 规则 3：routing-attrs ───────── */

    @Test
    public void 节点属性路由剔除_下划线系统属性保留() {
        Map<String, Object> settings = settings(
                "index.routing.allocation.include.rack", "r1",
                "index.routing.allocation.exclude.zone", "z1",
                "index.routing.allocation.require.tag", "ssd",
                "index.routing.allocation.initial_recovery._id", "node-1",
                "index.routing.allocation.include._tier_preference", "hot",
                "index.routing.allocation.total_shards_per_node", "10");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertEquals("include/exclude/require 三个子域的用户属性各剔一条（initial_recovery 为下划线属性保留）",
                3, planned.removedSettings.size());
        for (Map<String, Object> row : planned.removedSettings) {
            assertEquals("节点属性路由依赖源集群节点标签，跨集群无法匹配，将导致分片不分配",
                    row.get("reason"));
        }
        assertTrue("下划线开头的系统属性不剔（目标集群自解释）",
                settings.containsKey("index.routing.allocation.initial_recovery._id"));
        assertTrue(settings.containsKey("index.routing.allocation.include._tier_preference"));
        assertTrue("total_shards_per_node 非节点属性路由（容量约束），不剔",
                settings.containsKey("index.routing.allocation.total_shards_per_node"));
    }

    @Test
    public void 无路由键时不产生剔除() {
        Map<String, Object> settings = settings("index.number_of_replicas", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertTrue(planned.removedSettings.isEmpty());
    }

    /* ───────── 规则 4：plugin-analysis ───────── */

    @Test
    public void 目标缺插件时剔组件定义并降级字段引用() {
        Map<String, Object> settings = settings(
                "index.number_of_shards", "1",
                "index.analysis", settings(
                        "analyzer", settings("ik_title", settings("type", "custom", "tokenizer", "ik_max_word")),
                        "tokenizer", settings("my_ik", settings("type", "ik_max_word"))));
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"},"
                + "\"body\":{\"type\":\"text\",\"analyzer\":\"ik_title\"}}");
        CompatMatrix.Planned planned = apply(settings, mappings,
                target(new HashSet<>(Arrays.asList("analysis-pinyin")), 2,
                        Collections.<String>emptySet()));

        assertTrue("全部组件被剔后 index.analysis 节整体移除", !settings.containsKey("index.analysis"));
        List<Map<String, Object>> analysis = planned.removedAnalysis;
        assertEquals("组件定义 + 级联 analyzer 各一条", 2, analysis.size());
        assertEquals("目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用",
                analysis.get(0).get("reason"));
        boolean sawCascade = false;
        for (Map<String, Object> row : analysis) {
            if ("analyzer".equals(row.get("kind")) && "ik_title".equals(row.get("name"))) {
                sawCascade = true;
            }
        }
        assertTrue("引用被剔 tokenizer 的自定义 analyzer 一并剔除", sawCascade);
        assertEquals("直接引用与经自定义 analyzer 引用各降级一条", 2, planned.downgradedFields.size());
        for (Map<String, Object> row : planned.downgradedFields) {
            assertEquals("standard", row.get("to"));
            assertNull("矩阵形态不带 attr", row.get("attr"));
        }
        assertTrue("降级直接改写字段定义",
                String.valueOf(((Map<?, ?>) ((Map<?, ?>) mappings.get("properties")).get("title"))
                        .get("analyzer")).equals("standard"));
    }

    @Test
    public void 目标已有对应插件时不剔() {
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("my_ik", settings("type", "ik_max_word"))));
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}");
        CompatMatrix.Planned planned = apply(settings, mappings,
                target(new HashSet<>(Arrays.asList("analysis-ik")), 2, Collections.<String>emptySet()));
        assertTrue(planned.removedAnalysis.isEmpty());
        assertTrue(planned.downgradedFields.isEmpty());
        assertTrue("组件定义保留", settings.containsKey("index.analysis"));
    }

    @Test
    public void 插件清单不可信时整条规则跳过() {
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("my_ik", settings("type", "ik_max_word"))));
        CompatMatrix.Planned planned = CompatMatrix.apply(settings, emptyMappings(),
                new CompatMatrix.TargetSnapshot() {
                    @Override
                    public String version() {
                        return "7.10.2";
                    }

                    @Override
                    public Set<String> plugins() {
                        return Collections.emptySet();
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
                        return false; // _nodes/plugins 探测失败：宁留反应式兜底，不误剔
                    }
                }, null);
        assertTrue(planned.removedAnalysis.isEmpty());
    }

    @Test
    public void 其余插件按包含组件名判覆盖() {
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("my_hanlp", settings("type", "hanlp"))));
        CompatMatrix.Planned hit = apply(settings, emptyMappings(),
                target(new HashSet<>(Arrays.asList("mapper-murmur3")), 2, Collections.<String>emptySet()));
        assertEquals(1, hit.removedAnalysis.size());
        assertEquals("目标集群缺少插件 hanlp，组件 hanlp 不可用",
                hit.removedAnalysis.get(0).get("reason"));

        Map<String, Object> kept = settings(
                "index.analysis", settings("tokenizer", settings("my_hanlp", settings("type", "hanlp"))));
        CompatMatrix.Planned covered = apply(kept, emptyMappings(),
                target(new HashSet<>(Arrays.asList("analysis-hanlp")), 2, Collections.<String>emptySet()));
        assertTrue("插件 id 含组件名即算覆盖", covered.removedAnalysis.isEmpty());
    }

    /* ───────── 规则 5：vendor-private（跨厂商私有 settings） ───────── */

    @Test
    public void 跨厂商时aliyun私有前缀剔除_理由带两侧厂商() {
        Map<String, Object> settings = settings("index.aliyun.cos.replica", "2",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet(), "tencent"));
        assertEquals(1, planned.removedSettings.size());
        assertEquals("index.aliyun.cos.replica", removedSettingKey(planned, 0));
        assertEquals("vendor private setting (aliyun) not supported by target vendor tencent",
                planned.removedSettings.get(0).get("reason"));
        assertFalse(settings.containsKey("index.aliyun.cos.replica"));
        assertTrue(settings.containsKey("index.number_of_shards"));
    }

    @Test
    public void apack前缀键只由apack规则报_不与vendorPrivate重复() {
        Map<String, Object> settings = settings("index.apack.knn", "true");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet(), "tencent"));
        assertEquals("同一键一条 reason（apack-private 先命中，保留更具体文案）",
                1, planned.removedSettings.size());
        assertEquals("阿里云 apack 私有设置，跨环境不可迁移",
                planned.removedSettings.get(0).get("reason"));
    }

    @Test
    public void 目标为键归属厂商时保留厂商私有键() {
        Map<String, Object> settings = settings("index.aliyun.cos.replica", "2");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet(), "aliyun"));
        assertTrue(planned.removedSettings.isEmpty());
        assertTrue("目标厂商=键归属厂商：私有键保留", settings.containsKey("index.aliyun.cos.replica"));
    }

    @Test
    public void qcloud与aws前缀跨厂商剔除_理由带归属厂商() {
        Map<String, Object> settings = settings("index.qcloud.ratio", "1",
                "index.cloud_aws.zone", "a");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet(), "oss"));
        assertEquals(2, planned.removedSettings.size());
        assertEquals("vendor private setting (tencent) not supported by target vendor oss",
                planned.removedSettings.get(0).get("reason"));
        assertEquals("vendor private setting (aws) not supported by target vendor oss",
                planned.removedSettings.get(1).get("reason"));
    }

    /** 目标厂商未知（探测失败）：vendor-private 键不剔（保守，留反应式兜底），逐键告知。 */
    @Test
    public void 目标厂商未知时vendorPrivate不剔并逐键告知() {
        Map<String, Object> settings = settings("index.aliyun.cos.replica", "2",
                "index.number_of_shards", "1");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet())); // vendorId 缺省 unknown
        assertTrue("目标厂商未知不基于猜测剔除", planned.removedSettings.isEmpty());
        assertTrue("键原样保留", settings.containsKey("index.aliyun.cos.replica"));
        assertEquals(java.util.Collections.singletonList(
                        "目标厂商未知，跳过厂商私有设置剔除：index.aliyun.cos.replica"),
                planned.warnings);
    }

    /* ───────── 规则 4 增强：plugin-analysis vendor-aware ───────── */

    @Test
    public void 字段降级理由带目标厂商() {
        Map<String, Object> settings = settings(
                "index.analysis", settings("tokenizer", settings("my_pinyin", settings("type", "pinyin"))));
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"pinyin\"}}");
        CompatMatrix.Planned planned = apply(settings, mappings,
                target(new HashSet<>(Arrays.asList("analysis-ik")), 2,
                        Collections.<String>emptySet(), "tencent"));
        assertEquals(1, planned.downgradedFields.size());
        assertEquals("target vendor tencent lacks plugin analysis-pinyin; analyzer pinyin -> standard",
                planned.downgradedFields.get(0).get("reason"));
        assertEquals("组件定义剔除理由保持中文原由（与浏览器端文案一致）",
                "目标集群缺少插件 analysis-pinyin，组件 pinyin 不可用",
                planned.removedAnalysis.get(0).get("reason"));
    }

    @Test
    public void 目标厂商未知时降级理由不带厂商段() {
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}");
        CompatMatrix.Planned planned = apply(new LinkedHashMap<String, Object>(), mappings,
                target(new HashSet<>(Arrays.asList("analysis-pinyin")), 2,
                        Collections.<String>emptySet()));
        assertEquals("目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用",
                planned.downgradedFields.get(0).get("reason"));
    }

    @Test
    public void 跨厂商且组件降级时追加pluginInstall建议() {
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}");
        CompatMatrix.Planned planned = CompatMatrix.apply(new LinkedHashMap<String, Object>(), mappings,
                target(new HashSet<>(Arrays.asList("analysis-pinyin")), 2,
                        Collections.<String>emptySet(), "tencent"),
                null, "aliyun");
        assertEquals(1, planned.advice.size());
        assertEquals("plugin_install", planned.advice.get(0).get("kind"));
        assertEquals("analysis-ik", planned.advice.get(0).get("key"));
        assertEquals("target vendor tencent lacks plugin analysis-ik; "
                        + "install it on target or accept standard fallback",
                planned.advice.get(0).get("message"));
    }

    @Test
    public void 同厂商不追加pluginInstall建议() {
        Map<String, Object> mappings = mappings("{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}");
        CompatMatrix.Planned planned = CompatMatrix.apply(new LinkedHashMap<String, Object>(), mappings,
                target(new HashSet<>(Arrays.asList("analysis-pinyin")), 2,
                        Collections.<String>emptySet(), "aliyun"),
                null, "aliyun");
        assertTrue("厂商未变更：只有降级事实、无 install 建议", planned.advice.isEmpty());
        assertEquals("降级照常发生", 1, planned.downgradedFields.size());
    }

    @Test
    public void 源索引未引用缺失组件时不追加pluginInstall建议() {
        CompatMatrix.Planned planned = CompatMatrix.apply(new LinkedHashMap<String, Object>(),
                emptyMappings(),
                target(new HashSet<>(Arrays.asList("analysis-pinyin")), 2,
                        Collections.<String>emptySet(), "tencent"),
                null, "aliyun");
        assertTrue("目标缺 ik 但源索引未引用：无剔除/降级事实即无建议", planned.advice.isEmpty());
    }

    /* ───────── 规则 6：ilm-missing ───────── */

    @Test
    public void 目标缺失ILM策略时剔除并给出策略名() {
        Map<String, Object> settings = settings("index.lifecycle.name", "hot-7d");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertEquals(1, planned.removedSettings.size());
        assertEquals("index.lifecycle.name", removedSettingKey(planned, 0));
        assertEquals("目标集群不存在 ILM 策略 hot-7d",
                planned.removedSettings.get(0).get("reason"));
        assertFalse(settings.containsKey("index.lifecycle.name"));
    }

    @Test
    public void 目标存在同名ILM策略时保留() {
        Map<String, Object> settings = settings("index.lifecycle.name", "hot-7d");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, new HashSet<>(Arrays.asList("hot-7d"))));
        assertTrue(planned.removedSettings.isEmpty());
        assertTrue(settings.containsKey("index.lifecycle.name"));
    }

    /* ───────── 规则 6：shards-advise ───────── */

    @Test
    public void 分片数超3倍数据节点给advice_文案带数值() {
        Map<String, Object> settings = settings("index.number_of_shards", "12");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertEquals(1, planned.advice.size());
        assertEquals("shards", planned.advice.get(0).get("kind"));
        assertEquals("index.number_of_shards", planned.advice.get(0).get("key"));
        assertEquals("目标数据节点 2 个，源分片 12 片过碎，建议 ≤ 6",
                planned.advice.get(0).get("message"));
        assertTrue("advice 不动 settings（只建议）", settings.containsKey("index.number_of_shards"));
    }

    @Test
    public void 分片数未超阈值或数据节点未知时不给advice() {
        Map<String, Object> ok = settings("index.number_of_shards", "6");
        assertTrue(apply(ok, emptyMappings(), target(fullPlugins(), 2, Collections.<String>emptySet()))
                .advice.isEmpty());
        Map<String, Object> unknownNodes = settings("index.number_of_shards", "100");
        assertTrue(apply(unknownNodes, emptyMappings(), target(fullPlugins(), null, Collections.<String>emptySet()))
                .advice.isEmpty());
    }

    /* ───────── 规则 7：auto-replicas ───────── */

    @Test
    public void auto_expand_replicas给replicas建议() {
        Map<String, Object> settings = settings("index.auto_expand_replicas", "0-all");
        CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                target(fullPlugins(), 2, Collections.<String>emptySet()));
        assertEquals(1, planned.advice.size());
        assertEquals("replicas", planned.advice.get(0).get("kind"));
        assertEquals("auto_expand_replicas 跨集群可能失控（如 0-all），建议显式副本数",
                planned.advice.get(0).get("message"));
        assertTrue("advice 不剔除该键", settings.containsKey("index.auto_expand_replicas"));
    }

    @Test
    public void 显式副本数无replicas建议() {
        Map<String, Object> settings = settings("index.number_of_replicas", "2");
        assertTrue(apply(settings, emptyMappings(), target(fullPlugins(), 2, Collections.<String>emptySet()))
                .advice.isEmpty());
    }

    /* ───────── 规则 8：store-advise ───────── */

    @Test
    public void niofs与simplefs给store建议() {
        for (String storeType : Arrays.asList("niofs", "simplefs")) {
            Map<String, Object> settings = settings("index.store.type", storeType);
            CompatMatrix.Planned planned = apply(settings, emptyMappings(),
                    target(fullPlugins(), 2, Collections.<String>emptySet()));
            assertEquals(1, planned.advice.size());
            assertEquals("store", planned.advice.get(0).get("kind"));
            assertEquals("目标默认存储类型更稳妥，建议移除显式 store.type",
                    planned.advice.get(0).get("message"));
        }
    }

    @Test
    public void 默认存储类型无store建议() {
        Map<String, Object> settings = settings("index.store.type", "default");
        assertTrue(apply(settings, emptyMappings(), target(fullPlugins(), 2, Collections.<String>emptySet()))
                .advice.isEmpty());
    }

    /* ───────── 工具 ───────── */

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
