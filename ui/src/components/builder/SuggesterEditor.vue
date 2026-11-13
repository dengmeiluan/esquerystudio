<template>
  <div class="sged">
    <!-- 1031：suggester 体专属编辑（RootExtrasPane suggest 项挂接）。rest = { <类型键>:
         {field,size,…} } 单类型键形态——本组件做类型切换 + 类型体 schema 编辑（field 行走
         GenericParams field-keys 机制渲染 FieldSelect）。rest 结构零改动（AST SuggestItem
         直通投影，FsFunctionsPanel 同款范式）：
         · 已知型：类型下拉切换（换型保留其余键，旧类型键退役换安全骨架）；
         · 未知型（自定义 suggester/非单键形态）：类型位锁定，整 rest 递归表零丢失。 -->
    <div class="sged-hd">
      <span class="sged-lb">建议器</span>
      <select class="inp sged-type" :value="typeKey ?? ''" :disabled="typeKey === null"
              :title="typeKey === null ? '自定义建议器形态：类型位锁定，参数走下方整表编辑防丢数据' : '建议器类型'"
              @change="setType(($event.target as HTMLSelectElement).value)">
        <option v-for="(lb, k) in SUGGESTER_TYPES" :key="k" :value="k">{{ lb }}</option>
        <option v-if="typeKey === null" value="">自定义形态</option>
      </select>
      <span class="sged-hint">{{ typeHint }}</span>
    </div>
    <div class="sged-body">
      <GenericParams :value="bodyView" path-prefix="" :schema="typeKey ? SUGGESTER_PARAMS[typeKey] : []"
                     :field-keys="['field']" :fields="fields" :types="types"
                     @update="onBody" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import GenericParams from './GenericParams.vue';
import { SUGGESTER_TYPES, SUGGESTER_PARAMS } from '../../utils/queryAstOps';

/* fields/types 可缺省（裸挂载测试环境），默认空候选仍可自由输入 */
const props = withDefaults(defineProps<{
  rest: Record<string, unknown>;
  fields?: string[];
  types?: Record<string, string>;
}>(), { fields: () => [], types: () => ({}) });
const emit = defineEmits<{ (e: 'update', rest: Record<string, unknown>): void }>();

const KNOWN = computed(() => new Set(Object.keys(SUGGESTER_TYPES)));

/* 类型识别：rest 中第一个已知类型键；无已知键 = 自定义形态（null，类型位锁定）。
   多已知键（非法形态）取首个，其余照常保真写回。 */
const typeKey = computed<string | null>(() => {
  const hit = Object.keys(props.rest).find(k => KNOWN.value.has(k));
  return hit ?? null;
});
const custom = computed(() => typeKey.value === null);

/* 类型体视图：已知型 = 该类型键下的对象；自定义形态 = 整 rest（递归表兜底零丢失）。
   类型体非对象（畸形）降级整 rest。 */
const bodyView = computed<Record<string, unknown>>(() => {
  if (custom.value) return props.rest;
  const inner = props.rest[typeKey.value as string];
  return inner && typeof inner === 'object' && !Array.isArray(inner) ? inner as Record<string, unknown> : props.rest;
});
const typeHint = computed(() => {
  if (custom.value) return '自定义形态：参数走整表编辑，键名零丢失';
  return typeKey.value === 'completion' ? '前缀补全（contexts 走整表加键）'
    : typeKey.value === 'phrase' ? '短语纠错（direct_generator 等深参走整表加键）'
    : '词项纠错';
});

/* 写回：已知型把类型体装回类型键 + 保真其余键；自定义形态整表直写。 */
function onBody(v: Record<string, unknown> | unknown[]) {
  if (Array.isArray(v)) return;
  if (custom.value) { emit('update', v); return; }
  const t = typeKey.value as string;
  const next: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(props.rest)) if (k !== t) next[k] = val;
  next[t] = v;
  emit('update', next);
}

/* 换类型：保留非类型键（用户加的深参/自定义键），旧类型键退役换安全骨架
   （{field: 首候选}，ClauseNode onOp 同语言）。weight 裸项语义不存在于此——
   suggester 必须挂类型键，空选 '' 不动作。 */
function setType(t: string) {
  if (!t || !KNOWN.value.has(t) || t === typeKey.value) return;
  const next: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(props.rest)) if (!KNOWN.value.has(k)) next[k] = val;
  next[t] = { field: props.fields[0] || '' };
  emit('update', next);
}
</script>

<style scoped>
.sged { display: flex; flex-direction: column; gap: var(--sp-1); }
.sged-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.sged-lb { font-size: var(--fs-2xs); color: var(--tx2); }
.sged-type { height: 28px; font-size: var(--fs-sm); min-width: 148px; }
.sged-hint { font-size: var(--fs-2xs); color: var(--tx2); }
.sged-body { padding: var(--sp-1) var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
</style>
