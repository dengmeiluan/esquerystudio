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

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 控制集群 ES 版共享配额（默认档）。
 *
 * <p>每个 key 一条计数文档；用 {@code if_seq_no/if_primary_term} 做乐观并发 CAS：
 * 读快照 → 纯规则判定 → 带版本号回写，409 重试。多实例并发时「检查 + 自增」
 * 以最后一次成功 CAS 为准，配额不会被实例数放大。索引默认
 * {@code esquerystudio_mcp_quota}。</p>
 */
public class EsMcpQuotaStore implements McpQuotaStore {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_CAS_ATTEMPTS = 8;

    private final Supplier<RestHighLevelClient> controlClient;
    private final String index;

    public EsMcpQuotaStore(Supplier<RestHighLevelClient> controlClient, String index) {
        this.controlClient = controlClient;
        this.index = index == null || index.trim().isEmpty() ? "esquerystudio_mcp_quota" : index.trim();
    }

    @Override
    public Decision consume(String keyId, int rpm, long dailyQuota, long monthlyQuota, long nowMs) {
        if (keyId == null || keyId.isEmpty()) throw new IllegalArgumentException("quota keyId required");
        for (int attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
            Snapshot snapshot = readSnapshot(keyId);
            State state = snapshot.state;
            Decision decision = McpQuotaRules.decide(state, rpm, dailyQuota, monthlyQuota, nowMs);
            String body = encode(decision.state, nowMs);
            try {
                if (snapshot.seqNo == null) {
                    Request req = new Request("PUT", "/" + index + "/_create/" + keyId);
                    req.setJsonEntity(body);
                    controlClient.get().getLowLevelClient().performRequest(req);
                } else {
                    Request req = new Request("PUT", "/" + index + "/_doc/" + keyId
                            + "?if_seq_no=" + snapshot.seqNo + "&if_primary_term=" + snapshot.primaryTerm);
                    req.setJsonEntity(body);
                    controlClient.get().getLowLevelClient().performRequest(req);
                }
                return decision;
            } catch (ResponseException e) {
                int status = e.getResponse().getStatusLine().getStatusCode();
                if (status == 409) continue; /* 并发更新/并发首建：重读快照再判 */
                throw new IllegalStateException("MCP 配额消费失败(es): " + e.getMessage(), e);
            } catch (Exception e) {
                throw new IllegalStateException("MCP 配额消费失败(es): " + e.getMessage(), e);
            }
        }
        throw new IllegalStateException("MCP 配额消费失败(es): 并发冲突重试耗尽");
    }

    @Override
    public State counters(String keyId) {
        return readSnapshot(keyId).state;
    }

    private static final class Snapshot {
        Long seqNo;
        Long primaryTerm;
        final State state = new State();
    }

    private Snapshot readSnapshot(String keyId) {
        Snapshot snapshot = new Snapshot();
        try {
            Request req = new Request("GET", "/" + index + "/_doc/" + keyId + "?seq_no_primary_term=true");
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            Object seq = raw.get("_seq_no");
            Object term = raw.get("_primary_term");
            if (seq instanceof Number) snapshot.seqNo = ((Number) seq).longValue();
            if (term instanceof Number) snapshot.primaryTerm = ((Number) term).longValue();
            Object source = raw.get("_source");
            if (source instanceof Map) decode((Map<?, ?>) source, snapshot.state);
            return snapshot;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return snapshot;
            throw new IllegalStateException("读取 MCP 配额失败(es): " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 配额失败(es): " + e.getMessage(), e);
        }
    }

    private static void decode(Map<?, ?> source, State state) {
        state.windowStart = asLong(source.get("windowStartMs"));
        state.windowCount = asLong(source.get("windowCount"));
        state.dayKey = source.get("dayKey") == null ? "" : String.valueOf(source.get("dayKey"));
        state.dayCount = asLong(source.get("dayCount"));
        state.monthKey = source.get("monthKey") == null ? "" : String.valueOf(source.get("monthKey"));
        state.monthCount = asLong(source.get("monthCount"));
    }

    private static long asLong(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }

    private static String encode(State state, long nowMs) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("windowStartMs", state.windowStart);
        doc.put("windowCount", state.windowCount);
        doc.put("dayKey", state.dayKey);
        doc.put("dayCount", state.dayCount);
        doc.put("monthKey", state.monthKey);
        doc.put("monthCount", state.monthCount);
        doc.put("updatedAtMs", nowMs);
        try {
            return MAPPER.writeValueAsString(doc);
        } catch (Exception e) {
            throw new IllegalStateException("序列化 MCP 配额失败: " + e.getMessage(), e);
        }
    }
}
