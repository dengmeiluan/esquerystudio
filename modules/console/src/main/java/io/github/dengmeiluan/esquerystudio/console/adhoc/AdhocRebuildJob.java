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

import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Adhoc（无 provider）托管重建的内存作业模型。
 *
 * <p>与 starter 主流程的 {@code EsRebuildJobTracker}（ES 持久化、绑定 provider 契约）不同，
 * Adhoc 作业面向「任意逻辑索引名」的一次性运维动作，v1 采用内存态：
 * 应用重启后作业记录丢失，但 ES 侧 reindex task 不受影响（可在任务管理页手动观察/取消）。
 * 该限制在 README 与前端向导中明确提示。</p>
 *
 * <p>字段均为 volatile / 同步集合：单 worker 线程写、任意 API 线程读快照。</p>
 */
public class AdhocRebuildJob {

    /**  门结局：人工确认放行 */
    public static final String GATE_CONFIRMED = "CONFIRMED";
    /**  门结局：等待人工确认超时 */
    public static final String GATE_TIMED_OUT = "TIMED_OUT";
    /**  门结局：等待期间收到中止请求 */
    public static final String GATE_ABORTED = "ABORTED";

    /** 切换前等待人工确认的 stage 名 */
    public static final String STAGE_AWAIT_CONFIRM = "AWAIT_CONFIRM";

    /** 追平策略 */
    public enum Strategy {
        /** A：时间字段增量追平（业务不停写，≤N 轮 range reindex 收敛后切换） */
        INCREMENTAL,
        /** B：写阻断窗口（block 旧索引写入 → 追平/全量 → 切换，写入短暂失败换绝对一致） */
        WRITE_BLOCK,
        /** C：直接切换 + 回补报告（不自动追平，产出差异报告与建议回补 DSL） */
        MANUAL
    }

    private final String jobId;
    /** 用户输入的逻辑名（别名或直连物理名） */
    private final String logicalName;
    private final Strategy strategy;
    /** true=logicalName 是别名（原子切换）；false=直连物理名（删旧+建别名，有短暂窗口） */
    private final boolean aliasMode;
    private final String sourcePhysical;
    private final String destPhysical;
    private final String timeField;
    private final long bufferMs;
    private final boolean deleteOldIndex;
    /** 切换前是否停下来等人工确认（粘贴期望配置的流程默认开启） */
    private final boolean pauseBeforeSwitch;
    private final long startedAt;
    /**
     * target-aware adhoc：本作业绑定的目标集群标识（connId 或 {@link #TARGET_HOST}）。
     * 非final：存储回读（重启后的历史作业）经 {@link #restoreTarget} 回填——status/abort
     * 要按 job target 恢复目标上下文，它是操作性字段而不只是展示字段。
     */
    private volatile String targetId = TARGET_HOST;
    /** 创建时的连接名快照（连接此后改名/删除不影响历史语义） */
    private volatile String targetNameSnapshot;
    /** 创建时的目标集群 ES 版本快照（审计与事后追查用） */
    private volatile String targetEsVersionSnapshot;
    /**
     * 作业创建者（用户级归属）。连接模型下 abort / confirm-switch 只允许创建者本人或 ADMIN：
     * 同一连接内持页写键的同事可以观测进度，但不能替代创建者做不可逆动作。
     * 旧作业（升级前持久化）无此字段=legacy，维持连接级语义，避免升级后无人能收尾。
     */
    private volatile String ownerUsername;
    /** 创建时角色快照（审计/展示；判权仍以当前身份角色为准，防降权后沿用旧权）。 */
    private volatile String ownerRole;

    private volatile String stage = "PENDING";
    /** RUNNING / SUCCEEDED / FAILED / ABORTED */
    private volatile String status = "RUNNING";
    private volatile String error;
    private volatile String currentTaskId;
    private volatile long finishedAt;
    private volatile boolean abortRequested;
    /** 本实例已失去重建锁（锁现属他人）。见 {@link #isLockLost()}。 */
    private volatile boolean lockLost;
    /**
     * 本作业的分布式锁是否<b>真的在提供互斥</b>（取自 {@code RebuildLockStore.isEnabled()}）。
     *
     * <p>{@code esquerystudio.elasticsearch.lock.enabled=false}（受支持的生产开关）时，store 的
     * {@code tryAcquire}/{@code renew} 恒 true 而 {@code get} 恒 null。若把该 null 当成
     * "锁没了"，关掉分布式锁就会让每个作业在第一个续约点被误判失锁、拒绝切换 ——
     * 即<b>关掉锁 = 重建功能整体失效</b>。</p>
     *
     * <p><b>反推方向同样危险且更隐蔽</b>：{@code get} 返回 null 还可能是 ES 读失败
     * （实现吞掉全部异常）或锁文档已被释放，误判成"锁未启用"会让作业<b>静默降级为无锁运行</b> ——
     * 不报错、不留痕、照常切换别名。故本字段由 store 的 {@code isEnabled()} 直接回答，不做反推。</p>
     */
    private volatile boolean lockActive;
    /**
     * 本作业在<b>已失去重建锁</b>的情况下仍执行了别名切换（人工确认已赢下门、切换不可撤销）。
     *
     * <p><b>为什么是一等字段而不是塞进 report map。</b>切换成功后 {@code run()} 会用
     * {@code buildReport(...)} <b>整体替换</b> report，塞在 map 里的该事实会<b>恰好在切换成功时消失</b>
     * ——而"无锁切换且成功"正是最需要事后追查的场景（数据可能已被另一个重建污染）。</p>
     */
    private volatile boolean switchedWithoutLock;
    /**
     * 切换确认门的<b>唯一裁决点</b>。null=未决；CONFIRMED=人工放行；TIMED_OUT=等待超时；ABORTED=等待期间中止。
     *
     * <p><b>为什么是 CAS 而不是裸 volatile boolean。</b>两条线程会同时争这个门：worker 线程做超时判定，
     * HTTP 线程处理人工确认。裸 volatile 只能「读到什么就是什么」，输的一方<b>无从得知自己输了</b> ——
     * 读后再动作正是 check-then-act 漏洞。而这里两条路径的后续动作互斥且都不可撤销：
     * 超时要<b>解除写阻断</b>，确认要<b>执行别名切换</b>。二者同时生效 = 在一个已解除阻断的索引上做切换，
     * 是数据一致性事故。</p>
     *
     * <p>用 {@code compareAndSet(null, ...)} 让<b>先到者赢且唯一</b>：胜者拿到 true 并独占执行自己的后续动作，
     * 败者拿到 false 后必须什么都不做 —— 超时输了就不解除阻断（放行切换继续），确认输了就抛错告诉操作者
     * 「已超时中止，确认无效」，而不是回一个说谎的 200。</p>
     */
    private final java.util.concurrent.atomic.AtomicReference<String> gateOutcome =
            new java.util.concurrent.atomic.AtomicReference<>();
    /** 进入 AWAIT_CONFIRM 的时刻（0=未进入）。用于控制台显示已阻断时长与超时判定 */
    private volatile long awaitConfirmSince;
    private volatile Long sourceDocCount;
    private volatile Long destDocCount;
    /** 全量 reindex 实时进度（created/total），awaitTask 每秒刷新，控制台进度条用；完成/失败后置 null */
    private volatile Map<String, Object> currentProgress;
    /**
     * docs 级实时进度三字段（total/created/updated），计数取自
     * {@link io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress} 单源（core 层解析 ES status 的
     * 唯一出处），{@code awaitTask} 轮询经 {@link #applyProgress} 刷新。
     *
     * <p>与 {@link #currentProgress}（created/total 二元、完成即清）并存为第二通道：本三字段
     * 直出 {@code toMap()} 顶层（/status 与 /jobs 同一输出），终态保留末次采样——追平轮间隙
     * 与收尾时控制台仍可见「写到哪了」。{@code null}=未进入 reindex 阶段/旧持久化回读，
     * 控制台按「字段缺席不渲染」向后兼容（纯增量，既有键零改动）。</p>
     */
    private volatile Long progressTotal;
    private volatile Long progressCreated;
    private volatile Long progressUpdated;
    /** MANUAL 策略的回补报告 / 其它策略的收尾摘要 */
    private volatile Map<String, Object> report;

    /** 追平轮次明细（每轮一个只读 Map，appended by worker） */
    private final List<Map<String, Object>> rounds = Collections.synchronizedList(new ArrayList<>());

    /** 宿主（控制集群）目标标识——与前端 X-Es-Target / EsClientRouter.HOST 同一约定值。 */
    public static final String TARGET_HOST = "host";

    public AdhocRebuildJob(String jobId, String logicalName, Strategy strategy, boolean aliasMode,
                           String sourcePhysical, String destPhysical, String timeField,
                           long bufferMs, boolean deleteOldIndex, boolean pauseBeforeSwitch) {
        this(jobId, logicalName, strategy, aliasMode, sourcePhysical, destPhysical, timeField,
                bufferMs, deleteOldIndex, pauseBeforeSwitch, TARGET_HOST, null, null);
    }

    /** target-aware adhoc 全参构造：尾部三参为目标身份（旧调用方走上面的兼容构造，归一 host）。 */
    public AdhocRebuildJob(String jobId, String logicalName, Strategy strategy, boolean aliasMode,
                           String sourcePhysical, String destPhysical, String timeField,
                           long bufferMs, boolean deleteOldIndex, boolean pauseBeforeSwitch,
                           String targetId, String targetNameSnapshot, String targetEsVersionSnapshot) {
        this.jobId = jobId;
        this.logicalName = logicalName;
        this.strategy = strategy;
        this.aliasMode = aliasMode;
        this.sourcePhysical = sourcePhysical;
        this.destPhysical = destPhysical;
        this.timeField = timeField;
        this.bufferMs = bufferMs;
        this.deleteOldIndex = deleteOldIndex;
        this.pauseBeforeSwitch = pauseBeforeSwitch;
        this.startedAt = System.currentTimeMillis();
        this.targetId = targetId == null || targetId.trim().isEmpty() ? TARGET_HOST : targetId.trim();
        this.targetNameSnapshot = targetNameSnapshot;
        this.targetEsVersionSnapshot = targetEsVersionSnapshot;
    }

    /**
     * 持久化/测试专用的最小构造：仅带 jobId，其余重建参数留空。
     *
     * <p>包可见，刻意不对外。用于 {@link AdhocJobStore} 从存储回读作业记录、
     * 以及契约测试造样本，避免为了一个 id 就凑齐 10 个重建参数。
     * 真正跑重建的作业仍走上面的多参构造，本构造不参与编排。</p>
     */
    AdhocRebuildJob(String jobId) {
        this(jobId, null, Strategy.MANUAL, false, null, null, null, 0L, false, false);
    }

    /** 持久化/测试专用工厂：造一个仅有 jobId 的最小作业。见 {@link #AdhocRebuildJob(String)}。 */
    public static AdhocRebuildJob minimal(String jobId) {
        return new AdhocRebuildJob(jobId);
    }

    /** API 输出用快照（避免直接序列化可变对象） */
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobId", jobId);
        m.put("logicalName", logicalName);
        m.put("strategy", strategy.name());
        m.put("aliasMode", aliasMode);
        m.put("sourcePhysical", sourcePhysical);
        m.put("destPhysical", destPhysical);
        m.put("timeField", timeField);
        m.put("bufferMs", bufferMs);
        m.put("deleteOldIndex", deleteOldIndex);
        m.put("pauseBeforeSwitch", pauseBeforeSwitch);
        // target-aware adhoc：目标身份三件套（缺省 host）。快照语义：连接此后改名/删除不追溯。
        m.put("targetId", targetId);
        m.put("targetName", targetNameSnapshot);
        m.put("targetEsVersion", targetEsVersionSnapshot);
        /* 用户级归属（legacy=true 表示升级前的旧作业，按连接级语义放行）：
           前端据此只对创建者亮 abort/confirm，其余人给「由 xxx 创建」的说明。 */
        m.put("ownerUsername", ownerUsername);
        m.put("ownerRole", ownerRole);
        m.put("ownerLegacy", ownerUsername == null || ownerUsername.trim().isEmpty());
        m.put("awaitConfirmSince", awaitConfirmSince == 0 ? null : awaitConfirmSince);
        // 门的精确结局（null=未决/未开门）。status 只能反推「作业中止了」，
        // 分不出是超时还是人工中止；下游少一个字段就要多一层猜测。
        m.put("gateOutcome", gateOutcome.get());
        // 失锁切换标记。刻意<b>不</b>放进 report —— report 会被切换成功后的
        // buildReport(...) 整体替换，那样该事实恰好在最需要追查的场景（无锁切换且成功）下消失。
        m.put("switchedWithoutLock", switchedWithoutLock);
        // 锁是否真的在提供互斥。暴露它是为了让「本次重建有没有跨实例保护」在控制台上可见 ——
        // 否则 lock.enabled=false 与锁正常工作在界面上完全无法区分。
        m.put("lockActive", lockActive);
        m.put("stage", stage);
        m.put("status", status);
        m.put("error", error);
        m.put("currentTaskId", currentTaskId);
        m.put("startedAt", startedAt);
        m.put("finishedAt", finishedAt == 0 ? null : finishedAt);
        // 作业级总耗时（finishedAt-startedAt）；运行中约定 -1（前端按「-」展示），
        // /status 与 /jobs 端点零改直出本键
        m.put("tookMs", finishedAt == 0 ? -1L : finishedAt - startedAt);
        m.put("sourceDocCount", sourceDocCount);
        m.put("destDocCount", destDocCount);
        m.put("currentProgress", currentProgress);
        // docs 级进度三字段直出顶层（/status 与 /jobs 同一 toMap 输出）。
        // null=未进入 reindex 阶段/旧回读，控制台按「字段缺席不渲染」向后兼容（纯增量）
        m.put("total", progressTotal);
        m.put("created", progressCreated);
        m.put("updated", progressUpdated);
        synchronized (rounds) {
            m.put("rounds", new ArrayList<>(rounds));
        }
        m.put("report", report);
        return m;
    }

    public String getJobId() {
        return jobId;
    }

    /** 本作业绑定的目标集群标识（connId 或 host）。 */
    public String getTargetId() {
        return targetId;
    }

    /** 创建时的连接显示名快照；host 作业为 null。 */
    public String getTargetNameSnapshot() {
        return targetNameSnapshot;
    }

    /** 创建时的目标集群 ES 版本快照；未探到为 null。 */
    public String getTargetEsVersionSnapshot() {
        return targetEsVersionSnapshot;
    }

    /** 作业创建者（username）；legacy 旧作业为 null。 */
    public String getOwnerUsername() {
        return ownerUsername;
    }

    public String getOwnerRole() {
        return ownerRole;
    }

    /** 创建时由控制器写入（service.start 重载）；存储回读亦经此恢复。 */
    public void setOwner(String ownerUsername, String ownerRole) {
        this.ownerUsername = ownerUsername;
        this.ownerRole = ownerRole;
    }

    /**
     * 存储回读专用（包可见）：按 toMap 快照回填目标身份。无 targetId 字段的旧数据
     * 由调用方归一为 host 后传入——「旧作业一律视作宿主」是本迁移的既定语义。
     */
    void restoreTarget(String targetId, String targetNameSnapshot, String targetEsVersionSnapshot) {
        this.targetId = targetId == null || targetId.trim().isEmpty() ? TARGET_HOST : targetId.trim();
        this.targetNameSnapshot = targetNameSnapshot;
        this.targetEsVersionSnapshot = targetEsVersionSnapshot;
    }

    /** 存储回读专用：旧 payload 无 owner 字段时保持 null（legacy，连接级语义）。 */
    void restoreOwner(String ownerUsername, String ownerRole) {
        this.ownerUsername = ownerUsername;
        this.ownerRole = ownerRole;
    }

    public String getLogicalName() {
        return logicalName;
    }

    public Strategy getStrategy() {
        return strategy;
    }

    public boolean isAliasMode() {
        return aliasMode;
    }

    public String getSourcePhysical() {
        return sourcePhysical;
    }

    public String getDestPhysical() {
        return destPhysical;
    }

    public String getTimeField() {
        return timeField;
    }

    public long getBufferMs() {
        return bufferMs;
    }

    public boolean isDeleteOldIndex() {
        return deleteOldIndex;
    }

    public boolean isPauseBeforeSwitch() {
        return pauseBeforeSwitch;
    }

    /** 门是否已被人工确认放行（等价于 gateOutcome==CONFIRMED）。 */
    public boolean isSwitchConfirmed() {
        return GATE_CONFIRMED.equals(gateOutcome.get());
    }

    /**
     * 尝试人工放行。<b>可能失败</b> —— 若超时/中止已先一步裁决，返回 false。
     *
     * <p>调用方必须检查返回值：返回 false 意味着这次确认<b>没有生效</b>，绝不可回一个成功应答，
     * 否则操作者会以为切换正在进行，而实际上作业已中止、写阻断已解除。</p>
     *
     * @return true=本次调用赢得裁决并放行；false=已被其它结局抢先裁决
     */
    public boolean confirmSwitch() {
        return gateOutcome.compareAndSet(null, GATE_CONFIRMED);
    }

    /**
     * 尝试把门裁决为 TIMED_OUT / ABORTED（worker 侧调用）。
     *
     * <p>返回 false 表示人工确认在同一瞬间抢先赢了 —— 此时 worker <b>绝不能</b>解除写阻断，
     * 必须放行切换继续走，否则就会在已解除阻断的索引上做切换。</p>
     */
    public boolean tryCloseGate(String outcome) {
        return gateOutcome.compareAndSet(null, outcome);
    }

    /** 门的当前结局（null=未决）。 */
    public String getGateOutcome() {
        return gateOutcome.get();
    }

    public long getAwaitConfirmSince() {
        return awaitConfirmSince;
    }

    public void setAwaitConfirmSince(long awaitConfirmSince) {
        this.awaitConfirmSince = awaitConfirmSince;
    }

    public long getStartedAt() {
        return startedAt;
    }

    public String getStage() {
        return stage;
    }

    public void setStage(String stage) {
        this.stage = stage;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public String getCurrentTaskId() {
        return currentTaskId;
    }

    public void setCurrentTaskId(String currentTaskId) {
        this.currentTaskId = currentTaskId;
    }

    public void markFinished() {
        this.finishedAt = System.currentTimeMillis();
    }

    public boolean isAbortRequested() {
        return abortRequested;
    }

    public void requestAbort() {
        this.abortRequested = true;
    }

    /**
     * 本实例是否已失去该索引的重建锁。
     *
     * <p>用途是<b>阻止误删他人的锁</b>：{@code EsRebuildLockStore.release} 刻意不校验 owner，
     * 失锁后再 release 删掉的是强夺者的锁，等于摘掉正在跑的那个重建的互斥保护。</p>
     */
    public boolean isLockLost() {
        return lockLost;
    }

    public void markLockLost() {
        this.lockLost = true;
    }

    /** 分布式锁是否真的在生效（lock.enabled=false 时为 false）。见字段 javadoc。 */
    public boolean isLockActive() {
        return lockActive;
    }

    public void setLockActive(boolean lockActive) {
        this.lockActive = lockActive;
    }

    /**
     * 是否在失锁状态下执行了切换。为 true 时同一索引上可能存在第二个重建作业，
     * 两者都可能翻过别名，必须人工核查别名指向与孤儿索引。
     */
    public boolean isSwitchedWithoutLock() {
        return switchedWithoutLock;
    }

    public void markSwitchedWithoutLock() {
        this.switchedWithoutLock = true;
    }

    public void setSourceDocCount(Long sourceDocCount) {
        this.sourceDocCount = sourceDocCount;
    }

    public void setDestDocCount(Long destDocCount) {
        this.destDocCount = destDocCount;
    }

    public void setCurrentProgress(Map<String, Object> currentProgress) {
        this.currentProgress = currentProgress;
    }

    /**
     * docs 级进度三字段的单一写入口——{@code awaitTask} 轮询
     * {@code EsIndexAdmin.getReindexProgress} 后回填，计数取 {@link ReindexProgress} 单源。
     * null 入参忽略（轮询失败不擦末次已知值）；简单路径（计数不可知）字段维持 null，
     * 控制台不渲染（不冒充 0）。
     */
    public void applyProgress(ReindexProgress p) {
        if (p == null) {
            return;
        }
        this.progressTotal = p.getTotal();
        this.progressCreated = p.getCreated();
        this.progressUpdated = p.getUpdated();
    }

    public void setReport(Map<String, Object> report) {
        this.report = report;
    }

    public void addRound(Map<String, Object> round) {
        // 轮次耗时透出。起点=上一轮 markMs（无轮次回退 startedAt）；
        // service 按时间顺序 append，markMs 单调递增故差值非负，clamp 兜底时钟回拨，
        // 保证 rounds[] 元素恒含 roundTookMs>=0（收口在本模型：五个 append 调用点自动生效）
        long start = lastRoundMarkMs();
        if (start <= 0) {
            start = startedAt;
        }
        round.put("roundTookMs", Math.max(0L, markMsOf(round) - start));
        rounds.add(Collections.unmodifiableMap(round));
    }

    /** 最近一轮的 markMs（无轮次返回 0）——roundTookMs 的起点依据 */
    private long lastRoundMarkMs() {
        synchronized (rounds) {
            if (rounds.isEmpty()) {
                return 0L;
            }
            return markMsOf(rounds.get(rounds.size() - 1));
        }
    }

    private static long markMsOf(Map<String, Object> round) {
        Object v = round.get("markMs");
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }

    public boolean isRunning() {
        return "RUNNING".equals(status);
    }
}
