<template><template v-for="(seg, si) in segs" :key="si"><mark v-if="seg.m" class="mt-mark">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></template>

<script setup lang="ts">
import { computed } from 'vue';
import { splitMark } from '../composables/useGridSearch';

/* v3.0.0 全站文本高亮收口：列表过滤输入框命中文本统一 <mark>（splitMark 纯函数复用，
 与表格内查找/JSON 树同一视觉语言）。textContent 与原文一致（mark 只是包裹），
 父级 title/aria 等不受影响。kw 空或无命中 → 原样单段。 */
const props = defineProps<{ text: string; kw: string }>();

const segs = computed(() => splitMark(props.text ?? '', props.kw ?? ''));
</script>

<style scoped>
.mt-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
</style>
