<template>
  <div class="sk" :style="{ width: width || '100%', height: h }" :class="{ round, circle }" />
</template>

<script setup lang="ts">
/**
 * 通用骨架屏。用于任何异步区域的 loading 占位，避免"空白闪烁"。
 * - 支持 height（rem/px/字符串）、width、round（圆角块）、circle（正圆）
 * - 动效走 CSS shimmer，1.4s 循环；respects prefers-reduced-motion（自动降级为静态）
 */
const props = defineProps<{
  height?: string | number;
  width?: string | number;
  round?: boolean;
  circle?: boolean;
}>();
const h = typeof props.height === 'number' ? props.height + 'px' : props.height || '12px';
const width = typeof props.width === 'number' ? props.width + 'px' : props.width;
</script>

<style scoped>
.sk {
  position: relative;
  background: linear-gradient(90deg, var(--bg2) 0%, var(--bg3) 40%, var(--bg2) 80%);
  background-size: 220% 100%;
  animation: sk-shim 1.4s ease-in-out infinite;
  border-radius: var(--r-xs);
}
.sk.round { border-radius: var(--r-m); }
.sk.circle { border-radius: 50%; aspect-ratio: 1 / 1; }
@keyframes sk-shim {
  from { background-position: 100% 0; }
  to { background-position: -20% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sk { animation: none; background: var(--bg2); }
}
</style>
