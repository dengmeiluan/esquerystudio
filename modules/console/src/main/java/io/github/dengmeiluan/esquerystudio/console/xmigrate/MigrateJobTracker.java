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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 迁移作业状态追踪器（旁路设计，仿 {@code EsRebuildJobTracker}）：
 * 全程 try-catch，持久化失败仅告警、绝不抛出，不影响迁移主逻辑（追踪是观测增强、非关键路径）。
 */
public class MigrateJobTracker {

    private static final Logger logger = LoggerFactory.getLogger(MigrateJobTracker.class);

    private static final int MAX_MESSAGE_LEN = 1000;

    /** save failed WARN 节流间隔（JwtVerifier lastParseWarnAt 同款范式）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    /** 进度心跳节流间隔（同 WARN_THROTTLE_MS 的 60s 档——日志侧回答「作业还活着吗」。 */
    private static final long HEARTBEAT_THROTTLE_MS = 60_000L;

    /** save 失败节流——窗口开时间戳与窗口内累计数（追踪是旁路，存储持续故障时
     *  逐条全栈 WARN 会刷屏淹没业务日志：首条带栈留全量证据，窗口内仅累计，窗口尾汇总一条无栈）。 */
    private final AtomicLong lastSaveWarnAt = new AtomicLong(0);
    private final AtomicLong saveFailSinceWarn = new AtomicLong(0);
    /** 心跳窗口开时间戳（AtomicLong CAS 单写者，同 lastSaveWarnAt 范式）。 */
    private final AtomicLong lastHeartbeatAt = new AtomicLong(0);

    /** 作业状态。 */
    public static final String STATUS_RUNNING = "RUNNING";
    public static final String STATUS_DONE = "DONE";
    public static final String STATUS_FAILED = "FAILED";
    public static final String STATUS_ABORTED = "ABORTED";
    public static final String STATUS_INTERRUPTED = "INTERRUPTED";

    /** 单 slice 子状态。 */
    public static final String SLICE_PENDING = "PENDING";
    public static final String SLICE_RUNNING = "RUNNING";
    public static final String SLICE_DONE = "DONE";
    public static final String SLICE_FAILED = "FAILED";

    private final MigrateJobStore jobStore;

    public MigrateJobTracker(MigrateJobStore jobStore) {
        this.jobStore = jobStore;
    }

    /** 持久化一份作业快照（创建 / 进度刷新 / 终态都走这里）。失败仅告警（起节流）。 */
    public void save(MigrateJobES job) {
        heartbeat(job);
        try {
            job.setMessage(truncate(job.getMessage()));
            job.setUpdateTime(System.currentTimeMillis());
            jobStore.save(job);
        } catch (Exception e) {
            /* WARN 60s 节流（AtomicLong，范式= JwtVerifier lastParseWarnAt）——
               迁移进度刷新是高频路径，存储持续故障时逐条全栈 WARN 刷屏。首条带全栈（告警职责
               保留）；窗口内仅累计；窗口尾（下一窗口首败）先汇总上一窗累计 xN 一条无栈再落本窗
               首条。节流只动日志，save 契约（吞异常、不反噬主逻辑）不变。 */
            long total = saveFailSinceWarn.incrementAndGet();
            long now = System.currentTimeMillis();
            long last = lastSaveWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastSaveWarnAt.compareAndSet(last, now)) {
                long suppressed = saveFailSinceWarn.getAndSet(0);
                if (suppressed > 1) {
                    logger.warn("[MigrateJobTracker] save failed x{}（{}s 窗口聚合，堆栈见首条 WARN）",
                            suppressed, WARN_THROTTLE_MS / 1000);
                }
                logger.warn("[MigrateJobTracker] save failed jobId={}", job == null ? null : job.getJobId(), e);
            }
        }
    }

    public MigrateJobES findById(String jobId) {
        try {
            return jobStore.findById(jobId);
        } catch (Exception e) {
            logger.warn("[MigrateJobTracker] findById failed jobId={}", jobId, e);
            return null;
        }
    }

    public List<MigrateJobES> listRecent(int limit) {
        try {
            return jobStore.listRecent(limit);
        } catch (Exception e) {
            logger.warn("[MigrateJobTracker] listRecent failed", e);
            return Collections.emptyList();
        }
    }

    /**
     * 启动期清扫：把 ES 里仍 RUNNING（上次进程崩溃/重启遗留）的作业标为 INTERRUPTED（可续）。
     * 仅在 {@link RunningMigrations} 中不存在该 jobId 时清扫（避免误伤本进程刚起的活跃作业）。
     */
    public void sweepInterrupted(RunningMigrations runningMigrations) {
        try {
            List<MigrateJobES> running = jobStore.listByStatus(STATUS_RUNNING, 100);
            for (MigrateJobES job : running) {
                if (runningMigrations.get(job.getJobId()) == null) {
                    job.setStatus(STATUS_INTERRUPTED);
                    job.setMessage(truncate("进程重启，作业中断；重新录入旧集群账密后可 resume 续跑"));
                    if (job.getFinishedAtMs() == null) {
                        job.setFinishedAtMs(System.currentTimeMillis()); // INTERRUPTED 也是终态，补尾值（耗时列口径完整）
                    }
                    job.setUpdateTime(System.currentTimeMillis());
                    jobStore.save(job);
                    logger.info("[MigrateJobTracker] sweep -> INTERRUPTED jobId={}", job.getJobId());
                }
            }
        } catch (Exception e) {
            logger.warn("[MigrateJobTracker] sweepInterrupted failed", e);
        }
    }

    /**
     * RUNNING 作业的<b>周期心跳日志</b>（观测缺口收口，纯日志零契约）。
     *
     * <p>迁移进度此前只落存储不留服务端日志——长作业（小时级 slice 搬运）在控制台日志里
     * 全程静默，排障时无法从日志侧回答「作业还活着吗、搬到哪了」。{@code save} 是进度刷新
     * 的必经收口（SliceWorker 持久化槽位驱动），在它上面挂 60s 节流 INFO，特征串
     * {@code [Xmigrate] heartbeat jobId=... done=100/total=1000}。</p>
     *
     * <p>刻意放 try 之前：存储故障时心跳照发（心跳描述的是作业存活，不是存储健康）。
     * 计数未知（total/migrated 为 null）不冒充——凑不出 done=/total= 语义就静默跳过。
     * 节流同 {@link #lastSaveWarnAt} AtomicLong CAS 范式；本方法只打日志，绝不抛出。</p>
     */
    private void heartbeat(MigrateJobES job) {
        if (job == null || !STATUS_RUNNING.equals(job.getStatus())
                || job.getTotal() == null || job.getMigrated() == null) {
            return;
        }
        long now = System.currentTimeMillis();
        long last = lastHeartbeatAt.get();
        if (now - last > HEARTBEAT_THROTTLE_MS && lastHeartbeatAt.compareAndSet(last, now)) {
            logger.info("[Xmigrate] heartbeat jobId={} done={}/total={}",
                    job.getJobId(), job.getMigrated(), job.getTotal());
        }
    }

    private String truncate(String s) {
        if (s == null) {
            return null;
        }
        return s.length() > MAX_MESSAGE_LEN ? s.substring(0, MAX_MESSAGE_LEN) : s;
    }
}
