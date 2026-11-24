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

package io.github.dengmeiluan.esquerystudio.console.core;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 重建锁守卫（R1 SRP 抽取）：把 acquire / renew / release / 状态查询从 {@link EsIndexRebuildService}
 * 抽出，service 不再直接持 {@link RebuildLockStore}。
 *
 * <p>职责：① 把"租约毫秒"等参数从 properties 收敛在此（service 不再到处取 properties）；
 * ② 把"获取失败抛友好异常"统一在此；③ 把"续约失败=本实例失锁"语义内聚，外部调用只看一个布尔/异常。</p>
 *
 * @author aicoding
 */
public class RebuildLockGuard {

    private static final Logger logger = LoggerFactory.getLogger(RebuildLockGuard.class);

    private final RebuildLockStore lockStore;
    private final ESQueryStudioElasticsearchProperties properties;

    public RebuildLockGuard(RebuildLockStore lockStore, ESQueryStudioElasticsearchProperties properties) {
        this.lockStore = lockStore;
        this.properties = properties;
    }

    /**
     * 起点获取分布式重建锁：失败抛友好异常（含当前持锁者 owner，便于运维定位）。
     * lock.enabled=false 时为 no-op 永远成功。
     */
    public void acquire(String indexKey) {
        long leaseMs = properties.getLock().getLeaseMs();
        if (!lockStore.tryAcquire(indexKey, leaseMs)) {
            RebuildLock current = lockStore.get(indexKey);
            String holder = current == null ? "(unknown)" : current.getOwner();
            throw new IllegalStateException("indexKey=" + indexKey + " 正被 owner=" + holder + " 重建中，拒绝并发发起");
        }
    }

    /**
     * 跨请求中间步骤：续约持锁。
     *
     * N 阶段无状态化：lockStore.renew 不再校验 owner，任意实例都能续约同一锁。
     * renew 失败 = 锁文档真的不存在/过期 → 兜底 tryAcquire 重新接管；都失败才抛错。
     */
    public void renewOrFail(String indexKey) {
        long leaseMs = properties.getLock().getLeaseMs();
        if (lockStore.renew(indexKey, leaseMs)) {
            return;
        }
        // renew 失败：锁不存在/过期 → tryAcquire 兜底接管
        if (lockStore.tryAcquire(indexKey, leaseMs)) {
            logger.info("[RebuildLockGuard] indexKey={} renew 失败但锁已不存在/过期，兜底 tryAcquire 成功", indexKey);
            return;
        }
        // 兜底也失败：他人在过期瞬间抢先（极罕见竞态）
        RebuildLock current = lockStore.get(indexKey);
        String holder = current == null ? "(unknown)" : current.getOwner();
        throw new IllegalStateException("indexKey=" + indexKey + " 重建锁已被他人抢先持有 owner=" + holder + "，拒绝继续推进");
    }

    /**
     * 释放本实例锁（非本实例不删，失败仅告警），供终态/abort 调用。
     */
    public void release(String indexKey) {
        lockStore.release(indexKey);
    }

    /**
     * 强制释放锁（忽略 owner）：供 {@code abort} 等异常恢复路径解孤儿锁——原持锁实例崩溃后，
     * 新实例需 abort 卡住的作业但锁 owner 不是本实例，正常 release 会跳过，强制 release 才能解锁继续。
     */
    public void forceRelease(String indexKey) {
        lockStore.forceRelease(indexKey);
    }

    /**
     * 读当前锁状态（status 视图用），无锁返回 null。
     */
    public RebuildLock get(String indexKey) {
        return lockStore.get(indexKey);
    }

    /**
     * 本实例 owner 标识（status 视图判断 self 用）。
     */
    public String selfOwner() {
        return lockStore.owner();
    }
}
