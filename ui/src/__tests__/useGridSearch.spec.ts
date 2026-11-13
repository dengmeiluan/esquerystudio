/**
 * 二百二十九批 P0-1：useGridSearch 内核 + splitMark 切分。
 * 锁定：匹配矩阵（行主序）、大小写不敏感、150ms 防抖后生效、kw 清空即清态、
 * 游标回绕（useHitNav 语义）、splitMark 命中切段/无命中单段/多命中全切。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useGridSearch, splitMark } from '../composables/useGridSearch';

const TEXT = [
  ['Apple', 'banana'],
  ['grape', 'PineApple'],
];

describe('useGridSearch（229 批 P0-1）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make() {
    return useGridSearch({
      rows: () => TEXT.length,
      cols: () => TEXT[0].length,
      getText: (ri, ci) => TEXT[ri][ci],
    });
  }

  it('防抖后才匹配；大小写不敏感；行主序编号', async () => {
    const s = make();
    s.kw.value = 'apple';
    expect(s.matches.value.length).toBe(0); // 防抖窗口内不生效
    await vi.advanceTimersByTimeAsync(160); // Async 版：watch 回调（微任务）+ 定时器一起推
    expect(s.matches.value).toEqual([{ ri: 0, ci: 0 }, { ri: 1, ci: 1 }]);
    expect(s.matchSet.value.has('0:0')).toBe(true);
  });

  it('kw 清空即清态（防抖后归零）', async () => {
    const s = make();
    s.kw.value = 'apple';
    await vi.advanceTimersByTimeAsync(160);
    expect(s.matches.value.length).toBe(2);
    s.kw.value = '';
    await vi.advanceTimersByTimeAsync(160);
    expect(s.matches.value.length).toBe(0);
    expect(s.matchSet.value.size).toBe(0);
  });

  it('游标回绕：初值归 1 后 next/prev 全链', async () => {
    const s = make();
    s.kw.value = 'apple';
    await vi.advanceTimersByTimeAsync(160);
    /* count 0→2：watch 自动归位 current=1 */
    expect(s.current.value).toBe(1);
    s.next();
    expect(s.current.value).toBe(2);
    s.next();
    expect(s.current.value).toBe(1); // 到尾回绕
    s.prev();
    expect(s.current.value).toBe(2); // 到头回绕
  });

  it('kw 纯空白视同无搜索', async () => {
    const s = make();
    s.kw.value = '   ';
    await vi.advanceTimersByTimeAsync(160);
    expect(s.matches.value.length).toBe(0);
  });
});

describe('splitMark（229 批 P0-1）', () => {
  it('无查询词返回单段原文', () => {
    expect(splitMark('abc', '')).toEqual([{ t: 'abc', m: false }]);
    expect(splitMark('abc', '  ')).toEqual([{ t: 'abc', m: false }]);
  });

  it('大小写不敏感匹配、命中文本保留原样大小写；多处命中全切', () => {
    expect(splitMark('aBcAbc', 'abc')).toEqual([
      { t: 'aBc', m: true },
      { t: 'Abc', m: true },
    ]);
  });

  it('查询词不在文本中返回单段原文', () => {
    expect(splitMark('abc', 'zz')).toEqual([{ t: 'abc', m: false }]);
  });
});
