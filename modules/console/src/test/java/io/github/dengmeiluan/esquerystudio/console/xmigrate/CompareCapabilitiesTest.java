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
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 集群能力对比契约：双侧 probe 画像（连接回显/版本/厂商/evidence/插件/托管标记/节点规模）、
 * diff（版本差/厂商变更/插件差集/节点规模）与 risks 四类生成规则（plugin_missing 高危、
 * version_downgrade 中危、vendor_change 低危、shard_oversize 中危）。纯路径表桩，不触真实集群。
 */
public class CompareCapabilitiesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 跨厂商全量差异：aliyun 8.9.0（ik/apack/murmur3 插件、12 分片）→ 宿主 tencent 7.10.2（tc 插件、2 数据节点）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 跨厂商对比_四类risks齐全() {
        ScriptedCompare sync = stubCrossVendor();

        Map<String, Object> out = sync.compareCapabilities("src-conn-1", conn(), "legacy_orders",
                null, null, null);

        Map<String, Object> source = (Map<String, Object>) out.get("source");
        assertEquals("连接 id 回显优先", "src-conn-1", source.get("connection"));
        assertEquals("legacy_orders", source.get("index"));
        assertEquals("8.9.0", source.get("version"));
        assertEquals("apack", source.get("distribution"));
        assertEquals("aliyun", ((Map<String, Object>) source.get("vendor")).get("id"));
        assertTrue("evidence 记录判定依据",
                ((List<?>) source.get("evidence")).contains("plugin:apack-aliws"));
        assertTrue("阿里云属托管面", (Boolean) source.get("managed"));
        assertEquals(Integer.valueOf(3), source.get("nodeCount"));
        assertEquals(Integer.valueOf(3), source.get("dataNodeCount"));
        assertEquals(Boolean.TRUE, source.get("pluginsReliable"));

        Map<String, Object> target = (Map<String, Object>) out.get("target");
        assertEquals("无连接 id 时宿主记 host", "host", target.get("connection"));
        assertEquals("tencent", ((Map<String, Object>) target.get("vendor")).get("id"));

        Map<String, Object> diff = (Map<String, Object>) out.get("diff");
        assertEquals("8.9.0 -> 7.10.2", diff.get("versionGap"));
        assertEquals(Boolean.TRUE, diff.get("vendorChanged"));
        assertEquals(java.util.Arrays.asList("analysis-ik", "apack-aliws", "mapper-murmur3"),
                diff.get("pluginsOnlyInSource"));
        assertEquals(java.util.Collections.singletonList("tc-logstash"), diff.get("pluginsOnlyInTarget"));
        Map<String, Object> nodeScale = (Map<String, Object>) diff.get("nodeScale");
        assertEquals(Integer.valueOf(3), nodeScale.get("sourceDataNodes"));
        assertEquals(Integer.valueOf(2), nodeScale.get("targetDataNodes"));

        List<Map<String, Object>> risks = (List<Map<String, Object>>) diff.get("risks");
        assertEquals("plugin_missing×3 + version_downgrade + vendor_change + shard_oversize",
                6, risks.size());
        assertEquals("plugin_missing", risks.get(0).get("kind"));
        assertEquals("high", risks.get(0).get("severity"));
        assertEquals("已知组件插件（analysis-ik）：action 提示可自动剔除",
                "auto-strip on sync_structure; or install plugin on target", risks.get(0).get("action"));
        assertEquals("已知组件插件（apack-aliws 覆盖 aliws 组件）同样可自动剔除",
                "auto-strip on sync_structure; or install plugin on target", risks.get(1).get("action"));
        assertEquals("非矩阵已知插件（mapper-murmur3）：action 提示装插件或移除组件",
                "install plugin on target or exclude related components", risks.get(2).get("action"));
        assertEquals("version_downgrade", risks.get(3).get("kind"));
        assertEquals("medium", risks.get(3).get("severity"));
        assertEquals("vendor_change", risks.get(4).get("kind"));
        assertEquals("low", risks.get(4).get("severity"));
        assertTrue("vendor_change 提示 dryRun 预览",
                String.valueOf(risks.get(4).get("action")).contains("dryRun=true"));
        assertEquals("shard_oversize", risks.get(5).get("kind"));
        assertEquals("medium", risks.get(5).get("severity"));
        assertTrue(String.valueOf(risks.get(5).get("message")).contains("12"));
    }

    /** 同厂商同版本同插件：diff 全空（versionGap null、无 risks），compatible 判读面干净。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 同构集群对比无风险() {
        ScriptedCompare sync = new ScriptedCompare();
        putSame(sync.getSource, sync.targetGet);

        Map<String, Object> out = sync.compareCapabilities(null, conn(), "legacy_orders",
                "dest-conn-2", null, "orders_v2");

        Map<String, Object> diff = (Map<String, Object>) out.get("diff");
        assertNull("版本相同：versionGap 为 null", diff.get("versionGap"));
        assertEquals(Boolean.FALSE, diff.get("vendorChanged"));
        assertTrue(((List<?>) diff.get("pluginsOnlyInSource")).isEmpty());
        assertTrue(((List<?>) diff.get("pluginsOnlyInTarget")).isEmpty());
        assertTrue(((List<?>) diff.get("risks")).isEmpty());
        Map<String, Object> target = (Map<String, Object>) out.get("target");
        assertEquals("dest-conn-2", target.get("connection"));
        assertEquals("orders_v2", target.get("index"));
    }

    /** 缺源连接直接拒绝。 */
    @Test
    public void 缺源连接拒绝() {
        ScriptedCompare sync = new ScriptedCompare();
        try {
            sync.compareCapabilities("src", null, "idx", null, null, null);
            fail("srcConn 必填");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("srcConn"));
        }
    }

    /** sourceIndex 可选：省略时跳过索引画像与 shard_oversize，双侧集群对比照常（index echo null）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void sourceIndex可省_跳过索引画像() {
        ScriptedCompare sync = new ScriptedCompare();
        putSame(sync.getSource, sync.targetGet);
        /* 不提供任何 /{index}/_settings 桩：sourceIndex 省略时不应触发索引画像读取 */

        Map<String, Object> out = sync.compareCapabilities(null, conn(), null, null, null, null);

        Map<String, Object> source = (Map<String, Object>) out.get("source");
        assertNull("source.index 如实 null", source.get("index"));
        assertNull("target.index 缺省回退 sourceIndex 名（同为 null）",
                ((Map<String, Object>) out.get("target")).get("index"));
        Map<String, Object> diff = (Map<String, Object>) out.get("diff");
        assertTrue("无索引画像输入：shard_oversize 不判", ((List<?>) diff.get("risks")).isEmpty());
        assertEquals("集群对比照常", Boolean.FALSE, diff.get("vendorChanged"));
    }

    /** versionGap 按 major.minor 口径：7.10.1 vs 7.10.2 补丁号差异不算版本差；minor 差异照报。 */
    @Test
    @SuppressWarnings("unchecked")
    public void versionGap按majorMinor口径() {
        ScriptedCompare sync = new ScriptedCompare();
        putSame(sync.getSource, sync.targetGet);
        sync.getSource.put("/", "{\"version\":{\"number\":\"7.10.1\",\"distribution\":\"default\"}}");

        Map<String, Object> diff = (Map<String, Object>) sync.compareCapabilities(null, conn(),
                "legacy_orders", null, null, null).get("diff");
        assertNull("补丁号差异不报版本差", diff.get("versionGap"));

        sync.getSource.put("/", "{\"version\":{\"number\":\"7.9.0\",\"distribution\":\"default\"}}");
        diff = (Map<String, Object>) sync.compareCapabilities(null, conn(),
                "legacy_orders", null, null, null).get("diff");
        assertEquals("minor 差异照报", "7.9.0 -> 7.10.2", diff.get("versionGap"));
    }

    /** vendorChanged 排除 unknown：一侧厂商探测不出不断言厂商切换，vendor_change 风险不生成。 */
    @Test
    @SuppressWarnings("unchecked")
    public void vendorChanged排除unknown() {
        ScriptedCompare sync = new ScriptedCompare();
        putSame(sync.getSource, sync.targetGet);
        /* 目标去掉 distribution（无云特征插件）：vendor 推断为 unknown，插件清单保持一致 */
        sync.targetGet.put("/", "{\"version\":{\"number\":\"7.10.2\"}}");

        Map<String, Object> out = sync.compareCapabilities(null, conn(), null, null, null, null);

        Map<String, Object> diff = (Map<String, Object>) out.get("diff");
        assertEquals("一侧 unknown 不判厂商切换", Boolean.FALSE, diff.get("vendorChanged"));
        assertTrue(((List<?>) diff.get("risks")).isEmpty());
        assertEquals("unknown",
                ((Map<String, Object>) ((Map<String, Object>) out.get("target")).get("vendor")).get("id"));
    }

    /** shard_oversize 加 dataNodeCount>0 守卫：目标数据节点数为 0（如实读到的空集群）不判过碎。 */
    @Test
    @SuppressWarnings("unchecked")
    public void shardOversize要求数据节点大于0() {
        ScriptedCompare sync = new ScriptedCompare();
        putSame(sync.getSource, sync.targetGet);
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"12\"}}}");
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":2,\"number_of_data_nodes\":0}");

        Map<String, Object> diff = (Map<String, Object>) sync.compareCapabilities(null, conn(),
                "legacy_orders", null, null, null).get("diff");

        assertTrue("目标数据节点数 0：不判 shard_oversize（避免 3×0 恒真误报）",
                ((List<?>) diff.get("risks")).isEmpty());
    }

    /* ───────── 桩与工具 ───────── */

    /** 跨厂商桩：源 aliyun(8.9.0/apack、ik+apack 插件、12 分片、3 节点) → 宿主 tencent(7.10.2、tc 插件、2 数据节点)。 */
    private static ScriptedCompare stubCrossVendor() {
        ScriptedCompare sync = new ScriptedCompare();
        sync.getSource.put("/", "{\"version\":{\"number\":\"8.9.0\",\"distribution\":\"apack\"},"
                + "\"cluster_name\":\"src-cluster\"}");
        sync.getSource.put("/_nodes/plugins", pluginsJson("analysis-ik", "apack-aliws", "mapper-murmur3"));
        sync.getSource.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"12\"}}}");
        sync.targetGet.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"},"
                + "\"cluster_name\":\"dst-cluster\"}");
        sync.targetGet.put("/_nodes/plugins", pluginsJson("tc-logstash"));
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":2,\"number_of_data_nodes\":2}");
        return sync;
    }

    private static void putSame(Map<String, String> source, Map<String, String> target) {
        String root = "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"},"
                + "\"cluster_name\":\"same\"}";
        source.put("/", root);
        source.put("/_nodes/plugins", pluginsJson("analysis-ik"));
        source.put("/_cluster/health", "{\"number_of_nodes\":2,\"number_of_data_nodes\":2}");
        source.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"2\"}}}");
        target.put("/", root);
        target.put("/_nodes/plugins", pluginsJson("analysis-ik"));
        target.put("/_cluster/health", "{\"number_of_nodes\":2,\"number_of_data_nodes\":2}");
    }

    private static class ScriptedCompare extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();

        ScriptedCompare() {
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
