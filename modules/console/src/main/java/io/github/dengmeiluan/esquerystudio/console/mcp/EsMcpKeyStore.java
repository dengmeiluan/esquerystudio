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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * 控制集群内的 MCP key 存储（默认实现）。
 *
 * <p>索引由首次写入自动创建；认证只认 SHA-256 摘要，完整 key 以 AES-256-GCM 密文
 * 保存在 {@code secretEncrypted}，管理面校验权限后可再次取回。认证缓存 5 秒，
 * 撤销/签发后本实例立即失效；多实例部署的撤销传播最多 5 秒，
 * 需要强一致时请把本 SPI 换成数据库实现。</p>
 */
public class EsMcpKeyStore implements McpKeyStore {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long CACHE_TTL_MS = 5000L;

    private final Supplier<RestHighLevelClient> controlClient;
    private final String index;
    private final McpSecretCipher cipher;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public EsMcpKeyStore(Supplier<RestHighLevelClient> controlClient, String index) {
        this(controlClient, index, null);
    }

    public EsMcpKeyStore(Supplier<RestHighLevelClient> controlClient, String index, McpSecretCipher cipher) {
        this.controlClient = controlClient;
        this.index = index == null || index.trim().isEmpty() ? "esquerystudio_mcp_keys" : index.trim();
        this.cipher = cipher;
    }

    @Override
    public List<Map<String, Object>> list() {
        try {
            Request req = new Request("POST", "/" + index + "/_search");
            req.setJsonEntity("{\"size\":500,\"query\":{\"match_all\":{}},\"sort\":[{\"createdAt\":{\"order\":\"desc\"}}]}");
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            List<Map<String, Object>> out = new ArrayList<>();
            for (McpKeyRecord record : readHits(raw)) out.add(record.redacted(System.currentTimeMillis()));
            return out;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return new ArrayList<>();
            throw new IllegalStateException("读取 MCP 密钥失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 密钥失败: " + e.getMessage(), e);
        }
    }

    @Override
    public Map<String, Object> create(String name, String owner, String role, List<String> allowedTools,
                                      List<String> connections, List<String> permissions,
                                      Map<String, List<String>> connectionPermissions,
                                      int requestsPerMinute, long dailyQuota, long monthlyQuota, Long expiresAt) {
        McpKeyRecord record = new McpKeyRecord();
        record.id = McpKeyRecord.newId();
        record.prefix = "esq_mcp_" + record.id;
        record.name = name;
        record.owner = owner;
        record.role = role;
        record.allowedTools = new ArrayList<>(allowedTools);
        record.connections = connections == null || connections.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("host")) : new ArrayList<>(connections);
        record.permissions = permissions == null || permissions.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("read")) : new ArrayList<>(permissions);
        record.connectionPermissions = copyPermissions(connectionPermissions);
        record.requestsPerMinute = requestsPerMinute;
        record.dailyQuota = dailyQuota;
        record.monthlyQuota = monthlyQuota;
        record.expiresAt = expiresAt;
        record.createdAt = System.currentTimeMillis();
        String secret = record.prefix + "." + McpKeyRecord.newSecret();
        record.keyHash = McpKeyRecord.sha256Hex(secret);
        record.secretEncrypted = cipher == null ? null : cipher.encrypt(secret);
        try {
            put(record, true);
        } catch (Exception e) {
            throw new IllegalStateException("保存 MCP 密钥失败: " + e.getMessage(), e);
        }
        cache.put(record.keyHash, new CacheEntry(record, System.currentTimeMillis()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", record.redacted(record.createdAt));
        out.put("secret", secret);
        return out;
    }

    @Override
    public Map<String, Object> create(String name, String owner, String role, List<String> allowedTools,
                                      List<String> connections, List<String> permissions,
                                      int requestsPerMinute, long dailyQuota, long monthlyQuota, Long expiresAt) {
        return create(name, owner, role, allowedTools, connections, permissions,
                java.util.Collections.<String, List<String>>emptyMap(),
                requestsPerMinute, dailyQuota, monthlyQuota, expiresAt);
    }

    @Override
    public Map<String, Object> update(String id, String name, List<String> allowedTools,
                                      List<String> connections, List<String> permissions,
                                      Map<String, List<String>> connectionPermissions,
                                      int requestsPerMinute, long dailyQuota, long monthlyQuota,
                                      Long expiresAt) {
        McpKeyRecord record = find(id);
        if (record == null || !record.enabled) return null;
        record.name = name;
        record.allowedTools = new ArrayList<>(allowedTools);
        record.connections = connections == null || connections.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("host")) : new ArrayList<>(connections);
        record.permissions = permissions == null || permissions.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("read")) : new ArrayList<>(permissions);
        record.connectionPermissions = copyPermissions(connectionPermissions);
        record.requestsPerMinute = requestsPerMinute;
        record.dailyQuota = dailyQuota;
        record.monthlyQuota = monthlyQuota;
        record.expiresAt = expiresAt;
        try {
            put(record, true);
        } catch (Exception e) {
            throw new IllegalStateException("更新 MCP 密钥失败: " + e.getMessage(), e);
        }
        invalidate();
        return record.redacted(System.currentTimeMillis());
    }

    @Override
    public boolean revoke(String id) {
        McpKeyRecord record = find(id);
        if (record == null) return false;
        record.enabled = false;
        record.revokedAt = System.currentTimeMillis();
        try {
            put(record, true);
        } catch (Exception e) {
            throw new IllegalStateException("撤销 MCP 密钥失败: " + e.getMessage(), e);
        }
        invalidate();
        return true;
    }

    @Override
    public Map<String, Object> rotate(String id) {
        McpKeyRecord record = find(id);
        if (record == null || !record.enabled) return null;
        String secret = record.prefix + "." + McpKeyRecord.newSecret();
        record.keyHash = McpKeyRecord.sha256Hex(secret);
        record.secretEncrypted = cipher == null ? null : cipher.encrypt(secret);
        try {
            put(record, true);
        } catch (Exception e) {
            throw new IllegalStateException("轮换 MCP 密钥失败: " + e.getMessage(), e);
        }
        invalidate();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", record.redacted(System.currentTimeMillis()));
        out.put("secret", secret);
        return out;
    }

    @Override
    public McpKeyRecord find(String id) {
        if (id == null || id.trim().isEmpty()) return null;
        try {
            Request req = new Request("GET", "/" + index + "/_doc/" + id.trim());
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            Object source = raw.get("_source");
            return source instanceof Map ? MAPPER.convertValue(source, McpKeyRecord.class) : null;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return null;
            throw new IllegalStateException("读取 MCP 密钥失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 密钥失败: " + e.getMessage(), e);
        }
    }

    @Override
    public McpKeyRecord authenticate(String secret) {
        if (secret == null || secret.trim().isEmpty()) return null;
        String hash = McpKeyRecord.sha256Hex(secret.trim());
        CacheEntry entry = cache.get(hash);
        long now = System.currentTimeMillis();
        if (entry != null && now - entry.loadedAt < CACHE_TTL_MS) return entry.record;
        try {
            Request req = new Request("POST", "/" + index + "/_search");
            req.setJsonEntity("{\"size\":1,\"query\":{\"term\":{\"keyHash\":\"" + hash + "\"}}}");
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            List<McpKeyRecord> records = readHits(raw);
            if (records.isEmpty()) return null;
            McpKeyRecord record = records.get(0);
            cache.put(hash, new CacheEntry(record, now));
            return record;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return null;
            throw new IllegalStateException("校验 MCP 密钥失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("校验 MCP 密钥失败: " + e.getMessage(), e);
        }
    }

    @Override
    public void updateUsage(McpKeyRecord record) {
        if (record == null || record.id == null) return;
        java.util.Map<String, Object> usage = usageDocument(record);
        try {
            Request req = new Request("POST", "/" + index + "/_update/" + record.id);
            req.setJsonEntity(MAPPER.writeValueAsString(java.util.Collections.singletonMap("doc", usage)));
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (ResponseException e) {
            int status = e.getResponse().getStatusLine().getStatusCode();
            if (status == 404 || status == 400) return; /* 索引/文档尚未落地：用量是增强信息 */
            throw new IllegalStateException("回写 MCP key 用量失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("回写 MCP key 用量失败: " + e.getMessage(), e);
        }
    }

    /** 只回写用量字段：绝不整份覆盖，否则并发中的 usage 写会把另一实例刚写入的
        enabled=false（撤销）重新盖回 true。抽成包可见方法便于门禁断言字段齐全。 */
    static java.util.Map<String, Object> usageDocument(McpKeyRecord record) {
        java.util.Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("lastUsedAt", record.lastUsedAt);
        usage.put("requestCount", record.requestCount);
        usage.put("errorCount", record.errorCount);
        usage.put("dayKey", record.dayKey);
        usage.put("dayCount", record.dayCount);
        usage.put("monthKey", record.monthKey);
        usage.put("monthCount", record.monthCount);
        usage.put("windowStart", record.windowStart);
        usage.put("windowCount", record.windowCount);
        usage.put("toolCounts", record.toolCounts == null ? new java.util.LinkedHashMap<>() : record.toolCounts);
        usage.put("recentCalls", record.recentCalls == null ? new java.util.ArrayList<>() : record.recentCalls);
        /* 近 7 天账本 / CSV 导出读的是 dailyCounts；只回写 dayKey/dayCount 会让图表永远为 0。 */
        usage.put("dailyCounts", record.dailyCounts == null ? new java.util.LinkedHashMap<>() : record.dailyCounts);
        usage.put("lastTool", record.lastTool);
        return usage;
    }

    @Override
    public void appendAudit(String id, Map<String, Object> entry) {
        McpKeyRecord record = find(id);
        if (record == null) return;
        record.addAudit(entry);
        try {
            Request req = new Request("POST", "/" + index + "/_update/" + id);
            req.setJsonEntity(MAPPER.writeValueAsString(java.util.Collections.singletonMap("doc",
                    java.util.Collections.singletonMap("auditLog", record.auditLog))));
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (ResponseException e) {
            int status = e.getResponse().getStatusLine().getStatusCode();
            if (status == 404 || status == 400) return;
            throw new IllegalStateException("回写 MCP key 审计失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("回写 MCP key 审计失败: " + e.getMessage(), e);
        }
    }

    @Override
    public void invalidate() {
        cache.clear();
    }

    private void put(McpKeyRecord record, boolean refresh) {
        try {
            Request req = new Request("PUT", "/" + index + "/_doc/" + record.id + (refresh ? "?refresh=true" : ""));
            req.setJsonEntity(MAPPER.writeValueAsString(record));
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<McpKeyRecord> readHits(Map<String, Object> raw) {
        List<McpKeyRecord> out = new ArrayList<>();
        Object hitsWrap = raw.get("hits");
        if (!(hitsWrap instanceof Map)) return out;
        Object hits = ((Map<?, ?>) hitsWrap).get("hits");
        if (!(hits instanceof List)) return out;
        for (Object hit : (List<?>) hits) {
            if (!(hit instanceof Map)) continue;
            Object source = ((Map<?, ?>) hit).get("_source");
            if (source instanceof Map) out.add(MAPPER.convertValue(source, McpKeyRecord.class));
        }
        return out;
    }

    private static Map<String, List<String>> copyPermissions(Map<String, List<String>> source) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (source != null) {
            for (Map.Entry<String, List<String>> e : source.entrySet()) {
                out.put(e.getKey(), e.getValue() == null ? new ArrayList<String>() : new ArrayList<>(e.getValue()));
            }
        }
        return out;
    }

    private static final class CacheEntry {
        private final McpKeyRecord record;
        private final long loadedAt;

        private CacheEntry(McpKeyRecord record, long loadedAt) {
            this.record = record;
            this.loadedAt = loadedAt;
        }
    }
}
