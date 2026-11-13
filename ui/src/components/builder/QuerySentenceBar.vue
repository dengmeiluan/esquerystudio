<template>
  <!-- 998：语句阅读层——条件树之上的一行「人话」，点片段定位到对应条件行。
       纯展示，不承接编辑；空查询（无 root）不渲染，避免与空态插画抢位置。 -->
  <div v-if="sentence.query.length" class="qsb" role="note" :aria-label="'查询语句：' + plain">
    <span class="qsb-tag"><AlignLeft :size="10" /> 语句</span>
    <div class="qsb-body">
      <span
        v-for="(p, i) in sentence.query" :key="i"
        class="qsb-p" :class="['k-' + p.kind, { clk: !!p.nodeId }]"
        :title="p.nodeId ? (p.title || p.text) + '（点击定位）' : p.title"
        :role="p.nodeId ? 'button' : undefined" :tabindex="p.nodeId ? 0 : undefined"
        @click="p.nodeId && emit('locate', p.nodeId)"
        @keydown.enter.prevent="p.nodeId && emit('locate', p.nodeId)"
        @keydown.space.prevent="p.nodeId && emit('locate', p.nodeId)"
      >{{ p.text }}</span>
    </div>
    <div v-if="sentence.meta.length" class="qsb-meta">
      <span v-for="(p, i) in sentence.meta" :key="'m' + i" class="qsb-p" :class="'k-' + p.kind" :title="p.title">{{ p.text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/* 998：查询语句摘要条。构建逻辑全在 utils/querySentence（纯函数、可单测），
   本组件只负责排版与点击定位——不持任何编辑态，树变了摘要自然跟着变。 */
import { computed } from 'vue';
import { AlignLeft } from 'lucide-vue-next';
import { buildQuerySentence, sentenceText } from '../../utils/querySentence';
import type { QueryTree } from '../../utils/queryAst';

const props = defineProps<{ tree: QueryTree }>();
const emit = defineEmits<{ (e: 'locate', nodeId: string): void }>();

const sentence = computed(() => buildQuerySentence(props.tree));
const plain = computed(() => sentenceText(sentence.value.query));
</script>

<style scoped>
/* 阅读层：比编辑区更「轻」——半透明底 + 细边，不抢条件行的注意力。
   行内片段按语义着色：字段/值 mono 中性色，且/或/非 用 occur 四色，结构名用品牌色。 */
.qsb {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-1) var(--sp-1h);
  padding: var(--sp-1h) var(--sp-2); margin-bottom: var(--sp-2);
  border: 1px solid var(--line); border-radius: var(--r-m);
  background: linear-gradient(180deg, color-mix(in srgb, var(--ac) 3%, var(--bg1)), var(--bg1));
  font-size: var(--fs-xs); line-height: 1.6;
}
.qsb-tag {
  display: inline-flex; align-items: center; gap: 3px; flex: none;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-wide); color: var(--tx2);
  text-transform: uppercase; user-select: none;
}
.qsb-body { flex: 1 1 120px; min-width: 0; }
.qsb-meta { flex-basis: 100%; font-size: var(--fs-2xs); color: var(--tx2); }
.qsb-p { white-space: pre-wrap; word-break: break-word; }
.qsb-p.clk { cursor: pointer; border-radius: var(--r-xs); transition: background var(--tr), color var(--tr); }
.qsb-p.clk:hover { background: var(--ac-soft); }
/* 字段名：mono、次强调 */
.qsb-p.k-field { font-family: var(--mono, ui-monospace, monospace); color: var(--tx1); }
/* 算子/动词：弱化，让字段与值跳出来 */
.qsb-p.k-op { color: var(--tx2); }
/* 值：主文本 + 极浅底（像一枚数值胶囊，但不喧哗） */
.qsb-p.k-value { font-family: var(--mono, ui-monospace, monospace); color: var(--tx0); background: var(--hl); border-radius: var(--r-xs); padding: 0 3px; }
/* 逻辑连接词：四色对齐 occur 心智 */
.qsb-p.k-and { color: var(--c-must); font-weight: 650; }
.qsb-p.k-or { color: var(--c-should); font-weight: 650; }
.qsb-p.k-not { color: var(--c-exclude); font-weight: 650; }
/* 结构名（bool/嵌套/跨度/聚合…）：品牌色，一眼区分「这是容器不是条件」 */
.qsb-p.k-struct { color: var(--ac); font-weight: 600; }
.qsb-p.k-paren { color: var(--tx2); }
.qsb-p.k-muted { color: var(--tx2); }
</style>
