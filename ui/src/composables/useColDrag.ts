import { ref, type Ref } from 'vue';

/* P1-6：列拖拽重排（dbx 列头拖拽对位，RT/QRT 共用）。
 事件层刻意薄（happy-dom 无 DragEvent，纯函数才是可测层）；重排落点指示与
 「拖完误触列头排序点击」的抑制（300ms 双保险）都在此收口。
 持久化不在此处——调用方把 cols ref 绑到 useTablePrefs.visibleCols，
 赋值后既有 watch 自动落盘 es_cols:<dim>（与「此列置首」同管道，不开新 key）。 */

/** 纯函数：把 from 搬到 to 的 before/after；同列 no-op 返回原数组；
 * minIdx=新位置下限（冻结首列占死 0 号位时传 1）。 */
export function reorderArr(arr: string[], from: string, to: string, place: 'before' | 'after', minIdx = 0): string[] {
  if (from === to) return arr;
  const fi = arr.indexOf(from), ti = arr.indexOf(to);
  if (fi < 0 || ti < 0) return arr;
  const rest = arr.filter(c => c !== from);
  let idx = rest.indexOf(to) + (place === 'after' ? 1 : 0);
  idx = Math.max(minIdx, Math.min(idx, rest.length));
  const out = [...rest];
  out.splice(idx, 0, from);
  return out;
}

export function useColDrag(opts: {
  /** 可见列（读写——drop 时赋值触发持久化） */
  cols: Ref<string[]>;
  /** 冻结首列占死 0 号位：目标位钳 ≥1；冻结列本身禁拖 */
  frozenFirst: () => boolean;
  /** 拖完抑制列头 click 的窗口（ms；dbx 教训：拖完立刻触发排序 click） */
  suppressClickMs?: number;
}) {
  const dragCol = ref('');
  const overCol = ref('');
  const overPlace = ref<'before' | 'after'>('before');
  const dragging = ref(false);
  let suppressUntil = 0;
  function isClickSuppressed(): boolean { return Date.now() < suppressUntil; }

  function onDragStart(e: DragEvent, col: string) {
    /* 冻结列禁拖（title 提示「先取消冻结」语义在 aria/title 层） */
    if (opts.frozenFirst() && opts.cols.value[0] === col) { e.preventDefault(); return; }
    dragCol.value = col;
    dragging.value = true;
    e.dataTransfer?.setData('text/plain', col);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: DragEvent, col: string) {
    if (!dragCol.value || col === dragCol.value) return;
    e.preventDefault();
    overCol.value = col;
    const r = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    overPlace.value = r && e.clientX < r.left + r.width / 2 ? 'before' : 'after';
  }
  function onDrop(e: DragEvent, col: string) {
    e.preventDefault();
    const next = reorderArr(opts.cols.value, dragCol.value, col, overPlace.value, opts.frozenFirst() ? 1 : 0);
    if (next !== opts.cols.value) opts.cols.value = next;
    suppressUntil = Date.now() + (opts.suppressClickMs ?? 300);
    clearDrag();
  }
  function onDragEnd() { clearDrag(); }
  function clearDrag() { dragCol.value = ''; overCol.value = ''; overPlace.value = 'before'; dragging.value = false; }

  return { dragCol, overCol, overPlace, dragging, onDragStart, onDragOver, onDrop, onDragEnd, isClickSuppressed };
}
