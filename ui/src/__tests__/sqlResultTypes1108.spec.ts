import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1108：SQL 结果列自带 ES 类型，显式喂给 QRT——列头类型徽标/数值对齐/date 本地化
 * 不再只靠值采样（全 null / 混合列采样不到）。聚合表达式列无稳定类型，排除。 */
describe('1108 SQL 结果列类型接线', () => {
  it('普通列 type 映射传给通用表；表达式列排除', () => {
    expect(src).toContain('const sqlFieldTypes = computed<Record<string, string>>(() => {');
    expect(src).toContain("if (!c.type || c.name.includes('(') || c.name.includes('*')) continue;");
    expect(src).toContain('out[c.name] = c.type;');
    expect(src).toContain(':field-types="sqlFieldTypes"');
  });

  it('semRawCols 抑制推断的既有语义不变', () => {
    expect(src).toContain('SQL 结果列一律抑制 semFormat「按值推断」');
    expect(src).toContain('const sqlSemRawCols = computed<string[]>(() => cols.value.map(c => c.name));');
    expect(src).toContain(":sem-raw-cols=\"sqlSemRawCols\"");
  });
});
