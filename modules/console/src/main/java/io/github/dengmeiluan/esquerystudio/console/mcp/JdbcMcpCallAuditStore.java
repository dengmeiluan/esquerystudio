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
 * 宿主数据库内的 MCP 调用审计表。与 key 表分开，按 {@code at} 时间保留。
 * 表在首次使用时幂等创建，不引入额外依赖。
 */
public class JdbcMcpCallAuditStore implements McpCallAuditStore {

    private static final Logger LOG = LoggerFactory.getLogger(JdbcMcpCallAuditStore.class);
    private static final String TABLE = "esquerystudio_mcp_audit";

    private final DataSource dataSource;
    private final int retentionDays;
    private volatile boolean schemaReady;

    public JdbcMcpCallAuditStore(DataSource dataSource, int retentionDays) {
        this.dataSource = dataSource;
        this.retentionDays = Math.max(7, retentionDays);
    }

    @Override
    public void append(McpKeyRecord key, Map<String, Object> call) {
        if (key == null || call == null) return;
        ensureSchema();
        String sql = "INSERT INTO " + TABLE + " (key_id,key_name,key_prefix,owner,role,method,tool,at,ok,ms,"
                + "request_id,ip,remote_ip,ua,http,origin,transport) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            ps.setString(i++, key.id);
            ps.setString(i++, key.name);
            ps.setString(i++, key.prefix);
            ps.setString(i++, key.owner);
            ps.setString(i++, key.role);
            ps.setString(i++, text(call.get("method")));
            ps.setString(i++, text(call.get("tool")));
            ps.setLong(i++, number(call.get("at"), System.currentTimeMillis()));
            ps.setBoolean(i++, Boolean.TRUE.equals(call.get("ok")));
            ps.setLong(i++, number(call.get("ms"), 0L));
            ps.setString(i++, text(call.get("requestId")));
            ps.setString(i++, text(call.get("ip")));
            ps.setString(i++, text(call.get("remoteIp")));
            ps.setString(i++, text(call.get("ua")));
            ps.setString(i++, text(call.get("http")));
            ps.setString(i++, text(call.get("origin")));
            ps.setString(i++, text(call.get("transport")));
            ps.executeUpdate();
        } catch (Exception e) {
            LOG.warn("[mcp-audit] JDBC 审计写入失败：{}", e.getMessage(), e);
        }
    }

    @Override
    public List<Map<String, Object>> list(String keyId, int limit) {
        ensureSchema();
        boolean scoped = keyId != null && !keyId.trim().isEmpty();
        String sql = "SELECT * FROM " + TABLE
                + (scoped ? " WHERE key_id=? AND at>=?" : " WHERE at>=?")
                + " ORDER BY at DESC LIMIT ?";
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            if (scoped) ps.setString(i++, keyId.trim());
            ps.setLong(i++, System.currentTimeMillis() - retentionDays * 86_400_000L);
            ps.setInt(i++, Math.max(1, Math.min(limit <= 0 ? 500 : limit, 5000)));
            try (ResultSet rs = ps.executeQuery()) {
                List<Map<String, Object>> out = new ArrayList<>();
                while (rs.next()) out.add(toMap(rs));
                return out;
            }
        } catch (Exception e) {
            LOG.warn("[mcp-audit] JDBC 审计查询失败：{}", e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    @Override
    public int prune(long beforeMillis) {
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM " + TABLE + " WHERE at<?")) {
            ps.setLong(1, beforeMillis);
            return ps.executeUpdate();
        } catch (Exception e) {
            LOG.warn("[mcp-audit] JDBC 审计清理失败：{}", e.getMessage(), e);
            return 0;
        }
    }

    private synchronized void ensureSchema() {
        if (schemaReady) return;
        String ddl = "CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                + "id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                + "key_id VARCHAR(64) NOT NULL,"
                + "key_name VARCHAR(255),"
                + "key_prefix VARCHAR(128),"
                + "owner VARCHAR(255),"
                + "role VARCHAR(64),"
                + "method VARCHAR(128),"
                + "tool VARCHAR(128),"
                + "at BIGINT NOT NULL,"
                + "ok BOOLEAN NOT NULL,"
                + "ms BIGINT NOT NULL DEFAULT 0,"
                + "request_id VARCHAR(128),"
                + "ip VARCHAR(128),"
                + "remote_ip VARCHAR(128),"
                + "ua VARCHAR(512),"
                + "http VARCHAR(512),"
                + "origin VARCHAR(255),"
                + "transport VARCHAR(32))";
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(ddl);
            try {
                st.execute("CREATE INDEX IF NOT EXISTS idx_mcp_audit_key_at ON " + TABLE + " (key_id, at)");
            } catch (Exception ignore) {
                /* 不同数据库对 IF NOT EXISTS 索引语法支持不同；表仍可用。 */
            }
            schemaReady = true;
        } catch (Exception e) {
            throw new IllegalStateException("初始化 " + TABLE + " 表失败: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> toMap(ResultSet rs) throws Exception {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("keyId", rs.getString("key_id"));
        out.put("keyName", rs.getString("key_name"));
        out.put("keyPrefix", rs.getString("key_prefix"));
        out.put("owner", rs.getString("owner"));
        out.put("role", rs.getString("role"));
        out.put("method", rs.getString("method"));
        out.put("tool", rs.getString("tool"));
        out.put("at", rs.getLong("at"));
        out.put("ok", rs.getBoolean("ok"));
        out.put("ms", rs.getLong("ms"));
        putIfPresent(out, "requestId", rs.getString("request_id"));
        putIfPresent(out, "ip", rs.getString("ip"));
        putIfPresent(out, "remoteIp", rs.getString("remote_ip"));
        putIfPresent(out, "ua", rs.getString("ua"));
        putIfPresent(out, "http", rs.getString("http"));
        putIfPresent(out, "origin", rs.getString("origin"));
        putIfPresent(out, "transport", rs.getString("transport"));
        return out;
    }

    private void putIfPresent(Map<String, Object> out, String key, String value) {
        if (value != null && !value.trim().isEmpty()) out.put(key, value);
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private long number(Object value, long fallback) {
        return value instanceof Number ? ((Number) value).longValue() : fallback;
    }
}
