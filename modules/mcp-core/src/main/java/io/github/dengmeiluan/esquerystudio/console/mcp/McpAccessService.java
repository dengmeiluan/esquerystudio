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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * MCP API key 的认证、固定窗口限流、日/月配额与用量计数。
 *
 * <p>装配 {@link McpQuotaStore} 时，rpm/日/月是**多实例共享的原子计数**（每次调用在
 * 共享存储里完成「检查 + 自增」）；共享存储不可用时回落进程内计数并节流告警。
 * 未装配时保持单实例语义（每 key 一把对象锁）。用量展示字段仍异步回写 key 存储。</p>
 */
public class McpAccessService {

    private static final Logger LOG = LoggerFactory.getLogger(McpAccessService.class);
    private static final long WINDOW_MS = 60_000L;

    private final McpKeyStore store;
    private final McpCallAuditStore auditStore;
    private final int auditRetentionDays;
    /** 共享配额（可选）：装配后 rpm/日/月为多实例全局口径；不装配为单实例进程内计数。 */
    private final McpQuotaStore quotaStore;
    private final AtomicLong usageWriteWarnAt = new AtomicLong(0L);
    private final AtomicLong quotaFallbackWarnAt = new AtomicLong(0L);
    private final AtomicLong lastAuditPruneAt = new AtomicLong(0L);

    public McpAccessService(McpKeyStore store) {
        this(store, McpCallAuditStore.noop(), 30, null);
    }

    public McpAccessService(McpKeyStore store, McpCallAuditStore auditStore, int auditRetentionDays) {
        this(store, auditStore, auditRetentionDays, null);
    }

    public McpAccessService(McpKeyStore store, McpCallAuditStore auditStore, int auditRetentionDays,
                            McpQuotaStore quotaStore) {
        this.store = store;
        this.auditStore = auditStore == null ? McpCallAuditStore.noop() : auditStore;
        this.auditRetentionDays = Math.max(7, auditRetentionDays);
        this.quotaStore = quotaStore;
    }

    /** 审计保留天数（UI 展示口径，最低 7 天）。 */
    public int auditRetentionDays() {
        return auditRetentionDays;
    }

    public McpKeyRecord authenticate(String secret) {
        McpKeyRecord record = store.authenticate(secret);
        long now = System.currentTimeMillis();
        if (record == null) {
            throw new McpAccessException(401, "INVALID_MCP_KEY", "无效的 MCP API key");
        }
        if (!record.enabled) {
            throw new McpAccessException(401, "MCP_KEY_REVOKED", "该 MCP API key 已撤销").withKeyPrefix(record.prefix);
        }
        if (record.expired(now)) {
            throw new McpAccessException(401, "MCP_KEY_EXPIRED", "该 MCP API key 已过期").withKeyPrefix(record.prefix);
        }
        return record;
    }

    /** 在真正执行工具前扣减窗口/日/月配额；超限抛 429。 */
    public void consume(McpKeyRecord record) {
        consume(record, null);
    }

    /** 带工具名的消费：同时累计按工具计费/用量计数。 */
    public void consume(McpKeyRecord record, String toolName) {
        if (record == null) return;
        long now = System.currentTimeMillis();
        int rpm = record.requestsPerMinute > 0 ? record.requestsPerMinute : 60;
        long daily = record.dailyQuota;
        long monthly = record.monthlyQuota;

        if (quotaStore != null) {
            McpQuotaStore.Decision shared = null;
            try {
                shared = quotaStore.consume(record.id, rpm, daily, monthly, now);
            } catch (RuntimeException e) {
                /* 共享存储抖动：回落单实例计数（可用性优先），节流告警，绝不静默放大配额口径。 */
                long last = quotaFallbackWarnAt.get();
                if (now - last > 60_000L && quotaFallbackWarnAt.compareAndSet(last, now)) {
                    LOG.warn("[mcp] 共享配额不可用，已回落单实例计数（60s 内不再重复）：{}", e.getMessage(), e);
                }
            }
            if (shared != null) {
                if (!shared.allowed) throw denial(rpm, daily, monthly, shared);
                synchronized (record) {
                    record.windowStart = shared.state.windowStart;
                    record.windowCount = (int) Math.min(Integer.MAX_VALUE, shared.state.windowCount);
                    record.dayKey = shared.state.dayKey;
                    record.dayCount = shared.state.dayCount;
                    record.monthKey = shared.state.monthKey;
                    record.monthCount = shared.state.monthCount;
                    bumpDisplay(record, toolName, now);
                }
                persist(record);
                return;
            }
        }

        synchronized (record) {
            if (record.windowStart <= 0L || now - record.windowStart >= WINDOW_MS) {
                record.windowStart = now;
                record.windowCount = 0;
            }
            if (record.windowCount >= rpm) {
                long retry = Math.max(1L, (record.windowStart + WINDOW_MS - now + 999L) / 1000L);
                throw new McpAccessException(429, "MCP_RATE_LIMITED",
                        "该 key 的请求频率超过 " + rpm + " 次/分钟", retry);
            }

            String day = McpKeyRecord.todayKey(now);
            if (!day.equals(record.dayKey)) {
                record.dayKey = day;
                record.dayCount = 0L;
            }
            if (daily > 0 && record.dayCount >= daily) {
                throw new McpAccessException(429, "MCP_DAILY_QUOTA_EXCEEDED",
                        "该 key 今日请求次数已达上限 " + daily);
            }
            String month = McpKeyRecord.monthKey(now);
            if (!month.equals(record.monthKey)) {
                record.monthKey = month;
                record.monthCount = 0L;
            }
            if (monthly > 0 && record.monthCount >= monthly) {
                throw new McpAccessException(429, "MCP_MONTHLY_QUOTA_EXCEEDED",
                        "该 key 本月请求次数已达上限 " + monthly);
            }

            record.windowCount++;
            record.dayCount++;
            record.monthCount++;
            bumpDisplay(record, toolName, now);
        }
        persist(record);
    }

    /** 展示口径计数（请求总数/最近使用/按日与按工具账本）——与配额口径分开维护。 */
    private void bumpDisplay(McpKeyRecord record, String toolName, long now) {
        record.requestCount++;
        record.lastUsedAt = now;
        if (record.dailyCounts == null) record.dailyCounts = new java.util.LinkedHashMap<>();
        Long dayBefore = record.dailyCounts.get(record.dayKey);
        record.dailyCounts.put(record.dayKey, dayBefore == null ? 1L : dayBefore + 1L);
        String cutoff = McpKeyRecord.todayKey(now - 31L * 24 * 60 * 60 * 1000);
        record.dailyCounts.keySet().removeIf(key -> key.compareTo(cutoff) < 0);
        if (toolName != null && !toolName.trim().isEmpty()) {
            String tool = toolName.trim();
            record.lastTool = tool;
            if (record.toolCounts == null) record.toolCounts = new java.util.LinkedHashMap<>();
            Long current = record.toolCounts.get(tool);
            record.toolCounts.put(tool, current == null ? 1L : current + 1L);
        }
    }

    /** 共享配额的拒绝 → 与进程内路径逐字一致的结构化 429。 */
    private static McpAccessException denial(int rpm, long dailyQuota, long monthlyQuota,
                                             McpQuotaStore.Decision shared) {
        switch (String.valueOf(shared.reason)) {
            case "MCP_RATE_LIMITED":
                return new McpAccessException(429, "MCP_RATE_LIMITED",
                        "该 key 的请求频率超过 " + rpm + " 次/分钟",
                        Math.max(1L, shared.retryAfterSeconds));
            case "MCP_DAILY_QUOTA_EXCEEDED":
                return new McpAccessException(429, "MCP_DAILY_QUOTA_EXCEEDED",
                        "该 key 今日请求次数已达上限 " + dailyQuota);
            case "MCP_MONTHLY_QUOTA_EXCEEDED":
                return new McpAccessException(429, "MCP_MONTHLY_QUOTA_EXCEEDED",
                        "该 key 本月请求次数已达上限 " + monthlyQuota);
            default:
                return new McpAccessException(429, "MCP_RATE_LIMITED",
                        "该 key 已超过调用配额");
        }
    }

    /** 每次 MCP JSON-RPC 调用留档（tool/method、客户端 IP、UA、HTTP 轮廓、结果、耗时）。 */
    public void recordCall(McpKeyRecord record, String method, String tool,
                           Map<String, Object> meta, boolean ok, long durationMs) {
        if (record == null) return;
        java.util.Map<String, Object> call = new java.util.LinkedHashMap<>();
        synchronized (record) {
            if (record.recentCalls == null) record.recentCalls = new java.util.ArrayList<>();
            call.put("method", method == null ? "" : method);
            call.put("tool", tool == null || tool.trim().isEmpty() ? method : tool);
            call.put("at", System.currentTimeMillis());
            call.put("ok", ok);
            call.put("ms", Math.max(0L, durationMs));
            if (meta != null) {
                for (String field : new String[]{"requestId", "ip", "remoteIp", "ua", "http", "origin", "transport"}) {
                    Object value = meta.get(field);
                    if (value != null && !String.valueOf(value).trim().isEmpty()) call.put(field, value);
                }
            }
            record.recentCalls.add(0, call);
            if (record.recentCalls.size() > 100) {
                record.recentCalls = new java.util.ArrayList<>(record.recentCalls.subList(0, 100));
            }
        }
        persist(record);
        /* 每次调用独立落一条审计（不与 key 文档的 100 条预览混用），按时间保留。 */
        try {
            auditStore.append(record, call);
        } catch (Exception e) {
            LOG.warn("[mcp-audit] 审计写入异常（不影响本次工具执行）：{}", e.getMessage(), e);
        }
        long now = System.currentTimeMillis();
        long lastPrune = lastAuditPruneAt.get();
        if (now - lastPrune > 3_600_000L && lastAuditPruneAt.compareAndSet(lastPrune, now)) {
            try {
                auditStore.prune(now - auditRetentionDays * 86_400_000L);
            } catch (Exception e) {
                LOG.warn("[mcp-audit] 过期审计清理失败：{}", e.getMessage(), e);
            }
        }
    }

    public void recordError(McpKeyRecord record) {
        if (record == null) return;
        synchronized (record) {
            record.errorCount++;
        }
        persist(record);
    }

    private void persist(McpKeyRecord record) {
        try {
            store.updateUsage(record);
        } catch (Exception e) {
            /* 用量是增强信息：存储抖动不能把一次已经执行的查询变成失败响应。 */
            long now = System.currentTimeMillis();
            long last = usageWriteWarnAt.get();
            if (now - last > 60_000L && usageWriteWarnAt.compareAndSet(last, now)) {
                LOG.warn("[mcp] 用量回写失败（首次，60s 内不再重复）：{}", e.getMessage(), e);
            }
        }
    }
}
