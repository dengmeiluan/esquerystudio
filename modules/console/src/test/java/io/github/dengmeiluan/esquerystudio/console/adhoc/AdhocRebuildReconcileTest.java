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
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 终态文档数对账（2026-11-21 对账批）三态裁决：
 *
 * <ul>
 *   <li><b>GAP</b>：源存在、双侧 count 可得、缺口&gt;0 → report.reconcile 以「目标文档数 X /
 *       源 Y，缺口 Z」透出，作业仍 SUCCEEDED（对账是验收增强，不是终态判据）；</li>
 *   <li><b>SOURCE_GONE</b>：源索引已删除/404 → 如实标注「源索引已不存在，无法对账」，
 *       不冒充成功也不误报缺口；</li>
 *   <li><b>UNAVAILABLE（不改终态）</b>：源存在但对账取数失败 → 状态 UNAVAILABLE 只进报告，
 *       作业终态与 destDocCount 不受影响。</li>
 * </ul>
 *
 * <p>直驱生产 {@code run()}（AdhocRetryTest 同款注入范式）：对账消费点在 FINALIZE 后，
 * 假 ES 按索引名答 {@code _count}，admin 覆写 indexExists 控制源在场性。</p>
 */
public class AdhocRebuildReconcileTest {

    /** 对账结论在 report 下的键名（UI 收尾报告区渲染同一契约）。 */
    private static final String KEY = "reconcile";

    /** 源在场性可控的 admin：其余机械件 no-op（MANUAL+别名模式可走通编排）。 */
    private static final class ReconcileAdmin extends EsIndexAdmin {
        volatile boolean srcExists = true;

        ReconcileAdmin() {
            super(null);
        }

        @Override
        public boolean indexExists(String index) {
            if ("src_idx".equals(index)) {
                return srcExists;
            }
            return "dest_idx".equals(index);
        }

        @Override
        public void switchWriteIndex(String alias, String newWrite, String oldWrite) {
            // no-op：别名切换不触网，聚焦对账消费点
        }

        @Override
        public void createIndex(String index, String settingsJson, String mappingJson) {
            // no-op：plan=null 直驱 run 会走 CREATE_DEST，不触网
        }

        @Override
        public String submitReindex(String sourceIndex, String destIndex) {
            return "task-x";
        }

        @Override
        public String submitReindex(String sourceIndex, String destIndex,
                                    Double requestsPerSecond, Integer slices) {
            return "task-x";
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
    }

    /**
     * 本地假 ES：{@code /{index}/_count} 按索引名回 count（srcCount/destCount 可调），
     * {@code countFailFor} 命中时回 500（对账取数失败态）。其余路径按通用 ok 答。
     */
    private static final class EsHarness implements AutoCloseable {
        final HttpServer es;
        final RestHighLevelClient client;
        final AtomicLong srcCount = new AtomicLong(1000);
        final AtomicLong destCount = new AtomicLong(1000);
        volatile String countFailFor = null;

        EsHarness() throws Exception {
            es = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            es.createContext("/", ex -> {
                String path = ex.getRequestURI().getPath();
                byte[] body;
                int status = 200;
                if (path.endsWith("/_count")) {
                    String idx = path.substring(1, path.length() - "/_count".length());
                    if (idx.equals(countFailFor)) {
                        status = 500;
                        body = "{\"error\":\"boom\"}".getBytes(StandardCharsets.UTF_8);
                    } else {
                        long c = "src_idx".equals(idx) ? srcCount.get() : destCount.get();
                        body = ("{\"count\":" + c + "}").getBytes(StandardCharsets.UTF_8);
                    }
                } else {
                    body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
                }
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(status, body.length);
                try (OutputStream os = ex.getResponseBody()) {
                    os.write(body);
                }
            });
            es.start();
            client = new RestHighLevelClient(org.elasticsearch.client.RestClient.builder(
                    new org.apache.http.HttpHost("127.0.0.1", es.getAddress().getPort(), "http")));
        }

        @Override
        public void close() throws Exception {
            client.close();
            es.stop(0);
        }
    }

    /** MANUAL + 别名模式 + deleteOldIndex=false（源保留在场，对账才有意义）。 */
    private static AdhocRebuildJob job(String jobId) {
        return new AdhocRebuildJob(jobId, "logical", AdhocRebuildJob.Strategy.MANUAL, true,
                "src_idx", "dest_idx", null, 120_000L, false, false);
    }

    @Test
    public void reconcile_gap_isWarnedInReportButJobStillSucceeded() throws Exception {
        ReconcileAdmin admin = new ReconcileAdmin();
        try (EsHarness es = new EsHarness()) {
            es.srcCount.set(1000);
            es.destCount.set(940); // 缺 60
            Map<String, Object> jobOut = drive(admin, es, "job-gap");

            assertThat(jobOut.get("status")).as("对账发现缺口不改变作业终态").isEqualTo("SUCCEEDED");
            Map<String, Object> rec = reconcileOf(jobOut);
            assertThat(rec.get("status")).isEqualTo("GAP");
            assertThat(((Number) rec.get("gap")).longValue()).isEqualTo(60L);
            assertThat((String) rec.get("message"))
                    .contains("目标文档数 940 / 源 1000，缺口 60");
        }
    }

    @Test
    public void reconcile_sourceGone_statesUnableToReconcileHonestly() throws Exception {
        ReconcileAdmin admin = new ReconcileAdmin();
        admin.srcExists = false; // deleteOldIndex / 直连切换已删源
        try (EsHarness es = new EsHarness()) {
            Map<String, Object> jobOut = drive(admin, es, "job-gone");

            assertThat(jobOut.get("status")).isEqualTo("SUCCEEDED");
            Map<String, Object> rec = reconcileOf(jobOut);
            assertThat(rec.get("status")).as("源不在场必须如实标注，不冒充成功也不误报缺口")
                    .isEqualTo("SOURCE_GONE");
            assertThat((String) rec.get("message")).contains("源索引已不存在，无法对账");
            assertThat(rec.get("gap")).as("无从比对即无缺口结论").isNull();
        }
    }

    @Test
    public void reconcile_countFailure_keepsTerminalStateUntouched() throws Exception {
        ReconcileAdmin admin = new ReconcileAdmin();
        try (EsHarness es = new EsHarness()) {
            es.countFailFor = "dest_idx"; // 目标侧 _count 500
            Map<String, Object> jobOut = drive(admin, es, "job-unavail");

            assertThat(jobOut.get("status")).as("对账失败只进报告，不改终态").isEqualTo("SUCCEEDED");
            Map<String, Object> rec = reconcileOf(jobOut);
            assertThat(rec.get("status")).isEqualTo("UNAVAILABLE");
            assertThat((String) rec.get("message")).contains("对账取数失败");
            assertThat(rec.get("destCount")).as("取数失败的侧如实 null，不冒充 0").isNull();
        }
    }

    @Test
    public void reconcile_match_reportsConsistentCounts() throws Exception {
        ReconcileAdmin admin = new ReconcileAdmin();
        try (EsHarness es = new EsHarness()) {
            es.srcCount.set(1000);
            es.destCount.set(1000);
            Map<String, Object> jobOut = drive(admin, es, "job-match");

            assertThat(jobOut.get("status")).isEqualTo("SUCCEEDED");
            Map<String, Object> rec = reconcileOf(jobOut);
            assertThat(rec.get("status")).isEqualTo("MATCH");
            assertThat(((Number) rec.get("gap")).longValue()).isZero();
            assertThat((String) rec.get("message")).contains("对账一致");
        }
    }

    /** 直驱 run() 到终态并回 toMap（retry 同款反射注入；MANUAL 别名模式直通 FINALIZE）。 */
    private static Map<String, Object> drive(ReconcileAdmin admin, EsHarness es, String jobId) throws Exception {
        AdhocRebuildService service = new AdhocRebuildService(admin, () -> es.client, 600_000L);
        AdhocRebuildJob j = job(jobId);
        java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("jobs");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, AdhocRebuildJob> jobs = (Map<String, AdhocRebuildJob>) f.get(service);
        jobs.put(jobId, j);
        java.lang.reflect.Method run = AdhocRebuildService.class.getDeclaredMethod("run",
                AdhocRebuildJob.class, String.class, String.class, AdhocRebuildService.RetryPlan.class);
        run.setAccessible(true);
        run.invoke(service, j, null, null, null);
        return j.toMap();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> reconcileOf(Map<String, Object> jobOut) {
        Map<String, Object> report = (Map<String, Object>) jobOut.get("report");
        assertThat(report).as("终态报告必须产出").isNotNull();
        Map<String, Object> rec = (Map<String, Object>) report.get(KEY);
        assertThat(rec).as("报告必须携带对账结论条（" + KEY + " 键）").isNotNull();
        return rec;
    }
}
