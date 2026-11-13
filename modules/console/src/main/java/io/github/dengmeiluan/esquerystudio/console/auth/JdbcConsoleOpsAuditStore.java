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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 控制台操作审计——宿主数据库档（ 平台化底座）：审计落宿主 {@code DataSource}
 * 的 {@code esquerystudio_ops_audit} 表（首次使用自动建表），接入方可用自己的 BI/SQL
 * 直接分析控制台操作流水，并与其用户体系（username/displayName）天然对齐。
 *
 * <p>异步单线程 + 队列满丢弃，与 ES 档同一契约：审计永不反噬业务可用性。
 * 查询出参与 ES 档同构（类型化记录列表），ES 形态不再泄漏进 SPI。</p>
 *
 * @author aicoding
 */
public class JdbcConsoleOpsAuditStore implements ConsoleOpsAuditStore {

    private static final Logger LOG = LoggerFactory.getLogger(JdbcConsoleOpsAuditStore.class);
    private static final String TABLE = "esquerystudio_ops_audit";

    private final DataSource dataSource;
    private final ThreadPoolExecutor executor;
    private volatile boolean schemaReady;
    /* 富列（conn_id/conn_name/ip/cost_ms）可用性——ensureSchema 探测定值，
       写路径首败也可永久降级（insertRow）；查询路径按此开关决定是否回读富列 */
    private volatile boolean richColumns = true;
    /* 审计落库失败累计（首条 WARN 节流计数，见 warnAuditDrop） */
    private final AtomicLong dropCount = new AtomicLong();

    public JdbcConsoleOpsAuditStore(DataSource dataSource) {
        this.dataSource = dataSource;
        this.executor = new ThreadPoolExecutor(1, 1, 60, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(1000),
                r -> {
                    Thread t = new Thread(r, "esquerystudio-ops-audit-jdbc");
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.DiscardPolicy());
        this.executor.allowCoreThreadTimeOut(true);
    }

    /** 上下文关停：停收新审计，队列中已提交记录自然落库（daemon 线程不阻 JVM 退出）。 */
    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }

    /** 记一笔操作（异步，永不抛）。：唯一写入口为富事件；旧表兼容：优先富列插入，
     * 首次 SQLException（列不存在/无 ALTER 权限）永久回退旧 9 列——契约红线审计永不反噬业务。 */
    @Override
    public void record(ConsoleOpsAuditEvent event) {
        try {
            long ts = System.currentTimeMillis();
            String clipped = event.getDetail() == null || event.getDetail().isEmpty() ? null
                    : event.getDetail().length() > 2000 ? event.getDetail().substring(0, 2000) : event.getDetail();
            String uri = event.getUri() != null && event.getUri().length() > 512
                    ? event.getUri().substring(0, 512) : event.getUri();
            executor.execute(() -> {
                try {
                    ensureSchema();
                    insertRow(ts, event, uri, clipped);
                } catch (Exception e) {
                    warnAuditDrop("落审计失败", e);
                }
            });
        } catch (Exception e) {
            warnAuditDrop("构造审计失败", e);
        }
    }

    /** 富列插入；旧表缺列时首败永久降级旧 9 列重试一次（审计不丢条）。 */
    private void insertRow(long ts, ConsoleOpsAuditEvent event, String uri, String clipped) throws SQLException {
        if (richColumns) {
            try (Connection c = dataSource.getConnection();
                 PreparedStatement ps = c.prepareStatement(
                         "INSERT INTO " + TABLE + " (ts,username,display_name,role_name,method,uri,action_name,http_status,detail,"
                                 + "conn_id,conn_name,ip,cost_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")) {
                fillLegacy(ps, 1, ts, event.getUsername(), event.getDisplayName(), event.getRole(), event.getMethod(),
                        uri, event.getAction(), event.getHttpStatus(), clipped);
                ps.setString(10, event.getConnId());
                ps.setString(11, event.getConnName());
                ps.setString(12, event.getIp());
                if (event.getCostMs() != null) {
                    ps.setLong(13, event.getCostMs());
                } else {
                    ps.setNull(13, java.sql.Types.BIGINT);
                }
                ps.executeUpdate();
                return;
            } catch (SQLException e) {
                // 列缺失/权限不足：永久降级旧列（后续 INSERT 不再踩富列），本次降级重试
                richColumns = false;
                LOG.info("[esquerystudio-audit-jdbc] 富列不可用（{}），永久回退旧 9 列落档", e.getMessage(), e);
            }
        }
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO " + TABLE + " (ts,username,display_name,role_name,method,uri,action_name,http_status,detail) "
                             + "VALUES (?,?,?,?,?,?,?,?,?)")) {
            fillLegacy(ps, 1, ts, event.getUsername(), event.getDisplayName(), event.getRole(), event.getMethod(),
                    uri, event.getAction(), event.getHttpStatus(), clipped);
            ps.executeUpdate();
        }
    }

    private static void fillLegacy(PreparedStatement ps, int base, long ts, String username, String displayName,
                                   String role, String method, String uri, String action, int httpStatus,
                                   String clipped) throws SQLException {
        ps.setLong(base, ts);
        ps.setString(base + 1, username);
        ps.setString(base + 2, displayName == null || displayName.isEmpty() ? null : displayName);
        ps.setString(base + 3, role);
        ps.setString(base + 4, method);
        ps.setString(base + 5, uri);
        ps.setString(base + 6, action);
        ps.setInt(base + 7, httpStatus);
        ps.setString(base + 8, clipped);
    }

    /**
     * 审计落库失败观测——首条 WARN 留痕，此后仅累计静默。丢审计流水=丢合规
     * 留痕数据，静默（debug 级常态不可见）不可观测；但宿主库不可用时每笔操作都会失败，
     * 逐条 WARN 会刷屏（节流形态与  addErrors「n&gt;0 才打」的差别在此：那是低频
     * 落账，这是高频可复现路径），故取「首条 WARN + 计数静默」。
     */
    private void warnAuditDrop(String where, Exception e) {
        long drops = dropCount.incrementAndGet();
        if (drops == 1) {
            LOG.warn("[esquerystudio-audit-jdbc] {}（首次，后续失败仅累计不再打）：{}", where, e.getMessage(), e);
        }
    }

    /** 审计流水查询（timestamp 倒序）。：出参类型化，与 ES 档同构。 */
    @Override
    public List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs) {
        ensureSchema();
        StringBuilder sql = new StringBuilder("SELECT * FROM " + TABLE + " WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (username != null && !username.isEmpty()) {
            sql.append(" AND username=?");
            args.add(username);
        }
        if (action != null && !action.isEmpty()) {
            sql.append(" AND action_name=?");
            args.add(action);
        }
        /* 时间范围下推（sinceMs 毫秒，ts 列为毫秒 epoch） */
        if (sinceMs != null) {
            sql.append(" AND ts>=?");
            args.add(sinceMs);
        }
        int limit = Math.min(Math.max(size, 1), 500);
        sql.append(" ORDER BY ts DESC, id DESC LIMIT ").append(limit)
           .append(" OFFSET ").append(Math.max(from, 0));
        List<ConsoleOpsAuditEvent> hits = new ArrayList<>();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql.toString())) {
            for (int i = 0; i < args.size(); i++) {
                ps.setObject(i + 1, args.get(i));
            }
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    hits.add(rowToEvent(rs));
                }
            }
            return hits;
        } catch (SQLException e) {
            throw new IllegalStateException("审计查询失败(jdbc): " + e.getMessage(), e);
        }
    }

    /** 行 → 类型化记录（列名与 {@link #record} 落库键一一对应；富列按探测定开关回读）。 */
    private ConsoleOpsAuditEvent rowToEvent(ResultSet rs) throws SQLException {
        ConsoleOpsAuditEvent.Builder b = ConsoleOpsAuditEvent.builder()
                .username(rs.getString("username"))
                .displayName(rs.getString("display_name"))
                .role(rs.getString("role_name"))
                .method(rs.getString("method"))
                .uri(rs.getString("uri"))
                .action(rs.getString("action_name"))
                .httpStatus(rs.getInt("http_status"))
                .detail(rs.getString("detail"))
                .timestamp(rs.getLong("ts"));
        if (richColumns) {
            b.connId(rs.getString("conn_id"))
                    .connName(rs.getString("conn_name"))
                    .ip(rs.getString("ip"));
            long costMs = rs.getLong("cost_ms");
            if (!rs.wasNull()) {
                b.costMs(costMs);
            }
        }
        b.source("console");
        return b.build();
    }

    /** 首次使用建表（幂等）；role/action 是部分数据库保留字，列名统一加 _name 后缀避开。
     *  自增主键按库方言分支：SQLite（standalone 默认本地档）只认
     *  {@code INTEGER PRIMARY KEY AUTOINCREMENT}，其余（MySQL 等）保持
     *  {@code BIGINT PRIMARY KEY AUTO_INCREMENT}——固定单一方言会让全新实例首查即 500。 */
    private void ensureSchema() {
        if (schemaReady) {
            return;
        }
        synchronized (this) {
            if (schemaReady) {
                return;
            }
            String idColumn;
            try (Connection mc = dataSource.getConnection()) {
                String product = mc.getMetaData().getDatabaseProductName();
                idColumn = product != null && product.toLowerCase().contains("sqlite")
                        ? "id INTEGER PRIMARY KEY AUTOINCREMENT"
                        : "id BIGINT PRIMARY KEY AUTO_INCREMENT";
            } catch (SQLException e) {
                throw new IllegalStateException("审计建表方言探测失败: " + e.getMessage(), e);
            } catch (RuntimeException e) {
                /* 元数据不可得（受限连接代理/驱动裁剪）按既有 MySQL 形态继续，成败交由下方 DDL 裁决 */
                idColumn = "id BIGINT PRIMARY KEY AUTO_INCREMENT";
            }
            String ddl = "CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                    + idColumn + ","
                    + "ts BIGINT NOT NULL,"
                    + "username VARCHAR(128),"
                    + "display_name VARCHAR(128),"
                    + "role_name VARCHAR(16),"
                    + "method VARCHAR(12),"
                    + "uri VARCHAR(512),"
                    + "action_name VARCHAR(32),"
                    + "http_status INT,"
                    + "detail TEXT,"
                    + "conn_id VARCHAR(64),"
                    + "conn_name VARCHAR(128),"
                    + "ip VARCHAR(64),"
                    + "cost_ms BIGINT)";
            try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
                st.execute(ddl);
                try {
                    // MySQL 无 CREATE INDEX IF NOT EXISTS：重复建索引报错直接吞（幂等语义自实现）
                    st.execute("CREATE INDEX idx_" + TABLE + "_ts ON " + TABLE + " (ts)");
                } catch (SQLException ignore) {
                    LOG.debug("[esquerystudio-audit-jdbc] ts 索引已存在，跳过");
                }
                /* 存量表补富列（幂等 best-effort）+ 探测定降级——
                   ALTER 全败/探测失败（无权限等）即永久旧 9 列，审计照记不丢。
                   全败（无 ALTER 权限=永久降级定局）升 WARN 恰一次（带权限指引，
                   运维不查源码不知为何审计缺列）；部分成功（列已存在的幂等冲突）维持 debug 不刷屏。 */
                int alterFailed = 0;
                for (String col : new String[]{
                        "ALTER TABLE " + TABLE + " ADD COLUMN conn_id VARCHAR(64)",
                        "ALTER TABLE " + TABLE + " ADD COLUMN conn_name VARCHAR(128)",
                        "ALTER TABLE " + TABLE + " ADD COLUMN ip VARCHAR(64)",
                        "ALTER TABLE " + TABLE + " ADD COLUMN cost_ms BIGINT"}) {
                    try {
                        st.execute(col);
                    } catch (SQLException ignore) {
                        alterFailed++;
                        LOG.debug("[esquerystudio-audit-jdbc] 富列已存在或不可加，跳过：{}", col);
                    }
                }
                if (alterFailed == 4) {
                    LOG.warn("[esquerystudio-audit-jdbc] 审计富列补齐失败,永久 9 列(检查 DB 账号 ALTER 权限)");
                }
                try (java.sql.ResultSet probe = st.executeQuery(
                        "SELECT conn_id, conn_name, ip, cost_ms FROM " + TABLE + " LIMIT 1")) {
                    probe.next();
                    richColumns = true;
                } catch (SQLException e) {
                    richColumns = false;
                    LOG.info("[esquerystudio-audit-jdbc] 富列探测失败（{}），按旧 9 列运行", e.getMessage(), e);
                }
                schemaReady = true;
                LOG.info("[JdbcConsoleOpsAuditStore] schema ready: {} (richColumns={})", TABLE, richColumns);
            } catch (SQLException e) {
                throw new IllegalStateException("初始化 " + TABLE + " 表失败: " + e.getMessage(), e);
            }
        }
    }
}
