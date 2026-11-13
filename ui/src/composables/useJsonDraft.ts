/* 1018：JSON 文本编辑三件套组合式（draft 文本态 / 非法标红不写树 / 外部变更同比较回流）。
   源语言：RootExtrasPane rx-qp-json 与 knnVec 的既有模式抽身——percolate document
   （ClauseNode）与 more_like_this like 对象项（MltLikeEditor）两消费面共用的编辑语义：
   半截 JSON 只留草稿不写树（树保持上次合法值）；watchSource 变化经 stringify 同比较
   守卫回流文本（不打断输入）；bad 态外部变更强回流。 */
import { ref, watch, type Ref } from 'vue';

export function useJsonDraft(
  watchSource: () => unknown,
  onValid: (v: unknown) => void,
  opts: { allowArray?: boolean } = {},
): { text: Ref<string>; bad: Ref<boolean>; onInput: (raw: string) => void } {
  const text = ref('');
  const bad = ref(false);
  watch(watchSource, v => {
    const next = v === undefined || v === null ? '' : JSON.stringify(v, null, 2);
    let same = false;
    if (!bad.value) {
      try { same = JSON.stringify(JSON.parse(text.value)) === next; } catch { same = false; }
    }
    if (!same) text.value = next;
    bad.value = false;
  }, { immediate: true });
  function onInput(raw: string) {
    text.value = raw;
    try {
      const v = JSON.parse(raw);
      /* 1045：向量值（knn query_vector）合法形态就是数组，allowArray 档放行；
         其余（percolate document / like 对象项）保持只收对象。 */
      const shapeBad = opts.allowArray
        ? (typeof v !== 'object' || v === null)
        : (typeof v !== 'object' || v === null || Array.isArray(v));
      if (shapeBad) { bad.value = true; return; }
      bad.value = false;
      onValid(v);
    } catch { bad.value = true; }   // 半截 JSON：只留草稿不写树
  }
  return { text, bad, onInput };
}
