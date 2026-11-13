<template>
  <div class="gve">
    <!-- 1012：geo_distance / geo_bounding_box 专用坐标编辑位（ClauseNode 挂接）。
     geo_distance = distance 输入 + lat/lon 双数值；bbox 两形态：corners（top_left/bottom_right
     各 lat/lon 四输入）与 edges 平铺四数值。值/params 直通投影（AST 零改动），空串删键、
     非数值中间态不写（weight/range 同语言）；lat/lon 越界黄点轻警示（不拦截）。
     更多参数（distance_type/validation_method/boost…）折叠 GenericParams schema 表。 -->
    <template v-if="op === 'geo_distance' && pt">
      <label class="gve-lb">distance</label>
      <input class="inp mono gve-dist" :value="distText" placeholder="200km" list="gve-units"
             title="距离 + 单位（m/km/mi/yards/ft/inches/cm/mm/nm；缺省米）"
             @input="onDist(($event.target as HTMLInputElement).value)" />
      <datalist id="gve-units">
        <option value="1km" /><option value="10km" /><option value="100km" />
        <option value="500m" /><option value="100mi" />
      </datalist>
      <GeoPointInputs :pt="pt" title-pre="圆心" @patch="p => emitPatch({ value: p })" />
    </template>
    <template v-else-if="op === 'geo_bounding_box' && box">
      <template v-if="box.mode === 'corners'">
        <span class="gve-grp">左上 top_left</span>
        <GeoPointInputs :pt="box.corners.tl" title-pre="左上角" @patch="p => onCorner('tl', p)" />
        <span class="gve-grp">右下 bottom_right</span>
        <GeoPointInputs :pt="box.corners.br" title-pre="右下角" @patch="p => onCorner('br', p)" />
      </template>
      <template v-else>
        <span class="gve-grp">四边</span>
        <label class="gve-lb">top</label>
        <input class="inp mono gve-n" :value="edgeText('top')" placeholder="纬度上界"
               title="top：北边界纬度（-90~90）" @input="onEdge('top', ($event.target as HTMLInputElement).value)" />
        <label class="gve-lb">left</label>
        <input class="inp mono gve-n" :value="edgeText('left')" placeholder="经度西界"
               title="left：西边界经度（-180~180）" @input="onEdge('left', ($event.target as HTMLInputElement).value)" />
        <label class="gve-lb">right</label>
        <input class="inp mono gve-n" :value="edgeText('right')" placeholder="经度东界"
               title="right：东边界经度（-180~180）" @input="onEdge('right', ($event.target as HTMLInputElement).value)" />
        <label class="gve-lb">bottom</label>
        <input class="inp mono gve-n" :value="edgeText('bottom')" placeholder="纬度下界"
               title="bottom：南边界纬度（-90~90）" @input="onEdge('bottom', ($event.target as HTMLInputElement).value)" />
      </template>
    </template>
    <button aria-label="更多参数" class="btn sm ghost gve-more" :class="{ on: showMore }"
            title="更多参数（distance_type / validation_method / boost…）" @click="showMore = !showMore">
      <SlidersHorizontal :size="12" />
    </button>    <div v-if="showMore" class="gve-sub">
      <GenericParams :value="moreView" :schema="OPS_META[op]?.params || []" path-prefix="" @update="onMore" />
    </div>
  </div>
</template>

<script setup lang="ts">
/* GeoPointInputs 内联子件（lat/lon 双输入 + 越界警示）：单文件递归组件的极简替代——
   模板内 <script> 不支持，用小组合件定义在 GeoPointInputs.ts？为控件量直接内联模板双份
   会重复；Vue 3.3+ SFC 可 defineComponent 内联。此处用函数式组件最省。 */
import { computed, defineComponent, h, ref, type PropType } from 'vue';
import { SlidersHorizontal } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';
import { OPS_META } from '../../utils/queryAstOps';
import { geoPointView, bboxView, latOutOfRange, lonOutOfRange, type GeoPointView } from '../../utils/geoForm';

const props = defineProps<{
  op: string;
  value: unknown;
  params: Record<string, unknown>;
}>();
const emit = defineEmits<{ (e: 'patch', p: { value?: unknown; params?: Record<string, unknown> }): void }>();

const pt = computed(() => props.op === 'geo_distance' ? geoPointView(props.value) : null);
const box = computed(() => props.op === 'geo_bounding_box' ? bboxView(props.value) : null);
const showMore = ref(false);

/* 更多参数视图：distance 由专用输入承担，schema 表只见其余键（加出 distance 会被路由回专用位） */
const moreView = computed(() => {
  const out = { ...props.params };
  if (props.op === 'geo_distance') delete out.distance;
  return out;
});
function onMore(v: Record<string, unknown> | unknown[]) {
  if (Array.isArray(v)) return;
  const out = { ...v };
  if (props.op === 'geo_distance' && 'distance' in v) {
    const d = v.distance;
    delete out.distance;
    if (typeof d === 'string' && d) out.distance = d;   // 表内改 distance 路由回参数区（字符串形态保留）
  }
  emit('patch', { params: out });
}

const distText = computed(() => {
  const d = props.params.distance;
  return typeof d === 'string' ? d : d === undefined || d === null ? '' : String(d);
});
function onDist(raw: string) { emit('patch', raw === '' ? { params: sans('distance') } : { params: { ...props.params, distance: raw } }); }
function sans(k: string): Record<string, unknown> {
  const out = { ...props.params };
  delete out[k];
  return out;
}

/* 圆心坐标写回：空串删键；非数值中间态不写；数值即时写（半成品 {} 合法中间态与 range 同语义） */
function patchPoint(base: GeoPointView, k: 'lat' | 'lon', raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  if (raw === '') delete out[k];
  else {
    const n = Number(raw);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}
function onCorner(which: 'tl' | 'br', p: Record<string, unknown>) {
  if (!box.value || box.value.mode !== 'corners') return;
  const v = props.value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...v };
  const key = which === 'tl' ? 'top_left' : 'bottom_right';
  if (Object.keys(p).length) out[key] = p;
  else delete out[key];
  emit('patch', { value: out });
}
function edgeText(k: 'top' | 'right' | 'bottom' | 'left'): string {
  const n = box.value?.mode === 'edges' ? box.value.edges[k] : undefined;
  return n === undefined ? '' : String(n);
}
function onEdge(k: 'top' | 'right' | 'bottom' | 'left', raw: string) {
  if (!box.value || box.value.mode !== 'edges') return;
  const out = { ...(props.value as Record<string, unknown>) };
  if (raw === '') delete out[k];
  else {
    const n = Number(raw);
    if (Number.isFinite(n)) out[k] = n;
  }
  emit('patch', { value: out });
}
function emitPatch(p: { value?: unknown; params?: Record<string, unknown> }) { emit('patch', p); }

/* ── lat/lon 双输入内联子件 ── */
const GeoPointInputs = defineComponent({
  props: {
    pt: { type: Object as PropType<GeoPointView>, required: true },
    titlePre: { type: String, default: '' },
  },
  emits: ['patch'],
  setup(p, { emit: e }) {
    const txt = (k: 'lat' | 'lon') => (p.pt[k] === undefined ? '' : String(p.pt[k]));
    const on = (k: 'lat' | 'lon', raw: string) => e('patch', patchPoint(p.pt, k, raw));
    return () => [
      h('label', { class: 'gve-lb' }, 'lat'),
      h('input', {
        class: 'inp mono gve-n', value: txt('lat'), placeholder: '纬度 -90~90',
        title: p.titlePre + '纬度（-90~90，北纬为正）',
        onInput: (ev: Event) => on('lat', (ev.target as HTMLInputElement).value),
      }),
      h('label', { class: 'gve-lb' }, 'lon'),
      h('input', {
        class: 'inp mono gve-n', value: txt('lon'), placeholder: '经度 -180~180',
        title: p.titlePre + '经度（-180~180，东经为正）',
        onInput: (ev: Event) => on('lon', (ev.target as HTMLInputElement).value),
      }),
      p.pt.lat !== undefined && latOutOfRange(p.pt.lat)
        ? h('span', { class: 'cn-rwarn', role: 'img', 'aria-label': '纬度超出 -90~90', title: 'lat 超出合法域（-90~90）；ES 将按 validation_method 决定拒绝或钳制' })
        : null,
      p.pt.lon !== undefined && lonOutOfRange(p.pt.lon)
        ? h('span', { class: 'cn-rwarn', role: 'img', 'aria-label': '经度超出 -180~180', title: 'lon 超出合法域（-180~180）；ES 将按 validation_method 决定拒绝或钳制' })
        : null,
    ];
  },
});
</script>

<style scoped>
.gve { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; width: 100%; }
.gve-grp { font-size: var(--fs-2xs); color: var(--ac-hi); margin-right: var(--sp-1); }
.gve-dist { width: 96px; height: 28px; font-size: var(--fs-sm); }
.gve-more { flex: none; }
.gve-sub { flex-basis: 100%; padding: var(--sp-2) var(--sp-3); background: var(--bg1); border-radius: var(--r-s); }
/* 内联 h() 子件（GeoPointInputs 的 lat/lon 输入与越界警示点）不带 scoped data 属性，
   相关规则须 :deep 穿透（inlineRenderScope 守卫约束），模板元素与 h() 元素共用同一组规则 */
.gve :deep(.gve-lb) { font-size: var(--fs-2xs); color: var(--tx2); }
.gve :deep(.gve-n) { width: 112px; height: 28px; font-size: var(--fs-sm); }
.gve :deep(.cn-rwarn) { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--warn); cursor: help; }
</style>
