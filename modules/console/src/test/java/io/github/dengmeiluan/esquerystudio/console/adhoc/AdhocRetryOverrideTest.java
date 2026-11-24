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
import java.util.concurrent.ConcurrentLinkedQueue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * retry 参数覆盖（2026-11-21 对账批）：{@code retry(jobId, overrides)} 的可选键
 * requestsPerSecond / slices / batchSize——出现的字段覆盖原值并随 reindex 请求下发，
 * 未传字段沿用原值；非法值（rps=0、batchSize&lt;1）明确拒绝且不产生 ES 副作用。
 *
 * <p>覆盖式全量走低层 REST（submitOverwriteReindex），假 ES 捕获 {@code _reindex}
 * 请求体断言 size / requests_per_second / slices 键的真实下发（AdhocRetryTest 同款注入范式）。</p>
 */
public class AdhocRetryOverrideTest {

    /** 低层 reindex 请求体捕获队列（每次 POST /_reindex 入队一条原文）。 */
    private static final class EsHarness implements AutoCloseable {
        final HttpServer es;
        final RestHighLevelClient client;
        final ConcurrentLinkedQueue<String> reindexBodies = new ConcurrentLinkedQueue<>();

        EsHarness() throws Exception {
            es = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            es.createContext("/", ex -> {
                String path = ex.getRequestURI().getPath();
                byte[] body;
                if ("/_reindex".equals(path)) {
                    body = readAll(ex);
                    reindexBodies.add(new String(body, StandardCharsets.UTF_8));
                    body = "{\"task\":\"task-ov-1\"}".getBytes(StandardCharsets.UTF_8);
                } else if (path.endsWith("/_count")) {
                    body = "{\"count\":10}".getBytes(StandardCharsets.UTF_8);
                } else {
                    body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
                }
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(200, body.length);
                try (OutputStream os = ex.getResponseBody()) {
                    os.write(body);
                }
            });
            es.start();
            client = new RestHighLevelClient(org.elasticsearch.client.RestClient.builder(
                    new org.apache.http.HttpHost("127.0.0.1", es.getAddress().getPort(), "http")));
        }

        private static byte[] readAll(com.sun.net.httpserver.HttpExchange ex) throws java.io.IOException {
            try (java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = ex.getRequestBody().read(buf)) >= 0) {
                    bos.write(buf, 0, n);
                }
                return bos.toByteArray();
            }
        }

        @Override
        public void close() throws Exception {
            client.close();
            es.stop(0);
        }
    }

    /** WRITE_BLOCK + dest 在场：retry 走覆盖式全量（低层 REST），机械件 no-op。 */
    private static final class OverrideAdmin extends EsIndexAdmin {
        OverrideAdmin() {
            super(null);
        }

        @Override
        public boolean indexExists(String index) {
            return true;
        }

        @Override
        public void switchWriteIndex(String alias, String newWrite, String oldWrite) {
            // no-op
        }

        @Override
        public String getMapping(String index) {
            return "{\"properties\":{\"title\":{\"type\":\"text\"}}}";
        }

        @Override
        public io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress getReindexProgress(String taskId) {
            return io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress.of(
                    true, "COMPLETED", 10L, 10L, 0L, 0L, 0L);
        }

        @Override
        public void setIndexWriteBlock(String index, boolean writeBlocked) {
            // no-op：WRITE_BLOCK 早挡写/收尾只读保护都不触网
        }
    }

    private static AdhocRebuildJob failedJob(String jobId, Double rps, Integer slices, Integer batchSize) {
        AdhocRebuildJob j = new AdhocRebuildJob(jobId, "logical", AdhocRebuildJob.Strategy.WRITE_BLOCK, true,
                "src_idx", "dest_idx", null, 120_000L, false, false);
        j.setStatus("FAILED");
        j.setTuning(rps, slices);
        j.setBatchSize(batchSize);
        return j;
    }

    @SuppressWarnings("unchecked")
    private static AdhocRebuildJob inject(AdhocRebuildService service, AdhocRebuildJob job) throws Exception {
        java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("jobs");
        f.setAccessible(true);
        ((Map<String, AdhocRebuildJob>) f.get(service)).put(job.getJobId(), job);
        return job;
    }

    private static void awaitTerminal(AdhocRebuildJob job) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000L;
        while (job.isRunning() && System.currentTimeMillis() < deadline) {
            Thread.sleep(20L);
        }
        assertThat(job.isRunning()).as("retry worker 应在超时内到达终态").isFalse();
    }

    @Test
    public void retryOverride_allThreeKeysOverrideAndReachReindexBody() throws Exception {
        try (EsHarness es = new EsHarness()) {
            AdhocRebuildService service = new AdhocRebuildService(new OverrideAdmin(), () -> es.client, 600_000L);
            AdhocRebuildJob job = inject(service, failedJob("job-ov", 100.0, 2, 500));

            Map<String, Object> out = service.retry("job-ov", overrides(500.0, 4, 2000));
            awaitTerminal(job);

            assertThat(job.getStatus()).as("覆盖参数的 retry 应正常跑完").isEqualTo("SUCCEEDED");
            Map<String, Object> snap = (Map<String, Object>) out.get("job");
            assertThat(snap.get("requestsPerSecond")).as("快照透出覆盖后的 rps").isEqualTo(500.0);
            assertThat(snap.get("slices")).isEqualTo(4);
            assertThat(snap.get("batchSize")).isEqualTo(2000);
            String body = es.reindexBodies.peek();
            assertThat(body).as("覆盖式全量必须经低层 REST 提交").isNotNull();
            assertThat(body).contains("\"requests_per_second\":500.0").contains("\"slices\":4").contains("\"size\":2000");
        }
    }

    @Test
    public void retryOverride_partialKeysKeepOriginals() throws Exception {
        try (EsHarness es = new EsHarness()) {
            AdhocRebuildService service = new AdhocRebuildService(new OverrideAdmin(), () -> es.client, 600_000L);
            AdhocRebuildJob job = inject(service, failedJob("job-keep", 100.0, 2, 500));

            /* 只覆盖 slices：rps 与 batchSize 沿用原值（100.0 / 500） */
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("slices", 8);
            service.retry("job-keep", o);
            awaitTerminal(job);

            assertThat(job.getRequestsPerSecond()).as("未传 rps 沿用原值").isEqualTo(100.0);
            assertThat(job.getSlices()).isEqualTo(8);
            assertThat(job.getBatchSize()).as("未传 batchSize 沿用原值").isEqualTo(500);
            String body = es.reindexBodies.peek();
            assertThat(body).contains("\"requests_per_second\":100.0").contains("\"slices\":8").contains("\"size\":500");
        }
    }

    @Test
    public void retryOverride_emptyOverridesBehavesLikePlainRetry() throws Exception {
        try (EsHarness es = new EsHarness()) {
            AdhocRebuildService service = new AdhocRebuildService(new OverrideAdmin(), () -> es.client, 600_000L);
            AdhocRebuildJob job = inject(service, failedJob("job-plain", 100.0, 2, 500));

            service.retry("job-plain", new LinkedHashMap<>());
            awaitTerminal(job);

            assertThat(job.getRequestsPerSecond()).isEqualTo(100.0);
            assertThat(job.getSlices()).isEqualTo(2);
            assertThat(job.getBatchSize()).isEqualTo(500);
        }
    }

    @Test
    public void retryOverride_zeroRpsIsRejectedWithoutSideEffects() throws Exception {
        try (EsHarness es = new EsHarness()) {
            AdhocRebuildService service = new AdhocRebuildService(new OverrideAdmin(), () -> es.client, 600_000L);
            AdhocRebuildJob job = inject(service, failedJob("job-bad", 100.0, 2, null));

            Throwable thrown = catchThrowable(() -> service.retry("job-bad", overrides(0.0, null, null)));

            assertThat(thrown).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("requestsPerSecond 不得为 0");
            assertThat(job.isRunning()).as("非法覆盖不得复位作业").isFalse();
            assertThat(job.getStatus()).isEqualTo("FAILED");
            assertThat(es.reindexBodies).as("被拒的 retry 不产生任何 reindex 副作用").isEmpty();
        }
    }

    @Test
    public void retryOverride_nonPositiveBatchSizeIsRejected() throws Exception {
        try (EsHarness es = new EsHarness()) {
            AdhocRebuildService service = new AdhocRebuildService(new OverrideAdmin(), () -> es.client, 600_000L);
            AdhocRebuildJob job = inject(service, failedJob("job-bs", null, null, null));

            Throwable thrown = catchThrowable(() -> service.retry("job-bs", overrides(null, null, 0)));

            assertThat(thrown).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("batchSize 需为正整数");
            assertThat(es.reindexBodies).isEmpty();
        }
    }

    private static Map<String, Object> overrides(Double rps, Integer slices, Integer batchSize) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("requestsPerSecond", rps);
        o.put("slices", slices);
        o.put("batchSize", batchSize);
        return o;
    }
}
