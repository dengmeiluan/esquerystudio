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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 全量审计流水读侧连接隔离：security 页读键可能只授予某个连接
 * （{@code conn:{id}:security}），此时不得看到其它连接/宿主的事件。
 * 纯连接模型下无连接标识的会话级事件（LOGIN 等）也不下发；静态全局页授权
 * 与 ADMIN 保持全量视图。
 */
public final class ConsoleAuditVisibility {

    private ConsoleAuditVisibility() {
    }

    /** conn:{id}:security / conn:{id}:w:security（与 EnvPagesResolver 的连接键语法同源）。 */
    private static final Pattern CONN_SECURITY_KEY =
            Pattern.compile("^conn:([^:]+):(?:w:)?security$");

    public static List<ConsoleOpsAuditEvent> filter(List<ConsoleOpsAuditEvent> records,
                                                    ConsolePrincipal p, ConnStore store) {
        if (records == null || records.isEmpty()) return records;
        if (p == null || p.getRole().atLeast(ConsoleRole.ADMIN)) return records;
        Set<String> gp = p.getGrantedPages();
        if (gp == null) return records;
        /* 审计可见性只认 security 授权本身：其它页面读键（含其它连接的）不得放大审计范围。 */
        boolean global = false;
        boolean host = false;
        Set<String> connIds = new HashSet<>();
        for (String g : gp) {
            if (g == null) continue;
            if ("security".equals(g) || "w:security".equals(g)) {
                global = true;
                continue;
            }
            Matcher m = CONN_SECURITY_KEY.matcher(g);
            if (!m.matches()) continue;
            String id = m.group(1);
            if ("host".equalsIgnoreCase(id)) host = true;
            else connIds.add(id);
        }
        if (global) return records;
        if (connIds.isEmpty() && !host) return new ArrayList<>();
        /* 审计行同样受连接可见性（minRole + 页面模型）约束：只有 security 读键、
           但角色低于连接 minRole 的用户不得读取该连接的 IP/URI/账号维度流水。
           快照一次取数，避免逐行 list()。 */
        ConsoleConnVisibility.Snapshot snap = ConsoleConnVisibility.snapshot(p, store);
        List<ConsoleOpsAuditEvent> out = new ArrayList<>();
        for (ConsoleOpsAuditEvent e : records) {
            String id = e.getConnId();
            if (id != null && !id.trim().isEmpty()) {
                String cid = id.trim();
                if (connIds.contains(cid) && snap.seesId(cid)) out.add(e);
                continue;
            }
            String name = e.getConnName();
            if (name != null && !name.trim().isEmpty()) {
                Set<String> ids = snap.nameToIds.get(name.trim());
                if (ids != null && !ids.isEmpty() && connIds.containsAll(ids)) {
                    boolean visible = true;
                    for (String cid : ids) {
                        if (!snap.seesId(cid)) { visible = false; break; }
                    }
                    if (visible) out.add(e);
                }
                continue;
            }
            /* 无连接标识=宿主/会话级事件：只有显式 host security 且宿主可见才下发。 */
            if (host && snap.hostVisible) out.add(e);
        }
        return out;
    }
}
