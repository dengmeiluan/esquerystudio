import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1130：就地的 SQL 建议/纠错必须跟随「操作者正在看的那一段」。
 * 多语句稿里盲改第一条 SELECT * 或往整篇尾部补 LIMIT，会把另一条语句改坏。 */
describe('1130 SQL 就地建议跟随选区/光标语句', () => {
  it('建议范围=选区优先、其次光标语句；单语句仍整篇', () => {
    expect(src).toContain('const editScope = computed<SqlScope | null>(() => {');
    expect(src).toContain('if (selScope.value) return selectionScope(sql.value, selScope.value.start, selScope.value.end);');
    expect(src).toContain('return multiStmt.value ? cursorStmt.value : null;');
    expect(src).toContain('const advisoryText = computed(() => editScope.value?.text ?? sql.value);');
    expect(src).toContain("sqlCostHints(advisoryText.value || '')");
  });

  it('展开字段 / 补 LIMIT 只改写该段并原位放回', () => {
    /* 1387：列清单改由 utils/sqlStar 产出（容器字段剔除），替换点仍是 advisoryText——
       锚只跟着变量名走，语义「只改当前段」不变。 */
    expect(src).toContain("const next = advisoryText.value.replace(/\\bSELECT\\s+\\*/i, 'SELECT ' + ex.cols);");
    expect(src).toContain("const semi = /;\\s*$/.test(src) ? ';' : '';");
    expect(src).toContain("const next = appendSqlLimit(src.replace(/;\\s*$/, ''), 1000) + semi;");
    expect(src).toContain('sql.value = replaceScopeText(sql.value, editScope.value, next);');
  });

  it('列/索引/函数纠错：改稿后撤下建议；有失败段时只改该段', () => {
    expect(src).toContain('if (!runErr.value || runErrStale.value) return null;');
    expect(src).toContain('(runErr.value && !runErrStale.value ? suggestIndicesFor(runErr.value, store.indices) : null)');
    expect(src).toContain('(runErr.value && !runErrStale.value ? suggestFunctionsFor(runErr.value) : null)');
    expect(src).toContain('function replaceInRunScope(re: RegExp, to: string): boolean {');
    expect(src).toContain("store.notify('warning', `当前${runErrScope.value.kind === 'statement' ? '语句' : '选段'}内未找到列 ${col}`);");
  });

  it('结果窗口自救同样只回填失败段（保留段外原文/尾分号）', () => {
    expect(src).toContain("const semi = sql.value[sc.end - 1] === ';' ? ';' : '';");
    expect(src).toContain('sql.value = replaceScopeText(sql.value, sc, f.sql + semi);');
  });
});
