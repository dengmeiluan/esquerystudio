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

import org.junit.Test;

import static org.junit.Assert.*;

/** 共享配额纯规则：窗口/日/月拒绝与滚动重置（JDBC 与 ES 两条实现共用同一口径）。 */
public class McpQuotaRulesTest {

    private static final long T0 = 1_795_000_000_000L;

    @Test
    public void rateLimitedWithinWindowAndRecoversOnRollover() {
        McpQuotaStore.State state = new McpQuotaStore.State();
        assertTrue(McpQuotaRules.decide(state, 2, 0, 0, T0).allowed);
        assertTrue(McpQuotaRules.decide(state, 2, 0, 0, T0 + 1_000).allowed);
        McpQuotaStore.Decision denied = McpQuotaRules.decide(state, 2, 0, 0, T0 + 2_000);
        assertFalse(denied.allowed);
        assertEquals("MCP_RATE_LIMITED", denied.reason);
        assertTrue("retry 必须给出剩余秒数", denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60);
        assertEquals("拒绝时计数不得+1", 2L, denied.state.windowCount);

        McpQuotaStore.Decision nextWindow = McpQuotaRules.decide(state, 2, 0, 0, T0 + 61_000);
        assertTrue("窗口滚动后恢复", nextWindow.allowed);
        assertEquals(1L, nextWindow.state.windowCount);
    }

    @Test
    public void dailyAndMonthlyQuotasAreEnforcedIndependently() {
        McpQuotaStore.State state = new McpQuotaStore.State();
        assertTrue(McpQuotaRules.decide(state, 1000, 1, 0, T0).allowed);
        McpQuotaStore.Decision daily = McpQuotaRules.decide(state, 1000, 1, 0, T0 + 1_000);
        assertFalse(daily.allowed);
        assertEquals("MCP_DAILY_QUOTA_EXCEEDED", daily.reason);

        /* 次日（日计数滚动）放行；但月配额为 1 时同日再次被月口径拦住 */
        McpQuotaStore.Decision nextDay = McpQuotaRules.decide(state, 1000, 1, 0, T0 + 86_400_000L);
        assertTrue(nextDay.allowed);

        McpQuotaStore.State monthly = new McpQuotaStore.State();
        assertTrue(McpQuotaRules.decide(monthly, 1000, 0, 1, T0).allowed);
        McpQuotaStore.Decision monthDenied = McpQuotaRules.decide(monthly, 1000, 0, 1, T0 + 1_000);
        assertFalse(monthDenied.allowed);
        assertEquals("MCP_MONTHLY_QUOTA_EXCEEDED", monthDenied.reason);
        McpQuotaStore.Decision nextMonth = McpQuotaRules.decide(monthly, 1000, 0, 1, T0 + 32L * 86_400_000L);
        assertTrue("新月滚动后恢复", nextMonth.allowed);
    }
}
