/**
 * 二百五十六批：快捷键速查面板「已实现未登记」补全。
 * 防重演口径（173 批起）：功能存在但速查面板没有 =「有功能没人知道」。
 * 补：Ctrl+Z 撤销待提交（234 批实现从未登记）、列头 Shift+点击次键排序
 * （此前只藏在列头 title 里）。F2/Tab 已随 244 批登记。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');

describe('速查面板登记补全（256 批）', () => {
  it('Ctrl+Z 撤销已登记', () => {
    expect(s).toMatch(/\{ keys: \['Ctrl', 'Z'\], desc: 'RT：撤销上一条待提交编辑/);
  });
  it('列头 Shift+点击次键排序已登记', () => {
    expect(s).toMatch(/Shift', '点击列头/);
    expect(s).toContain('多列组合排序');
  });
});
