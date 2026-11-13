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

import org.elasticsearch.client.EsFakeClients;
import org.junit.Test;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.lang.reflect.Field;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 批次 1001：吊销表封顶驱逐——持任一有效凭据循环 login/logout 可灌满封顶（成功登录
 * 不节流、token 唯一），旧的「满了拒绝新吊销」会让所有人的被盗 token 在 TTL 内
 * 无法吊销；驱逐最早到期条目腾位后，新吊销必须恒成功。
 */
public class BuiltinConsoleRevocationEviction1001Test {

    private static final String PASSWORD = "right-pass";
    private static final int ITERATIONS = 31_000;

    private static String saltB64;
    private static String hashB64;

    static {
        try {
            byte[] salt = new byte[16];
            new java.security.SecureRandom().nextBytes(salt);
            PBEKeySpec spec = new PBEKeySpec(PASSWORD.toCharArray(), salt, ITERATIONS, 256);
            byte[] hash = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            saltB64 = Base64.getEncoder().encodeToString(salt);
            hashB64 = Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static ConcurrentMap<String, Long> revokedTable(BuiltinConsoleAuthService svc) throws Exception {
        Field f = BuiltinConsoleAuthService.class.getDeclaredField("revokedTokens");
        f.setAccessible(true);
        return (ConcurrentMap<String, Long>) f.get(svc);
    }

    private static BuiltinConsoleAuthService service() {
        AtomicReference<String> ignored = new AtomicReference<>();
        return new BuiltinConsoleAuthService(
                () -> EsFakeClients.scripted(req -> {
                    String ep = req.getEndpoint();
                    if (ep.contains("/_doc/") && "PUT".equals(req.getMethod())) {
                        ignored.set("captured");
                        return "{}";
                    }
                    if (ep.contains("/_doc/")) {
                        return "{\"found\":true,\"_source\":{\"username\":\"u1\",\"role\":\"OPERATOR\","
                                + "\"salt\":\"" + saltB64 + "\",\"iterations\":" + ITERATIONS
                                + ",\"passwordHash\":\"" + hashB64 + "\",\"epoch\":1}}";
                    }
                    if (ep.contains("/_count")) {
                        return "{\"count\":1}";
                    }
                    return "{}";
                }),
                "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret");
    }

    @Test
    public void 表满时新吊销驱逐腾位而非拒绝() throws Exception {
        BuiltinConsoleAuthService svc = service();
        Map<String, Object> login = svc.login("u1", PASSWORD);
        String token = String.valueOf(login.get("token"));
        assertNotNull("前置：登录 token 有效", svc.verifyToken(token));

        ConcurrentMap<String, Long> table = revokedTable(svc);
        /* 模拟攻击者灌满：全为远期过期（无过期项可清理，走驱逐分支） */
        long far = System.currentTimeMillis() + 3_600_000L;
        for (int i = 0; i < 10_000; i++) {
            table.put("filler-" + i, far);
        }
        assertTrue("表满后新吊销必须驱逐腾位成功（拒绝=被盗 token 在 TTL 内不可吊销）",
                svc.revokeToken(token));
        assertTrue("驱逐后条目数不越封顶", table.size() <= 10_000);
        assertNull("吊销后的 token 立即失效", svc.verifyToken(token));
    }

    @Test
    public void 过期条目优先清理仍生效() throws Exception {
        BuiltinConsoleAuthService svc = service();
        String token = String.valueOf(svc.login("u1", PASSWORD).get("token"));
        ConcurrentMap<String, Long> table = revokedTable(svc);
        long now = System.currentTimeMillis();
        /* 灌满但一半已过期：清理路径先走，驱逐分支不触发 */
        for (int i = 0; i < 5_000; i++) {
            table.put("stale-" + i, now - 1);
        }
        for (int i = 0; i < 5_000; i++) {
            table.put("live-" + i, now + 3_600_000L);
        }
        assertTrue(svc.revokeToken(token));
        assertFalse("表内不应再有过期残留", table.values().stream().anyMatch(v -> v <= now));
        assertFalse("吊销后的 token 失效", svc.verifyToken(token) != null);
    }
}
