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

import java.util.Locale;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.Before;
import org.junit.Test;

import javax.sql.DataSource;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * {@link JdbcAdhocJobStore} 契约测试：用嵌入式 H2 真往返（save→find→listRecent 真跑 SQL）。
 *
 * <p>方案 A（查询视图）实证边界：payload 存 {@code job.toMap()}，回读用
 * {@code AdhocRebuildJob.minimal(jobId)} 骨架 + setter 回填。可还原字段集实证确定为
 * {@code {jobId, status, stage, error}}；{@code logicalName} 等 final 字段灌不回骨架，
 * 故不进往返断言（落在 {@code index_name} 专列供 SQL 直查，但不承诺经 job 还原）。</p>
 */
public class JdbcAdhocJobStoreTest {

    private DataSource dataSource;
    private JdbcAdhocJobStore store;

    @Before
    public void setUp() {
        // 每个用例独立内存库（DB_CLOSE_DELAY=-1 保持连接池间存活），避免用例间脏读。
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:adhoc_" + UUID.randomUUID().toString().replace("-", "")
                + ";DB_CLOSE_DELAY=-1;MODE=MySQL");
        ds.setUser("sa");
        ds.setPassword("");
        this.dataSource = ds;
        this.store = new JdbcAdhocJobStore(dataSource);
    }

    private AdhocRebuildJob job(String jobId, String logicalName, String status, String stage) {
        AdhocRebuildJob j = new AdhocRebuildJob(jobId, logicalName,
                AdhocRebuildJob.Strategy.INCREMENTAL, true,
                "src_phys", "dst_phys", "updateTime", 5000L, true, true);
        j.setStatus(status);
        j.setStage(stage);
        return j;
    }

    @Test
    public void save_then_find_roundTrips_queryableFields() {
        AdhocRebuildJob origin = job("job-1", "my-index", "SUCCEEDED", "DONE");
        origin.setError("boom");
        store.save(origin);

        Optional<AdhocRebuildJob> found = store.find("job-1");
        assertThat(found).isPresent();
        AdhocRebuildJob back = found.get();
        // 可还原字段集（实证）：jobId / status / stage / error。
        assertThat(back.getJobId()).isEqualTo("job-1");
        assertThat(back.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(back.getStage()).isEqualTo("DONE");
        assertThat(back.getError()).isEqualTo("boom");
    }

    @Test
    public void find_missing_returnsEmpty() {
        assertThat(store.find("no-such-job")).isEmpty();
    }

    @Test
    public void listRecent_returnsNewestFirst_limited() throws InterruptedException {
        store.save(job("a", "idx-a", "RUNNING", "PENDING"));
        Thread.sleep(2);
        store.save(job("b", "idx-b", "RUNNING", "PENDING"));
        Thread.sleep(2);
        store.save(job("c", "idx-c", "RUNNING", "PENDING"));

        List<AdhocRebuildJob> recent = store.listRecent(2);
        assertThat(recent).extracting(AdhocRebuildJob::getJobId)
                .containsExactly("c", "b");
    }

    @Test
    public void save_sameJobId_upsertsNoDuplicate_andOverwritesStatus() {
        store.save(job("job-up", "idx", "RUNNING", "PENDING"));
        store.save(job("job-up", "idx", "SUCCEEDED", "DONE"));

        // find 得覆盖后的终态
        AdhocRebuildJob back = store.find("job-up").orElseThrow(AssertionError::new);
        assertThat(back.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(back.getStage()).isEqualTo("DONE");

        // listRecent 只一条（同 jobId 未产生重复行）
        List<AdhocRebuildJob> recent = store.listRecent(10);
        assertThat(recent).extracting(AdhocRebuildJob::getJobId)
                .containsExactly("job-up");
    }

    /**
     * 契约红线 + 事务原子性守护：save 的 DELETE 已执行、INSERT 失败时，rollback 必须保住旧记录，
     * 且异常只吞成 warn 不上抛。用包装 DataSource 让 INSERT 语句的 prepareStatement 抛 SQLException
     * （DELETE 正常放行），精确命中「delete 已跑、insert 炸」这一 rollback 场景。
     *
     * <p>若日后有人删掉 rollback 或把 delete/insert 拆成两个独立事务，旧记录会被 delete 净删，本测试转红。</p>
     */
    @Test
    public void save_insertFails_rollsBackAndKeepsOldRecord_andDoesNotThrow() {
        // 先用干净 store 落一条旧记录
        store.save(job("job-tx", "idx", "RUNNING", "PENDING"));
        assertThat(store.find("job-tx")).isPresent();

        // 换一个「INSERT 必失败、DELETE 放行」的包装 store，指向同一底层库
        JdbcAdhocJobStore failingStore = new JdbcAdhocJobStore(insertFailingDataSource(dataSource));

        // 契约红线：save 不上抛
        assertThatCode(() -> failingStore.save(job("job-tx", "idx", "SUCCEEDED", "DONE")))
                .doesNotThrowAnyException();

        // rollback 保住旧记录：仍是 RUNNING，未被 delete 净删
        AdhocRebuildJob back = store.find("job-tx").orElseThrow(AssertionError::new);
        assertThat(back.getStatus()).isEqualTo("RUNNING");
        // 且未产生重复/丢失
        assertThat(store.listRecent(10)).extracting(AdhocRebuildJob::getJobId)
                .containsExactly("job-tx");
    }

    /**
     * 包装 DataSource：其 Connection 在收到 INSERT 语句的 prepareStatement 时抛 SQLException，
     * 其余（DELETE/SELECT、commit/rollback/setAutoCommit）全部委托真实 Connection。
     */
    private static DataSource insertFailingDataSource(DataSource real) {
        InvocationHandler dsHandler = (proxy, method, args) -> {
            if ("getConnection".equals(method.getName())) {
                Connection realConn = real.getConnection();
                InvocationHandler connHandler = (cp, cm, cargs) -> {
                    if ("prepareStatement".equals(cm.getName())
                            && cargs != null && cargs.length > 0
                            && String.valueOf(cargs[0]).toUpperCase(Locale.ROOT).startsWith("INSERT")) {
                        throw new SQLException("boom-on-insert (test)");
                    }
                    try {
                        return cm.invoke(realConn, cargs);
                    } catch (java.lang.reflect.InvocationTargetException e) {
                        throw e.getCause();
                    }
                };
                return Proxy.newProxyInstance(Connection.class.getClassLoader(),
                        new Class<?>[]{Connection.class}, connHandler);
            }
            try {
                return method.invoke(real, args);
            } catch (java.lang.reflect.InvocationTargetException e) {
                throw e.getCause();
            }
        };
        return (DataSource) Proxy.newProxyInstance(DataSource.class.getClassLoader(),
                new Class<?>[]{DataSource.class}, dsHandler);
    }
}
