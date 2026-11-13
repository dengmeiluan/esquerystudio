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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 宿主审计贡献合并层单测——全局倒序、裁剪、source=host stamp、
 * 贡献者故障降级（契约红线：宿主故障绝不反噬控制台自身审计查询）。
 */
public class HostAuditMergeStoreTest {

    private static ConsoleOpsAuditEvent rec(long ts, String username, String action) {
        return ConsoleOpsAuditEvent.builder()
                .username(username).role("VIEWER").method("GET").uri("/u/" + username)
                .action(action).httpStatus(200).timestamp(ts)
                .build();
    }

    private static class StubStore implements ConsoleOpsAuditStore {
        List<ConsoleOpsAuditEvent> rows = new ArrayList<>();
        ConsoleOpsAuditEvent lastRecorded;

        @Override public void record(ConsoleOpsAuditEvent event) { this.lastRecorded = event; }

        @Override public List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return rows;
        }
    }

    @Test
    public void 合并按timestamp倒序全局排序并裁剪到size() {
        StubStore base = new StubStore();
        base.rows.add(rec(100L, "console-new", "WRITE"));
        base.rows.add(rec(50L, "console-old", "WRITE"));
        ConsoleAuditContributor host = (u, a, size, from, since) -> new ArrayList<>(Arrays.asList(
                rec(300L, "host-new", "HOST_OP"),
                rec(75L, "host-mid", "HOST_OP")));

        HostAuditMergeStore store = new HostAuditMergeStore(base, host);
        List<ConsoleOpsAuditEvent> out = store.search(null, null, 3, 0, null);

        assertEquals(3, out.size());
        assertEquals("host-new", out.get(0).getUsername());
        assertEquals("console-new", out.get(1).getUsername());
        assertEquals("host-mid", out.get(2).getUsername());
    }

    @Test
    public void 宿主记录source留空时合并层统一stamp为host() {
        StubStore base = new StubStore();
        ConsoleAuditContributor host = (u, a, size, from, since) ->
                Collections.singletonList(rec(1L, "h", "HOST_OP"));
        List<ConsoleOpsAuditEvent> out = new HostAuditMergeStore(base, host).search(null, null, 10, 0, null);
        assertEquals("host", out.get(0).getSource());
    }

    @Test
    public void 贡献者抛异常_降级为仅控制台记录_且写入路径透传不受影响() {
        StubStore base = new StubStore();
        base.rows.add(rec(10L, "c", "WRITE"));
        ConsoleAuditContributor broken = (u, a, size, from, since) -> {
            throw new IllegalStateException("宿主库炸了(桩)");
        };
        HostAuditMergeStore store = new HostAuditMergeStore(base, broken);

        List<ConsoleOpsAuditEvent> out = store.search(null, null, 10, 0, null);
        assertEquals("贡献者故障仍须返回控制台自身记录", 1, out.size());
        assertEquals("c", out.get(0).getUsername());

        /* 写入纯透传：不进宿主，原样进 delegate */
        ConsoleOpsAuditEvent e = rec(1L, "x", "LOGIN");
        store.record(e);
        assertEquals(e, base.lastRecorded);
    }

    @Test
    public void 写入路径纯透传_宿主记录不落控制台存储() {
        StubStore base = new StubStore();
        List<ConsoleOpsAuditEvent> contributed = new ArrayList<>();
        ConsoleAuditContributor host = (u, a, size, from, since) -> contributed;
        HostAuditMergeStore store = new HostAuditMergeStore(base, host);

        store.record(rec(1L, "who", "LOGIN"));
        assertTrue("delegate 收到透传", base.lastRecorded != null);
        assertTrue(contributed.isEmpty());
    }
}
