<template>
  <NTooltip trigger="hover" :placement="placement">
    <template #trigger><span class="tip-trigger"><slot /></span></template>
    <span class="tip-text" :class="{ 'tip-long': long }">{{ text }}</span>
  </NTooltip>
</template>

<script setup lang="ts">
/**
 * 统一悬浮提示（薄封装 NTooltip）。原生 title 属性超过 60 字符时浏览器原生
 * 提示无法承载（不换行、不可滚动、不受主题控制），全站原生 title 逐步迁到
 * 本组件；新代码的悬浮提示一律用本组件，长文本传 long 档。
 * - text：提示内容
 * - placement：浮出方位，默认 top
 * - long：长文本档——宽 320px、自动换行、最高 200px 内滚动
 * 触发元素经默认插槽透传（hover 触发），如：<Tip text="..."><button>…</button></Tip>
 */
import { NTooltip, type TooltipProps } from 'naive-ui';

withDefaults(defineProps<{
  text: string;
  placement?: TooltipProps['placement'];
  long?: boolean;
}>(), { placement: 'top' });
</script>

<style scoped>
/* 插槽外包一层 span：disabled 按钮自身不派发 pointer 事件，hover 提示会失效；
   包一层可命中的行内元素后提示对 disabled 按钮仍可用（naive 的 trigger 需要
   element，display:contents 不是盒子不行，用 inline-flex 最小影响） */
.tip-trigger { display: inline-flex; }
/* 长文本档：320px 定宽多行 + 200px 限高滚动（原生 title 无此承载）。
   浮层内容 teleport 到 body，仍是本组件模板一部分，scoped 样式正常命中 */
.tip-text.tip-long { display: block; width: min(320px, 92vw); max-height: 200px; overflow-y: auto; white-space: normal; }
</style>
