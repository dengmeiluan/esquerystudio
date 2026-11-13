<template>
  <div class="qh">
    <!-- 模式切换器 + 历史入口：六通道一屏选对，essence 悬浮是选型指南 -->
    <div class="qh-top">
      <!-- G142：模式组补 group 语义+六钮 aria-pressed（选中态此前纯 .on 视觉） -->
      <div class="qh-modes" role="group" aria-label="查询模式" @keydown="onModesKeydown">
        <button
          v-for="m in QUERY_MODES" :key="m.k"
          class="qh-mode" :class="{ on: modeK === m.k }"
          :title="m.essence" :aria-pressed="modeK === m.k"
          @click="switchMode(m.k)"
          @contextmenu.prevent="openModeMenu($event, m)"
          @keydown="onModeKeydown($event, m)"
        >
          <component :is="ICONS[m.icon]" :size="15" class="qh-mode-ic" />
          <span class="qh-mode-tx">
            <span class="qh-mode-t">{{ m.t }}
              <!-- 版本门槛徽标改用 StatusPill y 档（warn 软底单源，outline 描边私形退役；
 qh-ver 锚类保留 + xs 档对齐原 2xs；title 语义走组件 title prop 同步更新） -->
              <StatusPill v-if="m.minVer && store.verBelow(m.minVer)" class="qh-ver xs" tone="y"
                :label="`需 ${m.minVer}+`" :title="`当前集群 ES ${store.esVersion}，此通道需要 ES ${m.minVer}+`" />
            </span>
          </span>
        </button>
      </div>
      <!-- 页头挂只读当前索引 chip（AnalysisSettingsView 范式）——本页与子模式
 静默消费 store.pickedIdx（场景任务带 idx 深链/FieldPicker 字段源），给可视锚；
 空索引时组件自身不渲染（根 v-if），零占位 -->
      <CurrentIdxChip />
      <n-popover trigger="click" placement="bottom" :show="labOpen" @update:show="(v: boolean) => (labOpen = v)">
        <template #trigger>
          <button class="btn sm ghost qh-hist" title="相关性调试：评分解释 / 排名侦探 / X 光 / 命中矩阵 / Boost / 火焰图">
            <SearchCheck :size="14" /> 相关性调试
          </button>
        </template>
        <div class="qh-labs">
          <button v-for="l in RELEVANCE_LABS" :key="l.path" class="qh-lab" @click="gotoLab(l.path)">
            <component :is="l.icon" :size="13" /> {{ l.name }}
          </button>
        </div>
      </n-popover>
      <button class="btn sm ghost qh-hist" @click="histOpen = true" title="跨模式查询历史（六通道共用，可回放）">
        <History :size="14" /> 历史
      </button>
    </div>


    <!-- 模式视图：成熟查询视图原样嵌入（自带 URL 现场/草稿防丢），切模式淡入。
 KeepAlive 保活六模式实例——切 tab 不再清空结果/交互状态（历史顽疾）；
 任务/回放预填仍靠 stamp 变 key 强制重挂载读取，:max=8 让重挂旧实例走 LRU 淘汰。
 x2 修复：这里原是 <Transition mode="out-in">——out-in 依赖 afterLeave 交接，而
 PitScrollView 是多根 fragment（.pt-page + .pt-grid），fragment 无法被动画，
 「PIT 作为离场组件」时交接死锁：入场组件永不插入、此后所有模式主体（含场景
 任务生成 DSL 的 stamp 强制重挂载）全部空白，须整页刷新才恢复。改为包裹层
 CSS 动画淡入（不参与 JS 交接，无死锁可能），淡入观感与 KeepAlive 语义不变 -->
    <div class="qh-pane">
      <!-- 场景任务条迁入 DSL 工具行（#toolbar-prepend slot，三行合一裁决）——
 场景任务生成 DSL 仅服务 dsl 模式（applyTask 强制切 dsl），随 dsl 视图工具行渲染；
 其他五模式无此 slot=安全丢弃。tasksExpanded/taskOpen 状态仍在父作用域。
 （跨 lane 热修：注释原在 KeepAlive 内部，dev 编译 comments:true 下
 KeepAlive 命中「expects exactly one child component」致开发态编译失败、
 dslAssistPenetration/fieldPickerPenetration 两 spec 0-test 挂编译错——
 注释移出 KeepAlive，生产产物零差异） -->
      <KeepAlive :max="8">
        <component :is="COMP[modeK]" :key="modeK + '#' + stamp">
          <template #toolbar-prepend>
    <!-- 场景任务条：开发者日常动作一键生成 DSL（活教材：预填后可见生成语句）。
 裁决：六枚场景钮默认收起（常驻两排挤压工作区）——「日常场景 ▾」一点展开
 整排（原输入 popover/FieldPicker 逻辑零改动），usePref 记忆展开态 -->
            <!-- 二刀（裁决「日常场景应该是下拉」）：场景任务改 popover 下拉——
 点「日常场景」弹出任务列表，不再 inline 平铺挤压工具行 -->
            <n-popover trigger="click" placement="bottom-start" :width="560">
              <template #trigger>
                <button class="qh-task qh-tasks-toggle" title="日常场景（一键生成 DSL）">
                  <Sparkles :size="12" /> 日常场景
                  <ChevronDown :size="12" />
                </button>
              </template>
              <div class="qh-tasks-pop">
                <div v-if="store.pickedIdx" class="qh-task-avail">按当前 mapping 自动匹配：{{ availCount }}/{{ roleTaskCount }} 个字段绑定场景可用</div>
                <div v-if="store.pickedIdx && recAuto.length" class="qh-task-rec">
                  <span class="qh-task-rec-hd">按当前 mapping 推荐</span>
                  <button v-for="r in recAuto" :key="'rec-' + r.task.k" type="button" class="qh-task qh-task-rec-btn"
                    :title="recTitle(r)" @click="applyTask(r.task)">{{ r.task.t }}</button>
                </div>
                <template v-for="t in QUICK_TASKS" :key="t.k">
          <div v-if="t.head" class="qh-task-sec">{{ t.head }}</div>
          <n-popover v-if="t.input" trigger="click" placement="bottom" :show="taskOpen === t.k" @update:show="(v: boolean) => (taskOpen = v ? t.k : '')">
            <template #trigger>
              <button class="qh-task" :class="{ 'qh-task-off': !taskReady(t) }" :title="taskTitle(t)" :disabled="!taskReady(t)">{{ t.t }}</button>
            </template>
            <div class="qh-task-pop">
              <div class="qh-task-scene">{{ t.scene }}</div>
              <div class="qh-task-row">
                <!-- W1 ：字段名语义任务（kind:'field'）换 FieldPicker 补全；_id 等其余任务保持纯手输。
 评审修复：:to="false" 弹层就地渲染——与 popover 内容同子树，naive clickoutside 不再误判关
 popover 导致 click 丢失；@enter 接回快捷键（Enter 三段语义：有候选 choose / 无候选或面板关 → 透发
 enter，恢复原裸 input 的 Enter 生成契约）；typeFilter 透传（recent 只出 date 字段）。
 模板字段场景 keyword 置顶（exists 存在性检查常打 keyword 业务字段；
 recent 任务 typeFilter 已锁 date，prio 不命中 = 原序零增量） -->
                <FieldPicker v-if="t.input.kind === 'field'" v-model="taskInput" :index="store.pickedIdx"
                  :placeholder="t.input.placeholder" :type-filter="t.input.typeFilter" :type-priority="['keyword']" :to="false" width="100%" class="qh-task-fp"
                  @enter="applyTask(t)" />
                <input v-else v-model="taskInput" class="inp" :placeholder="t.input.placeholder" @keyup.enter="applyTask(t)" />
                <button v-if="!t.input2" class="btn sm pri" :disabled="!taskInput.trim() || !taskReady(t)" @click="applyTask(t)"><Play :size="11" /> 生成</button>
              </div>
              <!-- 1069 续：双输入组合（主体 + 关键词）——第二行独立输入，二者都填才生成 -->
              <div v-if="t.input2" class="qh-task-row">
                <input v-model="taskInput2" class="inp" :placeholder="t.input2.placeholder" @keyup.enter="applyTask(t)" />
                <button class="btn sm pri" :disabled="!taskInput.trim() || !taskInput2.trim() || !taskReady(t)" @click="applyTask(t)"><Play :size="11" /> 生成</button>
              </div>
            </div>
          </n-popover>
          <button v-else class="qh-task" :class="{ 'qh-task-off': !taskReady(t) }" :title="taskTitle(t)" :disabled="!taskReady(t)" @click="applyTask(t)">{{ t.t }}</button>
                </template>
              </div>
            </n-popover>
          </template>
        </component>
      </KeepAlive>
    </div>

    <!-- 跨模式查询历史抽屉（六通道共用，倒序回放） -->
    <NDrawer v-model:show="histOpen" :width="histDrawerW" placement="right">      <NDrawerContent title="跨模式查询历史" closable>
        <!-- 面板合并 QueryHistoryPanel 共享件（新增过滤/复制；清空确认仍在父） -->
        <!-- 跨模式历史导入合并（store.mergeFrom 同闭环扩展至第二入口；消费即计数反馈） -->
        <input ref="importFileEl" type="file" accept=".json,application/json" style="display:none"
          aria-label="导入跨模式查询历史" @change="onImportFile" />
        <button class="btn ghost sm" style="margin-bottom:var(--sp-2)" :disabled="importing"
          title="从导出的 JSON 合并导入（同 mode+查询+索引去重）" @click="importFileEl?.click()">
          <Copy :size="12" /> 导入历史
        </button>
        <QueryHistoryPanel
          :items="histRows" :actions="['play', 'fav', 'copy', 'del']" show-mode clickable
          empty-text="暂无跨模式查询历史。在任一通道执行一次查询后，这里会按时间倒序沉淀。"
          @play="replay" @del="row => hist.removeOne(row.id)" @clear="doClearHist" @fav="favHistRow"
        />
      </NDrawerContent>
    </NDrawer>

    <!-- 六模式切换条右键：深链/默认模式/跨模式历史。全部只读动作，不改查询或集群状态。 -->
    <CellContextMenu
      v-if="modeMenu"
      :x="modeMenu.x" :y="modeMenu.y" :title="modeMenuTitle"
      :items="modeMenuItems" @close="modeMenu = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent, defineComponent, onActivated, h } from 'vue';
import { NPopover, NDrawer, NDrawerContent } from 'naive-ui';
import { useRouter } from 'vue-router';
import {
  TerminalSquare, Database, SearchCode, Beaker, Layers, ArrowLeftRight, Sparkles, Play, History, SearchCheck, ChevronDown, Copy, Pin, Link2, ShieldCheck,
} from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { RELEVANCE_LABS } from '../utils/relevanceLabs';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { describeSqlOpts } from '../utils/sqlOpts';
import { useUrlState, readHashQuery, usePref } from '../composables/urlState';
import { useQueryAccess } from '../composables/useQueryAccess';
import { askConfirm } from '../composables/confirm';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import FieldPicker from '../components/FieldPicker.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
/* 懒加载骨架的块件（QhPaneLoading 渲染函数件消费） */
import SkeletonBox from '../components/SkeletonBox.vue';
/* 页头只读当前索引 chip（静默消费 pickedIdx 的可视锚，空索引不渲染） */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：版本门槛徽标统一件 */
import { QUERY_MODES, DEFAULT_MODE, normalizeMode, QUICK_TASKS, encodeDslParam, quickTaskDsl, quickTaskAvailability, quickTaskBindingLabel, recommendQuickTasks, type QuickTask } from '../utils/queryHub';
import { useIndexFields } from '../composables/useIndexFields';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';

const store = useAppStore();
const router = useRouter();
const ICONS: Record<string, any> = { TerminalSquare, Database, SearchCode, Beaker, Layers, ArrowLeftRight };
/* 相关性实验室入口：藏在侧栏的强能力，这里给一条主入口（带当前索引上下文可直跳） */
const labOpen = ref(false);
/* 440 固定宽抽屉 ≤440px 视口溢出——94% 视口收口（ReconcileReportDrawer
 drawerW 同款），上限仍 440；视口宽走 app store 响应式单源
 （非响应式直读在嵌入容器挂载早期会读到 0 并永久缓存） */
const histDrawerW = computed(() => Math.min(440, Math.round(store.viewportW * 0.94)));
function gotoLab(path: string) {
  labOpen.value = false;
  router.push(path);
}

/* 六模式懒加载：只有点开的模式才拉 chunk（DslQueryView 928 行不拖累其他模式）。
 统一挂 loadingComponent——557 真机探针实锤「懒模式冷转换 8s 全白零反馈」，
 chunk 拉取期间 qh-pane 一片空白。骨架定高、纯 CSS shimmer、零测量链——不参与 pane
 高度链正反馈（loading 态高度稳定）；delay:200 快路径零闪烁；KeepAlive 保活的已解析
 实例切回 / stamp 强制重挂都走缓存不进 loading，骨架仅首载冷拉取出现 */
const QhPaneLoading = defineComponent({
  name: 'QhPaneLoading',
  render() {
    /* 内联 style：渲染函数件拿不到宿主 scopeId（ 守门，样式不得落 scoped 规则）；
 class 保留作测试/样式钩子锚（无对应 scoped 规则即零违规） */
    return h('div', { class: 'qh-pane-loading', style: 'display:flex;flex-direction:column;align-items:center;gap:var(--sp-3);padding:var(--sp-5) 0;' }, [
      h(SkeletonBox, { height: 128, width: 'min(560px, 92%)', round: true }),
      h('p', { class: 'qh-pane-loading-tx', style: 'margin:0;color:var(--tx2);font-size:var(--fs-sm);' }, '通道加载中…'),
    ]);
  },
});
function lazyPane(loader: () => Promise<{ default: any }>) {
  return defineAsyncComponent({ loader, loadingComponent: QhPaneLoading, delay: 200 });
}
const COMP: Record<string, any> = {
  dsl: lazyPane(() => import('./DslQueryView.vue')),
  sql: lazyPane(() => import('./SqlConsoleView.vue')),
  lucene: lazyPane(() => import('./LuceneQueryView.vue')),
  sandbox: lazyPane(() => import('./SearchSandboxView.vue')),
  pit: lazyPane(() => import('./PitScrollView.vue')),
  bridge: lazyPane(() => import('./SqlBridgeView.vue')),
};

const mode = useUrlState('mode', DEFAULT_MODE);
/* 惯用通道记忆：侧边栏裸进（无 ?mode=）时回到上次用的模式；深链指定的 mode 优先 */
const lastMode = usePref('qh.mode', DEFAULT_MODE);
/* 右键菜单「设为默认进入模式」的显式偏好；优先于 lastMode，但不随日常切换漂移 */
const pinnedMode = usePref('qh.default', '');
if (!readHashQuery().get('mode')) {
  const preferred = pinnedMode.value || lastMode.value;
  if (preferred !== mode.value) mode.value = normalizeMode(preferred);
}
const modeK = computed(() => normalizeMode(mode.value));
watch(modeK, v => { lastMode.value = v; });
/* ═══ ：模式条 ←→/Home/End roving 焦点（W3C APG， chips 同构）═══
 模式钮是原生 button，Enter/Space=切换已免费获得；←→ 只移动焦点不切换（防误切大查询页） */
function onModesKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const btns = [...((e.currentTarget as HTMLElement).querySelectorAll('.qh-mode'))] as HTMLButtonElement[];
  const i = btns.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0
    : e.key === 'End' ? btns.length - 1
    : e.key === 'ArrowLeft' ? (i - 1 + btns.length) % btns.length
    : (i + 1) % btns.length;
  btns[next]?.focus();
}
/* 场景任务写 ?dsl= 后需要重挂载才会被 DslQueryView onMounted 读取 */
const stamp = ref(0);
/* 裁决：日常场景排默认收起（常驻两排挤压工作区），展开态 usePref 记忆 */


/* 路由级 KeepAlive(App.vue 白名单)后本页切回不重挂,onMounted 的深链消费不再跑——activated 补一次:
 命令面板/收藏回放把预填落在 ?dsl= 或一次性 carry 键时,切到对应模式并 stamp++ 强制内部组件重挂读取。
 1086：回放预填不只 DSL——SQL/Lucene/沙盒/PIT 的一次性键同样要触发重挂，否则缓存页不消费、点了没反应 */
let activatedEver = false;
onActivated(() => {
  /* 首次挂载也会触发 activated——首次的深链由 onMounted 链路负责,这里必须跳过,否则双重消费(两次执行查询) */
  if (!activatedEver) { activatedEver = true; return; }
  const usp = readHashQuery();
  let next = '';
  if (usp.get('dsl') || sessionStorage.getItem('esquerystudio.dsl.carry')) next = 'dsl';
  else if (sessionStorage.getItem('esquerystudio.sql.prefill') != null) next = 'sql';
  else if (sessionStorage.getItem('esquerystudio.lucene.q') != null) next = 'lucene';
  else if (sessionStorage.getItem('esquerystudio.sandbox.body') != null || sessionStorage.getItem('ss_dsl_body') != null) next = 'sandbox';
  else if (sessionStorage.getItem('esquerystudio.pit.filter') != null || sessionStorage.getItem('esquerystudio.pit.prefill') != null) next = 'pit';
  if (next) {
    mode.value = next;
    stamp.value++;
  }
});

function switchMode(k: string) {
  if (k !== modeK.value) mode.value = k;
}

/* ═══ 模式切换条右键：深链 / 默认模式 / 历史（全部只读，不改查询或集群状态） ═══ */
const modeMenu = ref<{ x: number; y: number; m: any } | null>(null);
const { env: currentEnv, role: currentRole, accessLabel, summary: accessSummary } = useQueryAccess();
const modeMenuTitle = computed(() => {
  const mm = modeMenu.value;
  if (!mm) return '';
  return ['查询模式 · ' + mm.m.t, currentEnv.value, currentRole.value, accessLabel.value].filter(Boolean).join(' · ');
});
function openModeMenu(e: MouseEvent, m: any) {
  modeMenu.value = { x: e.clientX, y: e.clientY, m };
}
/* 键盘等价：ContextMenu 键 / Shift+F10 在模式钮上打开同一菜单 */
function onModeKeydown(e: KeyboardEvent, m: any) {
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  modeMenu.value = { x: r.left + 8, y: r.bottom + 4, m };
}
const modeMenuItems = computed<CcmItem[]>(() => {
  const mm = modeMenu.value;
  if (!mm) return [];
  const m = mm.m;
  const items: CcmItem[] = [];
  if (m.k !== modeK.value) {
    items.push({ key: 'mode-switch', label: `切换到「${m.t}」`, icon: ICONS[m.icon], run: () => switchMode(m.k) });
  }
  items.push({ key: 'mode-link', label: '复制此模式深链', icon: Link2, run: () => copyModeLink(m) });
  items.push({
    key: 'mode-default',
    label: pinnedMode.value === m.k ? '清除默认进入模式' : '设为默认进入模式',
    icon: Pin,
    run: () => toggleDefaultMode(m),
  });
  items.push({
    key: 'mode-access',
    label: '复制当前查询权限摘要',
    icon: ShieldCheck,
    run: () => copyAccessSummary(m),
  });
  items.push({ key: 'mode-history', label: '打开跨模式查询历史', icon: History, sep: true, run: () => { histOpen.value = true; } });
  return items;
});
async function copyModeLink(m: any) {
  const rawHash = window.location.hash || '#/';
  const [base, qs = ''] = rawHash.split('?');
  const q = new URLSearchParams(qs);
  q.set('mode', m.k);
  const url = window.location.origin + window.location.pathname + base + '?' + q.toString();
  const ok = await copyText(url);
  store.notify(ok ? 'success' : 'error', ok ? `已复制「${m.t}」深链` : '复制失败：浏览器拦截了剪贴板');
}
function toggleDefaultMode(m: any) {
  const next = pinnedMode.value === m.k ? '' : m.k;
  pinnedMode.value = next;
  store.notify('success', next ? `默认进入模式已设为「${m.t}」` : '已清除默认进入模式，恢复按上次使用');
}
/* 支持工单用：把当前目标/环境/角色/查询读写能力复制成一行，不触发任何服务端写。 */
async function copyAccessSummary(m: any) {
  const summary = accessSummary.value + ' mode=' + m.k;
  const ok = await copyText(summary);
  store.notify(ok ? 'success' : 'error', ok ? '权限摘要已复制' : '复制失败：浏览器拦截了剪贴板');
}

const taskOpen = ref('');
const taskInput = ref('');
const taskInput2 = ref('');
/* 换一个任务弹窗时清掉上个任务的输入残留（字段名不会撞上文档 _id） */
watch(taskOpen, () => { taskInput.value = ''; taskInput2.value = ''; });

function applyTask(t: QuickTask) {
  return applyTaskAsync(t);
}
/* 1062：生产场景先按 mapping 角色解析字段；缺字段明确拒绝，不在编辑器里留假字段 */
const taskFields = useIndexFields(() => store.pickedIdx || '');
/* 1069 续：按当前 mapping 角色自动判断场景可用性（开源通用：不认业务字段名）——
   缺字段的任务预禁用并说明缺什么，不再等用户点下去才报错。 */
watch(() => store.pickedIdx, (idx) => { if (idx) void taskFields.ensure(); }, { immediate: true });
const taskAvail = computed(() => new Map(QUICK_TASKS.map(t => [t.k, quickTaskAvailability(t, taskFields.fields.value)])));
const roleTaskCount = computed(() => QUICK_TASKS.filter(t => t.autoRole || t.autoRoles?.length).length);
const availCount = computed(() => QUICK_TASKS.filter(t => (t.autoRole || t.autoRoles?.length) && taskAvail.value.get(t.k)?.available).length);
/* 1069 续：自动推荐（无输入、角色齐全、覆盖多者优先）——不改变完整目录顺序 */
const recAuto = computed(() => recommendQuickTasks(taskFields.fields.value, 3));
function recTitle(r: { task: QuickTask }) {
  const bind = quickTaskBindingLabel(r.task, taskFields.fields.value);
  return bind ? `${r.task.scene} · ${bind.startsWith('缺：') ? '当前索引' + bind : '自动绑定：' + bind}` : r.task.scene;
}
function taskReady(t: QuickTask) { return taskAvail.value.get(t.k)?.available !== false; }
function taskTitle(t: QuickTask) {
  const bind = quickTaskBindingLabel(t, taskFields.fields.value);
  return bind ? `${t.scene} · ${bind.startsWith('缺：') ? '当前索引' + bind : '自动绑定：' + bind}` : t.scene;
}
async function applyTaskAsync(t: QuickTask) {
  const input = taskInput.value.trim();
  const input2 = taskInput2.value.trim();
  /* 反馈链路补口：Generate 钮在空输入时 disabled，但 Enter 路径（裸 input keyup.enter /
 FieldPicker @enter）会静默 return——补一条 warn 提示，弹窗不再"点了没反应" */
  if (t.input && !input) {
    store.notify('warning', '「' + t.t + '」需要先填写输入（' + t.input.placeholder + '）再生成');
    return;
  }
  if (t.input2 && !input2) {
    store.notify('warning', '「' + t.t + '」需要先填写第二项输入（' + t.input2.placeholder + '）再生成');
    return;
  }
  let dsl = '';
  let bound = '';
  if (t.autoRole || t.autoRoles?.length) {
    if (!store.pickedIdx) {
      store.notify('warning', `「${t.t}」需要先选择索引（按 mapping 自动绑定字段）`);
      return;
    }
    try { await taskFields.ensure(); } catch { /* 字段源失败：按缺角色处理 */ }
    const r = quickTaskDsl(t, input, taskFields.fields.value, input2);
    if (!r.dsl) {
      store.notify('warning', `当前索引缺少${r.missing}，无法生成「${t.t}」——请换含该字段的索引，或在编辑器手写`);
      return;
    }
    dsl = r.dsl;
    bound = quickTaskBindingLabel(t, taskFields.fields.value);
  } else {
    dsl = t.build(input, undefined, undefined, input2);
  }
  /* 先落 ?dsl=（分享契约同 DslQueryView），再切 dsl 模式重挂载读取 */
  const usp = readHashQuery();
  usp.set('dsl', encodeDslParam(dsl));
  if (store.pickedIdx) usp.set('idx', store.pickedIdx);
  usp.set('mode', 'dsl');
  history.replaceState(null, '', (location.hash.split('?')[0] || '#/search') + '?' + usp.toString());
  mode.value = 'dsl';
  stamp.value++;
  taskOpen.value = '';
  taskInput.value = '';
  taskInput2.value = '';
  store.notify('success', `已按「${t.t}」生成 DSL${bound ? ' · 绑定 ' + bound : ''}，看看语句就学会了`, { duration: 4000 });
}

/* ═══ ：跨模式查询历史抽屉 ═══ */
const hist = useQueryHistoryStore();
const histOpen = ref(false);
/* 1091：SQL 行在抽屉里显示执行上下文摘要（时区/取数/列式等），点开前就知道会以什么选项回放 */
const histRows = computed(() => hist.items.map(i => {
  if (i.mode !== 'sql') return i;
  const sub = describeSqlOpts(i.opts);
  return sub ? { ...i, sub } : i;
}));

/** 回放：复用各视图既有预填/深链通道（与 favReplay 同源契约），不新造 */
function replay(it: { mode?: string; query: string; index?: string; params?: string; opts?: Record<string, unknown> }) {
  histOpen.value = false;
  const m = it.mode;
  if (!m) return; // 无模式标记的历史条目无法跨模式回放（ HistRow 口径）
  const idx = it.index || '';
  /* 1071：参数快照只对 sql 回放有效——先清旧键，任何非 SQL 回放都不会把上一条
     SQL 的参数偷偷带进后续进页的 SQL 草稿。 */
  removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params');
  if (m === 'dsl') {
    writeStoredRaw(sessionStorage, 'esquerystudio.dsl.carry', it.query);
    if (idx) writeStoredRaw(sessionStorage, 'esquerystudio.dsl.carry.index', idx);
  } else if (m === 'sql') {
    writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill', it.query);
    /* 1071：参数化 SQL 的参数快照随文本回放（缺参数会直接执行失败/语义错位） */
    if (it.params) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params', it.params);
    /* 1089：执行选项随历史回放（时区/页超时/列式/宽容/取数） */
    removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.opts');
    if (it.opts) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.opts', JSON.stringify(it.opts));
    /* SQL 回放补索引上下文跟随（dsl/lucene/sandbox/pit 分支同款）——
 否则原在索引 A 执行的 SQL 会在当前选中索引上回放，上下文错配 */
    if (idx) store.pick(idx);
  } else if (m === 'lucene') {
    writeStoredRaw(sessionStorage, 'esquerystudio.lucene.q', it.query);
    if (idx) writeStoredRaw(sessionStorage, 'esquerystudio.lucene.index', idx);
  } else if (m === 'sandbox') {
    writeStoredRaw(sessionStorage, 'ss_dsl_body', it.query);
    if (idx) store.pick(idx);
  } else if (m === 'pit') {
    /* PIT 回放补 filter/sort 预填——queryHistory 条目形状扩展（store 文件）不在
 文件清单，降级 sessionStorage 直传：filter 用历史条目原文（准确）；sort/order 用
 pit 执行时写的 esquerystudio.pit.carry 快照转运为 esquerystudio.pit.prefill（仅本次回放消费，
 PitScrollView onMounted 读走即删，普通重挂载不误吃）；无快照时退化为只带 filter（此前现状） */
    writeStoredRaw(sessionStorage, 'esquerystudio.pit.filter', it.query || '');
    const carry = sessionStorage.getItem('esquerystudio.pit.carry');
    if (carry) writeStoredRaw(sessionStorage, 'esquerystudio.pit.prefill', carry);
    if (idx) store.pick(idx);
  } else if (m === 'template') {
    /* W-B（q 遗留）：template 通道回放=跨页跳搜索模板中心——template 不是
 QueryHub 六模式之一（QUERY_MODES 无此键，mode.value 赋它会被 normalizeMode 静默回落
 dsl 且污染 URL），故照 dsl.carry 同款 sessionStorage 一次性通道 + router.push 跨页，
 送达后立即 return（不入下方 mode 切换）。
 送达目的地=SearchTemplatesView 的 source 草稿（接收端 onMounted 消费 esquerystudio.
 search-templates.carry 即删）；条目 query= push 的 rendered||source 快照，
 模板源快照/渲染产物双形态由页内既有防呆承担（占位符参数表单+run() 参数防呆），
 这里只管如实送达——与 favReplay bulk.carry/ubq.carry 跨页 carry 同构。 */
    writeStoredRaw(sessionStorage, 'esquerystudio.search-templates.carry', it.query || '');
    if (idx) store.pick(idx); /* 执行上下文跟随（sql/sandbox/pit 分支同款），进页 useIdxState(follow) 接住 */
    router.push('/search-templates');
    store.notify('success', '模板查询已送到搜索模板中心的源草稿');
    return;
  }
  mode.value = m;
  stamp.value++; // 同模式回放也强制重挂载以读取预填
}

/* 跨模式历史导入合并（store.mergeFrom 同闭环，双入口均可带历史走） */
const importFileEl = ref<HTMLInputElement | null>(null);
const importing = ref(false);
async function onImportFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f || importing.value) return;
  importing.value = true;
  try {
    const list = JSON.parse(await f.text());
    const r = hist.mergeFrom(list);
    store.notify(r.added ? 'success' : 'info', `导入完成：新增 ${r.added} 条，跳过重复/无效 ${r.skipped} 条`);
  } catch (err: any) {
    store.notify('error', '导入失败：' + String(err?.message ?? err).slice(0, 100));
  } finally { importing.value = false; }
}

async function doClearHist() {
  const ok = await askConfirm({
    title: '清空跨模式查询历史',
    message: '将删除全部通道的查询历史记录（含已迁移的旧 DSL 历史），此操作不可撤销。',
    level: 'warn',
    okText: '清空',
  });
  if (!ok) return;
  hist.clear();
  histOpen.value = false;
}

/* 历史行一键转收藏（DSL 保存搜索语义；面板星标行级门只对无 mode / mode='dsl' 行出钮）。
 本页无命名弹窗，沿 doClearHist 的确认外链思路直写 DslQueryView「保存的搜索」存储 es_query_saved
 （条目形状 {dsl,ts,idx,name} 与 DslQueryView HistItem 同构兼容）；读侧 try+Array.isArray 容错
 （DevToolsView histAllRead 先例）；同名已存跳过——confirmSave 的覆盖确认是 DslQueryView 页内链，
 这里不越权静默覆盖。 */
function favHistRow(it: { mode?: string; query: string; index?: string; ts?: number }) {
  if ((it.mode && it.mode !== 'dsl') || !it.query) return;
  let saved: { name?: string; dsl: string; ts: number; idx?: string; layout?: unknown }[] = [];
  try {
    const r = JSON.parse(localStorage.getItem('es_query_saved') || '[]');
    if (Array.isArray(r)) saved = r;
  } catch { /* 坏值按空处理 */ }
  const name = '收藏 ' + new Date(it.ts ?? Date.now()).toLocaleString('zh-CN', { hour12: false });
  if (saved.some(s => s.name === name)) { store.notify('info', '同名收藏已存在，未重复写入'); return; }
  saved.unshift({ dsl: it.query, ts: it.ts ?? Date.now(), idx: it.index, name });
  try {
    writeStoredRaw(localStorage, 'es_query_saved', JSON.stringify(saved));
    store.notify('success', '已转收藏（保存的搜索）——到查询工作台 DSL 页「保存的搜索」查看');
  } catch {
    store.notify('error', '收藏写入失败（本地存储空间不足）');
  }
}
</script>

<style scoped>
.qh { display: flex; flex-direction: column; gap: var(--sp-1h); }

/* 六模式冷拉取骨架样式已内联进 QhPaneLoading 渲染函数（ 守门：渲染函数件
 拿不到宿主 scopeId，纯 scoped 规则匹配不到）——SkeletonBox 定高块+一行弱文，拉取期高度恒定 */

/* 顶栏：模式切换器 + 历史入口。：补 flex-wrap（900 档单列化兜窄档，
 档位之间 900-1100 一带窄容器允许 chip/入口钮换行，不再硬挤单行）。
 1023：页头行冻结（Excel 冻结窗格语义）——集群/索引上下文（模式胶囊 + 当前索引 chip）
 长页滚动时恒悬可视区顶，翻到结果深处仍知道「在哪个索引上查」。sticky 生效前提：
 父 .qh 贯穿整页高度 ✓；实底 + 横向负边距拉满 .page 内容宽防内容从缝隙滚过；
 z-index 压内容、让位弹层（float-pop 层级更高） */
.qh-top {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: flex-start; gap: var(--sp-2); flex-wrap: wrap;
  margin: calc(-1 * var(--sp-1h)) calc(-1 * var(--sp-5)) 0;
  padding: var(--sp-1h) var(--sp-5) var(--sp-2);
  background: var(--bg0);
}
.qh-top .qh-modes { flex: 1; }
.qh-hist { flex-shrink: 0; }
.qh-labs { display: flex; flex-direction: column; min-width: 160px; padding: var(--sp-1); }
.qh-lab { display: flex; align-items: center; gap: var(--sp-2); padding: 7px var(--sp-2h); border: 0; border-radius: var(--r-s); background: transparent; color: var(--tx1); font-size: var(--fs-sm); cursor: pointer; text-align: left; }
.qh-lab:hover { background: var(--bg2); color: var(--tx0); }

/* 模式切换器：卡片化分段，essence 副行帮 1 秒选型。
 20260920 二轮收敛（实报「顶上块区设计一般」）：卡片双行(图标+名+essence 副行)
 → 紧凑单行(图标+名)，占高减半、五卡并排不换行；essence 收进 title 悬浮 */
.qh-modes { display: flex; gap: var(--sp-1h); flex-wrap: wrap; }
.qh-mode {
  display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-1) var(--sp-2h); cursor: pointer; /* ：原裸刻值精确等值合并 --sp 档 */
  background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s);
  color: var(--tx2); text-align: left; position: relative;
  transition: border-color var(--tr), background var(--tr);
}
.qh-mode:hover { border-color: var(--ac-line); color: var(--tx1); }
.qh-mode:active { transform: scale(.97); }
.qh-mode.on {
  background: var(--ac-soft); border-color: var(--ac-hi); color: var(--tx1);
  box-shadow: 0 1px 6px -2px var(--ac-line);
}
.qh-mode.on::after {
  content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px;
  border-radius: 2px 2px 0 0; background: var(--ac-hi);
}
.qh-mode.on .qh-mode-ic { color: var(--ac-hi); }
.qh-mode-tx { display: flex; flex-direction: column; line-height: 1.35; }
/* 语义分层：主标题走文字档（tx1，选中/悬停提亮 tx0 + 650 字重）——此前标题随容器吃
 tx2、选中后仅 tx1，与主标题同阶弱化 */
.qh-mode-t { font-size: var(--fs-sm); font-weight: 600; display: flex; align-items: center; gap: 5px; color: var(--tx1); }
.qh-mode:hover .qh-mode-t, .qh-mode.on .qh-mode-t { color: var(--tx0); }
.qh-mode.on .qh-mode-t { font-weight: 650; }
/* G141：essence 副行死渲染与死样式退役（紧凑单行收敛后残留隐藏空壳）——
 选型文案此前注释宣称走模式钮 title 悬浮但从未接线，补悬浮通道可达（帮用户 1 秒选对通道） */
/* .qh-ver 私造皮（outline 描边胶囊 + warn 手配色）随改用 StatusPill y 档退役——
 软底/描边/字号归 .pill 单源（.pill.xs 对齐原 2xs）；类名保留作锚 */

/* 场景任务条 */
/* G140：场景条旧壳三组死样式退役（迁入 DSL 工具行后残留，DOM 零引用；
 活锚=日常场景展开钮与任务弹层容器）。「迁入工具行后不被 flex 压缩」的语义随旧壳一并退役 */
/* 20260920：场景排默认收起，toggle 钮即展开/收起开关（虚线描边暗示「可展开的抽屉」而非普通动作钮） */
.qh-tasks-toggle { border: 1px dashed var(--border); background: transparent; }
.qh-task {
  font-size: var(--fs-xs); padding: 3px var(--sp-2h); cursor: pointer; border-radius: var(--r-s);
  background: transparent; border: 1px solid var(--line); color: var(--tx1);
  transition: border-color var(--tr), background var(--tr), color var(--tr);
}
.qh-task:hover { border-color: var(--ac-line); background: var(--ac-soft); color: var(--ac); }
/* 1062：场景弹层分组——生产场景独占一行标签，任务钮等距换行 */
.qh-tasks-pop { display: flex; flex-wrap: wrap; gap: var(--sp-1h); align-items: center; }
.qh-task-sec { flex-basis: 100%; margin-top: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); }
.qh-task-avail { font-size: var(--fs-2xs); color: var(--tx2); padding-bottom: var(--sp-1h); }
.qh-task-rec { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-1h); padding-bottom: var(--sp-1h); border-bottom: 1px solid var(--line); }
.qh-task-rec-hd { font-size: var(--fs-2xs); color: var(--ac-hi); }
.qh-task-rec-btn { border-color: var(--ac-line); color: var(--ac-hi); background: var(--ac-soft); }
.qh-task-off { opacity: .45; cursor: not-allowed; }
.qh-task-pop { display: flex; flex-direction: column; gap: var(--sp-2); width: 280px; }
.qh-task-scene { font-size: var(--fs-xs); color: var(--tx2); }
.qh-task-row { display: flex; gap: var(--sp-1h); }
.qh-task-row .inp { flex: 1; }
.qh-task-fp { flex: 1; min-width: 0; }

/* 模式视图面板：flex+gap 与 .qh 同构——fragment 视图（PIT 多根）在面板内保持
 原有的逐根 10px（--sp-2h）间距；min-width:0 防 DslQueryView 编辑器把面板撑出视口。
 淡入用 CSS 动画：子元素每次（重）插入 DOM 自动重放（KeepAlive 复活/stamp 重挂载都触发） */
/* 1439：.qh 撑满 .page 内容盒——「顶满当前页」收起构建区后，页面会缩到内容高
   （实测 687px），结果区仍停在 505px 下限，白空 177px 表格不涨。
   1339 曾试过同一句并回退：当时 RT 没有 fill，多出来的高度只会把 .dq-result 的
   下限顶大、表格仍是内容高；现在结果表有 fill（表体在 rt-wrap 内滚），
   多出来的高度会真正落到表格行数上，前提已变。 */
.qh:has(.dq-fill) { height: 100%; min-height: 0; }
/* 光把 .qh 撑满不够：.qh-pane 是 flex 项但 basis 为 auto，仍取内容高。
   让它吃满 .qh 剩余高度后，.dq 的 height:100% 仍解析不出来——父高来自 min-height
   而非确定高度，百分比高度退化为 auto（实测 267px）。改成 flex 填满，不靠百分比。 */
.qh:has(.dq-fill) > .qh-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.qh:has(.dq-fill) > .qh-pane > .dq.dq-fill { flex: 1 1 auto; min-height: 0; height: auto; }
.qh-pane { display: flex; flex-direction: column; gap: var(--sp-2h); min-width: 0; }
.qh-pane > :deep(*) { animation: qh-fade-in var(--tr) ease; }
@keyframes qh-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* 900 窄档（ 口径；本页此前零 @media）——顶栏单列化：模式切换卡
 铺满行宽、两个入口钮换行到下一行；场景任务弹层钳宽防窄视口溢出（drawerW 同 94% 口径） */
@media (max-width: 900px) {
  .qh-top { flex-direction: column; }
  .qh-top .qh-hist { flex-shrink: 1; }
  .qh-task-pop { width: min(280px, 94vw); }
}

/* 跨模式查询历史抽屉 */
</style>
