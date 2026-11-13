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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;

/**
 * 审计值建议端点纵深防御：拦截器角色门之外，controller 对 VIEWER 直接 403——
 * 防止未来页面/路由调整把全量用户名/URI 建议泄漏给最低角色。
 */
public class AuditFacetsRole963Test {

    private static HttpServletRequest stubRequest(Object principal) {
        Map<String, Object> attrs = new HashMap<>();
        if (principal != null) {
            attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        }
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                AuditFacetsRole963Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    @Test
    public void VIEWER请求审计值建议返回403() {
        ConsolePrincipal viewer = new ConsolePrincipal(
                "fs_ou_x1", ConsoleRole.VIEWER, false, true, "李旭升", null);
        // store 传 null：VIEWER 分支必须在触碰 store 之前就拒绝
        ResponseEntity<Map<String, Object>> resp = new AuditFacetsController(null)
                .facets(stubRequest(viewer));
        assertEquals(HttpStatus.FORBIDDEN, resp.getStatusCode());
        assertEquals("FORBIDDEN", resp.getBody().get("code"));
        assertEquals("REBUILD_OP", resp.getBody().get("required"));
    }

    @Test
    public void 未认证身份同样返回403() {
        ResponseEntity<Map<String, Object>> resp = new AuditFacetsController(null)
                .facets(stubRequest(null));
        assertEquals(HttpStatus.FORBIDDEN, resp.getStatusCode());
        assertEquals("FORBIDDEN", resp.getBody().get("code"));
    }
}
