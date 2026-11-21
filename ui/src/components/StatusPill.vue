<template>
  <!-- W-D：统一自绘状态徽标。色板不自带——tone 直挂 theme.css 既有 .pill g|y|r|b|n
 语义档单源（theme.css 状态 pill 段），胶囊形态/字号/字重全归全局 .pill；
 en 有值时渲染英文小字档（SnapshotsView sv-st-en 双语范式合并，中文主体 + 弱化英文后缀） -->
  <span class="pill" :class="tone" :title="title || undefined">{{ label }}<span v-if="en" class="sp-en">{{ en }}</span></span>
</template>

<script setup lang="ts">
/* 契约冻结（预定，不得改名）：props 仅 tone/label/en/title 四项，tone 缺省 'n' 中性档。
 消费方式见八视图改用（.spec.ts 看守） */
withDefaults(defineProps<{
  tone?: 'g' | 'y' | 'r' | 'b' | 'n';
  label: string;
  en?: string;
  title?: string;
}>(), { tone: 'n' });
</script>

<style scoped>
/* W-D：英文小字档——原 SnapshotsView .sv-st-en 形态逐字同步更新（fs-2xs 弱化 + 3px 间距）。
 本组件唯一自有样式只此一条，色板与底形零重复 */
.sp-en { font-size: var(--fs-2xs); opacity: .65; margin-left: 3px; }
</style>
