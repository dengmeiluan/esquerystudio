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
import org.elasticsearch.client.RestClient;
import org.junit.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 结构同步 dry-run 契约：不发 PUT/别名写，报告 v2 含 planned（矩阵预剔除）与 advice、
 * reactive 三清单为空、rounds=0、两侧探测画像（版本/厂商/插件）如实呈现。
 * 2026-11-21 兼容计划批。纯 JUnit 路径表桩，不触真实集群。
 */
public class StructureSyncDryRunTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    @SuppressWarnings("unchecked")
    public void dryRun不发PUT_报告含planned与advice_反应式清单为空() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/", versionJson("6.8.5", "apack"));
        sync.getSource.put("/_nodes/plugins", pluginsJson("apack-aliws"));
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", "{"
                + "\"legacy_orders\":{\"settings\":{"
                + "\"index.number_of_shards\":\"12\","
                + "\"index.apack.knn\":\"true\"}}}");
        sync.getSource.put("/legacy_orders/_mapping", "{\"legacy_orders\":{\"mappings\":{\"properties\":{"
                + "\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}}}");
        sync.getSource.put("/legacy_orders/_alias",
                "{\"legacy_orders\":{\"aliases\":{\"orders_ro\":{}}}}");
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-pinyin"));
        sync.targetGet.put("/_cluster/health",
                "{\"number_of_nodes\":3,\"number_of_data_nodes\":2}");
        sync.putStatuses.add(200); // 陷阱位：dry-run 下绝不该被消费
        sync.putErrors.add("");

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null, true, false);

        assertEquals("dry-run 不发 PUT", 0, sync.putBodies.size());
        assertEquals("dry-run 不写别名", 0, sync.postAliasBodies.size());
        assertEquals(Boolean.FALSE, out.get("created"));
        assertEquals(Boolean.TRUE, out.get("dryRun"));
        assertEquals("legacy_orders", out.get("destIndex"));
        assertEquals(0, ((Number) out.get("rounds")).intValue());
        assertFalse("dry-run 非失败态，无 lastError", out.containsKey("lastError"));

        Map<String, Object> planned = (Map<String, Object>) out.get("planned");
        List<Map<String, Object>> plannedSettings = (List<Map<String, Object>>) planned.get("removedSettings");
        assertEquals(1, plannedSettings.size());
        assertEquals("index.apack.knn", plannedSettings.get(0).get("key"));
        assertEquals("阿里云 apack 私有设置，跨环境不可迁移", plannedSettings.get(0).get("reason"));
        List<Map<String, Object>> plannedFields = (List<Map<String, Object>>) planned.get("downgradedFields");
        assertEquals("目标缺 analysis-ik：直接引用 ik_max_word 的字段预降级", 1, plannedFields.size());
        assertEquals("title", plannedFields.get(0).get("field"));
        assertEquals("ik_max_word", plannedFields.get(0).get("from"));
        assertEquals("standard", plannedFields.get(0).get("to"));

        Map<String, Object> reactive = (Map<String, Object>) out.get("reactive");
        assertTrue(((List<?>) reactive.get("removedSettings")).isEmpty());
        assertTrue(((List<?>) reactive.get("removedAnalysis")).isEmpty());
        assertTrue(((List<?>) reactive.get("downgradedFields")).isEmpty());

        List<Map<String, Object>> advice = (List<Map<String, Object>>) out.get("advice");
        assertEquals("plugin_install（跨厂商 aliyun→oss 且 ik 降级）+ 分片过碎（12 > 3×2）各一条",
                2, advice.size());
        assertEquals("plugin_install", advice.get(0).get("kind"));
        assertEquals("analysis-ik", advice.get(0).get("key"));
        assertEquals("target vendor oss lacks plugin analysis-ik; install it on target or accept standard fallback",
                advice.get(0).get("message"));
        assertEquals("shards", advice.get(1).get("kind"));
        assertEquals("目标数据节点 2 个，源分片 12 片过碎，建议 ≤ 6", advice.get(1).get("message"));

        Map<String, Object> source = (Map<String, Object>) out.get("source");
        assertEquals("legacy_orders", source.get("index"));
        assertEquals("6.8.5", source.get("version"));
        Map<String, Object> sourceVendor = (Map<String, Object>) source.get("vendor");
        assertEquals("aliyun", sourceVendor.get("id"));
        assertEquals("阿里云 ES", sourceVendor.get("label"));
        Map<String, Object> target = (Map<String, Object>) out.get("target");
        assertEquals("7.10.2", target.get("version"));
        assertEquals("oss", ((Map<String, Object>) target.get("vendor")).get("id"));
        assertEquals("开源自建", ((Map<String, Object>) target.get("vendor")).get("label"));

        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertEquals(java.util.Collections.singletonList("orders_ro"), aliases.get("skipped"));
        assertTrue(((List<?>) aliases.get("synced")).isEmpty());
    }

    /** 非 dry-run 走 PUT 循环（回归锚：dryRun=false 时行为不因参数扩展改变）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void dryRun为false时照常PUT() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.putStatuses.add(200);
        sync.putErrors.add("");

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null, false, false);

        assertEquals(Boolean.TRUE, out.get("created"));
        assertEquals(Boolean.FALSE, out.get("dryRun"));
        assertEquals(1, sync.putBodies.size());
        assertEquals(1, ((Number) out.get("rounds")).intValue());
    }

    /**
     * dry-run + syncAliases=true 的计划口径：synced=源别名全集（计划将同步）、
     * skipped 为空，且不真正发 PUT/别名写（守恒式在计划口径同样成立）。
     */
    @Test
    @SuppressWarnings("unchecked")
    public void dryRun加syncAliases为true时_synced为计划全集_skipped为空() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/legacy_orders/_alias",
                "{\"legacy_orders\":{\"aliases\":{\"orders_ro\":{},\"orders_rw\":{}}}}");
        sync.targetGet.put("/", versionJson("7.10.2", "default"));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null, true, true);

        assertEquals("dry-run 不发 PUT", 0, sync.putBodies.size());
        assertEquals("dry-run 不写别名", 0, sync.postAliasBodies.size());
        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertEquals("计划口径：synced=源别名全集（计划将同步）",
                java.util.Arrays.asList("orders_ro", "orders_rw"), aliases.get("synced"));
        assertTrue("计划口径：skipped 为空", ((List<?>) aliases.get("skipped")).isEmpty());
    }

    /* ───────── 桩 ───────── */

    private static class ScriptedSync extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final List<Integer> putStatuses = new ArrayList<>();
        final List<String> putErrors = new ArrayList<>();
        final List<String> putBodies = new ArrayList<>();
        final List<String> postAliasBodies = new ArrayList<>();
        private int putCall;

        ScriptedSync() {
            super(() -> {
                throw new RuntimeException("local-client-must-not-be-touched");
            }, new EsIndexAdmin(null), new RemoteEsClientFactory(1000, 1000) {
                @Override
                public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                    return null;
                }
            });
        }

        @Override
        Map<String, Object> sourceGet(RestClient ll, String path) {
            if (path.endsWith("/_alias") && !getSource.containsKey(path)) {
                return json("{\"legacy_orders\":{\"aliases\":{}}}");
            }
            return json(getSource.get(path));
        }

        @Override
        Map<String, Object> targetGet(String path) {
            return json(targetGet.get(path));
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
