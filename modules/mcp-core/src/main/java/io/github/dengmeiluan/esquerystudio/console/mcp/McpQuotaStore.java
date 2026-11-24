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

/**
 * MCP key 配额/频率的**共享原子计数** SPI（可选）。
 *
 * <p>不装配时 {@link McpAccessService} 按进程内计数（单实例语义）。装配后每次调用在
 * 共享存储里做一次原子「检查并+1」：多实例共用一把 key 时，rpm / 日 / 月配额之和
 * 不会被实例数放大。存储不可用时回落进程内计数并节流告警（可用性优先），
 * 这是显式的降级路径而不是静默放大配额。</p>
 */
public interface McpQuotaStore {

    /** 一个 key 的滑窗/日/月计数快照。 */
    final class State {
        public long windowStart;
        public long windowCount;
        public String dayKey = "";
        public long dayCount;
        public String monthKey = "";
        public long monthCount;
    }

    /** 一次原子消费的结果（拒绝时 state 是未+1 的当前快照，便于客户端看剩余）。 */
    final class Decision {
        public boolean allowed;
        /** RATE_LIMITED / DAILY_QUOTA_EXCEEDED / MONTHLY_QUOTA_EXCEEDED；允许时为 null。 */
        public String reason;
        public long retryAfterSeconds;
        public final State state = new State();
    }

    /**
     * 原子消费一次调用配额。实现必须保证并发/多实例下「检查 + 自增」不可分割。
     *
     * @param keyId          key 主键（非明文 key）
     * @param rpm            每分钟上限（&lt;=0 视为 60）
     * @param dailyQuota     每日上限（&lt;=0 不限）
     * @param monthlyQuota   每月上限（&lt;=0 不限）
     */
    Decision consume(String keyId, int rpm, long dailyQuota, long monthlyQuota, long nowMs);

    /** 读取当前计数（管理面/测试；实现可返回 null）。 */
    default State counters(String keyId) {
        return null;
    }
}
