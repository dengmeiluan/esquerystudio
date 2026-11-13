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

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 一次迁移的<b>运行态句柄</b>：承载凭据（仅内存）、线程池、abort 标志与实时计数。
 *
 * <p><b>凭据边界</b>：{@link #conn} 是密码的唯一进程内驻留处；{@link #meta} 与 {@link #toJobEs()} 产出的持久化文档
 * 均不含凭据。进程重启 → 本句柄随内存消失 → ES 中作业转 INTERRUPTED，需 resume 重新供给凭据。</p>
 *
 * <p>实时计数用并发结构，多 {@link SliceWorker} 并发更新安全；{@link #toJobEs()} 每次构造<b>全新</b>快照文档，
 * 与正在被持久化的对象隔离，避免 save 期并发改 map。</p>
 */
public class MigrationHandle {

    private static final Logger logger = LoggerFactory.getLogger(MigrationHandle.class);

    /** 错误样本上限。 */
    private static final int MAX_ERROR_SAMPLES = 20;

    private final String jobId;
    private final RemoteClusterConn conn;
    private final ExecutorService executor;

    /** 不可变描述元信息（不含凭据、不含实时计数）；toJobEs 据此 + 实时计数构造快照。 */
    private final MigrateJobES meta;

    private final long persistThrottleMs;

    private volatile boolean aborted = false;
    private volatile String status = MigrateJobTracker.STATUS_RUNNING;
    private volatile String message;

    /** 本次运行开始/终态时刻（观测字段；resume 重开时 startedAtMs 刷新、finishedAtMs 清空）。 */
    private volatile Long startedAtMs;
    private volatile Long finishedAtMs;

    private final AtomicLong migrated = new AtomicLong();
    private final AtomicLong conflicts = new AtomicLong();
    private final AtomicLong errors = new AtomicLong();

    private final ConcurrentHashMap<Integer, String> sliceStatus = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, AtomicLong> sliceMigrated = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, AtomicLong> sliceErrors = new ConcurrentHashMap<>();
    private final List<String> errorSamples = Collections.synchronizedList(new ArrayList<>());

    private final AtomicLong lastPersistMs = new AtomicLong(0);

    public MigrationHandle(String jobId, RemoteClusterConn conn, ExecutorService executor,
                           MigrateJobES meta, long persistThrottleMs) {
        this.jobId = jobId;
        this.conn = conn;
        this.executor = executor;
        this.meta = meta;
        this.persistThrottleMs = persistThrottleMs;
    }

    public String getJobId() { return jobId; }
    public RemoteClusterConn getConn() { return conn; }
    public ExecutorService getExecutor() { return executor; }
    public MigrateJobES getMeta() { return meta; }

    public boolean isAborted() { return aborted; }
    public void abort() { this.aborted = true; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public void setMessage(String message) { this.message = message; }

    public void markSlice(int sliceId, String sliceState) {
        sliceStatus.put(sliceId, sliceState);
    }

    /** 作业开跑打点：start 首份快照前 / resume 重建 handle 后调用（重置——耗时口径恒为最近一次运行）。 */
    public void markStarted() {
        this.startedAtMs = System.currentTimeMillis();
        this.finishedAtMs = null;
    }

    /** 终态打点：监管线程落终态快照前调用（幂等，重复调用以首值为准）。 */
    public void markFinished() {
        if (this.finishedAtMs == null) {
            this.finishedAtMs = System.currentTimeMillis();
        }
    }

    /** slice 级失败累加（SliceWorker catch 兜底致命异常计 1；并发安全）。 */
    public void addSliceError(int sliceId, long n) {
        sliceErrors.computeIfAbsent(sliceId, k -> new AtomicLong()).addAndGet(n);
    }

    public void addMigrated(int sliceId, long n) {
        migrated.addAndGet(n);
        sliceMigrated.computeIfAbsent(sliceId, k -> new AtomicLong()).addAndGet(n);
    }

    public void addConflicts(long n) {
        conflicts.addAndGet(n);
    }

    /** 累计失败计数（n&gt;0 = bulk 级失败重试耗尽的真丢数据落账，全仓唯一调用点为 SliceWorker
     *  耗尽分支；n=0 = slice 致命异常的零计数样本登记，SliceWorker 已有 WARN 不重复打）。
     *  n&gt;0 落账时服务端 WARN 留痕——此前只进 errorSamples 滚动快照（上限 20 条、
     *  仅 progress API 可见），日志面全无且 slice 仍标 DONE，运维无法从日志定位丢失。 */
    public void addErrors(long n, String sample) {
        errors.addAndGet(n);
        if (n > 0) {
            logger.warn("[MigrationHandle] jobId={} 批量失败落账 {} 条（数据未迁入，样本文案: {}）",
                    jobId, n, sample);
        }
        if (sample != null) {
            synchronized (errorSamples) {
                if (errorSamples.size() < MAX_ERROR_SAMPLES) {
                    errorSamples.add(sample);
                }
            }
        }
    }

    /** 节流持久化槽位：距上次持久化超过阈值才返回 true（CAS 防并发重复落库）。 */
    public boolean tryPersistSlot() {
        long now = System.currentTimeMillis();
        long last = lastPersistMs.get();
        return now - last >= persistThrottleMs && lastPersistMs.compareAndSet(last, now);
    }

    /** 强制占用持久化槽位（终态落库前调用，跳过节流）。 */
    public void forcePersistSlot() {
        lastPersistMs.set(System.currentTimeMillis());
    }

    /** 构造一份全新的持久化快照（含当前实时计数 + 状态）。 */
    public MigrateJobES toJobEs() {
        MigrateJobES s = new MigrateJobES();
        s.setJobId(jobId);
        s.setSourceIndex(meta.getSourceIndex());
        s.setDestIndex(meta.getDestIndex());
        s.setIndexKey(meta.getIndexKey());
        // 源连接档案必须随快照带出：连接模型下 jobs 过滤/progress/abort/resume 的授权
        // 全部按 job.srcConnId 对写键——丢失即「发起者无法查看/中止自己发起的迁移」。
        s.setSrcConnId(meta.getSrcConnId());
        s.setRemoteEndpoint(meta.getRemoteEndpoint());
        s.setDestCreateMode(meta.getDestCreateMode());
        s.setTuneMode(meta.getTuneMode());
        s.setSlices(meta.getSlices());
        s.setBatchSize(meta.getBatchSize());
        s.setTotal(meta.getTotal());
        s.setCreateTime(meta.getCreateTime());
        s.setSavedSettings(new LinkedHashMap<>(meta.getSavedSettings()));
        // 无 format 的 date 字段告知必须随每次快照带出——toJobEs 每次都造全新对象，
        // 漏带这一行，告知就会在收尾持久化时静默消失，而那正是它最需要在场的时刻。
        s.setFormatlessDateFields(new java.util.ArrayList<>(meta.getFormatlessDateFields()));

        s.setStatus(status);
        s.setMessage(message);
        s.setMigrated(migrated.get());
        s.setConflicts(conflicts.get());
        s.setErrors(errors.get());

        Map<String, String> ss = new LinkedHashMap<>();
        for (Map.Entry<Integer, String> e : sliceStatus.entrySet()) {
            ss.put(String.valueOf(e.getKey()), e.getValue());
        }
        s.setSliceStatus(ss);

        Map<String, Long> sm = new LinkedHashMap<>();
        for (Map.Entry<Integer, AtomicLong> e : sliceMigrated.entrySet()) {
            sm.put(String.valueOf(e.getKey()), e.getValue().get());
        }
        s.setSliceMigrated(sm);

        Map<String, Long> se = new LinkedHashMap<>();
        for (Map.Entry<Integer, AtomicLong> e : sliceErrors.entrySet()) {
            se.put(String.valueOf(e.getKey()), e.getValue().get());
        }
        s.setSliceErrors(se);

        s.setStartedAtMs(startedAtMs);
        s.setFinishedAtMs(finishedAtMs);

        synchronized (errorSamples) {
            s.setErrorSamples(new ArrayList<>(errorSamples));
        }
        s.setUpdateTime(System.currentTimeMillis());
        return s;
    }

    /**
     * resume 还原上次持久化的 slice 失败计数（只累加非空正值；旧文档无此字段为 null 时静默跳过）。
     */
    public void restoreSliceErrors(Map<String, Long> persisted) {
        if (persisted == null) {
            return;
        }
        for (Map.Entry<String, Long> e : persisted.entrySet()) {
            if (e.getKey() == null || e.getValue() == null || e.getValue() <= 0) {
                continue;
            }
            try {
                addSliceError(Integer.parseInt(e.getKey().trim()), e.getValue());
            } catch (NumberFormatException ignore) {
                // 非 slice 序号键（脏数据）不致命，跳过
            }
        }
    }
}
