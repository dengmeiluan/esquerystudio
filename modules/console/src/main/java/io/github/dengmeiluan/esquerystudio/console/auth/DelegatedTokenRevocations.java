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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 委托令牌登出吊销表（jwt / endpoint 模式）。
 *
 * <p>委托令牌由宿主签发，控制台无法让宿主侧令牌失效；但「用户在本控制台点了退出」
 * 至少应让<b>本实例</b>不再接受它——否则登出只是清了浏览器 localStorage，
 * 被复制的令牌在 TTL 内继续可用（文档曾把这条列为已知边界）。</p>
 *
 * <p>实现是进程内表 + 按 exp 到期淘汰：不引入共享存储依赖，多实例部署下
 * 吊销只在本实例生效（与内置 token 的吊销表同一限制，已在文档写明）。
 * 只登记通过验签的令牌指纹——伪造串不占内存。</p>
 */
public final class DelegatedTokenRevocations {

    private static final int CAP = 10_000;

    /** token 指纹（SHA-256 hex）→ 原令牌到期时间（epoch ms）。 */
    private static final Map<String, Long> REVOKED = new ConcurrentHashMap<>();

    private DelegatedTokenRevocations() {
    }

    /**
     * 登记吊销。
     *
     * @param token     原始令牌（不落库，只存指纹）
     * @param expiresAt 原令牌到期时间；&lt;= now 时无需登记（已自然失效）
     * @return 是否实际登记
     */
    public static boolean revoke(String token, long expiresAt) {
        if (token == null || token.isEmpty()) return false;
        long now = System.currentTimeMillis();
        purgeExpired(now);
        if (expiresAt <= now) return false;
        if (REVOKED.size() >= CAP) {
            /* 先清过期；仍满则拒绝新登记（拒绝登出只影响本实例的即时失效，
               不能为了腾位驱逐仍有效的吊销项——那等于让最早的被盗令牌复活）。 */
            purgeExpired(now);
            if (REVOKED.size() >= CAP) {
                return false;
            }
        }
        REVOKED.put(fingerprint(token), expiresAt);
        return true;
    }

    /** 该令牌是否已被登出吊销（过期项顺手清除）。 */
    public static boolean isRevoked(String token) {
        if (token == null || token.isEmpty()) return false;
        long now = System.currentTimeMillis();
        Long exp = REVOKED.get(fingerprint(token));
        if (exp == null) return false;
        if (exp <= now) {
            REVOKED.remove(fingerprint(token), exp);
            return false;
        }
        return true;
    }

    /** 测试隔离用：清空吊销表。 */
    static void clear() {
        REVOKED.clear();
    }

    private static void purgeExpired(long now) {
        for (Map.Entry<String, Long> e : REVOKED.entrySet()) {
            if (e.getValue() == null || e.getValue() <= now) {
                REVOKED.remove(e.getKey(), e.getValue());
            }
        }
    }

    static String fingerprint(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16))
                        .append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            /* 摘要不可用：退化为长度+哈希（仍能区分令牌，碰撞概率可接受） */
            return "h" + token.length() + ":" + token.hashCode();
        }
    }
}
