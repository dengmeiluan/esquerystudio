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
import io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog;

import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 1124：委托鉴权面两条「有权限不被误拦 / 无权限绝不放行」的双向回归。
 *
 * <p>① 宿主鉴权<b>抛异常</b>时不得回落到浏览器里残留的内置 token——否则一次宿主 500
 * 就能把已被宿主撤销的会话升级成本地 ADMIN；但「没带宿主凭证」的独立部署仍必须能
 * 走内置登录（有权限的人不能被门禁拖死）。</p>
 *
 * <p>② 自定义委托只实现 {@code tokenOf}（宿主内嵌形态、不实现 revoke）时，控制台
 * 登出必须由内核兜底登记拒绝表——产线实测曾是 200 → 旧令牌继续可用。</p>
 */
public class DelegateAuthFailClosed1124Test {

    private static final String HOST_TOKEN_HEADER = "X-Es-Host-Token";

    private static HttpServletRequest requestWith(String header, String value) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                DelegateAuthFailClosed1124Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getHeader".equals(m.getName())) {
                        return header.equals(args[0]) ? value : null;
                    }
                    if ("getRemoteAddr".equals(m.getName())) return "127.0.0.1";
                    if ("getAttribute".equals(m.getName())) return null;
                    Class<?> rt = m.getReturnType();
                    return rt == boolean.class ? false : rt == int.class ? 0 : null;
                });
    }

    private static ConsolePrincipal builtinAdmin() {
        return new ConsolePrincipal("local-admin", ConsoleRole.ADMIN, false);
    }

    @Test
    public void 委托抛异常且请求携带宿主凭证时不回落内置身份() {
        ConsoleAuthDelegate broken = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) {
                throw new IllegalStateException("宿主鉴权服务 500");
            }
            @Override public boolean hasCredential(HttpServletRequest request) { return true; }
        };
        DelegatingConsoleAuthorizer authorizer =
                new DelegatingConsoleAuthorizer(broken, req -> builtinAdmin());
        assertNull("宿主故障 + 带宿主凭证：不得静默升级成残留的内置 ADMIN",
                authorizer.authenticate(requestWith(HOST_TOKEN_HEADER, "revoked-at-host")));
    }

    @Test
    public void 委托抛异常但未携带宿主凭证时仍允许内置登录() {
        ConsoleAuthDelegate broken = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) {
                throw new IllegalStateException("宿主鉴权服务 500");
            }
            @Override public boolean hasCredential(HttpServletRequest request) { return false; }
        };
        DelegatingConsoleAuthorizer authorizer =
                new DelegatingConsoleAuthorizer(broken, req -> builtinAdmin());
        assertNotNull("独立部署/未带宿主凭证：宿主故障不得连坐内置登录（避免误拦有权限的人）",
                authorizer.authenticate(requestWith("X-Other", "v")));
    }

    @Test
    public void 凭证探测自身异常时按携带凭证处理() {
        ConsoleAuthDelegate broken = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) {
                throw new IllegalStateException("鉴权失败");
            }
            @Override public boolean hasCredential(HttpServletRequest request) {
                throw new IllegalStateException("凭证探测失败");
            }
        };
        DelegatingConsoleAuthorizer authorizer =
                new DelegatingConsoleAuthorizer(broken, req -> builtinAdmin());
        assertNull("无法判断是否带宿主凭证 → fail-closed，不回落到内置身份",
                authorizer.authenticate(requestWith(HOST_TOKEN_HEADER, "t")));
    }

    @Test
    public void 只实现tokenOf的委托被拒时同样不回落内置身份() {
        /* 宿主内嵌形态：有 tokenOf、没有 hasCredential（默认 false）。
           只看 hasCredential 会让「被宿主拒绝」的请求回落到内置 ADMIN。 */
        ConsoleAuthDelegate tokenOnly = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return null; }
            @Override public String tokenOf(HttpServletRequest request) {
                return request.getHeader(HOST_TOKEN_HEADER);
            }
        };
        DelegatingConsoleAuthorizer authorizer =
                new DelegatingConsoleAuthorizer(tokenOnly, req -> builtinAdmin());
        assertNull("tokenOf 报出令牌但鉴权未通过：不得回落内置身份",
                authorizer.authenticate(requestWith(HOST_TOKEN_HEADER, "host-jwt")));
        assertNotNull("无宿主令牌时仍允许内置登录（有权限的人不被误拦）",
                authorizer.authenticate(requestWith("X-Other", "v")));
    }

    @Test
    public void 只实现tokenOf的委托抛异常时也不回落内置身份() {
        ConsoleAuthDelegate tokenOnlyBroken = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) {
                throw new IllegalStateException("宿主 502");
            }
            @Override public String tokenOf(HttpServletRequest request) {
                return request.getHeader(HOST_TOKEN_HEADER);
            }
        };
        DelegatingConsoleAuthorizer authorizer =
                new DelegatingConsoleAuthorizer(tokenOnlyBroken, req -> builtinAdmin());
        assertNull("宿主故障 + tokenOf 有值：不得升级成本地 ADMIN",
                authorizer.authenticate(requestWith(HOST_TOKEN_HEADER, "host-jwt")));
    }

    @Test
    public void 委托正常返回身份时零干扰() {        ConsolePrincipal hostUser = new ConsolePrincipal("host-user", ConsoleRole.VIEWER, false, true,
                "宿主用户", null, Collections.<String>emptySet());
        ConsoleAuthDelegate ok = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return hostUser; }
            @Override public boolean hasCredential(HttpServletRequest request) { return true; }
        };
        DelegatingConsoleAuthorizer authorizer = new DelegatingConsoleAuthorizer(ok, req -> builtinAdmin());
        ConsolePrincipal p = authorizer.authenticate(requestWith(HOST_TOKEN_HEADER, "t"));
        assertNotNull(p);
        assertEquals("host-user", p.getUsername());
    }

    @Test
    public void 自定义委托只报令牌时登出由内核兜底吊销() {
        DelegatedTokenRevocations.clear();
        String token = "acme-host-jwt";
        ConsolePrincipal hostUser = new ConsolePrincipal("host-user", ConsoleRole.ADMIN, false, true,
                "宿主用户", null, Collections.<String>emptySet());
        /* 宿主内嵌形态：authenticate + tokenOf 已实现，revoke 走 SPI 默认 false。 */
        ConsoleAuthDelegate acmeLike = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return hostUser; }
            @Override public String tokenOf(HttpServletRequest request) {
                return request.getHeader(HOST_TOKEN_HEADER);
            }
        };
        ConsoleAuthController controller = new ConsoleAuthController(
                new BuiltinConsoleAuthService(() -> null, "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "s"),
                noopAudit(), ConsolePageCatalog.load(), true);
        injectDelegates(controller, Collections.singletonList(acmeLike));

        HttpServletRequest req = requestWith(HOST_TOKEN_HEADER, token);
        java.util.Map<String, Object> out = controller.logout(req);
        assertEquals(Boolean.TRUE, out.get("revoked"));
        assertTrue("自定义委托报出的令牌必须进入本实例拒绝表", DelegatedTokenRevocations.isRevoked(token));

        DelegatingConsoleAuthorizer authorizer = new DelegatingConsoleAuthorizer(acmeLike, null);
        assertNull("登出后同一宿主令牌不得再通过鉴权",
                authorizer.authenticate(requestWith(HOST_TOKEN_HEADER, token)));
        DelegatedTokenRevocations.clear();
    }

    @Test
    public void 委托已自行吊销时不重复登记且仍报吊销成功() {
        DelegatedTokenRevocations.clear();
        String token = "endpoint-token";
        ConsoleAuthDelegate revoking = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return null; }
            @Override public String tokenOf(HttpServletRequest request) { return token; }
            @Override public boolean revoke(String t) {
                return DelegatedTokenRevocations.revoke(t, System.currentTimeMillis() + 60_000L);
            }
        };
        ConsoleAuthController controller = new ConsoleAuthController(
                new BuiltinConsoleAuthService(() -> null, "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "s"),
                noopAudit(), ConsolePageCatalog.load(), true);
        injectDelegates(controller, Collections.singletonList(revoking));

        java.util.Map<String, Object> out = controller.logout(requestWith(HOST_TOKEN_HEADER, token));
        assertEquals(Boolean.TRUE, out.get("revoked"));
        assertTrue(DelegatedTokenRevocations.isRevoked(token));
        DelegatedTokenRevocations.clear();
    }

    @Test
    public void 无令牌的委托登出不登记任何拒绝项() {
        DelegatedTokenRevocations.clear();
        ConsoleAuthDelegate headerMode = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return null; }
        };
        ConsoleAuthController controller = new ConsoleAuthController(
                new BuiltinConsoleAuthService(() -> null, "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "s"),
                noopAudit(), ConsolePageCatalog.load(), true);
        injectDelegates(controller, Collections.singletonList(headerMode));

        java.util.Map<String, Object> out = controller.logout(requestWith("X-User", "u1"));
        assertEquals(Boolean.FALSE, out.get("revoked"));
        assertFalse(DelegatedTokenRevocations.isRevoked("u1"));
    }

    private static ConsoleOpsAuditStore noopAudit() {
        return new ConsoleOpsAuditStore() {
            @Override public void record(ConsoleOpsAuditEvent event) { }
            @Override public java.util.List<ConsoleOpsAuditEvent> search(
                    String u, String a, int size, int from, Long sinceMs) {
                return Collections.emptyList();
            }
        };
    }

    private static void injectDelegates(ConsoleAuthController controller,
                                        java.util.List<ConsoleAuthDelegate> delegates) {
        try {
            java.lang.reflect.Field f = ConsoleAuthController.class.getDeclaredField("authDelegates");
            f.setAccessible(true);
            f.set(controller, delegates);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
