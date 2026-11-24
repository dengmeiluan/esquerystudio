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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * reindex 限流/切片调参（requestsPerSecond + slices）的端到端契约：
 *
 * <ul>
 *   <li>start 解析边界：rps=0 拒绝（IAE）；负值=不限语义放行；slices 数字 0/负与字符串
 *       "auto" 均归一 auto 哨兵（0）——经 {@code EsIndexAdmin.submitReindex} 4 参桩捕获断言；</li>
 *   <li>全量 reindex（typed 路径）把 job 调参原样传给 submitReindex 新签名；</li>
 *   <li>范围 reindex（低层 REST 手工 body）按 REST 语义下发顶级键：仅 rps&gt;0 才放
 *       requests_per_second；slices 哨兵 0/负放 "auto"、正数放数字——经
 *       {@link EsFakeClients#scripted} 回放捕获 POST /_reindex 的请求体断言。</li>
 * </ul>
 */
public class AdhocTuningParamsTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 捕获 submitReindex 4 参签名入参的桩（其余机械件全 no-op，MANUAL/别名模式可走通）。 */
    private static final class TuningCaptureAdmin extends EsIndexAdmin {
        volatile Double capturedRps;
        volatile Integer capturedSlices;

        TuningCaptureAdmin() {
            super(null);
        }

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
            return submitReindex(sourceIndex, destIndex, null, null);
        }

        @Override
        public String submitReindex(String sourceIndex, String destIndex,
                                    Double requestsPerSecond, Integer slices) {
            capturedRps = requestsPerSecond;
            capturedSlices = slices;
            return "node:1";
        }

        @Override
        public ReindexProgress getReindexProgress(String taskId) {
            return new ReindexProgress(true, "completed"); // 一轮即完成
        }

        @Override
        public void switchWriteIndex(String alias, String newPhysical, String oldPhysical) {
            // no-op
        }

        @Override
        public void setIndexWriteBlock(String index, boolean writeBlocked) {
            // no-op
        }
    }

    private static Map<String, Object> awaitDone(AdhocRebuildService svc, String jobId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000L;
        while (System.currentTimeMillis() < deadline) {
            Map<String, Object> m = svc.status(jobId);
            if (!"RUNNING".equals(m.get("status"))) {
                return m;
            }
            Thread.sleep(20L);
        }
        throw new AssertionError("job 未在 10s 内结束: " + jobId);
    }

    private static Map<String, Object> manualReq() {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "my_alias");
        req.put("strategy", "MANUAL");
        req.put("destIndex", "dest_phys");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");
        return req;
    }

    /* ---------------- start 解析边界 + 全量 reindex 传参 ---------------- */

    @Test
    public void positiveTuningParamsFlowToSubmitReindex() throws Exception {
        TuningCaptureAdmin admin = new TuningCaptureAdmin();
        AdhocRebuildService svc = new AdhocRebuildService(admin, () -> null, 60_000L, null, 0L);
        Map<String, Object> req = manualReq();
        req.put("requestsPerSecond", 500.5);
        req.put("slices", 7);
        String jobId = (String) svc.start(req).get("jobId");
        awaitDone(svc, jobId);
        assertThat(admin.capturedRps).isEqualTo(500.5);
        assertThat(admin.capturedSlices).isEqualTo(7);
    }

    @Test
    public void absentTuningParamsStayNull() throws Exception {
        TuningCaptureAdmin admin = new TuningCaptureAdmin();
        AdhocRebuildService svc = new AdhocRebuildService(admin, () -> null, 60_000L, null, 0L);
        String jobId = (String) svc.start(manualReq()).get("jobId");
        awaitDone(svc, jobId);
        assertThat(admin.capturedRps).isNull();
        assertThat(admin.capturedSlices).isNull();
    }

    @Test
    public void negativeRpsMeansUnlimitedAndKeptAsIs() throws Exception {
        // 负值=不限的 UI 约定：解析不报错，原样进 job（消费点统一按 >0 才下发）
        TuningCaptureAdmin admin = new TuningCaptureAdmin();
        AdhocRebuildService svc = new AdhocRebuildService(admin, () -> null, 60_000L, null, 0L);
        Map<String, Object> req = manualReq();
        req.put("requestsPerSecond", -1);
        String jobId = (String) svc.start(req).get("jobId");
        awaitDone(svc, jobId);
        assertThat(admin.capturedRps).isEqualTo(-1.0);
    }

    @Test
    public void zeroAndNegativeAndAutoSlicesNormalizeToAutoSentinel() throws Exception {
        // 0 与负数视为 auto（哨兵 0）；字符串 "auto" 同归一
        for (Object slices : new Object[]{0, -3, "auto"}) {
            TuningCaptureAdmin admin = new TuningCaptureAdmin();
            AdhocRebuildService svc = new AdhocRebuildService(admin, () -> null, 60_000L, null, 0L);
            Map<String, Object> req = manualReq();
            req.put("slices", slices);
            String jobId = (String) svc.start(req).get("jobId");
            awaitDone(svc, jobId);
            assertThat(admin.capturedSlices)
                    .as("slices=%s 应归一为 auto 哨兵 0", slices).isEqualTo(0);
        }
    }

    @Test
    public void zeroRequestsPerSecondRejected() {
        // ES REST 里 0 合法且=不限，与「未设置」不可区分，按非法输入拒绝
        TuningCaptureAdmin admin = new TuningCaptureAdmin();
        AdhocRebuildService svc = new AdhocRebuildService(admin, () -> null, 60_000L, null, 0L);
        Map<String, Object> req = manualReq();
        req.put("requestsPerSecond", 0);
        Throwable t = catchThrowable(() -> svc.start(req));
        assertThat(t).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("requestsPerSecond");
    }

    /* ---------------- rangeReindex 手工 body 的顶级键 ---------------- */

    /** 跑一个 INCREMENTAL 别名模式作业，捕获全部 POST /_reindex 的请求体；其余请求回最小合法 JSON。 */
    private static List<String> runIncrementalCapturingBodies(Object rps, Object slices) throws Exception {
        List<String> bodies = new CopyOnWriteArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(r -> {
            if (r.getEndpoint().startsWith("/_reindex")) {
                bodies.add(r.getEntity() == null ? null
                        : org.apache.http.util.EntityUtils.toString(r.getEntity()));
                return "{\"task\":\"node:9\"}";
            }
            return "{\"count\":10}";
        });
        TuningCaptureAdmin admin = new TuningCaptureAdmin();
        AdhocRebuildService svc = new AdhocRebuildService(admin, () -> client, 60_000L, null, 0L);
        Map<String, Object> req = manualReq();
        req.put("strategy", "INCREMENTAL");
        req.put("timeField", "ts");
        req.put("mappingJson", "{\"properties\":{\"ts\":{\"type\":\"date\"}}}");
        if (rps != null) {
            req.put("requestsPerSecond", rps);
        }
        if (slices != null) {
            req.put("slices", slices);
        }
        String jobId = (String) svc.start(req).get("jobId");
        Map<String, Object> done = awaitDone(svc, jobId);
        assertThat(done.get("status")).as("INCREMENTAL 作业应成功: %s", done.get("error")).isEqualTo("SUCCEEDED");
        // 一轮追平（affected=0 立即收敛）+ 切换后终追 = 2 次 POST /_reindex
        assertThat(bodies).hasSize(2);
        return bodies;
    }

    @Test
    public void rangeReindexBodyCarriesRpsAndNumericSlices() throws Exception {
        List<String> bodies = runIncrementalCapturingBodies(500.0, 4);
        Map<String, Object> body = MAPPER.readValue(bodies.get(0), Map.class);
        assertThat(body.get("requests_per_second")).isEqualTo(500.0);
        assertThat(body.get("slices")).isEqualTo(4);
        // 基础 body 契约不受调参影响（防误改既有键）
        assertThat(body.get("conflicts")).isEqualTo("proceed");
        assertThat(((Map<?, ?>) body.get("source")).get("index")).isEqualTo("src_phys");
        assertThat(((Map<?, ?>) body.get("dest")).get("index")).isEqualTo("dest_phys");
        Map<String, Object> finalBody = MAPPER.readValue(bodies.get(1), Map.class);
        assertThat(finalBody.get("slices")).isEqualTo(4);
        assertThat(((Map<?, ?>) finalBody.get("dest")).get("op_type")).isEqualTo("create");
    }

    @Test
    public void rangeReindexBodyOmitsRpsWhenNotPositiveAndUsesAutoSlices() throws Exception {
        // rps=-1（不限）→ 不放 requests_per_second（ES 缺省即不限）；slices=0（auto 哨兵）→ "auto"
        List<String> bodies = runIncrementalCapturingBodies(-1, 0);
        Map<String, Object> body = MAPPER.readValue(bodies.get(0), Map.class);
        assertThat(body).doesNotContainKey("requests_per_second");
        assertThat(body.get("slices")).isEqualTo("auto");
    }

    @Test
    public void rangeReindexBodyOmitsBothKeysWhenAbsent() throws Exception {
        List<String> bodies = runIncrementalCapturingBodies(null, null);
        Map<String, Object> body = MAPPER.readValue(bodies.get(0), Map.class);
        assertThat(body).doesNotContainKey("requests_per_second");
        assertThat(body).doesNotContainKey("slices");
    }
}
