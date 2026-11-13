/**
 * 三百二十二批：ConfigDrift 一键复制修复 DSL（different 键按代码侧值组装 PUT _settings body）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/ConfigDriftView.vue'), 'utf-8');

describe('ConfigDrift 修复 DSL（322 批）', () => {
  it('按钮+函数+代码侧值组装', () => {
    expect(v).toContain('复制修复 DSL（{{ drift.settingsDiff.different.length }} 键）');
    expect(v).toMatch(/function copyFixDsl\(\)/);
    expect(v).toMatch(/settings\[item\.key\] = item\.code;/);
    expect(v).toMatch(/'PUT \/' \+ dv\.physicalIndex \+ '\/_settings/);
  });
});
