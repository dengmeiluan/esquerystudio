import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1102：SQL 通道对 nested 字段是硬限制（ES SQL 不支持），错误面板给真正能完成查询的
 * 通道入口（Lucene / PIT），而不是只留一个必然再次失败的重试钮。 */
describe('1102 SQL nested 限制跨通道引导', () => {
  it('仅命中 Nested fields not supported 时出现两个通道入口', () => {
    expect(src).toContain('const nestedLimitFix = computed(() => !!runErr.value && /Nested fields not supported/i.test(runErr.value));');
    expect(src).toContain('data-test="sql-goto-lucene"');
    expect(src).toContain('data-test="sql-goto-pit"');
    expect(src).toContain('SQL 不支持 nested 字段，可改用：');
  });

  it('切换仅改 mode，保留其余 URL 现场', () => {
    expect(src).toMatch(/function switchQhMode\(mode: 'lucene' \| 'pit'\) \{[\s\S]{0,300}usp\.set\('mode', mode\);[\s\S]{0,120}location\.hash = /);
  });
});
