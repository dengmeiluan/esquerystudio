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
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 批次 1003：跨站写（CSRF）防护 + 审计来源 IP 的受信代理收窄。
 *
 * <p>为什么需要：委托 header 模式下身份来自「网关注入头 + 浏览器自动携带的宿主 cookie」，
 * 跨站表单 POST（simple request，不触发 CORS 预检）能借用户身份完成写操作——abort 迁移、
 * 取消任务、删账号都是 {@code @RequestParam} 形态，一个 {@code <form>} 即可。控制台此前
 * 对 Origin/Referer/Sec-Fetch-Site 零处理（全仓 0 命中）。</p>
 *
 * <p>判据只用浏览器强制写入、页面 JS 不可伪造的 {@code Sec-Fetch-Site}：cross-site → 拒；
 * same-origin / same-site / none / 缺省（curl/SDK）→ 放行。只拒 cross-site 是刻意设计：
 * 宿主页与 console 不同子域的同站集成不能被误伤。</p>
 */
public class CsrfGuard1003Test {

    private static final String WRITE_PATH = "/internal/es/index/cluster/bulk";

    /* ---------------- 桩 ---------------- */

    private static HttpServletRequest request(String method, String uri, Map<String, String> headers,
                                              String remoteAddr) {
        Map<String, Object> attrs = new HashMap<>();
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return "";
                case "getServletPath": return "";
                case "getPathInfo": return null;
                case "getMethod": return method;
                case "getQueryString": return null;
                case "getContentLengthLong": return 0L;
                case "getAttribute": return attrs.get(args[0]);
                case "setAttribute": attrs.put((String) args[0], args[1]); return null;
                case "getHeader": return headers == null ? null : headers.get((String) args[0]);
                case "getRemoteAddr": return remoteAddr == null ? "10.1.2.3" : remoteAddr;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                CsrfGuard1003Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

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
                    CsrfGuard1003Test.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }

        String bodyText() { return new String(body.toByteArray(), StandardCharsets.UTF_8); }
    }

    private static class CapturingAudit implements ConsoleOpsAuditStore {
        String action; int httpStatus; String uri;
        @Override public void record(ConsoleOpsAuditEvent event) {
            this.uri = event.getUri(); this.action = event.getAction(); this.httpStatus = event.getHttpStatus();
        }
        @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    private static ConsoleAuthInterceptor interceptor(List<String> trustedProxies, ConsoleOpsAuditStore audit) {
        Set<String> pages = new HashSet<>(Arrays.asList(
                "conn:c1:bulk", "conn:c1:w:bulk", "conn:c1:overview", "conn:c1:w:overview"));
        ConsolePrincipal principal = new ConsolePrincipal("host-u1", ConsoleRole.OPERATOR,
                false, true, "宿主用户", null, pages);
        EsConsoleAuthorizer authorizer = req -> principal;
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore stubStore = new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        EnvPagesResolver envPagesResolver = new EnvPagesResolver(stubStore, new ESQueryStudioElasticsearchProperties());
        return new ConsoleAuthInterceptor(authorizer, audit, resolver, ConsolePageCatalog.load(), true,
                envPagesResolver, stubStore, trustedProxies);
    }

    private static Map<String, String> site(String v) {
        Map<String, String> h = new HashMap<>();
        h.put("Sec-Fetch-Site", v);
        h.put("X-Es-Target", "c1");
        return h;
    }

    /* ---------------- 跨站写 ---------------- */

    @Test
    public void 跨站写请求被拒并留痕() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(Collections.emptyList(), audit);
        StubResponse resp = new StubResponse();
        boolean ok = it.preHandle(request("POST", WRITE_PATH, site("cross-site"), "10.1.2.3"), resp.proxy, null);
        assertFalse("cross-site 写必须拒绝", ok);
        assertEquals(403, resp.status);
        assertTrue("错误码要能让前端/运维识别", resp.bodyText().contains("CSRF_BLOCKED"));
        assertEquals("CSRF_BLOCKED", audit.action);
        assertEquals(403, audit.httpStatus);
    }

    @Test
    public void 同源与同站写请求照常放行_不误拦有权限的人() throws Exception {
        for (String s : new String[]{"same-origin", "same-site", "none"}) {
            ConsoleAuthInterceptor it = interceptor(Collections.emptyList(), new CapturingAudit());
            StubResponse resp = new StubResponse();
            assertTrue("Sec-Fetch-Site=" + s + " 不得被 CSRF 门拦",
                    it.preHandle(request("POST", WRITE_PATH, site(s), "10.1.2.3"), resp.proxy, null));
        }
        /* 缺省（curl/SDK/服务间调用）同样放行：CSRF 只可能由浏览器页面发起 */
        ConsoleAuthInterceptor it = interceptor(Collections.emptyList(), new CapturingAudit());
        Map<String, String> noFetch = new HashMap<>();
        noFetch.put("X-Es-Target", "c1");
        assertTrue(it.preHandle(request("POST", WRITE_PATH, noFetch, "10.1.2.3"), new StubResponse().proxy, null));
    }

    @Test
    public void 跨站读请求不受影响() throws Exception {
        ConsoleAuthInterceptor it = interceptor(Collections.emptyList(), new CapturingAudit());
        /* 读端点：cross-site GET 不该被 CSRF 门拦（读不是状态变更；且浏览器的跨站 GET 无副作用） */
        assertTrue(it.preHandle(request("GET", "/internal/es/index/overview", site("cross-site"), "10.1.2.3"),
                new StubResponse().proxy, null));
    }

    @Test
    public void 跨站判定只看SecFetchSite() {
        assertTrue(ConsoleAuthInterceptor.crossSiteWrite(request("PUT", WRITE_PATH, site("cross-site"), null)));
        assertFalse(ConsoleAuthInterceptor.crossSiteWrite(request("PUT", WRITE_PATH, site("same-origin"), null)));
        assertFalse("GET 永不算跨站写",
                ConsoleAuthInterceptor.crossSiteWrite(request("GET", WRITE_PATH, site("cross-site"), null)));
        assertFalse("OPTIONS 预检必须放行",
                ConsoleAuthInterceptor.crossSiteWrite(request("OPTIONS", WRITE_PATH, site("cross-site"), null)));
        assertTrue("空白/大小写变体仍应判定为跨站（trim + equalsIgnoreCase）",
                ConsoleAuthInterceptor.crossSiteWrite(request("POST", WRITE_PATH, site(" Cross-Site "), null)));
    }

    /* ---------------- 审计来源 IP ---------------- */

    @Test
    public void 受信代理清单外不得借XFF改写来源() {
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Forwarded-For", "6.6.6.6");
        /* 直连方 10.0.0.2 是私网但不在清单内：视为终端本身，不得采信转发头 */
        assertEquals("10.0.0.2", ConsoleAuthInterceptor.clientIp(
                request("POST", WRITE_PATH, headers, "10.0.0.2"),
                Arrays.asList("10.8.0.0/16", "192.168.1.10")));
        /* 直连方命中清单：才采信转发链 */
        assertEquals("6.6.6.6", ConsoleAuthInterceptor.clientIp(
                request("POST", WRITE_PATH, headers, "10.8.0.5"),
                Arrays.asList("10.8.0.0/16")));
        /* 精确 IP 条目同样生效 */
        assertEquals("6.6.6.6", ConsoleAuthInterceptor.clientIp(
                request("POST", WRITE_PATH, headers, "192.168.1.10"),
                Arrays.asList("192.168.1.10")));
        /* 空清单=历史启发式（私网即代理）——既有部署行为不变 */
        assertEquals("6.6.6.6", ConsoleAuthInterceptor.clientIp(
                request("POST", WRITE_PATH, headers, "10.0.0.2"), Collections.emptyList()));
    }
}
