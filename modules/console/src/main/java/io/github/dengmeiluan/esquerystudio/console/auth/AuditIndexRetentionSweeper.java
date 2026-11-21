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
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 日期索引环形清理器（20260922 统一只用控制集群 ES 单载体约定）：对多个「{@code <前缀>-yyyy.MM.dd}」
 * 日期索引族（审计 + 监控快照，合计共用一个总量上限——对应「监控+审计 ≤30GB」原始诉求）按
 * <b>双闸</b>执行整索引删除——①超龄闸：严格早于 {@code today-maxDays} 的日期索引删；
 * ②总量闸：各族 {@code store.size} 合计超上限时从最旧日期删起（跨族按日期同轮），直至 ≤ 上限。
 *
 * <p><b>为什么自写 sweeper 不用 ILM</b>：ILM delete 阶段只按索引年龄、不按总量，
 * 「合计 ≤30GB」语义必须外部求和；且 sweeper 只需普通读写权限（不依赖 xpack
 * 模板/生命周期管理权限），与内部工具平台的最小依赖取向一致。</p>
 *
 * <p><b>安全性</b>：仅命中「前缀-日期」形态（日期段 {@code \d{4}.\d{2}.\d{2}} 校验），
 * 其余名字一律跳过绝不删——旧固定实体索引 {@code <前缀>}（不带连字符）天然不在
 * 清理面内；整索引 DELETE 为 O(1) 元数据操作，无 {@code _delete_by_query} 的
 * 段合并回收负担。调度期失败仅首条 WARN 留痕 + 计数静默（审计清理不反噬业务）。</p>
 *
 * @author aicoding
 */
public class AuditIndexRetentionSweeper {

    private static final Logger LOG = LoggerFactory.getLogger(AuditIndexRetentionSweeper.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 首轮延迟 30s（让宿主先完成启动）；之后每 6h 一轮（幂等，多跑无害）。 */
    static final long INITIAL_DELAY_SECONDS = 30L;
    static final long SWEEP_PERIOD_SECONDS = 6 * 3600L;

    static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy.MM.dd").withLocale(Locale.ROOT);

    private final java.util.function.Supplier<RestHighLevelClient> client;
    private final List<String> indexPrefixes;
    private final long maxDays;
    private final long maxTotalBytes;
    private final boolean dryRun;
    private final AtomicLong failureCount = new AtomicLong();
    private ScheduledExecutorService scheduler;

    public AuditIndexRetentionSweeper(java.util.function.Supplier<RestHighLevelClient> client,
                                      List<String> indexPrefixes,
                                      long maxDays, long maxTotalBytes, boolean dryRun) {
        this.client = client;
        this.indexPrefixes = indexPrefixes == null ? Collections.<String>emptyList() : indexPrefixes;
        this.maxDays = maxDays;
        this.maxTotalBytes = maxTotalBytes;
        this.dryRun = dryRun;
    }

    /** 启动周期清理（AutoConfiguration 注册后手动调；守护线程，JVM 退出即亡）。 */
    public void start() {
        ThreadFactory tf = new ThreadFactory() {
            private final AtomicInteger n = new AtomicInteger();
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "es-audit-retention-" + n.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        };
        scheduler = Executors.newSingleThreadScheduledExecutor(tf);
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                sweepOnce();
            } catch (Exception e) {
                warnThrottled("清理轮失败", e);
            }
        }, INITIAL_DELAY_SECONDS, SWEEP_PERIOD_SECONDS, TimeUnit.SECONDS);
        LOG.info("[esquerystudio-audit-retention] started, prefixes={}, maxDays={}, maxTotalBytes={}, dryRun={}",
                indexPrefixes, maxDays, maxTotalBytes, dryRun);
    }

    @PreDestroy
    public void shutdown() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    /** 一轮清理：列 {@code <前缀>-*} 各族日期索引 → 双闸选删（跨族合计一册账）。包内可见=测试直调。 */
    void sweepOnce() {
        List<String> toDelete = selectForDeletion(listDatedIndices(), LocalDate.now(), maxDays, maxTotalBytes);
        if (toDelete.isEmpty()) {
            return;
        }
        if (dryRun) {
            LOG.info("[esquerystudio-audit-retention] dry-run 命中待删 {} 个（不执行）: {}", toDelete.size(), toDelete);
            return;
        }
        for (String name : toDelete) {
            try {
                client.get().getLowLevelClient().performRequest(new Request("DELETE", "/" + name));
                LOG.info("[esquerystudio-audit-retention] deleted dated index: {}", name);
            } catch (Exception e) {
                warnThrottled("删除日期索引失败: " + name, e);
            }
        }
    }

    /** 列日期索引族（{@code GET /_cat/indices/<前缀1>-*,<前缀2>-*?format=json&bytes=b}），失败节流不外溢。 */
    private List<Map.Entry<String, Long>> listDatedIndices() {
        if (indexPrefixes.isEmpty()) {
            return new ArrayList<>();
        }
        StringBuilder pattern = new StringBuilder();
        for (String p : indexPrefixes) {
            if (pattern.length() > 0) {
                pattern.append(',');
            }
            pattern.append(p).append("-*");
        }
        try {
            Request req = new Request("GET", "/_cat/indices/" + pattern + "?format=json&bytes=b");
            Response resp = client.get().getLowLevelClient().performRequest(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            List<Map.Entry<String, Long>> out = new ArrayList<>();
            List<?> rows = MAPPER.readValue(body, List.class);
            for (Object o : rows) {
                if (!(o instanceof Map)) {
                    continue;
                }
                Object name = ((Map<?, ?>) o).get("index");
                Object size = ((Map<?, ?>) o).get("store.size");
                if (name == null || size == null) {
                    continue;
                }
                try {
                    out.add(new AbstractMap.SimpleEntry<>(String.valueOf(name), Long.parseLong(String.valueOf(size))));
                } catch (NumberFormatException ignored) {
                    /* 尺寸解析失败：跳过该行（宁可不删，不误删） */
                }
            }
            return out;
        } catch (Exception e) {
            warnThrottled("列日期索引失败", e);
            return new ArrayList<>();
        }
    }

    /**
     * 双闸选删（纯函数，包内可见=测点）。输入为「索引名 → store.size 字节」；
     * 返回待删全名列表（删除顺序=日期升序，同日内按输入序）。日期段解析失败的索引绝不删；
     * 同日跨族（审计+监控）各为一个删除单元，按日期同轮淘汰。
     */
    static List<String> selectForDeletion(List<Map.Entry<String, Long>> indices, LocalDate today,
                                          long maxDays, long maxTotalBytes) {
        /* dayKey(yyyy.MM.dd 字典序=时间序) → 该日全部「名/字节」条目（跨族同日多索引） */
        Map<String, List<Map.Entry<String, Long>>> byDay = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : indices) {
            String name = e.getKey();
            int i = name.lastIndexOf('-');
            if (i <= 0) {
                continue;
            }
            String day = name.substring(i + 1);
            if (!day.matches("\\d{4}\\.\\d{2}\\.\\d{2}")) {
                continue;
            }
            List<Map.Entry<String, Long>> dayEntries = byDay.get(day);
            if (dayEntries == null) {
                dayEntries = new ArrayList<>();
                byDay.put(day, dayEntries);
            }
            dayEntries.add(e);
        }
        /* 输出要按日期升序淘汰：LinkedHashMap 保插入序（=输入序），此处转 TreeMap 拿日期序 */
        TreeMap<String, List<Map.Entry<String, Long>>> ordered = new TreeMap<>(byDay);
        List<String> deletions = new ArrayList<>();
        /* ① 超龄闸：严格早于 today-maxDays 的删除（恰好第 maxDays 天仍在保留面内） */
        LocalDate cutoff = today.minusDays(maxDays);
        Iterator<Map.Entry<String, List<Map.Entry<String, Long>>>> it = ordered.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, List<Map.Entry<String, Long>>> en = it.next();
            if (LocalDate.parse(en.getKey(), DAY_FMT).isBefore(cutoff)) {
                for (Map.Entry<String, Long> e : en.getValue()) {
                    deletions.add(e.getKey());
                }
                it.remove();
            }
        }
        /* ② 总量闸：合计（跨族）超上限 → 从最旧日期整日删起，直至 ≤ 上限 */
        long total = 0;
        for (List<Map.Entry<String, Long>> dayEntries : ordered.values()) {
            for (Map.Entry<String, Long> e : dayEntries) {
                total += e.getValue();
            }
        }
        while (total > maxTotalBytes && !ordered.isEmpty()) {
            Map.Entry<String, List<Map.Entry<String, Long>>> oldest = ordered.firstEntry();
            for (Map.Entry<String, Long> e : oldest.getValue()) {
                total -= e.getValue();
                deletions.add(e.getKey());
            }
            ordered.remove(oldest.getKey());
        }
        return deletions;
    }

    /** 调度期失败观测：首条 WARN 留痕，此后仅累计静默（与审计双店 warnAuditDrop 同口径）。 */
    private void warnThrottled(String where, Exception e) {
        long failures = failureCount.incrementAndGet();
        if (failures == 1) {
            LOG.warn("[esquerystudio-audit-retention] {}（首次，后续失败仅累计不再打）：{}", where, e.getMessage(), e);
        }
    }
}
