/**
 * 1158 批：实时监控屏三表行右键（Top 索引 / 慢请求 / 告警历史）。
 *
 * 这三张表此前是纯展示 `<table>`（无排序/筛选/右键/导出），与「鼠标右键必须极致增强
 * 在整个项目」不符。本轮给行挂右键，按能力语义分两级：
 *   一级 = 该行最常用的一步（Top=数据浏览器打开；慢请求=复制 URI；告警=复制文案）；
 *   二级「复制…」承载整行 JSON / TSV。
 * 只读视图：菜单不含任何写动作（监控屏不能变成误操作面）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

describe('1158 监控屏三表行右键', () => {
  it('三种行都挂 contextmenu，且区分 kind', () => {
    expect(src).toContain(`@contextmenu.prevent="openLdRowMenu($event, 'slow', r)"`);
    expect(src).toContain(`@contextmenu.prevent="openLdRowMenu($event, 'alert', a)"`);
    expect(src).toContain(`@contextmenu.prevent="openLdRowMenu($event, 'top', t)"`);
  });

  it('菜单组件挂载在页面内并绑定 ldMenuItems', () => {
    expect(src).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(src).toMatch(/<CellContextMenu v-if="ldMenu"[\s\S]{0,180}:items="ldMenuItems"/);
  });

  it('一级是各行最常用的一步（不是把所有动作摊平）', () => {
    expect(src).toContain("key: 'open-browser', label: '在数据浏览器打开该索引'");
    expect(src).toContain("key: 'copy-uri', label: '复制 URI'");
    expect(src).toContain("key: 'copy-msg', label: '复制告警文案'");
  });

  it('复制类收进「复制…」二级', () => {
    expect(src).toContain("key: 'copy-group', label: '复制…'");
    expect(src).toContain("key: 'copy-json', label: '复制整行 JSON'");
    expect(src).toContain("key: 'copy-tsv', label: '复制为 TSV（可直接贴表格）'");
  });

  it('只读：菜单里没有任何写动作（delete/put/post 语义词不出现）', () => {
    const menu = src.slice(src.indexOf('const ldMenuItems'), src.indexOf('function gotoBrowser'));
    expect(menu.length, '菜单段应被截取到').toBeGreaterThan(200);
    for (const word of ['删除', 'doDelete', 'PUT ', 'POST ']) {
      expect(menu, `监控屏菜单不应含写动作：${word}`).not.toContain(word);
    }
  });

  it('跳转动作保留既有的权限门（canSeeConn + setTarget），不绕过', () => {
    expect(src).toMatch(/if \(row\.connId && !auth\.canSeeConn\(row\.connId\)\)/);
    expect(src).toMatch(/store\.setTarget\(row\.connId/);
  });
});
