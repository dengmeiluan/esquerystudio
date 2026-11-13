<template>
  <!-- 耗时四档语义徽标统一入口。此前 BulkEditorView「took xx ms」裸 ms、
 ReindexAdvancedView「took：xx ms」、DevToolsView/QueryHistoryPanel 各持一份
 fmtTook/tookClass 复制品，本件固化后各消费方换挂（阈值单一出处 utils/format.ts）。
 fast 绿 / ok 中性 / slow 橙 / veryslow 红，语义随全局 --ok/--warn/--err 档。 -->
  <b v-if="ms != null" class="took-badge mono" :class="tookClass(ms)" :title="title || `端到端耗时 ${ms}ms`">{{ fmtTook(ms) }}</b>
</template>

<script setup lang="ts">
import { fmtTook, tookClass } from '../utils/format';

withDefaults(defineProps<{
  ms: number | null | undefined;
  title?: string;
}>(), {});
</script>

<style scoped>
/* 裸 b 元素浏览器默认 bold≈700 越过全站 650 字重上限约定，补显式 650 归档 */
.took-badge { font-variant-numeric: tabular-nums; font-weight: 650; }
.took-badge.fast { color: var(--ok); }
.took-badge.ok { color: var(--tx1); }
.took-badge.slow { color: var(--warn); }
.took-badge.veryslow { color: var(--err); }
</style>
