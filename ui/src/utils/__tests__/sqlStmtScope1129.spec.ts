import { describe, it, expect } from 'vitest';
import { statementsOf, statementScopeAt, replaceScopeText } from '../sqlScope';

describe('1129 SQL 多语句切分与光标语句', () => {
  it('按顶层分号切分，去空白并保留全文行列锚', () => {
    const sql = 'SELECT 1;\n  SELECT * FROM idx  ;\n';
    const ss = statementsOf(sql);
    expect(ss.map(s => s.text)).toEqual(['SELECT 1', 'SELECT * FROM idx']);
    expect(ss[1].line).toBe(2);
    expect(ss[1].column).toBe(3);
    expect(ss.every(s => s.kind === 'statement')).toBe(true);
  });

  it('引号内/注释内的分号不切（双写转义同 SQL 语义）', () => {
    const sql = `SELECT 'a;b', "c;d" FROM idx /* x;y */ WHERE t = 'it''s;ok';\n-- q;r\nSELECT 2`;
    const ss = statementsOf(sql);
    expect(ss.length).toBe(2);
    expect(ss[0].text).toContain("'a;b'");
    expect(ss[0].text).toContain('"c;d"');
    expect(ss[0].text).toContain("'it''s;ok'");
    expect(ss[1].text).toBe('-- q;r\nSELECT 2');
  });

  it('空语句/尾分号不产假语句', () => {
    expect(statementsOf(';;  ;')).toEqual([]);
    expect(statementsOf('SELECT 1;;').map(s => s.text)).toEqual(['SELECT 1']);
    expect(statementsOf('').length).toBe(0);
  });

  it('光标在语句内取该条；在语句间取前一条；首尾边界落最近条', () => {
    const sql = 'SELECT 1;\n\nSELECT 2;';
    const second = sql.indexOf('SELECT 2');
    expect(statementScopeAt(sql, 0)!.text).toBe('SELECT 1');
    expect(statementScopeAt(sql, sql.indexOf('1') + 1)!.text).toBe('SELECT 1');
    expect(statementScopeAt(sql, second + 3)!.text).toBe('SELECT 2');
    /* 分号后的空白/换行区：光标属于上一条 */
    expect(statementScopeAt(sql, sql.indexOf(';') + 2)!.text).toBe('SELECT 1');
    /* 末条之后（含末尾分号后）仍取末条 */
    expect(statementScopeAt(sql, sql.length)!.text).toBe('SELECT 2');
    expect(statementScopeAt('', 0)).toBeNull();
    expect(statementScopeAt('   ', 2)).toBeNull();
  });

  it('越界光标钳到全文长度，不抛错', () => {
    expect(statementScopeAt('SELECT 1; SELECT 2', 999)!.text).toBe('SELECT 2');
    expect(statementScopeAt('SELECT 1; SELECT 2', -9)!.text).toBe('SELECT 1');
  });

  it('局部改写只替换该段，其他语句原文不动', () => {
    const sql = 'SELECT 1;\nSELECT 2;\nSELECT 3';
    const mid = statementsOf(sql)[1];
    expect(replaceScopeText(sql, mid, 'SELECT 20')).toBe('SELECT 1;\nSELECT 20;\nSELECT 3');
    expect(replaceScopeText('SELECT 1', null, 'X')).toBe('X');
  });
});
