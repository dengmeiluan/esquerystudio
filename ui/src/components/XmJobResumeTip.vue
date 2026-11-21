<template>
  <!-- 1122：迁移作业级恢复提示——「有迁移在跑 / 上次被中断」原先只藏在 XmigrateView
   表格行里，人不在那页就看不见。进站（任意页）第一眼在此给一条：一行说清
   源 → 目标 + 状态 + 进度，主 CTA 深链直达作业详情（详情内即续跑入口）。
   与路由级 SceneResumeTip 同落左下、任务级优先（App.vue 按 active 状态让路由级
   暂避，关闭本条后路由级自动回来）；一次会话同作业只提示一次，作业转 DONE 即撤。 -->
  <div v-if="tip" class="xjrt" role="status" aria-live="polite">
    <div class="xjrt-tx">
      {{ tip.status === 'RUNNING' ? '进行中的迁移作业' : '上次迁移被中断' }}：<b>{{ tip.route }}</b><span v-if="tip.pct >= 0">（{{ tip.pct }}%）</span>
    </div>
    <div class="xjrt-acts">
      <button type="button" class="btn sm primary xjrt-go" @click="goDetail">{{ tip.status === 'RUNNING' ? '查看' : '去续跑' }}</button>
      <button type="button" class="btn sm ghost xjrt-x" aria-label="关闭迁移作业提示" v-tip="'关闭'" @click="dismiss">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { router } from '../router';
import { isBrowserMode } from '../platform/browserApi';
import { useJobTrackerStore } from '../stores/jobTracker';
import { writeStoredRaw } from '../utils/safeJson';

/* 提示所需的最小作业视图：服务端 TrackedJob 与浏览器 localStorage 台账字段同构，归一到此 */
interface TipJob { jobId: string; source: string; dest: string; status: string; pct: number; startedAt: number }

/* 一次会话同作业只提示一次（jobTracker 通知防重同款 sessionStorage 模式） */
const TIPPED_KEY = 'esquerystudio.xmresume.tipped';
/* 浏览器模式迁移台账键（browserXmigrate 同键只读，不改写） */
const XM_JOBS_KEY = 'esquerystudio.xmigrate.jobs';
/* 只认这三种状态：在跑要看护、中断/失败要续跑；DONE（无事可做）与 ABORTED（人工主动中止）不打扰 */
const TIP_STATUS = ['RUNNING', 'INTERRUPTED', 'FAILED'];

function readTipped(): Set<string> {
  try {
    const a = JSON.parse(sessionStorage.getItem(TIPPED_KEY) || '[]');
    return new Set(Array.isArray(a) ? a : []);
  } catch { return new Set(); }
}
function markTipped(jobId: string) {
  const s = readTipped();
  s.add(jobId);
  writeStoredRaw(sessionStorage, TIPPED_KEY, JSON.stringify([...s]));
}

/* 两处数据源各自的归一：pct 无数量依据时 -1，不拿 0% 冒充 */
function fromLedger(j: any): TipJob {
  const total = Number(j.total || 0);
  const migrated = Number(j.migrated || 0);
  return {
    jobId: String(j.jobId || ''),
    source: String(j.sourceIndex || ''),
    dest: String(j.destIndex || ''),
    status: String(j.status || ''),
    pct: total > 0 ? Math.min(100, Math.round((migrated / total) * 100)) : -1,
    startedAt: Number(j.createTime || 0),
  };
}
/* 入参为 jobTracker 的 TrackedJob 归一视图（结构类型：不引用其私有类型名，字段是公开 state） */
function fromTracked(j: { id: string; kind: string; label: string; source?: string; status: string; pct: number; startedAt: number }): TipJob {
  return {
    jobId: j.id.slice('xm:'.length),
    source: j.source || '',
    dest: j.label,
    status: j.status,
    pct: j.pct,
    startedAt: j.startedAt,
  };
}
/* 在跑优先于中断（看护中的作业更要第一眼看到），同组取最新——信息密度克制，一次只提示一条 */
function pickTip(rows: TipJob[]): TipJob | null {
  const hits = rows.filter(j => j.jobId && TIP_STATUS.includes(j.status));
  if (!hits.length) return null;
  hits.sort((a, b) => Number(b.status === 'RUNNING') - Number(a.status === 'RUNNING') || b.startedAt - a.startedAt);
  return hits[0] || null;
}

const emit = defineEmits<{ (e: 'active-change', v: boolean): void }>();

const job = ref<TipJob | null>(null);
const dismissed = ref(false);
/* 「源 → 目标」人读路由：源缺席或源目标同名（台账受损/旧数据）时只显示目标名，退回 jobId 兜底 */
const routeText = computed(() => {
  const j = job.value;
  if (!j) return '';
  const dest = j.dest || j.jobId;
  return j.source && j.source !== dest ? `${j.source} → ${dest}` : dest;
});
const tip = computed(() => job.value && !dismissed.value ? { ...job.value, route: routeText.value } : null);

/* 候选落地：显示即记忆（同一会话内重挂载/刷新不再弹同一条）；已记忆/无候选一律清空 */
function offer(hit: TipJob | null) {
  job.value = hit && !readTipped().has(hit.jobId) ? (markTipped(hit.jobId), hit) : null;
}
function dismiss() { job.value = null; dismissed.value = true; }
/* 主 CTA：深链直达该作业详情——?jobId=&detail=1 由 XmigrateView 的 consumeDeepLinks 消费，
   自动展开详情弹窗（内含续跑入口），RUNNING 看进度与中断态续跑都不必再自己找行 */
function goDetail() {
  const j = job.value;
  job.value = null;
  if (j) router.push({ path: '/xmigrate', query: { jobId: j.jobId, detail: '1' } }).catch(() => {});
}

/* App.vue 用它在场状态压住路由级 SceneResumeTip（任务级优先，同屏不叠左下同一位点） */
watch(() => !!tip.value, v => emit('active-change', v), { immediate: true });

if (isBrowserMode) {
  /* 纯浏览器模式：台账就在本机 localStorage，进站读一次即可（浏览器作业是页面级搬运，
     无后台进度可轮询，绝不为此起定时器）；用户已在迁移页时页面自身就是现场，不隔页喊话 */
  onMounted(() => {
    if (dismissed.value || router.currentRoute.value.path === '/xmigrate') return;
    let rows: any[] = [];
    try { const a = JSON.parse(localStorage.getItem(XM_JOBS_KEY) || '[]'); rows = Array.isArray(a) ? a : []; } catch { rows = []; }
    offer(pickTip(rows.map(fromLedger)));
  });
} else {
  /* 服务端模式：数据经 jobTracker（常驻轮询已在跑），此处只观察不发起请求；
     probed 未落地前不渲染——进站静默等首拍，不闪空壳 */
  const tracker = useJobTrackerStore();
  watch(() => [tracker.probed, tracker.jobs] as const, () => {
    if (dismissed.value) { job.value = null; return; }
    if (!tracker.probed) return;
    if (router.currentRoute.value.path === '/xmigrate') { job.value = null; return; }
    offer(pickTip(tracker.jobs.filter(j => j.kind === 'xmigrate').map(fromTracked)));
  }, { immediate: true });
}
</script>

<style scoped>
.xjrt {
  position: fixed; left: 12px; bottom: 12px; z-index: var(--z-receipt); /* 与 SceneResumeTip 同位点；两提示互斥展示（App 侧任务级优先） */
  width: 240px; display: flex; flex-direction: column; gap: var(--sp-1h);
  padding: var(--sp-2); background: var(--bg1); border: 1px solid var(--line-strong);
  border-radius: var(--r-m); box-shadow: var(--shadow-pop);
}
.xjrt-tx { font-size: var(--fs-xs); color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xjrt-tx b { color: var(--tx0); font-weight: 600; }
.xjrt-acts { display: flex; gap: var(--sp-1); }
.xjrt-go { flex: 1 1 auto; }
.xjrt-x { flex: none; }
</style>
