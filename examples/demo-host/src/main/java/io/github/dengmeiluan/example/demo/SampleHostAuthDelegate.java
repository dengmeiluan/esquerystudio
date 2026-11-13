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

package io.github.dengmeiluan.example.demo;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthDelegate;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.DelegatedTokenRevocations;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * 宿主鉴权委托的<b>完整参考实现</b>（开源接入样板，不参与生产鉴权）。
 *
 * <p>本类演示接入方最容易漏的三件事，全部在 SPI 里只是 default 方法——不实现不会报错，
 * 但会留下安全缺口：</p>
 * <ol>
 *   <li><b>{@code authenticate}</b>：用宿主自己的会话/JWT 认身份，并把宿主角色映射成
 *       {@link ConsoleRole}。认不出返回 {@code null}（交回内置登录），<b>不要抛异常</b>；</li>
 *   <li><b>{@code hasCredential}</b>：本请求是否带了宿主凭证。缺了它，宿主会话被撤销时
 *       控制台会回落到浏览器残留的内置 token（静默提权成 ADMIN）；</li>
 *   <li><b>{@code tokenOf}</b> + <b>{@code revoke}</b>：登出必须能拿到原始令牌并登记拒绝表，
 *       否则「点了退出」只是清了本地存储，被复制的令牌在 TTL 内仍可用。</li>
 * </ol>
 *
 * <p>默认关闭：仅当显式设置 {@code demo.host-delegate.enabled=true} 时注册，
 * 保证 demo-host 的开箱冒烟（无宿主、首连 Setup）行为不变。</p>
 *
 * <p>令牌格式仅为演示：{@code Base64("user:role")}。真实接入请替换为验签后的宿主 JWT，
 * 并从宿主权限系统读页面授权（见 {@code grantedPages}）。</p>
 */
@Component
@ConditionalOnProperty(name = "demo.host-delegate.enabled", havingValue = "true")
public class SampleHostAuthDelegate implements ConsoleAuthDelegate {

    /** 演示用令牌头；真实宿主通常复用 {@code Authorization: Bearer <jwt>}。 */
    static final String TOKEN_HEADER = "X-Demo-Host-Token";

    /** 宿主角色 → 控制台角色。未命中的一律降为 VIEWER（fail-safe，不升权）。 */
    private static final Map<String, ConsoleRole> ROLE_MAP = new LinkedHashMap<>();

    static {
        ROLE_MAP.put("superadmin", ConsoleRole.ADMIN);
        ROLE_MAP.put("ops", ConsoleRole.OPERATOR);
        ROLE_MAP.put("viewer", ConsoleRole.VIEWER);
    }

    @Override
    public ConsolePrincipal authenticate(HttpServletRequest request) {
        String token = tokenOf(request);
        if (token == null) return null;
        String[] parts = decode(token);
        if (parts == null) return null;
        String username = parts[0];
        ConsoleRole role = ROLE_MAP.getOrDefault(parts[1].toLowerCase(), ConsoleRole.VIEWER);
        /* grantedPages 决定页面可见性与数据面写键归属：
           - null  = 未启用页面级授权（按角色全量，仅适合内部单团队部署）
           - 空集  = 全拒（零授权用户的正确表达，不要用 null 代替）
           演示给只读用户一个最小页集，写权限必须由宿主显式给出 conn:<id>:w:<page>。
           页面键的具体取值见 docs/integration/configuration-reference.md「授权键」。 */
        Set<String> pages = role == ConsoleRole.ADMIN
                ? null
                : new LinkedHashSet<>(java.util.Arrays.asList(
                        "conn:host:overview", "conn:host:indices", "conn:host:search"));
        return new ConsolePrincipal(username, role, false, true,
                "示例宿主 · " + username, Collections.<String, String>emptyMap(), pages);
    }

    @Override
    public boolean hasCredential(HttpServletRequest request) {
        /* 必须与 authenticate 用同一个判断：带了但不被接受 → 内核拒绝回落内置身份。 */
        String raw = request.getHeader(TOKEN_HEADER);
        return raw != null && !raw.trim().isEmpty();
    }

    @Override
    public String tokenOf(HttpServletRequest request) {
        String raw = request.getHeader(TOKEN_HEADER);
        return raw == null || raw.trim().isEmpty() ? null : raw.trim();
    }

    @Override
    public boolean revoke(String token) {
        /* 无状态令牌的控制台无法真正作废（宿主签发）；至少登记本实例拒绝表，
           让「已退出」的令牌在当前进程内立即失效。真实宿主应同时调用自己的
           会话/JWT 黑名单接口，并把 TTL 换成令牌真实 exp。 */
        long until = System.currentTimeMillis() + 3_600_000L;
        return DelegatedTokenRevocations.revoke(token, until);
    }

    private static String[] decode(String token) {
        try {
            String plain = new String(Base64.getDecoder().decode(token), StandardCharsets.UTF_8);
            int at = plain.indexOf(':');
            if (at <= 0 || at == plain.length() - 1) return null;
            return new String[]{plain.substring(0, at), plain.substring(at + 1)};
        } catch (IllegalArgumentException badToken) {
            return null;
        }
    }
}
