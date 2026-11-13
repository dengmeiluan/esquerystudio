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

package io.github.dengmeiluan.esquerystudio.console.web;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.fail;

/**
 * 1007：写面与读面同口径——搜索模板页只能写 mustache 脚本；组件模板是集群级共享件。
 */
public class InternalEsIndexRebuildScope1007Test {

    private static class FakeAdmin extends EsIndexAdmin {
        String lastScriptId;
        String lastScriptBody;
        String lastTemplateKind;

        FakeAdmin() { super(null); }

        @Override public Map<String, Object> listStoredScripts() {
            Map<String, Object> scripts = new LinkedHashMap<>();
            scripts.put("tpl", Collections.singletonMap("lang", "mustache"));
            scripts.put("pl", Collections.singletonMap("lang", "painless"));
            return Collections.singletonMap("scripts", scripts);
        }

        @Override public Map<String, Object> putStoredScript(String id, String body) {
            lastScriptId = id;
            lastScriptBody = body;
            return Collections.singletonMap("ok", true);
        }

        @Override public Map<String, Object> deleteStoredScript(String id) {
            lastScriptId = id;
            return Collections.singletonMap("ok", true);
        }

        @Override public Map<String, Object> putTemplate(String kind, String name, String body) {
            lastTemplateKind = kind;
            return Collections.singletonMap("ok", true);
        }

        @Override public Map<String, Object> putTemplateAdmin(String kind, String name, String body) {
            lastTemplateKind = kind;
            return Collections.singletonMap("ok", true);
        }
    }

    private static HttpServletRequest request(ConsoleRole role, String... grants) {
        ConsolePrincipal p = new ConsolePrincipal("u1", role, false, true, "用户", null,
                grants.length == 0 ? null : new HashSet<>(Arrays.asList(grants)));
        return (HttpServletRequest) Proxy.newProxyInstance(
                InternalEsIndexRebuildScope1007Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getAttribute".equals(m.getName())) {
                        return ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0]) ? p : null;
                    }
                    if ("getHeader".equals(m.getName())) {
                        return "X-Es-Target".equals(args[0]) ? "c1" : null;
                    }
                    if ("getMethod".equals(m.getName())) return "POST";
                    throw new UnsupportedOperationException(m.getName());
                });
    }

    private static void expectForbidden(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    private static InternalEsIndexRebuildController controller(FakeAdmin admin) {
        return new InternalEsIndexRebuildController(null, admin, true);
    }

    @Test
    public void 搜索模板写键只能写mustache_不能覆盖或删除painless() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        InternalEsIndexRebuildController c = controller(admin);
        HttpServletRequest tplWriter = request(ConsoleRole.VIEWER,
                "conn:c1:search-templates", "conn:c1:w:search-templates");

        c.putStoredScript("tpl", "{\"script\":{\"lang\":\"mustache\",\"source\":\"{}\"}}", tplWriter);
        assertEquals("tpl", admin.lastScriptId);

        expectForbidden(() -> {
            try {
                c.putStoredScript("pl", "{\"script\":{\"lang\":\"painless\",\"source\":\"return 1\"}}", tplWriter);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "模板页覆盖 painless 脚本");
        expectForbidden(() -> {
            try {
                c.deleteStoredScript("pl", tplWriter);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "模板页删除 painless 脚本");

        try {
            c.deleteStoredScript("tpl", tplWriter);
            assertEquals("tpl", admin.lastScriptId);
        } catch (java.io.IOException e) {
            fail(e.getMessage());
        }
    }

    @Test
    public void painless页写键可写任意脚本() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        InternalEsIndexRebuildController c = controller(admin);
        HttpServletRequest lab = request(ConsoleRole.VIEWER,
                "conn:c1:painless-lab", "conn:c1:w:painless-lab");
        c.putStoredScript("pl", "{\"script\":{\"lang\":\"painless\",\"source\":\"return 1\"}}", lab);
        assertNotNull(admin.lastScriptBody);
    }

    @Test
    public void 组件模板写需rank3或集群设置写键_索引模板不受影响() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        InternalEsIndexRebuildController c = controller(admin);
        HttpServletRequest tplWriter = request(ConsoleRole.OPERATOR,
                "conn:c1:templates", "conn:c1:w:templates");

        c.clusterPutTemplate("base", "index", "{\"index_patterns\":[\"logs-*\"]}", tplWriter);
        assertEquals("index", admin.lastTemplateKind);

        expectForbidden(() -> {
            try {
                c.clusterPutTemplate("base", "component", "{\"template\":{}}", tplWriter);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "rank2 改组件模板（被索引模板引用，影响未来所有匹配索引）");

        HttpServletRequest clusterOp = request(ConsoleRole.CLUSTER_OP,
                "conn:c1:templates", "conn:c1:w:templates");
        c.clusterPutTemplate("base", "component", "{\"template\":{}}", clusterOp);
        assertEquals("component", admin.lastTemplateKind);
    }
}
