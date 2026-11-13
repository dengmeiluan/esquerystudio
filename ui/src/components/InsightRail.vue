<template>
  <!-- 降级铁律：degraded 时整栏静默收起，不渲染任何错误占位 -->
  <aside v-show="!degraded" class="irail">
    <div class="irail-head">
      <span class="irail-dot" :class="{ busy: loading }"></span>
      <span class="irail-title">现场分析</span>
    </div>
    <div class="irail-body">
      <slot />
      <!-- B：裸空态迁 EmptyState compact（原 .irail-empty 裸文案，窄侧栏走紧凑档） -->
      <EmptyState v-if="empty && !loading" compact :icon="Sparkles" text="暂无分析建议" />
    </div>
  </aside>
</template>

<script setup lang="ts">
/** InsightRail：右侧现场智能分析栏容器（各视图内嵌卡片，不是独立页面）。
 props.degraded=true → 整栏收起（智能死了，页面功能零影响）。 */
import { Sparkles } from 'lucide-vue-next';
import EmptyState from './EmptyState.vue';
withDefaults(defineProps<{
  loading?: boolean;
  degraded?: boolean;
  empty?: boolean;
}>(), {
  loading: false,
  degraded: false,
  empty: false,
});
</script>

<style scoped>
.irail { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: var(--sp-2h); }
.irail-head { display: flex; align-items: center; gap: 7px; padding: var(--sp-0) var(--sp-0) 0; }
.irail-title { font-size: var(--fs-sm); font-weight: 650; color: var(--tx1); letter-spacing: .3px; }
.irail-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ac); flex-shrink: 0; }
.irail-dot.busy { animation: irail-pulse 1.1s ease-in-out infinite; }
@keyframes irail-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 color-mix(in srgb, var(--ac) 45%, transparent); }
  50% { opacity: .55; box-shadow: 0 0 0 5px color-mix(in srgb, var(--ac) 0%, transparent); }
}
.irail-body { display: flex; flex-direction: column; gap: var(--sp-2h); }
/* B：.irail-empty 裸空态退役迁 EmptyState compact，本地样式同步更新删除 */
</style>
