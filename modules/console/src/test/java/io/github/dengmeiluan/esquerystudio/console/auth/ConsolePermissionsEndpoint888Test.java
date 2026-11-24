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
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 「我的权限面」端点契约：当前身份 × 目标连接的逐页读/写判定 + raw 直连档 + 共享写档。
 *
 * <p>判定序列必须与 {@link ConsoleAuthInterceptor#preHandle} 的门序同源（页面门 → 连接写门 →
 * 角色门），判定原子复用拦截器的静态口径（requiredRole/isReadonlyPost/isAdminUri）与
 * {@link EnvPagesResolver}；对拍用例以同一身份桩直接驱动真拦截器，锁「端点说拒绝 ⇔ 拦截器拒绝」
 * 的两口径等价，防判定漂移。</p>
 */
public class ConsolePermissionsEndpoint888Test {

    /* ---------------- 桩设施（PageAuthTest 同范式：JDK 动态代理，仓内无 mockito） ---------------- */

    private static HttpServletRequest stubRequest(ConsolePrincipal principal, String targetHeader) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                case "getHeader": return "X-Es-Target".equals(args[0]) ? targetHeader : null;
                case "getMethod": return "GET";
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsolePermissionsEndpoint888Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    /** 对拍用响应桩：捕获 status + body。 */
    private static class StubResponse {
        int status = 200;
        final ByteArrayOutputStream body = new ByteArrayOutputStream();
        final HttpServletResponse proxy;

        StubResponse() {
            InvocationHandler h = (p, m, args) -> {
                switch (m.getName()) {
                    case "setStatus": status = (Integer) args[0]; return null;
                    case "getStatus": return status;
                    case "setContentType": case "setCharacterEncoding": return null;
                    case "getOutputStream":
                        return new ServletOutputStream() {
                            @Override public void write(int b) { body.write(b); }
                            @Override public boolean isReady() { return true; }
                            @Override public void setWriteListener(WriteListener l) { }
                        };
                    default: throw new UnsupportedOperationException(m.getName());
                }
            };
            proxy = (HttpServletResponse) Proxy.newProxyInstance(
                    ConsolePermissionsEndpoint888Test.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }

        String bodyText() { return new String(body.toByteArray(), StandardCharsets.UTF_8); }
    }

    /** 对拍用请求桩：method/uri/attribute/target 头。 */
    private static HttpServletRequest stubAuthRequest(ConsolePrincipal principal, String method, String uri, String target) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
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
                case "getHeader": return "X-Es-Target".equals(args[0]) ? target : null;
                case "getRemoteAddr": return "10.1.2.3";
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsolePermissionsEndpoint888Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal delegatedAs(ConsoleRole role, Set<String> grantedPages) {
        return new ConsolePrincipal("host-u1", role, false, true, "宿主用户", null, grantedPages);
    }

    private static ConsolePrincipal builtin(ConsoleRole role) {
        return new ConsolePrincipal("local-u1", role, false);
    }

    /** 连接档案桩：c1=PROD 环境、实名「生产集群」。 */
    private static ConnStore connStoreWithProd() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                Map<String, Object> c = new java.util.LinkedHashMap<>();
                c.put("id", "c1");
                c.put("name", "生产集群");
                c.put("minRole", "VIEWER");
                return Collections.singletonList(c);
            }
            @Override public RemoteClusterConn get(String id) {
                if ("c1".equals(id)) {
                    RemoteClusterConn conn = new RemoteClusterConn();
                    conn.setEnv("PROD");
                    return conn;
                }
                return null;
            }
            @Override public String getName(String id) { return "c1".equals(id) ? "生产集群" : null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static ConsolePermissionsController ctrl() {
        ConnStore store = connStoreWithProd();
        return new ConsolePermissionsController(ConsolePageCatalog.load(),
                new EnvPagesResolver(store, new ESQueryStudioElasticsearchProperties()), store, true);
    }

    private static ConsolePermissionsController ctrlWithProps(ESQueryStudioElasticsearchProperties props) {
        ConnStore store = connStoreWithProd();
        return new ConsolePermissionsController(ConsolePageCatalog.load(),
                new EnvPagesResolver(store, props), store, true);
    }

    private static Map<String, Object> call(ConsolePermissionsController c, ConsolePrincipal p, String target) {
        return c.permissions(stubRequest(p, "host".equals(target) ? null : target), target).getBody();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> pageOf(Map<String, Object> resp, String key) {
        for (Map<String, Object> g : (List<Map<String, Object>>) resp.get("groups")) {
            for (Map<String, Object> pg : (List<Map<String, Object>>) g.get("pages")) {
                if (key.equals(pg.get("key"))) {
                    return pg;
                }
            }
        }
        return null;
    }

    private static Set<String> set(String... items) {
        return new HashSet<>(java.util.Arrays.asList(items));
    }

    /* ---------------- 判定矩阵 ---------------- */

    @Test
    public void 连接模型_只读键_rest可读不可写_raw档关闭() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:rest", "conn:c1:search")), "c1");
        assertEquals(Boolean.TRUE, resp.get("connModel"));
        assertEquals(Boolean.FALSE, resp.get("rawAllowed"));
        assertEquals(Boolean.FALSE, resp.get("sharedWriteAllowed"));
        Map<String, Object> rest = pageOf(resp, "rest");
        assertEquals(Boolean.TRUE, rest.get("read"));
        assertEquals(Boolean.FALSE, rest.get("write"));
        assertEquals("WRITE_DENIED", rest.get("writeDeny"));
    }

    @Test
    public void 连接模型_53页只读授权_全部写拒绝且raw档关闭() {
        Set<String> grants = new HashSet<>();
        for (ConsolePageCatalog.Page p : ConsolePageCatalog.load().getPages()) {
            grants.add("conn:c1:" + p.getKey());
        }
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER, grants), "c1");
        int read = 0;
        int write = 0;
        for (Map<String, Object> g : (List<Map<String, Object>>) resp.get("groups")) {
            for (Map<String, Object> pg : (List<Map<String, Object>>) g.get("pages")) {
                if (Boolean.TRUE.equals(pg.get("read"))) read++;
                if (Boolean.TRUE.equals(pg.get("write"))) write++;
            }
        }
        assertEquals("53 页只读授权：每页 read=true", 53, read);
        assertEquals("无任何 w: 键时不得有任何页 write=true（PROD 只读）", 0, write);
        assertEquals(Boolean.FALSE, resp.get("rawAllowed"));
        assertEquals(Boolean.FALSE, resp.get("devtoolsAllowed"));
        assertEquals(Boolean.FALSE, resp.get("sharedWriteAllowed"));
    }

    @Test
    public void 连接模型_带rest写键_写放行_raw档开启() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:rest", "conn:c1:w:rest")), "c1");
        assertEquals(Boolean.TRUE, resp.get("rawAllowed"));
        assertEquals(Boolean.TRUE, pageOf(resp, "rest").get("write"));
        assertNull(pageOf(resp, "rest").get("writeDeny"));
    }


    @Test
    public void 连接模型_带devtools写键_DevTools可写但REST直连不越权() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:devtools", "conn:c1:w:devtools")), "c1");
        assertEquals(Boolean.FALSE, resp.get("rawAllowed"));
        assertEquals(Boolean.TRUE, resp.get("devtoolsAllowed"));
        Map<String, Object> devtools = pageOf(resp, "devtools");
        assertEquals(Boolean.TRUE, devtools.get("read"));
        assertEquals(Boolean.TRUE, devtools.get("write"));
        assertNull(devtools.get("writeDeny"));
    }

    @Test
    public void 连接模型_带rest写键_REST与DevTools均可用() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:rest", "conn:c1:w:rest")), "c1");
        assertEquals(Boolean.TRUE, resp.get("rawAllowed"));
        assertEquals(Boolean.TRUE, resp.get("devtoolsAllowed"));
    }


    @Test
    public void 连接模型_rest写键也能写DevTools页() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:devtools", "conn:c1:rest", "conn:c1:w:rest")), "c1");
        Map<String, Object> devtools = pageOf(resp, "devtools");
        assertEquals(Boolean.TRUE, devtools.get("read"));
        assertEquals(Boolean.TRUE, devtools.get("write"));
        assertNull(devtools.get("writeDeny"));
    }

    @Test
    public void 连接模型_未授权页_不可读() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:rest")), "c1");
        Map<String, Object> indices = pageOf(resp, "indices");
        assertEquals(Boolean.FALSE, indices.get("read"));
        assertEquals("PAGE_DENIED", indices.get("writeDeny"));
    }

    @Test
    public void 静态模型_页面门不启用_全页可读_写走角色档() {
        Map<String, Object> resp = call(ctrl(), builtin(ConsoleRole.VIEWER), "host");
        assertEquals(Boolean.FALSE, resp.get("connModel"));
        assertEquals(Boolean.FALSE, resp.get("pageGateActive"));
        /* REST/DevTools 的静态页入口对非 ADMIN 是死入口（端点 ADMIN 档）：
           面板不得把 VIEWER 报成可读，否则菜单可见、进去必 403。 */
        assertEquals(Boolean.FALSE, pageOf(resp, "rest").get("read"));
        assertEquals(Boolean.FALSE, pageOf(resp, "devtools").get("read"));
        // rest 页唯一端点 /cluster/raw 是 ADMIN 档 → VIEWER 不可写
        assertEquals(Boolean.FALSE, pageOf(resp, "rest").get("write"));
        assertEquals(Boolean.FALSE, resp.get("rawAllowed"));
    }

    @Test
    public void 静态模型_ADMIN_raw档开启() {
        Map<String, Object> resp = call(ctrl(), builtin(ConsoleRole.ADMIN), "host");
        assertEquals(Boolean.TRUE, resp.get("rawAllowed"));
        assertEquals(Boolean.TRUE, pageOf(resp, "rest").get("write"));
    }

    @Test
    public void env模板收缩_静态键页集未入模板页不可读() {
        // env 模板收缩只作用于纯静态键授权（conn 键授权=宿主按连接明示，与 env 模板双轨不收缩——
        // EnvPagesResolver.effectivePages 同口径），故本用例用静态键形态。
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        props.setEnvPages(Collections.singletonMap("PROD", new HashSet<>(Collections.singletonList("overview"))));
        Map<String, Object> resp = call(ctrlWithProps(props), delegatedAs(ConsoleRole.VIEWER,
                set("rest", "overview")), "c1");
        assertEquals(Boolean.FALSE, resp.get("connModel"));
        assertEquals(Boolean.TRUE, resp.get("envPagesApplied"));
        // rest 静态读键在手但被 PROD 模板收缩 → 不可读
        assertEquals(Boolean.FALSE, pageOf(resp, "rest").get("read"));
        assertEquals(Boolean.TRUE, pageOf(resp, "overview").get("read"));
    }

    @Test
    public void host目标_连接维度档位关闭() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:w:rest")), "host");
        assertEquals("host", resp.get("target"));
        assertNull(resp.get("connName"));
        assertEquals(Boolean.FALSE, resp.get("sharedWriteAllowed"));
    }

    @Test
    public void 权限面写档_GET_only页不误报_真实写端点页按角色() {        Map<String, Object> admin = call(ctrl(), builtin(ConsoleRole.ADMIN), "host");
        /* overview 只有 GET/只读 POST——不得披露 write；diag 通过共享映射拥有结构化 reroute 写端点 */
        assertNull(pageOf(admin, "overview").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "diag").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "indices").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "security").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "rest").get("write"));
        /* 仅靠共享写映射拥有写能力的页面必须可被授权（w: 键下发入口） */
        assertEquals(Boolean.TRUE, pageOf(admin, "tasks").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "ilm").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "index-settings").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "optimizer").get("write"));
        assertEquals(Boolean.TRUE, pageOf(admin, "devtools").get("write"));

        Map<String, Object> operator = call(ctrl(), builtin(ConsoleRole.OPERATOR), "host");
        assertNull(pageOf(operator, "overview").get("write"));
        /* 静态模型按端点逐条裁决：indices 页的文档编辑/热更（OPERATOR 档）可用，
           只有 rebuild/force-merge 等 rank3 端点被角色门挡住——面板必须报「可写（部分受限）」，
           不能用最高危端点一票否决（否则 OPERATOR 会以为自己完全不能写）。 */
        assertEquals(Boolean.TRUE, pageOf(operator, "indices").get("write"));
        assertTrue(String.valueOf(pageOf(operator, "indices").get("writeDeny")).startsWith("PARTIAL_ROLE:"));
        assertEquals(Boolean.FALSE, pageOf(operator, "rest").get("write"));
        assertEquals(Boolean.FALSE, pageOf(operator, "cluster-settings").get("write"));
        assertEquals(Boolean.TRUE, pageOf(operator, "config-validator").get("write"));
        assertTrue(String.valueOf(pageOf(operator, "config-validator").get("writeDeny")).startsWith("PARTIAL_ROLE:"));
    }

    @Test
    public void 共享写档_按归属页写键_无共享端点页不越权() {
        assertEquals(Boolean.FALSE, call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:overview", "conn:c1:w:overview")), "c1").get("sharedWriteAllowed"));
        assertEquals(Boolean.TRUE, call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:search", "conn:c1:w:search")), "c1").get("sharedWriteAllowed"));
        /* 内置/静态角色模型同样如实反映：OPERATOR 可做文档类共享写 */
        assertEquals(Boolean.TRUE, call(ctrl(), builtin(ConsoleRole.OPERATOR), "host").get("sharedWriteAllowed"));
        assertEquals(Boolean.TRUE, call(ctrl(), delegatedAs(ConsoleRole.OPERATOR,
                set("search")), "host").get("sharedWriteAllowed"));
        assertEquals(Boolean.FALSE, call(ctrl(), delegatedAs(ConsoleRole.OPERATOR,
                set("overview")), "host").get("sharedWriteAllowed"));
    }

    @Test
    public void 权限面板不泄露未授权连接名与环境() {
        Map<String, Object> other = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:overview", "conn:c1:w:overview")), "c2");
        assertNull(other.get("connName"));
        assertNull(other.get("env"));
        assertEquals(Boolean.FALSE, other.get("envPagesApplied"));
        Map<String, Object> own = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:overview", "conn:c1:w:overview")), "c1");
        assertEquals("生产集群", own.get("connName"));
        assertEquals("PROD", own.get("env"));
        /* 空集=全拒：零页面授权也不得借非 conn 模型枚举连接 */
        Map<String, Object> zero = call(ctrl(), delegatedAs(ConsoleRole.VIEWER,
                set()), "c1");
        assertNull(zero.get("connName"));
        assertNull(zero.get("env"));
    }

    @Test
    public void 超管全局权限面_无页面写键也读写全开() {
        Map<String, Object> resp = call(ctrl(), delegatedAs(ConsoleRole.ADMIN,
                set("conn:c1:rest")), "c1");
        assertEquals(Boolean.TRUE, resp.get("rawAllowed"));
        assertEquals(Boolean.TRUE, resp.get("devtoolsAllowed"));
        assertEquals(Boolean.TRUE, resp.get("sharedWriteAllowed"));
        assertEquals(Boolean.TRUE, pageOf(resp, "indices").get("read"));
        assertEquals(Boolean.TRUE, pageOf(resp, "indices").get("write"));
        assertEquals(Boolean.TRUE, pageOf(resp, "security").get("read"));
    }

    @Test
    public void env模板_静态页与conn页同为环境封顶() {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        props.setEnvPages(Collections.singletonMap("PROD", new HashSet<>(Collections.singletonList("overview"))));
        Map<String, Object> resp = call(ctrlWithProps(props), delegatedAs(ConsoleRole.VIEWER,
                set("conn:c1:search", "conn:c1:w:search", "rest", "overview")), "c1");
        assertEquals(Boolean.FALSE, pageOf(resp, "rest").get("read"));
        assertEquals(Boolean.TRUE, pageOf(resp, "overview").get("read"));
        /* 环境模板是硬封顶：conn 读/写键同样不得把 prod 未开放的 search 页并回。 */
        assertEquals(Boolean.FALSE, pageOf(resp, "search").get("read"));
    }

    /* ---------------- 对拍锁：端点判定 ⇔ 真拦截器 preHandle 同裁 ---------------- */

    @Test
    public void 对拍锁_rest只读身份进得去但写档不报可用() throws Exception {
        /* 1133：面板的写档与拦截器的写档必须仍同裁（都 false）；
           但拦截器不再整段拒绝——只读身份进入端点并打只读标记，内层写由执行端拒绝。 */
        ConsolePrincipal p = delegatedAs(ConsoleRole.VIEWER, set("conn:c1:rest", "conn:c1:search"));
        Map<String, Object> resp = call(ctrl(), p, "c1");
        assertEquals("写档仍不可用", Boolean.FALSE, resp.get("rawAllowed"));
        assertEquals("读档应可用（本轮修复的正面语义）", Boolean.TRUE, resp.get("rawReadAllowed"));

        // 同一身份桩驱动真拦截器：POST /cluster/raw 进入并打只读标记（写不会被执行端放行）
        ConsoleAuthInterceptor it = interceptor(p);
        StubResponse sr = new StubResponse();
        javax.servlet.http.HttpServletRequest req =
                stubAuthRequest(p, "POST", "/internal/es/index/cluster/raw", "c1");
        boolean pass = it.preHandle(req, sr.proxy, new Object());
        assertTrue("只读身份可进入执行端点（内层读写由执行端分档）", pass);
        assertEquals("必须打只读标记", Boolean.TRUE,
                req.getAttribute(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
    }

    @Test
    public void 对拍锁_无任何rest键时拦截器仍拒并落WRITE_DENIED() throws Exception {
        ConsolePrincipal p = delegatedAs(ConsoleRole.VIEWER, set("conn:c1:search"));
        Map<String, Object> resp = call(ctrl(), p, "c1");
        assertEquals(Boolean.FALSE, resp.get("rawAllowed"));
        assertEquals(Boolean.FALSE, resp.get("rawReadAllowed"));

        ConsoleAuthInterceptor it = interceptor(p);
        StubResponse sr = new StubResponse();
        boolean pass = it.preHandle(stubAuthRequest(p, "POST", "/internal/es/index/cluster/raw", "c1"),
                sr.proxy, new Object());
        assertFalse("无 rest 读写键必须拒绝", pass);
        /* 拒绝码取决于被哪道门先拦：rest 页不可见时是 PAGE_DENIED，可见但无 w: 键时是 WRITE_DENIED。
           两者都必须是阻断，不能出现「放行但不带标记」这种漏放。 */
        String body = sr.bodyText();
        /* 三道门都可能先拦（rest 页不可见=FORBIDDEN、env 排除=ENV_PAGE_DENIED、无写键=WRITE_DENIED）：
           断言的是「一定被拦且带错误码」，不锁定具体是哪道门先命中。 */
        assertTrue("拒绝必须带明确错误码: " + body, body.contains("\"code\":"));
        assertNull("未放行就不得打只读标记",
                stubAuthRequest(p, "POST", "/internal/es/index/cluster/raw", "c1")
                        .getAttribute(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
    }

    /* ---------------- 拦截器桩装配（PageAuthTest 同构） ---------------- */

    private static class CapturingAudit implements ConsoleOpsAuditStore {
        @Override public void record(ConsoleOpsAuditEvent event) { }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    private static ConsoleAuthInterceptor interceptor(ConsolePrincipal principal) {
        EsConsoleAuthorizer authorizer = req -> principal;
        io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver resolver =
                new io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver(null, null, null, null, null, "auto") {
                    @Override public boolean bound() { return true; }
                };
        return new ConsoleAuthInterceptor(authorizer, new CapturingAudit(), resolver, ConsolePageCatalog.load(),
                true, new EnvPagesResolver(connStoreWithProd(), new ESQueryStudioElasticsearchProperties()), connStoreWithProd());
    }
}
