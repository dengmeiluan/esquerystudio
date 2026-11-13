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

import java.util.Locale;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

/**
 * 连接中心自动同步批:/clusters/sync 与 /clusters/sync/run 端点行为锁
 * (直调方法体;引擎缺席 null 安全,手动触发同步执行返回本轮报告)。
 * 鉴权零改动断言:两路径含 /clusters/ 天然落高危清单 ADMIN(见 ConsoleAuthInterceptor 高危表)。
 */
public class EsClusterConnSyncEndpointTest {

    private FakeStore store;

    @Before
    public void setUp() {
        store = new FakeStore();
    }

    /** 内存 ConnStore 桩(最小版,自持不跨测试类引用——仓内先例:各测试自持桩)。 */
    private static class FakeStore implements ConnStore {
        final Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
        final Map<String, RemoteClusterConn> full = new LinkedHashMap<>();

        @Override public List<Map<String, Object>> list() {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map.Entry<String, Map<String, Object>> e : rows.entrySet()) {
                Map<String, Object> v = new LinkedHashMap<>(e.getValue());
                v.put("id", e.getKey());
                out.add(v);
            }
            return out;
        }

        @Override public RemoteClusterConn get(String id) {
            return full.get(id);
        }

        @Override public String getName(String id) {
            Map<String, Object> r = rows.get(id);
            return r == null ? null : String.valueOf(r.get("name"));
        }

        @Override public String getVersion(String id) { return null; }

        @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                  String password, String minRole, Integer ct, Integer st, String env) {
            String docId = id == null || id.trim().isEmpty() ? "gen" + rows.size() : id.trim();
            RemoteClusterConn p = RemoteClusterConn.parse(url);
            if (username != null && !username.trim().isEmpty()) p.setUsername(username.trim());
            if (password != null && !password.isEmpty()) p.setPassword(password);
            full.put(docId, p);
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("name", name.trim());
            v.put("scheme", p.getScheme());
            v.put("host", p.getHost());
            v.put("port", p.getPort());
            v.put("minRole", minRole == null || minRole.trim().isEmpty() ? "VIEWER" : minRole.trim().toUpperCase(Locale.ROOT));
            v.put("env", env == null || env.trim().isEmpty() ? null : env.trim().toUpperCase(Locale.ROOT));
            rows.put(docId, v);
            return v;
        }

        @Override public void updateVersion(String id, String esVersion) { }

        @Override public void delete(String id) {
            rows.remove(id);
            full.remove(id);
        }
    }

    /** 引擎缺席(未注册 contributor/未开开关):GET 回 null,POST 明确报错。 */
    @Test
    public void 引擎缺席_GET回null_POST友好报错() {
        EsClusterConnController c = new EsClusterConnController(store, null, null, null, null);
        assertNull(c.syncStatus());
        try {
            c.syncRun();
            fail("未启用同步时 POST sync/run 必须显式报错");
        } catch (IllegalStateException expected) {
            assertEquals("未启用连接中心同步(需注册 ClusterConnContributor 并开启 esquerystudio.elasticsearch.console.conn-sync.enabled)",
                    expected.getMessage());
        }
    }

    /** 手动触发:同步执行一轮并返回报告;再 GET 能拿到同一份 lastReport。 */
    @Test
    public void 手动触发执行一轮并返回报告() {
        EsClusterConnController c = new EsClusterConnController(store, null, null, null,
                new ClusterConnSyncEngine(store, null, null,
                        () -> Collections.singletonList(ContributedEsCluster.builder()
                                .sourceId("c1").name("QA").url("http://es-qa:9200").rawEnv("qa").build()),
                        3600, 3600, "VIEWER"));
        ClusterConnSyncReport r = c.syncRun();
        assertEquals(1, r.getCreated());
        assertEquals("manual", r.getTrigger());
        assertEquals("GET 复用最近一轮报告", r.getFinishedAt(), c.syncStatus().getFinishedAt());
    }
}
