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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 结构同步 v3 增量契约：报告新增 destConnId/planDigest/body；planDigest 对 canonical JSON
 * 稳定复现；expectPlanDigest 漂移拒绝（源结构变化后旧摘要不得执行）；destConnId 指定时
 * 目标读写走指定连接通道（destGet/destTargetPut/destTargetPostAliases）而非宿主。
 * 纯 JUnit 路径表桩（假远端 client 只提供 low-level 句柄，请求全部被覆写），不触真实集群。
 */
public class StructureSyncV3Test {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── v3 新字段：destConnId / planDigest / body ───────── */

    /** dry-run：body 为计划 PUT 形态（apack 已剔、字段引用已降级），planDigest 存在且同输入稳定。 */
    @Test
    @SuppressWarnings("unchecked")
    public void dryRun报告含v3字段_body为剔除降级后形态_digest稳定() {
        ScriptedV3 sync = stubHostOnly();

        Map<String, Object> first = sync.syncStructure(conn(), "legacy_orders", null, null,
                true, false, null, null, null);
        Map<String, Object> second = sync.syncStructure(conn(), "legacy_orders", null, null,
                true, false, null, null, null);

        assertNull("目标=宿主集群：destConnId 为 null", first.get("destConnId"));
        assertTrue("dry-run 不发 PUT", sync.putBodies.isEmpty() && sync.destPutBodies.isEmpty());
        assertTrue("v2 字段保留：dryRun", (Boolean) first.get("dryRun"));
        assertEquals(Boolean.FALSE, first.get("created"));

        String digest = String.valueOf(first.get("planDigest"));
        assertTrue("planDigest 为 16 位 hex: " + digest, digest.matches("[0-9a-f]{16}"));
        assertEquals("同输入两次调用 digest 相同", digest, String.valueOf(second.get("planDigest")));

        Map<String, Object> body = (Map<String, Object>) first.get("body");
        Map<String, Object> bodySettings = (Map<String, Object>) body.get("settings");
        Map<String, Object> bodyIndex = (Map<String, Object>) bodySettings.get("index");
        assertNotNull("body.settings 为嵌套形态 {index:{...}}", bodyIndex);
        assertFalse("body.settings.index 已剔 apack 私有键", bodyIndex.containsKey("apack"));
        assertEquals("1", String.valueOf(bodyIndex.get("number_of_shards")));
        Map<String, Object> bodyMappings = (Map<String, Object>) body.get("mappings");
        Map<String, Object> title = (Map<String, Object>) ((Map<String, Object>)
                bodyMappings.get("properties")).get("title");
        assertEquals("body.mappings 为降级后形态（ik_max_word -> standard）",
                "standard", title.get("analyzer"));
        assertTrue("syncAliases=false：body.aliases 为计划空集",
                ((List<?>) body.get("aliases")).isEmpty());
    }

    /* ───────── expectPlanDigest 漂移拒绝 ───────── */

    /** 先 dryRun 取摘要，源结构变化后携旧摘要执行：拒绝且不发 PUT，报两个摘要值。 */
    @Test
    public void 源结构漂移后旧摘要拒绝执行() {
        ScriptedV3 sync = stubHostOnly();
        Map<String, Object> dry = sync.syncStructure(conn(), "legacy_orders", null, null,
                true, false, null, null, null);
        String staleDigest = String.valueOf(dry.get("planDigest"));

        /* 两次调用之间源结构变化：settings 新增一键（模拟漂移） */
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", "{"
                + "\"legacy_orders\":{\"settings\":{"
                + "\"index.number_of_shards\":\"1\","
                + "\"index.apack.knn\":\"true\","
                + "\"index.refresh_interval\":\"30s\"}}}");

        try {
            sync.syncStructure(conn(), "legacy_orders", null, null, false, false,
                    null, null, staleDigest);
            fail("摘要不匹配必须拒绝执行");
        } catch (IllegalStateException e) {
            assertTrue("报错含期望摘要: " + e.getMessage(), e.getMessage().contains(staleDigest));
            assertTrue("报错含实际摘要: " + e.getMessage(),
                    e.getMessage().matches("(?s).*实际 [0-9a-f]{16}.*"));
            assertTrue("报错给出漂移提示", e.getMessage().contains("source structure drifted, re-run dryRun"));
        }
        assertEquals("拒绝发生在 PUT 之前", 0, sync.putBodies.size());
    }

    /** 摘要匹配（同源结构 dryRun → 执行）正常放行，两模式摘要一致。 */
    @Test
    public void 摘要匹配时正常执行且两模式摘要一致() {
        ScriptedV3 sync = stubHostOnly();
        Map<String, Object> dry = sync.syncStructure(conn(), "legacy_orders", null, null,
                true, false, null, null, null);
        String digest = String.valueOf(dry.get("planDigest"));

        Map<String, Object> executed = sync.syncStructure(conn(), "legacy_orders", null, null,
                false, false, null, null, digest);

        assertEquals((Boolean) Boolean.TRUE, executed.get("created"));
        assertEquals("dryRun 与执行模式的计划摘要一致", digest, String.valueOf(executed.get("planDigest")));
        assertEquals(1, sync.putBodies.size());
    }

    /** 执行模式 body 为反应式轮次收敛后的最终形态；planDigest 仍为矩阵适配后的计划摘要。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 执行模式body为收敛后形态_digest保持计划口径() {
        ScriptedV3 sync = stubHostOnly();
        sync.putStatuses.clear();
        sync.putErrors.clear();
        sync.putStatuses.addAll(java.util.Arrays.asList(400, 200));
        sync.putErrors.addAll(java.util.Arrays.asList(
                errorBody("unknown setting [index.qos.legacy]"), ""));

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null,
                false, false, null, null, null);

        assertEquals((Boolean) Boolean.TRUE, out.get("created"));
        assertEquals(2, sync.putBodies.size());
        Map<String, Object> body = (Map<String, Object>) out.get("body");
        Map<String, Object> bodyIndex = (Map<String, Object>)
                ((Map<String, Object>) body.get("settings")).get("index");
        assertFalse("反应式剔除收敛后 body 不含报错键", bodyIndex.containsKey("qos"));
        assertTrue("最后一轮 PUT 体与 body 一致（嵌套形态）",
                sync.putBodies.get(1).contains("\"number_of_shards\":\"1\""));
    }

    /* ───────── destConnId：目标走指定连接 ───────── */

    /** destConnId 指定目标连接：探测/PUT/别名走 dest 通道，回显 destConnId，宿主通道零请求。 */
    @Test
    @SuppressWarnings("unchecked")
    public void destConn指定时目标走指定连接并回显id() {
        ScriptedV3 sync = new ScriptedV3();
        sync.getSource.put("/", versionJson("7.10.2", "default"));
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", "{"
                + "\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/legacy_orders/_alias",
                "{\"legacy_orders\":{\"aliases\":{\"orders_ro\":{}}}}");
        sync.destGet.put("/", versionJson("7.10.2", "default"));
        sync.destGet.put("/_nodes/plugins", pluginsJson("analysis-ik", "apack-aliws"));
        sync.destGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
        sync.destPutStatuses.add(200);
        sync.destPutErrors.add("");

        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null,
                false, true, "conn-dest-77", new RemoteClusterConn("http", "10.1.2.3", 9200, null, null),
                null);

        assertEquals("destConnId 回显", "conn-dest-77", out.get("destConnId"));
        assertEquals((Boolean) Boolean.TRUE, out.get("created"));
        assertEquals("宿主 PUT 零请求", 0, sync.putBodies.size());
        assertEquals("目标 PUT 走 dest 通道", 1, sync.destPutBodies.size());
        assertTrue(sync.destPutBodies.get(0).contains("\"settings\""));
        assertEquals("别名随迁走 dest 通道", 1, sync.destPostAliasBodies.size());
        assertEquals("目标画像来自 dest 探测",
                "aliyun", ((Map<String, Object>) ((Map<String, Object>) out.get("target"))
                        .get("vendor")).get("id"));
        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertEquals(java.util.Collections.singletonList("orders_ro"), aliases.get("synced"));
    }

    /* ───────── 桩与工具 ───────── */

    /** 宿主目标的最小桩：源 aliyun(apack)+ik 引用 → 矩阵剔 apack、降级 ik 字段。 */
    private static ScriptedV3 stubHostOnly() {
        ScriptedV3 sync = new ScriptedV3();
        sync.getSource.put("/", versionJson("6.8.5", "apack"));
        sync.getSource.put("/_nodes/plugins", pluginsJson("analysis-ik", "apack-aliws"));
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true", "{"
                + "\"legacy_orders\":{\"settings\":{"
                + "\"index.number_of_shards\":\"1\","
                + "\"index.apack.knn\":\"true\","
                + "\"index.qos.legacy\":\"true\"}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":"
                        + "{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}}}");
        sync.getSource.put("/legacy_orders/_alias",
                "{\"legacy_orders\":{\"aliases\":{}}}");
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-pinyin"));
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
        sync.putStatuses.add(200);
        sync.putErrors.add("");
        return sync;
    }

    /**
     * 路径表桩：源/宿主目标/dest 目标三通道各自按路径回放 JSON；宿主 PUT 与 dest PUT 分别
     * 记录请求体。远端 client 为本地假句柄（不触网）——所有请求均被覆写点拦截。
     */
    private static class ScriptedV3 extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final Map<String, String> destGet = new LinkedHashMap<>();
        final List<Integer> putStatuses = new ArrayList<>();
        final List<String> putErrors = new ArrayList<>();
        final List<String> putBodies = new ArrayList<>();
        final List<Integer> destPutStatuses = new ArrayList<>();
        final List<String> destPutErrors = new ArrayList<>();
        final List<String> destPutBodies = new ArrayList<>();
        final List<String> destPostAliasBodies = new ArrayList<>();
        private int putCall;
        private int destPutCall;

        ScriptedV3() {
            super(() -> {
                throw new RuntimeException("local-client-must-not-be-touched");
            }, new EsIndexAdmin(null), new RemoteEsClientFactory(1000, 1000) {
                @Override
                public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                    /* 假 client：仅提供 low-level 句柄（sourceGet/destGet 均已覆写，不会真正触网） */
                    return new org.elasticsearch.client.RestHighLevelClient(
                            RestClient.builder(new HttpHost("127.0.0.1", 1)));
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
            return new StructureSyncService.PutResult(200, "{\"acknowledged\":true}");
        }

        @Override
        Map<String, Object> destGet(RestClient ll, String path) {
            return json(destGet.get(path));
        }

        @Override
        StructureSyncService.PutResult destTargetPut(RestClient ll, String destIndex, String jsonBody) {
            destPutBodies.add(jsonBody);
            int idx = Math.min(destPutCall, destPutStatuses.size() - 1);
            destPutCall++;
            return new StructureSyncService.PutResult(destPutStatuses.get(idx), destPutErrors.get(idx));
        }

        @Override
        StructureSyncService.PutResult destTargetPostAliases(RestClient ll, String jsonBody) {
            destPostAliasBodies.add(jsonBody);
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

    private static String errorBody(String reason) {
        return "{\"error\":{\"root_cause\":[{\"type\":\"illegal_argument_exception\",\"reason\":"
                + "\"" + reason.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}],"
                + "\"type\":\"illegal_argument_exception\",\"reason\":"
                + "\"" + reason.replace("\\", "\\\\").replace("\"", "\\\"") + "\"},\"status\":400}";
    }
}
