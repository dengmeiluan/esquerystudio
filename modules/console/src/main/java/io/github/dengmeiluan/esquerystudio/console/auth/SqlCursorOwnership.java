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
 * SQL cursor 归属表（进程内）：cursor 是服务端结果集的持有凭据，按执行者权限生成。
 *
 * <p>与 {@link PitOwnership} 同一威胁模型：cursor id 出现在响应/历史/截图里时，
 * 任何持 search/workspace 读键的人都能拿它继续翻页，读到别人的结果集；换号后旧标签页
 * 也能续用上一个身份的 cursor。这里登记「控制台内打开的 cursor → 用户名」，
 * 消费/关闭时要求同一身份（ADMIN 仍可应急接管）。控制台外打开的不登记，保持既有能力。</p>
 */
public final class SqlCursorOwnership {

    private static final int CAP = 10_000;
    private static final Map<String, Entry> OWNERS = new ConcurrentHashMap<>();

    private SqlCursorOwnership() {
    }

    private static final class Entry {
        final String username;
        final long expiresAt;

        Entry(String username, long expiresAt) {
            this.username = username;
            this.expiresAt = expiresAt;
        }
    }

    public static void register(String cursor, String username, long ttlMillis) {
        if (cursor == null || cursor.trim().isEmpty()) return;
        if (username == null || username.trim().isEmpty()) return;
        long now = System.currentTimeMillis();
        purgeExpired(now);
        if (OWNERS.size() >= CAP) {
            purgeExpired(now);
            if (OWNERS.size() >= CAP) return;
        }
        long ttl = ttlMillis <= 0 ? 3_600_000L : ttlMillis;
        OWNERS.put(cursor.trim(), new Entry(username.trim(), now + ttl));
    }

    public static String owner(String cursor) {
        if (cursor == null || cursor.trim().isEmpty()) return null;
        Entry e = OWNERS.get(cursor.trim());
        if (e == null) return null;
        if (e.expiresAt <= System.currentTimeMillis()) {
            OWNERS.remove(cursor.trim(), e);
            return null;
        }
        return e.username;
    }

    /** 未登记 → true（控制台外打开）；ADMIN → true；否则必须同人。 */
    public static boolean allows(String cursor, String username, boolean admin) {
        String owner = owner(cursor);
        if (owner == null || admin) return true;
        return username != null && owner.equals(username.trim());
    }

    public static void release(String cursor) {
        if (cursor != null) OWNERS.remove(cursor.trim());
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
