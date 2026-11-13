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
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;

/** 非 ADMIN 的索引/别名/分片列表不得暴露控制面索引名。 */
public class InternalEsIndexRebuildControlReadScope979Test {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }

        @Override public List<Map<String, Object>> listClusterIndices() {
            return rows("logs-2026", "esquerystudio_user", ".kibana");
        }

        @Override public List<Map<String, Object>> listAllAliases() {
            return rows("logs-2026", "esquerystudio_conn");
        }

        @Override public List<Map<String, Object>> shardsDistribution(String indexPattern) {
            return rows("logs-2026", "logs_esquerystudio_lock");
        }

        private static List<Map<String, Object>> rows(String... names) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (String n : names) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("index", n);
                out.add(row);
            }
            return out;
        }
    }

    private static HttpServletRequest request(ConsoleRole role) {
        ConsolePrincipal p = new ConsolePrincipal("u1", role, false, true, "用户", null,
                Collections.singleton("conn:c1:indices"));
        return (HttpServletRequest) Proxy.newProxyInstance(
                InternalEsIndexRebuildControlReadScope979Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getAttribute".equals(m.getName())) {
                        return ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0]) ? p : null;
                    }
                    if ("getHeader".equals(m.getName())) {
                        return null; /* 页面可见性按目标连接取键：本用例无 X-Es-Target */
                    }
                    throw new UnsupportedOperationException(m.getName());
                });
    }

    @Test
    public void 非ADMIN索引别名分片列表过滤控制面() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, new FakeAdmin(), true);
        HttpServletRequest viewer = request(ConsoleRole.VIEWER);
        assertEquals(1, c.clusterIndices(viewer).size());
        assertEquals("logs-2026", c.clusterIndices(viewer).get(0).get("index"));
        assertEquals(1, c.clusterAliases(viewer).size());
        assertEquals(1, c.clusterShards(null, viewer).size());
    }

    @Test
    public void ADMIN保持完整列表() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(null, new FakeAdmin(), true);
        HttpServletRequest admin = request(ConsoleRole.ADMIN);
        assertEquals(3, c.clusterIndices(admin).size());
        assertEquals(2, c.clusterAliases(admin).size());
        assertEquals(2, c.clusterShards(null, admin).size());
    }
}
