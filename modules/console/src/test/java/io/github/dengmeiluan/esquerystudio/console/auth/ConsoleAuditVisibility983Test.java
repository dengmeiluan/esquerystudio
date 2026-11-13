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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;

/** 批次 983：审计行级隔离只能按 security 授权，不得借其它页面可见性扩权。 */
public class ConsoleAuditVisibility983Test {

    private static ConnStore store() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                List<Map<String, Object>> rows = new ArrayList<>();
                rows.add(row("c1", "QA"));
                rows.add(row("c2", "PROD"));
                return rows;
            }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) {
                return "c1".equals(id) ? "QA" : "c2".equals(id) ? "PROD" : null;
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

    private static Map<String, Object> row(String id, String name) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id);
        r.put("name", name);
        return r;
    }

    private static ConsoleOpsAuditEvent event(String connId, String connName) {
        return ConsoleOpsAuditEvent.builder()
                .username("u1").role("CLUSTER_OP").method("POST").uri("/internal/es/index/cluster/bulk")
                .action("WRITE").httpStatus(200).connId(connId).connName(connName)
                .build();
    }

    private static List<ConsoleOpsAuditEvent> rows() {
        return Arrays.asList(event("c1", "QA"), event("c2", "PROD"),
                event(null, "QA"), event(null, "PROD"), event(null, null));
    }

    private static ConsolePrincipal principal(ConsoleRole role, String... grants) {
        return new ConsolePrincipal("fs_ou_x1", role, false, true, "审计员", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    @Test
    public void 其它连接的任意页面读键不能扩大审计范围() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(rows(),
                principal(ConsoleRole.AUDIT_OP, "conn:c1:security", "conn:c2:overview"), store());
        assertEquals(2, out.size());
        assertEquals("c1", out.get(0).getConnId());
        assertEquals("QA", out.get(1).getConnName());
    }

    @Test
    public void 静态页面键也不能扩大审计范围() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(rows(),
                principal(ConsoleRole.AUDIT_OP, "conn:c1:security", "overview"), store());
        assertEquals(2, out.size());
        for (ConsoleOpsAuditEvent e : out) {
            if (e.getConnId() != null) assertEquals("c1", e.getConnId());
            else assertEquals("QA", e.getConnName());
        }
    }

    @Test
    public void 写形态security键同样按连接隔离() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(rows(),
                principal(ConsoleRole.AUDIT_OP, "conn:c1:w:security", "conn:c2:overview"), store());
        assertEquals(2, out.size());
        assertEquals("c1", out.get(0).getConnId());
    }

    @Test
    public void 宿主security键只看宿主会话事件() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(rows(),
                principal(ConsoleRole.AUDIT_OP, "conn:host:security"), store());
        assertEquals(1, out.size());
        assertEquals(null, out.get(0).getConnId());
        assertEquals(null, out.get(0).getConnName());
    }

    @Test
    public void 静态security仍是全局审计授权() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(rows(),
                principal(ConsoleRole.AUDIT_OP, "security"), store());
        assertEquals(5, out.size());
    }
}
