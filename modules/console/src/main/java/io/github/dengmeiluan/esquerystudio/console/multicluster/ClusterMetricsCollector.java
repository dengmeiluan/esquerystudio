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
import io.github.dengmeiluan.esquerystudio.console.control.ControlDailyIndex;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 多集群指标采集落库器（指标时序批）：服务端定时任务按轮对 {@link ConnStore#list()} 的
 * 每个连接经 {@link EsClientRouter#clientFor} 拉目标集群的
 * {@code /_cluster/health} + {@code /_nodes/stats}（filter_path 收窄到所需字段），
 * 合成 <b>1 条 cluster 指标 doc + 每节点 1 条 node 指标 doc</b>，落
 * {@code esquerystudio_monitor-yyyy.MM.dd} 日期索引——与探活快照
 * （{@link MonitorSnapshotRecorder}）同族同环形（同一双闸清理器管辖）。
 *
 * <p><b>契约</b>：doc 字段名逐字固定（前端图表依赖）；cluster doc=
 * {@code {kind:"metrics", scope:"cluster", timestamp, connId, connName, env,
 * status, qps, indexRate, heapUsedPct, cpuPct, diskUsedPct, nodes, dataNodes,
 * indices, shards, unassigned, writeRejected, searchRejected[, topIndexes(
 * 索引级 Top 快照：index/qps/idxRate/storeMb ×≤8，mapping enabled:false 仅存储)]}；node doc=
 * {@code {kind:"metrics", scope:"node", timestamp, connId, connName, env, nodeName,
 * heapUsedPct, cpuPct, diskUsedPct, gcYoungPerMin, gcOldPerMin, load1m,
 * diskReadKbS, diskWriteKbS, diskReadIops, diskWriteIops,
 * tpSearchActive, tpSearchQueue, netRxKbS, netTxKbS}}（/=节点深耕新增）；alert doc 见
 * {@link #evaluateAlerts}。null/无法计算的字段静默省略。</p>
 *
 * <p><b>断链 RED doc</b>：单连接 health/stats 拉取失败也落 1 条
 * {@code {kind:"metrics", scope:"cluster", timestamp, connId, connName, env,
 * status:"red", error}}（无指标字段）——图表断档有解释，而不是无声空洞；
 * error=根因消息（cause 链最根，取法与 {@link ConnHealthProber} 同）截断 500 字符。</p>
 *
 * <p><b>速率差分</b>：qps=Σ(nodes search.query_total 增量)/Δt秒、indexRate=Σ(indexing.index_total
 * 增量)/Δt——内存里存每连接上一轮计数器基线（{@link CounterBaseline}）做差分；
 * 首轮（无前值）或计数回退（节点重启）省略该字段。重启即失是刻意取舍：指标是趋势数据，
 * 一个点缺失远好于一个虚假尖峰。thread_pool write/search rejected 同一基线做
 * <b>每轮增量</b>（{@code writeRejected}/{@code searchRejected}，集群级），口径一致：
 * 首轮无基线/回退省略。GC 计数差分同口径按<b>节点</b>做：node doc 的
 * {@code gcYoungPerMin}/{@code gcOldPerMin}=该节点 jvm.gc.collectors 计数差 ÷ Δt分钟
 * （四舍五入取整；首轮/新节点/回退/Δt≤0 省略），基线随 {@link #nextGcBaseline}
 * 按当前节点集重建——节点下线时旧键自然清理。</p>
 *
 * <p><b>阈值告警事件（R7）</b>：指标采集成功后对 cluster doc 做 4 条静态规则评估
 * （heap≥80 WARN/disk≥85 WARN/health red CRIT/拒绝增量&gt;0 WARN），落
 * {@code kind:"alert"} doc（与指标 doc 同族同日期索引、同一 ensure+POST 路径）。
 * <b>状态机去重</b>是核心：每连接每 metric 一条状态（{@code connId|metric} → 布尔），
 * 仅 false→true 迁移写 1 条告警 doc（持续超限不重复写），true→false 写 1 条恢复 doc
 * （{@code recovered:true, level:INFO, message:"已恢复"}）；
 * <b>采集失败轮不进评估</b>（RED doc 路径直接返回）——断链不误报恢复。</p>
 *
 * <p><b>故障面</b>：单连接失败落 RED doc + 节流告警（首条 WARN+计数）不拦其他连接；
 * ensure 失败照写动态映射兜底——监控永不反噬业务（与 {@link MonitorSnapshotRecorder}
 * 同口径）。</p>
 *
 * @author aicoding
 */
public class ClusterMetricsCollector {

    private static final Logger LOG = LoggerFactory.getLogger(ClusterMetricsCollector.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 调度下限 30s（指标是分钟级趋势数据，防误配打死被采集集群）。 */
    static final long MIN_INTERVAL_SECONDS = 30L;
    /** 首轮延迟 30s（让宿主/探活先完成启动，与 MonitorSnapshotRecorder 同口径）。 */
    static final long INITIAL_DELAY_SECONDS = 30L;

    /** R7 告警阈值：heap 占用 ≥ 80% → WARN。 */
    static final double HEAP_WARN_THRESHOLD = 80.0;
    /** R7 告警阈值：disk 占用 ≥ 85% → WARN。 */
    static final double DISK_WARN_THRESHOLD = 85.0;
    /** R7 告警阈值：write+search 拒绝增量合计 &gt; 0 → WARN（阈值记 0，语义是「严格大于」）。 */
    static final double REJECTED_WARN_THRESHOLD = 0.0;
    /** R7 告警 message 截断上限（doc 契约 ≤300）。 */
    static final int MAX_ALERT_MESSAGE = 300;
    /**  告警阈值：Young GC 每分钟次数 ≥ 10 → WARN（经验参考线，可用配置覆盖前先取此默认）。 */
    static final double GC_YOUNG_ALERT_PER_MIN = 10.0;
    /**  告警需连续 ≥ 2 轮超限（单轮尖峰不告警，削抖动误报）。 */
    static final int GC_YOUNG_ALERT_ROUNDS = 2;

    /**
     * 指标 doc 显式 mapping（契约化）：与探活快照 mapping 共享字段同型（keyword/long 无冲突），
     * 指标数值字段显式 double/long；R7 起同族混居告警 doc，补 level/metric/message/recovered，
     * value/threshold 显式 double——否则动态映射会被首条告警 doc 定型（health 的 value=0 是整型，
     * 先落会把后续 heap 的 85.5 顶成 mapping 冲突）。两器谁先建索引都兼容——后建方的 ensure 撞
     * already-exists 幂等吞掉，缺的字段走动态映射兜底。
     */
    public static final String METRICS_MAPPING_JSON = "{\"properties\":{"
            + "\"timestamp\":{\"type\":\"long\"},"
            + "\"kind\":{\"type\":\"keyword\"},"
            + "\"scope\":{\"type\":\"keyword\"},"
            + "\"connId\":{\"type\":\"keyword\"},"
            + "\"connName\":{\"type\":\"keyword\"},"
            + "\"env\":{\"type\":\"keyword\"},"
            + "\"status\":{\"type\":\"keyword\"},"
            + "\"nodeName\":{\"type\":\"keyword\"},"
            + "\"error\":{\"type\":\"keyword\"},"
            + "\"level\":{\"type\":\"keyword\"},"
            + "\"metric\":{\"type\":\"keyword\"},"
            + "\"message\":{\"type\":\"keyword\"},"
            + "\"recovered\":{\"type\":\"boolean\"},"
            + "\"qps\":{\"type\":\"double\"},"
            + "\"indexRate\":{\"type\":\"double\"},"
            + "\"heapUsedPct\":{\"type\":\"double\"},"
            + "\"cpuPct\":{\"type\":\"double\"},"
            + "\"diskUsedPct\":{\"type\":\"double\"},"
            + "\"gcYoungPerMin\":{\"type\":\"long\"},"
            + "\"gcOldPerMin\":{\"type\":\"long\"},"
            + "\"value\":{\"type\":\"double\"},"
            + "\"threshold\":{\"type\":\"double\"},"
            + "\"nodes\":{\"type\":\"long\"},"
            + "\"dataNodes\":{\"type\":\"long\"},"
            + "\"indices\":{\"type\":\"long\"},"
            + "\"shards\":{\"type\":\"long\"},"
            + "\"primaryShards\":{\"type\":\"long\"},"
            + "\"nodesMissing\":{\"type\":\"long\"},"
            + "\"unassigned\":{\"type\":\"long\"},"
            + "\"writeRejected\":{\"type\":\"long\"},"
            + "\"searchRejected\":{\"type\":\"long\"},"
            + "\"searchLatencyMs\":{\"type\":\"double\"},"
            + "\"indexingLatencyMs\":{\"type\":\"double\"},"
            + "\"load1m\":{\"type\":\"double\"},"
            + "\"diskReadKbS\":{\"type\":\"double\"},"
            + "\"diskWriteKbS\":{\"type\":\"double\"},"
            + "\"diskReadIops\":{\"type\":\"double\"},"
            + "\"diskWriteIops\":{\"type\":\"double\"},"
            + "\"tpSearchActive\":{\"type\":\"long\"},"
            + "\"tpSearchQueue\":{\"type\":\"long\"},"
            + "\"netRxKbS\":{\"type\":\"double\"},"
            + "\"netTxKbS\":{\"type\":\"double\"},"
            + "\"snapshotFailed\":{\"type\":\"long\"},"
            + "\"snapshotsTotal\":{\"type\":\"long\"},"
            + "\"snapshotFailedDelta\":{\"type\":\"long\"},"
            + "\"docsTotal\":{\"type\":\"long\"},"
            + "\"tpForceMergeActive\":{\"type\":\"long\"},"
            + "\"tpForceMergeQueue\":{\"type\":\"long\"},"
            + "\"tpForceMergeRejected\":{\"type\":\"long\"},"
            + "\"osMemUsedPct\":{\"type\":\"double\"},"
            + "\"fsAvailMb\":{\"type\":\"double\"},"
            + "\"esCpuPct\":{\"type\":\"double\"},"
            + "\"topIndexes\":{\"type\":\"object\",\"enabled\":false}"
            + "}}";

    private final ConnStore connStore;
    /** connId → 目标集群 client（装配期传 {@code router::clientFor}，测试传桩）。 */
    private final java.util.function.Function<String, RestHighLevelClient> targetClientFor;
    /** 落档目标=控制集群（控制集群 ES），与探活快照同一写入载体。 */
    private final java.util.function.Supplier<RestHighLevelClient> controlClient;
    private final String indexPrefix;
    private final int intervalSeconds;
    private final AtomicLong failureCount = new AtomicLong();
    /** connId → 上一轮计数器基线（qps/indexRate 差分用；重启即失是刻意取舍）。 */
    private final Map<String, CounterBaseline> lastCounters = new ConcurrentHashMap<>();
    /** connId → 上一轮每节点 GC 计数基线（gcYoungPerMin/gcOldPerMin 差分用，随节点集重建清理）。 */
    private final Map<String, GcBaseline> lastGcCounters = new ConcurrentHashMap<>();

    /** connId → 上一轮 SLM 累计失败快照数（ snapshotFailedDelta 差分基线）。 */
    private final Map<String, Long> lastSlmFailed = new ConcurrentHashMap<>();

    /** connId → 上一轮 per-index 计数基线（ topIndexes 速率差分，随索引集重建清理）。 */
    private final Map<String, IndexBaseline> lastIndexCounters = new ConcurrentHashMap<>();
    /** R7 告警状态机：{@code connId|metric} → 是否告警中（核心去重，重启即失同基线取舍）。 */
    private final Map<String, Boolean> alerting = new ConcurrentHashMap<>();
    private volatile String ensuredDay;
    private ScheduledExecutorService scheduler;

    public ClusterMetricsCollector(ConnStore connStore,
                                   java.util.function.Function<String, RestHighLevelClient> targetClientFor,
                                   java.util.function.Supplier<RestHighLevelClient> controlClient,
                                   String indexPrefix, int intervalSeconds) {
        this.connStore = connStore;
        this.targetClientFor = targetClientFor;
        this.controlClient = controlClient;
        this.indexPrefix = indexPrefix;
        this.intervalSeconds = (int) Math.max(MIN_INTERVAL_SECONDS, intervalSeconds);
    }

    /** 启动周期采集（AutoConfiguration 注册后手动调；守护线程）。 */
    public void start() {
        ThreadFactory tf = new ThreadFactory() {
            private final AtomicInteger n = new AtomicInteger();
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "esquerystudio-metrics-" + n.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        };
        scheduler = Executors.newSingleThreadScheduledExecutor(tf);
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                collectOnce();
            } catch (Exception e) {
                warnThrottled("指标采集轮失败", e);
            }
        }, INITIAL_DELAY_SECONDS, intervalSeconds, TimeUnit.SECONDS);
        LOG.info("[esquerystudio-metrics] started, prefix={}, intervalSeconds={}", indexPrefix, intervalSeconds);
    }

    @PreDestroy
    public void shutdown() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    /** 一轮采集：每连接 1 条 cluster doc + 每节点 1 条 node doc 落当日日期索引。包内可见=测试直调。 */
    void collectOnce() {
        List<Map<String, Object>> conns;
        try {
            conns = connStore.list();
        } catch (Exception e) {
            warnThrottled("取连接清单失败", e);
            return;
        }
        if (conns == null || conns.isEmpty()) {
            return;
        }
        String dated = ControlDailyIndex.datedIndexName(indexPrefix, System.currentTimeMillis(),
                java.time.ZoneId.systemDefault());
        for (Map<String, Object> conn : conns) {
            try {
                collectConn(conn, dated);
            } catch (Exception e) {
                /* 单连接失败只节流告警，不拦其他连接 */
                warnThrottled("采集连接指标失败 connId=" + conn.get("id"), e);
            }
        }
    }

    /**
     * 单连接采集：health+stats 两拉 → 合成 docs → 更新差分基线 → 落档；
     * 拉取失败（断链）→ 落 1 条 RED doc（无指标字段，图表断档有解释），基线不动
     * （下轮恢复时以上轮成功值差分，Δt 拉长——宁缺毋假与重启即失同一取舍），
     * <b>告警状态也不动</b>（断链轮不进阈值评估，不误报恢复）。
     */
    private void collectConn(Map<String, Object> conn, String dated) throws Exception {
        String connId = String.valueOf(conn.get("id"));
        Map<String, Object> health;
        Map<String, Object> stats;
        long ts;
        RestHighLevelClient target;
        try {
            target = targetClientFor.apply(connId);
            ts = System.currentTimeMillis();
            health = getJson(target, new Request("GET", "/_cluster/health"));
            stats = getJson(target, nodesStatsRequest());
        } catch (Exception e) {
            /* 断链照常 ensure+POST 落 RED doc；POST 再失败由外层节流告警兜住 */
            postDocs(dated, Collections.singletonList(
                    buildRedDoc(conn, rootMessage(e), System.currentTimeMillis())));
            return;
        }
        /*  G6 快照状态：_slm/stats 轻量拉取——失败/6.x 无此端点/权限不足 → 静默缺省，
           绝不反噬采集主链路（快照指标是锦上添花） */
        Map<String, Object> slm = null;
        try {
            slm = getJson(target, new Request("GET", "/_slm/stats"));
        } catch (Exception ignore) {
            /* 快照指标缺省 */
        }
        /*  索引级 Top 指标：/_stats per-index 差分（失败 → 静默缺省，绝不反噬主链路） */
        Map<String, Object> idxStats = null;
        try {
            idxStats = getJson(target, indexStatsRequest());
        } catch (Exception ignore) {
            /* 索引指标缺省 */
        }
        /*  可搜索文档总数：/_cluster/stats 轻量拉取（失败/旧版本无端点 → 静默缺省） */
        Map<String, Object> clusterStats = null;
        try {
            Request csReq = new Request("GET", "/_cluster/stats");
            csReq.addParameter("filter_path", "indices.docs.count");
            clusterStats = getJson(target, csReq);
        } catch (Exception ignore) {
            /* 文档总数缺省 */
        }
        List<Map<String, Object>> docs = new ArrayList<>();
        Map<String, Object> clusterDoc = buildClusterDoc(conn, health, stats, lastCounters.get(connId), ts);
        if (clusterStats != null) {
            Number docsTotal = numOrNull(leaf(clusterStats, "indices.docs.count"));
            if (docsTotal != null) {
                clusterDoc.put("docsTotal", docsTotal.longValue());
            }
        }
        IndexBaseline prevIdx = lastIndexCounters.get(connId);
        List<Map<String, Object>> topIndexes = buildTopIndexes(idxStats, prevIdx, ts);
        IndexBaseline newIdxBaseline = nextIndexCounters(idxStats, ts);
        if (newIdxBaseline != null) {
            lastIndexCounters.put(connId, newIdxBaseline);
        }
        if (!topIndexes.isEmpty()) {
            /* 条目附 connId——前端点击索引名可 setTarget 到来源集群再进数据浏览器 */
            for (Map<String, Object> t : topIndexes) {
                t.put("connId", connId);
            }
            clusterDoc.put("topIndexes", topIndexes);
        }
        long[] slmStats = slmStatsOf(slm);
        if (slmStats != null) {
            clusterDoc.put("snapshotFailed", slmStats[0]);
            clusterDoc.put("snapshotsTotal", slmStats[1]);
            Long slmDelta = deltaRejected(lastSlmFailed.get(connId), slmStats[0]);
            if (slmDelta != null) {
                clusterDoc.put("snapshotFailedDelta", slmDelta);
            }
            lastSlmFailed.put(connId, slmStats[0]);
        }
        docs.add(clusterDoc);
        docs.addAll(buildNodeDocs(conn, stats, ts, lastGcCounters.get(connId)));
        CounterBaseline baseline = nextBaseline(stats, ts);
        if (baseline != null) {
            lastCounters.put(connId, baseline);
        }
        GcBaseline gcBaseline = nextGcBaseline(stats, ts);
        if (gcBaseline != null) {
            lastGcCounters.put(connId, gcBaseline);
        }
        /* R7 阈值评估：状态迁移产生的告警/恢复 doc 与指标 doc 同一批走同一 ensure+POST 路径 */
        AlertEvaluation alerts = evaluateAlerts(clusterDoc, alertingKeysFor(connId));
        docs.addAll(alerts.alertDocs);
        for (String key : alerts.alertKeys) {
            alerting.put(key, Boolean.TRUE);
        }
        for (String key : alertingKeysFor(connId)) {
            if (!alerts.alertKeys.contains(key)) {
                alerting.put(key, Boolean.FALSE);
            }
        }
        postDocs(dated, docs);
    }

    /** 本连接当前告警中的状态键（{@code connId|metric}，值=TRUE）。 */
    private Set<String> alertingKeysFor(String connId) {
        Set<String> out = new LinkedHashSet<>();
        String prefix = connId + "|";
        for (Map.Entry<String, Boolean> en : alerting.entrySet()) {
            if (en.getKey().startsWith(prefix) && Boolean.TRUE.equals(en.getValue())) {
                out.add(en.getKey());
            }
        }
        return out;
    }

    /** 落档：ensure 幂等 + 逐条 POST（成功路径与断链 RED doc 同一载体）。 */
    private void postDocs(String dated, List<Map<String, Object>> docs) throws Exception {
        ensureDaily(dated);
        for (Map<String, Object> doc : docs) {
            Request req = new Request("POST", "/" + dated + "/_doc");
            req.setJsonEntity(MAPPER.writeValueAsString(doc));
            controlClient.get().getLowLevelClient().performRequest(req);
        }
    }

    /** _nodes/stats 请求（filter_path 收窄到指标所需字段，静态=测点；GC 计数为 R8 差分新增，
        耗时毫秒为 R9 慢查询代理指标新增； 节点深耕新增=load_average/fs.io_stats.total/
        thread_pool search+index 的 active 与 queue）。 */
    static Request nodesStatsRequest() {
        Request req = new Request("GET", "/_nodes/stats");
        req.addParameter("filter_path", "nodes.*.name,nodes.*.jvm.mem.heap_used_percent,nodes.*.jvm.mem.heap_used_in_bytes,"
                + "nodes.*.os.cpu.percent,nodes.*.fs.total.total_in_bytes,nodes.*.fs.total.free_in_bytes,"
                + "nodes.*.indices.docs.count,nodes.*.indices.search.query_total,"
                + "nodes.*.indices.search.query_time_in_millis,"
                + "nodes.*.indices.indexing.index_total,"
                + "nodes.*.indices.indexing.index_time_in_millis,"
                + "nodes.*.jvm.gc.collectors.young.collection_count,"
                + "nodes.*.jvm.gc.collectors.old.collection_count,"
                + "nodes.*.thread_pool.write.rejected,nodes.*.thread_pool.search.rejected,"
                + "nodes.*.indices.docs.deleted,nodes.*.indices.fielddata.memory_size_in_bytes,"
                + "nodes.*.thread_pool.write.active,nodes.*.thread_pool.write.queue,"
                + "nodes.*.os.cpu.load_average,"
                + "nodes.*.fs.io_stats.total.read_operations,nodes.*.fs.io_stats.total.write_operations,"
                + "nodes.*.fs.io_stats.total.read_kilobytes,nodes.*.fs.io_stats.total.write_kilobytes,"
                + "nodes.*.fs.io_stats.total.io_time_in_millis,"
                + "nodes.*.jvm.gc.collectors.young.collection_time_in_millis,"
                + "nodes.*.jvm.gc.collectors.old.collection_time_in_millis,"
                + "nodes.*.thread_pool.search.active,nodes.*.thread_pool.search.queue,"
                + "nodes.*.thread_pool.index.active,nodes.*.thread_pool.index.queue,"
                + "nodes.*.thread_pool.force_merge.active,nodes.*.thread_pool.force_merge.queue,nodes.*.thread_pool.force_merge.rejected,"
                + "nodes.*.os.mem.used_percent,nodes.*.fs.total.available_in_bytes,nodes.*.process.cpu.percent,"
                + "nodes.*.transport.rx_size_in_bytes,nodes.*.transport.tx_size_in_bytes");
        return req;
    }

    /**
     * cluster 指标 doc 组装（静态=测点）：契约字段名逐字固定（前端依赖）。
     * cluster 级 heap/cpu/disk 取节点均值；null/无法计算的字段静默省略。
     */
    public static Map<String, Object> buildClusterDoc(Map<String, Object> conn, Map<String, Object> health,
                                                      Map<String, Object> nodesStats, CounterBaseline last,
                                                      long ts) {
        List<Map<String, Object>> nodes = nodeMaps(nodesStats);
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("kind", "metrics");
        doc.put("scope", "cluster");
        doc.put("timestamp", ts);
        doc.put("connId", str(conn.get("id")));
        doc.put("connName", str(conn.get("name")));
        putIfNotNull(doc, "env", conn.get("env"));
        putIfNotNull(doc, "status", health == null ? null : health.get("status"));
        Double qps = perSecond(sumCounter(nodes, "indices.search.query_total"),
                last == null ? null : Long.valueOf(last.queryTotal),
                last == null ? 0L : ts - last.timestampMs);
        if (qps != null) {
            doc.put("qps", qps);
        }
        Double indexRate = perSecond(sumCounter(nodes, "indices.indexing.index_total"),
                last == null ? null : Long.valueOf(last.indexTotal),
                last == null ? 0L : ts - last.timestampMs);
        if (indexRate != null) {
            doc.put("indexRate", indexRate);
        }
        Double heap = avgLeaf(nodes, "jvm.mem.heap_used_percent");
        if (heap != null) {
            doc.put("heapUsedPct", heap);
        }
        Double cpu = avgLeaf(nodes, "os.cpu.percent");
        if (cpu != null) {
            doc.put("cpuPct", cpu);
        }
        Double disk = avgDiskPct(nodes);
        if (disk != null) {
            doc.put("diskUsedPct", disk);
        }
        putLong(doc, "nodes", health == null ? null : health.get("number_of_nodes"));
        putLong(doc, "dataNodes", health == null ? null : health.get("number_of_data_nodes"));
        putIndices(doc, health);
        putLong(doc, "shards", health == null ? null : health.get("active_shards"));
        putLong(doc, "primaryShards", health == null ? null : health.get("active_primary_shards"));
        putLong(doc, "unassigned", health == null ? null : health.get("unassigned_shards"));
        /*  失联节点数：期望节点数 − 实际报到数（告警状态机消费，>0 → WARN） */
        Long nodesMissing = nodesMissingOf(health, nodes);
        if (nodesMissing != null) {
            doc.put("nodesMissing", nodesMissing);
        }
        Long writeRejected = deltaRejected(last == null ? null : Long.valueOf(last.writeRejected),
                sumCounter(nodes, "thread_pool.write.rejected"));
        if (writeRejected != null) {
            doc.put("writeRejected", writeRejected);
        }
        Long searchRejected = deltaRejected(last == null ? null : Long.valueOf(last.searchRejected),
                sumCounter(nodes, "thread_pool.search.rejected"));
        if (searchRejected != null) {
            doc.put("searchRejected", searchRejected);
        }
        /* R9 慢查询代理指标：ms/次（Δ耗时÷Δ计数；Δ计数≤0 或首轮省略） */
        Double searchLatency = msPerOp(
                sumCounter(nodes, "indices.search.query_time_in_millis"),
                last == null ? null : Long.valueOf(last.searchTimeTotal),
                sumCounter(nodes, "indices.search.query_total"),
                last == null ? null : Long.valueOf(last.queryTotal));
        if (searchLatency != null) {
            doc.put("searchLatencyMs", searchLatency);
        }
        Double indexingLatency = msPerOp(
                sumCounter(nodes, "indices.indexing.index_time_in_millis"),
                last == null ? null : Long.valueOf(last.indexingTimeTotal),
                sumCounter(nodes, "indices.indexing.index_total"),
                last == null ? null : Long.valueOf(last.indexTotal));
        if (indexingLatency != null) {
            doc.put("indexingLatencyMs", indexingLatency);
        }
        return doc;
    }

    /** R9 耗时代理（静态=测点）：Δ耗时÷Δ次数（ms/次，一位小数）；Δ次数≤0/缺基线 → null。 */
    static Double msPerOp(Long timeCur, Long timePrev, long countCur, Long countPrev) {
        if (timeCur == null || timePrev == null || countPrev == null || countCur - countPrev <= 0) {
            return null;
        }
        return Math.round((timeCur - timePrev) * 10.0 / (countCur - countPrev)) / 10.0;
    }

    /**
     * 断链 RED doc 组装（静态=测点）：拉取失败也落 1 条 cluster doc——
     * {@code status:"red"} + {@code error}（根因消息截断 500，与探活快照同口径），
     * 无任何指标字段（图表断档由红点+错误解释，而非无声空洞）。
     */
    static Map<String, Object> buildRedDoc(Map<String, Object> conn, String error, long ts) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("kind", "metrics");
        doc.put("scope", "cluster");
        doc.put("timestamp", ts);
        doc.put("connId", str(conn.get("id")));
        doc.put("connName", str(conn.get("name")));
        putIfNotNull(doc, "env", conn.get("env"));
        doc.put("status", "red");
        /* 断链根因入档先过拓扑脱敏（992 口径）：连接失败消息内嵌的 URL/节点坐标
           不随 monitor-metrics 长留存外发；写时脱敏，存量由留存期消化。 */
        String safeError = io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper.sanitizeTopology(error);
        putIfNotNull(doc, "error", safeError != null && safeError.length() > 500
                ? safeError.substring(0, 500) : safeError);
        return doc;
    }

    /** node 指标 docs（每节点 1 条，静态=测点；无 GC 基线=首轮形态）。 */
    public static List<Map<String, Object>> buildNodeDocs(Map<String, Object> conn,
                                                          Map<String, Object> nodesStats, long ts) {
        return buildNodeDocs(conn, nodesStats, ts, null);
    }

    /**
     * node 指标 docs（每节点 1 条，静态=测点）：带上一轮 GC 计数基线时做差分落
     * {@code gcYoungPerMin}/{@code gcOldPerMin}（每节点计数差 ÷ Δt 分钟，四舍五入取整；
     * 首轮 lastGc=null、本节点无前值（新节点）、回退、Δt≤0 → 该字段省略，与 qps 同口径）。
     */
    public static List<Map<String, Object>> buildNodeDocs(Map<String, Object> conn,
                                                          Map<String, Object> nodesStats, long ts,
                                                          GcBaseline lastGc) {
        List<Map<String, Object>> docs = new ArrayList<>();
        for (Map<String, Object> node : nodeMaps(nodesStats)) {
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("kind", "metrics");
            doc.put("scope", "node");
            doc.put("timestamp", ts);
            doc.put("connId", str(conn.get("id")));
            doc.put("connName", str(conn.get("name")));
            putIfNotNull(doc, "env", conn.get("env"));
            putIfNotNull(doc, "nodeName", node.get("name"));
            Double heap = numOrNull(leaf(node, "jvm.mem.heap_used_percent"));
            if (heap != null) {
                doc.put("heapUsedPct", heap);
            }
            /*  对标阿里云「节点 Old 区使用(B)」锯齿形态：heap_used_in_bytes→MB（堆字节量锯齿可直读 GC 回收幅度） */
            Double heapBytes = numOrNull(leaf(node, "jvm.mem.heap_used_in_bytes"));
            if (heapBytes != null) {
                doc.put("heapUsedMb", Math.round(heapBytes / 1048576.0 * 10.0) / 10.0);
            }
            Double cpu = numOrNull(leaf(node, "os.cpu.percent"));
            if (cpu != null) {
                doc.put("cpuPct", cpu);
            }
            Double disk = diskPct(leaf(node, "fs.total.total_in_bytes"), leaf(node, "fs.total.free_in_bytes"));
            if (disk != null) {
                doc.put("diskUsedPct", disk);
            }
            /*  节点深耕：Load_1m 与查询线程池 active/queue（即时值，字段缺省=平台不支持，静默省略） */
            Double load1m = load1mOf(leaf(node, "os.cpu.load_average"));
            if (load1m != null) {
                doc.put("load1m", load1m);
            }
            Long tpSearchActive = counterOrNull(leaf(node, "thread_pool.search.active"));
            if (tpSearchActive != null) {
                doc.put("tpSearchActive", tpSearchActive);
            }
            Long tpSearchQueue = counterOrNull(leaf(node, "thread_pool.search.queue"));
            if (tpSearchQueue != null) {
                doc.put("tpSearchQueue", tpSearchQueue);
            }
            /*  对标阿里云线程池 Rows（写入侧）+被标记删除文档：测点型即时值（docsDeleted=force_merge 需求判定信号） */
            Long tpWriteActive = counterOrNull(leaf(node, "thread_pool.write.active"));
            if (tpWriteActive != null) {
                doc.put("tpWriteActive", tpWriteActive);
            }
            Long tpWriteQueue = counterOrNull(leaf(node, "thread_pool.write.queue"));
            if (tpWriteQueue != null) {
                doc.put("tpWriteQueue", tpWriteQueue);
            }
            /*  对标阿里云 Force Merge 线程池三件：运行/排队即时值（rejected 累积计数走差分槽 11） */
            Long tpFmActive = counterOrNull(leaf(node, "thread_pool.force_merge.active"));
            if (tpFmActive != null) {
                doc.put("tpForceMergeActive", tpFmActive);
            }
            Long tpFmQueue = counterOrNull(leaf(node, "thread_pool.force_merge.queue"));
            if (tpFmQueue != null) {
                doc.put("tpForceMergeQueue", tpFmQueue);
            }
            /*  对标阿里云「节点内存使用率_总」与「剩余可用存储空间」「CPU 双口径之 ES 业务进程」：
               OS 侧即时值（字段缺省=版本/平台不支持，静默省略） */
            Double osMem = numOrNull(leaf(node, "os.mem.used_percent"));
            if (osMem != null) {
                doc.put("osMemUsedPct", osMem);
            }
            Double fsAvail = numOrNull(leaf(node, "fs.total.available_in_bytes"));
            if (fsAvail != null) {
                doc.put("fsAvailMb", Math.round(fsAvail / 1048576.0 * 10.0) / 10.0);
            }
            Double esCpu = numOrNull(leaf(node, "process.cpu.percent"));
            if (esCpu != null) {
                doc.put("esCpuPct", esCpu);
            }
            Long docsDeleted = counterOrNull(leaf(node, "indices.docs.deleted"));
            if (docsDeleted != null) {
                doc.put("docsDeleted", docsDeleted);
            }
            /*  对标阿里云 JVM 组「fielddata 内存使用」：fielddata 超限=查询抖动经典根因 */
            Double fielddataBytes = numOrNull(leaf(node, "indices.fielddata.memory_size_in_bytes"));
            if (fielddataBytes != null) {
                doc.put("fielddataMb", Math.round(fielddataBytes / 1048576.0 * 10.0) / 10.0);
            }
            if (lastGc != null && node.get("name") != null) {
                Long[] prev = lastGc.collectors.get(String.valueOf(node.get("name")));
                Long youngPerMin = gcPerMin(counterOrNull(leaf(node, "jvm.gc.collectors.young.collection_count")),
                        prev == null ? null : prev[0], ts - lastGc.timestampMs);
                if (youngPerMin != null) {
                    doc.put("gcYoungPerMin", youngPerMin);
                }
                Long oldPerMin = gcPerMin(counterOrNull(leaf(node, "jvm.gc.collectors.old.collection_count")),
                        prev == null ? null : prev[1], ts - lastGc.timestampMs);
                if (oldPerMin != null) {
                    doc.put("gcOldPerMin", oldPerMin);
                }
                /*  磁盘 IO 差分：带宽 KiB/s + IOPS 次/秒（ 真机校准=7.10 实测字段
                   read_kilobytes/write_kilobytes/read_operations/write_operations；
                   kilobytes 已是 KiB 无需 ÷1024，非 Linux 节点缺省 → null 省略） */
                Double readKbS = opsPerSec(counterOrNull(leaf(node, "fs.io_stats.total.read_kilobytes")),
                        prev == null ? null : prev[2], ts - lastGc.timestampMs);
                if (readKbS != null) {
                    doc.put("diskReadKbS", readKbS);
                }
                Double writeKbS = opsPerSec(counterOrNull(leaf(node, "fs.io_stats.total.write_kilobytes")),
                        prev == null ? null : prev[3], ts - lastGc.timestampMs);
                if (writeKbS != null) {
                    doc.put("diskWriteKbS", writeKbS);
                }
                Double readIops = opsPerSec(counterOrNull(leaf(node, "fs.io_stats.total.read_operations")),
                        prev == null ? null : prev[4], ts - lastGc.timestampMs);
                if (readIops != null) {
                    doc.put("diskReadIops", readIops);
                }
                Double writeIops = opsPerSec(counterOrNull(leaf(node, "fs.io_stats.total.write_operations")),
                        prev == null ? null : prev[5], ts - lastGc.timestampMs);
                if (writeIops != null) {
                    doc.put("diskWriteIops", writeIops);
                }
                /*  G7 内部传输吞吐差分：transport rx/tx KiB/s（节点间通信量，非 HTTP 流量） */
                Double netRx = kbPerSec(counterOrNull(leaf(node, "transport.rx_size_in_bytes")),
                        prev == null ? null : prev[6], ts - lastGc.timestampMs);
                if (netRx != null) {
                    doc.put("netRxKbS", netRx);
                }
                Double netTx = kbPerSec(counterOrNull(leaf(node, "transport.tx_size_in_bytes")),
                        prev == null ? null : prev[7], ts - lastGc.timestampMs);
                if (netTx != null) {
                    doc.put("netTxKbS", netTx);
                }
                /*  对标阿里云 IOUtil(%) 与「节点 Young/Old GC 耗时(ms)」：io_time 占时间轴百分比
                   （钳 0~100，回退/越界省略）+每次 GC 平均耗时（Δtime÷Δcount，Δcount=0 省略） */
                Double ioUtil = pctOverMs(counterOrNull(leaf(node, "fs.io_stats.total.io_time_in_millis")),
                        prev == null ? null : prev[8], ts - lastGc.timestampMs);
                if (ioUtil != null) {
                    doc.put("ioUtilPct", ioUtil);
                }
                Long youngTime = msPerCount(counterOrNull(leaf(node, "jvm.gc.collectors.young.collection_time_in_millis")),
                        prev == null ? null : prev[9],
                        counterOrNull(leaf(node, "jvm.gc.collectors.young.collection_count")),
                        prev == null ? null : prev[0]);
                if (youngTime != null) {
                    doc.put("gcYoungTimeMs", youngTime);
                }
                Long oldTime = msPerCount(counterOrNull(leaf(node, "jvm.gc.collectors.old.collection_time_in_millis")),
                        prev == null ? null : prev[10],
                        counterOrNull(leaf(node, "jvm.gc.collectors.old.collection_count")),
                        prev == null ? null : prev[1]);
                if (oldTime != null) {
                    doc.put("gcOldTimeMs", oldTime);
                }
                /*  Force Merge 线程池拒绝增量（槽 11 差分，每轮增量次数，与集群级 deltaRejected 同口径；
                   deltaRejected 二参是 primitive long——cur 缺失先短路，防拆箱 NPE 反噬采集主链路） */
                Long fmCur = counterOrNull(leaf(node, "thread_pool.force_merge.rejected"));
                Long fmRejectedDelta = fmCur == null ? null
                        : deltaRejected(slot(prev, 11), fmCur);
                if (fmRejectedDelta != null) {
                    doc.put("tpForceMergeRejected", fmRejectedDelta);
                }
            }
            docs.add(doc);
        }
        return docs;
    }

    /**
     * 单连接上一轮计数器基线（qps/indexRate 差分 + thread_pool 拒绝增量 + R9 耗时差分共用同一基线）。
     */
    public static final class CounterBaseline {
        /** 基线时刻（毫秒 epoch）。 */
        public final long timestampMs;
        public final long queryTotal;
        public final long indexTotal;
        /** 全体节点 indices.search.query_time_in_millis 总和（R9 查询耗时光标）。 */
        public final long searchTimeTotal;
        /** 全体节点 indices.indexing.index_time_in_millis 总和（R9 索引耗时光标）。 */
        public final long indexingTimeTotal;
        /** 全体节点 thread_pool.write.rejected 总和（拒绝增量基线）。 */
        public final long writeRejected;
        /** 全体节点 thread_pool.search.rejected 总和（拒绝增量基线）。 */
        public final long searchRejected;

        /** 速率差分专用基线（耗时光标/拒绝基线置 0——仅供既有测点构造，生产路径走全参）。 */
        public CounterBaseline(long timestampMs, long queryTotal, long indexTotal) {
            this(timestampMs, queryTotal, indexTotal, 0L, 0L, 0L, 0L);
        }

        public CounterBaseline(long timestampMs, long queryTotal, long indexTotal,
                               long writeRejected, long searchRejected) {
            this(timestampMs, queryTotal, indexTotal, 0L, 0L, writeRejected, searchRejected);
        }

        public CounterBaseline(long timestampMs, long queryTotal, long indexTotal,
                               long searchTimeTotal, long indexingTimeTotal,
                               long writeRejected, long searchRejected) {
            this.timestampMs = timestampMs;
            this.queryTotal = queryTotal;
            this.indexTotal = indexTotal;
            this.searchTimeTotal = searchTimeTotal;
            this.indexingTimeTotal = indexingTimeTotal;
            this.writeRejected = writeRejected;
            this.searchRejected = searchRejected;
        }
    }

    /**
     * 单连接上一轮<b>每节点</b>计数基线（R8 GC 差分起步， 扩员磁盘 IO 差分）：随
     * {@link #nextGcBaseline} 按 当前节点集整体重建——节点下线/改名后旧键自然清理，无需额外淘汰逻辑。
     */
    public static final class GcBaseline {
        /** 基线时刻（毫秒 epoch）。 */
        public final long timestampMs;
        /**
         * nodeName → [young collection_count, old collection_count,
         * disk read_kilobytes, disk write_kilobytes, disk read_operations, disk write_operations,
         * transport rx_size_in_bytes, transport tx_size_in_bytes,
         * io_time_in_millis, young collection_time_in_millis, old collection_time_in_millis,
         * force_merge rejected]（ 扩员）；
         * null=该计数缺失，不参与差分。
         */
        public final Map<String, Long[]> collectors;

        /** 差分测点构造（与 {@link CounterBaseline} 同款：生产路径走 {@link #nextGcBaseline}）。 */
        public GcBaseline(long timestampMs, Map<String, Long[]> collectors) {
            this.timestampMs = timestampMs;
            this.collectors = collectors;
        }
    }

    /**
     * 差分速率（每秒）：首轮（无前值）/计数回退（节点重启）/Δt 非正 → null（省略）。
     * 包内可见=测点。
     */
    static Double perSecond(long current, Long previous, long dtMs) {
        if (previous == null || current < previous.longValue() || dtMs <= 0) {
            return null;
        }
        return (current - previous.longValue()) / (dtMs / 1000.0);
    }

    /** 计数器基线（stats 无节点可算 → null=不更新差分基线，防基线 0 制造下轮虚假尖峰）。 */
    static CounterBaseline nextBaseline(Map<String, Object> nodesStats, long ts) {
        List<Map<String, Object>> nodes = nodeMaps(nodesStats);
        if (nodes.isEmpty()) {
            return null;
        }
        return new CounterBaseline(ts, sumCounter(nodes, "indices.search.query_total"),
                sumCounter(nodes, "indices.indexing.index_total"),
                sumCounter(nodes, "indices.search.query_time_in_millis"),
                sumCounter(nodes, "indices.indexing.index_time_in_millis"),
                sumCounter(nodes, "thread_pool.write.rejected"),
                sumCounter(nodes, "thread_pool.search.rejected"));
    }

    /**
     * 每节点计数基线（R8 GC 差分起步， 扩员磁盘 IO 四计数，静态=测点）：按<b>当前</b>节点集
     * 重建——节点集变化时旧节点键自然清理；stats 无节点 → null=不更新；无 name 的节点无法作键，跳过；
     * 计数字段缺失记 null（不参与差分，防伪造 0）。
     */
    static GcBaseline nextGcBaseline(Map<String, Object> nodesStats, long ts) {
        List<Map<String, Object>> nodes = nodeMaps(nodesStats);
        if (nodes.isEmpty()) {
            return null;
        }
        Map<String, Long[]> collectors = new LinkedHashMap<>();
        for (Map<String, Object> node : nodes) {
            Object name = node.get("name");
            if (name == null) {
                continue;
            }
            collectors.put(String.valueOf(name), new Long[]{
                    counterOrNull(leaf(node, "jvm.gc.collectors.young.collection_count")),
                    counterOrNull(leaf(node, "jvm.gc.collectors.old.collection_count")),
                    counterOrNull(leaf(node, "fs.io_stats.total.read_kilobytes")),
                    counterOrNull(leaf(node, "fs.io_stats.total.write_kilobytes")),
                    counterOrNull(leaf(node, "fs.io_stats.total.read_operations")),
                    counterOrNull(leaf(node, "fs.io_stats.total.write_operations")),
                    counterOrNull(leaf(node, "transport.rx_size_in_bytes")),
                    counterOrNull(leaf(node, "transport.tx_size_in_bytes")),
                    /*  槽扩员：io_time_in_millis（IOUtil%）+Young/Old collection_time_in_millis（GC 耗时） */
                    counterOrNull(leaf(node, "fs.io_stats.total.io_time_in_millis")),
                    counterOrNull(leaf(node, "jvm.gc.collectors.young.collection_time_in_millis")),
                    counterOrNull(leaf(node, "jvm.gc.collectors.old.collection_time_in_millis")),
                    /*  槽 11：force_merge rejected 累积计数（tpForceMergeRejected 每轮增量差分基线） */
                    counterOrNull(leaf(node, "thread_pool.force_merge.rejected"))});
        }
        return new GcBaseline(ts, collectors);
    }

    /**
     * GC 每分钟差分（R8，静态=测点）：计数差 ÷ Δt 分钟，四舍五入取整；
     * 首轮（无前值）/计数缺失/回退（节点重启）/Δt 非正 → null（省略，与 qps 同口径）。
     */
    static Long gcPerMin(Long current, Long previous, long dtMs) {
        if (current == null || previous == null
                || current.longValue() < previous.longValue() || dtMs <= 0) {
            return null;
        }
        return Long.valueOf(Math.round((current.longValue() - previous.longValue()) / (dtMs / 60000.0)));
    }

    /**
     *  磁盘带宽差分（KiB/s，一位小数，静态=测点）：Δbytes÷Δt秒÷1024；
     * 首轮/计数缺失/回退/Δt 非正 → null（与 gcPerMin 同口径）。
     */
    static Double kbPerSec(Long current, Long previous, long dtMs) {
        if (current == null || previous == null
                || current.longValue() < previous.longValue() || dtMs <= 0) {
            return null;
        }
        return Math.round((current.longValue() - previous.longValue()) / (dtMs / 1000.0) / 1024.0 * 10.0) / 10.0;
    }

    /** IOUtil%（Δio_time_in_millis÷Δt×100，钳 0~100；缺前值/回退/越界 → null 省略）。 */
    static Double pctOverMs(Long curMs, Long prevMs, long dtMs) {
        if (curMs == null || prevMs == null || dtMs <= 0) {
            return null;
        }
        long delta = curMs - prevMs;
        if (delta < 0) {
            return null;
        }
        double util = delta / (double) dtMs * 100.0;
        if (util > 100.0) {
            return null;
        }
        return Math.round(util * 10.0) / 10.0;
    }

    /** 每次 GC 平均耗时 ms（Δtime÷Δcount；Δcount≤0（无 GC 发生）/缺前值 → null 省略）。 */
    static Long msPerCount(Long curTime, Long prevTime, Long curCount, Long prevCount) {
        if (curTime == null || prevTime == null || curCount == null || prevCount == null) {
            return null;
        }
        long dT = curTime - prevTime;
        long dC = curCount - prevCount;
        if (dC <= 0 || dT < 0) {
            return null;
        }
        return Math.round((double) dT / dC);
    }

    /**
     *  IOPS 差分（次/秒，一位小数，静态=测点）：Δoperations÷Δt秒；
     * 首轮/计数缺失/回退/Δt 非正 → null（与 gcPerMin 同口径）。
     */
    static Double opsPerSec(Long current, Long previous, long dtMs) {
        if (current == null || previous == null
                || current.longValue() < previous.longValue() || dtMs <= 0) {
            return null;
        }
        return Math.round((current.longValue() - previous.longValue()) / (dtMs / 1000.0) * 10.0) / 10.0;
    }

    /**  Load_1m（即时值）：os.cpu.load_average 的 1m 档；平台不支持/缺省 → null。 */
    static Double load1mOf(Object loadAverage) {
        if (!(loadAverage instanceof Map)) {
            return null;
        }
        Object v = ((Map<?, ?>) loadAverage).get("1m");
        return v instanceof Number ? Double.valueOf(((Number) v).doubleValue()) : null;
    }

    /**
     * thread_pool 拒绝每轮增量（集群级）：本次全体节点 rejected 总和 − 上一轮基线。
     * 首轮（无基线）/回退（节点重启计数归零→负值）→ null（省略，宁缺毋假与速率差分同一口径）；
     * 增量 0 是有效信息（无拒绝），照落。
     */
    /** 基线槽位越界安全读：短槽位基线（旧构造/新扩槽前）返回 null=不参与差分。 */
    static Long slot(Long[] prev, int i) {
        return prev != null && prev.length > i ? prev[i] : null;
    }

    static Long deltaRejected(Long previous, long current) {        if (previous == null || current < previous.longValue()) {
            return null;
        }
        return Long.valueOf(current - previous.longValue());
    }

    /**
     *  G6 SLM 统计解析（静态=测点）：取顶层 {@code total_snapshots_failed}/
     * {@code total_snapshots_taken}；响应缺省/类型不对 → null（快照指标整组省略）。
     */
    static long[] slmStatsOf(Map<String, Object> slm) {
        if (slm == null) {
            return null;
        }
        Object failed = slm.get("total_snapshots_failed");
        Object total = slm.get("total_snapshots_taken");
        if (!(failed instanceof Number) || !(total instanceof Number)) {
            return null;
        }
        return new long[]{((Number) failed).longValue(), ((Number) total).longValue()};
    }

    /**  索引 stats 请求（静态=测点）：filter_path 收窄到速率/存储所需字段。 */
    static Request indexStatsRequest() {
        Request req = new Request("GET", "/_stats");
        req.addParameter("filter_path", "indices.*.total.search.query_total,"
                + "indices.*.total.search.query_time_in_millis,"
                + "indices.*.total.indexing.index_total,"
                + "indices.*.total.indexing.index_time_in_millis,"
                + "indices.*.primaries.store.size_in_bytes");
        return req;
    }

    /**
     *  per-index 速率差分 + Top 选取（静态=测点）：每索引 查询 QPS/写入速率（计数差 ÷ Δt秒，
     * 首轮/新索引/回退/Δt≤0 → 该索引无速率不入选）；有效样本（qps&gt;0 或 idxRate&gt;0）按
     * qps+idxRate 降序取前 {@value #TOP_SNAPSHOT_LIMIT}，附 primaries 存储折 MB 与每索引
     * 查询延迟（Δquery_time ÷ Δquery_count，ms/次——读侧按 limit 再截断）。对标阿里云 Grafana Index 索引行。
     */
    static final int TOP_SNAPSHOT_LIMIT = 20;

    /** 控制面索引基础族（与 EsIndexAdmin.isControlIndexName 同源口径的静态近似）：
     * Top 业务榜单不收录控制面——监控索引自写自读会把自身刷上榜，且控制面索引名
     * 不应随 top-indexes 下发给 overview/live 页读者（ring-usage/clusterIndices 同口径）。 */
    static boolean isControlIndexLike(String name) {
        if (name == null || name.isEmpty()) {
            return true;
        }
        String n = name.toLowerCase(java.util.Locale.ROOT);
        return n.startsWith(".") || n.startsWith("esquerystudio_")
                || n.startsWith("esquerystudio_adhoc_job") || n.endsWith("_esquerystudio_lock")
                || n.endsWith("_esquerystudio_migrate_job");
    }

    static List<Map<String, Object>> buildTopIndexes(Map<String, Object> indexStats,
                                                     IndexBaseline prev, long ts) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (indexStats == null || !(indexStats.get("indices") instanceof Map)) {
            return out;
        }
        long dtMs = prev == null ? 0 : ts - prev.timestampMs;
        for (Map.Entry<?, ?> en : ((Map<?, ?>) indexStats.get("indices")).entrySet()) {
            if (!(en.getValue() instanceof Map)) {
                continue;
            }
            Map<?, ?> node = (Map<?, ?>) en.getValue();
            String name = String.valueOf(en.getKey());
            if (isControlIndexLike(name)) {
                continue;
            }
            Long qT = counterOrNull(leaf(node, "total.search.query_total"));
            Long iT = counterOrNull(leaf(node, "total.indexing.index_total"));
            Long store = counterOrNull(leaf(node, "primaries.store.size_in_bytes"));
            Long[] p = prev == null ? null : prev.counters.get(name);
            Double qps = perSecond(qT, slot(p, 0), dtMs);
            Double idxRate = perSecond(iT, slot(p, 1), dtMs);
            boolean hasRate = (qps != null && qps > 0) || (idxRate != null && idxRate > 0);
            if (!hasRate) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("index", name);
            item.put("qps", qps == null ? 0.0 : Math.round(qps * 10.0) / 10.0);
            item.put("idxRate", idxRate == null ? 0.0 : Math.round(idxRate * 10.0) / 10.0);
            item.put("storeMb", store == null ? 0.0 : Math.round(store / 1048576.0 * 10.0) / 10.0);
            /*  索引级查询延迟：Δquery_time ÷ Δquery_count（ms/次；计数 0/缺基线/回退省略——
                对标阿里云「索引端到端查询延迟」，读侧第三指标档） */
            Long qtMs = counterOrNull(leaf(node, "total.search.query_time_in_millis"));
            Long latency = msPerCount(qtMs, slot(p, 2), qT, slot(p, 0));
            if (latency != null) {
                item.put("latencyMs", latency);
            }
            out.add(item);
        }
        out.sort((a, b) -> Double.compare(
                ((Number) b.get("qps")).doubleValue() + ((Number) b.get("idxRate")).doubleValue(),
                ((Number) a.get("qps")).doubleValue() + ((Number) a.get("idxRate")).doubleValue()));
        return out.size() > TOP_SNAPSHOT_LIMIT ? new ArrayList<>(out.subList(0, TOP_SNAPSHOT_LIMIT)) : out;
    }

    /**  per-index 计数基线（静态=测点）：按当前索引集重建——旧索引键自然清理；
        stats 无索引 → null=不更新（防基线 0 制造下轮虚假尖峰）。 */
    static IndexBaseline nextIndexCounters(Map<String, Object> indexStats, long ts) {
        if (indexStats == null || !(indexStats.get("indices") instanceof Map)) {
            return null;
        }
        Map<String, Long[]> counters = new LinkedHashMap<>();
        for (Map.Entry<?, ?> en : ((Map<?, ?>) indexStats.get("indices")).entrySet()) {
            if (!(en.getValue() instanceof Map)) {
                continue;
            }
            Map<?, ?> node = (Map<?, ?>) en.getValue();
            counters.put(String.valueOf(en.getKey()), new Long[]{
                    counterOrNull(leaf(node, "total.search.query_total")),
                    counterOrNull(leaf(node, "total.indexing.index_total")),
                    /*  槽 2：query_time_in_millis（索引级查询延迟差分光标，对标阿里云端到端延迟） */
                    counterOrNull(leaf(node, "total.search.query_time_in_millis"))});
        }
        return new IndexBaseline(ts, counters);
    }

    /** 单连接上一轮 per-index 计数基线（随索引集整体重建，旧键自然清理。 */
    public static final class IndexBaseline {
        /** 基线时刻（毫秒 epoch）。 */
        public final long timestampMs;
        /** indexName → [search.query_total, indexing.index_total, search.query_time_in_millis]。 */
        public final Map<String, Long[]> counters;

        /** 差分测点构造（生产路径走 {@link #nextIndexCounters}）。 */
        public IndexBaseline(long timestampMs, Map<String, Long[]> counters) {
            this.timestampMs = timestampMs;
            this.counters = counters;
        }
    }

    /**
     *  失联节点数（静态=测点）：health.number_of_nodes（期望）− 实际报到节点数。
     * 仅 stats 拉到节点（nodes 非空）且差 ≥0 才落——stats 空档/口径异常（实到&gt;期望）宁缺毋假；
     * 差 0 是有效信息（无失联），照落（状态机恒不触发）。
     */
    static Long nodesMissingOf(Map<String, Object> health, List<Map<String, Object>> nodes) {
        if (health == null || nodes == null || nodes.isEmpty()) {
            return null;
        }
        Object expected = health.get("number_of_nodes");
        if (!(expected instanceof Number)) {
            return null;
        }
        long missing = ((Number) expected).longValue() - nodes.size();
        return missing >= 0 ? Long.valueOf(missing) : null;
    }

    /** R7 评估产物：状态迁移 docs + 评估后的告警键全集（=超限键，采集器据此重写状态）。 */
    static final class AlertEvaluation {
        /** 迁移产生的 doc（false→true 告警 / true→false 恢复；无迁移=空列表）。 */
        final List<Map<String, Object>> alertDocs;
        /** 迁移后的告警键全集（{@code connId|metric}；状态纯由当前轮评估重建）。 */
        final Set<String> alertKeys;

        AlertEvaluation(List<Map<String, Object>> alertDocs, Set<String> alertKeys) {
            this.alertDocs = alertDocs;
            this.alertKeys = alertKeys;
        }
    }

    /**
     * R7 阈值告警评估（静态=测点，签名自定、状态迁移可测）：对 cluster 指标 doc 套 4 条
     * 静态规则——heap≥80 WARN / disk≥85 WARN / health red CRIT（value 记 0）/ 拒绝增量合计
     * &gt;0 WARN（value=合计）。<b>状态机去重</b>：键={@code connId|metric}，仅 false→true
     * 写 1 条告警 doc（持续超限不重复写）、true→false 写 1 条恢复 doc
     * （{@code recovered:true, level:INFO, message:"已恢复"}）；值缺失=未超限（成功轮才评估，
     * 断链轮根本不进本方法——不误报恢复）。
     *
     * <p>alert doc 契约：{@code {kind:"alert", timestamp, connId, connName, env, level,
     * metric, value, threshold, message(≤300)[, recovered]}}。</p>
     */
    static AlertEvaluation evaluateAlerts(Map<String, Object> clusterDoc, Set<String> prevAlertKeys) {
        return evaluateAlerts(clusterDoc, prevAlertKeys, null, 0);
    }

    /**
     *  重载：结构化入参版（gcYoungPerMin=集群级 Young GC 次/分，gcYoungConsecutiveRounds=
     * 连续超限轮数）。语义同上：仅迁移沿写 doc，持续超限不重复。
     */
    static AlertEvaluation evaluateAlerts(Map<String, Object> clusterDoc, Set<String> prevAlertKeys,
                                          Double gcYoungPerMin, int gcYoungConsecutiveRounds) {
        List<Map<String, Object>> docs = new ArrayList<>();
        Set<String> keys = new LinkedHashSet<>();
        String connId = str(clusterDoc.get("connId"));
        Double heap = numOrNull(clusterDoc.get("heapUsedPct"));
        transition(docs, keys, clusterDoc, prevAlertKeys, connId, "heap",
                heap != null && heap.doubleValue() >= HEAP_WARN_THRESHOLD,
                heap == null ? 0.0 : heap.doubleValue(), HEAP_WARN_THRESHOLD, "WARN",
                heap == null ? null : "heap 使用 " + heap + "%，达到阈值 " + HEAP_WARN_THRESHOLD);
        Double disk = numOrNull(clusterDoc.get("diskUsedPct"));
        transition(docs, keys, clusterDoc, prevAlertKeys, connId, "disk",
                disk != null && disk.doubleValue() >= DISK_WARN_THRESHOLD,
                disk == null ? 0.0 : disk.doubleValue(), DISK_WARN_THRESHOLD, "WARN",
                disk == null ? null : "disk 使用 " + disk + "%，达到阈值 " + DISK_WARN_THRESHOLD);
        boolean red = "red".equals(clusterDoc.get("status"));
        transition(docs, keys, clusterDoc, prevAlertKeys, connId, "health", red,
                0.0, 0.0, "CRIT", "集群健康 red");
        long rejectedDelta = longValue(clusterDoc.get("writeRejected"))
                + longValue(clusterDoc.get("searchRejected"));
        transition(docs, keys, clusterDoc, prevAlertKeys, connId, "rejected",
                rejectedDelta > 0, rejectedDelta, REJECTED_WARN_THRESHOLD, "WARN",
                "写入/搜索拒绝增量 " + rejectedDelta + " > 0");
        Double gcYoung = gcYoungPerMin;
        transition(docs, keys, clusterDoc, prevAlertKeys, connId, "gcYoung",
                gcYoung != null && gcYoung >= GC_YOUNG_ALERT_PER_MIN && gcYoungConsecutiveRounds >= GC_YOUNG_ALERT_ROUNDS,
                gcYoung == null ? 0.0 : gcYoung.doubleValue(), GC_YOUNG_ALERT_PER_MIN, "WARN",
                gcYoung == null ? null : "Young GC " + gcYoung + " 次/分，持续 " + gcYoungConsecutiveRounds + " 轮超限");
        /*  失联节点规则：health 期望节点数 > 实到节点数 → WARN（字段缺省=不可判定，不触发） */
        Double missing = numOrNull(clusterDoc.get("nodesMissing"));
        transition(docs, keys, clusterDoc, prevAlertKeys, connId, "nodesMissing",
                missing != null && missing.doubleValue() > 0,
                missing == null ? 0.0 : missing.doubleValue(), 0, "WARN",
                missing == null ? null : "失联 " + missing.intValue() + " 个节点（期望 "
                        + clusterDoc.get("nodes") + "，实到 " + missing.intValue() + "+）");
        /*  G6 SLM 快照失败规则：新增失败（delta>0）→ WARN；delta=0（无新增）写恢复，
           字段缺省（无 SLM/拉取失败）不触发不误报恢复 */
        Double slmDelta = numOrNull(clusterDoc.get("snapshotFailedDelta"));
        transition(docs, keys, clusterDoc, prevAlertKeys, connId, "slm",
                slmDelta != null && slmDelta.doubleValue() > 0,
                slmDelta == null ? 0.0 : slmDelta.doubleValue(), 0, "WARN",
                slmDelta == null ? null : "SLM 快照新增 " + slmDelta.intValue()
                        + " 次失败（累计 " + clusterDoc.get("snapshotFailed") + "）");
        return new AlertEvaluation(docs, keys);
    }

    /**
     * 单 metric 状态迁移（去重核心）：仅 false→true 追加告警 doc、true→false 追加恢复 doc，
     * 持续超限与持续正常都不写；新状态纯由当前轮重建——超限才含键。
     */
    private static void transition(List<Map<String, Object>> docs, Set<String> keys,
                                   Map<String, Object> clusterDoc, Set<String> prevAlertKeys,
                                   String connId, String metric, boolean breached,
                                   double value, double threshold, String level, String message) {
        String key = connId + "|" + metric;
        if (breached) {
            keys.add(key);
            if (!prevAlertKeys.contains(key)) {
                docs.add(buildAlertDoc(clusterDoc, metric, level, Double.valueOf(value),
                        Double.valueOf(threshold), message, false));
            }
        } else if (prevAlertKeys.contains(key)) {
            docs.add(buildAlertDoc(clusterDoc, metric, "INFO", Double.valueOf(value),
                    Double.valueOf(threshold), "已恢复", true));
        }
    }

    /**
     * 告警/恢复 doc 组装（静态=测点）：契约字段序 kind/timestamp/connId/connName/env/level/
     * metric/value/threshold/message[/recovered]；message 截 300；recovered 仅恢复 doc 有且为 true。
     */
    static Map<String, Object> buildAlertDoc(Map<String, Object> clusterDoc, String metric, String level,
                                             Double value, Double threshold, String message,
                                             boolean recovered) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("kind", "alert");
        doc.put("timestamp", clusterDoc.get("timestamp"));
        doc.put("connId", str(clusterDoc.get("connId")));
        doc.put("connName", str(clusterDoc.get("connName")));
        putIfNotNull(doc, "env", clusterDoc.get("env"));
        doc.put("level", level);
        doc.put("metric", metric);
        doc.put("value", value);
        doc.put("threshold", threshold);
        doc.put("message", truncate(message, MAX_ALERT_MESSAGE));
        if (recovered) {
            doc.put("recovered", Boolean.TRUE);
        }
        return doc;
    }

    /** nodes.* 子 Map 列表（过滤非 Map 噪声；stats 缺 nodes 回空）。 */
    static List<Map<String, Object>> nodeMaps(Map<String, Object> nodesStats) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (nodesStats == null || !(nodesStats.get("nodes") instanceof Map)) {
            return out;
        }
        for (Object o : ((Map<?, ?>) nodesStats.get("nodes")).values()) {
            if (o instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> node = (Map<String, Object>) o;
                out.add(node);
            }
        }
        return out;
    }

    /** 点分路径取叶子；任何一环不是 Map 或缺失 → null。 */
    static Object leaf(Map<?, ?> map, String path) {
        Object cur = map;
        for (String seg : path.split("\\.")) {
            if (!(cur instanceof Map)) {
                return null;
            }
            cur = ((Map<?, ?>) cur).get(seg);
        }
        return cur;
    }

    /** 节点列表在点分路径上的数值均值（cluster 级聚合口径）；无任何数值 → null。 */
    static Double avgLeaf(List<Map<String, Object>> nodes, String path) {
        double sum = 0.0;
        int n = 0;
        for (Map<String, Object> node : nodes) {
            Double v = numOrNull(leaf(node, path));
            if (v != null) {
                sum += v;
                n++;
            }
        }
        return n == 0 ? null : sum / n;
    }

    static Double avgDiskPct(List<Map<String, Object>> nodes) {
        double sum = 0.0;
        int n = 0;
        for (Map<String, Object> node : nodes) {
            Double p = diskPct(leaf(node, "fs.total.total_in_bytes"), leaf(node, "fs.total.free_in_bytes"));
            if (p != null) {
                sum += p;
                n++;
            }
        }
        return n == 0 ? null : sum / n;
    }

    /** 磁盘占用百分比：(total-free)/total×100；输入非法（total≤0/free 越界）→ null。 */
    static Double diskPct(Object totalBytes, Object freeBytes) {
        if (!(totalBytes instanceof Number) || !(freeBytes instanceof Number)) {
            return null;
        }
        double t = ((Number) totalBytes).doubleValue();
        double f = ((Number) freeBytes).doubleValue();
        if (t <= 0 || f < 0 || f > t) {
            return null;
        }
        return (t - f) * 100.0 / t;
    }

    private static long sumCounter(List<Map<String, Object>> nodes, String path) {
        long sum = 0L;
        for (Map<String, Object> node : nodes) {
            Object v = leaf(node, path);
            if (v instanceof Number) {
                sum += ((Number) v).longValue();
            }
        }
        return sum;
    }

    private static Double numOrNull(Object v) {
        return v instanceof Number ? Double.valueOf(((Number) v).doubleValue()) : null;
    }

    /** 计数叶子 → Long（缺失/非数值 → null=不参与 GC 差分，防伪造 0）。 */
    private static Long counterOrNull(Object v) {
        return v instanceof Number ? Long.valueOf(((Number) v).longValue()) : null;
    }

    /** 数值叶子 → long（缺失=0，告警拒绝增量求和专用：键缺失即无该增量）。 */
    private static long longValue(Object v) {
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }

    /** 消息截断（告警 message 契约 ≤300）。 */
    private static String truncate(String s, int max) {
        if (s == null || s.length() <= max) {
            return s;
        }
        return s.substring(0, max);
    }

    private static void putLong(Map<String, Object> doc, String key, Object v) {
        if (v instanceof Number) {
            doc.put(key, Long.valueOf(((Number) v).longValue()));
        }
    }

    /** indices 数：health 带 level=indices 时给 Map（取 size），个别网关给 Number；都没有则省略。 */
    private static void putIndices(Map<String, Object> doc, Map<String, Object> health) {
        if (health == null) {
            return;
        }
        Object v = health.get("indices");
        if (v instanceof Map) {
            doc.put("indices", Long.valueOf(((Map<?, ?>) v).size()));
        } else if (v instanceof Number) {
            doc.put("indices", Long.valueOf(((Number) v).longValue()));
        }
    }

    private static void putIfNotNull(Map<String, Object> doc, String key, Object v) {
        if (v != null && !String.valueOf(v).isEmpty()) {
            doc.put(key, v);
        }
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Map<String, Object> getJson(RestHighLevelClient target, Request req) throws IOException {
        Response resp = target.getLowLevelClient().performRequest(req);
        return MAPPER.readValue(org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
    }

    /** cause 链最根消息（取法与 ConnHealthProber.rootMessage 一致）；无消息退类名。 */
    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
    }

    /** 惰性幂等建当日索引；失败仅节流告警，指标照写（动态映射兜底）——监控永不反噬业务。 */
    private void ensureDaily(String dated) {
        String day = dated.substring(indexPrefix.length() + 1);
        if (day.equals(ensuredDay)) {
            return;
        }
        try {
            ControlDailyIndex.ensure(controlClient.get(), dated, METRICS_MAPPING_JSON);
            ensuredDay = day;
            LOG.info("[esquerystudio-metrics] daily metrics index ready: {}", dated);
        } catch (Exception e) {
            warnThrottled("建当日指标索引失败（指标照写，动态映射兜底）", e);
        }
    }

    private void warnThrottled(String where, Exception e) {
        long failures = failureCount.incrementAndGet();
        if (failures == 1) {
            LOG.warn("[esquerystudio-metrics] {}（首次，后续失败仅累计不再打）：{}", where, e.getMessage(), e);
        }
    }
}
