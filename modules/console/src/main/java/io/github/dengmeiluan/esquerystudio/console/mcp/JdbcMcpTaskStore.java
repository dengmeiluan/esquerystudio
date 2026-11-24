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
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 宿主数据库版任务台账（{@code console.store=jdbc}）。
 *
 * <p>表 {@code esquerystudio_mcp_task} 首次使用时幂等创建。快照整条以 JSON 存
 * {@code record} 列；取消请求用一次读-改-写合并 {@code cancelRequestedAtMs}，
 * 不丢执行实例并发写入的其他字段（冲突时以最后写入为准，取消标记在巡检窗口内重试即可）。</p>
 */
public class JdbcMcpTaskStore implements McpTaskStore {

    private static final Logger LOG = LoggerFactory.getLogger(JdbcMcpTaskStore.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String TABLE = "esquerystudio_mcp_task";

    private final DataSource dataSource;
    private volatile boolean schemaReady;

    public JdbcMcpTaskStore(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    private synchronized void ensureSchema() {
        if (schemaReady) return;
        String ddl = "CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                + "task_id VARCHAR(128) PRIMARY KEY,"
                + "record VARCHAR(60000) NOT NULL,"
                + "cancel_requested BIGINT,"
                + "updated_at BIGINT NOT NULL)";
        try (Connection c = dataSource.getConnection();
             java.sql.Statement st = c.createStatement()) {
            st.execute(ddl);
            schemaReady = true;
        } catch (Exception e) {
            throw new IllegalStateException("创建 MCP 任务表失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public void save(Map<String, Object> record) {
        Object id = record == null ? null : record.get("taskId");
        if (id == null) throw new IllegalArgumentException("task record without taskId");
        ensureSchema();
        String json;
        try {
            json = MAPPER.writeValueAsString(record);
        } catch (Exception e) {
            throw new IllegalStateException("序列化 MCP 任务失败: " + e.getMessage(), e);
        }
        if (json.length() > 50_000) {
            /* 超长结果不丢状态：结果体置空并标记，状态/进度照常持久化。 */
            Map<String, Object> slim = new LinkedHashMap<>(record);
            slim.remove("result");
            slim.put("resultDropped", Boolean.TRUE);
            try {
                json = MAPPER.writeValueAsString(slim);
            } catch (Exception e) {
                throw new IllegalStateException("序列化 MCP 任务失败: " + e.getMessage(), e);
            }
        }
        long now = System.currentTimeMillis();
        try (Connection c = dataSource.getConnection()) {
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE " + TABLE + " SET record=?, updated_at=? WHERE task_id=?")) {
                ps.setString(1, json);
                ps.setLong(2, now);
                ps.setString(3, String.valueOf(id));
                if (ps.executeUpdate() > 0) return;
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO " + TABLE + " (task_id,record,updated_at) VALUES (?,?,?)")) {
                ps.setString(1, String.valueOf(id));
                ps.setString(2, json);
                ps.setLong(3, now);
                ps.executeUpdate();
            }
        } catch (Exception e) {
            throw new IllegalStateException("保存 MCP 任务失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public Map<String, Object> get(String taskId) {
        if (taskId == null || taskId.isEmpty()) return null;
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT record FROM " + TABLE + " WHERE task_id=?")) {
            ps.setString(1, taskId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                @SuppressWarnings("unchecked")
                Map<String, Object> out = MAPPER.readValue(rs.getString(1), Map.class);
                return out;
            }
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 任务失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public List<Map<String, Object>> recent(int limit) {
        ensureSchema();
        int size = Math.max(1, Math.min(limit <= 0 ? 50 : limit, 200));
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT record FROM " + TABLE + " ORDER BY updated_at DESC LIMIT " + size);
             ResultSet rs = ps.executeQuery()) {
            List<Map<String, Object>> out = new ArrayList<>();
            while (rs.next()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> row = MAPPER.readValue(rs.getString(1), Map.class);
                out.add(row);
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("列出 MCP 任务失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public synchronized void requestCancel(String taskId) {
        if (taskId == null || taskId.isEmpty()) return;
        ensureSchema();
        long now = System.currentTimeMillis();
        try (Connection c = dataSource.getConnection()) {
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE " + TABLE + " SET cancel_requested=? WHERE task_id=?")) {
                ps.setLong(1, now);
                ps.setString(2, taskId);
                if (ps.executeUpdate() > 0) return;
            }
            Map<String, Object> seed = new LinkedHashMap<>();
            seed.put("taskId", taskId);
            seed.put("cancelRequestedAtMs", now);
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO " + TABLE + " (task_id,record,cancel_requested,updated_at) VALUES (?,?,?,?)")) {
                ps.setString(1, taskId);
                ps.setString(2, MAPPER.writeValueAsString(seed));
                ps.setLong(3, now);
                ps.setLong(4, now);
                ps.executeUpdate();
            }
        } catch (Exception e) {
            throw new IllegalStateException("写入 MCP 取消请求失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public boolean isCancelRequested(String taskId) {
        if (taskId == null || taskId.isEmpty()) return false;
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT cancel_requested FROM " + TABLE + " WHERE task_id=?")) {
            ps.setString(1, taskId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getObject(1) != null;
            }
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 取消标记失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public void clear(String taskId) {
        if (taskId == null || taskId.isEmpty()) return;
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM " + TABLE + " WHERE task_id=?")) {
            ps.setString(1, taskId);
            ps.executeUpdate();
        } catch (Exception e) {
            /* 清理失败不影响主流程，记日志即可 */
            LOG.warn("[mcp-task] 清理任务失败(jdbc) task={}", taskId, e);
        }
    }
}
