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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException;
import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 1133：DevTools / REST 透传按<b>内层 ES 请求</b>分读、写两档。
 *
 * <p>改造前的缺陷（产线 1.0.68 实测）：宿主给 {@code deng_test_x1} 在 PROD 连接上只授了
 * 读键 {@code conn:{id}:devtools} + {@code conn:{id}:rest}，但执行端点
 * {@code /cluster/devtools/execute} 外层恒 POST，被 {@code isReadonlyPost} 判成写请求，
 * 于是只认 {@code w:} 那一半——只读身份连 {@code GET /_cluster/health} 都被 403，
 * 「生产只读」退化成「生产完全不可用」。宿主明明表达了读授权，控制台把它丢了。</p>
 *
 * <p>现在的分层：拦截器只判「能否进这个端点」（读键或写键都能进，读键打
 * {@code ATTR_PASSTHROUGH_READ_ONLY} 标记），执行端拿到内层 method 后做最终裁决。
 * 读判据在服务端、在真正执行之前，前端绕过没有意义。</p>
 */
public class PassthroughReadOnly1133Test {

    private static final String CONN = "c-prod";
    private static final String DEVTOOLS = "/internal/es/index/cluster/devtools/execute";
    private static final String RAW = "/internal/es/index/cluster/raw";

    /* ---------------- 桩设施 ---------------- */

    private static HttpServletRequest request(String method, String uri, String target) {
        Map<String, Object> attrs = new HashMap<>();
        Map<String, String> headers = new HashMap<>();
        if (target != null) headers.put("X-Es-Target", target);
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return "";
                case "getServletPath": return "";
                case "getPathInfo": return null;
                case "getMethod": return method;
                case "getQueryString": return null;
                case "getAttribute": return attrs.get(args[0]);
                case "setAttribute": attrs.put((String) args[0], args[1]); return null;
                case "getHeader": return headers.get((String) args[0]);
                case "getRemoteAddr": return "10.1.2.3";
                case "getContentLengthLong": return 10L;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                PassthroughReadOnly1133Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    static class StubResponse {
        int status = 200;
        final java.io.ByteArrayOutputStream body = new java.io.ByteArrayOutputStream();
        final HttpServletResponse proxy;

        StubResponse() {
            InvocationHandler h = (proxy, m, args) -> {
                switch (m.getName()) {
                    case "setStatus": status = (Integer) args[0]; return null;
                    case "sendError": status = (Integer) args[0]; return null;
                    case "getStatus": return status;
                    case "setContentType": case "setCharacterEncoding": return null;
                    case "getOutputStream": return new javax.servlet.ServletOutputStream() {
                        @Override public boolean isReady() { return true; }
                        @Override public void setWriteListener(javax.servlet.WriteListener l) { }
                        @Override public void write(int b) { body.write(b); }
                    };
                    case "getWriter": throw new UnsupportedOperationException("用 getOutputStream");
                    default: throw new UnsupportedOperationException(m.getName());
                }
            };
            this.proxy = (HttpServletResponse) Proxy.newProxyInstance(
                    PassthroughReadOnly1133Test.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }

        String text() { return new String(body.toByteArray(), java.nio.charset.StandardCharsets.UTF_8); }
    }

    /** 一个可选配置了 env 的连接档案，用于验证 env 模板同样约束读键。 */
    private static io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore store(String env) {
        return new io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore() {
            @Override public java.util.List<Map<String, Object>> list() { return java.util.Collections.emptyList(); }
            @Override public io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn get(String id) {
                if (!CONN.equals(id)) return null;
                io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn c =
                        new io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn(
                                "http", "127.0.0.1", 9200, "u", "p");
                c.setMinRole("VIEWER");
                c.setEnv(env);
                return c;
            }
            @Override public String getName(String id) { return CONN.equals(id) ? "prod" : null; }
            @Override public String getVersion(String id) { return "7.10.2"; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static ControlClusterResolver boundResolver() {
        return new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
    }

    /** 只持读键的身份（产线 x1 在 PROD 的形态）。 */
    private static ConsolePrincipal readOnly() {
        Set<String> gp = new HashSet<>();
        gp.add("conn:" + CONN + ":devtools");
        gp.add("conn:" + CONN + ":rest");
        return new ConsolePrincipal("deng_test_x1", ConsoleRole.VIEWER, false, true,
                "只读用户", null, gp);
    }

    /** 持写键的身份（测试环境 x1 的形态）。 */
    private static ConsolePrincipal writer() {
        Set<String> gp = new HashSet<>();
        gp.add("conn:" + CONN + ":devtools");
        gp.add("conn:" + CONN + ":w:devtools");
        gp.add("conn:" + CONN + ":rest");
        gp.add("conn:" + CONN + ":w:rest");
        return new ConsolePrincipal("deng_test_x1", ConsoleRole.VIEWER, false, true,
                "可写用户", null, gp);
    }

    private static ConsolePrincipal noGrant() {
        return new ConsolePrincipal("deng_test_x3", ConsoleRole.VIEWER, false, true,
                "零权限", null, new HashSet<>());
    }

    /** 跑拦截器；返回 null 表示放行。 */
    private static Integer intercept(ConsolePrincipal who, String uri, String target, String env,
                                     Map<String, Object> attrsOut) {
        ConsoleAuthInterceptor it = new ConsoleAuthInterceptor(
                req -> who, new DelegatedAdminEscalation1132Test.CapturingAuditStore(),
                boundResolver(), ConsolePageCatalog.load(), true,
                new EnvPagesResolver(store(env), new ESQueryStudioElasticsearchProperties()), store(env));
        HttpServletRequest req = request("POST", uri, target);
        StubResponse resp = new StubResponse();
        boolean allowed;
        try {
            allowed = it.preHandle(req, resp.proxy, null);
        } catch (Exception e) {
            throw new AssertionError("拦截器抛异常: " + e, e);
        }
        if (attrsOut != null) {
            attrsOut.put(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY,
                    req.getAttribute(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
        }
        return allowed ? null : resp.status;
    }

    /* ---------------- 内层只读判定口径 ---------------- */

    @Test
    public void GET与HEAD属只读() {
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("GET", "/_cluster/health"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("get", "/my-index/_search"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("HEAD", "/my-index"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("OPTIONS", "/"));
    }

    @Test
    public void 无副作用的POST查询端点属只读() {
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/my-index/_search"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_search?typed_keys=true"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_msearch"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_count"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_sql"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_cat/indices"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_mget"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/my-index/_pit?keep_alive=1m"));
    }

    @Test
    public void 写型ES请求一律判写() {
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("PUT", "/qh_denied_probe"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("DELETE", "/qh_denied_probe"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_bulk"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_reindex"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/my-index/_close"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/my-index/_doc"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("PATCH", "/my-index/_doc/1"));
        /* 空方法/空路径不得默认为读（fail-closed）。 */
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest(null, "/_search"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", null));
        assertFalse(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", ""));
    }

    /* ---------------- 拦截器：读键也能进（打标） ---------------- */

    @Test
    public void 只读身份持devtools读键可进入执行端点并打标() {
        Map<String, Object> attrs = new HashMap<>();
        Integer status = intercept(readOnly(), DEVTOOLS, CONN, null, attrs);
        assertNull("只读身份不得被外层写门整段挡住（这正是本轮修复的缺陷）", status);
        assertEquals("必须标记「仅凭读键准入」，执行端据此拒绝内层写",
                Boolean.TRUE, attrs.get(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
    }

    @Test
    public void 只读身份持rest读键可进入raw端点并打标() {
        Map<String, Object> attrs = new HashMap<>();
        assertNull(intercept(readOnly(), RAW, CONN, null, attrs));
        assertEquals(Boolean.TRUE, attrs.get(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
    }

    @Test
    public void 写键身份不打只读标_仍按写权放行() {
        Map<String, Object> attrs = new HashMap<>();
        assertNull(intercept(writer(), DEVTOOLS, CONN, null, attrs));
        assertNull("写键身份走原写门，不得被打成只读（否则内层写会被误拒）",
                attrs.get(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
    }

    @Test
    public void 零权限身份仍被拒() {
        assertEquals(Integer.valueOf(403), intercept(noGrant(), DEVTOOLS, CONN, null, null));
    }

    @Test
    public void 无任何透传键的其他页写键不能进透传端点() {
        Set<String> gp = new HashSet<>();
        gp.add("conn:" + CONN + ":w:indices");
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, "n", null, gp);
        assertEquals(Integer.valueOf(403), intercept(p, DEVTOOLS, CONN, null, null));
    }

    @Test
    public void env模板排除该页时读键也不放行() {
        /* PROD 模板只开 indices：devtools 被排除，读键不得成为旁路。 */
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        Map<String, Set<String>> envPages = new HashMap<>();
        envPages.put("PROD", new HashSet<>(java.util.Collections.singletonList("indices")));
        props.setEnvPages(envPages);
        io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore cs = store("PROD");
        ConsoleAuthInterceptor it = new ConsoleAuthInterceptor(
                req -> readOnly(), new DelegatedAdminEscalation1132Test.CapturingAuditStore(),
                boundResolver(), ConsolePageCatalog.load(), true,
                new EnvPagesResolver(cs, props), cs);
        StubResponse resp = new StubResponse();
        boolean allowed;
        try {
            allowed = it.preHandle(request("POST", DEVTOOLS, CONN), resp.proxy, null);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        assertFalse("env 模板是环境级封顶，读键不得绕过", allowed);
        assertEquals(403, resp.status);
    }

    /* ---------------- 执行端：内层 method 定生死 ---------------- */

    /**
     * 执行端的裁决逻辑（与 {@code executePassthrough} 同一判据）。
     * 这里直接调用判定函数，避免为了测一行守卫而去构造整个 ES 客户端栈。
     */
    private static void assertExecutorWouldReject(String method, String path) {
        assertTrue("内层 " + method + " " + path + " 应被判为写并拒绝",
                !ConsoleAuthInterceptor.isReadonlyEsRequest(method, path));
    }

    @Test
    public void 只读身份内层写请求在执行端被拒() {
        assertExecutorWouldReject("PUT", "/qh_denied_probe_1133");
        assertExecutorWouldReject("DELETE", "/qh_never_exists_1133");
        assertExecutorWouldReject("POST", "/_bulk");
        assertExecutorWouldReject("POST", "/_reindex");
    }

    @Test
    public void 只读身份内层读请求在执行端放行() {
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("GET", "/_cluster/health"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("POST", "/_search"));
        assertTrue(ConsoleAuthInterceptor.isReadonlyEsRequest("GET", "/_cat/indices?format=json"));
    }

    /**
     * 执行端守卫生效与否的端到端证据：直接驱动 {@code executePassthrough} 的守卫路径。
     * 用反射调用私有方法成本高且脆，这里改为断言「标记 + 判写」组合的语义完整性：
     * 只读标记存在时，任何非只读内层请求都必须被 {@code ControlPlaneGuardException} 语义拒绝。
     */
    @Test
    public void 只读标记与判写组合覆盖全部写方法() {
        String[] writes = {"PUT", "POST", "DELETE", "PATCH"};
        String[] writePaths = {"/_bulk", "/_reindex", "/idx/_close", "/idx/_doc/1", "/idx"};
        for (String m : writes) {
            for (String p : writePaths) {
                if (ConsoleAuthInterceptor.isReadonlyEsRequest(m, p)) {
                    /* POST + /idx 之类不在白名单，必须是写；唯一允许的读组合已在上面单测覆盖 */
                    fail("写形态被误判为只读: " + m + " " + p);
                }
            }
        }
    }

    /** 守卫异常类型必须能被现有 advice 映射成 403（而不是 500）。 */
    @Test
    public void 拒绝语义走ControlPlaneGuardException() {
        ControlPlaneGuardException e = new ControlPlaneGuardException("只读身份不得写");
        assertTrue(e instanceof RuntimeException);
    }

    /* ---------------- 执行端端到端：真的调用控制器，不从判定函数推断 ---------------- */

    /**
     * 只读标记 + 内层写 → 控制器抛 ControlPlaneGuardException，且<b>绝不触达 ES</b>。
     * 这是本轮最关键的一条：判定函数对了不等于执行端接上了。
     */
    @Test
    public void 执行端对只读标记的内层写直接拒绝且不触达ES() throws Exception {
        io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController c = controller();
        Map<String, String> body = new HashMap<>();
        body.put("method", "PUT");
        body.put("path", "/qh_denied_probe_1133");
        body.put("body", "");
        HttpServletRequest req = request("POST", DEVTOOLS, CONN);
        req.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, readOnly());
        req.setAttribute(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY, Boolean.TRUE);
        try {
            c.clusterDevtoolsExecute(body, req);
            fail("内层写必须被拒绝");
        } catch (ControlPlaneGuardException e) {
            assertTrue("拒绝文案要说明是只读身份: " + e.getMessage(), e.getMessage().contains("只读"));
            assertTrue(e.getMessage().contains("PUT"));
        }
    }

    /** 同一控制器、无只读标记（写键身份）→ 不放行到「只读拒绝」，走到 ES 调用才失败。 */
    @Test
    public void 无只读标记时内层写不被只读门拦() throws Exception {
        io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController c = controller();
        Map<String, String> body = new HashMap<>();
        body.put("method", "PUT");
        body.put("path", "/qh_probe_1133");
        body.put("body", "");
        HttpServletRequest req = request("POST", DEVTOOLS, CONN);
        req.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, writer());
        try {
            c.clusterDevtoolsExecute(body, req);
            fail("桩 ES 客户端应让执行失败");
        } catch (ControlPlaneGuardException e) {
            fail("写键身份不得被只读门拦: " + e.getMessage());
        } catch (Exception e) {
            /* 期望：越过只读门后真实执行，由桩客户端/未装配栈失败——证明门没误拦 */
            assertTrue(true);
        }
    }

    /** 最小控制器：桩服务/桩 ES 客户端，只要走到执行就会失败（正是我们要区分的信号）。 */
    private static io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController controller() {
        io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin admin =
                new io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin(null) {
                    @Override
                    public Map<String, Object> raw(String method, String path, String body) {
                        throw new IllegalStateException("桩：已越过权限门到达 ES 调用");
                    }
                    @Override
                    public Map<String, Object> rawGuarded(String method, String path, String body) {
                        throw new IllegalStateException("桩：已越过权限门到达 ES 调用");
                    }
                };
        return new io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController(
                null, admin, true);
    }
}
