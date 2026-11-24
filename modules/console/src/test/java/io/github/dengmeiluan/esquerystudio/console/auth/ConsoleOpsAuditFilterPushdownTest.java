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

import org.junit.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

/**
 * 20260922 快筛批：结构化筛选全量下推的查询体契约 + 环形日期路由 + 当日索引契约形态 +
 * 两个装饰层对新查询入口的透传（防止 default 桥接旁路 Dedup/HostMerge 语义）。
 */
public class ConsoleOpsAuditFilterPushdownTest {

    private static ConsoleOpsAuditQuery fullQuery() {
        return ConsoleOpsAuditQuery.builder()
                .username("test-user-1").action("HIGH_RISK")
                .fromMs(100L).toMs(200L)
                .connId("7bdac680").connName("腾讯云QA")
                .role("ADMIN").method("POST").httpStatus(403)
                .source("console").ip("203.0.113.9").minCostMs(500L)
                .uriPrefix("/internal/es").kw("页面被拒")
                .size(33).from(7)
                .build();
    }

    @Test
    public void buildSearchBody_全维筛选落bool_filter() throws Exception {
        String body = EsConsoleOpsAuditStore.buildSearchBody(fullQuery());
        assertTrue(body.contains("\"bool\":{\"filter\":["));
        assertTrue(body.contains("{\"term\":{\"username\":\"test-user-1\"}}"));
        assertTrue(body.contains("{\"term\":{\"action\":\"HIGH_RISK\"}}"));
        assertTrue(body.contains("{\"term\":{\"connId\":\"7bdac680\"}}"));
        assertTrue(body.contains("{\"term\":{\"connName\":\"腾讯云QA\"}}"));
        assertTrue(body.contains("{\"term\":{\"role\":\"ADMIN\"}}"));
        assertTrue(body.contains("{\"term\":{\"method\":\"POST\"}}"));
        assertTrue(body.contains("{\"term\":{\"httpStatus\":403}}"));
        assertTrue(body.contains("{\"term\":{\"source\":\"console\"}}"));
        assertTrue(body.contains("{\"term\":{\"ip\":\"203.0.113.9\"}}"));
        assertTrue(body.contains("{\"range\":{\"timestamp\":{\"gte\":100,\"lte\":200}}}"));
        assertTrue(body.contains("{\"range\":{\"costMs\":{\"gte\":500}}}"));
        assertTrue(body.contains("{\"prefix\":{\"uri\":\"/internal/es\"}}"));
        assertTrue(body.contains("{\"wildcard\":{\"detail\":{\"value\":\"*页面被拒*\"}}}"));
        assertTrue(body.contains("\"size\":33"));
        assertTrue(body.contains("\"from\":7"));
        assertTrue(body.contains("\"sort\":[{\"timestamp\":{\"order\":\"desc\"}}]"));
    }

    /** 变异锚：纯过滤场景必须 filter 上下文——产物里出现 must（评分上下文）即红。 */
    @Test
    public void buildSearchBody_评分上下文绝迹_全程filter() throws Exception {
        assertFalse(EsConsoleOpsAuditStore.buildSearchBody(fullQuery()).contains("\"must\""));
    }

    @Test
    public void buildSearchBody_空查询_match_all免bool() throws Exception {
        String body = EsConsoleOpsAuditStore.buildSearchBody(ConsoleOpsAuditQuery.legacy(null, null, 100, 0, null));
        assertTrue(body.contains("\"query\":{\"match_all\":{}}}"));
        assertFalse(body.contains("bool"));
    }

    @Test
    public void buildSearchBody_空串维度视同不过滤() throws Exception {
        String body = EsConsoleOpsAuditStore.buildSearchBody(ConsoleOpsAuditQuery.builder().username("  ").build());
        assertFalse(body.contains("username"));
        assertTrue(body.contains("\"query\":{\"match_all\":{}}}"));
    }

    @Test
    public void buildSearchBody_分页钳制_下限一上限五百_from非负() throws Exception {
        assertTrue(EsConsoleOpsAuditStore.buildSearchBody(ConsoleOpsAuditQuery.builder().size(9999).build())
                .contains("\"size\":500"));
        assertTrue(EsConsoleOpsAuditStore.buildSearchBody(ConsoleOpsAuditQuery.builder().size(0).build())
                .contains("\"size\":1"));
        assertTrue(EsConsoleOpsAuditStore.buildSearchBody(ConsoleOpsAuditQuery.builder().from(-3).build())
                .contains("\"from\":0"));
    }

    @Test
    public void datedIndexName_本地时区日界() {
        ZoneId shanghai = ZoneId.of("Asia/Shanghai");
        long beforeMidnight = LocalDate.of(2026, 9, 22).atTime(23, 59).atZone(shanghai).toInstant().toEpochMilli();
        long afterMidnight = LocalDate.of(2026, 9, 23).atStartOfDay(shanghai).toInstant().toEpochMilli();
        assertEquals("esquerystudio_ops_audit-2026.09.22",
                EsConsoleOpsAuditStore.datedIndexName("esquerystudio_ops_audit", beforeMidnight, shanghai));
        assertEquals("esquerystudio_ops_audit-2026.09.23",
                EsConsoleOpsAuditStore.datedIndexName("esquerystudio_ops_audit", afterMidnight, shanghai));
    }

    /** 环形索引契约：显式 keyword/long mapping + replicas:0 + refresh 30s——把现网偶然形态变索引级契约。 */
    @Test
    public void dailyCreateBodyJson_环形索引契约形态() throws Exception {
        String body = EsConsoleOpsAuditStore.dailyCreateBodyJson();
        assertTrue(body.contains("\"number_of_replicas\":0"));
        assertTrue(body.contains("\"refresh_interval\":\"30s\""));
        assertTrue(body.contains("\"timestamp\":{\"type\":\"long\"}"));
        assertTrue(body.contains("\"httpStatus\":{\"type\":\"long\"}"));
        assertTrue(body.contains("\"costMs\":{\"type\":\"long\"}"));
        assertTrue(body.contains("\"username\":{\"type\":\"keyword\"}"));
        assertTrue(body.contains("\"action\":{\"type\":\"keyword\"}"));
        assertTrue(body.contains("\"detail\":{\"type\":\"keyword\"}"));
        assertTrue(body.contains("\"connId\":{\"type\":\"keyword\"}"));
        assertTrue(body.contains("\"uri\":{\"type\":\"keyword\"}"));
    }

    /** Dedup 层必须重写新查询入口透传——被 default 桥接旁路时 got 恒 null 即红。 */
    @Test
    public void dedup_search_结构化查询原样透传底层() {
        ConsoleOpsAuditQuery q = fullQuery();
        AtomicReference<ConsoleOpsAuditQuery> got = new AtomicReference<>();
        ConsoleOpsAuditStore delegate = new ConsoleOpsAuditStore() {
            @Override public void record(ConsoleOpsAuditEvent event) { }
            @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
                return Collections.emptyList();
            }
            @Override public List<ConsoleOpsAuditEvent> search(ConsoleOpsAuditQuery query) {
                got.set(query);
                return Collections.emptyList();
            }
        };
        new DedupConsoleOpsAuditStore(delegate).search(q);
        assertSame("Dedup 层结构化查询必须原样透传 delegate", q, got.get());
    }

    /** HostMerge 层：控制台侧吃全维查询对象；宿主贡献者维持基线签名（扩维到宿主侧静默忽略）。 */
    @Test
    public void hostMerge_search_控制台全维_宿主侧基线维度() {
        ConsoleOpsAuditQuery q = fullQuery();
        ConsoleOpsAuditStore delegate = new ConsoleOpsAuditStore() {
            @Override public void record(ConsoleOpsAuditEvent event) { }
            @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
                return Collections.emptyList();
            }
            @Override public List<ConsoleOpsAuditEvent> search(ConsoleOpsAuditQuery query) {
                return Collections.singletonList(ConsoleOpsAuditEvent.builder()
                        .username("console-u").action("WRITE").timestamp(200L).build());
            }
        };
        final AtomicReference<Object[]> got = new AtomicReference<>();
        ConsoleAuditContributor contributor = new ConsoleAuditContributor() {
            @Override public List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs) {
                got.set(new Object[]{username, action, size, from, sinceMs});
                return Collections.singletonList(ConsoleOpsAuditEvent.builder()
                        .username("host-u").action("HOST_OP").timestamp(100L).build());
            }
        };
        List<ConsoleOpsAuditEvent> out = new HostAuditMergeStore(delegate, contributor).search(q);
        assertEquals("合并后按 timestamp 倒序", 2, out.size());
        assertEquals(Long.valueOf(200L), out.get(0).getTimestamp());
        assertEquals("host", out.get(1).getSource());
        Object[] args = got.get();
        assertEquals("test-user-1", args[0]);
        assertEquals("HIGH_RISK", args[1]);
        assertEquals(33, args[2]);
        assertEquals(7, args[3]);
        assertEquals(100L, args[4]);
    }

    /** SPI default 桥接：未升级实现（仅实现基线签名）收到结构化查询时退化为基线三过滤。 */
    @Test
    public void spi_default桥接_未升级实现退化基线三过滤() {
        final AtomicReference<Object[]> got = new AtomicReference<>();
        ConsoleOpsAuditStore legacyOnly = new ConsoleOpsAuditStore() {
            @Override public void record(ConsoleOpsAuditEvent event) { }
            @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
                got.set(new Object[]{u, a, size, from, sinceMs});
                return Collections.emptyList();
            }
        };
        legacyOnly.search(fullQuery());
        Object[] args = got.get();
        assertEquals("test-user-1", args[0]);
        assertEquals("HIGH_RISK", args[1]);
        assertEquals(33, args[2]);
        assertEquals(7, args[3]);
        assertEquals(100L, args[4]);
        assertTrue("null 查询对象由桥接兜底为全量首查不抛", legacyOnly.search(null).isEmpty());
    }
}
