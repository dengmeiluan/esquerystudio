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
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

/**
 * 高危端点缺 principal 必须 fail-closed；VIEWER 只能走 guarded/strict 分支，
 * ADMIN 保持无守卫通道（有权限的人不被降权）。
 */
public class InternalEsRawPrincipal972Test {

    private static class StubAdmin extends EsIndexAdmin {
        String raw;
        String guarded;
        String template;
        String templateAdmin;
        String restore;
        String restoreGuarded;
        String searchDsl;

        StubAdmin() { super(null); }

        @Override public Map<String, Object> searchDsl(String index, String body, boolean explain, boolean profile) {
            searchDsl = index;
            return Collections.emptyMap();
        }

        @Override public Map<String, Object> raw(String method, String path, String body) {
            raw = method + " " + path;
            return Collections.emptyMap();
        }

        @Override public Map<String, Object> rawGuarded(String method, String path, String body) {
            guarded = method + " " + path;
            return Collections.emptyMap();
        }

        @Override public Map<String, Object> putTemplate(String kind, String name, String body) {
            template = kind + ":" + name;
            return Collections.emptyMap();
        }

        @Override public Map<String, Object> putTemplateAdmin(String kind, String name, String body) {
            templateAdmin = kind + ":" + name;
            return Collections.emptyMap();
        }

        @Override public Map<String, Object> restoreSnapshot(String repo, String name, String body) {
            restore = repo + "/" + name;
            return Collections.emptyMap();
        }

        @Override public Map<String, Object> restoreSnapshotGuarded(String repo, String name, String body) {
            restoreGuarded = repo + "/" + name;
            return Collections.emptyMap();
        }
    }

    private static HttpServletRequest req(ConsolePrincipal principal) {
        Map<String, Object> attrs = new HashMap<>();
        if (principal != null) attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        InvocationHandler h = (proxy, m, args) -> {
            if ("getAttribute".equals(m.getName())) return attrs.get(args[0]);
            if ("getMethod".equals(m.getName())) return "POST";
            if ("getRequestURI".equals(m.getName())) return "/internal/es/index/cluster/raw";
            Class<?> rt = m.getReturnType();
            if (rt == boolean.class) return false;
            if (rt == int.class) return 0;
            if (rt == long.class) return 0L;
            return null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                InternalEsRawPrincipal972Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static Map<String, String> rawBody() {
        Map<String, String> body = new HashMap<>();
        body.put("method", "GET");
        body.put("path", "/_cluster/health");
        return body;
    }

    private static void assertMissingPrincipalRejected(Runnable call, String why) {
        try {
            call.run();
            fail("缺 principal 应 401：" + why);
        } catch (ResponseStatusException e) {
            assertEquals("HTTP 状态：" + why, 401, e.getStatus().value());
        }
    }

    @Test
    public void 缺principal时raw模板恢复三端点全部401() {
        InternalEsIndexRebuildController c =
                new InternalEsIndexRebuildController(null, new StubAdmin());
        assertMissingPrincipalRejected(() -> {
            try { c.clusterRaw(rawBody(), req(null)); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "raw");
        assertMissingPrincipalRejected(() -> {
            try { c.clusterPutTemplate("t", "index", "{}", req(null)); } catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "template");
        assertMissingPrincipalRejected(() -> {
            try { c.clusterRestoreSnapshot("repo", "snap", "{\"indices\":\"logs-*\"}", req(null)); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "restore");
    }

    @Test
    public void VIEWER走guarded或strict通道() throws Exception {
        StubAdmin admin = new StubAdmin();
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, admin);
        ConsolePrincipal viewer = new ConsolePrincipal("viewer", ConsoleRole.VIEWER, false);
        c.clusterRaw(rawBody(), req(viewer));
        assertEquals("GET /_cluster/health", admin.guarded);
        assertNull("VIEWER 不得走无守卫 raw", admin.raw);

        c.clusterPutTemplate("t", "index", "{}", req(viewer));
        assertEquals("index:t", admin.template);
        assertNull("VIEWER 不得走模板 ADMIN 通道", admin.templateAdmin);

        c.clusterRestoreSnapshot("repo", "snap", "{\"indices\":\"logs-*\"}", req(viewer));
        assertEquals("repo/snap", admin.restoreGuarded);
        assertNull("VIEWER 不得走无守卫恢复", admin.restore);
    }


    @Test
    public void 无索引DSL搜索仅ADMIN放行() throws Exception {
        StubAdmin admin = new StubAdmin();
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, admin);
        ConsolePrincipal viewer = new ConsolePrincipal("viewer", ConsoleRole.VIEWER, false);
        try {
            c.clusterSearchDsl(null, false, false, "{}", req(viewer));
            fail("VIEWER 无索引搜索应拒绝");
        } catch (io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException expected) {
            assertNull(admin.searchDsl);
        }
        c.clusterSearchDsl("logs-*", false, false, "{}", req(viewer));
        assertEquals("logs-*", admin.searchDsl);

        StubAdmin admin2 = new StubAdmin();
        InternalEsIndexRebuildController c2 = new InternalEsIndexRebuildController(null, admin2);
        c2.clusterSearchDsl(null, false, false, "{}",
                req(new ConsolePrincipal("root", ConsoleRole.ADMIN, false)));
        assertNull(admin2.searchDsl);
    }

    @Test
    public void DevTools端点与raw同源走guarded或ADMIN通道() throws Exception {
        StubAdmin admin = new StubAdmin();
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, admin);
        ConsolePrincipal viewer = new ConsolePrincipal("viewer", ConsoleRole.VIEWER, false);
        c.clusterDevtoolsExecute(rawBody(), req(viewer));
        assertEquals("GET /_cluster/health", admin.guarded);
        assertNull(admin.raw);

        StubAdmin admin2 = new StubAdmin();
        InternalEsIndexRebuildController c2 = new InternalEsIndexRebuildController(null, admin2);
        ConsolePrincipal root = new ConsolePrincipal("root", ConsoleRole.ADMIN, false);
        c2.clusterDevtoolsExecute(rawBody(), req(root));
        assertEquals("GET /_cluster/health", admin2.raw);
        assertNull(admin2.guarded);
    }

    @Test
    public void auth关闭时免鉴权部署仍可走ADMIN通道() throws Exception {
        StubAdmin admin = new StubAdmin();
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, admin, false);
        c.clusterRaw(rawBody(), req(null));
        assertEquals("GET /_cluster/health", admin.raw);
        assertNull(admin.guarded);
    }

    @Test
    public void ADMIN保持无守卫通道() throws Exception {
        StubAdmin admin = new StubAdmin();
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, admin);
        ConsolePrincipal root = new ConsolePrincipal("root", ConsoleRole.ADMIN, false);
        c.clusterRaw(rawBody(), req(root));
        assertEquals("GET /_cluster/health", admin.raw);
        assertNull(admin.guarded);

        c.clusterPutTemplate("t", "index", "{}", req(root));
        assertEquals("index:t", admin.templateAdmin);
        assertNull(admin.template);

        c.clusterRestoreSnapshot("repo", "snap", "{\"indices\":\"logs-*\"}", req(root));
        assertEquals("repo/snap", admin.restore);
        assertNull(admin.restoreGuarded);
    }
}
