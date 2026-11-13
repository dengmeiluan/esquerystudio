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

import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.junit.Test;

import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 2.5.0 菜单 SPI 页面门：delegated + 宿主下发 grantedPages 时，页面专属端点必须在白名单内。
 * 矩阵钉死三态语义（null=不启用 / 空集=全拒 / 非空=白名单）、共享端点豁免、逃生阀、
 * 页面门先于角色门、context-path 剥离。
 */
public class ConsoleAuthInterceptorPageAuthTest {

    /* ---------------- 桩设施（JDK 动态代理，仓内无 mockito/spring-test） ---------------- */

    /**
     * 只实现拦截器用到的方法：URI/contextPath/servletPath/method/queryString + attribute 存取。
     * default 分支抛 UnsupportedOperationException：拦截器新增任何读取都必须在这里显式登记，
     * 让「实现读了桩没覆盖的方法」以测试红显性化，而非静默拿到默认值。
     */
    private static HttpServletRequest stubRequest(String method, String uri, String contextPath) {
        // 默认 servletPath=""/pathInfo=null（/* 空前缀映射语义），既有用例零改动
        return stubRequest(method, uri, contextPath, "", null);
    }

    /** 带请求头的桩（委托令牌/目标头）——LOGIN 审计事件用例专用。 */
    private static HttpServletRequest stubRequest(String method, String uri, Map<String, String> headers) {
        Map<String, Object> attrs = new HashMap<>();
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
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthInterceptorPageAuthTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    /**
     * servletPath/pathInfo 可按用例配置：Tomcat 默认映射（/）下 servletPath=完整请求路径且 pathInfo=null；
     * 前缀映射（spring.mvc.servlet.path=/api → /api/*）下 servletPath=/api、pathInfo=前缀之后剩余路径。
     */
    private static HttpServletRequest stubRequest(String method, String uri, String contextPath,
                                                  String servletPath, String pathInfo) {
        Map<String, Object> attrs = new HashMap<>();
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return contextPath;
                case "getServletPath": return servletPath;
                case "getPathInfo": return pathInfo;
                case "getMethod": return method;
                case "getQueryString": return null;
                case "getAttribute": return attrs.get(args[0]);
                case "setAttribute": attrs.put((String) args[0], args[1]); return null;
                case "getHeader": return null;
                case "getRemoteAddr": return "10.1.2.3";
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthInterceptorPageAuthTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    /** 捕获 status + body 的响应桩。 */
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
                    ConsoleAuthInterceptorPageAuthTest.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }

        String bodyText() { return new String(body.toByteArray(), StandardCharsets.UTF_8); }
    }

    /** 审计捕获桩（：唯一写入口=富事件）。 */
    private static class CapturingAudit implements ConsoleOpsAuditStore {
        String action; int httpStatus; String uri; ConsoleOpsAuditEvent last;
        @Override public void record(ConsoleOpsAuditEvent event) {
            this.uri = event.getUri(); this.action = event.getAction(); this.httpStatus = event.getHttpStatus();
            this.last = event;
        }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    private static ConsolePrincipal delegated(Set<String> grantedPages) {
        /* 页面门语义测试用 VIEWER：ADMIN 是全局超管、会整体豁免页面门（见超管放行用例）。 */
        return new ConsolePrincipal("host-u1", ConsoleRole.VIEWER, false, true, "宿主用户", null, grantedPages);
    }

    /** 可指定角色的委托身份（超管域优先裁决用例——conn 模型用户恒非 ADMIN）。 */
    private static ConsolePrincipal delegatedAs(ConsoleRole role, Set<String> grantedPages) {
        return new ConsolePrincipal("host-u1", role, false, true, "宿主用户", null, grantedPages);
    }

    private static ConsoleAuthInterceptor interceptor(ConsolePrincipal principal, boolean pageAuthEnabled,
                                                      CapturingAudit audit) {
        EsConsoleAuthorizer authorizer = req -> principal;
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore stubStore = new ConnStore() {
            @Override public java.util.List<java.util.Map<String, Object>> list() { return java.util.Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public java.util.Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) { throw new UnsupportedOperationException(); }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        EnvPagesResolver envPagesResolver = new EnvPagesResolver(stubStore, new ESQueryStudioElasticsearchProperties());
        return new ConsoleAuthInterceptor(authorizer, audit, resolver, ConsolePageCatalog.load(), pageAuthEnabled,
                envPagesResolver, stubStore);
    }

    /** 同 interceptor，但连接档案里存在 c1（minRole=VIEWER）：残留目标头可见性闸的红绿判据用。 */
    private static ConsoleAuthInterceptor interceptorWithConn(ConsolePrincipal principal, CapturingAudit audit) {
        EsConsoleAuthorizer authorizer = req -> principal;
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore stubStore = new ConnStore() {
            @Override public java.util.List<java.util.Map<String, Object>> list() { return java.util.Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) {
                if ("c1".equals(id)) {
                    RemoteClusterConn conn = new RemoteClusterConn();
                    conn.setMinRole("VIEWER");
                    return conn;
                }
                return null;
            }
            @Override public String getName(String id) { return "c1"; }
            @Override public String getVersion(String id) { return null; }
            @Override public java.util.Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) { throw new UnsupportedOperationException(); }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        EnvPagesResolver envPagesResolver = new EnvPagesResolver(stubStore, new ESQueryStudioElasticsearchProperties());
        return new ConsoleAuthInterceptor(authorizer, audit, resolver, ConsolePageCatalog.load(), true,
                envPagesResolver, stubStore);
    }

    /* ---------------- 拦截矩阵 ---------------- */

    @Test
    public void 内置身份_grantedPages为null_页面端点放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("admin", ConsoleRole.ADMIN, true, false), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 委托身份_宿主未下发null_放行_向后兼容() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(null), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 委托身份_白名单含目标页_放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(new HashSet<>(Arrays.asList("overview", "search"))), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 委托身份_白名单不含目标页_403带page且审计PAGE_DENIED() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("search")), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"overview\""));
        // preHandle 返回 false 后 afterCompletion 不回调，拒绝事件必须在页面门内显式落审计
        assertEquals("PAGE_DENIED", audit.action);
        assertEquals(403, audit.httpStatus);
        assertEquals("/internal/es/index/overview", audit.uri);
    }

    @Test
    public void 委托身份_空集_页面端点全拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.<String>emptySet()), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void 委托身份_空集_共享端点放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.<String>emptySet()), true, audit);
        // /cluster/health 是全局引导共享端点（pageOf=null），不吃页面级
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/health", ""), new StubResponse().proxy, null));
        // /auth/me 共享（角色档 VIEWER 兜底）
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/auth/me", ""), new StubResponse().proxy, null));
        // 基础健康探针：空页集也放行（观测自愈通道，产线实报误伤面）
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/health", ""), new StubResponse().proxy, null));
        // 连接目录（GET /clusters 精确形态）：纯连接授权用户（宿主维度无键）的自救通道——
        // 拒它=拿不到可切换目标列表，前端 autoPickConnTarget 无法落位，形成空屏死锁
        // （产线实报：454 个连接授权键在手，宿主维度全 403+菜单全隐）。列表已按 minRole 过滤。
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/clusters", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 委托身份_空集_改密与退出仍可自助() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.<String>emptySet()), true, audit);
        /* 自助端点不受页面白名单约束：否则零页面授权用户连自己的会话都管不了 */
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/auth/change-password", ""),
                new StubResponse().proxy, null));
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/auth/logout", ""),
                new StubResponse().proxy, null));
    }

    @Test
    public void 纯连接授权_概览聚合读_授权随目标连接() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // /overview 执行恒在宿主，但它是概览页随目标消费的读端点（与 /keys 同类）：
        // 授权必须按目标头取 conn:{id}:{page} 键——恒按 host 裁决会让纯连接授权用户
        // 落空页集被页面门 403（产线实报：概览接口 403 而同页 monitor-history 200）
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("conn:c1:overview")), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void 纯连接授权_概览聚合读_无目标头按宿主裁决仍拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("conn:c1:overview")), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/overview",
                java.util.Collections.<String, String>emptyMap()), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void insight护栏动作_未登记actionId写请求授权层拒绝() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                new HashSet<>(Arrays.asList("overview"))), true, audit);
        // 空注册表 = 任何 actionId 都未登记：静态模型 + OPERATOR 旧代码会落兜底角色门放行
        //（执行器 400 兜底）；fail-closed 后授权层直接拒，动态 actionId 不再借角色档回落
        it.setGuardedActionRegistry(new io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionRegistry(
                Collections.emptyList()));
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/insight/actions/unknown-action/execute",
                java.util.Collections.<String, String>emptyMap()), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("未知的护栏动作"));
    }

    @Test
    public void 自救通道_残留跨账号目标头不死于连接可见性() throws Exception {
        // 产线实报：换号后 localStorage 残留上一账号的 esquerystudio.target，/auth/me 与 /clusters
        // 带着它发出——零页集身份对该连接不可见 → 连身份探测都 403（「身份未确认」全量菜单假态）
        // + 连接目录加载失败，要等兜底重置目标才自愈。自助通道不得死于连接可见性：
        // 目录本身按可见性过滤行级，身份探测与目标无关，数据面另有 EsTargetInterceptor 独立闸。
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptorWithConn(delegated(Collections.<String>emptySet()), audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/auth/me",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/clusters",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void 非自助端点_残留目标头连接不可见仍拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptorWithConn(delegated(Collections.<String>emptySet()), audit);
        StubResponse resp = new StubResponse();
        // /cluster/inspect 不在自助清单：连接可见性闸必须保留（零页集身份带 c1 目标 = 必拒）
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/inspect",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        // 角色达 minRole 而页面授权缺失：文案必须指向「未授权给当前身份」而非误导升角色
        assertTrue(resp.bodyText().contains("未授权给当前身份"));
    }

    @Test
    public void 用户管理按security页读写键_无键PAGE_DENIED() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // security 读键可看用户列表（本地账号库恒定宿主，按 host 连接键裁决）
        ConsoleAuthInterceptor viewer = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:host:security", "conn:c1:overview"))), true, audit);
        assertTrue(viewer.preHandle(stubRequest("GET", "/internal/es/index/auth/users",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        // 无 security 键：页面不可见 → PAGE_DENIED
        StubResponse denied = new StubResponse();
        ConsoleAuthInterceptor noKey = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Collections.singletonList("conn:c1:overview"))), true, audit);
        assertFalse(noKey.preHandle(stubRequest("GET", "/internal/es/index/auth/users",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), denied.proxy, null));
        assertEquals(403, denied.status);
        assertTrue("body=" + denied.bodyText(), denied.bodyText().contains("\"page\":\"security\""));

        // 委托 ADMIN 无任何页面键也可看（超管全局）
        ConsoleAuthInterceptor admin = interceptor(delegatedAs(ConsoleRole.ADMIN,
                new HashSet<>(Collections.singletonList("conn:c1:rest"))), true, audit);
        assertTrue(admin.preHandle(stubRequest("GET", "/internal/es/index/auth/users",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        /* ops-audit 归 security 页且保留 rank3 硬门：
           - VIEWER + security 读键 → 403（全量审计是 rank3 专项）
           - rank3 无 security 页 → 403（页面门）
           - rank3 + security 读键 → 放行 */
        StubResponse viewerAudit = new StubResponse();
        assertFalse("VIEWER 不得读全量审计", viewer.preHandle(stubRequest("GET",
                "/internal/es/index/auth/ops-audit",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), viewerAudit.proxy, null));
        assertEquals(403, viewerAudit.status);
        assertTrue(viewerAudit.bodyText().contains("\"required\":\"REBUILD_OP\""));
        ConsoleAuthInterceptor rank3NoSecurity = interceptor(delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Collections.singletonList("conn:c1:overview"))), true, audit);
        StubResponse respAudit = new StubResponse();
        assertFalse("无 security 页的 rank3 不得读全量审计", rank3NoSecurity.preHandle(stubRequest("GET",
                "/internal/es/index/auth/ops-audit",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), respAudit.proxy, null));
        assertEquals(403, respAudit.status);
        assertTrue(respAudit.bodyText().contains("\"page\":\"security\""));
        ConsoleAuthInterceptor auditor = interceptor(delegatedAs(ConsoleRole.AUDIT_OP,
                new HashSet<>(Collections.singletonList("conn:c1:security"))), true, audit);
        assertTrue("rank3 + security 读键可读全量审计", auditor.preHandle(stubRequest("GET",
                "/internal/es/index/auth/ops-audit",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        /* host-scope 审计：顶栏目标为 c1 时，conn:host:security 仍应能打开宿主审计入口
           （行级过滤只给 host 事件，不会看到 c1 流水）。 */
        ConsoleAuthInterceptor hostAuditor = interceptor(delegatedAs(ConsoleRole.AUDIT_OP,
                new HashSet<>(Collections.singletonList("conn:host:security"))), true, audit);
        assertTrue("host security 键在连接目标下仍可读宿主审计", hostAuditor.preHandle(stubRequest("GET",
                "/internal/es/index/auth/ops-audit",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }


    @Test
    public void 护栏动作按归属页写键裁决且未登记动作拒绝() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor writer = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:index-settings", "conn:c1:w:index-settings"))), true, audit);
        assertTrue("w:index-settings 可执行 apply-index-settings",
                writer.preHandle(stubRequest("POST",
                        "/internal/es/index/insight/actions/apply-index-settings/execute",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor readOnly = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("conn:c1:index-settings")), true, audit);
        assertFalse("只读键不得执行护栏动作",
                readOnly.preHandle(stubRequest("POST",
                        "/internal/es/index/insight/actions/apply-index-settings/execute",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor rank3OtherPage = interceptor(delegatedAs(ConsoleRole.REBUILD_OP,
                Collections.singleton("conn:c1:overview")), true, audit);
        assertFalse("rank3 但无归属页写键不得执行",
                rank3OtherPage.preHandle(stubRequest("POST",
                        "/internal/es/index/insight/actions/apply-index-settings/execute",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        assertFalse("未登记页面归属的护栏动作在连接模型下一律拒绝",
                writer.preHandle(stubRequest("POST",
                        "/internal/es/index/insight/actions/unregistered/execute",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }


    @Test
    public void DevTools独立执行端点接受devtools或rest写键() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        java.util.Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        ConsoleAuthInterceptor devtoolsWriter = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:devtools", "conn:c1:w:devtools"))), true, audit);
        assertTrue("w:devtools 可执行 DevTools",
                devtoolsWriter.preHandle(stubRequest("POST", "/internal/es/index/cluster/devtools/execute", target),
                        new StubResponse().proxy, null));

        ConsoleAuthInterceptor restWriter = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:rest", "conn:c1:w:rest"))), true, audit);
        assertTrue("w:rest 兼容 DevTools",
                restWriter.preHandle(stubRequest("POST", "/internal/es/index/cluster/devtools/execute", target),
                        new StubResponse().proxy, null));

        /* 1133：只读键现在允许**进入**端点（打只读标记），内层写由执行端拒绝。
           改造前这里一刀切 403，导致只读身份连 GET 都执行不了。 */
        ConsoleAuthInterceptor readOnly = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("conn:c1:devtools")), true, audit);
        javax.servlet.http.HttpServletRequest readOnlyReq =
                stubRequest("POST", "/internal/es/index/cluster/devtools/execute", target);
        assertTrue("只读键可进入执行端点（内层读写由执行端分档）",
                readOnly.preHandle(readOnlyReq, new StubResponse().proxy, null));
        assertEquals("必须打只读标记，执行端据此拒绝内层写",
                Boolean.TRUE, readOnlyReq.getAttribute(ConsoleAuthInterceptor.ATTR_PASSTHROUGH_READ_ONLY));
    }




    @Test
    public void 共享写映射优先于单一页面前缀() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        java.util.Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        ConsoleAuthInterceptor ilm = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:ilm", "conn:c1:w:ilm"))), true, audit);
        assertTrue("w:ilm 可执行 ilm/move",
                ilm.preHandle(stubRequest("POST", "/internal/es/index/cluster/ilm/move", target),
                        new StubResponse().proxy, null));
        ConsoleAuthInterceptor lifecycle = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:lifecycle", "conn:c1:w:lifecycle"))), true, audit);
        assertTrue("w:lifecycle 可执行 ilm/move",
                lifecycle.preHandle(stubRequest("POST", "/internal/es/index/cluster/ilm/move", target),
                        new StubResponse().proxy, null));
        ConsoleAuthInterceptor validator = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:config-validator", "conn:c1:w:config-validator"))), true, audit);
        assertTrue("w:config-validator 可写别名（建索引带 alias）",
                validator.preHandle(stubRequest("POST", "/internal/es/index/cluster/alias-actions", target),
                        new StubResponse().proxy, null));
    }

    @Test
    public void 低角色静态aliases与configValidator写键仍只允许add() throws Exception {
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("aliases", "conn:c1:w:config-validator"))), true,
                new CapturingAudit());
        HttpServletRequest req = stubRequest("POST", "/internal/es/index/cluster/alias-actions",
                Collections.singletonMap("X-Es-Target", "c1"));
        assertTrue(it.preHandle(req, new StubResponse().proxy, null));
        assertTrue("preHandle 必须把低角色静态 aliases 降为 add-only",
                ConsoleAuthInterceptor.aliasActionsAddOnly(req));
    }

    @Test
    public void 动作端点记录conn写键直接授权_静态回落不置位() throws Exception {
        java.util.Map<String, String> target = Collections.singletonMap("X-Es-Target", "c1");
        HttpServletRequest connReq = stubRequest("POST",
                "/insight/actions/apply-index-settings/estimate", target);
        ConsoleAuthInterceptor conn = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:index-settings", "conn:c1:w:index-settings"))),
                true, new CapturingAudit());
        assertTrue(conn.preHandle(connReq, new StubResponse().proxy, null));
        assertEquals(Boolean.TRUE,
                connReq.getAttribute(ConsoleAuthInterceptor.ATTR_CONN_WRITE_GRANTED));

        HttpServletRequest staticReq = stubRequest("POST",
                "/insight/actions/apply-index-settings/estimate", target);
        ConsoleAuthInterceptor stat = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                Collections.singleton("index-settings")), true, new CapturingAudit());
        assertTrue(stat.preHandle(staticReq, new StubResponse().proxy, null));
        assertEquals("静态页回落不得冒充 conn 写键授权", null,
                staticReq.getAttribute(ConsoleAuthInterceptor.ATTR_CONN_WRITE_GRANTED));
    }

    @Test
    public void diag只可调用固定retry端点_不可任意reroute() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        java.util.Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        /* 1002：retry-failed 是全集群分片重试（集群级动作），连接模型下除 w:diag 外还需 rank3；
           VIEWER 的 w:diag 不再够（原实现能用一页写键触发整集群分片迁移）。 */
        ConsoleAuthInterceptor viewerDiag = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:diag", "conn:c1:w:diag"))), true, audit);
        assertFalse("rank2 的 w:diag 不得触发集群级 retry",
                viewerDiag.preHandle(stubRequest("POST", "/internal/es/index/cluster/reroute/retry-failed", target),
                        new StubResponse().proxy, null));
        ConsoleAuthInterceptor diag = interceptor(delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Arrays.asList("conn:c1:diag", "conn:c1:w:diag"))), true, audit);
        assertTrue("rank3 + w:diag 可用固定 retry 端点",
                diag.preHandle(stubRequest("POST", "/internal/es/index/cluster/reroute/retry-failed", target),
                        new StubResponse().proxy, null));
        assertFalse("w:diag 不得执行任意 reroute commands",
                diag.preHandle(stubRequest("POST", "/internal/es/index/cluster/reroute", target),
                        new StubResponse().proxy, null));
        /* 第二通道：rank2 + w:cluster-settings（集群设置页=集群级语义）可执行集群级动作，
           避免把宿主显式授了集群设置写权的人一刀切拦住 */
        ConsoleAuthInterceptor scoped = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                new HashSet<>(Arrays.asList("conn:c1:diag", "conn:c1:w:diag",
                        "conn:c1:cluster-settings", "conn:c1:w:cluster-settings"))), true, audit);
        assertTrue("rank2 + w:cluster-settings 可执行集群级 retry",
                scoped.preHandle(stubRequest("POST", "/internal/es/index/cluster/reroute/retry-failed", target),
                        new StubResponse().proxy, null));

        ConsoleAuthInterceptor settings = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:cluster-settings", "conn:c1:w:cluster-settings"))), true, audit);
        assertTrue(settings.preHandle(stubRequest("POST", "/internal/es/index/cluster/reroute", target),
                new StubResponse().proxy, null));
    }

    @Test
    public void 静态页白名单同样按共享读归属页裁决() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        java.util.Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        /* static live 页读监控端点：monitor-metrics 前缀归 overview，但共享读表允许 live */
        ConsoleAuthInterceptor live = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("live")), true, audit);
        assertTrue("static live 可读 monitor-metrics",
                live.preHandle(stubRequest("GET", "/internal/es/index/monitor-metrics", target),
                        new StubResponse().proxy, null));
        ConsoleAuthInterceptor lifecycle = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("lifecycle")), true, audit);
        assertTrue("static lifecycle 可读 ilm/explain",
                lifecycle.preHandle(stubRequest("GET", "/internal/es/index/cluster/ilm/explain", target),
                        new StubResponse().proxy, null));
        /* static overview-only 仍不得直读 query/search 业务数据 */
        ConsoleAuthInterceptor overviewOnly = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("overview")), true, audit);
        StubResponse denied = new StubResponse();
        assertFalse("static overview 不得读 query",
                overviewOnly.preHandle(stubRequest("POST", "/internal/es/index/cluster/query?index=orders", target),
                        denied.proxy, null));
        assertEquals(403, denied.status);
    }

    @Test
    public void 共享读端点按归属页读键裁决_空集全拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        java.util.Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        ConsoleAuthInterceptor search = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("conn:c1:search")), true, audit);
        assertTrue("search 页可读 query",
                search.preHandle(stubRequest("POST", "/internal/es/index/cluster/query?index=orders", target),
                        new StubResponse().proxy, null));
        assertTrue("search 页可读 search-dsl",
                search.preHandle(stubRequest("POST", "/internal/es/index/cluster/search-dsl?index=logs-*", target),
                        new StubResponse().proxy, null));

        ConsoleAuthInterceptor overviewOnly = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("conn:c1:overview")), true, audit);
        StubResponse denied = new StubResponse();
        assertFalse("overview 页不得读 query",
                overviewOnly.preHandle(stubRequest("POST", "/internal/es/index/cluster/query?index=orders", target),
                        denied.proxy, null));
        assertEquals(403, denied.status);
        assertTrue(denied.bodyText().contains("PAGE_DENIED"));

        ConsoleAuthInterceptor empty = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.<String>emptySet()), true, audit);
        assertFalse("空集不得读 query",
                empty.preHandle(stubRequest("POST", "/internal/es/index/cluster/query?index=orders", target),
                        new StubResponse().proxy, null));
        assertTrue("空集仍可拉身份",
                empty.preHandle(stubRequest("GET", "/internal/es/index/auth/me", target),
                        new StubResponse().proxy, null));
    }

    @Test
    public void 空集或未授予归属页的共享写一律拒绝() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor empty = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                Collections.<String>emptySet()), true, audit);
        StubResponse emptyResp = new StubResponse();
        assertFalse("空页面授权不得借角色门写共享端点", empty.preHandle(
                stubRequest("POST", "/internal/es/index/cluster/doc",
                        Collections.singletonMap("X-Es-Target", "c1")), emptyResp.proxy, null));
        assertEquals(403, emptyResp.status);
        assertTrue(emptyResp.bodyText().contains("WRITE_DENIED"));

        ConsoleAuthInterceptor overviewOnly = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                Collections.singleton("overview")), true, audit);
        assertFalse("只有 overview 页不得写 search 归属的共享端点", overviewOnly.preHandle(
                stubRequest("POST", "/internal/es/index/cluster/doc",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor searchPage = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                Collections.singleton("search")), true, audit);
        assertTrue("有 search 页 + OPERATOR 角色可写该共享端点", searchPage.preHandle(
                stubRequest("POST", "/internal/es/index/cluster/doc",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void 托管重建写键可调用向导内的配置校验() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor adhoc = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:adhoc-rebuild", "conn:c1:w:adhoc-rebuild"))), true, audit);
        assertTrue("adhoc 写键应允许 config-lab/validate dry-run", adhoc.preHandle(
                stubRequest("POST", "/internal/es/index/config-lab/validate",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor other = interceptor(delegatedAs(ConsoleRole.VIEWER,
                Collections.singleton("conn:c1:w:xmigrate")), true, audit);
        assertFalse("无关写键不得调用配置校验", other.preHandle(
                stubRequest("POST", "/internal/es/index/config-lab/validate",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void 静态页授权_托管重建页可调用向导内配置校验() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor rank3 = interceptor(delegatedAs(ConsoleRole.REBUILD_OP,
                new HashSet<>(Arrays.asList("adhoc-rebuild"))), true, audit);
        assertTrue("静态 adhoc 页 + rank3 应允许 config-lab/validate dry-run", rank3.preHandle(
                stubRequest("POST", "/internal/es/index/config-lab/validate", ""), new StubResponse().proxy, null));

        ConsoleAuthInterceptor viewer = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("adhoc-rebuild"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse("静态 adhoc 页但角色不足不得调用配置校验", viewer.preHandle(
                stubRequest("POST", "/internal/es/index/config-lab/validate", ""), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void 静态workspace页可读任务与远程集群卡片() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor ws = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("workspace"))), true, audit);
        assertTrue(ws.preHandle(stubRequest("GET", "/internal/es/index/cluster/task-detail", ""),
                new StubResponse().proxy, null));
        assertTrue(ws.preHandle(stubRequest("GET", "/internal/es/index/cluster/remote-clusters", ""),
                new StubResponse().proxy, null));
    }

    @Test
    public void 连接模型共享写不得因缺目标头回落角色门写宿主() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        /* OPERATOR 角色只够角色门；连接模型下必须再持有目标连接的页面写键。 */
        ConsoleAuthInterceptor op = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                new HashSet<>(Arrays.asList("conn:c1:search", "conn:c1:w:search"))), true, audit);
        StubResponse hostDenied = new StubResponse();
        assertFalse("缺目标头=host，conn:c1 写键不得写宿主", op.preHandle(
                stubRequest("POST", "/internal/es/index/cluster/doc", Collections.<String, String>emptyMap()),
                hostDenied.proxy, null));
        assertEquals(403, hostDenied.status);
        assertTrue(hostDenied.bodyText().contains("WRITE_DENIED"));

        assertTrue("带 c1 目标=该连接写键放行", op.preHandle(
                stubRequest("POST", "/internal/es/index/cluster/doc",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor readOnly = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                Collections.singleton("conn:c1:search")), true, audit);
        assertFalse("只读键不得写共享端点", readOnly.preHandle(
                stubRequest("POST", "/internal/es/index/cluster/doc",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor hostWriter = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                Collections.singleton("conn:host:w:search")), true, audit);
        assertTrue("显式 conn:host 写键可写宿主", hostWriter.preHandle(
                stubRequest("POST", "/internal/es/index/cluster/doc", Collections.<String, String>emptyMap()),
                new StubResponse().proxy, null));
    }

    @Test
    public void 委托会话首见落LOGIN审计_同令牌去重() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:search"))), true, audit);
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Host-Token", "host-jwt-token-a");
        headers.put("X-Es-Target", "c1");
        /* 用数据面共享读端点验证 LOGIN 审计：宿主专属 /overview 按 host 页键授权，不随目标头。 */
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/query", headers), new StubResponse().proxy, null));
        assertEquals("LOGIN", audit.action);
        assertEquals("宿主委托会话建立", audit.last.getDetail());
        audit.action = null;
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/query", headers), new StubResponse().proxy, null));
        assertEquals(null, audit.action); /* 同令牌第二次请求不再落 LOGIN */
        headers.put("X-Es-Host-Token", "host-jwt-token-b"); /* 换发=新会话 */
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/query", headers), new StubResponse().proxy, null));
        assertEquals("LOGIN", audit.action);
    }

    @Test
    public void 逃生阀关闭_空集也放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.<String>emptySet()), false, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
        assertNull("逃生阀关闭时页面门不得落审计", audit.action);
    }

    @Test
    public void 页面门先于角色门_报page而非required() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // VIEWER + 白名单仅 search：POST /cluster/bulk 页面不在白名单（角色档 OPERATOR 也不够）
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("search"));
        ConsoleAuthInterceptor it = interceptor(p, true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/bulk", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"bulk\""));
        assertFalse("页面门必须先于角色门响", resp.bodyText().contains("\"required\""));
    }

    @Test
    public void 分号矩阵参数变形_归一化后命中页面门_403带page() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("search")), true, audit);
        StubResponse resp = new StubResponse();
        // raw URI 含 ;x=y 矩阵参数时 pageOf 字面失配会误判「共享端点」放行——归一化后必须命中 bulk 页
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/bulk;x=y", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"bulk\""));
    }

    @Test
    public void 百分号编码变形_归一化后命中页面门_403带page() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("search")), true, audit);
        StubResponse resp = new StubResponse();
        // %62 = 'b'：raw URI 字面失配即逃逸，归一化解码后必须命中 bulk 页
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/%62ulk", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"page\":\"bulk\""));
    }

    @Test
    public void 非委托身份_带grantedPages_页面门不生效_放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // ADMIN 即使来自自定义授权器（非 delegated）：超管全局放行，页面白名单不拖累超管
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.ADMIN, true, false, null, null,
                Collections.singleton("search"));
        ConsoleAuthInterceptor it = interceptor(p, true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""), new StubResponse().proxy, null));
        assertNull("非委托 ADMIN 放行不得落 PAGE_DENIED 审计", audit.action);
    }

    @Test
    public void 自定义授权器非委托身份_页面白名单同样生效() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        /* 自定义 EsConsoleAuthorizer 返回非空 grantedPages 时，/auth/me 会把它下发给前端
           收缩菜单；后端必须同口径执法，否则前端隐藏的页面可被直调绕过。 */
        ConsoleAuthInterceptor it = interceptor(new ConsolePrincipal("custom-u", ConsoleRole.VIEWER,
                false, false, null, null, Collections.singleton("search")), true, audit);
        StubResponse denied = new StubResponse();
        assertFalse(it.preHandle(stubRequest("GET", "/internal/es/index/overview", ""),
                denied.proxy, null));
        assertEquals(403, denied.status);
        assertTrue(denied.bodyText().contains("\"page\":\"overview\""));
        assertTrue("授予的 search 页仍可读共享查询端点", it.preHandle(
                stubRequest("GET", "/internal/es/index/cluster/query?index=orders",
                        Collections.singletonMap("X-Es-Target", "c1")),
                new StubResponse().proxy, null));
    }

    @Test
    public void 页面门通过_角色门接管_报required而非page() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // delegated VIEWER 白名单含 bulk：页面门放行，POST /cluster/bulk 属高危清单，角色门必须正常接管
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("bulk"));
        ConsoleAuthInterceptor it = interceptor(p, true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/bulk", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\""));
        assertFalse("页面门已通过，拒绝必须来自角色门", resp.bodyText().contains("\"page\""));
    }

    /* ---------------- ：conn 模型写门 WRITE_DENIED + 内置 VIEWER 角色门强制 ---------------- */

    @Test
    public void conn模型只有读键_写请求WRITE_DENIED403() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // conn 模型 VIEWER 只授 indices 页读键（conn:c1:indices）：delete-index 写请求须写键
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:indices"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-index",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("WRITE_DENIED"));
        assertTrue(resp.bodyText().contains("\"page\":\"indices\""));
        // preHandle 返回 false 后 afterCompletion 不回调，写门拒绝必须显式落审计
        assertEquals("WRITE_DENIED", audit.action);
        assertEquals(403, audit.httpStatus);
    }

    @Test
    public void conn模型写键_写请求放行_短路角色门() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 同请求换写键 conn:c1:w:indices：连接模型的写授权即最终裁决——VIEWER 角色门不再二次否决
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:w:indices"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-index",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull("conn 写键放行不得落拒绝审计", audit.action);
    }

    @Test
    public void 内置VIEWER角色门强制_高危写端点403报required() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 内置（非 delegated）身份 grantedPages=null：页面门不启用，角色门全量强制
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("viewer", ConsoleRole.VIEWER, true, false), true, audit);
        // POST bulk → REBUILD_KEYWORDS rank3
        StubResponse respBulk = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/bulk", ""), respBulk.proxy, null));
        assertEquals(403, respBulk.status);
        assertTrue(respBulk.bodyText().contains("\"required\":\"REBUILD_OP\""));
        assertFalse("内置身份不走页面门，不得报 page", respBulk.bodyText().contains("\"page\""));
        // DELETE snapshot/delete → CLUSTER_KEYWORDS rank3
        StubResponse respSnap = new StubResponse();
        assertFalse(it.preHandle(stubRequest("DELETE", "/internal/es/index/cluster/snapshot/delete", ""),
                respSnap.proxy, null));
        assertEquals(403, respSnap.status);
        assertTrue(respSnap.bodyText().contains("\"required\":\"REBUILD_OP\""));
        // PUT ilm/policy → CLUSTER_KEYWORDS rank3
        StubResponse respIlm = new StubResponse();
        assertFalse(it.preHandle(stubRequest("PUT", "/internal/es/index/cluster/ilm/policy", ""),
                respIlm.proxy, null));
        assertEquals(403, respIlm.status);
        assertTrue(respIlm.bodyText().contains("\"required\":\"REBUILD_OP\""));
        assertEquals("角色门拒绝同样留痕（事后可追溯越权尝试）", "ROLE_DENIED", audit.action);
    }

    /* ------------- 共享写端点按真实归属页写键裁决（963 收口后的当前语义） -------------
       历史：飞书授权用户（宿主角色映射恒 VIEWER）持 QA 集群写键，表格编辑提交
       （POST /cluster/update-partial）曾被角色门误拦；584 曾放宽为「任意连接写键放行共享写」。
       963 起收口：共享写端点必须持有真实使用该端点的页面写键（search/indices/ilm 等），
       不再按「任意写键」放行——防止 optimizer 写键删文档、改 ILM 策略。
       连接模型下页面写键是最终裁决，角色门不复辟；未登记共享写默认拒绝。 */

    @Test
    public void 打通_共享写要求真实页面写键_表格编辑提交() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 表格编辑（POST update-partial）由 search/indices 等页面真实使用：持 search 页写键放行
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:search", "conn:c1:w:search"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull("打通放行不得落拒绝审计", audit.action);
    }

    @Test
    public void 共享写_仅读键无写键_映射端点WRITE_DENIED() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 只授 search 读键（无 w: 键）：映射共享写端点不再回落角色门，直接 WRITE_DENIED
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:search"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("WRITE_DENIED"));
    }

    @Test
    public void 共享高危档deleteById_须search或indices写键_optimizer写键不放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor allow = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:search", "conn:c1:w:search"))), true, audit);
        assertTrue(allow.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-by-id",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);

        StubResponse cross = new StubResponse();
        ConsoleAuthInterceptor deny = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:optimizer", "conn:c1:w:optimizer"))), true, audit);
        assertFalse(deny.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-by-id",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), cross.proxy, null));
        assertEquals(403, cross.status);
        assertTrue(cross.bodyText().contains("WRITE_DENIED"));
    }

    @Test
    public void 集群级ilmPolicy_ilm页写键不足_rank3或集群设置写键放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        /* ILM 策略是集群级共享件（影响所有引用索引）：rank2 的 w:ilm 只能做页内
           explain，不得改/删策略（误配可让全集群索引提前滚出/删除）。 */
        StubResponse low = new StubResponse();
        ConsoleAuthInterceptor deny = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:ilm", "conn:c1:w:ilm"))), true, audit);
        assertFalse(deny.preHandle(stubRequest("PUT", "/internal/es/index/cluster/ilm/policy",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), low.proxy, null));
        assertEquals(403, low.status);
        assertTrue(low.bodyText().contains("CLUSTER_SCOPE_REQUIRED"));

        /* rank3 专项不受影响 */
        ConsoleAuthInterceptor allow = interceptor(delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Arrays.asList("conn:c1:ilm", "conn:c1:w:ilm"))), true, audit);
        assertTrue(allow.preHandle(stubRequest("PUT", "/internal/es/index/cluster/ilm/policy",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        /* 第二通道：显式授予集群设置写权的 rank2 运维不被一刀切拦住 */
        ConsoleAuthInterceptor viaSettings = interceptor(delegatedAs(ConsoleRole.OPERATOR,
                new HashSet<>(Arrays.asList("conn:c1:ilm", "conn:c1:w:ilm",
                        "conn:c1:cluster-settings", "conn:c1:w:cluster-settings"))), true, audit);
        assertTrue(viaSettings.preHandle(stubRequest("PUT", "/internal/es/index/cluster/ilm/policy",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    /* ------------- ·管理域放开（裁决「管理域放」）：raw/users 归属菜单页按勾选裁决 -------------
       raw 归 rest 页（POST /cluster/raw 归 REST 直连页写勾选）、users 归 security 页（用户管理
       归安全中心写勾选）——esquerystudio-pages.json apiPrefixes 归属后页面门自然接管（读键可见+
       写键 WRITE_DENIED）；系统管理（/setup/rebind 重绑、/clusters/ 连接档案）无菜单勾选项
       对应且为授权体系载体，维持 ADMIN 专属。静态模型（SPI 未启用）维持角色档 ADMIN。 */
    @Test
    public void 管理域放开_raw归rest页_写键放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:rest", "conn:c1:w:rest"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/raw",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);
    }

    @Test
    public void 用户管理_security写键可管理普通账号_ADMIN授予由服务层防提权() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // security 页写键：用户管理放行（ADMIN 角色授予/改写由 BuiltinConsoleAuthService 拦截）
        ConsoleAuthInterceptor writer = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:host:security", "conn:host:w:security"))), true, audit);
        assertTrue(writer.preHandle(stubRequest("POST", "/internal/es/index/auth/users/upsert",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        // 仅读键：WRITE_DENIED
        StubResponse denied = new StubResponse();
        ConsoleAuthInterceptor reader = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Collections.singletonList("conn:host:security"))), true, audit);
        assertFalse(reader.preHandle(stubRequest("POST", "/internal/es/index/auth/users/upsert",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), denied.proxy, null));
        assertEquals(403, denied.status);
        assertTrue(denied.bodyText().contains("WRITE_DENIED"));

        // 委托 ADMIN 无 w:security 也可管理（超管全局）
        ConsoleAuthInterceptor admin = interceptor(delegatedAs(ConsoleRole.ADMIN,
                new HashSet<>(Collections.singletonList("conn:c1:rest"))), true, audit);
        assertTrue(admin.preHandle(stubRequest("POST", "/internal/es/index/auth/users/upsert",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    /* ------------- 系统管理（连接档案/重绑/用户库）ADMIN 角色专属，连接写键不放行 ------------- */

    @Test
    public void 系统管理_连接写键不再放行连接档案与重绑_ADMIN可() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        HashSet<String> writeKeys = new HashSet<>(Arrays.asList(
                "conn:c1:rest", "conn:c1:w:rest", "conn:c1:security", "conn:c1:w:security"));
        ConsoleAuthInterceptor viewer = interceptor(delegatedAs(ConsoleRole.VIEWER, writeKeys), true, audit);
        StubResponse save = new StubResponse();
        assertFalse(viewer.preHandle(stubRequest("POST", "/internal/es/index/clusters/save",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), save.proxy, null));
        assertEquals(403, save.status);
        assertTrue(save.bodyText().contains("\"required\":\"ADMIN\""));
        StubResponse rebind = new StubResponse();
        assertFalse(viewer.preHandle(stubRequest("POST", "/internal/es/index/setup/rebind",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), rebind.proxy, null));
        assertEquals(403, rebind.status);

        ConsoleAuthInterceptor admin = interceptor(delegatedAs(ConsoleRole.ADMIN,
                new HashSet<>(Collections.singletonList("conn:c1:rest"))), true, audit);
        assertTrue(admin.preHandle(stubRequest("POST", "/internal/es/index/clusters/save",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertTrue(admin.preHandle(stubRequest("POST", "/internal/es/index/setup/rebind",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void 系统管理无写键_维持ADMIN角色档403_负锚() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 仅读键：系统管理端点维持 ADMIN 档拒绝（静态/连接模型同语义）
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:rest", "conn:c1:security"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/clusters/save",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"ADMIN\""));
        StubResponse resp2 = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/setup/rebind",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp2.proxy, null));
        assertEquals(403, resp2.status);
    }

    @Test
    public void 超管全局放行_无页面与连接写键也能读写() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 仅 rest 读键的委托 ADMIN：页面白名单/连接写键都不应拖累超管
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.ADMIN,
                new HashSet<>(Collections.singletonList("conn:c1:rest"))), true, audit);
        Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-index", target),
                new StubResponse().proxy, null));
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial", target),
                new StubResponse().proxy, null));
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/templates", target),
                new StubResponse().proxy, null));
    }

    @Test
    public void 委托VIEWER_连接探活不被系统管理门误杀() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Collections.singletonList("conn:c1:rest"))), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/clusters/c1/probe",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull(audit.action);
    }

    @Test
    public void 静态模型管理域维持角色档_raw无授权VIEWER仍拒() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 静态模型（grantedPages=null，SPI 未启用）：raw 维持 ADMIN 角色档兜底
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("viewer", ConsoleRole.VIEWER, true, false), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/raw", ""), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"ADMIN\""));
    }

    @Test
    public void 打通_OPERATOR纯角色无写键_低危共享写端点角色门放行不回归() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // OPERATOR（无任何 grantedPages=null，非 conn 模型）：角色门既有放行路径不回归
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("ops-u1", ConsoleRole.OPERATOR, true, false), true, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial", ""),
                new StubResponse().proxy, null));
    }

    /* ---------------- ：打通面角落矩阵（target 错配 / 桶成员逐一 / 静态模型 / 读请求不受扰） ---------------- */

    @Test
    public void 打通_target错配_c1写键救不了c2的共享写请求() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 共享写页面键按 targetId 精确匹配：c1 的 search 写键对 c2 的请求无效
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:search", "conn:c1:w:search"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c2")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("WRITE_DENIED"));
        assertEquals("WRITE_DENIED", audit.action);
    }

    @Test
    public void 打通_共享写桶成员按归属页写键逐一放行_未登记端点回落角色门() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // 文档 CRUD 归 search/indices；任务取消归 tasks/task-tree 且是集群级动作（需 rank3）
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Arrays.asList("conn:c1:search", "conn:c1:w:search",
                        "conn:c1:tasks", "conn:c1:w:tasks"))), true, audit);
        Map<String, String> target = java.util.Collections.singletonMap("X-Es-Target", "c1");
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-document", target),
                new StubResponse().proxy, null));
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/doc", target),
                new StubResponse().proxy, null));
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/doc/update", target),
                new StubResponse().proxy, null));
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/tasks/cancel", target),
                new StubResponse().proxy, null));
        /* 未登记页面归属的洞察动作在连接模型下直接拒绝，不再回落角色门 */
        StubResponse insight = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/insight/actions/a1/estimate", target),
                insight.proxy, null));
        assertEquals(403, insight.status);
        assertTrue(insight.bodyText().contains("\"code\":\"WRITE_DENIED\""));
    }

    @Test
    public void 打通_静态键模型_共享写端点维持角色门() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // grantedPages 全静态键（无 conn: 前缀）→ inConnModel=false：静态键本就不授写，永不因写键语义放行
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(java.util.Collections.singletonList("search"))), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/update-partial",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), resp.proxy, null));
        assertEquals(403, resp.status);
        assertTrue(resp.bodyText().contains("\"required\":\"OPERATOR\""));
    }

    @Test
    public void 打通_写键持有人读请求不受扰_GET照旧放行() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // GET 本就 VIEWER 放行（requiredRole=VIEWER 先于一切），打通分支只动写路径——防回归
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:search", "conn:c1:w:search"))), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/cluster/indices",
                java.util.Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertNull("读请求放行不得落拒绝审计", audit.action);
    }

    @Test
    public void contextPath剥离后才匹配页面() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegated(Collections.singleton("overview")), true, audit);
        assertTrue(it.preHandle(stubRequest("GET", "/宿主/internal/es/index/overview", "/宿主"),
                new StubResponse().proxy, null));
        ConsoleAuthInterceptor it2 = interceptor(delegated(Collections.<String>emptySet()), true, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it2.preHandle(stubRequest("GET", "/宿主/internal/es/index/overview", "/宿主"),
                resp.proxy, null));
        assertEquals(403, resp.status);
    }

    /* ---------------- servletPath 归一化（377fed0 真机事故回归钉） ---------------- */

    @Test
    public void 默认映射_servletPath为完整路径_pathInfo为null_归一化不得吞掉整条路径() {
        // Tomcat 默认映射（/）：getServletPath() 返回完整请求路径、pathInfo=null。
        // 若按「非 / 即剥」处理，path 会被剥成空串——377fed0 事故根因
        HttpServletRequest req = stubRequest("GET", "/internal/es/index/setup/status", "",
                "/internal/es/index/setup/status", null);
        assertEquals("/internal/es/index/setup/status", ConsoleAuthInterceptor.normalizePath(req));
    }

    @Test
    public void 默认映射_白名单端点_未登录也必须放行_真机401事故复现() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        // authorizer 返回 null（未登录）：白名单命中必须先于 authenticate 短路；
        // 归一化吞路径 → isWhitelisted("")=false → 走到 authenticate → 401（真机实锤）
        ConsoleAuthInterceptor it = interceptor(null, true, audit);
        StubResponse resp = new StubResponse();
        assertTrue(it.preHandle(stubRequest("GET", "/internal/es/index/setup/status", "",
                "/internal/es/index/setup/status", null), resp.proxy, null));
        assertEquals("白名单端点不得写 401", 200, resp.status);
    }

    @Test
    public void 前缀映射_servletPath为api_pathInfo非空_归一化剥掉前缀_页面门口径不变() {
        // 377fed0 目标场景保住：spring.mvc.servlet.path=/api → 映射 /api/*，
        // servletPath=/api、pathInfo=/internal/...，前缀必须剥掉否则页面门静默失效
        HttpServletRequest req = stubRequest("GET", "/api/internal/es/index/overview", "",
                "/api", "/internal/es/index/overview");
        assertEquals("/internal/es/index/overview", ConsoleAuthInterceptor.normalizePath(req));
    }

    /* ---------- 978：静态共享写同序、宿主绑定、Painless 写档、HEAD 只读 ---------- */

    @Test
    public void 静态页共享写优先于页前缀_持indices的rank3可建索引() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(delegatedAs(ConsoleRole.REBUILD_OP,
                new HashSet<>(Arrays.asList("indices"))), true, audit);
        StubResponse resp = new StubResponse();
        assertTrue("indices 页是 create-index 的合法使用者，不得被 config-validator 前缀 403",
                it.preHandle(stubRequest("POST", "/internal/es/index/cluster/create-index", ""), resp.proxy, null));
    }

    @Test
    public void 宿主专属端点按host授权_持远端连接写键不得改宿主() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor remote = interceptor(delegatedAs(ConsoleRole.REBUILD_OP,
                new HashSet<>(Arrays.asList("conn:c1:indices", "conn:c1:w:indices"))), true, audit);
        StubResponse denied = new StubResponse();
        assertFalse("provider 重建恒定宿主，c1 写键不能授权宿主写",
                remote.preHandle(stubRequest("POST", "/internal/es/index/rebuild",
                        Collections.singletonMap("X-Es-Target", "c1")), denied.proxy, null));
        assertEquals(403, denied.status);

        ConsoleAuthInterceptor host = interceptor(delegatedAs(ConsoleRole.REBUILD_OP,
                new HashSet<>(Arrays.asList("conn:host:indices", "conn:host:w:indices"))), true, audit);
        assertTrue("显式 host 写键必须放行宿主端点",
                host.preHandle(stubRequest("POST", "/internal/es/index/rebuild",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void Painless执行按写档_只读页键不得执行脚本() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor readOnly = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:painless-lab"))), true, audit);
        StubResponse denied = new StubResponse();
        assertFalse(readOnly.preHandle(stubRequest("POST", "/internal/es/index/cluster/painless/execute",
                Collections.singletonMap("X-Es-Target", "c1")), denied.proxy, null));
        assertEquals(403, denied.status);

        ConsoleAuthInterceptor writer = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:painless-lab", "conn:c1:w:painless-lab"))), true, audit);
        assertTrue("持 painless-lab 写键必须可执行",
                writer.preHandle(stubRequest("POST", "/internal/es/index/cluster/painless/execute",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void 宿主只读辅助面按目标页授权_共享读片段不误吞更长端点() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor xmigrate = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:xmigrate"))), true, audit);
        assertTrue("Xmigrate 需要的宿主索引键不能被 host 授权挡死",
                xmigrate.preHandle(stubRequest("GET", "/internal/es/index/keys",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor mapping = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:mapping"))), true, audit);
        assertTrue("mapping 页读 settings 默认值不得被 index-settings 共享读误拦",
                mapping.preHandle(stubRequest("GET", "/internal/es/index/cluster/index-settings-defaults",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor search = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:search"))), true, audit);
        assertTrue("查询页字段类型依赖 mapping-detail",
                search.preHandle(stubRequest("GET", "/internal/es/index/cluster/mapping-detail",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor dbq = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:update-by-query"))), true, audit);
        assertTrue("DBQ 页必须能轮询自己发起的任务进度",
                dbq.preHandle(stubRequest("GET", "/internal/es/index/progress",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    @Test
    public void 无页前缀读端点按真实调用页收口_HEAD按只读判定() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor overviewOnly = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:overview"))), true, audit);
        StubResponse denied = new StubResponse();
        assertFalse("overview 页不得读存储脚本源码", overviewOnly.preHandle(
                stubRequest("GET", "/internal/es/index/cluster/scripts",
                        Collections.singletonMap("X-Es-Target", "c1")), denied.proxy, null));
        assertEquals(403, denied.status);

        ConsoleAuthInterceptor scriptsReader = interceptor(delegatedAs(ConsoleRole.VIEWER,
                new HashSet<>(Arrays.asList("conn:c1:painless-lab"))), true, audit);
        assertTrue(scriptsReader.preHandle(stubRequest("GET", "/internal/es/index/cluster/scripts",
                Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
        assertTrue("HEAD 是只读观测，不得按写档拦截", scriptsReader.preHandle(
                stubRequest("HEAD", "/internal/es/index/cluster/scripts",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    /** 混合授权（conn 键 + 静态页键）：静态全局页写权不能被 conn 读键吞掉。 */
    @Test
    public void 混合授权静态页写权仍生效_纯conn无权仍拒绝() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor mixed = interceptor(delegatedAs(ConsoleRole.REBUILD_OP,
                new HashSet<>(Arrays.asList("config-validator", "indices", "conn:c1:overview"))), true, audit);
        assertTrue("静态 config-validator/indices 写权 + rank3 应放行建索引",
                mixed.preHandle(stubRequest("POST", "/internal/es/index/cluster/create-index",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));

        ConsoleAuthInterceptor connOnly = interceptor(delegatedAs(ConsoleRole.REBUILD_OP,
                new HashSet<>(Collections.singletonList("conn:c1:overview"))), true, audit);
        StubResponse denied = new StubResponse();
        assertFalse("只有 conn 读键不得建索引",
                connOnly.preHandle(stubRequest("POST", "/internal/es/index/cluster/create-index",
                        Collections.singletonMap("X-Es-Target", "c1")), denied.proxy, null));
        assertEquals(403, denied.status);

        ConsoleAuthInterceptor mixedPageWrite = interceptor(delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Arrays.asList("index-settings", "conn:c1:overview"))), true, audit);
        assertTrue("静态 index-settings 写权 + rank3 应放行热更",
                mixedPageWrite.preHandle(stubRequest("POST", "/internal/es/index/cluster/index-settings/update",
                        Collections.singletonMap("X-Es-Target", "c1")), new StubResponse().proxy, null));
    }

    /** config-validator 页只允许 alias add；aliases 页写权不受限；ADMIN 不受限。 */
    @Test
    public void aliasActions按页面写键收口动作() {
        HttpServletRequest req = stubRequest("POST", "/internal/es/index/cluster/alias-actions",
                Collections.singletonMap("X-Es-Target", "c1"));
        req.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Collections.singletonList("conn:c1:w:config-validator"))));
        assertTrue("config-validator 页只允许 add", ConsoleAuthInterceptor.aliasActionsAddOnly(req));

        req.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Collections.singletonList("conn:c1:w:aliases"))));
        assertFalse("aliases 页写权不受限", ConsoleAuthInterceptor.aliasActionsAddOnly(req));

        req.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, delegatedAs(ConsoleRole.CLUSTER_OP,
                new HashSet<>(Arrays.asList("config-validator", "conn:c1:overview"))));
        assertTrue("静态 config-validator 页同样只允许 add", ConsoleAuthInterceptor.aliasActionsAddOnly(req));

        req.setAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL, delegatedAs(ConsoleRole.ADMIN,
                new HashSet<>(Collections.singletonList("conn:c1:w:config-validator"))));
        assertFalse("ADMIN 不受动作收口", ConsoleAuthInterceptor.aliasActionsAddOnly(req));
    }

    /* ---------------- host-cluster-visible=false（1046） ---------------- */

    @Test
    public void 宿主隐藏模式_残留conn_host页键不得直捣宿主数据面() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(
                delegated(new HashSet<>(Collections.singletonList("indices"))), true, audit);
        it.setHostClusterVisible(false);
        StubResponse resp = new StubResponse();
        assertFalse("host-cluster-visible=false 时宿主专属 provider 必须拒绝",
                it.preHandle(stubRequest("GET", "/internal/es/index/cluster/inspect?indexKey=orders", ""),
                        resp.proxy, null));
        assertEquals(403, resp.status);
        assertEquals("HOST_DISABLED", audit.action);
    }

    @Test
    public void 宿主隐藏模式_自举端点仍可自救() throws Exception {
        ConsoleAuthInterceptor it = interceptor(
                delegated(new HashSet<>(Collections.singletonList("indices"))), true, new CapturingAudit());
        it.setHostClusterVisible(false);
        assertTrue("身份自查不能在宿主隐藏时被挡死（换号用户要能定位自己的授权）",
                it.preHandle(stubRequest("GET", "/internal/es/index/auth/me", ""), new StubResponse().proxy, null));
        assertTrue("连接目录是定位授权目标的唯一自助通道",
                it.preHandle(stubRequest("GET", "/internal/es/index/clusters", ""), new StubResponse().proxy, null));
    }

    @Test
    public void 宿主隐藏模式_ADMIN仍可管理宿主() throws Exception {
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("admin", ConsoleRole.ADMIN, false), true, new CapturingAudit());
        it.setHostClusterVisible(false);
        assertTrue("ADMIN 是全局管理权，宿主隐藏不拦管理面",
                it.preHandle(stubRequest("GET", "/internal/es/index/cluster/inspect?indexKey=orders", ""),
                        new StubResponse().proxy, null));
    }

    /* ═══ 1131：page-auth 逃生阀关闭时的角色档底线 ═══
       背景：`esquerystudio.elasticsearch.console.page-auth.enabled=false` 是运维逃生阀（启动期有 WARN 留痕），
       关闭后回退「纯角色档」。审计要确认这个回退**不会**把写端点一并放开——
       否则误配一次就等于全站放开写，比不开页面级授权更危险。 */
    @Test
    public void 关闭页面级授权_VIEWER仍不得写() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        /* pageAuthEnabled=false：退化为纯角色档 */
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("viewer", ConsoleRole.VIEWER, true, false), false, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/doc", ""), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void 关闭页面级授权_VIEWER仍不得走DevTools透传() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("viewer", ConsoleRole.VIEWER, true, false), false, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/devtools/execute", ""), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void 关闭页面级授权_OPERATOR仍不得走DevTools透传() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("op", ConsoleRole.OPERATOR, true, false), false, audit);
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/devtools/execute", ""), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void 关闭页面级授权_ADMIN仍可写() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(
                new ConsolePrincipal("admin", ConsoleRole.ADMIN, true, false), false, audit);
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/devtools/execute", ""), new StubResponse().proxy, null));
    }

    /* ═══ 1132：环境模板（env）必须能封住 ADMIN ═══
       产线实账：deng_test_x1 的角色档在测试环境是 ADMIN，其连接被标为 PROD 时按 env 模板
       应只剩只读页集（「生产环境只读」）。但 ADMIN 在页面门里是提前 return 的：
       `if (role >= ADMIN) return true;` 位于 line 776，而 effectivePages（含 env 收缩）
       在 line 867 才算 —— ADMIN 根本不走 env 判定，env 模板对 ADMIN 形同虚设。
       env 是环境级封顶（不是页面授权），与角色正交：ADMIN 可以不受页面白名单限制，
       但不能不受「这个连接是生产库」的限制。 */

    /** 与 interceptor 同构，但 c1 连接带 env=PROD，且 PROD 模板只给 overview 只读。 */
    private static ConsoleAuthInterceptor interceptorWithProdEnv(ConsolePrincipal principal) {
        EsConsoleAuthorizer authorizer = req -> principal;
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore stubStore = new ConnStore() {
            @Override public java.util.List<java.util.Map<String, Object>> list() { return java.util.Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) {
                if (!"c1".equals(id)) return null;
                RemoteClusterConn conn = new RemoteClusterConn();
                conn.setMinRole("VIEWER");
                conn.setEnv("PROD");
                return conn;
            }
            @Override public String getName(String id) { return "c1".equals(id) ? "c1" : null; }
            @Override public String getVersion(String id) { return null; }
            @Override public java.util.Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) { throw new UnsupportedOperationException(); }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        Map<String, Set<String>> templates = new HashMap<>();
        templates.put("PROD", new HashSet<>(Collections.singletonList("overview")));
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        props.setEnvPages(templates);
        return new ConsoleAuthInterceptor(authorizer, new CapturingAudit(), resolver,
                ConsolePageCatalog.load(), true, new EnvPagesResolver(stubStore, props), stubStore);
    }

    private static HttpServletRequest reqWithTarget(String method, String uri, String target) {
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Target", target);
        return stubRequest(method, uri, headers);
    }

    @Test
    public void PROD环境模板封住ADMIN的写() throws Exception {
        ConsoleAuthInterceptor it = interceptorWithProdEnv(
                new ConsolePrincipal("deng_test_x1", ConsoleRole.ADMIN, true, false));
        StubResponse resp = new StubResponse();
        assertFalse("PROD 连接的写必须被 env 封顶（即使角色是 ADMIN，x1 产线就是这种身份）",
                it.preHandle(reqWithTarget("POST", "/internal/es/index/cluster/raw", "c1"), resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void PROD环境模板封住ADMIN的DevTools执行() throws Exception {
        ConsoleAuthInterceptor it = interceptorWithProdEnv(
                new ConsolePrincipal("deng_test_x1", ConsoleRole.ADMIN, true, false));
        StubResponse resp = new StubResponse();
        assertFalse(it.preHandle(reqWithTarget("POST", "/internal/es/index/cluster/devtools/execute", "c1"),
                resp.proxy, null));
        assertEquals(403, resp.status);
    }

    @Test
    public void PROD环境内的只读页对ADMIN仍然放行() throws Exception {
        /* 防误拦：env 模板里有的页面必须照常可用，尤其 ADMIN 不能被一刀切成全拒 */
        ConsoleAuthInterceptor it = interceptorWithProdEnv(
                new ConsolePrincipal("deng_test_x1", ConsoleRole.ADMIN, true, false));
        assertTrue(it.preHandle(reqWithTarget("GET", "/internal/es/index/overview", "c1"),
                new StubResponse().proxy, null));
    }

    @Test
    public void PROD环境外的页面ADMIN也读不到() throws Exception {
        /* 用有页面归属的读端点（devtools 页的读前缀）。无页归属的基础读（keys / indices）
           本就不该被 env 封顶——封顶按「页」判，判不出页就放行，否则有权限的人被误拦。 */
        ConsoleAuthInterceptor it = interceptorWithProdEnv(
                new ConsolePrincipal("deng_test_x1", ConsoleRole.ADMIN, true, false));
        StubResponse resp = new StubResponse();
        assertFalse("env 模板之外的页面在 PROD 连接上应被拒",
                it.preHandle(reqWithTarget("POST", "/internal/es/index/cluster/sql", "c1"),
                        resp.proxy, null));
    }

    @Test
    public void 无页归属的基础读不被env误拦() throws Exception {
        /* 防误拦：索引下拉的基线读（cluster/indices）没有页面归属，不该因 PROD 模板被拦，
           否则用户在 PROD 连接下连「有哪些索引」都看不到。 */
        ConsoleAuthInterceptor it = interceptorWithProdEnv(
                new ConsolePrincipal("deng_test_x1", ConsoleRole.ADMIN, true, false));
        assertTrue(it.preHandle(reqWithTarget("GET", "/internal/es/index/cluster/indices", "c1"),
                new StubResponse().proxy, null));
    }

    @Test
    public void 自举与系统管理端点不被env误拦() throws Exception {
        /* env 封顶已提到最前面，必须确认它没有把自举面（身份/连接目录/setup/权限自查）
           一起封掉——这些端点 host-bound，在服务器上执行，不属于任何连接的环境。
           封掉任何一个都会让用户在 PROD 视图下直接失去自助能力（看不见菜单、退不出、改不了密）。 */
        ConsoleAuthInterceptor it = interceptorWithProdEnv(
                new ConsolePrincipal("deng_test_x1", ConsoleRole.ADMIN, true, false));
        String[][] cases = {
                {"GET", "/internal/es/index/auth/me"},
                {"GET", "/internal/es/index/auth/permissions"},
                {"POST", "/internal/es/index/auth/change-password"},
                {"POST", "/internal/es/index/auth/logout"},
                {"GET", "/internal/es/index/clusters"},
                {"GET", "/internal/es/index/clusters/sync"},
                {"GET", "/internal/es/index/setup/status"},
        };
        for (String[] c : cases) {
            assertTrue("自举端点被 env 封顶误拦：" + c[0] + " " + c[1],
                    it.preHandle(reqWithTarget(c[0], c[1], "c1"), new StubResponse().proxy, null));
        }
    }

    @Test
    public void 宿主目标不受env模板影响_ADMIN照常可用() throws Exception {
        /* host 不是某个环境：宿主自身的读写不能被 PROD 模板拖走（否则控制面自己就废了） */
        ConsoleAuthInterceptor it = interceptorWithProdEnv(
                new ConsolePrincipal("admin", ConsoleRole.ADMIN, true, false));
        assertTrue(it.preHandle(stubRequest("POST", "/internal/es/index/cluster/raw", ""),
                new StubResponse().proxy, null));
    }
    /* 1132：非 ADMIN 探测系统管理域（账号库/连接档案/重绑）必须留痕。
       这是攻击者最常试的一类高价值端点，此前直接 deny、不落审计——
       「有人试过但事后查不到」。 */
    @Test
    public void 非ADMIN探测系统管理域被拒且落审计() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(
                delegatedAs(ConsoleRole.OPERATOR,
                        new java.util.HashSet<>(java.util.Arrays.asList("conn:host:w:security"))),
                true, audit);
        StubResponse resp = new StubResponse();
        /* 用真正的系统管理域端点（/clusters/ 在 SYSTEM_ADMIN_KEYWORDS 里）：
           /auth/users 反而走页面门（security 页写键），演示不到这条分支。 */
        boolean ok = it.preHandle(stubRequest("POST", "/internal/es/index/clusters/save", ""),
                resp.proxy, null);
        assertFalse("非 ADMIN 不得触达连接档案", ok);
        assertEquals(403, resp.status);
        assertNotNull("越权尝试必须落审计", audit.last);
        assertEquals("ADMIN_DENIED", audit.action);
        assertEquals("/internal/es/index/clusters/save", audit.uri);
    }
}
