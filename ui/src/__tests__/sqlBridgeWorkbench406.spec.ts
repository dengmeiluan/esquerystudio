/**
 * 四百零六批：SqlBridge 三栏接统一可调工作台——用户点名「布局比例可调节」：
 * 此前固定等分 grid（repeat(3, 1fr)）完全不可调；接 WorkbenchLayout 后白得
 * 拖拽调宽/三预设（等分·编辑优先·结果优先）/偏好记忆（scope=target+route+mode）/
 * 窄屏 stacked 自动堆叠（自制 1100px 断点退役）。三 Monaco 等高 260px 对齐。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');

describe('SqlBridge 可调工作台（406 批）', () => {
  it('WorkbenchLayout 接入：horizontal 语义 vertical 条（左右三栏）+三 pane 声明', () => {
    expect(v).toMatch(/<WorkbenchLayout :scope="brScope" :panes="BRIDGE_PANES" axis="vertical" mode="bridge">/);
    for (const slot of ['pane-bridge-sql', 'pane-bridge-dsl', 'pane-bridge-lucene']) {
      expect(v, slot).toContain(`<template #${slot}>`);
    }
    /* W2 批：sized+flex 混合——三 pane 全 'flex' 时拖拽/预设/记忆全死（sizeOf 恒回 minSize +
       .wl-flex-pane 压内联宽 + constraintsRecord 排除 flex），改 SQL/Lucene 定宽可拖、DSL 吃剩余。
       五百三十五批同步更新：竖排标题轨退役（刀①②），title 置空即不渲染（519 批约定），
       标题语义落 pane 行首横排 br-title——三行 title 逐字锁随改用迁移 */
    expect(v).toMatch(/id: 'bridge\.sql', role: 'request', title: '', minSize: 280, defaultSize: 340, collapsible: true/);
    expect(v).toMatch(/id: 'bridge\.dsl', role: 'response', title: '', minSize: 300, defaultSize: 'flex', collapsible: true/);
    expect(v).toMatch(/id: 'bridge\.lucene', role: 'response', title: '', minSize: 260, defaultSize: 320, collapsible: true/);
  });

  it('W2 批：三 pane 声明非全 flex（拖拽/预设/记忆三能力复活的前提）', () => {
    const decl = v.slice(v.indexOf('const BRIDGE_PANES'), v.indexOf('];', v.indexOf('const BRIDGE_PANES')));
    const flexes = decl.match(/defaultSize: 'flex'/g) ?? [];
    const sized = decl.match(/defaultSize: \d+/g) ?? [];
    expect(sized.length, '至少两个 sized pane（拖拽+预设条可渲染）').toBeGreaterThanOrEqual(2);
    expect(flexes.length, '保留一个 flex pane 吃剩余空间').toBe(1);
  });

  it('固定 grid 退役：br-grid 样式与 1100px 断点清除；convErr/对比表移出工作台', () => {
    expect(v).not.toContain('.br-grid');
    expect(v).not.toMatch(/@media \(max-width: 1100px\)/);
    const wlStart = v.indexOf('<WorkbenchLayout');
    const wlEnd = v.indexOf('</WorkbenchLayout>');
    expect(v.indexOf('convErr'), '失败面板在工作台之前（全宽可见）').toBeLessThan(wlStart);
    expect(v.indexOf('三者能力对比'), '对比表在工作台之后（全宽）').toBeGreaterThan(wlEnd);
  });

  it('三 Monaco 等高 100% 弹性（v3.0.1 屏幕自适应，参差高度退役精神延续）', () => {
    expect(v).toMatch(/height="100%" @execute="doAll"/);
    expect((v.match(/height="100%"/g) ?? []).length).toBe(3);
    expect(v).not.toMatch(/height="150px"|height="300px"|height="140px"/);
  });
});
