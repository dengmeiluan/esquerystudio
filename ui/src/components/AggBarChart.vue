<template>
  <div class="agg-chart" ref="wrapRef">
    <svg
      v-if="buckets.length"
      :width="w" :height="h"
      @mousedown="onDown"
      @mousemove="onMove"
      @mouseup="onUp"
      @mouseleave="onUp"
    >
      <g v-for="(b, i) in bars" :key="i">
        <rect
          :x="barX(i)" :y="barY(b.doc_count)" :width="barW" :height="barH(b.doc_count)"
          :class="['agg-bar', { in: inBrush(i) }]"
          @mouseenter="hover = b"
          @mouseleave="hover = null"
        />
      </g>
      <rect v-if="brush" :x="brushX0" :y="0" :width="brushWSel" :height="h" class="agg-brush" />
    </svg>
    <!-- x 轴刻度（1319）：此前整张图没有任何坐标标注，六根柱分别对应哪段时间/哪个词条
 只能逐根悬停才看得到——「一眼看分布」这件事做不到。刻度只标首/尾 + 按可用宽度抽稀的
 中间刻度，避免 60 桶时标签互相压住；文本用 key_as_string 短日期（日期桶）或桶 key（词条桶）。 -->
    <div v-if="buckets.length" class="agg-x" aria-hidden="true">
      <span v-for="t in xTicks" :key="t.i" class="agg-x-t" :style="{ left: t.left }">{{ t.label }}</span>
    </div>
    <!-- 空态引导审计：说明成因（自动注入的日期/词条聚合都未产出桶）作为下一步提示
 裸 .empty（含内联 padding:12px）迁 EmptyState compact（图表窄容器） -->
    <EmptyState v-else compact :icon="BarChart3" text="无直方图数据"
      hint="需索引含可聚合字段（date 型走时间直方图，keyword/数值型走词条分布），或 DSL 自带 date_histogram 聚合" />
    <div v-if="hover" class="agg-tip mono">{{ hover.key_as_string || hover.key }} · {{ fmtNum(hover.doc_count) }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { BarChart3 } from 'lucide-vue-next';
import { fmtNum } from '../utils/format';
/* 裸 .empty 迁 EmptyState compact */
import EmptyState from './EmptyState.vue';

interface Bucket { key: number | string; key_as_string?: string; doc_count: number }

const props = defineProps<{ buckets: Bucket[]; height?: number }>();
const emit = defineEmits<{ (e: 'brush', from: Bucket, to: Bucket, endKey: number | string): void }>();

/* （G 组·渲染性能）：桶降采样——date_histogram 的 interval 细时桶数可达千/万，
 SVG 全量渲染拖慢 brush。超 MAX_BARS 按组等宽合并（doc_count 求和、key 取组首），
 组首 key 即原桶 key，brush from/to 语义不变（误差 ≤ 一组）。≤MAX_BARS 全量渲染。 */
const MAX_BARS = 400;
const bars = computed<Bucket[]>(() => {
  const n = props.buckets.length;
  if (n <= MAX_BARS) return props.buckets;
  const group = Math.ceil(n / MAX_BARS);
  const out: Bucket[] = [];
  for (let i = 0; i < n; i += group) {
    const end = Math.min(i + group, n);
    let cnt = 0;
    for (let j = i; j < end; j++) cnt += Number(props.buckets[j].doc_count) || 0;
    out.push({ ...props.buckets[i], doc_count: cnt });
  }
  return out;
});

const wrapRef = ref<HTMLElement>();
const w = ref(600);
const h = computed(() => props.height || 90);
const pad = 2;

const maxCount = computed(() => Math.max(1, ...bars.value.map(b => b.doc_count)));
const barW = computed(() => Math.max(2, (w.value - pad * 2) / Math.max(1, bars.value.length) - 1.5));
const barX = (i: number) => pad + i * ((w.value - pad * 2) / bars.value.length);
const barY = (c: number) => h.value - barH(c);
const barH = (c: number) => Math.max(c > 0 ? 3 : 1, (c / maxCount.value) * (h.value - 8));

/* brush */
const brush = ref<{ x0: number; x1: number } | null>(null);
let brushing = false;
const brushX0 = computed(() => Math.min(brush.value?.x0 ?? 0, brush.value?.x1 ?? 0));
const brushWSel = computed(() => Math.abs((brush.value?.x1 ?? 0) - (brush.value?.x0 ?? 0)));

function svgX(e: MouseEvent): number {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
  return e.clientX - rect.left;
}
function onDown(e: MouseEvent) {
  brushing = true;
  const x = svgX(e);
  brush.value = { x0: x, x1: x };
}
function onMove(e: MouseEvent) {
  if (!brushing || !brush.value) return;
  brush.value.x1 = svgX(e);
}
function onUp() {
  if (!brushing) return;
  brushing = false;
  if (!brush.value || brushWSel.value < 8) { brush.value = null; return; }
  const i0 = Math.max(0, xToIdx(brushX0.value));
  const i1 = Math.min(bars.value.length - 1, xToIdx(brushX0.value + brushWSel.value));
  const from = bars.value[i0], to = bars.value[i1];
  if (from && to) {
    /* 1319b：桶 key 是**区间起点**（date_histogram 语义），选中的最后一个桶覆盖
       [to.key, 下一个桶 key)。把 to.key 直接当右闭端点会切掉最后一整个桶的数据，
       所以右边界取「下一个桶的 key」；最后一个桶没有下一个时，按已见桶的最短步长外推
       （单桶时无从推断步长 → 退回 to.key，至少不比原来差）。 */
    const next = bars.value[i1 + 1];
    let endKey: number | string = to.key;
    if (next) endKey = next.key;
    else {
      const prev = bars.value[i1 - 1];
      const step = prev && typeof to.key === 'number' && typeof prev.key === 'number' ? to.key - prev.key : 0;
      if (step > 0) endKey = (to.key as number) + step;
    }
    emit('brush', from, to, endKey);
  }
  brush.value = null;
}
function xToIdx(x: number): number {
  return Math.floor((x - pad) / ((w.value - pad * 2) / bars.value.length));
}
function inBrush(i: number): boolean {
  if (!brush.value) return false;
  const x = barX(i);
  return x >= brushX0.value && x <= brushX0.value + brushWSel.value;
}

const hover = ref<Bucket | null>(null);

/* ═══ 1319：x 轴刻度 ═══
 目标：不看悬停也能读出「哪根柱子是什么时候 / 什么词条」。
 标签形态两档，按桶 key 判定：
  - 日期桶（key_as_string 是 ISO）→ 短日期 MM-DD（跨年才带年份）；
  - 词条桶 → 原文，过长由 CSS 省略（title 保留全文）。
 抽稀：标签约需 60px 宽，按容器宽算最多几条，步长取整；**首尾必须有**——
 首尾是范围的两端，缺了就读不出「这段时间」「这个区间」到底是哪段。 */
const TICK_MIN_W = 60;
function tickLabel(b: Bucket): string {
  const ks = b.key_as_string;
  if (typeof ks === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ks)) {
    const y = ks.slice(0, 4), md = ks.slice(5, 10);
    return Number(y) === new Date().getFullYear() ? md : y + '-' + md;
  }
  return String(b.key);
}
const xTicks = computed<{ i: number; left: string; label: string }[]>(() => {
  const list = bars.value;
  if (!list.length) return [];
  const maxTicks = Math.max(2, Math.floor(w.value / TICK_MIN_W));
  const step = Math.max(1, Math.ceil(list.length / maxTicks));
  const idxs = new Set<number>([0, list.length - 1]);
  for (let i = step; i < list.length - 1; i += step) idxs.add(i);
  const total = Math.max(1, list.length);
  return [...idxs].sort((a, b) => a - b).map(i => ({
    i,
    /* 桶中心对齐（与 barX 的起点语义一致），末刻度右贴边避免溢出被裁 */
    left: i === list.length - 1 ? '100%' : ((pad + (i + 0.5) * ((w.value - pad * 2) / total)) / w.value * 100) + '%',
    label: tickLabel(list[i]),
  }));
});

let ro: ResizeObserver | null = null;
onMounted(() => {
  const el = wrapRef.value;
  if (!el) return;
  measureW(el);
  /* 0 宽回包（再藏）保留旧宽不清零——翻转显形不闪 0 宽/旧宽 */
  ro = new ResizeObserver(() => {
    const el2 = wrapRef.value;
    if (el2 && el2.clientWidth > 0) w.value = el2.clientWidth;
  });
  ro.observe(el);
});
onBeforeUnmount(() => ro?.disconnect());

/* 0 宽兜底（实报直方图 svg 溢出/游离观感）：宿主以 v-show=false（节收起/
 无桶）挂载本件时容器无盒模型，clientWidth 测到 0——旧实现把 0 直接落 w（svg 被压成 0 宽），
 翻转显形瞬间 RO 未回包则闪一帧旧 600 宽溢出。现 0 宽不落值：rAF 有界重测直至非 0 定宽
 （RO 缺席/不回包环境兜底），显形正常路径由 RO 回包（0→真宽）定宽。
 降采样/brush 行为零触（aggChartDownsample 行为锁）。 */
function measureW(el: HTMLElement): void {
  if (el.clientWidth > 0) { w.value = el.clientWidth; return; }
  for (let i = 0; i < 6; i++) {
    requestAnimationFrame(() => {
      const el2 = wrapRef.value;
      if (el2 && el2.clientWidth > 0) w.value = el2.clientWidth;
    });
  }
}
</script>

<style scoped>
.agg-chart { position: relative; width: 100%; user-select: none; }
.agg-chart svg { display: block; cursor: crosshair; }
.agg-bar { fill: var(--ac); opacity: .55; transition: opacity var(--tr); }
.agg-bar:hover { opacity: 1; }
.agg-bar.in { fill: var(--ac-hi); opacity: 1; }
.agg-brush { fill: color-mix(in srgb, var(--ac) 18%, transparent); stroke: var(--ac-line); stroke-width: 1; }
/* x 轴刻度条：等高定行，标签绝对定位到桶中心；首尾贴边不溢出（overflow 裁掉越界半字不算问题，
 因为末刻度用 100% + translateX(-100%) 内收） */
.agg-x { position: relative; height: 14px; margin-top: 1px; }
.agg-x-t {
  position: absolute; top: 0; transform: translateX(-50%);
  font-size: var(--fs-2xs); color: var(--tx2); white-space: nowrap;
  max-width: 96px; overflow: hidden; text-overflow: ellipsis;
}
.agg-x-t:last-child { transform: translateX(-100%); }
.agg-tip {
  position: absolute; top: -24px; right: 0; font-size: var(--fs-xs); color: var(--tx1);
  background: var(--bg2); border: 1px solid var(--line-strong); border-radius: 5px; padding: 1px var(--sp-2);
  pointer-events: none;
}
</style>
