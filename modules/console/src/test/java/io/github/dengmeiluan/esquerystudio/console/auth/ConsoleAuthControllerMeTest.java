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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 2.5.0 菜单 SPI：/auth/me 下发 grantedPages 三态 + 页面契约全量（前端导航过滤/Forbidden 取名用）。 */
public class ConsoleAuthControllerMeTest {

    /** hasAnyUser 固定 true 的桩（client supplier 给 null——me 路径不触 ES）。 */
    private static BuiltinConsoleAuthService stubAuthService() {
        return new BuiltinConsoleAuthService(() -> null, "esquerystudio_user", "admin", "esquerystudio", 1000L, "s") {
            @Override public boolean hasAnyUser() { return true; }
        };
    }

    private static final ConsoleOpsAuditStore NOOP_AUDIT = new ConsoleOpsAuditStore() {
        @Override public void record(ConsoleOpsAuditEvent event) { }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    };

    private static HttpServletRequest requestWith(ConsolePrincipal p) {
        InvocationHandler h = (proxy, m, args) -> {
            if ("getAttribute".equals(m.getName())
                    && ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0])) return p;
            Class<?> rt = m.getReturnType();
            return rt == boolean.class ? false : rt == int.class ? 0 : null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ConsoleAuthControllerMeTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsoleAuthController controller(boolean pageAuthEnabled) {
        return new ConsoleAuthController(stubAuthService(), NOOP_AUDIT, ConsolePageCatalog.load(), pageAuthEnabled);
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 委托身份_白名单_下发排序数组() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                new HashSet<>(Arrays.asList("search", "overview")));
        Map<String, Object> out = controller(true).me(requestWith(p));
        assertEquals(Arrays.asList("overview", "search"), out.get("grantedPages"));
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        assertEquals(13, ((List<Object>) pages.get("groups")).size());
    }

    @Test
    public void 委托身份_空集_下发空数组不折叠成null() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.<String>emptySet());
        Map<String, Object> out = controller(true).me(requestWith(p));
        // 前端 Array.isArray([]) === true → 全拒语义生效；折叠成 null 会变成「未启用」全量放行
        assertEquals(Collections.emptyList(), out.get("grantedPages"));
    }

    @Test
    public void 委托身份_未下发null_输出null() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null, null);
        assertNull(controller(true).me(requestWith(p)).get("grantedPages"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 委托身份_下发env页面模板供前端同口径收缩() throws Exception {
        io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties props =
                new io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties();
        java.util.Map<String, java.util.Set<String>> templates = new java.util.HashMap<>();
        templates.put("prod", new java.util.LinkedHashSet<>(Arrays.asList("search", "overview")));
        templates.put("qa", Collections.<String>emptySet());
        props.setEnvPages(templates);
        ConsoleAuthController c = controller(true);
        c.setEnvPagesResolver(new EnvPagesResolver(null, props));

        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                new HashSet<>(Arrays.asList("conn:c1:search", "conn:host:overview")));
        Map<String, Object> out = c.me(requestWith(p));
        Map<String, Object> envPages = (Map<String, Object>) out.get("envPages");
        assertNotNull(envPages);
        assertEquals(Arrays.asList("overview", "search"), envPages.get("PROD"));
        assertEquals(Collections.emptyList(), envPages.get("QA"));
    }

    @Test
    public void 内置身份或未下发页面授权时不下发env模板() throws Exception {
        io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties props =
                new io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties();
        java.util.Map<String, java.util.Set<String>> templates = new java.util.HashMap<>();
        templates.put("PROD", Collections.singleton("search"));
        props.setEnvPages(templates);
        ConsoleAuthController c = controller(true);
        c.setEnvPagesResolver(new EnvPagesResolver(null, props));

        ConsolePrincipal builtin = new ConsolePrincipal("admin", ConsoleRole.ADMIN, true, false);
        assertNull(c.me(requestWith(builtin)).get("envPages"));

        ConsolePrincipal noGrants = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true,
                null, null, null);
        assertNull(c.me(requestWith(noGrants)).get("envPages"));

        /* 非委托的自定义授权器同样下发页面授权与 env 模板：拦截器同口径执法。 */
        ConsolePrincipal custom = new ConsolePrincipal("custom", ConsoleRole.VIEWER, false, false,
                null, null, Collections.singleton("search"));
        ConsoleAuthController me = c;
        assertNotNull(me.me(requestWith(custom)).get("grantedPages"));
        assertNotNull(me.me(requestWith(custom)).get("envPages"));
    }

    @Test
    public void 非委托身份带集合_照常下发页面授权() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("custom", ConsoleRole.VIEWER, false, false, null, null,
                Collections.singleton("overview"));
        assertEquals(Collections.singletonList("overview"),
                controller(true).me(requestWith(p)).get("grantedPages"));
    }

    @Test
    public void 逃生阀关闭_输出null() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("overview"));
        assertNull(controller(false).me(requestWith(p)).get("grantedPages"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void 逃生阀关闭_pages仍下发() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.singleton("overview"));
        Map<String, Object> out = controller(false).me(requestWith(p));
        // 逃生阀只关授权判定与 grantedPages；pages 契约非秘密，无条件下发（Forbidden 取名数据源）
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        assertNotNull(pages);
        assertEquals(13, ((List<Object>) pages.get("groups")).size());
    }

    @Test
    @SuppressWarnings("unchecked")
    public void pages契约全量下发_组带页_页带route() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.ADMIN, false, true, null, null, null);
        Map<String, Object> out = controller(true).me(requestWith(p));
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        List<Map<String, Object>> groups = (List<Map<String, Object>>) pages.get("groups");
        assertEquals(13, groups.size());
        int total = 0;
        for (Map<String, Object> g : groups) {
            List<Map<String, Object>> ps = (List<Map<String, Object>>) g.get("pages");
            total += ps.size();
            for (Map<String, Object> pm : ps) {
                assertTrue(pm.get("key") != null && pm.get("route") != null && pm.get("name") != null);
                // minVer 显式为 null 也在键集中——前端按契约消费键集，不判值
                assertTrue(pm.containsKey("minVer"));
            }
        }
        assertEquals(53, total);
        // 全链不可变加固：浅尝一层，groups 列表不可改（内层 pm/ps/gm 同样已在构造期冻结）
        try {
            groups.clear();
            fail("pages.groups 应为不可变列表");
        } catch (UnsupportedOperationException expected) {
            // 预期
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void pages契约_页条目下发apiPrefixes() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.ADMIN, false, true, null, null, null);
        Map<String, Object> out = controller(true).me(requestWith(p));
        Map<String, Object> pages = (Map<String, Object>) out.get("pages");
        List<Map<String, Object>> groups = (List<Map<String, Object>>) pages.get("groups");
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Map<String, Object> g : groups) {
            for (Map<String, Object> pm : (List<Map<String, Object>>) g.get("pages")) {
                byKey.put((String) pm.get("key"), pm);
            }
        }
        // 键集在场：每个页条目都带 apiPrefixes 键（值可为空数组）——前端用同一份数据镜像 pageOf 定端点归属
        for (Map<String, Object> pm : byKey.values()) {
            assertTrue("页 " + pm.get("key") + " 缺 apiPrefixes 键", pm.containsKey("apiPrefixes"));
        }
        // 已知页：indices 的端点归属前缀原样下发（与契约 META-INF/esquerystudio-pages.json 一致）
        List<String> indicesPrefixes = (List<String>) byKey.get("indices").get("apiPrefixes");
        assertNotNull(indicesPrefixes);
        assertTrue(indicesPrefixes.contains("/internal/es/index/cluster/delete-index"));
        // 空 apiPrefixes 页：下发空数组而非省略键（前端 Array.isArray 校验需要数组在场）
        assertEquals(Collections.emptyList(), byKey.get("workspace").get("apiPrefixes"));
    }
}
