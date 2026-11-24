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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import java.util.Locale;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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
import java.util.UUID;

/**
 * 多集群连接档案——宿主数据库档（ 平台化底座）：档案落宿主 {@code DataSource}
 * 的 {@code esquerystudio_conn} 表（首次使用自动建表），让接入方（如 宿主）用
 * 自己的数据库统一管理多套集群，并纳入其备份/权限/运维体系。
 *
 * <p>只依赖 {@code javax.sql.DataSource}（JDK 标准接口），零新增 maven 依赖；
 * DDL 用 MySQL/H2 通用方言。密码红线与 {@link EsConnStore} 一致：list 脱敏、get 才含明文。</p>
 *
 * @author aicoding
 */
public class JdbcConnStore implements ConnStore {

    private static final Logger LOG = LoggerFactory.getLogger(JdbcConnStore.class);
    private static final String TABLE = "esquerystudio_conn";

    private final DataSource dataSource;
    private volatile boolean schemaReady;
    /** 凭据静态加密（null=旁路：旧构造/单测保持明文行为不变）。 */
    private final ConnCrypto crypto;

    private final org.springframework.context.ApplicationEventPublisher events;

    public JdbcConnStore(DataSource dataSource) {
        this(dataSource, null, null);
    }

    public JdbcConnStore(DataSource dataSource, org.springframework.context.ApplicationEventPublisher events) {
        this(dataSource, events, null);
    }

    public JdbcConnStore(DataSource dataSource, org.springframework.context.ApplicationEventPublisher events,
                         ConnCrypto crypto) {
        this.dataSource = dataSource;
        this.events = events;
        this.crypto = crypto;
    }

    @Override
    public List<Map<String, Object>> list() {
        ensureSchema();
        String sql = "SELECT * FROM " + TABLE + " ORDER BY name";
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            List<Map<String, Object>> out = new ArrayList<>();
            while (rs.next()) {
                if (STATE_DISMISSED.equalsIgnoreCase(rs.getString("sync_state"))) {
                    continue; // 软删墓碑:读面不透出(列表/探活/监控同源自动隐身)
                }
                out.add(masked(rs));
            }
            return out;
        } catch (SQLException e) {
            throw new IllegalStateException("读取集群连接失败(jdbc): " + e.getMessage(), e);
        }
    }

    @Override
    public RemoteClusterConn get(String id) {
        Map<String, Object> row = getRow(id);
        if (row == null || STATE_DISMISSED.equalsIgnoreCase(str(row.get("sync_state")))) {
            return null; // 软删墓碑:数据面不可见(路由/探活不可再建连)
        }
        RemoteClusterConn conn = new RemoteClusterConn(
                str(row.get("scheme")), str(row.get("host")),
                row.get("port") instanceof Number ? ((Number) row.get("port")).intValue() : 9200,
                str(row.get("username")), decryptPwd(str(row.get("password"))));
        conn.setMinRole(str(row.get("min_role")));
        conn.setAuthType(str(row.get("auth_type")));
        conn.setEnv(str(row.get("env")));
        conn.setConnectTimeoutMs(intOrNull(row.get("connect_timeout_ms")));
        conn.setSocketTimeoutMs(intOrNull(row.get("socket_timeout_ms")));
        return conn;
    }

    @Override
    public String getName(String id) {
        Map<String, Object> row = getRow(id);
        return row == null ? null : str(row.get("name"));
    }

    @Override
    public String getVersion(String id) {
        Map<String, Object> row = getRow(id);
        return row == null ? null : str(row.get("es_version"));
    }

    /** 存储形态密码 → 明文（null crypto=旁路；无前缀=存量明文直通；密文解密失败显性异常）。 */
    private String decryptPwd(String stored) {
        return crypto == null ? stored : crypto.decrypt(stored);
    }

    public Map<String, Object> save(String id, String name, String url, String username, String password,
                                    String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
        return doSave(id, name, url, username, password, minRole, connectTimeoutMs, socketTimeoutMs, env, null);
    }

    /** 10 参扩展形态（API Key 认证支持）：authType="API_KEY" 时 secret 位承载 ApiKey 秘钥。 */
    @Override
    public Map<String, Object> save(String id, String name, String url, String username, String secret,
                                    String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs,
                                    String env, String authType) {
        return doSave(id, name, url, username, secret, minRole, connectTimeoutMs, socketTimeoutMs, env, authType);
    }

    private Map<String, Object> doSave(String id, String name, String url, String username, String password,
                                       String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs,
                                       String env, String authType) {
        ensureSchema();
        // 校验规则与 ES 档完全一致（契约在 ConnStore，两档实现不许分叉）
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("连接名称不可为空");
        }
        if (env != null && !env.trim().isEmpty()
                && !"PROD".equalsIgnoreCase(env.trim())
                && !"STAGING".equalsIgnoreCase(env.trim())
                && !"QA".equalsIgnoreCase(env.trim())
                && !"DEV".equalsIgnoreCase(env.trim())) {
            throw new IllegalArgumentException("env 仅支持 PROD/STAGING/QA/DEV，实际: " + env);
        }
        if (authType != null && !authType.trim().isEmpty()
                && !"BASIC".equalsIgnoreCase(authType.trim())
                && !"API_KEY".equalsIgnoreCase(authType.trim())) {
            throw new IllegalArgumentException("authType 仅支持 BASIC/API_KEY，实际: " + authType);
        }
        if (minRole != null && !minRole.trim().isEmpty()
                && !"VIEWER".equalsIgnoreCase(minRole.trim())
                && !"OPERATOR".equalsIgnoreCase(minRole.trim())
                && !"ADMIN".equalsIgnoreCase(minRole.trim())) {
            throw new IllegalArgumentException("minRole 仅支持 VIEWER/OPERATOR/ADMIN，实际: " + minRole);
        }
        if (connectTimeoutMs != null && (connectTimeoutMs < 100 || connectTimeoutMs > 600_000)) {
            throw new IllegalArgumentException("connectTimeoutMs 需在 100~600000 毫秒之间");
        }
        if (socketTimeoutMs != null && (socketTimeoutMs < 100 || socketTimeoutMs > 3_600_000)) {
            throw new IllegalArgumentException("socketTimeoutMs 需在 100~3600000 毫秒之间");
        }
        RemoteClusterConn parsed = RemoteClusterConn.parse(url);
        if (username != null && !username.trim().isEmpty()) {
            parsed.setUsername(username.trim());
        }
        if (password != null && !password.isEmpty()) {
            parsed.setPassword(password);
        }
        parsed.validate();

        String docId = (id == null || id.trim().isEmpty())
                ? UUID.randomUUID().toString().replace("-", "").substring(0, 8)
                : id.trim();
        Map<String, Object> old = getRow(docId);
        long now = System.currentTimeMillis();
        // 密码留空且已有旧档案 → 沿用旧密码的「存储形态」（密文原样沿用，绝不二次加密）；
        // 本次新提供的密码一律加密落库（存量明文经再次编辑自动升级）。
        String pw;
        if ((parsed.getPassword() == null || parsed.getPassword().isEmpty()) && old != null) {
            pw = str(old.get("password"));
        } else {
            pw = crypto == null ? parsed.getPassword() : crypto.encrypt(parsed.getPassword());
        }
        String normRole = minRole == null || minRole.trim().isEmpty() ? null : minRole.trim().toUpperCase(Locale.ROOT);
        String normEnv = env == null || env.trim().isEmpty() ? null : env.trim().toUpperCase(Locale.ROOT);
        String normAuth = authType == null || authType.trim().isEmpty()
                ? "BASIC" : authType.trim().toUpperCase(Locale.ROOT);
        String esVersion = old != null ? str(old.get("es_version")) : null;
        long createdAt = old != null && old.get("created_at") instanceof Number
                ? ((Number) old.get("created_at")).longValue() : now;

        String sql = old == null
                ? "INSERT INTO " + TABLE + " (name,scheme,host,port,username,password,min_role,"
                  + "connect_timeout_ms,socket_timeout_ms,env,auth_type,es_version,created_at,updated_at,id) "
                  + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
                : "UPDATE " + TABLE + " SET name=?,scheme=?,host=?,port=?,username=?,password=?,min_role=?,"
                  + "connect_timeout_ms=?,socket_timeout_ms=?,env=?,auth_type=?,es_version=?,created_at=?,updated_at=? "
                  + "WHERE id=?";
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, name.trim());
            ps.setString(2, parsed.getScheme());
            ps.setString(3, parsed.getHost());
            ps.setInt(4, parsed.getPort());
            ps.setString(5, parsed.getUsername());
            ps.setString(6, pw);
            ps.setString(7, normRole);
            setIntOrNull(ps, 8, connectTimeoutMs);
            setIntOrNull(ps, 9, socketTimeoutMs);
            ps.setString(10, normEnv);
            ps.setString(11, normAuth);
            ps.setString(12, esVersion);
            ps.setLong(13, createdAt);
            ps.setLong(14, now);
            ps.setString(15, docId);
            ps.executeUpdate();
            LOG.info("[JdbcConnStore] save conn id={} name={} endpoint={}://{}:{}",
                    docId, name.trim(), parsed.getScheme(), parsed.getHost(), parsed.getPort());
        } catch (SQLException e) {
            throw new IllegalStateException("保存集群连接失败(jdbc): " + e.getMessage(), e);
        }
        if (events != null) {
            events.publishEvent(new LinkLifecycleEvent(LinkLifecycleEvent.Type.SAVED, docId, name.trim(), normEnv));
        }
        Map<String, Object> saved = getRow(docId);
        return maskedFromRow(docId, saved);
    }

    @Override
    public void updateVersion(String id, String esVersion) {
        if (id == null || id.trim().isEmpty() || esVersion == null || esVersion.trim().isEmpty()) {
            return;
        }
        try {
            ensureSchema();
        } catch (Exception e) {
            /* debug→WARN——schema 建不出来是<b>持续性</b>失败（宿主库不可用期间
               每轮探活回写都会再败），比单次 UPDATE 失败更该留痕（裁决时明确暂缓本臂，
               收口，句式与下方 UPDATE 臂 WARN 同源）。吞异常契约不变（版本是增强信息，
               绝不影响探活主流程） */
            LOG.warn("[JdbcConnStore] updateVersion ensureSchema failed: {}", e.getMessage(), e);
            return; // 版本是增强信息，绝不影响探活主流程
        }
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "UPDATE " + TABLE + " SET es_version=? WHERE id=? AND (es_version IS NULL OR es_version<>?)")) {
            ps.setString(1, esVersion.trim());
            ps.setString(2, id.trim());
            ps.setString(3, esVersion.trim());
            if (ps.executeUpdate() > 0) {
                LOG.info("[JdbcConnStore] conn id={} esVersion -> {}", id.trim(), esVersion.trim());
            }
        } catch (SQLException e) {
            /* debug→WARN——「探活到新版本但档案写不进」的低频真异常，无痕则
               版本不刷新无从排查；吞异常契约不变（增强信息绝不影响探活主流程） */
            LOG.warn("[JdbcConnStore] updateVersion failed id={}: {}", id, e.getMessage(), e);
        }
    }

    @Override
    public void delete(String id) {
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM " + TABLE + " WHERE id=?")) {
            ps.setString(1, id);
            ps.executeUpdate();
            LOG.info("[JdbcConnStore] delete conn id={}", id);
            if (events != null) {
                events.publishEvent(new LinkLifecycleEvent(LinkLifecycleEvent.Type.DELETED, id, null, null));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("删除集群连接失败(jdbc): " + e.getMessage(), e);
        }
    }

    /** 连接中心同步域状态标记:STALE=源已失联 / DISMISSED=人工软删墓碑(经 markDismissed 落库)/ null=恢复。失败 WARN 不抛(增强信息红线)。 */
    @Override
    public void markSyncState(String id, String state) {
        if (id == null || id.trim().isEmpty()) {
            return;
        }
        try {
            ensureSchema();
        } catch (Exception e) {
            LOG.warn("[JdbcConnStore] markSyncState ensureSchema failed: {}", e.getMessage(), e);
            return;
        }
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE " + TABLE + " SET sync_state=? WHERE id=?")) {
            if (state == null || state.trim().isEmpty()) {
                ps.setNull(1, java.sql.Types.VARCHAR);
            } else {
                ps.setString(1, state.trim().toUpperCase(java.util.Locale.ROOT));
            }
            ps.setString(2, id.trim());
            ps.executeUpdate();
        } catch (SQLException e) {
            LOG.warn("[JdbcConnStore] markSyncState failed id={}: {}", id, e.getMessage(), e);
        }
    }

    /** 同步档案软删除:sync_state 置 DISMISSED(墓碑保留,契约见 ConnStore);复用 markSyncState 写路径。 */
    @Override
    public void markDismissed(String id) {
        markSyncState(id, STATE_DISMISSED);
    }

    /** 读单条档案的同步域状态标记(STALE/DISMISSED);无标记或档案不存在返回 null。 */
    @Override
    public String getSyncState(String id) {
        Map<String, Object> row = getRow(id);
        return row == null ? null : str(row.get("sync_state"));
    }

    // ---------------- internal ----------------

    /** 首次使用建表（幂等）；MySQL/H2 通用方言。 */
    private void ensureSchema() {
        if (schemaReady) {
            return;
        }
        synchronized (this) {
            if (schemaReady) {
                return;
            }
            String ddl = "CREATE TABLE IF NOT EXISTS " + TABLE + " ("
                    + "id VARCHAR(64) PRIMARY KEY,"
                    + "name VARCHAR(128) NOT NULL,"
                    + "scheme VARCHAR(8),"
                    + "host VARCHAR(255),"
                    + "port INT,"
                    + "username VARCHAR(128),"
                    + "password VARCHAR(512),"
                    + "min_role VARCHAR(16),"
                    + "connect_timeout_ms INT,"
                    + "socket_timeout_ms INT,"
                    + "env VARCHAR(16),"
                    + "auth_type VARCHAR(16),"
                    + "es_version VARCHAR(32),"
                    + "created_at BIGINT,"
                    + "updated_at BIGINT,"
                    + "sync_state VARCHAR(16))";
            try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
                st.execute(ddl);
                migrateAddSyncState(c);
                migrateAddAuthType(c);
                schemaReady = true;
                LOG.info("[JdbcConnStore] schema ready: {}", TABLE);
            } catch (SQLException e) {
                throw new IllegalStateException("初始化 " + TABLE + " 表失败: " + e.getMessage(), e);
            }
        }
    }

    /** 存量表幂等补列(auth_type,API Key 认证支持;探测口径与 sync_state 迁移一致)。 */
    private void migrateAddAuthType(Connection c) throws SQLException {
        java.sql.DatabaseMetaData meta = c.getMetaData();
        if (meta == null) {
            LOG.warn("[JdbcConnStore] 元数据不可得，跳过 auth_type 列迁移");
            return;
        }
        if (hasColumn(meta, TABLE, "auth_type")
                || hasColumn(meta, TABLE.toUpperCase(java.util.Locale.ROOT), "AUTH_TYPE")) {
            return;
        }
        try (Statement st = c.createStatement()) {
            st.execute("ALTER TABLE " + TABLE + " ADD COLUMN auth_type VARCHAR(16)");
            LOG.info("[JdbcConnStore] migrated: {} ADD COLUMN auth_type", TABLE);
        }
    }

    /** 存量表幂等迁移:缺 sync_state 列则补(DatabaseMetaData 探测,H2/MySQL 通用)。 */
    private void migrateAddSyncState(Connection c) throws SQLException {
        java.sql.DatabaseMetaData meta = c.getMetaData();
        if (meta == null) {
            // 元数据不可得的包装/桩驱动防御:迁移是增强步骤,探测不了就跳过,绝不向 ensureSchema
            // 的 SQLException 失败面外泄露 RuntimeException(真实驱动永不 null)
            return;
        }
        // 元数据模式匹配区分大小写:MySQL 按小写存、H2 把未加引号标识符统一大写存,各探一档
        if (hasColumn(meta, TABLE, "sync_state")
                || hasColumn(meta, TABLE.toUpperCase(java.util.Locale.ROOT), "SYNC_STATE")) {
            return;
        }
        try (Statement st = c.createStatement()) {
            st.execute("ALTER TABLE " + TABLE + " ADD COLUMN sync_state VARCHAR(16)");
            LOG.info("[JdbcConnStore] migrated: {} ADD COLUMN sync_state", TABLE);
        }
    }

    private static boolean hasColumn(java.sql.DatabaseMetaData meta, String table, String column) throws SQLException {
        try (ResultSet rs = meta.getColumns(null, null, table, column)) {
            return rs.next();
        }
    }

    private Map<String, Object> getRow(String id) {
        if (id == null || id.trim().isEmpty()) {
            return null;
        }
        ensureSchema();
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT * FROM " + TABLE + " WHERE id=?")) {
            ps.setString(1, id.trim());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                Map<String, Object> row = new LinkedHashMap<>();
                java.sql.ResultSetMetaData md = rs.getMetaData();
                for (int i = 1; i <= md.getColumnCount(); i++) {
                    row.put(md.getColumnLabel(i).toLowerCase(java.util.Locale.ROOT), rs.getObject(i));
                }
                return row;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("读取集群连接失败(jdbc): " + e.getMessage(), e);
        }
    }

    /** 行 → 脱敏视图（字段名对齐 ES 档的驼峰出参，前端零改动）。 */
    private static Map<String, Object> masked(ResultSet rs) throws SQLException {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("id", rs.getString("id"));
        v.put("name", rs.getString("name"));
        v.put("scheme", rs.getString("scheme"));
        v.put("host", rs.getString("host"));
        v.put("port", rs.getObject("port"));
        v.put("username", rs.getString("username"));
        String pw = rs.getString("password");
        v.put("hasPassword", pw != null && !pw.isEmpty());
        String minRole = rs.getString("min_role");
        v.put("minRole", minRole == null ? "VIEWER" : minRole);
        v.put("esVersion", rs.getString("es_version"));
        v.put("env", rs.getString("env"));
        v.put("authType", rs.getString("auth_type"));
        v.put("connectTimeoutMs", rs.getObject("connect_timeout_ms"));
        v.put("socketTimeoutMs", rs.getObject("socket_timeout_ms"));
        v.put("createdAt", rs.getObject("created_at"));
        v.put("updatedAt", rs.getObject("updated_at"));
        v.put("syncState", rs.getString("sync_state"));
        return v;
    }

    private static Map<String, Object> maskedFromRow(String id, Map<String, Object> row) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("id", id);
        v.put("name", row.get("name"));
        v.put("scheme", row.get("scheme"));
        v.put("host", row.get("host"));
        v.put("port", row.get("port"));
        v.put("username", row.get("username"));
        String pw = str(row.get("password"));
        v.put("hasPassword", pw != null && !pw.isEmpty());
        v.put("minRole", row.get("min_role") == null ? "VIEWER" : row.get("min_role"));
        v.put("esVersion", row.get("es_version"));
        v.put("env", row.get("env"));
        v.put("authType", row.get("auth_type"));
        v.put("connectTimeoutMs", row.get("connect_timeout_ms"));
        v.put("socketTimeoutMs", row.get("socket_timeout_ms"));
        v.put("createdAt", row.get("created_at"));
        v.put("updatedAt", row.get("updated_at"));
        v.put("syncState", row.get("sync_state"));
        return v;
    }

    private static void setIntOrNull(PreparedStatement ps, int idx, Integer v) throws SQLException {
        if (v == null) {
            ps.setNull(idx, java.sql.Types.INTEGER);
        } else {
            ps.setInt(idx, v);
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer intOrNull(Object o) {
        return o instanceof Number ? ((Number) o).intValue() : null;
    }
}
