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
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 指标时序批：多集群指标采集落库——doc 契约测点（罐头 health+stats → cluster/node doc
 * 字段逐字断言）+ 速率差分测点（上一轮 100→本轮 160、Δt=60s → qps=1.0；首轮/计数回退省略）
 * + thread_pool 拒绝增量测点（基线 10→本轮 25 → writeRejected=15；回退/首轮省略）
 * + 断链 RED doc 测点（buildRedDoc 字段集/error 截断 + 端到端 stats 503 仍落 1 条红 doc）
 * + 端到端（EsFakeClients.scripted：GET 两罐头回包，断言 1 PUT 建索引 + 3 POST 落档）
 * + 故障面（单连接失败落 RED doc 不拦其他连接/空清单零写入）
 * + R7 告警状态机（首次超限写 1 条/持续超限不重复/恢复写 recovered doc/采集失败轮不改状态/
 * red=CRIT/拒绝增量 WARN/message 截 300）+ R8 GC 差分（基线 100→160、Δt=60s → 60/min；
 * 首轮/缺计数/回退省略；基线按当前节点集重建清理下线节点）。
 */
public class ClusterMetricsCollectorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 罐头 _cluster/health（形态=真实 7.x 缺省响应的关键字段）。 */
    private static final String HEALTH_JSON = "{\"status\":\"green\",\"number_of_nodes\":3,"
            + "\"number_of_data_nodes\":3,\"active_shards\":897,\"active_primary_shards\":449,"
            + "\"unassigned_shards\":0}";

    /**  端到端自洽罐头：期望节点数=1 与单节点 stats 罐头一致——不触发失联告警，
        让既有端到端测试继续隔离 heap/rejected 语义（失联规则由专属测试覆盖）。 */
    private static final String HEALTH_SINGLE_JSON = "{\"status\":\"green\",\"number_of_nodes\":1,"
            + "\"number_of_data_nodes\":1,\"active_shards\":897,\"active_primary_shards\":449,"
            + "\"unassigned_shards\":0}";

    /** 罐头 _nodes/stats（filter_path 收窄后的形态）：单节点 n1，query_total=100、index_total=50。 */
    private static final String STATS_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36}},\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"fielddata\":{\"memory_size_in_bytes\":4194304},\"search\":{\"query_total\":100},"
            + "\"indexing\":{\"index_total\":50}}}}}";

    /** 差分测点罐头：同形态，计数器抬到 query_total=160、index_total=80。 */
    private static final String STATS_HIGH_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36}},\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"search\":{\"query_total\":160},"
            + "\"indexing\":{\"index_total\":80}}}}}";

    /** 端到端罐头：双节点 → 1 cluster doc + 2 node docs = 3 POST。 */
    private static final String STATS_TWO_NODES_JSON = "{\"nodes\":{"
            + "\"n1\":{\"name\":\"node-1\",\"jvm\":{\"mem\":{\"heap_used_percent\":36}},"
            + "\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"fielddata\":{\"memory_size_in_bytes\":4194304},\"search\":{\"query_total\":100},"
            + "\"indexing\":{\"index_total\":50}}},"
            + "\"n2\":{\"name\":\"node-2\",\"jvm\":{\"mem\":{\"heap_used_percent\":50}},"
            + "\"os\":{\"cpu\":{\"percent\":10}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":100000000000,\"free_in_bytes\":25000000000}},"
            + "\"indices\":{\"docs\":{\"count\":2000},\"search\":{\"query_total\":20},"
            + "\"indexing\":{\"index_total\":10}}}}}";

    /** 拒绝差分罐头：write rejected=25、search rejected=3（filter_path 收窄后的形态）。 */
    private static final String STATS_REJECTED_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"thread_pool\":{\"write\":{\"rejected\":25},\"search\":{\"rejected\":3}}}}}";

    /** GC 差分罐头（低）：单节点 young collection_count=100、old=20（R8 filter_path 新增形态）。 */
    private static final String STATS_GC_LOW_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36,\"heap_used_in_bytes\":603979776},"
            + "\"gc\":{\"collectors\":{\"young\":{\"collection_count\":100,\"collection_time_in_millis\":5000},"
            + "\"old\":{\"collection_count\":20,\"collection_time_in_millis\":2000}}}},"
            + "\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"fielddata\":{\"memory_size_in_bytes\":4194304},\"search\":{\"query_total\":100},"
            + "\"indexing\":{\"index_total\":50}}}}}";

    /** GC 差分罐头（高）：同形态，young=160、old=25。 */
    private static final String STATS_GC_HIGH_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36,\"heap_used_in_bytes\":654311424},"
            + "\"gc\":{\"collectors\":{\"young\":{\"collection_count\":160,\"collection_time_in_millis\":8000},"
            + "\"old\":{\"collection_count\":25,\"collection_time_in_millis\":3500}}}},"
            + "\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"search\":{\"query_total\":160},"
            + "\"indexing\":{\"index_total\":80}}}}}";

    /**  即时值罐头：Load_1m=1.98 + 查询线程池 active=2/queue=0。 */
    private static final String STATS__INSTANT_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36}},\"os\":{\"cpu\":{\"percent\":3,"
            + "\"load_average\":{\"1m\":1.98,\"5m\":1.4,\"15m\":1.1}}},"
            + "\"thread_pool\":{\"search\":{\"active\":2,\"queue\":0,\"rejected\":0},"
            + "\"write\":{\"active\":1,\"queue\":4,\"rejected\":0}},"
            + "\"indices\":{\"docs\":{\"count\":12000000,\"deleted\":340000},"
            + "\"fielddata\":{\"memory_size_in_bytes\":4194304}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}}}}}";

    /**  磁盘 IO 差分罐头（低， 校准为 7.10 实测字段/标度）：read_kilobytes=1000、write_kilobytes=2000、
     * read_operations=10、write_operations=20。 */
    private static final String STATS_IO_LOW_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36}},\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000},"
            + "\"io_stats\":{\"total\":{\"read_kilobytes\":1000,\"write_kilobytes\":2000,"
            + "\"read_operations\":10,\"write_operations\":20,\"io_time_in_millis\":1000}}}}}}";

    /**  磁盘 IO 差分罐头（高）：Δread_kilobytes=600（→10.0 KiB/s@60s）、Δwrite_kilobytes=300（→5.0）、
     * Δread_operations=60（→1.0 次/秒）、Δwrite_operations=90（→1.5）。 */
    private static final String STATS_IO_HIGH_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36}},\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000},"
            + "\"io_stats\":{\"total\":{\"read_kilobytes\":1600,\"write_kilobytes\":2300,"
            + "\"read_operations\":70,\"write_operations\":110,\"io_time_in_millis\":2500}}}}}}";

    /**  索引 stats 罐头（低基线轮）：idx_a qps 计数 100/idx_b 写入计数 50。 */
    private static final String IDX_STATS_LOW_JSON = "{\"indices\":{"
            + "\"idx_a\":{\"total\":{\"search\":{\"query_total\":100},\"indexing\":{\"index_total\":10}},"
            + "\"primaries\":{\"store\":{\"size_in_bytes\":104857600}}},"
            + "\"idx_b\":{\"total\":{\"search\":{\"query_total\":10},\"indexing\":{\"index_total\":50}},"
            + "\"primaries\":{\"store\":{\"size_in_bytes\":209715200}}}}}";

    /**  索引 stats 罐头（高基线轮）：idx_a Δquery=600（→10.0/s@60s）、idx_b Δindex=300（→5.0/s）。 */
    private static final String IDX_STATS_HIGH_JSON = "{\"indices\":{"
            + "\"idx_a\":{\"total\":{\"search\":{\"query_total\":700},\"indexing\":{\"index_total\":10}},"
            + "\"primaries\":{\"store\":{\"size_in_bytes\":104857600}}},"
            + "\"idx_b\":{\"total\":{\"search\":{\"query_total\":10},\"indexing\":{\"index_total\":350}},"
            + "\"primaries\":{\"store\":{\"size_in_bytes\":209715200}}}}}";

    /**  传输吞吐差分罐头（低）：transport rx=10240000、tx=20480000。 */
    private static final String STATS_NET_LOW_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36}},\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"transport\":{\"rx_size_in_bytes\":10240000,\"tx_size_in_bytes\":20480000}}}}";

    /**  传输吞吐差分罐头（高）：Δrx=614400（→10.0 KiB/s@60s）、Δtx=307200（→5.0）。 */
    private static final String STATS_NET_HIGH_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":36}},\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"transport\":{\"rx_size_in_bytes\":10854400,\"tx_size_in_bytes\":20787200}}}}";

    /** 告警状态机端到端罐头（轮 1）：heap 85 首次超限 + GC 基线轮（无 thread_pool，不触发 rejected）。 */
    private static final String STATS_ALERT_R1_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":85},"
            + "\"gc\":{\"collectors\":{\"young\":{\"collection_count\":100},"
            + "\"old\":{\"collection_count\":20}}}},"
            + "\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"fielddata\":{\"memory_size_in_bytes\":4194304},\"search\":{\"query_total\":100},"
            + "\"indexing\":{\"index_total\":50}}}}}";

    /** 告警状态机端到端罐头（轮 2）：heap 仍 85（持续超限）+ GC 计数抬升。 */
    private static final String STATS_ALERT_R2_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":85},"
            + "\"gc\":{\"collectors\":{\"young\":{\"collection_count\":160,\"collection_time_in_millis\":8000},"
            + "\"old\":{\"collection_count\":25,\"collection_time_in_millis\":3500}}}},"
            + "\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"search\":{\"query_total\":160},"
            + "\"indexing\":{\"index_total\":80}}}}}";

    /** 告警状态机端到端罐头（轮 3）：heap 40 回落（恢复）+ GC 计数续升。 */
    private static final String STATS_ALERT_R3_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"jvm\":{\"mem\":{\"heap_used_percent\":40},"
            + "\"gc\":{\"collectors\":{\"young\":{\"collection_count\":200},"
            + "\"old\":{\"collection_count\":30}}}},"
            + "\"os\":{\"cpu\":{\"percent\":3}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000}},"
            + "\"indices\":{\"docs\":{\"count\":1000},\"search\":{\"query_total\":200},"
            + "\"indexing\":{\"index_total\":100}}}}}";

    private static Map<String, Object> json(String s) throws Exception {
        return MAPPER.readValue(s, Map.class);
    }

    private static Map<String, Object> conn(String id, String name, String env) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("id", id);
        c.put("name", name);
        if (env != null) {
            c.put("env", env);
        }
        return c;
    }

    /** ConnStore 的 JDK 动态代理桩：只实现 list()，其余方法被调即炸（测试不应触达）。 */
    private static ConnStore connStoreOf(final List<Map<String, Object>> conns) {
        return (ConnStore) java.lang.reflect.Proxy.newProxyInstance(
                ConnStore.class.getClassLoader(), new Class<?>[]{ConnStore.class},
                (proxy, method, args) -> {
                    if ("list".equals(method.getName())) {
                        return conns;
                    }
                    throw new UnsupportedOperationException("桩只支持 list()，收到: " + method.getName());
                });
    }

    @Test
    public void buildClusterDoc_罐头全维字段逐字断言() throws Exception {
        Map<String, Object> doc = ClusterMetricsCollector.buildClusterDoc(
                conn("c1", "腾讯云QA", "QA"), json(HEALTH_JSON), json(STATS_JSON), null, 1000L);
        assertEquals("metrics", doc.get("kind"));
        assertEquals("cluster", doc.get("scope"));
        assertEquals(1000L, doc.get("timestamp"));
        assertEquals("c1", doc.get("connId"));
        assertEquals("腾讯云QA", doc.get("connName"));
        assertEquals("QA", doc.get("env"));
        assertEquals("green", doc.get("status"));
        assertEquals(3L, doc.get("nodes"));
        assertEquals(3L, doc.get("dataNodes"));
        assertEquals(897L, doc.get("shards"));
        assertEquals("主分片数=health.active_primary_shards", 449L, doc.get("primaryShards"));
        assertEquals(0L, doc.get("unassigned"));
        assertEquals("失联节点数=期望 3−实到 1", 2L, doc.get("nodesMissing"));
        assertEquals("cluster 级 heap=节点均值", 36.0, (Double) doc.get("heapUsedPct"), 0.0001);
        assertEquals(3.0, (Double) doc.get("cpuPct"), 0.0001);
        assertEquals("磁盘占用=(252e9-49e9)/252e9×100", 80.5555, (Double) doc.get("diskUsedPct"), 0.001);
        assertFalse("首轮无前值：qps 省略", doc.containsKey("qps"));
        assertFalse("首轮无前值：indexRate 省略", doc.containsKey("indexRate"));
        assertFalse("罐头 health 无 indices 维度：静默省略", doc.containsKey("indices"));
    }

    @Test
    public void nodesMissingOf_口径边界() throws Exception {
        Map<String, Object> health = json(HEALTH_JSON);
        List<Map<String, Object>> oneNode = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "QA", "QA"), json(STATS_JSON), 1000L);
        /* buildNodeDocs 产出的是 doc 列表，此处直接构造节点计数形态做口径断言 */
        java.util.List<Map<String, Object>> nodes = new java.util.ArrayList<>();
        java.util.Map<String, Object> n = new java.util.LinkedHashMap<>();
        n.put("name", "node-1");
        nodes.add(n);
        assertEquals("期望 3−实到 1=2", 2L, ClusterMetricsCollector.nodesMissingOf(health, nodes).longValue());
        assertEquals("无失联=0 照落（状态机恒不触发）", 0L,
                ClusterMetricsCollector.nodesMissingOf(health, nodesOf(3)).longValue());
        assertNull("health 缺省 → null", ClusterMetricsCollector.nodesMissingOf(null, nodes));
        assertNull("stats 空档（未拉到节点）宁缺毋假 → null",
                ClusterMetricsCollector.nodesMissingOf(health, new java.util.ArrayList<>()));
        assertNull("实到>期望口径异常 → null",
                ClusterMetricsCollector.nodesMissingOf(health, nodesOf(5)));
    }

    private static java.util.List<Map<String, Object>> nodesOf(int count) {
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (int i = 0; i < count; i++) {
            java.util.Map<String, Object> n = new java.util.LinkedHashMap<>();
            n.put("name", "node-" + i);
            out.add(n);
        }
        return out;
    }

    @Test
    public void evaluateAlerts_失联节点_迁移沿语义() {
        java.util.Map<String, Object> doc = new java.util.LinkedHashMap<>(clusterDocForAlert(null, null, "green", 0L, 0L));
        doc.put("nodes", 3L);
        doc.put("nodesMissing", 2L);
        ClusterMetricsCollector.AlertEvaluation eval = ClusterMetricsCollector.evaluateAlerts(
                doc, new java.util.HashSet<String>());
        boolean found = false;
        for (Map<String, Object> d : eval.alertDocs) {
            if ("nodesMissing".equals(d.get("metric"))) {
                found = true;
                assertEquals("WARN", d.get("level"));
                assertEquals(2.0, (Double) d.get("value"), 0.0001);
                assertTrue(String.valueOf(d.get("message")).contains("失联 2 个节点"));
            }
        }
        assertTrue("失联>0 首轮 → WARN 告警 doc", found);
        /* 次轮恢复：nodesMissing 缺省（不可判定不触发）+ 前态含键 → 恢复 doc */
        java.util.Map<String, Object> healed = new java.util.LinkedHashMap<>(clusterDocForAlert(null, null, "green", 0L, 0L));
        healed.put("nodes", 3L);
        ClusterMetricsCollector.AlertEvaluation rec = ClusterMetricsCollector.evaluateAlerts(
                healed, new java.util.HashSet<>(Collections.singletonList("c1|nodesMissing")));
        boolean recovered = false;
        for (Map<String, Object> d : rec.alertDocs) {
            if ("nodesMissing".equals(d.get("metric"))) {
                recovered = true;
                assertEquals(Boolean.TRUE, d.get("recovered"));
            }
        }
        assertTrue("字段缺省=前态解除 → 恢复 doc", recovered);
    }

    @Test
    public void buildNodeDocs_罐头逐字段断言() throws Exception {
        List<Map<String, Object>> docs = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "腾讯云QA", "QA"), json(STATS_JSON), 2000L);
        assertEquals("每节点 1 条", 1, docs.size());
        Map<String, Object> doc = docs.get(0);
        assertEquals("metrics", doc.get("kind"));
        assertEquals("node", doc.get("scope"));
        assertEquals(2000L, doc.get("timestamp"));
        assertEquals("c1", doc.get("connId"));
        assertEquals("腾讯云QA", doc.get("connName"));
        assertEquals("QA", doc.get("env"));
        assertEquals("node-1", doc.get("nodeName"));
        assertEquals(36.0, (Double) doc.get("heapUsedPct"), 0.0001);
        assertEquals(3.0, (Double) doc.get("cpuPct"), 0.0001);
        assertEquals(80.5555, (Double) doc.get("diskUsedPct"), 0.001);
        assertFalse("node doc 不带 cluster 维度", doc.containsKey("qps"));
    }

    @Test
    public void buildClusterDoc_计数差分_qps与indexRate() throws Exception {
        /* 上一轮基线 ts=0：query_total=100、index_total=50；本轮 160/80、Δt=60s → 1.0 / 0.5 每秒 */
        ClusterMetricsCollector.CounterBaseline last =
                new ClusterMetricsCollector.CounterBaseline(0L, 100L, 50L);
        Map<String, Object> doc = ClusterMetricsCollector.buildClusterDoc(
                conn("c1", "腾讯云QA", "QA"), json(HEALTH_JSON), json(STATS_HIGH_JSON), last, 60_000L);
        assertEquals("60 次搜索 / 60 秒 = qps 1.0", 1.0, (Double) doc.get("qps"), 0.0001);
        assertEquals(0.5, (Double) doc.get("indexRate"), 0.0001);
    }

    @Test
    public void buildClusterDoc_计数回退_速率省略() throws Exception {
        /* 本轮计数 < 上一轮（节点重启计数回退）→ qps/indexRate 省略，宁缺毋假 */
        ClusterMetricsCollector.CounterBaseline last =
                new ClusterMetricsCollector.CounterBaseline(0L, 200L, 100L);
        Map<String, Object> doc = ClusterMetricsCollector.buildClusterDoc(
                conn("c1", "腾讯云QA", "QA"), json(HEALTH_JSON), json(STATS_JSON), last, 60_000L);
        assertFalse(doc.containsKey("qps"));
        assertFalse(doc.containsKey("indexRate"));
    }

    @Test
    public void perSecond_差分口径() {
        assertEquals(1.0, ClusterMetricsCollector.perSecond(160L, 100L, 60_000L), 0.0001);
        assertNull("首轮无前值省略", ClusterMetricsCollector.perSecond(160L, null, 60_000L));
        assertNull("计数回退（节点重启）省略", ClusterMetricsCollector.perSecond(90L, 100L, 60_000L));
        assertNull("Δt 非正省略", ClusterMetricsCollector.perSecond(160L, 100L, 0L));
    }

    @Test
    public void nextBaseline_空节点不更新基线() throws Exception {
        ClusterMetricsCollector.CounterBaseline b =
                ClusterMetricsCollector.nextBaseline(json(STATS_JSON), 5000L);
        assertEquals(5000L, b.timestampMs);
        assertEquals(100L, b.queryTotal);
        assertEquals(50L, b.indexTotal);
        assertNull("stats 无节点（解析失败等）→ null=不更新差分基线，防基线 0 制造下轮虚假尖峰",
                ClusterMetricsCollector.nextBaseline(Collections.emptyMap(), 5000L));
    }

    /** 端到端：目标集群 GET 两罐头回包；控制集群 1 次建当日索引 + 3 条指标 doc（1 cluster+2 node）。 */
    @Test
    public void collectOnce_端到端_1建索引_3落档() throws Exception {
        List<String> puts = new CopyOnWriteArrayList<>();
        List<String> posts = new CopyOnWriteArrayList<>();
        List<String> bodies = new CopyOnWriteArrayList<>();
        RestHighLevelClient target = EsFakeClients.scripted(req -> {
            if (req.getEndpoint().contains("_cluster/health")) {
                return HEALTH_SINGLE_JSON;
            }
            if (req.getEndpoint().contains("_nodes/stats")) {
                return STATS_TWO_NODES_JSON;
            }
            throw EsFakeClients.responseException(400, "{\"error\":{\"type\":\"illegal_argument_exception\"}}");
        });
        RestHighLevelClient control = EsFakeClients.scripted(req -> {
            if ("PUT".equals(req.getMethod())) {
                puts.add(req.getEndpoint());
                return "{\"acknowledged\":true}";
            }
            if ("POST".equals(req.getMethod())) {
                posts.add(req.getEndpoint());
                bodies.add(req.getEntity() == null ? ""
                        : org.apache.http.util.EntityUtils.toString(req.getEntity()));
                return "{\"result\":\"created\"}";
            }
            throw EsFakeClients.responseException(400, "{}");
        });
        ClusterMetricsCollector collector = new ClusterMetricsCollector(
                connStoreOf(Collections.singletonList(conn("c1", "腾讯云QA", "QA"))),
                connId -> target, () -> control, "esquerystudio_monitor", 60);
        collector.collectOnce();
        assertEquals("同日只建一次索引", 1, puts.size());
        assertTrue(puts.get(0).startsWith("/esquerystudio_monitor-2"));
        assertEquals("1 cluster doc + 2 node docs", 3, posts.size());
        assertTrue(posts.get(0).startsWith("/esquerystudio_monitor-2"));
        assertTrue("首条=cluster doc", bodies.get(0).contains("\"scope\":\"cluster\"")
                && bodies.get(0).contains("\"kind\":\"metrics\"") && bodies.get(0).contains("\"connId\":\"c1\""));
        assertTrue("后两条=node docs", bodies.get(1).contains("\"nodeName\":\"node-1\"")
                && bodies.get(2).contains("\"nodeName\":\"node-2\""));
        /* 同日索引已 ensure，只追加 3 条 doc */
        collector.collectOnce();
        assertEquals("同日不再重复建索引", 1, puts.size());
        assertEquals(6, posts.size());
    }

    /** 故障面：c1 失联落 1 条 RED doc（1PUT+1POST）不拦 c2 照常落档；空清单零写入。 */
    @Test
    public void collectOnce_单连接失败不拦其他连接_空清单零写入() throws Exception {
        List<String> requests = new CopyOnWriteArrayList<>();
        RestHighLevelClient dead = EsFakeClients.scripted(req -> {
            throw EsFakeClients.responseException(500, "{\"error\":\"boom\"}");
        });
        RestHighLevelClient control = EsFakeClients.scripted(req -> {
            requests.add(req.getMethod() + " " + req.getEndpoint());
            return "{}";
        });
        RestHighLevelClient alive = EsFakeClients.respondingWith(STATS_JSON, null);
        ClusterMetricsCollector collector = new ClusterMetricsCollector(
                connStoreOf(Arrays.asList(conn("c1", "失联集群", "PROD"), conn("c2", "腾讯云QA", "QA"))),
                connId -> "c1".equals(connId) ? dead : alive,
                () -> control, "esquerystudio_monitor", 60);
        collector.collectOnce();
        /* 本轮改为断链落 RED doc：c1=1 ensure PUT + 1 RED POST；c2 照落 cluster+node 共 2 POST（同日 ensure 已过） */
        assertEquals("c1 失败落 RED doc（1PUT+1POST）不拦 c2：c2 照落 cluster+node 共 2 POST", 4, requests.size());

        ClusterMetricsCollector empty = new ClusterMetricsCollector(
                connStoreOf(Collections.<Map<String, Object>>emptyList()),
                connId -> dead, () -> control, "esquerystudio_monitor", 60);
        empty.collectOnce();
        assertEquals("空清单=零写入", 4, requests.size());
    }

    @Test
    public void buildRedDoc_断链契约字段集_无指标键() {
        Map<String, Object> doc = ClusterMetricsCollector.buildRedDoc(
                conn("c1", "失联集群", "PROD"), "Connect timed out", 3000L);
        assertEquals("metrics", doc.get("kind"));
        assertEquals("cluster", doc.get("scope"));
        assertEquals(3000L, doc.get("timestamp"));
        assertEquals("c1", doc.get("connId"));
        assertEquals("失联集群", doc.get("connName"));
        assertEquals("PROD", doc.get("env"));
        assertEquals("red", doc.get("status"));
        assertEquals("Connect timed out", doc.get("error"));
        assertFalse("断链 doc 无任何指标字段（图表断档由红点+错误解释，而非无声空洞）",
                doc.containsKey("qps"));
        assertFalse(doc.containsKey("indexRate"));
        assertFalse(doc.containsKey("heapUsedPct"));
        assertFalse(doc.containsKey("cpuPct"));
        assertFalse(doc.containsKey("diskUsedPct"));
        assertFalse(doc.containsKey("nodes"));
        assertFalse(doc.containsKey("shards"));
    }

    @Test
    public void buildRedDoc_error截断500_无env省略() {
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 600; i++) {
            big.append('x');
        }
        Map<String, Object> doc = ClusterMetricsCollector.buildRedDoc(
                conn("c1", "n", null), big.toString(), 1L);
        assertEquals("error 截断 500 字符（与探活快照同口径）",
                500, String.valueOf(doc.get("error")).length());
        assertFalse("env 缺省静默省略", doc.containsKey("env"));
    }

    @Test
    public void buildClusterDoc_拒绝差分_增量落doc() throws Exception {
        /* 基线 write=10/search=1；本轮全体节点总和 25/3 → 每轮增量 15/2 */
        ClusterMetricsCollector.CounterBaseline last =
                new ClusterMetricsCollector.CounterBaseline(0L, 0L, 0L, 10L, 1L);
        Map<String, Object> doc = ClusterMetricsCollector.buildClusterDoc(
                conn("c1", "腾讯云QA", "QA"), json(HEALTH_JSON), json(STATS_REJECTED_JSON), last, 60_000L);
        assertEquals("本轮 25 − 基线 10 = 增量 15", 15L, doc.get("writeRejected"));
        assertEquals("本轮 3 − 基线 1 = 增量 2", 2L, doc.get("searchRejected"));
    }

    @Test
    public void buildClusterDoc_拒绝回退与首轮_省略() throws Exception {
        /* 本轮 25 < 基线 100（节点重启计数回退）→ 省略；last=null（首轮无基线）→ 省略 */
        ClusterMetricsCollector.CounterBaseline last =
                new ClusterMetricsCollector.CounterBaseline(0L, 0L, 0L, 100L, 1L);
        Map<String, Object> doc = ClusterMetricsCollector.buildClusterDoc(
                conn("c1", "腾讯云QA", "QA"), json(HEALTH_JSON), json(STATS_REJECTED_JSON), last, 60_000L);
        assertFalse("拒绝计数回退省略（宁缺毋假）", doc.containsKey("writeRejected"));
        Map<String, Object> first = ClusterMetricsCollector.buildClusterDoc(
                conn("c1", "腾讯云QA", "QA"), json(HEALTH_JSON), json(STATS_REJECTED_JSON), null, 60_000L);
        assertFalse("首轮无基线省略", first.containsKey("writeRejected"));
        assertFalse(first.containsKey("searchRejected"));
    }

    @Test
    public void deltaRejected_差分口径() {
        assertEquals(Long.valueOf(15L), ClusterMetricsCollector.deltaRejected(Long.valueOf(10L), 25L));
        assertEquals("增量 0 是有效信息（无拒绝），照落", Long.valueOf(0L),
                ClusterMetricsCollector.deltaRejected(Long.valueOf(10L), 10L));
        assertNull("首轮无基线省略", ClusterMetricsCollector.deltaRejected(null, 25L));
        assertNull("回退（节点重启计数归零→负值）省略",
                ClusterMetricsCollector.deltaRejected(Long.valueOf(100L), 25L));
    }

    /** 断链端到端：health 正常 + _nodes/stats 抛 503 → 仍 1 条 cluster doc（status=red+error，无指标键）。 */
    @Test
    public void collectOnce_断链落RED_doc端到端() throws Exception {
        List<String> bodies = new CopyOnWriteArrayList<>();
        RestHighLevelClient target = EsFakeClients.scripted(req -> {
            if (req.getEndpoint().contains("_cluster/health")) {
                return HEALTH_SINGLE_JSON;
            }
            throw EsFakeClients.responseException(503, "{\"error\":{\"root_cause\":[]},\"status\":503}");
        });
        RestHighLevelClient control = EsFakeClients.scripted(req -> {
            if ("POST".equals(req.getMethod())) {
                bodies.add(req.getEntity() == null ? ""
                        : org.apache.http.util.EntityUtils.toString(req.getEntity()));
            }
            return "{\"result\":\"created\"}";
        });
        ClusterMetricsCollector collector = new ClusterMetricsCollector(
                connStoreOf(Collections.singletonList(conn("c1", "失联集群", "PROD"))),
                connId -> target, () -> control, "esquerystudio_monitor", 60);
        collector.collectOnce();
        assertEquals("stats 拉取失败仍落 1 条 RED doc（图表断档有解释）", 1, bodies.size());
        Map<String, Object> doc = MAPPER.readValue(bodies.get(0), Map.class);
        assertEquals("metrics", doc.get("kind"));
        assertEquals("cluster", doc.get("scope"));
        assertEquals("red", doc.get("status"));
        assertEquals("c1", doc.get("connId"));
        assertEquals("失联集群", doc.get("connName"));
        assertEquals("PROD", doc.get("env"));
        assertTrue("error=根因消息（ResponseException 的 status line 含 503）",
                String.valueOf(doc.get("error")).contains("503"));
        assertFalse("断链 doc 无指标键", doc.containsKey("qps"));
        assertFalse(doc.containsKey("heapUsedPct"));
        assertFalse(doc.containsKey("nodes"));
        assertFalse(doc.containsKey("shards"));
    }

    /* ==================== R7 阈值告警状态机 ==================== */

    /** evaluateAlerts 输入用 cluster doc（指标键按需给，缺=省略形态）。 */
    private static Map<String, Object> clusterDocForAlert(Double heap, Double disk, String status,
                                                          Long writeRejected, Long searchRejected) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("kind", "metrics");
        doc.put("scope", "cluster");
        doc.put("timestamp", 9000L);
        doc.put("connId", "c1");
        doc.put("connName", "腾讯云QA");
        doc.put("env", "QA");
        if (heap != null) {
            doc.put("heapUsedPct", heap);
        }
        if (disk != null) {
            doc.put("diskUsedPct", disk);
        }
        if (status != null) {
            doc.put("status", status);
        }
        if (writeRejected != null) {
            doc.put("writeRejected", writeRejected);
        }
        if (searchRejected != null) {
            doc.put("searchRejected", searchRejected);
        }
        return doc;
    }

    @Test
    public void evaluateAlerts_首次超限_写一条告警doc() {
        ClusterMetricsCollector.AlertEvaluation eval = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(85.5, null, "green", null, null), new java.util.HashSet<String>());
        assertEquals("仅 heap 一条告警", 1, eval.alertDocs.size());
        Map<String, Object> doc = eval.alertDocs.get(0);
        assertEquals("alert", doc.get("kind"));
        assertEquals(9000L, doc.get("timestamp"));
        assertEquals("c1", doc.get("connId"));
        assertEquals("腾讯云QA", doc.get("connName"));
        assertEquals("QA", doc.get("env"));
        assertEquals("WARN", doc.get("level"));
        assertEquals("heap", doc.get("metric"));
        assertEquals(85.5, (Double) doc.get("value"), 0.0001);
        assertEquals(80.0, (Double) doc.get("threshold"), 0.0001);
        assertEquals("heap 使用 85.5%，达到阈值 80.0", doc.get("message"));
        assertFalse("告警 doc 无 recovered 键", doc.containsKey("recovered"));
        assertTrue("新状态含 c1|heap", eval.alertKeys.contains("c1|heap"));
        assertEquals("状态键全集=本轮超限键", 1, eval.alertKeys.size());
    }

    @Test
    public void evaluateAlerts_持续超限_不重复写() {
        java.util.Set<String> prev = new java.util.HashSet<>(Collections.singletonList("c1|heap"));
        ClusterMetricsCollector.AlertEvaluation eval = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(90.0, null, "green", null, null), prev);
        assertTrue("持续超限零新 doc（状态机去重核心）", eval.alertDocs.isEmpty());
        assertTrue("告警态保持", eval.alertKeys.contains("c1|heap"));
    }

    @Test
    public void evaluateAlerts_回落_写恢复doc() {
        java.util.Set<String> prev = new java.util.HashSet<>(Collections.singletonList("c1|heap"));
        ClusterMetricsCollector.AlertEvaluation eval = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(40.0, null, "green", null, null), prev);
        assertEquals("true→false 迁移写 1 条恢复 doc", 1, eval.alertDocs.size());
        Map<String, Object> doc = eval.alertDocs.get(0);
        assertEquals("alert", doc.get("kind"));
        assertEquals("heap", doc.get("metric"));
        assertEquals("INFO", doc.get("level"));
        assertEquals("已恢复", doc.get("message"));
        assertEquals("恢复 doc recovered=true", Boolean.TRUE, doc.get("recovered"));
        assertTrue("回落出告警态", eval.alertKeys.isEmpty());
    }

    @Test
    public void evaluateAlerts_red集群_crit告警与恢复() {
        ClusterMetricsCollector.AlertEvaluation alert = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(null, null, "red", null, null), new java.util.HashSet<String>());
        assertEquals(1, alert.alertDocs.size());
        Map<String, Object> doc = alert.alertDocs.get(0);
        assertEquals("health red=CRIT", "CRIT", doc.get("level"));
        assertEquals("health", doc.get("metric"));
        assertEquals("health value 记 0", 0.0, (Double) doc.get("value"), 0.0001);
        assertEquals("集群健康 red", doc.get("message"));
        assertTrue(alert.alertKeys.contains("c1|health"));

        java.util.Set<String> prev = new java.util.HashSet<>(Collections.singletonList("c1|health"));
        ClusterMetricsCollector.AlertEvaluation recovered = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(null, null, "green", null, null), prev);
        assertEquals("转绿写恢复", 1, recovered.alertDocs.size());
        assertEquals(Boolean.TRUE, recovered.alertDocs.get(0).get("recovered"));
        assertEquals("INFO", recovered.alertDocs.get(0).get("level"));
        assertTrue(recovered.alertKeys.isEmpty());
    }

    @Test
    public void evaluateAlerts_rejected增量告警_归零恢复() {
        ClusterMetricsCollector.AlertEvaluation alert = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(null, null, "green", 3L, 2L), new java.util.HashSet<String>());
        assertEquals(1, alert.alertDocs.size());
        Map<String, Object> doc = alert.alertDocs.get(0);
        assertEquals("WARN", doc.get("level"));
        assertEquals("rejected", doc.get("metric"));
        assertEquals("value=增量合计 write3+search2", 5.0, (Double) doc.get("value"), 0.0001);
        assertTrue(alert.alertKeys.contains("c1|rejected"));

        java.util.Set<String> prev = new java.util.HashSet<>(Collections.singletonList("c1|rejected"));
        ClusterMetricsCollector.AlertEvaluation recovered = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(null, null, "green", 0L, 0L), prev);
        assertEquals("增量归零=恢复", 1, recovered.alertDocs.size());
        assertEquals(Boolean.TRUE, recovered.alertDocs.get(0).get("recovered"));
    }

    @Test
    public void evaluateAlerts_多metric同时超限_各一条() {
        ClusterMetricsCollector.AlertEvaluation eval = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(85.0, 90.0, "red", 1L, 0L), new java.util.HashSet<String>());
        assertEquals("heap+disk+health+rejected 各一条", 4, eval.alertDocs.size());
        assertEquals(4, eval.alertKeys.size());
    }

    @Test
    public void buildAlertDoc_message截断300_缺env省略() {
        Map<String, Object> connDoc = clusterDocForAlert(null, null, null, null, null);
        connDoc.remove("env");
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 400; i++) {
            big.append('x');
        }
        Map<String, Object> doc = ClusterMetricsCollector.buildAlertDoc(
                connDoc, "heap", "WARN", Double.valueOf(1.0), Double.valueOf(80.0), big.toString(), false);
        assertEquals("message 截 300（doc 契约）", 300, String.valueOf(doc.get("message")).length());
        assertFalse("env 缺省静默省略", doc.containsKey("env"));
    }

    /** 端到端：轮 1 heap 85 首次超限写告警 → 轮 2 持续超限不重复 + GC 差分落 node doc → 轮 3 回落写恢复。 */
    @Test
    public void collectOnce_告警状态机三轮_超限持续不重复_恢复写recovered() throws Exception {
        List<String> bodies = new CopyOnWriteArrayList<>();
        java.util.concurrent.atomic.AtomicInteger statsRounds =
                new java.util.concurrent.atomic.AtomicInteger();
        RestHighLevelClient target = EsFakeClients.scripted(req -> {
            if (req.getEndpoint().contains("_cluster/health")) {
                return HEALTH_SINGLE_JSON;
            }
            if (req.getEndpoint().contains("_nodes/stats")) {
                int r = statsRounds.incrementAndGet();
                return r == 1 ? STATS_ALERT_R1_JSON : (r == 2 ? STATS_ALERT_R2_JSON : STATS_ALERT_R3_JSON);
            }
            throw EsFakeClients.responseException(400, "{}");
        });
        RestHighLevelClient control = EsFakeClients.scripted(req -> {
            if ("POST".equals(req.getMethod())) {
                bodies.add(org.apache.http.util.EntityUtils.toString(req.getEntity()));
            }
            return "{\"result\":\"created\"}";
        });
        ClusterMetricsCollector collector = new ClusterMetricsCollector(
                connStoreOf(Collections.singletonList(conn("c1", "腾讯云QA", "QA"))),
                connId -> target, () -> control, "esquerystudio_monitor", 60);

        /* 轮 1：首次超限 → cluster+node+告警 共 3 POST */
        collector.collectOnce();
        assertEquals(3, bodies.size());
        Map<String, Object> alert = MAPPER.readValue(bodies.get(2), Map.class);
        assertEquals("alert", alert.get("kind"));
        assertEquals("heap", alert.get("metric"));
        assertEquals("WARN", alert.get("level"));

        /* 轮 2：持续超限不重复 → 只 cluster+node 共 2 POST；GC 基线 100→160 落 node doc。
         * 先睡 50ms：Windows 上 System.currentTimeMillis 粒度可到 15ms，须保证 Δt>0 差分才可算。 */
        Thread.sleep(50);
        int before = bodies.size();
        collector.collectOnce();
        assertEquals("持续超限不重复写告警", 2, bodies.size() - before);
        Map<String, Object> nodeDoc = MAPPER.readValue(bodies.get(before + 1), Map.class);
        assertTrue("轮 2 有 GC 差分（端到端 Δt 为真实毫秒，只断言存在且为正）",
                nodeDoc.containsKey("gcYoungPerMin")
                        && ((Number) nodeDoc.get("gcYoungPerMin")).longValue() > 0);

        /* 轮 3：heap 40 回落 → cluster+node+恢复 doc 共 3 POST */
        before = bodies.size();
        collector.collectOnce();
        assertEquals("恢复轮写 recovered doc", 3, bodies.size() - before);
        Map<String, Object> recovered = MAPPER.readValue(bodies.get(before + 2), Map.class);
        assertEquals("alert", recovered.get("kind"));
        assertEquals("heap", recovered.get("metric"));
        assertEquals("INFO", recovered.get("level"));
        assertEquals("已恢复", recovered.get("message"));
        assertEquals(Boolean.TRUE, recovered.get("recovered"));
    }

    /** 端到端：轮 1 超限 → 轮 2 断链只落 RED doc（状态不动，不误报恢复）→ 轮 3 恢复才写 recovered。 */
    @Test
    public void collectOnce_采集失败轮不改告警状态_不误报恢复() throws Exception {
        List<String> bodies = new CopyOnWriteArrayList<>();
        java.util.concurrent.atomic.AtomicInteger statsRounds =
                new java.util.concurrent.atomic.AtomicInteger();
        RestHighLevelClient target = EsFakeClients.scripted(req -> {
            if (req.getEndpoint().contains("_cluster/health")) {
                return HEALTH_SINGLE_JSON;
            }
            if (req.getEndpoint().contains("_nodes/stats")) {
                int r = statsRounds.incrementAndGet();
                if (r == 2) {
                    throw EsFakeClients.responseException(503, "{\"error\":\"boom\",\"status\":503}");
                }
                return r == 1 ? STATS_ALERT_R1_JSON : STATS_ALERT_R3_JSON;
            }
            throw EsFakeClients.responseException(400, "{}");
        });
        RestHighLevelClient control = EsFakeClients.scripted(req -> {
            if ("POST".equals(req.getMethod())) {
                bodies.add(org.apache.http.util.EntityUtils.toString(req.getEntity()));
            }
            return "{\"result\":\"created\"}";
        });
        ClusterMetricsCollector collector = new ClusterMetricsCollector(
                connStoreOf(Collections.singletonList(conn("c1", "腾讯云QA", "QA"))),
                connId -> target, () -> control, "esquerystudio_monitor", 60);
        collector.collectOnce();
        assertEquals("轮 1 超限：cluster+node+告警", 3, bodies.size());
        collector.collectOnce();
        assertEquals("断链轮只落 1 条 RED doc，不写恢复 doc", 4, bodies.size());
        Map<String, Object> red = MAPPER.readValue(bodies.get(3), Map.class);
        assertEquals("metrics", red.get("kind"));
        assertEquals("red", red.get("status"));
        collector.collectOnce();
        /* 轮 3 恢复轮（heap 40）：cluster+node+recovered 共 3 POST，总 3+1+3=7 */
        assertEquals("恢复轮（heap 40）才写 cluster+node+recovered", 7, bodies.size());
        Map<String, Object> rec = MAPPER.readValue(bodies.get(6), Map.class);
        assertEquals("告警状态在断链轮被保留：恢复轮直接出 recovered doc",
                Boolean.TRUE, rec.get("recovered"));
    }

    /**  G6 端到端：SLM 差分基线两轮——首轮建基线无告警，次轮新增失败 → cluster doc 带快照字段+slm WARN doc。 */
    @Test
    public void collectOnce_SLM快照_差分与告警() throws Exception {
        List<String> bodies = new CopyOnWriteArrayList<>();
        java.util.concurrent.atomic.AtomicInteger slmRounds = new java.util.concurrent.atomic.AtomicInteger();
        RestHighLevelClient target = EsFakeClients.scripted(req -> {
            if (req.getEndpoint().contains("_cluster/health")) {
                return HEALTH_SINGLE_JSON;
            }
            if (req.getEndpoint().contains("_nodes/stats")) {
                return STATS_JSON;
            }
            if (req.getEndpoint().contains("_slm/stats")) {
                int r = slmRounds.incrementAndGet();
                return r == 1
                        ? "{\"total_snapshots_taken\":10,\"total_snapshots_failed\":0}"
                        : "{\"total_snapshots_taken\":12,\"total_snapshots_failed\":2}";
            }
            throw EsFakeClients.responseException(400, "{}");
        });
        RestHighLevelClient control = EsFakeClients.scripted(req -> {
            if ("POST".equals(req.getMethod())) {
                bodies.add(org.apache.http.util.EntityUtils.toString(req.getEntity()));
            }
            return "{\"result\":\"created\"}";
        });
        ClusterMetricsCollector collector = new ClusterMetricsCollector(
                connStoreOf(Collections.singletonList(conn("c1", "腾讯云QA", "QA"))),
                connId -> target, () -> control, "esquerystudio_monitor", 60);
        collector.collectOnce();
        assertEquals("轮 1 首轮基线：cluster+node=2 POST（delta 省略无告警）", 2, bodies.size());
        Map<String, Object> cluster1 = MAPPER.readValue(bodies.get(0), Map.class);
        assertEquals("轮 1 快照累计失败在档", 0L, ((Number) cluster1.get("snapshotFailed")).longValue());
        assertEquals(10L, ((Number) cluster1.get("snapshotsTotal")).longValue());
        assertFalse("首轮无基线：delta 省略", cluster1.containsKey("snapshotFailedDelta"));
        collector.collectOnce();
        assertEquals("轮 2 新增失败 2：cluster+node+slm 告警=3 POST", 5, bodies.size());
        Map<String, Object> cluster2 = MAPPER.readValue(bodies.get(2), Map.class);
        assertEquals("delta 差分在档", 2L, ((Number) cluster2.get("snapshotFailedDelta")).longValue());
        Map<String, Object> alert = MAPPER.readValue(bodies.get(4), Map.class);
        assertEquals("alert", alert.get("kind"));
        assertEquals("slm", alert.get("metric"));
        assertEquals("WARN", alert.get("level"));
        assertTrue(String.valueOf(alert.get("message")).contains("新增 2 次失败"));
    }

    /* ==================== R8 GC 差分 ==================== */

    @Test
    public void gcPerMin_差分口径() {
        assertEquals("基线 100→160、Δt=60s → 每分钟 60",
                Long.valueOf(60L), ClusterMetricsCollector.gcPerMin(160L, 100L, 60_000L));
        assertEquals("四舍五入取整：1 次 / 20s = 3/min",
                Long.valueOf(3L), ClusterMetricsCollector.gcPerMin(101L, 100L, 20_000L));
        assertNull("首轮无前值省略", ClusterMetricsCollector.gcPerMin(160L, null, 60_000L));
        assertNull("计数缺失省略（不伪造 0）", ClusterMetricsCollector.gcPerMin(null, 100L, 60_000L));
        assertNull("回退（节点重启）省略", ClusterMetricsCollector.gcPerMin(90L, 100L, 60_000L));
        assertNull("Δt 非正省略", ClusterMetricsCollector.gcPerMin(160L, 100L, 0L));
    }

    @Test
    public void buildNodeDocs_GC差分_首轮省略() throws Exception {
        List<Map<String, Object>> first = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "腾讯云QA", "QA"), json(STATS_GC_LOW_JSON), 1000L, null);
        assertFalse("首轮无基线：gcYoungPerMin 省略", first.get(0).containsKey("gcYoungPerMin"));
        assertFalse("首轮无基线：gcOldPerMin 省略", first.get(0).containsKey("gcOldPerMin"));

        ClusterMetricsCollector.GcBaseline last =
                ClusterMetricsCollector.nextGcBaseline(json(STATS_GC_LOW_JSON), 0L);
        List<Map<String, Object>> docs = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "腾讯云QA", "QA"), json(STATS_GC_HIGH_JSON), 60_000L, last);
        assertEquals(1, docs.size());
        assertEquals("基线 100→160、Δt=60s → gcYoungPerMin=60", 60L, docs.get(0).get("gcYoungPerMin"));
        assertEquals("基线 20→25、Δt=60s → gcOldPerMin=5", 5L, docs.get(0).get("gcOldPerMin"));
        /*  对标阿里云「节点 Young/Old GC 耗时(ms)」：Δtime÷Δcount=每次平均耗时 */
        assertEquals("Δ3000ms÷Δ60 次=50ms/次 Young GC 耗时", 50L, docs.get(0).get("gcYoungTimeMs"));
        assertEquals("Δ1500ms÷Δ5 次=300ms/次 Old GC 耗时", 300L, docs.get(0).get("gcOldTimeMs"));
        /*  对标阿里云「节点 Old 区使用(B)」锯齿形态：heap_used_in_bytes→MB（一位小数） */
        assertEquals("654311424B÷1048576=624.0MB", 624.0, (Double) docs.get(0).get("heapUsedMb"), 0.0001);
    }

    @Test
    public void buildNodeDocs_即时值_load与线程池() throws Exception {
        Map<String, Object> doc = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "腾讯云QA", "QA"), json(STATS__INSTANT_JSON), 1000L, null).get(0);
        assertEquals("os.cpu.load_average 的 1m 档", 1.98, (Double) doc.get("load1m"), 0.0001);
        assertEquals("查询线程池活跃数（即时）", 2L, doc.get("tpSearchActive"));
        assertEquals("查询线程池排队数（即时）", 0L, doc.get("tpSearchQueue"));
        /*  对标阿里云线程池 Rows（写入侧）+被标记删除文档：测点型即时值 */
        assertEquals("写入线程池活跃数（即时）", 1L, doc.get("tpWriteActive"));
        assertEquals("写入线程池排队数（即时）", 4L, doc.get("tpWriteQueue"));
        assertEquals("被标记删除未清理文档数（测点）", 340000L, doc.get("docsDeleted"));
        /*  对标阿里云 JVM 组「fielddata 内存使用」：fielddata.memory_size_in_bytes→MB（查询抖动经典根因观测） */
        assertEquals("fielddata 4194304B÷1048576=4.0MB", 4.0, (Double) doc.get("fielddataMb"), 0.0001);
        /*  差分字段与 GC 字段同口径：首轮无基线时缺省 */
        assertFalse(doc.containsKey("diskReadKbS"));
        assertFalse(doc.containsKey("diskWriteIops"));
    }

    @Test
    public void buildNodeDocs_磁盘IO差分_带宽与IOPS() throws Exception {
        ClusterMetricsCollector.GcBaseline last =
                ClusterMetricsCollector.nextGcBaseline(json(STATS_IO_LOW_JSON), 0L);
        List<Map<String, Object>> docs = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "腾讯云QA", "QA"), json(STATS_IO_HIGH_JSON), 60_000L, last);
        assertEquals(1, docs.size());
        Map<String, Object> doc = docs.get(0);
        assertEquals("Δ614400B÷60s÷1024=10.0 KiB/s", 10.0, (Double) doc.get("diskReadKbS"), 0.0001);
        assertEquals("Δ307200B÷60s÷1024=5.0 KiB/s", 5.0, (Double) doc.get("diskWriteKbS"), 0.0001);
        assertEquals("Δ60 ops÷60s=1.0 次/秒", 1.0, (Double) doc.get("diskReadIops"), 0.0001);
        assertEquals("Δ90 ops÷60s=1.5 次/秒", 1.5, (Double) doc.get("diskWriteIops"), 0.0001);
        /*  对标阿里云 IOUtil(%)：Δio_time_in_millis÷Δt×100=1500/60000×100=2.5% */
        assertEquals("Δ1500ms÷60s×100=2.5% IOUtil", 2.5, (Double) doc.get("ioUtilPct"), 0.0001);
    }

    @Test
    public void buildTopIndexes_差分与Top选取_() throws Exception {
        ClusterMetricsCollector.IndexBaseline prev =
                ClusterMetricsCollector.nextIndexCounters(json(IDX_STATS_LOW_JSON), 0L);
        List<Map<String, Object>> top = ClusterMetricsCollector.buildTopIndexes(
                json(IDX_STATS_HIGH_JSON), prev, 60_000L);
        assertEquals("两个有效速率索引入选", 2, top.size());
        assertEquals("按 qps+idxRate 降序：idx_a(10) 在前", "idx_a", top.get(0).get("index"));
        assertEquals("Δquery 600÷60s=10.0/s", 10.0, (Double) top.get(0).get("qps"), 0.0001);
        assertEquals("idx_b 写入 Δ300÷60s=5.0/s", 5.0, (Double) top.get(1).get("idxRate"), 0.0001);
        assertEquals("存储折 MB", 100.0, (Double) top.get(0).get("storeMb"), 0.001);
        /* 首轮无基线：无速率不入选 */
        assertTrue(ClusterMetricsCollector.buildTopIndexes(json(IDX_STATS_HIGH_JSON), null, 60_000L).isEmpty());
        /* 罐头缺失 → 空列表不抛 */
        assertTrue(ClusterMetricsCollector.buildTopIndexes(null, prev, 60_000L).isEmpty());
        assertNull("stats 无索引 → 基线不更新",
                ClusterMetricsCollector.nextIndexCounters(Collections.emptyMap(), 0L));
    }

    @Test
    public void indexStatsRequest_filterPath契约() throws Exception {
        org.elasticsearch.client.Request req = ClusterMetricsCollector.indexStatsRequest();
        String fp = req.getParameters().get("filter_path");
        assertTrue(fp.contains("indices.*.total.search.query_total"));
        assertTrue(fp.contains("indices.*.total.indexing.index_total"));
        assertTrue(fp.contains("indices.*.primaries.store.size_in_bytes"));
    }

    @Test
    public void kbPerSec_opsPerSec_load1mOf_差分口径() throws Exception {
        assertEquals("kilobytes 已是 KiB：Δ600KB÷60s=10.0 KiB/s",
                10.0, ClusterMetricsCollector.opsPerSec(1_600L, 1_000L, 60_000L), 0.0001);
        assertNull("首轮无前值省略", ClusterMetricsCollector.opsPerSec(1_600L, null, 60_000L));
        assertNull("计数回退省略", ClusterMetricsCollector.opsPerSec(500L, 1_000L, 60_000L));
        assertNull("Δt 非正省略", ClusterMetricsCollector.opsPerSec(1_600L, 1_000L, 0L));
        assertEquals(1.0, ClusterMetricsCollector.opsPerSec(70L, 10L, 60_000L), 0.0001);
        assertNull(ClusterMetricsCollector.opsPerSec(70L, null, 60_000L));
        assertEquals(1.98, ClusterMetricsCollector.load1mOf(json(
                "{\"1m\":1.98,\"5m\":1.4}")), 0.0001);
        assertNull("load_average 缺省（平台不支持）→ null", ClusterMetricsCollector.load1mOf(null));
        assertNull("非数值档 → null", ClusterMetricsCollector.load1mOf(json("{\"1m\":\"n/a\"}")));
    }

    @Test
    public void buildNodeDocs_传输吞吐差分_rxTx() throws Exception {
        ClusterMetricsCollector.GcBaseline last =
                ClusterMetricsCollector.nextGcBaseline(json(STATS_NET_LOW_JSON), 0L);
        List<Map<String, Object>> docs = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "腾讯云QA", "QA"), json(STATS_NET_HIGH_JSON), 60_000L, last);
        assertEquals(1, docs.size());
        Map<String, Object> doc = docs.get(0);
        assertEquals("Δ614400B÷60s÷1024=10.0 KiB/s", 10.0, (Double) doc.get("netRxKbS"), 0.0001);
        assertEquals("Δ307200B÷60s÷1024=5.0 KiB/s", 5.0, (Double) doc.get("netTxKbS"), 0.0001);
        /* 首轮无基线：差分字段省略（与磁盘 IO/GC 同口径） */
        List<Map<String, Object>> first = ClusterMetricsCollector.buildNodeDocs(
                conn("c1", "腾讯云QA", "QA"), json(STATS_NET_HIGH_JSON), 1000L, null);
        assertFalse(first.get(0).containsKey("netRxKbS"));
        assertFalse(first.get(0).containsKey("netTxKbS"));
    }

    @Test
    public void slmStatsOf_解析与缺省() throws Exception {
        long[] out = ClusterMetricsCollector.slmStatsOf(json(
                "{\"total_snapshots_taken\":12,\"total_snapshots_failed\":2,"
                + "\"policy_stats\":[{\"policy\":\"daily\",\"snapshots_failed\":2}]}"));
        assertEquals("顶层累计失败数", 2L, out[0]);
        assertEquals("顶层累计执行数", 12L, out[1]);
        assertNull("slm 缺省 → null（快照指标整组省略）", ClusterMetricsCollector.slmStatsOf(null));
        assertNull("响应缺键 → null", ClusterMetricsCollector.slmStatsOf(json("{\"retention_runs\":1}")));
    }

    @Test
    public void evaluateAlerts_快照失败_迁移沿语义() {
        java.util.Map<String, Object> doc = new java.util.LinkedHashMap<>(
                clusterDocForAlert(null, null, "green", 0L, 0L));
        doc.put("snapshotFailedDelta", 2L);
        doc.put("snapshotFailed", 5L);
        ClusterMetricsCollector.AlertEvaluation eval = ClusterMetricsCollector.evaluateAlerts(
                doc, new java.util.HashSet<String>());
        boolean found = false;
        for (Map<String, Object> d : eval.alertDocs) {
            if ("slm".equals(d.get("metric"))) {
                found = true;
                assertEquals("WARN", d.get("level"));
                assertEquals(2.0, (Double) d.get("value"), 0.0001);
                assertTrue(String.valueOf(d.get("message")).contains("新增 2 次失败"));
                assertTrue(String.valueOf(d.get("message")).contains("累计 5"));
            }
        }
        assertTrue("新增失败>0 首轮 → WARN 告警 doc", found);
        /* 次轮 delta=0（无新增失败）→ 恢复 doc；字段缺省 → 不触发不误报恢复 */
        java.util.Map<String, Object> healed = new java.util.LinkedHashMap<>(
                clusterDocForAlert(null, null, "green", 0L, 0L));
        healed.put("snapshotFailedDelta", 0L);
        healed.put("snapshotFailed", 5L);
        ClusterMetricsCollector.AlertEvaluation rec = ClusterMetricsCollector.evaluateAlerts(
                healed, new java.util.HashSet<>(Collections.singletonList("c1|slm")));
        boolean recovered = false;
        for (Map<String, Object> d : rec.alertDocs) {
            if ("slm".equals(d.get("metric"))) {
                recovered = true;
                assertEquals(Boolean.TRUE, d.get("recovered"));
            }
        }
        assertTrue("delta=0 → 恢复 doc", recovered);
        /* 字段缺省=未超限（与 heap 同语义）：前态 breached 时写一次性恢复 doc（状态清理） */
        ClusterMetricsCollector.AlertEvaluation healed2 = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(null, null, "green", 0L, 0L),
                new java.util.HashSet<>(Collections.singletonList("c1|slm")));
        boolean slmRecovered = false;
        for (Map<String, Object> d : healed2.alertDocs) {
            if ("slm".equals(d.get("metric"))) {
                slmRecovered = true;
                assertEquals(Boolean.TRUE, d.get("recovered"));
            }
        }
        assertTrue("字段缺省=未超限（前态解除写一次性恢复）", slmRecovered);
        /* 从未告警过的集群（无 SLM）：prev 无键 → 零 doc，绝不凭空骚扰 */
        ClusterMetricsCollector.AlertEvaluation quiet = ClusterMetricsCollector.evaluateAlerts(
                clusterDocForAlert(null, null, "green", 0L, 0L), new java.util.HashSet<String>());
        assertEquals("无 SLM 集群零 slm doc", 0, quiet.alertDocs.size());
    }

    @Test
    public void nodesStatsRequest_filterPath含新增字段() throws Exception {
        org.elasticsearch.client.Request req = ClusterMetricsCollector.nodesStatsRequest();
        String fp = req.getParameters().get("filter_path");
        assertTrue("Load_1m 源字段", fp.contains("nodes.*.os.cpu.load_average"));
        assertTrue("磁盘 IO 计数（ 校准 7.10 实测字段）", fp.contains("nodes.*.fs.io_stats.total.read_kilobytes"));
        assertTrue(fp.contains("nodes.*.fs.io_stats.total.write_operations"));
        assertTrue("线程池即时值", fp.contains("nodes.*.thread_pool.search.active"));
        assertTrue(fp.contains("nodes.*.thread_pool.search.queue"));
        /* R8/R9 既有字段不回退 */
        assertTrue(fp.contains("nodes.*.jvm.gc.collectors.young.collection_count"));
        assertTrue(fp.contains("nodes.*.indices.indexing.index_time_in_millis"));
    }

    @Test
    public void nextGcBaseline_按当前节点集重建_节点下线键清理() throws Exception {
        ClusterMetricsCollector.GcBaseline two = ClusterMetricsCollector.nextGcBaseline(
                json(STATS_TWO_NODES_JSON), 5000L);
        assertTrue("双节点都在基线",
                two.collectors.containsKey("node-1") && two.collectors.containsKey("node-2"));
        ClusterMetricsCollector.GcBaseline shrunk = ClusterMetricsCollector.nextGcBaseline(
                json(STATS_GC_LOW_JSON), 6000L);
        assertFalse("节点集收缩后旧键随重建自然清理", shrunk.collectors.containsKey("node-2"));
        assertEquals("存活节点计数照记", Long.valueOf(100L), shrunk.collectors.get("node-1")[0]);
        assertNull("stats 无节点 → null=不更新", ClusterMetricsCollector.nextGcBaseline(Collections.emptyMap(), 0L));
    }

    /* ═══ R9 慢查询代理指标：ms/次 差分口径（Δ耗时÷Δ次数，一位小数；边界省略） ═══ */
    @org.junit.Test
    public void msPerOp_差分口径_边界省略() {
        assertEquals(12.5, ClusterMetricsCollector.msPerOp(1250L, 0L, 100L, 0L), 0.0001);
        assertNull("缺基线省略", ClusterMetricsCollector.msPerOp(1250L, null, 100L, null));
        assertNull("计数回退省略", ClusterMetricsCollector.msPerOp(1250L, 0L, 50L, 100L));
        assertNull("零次查询省略", ClusterMetricsCollector.msPerOp(1250L, 0L, 0L, 100L));
    }

    /* ═══ force_merge 线程池三件 / OS 内存 / 剩余存储 / ES 业务 CPU / 集群可搜索文档总数 ═══ */

    /** Wave B 罐头：n1 带 force_merge(active=1,queue=2,rejected=7)、os 内存 71.5%、剩余存储 50GiB、ES 业务 CPU 12.5%。 */
    private static final String STATS_WAVEB_JSON = "{\"nodes\":{\"n1\":{\"name\":\"node-1\","
            + "\"thread_pool\":{\"force_merge\":{\"active\":1,\"queue\":2,\"rejected\":7}},"
            + "\"os\":{\"mem\":{\"used_percent\":71.5},\"cpu\":{\"percent\":3}},"
            + "\"process\":{\"cpu\":{\"percent\":12.5}},"
            + "\"fs\":{\"total\":{\"total_in_bytes\":252000000000,\"free_in_bytes\":49000000000,"
            + "\"available_in_bytes\":53687091200}}}}}";

    @org.junit.Test
    public void buildNodeDocs_waveB_即时值直读_首轮无差分() throws Exception {
        List<Map<String, Object>> docs = ClusterMetricsCollector.buildNodeDocs(
                Collections.singletonMap("connName", "QA"), json(STATS_WAVEB_JSON), 5000L, null);
        assertEquals(1, docs.size());
        Map<String, Object> doc = docs.get(0);
        assertEquals("force_merge 运行即时值", 1L, doc.get("tpForceMergeActive"));
        assertEquals("force_merge 排队即时值", 2L, doc.get("tpForceMergeQueue"));
        assertEquals("OS 内存使用率", 71.5, (Double) doc.get("osMemUsedPct"), 0.0001);
        assertEquals("剩余可用存储 MB", 51200.0, (Double) doc.get("fsAvailMb"), 0.0001);
        assertEquals("ES 业务进程 CPU%", 12.5, (Double) doc.get("esCpuPct"), 0.0001);
        assertFalse("首轮无基线 → rejected 差分缺省", doc.containsKey("tpForceMergeRejected"));
    }

    @org.junit.Test
    public void tpForceMergeRejected_差分两轮() throws Exception {
        ClusterMetricsCollector.GcBaseline prev = ClusterMetricsCollector.nextGcBaseline(
                json(STATS_WAVEB_JSON), 5000L);
        List<Map<String, Object>> docs = ClusterMetricsCollector.buildNodeDocs(
                Collections.singletonMap("connName", "QA"),
                json("{\"nodes\":{\"n1\":{\"name\":\"node-1\","
                        + "\"thread_pool\":{\"force_merge\":{\"active\":0,\"queue\":0,\"rejected\":9}}}}}"),
                11000L, prev);
        Map<String, Object> doc = docs.get(0);
        assertEquals("rejected 9-7=每轮增量 2", 2L, doc.get("tpForceMergeRejected"));
        assertFalse("active/queue 归零也如实落即时值", doc.get("tpForceMergeActive") == null);
    }

    @org.junit.Test
    public void collectOnce_waveB_docsTotal落档() throws Exception {
        List<String> posts = new CopyOnWriteArrayList<>();
        List<String> bodies = new CopyOnWriteArrayList<>();
        RestHighLevelClient target = EsFakeClients.scripted(req -> {
            if (req.getEndpoint().contains("_cluster/health")) {
                return HEALTH_SINGLE_JSON;
            }
            if (req.getEndpoint().contains("_nodes/stats")) {
                return STATS_WAVEB_JSON;
            }
            if (req.getEndpoint().contains("_cluster/stats")) {
                return "{\"indices\":{\"docs\":{\"count\":123456}}}";
            }
            throw EsFakeClients.responseException(400, "{}");
        });
        RestHighLevelClient control = EsFakeClients.scripted(req -> {
            if ("PUT".equals(req.getMethod())) {
                return "{\"acknowledged\":true}";
            }
            if ("POST".equals(req.getMethod())) {
                posts.add(req.getEndpoint());
                bodies.add(req.getEntity() == null ? ""
                        : org.apache.http.util.EntityUtils.toString(req.getEntity()));
                return "{\"result\":\"created\"}";
            }
            throw EsFakeClients.responseException(400, "{}");
        });
        ClusterMetricsCollector collector = new ClusterMetricsCollector(
                connStoreOf(Collections.singletonList(conn("c1", "腾讯云QA", "QA"))),
                connId -> target, () -> control, "esquerystudio_monitor", 60);
        collector.collectOnce();
        boolean clusterDocHasDocsTotal = false;
        for (String body : bodies) {
            for (String line : body.split("\n")) {
                if (line.contains("\"scope\":\"cluster\"") && line.contains("\"docsTotal\":123456")) {
                    clusterDocHasDocsTotal = true;
                }
            }
        }
        assertTrue("cluster doc 落可搜索文档总数", clusterDocHasDocsTotal);
        assertFalse("无 POST 视为失败批次", posts.isEmpty());
    }
}

