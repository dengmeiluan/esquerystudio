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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 指标时序批：指标读侧——查询体契约测点（kind=metrics 恒定 term 过滤/维度 term 下推/
 * 时间 range/timestamp 升序 sort/不含 "must"/分页钳 3000）+ 聚合测点（buildAggBody
 * fixed_interval 逐字/全指标逐字段三值同返〔平铺 {@code <field>Avg/Max/Min} + 标量别名
 * {@code <field>}＝请求 agg 值〕/kind 恒定/不含 must；parseAggResponse 罐头桶转记录、
 * 三值同返满桶三键齐/空桶三键一并省略）+ EsFakeClients 脚本桩端到端（原始查询升序透传 +
 * 聚合桶升序 + 404 空档回空）+ R7 告警读侧（buildAlertsBody kind=alert 过滤+倒序+钳 100、
 * searchAlerts 端到端 404 回空）。
 */
public class MonitorMetricsStoreTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String PREFIX = "esquerystudio_monitor";

    /** 三值同返：统计子串出现次数（逐字段全覆盖锚）。 */
    private static int count(String hay, String needle) {
        int c = 0;
        int i = 0;
        while ((i = hay.indexOf(needle, i)) >= 0) {
            c++;
            i += needle.length();
        }
        return c;
    }

    @Test
    public void buildSearchBody_kind恒定过滤_维度下推() {
        String body = MonitorMetricsStore.buildSearchBody("7bdac680", "cluster", 100, 0, 100L, 200L);
        assertTrue(body.contains("{\"bool\":{\"filter\":["));
        assertTrue("kind=metrics 恒定过滤（同族索引混居探活快照，绝不能串味）",
                body.contains("{\"term\":{\"kind\":\"metrics\"}}"));
        assertTrue(body.contains("{\"term\":{\"connId\":\"7bdac680\"}}"));
        assertTrue(body.contains("{\"term\":{\"scope\":\"cluster\"}}"));
        assertTrue(body.contains("{\"range\":{\"timestamp\":{\"gte\":100,\"lte\":200}}}"));
        assertTrue("图表要升序（与审计/历史的 desc 刻意不同）",
                body.contains("\"sort\":[{\"timestamp\":{\"order\":\"asc\"}}]"));
        assertFalse("纯过滤场景不得出现评分上下文", body.contains("\"must\""));
    }

    @Test
    public void buildSearchBody_空参_kind恒定过滤仍在() {
        String body = MonitorMetricsStore.buildSearchBody(null, null, 100, 0, null, null);
        assertTrue(body.contains("{\"term\":{\"kind\":\"metrics\"}}"));
        assertTrue(body.contains("\"sort\":[{\"timestamp\":{\"order\":\"asc\"}}]"));
        assertFalse("恒定过滤下永远走 bool.filter，无 match_all 形态", body.contains("match_all"));
    }

    @Test
    public void buildSearchBody_分页钳制() {
        assertTrue("size 上限 3000",
                MonitorMetricsStore.buildSearchBody(null, null, 9999, 0, null, null).contains("\"size\":3000"));
        assertTrue(MonitorMetricsStore.buildSearchBody(null, null, 0, -3, null, null)
                .contains("\"size\":1"));
        assertTrue(MonitorMetricsStore.buildSearchBody(null, null, 0, -3, null, null)
                .contains("\"from\":0"));
    }

    /** 端到端：目标={前缀}-* 日期通配；请求体带升序 sort + kind 恒定 term；_source 保序透传。 */
    @Test
    public void search_日期通配_升序透传() throws Exception {
        List<String> paths = new ArrayList<>();
        List<String> sentBodies = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            paths.add(req.getMethod() + " " + req.getEndpoint());
            sentBodies.add(req.getEntity() == null ? ""
                    : org.apache.http.util.EntityUtils.toString(req.getEntity()));
            return "{\"hits\":{\"hits\":["
                    + "{\"_source\":{\"timestamp\":1,\"kind\":\"metrics\",\"scope\":\"cluster\","
                    + "\"connId\":\"a\",\"connName\":\"腾讯云QA\",\"env\":\"QA\",\"status\":\"green\",\"qps\":1.0}},"
                    + "{\"_source\":{\"timestamp\":2,\"kind\":\"metrics\",\"scope\":\"node\","
                    + "\"connId\":\"a\",\"nodeName\":\"node-1\",\"heapUsedPct\":36.0}}]}}";
        });
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        List<Map<String, Object>> out = store.search("a", "cluster", 100, 0, null, null);
        assertEquals(2, out.size());
        assertEquals("升序透传：cluster 点在前", "cluster", out.get(0).get("scope"));
        assertEquals("node", out.get(1).get("scope"));
        assertEquals(1.0, ((Number) out.get(0).get("qps")).doubleValue(), 0.0001);
        assertEquals(1, paths.size());
        assertTrue("目标必须是日期通配", paths.get(0).startsWith("POST /" + PREFIX + "-*/_search"));
        assertTrue("发出的查询体带升序 sort", sentBodies.get(0).contains("\"order\":\"asc\""));
        assertTrue("发出的查询体带 kind 恒定过滤", sentBodies.get(0).contains("{\"term\":{\"kind\":\"metrics\"}}"));
    }

    /** 空档契约：无任何日期索引时 404 → 空列表不抛。 */
    @Test
    public void search_404空档回空列表() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            throw EsFakeClients.responseException(404,
                    "{\"error\":{\"type\":\"index_not_found_exception\",\"reason\":\"no such index\"}}");
        });
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        assertTrue(store.search(null, null, 100, 0, null, null).isEmpty());
    }

    @Test
    public void buildAggBody_聚合契约_分组全指标与均值() {
        String body = MonitorMetricsStore.buildAggBody("7bdac680", "cluster", 100L, 200L, "60s");
        assertTrue("size:0 只要聚合不取原始文档", body.contains("\"size\":0"));
        assertTrue("kind=metrics 恒定过滤（同族索引混居探活快照，绝不能串味）",
                body.contains("{\"term\":{\"kind\":\"metrics\"}}"));
        assertTrue(body.contains("{\"term\":{\"scope\":\"cluster\"}}"));
        assertTrue(body.contains("{\"term\":{\"connId\":\"7bdac680\"}}"));
        assertTrue(body.contains("{\"range\":{\"timestamp\":{\"gte\":100,\"lte\":200}}}"));
        assertTrue("fixed_interval 逐字", body.contains("\"fixed_interval\":\"60s\""));
        assertTrue("min_doc_count:0 空桶补齐时间轴（前端缺值剔点，不跳格）",
                body.contains("\"min_doc_count\":0"));
        assertTrue("分组重构：cluster 态按 connName terms 分组（多集群叠加不再挤「未知集群」）",
                body.contains("\"by_group\":{\"terms\":{\"field\":\"connName\",\"size\":30}"));
        /* 三值同返随迁：旧形态断言 {@code "qps":{"avg":{"field":"qps"}}} 已升级为
           「三键平铺 + 标量别名」；qps 标量别名仍在（＝请求 agg 对应的那个值），老前端读 qps 照常工作 */
        assertTrue("三值同返：每字段平铺 <field>Avg（桶记录与原始 doc 键同名同型，前端零改动）",
                body.contains("\"qpsAvg\":{\"avg\":{\"field\":\"qps\"}}"));
        assertTrue(body.contains("\"qpsMax\":{\"max\":{\"field\":\"qps\"}}"));
        assertTrue(body.contains("\"qpsMin\":{\"min\":{\"field\":\"qps\"}}"));
        assertTrue("标量别名 <field> 保留（向后兼容零破坏，老前端读 qps 不炸）",
                body.contains("\"qps\":{\"avg\":{\"field\":\"qps\"}}"));
        assertTrue(body.contains("\"heapUsedPctAvg\":{\"avg\":{\"field\":\"heapUsedPct\"}}"));
        assertTrue("全指标聚合根治：后加卡片字段在案（此前聚合模式下恒空）",
                body.contains("\"writeRejectedAvg\":{\"avg\":{\"field\":\"writeRejected\"}}"));
        assertTrue(body.contains("\"gcYoungPerMinAvg\":{\"avg\":{\"field\":\"gcYoungPerMin\"}}"));
        /*  校准轮回归锚：三卡字段在 AGG（漏扩则节点下钻聚合模式恒空）
           —— 637 三值同返：曾恒空的这三卡也必须逐字段三键齐 */
        assertTrue(body.contains("\"ioUtilPctAvg\":{\"avg\":{\"field\":\"ioUtilPct\"}}"));
        assertTrue(body.contains("\"ioUtilPctMax\":{\"max\":{\"field\":\"ioUtilPct\"}}"));
        assertTrue(body.contains("\"ioUtilPctMin\":{\"min\":{\"field\":\"ioUtilPct\"}}"));
        assertTrue(body.contains("\"gcYoungTimeMsAvg\":{\"avg\":{\"field\":\"gcYoungTimeMs\"}}"));
        assertTrue(body.contains("\"gcYoungTimeMsMax\":{\"max\":{\"field\":\"gcYoungTimeMs\"}}"));
        assertTrue(body.contains("\"gcYoungTimeMsMin\":{\"min\":{\"field\":\"gcYoungTimeMs\"}}"));
        assertTrue(body.contains("\"gcOldTimeMsAvg\":{\"avg\":{\"field\":\"gcOldTimeMs\"}}"));
        assertTrue(body.contains("\"gcOldTimeMsMax\":{\"max\":{\"field\":\"gcOldTimeMs\"}}"));
        assertTrue(body.contains("\"gcOldTimeMsMin\":{\"min\":{\"field\":\"gcOldTimeMs\"}}"));
        assertTrue(body.contains("\"tpSearchActiveAvg\":{\"avg\":{\"field\":\"tpSearchActive\"}}"));
        /* Wave B 新字段聚合随迁（漏扩防回流显式锚） */
        assertTrue(body.contains("\"docsTotalAvg\":{\"avg\":{\"field\":\"docsTotal\"}}"));
        assertTrue(body.contains("\"tpForceMergeRejectedAvg\":{\"avg\":{\"field\":\"tpForceMergeRejected\"}}"));
        assertTrue(body.contains("\"osMemUsedPctAvg\":{\"avg\":{\"field\":\"osMemUsedPct\"}}"));
        assertTrue(body.contains("\"fsAvailMbAvg\":{\"avg\":{\"field\":\"fsAvailMb\"}}"));
        assertTrue(body.contains("\"esCpuPctAvg\":{\"avg\":{\"field\":\"esCpuPct\"}}"));
        assertTrue(body.contains("\"primaryShardsAvg\":{\"avg\":{\"field\":\"primaryShards\"}}"));
        /* 「漏扩 AGG 致三卡恒空」同类坑防回流锚：逐字段全覆盖（Min/Max 子聚合数＝AGG 键数） */
        assertEquals("三值同返逐字段全覆盖：Min 子聚合数＝AGG 键数（漏扩即红）",
                MonitorMetricsStore.AGG_METRIC_FIELDS.length,
                count(body, "\":{\"min\":{\"field\":\""));
        assertEquals("三值同返逐字段全覆盖：Max 子聚合数＝AGG 键数（漏扩即红）",
                MonitorMetricsStore.AGG_METRIC_FIELDS.length,
                count(body, "\":{\"max\":{\"field\":\""));
        assertFalse("纯过滤场景不得出现评分上下文", body.contains("\"must\""));
    }

    @Test
    public void buildAggBody_max聚合与节点分组() {
        String avg = MonitorMetricsStore.buildAggBody(null, "cluster", null, null, "60s", "avg");
        /* 三值同返随迁：旧 {avg,max} 单值形态断言改写为「三键 + 别名」；
           别名 <field> ＝请求 agg 对应的那个值（avg 档取 avg，max 档取 max） */
        assertTrue("agg=avg 档：标量别名 qps 取 avg（老前端读 qps 仍是均值）",
                avg.contains("\"qps\":{\"avg\":{\"field\":\"qps\"}}"));
        assertTrue(avg.contains("\"qpsAvg\":{\"avg\":{\"field\":\"qps\"}}"));
        assertTrue("三值同返：avg 档下 max/min 仍随桶同返（前端零请求切换）",
                avg.contains("\"qpsMax\":{\"max\":{\"field\":\"qps\"}}")
                        && avg.contains("\"qpsMin\":{\"min\":{\"field\":\"qps\"}}"));
        String max = MonitorMetricsStore.buildAggBody(null, "cluster", null, null, "60s", "max");
        assertTrue("G4 聚合切换：max 档标量别名 qps 取 max（向后兼容零破坏）",
                max.contains("\"qps\":{\"max\":{\"field\":\"qps\"}}"));
        assertTrue(max.contains("\"qpsMax\":{\"max\":{\"field\":\"qps\"}}"));
        assertTrue(max.contains("\"heapUsedPctMax\":{\"max\":{\"field\":\"heapUsedPct\"}}"));
        String node = MonitorMetricsStore.buildAggBody(null, "node", null, null, "60s", "avg");
        assertTrue("节点下钻按 nodeName 分组（scope 过滤已在 query 收窄）",
                node.contains("\"by_group\":{\"terms\":{\"field\":\"nodeName\",\"size\":30}"));
        String unknown = MonitorMetricsStore.buildAggBody(null, "cluster", null, null, "60s", "sum");
        assertTrue("非法聚合方式回落 avg（controller 已先行校验，此处纵深防御）：别名随回落取 avg",
                unknown.contains("\"qps\":{\"avg\":{\"field\":\"qps\"}}"));
    }

    @Test
    public void buildSearchBody_buildAggBody_connName过滤_() {
        String search = MonitorMetricsStore.buildSearchBody(null, "腾讯云QA", "cluster", 100, 0, null, null);
        assertTrue("connName 精确过滤（筛选下拉传实名的修复）",
                search.contains("{\"term\":{\"connName\":\"腾讯云QA\"}}"));
        String agg = MonitorMetricsStore.buildAggBody(null, "腾讯云QA", "cluster", null, null, "60s", "avg");
        assertTrue(agg.contains("{\"term\":{\"connName\":\"腾讯云QA\"}}"));
    }
    @Test
    public void buildAggBody_空参_kind恒定过滤仍在() {
        String body = MonitorMetricsStore.buildAggBody(null, null, null, null, "1h");
        assertTrue(body.contains("{\"term\":{\"kind\":\"metrics\"}}"));
        assertFalse("恒定过滤下永远走 bool.filter，无 match_all 形态", body.contains("match_all"));
        assertTrue(body.contains("\"fixed_interval\":\"1h\""));
    }

    /** 罐头分组桶：单组两桶（满值+空桶）——组键回填 connName + 空桶键省略。 */
    @Test
    public void parseAggResponse_罐头桶转记录_avg空值省略() throws Exception {
        String respJson = "{\"aggregations\":{\"by_group\":{\"buckets\":["
                + "{\"key\":\"腾讯云QA\",\"doc_count\":119,\"by_time\":{\"buckets\":["
                + "{\"key\":1000,\"doc_count\":60,"
                + "\"qps\":{\"value\":1.5},\"indexRate\":{\"value\":0.5},"
                + "\"heapUsedPct\":{\"value\":36.0},\"cpuPct\":{\"value\":3.0},"
                + "\"diskUsedPct\":{\"value\":80.5},\"nodes\":{\"value\":3.0}},"
                + "{\"key\":2000,\"doc_count\":0,"
                + "\"qps\":{\"value\":null},\"indexRate\":{\"value\":null},"
                + "\"heapUsedPct\":{\"value\":null},\"cpuPct\":{\"value\":null},"
                + "\"diskUsedPct\":{\"value\":null},\"nodes\":{\"value\":null}}"
                + "]}}]}}}";
        List<Map<String, Object>> out =
                MonitorMetricsStore.parseAggResponse(MAPPER.readValue(respJson, Map.class), "cluster");
        assertEquals("两桶各出一条记录", 2, out.size());
        Map<String, Object> first = out.get(0);
        assertEquals("组键回填：cluster 态组键=connName", "腾讯云QA", first.get("connName"));
        assertEquals("timestamp=桶 key 毫秒", 1000L, first.get("timestamp"));
        assertEquals(1.5, ((Number) first.get("qps")).doubleValue(), 0.0001);
        assertEquals(0.5, ((Number) first.get("indexRate")).doubleValue(), 0.0001);
        assertEquals(36.0, ((Number) first.get("heapUsedPct")).doubleValue(), 0.0001);
        assertEquals(3.0, ((Number) first.get("cpuPct")).doubleValue(), 0.0001);
        assertEquals(80.5, ((Number) first.get("diskUsedPct")).doubleValue(), 0.0001);
        assertEquals(3.0, ((Number) first.get("nodes")).doubleValue(), 0.0001);
        Map<String, Object> emptyBucket = out.get(1);
        assertEquals("空桶仍占位（时间轴不跳格）", 2000L, emptyBucket.get("timestamp"));
        assertFalse("value=null 的键省略（与原始 doc 缺字段同形态，前端剔点已有）",
                emptyBucket.containsKey("qps"));
        assertFalse(emptyBucket.containsKey("indexRate"));
        assertFalse(emptyBucket.containsKey("heapUsedPct"));
        assertFalse(emptyBucket.containsKey("cpuPct"));
        assertFalse(emptyBucket.containsKey("diskUsedPct"));
        assertFalse(emptyBucket.containsKey("nodes"));
    }

    /**
     * 三值同返：罐头桶含 {@code <field>Avg/Max/Min} 三键 + 标量别名 {@code <field>}。
     * 满桶三键齐解析正确；空桶三键（含别名）一并省略（沿用 putAggValue「Number 才落键」语义）。
     */
    @Test
    public void parseAggResponse_三值同返_满桶三键齐_空桶三键省略() throws Exception {
        String respJson = "{\"aggregations\":{\"by_group\":{\"buckets\":["
                + "{\"key\":\"腾讯云QA\",\"by_time\":{\"buckets\":["
                + "{\"key\":1000,\"doc_count\":60,"
                + "\"qpsAvg\":{\"value\":1.5},\"qpsMax\":{\"value\":9.0},\"qpsMin\":{\"value\":0.3},"
                + "\"qps\":{\"value\":1.5},"
                + "\"ioUtilPctAvg\":{\"value\":40.0},\"ioUtilPctMax\":{\"value\":99.0},"
                + "\"ioUtilPctMin\":{\"value\":2.0},\"ioUtilPct\":{\"value\":40.0},"
                + "\"gcYoungTimeMsAvg\":{\"value\":50.0},\"gcYoungTimeMsMax\":{\"value\":120.0},"
                + "\"gcYoungTimeMsMin\":{\"value\":8.0},\"gcYoungTimeMs\":{\"value\":50.0},"
                + "\"gcOldTimeMsAvg\":{\"value\":12.0},\"gcOldTimeMsMax\":{\"value\":30.0},"
                + "\"gcOldTimeMsMin\":{\"value\":1.0},\"gcOldTimeMs\":{\"value\":12.0}},"
                + "{\"key\":2000,\"doc_count\":0,"
                + "\"qpsAvg\":{\"value\":null},\"qpsMax\":{\"value\":null},\"qpsMin\":{\"value\":null},"
                + "\"qps\":{\"value\":null},"
                + "\"ioUtilPctAvg\":{\"value\":null},\"ioUtilPctMax\":{\"value\":null},"
                + "\"ioUtilPctMin\":{\"value\":null},\"ioUtilPct\":{\"value\":null}}"
                + "]}}]}}}";
        List<Map<String, Object>> out =
                MonitorMetricsStore.parseAggResponse(MAPPER.readValue(respJson, Map.class), "cluster");
        assertEquals("两桶各出一条记录", 2, out.size());
        Map<String, Object> full = out.get(0);
        assertEquals("满桶三键齐：avg", 1.5, ((Number) full.get("qpsAvg")).doubleValue(), 0.0001);
        assertEquals("满桶三键齐：max", 9.0, ((Number) full.get("qpsMax")).doubleValue(), 0.0001);
        assertEquals("满桶三键齐：min", 0.3, ((Number) full.get("qpsMin")).doubleValue(), 0.0001);
        assertEquals("标量别名 qps 仍在（向后兼容，＝请求 agg 值）",
                1.5, ((Number) full.get("qps")).doubleValue(), 0.0001);
        /* 曾恒空的三卡：三值同返逐卡可切，均需解析出值 */
        assertEquals(40.0, ((Number) full.get("ioUtilPctAvg")).doubleValue(), 0.0001);
        assertEquals(99.0, ((Number) full.get("ioUtilPctMax")).doubleValue(), 0.0001);
        assertEquals(2.0, ((Number) full.get("ioUtilPctMin")).doubleValue(), 0.0001);
        assertEquals(120.0, ((Number) full.get("gcYoungTimeMsMax")).doubleValue(), 0.0001);
        assertEquals(8.0, ((Number) full.get("gcYoungTimeMsMin")).doubleValue(), 0.0001);
        assertEquals(30.0, ((Number) full.get("gcOldTimeMsMax")).doubleValue(), 0.0001);
        assertEquals(1.0, ((Number) full.get("gcOldTimeMsMin")).doubleValue(), 0.0001);
        Map<String, Object> empty = out.get(1);
        assertEquals("空桶仍占位（时间轴不跳格）", 2000L, empty.get("timestamp"));
        assertFalse("空桶 qpsAvg 省略", empty.containsKey("qpsAvg"));
        assertFalse("空桶 qpsMax 省略", empty.containsKey("qpsMax"));
        assertFalse("空桶 qpsMin 省略", empty.containsKey("qpsMin"));
        assertFalse("空桶标量别名 qps 也一并省略（三键+别名同语义）", empty.containsKey("qps"));
        assertFalse(empty.containsKey("ioUtilPctAvg"));
        assertFalse(empty.containsKey("ioUtilPctMax"));
        assertFalse(empty.containsKey("ioUtilPctMin"));
    }

    @Test
    public void parseAggResponse_节点模式组键回填nodeName() throws Exception {
        String respJson = "{\"aggregations\":{\"by_group\":{\"buckets\":["
                + "{\"key\":\"node-1\",\"by_time\":{\"buckets\":["
                + "{\"key\":1000,\"load1m\":{\"value\":1.98}}]}}]}}}";
        List<Map<String, Object>> out =
                MonitorMetricsStore.parseAggResponse(MAPPER.readValue(respJson, Map.class), "node");
        assertEquals(1, out.size());
        assertEquals("node 态组键=nodeName", "node-1", out.get(0).get("nodeName"));
        assertEquals(1.98, ((Number) out.get(0).get("load1m")).doubleValue(), 0.0001);
    }

    @Test
    public void parseAggResponse_无聚合回空列表() {
        assertTrue("无 aggregations 键回空", MonitorMetricsStore.parseAggResponse(new java.util.HashMap<>(), "cluster").isEmpty());
        assertTrue("null 回空", MonitorMetricsStore.parseAggResponse(null, "cluster").isEmpty());
    }

    /** 聚合端到端：POST 前缀-* 日期通配 _search 带聚合体（size:0/fixed_interval/分组逐字），桶升序透传。 */
    @Test
    public void searchAgg_端到端_聚合体与桶升序透传() throws Exception {
        List<String> paths = new ArrayList<>();
        List<String> sentBodies = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            paths.add(req.getMethod() + " " + req.getEndpoint());
            sentBodies.add(req.getEntity() == null ? ""
                    : org.apache.http.util.EntityUtils.toString(req.getEntity()));
            return "{\"aggregations\":{\"by_group\":{\"buckets\":["
                    + "{\"key\":\"QA集群\",\"by_time\":{\"buckets\":["
                    + "{\"key\":1000,\"qps\":{\"value\":1.5}},"
                    + "{\"key\":2000,\"qps\":{\"value\":2.5}}"
                    + "]}}]}}}";
        });
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        List<Map<String, Object>> out = store.searchAgg("a", "cluster", 0L, 3000L, "60s");
        assertEquals(1, paths.size());
        assertTrue("目标必须是日期通配", paths.get(0).startsWith("POST /" + PREFIX + "-*/_search"));
        assertTrue("size:0 不取原始文档只要聚合", sentBodies.get(0).contains("\"size\":0"));
        assertTrue("fixed_interval 逐字", sentBodies.get(0).contains("\"fixed_interval\":\"60s\""));
        assertTrue("分组 terms 在案", sentBodies.get(0).contains("\"by_group\":{\"terms\":{\"field\":\"connName\""));
        assertEquals("date_histogram 桶天然升序透传", 2, out.size());
        assertEquals("QA集群", out.get(0).get("connName"));
        assertEquals(1000L, out.get(0).get("timestamp"));
        assertEquals(2000L, out.get(1).get("timestamp"));
        assertEquals(2.5, ((Number) out.get(1).get("qps")).doubleValue(), 0.0001);
    }

    /** 聚合空档契约：无任何日期索引时 404 → 空列表不抛（与原始查询同口径）。 */
    @Test
    public void searchAgg_404空档回空列表() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            throw EsFakeClients.responseException(404,
                    "{\"error\":{\"type\":\"index_not_found_exception\",\"reason\":\"no such index\"}}");
        });
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        assertTrue(store.searchAgg("a", "cluster", null, null, "60s").isEmpty());
    }

    /* ==================== R7 告警读侧 ==================== */

    @Test
    public void buildTopBody__最新快照契约() {
        String body = MonitorMetricsStore.buildTopBody("腾讯云QA");
        assertTrue("size:1 取最新一条", body.contains("\"size\":1"));
        assertTrue("timestamp 降序", body.contains("\"order\":\"desc\""));
        assertTrue("kind+scope 恒定过滤", body.contains("\"term\":{\"kind\":\"metrics\"}}"));
        assertTrue(body.contains("\"term\":{\"scope\":\"cluster\"}"));
        assertTrue("exists 过滤带 topIndexes 字段的 doc", body.contains("\"exists\":{\"field\":\"topIndexes\"}"));
        assertTrue("connName 过滤转义透传（前端下拉持实名）", body.contains("{\"term\":{\"connName\":\"腾讯云QA\"}}"));
    }

    @Test
    public void searchTopIndexes_端到端_取最新快照数组() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> "{\"hits\":{\"hits\":["
                + "{\"_source\":{\"timestamp\":2000,\"kind\":\"metrics\",\"scope\":\"cluster\","
                + "\"topIndexes\":[{\"index\":\"idx_a\",\"qps\":10.0,\"idxRate\":5.0,\"storeMb\":100.0}]}}]}}");
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        List<Map<String, Object>> out = store.searchTopIndexes("a", 8);
        assertEquals(1, out.size());
        assertEquals("idx_a", out.get(0).get("index"));
        assertEquals(10.0, ((Number) out.get(0).get("qps")).doubleValue(), 0.0001);
    }

    @Test
    public void searchTopIndexes_404空档回空() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            throw EsFakeClients.responseException(404,
                    "{\"error\":{\"type\":\"index_not_found_exception\"}}");
        });
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        assertTrue(store.searchTopIndexes(null, 8).isEmpty());
    }


    @Test
    public void buildAlertsBody_kind过滤_倒序_钳100() {
        String body = MonitorMetricsStore.buildAlertsBody(50);
        assertTrue("kind=alert 恒定过滤（同族混居 metrics/探活 doc，绝不能串味）",
                body.contains("{\"term\":{\"kind\":\"alert\"}}"));
        assertTrue("最新事件打头（倒序，与审计/历史同向）",
                body.contains("\"sort\":[{\"timestamp\":{\"order\":\"desc\"}}]"));
        assertFalse("纯过滤场景不得出现评分上下文", body.contains("\"must\""));
        assertTrue("size 上限 100", MonitorMetricsStore.buildAlertsBody(9999).contains("\"size\":100"));
        assertTrue("size 下限 1", MonitorMetricsStore.buildAlertsBody(0).contains("\"size\":1"));
    }

    @Test
    public void buildAlertsBody_时间窗过滤在filter数组内_可解析() throws Exception {
        /* 产线 /live 实报 500：range 曾拼在 filter 数组的 ] 之后且带尾逗号，
           ES 回 json_parse_exception（Unexpected character '{'）。解析即证伪。 */
        ObjectMapper mapper = new ObjectMapper();
        String body = MonitorMetricsStore.buildAlertsBody(100, 1000L, 2000L);
        com.fasterxml.jackson.databind.JsonNode filter = mapper.readTree(body)
                .path("query").path("bool").path("filter");
        assertTrue("filter 必须是数组", filter.isArray());
        assertEquals("kind=alert + 时间窗两段过滤", 2, filter.size());
        assertEquals(1000L, filter.get(1).path("range").path("timestamp").path("gte").asLong());
        assertEquals(2000L, filter.get(1).path("range").path("timestamp").path("lte").asLong());
        /* 单边界也必须是合法 JSON，且只带对应一侧 */
        com.fasterxml.jackson.databind.JsonNode onlyFrom = mapper.readTree(
                MonitorMetricsStore.buildAlertsBody(100, 1000L, null))
                .path("query").path("bool").path("filter");
        assertEquals(2, onlyFrom.size());
        assertTrue(onlyFrom.get(1).path("range").path("timestamp").has("gte"));
        assertFalse(onlyFrom.get(1).path("range").path("timestamp").has("lte"));
    }

    /** 端到端：POST 前缀-* 日期通配；查询体带 kind=alert 过滤+倒序；回包（ES 过滤后）只含告警 doc。 */
    @Test
    public void searchAlerts_端到端_kind过滤与倒序透传() throws Exception {
        List<String> paths = new ArrayList<>();
        List<String> sentBodies = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            paths.add(req.getMethod() + " " + req.getEndpoint());
            sentBodies.add(req.getEntity() == null ? ""
                    : org.apache.http.util.EntityUtils.toString(req.getEntity()));
            /* 罐头=ES 执行 kind=alert 过滤后的回包：同族 metrics doc 已被查询剔除 */
            return "{\"hits\":{\"hits\":["
                    + "{\"_source\":{\"timestamp\":30,\"kind\":\"alert\",\"connId\":\"a\","
                    + "\"connName\":\"腾讯云QA\",\"env\":\"QA\",\"level\":\"CRIT\",\"metric\":\"health\","
                    + "\"value\":0.0,\"threshold\":0.0,\"message\":\"集群健康 red\"}},"
                    + "{\"_source\":{\"timestamp\":10,\"kind\":\"alert\",\"connId\":\"a\","
                    + "\"connName\":\"腾讯云QA\",\"env\":\"QA\",\"level\":\"INFO\",\"metric\":\"heap\","
                    + "\"recovered\":true,\"message\":\"已恢复\"}}]}}";
        });
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        List<Map<String, Object>> out = store.searchAlerts(50);
        assertEquals(2, out.size());
        assertEquals("倒序透传：最新告警在前（Jackson 小整数回 Integer，按 Number 取 long）",
                30L, ((Number) out.get(0).get("timestamp")).longValue());
        assertEquals(10L, ((Number) out.get(1).get("timestamp")).longValue());
        assertEquals("CRIT", out.get(0).get("level"));
        assertEquals("结果只含 kind=alert", "alert", out.get(0).get("kind"));
        assertEquals("alert", out.get(1).get("kind"));
        assertEquals("恢复 doc 的 recovered 键透传", Boolean.TRUE, out.get(1).get("recovered"));
        assertEquals(1, paths.size());
        assertTrue("目标必须是日期通配", paths.get(0).startsWith("POST /" + PREFIX + "-*/_search"));
        assertTrue("发出的查询体带 kind=alert 过滤",
                sentBodies.get(0).contains("{\"term\":{\"kind\":\"alert\"}}"));
        assertTrue("发出的查询体带倒序 sort", sentBodies.get(0).contains("\"order\":\"desc\""));
    }

    /** 告警空档契约：无任何日期索引时 404 → 空列表不抛。 */
    @Test
    public void searchAlerts_404空档回空列表() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            throw EsFakeClients.responseException(404,
                    "{\"error\":{\"type\":\"index_not_found_exception\",\"reason\":\"no such index\"}}");
        });
        MonitorMetricsStore store = new MonitorMetricsStore(() -> client, PREFIX);
        assertTrue(store.searchAlerts(50).isEmpty());
    }
}
