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
import org.junit.Test;
import org.springframework.http.ResponseEntity;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/** 批次 985：自定义授权器部署的 /auth/me 兜底，前端不再把 404 当无鉴权全开。 */
public class ConsoleMeFallback985Test {

    private static HttpServletRequest requestWith(ConsolePrincipal p) {
        InvocationHandler h = (proxy, m, args) -> {
            if ("getAttribute".equals(m.getName())
                    && ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0])) return p;
            Class<?> rt = m.getReturnType();
            return rt == boolean.class ? false : rt == int.class ? 0 : null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleMeFallback985Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsoleMeFallbackController controller(boolean pageAuth, EnvPagesResolver env) {
        return new ConsoleMeFallbackController(ConsolePageCatalog.load(), pageAuth, env);
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 自定义授权器身份可回显角色与页面授权() {
        ConsolePrincipal p = new ConsolePrincipal("host-user", ConsoleRole.REBUILD_OP, false, true,
                null, null, new HashSet<>(Collections.singletonList("search")));
        Map<String, Object> out = controller(true, null).me(requestWith(p)).getBody();
        assertEquals("host-user", out.get("username"));
        assertEquals("REBUILD_OP", out.get("role"));
        assertEquals(Collections.singletonList("search"), out.get("grantedPages"));
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        assertEquals(13, ((List<Object>) pages.get("groups")).size());
    }

    @Test
    public void 逃生阀关闭时不下发页面授权() {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true,
                null, null, Collections.singleton("search"));
        assertNull(controller(false, null).me(requestWith(p)).getBody().get("grantedPages"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void env模板随身份下发() {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        Map<String, Set<String>> templates = new HashMap<>();
        templates.put("prod", new LinkedHashSet<>(Arrays.asList("search", "overview")));
        props.setEnvPages(templates);
        EnvPagesResolver env = new EnvPagesResolver(null, props);
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true,
                null, null, Collections.singleton("conn:c1:search"));
        Map<String, Object> out = controller(true, env).me(requestWith(p)).getBody();
        Map<String, Object> envPages = (Map<String, Object>) out.get("envPages");
        assertEquals(Arrays.asList("overview", "search"), envPages.get("PROD"));
    }

    @Test
    public void 未认证请求返回401() {
        ResponseEntity<Map<String, Object>> r = controller(true, null).me(requestWith(null));
        assertEquals(401, r.getStatusCodeValue());
        assertEquals("UNAUTHORIZED", r.getBody().get("code"));
    }
}
