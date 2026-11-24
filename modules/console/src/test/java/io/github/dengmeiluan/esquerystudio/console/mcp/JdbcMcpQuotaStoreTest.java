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

import org.h2.jdbcx.JdbcDataSource;
import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

/** JDBC 共享配额：行锁内检查+自增，多实例/多线程共用同一把 key 不放大配额。 */
public class JdbcMcpQuotaStoreTest {

    private static final long T0 = 1_795_000_000_000L;

    private JdbcDataSource dataSource() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:mcpquota_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        return ds;
    }

    @Test
    public void twoInstancesShareTheSameRateWindow() {
        JdbcDataSource ds = dataSource();
        JdbcMcpQuotaStore a = new JdbcMcpQuotaStore(ds);
        JdbcMcpQuotaStore b = new JdbcMcpQuotaStore(ds);
        assertTrue(a.consume("key-1", 2, 0, 0, T0).allowed);
        assertTrue("另一个实例看到同一计数", b.consume("key-1", 2, 0, 0, T0 + 1_000).allowed);
        McpQuotaStore.Decision denied = b.consume("key-1", 2, 0, 0, T0 + 2_000);
        assertFalse("跨实例第三发必须超限", denied.allowed);
        assertEquals("MCP_RATE_LIMITED", denied.reason);
        assertEquals(2L, a.counters("key-1").windowCount);
    }

    @Test
    public void concurrentConsumersNeverExceedRpm() throws Exception {
        JdbcDataSource ds = dataSource();
        JdbcMcpQuotaStore store = new JdbcMcpQuotaStore(ds);
        int threads = 16;
        int rpm = 5;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger allowed = new AtomicInteger();
        try {
            for (int i = 0; i < threads; i++) {
                pool.submit(() -> {
                    try {
                        ready.countDown();
                        go.await(2, TimeUnit.SECONDS);
                        if (store.consume("key-conc", rpm, 0, 0, T0).allowed) allowed.incrementAndGet();
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                });
            }
            assertTrue(ready.await(2, TimeUnit.SECONDS));
            go.countDown();
            pool.shutdown();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
            assertEquals("并发下放行数必须恰好等于 rpm（行锁内检查+自增）", rpm, allowed.get());
            assertEquals(rpm, store.counters("key-conc").windowCount);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    public void dailyQuotaRollsOverNextDay() {
        JdbcDataSource ds = dataSource();
        JdbcMcpQuotaStore store = new JdbcMcpQuotaStore(ds);
        assertTrue(store.consume("key-day", 1000, 1, 0, T0).allowed);
        assertFalse(store.consume("key-day", 1000, 1, 0, T0 + 1_000).allowed);
        assertTrue("次日恢复", store.consume("key-day", 1000, 1, 0, T0 + 86_400_000L).allowed);
    }
}
