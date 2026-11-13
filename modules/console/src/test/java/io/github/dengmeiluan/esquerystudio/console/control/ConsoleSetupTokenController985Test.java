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

package io.github.dengmeiluan.esquerystudio.console.control;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import org.junit.Test;
import org.springframework.http.ResponseEntity;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 985：首连令牌在控制器层真正生效（未绑定 + 无委托时缺/错令牌 → 403）。 */
public class ConsoleSetupTokenController985Test {

    private static final ConsoleOpsAuditStore NOOP_AUDIT = new ConsoleOpsAuditStore() {
        @Override public void record(ConsoleOpsAuditEvent event) { }
        @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    };

    private static ControlClusterResolver unboundResolver() {
        return new ControlClusterResolver(null, null, null, null, null, "none") {
            @Override public boolean bound() { return false; }
            @Override public Mode mode() { return Mode.NONE; }
            @Override public String endpoint() { return ""; }
        };
    }

    private static ConsoleSetupController controller(String token,
            io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthDelegate delegate) {
        return new ConsoleSetupController(unboundResolver(), null, NOOP_AUDIT, delegate,
                "app", true, true, token);
    }

    private static HttpServletRequest requestWithToken(String token) {
        return requestWithToken(token, "127.0.0.1");
    }

    private static HttpServletRequest requestWithToken(String token, String remoteAddr) {
        InvocationHandler h = (proxy, m, args) -> {
            if ("getHeader".equals(m.getName()) && "X-Setup-Token".equals(args[0])) return token;
            if ("getRemoteAddr".equals(m.getName())) return remoteAddr;
            Class<?> rt = m.getReturnType();
            return rt == boolean.class ? false : rt == int.class ? 0 : null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleSetupTokenController985Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static Map<String, String> connBody() {
        Map<String, String> b = new LinkedHashMap<>();
        b.put("url", "http://es:9200");
        return b;
    }

    @SuppressWarnings("unchecked")
    private static String code(ResponseEntity<Map<String, Object>> r) {
        return String.valueOf(r.getBody().get("code"));
    }

    @Test
    public void 配置令牌后status提示需要令牌() {
        Map<String, Object> status = controller("s3cret", null).status();
        assertEquals(Boolean.TRUE, status.get("setupTokenRequired"));
        assertFalse((Boolean) controller("", null).status().get("setupTokenRequired"));
    }

    @Test
    public void status区分鉴权执法与内置登录() {
        ConsoleSetupController custom = new ConsoleSetupController(unboundResolver(), null, NOOP_AUDIT,
                null, "app", true, true, false, "s3cret");
        Map<String, Object> status = custom.status();
        assertEquals(Boolean.TRUE, status.get("authEnabled"));
        assertEquals(Boolean.FALSE, status.get("builtinLogin"));

        ConsoleSetupController builtin = new ConsoleSetupController(unboundResolver(), null, NOOP_AUDIT,
                null, "app", true, true, true, "");
        assertEquals(Boolean.TRUE, builtin.status().get("builtinLogin"));
    }

    @Test
    public void 委托部署配置令牌后同样要求首连令牌() {
        /* 1003 反转：委托 header 模式的身份来自网关注入头（可伪造），单靠「认出 ADMIN」
           不足以为「把控制面指向哪个 ES」背书——配置了 setup-token 就必须携带（第二因子）。
           因此 status 必须如实报 true，前端才会显示令牌输入框。未配置时仍为 false（历史行为）。 */
        io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthDelegate delegate = request -> null;
        assertEquals(Boolean.TRUE, controller("s3cret", delegate).status().get("setupTokenRequired"));
        assertFalse((Boolean) controller("", delegate).status().get("setupTokenRequired"));
    }

    @Test
    public void 未绑定且配置令牌时缺失或错误令牌拒绝test与apply() {
        ConsoleSetupController c = controller("s3cret", null);
        assertEquals("SETUP_TOKEN_REQUIRED", code(c.test(connBody(), requestWithToken(null))));
        assertEquals("SETUP_TOKEN_REQUIRED", code(c.test(connBody(), requestWithToken("bad"))));
        assertEquals("SETUP_TOKEN_REQUIRED", code(c.apply(connBody(), requestWithToken(null))));
        assertEquals("SETUP_TOKEN_REQUIRED", code(c.apply(connBody(), requestWithToken("bad"))));
    }

    @Test
    public void 未配置令牌时保持本机首连行为不被令牌门拦住() {
        ConsoleSetupController c = controller("", null);
        /* 走完令牌门后才会触达 probe/bind；clientFactory=null 会抛错，说明不是被令牌门 403。 */
        try {
            c.test(connBody(), requestWithToken(null));
            // probe 正常返回也可接受
        } catch (RuntimeException e) {
            assertFalse("不应被令牌门拒绝", String.valueOf(e.getMessage()).contains("SETUP_TOKEN"));
        }
    }

    @Test
    public void 未配置令牌时公网匿名首连必须拒绝() {
        ConsoleSetupController c = controller("", null);
        assertEquals("SETUP_LOCAL_ONLY", code(c.test(connBody(),
                requestWithToken(null, "203.0.113.8"))));
        assertEquals("SETUP_LOCAL_ONLY", code(c.apply(connBody(),
                requestWithToken(null, "203.0.113.8"))));
        /* 配置令牌后公网可初始化（X-Forwarded-For 不参与判定，直连地址仍是公网）。 */
        assertEquals("SETUP_TOKEN_REQUIRED", code(controller("s3cret", null)
                .test(connBody(), requestWithToken("bad", "203.0.113.8"))));
    }
}
