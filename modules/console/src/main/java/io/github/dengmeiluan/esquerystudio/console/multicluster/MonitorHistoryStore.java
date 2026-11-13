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

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 多集群监控历史读侧（20260922 批④前端配套）：查询 {@code esquerystudio_monitor-yyyy.MM.dd}
 * 日期索引族（写入方= {@link MonitorSnapshotRecorder} 服务端定时任务，本类纯只读）。
 *
 * <p>查询形态与审计快筛同构：目标 {@code <前缀>-*} 日期通配（时间范围天然只打命中日期分片）、
 * 全部筛选落 {@code bool.filter} 非评分上下文（变异锚=产物不含 {@code "must"}；注意
 * {@code "must_not"} 不含裸 {@code "must"} 子串，锚不破）、timestamp 倒序、size 钳制 ≤500；
 * 映射已契约化（keyword/long），term 精确直查。空档（无任何日期索引）404 → 空列表。</p>
 *
 * <p><b>同族混杂剔除</b>：同一日期索引族现混居三类 doc——探活快照（无 kind 键）、
 * 指标（kind=metrics）、告警（kind=alert，见 {@link ClusterMetricsCollector#evaluateAlerts}）。
 * 本类只服务探活历史面板，查询体恒带
 * {@code must_not:[{term:{kind:"metrics"}},{term:{kind:"alert"}}]}——后两类带 kind 键被
 * term 精确排除，探活 doc 无 kind 键在 must_not term 下天然放行。</p>
 *
 * @author aicoding
 */
public class MonitorHistoryStore {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final java.util.function.Supplier<RestHighLevelClient> client;
    private final String indexPrefix;

    public MonitorHistoryStore(java.util.function.Supplier<RestHighLevelClient> client, String indexPrefix) {
        this.client = client;
        this.indexPrefix = indexPrefix;
    }

    /**
     * 监控历史查询（timestamp 倒序；恒带 must_not 剔除同族混居的 kind=metrics/alert doc）。
     *
     * @param connId 连接过滤（null/空=不过滤）
     * @param status 状态过滤（GREEN/RED，null/空=不过滤）
     * @param size   最大条数（钳制 ≤500）
     * @param from   起始偏移
     * @param fromMs 时间下界（毫秒 epoch，null=不限）
     * @param toMs   时间上界（毫秒 epoch，null=不限）
     * @return 快照 doc 列表（键与 {@link MonitorSnapshotRecorder} 落档键一一对应；空档回空列表）
     */
    public List<Map<String, Object>> search(String connId, String status, int size, int from,
                                            Long fromMs, Long toMs) {
        try {
            String body = buildSearchBody(connId, status, size, from, fromMs, toMs);
            Request req = new Request("POST", "/" + indexPrefix + "-*/_search");
            req.setJsonEntity(body);
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            return toRecords(raw);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>();
            }
            throw new IllegalStateException("监控历史查询失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("监控历史查询失败: " + e.getMessage(), e);
        }
    }

    /** 同族混杂剔除子句（恒带）：带 kind 键的 metrics/alert doc 被排除，无 kind 键的探活 doc 放行。 */
    private static final String KIND_EXCLUDE =
            "\"must_not\":[{\"term\":{\"kind\":\"metrics\"}},{\"term\":{\"kind\":\"alert\"}}]";

    /**
     * 查询体组装（包内可见=可测；变异锚：纯过滤场景产物不含 {@code "must"}——
     * {@code "must_not"} 不含该裸子串）。无筛选时不再裸 {@code match_all}：
     * 必须恒带 kind 剔除，否则同族混居的指标/告警 doc 会串进探活历史面板。
     */
    static String buildSearchBody(String connId, String status, int size, int from, Long fromMs, Long toMs) {
        List<String> filters = new ArrayList<>();
        try {
            if (connId != null && !connId.isEmpty()) {
                filters.add("{\"term\":{\"connId\":" + MAPPER.writeValueAsString(connId) + "}}");
            }
            if (status != null && !status.isEmpty()) {
                filters.add("{\"term\":{\"status\":" + MAPPER.writeValueAsString(status) + "}}");
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        if (fromMs != null || toMs != null) {
            StringBuilder range = new StringBuilder("{");
            if (fromMs != null) {
                range.append("\"gte\":").append(fromMs);
            }
            if (toMs != null) {
                range.append(range.length() > 1 ? "," : "").append("\"lte\":").append(toMs);
            }
            range.append('}');
            filters.add("{\"range\":{\"timestamp\":" + range + "}}");
        }
        String query = filters.isEmpty()
                ? "{\"bool\":{" + KIND_EXCLUDE + "}}"
                : "{\"bool\":{\"filter\":[" + String.join(",", filters) + "]," + KIND_EXCLUDE + "}}";
        return "{\"size\":" + Math.min(Math.max(size, 1), 500)
                + ",\"from\":" + Math.max(from, 0)
                + ",\"sort\":[{\"timestamp\":{\"order\":\"desc\"}}],\"query\":" + query + "}";
    }

    /** ES 响应 → 快照 doc 列表（_source 键与落档键一一对应，原样透传；缺 hits 回空列表）。 */
    static List<Map<String, Object>> toRecords(Map<String, Object> esResponse) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (esResponse == null || !(esResponse.get("hits") instanceof Map)) {
            return out;
        }
        Object hits = ((Map<?, ?>) esResponse.get("hits")).get("hits");
        if (!(hits instanceof List)) {
            return out;
        }
        for (Object o : (List<?>) hits) {
            if (o instanceof Map && ((Map<?, ?>) o).get("_source") instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> src = (Map<String, Object>) ((Map<?, ?>) o).get("_source");
                out.add(src);
            }
        }
        return out;
    }
}
