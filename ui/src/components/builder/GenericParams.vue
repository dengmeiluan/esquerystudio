<template>
  <div class="gp">
    <div v-for="row in rows" :key="row.key" class="gp-row" :style="{ '--d': depth }">
      <input class="inp gp-k mono" :value="row.key" :readonly="isArr"
        @change="renameKey(row.key, ($event.target as HTMLInputElement).value)
          || (($event.target as HTMLInputElement).value = row.key)" />
      <template v-if="(row.kind === 'object' || row.kind === 'array') && schemaKind(row.key) !== 'json'">
        <button class="btn sm ghost" @click="toggle(row.key)">{{ collapsed.has(row.key) ? '▸' : '▾' }} {{ row.key }} {{ row.kind === 'array' ? '[' + (row.val as any[]).length + ']' : '{…}' }}</button>
        <div v-show="!collapsed.has(row.key)" class="gp-sub">
          <!-- 【W3b】字段键的数组值（multi_match.fields / query_string.fields 形态）：
 子表逐项渲染 FieldSelect——数组项键是序号字符串，把序号名单传下去复用既有
 isFieldKey 通道；非字段键的数组子表不传（现状裸键值表零降级） -->
          <GenericParams :value="row.val as Record<string, unknown> | unknown[]" :depth="depth + 1" :path-prefix="pathPrefix + row.key + '.'"
                         :field-keys="childFieldKeys(row)" :fields="fields" :types="types" :type-priority="typePriority"
                         @update="setChild(row.key, $event)" />
        </div>
      </template>
      <!-- 1159：inner_hits 等 json 参数的常见键给结构化快捷行（from/size/name 是生产里最常改的
           三项），JSON 文本位仍保留整段编辑能力——结构化只是快通道，不限制其余键 -->
      <div v-else-if="jsonQuickKeys(row.key).length" class="gp-jq">
        <span class="gp-jq-k mono">{{ row.key }}</span>
        <label v-for="q in jsonQuickKeys(row.key)" :key="q" class="gp-jq-f">
          <span class="gp-jq-l">{{ jsonQuickLabel(q) }}</span>
          <input v-if="q === 'name'" class="inp gp-v mono" type="text" :value="jsonSub(row.val, 'name')"
                 :aria-label="row.key + '.' + q" @change="setJsonSub(row.key, row.val, 'name', ($event.target as HTMLInputElement).value)" />
          <!-- 1169：脚本 source 是字符串（painless 表达式），不能被数字输入框降级 -->
          <input v-else-if="q === 'source'" class="inp gp-v mono gp-jq-src" type="text" :value="jsonSub(row.val, 'source')"
                 placeholder="painless 表达式"
                 :aria-label="row.key + '.' + q" @change="setJsonSub(row.key, row.val, 'source', ($event.target as HTMLInputElement).value)" />
          <input v-else class="inp gp-v mono" type="number" step="1" min="0" :value="jsonSub(row.val, q)"
                 :aria-label="row.key + '.' + q" @change="setJsonSub(row.key, row.val, q, ($event.target as HTMLInputElement).value === '' ? '' : Number(($event.target as HTMLInputElement).value))" />
        </label>
        <textarea class="inp gp-v mono gp-json gp-jq-json"
                  :class="{ bad: !!jsonBad[row.key] }" :data-path="pathPrefix + row.key"
                  :value="jsonText(row.key, row.val)" spellcheck="false"
                  :title="jsonBad[row.key] ? 'JSON 无效，暂未写入查询树' : '其余键用 JSON 编辑（保留数字/布尔类型）'"
                  @input="onJson(row.key, ($event.target as HTMLTextAreaElement).value)" />
      </div>

      <!-- 1094：json schema 参数（inner_hits 等）用 JSON 文本位——保留数字/布尔类型，
           不再被键值子表的字符串输入降级 -->
      <textarea v-else-if="schemaKind(row.key) === 'json' || schemaKind(row.key) === 'json-array'" class="inp gp-v mono gp-json"
                :class="{ bad: !!jsonBad[row.key] }" :data-path="pathPrefix + row.key"
                :value="jsonText(row.key, row.val)" spellcheck="false"
                :title="jsonTitle(row.key)"
                @input="onJson(row.key, ($event.target as HTMLTextAreaElement).value)" />
      <select v-else-if="schemaOpt(row.key)" class="inp gp-v" :value="String(row.val)" @change="setChild(row.key, ($event.target as HTMLSelectElement).value)">
        <option v-for="o in schemaOpt(row.key)" :key="o" :value="o">{{ o }}</option>
      </select>
      <!-- 字段键行渲染 FieldSelect（rank/分组/类型徽标/mark 全套，同 ClauseNode）；
 fields 为空（无字段源）回落普通输入，零降级 -->
      <FieldSelect v-else-if="isFieldKey(row.key)" class="gp-fs"
                   :model-value="String(row.val)" :fields="fields" :types="types" :type-priority="typePriority"
                   @update:model-value="setChild(row.key, $event)" />
      <input v-else-if="row.kind === 'boolean'" type="checkbox" :checked="!!row.val" @change="setChild(row.key, ($event.target as HTMLInputElement).checked)" />
      <!-- 1092：schema.number 键用数值控件——新加参数（prefix_length/boost/slop…）不再落成字符串 -->
      <input v-else-if="schemaKind(row.key) === 'number'" type="number" step="any" class="inp gp-v mono"
             :data-path="pathPrefix + row.key" :value="row.raw"
             @input="onScalar(row.key, ($event.target as HTMLInputElement).value, 'number')" />
      <textarea v-else-if="row.key === 'source'" class="inp gp-v mono gp-src" rows="3" spellcheck="false"
                :data-path="pathPrefix + row.key"
                :value="row.raw"
                @input="onScalar(row.key, ($event.target as HTMLTextAreaElement).value, row.kind)" />
      <input v-else class="inp gp-v mono" :class="{ warn: row.kind === 'numstr' }"
             :data-path="pathPrefix + row.key"
             :value="row.raw" :title="row.kind === 'numstr' ? '非数字，将作为字符串提交' : ''"
             @input="onScalar(row.key, ($event.target as HTMLInputElement).value, row.kind)" />
      <button aria-label="删除该参数键" class="btn sm ghost danger" @click="removeKey(row.key)"><X :size="12" /></button>
    </div>
    <!-- 未入体的已注册参数：此前只有「+ 键名」输入框的 datalist 提示——
 新建一个聚合时用户看到的是一个空框，不点开、不试输就发现不了这个聚合到底要哪些键
 （weighted_avg 的 value/weight、t_test 的 a/b 都属此列）。这里把它们列成一排可点的键签：
 点一下即按类型补默认值并落进体里，随后在表内以类型化控件编辑。
 只提示不约束——仍可手打任意键（datalist 与「+ 键名」通道都保留）。 -->
    <div v-if="!isArr && pendingSchema.length" class="gp-pending" role="group" aria-label="该聚合支持的参数">
      <span class="gp-pending-lb">可加参数</span>
      <button v-for="p in pendingSchema" :key="p.key" type="button" class="gp-pkey"
        :title="KIND_ZH[p.kind] || '文本'" @click="addSchemaKey(p)">
        {{ '+' + p.key }}
      </button>
    </div>
    <div class="gp-add">
      <input v-if="!isArr" class="inp mono" v-model="newKey" placeholder="+ 键名" :list="'gpkeys-' + uid" @keydown.enter="addKey" />
      <datalist v-if="!isArr && pendingSchema.length" :id="'gpkeys-' + uid">
        <option v-for="p in pendingSchema" :key="p.key" :value="p.key">{{ KIND_ZH[p.kind] || '文本' }}{{ p.options?.length ? '：' + p.options.join(' / ') : '' }}</option>
      </datalist>
      <button class="btn sm" @click="addKey">添加</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/* W1：递归键值表——零降级的最后兜底。任何 JSON 对象都渲染成结构化行：
 标量按类型给控件（数字框容忍非数字字符串提交并标黄，设计文档 ），
 对象/数组逐级展开。schema 具名参数优先渲染为 enum/number 控件。 */
import { ref, computed } from 'vue';
import { X } from 'lucide-vue-next';
import FieldSelect from './FieldSelect.vue';
import type { ParamMeta } from '../../utils/queryAstOps';

const props = withDefaults(defineProps<{
  value: Record<string, unknown> | unknown[];
  schema?: ParamMeta[];
  depth?: number;
  pathPrefix?: string;
  /** 字段键名单——命中的键渲染 FieldSelect；空/缺省 = 现状裸键值表（逐字节不变） */
  fieldKeys?: string[];
  /** FieldSelect 字段清单与类型表（由调用方传入；空 = 无字段源，字段键回落普通输入） */
  fields?: string[];
  types?: Record<string, string>;
  /** 字段键行 FieldSelect 的类型置顶——调用方按算子/聚合场景传入
 * （ClauseNode term/terms/prefix→keyword、range→date/数值族；排序行已有 typeFilter SORTABLE_TYPES 范式）。
 * 缺省空 = FieldSelect 归一 null 纯 rank 平铺，既有调用方零增量。 */
  typePriority?: string[];
}>(), { schema: () => [], depth: 0, pathPrefix: '', fieldKeys: () => [], fields: () => [], types: () => ({}), typePriority: () => [] });
const emit = defineEmits<{ (e: 'update', v: Record<string, unknown> | unknown[]): void }>();

const newKey = ref('');
const collapsed = ref(new Set<string>());
/* 1094：json schema 参数的文本草稿/非法态——非法中间态只标红不写树 */
const jsonDrafts = ref<Record<string, string>>({});
const jsonBad = ref<Record<string, boolean>>({});
const isArr = computed(() => Array.isArray(props.value));

/* 1032：schema 键提示——注册在册但尚未入体的键升 datalist 建议（带类型释义与枚举
   选项串）。schema 只升级「已在体」键的控件形态，未入体键此前完全不可见=具名参数
   可发现性断层；添加仍不限制（任何键可手输，datalist 只提示不约束）。
   uid：递归组件多实例，datalist id 用模块计数器区分。 */
let uidSeq = 0;
const uid = 'gp' + (++uidSeq).toString(36);
const KIND_ZH: Record<string, string> = { number: '数值', boolean: '布尔', enum: '枚举', text: '文本', json: '对象/JSON', 'json-array': '数组/JSON' };
const pendingSchema = computed<ParamMeta[]>(() => {
  const body = props.value as Record<string, unknown>;
  if (isArr.value) return [];
  return props.schema.filter(p => !(p.key in body));
});

type Kind = 'string' | 'number' | 'numstr' | 'boolean' | 'null' | 'object' | 'array';
type Row = { key: string; val: unknown; kind: Kind; raw: string };
const rows = computed((): Row[] => Object.entries(props.value as Record<string, unknown>).map(([key, val]) => {
  let kind: Kind = 'string';
  if (val === null) kind = 'null';
  else if (Array.isArray(val)) kind = 'array';
  else if (typeof val === 'object') kind = 'object';
  else if (typeof val === 'boolean') kind = 'boolean';
  else if (typeof val === 'number') kind = 'number';
  return { key, val, kind, raw: val === null ? 'null' : String(val) };
}));

const schemaOpt = (k: string) => props.schema.find(s => s.key === k && s.kind === 'enum')?.options || null;
const schemaKind = (k: string) => props.schema.find(s => s.key === k)?.kind;
/* 键名命中字段键名单且确有字段源时才走 FieldSelect（缺字段源回落普通输入） */
const isFieldKey = (k: string) => props.fieldKeys.includes(k) && props.fields.length > 0;
/* 【W3b】字段键的数组值：子表逐项 FieldSelect——把数组序号当作字段键名单传给子实例 */
const childFieldKeys = (row: Row): string[] =>
  row.kind === 'array' && isFieldKey(row.key)
    ? (row.val as unknown[]).map((_, i) => String(i))
    : [];

function setChild(k: string, v: unknown) {
  if (Array.isArray(props.value)) {
    const n = props.value.slice(); n[Number(k)] = v as unknown;
    emit('update', n); return;
  }
  emit('update', { ...props.value, [k]: v });
}
function removeKey(k: string) {
  if (Array.isArray(props.value)) {
    const n = props.value.slice(); n.splice(Number(k), 1);
    emit('update', n); return;
  }
  const n = { ...props.value }; delete n[k]; emit('update', n);
}
/* 保键序仅对非整数型键名成立（JS 整数键恒升序重排） */
function renameKey(oldK: string, newK: string): boolean {
  if (Array.isArray(props.value)) return false;
  if (!newK || newK === oldK || newK in props.value || !(oldK in props.value)) return false;
  const n: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props.value)) n[k === oldK ? newK : k] = v;
  emit('update', n);
  return true;
}
function onScalar(k: string, raw: string, kind: Kind) {
  if (kind === 'number') {
    const n = Number(raw);
    setChild(k, raw.trim() !== '' && !isNaN(n) ? n : raw);   // 非数字按字符串保留（标黄由 numstr 态负责）
  } else if (kind === 'null') setChild(k, raw === 'null' ? null : raw);
  else setChild(k, raw);
}
/* 1094：json schema 参数文本位 */
function jsonText(k: string, val: unknown): string {
  return k in jsonDrafts.value ? jsonDrafts.value[k] : JSON.stringify(val ?? {}, null, 2);
}
/* 1159：json 参数的结构化快捷键（只收生产里高频改的标量项；其余键仍走 JSON 文本位）。
   inner_hits 的 from/size/name 是 nested / has_child 结果里最常调的三项。
   1169：terms_set.minimum_should_match_script 的 source/params 同理——body 里几乎必改
   source（painless 表达式），params 是它的入参对象；此前只能整段手写 JSON。 */
const JSON_QUICK: Record<string, string[]> = {
  inner_hits: ['from', 'size', 'name'],
  minimum_should_match_script: ['source'],
};
function jsonQuickKeys(k: string): string[] {
  const keys = JSON_QUICK[k];
  /* 只在值确实是对象时给快捷行（数组/标量形态回落 JSON 文本单通道，避免误改） */
  if (!keys) return [];
  const v = (props.value as Record<string, unknown>)[k];
  return v && typeof v === 'object' && !Array.isArray(v) ? keys : [];
}
function jsonQuickLabel(k: string) {
  if (k === 'from') return '起始 from';
  if (k === 'size') return '条数 size';
  if (k === 'name') return '命名 name';
  if (k === 'source') return '脚本 source';
  return k;
}
function jsonSub(v: unknown, key: string): string | number {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const raw = o[key];
  return raw === undefined || raw === null ? '' : (typeof raw === 'number' ? raw : String(raw));
}
function setJsonSub(outerKey: string, v: unknown, key: string, next: string | number) {
  const base = (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}) as Record<string, unknown>;
  if (next === '' || (typeof next === 'number' && Number.isNaN(next))) delete base[key];
  else base[key] = next;
  setChild(outerKey, base);
}

function onJson(k: string, raw: string) {
  jsonDrafts.value = { ...jsonDrafts.value, [k]: raw };
  let parsed: unknown;
  let ok = false;
  try { parsed = JSON.parse(raw); ok = !!parsed && typeof parsed === 'object'; } catch { /* 非法中间态 */ }
  jsonBad.value = { ...jsonBad.value, [k]: !ok };
  if (ok) setChild(k, parsed);
}
/* JSON 文本位的标题：非法态优先，其次按对象/数组给示例引导 */
function jsonTitle(k: string): string {
  if (jsonBad.value[k]) return 'JSON 无效，暂未写入查询树';
  return schemaKind(k) === 'json-array'
    ? 'JSON 数组（保留数字/布尔类型），例如 [{"field":"a"}]'
    : 'JSON 对象（保留数字/布尔类型）';
}
/* 新建参数的默认值——数组型给 `[]`（给 `{}` 会被 ES 直接拒：
   top_metrics.metrics / matrix_stats.fields / bucket_sort.sort 都必须是数组），
   对象型给 `{}`，布尔给 false，其余留空串由输入控件承接。 */
function defaultValueFor(kind?: 'number' | 'text' | 'boolean' | 'enum' | 'json' | 'json-array'): unknown {
  if (kind === 'boolean') return false;
  if (kind === 'json-array') return [];
  if (kind === 'json') return {};
  return '';
}
function addKey() {
  if (Array.isArray(props.value)) {
    emit('update', [...props.value, '']); return;   // 数组添加 = 尾部推空串
  }
  const k = newKey.value.trim();
  if (!k || k in props.value) return;
  /* 1092：布尔 schema 给显式 false；1094：json schema 给空对象承接文本位；数值留空由数值控件承接 */
  const kind = schemaKind(k);
  emit('update', { ...props.value, [k]: defaultValueFor(kind) });
  newKey.value = '';
}
/* 一键补入已注册但未入体的参数键——默认值与 addKey 同口径（布尔 false / json {} / 其余空串），
 落体后由 rows 渲染成对应类型化控件 */
function addSchemaKey(p: ParamMeta) {
  if (Array.isArray(props.value) || p.key in props.value) return;
  emit('update', { ...props.value, [p.key]: defaultValueFor(p.kind) });
}
function toggle(k: string) {
  const s = new Set(collapsed.value);
  s.has(k) ? s.delete(k) : s.add(k);
  collapsed.value = s;
}
</script>

<style scoped>
.gp { font-size: var(--fs-sm); }
/* 深嵌套防挤：每层缩进 14→10px + 键名宽 130→110px——嵌套 params（如多层 aggs）每层少啃 24px 可用宽度 */
.gp-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin: var(--sp-1) 0 var(--sp-1) calc(var(--d, 0) * 10px); }
.gp-k { width: 110px; height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); }
.gp-v { height: 28px; font-size: var(--fs-sm); padding: var(--sp-0) var(--sp-2); flex: 1 1 100px; min-width: 0; }
/* 1038：source 键（Painless/脚本体）多行编辑——textarea 覆盖 gp-v 的高度/内边距，
   行顶对齐（键名行内基线不复用居中） */
.gp-row:has(.gp-src) { align-items: flex-start; }
/* 1094：json 对象参数文本位（inner_hits 等） */
.gp-row:has(.gp-json) { align-items: flex-start; }
.gp-json { height: auto; min-height: 64px; resize: vertical; line-height: 1.5; padding: var(--sp-1) var(--sp-2); }
.gp-json.bad { border-color: var(--err); }
/* 1159：json 参数的快捷行（inner_hits 的 from/size/name）——键名 + 三个紧凑输入 + 其余键 JSON */
.gp-jq { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-1h); width: 100%; }
.gp-jq-k { font-size: var(--fs-2xs); color: var(--tx2); }
.gp-jq-f { display: inline-flex; align-items: center; gap: var(--sp-0); }
.gp-jq-l { font-size: var(--fs-2xs); color: var(--tx2); white-space: nowrap; }
.gp-jq .gp-v { width: 84px; }
.gp-jq .gp-jq-src { width: 220px; }
.gp-jq-json { flex: 1 1 100%; }
.gp-src { height: auto; min-height: 64px; resize: vertical; line-height: 1.5; padding: var(--sp-1) var(--sp-2); }
.gp-row:has(.gp-src) .gp-k { margin-top: 2px; }
.gp-v.warn { border-color: var(--warn); }
.gp-sub { flex-basis: 100%; }
/* 字段键行内的 FieldSelect 对齐 .gp-v 的 flex 形态（吃满剩余宽度、高度同键值行） */
.gp-row :deep(.gp-fs) { flex: 1 1 100px; min-width: 0; }
.gp-row :deep(.gp-fs .fs-inp) { height: 28px; }
.gp-add { display: flex; gap: var(--sp-2); margin-top: var(--sp-1); margin-left: calc(var(--d, 0) * 10px); }
.gp-add .inp { width: 110px; height: 28px; font-size: var(--fs-sm); }
/* 未入体的已注册参数键签——只提示不约束（仍可手打任意键） */
.gp-pending {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-1);
  margin-top: var(--sp-1); margin-left: calc(var(--d, 0) * 10px);
}
.gp-pending-lb { color: var(--tx3); font-size: var(--fs-xs); }
.gp-pkey {
  height: 22px; padding: 0 var(--sp-1h); border: 1px dashed var(--line-strong);
  border-radius: 99px; background: transparent; color: var(--tx2);
  font-size: var(--fs-xs); font-family: inherit; cursor: pointer; white-space: nowrap;
}
.gp-pkey:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
</style>
