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

/** 全量审计流水的行级连接隔离：conn:{id}:security 只能看该连接事件。 */
public class ConsoleAuditVisibility979Test {

    private static ConnStore store() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                List<Map<String, Object>> rows = new ArrayList<>();
                rows.add(row("c1", "腾讯云QA"));
                rows.add(row("c2", "腾讯云PROD"));
                return rows;
            }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) {
                return "c1".equals(id) ? "腾讯云QA" : "c2".equals(id) ? "腾讯云PROD" : null;
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
        r.put("minRole", "VIEWER");
        return r;
    }

    private static ConsoleOpsAuditEvent event(String connId, String connName) {
        return ConsoleOpsAuditEvent.builder()
                .username("u1").role("CLUSTER_OP").method("POST").uri("/internal/es/index/cluster/bulk")
                .action("WRITE").httpStatus(200).connId(connId).connName(connName)
                .build();
    }

    private static List<ConsoleOpsAuditEvent> rows() {
        return Arrays.asList(event("c1", "腾讯云QA"), event("c2", "腾讯云PROD"),
                event(null, "腾讯云QA"), event(null, "腾讯云PROD"), event(null, null));
    }

    private static ConsolePrincipal principal(ConsoleRole role, String... grants) {
        return new ConsolePrincipal("fs_ou_x1", role, false, true, "审计员", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    @Test
    public void 连接维度security读键只下发本连接事件() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(
                rows(), principal(ConsoleRole.VIEWER, "conn:c1:security"), store());
        assertEquals(2, out.size());
        assertEquals("c1", out.get(0).getConnId());
        assertEquals("腾讯云QA", out.get(1).getConnName());
    }

    @Test
    public void 纯连接模型不下发无连接标识的会话事件() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(
                rows(), principal(ConsoleRole.VIEWER, "conn:c1:security"), store());
        assertEquals(2, out.size());
        for (ConsoleOpsAuditEvent e : out) {
            if (e.getConnId() == null) assertEquals("腾讯云QA", e.getConnName());
        }
    }

    @Test
    public void 静态security全局授权与ADMIN保持全量() {
        List<ConsoleOpsAuditEvent> staticView = ConsoleAuditVisibility.filter(
                rows(), principal(ConsoleRole.AUDIT_OP, "security"), store());
        assertEquals(5, staticView.size());
        List<ConsoleOpsAuditEvent> adminView = ConsoleAuditVisibility.filter(
                rows(), principal(ConsoleRole.ADMIN, "conn:c1:security"), store());
        assertEquals(5, adminView.size());
    }

    @Test
    public void 空授权集不下发任何事件() {
        List<ConsoleOpsAuditEvent> out = ConsoleAuditVisibility.filter(
                rows(), principal(ConsoleRole.VIEWER), store());
        assertEquals(0, out.size());
    }
}
