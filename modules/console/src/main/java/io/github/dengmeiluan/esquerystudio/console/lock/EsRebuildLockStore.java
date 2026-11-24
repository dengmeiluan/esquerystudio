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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.util.HashMap;
import java.util.Map;

/**
 * {@link RebuildLockStore} 的实现：以 {@code indexKey} 为锁文档 {@code _id}，借 ES 单 {@code _id} 操作的
 * 线性化 + {@code op_type=create} 的 CAS 语义实现跨实例互斥；过期锁用 {@code if_seq_no/if_primary_term} 原子强夺。
 *
 * <p><b>-67：本类不再持有 {@code RestHighLevelClient}，改持 {@link LockDocPort} 窄端口。</b>
 * 原因：RHLC 的 {@code IndexRequest.opType(CREATE)} <b>无论是否知道版本</b>都发
 * {@code PUT /idx/_create/id}，这条 typeless 路由在 6.x 上 400（{@code invalid_type_name_exception}），
 * 导致产线 6.7.2 宿主上<b>连锁都拿不到</b>、adhoc 重建根本无法启动。</p>
 *
 * <p><b>端口按意图建模</b>（{@code createIfAbsent} / {@code replaceIfUnchanged} / {@code deleteIfUnchanged}）：
 * 本类<b>拿不到裸客户端、也拿不到 IndexRequest</b>——想再写出 typeless 请求必须先改端口签名，
 * 那是评审看得见的显式动作，而不是「顺手 new 一个 IndexRequest」的无声滑落。
 * 同时 CAS 契约成了签名里的值（{@code seqNo}/{@code primaryTerm} 是参数），
 * 而非藏在 {@code IndexRequest} 的标志位组合里——<b>藏在标志位里的契约没有看守</b>。</p>
 *
 * <p>{@code enabled=false} 时全部降级为 no-op（tryAcquire/renew 恒 true、release 空转），便于单实例或测试场景关闭。</p>
 *
 * @author aicoding
 */
public class EsRebuildLockStore implements RebuildLockStore {

    private static final Logger logger = LoggerFactory.getLogger(EsRebuildLockStore.class);

    private static final String FIELD_OWNER = "owner";
    private static final String FIELD_ACQUIRE_TIME = "acquireTime";
    private static final String FIELD_EXPIRE_TIME = "expireTime";

    /** renew I/O 失败 WARN 节流间隔（MigrateJobTracker.save 60s 范式）。 */
    private static final long RENEW_WARN_THROTTLE_MS = 60_000L;

    /** renew I/O 失败 WARN 60s 单键节流——ES 持续不可达时每个 adhoc 作业
     *  每个续约点一条 WARN 会刷屏。首条保留原样（含 indexKey），窗口内仅累计，窗口尾先
     *  汇总一条「xN」再落本窗首条；节流只动日志，renew 返回 false 契约不变。 */
    private final java.util.concurrent.atomic.AtomicLong lastRenewIoWarnAt = new java.util.concurrent.atomic.AtomicLong(0);
    private final java.util.concurrent.atomic.AtomicLong renewIoFailSinceWarn = new java.util.concurrent.atomic.AtomicLong(0);

    private final LockDocPort port;
    private final String lockIndex;
    private final boolean enabled;
    private final String owner;

    public EsRebuildLockStore(LockDocPort port, String lockIndexName, boolean enabled) {
        this.port = port;
        this.lockIndex = lockIndexName;
        this.enabled = enabled;
        // 实例唯一标识：pid@host（B1 去掉 UUID）。理由：UUID 让"同 host 同进程"重启后 owner 改变 → renew 必失败 → 运维需手删锁——
        // 违背"锁支持作业跨请求持续推进"的初衷。多实例区分由 pid@host 自然完成（同 host 多 JVM 时 pid 不同）；
        // 同 pid 重启重用 owner，让单实例重启后能透明续约/继续作业。
        this.owner = ManagementFactory.getRuntimeMXBean().getName();
    }

    @Override
    public String owner() {
        return owner;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * 主动建锁索引（M6：由 EsRebuildBootstrapRunner 在 ApplicationReadyEvent 后异步调用，不阻塞启动）。
     *
     * <p>必需：阿里云 ES 等集群常配 {@code action.auto_create_index=[-*]} 禁止自动建索引，
     * 此时首次 {@code op_type=create} 会 404；与 {@code EsRebuildJobStore/EsRebuildAuditStore} 同模式
     * 显式预建。mapping 3 个字段（owner keyword、acquireTime/expireTime long），不依赖动态映射。</p>
     *
     * <p>-67：mappings 的 {@code _doc} type 包层由 {@link LockDocPort#createIndex} 按宿主版本决定
     * ——6.x 上缺包层会 {@code mapper_parsing_exception}（6.7.2 实测 400，且索引不会被建出来）。</p>
     *
     * @return <b>true=锁索引确实就绪</b>（已存在或本次建成）；false=未就绪。
     *         判据是<b>返回值</b>而不是「有没有抛异常」——本方法内部把异常 catch 掉了，
     *         调用方若靠异常判定会<b>永远</b>得到"成功"（实测出现过 WARN 后紧跟假成功 INFO）。
     */
    public boolean ensureIndex() {
        if (!enabled) {
            return true;
        }
        try {
            if (port.indexExists(lockIndex)) {
                return true;
            }
            port.createIndex(lockIndex, "{\"properties\":{"
                    + "\"" + FIELD_OWNER + "\":{\"type\":\"keyword\"},"
                    + "\"" + FIELD_ACQUIRE_TIME + "\":{\"type\":\"long\"},"
                    + "\"" + FIELD_EXPIRE_TIME + "\":{\"type\":\"long\"}"
                    + "}}");
            logger.info("[RebuildLock] lock index created: {}", lockIndex);
            return true;
        } catch (Exception e) {
            // 旁路：建索引失败不阻断启动；首次 tryAcquire 时由 ES 报错给运维明确提示
            logger.warn("[RebuildLock] ensureIndex failed (will fail at first acquire if auto_create_index disabled): {}", e.getMessage(), e);
            return false;
        }
    }

    @Override
    public boolean tryAcquire(String indexKey, long leaseMs) {
        if (!enabled) {
            return true;
        }
        long now = System.currentTimeMillis();
        try {
            boolean acquired = doCreate(indexKey, now, leaseMs);
            if (acquired) {
                logger.info("[RebuildLock] acquired indexKey={} owner={} leaseMs={}", indexKey, owner, leaseMs);
            }
            return acquired;
        } catch (IOException e) {
            // 锁操作 I/O 失败：无法确认是否有人持锁，保守失败（宁可不开始，也不并发开两个重建）
            logger.error("[RebuildLock] tryAcquire failed indexKey={}: {}", indexKey, e.getMessage(), e);
            throw new IllegalStateException("获取重建锁失败 indexKey=" + indexKey, e);
        }
    }

    /**
     * create 加锁；冲突（已存在）则走过期强夺。
     */
    private boolean doCreate(String indexKey, long now, long leaseMs) throws IOException {
        if (port.createIfAbsent(lockIndex, indexKey, lockSource(now, now + leaseMs))) {
            return true;
        }
        return stealIfExpired(indexKey, now, leaseMs);
    }

    /**
     * 已被占：未过期→拒绝；已过期（持有者疑似崩溃）→ if_seq_no 原子强夺；强夺被抢先→拒绝。
     */
    private boolean stealIfExpired(String indexKey, long now, long leaseMs) throws IOException {
        LockDocPort.LockDoc doc = port.get(lockIndex, indexKey);
        if (doc == null) {
            // 刚被释放：本次按竞争失败处理，调用方可重试（避免递归 create→steal→create 死循环）
            return false;
        }
        Map<String, Object> src = doc.source();
        long expireTime = toLong(src.get(FIELD_EXPIRE_TIME));
        Object holder = src.get(FIELD_OWNER);
        if (expireTime > now) {
            logger.info("[RebuildLock] indexKey={} 已被 owner={} 持有(未过期,到期={})，拒绝", indexKey, holder, expireTime);
            return false;
        }
        boolean stolen = port.replaceIfUnchanged(lockIndex, indexKey, lockSource(now, now + leaseMs),
                doc.seqNo(), doc.primaryTerm());
        if (stolen) {
            logger.warn("[RebuildLock] indexKey={} 强夺过期锁成功(原 owner={} 到期={})，新 owner={}",
                    indexKey, holder, expireTime, owner);
        } else {
            logger.info("[RebuildLock] indexKey={} 强夺时被其它实例抢先，拒绝", indexKey);
        }
        return stolen;
    }

    @Override
    public boolean renew(String indexKey, long leaseMs) {
        if (!enabled) {
            return true;
        }
        long now = System.currentTimeMillis();
        try {
            LockDocPort.LockDoc doc = port.get(lockIndex, indexKey);
            if (doc == null) {
                logger.warn("[RebuildLock] renew 失败：锁不存在 indexKey={}（疑似已被释放/abort）", indexKey);
                return false;
            }
            // N 阶段无状态化：不再校验 owner——多实例任何一个调 renew 都视为"有 active editor 推进"，续约即可。
            // acquire 时用 op_type=create + CAS 已保证起点互斥；renew 期间 owner 不一致仅说明请求被路由到不同实例，正常现象。
            Map<String, Object> src = doc.source();
            // 并发改动 → replaceIfUnchanged 返回 false = 已失锁
            return port.replaceIfUnchanged(lockIndex, indexKey,
                    lockSource(toLong(src.get(FIELD_ACQUIRE_TIME)), now + leaseMs),
                    doc.seqNo(), doc.primaryTerm());
        } catch (IOException e) {
            // WARN 60s 单键节流（MigrateJobTracker.save 范式）——窗口首条全量，
            // 窗口内仅累计，窗口尾先汇总「xN」一条再落本窗首条
            renewIoFailSinceWarn.incrementAndGet();
            long ts = System.currentTimeMillis();
            long last = lastRenewIoWarnAt.get();
            if (ts - last > RENEW_WARN_THROTTLE_MS && lastRenewIoWarnAt.compareAndSet(last, ts)) {
                long suppressed = renewIoFailSinceWarn.getAndSet(0);
                if (suppressed > 1) {
                    logger.warn("[RebuildLock] renew I/O 失败 x{}（{}s 窗口聚合）",
                            suppressed, RENEW_WARN_THROTTLE_MS / 1000);
                }
                logger.warn("[RebuildLock] renew I/O 失败 indexKey={}: {}", indexKey, e.getMessage(), e);
            }
            return false;
        }
    }

    @Override
    public void release(String indexKey) {
        if (!enabled) {
            return;
        }
        try {
            LockDocPort.LockDoc doc = port.get(lockIndex, indexKey);
            if (doc == null) {
                return;
            }
            // N 阶段无状态化：release 不再校验 owner——任意实例都能释放（锁是 indexKey 维度的互斥，与 owner 无关）。
            // 编排终态/abort 调本方法，保证锁清干净；orphan 锁靠 lease 自然过期兜底（forceRelease 是显式手动入口）。
            if (port.deleteIfUnchanged(lockIndex, indexKey, doc.seqNo(), doc.primaryTerm())) {
                logger.info("[RebuildLock] released indexKey={}", indexKey);
            }
        } catch (Exception e) {
            logger.warn("[RebuildLock] release failed indexKey={}: {}", indexKey, e.getMessage(), e);
        }
    }

    @Override
    public void forceRelease(String indexKey) {
        if (!enabled) {
            return;
        }
        try {
            // 不校验 owner：原持锁实例已崩溃/重启，新实例 abort 时需要解掉孤儿锁
            port.deleteAny(lockIndex, indexKey);
            logger.warn("[RebuildLock] FORCE released indexKey={} by={} (owner-check bypassed)", indexKey, owner);
        } catch (Exception e) {
            logger.warn("[RebuildLock] forceRelease failed indexKey={}: {}", indexKey, e.getMessage(), e);
        }
    }

    @Override
    public RebuildLock get(String indexKey) {
        if (!enabled) {
            return null;
        }
        try {
            LockDocPort.LockDoc doc = port.get(lockIndex, indexKey);
            if (doc == null) {
                return null;
            }
            Map<String, Object> src = doc.source();
            return new RebuildLock((String) src.get(FIELD_OWNER), toLong(src.get(FIELD_ACQUIRE_TIME)),
                    toLong(src.get(FIELD_EXPIRE_TIME)), doc.seqNo(), doc.primaryTerm());
        } catch (Exception e) {
            logger.warn("[RebuildLock] get failed indexKey={}: {}", indexKey, e.getMessage(), e);
            return null;
        }
    }

    private Map<String, Object> lockSource(long acquireTime, long expireTime) {
        Map<String, Object> m = new HashMap<>();
        m.put(FIELD_OWNER, owner);
        m.put(FIELD_ACQUIRE_TIME, acquireTime);
        m.put(FIELD_EXPIRE_TIME, expireTime);
        return m;
    }

    private static long toLong(Object v) {
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }
}
