<template>
  <svg :width="w" :height="h" class="spark" :class="{ 'spark-i': !!onScrub }" aria-hidden="true">
    <polyline :points="pts" fill="none" :stroke="color" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    <!-- 1122 联动刻度：分数索引位置的小红刻度线（如 THROTTLE 调速时刻，父级按时间插值） -->
    <line v-for="(mx, k) in markXs" :key="'mk' + k" :x1="mx" :x2="mx" :y1="h - 2" :y2="h - 3.5"
      class="spark-mark" stroke="var(--err)" stroke-width="1" />
    <!-- 1122 联动选中采样点（时间旅行定位态，实心圆点；无定位不渲染） -->
    <circle v-if="pinPt" :cx="pinPt[0]" :cy="pinPt[1]" r="2.2" fill="var(--ac)" class="spark-pin" />
    <!-- 悬停预览点（装饰性反馈，随 pointer 移动跨点重算） -->
    <circle v-if="hoverPt" :cx="hoverPt[0]" :cy="hoverPt[1]" r="1.6" fill="none" :stroke="color" stroke-width="1" class="spark-hover" />
    <!-- 1122 交互捕获层：透明 rect 捕获 pointer 事件；无 onScrub 不渲染=既有调用点零破坏 -->
    <rect v-if="onScrub" class="spark-cap" x="0" y="0" :width="w" :height="h" fill="transparent"
      data-test="spark-cap" @pointermove="onMove" @pointerleave="onLeave" @click="onClick" />
  </svg>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/* -D4：零依赖自绘 SVG 迷你趋势线——消费方传数值数组即可，纵轴按窗口内 min/max 自适应。
 1122 交互升级（时间旅行联动）：可选 onScrub——透明 rect 捕获 pointermove/pointerleave/click，
 x 坐标按与 pts 同款归一化数学反算最近采样点索引（同点不重发降噪；leave 回 null；click 带
 'click' 来源标记，父级据此做粘性定位/再点取消）。装饰性曲线维持 aria-hidden，不加 tabindex
 （不打断表格 Tab 流）；本无过渡动画，reduced-motion 无需特判。marks=分数索引红刻度、
 activeIdx=选中点实心标记（均为可选，缺省不渲染）。 */
const props = withDefaults(defineProps<{
  data: number[]; w?: number; h?: number; color?: string;
  onScrub?: (index: number | null, kind?: 'move' | 'click') => void;
  marks?: number[];
  activeIdx?: number | null;
}>(), { w: 110, h: 26, color: 'var(--ac)', marks: () => [], activeIdx: null });

/* 几何单源：pts/刻度/标记/反算共用（与 -D4 原式逐字等价，仅抽函数复用） */
const geom = computed(() => {
  const d = props.data;
  const n = d.length;
  if (n < 2) return null;
  const min = Math.min(...d), max = Math.max(...d), span = max - min || 1;
  const xOf = (i: number) => (i / (n - 1)) * (props.w - 4) + 2;
  const yOf = (v: number) => props.h - 2 - ((v - min) / span) * (props.h - 4);
  /* x 坐标 → 最近采样点索引（pts x 式的反算，clamp 防越界） */
  const iOf = (x: number) => Math.max(0, Math.min(n - 1, Math.round(((x - 2) / (props.w - 4)) * (n - 1))));
  return { n, xOf, yOf, iOf };
});
const pts = computed(() => {
  const g = geom.value;
  if (!g) return '';
  return props.data.map((v, i) => `${g.xOf(i).toFixed(1)},${g.yOf(v).toFixed(1)}`).join(' ');
});
/* 刻度 x：分数索引（0..n-1，可为小数），域外丢弃 */
const markXs = computed(() => {
  const g = geom.value;
  if (!g) return [];
  return props.marks
    .filter(f => Number.isFinite(f) && f >= 0 && f <= g.n - 1)
    .map(f => g.xOf(f).toFixed(1));
});
/* 选中采样点坐标（activeIdx 域外不渲染） */
const pinPt = computed(() => {
  const g = geom.value;
  const i = props.activeIdx;
  if (!g || i == null || i < 0 || i > g.n - 1) return null;
  return [g.xOf(i).toFixed(1), g.yOf(props.data[i]).toFixed(1)];
});
/* 悬停预览点（内部态，不外发） */
const hoverIdx = ref<number | null>(null);
const hoverPt = computed(() => {
  const g = geom.value;
  if (!g || hoverIdx.value == null) return null;
  return [g.xOf(hoverIdx.value).toFixed(1), g.yOf(props.data[hoverIdx.value]).toFixed(1)];
});
/* rect 与 svg 等宽同坐标系（无 viewBox 缩放）：clientX 平移量即 SVG 用户单位 */
function idxFromEvent(e: PointerEvent): number | null {
  const g = geom.value;
  if (!g) return null;
  const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
  return g.iOf(e.clientX - box.left);
}
function onMove(e: PointerEvent) {
  const i = idxFromEvent(e);
  if (i == null || i === hoverIdx.value) return; /* 同点不重发 */
  hoverIdx.value = i;
  props.onScrub?.(i, 'move');
}
function onLeave() {
  if (hoverIdx.value == null) return; /* 从未命中过点的离开不重发 null */
  hoverIdx.value = null;
  props.onScrub?.(null);
}
function onClick(e: PointerEvent) {
  const i = idxFromEvent(e);
  if (i == null) return;
  props.onScrub?.(i, 'click');
}
</script>

<style scoped>
.spark { display: block; opacity: .85; }
/* 交互档：十字光标提示可 scrub（无 onScrub 不挂此类） */
.spark-i { cursor: crosshair; }
.spark-cap { cursor: crosshair; }
</style>
