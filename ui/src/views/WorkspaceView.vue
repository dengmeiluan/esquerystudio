<template>
  <div class="ws-page">
    <PageHeader :icon="LayoutDashboard" title="工作台（自定义）">
<template #subtitle>
        拖拽 · 显隐 · 大小自定义 · localStorage 持久化 ·
            <b>{{ visibleWidgets.length }}</b> / {{ ALL_WIDGETS.length }} 个组件
      </template>
      <template #actions>
<button ref="cfgBtnEl" class="btn ghost sm" @click="showConfig = !showConfig">
          <SlidersHorizontal :size="12" /> 编辑布局
        </button>
        <button class="btn ghost sm" @click="reset">
          <RotateCcw :size="12" /> 重置
        </button>
        <button class="btn ghost sm" @click="refreshAll">
          <RefreshCw :size="12" /> 全部刷新
        </button>
      </template>
      </PageHeader>
</div>

    <div v-if="showConfig" class="ws-cfg">
      <div class="ws-cfg-tt sec-t">选择要显示的组件（拖动排序）</div>
      <div class="ws-cfg-list">
        <div v-for="(w, i) in layout" :key="w.k" class="ws-cfg-row"
          @dragover.prevent
          @drop="moveTo(i)"
          @contextmenu.prevent="openRowMenu($event, w, i)"
          @keydown="onRowKey($event, w, i)">
          <!-- G44+：勾选/跨度即落盘（@change=persist，副标题持久化承诺兑现）
 + checkbox/select 补部件名 aria-label、grab 装饰字 aria-hidden。
 拖拽源只在 grab 柄：根 draggable 会劫持行内 checkbox/select 的原生手势 -->
          <span class="ws-cfg-grab" aria-hidden="true" draggable="true" @dragstart="dragIdx = i">⋮⋮</span>
          <input type="checkbox" v-model="w.on" @change="persist()"
            :aria-label="(widgetOf(w.k)?.name ?? w.k) + '显示'" />
          <component :is="widgetOf(w.k)?.icon" :size="12" />
          <span class="ws-cfg-name">{{ widgetOf(w.k)?.name }}</span>
          <select v-model="w.span" class="ws-cfg-sz" @change="persist()"
            :aria-label="(widgetOf(w.k)?.name ?? w.k) + '跨度'">
            <option value="1">1 列</option>
            <option value="2">2 列</option>
            <option value="3">3 列（整行）</option>
          </select>
        </div>
      </div>
    </div>

    <div class="ws-grid">
      <div v-for="w in visibleWidgets" :key="w.k" class="ws-w" :style="{ gridColumn: `span ${Math.min(w.span, cols)}` }">
        <div class="ws-w-hd">
          <span class="ws-w-tt">
            <component :is="widgetOf(w.k)?.icon" :size="12" />
            {{ widgetOf(w.k)?.name }}
          </span>
          <button aria-label="隐藏" class="btn ghost xs" @click="w.on = false; persist()" title="隐藏">
            <X :size="11" />
          </button>
        </div>

        <!-- Widgets -->
        <div v-if="w.k === 'health'" class="ws-w-bd">
          <!-- 手写空态壳退役合并 EmptyState compact + action（一键体检语义保留；
 action 位无 disabled 档——防重入守卫迁 loadHealth 函数内，行为等价） -->
          <EmptyState v-if="!hResult" compact :icon="HeartPulse" text="尚未体检" action-text="一键体检" @action="loadHealth" />
          <div v-else>
            <div class="ws-score" :class="scoreCls(hResult.score)">{{ hResult.score }} / 100</div>
            <div class="ws-sub" :title="hStatus === 'YELLOW' ? 'yellow 含副本未分配；单节点集群属常态，不影响体检得分' : ''">
              正常 {{ hOk }} / {{ hResult.checks?.length || 0 }} 项 · {{ hStatus }}<template v-if="hStatus === 'YELLOW'">（单节点常态）</template>
            </div>
            <router-link to="/health-report" class="ws-link">详细报告 →</router-link>
          </div>
        </div>

        <div v-else-if="w.k === 'indices'" class="ws-w-bd">
          <div class="ws-num">{{ store.indices.length }}</div>
          <div class="ws-sub">当前索引数量 · 已选：{{ store.pickedIdx || '—' }}</div>
          <router-link to="/browser" class="ws-link">浏览索引 →</router-link>
        </div>

        <div v-else-if="w.k === 'favorites'" class="ws-w-bd">
          <div class="ws-num">{{ store.favorites.length }}</div>
          <div class="ws-sub">收藏项</div>
          <ul class="ws-fav">
            <li v-for="f in store.favorites.slice(0, 4)" :key="f.id">
              <Star :size="10" /> {{ f.title }}
            </li>
          </ul>
          <router-link to="/favorites" class="ws-link">全部收藏 →</router-link>
        </div>

        <div v-else-if="w.k === 'quick-sql'" class="ws-w-bd">
          <div class="ws-sub">一行 SQL 直查</div>
          <input v-model="quickSql" class="ws-inp"
            placeholder="SELECT * FROM &quot;my-index&quot; LIMIT 5" @keydown.enter="runQuickSql" />
          <div class="ws-sub" v-if="quickSqlResult">返回 {{ quickSqlResult.rows?.length || 0 }} 行</div>
          <router-link to="/search?mode=sql" class="ws-link">SQL 控制台 →</router-link>
        </div>

        <div v-else-if="w.k === 'remote'" class="ws-w-bd">
          <div class="ws-num">{{ remoteCount }}</div>
          <div class="ws-sub">已连接的远程集群</div>
          <router-link to="/remote-clusters" class="ws-link">CCS 面板 →</router-link>
        </div>

        <div v-else-if="w.k === 'tasks'" class="ws-w-bd">
          <div class="ws-num">{{ tasksCount }}</div>
          <div class="ws-sub">运行中的 ES 任务</div>
          <router-link to="/task-tree" class="ws-link">任务树 →</router-link>
        </div>

        <div v-else-if="w.k === 'shortcuts'" class="ws-w-bd">
          <div class="ws-sc">
            <!-- ：DSL 落点钉死（708 TemplateGallery toQuery 同范式）——
 裸 /search push 会吃 QueryHub mode 记忆被带进沙盒，显式 mode=dsl 深链优先 -->
            <button class="btn ghost xs" @click="$router.push({ path: '/search', query: { mode: 'dsl' } })"><Zap :size="10" /> DSL 查询</button>
            <button class="btn ghost xs" @click="$router.push('/bulk')"><Rows3 :size="10" /> Bulk 编辑</button>
            <button class="btn ghost xs" @click="$router.push('/update-by-query')"><Recycle :size="10" /> UBQ</button>
            <button class="btn ghost xs" @click="$router.push('/doc-diff')"><FileCode2 :size="10" /> Diff 编辑</button>
            <button class="btn ghost xs" @click="$router.push('/reindex-advanced')"><Wand2 :size="10" /> Reindex 高级</button>
            <button class="btn ghost xs" @click="$router.push('/search?mode=sandbox')"><FlaskConical :size="10" /> 搜索沙盒</button>
          </div>
        </div>

        <div v-else-if="w.k === 'wanquan'" class="ws-w-bd">
          <div class="ws-sub">当前会话统计</div>
          <!-- 四行 ws-kv 手写 meta 行合并 MetaStrip mini 档（550 sv-repo-meta 先例：
 值亮+标签暗+·分隔）；长索引名段 tip 兜底（原 ellipsis+title 语义同步更新） -->
          <MetaStrip class="ws-strip" :items="[
            { value: store.indices.length, label: '索引' },
            { value: store.favorites.length, label: '收藏' },
            { value: store.pickedIdx || '—', label: '选中', tip: store.pickedIdx || undefined },
            { value: now, label: '时间' },
          ]" />
        </div>
      </div>

      <EmptyState v-if="visibleWidgets.length === 0" :icon="LayoutDashboard"
                  text="当前无可见组件"
                  hint="点「编辑布局」勾选要显示的组件"
                  action-text="编辑布局" @action="showConfig = true" class="ws-empty" />
      <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenuTitle"
        :items="rowMenuItems" @close="rowMenu = null" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  LayoutDashboard, SlidersHorizontal, RotateCcw, RefreshCw, X, HeartPulse, Star,
  Zap, Rows3, Recycle, FileCode2, Wand2, FlaskConical, Database, Network, GitBranch, Layers,
  Eye, EyeOff, ArrowUp, ArrowDown, Columns3,
} from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api } from '../api';
import EmptyState from '../components/EmptyState.vue';
import MetaStrip from '../components/MetaStrip.vue'; /* ：ws-kv meta 行统一件 */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft';
import { askConfirm } from '../composables/confirm';
import { fmtTimeTz } from '../utils/format';
import { BP_NARROW, BP_STACK } from '../utils/layout'; /* ：响应式列数断点单源（与下方 CSS 档互锚） */
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';

const store = useAppStore();

const ALL_WIDGETS = [
  { k: 'health', name: '集群体检', icon: HeartPulse, defSpan: 1 },
  { k: 'indices', name: '索引统计', icon: Database, defSpan: 1 },
  { k: 'favorites', name: '收藏夹', icon: Star, defSpan: 1 },
  { k: 'quick-sql', name: '一行 SQL', icon: Database, defSpan: 2 },
  { k: 'remote', name: '远程集群', icon: Network, defSpan: 1 },
  { k: 'tasks', name: '运行中任务', icon: GitBranch, defSpan: 1 },
  { k: 'shortcuts', name: '快速动作', icon: Zap, defSpan: 2 },
  { k: 'wanquan', name: '会话状态', icon: Layers, defSpan: 1 },
] as const;

const LS_KEY = 'esquerystudio.workspace.v1';
type Layout = { k: string; on: boolean; span: number };
const layout = ref<Layout[]>([]);
const showConfig = ref(false);
const dragIdx = ref<number | null>(null);

const hResult = ref<any>(null);
const hBusy = ref(false);
/* 快查 SQL 进 sessionStorage 草稿——刷新不丢稿（可重入） */
/* 草稿：快捷 SQL 草稿迁 useScopedDraft（按集群目标隔离） */
const quickSql = useScopedDraft('quick-sql', {
  route: 'workspace',}).text;
const quickSqlResult = ref<any>(null);
const remoteCount = ref(0);
const tasksCount = ref(0);
const now = ref('');
let clockTimer: number | undefined;

function widgetOf(k: string) { return ALL_WIDGETS.find(w => w.k === k); }
const visibleWidgets = computed(() => layout.value.filter(w => w.on));
/* 后端 checks 契约是 level（info/warn/critical）：info 即正常项 */
const hOk = computed(() => hResult.value?.checks?.filter((c: any) => c.level === 'info').length || 0);
const hStatus = computed(() => hResult.value?.summary?.status?.toUpperCase() || '-');

function scoreCls(s: number) { return s >= 85 ? 'good' : s >= 60 ? 'warn' : 'bad'; }
function persist() { writeStoredRaw(localStorage, LS_KEY, JSON.stringify(layout.value)); }
function loadLayout() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) { layout.value = raw; return; }
  } catch { /* 本地布局记录损坏则回落默认布局，不打扰用户 */ }
  layout.value = ALL_WIDGETS.map(w => ({ k: w.k, on: true, span: w.defSpan }));
}
async function reset() {
  if (!await askConfirm({
    title: '恢复默认布局',
    level: 'info',
    message: '将清除当前自定义布局（卡片开关与排序）并恢复默认，不影响任何集群数据。',
    okText: '恢复默认',
  })) return;
  removeStoredRaw(localStorage, LS_KEY);
  loadLayout();
  /* ：重置恢复默认全 on 后复用 refreshAll 补拉——此前隐藏期挂载
 条件跳过拉取，重置后卡面数值 0/null 陈旧须手点「全部刷新」（ 修法原文） */
  refreshAll();
  store.notify('success', '布局已重置');
}
function moveTo(i: number) {
  if (dragIdx.value === null || dragIdx.value === i) return;
  const item = layout.value[dragIdx.value];
  layout.value.splice(dragIdx.value, 1);
  layout.value.splice(i, 0, item);
  dragIdx.value = null;
  persist();
}

/* 配置行右键/菜单键：显隐、列宽、排序——只改本地布局并落盘，不触发服务端写。 */
const rowMenu = ref<{ x: number; y: number; w: Layout; i: number } | null>(null);
const rowMenuTitle = computed(() => {
  const m = rowMenu.value;
  if (!m) return '';
  const name = widgetOf(m.w.k)?.name ?? m.w.k;
  return `组件 · ${name} · ${m.w.span} 列${m.w.on ? '' : ' · 已隐藏'}`;
});
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  const sortChildren: CcmItem[] = [];
  if (m.i > 0) {
    sortChildren.push({ key: 'ws-up', label: '上移', icon: ArrowUp, run: () => moveRow(m.i, -1) });
  }
  if (m.i < layout.value.length - 1) {
    sortChildren.push({ key: 'ws-down', label: '下移', icon: ArrowDown, run: () => moveRow(m.i, 1) });
  }
  return [
    {
      key: 'ws-toggle',
      label: m.w.on ? '隐藏此组件' : '显示此组件',
      icon: m.w.on ? EyeOff : Eye,
      run: () => { m.w.on = !m.w.on; persist(); },
    },
    {
      key: 'ws-span',
      label: '列宽',
      icon: Columns3,
      children: [1, 2, 3].map(n => ({
        key: 'ws-span-' + n,
        label: n + ' 列' + (n === 3 ? '（整行）' : ''),
        run: () => { m.w.span = n; persist(); },
      })),
    },
    { key: 'ws-move', label: '排序', icon: ArrowUp, sep: true, children: sortChildren },
  ];
});
function moveRow(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= layout.value.length) return;
  const [item] = layout.value.splice(i, 1);
  layout.value.splice(j, 0, item);
  persist();
}
function openRowMenu(e: MouseEvent, w: Layout, i: number) {
  rowMenu.value = { x: e.clientX, y: e.clientY, w, i };
}
function onRowKey(e: KeyboardEvent, w: Layout, i: number) {
  if (e.defaultPrevented) return;
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  rowMenu.value = { x: r.left + 12, y: r.bottom, w, i };
}

/* ：配置面板 Esc 收口（665 window 捕获级范式）—— 时点裁「非弹层
 569 边界外」裁决收口：面板是「编辑布局」钮触发的编辑态面，Esc 退出+焦点回触发钮
 与 Kibana dashboard 编辑模式同语言；弹层让路守卫=.msk-box/.cf/.ccm 在开时 Esc 归弹层单源不抢 */
const cfgBtnEl = ref<HTMLButtonElement | null>(null);
function onCfgEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !showConfig.value) return;
  if (document.querySelector('.msk-box, .cf, .ccm')) return;
  e.stopPropagation();
  showConfig.value = false;
  cfgBtnEl.value?.focus();
}
watch(showConfig, on => {
  if (on) window.addEventListener('keydown', onCfgEsc, true);
  else window.removeEventListener('keydown', onCfgEsc, true);
});

async function loadHealth() {
  if (hBusy.value) return; /* ：EmptyState action 位无 disabled 档——防重入守卫迁此（原按钮 :disabled 等价） */
  hBusy.value = true;
  try { hResult.value = await api.healthReport(); } catch (e: any) { store.notify('error', '体检失败：' + (e?.message || e)); } finally { hBusy.value = false; }
}
async function refreshAll() {
  store.loadIndices();
  if (layout.value.find(l => l.k === 'health' && l.on)) loadHealth();
  /* 部分卡片刷新失败不再假报成功 */
  const fails: string[] = [];
  if (layout.value.find(l => l.k === 'remote' && l.on)) {
    try { const r = await api.remoteClusters(); remoteCount.value = r?.count || 0; } catch { fails.push('远程集群'); }
  }
  if (layout.value.find(l => l.k === 'tasks' && l.on)) {
    try { const r = await api.taskDetail(''); tasksCount.value = countTasks(r); } catch { fails.push('任务数'); }
  }
  if (fails.length) store.notify('warning', `工作台已刷新，但 ${fails.join('、')} 卡片拉取失败（显示旧值）`);
  else store.notify('success', '已刷新工作台');
}
function countTasks(r: any): number {
  let n = 0;
  const nodes = r?.nodes || {};
  for (const node of Object.values<any>(nodes)) {
    n += Object.keys(node?.tasks || {}).length;
  }
  return n;
}

async function runQuickSql() {
  if (!quickSql.value.trim()) return;
  try {
    const r = await api.sqlJson(JSON.stringify({ query: quickSql.value, fetch_size: 5 }));
    if (r?.available === false) { store.notify('warning', 'SQL 接口不可用'); return; }
    quickSqlResult.value = r;
    store.notify('success', `返回 ${r.rows?.length || 0} 行`);
  } catch (e: any) { store.notify('error', 'SQL 失败:' + (e?.message || e), { action: { label: '重试', onClick: () => runQuickSql() } }); }
}

/* C4-fix：响应式列数 —— 内联 grid-column: span N 普通媒体查询压不住，
 900 单列档 span≥2 会撑隐式列横向溢出，这里用 JS 钳制（Math.min(w.span, cols)） */
const cols = ref(3);
let mq1100: MediaQueryList | null = null;
let mq900: MediaQueryList | null = null;
function syncCols() { cols.value = mq900?.matches ? 1 : mq1100?.matches ? 2 : 3; }

/* 秒表 visibilitychange 守卫（jobTracker onVisChange 范式）——页面隐藏停表，
 回前台立即续走一拍并重启； 离开视图停表语义不变（onBeforeUnmount 兜底保留） */
function onVisChange() {
  if (document.hidden) {
    if (clockTimer) { window.clearInterval(clockTimer); clockTimer = undefined; }
  } else {
    now.value = fmtTimeTz(Date.now());
    clockTimer = window.setInterval(() => { now.value = fmtTimeTz(Date.now()); }, 1000);
  }
}

/* 1125：refreshAll 一次拉索引/体检/远端集群/任务详情，身份未落地会带旧 target 发出 */
const wsBoot = useGatedBootRead('workspace', () => refreshAll());
onMounted(() => {
  loadLayout();
  now.value = fmtTimeTz(Date.now());
  clockTimer = window.setInterval(() => { now.value = fmtTimeTz(Date.now()); }, 1000);
  wsBoot.run();
  document.addEventListener('visibilitychange', onVisChange);
  if (typeof window.matchMedia === 'function') { /* 测试环境 happy-dom 兜底，保持默认 3 列 */
    mq1100 = window.matchMedia(`(max-width: ${BP_STACK}px)`);
    mq900 = window.matchMedia(`(max-width: ${BP_NARROW}px)`);
    syncCols();
    mq1100.addEventListener('change', syncCols);
    mq900.addEventListener('change', syncCols);
  }
});
onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer); /* ：离开视图停表，防后台常驻计时器 */
  document.removeEventListener('visibilitychange', onVisChange);
  mq1100?.removeEventListener('change', syncCols);
  mq900?.removeEventListener('change', syncCols);
  window.removeEventListener('keydown', onCfgEsc, true); /* ：Esc 挂摘随卸载兜底 */
});
</script>

<style scoped>
.ws-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
/* W-F：.ws-hd/.ws-hd-l/.ws-hd-ic/.ws-hd-tt/.ws-hd-sub/.ws-hd-r 死规则删除（页头已迁 PageHeader） */
/* ws-cfg 页面级配置面板壳退役（约定④；ra-card 已退形态同类）——
 bg/整框/radius 三件套消除，分界 border-top 承接，padding/margin 等值迁入盒模型零变动 */
.ws-cfg { border-top: 1px solid var(--border); padding: var(--sp-3); margin-bottom: var(--sp-3); }
/* W-F：弱分节标题挂全局 .sec-t，本地排版本地声明退役（口径 B） */
.ws-cfg-tt { margin-bottom: var(--sp-2); }
.ws-cfg-list { display: flex; flex-direction: column; gap: var(--sp-1); }
.ws-cfg-row { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-xs); cursor: move; }
.ws-cfg-grab { cursor: grab; color: var(--muted); font-family: var(--mono); }
.ws-cfg-name { flex: 1; font-size: var(--fs-sm); }
.ws-cfg-sz { border: 1px solid var(--border); background: var(--card-bg); color: var(--fg); border-radius: 3px; padding: var(--sp-0) var(--sp-1); font-size: var(--fs-xs); }
/* 固定 3 列改 auto-fit minmax——超宽视口 3 大列浪费、中宽视口 3 列挤压，
 列数随容器自适应（TemplateGallery .tg-grid 同口径）；≤1100/≤900 档仍压 2/1 列不回归 */
.ws-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: var(--sp-3); }
/* ws-w 网格部件分节壳退役（约定④；ov-cell 554 终态同语言）——壳三件套消除，
 border-top 承接分界，padding 等值迁入；ws-w-empty 空态不再被整块空框包裹（空态零空框） */
.ws-w { border-top: 1px solid var(--border); padding: var(--sp-3) var(--sp-4); min-height: 120px; display: flex; flex-direction: column; }
.ws-w-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-2); }
/* W-F：卡头 400 失序归位 650（口径 B） */
.ws-w-tt { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); font-weight: 650; }
.ws-w-bd { flex: 1; display: flex; flex-direction: column; gap: var(--sp-1); }
/* .ws-w-empty 手写空态壳退役——health 空态合并 EmptyState compact+action
 （留白归组件单源，空态不留整块空框） */
/* W-F：28px 大数字字面量归 --fs-num-l 展示数字档（Lead 收尾补 650+mono+tabular 三件套） */
.ws-score { font-size: var(--fs-num-l); font-weight: 650; font-family: var(--mono); font-variant-numeric: tabular-nums; margin: var(--sp-1) 0; }
.ws-score.good { color: var(--success); }
.ws-score.warn { color: var(--warning); }
.ws-score.bad { color: var(--err); } /* ：--danger 别名退役归 --err 本名 */
.ws-num { font-size: var(--fs-num-l); font-weight: 650; font-family: var(--mono); font-variant-numeric: tabular-nums; }
.ws-sub { font-size: var(--fs-xs); color: var(--muted); }
.ws-link { font-size: var(--fs-xs); color: var(--brand); text-decoration: none; margin-top: var(--sp-2); }
.ws-link:hover { text-decoration: underline; }
.ws-fav { list-style: none; padding: 0; margin: var(--sp-1) 0; font-size: var(--fs-xs); color: var(--muted); }
.ws-fav li { padding: var(--sp-0) 0; display: flex; align-items: center; gap: var(--sp-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-inp { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--r-xs); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-sm); font-family: var(--mono); color: var(--fg); }
.ws-sc { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--sp-2); }
/* ws-kv 三条私造行样式随 MetaStrip 合并退役（形态归 .ms 单源） */
/* 仅保留栅格占位：内边距/居中已由 EmptyState 组件自带 */
.ws-empty { grid-column: 1 / -1; }

/* 归一断点：1100 降两列，900 收单列 */
@media (max-width: 1100px) {
  .ws-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  .ws-grid { grid-template-columns: 1fr; }
}
</style>
