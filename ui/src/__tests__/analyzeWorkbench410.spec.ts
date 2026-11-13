/**
 * 四百一十批：Analyze 接统一可调工作台（第五视图）——输入 body/分词结果双栏可调，
 * 输入栏可折叠+拖拽调宽+偏好记忆；固定 1fr 1fr 等分 grid 与 1100px 断点退役。
 * ⚠过程坑：python 多段替换「一损俱损」——某段 assert 失败时整个 write 未执行，
 * 部分改动丢失；改拆独立小段各自 write（与 374 台账事故同族：要么全成要么全不动）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/AnalyzeView.vue'), 'utf-8');

describe('Analyze 可调工作台（410 批）', () => {
  it('WorkbenchLayout 接入：输入 pane 可折叠+结果 flex', () => {
    expect(v).toMatch(/<WorkbenchLayout :scope="avScope" :panes="AV_PANES" axis="vertical" mode="analyze">/);
    expect(v).toContain('<template #pane-analyze-input>');
    expect(v).toContain('<template #pane-analyze-result>');
    /* 五百一十九批：竖排标题轨退役（用户实报双标题）——pane title 置空（卡片 card-t 头部已
       承担标题，ResizablePane v-if="title" 不再渲染 34px 轨）+ 输入栏 380→420 再平衡比例 */
    expect(v).toMatch(/id: 'analyze\.input', role: 'request', title: '', minSize: 280, defaultSize: 420, collapsible: true/);
    expect(v).toMatch(/id: 'analyze\.result', role: 'response', title: '', minSize: 320, defaultSize: 'flex'/);
    expect(v).toContain("import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';");
  });

  it('固定 grid 与 1100px 断点退役', () => {
    expect(v).not.toMatch(/\.av-grid \{ display: grid/);
    expect(v).not.toMatch(/@media \(max-width: 1100px\)/);
  });
});
