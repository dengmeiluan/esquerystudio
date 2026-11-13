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

import org.junit.Test;

import javax.sql.DataSource;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * JDBC 档富列（conn_id/conn_name/ip/cost_ms）三态契约——
 * 新表全维落档 / 旧表探测降级（写入与回读都不丢条） / 富列中途失败永久回退重试一次。
 * 桩为 JDK 动态代理（仓内无 mockito/h2，本仓测试基线=直构造）。
 */
public class JdbcConsoleOpsAuditStoreRichColumnTest {

    /* ── 假数据库桩 ── */
    private static final class FakeDb {
        final List<String> preparedSql = new ArrayList<>();
        final List<Map<Integer, Object>> boundParams = new ArrayList<>();
        final List<Map<String, Object>> rows = new ArrayList<>();
        boolean alterThrows;        /* ALTER 失败（旧表无权限） */
        boolean probeFails;         /* 富列探测失败（旧表） */
        boolean richInsertThrows;   /* 富列 INSERT 失败（模拟中途缺列） */

        private SQLException dup() {
            return new SQLException("Duplicate column name(桩)");
        }

        DataSource dataSource() {
            InvocationHandler connH = (proxy, m, args) -> {
                switch (m.getName()) {
                    case "prepareStatement": return prepStmt((String) args[0]);
                    case "createStatement": return stmt();
                    case "close": case "setAutoCommit": case "commit": return null;
                    default: throw new UnsupportedOperationException("Connection." + m.getName());
                }
            };
            InvocationHandler dsH = (proxy, m, args) -> {
                if (m.getName().equals("getConnection")) {
                    return Connection.class.cast(
                            Proxy.newProxyInstance(FakeDb.class.getClassLoader(), new Class<?>[]{Connection.class}, connH));
                }
                throw new UnsupportedOperationException("DataSource." + m.getName());
            };
            return (DataSource) Proxy.newProxyInstance(FakeDb.class.getClassLoader(),
                    new Class<?>[]{DataSource.class}, dsH);
        }

        private PreparedStatement prepStmt(String sql) {
            preparedSql.add(sql);
            Map<Integer, Object> params = new LinkedHashMap<>();
            boundParams.add(params);
            InvocationHandler h = (proxy, m, args) -> {
                switch (m.getName()) {
                    case "setString": case "setLong": case "setObject": case "setInt":
                    case "setNull":
                        params.put((Integer) args[0], args[0] instanceof Integer && "setNull".equals(m.getName()) ? "NULL" : args[1]);
                        return null;
                    case "executeUpdate":
                        if (sql.contains("conn_id") && richInsertThrows) {
                            throw new SQLException("Unknown column 'conn_id'(桩)");
                        }
                        return 1;
                    case "executeQuery":
                        if (sql.startsWith("SELECT *")) {
                            return resultSet(rows);
                        }
                        throw new SQLException("意外查询(桩): " + sql);
                    case "close": return null;
                    default: throw new UnsupportedOperationException("PS." + m.getName());
                }
            };
            return (PreparedStatement) Proxy.newProxyInstance(FakeDb.class.getClassLoader(),
                    new Class<?>[]{PreparedStatement.class}, h);
        }

        private Statement stmt() {
            InvocationHandler h = (proxy, m, args) -> {
                switch (m.getName()) {
                    case "execute":
                        String sql = (String) args[0];
                        if (sql.startsWith("ALTER") && alterThrows) {
                            throw dup();
                        }
                        return true;
                    case "executeQuery":
                        String q = (String) args[0];
                        if (q.contains("conn_id, conn_name")) {
                            if (probeFails) {
                                throw dup();
                            }
                            return resultSet(new ArrayList<>());
                        }
                        throw new SQLException("意外探测(桩): " + q);
                    case "close": return null;
                    default: throw new UnsupportedOperationException("Stmt." + m.getName());
                }
            };
            return (Statement) Proxy.newProxyInstance(FakeDb.class.getClassLoader(),
                    new Class<?>[]{Statement.class}, h);
        }

        private ResultSet resultSet(List<Map<String, Object>> data) {
            final int[] cursor = {-1};
            final AtomicBoolean lastNull = new AtomicBoolean(false);
            InvocationHandler h = (proxy, m, args) -> {
                switch (m.getName()) {
                    case "next":
                        cursor[0]++;
                        return cursor[0] < data.size();
                    case "getString": {
                        Object v = cursor[0] >= 0 && cursor[0] < data.size()
                                ? data.get(cursor[0]).get(String.valueOf(args[0])) : null;
                        lastNull.set(v == null);
                        return v == null ? null : String.valueOf(v);
                    }
                    case "getLong": {
                        Object v = cursor[0] >= 0 && cursor[0] < data.size()
                                ? data.get(cursor[0]).get(String.valueOf(args[0])) : null;
                        lastNull.set(v == null);
                        return v == null ? 0L : ((Number) v).longValue();
                    }
                    case "getInt": {
                        Object v = cursor[0] >= 0 && cursor[0] < data.size()
                                ? data.get(cursor[0]).get(String.valueOf(args[0])) : null;
                        lastNull.set(v == null);
                        return v == null ? 0 : ((Number) v).intValue();
                    }
                    case "wasNull":
                        return lastNull.get();
                    case "close": return null;
                    default: throw new UnsupportedOperationException("RS." + m.getName());
                }
            };
            return (ResultSet) Proxy.newProxyInstance(FakeDb.class.getClassLoader(),
                    new Class<?>[]{ResultSet.class}, h);
        }
    }

    private static ConsoleOpsAuditEvent ev() {
        return ConsoleOpsAuditEvent.builder()
                .username("test-user-1").displayName("测试用户一").role("VIEWER")
                .method("GET").uri("/internal/es/index/overview")
                .action("PAGE_DENIED").httpStatus(403).detail("page=overview")
                .connId("3556353a").connName("腾讯云UAT").ip("203.0.113.9").costMs(7L)
                .build();
    }

    private static void awaitTasks(JdbcConsoleOpsAuditStore store, int n) throws Exception {
        Field f = JdbcConsoleOpsAuditStore.class.getDeclaredField("executor");
        f.setAccessible(true);
        ThreadPoolExecutor ex = (ThreadPoolExecutor) f.get(store);
        long deadline = System.currentTimeMillis() + 5000;
        while (ex.getCompletedTaskCount() < n && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
    }

    private static int insertsOf(FakeDb db, String marker) {
        int n = 0;
        for (String sql : db.preparedSql) {
            if (sql.startsWith("INSERT") && sql.contains(marker)) {
                n++;
            }
        }
        return n;
    }

    @Test
    public void 新表_富列INSERT_13参数全维落档() throws Exception {
        FakeDb db = new FakeDb();
        db.alterThrows = true; /* 新表列已在 CREATE 中：ALTER 报重复列（被吞，富列在） */
        JdbcConsoleOpsAuditStore store = new JdbcConsoleOpsAuditStore(db.dataSource());

        store.record(ev());
        awaitTasks(store, 1);

        assertEquals("富列 INSERT 恰一次", 1, insertsOf(db, "conn_id"));
        String sql = db.preparedSql.stream().filter(s -> s.startsWith("INSERT")).findFirst().orElse("");
        assertTrue("INSERT 必须含四富列：" + sql,
                sql.contains("conn_id") && sql.contains("conn_name") && sql.contains("ip") && sql.contains("cost_ms"));
        assertEquals("13 个绑定参数", 13, db.boundParams.get(0).size());

        /* 查询回读富维度 */
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ts", 123L); row.put("username", "test-user-1"); row.put("role_name", "VIEWER");
        row.put("method", "GET"); row.put("uri", "/overview"); row.put("action_name", "PAGE_DENIED");
        row.put("http_status", 403); row.put("conn_id", "3556353a"); row.put("conn_name", "腾讯云UAT");
        row.put("ip", "203.0.113.9"); row.put("cost_ms", 7L);
        db.rows.add(row);
        List<ConsoleOpsAuditEvent> out = store.search(null, null, 10, 0, null);
        assertEquals(1, out.size());
        assertEquals("3556353a", out.get(0).getConnId());
        assertEquals("腾讯云UAT", out.get(0).getConnName());
        assertEquals("203.0.113.9", out.get(0).getIp());
        assertEquals(Long.valueOf(7L), out.get(0).getCostMs());
    }

    @Test
    public void 旧表_探测失败_永久降级旧9列且审计照记() throws Exception {
        FakeDb db = new FakeDb();
        db.alterThrows = true;
        db.probeFails = true;
        JdbcConsoleOpsAuditStore store = new JdbcConsoleOpsAuditStore(db.dataSource());

        store.record(ev());
        store.record(ev());
        awaitTasks(store, 2);

        assertEquals("降级后只走旧 9 列 INSERT", 2, insertsOf(db, "action_name"));
        assertEquals("富列 INSERT 零次", 0, insertsOf(db, "conn_id"));
        String sql = db.preparedSql.stream().filter(s -> s.startsWith("INSERT")).findFirst().orElse("");
        assertTrue("旧 9 列 INSERT 不含富列：" + sql, !sql.contains("conn_id"));

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ts", 1L); row.put("username", "u"); row.put("role_name", "VIEWER");
        row.put("method", "GET"); row.put("uri", "/overview"); row.put("action_name", "PAGE_DENIED");
        row.put("http_status", 403);
        db.rows.add(row);
        List<ConsoleOpsAuditEvent> out = store.search(null, null, 10, 0, null);
        assertEquals(1, out.size());
        assertNull("旧表无富列维度", out.get(0).getConnId());
    }

    @Test
    public void 富列中途失败_同一事件降级旧列重试一次_审计不丢条() throws Exception {
        FakeDb db = new FakeDb();
        db.richInsertThrows = true; /* 探测成功但真插失败（表被并发变更等） */
        JdbcConsoleOpsAuditStore store = new JdbcConsoleOpsAuditStore(db.dataSource());

        store.record(ev());
        awaitTasks(store, 1); /* 富列失败与降级重试发生在同一异步任务内 */

        assertEquals("富列尝试 1 次", 1, insertsOf(db, "conn_id"));
        assertEquals("旧列重试 1 次（审计不丢条）", 1,
                db.preparedSql.stream().filter(s -> s.startsWith("INSERT") && !s.contains("conn_id")).count());
    }
}
