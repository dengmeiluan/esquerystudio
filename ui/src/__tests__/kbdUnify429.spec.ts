/**
 * 四百二十九批：kbd 键位提示样式合并——.kbd.inline 三视图逐字重复、
 * .kbd-mini IndexHub 本地定义，统一合并 theme.css（428 旋转类收口同族）。
 * span.spin 元素选择器语义不同保留（428 已定性）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');

describe('kbd 样式合并（429 批）', () => {
  it('theme.css 全局 .kbd.inline 与 .kbd-mini 在场', () => {
    expect(theme).toMatch(/\.kbd\.inline \{ display: inline-block; padding: 1px 4px; font-size: var\(--fs-xs\); background: var\(--hl\); border-radius: 2px; margin-left: 3px; \}/);
    expect(theme).toMatch(/\.kbd-mini \{ font-family: var\(--mono\); font-size: var\(--fs-2xs\);/);
  });

  it('三视图重复 .kbd.inline 清零、IndexHub 本地 .kbd-mini 清零', () => {
    for (const f of ['LuceneQueryView.vue', 'SqlBridgeView.vue', 'SqlConsoleView.vue']) {
      const v = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(v, f).not.toContain('.kbd.inline {');
    }
    const ih = readFileSync(join(SRC, 'views/IndexHubView.vue'), 'utf-8');
    expect(ih).not.toContain('.kbd-mini {');
    /* 五百一十九批：唯一使用点（查询 tab 常驻提示行的 Ctrl+Enter）随提示行合并 Info 钮
       tooltip 退役（516 批 docs tab 同款裁决）——使用点清零，全局样式留 theme.css 不动 */
    expect(ih).not.toContain('class="kbd-mini"');
  });
});
