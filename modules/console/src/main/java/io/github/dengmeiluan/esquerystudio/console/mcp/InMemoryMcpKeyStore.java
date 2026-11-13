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

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 进程内测试/无控制集群兜底存储；重启即失，不用于生产。 */
public class InMemoryMcpKeyStore implements McpKeyStore {

    private final Map<String, McpKeyRecord> byId = new ConcurrentHashMap<>();
    private final Map<String, String> idByHash = new ConcurrentHashMap<>();
    private final McpSecretCipher cipher;

    public InMemoryMcpKeyStore() {
        this(null);
    }

    public InMemoryMcpKeyStore(McpSecretCipher cipher) {
        this.cipher = cipher;
    }

    @Override
    public List<Map<String, Object>> list() {
        long now = System.currentTimeMillis();
        List<McpKeyRecord> records = new ArrayList<>(byId.values());
        records.sort(Comparator.comparingLong((McpKeyRecord r) -> r.createdAt).reversed());
        List<Map<String, Object>> out = new ArrayList<>();
        for (McpKeyRecord record : records) out.add(record.redacted(now));
        return out;
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
        if (connectionPermissions != null) {
            for (Map.Entry<String, List<String>> e : connectionPermissions.entrySet()) {
                record.connectionPermissions.put(e.getKey(),
                        e.getValue() == null ? new ArrayList<String>() : new ArrayList<>(e.getValue()));
            }
        }
        record.requestsPerMinute = requestsPerMinute;
        record.dailyQuota = dailyQuota;
        record.monthlyQuota = monthlyQuota;
        record.expiresAt = expiresAt;
        String secret = record.prefix + "." + McpKeyRecord.newSecret();
        record.keyHash = McpKeyRecord.sha256Hex(secret);
        record.secretEncrypted = cipher == null ? null : cipher.encrypt(secret);
        record.createdAt = System.currentTimeMillis();
        byId.put(record.id, record);
        idByHash.put(record.keyHash, record.id);
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
        McpKeyRecord record = byId.get(id);
        if (record == null || !record.enabled) return null;
        record.name = name;
        record.allowedTools = new ArrayList<>(allowedTools);
        record.connections = connections == null || connections.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("host")) : new ArrayList<>(connections);
        record.permissions = permissions == null || permissions.isEmpty()
                ? new ArrayList<>(java.util.Collections.singletonList("read")) : new ArrayList<>(permissions);
        record.connectionPermissions.clear();
        if (connectionPermissions != null) {
            for (Map.Entry<String, List<String>> e : connectionPermissions.entrySet()) {
                record.connectionPermissions.put(e.getKey(),
                        e.getValue() == null ? new ArrayList<String>() : new ArrayList<>(e.getValue()));
            }
        }
        record.requestsPerMinute = requestsPerMinute;
        record.dailyQuota = dailyQuota;
        record.monthlyQuota = monthlyQuota;
        record.expiresAt = expiresAt;
        return record.redacted(System.currentTimeMillis());
    }

    @Override
    public boolean revoke(String id) {
        McpKeyRecord record = byId.get(id);
        if (record == null) return false;
        record.enabled = false;
        record.revokedAt = System.currentTimeMillis();
        return true;
    }

    @Override
    public Map<String, Object> rotate(String id) {
        McpKeyRecord record = byId.get(id);
        if (record == null || !record.enabled) return null;
        idByHash.remove(record.keyHash);
        String secret = record.prefix + "." + McpKeyRecord.newSecret();
        record.keyHash = McpKeyRecord.sha256Hex(secret);
        record.secretEncrypted = cipher == null ? null : cipher.encrypt(secret);
        idByHash.put(record.keyHash, record.id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", record.redacted(System.currentTimeMillis()));
        out.put("secret", secret);
        return out;
    }

    @Override
    public McpKeyRecord find(String id) {
        return byId.get(id);
    }

    @Override
    public McpKeyRecord authenticate(String secret) {
        if (secret == null || secret.trim().isEmpty()) return null;
        String id = idByHash.get(McpKeyRecord.sha256Hex(secret.trim()));
        return id == null ? null : byId.get(id);
    }

    @Override
    public void updateUsage(McpKeyRecord record) {
        if (record == null || record.id == null) return;
        byId.put(record.id, record);
    }

    @Override
    public void appendAudit(String id, Map<String, Object> entry) {
        McpKeyRecord record = id == null ? null : byId.get(id);
        if (record != null) record.addAudit(entry);
    }

    @Override
    public void invalidate() {
        /* no cache */
    }
}
