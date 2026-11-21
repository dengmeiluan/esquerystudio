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

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 控制台操作审计——控制集群 ES 档（抽 SPI 后的默认实现）：异步单线程落 ES 索引，
 * 队列满即丢弃（审计不反噬业务可用性）。
 *
 * <p>与重建域的 {@code RebuildAuditStore}（记录索引重建生命周期）互补：本店记录的是
 * <b>控制台人机操作</b>——登录、写操作、高危操作，供安全回溯。</p>
 *
 * <p><b>20260922 环形约定（统一只用控制集群 ES 单载体）</b>：rollover 开启时写路径按日滚动——
 * 目标索引为 {@code <前缀>-yyyy.MM.dd}（宿主本地时区日界），首笔落档前惰性幂等建当日索引
 * （显式 keyword/long mapping 契约 + {@code replicas:0} + {@code refresh_interval:30s}，
 * 6.x 目标 typed 形态重试；建失败仅节流告警、文档照写由动态映射兜底——审计不反噬）；
 * 查询目标为 {@code <前_prefix>-*} 日期通配（旧固定实体索引不带连字符、天然不被通配命中，
 * 亦不与别名同名冲突——ES 禁止别名与实体索引同名）；环形删除由
 * {@link AuditIndexRetentionSweeper} 按双闸执行。rollover 关闭时保持旧固定单索引行为。</p>
 *
 * @author aicoding
 */
public class EsConsoleOpsAuditStore implements ConsoleOpsAuditStore {

    private static final Logger LOG = LoggerFactory.getLogger(EsConsoleOpsAuditStore.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 当日索引显式 mapping（契约化）：11 keyword + 3 long——把 20260922 现网实测的
     * 动态映射偶然形态（全 keyword/long，term 语义确定）升级为索引级契约，防重建/迁移漂移。
     */
    static final String DAILY_MAPPING_JSON = "{\"properties\":{"
            + "\"timestamp\":{\"type\":\"long\"},"
            + "\"username\":{\"type\":\"keyword\"},"
            + "\"displayName\":{\"type\":\"keyword\"},"
            + "\"role\":{\"type\":\"keyword\"},"
            + "\"method\":{\"type\":\"keyword\"},"
            + "\"uri\":{\"type\":\"keyword\"},"
            + "\"action\":{\"type\":\"keyword\"},"
            + "\"httpStatus\":{\"type\":\"long\"},"
            + "\"detail\":{\"type\":\"keyword\"},"
            + "\"connId\":{\"type\":\"keyword\"},"
            + "\"connName\":{\"type\":\"keyword\"},"
            + "\"ip\":{\"type\":\"keyword\"},"
            + "\"costMs\":{\"type\":\"long\"},"
            + "\"source\":{\"type\":\"keyword\"}"
            + "}}";

    private final java.util.function.Supplier<RestHighLevelClient> client;
    /** rollover 开启时为日期索引前缀（查询打 {@code 前缀-*}），关闭时为精确索引名。 */
    private final String auditIndex;
    private final boolean rollover;
    private final ThreadPoolExecutor executor;
    /* 审计落库失败累计（首条 WARN 节流计数，见 warnAuditDrop） */
    private final AtomicLong dropCount = new AtomicLong();
    /* 环形写路径：已确保建过索引的「日」标记（单写线程内防同日重复 PUT；volatile=查询线程无涉、仅写线程读写） */
    private volatile String ensuredDay;

    public EsConsoleOpsAuditStore(java.util.function.Supplier<RestHighLevelClient> client, String auditIndex) {
        this(client, auditIndex, false);
    }

    /** @param rollover true=按日环形（快筛+双闸保留约定形态）；false=旧固定单索引行为。 */
    public EsConsoleOpsAuditStore(java.util.function.Supplier<RestHighLevelClient> client, String auditIndex,
                                  boolean rollover) {
        this.client = client;
        this.auditIndex = auditIndex;
        this.rollover = rollover;
        this.executor = new ThreadPoolExecutor(1, 1, 60, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(1000),
                r -> {
                    Thread t = new Thread(r, "esquerystudio-ops-audit");
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.DiscardPolicy());
        this.executor.allowCoreThreadTimeOut(true);
    }

    /** 上下文关停：停收新审计，队列中已提交记录自然落盘（daemon 线程不阻 JVM 退出）。 */
    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }

    /** 记一笔操作（异步，永不抛）。：唯一写入口为富事件。 */
    @Override
    public void record(ConsoleOpsAuditEvent event) {
        try {
            Map<String, Object> doc = buildDoc(event);
            String json = MAPPER.writeValueAsString(doc);
            final String target = rollover ? datedIndexName(auditIndex, System.currentTimeMillis(), ZoneId.systemDefault())
                    : auditIndex;
            executor.execute(() -> {
                try {
                    if (rollover) {
                        ensureDailyIndex(target);
                    }
                    Request req = new Request("POST", "/" + target + "/_doc");
                    req.setJsonEntity(json);
                    client.get().getLowLevelClient().performRequest(req);
                } catch (Exception e) {
                    warnAuditDrop("落审计失败", e);
                }
            });
        } catch (Exception e) {
            warnAuditDrop("构造审计失败", e);
        }
    }

    /** 事件时间 → 日期索引名（{@code 前缀-yyyy.MM.dd}）；zone 显式入参=测点可钉。 */
    static String datedIndexName(String prefix, long epochMs, ZoneId zone) {
        return io.github.dengmeiluan.esquerystudio.console.control.ControlDailyIndex.datedIndexName(prefix, epochMs, zone);
    }

    /**
     * 惰性幂等建当日索引（仅写线程调用；同日一次，volatile 标记短路）。
     * 任何失败仅节流告警、文档照写（动态映射兜底）——契约红线：审计永不反噬业务。
     */
    private void ensureDailyIndex(String datedIndex) {
        String day = datedIndex.substring(auditIndex.length() + 1);
        if (day.equals(ensuredDay)) {
            return;
        }
        try {
            io.github.dengmeiluan.esquerystudio.console.control.ControlDailyIndex.ensure(
                    client.get(), datedIndex, DAILY_MAPPING_JSON);
            ensuredDay = day;
            LOG.info("[esquerystudio-audit] daily audit index ready: {}", datedIndex);
        } catch (Exception e) {
            warnAuditDrop("建当日审计索引失败（文档照写，动态映射兜底）", e);
        }
    }

    /** 当日索引建索引体（包内可见=测点：环形索引契约形态在此锁死）。 */
    static String dailyCreateBodyJson() throws Exception {
        return io.github.dengmeiluan.esquerystudio.console.control.ControlDailyIndex.createBodyJson(DAILY_MAPPING_JSON);
    }

    /**
     * 落档文档组装（包内可见=可测）：身份/动作/所属集群（connId/connName）/ip/costMs 全维，
     * null/空串字段静默省略；timestamp 由本店 stamp（落档时刻）。source 落档恒 console
     * （宿主贡献者记录不落本店）。
     */
    static Map<String, Object> buildDoc(ConsoleOpsAuditEvent event) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("timestamp", System.currentTimeMillis());
        doc.put("username", event.getUsername());
        if (event.getDisplayName() != null && !event.getDisplayName().isEmpty()) {
            doc.put("displayName", event.getDisplayName());
        }
        doc.put("role", event.getRole());
        doc.put("method", event.getMethod());
        doc.put("uri", event.getUri());
        doc.put("action", event.getAction());
        doc.put("httpStatus", event.getHttpStatus());
        if (event.getDetail() != null && !event.getDetail().isEmpty()) {
            doc.put("detail", event.getDetail().length() > 2000 ? event.getDetail().substring(0, 2000) : event.getDetail());
        }
        if (event.getConnId() != null) {
            doc.put("connId", event.getConnId());
        }
        if (event.getConnName() != null) {
            doc.put("connName", event.getConnName());
        }
        if (event.getIp() != null) {
            doc.put("ip", event.getIp());
        }
        if (event.getCostMs() != null) {
            doc.put("costMs", event.getCostMs());
        }
        doc.put("source", "console");
        return doc;
    }

    /**
     * 审计落库失败观测——首条 WARN 留痕，此后仅累计静默（与 JDBC 档同一口径，
     * 详见 {@code JdbcConsoleOpsAuditStore#warnAuditDrop} 的形态裁决：高频可复现失败路径
     * 不逐条打，但丢审计流水首次必须留痕）。 */
    private void warnAuditDrop(String where, Exception e) {
        long drops = dropCount.incrementAndGet();
        if (drops == 1) {
            LOG.warn("[esquerystudio-audit] {}（首次，后续失败仅累计不再打）：{}", where, e.getMessage(), e);
        }
    }

    /** 审计流水查询（timestamp 倒序）——基线签名，桥入结构化查询。 */
    @Override
    public List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs) {
        return search(ConsoleOpsAuditQuery.legacy(username, action, size, from, sinceMs));
    }

    /**
     * 结构化查询（20260922 快筛批）：全维筛选落 bool.filter（非评分上下文、可被 query cache
     * 复用），rollover 开启时目标为 {@code 前缀-*} 日期通配（时间范围筛选天然只打命中日期分片；
     * 无任何日期索引时 404 → 空列表，契约同「空档返回空列表」）。
     */
    @Override
    public List<ConsoleOpsAuditEvent> search(ConsoleOpsAuditQuery query) {
        ConsoleOpsAuditQuery q = query != null ? query : ConsoleOpsAuditQuery.legacy(null, null, 100, 0, null);
        try {
            String target = rollover ? auditIndex + "-*" : auditIndex;
            String body = buildSearchBody(q);
            Request req = new Request("POST", "/" + target + "/_search");
            req.setJsonEntity(body);
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            return toEvents(raw);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>();
            }
            throw new IllegalStateException("审计查询失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("审计查询失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询体组装（包内可见=可测，变异锚：全程 filter 上下文——产物字符串不含 {@code "must"}）。
     * null/空串维度不过滤；detail kw 用 wildcard 包含匹配（{@code *kw*}，量级毫秒可忽略）。
     */
    static String buildSearchBody(ConsoleOpsAuditQuery q) throws Exception {
        List<String> filters = new ArrayList<>();
        addTerm(filters, "username", q.getUsername());
        addTerm(filters, "action", q.getAction());
        addTerm(filters, "connId", q.getConnId());
        addTerm(filters, "connName", q.getConnName());
        addTerm(filters, "role", q.getRole());
        addTerm(filters, "method", q.getMethod());
        addTerm(filters, "source", q.getSource());
        addTerm(filters, "ip", q.getIp());
        if (q.getHttpStatus() != null) {
            filters.add("{\"term\":{\"httpStatus\":" + q.getHttpStatus() + "}}");
        }
        if (q.getFromMs() != null || q.getToMs() != null) {
            StringBuilder range = new StringBuilder("{");
            if (q.getFromMs() != null) {
                range.append("\"gte\":").append(q.getFromMs());
            }
            if (q.getToMs() != null) {
                range.append(range.length() > 1 ? "," : "").append("\"lte\":").append(q.getToMs());
            }
            range.append('}');
            filters.add("{\"range\":{\"timestamp\":" + range + "}}");
        }
        if (q.getMinCostMs() != null) {
            filters.add("{\"range\":{\"costMs\":{\"gte\":" + q.getMinCostMs() + "}}}");
        }
        if (q.getUriPrefix() != null) {
            filters.add("{\"prefix\":{\"uri\":" + MAPPER.writeValueAsString(q.getUriPrefix()) + "}}");
        }
        if (q.getKw() != null) {
            String escaped = MAPPER.writeValueAsString(q.getKw()); /* 带引号 JSON 串，剥壳取转义正文 */
            filters.add("{\"wildcard\":{\"detail\":{\"value\":\"*" + escaped.substring(1, escaped.length() - 1) + "*\"}}}");
        }
        String query = filters.isEmpty()
                ? "{\"match_all\":{}}"
                : "{\"bool\":{\"filter\":[" + String.join(",", filters) + "]}}";
        return "{\"size\":" + Math.min(Math.max(q.getSize(), 1), 500)
                + ",\"from\":" + Math.max(q.getFrom(), 0)
                + ",\"sort\":[{\"timestamp\":{\"order\":\"desc\"}}],\"query\":" + query + "}";
    }

    private static void addTerm(List<String> filters, String field, String value) throws Exception {
        if (value != null && !value.isEmpty()) {
            filters.add("{\"term\":{\"" + field + "\":" + MAPPER.writeValueAsString(value) + "}}");
        }
    }

    /** ES 响应 → 类型化记录（_source 键与 {@link #buildDoc} 落档键一一对应；缺字段留空）。 */
    static List<ConsoleOpsAuditEvent> toEvents(Map<String, Object> esResponse) {
        List<ConsoleOpsAuditEvent> out = new ArrayList<>();
        if (esResponse == null || !(esResponse.get("hits") instanceof Map)) {
            return out;
        }
        Object hits = ((Map<?, ?>) esResponse.get("hits")).get("hits");
        if (!(hits instanceof List)) {
            return out;
        }
        for (Object o : (List<?>) hits) {
            if (!(o instanceof Map)) {
                continue;
            }
            Object srcObj = ((Map<?, ?>) o).get("_source");
            if (!(srcObj instanceof Map)) {
                continue;
            }
            Map<?, ?> s = (Map<?, ?>) srcObj;
            out.add(ConsoleOpsAuditEvent.builder()
                    .username(str(s.get("username")))
                    .displayName(str(s.get("displayName")))
                    .role(str(s.get("role")))
                    .method(str(s.get("method")))
                    .uri(str(s.get("uri")))
                    .action(str(s.get("action")))
                    .httpStatus(s.get("httpStatus") instanceof Number ? ((Number) s.get("httpStatus")).intValue() : 0)
                    .detail(str(s.get("detail")))
                    .connId(str(s.get("connId")))
                    .connName(str(s.get("connName")))
                    .ip(str(s.get("ip")))
                    .costMs(s.get("costMs") instanceof Number ? ((Number) s.get("costMs")).longValue() : null)
                    .source(str(s.get("source")))
                    .timestamp(s.get("timestamp") instanceof Number ? ((Number) s.get("timestamp")).longValue() : null)
                    .build());
        }
        return out;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
