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

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

/** JDBC key 存储持久化契约：建表、签发、认证、用量、撤销、重启后仍可读。 */
public class McpJdbcKeyStoreTest {

    private JdbcDataSource dataSource() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:mcpkeys_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        return ds;
    }

    @Test
    public void savedSecretSurvivesJdbcRestartAndIsNotInListPayload() {
        JdbcDataSource ds = dataSource();
        McpSecretCipher cipher = new McpSecretCipher("jdbc-test-master-key");
        JdbcMcpKeyStore store = new JdbcMcpKeyStore(ds, cipher);
        Map<String, Object> created = store.create("saved", "alice", "OPERATOR",
                Arrays.asList("es_search"), Collections.singletonList("qa"),
                Collections.singletonList("read"), Collections.emptyMap(), 60, 1000, 5000, null);
        String secret = String.valueOf(created.get("secret"));
        McpKeyRecord record = store.find(String.valueOf(((Map<?, ?>) created.get("key")).get("id")));
        assertNotNull(record.secretEncrypted);
        assertEquals(secret, cipher.decrypt(record.secretEncrypted));

        JdbcMcpKeyStore reopened = new JdbcMcpKeyStore(ds, new McpSecretCipher("jdbc-test-master-key"));
        McpKeyRecord persisted = reopened.find(record.id);
        assertEquals(secret, new McpSecretCipher("jdbc-test-master-key").decrypt(persisted.secretEncrypted));
        assertFalse(reopened.list().get(0).containsKey("secretEncrypted"));
        assertEquals(Boolean.TRUE, reopened.list().get(0).get("secretSaved"));
    }

    @Test
    public void durableAuditTableSurvivesRestartAndPrunesByAge() {
        JdbcDataSource ds = dataSource();
        JdbcMcpCallAuditStore audit = new JdbcMcpCallAuditStore(ds, 30);
        McpKeyRecord key = new McpKeyRecord();
        key.id = "audit-key";
        key.name = "audit";
        key.prefix = "esq_mcp_audit";
        key.owner = "alice";
        key.role = "VIEWER";
        long now = System.currentTimeMillis();
        for (int i = 0; i < 150; i++) {
            Map<String, Object> call = new java.util.LinkedHashMap<>();
            call.put("method", "tools/call");
            call.put("tool", "es_search");
            call.put("at", now + i);
            call.put("ok", true);
            call.put("ms", i);
            call.put("ip", "10.2.0." + (i % 5));
            call.put("requestId", "req-" + i);
            audit.append(key, call);
        }
        assertEquals(150, new JdbcMcpCallAuditStore(ds, 30).list("audit-key", 500).size());
        assertEquals("10.2.0.4", new JdbcMcpCallAuditStore(ds, 30).list("audit-key", 1).get(0).get("ip"));
        assertEquals(150, audit.prune(now + 1_000_000L));
        assertEquals(0, audit.list("audit-key", 10).size());
    }

    @Test
    public void keysAndUsageSurviveANewStoreInstance() {
        JdbcDataSource ds = dataSource();
        JdbcMcpKeyStore store = new JdbcMcpKeyStore(ds);
        Map<String, List<String>> scoped = new java.util.LinkedHashMap<>();
        scoped.put("qa", Arrays.asList("read", "write"));
        scoped.put("prod", Collections.singletonList("read"));
        Map<String, Object> created = store.create("agent", "alice", "OPERATOR",
                Arrays.asList("es_search", "es_index_doc"), Arrays.asList("qa", "prod"),
                Collections.singletonList("read"), scoped, 30, 1000, 5000, null);
        String secret = String.valueOf(created.get("secret"));
        assertEquals(1, store.list().size());

        McpKeyRecord record = store.authenticate(secret);
        assertNotNull(record);
        assertEquals("alice", record.owner);
        assertTrue(record.canWrite("qa"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.canRead("prod"));
        assertEquals(Collections.singletonList("read"), record.permissions);

        record.requestCount = 7;
        record.toolCounts.put("es_search", 5L);
        record.toolCounts.put("es_count", 2L);
        record.lastTool = "es_search";
        record.dayCount = 3;
        record.dayKey = McpKeyRecord.todayKey(System.currentTimeMillis());
        record.lastUsedAt = System.currentTimeMillis();
        Map<String, Object> call = new java.util.LinkedHashMap<>();
        call.put("tool", "es_search");
        call.put("at", 123456789L);
        record.recentCalls.add(call);
        record.dailyCounts.put("2026-11-06", 4L);
        record.dailyCounts.put("2026-11-07", 3L);
        store.updateUsage(record);
        Map<String, Object> audit = new java.util.LinkedHashMap<>();
        audit.put("action", "update");
        audit.put("at", 123L);
        audit.put("actor", "alice");
        store.appendAudit(record.id, audit);

        JdbcMcpKeyStore reopened = new JdbcMcpKeyStore(ds);
        McpKeyRecord persisted = reopened.authenticate(secret);
        assertNotNull("重启后 key 仍应可认证", persisted);
        assertEquals(7, persisted.requestCount);
        assertEquals(3, persisted.dayCount);
        assertEquals(5L, persisted.toolCounts.get("es_search").longValue());
        assertEquals(3L, persisted.dailyCounts.get("2026-11-07").longValue());
        assertEquals("update", persisted.auditLog.get(0).get("action"));
        assertEquals("alice", persisted.auditLog.get(0).get("actor"));
        assertEquals("es_search", persisted.lastTool);
        assertEquals("es_search", persisted.recentCalls.get(0).get("tool"));
        assertEquals(123456789L, ((Number) persisted.recentCalls.get(0).get("at")).longValue());

        Map<String, Object> rotated = reopened.rotate(record.id);
        String newSecret = String.valueOf(rotated.get("secret"));
        assertFalse(secret.equals(newSecret));
        assertNull("旧 secret 轮换后必须失效", reopened.authenticate(secret));
        assertNotNull(reopened.authenticate(newSecret));

        Map<String, List<String>> updatedScoped = new java.util.LinkedHashMap<>();
        updatedScoped.put("qa", Collections.singletonList("read"));
        Map<String, Object> updated = reopened.update(record.id, "renamed",
                Collections.singletonList("es_count"), Collections.singletonList("qa"),
                Collections.singletonList("read"), updatedScoped, 45, 2000, 8000, null);
        assertEquals("renamed", updated.get("name"));
        McpKeyRecord afterUpdate = reopened.authenticate(newSecret);
        assertEquals("renamed", afterUpdate.name);
        assertEquals(Collections.singletonList("es_count"), afterUpdate.allowedTools);
        assertFalse(afterUpdate.canWrite("qa"));
        assertEquals(7, afterUpdate.requestCount);

        assertTrue(reopened.revoke(record.id));
        McpKeyRecord revoked = new JdbcMcpKeyStore(ds).find(record.id);
        assertFalse(revoked.enabled);
    }
}
