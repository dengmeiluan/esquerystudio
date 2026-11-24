import { ref, type Ref } from 'vue';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

/* 搜索定位（search locate）Monaco 档：外层搜索框驱动编辑器真定位。
 — model.findMatches 取全部命中（文本序）；
 — revealLineInCenter + setPosition + setSelection 滚到对应行列并选中；
 — 大文本/重复命中/空文本/编辑器未挂载（懒渲染）都安全：找不到就静默等待下次跳转。
 与原生 Ctrl+F 互补：本 composable 提供 UI 级「命中计数 + 当前序号 + 上/下导航」。 */

type EditorLike = monaco.editor.IStandaloneCodeEditor | null | undefined;

export interface MonacoLocate {
  /** 搜索词（v-model） */
  kw: Ref<string>;
  /** 命中总数 */
  count: Ref<number>;
  /** 当前命中序号（1-based；0=无命中/未搜索） */
  current: Ref<number>;
  /** 关键词变更后重跑（输入 @input 或 watch 里调） */
  run: () => void;
  next: () => void;
  prev: () => void;
}

export function useMonacoLocate(getEditor: () => EditorLike): MonacoLocate {
  const kw = ref('');
  const count = ref(0);
  const current = ref(0);
  let matches: monaco.editor.FindMatch[] = [];

  function run() {
    const ed = getEditor();
    const model = ed?.getModel?.() ?? null;
    if (!ed || !model || !kw.value) {
      matches = [];
      count.value = 0;
      current.value = 0;
      return;
    }
    try {
      matches = model.findMatches(kw.value, false, false, false, null, false);
    } catch {
      matches = []; // 非法 pattern 等异常按无命中处理，不打断输入
    }
    count.value = matches.length;
    current.value = matches.length ? 1 : 0;
    if (matches.length) jumpTo(1);
  }

  function jumpTo(idx: number) {
    const ed = getEditor();
    const m = matches[idx - 1];
    if (!ed || !m) return;
    ed.revealLineInCenter(m.range.startLineNumber);
    ed.setPosition({ lineNumber: m.range.startLineNumber, column: m.range.startColumn });
    ed.setSelection(m.range);
    ed.focus();
  }

  function step(dir: 1 | -1) {
    if (!matches.length) return;
    const n = matches.length;
    current.value = ((current.value - 1 + dir + n) % n) + 1;
    jumpTo(current.value);
  }

  return { kw, count, current, run, next: () => step(1), prev: () => step(-1) };
}
