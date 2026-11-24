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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * MCP 长调用任务台账：把「阻塞等待」换成「有界预算 + 可取消 + 可续传」。
 *
 * <p>三条硬约束，缺一不可：</p>
 * <ol>
 *   <li><b>客户端可取消</b>——{@code tasks/cancel} 与 {@code notifications/cancelled}
 *       都能真正中断执行：置取消位、中断工作线程，并把已知的 Elasticsearch 任务
 *       （{@code node:num}）经 {@code _tasks/{id}/_cancel} 一并撤掉，避免只断前端、
 *       生产集群仍在跑。</li>
 *   <li><b>3 分钟自动掐断</b>——每个任务有独立死线（默认 180000ms，配置可覆盖）。
 *       到点即取消，状态落 {@code cancelled}、原因 {@code DEADLINE}，绝不无限期占用
 *       HTTP 线程或工作线程。</li>
 *   <li><b>异步 + 续传</b>——声明 Tasks 扩展的客户端立即拿到 {@code working} 任务；
 *       执行结果按任务 id 保留一小时，客户端断线重连后 {@code tasks/get} 仍能取回，
 *       无需重放写操作。任务台账是进程内台账（多实例不共享），这是明确部署边界。</li>
 * </ol>
 *
 * <p>取消语义是幂等的：重复 cancel 只返回当前状态；已完成的任务不会被回滚。</p>
 */
final class McpTaskRegistry {

    private static final Logger LOG = LoggerFactory.getLogger(McpTaskRegistry.class);

    /** 任务结果保留时长：与 MCP Tasks 扩展的 ttlMs 同口径。 */
    static final long TASK_TTL_MS = 3_600_000L;
    /** 客户端建议轮询间隔。 */
    static final long POLL_INTERVAL_MS = 1_000L;
    /** 单次工具调用预算：3 分钟。可被 {@code esquerystudio.mcp.call-timeout-ms} 覆盖。 */
    static final long DEFAULT_CALL_TIMEOUT_MS = 180_000L;
    /** 预算上限：避免配置成天文数字反而把生产中间件挂住。 */
    static final long MAX_CALL_TIMEOUT_MS = 24L * 60 * 60 * 1000;
    private static final int MAX_CONCURRENT_TASKS = 8;
    private static final int MAX_RETAINED_TASKS = 200;
    /** 共享台账同步节拍：本实例心跳写 + 跨实例取消巡检 + 远端影子拉取。 */
    private static final long STORE_SYNC_INTERVAL_MS = 2_000L;
    /** 远端任务心跳超时：执行实例 2s 心跳一次，30s 未见视为执行方已失联。 */
    private static final long REMOTE_STALE_MS = 30_000L;

    /** 任务状态词与 MCP Tasks 扩展对齐。 */
    static final String WORKING = "working";
    static final String COMPLETED = "completed";
    static final String FAILED = "failed";
    static final String CANCELLED = "cancelled";

    private final long callTimeoutMs;
    private final ThreadPoolExecutor workers;
    private final Map<String, Task> tasks = new ConcurrentHashMap<>();
    private final Map<String, String> requestIndex = new ConcurrentHashMap<>();
    /** 本实例标识：共享台账里区分「执行方」与「只读影子」。 */
    private final String nodeId = UUID.randomUUID().toString();
    /** 共享台账（可选）：不装配时仍是纯进程内台账。 */
    private volatile McpTaskStore taskStore;
    private volatile long lastStoreSyncAt;
    /** 存储故障日志节流：心跳每 2s 一次，索引不可写时不能每拍刷一条 warn。 */
    private volatile long lastStoreWarnAt;
    /** 死线巡检：异步任务没有等待方，必须由台账自己到点掐断。 */
    private final java.util.concurrent.ScheduledExecutorService watchdog =
            java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "esq-mcp-deadline");
                t.setDaemon(true);
                return t;
            });

    McpTaskRegistry() {
        this(DEFAULT_CALL_TIMEOUT_MS);
    }

    McpTaskRegistry(long callTimeoutMs) {
        long budget = callTimeoutMs <= 0 ? DEFAULT_CALL_TIMEOUT_MS : Math.min(callTimeoutMs, MAX_CALL_TIMEOUT_MS);
        this.callTimeoutMs = budget;
        this.workers = new ThreadPoolExecutor(
                Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors())),
                MAX_CONCURRENT_TASKS, 60L, TimeUnit.SECONDS,
                new ArrayBlockingQueue<Runnable>(64),
                r -> {
                    Thread t = new Thread(r, "esq-mcp-task");
                    t.setDaemon(true);
                    return t;
                });
        this.workers.allowCoreThreadTimeOut(true);
        long tick = Math.max(50L, Math.min(500L, budget / 4));
        this.watchdog.scheduleWithFixedDelay(this::sweepDeadlines, tick, tick, TimeUnit.MILLISECONDS);
    }

    /** 到点即取消：同步等待方与异步 Tasks 共用同一条死线；顺带做共享台账心跳/巡检。 */
    private void sweepDeadlines() {
        long now = System.currentTimeMillis();
        for (Task task : tasks.values()) {
            if (WORKING.equals(task.status) && now >= task.deadlineAt) {
                LOG.info("[mcp-task] {} exceeded {}ms budget, auto-aborting", task.id, callTimeoutMs);
                cancel(task, "DEADLINE");
            }
        }
        syncStore(now);
    }

    /** 装上共享台账：立即恢复历史终端任务，执行中的由心跳/巡检接管。 */
    synchronized void attachStore(McpTaskStore store) {
        this.taskStore = store;
        if (store == null) return;
        hydrateFromStore(store);
    }

    private void hydrateFromStore(McpTaskStore store) {
        long now = System.currentTimeMillis();
        long cutoff = now - TASK_TTL_MS;
        java.util.List<Map<String, Object>> rows;
        try {
            rows = store.recent(MAX_RETAINED_TASKS);
        } catch (RuntimeException e) {
            LOG.warn("[mcp-task] hydrate from store failed (keeping in-memory ledger)", e);
            return;
        }
        for (Map<String, Object> rec : rows) {
            Task task = taskFromRecord(rec);
            if (task == null) continue;
            if (task.lastUpdatedAt < cutoff) {
                clearStored(task.id);
                continue;
            }
            if (WORKING.equals(task.status)) {
                long heartbeatAge = now - task.lastUpdatedAt;
                if (heartbeatAge > REMOTE_STALE_MS) {
                    /* 执行方已失联（重启/崩溃）：如实终结，别让客户端无限轮询 working。 */
                    task.remote = false;
                    task.status = CANCELLED;
                    task.stage = "cancelled";
                    task.cancelReason = "EXECUTOR_LOST";
                    task.note = "执行实例心跳中断（可能已重启或下线）；写操作请按幂等语义核对后重试。";
                    task.lastUpdatedAt = now;
                    persistTask(task);
                } else {
                    task.remote = true; /* 另一实例仍在执行：本地是可读影子，取消走共享标记。 */
                }
            }
            tasks.put(task.id, task);
            if (task.requestId != null && !task.requestId.isEmpty()) requestIndex.put(task.requestId, task.id);
        }
    }

    private Task taskFromRecord(Map<String, Object> rec) {
        if (rec == null) return null;
        Object id = rec.get("taskId");
        if (id == null) return null;
        Task task = new Task(String.valueOf(id),
                rec.get("owner") == null ? "" : String.valueOf(rec.get("owner")),
                rec.get("tool") == null ? null : String.valueOf(rec.get("tool")),
                rec.get("target") == null ? null : String.valueOf(rec.get("target")),
                rec.get("requestId") == null ? "" : String.valueOf(rec.get("requestId")));
        task.createdAt = asLong(rec.get("createdAtMs"), task.createdAt);
        task.lastUpdatedAt = asLong(rec.get("lastUpdatedAtMs"), task.lastUpdatedAt);
        task.deadlineAt = asLong(rec.get("deadlineAtMs"), task.deadlineAt);
        task.persistedAt = task.lastUpdatedAt;
        Object status = rec.get("status");
        if (status != null) task.status = String.valueOf(status);
        Object stage = rec.get("stage");
        if (stage != null) task.stage = String.valueOf(stage);
        Object cancelReason = rec.get("cancelReason");
        if (cancelReason != null) task.cancelReason = String.valueOf(cancelReason);
        Object note = rec.get("note");
        if (note != null) task.note = String.valueOf(note);
        Object esTaskId = rec.get("esTaskId");
        if (esTaskId != null) task.esTaskId = String.valueOf(esTaskId);
        Object progress = rec.get("progress");
        if (progress instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> p = (Map<String, Object>) progress;
            task.progress = new LinkedHashMap<>(p);
        }
        Object result = rec.get("result");
        if (result instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> r = (Map<String, Object>) result;
            task.result = new LinkedHashMap<>(r);
        }
        Object error = rec.get("error");
        if (error instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> err = (Map<String, Object>) error;
            task.error = new LinkedHashMap<>(err);
        }
        if (Boolean.TRUE.equals(rec.get("resultDropped"))) task.resultDropped = true;
        return task;
    }

    private static long asLong(Object value, long fallback) {
        if (value instanceof Number) return ((Number) value).longValue();
        if (value instanceof String) {
            try {
                return Long.parseLong((String) value);
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    /** 本实例领跑的任务写快照；远端影子与已清空的任务不写。 */
    private void persistTask(Task task) {
        McpTaskStore store = taskStore;
        if (store == null || task == null || task.remote) return;
        Map<String, Object> rec = new LinkedHashMap<>();
        rec.put("taskId", task.id);
        rec.put("owner", task.owner);
        rec.put("tool", task.tool);
        rec.put("target", task.target);
        rec.put("requestId", task.requestId);
        rec.put("status", task.status);
        rec.put("stage", task.stage);
        rec.put("createdAtMs", task.createdAt);
        rec.put("lastUpdatedAtMs", task.lastUpdatedAt);
        rec.put("deadlineAtMs", task.deadlineAt);
        rec.put("nodeId", nodeId);
        if (task.cancelReason != null) rec.put("cancelReason", task.cancelReason);
        if (task.note != null) rec.put("note", task.note);
        if (task.esTaskId != null) rec.put("esTaskId", task.esTaskId);
        if (task.progress != null) rec.put("progress", task.progress);
        if (task.result != null) rec.put("result", task.result);
        if (task.error != null) rec.put("error", task.error);
        if (task.resultDropped) rec.put("resultDropped", Boolean.TRUE);
        try {
            store.save(rec);
            task.persistedAt = task.lastUpdatedAt;
        } catch (RuntimeException e) {
            warnStoreFailure("[mcp-task] persist failed task={} (ledger stays in memory)", task.id, e);
        }
    }

    private void warnStoreFailure(String format, Object arg, RuntimeException e) {
        long now = System.currentTimeMillis();
        if (now - lastStoreWarnAt < 60_000L) return;
        lastStoreWarnAt = now;
        LOG.warn(format, arg, e);
    }

    /** 共享台账节拍：执行方心跳/跨实例取消巡检；远端影子拉最新或判失联。 */
    private void syncStore(long now) {
        McpTaskStore store = taskStore;
        if (store == null) return;
        if (now - lastStoreSyncAt < STORE_SYNC_INTERVAL_MS) return;
        lastStoreSyncAt = now;
        for (Task task : tasks.values()) {
            try {
                if (task.remote) {
                    Map<String, Object> rec = store.get(task.id);
                    if (rec == null) {
                        markExecutorLost(task, now, "执行实例的任务记录已被清理");
                        continue;
                    }
                    long remoteUpdated = asLong(rec.get("lastUpdatedAtMs"), 0L);
                    if (remoteUpdated > task.persistedAt) {
                        applyRemoteRecord(task, rec);
                    }
                    if (WORKING.equals(task.status) && now - task.lastUpdatedAt > REMOTE_STALE_MS) {
                        markExecutorLost(task, now, "执行实例心跳中断（可能已重启或下线）");
                    }
                    continue;
                }
                if (WORKING.equals(task.status)) {
                    if (!task.cancelRequested.get() && store.isCancelRequested(task.id)) {
                        LOG.info("[mcp-task] {} cancelled from another instance", task.id);
                        task.note = "取消请求来自其他控制台实例。";
                        cancel(task, "CLIENT");
                    } else {
                        /* 心跳：让其他实例看到活跃；progress 也随之共享。 */
                        task.lastUpdatedAt = now;
                        persistTask(task);
                    }
                }
            } catch (RuntimeException e) {
                warnStoreFailure("[mcp-task] store sync failed task={}", task.id, e);
            }
        }
    }

    private void applyRemoteRecord(Task task, Map<String, Object> rec) {
        Task latest = taskFromRecord(rec);
        if (latest == null) return;
        /* 本地已发起取消时，不被远端旧 working 记录翻回去；只吸收进度。 */
        if (task.cancelRequested.get() && WORKING.equals(latest.status)) {
            if (latest.progress != null) task.progress = latest.progress;
            task.lastUpdatedAt = Math.max(task.lastUpdatedAt, latest.lastUpdatedAt);
            task.persistedAt = latest.lastUpdatedAt;
            return;
        }
        task.status = latest.status;
        task.stage = latest.stage;
        task.cancelReason = latest.cancelReason;
        task.note = latest.note;
        task.progress = latest.progress;
        task.result = latest.result;
        task.error = latest.error;
        task.resultDropped = latest.resultDropped;
        task.lastUpdatedAt = latest.lastUpdatedAt;
        task.deadlineAt = latest.deadlineAt;
        task.persistedAt = latest.lastUpdatedAt;
        if (COMPLETED.equals(task.status) || FAILED.equals(task.status) || CANCELLED.equals(task.status)) {
            task.remote = false; /* 已终结：本实例直接对外服务即可。 */
        }
    }

    private void markExecutorLost(Task task, long now, String why) {
        if (!WORKING.equals(task.status)) return;
        task.remote = false;
        task.status = CANCELLED;
        task.stage = "cancelled";
        task.cancelReason = "EXECUTOR_LOST";
        task.note = why + "；写操作请按幂等语义核对后重试。";
        task.lastUpdatedAt = now;
        persistTask(task);
    }

    long callTimeoutMs() {
        return callTimeoutMs;
    }

    /** 执行体：在工作线程里跑，必须自己打开目标作用域（ThreadLocal 不跨线程继承）。 */
    interface Work {
        Map<String, Object> run(TaskControl control) throws Exception;
    }

    /**
     * 任务控制面：执行体用它上报进度、登记可取消的 Elasticsearch 任务 id。
     * 所有方法都可在取消后被调用（幂等、无副作用）。
     */
    interface TaskControl {
        /** 是否已被取消（客户端取消或死线掐断）。执行体应在关键节点主动检查。 */
        boolean cancelled();

        /** 取消原因：CLIENT / DEADLINE / SHUTDOWN；未取消返回 null。 */
        String cancelReason();

        /**
         * 登记 Elasticsearch 任务 id（{@code node:num}）。登记后取消会把
         * {@code _tasks/{id}/_cancel} 一起下发——这一步才是真正停止生产侧写入。
         */
        void attachEsTask(String esTaskId);

        /**
         * 登记底层 HTTP 请求的取消动作（REST 透传 / SQL / force merge 等同步等待）。
         * 取消时直接 abort 连接：阻塞线程立即返回、连接释放；ES 侧若仍在执行，
         * SQL 另有 {@code timeout} 兜底。已取消后再登记会立刻执行该动作。
         */
        void attachHttpCancel(Runnable httpCancel);

        /** 进度快照（total/completed/batches/...），马上反映到 tasks/get。 */
        void progress(Map<String, Object> progress);

        /** 阶段词，如 submitting / polling / finalizing；用于客户端展示「在做什么」。 */
        void stage(String stage);
    }

    static final class Task {
        final String id;
        final String owner;
        final String tool;
        final String target;
        final String requestId;
        volatile long createdAt;
        volatile String status = WORKING;
        volatile String stage = "queued";
        volatile long lastUpdatedAt;
        volatile long deadlineAt;
        volatile String cancelReason;
        volatile String esTaskId;
        /** 底层 HTTP abort 动作：取消时调用，断开在途 REST/SQL 连接。 */
        volatile Runnable httpCancel;
        volatile Map<String, Object> progress;
        volatile Map<String, Object> result;
        volatile Map<String, Object> error;
        /** 取消/失联等给 Agent 看的补充说明（跨实例取消、执行方失联、结果体被裁剪）。 */
        volatile String note;
        /** 共享台账里其他实例领跑的任务：本地只是可读影子。 */
        volatile boolean remote;
        /** 共享记录里最后一次成功写入的 lastUpdatedAt（毫秒），判断远端是否更新。 */
        volatile long persistedAt;
        /** 持久化时结果体超限被裁剪（状态仍完整，结果需重新查询）。 */
        volatile boolean resultDropped;
        /** 原始异常：必须保留类型，toolErrorCode 靠类型/消息分流成结构化 code。 */
        volatile Throwable cause;
        volatile Future<?> future;
        final AtomicBoolean cancelRequested = new AtomicBoolean(false);
        /** 取消时对 ES 任务的撤销动作：由控制台注入（需要路由作用域）。 */
        volatile java.util.function.Consumer<String> esCancel;

        Task(String id, String owner, String tool, String target, String requestId) {
            this.id = id;
            this.owner = owner;
            this.tool = tool;
            this.target = target;
            this.requestId = requestId;
            this.createdAt = System.currentTimeMillis();
            this.lastUpdatedAt = this.createdAt;
            this.deadlineAt = this.createdAt + DEFAULT_CALL_TIMEOUT_MS;
        }
    }

    /** 创建并提交任务；返回时任务已经开始（或已排队）。 */
    Task submit(String owner, String tool, String target, String requestId, Work work) {
        evictExpired();
        final Task task = new Task(UUID.randomUUID().toString(), owner, tool, target, requestId);
        task.deadlineAt = task.createdAt + callTimeoutMs;
        tasks.put(task.id, task);
        if (requestId != null && !requestId.isEmpty()) requestIndex.put(requestId, task.id);
        persistTask(task);
        TaskControl control = new Control(task);
        try {
            task.future = workers.submit(() -> execute(task, control, work));
        } catch (RejectedExecutionException e) {
            task.status = FAILED;
            task.error = errorMap("MCP_TASK_BUSY", "MCP 任务并发已满（" + MAX_CONCURRENT_TASKS
                    + "），请稍后重试；已有任务可用 tasks/get 续传", null);
            task.lastUpdatedAt = System.currentTimeMillis();
            persistTask(task);
        }
        return task;
    }

    private void execute(Task task, TaskControl control, Work work) {
        try {
            if (control.cancelled()) {
                finishCancelled(task, control.cancelReason());
                return;
            }
            task.stage = "running";
            Map<String, Object> out = work.run(control);
            if (control.cancelled()) {
                /* 执行体可能已经写了一半：结果不伪造成成功，按取消如实回报。 */
                finishCancelled(task, control.cancelReason());
                return;
            }
            task.result = out;
            task.status = COMPLETED;
            task.stage = "completed";
        } catch (Throwable e) {
            if (control.cancelled()) {
                LOG.info("[mcp-task] {} cancelled during execution: {}", task.id, control.cancelReason());
                finishCancelled(task, control.cancelReason());
                return;
            }
            task.status = FAILED;
            task.stage = "failed";
            task.cause = e;
            task.error = errorMap(McpErrors.toolErrorCode(e), String.valueOf(e.getMessage()), e.getClass().getSimpleName());
            LOG.warn("[mcp-task] {} failed tool={}", task.id, task.tool, e);
        } finally {
            task.httpCancel = null;
            task.lastUpdatedAt = System.currentTimeMillis();
            persistTask(task);
        }
    }

    private void finishCancelled(Task task, String reason) {
        task.status = CANCELLED;
        task.stage = "cancelled";
        task.cancelReason = reason == null ? "CLIENT" : reason;
        task.lastUpdatedAt = System.currentTimeMillis();
        persistTask(task);
    }

    /**
     * 同步等待：返回完成结果；超预算则取消并抛 {@link TimeoutException}。
     * 即使等待方放弃，任务仍留在台账里可被查询与取消（不泄漏线程）。
     */
    Map<String, Object> await(Task task, long waitMs) throws TimeoutException, ExecutionException, InterruptedException {
        long deadline = Math.min(System.currentTimeMillis() + Math.max(0, waitMs), task.deadlineAt);
        while (System.currentTimeMillis() < deadline) {
            if (COMPLETED.equals(task.status)) return task.result;
            if (FAILED.equals(task.status)) {
                /* 把原始异常原样抛回：调用方按类型/消息分流，结构化 code 不能退化成 INTERNAL。 */
                if (task.cause != null) throw new ExecutionException(task.cause);
                throw new ExecutionException(new TaskFailure(task.error));
            }
            if (CANCELLED.equals(task.status)) throw new ExecutionException(new TaskCancelled(task.cancelReason));
            Thread.sleep(25L);
        }
        cancel(task, "DEADLINE");
        throw new TimeoutException("MCP call exceeded " + callTimeoutMs + "ms budget");
    }

    /** 任务最终结果的 Map 形态（tasks/get 用）。 */
    Map<String, Object> view(String taskId, String owner) {
        Task task = tasks.get(taskId);
        if (task == null || !task.owner.equals(owner)) return null;
        return view(task);
    }

    Map<String, Object> view(Task task) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("taskId", task.id);
        out.put("status", task.status);
        out.put("stage", task.stage);
        out.put("createdAt", java.time.Instant.ofEpochMilli(task.createdAt).toString());
        out.put("lastUpdatedAt", java.time.Instant.ofEpochMilli(task.lastUpdatedAt).toString());
        out.put("deadlineAt", java.time.Instant.ofEpochMilli(task.deadlineAt).toString());
        out.put("ttlMs", TASK_TTL_MS);
        out.put("pollIntervalMs", POLL_INTERVAL_MS);
        out.put("tool", task.tool);
        out.put("resultType", COMPLETED.equals(task.status) ? "complete" : "task");
        if (task.note != null) out.put("note", task.note);
        if (task.remote) out.put("remote", Boolean.TRUE);
        if (task.resultDropped) out.put("resultDropped", Boolean.TRUE);
        if (task.progress != null) out.put("progress", task.progress);
        if (task.esTaskId != null) out.put("esTaskId", task.esTaskId);
        if (task.cancelReason != null) out.put("cancelReason", task.cancelReason);
        if (COMPLETED.equals(task.status) && task.result != null) out.put("result", toolResultEnvelope(task.result));
        if (FAILED.equals(task.status) && task.error != null) out.put("error", task.error);
        return out;
    }

    /**
     * 任务清单：给控制台「在途任务」与客户端自省用。按创建时间倒序，只返回该凭证自己的任务，
     * 默认不含结果体（结果可能很大，且列表只要状态/进度）。
     */
    List<Map<String, Object>> list(String owner, boolean activeOnly, int limit) {
        evictExpired();
        int cap = limit <= 0 ? 20 : Math.min(limit, MAX_RETAINED_TASKS);
        List<Task> rows = new ArrayList<>();
        for (Task task : tasks.values()) {
            if (owner != null && !task.owner.equals(owner)) continue;
            if (activeOnly && !WORKING.equals(task.status)) continue;
            rows.add(task);
        }
        rows.sort((a, b) -> Long.compare(b.createdAt, a.createdAt));
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < rows.size() && i < cap; i++) {
            Map<String, Object> view = view(rows.get(i));
            view.remove("result");
            view.put("elapsedMs", Math.max(0, System.currentTimeMillis() - rows.get(i).createdAt));
            long remaining = rows.get(i).deadlineAt - System.currentTimeMillis();
            view.put("remainingMs", Math.max(0, remaining));
            out.add(view);
        }
        return out;
    }

    /** 取消：幂等。返回取消后的任务视图；任务不存在/不属于该凭证返回 null。 */
    Map<String, Object> cancel(String taskId, String owner, String reason) {
        Task task = tasks.get(taskId);
        if (task == null || (owner != null && !task.owner.equals(owner))) return null;
        cancel(task, reason);
        return view(task);
    }

    void cancel(Task task, String reason) {
        if (COMPLETED.equals(task.status) || FAILED.equals(task.status)) {
            return; /* 已终结的任务不回滚：取消改不了已发生的写入。 */
        }
        String why = reason == null ? "CLIENT" : reason;
        if (task.remote) {
            /* 执行在别的实例：写共享取消标记，由执行方 2s 心跳巡检中断；本地状态如实呈现。 */
            task.cancelRequested.set(true);
            task.cancelReason = why;
            task.status = CANCELLED;
            task.stage = "cancelled";
            task.note = "取消请求已发送给执行实例（最长约 2 秒内中断）；最终结果以执行实例的记录为准。";
            task.lastUpdatedAt = System.currentTimeMillis();
            McpTaskStore remoteStore = taskStore;
            if (remoteStore != null) {
                try {
                    remoteStore.requestCancel(task.id);
                } catch (RuntimeException e) {
                    LOG.warn("[mcp-task] remote cancel request failed task={}", task.id, e);
                }
            }
            return;
        }
        if (task.cancelRequested.compareAndSet(false, true) && !CANCELLED.equals(task.status)) {
            task.cancelReason = why;
            task.status = CANCELLED;
            task.stage = "cancelling";
            task.lastUpdatedAt = System.currentTimeMillis();
        }
        Future<?> future = task.future;
        if (future != null) future.cancel(true);
        Runnable httpAbort = task.httpCancel;
        if (httpAbort != null) {
            try {
                httpAbort.run();
            } catch (RuntimeException e) {
                LOG.warn("[mcp-task] HTTP abort failed task={}", task.id, e);
            }
        }
        String esTask = task.esTaskId;
        if (esTask != null) {
            java.util.function.Consumer<String> hook = task.esCancel;
            if (hook != null) {
                try {
                    hook.accept(esTask);
                } catch (RuntimeException e) {
                    LOG.warn("[mcp-task] ES task cancel failed task={} esTask={}", task.id, esTask, e);
                }
            }
        }
        if (CANCELLED.equals(task.status) && !"cancelling".equals(task.stage)) {
            task.stage = "cancelled";
        }
        if ("cancelling".equals(task.stage)) {
            /* 工作线程可能不响应中断（socket 读）；状态保持 cancelled，不假装已停止写入。 */
            task.stage = "cancelled";
        }
        task.lastUpdatedAt = System.currentTimeMillis();
        persistTask(task);
    }

    /** 按 JSON-RPC 请求 id 取消在途调用（notifications/cancelled 用）。 */
    Map<String, Object> cancelByRequestId(String requestId, String owner) {
        String taskId = requestIndex.get(requestId);
        if (taskId == null) return null;
        return cancel(taskId, owner, "CLIENT");
    }

    /** 越界清理：结果按 ttl 淘汰，同时限制总量。 */
    private void evictExpired() {
        long cutoff = System.currentTimeMillis() - TASK_TTL_MS;
        List<Task> finished = new ArrayList<>();
        for (Task task : tasks.values()) {
            boolean terminal = COMPLETED.equals(task.status) || FAILED.equals(task.status) || CANCELLED.equals(task.status);
            if (terminal && task.lastUpdatedAt < cutoff) {
                tasks.remove(task.id);
                if (task.requestId != null) requestIndex.remove(task.requestId);
                clearStored(task.id);
            } else if (terminal) {
                finished.add(task);
            }
        }
        if (tasks.size() > MAX_RETAINED_TASKS) {
            finished.sort((a, b) -> Long.compare(a.lastUpdatedAt, b.lastUpdatedAt));
            int excess = tasks.size() - MAX_RETAINED_TASKS;
            for (int i = 0; i < excess && i < finished.size(); i++) {
                Task task = finished.get(i);
                tasks.remove(task.id);
                if (task.requestId != null) requestIndex.remove(task.requestId);
                clearStored(task.id);
            }
        }
    }

    private void clearStored(String taskId) {
        McpTaskStore store = taskStore;
        if (store == null) return;
        try {
            store.clear(taskId);
        } catch (RuntimeException e) {
            LOG.warn("[mcp-task] clear stored task failed task={}", taskId, e);
        }
    }

    /** 进程关闭：中断全部工作线程，避免守护线程把宿主一起拖住。 */
    public void shutdown() {
        for (Task task : tasks.values()) cancel(task, "SHUTDOWN");
        watchdog.shutdownNow();
        workers.shutdownNow();
    }

    private static Map<String, Object> toolResultEnvelope(Map<String, Object> data) {
        List<Map<String, Object>> content = new ArrayList<>();
        Map<String, Object> text = new LinkedHashMap<>();
        text.put("type", "text");
        text.put("text", toJson(data));
        content.add(text);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("content", content);
        envelope.put("structuredContent", data != null && !data.isEmpty() ? data : Collections.singletonMap("result", data));
        envelope.put("isError", false);
        return envelope;
    }

    private static String toJson(Map<String, Object> data) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(data);
        } catch (Exception e) {
            return String.valueOf(data);
        }
    }

    private static Map<String, Object> errorMap(String code, String message, String type) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", code == null ? "INTERNAL" : code);
        error.put("message", message == null ? "unknown" : message);
        if (type != null) error.put("type", type);
        return error;
    }

    /** 执行失败：由 {@link #await} 包装成 ExecutionException，调用方还原原始错误码。 */
    static final class TaskFailure extends RuntimeException {
        final Map<String, Object> error;

        TaskFailure(Map<String, Object> error) {
            super(String.valueOf(error == null ? "task failed" : error.get("message")));
            this.error = error;
        }
    }

    /** 执行被取消：与失败区分，客户端可据此展示「已取消」而不是「报错」。 */
    static final class TaskCancelled extends RuntimeException {
        final String reason;

        TaskCancelled(String reason) {
            super("task cancelled: " + reason);
            this.reason = reason;
        }
    }

    private final class Control implements TaskControl {
        private final Task task;

        Control(Task task) {
            this.task = task;
        }

        @Override
        public boolean cancelled() {
            return task.cancelRequested.get();
        }

        @Override
        public String cancelReason() {
            return task.cancelReason;
        }

        @Override
        public void attachEsTask(String esTaskId) {
            if (esTaskId == null || esTaskId.trim().isEmpty()) return;
            task.esTaskId = esTaskId.trim();
            task.lastUpdatedAt = System.currentTimeMillis();
        }

        @Override
        public void attachHttpCancel(Runnable httpCancel) {
            if (httpCancel == null) return;
            task.httpCancel = httpCancel;
            task.lastUpdatedAt = System.currentTimeMillis();
            /* 取消先于请求登记（预算到点/客户端取消撞上提交窗）：立即 abort，避免连接继续挂在生产上。 */
            if (task.cancelRequested.get()) {
                try {
                    httpCancel.run();
                } catch (RuntimeException e) {
                    LOG.warn("[mcp-task] HTTP abort (late attach) failed task={}", task.id, e);
                }
            }
        }

        @Override
        public void progress(Map<String, Object> progress) {
            if (progress == null) return;
            task.progress = new LinkedHashMap<>(progress);
            task.lastUpdatedAt = System.currentTimeMillis();
        }

        @Override
        public void stage(String stage) {
            if (stage == null || stage.isEmpty()) return;
            task.stage = stage;
            task.lastUpdatedAt = System.currentTimeMillis();
        }
    }
}