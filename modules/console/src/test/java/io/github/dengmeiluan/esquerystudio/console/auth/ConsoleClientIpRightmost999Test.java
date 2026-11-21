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

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;

/**
 * 审计来源 IP 的转发头口径：X-Forwarded-For 取「从右往左第一个非受信代理」的跳——
 * 代理把真实客户端地址追加在客户端可伪造值之后，取最左首跳会让伪造值冒充审计来源。
 */
public class ConsoleClientIpRightmost999Test {

    private static HttpServletRequest request(String remoteAddr, String xff, String xRealIp) {
        final Map<String, String> headers = new LinkedHashMap<>();
        if (xff != null) headers.put("X-Forwarded-For", xff);
        if (xRealIp != null) headers.put("X-Real-IP", xRealIp);
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleClientIpRightmost999Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (InvocationHandler) (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getRemoteAddr":
                            return remoteAddr;
                        case "getHeader":
                            return headers.get((String) args[0]);
                        case "equals":
                            return proxy == args[0];
                        case "hashCode":
                            return System.identityHashCode(proxy);
                        case "toString":
                            return "stub-request";
                        default:
                            return null;
                    }
                });
    }

    @Test
    public void 受信代理链取最右非受信跳() {
        /* 既有契约：内层私网代理 + 公网客户端 → 公网地址 */
        assertEquals("203.0.113.9",
                ConsoleAuthInterceptor.clientIp(request("10.0.0.2", "203.0.113.9, 10.0.0.1", null)));
        /* 客户端在头部前置伪造值：真实地址由代理追加在最右，伪造的最左值不得冒充 */
        assertEquals("203.0.113.9",
                ConsoleAuthInterceptor.clientIp(request("10.0.0.2", "6.6.6.6, 203.0.113.9, 10.0.0.1", null)));
    }

    @Test
    public void 全受信链回退最左一跳() {
        assertEquals("10.0.0.9",
                ConsoleAuthInterceptor.clientIp(request("10.0.0.2", "10.0.0.9, 10.0.0.1", null)));
    }

    @Test
    public void 公网直连不采信转发头() {
        assertEquals("203.0.113.9",
                ConsoleAuthInterceptor.clientIp(request("203.0.113.9", "6.6.6.6", null)));
    }

    @Test
    public void 无转发头回落remoteAddr或RealIP() {
        assertEquals("10.0.0.2",
                ConsoleAuthInterceptor.clientIp(request("10.0.0.2", null, null)));
        assertEquals("198.51.100.7",
                ConsoleAuthInterceptor.clientIp(request("10.0.0.2", null, "198.51.100.7")));
        assertEquals("198.51.100.7",
                ConsoleAuthInterceptor.clientIp(request("10.0.0.2", " ", "198.51.100.7")));
    }
}
