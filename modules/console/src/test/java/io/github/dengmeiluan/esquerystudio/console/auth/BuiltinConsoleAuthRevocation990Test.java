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
import org.elasticsearch.client.Request;
import org.junit.Test;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.io.IOException;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 批次 990：token 吊销面（纪元回查）——删号/降权/改密后旧 token 立即作废，
 * 不再等到 TTL 过期；角色以最新档案为准；存量五段 token（隐含 epoch=0）
 * 在账号未变更时保持有效（升级平滑），首次变更后一并吊销。
 */
public class BuiltinConsoleAuthRevocation990Test {

    private static final String PASSWORD = "right-pass";
    private static final int ITERATIONS = 31_000;

    /** 可演化档案：role/epoch 可变，密码要素固定（PBKDF2 预生成，与生产同参数）。 */
    private static final class UserDoc {
        String role = "OPERATOR";
        Long epoch = 1L; // null=字段缺席（存量档案形态）
        String found = "true";
    }

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

    /** scripted client：GET /_doc/ 按档案变量渲染；PUT /_doc/ 捕获请求体。 */
    private static BuiltinConsoleAuthService service(UserDoc doc, AtomicReference<String> putBody) {
        return new BuiltinConsoleAuthService(
                () -> EsFakeClients.scripted(req -> {
                    String ep = req.getEndpoint();
                    if (ep.contains("/_doc/") && "PUT".equals(req.getMethod())) {
                        putBody.set(org.apache.http.util.EntityUtils.toString(req.getEntity()));
                        return "{}";
                    }
                    if (ep.contains("/_doc/")) {
                        if (!"true".equals(doc.found)) {
                            return "{\"found\":false}";
                        }
                        String epochPart = doc.epoch == null ? ""
                                : ",\"epoch\":" + doc.epoch;
                        return "{\"found\":true,\"_source\":{\"username\":\"u1\",\"role\":\"" + doc.role
                                + "\",\"salt\":\"" + saltB64 + "\",\"iterations\":" + ITERATIONS
                                + ",\"passwordHash\":\"" + hashB64 + "\"" + epochPart + "}}";
                    }
                    if (ep.contains("/_count")) {
                        return "{\"count\":1}";
                    }
                    return "{}";
                }),
                "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret");
    }

    private static Map<String, Object> login(BuiltinConsoleAuthService svc) throws IOException {
        return svc.login("u1", PASSWORD);
    }

    @Test
    public void 改密或改角色后旧token立即吊销() throws Exception {
        UserDoc doc = new UserDoc();
        AtomicReference<String> putBody = new AtomicReference<>();
        BuiltinConsoleAuthService svc = service(doc, putBody);
        String token1 = String.valueOf(login(svc).get("token"));
        assertNotNull("纪元相符时 token 有效", svc.verifyToken(token1));
        /* 模拟 upsert（改密/改角色）后纪元递增 */
        doc.epoch = 2L;
        doc.role = "VIEWER";
        assertNull("纪元不符（账号已变更）旧 token 必须立即作废", svc.verifyToken(token1));
        String token2 = String.valueOf(login(svc).get("token"));
        ConsolePrincipal p = svc.verifyToken(token2);
        assertNotNull("重新登录拿到新纪元 token 恢复可用", p);
        assertEquals("降权后新会话角色以最新档案为准", "VIEWER", p.getRole().name());
    }

    @Test
    public void 删号后token立即吊销() throws Exception {
        UserDoc doc = new UserDoc();
        BuiltinConsoleAuthService svc = service(doc, new AtomicReference<>());
        String token = String.valueOf(login(svc).get("token"));
        assertNotNull(svc.verifyToken(token));
        doc.found = "false";
        assertNull("账号删除后 token 必须立即作废（不再等到 TTL）", svc.verifyToken(token));
    }

    @Test
    public void 存量五段token在账号未变更时保持有效() throws Exception {
        UserDoc doc = new UserDoc();
        doc.epoch = null; // 升级前的存量档案：无纪元字段
        BuiltinConsoleAuthService svc = service(doc, new AtomicReference<>());
        String token = legacyFivePartToken("u1", "OPERATOR");
        ConsolePrincipal p = svc.verifyToken(token);
        assertNotNull("升级部署后未变更账号的存量会话不中断（隐含 epoch=0）", p);
        assertEquals("OPERATOR", p.getRole().name());
    }

    @Test
    public void 存量账号首次变更后五段token一并吊销() throws Exception {
        UserDoc doc = new UserDoc();
        doc.epoch = 1L; // 首次 upsert 后纪元=1
        BuiltinConsoleAuthService svc = service(doc, new AtomicReference<>());
        String token = legacyFivePartToken("u1", "OPERATOR");
        assertNull("存量五段 token（隐含 0）与纪元 1 不符=吊销", svc.verifyToken(token));
    }

    @Test
    public void 角色以最新档案为准纵深锚() throws Exception {
        /* 纪元相等但 token 角色与档案不一致：正常流程不可能出现（role 变更必递增纪元），
           此处验证纵深——principal 永远以档案为准，不沿用签发时的旧角色 */
        UserDoc doc = new UserDoc();
        doc.role = "VIEWER";
        doc.epoch = 1L;
        BuiltinConsoleAuthService svc = service(doc, new AtomicReference<>());
        String token = sixPartToken("u1", "OPERATOR", 1L);
        ConsolePrincipal p = svc.verifyToken(token);
        assertNotNull("纪元相符签名有效", p);
        assertEquals("角色以档案为准（纵深）", "VIEWER", p.getRole().name());
    }

    @Test
    public void upsertUser写入递增纪元() throws Exception {
        UserDoc doc = new UserDoc();
        doc.epoch = 3L;
        AtomicReference<String> putBody = new AtomicReference<>();
        BuiltinConsoleAuthService svc = service(doc, putBody);
        svc.upsertUser(new ConsolePrincipal("admin1", ConsoleRole.ADMIN, false),
                "u1", null, ConsoleRole.VIEWER);
        String body = String.valueOf(putBody.get());
        assertTrue("upsert 必须写递增纪元（旧 3 → 新 4），实际=" + body,
                body.contains("\"epoch\":4"));
    }

    @Test
    public void 新建账号纪元为随机正值_不从1开始() throws Exception {
        UserDoc doc = new UserDoc();
        doc.found = "false"; // findUser 不存在=新建
        AtomicReference<String> putBody = new AtomicReference<>();
        BuiltinConsoleAuthService svc = service(doc, putBody);
        svc.upsertUser(new ConsolePrincipal("admin1", ConsoleRole.ADMIN, false),
                "u1", "password1", ConsoleRole.OPERATOR);
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"epoch\":(\\d+)").matcher(String.valueOf(putBody.get()));
        assertTrue("新建账号必须写纪元", m.find());
        long epoch = Long.parseLong(m.group(1));
        assertTrue("纪元必须为正", epoch > 0);
        assertFalse("纪元不得固定为 1：删号重建会让旧 epoch=1 的 token 复活", epoch == 1L);
    }

    /* ── token 工具（与生产签名口径一致） ── */

    private static String sign(String payload) throws Exception {
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(
                "it-secret".getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    /** 纪元字段引入前的五段形态。 */
    private static String legacyFivePartToken(String username, String role) throws Exception {
        String userB64 = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(username.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String payload = userB64 + "." + role + "." + (System.currentTimeMillis() + 3_600_000L) + ".N";
        return payload + "." + sign(payload);
    }

    /** 六段形态（显式纪元）。 */
    private static String sixPartToken(String username, String role, long epoch) throws Exception {
        String userB64 = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(username.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String payload = userB64 + "." + role + "." + (System.currentTimeMillis() + 3_600_000L) + ".N." + epoch;
        return payload + "." + sign(payload);
    }
}
