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

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** ES key 存储的用量文档契约：账本、最近调用与限流窗口必须同批回写。 */
public class EsMcpKeyStoreTest {

    @Test
    public void usageDocumentCarriesDailyLedgerAndRecentCallAttribution() {
        McpKeyRecord record = new McpKeyRecord();
        record.lastUsedAt = 1794181860345L;
        record.requestCount = 46;
        record.errorCount = 1;
        record.dayKey = "2026-11-09";
        record.dayCount = 3;
        record.monthKey = "2026-11";
        record.monthCount = 46;
        record.windowStart = 1794181800000L;
        record.windowCount = 3;
        record.dailyCounts.put("2026-11-09", 3L);
        record.lastTool = "es_list_indices";
        Map<String, Object> call = new LinkedHashMap<>();
        call.put("method", "tools/call");
        call.put("tool", "es_list_indices");
        call.put("requestId", "trace-demo-2");
        call.put("ip", "198.51.100.23");
        record.recentCalls.add(call);

        Map<String, Object> doc = EsMcpKeyStore.usageDocument(record);

        @SuppressWarnings("unchecked")
        Map<String, Object> ledger = (Map<String, Object>) doc.get("dailyCounts");
        assertEquals(3L, ledger.get("2026-11-09"));
        assertEquals(3L, doc.get("dayCount"));
        assertEquals(46L, doc.get("monthCount"));
        assertEquals(3, doc.get("windowCount"));
        assertEquals("es_list_indices", doc.get("lastTool"));
        assertTrue(String.valueOf(doc.get("recentCalls")).contains("trace-demo-2"));
        assertTrue(String.valueOf(doc.get("recentCalls")).contains("198.51.100.23"));
    }
}
