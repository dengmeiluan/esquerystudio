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

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * reindex failures[] 透出链路：
 *
 * <ul>
 *   <li>{@code EsIndexAdmin.getReindexProgress}：task 完成时低层补采
 *       {@code GET /_tasks/{node}%3A{num}} 的 {@code response.failures}——typed
 *       GetTaskResponse 只解析 completed+task（顶层 response 节点被丢弃），失败样本只能走低层。
 *       ES 桩用本机 {@link HttpServer}（本仓测试基线先例）：RHLC typed 解析硬性要求
 *       {@code Content-Type: application/json}，{@code EsFakeClients.scripted} 的 text/plain
 *       响应过不了 XContentType 检查，故此处的 _tasks 回放走真 loopback；</li>
 *   <li>样本形态：前 10 条、每条抽 {type, reason, index, id}；cause/index/id 缺席键跳过、
 *       全缺席条目跳过；低层补采失败（非 200）不反噬——进度字段照常、failures=null；</li>
 *   <li>{@code awaitTask} 完成臂 {@code job.setFailureSamples} → {@code toMap()} 含
 *       failures 键（null 时不放键）；旧 {@code of(...)} 7 参重载保持可用。</li>
 * </ul>
 */
public class AdhocFailureSamplesTest {

    /* ---------------- ES 桩：本机 HttpServer 回 application/json ---------------- */

    private interface Responder {
        void respond(HttpExchange exchange) throws IOException;
    }

    /** client + loopback 服务的组合：close 时两者都收（RestHighLevelClient.close 是 final，无法挂服务停机，故外层组合）。 */
    private static final class ServerClient implements AutoCloseable {
        final RestHighLevelClient client;
        private final HttpServer server;

        ServerClient(Responder responder) throws IOException {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/", exchange -> {
                try {
                    responder.respond(exchange);
                } finally {
                    exchange.close();
                }
            });
            server.start();
            client = new RestHighLevelClient(
                    RestClient.builder(new HttpHost("localhost", server.getAddress().getPort())));
        }

        @Override
        public void close() {
            try {
                client.close();
            } catch (Exception ignore) {
                // 关闭失败不影响测试结果
            } finally {
                server.stop(0);
            }
        }
    }

    private static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(payload);
        }
    }

    /** 造一条 ES 形态的 bulk failure。 */
    private static String failure(String type, String reason, String index, String id) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        if (type != null || reason != null) {
            sb.append("\"cause\":{");
            if (type != null) {
                sb.append("\"type\":\"").append(type).append("\"");
            }
            if (reason != null) {
                if (type != null) {
                    sb.append(",");
                }
                sb.append("\"reason\":\"").append(reason).append("\"");
            }
            sb.append("}");
            first = false;
        }
        if (index != null) {
            if (!first) {
                sb.append(",");
            }
            sb.append("\"index\":\"").append(index).append("\"");
            first = false;
        }
        if (id != null) {
            if (!first) {
                sb.append(",");
            }
            sb.append("\"id\":\"").append(id).append("\"");
        }
        sb.append("}");
        return sb.toString();
    }

    /** 合成一份 completed 的 _tasks 响应（typed 只读 completed+task.status；低层补采读 response.failures）。 */
    private static String tasksJson(String failuresArrayJson) {
        return "{\"completed\":true,"
                + "\"task\":{\"node\":\"node1\",\"id\":5,\"type\":\"transport\","
                + "\"action\":\"indices:data/write/reindex\",\"start_time_in_millis\":1,"
                + "\"running_time_in_nanos\":1,\"cancellable\":true,"
                + "\"status\":{\"total\":10,\"created\":8,\"updated\":0,\"deleted\":0,\"version_conflicts\":2}},"
                + "\"response\":{\"took\":10,\"total\":10,\"created\":8,"
                + "\"failures\":[" + failuresArrayJson + "]}}";
    }

    /* ---------------- 低层补采：样本形态 ---------------- */

    @Test
    public void completedTaskCarriesFirstTenFailureSamples() throws Exception {
        // 12 条完整 failure + 1 条 cause 缺席但带 index/id + 1 条全缺席 → 样本恰为前 10 条完整形态
        StringBuilder arr = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            if (i > 0) {
                arr.append(",");
            }
            arr.append(failure("mapper_parsing_exception", "failed to parse [f" + i + "]", "dest_phys", "doc-" + i));
        }
        arr.append(",").append(failure(null, null, "dest_phys", "doc-idx-only"));
        arr.append(",").append(failure(null, null, null, null));
        String body = tasksJson(arr.toString());

        try (ServerClient sc = new ServerClient((exchange) -> sendJson(exchange, 200, body))) {
            ReindexProgress p = new EsIndexAdmin(sc.client).getReindexProgress("node1:5");

            assertThat(p.isCompleted()).isTrue();
            assertThat(p.getFailures()).hasSize(10);
            Map<String, Object> first = p.getFailures().get(0);
            assertThat(first)
                    .containsEntry("type", "mapper_parsing_exception")
                    .containsEntry("reason", "failed to parse [f0]")
                    .containsEntry("index", "dest_phys")
                    .containsEntry("id", "doc-0");
            assertThat(p.getFailures().get(9))
                    .as("样本恰取前 10 条").containsEntry("id", "doc-9");
        }
    }

    @Test
    public void sampleKeepsIndexAndIdWhenCauseAbsent() throws Exception {
        String body = tasksJson(failure(null, null, "dest_phys", "doc-idx-only"));

        try (ServerClient sc = new ServerClient((exchange) -> sendJson(exchange, 200, body))) {
            ReindexProgress p = new EsIndexAdmin(sc.client).getReindexProgress("node1:5");

            assertThat(p.getFailures()).hasSize(1);
            assertThat(p.getFailures().get(0))
                    .containsOnlyKeys("index", "id")
                    .containsEntry("index", "dest_phys")
                    .containsEntry("id", "doc-idx-only");
        }
    }

    @Test
    public void runningTaskHasNoSamples() throws Exception {
        AtomicInteger hits = new AtomicInteger();
        try (ServerClient sc = new ServerClient(exchange -> {
            hits.incrementAndGet();
            sendJson(exchange, 200, "{\"completed\":false,\"task\":{\"node\":\"node1\",\"id\":5,"
                    + "\"type\":\"transport\",\"action\":\"x\",\"start_time_in_millis\":1,"
                    + "\"running_time_in_nanos\":1,\"cancellable\":true,"
                    + "\"status\":{\"total\":10,\"created\":3}},"
                    + "\"response\":{\"failures\":[" + failure("t", "r", "i", "d") + "]}}");
        })) {
            ReindexProgress p = new EsIndexAdmin(sc.client).getReindexProgress("node1:5");

            assertThat(p.isCompleted()).isFalse();
            assertThat(p.getFailures()).isNull();
            assertThat(hits.get()).as("running 态只发一次 typed 请求，无补采").isEqualTo(1);
        }
    }

    @Test
    public void lowLevelFetchFailureDoesNotBreakProgressPolling() throws Exception {
        // typed（第 1 次）正常回包；低层补采（第 2 次）非 200 → 不反噬：completed/计数照常、failures=null
        AtomicInteger hits = new AtomicInteger();
        try (ServerClient sc = new ServerClient(exchange -> {
            if (hits.incrementAndGet() == 1) {
                sendJson(exchange, 200, tasksJson(failure("t", "r", "i", "d")));
            } else {
                sendJson(exchange, 500, "{\"error\":\"boom\"}");
            }
        })) {
            ReindexProgress p = new EsIndexAdmin(sc.client).getReindexProgress("node1:5");

            assertThat(p.isCompleted()).isTrue();
            assertThat(p.getTotal()).isEqualTo(10L);
            assertThat(p.getCreated()).isEqualTo(8L);
            assertThat(p.getVersionConflicts()).isEqualTo(2L);
            assertThat(p.getFailures()).isNull();
            assertThat(hits.get()).isEqualTo(2);
        }
    }

    /* ---------------- awaitTask → job.toMap 透出 ---------------- */

    @Test
    public void jobExposesFailureSamplesInToMapOnlyWhenPresent() throws Exception {
        List<Map<String, Object>> samples = new ArrayList<>();
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("type", "t");
        s.put("reason", "r");
        samples.add(s);
        AdhocRebuildJob job = AdhocRebuildJob.minimal("adhoc-fail");
        job.setFailureSamples(samples);
        assertThat(job.toMap()).containsEntry("failures", samples);
        // null 覆盖=清空样本（新 task 起跑时旧样本失效）→ 键缺席，前端按「字段缺席不渲染」
        job.setFailureSamples(null);
        assertThat(job.toMap()).doesNotContainKey("failures");
    }

    @Test
    public void serviceAwaitTaskBackfillsSamplesToRunningJob() throws Exception {
        List<Map<String, Object>> samples = new ArrayList<>();
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("type", "bulk");
        s.put("reason", "boom");
        s.put("index", "dest_phys");
        s.put("id", "d1");
        samples.add(s);
        EsIndexAdmin admin = new EsIndexAdmin(null) {
            @Override
            public boolean aliasExists(String alias) {
                return true;
            }

            @Override
            public String getWriteIndex(String alias) {
                return "src_phys";
            }

            @Override
            public boolean indexExists(String index) {
                return false;
            }

            @Override
            public void createIndex(String index, String settingsJson, String mappingJson) {
                // no-op
            }

            @Override
            public String submitReindex(String sourceIndex, String destIndex) {
                return "node:1";
            }

            // run() 走 4 参签名（限流/切片调参），桩保持同一返回值
            @Override
            public String submitReindex(String sourceIndex, String destIndex,
                                        Double requestsPerSecond, Integer slices) {
                return "node:1";
            }

            @Override
            public ReindexProgress getReindexProgress(String taskId) {
                return ReindexProgress.of(true, "{\"total\":10,\"created\":8}",
                        10L, 8L, 0L, 0L, 0L, samples);
            }

            @Override
            public void switchWriteIndex(String alias, String newPhysical, String oldPhysical) {
                // no-op
            }
        };
        AdhocRebuildService svc = new AdhocRebuildService(admin, () -> null, 60_000L, null, 0L);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "my_alias");
        req.put("strategy", "MANUAL");
        req.put("destIndex", "dest_phys");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");
        String jobId = (String) svc.start(req).get("jobId");

        long deadline = System.currentTimeMillis() + 10_000L;
        Map<String, Object> m = null;
        while (System.currentTimeMillis() < deadline) {
            m = svc.status(jobId);
            if (!"RUNNING".equals(m.get("status"))) {
                break;
            }
            Thread.sleep(20L);
        }
        assertThat(m.get("status")).isEqualTo("SUCCEEDED");
        assertThat(m).containsEntry("failures", samples);
    }

    /* ---------------- 旧 7 参 of 重载兼容 ---------------- */

    @Test
    public void legacySevenArgFactoryStillCompilesWithNullFailures() {
        ReindexProgress p = ReindexProgress.of(true, "detail", 1L, 2L, 3L, 4L, 5L);
        assertThat(p.isCompleted()).isTrue();
        assertThat(p.getFailures()).isNull();
        // 既有调用形态（数组/不可变 list 均可为样本载体）
        List<Map<String, Object>> samples = Arrays.asList(new LinkedHashMap<>());
        assertThat(ReindexProgress.of(true, "d", null, null, null, null, null, samples).getFailures())
                .isSameAs(samples);
    }
}
