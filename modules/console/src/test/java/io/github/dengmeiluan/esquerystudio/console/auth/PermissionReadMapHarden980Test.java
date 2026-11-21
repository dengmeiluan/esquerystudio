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
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 共享读归属与别名 add-only 的角色收口回归。 */
public class PermissionReadMapHarden980Test {

    @Test
    public void xmigrate进度按专属页放行且不再被通用progress吞掉() {
        List<String> pages = ConsoleAuthInterceptor.sharedReadPages("/internal/es/xmigrate/progress");
        assertTrue(pages != null && pages.contains("xmigrate"));
        assertFalse(pages.contains("search"));
    }

    @Test
    public void 宿主锁健康只对真实消费页面开放() {
        List<String> pages = ConsoleAuthInterceptor.sharedReadPages("/internal/es/index/health");
        assertTrue(pages != null && pages.contains("overview"));
        assertTrue(pages.contains("diag"));
        assertTrue(ConsoleAuthInterceptor.sharedReadPages("/internal/es/index/cluster/health-report")
                .contains("health-report"));
    }

    @Test
    public void 静态aliases读键与低角色不得解除addOnly() {
        Set<String> grants = new HashSet<>(Arrays.asList(
                "aliases", "conn:c1:w:config-validator"));
        ConsolePrincipal viewer = new ConsolePrincipal("viewer", ConsoleRole.VIEWER,
                false, true, "viewer", Collections.<String, String>emptyMap(), grants);
        assertTrue("静态 aliases 读键不能等于别名写权",
                ConsoleAuthInterceptor.aliasActionsAddOnly(request(viewer, "c1")));

        ConsolePrincipal rank3 = new ConsolePrincipal("ops", ConsoleRole.CLUSTER_OP,
                false, true, "ops", Collections.<String, String>emptyMap(), grants);
        assertFalse("静态 aliases + 写档角色才是完整别名写权",
                ConsoleAuthInterceptor.aliasActionsAddOnly(request(rank3, "c1")));
    }

    @Test
    public void 精确conn写键仍保持完整别名能力() {
        Set<String> grants = new HashSet<>(Arrays.asList(
                "conn:c1:w:aliases", "conn:c1:w:config-validator"));
        ConsolePrincipal viewer = new ConsolePrincipal("viewer", ConsoleRole.VIEWER,
                false, true, "viewer", Collections.<String, String>emptyMap(), grants);
        assertFalse(ConsoleAuthInterceptor.aliasActionsAddOnly(request(viewer, "c1")));
        /* preHandle 叠加 env 页模板收缩后的结论优先：即使 conn w:aliases 在场，环境模板
           排除了 aliases 页也必须回落 add-only。 */
        assertTrue(ConsoleAuthInterceptor.aliasActionsAddOnly(
                request(viewer, "c1", false)));
        assertFalse(ConsoleAuthInterceptor.aliasActionsAddOnly(
                request(viewer, "c1", true)));
    }

    private static HttpServletRequest request(ConsolePrincipal principal, String target) {
        return request(principal, target, null);
    }

    private static HttpServletRequest request(ConsolePrincipal principal, String target,
                                              Boolean aliasesFullWrite) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        if (aliasesFullWrite != null) {
            attrs.put(ConsoleAuthInterceptor.ATTR_ALIASES_FULL_WRITE, aliasesFullWrite);
        }
        Map<String, String> headers = Collections.singletonMap("X-Es-Target", target);
        InvocationHandler h = (proxy, method, args) -> {
            switch (method.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                case "setAttribute": attrs.put((String) args[0], args[1]); return null;
                case "getHeader": return headers.get((String) args[0]);
                default: throw new UnsupportedOperationException(method.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                PermissionReadMapHarden980Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }
}
