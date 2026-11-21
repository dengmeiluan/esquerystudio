<template>
  <!-- 全站「自动刷新间隔下拉」统一件——原 6 处原生 select 各自漂移
 （内联样式/scoped 类/档位不一），合并为一个紧凑控件。W5 升档：内部实现由原生
 select（旧注「刻意保持原生 select 语义」已退役）换 NSelect size="small"
 （Snapshots/Tasks 工具行同控件族——弹层定位/键盘导航/暗色主题免费获得）；
 对外契约零变化：v-model:ms(number)/sizes/label/disabled 四 props、.arf-sel
 类锚与 title/aria 透传原样，10+ 消费页零改。档位/文案由 ms 值生成 -->
  <n-select v-model:value="ms" class="arf-sel" :options="opts" size="small"
    :title="label" :aria-label="label" :disabled="disabled" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NSelect } from 'naive-ui';

/* 自动刷新间隔下拉统一件（内部 NSelect small 档；契约四 props 零变化见模板注）。
 - ms：当前间隔毫秒（v-model:ms，number；0=关，档位表是否含 0 由调用方 sizes 决定）
 - sizes：档位表，默认 [0, 10000, 30000, 60000]（关/10s/30s/60s）
 - label：title 与 aria-label 提示文本，默认「自动刷新」
 - disabled：禁用档（挂墙模式——轮询恒定期控件禁用不禁藏；纯增量 prop，既有消费方零感知） */
const props = withDefaults(defineProps<{
  sizes?: number[];
  label?: string;
  disabled?: boolean;
}>(), { sizes: () => [0, 10000, 30000, 60000], label: '自动刷新', disabled: false });

const ms = defineModel<number>('ms', { required: true });

const opts = computed(() => props.sizes.map(s => ({ label: labelOf(s), value: s })));

/* 选项文案由 ms 值生成：0=关；>=1000 显示 s，否则 ms */
function labelOf(s: number): string {
  if (s === 0) return '关';
  return s >= 1000 ? (s / 1000) + 's' : s + 'ms';
}
</script>

<style scoped>
/* 紧凑档统一基准——宽 ~90px、高 25px（对齐全站工具行 .btn.sm 基准）；
 NSelect 基座高度由 cssr 内联档（28px）:deep 压制回 25px（TasksView .tv-sel
 同款先例），字号沿原 fs-sm 档 */
.arf-sel { width: 90px; }
.arf-sel :deep(.n-base-selection) { --n-height: 25px !important; height: 25px; }
.arf-sel :deep(.n-base-selection .n-base-selection-label) { height: 25px; font-size: var(--fs-sm); }
</style>
