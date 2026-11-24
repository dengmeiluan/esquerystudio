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
import org.junit.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 集群能力探测契约：厂商推断各档（阿里云/腾讯云/AWS/Elastic Cloud/开源自建/未知）、
 * evidence 判定依据、跨节点插件 id 聚合去重、节点规模读取、子探测失败逐项降级。
 * 2026-11-21 兼容计划批。纯路径表桩，不触真实集群。
 */
public class ProbeCapabilitiesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 路径表探测桩：缺路径抛错（探测侧逐项捕获降级）。 */
    private static StructureSyncService.ClusterGet getterOf(final Map<String, String> responses) {
        return new StructureSyncService.ClusterGet() {
            @Override
            public Map<String, Object> get(String path) throws Exception {
                String raw = responses.get(path);
                if (raw == null) {
                    throw new IllegalStateException("桩缺少响应: " + path);
                }
                return MAPPER.readValue(raw, Map.class);
            }
        };
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> vendor(Map<String, Object> probe) {
        return (Map<String, Object>) probe.get("vendor");
    }

    /* ───────── 厂商推断各档 ───────── */

    @Test
    public void 阿里云档_插件或发行版含aliyun_apack_aliws() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("6.8.5", "default"),
                "/_nodes/plugins", pluginsJson("analysis-ik", "apack-knn"))));
        assertEquals("aliyun", vendor(probe).get("id"));
        assertEquals("阿里云 ES", vendor(probe).get("label"));
        assertTrue("evidence 记录判定依据",
                ((List<?>) vendor(probe).get("evidence")).contains("plugin:apack-knn"));
    }

    @Test
    public void 腾讯云档_qcloud或tc前缀插件() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("7.10.2", "default"),
                "/_nodes/plugins", pluginsJson("tc-logstash"))));
        assertEquals("tencent", vendor(probe).get("id"));
        assertEquals("腾讯云 ES", vendor(probe).get("label"));
    }

    @Test
    public void AWS档_comamazonaws组前缀插件() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("7.10.2", "default"),
                "/_nodes/plugins", pluginsJson("com.amazonaws:ec2-discovery"))));
        assertEquals("aws", vendor(probe).get("id"));
        assertEquals("AWS ES", vendor(probe).get("label"));
        assertTrue("evidence 记录判定依据",
                ((List<?>) vendor(probe).get("evidence")).contains("plugin:com.amazonaws:ec2-discovery"));
    }

    /** 关键字收紧回归：插件 id 仅含 aws/ece 子串、不处 token 边界（前缀/精确/组前缀）时不算云特征。 */
    @Test
    public void 关键字收紧_子串命中不算云特征() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("7.10.2", "default"),
                "/_nodes/plugins", pluginsJson("mapper-forensicsaws", "analysis-ece-extra"))));
        assertEquals("含 aws/ece 子串但非 token 边界形态：判开源自建",
                "oss", vendor(probe).get("id"));
    }

    @Test
    public void ElasticCloud档_ece或elastic_cloud发行版() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("7.17.9", "ece"),
                "/_nodes/plugins", pluginsJson("analysis-ik"))));
        assertEquals("elastic", vendor(probe).get("id"));
        assertEquals("Elastic Cloud", vendor(probe).get("label"));
        assertTrue(((List<?>) vendor(probe).get("evidence")).contains("distribution:ece"));
    }

    @Test
    public void 开源自建档_default发行版且无云特征插件() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("7.10.2", "default"),
                "/_nodes/plugins", pluginsJson("analysis-ik", "analysis-pinyin"))));
        assertEquals("oss", vendor(probe).get("id"));
        assertEquals("开源自建", vendor(probe).get("label"));
        assertTrue(((List<?>) vendor(probe).get("evidence")).contains("distribution:default"));
    }

    @Test
    public void 未知档_非default发行版且无云特征() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("1.0.0", "opendistro"),
                "/_nodes/plugins", pluginsJson("opendistro-security"))));
        assertEquals("unknown", vendor(probe).get("id"));
        assertEquals("未知", vendor(probe).get("label"));
    }

    /* ───────── 插件聚合与节点规模 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 跨节点插件id聚合去重排序() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("7.10.2", "default"),
                "/_nodes/plugins",
                "{\"nodes\":{"
                        + "\"n1\":{\"plugins\":[{\"id\":\"analysis-pinyin\"},{\"id\":\"analysis-ik\"}]},"
                        + "\"n2\":{\"plugins\":[{\"id\":\"analysis-ik\"},{\"id\":\"mapper-murmur3\"}]}"
                        + "}}",
                "/_cluster/health", "{\"number_of_nodes\":2,\"number_of_data_nodes\":2}")));
        List<String> plugins = (List<String>) probe.get("plugins");
        assertEquals("三插件去重后聚合", java.util.Arrays.asList(
                "analysis-ik", "analysis-pinyin", "mapper-murmur3"), plugins);
        assertEquals(Boolean.TRUE, probe.get("pluginsReliable"));
        assertEquals(2, ((Number) probe.get("nodeCount")).intValue());
        assertEquals(2, ((Number) probe.get("dataNodeCount")).intValue());
        assertEquals("cluster-1", probe.get("clusterName"));
    }

    @Test
    public void 子探测失败逐项降级不整体抛出() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(responses(
                "/", versionJson("7.10.2", "default"))));
        assertEquals("7.10.2", probe.get("version"));
        assertTrue(((List<?>) probe.get("plugins")).isEmpty());
        assertEquals("插件探测失败：不可信（矩阵插件规则跳过的依据）",
                Boolean.FALSE, probe.get("pluginsReliable"));
        assertEquals("节点探测失败如实 null", null, probe.get("nodeCount"));
        assertEquals(null, probe.get("dataNodeCount"));
        assertEquals("插件失败不影响厂商按发行版判定", "oss", vendor(probe).get("id"));
    }

    @Test
    public void 根信息整体不可达时全降级() {
        Map<String, Object> probe = StructureSyncService.probeCluster(getterOf(
                new LinkedHashMap<String, String>()));
        assertEquals(null, probe.get("version"));
        assertEquals("unknown", vendor(probe).get("id"));
        assertFalse(Boolean.TRUE.equals(probe.get("pluginsReliable")));
    }

    /* ───────── 工具 ───────── */

    private static Map<String, String> responses(String... pairs) {
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(pairs[i], pairs[i + 1]);
        }
        return out;
    }

    private static String versionJson(String number, String distribution) {
        return "{\"cluster_name\":\"cluster-1\",\"version\":{\"number\":\"" + number
                + "\",\"distribution\":\"" + distribution + "\"}}";
    }

    private static String pluginsJson(String... pluginIds) {
        List<String> parts = new ArrayList<>();
        for (String id : pluginIds) {
            parts.add("{\"id\":\"" + id + "\"}");
        }
        return "{\"nodes\":{\"n1\":{\"plugins\":[" + String.join(",", parts) + "]}}}";
    }
}
