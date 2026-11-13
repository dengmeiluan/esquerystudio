import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const mon = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');

/* 1129：多语句稿按光标所在语句执行（Kibana DevTools / DataGrip 同习惯）。
 * 单语句稿维持整篇——行为零变化；显式选区优先于光标语句。 */
describe('1129 SQL 光标语句执行', () => {
  it('编辑器上报光标偏移；有选区仍以选区优先', () => {
    expect(mon).toContain("(e: 'cursor', offset: number): void;");
    expect(mon).toContain("emit('cursor', model.getOffsetAt(sel.getPosition()));");
    expect(src).toContain('@cursor="cursorPos = $event"');
    expect(src).toContain('const picked = currentSelectionScope();');
    expect(src).toContain('const scope = picked ?? (multiStmt.value ? cursorStmt.value : null);');
    expect(src).toContain('const stmtScopes = computed(() => statementsOf(sql.value));');
    expect(src).toContain('const multiStmt = computed(() => stmtScopes.value.length > 1);');
  });

  it('执行/转 DSL 同源：多语句无选区时只发光标语句；单语句仍走整篇', () => {
    expect(src).toContain("import { selectionScope, statementsOf, statementScopeAt, replaceScopeText, mapScopedPos, type SqlScope } from '../utils/sqlScope';");
    expect(src).toContain("const execSnapshot = scope ? scope.text.replace(/;+\\s*$/, '') : sql.value;");
    expect(src).toContain('const cursorStmt = computed(() => statementScopeAt(sql.value, cursorPos.value));');
  });

  it('按钮在选区/多语句/单语句三态换文案与原因', () => {
    expect(src).toContain("selScope ? '执行选段' : (multiStmt ? '执行当前语句' : '执行')");
    expect(src).toContain('仅执行光标所在语句（第 ');
    expect(src).toContain('选中一段可只跑选段');
  });

  it('结果来源与报错锚点区分「光标语句」和「选段」', () => {
    expect(src).toContain("value: runScope.value.kind === 'statement' ? '语句' : '选段',");
    expect(src).toContain("label: runScope.value.kind === 'statement' ? '仅执行当前语句' : '仅执行片段',");
    expect(src).toContain("runErrScope.kind === 'statement' ? '语句内报错，行号已换算到全文' : '选段内报错，行号已换算到全文'");
  });
});
