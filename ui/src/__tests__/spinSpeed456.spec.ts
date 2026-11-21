/**
 * 四百五十六批：旋转动画速度统一——428 收口类名后遗留速度双轨：
 * span.spin（边框 loading 圈）.7s vs .spinning（图标旋转）1s。同为旋转不同速，
 * 视觉节奏不齐。统一 1s。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

describe('旋转速度统一（456 批）', () => {
  it('span.spin 与 .spinning 同为 1s', () => {
    expect(s).toMatch(/span\.spin \{[^}]*animation: rot 1s linear infinite; \}/);
    expect(s).toMatch(/\.spinning \{ animation: rot 1s linear infinite; \}/);
    expect(s).not.toMatch(/animation: rot \.7s/);
  });
});
