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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 控制台操作审计——PAGE_DENIED 去重聚合装饰层（架构修复）。
 *
 * <p><b>缺陷背景</b>：VIEWER 用户停留在无权限页面时，页面轮询（诊断/迁移/重建列表）
 * 每分钟对同一 URI 反复 403，拦截器逐条落 PAGE_DENIED 审计——审计流被同质心跳刷屏，
 * 真正有价值的写操作/高危审计被淹没，审计索引无限膨胀。</p>
 *
 * <p><b>策略</b>：仅对 PAGE_DENIED 聚合（写操作/高危/登录的每条记录都有独立审计价值，
 * 不做抑制）。同一 {@code username|uri} 在时间窗（默认 10 分钟）内的重复拒绝只累加
 * 内存计数不落档；窗口过期后的下一次拒绝照常落档，并在 detail 尾部带出上一窗口的
 * 抑制条数——审计里一条「页面被拒 (+47 条重复已抑制)」比 48 条心跳的信息密度高得多。</p>
 *
 * <p>内存防护：key 表上限 2048（超限时整体清空重新计数——审计级精度可接受）。</p>
 *
 * @author aicoding
 */
public class DedupConsoleOpsAuditStore implements ConsoleOpsAuditStore {

    private static final Logger LOG = LoggerFactory.getLogger(DedupConsoleOpsAuditStore.class);

    /** PAGE_DENIED 聚合窗口（毫秒） */
    static final long WINDOW_MS = 10 * 60_000L;
    private static final int MAX_KEYS = 2048;

    private final ConsoleOpsAuditStore delegate;
    private final ConcurrentMap<String, Window> windows = new ConcurrentHashMap<>();

    private static final class Window {
        final long first = System.currentTimeMillis();
        final AtomicLong suppressed = new AtomicLong();
    }

    public DedupConsoleOpsAuditStore(ConsoleOpsAuditStore delegate) {
        this.delegate = delegate;
    }

    /* 唯一写入口=富事件——聚合逻辑单点在此，富维度（集群/IP/耗时）原样透传下层。
       委托方异常必须在此吞掉：record 在拦截器 preHandle 的拒绝链路上被调用，
       宿主自定义 store 抛一次异常就会把「403 拒绝」变成「500 未定义错误」——
       审计旁路永不反噬主流程是 ConsoleOpsAuditStore 的契约。 */
    @Override
    public void record(ConsoleOpsAuditEvent event) {
        try {
            doRecord(event);
        } catch (RuntimeException e) {
            /* warn/info 必须带 throwable（LogStackFidelityGuard901 约定：异常栈是唯一排障依据） */
            LOG.warn("[DedupConsoleOpsAuditStore] 审计落档失败（已旁路，不影响请求）", e);
        }
    }

    private void doRecord(ConsoleOpsAuditEvent event) {
        if ("PAGE_DENIED".equals(event.getAction())) {
            String key = event.getUsername() + '|' + event.getUri();
            long now = System.currentTimeMillis();
            Window cur = windows.get(key);
            if (cur != null && now - cur.first <= WINDOW_MS) {
                cur.suppressed.incrementAndGet(); /* 窗口内重复拒绝：抑制不落档 */
                return;
            }
            ConsoleOpsAuditEvent enriched = event;
            if (cur != null) {
                /* 上一窗口存在抑制：本次落档带出抑制计数（审计完整性：拒绝次数是排障关键量） */
                long sup = cur.suppressed.get();
                String note = "(前 " + (WINDOW_MS / 60000) + " 分钟另有 " + sup + " 条重复拒绝已聚合)";
                String merged = event.getDetail() == null || event.getDetail().isEmpty()
                        ? note : event.getDetail() + " " + note;
                enriched = ConsoleOpsAuditEvent.builder()
                        .username(event.getUsername()).displayName(event.getDisplayName()).role(event.getRole())
                        .method(event.getMethod()).uri(event.getUri()).action(event.getAction())
                        .httpStatus(event.getHttpStatus()).detail(merged)
                        .connId(event.getConnId()).connName(event.getConnName())
                        .ip(event.getIp()).costMs(event.getCostMs())
                        .build();
            }
            if (windows.size() >= MAX_KEYS) {
                windows.clear(); /* 键表超限：整体重来（下次拒绝重新开窗） */
            }
            windows.put(key, new Window());
            delegate.record(enriched);
            return;
        }
        delegate.record(event);
    }

    /* 查询透传（单签名——契约收紧）。20260922 快筛批：结构化查询同透传——
       去重是写侧语义，查询面无论新旧签名都必须原样抵达底层档，不得被 default 桥接旁路 */
    @Override
    public List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs) {
        return delegate.search(username, action, size, from, sinceMs);
    }

    @Override
    public List<ConsoleOpsAuditEvent> search(ConsoleOpsAuditQuery query) {
        return delegate.search(query);
    }
}
