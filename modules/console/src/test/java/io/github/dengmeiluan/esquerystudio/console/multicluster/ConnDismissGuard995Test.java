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

import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.Before;
import org.junit.Test;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 人工删除的同步连接不再被自动扫描回灌(软删墓碑防线):
 * ①控制器删除入口对 cc- 同步档案走 {@link ConnStore#markDismissed}(不物理删),手工档案仍物理删除,
 *   两臂均关闭缓存长连接;②{@link JdbcConnStore} 墓碑契约——list/get 读面隐身、getSyncState 透传、
 *   save 整行更新不清标记、物理删除仍可达;③引擎 × 真实店集成:软删档案跨轮不再回灌且报告留痕。
 */
public class ConnDismissGuard995Test {

    /** 删除路由桩:物理删除与软删分开记账,其余最小实现。 */
    private static class DeleteRecordingStore implements ConnStore {
        final List<String> deleted = new ArrayList<>();
        final List<String> dismissed = new ArrayList<>();

        @Override public void delete(String id) { deleted.add(id); }

        @Override public void markDismissed(String id) { dismissed.add(id); }

        @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }

        @Override public RemoteClusterConn get(String id) { return null; }

        @Override public String getName(String id) { return null; }

        @Override public String getVersion(String id) { return null; }

        @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                  String password, String minRole, Integer ct, Integer st,
                                                  String env) {
            throw new UnsupportedOperationException();
        }

        @Override public void updateVersion(String id, String esVersion) { }
    }

    /** 记账路由桩:只记 evict,不建连。 */
    private static class RecordingRouter extends EsClientRouter {
        final List<String> evicted = new ArrayList<>();

        RecordingRouter() {
            super(null, null, null);
        }

        @Override public void evict(String connId) {
            evicted.add(connId);
        }
    }

    private JdbcConnStore store;
    private DataSource dataSource;

    @Before
    public void setUp() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:dismiss_" + UUID.randomUUID().toString().replace("-", "")
                + ";DB_CLOSE_DELAY=-1;MODE=MySQL");
        ds.setUser("sa");
        ds.setPassword("");
        this.dataSource = ds;
        this.store = new JdbcConnStore(ds);
    }

    /* ── 控制器删除入口 ── */

    @Test
    public void 控制器删除cc同步档案走软删不物理删() {
        DeleteRecordingStore s = new DeleteRecordingStore();
        RecordingRouter router = new RecordingRouter();
        EsClusterConnController c = new EsClusterConnController(s, router, null, null, null);
        String id = ClusterConnSyncEngine.syncIdOf("src-1");
        Map<String, Object> r = c.delete(id);
        assertTrue("cc- 同步档案走软删", s.dismissed.contains(id));
        assertFalse("不物理删墓碑(否则下轮被扫描回灌)", s.deleted.contains(id));
        assertTrue("缓存长连接仍被关闭", router.evicted.contains(id));
        assertEquals(id, String.valueOf(r.get("deleted")));
    }

    @Test
    public void 控制器删除手工档案仍物理删除() {
        DeleteRecordingStore s = new DeleteRecordingStore();
        RecordingRouter router = new RecordingRouter();
        EsClusterConnController c = new EsClusterConnController(s, router, null, null, null);
        Map<String, Object> r = c.delete("manual-1");
        assertTrue("手工域档案物理删除语义不变", s.deleted.contains("manual-1"));
        assertTrue("手工域不落软删标记", s.dismissed.isEmpty());
        assertTrue(router.evicted.contains("manual-1"));
        assertEquals("manual-1", String.valueOf(r.get("deleted")));
    }

    /* ── JdbcConnStore 墓碑契约 ── */

    @Test
    public void jdbc墓碑读面隐身_getSyncState透传_save不清标记() {
        String id = ClusterConnSyncEngine.syncIdOf("jdbc-src");
        store.save(id, "中心QA", "http://es-qa:9200", "elastic", "pw", null, null, null, "QA");
        assertEquals(1, store.list().size());
        assertNull("新建档案无标记", store.getSyncState(id));

        store.markSyncState(id, "STALE");
        store.markDismissed(id);
        assertEquals("软删标记落库", "DISMISSED", store.getSyncState(id));
        assertTrue("软删后列表读面隐身", store.list().isEmpty());
        assertNull("软删后数据面不可见(路由/探活不可再建连)", store.get(id));

        store.save(id, "中心QA(改名)", "http://es-qa:9200", "elastic", "", null, null, null, "QA");
        assertEquals("save 是整行更新但 sync_state 不在 SET 列,墓碑标记保留",
                "DISMISSED", store.getSyncState(id));
        assertTrue(store.list().isEmpty());

        store.save("manual-9", "手工", "http://es-m:9200", null, null, null, null, null, null);
        assertEquals("未软删档案不受影响", 1, store.list().size());
        assertNotNull(store.get("manual-9"));

        store.delete(id);
        assertNull("物理删除仍可达(存储层契约不变)", store.getSyncState(id));
        assertEquals(1, store.list().size());
    }

    @Test
    public void jdbc非法入参早退不抛_契约红线() {
        store.markDismissed(null);
        store.markDismissed("  ");
        assertNull(store.getSyncState(null));
        assertNull(store.getSyncState("  "));
    }

    /* ── 引擎 × 真实店集成 ── */

    @Test
    public void 引擎对软删墓碑跨轮不再回灌且报告留痕() {
        ClusterConnSyncEngine e = new ClusterConnSyncEngine(store, null, null,
                () -> Collections.singletonList(ContributedEsCluster.builder()
                        .sourceId("s1").name("中心集群").url("http://es-c:9200").rawEnv("qa").build()),
                3600, 3600, "VIEWER");
        e.runOnce("manual");
        String id = ClusterConnSyncEngine.syncIdOf("s1");
        assertEquals(1, store.list().size());

        store.markDismissed(id);
        assertTrue(store.list().isEmpty());
        ClusterConnSyncReport r2 = e.runOnce("scheduled");
        assertEquals("不回灌(不新建)", 0, r2.getCreated());
        assertEquals("不覆盖墓碑(不更新)", 0, r2.getUpdated());
        assertTrue("报告留痕", r2.getNotes().toString().contains("不再回灌"));
        assertTrue("墓碑保留,下轮继续隐身", store.list().isEmpty());
        assertEquals("DISMISSED", store.getSyncState(id));
    }
}
