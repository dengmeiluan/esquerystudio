<template>
  <label class="rte-json">
    <span class="rte-json-lb mono">{{ label }}</span>
    <!-- JSON 编辑位升档 JsonArea 统一件（Monaco 承担编辑器形态）；
         useJsonDraft 语义保留：合法 JSON 即写树、半截/类型不符只标红不写、清空=移除该键 -->
    <JsonArea class="rte-ta" :class="{ bad }" :model-value="draft.text.value" :rows="3"
      :placeholder="placeholder" :title="label + '（JSON；清空=移除该键）'"
      @update:model-value="onInput" />
  </label>
</template>

<script setup lang="ts">
/* 1047：retriever 结构体键的 JSON 编辑位（pinned.docs/ids、diversify.query_vector、rescorer.rescore）。
   与 ClauseNode 的 percolate/knn 同语言：合法 JSON 即写树、半截/类型不符只标红不写；
   清空 = 移除该键（由父级落 params）。 */
import { useJsonDraft } from '../../composables/useJsonDraft';
import JsonArea from '../JsonArea.vue';

const props = defineProps<{
  label: string;
  value: unknown;
  placeholder?: string;
  allowArray?: boolean;
}>();
const emit = defineEmits<{ (e: 'update', v: unknown): void }>();

const draft = useJsonDraft(() => props.value, v => emit('update', v), { allowArray: !!props.allowArray });
const bad = draft.bad;

function onInput(raw: string) {
  if (!raw.trim()) {
    draft.text.value = '';
    draft.bad.value = false;
    emit('update', undefined);
    return;
  }
  draft.onInput(raw);
}
</script>

<style scoped>
.rte-json { display: flex; flex-direction: column; gap: var(--sp-1); flex: 1 1 240px; min-width: 0; }
.rte-json-lb { font-size: var(--fs-2xs); color: var(--tx2); }
/* JsonArea 统一件（Monaco 高度由 rows 档自管）；非法中间态红边落在 .ja 外壳 */
.rte-ta { width: 100%; }
.rte-ta.bad { border-color: var(--err); box-shadow: 0 0 0 2px var(--err-soft); }
</style>
