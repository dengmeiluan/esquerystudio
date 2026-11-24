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

import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 连接可见性单一真源：连接目录/权限面板/监控接口必须同口径。 */
public class ConsoleConnVisibility977Test {

    private static Map<String, Object> conn(String id, String name, String minRole) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("id", id);
        c.put("name", name);
        c.put("minRole", minRole);
        return c;
    }

    private static ConnStore store() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                return Arrays.asList(conn("c1", "生产集群", "VIEWER"), conn("c2", "灾备集群", "OPERATOR"));
            }
            @Override public RemoteClusterConn get(String id) {
                if ("c1".equals(id)) {
                    RemoteClusterConn c = new RemoteClusterConn();
                    c.setMinRole("VIEWER");
                    c.setEnv("PROD");
                    return c;
                }
                if ("c2".equals(id)) {
                    RemoteClusterConn c = new RemoteClusterConn();
                    c.setMinRole("OPERATOR");
                    c.setEnv("DR");
                    return c;
                }
                return null;
            }
            @Override public String getName(String id) {
                if ("c1".equals(id)) return "生产集群";
                if ("c2".equals(id)) return "灾备集群";
                return null;
            }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static ConsolePrincipal delegated(Set<String> gp) {
        return delegated(ConsoleRole.VIEWER, gp);
    }

    private static ConsolePrincipal delegated(ConsoleRole role, Set<String> gp) {
        return new ConsolePrincipal("u", role, false, true, null, null, gp);
    }

    private static Set<String> set(String... v) {
        return new java.util.HashSet<>(Arrays.asList(v));
    }

    @Test
    public void 空集全拒且不得枚举连接() {
        ConsolePrincipal p = delegated(Collections.<String>emptySet());
        assertFalse(ConsoleConnVisibility.canSee(p, "c1", store()));
        assertFalse(ConsoleConnVisibility.canSeeHost(p));
        assertTrue(ConsoleConnVisibility.visibleIds(p, store()).isEmpty());
        assertFalse(ConsoleConnVisibility.canSeeName(p, "生产集群", store()));
    }

    @Test
    public void 纯连接模型只看连接键() {
        ConsolePrincipal p = delegated(set("conn:c1:overview", "conn:c1:w:overview"));
        assertTrue(ConsoleConnVisibility.canSee(p, "c1", store()));
        assertFalse(ConsoleConnVisibility.canSee(p, "c2", store()));
        assertFalse(ConsoleConnVisibility.canSeeHost(p));
        assertTrue(ConsoleConnVisibility.visibleIds(p, store()).contains("c1"));
    }

    @Test
    public void 静态页全局生效但仍受minRole收口() {
        ConsolePrincipal viewer = delegated(set("overview"));
        assertTrue(ConsoleConnVisibility.canSee(viewer, "c1", store()));
        assertFalse(ConsoleConnVisibility.canSee(viewer, "c2", store()));
        assertTrue(ConsoleConnVisibility.canSeeHost(viewer));
        ConsolePrincipal op = delegated(ConsoleRole.OPERATOR, set("overview"));
        assertTrue(ConsoleConnVisibility.canSee(op, "c2", store()));
    }

    @Test
    public void 宿主键独立且不放大连接可见性() {
        ConsolePrincipal p = delegated(set("conn:host:overview"));
        assertTrue(ConsoleConnVisibility.canSeeHost(p));
        assertFalse(ConsoleConnVisibility.canSee(p, "c1", store()));
    }

    @Test
    public void 集群实名解析到连接后按连接可见性裁决() {
        ConsolePrincipal p = delegated(set("conn:c1:overview"));
        assertTrue(ConsoleConnVisibility.canSeeName(p, "生产集群", store()));
        assertFalse(ConsoleConnVisibility.canSeeName(p, "灾备集群", store()));
        assertFalse(ConsoleConnVisibility.canSeeName(p, "未授权集群", store()));
    }

    @Test
    public void 重名连接必须全部可见才可按实名查询() {
        ConnStore dup = new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                return Arrays.asList(conn("c1", "同名集群", "VIEWER"), conn("c2", "同名集群", "ADMIN"));
            }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return "同名集群"; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        ConsolePrincipal viewer = delegated(set("conn:c1:overview"));
        assertFalse("同名连接中有一个不可见，实名查询必须拒绝",
                ConsoleConnVisibility.canSeeName(viewer, "同名集群", dup));
        assertTrue(ConsoleConnVisibility.canSeeName(
                new ConsolePrincipal("u", ConsoleRole.ADMIN, false), "同名集群", dup));
    }

    @Test
    public void 内置角色按minRole过滤连接() {
        ConsolePrincipal viewer = new ConsolePrincipal("u", ConsoleRole.VIEWER, false);
        assertTrue(ConsoleConnVisibility.canSee(viewer, "c1", store()));
        assertFalse(ConsoleConnVisibility.canSee(viewer, "c2", store()));
        assertTrue(ConsoleConnVisibility.canSeeHost(viewer));
        ConsolePrincipal op = new ConsolePrincipal("u", ConsoleRole.OPERATOR, false);
        assertTrue(ConsoleConnVisibility.canSee(op, "c2", store()));
    }

    @Test
    public void 已解析档案判定与快照一致_目标拦截器复用同口径() {
        ConsolePrincipal conn = delegated(set("conn:c1:overview"));
        assertTrue(ConsoleConnVisibility.canSeeResolved(conn, "c1", store().get("c1")));
        assertFalse("无 c2 页面键不得借 minRole 搭便车",
                ConsoleConnVisibility.canSeeResolved(conn, "c2", store().get("c2")));
        assertFalse("纯连接模型无 host 键不得访问宿主",
                ConsoleConnVisibility.canSeeResolved(conn, "host", null));

        ConsolePrincipal op = delegated(ConsoleRole.OPERATOR, set("conn:c2:overview"));
        assertTrue(ConsoleConnVisibility.canSeeResolved(op, "c2", store().get("c2")));
        assertFalse("c2 为 OPERATOR 门槛，VIEWER 静态页也不得进",
                ConsoleConnVisibility.canSeeResolved(delegated(set("overview")), "c2", store().get("c2")));
    }

    @Test
    public void 聚合全量判定_目录完整且全部可见才免选集群() {
        ConsolePrincipal viewer = delegated(set("overview"));
        assertFalse("c2 需 OPERATOR，VIEWER 未覆盖全量", ConsoleConnVisibility.snapshot(viewer, store()).seesAllKnown());
        assertTrue(ConsoleConnVisibility.snapshot(
                delegated(ConsoleRole.OPERATOR, set("overview")), store()).seesAllKnown());
        assertTrue("ADMIN 不受限", ConsoleConnVisibility.snapshot(
                new ConsolePrincipal("root", ConsoleRole.ADMIN, false), store()).seesAllKnown());

        ConnStore truncated = new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                List<Map<String, Object>> rows = new java.util.ArrayList<>();
                for (int i = 0; i < 200; i++) rows.add(conn("c" + i, "集群" + i, "VIEWER"));
                return rows;
            }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        assertFalse("目录达到 200 上限无法证明完整，聚合必须保持保守",
                ConsoleConnVisibility.snapshot(
                        delegated(ConsoleRole.OPERATOR, set("overview")), truncated).seesAllKnown());
    }

    @Test
    public void 目录读取失败或返回null时未知实名不得回落宿主() {
        ConnStore broken = new ConnStore() {
            @Override public List<Map<String, Object>> list() { return null; }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        ConsolePrincipal staticViewer = delegated(set("overview"));
        assertFalse("目录不可读时未知实名不得当宿主放行",
                ConsoleConnVisibility.canSeeName(staticViewer, "未知集群", broken));
        assertFalse("目录不可读时不得判定为全量可见（聚合查询会漏出未授权连接）",
                ConsoleConnVisibility.snapshot(staticViewer, broken).seesAllKnown());
    }
}
