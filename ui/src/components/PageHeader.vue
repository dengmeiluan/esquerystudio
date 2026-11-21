<template>
  <!-- 页头集群统一件：31 个 view 各写一套 {prefix}-hd/-l/-r/-ic/-tt/-sub 后
 标题字号(15/16px)、副标题(11/11.5px)、图标色、gap 各自漂移。
 这里固化多数派基线，差异只留 iconColor 一个 prop —— 其余靠插槽扩展而非新增开关 -->
  <div class="ph" :class="{ 'ph-top': align === 'top' }">
    <div class="ph-l">
      <component :is="icon" v-if="icon" :size="18" class="ph-ic" :style="iconColor ? { color: iconColor } : undefined" />
      <div class="ph-tx">
        <div class="ph-tt">
          {{ title }}
          <!-- 标题旁徽标/版本标记等（PluginsView 一类场景），不占独立一行 -->
          <slot name="title-extra" />
        </div>
        <div v-if="subtitle || $slots.subtitle" class="ph-sub">
          <slot name="subtitle">{{ subtitle }}</slot>
        </div>
      </div>
    </div>
    <div v-if="$slots.actions" class="ph-r">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

withDefaults(defineProps<{
  /** lucide 图标组件，省略则不渲染图标位 */
  icon?: Component;
  title: string;
  /** 纯文本副标题；需要富结构时用 #subtitle 插槽 */
  subtitle?: string;
  /** 覆盖图标色（默认 var(--brand)）。仅在语义确实不同时才传，如体检页用告警色 */
  iconColor?: string;
  /** 操作区较高时用 'top' 让左右顶部对齐，默认垂直居中 */
  align?: 'center' | 'top';
}>(), { align: 'center' });
</script>

<style scoped>
.ph {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin-bottom: var(--sp-3);
}
.ph-top { align-items: flex-start; }
.ph-l { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
.ph-ic { color: var(--brand); flex-shrink: 0; }
.ph-tx { min-width: 0; }
/* 600→650（字重倒挂修复——页头 16px/600 曾被卡头 13px/650 压住；
 与 .card-t 同 650 档，靠 16 vs 13 字号拉开层级） */
.ph-tt { font-size: var(--fs-xl); font-weight: 650; display: flex; align-items: center; gap: var(--sp-2); }
.ph-sub { font-size: var(--fs-xs); color: var(--muted); margin-top: var(--sp-0); }
/* 操作簇：允许换行，但**必须同时允许收缩**。
   此前只有 flex-shrink:0 —— 它永远不会被压窄，wrap 也就永远不触发，
   整簇按 min-content 撑出页头，结果在 1024px（左侧导航 232px 时页头只剩 768）
   SQL 控制台的「执行」按钮被顶到视口外 6px（实测 runRight=1029 / vw=1024）。
   给 min-width:0 让 wrap 真正生效：按钮先换行，再谈放不下。
   标题侧（.ph-l）已有 min-width:0，收缩时由它让位，不会被这簇挤扁。 */
.ph-r { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; min-width: 0; }
</style>
