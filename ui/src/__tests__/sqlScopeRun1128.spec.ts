import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const mon = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');

/* 1128：选区执行（Kibana DevTools / DataGrip 同习惯）。
 * 编辑器里常常并排留着多条语句，试跑一条不必删掉其余内容。
 * 诚实边界：结果/错误/预览都绑定「实际发出去的那一段」，改到选区外也算输入已变。 */
describe('1128 SQL 选区执行', () => {
  it('编辑器上报选区；有选区时执行按钮改显「执行选段」并说明只剩选段', () => {
    expect(mon).toContain("(e: 'selection', p: { lines: number; chars: number; start: number; end: number } | null): void;");
    expect(mon).toContain('editor.onDidChangeCursorSelection');
    expect(mon).toContain('model.getValueInRange(sel)');
    expect(src).toContain('@selection="selScope = $event"');
    expect(src).toContain("selScope ? '执行选段' : (multiStmt ? '执行当前语句' : '执行')");
    expect(src).toContain('仅执行选中的 ');
  });

  it('请求体按选段构建；整篇快照仍用于过期/错误判定（保守诚实）', () => {
    expect(src).toContain("import { selectionScope, statementsOf, statementScopeAt, replaceScopeText, mapScopedPos, type SqlScope } from '../utils/sqlScope';");
    expect(src).toContain('const picked = currentSelectionScope();');
    expect(src).toContain('const scope = picked ?? (multiStmt.value ? cursorStmt.value : null);');
    expect(src).toContain("const execSnapshot = scope ? scope.text.replace(/;+\\s*$/, '') : sql.value;");
    /* 1386: body 改用 execSql（= execSnapshot 经 FROM 索引名补引号后的结果，无改动时逐字相同）。
       选段执行的意图不变：execSql 完全由 execSnapshot 推导，不含整篇 sql。 */
    expect(src).toContain('const body = buildBody(execSql);');
    expect(src).toContain('const sqlSnapshot = sql.value;');
    expect(src).toContain('const runSql = ref<string | null>(null);');
    expect(src).toContain('runScope.value = scope;');
  });

  it('历史/预览绑定选段及其 FROM；报错行列按选段锚点换算回全文', () => {
    expect(src).toContain("useQueryHistoryStore().push('sql', execSnapshot, indexFromSql(execSnapshot, sqlIndexPool.value) || indexOf()");
    expect(src).toContain("indexFromSql(execSnapshot, sqlIndexPool.value) || indexOf(), undefined, false");
    expect(src).toContain('dslPreviewIdx.value = indexFromSql(text, sqlIndexPool.value) || indexOf();');
    expect(src).toContain('const idx = dslPreviewIdx.value || indexOf();');
    expect(src).toContain('const runErrScope = ref<SqlScope | null>(null);');
    expect(src).toContain('const runErrPos = computed(() => mapScopedPos(runErrPosRaw.value, runErrScope.value));');
    expect(src).toContain('runErrScope.value = scope;');
    expect(src).toContain('data-test="sql-err-scope"');
  });

  it('选段结果下钻不猜整篇：跳过自动 WHERE 改写，降级复制条件', () => {
    expect(src).toContain('if (sc && (sc.start > 0 || sc.end < sql.value.length)) {');
    expect(src).toContain('当前结果来自局部执行（选段/单条语句），不自动改写整篇 SQL');
  });
});
