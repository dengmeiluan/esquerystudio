/**
 * 七百八十一批·件B：收藏夹大屏比例（用户实报「收藏夹在大屏电脑面前的比例不对」）。
 *
 * 病灶：.fv-list 单列全宽行——内容宽 1600px（≥1920 居中档）下单行过宽过扁，
 * 动作钮组与内容漂移两端，1~2 条收藏时整页稀疏（实报截图形态）。
 * 修法：≥1100 双列栅格（每列 ~760px 恢复卡身比例）；<1100 回落单列。
 * 纯 CSS（display grid + 媒体查询），勾选/过滤/HitNav/批量行为零变化。
 * 驱动：favorites 页型零后端 API（localStorage 直种，727 同源）+ 源码锁。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const favSrc = readFileSync(join(__dirname, '../views/FavoritesView.vue'), 'utf-8');
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

const FAV_KEY = 'esquerystudio.favorites.v1';
const apps: ReturnType<typeof createApp>[] = [];

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

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('七百八十一批·件B：收藏夹大屏双列栅格', () => {
  it('源码锁：.fv-list 双列 grid + 窄档回落单列（纯 CSS）', () => {
    const t = codeOf(favSrc);
    expect(t, '双列栅格').toMatch(/\.fv-list \{ display: grid; grid-template-columns: repeat\(2, 1fr\);/);
    expect(t, '窄档单列').toMatch(/@media \(max-width: 1100px\) \{[^}]*\.fv-list \{ grid-template-columns: 1fr; \}/);
    /* 旧单列 flex 形态退役（负锚） */
    expect(t).not.toMatch(/\.fv-list \{ display: flex; flex-direction: column;/);
  });

  it('行为零变化：双列下卡行结构/动作组/勾选框照常渲染', async () => {
    const host = await mountFav([
      { id: 'a', kind: 'dsl', title: '订单慢查询', ts: 1759300000000, payload: { body: '{}' } },
      { id: 'b', kind: 'rest', title: 'GET _cat/indices', ts: 1759300001000, payload: { method: 'GET', path: '/_cat/indices' } },
    ]);
    const list = host.querySelector('.fv-list')!;
    expect(list).toBeTruthy();
    const cards = list.querySelectorAll('.fv-card');
    expect(cards.length).toBe(2);
    /* 每卡内部结构保留：勾选框 + 内容 + 动作组（打开/复制/删除） */
    for (const c of cards) {
      expect(c.querySelector('input[type="checkbox"]')).toBeTruthy();
      expect(c.querySelector('.fv-card-l')).toBeTruthy();
      const acts = [...c.querySelectorAll('.fv-card-r button')].map(b => (b.textContent || '').trim() + (b.getAttribute('aria-label') || ''));
      expect(acts.join('|')).toContain('打开');
      expect(acts.join('|')).toContain('复制');
    }
  });
});
