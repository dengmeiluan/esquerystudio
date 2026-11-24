import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1109：SQL 执行错误/静态 lint 的「定位到手」接线——
 * ES 报错锚点解析 → Monaco revealPosition（行列钳位）；错误行 Error marker 与
 * 静态 lint owner 分离；lint 行号变可点跳转。行为断言走纯函数，接线断言落源文本。 */
const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const monaco = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');

describe('1109 SQL 错误定位接线', () => {
  it('错误面板给锚点 chip，点击走 locateRunErr', () => {
    expect(view).toContain("import { parseSqlErrorPos } from '../utils/sqlErrorPos';");
    expect(view).toContain('const runErrPosRaw = computed(() => (runErr.value ? parseSqlErrorPos(runErr.value) : null));');
    /* 1128：选区执行的报错位是相对选段的，runErrPos 再按选段锚点换算回全文 */
    expect(view).toContain('const runErrPos = computed(() => mapScopedPos(runErrPosRaw.value, runErrScope.value));');
    expect(view).toContain('data-test="sql-err-locate"');
    expect(view).toContain('@click="locateRunErr"');
    expect(view).toContain('sqlMonaco.value?.revealPosition?.(p.line, p.column);');
  });

  it('执行错误行标红：owner 独立、error 档，重跑清除', () => {
    expect(view).toContain("'es-sql-runerr', 'error',");
    expect(view).toContain('syncRunErrMarker();');
    /* 执行开始即清上一轮错误行（runErr 清空后 sync 输出 []） */
    expect(view).toContain("runErr.value = ''; runErrObj.value = null;\n  runErrSql.value = '';\n  runErrScope.value = null;\n  syncRunErrMarker();");
  });

  it('错误锚点绑定失败时的 SQL 快照：改稿后撤下定位与红线，面板标「上一版」', () => {
    expect(view).toContain('const runErrSql = ref(');
    expect(view).toContain('const runErrStale = computed(() => !!runErr.value && sql.value !== runErrSql.value);');
    expect(view).toContain('runErrSql.value = sqlSnapshot;');
    expect(view).toContain('v-if="runErrPos && !runErrStale"');
    expect(view).toContain('data-test="sql-err-stale"');
    expect(view).toContain('const p = runErrStale.value ? null : runErrPos.value;');
    expect(view).toContain('watch(sql, () => { if (runErr.value) syncRunErrMarker(); });');
  });

  it('静态 lint 行号可点：locateLine 复用 revealPosition', () => {
    expect(view).toContain('class="sq-lint-ln"');
    expect(view).toContain('@click="locateLine(f.line)"');
    expect(view).toContain('function locateLine(line: number) {');
  });

  it('Monaco 暴露 revealPosition 且行列钳位（报错与当前稿不一致也不抛错）', () => {
    expect(monaco).toContain('function revealPosition(line: number, column: number) {');
    expect(monaco).toContain('editor.revealPositionInCenter({ lineNumber: ln, column: col });');
    expect(monaco).toContain('Math.min(Math.trunc(line) || 1, model.getLineCount())');
    expect(monaco).toContain('revealPosition, getEditor: () => editor');
  });

  it('setLineMarkers 默认仍 warning（既有 es-sql-lint 等调用零变化）', () => {
    expect(monaco).toContain("severity: 'warning' | 'error' = 'warning',");
    expect(monaco).toContain('severity === \'error\' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning');
  });
});
