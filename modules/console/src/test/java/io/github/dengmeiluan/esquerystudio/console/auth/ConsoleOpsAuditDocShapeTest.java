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

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 审计记录唯一类型（事件即记录）双端形状锁——
 * ES 档 buildDoc 落档文档维度全集 / toEvents 反解回填，null 维度静默省略。
 */
public class ConsoleOpsAuditDocShapeTest {

    @Test
    public void buildDoc_全维事件落档四富维度与source齐全() {
        Map<String, Object> doc = EsConsoleOpsAuditStore.buildDoc(ConsoleOpsAuditEvent.builder()
                .username("test-user-1").displayName("测试用户一").role("VIEWER")
                .method("GET").uri("/internal/es/index/overview")
                .action("PAGE_DENIED").httpStatus(403).detail("page=overview")
                .connId("3556353a").connName("腾讯云UAT")
                .ip("203.0.113.9").costMs(7L)
                .build());
        assertEquals("test-user-1", doc.get("username"));
        assertEquals("测试用户一", doc.get("displayName"));
        assertEquals("PAGE_DENIED", doc.get("action"));
        assertEquals(403, doc.get("httpStatus"));
        assertEquals("3556353a", doc.get("connId"));
        assertEquals("腾讯云UAT", doc.get("connName"));
        assertEquals("203.0.113.9", doc.get("ip"));
        assertEquals(7L, doc.get("costMs"));
        assertEquals("console", doc.get("source"));
        assertTrue("落档必须带 timestamp", doc.get("timestamp") instanceof Long);
    }

    @Test
    public void buildDoc_空富维度静默省略_不落空字段() {
        Map<String, Object> doc = EsConsoleOpsAuditStore.buildDoc(ConsoleOpsAuditEvent.builder()
                .username("u").role("ADMIN").method("POST").uri("/x").action("WRITE").httpStatus(200)
                .build());
        assertFalse(doc.containsKey("displayName"));
        assertFalse(doc.containsKey("detail"));
        assertFalse(doc.containsKey("connId"));
        assertFalse(doc.containsKey("connName"));
        assertFalse(doc.containsKey("ip"));
        assertFalse(doc.containsKey("costMs"));
    }

    @Test
    public void buildDoc_detail超两千字符截断() {
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 300; i++) {
            big.append("0123456789");
        }
        Map<String, Object> doc = EsConsoleOpsAuditStore.buildDoc(ConsoleOpsAuditEvent.builder()
                .username("u").role("ADMIN").method("POST").uri("/x").action("WRITE").httpStatus(200)
                .detail(big.toString())
                .build());
        assertEquals(2000, String.valueOf(doc.get("detail")).length());
    }

    @Test
    public void toEvents_ES响应反解为类型化记录_维度一一对应() {
        Map<String, Object> doc = EsConsoleOpsAuditStore.buildDoc(ConsoleOpsAuditEvent.builder()
                .username("u").role("VIEWER").method("GET").uri("/overview")
                .action("PAGE_DENIED").httpStatus(403).detail("page=overview")
                .connId("3556353a").connName("腾讯云UAT").ip("198.51.100.7").costMs(3L)
                .build());
        java.util.Map<String, Object> esResponse = new java.util.LinkedHashMap<>();
        esResponse.put("hits", java.util.Collections.singletonMap("hits",
                java.util.Collections.singletonList(java.util.Collections.singletonMap("_source", doc))));

        java.util.List<ConsoleOpsAuditEvent> events = EsConsoleOpsAuditStore.toEvents(esResponse);
        assertEquals(1, events.size());
        ConsoleOpsAuditEvent e = events.get(0);
        assertEquals("u", e.getUsername());
        assertEquals("VIEWER", e.getRole());
        assertEquals("PAGE_DENIED", e.getAction());
        assertEquals("3556353a", e.getConnId());
        assertEquals("腾讯云UAT", e.getConnName());
        assertEquals("198.51.100.7", e.getIp());
        assertEquals(Long.valueOf(3L), e.getCostMs());
        assertEquals("console", e.getSource());
    }

    @Test
    public void toEvents_空响应或畸形响应返回空列表不抛() {
        assertTrue(EsConsoleOpsAuditStore.toEvents(null).isEmpty());
        assertTrue(EsConsoleOpsAuditStore.toEvents(new java.util.LinkedHashMap<String, Object>()).isEmpty());
        assertNull(EsConsoleOpsAuditStore.toEvents(java.util.Collections.emptyMap()).size() == 0 ? null : "x");
    }
}
