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

/** 滑窗/日/月配额的纯规则：JDBC 行锁与 ES 乐观并发两条实现共用，避免两套口径漂移。 */
final class McpQuotaRules {

    static final long WINDOW_MS = 60_000L;

    private McpQuotaRules() {
    }

    /**
     * 基于当前快照计算一次调用是否放行；放行时返回「已+1」的新状态（写入 state）。
     * 拒绝时不修改 state 的计数（窗口滚动除外），retryAfter 给出建议秒数。
     */
    static McpQuotaStore.Decision decide(McpQuotaStore.State state, int rpm, long dailyQuota,
                                         long monthlyQuota, long nowMs) {
        McpQuotaStore.Decision decision = new McpQuotaStore.Decision();
        int limit = rpm > 0 ? rpm : 60;
        if (state.windowStart <= 0L || nowMs - state.windowStart >= WINDOW_MS) {
            state.windowStart = nowMs;
            state.windowCount = 0L;
        }
        String day = McpKeyRecord.todayKey(nowMs);
        if (!day.equals(state.dayKey)) {
            state.dayKey = day;
            state.dayCount = 0L;
        }
        String month = McpKeyRecord.monthKey(nowMs);
        if (!month.equals(state.monthKey)) {
            state.monthKey = month;
            state.monthCount = 0L;
        }
        if (state.windowCount >= limit) {
            decision.allowed = false;
            decision.reason = "MCP_RATE_LIMITED";
            decision.retryAfterSeconds = Math.max(1L,
                    (state.windowStart + WINDOW_MS - nowMs + 999L) / 1000L);
        } else if (dailyQuota > 0 && state.dayCount >= dailyQuota) {
            decision.allowed = false;
            decision.reason = "MCP_DAILY_QUOTA_EXCEEDED";
        } else if (monthlyQuota > 0 && state.monthCount >= monthlyQuota) {
            decision.allowed = false;
            decision.reason = "MCP_MONTHLY_QUOTA_EXCEEDED";
        } else {
            decision.allowed = true;
            state.windowCount++;
            state.dayCount++;
            state.monthCount++;
        }
        copy(state, decision.state);
        return decision;
    }

    static void copy(McpQuotaStore.State from, McpQuotaStore.State to) {
        to.windowStart = from.windowStart;
        to.windowCount = from.windowCount;
        to.dayKey = from.dayKey;
        to.dayCount = from.dayCount;
        to.monthKey = from.monthKey;
        to.monthCount = from.monthCount;
    }
}
