<template>
  <div class="acp">
    <!-- 1037：composite 聚合 sources 行编辑（AggTreeNode 挂接，AST 零改动 body 直通投影，
         AggOrderPanel 同款范式）。每行=类型下拉（term/histogram/date_histogram）+ field 行
         FieldSelect（field-keys 机制）+ 内参递归表（类型化 schema：interval/calendar_interval
         等升具名控件）。形态无损：sources 恒数组写回；换类型保留 field 旧值（跨型复用
         同一字段是最常见意图）；无键时给单行骨架（加源是 composite 第一步=可发现性）；
         非投影形态（多键源项）不进面板（外层门控）留守自由表零丢失。 -->
    <div v-for="(r, i) in rows" :key="i" class="acp-row">
      <span class="acp-idx mono">{{ i + 1 }}</span>
      <select class="inp acp-type" :value="r ? r.typeKey : 'term'" title="分桶类型"
              @change="setType(i, ($event.target as HTMLSelectElement).value)">
        <option value="term">词项 term</option>
        <option value="histogram">数值直方图</option>
        <option value="date_histogram">日期直方图</option>
      </select>
      <template v-if="r">
        <FieldSelect :model-value="String(r.inner.field ?? '')" :fields="fields" :types="types"
                     @update:model-value="v => onInner(i, { ...(r.inner as Record<string, unknown>), field: v })" />
        <button aria-label="源内参" class="btn sm ghost" :class="{ on: innerIdx === i }"
                title="源内参（interval/calendar_interval/format…）" @click="innerIdx = innerIdx === i ? null : i">
          <SlidersHorizontal :size="12" />
        </button>
        <button aria-label="删除该源" class="btn sm ghost danger" title="删除该源" @click="delRow(i)">
          <X :size="12" />
        </button>
        <div v-if="innerIdx === i" class="acp-inner">
          <GenericParams :value="r.inner" :schema="INNER_PARAMS[r!.typeKey] || []" path-prefix=""
                         :field-keys="['field']" :fields="fields" :types="types"
                         @update="v => { if (!Array.isArray(v)) onInner(i, v); }" />
        </div>
      </template>
    </div>
    <button class="btn sm ghost acp-add" @click="addRow"><Plus :size="12" /> 加源（多键分组）</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { X, Plus, SlidersHorizontal } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import GenericParams from './GenericParams.vue';
import type { ParamMeta } from '../../utils/queryAstOps';

/* fields/types 可缺省（裸挂载测试环境），默认空候选仍可自由输入 */
const props = withDefaults(defineProps<{
  body: Record<string, unknown>;
  fields?: string[];
  types?: Record<string, string>;
}>(), { fields: () => [], types: () => ({}) });
const emit = defineEmits<{ (e: 'patch', sources: unknown): void }>();

interface SourceRow { typeKey: string; inner: Record<string, unknown> }

/* 类型内参 schema（field 是结构位走 field-keys 不在册） */
const INNER_PARAMS: Record<string, ParamMeta[]> = {
  term: [],
  histogram: [{ key: 'interval', kind: 'number' }, { key: 'keyed', kind: 'boolean' }],
  date_histogram: [
    { key: 'calendar_interval', kind: 'text' }, { key: 'fixed_interval', kind: 'text' },
    { key: 'format', kind: 'text' }, { key: 'time_zone', kind: 'text' },
  ],
};
const TYPES = ['term', 'histogram', 'date_histogram'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const innerIdx = ref<number | null>(null);

/* 读投影：可投影源项（单类型键+对象体）→ 行；键缺席 → 单行虚拟骨架（null 标记）；
   非投影形态不会走到这里（外层 sourcesShown 门控） */
const rows = computed<Array<SourceRow | null>>(() => {
  const s = props.body.sources;
  if (!Array.isArray(s) || !s.length) return [null];
  return s.map(item => {
    if (!isObj(item) || Object.keys(item).length !== 1) return null;
    const typeKey = Object.keys(item)[0];
    const inner = item[typeKey];
    if (!isObj(inner)) return null;
    return { typeKey, inner };
  });
});

function write(list: Array<SourceRow | null>) {
  emit('patch', list.filter((r): r is SourceRow => !!r).map(r => ({ [r.typeKey]: r.inner })));
}
function setType(i: number, t: string) {
  const row = rows.value[i];
  if (!row) {
    /* 虚拟骨架行首次选择：建首源（field 取首候选） */
    emit('patch', [{ [t]: { field: props.fields[0] || '' } }]);
    return;
  }
  if (row.typeKey === t) return;
  const next = rows.value.map((r, j) => (j === i
    ? { typeKey: t, inner: { field: row.inner.field ?? '' } }
    : r));
  write(next);
}
function onInner(i: number, inner: Record<string, unknown>) {
  const row = rows.value[i];
  if (!row) return;
  write(rows.value.map((r, j) => (j === i ? { typeKey: row.typeKey, inner } : r)));
}
function delRow(i: number) {
  write(rows.value.filter((_, j) => j !== i));
}
function addRow() {
  /* 加源=追加骨架行；虚拟骨架行（键缺席）先物化（field 取首候选）再加一空行 */
  const base = rows.value.map(r => r ?? { typeKey: 'term', inner: { field: props.fields[0] || '' } as Record<string, unknown> });
  const newRow: SourceRow = { typeKey: 'term', inner: { field: '' } };
  write([...base, newRow]);
}
</script>

<style scoped>
.acp { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); margin-bottom: var(--sp-2); }
.acp-row { display: flex; align-items: flex-start; gap: var(--sp-2); flex-wrap: wrap; }
.acp-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; padding-top: 6px; }
.acp-type { height: 28px; font-size: var(--fs-sm); width: 148px; }
.acp-inner { flex-basis: 100%; padding: var(--sp-1) var(--sp-2); background: var(--bg1); border-radius: var(--r-s); }
.acp-add { align-self: flex-start; }
</style>
