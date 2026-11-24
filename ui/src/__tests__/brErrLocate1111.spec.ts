import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1111：语法桥页与 SQL 控制台同一套「错误定位到手」——锚点 chip / 函数纠错 /
 上一版标记 / lint 行号跳转。行为由 1109/1110 纯函数覆盖，本件锁接线。 */
const view = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');

describe('1111 语法桥错误定位接线', () => {
  it('锚点解析与行列定位复用同一工具', () => {
    expect(view).toContain("import { parseSqlErrorPos } from '../utils/sqlErrorPos';");
    expect(view).toContain('const brErrPos = computed(() => (sqlResult.value?.err ? parseSqlErrorPos(sqlResult.value.msg) : null));');
    expect(view).toContain('brSqlMonaco.value?.revealPosition?.(p.line, p.column);');
    expect(view).toContain('data-test="br-err-locate"');
  });

  it('未知函数纠错与改稿撤锚（上一版 SQL 标记）', () => {
    expect(view).toContain('suggestFunctionsFor');
    expect(view).toContain('const brResultStale = computed(() => !!sqlResult.value?.err && sql.value !== brResultSql.value);');
    expect(view).toContain('brResultSql.value = sqlSnapshot;');
    expect(view).toContain('data-test="br-fn-fix"');
    expect(view).toContain('data-test="br-err-stale"');
    expect(view).toContain('watch(sql, () => { if (sqlResult.value?.err) syncBrErrMarker(); });');
  });

  it('错误行 Error marker owner 与控制台一致，成功即清', () => {
    expect(view).toContain("'es-sql-runerr', 'error',");
    expect(view).toContain("brSqlMonaco.value?.setLineMarkers?.([], 'es-sql-runerr', 'error');");
  });

  it('静态 lint 行号可点跳转', () => {
    expect(view).toContain('class="br-lint-ln"');
    expect(view).toContain('@click="locateBrLine(f.line)"');
    expect(view).toContain('function locateBrLine(line: number) {');
  });
});
