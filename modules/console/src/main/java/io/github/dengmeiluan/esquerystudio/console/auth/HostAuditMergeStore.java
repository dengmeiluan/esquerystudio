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

import java.util.ArrayList;
import java.util.List;

/**
 * 控制台审计——宿主贡献合并装饰层（查询时把宿主
 * {@link ConsoleAuditContributor} 的记录并入 {@link ConsoleOpsAuditStore} 的查询结果，
 * 按 timestamp 倒序全局排序后裁剪到 size，来源标记 {@code source=host}；写入路径纯透传
 * （宿主记录不进控制台存储，各归其主，删除/保留策略互不绑架）。
 *
 * <p>契约红线：贡献者 {@code search} 抛任何异常只 WARN 一次并降级为仅控制台记录——
 * 宿主故障绝不反噬控制台自身审计查询。跨源分页为近似语义（各源自取 from/size 后全局
 * 裁剪），审计浏览场景可接受。</p>
 *
 * @author aicoding
 */
public class HostAuditMergeStore implements ConsoleOpsAuditStore {

    private static final Logger LOG = LoggerFactory.getLogger(HostAuditMergeStore.class);

    private final ConsoleOpsAuditStore delegate;
    private final ConsoleAuditContributor contributor;
    private volatile boolean contributorBroken;

    public HostAuditMergeStore(ConsoleOpsAuditStore delegate, ConsoleAuditContributor contributor) {
        this.delegate = delegate;
        this.contributor = contributor;
    }

    @Override
    public void record(ConsoleOpsAuditEvent event) {
        delegate.record(event);
    }

    /* 基线签名：桥入结构化查询（合并逻辑单点在新方法） */
    @Override
    public List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs) {
        return search(ConsoleOpsAuditQuery.legacy(username, action, size, from, sinceMs));
    }

    /**
     * 结构化查询合并（20260922 快筛批）：控制台侧全维下推底层档；宿主贡献者 SPI 维持
     * 基线签名（username/action/时间下界）——扩维仅控制台侧承诺，宿主侧静默忽略，
     * 宿主 SPI 契约不动（注册方零改造）。
     */
    @Override
    public List<ConsoleOpsAuditEvent> search(ConsoleOpsAuditQuery query) {
        ConsoleOpsAuditQuery q = query != null ? query : ConsoleOpsAuditQuery.legacy(null, null, 100, 0, null);
        List<ConsoleOpsAuditEvent> merged = new ArrayList<>(delegate.search(q));
        if (!contributorBroken) {
            try {
                List<ConsoleOpsAuditEvent> host = contributor.search(
                        q.getUsername(), q.getAction(), q.getSize(), q.getFrom(), q.getFromMs());
                if (host != null) {
                    for (ConsoleOpsAuditEvent e : host) {
                        merged.add(e.getSource() == null
                                ? ConsoleOpsAuditEvent.builder()
                                .username(e.getUsername()).displayName(e.getDisplayName()).role(e.getRole())
                                .method(e.getMethod()).uri(e.getUri()).action(e.getAction())
                                .httpStatus(e.getHttpStatus()).detail(e.getDetail())
                                .connId(e.getConnId()).connName(e.getConnName()).ip(e.getIp())
                                .costMs(e.getCostMs()).source("host").timestamp(e.getTimestamp())
                                .build()
                                : e);
                    }
                }
            } catch (Exception e) {
                /* 宿主贡献者故障：WARN 一次性留痕 + 本次起降级为仅控制台记录（红线：不反噬） */
                contributorBroken = true;
                LOG.warn("[esquerystudio-audit] 宿主审计贡献者查询失败（首次，此后降级不再尝试）：{}", e.getMessage(), e);
            }
        }
        merged.sort((a, b) -> {
            long ta = a.getTimestamp() == null ? Long.MIN_VALUE : a.getTimestamp();
            long tb = b.getTimestamp() == null ? Long.MIN_VALUE : b.getTimestamp();
            return ta == tb ? 0 : (ta > tb ? -1 : 1);
        });
        return merged.size() > q.getSize() ? new ArrayList<>(merged.subList(0, q.getSize())) : merged;
    }
}
