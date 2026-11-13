import { describe, it, expect } from 'vitest';
import { SCALAR_FUNCS } from '../sqlCompletion';

/* 1103：SQL 函数补全覆盖时间/分桶/常用标量函数；零参函数直接落完整调用。 */
describe('1103 SQL 函数补全', () => {
  it('时间函数与分桶函数在册', () => {
    const names = SCALAR_FUNCS.map(f => f.name);
    for (const n of ['NOW', 'CURRENT_DATE', 'DATE_ADD', 'DATE_DIFF', 'DATE_PART', 'DAY_OF_WEEK', 'WEEK_OF_YEAR', 'HOUR', 'MINUTE', 'SECOND', 'HISTOGRAM']) {
      expect(names).toContain(n);
    }
  });

  it('零参函数落完整调用（不逼用户补右括号）', () => {
    const now = SCALAR_FUNCS.find(f => f.name === 'NOW')!;
    expect(now.insert).toBe('NOW()');
    const cd = SCALAR_FUNCS.find(f => f.name === 'CURRENT_DATE')!;
    expect(cd.insert).toBe('CURRENT_DATE');
    const dt = SCALAR_FUNCS.find(f => f.name === 'DATE_TRUNC')!;
    expect(dt.insert).toBeUndefined();
  });
});
