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

import org.junit.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

/** McpAccessService 在装配/未装配共享配额时的口径：429 映射、镜像计数、故障回落。 */
public class McpAccessServiceSharedQuotaTest {

    /** 内存共享配额（与 JDBC/ES 共用 McpQuotaRules 同一规则）。 */
    private static class MemoryQuota implements McpQuotaStore {
        final Map<String, State> states = new HashMap<>();
        boolean failing;

        @Override
        public synchronized Decision consume(String keyId, int rpm, long dailyQuota, long monthlyQuota, long nowMs) {
            if (failing) throw new IllegalStateException("quota store down");
            State state = states.computeIfAbsent(keyId, k -> new State());
            return McpQuotaRules.decide(state, rpm, dailyQuota, monthlyQuota, nowMs);
        }
    }

    private McpKeyRecord key(int rpm) {
        InMemoryMcpKeyStore keys = new InMemoryMcpKeyStore();
        Map<String, Object> created = keys.create("shared", "alice", "ADMIN",
                Collections.singletonList("es_search"), Collections.singletonList("host"),
                Collections.singletonList("read"), Collections.emptyMap(), rpm, 0, 0, null);
        return keys.authenticate(String.valueOf(created.get("secret")));
    }

    @Test
    public void sharedQuotaDenialMapsToTheSame429AndMirrorsCounters() {
        MemoryQuota quota = new MemoryQuota();
        McpAccessService service = new McpAccessService(new InMemoryMcpKeyStore(),
                McpCallAuditStore.noop(), 30, quota);
        McpKeyRecord record = key(1);
        service.consume(record, "es_search");
        assertEquals("共享计数必须镜像回记录", 1, record.windowCount);
        try {
            service.consume(record, "es_search");
            fail("第二发必须被共享配额拦住");
        } catch (McpAccessException e) {
            assertEquals(429, e.getStatus());
            assertEquals("MCP_RATE_LIMITED", e.getCode());
            assertTrue(e.getRetryAfterSeconds() >= 1);
        }
    }

    @Test
    public void quotaStoreFailureFallsBackToSingleInstanceCounting() {
        MemoryQuota quota = new MemoryQuota();
        quota.failing = true;
        McpAccessService service = new McpAccessService(new InMemoryMcpKeyStore(),
                McpCallAuditStore.noop(), 30, quota);
        McpKeyRecord record = key(2);
        service.consume(record, "es_search");
        service.consume(record, "es_search");
        assertEquals("回落路径按本地窗口计数", 2, record.windowCount);
        try {
            service.consume(record, "es_search");
            fail("回落路径仍须执行单实例限流");
        } catch (McpAccessException e) {
            assertEquals("MCP_RATE_LIMITED", e.getCode());
        }
    }

    @Test
    public void withoutSharedStoreBehaviourIsUnchanged() {
        McpAccessService service = new McpAccessService(new InMemoryMcpKeyStore(),
                McpCallAuditStore.noop(), 30);
        McpKeyRecord record = key(1);
        service.consume(record, "es_search");
        try {
            service.consume(record, "es_search");
            fail("未装配共享配额时仍是单实例限流");
        } catch (McpAccessException e) {
            assertEquals("MCP_RATE_LIMITED", e.getCode());
        }
    }
}
