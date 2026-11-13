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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * {@link AdhocJobStore} 的宿主数据库档（ 平台化底座）：作业落宿主 {@code DataSource}
 * 的 {@code esquerystudio_adhoc_job} 表（首次使用自动建表），重启后仍可在列表页看历史。
 * 照 {@link io.github.dengmeiluan.esquerystudio.console.auth.JdbcConsoleOpsAuditStore} 范式：
 * {@code TABLE} 常量 + {@code volatile schemaReady} + 幂等 {@code CREATE TABLE IF NOT EXISTS}。
 *
 * <p><b>与审计（纯 append-only INSERT）不同，作业是 upsert 语义</b>：同 jobId 反复落状态变更。
 * upsert 刻意用 <b>DELETE + INSERT 同事务</b>而非 MySQL 的 {@code ON DUPLICATE KEY UPDATE}
 * 或 H2 的 {@code MERGE}——前者 H2 不认、后者 MySQL 不认，delete+insert 是两库都认的最小公倍数，
 * 消除方言分裂（生产 MySQL / 测试 H2 同一条码路径）。</p>
 *
 * <p><b>方案 A（查询视图）</b>：{@link AdhocRebuildJob} 大量字段为 {@code final} 且无公共默认构造，
 * 无法被 Jackson 直接反序列化（实证：{@code no property-based Creator}）。为不给生产类加注解污染，
 * {@code payload_json} 存的是 {@link AdhocRebuildJob#toMap()} 快照；回读时以
 * {@link AdhocRebuildJob#minimal(String)} 重建骨架，只回填<b>有 setter 的可查询字段</b>
 * （status/stage/error/currentTaskId/lockActive）。{@code logicalName} 等 final 字段灌不回骨架，
 * 但已落 {@code index_name} 专列供 SQL 直查。回读得到的是「查询视图」，非可继续跑的活作业——
 * 活作业永远命中 service 的内存一级缓存，DB 回读只服务重启后的历史查看，语义吻合。</p>
 *
 * <p>契约红线：{@link #save} 失败只 {@code logger.warn} 不上抛（与  persist 一致），
 * 持久化永不反噬正在跑的 reindex。</p>
 *
 * @author aicoding
 */
public class JdbcAdhocJobStore implements AdhocJobStore {

    private static final Logger logger = LoggerFactory.getLogger(JdbcAdhocJobStore.class);
    private static final String TABLE = "esquerystudio_adhoc_job";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final DataSource dataSource;
    private volatile boolean schemaReady;

    public JdbcAdhocJobStore(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /** 状态变更时 upsert（同 jobId 覆盖，不产生重复）。失败只记日志，不上抛（契约红线）。 */
    @Override
    public void save(AdhocRebuildJob job) {
        try {
            ensureSchema();
            long now = System.currentTimeMillis();
            String payload = MAPPER.writeValueAsString(job.toMap());
            // DELETE + INSERT 同事务（同一 Connection、手动提交），两库通吃的 upsert。
            try (Connection c = dataSource.getConnection()) {
                boolean autoCommit = c.getAutoCommit();
                c.setAutoCommit(false);
                try {
                    try (PreparedStatement del = c.prepareStatement(
                            "DELETE FROM " + TABLE + " WHERE job_id=?")) {
                        del.setString(1, job.getJobId());
                        del.executeUpdate();
                    }
                    try (PreparedStatement ins = c.prepareStatement(
                            "INSERT INTO " + TABLE + " (job_id,status_name,index_name,created_ts,updated_ts,payload_json,result_json,"
                                    + "target_id,target_name,target_es_version) VALUES (?,?,?,?,?,?,?,?,?,?)")) {
                        ins.setString(1, job.getJobId());
                        ins.setString(2, job.getStatus());
                        ins.setString(3, job.getLogicalName());
                        ins.setLong(4, job.getStartedAt());
                        ins.setLong(5, now);
                        ins.setString(6, payload);
                        ins.setString(7, null);
                        ins.setString(8, job.getTargetId());
                        ins.setString(9, job.getTargetNameSnapshot());
                        ins.setString(10, job.getTargetEsVersionSnapshot());
                        ins.executeUpdate();
                    }
                    c.commit();
                } catch (SQLException e) {
                    c.rollback();
                    throw e;
                } finally {
                    c.setAutoCommit(autoCommit);
                }
            }
        } catch (Exception e) {
            logger.warn("[esquerystudio-adhoc-jdbc] 落作业失败（忽略，不反噬重建）：jobId={} {}",
                    job == null ? null : job.getJobId(), e.getMessage(), e);
        }
    }

    /** 按 jobId 查；未命中返回 {@link Optional#empty()}。 */
    @Override
    public Optional<AdhocRebuildJob> find(String jobId) {
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT payload_json FROM " + TABLE + " WHERE job_id=?")) {
            ps.setString(1, jobId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.ofNullable(rehydrate(jobId, rs.getString("payload_json")));
                }
                return Optional.empty();
            }
        } catch (SQLException e) {
            throw new IllegalStateException("查询作业失败(jdbc): " + e.getMessage(), e);
        }
    }

    /**
     * 最近 {@code limit} 条（新的在前，按 updated_ts 倒序），供列表页。
     * 二级键 job_id DESC：同毫秒 updated_ts 时给出确定顺序，消除排序 flaky。
     */
    @Override
    public List<AdhocRebuildJob> listRecent(int limit) {
        ensureSchema();
        int lim = Math.min(Math.max(limit, 1), 500);
        List<AdhocRebuildJob> out = new ArrayList<>();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT job_id, payload_json FROM " + TABLE
                             + " ORDER BY updated_ts DESC, job_id DESC LIMIT " + lim)) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    AdhocRebuildJob j = rehydrate(rs.getString("job_id"), rs.getString("payload_json"));
                    if (j != null) {
                        out.add(j);
                    }
                }
            }
            return out;
        } catch (SQLException e) {
            throw new IllegalStateException("列表查询作业失败(jdbc): " + e.getMessage(), e);
        }
    }

    /** 删除指定作业（worker 提交失败等需彻底清除，不留 RUNNING 僵尸）。失败只 warn 不上抛。 */
    @Override
    public void remove(String jobId) {
        try {
            ensureSchema();
            try (Connection c = dataSource.getConnection();
                 PreparedStatement ps = c.prepareStatement("DELETE FROM " + TABLE + " WHERE job_id=?")) {
                ps.setString(1, jobId);
                ps.executeUpdate();
            }
        } catch (SQLException e) {
            logger.warn("[esquerystudio-adhoc-jdbc] 删除作业失败（忽略）：jobId={} {}", jobId, e.getMessage(), e);
        }
    }

    /**
     * 方案 A 回读：payload（toMap 快照）反序列化成 Map，用 minimal 骨架 + setter 回填可查询字段。
     * final 字段（logicalName/strategy/...）灌不回骨架，是 A 的诚实边界。
     */
    private AdhocRebuildJob rehydrate(String jobId, String payloadJson) {
        AdhocRebuildJob job = AdhocRebuildJob.minimal(jobId);
        if (payloadJson == null || payloadJson.isEmpty()) {
            return job;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = MAPPER.readValue(payloadJson, Map.class);
            setIfString(m.get("status"), job::setStatus);
            setIfString(m.get("stage"), job::setStage);
            setIfString(m.get("error"), job::setError);
            setIfString(m.get("currentTaskId"), job::setCurrentTaskId);
            // target-aware adhoc：旧 payload 无 targetId 字段 → getOrDefault 归一 host（迁移既定语义）
            job.restoreTarget(str(m.getOrDefault("targetId", AdhocRebuildJob.TARGET_HOST)),
                    str(m.get("targetName")), str(m.get("targetEsVersion")));
            job.restoreOwner(str(m.get("ownerUsername")), str(m.get("ownerRole")));
            Object lockActive = m.get("lockActive");
            if (lockActive instanceof Boolean) {
                job.setLockActive((Boolean) lockActive);
            }
        } catch (Exception e) {
            // 反序列化失败不致命：至少返回带 jobId 的骨架，列表/查看仍能显示 id。
            logger.warn("[esquerystudio-adhoc-jdbc] payload 反序列化失败，返回骨架：jobId={} {}",
                    jobId, e.getMessage(), e);
        }
        return job;
    }

    private void setIfString(Object v, java.util.function.Consumer<String> setter) {
        if (v instanceof String) {
            setter.accept((String) v);
        }
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    /** 首次使用建表（幂等）；status/index 是部分数据库保留字，列名加 _name / 改名避开。 */
    private void ensureSchema() {
        if (schemaReady) {
            return;
        }
        synchronized (this) {
            if (schemaReady) {
                return;
            }
            String ddl = "CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                    + "job_id VARCHAR(64) PRIMARY KEY,"
                    + "status_name VARCHAR(32),"
                    + "index_name VARCHAR(256),"
                    + "created_ts BIGINT NOT NULL,"
                    + "updated_ts BIGINT NOT NULL,"
                    + "payload_json TEXT,"
                    + "result_json TEXT)";
            try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
                st.execute(ddl);
                // target-aware adhoc：存量部署升级迁移——按 metadata 判缺再 ALTER，逐列独立幂等，
                // 不 DROP 不重建（旧作业行原样保留，其 target 语义经 payload 回读归一 host）。
                addColumnIfMissing(c, "target_id", "VARCHAR(64)");
                addColumnIfMissing(c, "target_name", "VARCHAR(128)");
                addColumnIfMissing(c, "target_es_version", "VARCHAR(32)");
                try {
                    // MySQL 无 CREATE INDEX IF NOT EXISTS：重复建索引报错直接吞（幂等语义自实现）
                    st.execute("CREATE INDEX idx_" + TABLE + "_updated ON " + TABLE + " (updated_ts)");
                } catch (SQLException ignore) {
                    logger.debug("[esquerystudio-adhoc-jdbc] updated_ts 索引已存在，跳过");
                }
                schemaReady = true;
                logger.info("[JdbcAdhocJobStore] schema ready: {}", TABLE);
            } catch (SQLException e) {
                throw new IllegalStateException("初始化 " + TABLE + " 表失败: " + e.getMessage(), e);
            }
        }
    }

    /** 逐列幂等 ALTER：metadata 里有列就跳过（H2/MySQL 对重复 ADD COLUMN 都直接报错）。 */
    private void addColumnIfMissing(Connection c, String column, String type) throws SQLException {
        try (ResultSet rs = c.getMetaData().getColumns(null, null, TABLE, column)) {
            if (rs.next()) {
                return;
            }
        }
        try (Statement st = c.createStatement()) {
            st.execute("ALTER TABLE " + TABLE + " ADD COLUMN " + column + " " + type);
            logger.info("[JdbcAdhocJobStore] schema 迁移：新增列 {} ({})", column, type);
        }
    }
}
