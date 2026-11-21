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

import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 路径归一化 / 白名单精确匹配回归钉：
 * {@code /auth/login/../users/upsert} 曾借白名单 {@code contains} 短路鉴权（VIEWER 直取用户管理），
 * {@code %2e%2e}、重复斜杠、反斜杠等变形路径必须在授权判定前折叠或 fail-closed。
 */
public class ConsoleAuthInterceptorPathCanonicalTest {

    private static HttpServletRequest stubRequest(String uri) {
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": return "";
                case "getServletPath": return "";
                case "getPathInfo": return null;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthInterceptorPathCanonicalTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    @Test
    public void 点点段被折叠_登录路径不再能借白名单跳到用户管理() {
        assertEquals("/internal/es/index/auth/users/upsert",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/auth/login/../users/upsert")));
    }

    @Test
    public void 编码的点点段同样折叠() {
        assertEquals("/internal/es/index/auth/users/upsert",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/auth/login/%2e%2e/users/upsert")));
    }

    @Test
    public void 重复斜杠折叠为单斜杠() {
        assertEquals("/internal/es/index/cluster/raw",
                ConsoleAuthInterceptor.normalizePath(stubRequest("/internal/es/index/cluster//raw")));
    }

    @Test
    public void 分号矩阵参数无论字面还是编码都剥离() {
        assertEquals("/internal/es/index/auth/users/upsert",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/auth/users/upsert;jsp=1")));
        assertEquals("/internal/es/index/auth/users/upsert",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/auth/users/upsert%3Bjsp=1")));
    }

    /* ══ 后缀模式匹配绕过（984）：Spring 5.x useSuffixPatternMatch 把 /cluster/doc.json
       路由到 cluster/doc handler，但页面门按严格段边界会失配 → 落角色门 VIEWER 放行。
       授权口径必须剥掉末段扩展名，与真实路由语义对齐。 ══ */

    @Test
    public void 末段扩展名被剥离_后缀路由不再绕过页面门() {
        assertEquals("/internal/es/index/cluster/doc",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/cluster/doc.json")));
        assertEquals("/internal/es/index/cluster/index-settings",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/cluster/index-settings.json")));
        /* 多段后缀同属一个 pattern+"*" 命中，必须整段剥掉而非只剥最后一段 */
        assertEquals("/internal/es/index/cluster/doc",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/cluster/doc.a.b")));
    }

    @Test
    public void 真实带点端点剥后缀后仍落在同一授权归属() {
        assertEquals("/internal/es/index/desired-state",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/desired-state.html")));
    }

    @Test
    public void 剥后缀后为空段则fail_closed() {
        assertNull(" /.json 剥完只剩 /：不是合法端点形态，必须拒绝",
                ConsoleAuthInterceptor.normalizePath(stubRequest("/.json")));
    }

    @Test
    public void 无扩展名路径逐字节不变() {
        assertEquals("/internal/es/index/cluster/sql/query",
                ConsoleAuthInterceptor.normalizePath(
                        stubRequest("/internal/es/index/cluster/sql/query")));
    }

    @Test
    public void 点点越过根_failClosed() {
        assertNull(ConsoleAuthInterceptor.normalizePath(stubRequest("/../../x")));
        assertNull(ConsoleAuthInterceptor.normalizePath(stubRequest("/a/../../x")));
    }

    @Test
    public void 反斜杠与NUL_failClosed() {
        assertNull(ConsoleAuthInterceptor.normalizePath(
                stubRequest("/internal/es/index\\auth\\login")));
        assertNull(ConsoleAuthInterceptor.normalizePath(
                stubRequest("/internal/es/index/auth/\u0000login")));
    }

    @Test
    public void 根路径归一为单斜杠() {
        assertEquals("/", ConsoleAuthInterceptor.normalizePath(stubRequest("/")));
    }

    @Test
    public void 白名单仅精确路径命中() {
        assertTrue(ConsoleAuthInterceptor.isWhitelisted("/internal/es/index/auth/login"));
        assertTrue(ConsoleAuthInterceptor.isWhitelisted("/internal/es/index/setup/status"));
        assertFalse("未归一化的穿越路径不得命中白名单",
                ConsoleAuthInterceptor.isWhitelisted(
                        "/internal/es/index/auth/login/../users/upsert"));
        assertFalse("前缀/后缀变形不得命中白名单",
                ConsoleAuthInterceptor.isWhitelisted("/x/internal/es/index/auth/login"));
        assertFalse(ConsoleAuthInterceptor.isWhitelisted("/internal/es/index/auth/login/extra"));
        assertFalse(ConsoleAuthInterceptor.isWhitelisted(null));
    }
}
