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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 1132：委派超管越权建号的端到端链路证明（拦截器 + 控制器 + 真实 service）。
 *
 * <p>产线实账（1.0.67）：{@code deng_test_x2} = {@code role=ADMIN + delegated=true +
 * authSource=delegate}，对 {@code POST /auth/users/upsert} 传空用户名返回
 * 「username 不可为空」——说明请求<b>已经越过权限门</b>进到参数校验，换合法用户名即可建号，
 * 等于在宿主授权体系之外另造一个不受宿主管控的全局身份。</p>
 *
 * <p>本测试把「拦截器裁决 + 控制器执行」串成一条真实链路：拦截器放行才会调用控制器，
 * 控制器放行才会碰到存储层（此处以抛 IOException 的桩表达「已到达存储」）。
 * 因此任何一条断言失败都能指出越权发生在哪一层，而不是笼统的「没报错」。</p>
 */
public class DelegatedAdminEscalation1132Test {

    /* ---------------- 桩设施（JDK 动态代理，与仓内既有测试同范式） ---------------- */

    private static HttpServletRequest request(String method, String uri, Map<String, Object> extraAttrs) {
        Map<String, Object> attrs = new HashMap<>(extraAttrs);
        Map<String, String> headers = new HashMap<>();
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
                DelegatedAdminEscalation1132Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    /** 记录响应的最小桩：只实现拦截器/控制器写响应体所需的方法。 */
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
                    case "getOutputStream": return outputStream();
                    case "getWriter": throw new UnsupportedOperationException("用 getOutputStream");
                    default: throw new UnsupportedOperationException(m.getName());
                }
            };
            this.proxy = (HttpServletResponse) Proxy.newProxyInstance(
                    DelegatedAdminEscalation1132Test.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, h);
        }

        private ServletOutputStream outputStream() {
            return new ServletOutputStream() {
                @Override public boolean isReady() { return true; }
                @Override public void setWriteListener(WriteListener l) { }
                @Override public void write(int b) { body.write(b); }
            };
        }

        String text() { return new String(body.toByteArray(), StandardCharsets.UTF_8); }
    }

    private static ConnStore emptyStore() {
        return new ConnStore() {
            @Override public java.util.List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) { throw new UnsupportedOperationException(); }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    /** 委派超管：产线 x2 的形态（ADMIN + delegated + 非空 grantedPages）。 */
    private static ConsolePrincipal delegatedAdmin() {
        Set<String> gp = new HashSet<>();
        gp.add("conn:host:security");
        gp.add("conn:host:w:security");
        return new ConsolePrincipal("deng_test_x2", ConsoleRole.ADMIN, false, true,
                "宿主超管", null, gp);
    }

    /**
     * 跑一条真实链路：拦截器先裁决，放行则调用控制器。
     *
     * @return 若拦截器拒绝则返回 null（请求未到达控制器）；否则返回控制器结果
     */
    private static String runChain(ConsolePrincipal who, String uri, Map<String, String> body) throws Exception {
        ConnStore store = emptyStore();
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConsoleOpsAuditStore audit = new CapturingAuditStore();
        ConsoleAuthInterceptor it = new ConsoleAuthInterceptor(
                req -> who, audit, resolver, ConsolePageCatalog.load(), true,
                new EnvPagesResolver(store, new ESQueryStudioElasticsearchProperties()), store);

        /* 同一个 request 对象贯穿拦截器与控制器：拦截器把 principal 写进 attribute，
           控制器再从同一个 attribute 读——分两次 new 会让桩各持一份 attrs，链路就断了 */
        HttpServletRequest req = request("POST", uri, new HashMap<>());
        StubResponse resp = new StubResponse();
        boolean allowed = it.preHandle(req, resp.proxy, null);
        if (!allowed) {
            assertEquals("拦截器拒绝必须以 403 落地", 403, resp.status);
            return null;
        }
        ConsoleAuthController c = new ConsoleAuthController(realService(), audit,
                ConsolePageCatalog.load(), true);
        c.upsertUser(req, body);
        return "controller-returned";
    }

    /**
     * 真实 service 实例（不覆盖任何方法）——守卫与流程全走生产代码。
     *
     * <p>客户端 supplier 返回 null：一旦流程真的走到存储层，{@code perform} 会抛异常，
     * 那正是「门没拦住」的信号。此前用「覆盖 upsertUser 直接抛」的桩是错的——它把
     * {@code forbidDelegatedLocalUserWrite}（方法第一行）一并绕过了，测出来的永远是
     * 「到达存储」，无法区分门有没有生效。</p>
     */
    private static BuiltinConsoleAuthService realService() {
        return new BuiltinConsoleAuthService(
                () -> null, "esquerystudio_users", "admin", "admin-pw", 3600_000L, "test-secret", true);
    }

    /** 只记内存的审计口（接口是 record + search 两个方法）。 */
    static class CapturingAuditStore implements ConsoleOpsAuditStore {
        final java.util.List<ConsoleOpsAuditEvent> events = new java.util.ArrayList<>();
        @Override public void record(ConsoleOpsAuditEvent e) { events.add(e); }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long since) {
            return java.util.Collections.emptyList();
        }
    }

    /* ---------------- 断言 ---------------- */

    /**
     * 分层说明（实测得出，2026-10）：拦截器<b>不</b>拦委派超管的用户管理写——
     * {@code isSystemAdminUri} 对 ADMIN 放行，而委派超管角色就是 ADMIN。
     * 真正的否决点在 {@code BuiltinConsoleAuthService.forbidDelegatedLocalUserWrite}。
     * 所以这里的断言是「请求必然在 service 层被 IllegalArgumentException 拒绝」，
     * 而不是「拦截器 403」——后者是错误预期，会把一个正常放行的链路判成漏洞。
     */
    @Test
    public void 委派超管建号被服务层拒绝_绝不触达存储() throws Exception {
        try {
            runChain(delegatedAdmin(), "/internal/es/index/auth/users/upsert",
                    new LinkedHashMap<>(java.util.Collections.singletonMap("username", "backdoor")));
            fail("委派超管越权建号：请求一路落到存储层（本地账号可在宿主体系外新建）");
        } catch (java.io.IOException e) {
            fail("请求已越过权限门进入存储层（门没拦住）：" + e.getMessage());
        } catch (IllegalArgumentException e) {
            String m = String.valueOf(e.getMessage());
            assertTrue("必须是委派/页面授权拒绝，而非参数校验。实际：" + m,
                    m.contains("委派") || m.contains("页面授权"));
        }
    }

    @Test
    public void 内置超管建号链路畅通_不被误拦() throws Exception {
        /* 防误拦：内置 ADMIN（非委派、grantedPages=null）是本地账号的合法管理者。
           桩没有存储层，因此「走到存储」以固定 IOException 表达——那是预期路径。 */
        ConsolePrincipal builtin = new ConsolePrincipal("root", ConsoleRole.ADMIN, true, false);
        /* 判定标准只有一条：**不得**是权限拒绝。真实 service 在没有 ES 客户端时会在
           存储接缝处以 NPE/IOException 崩掉，那是环境限制而非误拦，不能据此判失败。 */
        try {
            runChain(builtin, "/internal/es/index/auth/users/upsert",
                    new LinkedHashMap<>(java.util.Collections.singletonMap("username", "ok-user")));
        } catch (IllegalArgumentException e) {
            fail("内置 ADMIN 被权限门误拦：" + e.getMessage());
        } catch (RuntimeException | java.io.IOException e) {
            /* 已越过权限门、到达存储接缝（无 ES 客户端）——正是期望路径 */
        }
    }

    @Test
    public void 委派超管删除账号被服务层拒绝() throws Exception {
        ConnStore store = emptyStore();
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConsoleAuthInterceptor it = new ConsoleAuthInterceptor(
                req -> delegatedAdmin(), new CapturingAuditStore(), resolver,
                ConsolePageCatalog.load(), true,
                new EnvPagesResolver(store, new ESQueryStudioElasticsearchProperties()), store);
        HttpServletRequest req = request(
                "POST", "/internal/es/index/auth/users/delete?username=victim", new HashMap<>());
        StubResponse resp = new StubResponse();
        /* 拦截器对 ADMIN 的 user 管理端点放行（设计如此），否决在服务层 */
        it.preHandle(req, resp.proxy, null);

        ConsoleAuthController c = new ConsoleAuthController(realService(), new CapturingAuditStore(),
                ConsolePageCatalog.load(), true);
        try {
            c.deleteUser(req, "victim");
            fail("委派超管删除账号未被拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue("必须是委派拒绝，实际：" + e.getMessage(),
                    String.valueOf(e.getMessage()).contains("委派"));
        }
    }
}
