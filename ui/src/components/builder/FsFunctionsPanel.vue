<template>
  <div class="fsfn">
    <!-- 989：function_score functions 数组结构化编辑（WrapNodeRow 专属面板）。
     AST 零改动：functions 仍在 node.params 原样往返，本组件只做 params.functions 的
     行列表投影——项形态 = 通用键(filter/weight) + 唯一类型键；无类型键 = weight 裸项；
     多类型键/未知键 = 自定义形态（只读类型位，参数走整项递归表防丢数据）。
     1009：filter 升级为 MiniTreeEditor 完整查询树（与 post_filter/rescore/retriever
     同语言——filter 本就是完整 ES 查询，键值表编辑不了布尔组/嵌套子树）；衰减函数
     （gauss/linear/exp）体是「字段作键」形态 {gauss:{字段:{origin,scale,…}}}，
     给字段选择 + 四参数 + multi_value_mode 快径编辑位，非单字段体退化递归表零丢失。 -->
    <div v-for="(f, i) in fns" :key="i" class="fsfn-row">
      <span class="fsfn-idx mono">{{ i + 1 }}</span>
      <select class="inp fsfn-type" :value="typeOf(f) ?? 'custom'" :disabled="typeOf(f) === null"
              :title="typeOf(f) === null ? '自定义函数形态：类型位锁定，参数走右侧整项编辑防丢数据' : '函数类型'"
              @change="setFnType(i, ($event.target as HTMLSelectElement).value)">
        <option v-for="t in FN_TYPES" :key="t.k" :value="t.k">{{ t.label }}</option>
        <option v-if="typeOf(f) === null" value="custom">自定义形态</option>
      </select>
      <label class="fsfn-wlb">weight</label>
      <input class="inp fsfn-w mono" :value="(f as Record<string, unknown>).weight ?? ''" placeholder="—"
             title="全函数通用权重（可留空）" @input="patchWeight(i, ($event.target as HTMLInputElement).value)" />
      <button aria-label="函数参数" class="btn sm ghost" :class="{ on: bodyIdx === i }" :disabled="typeOf(f) === null"
              title="函数主参数（field/modifier/origin/scale/script…）" @click="bodyIdx = bodyIdx === i ? null : i">
        <SlidersHorizontal :size="12" />
      </button>
      <button aria-label="filter 过滤" class="btn sm ghost" :class="{ on: filterIdx === i }"
              title="filter：该函数只作用于命中的文档子集（完整查询树）" @click="filterIdx = filterIdx === i ? null : i">
        <Filter :size="12" />
      </button>
      <button aria-label="删除函数" class="btn sm ghost danger" title="删除函数" @click="del(i)"><X :size="12" /></button>
      <!-- 衰减族快径：字段作键 + origin/scale/offset/decay + multi_value_mode；
           多字段/非对象 inner 等非快径体走递归表（零丢失） -->
      <div v-if="bodyIdx === i && decayRows[i]" class="fsfn-sub fsfn-decay">
        <FieldSelect
          :model-value="decayRows[i]!.field" :fields="fields" :types="types"
          @update:model-value="v => onDecayField(i, v)"
        />
        <input class="inp mono fsfn-dp" :value="decayText(i, 'origin')" placeholder="origin 起点（now / 0 …）"
               title="origin：衰减中心（date-math 或数值，缺省 now/0）" @input="onDecayParam(i, 'origin', ($event.target as HTMLInputElement).value)" />
        <input class="inp mono fsfn-dp" :value="decayText(i, 'scale')" placeholder="scale 跨度（10d / 20 …）"
               title="scale：到 origin 该距离时得分衰减到 decay 值（必填）" @input="onDecayParam(i, 'scale', ($event.target as HTMLInputElement).value)" />
        <input class="inp mono fsfn-dp fsfn-dp-opt" :value="decayText(i, 'offset')" placeholder="offset 偏移"
               title="offset：origin 两侧不衰减的平区宽度（可空）" @input="onDecayParam(i, 'offset', ($event.target as HTMLInputElement).value)" />
        <input class="inp mono fsfn-dp fsfn-dp-opt" :value="decayText(i, 'decay')" placeholder="decay 0..1"
               title="decay：scale 距离处的得分比例（缺省 0.5）" @input="onDecayParam(i, 'decay', ($event.target as HTMLInputElement).value)" />
        <select class="inp fsfn-mvm" :value="decayRows[i]!.mvm ?? ''"
                title="multi_value_mode：多值字段（数组）的聚合方式"
                @change="onDecayMvm(i, ($event.target as HTMLSelectElement).value)">
          <option value="">多值聚合：默认</option>
          <option v-for="m in MVM" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <div v-else-if="bodyIdx === i && typeOf(f)" class="fsfn-sub">
        <GenericParams :value="bodyOf(f)" path-prefix="" @update="v => { if (!Array.isArray(v)) patchBody(i, v); }" />
      </div>
      <div v-if="filterIdx === i" class="fsfn-sub fsfn-flt">
        <div class="fsfn-flt-hd">
          <span class="fsfn-flt-tx">过滤条件 filter —— 只作用于命中的文档子集{{ 'filter' in f ? '' : '（未设置，当前树=全文档）' }}</span>
          <button v-if="'filter' in f" aria-label="移除过滤条件" class="btn sm ghost danger" title="移除 filter 键（函数作用于全部命中文档）"
                  @click="removeFilter(i)">
            <X :size="11" /> 移除
          </button>
        </div>
        <MiniTreeEditor :node="filterNodes[i]" :fields="fields" :types="types"
                        @update:node="n => onFilterUpdate(i, n)" />
      </div>
    </div>
    <div class="fsfn-row fsfn-add-row">
      <button class="btn sm ghost fsfn-add" @click="add"><Plus :size="12" /> 加函数</button>
      <span v-if="!fns.length" class="fsfn-none">无评分函数（query 命中统一计分）</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { X, Plus, SlidersHorizontal, Filter } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';
import FieldSelect from './FieldSelect.vue';
import MiniTreeEditor from './MiniTreeEditor.vue';
import { parseQueryNode, serQueryNode, type QueryNode } from '../../utils/queryAst';

/* fields/types 可缺省（裸挂载测试环境），默认空候选仍可自由输入 */
const props = withDefaults(defineProps<{
  params: Record<string, unknown>;
  fields?: string[];
  types?: Record<string, string>;
}>(), { fields: () => [], types: () => ({}) });
const emit = defineEmits<{ (e: 'update', params: Record<string, unknown>): void }>();

/* 类型全集：k = ES 函数键（weight 裸项无类型键），label 中文 */
const FN_TYPES: Array<{ k: string; label: string }> = [
  { k: 'weight', label: '裸权重 weight' },
  { k: 'field_value_factor', label: '字段值因子' },
  { k: 'random_score', label: '随机评分' },
  { k: 'script_score', label: '脚本评分' },
  { k: 'gauss', label: '高斯衰减' },
  { k: 'linear', label: '线性衰减' },
  { k: 'exp', label: '指数衰减' },
];
const TYPE_KEYS = new Set(FN_TYPES.map(t => t.k));
const DECAY_TYPES = new Set(['gauss', 'linear', 'exp']);
const MVM = ['avg', 'sum', 'min', 'max', 'none'];

const fns = computed<Record<string, unknown>[]>(() =>
  Array.isArray(props.params.functions) ? (props.params.functions as Record<string, unknown>[]) : []);

/* 每行派生态一次算清（模板/更新共用同一投影，杜绝读写口径漂移）：
   decayRows[i] = 衰减族「字段作键」单字段快径形态（null = 非衰减或非快径体）；
   filterNodes[i] = filter 的查询树投影（缺席给 match_all 骨架，只有用户真编辑才写回） */
const decayRows = computed<Array<{ field: string; inner: Record<string, unknown>; mvm: string | undefined } | null>>(() =>
  fns.value.map(fn => {
    const t = typeOf(fn);
    if (!t || !DECAY_TYPES.has(t)) return null;
    const body = fn[t];
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const rec = body as Record<string, unknown>;
    const fk = Object.keys(rec).filter(k => k !== 'multi_value_mode');
    if (fk.length !== 1) return null;
    const inner = rec[fk[0]];
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return null;
    return { field: fk[0], inner: inner as Record<string, unknown>, mvm: typeof rec.multi_value_mode === 'string' ? rec.multi_value_mode : undefined };
  }));
const filterNodes = computed<QueryNode[]>(() =>
  fns.value.map(fn => parseQueryNode(fn.filter ?? { match_all: {} })));

const isGeneric = (k: string) => k === 'filter' || k === 'weight';
function typeOf(fn: Record<string, unknown>): string | null {
  const keys = Object.keys(fn).filter(k => !isGeneric(k));
  if (!keys.length) return 'weight';
  return keys.length === 1 && TYPE_KEYS.has(keys[0]) ? keys[0] : null;
}
function bodyOf(fn: Record<string, unknown>): Record<string, unknown> {
  const t = typeOf(fn);
  const body = t && t !== 'weight' ? fn[t] : undefined;
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function write(list: Record<string, unknown>[]) {
  emit('update', { ...props.params, functions: list });
}
function patchAt(i: number, fn: Record<string, unknown>) {
  write(fns.value.map((f, j) => (j === i ? fn : f)));
}

/* 换类型：保留通用键（filter/weight），旧类型键退役换安全初值（ClauseNode onOp 同语言）；
 weight↔weight 无操作；自定义形态锁定不可达（select disabled） */
function setFnType(i: number, t: string) {
  const fn = fns.value[i];
  if (typeOf(fn) === t) return;
  const next: Record<string, unknown> = {};
  if ('filter' in fn) next.filter = fn.filter;
  if ('weight' in fn) next.weight = fn.weight;
  if (t !== 'weight') next[t] = defaultBody(t);
  patchAt(i, next);
}
function defaultBody(t: string): Record<string, unknown> {
  if (t === 'field_value_factor') return { field: '', modifier: 'none' };
  if (t === 'script_score') return { script: { source: '' } };
  /* 衰减族合法形态是字段作键：{gauss:{字段:{origin,scale}}}——空键骨架待用户选字段
     （快径编辑位选字段时把参数搬到真键上），field 属性写法 ES 必拒 */
  if (DECAY_TYPES.has(t)) return { '': { origin: '', scale: '' } };
  return {};   // random_score
}
function patchBody(i: number, body: Record<string, unknown>) {
  const fn = fns.value[i];
  const t = typeOf(fn);
  if (!t || t === 'weight') return;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fn)) if (k !== t) next[k] = v;
  next[t] = body;
  patchAt(i, next);
}

/* ── 衰减族快径写回：字段键搬家保参数；参数空串删键（origin/scale 骨架期可空）；mvm 空删键 ── */
function patchDecay(i: number, field: string, inner: Record<string, unknown>, mvm?: string) {
  const fn = fns.value[i];
  const t = typeOf(fn);
  const d = decayRows.value[i];
  if (!t || !d) return;
  const body: Record<string, unknown> = { [field]: inner };
  if (mvm) body.multi_value_mode = mvm;
  patchAt(i, { ...fn, [t]: body });
}
function onDecayField(i: number, v: string) {
  const d = decayRows.value[i];
  if (!d) return;
  patchDecay(i, v, d.inner, d.mvm);
}
function decayText(i: number, k: string): string {
  const v = decayRows.value[i]?.inner[k];
  return v === undefined || v === null ? '' : String(v);
}
function onDecayParam(i: number, k: string, raw: string) {
  const d = decayRows.value[i];
  if (!d) return;
  const inner = { ...d.inner };
  if (raw === '') delete inner[k];
  else if (k === 'decay') { const n = Number(raw); if (Number.isFinite(n)) inner[k] = n; }
  else inner[k] = raw;
  patchDecay(i, d.field, inner, d.mvm);
}
function onDecayMvm(i: number, raw: string) {
  const d = decayRows.value[i];
  if (!d) return;
  patchDecay(i, d.field, d.inner, raw || undefined);
}

/* ── filter 查询树：树编辑即写回（parse/ser 往返硬契约，非法形态 __raw__ 原样保真）；
   用户不动树就不写（缺席态展开只读展示 match_all 骨架，不污染 DSL 文本） ── */
function onFilterUpdate(i: number, n: QueryNode) {
  const fn = fns.value[i];
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fn)) if (k !== 'filter') next[k] = v;
  next.filter = serQueryNode(n);
  patchAt(i, next);
}
function removeFilter(i: number) {
  const fn = fns.value[i];
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fn)) if (k !== 'filter') next[k] = v;
  patchAt(i, next);
}
function patchWeight(i: number, raw: string) {
  const fn = fns.value[i];
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fn)) if (k !== 'weight') next[k] = v;
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n)) next.weight = n;   // 空串删键；非数字中间态不写
  patchAt(i, next);
}
function del(i: number) { write(fns.value.filter((_, j) => j !== i)); }
function add() {
  write([...fns.value, { weight: 1 }]);
  bodyIdx.value = null; filterIdx.value = null;
}

const bodyIdx = ref<number | null>(null);
const filterIdx = ref<number | null>(null);
</script>

<style scoped>
.fsfn { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg2); border-radius: var(--r-s); }
.fsfn-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-1) 0; }
.fsfn-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; }
.fsfn-type { height: 28px; font-size: var(--fs-sm); min-width: 128px; }
.fsfn-wlb { font-size: var(--fs-2xs); color: var(--tx2); }
.fsfn-w { width: 72px; height: 28px; font-size: var(--fs-sm); }
.fsfn-row .btn { flex: none; }
.fsfn-sub { flex-basis: 100%; padding: var(--sp-2) var(--sp-3); background: var(--bg1); border-radius: var(--r-s); }
.fsfn-decay { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.fsfn-dp { width: 132px; height: 28px; font-size: var(--fs-sm); }
.fsfn-dp-opt { width: 104px; }
.fsfn-mvm { height: 28px; font-size: var(--fs-sm); }
.fsfn-flt-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.fsfn-flt-tx { flex: 1; font-size: var(--fs-2xs); color: var(--tx2); }
.fsfn-add-row { margin-top: var(--sp-2); }
.fsfn-none { font-size: var(--fs-xs); color: var(--tx2); }
</style>
