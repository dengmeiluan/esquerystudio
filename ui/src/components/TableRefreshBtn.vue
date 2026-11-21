<!-- RT/QRT 双内核「refreshable 刷新钮」同构段合并片段组件（ W3 QRT /
 RT 撤销 ，单根 button 无 fragment 规避 T39）。类名经 btnCls prop 注入；
 只 emit 'refresh' 意图（对齐 RT 既有事件名；525 分页同构：取数归宿主）。
 ⚠DOM 逐字节保真：aria-label/title/图标/文案与两内核原模板零变动（547 钮形制源码锚
 同步更新读本文件）。 -->
<template>
  <button v-if="on" class="btn sm ghost" :class="btnCls" aria-label="刷新结果"
    title="刷新结果（重跑当前查询）" @click="$emit('refresh')">
    <RotateCcw :size="13" /> 刷新
  </button>
</template>

<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next';

defineProps<{
  /* 工具钮类注入：'rt-tool-btn' / 'qrt-tool-btn'（.btn sm ghost 全局类直留本模板） */
  btnCls: string;
  /* 是否渲染（原 v-if="refreshable" 真值语义直传） */
  on?: boolean;
}>();

defineEmits<{ (e: 'refresh'): void }>();
</script>

<!-- 样式为何不 scoped：同 TableAggFoot。-tool-btn 系两内核 bar-right 钮组仍在用（内核
 scoped 规则保留），此处为刷新钮位同款复制（双址互锚，值变更须同步两内核 scoped）。 -->
<style>
/* 554 工蚁1 同款钮形（与内核 scoped .rt-tool-btn/.qrt-tool-btn 同值） */
.qrt-tool-btn, .rt-tool-btn { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); }
</style>
