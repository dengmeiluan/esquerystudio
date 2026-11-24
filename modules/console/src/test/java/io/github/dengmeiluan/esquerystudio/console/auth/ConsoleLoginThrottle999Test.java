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

import org.junit.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 登录失败节流：窗口计数、触顶临时拒绝、成功清零、窗口过期复位。
 */
public class ConsoleLoginThrottle999Test {

    @Test
    public void 窗口内触顶进入临时拒绝() {
        AtomicLong now = new AtomicLong(1_000_000L);
        ConsoleLoginThrottle t = new ConsoleLoginThrottle(now::get);
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES; i++) {
            assertEquals(0L, t.remainingLockMs("u1", "10.0.0.1"));
            t.recordFailure("u1", "10.0.0.1");
        }
        assertTrue("触顶后应处于拒绝期", t.remainingLockMs("u1", "10.0.0.1") > 0);
        /* 其它用户名与其它 IP 不受牵连 */
        assertEquals(0L, t.remainingLockMs("u2", "10.0.0.1"));
        assertEquals(0L, t.remainingLockMs("u1", "10.0.0.2"));
    }

    @Test
    public void 锁定期满自动复位() {
        AtomicLong now = new AtomicLong(1_000_000L);
        ConsoleLoginThrottle t = new ConsoleLoginThrottle(now::get);
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES; i++) {
            t.recordFailure("u1", "10.0.0.1");
        }
        now.addAndGet(ConsoleLoginThrottle.LOCKOUT_MS + 1);
        assertEquals(0L, t.remainingLockMs("u1", "10.0.0.1"));
        /* 复位后重新计数，不叠加历史窗口 */
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES - 1; i++) {
            t.recordFailure("u1", "10.0.0.1");
        }
        assertEquals(0L, t.remainingLockMs("u1", "10.0.0.1"));
    }

    @Test
    public void 成功登录清零失败计数() {
        AtomicLong now = new AtomicLong(1_000_000L);
        ConsoleLoginThrottle t = new ConsoleLoginThrottle(now::get);
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES - 1; i++) {
            t.recordFailure("u1", "10.0.0.1");
        }
        t.recordSuccess("u1", "10.0.0.1");
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES - 1; i++) {
            t.recordFailure("u1", "10.0.0.1");
        }
        assertEquals("成功清零后不得被历史计数触顶", 0L, t.remainingLockMs("u1", "10.0.0.1"));
    }

    @Test
    public void 跨窗口失败不累计() {
        AtomicLong now = new AtomicLong(1_000_000L);
        ConsoleLoginThrottle t = new ConsoleLoginThrottle(now::get);
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES - 1; i++) {
            t.recordFailure("u1", "10.0.0.1");
        }
        now.addAndGet(ConsoleLoginThrottle.WINDOW_MS + 1);
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES - 1; i++) {
            t.recordFailure("u1", "10.0.0.1");
        }
        assertEquals("窗口外的历史失败不得计入新窗口", 0L, t.remainingLockMs("u1", "10.0.0.1"));
    }

    @Test
    public void 空用户名与空IP可作键() {
        AtomicLong now = new AtomicLong(1_000_000L);
        ConsoleLoginThrottle t = new ConsoleLoginThrottle(now::get);
        for (int i = 0; i < ConsoleLoginThrottle.MAX_FAILURES; i++) {
            t.recordFailure(null, null);
        }
        assertTrue(t.remainingLockMs(null, null) > 0);
    }
}
