/**
 * 九百三十一批（轨6 走查批 · SearchTemplatesView 侧栏滚动刀）：
 * .st-list 在 max-height 界下用 overflow:hidden 把超出可视高度的模板列表整体
 * 剪裁且无滚动通道——模板数多时下方条目不可达（壳退役时保留的骨架把「防撑破」
 * 误作永久剪裁语义）。修=overflow-y:auto：防撑破仍由 max-height 承担，
 * 溢出内容从「剪裁不可达」换「滚动可达」。
 * jsdom 无真实布局，滚动行为锚恒假绿（867 同族口径）——本刀守卫走源码锁，
 * 真机滚动实测归 probe。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SearchTemplatesView.vue'), 'utf-8');

describe('侧栏列表滚动通道（九百三十一批）', () => {
  it('源码锁：.st-list overflow-y:auto（max-height 骨架保留，剪裁换滚动）', () => {
    expect(v, '.st-list 须含 overflow-y:auto（模板超出可视高度可滚动可达）')
      .toMatch(/\.st-list \{[^}]*overflow-y: auto;/);
    expect(v, '防撑破 max-height 骨架零触')
      .toMatch(/\.st-list \{[^}]*max-height: calc\(100vh - var\(--vh-offset\) \+ 50px\);/);
    expect(v, '壳不回流').not.toMatch(/\.st-list \{[^}]*border/);
  });
});
