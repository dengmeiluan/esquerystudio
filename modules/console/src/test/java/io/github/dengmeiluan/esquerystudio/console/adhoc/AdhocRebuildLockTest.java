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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 *  adhoc 重建锁。
 *
 * <p><b>本测试类声称要防的核心失败模式 X：</b>人工等待期间本实例已<b>失去</b>索引的重建锁
 * （锁被他人强夺，同一索引上可能正有<b>另一个重建</b>在跑），作业却<b>仍然去切换别名</b>。
 * 两个重建各自翻别名，后翻的赢，先翻的那个新索引成为孤儿 —— 正是这把锁存在要防的事故。</p>
 *
 * <p><b>为什么"续约成功"不能作为持有的证据。</b>{@code EsRebuildLockStore.renew} 刻意不校验
 * owner（"N 阶段无状态化"），只在 seqNo CAS 冲突或文档缺失时才失败。故锁被强夺后受害者的
 * 下一次 renew 通常仍会成功、把锁悄悄偷回来，两个实例同时认为自己持有。若实现只看
 * {@code renew()} 的布尔返回值，就<b>检测不到它声称要检测的那件事</b>。
 * {@link #renewSucceedingButOwnerChanged_abortsWithoutSwitch} 专钉这一条。</p>
 */
public class AdhocRebuildLockTest {

    /**
     * 任何用例挂住都必须<b>快速失败</b>而不是拖住构建：本类各用例都应在毫秒级终止，
     * 走到超时兜底即说明实现有缺陷，此时"慢"本身就是失败信号。
     */
    @Rule
    public Timeout globalTimeout = Timeout.seconds(30);

    private static final String SELF = "pid1@hostA";
    private static final String OTHER = "pid2@hostB";

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
        return new AdhocRebuildService(admin, () -> null, 5_000L, store, 3L);
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

    @SuppressWarnings("unchecked")
    private static Map<String, Object> reportOf(AdhocRebuildJob job) {
        return (Map<String, Object>) job.toMap().get("report");
    }

    // ================================================================ 失败模式 X 的正面钉子

    /**
     * <b>X 的精确构造</b>：renew 返回 <b>true</b>（实现若只信这个布尔值就会继续推进），
     * 但锁文档的 owner 已经是<b>别人</b> —— 锁已被强夺，同一索引上可能有第二个重建。
     * 此时门<b>必须</b>拒绝放行切换。
     *
     * <p><b>为什么不能只断言 {@code allowed==false}。</b>证伪时实测：删掉 owner 读回校验后，
     * 作业不再检测到失锁，而是一路等到<b>确认超时</b>才退出——超时同样返回 false，
     * 于是"只看 allowed==false"的断言<b>照样通过</b>，等于没测到锁校验。
     * 故这里必须同时钉住<b>中止的归因</b>是 LOCK_LOST 且<b>不是</b>超时，
     * 并要求它<b>远快于</b>超时兜底（毫秒级 vs 5s）。</p>
     */
    @Test
    public void renewSucceedingButOwnerChanged_abortsWithoutSwitch() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);           // 锁已被他人强夺
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);

        long t0 = System.currentTimeMillis();
        boolean allowed = service.awaitSwitchConfirm(job);
        long elapsed = System.currentTimeMillis() - t0;

        assertThat(store.getCalls.get())
                .as("前置构造校验：等待循环必须真的读过锁状态，否则本测试什么都没测到")
                .isGreaterThan(0);
        assertThat(allowed)
                .as("失锁却放行切换 = 在可能有第二个重建在跑的索引上翻别名（失败模式 X）")
                .isFalse();
        assertThat(reportOf(job).get("reason"))
                .as("中止必须归因于失锁；若归因是超时，说明锁校验根本没生效（证伪实测到的假绿）")
                .isEqualTo(AdhocRebuildService.REASON_LOCK_LOST);
        assertThat(elapsed)
                .as("失锁应在毫秒级立即中止，而不是拖到 5s 的确认超时兜底")
                .isLessThan(3_000L);
    }

    /** 丢锁中止后，门结局必须已裁决为 ABORTED —— 否则 confirmSwitch 仍能事后放行切换。 */
    @Test
    public void lockLost_closesGateSoLateConfirmCannotReopenSwitch() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);

        service.awaitSwitchConfirm(job);

        assertThat(job.getGateOutcome())
                .as("门未裁决则迟到的确认仍能赢下 CAS，把一个已失锁的作业重新放行去切换")
                .isEqualTo(AdhocRebuildJob.GATE_ABORTED);
        assertThat(job.confirmSwitch())
                .as("门已关闭，迟到的确认必须输")
                .isFalse();
    }

    /**
     * 丢锁中止必须解除写阻断 —— 否则业务永久写不进，而作业已显示 ABORTED、无人再管。
     *
     * <p>同时钉住归因：超时兜底<b>同样</b>会解除写阻断，只断言 unblockCalls==1 会被
     * 一个完全不做锁校验、纯靠超时退出的实现满足（证伪实测到的假绿形态）。</p>
     */
    @Test
    public void lockLost_releasesWriteBlock() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = serviceWith(admin, store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);

        service.awaitSwitchConfirm(job);

        assertThat(reportOf(job).get("reason"))
                .as("前置构造校验：必须走的是失锁路径，而不是超时兜底")
                .isEqualTo(AdhocRebuildService.REASON_LOCK_LOST);
        assertThat(admin.unblockCalls.get())
                .as("WRITE_BLOCK 丢锁中止必须解除写阻断")
                .isEqualTo(1);
    }

    /** 丢锁的 reason 必须与超时/人工中止可区分，否则运维分不清作业为何停下。 */
    @Test
    public void lockLost_reportReasonIsDistinguishable() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);

        service.awaitSwitchConfirm(job);

        assertThat(reportOf(job).get("reason"))
                .as("三种停止原因必须各自可辨：超时 / 人工中止 / 丢锁")
                .isEqualTo(AdhocRebuildService.REASON_LOCK_LOST);
    }

    /**
     * 锁文档已消失（被释放/从未建立）同样必须中止。
     *
     * <p>与 owner 易主那条是<b>不同</b>的输入路径：这条走 {@code get()==null}（锁在生效但文档没了），
     * 那条走 owner 比对。任一路径漏判都会放行切换。</p>
     */
    @Test
    public void lockDocumentGone_abortsWithoutSwitch() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.docExists = false; // 锁在生效（enabled=true），但文档没了
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.setLockActive(true);

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(allowed).as("锁文档已消失=已失锁，绝不能切换").isFalse();
        assertThat(reportOf(job).get("reason"))
                .as("必须归因于失锁；归因成超时说明是等到超时才停，锁校验没生效")
                .isEqualTo(AdhocRebuildService.REASON_LOCK_LOST);
    }

    /**
     * <b>ES 不可达</b>时保守判失锁：读不到就无法证明自己仍持有。
     *
     * <p><b>按真实语义驱动</b>：{@code EsRebuildLockStore.get} catch 全部 Exception 并返回 null，
     * <b>永不抛异常</b>。故这里用「返回 null」而非「抛异常」构造 —— 让桩抛异常守的是一条
     * 真实世界不存在的路径（桩比真实实现<b>宽</b>），而真正该守的正是这条 null。</p>
     */
    @Test
    public void lockUnreadable_abortsConservativelyWithoutSwitch() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.docExists = false; // 真实 get() 在 ES 不可达时的表现：返回 null，不抛
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.setLockActive(true);

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(allowed).as("无法证明仍持锁时必须保守中止").isFalse();
        assertThat(reportOf(job).get("reason"))
                .as("必须归因于失锁；归因成超时说明异常被吞、根本没判失锁")
                .isEqualTo(AdhocRebuildService.REASON_LOCK_LOST);
    }

    // ================================================================ 与  不变量的交互

    /**
     * 确认已赢下 CAS 之后才发现失锁：切换<b>不可撤销</b>（ 的结构性不变量），
     * 但这个事实<b>必须进作业报告</b> —— 运维看的是控制台，不是 grep 日志。
     */
    @Test
    public void confirmedThenLockLost_stillSwitchesButReportsIt() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.confirmSwitch(); // 确认先赢下门

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(allowed)
                .as("确认已赢=切换不可撤销，为更罕见的丢锁场景破坏该不变量会引入新竞态")
                .isTrue();
        assertThat(job.toMap().get("switchedWithoutLock"))
                .as("无锁切换必须出现在 toMap() 上；只写日志=运维在控制台上看不到，等于没说")
                .isEqualTo(true);
    }

    /**
     * <b>失败模式 X</b>：无锁切换的事实<b>在切换成功后从 {@code toMap()} 消失</b>。
     *
     * <p>切换成功后 {@code run()} 会执行 {@code job.setReport(buildReport(...))}，
     * <b>整体替换</b> report map。若该事实只塞在 report 里，它会恰好在
     * <b>「无锁切换且成功」</b>——最需要事后追查的场景（数据可能已被另一个重建污染）——
     * 下消失，只在切换后失败时才留存。这是最坏的组合。</p>
     *
     * <p>故本用例在门放行后<b>模拟成功收尾的 setReport</b>，要求标记依然可见。</p>
     */
    @Test
    public void switchedWithoutLock_survivesTheSuccessPathReportOverwrite() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.confirmSwitch();

        service.awaitSwitchConfirm(job);
        assertThat(job.toMap().get("switchedWithoutLock"))
                .as("前置构造校验：门放行时必须已标记无锁切换，否则本用例没测到东西")
                .isEqualTo(true);

        // 模拟 run() 步骤 6 成功收尾：整体替换 report
        job.setReport(new LinkedHashMap<>(java.util.Collections.singletonMap("t0", 1L)));

        assertThat(job.toMap().get("switchedWithoutLock"))
                .as("切换成功后该事实从 toMap() 消失 = 恰好在最该追查的场景下不留痕（失败模式 X）")
                .isEqualTo(true);
    }

    /** 正常持锁完成的作业不得被标记为无锁切换（否则是虚报事故，运维白查一轮）。 */
    @Test
    public void switchedWithoutLock_isFalseWhenLockHeld() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore(); // holder 保持 SELF
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        job.confirmSwitch();

        service.awaitSwitchConfirm(job);

        assertThat(job.toMap().get("switchedWithoutLock"))
                .as("锁好端端在手里却报告无锁切换 = 虚报事故")
                .isEqualTo(false);
    }

    /**
     * <b>顺序性质：必须"先验归属、后续约"。</b>
     *
     * <p><b>本断言声称防的失败模式</b>：实现写成"先 renew 再读回比对 owner"。
     * {@code EsRebuildLockStore.renew} 读出锁文档后用 {@code lockSource(...)} <b>整份重写</b>，
     * 而 {@code lockSource} 写的是<b>调用方自己的 owner</b> —— 于是受害者一次 renew 就把
     * owner 改成了自己，随后读回比对必然通过，<b>失锁永远检测不到</b>。
     * 这不是理论风险：本实现最初正是这个顺序，靠核实 {@code lockSource} 才发现。</p>
     *
     * <p>判别器落在<b>调用顺序</b>本身：锁已属他人时，{@code renew} 必须<b>一次都没被调用</b>
     * （已判失锁就不该再去续约一把不属于自己的锁）。</p>
     */
    @Test
    public void ownershipIsVerifiedBeforeRenewing() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);

        service.awaitSwitchConfirm(job);

        assertThat(store.getCalls.get())
                .as("前置构造校验：必须真的读过锁状态")
                .isGreaterThan(0);
        assertThat(store.renewCalls.get())
                .as("先 renew 会把 owner 改写成自己，之后的归属校验必然通过 —— 失锁永远检测不到")
                .isZero();
    }

    // ================================================================ C2 的下游后果

    /**
     * C2 的<b>下游后果</b>：一旦 {@code lockActive} 被误判为 false，续约点就整体短路，
     * 「锁读不到」这件事再也不会被发现，作业一路放行到切换。
     *
     * <p><b>本用例只钉下游</b>：判定本身在 {@code start()} 里，由
     * {@code AdhocStartLockTest.unreadableLockIsNotMistakenForDisabledLock} 钉住 ——
     * 在这里自己算一遍 {@code isEnabled()} 会绕过被测逻辑（实测确认：那样写证伪全绿）。</p>
     */
    @Test
    public void lockActiveTrueButUnreadable_abortsInsteadOfSwitching() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.enabled = true;    // 锁确实启用
        store.docExists = false; // 但读不到
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK); // lockActive=true

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(allowed)
                .as("锁在生效却读不到时照常切换 = 静默降级为无锁运行")
                .isFalse();
        assertThat(reportOf(job).get("reason"))
                .as("必须归因于失锁并中止，而不是悄悄放行")
                .isEqualTo(AdhocRebuildService.REASON_LOCK_LOST);
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

    /**
     * <b>I3：TOCTOU 窗口的兜底性质。</b>「先验归属、后续约」两步之间，他人可能强夺锁。
     * 真实实现靠 {@code setIfSeqNo/setIfPrimaryTerm} CAS 兜住：seqNo 变了 → renew 冲突返回 false
     * → 仍然正确判失锁。
     *
     * <p>构造：归属校验通过（holder=SELF）之后、续约之前，锁被他人夺走。
     * 桩的 renew 复刻 CAS（holder 不再是 SELF 则返回 false），故这条兜底性质才有测试守住。</p>
     */
    @Test
    public void lockStolenInsideTheCheckRenewWindow_isCaughtByRenewCas() throws Exception {
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        ScriptedLockStore store = new ScriptedLockStore() {
            @Override
            public RebuildLock get(String indexKey) {
                RebuildLock lock = super.get(indexKey); // 此刻仍是 SELF，归属校验会通过
                holder.set(OTHER);                      // 窗口内被他人强夺
                return lock;
            }
        };
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(store.renewCalls.get())
                .as("前置构造校验：归属校验必须已通过并走到续约，否则没测到 TOCTOU 窗口")
                .isGreaterThan(0);
        assertThat(allowed)
                .as("窗口内被强夺却照常切换 —— renew 的 seqNo CAS 正是为兜住这一刻")
                .isFalse();
        assertThat(reportOf(job).get("reason"))
                .as("必须归因于失锁")
                .isEqualTo(AdhocRebuildService.REASON_LOCK_LOST);
    }

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

    /**
     * 丢锁之后<b>绝不能</b>再调 {@code release} —— 锁现属强夺者，而
     * {@code EsRebuildLockStore.release} 刻意<b>不校验 owner</b>，删下去等于把
     * <b>正在跑的那个重建</b>的互斥保护摘掉，第三个人随即又能起一个作业。
     *
     * <p>本失败模式是写报告时才发现的、由本 Task 自身引入的缺陷：
     * {@code run()} 的 {@code finally} 无条件释放锁，丢锁中止同样会走到它。</p>
     */
    @Test
    public void lockLost_doesNotReleaseTheStealersLock() throws Exception {
        ScriptedLockStore store = new ScriptedLockStore();
        store.holder.set(OTHER);
        AdhocRebuildService service = serviceWith(new RecordingAdmin(), store);
        AdhocRebuildJob job = pausingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);

        service.awaitSwitchConfirm(job);
        invokeReleaseLockQuietly(service, job); // 模拟 run() 的 finally

        assertThat(job.isLockLost())
                .as("前置构造校验：必须真的判定过失锁，否则本用例没测到东西")
                .isTrue();
        assertThat(store.releaseCalls.get())
                .as("失锁后仍 release = 删掉强夺者的锁，摘掉正在跑的那个重建的互斥保护")
                .isZero();
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
