/**
 * 四百一十一批：AdhocRebuild settings/mapping 对照双栏接统一可调工作台（第六视图）——
 * mapping JSON 通常远长于 settings，等分宽度对长文档不友好；接 WorkbenchLayout 后
 * 拖拽调宽+双栏各自可折叠+偏好记忆，窄屏 stacked 自动处理（1100px 断点退役）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

describe('AdhocRebuild 对照可调工作台（411 批）', () => {
  it('WorkbenchLayout 接入：settings/mapping 双 pane 均可折叠', () => {
    /* 547 批同步更新：开标签尾部扩 :fill-viewport="false"（向导行动行留首屏；锁语义不变仍钉双栏声明形态）
       554 批同步更新：开标签头部补 class="ar-fill-wl"（554-P0 高度档锚，554-P2 rows 驱动后类保留作 DOM 锚） */
    expect(v).toMatch(/<WorkbenchLayout class="ar-fill-wl" :scope="arEdScope" :panes="AR_ED_PANES" axis="vertical" mode="arEditors" :fill-viewport="false">/);
    expect(v).toContain('<template #pane-adhoc-settings>');
    expect(v).toContain('<template #pane-adhoc-mapping>');
    /* w80 批同步更新：sized+flex 混合（settings 数值档 320、mapping 吃 flex）——两组全 flex
       时中缝拖不动（两侧互相让位），settings 改数值档恢复拖拽语义。
       535 批 W4 同步更新：竖排标题轨退役（519 约定/DevToolsView 先例）——title 文本锁逐字映射为
       title: ''（置空即不渲染），标题语义落 pane 行首横排 sec-t 档 */
    expect(v).toMatch(/id: 'adhoc\.settings', role: 'request', title: '', minSize: 260, defaultSize: 320, collapsible: true/);
    expect(v).toMatch(/id: 'adhoc\.mapping', role: 'response', title: '', minSize: 260, defaultSize: 'flex', collapsible: true/);
    expect(v, '竖排标题字面不回流').not.toContain("title: 'settings'");
    expect(v, '竖排标题字面不回流').not.toContain("title: 'mapping'");
  });

  it('固定等分 grid 与断点退役', () => {
    expect(v).not.toMatch(/\.editors \{ display: grid/);
    expect(v).not.toContain('.editors { grid-template-columns: 1fr; }');
  });
});
