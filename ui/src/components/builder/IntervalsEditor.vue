<template>
  <div class="ivr" :style="depth ? { marginLeft: depth * 12 + 'px' } : undefined">
    <!-- 1011：intervals 规则递归行。行头（类型/_name/参数/过滤/删除）+ 单值主值输入 +
         容器子规则行列表（递归自身）+ 规则级 filter 关系槽（六关系+before/after，槽值再递归）。
         纯投影组件：rule 来自 parseIntervalRule（ClauseNode 挂接层），update 即 serIntervalRule 写回；
         params/filter/intervals 由专用控件承担，GenericParams 只管其余参数（加出专用键会被路由回流）。 -->
    <div class="ivr-hd">
      <span v-if="depth" class="ivr-idx mono">{{ (idx ?? 0) + 1 }}</span>
      <select class="inp ivr-kind" :value="rule.kind"
              title="规则类型（all_of/any_of 可嵌套子规则递归组合）"
              @change="onKind(($event.target as HTMLSelectElement).value)">
        <option v-for="k in RULE_KIND_META" :key="k.k" :value="k.k">{{ k.label }}</option>
      </select>
      <input class="inp mono ivr-name" :value="rule.hasName ? String(rule.name ?? '') : ''" placeholder="_name"
             title="命名查询（可选；出现在 hits.matched_queries 里供定位）" @input="onName(($event.target as HTMLInputElement).value)" />
      <span style="flex:1"></span>
      <button aria-label="规则参数" class="btn sm ghost" :class="{ on: showParams }"
              title="规则参数（max_gaps/ordered/analyzer/use_field…）" @click="showParams = !showParams">
        <SlidersHorizontal :size="12" />
      </button>
      <button aria-label="位置过滤 filter" class="btn sm ghost" :class="{ on: showFilter }"
              :title="'filter：与其他规则区间的位置关系（' + (rule.filter?.slots.length || 0) + ' 个关系槽）'"
              @click="showFilter = !showFilter">
        <Filter :size="12" />
      </button>
      <button v-if="depth" aria-label="删除规则" class="btn sm ghost danger" title="删除该子规则" @click="emit('remove')">
        <X :size="12" />
      </button>
    </div>
    <!-- 单值型主值（query/prefix/pattern/term） -->
    <input v-if="mainMeta" class="inp mono ivr-main" :value="rule.main === undefined || rule.main === null ? '' : String(rule.main)"
           :placeholder="mainMeta.mainLabel" :title="mainMeta.mainLabel"
           @input="patch({ main: ($event.target as HTMLInputElement).value })" />
    <!-- 容器型子规则（递归行） -->
    <template v-if="isContainer">
      <div class="ivr-kids">
        <IntervalsEditor v-for="(c, i) in rule.children" :key="c.id" :rule="c" :fields="fields" :types="types"
                         :depth="depth + 1" :idx="i"
                         @update="r => onChild(i, r)" @remove="delChild(i)" />
        <button class="btn sm ghost ivr-addkid" @click="addChild"><Plus :size="12" /> 加子规则</button>
      </div>
    </template>
    <!-- 其余参数（schema 驱动；filter/intervals 由专用控件承担） -->
    <div v-if="showParams" class="ivr-sub">
      <GenericParams :value="paramsView" :schema="RULE_PARAMS[rule.kind] || []" path-prefix=""
                     @update="onParams" />
    </div>
    <!-- 规则级 filter：关系槽（槽值递归）+ 其余键（script 等） -->
    <div v-if="showFilter" class="ivr-sub ivr-flt">
      <div v-for="s in rule.filter?.slots || []" :key="s.id" class="ivr-fslot">
        <select class="inp ivr-frel" :value="s.rel" title="位置关系" @change="onSlotRel(s.id, ($event.target as HTMLSelectElement).value)">
          <option v-for="r in FILTER_RELS" :key="r.rel" :value="r.rel">{{ r.label }}</option>
        </select>
        <button aria-label="删除关系槽" class="btn sm ghost danger" title="删除该关系槽" @click="delSlot(s.id)">
          <X :size="12" />
        </button>
        <IntervalsEditor :rule="s.rule" :fields="fields" :types="types" :depth="depth + 1"
                         @update="r => onSlotRule(s.id, r)" />
      </div>
      <button class="btn sm ghost ivr-addslot" @click="addSlot"><Plus :size="12" /> 加位置关系</button>
      <div v-if="Object.keys(rule.filter?.rest || {}).length" class="ivr-flt-rest">
        <span class="ivr-flt-tx">其余 filter 键（script…）</span>
        <GenericParams :value="rule.filter!.rest" path-prefix="" @update="onFilterRest" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { X, Plus, SlidersHorizontal, Filter } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';
import { nid } from '../../utils/queryAst';
import {
  RULE_KIND_META, RULE_PARAMS, FILTER_RELS, KIND_MAINKEY, CONTAINER_KINDS, CUSTOM_KIND,
  makeRule, parseIntervalFilter, type IntervalRule, type IntervalFilterView,
} from '../../utils/intervalsRule';

const props = withDefaults(defineProps<{
  rule: IntervalRule;
  fields?: string[];
  types?: Record<string, string>;
  depth?: number;
  idx?: number;
}>(), { fields: () => [], types: () => ({}), depth: 0, idx: 0 });
const emit = defineEmits<{ (e: 'update', r: IntervalRule): void; (e: 'remove'): void }>();

const showParams = ref(false);
const showFilter = ref(false);

const isContainer = computed(() => CONTAINER_KINDS.has(props.rule.kind));
const mainMeta = computed(() => !isContainer.value && props.rule.kind in KIND_MAINKEY
  ? RULE_KIND_META.find(k => k.k === props.rule.kind) : null);

function patch(p: Partial<IntervalRule>) { emit('update', { ...props.rule, ...p }); }

/* 换类型：保留 _name 记忆，载荷换安全骨架（makeNodeByOp 安全档同语言） */
function onKind(t: string) {
  if (t === props.rule.kind) return;
  const n = makeRule(t);
  patch({ ...n, hasName: props.rule.hasName, name: props.rule.name });
}
/* _name：空串删键（hasName=false），非空字符串写回 */
function onName(raw: string) { patch(raw === '' ? { hasName: false, name: undefined } : { hasName: true, name: raw }); }

/* 参数表视图：params 直通（filter 畸形残留键也可见可编辑）；
   update 里若加出 filter/intervals 专用键 → 路由回流专用控件而非静默丢弃 */
const paramsView = computed(() => props.rule.params);
function onParams(v: Record<string, unknown> | unknown[]) {
  if (Array.isArray(v)) return;
  const next: Record<string, unknown> = {};
  let filter = props.rule.filter;
  let children = props.rule.children;
  let hasChildren = props.rule.hasChildren;
  for (const [k, val] of Object.entries(v)) {
    if (k === 'filter') {
      const fv = parseIntervalFilter(val);
      if (fv) { filter = fv; continue; }
      filter = null; next.filter = val;   // 畸形 filter 原样留 params（ser 跳过 null 视图不双写）
      continue;
    }
    if (k === 'intervals') {
      if (Array.isArray(val)) {
        children = val.map(x => ({ id: nid(), kind: CUSTOM_KIND, custom: x, params: {} }));
        hasChildren = true; continue;
      }
      next.intervals = val; continue;
    }
    next[k] = val;
  }
  emit('update', { ...props.rule, params: next, filter, children, hasChildren });
}

/* 容器子规则行 */
function onChild(i: number, r: IntervalRule) {
  patch({ children: (props.rule.children || []).map((c, j) => (j === i ? r : c)), hasChildren: true });
}
function delChild(i: number) {
  patch({ children: (props.rule.children || []).filter((_, j) => j !== i) });
}
function addChild() {
  patch({ children: [...(props.rule.children || []), makeRule('match')], hasChildren: true });
}

/* filter 关系槽 */
function patchFilter(f: IntervalFilterView | undefined) { patch({ filter: f }); }
function onSlotRel(id: string, rel: string) {
  if (!props.rule.filter) return;
  patchFilter({ ...props.rule.filter, slots: props.rule.filter.slots.map(s => (s.id === id ? { ...s, rel } : s)) });
}
function onSlotRule(id: string, r: IntervalRule) {
  if (!props.rule.filter) return;
  patchFilter({ ...props.rule.filter, slots: props.rule.filter.slots.map(s => (s.id === id ? { ...s, rule: r } : s)) });
}
function delSlot(id: string) {
  if (!props.rule.filter) return;
  patchFilter({ ...props.rule.filter, slots: props.rule.filter.slots.filter(s => s.id !== id) });
}
function addSlot() {
  const cur = props.rule.filter || { slots: [], rest: {} };
  patchFilter({ ...cur, slots: [...cur.slots, { id: nid(), rel: 'containing', rule: makeRule('match') }] });
}
function onFilterRest(v: Record<string, unknown> | unknown[]) {
  if (!props.rule.filter || Array.isArray(v)) return;
  patchFilter({ ...props.rule.filter, rest: v });
}
</script>

<style scoped>
.ivr { padding: var(--sp-1) 0; }
.ivr-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.ivr-idx { font-size: var(--fs-2xs); color: var(--tx2); min-width: 14px; text-align: right; }
.ivr-kind { height: 28px; font-size: var(--fs-sm); min-width: 140px; }
.ivr-name { width: 96px; height: 28px; font-size: var(--fs-sm); }
.ivr-main { width: min(320px, 100%); height: 28px; margin-top: var(--sp-1); }
.ivr-kids { margin-top: var(--sp-2); padding: var(--sp-2); border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: var(--sp-1); }
.ivr-addkid { align-self: flex-start; }
.ivr-sub { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--bg1); border-radius: var(--r-s); }
.ivr-fslot { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); margin-bottom: var(--sp-2); }
.ivr-fslot > div:first-child { display: flex; align-items: center; gap: var(--sp-2); }
.ivr-frel { height: 28px; font-size: var(--fs-sm); min-width: 168px; }
.ivr-addslot { margin-top: var(--sp-1); }
.ivr-flt-rest { margin-top: var(--sp-2); }
.ivr-flt-tx { display: block; font-size: var(--fs-2xs); color: var(--tx2); margin-bottom: var(--sp-1); }
</style>
