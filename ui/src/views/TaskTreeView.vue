<template>
  <div class="tt">
    <PageHeader :icon="GitBranch" title="任务树" subtitle="集群在途任务与父子任务层级" />
    <!-- 只读身份前置说明（1124）：批量/行内 cancel 与勾选框隐藏时给出原因
         （TaskTree 的勾选只用于取消，无取消权时不渲染，语言与任务管理页同源） -->
    <div v-if="auth.probed && !canWrite" class="tt-perm-note" role="status">
      <ShieldAlert :size="13" /> 当前身份只读：任务树照常可浏览，取消任务不可用——需 CLUSTER_OP 及以上角色，或该连接的「集群设置」写权限。
    </div>
    <div class="tt-bar lr-bar freeze">
      <div class="tt-bar-l lr-bar-l">
        <span class="tt-count">{{ nodes.length }} 根 · {{ totalTasks }} 任务</span>
        <!-- 手写过滤框改用 SearchFilterBar 统一件（全站第 10 胞；558 cd-kw-inp 先例：
 v-model 接原 ref 零触、placeholder 逐字保留、Esc 清空内建对齐——本框无 Enter 语义
 不接 @enter；tt-filter 落位类挂根，min() 极窄钳制同步更新） -->
        <SearchFilterBar v-model="filter" class="tt-filter" placeholder="按 action / description / node 过滤…" />
      </div>
      <div class="tt-bar-r lr-bar-r">
        <label class="tt-chk"><input v-model="autoRefresh" type="checkbox" />自动刷新 {{ refreshMs }}ms</label>
        <!-- 频率下拉改用 AutoRefreshSelect 统一件（原 .tt-sel 退役；本视图开关 checkbox 按约定保留原样，其余一律不动） -->
        <AutoRefreshSelect v-model:ms="refreshMs" :sizes="[1000, 2000, 5000, 10000]" label="自动刷新频率" />
        <!-- 工具行按钮对齐全局 .btn.sm 基准（原 xs 与全站工具行混排显小） -->
        <button v-if="canWrite" class="btn sm" :disabled="!selected.size" @click="bulkCancel">批量 cancel（{{ selected.size }}）</button>
        <!-- G198：在途守卫 busy||loading（748 G170 精确同构一行刀——load 只置
 loading，原绑 busy 在途窗可连点重入） -->
        <button class="btn sm ghost" :disabled="busy || loading" @click="load">立即刷新</button>
        <!-- G200：原始 IO 快查入口（铁律 F·747 G162/741 G148 三件套同构）——
 任务列表 _tasks 请求/响应原文直达；无记录不开空弹窗（toast 引导） -->
        <button class="btn sm ghost" title="最近一次任务列表（_tasks）请求/响应原文（复制/curl 回放）" @click="openRawIo">
          <Terminal :size="11" /> 原始 IO
        </button>
      </div>
    </div>

    <!-- -A2：页面级失败态——轮询静默容忍不等于页面裸奔，持续故障要有常驻提示；下次成功自动消隐。
 裸插值换 errPreHtml+errMeta 双参（错误原文全文不回退，仅头部追加
 code 徽标/「失败于 端点」元信息行，errMeta 空 meta 时输出与单参一致） -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      <span class="tt-err-txt" v-html="errPreHtml(loadErr, errMeta(loadErrRaw))"></span>
      <button class="btn sm" @click="load" :disabled="loading">重试</button>
    </div>

    <div class="tt-body" :style="ttLeftW > 0 ? { '--tt-left-w': ttLeftW + 'px' } : undefined">
      <div class="tt-left scroll-y">
        <!-- G1-B2/C4：四态互斥链——加载中 / 拉取失败占位（全文+重试在 err-bar）/ 真空（!loadErr）/ 过滤致空（照 AliasesView）
 空态三分支合并 EmptyState compact（文案逐字保留——clusterThreeState 挂载锁口径）；
 骨架分支保留 tt-empty 原样（ilmEmpty307 字面锁；骨架非空态不迁） -->
        <div v-if="loading && !nodes.length" class="tt-empty" style="display:flex;flex-direction:column;gap:var(--sp-2h)">
          <SkeletonBox v-for="i in 5" :key="i" height="18px" round :width="(96 - i * 11) + '%'" />
        </div>
        <EmptyState v-else-if="!nodes.length && loadErr" compact :icon="GitBranch" text="任务列表拉取失败" />
        <EmptyState v-else-if="!nodes.length" compact :icon="GitBranch" text="无任务" />
        <EmptyState v-else-if="!filteredRoots.length" compact :icon="ListFilter"
          :text="'无匹配任务（共 ' + totalTasks + ' 个，被当前过滤条件隐藏）'"
          action-text="清除过滤" @action="filter = ''" />
        <div v-for="root in filteredRoots" :key="root.taskId" class="tt-node" tabindex="0"
          @contextmenu.prevent="openRowMenu($event, root)" @keydown="onRowMenuKey($event, root)" data-row-nav @keydown.self="rowArrowNav">
          <TaskRow :n="root" :active-id="activeId" :sel="selected" :editable="canWrite" :kw="filter" @sel="toggleSel" @pick="pick" />
        </div>
        <!-- 任务行右键菜单（复制 taskId/复制信息/打开父动作页/取消——与详情栏动作同源）；
 菜单头 action 收 compact 短标签（actionShort 单源；「复制任务信息」
 仍拷全量原始 action，数据语义不受影响） -->
        <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y"
          :title="actionShort(rowMenu.n.action) + ' · ' + rowMenu.n.node" :items="rowMenuItems" @close="rowMenu = null" />
      </div>

      <!-- 列表/详情分栏拖拽柄（中缝 11px 占位列；窄屏堆叠态隐藏） -->
      <SplitHandle axis="vertical" :size="ttLeftW > 0 ? ttLeftW : 480" :min="220" :max="2000"
        label="任务列表/详情分栏" class="tt-split"
        @resize-end="(s: number) => ttLeftW = clampTtW(s)" @reset="ttLeftW = 0" />

      <div class="tt-right">
        <EmptyState v-if="!active" compact :icon="Eye" text="选中左侧任意任务查看详情" />
        <div v-else class="tt-det scroll-y">
          <div class="tt-det-hd">
            <div class="mono tt-det-id">{{ active.taskId }}</div>
            <div class="tt-det-actbar">
              <button class="btn xs" @click="fetchDetail(active.taskId)">刷新详情</button>
              <!-- 同口径：取消任务=OPERATOR+（与 TasksView 门禁一致），viewer 不展示 -->
              <button v-if="canWrite" class="btn xs danger" title="向 ES 发送 _tasks/_cancel：任务会尽快停止，已处理的部分不回滚" @click="cancelOne(active.taskId, active.node)">Cancel</button>
            </div>
          </div>
          <!-- G199：六 label 补 title 悬停中文（753 G191/745 G156 双语同款：
 英文键留检索、悬浮层中文释义） -->
          <div class="tt-det-grid">
            <div><span class="lbl" title="任务动作类型：ES action 全名（如 indices:data/write/reindex）">action</span><span class="mono">{{ active.action }}</span></div>
            <div><span class="lbl" title="执行节点：运行该任务的 ES 节点">node</span><span class="mono">{{ active.node }}</span></div>
            <!-- running 裸秒 → semFormat duration 单源人话化（ms→'1.2s'/ms 档；
 异常值回落原 toFixed 口径不丢信息） -->
            <div><span class="lbl" title="已运行时长：自任务开始到最近一次刷新">running</span><span class="mono">{{ semFormat(active.runningTimeNanos / 1e6, 'duration')?.text ?? ((active.runningTimeNanos / 1e9).toFixed(2) + 's') }}</span></div>
            <!-- W4c：cancellable 裸布尔 → 是/否 + 档位（true 中性 / false 弱显；IndexHubView 写阻塞行同手法） -->
            <div><span class="lbl" title="可否取消：是否可通过 _tasks/_cancel 中断该任务">cancellable</span><span class="mono" :style="!active.cancellable ? 'color:var(--tx2)' : ''">{{ active.cancellable ? '是' : '否' }}</span></div>
            <div v-if="active.parentTaskId"><span class="lbl" title="父任务 ID：本任务由该父任务派生（对应树中上一级）">parent</span><span class="mono">{{ active.parentTaskId }}</span></div>
            <div v-if="active.description" class="tt-det-full"><span class="lbl" title="任务描述：由请求参数生成的任务摘要">description</span><span class="mono">{{ active.description }}</span></div>
          </div>
            <div v-if="detail" class="tt-det-more">
            <!-- .tt-det-hd2 自造弱分节类 → 全局 .sec-t（弱分节档，本地规则删） -->
            <div class="sec-t">Detail (task-detail API)</div>
            <!-- W-C 批：详情 JSON 走全站 highlightJson 范式（转义安全 v-html，着色口径对齐 DslQuery） -->
            <pre class="mono json-view" v-html="detailHtml"></pre>
          </div>
        </div>
      </div>
    </div>
    <!-- G200：原始 IO 快查弹窗（ModalShell 壳，Esc/遮罩关闭随壳） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineComponent, h } from 'vue';
import { useRoute } from 'vue-router';
import { GitBranch, ChevronRight, ChevronDown, Copy, Eye, X, ListFilter, Terminal, ShieldAlert } from 'lucide-vue-next';
import { api, ioRecorder, type RawIoRec } from '../api';
import { copyText } from '../utils/format';
import { semFormat } from '../composables/useSemFormat'; /* ：running 时长人话化单源 */
/* action 短标签/色档合并 utils/esEnumZh 单源（taskActionZh 的 cluster:/indices:
 前缀裁剪与原本地 ttActionShort 逐字同款，无需本地包装）——原本地版系「TasksView 禁改期
 逐字复制」的漂移源，随单源合并退役 */
import { taskActionZh as actionShort, taskActionTone as actionColor } from '../utils/esEnumZh';
import PageHeader from '../components/PageHeader.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：工具条过滤胶囊统一件 */
import SkeletonBox from '../components/SkeletonBox.vue';
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';
import CellContextMenu from '../components/CellContextMenu.vue';
import RawIoModal from '../components/RawIoModal.vue'; /* G200：原始 IO 快查弹窗（747 G162 同构） */
import { useScopedDraft } from '../composables/useScopedDraft';
import { splitMark } from '../composables/useGridSearch';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { useAppStore } from '../stores/app';
import { usePref } from '../composables/urlState';
/* 任务列表/详情分栏拖拽柄 + 空态 EmptyState compact 合并 */
import SplitHandle from '../components/SplitHandle.vue';
import EmptyState from '../components/EmptyState.vue';
import { useAuthStore } from '../stores/auth';
import { askConfirm } from '../composables/confirm';
import { friendlyEsError } from '../utils/esError';
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面双参改用（code/endpoint 元信息行，BoostTuner 等 15 视图先例） */
import { highlightJson } from '../utils/jsonc';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();
/* 权限门禁——取消任务=/cluster/tasks/cancel=重建专项档（rank3+，与 TasksView 同口径）；
 任务观测全角色可用。低权隐藏 Cancel/批量/勾选/右键取消项，不让人点了才报 403。 */
const auth = useAuthStore();
/* 取消任务是集群级动作：连接模型下还需 rank3 或集群设置写键（后端同源） */
const canWrite = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/tasks/cancel', store.target)
  && auth.canClusterScope(store.target));
const raw = ref<any[]>([]);
const loading = ref(false);
const loadErr = ref('');
/* 原始错误对象旁路（catch 压串丢 code/endpoint，errMeta 读不到——runErrRaw 同范式） */
const loadErrRaw = ref<unknown>(null);
const busy = ref(false);
const activeId = ref<string>('');
const active = ref<any>(null);
const detail = ref<any>(null);
const selected = ref(new Set<string>());
/* G202： 史志注释对齐（748 G176 同款）——过滤词实况为
 useScopedDraft 草稿（sessionStorage，按集群/索引隔离），不进 URL（?filter= 零消费
 探针实锚；真深链属增强另批裁决）；自动刷新开关/间隔落偏好跨会话记忆 */
const filter = useScopedDraft('filter', { route: 'task-tree' }, '').text;
const autoRefresh = usePref('tasktree.autoRefresh', false);
const refreshMs = usePref('tasktree.refreshMs', 2000);
/* 双栏比例可调（tasktree.leftW，0=自动 1fr 等分）——中缝 SplitHandle 拖拽 +
 usePref 跨会话记忆（DiffEditor/ConfigValidator 同范式）；?taskId= 深链与过滤逻辑不动 */
const ttLeftW = usePref('tasktree.leftW', 0);
function clampTtW(s: number) { return Math.round(Math.min(2000, Math.max(220, s))); }

interface TN { taskId: string; action: string; node: string; description?: string;
  runningTimeNanos: number; cancellable: boolean; parentTaskId?: string;
  /* detailed=true 免费带回的 status（BulkByScrollTask.Status 族），mini 进度数据源 */
  status?: any;
  children: TN[]; }

const nodes = ref<TN[]>([]);

/* 2.1.6：自动刷新与手动刷新可叠加——旧快照晚到会顶掉新快照（任务已结束时仍显示在跑）；
 世代计数让过期包三支全部作废。 */
let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const list: any = await api.clusterTasks(undefined, true);
    if (seq !== loadSeq) return;
    raw.value = Array.isArray(list) ? list : [];
    /* 构建 parent→children 树 */
    const map = new Map<string, TN>();
    raw.value.forEach(t => {
      map.set(t.taskId, {
        taskId: t.taskId, action: t.action, node: t.node, description: t.description,
        runningTimeNanos: t.runningTimeNanos || 0,
        cancellable: t.cancellable, parentTaskId: t.parentTaskId,
        status: t.status,
        children: [],
      });
    });
    const roots: TN[] = [];
    map.forEach(n => {
      if (n.parentTaskId && map.has(n.parentTaskId)) map.get(n.parentTaskId)!.children.push(n);
      else roots.push(n);
    });
    /* 按 running 时长降序 */
    const sortRec = (arr: TN[]) => { arr.sort((a, b) => b.runningTimeNanos - a.runningTimeNanos); arr.forEach(x => sortRec(x.children)); };
    sortRec(roots);
    nodes.value = roots;
    /* 保持当前选中 */
    if (activeId.value && map.has(activeId.value)) active.value = map.get(activeId.value);
    /* 幽灵勾选自愈——任务完成/消失后勾选残留会流入下一次批量 cancel
 （27 批 RT clearSelected 同款问题）。仅剔除已不在列表的 id，存活的保留。 */
    if (selected.value.size) {
      const next = new Set<string>();
      selected.value.forEach(id => { if (map.has(id)) next.add(id); });
      if (next.size !== selected.value.size) selected.value = next;
    }
    loadErr.value = '';
    loadErrRaw.value = null;
  } catch (e: any) {
    if (seq !== loadSeq) return;
    loadErrRaw.value = e; /* ：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    if (!autoRefresh.value) store.notify('error', '任务列表加载失败：' + loadErr.value);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

const totalTasks = computed(() => raw.value.length);
const filteredRoots = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return nodes.value;
  const match = (n: TN): boolean =>
    (n.action || '').toLowerCase().includes(q)
    || (n.description || '').toLowerCase().includes(q)
    || (n.node || '').toLowerCase().includes(q);
  const walk = (n: TN): TN | null => {
    const kids = n.children.map(walk).filter(Boolean) as TN[];
    if (match(n) || kids.length) return { ...n, children: kids };
    return null;
  };
  return nodes.value.map(walk).filter(Boolean) as TN[];
});

function toggleSel(id: string, on: boolean) {
  if (on) selected.value.add(id); else selected.value.delete(id);
  selected.value = new Set(selected.value);
}
function pick(n: TN) {
  activeId.value = n.taskId;
  active.value = n;
  fetchDetail(n.taskId);
}
async function fetchDetail(id: string) {
  /* 切节点竞态守卫：回包落定时选中已漂移（连点两节点/深链直选被 pick 覆盖）则整包丢弃，
   成功/catch/finally 三支同口径——慢包后到不得顶掉新选中节点的详情 */
  try { const d = await api.taskDetail(id); if (id !== activeId.value) return; detail.value = d; }
  catch { if (id !== activeId.value) return; detail.value = null; }
}
const detailStr = computed(() => JSON.stringify(detail.value, null, 2));
/* W-C 批：highlightJson 输出为已转义 HTML，是全站唯一允许 v-html 的通道 */
const detailHtml = computed(() => highlightJson(detailStr.value));

/* G200：原始 IO 快查（747 G162 RankDebug 三件套同构）——按本页
 端点取记录环最近一条；'/cluster/tasks?' 含查询串前缀，与 /cluster/tasks/cancel
 写端点互不混淆；判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/tasks?');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页点一次「立即刷新」（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 2.1.6：单任务取消在途集合（与 TasksView 同构）——同 id 连点/菜单+详情双入口不重复下发 */
const cancellingOne = ref(new Set<string>());
async function cancelOne(id: string, node?: string) {
  /* 权限执行体首行门（按钮/菜单已有 v-if，此处覆盖键盘/程序化通道） */
  if (!canWrite.value) { store.notify('warning', '取消任务是集群级动作：需 CLUSTER_OP 及以上角色，或该连接的集群设置写权限'); return; }
  if (cancellingOne.value.has(id)) return; /* 2.1.6：同一任务在途防重 */
  if (!await askConfirm({
    title: '取消任务',
    message: '将取消该任务。已处理的部分不会回滚，任务会尽快在安全点停下。',
    okText: '取消任务',
    facts: [{ label: '任务 ID', value: id }, ...(node ? [{ label: '执行节点', value: node }] : [])],
  })) return;
  if (cancellingOne.value.has(id)) return; /* 确认窗期间另一入口可能已开始 */
  cancellingOne.value.add(id);
  try { await api.cancelTask(id); store.notify('success', '已取消：' + id); load(); }
  catch (e: any) { store.notify('error', '取消失败：' + (e?.message || e)); }
  finally { cancellingOne.value.delete(id); }
}
async function bulkCancel() {
  /* 权限执行体首行门（批量钮已有 v-if，此处覆盖程序化通道） */
  if (!canWrite.value) { store.notify('warning', '取消任务是集群级动作：需 CLUSTER_OP 及以上角色，或该连接的集群设置写权限'); return; }
  if (busy.value) return; /* 2.1.6：批量取消执行体防重 */
  const ids = Array.from(selected.value);
  if (!ids.length) return;
  if (!await askConfirm({
    title: '批量取消任务',
    message: '将依次取消所选任务。已处理的部分不会回滚，不可取消的任务会计入失败。',
    okText: `取消 ${ids.length} 个`,
    facts: [{ label: `任务 ID（${ids.length} 个）`, value: ids.join(', ') }],
  })) return;
  busy.value = true;
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await api.cancelTask(id); ok++; } catch { fail++; }
  }
  selected.value = new Set();
  busy.value = false;
  store.notify(fail ? 'warning' : 'success', `批量 cancel：成功 ${ok} 失败 ${fail}`);
  load();
}

/* ═══ ：任务行右键菜单 ═══ */
const rowMenu = ref<{ x: number; y: number; n: any } | null>(null);
function openRowMenu(e: MouseEvent, n: any) {
  rowMenu.value = { x: e.clientX, y: e.clientY, n };
}
function onRowMenuKey(e: KeyboardEvent, n: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), n };
}
const rowMenuItems = computed(() => {
  const rm = rowMenu.value; if (!rm) return [];
  const close = () => { rowMenu.value = null; };
  return [
    { key: 'copy-id', label: '复制 taskId', icon: Copy, run: () => { close(); copyText(rm.n.taskId).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'taskId 已复制' : '复制失败')); } },
    { key: 'copy-desc', label: '复制任务信息', icon: Copy, run: () => { close(); copyText(rm.n.action + ' ' + rm.n.node + ' ' + rm.n.taskId).then(ok => store.notify(ok ? 'success' : 'error', ok ? '任务信息已复制' : '复制失败')); } },
    { key: 'detail', label: '查看详情', icon: Eye, run: () => { close(); pick(rm.n); } },
    ...(canWrite.value ? [{ key: 'cancel', label: '取消任务', icon: X, danger: true, sep: true, run: () => { close(); void cancelOne(rm.n.taskId, rm.n.node); } }] : []),
  ];
});

/* 递归行组件（内联，避免额外文件；显式 any 破自引用） */

/* W4c：任务树行是紧凑单行文本，只着文字色不铺 pill 底（'n' 中性不着色）。
 短标签与色档合并 utils/esEnumZh 单源（taskActionZh 前缀裁剪与原本地
 ttActionShort 逐字同款——cluster:/indices: 裁 8 字符、reindex/bulk/search/delete-by-q/
 update-by-q 族短名全同，语义零回退）；原本地 ttActionShort/ttActionColor 两段函数
 随单源合并退役，色值映射表（tone→token）保留本地（行内文字色非 pill 形态） */
const TT_ACTION_TONE_CSS: Record<string, string> = { y: 'var(--warn)', b: 'var(--info)', r: 'var(--err)' };

/* 树节点 mini 进度——cluster/tasks?detailed=true 已免费带回 status（与
 TasksView reindexProgress 同源同口径：done=updated+created+deleted / total）；
 禁逐行打 task-detail//progress 端点（N×轮询频率的额外请求，成本裁定在档，TasksView 同款）。
 形态紧凑适配：行高 22px 只出 40px 小条 + 百分比文字；无 total 不出——非 scroll 族任务
 的 status 无 total/updated 计数，天然出局 */
const numCt = (v: any): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
function miniProg(n: TN): { pct: number } | null {
  const s = n.status || {};
  const total = numCt(s.total);
  if (total <= 0) return null; /* 无 total 不出 */
  const done = numCt(s.updated) + numCt(s.created) + numCt(s.deleted);
  if (done <= 0) return null; /* 刚起任务无任何计数：不出 0% 空条 */
  return { pct: Math.min(100, Math.round((done / total) * 100)) };
}

const TaskRow: any = defineComponent({
  name: 'TaskRow',
  props: {
    n: { type: Object, required: true },
    activeId: { type: String, required: true },
    sel: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    editable: { type: Boolean, default: false },
    /* v3.0.0 文本高亮收口：过滤词传入行内，命中片段 mark（多字段匹配的「为何命中」可见化） */
    kw: { type: String, default: '' },
  },
  emits: ['sel', 'pick'],
  setup(props, ctx): any {
    const open = ref(true);
    /* splitMark 段 → vnode 数组（mark 包裹命中段，textContent 不变） */
    const markSegs = (text: string) => splitMark(text || '', props.kw || '')
      .map((s: { t: string; m: boolean }) => (s.m ? h('mark', { class: 'mt-mark' }, s.t) : s.t));
    return (): any => {
      const n = props.n as TN;
      const hasKids = n.children.length > 0;
      const dur = (n.runningTimeNanos / 1e9).toFixed(1);
      const prog = miniProg(n);
      return h('div', { class: 'tr-w' }, [
        h('div', {
          class: ['tr', props.activeId === n.taskId ? 'on' : '', hasKids ? 'has' : ''],
          style: { paddingLeft: (10 + props.depth * 16) + 'px' },
          onClick: () => ctx.emit('pick', n),
        }, [
          /* 键盘可达（与 TasksView .tv-caret 同口径）：role=button+tabindex+Enter/Space+aria-expanded */
          h('span', {
            class: 'tr-arw',
            role: hasKids ? 'button' : undefined,
            tabindex: hasKids ? 0 : undefined,
            'aria-expanded': hasKids ? open.value : undefined,
            'aria-label': hasKids ? (open.value ? '收起子任务' : '展开子任务') : undefined,
            onClick: (e: MouseEvent) => { e.stopPropagation(); if (hasKids) open.value = !open.value; },
            onKeydown: (e: KeyboardEvent) => {
              if (!hasKids) return;
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open.value = !open.value; }
            },
          }, hasKids ? [h(open.value ? ChevronDown : ChevronRight, { size: 12 })] : ''),
          props.editable ? h('input', {
            type: 'checkbox', class: 'tr-chk',
            /* G201：勾选框可读名（G47/G142/G154 族）——行任务标识+批量取消目的 */
            'aria-label': '勾选任务 ' + n.taskId + '，加入批量取消',
            checked: props.sel.has(n.taskId),
            disabled: !n.cancellable,
            onClick: (e: MouseEvent) => e.stopPropagation(),
            onChange: (e: any) => ctx.emit('sel', n.taskId, e.target.checked),
          }) : null,
          /* G1-C5：省略/截断必须 title 全名可达（；W4c：action 挂与 TasksView 同源色档（文本色） */
          h('span', {
            class: 'tr-act mono',
            title: n.action || '?',
            style: (() => { const c = TT_ACTION_TONE_CSS[actionColor(n.action || '')]; return c ? { color: c } : undefined; })(),
          }, markSegs(n.action || '?')),
          h('span', { class: 'tr-node mono', title: n.node || '' }, markSegs(n.node ? n.node.slice(0, 8) : '?')),
          /* mini 进度条（detailed status 同源；无 total 为 null 不渲染） */
          prog ? h('span', { class: 'tr-prog', title: `进度 ${prog.pct}%（updated+created+deleted / total，来自 _tasks detailed status）` }, [
            h('span', { class: 'tr-prog-bar', 'aria-hidden': 'true' }, [
              h('span', { class: 'tr-prog-fill', style: { width: prog.pct + '%' } }),
            ]),
            h('span', { class: 'tr-prog-txt mono' }, prog.pct + '%'),
          ]) : null,
          h('span', { class: 'tr-dur mono' }, dur + 's'),
        ]),
        (hasKids && open.value) ? h('div', { class: 'tr-kids' },
          n.children.map(c => h(TaskRow, {
            n: c, activeId: props.activeId, sel: props.sel, depth: props.depth + 1, editable: props.editable, kw: props.kw,
            onSel: (id: string, on: boolean) => ctx.emit('sel', id, on),
            onPick: (x: TN) => ctx.emit('pick', x),
          }))) : null,
      ]);
    };
  },
});

/* 轮询合并 useAutoRefresh——KeepAlive/页面隐藏/卸载全链停续+tick 再验
 loading（此前裸 setInterval 在后台标签页照跑）；开关/间隔变更 restart 重排 */
const refresher = useAutoRefresh(load, {
  ms: () => (autoRefresh.value ? refreshMs.value : 0),
  guard: () => !loading.value,
});
refresher.setOn(true);

/* W4c·完成去向链：RA/UBQ 提交成功跳 /task-tree?taskId=…——挂载消费深链：
 直选该任务并拉详情；任务在途则 load() 后按 activeId 落位（load 内「保持当前选中」），
 已完成/不在途任务不在树中时用最小节点撑起详情栏（taskId + Detail 仍可读）；
 手动点击 pick 仍可覆盖 */
const route = useRoute();
onMounted(() => {
  const q = route.query.taskId;
  const qTask = Array.isArray(q) ? String(q[0] ?? '') : q != null ? String(q) : '';
  if (qTask) {
    activeId.value = qTask;
    void fetchDetail(qTask);
  }
  void load().then(() => {
    if (!qTask || active.value || activeId.value !== qTask) return;
    active.value = { taskId: qTask, action: '', node: '', runningTimeNanos: 0, cancellable: false, children: [] };
  });
});
import { watch } from 'vue';
watch([autoRefresh, refreshMs], () => refresher.restart());
</script>

<style scoped>
/* G1-C12：区块级间距落梯 --sp token（控件内 padding 与亚阶梯微调不动） */
.tt { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
.tt-bar {padding: var(--sp-3) var(--sp-4);}
/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.tt-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 var(--sp-4) var(--sp-3); }
.tt-count { color: var(--tx2); font-size: var(--fs-xs); }
/* 下限挂 min(220px,100%) 钳制（ClusterSettings .cs-filter 同步同款）——
 485/375 窄档裸 220px 下限撑破工具行，min() 让输入框在极窄容器收缩到 100% */
/* 类随改用挂 SearchFilterBar 根——手写输入框皮（bg2 底/bd 边/r-s 圆角）退役归
 组件 .sfb 胶囊壳单源，本类只留落位（min() 极窄钳制同步更新，smallScreenFloor547 锁面）与内衬 */
.tt-filter { padding: 3px var(--sp-2); font-size: var(--fs-sm); min-width: min(220px, 100%); }
.tt-chk { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); cursor: pointer; }
/* 频率下拉改用 AutoRefreshSelect 统一件，.tt-sel 残留删除 */
/* 双栏比例可调——中缝 11px SplitHandle 占位列，左宽走 --tt-left-w（默认 1fr 等分；DiffEditor/ConfigValidator 同范式） */
.tt-body { display: grid; grid-template-columns: var(--tt-left-w, 1fr) 11px minmax(0, 1fr); gap: var(--sp-3); flex: 1; min-height: 0; }
.tt-left, .tt-right { padding: var(--sp-2); overflow: auto; min-height: 260px; }
/* 空态四分支迁 EmptyState compact，本类仅剩加载骨架分支在用（ilmEmpty307 字面锁保留） */
.tt-empty { color: var(--tx2); text-align: center; padding: var(--sp-5); font-size: var(--fs-sm); }
.tt-det-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-3); }
.tt-det-id { font-size: var(--fs-sm); color: var(--tx0); font-weight: 650; }
.tt-det-actbar { display: flex; gap: var(--sp-2); }
.tt-det-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2) var(--sp-4); font-size: var(--fs-sm); }
.tt-det-grid > div { display: flex; gap: var(--sp-2); align-items: baseline; }
.tt-det-grid .lbl { color: var(--tx2); min-width: 88px; }
.tt-det-full { grid-column: 1 / -1; }
.tt-det-more { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px dashed var(--bd); }
/* .tt-det-hd2 规则随 .sec-t 合并退役（原 fs-xs/600 → 弱分节档 fs-sm/600） */

/* G1-C6： 标准断点——双栏 1100px 堆叠为单栏（堆叠态拖拽柄隐藏） */
@media (max-width: 1100px) {
  .tt-body { grid-template-columns: minmax(0, 1fr); }
  .tt-split { display: none; }
}
/* 900 紧凑微调档（ 口径）——堆叠后详情双列键值（1fr 1fr）在窄视口
 回单列，lbl 88px 下限不再挤压值列 */
@media (max-width: 900px) {
  .tt-det-grid { grid-template-columns: minmax(0, 1fr); }
  .tt-det-actbar { flex-wrap: wrap; }
}
.tt-det-more pre { margin: 0; font-size: var(--fs-xs); color: var(--tx0); white-space: pre-wrap; max-height: 300px; overflow: auto; }
</style>
<style>
.tr-w { user-select: none; }
/* h() 渲染的 mark 不走子组件 scoped：全局落一份（与 MarkText.mt-mark 同款 token） */
.tr mark.mt-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
.tr { display: flex; align-items: center; gap: var(--sp-2); height: 22px; font-size: var(--fs-xs); color: var(--tx1); cursor: pointer; border-radius: var(--r-xs); }
.tr:hover { background: color-mix(in oklab, var(--ac) 10%, transparent); color: var(--tx0); }
.tr.on { background: color-mix(in oklab, var(--ac) 22%, transparent); color: var(--tx0); }
.tr-arw { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; opacity: .6; }
.tr-arw:hover { opacity: 1; color: var(--ac); }
.tr-arw:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 2px; }
.tr-chk { margin: 0 var(--sp-1) 0 0; }
.tr-chk:disabled { opacity: .3; }
.tr-act { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-node { width: 66px; color: var(--tx2); }
/* 树节点 mini 进度条（detailed status 同源，TasksView .tv-prog 口径紧凑版；
 h() 渲染不走子组件 scoped，与 .tr-* 同落全局块） */
.tr-prog { display: inline-flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
.tr-prog-bar { width: 40px; height: 4px; border-radius: 2px; background: var(--bg2); overflow: hidden; }
.tr-prog-fill { display: block; height: 100%; background: var(--ac); border-radius: 2px; }
.tr-prog-txt { font-size: var(--fs-2xs); color: var(--tx2); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* sem-scan：时长原恒 --wn 警告黄——全黄=没有黄，且与 TasksView .tv-dur（常态 tx2、超 5m 才 warn）
 跨页不同色；同语义（运行时长）统一常态中性档 */
.tr-dur { width: 56px; text-align: right; color: var(--tx2); }
/* .tr-kids 死空规则删除（子树缩进由行内 paddingLeft 承担，规则体早已为空） */
</style>
