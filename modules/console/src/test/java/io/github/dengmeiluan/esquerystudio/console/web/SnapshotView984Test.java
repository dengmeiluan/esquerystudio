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
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 984：快照读视图对非 ADMIN 去掉控制面索引名。 */
public class SnapshotView984Test {

    private static class FakeAdmin extends EsIndexAdmin {
        FakeAdmin() { super(null); }

        @Override public List<Map<String, Object>> listSnapshots(String repo) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("snapshot", "snap-1");
            row.put("indices", new ArrayList<>(Arrays.asList(
                    "logs-1", "esquerystudio_user", "logs_2026_esquerystudio_lock", "orders")));
            return Collections.singletonList(row);
        }

        @Override public Map<String, Object> snapshotStatus(String repo, String name) {
            Map<String, Object> indices = new LinkedHashMap<>();
            indices.put("logs-1", Collections.singletonMap("shards", 1));
            indices.put("esquerystudio_ops_audit", Collections.singletonMap("shards", 1));
            Map<String, Object> snap = new LinkedHashMap<>();
            snap.put("snapshot", "snap-1");
            snap.put("indices", indices);
            return Collections.singletonMap("snapshots", Collections.singletonList(snap));
        }
    }

    private static HttpServletRequest request(ConsoleRole role) {
        ConsolePrincipal p = new ConsolePrincipal("u", role, false, true, "用户", null,
                role.atLeast(ConsoleRole.ADMIN) ? null : Collections.singleton("snapshots"));
        return (HttpServletRequest) Proxy.newProxyInstance(
                SnapshotView984Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getAttribute".equals(m.getName())) {
                        return ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(args[0]) ? p : null;
                    }
                    throw new UnsupportedOperationException(m.getName());
                });
    }

    @Test
    public void 非管理员快照列表不暴露控制面索引名() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(
                null, new FakeAdmin(), true);
        List<Map<String, Object>> rows = c.clusterSnapshotList("repo", request(ConsoleRole.REBUILD_OP));
        @SuppressWarnings("unchecked")
        List<Object> indices = (List<Object>) rows.get(0).get("indices");
        assertEquals(Arrays.asList("logs-1", "orders"), indices);
    }

    @Test
    public void 管理员快照列表保持原样() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(
                null, new FakeAdmin(), true);
        List<Map<String, Object>> rows = c.clusterSnapshotList("repo", request(ConsoleRole.ADMIN));
        @SuppressWarnings("unchecked")
        List<Object> indices = (List<Object>) rows.get(0).get("indices");
        assertTrue(indices.contains("esquerystudio_user"));
    }

    @Test
    public void 非管理员快照状态按索引名脱敏() throws Exception {
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(
                null, new FakeAdmin(), true);
        Map<String, Object> out = c.clusterSnapshotStatus("repo", "snap-1", false);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> snaps = (List<Map<String, Object>>) out.get("snapshots");
        @SuppressWarnings("unchecked")
        Map<String, Object> indices = (Map<String, Object>) snaps.get(0).get("indices");
        assertTrue(indices.containsKey("logs-1"));
        assertFalse(indices.containsKey("esquerystudio_ops_audit"));
    }
}
