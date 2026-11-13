<template>
  <div class="afp">
    <!-- 1022：filters 聚合的 buckets 一等编辑（AggTreeNode 挂接，AST 零改动）。
     命名形态（{名: 查询}）：bucket 行 = 名输入 + MiniTreeEditor 查询树（完整 ES 查询，
     bool/nested 全套树编辑）+ 删；匿名数组形态：行序号 + 树。other_bucket 等参数走
     外层 schema 表。裸查询树写回经 serQueryNode（往返硬契约），畸形值 __raw__ 保真。 -->
    <template v-if="mode === 'named'">
      <div v-for="(b, i) in namedBuckets" :key="i" class="afp-row">
        <span class="afp-idx mono">{{ i + 1 }}</span>
        <input class="inp mono afp-name" :value="b.key" placeholder="桶名"
               title="桶名（结果按名返回）" @input="setKey(i, ($event.target as HTMLInputElement).value)" />
        <button aria-label="删除桶" class="btn sm ghost danger" title="删除该桶" @click="delBucket(i)">
          <X :size="12" />
        </button>
        <div class="afp-tree">
          <MiniTreeEditor :node="b.node" :fields="fields" :types="types" @update:node="n => setQuery(i, n)" />
        </div>
      </div>
      <button class="btn sm ghost afp-add" @click="addNamed"><Plus :size="12" /> 加桶</button>
    </template>
    <template v-else-if="mode === 'anon'">
      <div v-for="(n, i) in anonNodes" :key="i" class="afp-row">
        <span class="afp-idx mono">{{ i + 1 }}</span>
        <button aria-label="删除桶" class="btn sm ghost danger" title="删除该桶" @click="delAnon(i)">
          <X :size="12" />
        </button>
        <div class="afp-tree">
          <MiniTreeEditor :node="n" :fields="fields" :types="types" @update:node="q => setAnon(i, q)" />
        </div>
      </div>
      <button class="btn sm ghost afp-add" @click="addAnon"><Plus :size="12" /> 加条件</button>
    </template>
    <span v-else class="afp-none">filters 键形态非对象/数组——参数表原样编辑</span>
  </div>
</template>

<script setup lang="ts">
import { computed, withDefaults } from 'vue';
import { X, Plus } from 'lucide-vue-next';
import MiniTreeEditor from './MiniTreeEditor.vue';
import { parseQueryNode, serQueryNode, nid, type QueryNode, type LeafNode } from '../../utils/queryAst';

/* 空桶骨架：match_all（MiniTreeEditor 同款——删根/空组回 match_all 的兜底语义同源） */
function matchAllLeaf(): LeafNode {
  return { id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null };
}

const props = withDefaults(defineProps<{
  body: Record<string, unknown>;
  fields?: string[];
  types?: Record<string, string>;
}>(), { fields: () => [], types: () => ({}) });
const emit = defineEmits<{ (e: 'patch', filtersValue: unknown): void }>();

const filtersVal = computed(() => props.body.filters);
const mode = computed<'named' | 'anon' | null>(() => {
  const v = filtersVal.value;
  if (v && typeof v === 'object' && !Array.isArray(v)) return 'named';
  if (Array.isArray(v)) return 'anon';
  return null;
});

/* 命名桶：parse 每桶查询（畸形落 __raw__ 保真）；名恒字符串（非串名原样桶仅展示，编辑走 raw） */
const namedBuckets = computed<Array<{ key: string; node: QueryNode }>>(() => {
  if (mode.value !== 'named') return [];
  return Object.entries(filtersVal.value as Record<string, unknown>).map(([key, q]) => ({ key, node: parseQueryNode(q) }));
});
function writeNamed(list: Array<{ key: string; node: QueryNode }>) {
  const out: Record<string, unknown> = {};
  for (const b of list) out[b.key] = serQueryNode(b.node);
  emit('patch', out);
}
function setKey(i: number, raw: string) { writeNamed(namedBuckets.value.map((b, j) => j === i ? { ...b, key: raw } : b)); }
function setQuery(i: number, n: QueryNode) { writeNamed(namedBuckets.value.map((b, j) => j === i ? { ...b, node: n } : b)); }
function delBucket(i: number) { writeNamed(namedBuckets.value.filter((_, j) => j !== i)); }
function addNamed() { writeNamed([...namedBuckets.value, { key: 'bucket_' + (namedBuckets.value.length + 1), node: matchAllLeaf() }]); }

/* 匿名数组：逐项树 */
const anonNodes = computed<QueryNode[]>(() =>
  mode.value === 'anon' ? (filtersVal.value as unknown[]).map(parseQueryNode) : []);
function writeAnon(list: QueryNode[]) { emit('patch', list.map(serQueryNode)); }
function setAnon(i: number, q: QueryNode) { writeAnon(anonNodes.value.map((n, j) => j === i ? q : n)); }
function delAnon(i: number) { writeAnon(anonNodes.value.filter((_, j) => j !== i)); }
function addAnon() { writeAnon([...anonNodes.value, matchAllLeaf()]); }
</script>

<style scoped>
.afp { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); margin-bottom: var(--sp-2); }
.afp-row { display: flex; align-items: flex-start; gap: var(--sp-2); flex-wrap: wrap; }
.afp-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; margin-top: 6px; }
.afp-name { width: 120px; height: 28px; font-size: var(--fs-sm); }
.afp-row > button { margin-top: 2px; }
.afp-tree { flex-basis: 100%; padding: var(--sp-2); background: var(--bg1); border-radius: var(--r-s); }
.afp-add { align-self: flex-start; }
.afp-none { font-size: var(--fs-xs); color: var(--tx2); }
</style>
