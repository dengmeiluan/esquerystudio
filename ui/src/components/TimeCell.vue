<template>
  <!-- 时间单元格统一入口。列内给相对时间（窄、好扫读），
 悬浮给带时区的绝对时间（精确、跨机器无歧义）。
 这个组合此前已在 NotifyCenter / DslQueryView / OverviewView /
 RestView / XmigrateView 五处自发形成，此处固化成组件后推广。 -->
  <span class="tc mono" :title="fmtTimeTz(ts)">{{ body }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtTime, fmtTimeTz, relTime } from '../utils/format';
import { useNow } from '../composables/useNow';

const props = withDefaults(defineProps<{
  ts: number | string | null | undefined;
  abs?: boolean;
}>(), { abs: false });

/* 必须接 useNow：relTime 不传 now 只在渲染瞬间算一次，
 页面开着十分钟仍显示「4m 前」（format.ts 的注释自陈此病灶）。
 useNow 是模块级 30s 心跳单例，多组件共享一个定时器。 */
const now = useNow();

const body = computed(() => {
  if (props.ts == null) return '-';
  return props.abs ? fmtTime(props.ts) : relTime(props.ts, now.value);
});
</script>

<style scoped>
.tc { white-space: nowrap; }
</style>
