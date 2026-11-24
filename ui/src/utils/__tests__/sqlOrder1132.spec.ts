import { describe, it, expect } from 'vitest';
import { appendSqlOrder } from '../sqlFilter';

/* 1132：结果表「按此列排序并重查」的 SQL 改写——只动顶层 ORDER BY，
   没有就插在 LIMIT/FETCH/; 之前；UNION/派生表不猜。 */
describe('1132 SQL 按列排序改写', () => {
  it('无 ORDER BY：插在 LIMIT 之前，保留 LIMIT 与分号', () => {
    expect(appendSqlOrder('SELECT "title" FROM "idx" LIMIT 5', 'title', 'desc'))
      .toEqual({ sql: 'SELECT "title" FROM "idx" ORDER BY "title" DESC LIMIT 5', clause: 'ORDER BY "title" DESC' });
    expect(appendSqlOrder('SELECT "title" FROM "idx";', 'title', 'asc')!.sql)
      .toBe('SELECT "title" FROM "idx" ORDER BY "title" ASC;');
    expect(appendSqlOrder('SELECT "title" FROM "idx"', 'title', 'asc')!.sql)
      .toBe('SELECT "title" FROM "idx" ORDER BY "title" ASC');
  });

  it('已有顶层 ORDER BY：整段替换（多列/大小写/注释都换掉），LIMIT 原样', () => {
    const sql = 'SELECT "title" FROM "idx" ORDER BY "publish_time" ASC, "title" LIMIT 5';
    expect(appendSqlOrder(sql, 'title', 'desc')!.sql)
      .toBe('SELECT "title" FROM "idx" ORDER BY "title" DESC LIMIT 5');
    const withSemi = 'SELECT "title" FROM "idx" order by "a" DESC ;';
    expect(appendSqlOrder(withSemi, 'title', 'asc')!.sql)
      .toBe('SELECT "title" FROM "idx" ORDER BY "title" ASC;');
  });

  it('字符串/注释/子查询里的 ORDER BY 不算顶层', () => {
    const inStr = 'SELECT "title" FROM "idx" WHERE note = \'ORDER BY x\' LIMIT 5';
    expect(appendSqlOrder(inStr, 'title', 'desc')!.sql)
      .toBe('SELECT "title" FROM "idx" WHERE note = \'ORDER BY x\' ORDER BY "title" DESC LIMIT 5');
    const inSub = 'SELECT * FROM (SELECT "t" FROM "idx" ORDER BY "t") LIMIT 5';
    /* 派生表本身拒绝（外层位置不可靠），见下条 */
    expect(appendSqlOrder(inSub, 't', 'desc')).toBeNull();
    const subWhere = 'SELECT "t" FROM "idx" WHERE "id" IN (SELECT "id" FROM "x" ORDER BY "id") LIMIT 5';
    expect(appendSqlOrder(subWhere, 't', 'desc')!.sql)
      .toBe('SELECT "t" FROM "idx" WHERE "id" IN (SELECT "id" FROM "x" ORDER BY "id") ORDER BY "t" DESC LIMIT 5');
  });

  it('GROUP BY/JOIN 允许（ORDER BY 仍在 LIMIT 前合法）；UNION/派生表拒绝', () => {
    const group = 'SELECT "k", COUNT(*) FROM "idx" GROUP BY "k" LIMIT 10';
    expect(appendSqlOrder(group, 'k', 'desc')!.sql)
      .toBe('SELECT "k", COUNT(*) FROM "idx" GROUP BY "k" ORDER BY "k" DESC LIMIT 10');
    expect(appendSqlOrder('SELECT 1 UNION SELECT 2', 'x', 'desc')).toBeNull();
    expect(appendSqlOrder('SELECT * FROM (SELECT 1) t', 'x', 'desc')).toBeNull();
  });

  it('列名/方向/空稿守门；不安全列名拒绝', () => {
    expect(appendSqlOrder('SELECT 1', '', 'desc')).toBeNull();
    expect(appendSqlOrder('SELECT 1', 'a b', 'desc')).toBeNull();
    expect(appendSqlOrder('   ', 'a', 'desc')).toBeNull();
    const q = appendSqlOrder('SELECT 1', 'a"b', 'desc');
    expect(q).toBeNull();
  });
});
