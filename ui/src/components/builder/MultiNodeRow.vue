<template>
  <div class="mnr" :data-nid="node.id">
    <div class="mnr-hd" tabindex="0" @contextmenu.prevent="openRowMenu" @keydown.self="onRowMenuKey">
      <NodeSelectBox :id="node.id" />
      <span class="mnr-grip" title="拖拽排序（按住拖动）；Alt+↑/↓ 上移/下移" draggable="true" @dragstart.stop="onDragStart" @dragend="endDrag">⋮⋮</span>
      <span class="mnr-op">{{ MULTI_LABELS[node.op] || node.op }}</span>
      <code class="mnr-fk mono">{{ node.op }}</code>
      <span style="flex:1"></span>
      <button aria-label="参数（negative_boost 等）" class="btn sm ghost" :class="{ on: showParams }" title="参数（negative_boost 等）"
              @click="showParams = !showParams">
        <SlidersHorizontal :size="12" />
      </button>
      <button aria-label="包成 bool 组" class="btn sm ghost" title="包成 bool 组" @click="emit('wrap')"><Group :size="12" /></button>
      <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="emit('remove')"><X :size="12" /></button>
    </div>
    <div v-if="showParams" class="mnr-params">
      <GenericParams :value="node.params" :schema="paramSchema" path-prefix="" @update="onParams" />
    </div>
    <div v-for="k in meta.keys" :key="k" class="mnr-part">
      <div class="mnr-part-hd">
        <span class="mnr-part-tx">{{ meta.partLabel[k] }}</span>
        <span style="flex:1"></span>
        <button class="btn sm ghost" :title="'在此分区加子查询'" @click="addChild(k)"><Plus :size="11" /> 子查询</button>
      </div>
      <NodeRenderer
        v-for="c in childrenOf(k)" :key="c.node.id"
        :node="c.node" :fields="fields" :types="types"
        @update:node="n => replaceChild(c.node.id, n)"
        @remove="removeChild(c.node.id)"
        @wrap="emit('update:node', { ...node, children: node.children.map(x => x.node.id === c.node.id ? { key: x.key, node: wrapInBool(x.node, x.node.id) } : x) })"
      />
      <div v-if="!childrenOf(k).length" class="mnr-empty">空分区</div>
    </div>
    <!-- 1351：多子查询容器右键（与 bool 组/包装行同批补齐） -->
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowTitle"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
/* 985：多子查询容器行（boosting 正负加权 / dis_max 多查询取最大）。
 分区按 MULTI_META.keys 固定序渲染；子查询增删本地展开新 children（emit 新节点）。
 拖拽只做源（整容器移动靠 bool 组分区落点）；容器内子查询排序不支持拖拽——
 子查询语义位置由分区键决定，跨分区拖拽会改变语义，留给「+ 子查询」显式操作。 */
import { ref, computed } from 'vue';
import { X, Group, Plus, SlidersHorizontal, Copy, Braces, Code2 } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';
import NodeRenderer from './NodeRenderer.vue';
import NodeSelectBox from './NodeSelectBox.vue';
import CellContextMenu, { type CcmItem } from '../CellContextMenu.vue'; /* 1351：容器行右键 */
import { copyText } from '../../utils/format';
import { useAppStore } from '../../stores/app';
import { serQueryNode } from '../../utils/queryAst';
import { DRAG_KEY, fireDrag } from './treeBus';
import { MULTI_META, MULTI_LABELS, NAME_PARAM } from '../../utils/queryAstOps';
import { nid, wrapInBool, type MultiNode, type QueryNode, type LeafNode } from '../../utils/queryAst';
import { isMenuKey, menuKeyAnchor } from '../../utils/menuKey';
import { defaultLeafTarget, curFieldSearchIndex } from '../../utils/fieldSearch';

const props = defineProps<{ node: MultiNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{
  (e: 'update:node', n: MultiNode): void; (e: 'remove'): void; (e: 'wrap'): void;
}>();

const meta = computed(() => MULTI_META[props.node.op] || { keys: [], arrKeys: [], partLabel: {} });
/* 1033：_name 命名查询恒在建议末位（与 ClauseNode 同语言） */
const paramSchema = computed(() => {
  const base = MULTI_META[props.node.op]?.params || [];
  return base.some(p => p.key === '_name') ? base : [...base, NAME_PARAM];
});
const showParams = ref(false);

const childrenOf = (k: string) => props.node.children.filter(c => c.key === k);
/* 默认子查询 = bool 组壳 + 本索引最近字段条件（BoolGroupNode.addGroup 同款体验；
 无 pinia/无字段源回落 match_all——clauseNode.spec 裸挂载环境同款护栏） */
function defaultLeaf(): LeafNode {
  const t = defaultLeafTarget(props.fields, props.types, curFieldSearchIndex());
  return t
    ? { id: nid(), type: 'leaf', op: t.op, field: t.field, value: '', params: {}, raw: null }
    : { id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null };
}
function addChild(k: string) {
  const g = { id: nid(), type: 'bool' as const, children: [{ occur: 'must' as const, node: defaultLeaf() }], params: {}, arrForm: { must: true } };
  emit('update:node', { ...props.node, children: [...props.node.children, { key: k, node: g }] });
}
function replaceChild(id: string, n: QueryNode) {
  emit('update:node', {
    ...props.node,
    children: props.node.children.map(c => (c.node.id === id ? { key: c.key, node: n } : c)),
  });
}
function removeChild(id: string) {
  emit('update:node', { ...props.node, children: props.node.children.filter(c => c.node.id !== id) });
}
/* params 恒为对象：GenericParams 的 update 联合类型在此收窄（数组分支不会出现，守卫兜底） */
function onParams(v: Record<string, unknown> | unknown[]) {
  if (!Array.isArray(v)) emit('update:node', { ...props.node, params: v });
}
function onDragStart(e: DragEvent) {
  (window as any)[DRAG_KEY] = props.node.id;
  e.dataTransfer?.setData('text/plain', props.node.id);
  fireDrag(true);
}
function endDrag() { delete (window as any)[DRAG_KEY]; fireDrag(false); }

/* ═══ 1351：多子查询容器右键 ═══
 boosting / dis_max 的容器头只有 3 个图标钮，容器内的子查询按分区键分布——
 右键把「作用在这个容器」的动作收成一级 2 项 + 分组，并补本层 JSON / DSL 只读导出。 */
const rowMenu = ref<{ x: number; y: number } | null>(null);
const rowTitle = computed(() => '容器 · ' + (MULTI_LABELS[props.node.op] || props.node.op) + ' · ' + props.node.op);
function openRowMenu(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest('input, textarea, select, .monaco-editor')) return;
  rowMenu.value = { x: e.clientX, y: e.clientY };
}
function onRowMenuKey(e: KeyboardEvent) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = menuKeyAnchor(e);
}
async function copyJson() {
  const ok = await copyText(JSON.stringify(props.node, null, 2));
  useAppStore().notify(ok ? 'success' : 'error', ok ? '已复制容器 JSON' : '复制失败');
}
async function copyDsl() {
  const ok = await copyText(JSON.stringify(serQueryNode(props.node), null, 2));
  useAppStore().notify(ok ? 'success' : 'error', ok ? '已复制为 DSL 片段（可直接贴到 Dev Tools）' : '复制失败');
}
const rowMenuItems = computed<CcmItem[]>(() => [
  { key: 'copy-dsl-1', label: '复制为 DSL 片段', icon: Code2, run: () => void copyDsl() },
  { key: 'copy-more', label: '复制…', icon: Copy, sep: true, children: [
    { key: 'copy-json', label: '复制容器 JSON', icon: Braces, run: () => void copyJson() },
  ] },
  { key: 'shape-group', label: '结构…', icon: Group, children: [
    { key: 'wrap', label: '包进新的 bool 组', icon: Group, run: () => emit('wrap') },
  ] },
  { key: 'del', label: '删除此容器', icon: X, danger: true, sep: true, run: () => emit('remove') },
]);
</script>

<style scoped>
.mnr { border: 1px solid var(--line-strong); border-radius: var(--r-s); background: var(--bg1); padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2); }
.mnr-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.mnr-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; flex-shrink: 0; }
.mnr-op { font-size: var(--fs-sm); font-weight: 600; color: var(--ac-hi); }
.mnr-fk { font-size: var(--fs-2xs); color: var(--tx2); }
.mnr-params { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.mnr-part { margin-top: var(--sp-2); padding-left: var(--sp-2); border-left: 2px solid var(--line); }
.mnr-part-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-0); }
.mnr-part-tx { font-size: var(--fs-xs); color: var(--tx2); }
.mnr-empty { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1) 0; }
</style>
