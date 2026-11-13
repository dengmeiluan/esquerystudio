<!-- Z1（实报「组件性」头名）：三表可展开外壳统一件——合并
 LiveDashboardView 历史区 Top 索引/告警历史/慢请求三块同构手写外壳（展开钮/计数/
 导出门控/空态四要素三套写法已漂移；告警历史计数源 srvAlerts vs alertHistRows
 筛选漂移真缺陷随合并治——计数经 :count 单源传入）。
 契约：props { title, count?, open(v-model), suffix? }；slots #head（头部元信息）/
 #actions（导出钮组）/default（内容）。根元素 div（_attrs 透传落位类名 ld-hist-hist）。
 展开钮 aria-expanded+chevron 旋转过渡（transform-only）。 -->
<template>
  <div class="cp" :class="{ open }" v-bind="$attrs">
    <div class="cp-row">
      <button type="button" class="cp-toggle" :aria-expanded="open" @click="$emit('update:open', !open)">
        <span class="cp-chev" aria-hidden="true">▶</span>{{ title }}<span v-if="suffix" class="cp-suffix">{{ suffix }}</span><span v-if="count != null" class="cp-n">{{ count }} 条</span>
      </button>
      <slot name="head" />
      <span class="cp-sp" />
      <slot name="actions" />
    </div>
    <slot v-if="open" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  /** 计数徽标（单源传入——消费方绑「表行集」而非原始数据集，筛选后保持一致） */
  count?: number;
  /** 标题后缀（如慢请求阈值 ms 档） */
  suffix?: string;
  open: boolean;
}>();
defineEmits<{ 'update:open': [boolean] }>();
</script>

<style scoped>
/* 外壳形态沿用 .ld-hist-hist 既有语言（消费方透传类名承担落位）；本组件只持自身微结构 */
.cp { display: flex; flex-direction: column; gap: var(--sp-1); align-items: flex-start; }
.cp-row { display: flex; align-items: center; gap: var(--sp-2); width: 100%; }
.cp-toggle { display: inline-flex; align-items: center; gap: var(--sp-1); background: transparent; border: none; color: var(--tx1); font-size: var(--fs-xs); cursor: pointer; padding: 0; }
.cp-toggle:hover { color: var(--tx0); }
/* chevron 旋转过渡：transform-only（--dur-fast 微交互档=681 同律） */
.cp-chev { color: var(--tx2); font-size: var(--fs-2xs); transition: transform var(--dur-fast) var(--ease-out); }
.cp.open .cp-chev { transform: rotate(90deg); }
.cp-suffix { color: var(--muted); }
.cp-n { color: var(--tx2); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.cp-sp { flex: 1; }
</style>
