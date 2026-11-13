<template>
  <!-- 全站「自动刷新间隔下拉」统一件——原 6 处原生 select 各自漂移
 （内联样式/scoped 类/档位不一），合并为一个紧凑控件。保持原生 select 语义，
 控件底子挂全局 .ipt，档位/文案由 ms 值生成，双向 v-model:ms（number） -->
  <select v-model="ms" class="ipt arf-sel" :title="label" :aria-label="label" :disabled="disabled">
    <option v-for="s in sizes" :key="s" :value="s">{{ labelOf(s) }}</option>
  </select>
</template>

<script setup lang="ts">
/* 自动刷新间隔下拉统一件。
 - ms：当前间隔毫秒（v-model:ms，number；0=关，档位表是否含 0 由调用方 sizes 决定）
 - sizes：档位表，默认 [0, 10000, 30000, 60000]（关/10s/30s/60s）
 - label：title 与 aria-label 提示文本，默认「自动刷新」
 - disabled：禁用档（挂墙模式——轮询恒定期控件禁用不禁藏；纯增量 prop，既有消费方零感知） */
withDefaults(defineProps<{
  sizes?: number[];
  label?: string;
  disabled?: boolean;
}>(), { sizes: () => [0, 10000, 30000, 60000], label: '自动刷新', disabled: false });

const ms = defineModel<number>('ms', { required: true });

/* 选项文案由 ms 值生成：0=关；>=1000 显示 s，否则 ms */
function labelOf(s: number): string {
  if (s === 0) return '关';
  return s >= 1000 ? (s / 1000) + 's' : s + 'ms';
}
</script>

<style scoped>
/* 紧凑档统一基准——宽 ~90px、高 25px（对齐全站工具行 .btn.sm 基准）；
 .ipt 全局类带 width:100%/padding 6px 10px，这里收窄为工具行控件形态（scoped 提级覆盖） */
.arf-sel { width: 90px; height: 25px; padding: var(--sp-0) var(--sp-1h); font-size: var(--fs-sm); box-sizing: border-box; }
</style>
