/**
 * 五百一十九批：列详情统计内核（useColStats）——RT 236 批 P2-3 首发逻辑泛化、QRT 复用。
 * 锁定：去重/空值口径；数值块 summarize 硬口径（数字字符串不计）与 isNumeric 强制口径
 * （QRT fieldTypes 数值型优先：数字字符串计入）；top5 高频（首现序/超 5 计数降序）。
 */
import { describe, it, expect } from 'vitest';
import { useColStats } from '../composables/useColStats';

const ROWS = [
  { name: 'banana', age: 2, kw: '10' },
  { name: 'apple', age: 4, kw: '20' },
  { name: 'banana', age: null, kw: '' },
];
const base = {
  rows: () => ROWS,
  getVal: (r: any, c: string) => r[c],
  labelOf: (v: any) => (v === null || v === undefined ? '∅' : String(v)),
};

describe('useColStats（五百一十九批）', () => {
  it('去重/空值/数值统计：summarize 硬口径（数字字符串不计入 Σ）', () => {
    const s = useColStats(base).statsOf('age');
    expect(s.distinct).toBe(3);
    expect(s.empty).toBe(1);
    expect(s.numeric).toEqual({ sum: 6, avg: 3, min: 2, max: 4 });
  });

  it('isNumeric 强制口径：数字字符串计入 Σ/avg/min/max（QRT fieldTypes 数值型路径）', () => {
    const s = useColStats({ ...base, isNumeric: () => true }).statsOf('kw');
    expect(s.empty).toBe(1);
    expect(s.numeric).toEqual({ sum: 30, avg: 15, min: 10, max: 20 });
  });

  it('全非数值列 numeric=null；type 缺省空串、fieldType 注入透传', () => {
    const s = useColStats(base).statsOf('name');
    expect(s.numeric).toBeNull();
    expect(s.type).toBe('');
    expect(useColStats({ ...base, fieldType: () => 'keyword' }).statsOf('name').type).toBe('keyword');
  });

  it('top5 高频：≤5 首现序；>5 计数降序取前 5', () => {
    const s = useColStats(base).statsOf('name');
    expect(s.top).toEqual([{ v: 'banana', n: 2 }, { v: 'apple', n: 1 }]);
    const rows2 = ['hot', 'hot', 'hot', 'a', 'b', 'c', 'd', 'e'].map(v => ({ v }));
    const s2 = useColStats({ rows: () => rows2, getVal: (r: any) => r.v, labelOf: (v: any) => String(v) }).statsOf('v');
    expect(s2.top.length).toBe(5);
    expect(s2.top[0]).toEqual({ v: 'hot', n: 3 });
  });
});
