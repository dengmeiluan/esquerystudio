<template>
  <!-- 1000：检索器节点（8.14+ retriever）——六变体递归编辑。
       头行=变体下拉 + 字段位（knn/tsr）+ 参数/删除；体区按变体分派：
       standard 内嵌完整查询树（MiniTreeEditor，局部 TREE_BUS 与主树互不串扰）；
       knn 平面向量（字段收窄 dense_vector + 向量 JSON 框，非法只标红不写树）；
       rrf/linear 子检索器数组（linear 每路带 weight 行内数字框）；
       tsr/rule 单子检索器。切换变体=换新节点（载荷语义互斥，保留旧载荷只造脏 DSL）。 -->
  <div class="rte" :data-nid="node.id">
    <div class="rte-hd">
      <select class="inp rte-op mono" :value="node.op" :title="'当前变体：' + label"
              @change="onOp(($event.target as HTMLSelectElement).value)">
        <option v-for="(m, op) in RETRIEVER_META" :key="op" :value="op">{{ m.label }}</option>
      </select>
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

    <!-- knn 向量 JSON 框（非法只标红不写树；清空=移除键） -->
    <textarea v-if="kind === 'flat'" class="inp mono rte-ta" :class="{ bad: vecBad }" rows="2" spellcheck="false"
              :value="vecText" placeholder="query_vector，如 [0.1, 0.2, …]" title="查询向量（JSON 数组）" @input="onVec" />

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
          w<input class="inp mono rte-w-in" type="number" step="any" :value="weightOf(c.id)" @input="onWeight(c.id, $event)" />
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
import { Plus, X, Settings2 } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import GenericParams from './GenericParams.vue';
import RetrieverJsonField from './RetrieverJsonField.vue';
import MiniTreeEditor from './MiniTreeEditor.vue';
import { RETRIEVER_META, RETRIEVER_PARAMS } from '../../utils/queryAstOps';
import { makeRetrieverByOp, type RetrieverNode } from '../../utils/queryAst';

const props = defineProps<{ node: RetrieverNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{ (e: 'update:node', n: RetrieverNode): void; (e: 'remove'): void }>();

const DENSE_TYPES = ['dense_vector'];
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

/* 向量框：合法 JSON 即写树；非法只标红；清空移除键 */
const vecText = computed(() => (props.node.hasValue ? JSON.stringify(props.node.value) : ''));
const vecBad = ref(false);
function onVec(e: Event) {
  const t = (e.target as HTMLTextAreaElement).value.trim();
  if (!t) { vecBad.value = false; patch({ hasValue: false, value: undefined }); return; }
  try { patch({ hasValue: true, value: JSON.parse(t) }); vecBad.value = false; }
  catch { vecBad.value = true; }
}

/* GenericParams update 联合类型在此收窄（数组分支不会出现，守卫兜底）；
   专用 JSON 结构键不在 paramsView 中，回写时原样合并回来。 */
function onParams(v: Record<string, unknown> | unknown[]) {
  if (Array.isArray(v)) return;
  const keep = Object.fromEntries(Object.entries(props.node.params)
    .filter(([k]) => (STRUCT_KEYS[props.node.op] || []).includes(k)));
  patch({ params: { ...v, ...keep } });
}

/* linear 每路 weight：空=删键；非数字原样存字符串交给 ES 报错即教育 */
function weightOf(id: string): string {
  const w = props.node.childKeys[id]?.weight;
  return w === undefined ? '' : String(w);
}
function onWeight(id: string, e: Event) {
  const t = (e.target as HTMLInputElement).value;
  const prev: Record<string, unknown> = { ...(props.node.childKeys[id] || {}) };
  if (t === '') delete prev.weight;
  else if (Number.isFinite(Number(t))) prev.weight = Number(t);
  else prev.weight = t;
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
.rte-op { max-width: 200px; height: 30px; font-size: var(--fs-sm); }
.rte-fs { min-width: 150px; }
.rte-ta { width: 100%; margin-top: var(--sp-1); resize: vertical; }
.rte-ta.bad { border-color: var(--warn); }
.rte-params { margin-top: var(--sp-2); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
.rte-body { margin-top: var(--sp-2); padding-left: var(--sp-2); border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: var(--sp-2); }
.rte-item { display: flex; align-items: flex-start; gap: var(--sp-1h); }
.rte-item > .rte { flex: 1; min-width: 0; }
.rte-w { flex: none; display: inline-flex; align-items: center; gap: 3px; margin-top: var(--sp-1h);
  font-size: var(--fs-xs); color: var(--tx2); }
.rte-w-in { width: 56px; height: 24px; font-size: var(--fs-xs); padding: 0 4px; }
.rte-add { align-self: flex-start; }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
