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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 极简 JWT 验签器（ 配置式鉴权 jwt 模式）：手写 HS256/RS256 验签，零新增依赖。
 *
 * <p>只做委托鉴权需要的最小闭环：拆三段 → Base64URL 解码 → 按 header.alg 验签
 * （HS256 用 {@link Mac} + {@link MessageDigest#isEqual} 恒时比较防时序侧信道；
 * RS256 用 {@code SHA256withRSA}）→ 校验 {@code exp}（存在则必须未过期）→
 * claims 经 Jackson 解析，claim 路径支持 {@code a.b.c} 点分下钻。</p>
 *
 * <p>其余 alg（none/HS384/ES256…）一律拒绝——白名单策略，防算法混淆攻击。</p>
 *
 * @author aicoding
 */
public class JwtVerifier {

    private static final Logger LOG = LoggerFactory.getLogger(JwtVerifier.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** token 解析失败 WARN 节流间隔（防无效 token 高频探测刷屏；endpoint 臂同款范式）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    private final byte[] hmacSecret;
    private final PublicKey rsaPublicKey;
    /** 是否强制要求 exp（缺失即拒）。缺省 false=兼容旧宿主；装配层默认开启。 */
    private final boolean requireExp;
    /** 时钟偏移容忍（签发方与本机时钟不同步的常规窗口）。 */
    private static final long CLOCK_SKEW_MS = 60_000L;
    /** 解析失败节流 WARN 计数（首败留痕，同 key 节流；lastJwtWarnAt 范式）。 */
    private final AtomicLong lastParseWarnAt = new AtomicLong(0);

    /**
     * 兼容构造：不强制 exp（既有调用方/单测语义逐字节不变）。
     *
     * @param secret    HS256 共享密钥（可空）
     * @param publicKeyPem RS256 PEM 公钥（可空；与 secret 至少一个非空）
     */
    public JwtVerifier(String secret, String publicKeyPem) {
        this(secret, publicKeyPem, false);
    }

    /**
     * @param secret    HS256 共享密钥（可空）
     * @param publicKeyPem RS256 PEM 公钥（可空；与 secret 至少一个非空）
     * @param requireExp true=claims 缺 exp 即拒（生产装配默认）；false=兼容旧宿主
     */
    public JwtVerifier(String secret, String publicKeyPem, boolean requireExp) {
        this.hmacSecret = secret == null || secret.isEmpty() ? null : secret.getBytes(StandardCharsets.UTF_8);
        this.rsaPublicKey = parsePublicKey(publicKeyPem);
        this.requireExp = requireExp;
        if (hmacSecret == null && rsaPublicKey == null) {
            throw new IllegalStateException("jwt 委托模式需要配置 secret（HS256）或 public-key（RS256）至少一项");
        }
    }

    /**
     * 验签 + exp 校验。
     *
     * @return 验证通过返回 payload claims；任何失败返回 null（不抛异常，交回内置鉴权）
     */
    public JsonNode verify(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                return null;
            }
            byte[] signingInput = (parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8);
            byte[] signature = Base64.getUrlDecoder().decode(parts[2]);
            JsonNode header = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[0]));
            String alg = header.path("alg").asText("");
            boolean ok;
            if ("HS256".equals(alg) && hmacSecret != null) {
                Mac mac = Mac.getInstance("HmacSHA256");
                mac.init(new SecretKeySpec(hmacSecret, "HmacSHA256"));
                ok = MessageDigest.isEqual(mac.doFinal(signingInput), signature);
            } else if ("RS256".equals(alg) && rsaPublicKey != null) {
                Signature sig = Signature.getInstance("SHA256withRSA");
                sig.initVerify(rsaPublicKey);
                sig.update(signingInput);
                ok = sig.verify(signature);
            } else {
                return null; // 白名单外的 alg（含 none）一律拒绝
            }
            if (!ok) {
                return null;
            }
            JsonNode claims = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[1]));
            long now = System.currentTimeMillis();
            JsonNode exp = claims.get("exp");
            if (exp == null) {
                /* 缺 exp = 永不过期凭证：requireExp 开启时直接拒绝（生产默认）。
                   旧宿主未签发 exp 可通过 esquerystudio.elasticsearch.console.auth.delegate.jwt.require-exp=false 显式放行。 */
                if (requireExp) {
                    return null;
                }
            } else if (!exp.isNumber()) {
                /* 非数值 exp（字符串/对象）此前被 isNumber() 判假后完全跳过校验——
                   签发方一个手误就产出永久令牌。无论 requireExp 如何都拒绝。 */
                return null;
            } else if (exp.asLong() * 1000L + CLOCK_SKEW_MS < now) {
                return null; // 已过期（含 60s 时钟偏移容忍）
            }
            JsonNode nbf = claims.get("nbf");
            if (nbf != null) {
                if (!nbf.isNumber()) {
                    return null;
                }
                if (nbf.asLong() * 1000L - CLOCK_SKEW_MS > now) {
                    return null; // 尚未生效
                }
            }
            return claims;
        } catch (Exception e) {
            // catch→null 全臂静默=认证故障零留痕（Base64 坏段/claims 非 JSON 连 debug 都没有），
            // 补节流 WARN——只记异常类+message 摘要，不落 token 内容；返回 null 交回内置鉴权契约不变
            long now = System.currentTimeMillis();
            long last = lastParseWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastParseWarnAt.compareAndSet(last, now)) {
                String reason = String.valueOf(e.getMessage());
                if (reason.length() > 120) {
                    reason = reason.substring(0, 120);
                }
                LOG.warn("[JwtVerifier] token 解析失败（交回内置鉴权，{}s 内不再重复告警）：{}: {}",
                        WARN_THROTTLE_MS / 1000, e.getClass().getSimpleName(), reason);
            }
            return null;
        }
    }

    /** 按 {@code a.b.c} 点分路径取 claim 字符串值；不存在返回 null。 */
    public static String claimText(JsonNode claims, String path) {
        JsonNode node = claimNode(claims, path);
        return node == null || node.isNull() || node.isMissingNode() ? null : node.asText();
    }

    /** 按点分路径取角色列表：数组逐项取文本；标量按逗号拆分。 */
    public static List<String> claimRoles(JsonNode claims, String path) {
        JsonNode node = claimNode(claims, path);
        if (node == null || node.isNull() || node.isMissingNode()) {
            return Collections.emptyList();
        }
        List<String> roles = new ArrayList<>();
        if (node.isArray()) {
            node.forEach(n -> roles.add(n.asText()));
        } else {
            for (String r : node.asText().split(",")) {
                if (!r.trim().isEmpty()) {
                    roles.add(r.trim());
                }
            }
        }
        return roles;
    }

    private static JsonNode claimNode(JsonNode claims, String path) {
        if (claims == null || path == null || path.isEmpty()) {
            return null;
        }
        JsonNode node = claims;
        for (String seg : path.split("\\.")) {
            node = node.path(seg);
        }
        return node;
    }

    private static PublicKey parsePublicKey(String pem) {
        if (pem == null || pem.trim().isEmpty()) {
            return null;
        }
        try {
            String body = pem.replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException("jwt 委托模式 public-key 解析失败（需 X.509 PEM 公钥）: " + e.getMessage(), e);
        }
    }
}
