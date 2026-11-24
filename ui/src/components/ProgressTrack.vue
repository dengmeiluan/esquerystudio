<template>
  <!-- showTip：轨道外包 Tip（hover 出 value/max 或 label）；否则裸轨道直出。
       多根模板不自动继承 attrs，$attrs 并入 trackAttrs 单点落到轨道（消费方 class/aria 覆盖口） -->
  <Tip v-if="showTip" :text="tipText">
    <div :class="trackCls" role="progressbar" v-bind="trackAttrs">
      <div class="pt-fill" :class="fillCls" :style="fillStyle"></div>
    </div>
  </Tip>
  <div v-else :class="trackCls" role="progressbar" v-bind="trackAttrs">
    <div class="pt-fill" :class="fillCls" :style="fillStyle"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * 统一进度条（确定/不确定双态）。
 * - value=null 走不确定态（流动光条，总量未知只有「在跑」语义）；数值走确定态
 * - 确定态填充用 transform: scaleX 驱动（不动画 width，布局零抖动），300ms ease-out-quart
 * - 负值钳 0、超 max 钳 max；value=0 仍渲染轨道（0% 也是合法读数）
 * - 颜色走主题语义 token（--ac/--ok/--warn/--err），轨道 --bg2
 * - 可访问性：role=progressbar + aria-valuemin/max/now（不确定态省 now）+ aria-label
 * - showTip：悬浮显示 label 或「value / max」（Tip 统一件承载）
 */
import { computed, useAttrs } from 'vue';
import Tip from './Tip.vue';

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const props = withDefaults(defineProps<{
  /** 当前值；null=不确定态（总量未知，光条流动） */
  value: number | null;
  max?: number;
  state?: 'primary' | 'success' | 'warning' | 'danger';
  /** 高度档：xs=4 / sm=6 / md=8px */
  size?: 'xs' | 'sm' | 'md';
  /** aria-label 与 Tip 文案（可选） */
  label?: string;
  showTip?: boolean;
}>(), { max: 100, state: 'primary', size: 'sm' });

/* 读数钳制域：[0, max]——超界值是后端脏数据，条形不允许反向或溢出 */
const clamped = computed(() =>
  props.value == null ? 0 : Math.min(Math.max(props.value, 0), props.max));
const indeterminate = computed(() => props.value == null);

const trackCls = computed(() => ['pt-track', `pt-${props.size}`]);
const fillCls = computed(() => [`pt-c-${props.state}`, { 'pt-indet': indeterminate.value }]);
/* 确定态：scaleX 比例驱动；不确定态交给 keyframes，不写内联 transform */
const fillStyle = computed(() =>
  indeterminate.value ? undefined : { transform: `scaleX(${props.max > 0 ? clamped.value / props.max : 0})` });

/* 不确定态省 aria-valuenow（无值可报）；label 缺省不挂 aria-label 由上下文名承担。
   消费方 attrs（class/aria-* 等）并排在后——同键覆盖内建默认 */
const trackAttrs = computed(() => ({
  'aria-valuemin': 0,
  'aria-valuemax': props.max,
  ...(props.value == null ? {} : { 'aria-valuenow': clamped.value }),
  ...(props.label ? { 'aria-label': props.label } : {}),
  ...attrs,
}));

const tipText = computed(() => props.label
  ?? (indeterminate.value ? '进行中（进度未知）' : `${clamped.value} / ${props.max}`));
</script>

<style scoped>
/* 轨道：胶囊形，overflow 裁掉不确定态光条的越界段 */
.pt-track { position: relative; overflow: hidden; background: var(--bg2); border: 1px solid var(--bd); border-radius: 999px; }
.pt-xs { height: 4px; border: none; }
.pt-sm { height: 6px; }
.pt-md { height: 8px; }
/* 填充：绝对铺满轨道后 scaleX 收缩（origin 左缘），transition 只触 transform */
.pt-fill { position: absolute; inset: 0; transform-origin: 0 50%; border-radius: 999px; transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1); }
.pt-c-primary { background: linear-gradient(90deg, var(--ac-hi), var(--ac)); }
.pt-c-success { background: var(--ok); }
.pt-c-warning { background: var(--warn); }
.pt-c-danger { background: var(--err); }
/* 不确定态：40% 宽光条 translateX 循环流动（纯 transform，无布局动画） */
.pt-indet { inset: 0 auto 0 0; width: 40%; animation: pt-flow 1.2s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes pt-flow {
  from { transform: translateX(-100%); }
  to { transform: translateX(250%); }
}
/* 减动效偏好：流动退化为原地透明度脉动，确定态过渡一并关闭 */
@media (prefers-reduced-motion: reduce) {
  .pt-fill { transition: none; }
  .pt-indet { animation: pt-pulse 1.6s ease-in-out infinite; }
  @keyframes pt-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }
}
</style>
