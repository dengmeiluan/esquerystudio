import { describe, it, expect } from 'vitest';
import { SCALAR_FUNCS, SQL_FUNC_NAMES, suggestFunctionsFor } from '../sqlCompletion';

/* 1110：SQL 函数面补齐（官方标量/聚合目录）+ 未知函数一键纠错（纯函数）。 */
describe('1110 SQL 函数目录', () => {
  it('数学/字符串/日期/条件/转换各档在册且名称唯一', () => {
    const names = SCALAR_FUNCS.map(f => f.name);
    for (const n of ['CBRT', 'LOG10', 'POWER', 'SQRT', 'TRUNCATE', 'DEGREES',
      'LENGTH', 'CONCAT', 'TRIM', 'REPLACE', 'POSITION', 'UCASE',
      'CURRENT_TIMESTAMP', 'DATE_PARSE', 'QUARTER', 'DAY_NAME', 'ISO_WEEK_OF_YEAR',
      'IFNULL', 'GREATEST', 'NULLIF', 'CONVERT']) {
      expect(names, n).toContain(n);
    }
    expect(new Set(names).size, '函数名不重复').toBe(names.length);
  });

  it('零参函数直接落完整调用（含新补 PI/RANDOM/TODAY）', () => {
    const ins = (n: string) => SCALAR_FUNCS.find(f => f.name === n)?.insert;
    expect(ins('PI')).toBe('PI()');
    expect(ins('RANDOM')).toBe('RANDOM()');
    expect(ins('TODAY')).toBe('TODAY');
    expect(ins('CURRENT_TIMESTAMP')).toBe('CURRENT_TIMESTAMP');
    expect(ins('POWER')).toBeUndefined();
  });

  it('未知函数纠错：ES 主形态 line X:Y + Unknown function', () => {
    const r = suggestFunctionsFor('Found 1 problem\nline 1:8: Unknown function [DATE_TRUNCC]');
    expect(r?.fn).toBe('DATE_TRUNCC');
    expect(r?.suggestions[0]).toEqual({ name: 'DATE_TRUNC', score: 1 });
  });

  it('Scalar function 变体、大小写、编辑距离阈值', () => {
    expect(suggestFunctionsFor('unknown function [lenght]')?.suggestions[0].name).toBe('LENGTH');
    expect(suggestFunctionsFor("Scalar function [LENGHT] doesn't exist")?.fn).toBe('LENGHT');
    /* 距离过远不给候选（宁缺勿错），但仍返回函数名 */
    const far = suggestFunctionsFor('line 2:3: Unknown function [ZZZZZZ]');
    expect(far?.fn).toBe('ZZZZZZ');
    expect(far?.suggestions).toEqual([]);
  });

  it('非函数错误/空输入零增量；候选池含聚合函数', () => {
    expect(suggestFunctionsFor('')).toBeNull();
    expect(suggestFunctionsFor('line 1:8: Unknown column [bond_cod]')).toBeNull();
    expect(SQL_FUNC_NAMES).toContain('PERCENTILE');
    expect(SQL_FUNC_NAMES).toContain('CURRENT_TIMESTAMP');
  });
});
