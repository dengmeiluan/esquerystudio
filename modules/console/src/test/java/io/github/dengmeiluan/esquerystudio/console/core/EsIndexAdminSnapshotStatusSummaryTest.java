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

package io.github.dengmeiluan.esquerystudio.console.core;

import io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController;
import org.junit.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 快照分片级进度 summary 的守门测试（batch 533）。
 *
 * <p>两件事：</p>
 * <ol>
 *   <li>{@link EsIndexAdmin#normalizeSnapshotStatus(Map, String, String)} 的归一化口径：形状、
 *       pct 计算、逐分片 stage 计数、缺字段容错不抛——纯静态方法直接构造 raw _status 形状 Map 断言，
 *       不需要 ES 实例（{@code snapshotStatusSummary} 只是 snapshotStatus + 本方法，请求通道由
 *       snapshotStatus 原实现覆盖）。</li>
 *   <li>Controller {@code ?summary=true} 分派 wiring：缺省仍走原始透传、summary 分支走归一化摘要。
 *       重量级快照操作不能对真实集群执行，故沿用 ClusterForceMergeWiringTest 的源文本 + 反射范式。</li>
 * </ol>
 *
 * @author aicoding
 */
public class EsIndexAdminSnapshotStatusSummaryTest {

    /* ---------------- raw _status 形状构造 ---------------- */

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static Map<String, Object> shard(String stage) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("stage", stage);
        m.put("stats", new LinkedHashMap<String, Object>());
        return m;
    }

    /** 两个索引、8 分片（orders: INIT/STARTED/DONE/DONE，users: DONE/FAILURE/FINALIZE/START）。 */
    private static Map<String, Object> rawTwoIndices() {
        Map<String, Object> orders = map(
                "shards_stats", map("total", 4, "done", 2, "failed", 0),
                "shards", map("0", shard("INIT"), "1", shard("STARTED"), "2", shard("DONE"), "3", shard("DONE")));
        Map<String, Object> users = map(
                "shards_stats", map("total", 4, "done", 1, "failed", 1),
                "shards", map("0", shard("DONE"), "1", shard("FAILURE"), "2", shard("FINALIZE"), "3", shard("START")));
        Map<String, Object> indices = new LinkedHashMap<String, Object>();
        indices.put("orders", orders);
        indices.put("users", users);
        Map<String, Object> snap = map(
                "repository", "repo-a",
                "snapshot", "snap-1",
                "state", "STARTED",
                "start_time_millis", 1700000000000L,
                "shards_stats", map("initializing", 1, "started", 1, "finalizing", 0, "done", 3, "failed", 1, "total", 8),
                "indices", indices);
        return map("snapshots", Collections.singletonList(snap), "total", 1, "remaining", 0);
    }

    /* ---------------- 归一化口径 ---------------- */

    @Test
    public void normalize_fullShape_countsByStage_keepsIndexOrder_bodyWinsOverParams() {
        Map<String, Object> out = EsIndexAdmin.normalizeSnapshotStatus(rawTwoIndices(), "param-repo", "param-snap");

        assertEquals("repo-a", out.get("repository"));
        assertEquals("snap-1", out.get("snapshot"));
        assertEquals("STARTED", out.get("state"));
        assertEquals(1700000000000L, out.get("startTimeMillis"));

        Map<?, ?> shardsStats = (Map<?, ?>) out.get("shardsStats");
        assertEquals(8L, shardsStats.get("total"));
        assertEquals(3L, shardsStats.get("done"));
        assertEquals(1L, shardsStats.get("failed"));

        assertEquals("done/total*100 四舍五入：3/8*100=37.5 → 38", 38L, out.get("pct"));

        List<?> indices = (List<?>) out.get("indices");
        assertEquals(2, indices.size());
        assertEquals("indices 必须按原始响应顺序", "orders", ((Map<?, ?>) indices.get(0)).get("index"));
        assertEquals("users", ((Map<?, ?>) indices.get(1)).get("index"));

        Map<?, ?> orders = (Map<?, ?>) indices.get(0);
        assertEquals(4L, orders.get("shardsTotal"));
        assertEquals(2L, orders.get("shardsDone"));
        assertEquals(0L, orders.get("shardsFailed"));
        Map<?, ?> ordersStages = (Map<?, ?>) orders.get("stageCounts");
        assertEquals(1L, ordersStages.get("INIT"));
        assertEquals(1L, ordersStages.get("STARTED"));
        assertEquals(0L, ordersStages.get("START"));
        assertEquals(0L, ordersStages.get("FINALIZE"));
        assertEquals(2L, ordersStages.get("DONE"));
        assertEquals(0L, ordersStages.get("FAILURE"));

        Map<?, ?> users = (Map<?, ?>) indices.get(1);
        assertEquals(4L, users.get("shardsTotal"));
        assertEquals(1L, users.get("shardsDone"));
        assertEquals(1L, users.get("shardsFailed"));
        Map<?, ?> usersStages = (Map<?, ?>) users.get("stageCounts");
        assertEquals(0L, usersStages.get("INIT"));
        assertEquals(0L, usersStages.get("STARTED"));
        assertEquals(1L, usersStages.get("START"));
        assertEquals(1L, usersStages.get("FINALIZE"));
        assertEquals(1L, usersStages.get("DONE"));
        assertEquals(1L, usersStages.get("FAILURE"));
    }

    @Test
    public void pct_roundsDown_andZeroTotalYieldsZero() {
        Map<String, Object> out = EsIndexAdmin.normalizeSnapshotStatus(
                map("snapshots", Collections.singletonList(map("shards_stats", map("total", 3, "done", 1, "failed", 1)))),
                "r", "s");
        assertEquals("1/3*100=33.33 → 33", 33L, out.get("pct"));

        Map<String, Object> outNoTotal = EsIndexAdmin.normalizeSnapshotStatus(
                new LinkedHashMap<String, Object>(), "r", "s");
        assertEquals("total=0 时 pct 记 0", 0L, outNoTotal.get("pct"));
        assertEquals(0L, ((Map<?, ?>) outNoTotal.get("shardsStats")).get("total"));
    }

    @Test
    public void normalize_nullAndEmptyRaw_neverThrows() {
        Map<String, Object> fromNull = EsIndexAdmin.normalizeSnapshotStatus(null, "r", "s");
        assertEquals("r", fromNull.get("repository"));
        assertEquals("s", fromNull.get("snapshot"));
        assertEquals("", fromNull.get("state"));
        assertEquals(0L, fromNull.get("startTimeMillis"));
        assertEquals(0L, ((Map<?, ?>) fromNull.get("shardsStats")).get("total"));
        assertEquals(0L, ((Map<?, ?>) fromNull.get("shardsStats")).get("done"));
        assertEquals(0L, ((Map<?, ?>) fromNull.get("shardsStats")).get("failed"));
        assertEquals(0L, fromNull.get("pct"));
        assertTrue(((List<?>) fromNull.get("indices")).isEmpty());

        for (Map<String, Object> raw : Arrays.asList(
                map("snapshots", Collections.emptyList()),
                map("snapshots", Collections.singletonList("not-a-map")),
                map("snapshots", Collections.singletonList(map("indices", "not-a-map"))))) {
            Map<String, Object> out = EsIndexAdmin.normalizeSnapshotStatus(raw, "r", "s");
            assertEquals("缺字段一律 0/空兜底，不抛异常", 0L, out.get("pct"));
            assertTrue(((List<?>) out.get("indices")).isEmpty());
        }
    }

    @Test
    public void normalize_missingStageAndGarbageShardEntries_tolerated_andFallbackAggregates() {
        Map<String, Object> shards = new LinkedHashMap<String, Object>();
        shards.put("0", map("stage", "DONE"));
        shards.put("1", new LinkedHashMap<String, Object>());   // 缺 stage：只计入总数
        shards.put("2", "garbage");                             // 非 Map：整体跳过
        Map<String, Object> raw = map("snapshots", Collections.singletonList(
                map("indices", Collections.singletonMap("orders", map("shards", shards)))));

        Map<String, Object> out = EsIndexAdmin.normalizeSnapshotStatus(raw, "r", "s");
        Map<?, ?> orders = (Map<?, ?>) ((List<?>) out.get("indices")).get(0);
        assertEquals(2L, orders.get("shardsTotal"));
        assertEquals(1L, orders.get("shardsDone"));
        assertEquals(0L, orders.get("shardsFailed"));
        // 无快照级 shards_stats → 回退为逐索引聚合，shardsStats 与 indices 自洽
        assertEquals(2L, ((Map<?, ?>) out.get("shardsStats")).get("total"));
        assertEquals(1L, ((Map<?, ?>) out.get("shardsStats")).get("done"));
    }

    @Test
    public void normalize_listShardsAndUnknownStage_sixKeysAlwaysPresent() {
        Map<String, Object> raw = map("snapshots", Collections.singletonList(
                map("indices", Collections.singletonMap("orders",
                        map("shards", Arrays.asList(shard("DONE"), shard("WEIRD")))))));

        Map<String, Object> out = EsIndexAdmin.normalizeSnapshotStatus(raw, "r", "s");
        Map<?, ?> orders = (Map<?, ?>) ((List<?>) out.get("indices")).get(0);
        assertEquals("List 形状的 shards 也兼容", 2L, orders.get("shardsTotal"));
        Map<?, ?> stages = (Map<?, ?>) orders.get("stageCounts");
        assertEquals("未知 stage 按原样追加计数", 1L, stages.get("WEIRD"));
        for (String k : Arrays.asList("INIT", "STARTED", "START", "FINALIZE", "DONE", "FAILURE")) {
            assertTrue("stageCounts 必须恒含 " + k + "（0 兜底）", stages.containsKey(k));
        }
    }

    /* ---------------- ?summary=true 分派 wiring（源文本 + 反射，参照 ClusterForceMergeWiringTest） ---------------- */

    private String readControllerMethodSource(String methodName) throws Exception {
        java.io.File f = new java.io.File(
                "src/main/java/io/github/dengmeiluan/esquerystudio/console/web/InternalEsIndexRebuildController.java");
        assertTrue("InternalEsIndexRebuildController.java 必须能从模块目录解析", f.exists());
        String src = new String(java.nio.file.Files.readAllBytes(f.toPath()), "UTF-8");
        int at = src.indexOf("public Map<String, Object> " + methodName + "(");
        assertTrue(methodName + " 必须存在", at > 0);
        int end = src.indexOf("\n    }", at);
        assertTrue(methodName + " 必须有闭合大括号", end > at);
        return src.substring(at, end);
    }

    @Test
    public void snapshotStatusEndpoint_keepsRawDefault_andDispatchesSummary() throws Exception {
        Method m = InternalEsIndexRebuildController.class
                .getDeclaredMethod("clusterSnapshotStatus", String.class, String.class, boolean.class);
        GetMapping gm = m.getAnnotation(GetMapping.class);
        assertNotNull("必须是 GET 端点", gm);
        assertArrayEquals(new String[]{"cluster/snapshot/status"}, gm.value());
        assertEquals("summary 缺省 false：不传参数时行为零变化",
                "false", ((RequestParam) m.getParameterAnnotations()[2][0]).defaultValue());

        String body = readControllerMethodSource("clusterSnapshotStatus");
        assertTrue("summary=true 必须分派到归一化摘要",
                body.contains("if (summary)") && body.contains("esIndexAdmin.snapshotStatusSummary(repo, name)"));
        assertTrue("缺省路径必须仍是原始透传（零破坏兼容）",
                body.contains("esIndexAdmin.snapshotStatus(repo, name)"));
    }

    @Test
    public void esIndexAdmin_exposesSummaryEntryAndPureStaticNormalizer() throws Exception {
        assertNotNull(EsIndexAdmin.class.getDeclaredMethod("snapshotStatusSummary", String.class, String.class));
        Method normalizer = EsIndexAdmin.class.getDeclaredMethod("normalizeSnapshotStatus",
                Map.class, String.class, String.class);
        assertNotNull(normalizer);
        assertTrue("归一化必须是纯静态方法（无 client 依赖、可直接单测）",
                java.lang.reflect.Modifier.isStatic(normalizer.getModifiers()));
    }
}
