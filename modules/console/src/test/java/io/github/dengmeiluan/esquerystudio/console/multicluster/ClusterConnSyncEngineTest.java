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
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 连接中心自动同步批:引擎全语义行为锁(FakeStore 直构造,仓内无 mockito 基线)。
 * 覆盖:幂等 id/节点规范化/首建/指纹免刷/指纹变更落库/源内判重/手工优先冲突/
 * STALE 标记-恢复-人工软删档案不再回灌/降级红线/skipReason/配置默认 minRole/环境映射集成。
 */
public class ClusterConnSyncEngineTest {

    /** 内存 ConnStore 桩:save 语义对齐真店(密码入 full、视图脱敏),markSyncState 记调用。 */
    private static class FakeStore implements ConnStore {
        final Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
        final Map<String, RemoteClusterConn> full = new LinkedHashMap<>();
        final List<String> staleCalls = new ArrayList<>();
        int saveCalls;

        @Override public List<Map<String, Object>> list() {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map.Entry<String, Map<String, Object>> e : rows.entrySet()) {
                Object st = e.getValue().get("syncState");
                if (STATE_DISMISSED.equalsIgnoreCase(st == null ? null : String.valueOf(st))) {
                    continue; // 对齐真店契约:软删墓碑不透出读面
                }
                Map<String, Object> v = new LinkedHashMap<>(e.getValue());
                v.put("id", e.getKey());
                out.add(v);
            }
            return out;
        }

        @Override public RemoteClusterConn get(String id) {
            RemoteClusterConn c = full.get(id);
            return c == null ? null : c;
        }

        @Override public String getName(String id) {
            Map<String, Object> r = rows.get(id);
            return r == null ? null : String.valueOf(r.get("name"));
        }

        @Override public String getVersion(String id) { return null; }

        @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                  String password, String minRole, Integer ct, Integer st, String env) {
            return save(id, name, url, username, password, minRole, ct, st, env, null);
        }

        @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                  String secret, String minRole, Integer ct, Integer st,
                                                  String env, String authType) {
            saveCalls++;
            String docId = id == null || id.trim().isEmpty() ? "gen" + rows.size() : id.trim();
            RemoteClusterConn p = RemoteClusterConn.parse(url);
            if (username != null && !username.trim().isEmpty()) p.setUsername(username.trim());
            if (secret != null && !secret.isEmpty()) p.setPassword(secret);
            Map<String, Object> old = rows.get(docId);
            String pw = p.getPassword();
            if ((pw == null || pw.isEmpty()) && old != null) {
                RemoteClusterConn oc = full.get(docId);
                pw = oc == null ? null : oc.getPassword();
            }
            full.put(docId, p);
            p.setPassword(pw);
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("name", name.trim());
            v.put("scheme", p.getScheme());
            v.put("host", p.getHost());
            v.put("port", p.getPort());
            v.put("username", p.getUsername());
            v.put("hasPassword", pw != null && !pw.isEmpty());
            v.put("minRole", minRole == null || minRole.trim().isEmpty() ? "VIEWER" : minRole.trim().toUpperCase(Locale.ROOT));
            v.put("env", env == null || env.trim().isEmpty() ? null : env.trim().toUpperCase(Locale.ROOT));
            v.put("authType", authType == null || authType.trim().isEmpty()
                    ? "BASIC" : authType.trim().toUpperCase(java.util.Locale.ROOT));
            if (old != null && old.get("syncState") != null) v.put("syncState", old.get("syncState"));
            rows.put(docId, v);
            return v;
        }

        @Override public void updateVersion(String id, String esVersion) { }

        @Override public void delete(String id) {
            rows.remove(id);
            full.remove(id);
        }

        @Override public void markSyncState(String id, String state) {
            staleCalls.add(id + "=" + state);
            Map<String, Object> r = rows.get(id);
            if (r == null) return;
            if (state == null || state.trim().isEmpty()) r.remove("syncState");
            else r.put("syncState", state);
        }

        @Override public void markDismissed(String id) {
            markSyncState(id, STATE_DISMISSED);
        }

        @Override public String getSyncState(String id) {
            Map<String, Object> r = rows.get(id);
            return r == null || r.get("syncState") == null ? null : String.valueOf(r.get("syncState"));
        }
    }

    private FakeStore store;
    private AtomicInteger contributeCalls;

    @Before
    public void setUp() {
        store = new FakeStore();
        contributeCalls = new AtomicInteger();
    }

    private ClusterConnSyncEngine engine(ClusterConnContributor c) {
        // router/prober 传 null:引擎须对两者容空(单测无真实路由/探活)
        return new ClusterConnSyncEngine(store, null, null, c, 3600, 3600, "VIEWER");
    }

    private static ContributedEsCluster cluster(String sourceId, String name, String url,
                                                String user, String pw, String rawEnv) {
        return ContributedEsCluster.builder()
                .sourceId(sourceId).name(name).url(url).username(user).password(pw).rawEnv(rawEnv).build();
    }

    /* ── 静态工具 ── */

    @Test
    public void syncIdOf确定性且带前缀() {
        String a = ClusterConnSyncEngine.syncIdOf("conn-1");
        assertEquals("同源同 id(幂等锚点)", a, ClusterConnSyncEngine.syncIdOf("conn-1"));
        assertTrue("cc- 前缀圈定同步域", a.startsWith("cc-"));
        assertEquals("cc- + 24 hex ≤ DDL VARCHAR(64)", 27, a.length());
        assertFalse("不同源不同 id", a.equals(ClusterConnSyncEngine.syncIdOf("conn-2")));
    }

    @Test
    public void normalizeNode规范化_scheme缺省_凭据剥离_大小写归一() {
        assertEquals("http://es-a:9200", ClusterConnSyncEngine.normalizeNode("HTTP://User:Pw@ES-A:9200/"));
        assertEquals("http://es-b:9200", ClusterConnSyncEngine.normalizeNode("es-b:9200"));
        assertEquals("https://es-c:9200", ClusterConnSyncEngine.normalizeNode("https://es-c:9200"));
        assertNull(ClusterConnSyncEngine.normalizeNode("  "));
        assertNull(ClusterConnSyncEngine.normalizeNode(null));
    }

    /* ── 同步主流程 ── */

    @Test
    public void 首轮全量创建_环境映射与默认minRole落位() {
        ClusterConnSyncEngine e = engine(() -> Arrays.asList(
                cluster("c1", "QA 集群", "http://es-qa:9200", "elastic", "pw", "qa"),
                cluster("c2", "UAT 集群", "http://es-uat:9200", null, null, "uat"),
                cluster("c3", "怪值集群", "http://es-x:9200", null, null, "staging2"),
                cluster("c4", "无标集群", "http://es-n:9200", null, null, null)));
        ClusterConnSyncReport r = e.runOnce("manual");

        assertEquals(4, r.getCreated());
        assertEquals("QA", store.rows.get(ClusterConnSyncEngine.syncIdOf("c1")).get("env"));
        assertEquals("uat→STAGING", "STAGING", store.rows.get(ClusterConnSyncEngine.syncIdOf("c2")).get("env"));
        assertEquals("未知值 fail-closed 归 PROD", "PROD", store.rows.get(ClusterConnSyncEngine.syncIdOf("c3")).get("env"));
        assertNull("空白=未标注", store.rows.get(ClusterConnSyncEngine.syncIdOf("c4")).get("env"));
        assertEquals("VIEWER", store.rows.get(ClusterConnSyncEngine.syncIdOf("c1")).get("minRole"));
        assertEquals("password 已入店(服务端流转)", "pw", store.full.get(ClusterConnSyncEngine.syncIdOf("c1")).getPassword());
    }

    @Test
    public void 指纹免刷_全同零save_防SAVED事件刷菜单() {
        List<ContributedEsCluster> same = Collections.singletonList(
                cluster("c1", "QA 集群", "http://es-qa:9200", "elastic", "pw", "qa"));
        ClusterConnSyncEngine e = engine(() -> same);
        e.runOnce("manual");
        int afterFirst = store.saveCalls;
        ClusterConnSyncReport r2 = e.runOnce("scheduled");
        assertEquals("无变化不 save", afterFirst, store.saveCalls);
        assertEquals(1, r2.getUnchanged());
    }

    @Test
    public void 指纹变更_密码或名字变触发save更新() {
        AtomicInteger round = new AtomicInteger();
        ClusterConnSyncEngine e = engine(() -> round.incrementAndGet() == 1
                ? Collections.singletonList(cluster("c1", "QA 集群", "http://es-qa:9200", "elastic", "pw", "qa"))
                : Collections.singletonList(cluster("c1", "QA 集群", "http://es-qa:9200", "elastic", "pw2", "qa")));
        e.runOnce("manual");
        ClusterConnSyncReport r2 = e.runOnce("scheduled");
        assertEquals("密码变→更新", 1, r2.getUpdated());
        assertEquals("pw2", store.full.get(ClusterConnSyncEngine.syncIdOf("c1")).getPassword());
    }

    @Test
    public void 源内判重_同env节点集交集并入_保留sourceId字典序最小() {
        ClusterConnSyncEngine e = engine(() -> Arrays.asList(
                cluster("c2", "B 登记", "http://es-a:9200", null, null, "qa"),
                cluster("c1", "A 登记", "http://es-a:9201,http://es-a:9200", null, null, "qa")));
        ClusterConnSyncReport r = e.runOnce("manual");
        assertEquals("并入一条", 1, r.getCreated());
        assertEquals(1, r.getDuplicatesMerged());
        assertTrue("保留 sourceId 字典序小者(c1)",
                store.rows.containsKey(ClusterConnSyncEngine.syncIdOf("c1")));
        assertFalse(store.rows.containsKey(ClusterConnSyncEngine.syncIdOf("c2")));
    }

    @Test
    public void 手工优先_同集群冲突跳过且手工档案零触碰() {
        store.save("manual-1", "手工生产", "http://es-a:9200", "ops", "keep", "ADMIN", null, null, "PROD");
        ClusterConnSyncEngine e = engine(() -> Collections.singletonList(
                cluster("c1", "中心生产", "http://es-a:9200", "elastic", "pw", "prod")));
        ClusterConnSyncReport r = e.runOnce("manual");
        assertEquals(1, r.getSkippedConflicts());
        assertEquals(0, r.getCreated());
        assertEquals("手工档案用户名未被同步覆盖", "ops", store.full.get("manual-1").getUsername());
        assertEquals("手工档案密码零触碰", "keep", store.full.get("manual-1").getPassword());
    }

    @Test
    public void 失联标记STALE_源复现自动恢复() {
        AtomicInteger round = new AtomicInteger();
        ClusterConnSyncEngine e = engine(() -> {
            int r = round.incrementAndGet();
            if (r == 1) return Arrays.asList(
                    cluster("c1", "QA", "http://es-qa:9200", null, null, "qa"),
                    cluster("c2", "UAT", "http://es-uat:9200", null, null, "uat"));
            if (r == 2) return Collections.singletonList(
                    cluster("c1", "QA", "http://es-qa:9200", null, null, "qa"));
            return Arrays.asList(
                    cluster("c1", "QA", "http://es-qa:9200", null, null, "qa"),
                    cluster("c2", "UAT", "http://es-uat:9200", null, null, "uat"));
        });
        e.runOnce("manual");
        ClusterConnSyncReport r2 = e.runOnce("scheduled");
        assertEquals(1, r2.getMarkedStale());
        assertEquals("STALE", store.rows.get(ClusterConnSyncEngine.syncIdOf("c2")).get("syncState"));
        ClusterConnSyncReport r3 = e.runOnce("scheduled");
        assertEquals("源复现自动恢复", 1, r3.getRestored());
        assertNull(store.rows.get(ClusterConnSyncEngine.syncIdOf("c2")).get("syncState"));
    }

    @Test
    public void 人工删除的同步档案软删后不再回灌_在线与失联同规() {
        AtomicInteger round = new AtomicInteger();
        ClusterConnSyncEngine e = engine(() -> {
            int r = round.incrementAndGet();
            if (r == 1) return Arrays.asList(
                    cluster("c1", "QA", "http://es-qa:9200", null, null, "qa"),
                    cluster("c2", "UAT", "http://es-uat:9200", null, null, "uat"));
            return Collections.singletonList(cluster("c1", "QA", "http://es-qa:9200", null, null, "qa"));
        });
        e.runOnce("manual");
        e.runOnce("scheduled"); // c2 → STALE
        String c2 = ClusterConnSyncEngine.syncIdOf("c2");
        String c1 = ClusterConnSyncEngine.syncIdOf("c1");
        store.markDismissed(c2); // 人工删除失联档案(软删墓碑)
        store.markDismissed(c1); // 人工删除在线档案(软删墓碑)
        int before = store.saveCalls;
        ClusterConnSyncReport r3 = e.runOnce("scheduled");
        assertEquals("删除的同步档案不回灌(不新建)", 0, r3.getCreated());
        assertEquals("且不覆盖既有墓碑(不更新)", 0, r3.getUpdated());
        assertEquals("墓碑不参与失联标记", 0, r3.getMarkedStale());
        assertEquals("零 save(不覆盖档案、不改 createdAt)", before, store.saveCalls);
        assertEquals("墓碑标记保留(不清标记)", "DISMISSED", store.getSyncState(c1));
        assertEquals("DISMISSED", store.getSyncState(c2));
        assertTrue("报告留痕:被软删挡下的条目对运维可见",
                r3.getNotes().toString().contains("不再回灌"));
    }

    @Test
    public void 降级红线_contribute抛错一次WARN后本进程永久降级() {
        AtomicInteger calls = new AtomicInteger();
        ClusterConnSyncEngine e = engine(() -> {
            calls.incrementAndGet();
            throw new IllegalStateException("连接中心不可达");
        });
        ClusterConnSyncReport r = e.runOnce("manual");
        assertTrue(r.isContributorBroken());
        assertEquals(1, calls.get());
        ClusterConnSyncReport r2 = e.runOnce("manual");
        assertTrue("broken 后短路不再调用", r2.isContributorBroken());
        assertEquals("贡献者只被调一次", 1, calls.get());
    }

    @Test
    public void skipReason与无效条跳过且不落库() {
        ClusterConnSyncEngine e = engine(() -> Arrays.asList(
                ContributedEsCluster.builder().sourceId("c9").name("仅apiKey").url("http://es-k:9200")
                        .rawEnv("qa").skipReason("API_KEY_仅连接中心可用").build(),
                cluster("c10", "缺url", "", null, null, "qa")));
        ClusterConnSyncReport r = e.runOnce("manual");
        assertEquals(2, r.getSkipped());
        assertEquals(0, r.getCreated());
        assertTrue(store.rows.isEmpty());
    }

    @Test
    public void apiKey形态端到端_透传与指纹免刷() {
        AtomicInteger round = new AtomicInteger();
        ClusterConnSyncEngine e = engine(() -> {
            round.incrementAndGet();
            return Collections.singletonList(
                    ContributedEsCluster.builder().sourceId("ak1").name("price 专用")
                            .url("http://es-cn-price:9200").authType("API_KEY")
                            .password("ak-secret").rawEnv("prod").build());
        });
        ClusterConnSyncReport r1 = e.runOnce("manual");
        assertEquals(1, r1.getCreated());
        assertEquals("API_KEY", store.rows.get(ClusterConnSyncEngine.syncIdOf("ak1")).get("authType"));
        assertEquals("ak-secret", store.full.get(ClusterConnSyncEngine.syncIdOf("ak1")).getPassword());
        int afterFirst = store.saveCalls;
        ClusterConnSyncReport r2 = e.runOnce("scheduled");
        assertEquals("同形态指纹全同 → 免刷", afterFirst, store.saveCalls);
        assertEquals(1, r2.getUnchanged());
    }

    @Test
    public void authType变化触发更新_账密切ApiKey() {
        AtomicInteger round = new AtomicInteger();
        ClusterConnSyncEngine e = engine(() -> {
            int r = round.incrementAndGet();
            ContributedEsCluster.Builder b = ContributedEsCluster.builder().sourceId("m1")
                    .name("集群").url("http://es-m:9200").rawEnv("qa");
            if (r == 1) return Collections.singletonList(b.username("elastic").password("pw").build());
            return Collections.singletonList(b.authType("API_KEY").password("ak-2").build());
        });
        e.runOnce("manual");
        ClusterConnSyncReport r2 = e.runOnce("scheduled");
        assertEquals("认证形态变化必须更新(指纹)", 1, r2.getUpdated());
        assertEquals("API_KEY", store.rows.get(ClusterConnSyncEngine.syncIdOf("m1")).get("authType"));
    }

    @Test
    public void minRole配置默认可覆盖_贡献者显式值优先() {
        ClusterConnSyncEngine e = new ClusterConnSyncEngine(store, null, null,
                () -> Collections.singletonList(
                        ContributedEsCluster.builder().sourceId("c1").name("n").url("http://a:9200")
                                .minRole("OPERATOR").build()),
                3600, 3600, "ADMIN");
        e.runOnce("manual");
        assertEquals("贡献者显式 minRole 优先", "OPERATOR", store.rows.get(ClusterConnSyncEngine.syncIdOf("c1")).get("minRole"));
    }
}
