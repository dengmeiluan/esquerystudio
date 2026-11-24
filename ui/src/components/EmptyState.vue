<template>
  <!-- -D1：空态三件套（图标+一句话+行动按钮），全站统一入口——
 替代散落各视图的裸「暂无数据」文案，A 线批量补空态时复用 -->
  <div class="empty-state" :class="{ 'es-centered': centered, 'es-compact': compact }">
    <component :is="icon" :size="compact ? 18 : 26" class="es-icon" />
    <div class="es-text">{{ text }}</div>
    <div v-if="hint" class="es-hint">{{ hint }}</div>
    <button v-if="actionText" class="btn sm" :disabled="actionDisabled" @click="$emit('action')">{{ actionText }}</button>
    <!-- -F2 逃生舱：props 表达不了的内容（多按钮 / 多行 <pre> / 行内 <kbd>）放这里。
 只承载「内容」，不承载「容器」——padding、居中、图标仍由本组件决定，
 调用方无法通过插槽绕开统一留白。v-if 同 hint/actionText：
 不传插槽就不渲染这层，避免空容器多留一个 gap 的间距。 -->
    <div v-if="$slots.default" class="es-extra"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
withDefaults(defineProps<{
  icon: Component;      /* lucide 图标组件，调用方按语义选 */
  text: string;         /* 一句话说明现状 */
  hint?: string;        /* 可选：下一步指引 */
  actionText?: string;  /* 可选：行动按钮文案，配 @action */
  /** 可选：动作在途禁用（防连点重复下发；异步进度可感知）。
   undefined=不禁用——布尔属性绑 undefined 时不落 disabled，存量调用零触 */
  actionDisabled?: boolean;
  /** E3：页面级空态垂直居中（min-height 撑到视口内容区高度）——
 修「先在顶栏选择一个索引」贴页面顶部的突兀形态；默认 false 不影响存量 */
  centered?: boolean;
  /** 紧凑档——Overview 卡片/侧栏 mini 列表等窄容器内使用，
 缩 padding 与图标（原档位在窄卡里留白喧宾夺主，此前只能继续手搓裸 div） */
  compact?: boolean;
}>(), { centered: false });
defineEmits<{ (e: 'action'): void }>();
</script>

<style scoped>
/* 34px 是全站空态留白契约值：与 theme.css `.empty`（theme.css:483）双向同步、改一处必改另一处。
 不换算成 --sp（calc(var(--sp-6)+2px) 之类反而掩盖契约数），保留字面量；
 横向 16px 对齐 --sp-4。看守：emptyStatePadding.spec.ts 锚定本 padding 首值为字面量 px。 */
.empty-state { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); padding: 34px var(--sp-4); color: var(--tx1); animation: es-fade .18s ease-out; }
/* 图标柔光圆底（插画级质感——品牌色柔光从图标背后透出）；
 52/38px 是图标光学档、非间距刻度值（--sp 无对应档，calc 三段 token 拼接不划算），保留字面量 */
.es-icon {
  width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; opacity: .8;
  background: radial-gradient(circle, var(--ac-soft) 0%, transparent 72%);
}
.empty-state.es-compact .es-icon { width: 38px; height: 38px; }
.es-text { font-size: var(--fs-sm); }
.es-hint { font-size: var(--fs-xs); color: var(--tx1); opacity: .8; }
/* 逃生舱容器：只做「把任意内容横向居中、允许换行」，不含 padding——
 留白归 .empty-state 一处所有，避免插槽成为留白不统一的新入口。 */
.es-extra { display: flex; flex-wrap: wrap; gap: var(--sp-1h); justify-content: center; align-items: center; max-width: 100%; }
@keyframes es-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
/* E3：页面级空态垂直居中——min-height 撑到视口内容区高度
 （100vh - 顶栏/导航/参数条基准 210px），「先选索引」不再贴页面顶部 */
.empty-state.es-centered { min-height: calc(100vh - var(--vh-offset)); justify-content: center; }
/* 紧凑档——窄容器留白减半、图标缩小（组件级统一，替代散落裸 div） */
.empty-state.es-compact { padding: var(--sp-4) var(--sp-3); gap: 5px; }
.empty-state.es-compact .es-text { font-size: var(--fs-sm); }
.empty-state.es-compact .es-hint { font-size: var(--fs-xs); }
/* 全局 reduced-motion 段（theme.css）已兜底 animation-duration，这里显式关停双保险 */
@media (prefers-reduced-motion: reduce) { .empty-state.es-centered { animation: none; } }
</style>
