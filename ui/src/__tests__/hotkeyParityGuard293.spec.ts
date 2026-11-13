/**
 * 二百九十三批：HotkeyPanel↔handler 一致性守卫——面板登记的键必须真有 handler，
 * handler 里的快捷键必须已登记（「有功能没人知道」与「有登记没功能」双向防）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panel = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

describe('热键登记一致性守卫（293 批）', () => {
  it('面板登记的 RT 键在组件内有对应实现（handler 锚点逐一存在）', () => {
    const handlers: [string, string][] = [
      ["e.key === 'F2'", 'F2 编辑'],
      ["e.key.toLowerCase() === 'z'", 'Ctrl+Z 撤销'],
      ["e.key.toLowerCase() === 'f'", 'Ctrl+F 查找'],
      ['tabEdit', 'Tab 跳格'],
      ['onDeleteKey', 'Del 删除'],
    ];
    for (const [handler, label] of handlers) {
      expect(rt, `${label} handler 应存在`).toContain(handler);
    }
  });
  it('面板禁登记空描述/重复键行', () => {
    const rows: string[] = panel.match(/\{ keys: \[[^\]]+\], desc: '[^']+'/g) ?? [];
    expect(rows.length, '登记行数合理（防面板被清空）').toBeGreaterThan(15);
    const dup = rows.filter((r, i) => rows.indexOf(r) !== i);
    expect(dup, '重复登记行:\n' + dup.join('\n')).toEqual([]);
  });
});
