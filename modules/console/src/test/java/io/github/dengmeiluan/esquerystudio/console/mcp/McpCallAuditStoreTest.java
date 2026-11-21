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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class McpCallAuditStoreTest {

    private ConsolePrincipal principal(String username, ConsoleRole role, String... pages) {
        return new ConsolePrincipal(username, role, false, false, null, Collections.emptyMap(),
                new LinkedHashSet<>(Arrays.asList(pages)));
    }

    private MockHttpServletRequest request(ConsolePrincipal principal) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        return request;
    }

    private Map<String, Object> meta(String ip) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("ip", ip);
        meta.put("ua", "unit-test-agent/1.0");
        meta.put("requestId", "req-" + ip);
        meta.put("transport", "http");
        return meta;
    }

    @Test
    public void everyCallIsPersistedWithIpAndSurvivesKeyPreviewCap() {
        InMemoryMcpKeyStore keys = new InMemoryMcpKeyStore(new McpSecretCipher("audit-test-key"));
        InMemoryMcpCallAuditStore audit = new InMemoryMcpCallAuditStore();
        McpAccessService service = new McpAccessService(keys, audit, 30);
        Map<String, Object> created = keys.create("audit", "alice", "OPERATOR",
                Arrays.asList("es_search"), Collections.singletonList("qa"),
                Collections.singletonList("read"), Collections.emptyMap(), 60, 1000, 5000, null);
        McpKeyRecord record = keys.find(String.valueOf(((Map<?, ?>) created.get("key")).get("id")));
        assertNotNull(record);

        for (int i = 0; i < 150; i++) {
            service.recordCall(record, "tools/call", "es_search", meta("10.0.0." + (i % 5)), true, i);
        }
        List<Map<String, Object>> rows = audit.list(record.id, 500);
        assertEquals("durable audit must not be capped by the 100-row key preview", 150, rows.size());
        assertEquals(record.id, rows.get(0).get("keyId"));
        assertTrue(String.valueOf(rows.get(0).get("ip")).startsWith("10.0.0."));
        assertTrue(String.valueOf(rows.get(0).get("requestId")).startsWith("req-"));
        assertEquals("key preview stays bounded", 100, record.recentCalls.size());
    }

    @Test
    public void pruneDropsOnlyRecordsOlderThanRetention() {
        InMemoryMcpCallAuditStore audit = new InMemoryMcpCallAuditStore();
        McpKeyRecord key = new McpKeyRecord();
        key.id = "k1";
        key.name = "k1";
        key.prefix = "esq_mcp_k1";
        key.owner = "alice";
        key.role = "VIEWER";
        long now = System.currentTimeMillis();
        Map<String, Object> oldCall = new LinkedHashMap<>();
        oldCall.put("at", now - 8L * 86_400_000L);
        oldCall.put("tool", "es_search");
        Map<String, Object> newCall = new LinkedHashMap<>();
        newCall.put("at", now);
        newCall.put("tool", "es_count");
        audit.append(key, oldCall);
        audit.append(key, newCall);
        assertEquals(2, audit.list("k1", 10).size());
        assertEquals(1, audit.prune(now - 7L * 86_400_000L));
        assertEquals(1, audit.list("k1", 10).size());
        assertEquals("es_count", audit.list("k1", 10).get(0).get("tool"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void callsEndpointReturnsPersistentRowsAndScopesByOwner() {
        InMemoryMcpKeyStore keys = new InMemoryMcpKeyStore(new McpSecretCipher("audit-test-key"));
        InMemoryMcpCallAuditStore audit = new InMemoryMcpCallAuditStore();
        McpAccessService service = new McpAccessService(keys, audit, 30);
        McpKeyController controller = new McpKeyController(keys, null, null,
                new McpSecretCipher("audit-test-key"), audit, service);
        ConsolePrincipal alice = principal("alice", ConsoleRole.OPERATOR,
                "conn:qa:devtools", "conn:qa:search");
        Map<String, Object> created = keys.create("audit-endpoint", "alice", "OPERATOR",
                Arrays.asList("es_search"), Collections.singletonList("qa"),
                Collections.singletonList("read"), Collections.emptyMap(), 60, 1000, 5000, null);
        McpKeyRecord record = keys.find(String.valueOf(((Map<?, ?>) created.get("key")).get("id")));
        service.recordCall(record, "tools/call", "es_search", meta("10.1.1.1"), true, 3);

        ResponseEntity<?> aliceCalls = controller.calls(null, 500, request(alice));
        assertEquals(200, aliceCalls.getStatusCodeValue());
        Map<String, Object> aliceBody = (Map<String, Object>) aliceCalls.getBody();
        assertEquals(1, ((Number) aliceBody.get("count")).intValue());
        assertEquals(30, ((Number) aliceBody.get("retentionDays")).intValue());
        assertEquals("10.1.1.1", ((List<Map<String, Object>>) aliceBody.get("calls")).get(0).get("ip"));

        ConsolePrincipal bob = principal("bob", ConsoleRole.VIEWER,
                "conn:qa:devtools", "conn:qa:search");
        Map<String, Object> bobBody = (Map<String, Object>) controller.calls(null, 500, request(bob)).getBody();
        assertEquals(0, ((Number) bobBody.get("count")).intValue());
    }

    private Map<String, Object> body(Object... pairs) {
        Map<String, Object> body = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) body.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return body;
    }
}
