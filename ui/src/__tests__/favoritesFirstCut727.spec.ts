/**
 * 七百二十七批：Favorites 三小刀（R108；R106 裁决表 G86+G87+G88，⑥726 头号建议）。
 *
 * ① G86（P3 死代码）页头左组/右钮组两条死规则删——PageHeader 合并后第十批删
 *    -hd-ic/-hd-tt/-hd-sub 三类时同族漏删（模板 0 引用；713 G53/715 G56/717 G61 同族）。
 * ② G87（P3 铁律 F）卡片 meta 时间戳段补段级中文 tip「收藏时间」——值段裸时间戳
 *    无任何语义说明（715 G55/717 G60/721 G74/724 G79 同族；tip 走 :title 悬停通道
 *    +MetaStrip help 档 cursor:help，备注不进可见文本）。
 * ③ G88（P3 可见性）route 类收藏 fv-dest「→ 视图跳转」不具名——replayTarget route
 *    分支返回泛化 label 而 payload.path 才是真去向（replayFavorite 直推 p.path），
 *    R56「重放去向前置可见」在 route 类断链（其他类均具名：查询工作台 · DSL 等）；
 *    修法=label 按 NAV_ITEMS 契约（esquerystudio-pages.json 唯一事实源）映射具体视图名，
 *    缺 path/未收录路径回落泛化「视图跳转」。
 *
 * 驱动方式照 favorites 页型零后端 API（localStorage 直种）+ 721/724 三段式
 * （tip 行为双读 + 源码锁 + 渲染负锚）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* api 壳 mock（本页零后端 API，防 store 初始化链上真实 fetch） */
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import FavoritesView from '../views/FavoritesView.vue';
import { NAV_ITEMS } from '../router';

const FAV_KEY = 'esquerystudio.favorites.v1';
const apps: ReturnType<typeof createApp>[] = [];

/* 挂载 favorites（localStorage 直种 store 初始化读）并渲染出卡片列表 */
async function mountFav(items: any[]): Promise<HTMLElement> {
  localStorage.setItem(FAV_KEY, JSON.stringify(items));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(FavoritesView) });
  app.use(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }] });
  app.use(router);
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 12; i++) await nextTick();
  return host;
}

/* 时间戳值段：.fv-card-meta 下首个非 text 段（fvCardMeta 首段即时间戳，text 段是 tag） */
function tsSeg(host: HTMLElement): HTMLElement | null {
  return host.querySelector('.fv-card-meta .ms-i');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('G87 时间戳段中文 tip（铁律 F）', () => {
  it('时间戳段 title=收藏时间 + help 档（cursor:help 悬停可达）', async () => {
    const host = await mountFav([{ id: 'a', kind: 'dsl', title: 'T1', ts: 1759300000000, payload: { body: '{}' } }]);
    const seg = tsSeg(host);
    expect(seg).toBeTruthy();
    expect(seg!.getAttribute('title')).toBe('收藏时间');
    expect(seg!.className).toContain('help');
  });

  it('备注不进可见文本（时间戳段只渲染时间值，零中文泄漏）', async () => {
    const host = await mountFav([{ id: 'a', kind: 'dsl', title: 'T1', ts: 1759300000000, payload: { body: '{}' } }]);
    expect(tsSeg(host)!.textContent).not.toContain('收藏时间');
    expect(tsSeg(host)!.textContent!.trim().length).toBeGreaterThan(0);
  });
});

describe('G88 route 类去向前置可见（R56 兑现）', () => {
  it('route 收藏按 payload.path 映射契约视图名（fv-dest 具名，非泛化「视图跳转」）', async () => {
    const host = await mountFav([{ id: 'r1', kind: 'route', title: '拓扑页', ts: 1759300000000, payload: { path: '/topology' } }]);
    const dest = host.querySelector('.fv-dest');
    expect(dest).toBeTruthy();
    /* 契约名（NAV_ITEMS /topology → 拓扑）——与其他类「查询工作台 · DSL」同语义具名 */
    const nav = NAV_ITEMS.find(n => n.path === '/topology');
    expect(nav).toBeTruthy();
    expect(dest!.textContent).toContain(nav!.name);
    expect(dest!.textContent).not.toContain('视图跳转');
  });

  it('route 缺 path 回落泛化「视图跳转」（损坏数据不具假名）', async () => {
    const host = await mountFav([{ id: 'r2', kind: 'route', title: '坏收藏', ts: 1759300000000, payload: {} }]);
    expect(host.querySelector('.fv-dest')!.textContent).toContain('视图跳转');
  });

  it('其他类 label 零回归（dsl 卡仍「查询工作台 · DSL」+ .fv-hd 页头壳活锚在场）', async () => {
    const host = await mountFav([{ id: 'a', kind: 'dsl', title: 'T1', ts: 1759300000000, payload: { body: '{}' } }]);
    expect(host.querySelector('.fv-dest')!.textContent).toContain('查询工作台 · DSL');
    expect(host.querySelector('.fv-hd')).toBeTruthy();
  });
});

describe('源码锁（G86 死规则退役 + G87/G88 字面在场）', () => {
  const SRC = join(__dirname, '..');
  const viewSrc = readFileSync(join(SRC, 'views/FavoritesView.vue'), 'utf-8');
  const replaySrc = readFileSync(join(SRC, 'utils/favReplay.ts'), 'utf-8');

  it('G86：页头左右组两条死规则零残留（转述注记可在，规则体不在）', () => {
    /* 选择器形态锁：.fv-hd- 紧跟 l/r 的规则声明（-ic/-tt/-sub 第十批已删，补 l/r） */
    expect(viewSrc).not.toMatch(/\.fv-hd-(l|r)\s*\{/);
    /* 活锚保留：页头壳 .fv-hd（PageHeader 外距/分隔）不受本刀影响 */
    expect(viewSrc).toMatch(/\.fv-hd\s*\{/);
  });

  it('G87+G88：tip 字面与契约映射字面在源码在场', () => {
    expect(viewSrc).toMatch(/tip:\s*'收藏时间'/);
    expect(replaySrc).toMatch(/NAV_ITEMS\.find/);
    expect(replaySrc).toMatch(/视图跳转/);
  });
});
