<template>
  <svg :width="w" :height="h" class="spark" aria-hidden="true">
    <polyline :points="pts" fill="none" :stroke="color" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* -D4：零依赖自绘 SVG 迷你趋势线——消费方传数值数组即可，纵轴按窗口内 min/max 自适应 */
const props = withDefaults(defineProps<{ data: number[]; w?: number; h?: number; color?: string }>(),
  { w: 110, h: 26, color: 'var(--ac)' });
const pts = computed(() => {
  const d = props.data;
  if (d.length < 2) return '';
  const min = Math.min(...d), max = Math.max(...d), span = max - min || 1;
  return d.map((v, i) =>
    `${((i / (d.length - 1)) * (props.w - 4) + 2).toFixed(1)},${(props.h - 2 - ((v - min) / span) * (props.h - 4)).toFixed(1)}`
  ).join(' ');
});
</script>

<style scoped>
.spark { display: block; opacity: .85; }
</style>
