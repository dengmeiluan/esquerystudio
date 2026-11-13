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

package io.github.dengmeiluan.esquerystudio.console.auth;

import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.time.LocalDate;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 20260922 双闸环形清理：选删纯函数的边界语义（超龄闸恰在第 N 天保留/总量闸从最旧删起/
 * 非日期形态绝不删）+ {@code EsFakeClients} 脚本桩端到端（删除真实发出 / dry-run 零删除）。
 */
public class AuditIndexRetentionSweeperSelectionTest {

    private static final String PREFIX = "esquerystudio_ops_audit";

    private static Map.Entry<String, Long> idx(String name, long bytes) {
        return new AbstractMap.SimpleEntry<>(name, bytes);
    }

    private static String day(LocalDate d) {
        return PREFIX + "-" + AuditIndexRetentionSweeper.DAY_FMT.format(d);
    }

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 22);

    /** 超龄闸边界：严格早于 today-maxDays 才删，恰好第 N 天仍在保留面内。 */
    @Test
    public void 超龄闸_恰好第90天保留_第91天删() {
        List<String> out = AuditIndexRetentionSweeper.selectForDeletion(Arrays.asList(
                idx(day(TODAY), 100L),
                idx(day(TODAY.minusDays(90)), 100L),
                idx(day(TODAY.minusDays(91)), 100L)), TODAY, 90, 1_000_000L);
        assertEquals(Collections.singletonList(day(TODAY.minusDays(91))), out);
    }

    /** 总量闸：合计超上限从最旧日期删起，删到 ≤ 上限即停（不多删一个）。 */
    @Test
    public void 总量闸_从最旧删起_删到不超即停() {
        List<Map.Entry<String, Long>> indices = Arrays.asList(
                idx(day(TODAY.minusDays(2)), 100L),
                idx(day(TODAY.minusDays(1)), 100L),
                idx(day(TODAY), 100L));
        assertEquals(Collections.singletonList(day(TODAY.minusDays(2))),
                AuditIndexRetentionSweeper.selectForDeletion(indices, TODAY, 365_00L, 250L));
        assertEquals(Arrays.asList(day(TODAY.minusDays(2)), day(TODAY.minusDays(1))),
                AuditIndexRetentionSweeper.selectForDeletion(indices, TODAY, 365_00L, 150L));
        assertTrue("合计未超上限=零删除",
                AuditIndexRetentionSweeper.selectForDeletion(indices, TODAY, 365_00L, 300L).isEmpty());
    }

    /** 安全红线：日期段不是 yyyy.MM.dd 形态的索引绝不出现在清理面。 */
    @Test
    public void 非日期形态绝不删() {
        List<String> out = AuditIndexRetentionSweeper.selectForDeletion(Arrays.asList(
                idx(PREFIX, 100L),
                idx(PREFIX + "-legacy", 100L),
                idx(PREFIX + "-2026.9.1", 100L),
                idx(PREFIX + "-not-a-date", 100L),
                idx(day(TODAY.minusDays(365)), 100L)), TODAY, 90, 1_000_000L);
        assertEquals(Collections.singletonList(day(TODAY.minusDays(365))), out);
    }

    /** 端到端：_cat 列族 → 总量闸选删 → DELETE 真实发出（口径与线上同路径）。 */
    @Test
    public void sweepOnce_总量闸删除真实发出() throws Exception {
        List<String> deletes = new CopyOnWriteArrayList<>();
        List<String> gets = new CopyOnWriteArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && req.getEndpoint().startsWith("/_cat/indices/")) {
                gets.add(req.getEndpoint());
                return "[{\"index\":\"" + PREFIX + "-2026.01.01\",\"store.size\":\"100\"},"
                        + "{\"index\":\"" + PREFIX + "-2026.01.02\",\"store.size\":\"100\"}]";
            }
            if ("DELETE".equals(req.getMethod())) {
                deletes.add(req.getEndpoint());
                return "{\"acknowledged\":true}";
            }
            throw EsFakeClients.responseException(400, "{\"error\":{\"type\":\"illegal_argument_exception\"}}");
        });
        /* maxDays 巨大=超龄闸惰性；总量 150 < 合计 200 → 恰删最旧一个；多前缀化后 _cat 模式为逗号并族 */
        AuditIndexRetentionSweeper sweeper = new AuditIndexRetentionSweeper(() -> client,
                java.util.Collections.singletonList(PREFIX), 365_00L, 150L, false);
        sweeper.sweepOnce();
        assertEquals(1, gets.size());
        assertTrue(gets.get(0).startsWith("/_cat/indices/" + PREFIX + "-*"));
        assertEquals(Collections.singletonList("/" + PREFIX + "-2026.01.01"), deletes);
    }

    /** dry-run：待删清单照算（INFO 留痕），DELETE 一个不发——上线初期观察面契约。 */
    @Test
    public void sweepOnce_dryRun零删除() throws Exception {
        List<String> deletes = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                return "[{\"index\":\"" + PREFIX + "-2026.01.01\",\"store.size\":\"100\"},"
                        + "{\"index\":\"" + PREFIX + "-2026.01.02\",\"store.size\":\"100\"}]";
            }
            if ("DELETE".equals(req.getMethod())) {
                deletes.add(req.getEndpoint());
                return "{\"acknowledged\":true}";
            }
            throw EsFakeClients.responseException(400, "{\"error\":{\"type\":\"illegal_argument_exception\"}}");
        });
        AuditIndexRetentionSweeper sweeper = new AuditIndexRetentionSweeper(() -> client,
                java.util.Collections.singletonList(PREFIX), 365_00L, 150L, true);
        sweeper.sweepOnce();
        assertTrue("dry-run 不得发出任何 DELETE", deletes.isEmpty());
    }

    /** 跨族管辖：审计+监控两族同轮清理，同日各为一个删除单元、按日期同轮淘汰。 */
    @Test
    public void selectForDeletion_跨族同日双单元按日期同轮淘汰() {
        String monitor = "esquerystudio_monitor";
        List<Map.Entry<String, Long>> indices = Arrays.asList(
                idx(day(TODAY.minusDays(300)), 100L),
                idx(monitor + "-" + AuditIndexRetentionSweeper.DAY_FMT.format(TODAY.minusDays(300)), 100L),
                idx(day(TODAY), 100L));
        /* 总量 150 < 合计 300 → 最旧一日的审计+监控两个索引同轮删除 */
        List<String> out = AuditIndexRetentionSweeper.selectForDeletion(indices, TODAY, 365_00L, 150L);
        assertEquals(2, out.size());
        assertTrue(out.contains(day(TODAY.minusDays(300))));
        assertTrue(out.contains(monitor + "-" + AuditIndexRetentionSweeper.DAY_FMT.format(TODAY.minusDays(300))));
    }

    /** 环形写路径端到端：rollover 开启时先惰性 PUT 当日索引（显式 mapping）再落文档；日期切换后新 PUT。 */
    @Test
    public void record_rollover_先建当日索引再落文档() throws Exception {
        List<String> puts = new CopyOnWriteArrayList<>();
        List<String> posts = new CopyOnWriteArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("PUT".equals(req.getMethod())) {
                puts.add(req.getEndpoint());
                return "{\"acknowledged\":true}";
            }
            if ("POST".equals(req.getMethod())) {
                posts.add(req.getEndpoint());
                return "{\"result\":\"created\"}";
            }
            throw EsFakeClients.responseException(400, "{\"error\":{\"type\":\"illegal_argument_exception\"}}");
        });
        EsConsoleOpsAuditStore store = new EsConsoleOpsAuditStore(() -> client, PREFIX, true);
        store.record(ConsoleOpsAuditEvent.builder().username("u").role("ADMIN").method("POST")
                .uri("/x").action("WRITE").httpStatus(200).build());
        long deadline = System.currentTimeMillis() + 5000;
        while (posts.isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
        assertEquals(1, puts.size());
        assertTrue("PUT 必须是当日日期索引", puts.get(0).startsWith("/" + PREFIX + "-2"));
        assertTrue("文档落当日日期索引", posts.get(0).startsWith("/" + PREFIX + "-2"));
        /* 同日第二笔：索引已 ensure，仅落文档不再 PUT */
        store.record(ConsoleOpsAuditEvent.builder().username("u2").role("ADMIN").method("POST")
                .uri("/x").action("WRITE").httpStatus(200).build());
        deadline = System.currentTimeMillis() + 5000;
        while (posts.size() < 2 && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
        assertEquals("同日只建一次索引", 1, puts.size());
        assertEquals(2, posts.size());
    }

    /** 环形写路径降级：建索引失败（非已存在）只节流告警，文档照写——审计永不反噬业务。 */
    @Test
    public void record_建索引失败文档照写() throws Exception {
        List<String> posts = new CopyOnWriteArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("PUT".equals(req.getMethod())) {
                throw EsFakeClients.responseException(500, "{\"error\":{\"type\":\"cluster_block_exception\"}}");
            }
            if ("POST".equals(req.getMethod())) {
                posts.add(req.getEndpoint());
                return "{\"result\":\"created\"}";
            }
            throw EsFakeClients.responseException(400, "{\"error\":{\"type\":\"illegal_argument_exception\"}}");
        });
        EsConsoleOpsAuditStore store = new EsConsoleOpsAuditStore(() -> client, PREFIX, true);
        store.record(ConsoleOpsAuditEvent.builder().username("u").role("ADMIN").method("POST")
                .uri("/x").action("WRITE").httpStatus(200).build());
        long deadline = System.currentTimeMillis() + 5000;
        while (posts.isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
        assertEquals("建索引失败不拦落档", 1, posts.size());
    }

    /** 查询目标：rollover 开启打日期通配（旧实体索引不带连字符天然不在面内）；404=空档回空列表。 */
    @Test
    public void search_rollover_目标日期通配_404回空() throws Exception {
        List<String> searchPaths = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("POST".equals(req.getMethod()) && req.getEndpoint().endsWith("/_search")) {
                searchPaths.add(req.getEndpoint());
                throw EsFakeClients.responseException(404,
                        "{\"error\":{\"type\":\"index_not_found_exception\",\"reason\":\"no such index\"}}");
            }
            throw EsFakeClients.responseException(400, "{\"error\":{\"type\":\"illegal_argument_exception\"}}");
        });
        EsConsoleOpsAuditStore store = new EsConsoleOpsAuditStore(() -> client, PREFIX, true);
        List<ConsoleOpsAuditEvent> out = store.search(ConsoleOpsAuditQuery.legacy(null, null, 10, 0, null));
        assertTrue("404 index_not_found=空档回空列表", out.isEmpty());
        assertEquals(1, searchPaths.size());
        assertEquals("/" + PREFIX + "-*/_search", searchPaths.get(0));
    }
}
