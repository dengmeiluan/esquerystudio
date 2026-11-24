<template>
  <section
    class="resizable-pane"
    :class="[`axis-${axis}`, { collapsed }]"
    :style="paneStyle"
    :data-pane-id="id"
    :data-pane-size="size"
  >
    <header v-if="title" class="rp-title">
      <span>{{ title }}</span>
      <button
        v-if="collapsible"
        type="button"
        class="rp-toggle"
        :aria-label="collapsed ? `展开${title}` : `收起${title}`"
        :aria-expanded="!collapsed"
        @click="emit('toggle-collapse', !collapsed)"
      >
        <ChevronRight v-if="collapsed" :size="13" />
        <ChevronDown v-else :size="13" />
      </button>
    </header>
    <div v-show="!collapsed" class="rp-content"><slot /></div>
    <!-- 被分栏独占隐藏的 pane（handleMaxLabel 在场即互覆盖参与者）保留柄——
 0 宽 pane+11px 柄=右缘细条，柄上档位钮激活态常显=唯一还原入口（否则独占后无法切回）。
 手动折叠（title 轨场景）无 handleMaxLabel，柄照旧隐藏。 -->
    <SplitHandle
      v-if="!last && (!collapsed || handleMaxLabel)"
      :axis="axis"
      :size="size"
      :min="min"
      :max="max"
      :label="`调整${title || id}大小`"
      :max-label="handleMaxLabel"
      :max-active="handleMaxActive"
      @resize="emit('resize', $event)"
      @resize-end="emit('resize-end', $event)"
      @reset="emit('reset')"
      @max-click="emit('handle-max')"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, ChevronRight } from 'lucide-vue-next';
import SplitHandle from './SplitHandle.vue';

const props = withDefaults(defineProps<{
  id: string;
  axis: 'horizontal' | 'vertical';
  size: number;
  min: number;
  max: number;
  title?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  focusable?: boolean;
  last?: boolean;
  /* 分栏档位循环钮（互覆盖）透传 SplitHandle */
  handleMaxLabel?: string;
  handleMaxActive?: boolean;
}>(), {
  title: '',
  collapsed: false,
  collapsible: false,
  focusable: false,
  last: false,
  handleMaxLabel: '',
  handleMaxActive: false,
});

const emit = defineEmits<{
  (e: 'resize', size: number): void;
  (e: 'resize-end', size: number): void;
  (e: 'reset'): void;
  (e: 'toggle-collapse', collapsed: boolean): void;
  (e: 'handle-max'): void;
}>();

const paneStyle = computed(() => {
  /* 折叠塌缩——此前 collapsed 只清 min-width，paneStyle 的 width 原值仍在，
 折叠后留下一个「空壳面板+竖排标题轨+孤立折叠钮」（实报「按钮分布在线上」）；
 现塌缩到标题轨宽（vertical 34px / horizontal 34px），旁边 pane 由 fill/flex 自动补位。 */
  if (props.collapsed) {
    return props.axis === 'vertical'
      ? { width: '34px', minWidth: '34px', maxWidth: '34px' }
      : { height: '34px', minHeight: '34px', maxHeight: '34px' };
  }
  return props.axis === 'vertical'
    ? { width: `${props.size}px`, minWidth: `${props.min}px`, maxWidth: `${props.max}px` }
    : { height: `${props.size}px`, minHeight: `${props.min}px`, maxHeight: `${props.max}px` };
});
</script>

<style scoped>
.resizable-pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex: 0 0 auto;
}
.resizable-pane.axis-vertical { flex-direction: row; }
.resizable-pane.axis-horizontal { flex-direction: column; }
.resizable-pane.collapsed { min-width: 0 !important; min-height: 0 !important; }
.rp-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-height: 30px;
  padding: var(--sp-1) var(--sp-2);
  color: var(--tx1);
  font-size: var(--fs-xs);
  font-weight: 600;
  border-bottom: 1px solid var(--line);
}
/* axis-vertical 竖排标题轨死码退役（ v2 刻意竖排设计随 519/全部 pane spec
 title:'' 消费清零而失活；layoutOcclusionGuard501/⑤ 字面锁同步更新翻负）。
 边界：只退役「竖排轨」——横排 title 头分支与 .rp-title/.rp-toggle 基础档保留
 （horizontal 轴 dormant 路径 + WorkbenchPaneSpec title 契约未来消费，非本范式射程；
 WorkbenchLayout wl-restore-rail 独占还原轨同理豁免，见该文件 ）。 */
.rp-content { flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; }
.rp-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  color: var(--tx2);
  background: transparent;
  cursor: pointer;
}
.rp-toggle:hover,
.rp-toggle:focus-visible { color: var(--ac); outline: 1px solid var(--line); }
</style>
