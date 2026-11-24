/**
 * 二百三十一批 P1-6：reorderArr 纯函数 + useColDrag 事件流。
 * 锁定：前插/后插/同列 no-op/未知列 no-op/冻结钳位（minIdx=1）；dragstart 冻结列禁拖；
 * dragover 方向判定（clientX 中点）；drop 应用重排+click 抑制窗口。
 */
import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { reorderArr, useColDrag } from '../composables/useColDrag';

describe('reorderArr 纯函数（231 批 P1-6）', () => {
  const base = ['a', 'b', 'c', 'd'];

  it('后插：a 拖到 c 后', () => {
    expect(reorderArr(base, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('前插：d 拖到 b 前', () => {
    expect(reorderArr(base, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('同列 no-op；未知列 no-op', () => {
    expect(reorderArr(base, 'a', 'a', 'before')).toBe(base);
    expect(reorderArr(base, 'x', 'b', 'before')).toBe(base);
    expect(reorderArr(base, 'a', 'x', 'before')).toBe(base);
  });
  it('冻结钳位：minIdx=1 时前插到首位被钳到 1', () => {
    expect(reorderArr(['k', 'a', 'b', 'c'], 'b', 'a', 'before', 1)).toEqual(['k', 'b', 'a', 'c']);
  });
});

describe('useColDrag 事件流（231 批 P1-6）', () => {
  function make(cols: string[], frozen = false) {
    const colsRef = ref(cols);
    const d = useColDrag({ cols: colsRef, frozenFirst: () => frozen });
    const dragEvt = (col: string) => ({ preventDefault: vi.fn(), dataTransfer: { setData: vi.fn(), effectAllowed: '' } }) as unknown as DragEvent;
    const overEvt = (col: string, clientX: number, rect: { left: number; width: number }) => ({
      preventDefault: vi.fn(), clientX,
      currentTarget: { getBoundingClientRect: () => rect },
    }) as unknown as DragEvent;
    const dropEvt = () => ({ preventDefault: vi.fn() }) as unknown as DragEvent;
    return { colsRef, d, dragEvt, overEvt, dropEvt };
  }

  it('dragover 中点判向；drop 应用重排；drop 后 click 被抑制', () => {
    const { colsRef, d, dragEvt, overEvt, dropEvt } = make(['a', 'b', 'c']);
    d.onDragStart(dragEvt('a'), 'a');
    expect(d.dragging.value).toBe(true);
    /* b 列右半边 → after */
    d.onDragOver(overEvt('b', 999, { left: 0, width: 100 }), 'b');
    expect(d.overPlace.value).toBe('after');
    d.onDrop(dropEvt(), 'b');
    expect(colsRef.value).toEqual(['b', 'a', 'c']);
    expect(d.isClickSuppressed()).toBe(true);
    expect(d.dragging.value).toBe(false);
  });

  it('冻结列 dragstart 被禁（preventDefault+不入拖拽态）', () => {
    const { colsRef, d, dragEvt } = make(['k', 'a', 'b'], true);
    d.onDragStart(dragEvt('k'), 'k');
    expect(d.dragging.value).toBe(false);
    expect(d.dragCol.value).toBe('');
    expect(colsRef.value).toEqual(['k', 'a', 'b']);
  });
});
