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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

/**
 * 探活 IDOR 收口：连接列表按 minRole 过滤后，probe 端点也必须按同一档案 minRole 裁决，
 * 否则 VIEWER 知道 id 就能探活 ADMIN 级连接并读取集群名/版本/健康。
 */
public class EsClusterConnProbeRoleTest {

    private static ConnStore store(String minRole) {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) {
                RemoteClusterConn c = new RemoteClusterConn();
                c.setMinRole(minRole);
                return c;
            }
            @Override public String getName(String id) { return id; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static HttpServletRequest request(ConsoleRole role) {
        return request(new ConsolePrincipal("u", role, false));
    }

    private static HttpServletRequest request(ConsoleRole role, java.util.Set<String> grantedPages) {
        return request(new ConsolePrincipal("u", role, false, true, null, null, grantedPages));
    }

    private static HttpServletRequest request(ConsolePrincipal principal) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        InvocationHandler h = (proxy, method, args) -> {
            if ("getAttribute".equals(method.getName())) return attrs.get(args[0]);
            throw new UnsupportedOperationException(method.getName());
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                EsClusterConnProbeRoleTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static EsClusterConnController controller(String minRole) {
        return new EsClusterConnController(store(minRole), null, null, null);
    }

    @Test
    public void viewer不能探活ADMIN级连接() {
        try {
            controller("ADMIN").probe("c-admin", request(ConsoleRole.VIEWER));
            fail("应拒绝低于档案 minRole 的探活");
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    @Test
    public void ADMIN可探活ADMIN级连接_无探活器时回禁用态() {
        Map<String, Object> r = controller("ADMIN").probe("c-admin", request(ConsoleRole.ADMIN));
        assertEquals("UNKNOWN", r.get("status"));
        assertEquals("PROBE_DISABLED", r.get("code"));
    }

    @Test
    public void 混合静态页授权的连接对所有连接可见() {
        /* 静态页是全局授权（effectivePages 对所有连接生效），不能被 conn 键反过来隐藏 */
        java.util.Set<String> mixed = new java.util.HashSet<>(java.util.Arrays.asList("overview", "conn:c1:devtools"));
        Map<String, Object> r = controller("VIEWER").probe("c-other", request(ConsoleRole.VIEWER, mixed));
        assertEquals("PROBE_DISABLED", r.get("code"));
    }

    @Test
    public void 纯连接模型只能探活已授权连接() {
        java.util.Set<String> connOnly = new java.util.HashSet<>(
                java.util.Arrays.asList("conn:c1:devtools", "conn:c1:w:devtools"));
        try {
            controller("VIEWER").probe("c-other", request(ConsoleRole.VIEWER, connOnly));
            fail("未授权连接必须拒绝探活");
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
        Map<String, Object> ok = controller("VIEWER").probe("c1", request(ConsoleRole.VIEWER, connOnly));
        assertEquals("PROBE_DISABLED", ok.get("code"));
    }

    @Test
    public void ADMIN与无鉴权部署的连接目录不得被可见性快照清空() {
        Map<String, Object> row = new HashMap<>();
        row.put("id", "c1");
        row.put("name", "生产集群");
        row.put("minRole", "ADMIN");
        ConnStore oneRow = new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.singletonList(row); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return "生产集群"; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        EsClusterConnController c = new EsClusterConnController(oneRow, null, null, null);
        assertEquals("ADMIN 必须看到完整连接目录", 1, c.list(request(ConsoleRole.ADMIN)).size());
        assertEquals("无鉴权部署必须看到完整连接目录", 1, c.list(request((ConsolePrincipal) null)).size());
    }
}
