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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * MCP API key 的宿主数据库持久化档（{@code console.store=jdbc}）。
 *
 * <p>与 {@link EsMcpKeyStore} 共用 {@link McpKeyStore} 契约；表在首次使用时幂等创建，
 * 只依赖 {@code javax.sql.DataSource}，不引入额外依赖。认证只认 SHA-256，完整 key
 * 以 AES-256-GCM 密文保存在 {@code secret_enc}，管理面校验权限后可再次取回。
 * 适合 QuoteHub 这类已有数据库、需要把 key 纳入自身备份/权限/运维体系的宿主。</p>
 */
public class JdbcMcpKeyStore implements McpKeyStore {

    private static final Logger LOG = LoggerFactory.getLogger(JdbcMcpKeyStore.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String TABLE = "esquerystudio_mcp_key";

    private final DataSource dataSource;
    private final McpSecretCipher cipher;
    private volatile boolean schemaReady;

    public JdbcMcpKeyStore(DataSource dataSource) {
        this(dataSource, null);
    }

    public JdbcMcpKeyStore(DataSource dataSource, McpSecretCipher cipher) {
        this.dataSource = dataSource;
        this.cipher = cipher;
    }

    @Override
    public List<Map<String, Object>> list() {
        ensureSchema();
        String sql = "SELECT * FROM " + TABLE + " ORDER BY created_at DESC";
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            List<Map<String, Object>> out = new ArrayList<>();
            long now = System.currentTimeMillis();
            while (rs.next()) out.add(toRecord(rs).redacted(now));
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 密钥失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public Map<String, Object> create(String name, String owner, String role, List<String> allowedTools,
                                      List<String> connections, List<String> permissions,
                                      Map<String, List<String>> connectionPermissions,
                                      int requestsPerMinute, long dailyQuota, long monthlyQuota, Long expiresAt) {
        ensureSchema();
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
        record.createdAt = System.currentTimeMillis();
        String secret = record.prefix + "." + McpKeyRecord.newSecret();
        record.keyHash = McpKeyRecord.sha256Hex(secret);
        record.secretEncrypted = cipher == null ? null : cipher.encrypt(secret);

        String sql = "INSERT INTO " + TABLE + " (id,prefix,name,owner,role,key_hash,secret_enc,allowed_tools,connections,"
                + "permissions,connection_permissions,requests_per_minute,daily_quota,monthly_quota,enabled,created_at,expires_at,"
                + "last_used_at,request_count,error_count,tool_counts,last_tool,day_key,day_count,month_key,month_count,"
                + "window_start,window_count,recent_calls,daily_counts,audit_log,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, record.id);
            ps.setString(i++, record.prefix);
            ps.setString(i++, record.name);
            ps.setString(i++, record.owner);
            ps.setString(i++, record.role);
            ps.setString(i++, record.keyHash);
            ps.setString(i++, record.secretEncrypted);
            ps.setString(i++, MAPPER.writeValueAsString(record.allowedTools));
            ps.setString(i++, MAPPER.writeValueAsString(record.connections));
            ps.setString(i++, MAPPER.writeValueAsString(record.permissions));
            ps.setString(i++, MAPPER.writeValueAsString(record.connectionPermissions));
            ps.setInt(i++, record.requestsPerMinute);
            ps.setLong(i++, record.dailyQuota);
            ps.setLong(i++, record.monthlyQuota);
            ps.setBoolean(i++, record.enabled);
            ps.setLong(i++, record.createdAt);
            setNullableLong(ps, i++, record.expiresAt);
            setNullableLong(ps, i++, record.lastUsedAt);
            ps.setLong(i++, record.requestCount);
            ps.setLong(i++, record.errorCount);
            ps.setString(i++, MAPPER.writeValueAsString(record.toolCounts == null ? new LinkedHashMap<>() : record.toolCounts));
            ps.setString(i++, record.lastTool);
            ps.setString(i++, record.dayKey);
            ps.setLong(i++, record.dayCount);
            ps.setString(i++, record.monthKey);
            ps.setLong(i++, record.monthCount);
            ps.setLong(i++, record.windowStart);
            ps.setInt(i++, record.windowCount);
            ps.setString(i++, MAPPER.writeValueAsString(record.recentCalls == null
                    ? new ArrayList<>() : record.recentCalls));
            ps.setString(i++, MAPPER.writeValueAsString(record.dailyCounts == null
                    ? new LinkedHashMap<>() : record.dailyCounts));
            ps.setString(i++, MAPPER.writeValueAsString(record.auditLog == null
                    ? new ArrayList<>() : record.auditLog));
            setNullableLong(ps, i, record.revokedAt);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new IllegalStateException("保存 MCP 密钥失败(jdbc): " + e.getMessage(), e);
        }
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
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE " + TABLE + " SET name=?,allowed_tools=?,connections=?,"
                     + "permissions=?,connection_permissions=?,requests_per_minute=?,daily_quota=?,monthly_quota=?,"
                     + "expires_at=? WHERE id=?")) {
            ps.setString(1, name);
            ps.setString(2, MAPPER.writeValueAsString(allowedTools));
            ps.setString(3, MAPPER.writeValueAsString(connections == null || connections.isEmpty()
                    ? java.util.Collections.singletonList("host") : connections));
            ps.setString(4, MAPPER.writeValueAsString(permissions == null || permissions.isEmpty()
                    ? java.util.Collections.singletonList("read") : permissions));
            ps.setString(5, MAPPER.writeValueAsString(connectionPermissions == null
                    ? java.util.Collections.emptyMap() : connectionPermissions));
            ps.setInt(6, requestsPerMinute);
            ps.setLong(7, dailyQuota);
            ps.setLong(8, monthlyQuota);
            setNullableLong(ps, 9, expiresAt);
            ps.setString(10, id);
            if (ps.executeUpdate() == 0) return null;
        } catch (Exception e) {
            throw new IllegalStateException("更新 MCP 密钥失败(jdbc): " + e.getMessage(), e);
        }
        McpKeyRecord after = find(id);
        return after == null ? null : after.redacted(System.currentTimeMillis());
    }

    @Override
    public boolean revoke(String id) {
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "UPDATE " + TABLE + " SET enabled=?, revoked_at=? WHERE id=?")) {
            ps.setBoolean(1, false);
            ps.setLong(2, System.currentTimeMillis());
            ps.setString(3, id);
            return ps.executeUpdate() > 0;
        } catch (Exception e) {
            throw new IllegalStateException("撤销 MCP 密钥失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public Map<String, Object> rotate(String id) {
        McpKeyRecord record = find(id);
        if (record == null || !record.enabled) return null;
        String secret = record.prefix + "." + McpKeyRecord.newSecret();
        String hash = McpKeyRecord.sha256Hex(secret);
        String encrypted = cipher == null ? null : cipher.encrypt(secret);
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE " + TABLE + " SET key_hash=?,secret_enc=? WHERE id=?")) {
            ps.setString(1, hash);
            ps.setString(2, encrypted);
            ps.setString(3, id);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new IllegalStateException("轮换 MCP 密钥失败(jdbc): " + e.getMessage(), e);
        }
        record.keyHash = hash;
        record.secretEncrypted = encrypted;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", record.redacted(System.currentTimeMillis()));
        out.put("secret", secret);
        return out;
    }

    @Override
    public McpKeyRecord find(String id) {
        if (id == null || id.trim().isEmpty()) return null;
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT * FROM " + TABLE + " WHERE id=?")) {
            ps.setString(1, id.trim());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? toRecord(rs) : null;
            }
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 密钥失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public McpKeyRecord authenticate(String secret) {
        if (secret == null || secret.trim().isEmpty()) return null;
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT * FROM " + TABLE + " WHERE key_hash=?")) {
            ps.setString(1, McpKeyRecord.sha256Hex(secret.trim()));
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? toRecord(rs) : null;
            }
        } catch (Exception e) {
            throw new IllegalStateException("校验 MCP 密钥失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public void updateUsage(McpKeyRecord record) {
        if (record == null || record.id == null) return;
        ensureSchema();
        /* 只更新用量列：撤销/权限/连接等安全字段不会被并发的用量写覆盖。 */
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE " + TABLE + " SET last_used_at=?,request_count=?,"
                     + "error_count=?,tool_counts=?,last_tool=?,day_key=?,day_count=?,month_key=?,month_count=?,window_start=?,window_count=?,recent_calls=?,daily_counts=? "
                     + "WHERE id=?")) {
            setNullableLong(ps, 1, record.lastUsedAt);
            ps.setLong(2, record.requestCount);
            ps.setLong(3, record.errorCount);
            ps.setString(4, MAPPER.writeValueAsString(record.toolCounts == null ? new LinkedHashMap<>() : record.toolCounts));
            ps.setString(5, record.lastTool);
            ps.setString(6, record.dayKey);
            ps.setLong(7, record.dayCount);
            ps.setString(8, record.monthKey);
            ps.setLong(9, record.monthCount);
            ps.setLong(10, record.windowStart);
            ps.setInt(11, record.windowCount);
            ps.setString(12, MAPPER.writeValueAsString(record.recentCalls == null ? new ArrayList<>() : record.recentCalls));
            ps.setString(13, MAPPER.writeValueAsString(record.dailyCounts == null ? new LinkedHashMap<>() : record.dailyCounts));
            ps.setString(14, record.id);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new IllegalStateException("回写 MCP 密钥用量失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public void appendAudit(String id, Map<String, Object> entry) {
        McpKeyRecord record = find(id);
        if (record == null) return;
        record.addAudit(entry);
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE " + TABLE + " SET audit_log=? WHERE id=?")) {
            ps.setString(1, MAPPER.writeValueAsString(record.auditLog));
            ps.setString(2, id);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new IllegalStateException("回写 MCP 密钥审计失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public void invalidate() {
        /* JDBC 每次读取数据库，无认证缓存。 */
    }

    private synchronized void ensureSchema() {
        if (schemaReady) return;
        String ddl = "CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                + "id VARCHAR(64) PRIMARY KEY,"
                + "prefix VARCHAR(128) NOT NULL,"
                + "name VARCHAR(255) NOT NULL,"
                + "owner VARCHAR(255) NOT NULL,"
                + "role VARCHAR(64) NOT NULL,"
                + "key_hash VARCHAR(128) NOT NULL UNIQUE,"
                + "secret_enc VARCHAR(2048),"
                + "allowed_tools VARCHAR(4000) NOT NULL,"
                + "connections VARCHAR(2000) NOT NULL,"
                + "permissions VARCHAR(512) NOT NULL,"
                + "connection_permissions VARCHAR(8000) NOT NULL DEFAULT '{}',"
                + "requests_per_minute INT NOT NULL,"
                + "daily_quota BIGINT NOT NULL,"
                + "monthly_quota BIGINT NOT NULL,"
                + "enabled BOOLEAN NOT NULL,"
                + "created_at BIGINT NOT NULL,"
                + "expires_at BIGINT,"
                + "last_used_at BIGINT,"
                + "request_count BIGINT NOT NULL DEFAULT 0,"
                + "error_count BIGINT NOT NULL DEFAULT 0,"
                + "tool_counts VARCHAR(8000) NOT NULL DEFAULT '{}',"
                + "last_tool VARCHAR(128),"
                + "day_key VARCHAR(32),"
                + "day_count BIGINT NOT NULL DEFAULT 0,"
                + "month_key VARCHAR(32),"
                + "month_count BIGINT NOT NULL DEFAULT 0,"
                + "window_start BIGINT NOT NULL DEFAULT 0,"
                + "window_count INT NOT NULL DEFAULT 0,"
                + "recent_calls VARCHAR(8000) NOT NULL DEFAULT '[]',"
                + "daily_counts VARCHAR(8000) NOT NULL DEFAULT '{}',"
                + "audit_log VARCHAR(8000) NOT NULL DEFAULT '[]',"
                + "revoked_at BIGINT)";
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(ddl);
            /* 存量表升级：CREATE TABLE IF NOT EXISTS 不会补列；只补缺失列，重复执行安全。 */
            if (!hasColumn(c, TABLE, "tool_counts")) {
                st.execute("ALTER TABLE " + TABLE + " ADD COLUMN tool_counts VARCHAR(8000) NOT NULL DEFAULT '{}'");
            }
            if (!hasColumn(c, TABLE, "last_tool")) {
                st.execute("ALTER TABLE " + TABLE + " ADD COLUMN last_tool VARCHAR(128)");
            }
            if (!hasColumn(c, TABLE, "secret_enc")) {
                st.execute("ALTER TABLE " + TABLE + " ADD COLUMN secret_enc VARCHAR(2048)");
                LOG.info("[JdbcMcpKeyStore] added column secret_enc to {}", TABLE);
            }
            if (!hasColumn(c, TABLE, "connection_permissions")) {
                st.execute("ALTER TABLE " + TABLE
                        + " ADD COLUMN connection_permissions VARCHAR(8000) NOT NULL DEFAULT '{}'");
                LOG.info("[JdbcMcpKeyStore] added column connection_permissions to {}", TABLE);
            }
            if (!hasColumn(c, TABLE, "recent_calls")) {
                st.execute("ALTER TABLE " + TABLE + " ADD COLUMN recent_calls VARCHAR(8000) NOT NULL DEFAULT '[]'");
                LOG.info("[JdbcMcpKeyStore] added column recent_calls to {}", TABLE);
            }
            if (!hasColumn(c, TABLE, "daily_counts")) {
                st.execute("ALTER TABLE " + TABLE + " ADD COLUMN daily_counts VARCHAR(8000) NOT NULL DEFAULT '{}'");
                LOG.info("[JdbcMcpKeyStore] added column daily_counts to {}", TABLE);
            }
            if (!hasColumn(c, TABLE, "audit_log")) {
                st.execute("ALTER TABLE " + TABLE + " ADD COLUMN audit_log VARCHAR(8000) NOT NULL DEFAULT '[]'");
                LOG.info("[JdbcMcpKeyStore] added column audit_log to {}", TABLE);
            }
            schemaReady = true;
            LOG.info("[JdbcMcpKeyStore] schema ready: {}", TABLE);
        } catch (Exception e) {
            throw new IllegalStateException("初始化 " + TABLE + " 表失败: " + e.getMessage(), e);
        }
    }

    private boolean hasColumn(Connection c, String table, String column) throws Exception {
        try (ResultSet rs = c.getMetaData().getColumns(null, null, null, null)) {
            while (rs.next()) {
                if (table.equalsIgnoreCase(rs.getString("TABLE_NAME"))
                        && column.equalsIgnoreCase(rs.getString("COLUMN_NAME"))) {
                    return true;
                }
            }
        }
        return false;
    }

    private McpKeyRecord toRecord(ResultSet rs) throws Exception {
        McpKeyRecord r = new McpKeyRecord();
        r.id = rs.getString("id");
        r.prefix = rs.getString("prefix");
        r.name = rs.getString("name");
        r.owner = rs.getString("owner");
        r.role = rs.getString("role");
        r.keyHash = rs.getString("key_hash");
        r.secretEncrypted = rs.getString("secret_enc");
        r.allowedTools = list(rs.getString("allowed_tools"));
        r.connections = list(rs.getString("connections"));
        r.permissions = list(rs.getString("permissions"));
        r.connectionPermissions = map(rs.getString("connection_permissions"));
        r.requestsPerMinute = rs.getInt("requests_per_minute");
        r.dailyQuota = rs.getLong("daily_quota");
        r.monthlyQuota = rs.getLong("monthly_quota");
        r.enabled = rs.getBoolean("enabled");
        r.createdAt = rs.getLong("created_at");
        r.expiresAt = nullableLong(rs, "expires_at");
        r.lastUsedAt = nullableLong(rs, "last_used_at");
        r.requestCount = rs.getLong("request_count");
        r.errorCount = rs.getLong("error_count");
        r.toolCounts = longMap(rs.getString("tool_counts"));
        r.recentCalls = callList(rs.getString("recent_calls"));
        r.dailyCounts = longMap(rs.getString("daily_counts"));
        r.auditLog = callList(rs.getString("audit_log"));
        r.lastTool = rs.getString("last_tool");
        r.dayKey = rs.getString("day_key");
        r.dayCount = rs.getLong("day_count");
        r.monthKey = rs.getString("month_key");
        r.monthCount = rs.getLong("month_count");
        r.windowStart = rs.getLong("window_start");
        r.windowCount = rs.getInt("window_count");
        r.revokedAt = nullableLong(rs, "revoked_at");
        return r;
    }

    @SuppressWarnings("unchecked")
    private List<String> list(String json) {
        if (json == null || json.trim().isEmpty()) return new ArrayList<>();
        try {
            List<String> out = MAPPER.readValue(json, List.class);
            return out == null ? new ArrayList<String>() : out;
        } catch (Exception e) {
            throw new IllegalStateException("MCP key 列表字段损坏: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Long> longMap(String json) {
        Map<String, Long> out = new LinkedHashMap<>();
        if (json == null || json.trim().isEmpty()) return out;
        try {
            Map<String, Object> raw = MAPPER.readValue(json, Map.class);
            if (raw == null) return out;
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                if (e.getValue() instanceof Number) out.put(e.getKey(), ((Number) e.getValue()).longValue());
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("MCP key 工具计数损坏: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> callList(String json) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (json == null || json.trim().isEmpty()) return out;
        try {
            List<Map<String, Object>> raw = MAPPER.readValue(json, List.class);
            if (raw == null) return out;
            for (Map<String, Object> item : raw) {
                if (item != null) out.add(new LinkedHashMap<>(item));
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("MCP key 最近调用字段损坏: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<String>> map(String json) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (json == null || json.trim().isEmpty()) return out;
        try {
            Map<String, Object> raw = MAPPER.readValue(json, Map.class);
            if (raw == null) return out;
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                List<String> perms = new ArrayList<>();
                if (e.getValue() instanceof List) {
                    for (Object item : (List<?>) e.getValue()) {
                        if (item != null) perms.add(String.valueOf(item));
                    }
                }
                out.put(e.getKey(), perms);
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("MCP key 连接权限字段损坏: " + e.getMessage(), e);
        }
    }

    private Long nullableLong(ResultSet rs, String column) throws Exception {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private void setNullableLong(PreparedStatement ps, int index, Long value) throws Exception {
        if (value == null) ps.setNull(index, Types.BIGINT);
        else ps.setLong(index, value);
    }
}
