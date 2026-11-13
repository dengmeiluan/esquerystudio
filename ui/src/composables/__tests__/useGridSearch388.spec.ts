/**
 * 三百八十八批：useGridSearch 行为级单测——229 批下沉的表格查找内核（QRT 宿主），
 * 此前只有视图级源码锁。五契约：防抖后生效（kw 即时 deferred 延迟）/空词即清/
 * 行主序扫描匹配（大小写不敏感）/matchSet 坐标键集/splitMark 切段（含无命中单段与
 * 多命中切分，纯函数无 v-html 注入面）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { useGridSearch, splitMark } from '../useGridSearch';

const grid = ['alpha beta', 'gamma', 'ALPHA x'];

function make(debounceMs = 10) {
  return useGridSearch({
    rows: () => grid.length,
    cols: () => 2,
    getText: (ri, ci) => grid[ri].split(' ')[ci] ?? '',
    debounceMs,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useGridSearch 行为契约（388 批）', () => {
  it('防抖生效：kw 即时变、deferred 延迟收敛；空词清态', async () => {
    vi.useFakeTimers();
    const gs = make();
    gs.kw.value = 'alpha';
    expect(gs.deferred.value, '防抖窗内 deferred 未更新').toBe('');
    await vi.advanceTimersByTimeAsync(50);
    await nextTick();
    expect(gs.deferred.value).toBe('alpha');
    gs.kw.value = '';
    await vi.advanceTimersByTimeAsync(50);
    await nextTick();
    expect(gs.deferred.value, '空词即清').toBe('');
  });

  it('匹配扫描：行主序坐标、大小写不敏感、matches/matchSet 一致', async () => {
    vi.useFakeTimers();
    const gs = make();
    gs.kw.value = 'alpha';
    await vi.advanceTimersByTimeAsync(50);
    await nextTick();
    expect(gs.matches.value).toEqual([{ ri: 0, ci: 0 }, { ri: 2, ci: 0 }]);
    expect([...gs.matchSet.value]).toEqual(['0:0', '2:0']);
    // 游标契约：current 从 1 起（useHitNav 1-based）
    expect(gs.current.value).toBe(1);
    gs.next();
    expect(gs.current.value, 'next 后到第 2 个').toBe(2);
    gs.next();
    expect(gs.current.value, '到尾回绕到 1').toBe(1);
  });

  it('splitMark：多命中切分+大小写不敏感+无命中/空词单段', () => {
    expect(splitMark('aXbXc', 'x')).toEqual([
      { t: 'a', m: false }, { t: 'X', m: true }, { t: 'b', m: false }, { t: 'X', m: true }, { t: 'c', m: false },
    ]);
    expect(splitMark('abc', 'zz')).toEqual([{ t: 'abc', m: false }]);
    expect(splitMark('abc', '')).toEqual([{ t: 'abc', m: false }]);
  });
});
