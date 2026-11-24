/**
 * 四百零七批：ConfigDrift 双栏接统一可调工作台——继 406 SqlBridge 后第二个接入视图。
 * 此前固定 minmax(200px,260px)+1fr grid：清单栏宽度不可调、不可折叠；
 * 接 WorkbenchLayout 后清单栏可折叠（collapsible）+拖拽调宽+预设+偏好记忆，
 * 窄屏 stacked 自动堆叠（1100px 自制断点退役）。
 * 附 407 扫描结论：nowrap 溢出 25 嫌疑全甄别（故意设计/父容器滚动兜底）零缺口；
 * router.push 字面量 46 目标零死链。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/ConfigDriftView.vue'), 'utf-8');

describe('ConfigDrift 可调工作台（407 批）', () => {
  it('WorkbenchLayout 接入：清单 pane 可折叠+详情 flex', () => {
    expect(v).toMatch(/<WorkbenchLayout v-else-if="keys\.length" :scope="cdScope" :panes="CD_PANES" axis="vertical" mode="drift">/);
    expect(v).toContain('<template #pane-configdrift-list>');
    expect(v).toContain('<template #pane-configdrift-detail>');
    /* 五百三十四批轨4锚同步更新：竖排标题轨退役（§6v 刀①）——title 文本锁逐字映射为 title: ''，
       「对象清单」语义落 cd-list-head 行首横排 cd-list-tt（刀②），尺寸字面零变动 */
    expect(v).toMatch(/id: 'configdrift\.list', role: 'request', title: '', minSize: 200, defaultSize: 260, collapsible: true/);
    expect(v).toMatch(/id: 'configdrift\.detail', role: 'response', title: '', minSize: 320, defaultSize: 'flex'/);
    expect(v, '「对象清单」横排语义承接锚（原 pane title 文本，落行首横排）').toContain('<span class="cd-list-tt">对象清单</span>');
  });

  it('固定 grid 与 1100px 断点退役', () => {
    expect(v).not.toMatch(/\.cd-body \{ display: grid/);
    expect(v).not.toContain('.cd-body { grid-template-columns');
    expect(v).not.toMatch(/@media \(max-width: 1100px\)/);
  });
});
