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

package io.github.dengmeiluan.esquerystudio.console.store;

import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildJob;
import io.github.dengmeiluan.esquerystudio.console.adhoc.JdbcAdhocJobStore;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.util.Optional;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 本地 SQLite 档（{@code esquerystudio.elasticsearch.console.store=sqlite}）契约：审计与作业元数据同宿
 * 落一个本地数据库文件，零外部服务依赖。核心承诺=<b>重启恢复</b>——同一文件重开新
 * store 实例必须读回此前写入的作业（「重启后历史可查」）。
 */
public class SqliteStoreContractTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void driverAvailableOnTestClasspath() {
        // optional 依赖在本模块 test classpath 可见；缺它=sqlite 档装配期回落 control-es
        assertTrue("sqlite-jdbc is optional in the pom but must be present on this module's test classpath",
                SqliteStores.driverAvailable());
    }

    @Test
    public void resolveDatabaseFileDefaultsToConsoleHomeDir() {
        Path expected = Paths.get(System.getProperty("user.home"), ".esquerystudio", "myapp", "jobs.db");
        assertEquals(expected, SqliteStores.resolveDatabaseFile(null, "myapp"));
        assertEquals(expected, SqliteStores.resolveDatabaseFile("", "myapp"));
        assertEquals(expected, SqliteStores.resolveDatabaseFile("   ", "myapp"));
    }

    @Test
    public void resolveDatabaseFileHonorsExplicitPath() {
        Path expected = tmp.getRoot().toPath().resolve("explicit").toAbsolutePath().normalize();
        assertEquals(expected, SqliteStores.resolveDatabaseFile(expected.toString(), "myapp"));
    }

    @Test
    public void buildDataSourceCreatesParentDirsAndConnects() throws Exception {
        Path db = tmp.getRoot().toPath().resolve("nested/dir/jobs.db");
        DataSource ds = SqliteStores.buildDataSource(db);
        try (Connection c = ds.getConnection()) {
            assertTrue("sqlite connection must open right after build", c.isValid(2));
        }
        assertTrue("sqlite file must exist after first connection", Files.isRegularFile(db));
    }

    @Test
    public void jobStorePersistsAcrossReopen() throws Exception {
        Path db = tmp.getRoot().toPath().resolve("jobs.db");
        DataSource first = SqliteStores.buildDataSource(db);

        JdbcAdhocJobStore writer = new JdbcAdhocJobStore(first);
        AdhocRebuildJob job = AdhocRebuildJob.minimal("job-sqlite-1");
        job.setStatus("RUNNING");
        job.setCurrentTaskId("task-9");
        writer.save(job);

        // 「重启」：同一文件、全新实例
        JdbcAdhocJobStore reborn = new JdbcAdhocJobStore(SqliteStores.buildDataSource(db));
        Optional<AdhocRebuildJob> back = reborn.find("job-sqlite-1");
        assertTrue("job must survive a store reopen (restart semantics)", back.isPresent());
        assertEquals("RUNNING", back.get().getStatus());
        assertEquals("task-9", back.get().getCurrentTaskId());
        assertTrue("reopened store must list recent jobs",
                reborn.listRecent(10).stream().anyMatch(j -> "job-sqlite-1".equals(j.getJobId())));
    }
}
