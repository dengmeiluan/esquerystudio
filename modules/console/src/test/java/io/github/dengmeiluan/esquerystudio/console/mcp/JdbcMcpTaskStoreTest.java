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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/** JDBC 任务台账持久化契约：重启可读、取消标记独立于心跳、清理与超大结果裁剪。 */
public class JdbcMcpTaskStoreTest {

    private JdbcDataSource dataSource() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:mcptasks_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        return ds;
    }

    private Map<String, Object> record(String taskId, String status, long updatedAt, Object result) {
        Map<String, Object> rec = new LinkedHashMap<>();
        rec.put("taskId", taskId);
        rec.put("owner", "alice");
        rec.put("tool", "es_sql");
        rec.put("status", status);
        rec.put("stage", status);
        rec.put("createdAtMs", updatedAt - 1_000);
        rec.put("lastUpdatedAtMs", updatedAt);
        rec.put("deadlineAtMs", updatedAt + 60_000);
        if (result != null) rec.put("result", result);
        return rec;
    }

    @Test
    public void completedRecordSurvivesReopenAndCancelFlagIsIndependentOfHeartbeat() {
        JdbcDataSource ds = dataSource();
        JdbcMcpTaskStore store = new JdbcMcpTaskStore(ds);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ok", true);
        store.save(record("t-1", McpTaskRegistry.COMPLETED, 1000L, payload));

        JdbcMcpTaskStore reopened = new JdbcMcpTaskStore(ds);
        Map<String, Object> read = reopened.get("t-1");
        assertNotNull("重启后必须能按 id 读到任务", read);
        assertEquals("completed", read.get("status"));
        assertEquals(Boolean.TRUE, ((Map<?, ?>) read.get("result")).get("ok"));
        List<Map<String, Object>> recent = reopened.recent(10);
        assertEquals(1, recent.size());

        reopened.requestCancel("t-1");
        assertTrue("取消标记必须可读", reopened.isCancelRequested("t-1"));
        /* 执行方心跳快照不能把别人写的取消标记覆盖掉（取消标记独立列）。 */
        store.save(record("t-1", "working", 2000L, null));
        assertTrue("心跳写入后取消标记仍必须保持", reopened.isCancelRequested("t-1"));

        reopened.clear("t-1");
        assertNull(reopened.get("t-1"));
    }

    @Test
    public void oversizedResultIsDroppedButStatusStaysHonest() {
        JdbcMcpTaskStore store = new JdbcMcpTaskStore(dataSource());
        StringBuilder huge = new StringBuilder();
        for (int i = 0; i < 60_000; i++) huge.append('x');
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", huge.toString());
        store.save(record("t-big", McpTaskRegistry.COMPLETED, 1000L, payload));
        Map<String, Object> read = store.get("t-big");
        assertEquals("completed", read.get("status"));
        assertEquals(Boolean.TRUE, read.get("resultDropped"));
        assertNull("超限结果体不落库", read.get("result"));
    }
}
