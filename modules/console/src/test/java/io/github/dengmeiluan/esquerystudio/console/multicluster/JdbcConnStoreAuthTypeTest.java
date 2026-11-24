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
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 连接中心自动同步批·API Key 认证支持:{@link JdbcConnStore} 的 auth_type 列——
 * ①10 参 save(API_KEY 形态:secret 位承载 ApiKey)落库/读取/列表透传;
 * ②存量表幂等 ALTER 迁移;③9 参老形态默认 BASIC 零破坏;④authType 非法值拒绝。
 * H2 真往返(配方同 JdbcConnStoreSyncStateTest;H2 标识符大写,列探测双档大小写)。
 */
public class JdbcConnStoreAuthTypeTest {

    private JdbcConnStore store;
    private DataSource dataSource;

    @Before
    public void setUp() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:auth_" + UUID.randomUUID().toString().replace("-", "")
                + ";DB_CLOSE_DELAY=-1;MODE=MySQL");
        ds.setUser("sa");
        ds.setPassword("");
        this.dataSource = ds;
        this.store = new JdbcConnStore(ds);
    }

    /** 存量旧表 DDL(加 auth_type 之前的历史形态,含 sync_state 列)。 */
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
                    + "updated_at BIGINT,"
                    + "sync_state VARCHAR(16))";

    private Map<String, Object> byId(String id) {
        return store.list().stream()
                .filter(v -> id.equals(v.get("id"))).findFirst().orElse(null);
    }

    @Test
    public void apiKey形态落库_secret位承载ApiKey_get与列表透传authType() {
        String basicId = store.save(null, "基础形态", "http://es-cn-x:9200", "elastic", "pw-basic",
                null, null, null, "PROD").get("id").toString();

        String apiKeyId = store.save(null, "price 专用", "http://es-cn-y:9200", null,
                "ak-secret-value", "VIEWER", null, null, "PROD", "API_KEY").get("id").toString();

        Map<String, Object> apiKeyView = byId(apiKeyId);
        assertEquals("API_KEY", apiKeyView.get("authType"));
        assertEquals("API_KEY 形态用户名为空", null, apiKeyView.get("username"));
        assertEquals("get 恢复 authType 供工厂分支", "API_KEY", store.get(apiKeyId).getAuthType());
        assertEquals("get 必须回填 env（env-pages 环境收缩的唯一输入）",
                "PROD", store.get(apiKeyId).getEnv());
        assertEquals("secret 位承载 ApiKey 明文(服务端红线:仅内存流转)",
                "ak-secret-value", store.get(apiKeyId).getPassword());

        Map<String, Object> basicView = byId(basicId);
        assertEquals("9 参老形态默认 BASIC", "BASIC", basicView.get("authType"));
        assertEquals("BASIC 档案 get 归一 BASIC(空缺归一语义)", "BASIC", store.get(basicId).getAuthType());
        assertEquals("BASIC 档案密码位不动", "pw-basic", store.get(basicId).getPassword());
    }

    @Test
    public void 存量表无auth_type列时ensureSchema幂等ALTER迁移() throws Exception {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(LEGACY_DDL);
            st.execute("INSERT INTO esquerystudio_conn (id,name,created_at,updated_at) "
                    + "VALUES ('old-1','历史连接',1,1)");
        }
        JdbcConnStore onLegacy = new JdbcConnStore(dataSource);
        assertEquals("迁移后旧数据可读", "历史连接", onLegacy.list().get(0).get("name"));

        onLegacy.save(null, "新 API Key 连接", "http://es-new:9200", null, "ak-1",
                null, null, null, "PROD", "API_KEY");
        assertEquals("迁移后 API_KEY 档案可落库", "API_KEY",
                onLegacy.list().stream()
                        .filter(v -> "新 API Key 连接".equals(v.get("name")))
                        .findFirst().orElse(null).get("authType"));
    }

    @Test
    public void authType非法值拒绝_与env同款校验() {
        try {
            store.save(null, "bad", "http://es:9200", null, null, null, null, null, null, "OAUTH2");
            fail("非法 authType 必须拒绝");
        } catch (IllegalArgumentException expected) {
            assertTrue("拒绝消息点名 authType", expected.getMessage().contains("authType"));
        }
    }
}
