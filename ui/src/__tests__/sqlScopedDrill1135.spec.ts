import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1135：局部执行（选段/光标语句）的结果下钻与排序，不再一律降级复制。
 * 稿未变 → 只改执行过的那条语句并强制重跑它；稿已改/结构不支持才复制。 */
describe('1135 局部结果下钻/排序原位改写', () => {
  it('强制执行范围：下一次 run 优先吃动作指定的语句，用完即清', () => {
    expect(view).toContain('let forcedRunScope: SqlScope | null = null;');
    expect(view).toContain('const forced = forcedRunScope;');
    expect(view).toContain('forcedRunScope = null;');
    expect(view).toContain('const scope = forced ?? picked ?? (multiStmt.value ? cursorStmt.value : null);');
  });

  it('稿未变才原位改写：只替换该段并更新强制范围', () => {
    expect(view).toContain('function rewriteRunScope(nextText: string, note: string): boolean {');
    expect(view).toContain('if (!sc || sql.value !== runSql.value) return false;');
    expect(view).toContain('sql.value = replaceScopeText(sql.value, sc, nextText);');
    expect(view).toContain('forcedRunScope = { ...sc, text: nextText, end: sc.start + nextText.length };');
  });

  it('下钻与排序都先试当前语句改写，失败才走既有复制降级', () => {
    /* 1439：调用多一个 negate 参数（「排除此值并重查」复用同一路径） */
    expect(view).toContain('const sr = appendSqlFilter(sc.text, field, value, type, negate);');
    expect(view).toContain('已在当前语句${verb}条件 ${sr.predicate}');
    expect(view).toContain('const sr = appendSqlOrder(sc.text, field, dir);');
    expect(view).toContain('已在当前语句按 ${field} ${dir === \'asc\' ? \'升序\' : \'降序\'}排序');
    /* 降级路径仍在（稿已改/结构不支持） */
    expect(view).toContain('当前结果来自局部执行（选段/单条语句），不自动改写整篇 SQL');
  });
});
