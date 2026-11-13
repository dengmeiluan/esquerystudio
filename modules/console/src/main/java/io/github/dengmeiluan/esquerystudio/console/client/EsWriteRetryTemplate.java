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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.elasticsearch.ElasticsearchStatusException;
import org.elasticsearch.rest.RestStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;

/**
 * ES 写入可重试模板。
 *
 * <p>仅对「瞬时、可自愈」的写失败重试——集群写阻塞（{@code index.blocks.write} / cluster_block）、
 * 限流（429 too_many_requests / es_rejected_execution）、网络抖动（连接/超时）——其余异常立即抛出，
 * 不掩盖真实错误。零停机重建期间旧物理索引被写阻塞，残余写请求据此重试到新 write 索引（写入方可重试契约）。</p>
 *
 * <p>异常识别遍历 cause 链，兼顾「HTTP 状态码 + 消息特征」，以兼容 spring-data 等对底层 ES 异常的包装。
 * ES 的 save 为按 _id upsert、delete 为按 _id/query 删除，均幂等，故整段写操作重试安全。</p>
 *
 * <p>重试参数由 {@link ESQueryStudioElasticsearchProperties.Retry} 注入（前缀 {@code esquerystudio.elasticsearch.retry}）。</p>
 *
 * <p><b>如何关闭重试</b>：配置 {@code esquerystudio.elasticsearch.retry.max-attempts=1}。
 * {@code maxAttempts} 是<b>总尝试次数（含首次）</b>而非「重试次数」，故 1 = 只调用一次 = 完全不重试；
 * 校验要求 {@code >= 1}，1 即合法下限。本类<b>刻意不提供</b> {@code enabled} 开关 ——
 * 多一个语义重叠的配置项只会制造「两个开关谁说了算」的歧义。
 * 该语义由 {@code EsWriteRetryAspectBehaviorTest.maxAttemptsOneDisablesRetryEntirely()} 钉住：
 * 若有人把循环判据改成「重试次数」语义（{@code attempt > maxAttempts}），那条测试会红。</p>
 *
 * @author aicoding
 */
public class EsWriteRetryTemplate {

    private static final Logger logger = LoggerFactory.getLogger(EsWriteRetryTemplate.class);

    /** 最大尝试次数（含首次） */
    private final int maxAttempts;
    /** 初始退避 */
    private final long initBackoffMs;
    /** 退避上限 */
    private final long maxBackoffMs;

    /** 重试 WARN 节流间隔（MigrateJobTracker.save 60s 范式）。 */
    private static final long RETRY_WARN_THROTTLE_MS = 60_000L;

    /** 重试 WARN 按 action 键 60s 节流——持续写故障（如宿主集群整体写阻塞）时
     *  高频写路径每 attempt 一条 WARN 会刷屏淹没业务日志。范式平移 MigrateJobTracker.save：
     *  窗口首条全量，窗口内仅累计，窗口尾（下一窗口首败）先汇总「xN」一条再落本窗首条。
     *  action 是调用点常量（键数量有限不失控）；节流只动日志，重试/退避/抛出契约零改动。 */
    private final java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicLong> lastRetryWarnAt =
            new java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicLong>();
    private final java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicLong> retryFailSinceWarn =
            new java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicLong>();

    public EsWriteRetryTemplate(ESQueryStudioElasticsearchProperties.Retry retry) {
        this.maxAttempts = retry.getMaxAttempts();
        this.initBackoffMs = retry.getInitBackoffMs();
        this.maxBackoffMs = retry.getMaxBackoffMs();
    }

    /**
     * 执行带返回值的 ES 写操作，遇可重试异常按指数退避重试，最终仍失败或遇不可重试异常则抛出。
     *
     * @param action      操作名（仅用于日志定位）
     * @param writeAction 写操作（允许抛 checked 异常，如原生 client 的 IOException）
     */
    public <T> T execute(String action, EsWriteAction<T> writeAction) {
        long backoff = initBackoffMs;
        for (int attempt = 1; ; attempt++) {
            try {
                return writeAction.execute();
            } catch (Exception e) {
                if (attempt >= maxAttempts || !isRetryable(e)) {
                    throw asUnchecked(e);
                }
                logRetryWarnThrottled(action, attempt, maxAttempts, backoff, rootMessage(e));
                sleep(backoff);
                backoff = Math.min(backoff * 2, maxBackoffMs);
            }
        }
    }

    /**
     * 执行无返回值的 ES 写操作。
     */
    public void execute(String action, EsWriteRunnable writeAction) {
        execute(action, () -> {
            writeAction.execute();
            return null;
        });
    }

    /**
     * 重试 WARN 按 action 键 60s 节流（窗口首条全量；窗口内仅累计；
     * 窗口尾（下一窗口首败）先汇总上一窗累计「xN」一条再落本窗首条。
     * 只动日志，重试/退避/抛出契约零改动。
     */
    private void logRetryWarnThrottled(String action, int attempt, int maxAttempts, long backoffMs, String cause) {
        java.util.concurrent.atomic.AtomicLong count =
                retryFailSinceWarn.computeIfAbsent(action, k -> new java.util.concurrent.atomic.AtomicLong());
        count.incrementAndGet();
        java.util.concurrent.atomic.AtomicLong lastAt =
                lastRetryWarnAt.computeIfAbsent(action, k -> new java.util.concurrent.atomic.AtomicLong());
        long now = System.currentTimeMillis();
        long last = lastAt.get();
        if (now - last > RETRY_WARN_THROTTLE_MS && lastAt.compareAndSet(last, now)) {
            long suppressed = count.getAndSet(0);
            if (suppressed > 1) {
                logger.warn("[EsWriteRetry] action={} retryable x{}（{}s 窗口聚合）",
                        action, suppressed, RETRY_WARN_THROTTLE_MS / 1000);
            }
            logger.warn("[EsWriteRetry] action={} attempt={}/{} retryable, backoffMs={}, cause={}",
                    action, attempt, maxAttempts, backoffMs, cause);
        }
    }

    /**
     * 是否为可重试异常：遍历 cause 链，命中网络抖动 / 限流 / 集群写阻塞之一即可重试。
     */
    private boolean isRetryable(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            // 网络抖动
            if (t instanceof ConnectException || t instanceof SocketTimeoutException
                    || t instanceof NoRouteToHostException) {
                return true;
            }
            // 按 HTTP 状态精确判断：429 限流；403 + block 信号 = 集群写阻塞
            if (t instanceof ElasticsearchStatusException) {
                RestStatus status = ((ElasticsearchStatusException) t).status();
                if (status == RestStatus.TOO_MANY_REQUESTS) {
                    return true;
                }
                if (status == RestStatus.FORBIDDEN && containsBlockSignal(t.getMessage())) {
                    return true;
                }
            }
            // 兜底：兼容被包装/未携带状态码的情形，匹配消息特征
            if (containsRetrySignal(t.getMessage())) {
                return true;
            }
            // 防御异常链自引用导致的死循环
            if (t.getCause() == t) {
                break;
            }
        }
        return false;
    }

    private boolean containsBlockSignal(String msg) {
        if (msg == null) {
            return false;
        }
        return msg.contains("cluster_block_exception")
                || msg.contains("index write (api)")
                || msg.contains("blocked by");
    }

    private boolean containsRetrySignal(String msg) {
        if (msg == null) {
            return false;
        }
        return msg.contains("cluster_block_exception")
                || msg.contains("es_rejected_execution_exception")
                || msg.contains("too_many_requests")
                || msg.contains("rejected execution");
    }

    private String rootMessage(Throwable error) {
        Throwable root = error;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName() + ": " + root.getMessage();
    }

    private RuntimeException asUnchecked(Exception e) {
        return (e instanceof RuntimeException) ? (RuntimeException) e
                : new IllegalStateException("ES 写操作失败: " + e.getMessage(), e);
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("ES 写重试等待被中断", ie);
        }
    }

    /**
     * 带返回值的 ES 写操作（允许抛 checked 异常）。
     */
    @FunctionalInterface
    public interface EsWriteAction<T> {
        T execute() throws Exception;
    }

    /**
     * 无返回值的 ES 写操作（允许抛 checked 异常）。
     */
    @FunctionalInterface
    public interface EsWriteRunnable {
        void execute() throws Exception;
    }
}
