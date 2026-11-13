<template>
  <BoolGroupNode
    v-if="node.type === 'bool'" :node="(node as BoolNode)" :fields="fields" :types="types"
    :can-dissolve="inBool"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')"
    @wrap="emit('wrap')" @dissolve="emit('dissolve')" @duplicate="(id: string) => emit('duplicate', id)"
  />
  <WrapNodeRow
    v-else-if="node.type === 'wrap'" :node="(node as WrapNode)" :fields="fields" :types="types"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')" @wrap="emit('wrap')"
    @duplicate="(id: string) => emit('duplicate', id)"
  />
  <MultiNodeRow
    v-else-if="node.type === 'multi'" :node="(node as MultiNode)" :fields="fields" :types="types"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')" @wrap="emit('wrap')"
    @duplicate="(id: string) => emit('duplicate', id)"
  />
  <!-- raw 权威（解析降级的非标准形态）→ 通用结构化节点；富形态（含 fields/named/none
   多字段/具名字段/无字段算子与 match_all）→ 富表单条件行 -->
  <GenericNode
    v-else-if="(node as LeafNode).raw !== null" :node="(node as LeafNode)"
    :fields="fields" :types="types"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')" @wrap="emit('wrap')"
    @duplicate="(id: string) => emit('duplicate', id)"
  />
  <ClauseNode
    v-else :node="(node as LeafNode)" :fields="fields" :types="types"
    @update:node="n => emit('update:node', n)" @remove="emit('remove')" @wrap="emit('wrap')"
    @duplicate="(id: string) => emit('duplicate', id)"
  />
</template>

<script setup lang="ts">
/* W1：节点分派器——bool→组容器；wrap→包装行；multi→多子查询容器；raw 权威叶子→通用
 结构化节点；其余富形态叶子→富表单条件行。
 inBool 标记父级是否 bool（决定子 bool 是否给「解散」入口）。 */
import BoolGroupNode from './BoolGroupNode.vue';
import WrapNodeRow from './WrapNodeRow.vue';
import MultiNodeRow from './MultiNodeRow.vue';
import GenericNode from './GenericNode.vue';
import ClauseNode from './ClauseNode.vue';
import type { QueryNode, BoolNode, WrapNode, MultiNode, LeafNode } from '../../utils/queryAst';

defineProps<{ node: QueryNode; fields: string[]; types: Record<string, string>; inBool?: boolean }>();
const emit = defineEmits<{
  (e: 'update:node', n: QueryNode): void;
  (e: 'remove'): void; (e: 'wrap'): void; (e: 'dissolve'): void;
  /* 1045：复制事件此前在此中断（ClauseNode 发、NodeRenderer 不声明不转发 →
     布尔组内「复制条件」点了没反应）。 */
  (e: 'duplicate', id: string): void;
}>();
</script>
