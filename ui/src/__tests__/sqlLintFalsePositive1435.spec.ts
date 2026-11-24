/**
 * 一千四百三十五批：SQL lint 误报普查——合法 SQL 必须零 finding。
 *
 * 与 1433（DSL 侧）同一思路：用户写对的 SQL 若被标红，会改坏正确查询或无视告警。
 * lintSql 有 8 条规则（引号未闭合 / 括号不平衡 / FROM 缺表 / 保留字拼写 /
 * 悬空 AND-OR / text 字段排序 / LIKE 打 text）。
 *
 * 本批用一批生产级合法 SQL（含少见但完全合规的写法）断言零 finding，
 * 再附负控证明规则没哑。
 */
import { describe, it, expect } from 'vitest';
import { lintSql } from '../utils/sqlLint';

const INDICES = ['research_report', 'bond_issuer', 'audit-2026.10'];
const TYPES: Record<string, string> = {
  title: 'text', title_keyword: 'keyword', 'title.keyword': 'keyword',
  status: 'keyword', amount: 'double', publish_time: 'date', issuer_name: 'keyword',
  /* 没有 .keyword 子域的 text 字段：排序/LIKE 都必失败（负控用） */
  content: 'text',
};

const LEGIT: Array<[string, string]> = [
  ['简单 SELECT *', 'SELECT * FROM research_report'],
  ['指定列', 'SELECT title, status FROM research_report'],
  ['带引号表名', 'SELECT title FROM "research_report"'],
  ['带引号列名', 'SELECT "title", "status" FROM research_report'],
  ['WHERE 等值', "SELECT * FROM research_report WHERE status = 'ACTIVE'"],
  ['IN 列表', "SELECT * FROM research_report WHERE status IN ('A', 'B')"],
  ['NOT IN', "SELECT * FROM research_report WHERE status NOT IN ('A')"],
  ['BETWEEN', 'SELECT * FROM research_report WHERE amount BETWEEN 1 AND 100'],
  ['LIKE 打 keyword', "SELECT * FROM research_report WHERE title.keyword LIKE 'abc%'"],
  ['IS NULL', 'SELECT * FROM research_report WHERE issuer_name IS NULL'],
  ['IS NOT NULL', 'SELECT * FROM research_report WHERE issuer_name IS NOT NULL'],
  ['ORDER BY keyword', 'SELECT title FROM research_report ORDER BY status DESC'],
  ['ORDER BY date', 'SELECT title FROM research_report ORDER BY publish_time DESC'],
  ['GROUP BY keyword', 'SELECT status, COUNT(*) FROM research_report GROUP BY status'],
  ['GROUP BY + HAVING', 'SELECT status, COUNT(*) AS c FROM research_report GROUP BY status HAVING COUNT(*) > 1'],
  ['聚合函数', 'SELECT COUNT(*), AVG(amount), MAX(amount), MIN(amount), SUM(amount) FROM research_report'],
  ['函数嵌套', "SELECT YEAR(publish_time), MONTH(publish_time) FROM research_report WHERE status = 'A'"],
  ['CASE WHEN', "SELECT CASE WHEN amount > 100 THEN 'big' ELSE 'small' END AS size FROM research_report"],
  ['别名', 'SELECT title AS t, amount * 2 AS doubled FROM research_report'],
  ['LIMIT', 'SELECT * FROM research_report LIMIT 100'],
  ['LIMIT OFFSET', 'SELECT * FROM research_report LIMIT 100 OFFSET 200'],
  ['DISTINCT', 'SELECT DISTINCT status FROM research_report'],
  ['子查询 IN', 'SELECT * FROM research_report WHERE status IN (SELECT status FROM bond_issuer)'],
  ['JOIN', 'SELECT r.title FROM research_report r JOIN bond_issuer b ON r.issuer_name = b.issuer_name'],
  ['UNION', 'SELECT title FROM research_report UNION ALL SELECT issuer_name FROM bond_issuer'],
  ['含连字符索引名', 'SELECT title FROM "audit-2026.10"'],
  ['多语句分号', 'SELECT 1; SELECT 2'],
  ['注释', 'SELECT title FROM research_report -- 主查询'],
  ['块注释', 'SELECT /* 取标题 */ title FROM research_report'],
  ['字符串含括号', "SELECT * FROM research_report WHERE title = 'a(b)c'"],
  ['字符串含引号转义', "SELECT * FROM research_report WHERE title = 'it''s'"],
  ['字符串含 AND', "SELECT * FROM research_report WHERE title = 'a AND b'"],
  ['多层括号', 'SELECT * FROM research_report WHERE (status = \'A\' AND (amount > 1 OR amount < 0))'],
  ['WHERE 多条件', "SELECT * FROM research_report WHERE status = 'A' AND amount > 100 OR issuer_name = 'x'"],
  ['换行 SQL', 'SELECT title,\n  status\nFROM research_report\nWHERE status = \'A\''],
  ['COUNT DISTINCT', 'SELECT COUNT(DISTINCT status) FROM research_report'],
  ['CAST', "SELECT CAST(amount AS INTEGER) FROM research_report"],
  ['SCORE()', "SELECT SCORE() FROM research_report WHERE MATCH(title, 'x')"],
  ['MATCH', "SELECT * FROM research_report WHERE MATCH(title, 'x')"],
];

describe('1435 lintSql 对合法 SQL 零误报', () => {
  it('生产级合法写法逐条扫描：不得有 finding', () => {
    const bad: string[] = [];
    for (const [label, sql] of LEGIT) {
      const fs = lintSql(sql, INDICES, TYPES);
      if (fs.length) bad.push(`${label} → ${fs.map(f => `L${f.line} ${f.message.slice(0, 46)}`).join('; ')}`);
    }
    expect(bad, '合法 SQL 被误报：\n' + bad.join('\n')).toEqual([]);
  });

  it('负控：确实有问题的 SQL 必须仍被报出（证明零误报不是「规则全哑」）', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['未闭合引号', "SELECT * FROM research_report WHERE title = 'abc", /引号/],
      ['括号不平衡', 'SELECT * FROM research_report WHERE (status = \'A\'', /括号/],
      ['FROM 缺表名', 'SELECT * FROM WHERE x = 1', /FROM/],
      ['保留字拼写', 'SELEC * FROM research_report', /SELECT|拼写/],
      ['悬空 AND', "SELECT * FROM research_report WHERE status = 'A' AND", /AND|OR/],
      ['text 字段排序', 'SELECT content FROM research_report ORDER BY content', /text|排序/],
      ['LIKE 打 text', "SELECT * FROM research_report WHERE content LIKE 'abc%'", /LIKE|text/],
    ];
    const missing: string[] = [];
    for (const [label, sql, re] of cases) {
      const fs = lintSql(sql, INDICES, TYPES);
      if (!fs.some(f => re.test(f.message))) missing.push(`${label} 未报（实际：${fs.map(f => f.message.slice(0, 40)).join(' | ') || '无'}）`);
    }
    expect(missing, '负控失效：\n' + missing.join('\n')).toEqual([]);
  });
});
