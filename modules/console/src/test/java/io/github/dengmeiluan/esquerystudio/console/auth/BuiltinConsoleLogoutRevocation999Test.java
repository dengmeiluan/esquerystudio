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
import java.io.IOException;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 登出服务端吊销：无状态 token 登出后在 TTL 内立即失效，而非只清客户端本地；
 * 伪造串不入吊销表；重复登出幂等。
 */
public class BuiltinConsoleLogoutRevocation999Test {

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
    public void 登出后token在TTL内立即失效() throws IOException {
        BuiltinConsoleAuthService svc = service();
        Map<String, Object> login = svc.login("u1", PASSWORD);
        assertNotNull(login);
        String token = String.valueOf(login.get("token"));
        assertNotNull("登录后 token 应有效", svc.verifyToken(token));
        assertTrue("有效 token 登出应登记吊销", svc.revokeToken(token));
        assertEquals(1, svc.revokedTokenCount());
        assertNull("登出后同 token 立即无效", svc.verifyToken(token));
    }

    @Test
    public void 伪造串与重复登出幂等不入表() throws IOException {
        BuiltinConsoleAuthService svc = service();
        assertFalse("伪造串不得入吊销表", svc.revokeToken("a.b.c.d.e"));
        assertFalse("空 token 不入吊销表", svc.revokeToken(null));
        assertEquals(0, svc.revokedTokenCount());
        Map<String, Object> login = svc.login("u1", PASSWORD);
        String token = String.valueOf(login.get("token"));
        assertTrue(svc.revokeToken(token));
        assertFalse("重复登出幂等（已吊销 token 校验即失败，不再登记）", svc.revokeToken(token));
        assertEquals(1, svc.revokedTokenCount());
    }

    @Test
    public void 登出不牵连其它会话token() throws IOException {
        BuiltinConsoleAuthService svc = service();
        String tokenA = String.valueOf(svc.login("u1", PASSWORD).get("token"));
        String tokenB = String.valueOf(svc.login("u1", PASSWORD).get("token"));
        assertTrue(svc.revokeToken(tokenA));
        assertNull("被登出的会话失效", svc.verifyToken(tokenA));
        assertNotNull("其它会话不受牵连", svc.verifyToken(tokenB));
    }

    @Test
    public void 新建账号纪元随机_同名重建不复活旧token() throws IOException {
        AtomicReference<String> putBody = new AtomicReference<>();
        BuiltinConsoleAuthService svc = new BuiltinConsoleAuthService(
                () -> EsFakeClients.scripted(req -> {
                    if (req.getEndpoint().contains("/reborn")) {
                        if ("PUT".equals(req.getMethod())) {
                            putBody.set(req.getEntity() == null ? ""
                                    : org.apache.http.util.EntityUtils.toString(req.getEntity()));
                            return "{}";
                        }
                        return "{\"found\":false}";
                    }
                    return "{}";
                }),
                "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret");
        svc.upsertUser(null, "reborn", PASSWORD, ConsoleRole.VIEWER);
        String body = putBody.get();
        assertNotNull("应写入用户档案", body);
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"epoch\":(\\d+)").matcher(body);
        assertTrue("档案必须带纪元", m.find());
        long epoch = Long.parseLong(m.group(1));
        assertFalse("新建账号不得固定 epoch=1：删号重建会让旧 epoch=1 的 token 复活", epoch == 1L);
    }
}
