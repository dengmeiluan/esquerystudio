/**
 * 四百四十四批同族收尾（四百四十八批起 a11y 收口）：孤立 toggle/导航 div 键盘可达——
 * 442 批 v-for 扫描抓不到的单元素类：SideNav 分组标题+导航项（RouterLink 自定义
 * div 渲染丢 a 语义）/CreateIndexModal 两个折叠条/ExplainTree 展开行/IndexPicker
 * 当前选中重选/AnalysisSettings 分组折叠/IndexSettings showRaw 切换。
 * mask 类（点空白关闭快捷路径）与 span 转圈豁免。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

describe('孤立 toggle/导航键盘可达（449 批族）', () => {
  it('SideNav：分组标题折叠+导航项 role=link', () => {
    const s = readFileSync(join(SRC, 'components/SideNav.vue'), 'utf-8');
    expect(s).toMatch(/class="nav-g-hd" role="button" tabindex="0" :aria-expanded="isOpen\(g\)"/);
    expect(s).toMatch(/role="link" tabindex="0" @keydown\.enter\.prevent="\(\) => navigate\(\)"/);
  });

  it('CreateIndexModal/ExplainTree/IndexPicker/AnalysisSettings/IndexSettings', () => {
    const cim = readFileSync(join(SRC, 'components/CreateIndexModal.vue'), 'utf-8');
    expect((cim.match(/cim-adv-toggle" role="button" tabindex="0"/g) ?? []).length).toBe(2);
    const xt = readFileSync(join(SRC, 'components/ExplainTree.vue'), 'utf-8');
    expect(xt).toMatch(/class="xt-row" :class="kindClass" role="button" tabindex="0" :aria-expanded="open"/);
    const ixp = readFileSync(join(SRC, 'components/IndexPicker.vue'), 'utf-8');
    expect(ixp).toContain('role="button" tabindex="0" @click="choose(store.pickedIdx)"');
    const as = readFileSync(join(SRC, 'views/AnalysisSettingsView.vue'), 'utf-8');
    expect(as).toMatch(/role="button" tabindex="0" :aria-expanded="!!openMap/);
    const isv = readFileSync(join(SRC, 'views/IndexSettingsView.vue'), 'utf-8');
    expect(isv).toMatch(/class="card-t" role="button" tabindex="0" :aria-expanded="showRaw"/);
  });
});
