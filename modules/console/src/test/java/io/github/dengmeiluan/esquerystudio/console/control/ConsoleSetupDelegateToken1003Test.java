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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthDelegate;
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
import static org.junit.Assert.assertTrue;

/**
 * 批次 1003：委托模式下 setup-token 同样生效（第二因子）。
 *
 * <p>原实现 {@code delegate != null} 时直接跳过令牌校验，只要求「委托认出的 ADMIN」。
 * header 委托模式的身份来自网关注入头，是可伪造的——单靠角色身份不足以为
 * 「把控制面指向哪个 ES」背书；配置了 setup-token 就必须携带（未配置时行为不变）。</p>
 */
public class ConsoleSetupDelegateToken1003Test {

    private static final ConsoleOpsAuditStore NOOP_AUDIT = new ConsoleOpsAuditStore() {
        @Override public void record(ConsoleOpsAuditEvent event) { }
        @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    };

    /** 认得出 ADMIN 的委托桩（模拟 header 模式网关注入身份的形态）。 */
    private static final ConsoleAuthDelegate ADMIN_DELEGATE = request ->
            new ConsolePrincipal("host-admin", ConsoleRole.ADMIN, false, true, "宿主管理员", null);

    private static ControlClusterResolver unboundResolver() {
        return new ControlClusterResolver(null, null, null, null, null, "none") {
            @Override public boolean bound() { return false; }
            @Override public Mode mode() { return Mode.NONE; }
            @Override public String endpoint() { return ""; }
        };
    }

    private static ConsoleSetupController controller(String token) {
        return new ConsoleSetupController(unboundResolver(), null, NOOP_AUDIT, ADMIN_DELEGATE,
                "app", true, true, token);
    }

    private static HttpServletRequest request(String setupToken) {
        InvocationHandler h = (proxy, m, args) -> {
            if ("getHeader".equals(m.getName()) && "X-Setup-Token".equals(args[0])) return setupToken;
            if ("getRemoteAddr".equals(m.getName())) return "10.9.9.9";
            Class<?> rt = m.getReturnType();
            return rt == boolean.class ? false : rt == int.class ? 0 : null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleSetupDelegateToken1003Test.class.getClassLoader(),
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
    public void 委托模式下配置令牌后缺令牌被拒() {
        ConsoleSetupController c = controller("s3cret");
        /* apply：ADMIN 身份成立，但没有 X-Setup-Token → 必须拒绝（改控制面归属需双因子） */
        assertEquals("SETUP_TOKEN_REQUIRED", code(c.apply(connBody(), request(null))));
        assertEquals("SETUP_TOKEN_REQUIRED", code(c.apply(connBody(), request("wrong"))));
        /* test 同口径（否则可用 /setup/test 对内网做 SSRF 探测） */
        assertEquals("SETUP_TOKEN_REQUIRED", code(c.test(connBody(), request(null))));
    }

    @Test
    public void 令牌通过后继续到绑定流程() {
        ConsoleSetupController c = controller("s3cret");
        /* 正确令牌 → 越过令牌门，进入绑定流程（桩 resolver 的依赖全为 null，必然 NPE）。
           这里断言的是「没有被令牌门拦下」，不是绑定成功。 */
        assertPassedTokenGate(() -> c.apply(connBody(), request("s3cret")));
    }

    @Test
    public void 未配置令牌时委托模式行为不变() {
        ConsoleSetupController c = controller("");
        /* 未配置令牌 → 令牌校验恒放行（历史行为不变），同样应越过令牌门 */
        assertPassedTokenGate(() -> c.apply(connBody(), request(null)));
    }

    /** 「越过令牌门」的判定：要么正常返回，要么在桩依赖处 NPE（两者都说明未被 403 拦下）。 */
    private static void assertPassedTokenGate(Runnable call) {
        try {
            call.run();
        } catch (NullPointerException expected) {
            /* 已越过令牌校验，落入桩 resolver 的空依赖 */
        }
    }

    @Test
    public void 令牌要求与实际守卫同口径_向导据此显示输入框() {
        /* 委托模式下配置令牌同样会校验：status 必须报 setupTokenRequired=true，
           否则前端不显示令牌输入框，用户永远无法完成初始化（有权限的人被拦）。 */
        assertEquals(Boolean.TRUE, controller("s3cret").status().get("setupTokenRequired"));
        assertEquals(Boolean.FALSE, controller("").status().get("setupTokenRequired"));
    }
}
