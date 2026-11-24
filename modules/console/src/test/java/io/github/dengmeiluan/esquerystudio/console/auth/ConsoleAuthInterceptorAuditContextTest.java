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
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 审计上下文采集单测——PAGE_DENIED/WRITE/HIGH_RISK 落档必须携带
 * 所属集群（connId/connName）、来源 IP（XFF 首跳）、耗时；高危 raw 透传 detail 带
 * 端点回填的执行摘要（产线权限审计定案：1049 条 raw 零法证 → 谁对哪个集群执行了什么）。
 */
public class ConsoleAuthInterceptorAuditContextTest {

    /* ---------------- 桩设施（JDK 动态代理，仓内无 mockito/spring-test） ---------------- */

    private static HttpServletRequest stubRequest(String method, String uri, Map<String, String> headers,
                                                  Map<String, Object> presetAttrs) {
        return stubRequestFrom(method, uri, headers, presetAttrs, "127.0.0.1");
    }

    private static HttpServletRequest stubRequestFrom(String method, String uri, Map<String, String> headers,
                                                      Map<String, Object> presetAttrs, String remoteAddr) {
        Map<String, Object> attrs = new HashMap<>();
        if (presetAttrs != null) {
            attrs.putAll(presetAttrs);
        }
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
                case "getHeader": return headers.get(args[0]);
                case "getRemoteAddr": return remoteAddr;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthInterceptorAuditContextTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static class StubResponse {
        final HttpServletResponse proxy;

        StubResponse(int status) {
            final int[] statusBox = {status};
            InvocationHandler h = (p, m, args) -> {
                switch (m.getName()) {
                    case "setStatus": statusBox[0] = (Integer) args[0]; return null;
                    case "getStatus": return statusBox[0];
                    case "setContentType": case "setCharacterEncoding": return null;
                    case "getOutputStream":
                        return new ServletOutputStream() {
                            @Override public void write(int b) { }
                            @Override public boolean isReady() { return true; }
                            @Override public void setWriteListener(WriteListener l) { }
                        };
                    default: throw new UnsupportedOperationException(m.getName());
                }
            };
            proxy = (HttpServletResponse) Proxy.newProxyInstance(
                    ConsoleAuthInterceptorAuditContextTest.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }
    }

    /** 事件捕获桩。 */
    private static class CapturingAudit implements ConsoleOpsAuditStore {
        ConsoleOpsAuditEvent last;
        @Override public void record(ConsoleOpsAuditEvent event) { this.last = event; }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    /** 连接档案桩：3556353a → 腾讯云UAT。 */
    private static ConnStore connStoreStub() {
        return new ConnStore() {
            @Override public java.util.List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) {
                return "3556353a".equals(id) ? "腾讯云UAT" : null;
            }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static ConsoleAuthInterceptor interceptor(CapturingAudit audit) {
        EsConsoleAuthorizer authorizer = req -> new ConsolePrincipal(
                "fs_ou_x1", ConsoleRole.VIEWER, false, true, "李旭升", null,
                new HashSet<>(Collections.singletonList("adhoc-rebuild")));
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore stubStore = connStoreStub();
        EnvPagesResolver envPagesResolver = new EnvPagesResolver(stubStore, new ESQueryStudioElasticsearchProperties());
        return new ConsoleAuthInterceptor(authorizer, audit, resolver, ConsolePageCatalog.load(),
                true, envPagesResolver, stubStore);
    }

    @Test
    public void PAGE_DENIED落档带目标集群实名与XFF首跳来源IP() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Target", "3556353a");
        headers.put("X-Forwarded-For", "203.0.113.9, 10.0.0.1");
        it.preHandle(stubRequest("POST", "/internal/es/index/cluster/delete-index", headers, null),
                new StubResponse(403).proxy, null);

        assertNotNull("页面被拒必须落审计", audit.last);
        assertEquals("PAGE_DENIED", audit.last.getAction());
        assertEquals("3556353a", audit.last.getConnId());
        assertEquals("腾讯云UAT", audit.last.getConnName());
        assertEquals("XFF 首跳必须取为来源 IP", "203.0.113.9", audit.last.getIp());
        assertEquals("page=indices", audit.last.getDetail());
        assertNotNull("耗时维度必须落档", audit.last.getCostMs());
    }

    @Test
    public void 公网直连伪造XFF不得改写审计来源IP() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Target", "3556353a");
        headers.put("X-Forwarded-For", "203.0.113.9");
        headers.put("X-Real-IP", "203.0.113.10");
        it.preHandle(stubRequestFrom("POST", "/internal/es/index/cluster/delete-index",
                        headers, null, "198.51.100.7"),
                new StubResponse(403).proxy, null);
        assertNotNull(audit.last);
        assertEquals("公网直连必须采 remoteAddr，不采可伪造的转发头",
                "198.51.100.7", audit.last.getIp());
    }

    @Test
    public void 宿主专属端点带远端目标头仍记宿主审计() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Target", "3556353a");
        it.preHandle(stubRequest("GET", "/internal/es/index/overview", headers, null),
                new StubResponse(403).proxy, null);

        assertNotNull(audit.last);
        assertNull("宿主专属端点不得记到远端连接账上", audit.last.getConnId());
        assertNull(audit.last.getConnName());
    }

    @Test
    public void 无目标头的拒绝记录connId为空_ip回退remoteAddr() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        it.preHandle(stubRequestFrom("GET", "/internal/es/index/overview", new HashMap<>(), null,
                        "192.0.2.1"), new StubResponse(403).proxy, null);

        assertNotNull(audit.last);
        assertNull("host/空目标头不得伪装成连接维度", audit.last.getConnId());
        assertNull(audit.last.getConnName());
        assertEquals("无代理头时回退 remoteAddr", "192.0.2.1", audit.last.getIp());
    }

    @Test
    public void 高危raw透传的afterCompletion落档带执行摘要与耗时() {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, new ConsolePrincipal(
                "fs_ou_admin", ConsoleRole.ADMIN, false, true, "测试用户", null, null));
        attrs.put(ConsoleAuthInterceptor.ATTR_START_MS, System.currentTimeMillis() - 42);
        attrs.put(ConsoleAuthInterceptor.ATTR_RAW_SUMMARY, "POST /idx/_delete");

        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Target", "837a33d7");
        it.afterCompletion(stubRequest("POST", "/internal/es/index/cluster/raw", headers, attrs),
                new StubResponse(200).proxy, null, null);

        assertNotNull(audit.last);
        assertEquals("HIGH_RISK", audit.last.getAction());
        assertEquals("raw=POST /idx/_delete", audit.last.getDetail());
        assertEquals("837a33d7", audit.last.getConnId());
        assertTrue("耗时 ≥ 42ms（桩起点回拨）", audit.last.getCostMs() >= 42);
    }

    @Test
    public void afterCompletion异常路径detail带err且raw摘要共存() {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, new ConsolePrincipal(
                "fs_ou_admin", ConsoleRole.ADMIN, false, true, "测试用户", null, null));
        attrs.put(ConsoleAuthInterceptor.ATTR_START_MS, System.currentTimeMillis());
        attrs.put(ConsoleAuthInterceptor.ATTR_RAW_SUMMARY, "DELETE /idx-001");
        it.afterCompletion(stubRequest("POST", "/internal/es/index/cluster/raw", new HashMap<>(), attrs),
                new StubResponse(500).proxy, null, new RuntimeException("boom(桩)"));

        assertNotNull(audit.last);
        assertTrue("raw 摘要与异常信息须共存于 detail：" + audit.last.getDetail(),
                audit.last.getDetail().contains("raw=DELETE /idx-001")
                        && audit.last.getDetail().contains("err=boom(桩)"));
        assertEquals(500, audit.last.getHttpStatus());
    }

    /* ---------------- 1132：破坏性/控制面写必须落 HIGH_RISK ----------------
       rebuild-empty 删索引后重建（数据不可逆）；adhoc confirm-switch 把写别名切到新索引
       （流量归属切换）。两者此前只记 WRITE，与 delete-index / xmigrate/start 的危害同级
       却低一档留痕——审计复盘时看不出这两步是不可逆的。 */
    @Test
    public void 删索引重建落HIGH_RISK审计() {
        assertEquals("HIGH_RISK", actionOf("POST", "/internal/es/index/rebuild-empty"));
    }

    @Test
    public void 托管重建切写别名落HIGH_RISK审计() {
        assertEquals("HIGH_RISK",
                actionOf("POST", "/internal/es/index/adhoc-rebuild/confirm-switch"));
    }

    @Test
    public void 普通写仍落WRITE不被过度标记() {
        /* 防过度标记：把只读语义/低危写也抬成 HIGH_RISK 会让高危面失去区分度 */
        assertEquals("WRITE", actionOf("POST", "/internal/es/index/cluster/update-settings"));
        assertEquals("WRITE", actionOf("POST", "/internal/es/index/adhoc-rebuild/abort"));
    }

    private String actionOf(String method, String uri) {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, new ConsolePrincipal(
                "fs_ou_admin", ConsoleRole.ADMIN, false, true, "测试用户", null, null));
        attrs.put(ConsoleAuthInterceptor.ATTR_START_MS, System.currentTimeMillis());
        it.afterCompletion(stubRequest(method, uri, new HashMap<>(), attrs),
                new StubResponse(200).proxy, null, null);
        assertNotNull("未落审计：", audit.last);
        return audit.last.getAction();
    }

    /* ---------------- ：执行类只读 POST 落 EXEC 审计（可审计补全） ----------------
       analyze/reindex 预估/config-lab dry-run 这类「零数据写入但消耗集群资源/执行脚本」的
       只读 POST 须留痕。painless 已升写档，不再走 EXEC 分支（下方独立用例锁 WRITE）。 */    @Test
    public void painless执行升写档后仍可追溯_落WRITE审计() {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, new ConsolePrincipal(
                "fs_ou_x1", ConsoleRole.VIEWER, false, true, "李旭升", null, null));
        attrs.put(ConsoleAuthInterceptor.ATTR_START_MS, System.currentTimeMillis() - 7);
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Target", "c1");
        it.afterCompletion(stubRequest("POST", "/internal/es/index/cluster/painless/execute", headers, attrs),
                new StubResponse(200).proxy, null, null);
        assertNotNull("painless 执行必须留痕", audit.last);
        assertEquals("WRITE", audit.last.getAction());
        assertEquals("c1", audit.last.getConnId());
    }

    @Test
    public void 普通只读查询POST不落审计_零噪音保持() {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Es-Target", "c1");
        it.afterCompletion(stubRequest("POST", "/internal/es/index/cluster/query", headers, attrs()),
                new StubResponse(200).proxy, null, null);
        assertNull("普通只读查询不落审计（噪音纪律）", audit.last);
    }

    private static Map<String, Object> attrs() {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, new ConsolePrincipal(
                "fs_ou_x1", ConsoleRole.VIEWER, false, true, "李旭升", null, null));
        attrs.put(ConsoleAuthInterceptor.ATTR_START_MS, System.currentTimeMillis());
        return attrs;
    }
}
