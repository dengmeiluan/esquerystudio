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
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

/**
 * 批次 990：header 模式受信代理清单（trusted-proxies）——配置后身份头仅在
 * remoteAddr 命中清单（精确 IP / IPv4 CIDR）时采信，私网内非清单直连方不再默认信任；
 * 清单为空维持既有行为（回环/私网/链路本地即信），升级零破坏。
 */
public class PropertiesAuthDelegateTrustedProxy990Test {

    private static ESQueryStudioElasticsearchProperties.Delegate headerProps(String... trustedProxies) {
        ESQueryStudioElasticsearchProperties.Delegate p = new ESQueryStudioElasticsearchProperties.Delegate();
        p.setMode("header");
        p.getHeader().setUserHeader("X-User");
        p.getHeader().setRolesHeader("X-Roles");
        p.getHeader().setTrustedProxies(Arrays.asList(trustedProxies));
        return p;
    }

    private static HttpServletRequest requestFrom(String remoteAddr) {
        Map<String, String> headers = new HashMap<>();
        headers.put("X-User", "host-user");
        headers.put("X-Roles", "cluster-op");
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getHeader": return headers.get(args[0]);
                case "getRemoteAddr": return remoteAddr;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                PropertiesAuthDelegateTrustedProxy990Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    @Test
    public void 清单为空维持私网即信的现状() {
        PropertiesAuthDelegate d = new PropertiesAuthDelegate(headerProps());
        assertNotNull("私网来源身份头照旧采信（零破坏）",
                d.authenticate(requestFrom("10.1.2.3")));
        assertNotNull("回环来源照旧采信", d.authenticate(requestFrom("127.0.0.1")));
        assertNull("公网直连仍拒（既有语义）", d.authenticate(requestFrom("203.0.113.9")));
    }

    @Test
    public void 清单命中CIDR与精确IP才采信() {
        PropertiesAuthDelegate d = new PropertiesAuthDelegate(headerProps("10.8.0.0/16", "192.168.1.5"));
        assertNotNull("CIDR 内网关地址采信",
                d.authenticate(requestFrom("10.8.20.30")));
        assertNotNull("精确 IP 命中采信",
                d.authenticate(requestFrom("192.168.1.5")));
        assertNull("私网但不在清单=不再默认信任",
                d.authenticate(requestFrom("10.9.1.1")));
        assertNull("清单外同段地址仍拒",
                d.authenticate(requestFrom("192.168.1.6")));
    }

    @Test
    public void 回环IPv6精确匹配与映射形态() {
        PropertiesAuthDelegate d = new PropertiesAuthDelegate(headerProps("::1"));
        assertNotNull("IPv6 回环精确匹配",
                d.authenticate(requestFrom("::1")));
        assertNull("其它 IPv6 地址不采信",
                d.authenticate(requestFrom("fd00::2")));
        PropertiesAuthDelegate d2 = new PropertiesAuthDelegate(headerProps("10.8.0.0/16"));
        assertNotNull("::ffff: 映射的 IPv4 走 CIDR 判定",
                d2.authenticate(requestFrom("::ffff:10.8.3.4")));
    }

    @Test
    public void 坏清单条目不炸不误放() {
        PropertiesAuthDelegate d = new PropertiesAuthDelegate(headerProps("not-a-cidr/xx", "10.8.0.0/16"));
        assertNotNull("好条目仍生效",
                d.authenticate(requestFrom("10.8.0.7")));
        assertNull("坏条目不把其它地址误放行",
                d.authenticate(requestFrom("10.9.9.9")));
    }

    @Test
    public void CIDR边界判定() {
        assertEquals(true, PropertiesAuthDelegate.matchesProxyList(
                "10.8.0.0", Arrays.asList("10.8.0.0/16")));
        assertEquals(true, PropertiesAuthDelegate.matchesProxyList(
                "10.8.255.255", Arrays.asList("10.8.0.0/16")));
        assertEquals(false, PropertiesAuthDelegate.matchesProxyList(
                "10.9.0.0", Arrays.asList("10.8.0.0/16")));
        assertEquals(true, PropertiesAuthDelegate.matchesProxyList(
                "10.20.30.40", Arrays.asList("10.0.0.0/8")));
        assertEquals(true, PropertiesAuthDelegate.matchesProxyList(
                "1.2.3.4", Arrays.asList("0.0.0.0/0")));
        assertEquals(true, PropertiesAuthDelegate.matchesProxyList(
                "1.2.3.4", Arrays.asList("1.2.3.4/32", "9.9.9.9")));
        assertEquals(false, PropertiesAuthDelegate.matchesProxyList(
                "1.2.3.5", Arrays.asList("1.2.3.4/32", "9.9.9.9")));
    }
}
