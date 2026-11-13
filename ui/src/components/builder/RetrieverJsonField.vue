<template>
  <label class="rte-json">
    <span class="rte-json-lb mono">{{ label }}</span>
    <textarea class="inp mono rte-ta" :class="{ bad }" :value="draft.text.value" rows="3" spellcheck="false"
      :placeholder="placeholder" :title="label + '（JSON；清空=移除该键）'"
      @input="onInput(($event.target as HTMLTextAreaElement).value)"></textarea>
  </label>
</template>

<script setup lang="ts">
/* 1047：retriever 结构体键的 JSON 编辑位（pinned.docs/ids、diversify.query_vector、rescorer.rescore）。
   与 ClauseNode 的 percolate/knn 同语言：合法 JSON 即写树、半截/类型不符只标红不写；
   清空 = 移除该键（由父级落 params）。 */
import { useJsonDraft } from '../../composables/useJsonDraft';

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
.rte-ta { width: 100%; min-height: 62px; resize: vertical; line-height: 1.5; font-size: var(--fs-xs); }
.rte-ta.bad { border-color: var(--err); box-shadow: 0 0 0 2px var(--err-soft); }
</style>
