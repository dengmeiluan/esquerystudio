/* ESQueryStudio 功能包：契约完整性 + 运行时裁剪语义。
 * 功能包是部署选择，不是权限；纯函数测试钉死「默认全开 / 显式收敛 / 单页排除 / 坏响应回落」。 */
import { describe, expect, it } from 'vitest';
import {
  PACKS, PAGES, GROUP_TO_PACK,
  defaultUiConfig, normalizeUiConfig,
  isGroupEnabled, isPageEnabled, isRouteEnabled,
  firstRouteOfPack, pageCountOfPack, packOfPage,
} from '../utils/uiConfig';

describe('功能包契约', () => {
  it('11 个包覆盖全部 13 组，页面数合计 53', () => {
    expect(PACKS.length).toBe(11);
    expect(PAGES.length).toBe(53);
    const assigned = new Set<string>();
    let pages = 0;
    for (const pack of PACKS) {
      for (const group of pack.groups) {
        expect(assigned.has(group), `分组被多个包声明: ${group}`).toBe(false);
        assigned.add(group);
        pages += PAGES.filter(p => p.group === group).length;
      }
    }
    expect(assigned.size).toBe(13);
    expect(pages).toBe(53);
    expect(pageCountOfPack(PACKS.find(p => p.id === 'lifecycle')!)).toBe(8);
    expect(pageCountOfPack(PACKS.find(p => p.id === 'observe')!)).toBe(9);
    expect(packOfPage('security')!.id).toBe('security');
    expect(packOfPage('overview')!.id).toBe('platform');
  });

  it('默认全开：产品身份与每个包的启用态', () => {
    const cfg = defaultUiConfig();
    expect(cfg.product.name).toBe('ESQueryStudio');
    expect(cfg.product.integrationId).toBe('generic');
    expect(cfg.packs.every(p => p.enabled)).toBe(true);
    expect(isPageEnabled(cfg, 'overview')).toBe(true);
    expect(isPageEnabled(cfg, 'devtools')).toBe(true);
  });
});

describe('运行时功能包裁剪', () => {
  it('只启用 platform + security：其余页面/路由关闭', () => {
    const cfg = normalizeUiConfig({
      product: { name: 'Acme Search', integrationId: 'acme', integrationName: 'Acme' },
      packs: PACKS.map(p => ({ id: p.id, enabled: p.id === 'platform' || p.id === 'security' })),
      disabledPages: [],
    });
    expect(cfg.product.name).toBe('Acme Search');
    expect(isGroupEnabled(cfg, 'core')).toBe(true);
    expect(isGroupEnabled(cfg, 'security')).toBe(true);
    expect(isPageEnabled(cfg, 'security')).toBe(true);
    expect(isPageEnabled(cfg, 'search')).toBe(false);
    expect(isPageEnabled(cfg, 'adhoc-rebuild')).toBe(false);
    expect(isRouteEnabled(cfg, '/search')).toBe(false);
    expect(isRouteEnabled(cfg, '/module-off')).toBe(true);
    /* 非页面路由不能被误判为停用 */
    expect(isRouteEnabled(cfg, '/forbidden')).toBe(true);
  });

  it('单页排除在功能包之上生效；未知 key 忽略', () => {
    const cfg = normalizeUiConfig({
      packs: PACKS.map(p => ({ id: p.id, enabled: true })),
      disabledPages: ['security', 'no-such-page'],
    });
    expect(isPageEnabled(cfg, 'security')).toBe(false);
    expect(isRouteEnabled(cfg, '/security')).toBe(false);
    expect(cfg.disabledPages).toEqual(['security']);
  });

  it('后端只回子集时，未出现的包按未启用处理', () => {
    const cfg = normalizeUiConfig({ packs: [{ id: 'platform', enabled: true }] });
    expect(isPageEnabled(cfg, 'overview')).toBe(true);
    expect(isPageEnabled(cfg, 'search')).toBe(false);
    expect(isPageEnabled(cfg, 'security')).toBe(false);
  });

  it('坏响应/空响应回落全开，不让导航消失', () => {
    for (const raw of [null, undefined, 'oops', 42, {}, { packs: [] }]) {
      const cfg = normalizeUiConfig(raw);
      expect(cfg.packs.length).toBe(11);
      expect(cfg.packs.every(p => p.enabled)).toBe(true);
      expect(isPageEnabled(cfg, 'overview')).toBe(true);
    }
  });

  it('firstRouteOfPack 只返回启用包内、未被单页排除的页面', () => {
    const cfg = normalizeUiConfig({
      packs: PACKS.map(p => ({ id: p.id, enabled: p.id === 'lifecycle' })),
      disabledPages: ['adhoc-rebuild'],
    });
    const first = firstRouteOfPack(cfg, 'lifecycle');
    expect(first).toBeTruthy();
    expect(first!.key).not.toBe('adhoc-rebuild');
    expect(firstRouteOfPack(cfg, 'platform')).toBeUndefined();
  });
});
