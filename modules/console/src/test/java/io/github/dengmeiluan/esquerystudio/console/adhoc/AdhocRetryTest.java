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

import com.sun.net.httpserver.HttpServer;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * 失败作业一键重启（retry）的裁决与编排测试。
 *
 * <p><b>裁决面</b>：仅 FAILED / ABORTED（含确认门超时自动中止）可重试——对
 * SUCCEEDED / RUNNING / AWAIT_CONFIRM 必须明确拒绝，否则会在运行中作业上叠加第二个
 * worker，两个线程同时翻别名。不存在/同名互斥/重入闸同样拒绝。</p>
 *
 * <p><b>编排面</b>（直接驱动生产 {@code run()}，异步等待终态后断言真实副作用）：
 * INCREMENTAL 且全量轮已完成 → 跳过 CREATE_DEST 与全量、从 CATCHUP 续跑；
 * dest 已建但全量未完成（WRITE_BLOCK）→ 覆盖式全量重跑而非 {@code EsIndexAdmin.submitReindex}
 * （create 式 op_type 无法修复半途而废的全量）；dest 不存在 → 以源索引的
 * settings/mapping 重建（非 null 配置，防动态 mapping 索引被切换上线）。
 * 沿用原 jobId、rounds 跨轮保留。</p>
 */
public class AdhocRetryTest {

    /** 假源索引 mapping（getMapping 覆写返回；断言 createIndex 原样收到它）。 */
    private static final String SOURCE_MAPPING = "{\"properties\":{\"title\":{\"type\":\"text\"}}}";

    /** 记录建索引/首跑全量调用次数的 fake；其余方法沿用基类（不触网——探测类调用按需覆写）。 */
    private static final class RecordingAdmin extends EsIndexAdmin {
        final AtomicInteger createIndexCalls = new AtomicInteger();
        final AtomicInteger submitReindexCalls = new AtomicInteger();
        volatile boolean destExists = true;
        volatile String lastCreateSettings;
        volatile String lastCreateMapping;

        RecordingAdmin() {
            super(null);
        }

        @Override
        public void createIndex(String index, String settingsJson, String mappingJson) {
            createIndexCalls.incrementAndGet();
            lastCreateSettings = settingsJson;
            lastCreateMapping = mappingJson;
        }

        @Override
        public String submitReindex(String sourceIndex, String destIndex,
                                    Double requestsPerSecond, Integer slices) {
            submitReindexCalls.incrementAndGet();
            return "task-full-1";
        }

        @Override
        public boolean indexExists(String index) {
            return destExists;
        }

        @Override
        public String getMapping(String index) {
            // 固定 mapping：resolveFieldType 解析不到 timeField 得 null，追平编排继续
            //（不触网的基类实现会 NPE）；同时供 createIndex 收参断言用
            return SOURCE_MAPPING;
        }

        @Override
        public io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress getReindexProgress(String taskId) {
            // 立即完成：基类实现对未知 task 兜底返回 RUNNING 态，awaitTask 会无限轮询
            return io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress.of(
                    true, "COMPLETED", 10L, 10L, 0L, 0L, 0L);
        }

        @Override
        public void setIndexWriteBlock(String index, boolean writeBlocked) {
            // no-op：WRITE_BLOCK 早挡写路径需要它可调用
        }
    }

    /**
     * service + 本地假 ES 生命周期（try-with-resources）：retry 在 dest 不存在时要
     * 经低层 REST 读源索引 {@code _settings}（cleanedSettingsJson 走 service 的 client
     * 供给而非 EsIndexAdmin），需要真实可答的 HTTP 端点。
     */
    private static final class ServiceWithEs implements AutoCloseable {
        final AdhocRebuildService service;
        private final HttpServer es;
        private final RestHighLevelClient client;

        ServiceWithEs(RecordingAdmin admin) throws Exception {
            es = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            es.createContext("/", ex -> {
                // 源索引 settings：带一个业务键与两个系统键（后者应被 cleanedSettingsJson 剔除）
                byte[] body = "/src_idx/_settings".equals(ex.getRequestURI().getPath())
                        ? ("{\"src_idx\":{\"settings\":{\"index\":{"
                                + "\"number_of_shards\":\"1\","
                                + "\"uuid\":\"sys-uuid\",\"creation_date\":\"123\"}}}}")
                                .getBytes(StandardCharsets.UTF_8)
                        : "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(200, body.length);
                try (OutputStream os = ex.getResponseBody()) {
                    os.write(body);
                }
            });
            es.start();
            client = new RestHighLevelClient(org.elasticsearch.client.RestClient.builder(
                    new org.apache.http.HttpHost("127.0.0.1", es.getAddress().getPort(), "http")));
            service = new AdhocRebuildService(admin, () -> client, 600_000L);
        }

        @Override
        public void close() throws Exception {
            client.close();
            es.stop(0);
        }
    }

    private static AdhocRebuildService service(RecordingAdmin admin) {
        return new AdhocRebuildService(admin, () -> null, 600_000L);
    }

    private static AdhocRebuildJob job(String jobId, AdhocRebuildJob.Strategy strategy, String timeField) {
        return new AdhocRebuildJob(jobId, "logical", strategy, true, "src_idx", "dest_idx",
                timeField, 120_000L, false, false);
    }

    /** 把 job 塞进 service 内存表（retry 校验内存优先；start 需要真实 ES，这里只驱动 retry）。 */
    private static void injectJob(AdhocRebuildService service, AdhocRebuildJob job) throws Exception {
        java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("jobs");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, AdhocRebuildJob> jobs = (Map<String, AdhocRebuildJob>) f.get(service);
        jobs.put(job.getJobId(), job);
    }

    /** 轮询等待 worker 到达终态（10s 上限；run 的 NPE 失败路径毫秒级完成）。 */
    private static void awaitTerminal(AdhocRebuildJob job) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000L;
        while (job.isRunning() && System.currentTimeMillis() < deadline) {
            Thread.sleep(20L);
        }
        assertThat(job.isRunning()).as("retry worker 应在超时内到达终态").isFalse();
    }

    /** 给 job 补一轮已完成的全量记录（markMs 取当下，与 addRound 的耗时推算兼容）。 */
    private static void addFullRound(AdhocRebuildJob job) {
        Map<String, Object> round = new LinkedHashMap<>();
        round.put("round", 0);
        round.put("phase", "FULL");
        round.put("taskId", "task-full-0");
        round.put("markMs", System.currentTimeMillis() - 60_000L);
        job.addRound(round);
    }

    // ------------------------------------------------------------------ 裁决

    @Test
    public void retry_succeededJob_isRejected() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = service(admin);
        AdhocRebuildJob job = job("job-ok", AdhocRebuildJob.Strategy.INCREMENTAL, "updateTime");
        job.setStatus("SUCCEEDED");
        injectJob(service, job);

        Throwable thrown = catchThrowable(() -> service.retry("job-ok"));

        assertThat(thrown).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SUCCEEDED");
    }

    @Test
    public void retry_runningJob_isRejected() throws Exception {
        AdhocRebuildService service = service(new RecordingAdmin());
        AdhocRebuildJob job = job("job-run", AdhocRebuildJob.Strategy.INCREMENTAL, "updateTime");
        job.setStage("FULL_REINDEX"); // status 默认 RUNNING
        injectJob(service, job);

        Throwable thrown = catchThrowable(() -> service.retry("job-run"));

        assertThat(thrown).isInstanceOf(IllegalStateException.class)
                .as("对运行中作业 retry 会叠加第二个 worker，必须拒绝")
                .hasMessageContaining("RUNNING");
    }

    @Test
    public void retry_awaitConfirmJob_isRejectedWithGateHint() throws Exception {
        AdhocRebuildService service = service(new RecordingAdmin());
        AdhocRebuildJob job = job("job-gate", AdhocRebuildJob.Strategy.WRITE_BLOCK, null);
        job.setStage(AdhocRebuildJob.STAGE_AWAIT_CONFIRM);
        injectJob(service, job);

        Throwable thrown = catchThrowable(() -> service.retry("job-gate"));

        assertThat(thrown).isInstanceOf(IllegalStateException.class)
                .as("等待人工确认的作业须提示先放行或中止，而不是静默重跑")
                .hasMessageContaining("等待人工确认");
    }

    @Test
    public void retry_unknownJob_isRejected() {
        AdhocRebuildService service = service(new RecordingAdmin());

        Throwable thrown = catchThrowable(() -> service.retry("nope"));

        assertThat(thrown).isInstanceOf(IllegalArgumentException.class);
    }

    /**
     * 重启后从 store 回读的 FAILED 作业是 minimal 骨架（源/目标名灌不回实例），
     * 拿 null 配置跑 reindex 只会得到晦涩的 ES 错误——必须以明确文案引导重新发起。
     */
    @Test
    public void retry_persistedSnapshotWithoutConfig_isRejectedWithGuidance() throws Exception {
        AdhocRebuildService service = service(new RecordingAdmin());
        AdhocRebuildJob snapshot = AdhocRebuildJob.minimal("job-snapshot");
        snapshot.setStatus("FAILED");
        injectJob(service, snapshot);

        Throwable thrown = catchThrowable(() -> service.retry("job-snapshot"));

        assertThat(thrown).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("持久化快照");
    }

    @Test
    public void retry_sameLogicalNameRunning_isRejected() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = service(admin);
        AdhocRebuildJob failed = job("job-failed", AdhocRebuildJob.Strategy.INCREMENTAL, "updateTime");
        failed.setStatus("FAILED");
        injectJob(service, failed);
        AdhocRebuildJob running = job("job-running", AdhocRebuildJob.Strategy.INCREMENTAL, "updateTime");
        injectJob(service, running);

        Throwable thrown = catchThrowable(() -> service.retry("job-failed"));

        assertThat(thrown).as("同名逻辑索引已有运行中作业时，retry 与 start 同口径拒绝")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("job-running");
    }

    // ------------------------------------------------------------------ 编排

    /**
     * INCREMENTAL + 全量轮已完成 + dest 仍在：retry 不得重建 dest、不得重搬全量，
     * 直接从 CATCHUP 续跑（本测试用无 client 的供给让追平 reindex 立即失败，
     * 失败点即证明编排进入了 CATCHUP 而非 FULL_REINDEX）。
     */
    @Test
    public void retry_incrementalWithCompletedFull_resumesFromCatchup() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        admin.destExists = true;
        AdhocRebuildService service = service(admin);
        AdhocRebuildJob job = job("job-resume", AdhocRebuildJob.Strategy.INCREMENTAL, "updateTime");
        job.setStatus("FAILED");
        job.setError("上一轮追平失败");
        addFullRound(job);
        int roundsBefore = ((java.util.List<?>) job.toMap().get("rounds")).size();
        injectJob(service, job);

        Map<String, Object> out = service.retry("job-resume");

        assertThat(out.get("jobId")).as("沿用原 jobId，前端轮询无需换 id").isEqualTo("job-resume");
        awaitTerminal(job);
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(job.getStage())
                .as("失败点在 CATCHUP = 跳过了 CREATE_DEST 与全量并进入追平")
                .isEqualTo("CATCHUP");
        assertThat(admin.createIndexCalls.get())
                .as("dest 已存在时重建会销毁上一轮回填数据，必须跳过 CREATE_DEST")
                .isZero();
        assertThat(admin.submitReindexCalls.get())
                .as("全量轮已完成时不得重搬全量（rangeReindex 走低层 REST，非 EsIndexAdmin）")
                .isZero();
        assertThat(((java.util.List<?>) job.toMap().get("rounds")).size())
                .as("历史轮次跨 retry 保留")
                .isGreaterThanOrEqualTo(roundsBefore);
    }

    /**
     * dest 已建但全量未完成（WRITE_BLOCK 中途失败）：retry 走覆盖式全量
     * （低层 op_type=index），不得调 EsIndexAdmin.submitReindex（create 式对已拷文档
     * 全部冲突跳过，修不好半途而废的全量）。
     */
    @Test
    public void retry_destExistsWithoutFullRound_reindexesOverwrite() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        admin.destExists = true;
        AdhocRebuildService service = service(admin);
        AdhocRebuildJob job = job("job-overwrite", AdhocRebuildJob.Strategy.WRITE_BLOCK, null);
        job.setStatus("ABORTED"); // 含门超时自动中止的复跑路径
        injectJob(service, job);

        service.retry("job-overwrite");

        awaitTerminal(job);
        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(job.getStage())
                .as("失败点在 FULL_REINDEX = 编排进入了覆盖式全量重跑")
                .isEqualTo("FULL_REINDEX");
        assertThat(admin.createIndexCalls.get()).as("dest 已存在，跳过 CREATE_DEST").isZero();
        assertThat(admin.submitReindexCalls.get())
                .as("retry 的全量走低层覆盖式 _reindex（op_type=index），不走 create 式 submitReindex")
                .isZero();
    }

    /**
     * dest 已不存在（失败在建索引阶段）：与首次 start 同路径重建 dest，且必须以源索引
     * 的 settings/mapping 建索引——null 配置会建出动态 mapping 索引并照常切换别名，
     * 业务流量切到 mapping 错误的索引上。
     */
    @Test
    public void retry_destMissing_recreatesDest() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        admin.destExists = false;
        AdhocRebuildJob job = job("job-recreate", AdhocRebuildJob.Strategy.WRITE_BLOCK, null);
        job.setStatus("FAILED");

        try (ServiceWithEs swe = new ServiceWithEs(admin)) {
            injectJob(swe.service, job);
            swe.service.retry("job-recreate");

            awaitTerminal(job);
            assertThat(admin.createIndexCalls.get())
                    .as("dest 不存在时必须重建（CREATE_DEST）")
                    .isEqualTo(1);
            assertThat(admin.lastCreateSettings)
                    .as("重建 dest 必须携带源索引清洗后的 settings（非 null）")
                    .isNotNull()
                    .contains("number_of_shards")
                    .as("源索引的系统键（uuid/creation_date）不得带进新索引")
                    .doesNotContain("uuid")
                    .doesNotContain("creation_date");
            assertThat(admin.lastCreateMapping)
                    .as("重建 dest 必须携带源索引 mapping（非 null，防动态 mapping）")
                    .isEqualTo(SOURCE_MAPPING);
        }
    }

    /** ABORTED（人工中止/门超时）与 FAILED 同为可重试终态。 */
    @Test
    public void retry_abortedJob_isAccepted() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        admin.destExists = false;
        AdhocRebuildJob job = job("job-aborted", AdhocRebuildJob.Strategy.WRITE_BLOCK, null);
        job.setStatus("ABORTED");
        job.tryCloseGate(AdhocRebuildJob.GATE_TIMED_OUT); // 门超时自动中止形态

        try (ServiceWithEs swe = new ServiceWithEs(admin)) {
            injectJob(swe.service, job);

            Map<String, Object> out = swe.service.retry("job-aborted");

            assertThat(out.get("jobId")).isEqualTo("job-aborted");
            awaitTerminal(job);
            assertThat(job.getGateOutcome()).isNull(); // 新一轮的门必须从未决开始
        }
    }

    // ------------------------------------------------------------------ 重入闸

    /**
     * 并发 retry 同 jobId：状态校验（仍读到终态 FAILED）与 resetForRetry 之间无原子性，
     * 第二个并发请求必须被重入闸明确拒绝——双双通过会各起一个 worker、两个线程同时翻别名
     * （无锁构造 lock.enabled=false 下无跨实例锁兜底）。预置闸内状态模拟第一个 retry
     * 正处于「已过状态校验、尚未复位」的窗口。
     */
    @Test
    public void retry_secondRetryDuringStartupWindow_isRejectedByReentryGate() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        admin.destExists = true; // 绕开取源配置（走低层 REST），聚焦闸本身
        AdhocRebuildService service = service(admin);
        AdhocRebuildJob job = job("job-gated", AdhocRebuildJob.Strategy.WRITE_BLOCK, null);
        job.setStatus("FAILED");
        injectJob(service, job);
        java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("retryingJobIds");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        java.util.Set<String> ids = (java.util.Set<String>) f.get(service);
        ids.add("job-gated");

        Throwable thrown = catchThrowable(() -> service.retry("job-gated"));

        assertThat(thrown).as("闸内二次 retry 会双活，必须明确拒绝")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("重试");
        assertThat(job.isRunning()).as("被拒的 retry 不得改写终态").isFalse();
        assertThat(admin.createIndexCalls.get()).as("被拒的 retry 不得产生任何 ES 副作用").isZero();
    }
}
