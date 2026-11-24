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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * smart_sync 计划复用经真实结构同步引擎的全流程：预览计划落盘 → 按计划保存的参数重跑执行形态。
 * 漂移门与 smart_sync apply 完全一致（两次调用之间源结构变化即「计划摘要不匹配，拒绝执行」，发生在
 * 任何 PUT 之前，执行记账不动）；未漂移则落盘成功并回写 appliedAtMs/appliedCount。服务自带的计划
 * 存储在控制集群 client 不可用时降级为进程内形态，不阻断预览。
 * 纯 JUnit 路径表桩（假远端 client 只提供 low-level 句柄，请求全部被覆写），不触真实集群。
 */
public class SmartSyncPlanApplyTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── 落盘 → 按计划执行 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 预览计划落盘_未漂移按计划执行APPLIED并记账() throws Exception {
        ScriptedSmart sync = stubSmart();
        Map<String, Object> preview = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                true, "ik_max_word", true, false, null, "create");
        /* 服务自带的存储：控制集群 client 不可用 → 写降级进程内形态，预览照常返回 */
        PlanStore store = sync.planStore();
        PlanRecord plan = store.savePlan("src-1", "orders", "host", "orders_v2",
                true, "ik_max_word", true, preview);
        assertThat(plan.getPlanDigest()).isEqualTo(preview.get("planDigest"));
        assertThat((List<String>) preview.get("warnings"))
                .anyMatch(w -> w.contains("仅保留在当前进程内"));

        PlanRecord loaded = store.find(plan.getPlanId());
        Map<String, Object> out = store.apply(loaded, null, gate -> sync.smartSync("src-1", conn(),
                loaded.getSourceIndex(), loaded.getDestConnId(), null, loaded.getDestIndex(),
                loaded.getSyncAliases(), loaded.getFallbackAnalyzer(), loaded.getAutoTune(),
                true, gate, loaded.getMode()));

        assertThat(out).containsEntry("verdict", "APPLIED").containsEntry("applied", true)
                .containsEntry("planId", plan.getPlanId());
        assertThat(sync.putBodies).hasSize(1);
        PlanRecord after = store.find(plan.getPlanId());
        assertThat(after.getAppliedCount()).isEqualTo(1);
        assertThat(after.getAppliedAtMs()).isGreaterThan(0L);
        assertThat(after.getMode()).isEqualTo("create");
        assertThat(after.getSyncAliases()).isTrue();
        assertThat(after.getFallbackAnalyzer()).isEqualTo("ik_max_word");
        @SuppressWarnings("unchecked")
        Map<String, Object> snapshot = MAPPER.readValue(after.getSnapshot(), Map.class);
        assertThat(snapshot).containsEntry("verdict", "PLANNED").containsKey("planned").containsKey("body");
    }

    @Test
    public void 预览计划落盘_源结构漂移按计划执行被漂移门拒绝_零写不记账() {
        ScriptedSmart sync = stubSmart();
        sync.setPlanStore(new PlanStore());
        Map<String, Object> preview = sync.smartSync("src-1", conn(), "orders", "host", null, "orders_v2",
                false, null, false, false, null, "create");
        PlanStore store = sync.planStore();
        PlanRecord plan = store.savePlan("src-1", "orders", "host", "orders_v2", false, null, false, preview);

        /* 两次调用之间源结构变化：settings 新增一键 */
        sync.getSource.put("/orders/_settings?flat_settings=true", ordersBody("settings", map(
                "index.number_of_shards", "1",
                "index.apack.knn", "true",
                "index.refresh_interval", "30s",
                "index.analysis", map("tokenizer", map("my_ik", map("type", "ik_max_word"))))));

        assertThatThrownBy(() -> store.apply(plan, null, gate -> sync.smartSync("src-1", conn(),
                plan.getSourceIndex(), plan.getDestConnId(), null, plan.getDestIndex(),
                plan.getSyncAliases(), plan.getFallbackAnalyzer(), plan.getAutoTune(),
                true, gate, plan.getMode())))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("计划摘要不匹配，拒绝执行")
                .hasMessageContaining(plan.getPlanDigest())
                .hasMessageContaining("source structure drifted");
        assertThat(sync.putBodies).as("漂移拒绝发生在 PUT 之前").isEmpty();
        assertThat(store.find(plan.getPlanId()).getAppliedCount()).isEqualTo(0);
        assertThat(store.find(plan.getPlanId()).getAppliedAtMs()).isNull();
    }

    /* ───────── 桩与工具 ───────── */

    /** 宿主目标的最小桩：源 aliyun(apack)+ik 引用 → 矩阵剔 apack、剔 ik 组件并降级字段。 */
    private static ScriptedSmart stubSmart() {
        ScriptedSmart sync = new ScriptedSmart();
        sync.getSource.put("/", versionJson("6.8.5", "apack"));
        sync.getSource.put("/_nodes/plugins", pluginsJson("analysis-ik", "apack-aliws"));
        sync.getSource.put("/orders/_settings?flat_settings=true", ordersBody("settings", map(
                "index.number_of_shards", "1",
                "index.apack.knn", "true",
                "index.analysis", map("tokenizer", map("my_ik", map("type", "ik_max_word"))))));
        sync.getSource.put("/orders/_mapping",
                ordersBody("mappings", map("properties",
                        map("title", map("type", "text", "analyzer", "ik_max_word")))));
        sync.getSource.put("/orders/_alias", ordersBody("aliases", map()));
        sync.targetGet.put("/", versionJson("7.10.2", "default"));
        sync.targetGet.put("/_nodes/plugins", pluginsJson("analysis-pinyin"));
        sync.targetGet.put("/_cluster/health", "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
        sync.putStatuses.add(200);
        sync.putErrors.add("");
        return sync;
    }

    /**
     * 路径表桩：源/宿主目标两通道各自按路径回放 JSON；宿主 PUT 与别名写分别记录请求体。
     * 远端 client 为本地假句柄（不触网）——所有请求均被覆写点拦截。
     */
    private static class ScriptedSmart extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final List<Integer> putStatuses = new ArrayList<>();
        final List<String> putErrors = new ArrayList<>();
        final List<String> putBodies = new ArrayList<>();
        final List<String> postAliasBodies = new ArrayList<>();
        private int putCall;

        ScriptedSmart() {
            super(() -> {
                throw new RuntimeException("local-client-must-not-be-touched");
            }, new EsIndexAdmin(null), new RemoteEsClientFactory(1000, 1000) {
                @Override
                public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                    /* 假 client：仅提供 low-level 句柄（sourceGet/targetGet 均已覆写，不会真正触网） */
                    return new org.elasticsearch.client.RestHighLevelClient(
                            RestClient.builder(new HttpHost("127.0.0.1", 1)));
                }
            });
        }

        @Override
        Map<String, Object> sourceGet(RestClient ll, String path) {
            if (path.endsWith("/_alias") && !getSource.containsKey(path)) {
                return jsonMap("{\"orders\":{\"aliases\":{}}}");
            }
            return jsonMap(getSource.get(path));
        }

        @Override
        Map<String, Object> targetGet(String path) {
            return jsonMap(targetGet.get(path));
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

    private static Map<String, Object> jsonMap(String raw) {
        if (raw == null) {
            throw new IllegalStateException("桩缺少响应");
        }
        try {
            return MAPPER.readValue(raw, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("桩响应不是合法 JSON", e);
        }
    }

    /** {@code {orders:{section:value}}} 形态的索引级响应（settings/mapping/alias 共用）。 */
    private static String ordersBody(String section, Object value) {
        Map<String, Object> idx = new LinkedHashMap<>();
        idx.put(section, value);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("orders", idx);
        return json(root);
    }

    private static String json(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
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
