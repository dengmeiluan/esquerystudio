/**
 * 二百三十批 P0-4：useColFilters 共享 composable（QRT 漏斗下沉 + RT 接入的共用内核）。
 * 锁定：normVal 归一口径；filterVals 去重计数/值内搜索/基数降级（高频优先+hasMore）；
 * 多列 AND 管线；隐藏列暗状态守卫（自动清+连带回调）。
 */
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useColFilters } from '../composables/useColFilters';
import { nextTick } from 'vue';

const ROWS = [
  { id: 1, name: 'banana', level: 'warn' },
  { id: 2, name: 'apple', level: 'info' },
  { id: 3, name: 'banana', level: 'warn' },
  { id: 4, name: 'cherry', level: null },
];

function make(cols?: () => string[], onAutoClear?: () => void) {
  return useColFilters({
    rows: () => ROWS,
    getVal: (row, col) => (row as any)[col],
    labelOf: (v) => v === null || v === undefined ? '∅' : String(v),
    cols,
    onAutoClear,
  });
}

describe('useColFilters（230 批 P0-4）', () => {
  it('filterVals 去重计数（首现序）；normVal 口径', () => {
    const f = make();
    const { vals, hasMore, total } = f.filterVals('level');
    expect(vals.map(e => ({ v: e.v, n: e.n }))).toEqual([
      { v: 'warn', n: 2 },
      { v: 'info', n: 1 },
      { v: null, n: 1 },
    ]);
    expect(hasMore).toBe(false);
    expect(total).toBe(3);
    expect(f.normVal(null)).toBe('');
    expect(f.normVal({ a: 1 })).toBe('{"a":1}');
  });

  it('值内搜索过滤清单（label 口径）', () => {
    const f = make();
    const { vals } = f.filterVals('level', 'wa');
    expect(vals.map(e => e.v)).toEqual(['warn']);
  });

  it('基数降级：无搜索词超限按计数降序取前 N + hasMore；有搜索词过滤后不降', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ v: 'v' + i }));
    const f = useColFilters({
      rows: () => many,
      getVal: (row) => (row as any).v,
      labelOf: (v) => String(v),
    });
    const all = f.filterVals('v');
    expect(all.hasMore).toBe(true);
    expect(all.vals.length).toBe(200);
    expect(all.vals[0].n).toBe(1); // 全异值计数相同，仍稳定截 200
    const narrowed = f.filterVals('v', 'v299');
    expect(narrowed.hasMore).toBe(false);
    expect(narrowed.vals.map(e => e.v)).toEqual(['v299']);
  });

  it('多列 AND 管线；空选集列不过滤', () => {
    const f = make();
    f.toggleFilterVal('name', 'banana');
    expect(f.filterRows(ROWS).map(r => (r as any).id)).toEqual([1, 3]);
    f.toggleFilterVal('level', 'info'); // 与 banana 无交集 → 全滤光
    expect(f.filterRows(ROWS)).toEqual([]);
    f.clearFilter('level');
    expect(f.filterRows(ROWS).length).toBe(2);
    f.clearAllFilters();
    expect(f.activeFilterCount.value).toBe(0);
  });

  it('隐藏列暗状态守卫：cols 收缩自动清该列筛选+连带回调', async () => {
    const cols = ref(['name', 'level']);
    let cleared = 0;
    const f = make(() => cols.value, () => { cleared++; });
    f.toggleFilterVal('level', 'warn');
    expect(f.activeFilterCount.value).toBe(1);
    cols.value = ['name']; // level 被列选隐藏
    await nextTick();
    expect(f.activeFilterCount.value).toBe(0);
    expect(cleared).toBe(1);
  });
});
