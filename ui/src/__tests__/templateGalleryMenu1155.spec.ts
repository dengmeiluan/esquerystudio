/**
 * 1155 批：模板库卡片右键（「鼠标右键必须极致增强」在全站的又一处收口）。
 *
 * 模板卡底部原本平铺五颗钮（复制 / 沙盒 / DSL / 收藏 / 展开）——同 1142 的「表格右键太多
 * 功能平铺」问题。右键菜单按能力语义分两级：
 *   一级 = 两个去向（沙盒 / 查询工作台）+ 复制…、收藏…、代码区… 三个分组父行；
 *   二级承载具体动作，label 与底部按钮语义一一对应（能力零删除，底部钮原样保留给触屏）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/TemplateGalleryView.vue'), 'utf-8');

describe('1155 模板卡右键菜单', () => {
  it('卡片挂 contextmenu，菜单组件与状态在同一文件', () => {
    expect(src).toContain('@contextmenu.prevent="openTgMenu($event, t)"');
    expect(src).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(src).toContain('const tgMenu = ref<{ x: number; y: number; t: Tpl } | null>(null);');
    expect(src).toMatch(/<CellContextMenu v-if="tgMenu"[\s\S]{0,180}:items="tgMenuItems"/);
  });

  it('一级只有两个去向 + 三个分组父行（不再靠按钮行铺开）', () => {
    expect(src).toContain("key: 'to-sandbox', label: '送入搜索沙盒'");
    expect(src).toContain("key: 'to-query', label: '送入查询工作台（DSL）'");
    for (const g of ["key: 'copy-group', label: '复制…'", "key: 'fav-group', label: '收藏…'", "key: 'view-group', label: '代码区…'"]) {
      expect(src, `缺失分组：${g}`).toContain(g);
    }
  });

  it('二级动作与底部按钮同语义（能力零删除）', () => {
    for (const label of ['复制模板 JSON', '复制模板标题', '复制为 cURL（POST _search）', '收藏该模板', '收起代码区']) {
      expect(src, `缺失二级项：${label}`).toContain(label);
    }
  });

  it('动作仍走原函数（沙盒/工作台/复制/收藏/展开语义不另起炉灶）', () => {
    expect(src).toMatch(/key: 'to-sandbox'[^\n]*run: \(\) => toSandbox\(t\)/);
    expect(src).toMatch(/key: 'to-query'[^\n]*run: \(\) => toQuery\(t\)/);
    expect(src).toMatch(/key: 'copy-json'[^\n]*run: \(\) => copy\(t\)/);
    expect(src).toMatch(/key: 'fav-toggle'[^\n]*run: \(\) => toggleFav\(t\)/);
    expect(src).toMatch(/key: 'exp-toggle'[^\n]*run: \(\) => toggleExpand\(t\)/);
  });

  it('底部按钮行保留（触屏无右键，不能只留菜单）', () => {
    expect(src).toContain('@click="toSandbox(t)"');
    expect(src).toContain('@click="toQuery(t)"');
    expect(src).toContain('@click="toggleFav(t)"');
  });
});
