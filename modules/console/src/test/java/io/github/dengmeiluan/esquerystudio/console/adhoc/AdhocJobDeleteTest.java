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

import org.junit.Test;

import java.lang.reflect.Field;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * 作业记录删除的终态校验测试。
 *
 * <p><b>单条删除</b>：RUNNING（含 AWAIT_CONFIRM——它 status 仍 RUNNING）必须拒绝——
 * 删掉运行中作业的记录会留下无法观测/中止的孤儿 reindex task；终态（FAILED/ABORTED/SUCCEEDED）
 * 删除后内存与 store 双清。</p>
 *
 * <p><b>批量清理</b>：只清 {@code olderThanDays} 之前<b>已结束</b>的终态作业；
 * targetId 非 null 时仅清该目标的作业（连接模型下防跨目标误删）。</p>
 */
public class AdhocJobDeleteTest {

    private static final long DAY_MS = 86_400_000L;

    private static AdhocRebuildService service(InMemoryAdhocJobStore store) {
        return new AdhocRebuildService(null, () -> null, 600_000L, null, 0L, store);
    }

    private static AdhocRebuildJob job(String jobId, String targetId, String status) {
        AdhocRebuildJob job = AdhocRebuildJob.minimal(jobId);
        job.restoreTarget(targetId, null, null);
        job.setStatus(status);
        return job;
    }

    /** finishedAt 无公开 setter（生产只经 markFinished 取当下），测试反射回拨造「N 天前结束」。 */
    private static void finishedDaysAgo(AdhocRebuildJob job, long days) throws Exception {
        Field f = AdhocRebuildJob.class.getDeclaredField("finishedAt");
        f.setAccessible(true);
        f.setLong(job, System.currentTimeMillis() - days * DAY_MS);
    }

    private static void inject(AdhocRebuildService service, AdhocRebuildJob job) throws Exception {
        Field f = AdhocRebuildService.class.getDeclaredField("jobs");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, AdhocRebuildJob> jobs = (Map<String, AdhocRebuildJob>) f.get(service);
        jobs.put(job.getJobId(), job);
    }

    // ------------------------------------------------------------------ 单条

    @Test
    public void delete_runningJob_isRejected() throws Exception {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        AdhocRebuildService service = service(store);
        AdhocRebuildJob job = job("job-run", "host", "RUNNING");
        job.setStage(AdhocRebuildJob.STAGE_AWAIT_CONFIRM); // 等待确认门期间 status 仍是 RUNNING
        inject(service, job);

        Throwable thrown = catchThrowable(() -> service.delete("job-run"));

        assertThat(thrown).as("删运行中作业会留下无法观测/中止的孤儿 task")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("AWAIT_CONFIRM");
    }

    @Test
    public void delete_failedJob_clearsMemoryAndStore() throws Exception {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        AdhocRebuildService service = service(store);
        AdhocRebuildJob job = job("job-failed", "host", "FAILED");
        inject(service, job);
        store.save(job);

        Map<String, Object> out = service.delete("job-failed");

        assertThat(out.get("jobId")).isEqualTo("job-failed");
        assertThat(out.get("deleted")).isEqualTo(true);
        assertThat(store.find("job-failed")).as("store 侧也要清掉").isEmpty();
        assertThat(service.listJobs())
                .as("列表不再出现该作业")
                .noneMatch(j -> "job-failed".equals(j.get("jobId")));
    }

    @Test
    public void delete_abortedAndSucceededJobs_areDeletable() throws Exception {
        AdhocRebuildService service = service(new InMemoryAdhocJobStore());
        AdhocRebuildJob aborted = job("job-aborted", "host", "ABORTED");
        AdhocRebuildJob succeeded = job("job-done", "host", "SUCCEEDED");
        inject(service, aborted);
        inject(service, succeeded);

        service.delete("job-aborted");
        service.delete("job-done");

        assertThat(service.listJobs()).isEmpty();
    }

    @Test
    public void delete_unknownJob_isRejected() {
        AdhocRebuildService service = service(new InMemoryAdhocJobStore());

        Throwable thrown = catchThrowable(() -> service.delete("nope"));

        assertThat(thrown).isInstanceOf(IllegalArgumentException.class);
    }

    /** days<=0 会把全部终态作业当「0 天前」清空（MCP 面直调 service 也必须被拦）。 */
    @Test
    public void deleteOlderThan_nonPositiveDays_isRejected() {
        AdhocRebuildService service = service(new InMemoryAdhocJobStore());

        Throwable thrown = catchThrowable(() -> service.deleteOlderThan(0, null));

        assertThat(thrown).as("0/负数窗口防误清，controller 与 service 双层校验")
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("olderThanDays");
    }

    // ------------------------------------------------------------------ 批量

    @Test
    public void deleteOlderThan_onlyRemovesFinishedTerminalJobsBeforeCutoff() throws Exception {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        AdhocRebuildService service = service(store);
        AdhocRebuildJob old = job("job-old", "host", "FAILED");
        finishedDaysAgo(old, 10);
        AdhocRebuildJob fresh = job("job-fresh", "host", "SUCCEEDED");
        finishedDaysAgo(fresh, 1);
        AdhocRebuildJob oldRunning = job("job-old-run", "host", "RUNNING");
        finishedDaysAgo(oldRunning, 10); // 旧的运行中作业也不许清
        for (AdhocRebuildJob j : new AdhocRebuildJob[]{old, fresh, oldRunning}) {
            store.save(j);
            inject(service, j);
        }

        Map<String, Object> out = service.deleteOlderThan(7, null);

        assertThat(out.get("deleted")).as("只清 7 天前已结束的终态作业").isEqualTo(1);
        assertThat(store.find("job-old")).isEmpty();
        assertThat(store.find("job-fresh")).as("窗口内作业保留").isPresent();
        assertThat(store.find("job-old-run")).as("运行中作业即使很旧也不清").isPresent();
    }

    @Test
    public void deleteOlderThan_scopesToRequestedTarget() throws Exception {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        AdhocRebuildService service = service(store);
        AdhocRebuildJob c1Old = job("job-c1", "conn-1", "FAILED");
        finishedDaysAgo(c1Old, 30);
        AdhocRebuildJob c2Old = job("job-c2", "conn-2", "FAILED");
        finishedDaysAgo(c2Old, 30);
        for (AdhocRebuildJob j : new AdhocRebuildJob[]{c1Old, c2Old}) {
            store.save(j);
        }

        Map<String, Object> out = service.deleteOlderThan(7, "conn-1");

        assertThat(out.get("deleted")).as("连接模型下只清当前目标连接的作业").isEqualTo(1);
        assertThat(store.find("job-c1")).isEmpty();
        assertThat(store.find("job-c2")).as("其它目标的作业不受影响").isPresent();
    }
}
