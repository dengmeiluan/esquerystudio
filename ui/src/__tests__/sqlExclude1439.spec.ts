/**
 * 1439：SQL 结果的「排除此值」条件生成。
 *
 * 与 ES 侧对齐的关键点：`must_not: term(col, v)` 会保留「该字段缺失」的文档，
 * 而 SQL 里裸 `col <> v` 会把 NULL 行一起滤掉——同一个「排除」在两条通道结果不同。
 * 所以非空值的排除写成 `(col <> v OR col IS NULL)`；空值排除写成 IS NOT NULL。
 */
import { describe, it, expect } from 'vitest';
import { sqlPredicate, appendSqlFilter } from '../utils/sqlFilter';

describe('1439 SQL 排除条件', () => {
  it('正向仍是等值，负向是 <> 且保留 NULL 行', () => {
    expect(sqlPredicate('status', 'A')).toBe(`"status" = 'A'`);
    expect(sqlPredicate('status', 'A', undefined, true)).toBe(`("status" <> 'A' OR "status" IS NULL)`);
  });

  it('空值：正向 IS NULL，负向 IS NOT NULL', () => {
    expect(sqlPredicate('status', null)).toBe('"status" IS NULL');
    expect(sqlPredicate('status', null, undefined, true)).toBe('"status" IS NOT NULL');
  });

  it('数值/布尔类型沿用既有字面量规则（排除分支同样适用）', () => {
    expect(sqlPredicate('n', 3, 'long', true)).toBe('("n" <> 3 OR "n" IS NULL)');
    expect(sqlPredicate('b', 'true', 'boolean', true)).toBe('("b" <> true OR "b" IS NULL)');
  });

  it('非法列名两侧都拒绝', () => {
    expect(sqlPredicate('a; DROP TABLE x', 1, undefined, true)).toBeNull();
    expect(sqlPredicate('COUNT(*)', 1, undefined, true)).toBeNull();
  });

  it('appendSqlFilter 透传 negate：有 WHERE 用 AND、无 WHERE 用 WHERE，尾段保留', () => {
    const a = appendSqlFilter('SELECT * FROM t WHERE a = 1', 'b', 'x', undefined, true)!;
    expect(a.predicate).toBe(`("b" <> 'x' OR "b" IS NULL)`);
    expect(a.sql).toBe(`SELECT * FROM t WHERE a = 1 AND ("b" <> 'x' OR "b" IS NULL)`);

    const b = appendSqlFilter('SELECT * FROM t ORDER BY a LIMIT 10', 'b', null, undefined, true)!;
    expect(b.sql).toBe('SELECT * FROM t WHERE "b" IS NOT NULL ORDER BY a LIMIT 10');
  });

  it('结构不支持时（GROUP BY / 派生表）仍返回 null，不猜', () => {
    expect(appendSqlFilter('SELECT count(*) FROM t GROUP BY a', 'b', 1, undefined, true)).toBeNull();
    expect(appendSqlFilter('SELECT * FROM (SELECT 1) x', 'b', 1, undefined, true)).toBeNull();
  });
});
