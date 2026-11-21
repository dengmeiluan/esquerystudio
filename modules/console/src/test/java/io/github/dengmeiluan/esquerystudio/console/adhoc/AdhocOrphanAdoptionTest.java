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

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;
import org.junit.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 重启孤儿作业收养：持久化快照 RUNNING 而内存（jobs）无此作业 = 写它的 worker 已丢，
 * 作业永远不会推进。{@code listJobs} 与 {@code status} 必须把它改判 FAILED + 中文中断说明 +
 * 标 finishedAt + 落盘（幂等：save 后非 RUNNING 不再命中）；本实例在跑的同 id 作业绝不误收养。
 *
 * <p>实例判据（多实例共享 store 拓扑）：只有 instanceId 为 null 的历史遗留快照、或
 * instanceId 等于本 JVM 的快照才可收养——其它实例的 RUNNING 快照可能是活作业，
 * 宁可遗留陈旧 RUNNING 不错杀（运维按 instanceId 判断处置）。</p>
 */
public class AdhocOrphanAdoptionTest {

    /** 捕获型 store：listRecent 回预置快照、find 按预置 map、save 记 (jobId, status)。 */
    private static final class CapturingStore implements AdhocJobStore {
        final List<AdhocRebuildJob> snapshots = new CopyOnWriteArrayList<>();
        final Map<String, AdhocRebuildJob> byId = new ConcurrentHashMap<>();
        final List<String[]> saves = new CopyOnWriteArrayList<>();

        @Override
        public void save(AdhocRebuildJob job) {
            saves.add(new String[]{job.getJobId(), job.getStatus()});
        }

        @Override
        public Optional<AdhocRebuildJob> find(String jobId) {
            return Optional.ofNullable(byId.get(jobId));
        }

        @Override
        public List<AdhocRebuildJob> listRecent(int limit) {
            return new ArrayList<>(snapshots);
        }

        @Override
        public void remove(String jobId) {
            // no-op
        }
    }

    private static AdhocRebuildJob runningSnapshot(String jobId, String stage) {
        AdhocRebuildJob j = AdhocRebuildJob.minimal(jobId);
        j.setStatus("RUNNING");
        j.setStage(stage);
        return j;
    }

    private static AdhocRebuildService service(CapturingStore store) {
        return new AdhocRebuildService(new EsIndexAdmin(null), () -> null, 60_000L, null, 0L, store);
    }

    /* ---------------- listJobs 收养 ---------------- */

    @Test
    public void listJobsAdoptsOrphanRunningSnapshotAsFailedWithRestartHint() {
        CapturingStore store = new CapturingStore();
        AdhocRebuildJob orphan = runningSnapshot("adhoc-orphan-1", "FULL_REINDEX");
        store.snapshots.add(orphan);

        List<Map<String, Object>> list = service(store).listJobs();

        assertThat(list).hasSize(1);
        Map<String, Object> m = list.get(0);
        assertThat(m.get("status")).isEqualTo("FAILED");
        assertThat(String.valueOf(m.get("error")))
                .contains("重启")
                .contains("FULL_REINDEX")
                .contains("目标索引已保留");
        assertThat(m.get("finishedAt")).as("收养必须标 finishedAt").isNotNull();
        assertThat(m.get("tookMs")).as("终态耗时不再为 -1").isNotEqualTo(-1L);
        // 收养快照本身已改判并落盘（FAILED）
        assertThat(orphan.getStatus()).isEqualTo("FAILED");
        assertThat(store.saves).anySatisfy(s -> {
            assertThat(s[0]).isEqualTo("adhoc-orphan-1");
            assertThat(s[1]).isEqualTo("FAILED");
        });
    }

    @Test
    public void adoptionIsIdempotentAcrossRepeatedListJobs() {
        CapturingStore store = new CapturingStore();
        store.snapshots.add(runningSnapshot("adhoc-orphan-2", "CATCHUP"));
        AdhocRebuildService svc = service(store);
        svc.listJobs();
        int savesAfterFirst = store.saves.size();
        assertThat(savesAfterFirst).isEqualTo(1);

        // 第二次 listJobs：快照已非 RUNNING，不再命中收养、不再 save
        List<Map<String, Object>> second = svc.listJobs();
        assertThat(second.get(0).get("status")).isEqualTo("FAILED");
        assertThat(store.saves.size()).isEqualTo(savesAfterFirst);
    }

    @Test
    public void terminalSnapshotsAreNeverAdopted() {
        // SUCCEEDED/FAILED/ABORTED 快照原样透出，零 save
        CapturingStore store = new CapturingStore();
        AdhocRebuildJob done = AdhocRebuildJob.minimal("adhoc-done");
        done.setStatus("SUCCEEDED");
        store.snapshots.add(done);

        List<Map<String, Object>> list = service(store).listJobs();

        assertThat(list.get(0).get("status")).isEqualTo("SUCCEEDED");
        assertThat(store.saves).isEmpty();
    }

    /* ---------------- status 收养 ---------------- */

    @Test
    public void statusAdoptsOrphanRunningSnapshot() {
        CapturingStore store = new CapturingStore();
        AdhocRebuildJob orphan = runningSnapshot("adhoc-orphan-3", "WRITE_BLOCK");
        store.byId.put("adhoc-orphan-3", orphan);

        Map<String, Object> m = service(store).status("adhoc-orphan-3");

        assertThat(m.get("status")).isEqualTo("FAILED");
        assertThat(String.valueOf(m.get("error"))).contains("重启").contains("WRITE_BLOCK");
        assertThat(m.get("finishedAt")).isNotNull();
        assertThat(store.saves).anySatisfy(s -> {
            assertThat(s[0]).isEqualTo("adhoc-orphan-3");
            assertThat(s[1]).isEqualTo("FAILED");
        });
    }

    /* ---------------- 实例判据：异实例不收养 / 本实例收养 ---------------- */

    @Test
    public void foreignInstanceRunningSnapshotIsNotAdoptedByListJobs() {
        // 共享 store 拓扑：别的实例可能还在跑——改判 FAILED 会误杀活作业，宁可遗留陈旧 RUNNING
        CapturingStore store = new CapturingStore();
        AdhocRebuildJob foreign = runningSnapshot("adhoc-foreign-1", "FULL_REINDEX");
        foreign.setInstanceId("other-jvm-uuid");
        store.snapshots.add(foreign);

        List<Map<String, Object>> list = service(store).listJobs();

        assertThat(list.get(0).get("status")).as("异实例快照不得收养").isEqualTo("RUNNING");
        assertThat(list.get(0).get("error")).isNull();
        assertThat(store.saves).as("不产生任何收养落盘").isEmpty();
        assertThat(foreign.getStatus()).isEqualTo("RUNNING");
    }

    @Test
    public void foreignInstanceRunningSnapshotIsNotAdoptedByStatus() {
        CapturingStore store = new CapturingStore();
        AdhocRebuildJob foreign = runningSnapshot("adhoc-foreign-2", "CATCHUP");
        foreign.setInstanceId("other-jvm-uuid");
        store.byId.put("adhoc-foreign-2", foreign);

        Map<String, Object> m = service(store).status("adhoc-foreign-2");

        assertThat(m.get("status")).isEqualTo("RUNNING");
        assertThat(m.get("error")).isNull();
        assertThat(m.get("finishedAt")).isNull();
        assertThat(store.saves).isEmpty();
    }

    @Test
    public void ownInstanceOrphanSnapshotIsStillAdopted() {
        // instanceId 等于本 JVM：确定是自己的孤儿（内存缺席），收养
        CapturingStore store = new CapturingStore();
        AdhocRebuildJob own = runningSnapshot("adhoc-own-1", "SWITCH");
        own.setInstanceId(AdhocRebuildService.INSTANCE_ID);
        store.snapshots.add(own);

        List<Map<String, Object>> list = service(store).listJobs();

        assertThat(list.get(0).get("status")).isEqualTo("FAILED");
        assertThat(String.valueOf(list.get(0).get("error"))).contains("重启");
        assertThat(store.saves).anySatisfy(s -> {
            assertThat(s[0]).isEqualTo("adhoc-own-1");
            assertThat(s[1]).isEqualTo("FAILED");
        });
    }

    /* ---------------- 内存含同 id：绝不误收养 ---------------- */

    @Test
    public void inMemoryRunningJobWithSameIdIsNotAdopted() throws Exception {
        CountDownLatch enteredCreate = new CountDownLatch(1);
        CountDownLatch releaseCreate = new CountDownLatch(1);
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
                enteredCreate.countDown();
                try {
                    // 模拟慢建索引：把 worker 按住，保证 listJobs 观察窗口内内存作业仍 RUNNING
                    releaseCreate.await(10L, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
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
                return new ReindexProgress(true, "completed");
            }

            @Override
            public void switchWriteIndex(String alias, String newPhysical, String oldPhysical) {
                // no-op
            }

            @Override
            public void setIndexWriteBlock(String index, boolean writeBlocked) {
                // no-op
            }
        };
        CapturingStore store = new CapturingStore();
        AdhocRebuildService svc = new AdhocRebuildService(admin, () -> null, 60_000L, null, 0L, store);

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "my_alias");
        req.put("strategy", "MANUAL");
        req.put("destIndex", "dest_phys");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");
        String jobId = (String) svc.start(req).get("jobId");
        assertThat(enteredCreate.await(10L, TimeUnit.SECONDS))
                .as("worker 应已进入 CREATE_DEST 阻塞点").isTrue();

        // store 里有同 id 的 RUNNING 快照（persist 落盘的）——内存正在跑，必须维持 RUNNING
        store.snapshots.add(runningSnapshot(jobId, "CREATE_DEST"));
        List<Map<String, Object>> list = svc.listJobs();
        Map<String, Object> mine = list.stream()
                .filter(m -> jobId.equals(m.get("jobId")))
                .findFirst().orElseThrow(() -> new AssertionError("列表中缺本实例作业 " + jobId));
        assertThat(mine.get("status")).as("内存在跑作业不得被收养").isEqualTo("RUNNING");
        // start 建 job 时打上本 JVM 实例标识（随 toMap 持久化，供跨实例收养判别）
        assertThat(mine.get("instanceId")).isEqualTo(AdhocRebuildService.INSTANCE_ID);
        // 非孤儿不产生 FAILED 收养 save（start 的 RUNNING persist 之外）
        assertThat(store.saves.stream().filter(s -> s[0].equals(jobId) && "FAILED".equals(s[1])))
                .isEmpty();

        // 收尾：放行 worker 并等作业正常终结，避免后台线程悬挂
        releaseCreate.countDown();
        long deadline = System.currentTimeMillis() + 10_000L;
        Map<String, Object> done = null;
        while (System.currentTimeMillis() < deadline) {
            done = svc.status(jobId);
            if (!"RUNNING".equals(done.get("status"))) {
                break;
            }
            Thread.sleep(20L);
        }
        assertThat(done.get("status")).isEqualTo("SUCCEEDED");
    }
}
