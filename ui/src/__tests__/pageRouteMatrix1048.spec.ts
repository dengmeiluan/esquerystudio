import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, pageDeniedRedirect } from '../router';

/* 1048：逐页路由矩阵回归（与产线 /auth/permissions 53 页矩阵同口径）。
   零授权身份所有页面路由必须进 forbidden；全读授权身份所有页面路由必须可达。
   写按钮的真值由后端 pagePermissions 与 canPage 锁定，本用例只锁“页面入口”。 */
describe('1048 逐页路由矩阵', () => {
  it('53 个页面路由：零授权全部拒绝并带正确 page key', () => {
    expect(NAV_ITEMS.length).toBe(53);
    for (const item of NAV_ITEMS) {
      const re = pageDeniedRedirect([], item.path, 'host', undefined, 'VIEWER');
      expect(re, item.path + ' 零授权必须拒绝').not.toBeNull();
      expect(re!.path).toBe('/forbidden');
      expect(re!.query.page).toBe(item.pageKey);
    }
  });

  it('53 个页面路由：全读授权（host+conn 前缀）全部可达', () => {
    const grants: string[] = [];
    for (const item of NAV_ITEMS) {
      grants.push('conn:host:' + item.pageKey, 'conn:prod:' + item.pageKey);
    }
    for (const item of NAV_ITEMS) {
      expect(pageDeniedRedirect(grants, item.path, 'prod', undefined, 'VIEWER'),
        item.path + ' 全读授权应可达').toBeNull();
    }
  });
});
