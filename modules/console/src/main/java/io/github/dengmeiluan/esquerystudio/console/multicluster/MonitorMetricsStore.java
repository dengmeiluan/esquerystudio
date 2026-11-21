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
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 多集群指标读侧（指标时序批）：查询 {@code esquerystudio_monitor-yyyy.MM.dd} 日期索引族里
 * kind=metrics 的指标 doc（写入方={@link ClusterMetricsCollector} 服务端定时任务，本类纯只读）。
 *
 * <p>查询形态与 {@link MonitorHistoryStore} 同构，两处刻意不同：①恒定过滤
 * {@code term kind=metrics}（同一索引族里混居探活快照 doc，绝不能串味）；
 * ②timestamp <b>升序</b>（图表要时间正序，与审计/历史的 desc 不同）。
 * 全部过滤落 {@code bool.filter} 非评分上下文（变异锚=产物不含 {@code "must"}）；
 * size 钳 1..3000；空档（无任何日期索引）404 → 空列表。</p>
 *
 * <p><b>服务端聚合</b>（{@link #searchAgg}）：原始 60s 粒度拉 7 天 = 10080 点，超
 * {@link #MAX_SIZE} 钳制且 ASC 只留最旧——图表丢最新段，全错。改走 ES
 * {@code date_histogram} 服务端聚合（ 重构：by_group terms 分组〔cluster→connName/
 * node→nodeName〕+ by_time 桶化 + {@link #AGG_METRIC_FIELDS} 全指标子聚合；三值同返＝
 * 每字段平铺 {@code <field>Avg/Max/Min} + 标量别名 {@code <field>}），
 * 桶数=区间/interval 恒在钳内；桶记录字段名与原始 doc 同名同型，前端零改动兼容
 * （空桶 value=null → 键省略，前端缺值剔点已有）。timestamp 天然升序。</p>
 *
 * <p>R7 起兼读告警（{@link #searchAlerts}）：同一日期族里 kind=alert 的告警/恢复 doc，
 * 倒序供面板。</p>
 *
 * @author aicoding
 */
public class MonitorMetricsStore {

    private static final Logger LOG = LoggerFactory.getLogger(MonitorMetricsStore.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** size 上限（指标图表一屏最多 3000 点，再大由前端缩窗）。 */
    static final int MAX_SIZE = 3000;

    /** 告警面板 size 上限（一屏 100 条，更久远的历史靠时间流逝自然滚出环形）。 */
    static final int MAX_ALERT_SIZE = 100;

    private final java.util.function.Supplier<RestHighLevelClient> client;
    private final String indexPrefix;
    /* R6 环形用量只读查询失败节流计数（首条 WARN+静默，与采集器同口径） */
    private final AtomicLong usageWarnCount = new AtomicLong();

    public MonitorMetricsStore(java.util.function.Supplier<RestHighLevelClient> client, String indexPrefix) {
        this.client = client;
        this.indexPrefix = indexPrefix;
    }

    /**
     * R6 环形治理用量：审计+监控两个日期索引族 store.size 合计与分族占用（只读）。
     * failure → 节流告警 + 返回零值（治理条显示「不可用」，绝不反噬）。
     *
     * @param auditPrefix 审计日期索引前缀（监控族前缀取本店 {@code indexPrefix}）
     */
    public Map<String, Object> usage(String auditPrefix, long capBytes) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("auditPrefix", auditPrefix);
        out.put("monitorPrefix", indexPrefix);
        out.put("capBytes", capBytes);
        long audit = 0;
        long monitor = 0;
        try {
            Request req = new Request("GET", "/_cat/indices/"
                    + auditPrefix + "-*," + indexPrefix + "-*?format=json&bytes=b");
            Response resp = client.get().getLowLevelClient().performRequest(req);
            List<?> rows = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), List.class);
            for (Object o : rows) {
                if (!(o instanceof Map)) continue;
                String name = String.valueOf(((Map<?, ?>) o).get("index"));
                long size;
                try {
                    size = Long.parseLong(String.valueOf(((Map<?, ?>) o).get("store.size")));
                } catch (NumberFormatException ignore) {
                    continue;
                }
                if (name.startsWith(auditPrefix + "-")) {
                    audit += size;
                } else if (name.startsWith(indexPrefix + "-")) {
                    monitor += size;
                }
            }
        } catch (Exception e) {
            warnUsageThrottled("列环形索引族失败", e);
        }
        out.put("auditBytes", audit);
        out.put("monitorBytes", monitor);
        out.put("totalBytes", audit + monitor);
        return out;
    }

    private void warnUsageThrottled(String where, Exception e) {
        usageWarnCount.incrementAndGet();
        if (usageWarnCount.get() == 1) {
            LOG.warn("[esquerystudio-monitor] {}（首次，后续失败仅累计不再打）：{}", where, e.getMessage(), e);
        }
    }

    /**
     * 指标查询（timestamp 升序）。
     *
     * @param connId 连接过滤（null/空=不过滤）
     * @param scope  范围过滤（cluster/node，null/空=不过滤）
     * @param size   最大条数（钳制 1..3000）
     * @param from   起始偏移
     * @param fromMs 时间下界（毫秒 epoch，null=不限）
     * @param toMs   时间上界（毫秒 epoch，null=不限）
     * @return 指标 doc 列表（键与 {@link ClusterMetricsCollector} 落档键一一对应；空档回空列表）
     */
    public List<Map<String, Object>> search(String connId, String scope, int size, int from,
                                            Long fromMs, Long toMs) {
        return search(connId, null, scope, size, from, fromMs, toMs);
    }

    /**
     *  重载：connName 精确过滤——聚合模式按 connName 分组后，前端筛选下拉拿到的是
     * 实名而非 connId，历史缺陷「下拉把实名传进 connId 参数→恒空」在此根治。
     */
    public List<Map<String, Object>> search(String connId, String connName, String scope, int size, int from,
                                            Long fromMs, Long toMs) {
        try {
            String body = buildSearchBody(connId, connName, scope, size, from, fromMs, toMs);
            Request req = new Request("POST", "/" + indexPrefix + "-*/_search");
            req.setJsonEntity(body);
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            return MonitorHistoryStore.toRecords(raw);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>();
            }
            throw new IllegalStateException("监控指标查询失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("监控指标查询失败: " + e.getMessage(), e);
        }
    }

    /**
     * R7 告警读侧：查 {@code <前缀>-*} 日期族里 kind=alert 的告警/恢复 doc（写入方=
     * {@link ClusterMetricsCollector} 阈值评估，本类纯只读）。
     *
     * <p>与指标查询两处刻意不同：①恒定过滤 {@code term kind=alert}；
     * ②timestamp <b>倒序</b>（面板最新事件打头，与审计/历史同向）；size 钳 1..100；
     * 空档（无任何日期索引）404 → 空列表。</p>
     *
     * @param size 最大条数（钳制 1..100）
     * @return 告警 doc 列表（键与 {@link ClusterMetricsCollector#buildAlertDoc} 落档键一一对应）
     */
    public List<Map<String, Object>> searchAlerts(int size) {
        return searchAlerts(size, null, null);
    }

    /**
     *  时间窗重载：只取 {@code [fromMs,toMs]} 窗口内的告警/恢复 doc（图卡事件标记与
     * 可见时间域对齐用）。窗口缺省=不限。
     */
    public List<Map<String, Object>> searchAlerts(int size, Long fromMs, Long toMs) {
        try {
            Request req = new Request("POST", "/" + indexPrefix + "-*/_search");
            req.setJsonEntity(buildAlertsBody(size, fromMs, toMs));
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            return MonitorHistoryStore.toRecords(raw);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>();
            }
            throw new IllegalStateException("监控告警查询失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("监控告警查询失败: " + e.getMessage(), e);
        }
    }

    /** 告警查询体组装（包内可见=测点；变异锚：产物不含 {@code "must"}）。 */
    static String buildAlertsBody(int size) {
        return buildAlertsBody(size, null, null);
    }

    /** 告警查询体组装（时间窗重载）。 */
    static String buildAlertsBody(int size, Long fromMs, Long toMs) {
        String range = "";
        if (fromMs != null || toMs != null) {
            StringBuilder inner = new StringBuilder("{");
            if (fromMs != null) {
                inner.append("\"gte\":").append(fromMs);
            }
            if (toMs != null) {
                inner.append(inner.length() > 1 ? "," : "").append("\"lte\":").append(toMs);
            }
            inner.append('}');
            range = ",{\"range\":{\"timestamp\":" + inner + "}}";
        }
        return "{\"size\":" + Math.min(Math.max(size, 1), MAX_ALERT_SIZE)
                + ",\"sort\":[{\"timestamp\":{\"order\":\"desc\"}}]"
                + ",\"query\":{\"bool\":{\"filter\":[{\"term\":{\"kind\":\"alert\"}}" + range + "]}}}";
    }

    /** 查询体组装（包内可见=测点；变异锚：纯过滤场景产物不含 {@code "must"}）。 */
    static String buildSearchBody(String connId, String scope, int size, int from, Long fromMs, Long toMs) {
        return buildSearchBody(connId, null, scope, size, from, fromMs, toMs);
    }

    static String buildSearchBody(String connId, String connName, String scope, int size, int from,
                                  Long fromMs, Long toMs) {
        List<String> filters = new ArrayList<>();
        /* 恒定过滤：同一索引族混居探活快照 doc，指标查询绝不能串味 */
        filters.add("{\"term\":{\"kind\":\"metrics\"}}");
        try {
            if (connId != null && !connId.isEmpty()) {
                filters.add("{\"term\":{\"connId\":" + MAPPER.writeValueAsString(connId) + "}}");
            }
            if (connName != null && !connName.isEmpty()) {
                filters.add("{\"term\":{\"connName\":" + MAPPER.writeValueAsString(connName) + "}}");
            }
            if (scope != null && !scope.isEmpty()) {
                filters.add("{\"term\":{\"scope\":" + MAPPER.writeValueAsString(scope) + "}}");
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        if (fromMs != null || toMs != null) {
            StringBuilder range = new StringBuilder("{");
            if (fromMs != null) {
                range.append("\"gte\":").append(fromMs);
            }
            if (toMs != null) {
                range.append(range.length() > 1 ? "," : "").append("\"lte\":").append(toMs);
            }
            range.append('}');
            filters.add("{\"range\":{\"timestamp\":" + range + "}}");
        }
        return "{\"size\":" + Math.min(Math.max(size, 1), MAX_SIZE)
                + ",\"from\":" + Math.max(from, 0)
                + ",\"sort\":[{\"timestamp\":{\"order\":\"asc\"}}]"
                + ",\"query\":{\"bool\":{\"filter\":[" + String.join(",", filters) + "]}}}";
    }

    /**
     * 指标聚合查询（服务端 date_histogram 桶化）：修 7d 档原始查询截断缺陷
     * （60s 粒度 10080 点 &gt; 3000 钳制，ASC 只留最旧丢最新）。
     *
     * @param connId   连接过滤（null/空=不过滤）
     * @param scope    范围过滤（cluster/node，null/空=不过滤）
     * @param fromMs   时间下界（毫秒 epoch，null=不限）
     * @param toMs     时间上界（毫秒 epoch，null=不限）
     * @param interval 桶宽（形如 {@code 60s/10m/1h/1d}；合法性由 controller 正则校验后传入）
     * @return 桶记录列表（组键 connName/nodeName + timestamp=桶起点毫秒 + 全指标三值同返
     *         〔{@code <field>Avg/Max/Min} + 标量别名 {@code <field>}〕，键与原始 doc 同名同型；
     *         升序；空桶 value=null 的键省略；空档回空列表）
     */
    public List<Map<String, Object>> searchAgg(String connId, String scope,
                                               Long fromMs, Long toMs, String interval) {
        return searchAgg(connId, null, scope, fromMs, toMs, interval, "avg");
    }

    /**
     *  聚合方式重载：{@code agg}="avg"|"max"（合法性由 controller 校验后传入）——
     * 阿里云每卡聚合切换（平均值/最大值）对标：max 桶捕捉瞬时尖峰（heap 突刺等）。
     *
     * <p>三值同返：{@code agg} 仅决定<b>标量别名</b> {@code <field>} 取哪个值；
     * 每字段同时平铺 {@code <field>Avg/<field>Max/<field>Min} 三键，前端逐卡本地切三值零请求。</p>
     */
    public List<Map<String, Object>> searchAgg(String connId, String scope,
                                               Long fromMs, Long toMs, String interval, String agg) {
        return searchAgg(connId, null, scope, fromMs, toMs, interval, agg);
    }

    /**  重载：connName 精确过滤（聚合分组键=connName，前端筛选下拉传实名）。 */
    public List<Map<String, Object>> searchAgg(String connId, String connName, String scope,
                                               Long fromMs, Long toMs, String interval, String agg) {
        try {
            String body = buildAggBody(connId, connName, scope, fromMs, toMs, interval, agg);
            Request req = new Request("POST", "/" + indexPrefix + "-*/_search");
            req.setJsonEntity(body);
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            return parseAggResponse(raw, scope);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>();
            }
            throw new IllegalStateException("监控指标聚合查询失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("监控指标聚合查询失败: " + e.getMessage(), e);
        }
    }

    /**
     *  全指标聚合清单：与 {@link ClusterMetricsCollector} cluster/node doc 数值字段
     * 一一对应——此前只聚合起步期六指标，历史趋势后加的卡（拒绝/GC/耗时/节点深耕七卡）
     * 在聚合模式下恒空的历史缺陷在此根治。
     */
    static final String[] AGG_METRIC_FIELDS = {
            "qps", "indexRate", "heapUsedPct", "cpuPct", "diskUsedPct",
            "nodes", "dataNodes", "indices", "shards", "unassigned",
            "writeRejected", "searchRejected", "searchLatencyMs", "indexingLatencyMs",
            "gcYoungPerMin", "gcOldPerMin", "load1m",
            "diskReadKbS", "diskWriteKbS", "diskReadIops", "diskWriteIops",
            "tpSearchActive", "tpSearchQueue", "netRxKbS", "netTxKbS",
            "tpWriteActive", "tpWriteQueue", "docsDeleted", "fielddataMb",
            "ioUtilPct", "gcYoungTimeMs", "gcOldTimeMs", "heapUsedMb",
            "primaryShards", "nodesMissing",
            "snapshotFailed", "snapshotsTotal", "snapshotFailedDelta",
            "docsTotal", "tpForceMergeActive", "tpForceMergeQueue", "tpForceMergeRejected",
            "osMemUsedPct", "fsAvailMb", "esCpuPct"};

    /**
     * 聚合查询体组装（包内可见=测点；变异锚：纯过滤场景产物不含 {@code "must"}）。
     * filter 顺序：kind 恒定 term 打头，scope/connId 可选 term，timestamp range 收尾；
     * {@code min_doc_count:0} 空桶补齐时间轴（前端缺值剔点，不跳格）。
     *
     * <p><b> 分组重构</b>：by_group terms（scope=node → nodeName，否则 connName）
     * 打头、by_time date_histogram 内嵌——此前聚合体不分组，多集群叠加与节点下钻
     * 在聚合模式下失真（全部序列挤进「未知集群」）；桶记录组键回填 connName/nodeName，
     * 与原始 doc 键名一致，前端 buildSeries 分组零改动。</p>
     *
     * <p><b>637 三值同返（方案 C）</b>：每字段产出<b>平铺三键</b>
     * {@code <field>Avg/<field>Max/<field>Min} + <b>保留原标量别名</b> {@code <field>}
     * （= 请求 {@code agg} 对应的那个值）——老前端读 {@code <field>} 零破坏；
     * {@code AGG_METRIC_FIELDS} 键数不变（改聚合非加卡）。</p>
     */
    static String buildAggBody(String connId, String scope, Long fromMs, Long toMs, String interval) {
        return buildAggBody(connId, null, scope, fromMs, toMs, interval, "avg");
    }

    static String buildAggBody(String connId, String scope, Long fromMs, Long toMs,
                               String interval, String agg) {
        return buildAggBody(connId, null, scope, fromMs, toMs, interval, agg);
    }

    static String buildAggBody(String connId, String connName, String scope, Long fromMs, Long toMs,
                               String interval, String agg) {
        List<String> filters = new ArrayList<>();
        /* 恒定过滤：同一索引族混居探活快照 doc，指标聚合绝不能串味 */
        filters.add("{\"term\":{\"kind\":\"metrics\"}}");
        try {
            if (scope != null && !scope.isEmpty()) {
                filters.add("{\"term\":{\"scope\":" + MAPPER.writeValueAsString(scope) + "}}");
            }
            if (connId != null && !connId.isEmpty()) {
                filters.add("{\"term\":{\"connId\":" + MAPPER.writeValueAsString(connId) + "}}");
            }
            if (connName != null && !connName.isEmpty()) {
                filters.add("{\"term\":{\"connName\":" + MAPPER.writeValueAsString(connName) + "}}");
            }
            if (fromMs != null || toMs != null) {
                StringBuilder range = new StringBuilder("{");
                if (fromMs != null) {
                    range.append("\"gte\":").append(fromMs);
                }
                if (toMs != null) {
                    range.append(range.length() > 1 ? "," : "").append("\"lte\":").append(toMs);
                }
                range.append('}');
                filters.add("{\"range\":{\"timestamp\":" + range + "}}");
            }
            /* 三值同返（方案 C）：每字段平铺 <field>Avg/Max/Min 三键 + 保留标量别名 <field>
               （= 请求 agg 参数对应的那个值）——老前端读 <field> 照常工作（向后兼容零破坏），
               前端即可逐卡本地切换 avg/max/min 三值零请求放大。 */
            String aggType = "max".equals(agg) ? "max" : "avg";
            String groupField = "node".equals(scope) ? "nodeName" : "connName";
            StringBuilder metricAggs = new StringBuilder();
            for (String f : AGG_METRIC_FIELDS) {
                if (metricAggs.length() > 0) {
                    metricAggs.append(',');
                }
                metricAggs.append('"').append(f).append("Avg\":{\"avg\":{\"field\":\"").append(f).append("\"}}")
                        .append(",\"").append(f).append("Max\":{\"max\":{\"field\":\"").append(f).append("\"}}")
                        .append(",\"").append(f).append("Min\":{\"min\":{\"field\":\"").append(f).append("\"}}")
                        .append(",\"").append(f).append("\":{\"").append(aggType)
                        .append("\":{\"field\":\"").append(f).append("\"}}");
            }
            return "{\"size\":0"
                    + ",\"query\":{\"bool\":{\"filter\":[" + String.join(",", filters) + "]}}"
                    + ",\"aggs\":{\"by_group\":{\"terms\":{\"field\":\"" + groupField + "\",\"size\":30}"
                    + ",\"aggs\":{\"by_time\":{\"date_histogram\":{\"field\":\"timestamp\""
                    + ",\"fixed_interval\":" + MAPPER.writeValueAsString(interval)
                    + ",\"min_doc_count\":0}"
                    + ",\"aggs\":{" + metricAggs + "}}}}}}";
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 聚合响应 → 桶记录列表（包内可见=测点）：{@code aggregations.by_group.buckets[]} 每组
     * （key=connName/nodeName 按组键名回填记录）内 {@code by_time.buckets[]} 每桶一条
     * {timestamp=桶 key 毫秒 + 指标值}；637 三值同返＝每字段落 {@code <field>Avg/Max/Min}
     * 三键 + 标量别名 {@code <field>}；value=null（空桶）的键省略（满桶三键齐、空桶三键一并省略）；
     * 桶天然升序；无 aggregations/buckets 回空列表。
     */
    static List<Map<String, Object>> parseAggResponse(Map<String, Object> esResponse, String scope) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (esResponse == null || !(esResponse.get("aggregations") instanceof Map)) {
            return out;
        }
        Object byGroup = ((Map<?, ?>) esResponse.get("aggregations")).get("by_group");
        Object groups = byGroup instanceof Map ? ((Map<?, ?>) byGroup).get("buckets") : null;
        if (!(groups instanceof List)) {
            return out;
        }
        String groupKey = "node".equals(scope) ? "nodeName" : "connName";
        for (Object g : (List<?>) groups) {
            if (!(g instanceof Map)) {
                continue;
            }
            Map<?, ?> group = (Map<?, ?>) g;
            Object groupName = group.get("key");
            Object byTime = group.get("by_time");
            Object buckets = byTime instanceof Map ? ((Map<?, ?>) byTime).get("buckets") : null;
            if (!(buckets instanceof List)) {
                continue;
            }
            for (Object o : (List<?>) buckets) {
                if (!(o instanceof Map)) {
                    continue;
                }
                Map<?, ?> bucket = (Map<?, ?>) o;
                Map<String, Object> rec = new LinkedHashMap<>();
                if (groupName != null) {
                    rec.put(groupKey, String.valueOf(groupName));
                }
                if (bucket.get("key") instanceof Number) {
                    rec.put("timestamp", Long.valueOf(((Number) bucket.get("key")).longValue()));
                }
                for (String f : AGG_METRIC_FIELDS) {
                    /* 三值同返：满桶三键齐（<field>Avg/Max/Min）+ 标量别名 <field>；
                       空桶 value=null → 三键（含别名）一并省略（沿用 putAggValue「Number 才落键」语义） */
                    putAggValue(rec, f + "Avg", bucket);
                    putAggValue(rec, f + "Max", bucket);
                    putAggValue(rec, f + "Min", bucket);
                    putAggValue(rec, f, bucket);
                }
                out.add(rec);
            }
        }
        return out;
    }

    /** 单桶单指标：avg.value 是 Number 才落键（null=空桶省略，与原始 doc 缺字段同形态）。 */
    private static void putAggValue(Map<String, Object> rec, String name, Map<?, ?> bucket) {
        Object sub = bucket.get(name);
        Object v = sub instanceof Map ? ((Map<?, ?>) sub).get("value") : null;
        if (v instanceof Number) {
            rec.put(name, v);
        }
    }

    /**
     *  最新 Top 索引快照（可选连接过滤）：取带 topIndexes 字段的最新 cluster doc，
     * 返回其 topIndexes 数组（index/qps/idxRate/storeMb/latencyMs ×≤limit，limit 参数化+
     * 查询延迟字段）；无快照 → 空列表。
     */
    public List<Map<String, Object>> searchTopIndexes(String connName, int limit) {
        try {
            Request req = new Request("POST", "/" + indexPrefix + "-*/_search");
            req.setJsonEntity(buildTopBody(connName));
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            List<Map<String, Object>> records = MonitorHistoryStore.toRecords(raw);
            if (records.isEmpty() || !(records.get(0).get("topIndexes") instanceof List)) {
                return new ArrayList<>();
            }
            Object top = records.get(0).get("topIndexes");
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object o : (List<?>) top) {
                if (o instanceof Map) {
                    out.add((Map<String, Object>) o);
                }
            }
            return out.size() > limit ? new ArrayList<>(out.subList(0, limit)) : out;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>();
            }
            throw new IllegalStateException("Top 索引快照查询失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("Top 索引快照查询失败: " + e.getMessage(), e);
        }
    }

    /** Top 索引查询体（包内可见=测点）：最新 1 条 cluster doc 且带 topIndexes 字段。
     *   修正：过滤键用 connName（前端集群下拉持有的是实名； 同款教训不复述）。 */
    static String buildTopBody(String connName) {
        String f = "";
        if (connName != null && !connName.isEmpty()) {
            try {
                f = ",{\"term\":{\"connName\":" + MAPPER.writeValueAsString(connName) + "}}";
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
        return "{\"size\":1,\"sort\":[{\"timestamp\":{\"order\":\"desc\"}}]"
                + ",\"query\":{\"bool\":{\"filter\":[{\"term\":{\"kind\":\"metrics\"}}"
                + ",{\"term\":{\"scope\":\"cluster\"}},{\"exists\":{\"field\":\"topIndexes\"}}" + f + "]}}}";
    }
}
