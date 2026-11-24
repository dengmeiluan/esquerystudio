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
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * preflight 增强契约：sourceBytes（_stats primaries.store.size_in_bytes）、fieldTypeCounts
 * （mapping 字段类型计数，含嵌套与 multi-fields）、sourceAliases、recommended
 * （slices/batchSize/requestsPerSecond 启发式）与 advice（四码位）。
 * 2026-11-21 兼容计划批。路径表桩（performLowLevel 覆写），不触真实集群。
 */
public class PreflightEnhanceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── 静态件：字段类型计数 / 推荐切片 / 建议构造 ───────── */

    @Test
    public void 字段类型计数_含嵌套与multi_fields() {
        String mapping = "{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"fields\":{\"kw\":{\"type\":\"keyword\"}}},"
                + "\"created\":{\"type\":\"date\"},"
                + "\"nested1\":{\"properties\":{\"inner\":{\"type\":\"long\"},"
                + "\"deep\":{\"properties\":{\"leaf\":{\"type\":\"date\"}}}}}}}";
        Map<String, Object> counts = CrossClusterMigrateService.fieldTypeCounts(mapping);
        assertEquals(2L, ((Number) counts.get("date")).longValue());
        assertEquals(1L, ((Number) counts.get("text")).longValue());
        assertEquals(1L, ((Number) counts.get("keyword")).longValue());
        assertEquals(1L, ((Number) counts.get("long")).longValue());
        assertNull("无 type 的容器不计", counts.get("object"));
        assertTrue(CrossClusterMigrateService.fieldTypeCounts("").isEmpty());
        assertTrue(CrossClusterMigrateService.fieldTypeCounts("not-json").isEmpty());
    }

    @Test
    public void 推荐切片启发式() {
        assertEquals("min(源分片, max(2, 数据节点×2), 8)",
                4, CrossClusterMigrateService.recommendedSlices(6, 2));
        assertEquals("数据节点放大到上限 8", 8, CrossClusterMigrateService.recommendedSlices(30, 5));
        assertEquals("源分片 1 参与下限后取 1", 1, CrossClusterMigrateService.recommendedSlices(1, 0));
        assertEquals("源分片未知按节点面", 6, CrossClusterMigrateService.recommendedSlices(null, 3));
        assertEquals("双侧未知兜底 2", 2, CrossClusterMigrateService.recommendedSlices(null, null));
    }

    @Test
    public void 建议四码位_判据缺席不产生() {
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("formatlessDateFields", Arrays.asList("created_at", "updated_at"));
        profile.put("sourceAliases", Arrays.asList("orders_ro", "orders_w"));
        List<Map<String, Object>> advice = CrossClusterMigrateService.buildPreflightAdvice(
                profile, "6.8.5", "7.10.2", 12, 2);
        assertEquals("formatless_date/version_gap/shard_oversize/alias_attached 各一条", 4, advice.size());
        assertEquals("formatless_date", advice.get(0).get("code"));
        assertTrue(String.valueOf(advice.get(0).get("message")).contains("2 个无 format 的 date 字段"));
        assertTrue(String.valueOf(advice.get(0).get("message")).contains("1970"));
        assertEquals("version_gap", advice.get(1).get("code"));
        assertTrue(String.valueOf(advice.get(1).get("message")).contains("6.8.5")
                && String.valueOf(advice.get(1).get("message")).contains("7.10.2"));
        assertEquals("shard_oversize", advice.get(2).get("code"));
        assertTrue(String.valueOf(advice.get(2).get("message")).contains("12")
                && String.valueOf(advice.get(2).get("message")).contains("≤ 6"));
        assertEquals("alias_attached", advice.get(3).get("code"));
        assertTrue(String.valueOf(advice.get(3).get("message")).contains("orders_ro"));

        assertTrue("判据缺席（profile null/版本未知/分片未超）不产生建议",
                CrossClusterMigrateService.buildPreflightAdvice(null, null, null, null, null).isEmpty());
        assertTrue(CrossClusterMigrateService.buildPreflightAdvice(
                new LinkedHashMap<String, Object>(), "7.10.2", "7.10.2", 6, 2).isEmpty());
    }

    /** 兼容预警（compat）：跨厂商或源含厂商私有 settings 时追加，判据缺席不产生。 */
    @Test
    public void 兼容预警_跨厂商或私有settings() {
        List<Map<String, Object>> crossVendor = CrossClusterMigrateService.buildPreflightAdvice(
                new LinkedHashMap<String, Object>(), "7.10.2", "7.10.2", 6, 2,
                "aliyun", "oss", false);
        assertEquals(1, crossVendor.size());
        assertEquals("compat", crossVendor.get(0).get("code"));
        assertEquals("compat", crossVendor.get(0).get("kind"));
        assertTrue(String.valueOf(crossVendor.get(0).get("message")).contains("aliyun"));
        assertTrue(String.valueOf(crossVendor.get(0).get("message")).contains("oss"));
        assertTrue("提示先跑 sync_structure dry-run 预览",
                String.valueOf(crossVendor.get(0).get("message"))
                        .contains("structure sync recommended: run sync_structure dryRun preview before start"));

        List<Map<String, Object>> privateSettings = CrossClusterMigrateService.buildPreflightAdvice(
                new LinkedHashMap<String, Object>(), null, null, null, null,
                null, null, true);
        assertEquals("源含厂商私有 settings 即预警（双侧厂商未知也提示）", 1, privateSettings.size());
        assertEquals("compat", privateSettings.get(0).get("code"));
        assertTrue(String.valueOf(privateSettings.get(0).get("message")).contains("厂商私有"));

        assertTrue("判据缺席（厂商未知且无私有键）不产生 compat 建议",
                CrossClusterMigrateService.buildPreflightAdvice(
                        new LinkedHashMap<String, Object>(), "7.10.2", "7.10.2", 6, 2,
                        "oss", null, false).isEmpty());
        assertTrue("同厂商且无私有键不产生",
                CrossClusterMigrateService.buildPreflightAdvice(
                        new LinkedHashMap<String, Object>(), "7.10.2", "7.10.2", 6, 2,
                        "oss", "oss", false).isEmpty());
    }

    /** 厂商私有前缀扫描（轻量表，与 CompatMatrix 的 VENDOR_PRIVATE_PREFIXES 同口径）。 */
    @Test
    public void 厂商私有settings前缀扫描() {
        Map<String, Object> flat = new LinkedHashMap<>();
        flat.put("index.number_of_shards", "5");
        assertTrue("无私有键", !CrossClusterMigrateService.hasVendorPrivateSettings(flat));
        flat.put("index.apack.knn", "true");
        assertTrue("阿里云 apack", CrossClusterMigrateService.hasVendorPrivateSettings(flat));
        flat.remove("index.apack.knn");
        flat.put("index.tencent.dist", "x");
        assertTrue("腾讯云", CrossClusterMigrateService.hasVendorPrivateSettings(flat));
        flat.remove("index.tencent.dist");
        flat.put("index.cloud_aws.iam", "y");
        assertTrue("AWS", CrossClusterMigrateService.hasVendorPrivateSettings(flat));
        assertFalse("读不到如实 false", CrossClusterMigrateService.hasVendorPrivateSettings(null));
    }

    /* ───────── service 级：源画像与推荐位 ───────── */

    /** 路径表桩：performLowLevel 覆写（远端低阶请求全部按端点回放）。 */
    private static class ScriptedService extends CrossClusterMigrateService {
        final Map<String, String> responses = new LinkedHashMap<>();

        ScriptedService() {
            super(null, new EsIndexAdmin(null) {
                @Override
                public boolean indexExists(String index) {
                    return false;
                }
            }, new RemoteEsClientFactory(1000, 1000) {
                @Override
                public RestHighLevelClient build(RemoteClusterConn conn) {
                    /* 只需一个可关闭的非 null client：请求经 performLowLevel 覆写，永不触网 */
                    return new RestHighLevelClient(RestClient.builder(new HttpHost("127.0.0.1", 1))) {
                    };
                }
            }, null, null, null, null, null, null);
        }

        @Override
        Map<String, Object> performLowLevel(org.elasticsearch.client.RestClient ll, Request req) {
            String raw = responses.get(req.getEndpoint());
            if (raw == null) {
                throw new IllegalStateException("桩缺少响应: " + req.getEndpoint());
            }
            try {
                return MAPPER.readValue(raw, Map.class);
            } catch (Exception e) {
                throw new IllegalStateException("桩响应不是合法 JSON: " + req.getEndpoint(), e);
            }
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void preflight携带源画像与推荐位() {
        ScriptedService svc = new ScriptedService();
        svc.responses.put("/", "{\"version\":{\"number\":\"6.8.5\",\"distribution\":\"default\"}}");
        svc.responses.put("/orders/_count", "{\"count\":6000001}");
        svc.responses.put("/orders/_settings",
                "{\"orders\":{\"settings\":{\"index.number_of_shards\":\"12\"}}}");
        svc.responses.put("/orders/_stats",
                "{\"_all\":{\"primaries\":{\"store\":{\"size_in_bytes\":123456789}}}}");
        svc.responses.put("/orders/_alias", "{\"orders\":{\"aliases\":{\"orders_ro\":{}}}}");
        svc.responses.put("/orders/_mapping", "{\"orders\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"},"
                + "\"created\":{\"type\":\"date\"}}}}}");

        MigrateRequest req = new MigrateRequest();
        req.setSourceIndex("orders");
        req.setDestIndex("orders-v2");
        req.setConn(new RemoteClusterConn("http", "10.0.0.9", 9200, "u", "p"));

        Map<String, Object> out = svc.preflight(req);

        assertEquals(Long.valueOf(123456789L), out.get("sourceBytes"));
        assertEquals(Long.valueOf(6000001L), out.get("srcDocCount"));
        assertEquals(12, ((Number) out.get("srcShards")).intValue());
        assertEquals(java.util.Collections.singletonList("orders_ro"), out.get("sourceAliases"));
        Map<String, Object> fieldTypeCounts = (Map<String, Object>) out.get("fieldTypeCounts");
        assertEquals(1L, ((Number) fieldTypeCounts.get("text")).longValue());
        assertEquals(1L, ((Number) fieldTypeCounts.get("date")).longValue());

        Map<String, Object> recommended = (Map<String, Object>) out.get("recommended");
        assertEquals("目标数据节点未知 → 兜底 2（分片 12 参与后仍取 2）",
                2, ((Number) recommended.get("slices")).intValue());
        assertEquals(500, ((Number) recommended.get("batchSize")).intValue());
        assertEquals("源文档数 > 500 万 → 不限速（-1）",
                -1, ((Number) recommended.get("requestsPerSecond")).intValue());

        List<Map<String, Object>> advice = (List<Map<String, Object>>) out.get("advice");
        assertEquals("formatless_date + alias_attached（版本/分片判据缺席不产生）", 2, advice.size());
        assertEquals("formatless_date", advice.get(0).get("code"));
        assertEquals("alias_attached", advice.get(1).get("code"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 源文档数不超500万时推荐2000限速() {
        ScriptedService svc = new ScriptedService();
        svc.responses.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"}}");
        svc.responses.put("/orders/_count", "{\"count\":1000}");
        svc.responses.put("/orders/_settings",
                "{\"orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        svc.responses.put("/orders/_stats", "{\"_all\":{\"primaries\":{\"store\":{\"size_in_bytes\":1}}}}");
        svc.responses.put("/orders/_alias", "{\"orders\":{\"aliases\":{}}}");
        svc.responses.put("/orders/_mapping", "{\"orders\":{\"mappings\":{\"properties\":{}}}}");

        MigrateRequest req = new MigrateRequest();
        req.setSourceIndex("orders");
        req.setDestIndex("orders-v2");
        req.setConn(new RemoteClusterConn("http", "10.0.0.9", 9200, "u", "p"));
        req.setTuneMode(TuneMode.GENTLE);

        Map<String, Object> out = svc.preflight(req);
        Map<String, Object> recommended = (Map<String, Object>) out.get("recommended");
        assertEquals(2000, ((Number) recommended.get("requestsPerSecond")).intValue());
        assertEquals("源分片 1 参与下限", 1, ((Number) recommended.get("slices")).intValue());
        assertTrue(((List<?>) out.get("advice")).isEmpty());
        assertEquals("estSeconds 沿用温和档速率", Long.valueOf(0L), (Long) out.get("estSeconds"));
    }

    /** preflight 兼容预警（service 级）：源插件带 apack 特征 + 源 settings 含 apack 私有键
     *  → advice 追加 compat（宿主探测失败如实 null，靠私有键判据独立成立）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void preflight携带兼容预警() {
        ScriptedService svc = new ScriptedService();
        svc.responses.put("/", "{\"version\":{\"number\":\"7.10.2\",\"distribution\":\"default\"}}");
        svc.responses.put("/orders/_count", "{\"count\":1000}");
        svc.responses.put("/orders/_settings",
                "{\"orders\":{\"settings\":{\"index.number_of_shards\":\"1\",\"index.apack.knn\":\"true\"}}}");
        svc.responses.put("/orders/_stats", "{\"_all\":{\"primaries\":{\"store\":{\"size_in_bytes\":1}}}}");
        svc.responses.put("/orders/_alias", "{\"orders\":{\"aliases\":{}}}");
        svc.responses.put("/orders/_mapping", "{\"orders\":{\"mappings\":{\"properties\":{}}}}");
        svc.responses.put("/_nodes/plugins",
                "{\"nodes\":{\"n1\":{\"plugins\":[{\"id\":\"apack-oracle\"}]}}}");

        MigrateRequest req = new MigrateRequest();
        req.setSourceIndex("orders");
        req.setDestIndex("orders-v2");
        req.setConn(new RemoteClusterConn("http", "10.0.0.9", 9200, "u", "p"));

        Map<String, Object> out = svc.preflight(req);
        List<Map<String, Object>> advice = (List<Map<String, Object>>) out.get("advice");
        assertEquals("源含厂商私有 settings → 恰一条 compat", 1, advice.size());
        assertEquals("compat", advice.get(0).get("code"));
        assertEquals("compat", advice.get(0).get("kind"));
        assertTrue(String.valueOf(advice.get(0).get("message"))
                .contains("structure sync recommended: run sync_structure dryRun preview before start"));
    }
}
