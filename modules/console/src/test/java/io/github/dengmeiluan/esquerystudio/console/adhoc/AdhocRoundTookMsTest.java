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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 托管重建作业的耗时透出契约。
 *
 * <ul>
 *   <li>作业级 {@code tookMs}：finishedAt-startedAt，运行中约定 -1（D-2 契约，前端按「-」展示）；</li>
 *   <li>轮次级 {@code roundTookMs}：本轮 markMs 与上一轮 markMs（首轮回退 startedAt）之差，恒 >=0。</li>
 * </ul>
 *
 * <p>用 {@link AdhocRebuildJob#minimal(String)} 造最小作业（AdhocJobStoreContractTest 同款），
 * markMs 用 startedAt+偏移量构造，断言与墙钟无关。</p>
 */
public class AdhocRoundTookMsTest {

    private static Map<String, Object> round(int n, String phase, long markMs) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("round", n);
        m.put("phase", phase);
        m.put("markMs", markMs);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rounds(AdhocRebuildJob job) {
        return (List<Map<String, Object>>) job.toMap().get("rounds");
    }

    @Test
    public void toMapContainsTookMs() {
        assertThat(AdhocRebuildJob.minimal("j1").toMap()).containsKey("tookMs");
    }

    @Test
    public void tookMsIsMinusOneWhileRunning() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j2");
        assertThat(job.isRunning()).isTrue();
        assertThat(job.toMap()).containsEntry("tookMs", -1L);
    }

    @Test
    public void tookMsIsFinishedMinusStartedAfterFinish() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j3");
        job.markFinished();
        Map<String, Object> m = job.toMap();
        long finishedAt = (long) m.get("finishedAt");
        assertThat(m.get("tookMs")).isEqualTo(finishedAt - job.getStartedAt());
        assertThat((long) m.get("tookMs")).isGreaterThanOrEqualTo(0L);
    }

    @Test
    public void roundElementsContainRoundTookMs() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j4");
        job.addRound(round(0, "FULL", job.getStartedAt() + 5000L));
        assertThat(rounds(job).get(0)).containsKey("roundTookMs");
        assertThat((long) rounds(job).get(0).get("roundTookMs")).isGreaterThanOrEqualTo(0L);
    }

    @Test
    public void firstRoundMeasuredFromJobStart() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j5");
        job.addRound(round(0, "FULL", job.getStartedAt() + 5000L));
        assertThat(rounds(job).get(0).get("roundTookMs")).isEqualTo(5000L);
    }

    @Test
    public void nextRoundMeasuredFromPreviousMark() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j6");
        long t = job.getStartedAt();
        job.addRound(round(0, "FULL", t + 3000L));
        job.addRound(round(1, "CATCHUP", t + 9000L));
        assertThat(rounds(job).get(1).get("roundTookMs")).isEqualTo(6000L);
    }

    @Test
    public void roundTookMsNeverNegativeOnClockRegression() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j7");
        job.addRound(round(0, "FULL", job.getStartedAt() + 8000L));
        job.addRound(round(1, "CATCHUP", job.getStartedAt() + 1000L));
        assertThat((long) rounds(job).get(1).get("roundTookMs")).isGreaterThanOrEqualTo(0L);
    }

    @Test
    public void roundTookMsSurvivesToMapSnapshot() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j8");
        job.addRound(round(0, "FULL", job.getStartedAt() + 2000L));
        // toMap 的 rounds 是列表快照路径：元素键必须原样带到 API 输出
        assertThat(rounds(job).get(0).get("roundTookMs")).isEqualTo(2000L);
    }
}
