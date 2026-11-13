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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;

/** 批次 984：审计行除 security 键外还必须过连接 minRole/可见性。 */
public class ConsoleAuditVisibility984Test {

    private static ConnStore store(String minRole) {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                List<Map<String, Object>> rows = new ArrayList<>();
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("id", "c1");
                r.put("name", "QA");
                r.put("minRole", minRole);
                rows.add(r);
                return rows;
            }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return "c1".equals(id) ? "QA" : null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static ConsoleOpsAuditEvent event(String connId, String connName) {
        return ConsoleOpsAuditEvent.builder()
                .username("u1").role("AUDIT_OP").method("POST").uri("/internal/es/index/cluster/bulk")
                .action("WRITE").httpStatus(200).connId(connId).connName(connName)
                .build();
    }

    private static ConsolePrincipal principal(String... grants) {
        return new ConsolePrincipal("u", ConsoleRole.AUDIT_OP, false, true, "审计员", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    private static List<ConsoleOpsAuditEvent> rows() {
        return Arrays.asList(event("c1", "QA"), event(null, "QA"), event(null, null));
    }

    @Test
    public void 角色低于连接minRole时即使持security键也看不到该连接审计() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(
                rows(), principal("conn:c1:security"), store("ADMIN"));
        assertEquals(Collections.emptyList(), out);
    }

    @Test
    public void 角色达到连接minRole时security键正常可见() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(
                rows(), principal("conn:c1:security"), store("VIEWER"));
        assertEquals(2, out.size());
        assertEquals("c1", out.get(0).getConnId());
        assertEquals("QA", out.get(1).getConnName());
    }

    @Test
    public void 宿主security键只看到宿主会话事件() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(
                rows(), principal("conn:host:security"), store("ADMIN"));
        assertEquals(1, out.size());
        assertEquals(null, out.get(0).getConnId());
        assertEquals(null, out.get(0).getConnName());
    }

    @Test
    public void 管理员保持全量() {
        ConsolePrincipal admin = new ConsolePrincipal("a", ConsoleRole.ADMIN, false, true);
        assertEquals(rows().size(), ConsoleAuditVisibility.filter(rows(), admin, store("ADMIN")).size());
    }
}
