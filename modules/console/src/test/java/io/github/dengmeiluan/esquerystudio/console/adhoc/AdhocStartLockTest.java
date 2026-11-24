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
import org.junit.Test;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 *  {@code start()} 的取锁与<b>锁泄漏</b>。
 *
 * <p>本类各方法各自声称的失败模式写在各自的 javadoc 上。共同背景：锁一旦泄漏，
 * 该索引在<b>整个租约期</b>（默认 60 分钟）内都无法再发起重建，而没有任何作业在跑。</p>
 */
public class AdhocStartLockTest {

    /** start() 走别名模式所需的最小桩：别名存在、write 索引确定、目标不存在。 */
    private static class StartableAdmin extends EsIndexAdmin {
        StartableAdmin() {
            super(null);
        }

        @Override
        public boolean aliasExists(String alias) throws IOException {
            return true;
        }

        @Override
        public String getWriteIndex(String alias) throws IOException {
            return "src_idx";
        }

        @Override
        public boolean indexExists(String index) throws IOException {
            return false;
        }

        @Override
        public String getMapping(String index) throws IOException {
            return "{\"properties\":{}}";
        }
    }

    /**
     * 与 {@code AdhocRebuildLockTest.ScriptedLockStore} 同源地对齐真实 {@code EsRebuildLockStore}：
     * {@code enabled} 两态 + {@code get} 的三条 null 路径 + {@code tryAcquire} 的抛异常维度。
     *
     * <p><b>两个桩必须一起对齐。</b>只对齐其中一个，另一份就会继续比真实实现<b>窄</b>，
     * 相应的真实分支在该测试类里零覆盖 —— 同一种假绿会在第二个文件里原样复发。</p>
     */
    private static class CountingLockStore implements RebuildLockStore {
        final AtomicInteger acquireCalls = new AtomicInteger();
        final AtomicInteger releaseCalls = new AtomicInteger();
        volatile boolean acquireResult = true;
        /** 对应 esquerystudio.elasticsearch.lock.enabled：false 时 tryAcquire/renew 恒 true、get 恒 null、release 空转 */
        volatile boolean enabled = true;
        /** 锁文档是否存在；false 对应真实 get() 的 !isExists() → null */
        volatile boolean docExists = true;
        /** 真实 tryAcquire 在 IOException 时抛 IllegalStateException（保守失败） */
        volatile boolean acquireThrows = false;

        @Override
        public boolean tryAcquire(String indexKey, long leaseMs) {
            acquireCalls.incrementAndGet();
            if (!enabled) {
                return true;
            }
            if (acquireThrows) {
                throw new IllegalStateException("获取重建锁失败 indexKey=" + indexKey);
            }
            return acquireResult;
        }

        @Override
        public boolean renew(String indexKey, long leaseMs) {
            return true;
        }

        @Override
        public void release(String indexKey) {
            releaseCalls.incrementAndGet();
        }

        @Override
        public void forceRelease(String indexKey) {
        }

        @Override
        public RebuildLock get(String indexKey) {
            if (!enabled || !docExists) {
                return null;
            }
            return new RebuildLock("pid9@other", 0L, Long.MAX_VALUE, 1L, 1L);
        }

        @Override
        public String owner() {
            return "pid1@hostA";
        }

        @Override
        public boolean isEnabled() {
            return enabled;
        }
    }

    private static Map<String, Object> manualReq() {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "logical");
        req.put("strategy", "MANUAL");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");
        return req;
    }

    /**
     * <b>失败模式</b>：别人已持锁，第二个人仍能对同一索引起重建 —— 两者各建新物理索引、
     * 各翻别名，后翻的赢，先翻的那个新索引成为孤儿。这正是本 Task 要补的现存缺陷。
     */
    @Test
    public void startRejectedWhenLockHeldByOther() {
        CountingLockStore store = new CountingLockStore();
        store.acquireResult = false;
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);

        Throwable thrown = catchThrowable(() -> service.start(manualReq()));

        assertThat(thrown)
                .as("取锁失败却照常起作业 = 同一索引上两个重建并发翻别名")
                .isInstanceOf(IllegalStateException.class);
        assertThat(service.listJobs())
                .as("被拒绝的 start 不得留下作业记录")
                .isEmpty();
    }

    /** 取锁失败的错误消息要能让运维知道锁在谁手里，否则只能去 grep 日志。 */
    @Test
    public void startRejectionMessageNamesTheLockHolder() {
        CountingLockStore store = new CountingLockStore();
        store.acquireResult = false;
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);

        Throwable thrown = catchThrowable(() -> service.start(manualReq()));

        assertThat(String.valueOf(thrown.getMessage()))
                .as("错误消息须点出持锁者，否则运维无从下手")
                .contains("pid9@other");
    }

    /**
     * <b>失败模式</b>：{@code start()} 取锁成功后、worker 接手之前抛异常，锁<b>泄漏</b> ——
     * 该索引在整个租约期内无法重建，而根本没有作业在跑。
     *
     * <p>brief 原方案是"把取锁放在所有校验之后、并保证 submit 前无抛异常语句"。但
     * {@code worker.submit} <b>自身</b>就会抛 {@code RejectedExecutionException}（executor 已
     * shutdown，或 {@code newCachedThreadPool} 创建线程时 OOM）—— 调整语句顺序堵不住它。
     * 这里直接令 submit 抛错来钉住"异常路径必须还锁"。</p>
     */
    @Test
    public void lockReleasedWhenWorkerSubmitFails() throws Exception {
        CountingLockStore store = new CountingLockStore();
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);
        shutdownWorker(service); // 令后续 submit 必抛 RejectedExecutionException

        Throwable thrown = catchThrowable(() -> service.start(manualReq()));

        assertThat(thrown).as("前置构造校验：submit 必须真的失败，否则本测试没测到异常路径").isNotNull();
        assertThat(store.acquireCalls.get()).as("前置构造校验：必须真的取过锁").isEqualTo(1);
        assertThat(store.releaseCalls.get())
                .as("取锁后提交失败却不还锁 = 该索引整个租约期内无法重建，且无作业在跑")
                .isEqualTo(1);
    }

    /** 提交失败后不得留下僵尸作业记录（listJobs 会把它显示成运行中）。 */
    @Test
    public void noZombieJobWhenWorkerSubmitFails() throws Exception {
        CountingLockStore store = new CountingLockStore();
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);
        shutdownWorker(service);

        catchThrowable(() -> service.start(manualReq()));

        assertThat(service.listJobs())
                .as("提交失败却留下作业记录，控制台会把它显示成运行中的僵尸作业")
                .isEmpty();
    }

    /**
     * 校验失败（strategy 非法）时<b>不得</b>取锁 —— 否则一次手滑的参数错误就会锁住索引
     * 整个租约期。这钉住"取锁必须在所有校验之后"。
     */
    @Test
    public void noLockAcquiredWhenValidationFails() {
        CountingLockStore store = new CountingLockStore();
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);
        Map<String, Object> bad = manualReq();
        bad.put("strategy", "NOT_A_STRATEGY");

        catchThrowable(() -> service.start(bad));

        assertThat(store.acquireCalls.get())
                .as("校验失败前就取锁 = 一次参数手滑锁住索引一个租约期")
                .isZero();
    }

    /**
     * <b>M9：接线断言。</b>{@code start()} 必须把「锁是否在生效」写进 job —— 删掉那一行，
     * 本用例必须变红。
     *
     * <p>此前测试都自己 {@code setLockActive(...)} 再直驱 {@code awaitSwitchConfirm}，
     * <b>绕过了被测的接线</b>：删掉 {@code start()} 里的赋值，18 条锁用例仍然全绿。</p>
     */
    @Test
    public void startWiresLockActiveIntoTheJob() throws Exception {
        CountingLockStore store = new CountingLockStore(); // enabled=true
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);

        service.start(manualReq());

        assertThat(service.listJobs())
                .as("前置构造校验：作业必须真的建起来了")
                .hasSize(1);
        assertThat(service.listJobs().get(0).get("lockActive"))
                .as("start() 未把 lockActive 写进 job → 作业全程当作『锁未启用』，静默失去锁保护")
                .isEqualTo(true);
    }

    /** 锁未启用时，{@code start()} 写进 job 的 lockActive 必须是 false（同一条接线的反向）。 */
    @Test
    public void startWiresLockActiveFalseWhenLockDisabled() throws Exception {
        CountingLockStore store = new CountingLockStore();
        store.enabled = false;
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);

        service.start(manualReq());

        assertThat(service.listJobs().get(0).get("lockActive"))
                .as("lock.enabled=false 却写成 true → 每个作业都会在续约点被误判失锁")
                .isEqualTo(false);
    }

    /**
     * <b>C1 与 C2 的判定对</b>：两者的 {@code get()} <b>都</b>返回 null，但结论必须<b>相反</b> ——
     * {@code enabled=false} → 锁未启用；{@code enabled=true} 但读不到 → 锁仍在生效。
     *
     * <p>这钉住"三对一映射"不复发：若实现从 {@code get()} 反推，这两格会塌成同一个答案，
     * 而塌向"未启用"正是 C2（静默失去全部锁保护、控制台不留痕迹）。</p>
     */
    @Test
    public void disabledLockAndUnreadableLock_yieldOppositeVerdicts() throws Exception {
        CountingLockStore disabled = new CountingLockStore();
        disabled.enabled = false;
        CountingLockStore unreadable = new CountingLockStore();
        unreadable.enabled = true;
        unreadable.docExists = false;

        assertThat(disabled.get("logical"))
                .as("前置构造校验：两者 get() 必须都返回 null，否则没构造出三对一映射")
                .isNull();
        assertThat(unreadable.get("logical"))
                .as("前置构造校验：两者 get() 必须都返回 null")
                .isNull();

        AdhocRebuildService svcDisabled = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, disabled, 3_600_000L);
        AdhocRebuildService svcUnreadable = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, unreadable, 3_600_000L);
        svcDisabled.start(manualReq());
        svcUnreadable.start(manualReq());

        assertThat(svcDisabled.listJobs().get(0).get("lockActive"))
                .as("enabled=false → 锁未启用")
                .isEqualTo(false);
        assertThat(svcUnreadable.listJobs().get(0).get("lockActive"))
                .as("同样是 get()==null，但锁确实启用 —— 从 get() 反推会把两者混为一谈")
                .isEqualTo(true);
    }

    /**
     * <b>I6：{@code tryAcquire} 的异常维度。</b>真实实现在 IOException 时抛
     * {@code IllegalStateException}（保守失败，不静默放行）。此时锁尚未取到，
     * 故<b>不得</b>调用 release —— 释放一把根本没拿到的锁会误删他人的锁。
     */
    @Test
    public void startPropagatesAcquireFailureWithoutReleasing() {
        CountingLockStore store = new CountingLockStore();
        store.acquireThrows = true;
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);

        Throwable thrown = catchThrowable(() -> service.start(manualReq()));

        assertThat(thrown)
                .as("取锁抛异常时必须保守失败，不得当作取锁成功继续起作业")
                .isInstanceOf(IllegalStateException.class);
        assertThat(store.releaseCalls.get())
                .as("锁根本没取到就去 release = 删掉他人的锁（release 不校验 owner）")
                .isZero();
        assertThat(service.listJobs())
                .as("取锁失败不得留下作业记录")
                .isEmpty();
    }

    /**
     * <b>失败模式 X（C2）</b>：ES 读失败（或锁文档已被释放）被误判为「锁未启用」，
     * 作业<b>静默降级为无锁运行</b>。
     *
     * <p><b>失效方向的不对称是要害。</b>C1 是误报——拒绝切换、<b>吵闹地失败</b>，运维立刻发现；
     * C2 是漏报——不报错、{@code switchedWithoutLock} 恒 false、作业显示 SUCCEEDED、报告干净，
     * <b>控制台上无任何痕迹</b>，而  的全部安全性质都挂在 {@code lockActive} 这一个布尔上。</p>
     *
     * <p>构造：{@code enabled=true}（锁确实启用）但 {@code get()} 返回 null（真实实现吞掉 ES
     * 异常后的表现）。<b>必须经由 {@code start()}</b> —— 判定发生在生产代码的那一行上，
     * 测试自己算一遍 {@code isEnabled()} 等于绕过被测逻辑（实测确认过：那样写证伪全绿）。</p>
     */
    @Test
    public void unreadableLockIsNotMistakenForDisabledLock() throws Exception {
        CountingLockStore store = new CountingLockStore();
        store.enabled = true;    // 锁确实启用
        store.docExists = false; // 但读不到：ES 抖动/锁索引被删/文档已释放
        AdhocRebuildService service = new AdhocRebuildService(
                new StartableAdmin(), () -> null, 600_000L, store, 3_600_000L);

        service.start(manualReq());

        assertThat(service.listJobs())
                .as("前置构造校验：作业必须真的建起来了")
                .hasSize(1);
        assertThat(service.listJobs().get(0).get("lockActive"))
                .as("读不到锁 ≠ 锁未启用；判成未启用 → 整个作业静默失去锁保护，控制台不留痕迹（失败模式 X）")
                .isEqualTo(true);
    }

    /**
     * <b>I8：SPI 兼容性。</b>{@code RebuildLockStore} 是公开可替换 SPI（装配处带
     * {@code @ConditionalOnMissingBean}，宿主用同名 Bean 替换是设计内用法）。
     * {@code isEnabled()} 必须是 {@code default} 方法 —— 加成抽象方法会让宿主侧已有实现
     * <b>编译期直接断裂</b>，而本仓 3 个实现都已更新、测试全绿，恰恰会<b>掩盖仓外断裂</b>。
     *
     * <p>本用例模拟一个<b>不知道 {@code isEnabled()} 存在</b>的宿主实现（只实现  之前的
     * 6 个方法）。它<b>能编译</b>即证明 SPI 未断裂；其 {@code isEnabled()} 为 <b>true</b>
     * 即证明默认值落在<b>保守的误报方向</b>（宁可多做一次归属校验、必要时吵闹地拒绝切换），
     * 而不是漏报方向（静默跳过全部锁保护）。</p>
     */
    @Test
    public void legacyStoreWithoutIsEnabled_stillCompilesAndDefaultsToProtected() {
        // 只实现  之前就存在的 6 个方法，刻意不覆写 isEnabled()
        RebuildLockStore legacy = new RebuildLockStore() {
            @Override
            public boolean tryAcquire(String indexKey, long leaseMs) {
                return true;
            }

            @Override
            public boolean renew(String indexKey, long leaseMs) {
                return true;
            }

            @Override
            public void release(String indexKey) {
            }

            @Override
            public void forceRelease(String indexKey) {
            }

            @Override
            public RebuildLock get(String indexKey) {
                return null;
            }

            @Override
            public String owner() {
                return "legacy@host";
            }
        };

        assertThat(legacy.isEnabled())
                .as("未知实现须默认『锁在提供互斥』—— 猜错时落在误报方向（吵闹地失败），"
                        + "而非漏报方向（静默失去全部锁保护）")
                .isTrue();
    }

    /** 把 worker 线程池关掉，使 submit 必然抛 RejectedExecutionException。 */
    private static void shutdownWorker(AdhocRebuildService service) throws Exception {
        java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("worker");
        f.setAccessible(true);
        ((java.util.concurrent.ExecutorService) f.get(service)).shutdownNow();
    }
}
