import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixSqlResultWindow } from '../sqlWindowFix';

/* 1121：SQL LIMIT/OFFSET 超结果窗口（from+size ≤ 10000）——去掉 OFFSET 或压低 LIMIT，
 让语句先能跑，深翻页交给 cursor。纯函数 + 页面接线。 */
const view = readFileSync(join(__dirname, '../../views/SqlConsoleView.vue'), 'utf-8');

describe('1121 SQL 结果窗口自救', () => {
  it('有 OFFSET：删除 OFFSET、保留 LIMIT，reason=offset', () => {
    const r = fixSqlResultWindow('SELECT "title" FROM "research_report" LIMIT 10 OFFSET 20000');
    expect(r?.reason).toBe('offset');
    expect(r?.sql).toBe('SELECT "title" FROM "research_report" LIMIT 10');
    expect(r?.note).toContain('cursor');
  });

  it('大小写/换行/ofset 与 LIMIT 超窗同时存在', () => {
    const r1 = fixSqlResultWindow('select *\nfrom i\nlimit 20 offset 10001');
    expect(r1?.sql).toBe('select *\nfrom i\nlimit 20');
    const r2 = fixSqlResultWindow('SELECT * FROM i LIMIT 20000 OFFSET 5');
    expect(r2?.sql).toBe('SELECT * FROM i LIMIT 10000');
  });

  it('无 OFFSET 且 LIMIT 超窗：压到 10000，reason=limit', () => {
    const r = fixSqlResultWindow('SELECT * FROM i LIMIT 20000');
    expect(r?.reason).toBe('limit');
    expect(r?.sql).toBe('SELECT * FROM i LIMIT 10000');
    expect(r?.note).toContain('cursor');
  });

  it('窗口内/无 LIMIT/空输入零改写', () => {
    expect(fixSqlResultWindow('SELECT * FROM i LIMIT 500')).toBeNull();
    expect(fixSqlResultWindow('SELECT * FROM i')).toBeNull();
    expect(fixSqlResultWindow('')).toBeNull();
  });

  it('页面接线：只对失败那一版 SQL 生效，点击改写并重跑', () => {
    expect(view).toContain("import { fixSqlResultWindow } from '../utils/sqlWindowFix';");
    expect(view).toContain('if (!runErr.value || runErrStale.value) return null;');
    expect(view).toContain('/Result window is too large|from \\+ size must be less than or equal to|max_result_window/i');
    expect(view).toContain('fixSqlResultWindow(runErrSql.value || sql.value)');
    expect(view).toContain('data-test="sql-window-fix"');
    expect(view).toContain('sql.value = f.sql;');
    expect(view).toContain('void doRun();');
  });
});
