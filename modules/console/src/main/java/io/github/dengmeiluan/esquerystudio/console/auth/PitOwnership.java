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

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * PIT id 归属表（进程内）：PIT id 是服务端资源的持有凭据，按执行者权限打开。
 *
 * <p>不登记等于把 id 当公共口令：ADMIN 打开的 PIT 若出现在历史/截图/日志里，任何持
 * DevTools 读键的人都能用它读到 ADMIN 范围的数据；账号切换后旧标签页也能续用上一个身份的 PIT。
 * 这里登记「控制台内打开的 id → 用户名」，消费时要求同一身份（ADMIN 仍可应急接管）。
 * 控制台外（curl/其他工具）打开的 id 不登记——保持既有能力，不改变外部客户端行为。</p>
 *
 * <p>进程内表与内置 token 吊销表同一限制：多实例部署只在当前实例生效；按到期时间淘汰。</p>
 */
public final class PitOwnership {

    private static final int CAP = 10_000;
    private static final Map<String, Entry> OWNERS = new ConcurrentHashMap<>();

    private PitOwnership() {
    }

    private static final class Entry {
        final String username;
        final long expiresAt;

        Entry(String username, long expiresAt) {
            this.username = username;
            this.expiresAt = expiresAt;
        }
    }

    /** 登记打开的 PIT；无用户名（免鉴权/内部调用）或空 id 不登记。 */
    public static void register(String pitId, String username, long ttlMillis) {
        if (pitId == null || pitId.trim().isEmpty()) return;
        if (username == null || username.trim().isEmpty()) return;
        long now = System.currentTimeMillis();
        purgeExpired(now);
        if (OWNERS.size() >= CAP) {
            purgeExpired(now);
            if (OWNERS.size() >= CAP) return; // 满表不驱逐仍有效的归属（宁可少登记，不串身份）
        }
        long ttl = ttlMillis <= 0 ? 3_600_000L : ttlMillis;
        OWNERS.put(pitId.trim(), new Entry(username.trim(), now + ttl));
    }

    /** 已登记的归属用户名；未登记/已过期返回 null（未登记=控制台外打开，维持既有放行）。 */
    public static String owner(String pitId) {
        if (pitId == null || pitId.trim().isEmpty()) return null;
        Entry e = OWNERS.get(pitId.trim());
        if (e == null) return null;
        if (e.expiresAt <= System.currentTimeMillis()) {
            OWNERS.remove(pitId.trim(), e);
            return null;
        }
        return e.username;
    }

    /** 当前身份是否可使用该 PIT：未登记 → true（外部打开）；ADMIN → true；否则必须同人。 */
    public static boolean allows(String pitId, String username, boolean admin) {
        String owner = owner(pitId);
        if (owner == null || admin) return true;
        return username != null && owner.equals(username.trim());
    }

    /** 释放登记（关闭 PIT 时调用；未登记/已过期无副作用）。 */
    public static void release(String pitId) {
        if (pitId != null) OWNERS.remove(pitId.trim());
    }

    /** 测试隔离用。 */
    public static void clear() {
        OWNERS.clear();
    }

    private static void purgeExpired(long now) {
        for (Map.Entry<String, Entry> e : OWNERS.entrySet()) {
            if (e.getValue() == null || e.getValue().expiresAt <= now) {
                OWNERS.remove(e.getKey(), e.getValue());
            }
        }
    }
}
