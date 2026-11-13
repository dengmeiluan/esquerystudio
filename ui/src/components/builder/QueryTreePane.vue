<template>
  <div ref="paneEl" class="qtp" :class="{ froz: stale }" @keydown.ctrl.z.prevent="undo()" @keydown.ctrl.shift.z.prevent="redo()" @keydown.ctrl.y.prevent="redo()" @keydown.esc="onSelectEsc" @keydown.ctrl.a="onSelectAllKey" @keydown.alt.up.prevent="nudgeFocused(-1)" @keydown.alt.down.prevent="nudgeFocused(1)">
    <div v-if="stale" class="qtp-stale">
      右侧 DSL 有未解析的修改，条件树冻结显示最近一次成功解析——修正语法后自动恢复。
    </div>

    <!-- 998：语句阅读层——条件树之上先给一行「人话」，点片段定位到对应条件行。
         与编辑区同源（同一棵 tree），无独立状态，树变即变。 -->
    <QuerySentenceBar v-if="tree.root && !isPlainMatchAll" :tree="tree" @locate="locateNode" />

    <!-- 1049：头部+多选工具条吸顶——长树滚动时计数/警示/批量动作恒可达 -->
    <div class="qtp-sticky">
    <!-- 面板头部：递归叶子条件计数徽标（含嵌套与临时停用） -->
    <div v-if="tree.root" class="qtp-hd"><!-- 993：undo/redo（面板写路径单点汇聚 setRoot，栈深 50；title 避开 541/553 锁词） -->
      <button class="btn sm ghost" aria-label="撤销上一步树编辑" :disabled="!undoStack.length" :title="'撤销上一步树编辑（Ctrl+Z），可回退 ' + undoStack.length + ' 步'" @click="undo()"><Undo2 :size="11" /></button>
      <button class="btn sm ghost" aria-label="重做树编辑" :disabled="!redoStack.length" title="重做树编辑（Ctrl+Shift+Z / Ctrl+Y）" @click="redo()"><Redo2 :size="11" /></button>
      <!-- 徽标升级分档读数「共 N · 停用 M · 嵌套 K」（M/K 为 0 省略段）；
 N>10 转 .hot 警示色，提示条件树偏大。
 裸 pill 升级 .chip.static 质感档（bg2 底+line 边+tabular-nums 全局单源），
 数字 mono 包裹（textContent 不变，fieldSelectPopup 计数断言兼容） -->
      <span class="qtp-cnt chip static" :class="{ hot: leafStats.total > 10 }" :title="cntTitle">共 <b class="mono">{{ leafStats.total }}</b> 条件<template v-if="leafStats.disabled"> · 停用 <b class="mono">{{ leafStats.disabled }}</b></template><template v-if="leafStats.nested"> · 嵌套 <b class="mono">{{ leafStats.nested }}</b></template></span>
      <!-- 全部停用=空 bool=match_all：这是危险的静默放宽，必须显性提示 -->
      <span v-if="leafStats.total > 0 && leafStats.disabled === leafStats.total" class="chip static qtp-alloff" role="status"
            title="所有条件都已停用，序列化后是空 bool，ES 会按 match_all 返回全部文档；点「启用全部」恢复">
        全部停用 = 匹配全部文档
      </span>
      <!-- 1045：未填值条件——半成品条件在长树里几乎不可见，给可点击计数直达首个空值行 -->
      <button v-if="unfilledCount" type="button" class="btn sm ghost qtp-unfilled"
              :title="'有 ' + unfilledCount + ' 个条件还没填值，点击定位到第一个（执行时这些条件不会命中）'"
              @click="locateFirstUnfilled"><CircleAlert :size="11" /> 未填值 <b class="mono">{{ unfilledCount }}</b></button>
      <!-- 1049：多选批量——选中行/组后统一停用、启用或删除；父组选中即整棵子树生效 -->
      <button v-if="tree.root && !isPlainMatchAll" type="button" class="btn sm ghost qtp-sel-tg" :class="{ on: selectMode }"
              :aria-pressed="selectMode" :title="selectMode ? '退出多选' : '进入多选：勾选条件后批量停用/启用/复制/删除'"
              @click="toggleSelectMode"><ListChecks :size="11" /> 多选</button>
      <!-- 撑开剩余宽度（纯占位、不可见）。
           1396 实测修正：这个空 span 在 flex 行里会按基线落到行底（比同行元素低 13px），
           但它高度为 0、不参与布局，**并没有**把后面的「过滤条件…」挤歪（实测该框在改前
           改后都在同一 y）。改 align-self:stretch 只是让占位元素自身归位、语义干净，
           **不是**任何视觉缺陷的修复——原先那条「拉歪定位参照」的注释是错误归因，已删。 -->
      <span style="flex:1; align-self:stretch; min-height:0" aria-hidden="true"></span>
      <!-- 条件搜索定位——命中行柔底高亮并滚动定位，清空恢复；
 计数 N/M + Enter/Shift+Enter 逐命中轮转（当前命中加重档）。
 裸 input 合并 SearchFilterBar 统一件（继 wt/fv/tg 三处之后第四处消费，
 同构判定：过滤词+Enter 导航+附加件插槽+Esc 清空内建；Shift+Enter 反向轮转经
 组件 @enter 转出的原生 KeyboardEvent.shiftKey 承接），胶囊壳质感归组件单源 -->
      <!-- title 经组件 $attrs 透传落胶囊根（inheritAttrs 关闭显式透传），悬停提示原语义保留 -->
      <SearchFilterBar v-model="filterQ" class="qtp-find" placeholder="过滤条件…" @enter="onFindKey" title="按字段名/算子/值过滤条件行：命中柔底高亮，Enter/Shift+Enter 在命中间轮转，清空恢复">
        <span v-if="findHits.length" class="qtp-find-nav chip static mono" aria-live="polite"
              :title="'命中 ' + findHits.length + ' 条，当前第 ' + findCur + ' 条'">{{ findCur }}/{{ findHits.length }}</span>
        <!-- 989：命中在折叠组内不可见——一键展开全部嵌套组并重扫定位。
         title 刻意避开「展开全部」字面（541/553 的 btnLine 行定位器按该子串找工具行钮，
         新钮用词撞车会抢走行定位=锁面误红） -->
        <button v-if="foldedHits" type="button" class="btn sm ghost qtp-find-fold" :title="'有 ' + foldedHits + ' 条命中在折叠的嵌套组内，点击展开'"
                @click="expandFoldedHits"><ChevronsUp :size="11" /> 折叠内 {{ foldedHits }}</button>
      </SearchFilterBar>
      <!-- 四枚举钮收敛两枚状态感知循环钮（折叠⇄展开 / 启用⇄停用各一枚，
 显隐条件与 title 原语义保留）——
 折叠态不进 queryTree（BoolGroupNode 组内 ref+scoped draft）→ 上次动作 ref；
 启停态树内必有字段（叶 disabled，leafStats 已统计）→ 存在停用显「启用全部」。
 补 lucide icon 与 BoolGroupNode 组头 icon 钮语言对齐
 （双 chevron 表「全部」批量语义，区别于组头单 chevron） -->
      <template v-if="tree.root.type === 'bool'">
        <button v-if="anyCollapsed" class="btn sm ghost" title="展开全部嵌套组" @click="broadcastCollapse(false)"><ChevronsUp :size="11" /> 展开全部</button>
        <button v-else class="btn sm ghost" title="折叠全部嵌套组" @click="broadcastCollapse(true)"><ChevronsDown :size="11" /> 折叠全部</button>
      </template>
      <template v-if="!isPlainMatchAll">
        <button v-if="hasDisabled" class="btn sm ghost" title="全部条件恢复参与匹配" @click="setAllDisabled(false)"><Play :size="11" /> 启用全部</button>
        <button v-else class="btn sm ghost" title="全部条件临时停用（不删除，可恢复）" @click="setAllDisabled(true)"><Pause :size="11" /> 停用全部</button>
      </template>
    </div>
    <!-- 1002：无根树（排序/参数-only 现场）的撤销窄条——extras 域编辑同样可撤；
         与头行 v-if/v-else-if 互斥（无根时头行整排控件是噪声，只出 undo/redo） -->
    <div v-else-if="undoStack.length || redoStack.length" class="qtp-hd">
      <button class="btn sm ghost" aria-label="撤销上一步树编辑" :disabled="!undoStack.length" :title="'撤销上一步树编辑（Ctrl+Z），可回退 ' + undoStack.length + ' 步'" @click="undo()"><Undo2 :size="11" /></button>
      <button class="btn sm ghost" aria-label="重做树编辑" :disabled="!redoStack.length" title="重做树编辑（Ctrl+Shift+Z / Ctrl+Y）" @click="redo()"><Redo2 :size="11" /></button>
    </div>

    <!-- 1049：多选批量工具条——独立一行（窄构建栏内 7 个控件挤在筛选行会换行错位） -->
    <div v-if="selectMode" class="qtp-batch" role="toolbar" aria-label="多选批量操作">
      <span class="chip static qtp-sel-cnt" title="Shift+点击连续范围选择 · Ctrl+A 全选 · Esc 退出多选">已选 <b class="mono">{{ selectedCount }}</b></span>
      <button type="button" class="btn sm ghost" @click="selectAll">全选</button>
      <button type="button" class="btn sm ghost" :disabled="!selectedCount" @click="clearSelection">清空</button>
      <button type="button" class="btn sm ghost" :disabled="!selectedCount" title="停用选中条件（组=整棵子树）" @click="batchDisable(true)">停用</button>
      <button type="button" class="btn sm ghost" :disabled="!selectedCount" title="恢复选中条件参与匹配" @click="batchDisable(false)">启用</button>
      <button type="button" class="btn sm ghost" :disabled="!selectedCount" title="复制选中条件（组=整棵子树；副本紧跟在原件后，可直接改字段/值）" @click="batchDuplicate"><Copy :size="11" /> 复制</button>
      <button type="button" class="btn sm ghost" :disabled="!canGroupSelected" :title="groupTitle" @click="batchGroup">包组</button>
      <button type="button" class="btn sm ghost danger" :disabled="!selectedCount" @click="batchDelete"><Trash2 :size="11" /> 删除</button>
    </div>
    </div>

    <!-- v3.1 空态：漏斗插画+光晕引导（替代单行虚线框） -->
    <div v-if="!tree.root" class="qtp-none">
      <div class="qtp-funnel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      </div>
      <div class="qtp-funnel-t1">无查询条件</div>
      <div class="qtp-funnel-t2">DSL 里没有 query 键，加一个条件开始构建</div>
      <div class="qtp-funnel-act">
        <button class="btn pri sm" @click="addFirst"><Plus :size="12" /> 加查询条件</button>
      </div>
    </div>

    <div v-else-if="isPlainMatchAll" class="qtp-none">
      <div class="qtp-funnel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      </div>
      <div class="qtp-funnel-t1">当前为全部文档（match_all）</div>
      <div class="qtp-funnel-t2">加一个条件开始缩小范围，或在右侧直接编写 DSL</div>
      <div class="qtp-funnel-act">
        <button class="btn pri sm" @click="addFirst"><Plus :size="12" /> 加条件</button>
        <!-- 1036：空态粘贴——跨查询剪贴的子树直接落为条件组（bool.must 数组形态） -->
        <button v-if="stashNonEmpty" class="btn sm" @click="pasteFirst"><ClipboardPaste :size="12" /> 粘贴子树</button>
      </div>
    </div>

    <BoolGroupNode
      v-else-if="tree.root.type === 'bool'"
      :key="(tree.root as BoolNode).id"
      :node="(tree.root as BoolNode)" :fields="fields" :types="types"
      @update:node="onRootUpdate" @remove="onRootRemove" @wrap="wrapRoot" @duplicate="onDuplicate"
    />

    <template v-else>
      <div class="qtp-single-bar">
        <span class="qtp-single-tx">单条件查询</span>
        <button class="btn sm" @click="addSibling"><Plus :size="11" /> 加条件（转条件组）</button>
      </div>
      <NodeRenderer
        :node="tree.root" :fields="fields" :types="types"
        @update:node="onRootUpdate" @remove="onRootRemove" @wrap="wrapRoot" @duplicate="onDuplicate"
      />
    </template>
</div>
</template>

<script setup lang="ts">
/* W1：构建器主面板。root 形态规则：null→加查询条件；纯 match_all→空态；
 bool→直渲染；单节点→渲染+「转条件组」。
 归一化：root bool 子句删光自动回 match_all；root 永不缺失。
 provide TREE_BUS：落点分区的 move 在这里统一 moveNode（ 防环）。
 index prop：写入 fieldSearch 的当前索引上下文（per-index 最近字段记忆供 defaultLeaf 与
 子树深处的 FieldSelect 读取——NodeRenderer 之下逐层透传 prop 不现实）。 */
import { computed, watch, watchEffect, provide, ref, nextTick, onBeforeUnmount } from 'vue';
import { Plus, ChevronsDown, ChevronsUp, Pause, Play, Undo2, Redo2, ClipboardPaste, CircleAlert, ListChecks, Trash2, Copy } from 'lucide-vue-next';
import { subtreeStash, readStashSubtree } from '../../utils/queryStash';
import SearchFilterBar from '../SearchFilterBar.vue';
import BoolGroupNode, { BGN_COLLAPSE_EVENT } from './BoolGroupNode.vue';
import NodeRenderer from './NodeRenderer.vue';
import QuerySentenceBar from './QuerySentenceBar.vue';
import RootExtrasPane from './RootExtrasPane.vue';
import { TREE_BUS, SELECT_BUS } from './treeBus';
import { setFieldSearchIndex, setFieldSearchUsedFields, defaultLeafTarget } from '../../utils/fieldSearch';
import {
  nid, moveNode, findNode, serQueryNode, wrapInBool, updateNodeById, cloneNode, insertAfter,
  countUnfilledLeaves, firstUnfilledLeafId, setDisabledForIds, removeNodesByIds, duplicateNodesByIds,
  canGroupByIds, groupNodesByIds, moveSibling,
  type QueryTree, type QueryNode, type BoolNode, type LeafNode, type WrapNode, type MultiNode,
} from '../../utils/queryAst';

const props = defineProps<{
  tree: QueryTree; fields: string[]; types: Record<string, string>; stale?: boolean; index?: string;
}>();
const emit = defineEmits<{
  (e: 'update:tree', t: QueryTree): void;
  (e: 'locateDsl', id: string): void;
  /* 1069 续：条件行一键建运行时字段成功——宿主负责提示去补 script */
  (e: 'runtime-defined', p: { name: string; type: string }): void;
  /* 1069 续：条件行发现运行时字段缺 script——宿主展开检索参数并定位补 script */
  (e: 'runtime-edit', name: string): void;
}>();

watch(() => props.index, i => setFieldSearchIndex(i || ''), { immediate: true });

/* 987：stale 冻结补键盘面——.froz 只挡 pointer-events，键盘仍可 Tab 进「停用全部」
 等写树钮以冻结旧树覆盖正在手改的 DSL。inert 属性一次性挡鼠标+键盘+焦点全通道（含 AT）；
 flush post 保证挂载后初次也应用（watch immediate 跑在 paneEl 赋值前） */
watchEffect(() => { paneEl.value?.toggleAttribute('inert', !!props.stale); }, { flush: 'post' });

/* 树内已用字段→fieldSearch 模块态（FieldSelect 候选 used 前置段数据源）——
 收集全部叶子条件字段名去重写入（bool 下钻 / wrap 下钻 / 叶取 field）。树编辑全走不可变
 更新（子组件 emit 新节点、setRoot 换引用），watch 引用替换即全量重扫，无深监听。
 免 prop 逐层透传：NodeRenderer 之下透传面过大，setFieldSearchIndex 同款既有先例。 */
watch(() => props.tree, t => {
  const names: string[] = [];
  const walk = (x: QueryNode) => {
    if (x.type === 'bool') x.children.forEach(c => walk(c.node));
    else if (x.type === 'wrap') { if (x.child) walk(x.child); }
    else if (x.type === 'multi') x.children.forEach(c => walk(c.node));
    else if (x.field) names.push(x.field);
  };
  if (t.root) walk(t.root);
  setFieldSearchUsedFields(names);
}, { immediate: true });

const matchAllLeaf = (): LeafNode =>
  ({ id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null });
function defaultLeaf(): LeafNode {
  /* 优先取本索引最近使用的字段+其兼容算子（fieldSearch per-index 记忆），无记录回退 fields[0] */
  const t = defaultLeafTarget(props.fields, props.types, props.index || '');
  if (!t) return matchAllLeaf();
  return { id: nid(), type: 'leaf', op: t.op, field: t.field, value: '', params: {}, raw: null };
}

/* 面板头部量变读数：递归数叶子条件（wrap 的子句也算，bool 只下钻不计自身）——
 升级为 total/disabled/nested 分档（root 组自身不计入嵌套），
 停用/嵌套为 0 时徽标省略对应段（零噪音）；total>10 由模板挂 .hot 警示色 */
const leafStats = computed(() => {
  const st = { total: 0, disabled: 0, nested: 0 };
  const r = props.tree.root;
  if (!r) return st;
  const walk = (x: QueryNode, isRoot: boolean) => {
    if (x.type === 'bool') {
      if (!isRoot) st.nested++;
      x.children.forEach(c => walk(c.node, false));
    } else if (x.type === 'wrap') {
      if (x.child) walk(x.child, false);
    } else if (x.type === 'multi') {
      x.children.forEach(c => walk(c.node, false));
    } else {
      st.total++;
      if (x.disabled) st.disabled++;
    }
  };
  walk(r, true);
  return st;
});
/* 启停循环钮感知源——树内叶 disabled 字段必然在场（leafStats 递归已统计）：
 存在停用条件显「启用全部」，否则显「停用全部」；点后写树换引用，感知随动 */
const hasDisabled = computed(() => leafStats.value.disabled > 0);
/* 1045：未填值条件计数/首项——纯函数在 queryAst（执行行提示与构建器头部同源） */
const unfilledCount = computed(() => countUnfilledLeaves(props.tree.root));
function locateFirstUnfilled() {
  const id = firstUnfilledLeafId(props.tree.root);
  if (id) void flashRow(id, true);
}
const cntTitle = computed(() => {
  const s = leafStats.value;
  let t = '条件树中的叶子条件总数（含嵌套分区与临时停用的条件）';
  if (s.disabled) t += `；停用 ${s.disabled} 条不参与本次匹配`;
  if (s.nested) t += `；嵌套子组 ${s.nested} 个`;
  if (s.total > 10) t += '；条件数偏多，可用下方过滤定位或拆分条件组';
  return t;
});

/* 条件搜索定位——扫描条件行（字段名+算子+值），命中加 .qtp-hit 柔底并滚动到
 首个命中；清空恢复。走 DOM 扫描而非逐层透传过滤词：树是 BoolGroupNode→NodeRenderer→ClauseNode
 递归多组件渲染，prop 透传锁定面大，且命中高亮是视图态不进数据。
 【W3b】导航升级（参照 useHitNav 范式）：1-based 游标 + wrap-around 轮转；
 计数 N/M 常显；Enter 下一个 / Shift+Enter 上一个；当前命中加 .qtp-hit-cur 加重档——
 柔底只说明「命中」，加重档只在用户导航后落位（未导航不打焦点环，useHitLocate 同款取舍），
 扫描定位首行仍保留（既有行为不回归）。 */
const paneEl = ref<HTMLElement>();
const filterQ = ref('');
const findHits = ref<HTMLElement[]>([]);
const findCur = ref(0);   // 1-based；0 = 无命中
/* 989：命中在折叠组内的条数。折叠组内容 v-if 卸载（大树性能取舍）——DOM 扫描根本
 看不到折叠内条件，「过滤失效」的真根因。判定走数据面：sessionStorage 折叠草稿
 （bgn-fold:<组id>='1'，BoolGroupNode useScopedDraft 同源）+ 树递归匹配（匹配串与
 DOM 扫描同构 field+op+value）。提示钮展开全部后草稿清空、重扫自然归零。 */
const foldedHits = ref(0);
watch(filterQ, () => { rescanFind(); });
function foldedGroupIds(): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    /* draft2 键形：esquerystudio.draft2:query-builder:<host>:<idx>:-:-:bgn-fold:<组id>，
     值 '1' = 折叠（展开态键被 writeRaw(null) 删除）；中段维度可变，认尾部 bgn-fold: 标记 */
    if (k && k.includes(':bgn-fold:') && sessionStorage.getItem(k) === '1') {
      s.add(k.slice(k.indexOf(':bgn-fold:') + ':bgn-fold:'.length));
    }
  }
  return s;
}
async function rescanFind() {
  await nextTick();
  const root = paneEl.value;
  if (!root) return;
  root.querySelectorAll('.cn.qtp-hit').forEach(el => el.classList.remove('qtp-hit'));
  root.querySelectorAll('.cn.qtp-hit-cur').forEach(el => el.classList.remove('qtp-hit-cur'));
  const q = filterQ.value.trim().toLowerCase();
  if (!q) { findHits.value = []; findCur.value = 0; foldedHits.value = 0; return; }
  const hits: HTMLElement[] = [];
  for (const row of Array.from(root.querySelectorAll('.cn'))) {
    const field = (row.querySelector('.fs-inp') as HTMLInputElement | null)?.value || '';
    const sel = row.querySelector('.cn-op') as HTMLSelectElement | null;
    const op = sel ? (sel.options[sel.selectedIndex]?.text || sel.value) : '';
    const val = (row.querySelector('.cn-val') as HTMLInputElement | HTMLSelectElement | null)?.value || '';
    /* 1045：搜索面加入中文算子名（下拉 option 文本）与 chip 值/无值文案——
       旧实现只读 select.value（term），用户输入「精确」「无值」搜不到。 */
    const hay = [field, op, val, row.textContent || ''].join(' ').toLowerCase();
    if (hay.includes(q)) {
      row.classList.add('qtp-hit');
      hits.push(row as HTMLElement);
    }
  }
  findHits.value = hits;
  findCur.value = hits.length ? 1 : 0;
  hits[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  /* 折叠内命中（数据面补扫——与 DOM 扫描同串匹配，祖先组在折叠草稿即计） */
  const foldIds = foldedGroupIds();
  let folded = 0;
  const walk = (x: QueryNode, foldedCtx: boolean) => {
    if (x.type === 'bool') { const f = foldedCtx || foldIds.has(x.id); x.children.forEach(c => walk(c.node, f)); }
    else if (x.type === 'wrap') { if (x.child) walk(x.child, foldedCtx); }
    else if (x.type === 'multi') { x.children.forEach(c => walk(c.node, foldedCtx)); }
    else {
      const hay = ((x.field || '') + ' ' + x.op + ' ' + String(x.value ?? '')).toLowerCase();
      if (hay.includes(q) && foldedCtx) folded++;
    }
  };
  if (props.tree.root) { walk(props.tree.root, false); foldedHits.value = folded; }
}
/* 展开全部折叠组后重扫（广播同步置位、草稿清空与内容渲染下一拍，rescan 自带 nextTick） */
function expandFoldedHits() {
  broadcastCollapse(false);
  rescanFind();
}
/* ═══ 998：语句片段 → 条件行定位 ═══
   目标行可能在折叠组里（v-if 卸载，DOM 根本不存在）——先直接命中，未命中就展开全部嵌套组
   再重试一次；命中后滚到视口中心 + 品牌描边脉冲 1.4s，焦点落到该行字段输入（键盘流可直改）。
   与条件过滤（qtp-hit）互不干扰：那是常驻柔底，这是瞬时脉冲。 */
let flashEl: HTMLElement | null = null;
let flashTimer: ReturnType<typeof setTimeout> | undefined;
async function locateNode(id: string) {
  await nextTick();
  /* 1007：定位双链——条件行脉冲之外，同步上抛给视图层联动右侧 DSL 编辑器滚动定位 */
  emit('locateDsl', id);
  await flashRow(id, true);
}
/* 1008：DSL 光标反向联动入口——只滚动+脉冲（折叠中的行先展开可见），
   不 emit locateDsl（防「编辑器定位→光标移动→再联动」反馈环）、不抢编辑器焦点 */
async function highlightFromDsl(id: string) {
  await flashRow(id, false);
}
async function flashRow(id: string, focusInput: boolean) {
  const root = paneEl.value;
  if (!root) return;
  let el = root.querySelector<HTMLElement>(`[data-nid="${id}"]`);
  if (!el) {
    broadcastCollapse(false);
    await nextTick();
    el = root.querySelector<HTMLElement>(`[data-nid="${id}"]`);
  }
  if (!el) return;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  flashEl?.classList.remove('qtp-flash');
  flashEl = el;
  el.classList.add('qtp-flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el?.classList.remove('qtp-flash'); if (flashEl === el) flashEl = null; }, 1400);
  if (focusInput) (el.querySelector('.fs-inp') as HTMLInputElement | null)?.focus({ preventScroll: true });
}
onBeforeUnmount(() => clearTimeout(flashTimer));
/* 游标 → DOM 落位：唯一 .qtp-hit-cur + 滚到视口中心（命中行尚未渲染时不炸，下次导航再试） */
function applyFindCur() {
  const root = paneEl.value;
  if (!root) return;
  root.querySelectorAll('.cn.qtp-hit-cur').forEach(el => el.classList.remove('qtp-hit-cur'));
  const el = findHits.value[findCur.value - 1];
  if (!el) return;
  el.classList.add('qtp-hit-cur');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
/* 改由 SearchFilterBar @enter 定向转出（组件 .enter.prevent 已挡默认行为）——
 函数体零触：Enter/Shift+Enter 轮转语义经转出的原生 KeyboardEvent 原样承接 */
function onFindKey(e: KeyboardEvent) {
  if (e.key !== 'Enter') return;
  const n = findHits.value.length;
  if (!n) return;
  e.preventDefault();
  /* wrap-around 轮转（useHitNav.next/prev 同式）：Shift+Enter 反向 */
  findCur.value = e.shiftKey ? ((findCur.value - 2 + n) % n) + 1 : (findCur.value % n) + 1;
  applyFindCur();
}

/* 折叠/展开全部嵌套组——组折叠态是 BoolGroupNode 组内内存 ref，
 经 window 事件广播（同 DRAG_EVENT 模式，事件名定义在 BoolGroupNode module 块；
 TreeBus 注入接口不动）。
 折叠态不进 queryTree（组内 ref+scoped draft，树数据无字段可推）——
 按「本地 ref 记忆上次动作」收敛单枚循环钮：初始视为全展开（显「折叠全部」），
 点击广播同时翻转记忆，下一眼显反向动作。 */
const anyCollapsed = ref(false);
function broadcastCollapse(collapsed: boolean) {
  anyCollapsed.value = collapsed;
  window.dispatchEvent(new CustomEvent(BGN_COLLAPSE_EVENT, { detail: { collapsed } }));
}
/* 批量启停——本组件即树 owner，直接递归翻所有叶 disabled（与叶级开关
 同走 disabled 字段：ClauseNode 恢复按钮/整行降透明度随之生效），无需绕 TREE_BUS */
function setAllDisabled(disabled: boolean) {
  const r = props.tree.root;
  if (!r) return;
  const walk = (x: QueryNode): QueryNode => {
    if (x.type === 'bool') return { ...x, children: x.children.map(c => ({ occur: c.occur, node: walk(c.node) })) };
    if (x.type === 'wrap') return { ...x, child: x.child ? walk(x.child) : null };
    if (x.type === 'multi') return { ...x, children: x.children.map(c => ({ key: c.key, node: walk(c.node) })) };
    return { ...x, disabled };
  };
  setRoot(walk(r));
}

const isPlainMatchAll = computed(() => {
  const r = props.tree.root;
  return !!r && r.type === 'leaf' && r.op === 'match_all' && !Object.keys((r as LeafNode).params).length;
});

/* ═══ 993/1002：undo/redo 历史栈 ═══
 写路径单点 emit，emit 前记 lastEmitted 引用；watch props.tree 回流甄别来源
 （=== lastEmitted = 内部写回流，不动栈；≠ = DSL 解析/外部换树，清栈防跨源串撤销
 ——用户手改 DSL 后撤销到旧树会覆盖手改，Monaco setValue 清 undo 栈不可逆）。
 栈存「写前整树快照」（树按不可变约定流转，存引用零拷贝），深 50 截断；新写动作
 清空重做分支。1002 起快照从 root 扩到整树：extras 域（排序/查询参数/检索器…）经
 DslQueryView 路由进 commitTree，与条件树编辑共用同一条撤销流（Ctrl+Z 跨域逐级回退）。 */
const undoStack = ref<QueryTree[]>([]);
const redoStack = ref<QueryTree[]>([]);
let lastEmitted: QueryTree | null = null;
const UNDO_MAX = 50;

/* 1045：输入级编辑合并——同一条叶子在 1.2s 内的连续字段/值输入只入栈一次。
   旧实现每敲一个字 push 一份快照，50 格撤销栈被 30 字公司名吃光，结构编辑被挤出历史。
   只有「结构不变且仅一条叶子字段/值变化」才合并；删除/加组/拖拽等结构动作照常逐步入栈。 */
let lastTypingId: string | null = null;
let lastTypingAt = 0;
const TYPING_COALESCE_MS = 1200;
function collectChangedLeafIds(a: QueryNode | null, b: QueryNode | null, out: string[]): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type || a.id !== b.id) return false;
  if (a.type === 'leaf') {
    const al = a, bl = b as LeafNode;
    if (al.op !== bl.op) return false;
    if ((al.disabled === true) !== (bl.disabled === true)) return false;
    const ja = JSON.stringify({ ...al, id: '' });
    const jb = JSON.stringify({ ...bl, id: '' });
    if (ja !== jb) out.push(al.id);
    return true;
  }
  if (a.type === 'bool') {
    const ab = a, bb = b as BoolNode;
    if (ab.children.length !== bb.children.length) return false;
    if (JSON.stringify(ab.params) !== JSON.stringify(bb.params)) return false;
    for (let i = 0; i < ab.children.length; i++) {
      if (ab.children[i].occur !== bb.children[i].occur) return false;
      if (!collectChangedLeafIds(ab.children[i].node, bb.children[i].node, out)) return false;
    }
    return true;
  }
  if (a.type === 'wrap') {
    const aw = a, bw = b as WrapNode;
    if (aw.op !== bw.op || aw.field !== bw.field || aw.childKey !== bw.childKey) return false;
    if (JSON.stringify(aw.params) !== JSON.stringify(bw.params)) return false;
    return collectChangedLeafIds(aw.child, bw.child, out);
  }
  const am = a as MultiNode, bm = b as MultiNode;
  if (am.op !== bm.op || am.children.length !== bm.children.length) return false;
  if (JSON.stringify(am.params) !== JSON.stringify(bm.params)) return false;
  for (let i = 0; i < am.children.length; i++) {
    if (am.children[i].key !== bm.children[i].key) return false;
    if (!collectChangedLeafIds(am.children[i].node, bm.children[i].node, out)) return false;
  }
  return true;
}
function singleTypingId(prev: QueryTree, next: QueryTree): string | null {
  const ids: string[] = [];
  if (!collectChangedLeafIds(prev.root, next.root, ids)) return null;
  return ids.length === 1 ? ids[0] : null;
}
function commitTree(next: QueryTree, skipHistory = false) {
  if (!skipHistory) {
    const now = Date.now();
    const typingId = singleTypingId(props.tree, next);
    const coalesce = !!typingId && typingId === lastTypingId && now - lastTypingAt < TYPING_COALESCE_MS;
    if (!coalesce) {
      undoStack.value.push(props.tree);
      if (undoStack.value.length > UNDO_MAX) undoStack.value.shift();
    }
    redoStack.value = [];
    lastTypingId = typingId;
    lastTypingAt = now;
  }
  lastEmitted = next;
  emit('update:tree', next);
}
function setRoot(root: QueryNode) {
  if (root.type === 'bool' && !root.children.length) root = matchAllLeaf();
  commitTree({ ...props.tree, root }, !props.tree.root);   /* 首建根不入栈（993 语义：无根可撤） */
}
watch(() => props.tree, t => {
  if (t === lastEmitted) return;
  undoStack.value = [];
  redoStack.value = [];
  lastEmitted = t;
});
function undo() {
  const prev = undoStack.value.pop();
  if (!prev) return;
  lastTypingId = null; lastTypingAt = 0;
  redoStack.value.push(props.tree);
  lastEmitted = prev;
  emit('update:tree', prev);
}
function redo() {
  const next = redoStack.value.pop();
  if (!next) return;
  lastTypingId = null; lastTypingAt = 0;
  undoStack.value.push(props.tree);
  lastEmitted = next;
  emit('update:tree', next);
}

/* 1002：extras 域写入口（DslQueryView 把 RootExtrasPane 的 update:tree 路由进来；
   条件树面板恒显示=通道恒在场，视图侧保留兜底直写） */
defineExpose({
  commitTree: (t: QueryTree) => commitTree(t),
  /* 1008：DSL 光标反向联动入口（仅行滚动+脉冲，不 emit 不抢焦点） */
  highlightFromDsl: (id: string) => { void highlightFromDsl(id); },
  /* 1045：未填值条件读数/定位（构建区收起时执行行仍可提示，点击展开并落位） */
  unfilledCount: () => unfilledCount.value,
  locateFirstUnfilled: () => locateFirstUnfilled(),
});
function onRootUpdate(n: QueryNode) { setRoot(n); }
function onRootRemove() { setRoot(matchAllLeaf()); }
function wrapRoot() { if (props.tree.root) setRoot(wrapInBool(props.tree.root, props.tree.root.id)); }

/* ═══ 复制：node 深拷贝 + id 全部重新 nid() + 插到原节点之后 ═══
 cloneNode/insertAfter 已提为 queryAst 纯函数（987 起 MiniTreeEditor 共用）；
 父 bool 命中 → 同 occur 分区原位后插；root 命中（单条件/根组复制）→ 包一层 bool.must。 */
function onDuplicate(id: string) {
  const r = props.tree.root;
  if (!r) return;
  if (r.id === id) {
    const g: BoolNode = {
      id: nid(), type: 'bool',
      children: [{ occur: 'must', node: r }, { occur: 'must', node: cloneNode(r) }],
      params: {}, arrForm: { must: true },
    };
    setRoot(g);
    return;
  }
  setRoot(insertAfter(r, id));
}

/* 1045：新建根条件后焦点直达字段输入（用户下一步就是选字段/填值） */
function focusNodeById(id: string) {
  /* 双 nextTick：父级树引用更新后子组件（BoolGroupNode→ClauseNode）还要再渲染一拍；
     单 tick 时 DOM 尚未出现，焦点会落回 body。 */
  nextTick(() => nextTick(() => {
    const el = paneEl.value?.querySelector<HTMLElement>(`[data-nid="${id}"]`);
    (el?.querySelector<HTMLElement>('.fs-inp, input, select, textarea'))?.focus();
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }));
}
function addFirst() {
  const leaf = defaultLeaf();
  const g: BoolNode = {
    id: nid(), type: 'bool',
    children: [{ occur: 'must', node: leaf }], params: {}, arrForm: { must: true },
  };
  setRoot(g);
  focusNodeById(leaf.id);
}

/* 1036：空态粘贴子树——跨查询剪贴落为 bool.must 条件组（parseQueryNode 重建全新 id）；
   暂存空/损坏按钮不显形（stashNonEmpty），点击时损坏静默降级 */
const stashNonEmpty = computed(() => !!subtreeStash.value);
function pasteFirst() {
  const parsed = readStashSubtree();
  if (!parsed) return;
  setRoot({
    id: nid(), type: 'bool',
    children: [{ occur: 'must', node: parsed }], params: {}, arrForm: { must: true },
  });
}
function addSibling() {
  const r = props.tree.root;
  if (!r) return addFirst();
  const leaf = defaultLeaf();
  const g: BoolNode = {
    id: nid(), type: 'bool',
    children: [{ occur: 'must', node: r }, { occur: 'must', node: leaf }],
    params: {}, arrForm: { must: true },
  };
  setRoot(g);
  focusNodeById(leaf.id);
}

/* ═══ 1049：多选批量 ═══
   选中集合只存节点 id；批量停用/删除对选中节点整棵子树生效（父组选中即停，不下钻），
   因此父子同选不会重复操作。删除后清空选择；停用保留选择便于立即「启用」。 */
const selectMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const selectedCount = computed(() => selectedIds.value.size);
/* 1052：包组只对「同一父组、同一 occur 分区」的选中兄弟开放——组内沿用原 occur，
   插回原位，只多一层括号，布尔语义不变；跨组/跨分区会移动条件出原上下文，故禁用。 */
const canGroupSelected = computed(() =>
  !!props.tree.root && canGroupByIds(props.tree.root, selectedIds.value));
const groupTitle = computed(() => canGroupSelected.value
  ? '把选中条件包成一个新组（同分区兄弟，不改变查询语义）'
  : '包组要求至少两个同一分组、同一逻辑的条件：且/过滤，或未设 minimum_should_match 的或；排除(must_not)不能直接包组');
function allNodeIds(): Set<string> {
  const out = new Set<string>();
  const walk = (x: QueryNode) => {
    out.add(x.id);
    if (x.type === 'bool') x.children.forEach(c => walk(c.node));
    else if (x.type === 'wrap') { if (x.child) walk(x.child); }
    else if (x.type === 'multi') x.children.forEach(c => walk(c.node));
  };
  if (props.tree.root) walk(props.tree.root);
  return out;
}
function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  lastToggleId = null;
  if (!selectMode.value) selectedIds.value = new Set();
}
/* 1053：Shift 连续范围按「当前可见行」DOM 序补齐——折叠组内未渲染的行不参与，
   避免选中用户看不见的条件。取消勾选时同样按区间批量取消。 */
let lastToggleId: string | null = null;
function visibleNodeOrder(): string[] {
  const els = paneEl.value?.querySelectorAll<HTMLElement>('[data-nid]');
  return els ? [...els].map(el => el.dataset.nid || '').filter(Boolean) : [];
}
function toggleSelect(id: string, shift = false) {
  const next = new Set(selectedIds.value);
  if (shift && lastToggleId && lastToggleId !== id) {
    const order = visibleNodeOrder();
    const a = order.indexOf(lastToggleId), b = order.indexOf(id);
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const turnOn = !next.has(id);
      for (let i = lo; i <= hi; i++) turnOn ? next.add(order[i]) : next.delete(order[i]);
      lastToggleId = id;
      selectedIds.value = next;
      return;
    }
  }
  next.has(id) ? next.delete(id) : next.add(id);
  lastToggleId = id;
  selectedIds.value = next;
}
function selectAll() { selectedIds.value = allNodeIds(); lastToggleId = null; }
function clearSelection() { selectedIds.value = new Set(); lastToggleId = null; }
/* 多选态快捷键：文字输入区内不劫持（过滤条件照常全选/取消）；复选框/按钮聚焦时照常生效 */
function inTextEntry(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if ((t as HTMLElement).isContentEditable) return true;
  if (t.tagName === 'TEXTAREA') return true;
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
  }
  return false;
}
function onSelectEsc(e: KeyboardEvent) {
  if (!selectMode.value || inTextEntry(e)) return;
  toggleSelectMode();
}
function onSelectAllKey(e: KeyboardEvent) {
  if (!selectMode.value || inTextEntry(e)) return;
  e.preventDefault();
  selectAll();
}
/* 1067：Alt+↑/↓ 移动当前焦点行（或在多选中唯一选中的行）到同分区相邻兄弟；
   与拖拽同语义（只在同 occur / multi 同 key 内换位），边界静默不动。 */
function nudgeFocused(delta: -1 | 1) {
  const r = props.tree.root;
  if (!r) return;
  const active = document.activeElement as HTMLElement | null;
  const row = active?.closest?.('[data-nid]') as HTMLElement | null;
  let id = row?.dataset.nid || '';
  if (!id && selectedIds.value.size === 1) id = [...selectedIds.value][0];
  if (!id) return;
  const next = moveSibling(r, id, delta);
  if (next === r) return;
  const activeToken = typeof active?.className === 'string'
    ? active.className.split(/\s+/).find(c => /^[A-Za-z][\w-]*$/.test(c)) || ''
    : '';
  setRoot(next);
  nextTick(() => {
    const el = paneEl.value?.querySelector<HTMLElement>(`[data-nid="${id}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
    const target = activeToken ? el?.querySelector<HTMLElement>('.' + activeToken) : null;
    (target || el?.querySelector<HTMLElement>('.fs-inp, input, select, textarea'))?.focus();
  });
}
function batchDisable(disabled: boolean) {
  const r = props.tree.root;
  if (!r || !selectedCount.value) return;
  setRoot(setDisabledForIds(r, selectedIds.value, disabled));
}
/* 1051：批量复制保留选择——原件仍在可直接继续改字段/值；副本 id 全新，紧跟在原件之后 */
function batchDuplicate() {
  const r = props.tree.root;
  if (!r || !selectedCount.value) return;
  setRoot(duplicateNodesByIds(r, selectedIds.value));
}
function batchGroup() {
  const r = props.tree.root;
  if (!r || !canGroupSelected.value) return;
  setRoot(groupNodesByIds(r, selectedIds.value));
}
function batchDelete() {
  const r = props.tree.root;
  if (!r || !selectedCount.value) return;
  const next = removeNodesByIds(r, selectedIds.value);
  setRoot(next);
  selectedIds.value = new Set();
  /* 删到只剩 match_all：多选模式没有可选对象，直接退出（避免工具行留下无意义开关态） */
  if (next.type === 'leaf' && next.op === 'match_all') selectMode.value = false;
}
/* 外部换树/删除后 prune 失效 id（避免计数与实际不符）；同值不写防 watch 环 */
watch(() => props.tree, t => {
  if (!selectMode.value || !selectedIds.value.size) return;
  const valid = allNodeIds();
  const next = [...selectedIds.value].filter(id => valid.has(id));
  if (next.length !== selectedIds.value.size) selectedIds.value = new Set(next);
});

provide(SELECT_BUS, { enabled: selectMode, selected: selectedIds, toggle: toggleSelect });

provide(TREE_BUS, {
  move(dragId, targetBoolId, occur, anchorId) {
    const r = props.tree.root;
    if (!r) return;

    setRoot(moveNode(r, dragId, targetBoolId, occur, anchorId));
  },
  toggleDisabled(leafId, disabled) {
    const r = props.tree.root;
    if (!r) return;
    setRoot(updateNodeById(r, leafId, n => (n.type === 'leaf' ? { ...n, disabled } : n)));
  },
  /* 1069 续：字段不在 mapping 时补一个占位运行时字段（type 由行内值推断，script 留空）。
     走 commitTree 使这次定义可撤销；重名/空名不动树，交由调用方提示。 */
  defineRuntime(name, type) {
    const n = (name || '').trim();
    if (!n) return false;
    const items = props.tree.runtimeMappings?.items || [];
    if (items.some(it => it.name === n)) return false;
    commitTree({ ...props.tree, runtimeMappings: { items: [...items, { name: n, body: { type } }] } });
    emit('runtime-defined', { name: n, type });
    return true;
  },
  /* 条件行读取用：computed 跟随 tree 引用更新（script 补上后提示自动消失） */
  runtimeItems: computed(() => props.tree.runtimeMappings?.items || []),
  editRuntime(name) { emit('runtime-edit', name); },
});
</script>

<style scoped>
.qtp { font-size: var(--fs-sm); }
/* 吸顶工具区：背景必须实底（否则滚动内容透字）；负 margin 拉满面板宽再补回 padding */
.qtp-sticky { position: sticky; top: 0; z-index: 6; background: var(--bg0); padding: var(--sp-1) 0 var(--sp-1); }
/* 面板头部计数徽标（chip.static 弱化档）+ 工具行（过滤输入/折叠/启停按钮）。
 行布局对齐 DQ 执行行（.dq-run-row 同式）——--ctl-h: 26px 控制线，
 输入框与按钮统一消费；间距 var(--sp-*) */
.qtp-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1); flex-wrap: wrap; --ctl-h: 26px; }
.qtp-hd .btn { height: var(--ctl-h); }
/* chip 形态（bg2 底/line 边/字重 500/tabular-nums）归全局 .chip 单源，
 本处只压小档字号；hot 档 warn 底色+描边随 chip 边框语言 */
.qtp-cnt { font-size: var(--fs-2xs); }
/* 1045：未填值计数——warn 语义弱提示（可点直达），不抢主计数权重 */
.qtp-unfilled { color: var(--warn); }
.qtp-unfilled:hover { background: var(--warn-soft); }
/* 1049：多选模式开关与批量工具条（激活柔底 + chip 计数，同工具行语言） */
.qtp-sel-tg.on { color: var(--ac); background: var(--ac-soft); border-color: var(--ac-line); }
.qtp-batch { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; padding: var(--sp-1h) var(--sp-2); margin-bottom: var(--sp-1); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-s); }
.qtp-sel-cnt { font-size: var(--fs-2xs); }
/* 全部停用警示（warn 语义；语义等值于执行 match_all） */
.qtp-alloff { font-size: var(--fs-2xs); color: var(--warn); background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
/* N>10 警示色档（warn 系变量，黄点语义=条件树偏大需留意） */
.qtp-cnt.hot { color: var(--warn); background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
/* 条件搜索定位（SearchFilterBar 第四处消费）——壳三件套（panel 底/border-subtle
 弱边/8px 圆角）归组件单源，本处只落位：宽度放宽 110→150、26px 控制线、内衬 var(--sp-*)；
 focus 态 accent 边对齐 theme.css .inp:focus 范式（组件单源不动，视图侧补） */
.qtp-find { width: 150px; height: var(--ctl-h); flex: none; padding: var(--sp-0) var(--sp-2); }
.qtp-find:focus-within { border-color: var(--ac-line); box-shadow: var(--focus-ring); }
/* 【W3b】命中计数 N/M（chip.static 弱化档，压小档字号与计数徽标同形） */
.qtp-find-nav { font-size: var(--fs-2xs); }
/* 命中条件行柔底（deep 穿透递归子组件；3 类选择器压过 ClauseNode .cn:hover 的 2 类） */
.qtp :deep(.cn.qtp-hit) { background: var(--ac-soft); }
/* 【W3b】当前命中加重档：品牌色内描边（inset 不抖布局），柔底保留 */
.qtp :deep(.cn.qtp-hit-cur) { background: var(--ac-soft); box-shadow: inset 0 0 0 1px var(--ac); }
/* 998：语句定位脉冲——瞬时品牌描边 + 柔底呼吸一下（1.4s 后由脚本摘类）；
   ！important 压过 `.cn:hover`/`.gn` 等各组件局部底色的竞争 */
.qtp :deep(.qtp-flash) { animation: qtp-flash 1.4s ease-out; border-radius: var(--r-m); }
@keyframes qtp-flash {
  0%   { box-shadow: inset 0 0 0 2px var(--ac), 0 0 0 4px var(--ac-soft); background: var(--ac-soft); }
  60%  { box-shadow: inset 0 0 0 2px var(--ac), 0 0 0 4px transparent; background: var(--ac-soft); }
  100% { box-shadow: inset 0 0 0 2px transparent, 0 0 0 4px transparent; background: transparent; }
}
.qtp-stale { padding: var(--sp-2); margin-bottom: var(--sp-2); border: 1px solid var(--warn); border-radius: var(--r-s); background: var(--warn-soft); color: var(--warn); font-size: var(--fs-xs); }
/* v3.1 空态：漏斗插画+光晕（品牌渐变方块+白漏斗），居中引导 */
.qtp-none { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--sp-0);
  padding: var(--sp-5) var(--sp-3) var(--sp-4); border: 1.5px dashed var(--line); border-radius: var(--r-l);
  background: radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--brand) 6%, transparent), transparent 60%); }
.qtp-funnel { width: 44px; height: 44px; border-radius: var(--r-l); margin-bottom: var(--sp-2);
  display: flex; align-items: center; justify-content: center;
  /* SVG stroke 收 currentColor，图标本体色走这里的 color——漏斗坐在品牌渐变徽标上，
 * 恒白（不取 --tx-on-strong：该 token 暗色下是深字，会翻转既有白图标视觉；浅色下徽标底色已随
 * --ac 加深一档，白图标对比在案）。替换前为 SVG 属性硬编码白描边（#fff），浅色主题同底色渲染不变 */
  color: #fff;
  background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 80%, #000));
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--brand) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.35); }
.qtp-funnel svg { width: 22px; height: 22px; }
.qtp-funnel-t1 { font-weight: 650; font-size: var(--fs-md); color: var(--tx0); }
.qtp-funnel-t2 { font-size: var(--fs-xs); color: var(--tx2); margin-top: var(--sp-0); }
.qtp-funnel-act { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }
.qtp-single-bar { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-0); }
.qtp-single-tx { font-size: var(--fs-xs); color: var(--tx2); }
/* stale 冻结：整面板禁交互——与「冻结」文案语义一致，
 防树编辑以冻结旧树覆盖用户正在修正的 DSL（Monaco setValue 会清 undo 栈，覆盖不可逆）。
 .qtp-none/.qtp-single-bar 一并冻结：stale 时「加查询条件」同样会覆盖手改。 */
.qtp.froz .bgn, .qtp.froz .cn, .qtp.froz .gn, .qtp.froz .wnr, .qtp.froz .mnr, .qtp.froz .rx,
.qtp.froz .qtp-none, .qtp.froz .qtp-single-bar { pointer-events: none; opacity: .55; }
/* 头部工具（过滤/折叠/启停）一并冻结——「停用全部」会写树，冻结期覆盖手改不可逆 */
.qtp.froz .qtp-hd { pointer-events: none; opacity: .55; }
</style>
