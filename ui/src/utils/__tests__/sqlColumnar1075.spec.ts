/* 1075：SQL columnar（列式返回）前端契约。
   大结果/深翻页用 columnar 更稳；cursor 续页 ES 只认 columnar/time_zone。
   表格/图表/导出仍吃行数组，转换必须严格：畸形列（非数组/列长不一致）返回 []，不补 null 伪造行。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { columnarToRows } from '../sqlResult';

describe('1075 columnarToRows', () => {
  it('列数组转行数组（保持列序）', () => {
    expect(columnarToRows([['a', 'b'], [1, 2]])).toEqual([['a', 1], ['b', 2]]);
    expect(columnarToRows([[]])).toEqual([]);
    expect(columnarToRows([])).toEqual([]);
  });

  it('畸形形态返回 []（宁缺勿错，不补 null）', () => {
    expect(columnarToRows(null)).toEqual([]);
    expect(columnarToRows('x')).toEqual([]);
    expect(columnarToRows([['a'], 'bad'])).toEqual([]);
    expect(columnarToRows([['a', 'b'], [1]])).toEqual([]);
  });
});

describe('1075 SqlConsoleView 接线', () => {
  const src = readFileSync(join(__dirname, '../../views/SqlConsoleView.vue'), 'utf-8');

  it('columnar 偏好入 body；cursor 续页带上同一形态', () => {
    expect(src).toMatch(/const columnar = usePref\('sql\.columnar', false\);/);
    expect(src).toContain('if (columnar.value) b.columnar = true;');
    expect(src).toContain('api.sqlCursor(cursor.value, timeZone.value || undefined, columnar.value || undefined)');
  });

  it('响应统一转行；translate 剥掉 columnar（与行/列形态无关）', () => {
    expect(src).toContain('function sqlRowsOf(r: any): any[][] {');
    expect(src).toContain('return columnarToRows(r?.values);');
    expect(src).toContain('rows.value = sqlRowsOf(r);');
    expect(src).toContain('void api.sqlTranslate(withoutColumnar(body)).then(r => {');
    expect(src).toContain('const r = await api.sqlTranslate(withoutColumnar(buildBody(text)));');
  });

  it('切换 columnar 即作废旧 cursor（页形态不能中途变）', () => {
    expect(src).toMatch(/watch\(columnar, \(\) => \{\r?\n\s*if \(cursor\.value\) \{\r?\n\s*resultStale\.value = true;\r?\n\s*staleLabel\.value = '列式形态已切换';\r?\n\s*void closeCursorQuiet\(\);/);
  });
});
