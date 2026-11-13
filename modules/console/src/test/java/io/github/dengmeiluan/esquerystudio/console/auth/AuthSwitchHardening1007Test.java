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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 1007：账号切换/委托凭证面的三处硬化——宿主凭证被拒不得回落旧内置身份、
 * 委托登出吊销必须拿到宿主令牌、委托模式配置错误启动即失败。
 */
public class AuthSwitchHardening1007Test {

    private static HttpServletRequest requestWith(String header, String value) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                AuthSwitchHardening1007Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getHeader".equals(m.getName())) {
                        return header.equals(args[0]) ? value : null;
                    }
                    if ("getRemoteAddr".equals(m.getName())) return "127.0.0.1";
                    throw new UnsupportedOperationException(m.getName());
                });
    }

    @Test
    public void 宿主凭证被拒不回落内置身份() {
        ConsolePrincipal builtinAdmin = new ConsolePrincipal("local-admin", ConsoleRole.ADMIN, false);
        ConsoleAuthDelegate rejected = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return null; }
            @Override public boolean hasCredential(HttpServletRequest request) { return true; }
        };
        DelegatingConsoleAuthorizer authorizer =
                new DelegatingConsoleAuthorizer(rejected, req -> builtinAdmin);
        assertNull("宿主令牌过期/被撤销时不得静默升级成残留的内置 ADMIN",
                authorizer.authenticate(requestWith("X-Es-Host-Token", "stale")));

        ConsoleAuthDelegate anonymous = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return null; }
        };
        DelegatingConsoleAuthorizer withFallback =
                new DelegatingConsoleAuthorizer(anonymous, req -> builtinAdmin);
        assertNotNull("没带宿主凭证时仍允许内置登录",
                withFallback.authenticate(requestWith("X-Other", "v")));
    }

    @Test
    public void 委托登出使用宿主令牌原文() {
        ESQueryStudioElasticsearchProperties.Delegate props = new ESQueryStudioElasticsearchProperties.Delegate();
        props.setMode("jwt");
        props.getJwt().setSecret("0123456789abcdef0123456789abcdef");
        PropertiesAuthDelegate delegate = new PropertiesAuthDelegate(props);
        HttpServletRequest req = requestWith("Authorization", "Bearer host-token-abc");
        assertTrue(delegate.hasCredential(req));
        assertEquals("host-token-abc", delegate.tokenOf(req));

        ESQueryStudioElasticsearchProperties.Delegate headerMode = new ESQueryStudioElasticsearchProperties.Delegate();
        headerMode.setMode("header");
        headerMode.getHeader().setUserHeader("X-User");
        PropertiesAuthDelegate header = new PropertiesAuthDelegate(headerMode);
        HttpServletRequest headerReq = requestWith("X-User", "u1");
        assertTrue(header.hasCredential(headerReq));
        assertNull("header 模式没有可吊销的令牌原文", header.tokenOf(headerReq));
    }

    @Test
    public void 委托吊销表按指纹生效且过期自愈() {
        DelegatedTokenRevocations.clear();
        long now = System.currentTimeMillis();
        assertTrue(DelegatedTokenRevocations.revoke("token-a", now + 60_000L));
        assertTrue(DelegatedTokenRevocations.isRevoked("token-a"));
        assertFalse(DelegatedTokenRevocations.isRevoked("token-b"));
        assertFalse("已过期令牌无需登记", DelegatedTokenRevocations.revoke("token-c", now - 1));
        assertFalse(DelegatedTokenRevocations.isRevoked("token-c"));
        assertEquals(DelegatedTokenRevocations.fingerprint("x"),
                DelegatedTokenRevocations.fingerprint("x"));
        DelegatedTokenRevocations.clear();
    }

    @Test
    public void 自定义委托报出的令牌也受登出拒绝表约束() {
        DelegatedTokenRevocations.clear();
        String token = "custom-delegate-token";
        assertTrue(DelegatedTokenRevocations.revoke(token, System.currentTimeMillis() + 60_000L));
        ConsolePrincipal hostUser = new ConsolePrincipal("host-user", ConsoleRole.ADMIN, false, true,
                "宿主用户", null, Collections.<String>emptySet());
        ConsoleAuthDelegate custom = new ConsoleAuthDelegate() {
            @Override public ConsolePrincipal authenticate(HttpServletRequest request) { return hostUser; }
            @Override public String tokenOf(HttpServletRequest request) { return token; }
        };
        DelegatingConsoleAuthorizer authorizer = new DelegatingConsoleAuthorizer(custom, null);
        assertNull("自定义委托（未实现 revoke）只要报出 tokenOf，内核也必须执行登出拒绝",
                authorizer.authenticate(requestWith("X-Es-Host-Token", token)));
        DelegatedTokenRevocations.clear();
    }

    @Test
    public void 委托模式配置错误启动即失败() {
        expectInvalid("jwt2", p -> p.getConsole().getAuth().getDelegate().setMode("jwt2"));
        expectInvalid("jwt 缺密钥/公钥", p -> p.getConsole().getAuth().getDelegate().setMode("jwt"));
        expectInvalid("endpoint 缺 verify-url", p -> p.getConsole().getAuth().getDelegate().setMode("endpoint"));
        expectInvalid("header 缺 user-header", p -> p.getConsole().getAuth().getDelegate().setMode("header"));

        ESQueryStudioElasticsearchProperties okHeader = new ESQueryStudioElasticsearchProperties();
        okHeader.getConsole().getAuth().getDelegate().setMode("header");
        okHeader.getConsole().getAuth().getDelegate().getHeader().setUserHeader("X-User");
        okHeader.validate();
    }

    private interface Mutator { void apply(ESQueryStudioElasticsearchProperties p); }

    private static void expectInvalid(String why, Mutator m) {
        ESQueryStudioElasticsearchProperties p = new ESQueryStudioElasticsearchProperties();
        m.apply(p);
        try {
            p.validate();
            fail("应拒绝：" + why);
        } catch (IllegalStateException expected) {
            assertNotNull(expected.getMessage());
        }
    }

    @Test
    public void 无委托配置保持零变更() {
        ESQueryStudioElasticsearchProperties p = new ESQueryStudioElasticsearchProperties();
        p.getConsole().getAuth().getDelegate().setMode("");
        p.validate();
        assertEquals("", p.getConsole().getAuth().getDelegate().getMode());
    }
}
