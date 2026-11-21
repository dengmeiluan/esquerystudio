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

import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * PAGE_DENIED 审计去重聚合层单测。
 * 背景：VIEWER 停留在无权限页时，页面轮询每分钟对同一 URI 反复 403，
 * 拦截器逐条落审计——审计流被同质心跳刷屏（产线实证：每分钟 3 条、无限重复）。
 */
public class DedupConsoleOpsAuditStoreTest {

    /** 记录 delegate 收到的落档事件（：事件即记录唯一类型） */
    private static final class CapturingStore implements ConsoleOpsAuditStore {
        final List<ConsoleOpsAuditEvent> records = new ArrayList<ConsoleOpsAuditEvent>();

        @Override
        public void record(ConsoleOpsAuditEvent event) {
            records.add(event);
        }

        @Override
        public List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    private CapturingStore delegate;
    private DedupConsoleOpsAuditStore store;

    @Before
    public void setUp() {
        delegate = new CapturingStore();
        store = new DedupConsoleOpsAuditStore(delegate);
    }

    private void denied(String user, String uri) {
        store.record(ConsoleOpsAuditEvent.builder()
                .username(user).role("VIEWER").method("GET").uri(uri)
                .action("PAGE_DENIED").httpStatus(403).detail("page=" + uri)
                .build());
    }

    @Test
    public void 窗口内同用户同uri的重复拒绝被抑制不落档() {
        denied("zhang", "/cluster/pending-tasks");
        for (int i = 0; i < 50; i++) denied("zhang", "/cluster/pending-tasks");
        assertEquals("窗口内 51 次拒绝只应落 1 条", 1, delegate.records.size());
    }

    @Test
    public void 不同用户或不同uri各自开窗互不影响() {
        denied("zhang", "/cluster/pending-tasks");
        denied("li", "/cluster/pending-tasks");
        denied("zhang", "/xmigrate/jobs");
        assertEquals("不同 key 应各落首条", 3, delegate.records.size());
    }

    @Test
    public void 窗口过期后再拒绝照常落档并带出上一窗口抑制计数() throws Exception {
        denied("zhang", "/xmigrate/jobs"); // 首条
        // 直接篡改窗口起始时间模拟过期（窗口 10 分钟）
        java.lang.reflect.Field f = DedupConsoleOpsAuditStore.class.getDeclaredField("windows");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        ConcurrentMap<String, Object> windows =
                (ConcurrentMap<String, Object>) f.get(store);
        Object w = windows.values().iterator().next();
        java.lang.reflect.Field firstField = w.getClass().getDeclaredField("first");
        firstField.setAccessible(true);
        firstField.setLong(w, System.currentTimeMillis() - (DedupConsoleOpsAuditStore.WINDOW_MS + 60_000L));

        denied("zhang", "/xmigrate/jobs"); // 过期后再拒：落新档
        assertEquals(2, delegate.records.size());
        String detail = delegate.records.get(1).getDetail();
        assertTrue("应带出上一窗口抑制计数说明：" + detail, detail.contains("重复拒绝已聚合"));
        assertTrue("detail 应保留原始 page 信息", detail.contains("page=/xmigrate/jobs"));
    }

    private static ConsoleOpsAuditEvent ev(String user, String role, String method, String uri, String action) {
        return ConsoleOpsAuditEvent.builder()
                .username(user).role(role).method(method).uri(uri).action(action).httpStatus(200)
                .build();
    }

    @Test
    public void 非PAGE_DENIED动作永不抑制() {
        store.record(ev("zhang", "VIEWER", "POST", "/idx/x/_doc", "WRITE"));
        store.record(ev("zhang", "VIEWER", "POST", "/idx/x/_doc", "WRITE"));
        store.record(ev("zhang", "ADMIN", "DELETE", "/idx/y", "HIGH_RISK"));
        assertEquals("写/高危每条都有审计价值，不聚合", 3, delegate.records.size());
    }
}
