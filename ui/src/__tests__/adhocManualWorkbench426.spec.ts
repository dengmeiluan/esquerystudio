/**
 * 四百二十六批：AdhocRebuild 手动模式 settings/mapping 对照接可调工作台——
 * 411 自动派生模式的姊妹场景收口（此前漏网）。⚠考古发现：1100px 断点行
 * 在仓库中已重复两行（历史脏行），本次一并清除。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

describe('手动模式对照可调（426 批）', () => {
  it('WorkbenchLayout 接入：manual settings/mapping 双 pane', () => {
    /* 547 批同步更新：开标签尾部扩 :fill-viewport="false"（向导行动行留首屏；锁语义不变仍钉双栏声明形态）
       554 批同步更新：开标签头部补 class="ar-fill-wl"（554-P0 高度档锚，554-P2 rows 驱动后类保留作 DOM 锚） */
    expect(v).toMatch(/<WorkbenchLayout class="ar-fill-wl" :scope="arManualScope" :panes="AR_MANUAL_PANES" axis="vertical" mode="arManual" :fill-viewport="false">/);
    expect(v).toContain('<template #pane-adhoc-manual-settings>');
    expect(v).toContain('<template #pane-adhoc-manual-mapping>');
    /* 519 批：spec.id 必须 kebab-case（全小写）——曾误用 camelCase(manualSettings)，
       paneSlotName 生成的动态 slot 名(pane-adhoc-manualSettings)与模板 kebab slot
       (#pane-adhoc-manual-settings) 永不匹配，slot 内容(编辑框)从未渲染——「无法编辑」事故根因。
       源码锁双向钉死：kebab 在场 + camel 禁入场。
       w80 批同步更新：sized+flex 混合（settings 数值档 320、mapping 吃 flex，恢复中缝拖拽）。
       535 批 W4 同步更新：竖排标题轨退役（519 约定/DevToolsView 先例）——title 文本锁逐字映射为
       title: ''（置空即不渲染），标题语义落 pane 行首横排（.ar-manual-lb 本就是 sec-t 档）。 */
    expect(v).toMatch(/id: 'adhoc\.manual-settings', role: 'request', title: '', minSize: 260, defaultSize: 320, collapsible: true/);
    expect(v).toMatch(/id: 'adhoc\.manual-mapping', role: 'response', title: '', minSize: 260, defaultSize: 'flex', collapsible: true/);
    expect(v).not.toMatch(/adhoc\.manualSettings|adhoc\.manualMapping/);
  });

  it('固定 grid 与断点行清零（含历史重复脏行）', () => {
    expect(v).not.toContain('ar-manual-grid');
  });
});
