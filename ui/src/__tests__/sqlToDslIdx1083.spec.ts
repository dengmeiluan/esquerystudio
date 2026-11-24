import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const dslView = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* 1083：SQL → DSL 跨模式跳转带上语句目标索引。
 * SQL 的 FROM 可以是顶栏之外的索引；DSL 页深链若不携带 idx，会按顶栏选中执行，
 * 变成「翻译对了、跑错索引」。DslQueryView 侧已有 idx 深链换源契约。 */
describe('1083 SQL 到 DSL 页携带目标索引', () => {
  it('gotoDsl 深链带 idx（为空则不带）', () => {
    expect(view).toContain('const idx = indexOf();');
    expect(view).toContain("query: { mode: 'dsl', ...(idx ? { idx } : {}), dsl: encodeDslParam(dslPreview.value) }");
  });

  it('DSL 页深链 idx 确实会换源（契约仍在）', () => {
    expect(dslView).toContain("const idx = usp.get('idx');");
    expect(dslView).toContain('if (idx && idx !== store.pickedIdx) { suppressIdxDslLoad = true; store.pick(idx); }');
  });
});
