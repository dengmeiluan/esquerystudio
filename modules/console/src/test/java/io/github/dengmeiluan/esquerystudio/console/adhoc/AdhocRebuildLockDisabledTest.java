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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.Timeout;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 *  adhoc 重建锁的降级与共存语义：{@code esquerystudio.elasticsearch.lock.enabled=false}
 * 时作业必须照常完成（关掉分布式锁不等于关掉重建），以及锁校验不得误伤正常路径
 * （持锁放行、无锁构造原样运行、正常收尾还锁）。
 *
 * <p>失锁检测与防护语义（锁被强夺后绝不能切换别名等）由 {@link AdhocRebuildLockTest} 覆盖；
 * 两类拆开各自独立成 suite，便于 surefire 并行分摊。</p>
 */
public class AdhocRebuildLockDisabledTest {

    /**
     * 任何用例挂住都必须<b>快速失败</b>而不是拖住构建：本类各用例都应在毫秒级终止，
     * 走到超时兜底即说明实现有缺陷，此时"慢"本身就是失败信号。
     */
    @Rule
    public Timeout globalTimeout = Timeout.seconds(30);

    private static final String SELF = "pid1@hostA";

    /** 记录真实副作用的 fake（EsIndexAdmin 是 class 且方法可覆写，无需新增测试依赖）。 */
    private static final class RecordingAdmin extends EsIndexAdmin {
        final AtomicInteger unblockCalls = new AtomicInteger();

        RecordingAdmin() {
            super(null);
        }

        @Override
        public void setIndexWriteBlock(String index, boolean writeBlocked) throws IOException {
            if (!writeBlocked) {
                unblockCalls.incrementAndGet();
            }
        }
    }

    /**
     * 可编排的锁 store：renew 的返回值与"锁当前 owner"可<b>独立</b>设定 —— 这正是复现
     * "renew 成功但锁已易主"所必需的，用真实 ES store 无法在单测里稳定构造该交错。
     *
     * <p><b>忠实复刻真实 store 的 owner 改写语义</b>：{@code EsRebuildLockStore.renew} 读出锁文档后
     * 用 {@code lockSource(...)} <b>整份重写</b>，而 {@code lockSource} 写的是<b>调用方自己的 owner</b>
     * —— 即 renew 不只是"不校验 owner"，它会<b>静默把 owner 改成自己</b>。
     * 桩若不复刻这一点，"先 renew 再读回比对"的错误实现（读到的必然是自己，失锁永远检测不到）
     * 会被整类测试放过。</p>
     */
    private static class ScriptedLockStore implements RebuildLockStore {
        final AtomicInteger acquireCalls = new AtomicInteger();
        final AtomicInteger releaseCalls = new AtomicInteger();
        final AtomicInteger renewCalls = new AtomicInteger();
        /** 读锁状态的次数：归属校验必须发生在续约<b>之前</b>，故它才是"是否真的验过锁"的指标 */
        final AtomicInteger getCalls = new AtomicInteger();
        volatile boolean acquireResult = true;
        /**
         * 对应 {@code esquerystudio.elasticsearch.lock.enabled}。false 时忠实复刻真实 store 的<b>整套</b>降级语义：
         * {@code tryAcquire}/{@code renew} 恒 true、{@code release} 空转、<b>{@code get} 恒 null</b>。
         * 桩若只复刻前两条（比真实实现<b>窄</b>），「关掉锁 → get 恒 null → 被误判失锁」这条
         * 真实分支就永远不会被驱动到。
         */
        volatile boolean enabled = true;
        /** 锁文档当前 owner；置成 OTHER 即表示锁已被他人强夺 */
        final AtomicReference<String> holder = new AtomicReference<>(SELF);
        /** 锁文档是否存在（false = 锁已被释放/从未建立），对应真实 get() 的 !isExists() → null */
        volatile boolean docExists = true;
        /** 真实 tryAcquire 在 IOException 时抛 IllegalStateException（保守失败），复刻该维度 */
        volatile boolean acquireThrows = false;

        @Override
        public boolean tryAcquire(String indexKey, long leaseMs) {
            acquireCalls.incrementAndGet();
            if (!enabled) {
                return true; // 真实实现：enabled=false 恒 true
            }
            if (acquireThrows) {
                throw new IllegalStateException("获取重建锁失败 indexKey=" + indexKey);
            }
            return acquireResult;
        }

        /**
         * 复刻真实 renew 的两条关键语义：
         * ① {@code if_seq_no/if_primary_term} CAS —— 锁已易主（seqNo 变了）则冲突返回 false；
         * ② CAS 通过后用 {@code lockSource(...)} 整份重写，<b>把 owner 改成调用方自己</b>。
         *
         * <p>①正是「先验归属、后续约」之间 TOCTOU 窗口的兜底：他人在窗口内强夺 → renew 冲突
         * → 仍能正确判失锁。桩若只看布尔标志，这条真实的安全性质就没有测试守住。</p>
         */
        @Override
        public boolean renew(String indexKey, long leaseMs) {
            renewCalls.incrementAndGet();
            if (!enabled) {
                return true; // 真实实现：enabled=false 恒 true
            }
            if (!docExists) {
                return false; // 真实实现：锁文档不存在 → false
            }
            if (!SELF.equals(holder.get())) {
                return false; // seqNo CAS 冲突：锁已易主，续约失败
            }
            holder.set(SELF); // CAS 通过后整份重写，owner 写成调用方自己
            return true;
        }

        @Override
        public void release(String indexKey) {
            releaseCalls.incrementAndGet();
        }

        @Override
        public void forceRelease(String indexKey) {
        }

        /**
         * 真实 get() 返回 null 的<b>三条</b>路径全部复刻：
         * ① {@code enabled=false}（早于 try 块直接 return null）；
         * ② 锁文档不存在；
         * ③ 任何异常（真实实现 catch 全部 Exception 并返回 null，<b>永不抛</b>）。
         */
        @Override
        public RebuildLock get(String indexKey) {
            getCalls.incrementAndGet();
            if (!enabled || !docExists) {
                return null;
            }
            return new RebuildLock(holder.get(), 0L, Long.MAX_VALUE, 1L, 1L);
        }

        @Override
        public String owner() {
            return SELF;
        }

        /** 真实实现直接返回 enabled 字段 —— 不从 get() 反推，故三种 null 成因不再被混同。 */
        @Override
        public boolean isEnabled() {
            return enabled;
        }
    }

    /**
     * leaseMs=3 → renewIntervalMs()=1ms，等待循环即到续约点。
     *
     * <p>confirmTimeoutMs 取 5s 而非 10 分钟：本类各用例都应在毫秒级由「确认已赢」或
     * 「丢锁中止」终止循环；一旦某个实现缺陷让它们走到超时兜底，用例必须<b>很快</b>失败，
     * 而不是把构建挂住十分钟（证伪时正遇到过）。</p>
     */
    private static AdhocRebuildService serviceWith(EsIndexAdmin admin, RebuildLockStore store) {
        return new AdhocRebuildService(admin, () -> null, 5_000L, store, 3L,
                new InMemoryAdhocJobStore(), null, null, 1L);
    }

    /**
     * 构造一个<b>锁在生效</b>的暂停作业。{@code lockActive=true} 对应真实 {@code start()} 中
     * 「取锁成功且能读到锁文档」的探测结果 —— 直接 new 出来的 job 绕过了 start()，须显式置位。
     */
    private static AdhocRebuildJob pausingJob(AdhocRebuildJob.Strategy strategy) {
        AdhocRebuildJob job = new AdhocRebuildJob("job-lock", "logical", strategy,
                true, "src_idx", "dest_idx", "updateTime", 120_000L, false, true);
        job.setLockActive(true);
        return job;
    }

    // ================================================================ lock.enabled=false 降级

    /**
     * <b>失败模式 X（C1）</b>：{@code esquerystudio.elasticsearch.lock.enabled=false} 时作业被<b>误判失锁而拒绝切换</b>。
     *
     * <p>{@code Lock.enabled} 的 javadoc 明写「单实例或测试场景可关」，是<b>受支持的生产开关</b>。
     * 关闭时真实 store 的 {@code tryAcquire}/{@code renew} 恒 true，但 <b>{@code get} 恒 null</b>。
     * 若把这个 null 当成「锁没了」，则：取锁成功 → 作业正常跑 → 第一个续约点 get() 返回 null
     * → 判失锁 → GATE_ABORTED → 拒绝切换。即<b>关掉分布式锁 = 重建功能整体失效</b>，
     * 比  之前更差。</p>
     *
     * <p><b>必须走「尚未确认」的路径。</b>若先 {@code confirmSwitch()}，
     * {@code while (!isSwitchConfirmed())} 会直接短路出循环、<b>根本到不了续约点</b>，
     * 于是缺陷实现也照样放行 —— 那样本用例就<b>无法分辨对错</b>（实测确认过）。
     * 故这里让确认<b>稍后</b>由另一线程送达：worker 必须先在循环里经过续约点，
     * 缺陷实现会在那里判失锁中止。</p>
     */
    @Test
    public void lockDisabled_jobStillCompletesAndSwitches() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.enabled = false; // 复刻 lock.enabled=false 的整套降级语义
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.setLockActive(store.isEnabled()); // 与 start() 同源：直接问 store

        // 确认稍后送达：保证 worker 先经过续约点（缺陷实现会在那里误判失锁并中止）
        Thread confirmer = new Thread(() -> {
            try {
                Thread.sleep(1_200L);
                job.confirmSwitch();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "late-confirmer");
        confirmer.setDaemon(true);
        confirmer.start();

        boolean allowed = service.awaitSwitchConfirm(job);
        confirmer.join(5_000L);

        assertThat(job.isLockActive())
                .as("前置构造校验：lock.enabled=false 必须被探测为『锁未生效』")
                .isFalse();
        assertThat(allowed)
                .as("关掉分布式锁后作业被误判失锁、拒绝切换 = 关掉锁等于关掉整个重建功能（失败模式 X）")
                .isTrue();
        assertThat(job.getGateOutcome())
                .as("锁未启用不得产生任何丢锁裁决")
                .isEqualTo(AdhocRebuildJob.GATE_CONFIRMED);
    }

    /** 锁未启用时，报告不得声称"无锁切换" —— 那是虚报事故，会让运维白查一轮。 */
    @Test
    public void lockDisabled_doesNotReportSwitchedWithoutLock() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.enabled = false;
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.setLockActive(store.isEnabled());
        job.confirmSwitch();

        service.awaitSwitchConfirm(job);

        assertThat(job.toMap().get("switchedWithoutLock"))
                .as("锁本就没启用，报告『无锁切换』是虚报事故")
                .isEqualTo(false);
    }

    /**
     * 锁未启用时不应去续约（没有锁可续），避免每个续约点一次无谓的 ES 往返。
     *
     * <p>同样必须走「尚未确认」的路径 —— 先确认会短路出循环、根本到不了续约点，
     * 那样 {@code renewCalls==0} 对任何实现都成立（恒真）。</p>
     */
    @Test
    public void lockDisabled_doesNotAttemptRenew() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.enabled = false;
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.setLockActive(store.isEnabled());
        int getsAfterProbe = store.getCalls.get();

        Thread confirmer = new Thread(() -> {
            try {
                Thread.sleep(1_200L);
                job.confirmSwitch();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "late-confirmer");
        confirmer.setDaemon(true);
        confirmer.start();

        service.awaitSwitchConfirm(job);
        confirmer.join(5_000L);

        assertThat(store.getCalls.get())
                .as("前置构造校验：等待循环必须真的经过续约点（否则本用例恒真）")
                .isEqualTo(getsAfterProbe);
        assertThat(store.renewCalls.get())
                .as("锁未启用却仍在续约 = 每个续约点一次无谓的 ES 往返")
                .isZero();
    }

    // ================================================================ 正常路径不受锁校验误伤

    /** 持锁正常时门必须照常放行 —— 加了锁校验不得误伤正常路径。 */
    @Test
    public void lockHeld_gateStillAllowsConfirmedSwitch() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.confirmSwitch();

        assertThat(service.awaitSwitchConfirm(job))
                .as("锁正常持有时不得误伤正常放行")
                .isTrue();
    }

    /**
     * 无锁构造（lockStore=null）时行为与  之前完全一致：门照常放行，不因缺锁而中止。
     * 既有 12 个  测试全部走这条路径。
     */
    @Test
    public void noLockStore_behavesExactlyAsBefore() throws Exception {
        AdhocRebuildService service = new AdhocRebuildService(new RecordingAdmin(), () -> null, 5_000L);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.confirmSwitch();

        assertThat(service.awaitSwitchConfirm(job))
                .as("未接锁的构造不得因 lockStore 缺失而中止作业")
                .isTrue();
    }

    /** 正常持锁的作业收尾时<b>必须</b>释放锁，否则索引被锁死一个租约期。 */
    @Test
    public void lockHeld_releasesLockOnFinish() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore(); // holder 保持 SELF
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);

        invokeReleaseLockQuietly(service, job);

        assertThat(store.releaseCalls.get())
                .as("正常收尾不还锁 = 该索引整个租约期内无法重建（守卫不得误伤正常释放）")
                .isEqualTo(1);
    }

    /** 反射调用 run() 的 finally 所用的私有释放方法（run() 全程需要真实 ES，无法整体驱动）。 */
    private static void invokeReleaseLockQuietly(AdhocRebuildService service, AdhocRebuildJob job) throws Exception {
        java.lang.reflect.Method m = AdhocRebuildService.class
                .getDeclaredMethod("releaseLockQuietly", AdhocRebuildJob.class);
        m.setAccessible(true);
        m.invoke(service, job);
    }
}
