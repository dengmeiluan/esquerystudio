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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 作业事件环（stageEvents）的行为锁：四字段形态、容量封顶移除最旧、
 * toMap/快照覆盖层的持久化往返（Es/Jdbc store 的 payload 路径）、
 * events 查询出口与门超时/门开启的事件落点。
 */
public class AdhocStageEventsTest {

    private static AdhocRebuildService serviceWithStore(AdhocJobStore store) {
        return new AdhocRebuildService(null, null, 0L, null, 0L, store);
    }

    @Test
    public void 事件环_四字段形态与时间线追加() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("ev-1");
        job.addStageEvent("PENDING", "STARTED", "作业创建（策略 MANUAL，target=host）");
        job.addStageEvent("FULL_REINDEX", "STAGE", "进入阶段 FULL_REINDEX");
        job.addStageEvent("FULL_REINDEX", "ROUND_DONE", "第 0 轮（FULL）完成：created 10 / updated 0 / 冲突 0");

        List<Map<String, Object>> events = eventsOf(job);
        assertEquals(3, events.size());
        for (Map<String, Object> e : events) {
            assertEquals("事件必须是 {ts,stage,status,detail} 四字段", 4, e.size());
            assertNotNull(e.get("ts"));
            assertNotNull(e.get("stage"));
            assertNotNull(e.get("status"));
            assertNotNull(e.get("detail"));
        }
        assertEquals("STARTED", events.get(0).get("status"));
        assertEquals("ROUND_DONE", events.get(2).get("status"));
        // ts 升序（追加即时间线）
        assertTrue(((Number) events.get(0).get("ts")).longValue() <= ((Number) events.get(2).get("ts")).longValue());
    }

    @Test
    public void 事件环_容量封顶200_超限移除最旧() {
        AdhocRebuildJob job = AdhocRebuildJob.minimal("ev-cap");
        for (int i = 0; i < 205; i++) {
            job.addStageEvent("S" + i, "STAGE", "detail-" + i);
        }
        List<Map<String, Object>> events = eventsOf(job);
        assertEquals("容量封顶 200", 200, events.size());
        assertEquals("最旧的 5 条被移除", "detail-5", events.get(0).get("detail"));
        assertEquals("最新一条保留", "detail-204", events.get(events.size() - 1).get("detail"));
    }

    @Test
    public void 事件环_toMap快照往返保真_经覆盖层回读() {
        /* Es/Jdbc store 的序列化路径唯一：save 时 payload=toMap()，rehydrate 时 minimal 骨架 +
           restoreSnapshotView(payload)。模拟该往返，断言事件时间线保真（重启后 events 端点可读）。 */
        AdhocRebuildJob job = AdhocRebuildJob.minimal("ev-io");
        job.setOwner("alice", "REBUILD_OP");
        job.addStageEvent("PENDING", "STARTED", "作业创建（策略 MANUAL，target=host）");
        job.addStageEvent("AWAIT_CONFIRM", "GATE_OPEN", "切换前人工确认门开启（等待放行或超时）");
        job.setStatus("ABORTED");
        job.addStageEvent("AWAIT_CONFIRM", "GATE_TIMED_OUT", "等待人工确认切换超时，作业已中止");
        job.markFinished();

        Map<String, Object> payload = job.toMap();

        AdhocRebuildJob skeleton = AdhocRebuildJob.minimal("ev-io");
        skeleton.setStatus(String.valueOf(payload.get("status")));
        skeleton.restoreSnapshotView(payload);

        assertEquals("骨架的事件数与快照一致", eventsOf(job).size(), eventsOf(skeleton).size());
        assertEquals(eventsOf(job).get(1), eventsOf(skeleton).get(1));
        assertEquals(eventsOf(job).get(2), eventsOf(skeleton).get(2));
    }

    @Test
    public void events查询_活作业与持久化历史_不存在拒绝() {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        AdhocRebuildService service = serviceWithStore(store);

        AdhocRebuildJob job = AdhocRebuildJob.minimal("ev-q");
        job.addStageEvent("PENDING", "STARTED", "作业创建（策略 MANUAL，target=host）");
        store.save(job);

        Map<String, Object> out = service.events("ev-q");
        assertEquals("ev-q", out.get("jobId"));
        assertEquals(1, ((List<?>) out.get("events")).size());

        try {
            service.events("no-such");
            fail("不存在的作业应拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("作业不存在"));
        }
    }

    @Test
    public void events查询_旧版本持久化无该字段_空清单不炸() {
        AdhocJobStore legacyStore = new InMemoryAdhocJobStore() {
            @Override
            public void save(AdhocRebuildJob job) {
                // 模拟旧版本 payload：剥离 stageEvents 后落盘
                Map<String, Object> payload = job.toMap();
                payload.remove("stageEvents");
                AdhocRebuildJob skeleton = AdhocRebuildJob.minimal(job.getJobId());
                skeleton.setStatus(String.valueOf(payload.get("status")));
                skeleton.restoreSnapshotView(payload);
                super.save(skeleton);
            }
        };
        AdhocRebuildService service = serviceWithStore(legacyStore);
        AdhocRebuildJob job = AdhocRebuildJob.minimal("ev-legacy");
        job.addStageEvent("PENDING", "STARTED", "作业创建");
        job.setStatus("SUCCEEDED");
        legacyStore.save(job);

        Map<String, Object> out = service.events("ev-legacy");
        assertEquals(0, ((List<?>) out.get("events")).size());
    }

    @Test
    public void 确认门_开启与超时落事件() throws Exception {
        /* confirmTimeoutMs=0：awaitSwitchConfirm 立即走超时臂——门开启（GATE_OPEN）与
           超时中止（GATE_TIMED_OUT）两条事件都必须落在时间线上（MANUAL 策略无写阻断）。 */
        AdhocRebuildService service = serviceWithStore(new InMemoryAdhocJobStore());
        AdhocRebuildJob job = AdhocRebuildJob.minimal("ev-gate");
        boolean proceed = service.awaitSwitchConfirm(job);

        assertEquals("超时后不切换", false, proceed);
        assertEquals("ABORTED", job.getStatus());
        List<Map<String, Object>> events = eventsOf(job);
        assertEquals(3, events.size());
        assertEquals("进入门前的阶段推进也落事件（STAGE）", "STAGE", events.get(0).get("status"));
        assertEquals(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, events.get(0).get("stage"));
        assertEquals("GATE_OPEN", events.get(1).get("status"));
        assertEquals(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, events.get(1).get("stage"));
        assertEquals("GATE_TIMED_OUT", events.get(2).get("status"));
        assertEquals(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, events.get(2).get("stage"));
    }

    @Test
    public void 轮次完成落ROUND_DONE事件_计数进detail() {
        /* addRound 是「每轮 reindex 完成」的唯一收口：事件随轮次自动落（ROUND_DONE）。 */
        AdhocRebuildService service = serviceWithStore(new InMemoryAdhocJobStore());
        AdhocRebuildJob job = AdhocRebuildJob.minimal("ev-round");
        job.setStage("CATCHUP");

        service.addRound(job, 1, "CATCHUP", "task-1", System.currentTimeMillis(),
                io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress
                        .of(true, "done", 100L, 60L, 3L, 2L, 1L));

        List<Map<String, Object>> events = eventsOf(job);
        assertEquals(1, events.size());
        Map<String, Object> roundEvent = events.get(0);
        assertEquals("CATCHUP", roundEvent.get("stage"));
        assertEquals("ROUND_DONE", roundEvent.get("status"));
        String detail = String.valueOf(roundEvent.get("detail"));
        assertTrue("detail 含轮次计数：", detail.contains("created 60") && detail.contains("冲突 1"));
        assertEquals("rounds 账本同源追加", 1, job.toMap().get("rounds") instanceof List
                ? ((List<?>) job.toMap().get("rounds")).size() : 0);
    }

    private static List<Map<String, Object>> eventsOf(AdhocRebuildJob job) {
        Object events = job.toMap().get("stageEvents");
        assertNotNull("toMap 必须恒输出 stageEvents（空清单也输出）", events);
        return new ArrayList<>((List<Map<String, Object>>) events);
    }
}
