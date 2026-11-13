/**
 * 四百七十三批：useColDrag 行为直测——231 批 P1-6 列拖拽重排核心
 * （事件层刻意薄，纯函数 reorderArr 即可测层）。五契约：
 * before/after 落点/同列 no-op 返回原引用/未知列 no-op/冻结首列占位下限/
 * 拖完抑制列头排序点击窗口。
 */
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { reorderArr, useColDrag } from '../useColDrag';

describe('reorderArr 纯函数（491 批）', () => {
  const cols = ['_idx', 'name', 'age', 'size'];

  it('before/after 落点', () => {
    expect(reorderArr(cols, 'age', 'name', 'before')).toEqual(['_idx', 'age', 'name', 'size']);
    expect(reorderArr(cols, 'age', 'name', 'after')).toEqual(['_idx', 'name', 'age', 'size']);
  });

  it('同列 no-op 返回原引用；未知列 no-op', () => {
    expect(reorderArr(cols, 'name', 'name', 'before')).toBe(cols);
    expect(reorderArr(cols, 'ghost', 'name', 'before')).toBe(cols);
    expect(reorderArr(cols, 'name', 'ghost', 'before')).toBe(cols);
  });

  it('冻结首列下限：minIdx=1 时 from 无法落到 0 号位', () => {
    expect(reorderArr(cols, 'name', '_idx', 'before', 1)).toEqual(['_idx', 'name', 'age', 'size']);
  });
});

describe('useColDrag 交互守卫（491 批）', () => {
  it('冻结首列时拖拽被 preventDefault 拒绝', () => {
    const cols = ref(['_idx', 'name']);
    const drag = useColDrag({ cols, frozenFirst: () => true });
    let prevented = false;
    drag.onDragStart({ preventDefault() { prevented = true; }, dataTransfer: null } as DragEvent, '_idx');
    expect(prevented, '冻结列禁拖').toBe(true);
    expect(drag.dragCol.value).toBe('');
  });

  it('drop 后抑制排序点击（isClickSuppressed 窗口）', () => {
    const cols = ref(['_idx', 'name']);
    const drag = useColDrag({ cols, frozenFirst: () => false });
    drag.onDragStart({ preventDefault() {}, dataTransfer: { setData() {}, effectAllowed: '' } } as unknown as DragEvent, 'name');
    drag.onDrop({ preventDefault() {}, currentTarget: null } as unknown as DragEvent, '_idx');
    expect(drag.isClickSuppressed(), '拖完立即抑制排序 click').toBe(true);
  });
});
