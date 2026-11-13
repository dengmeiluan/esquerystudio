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

package io.github.dengmeiluan.esquerystudio.console.lock;

/**
 * 重建分布式锁的当前状态快照：用于诊断（谁在重建、何时过期）与过期强夺时的 {@code if_seq_no} 乐观写。
 *
 * @author aicoding
 */
public class RebuildLock {

    /** 持锁实例标识（pid@host/UUID） */
    private final String owner;

    /** 获取时间（epoch millis） */
    private final long acquireTime;

    /** 租约到期时间（epoch millis），{@code <= now} 即可被其它实例强夺 */
    private final long expireTime;

    /** ES seq_no（强夺/续约的乐观并发令牌） */
    private final long seqNo;

    /** ES primary_term（强夺/续约的乐观并发令牌） */
    private final long primaryTerm;

    public RebuildLock(String owner, long acquireTime, long expireTime, long seqNo, long primaryTerm) {
        this.owner = owner;
        this.acquireTime = acquireTime;
        this.expireTime = expireTime;
        this.seqNo = seqNo;
        this.primaryTerm = primaryTerm;
    }

    public String getOwner() {
        return owner;
    }

    public long getAcquireTime() {
        return acquireTime;
    }

    public long getExpireTime() {
        return expireTime;
    }

    public long getSeqNo() {
        return seqNo;
    }

    public long getPrimaryTerm() {
        return primaryTerm;
    }

    public boolean isExpired(long now) {
        return expireTime <= now;
    }

    /**
     * 当前锁是否由指定 owner 持有（R2：归属判断从 service 层下沉到值对象，
     * 替代原 {@code lock.getOwner().equals(lockStore.owner())} 散落判断）。
     */
    public boolean isHeldBy(String candidateOwner) {
        return owner != null && owner.equals(candidateOwner);
    }

    /**
     * 当前锁是否可被指定 owner 强夺：已过期 且 owner 不是当前持有者本身（强夺自己无意义）。
     */
    public boolean canBeStolenBy(String candidateOwner, long now) {
        return isExpired(now) && !isHeldBy(candidateOwner);
    }
}
