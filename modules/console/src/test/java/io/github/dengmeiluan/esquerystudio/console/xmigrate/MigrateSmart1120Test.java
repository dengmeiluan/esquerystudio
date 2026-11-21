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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;

/**
 * 迁移智能化四项的行为契约：preflight 规模预估字段形状、收尾增量窗口复查告知、
 * 409 冲突样本容量截断、续跑计数基线（prior + 本次累计口径）。
 *
 * <p>全部纯 JUnit 直构造（同包匿名子类做桩，无 mockito）；IO 依赖的正向取数路径
 * 用抽出的纯函数（estimateSeconds / shardCountFromFlatSettings）与源码锚锁定。</p>
 */
public class MigrateSmart1120Test {

    /* ───────── 1. preflight 规模预估 ───────── */

    /**
     * 预估字段形状：响应恒含七键；源侧取数不可达时预估字段如实为 null（不抛、不假装已知），
     * 原有 sourceIndex/destIndex/destExists 契约不动。
     */
    @Test
    public void preflightCarriesEstimateFieldShape() {
        CrossClusterMigrateService svc = new CrossClusterMigrateService(
                explodingLocalClient(), absentDestAdmin(), factoryReturningNull(),
                null, null, null, null, null, null);
        MigrateRequest req = request("m1120-src", "m1120-dst");
        req.setConn(new RemoteClusterConn()); // 已填 conn 但取数不可达（factory 返回 null 模拟）

        Map<String, Object> out = svc.preflight(req);

        assertTrue("预估字段必须出现在响应里: " + out.keySet(),
                out.keySet().containsAll(java.util.Arrays.asList(
                        "sourceIndex", "destIndex", "destExists",
                        "srcDocCount", "srcShards", "destShards", "estSeconds")));
        assertEquals("m1120-src", out.get("sourceIndex"));
        assertEquals("m1120-dst", out.get("destIndex"));
        assertEquals(Boolean.FALSE, out.get("destExists"));
        assertNull("源 docs 取不到如实 null", out.get("srcDocCount"));
        assertNull("源分片取不到如实 null", out.get("srcShards"));
        assertNull("目标不存在时分片为 null", out.get("destShards"));
        assertNull("源数未知则不可估耗时", out.get("estSeconds"));
    }

    /** 预计耗时换算：极速档 10000 条/秒、温和档 3000 条/秒（粗估常量），源数未知返回 null。 */
    @Test
    public void estimateSecondsFollowsTuneModeRates() {
        assertEquals(Long.valueOf(2L),
                CrossClusterMigrateService.estimateSeconds(25_000L, TuneMode.AGGRESSIVE));
        assertEquals(Long.valueOf(3L),
                CrossClusterMigrateService.estimateSeconds(9_000L, TuneMode.GENTLE));
        assertEquals("不足一秒整除为 0", Long.valueOf(0L),
                CrossClusterMigrateService.estimateSeconds(500L, TuneMode.AGGRESSIVE));
        assertNull(CrossClusterMigrateService.estimateSeconds(null, TuneMode.AGGRESSIVE));
    }

    /** flat_settings 形态解析：settings 显式值优先、defaults 兜底；缺失/非数字返回 null。 */
    @Test
    public void shardCountFromFlatSettingsParsesNumber() {
        Map<String, Object> explicit = new HashMap<>();
        Map<String, Object> s1 = new HashMap<>();
        s1.put("index.number_of_shards", "5");
        explicit.put("settings", s1);
        assertEquals(Integer.valueOf(5),
                CrossClusterMigrateService.shardCountFromFlatSettings(explicit));

        Map<String, Object> fromDefaults = new HashMap<>();
        Map<String, Object> s2 = new HashMap<>();
        s2.put("index.number_of_shards", 3);
        fromDefaults.put("defaults", s2);
        assertEquals(Integer.valueOf(3),
                CrossClusterMigrateService.shardCountFromFlatSettings(fromDefaults));

        assertNull(CrossClusterMigrateService.shardCountFromFlatSettings(null));
        assertNull(CrossClusterMigrateService.shardCountFromFlatSettings(new HashMap<String, Object>()));
        Map<String, Object> bad = new HashMap<>();
        Map<String, Object> s3 = new HashMap<>();
        s3.put("index.number_of_shards", "not-a-number");
        bad.put("settings", s3);
        assertNull(CrossClusterMigrateService.shardCountFromFlatSettings(bad));
    }

    /** 目标分片只在目标存在时读取：dest 不存在时不得触碰本地 client（供应商抛错也不该被调用）。 */
    @Test
    public void destShardsNotReadWhenDestAbsent() {
        CrossClusterMigrateService svc = new CrossClusterMigrateService(
                explodingLocalClient(), absentDestAdmin(), null,
                null, null, null, null, null, null);
        Map<String, Object> out = svc.preflight(request("m1120-src", "m1120-dst"));
        assertEquals(Boolean.FALSE, out.get("destExists"));
        assertNull(out.get("destShards"));
    }

    /** 目标存在但读目标 settings 失败：预检整体不抛，destShards 如实 null（展示增强不阻断）。 */
    @Test
    public void destShardsReadFailureDoesNotBreakPreflight() {
        CrossClusterMigrateService svc = new CrossClusterMigrateService(
                explodingLocalClient(), existingDestAdmin(), null,
                null, null, null, null, null, null);
        Map<String, Object> out = svc.preflight(request("m1120-src", "m1120-dst"));
        assertEquals(Boolean.TRUE, out.get("destExists"));
        assertNull(out.get("destShards"));
    }

    /* ───────── 2. 收尾增量窗口复查 ───────── */

    /** 增量窗口告知进完成结论：基础计数仍在，告知原文与增量补齐路径完整透传。 */
    @Test
    public void incrementWindowWarningJoinsFinalMessage() {
        String msg = service().buildFinalMessage(handle(), false, java.util.Collections.singletonList(
                "迁移窗口内源新增约 5 条（快照后写入），如需最新数据可再跑一次迁移按 create 增量补齐"));
        assertTrue("基础计数仍在: " + msg, msg.contains("迁移结束：搬入 100"));
        assertTrue("增量窗口告知进结论", msg.contains("迁移窗口内源新增约 5 条（快照后写入）"));
        assertTrue("给出增量补齐路径", msg.contains("create 增量补齐"));
    }

    /** 源码锚：终态对账之后的源侧复查必须真的接进 finalize（防重构静默丢失）。 */
    @Test
    public void finalizeIncrementRecheckWiringAnchors() throws Exception {
        String src = serviceSource();
        assertTrue("增量窗口告知文案在收尾路径上", src.contains("迁移窗口内源新增约"));
        assertTrue("复查走源侧 _count", src.contains("countRemote(remote, handle.getMeta().getSourceIndex())"));
        assertTrue("与作业 total 对比", src.contains("handle.getMeta().getTotal()"));
    }

    /* ───────── 3. 冲突 _id 样本容量截断 ───────── */

    /** worker 侧采样上限：超限后样本不再保存、容量封顶；快照带出且可序列化（API 输出形态）。 */
    @Test
    public void conflictSamplesCapAtRingLimit() throws Exception {
        MigrationHandle h = handle();
        SliceWorker w = new SliceWorker(0, 1, "src", "dst", 10, 60, null, null, h, null, null);
        for (int i = 0; i < SliceWorker.CONFLICT_RING_CAP + 5; i++) {
            w.recordConflictSample("id-" + i);
        }
        List<String> samples = h.toJobEs().getConflictSamples();
        assertEquals("样本容量封顶", SliceWorker.CONFLICT_RING_CAP, samples.size());
        assertTrue(samples.contains("id-0"));
        assertFalse("超限样本不再保存", samples.contains("id-" + SliceWorker.CONFLICT_RING_CAP));
        String json = new ObjectMapper().writeValueAsString(h.toJobEs());
        assertTrue("快照序列化带出冲突样本", json.contains("\"conflictSamples\":[\"id-0\""));
    }

    /** handle 侧截断与空值安全：null/空串不进样本；容量外样本被丢弃。 */
    @Test
    public void handleConflictSamplesTruncateAndNullSafe() {
        MigrationHandle h = handle();
        h.addConflictSample(null);
        h.addConflictSample("");
        assertTrue(h.toJobEs().getConflictSamples().isEmpty());
        for (int i = 0; i < 1005; i++) {
            h.addConflictSample("c-" + i);
        }
        assertEquals("handle 全局闸门封顶", 1000, h.toJobEs().getConflictSamples().size());
        assertFalse(h.toJobEs().getConflictSamples().contains("c-1000"));
    }

    /* ───────── 4. 续跑计数基线 ───────── */

    /** prior + 本次累计口径：带基线的 handle 输出合成总量，基线值同时带出。 */
    @Test
    public void resumeBaselineAddsToCurrentTotals() {
        MigrateJobES meta = meta();
        meta.setPriorMigrated(700L);
        meta.setPriorConflicts(300L);
        MigrationHandle h = new MigrationHandle("job-1", new RemoteClusterConn(), null, meta, 0L);
        h.addMigrated(1, 50);
        h.addConflicts(20);

        MigrateJobES snap = h.toJobEs();
        assertEquals("migrated = 基线 + 本次", 750L, snap.getMigrated().longValue());
        assertEquals("conflicts = 基线 + 本次", 320L, snap.getConflicts().longValue());
        assertEquals(Long.valueOf(700L), snap.getPriorMigrated());
        assertEquals(Long.valueOf(300L), snap.getPriorConflicts());
    }

    /** 首次 start 无基线：prior 为 null、输出即本次累计（口径不因新字段改变）。 */
    @Test
    public void firstStartHasNoBaseline() {
        MigrationHandle h = new MigrationHandle("job-1", new RemoteClusterConn(), null, meta(), 0L);
        h.addMigrated(1, 50);
        h.addConflicts(20);
        MigrateJobES snap = h.toJobEs();
        assertNull(snap.getPriorMigrated());
        assertNull(snap.getPriorConflicts());
        assertEquals(50L, snap.getMigrated().longValue());
        assertEquals(20L, snap.getConflicts().longValue());
    }

    /** resume 还原 slice 计数只写 per-slice 观测，不进全局累计（否则与基线双计）。 */
    @Test
    public void restoreSliceMigratedCountDoesNotTouchGlobal() {
        MigrationHandle h = new MigrationHandle("job-1", new RemoteClusterConn(), null, meta(), 0L);
        h.restoreSliceMigratedCount(2, 123L);
        h.restoreSliceMigratedCount(2, 123L); // 多轮 resume 重复还原同一持久化值：set 幂等不得逐轮累加
        MigrateJobES snap = h.toJobEs();
        assertEquals(123L, snap.getSliceMigrated().get("2").longValue());
        assertEquals("全局累计不被还原值影响", Long.valueOf(0L), snap.getMigrated());
        h.restoreSliceMigratedCount(3, 0L); // 非正数静默跳过
        assertNull(h.toJobEs().getSliceMigrated().get("3"));
    }

    /** 旧作业 JSON（无三个新字段）反序列化 null 安全：prior 为 null、样本为空清单。 */
    @Test
    public void legacyJobJsonWithoutNewFieldsDeserializesNullSafe() throws Exception {
        String legacy = "{\"jobId\":\"old-1\",\"status\":\"DONE\",\"migrated\":100,\"conflicts\":5}";
        MigrateJobES job = new ObjectMapper().readValue(legacy, MigrateJobES.class);
        assertNull(job.getPriorMigrated());
        assertNull(job.getPriorConflicts());
        assertNotNull(job.getConflictSamples());
        assertTrue(job.getConflictSamples().isEmpty());
    }

    /** 源码锚：resume 路径把上次持久化计数写入基线，且 slice 还原不再进全局。 */
    @Test
    public void resumeBaselineWiringAnchors() throws Exception {
        String src = serviceSource();
        assertTrue("cloneMetaForResume 带出上次计数作基线",
                src.contains("meta.setPriorMigrated(persisted.getMigrated());"));
        assertTrue("conflicts 基线同样带出",
                src.contains("meta.setPriorConflicts(persisted.getConflicts());"));
        assertTrue("resume 还原 slice 计数不再进全局累计",
                src.contains("handle.restoreSliceMigratedCount(i, c);"));
    }

    /* ───────── 桩与工具 ───────── */

    private static MigrateJobES meta() {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId("job-1");
        meta.setSourceIndex("src");
        meta.setDestIndex("dst");
        return meta;
    }

    private static MigrationHandle handle() {
        MigrationHandle h = new MigrationHandle("job-1", new RemoteClusterConn(), null, meta(), 0L);
        h.addMigrated(1, 100);
        h.addConflicts(50);
        return h;
    }

    /** 与 FinalizeTransparency1120Test 同款：构造器只赋值不解析依赖，其余协作者传 null。 */
    private static CrossClusterMigrateService service() {
        return new CrossClusterMigrateService(null, null, null, null, null, null, null, null, null);
    }

    private static MigrateRequest request(String src, String dst) {
        MigrateRequest req = new MigrateRequest();
        req.setSourceIndex(src);
        req.setDestIndex(dst);
        return req;
    }

    private static EsIndexAdmin absentDestAdmin() {
        return new EsIndexAdmin(null) {
            @Override
            public boolean indexExists(String index) {
                return false;
            }
        };
    }

    private static EsIndexAdmin existingDestAdmin() {
        return new EsIndexAdmin(null) {
            @Override
            public boolean indexExists(String index) {
                return true;
            }
        };
    }

    /** 一触即炸的本地 client 供应商：断言「不该被调用的路径没被调用」用。 */
    private static java.util.function.Supplier<org.elasticsearch.client.RestHighLevelClient> explodingLocalClient() {
        return () -> {
            throw new RuntimeException("m1120-local-client-must-not-be-touched");
        };
    }

    /** 源侧取数不可达的 factory 桩（build 返回 null → 调用方降级为字段 null）。 */
    private static RemoteEsClientFactory factoryReturningNull() {
        return new RemoteEsClientFactory(1000, 1000) {
            @Override
            public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                return null;
            }
        };
    }

    private static String serviceSource() throws Exception {
        return new String(Files.readAllBytes(Paths.get(
                "src/main/java/io/github/dengmeiluan/esquerystudio/console/xmigrate/CrossClusterMigrateService.java")),
                java.nio.charset.StandardCharsets.UTF_8);
    }
}
