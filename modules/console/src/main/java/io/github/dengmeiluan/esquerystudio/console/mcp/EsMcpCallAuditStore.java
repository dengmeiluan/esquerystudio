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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.util.EntityUtils;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 控制集群内的 MCP 调用审计存储：一次调用一条文档，按 {@code at} 保留。
 *
 * <p>索引名默认 {@code esquerystudio_mcp_audit}，与 key 索引分开，避免 key 文档被
 * 高频调用撑大。写入失败只告警，不影响工具本身的执行结果。</p>
 */
public class EsMcpCallAuditStore implements McpCallAuditStore {

    private static final Logger LOG = LoggerFactory.getLogger(EsMcpCallAuditStore.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Supplier<RestHighLevelClient> controlClient;
    private final String index;
    private final int retentionDays;
    private volatile long lastWarnAt;

    public EsMcpCallAuditStore(Supplier<RestHighLevelClient> controlClient, String index, int retentionDays) {
        this.controlClient = controlClient;
        this.index = index == null || index.trim().isEmpty() ? "esquerystudio_mcp_audit" : index.trim();
        this.retentionDays = Math.max(7, retentionDays);
    }

    @Override
    public void append(McpKeyRecord key, Map<String, Object> call) {
        if (key == null || call == null) return;
        Map<String, Object> doc = new LinkedHashMap<>(call);
        doc.put("keyId", key.id);
        doc.put("keyName", key.name);
        doc.put("keyPrefix", key.prefix);
        doc.put("owner", key.owner);
        doc.put("role", key.role);
        try {
            Request req = new Request("POST", "/" + index + "/_doc?refresh=false");
            req.setJsonEntity(MAPPER.writeValueAsString(doc));
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            long now = System.currentTimeMillis();
            if (now - lastWarnAt > 60_000L) {
                lastWarnAt = now;
                LOG.warn("[mcp-audit] 调用审计写入失败（60s 内不再重复）：{}", e.getMessage(), e);
            }
        }
    }

    @Override
    public List<Map<String, Object>> list(String keyId, int limit) {
        try {
            int size = Math.max(1, Math.min(limit <= 0 ? 500 : limit, 5000));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("size", size);
            Map<String, Object> range = new LinkedHashMap<>();
            range.put("at", java.util.Collections.singletonMap("gte",
                    System.currentTimeMillis() - retentionDays * 86_400_000L));
            if (keyId != null && !keyId.trim().isEmpty()) {
                Map<String, Object> bool = new LinkedHashMap<>();
                bool.put("filter", java.util.Arrays.asList(
                        java.util.Collections.singletonMap("term",
                                java.util.Collections.singletonMap("keyId", keyId.trim())),
                        java.util.Collections.singletonMap("range", range)));
                body.put("query", java.util.Collections.singletonMap("bool", bool));
            } else {
                body.put("query", java.util.Collections.singletonMap("range", range));
            }
            body.put("sort", java.util.Collections.singletonList(
                    java.util.Collections.singletonMap("at", java.util.Collections.singletonMap("order", "desc"))));
            Request req = new Request("POST", "/" + index + "/_search");
            req.setJsonEntity(MAPPER.writeValueAsString(body));
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            return readHits(raw);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return new ArrayList<>();
            LOG.warn("[mcp-audit] 查询调用审计失败：{}", e.getMessage(), e);
            return new ArrayList<>();
        } catch (Exception e) {
            LOG.warn("[mcp-audit] 查询调用审计失败：{}", e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    @Override
    public int prune(long beforeMillis) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("query", java.util.Collections.singletonMap("range",
                    java.util.Collections.singletonMap("at", java.util.Collections.singletonMap("lt", beforeMillis))));
            Request req = new Request("POST", "/" + index + "/_delete_by_query?conflicts=proceed&refresh=false");
            req.setJsonEntity(MAPPER.writeValueAsString(body));
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            Object deleted = raw.get("deleted");
            return deleted instanceof Number ? ((Number) deleted).intValue() : 0;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return 0;
            LOG.warn("[mcp-audit] 清理过期审计失败：{}", e.getMessage(), e);
            return 0;
        } catch (Exception e) {
            LOG.warn("[mcp-audit] 清理过期审计失败：{}", e.getMessage(), e);
            return 0;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readHits(Map<String, Object> raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        Object hitsWrap = raw.get("hits");
        if (!(hitsWrap instanceof Map)) return out;
        Object hits = ((Map<?, ?>) hitsWrap).get("hits");
        if (!(hits instanceof List)) return out;
        for (Object hit : (List<?>) hits) {
            if (!(hit instanceof Map)) continue;
            Object source = ((Map<?, ?>) hit).get("_source");
            if (source instanceof Map) out.add((Map<String, Object>) source);
        }
        return out;
    }
}
