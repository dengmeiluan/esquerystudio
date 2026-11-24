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

package io.github.dengmeiluan.esquerystudio.console.client;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioConsoleAutoConfiguration;
import org.elasticsearch.ElasticsearchStatusException;
import org.elasticsearch.rest.RestStatus;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.aop.AopAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicInteger;

/**
 *  #70：{@link EsWriteRetryAspect} 的<b>行为</b>测试 —— 它是否真的重试。
 *
 * <p><b>为什么装配断言不够</b>：{@code ClientModeWiringTest} 只能证明两个 Bean 存在。
 * 但「Bean 在」与「写失败会被重试」是两件事：闸门若还在（而业务侧永远取不到重建窗口），
 * Bean 全在、上下文全绿，却<b>一次都不会重试</b> —— 那正是本 Task 要修的缺陷形态。
 * 唯有对着真实织入的代理跑一次真实的失败写入，才能把「去掉闸门」这件事钉住。</p>
 *
 * <p><b>为什么走真实 Spring 上下文而不是直接 new 切面</b>：直接构造切面并喂一个 mock
 * {@code ProceedingJoinPoint} 只能验证模板的重试循环，无法证明<b>切点真的匹配</b>业务的
 * {@code ElasticsearchOperations} 写方法。切点表达式若写错（打错方法名、少一个 {@code +}），
 * 那种测试照样绿，而线上一次都拦不到。故此处让容器织入 AOP 代理，
 * 调用走 {@code ElasticsearchOperations.save(..)} 这个真实签名。</p>
 *
 * <p><b>桩的实现方式</b>：{@code ElasticsearchOperations}（spring-data-es 4.0.9）连同继承的
 * {@code DocumentOperations} / {@code SearchOperations} 共约 60 个抽象方法，手写实现既臃肿又
 * 会在升级时脆断。故用 JDK 动态代理：只响应 {@code save(Object)}，其余方法一律抛
 * {@code UnsupportedOperationException} —— 万一切点误伤别的方法，会立刻炸而不是静默返回 null。</p>
 *
 * <p>重试参数压到最小（3 次、1ms 退避）以免单测睡秒级。</p>
 */
public class EsWriteRetryAspectBehaviorTest {

    private ApplicationContextRunner runner() {
        return runnerWithMaxAttempts(3);
    }

    private ApplicationContextRunner runnerWithMaxAttempts(int maxAttempts) {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        AopAutoConfiguration.class, ESQueryStudioConsoleAutoConfiguration.class))
                .withUserConfiguration(StubOpsConfiguration.class)
                .withPropertyValues(
                        "esquerystudio.elasticsearch.retry.max-attempts=" + maxAttempts,
                        "esquerystudio.elasticsearch.retry.init-backoff-ms=1",
                        "esquerystudio.elasticsearch.retry.max-backoff-ms=2");
    }

    /**
     * <b>本 Task 的核心断言</b>：cluster_block 形态的写失败必须被<b>重试</b>。
     *
     * <p>判据落在「目标方法被实际调用的次数」这个可数的值上，与实现细节无关。
     * 闸门若被加回去（业务侧 windowOpen 恒 false）→ 调用次数退回 1 → 红；
     * 切点若不匹配、代理没织入 → 调用次数同样是 1 → 也红。</p>
     */
    @Test
    public void clusterBlockWriteIsRetried() {
        runner().run(ctx -> {
            org.junit.Assert.assertNull("上下文必须启动成功", ctx.getStartupFailure());
            RecordingOps stub = ctx.getBean(RecordingOps.class);
            stub.failWith(clusterBlock(), Integer.MAX_VALUE);

            ElasticsearchOperations ops = ctx.getBean(ElasticsearchOperations.class);
            try {
                ops.save(new Object());
                org.junit.Assert.fail("持续失败时最终必须抛出，而不是吞掉");
            } catch (RuntimeException expected) {
                // 耗尽重试后原样抛出，符合模板契约
            }

            org.junit.Assert.assertEquals(
                    "cluster_block 写失败必须被重试到 maxAttempts=3，实际只调用 " + stub.calls()
                            + " 次 —— 说明重试没生效：要么窗口闸门（isWindowOpen）被加了回来，"
                            + "要么切点没匹配到 ElasticsearchOperations.save",
                    3, stub.calls());
        });
    }

    /**
     * 重试必须能<b>救回</b>写入：首次失败、第二次成功时最终不抛异常且返回值正确。
     *
     * <p>与上一条互补：上一条证明「会重试」，本条证明「重试是有意义的」——
     * 一个空转重试、最后仍抛异常的实现过不了本条。</p>
     */
    @Test
    public void transientFailureIsRecoveredBySecondAttempt() {
        runner().run(ctx -> {
            RecordingOps stub = ctx.getBean(RecordingOps.class);
            stub.failWith(clusterBlock(), 1);   // 只让第 1 次失败

            ElasticsearchOperations ops = ctx.getBean(ElasticsearchOperations.class);
            Object entity = new Object();
            Object result = ops.save(entity);

            org.junit.Assert.assertEquals("第 2 次尝试即成功，总调用次数应为 2", 2, stub.calls());
            org.junit.Assert.assertSame("重试成功后必须返回目标方法的真实返回值", entity, result);
        });
    }

    /**
     * <b>反向断言</b>：不可重试的异常（mapping 错误）必须<b>只调用一次</b>并原样抛出。
     *
     * <p>没有这条，「无条件重试一切异常」的实现照样能过上面两条。
     * 判据同样落在调用次数这个值上，外加异常身份 —— 必须是原对象，不得被包装掩盖。</p>
     */
    @Test
    public void nonRetryableWriteFailsFastWithoutRetry() {
        runner().run(ctx -> {
            RecordingOps stub = ctx.getBean(RecordingOps.class);
            ElasticsearchStatusException mappingError = new ElasticsearchStatusException(
                    "mapper_parsing_exception: failed to parse field [price]", RestStatus.BAD_REQUEST);
            stub.failWith(mappingError, Integer.MAX_VALUE);

            ElasticsearchOperations ops = ctx.getBean(ElasticsearchOperations.class);
            Throwable thrown = null;
            try {
                ops.save(new Object());
                org.junit.Assert.fail("不可重试异常必须抛出");
            } catch (RuntimeException e) {
                thrown = e;
            }

            org.junit.Assert.assertEquals(
                    "mapping 错误不可重试，必须只调用 1 次，实际 " + stub.calls()
                            + " 次 —— 说明实现在无条件重试，会把真实错误拖成 N 倍耗时后才暴露",
                    1, stub.calls());
            org.junit.Assert.assertSame(
                    "不可重试异常必须原样抛出，不得被包装掩盖真实错误", mappingError, thrown);
        });
    }

    /** 成功写入不得被重试包装改变语义：恰好调用 1 次、返回值透传。 */
    @Test
    public void successfulWriteIsCalledExactlyOnce() {
        runner().run(ctx -> {
            RecordingOps stub = ctx.getBean(RecordingOps.class);
            ElasticsearchOperations ops = ctx.getBean(ElasticsearchOperations.class);

            Object entity = new Object();
            Object result = ops.save(entity);

            org.junit.Assert.assertEquals("成功路径必须恰好调用 1 次", 1, stub.calls());
            org.junit.Assert.assertSame("成功路径必须透传返回值", entity, result);
        });
    }

    /**
     * {@code esquerystudio.elasticsearch.retry.max-attempts=1} 就是<b>关闭重试</b>的开关。
     *
     * <p><b>为什么需要本条</b>：{@code ESQueryStudioElasticsearchProperties.Retry} 没有 {@code enabled} 字段，
     * 想关掉重试的人唯一的路就是把 {@code max-attempts} 设成 1。而「1」到底是
     * <b>总尝试次数</b>还是<b>重试次数</b>，只看配置名是<b>看不出来</b>的 ——
     * 若是后者，设 1 反而还会重试一次。本条把「1 = 只调一次 = 关闭」这个语义钉死，
     * 使它成为可依赖的承诺而不是实现巧合。</p>
     *
     * <p><b>判别力</b>：故意用<b>可重试</b>的 cluster_block 异常 —— 若用不可重试异常，
     * 则无论 {@code maxAttempts} 是多少都只会调 1 次，本条就成了恒真的摆设。
     * 循环若改成 {@code attempt > maxAttempts}（即把语义变成「重试次数」）→ 调用 2 次 → 红。</p>
     */
    @Test
    public void maxAttemptsOneDisablesRetryEntirely() {
        runnerWithMaxAttempts(1).run(ctx -> {
            org.junit.Assert.assertNull("上下文必须启动成功", ctx.getStartupFailure());
            RecordingOps stub = ctx.getBean(RecordingOps.class);
            // 必须用「可重试」异常，否则本条无论实现如何都恒绿
            stub.failWith(clusterBlock(), Integer.MAX_VALUE);

            ElasticsearchOperations ops = ctx.getBean(ElasticsearchOperations.class);
            try {
                ops.save(new Object());
                org.junit.Assert.fail("失败仍必须抛出");
            } catch (RuntimeException expected) {
                // 不重试，首次失败即抛出
            }

            org.junit.Assert.assertEquals(
                    "max-attempts=1 必须等于「完全不重试」，实际调用 " + stub.calls()
                            + " 次 —— 若为 2，说明 maxAttempts 语义是「重试次数」而非「总尝试次数」，"
                            + "那么 1 就不是关闭开关，文档与配置承诺全部作废",
                    1, stub.calls());
        });
    }

    /** 403 + cluster_block 信号：零停机重建期间旧物理索引被挡写的真实形态。 */
    private static ElasticsearchStatusException clusterBlock() {
        return new ElasticsearchStatusException(
                "cluster_block_exception: index [foo] blocked by: [FORBIDDEN/8/index write (api)]",
                RestStatus.FORBIDDEN);
    }

    @Configuration(proxyBeanMethods = false)
    static class StubOpsConfiguration {

        @Bean
        public RecordingOps recordingOps() {
            return new RecordingOps();
        }

        /** 被切的目标 Bean：容器会为它生成 AOP 代理。 */
        @Bean
        public ElasticsearchOperations elasticsearchOperations(RecordingOps recordingOps) {
            return recordingOps.proxy();
        }
    }

    /**
     * 记录调用次数并按配置抛异常的 {@code ElasticsearchOperations} 桩（JDK 动态代理实现）。
     *
     * <p>单独作为 Bean 暴露，使测试能在<b>代理之外</b>读到真实调用次数 ——
     * 若直接问 AOP 代理要次数，读到的会是被重试包装后的表象。</p>
     */
    static class RecordingOps {

        private final AtomicInteger calls = new AtomicInteger();
        private RuntimeException failure;
        private int failTimes;

        void failWith(RuntimeException failure, int times) {
            this.failure = failure;
            this.failTimes = times;
        }

        int calls() {
            return calls.get();
        }

        ElasticsearchOperations proxy() {
            InvocationHandler handler = (proxy, method, args) -> {
                if (!"save".equals(method.getName()) || args == null || args.length != 1) {
                    // 切点误伤或测试写错时立刻暴露，而不是静默返回 null
                    throw new UnsupportedOperationException(
                            "桩只实现 save(Object)，被调用的是 " + method.getName());
                }
                int n = calls.incrementAndGet();
                if (failure != null && n <= failTimes) {
                    throw failure;
                }
                return args[0];
            };
            return (ElasticsearchOperations) Proxy.newProxyInstance(
                    ElasticsearchOperations.class.getClassLoader(),
                    new Class<?>[]{ElasticsearchOperations.class},
                    handler);
        }
    }
}
