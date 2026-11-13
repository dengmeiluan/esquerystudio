/* 1070：SQL 位置参数（? + params 数组）前端契约。
   用户心智：条件值随查询变化时用占位符，按顺序填数组即可，不该手改 SQL 字面量；
   占位符计数必须忽略字符串/注释里的 ?（LIKE '%?%'、-- TODO ? 都不算），
   否则提示「数量不一致」会把正确参数吓退。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countSqlPlaceholders, parseSqlParams } from '../sqlParams';

describe('1070 countSqlPlaceholders', () => {
  it('基础：按出现顺序计数，无占位符为 0', () => {
    expect(countSqlPlaceholders('SELECT * FROM idx')).toBe(0);
    expect(countSqlPlaceholders("SELECT * FROM idx WHERE a = ? AND b IN (?, ?)")).toBe(3);
  });

  it('忽略单引号字符串（含 LIKE %?% 与双写单引号转义）', () => {
    expect(countSqlPlaceholders("SELECT * FROM idx WHERE title LIKE '%?%' AND a = ?")).toBe(1);
    expect(countSqlPlaceholders("SELECT 'it''s ?' AS x, b = ?")).toBe(1);
  });

  it('忽略双引号/反引号标识符与行/块注释', () => {
    expect(countSqlPlaceholders('SELECT "?" FROM idx WHERE a = ?')).toBe(1);
    expect(countSqlPlaceholders('SELECT `?` FROM idx WHERE a = ?')).toBe(1);
    expect(countSqlPlaceholders('-- TODO ?\nSELECT * FROM idx WHERE a = ?')).toBe(1);
    expect(countSqlPlaceholders('/* ? ? */ SELECT * FROM idx WHERE a = ?')).toBe(1);
  });

  it('未闭合字符串/注释：剩余问号按字面量忽略（不虚报参数）', () => {
    expect(countSqlPlaceholders("SELECT 'unterminated ?")).toBe(0);
    expect(countSqlPlaceholders('SELECT 1 /* open ?')).toBe(0);
  });
});

describe('1070 parseSqlParams', () => {
  it('空文本 = 无参数；合法数组原样返回', () => {
    expect(parseSqlParams('   ')).toEqual({ ok: true, value: [] });
    expect(parseSqlParams('["宁德时代", "2026-01-01", 10, true, null]')).toEqual({
      ok: true, value: ['宁德时代', '2026-01-01', 10, true, null],
    });
  });

  it('非法 JSON / 非数组给出人话错误', () => {
    const bad = parseSqlParams('["a",');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('JSON 语法错误');
    const obj = parseSqlParams('{"a":1}');
    expect(obj.ok).toBe(false);
    if (!obj.ok) expect(obj.error).toContain('必须是 JSON 数组');
  });
});

describe('1070 SqlConsoleView 接线', () => {
  const src = readFileSync(join(__dirname, '../../views/SqlConsoleView.vue'), 'utf-8');

  it('参数文本走 usePref，参数条默认仅在有值时展开', () => {
    expect(src).toMatch(/const paramsText = usePref\('sql\.params', ''\);/);
    expect(src).toMatch(/const paramOpen = ref\(!!paramsText\.value\);/);
    expect(src).toMatch(/const paramPlaceholders = computed\(\(\) => countSqlPlaceholders\(sql\.value \|\| ''\)\);/);
  });

  it('buildBody 只在合法非空数组时写 params（不静默丢参数执行）', () => {
    expect(src).toMatch(/const pp = paramParse\.value;\r?\n\s*if \(pp\.ok && pp\.value\.length\) b\.params = pp\.value;/);
    expect(src).toMatch(/if \(!pp\.ok\) \{\r?\n\s*paramOpen\.value = true;\r?\n\s*store\.notify\('error', 'SQL 参数无法解析：' \+ pp\.error\);\r?\n\s*return;/);
  });

  it('改参数即作废旧 cursor（旧后续页对应旧参数，不得续到新参数现场）', () => {
    expect(src).toMatch(/watch\(paramsText, \(\) => \{\r?\n\s*if \(rows\.value\.length && runParams\.value !== null && paramsText\.value\.trim\(\) !== runParams\.value\) \{\r?\n\s*resultStale\.value = true;\r?\n\s*staleLabel\.value = '参数已修改';\r?\n\s*\}\r?\n\s*if \(cursor\.value\) \{\r?\n\s*resultStale\.value = true;\r?\n\s*staleLabel\.value = '参数已修改';\r?\n\s*void closeCursorQuiet\(\);/);
  });

  it('模板有参数开关/参数条与实时匹配状态（占位 ? / 参数 N）', () => {
    expect(src).toContain('class="btn ghost xs sq-param-btn"');
    expect(src).toContain('id="sq-param-bar"');
    expect(src).toMatch(/const paramStat = computed<\{ text: string; tone: 'ok' \| 'warn' \| 'bad' \| '' \}>/);
    expect(src).toContain('占位 ? ${ph} · 参数 ${n}（数量不一致）');
  });
});
