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
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 配置式宿主鉴权委托（{@code esquerystudio.elasticsearch.console.auth.delegate.*} 纯 properties
 * 即可对接宿主凭据体系，不写一行 Java——与  代码 SPI（{@link ConsoleAuthDelegate}）
 * 同一插槽，代码 SPI 优先（AutoConfiguration 用 {@code @ConditionalOnMissingBean} 让位）。
 *
 * <p>三模式：<b>jwt</b>（本地验签 {@link JwtVerifier}）/ <b>endpoint</b>（POST 回调宿主校验接口，
 * 结果按 token 短缓存）/ <b>header</b>（信任网关注入头）。任何模式认不出都返回 null
 * 交回内置鉴权（两套并存语义与代码 SPI 完全一致）。</p>
 *
 * @author aicoding
 */
public class PropertiesAuthDelegate implements ConsoleAuthDelegate {

    private static final Logger LOG = LoggerFactory.getLogger(PropertiesAuthDelegate.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int HTTP_TIMEOUT_MS = 5_000;
    /** endpoint 故障 warn 日志节流间隔（避免宿主接口宕机刷屏）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    private final ESQueryStudioElasticsearchProperties.Delegate props;
    private final HostRoleMapper roleMapper;
    /** jwt 模式验签器（其余模式为 null）。 */
    private final JwtVerifier jwtVerifier;
    /** endpoint 模式：token → 缓存的校验结果。 */
    private final Map<String, CachedVerdict> verdictCache = new ConcurrentHashMap<>();
    private final AtomicLong lastEndpointWarnAt = new AtomicLong(0);
    /** jwt 验签失败 WARN 节流计数（同 endpoint 臂 lastEndpointWarnAt 范式）。 */
    private final AtomicLong lastJwtWarnAt = new AtomicLong(0);
    /** header 模式公网来源拒识 WARN 节流计数（同范式）。 */
    private final AtomicLong lastHeaderWarnAt = new AtomicLong(0);

    public PropertiesAuthDelegate(ESQueryStudioElasticsearchProperties.Delegate props) {
        this.props = props;
        this.roleMapper = new HostRoleMapper(props.getRoleMapping());
        this.jwtVerifier = "jwt".equalsIgnoreCase(props.getMode())
                ? new JwtVerifier(props.getJwt().getSecret(), props.getJwt().getPublicKey(),
                        props.getJwt().isRequireExp()) : null;
        if (jwtVerifier != null && !props.getJwt().isRequireExp()) {
            LOG.warn("[PropertiesAuthDelegate] jwt 模式已关闭 exp 强制校验"
                    + "（delegate.jwt.require-exp=false）：缺 exp 的令牌将被视为永久有效凭证，"
                    + "仅应在宿主确实无法签发 exp 时临时启用");
        }
        LOG.info("[PropertiesAuthDelegate] 配置式宿主鉴权已启用 mode={} tokenHeader={}",
                props.getMode(), props.getTokenHeader());
        /* header 模式空受信清单=回环/私网整体默认信任：私网内任意直连客户端（不限于网关）
           都可注入身份/角色头。提醒收敛到显式网关清单（trusted-proxies 配置后仅清单内采信）。 */
        if ("header".equalsIgnoreCase(props.getMode())
                && props.getHeader().getTrustedProxies().isEmpty()) {
            LOG.warn("[PropertiesAuthDelegate] header 模式未配置 trusted-proxies 受信代理清单，"
                    + "当前默认信任回环/私网/链路本地全部来源的身份头——请配置网关真实地址"
                    + "（如 10.8.0.0/16）把采信面收窄到具体代理");
        }
    }

    @Override
    public ConsolePrincipal authenticate(HttpServletRequest request) {
        String mode = props.getMode() == null ? "" : props.getMode().toLowerCase(Locale.ROOT);
        switch (mode) {
            case "jwt":
                return byJwt(request);
            case "endpoint":
                return byEndpoint(request);
            case "header":
                return byHeader(request);
            default:
                return null;
        }
    }

    // ---------------- jwt ----------------

    /**
     * 登出吊销：jwt 用令牌自身 exp 作为拒绝表 TTL；endpoint 驱逐本地裁决缓存并
     * 在缓存窗口内拒绝（宿主仍判有效，控制台无法替宿主撤销）。header 模式无服务端会话。
     */
    @Override
    public boolean revoke(String token) {
        if (token == null || token.isEmpty()) {
            return false;
        }
        String mode = props.getMode() == null ? "" : props.getMode().toLowerCase(Locale.ROOT);
        if ("jwt".equals(mode)) {
            JsonNode claims = jwtVerifier.verify(token);
            if (claims == null) {
                return false;
            }
            JsonNode exp = claims.get("exp");
            long expiresAt = exp != null && exp.isNumber()
                    ? exp.asLong() * 1000L
                    : System.currentTimeMillis() + 3_600_000L;
            return DelegatedTokenRevocations.revoke(token, expiresAt);
        }
        if ("endpoint".equals(mode)) {
            verdictCache.remove(token);
            long ttl = Math.max(1, props.getEndpoint().getCacheSeconds()) * 1000L;
            return DelegatedTokenRevocations.revoke(token, System.currentTimeMillis() + ttl);
        }
        return false;
    }

    @Override
    public boolean hasCredential(HttpServletRequest request) {
        String mode = props.getMode() == null ? "" : props.getMode().toLowerCase(Locale.ROOT);
        if ("jwt".equals(mode) || "endpoint".equals(mode)) {
            return extractToken(request) != null;
        }
        if ("header".equals(mode)) {
            String userHeader = props.getHeader().getUserHeader();
            return userHeader != null && !userHeader.trim().isEmpty()
                    && request.getHeader(userHeader) != null;
        }
        return false;
    }

    @Override
    public String tokenOf(HttpServletRequest request) {
        /* header 模式的身份来自网关注入头，没有可吊销的令牌原文；只有 jwt/endpoint 有。 */
        String mode = props.getMode() == null ? "" : props.getMode().toLowerCase(Locale.ROOT);
        if (!"jwt".equals(mode) && !"endpoint".equals(mode)) return null;
        return extractToken(request);
    }

    private ConsolePrincipal byJwt(HttpServletRequest request) {
        String token = extractToken(request);
        if (token == null) {
            return null;
        }
        /* 登出吊销（本实例）：委托令牌由宿主签发，控制台无法撤销宿主侧凭证；
           但「已在本控制台退出」的令牌不应继续被接受（否则登出只是清了浏览器本地）。 */
        if (DelegatedTokenRevocations.isRevoked(token)) {
            return null;
        }
        JsonNode claims = jwtVerifier.verify(token);
        if (claims == null) {
            // debug→节流 WARN——secret/publicKey 配错（全量验签失败）此前无痕，
            // 交回内置鉴权后运营无从排查；复用 endpoint 臂同款节流器防无效 token 高频探测刷屏
            long now = System.currentTimeMillis();
            long last = lastJwtWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastJwtWarnAt.compareAndSet(last, now)) {
                LOG.warn("[PropertiesAuthDelegate] jwt 验签失败/过期（交回内置鉴权，{}s 内不再重复告警；"
                                + "持续出现请核对 jwt secret/public-key 配置与 token 签发方算法）",
                        WARN_THROTTLE_MS / 1000);
            }
            return null;
        }
        String username = JwtVerifier.claimText(claims, props.getJwt().getUsernameClaim());
        if (username == null || username.isEmpty()) {
            return null;
        }
        List<String> hostRoles = JwtVerifier.claimRoles(claims, props.getJwt().getRolesClaim());
        // 取展示名 claim（配了才取），顶栏/审计从哈希变人话
        String displayName = props.getJwt().getDisplayNameClaim().isEmpty() ? null
                : JwtVerifier.claimText(claims, props.getJwt().getDisplayNameClaim());
        return new ConsolePrincipal(username, roleMapper.map(hostRoles), false, true, displayName, null);
    }

    // ---------------- endpoint ----------------

    private ConsolePrincipal byEndpoint(HttpServletRequest request) {
        String token = extractToken(request);
        if (token == null || props.getEndpoint().getVerifyUrl().isEmpty()) {
            return null;
        }
        if (DelegatedTokenRevocations.isRevoked(token)) {
            verdictCache.remove(token);
            return null;
        }
        long now = System.currentTimeMillis();
        CachedVerdict cached = verdictCache.get(token);
        if (cached != null && now < cached.expireAt) {
            return cached.principal;
        }
        ConsolePrincipal principal = callVerifyEndpoint(request, token);
        long ttl = Math.max(1, props.getEndpoint().getCacheSeconds()) * 1000L;
        verdictCache.put(token, new CachedVerdict(principal, now + ttl));
        if (verdictCache.size() > 10_000) {
            verdictCache.clear(); // 简单防膨胀：极端 token 洪泛时整体重置
        }
        return principal;
    }

    private ConsolePrincipal callVerifyEndpoint(HttpServletRequest request, String token) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(props.getEndpoint().getVerifyUrl()).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(HTTP_TIMEOUT_MS);
            conn.setReadTimeout(HTTP_TIMEOUT_MS);
            conn.setRequestProperty(props.getTokenHeader(), request.getHeader(props.getTokenHeader()));
            for (String h : props.getEndpoint().getForwardHeaders().split(",")) {
                String name = h.trim();
                if (!name.isEmpty() && request.getHeader(name) != null) {
                    conn.setRequestProperty(name, request.getHeader(name));
                }
            }
            conn.setDoOutput(true);
            conn.getOutputStream().close(); // 空 body POST
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                // debug→节流 WARN——401/5xx 等故障此前无痕（交回内置鉴权运营无从排查）；
                // 401 高频回移除景复用 exception 臂节流器防刷屏（首条留痕，60s 内不再重复告警）
                long now = System.currentTimeMillis();
                long last = lastEndpointWarnAt.get();
                if (now - last > WARN_THROTTLE_MS && lastEndpointWarnAt.compareAndSet(last, now)) {
                    LOG.warn("[PropertiesAuthDelegate] endpoint 校验未通过 http={}（交回内置鉴权，{}s 内不再重复告警）",
                            code, WARN_THROTTLE_MS / 1000);
                }
                return null;
            }
            try (InputStream is = conn.getInputStream()) {
                JsonNode body = MAPPER.readTree(readAll(is));
                String username = JwtVerifier.claimText(body, props.getEndpoint().getUsernamePath());
                if (username == null || username.isEmpty()) {
                    // 2xx 但无 username=宿主接口的协议内否定裁决（正常应答、语义=凭据不通过，
                    // 负结果照契约入缓存）；与基础设施故障（非 2xx/异常臂）不同档，维持静默
                    return null;
                }
                List<String> hostRoles = JwtVerifier.claimRoles(body, props.getEndpoint().getRolesPath());
                // 宿主校验接口可同时下发展示名
                String displayName = props.getEndpoint().getDisplayNamePath().isEmpty() ? null
                        : JwtVerifier.claimText(body, props.getEndpoint().getDisplayNamePath());
                return new ConsolePrincipal(username, roleMapper.map(hostRoles), false, true, displayName, null);
            }
        } catch (Exception e) {
            long now = System.currentTimeMillis();
            long last = lastEndpointWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastEndpointWarnAt.compareAndSet(last, now)) {
                LOG.warn("[PropertiesAuthDelegate] endpoint 校验接口异常（交回内置鉴权，{}s 内不再重复告警）: {}",
                        WARN_THROTTLE_MS / 1000, e.getMessage(), e);
            }
            return null;
        }
    }

    // ---------------- header ----------------

    private ConsolePrincipal byHeader(HttpServletRequest request) {
        String userHeader = props.getHeader().getUserHeader();
        if (userHeader.isEmpty()) {
            return null;
        }
        /* 身份头默认由反向网关注入；直连方是公网地址时请求头可被客户端任意伪造
           （包含角色头→可直取 ADMIN），一律拒识交回内置鉴权。内网网关部署
           （remoteAddr 为回环/私网/链路本地）不受影响。
           配置 trusted-proxies 后进一步收窄：仅清单内地址（精确 IP/CIDR）采信身份头，
           私网内其它直连方也不再默认信任（防「私网 LB 后的任意客户端」伪造）。 */
        String remote = request.getRemoteAddr();
        boolean trusted;
        java.util.List<String> allow = props.getHeader().getTrustedProxies();
        if (!allow.isEmpty()) {
            trusted = remote == null ? false : matchesProxyList(remote.trim(), allow);
        } else {
            trusted = remote == null || remote.trim().isEmpty()
                    || ConsoleAuthInterceptor.isProxyAddress(remote.trim());
        }
        if (!trusted) {
            long now = System.currentTimeMillis();
            long last = lastHeaderWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastHeaderWarnAt.compareAndSet(last, now)) {
                LOG.warn("[PropertiesAuthDelegate] header 模式拒绝非受信来源的身份头 remote={}（{}s 内不再重复告警）。"
                        + "若这是反向网关/容器的真实地址（容器网段/CGNAT/IPv6 直连都会命中），"
                        + "请将其加入 esquerystudio.elasticsearch.console.auth.delegate.header.trusted-proxies"
                        + "（精确 IP 或 CIDR，逗号分隔）；清单为空时默认仅信任回环/私网/链路本地地址",
                        remote, WARN_THROTTLE_MS / 1000);
            }
            return null;
        }
        String username = request.getHeader(userHeader);
        if (username == null || username.trim().isEmpty()) {
            return null;
        }
        ConsoleRole role = ConsoleRole.VIEWER;
        String rolesHeader = props.getHeader().getRolesHeader();
        if (!rolesHeader.isEmpty()) {
            String raw = request.getHeader(rolesHeader);
            if (raw != null) {
                role = roleMapper.map(java.util.Arrays.asList(raw.split(",")));
            }
        }
        // 展示名头（网关注入）；含 % 视为 URL 编码过——HTTP 头携中文需编码，服务端兜底解
        String displayName = null;
        String dnHeader = props.getHeader().getDisplayNameHeader();
        if (!dnHeader.isEmpty()) {
            displayName = decodeMaybe(request.getHeader(dnHeader));
        }
        return new ConsolePrincipal(username.trim(), role, false, true, displayName, null);
    }

    // ---------------- helpers ----------------

    /** 来源是否命中受信代理清单：条目可为精确 IP 或 IPv4 CIDR（如 10.8.0.0/16）；
     * IPv6 仅支持精确匹配（::1 等回环写法）。命中失败一律不采信（fail-closed）。 */
    static boolean matchesProxyList(String remote, java.util.List<String> allow) {
        String a = remote.toLowerCase(java.util.Locale.ROOT);
        if (a.startsWith("::ffff:")) {
            a = a.substring(7);
        }
        for (String raw : allow) {
            String entry = raw == null ? "" : raw.trim().toLowerCase(java.util.Locale.ROOT);
            if (entry.isEmpty()) {
                continue;
            }
            if (entry.equals(a)) {
                return true;
            }
            int slash = entry.indexOf('/');
            if (slash > 0 && a.indexOf('.') > 0) {
                if (ipv4CidrContains(entry, a)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** IPv4 CIDR 判定；任一侧解析失败按不匹配处理（fail-closed，不抛错）。 */
    private static boolean ipv4CidrContains(String cidr, String addr) {
        try {
            String[] parts = cidr.split("/", 2);
            int[] base = ipv4Parts(parts[0]);
            int[] ip = ipv4Parts(addr);
            if (base == null || ip == null) {
                return false;
            }
            int prefix = Integer.parseInt(parts[1].trim());
            if (prefix < 0 || prefix > 32) {
                return false;
            }
            long mask = prefix == 0 ? 0L : (-1L << (32 - prefix)) & 0xFFFFFFFFL;
            long baseVal = (base[0] << 24 | base[1] << 16 | base[2] << 8 | base[3]) & 0xFFFFFFFFL;
            long ipVal = (ip[0] << 24 | ip[1] << 16 | ip[2] << 8 | ip[3]) & 0xFFFFFFFFL;
            return (baseVal & mask) == (ipVal & mask);
        } catch (Exception e) {
            return false;
        }
    }

    private static int[] ipv4Parts(String s) {
        String[] segs = s.split("\\.");
        if (segs.length != 4) {
            return null;
        }
        int[] out = new int[4];
        for (int i = 0; i < 4; i++) {
            int v = Integer.parseInt(segs[i].trim());
            if (v < 0 || v > 255) {
                return null;
            }
            out[i] = v;
        }
        return out;
    }

    /** 展示名头解码：含 % 才尝试 URL 解码（纯 ASCII 人名直透），解码失败退回原值不报错。 */
    private static String decodeMaybe(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        String v = raw.trim();
        if (v.indexOf('%') >= 0) {
            try {
                return java.net.URLDecoder.decode(v, StandardCharsets.UTF_8.name());
            } catch (Exception ignore) {
                return v;
            }
        }
        return v;
    }

    /** 从 token-header 取凭据，剥 {@code Bearer } 前缀；无 → null。 */
    private String extractToken(HttpServletRequest request) {
        String raw = request.getHeader(props.getTokenHeader());
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        String token = raw.trim();
        if (token.regionMatches(true, 0, "Bearer ", 0, 7)) {
            token = token.substring(7).trim();
        }
        return token.isEmpty() ? null : token;
    }

    private static String readAll(InputStream is) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) > 0) {
            out.write(buf, 0, n);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    /** endpoint 模式短缓存条目（principal 可为 null——负结果同样缓存，防打穿宿主接口）。 */
    private static final class CachedVerdict {
        final ConsolePrincipal principal;
        final long expireAt;

        CachedVerdict(ConsolePrincipal principal, long expireAt) {
            this.principal = principal;
            this.expireAt = expireAt;
        }
    }
}
