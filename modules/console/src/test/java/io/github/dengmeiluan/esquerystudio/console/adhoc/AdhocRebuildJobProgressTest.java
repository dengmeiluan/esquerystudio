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

import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 托管重建作业的 docs 级进度三字段契约（{@code total}/{@code created}/{@code updated}）。
 *
 * <ul>
 *   <li>{@code toMap()} 恒含三键：默认 {@code null}=未进入 reindex 阶段/旧持久化回读——
 *       控制台按「字段缺席不渲染」向后兼容（不冒充 0）；</li>
 *   <li>{@link AdhocRebuildJob#applyProgress(ReindexProgress)}：{@code awaitTask} 轮询
 *       {@code EsIndexAdmin.getReindexProgress} 每秒刷新的单一写入口，
 *       计数取自 {@link ReindexProgress} 单源（core 层解析 ES status 的唯一出处）；</li>
 *   <li>纯增量：既有键（jobId/status/stage/currentProgress/tookMs/rounds…）全保留，旧前端零感知。</li>
 * </ul>
 *
 * <p>用 {@link AdhocRebuildJob#minimal(String)} 造最小作业（AdhocRoundTookMsTest 同款）。</p>
 */
public class AdhocRebuildJobProgressTest {

    @Test
    public void toMapAlwaysContainsThreeProgressKeys() {
        Map<String, Object> m = AdhocRebuildJob.minimal("j-p1").toMap();
        assertThat(m).containsKeys("total", "created", "updated");
    }

    @Test
    public void progressKeysAreNullBeforeReindexPhase() {
        Map<String, Object> m = AdhocRebuildJob.minimal("j-p2").toMap();
        assertThat(m).containsEntry("total", null)
                .containsEntry("created", null)
                .containsEntry("updated", null);
    }

    @Test
    public void applyProgressCarriesCountsIntoToMap() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j-p3");
        job.applyProgress(ReindexProgress.of(false, "{}", 1000L, 400L, 12L, 0L, 3L));
        Map<String, Object> m = job.toMap();
        assertThat(m).containsEntry("total", 1000L)
                .containsEntry("created", 400L)
                .containsEntry("updated", 12L);
    }

    @Test
    public void applyProgressSimplePathStaysNullNotZero() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j-p4");
        /* 简单路径（非法 taskId/任务已消失）：计数不可知 → null，不冒充 0 */
        job.applyProgress(new ReindexProgress(true, "{\"total\":99}"));
        assertThat(job.toMap()).containsEntry("total", null)
                .containsEntry("created", null)
                .containsEntry("updated", null);
    }

    @Test
    public void latestApplyWins() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j-p5");
        job.applyProgress(ReindexProgress.of(false, "{}", 1000L, 100L, 0L, 0L, 0L));
        job.applyProgress(ReindexProgress.of(false, "{}", 1000L, 800L, 5L, 0L, 3L));
        assertThat(job.toMap()).containsEntry("created", 800L).containsEntry("updated", 5L);
    }

    @Test
    public void legacyKeysSurvivePureAdditive() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j-p6");
        job.setStatus("RUNNING");
        job.setStage("FULL_REINDEX");
        Map<String, Object> prog = new LinkedHashMap<>();
        prog.put("created", 1L);
        prog.put("total", 2L);
        job.setCurrentProgress(prog);
        Map<String, Object> m = job.toMap();
        assertThat(m).containsKeys("jobId", "logicalName", "strategy", "stage", "status",
                "currentTaskId", "startedAt", "finishedAt", "tookMs",
                "sourceDocCount", "destDocCount", "currentProgress", "rounds", "report");
        /* 兼容通道 currentProgress 原样并存（双通道不互踩） */
        assertThat(m.get("currentProgress")).isEqualTo(prog);
    }

    @Test
    public void nullProgressIsIgnored() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("j-p7");
        job.applyProgress(ReindexProgress.of(false, "{}", 1000L, 400L, 12L, 0L, 0L));
        job.applyProgress(null);
        assertThat(job.toMap()).containsEntry("created", 400L);
    }
}
