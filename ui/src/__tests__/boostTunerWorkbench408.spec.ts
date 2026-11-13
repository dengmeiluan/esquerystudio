/**
 * 四百零八批：BoostTuner 接统一可调工作台（继 406 SqlBridge/407 ConfigDrift 后第三视图）——
 * 参数栏（搜索词/字段/查询预览）可折叠+拖拽调宽+偏好记忆，排名对比主区 flex；
 * 固定 minmax(300px,400px) grid 与 1100px 断点退役，窄屏 stacked 自动处理。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/BoostTunerView.vue'), 'utf-8');

describe('BoostTuner 可调工作台（408 批）', () => {
  it('WorkbenchLayout 接入：参数 pane 可折叠+结果 flex', () => {
    expect(v).toMatch(/<WorkbenchLayout :scope="btScope" :panes="BT_PANES" axis="vertical" mode="tuner">/);
    expect(v).toContain('<template #pane-boosttuner-params>');
    expect(v).toContain('<template #pane-boosttuner-result>');
    /* 五百三十四批轨4锚同步更新：竖排标题轨退役（§6v 刀①）——title 文本锁逐字映射为 title: ''，
       参数侧语义由 bt-card-hd「搜索词 · 字段权重」横排承接，尺寸字面零变动 */
    expect(v).toMatch(/id: 'boosttuner\.params', role: 'request', title: '', minSize: 300, defaultSize: 360, collapsible: true/);
    expect(v).toMatch(/id: 'boosttuner\.result', role: 'response', title: '', minSize: 340, defaultSize: 'flex'/);
    expect(v, '参数侧横排语义承接锚（bt-card-hd 在场）').toMatch(/class="bt-card-hd"/);
  });

  it('固定 grid 与 1100px 断点退役', () => {
    expect(v).not.toMatch(/\.bt-body \{ display: grid/);
    expect(v).not.toMatch(/@media \(max-width: 1100px\)/);
  });
});
