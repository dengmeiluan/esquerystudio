<template>
  <!-- alt 三视图体共享件（DslQuery 与 IndexHub 的 docs/query 视图共用，
 接入范围覆盖查询工作台与索引工作区两域）。
 契约=三处现役绑定的最小集：view=json 渲染高亮 pretty pre（preEl expose 供宿主
 jsonFind 定位链 querySelector/scrollTop）；view=tree 渲染 JsonTree tools 档；
 view=cards 渲染卡片行（前 5 字段+42 截断，@open-doc 交宿主开文档）。
 包裹 div（视图容器类/高度 cap 变量）留在宿主——高度链与视图分档 v-show 归宿主管。 -->
  <!-- json：高亮 pretty 信封只读（v-html 由宿主 markHtmlAll 链产出；类名 json-view=theme 全局档）
   点击文档块（j-doc-block）→ open-doc-at(idx)：宿主映射回 SearchHit 走 openDoc 抽屉；
   拖选文本/双击选词回归原生（拖选松手与双击不再触发打开/编辑） -->
  <template v-if="view === 'json'">
    <!-- 文档导航条前置：滚动容器里内容先行会把导航条沉底（长结果滚不到底），
     顶部常驻才是可达的遍历/直达入口 -->
    <div v-if="docCount" class="ah-docnav">
      <span class="ah-docnav-lb">文档</span>
      <button type="button" class="ah-nav-btn" title="上一条文档" :disabled="docCursor <= 0" @click="docCursor = Math.max(0, docCursor - 1)">‹</button>
      <!-- _id 直达下拉（914 续）：按 id 精确选择（与卡片 kw 快滤同效），选中即当前遍历位 -->
      <select v-model.number="docCursor" class="ah-docnav-sel mono" :title="docIdList[docCursor] || ''" aria-label="选择文档（按 _id）">
        <option v-for="(d, i) in docIdList" :key="i" :value="i">{{ d || '#' + (i + 1) }}</option>
      </select>
      <button type="button" class="ah-nav-btn" title="下一条文档" :disabled="docCursor >= docCount - 1" @click="docCursor = Math.min(docCount - 1, docCursor + 1)">›</button>
      <button type="button" class="ah-nav-open" @click="emit('open-doc-at', docCursor)">打开文档</button>
      <button v-if="editable" type="button" class="ah-nav-open ah-nav-edit" title="打开该文档并直接进入编辑（Monaco 编辑 raw JSON 后保存）" @click="emit('edit-doc-at', docCursor)">编辑文档</button>
    </div>
    <pre v-if="view === 'json'" ref="preEl" class="json-view" v-html="perDoc ? (docHtml || '') : jsonHtml" @mousedown="onPreDown" @click="onPreClick" @dblclick="onPreDblClick"></pre>
  </template>
  <!-- tree：文档导航条前置（同 json 档）+ JsonTree 统一件 tools 档（DQ 旧体逐字平移）；
   渲染数据直达：单击文档行/该文档 _id 行=打开（拖选松手不触发）；
   「编辑文档」钮（editable）走导航条同一 edit-doc-at 通道——双击=选词原生手势 -->
  <template v-else-if="view === 'tree'">
    <div v-if="docCount" class="ah-docnav">
      <span class="ah-docnav-lb">文档</span>
      <button type="button" class="ah-nav-btn" title="上一条文档" :disabled="docCursor <= 0" @click="docCursor = Math.max(0, docCursor - 1)">‹</button>
      <select v-model.number="docCursor" class="ah-docnav-sel mono" :title="docIdList[docCursor] || ''" aria-label="选择文档（按 _id）">
        <option v-for="(d, i) in docIdList" :key="i" :value="i">{{ d || '#' + (i + 1) }}</option>
      </select>
      <button type="button" class="ah-nav-btn" title="下一条文档" :disabled="docCursor >= docCount - 1" @click="docCursor = Math.min(docCount - 1, docCursor + 1)">›</button>
      <button type="button" class="ah-nav-open" @click="emit('open-doc-at', docCursor)">打开文档</button>
      <button v-if="editable" type="button" class="ah-nav-open ah-nav-edit" title="打开该文档并直接进入编辑（Monaco 编辑 raw JSON 后保存）" @click="emit('edit-doc-at', docCursor)">编辑文档</button>
    </div>
    <div class="ah-tree-body" ref="treeEl" @mousedown="onTreeDown" @click="onTreeClick" @dblclick="onTreeDblClick">
      <JsonTree :data="perDoc ? (docData ?? []) : treeData" tools />
    </div>
  </template>
  <!-- cards：卡片行（DQ 旧体逐字平移——_id 行 + 前 5 字段行 + 42 截断；单击点开文档，
   拖选字段值松手不触发；键盘 Enter/Space 直开） -->
  <template v-else-if="view === 'cards'">
    <div v-for="h in hits" :key="h._id" class="dq-card" @mousedown="onCardDown" @click="onCardClick($event, h)" @dblclick="onCardDblClick" role="button" tabindex="0" @contextmenu.prevent="openCardMenu($event, h)" @keydown="onCardKey($event, h)" data-row-nav @keydown.self="rowArrowNav">
      <div class="dq-card-id mono" :title="h._id">{{ h._id }}</div>
      <div v-for="f in Object.keys(h._source).slice(0, 5)" :key="f" class="dq-card-row">
        <span class="dq-card-k mono" :title="f">{{ f }}</span>
        <span class="dq-card-v mono" :title="String(h._source[f])">{{ trunc(h._source[f], 42) }}</span>
      </div>
    </div>
  </template>
  <CellContextMenu v-if="cardMenu" :x="cardMenu.x" :y="cardMenu.y" :title="cardMenuTitle"
    :items="cardMenuItems" @close="cardMenu = null" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getActivePinia } from 'pinia';
import { Copy, Braces, ExternalLink } from 'lucide-vue-next';
import JsonTree from './JsonTree.vue';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';
import { trunc, copyText } from '../utils/format';
import { useAppStore } from '../stores/app';
import { createPressGuard, isKeyboardClick } from '../utils/pressGuard';
import { rowArrowNav } from '../utils/rowNav';
import type { SearchHit } from '../types';

const props = defineProps<{
  /** 渲染形态：json / tree / cards（调用方按自身视图档各挂一件） */
  view: 'json' | 'tree' | 'cards';
  /** json 形态：高亮 pretty HTML（宿主 markHtmlAll/respMark 链产出） */
  jsonHtml?: string;
  /** tree 形态：JsonTree data（DQ=jqResult 回退行集；IH 同构=行集） */
  treeData?: unknown;
  /** cards 形态：卡片行集（DQ 传 cardHits 快滤集；kw 过滤留在宿主） */
  hits?: SearchHit[];
  /** json/tree 档的文档总数（>0 时渲染导航条；cards 档点击即达不需要） */
  docCount?: number;
  /** json/tree 档的 _id 列表（与 docCount 同序；导航条下拉直达的选项源，缺省回落序号） */
  docIds?: string[];
  /** 单文档渲染档：json/tree 只渲染当前文档（docHtml/docData），导航游标受控；
   * 大结果集不再一次铺全部文档（100×百列切档会阻塞主线程数秒） */
  perDoc?: boolean;
  /** perDoc 档当前文档的高亮 pretty HTML */
  docHtml?: string;
  /** perDoc 档当前文档的树数据（单元素数组，保持 JsonTree 文档序契约） */
  docData?: unknown;
  /** perDoc 档受控游标（v-model:doc-index；缺省走组件内存态） */
  docIndex?: number;
  /** 「编辑文档」钮开关：仅宿主接线了 edit-doc-at 时开启；
   * 缺省关=无编辑链的宿主不渲染该钮（能力如实呈现，不留点了没反应的死钮）。
   * 编辑只走显式通道（导航条钮+抽屉内编辑链）；渲染面双击=选词原生手势 */
  editable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-doc', hit: SearchHit): void;
  /** json/tree 档文档导航条的「打开」：携带当前遍历下标，宿主映射回 SearchHit 走同一 openDoc 抽屉 */
  (e: 'open-doc-at', idx: number): void;
  /** 「编辑文档」直达：打开该文档并直接进入编辑模式（宿主 openDoc(hit, true)） */
  (e: 'edit-doc-at', idx: number): void;
  /** perDoc 受控游标变更（v-model:doc-index / @update:doc-index） */
  (e: 'update:doc-index', idx: number): void;
}>();

/* 手势仲裁：渲染面是文本阅读面——拖选文本、双击选词是主手势。
 拖选松手的 click 不当作单击；单击开抽屉经延迟仲裁（双击第二击到达即取消）；
 双击直达编辑退役：双击必然先选词，两手势不可调和——编辑走导航条「编辑文档」钮
 与打开抽屉后的编辑链两条显式通道。 */
const guard = createPressGuard();

/* json/tree 文档导航游标：perDoc 受控（v-model:doc-index），缺省组件内存态 */
const internalDocCursor = ref(0);
const docCursor = computed<number>({
  get: () => props.docIndex ?? internalDocCursor.value,
  set: (v) => {
    const n = Number(v) || 0;
    if (props.docIndex !== undefined) emit('update:doc-index', n);
    else internalDocCursor.value = n;
  },
});
/* 下拉选项源：docIds 缺席/长度不齐时回落序号占位（与 docCount 对齐） */
const docIdList = computed(() => {
  const n = props.docCount || 0;
  const ids = props.docIds;
  return Array.from({ length: n }, (_, i) => (ids && ids[i]) || '#' + (i + 1));
});
/* json 档点击委托：文档块（j-doc-block）→ open-doc-at(块序)——宿主映射回 SearchHit。
 哨兵由宿主 jsonViewHtml 在 pretty 文本期注入（markHtmlAll 文本分轨保留、后转 span）。
 拖选守卫+延迟仲裁见 guard 注释；双击只取消待发单击（选词回归原生） */
function onPreDown(e: MouseEvent) { guard.down(e); }
function onPreClick(e: MouseEvent) {
  /* perDoc：pre 内只有当前文档，没有文档块哨兵——单击即开当前文档 */
  if (props.perDoc) {
    if (isKeyboardClick(e)) { openAt(0); return; }
    if (guard.moved(e)) return;
    guard.single(() => openAt(0));
    return;
  }
  const t = (e.target as HTMLElement).closest('[data-doc-i]');
  if (!t) return;
  const i = Number(t.getAttribute('data-doc-i'));
  if (!Number.isFinite(i)) return;
  if (isKeyboardClick(e)) { openAt(i); return; }
  if (guard.moved(e)) return;
  guard.single(() => openAt(i));
}
function onPreDblClick() { guard.cancelPending(); }
function openAt(i: number) {
  /* perDoc 的块序恒 0，真实文档序由导航游标持有 */
  const idx = props.perDoc ? docCursor.value : i;
  docCursor.value = idx;
  emit('open-doc-at', idx);
}

/* tree 档渲染数据直达：点击行 data-jid 的首段=文档序（JsonTree 先序 DFS 与行集同序），
 首层文档行（jid=`N`）与该文档 `_id` 行（jid=`N._id`）作为触达锚；折叠箭头/预览的
 点击是展开语义不参与。单击=打开、双击（editable）=直达编辑，游标同步导航条 */
function treeDocIndexOf(e: MouseEvent): number {
  const row = (e.target as HTMLElement).closest('.jrow');
  if (!row) return -1;
  const m = /^(\d+)(?:\._id)?$/.exec(row.getAttribute('data-jid') || '');
  if (!m) return -1;
  /* perDoc：树里只有当前文档（局部序 0），打开语义指向导航游标 */
  if (props.perDoc) return docCursor.value;
  const i = Number(m[1]);
  return i >= 0 && i < (props.docCount || 0) ? i : -1;
}
function onTreeDown(e: MouseEvent) { guard.down(e); }
function onTreeClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.jarr, .j-prev')) return;
  const i = treeDocIndexOf(e);
  if (i < 0) return;
  if (isKeyboardClick(e) || !guard.moved(e)) guard.single(() => openAt(i));
}
function onTreeDblClick() { guard.cancelPending(); }

/* cards 档：同 json/tree 的手势仲裁——键盘 Enter/Space 直开（不经守卫，模板直发） */
function onCardDown(e: MouseEvent) { guard.down(e); }
function onCardClick(e: MouseEvent, h: SearchHit) {
  if (guard.moved(e)) return;
  guard.single(() => emit('open-doc', h));
}
function onCardDblClick() { guard.cancelPending(); }

/* 卡片行右键/菜单键：打开文档 + 复制 _id/文档 JSON/_source——只读本地。 */
const activePinia = getActivePinia();
const store = activePinia ? useAppStore(activePinia) : null;
const cardMenu = ref<{ x: number; y: number; h: SearchHit } | null>(null);
const cardMenuTitle = computed(() => (cardMenu.value ? `文档 · ${cardMenu.value.h._id}` : ''));
const cardMenuItems = computed<CcmItem[]>(() => {
  const m = cardMenu.value;
  if (!m) return [];
  const h = m.h;
  return [
    { key: 'card-open', label: '打开文档', icon: ExternalLink, run: () => emit('open-doc', h) },
    {
      key: 'card-copy', label: '复制…', icon: Copy, children: [
        { key: 'card-copy-id', label: '复制 _id', icon: Copy, run: () => copyCard(String(h._id ?? ''), '_id') },
        { key: 'card-copy-doc', label: '复制文档 JSON', icon: Braces, run: () => copyCard(JSON.stringify({ _id: h._id, ...(h._source ?? {}) }, null, 2), '文档 JSON') },
        { key: 'card-copy-src', label: '复制 _source', icon: Braces, run: () => copyCard(JSON.stringify(h._source ?? {}, null, 2), '_source') },
      ],
    },
  ];
});
function copyCard(text: string, label: string) {
  void copyText(text).then(ok => store?.notify(ok ? 'success' : 'error', ok ? `已复制${label}` : '复制失败'));
}
function openCardMenu(e: MouseEvent, h: SearchHit) {
  cardMenu.value = { x: e.clientX, y: e.clientY, h };
}
function onCardKey(e: KeyboardEvent, h: SearchHit) {
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    cardMenu.value = { x: r.left + 12, y: r.bottom, h };
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('open-doc', h);
  }
}

/* 根元素出口：宿主的滚动容器是包裹层（.dq-json-wrap/.ih-json-wrap/.qrt-alt-body），
 组件根自身不滚——jsonFind 定位链用 preEl；滚动位归零用 preEl/treeEl.parentElement */
const preEl = ref<HTMLElement | null>(null);
const treeEl = ref<HTMLElement | null>(null);
defineExpose({ preEl, treeEl });
</script>

<style scoped>
/* 文档导航条（914 能力矩阵统一）：json/tree 档的文档触达——遍历+打开走 open-doc-at
 与表格/卡片同一 openDoc 抽屉（原始 JSON 查看/编辑/保存全链复用） */
.ah-docnav { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2); margin-bottom: var(--sp-1); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-s); }
.ah-docnav-lb { font-size: var(--fs-2xs); color: var(--tx2); }
.ah-docnav-pos { font-size: var(--fs-2xs); color: var(--tx1); font-variant-numeric: tabular-nums; }
.ah-nav-btn { background: transparent; border: 1px solid var(--line); border-radius: var(--r-s); color: var(--tx1); cursor: pointer; padding: 0 var(--sp-1h); line-height: 1.6; font-size: var(--fs-xs); }
.ah-nav-btn:hover:not(:disabled) { border-color: var(--ac-line); color: var(--tx0); }
.ah-nav-btn:disabled { opacity: .4; cursor: not-allowed; }
.ah-nav-open { background: transparent; border: 1px solid var(--ac-line); border-radius: var(--r-s); color: var(--ac-hi); cursor: pointer; padding: 0 var(--sp-2); line-height: 1.8; font-size: var(--fs-2xs); }
.ah-nav-open:hover { background: var(--ac-soft); }
/* _id 直达下拉（mono 短显，title 悬停全量） */
.ah-docnav-sel { max-width: 220px; background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s); color: var(--tx1); font-size: var(--fs-2xs); padding: 1px var(--sp-1); cursor: pointer; }
.ah-docnav-sel:hover { border-color: var(--ac-line); }
/* json 档文档块（点击开文档的可点域）：pointer 光标+左缘细条指示 */
.json-view :deep(.j-doc-block) { display: block; cursor: pointer; border-left: 2px solid transparent; padding-left: var(--sp-1h); margin-left: calc(-1 * var(--sp-1h)); }
.json-view :deep(.j-doc-block:hover) { border-left-color: var(--ac); background: var(--hl-soft, rgba(127, 127, 127, .08)); }
/* tree 档渲染数据直达 affordance：行 hover 柔底（单击开文档/双击编辑的触达域反馈） */
.ah-tree-body :deep(.jrow) { border-radius: 3px; }
.ah-tree-body :deep(.jrow:hover) { background: var(--hl-soft, rgba(127, 127, 127, .06)); }
/* 卡片内脏样式同步更新自 DslQueryView（类名逐字保形—— 等 DOM 查询按 .dq-card
 取数不受宿主/组件作用域迁移影响；dq-card-id/-row/-k/-v 四件同步同步更新） */
.dq-card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-m); padding: var(--sp-2h) var(--sp-3); cursor: pointer; transition: border var(--tr), transform var(--tr); }
.dq-card:hover { border-color: var(--ac-line); transform: translateY(-1px); }
.dq-card-id { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-1h); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dq-card-row { display: flex; gap: var(--sp-2); font-size: var(--fs-xs); line-height: 1.7; }
.dq-card-k { color: var(--ac-hi); flex-shrink: 0; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
.dq-card-v { color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
