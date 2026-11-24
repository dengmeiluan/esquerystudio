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

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * 宿主数据库版共享配额（{@code console.store=jdbc}）。
 *
 * <p>表 {@code esquerystudio_mcp_quota} 每个 key 一行，消费时
 * {@code SELECT ... FOR UPDATE} 行锁内完成「检查 + 自增」——多实例共用同一把 key
 * 时 rpm / 日 / 月配额是全局口径。SQLite 等不支持行锁的底座请用控制 ES 档
 * （{@code store=control-es}）。</p>
 */
public class JdbcMcpQuotaStore implements McpQuotaStore {

    private static final String TABLE = "esquerystudio_mcp_quota";

    private final DataSource dataSource;
    private volatile boolean schemaReady;

    public JdbcMcpQuotaStore(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    private synchronized void ensureSchema() {
        if (schemaReady) return;
        String ddl = "CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                + "key_id VARCHAR(64) PRIMARY KEY,"
                + "window_start BIGINT NOT NULL DEFAULT 0,"
                + "window_count BIGINT NOT NULL DEFAULT 0,"
                + "day_key VARCHAR(16) NOT NULL DEFAULT '',"
                + "day_count BIGINT NOT NULL DEFAULT 0,"
                + "month_key VARCHAR(8) NOT NULL DEFAULT '',"
                + "month_count BIGINT NOT NULL DEFAULT 0,"
                + "updated_at BIGINT NOT NULL DEFAULT 0)";
        try (Connection c = dataSource.getConnection();
             java.sql.Statement st = c.createStatement()) {
            st.execute(ddl);
            schemaReady = true;
        } catch (Exception e) {
            throw new IllegalStateException("创建 MCP 配额表失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public Decision consume(String keyId, int rpm, long dailyQuota, long monthlyQuota, long nowMs) {
        ensureSchema();
        for (int attempt = 0; attempt < 3; attempt++) {
            try (Connection c = dataSource.getConnection()) {
                boolean auto = c.getAutoCommit();
                c.setAutoCommit(false);
                try {
                    State state = new State();
                    boolean exists = false;
                    try (PreparedStatement ps = c.prepareStatement(
                            "SELECT window_start,window_count,day_key,day_count,month_key,month_count FROM "
                                    + TABLE + " WHERE key_id=? FOR UPDATE")) {
                        ps.setString(1, keyId);
                        try (ResultSet rs = ps.executeQuery()) {
                            if (rs.next()) {
                                exists = true;
                                state.windowStart = rs.getLong(1);
                                state.windowCount = rs.getLong(2);
                                state.dayKey = rs.getString(3) == null ? "" : rs.getString(3);
                                state.dayCount = rs.getLong(4);
                                state.monthKey = rs.getString(5) == null ? "" : rs.getString(5);
                                state.monthCount = rs.getLong(6);
                            }
                        }
                    }
                    Decision decision = McpQuotaRules.decide(state, rpm, dailyQuota, monthlyQuota, nowMs);
                    if (exists) {
                        try (PreparedStatement ps = c.prepareStatement("UPDATE " + TABLE
                                + " SET window_start=?,window_count=?,day_key=?,day_count=?,month_key=?,month_count=?,"
                                + "updated_at=? WHERE key_id=?")) {
                            bind(ps, decision.state, nowMs);
                            ps.setString(8, keyId);
                            ps.executeUpdate();
                        }
                    } else {
                        try (PreparedStatement ps = c.prepareStatement("INSERT INTO " + TABLE
                                + " (window_start,window_count,day_key,day_count,month_key,month_count,updated_at,key_id)"
                                + " VALUES (?,?,?,?,?,?,?,?)")) {
                            bind(ps, decision.state, nowMs);
                            ps.setString(8, keyId);
                            ps.executeUpdate();
                        }
                    }
                    c.commit();
                    return decision;
                } catch (SQLException e) {
                    c.rollback();
                    /* 并发首建同一 key：唯一键冲突后重查一次会走行锁分支。 */
                    if (attempt < 2) continue;
                    throw e;
                } finally {
                    c.setAutoCommit(auto);
                }
            } catch (Exception e) {
                throw new IllegalStateException("MCP 配额消费失败(jdbc): " + e.getMessage(), e);
            }
        }
        throw new IllegalStateException("MCP 配额消费失败(jdbc): 并发冲突重试耗尽");
    }

    private static void bind(PreparedStatement ps, State state, long nowMs) throws SQLException {
        ps.setLong(1, state.windowStart);
        ps.setLong(2, state.windowCount);
        ps.setString(3, state.dayKey);
        ps.setLong(4, state.dayCount);
        ps.setString(5, state.monthKey);
        ps.setLong(6, state.monthCount);
        ps.setLong(7, nowMs);
    }

    @Override
    public State counters(String keyId) {
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT window_start,window_count,day_key,day_count,month_key,month_count FROM "
                             + TABLE + " WHERE key_id=?")) {
            ps.setString(1, keyId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                State state = new State();
                state.windowStart = rs.getLong(1);
                state.windowCount = rs.getLong(2);
                state.dayKey = rs.getString(3) == null ? "" : rs.getString(3);
                state.dayCount = rs.getLong(4);
                state.monthKey = rs.getString(5) == null ? "" : rs.getString(5);
                state.monthCount = rs.getLong(6);
                return state;
            }
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 配额失败(jdbc): " + e.getMessage(), e);
        }
    }
}
