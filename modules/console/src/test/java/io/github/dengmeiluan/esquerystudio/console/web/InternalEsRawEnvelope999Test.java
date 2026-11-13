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

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 非 ADMIN 的 raw 成功信封体与错误路径同口径脱敏：bulk 逐条 failure /
 * _msearch 逐项 error 内嵌的目标集群节点坐标不得随 200 响应外发；
 * ADMIN 无守卫通道保持原文（有权限的人不被降权）。透传 body 超上限直接拒绝。
 */
public class InternalEsRawEnvelope999Test {

    private static final String TOPOLOGY_BODY =
            "{\"items\":[{\"error\":{\"reason\":\"failed: http://10.9.8.7:9200 [10.9.8.7:9200]\"}}]}";

    private static class BodyStubAdmin extends EsIndexAdmin {
        BodyStubAdmin() { super(null); }

        @Override public Map<String, Object> raw(String method, String path, String body) {
            return envelope();
        }

        @Override public Map<String, Object> rawGuarded(String method, String path, String body) {
            return envelope();
        }

        private Map<String, Object> envelope() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", 200);
            out.put("body", TOPOLOGY_BODY);
            return out;
        }
    }

    private static HttpServletRequest requestWithPrincipal(ConsolePrincipal principal) {
        final Object p = principal;
        return (HttpServletRequest) Proxy.newProxyInstance(
                InternalEsRawEnvelope999Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (InvocationHandler) (proxy, method, args) -> {
                    if ("getAttribute".equals(method.getName())
                            && ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0])) {
                        return p;
                    }
                    if ("equals".equals(method.getName())) return proxy == args[0];
                    if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
                    if ("toString".equals(method.getName())) return "stub-request";
                    return null;
                });
    }

    @Test
    public void 非管理员成功信封体同样脱敏() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, new BodyStubAdmin(), true);
        Map<String, String> req = new LinkedHashMap<>();
        req.put("method", "POST");
        req.put("path", "/_msearch");
        req.put("body", "{}");
        ConsolePrincipal viewer = new ConsolePrincipal("u1", ConsoleRole.VIEWER, false);
        Map<String, Object> out = c.clusterDevtoolsExecute(req, requestWithPrincipal(viewer));
        String body = String.valueOf(out.get("body"));
        assertFalse("拓扑坐标应被脱敏：" + body, body.contains("10.9.8.7:9200"));
        assertTrue("脱敏占位应存在", body.contains("[redacted-host]"));
    }

    @Test
    public void 管理员通道保持原文() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, new BodyStubAdmin(), true);
        Map<String, String> req = new LinkedHashMap<>();
        req.put("method", "POST");
        req.put("path", "/_msearch");
        req.put("body", "{}");
        ConsolePrincipal admin = new ConsolePrincipal("root", ConsoleRole.ADMIN, false);
        Map<String, Object> out = c.clusterDevtoolsExecute(req, requestWithPrincipal(admin));
        assertTrue("ADMIN 诊断粒度不被降权：", String.valueOf(out.get("body")).contains("10.9.8.7:9200"));
    }

    @Test
    public void 透传体超上限直接拒绝() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, new BodyStubAdmin(), true);
        Map<String, String> req = new LinkedHashMap<>();
        req.put("method", "POST");
        req.put("path", "/_bulk");
        req.put("body", new String(new char[InternalEsIndexRebuildController.RAW_BODY_LIMIT_CHARS + 1])
                .replace('\0', 'a'));
        try {
            c.clusterDevtoolsExecute(req, requestWithPrincipal(
                    new ConsolePrincipal("root", ConsoleRole.ADMIN, false)));
            fail("超限 body 应被拒绝");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void 无body请求不受上限影响() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, new BodyStubAdmin(), true);
        Map<String, String> req = new LinkedHashMap<>();
        req.put("method", "GET");
        req.put("path", "/logs/_search");
        Map<String, Object> out = c.clusterDevtoolsExecute(req, requestWithPrincipal(
                new ConsolePrincipal("u1", ConsoleRole.VIEWER, false)));
        assertFalse("正常无 body 请求照常执行", out.isEmpty());
    }
}
