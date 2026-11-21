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
import static org.junit.Assert.assertTrue;

/**
 * 结构同步别名随迁的两态契约：syncAliases=false 报告 skipped（源别名清单）且不写别名；
 * true 时建成索引后逐别名 POST _aliases（filter/routing 元数据原样）进 synced，
 * 失败进 warnings 不回滚索引创建。aliases 守恒——synced+skipped 之和恒为源别名数
 * （事实口径：skipped=源全集−实际写成功，含写失败项）。2026-11-21 兼容计划批。
 */
public class StructureSyncAliasesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 源两个别名：一个裸别名、一个带 filter/index_routing 元数据。 */
    private static final String ALIAS_JSON = "{\"legacy_orders\":{\"aliases\":{"
            + "\"orders_ro\":{},"
            + "\"orders_filter\":{\"filter\":{\"term\":{\"status\":1}},"
            + "\"index_routing\":\"orders_filter\",\"search_routing\":\"orders_filter\"}}}}";

    @Test
    @SuppressWarnings("unchecked")
    public void syncAliases为false时报告skipped且不写别名() {
        ScriptedSync sync = stub();
        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null, false, false);

        assertEquals(Boolean.TRUE, out.get("created"));
        assertEquals("不写别名", 0, sync.postAliasBodies.size());
        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertEquals(java.util.Arrays.asList("orders_ro", "orders_filter"), aliases.get("skipped"));
        assertTrue(((List<?>) aliases.get("synced")).isEmpty());
        assertTrue(((List<?>) out.get("warnings")).isEmpty());
    }

    @Test
    @SuppressWarnings("unchecked")
    public void syncAliases为true时逐别名add_元数据原样() {
        ScriptedSync sync = stub();
        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", "orders_v2", null, false, true);

        assertEquals(Boolean.TRUE, out.get("created"));
        assertEquals(2, sync.postAliasBodies.size());
        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertTrue("随迁态不再报 skipped", ((List<?>) aliases.get("skipped")).isEmpty());
        assertEquals(java.util.Arrays.asList("orders_ro", "orders_filter"), aliases.get("synced"));

        String first = sync.postAliasBodies.get(0);
        assertTrue("POST _aliases 逐别名 add", first.contains("\"add\""));
        assertTrue("目标索引名", first.contains("orders_v2"));
        assertTrue("裸别名不带 filter", !first.contains("filter"));

        String second = sync.postAliasBodies.get(1);
        assertTrue("filter 元数据原样", second.contains("\"filter\":{\"term\":{\"status\":1}}".replace(" ", "")));
        assertTrue("路由元数据原样", second.contains("index_routing"));
        assertTrue(second.contains("search_routing"));
        assertTrue(((List<?>) out.get("warnings")).isEmpty());
    }

    /** 别名写失败：进 warnings 如实告知，索引创建不回滚（created 保持 true）；
     *  全部失败的事实在 aliases 上守恒——synced 空、skipped=源别名全集。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 别名写失败进warnings不回滚() {
        ScriptedSync sync = stub();
        sync.aliasStatuses.clear();
        sync.aliasStatuses.addAll(java.util.Arrays.asList(400, 500));
        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null, false, true);

        assertEquals("索引创建不回滚", Boolean.TRUE, out.get("created"));
        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertTrue(((List<?>) aliases.get("synced")).isEmpty());
        assertEquals("写失败的别名计入 skipped（守恒）",
                java.util.Arrays.asList("orders_ro", "orders_filter"), aliases.get("skipped"));
        List<String> warnings = (List<String>) out.get("warnings");
        assertEquals(2, warnings.size());
        assertTrue(warnings.get(0).contains("orders_ro"));
        assertTrue(warnings.get(0).contains("400"));
        assertTrue(warnings.get(1).contains("orders_filter"));
        assertTrue(warnings.get(1).contains("500"));
    }

    /** 部分失败（一成一败）：synced=[成功项]、skipped=[失败项]，守恒式成立，失败明细进 warnings。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 别名部分失败时_synced为成功项_skipped为失败项_守恒() {
        ScriptedSync sync = stub();
        sync.aliasStatuses.clear();
        sync.aliasStatuses.addAll(java.util.Arrays.asList(200, 400));
        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null, false, true);

        assertEquals(Boolean.TRUE, out.get("created"));
        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertEquals(java.util.Collections.singletonList("orders_ro"), aliases.get("synced"));
        assertEquals(java.util.Collections.singletonList("orders_filter"), aliases.get("skipped"));
        List<?> synced = (List<?>) aliases.get("synced");
        List<?> skipped = (List<?>) aliases.get("skipped");
        assertEquals("守恒：skipped+synced=源别名总数", 2, synced.size() + skipped.size());
        List<String> warnings = (List<String>) out.get("warnings");
        assertEquals(1, warnings.size());
        assertTrue(warnings.get(0).contains("orders_filter"));
        assertTrue(warnings.get(0).contains("400"));
    }

    /** 源无别名时 syncAliases=true 是无操作（无 POST、synced/skipped 均空）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 源无别名时随迁为无操作() {
        ScriptedSync sync = stub();
        sync.getSource.put("/legacy_orders/_alias", "{\"legacy_orders\":{\"aliases\":{}}}");
        Map<String, Object> out = sync.syncStructure(conn(), "legacy_orders", null, null, false, true);
        assertEquals(0, sync.postAliasBodies.size());
        Map<String, Object> aliases = (Map<String, Object>) out.get("aliases");
        assertTrue(((List<?>) aliases.get("skipped")).isEmpty());
        assertTrue(((List<?>) aliases.get("synced")).isEmpty());
    }

    /* ───────── 桩 ───────── */

    private static ScriptedSync stub() {
        ScriptedSync sync = new ScriptedSync();
        sync.getSource.put("/", versionJson("7.10.2"));
        sync.getSource.put("/legacy_orders/_settings?flat_settings=true",
                "{\"legacy_orders\":{\"settings\":{\"index.number_of_shards\":\"1\"}}}");
        sync.getSource.put("/legacy_orders/_mapping",
                "{\"legacy_orders\":{\"mappings\":{\"properties\":{}}}}");
        sync.getSource.put("/legacy_orders/_alias", ALIAS_JSON);
        sync.targetGet.put("/", versionJson("7.10.2"));
        sync.putStatuses.add(200);
        sync.putErrors.add("");
        return sync;
    }

    private static class ScriptedSync extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final List<Integer> putStatuses = new ArrayList<>();
        final List<String> putErrors = new ArrayList<>();
        final List<String> putBodies = new ArrayList<>();
        final List<String> postAliasBodies = new ArrayList<>();
        final List<Integer> aliasStatuses = new ArrayList<>(java.util.Arrays.asList(200, 200));
        private int putCall;
        private int aliasCall;

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
            int idx = Math.min(aliasCall, aliasStatuses.size() - 1);
            aliasCall++;
            return new StructureSyncService.PutResult(aliasStatuses.get(idx), "{\"acknowledged\":true}");
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

    private static String versionJson(String number) {
        return "{\"version\":{\"number\":\"" + number + "\",\"distribution\":\"default\"}}";
    }
}
