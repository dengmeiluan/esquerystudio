import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import { router, effectivePagesForTarget } from '../router';
import { useAppStore } from './app';
import { useAuthStore } from './auth';
import { friendlyEsError } from '../utils/esError';

/**
 * 全局作业跟踪器：长耗时作业（托管重建 / 跨集群迁移）的进度轮询原先各自绑在视图里
 * （AdhocRebuildView、XmigrateView 的 setInterval + onBeforeUnmount clearInterval），
 * 一切页轮询就断、作业跑完也没人告诉你——提交一个几十分钟的迁移只能守着页面。
 *
 * 现在轮询提升为常驻 store：任何页面都能从顶栏看到「N 个作业运行中」与进度，
 * 作业转终态即弹通知（带「查看」跳转），跃迁记录按目标集群隔离持久化，刷新不重复通知。
 */

/** 统一后的作业视图——四类来源字段不同（adhoc 有 stage，xmigrate 有 migrated/total，
 * estask/snapshot 是吞进的集群级 reindex 任务与进行中快照），在此归一 */
interface TrackedJob {
  id: string;
  kind: 'adhoc' | 'xmigrate' | 'estask' | 'snapshot';
  kindName: string;
  /** 人读标签：索引名优先，退回 jobId */
  label: string;
  status: string;
  /** 进度百分比；-1 = 该作业类型不提供数量进度（只有阶段） */
  pct: number;
  /** 阶段文字（adhoc 有；xmigrate 空） */
  stage: string;
  /** 失败/中断原因（adhoc 的 error / xmigrate 的 message）；终态通知直接带上，不逼用户跳页找 */
  reason: string;
  startedAt: number;
  route: string;
}

/** 已完成作业的结局——用于「最近完成」与通知去重 */
interface DoneMark { id: string; status: string; at: number }

const SEEN_PREFIX = 'esquerystudio.jobs.seen';
/** 有作业在跑时的轮询间隔（与原视图内 3s 同量级，略放宽省请求） */
const ACTIVE_MS = 5000;
/** 全部空闲时的巡检间隔——不能停轮询，否则别处/别人提交的作业永远发现不了 */
const IDLE_MS = 20000;
/** 「最近完成」保留条数 */
const MAX_DONE = 10;
/** xmigrate 终态集合（RUNNING 之外还有可续跑的中断态，一律算结束需要人处理） */
const XM_END = ['DONE', 'FAILED', 'ABORTED', 'INTERRUPTED'];

export const useJobTrackerStore = defineStore('jobTracker', () => {
  const app = useAppStore();
  /* 页面白名单感知（poll 权限裁剪的数据源） */
  const auth = useAuthStore();

  const jobs = ref<TrackedJob[]>([]);
  /** 最近完成（本进程/本快照周期内观察到的终态跃迁） */
  const recentDone = ref<DoneMark[]>([]);
  /** 拉取是否至少成功过一次——没成功过就不敢说「没有作业」 */
  const probed = ref(false);

  /* 只对「亲眼见过在跑」的作业通知终态：否则首次进站会把历史完成作业全弹一遍 */
  let seenRunning = new Set<string>();
  /* 已通知过的作业，防刷新/重挂载重复弹 */
  let notified = new Set<string>();
  /* 见过在跑作业的人读标签：蒸发提醒时作业已不在清单里（接口失败的几轮还会把
 jobs 里的条目冲掉），不缓存就只能退化成 jobId，用户对不上号 */
  let seenLabels: Record<string, string> = {};
  let timer: any = null;
  let started = false;
  /* 连接模型「无授权连接」态的轮询全停告知——只弹一次（用户感知层：
 此前该形态下数据面请求裸奔 403 刷审计流，现改为不发请求+明说原因） */
  let pollSilentNotified = false;

  function seenKey() { return SEEN_PREFIX; }

  function restore() {
    try {
      const raw = sessionStorage.getItem(seenKey());
      if (!raw) return;
      const s = JSON.parse(raw);
      seenRunning = new Set(Array.isArray(s.running) ? s.running : []);
      notified = new Set(Array.isArray(s.notified) ? s.notified : []);
      seenLabels = s.labels && typeof s.labels === 'object' ? s.labels : {};
      recentDone.value = Array.isArray(s.done) ? s.done : [];
    } catch { /* 坏快照静默丢弃：最坏结果是少弹一次通知，不影响正确性 */ }
  }

  function persist() {
    writeStoredRaw(sessionStorage, seenKey(), JSON.stringify({
      running: [...seenRunning], notified: [...notified], labels: seenLabels, done: recentDone.value,
    }));
  }

  restore();

  const running = computed(() => jobs.value.filter(j => j.status === 'RUNNING'));
  const runningCount = computed(() => running.value.length);
  /** 有数量进度的作业整体完成度（用于顶栏徽标环形/文字）；无一有进度则 -1 */
  const overallPct = computed(() => {
    const withPct = running.value.filter(j => j.pct >= 0);
    if (!withPct.length) return -1;
    return Math.round(withPct.reduce((a, j) => a + j.pct, 0) / withPct.length);
  });
  /** 最近失败数（含中断）——顶栏徽标转警示色的依据 */
  const recentFailed = computed(() => recentDone.value.filter(d => d.status !== 'DONE' && d.status !== 'SUCCEEDED').length);

  function normAdhoc(j: any): TrackedJob {
    return {
      id: 'adhoc:' + j.jobId,
      kind: 'adhoc', kindName: '托管重建',
      label: j.logicalName || j.jobId || '',
      status: String(j.status || ''),
      pct: -1, // adhoc 只报阶段不报文档数
      stage: String(j.stage || ''),
      reason: String(j.error || ''),
      startedAt: Number(j.startedAt || 0),
      route: '/adhoc-rebuild',
    };
  }

  function normXm(j: any): TrackedJob {
    const total = Number(j.total || 0);
    const migrated = Number(j.migrated || 0);
    return {
      id: 'xm:' + j.jobId,
      kind: 'xmigrate', kindName: '跨集群迁移',
      label: j.destIndex || j.sourceIndex || j.jobId || '',
      status: String(j.status || ''),
      pct: total > 0 ? Math.min(100, Math.round((migrated / total) * 100)) : -1,
      stage: '',
      reason: String(j.message || ''),
      startedAt: Number(j.createTime || 0),
      route: '/xmigrate',
    };
  }

  /* 集群级来源两条——/cluster/tasks?detailed 的 RUNNING reindex 任务与
 /cluster/snapshot/status 的 IN_PROGRESS 快照。键名按后端 EsIndexAdmin.listTasks
 （taskId/action/startTimeMillis/status=BulkByScrollTask.Status）与 _snapshot/_status
 透传（snapshots[].snapshot/repository/state/shards_stats）实地核实，非凭记忆编造 */

  /** reindex description（JSON 串）→「源 → 目标」人读标签；非 JSON 回退 taskId */
  function reindexLabel(t: any): string {
    try {
      const d = JSON.parse(String(t.description || ''));
      const src = Array.isArray(d?.source?.index) ? d.source.index[0] : d?.source?.index;
      const dst = d?.dest?.index;
      if (src && dst) return `${src} → ${dst}`;
    } catch { /* 描述非 JSON（版本差异）回退 taskId */ }
    return String(t.taskId || '');
  }

  function normEsTask(t: any): TrackedJob {
    const s = t.status || {};
    const total = Number(s.total || 0);
    /* processed 口径与 TasksView reindexProgress 一致：updated+created+deleted（version_conflicts 是被跳过的不计） */
    const done = Number(s.updated || 0) + Number(s.created || 0) + Number(s.deleted || 0);
    return {
      id: 'es-task:' + t.taskId,
      kind: 'estask', kindName: 'Reindex 任务',
      label: reindexLabel(t),
      status: 'RUNNING', // _tasks 只列运行中任务，消失即结束（走 reconcile 蒸发分支）
      pct: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : -1,
      stage: '',
      reason: '',
      startedAt: Number(t.startTimeMillis || 0),
      route: '/tasks',
    };
  }

  function normSnap(s: any): TrackedJob {
    const ss = s.shards_stats || {};
    const total = Number(ss.total || 0);
    const done = Number(ss.done || 0);
    return {
      id: 'snap:' + s.repository + '/' + s.snapshot,
      kind: 'snapshot', kindName: '快照',
      label: `${s.repository}/${s.snapshot}`,
      status: 'RUNNING', // _status 只返回进行中快照，消失即结束
      pct: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : -1,
      stage: '',
      reason: '',
      startedAt: Number(s.start_time_in_millis || 0),
      route: '/snapshots',
    };
  }

  function isEnd(j: TrackedJob) {
    return j.kind === 'adhoc' ? j.status !== 'RUNNING' : XM_END.includes(j.status);
  }
  function isOk(status: string) { return status === 'DONE' || status === 'SUCCEEDED'; }

  /* 轮询世代计数——拍间无在途互斥（档位切换重排后新拍与在途慢拍并发），
 旧拍回包迟到不得覆盖 jobs 清单、不得把已消失作业错登记进终态检测状态机 */
  let pollSeq = 0;
  async function poll() {
    /* 已登出/token 被吊销（身份已知且无会话）时跳过该次跟踪——不留请求、不空转
       unauthorized 事件链；重登后下一拍自动恢复（994：登出不停轮询器的补偿单点）。 */
    if (auth.me == null && !auth.authDisabled && auth.probed) return;
    /* 两类作业各自容忍失败：403（角色不足看迁移）/404（未装 adhoc）不该让整块跟踪瘫掉。
 权限感知——页面白名单不含对应页时，本角色对这两个轮询端点必然 403，
 继续打只会每周期往审计流刷 PAGE_DENIED（同质心跳刷屏）。无权限的通道直接跳过
 （保留上一轮视图），后端审计聚合层（DedupConsoleOpsAuditStore）兜底。
 连接键感知——grantedPages 为 conn:{connId}:{page} 形态（宿主连接
 菜单模型）时，裸 includes 恒 false（有授权被静默跳过），且旧 wantData 不看页面
 授权（snapshots 页未授权照样每 20s 裸打=产线 PAGE_DENIED 循环主源）。改为按
 当前目标解析有效页集（与 router.effectivePagesForTarget/后端 EnvPagesResolver
 同构）判定；快照通道额外受 snapshots 页授权约束。 */
    const granted = auth.grantedPages; // null=页面授权未启用（全放行）
    const target = app.target || 'host';
    const admin = auth.isAdmin();
    const eff = admin ? null : effectivePagesForTarget(granted, target);
    /* env 模板封顶与后端 effectivePages 同口径：环境未开放的页面不轮询（否则每拍 403）。
       ADMIN 不受页面门/env 模板约束（后端 preHandle 对 ADMIN 直接放行）。 */
    const can = (pageKey: string) => admin || ((eff == null || eff.has(pageKey)) && auth.envAllows(pageKey, target));
    const wantAdhoc = can('adhoc-rebuild');
    const wantXm = can('xmigrate');
    /* 数据面通道（reindex 任务/快照跟随 X-Es-Target）：连接模型须目标已钉选（授权就绪
 门+autoPickConnTarget 保证就绪后才放行）；宿主隐藏或非连接模型沿用 hostVisible 语义。
 reindex 任务=共享端点（无页面归属，角色门 VIEWER+ 恒过）；快照=snapshots 页面门。 */
    const connModel = granted != null && granted.some(k => k.startsWith('conn:'));
    const dataReady = !!app.target || (!!app.hostVisible && !connModel);
    const wantSnaps = dataReady && can('snapshots');
    /* 任务轮询归 tasks/task-tree 页：无归属页的读键身份每 20s 打一次必 403 的拍，
       既污染审计也永远看不到任务；与后端 sharedReadPages 同口径。 */
    const wantTasks = dataReady
      && (auth.canReadPage('tasks', target) || auth.canReadPage('task-tree', target));
    if (connModel && !dataReady && app.conns.length > 0 && !pollSilentNotified) {
      /* 连接目录已加载仍不就绪才是真「未授权任何集群」；目录未到（开屏竞态窗）
         时的静默由 autoPick 落位自动收敛，不记录不弹（产线实报 x1 误报）。 */
      pollSilentNotified = true;
      /* 后台自愈态只入史不弹：下一拍 autoPick 落位即自动恢复——对称静默，历史留一条聚合记录。 */
      app.notify('warning', '当前账号未被授权任何集群连接，作业跟踪与数据面轮询已停用（授权后自动恢复）', { logOnly: true });
    }
    const seq = ++pollSeq;
    const [ad, xm, ts, sn] = await Promise.all([
      wantAdhoc ? api.adhoc.jobs().catch(() => null) : Promise.resolve(null),
      wantXm ? api.xb.jobs(30).catch(() => null) : Promise.resolve(null),
      wantTasks ? api.clusterTasks('indices:data/write/reindex*', true).catch(() => null) : Promise.resolve(null),
      wantSnaps ? api.snapshotStatus().catch(() => null) : Promise.resolve(null),
    ]);
    if (seq !== pollSeq) return; // 迟到拍丢弃（新拍已发起/落地，旧回包不得入状态机）
    const tsOk = ts != null;
    const snOk = sn != null;
    if (ad == null && xm == null && !tsOk && !snOk) return; // 全失败：保留上一轮视图，不谎报「没有作业」
    const tsList = Array.isArray(ts)
      ? (ts as any[]).filter(t => String(t.action || '').includes('reindex'))
      : [];
    const snList = Array.isArray((sn as any)?.snapshots)
      ? (sn as any).snapshots.filter((s: any) => String(s.state || '').toUpperCase() === 'IN_PROGRESS')
      : [];
    const next: TrackedJob[] = [
      ...(Array.isArray(ad) ? ad.map(normAdhoc) : []),
      ...(Array.isArray(xm) ? (xm as any[]).map(normXm) : []),
      ...tsList.map(normEsTask),
      ...snList.map(normSnap),
    ];
    probed.value = true;
    reconcile(next, Array.isArray(ad), Array.isArray(xm), tsOk, snOk);
    jobs.value = next;
  }

  /** 终态跃迁检测：见过在跑 → 现在结束 → 弹一次通知并记入「最近完成」。
 * 新增 tsOk/snOk——estask/snapshot 两条通道的消失判定（响应成功才算真结束，
 * 网断/403 那轮静默保留，与 adhoc/xm 同纪律） */
  function reconcile(next: TrackedJob[], adOk: boolean, xmOk: boolean, tsOk: boolean, snOk: boolean) {
    let dirty = false;
    for (const j of next) {
      if (j.status === 'RUNNING') {
        if (!seenRunning.has(j.id)) { seenRunning.add(j.id); dirty = true; }
        if (seenLabels[j.id] !== j.label) { seenLabels[j.id] = j.label; dirty = true; }
        continue;
      }
      if (!isEnd(j) || !seenRunning.has(j.id) || notified.has(j.id)) continue;
      notified.add(j.id);
      seenRunning.delete(j.id);
      recentDone.value.unshift({ id: j.id, status: j.status, at: Date.now() });
      if (recentDone.value.length > MAX_DONE) recentDone.value.length = MAX_DONE;
      dirty = true;
      const ok = isOk(j.status);
      /* 失败通知直接带原因——后端本来就有字段（adhoc.error / xm.message），
 只说「结束于 FAILED」还得跳页展开找原因，白白多一步。
 原因先在这里友好化再拼接：否则 app.notify 对 error 类消息的全句友好化
 会命中 ES 异常关键字把整句替换掉，作业名上下文全丢 */
      const why = !ok && j.reason ? '：' + friendlyEsError(j.reason, 90) : '';
      app.notify(ok ? 'success' : 'error',
        `${j.kindName}「${j.label}」${ok ? '已完成' : '结束于 ' + j.status + why}`,
        { action: { label: '查看', onClick: () => router.push(j.route) }, duration: ok ? 6000 : 0 });
    }
    /* 在跑作业从清单里消失的检测。adhoc 作业是内存态（宿主重启即丢，见 AdhocRebuildJob 注释），
 发布重启时正在跑的重建会无声蒸发——用户还以为在跑。只在该类接口确实成功时才判定消失，
 接口失败（403/网断）不算。xmigrate 持久化在 ES，只是可能被 30 条窗口挤出清单，不是蒸发，静默放手。 */
    const ids = new Set(next.map(j => j.id));
    for (const id of [...seenRunning]) {
      if (ids.has(id)) continue;
      /* estask/snapshot 的完成=从列表消失（_tasks 与 _status 都只列进行中），
 通道成功即判完成：记入最近完成 + 弹一次 success 通知（「作业跑完告诉你」语义延伸） */
      if (id.startsWith('es-task:') || id.startsWith('snap:')) {
        const ok = id.startsWith('es-task:') ? tsOk : snOk;
        if (!ok) continue;
        seenRunning.delete(id);
        dirty = true;
        if (notified.has(id)) continue;
        notified.add(id);
        recentDone.value.unshift({ id, status: 'DONE', at: Date.now() });
        if (recentDone.value.length > MAX_DONE) recentDone.value.length = MAX_DONE;
        const prev = jobs.value.find(j => j.id === id);
        const kindName = prev?.kindName || (id.startsWith('snap:') ? '快照' : 'Reindex 任务');
        const label = seenLabels[id] || prev?.label || id.slice(id.indexOf(':') + 1);
        app.notify('success', `${kindName}「${label}」已完成`,
          { action: { label: '查看', onClick: () => router.push(prev?.route || '/tasks') }, duration: 6000 });
        continue;
      }
      if (!id.startsWith('adhoc:')) {
        if (xmOk) { seenRunning.delete(id); dirty = true; }
        continue;
      }
      if (!adOk) continue;
      seenRunning.delete(id);
      dirty = true;
      if (notified.has(id)) continue;
      notified.add(id);
      recentDone.value.unshift({ id, status: 'VANISHED', at: Date.now() });
      if (recentDone.value.length > MAX_DONE) recentDone.value.length = MAX_DONE;
      const label = seenLabels[id] || jobs.value.find(j => j.id === id)?.label || id.slice('adhoc:'.length);
      delete seenLabels[id];
      app.notify('warning',
        `托管重建「${label}」的作业记录消失了——宿主服务可能重启过（该类作业为内存态）。ES 侧 reindex 任务不受影响，建议到任务管理页确认后重新发起`,
        { action: { label: '查看', onClick: () => router.push('/adhoc-rebuild') }, duration: 0 });
    }
    if (dirty) persist();
  }

  function clearDone() { recentDone.value = []; persist(); }

  function setupTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    timer = setInterval(poll, runningCount.value > 0 ? ACTIVE_MS : IDLE_MS);
  }
  /* 有无在跑作业决定档位：跑起来加密观察，空闲降到巡检频率 */
  watch(runningCount, (n, o) => {
    if ((n > 0) !== (o > 0)) setupTimer();
  });

  function onVisChange() {
    if (document.hidden) {
      if (timer) { clearInterval(timer); timer = null; }
    } else if (started) {
      poll();
      setupTimer();
    }
  }

  /** 幂等启动（App.vue 在登录+集群就绪后调用） */
  function start() {
    if (started) return;
    started = true;
    poll();
    setupTimer();
    document.addEventListener('visibilitychange', onVisChange);
  }

  /* 作业清单不随目标集群变：托管重建与跨集群迁移的端点恒在宿主控制面
 （App.vue 的 HOST_ONLY 已声明 /adhoc-rebuild、/xmigrate 为宿主专属视图），
 因此切目标时既不清空也不换快照 key——否则会把在跑作业「跟丢」。 */

  /** 换账号：作业清单/终态通知/已读位都是上一身份的观测结果，归零并从新身份重拉。 */
  function resetIdentityState() {
    jobs.value = [];
    recentDone.value = [];
    probed.value = false;
    seenRunning = new Set();
    notified = new Set();
    seenLabels = {};
    pollSilentNotified = false;
    removeStoredRaw(sessionStorage, seenKey());
    if (started) poll();
  }

  return { jobs, running, runningCount, overallPct, recentDone, recentFailed, probed, start, poll, clearDone, resetIdentityState };
});
