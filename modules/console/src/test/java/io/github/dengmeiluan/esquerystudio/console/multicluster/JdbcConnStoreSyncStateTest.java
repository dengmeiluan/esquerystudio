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

import org.h2.jdbcx.JdbcDataSource;
import org.junit.Before;
import org.junit.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.Map;
import java.util.UUID;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 连接中心自动同步批:{@link JdbcConnStore} 的 sync_state 列——
 * ①新表 DDL 自带列 + markSyncState 往返透传;②存量旧表(无列)ensureSchema 幂等 ALTER 迁移;
 * ③save 更新保留 syncState(手工编辑失联档案不清标记);④契约红线:标记失败不抛(增强信息)。
 */
public class JdbcConnStoreSyncStateTest {

    private JdbcConnStore store;
    private DataSource dataSource;

    @Before
    public void setUp() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:sync_" + UUID.randomUUID().toString().replace("-", "")
                + ";DB_CLOSE_DELAY=-1;MODE=MySQL");
        ds.setUser("sa");
        ds.setPassword("");
        this.dataSource = ds;
        this.store = new JdbcConnStore(ds);
    }

    /** 存量旧表 DDL(加列前的历史形态,与 ensureSchema 旧版逐列一致,不含 sync_state)。 */
    private static final String LEGACY_DDL =
            "CREATE TABLE esquerystudio_conn ("
                    + "id VARCHAR(64) PRIMARY KEY,"
                    + "name VARCHAR(128) NOT NULL,"
                    + "scheme VARCHAR(8),"
                    + "host VARCHAR(255),"
                    + "port INT,"
                    + "username VARCHAR(128),"
                    + "password VARCHAR(512),"
                    + "min_role VARCHAR(16),"
                    + "connect_timeout_ms INT,"
                    + "socket_timeout_ms INT,"
                    + "env VARCHAR(16),"
                    + "es_version VARCHAR(32),"
                    + "created_at BIGINT,"
                    + "updated_at BIGINT)";

    @Test
    public void 新表自带syncState列_markStale往返透传() throws Exception {
        store.save(null, "qa 集群", "http://es-qa.internal:9200", "elastic", "pw", null, null, null, "QA");
        String id = String.valueOf(store.list().get(0).get("id"));

        assertNull("新建档案默认无标记", store.list().get(0).get("syncState"));
        store.markSyncState(id, "STALE");
        assertEquals("STALE", store.list().get(0).get("syncState"));
        store.markSyncState(id, null);
        assertNull("恢复即清标记", store.list().get(0).get("syncState"));
        assertFalse(store.list().get(0).containsKey("syncState")
                && store.list().get(0).get("syncState") != null);
    }

    @Test
    public void 存量旧表无列时ensureSchema幂等ALTER迁移() throws Exception {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(LEGACY_DDL);
            st.execute("INSERT INTO esquerystudio_conn (id,name,created_at,updated_at) "
                    + "VALUES ('old-1','历史连接',1,1)");
        }
        JdbcConnStore onLegacy = new JdbcConnStore(dataSource);
        Map<String, Object> view = onLegacy.list().get(0);
        assertEquals("迁移后旧数据可读", "历史连接", view.get("name"));
        assertNull("旧数据无标记", view.get("syncState"));

        onLegacy.markSyncState("old-1", "STALE");
        assertEquals("迁移后可落标记", "STALE", onLegacy.list().get(0).get("syncState"));
    }

    @Test
    public void save更新保留syncState_手工编辑失联档案不清标记() {
        String id = store.save(null, "prod 集群", "http://es-prd:9200", "elastic", "pw", null, null, null, "PROD")
                .get("id").toString();
        store.markSyncState(id, "STALE");
        store.save(id, "prod 集群(改名)", "http://es-prd:9200", "elastic", "", null, null, null, "PROD");
        assertEquals("save 是整行更新但 sync_state 不在 SET 列——失联标记必须保留",
                "STALE", store.list().get(0).get("syncState"));
    }

    @Test
    public void 非法入参早退不抛_契约红线() {
        store.markSyncState(null, "STALE");
        store.markSyncState("  ", "STALE");
        assertTrue("无异常即通过(增强信息绝不反噬主流程)", true);
    }
}
