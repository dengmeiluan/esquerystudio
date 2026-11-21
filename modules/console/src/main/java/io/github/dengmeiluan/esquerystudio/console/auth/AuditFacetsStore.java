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

package io.github.dengmeiluan.esquerystudio.console.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 审计下拉值建议（ terms agg）：对审计日期索引族跑 terms 聚合，给安全中心
 * 动作/集群下拉提供「数据里真实出现过」的值与计数（替代硬编码词表）。
 *
 * <p>只读；404/失败 → 空建议（前端回落硬编码词表，绝不反噬）。VIEWER 可用
 * （值=审计维度枚举，无敏感内容）。</p>
 *
 * @author aicoding
 */
public class AuditFacetsStore {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final java.util.function.Supplier<RestHighLevelClient> client;
    private final String indexPrefix;

    public AuditFacetsStore(java.util.function.Supplier<RestHighLevelClient> client, String indexPrefix) {
        this.client = client;
        this.indexPrefix = indexPrefix;
    }

    /** 动作/集群/用户/URI 四 facets（terms 各 20；无日期索引 404 → 空）。包内可见=测点走 buildFacetsBody。 */
    public Map<String, Object> facets() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("actions", new ArrayList<>());
        out.put("conns", new ArrayList<>());
        out.put("users", new ArrayList<>());
        out.put("uris", new ArrayList<>());
        try {
            Request req = new Request("POST", "/" + indexPrefix + "-*/_search");
            req.setJsonEntity(buildFacetsBody());
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            Map<String, Object> aggs = raw.get("aggregations") instanceof Map
                    ? (Map<String, Object>) raw.get("aggregations") : null;
            if (aggs == null) {
                return out;
            }
            out.put("actions", buckets(aggs, "by_action"));
            out.put("conns", buckets(aggs, "by_conn"));
            out.put("users", buckets(aggs, "by_user"));
            out.put("uris", buckets(aggs, "by_uri"));
            return out;
        } catch (Exception e) {
            return out; /* 值建议是锦上添花：失败回空，前端回落硬编码词表 */
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> buckets(Map<String, Object> aggs, String name) {
        List<Map<String, Object>> out = new ArrayList<>();
        Object agg = aggs.get(name);
        Object buckets = agg instanceof Map ? ((Map<?, ?>) agg).get("buckets") : null;
        if (!(buckets instanceof List)) {
            return out;
        }
        for (Object b : (List<?>) buckets) {
            if (b instanceof Map) {
                Map<String, Object> bucket = (Map<String, Object>) b;
                Object key = bucket.get("key");
                Object count = bucket.get("doc_count");
                if (key != null) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("key", String.valueOf(key));
                    if (count instanceof Number) {
                        item.put("count", ((Number) count).longValue());
                    }
                    out.add(item);
                }
            }
        }
        return out;
    }

    /** facets 聚合体（static=测点）：action/connName/username/uri 四 terms 各 20；must_not 排除指标/告警 doc（同族混居，计数只算探活）。
     *  by_uri=真实 URI Top20（uri 前缀筛选的值建议源——高基数无法前缀聚合，用真实 Top 值兜建议）。 */
    static String buildFacetsBody() {
        return "{\"size\":0,\"query\":{\"bool\":{\"must_not\":["
                + "{\"term\":{\"kind\":\"metrics\"}},{\"term\":{\"kind\":\"alert\"}}]}},"
                + "\"aggs\":{\"by_action\":{\"terms\":{\"field\":\"action\",\"size\":20}},"
                + "\"by_conn\":{\"terms\":{\"field\":\"connName\",\"size\":20}},"
                + "\"by_user\":{\"terms\":{\"field\":\"username\",\"size\":20}},"
                + "\"by_uri\":{\"terms\":{\"field\":\"uri\",\"size\":20}}}}";
    }
}
