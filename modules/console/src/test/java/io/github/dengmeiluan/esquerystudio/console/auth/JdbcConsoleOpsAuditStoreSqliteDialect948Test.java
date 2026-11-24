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

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import org.sqlite.SQLiteDataSource;

import javax.sql.DataSource;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.concurrent.ThreadPoolExecutor;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * JDBC 审计档建表方言契约——{@code ensureSchema} 的自增主键 DDL 必须
 * 按库方言分支：SQLite 档（standalone 默认 {@code store=sqlite}，~/.esquerystudio/<app>/jobs.db）
 * 用 {@code INTEGER PRIMARY KEY AUTOINCREMENT}，MySQL 档保持既有
 * {@code BIGINT PRIMARY KEY AUTO_INCREMENT}。方言探测不可得（受限连接代理）回落
 * MySQL 形态。既有富列契约测试用 JDK 代理假库（方言不敏感，任意 DDL 都被桩吞下），
 * 本测试落真 SQLite——固定单一方言时建表即
 * {@code [SQLITE_ERROR] near "AUTO_INCREMENT": syntax error}，全新实例审计查询/落库
 * 全灭（审计页整页 500）。
 */
public class JdbcConsoleOpsAuditStoreSqliteDialect948Test {

    private Path dbFile;
    private JdbcConsoleOpsAuditStore store;

    @Before
    public void setUp() throws Exception {
        dbFile = Files.createTempFile("esquerystudio-audit-dialect-", ".db");
        Files.deleteIfExists(dbFile); /* SQLite 首连自建，先摘临时文件占位 */
        SQLiteDataSource ds = new SQLiteDataSource();
        ds.setUrl("jdbc:sqlite:" + dbFile.toAbsolutePath());
        store = new JdbcConsoleOpsAuditStore((DataSource) ds);
    }

    @After
    public void tearDown() throws Exception {
        store.shutdown();
        Files.deleteIfExists(dbFile);
    }

    @Test
    public void sqlite档_建表幂等_查询空集不炸() {
        /* 修复前：ensureSchema 的 MySQL 方言 DDL 在 SQLite 上抛
           IllegalStateException(初始化 esquerystudio_ops_audit 表失败…AUTO_INCREMENT…) */
        List<ConsoleOpsAuditEvent> first = store.search(null, null, 10, 0, null);
        assertTrue("全新库首次查询应得空集：" + first, first.isEmpty());
        List<ConsoleOpsAuditEvent> second = store.search(null, null, 10, 0, null);
        assertTrue("幂等重建后查询仍空集", second.isEmpty());
    }

    @Test
    public void sqlite档_记录查询往返_自增主键不落地列() throws Exception {
        store.record(ConsoleOpsAuditEvent.builder()
                .username("dialect-user").displayName("方言用户").role("VIEWER")
                .method("GET").uri("/internal/es/index/overview")
                .action("LOGIN").httpStatus(200).detail("dialect-roundtrip")
                .connId("c1").connName("conn-948").ip("127.0.0.1").costMs(3L)
                .build());
        awaitTasks(store, 1);

        List<ConsoleOpsAuditEvent> rows = store.search(null, null, 10, 0, null);
        assertEquals("往返恰一条", 1, rows.size());
        assertEquals("dialect-user", rows.get(0).getUsername());
        assertEquals("conn-948", rows.get(0).getConnName());

        /* 自增主键真实在位（非 NULL 且库侧自管）——方言分支正确性的落库面铁证 */
        try (Connection c = open(dbFile);
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT id FROM " + "esquerystudio_ops_audit")) {
            assertTrue(rs.next());
            assertTrue("自增 id 必须 >0", rs.getLong(1) > 0);
        }
    }

    private static Connection open(Path file) throws Exception {
        SQLiteDataSource ds = new SQLiteDataSource();
        ds.setUrl("jdbc:sqlite:" + file.toAbsolutePath());
        return ds.getConnection();
    }

    private static void awaitTasks(JdbcConsoleOpsAuditStore target, int n) throws Exception {
        Field f = JdbcConsoleOpsAuditStore.class.getDeclaredField("executor");
        f.setAccessible(true);
        ThreadPoolExecutor ex = (ThreadPoolExecutor) f.get(target);
        long deadline = System.currentTimeMillis() + 5000;
        while (ex.getCompletedTaskCount() < n && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
    }
}
