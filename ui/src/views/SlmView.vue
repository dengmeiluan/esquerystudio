<template>
  <div class="slm-page">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps" class="slm-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：立即执行属集群级动作，需要 CLUSTER_OP 及以上角色，或该连接的「集群设置」写权限。
    </div>
    <div class="slm-hd">
      <PageHeader :icon="ShieldCheck" title="SLM 快照生命周期">
      <template #subtitle>
        <span>分布式定时备份策略 · 策略列表 · 立即执行 · 全局统计</span>
        <!-- 全局统计 tile 墙退役：6 块 slm-stat 压成一条 inline 状态串（数据全保留在此与 :title） -->
        <!-- 全局统计 tile 墙退役后 inline 状态串再收 MetaStrip 统一件（值亮+标签暗+·分隔同构）：
 RUNNING→ok/其余→warn、成功快照恒 ok、失败>0 err 走组件 tone 档；清理耗时 ms 原值拆段 tip；
 类名保留 slm-meta——protectThreeState 以此类看守 stats 区在/不在，本页样式只留落位 -->
        <MetaStrip v-if="available && status" class="slm-meta" :items="slmMeta" :title="'运行状态 ' + statusMode + ' · 总策略数 ' + fmtNum(policyCount) + ' · 成功快照 ' + fmtNum(statTotalTaken) + ' · 失败快照 ' + fmtNum(statTotalFailed) + ' · 保留执行 ' + statRetentionRuns + ' 次 · 保留清理耗时 ' + fmtMs(statRetentionDeletion) + '（' + statRetentionDeletion + ' ms）'" />
      </template>
      <template #actions>
        <div class="slm-hd-r">
          <!-- SLM 执行盯进度——纯手动刷新裸奔收口，接自动刷新
 （checkbox + AutoRefreshSelect 统一件，SnapshotsView 工具行同款布局） -->
          <label class="slm-auto-lbl">
            <input type="checkbox" v-model="slmAutoRefresh" />
            <span>自动刷新</span>
          </label>
          <AutoRefreshSelect v-if="slmAutoRefresh" v-model:ms="slmIntervalMs" :sizes="[10000, 30000, 60000]" label="自动刷新频率" />
          <!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 路径子串 '/cluster/slm/'=本页 policies/execute/status 全通道） -->
          <button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（SLM）" title="最近一次 SLM 策略/执行/状态请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
            <Terminal :size="12" /> 原始 IO
          </button>
          <button class="btn ghost sm" @click="loadAll" :disabled="loading">
            <RefreshCcw :size="12" :class="{ spinning: loading }" /> 刷新
          </button>
        </div>
      </template>
      </PageHeader>
</div>

    <!-- G4-B2：策略列表 HTTP 层失败——err-bar 独立顶置（互斥链外），不翻 available 误报「SLM 不可用」、旧策略卡保留 -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      {{ loadErr }}
      <button class="btn sm" @click="loadAll" :disabled="loading">重试</button>
    </div>

    <div v-if="!available" class="slm-alert">
      <AlertTriangle :size="14" />
      <div>
        <div class="slm-alert-tt">SLM 不可用</div>
        <div class="slm-alert-sub">{{ reason || '当前 ES 集群未启用 SLM（快照生命周期管理）。请确认商业授权或版本 &ge; 7.4。' }}</div>
      </div>
      <!-- -A2：失败态就地重试 -->
      <button class="btn sm" @click="loadAll" :disabled="loading">重试</button>
    </div>

    <!-- G4-B2：状态/统计源失败降级提示条——独立于策略列表（ 多源各立状态位教训），不隐藏已加载策略卡。
 slm-stats-err 手写 warn 壳合并 EmptyState compact 统一件——语义是
 「统计不可用」降级提示（IlmView explain 拉取失败先例：文案逐字保留走 :text，重试走
 action 位，busy 禁用位随组件契约退役）；.slm-stats-err 私造 warn 皮退役（protectThreeState
 降级提示锚同步更新 .empty-state） -->
    <EmptyState v-else-if="available && statsErr" compact :icon="AlertTriangle"
      :text="'SLM 状态/统计拉取失败：' + statsErr" action-text="重试" @action="loadAll" />

    <div v-if="available" class="slm-list">
      <!-- G4-B1：首载骨架（loading 初值 true）——加载期间不闪「当前无 SLM 策略」（ B3/ B6/ B1 同构） -->
      <div v-if="loading && !policyRows.length" class="slm-sk">
        <SkeletonBox v-for="i in 3" :key="i" height="72px" round />
      </div>
      <!-- err-bar 在链外顶置；真空空态与失败互斥（失败不是空） -->
      <EmptyState
        v-else-if="!policyRows.length && !loadErr"
        :icon="ShieldCheck"
        text="当前无 SLM 策略"
        hint="请到 Kibana 或调用 PUT /_slm/policy/{id} 创建备份策略"
      />
      <div v-for="p in policyRows" :key="p.id" class="slm-card" tabindex="0"
        @contextmenu.prevent="openRowMenu($event, p)" @keydown="onSlmMenuKey($event, p)" data-row-nav @keydown.self="rowArrowNav">
        <div class="slm-card-l">
          <div class="slm-card-tt"><Calendar :size="12" /> {{ p.name || p.id }}</div>
          <div class="slm-card-sub">仓库 <b>{{ p.repository }}</b> · Cron <code>{{ p.schedule }}</code></div>
          <!-- slm-card-meta/slm-card-run 两行手写 meta 合并 MetaStrip mini 档
 （550 sv-repo-meta 先例：值亮+标签暗+·分隔）；indices/保留/上次/下次 四段入 items，
 上次执行结果点 dot 语义随段迁移（ok/err 色值直传组件 dot 位） -->
          <MetaStrip class="slm-card-meta" :items="slmCardMeta(p)" />
        </div>
        <div class="slm-card-r">
          <!-- G132：执行钮 Play 补 spinning（execing 此前只 disabled+文案切换半合规；735 G122 同款） -->
          <button v-if="canOps" class="btn pri sm" @click="execNow(p.id)" :disabled="execing === p.id">
            <Play :size="12" :class="{ spinning: execing === p.id }" /> {{ execing === p.id ? '触发中…' : '立即执行' }}
          </button>
          <button class="btn ghost sm" @click="copyBody(p)"><Copy :size="12" /> 复制</button>
        </div>
      </div>
      <!-- 策略卡右键菜单（复制 id/复制配置/立即执行）。
 史志修正：原注释多写的第四项从未落地，注释与实现（恒三项）对齐 -->
      <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y"
        :title="'SLM 策略 ' + (rowMenu.p.name || rowMenu.p.id)" :items="rowMenuItems" @close="rowMenu = null" />
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/slm/ 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Shield, ShieldCheck, RefreshCcw, AlertTriangle, Calendar, Play, Copy, Terminal } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth'; /* ：权限写门真源 */
import { askConfirm } from '../composables/confirm';
import { copyText, fmtTime, fmtNum } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
import EmptyState from '../components/EmptyState.vue';
import CellContextMenu from '../components/CellContextMenu.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* 页头状态串统一件 */
import { semFormat } from '../composables/useSemFormat'; /* ：时长档单源（清理耗时） */
import { useAutoRefresh } from '../composables/useAutoRefresh'; /* ：自动刷新 */
import { usePref } from '../composables/urlState';
import { slmOpModeZh, slmOpModeTone } from '../utils/esEnumZh'; /* ：operation_mode 中文主显收口件 */
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';

const store = useAppStore();
/* 权限写门——SLM 立即执行（触发快照）=ops 档写，VIEWER 不可见（卡钮+右键菜单项同门） */
const auth = useAuthStore();
/* 立即执行=全集群快照策略触发（集群级动作）：除页写键外还需 rank3 或集群设置写键。 */
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/slm/execute', store.target)
  && auth.canClusterScope(store.target));
const loading = ref(true); /* ：初值 true——首帧即骨架，不闪空态 */

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/slm/');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
const policies = ref<Record<string, any>>({});
const status = ref<any>(null);
const stats = ref<any>(null);
const available = ref(true);
const reason = ref('');
const loadErr = ref('');   /* 策略列表 HTTP 层失败（独立 err-bar，不翻 available 误报「SLM 不可用」） */
const statsErr = ref('');  /* 状态/统计源失败（辅助区降级提示条，不污染策略列表） */
const execing = ref<string>('');

const policyRows = computed(() => {
  const arr: any[] = [];
  const m = policies.value || {};
  Object.keys(m).forEach(k => {
    const entry = m[k] || {};
    arr.push({ id: k, ...entry, ...(entry.policy || {}) });
  });
  return arr.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
});

const policyCount = computed(() => policyRows.value.length);
const statusMode = computed(() => status.value?.operation_mode || 'UNKNOWN');
const statTotalTaken = computed(() => Number(stats.value?.total_snapshots_taken || 0));
const statTotalFailed = computed(() => Number(stats.value?.total_snapshots_failed || 0));
const statRetentionRuns = computed(() => Number(stats.value?.retention_runs || 0));
const statRetentionDeletion = computed(() => Number(stats.value?.retention_deletion_time_millis || 0));

/* 页头状态串 MetaStrip items——原手写串色档映射：RUNNING→ok/其余（含 STOPPED/UNKNOWN）→warn、
 成功快照恒 ok、失败>0 err；清理耗时是毫秒时长（fmtMs 展示），ms 原值留段 tip */
const slmMeta = computed<MetaStripItem[]>(() => [
  /* operation_mode 中文主显（slmOpModeZh），英文原值留 tip 保检索；
 tone 走收口件既有口径（RUNNING→ok/其余 warn），与原手写三元等价 */
  { value: slmOpModeZh(statusMode.value), label: '运行状态', tone: slmOpModeTone(statusMode.value), tip: statusMode.value },
  { value: fmtNum(policyCount.value), label: '总策略数' },
  { value: fmtNum(statTotalTaken.value), label: '成功快照', tone: 'ok' },
  { value: fmtNum(statTotalFailed.value), label: '失败快照', tone: statTotalFailed.value > 0 ? 'err' : undefined },
  { value: statRetentionRuns.value, label: '保留执行' },
  { value: fmtMs(statRetentionDeletion.value), label: '保留清理耗时', tip: statRetentionDeletion.value + ' ms' },
]);

/* ═══ ：SLM 执行盯进度—— Snapshots/Ilm 同构接 useAutoRefresh ═══
 「立即执行」触发的是异步快照，纯手动刷新盯不住进度。开关+频率 usePref 记忆；
 guard 用现有 loading 态防重入（useAutoRefresh tick 时再验）；开关切换立即拉一轮。 */
const slmAutoRefresh = usePref('slm.autoRefresh', false);
const slmIntervalMs = usePref('slm.intervalMs', 30000);
const slmRefresher = useAutoRefresh(loadAll, {
  ms: () => (slmAutoRefresh.value ? slmIntervalMs.value : 0),
  guard: () => !loading.value,
});
watch(slmAutoRefresh, (v) => { if (v) loadAll(); slmRefresher.restart(); });
watch(slmIntervalMs, () => slmRefresher.restart());
/* setOn(true)=内部意图恒开，实际运行由 ms getter（usePref 开关×间隔）与 guard 决定
 ——TasksView :455-472 正典范式；内部 on=false 时 restart() 是 no-op，缺这行自动刷新不排表 */
slmRefresher.setOn(true);

/* slm-card-meta/slm-card-run 两行手写 meta 合并 MetaStrip mini（——
 本类只留落位外距（rc-card-meta 同款范式），flex/字号/mono/分隔归 .ms 单源；
 原 .slm-card-run/.dot 结果点规则退役（dot 语义随段迁移，色值直传组件 dot 位） */
function slmCardMeta(p: any): MetaStripItem[] {
  return [
    /* G133：indices 段补中文 tip（英文裸 label 留检索；717 双语同款，:title 悬停+help 档） */
    { value: (p.config?.indices || []).join(', ') || '(all)', label: 'indices', tip: '快照覆盖的索引列表' },
    ...(p.retention ? [{ value: String(p.retention.expire_after || p.retention.min_count || '-'), label: '保留' }] : []),
    {
      value: fmtTs(p.last_success?.time) || fmtTs(p.last_failure?.time) || '—',
      label: '上次',
      ...(p.last_success ? { dot: 'var(--ok)' } : (p.last_failure && !p.last_success ? { dot: 'var(--err)' } : {})),
    },
    { value: fmtTs(p.next_execution_millis), label: '下次' },
  ];
}

let loadSeq = 0;
async function loadAll() {
  const seq = ++loadSeq;
  loading.value = true;
  /* G4-B2：双源各立错误位（ DiagView 教训）——策略 HTTP 失败只出 err-bar（不翻 available、旧卡保留），
 状态/统计失败只出降级提示条（不隐藏策略列表）；成功路径清各自 err 位，loading 必 finally 复位 */
  try {
    try {
      const pol = await api.slmPolicies();
      if (seq !== loadSeq) return;
      if (pol && pol.available === false) {
        /* 后端把 ES 层失败兜底为 available=false（未启用/授权/版本等，EsIndexAdmin.slmPolicies）——走既有降级 alert */
        available.value = false;
        reason.value = pol.reason ? friendlyEsError(String(pol.reason)) : '';
        policies.value = {};
      } else {
        available.value = true;
        reason.value = '';
        policies.value = pol || {};
      }
      loadErr.value = '';
    } catch (e: any) {
      if (seq !== loadSeq) return;
      loadErr.value = 'SLM 策略拉取失败：' + friendlyEsError(String(e?.message ?? e));
      store.notify('error', 'slm/policies: ' + loadErr.value);
    }
    try {
      const st = await api.slmStatus();
      if (seq !== loadSeq) return;
      if (st && st.available === false) {
        /* 后端兜底形态（EsIndexAdmin.slmStatus catch）：辅助区降级提示，不污染策略列表 */
        statsErr.value = friendlyEsError(String(st.reason || '未知原因'));
      } else {
        status.value = st?.status || null;
        stats.value = st?.stats || null;
        statsErr.value = '';
      }
    } catch (e: any) {
      if (seq !== loadSeq) return;
      statsErr.value = friendlyEsError(String(e?.message ?? e));
      store.notify('error', 'slm/status: ' + statsErr.value);
    }
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

async function execNow(id: string) {
  if (!canOps.value) { store.notify('warning', 'SLM 执行需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (!await askConfirm({
    title: '立即执行快照策略',
    message: `将立即触发策略「${id}」的快照创建（异步执行）：会占用仓库存储并在创建期间增加集群 IO。`,
    okText: '立即执行',
  })) return;
  execing.value = id;
  try {
    const r = await api.slmExecute(id);
    store.notify('success', `已触发：${r.snapshot_name || id}`);
    /* 提交后立即 loadAll() 一次（策略卡最近执行态不等 1200ms 才可见）；
 1200ms 兜底重刷保留（SLM 侧 last_success 等元数据晚到补偿） */
    loadAll();
    setTimeout(loadAll, 1200);
  } catch (e: any) {
    /* 裸错误串 → friendlyEsError（loadErr/statsErr 臂已修是先例） */
    store.notify('error', '触发失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    execing.value = '';
  }
}

function copyBody(p: any) {
  const body = JSON.stringify(p, null, 2);
  copyText(body).then(ok => store.notify(ok ? 'success' : 'error', ok ? '策略 JSON 已复制到剪贴板' : '复制失败')); /* */
}

/* ═══ ：策略卡右键菜单 ═══ */
const rowMenu = ref<{ x: number; y: number; p: any } | null>(null);
function openRowMenu(e: MouseEvent, p: any) {
  rowMenu.value = { x: e.clientX, y: e.clientY, p };
}
function onSlmMenuKey(e: KeyboardEvent, p: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), p };
}
const rowMenuItems = computed(() => {
  const rm = rowMenu.value; if (!rm) return [];
  const close = () => { rowMenu.value = null; };
  return [
    { key: 'copy-id', label: '复制策略 ID', icon: Copy, run: () => { close(); copyText(rm.p.id).then(ok => store.notify(ok ? 'success' : 'error', ok ? '策略 ID 已复制' : '复制失败')); } },
    { key: 'copy-body', label: '复制策略配置 JSON', icon: Copy, run: () => { close(); copyBody(rm.p); } },
    /* 立即执行项与卡钮同门（AliasesView 条件展开同款形态） */
    ...(canOps.value ? [{ key: 'exec', label: '立即执行', icon: Play, sep: true, run: () => { close(); void execNow(rm.p.id); } }] : []),
  ];
});

/* 数值单源退役——fmtMs 本地三元随清理耗时档合并 semFormat duration 单源
 （展示微差可接受：'1m 30s' → '90.0s'）；ms 原值仍留 slmMeta 段 tip（metaStripAdoption 锚） */
function fmtMs(ms: number): string {
  return semFormat(ms, 'duration')?.text ?? (ms + ' ms');
}

function fmtTs(v: any): string {
  if (!v) return '';
  if (typeof v === 'number') return fmtTime(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : fmtTime(d.getTime());
}

onMounted(loadAll);
</script>

<style scoped>
.slm-page { padding: var(--sp-4) var(--sp-4) var(--sp-5); }
.slm-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); padding-bottom: var(--sp-3); border-bottom: 1px solid var(--border-subtle); }
/* 页头旧壳左组/图标/标题/副题四条死规则删（PageHeader 合并后同族漏删，
 模板零引用；页头行基壳与右组钮容器、自动刷新 label 活规则保留——模板消费在场，735 同族） */
.slm-alert { display: flex; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-m); margin-bottom: var(--sp-3); color: var(--warn); }
.slm-alert .btn { margin-left: auto; }
.slm-alert-tt { font-weight: 650; font-size: var(--fs-md); }
.slm-alert-sub { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-0); }
/* .slm-stats-err 三条私造 warn 皮规则随 EmptyState compact 合并退役
 （留白/图标/文案排布归组件；protectThreeState 降级提示锚同步更新 .empty-state） */
.slm-sk { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 全局统计 tile 墙退役：页头 inline 状态串改用 MetaStrip 统一件——
 基础形态（flex/b/i/sep/mono/tone 色档）全由组件承担，类名保留（protectThreeState 看守），本页只留落位 */
.slm-meta { margin-top: 3px; }
/* 页头工具行多控件排布 + 自动刷新开关 label（.sv-auto-lbl 同款） */
.slm-hd-r { display: flex; align-items: center; gap: var(--sp-2); }
.slm-auto-lbl { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; }
.slm-list { display: flex; flex-direction: column; gap: var(--sp-3); }
/* slm-card 策略行卡壳退役（约定④：panel 底+border-subtle 全框+radius:10px 整块
 消除 → border-top 分节流，xm-res 语言）；类名保留（protectThreeState 在场锁消费面），
 悬停反馈由顶部 hairline 变色承接 */
.slm-card { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3) 0; border-top: 1px solid var(--border-subtle); }
.slm-card:hover { border-color: var(--brand); }
.slm-card-l { flex: 1; min-width: 0; }
.slm-card-tt { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-md); font-weight: 650; }
.slm-card-sub { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-0); }
.slm-card-meta { margin-top: var(--sp-2); }
.slm-card-r { display: flex; gap: var(--sp-2); }

/* 1100 堆叠档（零结构动）——策略卡左信息/右操作与页头双栏在中窄视口挤压，
 塌纵向堆叠，与 RemoteClusters/Tasks 1100 档同口径 */
@media (max-width: 1100px) {
  .slm-hd { flex-direction: column; align-items: flex-start; gap: var(--sp-2); }
  .slm-card { flex-direction: column; }
  .slm-card-r { justify-content: flex-end; }
}

/* 900 紧凑微调档（口径，纯样式追加零结构动）——页侧距收一档、
 页头工具行（自动刷新开关×频率选择）允许换行兜挤压；分栏堆叠归 1100 档不重复 */
@media (max-width: 900px) {
  .slm-page { padding: var(--sp-3) var(--sp-3) var(--sp-4); }
  .slm-hd-r { flex-wrap: wrap; }
}

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.slm-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
