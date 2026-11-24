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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.client.SdesCompat;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.search.sort.SortBuilders;
import org.elasticsearch.search.sort.SortOrder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.ElasticsearchRestTemplate;
import org.springframework.data.elasticsearch.core.IndexOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;
import org.springframework.data.elasticsearch.core.query.NativeSearchQueryBuilder;
import org.springframework.data.elasticsearch.core.query.Query;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * smart_sync 同步计划存储（spring-data-es / {@link ElasticsearchOperations}，与 {@link MigrateJobStore} 同范式）。
 *
 * <p>计划落控制集群索引 {@link PlanRecord#INDEX_NAME}：首次写入前主动建索引，写后显式
 * {@code refresh} 保读己写一致（保存后立刻可列出/执行）。容量上限 {@link #CAP}，超出按
 * {@code savedAtMs} 淘汰最旧。</p>
 *
 * <p><b>降级形态</b>：存储全程不阻断结构同步。控制集群未绑定或读写失败时，写降级为进程内副本
 * （{@link #save} 返回 false），列表读取失败只返回进程内副本并附 warning；单条读取失败且进程内
 * 也无此计划时如实报「存储读取失败」，不冒充「计划不存在」。</p>
 */
public class PlanStore implements io.github.dengmeiluan.esquerystudio.console.mcp.McpPlanStore {

    private static final Logger logger = LoggerFactory.getLogger(PlanStore.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 存储容量上限（进程内形态同上限）。 */
    public static final int CAP = 50;

    /** 计划不存在的错误文案前缀（tools/call 错误码 PLAN_NOT_FOUND 与 REST 404 的判定依据）。 */
    public static final String NOT_FOUND_PREFIX = "同步计划不存在: ";

    /** 存储读取失败、无法确认计划是否存在的错误文案前缀。 */
    public static final String UNREADABLE_PREFIX = "同步计划存储读取失败";

    /** 降级告警节流窗口：存储持续故障时窗口内只打一行，不逐条刷全栈。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    /** 按计划执行：入参是漂移门摘要（调用方给的期望值，缺省为计划保存时的摘要），返回 smart_sync 执行报告。 */
    public interface PlanRunner {
        Map<String, Object> run(String expectPlanDigest);
    }

    /** 计划列表：plans 按 savedAtMs 倒序；warning 非空表示本次读取走过降级。 */
    public static final class Listing implements io.github.dengmeiluan.esquerystudio.console.mcp.McpPlanListing {
        private final List<PlanRecord> plans;
        private final String warning;

        Listing(List<PlanRecord> plans, String warning) {
            this.plans = plans;
            this.warning = warning;
        }

        public List<PlanRecord> getPlans() { return plans; }
        public String getWarning() { return warning; }
    }

    /**
     * 进程级共享实例：REST 与 MCP 两个控制器各自构建 {@link StructureSyncService}，计划存储必须
     * 共用同一份——控制集群正常时共用索引无碍，降级形态的进程内副本才能互通。控制集群 client
     * 供给以首次创建者为准（两个控制器同源于控制集群 client）。
     */
    private static volatile PlanStore shared;

    /** 取进程级共享存储；测试如需隔离请自行 new 独立实例。 */
    public static PlanStore sharedInstance(Supplier<RestHighLevelClient> controlClient) {
        PlanStore store = shared;
        if (store != null) {
            return store;
        }
        synchronized (PlanStore.class) {
            if (shared == null) {
                shared = new PlanStore(controlClient);
            }
            return shared;
        }
    }

    /** 持久层访问面（ES 档见 {@link EsBackend}）；包内可见，测试以进程内实现替换。 */
    interface Backend {
        void save(PlanRecord record);

        /** 不存在返回 null。 */
        PlanRecord get(String planId);

        long count();

        /** 按 savedAtMs 升序（最旧在前）取前 limit 条。 */
        List<PlanRecord> listOldest(int limit);

        /** 按 savedAtMs 倒序（最新在前）取前 limit 条。 */
        List<PlanRecord> listNewest(int limit);

        void delete(String planId);

        void refresh();
    }

    private static final Comparator<PlanRecord> NEWEST_FIRST = (a, b) -> Long.compare(
            b.getSavedAtMs() == null ? Long.MIN_VALUE : b.getSavedAtMs(),
            a.getSavedAtMs() == null ? Long.MIN_VALUE : a.getSavedAtMs());

    private final Backend backend;
    /** 写失败降级的进程内副本：planId → 记录。 */
    private final Map<String, PlanRecord> memory = new LinkedHashMap<>();
    private final AtomicLong lastWarnAt = new AtomicLong();

    /** 仅进程内形态（无控制集群 client 可用）。 */
    public PlanStore() {
        this.backend = null;
    }

    /** 控制集群 client 懒解析：未绑定时取 client 即抛，由本层降级为进程内形态。 */
    public PlanStore(Supplier<RestHighLevelClient> controlClient) {
        this.backend = controlClient == null ? null : new EsBackend(controlClient);
    }

    PlanStore(Backend backend) {
        this.backend = backend;
    }

    /** 存一条计划（新建或覆盖）。返回 true=已落控制集群；false=写入失败，仅保留进程内副本。 */
    public boolean save(PlanRecord record) {
        boolean persisted = false;
        if (backend != null) {
            try {
                backend.save(record);
                persisted = true;
            } catch (Exception e) {
                warnDegraded("save", record.getPlanId(), e);
            }
        }
        synchronized (memory) {
            if (persisted) {
                memory.remove(record.getPlanId());
            } else {
                memory.put(record.getPlanId(), record.copy());
                evictMemoryOverflow();
            }
        }
        if (persisted) {
            evictOverflow();
        }
        return persisted;
    }

    /**
     * smart_sync 预览报告落计划：参数原值入档，目标索引/模式/计划摘要取报告口径，报告另存为快照。
     * 写入失败时在报告 warnings 里如实告知（计划仅存于当前进程）。
     */
    public PlanRecord savePlan(String srcConnId, String sourceIndex, String destConnId, String destIndex,
                               boolean syncAliases, String fallbackAnalyzer, boolean autoTune,
                               Map<String, Object> preview) {
        PlanRecord record = PlanRecord.of(srcConnId, sourceIndex, destConnId, destIndex,
                syncAliases, fallbackAnalyzer, autoTune, preview);
        if (!save(record)) {
            appendWarning(preview, "同步计划未能写入持久化存储，仅保留在当前进程内（服务重启后失效）");
        }
        return record;
    }

    /**
     * 取计划；不存在返回 null。存储读取失败且进程内无副本时抛 IllegalStateException
     * （{@link #UNREADABLE_PREFIX} 前缀）——读不到不等于不存在。
     */
    public PlanRecord find(String planId) {
        PlanRecord local;
        synchronized (memory) {
            local = memory.get(planId);
        }
        if (local != null) {
            return local.copy();
        }
        if (backend == null) {
            return null;
        }
        try {
            return backend.get(planId);
        } catch (Exception e) {
            warnDegraded("get", planId, e);
            throw new IllegalStateException(UNREADABLE_PREFIX + "（" + rootType(e) + "）", e);
        }
    }

    /** 计划列表：持久层最新 CAP 条并入进程内副本，按 savedAtMs 倒序。 */
    public Listing list() {
        List<PlanRecord> rows = new ArrayList<>();
        String warning = null;
        if (backend != null) {
            try {
                rows.addAll(backend.listNewest(CAP));
            } catch (Exception e) {
                warnDegraded("list", null, e);
                warning = "同步计划存储读取失败，仅返回当前进程内保存的计划（" + rootType(e) + "）";
            }
        }
        Map<String, PlanRecord> merged = new LinkedHashMap<>();
        for (PlanRecord row : rows) {
            merged.put(row.getPlanId(), row);
        }
        /* 进程内副本以自身为准：写失败降级的计划只在副本里；执行记账回写失败的，副本比持久层新。 */
        synchronized (memory) {
            for (PlanRecord local : memory.values()) {
                merged.put(local.getPlanId(), local.copy());
            }
        }
        List<PlanRecord> out = new ArrayList<>(merged.values());
        out.sort(NEWEST_FIRST);
        if (out.size() > CAP) {
            out = new ArrayList<>(out.subList(0, CAP));
        }
        return new Listing(Collections.unmodifiableList(out), warning);
    }

    /**
     * 按计划执行。漂移门摘要取 {@code expectPlanDigest}，缺省用计划保存时的 {@code planDigest}；
     * 漂移与否由执行方按 smart_sync apply 的同一条漂移门裁决（不一致抛 IllegalStateException
     * 「计划摘要不匹配，拒绝执行」，此处原样上抛、不回写）。计划既无保存摘要、调用方也未给期望值时
     * 拒绝执行（IllegalArgumentException）。执行成功（verdict=APPLIED）才回写
     * {@code appliedAtMs} / {@code appliedCount}。返回执行报告并回显 {@code planId}。
     */
    public Map<String, Object> apply(PlanRecord plan, String expectPlanDigest, PlanRunner runner) {
        String expected = expectPlanDigest == null || expectPlanDigest.trim().isEmpty()
                ? plan.getPlanDigest() : expectPlanDigest.trim();
        if (expected == null || expected.isEmpty()) {
            /* 没有基准摘要就没有漂移门：写动作不得无门执行。 */
            throw new IllegalArgumentException("同步计划缺少计划摘要，无法校验漂移: " + plan.getPlanId());
        }
        Map<String, Object> report = new LinkedHashMap<>(runner.run(expected));
        if (Boolean.TRUE.equals(report.get("applied")) || "APPLIED".equals(report.get("verdict"))) {
            if (!markApplied(plan.getPlanId())) {
                appendWarning(report, "同步计划已执行，但执行次数未能写回存储");
            }
        }
        report.put("planId", plan.getPlanId());
        return report;
    }

    /** Port form used by the shared MCP core; adapts the neutral runner to the console runner. */
    @Override
    public Map<String, Object> applyWithDigest(PlanRecord plan, String expectPlanDigest,
                                               io.github.dengmeiluan.esquerystudio.console.mcp.McpPlanRunner runner) {
        return apply(plan, expectPlanDigest, (PlanRunner) gate -> runner.run(gate));
    }

    private boolean markApplied(String planId) {
        try {
            PlanRecord latest = find(planId);
            if (latest == null) {
                return false;
            }
            latest.setAppliedAtMs(System.currentTimeMillis());
            latest.setAppliedCount(latest.getAppliedCount() == null ? 1 : latest.getAppliedCount() + 1);
            return save(latest);
        } catch (RuntimeException e) {
            warnDegraded("markApplied", planId, e);
            return false;
        }
    }

    /** 持久层超限时淘汰最旧的计划；淘汰失败只告警（新计划本身已落盘）。 */
    private void evictOverflow() {
        try {
            long total = backend.count();
            if (total <= CAP) {
                return;
            }
            int overflow = (int) Math.min(total - CAP, 1000L);
            for (PlanRecord oldest : backend.listOldest(overflow)) {
                backend.delete(oldest.getPlanId());
                logger.info("[PlanStore] evict oldest plan {} (cap {})", oldest.getPlanId(), CAP);
            }
            backend.refresh();
        } catch (Exception e) {
            warnDegraded("evict", null, e);
        }
    }

    private void evictMemoryOverflow() {
        while (memory.size() > CAP) {
            PlanRecord oldest = null;
            for (PlanRecord record : memory.values()) {
                if (oldest == null || NEWEST_FIRST.compare(oldest, record) < 0) {
                    oldest = record;
                }
            }
            memory.remove(oldest.getPlanId());
        }
    }

    /** 预览报告整篇转 JSON（快照字段）；序列化失败如实留空并告警，不阻断计划保存。 */
    static String snapshotJson(Map<String, Object> preview) {
        try {
            return OBJECT_MAPPER.writeValueAsString(preview);
        } catch (Exception e) {
            logger.warn("[PlanStore] snapshot serialization failed, plan saved without snapshot", e);
            return null;
        }
    }

    private static void appendWarning(Map<String, Object> report, String warning) {
        List<Object> merged = new ArrayList<>();
        if (report.get("warnings") instanceof List) {
            merged.addAll((List<?>) report.get("warnings"));
        }
        merged.add(warning);
        report.put("warnings", merged);
    }

    /** 节流告警：窗口内首条带全栈，其余只带根因类型名。 */
    private void warnDegraded(String operation, String planId, Exception e) {
        long now = System.currentTimeMillis();
        long last = lastWarnAt.get();
        if (now - last > WARN_THROTTLE_MS && lastWarnAt.compareAndSet(last, now)) {
            logger.warn("[PlanStore] {} failed, fall back to in-process plans planId={}", operation, planId, e);
        } else {
            logger.warn("[PlanStore] {} failed, fall back to in-process plans planId={} ({})",
                    operation, planId, rootType(e));
        }
    }

    /** 最深根因的类型名（不含消息：客户端报错常内嵌集群地址，不随响应外泄）。 */
    private static String rootType(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        String name = t.getClass().getSimpleName();
        return name == null || name.isEmpty() ? t.getClass().getName() : name;
    }

    /**
     * ES 档：控制集群 client 懒解析，模板按当前 client 构建（控制集群重绑后随新 client 重建）。
     * 索引不存在时读面按「空」处理——从未保存过计划不算读取失败。
     */
    static final class EsBackend implements Backend {
        private final Supplier<RestHighLevelClient> client;
        private final IndexCoordinates coordinates = IndexCoordinates.of(PlanRecord.INDEX_NAME);
        private volatile ElasticsearchOperations operations;
        private volatile RestHighLevelClient boundClient;
        /** 本进程已确认索引存在。 */
        private volatile boolean indexPresent;

        EsBackend(Supplier<RestHighLevelClient> client) {
            this.client = client;
        }

        @Override
        public synchronized void save(PlanRecord record) {
            ensureIndex();
            operations().save(record, coordinates);
            /* refresh 走 indexOps(coordinates)（两版 spring-data-es 签名相同，见 MigrateJobStore#save）。 */
            operations().indexOps(coordinates).refresh();
        }

        @Override
        public PlanRecord get(String planId) {
            if (!indexExists()) {
                return null;
            }
            return operations().get(planId, PlanRecord.class, coordinates);
        }

        @Override
        public long count() {
            if (!indexExists()) {
                return 0L;
            }
            return search(SortOrder.DESC, 1).getTotalHits();
        }

        @Override
        public List<PlanRecord> listOldest(int limit) {
            return hits(search(SortOrder.ASC, limit));
        }

        @Override
        public List<PlanRecord> listNewest(int limit) {
            return hits(search(SortOrder.DESC, limit));
        }

        @Override
        public void delete(String planId) {
            operations().delete(planId, coordinates);
        }

        @Override
        public void refresh() {
            operations().indexOps(coordinates).refresh();
        }

        private SearchHits<PlanRecord> search(SortOrder order, int limit) {
            if (!indexExists()) {
                return null;
            }
            /* withPageable 在 sdes 4.4.x 上移到 BaseQueryBuilder 并返回父类型，链式接返回值会抛
               NoSuchMethodError；builder 可变、调用即生效，故拆成分步（同 MigrateJobStore#listRecent）。 */
            NativeSearchQueryBuilder builder = new NativeSearchQueryBuilder()
                    .withQuery(QueryBuilders.matchAllQuery())
                    .withSort(SortBuilders.fieldSort("savedAtMs").order(order));
            SdesCompat.withPageable(builder, PageRequest.of(0, Math.max(1, limit)));
            Query query = builder.build();
            return operations().search(query, PlanRecord.class, coordinates);
        }

        private static List<PlanRecord> hits(SearchHits<PlanRecord> searchHits) {
            List<PlanRecord> out = new ArrayList<>();
            if (searchHits == null) {
                return out;
            }
            for (SearchHit<PlanRecord> hit : searchHits.getSearchHits()) {
                out.add(hit.getContent());
            }
            return out;
        }

        /** 主动建索引（首次写入前，含显式 mapping）；失败上抛，由存储层降级并在下次写入时重试。 */
        private void ensureIndex() {
            if (indexPresent) {
                return;
            }
            IndexOperations io = operations().indexOps(coordinates);
            if (!io.exists()) {
                io.create();
                io.putMapping(io.createMapping(PlanRecord.class));
                logger.info("[PlanStore] sync plan index created: {}", coordinates.getIndexName());
            }
            indexPresent = true;
        }

        private boolean indexExists() {
            if (indexPresent) {
                return true;
            }
            indexPresent = operations().indexOps(coordinates).exists();
            return indexPresent;
        }

        private ElasticsearchOperations operations() {
            RestHighLevelClient current = client == null ? null : client.get();
            if (current == null) {
                throw new IllegalStateException("control cluster client is not available");
            }
            ElasticsearchOperations ops = operations;
            if (ops == null || boundClient != current) {
                synchronized (this) {
                    if (operations == null || boundClient != current) {
                        operations = new ElasticsearchRestTemplate(current);
                        boundClient = current;
                        indexPresent = false;
                    }
                    ops = operations;
                }
            }
            return ops;
        }
    }
}
