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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * target-aware adhoc 轮：job 必须持久化目标身份（targetId + 名称/版本快照），
 * 旧数据（无 target 字段）回读一律归一 host。三档存储（内存/JDBC/ES payload）同契约；
 * ES 档与 JDBC 档共用 toMap 快照语义，此处以 JDBC 真 SQL 往返钉死列迁移与回读。
 */
public class AdhocTargetPersistenceTest {

    private static AdhocRebuildJob job(String jobId, String targetId, String name, String ver) {
        return new AdhocRebuildJob(jobId, "my-index", AdhocRebuildJob.Strategy.INCREMENTAL, true,
                "src_phys", "dst_phys", "updateTime", 5000L, true, true, targetId, name, ver);
    }

    @Test
    public void toMapRetainsTargetIdentity() {
        AdhocRebuildJob j = job("job-1", "conn:qa", "QA 6.7", "6.7.2");
        assertThat(j.getTargetId()).isEqualTo("conn:qa");
        assertThat(j.getTargetNameSnapshot()).isEqualTo("QA 6.7");
        assertThat(j.getTargetEsVersionSnapshot()).isEqualTo("6.7.2");
        assertThat(j.toMap().get("targetId")).isEqualTo("conn:qa");
        assertThat(j.toMap().get("targetName")).isEqualTo("QA 6.7");
        assertThat(j.toMap().get("targetEsVersion")).isEqualTo("6.7.2");
    }

    @Test
    public void legacyConstructorDefaultsToHost() {
        AdhocRebuildJob j = new AdhocRebuildJob("job-2", "my-index",
                AdhocRebuildJob.Strategy.INCREMENTAL, true,
                "src_phys", "dst_phys", "updateTime", 5000L, true, true);
        assertThat(j.getTargetId()).isEqualTo("host");
        assertThat(j.getTargetNameSnapshot()).isNull();
        assertThat(j.getTargetEsVersionSnapshot()).isNull();
        assertThat(j.toMap().get("targetId")).isEqualTo("host");
    }

    @Test
    public void inMemoryStoreRoundTripRetainsTarget() {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        store.save(job("job-3", "conn:qa", "QA 6.7", "6.7.2"));
        Optional<AdhocRebuildJob> found = store.find("job-3");
        assertThat(found).isPresent();
        assertThat(found.get().getTargetId()).isEqualTo("conn:qa");
        assertThat(found.get().getTargetNameSnapshot()).isEqualTo("QA 6.7");
        assertThat(found.get().getTargetEsVersionSnapshot()).isEqualTo("6.7.2");
    }

    /* ---------------- JDBC（H2 真往返） ---------------- */

    private DataSource freshDb() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:adhoc_tgt_" + UUID.randomUUID().toString().replace("-", "")
                + ";DB_CLOSE_DELAY=-1;MODE=MySQL");
        ds.setUser("sa");
        ds.setPassword("");
        return ds;
    }

    @Test
    public void jdbcRoundTripRetainsTarget() {
        JdbcAdhocJobStore store = new JdbcAdhocJobStore(freshDb());
        store.save(job("job-4", "conn:qa", "QA 6.7", "6.7.2"));
        Optional<AdhocRebuildJob> found = store.find("job-4");
        assertThat(found).isPresent();
        assertThat(found.get().getTargetId()).isEqualTo("conn:qa");
        assertThat(found.get().getTargetNameSnapshot()).isEqualTo("QA 6.7");
        assertThat(found.get().getTargetEsVersionSnapshot()).isEqualTo("6.7.2");
        assertThat(store.listRecent(10).get(0).getTargetId()).isEqualTo("conn:qa");
    }

    @Test
    public void jdbcLegacyRowWithoutTargetReadsAsHost() throws Exception {
        DataSource db = freshDb();
        // 先造一个「旧版本 schema + 旧 payload（无 targetId 字段）」的存量行
        try (Connection c = db.getConnection(); Statement st = c.createStatement()) {
            st.execute("CREATE TABLE esquerystudio_adhoc_job ("
                    + "job_id VARCHAR(64) PRIMARY KEY, status_name VARCHAR(32), index_name VARCHAR(256),"
                    + "created_ts BIGINT NOT NULL, updated_ts BIGINT NOT NULL,"
                    + "payload_json TEXT, result_json TEXT)");
            st.execute("INSERT INTO esquerystudio_adhoc_job VALUES ('legacy-1','SUCCEEDED','old-idx',"
                    + "1,2,'{\"jobId\":\"legacy-1\",\"status\":\"SUCCEEDED\"}',NULL)");
        }
        JdbcAdhocJobStore store = new JdbcAdhocJobStore(db);
        Optional<AdhocRebuildJob> found = store.find("legacy-1");
        assertThat(found).isPresent();
        assertThat(found.get().getTargetId()).isEqualTo("host");
    }

    @Test
    public void jdbcSchemaMigrationAddsTargetColumnsWithoutDroppingRows() throws Exception {
        DataSource db = freshDb();
        try (Connection c = db.getConnection(); Statement st = c.createStatement()) {
            st.execute("CREATE TABLE esquerystudio_adhoc_job ("
                    + "job_id VARCHAR(64) PRIMARY KEY, status_name VARCHAR(32), index_name VARCHAR(256),"
                    + "created_ts BIGINT NOT NULL, updated_ts BIGINT NOT NULL,"
                    + "payload_json TEXT, result_json TEXT)");
            st.execute("INSERT INTO esquerystudio_adhoc_job VALUES ('legacy-2','RUNNING','old-idx',"
                    + "1,2,'{\"jobId\":\"legacy-2\",\"status\":\"RUNNING\"}',NULL)");
        }
        JdbcAdhocJobStore store = new JdbcAdhocJobStore(db);
        store.save(job("legacy-2", "conn:prod", "PROD", "7.10.2"));
        Optional<AdhocRebuildJob> found = store.find("legacy-2");
        assertThat(found).isPresent();
        // 旧行没被删，target 身份升格为快照值
        assertThat(found.get().getTargetId()).isEqualTo("conn:prod");
    }
}
