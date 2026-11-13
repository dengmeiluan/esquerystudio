<template>
  <!-- Profile 耗时树组件化（DslQueryView:211-214 外壳 + :1312-1328 ProfileNode
 递归 + :2137-2143 pf-* 样式整体迁入，类名全保留——「直方图和 Profile 的组件应该是同一套，
 且位置是同一套」裁决）。IndexHub 完成组件抽取，视图接线随直方图同步量力评估
 （裁决见 .spec / 交接报告）；DQ 侧同位替换下批做，过渡期并存。 -->
  <div class="dq-profile">
    <div class="sec-t dq-sec-hd"><Flame :size="13" /> Profile 耗时树 <button aria-label="关闭 Profile 耗时树" class="btn sm ghost" style="margin-left:auto" @click="emit('close')"><X :size="11" /></button></div>
    <ProfileNode :node="node" :total="total" :depth="0" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, type PropType } from 'vue';
import { Flame, X } from 'lucide-vue-next';

defineProps<{
  /** profile.shards[0].searches[0].query[0] 节点（ES Profile API 树） */
  node: Record<string, unknown>;
  /** 树根 time_in_nanos（占比条分母） */
  total: number;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

/* ProfileNode 递归节点：DQ 内联 defineComponent 逐字迁移（time_in_nanos 占比条+子树深度缩进）。
 DQ 同款唯一偏差：分母 total 加 || 1 钳制——组件化后不再依赖调用方「恒 ≥1」约定防 NaN 占比。 */
const ProfileNode = defineComponent({
  name: 'ProfileNode',
  props: { node: { type: Object as PropType<any>, required: true }, total: { type: Number, required: true }, depth: { type: Number, default: 0 } },
  setup(p) {
    const pct = computed(() => Math.min(100, ((p.node.time_in_nanos || 0) / (p.total || 1)) * 100));
    return () =>
      h('div', { class: 'pf-node' }, [
        h('div', { class: 'pf-row', style: '--d:' + p.depth }, [
          h('span', { class: 'pf-type mono' }, p.node.type),
          h('span', { class: 'pf-desc mono', title: p.node.description }, p.node.description),
          h('span', { class: 'pf-time mono' }, ((p.node.time_in_nanos || 0) / 1e6).toFixed(2) + 'ms'),
          h('div', { class: 'pf-bar' }, [h('i', { style: `width:${pct.value}%` })]),
        ]),
        ...(p.node.children || []).map((c: any) => h(ProfileNode, { node: c, total: p.total, depth: p.depth + 1 })),
      ]);
  },
});
</script>

<style scoped>
/* 样式同步更新自 DslQueryView（pf-* 走 :deep——ProfileNode 是运行时 h() 子树，scoped 属性不落其上，
 DQ 同款；间距 var(--sp-*) 梯；500 限高口径 max(240px, 42vh) 原样） */
.dq-profile { margin-top: var(--sp-2h); max-height: max(240px, 42vh); overflow-y: auto; border-top: 1px solid var(--line); padding-top: var(--sp-2); }
:deep(.pf-node) { margin-left: 0; }
:deep(.pf-row) { display: flex; align-items: center; gap: var(--sp-2h); padding: var(--sp-0) 0 var(--sp-0) calc(var(--d, 0) * 16px); }
:deep(.pf-type) { color: var(--ac-hi); font-size: var(--fs-xs); min-width: 120px; }
:deep(.pf-desc) { flex: 1; font-size: var(--fs-xs); color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.pf-time) { font-size: var(--fs-xs); color: var(--warn); }
:deep(.pf-bar) { width: 120px; height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
:deep(.pf-bar i) { display: block; height: 100%; background: linear-gradient(90deg, var(--ok), var(--warn), var(--err)); }
</style>
