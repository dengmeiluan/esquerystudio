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
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/**
 * Adhoc（无 provider）托管重建：作用于任意逻辑索引名，复用 {@link EsIndexAdmin} 机械件
 * 完成「建新索引 → 全量 reindex → 追平 → 别名切换」的托管编排。
 *
 * <p>与主流程 {@code EsIndexRebuildService}（依赖宿主 {@code ManagedEsIndex} 契约）互补：
 * 本服务面向控制台运维场景 —— 目标索引可能根本没有接入 starter 契约（存量索引改分词/改分片等），
 * 由操作者在向导中人工确认 settings/mapping 与追平策略。</p>
 *
 * <p>两种形态：</p>
 * <ul>
 *   <li><b>别名模式</b>（logicalName 是别名）：切换 = 原子 write-index swap，零窗口；</li>
 *   <li><b>直连模式</b>（logicalName 是物理索引名）：切换 = 删旧索引 + 以旧名建别名指向新索引，
 *       存在短暂读写失败窗口，start 时必须显式 confirm。</li>
 * </ul>
 *
 * <p>三种追平策略见 {@link AdhocRebuildJob.Strategy}。作业状态为内存态（v1 限制，重启丢失；
 * ES 侧 reindex task 不受影响）。</p>
 */
public class AdhocRebuildService {

    private static final Logger logger = LoggerFactory.getLogger(AdhocRebuildService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 追平最多轮数（A 策略；再收敛不了就切换 + 切换后终追一轮） */
    private static final int MAX_CATCHUP_ROUNDS = 3;
    /** 单轮受影响文档数低于该值即认为已收敛，提前结束追平 */
    private static final long CATCHUP_CONVERGE_THRESHOLD = 50;
    /** reindex 进度轮询间隔 */
    private static final long POLL_INTERVAL_MS = 2000;
    /** 等待人工确认的轮询间隔 */
    private static final long GATE_POLL_INTERVAL_MS = 1000;
    /** 因失去重建锁而中止的报告 reason（与超时/人工中止可区分） */
    static final String REASON_LOCK_LOST = "LOCK_LOST";

    /** renew/锁丢失 ERROR 节流间隔（MigrateJobTracker.save 60s 范式）。 */
    private static final long LOCK_ERR_THROTTLE_MS = 60_000L;

    /** renewLockOrLose 两处 ERROR（renew 失败/续约校验异常）60s 单键节流——
     *  ES 持续不可达时每个作业每个续约点一条 ERROR 会刷屏。首条全量（异常臂带栈保留），
     *  窗口内仅累计，窗口尾先汇总一条无栈再落本窗首条；两臂共享一键（同一失锁族）。 */
    private final java.util.concurrent.atomic.AtomicLong lastRenewErrAt = new java.util.concurrent.atomic.AtomicLong(0);
    private final java.util.concurrent.atomic.AtomicLong renewErrSinceThrottle = new java.util.concurrent.atomic.AtomicLong(0);

    private final EsIndexAdmin esIndexAdmin;
    /** 人工确认切换的等待超时（毫秒） */
    private final long confirmTimeoutMs;
    /** 重建锁租约（毫秒）。长作业与人工等待期间按 {@link #renewIntervalMs()} 续约。 */
    private final long lockLeaseMs;
    /** 按逻辑索引名跨实例互斥的重建锁 */
    private final RebuildLockStore lockStore;
    /** 宿主 client 改 Supplier 懒解析（零 ES 依赖宿主经 ControlClusterResolver 供给）。 */
    private final java.util.function.Supplier<RestHighLevelClient> client;
    /**
     * target-aware adhoc：多集群路由器。start 经 {@link EsClientRouter#requireCapturedTarget()}
     * 捕获当前选中目标；异步 worker 经 {@link EsClientRouter#openScope} 恢复到 job 目标。
     * null（旧构造/单测）时一律宿主，行为与之前完全一致。
     */
    private final EsClientRouter router;
    /** 目标快照取名字/版本用；null 安全。 */
    private final ConnStore connStore;
    private final Map<String, AdhocRebuildJob> jobs = new ConcurrentHashMap<>();
    /** 作业记录存储 SPI。{@link #jobs} 作一级缓存，状态变更时经 {@link #persist} 落盘于此。 */
    private final AdhocJobStore store;
    /** 已 WARN 过 docCount 失败的索引（每索引仅记首次，防 prepare 轮询刷屏）。 */
    private final Set<String> docCountWarned = ConcurrentHashMap.newKeySet();
    /** 全局在途重建作业上限（防无界线程池+ES reindex 并发放大）。 */
    private static final int MAX_CONCURRENT_JOBS = 8;

    private final ExecutorService worker = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "es-adhoc-rebuild");
        t.setDaemon(true);
        return t;
    });

    /**
     * target-aware adhoc：锁 key 按 target + logicalIndex 隔离——不同集群的同名索引是
     * 两个不相干的重建对象，绝不能在控制集群锁索引里互相顶锁；同 target 同名才互斥。
     */
    static String lockKey(String targetId, String logicalName) {
        return (targetId == null || targetId.trim().isEmpty()
                ? AdhocRebuildJob.TARGET_HOST : targetId.trim()) + "::" + logicalName;
    }

    /**
     * 无锁构造（既有调用方/测试用）：锁降级为 no-op，行为与  之前完全一致。
     */
    public AdhocRebuildService(EsIndexAdmin esIndexAdmin, java.util.function.Supplier<RestHighLevelClient> client,
                               long confirmTimeoutMs) {
        this(esIndexAdmin, client, confirmTimeoutMs, null, 0L);
    }

    /**
     * 既有 5 参构造：store 默认内存实现，委托给全参构造。装配处（ESQueryStudioConsoleAutoConfiguration）
     * 仍走本签名， 独立可编译； 再把装配改为注入 store bean（走下面的 6 参构造）。
     */
    public AdhocRebuildService(EsIndexAdmin esIndexAdmin, java.util.function.Supplier<RestHighLevelClient> client,
                               long confirmTimeoutMs, RebuildLockStore lockStore, long lockLeaseMs) {
        this(esIndexAdmin, client, confirmTimeoutMs, lockStore, lockLeaseMs, new InMemoryAdhocJobStore());
    }

    /**
     *  新增全参构造：显式注入 {@link AdhocJobStore}。其余参数与 5 参构造语义一致。
     */
    public AdhocRebuildService(EsIndexAdmin esIndexAdmin, java.util.function.Supplier<RestHighLevelClient> client,
                               long confirmTimeoutMs, RebuildLockStore lockStore, long lockLeaseMs,
                               AdhocJobStore store) {
        this(esIndexAdmin, client, confirmTimeoutMs, lockStore, lockLeaseMs, store, null, null);
    }

    /**
     * target-aware adhoc 全参构造：注入路由器与连接档案。router 非 null 时——
     * start 捕获当前绑定目标入 job；worker/abort 经 openScope 恢复；低层 perform 走
     * router.current()（无绑定时即控制集群，与旧 client 供给等价）。
     */
    public AdhocRebuildService(EsIndexAdmin esIndexAdmin, java.util.function.Supplier<RestHighLevelClient> client,
                               long confirmTimeoutMs, RebuildLockStore lockStore, long lockLeaseMs,
                               AdhocJobStore store, EsClientRouter router,
                               ConnStore connStore) {
        this.esIndexAdmin = esIndexAdmin;
        this.client = client;
        this.confirmTimeoutMs = confirmTimeoutMs;
        this.lockStore = lockStore;
        this.lockLeaseMs = lockLeaseMs;
        this.store = store;
        this.router = router;
        this.connStore = connStore;
    }

    /**
     * 统一状态落盘。内存 {@link #jobs} 作一级缓存先写，再落 {@link #store}；
     * <b>持久化永不反噬重建</b>——save 失败只 warn 不上抛（契约红线，见 {@link AdhocJobStore}）。
     */
    private void persist(AdhocRebuildJob job) {
        jobs.put(job.getJobId(), job);
        try {
            store.save(job);
        } catch (Exception e) {
            logger.warn("[AdhocRebuild] persist failed jobId={} (不反噬重建)", job.getJobId(), e);
        }
    }

    /**
     * 续约间隔：租约的 1/3，保证一次续约失败后还有两次机会才真正过期。
     */
    private long renewIntervalMs() {
        return Math.max(1L, lockLeaseMs / 3);
    }

    // ------------------------------------------------------------------ 重建锁

    /**
     * 本服务的锁是否<b>真的在提供互斥</b>。
     *
     * <p><b>直接问 store，不从 {@code get()} 的返回值反推。</b>{@code get} 返回 null 有三种成因：
     * ①{@code lock.enabled=false} ②锁文档已被释放 ③<b>ES 读失败</b>（实现吞掉全部异常返回 null）。
     * 若靠"读不到锁文档"反推"锁未启用"，②③会被误判成①，作业于是<b>静默降级为无锁运行</b> ——
     * 不报错、不留痕、照常切换别名。<b>失效方向的不对称是关键</b>：把"锁生效"误判成"未启用"
     * 是漏报（静默失去全部保护），远比反向的误报（吵闹地拒绝切换）危险。</p>
     */
    private boolean lockProvidesMutex() {
        return lockStore != null && lockStore.isEnabled();
    }

    /**
     * 按逻辑索引名取重建锁。
     *
     * @return true=已持锁或无需持锁（无锁构造/锁未启用）；false=锁被他人持有，必须拒绝发起
     */
    private boolean acquireLock(String targetId, String logicalName) {
        if (lockStore == null) {
            return true; // 无锁构造：no-op 放行（与 javadoc 一致）
        }
        return lockStore.tryAcquire(lockKey(targetId, logicalName), lockLeaseMs);
    }

    /**
     * 释放锁，失败仅告警（锁终会因租约过期自动释放，不能因此让作业以失败收场）。
     *
     * <p><b>已失锁时必须跳过。</b>{@code EsRebuildLockStore.release} 刻意<b>不校验 owner</b>
     * （"任意实例都能释放"），所以本实例失锁后再调 release，删掉的是<b>强夺者的锁</b> ——
     * 等于把正在跑的那个重建的互斥保护摘掉。故以 {@code lockLost} 为闸门。</p>
     */
    private void releaseLockQuietly(AdhocRebuildJob job) {
        if (lockStore == null) {
            return;
        }
        if (job.isLockLost()) {
            logger.warn("[AdhocRebuild] job {} 已失锁，跳过 release —— 锁现属他人，删之会误伤对方作业 index={}",
                    job.getJobId(), job.getLogicalName());
            return;
        }
        try {
            lockStore.release(lockKey(job.getTargetId(), job.getLogicalName()));
        } catch (Exception e) {
            logger.error("[AdhocRebuild] job {} release lock failed on {}::{}",
                    job.getJobId(), job.getTargetId(), job.getLogicalName(), e);
        }
    }

    /**
     * <b>先校验归属、再续约</b>。
     *
     * <p><b>顺序不可颠倒。</b>{@link io.github.dengmeiluan.esquerystudio.console.lock.EsRebuildLockStore#renew}
     * 读出锁文档后用 {@code lockSource(...)} <b>整份重写</b>，而 {@code lockSource} 写的是
     * <b>调用方自己的 owner</b> —— 即 renew 不只是"不校验 owner"，它会<b>静默把 owner 改成自己</b>，
     * 受害者一次 renew 会真的把锁夺回来。若先 renew 再读回比对，读到的必然是自己，
     * <b>失锁永远检测不到</b>。故必须先读回比对，再续约。</p>
     *
     * <p>两步之间的 TOCTOU 窗口由真实实现的 {@code setIfSeqNo/setIfPrimaryTerm} CAS 兜住：
     * 他人在窗口内强夺 → seqNo 变化 → renew 冲突返回 false → 仍然正确判失锁。</p>
     *
     * <p>与 {@code RebuildLockGuard.renewOrFail} 的差异是<b>刻意的</b>：guard 的
     * {@code renew → tryAcquire → throw} 阶梯里，中间那级在本场景是错的——若 renew 失败而
     * tryAcquire 成功，说明锁文档曾经消失，别人<b>可能已经偷走、跑完一轮重建、又释放了</b>；
     * 对一个即将翻别名的作业来说，"重新拿到锁"不等于"没人动过这个索引"。故本方法不做兜底接管。</p>
     *
     * @return true=确认仍持有（或锁未启用）；false=已失锁（调用方必须立即停止推进，绝不能继续切换）
     */
    private boolean renewLockOrLose(AdhocRebuildJob job) {
        if (lockStore == null || !job.isLockActive()) {
            // 无锁构造 / lock.enabled=false：锁全程 no-op，不得因 get() 恒 null 而误判失锁。
            return true;
        }
        String logicalName = job.getLogicalName();
        String lockName = lockKey(job.getTargetId(), logicalName);
        try {
            // 顺序至关重要：必须"先验归属、后续约"。
            // EsRebuildLockStore.renew 读出锁文档后用 lockSource(...) 整份重写，而 lockSource
            // 写的是调用方自己的 owner —— 即 renew 不只是"不校验 owner"，它会【静默改写 owner】。
            // 若先 renew 再读回比对，读到的必然是自己，失锁【永远检测不到】。
            String self = lockStore.owner();
            RebuildLock current = lockStore.get(lockName);
            if (current == null) {
                logger.error("[AdhocRebuild] job {} 锁文档已消失 target={} index={}", job.getJobId(), job.getTargetId(), logicalName);
                job.markLockLost();
                return false;
            }
            if (!current.isHeldBy(self)) {
                logger.error("[AdhocRebuild] job {} 重建锁已被 owner={} 持有（本实例={}），target={} index={}",
                        job.getJobId(), current.getOwner(), self, job.getTargetId(), logicalName);
                job.markLockLost();
                return false;
            }
            if (!lockStore.renew(lockName, lockLeaseMs)) {
                logRenewErrorThrottled("[AdhocRebuild] job {} renew 失败，锁已不存在/易主 target={} index={}",
                        job.getJobId(), job.getTargetId(), logicalName);
                job.markLockLost();
                return false;
            }
            return true;
        } catch (Exception e) {
            // 读不到锁状态就无法证明自己仍持有。保守判失锁：宁可中止，也不在可能有第二个重建
            // 同时在跑的索引上翻别名。
            logRenewErrorThrottled("[AdhocRebuild] job {} 续约/校验锁异常，保守判定失锁 target={} index={}",
                    job.getJobId(), job.getTargetId(), logicalName, e);
            job.markLockLost();
            return false;
        }
    }

    /**
     * renewLockOrLose 两处 ERROR 的 60s 单键节流出口（varargs 透传，slf4j
     * 末参为 Throwable 时照常带栈）。节流只动日志，失锁判定（markLockLost/返回 false）契约不变。
     */
    private void logRenewErrorThrottled(String format, Object... args) {
        renewErrSinceThrottle.incrementAndGet();
        long now = System.currentTimeMillis();
        long last = lastRenewErrAt.get();
        if (now - last > LOCK_ERR_THROTTLE_MS && lastRenewErrAt.compareAndSet(last, now)) {
            long suppressed = renewErrSinceThrottle.getAndSet(0);
            if (suppressed > 1) {
                logger.error("[AdhocRebuild] renew/锁丢失 x{}（{}s 窗口聚合，详情见窗口首条）",
                        suppressed, LOCK_ERR_THROTTLE_MS / 1000);
            }
            logger.error(format, args);
        }
    }

    /**
     * 丢锁时关闭作业。<b>本 Task 最重要的安全性质</b>——续约与归属校验都失败说明锁已被他人持有，
     * <b>同一索引上可能正有另一个重建在跑</b>，此刻绝不能再去切换别名。
     *
     * <p>不新增第四种门结局：复用 {@code GATE_ABORTED} 并靠 {@code report.reason} 区分，
     * 与 {@code AWAIT_CONFIRM_TIMEOUT} / {@code AWAIT_CONFIRM_ABORTED} 的区分方式一致。</p>
     *
     * @return true=已由本方法关闭作业（调用方须立即返回）；false=确认已抢先赢下门，不可撤销
     */
    private boolean closeJobOnLockLost(AdhocRebuildJob job) {
        if (!job.tryCloseGate(AdhocRebuildJob.GATE_ABORTED)) {
            return false; // 确认已赢下 CAS，"先到者赢且不可撤销"是  的结构性不变量
        }
        boolean released = releaseWriteBlockQuietly(job);
        Map<String, Object> report = gateClosedReport(job, REASON_LOCK_LOST, released);
        report.put("hint", "【需人工介入】等待人工确认期间本实例已失去索引 " + job.getLogicalName()
                + " 的重建锁——同一索引上可能正有另一个重建作业在运行，已中止本作业且未切换别名。"
                + "请先确认另一个作业的归属与状态，再决定如何处置新索引 " + job.getDestPhysical() + "。"
                + (released ? "" : "另：旧索引写阻断解除失败，业务可能仍然写不进，请立即手动恢复！"));
        job.setReport(report);
        job.setError("重建锁已被他人持有，为避免与另一个重建并发切换，已中止");
        job.setStatus("ABORTED");
        persist(job);
        job.markFinished();
        logger.error("[AdhocRebuild] job {} aborted: 失去重建锁 index={}，拒绝切换别名",
                job.getJobId(), job.getLogicalName());
        return true;
    }

    // ------------------------------------------------------------------ prepare

    /**
     * 向导第一步：探测逻辑名形态并预填。
     * 返回 isAlias/physicals/sourcePhysical/settingsJson/mappingJson/docCount/suggestedDest/timeFieldCandidates。
     */
    public Map<String, Object> prepare(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) {
            throw new IllegalArgumentException("index 不能为空");
        }
        index = index.trim();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("index", index);
        boolean isAlias = esIndexAdmin.aliasExists(index);
        out.put("isAlias", isAlias);
        String source;
        if (isAlias) {
            Set<String> physicals = esIndexAdmin.getIndicesByAlias(index);
            out.put("physicals", physicals);
            source = esIndexAdmin.getWriteIndex(index);
            if (source == null) {
                throw new IllegalStateException("别名 " + index + " 无法确定唯一 write 物理索引，请先在别名管理中修正");
            }
        } else {
            if (!esIndexAdmin.indexExists(index)) {
                throw new IllegalArgumentException("索引/别名不存在: " + index);
            }
            source = index;
        }
        out.put("sourcePhysical", source);
        out.put("settingsJson", cleanedSettingsJson(source));
        String mapping = esIndexAdmin.getMapping(source);
        out.put("mappingJson", mapping);
        out.put("docCount", docCount(source));
        out.put("suggestedDest", suggestDest(index));
        out.put("timeFieldCandidates", timeFieldCandidates(mapping));
        // 直连模式的窗口风险由前端据 isAlias=false 提示并要求 confirm
        return out;
    }

    // ------------------------------------------------------------------ start / status / abort

    /**
     * 启动托管重建。req 字段：index(必填)、strategy(必填 INCREMENTAL|WRITE_BLOCK|MANUAL)、
     * destIndex(缺省用 suggestedDest 规则)、settingsJson/mappingJson(缺省复制源)、
     * timeField、bufferMs(默认 120000)、deleteOldIndex(默认 false)、confirmDirectSwap(直连模式必须 true)。
     */
    public Map<String, Object> start(Map<String, Object> req) throws IOException {
        return start(req, null, null);
    }

    /**
     * 启动托管重建（带创建者身份）。
     *
     * @param ownerUsername 创建者用户名（连接模型下 abort/confirm-switch 的归属判据；
     *                      传 null 表示调用方未提供身份——旧装配/单测路径，保持连接级语义）
     * @param ownerRole     创建时角色快照（审计与「谁能接管」判断用）
     */
    public Map<String, Object> start(Map<String, Object> req, String ownerUsername, String ownerRole)
            throws IOException {
        /* 并发作业上限：worker 是无界 cachedThreadPool，批量提交数百索引即数百并发
           重建（线程+ES reindex 双放大）。同 target+index 已有锁互斥，这里限的是
           全局在途作业总量——超限明确拒绝，用户可等在途完成或先清理。 */
        long active = jobs.values().stream().filter(AdhocRebuildJob::isRunning).count();
        if (active >= MAX_CONCURRENT_JOBS) {
            throw new IllegalStateException("在途重建作业已达上限 " + MAX_CONCURRENT_JOBS
                    + "，请等待在途作业完成或先清理历史作业");
        }
        String index = str(req.get("index"));
        if (index == null) {
            throw new IllegalArgumentException("index 不能为空");
        }
        AdhocRebuildJob.Strategy strategy;
        try {
            strategy = AdhocRebuildJob.Strategy.valueOf(String.valueOf(req.get("strategy")));
        } catch (Exception e) {
            throw new IllegalArgumentException("strategy 必须是 INCREMENTAL / WRITE_BLOCK / MANUAL");
        }
        String timeField = str(req.get("timeField"));
        if (strategy == AdhocRebuildJob.Strategy.INCREMENTAL && timeField == null) {
            throw new IllegalArgumentException("INCREMENTAL 策略必须指定 timeField（时间字段增量追平）");
        }
        long bufferMs = req.get("bufferMs") instanceof Number ? ((Number) req.get("bufferMs")).longValue() : 120_000L;
        boolean deleteOld = Boolean.TRUE.equals(req.get("deleteOldIndex"));
        // 切换前人工确认门。默认 false —— 直接调 API 的老路径行为完全不变；
        // 控制台「粘贴期望配置」流程会显式传 true。
        boolean pauseBeforeSwitch = Boolean.TRUE.equals(req.get("pauseBeforeSwitch"));

        // target-aware adhoc：在数据面入口捕获用户当前选中的目标（interceptor 已按
        // X-Es-Target 绑定；无路由器的旧装配/单测归一 host）。名称/版本做创建时快照——
        // 连接此后改名/删除不影响历史作业的语义与审计。
        // 宿主版本探测失败 debug 升 WARN——快照缺失=job 记录 targetEsVersion
        // 恒空，「历史作业跑在哪个 ES 版本上」的审计语义丢失，与上行「创建时快照」契约相悖；
        // 探测仅在 start 时一次（低频），逐条 WARN 无刷屏风险。异常仍吞在 try 内，控制流零变化。
        String targetId = router == null ? AdhocRebuildJob.TARGET_HOST : router.requireCapturedTarget();
        boolean remoteTarget = !AdhocRebuildJob.TARGET_HOST.equals(targetId);
        String targetName = null;
        String targetEsVersion = null;
        if (remoteTarget && connStore != null) {
            targetName = connStore.getName(targetId);
            targetEsVersion = connStore.getVersion(targetId);
        } else if (router != null) {
            try {
                targetEsVersion = router.currentEsVersion();
            } catch (Exception e) {
                logger.warn("[AdhocRebuild] host version probe failed: {}", e.getMessage(), e);
            }
        }

        boolean isAlias = esIndexAdmin.aliasExists(index);
        String source;
        if (isAlias) {
            source = esIndexAdmin.getWriteIndex(index);
            if (source == null) {
                throw new IllegalStateException("别名 " + index + " 无法确定唯一 write 物理索引");
            }
        } else {
            if (!esIndexAdmin.indexExists(index)) {
                throw new IllegalArgumentException("索引/别名不存在: " + index);
            }
            if (!Boolean.TRUE.equals(req.get("confirmDirectSwap"))) {
                throw new IllegalStateException("直连物理索引模式切换存在短暂读写窗口（删旧索引→以旧名建别名），需 confirmDirectSwap=true 确认");
            }
            source = index;
        }
        // 同一 target+逻辑名只允许一个运行中作业（不同集群的同名索引互不相干）
        for (AdhocRebuildJob j : jobs.values()) {
            if (j.isRunning() && j.getLogicalName().equals(index) && j.getTargetId().equals(targetId)) {
                throw new IllegalStateException("逻辑名 " + index + "（target=" + targetId
                        + "）已有运行中的 Adhoc 作业: " + j.getJobId());
            }
        }
        String dest = str(req.get("destIndex"));
        if (dest == null) {
            dest = suggestDest(index);
        }
        if (dest.equals(source) || dest.equals(index)) {
            throw new IllegalArgumentException("目标物理索引名不能与源/逻辑名相同: " + dest);
        }
        if (esIndexAdmin.indexExists(dest)) {
            throw new IllegalStateException("目标物理索引已存在: " + dest);
        }
        String settingsJson = str(req.get("settingsJson"));
        String mappingJson = str(req.get("mappingJson"));
        if (settingsJson == null) {
            settingsJson = cleanedSettingsJson(source);
        }
        if (mappingJson == null) {
            mappingJson = esIndexAdmin.getMapping(source);
        }
        /* 第 ：审编框原文可能是「ES 原样形态」（Mapping 页直通/粘贴导入：索引名壳+flat 平铺）——
           与 validate 同一归一化器，保证「校验过的形态 = 落 ES 的形态」，带壳 JSON 不再直送 createIndex */
        io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigNormalizer.Result nr =
                io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigNormalizer.normalize(settingsJson, mappingJson);
        if (nr.settingsJson != null) {
            settingsJson = nr.settingsJson;
        }
        if (nr.mappingJson != null) {
            mappingJson = nr.mappingJson;
        }

        /* jobId 必须不可预测：此前只取 UUID 前 8 位（32 bit），同连接内可被枚举/猜测后
           读到他人作业报告甚至（配合页面写键）中止他人作业。取 16 位十六进制（64 bit），
           前缀保持 "adhoc-" 以兼容既有日志检索/前端展示。 */
        String jobId = "adhoc-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        AdhocRebuildJob job = new AdhocRebuildJob(jobId, index, strategy, isAlias, source, dest,
                timeField, bufferMs, deleteOld, pauseBeforeSwitch, targetId, targetName, targetEsVersion);
        job.setOwner(ownerUsername, ownerRole);
        // 按 target+逻辑索引名跨实例互斥。此前 adhoc 作业只是内存态 map，无跨实例互斥——
        // 两人同时对同一索引起重建会各建新物理索引、各翻别名，后翻的赢，先翻的那个新索引成为孤儿。
        // target-aware adhoc：锁 key 带 target 维度——不同集群的同名索引不互相顶锁。
        // 放在所有校验之后：校验失败时不必取锁，也就不存在校验分支上的锁泄漏。
        if (!acquireLock(targetId, index)) {
            RebuildLock held = lockStore == null ? null : lockStore.get(lockKey(targetId, index));
            throw new IllegalStateException("索引 " + index + "（target=" + targetId + "）上已有重建作业持锁"
                    + (held == null ? "" : "（owner=" + held.getOwner() + "）")
                    + "，请先等它结束或释放锁");
        }
        // 记录「锁是否真的在提供互斥」。直接问 store，不从 get() 反推 ——
        // get() 返回 null 还可能是 ES 读失败或锁已释放，误判成「锁未启用」会让作业
        // 静默降级为无锁运行（不报错、不留痕、照常切换别名）。
        job.setLockActive(lockProvidesMutex());
        // 取锁之后到 worker 接手之前的任何异常都必须还锁——否则该索引在整个租约期内都无法重建。
        // 注意 worker.submit 自身就会抛 RejectedExecutionException（executor 已 shutdown、
        // 或 newCachedThreadPool 创建线程时 OOM），仅靠"调整语句顺序"堵不住，必须真的 try/catch。
        final String fSettings = settingsJson;
        final String fMapping = mappingJson;
        try {
            persist(job);
            worker.submit(() -> run(job, fSettings, fMapping));
        } catch (Throwable t) {
            jobs.remove(jobId);
            store.remove(jobId);
            releaseLockQuietly(job);
            throw t;
        }
        logger.info("[AdhocRebuild] start jobId={} index={} strategy={} source={} dest={} aliasMode={} target={}({})",
                jobId, index, strategy, source, dest, isAlias, targetId, targetEsVersion);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jobId", jobId);
        out.put("job", job.toMap());
        return out;
    }

    public Map<String, Object> status(String jobId) {
        AdhocRebuildJob job = jobs.get(jobId);
        if (job == null) {
            job = store.find(jobId).orElse(null);
        }
        if (job == null) {
            throw new IllegalArgumentException("作业不存在（可能应用已重启，Adhoc 作业为内存态）: " + jobId);
        }
        return job.toMap();
    }

    public Map<String, Object> abort(String jobId) {
        AdhocRebuildJob job = jobs.get(jobId);
        if (job == null) {
            job = store.find(jobId).orElse(null);
        }
        if (job == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        // 与 confirmSwitch 对称 —— 确认已赢下门之后切换必然执行，此时的 abort 拦不住任何东西。
        // 若在此静默置位 abortRequested，会造成两处伤害：
        //   ① 端点回 200，操作者以为已中止，而切换照常执行 —— 一次说谎的中止应答；
        //   ② run() 的 catch 用 isAbortRequested() 决定 ABORTED/FAILED，切换后 FINALIZE 抛异常时
        //      会被标成「用户主动中止」，掩盖真实的切换后失败，事后排查会被彻底带偏。
        if (AdhocRebuildJob.GATE_CONFIRMED.equals(job.getGateOutcome())) {
            throw new IllegalStateException("切换已被人工确认放行，无法中止: " + jobId
                    + "（作业正在执行切换/收尾，请等待其完成后按结果处置）");
        }
        job.requestAbort();
        String taskId = job.getCurrentTaskId();
        if (taskId != null) {
            // target-aware adhoc：取消的是 job 目标集群上跑着的 reindex task——
            // abort 端点是控制面（无目标绑定），必须按 job target 恢复路由后再 cancel。
            try (EsClientRouter.TargetScope ignored = router == null ? null : router.openScope(job.getTargetId())) {
                perform("POST", "/_tasks/" + taskId + "/_cancel", null);
            } catch (Exception e) {
                logger.warn("[AdhocRebuild] cancel task {} failed: {}", taskId, e.getMessage(), e);
            }
        }
        return job.toMap();
    }

    public List<Map<String, Object>> listJobs() {
        /* 合并持久化历史 + 内存运行中（内存覆盖，因运行中态最新）——此前只读内存，
           应用重启后「最近作业」列表清空，正在 ES 侧跑的 reindex 变成无法监控/中止的孤儿 */
        Map<String, AdhocRebuildJob> merged = new LinkedHashMap<>();
        for (AdhocRebuildJob j : store.listRecent(200)) merged.put(j.getJobId(), j);
        for (AdhocRebuildJob j : jobs.values()) merged.put(j.getJobId(), j);
        return merged.values().stream()
                .sorted(Comparator.comparingLong(AdhocRebuildJob::getStartedAt).reversed())
                .map(AdhocRebuildJob::toMap)
                .collect(Collectors.toList());
    }

    // ------------------------------------------------------------------ worker

    /** 上下文关停：不再接新任务、在途作业自然收尾（daemon 线程不阻 JVM 退出）。 */
    @PreDestroy
    public void shutdown() {
        worker.shutdown();
    }

    private void run(AdhocRebuildJob job, String settingsJson, String mappingJson) {
        // target-aware adhoc：fail closed——远程目标的连接档案已删时，绝不回落宿主执行
        // （那会把重建打到完全错误的集群上）。作业失败、留痕、还锁，输入保全供诊断。
        if (!AdhocRebuildJob.TARGET_HOST.equals(job.getTargetId())
                && connStore != null && connStore.get(job.getTargetId()) == null) {
            job.setError("TARGET_UNAVAILABLE: 目标集群连接 " + job.getTargetId()
                    + " 已不存在（创建时为 " + job.getTargetNameSnapshot() + "），作业未执行任何 ES 操作");
            job.setStatus("FAILED");
            job.setStage("REJECTED");
            persist(job);
            job.markFinished();
            releaseLockQuietly(job);
            logger.error("[AdhocRebuild] job {} rejected: target={} 连接已删除，fail closed", job.getJobId(), job.getTargetId());
            return;
        }
        // 切换是否已发生 —— 决定 catch 兜底能否解除挡写（切换后的挡写是刻意的只读保护）
        boolean switched = false;
        // target-aware adhoc：整个 worker 体固定在 job 创建时捕获的目标上执行——
        // EsIndexAdmin 与低层 perform 都经 router 取 client，scope 内一律路由到 job 目标；
        // try-with-resources 保证异常路径也不残留线程绑定（worker 线程是池化复用的）。
        try (EsClientRouter.TargetScope ignored = router == null ? null : router.openScope(job.getTargetId())) {
            // 1. 建目标索引
            job.setStage("CREATE_DEST");
            esIndexAdmin.createIndex(job.getDestPhysical(), settingsJson, mappingJson);
            job.setSourceDocCount(docCount(job.getSourcePhysical()));

            // B 策略无 timeField：全程写阻断（全量前就 block）
            boolean earlyBlock = job.getStrategy() == AdhocRebuildJob.Strategy.WRITE_BLOCK && job.getTimeField() == null;
            if (earlyBlock) {
                job.setStage("WRITE_BLOCK");
                esIndexAdmin.setIndexWriteBlock(job.getSourcePhysical(), true);
            }

            // 2. 全量 reindex（op_type=create + conflicts=proceed）
            long t0 = System.currentTimeMillis();
            job.setStage("FULL_REINDEX");
            String taskId = esIndexAdmin.submitReindex(job.getSourcePhysical(), job.getDestPhysical());
            ReindexProgress fullDone = awaitTask(job, taskId);
            if (fullDone == null) {
                return; // aborted
            }
            addRound(job, 0, "FULL", taskId, t0, fullDone);

            // 3. 按策略追平
            String timeFieldType = job.getTimeField() == null ? null
                    : resolveFieldType(mappingJson != null ? mappingJson : esIndexAdmin.getMapping(job.getSourcePhysical()), job.getTimeField());
            long lastMark = t0;
            switch (job.getStrategy()) {
                case INCREMENTAL:
                    job.setStage("CATCHUP");
                    for (int round = 1; round <= MAX_CATCHUP_ROUNDS; round++) {
                        long roundStart = System.currentTimeMillis();
                        ReindexProgress p = rangeReindex(job, timeFieldType, lastMark - job.getBufferMs(), false);
                        if (p == null) {
                            return; // aborted
                        }
                        addRound(job, round, "CATCHUP", job.getCurrentTaskId(), roundStart, p);
                        lastMark = roundStart;
                        if (affected(p) < CATCHUP_CONVERGE_THRESHOLD) {
                            break;
                        }
                    }
                    break;
                case WRITE_BLOCK:
                    if (!earlyBlock) {
                        // 有 timeField：全量后短暂 block，一轮追平即绝对一致
                        job.setStage("WRITE_BLOCK");
                        esIndexAdmin.setIndexWriteBlock(job.getSourcePhysical(), true);
                        long roundStart = System.currentTimeMillis();
                        job.setStage("CATCHUP");
                        ReindexProgress p = rangeReindex(job, timeFieldType, lastMark - job.getBufferMs(), false);
                        if (p == null) {
                            return;
                        }
                        addRound(job, 1, "CATCHUP_BLOCKED", job.getCurrentTaskId(), roundStart, p);
                        lastMark = roundStart;
                    }
                    break;
                case MANUAL:
                default:
                    break;
            }

            // 切换前人工确认门。WRITE_BLOCK 策略此刻已经在挡写，业务写入持续失败，
            // 所以这里必须有超时并在超时时强制解除挡写 —— 不能让业务因为「人忘了点确认」永久写不进。
            if (job.isPauseBeforeSwitch() && !awaitSwitchConfirm(job)) {
                return; // 门裁决为超时/中止，已在门内完成解除挡写与收尾
            }

            // 4. 切换
            job.setStage("SWITCH");
            long switchAt = System.currentTimeMillis();
            if (job.isAliasMode()) {
                esIndexAdmin.switchWriteIndex(job.getLogicalName(), job.getDestPhysical(), job.getSourcePhysical());
            } else {
                // 直连模式：删旧 + 以旧名建别名（已在 start 时 confirm 过窗口风险）
                esIndexAdmin.deleteIndex(job.getSourcePhysical());
                esIndexAdmin.createWriteAlias(job.getLogicalName(), job.getDestPhysical());
            }
            switched = true;

            // 5. 切换后终追（仅 A 策略 + 别名模式：源还在，把 swap 前最后写入的残余补进来；
            //    op_type=create + conflicts=proceed，dest 里 swap 后写入的新版本不会被旧存量覆盖）
            if (job.getStrategy() == AdhocRebuildJob.Strategy.INCREMENTAL && job.isAliasMode()) {
                job.setStage("FINAL_CATCHUP");
                long roundStart = System.currentTimeMillis();
                ReindexProgress p = rangeReindex(job, timeFieldType, lastMark - job.getBufferMs(), true);
                if (p != null) {
                    addRound(job, MAX_CATCHUP_ROUNDS + 1, "FINAL", job.getCurrentTaskId(), roundStart, p);
                }
            }

            // 6. 收尾：旧索引处置 + 报告
            job.setStage("FINALIZE");
            if (job.isAliasMode()) {
                if (job.isDeleteOldIndex()) {
                    esIndexAdmin.removeAlias(job.getLogicalName(), job.getSourcePhysical());
                    esIndexAdmin.deleteIndex(job.getSourcePhysical());
                } else if (job.getStrategy() != AdhocRebuildJob.Strategy.MANUAL) {
                    // 旧物理保留只读：加写阻塞防直连旧名的残余写悄悄落旧索引
                    esIndexAdmin.setIndexWriteBlock(job.getSourcePhysical(), true);
                }
            }
            job.setDestDocCount(docCount(job.getDestPhysical()));
            job.setReport(buildReport(job, t0, switchAt));
            job.setStage("DONE");
            job.setStatus("SUCCEEDED");
            persist(job);
            logger.info("[AdhocRebuild] job {} succeeded: {} -> {}", job.getJobId(),
                    job.getSourcePhysical(), job.getDestPhysical());
        } catch (Exception e) {
            // 任何异常退出都必须把挡写还回去 —— 否则业务永久写不进。
            // 但仅限「切换尚未发生」的阶段：切换成功后 FINALIZE 抛异常时，旧索引上的写阻断是
            // deleteOldIndex=false 分支刻意加的只读保护，此处解除会把它撤销掉。
            if (!switched) {
                releaseWriteBlockQuietly(job);
            }
            job.setError(e.getMessage());
            job.setStatus(job.isAbortRequested() ? "ABORTED" : "FAILED");
            persist(job);
            logger.error("[AdhocRebuild] job {} failed at stage {}", job.getJobId(), job.getStage(), e);
        } finally {
            job.markFinished();
            releaseLockQuietly(job);
        }
    }

    /**
     * 切换前人工确认门。阻塞 worker 线程直到人工放行、超时或中止。
     *
     * <p><b>并发裁决。</b>本方法（worker 线程）与 {@link #confirmSwitch(String)}（HTTP 线程）
     * 通过 {@link AdhocRebuildJob#tryCloseGate} / {@link AdhocRebuildJob#confirmSwitch} 的 CAS
     * 争夺同一个门。<b>先到者赢且唯一</b>：</p>
     * <ul>
     *   <li>worker 超时判定赢 → 解除写阻断 + 置 ABORTED，返回 false（不切换）；</li>
     *   <li>人工确认赢 → 本方法即使已判定超时也<b>必须放弃</b>并返回 true 放行切换 ——
     *       绝不能解除写阻断，否则就是在一个已解除阻断的索引上做切换。</li>
     * </ul>
     *
     * @return true=已放行，继续切换；false=门已关闭（超时/中止），调用方必须立即返回
     */
    // 包级可见：并发裁决测试直接驱动本方法，避免测试复刻一份判定逻辑而放过生产代码的缺陷
    boolean awaitSwitchConfirm(AdhocRebuildJob job) throws InterruptedException {
        job.setStage(AdhocRebuildJob.STAGE_AWAIT_CONFIRM);
        job.setAwaitConfirmSince(System.currentTimeMillis());
        long deadline = job.getAwaitConfirmSince() + confirmTimeoutMs;
        long nextRenewAt = job.getAwaitConfirmSince() + renewIntervalMs();
        while (!job.isSwitchConfirmed()) {
            if (job.isAbortRequested()) {
                // 中止同样要经 CAS：确认可能在同一瞬间赢了，那就放行切换而不是解除挡写。
                if (!job.tryCloseGate(AdhocRebuildJob.GATE_ABORTED)) {
                    break;
                }
                boolean released = releaseWriteBlockQuietly(job);
                job.setReport(gateClosedReport(job, "AWAIT_CONFIRM_ABORTED", released));
                job.setStatus("ABORTED");
                persist(job);
                job.markFinished();
                return false;
            }
            // 持锁时长 = reindex 耗时 + 人工等待时长。确认超时可配到 7 天而租约默认 60 分钟，
            // 不续约则锁必然在人工等待中途过期并被他人强夺——正是这把锁要防的事。
            if (System.currentTimeMillis() >= nextRenewAt) {
                if (!renewLockOrLose(job) && closeJobOnLockLost(job)) {
                    return false; // 已失锁：绝不切换（确认若已抢先赢下 CAS 则不可撤销，见下）
                }
                nextRenewAt = System.currentTimeMillis() + renewIntervalMs();
            }
            if (System.currentTimeMillis() > deadline) {
                if (!job.tryCloseGate(AdhocRebuildJob.GATE_TIMED_OUT)) {
                    break;
                }
                boolean released = releaseWriteBlockQuietly(job);
                job.setReport(gateClosedReport(job, "AWAIT_CONFIRM_TIMEOUT", released));
                job.setError("等待人工确认切换超时（" + confirmTimeoutMs + "ms）");
                job.setStatus("ABORTED");
                persist(job);
                job.markFinished();
                logger.warn("[AdhocRebuild] job {} aborted: await-confirm timeout, writeBlockReleased={} on {}",
                        job.getJobId(), released, job.getSourcePhysical());
                return false;
            }
            Thread.sleep(GATE_POLL_INTERVAL_MS);
        }
        // 确认已赢下门（不可撤销， 的结构性不变量）。但若此时本实例已失锁，切换就是在
        // 一个可能有第二个重建在跑的索引上翻别名——这个事实必须进作业报告，不能只写日志：
        // 运维看的是控制台，不是 grep 日志。
        if (!renewLockOrLose(job)) {
            // 一等字段：切换成功后 buildReport(...) 会整体替换 report，标记塞在 map 里会恰好
            // 在"无锁切换且成功"这个最该追查的场景下消失。report 里的详细 hint 仅作补充。
            job.markSwitchedWithoutLock();
            job.setReport(switchedWithoutLockReport(job));
            logger.error("[AdhocRebuild] job {} 已失去重建锁但确认已赢下门，仍将切换 index={} —— "
                    + "同一索引上可能有第二个重建，请立即核查", job.getJobId(), job.getLogicalName());
        }
        logger.info("[AdhocRebuild] job {} switch confirmed by operator after {}ms",
                job.getJobId(), System.currentTimeMillis() - job.getAwaitConfirmSince());
        return true;
    }

    /**
     * 确认已赢下门、但本实例已失锁时的报告。<b>发生了什么就说什么，尤其是不好的部分</b>——
     * 与超时报告的"诚实 hint"同一条原则。运维只看控制台，日志里的告警等于没说。
     */
    private Map<String, Object> switchedWithoutLockReport(AdhocRebuildJob job) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("switchedWithoutLock", true);
        r.put("waitedMs", System.currentTimeMillis() - job.getAwaitConfirmSince());
        r.put("hint", "【需人工核查】本作业在等待人工确认期间失去了索引 " + job.getLogicalName()
                + " 的重建锁，但人工确认已先行放行、切换不可撤销，故仍执行了切换。"
                + "同一索引上可能存在第二个重建作业，两者都可能翻过别名——"
                + "请立即核对当前别名指向与是否存在孤儿索引。");
        return r;
    }

    /**
     * 门关闭（超时/中止）时的报告。<b>文案按策略如实描述</b> —— 只有 WRITE_BLOCK 才真的挡过写，
     * 对 INCREMENTAL/MANUAL 说「写阻断已解除」是在陈述不存在之物，会误导操作者以为发生过阻断。
     * 解除失败时也必须说实话：那正是最需要人立刻介入的情形。
     */
    private Map<String, Object> gateClosedReport(AdhocRebuildJob job, String reason, boolean released) {
        boolean hadBlock = job.getStrategy() == AdhocRebuildJob.Strategy.WRITE_BLOCK;
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("reason", reason);
        r.put("waitedMs", System.currentTimeMillis() - job.getAwaitConfirmSince());
        r.put("hadWriteBlock", hadBlock);
        r.put("writeBlockReleased", hadBlock ? released : null);
        String tail = "新索引 " + job.getDestPhysical() + " 已建好且已回填，可重新起一次作业只做切换，或手动删除它。";
        if (!hadBlock) {
            r.put("hint", "等待人工确认切换超时/中止，已停止。本策略全程未阻断写入，业务写入未受影响。" + tail);
        } else if (released) {
            r.put("hint", "等待人工确认切换超时/中止，已停止；旧索引写阻断已解除，业务写入恢复。" + tail);
        } else {
            r.put("hint", "【需人工介入】等待人工确认切换超时/中止，但旧索引 " + job.getSourcePhysical()
                    + " 的写阻断解除失败，业务可能仍然写不进！请立即手动执行 "
                    + "PUT /" + job.getSourcePhysical() + "/_settings {\"index.blocks.write\":false} 恢复写入。" + tail);
        }
        return r;
    }

    /**
     * 尽力解除源索引写阻断。中止/超时路径必须调用它 ——
     * 挡写是本策略换取一致性的手段，一旦不再继续就必须还回去，否则业务永久写不进。
     *
     * @return true=已解除或本就无需解除；false=解除失败（业务可能持续写不进，报告里必须如实说）
     */
    private boolean releaseWriteBlockQuietly(AdhocRebuildJob job) {
        if (job.getStrategy() != AdhocRebuildJob.Strategy.WRITE_BLOCK) {
            return true;
        }
        try {
            esIndexAdmin.setIndexWriteBlock(job.getSourcePhysical(), false);
            logger.info("[AdhocRebuild] job {} write block released on {}", job.getJobId(), job.getSourcePhysical());
            return true;
        } catch (Exception e) {
            logger.error("[AdhocRebuild] job {} FAILED to release write block on {} —— 业务可能持续写不进，需人工介入",
                    job.getJobId(), job.getSourcePhysical(), e);
            return false;
        }
    }

    /**
     * 人工放行切换。
     *
     * <p><b>非幂等地"总是成功"</b> —— 若超时/中止已抢先裁决，这里必须抛错而不是回一个成功应答：
     * 谎报成功会让操作者以为切换正在进行，而实际上作业已中止、写阻断已解除。</p>
     */
    public Map<String, Object> confirmSwitch(String jobId) {
        AdhocRebuildJob job = jobs.get(jobId);
        if (job == null) {
            job = store.find(jobId).orElse(null);
        }
        if (job == null) {
            throw new IllegalArgumentException("作业不存在（可能应用已重启，Adhoc 作业为内存态）: " + jobId);
        }
        if (!job.isPauseBeforeSwitch()) {
            throw new IllegalStateException("该作业未开启切换前人工确认（pauseBeforeSwitch=false），无需确认: " + jobId);
        }
        if (job.isSwitchConfirmed()) {
            return job.toMap(); // 重复确认：已经是自己赢的，幂等返回
        }
        /* 只有真正走到切换前等待门才允许放行：此前只校验 pauseBeforeSwitch，
           在 FULL_REINDEX / 追平阶段就能提前把门置 CONFIRMED——等到 worker 真正到达门时
           直接跳过人工评审执行别名切换（创建者的评审权被绕过）。 */
        if (!AdhocRebuildJob.STAGE_AWAIT_CONFIRM.equals(job.getStage())) {
            throw new IllegalStateException("作业当前阶段 " + job.getStage()
                    + "，尚未进入切换前等待确认（" + AdhocRebuildJob.STAGE_AWAIT_CONFIRM
                    + "），不能提前放行: " + jobId);
        }
        if (!job.confirmSwitch()) {
            throw new IllegalStateException("确认无效：该作业的切换确认门已关闭（" + job.getGateOutcome()
                    + "），作业已中止且写阻断已按策略处理，请查看作业报告后重新发起作业: " + jobId);
        }
        return job.toMap();
    }

    /**
     * 轮询任务直到完成；abort 时置状态并返回 null。
     *
     * <p>：长作业（5TB 索引 reindex 可远超 60 分钟的默认租约）必须在此续约，否则锁会在
     * reindex 中途过期被他人强夺——那样这把锁<b>恰恰对最需要它的长作业失效</b>，
     * 等于交付一个虚假的互斥保障。失锁则中止：返回 null，由 run() 走已有的"aborted"出口。</p>
     */
    private ReindexProgress awaitTask(AdhocRebuildJob job, String taskId) throws IOException, InterruptedException {
        job.setCurrentTaskId(taskId);
        long nextRenewAt = System.currentTimeMillis() + renewIntervalMs();
        while (true) {
            if (job.isAbortRequested()) {
                job.setStatus("ABORTED");
                persist(job);
                job.markFinished();
                return null;
            }
            if (System.currentTimeMillis() >= nextRenewAt) {
                if (!renewLockOrLose(job)) {
                    job.setError("重建锁已被他人持有，为避免与另一个重建并发切换，已中止");
                    job.setStatus("ABORTED");
                    persist(job);
                    job.markFinished();
                    return null;
                }
                nextRenewAt = System.currentTimeMillis() + renewIntervalMs();
            }
            ReindexProgress p = esIndexAdmin.getReindexProgress(taskId);
            if (p.isCompleted()) {
                job.setCurrentTaskId(null);
                job.setCurrentProgress(null);
                return p;
            }
            /* docs 级三字段（total/created/updated）经 applyProgress 单入口刷新，
               /status 与 /jobs 的 toMap 顶层直出（AdhocRebuildJobProgressTest 契约）；
               currentProgress 兼容通道原样并存 */
            job.applyProgress(p);
            /* 实时进度透出（控制台进度条）：全量 reindex 小时级，此前零进度无法区分「在推进」还是「卡死」 */
            Map<String, Object> prog = new LinkedHashMap<>();
            prog.put("created", p.getCreated());
            prog.put("total", p.getTotal());
            job.setCurrentProgress(prog);
            Thread.sleep(POLL_INTERVAL_MS);
        }
    }

    /**
     * 按 timeField &gt;= sinceMillis 提交范围 reindex 并等待完成。
     *
     * @param createOnly true=op_type:create（终追：不覆盖 dest 里更新的版本）；false=覆盖式追平
     */
    private ReindexProgress rangeReindex(AdhocRebuildJob job, String timeFieldType, long sinceMillis,
                                         boolean createOnly) throws IOException, InterruptedException {
        Map<String, Object> range = new LinkedHashMap<>();
        range.put("gte", sinceMillis);
        if ("date".equals(timeFieldType)) {
            range.put("format", "epoch_millis");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("conflicts", "proceed");
        Map<String, Object> sourceNode = new LinkedHashMap<>();
        sourceNode.put("index", job.getSourcePhysical());
        Map<String, Object> query = new HashMap<>();
        query.put("range", java.util.Collections.singletonMap(job.getTimeField(), range));
        sourceNode.put("query", query);
        body.put("source", sourceNode);
        Map<String, Object> destNode = new LinkedHashMap<>();
        destNode.put("index", job.getDestPhysical());
        if (createOnly) {
            destNode.put("op_type", "create");
        }
        body.put("dest", destNode);
        Map<String, Object> resp = perform("POST", "/_reindex?wait_for_completion=false",
                MAPPER.writeValueAsString(body));
        String taskId = resp == null ? null : String.valueOf(resp.get("task"));
        if (taskId == null || "null".equals(taskId)) {
            throw new IllegalStateException("范围 reindex 提交失败（无 task 返回）");
        }
        return awaitTask(job, taskId);
    }

    private static long affected(ReindexProgress p) {
        long n = 0;
        if (p.getCreated() != null) {
            n += p.getCreated();
        }
        if (p.getUpdated() != null) {
            n += p.getUpdated();
        }
        return n;
    }

    private void addRound(AdhocRebuildJob job, int round, String phase, String taskId, long markMs, ReindexProgress p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("round", round);
        m.put("phase", phase);
        m.put("taskId", taskId);
        m.put("markMs", markMs);
        m.put("total", p.getTotal());
        m.put("created", p.getCreated());
        m.put("updated", p.getUpdated());
        m.put("versionConflicts", p.getVersionConflicts());
        job.addRound(m);
    }

    /** 收尾报告：计数对齐情况 + MANUAL 策略的建议回补 DSL */
    private Map<String, Object> buildReport(AdhocRebuildJob job, long t0, long switchAt) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("t0", t0);
        r.put("switchAt", switchAt);
        r.put("sourceDocCountAtStart", job.toMap().get("sourceDocCount"));
        r.put("destDocCountAfter", job.toMap().get("destDocCount"));
        if (job.getStrategy() == AdhocRebuildJob.Strategy.MANUAL) {
            if (job.getTimeField() != null) {
                String dsl = "POST _reindex\n{\n  \"conflicts\": \"proceed\",\n  \"source\": {\n    \"index\": \""
                        + job.getSourcePhysical() + "\",\n    \"query\": { \"range\": { \"" + job.getTimeField()
                        + "\": { \"gte\": " + (t0 - job.getBufferMs()) + " } } }\n  },\n  \"dest\": { \"index\": \""
                        + job.getDestPhysical() + "\", \"op_type\": \"create\" }\n}";
                r.put("suggestedBackfillDsl", dsl);
                r.put("hint", "MANUAL 策略未自动追平：切换期间(t0~switchAt)写入旧索引的增量需回补。可执行上方 DSL（op_type=create 不会覆盖切换后写入的新版本）。");
            } else {
                r.put("hint", "MANUAL 策略且无时间字段：请按业务主键自行核对 t0~switchAt 期间的增量并回补（可用文档编辑/Bulk 页）。");
            }
        }
        return r;
    }

    // ------------------------------------------------------------------ helpers

    /** GET /{index}/_count */
    private Long docCount(String index) {
        try {
            Map<String, Object> resp = perform("GET", "/" + index + "/_count", null);
            Object c = resp == null ? null : resp.get("count");
            return c instanceof Number ? ((Number) c).longValue() : null;
        } catch (Exception e) {
            // 裁决（三态之②回退误导类）：索引不可达/权限不足等真异常被吞成
            // null，前端把「数不到」当成「待数」无从区分。冷路径 WARN 恰一条（每索引仅
            // 首次——prepare 会被前端轮询、作业源/目标两处消费，不设去重即刷屏）。注意
            // 404 走 perform 的判据臂返回 null，不进本臂（「索引不存在」属判据内静默，
            // 552 三态约定）。null 契约不变（Observability554Test 反锁）。
            if (index != null && docCountWarned.add(index)) {
                logger.warn("[AdhocRebuild] docCount 探测失败，按 null 处理（前端无法区分「待数」与「数不到」）"
                        + ": index={} : {}", index, e.getMessage(), e);
            }
            return null;
        }
    }

    /** 读源索引 settings 并剔除不可复制的系统键，返回可直接用于 createIndex 的 JSON */
    private String cleanedSettingsJson(String index) throws IOException {
        Map<String, Object> resp = perform("GET", "/" + index + "/_settings", null);
        if (resp == null || resp.isEmpty()) {
            return null;
        }
        Object idxEntry = resp.values().iterator().next();
        if (!(idxEntry instanceof Map)) {
            return null;
        }
        Object settings = ((Map<?, ?>) idxEntry).get("settings");
        if (!(settings instanceof Map)) {
            return null;
        }
        Object indexNode = ((Map<?, ?>) settings).get("index");
        if (!(indexNode instanceof Map)) {
            return null;
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> cleaned = new LinkedHashMap<>((Map<String, Object>) indexNode);
        // 系统生成/不可复制键
        cleaned.remove("uuid");
        cleaned.remove("creation_date");
        cleaned.remove("provided_name");
        cleaned.remove("version");
        cleaned.remove("resize");
        cleaned.remove("blocks");
        cleaned.remove("routing");
        cleaned.remove("verified_before_close");
        return MAPPER.writerWithDefaultPrettyPrinter()
                .writeValueAsString(java.util.Collections.singletonMap("index", cleaned));
    }

    /** 目标物理索引名建议：{逻辑名}_adhoc_{yyyyMMddHHmmss}；基准名已存在时顺延 _2，避免建议名本身撞车。 */
    private String suggestDest(String logicalName) throws IOException {
        String ts = new java.text.SimpleDateFormat("yyyyMMddHHmmss", java.util.Locale.ROOT).format(new java.util.Date());
        String base = logicalName + "_adhoc_" + ts;
        try {
            if (!esIndexAdmin.indexExists(base) && !esIndexAdmin.aliasExists(base)) {
                return base;
            }
            return base + "_2";
        } catch (IOException | RuntimeException e) {
            /* 探测失败不能反噬 prepare：退回基准名，由 start 的真实建索引错误上抛。 */
            logger.warn("[AdhocRebuild] suggestDest existence probe failed for {}", base, e);
            return base;
        }
    }

    /**
     * 从 mapping JSON 递归收集时间字段候选：type=date，或 type=long 且字段名含 time/date/_at/At 结尾。
     */
    List<Map<String, String>> timeFieldCandidates(String mappingJson) {
        List<Map<String, String>> out = new ArrayList<>();
        if (mappingJson == null || mappingJson.isEmpty()) {
            return out;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = MAPPER.readValue(mappingJson, Map.class);
            collectTimeFields("", root.get("properties"), out);
        } catch (Exception e) {
            logger.warn("[AdhocRebuild] parse mapping for timeField candidates failed: {}", e.getMessage(), e);
        }
        return out;
    }

    private void collectTimeFields(String prefix, Object propsObj, List<Map<String, String>> out) {
        if (!(propsObj instanceof Map)) {
            return;
        }
        for (Map.Entry<?, ?> e : ((Map<?, ?>) propsObj).entrySet()) {
            String name = String.valueOf(e.getKey());
            if (!(e.getValue() instanceof Map)) {
                continue;
            }
            Map<?, ?> def = (Map<?, ?>) e.getValue();
            String path = prefix.isEmpty() ? name : prefix + "." + name;
            String type = def.get("type") == null ? null : String.valueOf(def.get("type"));
            String lower = name.toLowerCase(Locale.ROOT);
            boolean nameLooksTemporal = lower.contains("time") || lower.contains("date")
                    || lower.endsWith("_at") || name.endsWith("At");
            if ("date".equals(type) || ("long".equals(type) && nameLooksTemporal)) {
                Map<String, String> c = new LinkedHashMap<>();
                c.put("field", path);
                c.put("type", type);
                out.add(c);
            }
            // object / nested 递归
            if (def.get("properties") != null) {
                collectTimeFields(path, def.get("properties"), out);
            }
        }
    }

    /**
     * 解析 mapping 中某字段（支持 a.b.c 路径）的 type，未知返回 null。
     *
     * <p>：private → package-private（同文件 {@code timeFieldCandidates} 同款
     * 先例），供 {@code Observability552Test} 直调反锁；公共签名零变更。</p>
     */
    String resolveFieldType(String mappingJson, String fieldPath) {
        if (mappingJson == null || fieldPath == null) {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> node = MAPPER.readValue(mappingJson, Map.class);
            Object props = node.get("properties");
            String[] parts = fieldPath.split("\\.");
            for (int i = 0; i < parts.length; i++) {
                if (!(props instanceof Map)) {
                    return null;
                }
                Object def = ((Map<?, ?>) props).get(parts[i]);
                if (!(def instanceof Map)) {
                    return null;
                }
                if (i == parts.length - 1) {
                    Object t = ((Map<?, ?>) def).get("type");
                    return t == null ? null : String.valueOf(t);
                }
                props = ((Map<?, ?>) def).get("properties");
            }
        } catch (Exception e) {
            // 裁决（三态之②冷路径 WARN）：此臂掩盖的是 mapping JSON 解析失败——
            // timeFieldType 静默降级 null 后，rangeReindex 不再加 format=epoch_millis，
            // 若该 timeField 实为 date 且目标字段 format 非默认，追平范围查询语义悄然改变
            // （可能漏数）。冷路径（每作业仅追平编排时一次），按 三态法 ② 直接 WARN
            // 带 fieldPath 与堆栈；返回 null 契约不变（Observability552Test 反锁）。
            logger.warn("[AdhocRebuild] 解析 mapping 取 timeField 类型失败，type 按 null 处理"
                    + "（追平查询将不带 format=epoch_millis）: field={}", fieldPath, e);
        }
        return null;
    }

    /** 低层 REST（与 auth 域同款：404 宽容返回 null）。target-aware：优先走 router 当前绑定。 */
    private Map<String, Object> perform(String method, String path, String body) throws IOException {
        Request req = new Request(method, path);
        if (body != null) {
            req.setJsonEntity(body);
        }
        try {
            // router 绑定时路由到目标集群（worker scope / abort scope 内）；
            // 无绑定（host 作业 / 旧装配 router=null）回落控制集群供给，行为与之前一致。
            RestHighLevelClient active = router != null ? router.current() : client.get();
            Response resp = active.getLowLevelClient().performRequest(req);
            String text = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            if (text == null || text.isEmpty()) {
                return null;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> map = MAPPER.readValue(text, Map.class);
            return map;
        } catch (org.elasticsearch.client.ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return null;
            }
            throw e;
        }
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
