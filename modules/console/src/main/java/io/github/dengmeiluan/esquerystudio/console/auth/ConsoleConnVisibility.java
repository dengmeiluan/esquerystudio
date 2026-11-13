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

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 连接可见性单一判定：连接目录、权限面板与监控数据必须同口径。
 *
 * <p>规则与前端 {@code canSeeConn} 对齐：ADMIN/无鉴权全可见；静态页（无 {@code conn:}
 * 前缀）对所有连接生效；纯连接模型只认 {@code conn:{id}:} 键；内置/角色模型按 minRole
 * 过滤。空授权集=全拒，零页面用户不得枚举连接名。</p>
 *
 * <p>连接目录 list() 可能是 ES 查询：批量判定用 {@link #snapshot} 一次取数，
 * 不得在循环里反复 list()。</p>
 */
public final class ConsoleConnVisibility {

    private ConsoleConnVisibility() {
    }

    /** 一次连接目录取数得到的判定快照；visibleIds=null 表示不受限。 */
    public static final class Snapshot {
        public final Set<String> visibleIds;
        public final Set<String> knownIds;
        /** 实名 → 连接 ID 集：重名连接必须全部可见才可按实名查询（防同名未授权连接搭便车）。 */
        public final Map<String, Set<String>> nameToIds;
        public final boolean storeReadable;
        public final boolean hostVisible;
        /** 目录原始行（脱敏视图），供连接目录复用，避免同请求内二次 list()。 */
        public final List<Map<String, Object>> rows;
        /**
         * 目录是否完整。EsConnStore 固定上限 200 条：达到上限时无法确定是否还有
         * 未列出的连接，聚合查询不得据此判定“全量可见”（否则第 201 个连接会漏出）。
         */
        public final boolean complete;

        Snapshot(Set<String> visibleIds, Set<String> knownIds, Map<String, Set<String>> nameToIds,
                 boolean storeReadable, boolean hostVisible,
                 List<Map<String, Object>> rows, boolean complete) {
            this.visibleIds = visibleIds;
            this.knownIds = knownIds;
            this.nameToIds = nameToIds;
            this.storeReadable = storeReadable;
            this.hostVisible = hostVisible;
            this.rows = rows;
            this.complete = complete;
        }

        public boolean seesId(String connId) {
            return visibleIds == null || visibleIds.contains(normalize(connId));
        }

        /** 非 ADMIN 是否已覆盖目录内全部连接（节点/Top 等无行标识的聚合查询才可免选集群）。 */
        public boolean seesAllKnown() {
            /* 目录读取失败时 knownIds 为空，containsAll 会假阳——“证明全可见”必须有可读目录 */
            return visibleIds == null
                    || (storeReadable && complete && hostVisible && visibleIds.containsAll(knownIds));
        }
    }

    public static Snapshot snapshot(ConsolePrincipal p, ConnStore store) {
        if (p == null || p.getRole().atLeast(ConsoleRole.ADMIN)) {
            return new Snapshot(null, Collections.<String>emptySet(),
                    Collections.<String, Set<String>>emptyMap(), true, true,
                    Collections.<Map<String, Object>>emptyList(), true);
        }
        List<Map<String, Object>> all;
        boolean readable = store != null;
        try {
            all = store == null ? Collections.<Map<String, Object>>emptyList() : store.list();
            if (all == null) {
                all = Collections.emptyList();
                readable = false; /* 目录返回 null 不能当作“已读且为空”：未知实名会回落宿主 */
            }
        } catch (Exception e) {
            all = Collections.emptyList();
            readable = false;
        }
        /* EsConnStore 分页上限 200：达到上限即无法证明目录完整，聚合查询保持保守 */
        boolean complete = all.size() < 200;
        Map<String, Set<String>> nameToIds = new LinkedHashMap<>();
        Set<String> ids = new LinkedHashSet<>();
        Set<String> known = new LinkedHashSet<>();
        boolean host = canSeeHost(p);
        if (host) ids.add("host");
        for (Map<String, Object> c : all) {
            String id = String.valueOf(c.get("id"));
            known.add(id);
            nameToIds.computeIfAbsent(String.valueOf(c.get("name")), k -> new LinkedHashSet<>()).add(id);
            ConsoleRole required = ConsoleRole.parse(
                    c.get("minRole") == null ? null : String.valueOf(c.get("minRole")));
            if (!p.getRole().atLeast(required)) continue;
            if (pageModelAllows(p, id)) ids.add(id);
        }
        return new Snapshot(ids, known, nameToIds, readable, host, all, complete);
    }

    /**
     * 已取到连接档案时的可见性判定（数据面拦截器每请求已 get 一次，不再 list 全目录）。
     * 语义与 {@link #canSee} 的“已知档案”分支一致：minRole + 页面模型双闸。
     */
    public static boolean canSeeResolved(ConsolePrincipal p, String connId, RemoteClusterConn conn) {
        if (p == null) return true;
        String id = normalize(connId);
        if (p.getRole().atLeast(ConsoleRole.ADMIN)) return true;
        if ("host".equals(id)) return canSeeHost(p);
        if (conn == null) return false;
        if (!p.getRole().atLeast(ConsoleRole.parse(conn.getMinRole()))) return false;
        return pageModelAllows(p, id);
    }

    public static boolean canSee(ConsolePrincipal p, String connId, ConnStore store) {
        if (p == null) return true;
        if (p.getRole().atLeast(ConsoleRole.ADMIN)) return true;
        String id = normalize(connId);
        if ("host".equals(id)) return canSeeHost(p);
        Snapshot snap = snapshot(p, store);
        if (snap.visibleIds != null) {
            if (snap.visibleIds.contains(id)) return true;
            /* 目录明确列出但不可见 → 拒绝；目录未列出（部分宿主只给摘要）→ 回落档案判定 */
            if (snap.knownIds.contains(id)) return false;
        }
        if (!minRoleAllows(p.getRole(), store, id)) return false;
        return pageModelAllows(p, id);
    }

    public static boolean canSeeHost(ConsolePrincipal p) {
        if (p == null) return true;
        if (p.getRole().atLeast(ConsoleRole.ADMIN)) return true;
        if (p.getGrantedPages() == null) return true;
        Set<String> gp = p.getGrantedPages();
        if (gp.isEmpty()) return false;
        if (hasStatic(gp)) return true;
        return gp.stream().anyMatch(g -> g != null && g.startsWith("conn:host:"));
    }

    /** 可见连接 ID 集；null=不受限（ADMIN/无鉴权）。host 以 "host" 表示。 */
    public static Set<String> visibleIds(ConsolePrincipal p, ConnStore store) {
        return snapshot(p, store).visibleIds;
    }

    /** 按集群实名判可见；未知实名仅在目录可读且 host 可见时视为宿主。 */
    public static boolean canSeeName(ConsolePrincipal p, String name, ConnStore store) {
        return canSeeName(snapshot(p, store), p, name);
    }

    /** 快照版实名判定：批量查询只取一次连接目录。 */
    public static boolean canSeeName(Snapshot snap, ConsolePrincipal p, String name) {
        if (p == null || p.getRole().atLeast(ConsoleRole.ADMIN)) return true;
        if (name == null || name.trim().isEmpty()) return false;
        if (snap.visibleIds == null) return true;
        Set<String> ids = snap.nameToIds.get(name.trim());
        if (ids != null) return snap.visibleIds.containsAll(ids);
        /* 目录外的实名只认宿主字面量：已删除/未列出的连接实名不得回落宿主
           （监控文档按连接采集，历史行可能属于已删除连接，不能当作宿主数据下发）。 */
        return snap.hostVisible && "host".equalsIgnoreCase(name.trim());
    }

    static boolean hasStatic(Set<String> gp) {
        return gp.stream().anyMatch(g -> g != null && !g.startsWith("conn:"));
    }

    public static String normalize(String connId) {
        if (connId == null || connId.trim().isEmpty()) return "host";
        String id = connId.trim();
        return "host".equalsIgnoreCase(id) ? "host" : id;
    }

    private static boolean pageModelAllows(ConsolePrincipal p, String id) {
        if (p.getGrantedPages() == null) return true;
        Set<String> gp = p.getGrantedPages();
        if (gp.isEmpty()) return false;
        if (hasStatic(gp)) return true;
        String prefix = "conn:" + id + ":";
        return gp.stream().anyMatch(g -> g != null && g.startsWith(prefix));
    }

    private static boolean minRoleAllows(ConsoleRole actual, ConnStore store, String id) {
        if (store == null) return false;
        try {
            for (Map<String, Object> c : store.list()) {
                if (!id.equals(String.valueOf(c.get("id")))) continue;
                ConsoleRole required = ConsoleRole.parse(
                        c.get("minRole") == null ? null : String.valueOf(c.get("minRole")));
                return actual.atLeast(required);
            }
            /* 目录行缺失时回落到档案读取（部分宿主/测试实现 list 不返回明细） */
            io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn conn = store.get(id);
            if (conn != null) {
                return actual.atLeast(ConsoleRole.parse(conn.getMinRole()));
            }
        } catch (Exception ignore) {
            return false;
        }
        return false;
    }
}
