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
import java.util.function.LongSupplier;

/**
 * 登录失败节流：按「用户名 + 来源 IP」计失败窗口，超阈值后临时拒绝该组合的登录尝试。
 *
 * <p>纯内存实现（单实例语义；多实例各自计数，总尝试上限为单实例阈值 × 实例数）。
 * 成功登录即清零，正常用户不受影响；记录面在极端灌水下可放弃登记，锁定面按既有状态执法。</p>
 *
 * @author aicoding
 */
public class ConsoleLoginThrottle {

    /** 窗口内失败次数上限（同一用户名+IP）。 */
    static final int MAX_FAILURES = 10;
    /** 失败计数窗口。 */
    static final long WINDOW_MS = 5 * 60_000L;
    /** 触顶后的临时拒绝时长。 */
    static final long LOCKOUT_MS = 10 * 60_000L;
    /** 计数键上限：超过先淘汰过期窗口，仍超则放弃登记（防伪造用户名灌内存）。 */
    private static final int KEY_CAP = 10_000;

    private final Map<String, long[]> failures = new ConcurrentHashMap<>();
    private final Map<String, Long> lockedUntil = new ConcurrentHashMap<>();
    private final LongSupplier clock;

    public ConsoleLoginThrottle() {
        this(System::currentTimeMillis);
    }

    ConsoleLoginThrottle(LongSupplier clock) {
        this.clock = clock;
    }

    /** 该用户名+IP 是否处于临时拒绝期；是则返回剩余毫秒（>0），否则 0。 */
    public long remainingLockMs(String username, String ip) {
        String key = key(username, ip);
        Long until = lockedUntil.get(key);
        if (until == null) {
            return 0;
        }
        long left = until - clock.getAsLong();
        if (left <= 0) {
            lockedUntil.remove(key);
            failures.remove(key);
            return 0;
        }
        return left;
    }

    /** 记一次失败；窗口内达到上限即对该组合进入临时拒绝期。 */
    public void recordFailure(String username, String ip) {
        String key = key(username, ip);
        long now = clock.getAsLong();
        if (failures.size() >= KEY_CAP && !failures.containsKey(key)) {
            failures.entrySet().removeIf(e -> now - e.getValue()[0] > WINDOW_MS);
            if (failures.size() >= KEY_CAP && !failures.containsKey(key)) {
                /* 键空间被灌满（海量随机用户名各失败一次）时静默丢弃会让全部未锁键
                   的计数失效——驱逐最旧窗口条目腾位，维持对后续爆破目标的计数能力；
                   被驱逐键只是计数清零重数（10 次机会重新累积），维持灌满成本翻倍。 */
                failures.entrySet().stream()
                        .min(java.util.Comparator.comparingLong(e -> e.getValue()[0]))
                        .ifPresent(e -> failures.remove(e.getKey()));
            }
        }
        long[] slot = failures.compute(key, (k, v) ->
                v == null || now - v[0] > WINDOW_MS ? new long[]{now, 1L} : new long[]{v[0], v[1] + 1});
        if (slot[1] >= MAX_FAILURES) {
            lockedUntil.put(key, now + LOCKOUT_MS);
            failures.remove(key);
        }
        if (lockedUntil.size() >= KEY_CAP) {
            lockedUntil.entrySet().removeIf(e -> e.getValue() <= now);
        }
    }

    /** 成功登录：清零该组合的失败计数与锁定状态。 */
    public void recordSuccess(String username, String ip) {
        String key = key(username, ip);
        failures.remove(key);
        lockedUntil.remove(key);
    }

    private static String key(String username, String ip) {
        return (username == null ? "-" : username) + "|" + (ip == null ? "-" : ip);
    }
}
