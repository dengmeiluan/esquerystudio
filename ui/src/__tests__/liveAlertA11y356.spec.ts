/**
 * 三百五十六批：LiveDashboard 告警横条键盘可达（role=button+tabindex+Enter 触发+aria-label）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

describe('LiveDashboard 告警 a11y（356 批）', () => {
  it('role=button+tabindex+Enter+aria-label 四件齐', () => {
    expect(v).toMatch(/role="button" tabindex="0"/);
    /* 1439h：统一 onLdCardKey（Enter/Space 定位 + 菜单键），双键语义在 handler 内 */
    expect(v).toMatch(/@keydown="onLdCardKey\(\$event, 'active-alert', a\)"/);
    expect(v).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
    expect(v).toMatch(/:aria-label="`告警：\$\{a\.title\}，点击定位到对应处置`"/);
    expect(v).toContain('a.title');
  });
});
