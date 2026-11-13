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

import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/**
 * 20260922 快筛批：审计查询端点扩参——全维筛选参数 → 结构化查询对象的单点映射契约
 * （旧 since 参数兼容、mine 自助安全子集、username 服务端强制不可注入）。
 */
public class ConsoleAuthControllerOpsAuditFilterTest {

    /** 捕获桩：记录结构化查询入口收到的查询对象（新旧签名都收口到 query 方法）。 */
    private static final class CapturingStore implements ConsoleOpsAuditStore {
        final AtomicReference<ConsoleOpsAuditQuery> got = new AtomicReference<>();

        @Override public void record(ConsoleOpsAuditEvent event) { }

        @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            throw new UnsupportedOperationException("控制器应走结构化查询入口");
        }

        @Override public List<ConsoleOpsAuditEvent> search(ConsoleOpsAuditQuery query) {
            got.set(query);
            return Collections.emptyList();
        }
    }

    private static HttpServletRequest requestWith(ConsolePrincipal p) {
        InvocationHandler h = (proxy, m, args) -> {
            if ("getAttribute".equals(m.getName())
                    && ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0])) return p;
            Class<?> rt = m.getReturnType();
            return rt == boolean.class ? false : rt == int.class ? 0 : null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthControllerOpsAuditFilterTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsoleAuthController controller(ConsoleOpsAuditStore store) {
        BuiltinConsoleAuthService authService = new BuiltinConsoleAuthService(
                () -> null, "esquerystudio_user", "admin", "esquerystudio", 1000L, "s") {
            @Override public boolean hasAnyUser() { return true; }
        };
        return new ConsoleAuthController(authService, store, ConsolePageCatalog.load(), true);
    }

    @Test
    public void opsAudit_全维参数映射结构化查询对象() {
        CapturingStore store = new CapturingStore();
        controller(store).opsAudit(null, "u1", "HIGH_RISK", 33, 7, null, 111L, 222L,
                "7bdac680", "腾讯云QA", "ADMIN", "POST", 403, "console", "203.0.113.9",
                500L, "/internal/es", "页面被拒");
        ConsoleOpsAuditQuery q = store.got.get();
        assertEquals("u1", q.getUsername());
        assertEquals("HIGH_RISK", q.getAction());
        assertEquals(Long.valueOf(111L), q.getFromMs());
        assertEquals(Long.valueOf(222L), q.getToMs());
        assertEquals("7bdac680", q.getConnId());
        assertEquals("腾讯云QA", q.getConnName());
        assertEquals("ADMIN", q.getRole());
        assertEquals("POST", q.getMethod());
        assertEquals(Integer.valueOf(403), q.getHttpStatus());
        assertEquals("console", q.getSource());
        assertEquals("203.0.113.9", q.getIp());
        assertEquals(Long.valueOf(500L), q.getMinCostMs());
        assertEquals("/internal/es", q.getUriPrefix());
        assertEquals("页面被拒", q.getKw());
        assertEquals(33, q.getSize());
        assertEquals(7, q.getFrom());
    }

    /** 旧参数兼容：fromMs 未传时时间下界落 since（既有 URL/前端零破坏）。 */
    @Test
    public void opsAudit_since参数向后兼容_fromMs未传时生效() {
        CapturingStore store = new CapturingStore();
        controller(store).opsAudit(null, null, null, 100, 0, 333L, null, null,
                null, null, null, null, null, null, null, null, null, null);
        assertEquals(Long.valueOf(333L), store.got.get().getFromMs());
    }

    /** mine 自助：username 服务端强制（请求侧无此参数），安全子集维度下发。
     *  语义升格（裁决「观察口径按集群维度」）：补 connName 集群维度下推——
     *  自助面不再跨全部集群混排；username 强制与未传参数缺省语义不变。 */
    @Test
    public void opsAuditMine_username服务端强制_安全子集下发() {
        CapturingStore store = new CapturingStore();
        ConsolePrincipal viewer = new ConsolePrincipal("view_u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.emptySet());
        controller(store).opsAuditMine(requestWith(viewer), "WRITE", 50, 0, 444L, null, null,
                "POST", 200, 10L, "/internal/es", "kw词", null);
        ConsoleOpsAuditQuery q = store.got.get();
        assertEquals("view_u", q.getUsername());
        assertEquals("WRITE", q.getAction());
        assertEquals(Long.valueOf(444L), q.getFromMs());
        assertNull(q.getToMs());
        assertEquals("POST", q.getMethod());
        assertEquals(Integer.valueOf(200), q.getHttpStatus());
        assertEquals(Long.valueOf(10L), q.getMinCostMs());
        assertEquals("/internal/es", q.getUriPrefix());
        assertEquals("kw词", q.getKw());
        assertNull("mine 不下发集群维度（自助面只看自己的动作）", q.getConnId());
    }

    /** mine 集群维度下推（connName 精确过滤）——观察口径按集群；username 强制不受影响。 */
    @Test
    public void opsAuditMine_connName集群维度下推_观察口径按集群() {
        CapturingStore store = new CapturingStore();
        ConsolePrincipal viewer = new ConsolePrincipal("view_u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.emptySet());
        controller(store).opsAuditMine(requestWith(viewer), null, 50, 0, null, null, null,
                null, null, null, null, null, "腾讯云QA");
        ConsoleOpsAuditQuery q = store.got.get();
        assertEquals("腾讯云QA", q.getConnName());
        assertEquals("view_u", q.getUsername());
        assertNull("未传 connName 时保持 null（默认全集群）", q.getConnId());
    }
}
