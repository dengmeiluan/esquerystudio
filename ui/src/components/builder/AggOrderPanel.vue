<template>
  <div class="aop">
    <!-- 1031：桶聚合 order 行编辑（AggTreeNode 挂接，AST 零改动 body 直通投影，
         AggRangesPanel 同款范式）。每行 排序键 + asc/desc：排序键 = _count（文档数）/
         _key（桶键）/ 子聚合名或 stats.sum 度量路径。形态无损写回：
         · 数组形态 [{_count:"desc"}] 原样数组写回（多行合法）；
         · 单键对象形态 {_key:"asc"} 保持对象写回（不洗成数组）；加到第二行才升级数组
           （ES 语义：多排序必须数组）。
         非投影形态（多键对象）不进本面板（AggTreeNode 门控），留守自由表零丢失。 -->
    <div v-for="(r, i) in rows" :key="i" class="aop-row">
      <span class="aop-idx mono">{{ i + 1 }}</span>
      <input class="inp mono aop-key" :value="r.key" :list="'aopkeys-' + uid"
             placeholder="_count / _key / 子聚合名" title="排序键：_count=文档数、_key=桶键、子聚合名或 stats.sum 度量路径"
             @input="setKey(i, ($event.target as HTMLInputElement).value)" />
      <select class="inp aop-dir" :value="r.dir" title="排序方向" @change="setDir(i, ($event.target as HTMLSelectElement).value)">
        <option value="desc">desc 降</option>
        <option value="asc">asc 升</option>
      </select>
      <button aria-label="删除排序行" class="btn sm ghost danger" title="删除该排序" @click="delRow(i)">
        <X :size="12" />
      </button>
    </div>
    <datalist :id="'aopkeys-' + uid">
      <option v-for="k in KEY_HINTS" :key="k" :value="k" />
    </datalist>
    <div class="aop-foot">
      <button class="btn sm ghost aop-add" @click="addRow"><Plus :size="12" /> 加排序</button>
      <span v-if="!rows.length" class="aop-none">未排序（默认按文档数降序）</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X, Plus } from 'lucide-vue-next';
import { nid } from '../../utils/queryAst';

const props = defineProps<{ body: Record<string, unknown> }>();
const emit = defineEmits<{ (e: 'patch', order: unknown): void }>();

const uid = nid();
const KEY_HINTS = ['_count', '_key', 'avg', 'sum', 'min', 'max', 'stats', 'value_count'];

interface OrderRow { key: string; dir: string }

/* 读投影：数组形态取每项首键（多键项跳过=非投影，由外层门控兜底）；单键对象形态取该键。
   objForm = 原始是单键对象形态（写回时保持，不洗成数组）。 */
const objForm = computed(() => {
  const o = props.body.order;
  return !!o && typeof o === 'object' && !Array.isArray(o);
});
const rows = computed<OrderRow[]>(() => {
  const o = props.body.order;
  if (Array.isArray(o)) {
    return o
      .filter(it => it && typeof it === 'object' && !Array.isArray(it) && Object.keys(it as object).length === 1)
      .map(it => {
        const [key, dir] = Object.entries(it as Record<string, unknown>)[0];
        return { key, dir: dir === 'asc' ? 'asc' : 'desc' };
      });
  }
  if (o && typeof o === 'object') {
    const entries = Object.entries(o as Record<string, unknown>);
    if (entries.length === 1) {
      const [key, dir] = entries[0];
      return [{ key, dir: dir === 'asc' ? 'asc' : 'desc' }];
    }
  }
  return [];
});

/* 写回：行列表 → 原形态容器。单行+对象形态=对象写回；其余=数组。
   空行（键清空）从列表剔除；全部清空 = 删 order 键（undefined 由外层 onBodyPatch 落键）。 */
function write(list: OrderRow[]) {
  const clean = list.filter(r => r.key.trim() !== '');
  if (!clean.length) { emit('patch', []); return; }
  const single = clean.map(r => ({ [r.key]: r.dir }));
  if (objForm.value && clean.length === 1) emit('patch', single[0]);
  else emit('patch', single);
}
function setKey(i: number, raw: string) {
  write(rows.value.map((r, j) => (j === i ? { ...r, key: raw } : r)));
}
function setDir(i: number, dir: string) {
  write(rows.value.map((r, j) => (j === i ? { ...r, dir } : r)));
}
function delRow(i: number) { write(rows.value.filter((_, j) => j !== i)); }
function addRow() { write([...rows.value, { key: '', dir: 'desc' }]); }
</script>

<style scoped>
.aop { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); margin-bottom: var(--sp-2); }
.aop-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.aop-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; }
.aop-key { width: 158px; height: 28px; font-size: var(--fs-sm); }
.aop-dir { height: 28px; font-size: var(--fs-sm); width: 96px; }
.aop-foot { display: flex; align-items: center; gap: var(--sp-2); }
.aop-add { align-self: flex-start; }
.aop-none { font-size: var(--fs-xs); color: var(--tx2); }
</style>
