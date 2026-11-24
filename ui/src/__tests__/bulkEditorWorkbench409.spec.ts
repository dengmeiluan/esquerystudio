/**
 * 四百零九批：BulkEditor 接统一可调工作台（继 SqlBridge/ConfigDrift/BoostTuner 后第四视图）——
 * 参数栏（timeout/pipeline/wait_for 等）可折叠+拖拽调宽+偏好记忆，NDJSON 编辑区 flex；
 * 固定 minmax(220px,280px) grid 与 1100px 断点退役，窄屏 stacked 自动处理。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/BulkEditorView.vue'), 'utf-8');

describe('BulkEditor 可调工作台（409 批）', () => {
  it('WorkbenchLayout 接入：参数 pane 可折叠+编辑区 flex', () => {
    expect(v).toMatch(/<WorkbenchLayout :scope="beScope" :panes="BE_PANES" axis="vertical" mode="bulkedit">/);
    expect(v).toContain('<template #pane-bulkeditor-params>');
    expect(v).toContain('<template #pane-bulkeditor-editor>');
    /* 五百三十四批轨4锚同步更新：竖排标题轨退役（§6v 刀①）——title 文本锁逐字映射为 title: ''，
       「参数」语义落 be-card-hd 横排卡头（413 批因 rp-title 在场而删，轨退役后回归），尺寸字面零变动 */
    expect(v).toMatch(/id: 'bulkeditor\.params', role: 'request', title: '', minSize: 220, defaultSize: 260, collapsible: true/);
    expect(v).toMatch(/id: 'bulkeditor\.editor', role: 'response', title: '', minSize: 360, defaultSize: 'flex'/);
    expect(v, '「参数」横排语义承接锚（原 pane title 文本，落 be-card-hd）').toContain('<div class="be-card-hd"><span>参数</span></div>');
  });

  it('固定 grid 与 1100px 断点退役', () => {
    expect(v).not.toMatch(/\.be-grid \{ display: grid/);
    expect(v).not.toMatch(/@media \(max-width: 1100px\)/);
  });
});
