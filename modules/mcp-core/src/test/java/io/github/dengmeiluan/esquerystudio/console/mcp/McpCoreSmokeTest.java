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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class McpCoreSmokeTest {

    @Test
    public void secretCipherRoundTripsWithoutStoringPlaintext() {
        McpSecretCipher cipher = new McpSecretCipher("smoke-test-key");
        String secret = "esq_mcp_abcdefghijklmnopqrstuvwxyz.0123456789abcdef";
        String stored = cipher.encrypt(secret);
        assertFalse("ciphertext must not contain the plaintext", stored.contains(secret));
        assertEquals(secret, cipher.decrypt(stored));
    }

    @Test
    public void errorCodesAreSharedAndStable() {
        assertEquals("BAD_REQUEST", McpErrors.toolErrorCode(new IllegalArgumentException("x")));
        assertEquals("CONN_FORBIDDEN", McpErrors.toolErrorCode(new SecurityException("x")));
        assertEquals("PLAN_DRIFT", McpErrors.toolErrorCode(
                new IllegalStateException("计划摘要不匹配，拒绝执行")));
        assertEquals("PLAN_NOT_FOUND", McpErrors.toolErrorCode(
                new IllegalStateException(McpErrors.PLAN_NOT_FOUND_PREFIX + "p1")));
        assertEquals("INTERNAL", McpErrors.toolErrorCode(new IllegalStateException("other")));
    }

    @Test
    public void inMemoryKeyStoreIssuesAndListsAKey() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        java.util.Map<String, Object> created = store.create("smoke", "tester", "VIEWER",
                java.util.Arrays.asList("es_connections:list"), java.util.Arrays.asList("host"),
                java.util.Arrays.asList("read"), java.util.Collections.<String, java.util.List<String>>emptyMap(),
                60, 1000L, 20000L, 0L);
        assertFalse("create must return an issuance payload", created.isEmpty());
        assertEquals(1, store.list().size());
        assertEquals("smoke", store.list().get(0).get("name"));
    }
}
