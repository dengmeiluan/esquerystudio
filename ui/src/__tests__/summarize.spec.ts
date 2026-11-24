/**
 * 二百二十七批：summarize 统一口径。
 * 锁定：数值口径=typeof number 且 Number.isFinite（数字字符串/NaN/Infinity/null/布尔
 * 一律 skipped）；min/max 单趟 reduce（Math.min(...nums) 展开参数在万级数组 RangeError
 * 的回归锁）；全非数值 avg/min/max=null；distinct 归一去重。
 */
import { describe, it, expect } from 'vitest';
import { summarize } from '../utils/summarize';

describe('summarize（227 批）', () => {
  it('空集：全零 + avg/min/max null', () => {
    expect(summarize([])).toEqual({ count: 0, numCount: 0, skipped: 0, distinct: 0, sum: 0, avg: null, min: null, max: null });
  });

  it('全数值：sum/avg/min/max/count 正确', () => {
    expect(summarize([3, 1, 2])).toEqual({ count: 3, numCount: 3, skipped: 0, distinct: 3, sum: 6, avg: 2, min: 1, max: 3 });
  });

  it('混合：数字字符串/NaN/Infinity/null/布尔计入 skipped 不进 sum', () => {
    const s = summarize([1, '2', NaN, Infinity, null, true, 3]);
    expect(s.count).toBe(7);
    expect(s.numCount).toBe(2);
    expect(s.skipped).toBe(5);
    expect(s.sum).toBe(4);
    expect(s.min).toBe(1);
    expect(s.max).toBe(3);
  });

  it('全非数值：sum=0、avg/min/max=null、distinct 仍统计', () => {
    const s = summarize(['a', 'b', 'a']);
    expect(s.numCount).toBe(0);
    expect(s.sum).toBe(0);
    expect(s.avg).toBeNull();
    expect(s.min).toBeNull();
    expect(s.max).toBeNull();
    expect(s.distinct).toBe(2);
  });

  it('十万级大数组 min/max 不炸（Math.min 展开风险回归锁）', () => {
    const big: number[] = [];
    for (let i = 100000; i > 0; i--) big.push(i);
    const s = summarize(big);
    expect(s.numCount).toBe(100000);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100000);
    expect(s.sum).toBe(5000050000);
  });

  it('distinct：对象按 JSON.stringify 归一去重', () => {
    const s = summarize([{ a: 1 }, { a: 1 }, { a: 2 }, 'x']);
    expect(s.distinct).toBe(3);
  });
});
