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

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 迁移作业可观测字段全链（startedAtMs / finishedAtMs / sliceErrors）。
 *
 * <p><b>为什么单独测这个</b>：与  告知同病——{@link MigrationHandle#toJobEs()} 逐字段拷贝、
 * 漏一个不会有编译错误也不会有现有测试变红，观测字段会在持久化时静默消失；
 * 而 resume 重开会重置 handle，打点的「重置/清空」语义也是「靠纪律维持」的点。
 * 全部纯 JUnit 直构造（同 {@link MigrationHandleFormatlessDatesTest} 形态）。</p>
 *
 * @author aicoding
 */
public class MigrationHandleObservabilityTest {

    private static MigrationHandle handle() {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId("job-1");
        meta.setSourceIndex("src");
        meta.setDestIndex("dst");
        return new MigrationHandle("job-1", new RemoteClusterConn(), null, meta, 0L);
    }

    /** start 打点：首份快照即带 startedAtMs、进行中 finishedAtMs 为 null。 */
    @Test
    public void snapshotCarriesStartedAtMsAndNullFinished() {
        MigrationHandle h = handle();
        assertNull("未打点前 startedAtMs 必须为 null（不假装已知）", h.toJobEs().getStartedAtMs());
        h.markStarted();
        MigrateJobES snap = h.toJobEs();
        assertNotNull("start 后快照必须带 startedAtMs", snap.getStartedAtMs());
        assertNull("进行中 finishedAtMs 必须为 null", snap.getFinishedAtMs());
    }

    /** 终态打点：markFinished 后两值齐备，且 finished >= started（elapsedMs 前端推算依据）。 */
    @Test
    public void finalSnapshotCarriesBothTimestamps() throws Exception {
        MigrationHandle h = handle();
        h.markStarted();
        Thread.sleep(5);
        h.markFinished();
        MigrateJobES snap = h.toJobEs();
        assertNotNull(snap.getFinishedAtMs());
        assertTrue("终态时刻不得早于开始时刻", snap.getFinishedAtMs() >= snap.getStartedAtMs());
    }

    /** markFinished 幂等：重复调用以首值为准（finalize 异常路径兜底不会再刷新尾值）。 */
    @Test
    public void markFinishedIsIdempotent() {
        MigrationHandle h = handle();
        h.markStarted();
        h.markFinished();
        Long first = h.toJobEs().getFinishedAtMs();
        h.markFinished();
        assertEquals("重复 markFinished 必须保持首值", first, h.toJobEs().getFinishedAtMs());
    }

    /** resume 重置：startedAtMs 刷新、旧 finishedAtMs 清空——耗时口径恒为最近一次运行。 */
    @Test
    public void resumeRestartResetsTiming() throws Exception {
        MigrationHandle h = handle();
        h.markStarted();
        Long firstStart = h.toJobEs().getStartedAtMs();
        Thread.sleep(5);
        h.markFinished();
        h.markStarted(); // resume 重建 handle 后同款调用
        MigrateJobES snap = h.toJobEs();
        assertNull("resume 后旧终态尾值必须清空", snap.getFinishedAtMs());
        assertTrue("resume 后 startedAtMs 必须刷新", snap.getStartedAtMs() >= firstStart);
    }

    /** slice 失败累加：同 slice 累计、异 slice 分账，快照带出（键=字符串化 sliceId）。 */
    @Test
    public void sliceErrorsAccumulateAndCarryIntoSnapshot() {
        MigrationHandle h = handle();
        h.addSliceError(2, 1L);
        h.addSliceError(2, 1L);
        h.addSliceError(0, 1L);
        Map<String, Long> se = h.toJobEs().getSliceErrors();
        assertEquals(2L, se.get("2").longValue());
        assertEquals(1L, se.get("0").longValue());
    }

    /** 无失败时 sliceErrors 为空清单（不是 null，前端可直接遍历——与 formatlessDateFields 同口径）。 */
    @Test
    public void snapshotHasEmptySliceErrorsWhenNothingFailed() {
        assertTrue(handle().toJobEs().getSliceErrors().isEmpty());
    }

    /** resume 还原：null 安全跳过旧文档缺字段；非正数/脏键不致命。 */
    @Test
    public void restoreSliceErrorsIsNullSafeAndSkipsGarbage() {
        MigrationHandle h = handle();
        h.restoreSliceErrors(null); // 旧文档无字段 → null，静默跳过
        assertTrue(h.toJobEs().getSliceErrors().isEmpty());

        Map<String, Long> persisted = new LinkedHashMap<>();
        persisted.put("1", 3L);
        persisted.put("x", 9L);   // 非 slice 序号脏键
        persisted.put("4", 0L);   // 零值无观测意义
        persisted.put("5", null); // null 值
        h.restoreSliceErrors(persisted);
        Map<String, Long> se = h.toJobEs().getSliceErrors();
        assertEquals(1, se.size());
        assertEquals(3L, se.get("1").longValue());
    }

    /**
     * 存量兼容口径实测：旧作业 JSON（无三新字段）反序列化后 startedAtMs/finishedAtMs 为 null、
     * sliceErrors 回落声明初始化的空 map——消费侧 null 安全即成立。
     */
    @Test
    public void legacyJsonWithoutNewFieldsDeserializesNullSafe() throws Exception {
        String legacy = "{\"jobId\":\"old-1\",\"status\":\"DONE\",\"sliceStatus\":{\"0\":\"DONE\"}}";
        MigrateJobES job = new ObjectMapper().readValue(legacy, MigrateJobES.class);
        assertNull(job.getStartedAtMs());
        assertNull(job.getFinishedAtMs());
        assertNotNull(job.getSliceErrors());
        assertTrue(job.getSliceErrors().isEmpty());
    }

    /**
     * API 输出契约实测：Controller 的 progress/jobs 直接返回 MigrateJobES（Jackson 序列化），
     * 新字段 getter 必须自动带出——漏 getter 此处即红。
     */
    @Test
    public void snapshotSerializesNewFieldsForApiOutput() throws Exception {
        MigrationHandle h = handle();
        h.markStarted();
        h.addSliceError(3, 1L);
        String json = new ObjectMapper().writeValueAsString(h.toJobEs());
        assertTrue("startedAtMs 必须出现在 API 输出", json.contains("\"startedAtMs\":"));
        assertTrue("sliceErrors 必须出现在 API 输出", json.contains("\"sliceErrors\":"));
    }
}
