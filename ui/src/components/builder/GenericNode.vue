<template>
  <div class="gn" :data-nid="node.id">
    <div class="gn-hd">
      <NodeSelectBox :id="node.id" />
      <!-- 拖拽源只在 grip 柄（与 cn/bgn/wnr 同语言）；根 draggable 会劫持参数表的文本选择 -->
      <span class="gn-grip" title="拖拽排序（按住拖动）；Alt+↑/↓ 上移/下移" draggable="true" @dragstart.stop="onDragStart" @dragend="endDrag">⋮⋮</span>
      <span class="gn-op mono" title="未内置富表单的算子，以结构化参数表编辑（零降级）">{{ node.op === '__raw__' ? '自定义查询' : node.op }}</span>
      <span class="gn-tag">结构化</span>
      <span style="flex:1"></span>
      <button aria-label="包成 bool 组" class="btn sm ghost" title="包成 bool 组" @click="$emit('wrap')"><Group :size="12" /></button>
      <button aria-label="删除" class="btn sm ghost danger" title="删除" @click="$emit('remove')"><X :size="12" /></button>
    </div>
    <!-- 【W3b】multi_match/query_string 等的 fields/field 字段键接字段源：
 有 mapping 时字段键行（含 fields 数组逐项）渲染 FieldSelect，无字段源回落裸键值表零降级 -->
    <GenericParams :value="rawObj" path-prefix="" :field-keys="rawFieldKeys" :fields="fields" :types="types"
                   :type-priority="RAW_FIELD_PRIO" @update="patchRaw" />
  </div>
</template>

<script setup lang="ts">
/* W1：通用结构化节点——field===null 的 LeafNode（未知算子/非标准形态/多键 query）。
 权威数据是 node.raw，这里只写回 raw，绝不动其他字段（往返无损）。 */
import { computed } from 'vue';
import { X, Group } from 'lucide-vue-next';
import GenericParams from './GenericParams.vue';
import NodeSelectBox from './NodeSelectBox.vue';
import { DRAG_KEY, fireDrag } from './treeBus';
import type { LeafNode } from '../../utils/queryAst';

/* 【W3b】fields/types 由 NodeRenderer 透传（QueryTreePane/RootExtrasPane 侧早已持有）；
 缺省空 = 无字段源，字段键回落裸输入（既有调用方/旧 spec 零增量） */
const props = withDefaults(defineProps<{
  node: LeafNode;
  fields?: string[];
  types?: Record<string, string>;
}>(), { fields: () => [], types: () => ({}) });
const emit = defineEmits<{ (e: 'update:node', n: LeafNode): void; (e: 'remove'): void; (e: 'wrap'): void }>();

/* 【W3b】raw 顶层字段键：multi_match / query_string 的 fields（数组）/ field（标量）是字段语义键；
 其余 op 的 raw 结构不认识，不猜（空 = 全裸键值表现状） */
const FIELD_RAW_OPS = new Set(['multi_match', 'query_string']);
const rawFieldKeys = computed(() => (FIELD_RAW_OPS.has(props.node.op) ? ['fields', 'field'] : []));
/* 全文检索算子的字段以 text 为主、keyword 次之（typePriority 只重排候选分组，不改候选集） */
const RAW_FIELD_PRIO = ['text', 'keyword'];

const rawObj = computed<Record<string, unknown>>(() =>
  props.node.raw && typeof props.node.raw === 'object' && !Array.isArray(props.node.raw)
    ? props.node.raw as Record<string, unknown> : { value: props.node.raw });
/* 标量/数组 raw 以 {value} 包装喂给 GenericParams；写回时若仍是单键 {value} 则解包还原，保证未编辑/已编辑均无损 */
const wrapped = computed(() =>
  !(props.node.raw && typeof props.node.raw === 'object' && !Array.isArray(props.node.raw)));
function patchRaw(v: Record<string, unknown> | unknown[]) {
  const raw = wrapped.value && !Array.isArray(v) && Object.keys(v).length === 1 && 'value' in v ? v.value : v;
  emit('update:node', { ...props.node, raw });
}
function onDragStart(e: DragEvent) {
  (window as any)[DRAG_KEY] = props.node.id;
  e.dataTransfer?.setData('text/plain', props.node.id);
  fireDrag(true);
}
function endDrag() { delete (window as any)[DRAG_KEY]; fireDrag(false); }
</script>

<style scoped>
.gn { border: 1px dashed var(--line-strong); border-radius: var(--r-s); padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2); background: var(--bg1); }
.gn-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); flex-wrap: wrap; }
.gn-grip { cursor: grab; color: var(--tx2); font-size: var(--fs-xs); user-select: none; transition: color var(--tr); flex-shrink: 0; }
.gn-grip:hover { color: var(--tx1); }
.gn-op { font-size: var(--fs-sm); color: var(--ac-hi); }
.gn-tag { font-size: var(--fs-2xs); padding: 0 var(--sp-1); border-radius: var(--r-xs); background: var(--info-soft); color: var(--info); }
</style>
