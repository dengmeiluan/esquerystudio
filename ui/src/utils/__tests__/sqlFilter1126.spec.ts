import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendSqlFilter, sqlLiteral, sqlPredicate } from '../sqlFilter';

/* 1126：SQL 结果值下钻的安全改写——字符串转义、顶层尾子句保留、复杂结构拒绝。 */
const qrt = readFileSync(join(__dirname, '../../components/QueryResultTable.vue'), 'utf-8');
const view = readFileSync(join(__dirname, '../../views/SqlConsoleView.vue'), 'utf-8');

describe('1126 SQL 结果值 → 条件', () => {
  it('字面量转义与类型', () => {
    expect(sqlLiteral("O'Reilly")).toBe("'O''Reilly'");
    expect(sqlLiteral(42)).toBe('42');
    expect(sqlLiteral('42', 'long')).toBe('42');
    expect(sqlLiteral('42', 'keyword')).toBe("'42'");
    expect(sqlLiteral(true)).toBe('true');
    expect(sqlLiteral(null)).toBe('NULL');
  });

  it('列名校验与 NULL 语义', () => {
    expect(sqlPredicate('title', 'x')).toBe(`"title" = 'x'`);
    expect(sqlPredicate('a.b', 1)).toBe('"a.b" = 1');
    expect(sqlPredicate('bad-col', 'x')).toBeNull();
    expect(sqlPredicate('title', null)).toBe('"title" IS NULL');
  });

  it('无 WHERE 插入、有 WHERE 追加；ORDER BY/LIMIT/分号保留', () => {
    expect(appendSqlFilter('SELECT "title" FROM "t" LIMIT 10', 'title', 'x'))
      .toEqual({ sql: `SELECT "title" FROM "t" WHERE "title" = 'x' LIMIT 10`, predicate: `"title" = 'x'` });
    expect(appendSqlFilter('SELECT * FROM t WHERE a = 1 ORDER BY b', 'b', 2))
      .toEqual({ sql: `SELECT * FROM t WHERE a = 1 AND "b" = 2 ORDER BY b`, predicate: '"b" = 2' });
    expect(appendSqlFilter('SELECT * FROM t;', 'a', 'x')?.sql).toBe(`SELECT * FROM t WHERE "a" = 'x' ;`);
  });

  it('字符串里的 LIMIT/ORDER 不误当尾部；括号内 ORDER BY 不干扰', () => {
    const r1 = appendSqlFilter(`SELECT * FROM t WHERE note = 'LIMIT 5'`, 'a', 'x');
    expect(r1?.sql).toBe(`SELECT * FROM t WHERE note = 'LIMIT 5' AND "a" = 'x'`);
    const r2 = appendSqlFilter('SELECT (SELECT 1 ORDER BY x) FROM t', 'a', 'x');
    expect(r2?.sql).toBe(`SELECT (SELECT 1 ORDER BY x) FROM t WHERE "a" = 'x'`);
  });

  it('复杂结构拒绝（GROUP BY/JOIN/UNION/派生表）', () => {
    for (const sql of [
      'SELECT a, COUNT(*) FROM t GROUP BY a',
      'SELECT * FROM a JOIN b ON a.id = b.id',
      'SELECT * FROM a UNION SELECT * FROM b',
      'SELECT * FROM (SELECT * FROM t) x',
    ]) {
      expect(appendSqlFilter(sql, 'a', 1), sql).toBeNull();
    }
  });

  it('接线：QRT 菜单只 emit 意图；SQL 控制台改写并重查、失败降级复制', () => {
    /* 1439：payload 增 not?: boolean（排除分支），正向用例仍是同一条通道 */
    expect(qrt).toContain("(e: 'use-as-condition', p: { field: string; value: unknown; type?: string; not?: boolean }): void;");
    /* 1439：文案随 condTarget（缺省 'SQL'，SQL 宿主看到的仍是「改 SQL」） */
    expect(qrt).toContain('label: `加入查询条件并重查（改 ${props.condTarget}）`');
    expect(qrt).toContain('label: `排除此值并重查（改 ${props.condTarget}）`');
    expect(qrt).toContain("condTarget: 'SQL'");
    expect(view).toContain('use-as-condition');
    expect(view).toContain('const r = appendSqlFilter(sql.value, field, value, type, negate);');
    expect(view).toContain('void doRun();');
    expect(view).toContain('条件已复制：');
  });
});
