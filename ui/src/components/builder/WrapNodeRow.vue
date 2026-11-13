<template>
  <div class="wnr" :data-nid="node.id">
    <div class="wnr-hd" tabindex="0" @contextmenu.prevent="openRowMenu" @keydown.self="onRowMenuKey">
      <NodeSelectBox :id="node.id" />
      <span class="wnr-grip" title="拖拽排序（按住拖动）；Alt+↑/↓ 上移/下移" draggable="true" @dragstart.stop="onDragStart" @dragend="endDrag">⋮⋮</span>
      <span class="wnr-op">{{ WRAP_LABELS[node.op] || node.op }}</span>
      <!-- 无路由字段包装（constant_score 等）不渲染字段段；有路由字段显示键名+FieldSelect -->
      <template v-if="node.field !== null">
        <code class="wnr-fk">{{ WRAP_FIELD[node.op] }}</code>
        <FieldSelect
          :model-value="node.field" :fields="fields" :types="types" :type-priority="wrapperPriority"
          @update:model-value="v => emit('update:node', { ...node, field: v })"
        />
      </template>
      <code v-else class="wnr-fk mono">{{ node.childKey || 'query' }}</code>
      <span style="flex:1"></span>
      <button aria-label="参数（score_mode 等）" class="btn sm ghost" :class="{ on: showParams }" title="参数（score_mode 等）"
              @click="showParams = !showParams">
<SlidersHorizontal :size="12" />
</button>
      <button aria-label="包成 bool 组" class="btn sm ghost" title="包成 bool 组" @click="emit('wrap')"><Group :size="12" /></button>
      <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="emit('remove')"><X :size="12" /></button>
    </div>
    <div v-if="showParams" class="wnr-params">
      <GenericParams :value="paramsView" :schema="wrapSchema" path-prefix="" @update="onParams" />
    </div>
    <!-- 989：function_score functions 数组结构化编辑（评分函数行列表；AST 零改动 params 直通）。
         1009：fields/types 透传——filter 查询树与衰减函数字段快径需要字段候选 -->
    <FsFunctionsPanel v-if="node.op === 'function_score'" :params="node.params" :fields="fields" :types="types"
                      @update="p => emit('update:node', { ...node, params: p })" />
    <!-- 1015：pinned ids 数组 chips 编辑位（1005 terms/ids 同款交互：回车/逗号提交、
         粘贴按项拆分、IME Enter 守卫、空输入退格删末项、chip 可删）。AST 零改动：
         params.ids 直通往返；docs 形态/ids 非数组不走此位（params 表保真） -->
    <div v-if="pinnedIds" class="wnr-ids" role="group"
         aria-label="置顶文档 id 列表：回车或逗号添加，空输入退格删末项">
      <span class="wnr-ids-lb">置顶 ids</span>
      <span v-for="(v, i) in pinnedIds" :key="i" class="wnr-chip mono" :title="String(v)">
        <span class="wnr-chip-v">{{ v }}</span>
        <button type="button" class="wnr-chip-x" :aria-label="'删除 id ' + v" :title="'删除 id ' + v"
                @click="delId(i)"><X :size="10" /></button>
      </span>
      <input
        class="inp mono wnr-ids-in" v-model="idDraft"
        :placeholder="pinnedIds.length ? '' : '文档 _id，回车添加'"
        @keydown.enter.prevent="onIdEnter($event)"
        @keydown="onIdKey"
        @blur="commitIds()"
      />
    </div>
    <div class="wnr-body">
      <!-- 1054：nested 内字段域提示——子条件只列 path.* 子字段；映射未展开时明示回退全量 -->
      <div v-if="nestedScope" class="wnr-scope" :class="{ warn: nestedScope.fallback }"
           :title="nestedScope.fallback
             ? '映射里未列出 ' + nestedScope.prefix + '.* 子字段（可能未展开 nested properties），暂列全量字段'
             : 'nested 查询只对 ' + nestedScope.prefix + ' 下的子字段生效；子条件候选已收窄，避免误选顶层字段而静默零命中'">
        {{ nestedScope.fallback ? '未发现内嵌子字段 · 暂列全量' : '内嵌域 · ' + nestedScope.fields.length + ' 字段' }}
      </div>
      <NodeRenderer
        v-if="node.child" :node="node.child" :fields="childFields" :types="types"
        @update:node="n => emit('update:node', { ...node, child: n })"
        @remove="emit('update:node', { ...node, child: null })"
        @wrap="emit('update:node', { ...node, child: wrapInBool(node.child!, node.child!.id) })"
      />
      <button v-else class="btn sm ghost" @click="addChild"><Plus :size="12" /> 加子查询（bool 组）</button>
    </div>
    <!-- 1351：包装行右键（bool 组/条件行之后的第三类节点入口）——见脚本内说明 -->
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowTitle"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
/* W1：包装节点行（nested/has_child/has_parent 路由字段族 + 985 扩员 constant_score/
 function_score/script_score/pinned 无路由字段族——字段段按 field!==null 分派）。
 child=null 时序列化兜底 match_all（ 契约）。子节点不传给解散入口（dissolve 仅支持 bool-in-bool）。 */
import { ref, computed } from 'vue';
import { X, Group, Plus, SlidersHorizontal, Copy, Braces, Code2 } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import GenericParams from './GenericParams.vue';
import FsFunctionsPanel from './FsFunctionsPanel.vue';
import NodeRenderer from './NodeRenderer.vue';
import NodeSelectBox from './NodeSelectBox.vue';
import CellContextMenu, { type CcmItem } from '../CellContextMenu.vue'; /* 1351：包装行右键 */
import { copyText } from '../../utils/format';
import { useAppStore } from '../../stores/app';
import { serQueryNode } from '../../utils/queryAst';
import { DRAG_KEY, fireDrag } from './treeBus';
import { WRAP_LABELS, WRAP_PARAMS, NAME_PARAM } from '../../utils/queryAstOps';
import { WRAP_FIELD, nid, wrapInBool, type WrapNode, type BoolNode } from '../../utils/queryAst';
import { isMenuKey, menuKeyAnchor } from '../../utils/menuKey';
import { nestedFieldScope } from '../../utils/fieldSearch';

const props = defineProps<{ node: WrapNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{
  (e: 'update:node', n: WrapNode): void; (e: 'remove'): void; (e: 'wrap'): void;
}>();
/* 【W3b】包装路由字段的类型置顶按 node.op 分派——实地核真 useIndexFields.walk：mapping 里
 type:'nested'/'join' 按原类型入表、纯 properties 节点入 'object'，包装路由字段（nested 的
 path / has_child·has_parent 的 join 字段名）类型是 nested/object/join，原 ['keyword'] 置顶
 基本永不命中（打空）。nested→嵌套路径（nested/object 置顶）；has_child/has_parent→join 字段；
 未知 wrap 算子回落 keyword（keyword 精确语义兜底）。typePriority 只重排候选分组、不改候选集；
 fields 传参与 dsl-assist 计数链路不动（fieldPickerPenetration 契约）。 */
const WRAPPER_PRIORITY_BY_OP: Record<string, string[]> = {
  nested: ['nested', 'object'],
  has_child: ['join'],
  has_parent: ['join'],
};
const wrapperPriority = computed<string[]>(() => WRAPPER_PRIORITY_BY_OP[props.node.op] || ['keyword']);
const showParams = ref(false);

/* 1054：nested 子树字段域——只把 path.* 子字段传给子渲染器（含嵌套默认字段与 FieldSelect 候选）；
   映射未展开子字段时回退全量并出 warn 提示。嵌套内的 nested 会基于已收窄列表继续收窄。 */
const nestedScope = computed(() => {
  if (props.node.op !== 'nested' || !props.node.field) return null;
  const s = nestedFieldScope(props.fields, props.node.field);
  return { ...s, prefix: s.prefix };
});
const childFields = computed(() => nestedScope.value ? nestedScope.value.fields : props.fields);

/* ═══ 1351：包装行右键 ═══
 nested / function_score / constant_score 这类容器只有行头 2~3 个图标钮，且容器往往是
 「整棵子树」语义——右键把「作用在这一层包装」的动作收成一级 2 项 + 分组，
 并补两条此前无入口的只读导出（本层 JSON / DSL 片段，排查嵌套形态用）。 */
const rowMenu = ref<{ x: number; y: number } | null>(null);
const rowTitle = computed(() => {
  const n = props.node;
  const who = n.field ? ' · ' + n.field : '';
  return '包装 · ' + (WRAP_LABELS[n.op] || n.op) + who;
});
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
  useAppStore().notify(ok ? 'success' : 'error', ok ? '已复制包装节点 JSON' : '复制失败');
}
async function copyDsl() {
  const ok = await copyText(JSON.stringify(serQueryNode(props.node), null, 2));
  useAppStore().notify(ok ? 'success' : 'error', ok ? '已复制为 DSL 片段（可直接贴到 Dev Tools）' : '复制失败');
}
const rowMenuItems = computed<CcmItem[]>(() => [
  { key: 'copy-dsl-1', label: '复制为 DSL 片段', icon: Code2, run: () => void copyDsl() },
  {
    key: 'copy-more', label: '复制…', icon: Copy, sep: true, children: [
      { key: 'copy-json', label: '复制包装节点 JSON', icon: Braces, run: () => void copyJson() },
      ...(props.node.child ? [{ key: 'copy-child', label: '复制子查询为 DSL 片段', icon: Code2, run: () => void copyChildDsl() }] : []),
    ],
  },
  {
    key: 'shape-group', label: '结构…', icon: Group, children: [
      { key: 'wrap', label: '包进新的 bool 组', icon: Group, run: () => emit('wrap') },
    ],
  },
  { key: 'del', label: '删除此包装', icon: X, danger: true, sep: true, run: () => emit('remove') },
]);
async function copyChildDsl() {
  if (!props.node.child) return;
  const ok = await copyText(JSON.stringify(serQueryNode(props.node.child), null, 2));
  useAppStore().notify(ok ? 'success' : 'error', ok ? '已复制子查询 DSL 片段' : '复制失败');
}

/* 1033：_name 命名查询恒在建议末位（nested/function_score 等容器子句同属查询子句，
   与 ClauseNode/MultiNodeRow 同语言）；未在册容器（pinned/span_multi 等）也给空
   schema 基础上的 _name 单建议 */
const wrapSchema = computed(() => {
  const base = WRAP_PARAMS[props.node.op] || [];
  return base.some(p => p.key === '_name') ? base : [...base, NAME_PARAM];
});

/* ═══ 1015：pinned ids chips（ClauseNode 1005 cn-chips 同语言）═══
   draft 不写树（半截值不进 DSL），提交才整项入账；粘贴含逗号按项拆分；
   IME 组合态 Enter 是提交原文不误拆；清空保空数组键（pinned 必须有 ids/docs 之一，
   空数组=编辑中间态，ES 侧由 lint/执行报错兜底） */
const pinnedIds = computed<unknown[] | null>(() =>
  props.node.op === 'pinned' && Array.isArray(props.node.params.ids) ? props.node.params.ids : null);
const idDraft = ref('');
function patchIds(list: unknown[]) {
  const params = { ...props.node.params, ids: list };
  emit('update:node', { ...props.node, params });
}
function commitIds() {
  const raw = idDraft.value;
  idDraft.value = '';
  const parts = raw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  if (parts.length && pinnedIds.value) patchIds([...pinnedIds.value, ...parts]);
}
function delId(i: number) {
  if (!pinnedIds.value) return;
  patchIds(pinnedIds.value.filter((_, j) => j !== i));
}
function onIdEnter(e: KeyboardEvent) { if (!e.isComposing) commitIds(); }
function onIdKey(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (e.key === 'Backspace' && !idDraft.value && pinnedIds.value?.length) {
    e.preventDefault();
    patchIds(pinnedIds.value.slice(0, -1));
  } else if (e.key === ',' || e.key === '，') {
    e.preventDefault();
    commitIds();
  }
}

function addChild() {
  const g: BoolNode = { id: nid(), type: 'bool', children: [], params: {}, arrForm: {} };
  emit('update:node', { ...props.node, child: g });
}
/* params 恒为对象：GenericParams 的 update 联合类型在此收窄（数组分支不会出现，守卫兜底）。
   pinned 的 ids 由 chips 权威编辑——参数表视图剥离、表内加出 ids 路由回 chips（不静默丢弃） */
const paramsView = computed<Record<string, unknown>>(() => {
  if (props.node.op !== 'pinned') return props.node.params;
  const { ids, ...rest } = props.node.params;
  return rest;
});
function onParams(v: Record<string, unknown> | unknown[]) {
  if (Array.isArray(v)) return;
  if (props.node.op === 'pinned') {
    const { ids, ...rest } = v;
    const out: Record<string, unknown> = { ...rest };
    if (ids !== undefined) out.ids = ids;   // 表内改出 ids 路由回 params（数组走 chips 位、非数组保真共存）
    emit('update:node', { ...props.node, params: out });
    return;
  }
  emit('update:node', { ...props.node, params: v });
}
function onDragStart(e: DragEvent) {
  (window as any)[DRAG_KEY] = props.node.id;
  e.dataTransfer?.setData('text/plain', props.node.id);
  fireDrag(true);
}
function endDrag() { delete (window as any)[DRAG_KEY]; fireDrag(false); }
</script>

<style scoped>
.wnr { border: 1px solid var(--line-strong); border-radius: var(--r-s); background: var(--bg1); padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2); }
.wnr-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.wnr-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; }
.wnr-op { font-size: var(--fs-sm); font-weight: 600; color: var(--ac-hi); }
.wnr-fk { font-size: var(--fs-2xs); color: var(--tx2); }
.wnr-params { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.wnr-ids { display: flex; align-items: center; gap: var(--sp-1); flex-wrap: wrap; margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.wnr-ids-lb { font-size: var(--fs-2xs); color: var(--tx2); margin-right: var(--sp-1); }
.wnr-chip { display: inline-flex; align-items: center; gap: 2px; max-width: 200px; padding: 1px 4px 1px 8px; background: var(--bg1); border: 1px solid var(--line-strong); border-radius: 999px; font-size: var(--fs-2xs); }
.wnr-chip-v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wnr-chip-x { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: none; border-radius: 50%; background: transparent; color: var(--tx2); cursor: pointer; }
.wnr-chip-x:hover { background: var(--hover); color: var(--tx1); }
.wnr-ids-in { width: 160px; height: 26px; font-size: var(--fs-sm); border: none; background: transparent; }
.wnr-ids-in:focus { outline: none; }
.wnr-body { margin-top: var(--sp-2); padding-left: var(--sp-2); border-left: 2px solid var(--line); }
.wnr-scope { display: inline-flex; align-items: center; gap: var(--sp-1); margin-bottom: var(--sp-1); padding: 1px var(--sp-1h); border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg2); color: var(--tx2); font-size: var(--fs-2xs); }
.wnr-scope.warn { color: var(--warn); background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
</style>
