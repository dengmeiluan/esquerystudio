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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 20260922 批④前端配套：监控历史读侧——筛选下推查询体契约（变异锚：全程 filter 上下文
 * 不含 "must"；"must_not" 不含裸 "must" 子串，锚不破）+ 同族混杂剔除（must_not 剔除
 * kind=metrics/alert doc）+ 日期通配目标 + 404 空档回空 + EsFakeClients 脚本桩端到端。
 */
public class MonitorHistoryStoreTest {

    private static final String PREFIX = "esquerystudio_monitor";

    @Test
    public void buildSearchBody_全维筛选落bool_filter() {
        String body = MonitorHistoryStore.buildSearchBody("7bdac680", "GREEN", 100, 0, 100L, 200L);
        assertTrue(body.contains("{\"bool\":{\"filter\":["));
        assertTrue(body.contains("{\"term\":{\"connId\":\"7bdac680\"}}"));
        assertTrue(body.contains("{\"term\":{\"status\":\"GREEN\"}}"));
        assertTrue(body.contains("{\"range\":{\"timestamp\":{\"gte\":100,\"lte\":200}}}"));
        assertTrue(body.contains("\"sort\":[{\"timestamp\":{\"order\":\"desc\"}}]"));
        assertTrue("同族混杂剔除：kind=metrics/alert doc 不得串进探活历史面板",
                body.contains("\"must_not\":[{\"term\":{\"kind\":\"metrics\"}},{\"term\":{\"kind\":\"alert\"}}]"));
        assertFalse("纯过滤场景不得出现评分上下文（must_not 不含裸 must 子串，锚不破）",
                body.contains("\"must\""));
    }

    @Test
    public void buildSearchBody_空参_仍恒带must_not剔除() {
        String body = MonitorHistoryStore.buildSearchBody(null, null, 100, 0, null, null);
        assertTrue("无筛选也走 bool（恒带 kind 剔除，不再裸 match_all）",
                body.contains("\"query\":{\"bool\":{\"must_not\":"
                        + "[{\"term\":{\"kind\":\"metrics\"}},{\"term\":{\"kind\":\"alert\"}}]}}}"));
        assertFalse("裸 match_all 会把同族混居的指标/告警 doc 全查出来（混杂缺陷）",
                body.contains("match_all"));
    }

    @Test
    public void buildSearchBody_分页钳制() {
        assertTrue(MonitorHistoryStore.buildSearchBody(null, null, 9999, 0, null, null).contains("\"size\":500"));
        assertTrue(MonitorHistoryStore.buildSearchBody(null, null, 0, -3, null, null)
                .contains("\"size\":1"));
        assertTrue(MonitorHistoryStore.buildSearchBody(null, null, 0, -3, null, null)
                .contains("\"from\":0"));
    }

    /** 端到端：查询目标={前缀}-* 日期通配，响应 _source 透传为记录列表。 */
    @Test
    public void search_日期通配目标_记录透传() throws Exception {
        List<String> paths = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            paths.add(req.getMethod() + " " + req.getEndpoint());
            return "{\"hits\":{\"hits\":["
                    + "{\"_source\":{\"timestamp\":1,\"connId\":\"a\",\"connName\":\"生产集群\",\"env\":\"PROD\","
                    + "\"status\":\"GREEN\",\"latencyMs\":12,\"esVersion\":\"7.10.0\"}},"
                    + "{\"_source\":{\"timestamp\":2,\"connId\":\"b\",\"connName\":\"腾讯云QA\",\"env\":\"QA\","
                    + "\"status\":\"RED\",\"error\":\"timeout\"}}]}}";
        });
        MonitorHistoryStore store = new MonitorHistoryStore(() -> client, PREFIX);
        List<Map<String, Object>> out = store.search(null, "GREEN", 100, 0, null, null);
        assertEquals(2, out.size());
        assertEquals("a", out.get(0).get("connId"));
        assertEquals("RED", out.get(1).get("status"));
        assertEquals(1, paths.size());
        assertTrue("目标必须是日期通配", paths.get(0).startsWith("POST /" + PREFIX + "-*/_search"));
    }

    /** 空档契约：无任何日期索引时 404 → 空列表不抛。 */
    @Test
    public void search_404空档回空列表() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            throw EsFakeClients.responseException(404,
                    "{\"error\":{\"type\":\"index_not_found_exception\",\"reason\":\"no such index\"}}");
        });
        MonitorHistoryStore store = new MonitorHistoryStore(() -> client, PREFIX);
        assertTrue(store.search(null, null, 100, 0, null, null).isEmpty());
    }

    /**
     * 同族混杂剔除端到端：同族日期索引罐头场景含 kind=metrics 指标 doc——发出的查询体恒带
     * must_not 剔除；回包=ES 执行剔除后的形态，结果里不再出现 kind=metrics/alert doc。
     */
    @Test
    public void search_同族混杂_kind为metrics的doc不出现在结果() throws Exception {
        List<String> sentBodies = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            sentBodies.add(req.getEntity() == null ? ""
                    : org.apache.http.util.EntityUtils.toString(req.getEntity()));
            return "{\"hits\":{\"hits\":["
                    + "{\"_source\":{\"timestamp\":1,\"connId\":\"a\",\"connName\":\"生产集群\",\"env\":\"PROD\","
                    + "\"status\":\"GREEN\",\"latencyMs\":12,\"esVersion\":\"7.10.0\"}},"
                    + "{\"_source\":{\"timestamp\":2,\"connId\":\"a\",\"connName\":\"生产集群\",\"env\":\"PROD\","
                    + "\"status\":\"RED\",\"error\":\"timeout\"}}]}}";
        });
        MonitorHistoryStore store = new MonitorHistoryStore(() -> client, PREFIX);
        List<Map<String, Object>> out = store.search(null, null, 100, 0, null, null);
        assertEquals(2, out.size());
        for (Map<String, Object> rec : out) {
            assertFalse("结果不含 kind=metrics 的指标 doc", "metrics".equals(rec.get("kind")));
            assertFalse("结果不含 kind=alert 的告警 doc", "alert".equals(rec.get("kind")));
        }
        assertTrue("发出的查询体带 must_not 剔除（同族混居 metrics/alert）",
                sentBodies.get(0).contains(
                        "\"must_not\":[{\"term\":{\"kind\":\"metrics\"}},{\"term\":{\"kind\":\"alert\"}}]"));
    }
}
