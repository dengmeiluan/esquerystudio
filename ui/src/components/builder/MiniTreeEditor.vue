<template>
  <div class="mte">
    <!-- 987：post_filter 等顶层查询段的小型树编辑器。root 形态规则与 QueryTreePane
     同式：bool 直渲染 / 单节点渲染+转条件组条 / 永不缺失（删根回 match_all）。
     provide 局部 TREE_BUS（拖拽 move / 停用开关直达本树 owner），与主树互不串扰。 -->
    <BoolGroupNode
      v-if="node.type === 'bool'"
      :key="node.id"
      :node="(node as BoolNode)" :fields="fields" :types="types"
      @update:node="emitU" @remove="onRemove" @wrap="onWrapRoot" @duplicate="onDuplicate"
    />
    <template v-else>
      <div class="mte-single-bar">
        <span class="mte-tx">单条件</span>
        <button class="btn sm" @click="toGroup"><Plus :size="11" /> 加条件（转条件组）</button>
      </div>
      <NodeRenderer
        :node="node" :fields="fields" :types="types"
        @update:node="emitU" @remove="onRemove" @wrap="onWrapRoot" @duplicate="onDuplicate"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { provide } from 'vue';
import { Plus } from 'lucide-vue-next';
import BoolGroupNode from './BoolGroupNode.vue';
import NodeRenderer from './NodeRenderer.vue';
import { TREE_BUS } from './treeBus';
import {
  nid, moveNode, wrapInBool, updateNodeById, cloneNode, insertAfter,
  type QueryNode, type BoolNode, type LeafNode, type Occur,
} from '../../utils/queryAst';

const props = defineProps<{ node: QueryNode; fields: string[]; types: Record<string, string> }>();
const emit = defineEmits<{ (e: 'update:node', n: QueryNode): void }>();

const matchAllLeaf = (): LeafNode =>
  ({ id: nid(), type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null });

const emitU = (n: QueryNode) => {
  if (n.type === 'bool' && !n.children.length) n = matchAllLeaf();   // 空组回 match_all（root 永不缺失）
  emit('update:node', n);
};
function onRemove() { emitU(matchAllLeaf()); }
function onWrapRoot() { emitU(wrapInBool(props.node, props.node.id)); }
function toGroup() {
  const g: BoolNode = {
    id: nid(), type: 'bool',
    children: [{ occur: 'must' as Occur, node: props.node }, { occur: 'must' as Occur, node: matchAllLeaf() }],
    params: {}, arrForm: { must: true },
  };
  emitU(g);
}
/* root 命中（根组/单条件复制）→ 包 bool.must 双份；否则原位后插（QueryTreePane 同式） */
function onDuplicate(id: string) {
  const r = props.node;
  if (r.id === id) {
    const g: BoolNode = {
      id: nid(), type: 'bool',
      children: [{ occur: 'must' as Occur, node: r }, { occur: 'must' as Occur, node: cloneNode(r) }],
      params: {}, arrForm: { must: true },
    };
    emitU(g);
    return;
  }
  emitU(insertAfter(r, id));
}

provide(TREE_BUS, {
  move(dragId, targetBoolId, occur, anchorId) {
    emitU(moveNode(props.node, dragId, targetBoolId, occur, anchorId));
  },
  toggleDisabled(leafId, disabled) {
    emitU(updateNodeById(props.node, leafId, n => (n.type === 'leaf' ? { ...n, disabled } : n)));
  },
  /* 迷你树没有运行时字段区：不提供快捷创建（条件行按钮只在 TREE_BUS 能力存在处出现） */
  defineRuntime() { return false; },
});
</script>

<style scoped>
.mte-single-bar { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-0); }
.mte-tx { font-size: var(--fs-xs); color: var(--tx2); }
</style>
