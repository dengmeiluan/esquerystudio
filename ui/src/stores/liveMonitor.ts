import { writeStoredRaw } from '../utils/safeJson';

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import { usePref } from '../composables/urlState';
import { effectivePagesForTarget } from '../router';
import { useAppStore } from './app';
import { useAuthStore } from './auth';

/**
 * 全局实时采样器：趋势序列/告警状态机从 LiveDashboardView 组件态提升为常驻 store——
 * 此前挂在组件里，切页即销毁、回来重新「采样中约 10s 后出图」，趋势永远攒不起来。
 * 现在首次进大屏后采样器全局常驻（切页不停、参与告警持续时长累计），并以 sessionStorage
 * 快照按目标集群隔离持久化，页面刷新后趋势窗口无缝接续。
 */

/** 告警是状态对象非日志行（——按语义 key 聚合，每 tick diff 更新/新建/转恢复 */
export interface LiveAlert {
  key: string; severity: 'warn' | 'bad'; title: string;
  num: number; unit: string; peak: number; threshold: string;
  firstAt: number; lastAt: number; active: boolean; resolvedAt?: number;
}

const SNAP_PREFIX = 'esquerystudio.live.snapshot:';
/** 快照超过该时长视为陈旧（趋势断层没有延续价值），丢弃重采。
 A：localStorage 持久化后拉长到 30 分钟——短时间关浏览器重开仍可续接趋势 */
const SNAP_TTL_MS = 30 * 60 * 1000;
/** 序列上限（240 点：5s 前台 ≈ 20 分钟窗口，15s 背景 ≈ 60 分钟）——A 拉长窗口； 窗长偏好在其内截取展示 */
const MAX_POINTS = 240;
/** 离开大屏后的背景采样下限：仍持续攒趋势与告警，但降频省集群与浏览器资源 */
const BG_MIN_MS = 15000;

/** 每节点序列槽（ 扩 qps/idx 吞吐差分） */
interface NodeSeries { heap: number[]; cpu: number[]; disk: number[]; qps: number[]; idx: number[] }

/**
 * 每节点吞吐差分——ΔqueryTotal/ΔindexTotal ÷ dt 秒推入 nodeSeries[name].qps/idx
 * （brief 已带 per-node 计数器，此前只做集群合计差分=「个体负载」不可见）。
 * prev=null（首轮/切集群后）只记基线不推序列（差分宁缺毋假）；无基线的新节点跳过；
 * dtSec<=0 防除零。返回基线（调用方存作下轮 prev）。
 */
export function pushNodeRateSeries(
  prev: Map<string, { q: number; i: number }> | null,
  nodes: any[],
  nodeSeries: Record<string, NodeSeries>,
  dtSec: number,
): Map<string, { q: number; i: number }> {
  const now = new Map<string, { q: number; i: number }>();
  for (const n of nodes) {
    const key = String(n.name || n.nodeId);
    const q = Number(n.queryTotal || 0), i = Number(n.indexTotal || 0);
    now.set(key, { q, i });
    const s = nodeSeries[key];
    if (!prev || !s || dtSec <= 0) continue;
    const p = prev.get(key);
    if (!p) continue; /* 新节点无基线，首轮跳过 */
    pushCappedRate(s.qps, Math.max(0, (q - p.q) / dtSec));
    pushCappedRate(s.idx, Math.max(0, (i - p.i) / dtSec));
  }
  return now;
}

function pushCappedRate(arr: number[], v: number) { arr.push(v); if (arr.length > MAX_POINTS) arr.shift(); }

export const useLiveMonitorStore = defineStore('liveMonitor', () => {
  const app = useAppStore();
  /* 页面白名单感知（pending-tasks 属诊断页端点，无 diag 权限的角色轮询必 403） */
  const auth = useAuthStore();

  /* 采样间隔是个人偏好，跨会话保留 */
  const intervalMs = usePref('live.intervalMs', 5000);
  /* 趋势窗长偏好（点数）——展示窗在采样上限内截取，对标阿里云时间控件的多档体验 */
  const windowPts = usePref('live.windowPts', 120);
  /* 暂停态同步记忆——用户暂停排查问题时刷新/重进不应又跑起来
 （与 intervalMs 同为「大屏工作状态」口径）；默认 running 不落盘 */
  const running = usePref('live.running', true);

  const health = ref<any>(null);
  const nodes = ref<any[]>([]);
  const pendingTasks = ref(0);

  const qpsSeries = ref<number[]>([]);
  const indexRateSeries = ref<number[]>([]);
  const heapSeries = ref<number[]>([]);
  /* 实时走势扩展：CPU/磁盘 均值序列（与 heap 同口径=数据节点均值；响应「很多东西没有实时走势图」实报） */
  const cpuSeries = ref<number[]>([]);
  const diskSeries = ref<number[]>([]);
/* A：每节点水位历史（name → {heap,cpu,disk,qps,idx} 序列），节点卡 mini spark/节点对比卡用；随 snapshot 持久化 */
const nodeSeries = ref<Record<string, NodeSeries>>({});
  /* ②任务卡走势：运行任务数会话窗序列（视图 watch 推送；任务为全局口径，
 切目标集群**不清位**——与按集群隔离的 qps/heap 序列相反，勿加进 watch(app.target) 清位） */
  const jobCountSeries = ref<number[]>([]);
  /* 每点的真实采样时刻——大屏内外采样频率不同，窗口跨度不能再用「点数 × 间隔」估算 */
  const sampleTs = ref<number[]>([]);
  /* 大屏是否在前台展示：是则全速采样，否则降到 BG_MIN_MS 背景频率 */
  const focus = ref(false);
  const alertsMap = ref(new Map<string, LiveAlert>());
  const nowTs = ref(Date.now());
  /* 最后一次成功采样时刻——拉取失败（凭证过期/目标不可达）时冻结告警状态机，避免误报「已恢复」 */
  const lastOkAt = ref(0);
  const obsStale = computed(() => lastOkAt.value > 0 && nowTs.value - lastOkAt.value > intervalMs.value * 3);

  let lastSampleQ = 0, lastSampleI = 0, lastSampleT = 0;
  /* 每节点吞吐差分基线（null=首轮/切集群后，只记不推） */
  let nodeRatePrev: Map<string, { q: number; i: number }> | null = null;
  let timer: any = null;
  let started = false;

  /* ==================== 快照持久化（按目标集群隔离，防跨集群串数据） ==================== */
  function snapKey() { return SNAP_PREFIX + (app.target || 'host'); }

  function restore() {
    try {
      const raw = localStorage.getItem(snapKey());
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || Date.now() - (s.at || 0) > SNAP_TTL_MS) return;
      qpsSeries.value = Array.isArray(s.qps) ? s.qps : [];
      indexRateSeries.value = Array.isArray(s.idx) ? s.idx : [];
      heapSeries.value = Array.isArray(s.heap) ? s.heap : [];
      cpuSeries.value = Array.isArray(s.cpu) ? s.cpu : [];
      diskSeries.value = Array.isArray(s.disk) ? s.disk : [];
      // 旧快照没有 ts（跨版本刷新）：按点数与当前间隔倒推，宁可估算也不丢趋势
      sampleTs.value = Array.isArray(s.ts) && s.ts.length === qpsSeries.value.length
        ? s.ts
        : qpsSeries.value.map((_: number, i: number) => (s.at || Date.now()) - (qpsSeries.value.length - 1 - i) * intervalMs.value);
      nodeSeries.value = (s.nodeSeries && typeof s.nodeSeries === 'object') ? s.nodeSeries : {};
      jobCountSeries.value = Array.isArray(s.jobCount) ? s.jobCount : [];
      lastSampleQ = s.lq || 0; lastSampleI = s.li || 0; lastSampleT = s.lt || 0;
      const am = new Map<string, LiveAlert>();
      for (const a of (Array.isArray(s.alerts) ? s.alerts : [])) am.set(a.key, a);
      alertsMap.value = am;
    } catch { /* 坏快照静默丢弃，从零重采 */ }
  }

  function snapshot() {
    writeStoredRaw(localStorage, snapKey(), JSON.stringify({
      at: Date.now(),
      qps: qpsSeries.value, idx: indexRateSeries.value, heap: heapSeries.value,
      cpu: cpuSeries.value, disk: diskSeries.value, ts: sampleTs.value,
      nodeSeries: nodeSeries.value,
      jobCount: jobCountSeries.value,
      lq: lastSampleQ, li: lastSampleI, lt: lastSampleT,
      alerts: [...alertsMap.value.values()],
    }));
  }

  restore();

  /* ==================== 派生指标 ==================== */
  /* A：数据节点水位均值——master-only 节点的 heap/cpu 是另一种负载，混进「数据节点水位」会拉偏 */
  const dataNodes = computed(() => nodes.value.filter(n => (n.roles || []).includes('data')));
  const avgPct = (k: 'heapPct' | 'cpuPct') => computed(() => {
    const src = dataNodes.value.length ? dataNodes.value : nodes.value;
    if (!src.length) return 0;
    return src.reduce((a, n) => a + Number(n[k] || 0), 0) / src.length;
  });
  const avgHeap = avgPct('heapPct');
  const avgCpu = avgPct('cpuPct');
  /* 磁盘均值：diskUsedPct 定义在下方，此处内联同式（total/free → 占比） */
  const avgDisk = computed(() => {
    const src = dataNodes.value.length ? dataNodes.value : nodes.value;
    if (!src.length) return 0;
    return src.reduce((a, n) => {
      const total = Number(n.diskTotal || 0), free = Number(n.diskFree || 0);
      return a + (total > 0 ? (total - free) / total * 100 : 0);
    }, 0) / src.length;
  });
  const unassignedShards = computed(() => health.value?.unassigned_shards || 0);
  /* 未分配分片是否属「异常」——red 恒异常；yellow 仅多数据节点异常（单节点副本无处放置为常态） */
  const uaAbnormal = computed(() => {
    if (!unassignedShards.value) return false;
    if (health.value?.status === 'red') return true;
    return Number(health.value?.number_of_data_nodes || 0) > 1;
  });
  const uaSub = computed(() => {
    if (!unassignedShards.value) return '目标 0';
    return uaAbnormal.value ? '需排查' : '单节点副本，常态';
  });
  /* 趋势窗口真实跨度（首末采样时刻差）——0 表示还没攒够两点，不标注 */
  const windowMs = computed(() => {
    const ts = sampleTs.value;
    return ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
  });
  const curQps = computed(() => qpsSeries.value[qpsSeries.value.length - 1] || 0);
  const curIdx = computed(() => indexRateSeries.value[indexRateSeries.value.length - 1] || 0);
  const curCpu = computed(() => cpuSeries.value[cpuSeries.value.length - 1] || 0);
  const curDisk = computed(() => diskSeries.value[diskSeries.value.length - 1] || 0);
  const hHealth = computed(() => {
    if (!health.value) return '';
    return health.value.status === 'green' ? 'good' : health.value.status === 'yellow' ? 'warn' : 'bad';
  });
  const activeAlerts = computed(() => [...alertsMap.value.values()]
    .filter(a => a.active)
    // 严重度降序 → 开始时间升序（久拖未决的优先看见）
    .sort((a, b) => (a.severity === b.severity ? a.firstAt - b.firstAt : a.severity === 'bad' ? -1 : 1)));
  const resolvedAlerts = computed(() => [...alertsMap.value.values()]
    .filter(a => !a.active)
    .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
    .slice(0, 10));
  const badCount = computed(() => activeAlerts.value.filter(a => a.severity === 'bad').length);
  const warnCount = computed(() => activeAlerts.value.filter(a => a.severity === 'warn').length);

  function diskUsedPct(n: any) {
    const total = Number(n.diskTotal || 0), free = Number(n.diskFree || 0);
    return total > 0 ? ((total - free) / total * 100) : 0;
  }

  /* ==================== 采样主循环 ==================== */
  /* 采样世代计数——轮询拍无在途互斥（间隔抖动慢拍、setFocus 回屏补针都会双拍并发），
 旧拍回包迟到不得覆盖新拍采样、错推差分基线、翻转告警或落盘旧态快照 */
  let tickSeq = 0;
  async function tick() {
    const seq = ++tickSeq;
    try {
      /* 已登出/token 被吊销（身份已知且无会话）时跳过该次采样——不留请求、不空转
       unauthorized 事件链；重登后下一拍自动续采（994：登出不停轮询器的补偿单点）。 */
      if (auth.me == null && !auth.authDisabled && auth.probed) return;
      /* 无 diag 页权限时跳过 pending-tasks 采样（保留 0 值）——
 无权限角色每采样周期 403 会往审计流刷 PAGE_DENIED 心跳。
 连接键感知——grantedPages 为 conn:{id}:{page} 形态时裸 includes
 恒 false（连接模型用户有 diag 授权也被静默跳过=能力反向丢失）；按当前目标解析
 有效页集判定（与 router.effectivePagesForTarget 同构）。 */
      const target = app.target || 'host';
      const admin = auth.isAdmin();
      const eff = admin ? null : effectivePagesForTarget(auth.grantedPages, target);
      /* env 模板封顶与后端 effectivePages 同口径：环境未开放的页面不轮询（否则每拍 403）。
         ADMIN 不受页面门/env 模板约束（后端 preHandle 对 ADMIN 直接放行）。 */
      const canAny = (keys: string[]) => admin || eff == null
        || keys.some(k => eff.has(k) && auth.envAllows(k, target));
      const canDiag = canAny(['diag']);
      /* 节点简要统计归属 overview/live/topology；无权目标不轮询，避免每拍 403 刷审计。 */
      const canNodes = canAny(['topology', 'overview', 'live']);
      const [h, ns, pt] = await Promise.all([
        /* 只取 clusterHealth（轻量），不拉 health-report 的全量索引扫描——后台 15s/前台 5s 采样，8 小时挂着省大量资源 */
        api.clusterHealth().catch(() => null),
        canNodes ? api.nodesStatsBrief().catch(() => []) : Promise.resolve([] as any[]),
        canDiag ? api.pendingTasks().catch(() => ({ tasks: [] })) : Promise.resolve({ tasks: [] as any[] }),
      ]);
      if (seq !== tickSeq) return; // 迟到拍丢弃（新拍已发起/落地，旧回包不得覆盖）
      nowTs.value = Date.now();
      // 观测中断：全部拉取失败 ≠ 指标恢复，保留最后快照与告警状态，横幅提示用户
      if (!h && !(ns && ns.length)) return;
      health.value = h || {};
      nodes.value = ns || [];
      pendingTasks.value = (pt?.tasks?.length) || 0;
      lastOkAt.value = Date.now();

      const nowQ = nodes.value.reduce((a, n) => a + Number(n.queryTotal || 0), 0);
      const nowI = nodes.value.reduce((a, n) => a + Number(n.indexTotal || 0), 0);
      const nowT = Date.now();
      if (lastSampleT > 0) {
        const dt = (nowT - lastSampleT) / 1000;
        pushCapped(qpsSeries.value, Math.max(0, (nowQ - lastSampleQ) / dt));
        pushCapped(indexRateSeries.value, Math.max(0, (nowI - lastSampleI) / dt));
        pushCapped(heapSeries.value, avgHeap.value);
        pushCapped(cpuSeries.value, avgCpu.value);
        pushCapped(diskSeries.value, avgDisk.value);
        pushCapped(sampleTs.value, nowT);
        pushNodeSeries();
        /* 每节点吞吐差分（个体负载：各节点各扛多少 QPS/写入） */
        nodeRatePrev = pushNodeRateSeries(nodeRatePrev, nodes.value, nodeSeries.value, dt);
      } else {
        nodeRatePrev = pushNodeRateSeries(null, nodes.value, nodeSeries.value, 0);
      }
      lastSampleQ = nowQ; lastSampleI = nowI; lastSampleT = nowT;

      reconcileAlerts();
      snapshot();
    } catch { /* 轮询单次失败容忍：obsStale 会在 3 个周期后点亮「观测中断」横幅（ 有意降级） */ }
  }

  // 当前 tick 应处于告警态的状况集合；严重度随当前值动态升降级
  function collect(): Omit<LiveAlert, 'peak' | 'firstAt' | 'lastAt' | 'active'>[] {
    const out: Omit<LiveAlert, 'peak' | 'firstAt' | 'lastAt' | 'active'>[] = [];
    for (const n of nodes.value) {
      const heap = Number(n.heapPct || 0), cpu = Number(n.cpuPct || 0), disk = diskUsedPct(n);
      if (heap > 85) out.push({ key: `heap:${n.name}`, severity: 'bad', title: `节点 ${n.name} Heap`, num: Math.round(heap), unit: '%', threshold: '85%' });
      if (cpu > 85) out.push({ key: `cpu:${n.name}`, severity: 'warn', title: `节点 ${n.name} CPU`, num: Math.round(cpu), unit: '%', threshold: '85%' });
      if (disk > 90) out.push({ key: `disk:${n.name}`, severity: 'bad', title: `节点 ${n.name} 磁盘`, num: Math.round(disk), unit: '%', threshold: '90%' });
    }
    /* 信噪比：未分配分片按根因分流，避免与 status 告警重复、避免把单节点常态当告警——
 red 已由 status 条目覆盖（主分片不可用）；yellow 且多数据节点 = 副本真丢了，才值得告警；
 yellow 且单数据节点 = 副本无处放置的拓扑常态，不产告警条目。 */
    const ua = unassignedShards.value;
    const dataNodes = Number(health.value?.number_of_data_nodes || 0);
    if (ua > 0 && health.value?.status === 'yellow' && dataNodes > 1) {
      out.push({ key: 'unassigned', severity: 'warn', title: '副本分片未分配（多节点）', num: ua, unit: '', threshold: '0' });
    }
    if (pendingTasks.value > 5) out.push({ key: 'pending', severity: pendingTasks.value > 20 ? 'bad' : 'warn', title: '集群待处理任务积压', num: pendingTasks.value, unit: '', threshold: '5' });
    if (health.value?.status === 'red') out.push({ key: 'status', severity: 'bad', title: '集群状态 RED，存在不可用主分片', num: unassignedShards.value, unit: ' 分片未分配', threshold: 'green' });
    return out;
  }

  function reconcileAlerts() {
    const now = Date.now();
    const seen = new Set<string>();
    for (const c of collect()) {
      seen.add(c.key);
      const ex = alertsMap.value.get(c.key);
      if (ex && ex.active) {
        ex.severity = c.severity; ex.num = c.num; ex.lastAt = now;
        if (c.num > ex.peak) ex.peak = c.num;
      } else {
        // 新触发（或恢复后再次触发）重开生命周期
        alertsMap.value.set(c.key, { ...c, peak: c.num, firstAt: now, lastAt: now, active: true, resolvedAt: undefined });
      }
    }
    for (const a of alertsMap.value.values()) {
      if (a.active && !seen.has(a.key)) { a.active = false; a.resolvedAt = now; }
    }
    nowTs.value = now;
  }

  function clearResolved() {
    for (const [k, a] of alertsMap.value) { if (!a.active) alertsMap.value.delete(k); }
    snapshot();
  }

  /* A：每节点水位序列（heap/cpu/disk 即时值+qps/idx 吞吐差分）——消失节点删除（防内存/快照泄漏）；
 旧快照缺 qps/idx 键在此补齐（restore 兼容） */
  function pushNodeSeries() {
    const seen = new Set<string>();
    for (const n of nodes.value) {
      const key = String(n.name || n.nodeId);
      seen.add(key);
      const s = nodeSeries.value[key] || (nodeSeries.value[key] = { heap: [], cpu: [], disk: [], qps: [], idx: [] });
      if (!s.qps) s.qps = [];
      if (!s.idx) s.idx = [];
      pushCapped(s.heap, Number(n.heapPct || 0));
      pushCapped(s.cpu, Number(n.cpuPct || 0));
      pushCapped(s.disk, diskUsedPct(n));
    }
    for (const key of Object.keys(nodeSeries.value)) {
      if (!seen.has(key)) delete nodeSeries.value[key];
    }
  }
  function pushCapped(arr: number[], v: number) { arr.push(v); if (arr.length > MAX_POINTS) arr.shift(); }
  /* ②：任务数序列唯一写入口（视图 watch runningJobs.length 调用；快照 tick 自动带上） */
  function pushJobCount(n: number) { pushCapped(jobCountSeries.value, n); }

  /* ==================== 生命周期：全局常驻，组件只负责 start/toggle ==================== */
  function toggle() { running.value = !running.value; setupTimer(); }
  /** 实际生效间隔：大屏前台用用户所选间隔，其它页面降到背景下限（取较慢者） */
  const effectiveMs = computed(() => focus.value ? intervalMs.value : Math.max(intervalMs.value, BG_MIN_MS));
  function setupTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    if (running.value) timer = setInterval(tick, effectiveMs.value);
  }
  watch(effectiveMs, setupTimer);

  /** 大屏挂载/卸载时切换采样档位——离开后不停采，只降频 */
  function setFocus(v: boolean) {
    if (focus.value === v) return;
    focus.value = v;
    if (started && running.value) {
      if (v) tick(); // 回到大屏立即补一针，避免看着上一档的陈旧末点
      setupTimer();
    }
  }

  // 页面后台挂起时暂停轮询，回前台立即刷新一次再恢复定时器
  function onVisChange() {
    if (document.hidden) {
      if (timer) { clearInterval(timer); timer = null; }
    } else if (running.value && started) {
      tick();
      setupTimer();
    }
  }

  /** 幂等启动：大屏首次挂载调用后采样器全局常驻，此后切页/重挂载不再中断趋势 */
  function start() {
    if (started) return;
    started = true;
    tick();
    setupTimer();
    document.addEventListener('visibilitychange', onVisChange);
  }

  /* 切目标集群：旧集群序列/告警全部失效（防跨集群串数据），换新集群自己的快照续采 */
  watch(() => app.target, () => {
    qpsSeries.value = []; indexRateSeries.value = []; heapSeries.value = [];
    /* CPU/磁盘均值序列同步清位——漏清会在切集群后把旧集群走势串进新集群卡（跨集群串数据） */
    cpuSeries.value = []; diskSeries.value = []; sampleTs.value = [];
    nodeSeries.value = {};
    /* 切集群清吞吐差分基线——漏清会把旧集群计数器差分串进新集群（587 同款防线） */
    nodeRatePrev = null;
    lastSampleQ = 0; lastSampleI = 0; lastSampleT = 0;
    alertsMap.value = new Map();
    health.value = null; nodes.value = []; pendingTasks.value = 0; lastOkAt.value = 0;
    restore();
    if (started && running.value) { tick(); setupTimer(); }
  });

  /** 换账号：监控序列/告警/节点清单都是上一身份的观测结果，归零并按新目标续采。 */
  function resetIdentityState() {
    qpsSeries.value = []; indexRateSeries.value = []; heapSeries.value = [];
    cpuSeries.value = []; diskSeries.value = []; sampleTs.value = [];
    nodeSeries.value = {};
    /* 作业数曲线此前漏清：换人后大屏仍画上一账号的 jobCount 历史。 */
    jobCountSeries.value = [];
    nodeRatePrev = null;
    lastSampleQ = 0; lastSampleI = 0; lastSampleT = 0;
    alertsMap.value = new Map();
    health.value = null; nodes.value = []; pendingTasks.value = 0; lastOkAt.value = 0;
    /* 不 restore()：快照属于上一身份/上一目标，恢复等于把旧曲线又画回来。
       新目标的首个 tick 会重新采样。 */
    if (started && running.value) { tick(); setupTimer(); }
  }

  return {
    intervalMs, windowPts, running, health, nodes, pendingTasks, focus, effectiveMs,
    qpsSeries, indexRateSeries, heapSeries, cpuSeries, diskSeries, nodeSeries, sampleTs, windowMs, nowTs, lastOkAt, obsStale,
    jobCountSeries, pushJobCount,
    avgHeap, avgCpu, avgDisk, dataNodes, unassignedShards, uaAbnormal, uaSub, curQps, curIdx, curCpu, curDisk, hHealth,
    activeAlerts, resolvedAlerts, badCount, warnCount,
    diskUsedPct, start, toggle, clearResolved, setFocus, resetIdentityState,
  };
});
