/**
 * 五百四十八批 W4：表格检索内核数值双口径归一。
 * 锁定：第一遍原样 includes（229 批契约零变，归一只是「原样不中时的二次尝试」）+
 * 第二遍数值归一（仅两侧都「看起来是数字」才比对：千分位形态 ^-?\d{1,3}(,\d{3})+(\.\d+)?$
 * 或纯数字串，去千分位/去空白后 includes）。
 * 保守负例锁实现边界：普通含逗号文本（"a,b"）与非千分位形态（"12,34"）一律不归一。
 * matches/matchSet 同口径：归一命中也进坐标集（388 批一致性契约同步更新）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGridSearch, normNumStr } from '../composables/useGridSearch';

describe('normNumStr 数值归一纯函数（548 批）', () => {
  it('千分位/纯数字/负数/小数/空白位归一；非数字形态返回 null', () => {
    expect(normNumStr('1,234')).toBe('1234');
    expect(normNumStr('1,234,567')).toBe('1234567');
    expect(normNumStr('-1,234')).toBe('-1234');
    expect(normNumStr('1,234.56')).toBe('1234.56');
    expect(normNumStr('1234')).toBe('1234');
    expect(normNumStr('1234.56')).toBe('1234.56');
    expect(normNumStr(' 1 234 ')).toBe('1234'); // 去空白位
    expect(normNumStr('a,b')).toBeNull();       // 普通文本不归一
    expect(normNumStr('12,34')).toBeNull();     // 非千分位形态（组≠3 位）
    expect(normNumStr('1,23')).toBeNull();
    expect(normNumStr('age 30')).toBeNull();    // 整体非数字形态
  });
});

describe('useGridSearch 数值双口径（548 批）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function search(cells: string[][], kw: string) {
    const gs = useGridSearch({
      rows: () => cells.length,
      cols: () => cells[0].length,
      getText: (ri, ci) => cells[ri][ci] ?? '',
    });
    gs.kw.value = kw;
    await vi.advanceTimersByTimeAsync(160);
    return gs;
  }

  it('千分位显示格搜无逗号词命中（"1,234" ← 1234）', async () => {
    const gs = await search([['其他'], ['1,234']], '1234');
    expect(gs.matches.value).toEqual([{ ri: 1, ci: 0 }]);
  });

  it('反向：无逗号格搜千分位词命中（1234 ← "1,234"）', async () => {
    const gs = await search([['其他'], ['1234']], '1,234');
    expect(gs.matches.value).toEqual([{ ri: 1, ci: 0 }]);
  });

  it('千分位负数与小数双口径', async () => {
    const gs = await search([['-1,234'], ['1,234.56'], ['1234.56']], '-1234');
    expect(gs.matches.value).toEqual([{ ri: 0, ci: 0 }]);
    const gs2 = await search([['1,234.56'], ['x']], '1234.56');
    expect(gs2.matches.value).toEqual([{ ri: 0, ci: 0 }]);
    const gs3 = await search([['1234.56'], ['x']], '1,234.56');
    expect(gs3.matches.value).toEqual([{ ri: 0, ci: 0 }]);
  });

  it('普通含逗号文本不归一：搜 ab 仍不中 "a,b"（保守负例锁）', async () => {
    const gs = await search([['a,b'], ['ab']], 'ab');
    expect(gs.matches.value).toEqual([{ ri: 1, ci: 0 }]);
    // 反向：词含逗号但非数字形态、格不含 → 不中
    const gs2 = await search([['ab']], 'a,b');
    expect(gs2.matches.value).toEqual([]);
  });

  it('非千分位形态 "12,34" 不归一：搜 1234 不中（实现边界锁）', async () => {
    const gs = await search([['12,34']], '1234');
    expect(gs.matches.value).toEqual([]);
  });

  it('原样通道零回归：子串原样命中优先、大小写不敏感照旧', async () => {
    const gs = await search([['1,234'], ['AB,CD']], '234'); // "1,234" 原样含 "234"
    expect(gs.matches.value).toEqual([{ ri: 0, ci: 0 }]);
    const gs2 = await search([['Value 1,234 ']], 'value 1,234'); // 原样整串命中
    expect(gs2.matches.value).toEqual([{ ri: 0, ci: 0 }]);
  });

  it('归一命中同步进 matchSet（matches/matchSet 同口径，388 契约同步更新）', async () => {
    const gs = await search([['1,234']], '1234');
    expect(gs.matchSet.value.has('0:0')).toBe(true);
  });
});
