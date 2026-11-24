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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import org.junit.Test;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 983：环形治理只向 ADMIN 暴露审计/监控控制面索引前缀。 */
public class RingUsageHarden983Test {

    private static HttpServletRequest requestWith(ConsolePrincipal principal) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                RingUsageHarden983Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, method, args) -> {
                    if ("getAttribute".equals(method.getName())
                            && ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0])) {
                        return principal;
                    }
                    throw new UnsupportedOperationException(method.getName());
                });
    }

    @Test
    public void 非管理员响应不含控制面索引前缀() {
        RingUsageController c = new RingUsageController(
                new MonitorMetricsStore(null, "esquerystudio_monitor"), "esquerystudio_ops_audit", 1024L);
        ConsolePrincipal viewer = new ConsolePrincipal("v", ConsoleRole.VIEWER, false, true, "V",
                null, new HashSet<>(Collections.singletonList("conn:c1:overview")));
        Map<String, Object> out = c.usage(requestWith(viewer));
        assertFalse(out.containsKey("auditPrefix"));
        assertFalse(out.containsKey("monitorPrefix"));
        assertTrue(out.containsKey("totalBytes"));
    }

    @Test
    public void 管理员仍可见前缀() {
        RingUsageController c = new RingUsageController(
                new MonitorMetricsStore(null, "esquerystudio_monitor"), "esquerystudio_ops_audit", 1024L);
        ConsolePrincipal admin = new ConsolePrincipal("a", ConsoleRole.ADMIN, false, false);
        Map<String, Object> out = c.usage(requestWith(admin));
        assertTrue(out.containsKey("auditPrefix"));
        assertTrue(out.containsKey("monitorPrefix"));
    }
}
