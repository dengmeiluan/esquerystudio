/* 2.5.0 菜单 SPI：router 导航必须从页面契约 JSON 派生——本测试钉死派生关系，防手工改回造成三端漂移 */
import { describe, expect, it } from 'vitest';
import contract from '@contract';
import { NAV_GROUPS, NAV_ITEMS } from '../router';

describe('页面契约 → 导航派生', () => {
  it('组/页数量与契约一致（13 组 53 页）', () => {
    expect(contract.groups.length).toBe(13);
    expect(contract.pages.length).toBe(53);
    expect(NAV_GROUPS.length).toBe(contract.groups.length);
    expect(NAV_ITEMS.length).toBe(contract.pages.length);
  });

  it('每个契约页面派生出导航项：route/hotkey/icon/group/minVer 逐字段同源', () => {
    for (const p of contract.pages) {
      const n = NAV_ITEMS.find(i => i.pageKey === p.key);
      expect(n, `页面 ${p.key} 必须有导航项`).toBeTruthy();
      expect(n!.path).toBe(p.route);
      expect(n!.name).toBe(p.name);
      expect(n!.key).toBe(p.hotkey);
      expect(n!.icon).toBe(p.icon);
      expect(n!.group).toBe(p.group);
      expect(n!.minVer).toBe(p.minVer ?? undefined);
    }
  });

  it('组按 sort 升序、页面 group 引用均存在', () => {
    expect(NAV_GROUPS.map(g => g.id)).toEqual(
      [...contract.groups].sort((a, b) => a.sort - b.sort).map(g => g.id));
    const ids = NAV_GROUPS.map(g => g.id);
    for (const n of NAV_ITEMS) expect(ids).toContain(n.group);
  });
});
