/* 1050：SQL 高开销查询提示（只提示真实结构风险；LIMIT 只控制返回量不宣称降扫描）。 */
import { describe, it, expect } from 'vitest';
import { sqlCostHints, appendSqlLimit } from '../sqlCost';

describe('1050 SQL 成本提示', () => {
  it('GROUP BY 无 WHERE → warn；有 WHERE 消失', () => {
    const h = sqlCostHints('SELECT industry, COUNT(*) FROM "i" GROUP BY industry');
    expect(h.some(x => x.id === 'group-no-where' && x.severity === 'warn')).toBe(true);
    expect(sqlCostHints('SELECT industry, COUNT(*) FROM "i" WHERE publish_time > \'2026-01-01\' GROUP BY industry')
      .some(x => x.id === 'group-no-where')).toBe(false);
  });

  it('SELECT * / ORDER BY 无 LIMIT → hint，附 limit 修复动作', () => {
    const h = sqlCostHints('SELECT * FROM "i"');
    expect(h.some(x => x.id === 'select-star-no-limit' && x.fix === 'limit')).toBe(true);
    const o = sqlCostHints('SELECT title FROM "i" ORDER BY publish_time DESC');
    expect(o.some(x => x.id === 'order-no-limit' && x.fix === 'limit')).toBe(true);
  });

  it('前置 % LIKE → warn；LIMIT 超 10000 → warn', () => {
    expect(sqlCostHints("SELECT * FROM \"i\" WHERE title LIKE '%债' LIMIT 10").some(x => x.id === 'leading-wildcard')).toBe(true);
    expect(sqlCostHints("SELECT * FROM \"i\" LIMIT 50000").some(x => x.id === 'huge-limit')).toBe(true);
  });

  it('最多 2 条且 warn 优先；空 SQL 零提示', () => {
    const h = sqlCostHints("SELECT * FROM \"i\" WHERE title LIKE '%x' ORDER BY ts");
    expect(h.length).toBeLessThanOrEqual(2);
    expect(h[0].severity).toBe('warn');
    expect(sqlCostHints('   ')).toEqual([]);
  });

  it('补 LIMIT：无则追加，已有/空串/分号处理正确', () => {
    expect(appendSqlLimit('SELECT * FROM "i"')).toBe('SELECT * FROM "i" LIMIT 1000');
    expect(appendSqlLimit('SELECT * FROM "i";')).toBe('SELECT * FROM "i" LIMIT 1000');
    expect(appendSqlLimit('SELECT * FROM "i" LIMIT 10')).toBe('SELECT * FROM "i" LIMIT 10');
    expect(appendSqlLimit('')).toBe('');
  });
});
