/**
 * 五百六十三批·用户裁决二次修正:「单击就复制不对,那我本来想要复制值进去,那不就还要
 * 复制一次吗」——单击自动复制整体退役(初版延迟 260ms 方案治标不治本)。
 *
 * 单击现在只服务于:截断值展开/收起;双击编辑、右键菜单「复制值/复制 JSON」、
 * Ctrl+C 行复制、列头复制整列、hover 行内钮为复制的显式路径(剪贴板不再被
 * 无意识的单击覆盖,「复制外部值→双击编辑→粘贴」流全程无损)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');

describe('563 用户裁决:单元格单击自动复制退役', () => {
  it('负向:onCellClick 不再触发 copyCell,延迟复制定时器机制整体退役', () => {
    const fn = rt.slice(rt.indexOf('function onCellClick'), rt.indexOf('async function copyCell'));
    expect(fn, 'onCellClick 内零复制调用').not.toContain('copyCell');
    expect(rt, '延迟定时器机制退役').not.toContain('cellCopyTimer');
    expect(rt, '非截断值单击复制语义退役').not.toContain('非截断值=复制');
  });
  it('截断值展开/收起保留(单击的合法职责)', () => {
    const fn = rt.slice(rt.indexOf('function onCellClick'), rt.indexOf('async function copyCell'));
    expect(fn).toContain('toggleExpand(hit, c)');
  });
  it('显式复制路径保留:右键菜单「复制值」与 copyCell 函数(菜单/行内钮共用)', () => {
    expect(rt).toContain("label: '复制值'");
    expect(rt).toContain('async function copyCell');
    expect(rt).toMatch(/aria-label="回到顶部"/);
  });
});
