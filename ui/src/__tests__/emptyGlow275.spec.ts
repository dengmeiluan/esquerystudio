/**
 * 二百七十五/二百七十六批：空态质感升级+失败红点对比度修正。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const es = readFileSync(join(__dirname, '../components/EmptyState.vue'), 'utf-8');
const panel = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');

describe('空态质感+红点合规（275-276 批）', () => {
  it('EmptyState 图标柔光圆底（compact 档缩档）', () => {
    expect(es).toMatch(/radial-gradient\(circle, var\(--ac-soft\)/);
    expect(es).toMatch(/\.empty-state\.es-compact \.es-icon \{ width: 38px/);
  });
  it('失败红点纯圆化（无文字=无对比度负担，语义走 role/aria）', () => {
    expect(panel).toMatch(/role="img" aria-label="上次执行失败"/);
    expect(panel).toMatch(/width: 8px; height: 8px/);
    expect(panel).not.toMatch(/qhp-fail \{[^}]*font-size/);
  });
});
