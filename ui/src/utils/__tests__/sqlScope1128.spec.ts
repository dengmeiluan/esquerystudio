import { describe, it, expect } from 'vitest';
import { selectionScope, mapScopedPos } from '../sqlScope';

describe('1128 SQL 选区执行范围', () => {
  it('选区保留原文、裁掉首尾空白，并给出全文行列锚', () => {
    const sql = 'SELECT 1;\n  SELECT * FROM idx WHERE a = 1  \n;';
    const from = sql.indexOf('  SELECT *');
    const to = sql.indexOf('1  \n', from) + 1; /* 只选到值 1，含尾空白 */
    const sc = selectionScope(sql, from, to)!;
    expect(sc.text).toBe('SELECT * FROM idx WHERE a = 1');
    expect(sc.line).toBe(2);
    expect(sc.column).toBe(3);
    expect(sql.slice(sc.start, sc.end)).toBe(sc.text);
  });

  it('反向选区按 min/max 归一；越界钳到全文长度', () => {
    const sql = 'abc\ndef';
    expect(selectionScope(sql, 7, 4)!.text).toBe('def');
    expect(selectionScope(sql, -5, 999)!.text).toBe('abc\ndef');
  });

  it('空选区 / 纯空白 / 空全文 → null（整篇执行，既有行为零变化）', () => {
    expect(selectionScope('SELECT 1', 3, 3)).toBeNull();
    expect(selectionScope('SELECT 1', 0, 0)).toBeNull();
    expect(selectionScope('  \n\t ', 0, 5)).toBeNull();
    expect(selectionScope('', 0, 0)).toBeNull();
  });

  it('报错位映射：首行叠加起始列，其余行只叠加行偏移', () => {
    const sql = 'SELECT 1;\n    SELECT * FROM idx';
    const sc = selectionScope(sql, sql.indexOf('SELECT *'), sql.length)!;
    expect(sc.line).toBe(2);
    expect(sc.column).toBe(5);
    expect(mapScopedPos({ line: 1, column: 6 }, sc)).toEqual({ line: 2, column: 10 });
    expect(mapScopedPos({ line: 2, column: 6 }, sc)).toEqual({ line: 3, column: 6 });
    expect(mapScopedPos(null, sc)).toBeNull();
    expect(mapScopedPos({ line: 1, column: 2 }, null)).toEqual({ line: 1, column: 2 });
  });
});
