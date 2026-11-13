import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1085：SQL 页内历史回放还原本条记录的索引现场。
 * 历史条目自带 index，但旧回放只装 SQL/参数；当顶栏停在 B、历史来自 A 时，
 * 顶栏与补全/体检的底稿仍是 B（语句靠 FROM 才侥幸跑对）。 */
describe('1085 SQL 历史回放切回记录索引', () => {
  it('回放前按条目 index 切源并说明', () => {
    expect(src).toContain("function replayHistRow(row: { query: string; params?: string; index?: string; opts?: Record<string, unknown> }, runIt: boolean)");
    expect(src).toContain("const idx = row.index || '';");
    expect(src).toContain('if (idx && idx !== store.pickedIdx) {');
    expect(src).toContain('store.pick(idx);');
    expect(src).toContain('已切到历史记录索引 ${idx} 并回放 SQL');
  });

  it('参数恢复保持原语义（索引切换不干扰参数回填）', () => {
    expect(src).toContain("paramsText.value = row.params || '';");
  });
});
