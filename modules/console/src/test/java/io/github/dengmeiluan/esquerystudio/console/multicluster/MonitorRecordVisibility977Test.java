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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;

/** 监控读侧行级隔离：连接模型下不得把未授权连接的行返回给调用方。 */
public class MonitorRecordVisibility977Test {

    private static ConnStore store() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() {
                Map<String, Object> c1 = new LinkedHashMap<>();
                c1.put("id", "c1"); c1.put("name", "生产集群"); c1.put("minRole", "VIEWER");
                Map<String, Object> c2 = new LinkedHashMap<>();
                c2.put("id", "c2"); c2.put("name", "灾备集群"); c2.put("minRole", "VIEWER");
                return Arrays.asList(c1, c2);
            }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return id; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static Map<String, Object> rec(String key, String value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(key, value);
        return m;
    }

    @Test
    public void 纯连接用户只保留自己连接的监控行() {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                new HashSet<>(Arrays.asList("conn:c1:overview", "conn:c1:w:overview")));
        List<Map<String, Object>> rows = Arrays.asList(
                rec("connId", "c1"), rec("connId", "c2"),
                rec("connName", "生产集群"), rec("connName", "灾备集群"),
                rec("nodeName", "node-1"));
        List<Map<String, Object>> filtered = MonitorRecordVisibility.filterByIdentity(rows, p, store());
        assertEquals(2, filtered.size());
        assertEquals("c1", filtered.get(0).get("connId"));
        assertEquals("生产集群", filtered.get(1).get("connName"));
    }

    @Test
    public void ADMIN与无鉴权部署不过滤() {
        List<Map<String, Object>> rows = Arrays.asList(rec("connId", "c1"), rec("connId", "c2"));
        ConsolePrincipal admin = new ConsolePrincipal("u", ConsoleRole.ADMIN, false);
        assertEquals(2, MonitorRecordVisibility.filterByIdentity(rows, admin, store()).size());
        assertEquals(2, MonitorRecordVisibility.filterByIdentity(rows, null, store()).size());
    }
}
