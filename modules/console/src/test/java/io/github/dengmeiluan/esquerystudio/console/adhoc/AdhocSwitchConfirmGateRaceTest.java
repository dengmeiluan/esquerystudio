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
import org.junit.Test;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 *  切换前人工确认门的<b>并发裁决</b>测试。
 *
 * <p><b>本测试声称要防的失败模式 X：</b>人在超时判定的同一瞬间点了确认，导致<b>两条路径双双生效</b> ——
 * 超时路径解除了写阻断并置 ABORTED，而确认路径又让作业继续走到别名切换。
 * 那就是在一个<b>已经解除写阻断</b>的索引上做切换，是数据一致性事故。</p>
 *
 * <p>测试直接驱动生产方法 {@link AdhocRebuildService#awaitSwitchConfirm}（未复刻判定逻辑），
 * 判别器落在<b>真实副作用</b>上：fake admin 记录的 {@code setIndexWriteBlock(idx,false)} 次数，
 * 与门返回 true（放行切换）的次数。不依赖 stage 字符串或"字段是否 volatile"这类代理指标。</p>
 *
 * <p><b>为什么用「在 CAS 处挂住」而不是屏障+随机延迟。</b>实测两次：仅同步线程启动时确认方
 * 2000/2000 全胜；加随机自旋后仍 1351/0 全胜、超时分支一次都没进。原因是 worker 抵达 CAS 前
 * 还要 setStage/取时钟/进循环，而 {@code while (!isSwitchConfirmed())} 会让"确认已先到"的迭代
 * 直接短路出循环 —— <b>超时分支根本不可达，测试在没测到东西的情况下变绿</b>。
 * 故这里覆写 {@link AdhocRebuildJob#tryCloseGate} 把 worker <b>精确挂在它的 CAS 之前</b>，
 * 再让确认方 CAS，从而真正制造"两者同时抵达裁决点"的交错。</p>
 */
public class AdhocSwitchConfirmGateRaceTest {

    /** 记录真实解除写阻断调用的 fake（EsIndexAdmin 是 class 且方法可覆写，无需新增测试依赖）。 */
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
     * 把 worker 精确挂在超时 CAS 之前的 job。
     *
     * <p>{@code arrivedAtCas} 在 worker 即将执行 CAS 时打开，{@code releaseCas} 由测试主线程
     * 在安排好确认方之后放行 —— 于是"确认与超时同时抵达裁决点"成为确定可复现的事件。</p>
     */
    private static final class GateBlockingJob extends AdhocRebuildJob {
        final CountDownLatch arrivedAtCas = new CountDownLatch(1);
        final CountDownLatch releaseCas = new CountDownLatch(1);

        GateBlockingJob(Strategy strategy) {
            super("job-race", "logical", strategy, true, "src_idx", "dest_idx",
                    "updateTime", 120_000L, false, true);
        }

        @Override
        public boolean tryCloseGate(String outcome) {
            arrivedAtCas.countDown();
            try {
                releaseCas.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return super.tryCloseGate(outcome);
        }
    }

    /** confirmTimeoutMs=0：死线在进入门的那一刻即已过期，worker 就走向超时 CAS。 */
    private static AdhocRebuildService serviceWithImmediateDeadline(EsIndexAdmin admin) {
        return new AdhocRebuildService(admin, () -> null, 0L);
    }

    private static AdhocRebuildJob newPausingJob() {
        return new AdhocRebuildJob("job-race", "logical", AdhocRebuildJob.Strategy.WRITE_BLOCK,
                true, "src_idx", "dest_idx", "updateTime", 120_000L, false, true);
    }

    /**
     * 失败模式 X 的正面钉子：确认在 worker <b>已判定超时、正要 CAS</b> 的那一瞬间到达时，
     * {解除写阻断, 放行切换} 必须<b>恰好发生一个</b>。
     *
     * <p>这是 X 的精确构造：worker 已经越过超时判定（不可回头），确认此刻才落地。
     * 若无 CAS 仲裁，worker 会解除挡写、同时确认让作业继续切换 —— 双双生效。</p>
     */
    @Test
    public void confirmArrivingExactlyAtTimeoutCas_onlyOneSideTakesEffect() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = serviceWithImmediateDeadline(admin);
        GateBlockingJob job = new GateBlockingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        AtomicInteger gateAllowedSwitch = new AtomicInteger();

        Thread worker = new Thread(() -> {
            try {
                if (service.awaitSwitchConfirm(job)) {
                    gateAllowedSwitch.incrementAndGet();
                }
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }, "gate-worker");
        worker.start();

        // 等 worker 走到"超时已判定成立、CAS 尚未执行"的那一点
        assertThat(job.arrivedAtCas.await(10, TimeUnit.SECONDS))
                .as("worker 未抵达超时 CAS —— 前置构造失败，本测试没有制造出竞态")
                .isTrue();

        // 人工确认此刻落地（赢下 CAS），随后放行 worker 的 CAS（必然失败）
        boolean confirmWon = job.confirmSwitch();
        job.releaseCas.countDown();
        worker.join(10_000L);

        assertThat(confirmWon).as("确认先于 worker CAS 落地，应赢得裁决").isTrue();
        assertThat(gateAllowedSwitch.get() + admin.unblockCalls.get())
                .as("恰好一个副作用：双双生效=在已解除阻断的索引上切换；双双落空=作业卡死")
                .isEqualTo(1);
        assertThat(admin.unblockCalls.get())
                .as("确认赢了，worker 绝不能解除写阻断 —— 那正是失败模式 X")
                .isZero();
        assertThat(gateAllowedSwitch.get()).as("确认赢了就必须放行切换").isEqualTo(1);
        assertThat(job.getGateOutcome()).isEqualTo(AdhocRebuildJob.GATE_CONFIRMED);
    }

    /** 镜像方向：worker 的超时 CAS 先落地，随后到达的确认必须失败且不产生第二个副作用。 */
    @Test
    public void confirmArrivingAfterTimeoutCas_isRejectedAndNoSwitch() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = serviceWithImmediateDeadline(admin);
        GateBlockingJob job = new GateBlockingJob(AdhocRebuildJob.Strategy.WRITE_BLOCK);
        AtomicInteger gateAllowedSwitch = new AtomicInteger();

        Thread worker = new Thread(() -> {
            try {
                if (service.awaitSwitchConfirm(job)) {
                    gateAllowedSwitch.incrementAndGet();
                }
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }, "gate-worker");
        worker.start();

        assertThat(job.arrivedAtCas.await(10, TimeUnit.SECONDS)).isTrue();
        job.releaseCas.countDown();   // 先让超时 CAS 落地
        worker.join(10_000L);

        boolean confirmWon = job.confirmSwitch(); // 确认迟到

        assertThat(confirmWon).as("超时已赢，确认必须输 —— 否则操作者以为切换正在进行").isFalse();
        assertThat(gateAllowedSwitch.get() + admin.unblockCalls.get())
                .as("恰好一个副作用")
                .isEqualTo(1);
        assertThat(admin.unblockCalls.get()).as("超时赢了必须解除写阻断").isEqualTo(1);
        assertThat(gateAllowedSwitch.get()).as("超时赢了绝不能放行切换").isZero();
        assertThat(job.getGateOutcome()).isEqualTo(AdhocRebuildJob.GATE_TIMED_OUT);
    }

    /** 确认已先赢时，门必须放行切换并保留写阻断（不经阻塞 job，走完整正常路径）。 */
    @Test
    public void timeoutLoses_thenGateAllowsSwitchAndKeepsWriteBlock() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = serviceWithImmediateDeadline(admin);
        AdhocRebuildJob job = newPausingJob();
        job.confirmSwitch();

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(allowed).as("确认已赢，门必须放行切换").isTrue();
        assertThat(admin.unblockCalls.get())
                .as("确认赢了却解除写阻断 = 在即将被切换的索引上撤掉阻断")
                .isZero();
        assertThat(job.getGateOutcome()).isEqualTo(AdhocRebuildJob.GATE_CONFIRMED);
    }

    /** 超时赢了：门不放行、解除挡写、置 ABORTED。 */
    @Test
    public void timeoutWins_releasesWriteBlockAndBlocksSwitch() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = serviceWithImmediateDeadline(admin);
        AdhocRebuildJob job = newPausingJob();

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(allowed).as("超时后绝不能放行切换").isFalse();
        assertThat(admin.unblockCalls.get()).as("WRITE_BLOCK 超时必须解除写阻断").isEqualTo(1);
        assertThat(job.getStatus()).isEqualTo("ABORTED");
        assertThat(job.getGateOutcome()).isEqualTo(AdhocRebuildJob.GATE_TIMED_OUT);
    }

    /** 输掉的确认不得把作业标记为已放行。 */
    @Test
    public void losingConfirm_doesNotMarkJobConfirmed() {
        AdhocRebuildJob job = newPausingJob();
        job.tryCloseGate(AdhocRebuildJob.GATE_TIMED_OUT);

        assertThat(job.confirmSwitch()).isFalse();
        assertThat(job.isSwitchConfirmed())
                .as("输掉的确认不得把作业标记为已放行")
                .isFalse();
    }

    /**
     * 超时报告文案必须按策略如实描述：非 WRITE_BLOCK 策略不得声称阻断过。
     * 对不存在之物的陈述会让操作者以为发生过阻断。
     */
    @Test
    public void timeoutReport_doesNotClaimWriteBlockForNonBlockingStrategy() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = serviceWithImmediateDeadline(admin);
        AdhocRebuildJob job = new AdhocRebuildJob("job-inc", "logical", AdhocRebuildJob.Strategy.INCREMENTAL,
                true, "src_idx", "dest_idx", "updateTime", 120_000L, false, true);

        service.awaitSwitchConfirm(job);

        @SuppressWarnings("unchecked")
        Map<String, Object> report = (Map<String, Object>) job.toMap().get("report");
        assertThat(report.get("hadWriteBlock")).as("INCREMENTAL 全程未阻断写入").isEqualTo(false);
        assertThat(admin.unblockCalls.get()).as("没加过阻断就不该去解除").isZero();
        assertThat(String.valueOf(report.get("hint")))
                .as("不得对未发生的阻断声称『已解除』")
                .doesNotContain("写阻断已解除");
    }

    /**
     * `toMap()` 必须暴露门的精确结局，且三种结局各自可辨。
     *
     * <p><b>本断言声称防的失败模式</b>：下游（控制台/-8）拿不到门结局，只能从 {@code status}
     * 反推 —— 而 {@code status} 对「超时中止」与「人工中止」是同一个 ABORTED，分不开。</p>
     *
     * <p>注意这里<b>不用</b>「toMap 含 gateOutcome 键」做断言：那种写法在值被写死成 null
     * 或恒定字符串时照样通过（键存在≠值有判别力）。故逐一构造三种结局并要求映射到各自的常量，
     * 同时钉住未决态为 null —— 判别力全部来自这四条具名等值断言。</p>
     */
    @Test
    public void toMap_exposesEachGateOutcomeDistinctly() {
        assertThat(newPausingJob().toMap().get("gateOutcome"))
                .as("未进门/未裁决时应为 null")
                .isNull();

        AdhocRebuildJob confirmed = newPausingJob();
        confirmed.confirmSwitch();
        AdhocRebuildJob timedOut = newPausingJob();
        timedOut.tryCloseGate(AdhocRebuildJob.GATE_TIMED_OUT);
        AdhocRebuildJob aborted = newPausingJob();
        aborted.tryCloseGate(AdhocRebuildJob.GATE_ABORTED);

        assertThat(confirmed.toMap().get("gateOutcome")).isEqualTo(AdhocRebuildJob.GATE_CONFIRMED);
        assertThat(timedOut.toMap().get("gateOutcome")).isEqualTo(AdhocRebuildJob.GATE_TIMED_OUT);
        assertThat(aborted.toMap().get("gateOutcome")).isEqualTo(AdhocRebuildJob.GATE_ABORTED);
    }

    /**
     * 等待期间 abort：必须解除写阻断、不放行切换、门结局记为 ABORTED。
     *
     * <p><b>本断言声称防的失败模式</b>：{@code AWAIT_CONFIRM} 期间收到 abort 时，worker 只是
     * 退出等待却<b>没有解除写阻断</b> —— 业务写入永久失败，而作业已显示 ABORTED、无人再管它。
     * （abort 分支与超时分支同构，但同构不等于验证过。）</p>
     */
    @Test
    public void abortDuringAwaitConfirm_releasesWriteBlockAndBlocksSwitch() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        // 超时给足，确保走的是 abort 分支而不是被超时抢先
        AdhocRebuildService service = new AdhocRebuildService(admin, () -> null, 600_000L);
        AdhocRebuildJob job = newPausingJob();
        job.requestAbort();

        boolean allowed = service.awaitSwitchConfirm(job);

        assertThat(allowed).as("abort 后绝不能放行切换").isFalse();
        assertThat(admin.unblockCalls.get())
                .as("等待期间 abort 必须解除写阻断 —— 否则业务永久写不进")
                .isEqualTo(1);
        assertThat(job.getGateOutcome())
                .as("门结局须是 ABORTED，与超时可区分")
                .isEqualTo(AdhocRebuildJob.GATE_ABORTED);
        assertThat(job.getStatus()).isEqualTo("ABORTED");

        @SuppressWarnings("unchecked")
        Map<String, Object> report = (Map<String, Object>) job.toMap().get("report");
        assertThat(report.get("reason")).isEqualTo("AWAIT_CONFIRM_ABORTED");
        assertThat(report.get("writeBlockReleased")).isEqualTo(true);
    }

    /**
     * 确认已赢下门之后，abort 必须被明确拒绝，且<b>不得置位 abortRequested</b>。
     *
     * <p><b>本断言声称防的失败模式</b>：确认已赢下门之后，abort 仍能置位并把一次
     * <b>切换后失败</b>伪装成用户中止。两层伤害：</p>
     * <ul>
     *   <li>端点回 200、{@code abortRequested=true} 写入成功，操作者据此认为已中止，
     *       而切换照常执行 —— 一次<b>说谎的中止应答</b>，与本 Task 立意直接冲突；</li>
     *   <li>{@code run()} 的 catch 用 {@code isAbortRequested()} 决定 ABORTED/FAILED，
     *       切换后 FINALIZE 抛异常时会被标成「用户主动中止」，<b>掩盖真实的切换后失败</b>。</li>
     * </ul>
     *
     * <p>本失败模式有两个独立后果，故<b>拆成两个测试方法</b>：同一方法内前一条断言失败会让
     * 后一条根本不执行（实测证伪时正是如此），那样第二条等于没被验证过。</p>
     */
    @Test
    public void abortAfterConfirmWon_isRejectedWithClearError() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = new AdhocRebuildService(admin, () -> null, 600_000L);
        AdhocRebuildJob job = newPausingJob();
        job.confirmSwitch(); // 确认赢下门，切换必然执行
        injectJob(service, job);

        Throwable thrown = catchThrowable(() -> service.abort(job.getJobId()));

        assertThat(thrown)
                .as("确认已放行后 abort 必须明确拒绝，而不是回一个说谎的成功应答")
                .isInstanceOf(IllegalStateException.class);
        assertThat(String.valueOf(thrown.getMessage()))
                .as("错误须说明原因，让操作者知道切换拦不住了")
                .contains("无法中止");
    }

    /**
     * 第二个后果单列：被拒绝的 abort <b>不得置位 abortRequested</b>。
     *
     * <p><b>本断言声称防的失败模式</b>：实现"先置位再抛错" —— 应答看起来正确（抛了错），
     * 但 {@code run()} 的 catch 用 {@code isAbortRequested()} 决定 ABORTED/FAILED，
     * 切换后 FINALIZE 抛异常时会被标成「用户主动中止」，把一次真实的切换后失败
     * 伪装成用户行为，事后排查被彻底带偏。</p>
     */
    @Test
    public void abortAfterConfirmWon_doesNotPoisonAbortFlag() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = new AdhocRebuildService(admin, () -> null, 600_000L);
        AdhocRebuildJob job = newPausingJob();
        job.confirmSwitch();
        injectJob(service, job);

        catchThrowable(() -> service.abort(job.getJobId())); // 抛不抛错由上一条测试负责

        assertThat(job.isAbortRequested())
                .as("abortRequested 被污染 → run() 的 catch 会把切换后失败标成 ABORTED，掩盖真实故障")
                .isFalse();
    }

    /** 门未裁决时 abort 仍须照常工作（不能因为加了守卫把正常中止也挡掉）。 */
    @Test
    public void abortBeforeGateDecided_stillWorks() throws Exception {
        RecordingAdmin admin = new RecordingAdmin();
        AdhocRebuildService service = new AdhocRebuildService(admin, () -> null, 600_000L);
        AdhocRebuildJob job = newPausingJob();
        injectJob(service, job);

        service.abort(job.getJobId());

        assertThat(job.isAbortRequested())
                .as("门未裁决时 abort 必须照常置位 —— 守卫不得误伤正常中止")
                .isTrue();
    }

    /** 把 job 塞进 service 的内存表（start() 需要真实 ES，这里只测 abort 的裁决逻辑）。 */
    private static void injectJob(AdhocRebuildService service, AdhocRebuildJob job) throws Exception {
        java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("jobs");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, AdhocRebuildJob> jobs = (Map<String, AdhocRebuildJob>) f.get(service);
        jobs.put(job.getJobId(), job);
    }

    /** 解除写阻断失败时，报告必须说实话 —— 这正是最需要人立刻介入的情形。 */
    @Test
    public void timeoutReport_tellsTruthWhenReleaseFails() throws Exception {
        EsIndexAdmin failing = new EsIndexAdmin(null) {
            @Override
            public void setIndexWriteBlock(String index, boolean writeBlocked) throws IOException {
                throw new IOException("ES unreachable");
            }
        };
        AdhocRebuildService service = serviceWithImmediateDeadline(failing);
        AdhocRebuildJob job = newPausingJob();

        service.awaitSwitchConfirm(job);

        @SuppressWarnings("unchecked")
        Map<String, Object> report = (Map<String, Object>) job.toMap().get("report");
        assertThat(report.get("writeBlockReleased"))
                .as("解除失败却报告 true = 谎报安全，人会就此走开")
                .isEqualTo(false);
        assertThat(String.valueOf(report.get("hint")))
                .as("解除失败时不得声称业务写入已恢复")
                .doesNotContain("业务写入恢复");
    }
}
