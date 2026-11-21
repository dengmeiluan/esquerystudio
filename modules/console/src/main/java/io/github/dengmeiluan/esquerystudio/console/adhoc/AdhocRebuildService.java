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
    /** 等待人工确认的轮询间隔（默认；可经 9 参构造按场景覆盖，单测传 1ms 对齐极短租约节奏）。 */
    private static final long GATE_POLL_INTERVAL_MS = 1000;
    /** 因失去重建锁而中止的报告 reason（与超时/人工中止可区分） */
    static final String REASON_LOCK_LOST = "LOCK_LOST";

    /**
     * 本 JVM 的实例标识（每 JVM 一份）。多实例共享 store 拓扑（Es 档同宿控制集群、Jdbc 档
     * 共享宿主 DataSource——跨实例锁的存在即证明该拓扑在支持范围内）下，孤儿收养的判别键：
     * 仅本实例写入的快照（或 instanceId 为 null 的历史遗留）允许改判 FAILED，
     * 其它实例的 RUNNING 快照可能是活作业，改判会误杀（详见 {@link #isAdoptable}）。
     */
    static final String INSTANCE_ID = UUID.randomUUID().toString();

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
    /** 等待人工确认的轮询间隔（毫秒）；默认 {@link #GATE_POLL_INTERVAL_MS}。 */
    private final long gatePollIntervalMs;
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
    /** retry 启动在途的 jobId 集（见 retry 内注释）：拦截并发 retry 同 jobId 的双活。 */
    private final Set<String> retryingJobIds = ConcurrentHashMap.newKeySet();
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
        this(esIndexAdmin, client, confirmTimeoutMs, lockStore, lockLeaseMs, store, router, connStore,
                GATE_POLL_INTERVAL_MS);
    }

    /**
     * 全参构造 + 门轮询间隔覆盖。生产装配走上面的默认值（1s）；单测用极短租约
     * （leaseMs=3 → 续约间隔 1ms）时传 1ms，等待循环节奏与其对齐，避免每轮固定 1s 空转。
     */
    AdhocRebuildService(EsIndexAdmin esIndexAdmin, java.util.function.Supplier<RestHighLevelClient> client,
                        long confirmTimeoutMs, RebuildLockStore lockStore, long lockLeaseMs,
                        AdhocJobStore store, EsClientRouter router,
                        ConnStore connStore, long gatePollIntervalMs) {
        this.esIndexAdmin = esIndexAdmin;
        this.client = client;
        this.confirmTimeoutMs = confirmTimeoutMs;
        this.lockStore = lockStore;
        this.lockLeaseMs = lockLeaseMs;
        this.store = store;
        this.router = router;
        this.connStore = connStore;
        this.gatePollIntervalMs = gatePollIntervalMs;
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
        job.addStageEvent(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, "LOCK_LOST",
                "等待人工确认期间失去重建锁，已中止且未切换别名（同一索引上可能有另一个重建在运行）");
        persist(job);
        job.markFinished();
        logger.error("[AdhocRebuild] job {} aborted: 失去重建锁 index={}，拒绝切换别名",
                job.getJobId(), job.getLogicalName());
        return true;
    }

    // ------------------------------------------------------------------ prepare

    /**
     * 向导第一步：探测逻辑名形态并预填。
     * 返回 isAlias/physicals/sourcePhysical/settingsJson/mappingJson/docCount/suggestedDest/timeFieldCandidates/memberAliases。
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
        /* 源物理索引所属别名列表（向导警示行 + 直连安全门共用）。删除物理索引会连带
           断开其所属别名的成员关系，业务侧查询将失效——查询失败容忍（空数组，不反噬
           prepare：反查仅是信息透出，真门禁在 start 重查）。 */
        List<String> memberAliases = new ArrayList<>();
        try {
            memberAliases = memberAliasesOf(source);
        } catch (Exception e) {
            logger.debug("[AdhocRebuild] memberAliases 探测失败，按空列表处理: index={}", source, e);
        }
        out.put("memberAliases", memberAliases);
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
        /* reindex 调参（照 bufferMs 的 instanceof Number 先例）：
           requestsPerSecond（docs/s）：负值=不限的 UI 约定（-1 表不限），消费点统一按 >0 才下发；
           0 在 ES REST 合法且=不限，与「未设置」不可区分，几乎必是误输，按非法输入拒绝。
           slices：数字 >=1 直接生效；0/负数归一为 auto 哨兵（0，对齐 REST "auto" 与
           AbstractBulkByScrollRequest.AUTO_SLICES）；字符串 "auto" 同样归一为 0。 */
        Double requestsPerSecond = null;
        Object rpsRaw = req.get("requestsPerSecond");
        if (rpsRaw instanceof Number) {
            requestsPerSecond = ((Number) rpsRaw).doubleValue();
            if (requestsPerSecond == 0.0) {
                throw new IllegalArgumentException("requestsPerSecond 不得为 0：不限速请传 -1 或省略该参数（ES 语义中 0 等同不限，为防误填按非法输入拒绝）");
            }
        }
        Integer slices = null;
        Object slicesRaw = req.get("slices");
        if (slicesRaw instanceof Number) {
            int v = ((Number) slicesRaw).intValue();
            slices = v >= 1 ? v : 0; // 0/负数视为 auto
        } else if ("auto".equalsIgnoreCase(str(slicesRaw))) {
            slices = 0;
        }
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
            /* 直连安全门（数据安全级）：删除物理索引会连带断开其所属别名的成员关系，
               业务侧查询将失效——源物理索引若还是其他别名的成员，直连切换（删旧物理+
               以旧名建别名）会让那些别名失去唯一成员、业务查询 404。此处重新查一次
               成员别名而非采信 prepare 时的结果：prepare 与 start 之间 ES 侧别名关系
               可能已变化。查询失败保守拒绝（fail-closed）：无法确认成员身份时放行，
               安全门在 ES 抖动的瞬间恰好失效。 */
            List<String> memberAliases;
            try {
                memberAliases = memberAliasesOf(index);
            } catch (Exception e) {
                throw new IllegalStateException("无法确认索引 " + index
                        + " 的别名成员关系（ES 查询失败）。为避免删除物理索引连带断开其所属别名，"
                        + "已拒绝直连重建，请稍后重试或改用别名名作为重建入口。", e);
            }
            if (!memberAliases.isEmpty()) {
                throw new IllegalArgumentException("源物理索引 " + index + " 是别名 "
                        + String.join("、", memberAliases)
                        + " 的成员——直连重建会在切换时删除该物理索引并连带断开这些别名"
                        + "（业务将查不到数据）。请改用别名名（如 " + memberAliases.get(0)
                        + "）作为重建入口。");
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
        job.addStageEvent("PENDING", "STARTED", "作业创建（策略 " + strategy.name() + "，target=" + targetId + "）："
                + source + " -> " + dest);
        // reindex 调参经 setTuning 赋值（构造器参数不动；见字段 javadoc 的哨兵语义）
        job.setTuning(requestsPerSecond, slices);
        // 打上本 JVM 实例标识：随 toMap 持久化，供孤儿收养判别「谁的快照」（见 isAdoptable）
        job.setInstanceId(INSTANCE_ID);
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
            worker.submit(() -> run(job, fSettings, fMapping, null));
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
            throw new IllegalArgumentException("作业不存在（已删除或从未创建；历史作业为持久化快照，仅可查询）: " + jobId);
        }
        // store 回读的 RUNNING 快照而内存缺席：与 listJobs 同一判定/收养出口
        if (isAdoptable(job, jobId)) {
            adoptOrphan(job);
        }
        return job.toMap();
    }

    /**
     * 作业事件时间线：{@code {jobId, events:[{ts,stage,status,detail}]}}（ts 升序）。
     * 活作业读事件环本体；重启后的历史作业读快照覆盖层（事件随 toMap 持久化，
     * SNAPSHOT_VIEW_KEYS 覆盖层回读，往返保真）。旧版本持久化的作业无该字段 → 空清单。
     */
    public Map<String, Object> events(String jobId) {
        AdhocRebuildJob job = jobs.get(jobId);
        if (job == null) {
            job = store.find(jobId).orElse(null);
        }
        if (job == null) {
            throw new IllegalArgumentException("作业不存在（已删除或从未创建）: " + jobId);
        }
        Object events = job.toMap().get("stageEvents");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jobId", jobId);
        out.put("events", events instanceof List ? events : java.util.Collections.emptyList());
        return out;
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
        job.addStageEvent(job.getStage(), "ABORT_REQUESTED", "收到中止请求（阶段 " + job.getStage() + "）");
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

    /**
     * 失败/中止作业一键重启：沿用原 jobId 复位状态后复用 {@link #run} 的七阶段编排，
     * 跳过五步向导（重建参数是 final 字段，天然复用原配置）。
     *
     * <p>续跑形态（见 {@link RetryPlan}）：INCREMENTAL 且 dest 已建且全量轮已完成 →
     * 从 CATCHUP 续跑；dest 已建但全量未完成 → 覆盖式全量重跑（op_type=index 幂等覆盖）；
     * dest 不存在（失败在建索引阶段）→ 与首次 start 完全同路径（settings/mapping 从源复制，
     * 原请求若带自定义配置则以源为准——job 未持久化二者，属已知取舍）。</p>
     *
     * <p>rounds / failureSamples / 限流调参跨轮保留：历史轮次继续累加，追平窗口衔接上轮 mark。</p>
     */
    public Map<String, Object> retry(String jobId) {
        return retry(jobId, null);
    }

    /**
     * retry 的参数覆盖形态（2026-11-21 对账批）：{@code overrides} 可选键
     * {@code requestsPerSecond / slices / batchSize}——只覆盖出现的字段，未传字段沿用原值；
     * null / 空 map 与既有无参 retry 行为完全一致。解析口径与 start 同源：
     * rps==0 拒绝（ES 语义 0=不限，与「未设置」不可区分，防误填）；slices 数字 &gt;=1 生效、
     * 0/负值归一 auto 哨兵；batchSize 需正整数（REST {@code size} 键，ES 拒绝非正数）。
     */
    public Map<String, Object> retry(String jobId, Map<String, Object> overrides) {
        AdhocRebuildJob job = jobs.get(jobId);
        if (job == null) {
            job = store.find(jobId).orElse(null);
        }
        if (job == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        String st = job.getStatus();
        if (!"FAILED".equals(st) && !"ABORTED".equals(st)) {
            throw new IllegalStateException("仅 FAILED / ABORTED（含确认门超时自动中止）的作业可重试，"
                    + "当前状态 " + st + ": " + jobId
                    + ("AWAIT_CONFIRM".equals(job.getStage())
                    ? "（作业正在等待人工确认切换，请放行或中止后再操作）"
                    : "（作业未结束或已成功，无需重试）"));
        }
        // 参数覆盖在全部裁决之后解析：被拒路径不碰 job 调参（终态事实零改写）
        Double rps = job.getRequestsPerSecond();
        Integer slices = job.getSlices();
        Integer batchSize = job.getBatchSize();
        if (overrides != null) {
            Object rpsRaw = overrides.get("requestsPerSecond");
            if (rpsRaw instanceof Number) {
                rps = ((Number) rpsRaw).doubleValue();
                if (rps == 0.0) {
                    throw new IllegalArgumentException("requestsPerSecond 不得为 0：不限速请传 -1 或省略该字段"
                            + "（ES 语义中 0 等同不限，为防误填按非法输入拒绝）");
                }
            }
            Object slicesRaw = overrides.get("slices");
            if (slicesRaw instanceof Number) {
                int v = ((Number) slicesRaw).intValue();
                slices = v >= 1 ? v : 0; // 0/负数视为 auto（与 start 同归一口径）
            }
            Object bsRaw = overrides.get("batchSize");
            if (bsRaw instanceof Number) {
                int v = ((Number) bsRaw).intValue();
                if (v < 1) {
                    throw new IllegalArgumentException("batchSize 需为正整数（reindex 每批文档数，REST size 键）");
                }
                batchSize = v;
            }
        }
        // 重启后从 store 回读的作业是 minimal 骨架（final 重建参数灌不回，见 EsAdhocJobStore.rehydrate），
        // 拿 null 源/目标名跑 reindex 只会得到晦涩的 ES 错误——明确拒绝并引导重新发起。
        if (job.getLogicalName() == null || job.getSourcePhysical() == null || job.getDestPhysical() == null) {
            throw new IllegalStateException("该作业是应用重启后的持久化快照，缺少原重建配置（源/目标索引名），"
                    + "无法一键重试；请从向导重新发起: " + jobId);
        }
        // 与 start 同口径的并发上限：worker 无界，重跑也占在途名额
        long active = jobs.values().stream().filter(AdhocRebuildJob::isRunning).count();
        if (active >= MAX_CONCURRENT_JOBS) {
            throw new IllegalStateException("在途重建作业已达上限 " + MAX_CONCURRENT_JOBS
                    + "，请等待在途作业完成或先清理历史作业");
        }
        // 同一 target+逻辑名只允许一个运行中作业（同 start；排除自己——它此刻是终态）
        for (AdhocRebuildJob j : jobs.values()) {
            if (j != job && j.isRunning() && j.getLogicalName() != null
                    && j.getLogicalName().equals(job.getLogicalName())
                    && j.getTargetId().equals(job.getTargetId())) {
                throw new IllegalStateException("逻辑名 " + job.getLogicalName() + "（target="
                        + job.getTargetId() + "）已有运行中的 Adhoc 作业: " + j.getJobId());
            }
        }
        if (!acquireLock(job.getTargetId(), job.getLogicalName())) {
            RebuildLock held = lockStore == null ? null : lockStore.get(lockKey(job.getTargetId(), job.getLogicalName()));
            throw new IllegalStateException("索引 " + job.getLogicalName() + "（target=" + job.getTargetId()
                    + "）上已有重建作业持锁" + (held == null ? "" : "（owner=" + held.getOwner() + "）")
                    + "，请先等它结束或释放锁");
        }
        // 探测 dest 是否仍在：决定跳不跳 CREATE_DEST（控制面请求无目标绑定，按 job target 恢复路由）
        boolean destExists;
        String settingsJson = null;
        String mappingJson = null;
        try (EsClientRouter.TargetScope ignored = router == null ? null : router.openScope(job.getTargetId())) {
            destExists = esIndexAdmin.indexExists(job.getDestPhysical());
            if (!destExists) {
                /* dest 已不存在（失败发生在建索引阶段）需要重建时，与首次 start 的缺省
                   路径同源：从源物理索引复制 settings/mapping 后再建 dest。若以 null/null
                   建索引，会得到动态 mapping 索引并照常切换别名，业务流量落到 mapping
                   错误的索引上；读取失败则放弃本次重试（宁可拒绝，不建错误结构）。 */
                settingsJson = cleanedSettingsJson(job.getSourcePhysical());
                mappingJson = esIndexAdmin.getMapping(job.getSourcePhysical());
                // 与 start 同一归一化器：缺省复制源的输出本就是标准形态，此处为幂等收口
                io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigNormalizer.Result nr =
                        io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigNormalizer
                                .normalize(settingsJson, mappingJson);
                if (nr.settingsJson != null) {
                    settingsJson = nr.settingsJson;
                }
                if (nr.mappingJson != null) {
                    mappingJson = nr.mappingJson;
                }
            }
        } catch (IOException | RuntimeException e) {
            releaseLockQuietly(job);
            throw new IllegalStateException("无法探测目标物理索引 " + job.getDestPhysical()
                    + " 或读取源索引 " + job.getSourcePhysical()
                    + " 配置（ES 查询失败），已放弃本次重试，请稍后再试", e);
        }
        boolean fullCompleted = false;
        for (Map<String, Object> round : roundsOf(job)) {
            if ("FULL".equals(round.get("phase"))) {
                fullCompleted = true;
                break;
            }
        }
        /* 并发 retry 同 jobId 重入闸：上方的状态校验读到的是终态，与下方 resetForRetry 之间
           无原子性——无锁构造（lock.enabled=false）下两个并发请求会双双通过校验、各自
           submit 一个 worker，两个线程同时翻别名。Set.add 原子抢占，后来者明确拒绝；
           闸由 worker 收尾（下方 submit 包装的 finally）与 submit 失败分支释放。 */
        if (!retryingJobIds.add(jobId)) {
            releaseLockQuietly(job);
            throw new IllegalStateException("该作业已有一个重试正在启动中，请等待其开始运行后再操作: " + jobId);
        }
        // 状态复位在全部校验之后：任何拒绝路径都不改写终态事实（rounds/failures 历史跨轮保留）
        job.resetForRetry();
        // 参数覆盖写回（未覆盖字段即上面读出的原值，等价沿用）；resetForRetry 本就不清调参
        job.setTuning(rps, slices);
        job.setBatchSize(batchSize);
        job.setInstanceId(INSTANCE_ID);
        job.setLockActive(lockProvidesMutex());
        final RetryPlan plan = new RetryPlan(destExists, fullCompleted);
        final AdhocRebuildJob fJob = job;
        final String fSettings = settingsJson;
        final String fMapping = mappingJson;
        try {
            persist(job);
            worker.submit(() -> {
                try {
                    run(fJob, fSettings, fMapping, plan);
                } finally {
                    retryingJobIds.remove(jobId);
                }
            });
        } catch (Throwable t) {
            retryingJobIds.remove(jobId);
            jobs.remove(jobId);
            store.remove(jobId);
            releaseLockQuietly(job);
            throw t;
        }
        logger.info("[AdhocRebuild] retry jobId={} index={} strategy={} destExists={} fullCompleted={} target={}"
                        + " tuning(rps={},slices={},batchSize={})",
                jobId, job.getLogicalName(), job.getStrategy(), destExists, fullCompleted, job.getTargetId(),
                rps, slices, batchSize);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jobId", jobId);
        out.put("job", job.toMap());
        return out;
    }

    /** rounds 只读视图（同步拷贝，避免遍历期间 worker append 的弱一致异常）。 */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> roundsOf(AdhocRebuildJob job) {
        Object rounds = job.toMap().get("rounds");
        return rounds instanceof List ? (List<Map<String, Object>>) rounds : java.util.Collections.emptyList();
    }

    /**
     * 删除单条作业记录。仅终态（SUCCEEDED/FAILED/ABORTED）可删——
     * RUNNING/AWAIT_CONFIRM 的作业线程仍在推进，删记录会留下无法观测/中止的孤儿任务。
     */
    public Map<String, Object> delete(String jobId) {
        AdhocRebuildJob job = jobs.get(jobId);
        if (job == null) {
            job = store.find(jobId).orElse(null);
        }
        if (job == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        if (job.isRunning()) {
            throw new IllegalStateException("作业正在运行（阶段 " + job.getStage() + "），不能删除；请先中止或等待完成: " + jobId);
        }
        jobs.remove(jobId);
        store.remove(jobId);
        logger.info("[AdhocRebuild] delete job {}", jobId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jobId", jobId);
        out.put("deleted", true);
        return out;
    }

    /**
     * 批量清理 {@code days} 天前结束的终态作业。
     *
     * <p>{@code targetId} 非 null 时只清该目标的作业（连接模型下防跨目标误删）；
     * null 表示全局清理（静态/内置模型或 ADMIN）。返回 {deleted:N}。</p>
     *
     * <p>可见面与列表页同一口径（{@code listRecent(200)} 合并内存）：超出该窗口的更早
     * 记录本轮不可见也不清理，历史量级超限时多次调用可逐窗推进。</p>
     */
    public Map<String, Object> deleteOlderThan(int days, String targetId) {
        if (days <= 0) {
            throw new IllegalArgumentException("olderThanDays 必须为正整数");
        }
        long cutoff = System.currentTimeMillis() - days * 86_400_000L;
        Map<String, AdhocRebuildJob> merged = new LinkedHashMap<>();
        for (AdhocRebuildJob j : store.listRecent(200)) {
            merged.put(j.getJobId(), j);
        }
        for (AdhocRebuildJob j : jobs.values()) {
            merged.put(j.getJobId(), j);
        }
        int deleted = 0;
        for (AdhocRebuildJob j : merged.values()) {
            if (j.isRunning()) {
                continue;
            }
            // finishedAt 经 toMap 取：store 回读的骨架不回填实例字段，真值在快照覆盖层
            Object fin = j.toMap().get("finishedAt");
            long finishedAt = fin instanceof Number ? ((Number) fin).longValue() : 0L;
            if (finishedAt == 0L || finishedAt >= cutoff) {
                continue;
            }
            if (targetId != null && !targetId.equals(j.getTargetId())) {
                continue;
            }
            jobs.remove(j.getJobId());
            store.remove(j.getJobId());
            deleted++;
        }
        logger.info("[AdhocRebuild] deleteOlderThan days={} target={} deleted={}", days, targetId, deleted);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", deleted);
        return out;
    }

    /**
     * 对作业当前在途的 reindex task 限流（透传 ES {@code _rethrottle}）。
     *
     * <p>仅 FULL_REINDEX / CATCHUP / FINAL_CATCHUP 三个 reindex 执行阶段且有 currentTaskId
     * 时有效（切换后终追同样是在途 bulk-by-scroll task；浏览器端已按三阶段同口径实现）——
     * 其余阶段没有可调速的 task，ES 会拒绝且报错语义混乱，这里提前以明确文案拒绝。
     * {@code requestsPerSecond} 负值（UI 约定 -1）= 恢复全速，原样透传。</p>
     */
    public Map<String, Object> throttle(String jobId, double requestsPerSecond) throws IOException {
        if (requestsPerSecond == 0.0) {
            throw new IllegalArgumentException("requestsPerSecond 不得为 0：不限速请传 -1（ES 语义中 0 等同不限，为防误填按非法输入拒绝）");
        }
        AdhocRebuildJob job = jobs.get(jobId);
        if (job == null) {
            job = store.find(jobId).orElse(null);
        }
        if (job == null) {
            throw new IllegalArgumentException("作业不存在: " + jobId);
        }
        String stage = job.getStage();
        if (!"FULL_REINDEX".equals(stage) && !"CATCHUP".equals(stage) && !"FINAL_CATCHUP".equals(stage)) {
            throw new IllegalStateException("作业当前阶段 " + stage
                    + "，仅 FULL_REINDEX / CATCHUP / FINAL_CATCHUP 阶段可限速: " + jobId);
        }
        String taskId = job.getCurrentTaskId();
        if (taskId == null) {
            throw new IllegalStateException("作业当前没有在途 reindex task（可能刚完成一轮），无法限速: " + jobId);
        }
        // 限速作用于 job 目标集群上的 task——控制面请求无目标绑定，按 job target 恢复路由（同 abort）
        try (EsClientRouter.TargetScope ignored = router == null ? null : router.openScope(job.getTargetId())) {
            Map<String, Object> resp = perform("POST", "/_tasks/" + taskId
                    + "/_rethrottle?requests_per_second=" + requestsPerSecond, null);
            if (resp == null) {
                throw new IllegalStateException("task " + taskId + " 已不存在（可能刚完成），本次限速未生效: " + jobId);
            }
        }
        logger.info("[AdhocRebuild] throttle jobId={} taskId={} requestsPerSecond={}", jobId, taskId, requestsPerSecond);
        return job.toMap();
    }

    public List<Map<String, Object>> listJobs() {
        /* 合并持久化历史 + 内存运行中（内存覆盖，因运行中态最新）——此前只读内存，
           应用重启后「最近作业」列表清空，正在 ES 侧跑的 reindex 变成无法监控/中止的孤儿 */
        Map<String, AdhocRebuildJob> merged = new LinkedHashMap<>();
        for (AdhocRebuildJob j : store.listRecent(200)) merged.put(j.getJobId(), j);
        /* 重启孤儿收养：必须在内存覆盖循环之前做——只收养本实例自己的孤儿快照（内存缺席
           且 instanceId 判定为可收养，见 isAdoptable），其它实例的在跑作业不受影响；
           收养后快照改判 FAILED 落盘，下轮不再命中（幂等） */
        for (AdhocRebuildJob j : merged.values()) {
            if (isAdoptable(j, j.getJobId())) {
                adoptOrphan(j);
            }
        }
        for (AdhocRebuildJob j : jobs.values()) merged.put(j.getJobId(), j);
        return merged.values().stream()
                .sorted(Comparator.comparingLong(AdhocRebuildJob::getStartedAt).reversed())
                .map(AdhocRebuildJob::toMap)
                .collect(Collectors.toList());
    }

    /**
     * 快照是否可收养：<b>必须同时满足</b> RUNNING、内存（{@link #jobs}）缺席、且实例归属允许——
     *
     * <ul>
     *   <li>instanceId == null：本次升级前的历史遗留快照（旧版本无此字段），归属不明但只可能
     *       来自已死实例（写它的进程若还活着，早该在它的内存里推进），收养；</li>
     *   <li>instanceId 等于本 JVM {@link #INSTANCE_ID}：本实例自己的孤儿（理论上内存该有，
     *       兜底收养无害），收养；</li>
     *   <li>instanceId 在场且 ≠ 本 JVM：<b>不收养</b>。多实例共享 store 拓扑（Es 档同宿控制集群、
     *       Jdbc 档共享 DataSource）下无法区分「死实例的遗留」与「活实例的在跑」——真死了，
     *       其宿主重启后新 JVM 的 INSTANCE_ID 也变了，同样落进本臂不收养。<b>取舍：宁可遗留
     *       陈旧 RUNNING 交给运维按 instanceId 判断处置，也不错杀别的实例正在跑的作业</b>——
     *       误杀的代价（活作业被标 FAILED+虚假中断文案、别名切换被静默放弃）远大于遗留陈旧态。</li>
     * </ul>
     */
    private boolean isAdoptable(AdhocRebuildJob snapshot, String jobId) {
        if (!snapshot.isRunning() || jobs.containsKey(jobId)) {
            return false;
        }
        String owner = snapshot.getInstanceId();
        return owner == null || INSTANCE_ID.equals(owner);
    }

    /**
     * 收养重启孤儿（判据见 {@link #isAdoptable}，仅限本实例/历史遗留快照）：
     * RUNNING 快照在内存中无对应作业 = 写它的 worker 已丢失，作业永远不会再推进，
     * 快照会以 RUNNING 永久僵在列表里误导操作者。
     *
     * <p>收养 = 就地改判 FAILED + 中断说明 + 标 finishedAt + 落盘（直连 store.save，不进
     * 内存一级缓存——孤儿不是本实例的活作业）。幂等：save 后非 RUNNING，
     * listJobs/status 的下一轮判定不再命中。</p>
     *
     * <p><b>为何 lazy 收养优于启动钩子</b>：Es/Jdbc store 均懒初始化（首次使用才建索引/建表），
     * 启动钩子在 ES 未就绪/依赖库未连通时会炸掉应用启动；收养只发生在有人真正查看列表/详情时
     * （查询视图语义），代价与风险最小。</p>
     */
    private void adoptOrphan(AdhocRebuildJob snapshot) {
        snapshot.setStatus("FAILED");
        snapshot.setError("宿主应用重启，作业中断（中断前阶段 " + snapshot.getStage()
                + "）；目标索引已保留，可重新发起或手动清理");
        snapshot.addStageEvent(snapshot.getStage(), "FAILED",
                "宿主应用重启，作业中断（中断前阶段 " + snapshot.getStage() + "）");
        snapshot.markFinished();
        try {
            store.save(snapshot);
        } catch (Exception e) {
            // 落盘失败不反噬查询：快照对象已改判，本次返回即为 FAILED；store 里的旧 RUNNING
            // 会在下一次查询时再次命中收养（重试语义）
            logger.warn("[AdhocRebuild] 孤儿收养落盘失败（下次查询将重试）jobId={}", snapshot.getJobId(), e);
        }
        logger.warn("[AdhocRebuild] job {} 已收养：持久化快照为 RUNNING 但内存无此作业（宿主重启中断）",
                snapshot.getJobId());
    }

    // ------------------------------------------------------------------ worker

    /** 上下文关停：不再接新任务、在途作业自然收尾（daemon 线程不阻 JVM 退出）。 */
    @PreDestroy
    public void shutdown() {
        worker.shutdown();
    }

    /**
     * stage 变更 + 事件环记录（时间线的「每次 stage 变更」锚点）。
     * 收口在模型上而非散调 setStage：worker 的每次阶段推进自动落一条事件。
     */
    private void transition(AdhocRebuildJob job, String stage) {
        job.setStage(stage);
        job.addStageEvent(stage, "STAGE", "进入阶段 " + stage);
    }

    private void run(AdhocRebuildJob job, String settingsJson, String mappingJson) {
        run(job, settingsJson, mappingJson, null);
    }

    /**
     * retry 续跑编排决策：失败作业复用原配置重启时，哪些前置阶段可以按既有产物跳过。
     *
     * <ul>
     *   <li>{@code destExists}=dest 物理索引仍在 → 跳过 CREATE_DEST（重建它反而会销毁已回填的数据）；</li>
     *   <li>{@code fullCompleted}=历史轮次里已有完成的 FULL 轮 → INCREMENTAL 策略直接从 CATCHUP
     *       续跑（追平窗口衔接上轮 mark，不重搬全量）；全量策略（WRITE_BLOCK/MANUAL）仍覆盖式重跑全量。</li>
     * </ul>
     */
    static final class RetryPlan {
        final boolean destExists;
        final boolean fullCompleted;

        RetryPlan(boolean destExists, boolean fullCompleted) {
            this.destExists = destExists;
            this.fullCompleted = fullCompleted;
        }
    }

    private void run(AdhocRebuildJob job, String settingsJson, String mappingJson, RetryPlan plan) {
        // target-aware adhoc：fail closed——远程目标的连接档案已删时，绝不回落宿主执行
        // （那会把重建打到完全错误的集群上）。作业失败、留痕、还锁，输入保全供诊断。
        if (!AdhocRebuildJob.TARGET_HOST.equals(job.getTargetId())
                && connStore != null && connStore.get(job.getTargetId()) == null) {
            job.setError("TARGET_UNAVAILABLE: 目标集群连接 " + job.getTargetId()
                    + " 已不存在（创建时为 " + job.getTargetNameSnapshot() + "），作业未执行任何 ES 操作");
            job.setStatus("FAILED");
            job.setStage("REJECTED");
            job.addStageEvent("REJECTED", "FAILED", "目标集群连接 " + job.getTargetId() + " 已不存在，作业未执行任何 ES 操作");
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
            // 1. 建目标索引（retry 且 dest 仍在时跳过——重建会销毁上一轮已回填的数据）
            if (plan == null || !plan.destExists) {
                transition(job, "CREATE_DEST");
                esIndexAdmin.createIndex(job.getDestPhysical(), settingsJson, mappingJson);
            }
            job.setSourceDocCount(docCount(job.getSourcePhysical()));

            // B 策略无 timeField：全程写阻断（全量前就 block）
            boolean earlyBlock = job.getStrategy() == AdhocRebuildJob.Strategy.WRITE_BLOCK && job.getTimeField() == null;
            if (earlyBlock) {
                transition(job, "WRITE_BLOCK");
                esIndexAdmin.setIndexWriteBlock(job.getSourcePhysical(), true);
            }

            // 2. 全量 reindex（op_type=create + conflicts=proceed；限流/切片经 job 调参带下）。
            // retry 续跑分两形：INCREMENTAL 且全量轮已完成 → 跳过（追平窗口衔接上轮 mark）；
            // dest 已有上一轮数据 → 覆盖式重跑（op_type=index 幂等覆盖，不必先删 dest）。
            boolean skipFull = plan != null && plan.fullCompleted
                    && job.getStrategy() == AdhocRebuildJob.Strategy.INCREMENTAL;
            long t0 = System.currentTimeMillis();
            if (skipFull) {
                t0 = job.lastRoundMarkMs() > 0 ? job.lastRoundMarkMs() : t0;
            } else {
                transition(job, "FULL_REINDEX");
                /* 首跑（plan==null）走 EsIndexAdmin typed 路径（既有锁面零触碰）；
                   retry 的全量重跑走本服务低层 REST——覆盖式（dest 已有上轮数据）与
                   create 式（dest 刚重建为空）都带 batchSize（REST size 键）下发。 */
                String taskId = plan == null
                        ? esIndexAdmin.submitReindex(job.getSourcePhysical(), job.getDestPhysical(),
                                job.getRequestsPerSecond(), job.getSlices())
                        : plan.destExists
                                ? submitOverwriteReindex(job)
                                : submitCreateReindex(job);
                ReindexProgress fullDone = awaitTask(job, taskId);
                if (fullDone == null) {
                    return; // aborted
                }
                addRound(job, 0, "FULL", taskId, t0, fullDone);
            }

            // 3. 按策略追平
            String timeFieldType = job.getTimeField() == null ? null
                    : resolveFieldType(mappingJson != null ? mappingJson : esIndexAdmin.getMapping(job.getSourcePhysical()), job.getTimeField());
            long lastMark = t0;
            switch (job.getStrategy()) {
                case INCREMENTAL:
                    transition(job, "CATCHUP");
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
                        transition(job, "WRITE_BLOCK");
                        esIndexAdmin.setIndexWriteBlock(job.getSourcePhysical(), true);
                        long roundStart = System.currentTimeMillis();
                        transition(job, "CATCHUP");
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
            transition(job, "SWITCH");
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
                transition(job, "FINAL_CATCHUP");
                long roundStart = System.currentTimeMillis();
                ReindexProgress p = rangeReindex(job, timeFieldType, lastMark - job.getBufferMs(), true);
                if (p != null) {
                    addRound(job, MAX_CATCHUP_ROUNDS + 1, "FINAL", job.getCurrentTaskId(), roundStart, p);
                }
            }

            // 6. 收尾：旧索引处置 + 报告
            transition(job, "FINALIZE");
            if (job.isAliasMode()) {
                if (job.isDeleteOldIndex()) {
                    esIndexAdmin.removeAlias(job.getLogicalName(), job.getSourcePhysical());
                    esIndexAdmin.deleteIndex(job.getSourcePhysical());
                } else if (job.getStrategy() != AdhocRebuildJob.Strategy.MANUAL) {
                    // 旧物理保留只读：加写阻断防直连旧名的残余写悄悄落旧索引
                    esIndexAdmin.setIndexWriteBlock(job.getSourcePhysical(), true);
                }
            }
            job.setDestDocCount(docCount(job.getDestPhysical()));
            job.setReport(buildReport(job, t0, switchAt));
            /* 2026-11-21 对账批：终态文档数对账进报告（缺口 warn 级结论条；源已删如实标注；
               对账自身失败只进报告不改终态）。 */
            appendReconcile(job);
            transition(job, "DONE");
            job.setStatus("SUCCEEDED");
            job.addStageEvent("DONE", "SUCCEEDED",
                    "重建完成：" + job.getSourcePhysical() + " -> " + job.getDestPhysical());
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
            job.addStageEvent(job.getStage(), job.getStatus(),
                    (job.isAbortRequested() ? "作业中止（阶段 " : "作业失败（阶段 ") + job.getStage() + "）"
                            + (e.getMessage() == null ? "" : ": " + e.getMessage()));
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
        transition(job, AdhocRebuildJob.STAGE_AWAIT_CONFIRM);
        job.addStageEvent(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, "GATE_OPEN", "切换前人工确认门开启（等待放行或超时）");
        job.setAwaitConfirmSince(System.currentTimeMillis());
        long deadline = job.getAwaitConfirmSince() + confirmTimeoutMs;
        // 门死线透出（toMap 的 gateDeadlineMs）：控制台倒计时/超时预算展示用，与下方判定同源
        job.setGateDeadlineMs(deadline);
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
                job.addStageEvent(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, "GATE_ABORTED",
                        "等待人工确认期间收到中止请求，作业已中止（写阻断解除 " + (released ? "成功" : "失败，需人工恢复") + "）");
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
                job.addStageEvent(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, "GATE_TIMED_OUT",
                        "等待人工确认切换超时（" + confirmTimeoutMs + "ms），作业已中止（写阻断解除 "
                                + (released ? "成功" : "失败，需人工恢复") + "）");
                persist(job);
                job.markFinished();
                logger.warn("[AdhocRebuild] job {} aborted: await-confirm timeout, writeBlockReleased={} on {}",
                        job.getJobId(), released, job.getSourcePhysical());
                return false;
            }
            Thread.sleep(gatePollIntervalMs);
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
        job.addStageEvent(AdhocRebuildJob.STAGE_AWAIT_CONFIRM, "GATE_CONFIRMED",
                "人工放行切换（等待 " + (System.currentTimeMillis() - job.getAwaitConfirmSince()) + "ms）");
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
                job.addStageEvent(job.getStage(), "ABORTED", "作业中止（阶段 " + job.getStage() + "）");
                persist(job);
                job.markFinished();
                return null;
            }
            if (System.currentTimeMillis() >= nextRenewAt) {
                if (!renewLockOrLose(job)) {
                    job.setError("重建锁已被他人持有，为避免与另一个重建并发切换，已中止");
                    job.setStatus("ABORTED");
                    job.addStageEvent(job.getStage(), "LOCK_LOST",
                            "重建锁已被他人持有，为避免与另一个重建并发切换，已中止（阶段 " + job.getStage() + "）");
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
                // 失败样本随 task 完成透出（低层补采，null=无失败/补采失败；查询视图语义，不持久化）
                job.setFailureSamples(p.getFailures());
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
        // 调参顶级键（REST 语义）：仅 rps>0 才放 requests_per_second（负/null=不限，ES 缺省即不限；
        // 0 在 REST 里等同不限，与省略不可区分，故不单独下发）；slices 哨兵 0/负值放 "auto"
        if (job.getRequestsPerSecond() != null && job.getRequestsPerSecond() > 0) {
            body.put("requests_per_second", job.getRequestsPerSecond());
        }
        if (job.getSlices() != null) {
            body.put("slices", job.getSlices() >= 1 ? job.getSlices() : "auto");
        }
        if (job.getBatchSize() != null && job.getBatchSize() > 0) {
            body.put("size", job.getBatchSize());
        }
        Map<String, Object> resp = perform("POST", "/_reindex?wait_for_completion=false",
                MAPPER.writeValueAsString(body));
        String taskId = resp == null ? null : String.valueOf(resp.get("task"));
        if (taskId == null || "null".equals(taskId)) {
            throw new IllegalStateException("范围 reindex 提交失败（无 task 返回）");
        }
        return awaitTask(job, taskId);
    }

    /**
     * retry 的覆盖式全量 reindex（低层 REST，与 {@link #rangeReindex} 同一发送方式）。
     *
     * <p>首跑全量经 {@code EsIndexAdmin.submitReindex}（op_type=create：目标里的新版本不被
     * 旧存量覆盖）；retry 时 dest 已带上一轮部分数据，create 会把「已拷过的文档」当冲突跳过、
     * 无法修复半途而废的全量，故此处显式 {@code op_type=index} 幂等覆盖——同 _id 重写一遍，
     * 结果与从头全量一致，无需先删 dest。</p>
     */
    private String submitOverwriteReindex(AdhocRebuildJob job) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("conflicts", "proceed");
        body.put("source", java.util.Collections.singletonMap("index", job.getSourcePhysical()));
        Map<String, Object> destNode = new LinkedHashMap<>();
        destNode.put("index", job.getDestPhysical());
        destNode.put("op_type", "index");
        body.put("dest", destNode);
        // 调参键与 rangeReindex/submitReindex 同语义：仅 rps>0 下发；slices 哨兵 0/负值放 "auto"
        if (job.getRequestsPerSecond() != null && job.getRequestsPerSecond() > 0) {
            body.put("requests_per_second", job.getRequestsPerSecond());
        }
        if (job.getSlices() != null) {
            body.put("slices", job.getSlices() >= 1 ? job.getSlices() : "auto");
        }
        if (job.getBatchSize() != null && job.getBatchSize() > 0) {
            body.put("size", job.getBatchSize());
        }
        Map<String, Object> resp = perform("POST", "/_reindex?wait_for_completion=false",
                MAPPER.writeValueAsString(body));
        String taskId = resp == null ? null : String.valueOf(resp.get("task"));
        if (taskId == null || "null".equals(taskId)) {
            throw new IllegalStateException("覆盖式全量 reindex 提交失败（无 task 返回）");
        }
        return taskId;
    }

    /**
     * retry 的 create 式全量 reindex（低层 REST，2026-11-21 对账批）：dest 刚按源配置重建为空，
     * 与首跑语义一致（op_type=create + conflicts=proceed），与 {@link #submitOverwriteReindex}
     * 同一发送方式。独立于 {@code EsIndexAdmin.submitReindex}（typed 路径无 batchSize 通道）——
     * 只有 retry 会走到，首跑锁面零触碰；索引名在 start/retry 探测时已经过 admin 校验。
     */
    private String submitCreateReindex(AdhocRebuildJob job) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("conflicts", "proceed");
        body.put("source", java.util.Collections.singletonMap("index", job.getSourcePhysical()));
        Map<String, Object> destNode = new LinkedHashMap<>();
        destNode.put("index", job.getDestPhysical());
        destNode.put("op_type", "create");
        body.put("dest", destNode);
        if (job.getRequestsPerSecond() != null && job.getRequestsPerSecond() > 0) {
            body.put("requests_per_second", job.getRequestsPerSecond());
        }
        if (job.getSlices() != null) {
            body.put("slices", job.getSlices() >= 1 ? job.getSlices() : "auto");
        }
        if (job.getBatchSize() != null && job.getBatchSize() > 0) {
            body.put("size", job.getBatchSize());
        }
        Map<String, Object> resp = perform("POST", "/_reindex?wait_for_completion=false",
                MAPPER.writeValueAsString(body));
        String taskId = resp == null ? null : String.valueOf(resp.get("task"));
        if (taskId == null || "null".equals(taskId)) {
            throw new IllegalStateException("create 式全量 reindex 提交失败（无 task 返回）");
        }
        return taskId;
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

    /* 包级可见：事件环契约测试直驱（awaitSwitchConfirm 同款先例），避免测试复刻拼装逻辑。 */
    void addRound(AdhocRebuildJob job, int round, String phase, String taskId, long markMs, ReindexProgress p) {
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
        job.addStageEvent(job.getStage(), "ROUND_DONE", "第 " + round + " 轮（" + phase + "）完成：created "
                + n(p.getCreated()) + " / updated " + n(p.getUpdated()) + " / 冲突 " + n(p.getVersionConflicts()));
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

    /**
     * 终态文档数对账（2026-11-21 对账批）：FINALIZE 后活取源/目标 {@code _count} 比对，
     * 结论条并入 report 的 {@code reconcile} 键（快照经 toMap/status/jobs/retry 端点透出）。
     *
     * <p>口径对齐 xmigrate 的 destCount 终态对账：缺口=源-目标，仅正缺口视为缺数据；
     * 目标多于源（切换后新写入）不算缺口。三态如实：</p>
     * <ul>
     *   <li>MATCH：双侧可得且无正缺口（绿/一致）；</li>
     *   <li>GAP：缺口 &gt; 0（warn 级结论条「目标文档数 X / 源 Y，缺口 Z」，给幂等补齐路径）；</li>
     *   <li>SOURCE_GONE：源索引已删除（deleteOldIndex 或直连切换删源）——如实标注
     *       「源索引已不存在，无法对账」，不冒充成功也不误报；</li>
     *   <li>UNAVAILABLE：源存在但任一侧 count 取数失败——对账失败只进报告，
     *       绝不改变作业终态（run 的 catch 兜底也拦不到本方法：内部全吞）。</li>
     * </ul>
     */
    private void appendReconcile(AdhocRebuildJob job) {
        Map<String, Object> rec = new LinkedHashMap<>();
        try {
            boolean srcExists = esIndexAdmin.indexExists(job.getSourcePhysical());
            if (!srcExists) {
                rec.put("status", "SOURCE_GONE");
                rec.put("message", "源索引已不存在，无法对账（已删除或直连切换清源）；"
                        + "目标侧计数见 destDocCount，请按业务查询入口验收");
            } else {
                Long srcCount = docCount(job.getSourcePhysical());
                Long dstCount = docCount(job.getDestPhysical());
                rec.put("sourceCount", srcCount);
                rec.put("destCount", dstCount);
                if (srcCount == null || dstCount == null) {
                    rec.put("status", "UNAVAILABLE");
                    rec.put("message", "对账取数失败（源/目标 _count 不可得），本结论不作为验收依据；"
                            + "作业终态不受影响，可稍后在「完成校验」重试活取比对");
                    logger.warn("[AdhocRebuild] job {} 终态对账取数失败: source={} srcCount={} dstCount={}",
                            job.getJobId(), job.getSourcePhysical(), srcCount, dstCount);
                } else {
                    long gap = srcCount - dstCount;
                    rec.put("gap", gap);
                    if (gap > 0) {
                        rec.put("status", "GAP");
                        rec.put("message", "目标文档数 " + dstCount + " / 源 " + srcCount + "，缺口 " + gap
                                + "：重跑本作业可按 op_type 幂等补齐（已存在文档自动跳过/覆盖）");
                        logger.warn("[AdhocRebuild] job {} 终态对账发现缺口 {} 条: source={} dest={}",
                                job.getJobId(), gap, job.getSourcePhysical(), job.getDestPhysical());
                    } else {
                        rec.put("status", "MATCH");
                        rec.put("message", gap == 0
                                ? "对账一致：目标与源均为 " + srcCount + " 条"
                                : "无缺口：目标 " + dstCount + " 条不少于源 " + srcCount
                                        + "（差值 " + (-gap) + " 条为切换后新写入，属预期）");
                    }
                }
            }
        } catch (Exception e) {
            // 对账是验收增强而非终态判据：任何异常只落 UNAVAILABLE 结论，不上抛、不改状态机
            rec.put("status", "UNAVAILABLE");
            rec.put("message", "对账探测异常（" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())
                    + "），本结论不作为验收依据；作业终态不受影响");
            logger.warn("[AdhocRebuild] job {} 终态对账异常（不改终态）: {}", job.getJobId(), e.getMessage(), e);
        }
        putReconcile(job, rec);
    }

    /** 把对账结论并入 report（report 缺席时兜底建壳，保持 report 键结构稳定）。 */
    private static void putReconcile(AdhocRebuildJob job, Map<String, Object> rec) {
        Map<String, Object> r = job.getReport();
        if (r == null) {
            r = new LinkedHashMap<>();
            job.setReport(r);
        }
        r.put("reconcile", rec);
    }

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

    /**
     * GET /_alias/{physicalIndex} 反查物理索引所属的别名名列表（保持 ES 返回序，首个视为主别名）。
     *
     * <p>删除物理索引会连带断开其所属别名的成员关系，业务侧查询将失效——若源物理索引
     * 还是某个业务别名的成员，直连重建（切换=删旧物理+以旧名建别名）会让该别名失去
     * 全部成员、业务查询直接 404。prepare（信息透出）与 start（直连安全门）共用本查询；
     * 失败处置由调用方决定：prepare 容忍回空列表，start 保守拒绝。</p>
     *
     * <p>404 / 响应无该索引条目 / 无 aliases 节点 → 空列表（「无别名成员」与「查不到」
     * 在直连门上同向：门禁只对<b>确认非空</b>的成员表拒绝）。</p>
     */
    List<String> memberAliasesOf(String physicalIndex) throws IOException {
        Map<String, Object> resp = perform("GET", "/_alias/" + physicalIndex, null);
        List<String> out = new ArrayList<>();
        if (resp == null) {
            return out;
        }
        Object entry = resp.get(physicalIndex);
        if (!(entry instanceof Map)) {
            return out;
        }
        Object aliases = ((Map<?, ?>) entry).get("aliases");
        if (!(aliases instanceof Map)) {
            return out;
        }
        for (Object name : ((Map<?, ?>) aliases).keySet()) {
            out.add(String.valueOf(name));
        }
        return out;
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
        /* 源可能是历史托管重建产物（..._adhoc_yyyyMMddHHmmss）：先剥净旧代后缀再拼，
           否则每重建一代名字叠一层 _adhoc_，多代后逼近 255 上限且不可读 */
        String base = logicalName;
        while (true) {
            String stripped = base.replaceFirst("_adhoc_\\d{8,14}$", "");
            if (stripped.length() == base.length()) {
                break;
            }
            base = stripped;
        }
        base = base + "_adhoc_" + ts;
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

    /** 事件文案里的计数拼接（null 计数如实按 0 展示，ReindexProgress 字段允许为 null）。 */
    private static String n(Long v) {
        return v == null ? "0" : String.valueOf(v);
    }
}
