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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService.ThrottledMigrationHandle;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 运行中调速（throttle）契约：ThrottledMigrationHandle 的批粒度限速字段（volatile，
 * 每批 addMigrated 回调读取当前值）与 service.throttle 的态校验/返回形态；
 * rps=0 与 rps&lt;-1 均拒绝（不限速请传 -1），生效时记 stage=THROTTLE 作业事件。
 */
public class XmigrateThrottleTest {

    private static ThrottledMigrationHandle handle(String jobId) {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId(jobId);
        return new ThrottledMigrationHandle(jobId,
                new RemoteClusterConn("http", "10.0.0.9", 9200, "u", "p"),
                null, meta, 1500L);
    }

    private static CrossClusterMigrateService service(MigrateJobTracker tracker, RunningMigrations running) {
        return new CrossClusterMigrateService(null, null, null, tracker, running,
                null, null, null, null);
    }

    /** 批粒度限速：rps>0 时 addMigrated 按本批条数等待；-1（缺省）不限速。 */
    @Test
    public void 批粒度限速_每批读取当前值() {
        ThrottledMigrationHandle h = handle("job-1");
        long freeStart = System.nanoTime();
        h.addMigrated(0, 500);
        long freeMs = (System.nanoTime() - freeStart) / 1_000_000L;
        assertTrue("缺省 -1 不限速（实测 " + freeMs + "ms）", freeMs < 40L);

        h.requestsPerSecond = 10_000;
        long pacedStart = System.nanoTime();
        h.addMigrated(0, 500);
        long pacedMs = (System.nanoTime() - pacedStart) / 1_000_000L;
        assertTrue("500 条 ÷ 10000 rps = 50ms，实测 " + pacedMs + "ms", pacedMs >= 45L);

        h.requestsPerSecond = -1;
        long resumedStart = System.nanoTime();
        h.addMigrated(0, 500);
        assertTrue("调回 -1 立即恢复不限速",
                (System.nanoTime() - resumedStart) / 1_000_000L < 40L);
    }

    /** 态校验：rps=0 与 rps<-1 均拒绝；作业不存在拒绝；非运行态拒绝；返回 {ok,jobId,rps,appliedAt}。 */
    @Test
    public void throttle态校验与返回形态() {
        CrossClusterMigrateService svc = service(null, new RunningMigrations());
        try {
            svc.throttle("job-1", -2);
            fail("rps < -1 必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("-1"));
        }
        try {
            svc.throttle("job-1", 0);
            fail("rps = 0 必须拒绝（不限速请传 -1）");
        } catch (IllegalArgumentException e) {
            assertTrue("报错提示改传 -1: " + e.getMessage(),
                    e.getMessage().contains("不限速请传 -1"));
        }
        try {
            svc.throttle("missing", 100);
            fail("作业不存在必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("不存在"));
        }

        /* 非运行态：无运行句柄但台账里是终态作业 → IllegalState 明确报状态。 */
        MigrateJobTracker tracker = new MigrateJobTracker(null) {
            @Override
            public MigrateJobES findById(String jobId) {
                MigrateJobES done = new MigrateJobES();
                done.setJobId(jobId);
                done.setStatus(MigrateJobTracker.STATUS_DONE);
                return done;
            }
        };
        CrossClusterMigrateService terminal = service(tracker, new RunningMigrations());
        try {
            terminal.throttle("done-job", 100);
            fail("非运行态必须拒绝");
        } catch (IllegalStateException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("DONE"));
        }

        /* 运行中：注册句柄后调速生效，返回形态与字段更新可复核。 */
        RunningMigrations running = new RunningMigrations();
        ThrottledMigrationHandle h = handle("running-job");
        running.register(h);
        Map<String, Object> out = service(null, running).throttle("running-job", 2000);
        assertEquals(Boolean.TRUE, out.get("ok"));
        assertEquals("running-job", out.get("jobId"));
        assertEquals(2000, ((Number) out.get("rps")).intValue());
        assertNotNull(out.get("appliedAt"));
        assertTrue(((Number) out.get("appliedAt")).longValue() > 0);
        assertEquals("字段已更新（下一批 addMigrated 即按新值限速）", 2000, h.requestsPerSecond);

        /* 调速记作业事件：stage=THROTTLE，message 含 rps 值。 */
        Map<String, Object> event = h.snapshotEvents().get(h.snapshotEvents().size() - 1);
        assertEquals("THROTTLE", event.get("stage"));
        assertEquals("info", event.get("level"));
        assertTrue("message 含 rps 值: " + event.get("message"),
                String.valueOf(event.get("message")).contains("2000"));
        assertTrue(((Number) event.get("ts")).longValue() > 0);

        /* 调速对后续批次生效：2000 rps × 100 条 = 50ms。 */
        long pacedStart = System.nanoTime();
        h.addMigrated(0, 100);
        assertTrue((System.nanoTime() - pacedStart) / 1_000_000L >= 45L);
    }
}
