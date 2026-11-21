<template>
  <!-- 1000：检索器节点（8.14+ retriever）——六变体递归编辑。
       头行=变体下拉 + 字段位（knn/tsr）+ 参数/删除；体区按变体分派：
       standard 内嵌完整查询树（MiniTreeEditor，局部 TREE_BUS 与主树互不串扰）；
       knn 平面向量（字段收窄 dense_vector + 向量 JSON 框，非法只标红不写树）；
       rrf/linear 子检索器数组（linear 每路带 weight 行内数字框）；
       tsr/rule 单子检索器。切换变体=换新节点（载荷语义互斥，保留旧载荷只造脏 DSL）。 -->
  <div class="rte" :data-nid="node.id">
    <div class="rte-hd">
      <n-select class="rte-op" size="tiny" :value="node.op" :options="opOptions" :title="'当前变体：' + label"
                @update:value="onOp" />
      <FieldSelect
        v-if="kind === 'flat' || (kind === 'child' && (node.op === 'text_similarity_reranker' || node.op === 'diversify'))"
        class="rte-fs" :model-value="node.field || ''" :fields="fields" :types="types"
        :type-filter="kind === 'flat' || node.op === 'diversify' ? DENSE_TYPES : undefined"
        @update:model-value="v => patch({ field: v || null })"
      />
      <span style="flex:1"></span>
      <button v-if="hasParams" aria-label="变体参数（k / rank_constant / text…）" class="btn sm ghost" :class="{ on: showParams }"
              title="变体参数（k / rank_constant / text…）" @click="showParams = !showParams">
        <Settings2 :size="12" />
      </button>
      <button aria-label="删除该检索器" class="btn sm ghost danger" title="删除该检索器" @click="emit('remove')"><X :size="12" /></button>
    </div>

    <!-- knn 向量 JSON 框（JsonArea 统一件；非法只标红不写树；清空=移除键） -->
    <JsonArea v-if="kind === 'flat'" class="rte-ta" :class="{ bad: vec.bad.value }" :rows="2"
              :model-value="vec.text.value" placeholder="query_vector，如 [0.1, 0.2, …]"
              title="查询向量（JSON 数组）" @update:model-value="onVec" />

    <!-- 1047：结构体键专用 JSON 位——pinned 置顶 docs/ids、diversify 查询向量、
         rescorer rescore 体。清空=移除该键；半截 JSON 只标红不写树。 -->
    <div v-if="node.op === 'pinned'" class="rte-jsongrid">
      <RetrieverJsonField label="置顶 ids（JSON 数组）" :value="node.params.ids" allow-array
        placeholder='["doc-id-1", "doc-id-2"]' @update="v => setStruct('ids', v)" />
      <RetrieverJsonField label="置顶 docs（JSON 数组）" :value="node.params.docs" allow-array
        placeholder='[{ "_index": "idx", "_id": "doc-1" }]' @update="v => setStruct('docs', v)" />
    </div>
    <RetrieverJsonField v-if="node.op === 'diversify'" class="rte-json-wide" label="query_vector（JSON 数组）"
      :value="node.params.query_vector" allow-array placeholder="[0.1, 0.2, 0.3]"
      @update="v => setStruct('query_vector', v)" />
    <RetrieverJsonField v-if="node.op === 'rescorer'" class="rte-json-wide" label="rescore（JSON 对象）"
      :value="node.params.rescore"
      placeholder='{ "window_size": 50, "query": { "rescore_query": { "match_all": {} } } }'
      @update="v => setStruct('rescore', v)" />

    <div v-if="showParams" class="rte-params">
      <GenericParams :value="paramsView" :schema="RETRIEVER_PARAMS[node.op]" path-prefix="" @update="onParams" />
    </div>

    <!-- standard：内嵌查询树 -->
    <div v-if="kind === 'query' && node.query" class="rte-body">
      <MiniTreeEditor :node="node.query" :fields="fields" :types="types" @update:node="q => patch({ query: q })" />
    </div>

    <!-- tsr / rule：单子检索器 -->
    <div v-if="kind === 'child'" class="rte-body">
      <RetrieverEditor v-if="node.child" :node="node.child" :fields="fields" :types="types"
                       @update:node="c => patch({ child: c })" @remove="patch({ child: null })" />
      <button v-else class="btn sm ghost rte-add" @click="patch({ child: makeRetrieverByOp('standard') })">
        <Plus :size="11" /> 加子检索器（{{ node.op === 'rule' ? '规则未命中时的回退路由' : '待重排的召回源' }}）
      </button>
    </div>

    <!-- rrf / linear：子检索器数组 -->
    <div v-if="kind === 'list'" class="rte-body">
      <div v-for="(c, i) in node.children" :key="c.id" class="rte-item">
        <label v-if="wrapped" class="rte-w mono" title="weight：该路召回的线性权重">
          w<n-input-number class="rte-w-in" :value="weightNum(c.id)" :show-button="false" size="small"
                           :input-props="{ 'aria-label': 'weight ' + c.id }" @update:value="v => onWeight(c.id, v)" />
        </label>
        <RetrieverEditor :node="c" :fields="fields" :types="types"
                         @update:node="nc => patchChild(i, nc)" @remove="removeChild(i)" />
      </div>
      <button class="btn sm ghost rte-add" @click="addChild"><Plus :size="11" /> 加一路检索器</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/* 1000：RetrieverEditor 递归组件——SFC 文件名自引用承载递归。
   不持树态：一切修改经 patch 打新节点上抛（update:node）；删除上抛 remove 由父级处理。 */
import { ref, computed } from 'vue';
import { NSelect, NInputNumber } from 'naive-ui';
import { Plus, X, Settings2 } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import GenericParams from './GenericParams.vue';
import RetrieverJsonField from './RetrieverJsonField.vue';
import JsonArea from '../JsonArea.vue';
import MiniTreeEditor from './MiniTreeEditor.vue';
import { useJsonDraft } from '../../composables/useJsonDraft';
import { RETRIEVER_META, RETRIEVER_PARAMS } from '../../utils/queryAstOps';
import { makeRetrieverByOp, type RetrieverNode } from '../../utils/queryAst';

const props = defineProps<{ node: RetrieverNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{ (e: 'update:node', n: RetrieverNode): void; (e: 'remove'): void }>();

const DENSE_TYPES = ['dense_vector'];
/* 变体短枚举直 map（NSelect options；RETRIEVER_META 同源同序） */
const opOptions = Object.entries(RETRIEVER_META).map(([op, m]) => ({ label: m.label, value: op }));
const kind = computed(() => RETRIEVER_META[props.node.op]?.kind);
const wrapped = computed(() => RETRIEVER_META[props.node.op]?.wrapped === true);
const label = computed(() => RETRIEVER_META[props.node.op]?.label || props.node.op);
/* 结构体键不进食名参数表（专用 JSON 位权威编辑，避免双控件互相覆盖） */
const STRUCT_KEYS: Record<string, string[]> = {
  pinned: ['docs', 'ids'],
  diversify: ['query_vector'],
  rescorer: ['rescore'],
};
const paramsView = computed<Record<string, unknown>>(() => {
  const hidden = STRUCT_KEYS[props.node.op] || [];
  return Object.fromEntries(Object.entries(props.node.params).filter(([k]) => !hidden.includes(k)));
});
const hasParams = computed(() => (RETRIEVER_PARAMS[props.node.op] || []).length > 0
  || Object.keys(paramsView.value).length > 0);
const showParams = ref(false);

function patch(p: Partial<RetrieverNode>) { emit('update:node', { ...props.node, ...p }); }
function setStruct(key: string, v: unknown) {
  const next = { ...props.node.params };
  if (v === undefined) delete next[key]; else next[key] = v;
  patch({ params: next });
}

function onOp(op: string) { emit('update:node', makeRetrieverByOp(op)); }

/* 向量框：合法 JSON（数组/对象均可）即写树；非法只标红；清空移除键——
   useJsonDraft 三件套（半截留草稿不写树/树外变更同比较回流）与 percolate 同语言 */
const vec = useJsonDraft(
  () => (props.node.hasValue ? props.node.value : undefined),
  v => patch({ hasValue: true, value: v }),
  { allowArray: true },
);
function onVec(raw: string) {
  if (!raw.trim()) { vec.text.value = ''; vec.bad.value = false; patch({ hasValue: false, value: undefined }); return; }
  vec.onInput(raw);
}

/* GenericParams update 联合类型在此收窄（数组分支不会出现，守卫兜底）；
   专用 JSON 结构键不在 paramsView 中，回写时原样合并回来。 */
function onParams(v: Record<string, unknown> | unknown[]) {
  if (Array.isArray(v)) return;
  const keep = Object.fromEntries(Object.entries(props.node.params)
    .filter(([k]) => (STRUCT_KEYS[props.node.op] || []).includes(k)));
  patch({ params: { ...v, ...keep } });
}

/* linear 每路 weight（NInputNumber 受控）：空=删键；数字落 number */
function weightNum(id: string): number | null {
  const w = props.node.childKeys[id]?.weight;
  if (w === undefined || w === null || w === '') return null;
  const n = Number(w);
  return Number.isFinite(n) ? n : null;
}
function onWeight(id: string, v: number | null) {
  const prev: Record<string, unknown> = { ...(props.node.childKeys[id] || {}) };
  if (v === null) delete prev.weight;
  else prev.weight = v;
  patch({ childKeys: { ...props.node.childKeys, [id]: prev } });
}

function addChild() {
  const c = makeRetrieverByOp('standard');
  const childKeys = { ...props.node.childKeys };
  if (wrapped.value) childKeys[c.id] = {};
  patch({ children: [...props.node.children, c], childKeys });
}
function patchChild(i: number, nc: RetrieverNode) {
  const children = props.node.children.slice();
  children[i] = nc;
  patch({ children });
}
function removeChild(i: number) {
  const children = props.node.children.slice();
  const [gone] = children.splice(i, 1);
  const childKeys = { ...props.node.childKeys };
  delete childKeys[gone.id];
  patch({ children, childKeys });
}
</script>

<style scoped>
/* 结构语气对齐 wnr/mnr：头行密集、体区缩进嵌套；嵌套卡片渐隐（深度视觉减负） */
.rte { border: 1px solid var(--line); border-radius: var(--r-m); padding: var(--sp-1) var(--sp-2); background: var(--bg1); }
/* 1047：结构体 JSON 位布局——pinned 双列，diversify/rescorer 单列通栏 */
.rte-jsongrid { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin: var(--sp-1) 0; }
.rte-json-wide { display: flex; margin: var(--sp-1) 0; }
.rte .rte .rte { border-color: color-mix(in srgb, var(--line) 60%, transparent); }
.rte-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.rte-op { width: 176px; flex: none; }
.rte-fs { min-width: 150px; }
/* 向量 JSON 位（JsonArea 统一件，Monaco 高度 rows 档自管）；非法中间态红边落在 .ja 外壳 */
.rte-ta { width: 100%; margin-top: var(--sp-1); }
.rte-ta.bad { border-color: var(--warn); }
.rte-params { margin-top: var(--sp-2); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
.rte-body { margin-top: var(--sp-2); padding-left: var(--sp-2); border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: var(--sp-2); }
.rte-item { display: flex; align-items: flex-start; gap: var(--sp-1h); }
.rte-item > .rte { flex: 1; min-width: 0; }
.rte-w { flex: none; display: inline-flex; align-items: center; gap: 3px; margin-top: var(--sp-1h);
  font-size: var(--fs-xs); color: var(--tx2); }
/* weight 数值位（NInputNumber 无步进钮窄形，small 档自带高度与内衬） */
.rte-w-in { width: 56px; }
.rte-add { align-self: flex-start; }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
