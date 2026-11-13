import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1132：结果区「按此列升序/降序并重查（改 SQL）」——与表头本地排序区分；
 * 只在 SQL 宿主（useAsCondition 档）出现，UNION/派生表降级复制。 */
describe('1132 SQL 结果按列排序并重查', () => {
  it('QRT 单元格菜单出改 SQL 的升/降序两项，且受 SQL 宿主门控', () => {
    expect(qrt).toContain("(e: 'sort-by', p: { field: string; dir: 'asc' | 'desc' }): void;");
    /* 1439：文案随 condTarget（缺省 'SQL'），且加 condSort 开关 */
    expect(qrt).toContain('label: `按此列升序并重查（改 ${props.condTarget}）`');
    expect(qrt).toContain('label: `按此列降序并重查（改 ${props.condTarget}）`');
    expect(qrt).toContain("emit('sort-by', { field: col, dir: 'asc' })");
    expect(qrt).toContain("emit('sort-by', { field: col, dir: 'desc' })");
    expect(qrt).toContain("condTarget: 'SQL'");
    expect(qrt).toContain('props.useAsCondition && props.condSort');
  });

  it('SQL 控制台接线：改写顶层 ORDER BY 并自动重跑', () => {
    expect(view).toContain("import { appendSqlFilter, appendSqlOrder, sqlPredicate } from '../utils/sqlFilter';");
    expect(view).toContain('@sort-by="sortByColumn"');
    expect(view).toContain('async function sortByColumn({ field, dir }');
    expect(view).toContain('const r = appendSqlOrder(sql.value, field, dir);');
    expect(view).toContain('sql.value = r.sql;');
    expect(view).toContain('void doRun();');
  });

  it('局部执行/不可改写结构不盲改整篇，降级复制排序子句', () => {
    expect(view).toContain('当前结果来自局部执行（选段/单条语句），不自动改写整篇 SQL');
    expect(view).toContain('当前 SQL 结构不支持自动改写排序（UNION/派生表或列名不安全）');
  });
});
