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
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 多集群监控快照落库器（20260922 统一只用控制集群 ES 单载体约定）：服务端定时任务按轮把
 * 全部连接的探活快照落 {@code esquerystudio_monitor-yyyy.MM.dd} 日期索引——
 * <b>服务端调度器是唯一写入方，用户页面轮询只做读取展示、永不构成入库路径</b>
 * （多用户多页面不会造成重复落库，也不会因「没人开页面」而出现数据空洞）。
 *
 * <p><b>数据源</b>：{@link ConnHealthProber} 服务端探活每轮已产出全集群连通/时延/版本
 * （此前只存内存，重启即失）；本器按独立节奏（默认 60s，与探活解耦可调）拉取
 * 连接档案 × 最近探活结果合成快照 doc，异步落到控制集群（控制集群 ES）。</p>
 *
 * <p><b>契约</b>：与审计档同一套环形机制（{@link ControlDailyIndex}：显式 mapping +
 * {@code replicas:0} + {@code refresh_interval:30s} + 6.x typed 重试 + 建索引失败文档照写
 * 动态映射兜底）+ 同一双闸清理器管辖（审计+监控合计不超总量上限）；写失败首条 WARN 留痕
 * +计数静默——监控永不反噬业务。</p>
 *
 * @author aicoding
 */
public class MonitorSnapshotRecorder {

    private static final Logger LOG = LoggerFactory.getLogger(MonitorSnapshotRecorder.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 调度下限 10s（与 ConnHealthProber 探活下限同口径，防误配打死控制集群）。 */
    static final long MIN_INTERVAL_SECONDS = 10L;
    /** 首轮延迟 30s（让宿主/探活先完成启动）。 */
    static final long INITIAL_DELAY_SECONDS = 30L;

    /** 监控快照显式 mapping（契约化）：7 keyword + 2 long，error 截断后仍可被 kw 检索。 */
    public static final String MONITOR_MAPPING_JSON = "{\"properties\":{"
            + "\"timestamp\":{\"type\":\"long\"},"
            + "\"connId\":{\"type\":\"keyword\"},"
            + "\"connName\":{\"type\":\"keyword\"},"
            + "\"env\":{\"type\":\"keyword\"},"
            + "\"status\":{\"type\":\"keyword\"},"
            + "\"latencyMs\":{\"type\":\"long\"},"
            + "\"esVersion\":{\"type\":\"keyword\"},"
            + "\"error\":{\"type\":\"keyword\"}"
            + "}}";

    private final java.util.function.Supplier<RestHighLevelClient> client;
    /** 一轮快照供给：连接档案 × 最近探活结果 → 待落 doc 列表（装配期组装，可能抛=整轮跳过）。 */
    private final java.util.function.Supplier<List<Map<String, Object>>> snapshotProvider;
    private final String indexPrefix;
    private final int intervalSeconds;
    private final AtomicLong failureCount = new AtomicLong();
    private volatile String ensuredDay;
    private ScheduledExecutorService scheduler;

    public MonitorSnapshotRecorder(java.util.function.Supplier<RestHighLevelClient> client,
                                   java.util.function.Supplier<List<Map<String, Object>>> snapshotProvider,
                                   String indexPrefix, int intervalSeconds) {
        this.client = client;
        this.snapshotProvider = snapshotProvider;
        this.indexPrefix = indexPrefix;
        this.intervalSeconds = (int) Math.max(MIN_INTERVAL_SECONDS, intervalSeconds);
    }

    /** 启动周期落库（AutoConfiguration 注册后手动调；守护线程）。 */
    public void start() {
        ThreadFactory tf = new ThreadFactory() {
            private final AtomicInteger n = new AtomicInteger();
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "esquerystudio-monitor-" + n.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        };
        scheduler = Executors.newSingleThreadScheduledExecutor(tf);
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                recordOnce();
            } catch (Exception e) {
                warnThrottled("监控落库轮失败", e);
            }
        }, INITIAL_DELAY_SECONDS, intervalSeconds, TimeUnit.SECONDS);
        LOG.info("[esquerystudio-monitor] started, prefix={}, intervalSeconds={}", indexPrefix, intervalSeconds);
    }

    @PreDestroy
    public void shutdown() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    /** 一轮落库：每连接一条快照 doc 落当日日期索引。包内可见=测试直调。 */
    void recordOnce() {
        List<Map<String, Object>> docs;
        try {
            docs = snapshotProvider.get();
        } catch (Exception e) {
            warnThrottled("取连接快照失败", e);
            return;
        }
        if (docs == null || docs.isEmpty()) {
            return;
        }
        String dated = ControlDailyIndex.datedIndexName(indexPrefix, System.currentTimeMillis(),
                java.time.ZoneId.systemDefault());
        for (Map<String, Object> doc : docs) {
            try {
                ensureDaily(dated);
                Request req = new Request("POST", "/" + dated + "/_doc");
                req.setJsonEntity(MAPPER.writeValueAsString(doc));
                client.get().getLowLevelClient().performRequest(req);
            } catch (Exception e) {
                warnThrottled("落监控快照失败", e);
            }
        }
    }

    /** 惰性幂等建当日索引；失败仅节流告警，快照照写（动态映射兜底）——监控永不反噬业务。 */
    private void ensureDaily(String dated) {
        String day = dated.substring(indexPrefix.length() + 1);
        if (day.equals(ensuredDay)) {
            return;
        }
        try {
            ControlDailyIndex.ensure(client.get(), dated, MONITOR_MAPPING_JSON);
            ensuredDay = day;
            LOG.info("[esquerystudio-monitor] daily monitor index ready: {}", dated);
        } catch (Exception e) {
            warnThrottled("建当日监控索引失败（快照照写，动态映射兜底）", e);
        }
    }

    /**
     * 快照 doc 组装（静态=测点）：连接档案（id/name/env）× 最近探活结果
     * （status/latencyMs/error/version）。null 维度静默省略，error 截断 500 字符。
     */
    public static Map<String, Object> buildDoc(Map<String, Object> conn, Map<String, Object> health, long ts) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("timestamp", ts);
        doc.put("connId", str(conn.get("id")));
        doc.put("connName", str(conn.get("name")));
        putIfNotNull(doc, "env", conn.get("env"));
        doc.put("status", health.get("status") == null ? "UNKNOWN" : String.valueOf(health.get("status")));
        if (health.get("latencyMs") instanceof Number) {
            doc.put("latencyMs", ((Number) health.get("latencyMs")).longValue());
        }
        putIfNotNull(doc, "esVersion", health.get("version"));
        if (health.get("error") != null) {
            /* 断链根因入档先过拓扑脱敏（992 口径）：连接失败消息内嵌的 URL/节点坐标
               不随 monitor-history 长留存外发。 */
            String err = io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper.sanitizeTopology(
                    String.valueOf(health.get("error")));
            doc.put("error", err.length() > 500 ? err.substring(0, 500) : err);
        }
        return doc;
    }

    private static void putIfNotNull(Map<String, Object> doc, String key, Object v) {
        if (v != null && !String.valueOf(v).isEmpty()) {
            doc.put(key, v);
        }
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private void warnThrottled(String where, Exception e) {
        long failures = failureCount.incrementAndGet();
        if (failures == 1) {
            LOG.warn("[esquerystudio-monitor] {}（首次，后续失败仅累计不再打）：{}", where, e.getMessage(), e);
        }
    }
}
