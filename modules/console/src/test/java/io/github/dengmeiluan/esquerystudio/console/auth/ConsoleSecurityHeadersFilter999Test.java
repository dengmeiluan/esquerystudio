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

import org.junit.Test;

import javax.servlet.FilterChain;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 控制台 API 基础安全响应头：nosniff 全量、auth 域禁缓存、frame-ancestors 仅显式配置下发。
 */
public class ConsoleSecurityHeadersFilter999Test {

    private static HttpServletRequest request(String uri) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleSecurityHeadersFilter999Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (InvocationHandler) (proxy, method, args) -> {
                    if ("getRequestURI".equals(method.getName())) return uri;
                    if ("equals".equals(method.getName())) return proxy == args[0];
                    if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
                    if ("toString".equals(method.getName())) return "stub-request";
                    return null;
                });
    }

    private static HttpServletResponse capture(Map<String, String> headers) {
        return (HttpServletResponse) Proxy.newProxyInstance(
                ConsoleSecurityHeadersFilter999Test.class.getClassLoader(),
                new Class<?>[]{HttpServletResponse.class},
                (InvocationHandler) (proxy, method, args) -> {
                    if ("setHeader".equals(method.getName())) {
                        headers.put((String) args[0], (String) args[1]);
                        return null;
                    }
                    if ("equals".equals(method.getName())) return proxy == args[0];
                    if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
                    if ("toString".equals(method.getName())) return "stub-response";
                    return null;
                });
    }

    private static final FilterChain PASS_THROUGH = (req, resp) -> { };

    @Test
    public void auth域禁缓存且全量nosniff() throws Exception {
        ConsoleSecurityHeadersFilter f = new ConsoleSecurityHeadersFilter(null);
        Map<String, String> headers = new LinkedHashMap<>();
        f.doFilter(request("/internal/es/index/auth/login"), capture(headers), PASS_THROUGH);
        assertEquals("nosniff", headers.get("X-Content-Type-Options"));
        assertEquals("no-store", headers.get("Cache-Control"));
        assertEquals("no-referrer", headers.get("Referrer-Policy"));
    }

    @Test
    public void 非auth域不禁缓存() throws Exception {
        ConsoleSecurityHeadersFilter f = new ConsoleSecurityHeadersFilter(null);
        Map<String, String> headers = new LinkedHashMap<>();
        f.doFilter(request("/internal/es/index/cluster/indices"), capture(headers), PASS_THROUGH);
        assertEquals("nosniff", headers.get("X-Content-Type-Options"));
        assertNull("非身份面不禁缓存（列表页有自身缓存语义）", headers.get("Cache-Control"));
    }

    @Test
    public void frameAncestors仅显式配置下发() throws Exception {
        Map<String, String> headers = new LinkedHashMap<>();
        new ConsoleSecurityHeadersFilter(null)
                .doFilter(request("/internal/es/index/keys"), capture(headers), PASS_THROUGH);
        assertFalse("未配置不下发 CSP", headers.containsKey("Content-Security-Policy"));

        Map<String, String> withCsp = new LinkedHashMap<>();
        new ConsoleSecurityHeadersFilter("'self' https://portal.example.com")
                .doFilter(request("/internal/es/index/keys"), capture(withCsp), PASS_THROUGH);
        assertEquals("frame-ancestors 'self' https://portal.example.com",
                withCsp.get("Content-Security-Policy"));
        assertTrue(withCsp.containsKey("X-Content-Type-Options"));
    }
}
