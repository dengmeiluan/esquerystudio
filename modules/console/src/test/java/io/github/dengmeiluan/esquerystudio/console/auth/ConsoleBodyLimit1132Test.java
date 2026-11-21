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
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 1132：写请求体积上限必须**真的能拦住**，且不可被 chunked 绕过。
 *
 * <p>背景：拦截器对「带 body 的写请求」设了 32MB 上限，挡的是「认证用户 POST 数百 MB
 * JSON 被 Jackson 全量读入」的内存耗尽面。但判据只有
 * {@code request.getContentLengthLong()}，而 **chunked transfer-encoding 不带
 * Content-Length**（容器返回 -1），于是同一条限制对分块传输完全失效——
 * 攻击者换一个传输编码就能捅进任意体积。</p>
 *
 * <p>本类同时钉住两件事：</p>
 * <ol>
 *   <li>规则在已知长度的超限请求上生效（此前**没有任何测试**覆盖这 20 行）；</li>
 *   <li>长度未知（-1 / chunked）时同样拒绝或封顶，不能因为「不知道多大」就放行。</li>
 * </ol>
 */
public class ConsoleBodyLimit1132Test {

    private static HttpServletRequest request(String method, String uri, long contentLength) {
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
                case "getHeader": return null;
                case "getRemoteAddr": return "10.1.2.3";
                case "getContentLengthLong": return contentLength;
                case "getContentLength": return contentLength > Integer.MAX_VALUE ? -1 : (int) contentLength;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleBodyLimit1132Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    static class StubResponse {
        int status = 200;
        final ByteArrayOutputStream body = new ByteArrayOutputStream();
        final HttpServletResponse proxy;

        StubResponse() {
            InvocationHandler h = (proxy, m, args) -> {
                switch (m.getName()) {
                    case "setStatus": status = (Integer) args[0]; return null;
                    case "sendError": status = (Integer) args[0]; return null;
                    case "getStatus": return status;
                    case "setContentType": case "setCharacterEncoding": return null;
                    case "getOutputStream": return new ServletOutputStream() {
                        @Override public boolean isReady() { return true; }
                        @Override public void setWriteListener(WriteListener l) { }
                        @Override public void write(int b) { body.write(b); }
                    };
                    default: throw new UnsupportedOperationException(m.getName());
                }
            };
            this.proxy = (HttpServletResponse) Proxy.newProxyInstance(
                    ConsoleBodyLimit1132Test.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }

        String text() { return new String(body.toByteArray(), StandardCharsets.UTF_8); }
    }

    private static ConsoleOpsAuditStore noopAudit() {
        return new ConsoleOpsAuditStore() {
            @Override public void record(ConsoleOpsAuditEvent e) { }
            @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long since) {
                return Collections.emptyList();
            }
        };
    }

    private static ConsoleAuthInterceptor interceptor() {
        Set<String> gp = new HashSet<>();
        gp.add("conn:host:w:rest");
        gp.add("conn:host:rest");
        ConsolePrincipal admin = new ConsolePrincipal("root", ConsoleRole.ADMIN, false, true,
                "超管", null, gp);
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore store = new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer c, Integer s, String env) { throw new UnsupportedOperationException(); }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        return new ConsoleAuthInterceptor(req -> admin, noopAudit(), resolver,
                ConsolePageCatalog.load(), true, new EnvPagesResolver(store, new ESQueryStudioElasticsearchProperties()), store);
    }

    @Test
    public void 超限请求体被413拒绝() throws Exception {
        ConsoleAuthInterceptor it = interceptor();
        StubResponse resp = new StubResponse();
        boolean ok = it.preHandle(request("POST", "/internal/es/index/cluster/raw", 33L * 1024 * 1024),
                resp.proxy, null);
        assertTrue("超限写请求必须被拒", !ok);
        assertEquals(413, resp.status);
        assertTrue("拒绝语义要说清上限：" + resp.text(), resp.text().contains("BODY_TOO_LARGE"));
    }

    @Test
    public void 未超限请求体放行() throws Exception {
        /* 防误拦：正常大小的写请求不得被体积门挡住 */
        ConsoleAuthInterceptor it = interceptor();
        StubResponse resp = new StubResponse();
        it.preHandle(request("POST", "/internal/es/index/cluster/raw", 1024L), resp.proxy, null);
        assertTrue("正常体积不应返回 413", resp.status != 413);
    }

    /**
     * chunked（无 Content-Length，容器返回 -1）不得绕过上限。
     *
     * <p>这是本条限制最容易被绕开的形态：判据只看 Content-Length，分块传输时它是 -1，
     * 于是任意体积都放行。正确做法是「长度未知 = 不可信」，要么拒绝、要么在下游按流式
     * 读取封顶——绝不能当作「没超限」。</p>
     */
    @Test
    public void chunked无长度不得绕过体积上限() throws Exception {
        ConsoleAuthInterceptor it = interceptor();
        StubResponse resp = new StubResponse();
        it.preHandle(request("POST", "/internal/es/index/cluster/raw", -1L), resp.proxy, null);
        assertTrue("长度未知（chunked）的写请求必须被拦（实际 status=" + resp.status + "）",
                resp.status == 413 || resp.status == 411);
    }

    @Test
    public void GET请求不受体积门影响() throws Exception {
        /* 防误拦：读请求不带 body，即便容器报 -1 也不能触发体积门 */
        ConsoleAuthInterceptor it = interceptor();
        StubResponse resp = new StubResponse();
        it.preHandle(request("GET", "/internal/es/index/overview", -1L), resp.proxy, null);
        assertTrue("GET 不该因体积被判 413", resp.status != 413);
    }
}
