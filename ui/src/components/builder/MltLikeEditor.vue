<template>
  <div class="mlt">
    <!-- 1018：more_like_this 的 like 一等编辑位（对象/数组混合形态）。
     like 对象（文档引用 { _index,_id } / 内联 { doc:{…} }）= JSON 文档编辑区
     （useJsonDraft 三件套）；like 数组 = chips 列表（串项显示文本、对象项显示文档摘要，
     点击选中下方 JSON 编辑区改该位）+ 回车追加文本项。字符串 like 不进本编辑器
     （ClauseNode 既有文本输入覆盖）。AST 零改动：value 直通投影。 -->
    <template v-if="isObj">
      <textarea
        class="inp mono mlt-json" :class="{ bad: jsonEdit.bad.value }" :value="jsonEdit.text.value"
        rows="3" spellcheck="false"
        placeholder="like 文档（JSON 对象：{ _index,_id } 引用或 { doc:{…} } 内联）"
        title="相似源文档；合法 JSON 对象即写回（非法半截态标红不写）"
        @input="jsonEdit.onInput(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </template>
    <template v-else-if="isArr">
      <div class="mlt-chips" role="group" aria-label="like 列表：回车添加文本项，点对象项选中编辑">
        <button v-for="(item, i) in arr" :key="i" type="button"
                class="mlt-chip mono" :class="{ sel: selIdx === i, doc: isDoc(item) }"
                :title="chipTitle(item)" @click="isDoc(item) ? (selIdx = selIdx === i ? null : i) : undefined">
          <span class="mlt-chip-v">{{ chipText(item) }}</span>
          <span class="mlt-chip-x" role="button" :aria-label="'删除第 ' + (i + 1) + ' 项'"
                :title="'删除该项'" @click.stop="delItem(i)">×</span>
        </button>
        <input
          class="inp mono mlt-in" v-model="draft"
          :placeholder="arr.length ? '' : '文本或回车添加；文档对象经 DSL/JSON 粘贴'"
          @keydown.enter.prevent="onEnter($event)"
        />
      </div>
      <!-- 选中对象项的 JSON 编辑区（useJsonDraft 三件套） -->
      <textarea
        v-if="selIdx !== null && isDoc(arr[selIdx])"
        class="inp mono mlt-json mlt-sel" :class="{ bad: selEdit.bad.value }" :value="selEdit.text.value"
        rows="3" spellcheck="false"
        title="编辑选中的文档对象项；合法 JSON 即写回该位"
        @input="selEdit.onInput(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useJsonDraft } from '../../composables/useJsonDraft';

const props = defineProps<{ value: unknown }>();
const emit = defineEmits<{ (e: 'update', v: unknown): void }>();

const isObj = computed(() => !!props.value && typeof props.value === 'object' && !Array.isArray(props.value));
const isArr = computed(() => Array.isArray(props.value));
const arr = computed<unknown[]>(() => (isArr.value ? props.value as unknown[] : []));
const isDoc = (v: unknown) => !!v && typeof v === 'object';

/* 对象形态：整值 JSON 编辑 */
const jsonEdit = useJsonDraft(() => (isObj.value ? props.value : undefined), v => emit('update', v));

/* 数组形态：选中对象项 JSON 编辑（watchSource 绑定选中位；删项/换选自动回流） */
const selIdx = ref<number | null>(null);
const selEdit = useJsonDraft(
  () => (selIdx.value !== null && isArr.value && isDoc(arr.value[selIdx.value]) ? arr.value[selIdx.value] : undefined),
  v => {
    if (selIdx.value === null) return;
    const next = [...arr.value];
    next[selIdx.value] = v;
    emit('update', next);
  },
);

const draft = ref('');
function onEnter(e: KeyboardEvent) {
  if (e.isComposing) return;
  const raw = draft.value.trim();
  draft.value = '';
  if (raw) emit('update', [...arr.value, raw]);
}
function delItem(i: number) {
  const next = arr.value.filter((_, j) => j !== i);
  if (selIdx.value === i) selIdx.value = null;
  else if (selIdx.value !== null && selIdx.value > i) selIdx.value--;
  emit('update', next);
}
function chipText(item: unknown): string {
  if (!isDoc(item)) return String(item);
  const o = item as Record<string, unknown>;
  /* 文档引用摘要 _index/_id 优先，内联 doc 取其键摘要 */
  if (o._id !== undefined) return `${o._index ?? '*'}/${String(o._id)}`;
  if (o.doc !== undefined) return 'doc:' + Object.keys((o.doc as object) || {}).slice(0, 2).join(',');
  return JSON.stringify(item).slice(0, 24);
}
function chipTitle(item: unknown): string {
  return isDoc(item) ? '文档项（点击展开 JSON 编辑）\n' + JSON.stringify(item, null, 2).slice(0, 300) : String(item);
}
</script>

<style scoped>
.mlt { display: flex; flex-direction: column; gap: var(--sp-1); width: 100%; }
.mlt-json { width: 100%; min-height: 60px; font-size: var(--fs-xs); line-height: 1.5; resize: vertical; }
.mlt-json.bad { border-color: var(--err); box-shadow: 0 0 0 2px var(--err-soft); }
.mlt-chips { display: flex; align-items: center; gap: var(--sp-1); flex-wrap: wrap; }
.mlt-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 240px; padding: 2px 4px 2px 8px; background: var(--bg1); border: 1px solid var(--line-strong); border-radius: 999px; font-size: var(--fs-2xs); cursor: pointer; }
.mlt-chip.doc { border-style: dashed; }
.mlt-chip.sel { border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent); }
.mlt-chip-v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mlt-chip-x { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; color: var(--tx2); }
.mlt-chip-x:hover { background: var(--hover); color: var(--tx1); }
.mlt-in { width: 180px; height: 26px; font-size: var(--fs-sm); border: none; background: transparent; }
.mlt-in:focus { outline: none; }
</style>
