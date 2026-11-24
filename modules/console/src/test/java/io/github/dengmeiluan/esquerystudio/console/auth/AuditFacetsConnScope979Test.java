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
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** audit-facets 跨连接聚合：连接维度 security 授权不得拿到其它连接的值建议。 */
public class AuditFacetsConnScope979Test {

    private static HttpServletRequest request(ConsolePrincipal p) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                AuditFacetsConnScope979Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getAttribute".equals(m.getName())) {
                        return ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0]) ? p : null;
                    }
                    throw new UnsupportedOperationException(m.getName());
                });
    }

    private static ConsolePrincipal principal(ConsoleRole role, String... grants) {
        return new ConsolePrincipal("u1", role, false, true, "审计员", null,
                new HashSet<>(java.util.Arrays.asList(grants)));
    }

    private static AuditFacetsStore leakingStore() {
        return new AuditFacetsStore(() -> null, "esquerystudio_ops_audit") {
            @Override public Map<String, Object> facets() {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("actions", Collections.emptyList());
                out.put("conns", Collections.emptyList());
                out.put("users", Collections.singletonList(Collections.singletonMap("key", "leak")));
                out.put("uris", Collections.emptyList());
                return out;
            }
        };
    }

    @Test
    public void 连接维度security授权返回空值建议() {
        Map<String, Object> body = new AuditFacetsController(leakingStore())
                .facets(request(principal(ConsoleRole.CLUSTER_OP, "conn:c1:security"))).getBody();
        assertEquals(Collections.emptyList(), body.get("users"));
    }

    @Test
    public void 静态security授权保持全量值建议() {
        Map<String, Object> body = new AuditFacetsController(leakingStore())
                .facets(request(principal(ConsoleRole.AUDIT_OP, "security"))).getBody();
        assertTrue(String.valueOf(body.get("users")).contains("leak"));
    }

    @Test
    public void 空授权集返回空值建议() {
        Map<String, Object> body = new AuditFacetsController(leakingStore())
                .facets(request(new ConsolePrincipal("u", ConsoleRole.CLUSTER_OP, false, true, "审计员",
                        null, new HashSet<>()))).getBody();
        assertEquals(Collections.emptyList(), body.get("users"));
    }

    @Test
    public void 低角色仍403() {
        assertEquals(403, new AuditFacetsController(leakingStore())
                .facets(request(principal(ConsoleRole.VIEWER, "conn:c1:security")))
                .getStatusCodeValue());
    }
}
