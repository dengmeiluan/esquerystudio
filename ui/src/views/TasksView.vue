<template>
  <div class="tv">
    <PageHeader :icon="ListTodo" title="ES 任务管理" subtitle="集群在途任务列表与中止" />
    <!-- 顶栏：actions 过滤 / 自动刷新 / 手动刷新 -->
    <div class="tv-bar lr-bar freeze">
      <div class="tv-bar-l lr-bar-l">
        <n-select
          v-model:value="actionsFilter"
          :options="filterOpts"
          size="tiny"
          class="tv-sel"
          style="width:220px"
          @update:value="load"
        />
        <!-- 节点过滤（前端过滤：_tasks API 只有 actions 参数）——父任务被滤掉时子任务按根展示；
 补 filterable（大集群节点 >20 无过滤不可用，TopBar 索引下拉同款） -->
        <n-select
          v-model:value="nodeFilter"
          :options="nodeOpts"
          size="tiny"
          class="tv-sel"
          style="width:200px"
          placeholder="全部节点"
          filterable
        />
        <!-- kw 过滤（taskId/action/描述子串，flatList 展开序上过滤），
 taskId/描述列 MarkText 命中高亮。
 手写过滤框改用 SearchFilterBar 统一件（v-model kw 绑定零触；
 Esc 清空内建；胶囊壳归组件单源，tv-kw 类锚随 input-class 保留在 input 上——
 sweep524 挂载过滤锁同路径零迁；tv-kw-wrap 只留落位宽高，对齐 tv-sel 25px 基线） -->
        <SearchFilterBar v-model="kw" class="tv-kw-wrap" input-class="tv-kw" placeholder="过滤 taskId / action / 描述…" />
      </div>
      <div class="tv-bar-r lr-bar-r">
        <label class="tv-auto">
          <input type="checkbox" v-model="autoRefresh" />
          <span>自动刷新</span>
        </label>
        <!-- 补/211:刷新频率档位(3s 盯进度/10s 常规/30s 省请求,usePref 记忆)
 下拉改用 AutoRefreshSelect 统一件（原 .ipt tv-interval 原生 select 退役；开关 checkbox 与 usePref 逻辑不动） -->
        <AutoRefreshSelect v-if="autoRefresh" v-model:ms="intervalMs" :sizes="[3000, 10000, 30000]" label="自动刷新频率" />
        <button aria-label="刷新任务列表" class="btn sm ghost" @click="load" :disabled="loading" title="刷新任务列表">
          <RefreshCw :size="12" :class="{ spinning: loading }" />
        </button>
        <!-- G255：原始 IO 快查入口（铁律 F·755 G200 三件套同构——本页与
 TaskTree 同端点 _tasks；记录环最近一条请求/响应原文直达，无记录不开空弹窗） -->
        <button class="btn sm ghost" title="最近一次任务列表（_tasks）请求/响应原文（复制/curl 回放）" @click="openRawIo">
          <Terminal :size="11" /> 原始 IO
        </button>
      </div>
    </div>

    <!-- 只读身份前置说明（1124）：取消钮/右键项隐藏时不留「页面没这能力」的疑惑；
         与 Diag/Rest/Aliases 同一语言，只在身份就绪后出现，不闪断首屏 -->
    <div v-if="auth.probed && !canWrite" class="tv-perm-note" role="status">
      <ShieldAlert :size="13" /> 当前身份只读：任务列表与详情照常可看，取消任务不可用——需 CLUSTER_OP 及以上角色，或该连接的「集群设置」写权限。
    </div>

    <!-- -A2：页面级失败态——轮询失败不能只闪 toast，持续故障时页面要有常驻提示；下次成功自动消隐。
 裸插值换 errPreHtml+errMeta 双参（DiagView 547 同款）——错误原文全文回看，
 code 徽标/「失败于 端点」元信息行走 loadErrRaw 旁路原始对象（压串读不出） -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      <span class="tv-err-txt" v-html="errPreHtml(loadErr, errMeta(loadErrRaw))"></span>
      <!-- G256：重试钮 icon 补 spinning（同页刷新钮两标准归一） -->
      <button class="btn sm" @click="load" :disabled="loading"><RefreshCw :size="12" :class="{ spinning: loading }" /> 重试</button>
    </div>

    <!-- KPI 卡墙退役（ih-meta 范式）：4 项统计并入下方树卡头 inline 元信息串 -->

    <!-- 树。：pane 壳三件套（border/bg/radius）退役（535 SqlBridge pane 直贴
 约定续扫）——min-height 布局语义与 .card padding 载体原样迁 .tv-tree-card -->
    <div class="tv-tree-card">
      <div class="card-t">
        <ListTree :size="13" /> 任务树（{{ trees.length }} 根任务 · 已折叠子任务：{{ collapsedTotal }}）
        <!-- KPI 大卡退役（IndexHubView .ih-meta 范式）：全量语义走 :title 兜底，
 Action 类型列表窄屏只展示前 3 个，全列表在 :title -->
        <!-- KPI 大卡退役（IndexHubView .ih-meta 范式）：四项统计走 MetaStrip items、
 超 5m>0 warn 走组件 tone 档。：Action 类型前 3 清单原是「插槽尾巴 +
 手写 ksep + join(' · ') 串」三来源混一条 · 节奏——合并为 items 尾部 text 项
 （组件 sep 统一节奏），全量语义仍走 :title 兜底 -->
        <MetaStrip class="tv-meta" :items="tvMeta" :title="'运行中 ' + visibleTasks.length + '（当前集群 _tasks 快照） · 可取消 ' + cancellableCount + '（cancellable=true） · 超 5m 长任务 ' + longRunning + '（runningTime > 5m） · Action 类型 ' + actionKinds.length + ' 种：' + (actionKinds.join(' · ') || '-')" />
        <button v-if="flatList.length" class="btn sm ghost" style="margin-left:auto" @click="copyTasksMd" title="复制任务列表为 Markdown（群聊/工单直贴）">
          <ClipboardList :size="11" /> Markdown
        </button>
        <button class="btn sm ghost" @click="toggleExpandAll">
          {{ expandAll ? '折叠全部' : '展开全部' }}
        </button>
      </div>
      <!-- G1-B1：四态互斥——骨架 / 拉取失败占位（全文+重试在 err-bar，不重复）/ 真空（!loadErr）/ 树 -->
      <div v-if="loading && !trees.length" class="tv-loading">
        <SkeletonBox v-for="i in 3" :key="i" height="30px" round />
      </div>
      <!-- 空态/失败占位 EmptyState 三件套（原裸文案缺下一步指引） -->
      <EmptyState v-else-if="!trees.length && loadErr" :icon="RefreshCw" text="任务列表拉取失败" hint="失败原因与重试见页顶错误条" />
      <EmptyState v-else-if="!trees.length" :icon="ListTodo" text="当前无运行中任务" hint="重建/迁移发起后任务会出现在这里，也可点右上角刷新" />
      <!-- G257a：容器 role=log+aria-label（G210 容器族——轮询/过滤驱动的
 列表到达语义读屏公告） -->
      <div v-else class="tv-tree scroll-y" role="log" aria-label="任务树（随过滤与展开实时更新）">
        <!-- 过滤致空（树有行但 kw 无命中）——轻提示 + 清除入口（ColPicker none 先例形态） -->
        <div v-if="kw.trim() && !shownList.length" class="tv-nohit">
          无匹配任务（过滤词：{{ kw }}）
          <button class="btn xs ghost" @click="kw = ''">清除过滤</button>
        </div>
        <div
          v-for="t in shownList"
          :key="t.taskId"
          class="tv-node"
          :class="{ 'tv-hit': t.taskId === deepTaskId }"
          :data-task-id="t.taskId"
          :style="{ paddingLeft: (12 + t.depth * 18) + 'px' }"
          tabindex="0"
          @contextmenu.prevent="openTaskMenu($event, t)"
          @keydown="onTaskMenuKey($event, t)" data-row-nav @keydown.self="rowArrowNav"
        >
          <div class="tv-node-l">
            <span
              v-if="t.hasChildren"
              class="tv-caret"
              role="button" tabindex="0"
              :aria-label="expandedIds.has(t.taskId) || expandAll ? '收起子任务' : '展开子任务'"
              :aria-expanded="expandedIds.has(t.taskId) || expandAll"
              :class="{ open: expandedIds.has(t.taskId) || expandAll }"
              @click="toggleExpand(t.taskId)"
              @keydown.enter.prevent="toggleExpand(t.taskId)"
              @keydown.space.prevent="toggleExpand(t.taskId)"
            >▸</span>
            <span v-else class="tv-caret ph"></span>
            <!-- G1-C1：.p-* 色款类全仓无定义（pill 曾实际无色），改用全局 .pill 五主档色款。
 action 徽标改用 StatusPill 统一件（色档走组件 tone=actionColor，
 胶囊形态/色值不再本页手拼 class；组件根元素仍渲染 .pill+y 档，行内形态不变） -->
            <StatusPill :tone="actionColor(t.action)" :label="actionShort(t.action)" />
            <!-- taskId/描述列 MarkText 命中高亮（textContent 与原文一致，title 不受影响） -->
            <span class="mono tv-tid" :title="t.taskId"><MarkText :text="t.taskId" :kw="kw" /></span>
            <span class="mono tv-node-node" :title="t.node">@ {{ t.node }}</span>
          </div>
          <div class="tv-node-m">
            <span class="tv-node-desc mono" :title="t.description"><MarkText :text="trunc(t.description, 80)" :kw="kw" /></span>
            <!-- reindex 进度渲染（可观测断链）——ES _tasks?detailed 已带回
 status（BulkByScrollTask.Status），有 total 出「已处理/总数 百分比」+进度条，
 total 缺失只显已处理数；不逐行打 /progress 端点（详见 reindexProgress 注释） -->
            <span v-if="t.prog" class="tv-prog" :title="t.prog.title">
              <!-- G257b：进度条 progressbar 语义（704 G32/773 族；原 aria-hidden
 退役——bar 获读屏语义，可见文本通道不动） -->
              <span v-if="t.prog.pct != null" class="tv-prog-bar" role="progressbar" :aria-valuenow="t.prog.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="'任务进度 ' + t.prog.pct + '%'">
                <span class="tv-prog-fill" :style="{ width: t.prog.pct + '%' }"></span>
              </span>
              <span class="tv-prog-txt mono">{{ t.prog.text }}</span>
            </span>
          </div>
          <div class="tv-node-r">
            <!-- tookMs 真值展示——后端 listTasks 已新增 tookMs（runningTimeNanos
 折算 ms，任务在途即已耗时），缺失时前端回落 runningMs 同源折算，不再有「-1 显 -」
 兜底语义。口径：ES _tasks 无 finished 概念（任务完成即从列表消失），本列是
 「该任务至今已耗时」而非「作业总耗时终值」；人话化时长走 semFormat duration 单源 -->
            <span class="tv-took mono" :title="'已耗时 ' + tookText(t.tookMs)">
              {{ tookText(t.tookMs) }}
            </span>
            <span class="tv-dur mono" :class="{ warn: t.runningMs > 5 * 60000 }">
              {{ fmtDur(t.runningMs) }}
            </span>
            <button
              v-if="canWrite"
              class="btn sm"
              :class="{ danger: t.cancellable }"
              :disabled="!t.cancellable || cancelling.has(t.taskId)"
              @click="cancelOne(t)"
              :title="t.cancellable ? '取消任务' : '不可取消'"
            >
              <!-- G256：取消钮 Loader2/X 双态（cancelling 按行门控=天然无跨钮
 污染；772 G246 族） -->
              <Loader2 v-if="cancelling.has(t.taskId)" :size="11" class="spinning" />
              <X v-else :size="11" /> 取消
            </button>
          </div>
          <!-- 补（原 183 口径）：取消失败原因持久显示在任务行上（title 全量） -->
          <div v-if="cancelFailures.has(t.taskId)" class="tv-cancel-err" :title="cancelFailures.get(t.taskId)">
            取消失败：{{ cancelFailures.get(t.taskId) }}
          </div>
        </div>
      </div>
    </div>

    <!-- 任务节点右键菜单（E 组逐表过 dbx 清单）——复制 taskId/任务信息/取消直达 -->
    <CellContextMenu v-if="taskMenu" :x="taskMenu.x" :y="taskMenu.y" :title="taskMenu.t.taskId"
      :items="taskMenuItems" @close="taskMenu = null" />
    <!-- G255：原始 IO 快查弹窗 -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { NSelect } from 'naive-ui';
import { ListTodo, ListTree, RefreshCw, X, ClipboardList, Copy, Terminal, Loader2, ShieldAlert } from 'lucide-vue-next';
import { useRoute } from 'vue-router';
import { api, ioRecorder, type RawIoRec } from '../api';
import PageHeader from '../components/PageHeader.vue';
import MarkText from '../components/MarkText.vue';
import EmptyState from '../components/EmptyState.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：action 徽标统一件 */
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';
import CellContextMenu from '../components/CellContextMenu.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：kw 过滤胶囊统一件 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* 卡头统计串统一件 */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { askConfirm } from '../composables/confirm';
import { usePref } from '../composables/urlState';
import { fmtDur, trunc, copyText, fmtNumCompact } from '../utils/format';
/* 时长人话化单源（tookMs 列） */
import { semFormat } from '../composables/useSemFormat';
import { friendlyEsError } from '../utils/esError';
/* 错误面双参改用（code/endpoint 元信息行，DiagView 547 同范式） */
import { errPreHtml, errMeta } from '../utils/errPre';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
/* actionShort/actionColor 迁 utils/esEnumZh 收口（taskActionZh 契约签名
 (a: string): string、色档拆 taskActionTone）——别名绑定供模板与既有调用点零改动消费 */
import { taskActionZh as actionShort, taskActionTone as actionColor } from '../utils/esEnumZh';
import SkeletonBox from '../components/SkeletonBox.vue';
import RawIoModal from '../components/RawIoModal.vue'; /* G255：原始 IO 快查弹窗（755 G200 同构） */

const store = useAppStore();
/* 权限门禁——取消任务=/cluster/tasks/cancel=重建专项档（rank3+，与 abort 族对齐）；
 任务观测全角色可用 */
const auth = useAuthStore();
/* 取消任务是集群级动作（taskId 不带归属）：连接模型下还需 rank3 或集群设置写键，
   与后端 CLUSTER_SCOPE_WRITE_KEYWORDS 同源；静态模型 canClusterScope 恒真。 */
const canWrite = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/tasks/cancel', store.target)
  && auth.canClusterScope(store.target));

interface Task {
  taskId: string;
  node: string;
  action: string;
  description: string;
  parentTaskId: string;
  startTimeMillis: number;
  runningTimeNanos: number;
  cancellable: boolean;
  status: any;
  runningMs: number;
  /* tookMs 真值——后端 listTasks 新增下发（runningTimeNanos 折算 ms，运行中即已耗时）；
 前端对缺失值回落 runningMs 同源折算。ES _tasks 无 finished 概念（完成即消失），
 本字段语义=「任务至今已耗时」，不存在「运行中=-1」的终态未定语义（原 -1 兜底退役） */
  tookMs: number;
}

/* tookMs 人话化时长——semFormat duration 单源（ms<1000 '123 ms'、≥1000 '1.2s'），
 异常值回落 fmtDur 既有口径 */
function tookText(ms: number): string {
  return semFormat(ms, 'duration')?.text ?? fmtDur(ms);
}

/* reindex 行内进度（可观测断链）——字段名按后端 EsIndexAdmin.getReindexProgress
 对 ES status JSON 的解析键实地核实（total/updated/created/deleted，BulkByScrollTask.Status），
 非凭记忆编造；processed 口径=updated+created+deleted（version_conflicts 是被跳过的文档不计）。
 /progress 端点裁决：taskId 语义核实为通用 ES nodeId:taskNum（GetTaskRequest 直拆），
 与本页 /cluster/tasks 的 taskId **同域**可接，但逐行打点=N×轮询频率的额外请求，
 而 detailed=true 已带回同源 status——只用 t.status，不接 /progress（成本裁定，）。 */
interface ProgChip { done: number; total: number | null; pct: number | null; text: string; title: string }
const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
function reindexProgress(t: Task): ProgChip | null {
  if (!String(t.action || '').includes('reindex')) return null;
  const s = t.status || {};
  const done = num(s.updated) + num(s.created) + num(s.deleted);
  const total = num(s.total);
  if (done <= 0 && total <= 0) return null; /* 刚起任务无任何计数：不渲染 0/0 空进度 */
  const hasTotal = total > 0;
  const pct = hasTotal ? Math.min(100, Math.round((done / total) * 100)) : null;
  return {
    done, total: hasTotal ? total : null, pct,
    text: hasTotal ? `${fmtNumCompact(done)}/${fmtNumCompact(total)} ${pct}%` : `已处理 ${fmtNumCompact(done)}`,
    title: `已处理 ${done.toLocaleString('en-US')}${hasTotal ? ` / 总数 ${total.toLocaleString('en-US')}` : '（总数未知）'}`
      + `（updated ${num(s.updated)} · created ${num(s.created)} · deleted ${num(s.deleted)}）——来自 ES _tasks detailed status`,
  };
}

const tasks = ref<Task[]>([]);
const loading = ref(false);
const loadErr = ref('');
/* 原始错误对象旁路（errPreHtml 压串丢 code/endpoint，errMeta 读不到——DiagView 547 同范式） */
const loadErrRaw = ref<unknown>(null);
const cancelling = ref(new Set<string>());
/* 补（原 183 口径）：取消失败原因按 taskId 持久展示在任务行上，成功后清除 */
const cancelFailures = ref(new Map<string, string>());
/* 过滤器进 URL（可分享「只看 reindex 任务」链接），自动刷新是个人偏好落 localStorage */
const actionsFilter = useScopedDraft('filter', { route: 'tasks' }, '').text;
const autoRefresh = usePref('tasks.autoRefresh', true);
const expandAll = ref(true);
const expandedIds = ref(new Set<string>());
/* 补/211:刷新频率档位(usePref 记忆,默认 3s 同旧行为) */
const intervalMs = usePref('tasks.intervalMs', 3000);

const filterOpts = [
  { label: '全部任务', value: '' },
  { label: 'reindex（重建）', value: 'indices:data/write/reindex*' },
  { label: 'search（查询）', value: 'indices:data/read/search*' },
  { label: 'bulk / write（写入）', value: 'indices:data/write/bulk*,indices:data/write/index*' },
  { label: 'delete-by-query', value: 'indices:data/write/delete/byquery*' },
  { label: 'update-by-query', value: 'indices:data/write/update/byquery*' },
  { label: 'cluster:*（集群级）', value: 'cluster:*' },
];

/* 节点过滤：选项随任务列表动态去重；''=全部节点（纯前端过滤，不发请求） */
const nodeFilter = ref('');
const nodeOpts = computed(() => {
  const set = new Set<string>();
  tasks.value.forEach(t => { if (t.node) set.add(t.node); });
  return [
    { label: '全部节点', value: '' },
    ...Array.from(set).sort().map(n => ({ label: n, value: n })),
  ];
});
/* 树与统计均基于过滤后子集（所见即所指）；父任务被滤掉时其子任务按现有逻辑降级为根 */
const visibleTasks = computed(() =>
  nodeFilter.value ? tasks.value.filter(t => t.node === nodeFilter.value) : tasks.value);

/* 2.1.6：筛选切换/连点刷新竞态守卫——旧筛选的快照晚到会顶掉新筛选结果。 */
let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const raw = await api.clusterTasks(actionsFilter.value || undefined, true);
    if (seq !== loadSeq) return;
    tasks.value = (raw || []).map((t: any) => ({
      ...t,
      runningMs: Math.round(Number(t.runningTimeNanos || 0) / 1e6),
      /* tookMs 真值展示——后端已下发即用真值，缺失回落 runningMs 同源折算
 （原「-1 显 -」兜底退役：ES _tasks 无 finished 概念，任务在途即有已耗时真值） */
      tookMs: Number.isFinite(Number(t.tookMs)) && Number(t.tookMs) >= 0
        ? Number(t.tookMs)
        : Math.round(Number(t.runningTimeNanos || 0) / 1e6),
    }));
    loadErr.value = '';
    loadErrRaw.value = null;
  } catch (e: any) {
    if (seq !== loadSeq) return;
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    loadErrRaw.value = e; /* ：原始错误对象旁路留存（压串前的 ApiError 供 errMeta） */
    store.notify('error', '加载任务失败：' + loadErr.value);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

async function cancelOne(t: Task) {
  /* 权限执行体首行门（按钮 v-if 之外的右键菜单/程序化通道） */
  if (!canWrite.value) { store.notify('warning', '取消任务是集群级动作：需 CLUSTER_OP 及以上角色，或该连接的集群设置写权限'); return; }
  if (cancelling.value.has(t.taskId)) return; /* 2.1.6：同一任务在途防重 */
  if (!t.cancellable) return;
  if (!await askConfirm({
    title: '取消任务',
    message: '将取消该任务。已处理的部分不会回滚，任务会尽快在安全点停下。',
    okText: '取消任务',
    facts: [{ label: '任务 ID', value: t.taskId }, { label: 'action', value: t.action }],
  })) return;
  cancelling.value.add(t.taskId);
  try {
    await api.cancelTask(t.taskId);
    cancelFailures.value.delete(t.taskId);
    store.notify('success', '任务取消已发起：' + t.taskId);
    setTimeout(load, 500);
  } catch (e: any) {
    /* 补（原 183 口径）：失败原因落到任务行持久显示，不只 toast 一闪 */
    const reason = friendlyEsError(String(e?.message || e));
    cancelFailures.value.set(t.taskId, reason);
    store.notify('error', '取消失败：' + reason);
  } finally {
    cancelling.value.delete(t.taskId);
  }
}

/* G255：原始 IO 快查（755 G200 同构）——按本页端点取记录环最近一条；
 '/cluster/tasks?' 含查询串前缀，与 /cluster/tasks/cancel 写端点互不混淆；
 判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/tasks?');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先刷新一次任务列表（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 构建父子树：parent_task_id 无效时视为根（节点随建附 reindex 进度 chip） */
interface TreeNode extends Task { children: TreeNode[]; depth: number; hasChildren: boolean; prog: ProgChip | null }
const trees = computed<TreeNode[]>(() => {
  const map = new Map<string, TreeNode>();
  visibleTasks.value.forEach(t => map.set(t.taskId, { ...t, children: [], depth: 0, hasChildren: false, prog: reindexProgress(t) }));
  const roots: TreeNode[] = [];
  map.forEach(node => {
    const pid = node.parentTaskId;
    if (pid && pid !== 'unset' && map.has(pid)) {
      const p = map.get(pid)!;
      p.children.push(node);
      p.hasChildren = true;
    } else {
      roots.push(node);
    }
  });
  const assignDepth = (n: TreeNode, d: number) => {
    n.depth = d;
    n.children.forEach(c => assignDepth(c, d + 1));
  };
  roots.forEach(r => assignDepth(r, 0));
  return roots.sort((a, b) => b.runningMs - a.runningMs);
});

/* 扁平化展开（受 expandAll / expandedIds 控制） */
const flatList = computed(() => {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    out.push(n);
    if ((expandAll.value || expandedIds.value.has(n.taskId)) && n.hasChildren) {
      n.children.forEach(walk);
    }
  };
  trees.value.forEach(walk);
  return out;
});

const collapsedTotal = computed(() =>
  visibleTasks.value.length - flatList.value.length);

/* kw 过滤——taskId/action/description 子串匹配，在 flatList 展开序上过滤
 （命中行保留原 depth 缩进）；taskId/描述列 MarkText 命中高亮 */
const kw = ref('');
const shownList = computed(() => {
  const k = kw.value.trim().toLowerCase();
  if (!k) return flatList.value;
  return flatList.value.filter(t =>
    t.taskId?.toLowerCase().includes(k)
    || t.action?.toLowerCase().includes(k)
    || String(t.description || '').toLowerCase().includes(k));
});

/* ?taskId= 深链读侧（TaskTreeView onMounted 消费同构）——命中行 .tv-hit
 高亮 + load 后滚动定位；任务不在当前列表（已完成/被 kw 滤掉）时高亮位不渲染，静默无副作用 */
const route = useRoute();
const deepTaskId = ref('');

/* 任务列表 Markdown 复制——卡死/慢任务排障贴群的一手清单 */
async function copyTasksMd() {
  const rows = flatList.value;
  if (!rows.length) return;
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    `任务列表（${rows.length} 个）：`,
    '',
    '| 任务 | 节点 | 描述 | 运行时长 |',
    '| --- | --- | --- | --- |',
    ...rows.map(t => `| \`${esc(actionShort(t.action))} ${esc(t.taskId)}\` | ${esc(t.node)} | ${esc(trunc(t.description, 60))} | ${fmtDur(t.runningMs)} |`),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 个任务（Markdown）` : '复制失败');
}

/* ═══ ：任务节点右键菜单（E 组逐表过 dbx 清单）——taskId/任务信息复制+
 取消直达（仍走 askConfirm 确认链）；不做列管理：任务树是层级清单非列式表格 ═══ */
const taskMenu = ref<{ x: number; y: number; t: Task } | null>(null);
function openTaskMenu(e: MouseEvent, t: Task) {
  taskMenu.value = { x: e.clientX, y: e.clientY, t };
}
function onTaskMenuKey(e: KeyboardEvent, t: Task) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  taskMenu.value = { ...menuKeyAnchor(e), t };
}
const taskMenuItems = computed(() => {
  const m = taskMenu.value; if (!m) return [];
  const t = m.t;
  const facts = `taskId=${t.taskId} action=${t.action} node=${t.node} running=${fmtDur(t.runningMs)}${t.description ? ' desc=' + t.description : ''}`;
  return [
    { key: 'copy-id', label: '复制 taskId', icon: Copy, run: async () => {
      const ok = await copyText(t.taskId);
      store.notify(ok ? 'success' : 'error', ok ? '已复制 taskId' : '复制失败');
    } },
    { key: 'copy-row', label: '复制任务信息', icon: ClipboardList, run: async () => {
      const ok = await copyText(facts);
      store.notify(ok ? 'success' : 'error', ok ? '已复制任务信息' : '复制失败');
    } },
    ...(t.cancellable && canWrite.value ? [{ key: 'cancel', label: '取消任务…', icon: X, danger: true, sep: true, run: () => cancelOne(t) }] : []),
  ];
});
const cancellableCount = computed(() => visibleTasks.value.filter(t => t.cancellable).length);
const longRunning = computed(() => visibleTasks.value.filter(t => t.runningMs > 5 * 60000).length);
const actionKinds = computed(() => {
  const set = new Set<string>();
  visibleTasks.value.forEach(t => set.add(actionShort(t.action)));
  return Array.from(set);
});

/* 卡头统计串 MetaStrip items——超 5m 长任务 >0 走 warn（0 回中性亮色）；
 Action 类型前 3 清单拆 text 项进 items（原插槽尾巴+手写 ksep+join 串三来源
 混一条 · 节奏合并组件 sep 统一节奏；kinds 空时不追加——值对「Action 类型 0」已表达） */
const tvMeta = computed<MetaStripItem[]>(() => [
  { value: visibleTasks.value.length, label: '运行中' },
  { value: cancellableCount.value, label: '可取消' },
  { value: longRunning.value, label: '超 5m', tone: longRunning.value ? 'warn' : undefined },
  { value: actionKinds.value.length, label: 'Action 类型' },
  ...actionKinds.value.slice(0, 3).map((k: string) => ({ text: k })),
]);

/* 展开/折叠全部统一入口：翻转时同步清按需展开集——单节点收起留下的
   expandedIds 残留会让折叠全部后子树仍展开 */
function toggleExpandAll() {
  expandAll.value = !expandAll.value;
  expandedIds.value = new Set();
}

function toggleExpand(id: string) {
  if (expandAll.value) {
    /* 从全展开转为按需模式：初始化 set 为除本节点外全部 */
    expandAll.value = false;
    expandedIds.value = new Set(tasks.value.filter(t => t.taskId !== id).map(t => t.taskId));
    return;
  }
  const s = expandedIds.value;
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expandedIds.value = new Set(s);
}

/* 轮询合并 useAutoRefresh——KeepAlive 激活/失活+页面隐藏（visibilitychange）
 +卸载全链停续，tick 时再验 loading（此前裸 setInterval 在后台标签页/隐藏态照跑）。
 ms getter 读 autoRefresh（关=0 不排表）；开关/间隔变更 restart 重排（开=立即拉一轮） */
const refresher = useAutoRefresh(load, {
  ms: () => (autoRefresh.value ? intervalMs.value : 0),
  guard: () => !loading.value,
});
refresher.setOn(true);
/* onMounted 消费 ?taskId= 深链（读 query → 置高亮位 → load 后滚动定位） */
onMounted(async () => {
  const q = route.query.taskId;
  deepTaskId.value = Array.isArray(q) ? String(q[0] ?? '') : q != null ? String(q) : '';
  await load();
  if (deepTaskId.value) {
    await nextTick();
    document.querySelector('.tv-node.tv-hit')?.scrollIntoView?.({ block: 'center' });
  }
});
watch(autoRefresh, (v) => { if (v) load(); refresher.restart(); });
watch(intervalMs, () => refresher.restart());
</script>

<style scoped>
/* G1-C12：区块级间距落梯 --sp token（亚阶梯微调与负 margin 对齐 hack 不动） */
.tv { display: flex; flex-direction: column; gap: var(--sp-3); }
/* .tv-bar 空规则删除（lr-bar 骨架样式全局承担；类名本身在模板与
 lrBarSingleTrack 契约清单里，不可摘）。 G258：.tv-title 死规则删
 （PageHeader 合并伴漏删——G220/G227/G232 族；527「卡头位保持」裁定随页头合并失效） */
.tv-auto { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; user-select: none; }
/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.tv-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
.tv-auto span { white-space: nowrap; }

/* KPI 大卡墙退役后的 inline 统计串改用 MetaStrip 统一件——基础形态（flex/b/i/sep/mono/tone）
 全由组件承担；本页只留卡头字重回落（.card-t 650 不下渗到标签）。
 手写 .tv-meta-ksep 与插槽段 .tv-meta-kinds 随「kinds 拆 text 项进 items」退役 */
.tv-meta { font-weight: 400; letter-spacing: 0; }

/* 工具行对齐：n-select tiny(22px) 与 .btn.sm(~25px) 混排高度跳变，收敛到同一基准 */
.tv-sel :deep(.n-base-selection) { --n-height: 25px !important; height: 25px; }
.tv-sel :deep(.n-base-selection .n-base-selection-label) { height: 25px; font-size: var(--fs-xs); }

/* pane 壳（.card 三件套）退役——min-height 布局语义与 .card padding 载体
 原样迁入（14px 垂直留白为 .card 刻意值同步更新保字面；.tv-tree 负 margin 几何不变） */
.tv-tree-card { min-height: 200px; padding: 14px var(--sp-4); }
/* G1-C2：初始加载骨架（loading && 无数据），与空态/失败占位互斥 */
.tv-loading { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); }
.tv-tree { max-height: 60vh; overflow-y: auto; margin: var(--sp-1) -6px -6px; }
.tv-node {
  display: grid; grid-template-columns: minmax(260px, 1fr) minmax(220px, 2fr) auto;
  gap: var(--sp-3); align-items: center; padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px dashed var(--line);
  font-size: var(--fs-sm);
}
.tv-node:hover { background: var(--bg2); }
.tv-node:last-child { border-bottom: 0; }
.tv-node-l { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
.tv-caret { color: var(--tx2); cursor: pointer; user-select: none; width: 10px; display: inline-block; transition: transform var(--tr); font-size: var(--fs-xs); }
.tv-caret:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 2px; }
.tv-caret.open { transform: rotate(90deg); color: var(--ac-hi); }
.tv-caret.ph { visibility: hidden; }
.tv-tid { font-size: var(--fs-xs); color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex-shrink: 1; }
.tv-node-node { color: var(--tx2); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex-shrink: 2; }
.tv-node-m { min-width: 0; overflow: hidden; }
.tv-node-desc { color: var(--tx1); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
/* reindex 行内进度 chip（描述行下沿）——文字 mono+tabular 防跳动，
 进度条走 --ac 同全局进度语言；无 total 只剩文字（不出空条） */
.tv-prog { display: flex; align-items: center; gap: var(--sp-1h); margin-top: var(--sp-0); min-width: 0; }
.tv-prog-bar { width: 72px; height: 4px; border-radius: 2px; background: var(--bg2); overflow: hidden; flex-shrink: 0; }
.tv-prog-fill { display: block; height: 100%; background: var(--ac); border-radius: 2px; transition: width 400ms ease; }
.tv-prog-txt { font-size: var(--fs-2xs); color: var(--tx2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tv-node-r { display: flex; align-items: center; gap: var(--sp-2); justify-content: flex-end; }
/* 补：取消失败原因行（红字持久显示在任务行下，title 全量） */
.tv-cancel-err { color: var(--err); font-size: var(--fs-xs); padding: var(--sp-0) 0 var(--sp-1); overflow-wrap: anywhere; }
.tv-dur { font-size: var(--fs-xs); color: var(--tx2); min-width: 55px; text-align: right; }
.tv-dur.warn { color: var(--warn); font-weight: 400; }
/* job 级总耗时列（与 .tv-dur 同轨弱化展示，右缘运行时长保持主视觉） */
.tv-took { font-size: var(--fs-xs); color: var(--tx2); opacity: 0.85; min-width: 40px; text-align: right; }
/* kw 过滤输入落位（tv-kw 类锚随改用迁 input——sweep524 挂载锁同路径；
 胶囊壳归 SearchFilterBar 单源，tv-kw-wrap 只留宽高、box-sizing 对齐 tv-sel 25px 基线） */
.tv-kw-wrap { width: 200px; height: 25px; box-sizing: border-box; }
.tv-node.tv-hit { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi); }
.tv-nohit { padding: var(--sp-3); color: var(--tx2); font-size: var(--fs-sm); display: flex; align-items: center; gap: var(--sp-2); }

/* 标准断点双档（LiveDashboard/Security 同结构，修原 900 单档倒挂）：
 1100 三列（260/220/auto）在中窄视口已挤压失形，先塌单列纵向堆叠；
 900 保留为紧凑微调档（宿主 iframe 最窄 ~866px：行内边距再收一档） */
@media (max-width: 1100px) {
  .tv-node { grid-template-columns: 1fr; gap: var(--sp-1); }
}
@media (max-width: 900px) {
  .tv-node { padding: var(--sp-2); }
}
</style>
