import { describe, it, expect } from 'vitest';
import { indexFromSql } from '../sqlIndex';

/* 1080：SQL 字段源跟随 FROM——补全/列名纠错/字段体检不再固定吃顶栏选中索引 */
describe('indexFromSql', () => {
  const known = ['research_report', 'logs-2026', 'order.v1'];

  it('双引号/反引号标识符写完即认，SELECT 列名不误当索引', () => {
    expect(indexFromSql('SELECT "title" FROM "research_report" LIMIT 10', known)).toBe('research_report');
    expect(indexFromSql('select `logs-2026` from `logs-2026`', known)).toBe('logs-2026');
  });

  it('裸标识符只认已加载索引，边打字不换源', () => {
    expect(indexFromSql('SELECT * FROM research_report WHERE x = 1', known)).toBe('research_report');
    expect(indexFromSql('SELECT * FROM resea', known)).toBe('');
    expect(indexFromSql('SELECT * FROM unknown_idx', known)).toBe('');
  });

  it('未闭合引号返回空（输入中途不触发 mapping 拉取）', () => {
    expect(indexFromSql('SELECT * FROM "research_repo', known)).toBe('');
  });

  it('通配、逗号多表、无 FROM 不猜（回落顶栏索引）', () => {
    expect(indexFromSql('SELECT * FROM "logs-*"', known)).toBe('');
    expect(indexFromSql('SELECT * FROM research_report, logs-2026', known)).toBe('');
    expect(indexFromSql('SELECT 1', known)).toBe('');
    expect(indexFromSql('', known)).toBe('');
  });

  it('别名/条件/大小写/换行不干扰 FROM 锚定', () => {
    expect(indexFromSql('select *\nfrom "order.v1" as o where o.x = 1', known)).toBe('order.v1');
    expect(indexFromSql('SELECT * FROM "research_report" ORDER BY "publish_time" DESC', known)).toBe('research_report');
  });
});
