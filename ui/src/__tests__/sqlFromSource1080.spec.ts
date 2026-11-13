import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

/* 1080：SQL 字段源跟随 FROM（开源通用：按语句解析，不认业务索引名）。
 * 缺口语义：SQL 写 FROM "另一个索引" 时，补全/列名纠错/字段体检仍按顶栏选中索引取 mapping，
 * 补出来的是错字段、纠错建议也是错索引的字段。现四者统一读 effectiveSqlIndex。 */
describe('1080 SQL FROM 字段源', () => {
  const view = srcOf('views/SqlConsoleView.vue');
  const fields = srcOf('composables/useIndexFields.ts');

  it('视图接线：FROM 优先，回落顶栏；字段源/补全上下文/体检同源', () => {
    expect(view).toContain("import { indexFromSql } from '../utils/sqlIndex';");
    expect(view).toContain('const sqlFromIdx = computed(() => indexFromSql(sql.value, sqlIndexPool.value));');
    expect(view).toContain("const effectiveSqlIndex = computed(() => sqlFromIdx.value || store.pickedIdx || '');");
    expect(view).toContain('const sqlFieldsCtx = useIndexFields(() => effectiveSqlIndex.value);');
    expect(view).toMatch(/watch\(effectiveSqlIndex, idx => \{ sqlFieldsCtx\.reset\(\); if \(idx\) void sqlFieldsCtx\.ensure\(\); \}\);/);
    expect(view).toContain('pickedIdx: () => effectiveSqlIndex.value,');
    expect(view).toMatch(/function indexOf\(\): string \{\s*return effectiveSqlIndex\.value;\s*\}/);
  });

  it('换源可见锚：与顶栏选中不一致时出现静态 FROM 徽标（不做暗改）', () => {
    expect(view).toContain('const fromMismatch = computed(() => !!sqlFromIdx.value && !!store.pickedIdx && sqlFromIdx.value !== store.pickedIdx);');
    expect(view).toContain('v-if="fromMismatch"');
    expect(view).toContain('data-test="sql-from-chip"');
    expect(view).toContain('字段补全/体检/列名纠错跟随 FROM');
  });

  it('字段清单随索引切换立即清空（新 mapping 到达前不混用旧字段）', () => {
    expect(fields).toContain('function reset() { fields.value = []; loadErr.value = \'\'; loading.value = false; }');
    expect(fields).toContain('return { fields, loading, loadErr, ensure, reload, reset };');
    expect(view).toContain('watch(effectiveSqlIndex, idx => { sqlFieldsCtx.reset(); if (idx) void sqlFieldsCtx.ensure(); });');
  });
});
