import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

/* 1134：排序的自然入口在列头——SQL 宿主右键列头也要能改 SQL 重查，
 * 且表头提示必须说清「点击是本地排序、不改 SQL」，避免误以为表头会改查询。 */
describe('1134 列头查询级排序入口与本地/查询语义标注', () => {
  it('SQL 宿主表头提示区分本地排序与改 SQL 重查', () => {
    expect(qrt).toContain('点击本地排序：升序 → 降序 → 取消（不改 SQL）');
    expect(qrt).toContain('右键：列管理 / 按此列升序或降序并重查（改 SQL）');
    /* 非 SQL 表（DSL 命中/普通只读表）保留原提示零变化 */
    expect(qrt).toContain("'点击排序：升序 → 降序 → 取消（回原始序）；Shift+点击：追加/翻转次键；拖列名可重排；右键：列管理'");
  });

  it('列头菜单出查询级升/降序两项，走 sort-by 与本地等序区分', () => {
    expect(qrt).toContain("key: 'sql-sort-asc'");
    expect(qrt).toContain("key: 'sql-sort-desc'");
    expect(qrt).toContain("emit('sort-by', { field: m.col, dir: 'asc' })");
    expect(qrt).toContain("emit('sort-by', { field: m.col, dir: 'desc' })");
    /* 1439：加 condSort 开关——Lucene 宿主不接线 sort-by，不该看到这两项 */
    expect(qrt).toContain('props.useAsCondition && props.condSort && ci >= 0');
  });
});
