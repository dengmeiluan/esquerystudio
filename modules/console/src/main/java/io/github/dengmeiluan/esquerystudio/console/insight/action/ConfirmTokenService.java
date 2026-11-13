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

package io.github.dengmeiluan.esquerystudio.console.insight.action;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

/**
 *  确认令牌服务——无状态 HMAC，零新依赖（javax.crypto）。
 *
 * <p>estimate 阶段签发，execute 阶段校验。token 绑定 actionId + 参数哈希 + 过期时间，
 * 不落任何存储；密钥为每 JVM 随机 32 字节（重启后旧 token 自然失效，符合"预估已过期请重看"的语义）。</p>
 *
 * <pre>
 * paramsHash = SHA-256(actionId + '|' + 参数规范化JSON)     // 键序无关
 * sig        = HMAC-SHA256(actionId + '|' + paramsHash + '|' + expireAt)
 * token      = base64url(expireAt + "." + base64url(sig))
 * </pre>
 *
 * <p>verify 用 {@link MessageDigest#isEqual} 恒时比较防时序侧信道。</p>
 *
 * @author aicoding
 */
public class ConfirmTokenService {

    /** token 有效期：5 分钟（预估结果的"新鲜度"窗口）。 */
    private static final long TTL_MILLIS = 5 * 60 * 1000L;

    /** 参数规范化：按键名排序序列化，保证键序无关（同 ConfigLabService.SORTED 惯例）。 */
    private static final ObjectMapper CANONICAL = new ObjectMapper()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);

    /** 每 JVM 随机密钥。 */
    private final byte[] secret;

    public ConfirmTokenService() {
        this.secret = new byte[32];
        new SecureRandom().nextBytes(this.secret);
    }

    /** 签发 confirmToken（estimate 成功后调用）。 */
    public String issue(String actionId, Map<String, Object> params) {
        long expireAt = System.currentTimeMillis() + TTL_MILLIS;
        byte[] sig = hmac(payload(actionId, params, expireAt));
        String raw = expireAt + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 校验：格式合法 && 未过期 && HMAC 一致（含参数未被篡改）。
     *
     * <p>备案（零代码行为变更）：本方法两处 {@code catch → return false}
     * （token Base64 解码失败、过期时间/签名段解码失败）是 <b>fail-closed 安全臂</b>，
     * 刻意维持静默 —— 拒绝会经调用方的 HTTP 4xx 响应对用户响亮（失败链不缺响度），
     * 服务端再落 WARN 即对同一次恶意/损坏 token 重复告警（刷屏）。属 三态约定
     * 之①判据臂范畴，不追加日志。</p>
     */
    public boolean verify(String actionId, Map<String, Object> params, String token) {
        if (token == null || token.isEmpty()) {
            return false;
        }
        String raw;
        try {
            raw = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return false;
        }
        int dot = raw.indexOf('.');
        if (dot <= 0) {
            return false;
        }
        long expireAt;
        byte[] carried;
        try {
            expireAt = Long.parseLong(raw.substring(0, dot));
            carried = Base64.getUrlDecoder().decode(raw.substring(dot + 1));
        } catch (RuntimeException e) {
            return false;
        }
        if (System.currentTimeMillis() > expireAt) {
            return false;
        }
        byte[] expected = hmac(payload(actionId, params, expireAt));
        return MessageDigest.isEqual(expected, carried);
    }

    private String payload(String actionId, Map<String, Object> params, long expireAt) {
        return actionId + "|" + paramsHash(actionId, params) + "|" + expireAt;
    }

    private String paramsHash(String actionId, Map<String, Object> params) {
        try {
            String canonical = CANONICAL.writeValueAsString(params == null ? java.util.Collections.emptyMap() : params);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest((actionId + "|" + canonical).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("paramsHash failed", e);
        }
    }

    private byte[] hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("hmac failed", e);
        }
    }
}
