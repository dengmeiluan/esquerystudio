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
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * target-aware adhoc 轮：prepare/start 升级为数据面入口（跟随 X-Es-Target，
 * 消费方在服务端捕获目标），status/jobs/abort/confirm-switch 维持控制面（清绑定）。
 * 矩阵钉死 CONN_NOT_FOUND / CONN_FORBIDDEN / HOST_DISABLED 三道防线。
 */
public class AdhocTargetInterceptorTest {

    private static final String BASE = "/宿主/internal/es/index";

    private EsClientRouter router;
    private Map<String, RemoteClusterConn> conns;

    @Before
    public void setUp() {
        conns = new HashMap<>();
        router = new EsClientRouter(() -> null, fakeConnStore(conns), null);
        router.clear();
    }

    @After
    public void tearDown() {
        router.clear();
    }

    /* ---------------- 桩设施（JDK 动态代理，沿用仓内既定模式） ---------------- */

    private static HttpServletRequest request(String uri, String targetHeader, ConsolePrincipal principal) {
        return request(uri, targetHeader, principal, null);
    }

    private static HttpServletRequest request(String uri, String targetHeader, ConsolePrincipal principal,
                                               String normalizedPath) {
        Map<String, Object> attrs = new HashMap<>();
        if (principal != null) {
            attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        }
        if (normalizedPath != null) {
            attrs.put(ConsoleAuthInterceptor.ATTR_NORMALIZED_PATH, normalizedPath);
        }
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return "/宿主";
                case "getHeader": return targetHeader;
                case "getAttribute": return attrs.get(args[0]);
                case "setAttribute": attrs.put((String) args[0], args[1]); return null;
                /*  P2-4：env 封顶判定读请求方法（非 GET=写） */
                case "getMethod": return "POST";
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                AdhocTargetInterceptorTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static class StubResponse {
        int status = 200;
        final ByteArrayOutputStream out = new ByteArrayOutputStream();
        final HttpServletResponse proxy;

        StubResponse() {
            InvocationHandler h = (p, m, args) -> {
                switch (m.getName()) {
                    case "setStatus": status = (Integer) args[0]; return null;
                    case "setContentType": return null;
                    case "getOutputStream": {
                        return new javax.servlet.ServletOutputStream() {
                            @Override
                            public void write(int b) {
                                out.write(b);
                            }
                            @Override
                            public boolean isReady() { return true; }
                            @Override
                            public void setWriteListener(javax.servlet.WriteListener l) { }
                        };
                    }
                    default: throw new UnsupportedOperationException(m.getName());
                }
            };
            proxy = (HttpServletResponse) Proxy.newProxyInstance(
                AdhocTargetInterceptorTest.class.getClassLoader(),
                new Class<?>[]{HttpServletResponse.class}, h);
        }

        String bodyText() {
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static ConnStore fakeConnStore(Map<String, RemoteClusterConn> conns) {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return conns.get(id); }
            @Override public String getName(String id) { return conns.containsKey(id) ? ("conn-" + id) : null; }
            @Override public String getVersion(String id) { return conns.containsKey(id) ? "6.7.2" : null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                     String password, String minRole, Integer connectTimeoutMs,
                                                     Integer socketTimeoutMs, String env) {
                return new HashMap<>();
            }
            @Override public void updateVersion(String id, String esVersion) { }
            @Override public void delete(String id) { conns.remove(id); }
        };
    }

    private static RemoteClusterConn conn(String minRole) {
        RemoteClusterConn c = new RemoteClusterConn();
        c.setHost("es.example.com");
        c.setPort(9200);
        c.setMinRole(minRole);
        return c;
    }

    private static ConsolePrincipal principal(ConsoleRole role) {
        return new ConsolePrincipal("tester", role, false);
    }

    private static ConsolePrincipal delegated(ConsoleRole role, String... grantedPages) {
        Set<String> gp = new HashSet<>(Arrays.asList(grantedPages));
        return new ConsolePrincipal("tester", role, false, true, "测试用户", null, gp);
    }

    /* ---------------- 数据面：prepare / start 跟随目标头 ---------------- */

    @Test
    public void prepareBindsRemoteTarget() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        StubResponse resp = new StubResponse();
        boolean ok = interceptor.preHandle(
                request(BASE + "/adhoc-rebuild/prepare", "conn-a", principal(ConsoleRole.ADMIN)), resp.proxy, new Object());
        assertThat(ok).isTrue();
        assertThat(router.currentTarget()).isEqualTo("conn-a");
        interceptor.afterCompletion(null, null, null, null);
        assertThat(router.currentTarget()).isNull();
    }

    @Test
    public void startBindsRemoteTarget() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        assertThat(interceptor.preHandle(
                request(BASE + "/adhoc-rebuild/start", "conn-a", principal(ConsoleRole.ADMIN)),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget()).isEqualTo("conn-a");
    }

    @Test
    public void normalizedPathKeepsDataPlaneClassificationForMatrixParams() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        /* 裸 URI 含 ;x=1 时不得漏判为控制面清绑定——按鉴权层归一化路径仍绑定 conn-a */
        assertThat(interceptor.preHandle(
                request(BASE + "/cluster;x=1/delete-index", "conn-a", principal(ConsoleRole.ADMIN),
                        "/internal/es/index/cluster/delete-index"),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget()).isEqualTo("conn-a");

        router.clear();
        assertThat(interceptor.preHandle(
                request(BASE + "/adhoc-rebuild/start;x=1", "conn-a", principal(ConsoleRole.ADMIN),
                        "/internal/es/index/adhoc-rebuild/start"),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget()).isEqualTo("conn-a");
    }

    @Test
    public void prepareWithHostHeaderBindsNothing() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        assertThat(interceptor.preHandle(
                request(BASE + "/adhoc-rebuild/prepare", "host", principal(ConsoleRole.ADMIN)),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget()).isNull();
    }

    @Test
    public void unknownConnIsRejectedNotFound() throws Exception {
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        StubResponse resp = new StubResponse();
        boolean ok = interceptor.preHandle(
                request(BASE + "/adhoc-rebuild/prepare", "conn-gone", principal(ConsoleRole.ADMIN)),
                resp.proxy, new Object());
        assertThat(ok).isFalse();
        assertThat(resp.status).isEqualTo(404);
        assertThat(resp.bodyText()).contains("CONN_NOT_FOUND");
        assertThat(router.currentTarget()).isNull();
    }

    @Test
    public void roleBelowMinRoleIsRejectedForbidden() throws Exception {
        conns.put("conn-admin", conn("ADMIN"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        StubResponse resp = new StubResponse();
        boolean ok = interceptor.preHandle(
                request(BASE + "/adhoc-rebuild/start", "conn-admin", principal(ConsoleRole.VIEWER)),
                resp.proxy, new Object());
        assertThat(ok).isFalse();
        assertThat(resp.status).isEqualTo(403);
        assertThat(resp.bodyText()).contains("CONN_FORBIDDEN");
        assertThat(router.currentTarget()).isNull();
    }

    @Test
    public void hostHiddenModeRejectsHeaderlessAdhoc() throws Exception {
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), false);
        StubResponse resp = new StubResponse();
        boolean ok = interceptor.preHandle(
                request(BASE + "/adhoc-rebuild/prepare", null, principal(ConsoleRole.ADMIN)),
                resp.proxy, new Object());
        assertThat(ok).isFalse();
        assertThat(resp.status).isEqualTo(403);
        assertThat(resp.bodyText()).contains("HOST_DISABLED");
    }

    /* ---------------- 控制面：status/jobs/abort/confirm-switch 清绑定 ---------------- */

    @Test
    public void controlPlaneEndpointsClearTarget() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        for (String tail : new String[]{"/adhoc-rebuild/status", "/adhoc-rebuild/jobs",
                "/adhoc-rebuild/abort", "/adhoc-rebuild/confirm-switch"}) {
            assertThat(interceptor.preHandle(
                    request(BASE + tail, "conn-a", principal(ConsoleRole.ADMIN)),
                    new StubResponse().proxy, new Object()))
                    .as("控制面端点 %s 应放行且不绑定目标", tail)
                    .isTrue();
            assertThat(router.currentTarget()).as("控制面端点 %s 必须清绑定", tail).isNull();
        }
    }

    @Test
    public void existingDataPlaneStillBinds() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        assertThat(interceptor.preHandle(
                request(BASE + "/cluster/state", "conn-a", principal(ConsoleRole.ADMIN)),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget()).isEqualTo("conn-a");
    }

    /* ---------- 978：目标头必须同时过连接可见性（页面键 + minRole） ---------- */

    @Test
    public void pureConnUserCannotBindAnotherConnection() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        conns.put("conn-b", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        StubResponse resp = new StubResponse();
        boolean ok = interceptor.preHandle(
                request(BASE + "/cluster/query", "conn-b",
                        delegated(ConsoleRole.VIEWER, "conn:conn-a:search")),
                resp.proxy, new Object());
        assertThat(ok).isFalse();
        assertThat(resp.status).isEqualTo(403);
        assertThat(resp.bodyText()).contains("CONN_FORBIDDEN");
        assertThat(router.currentTarget()).isNull();
    }

    @Test
    public void pureConnUserWithoutHostGrantCannotFallBackToHost() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        StubResponse resp = new StubResponse();
        boolean ok = interceptor.preHandle(
                request(BASE + "/cluster/query", null,
                        delegated(ConsoleRole.VIEWER, "conn:conn-a:search")),
                resp.proxy, new Object());
        assertThat(ok).isFalse();
        assertThat(resp.status).isEqualTo(403);
        assertThat(resp.bodyText()).contains("CONN_FORBIDDEN");
        assertThat(router.currentTarget()).isNull();
    }

    @Test
    public void explicitHostGrantAllowsHostDataPlane() throws Exception {
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        assertThat(interceptor.preHandle(
                request(BASE + "/cluster/query", null,
                        delegated(ConsoleRole.VIEWER, "conn:host:search")),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget()).isNull(); /* host=不绑定远程目标 */
    }

    @Test
    public void taskProgressFollowsSelectedConnection() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        assertThat(interceptor.preHandle(
                request(BASE + "/progress", "conn-a", principal(ConsoleRole.ADMIN)),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget())
                .as("delete/update-by-query 的任务进度必须查发起集群")
                .isEqualTo("conn-a");
    }

    @Test
    public void staticPageGrantKeepsAllMinRoleVisibleConnections() throws Exception {
        conns.put("conn-a", conn("VIEWER"));
        conns.put("conn-b", conn("VIEWER"));
        EsTargetInterceptor interceptor = new EsTargetInterceptor(router, fakeConnStore(conns), true);
        assertThat(interceptor.preHandle(
                request(BASE + "/cluster/query", "conn-b",
                        delegated(ConsoleRole.VIEWER, "overview")),
                new StubResponse().proxy, new Object())).isTrue();
        assertThat(router.currentTarget()).isEqualTo("conn-b");
    }
}
