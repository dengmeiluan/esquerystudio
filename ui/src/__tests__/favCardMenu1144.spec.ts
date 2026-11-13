/**
 * 1144：收藏卡片右键。
 *
 * 收藏卡片此前只有右侧三个常驻钮（打开/复制/删除），没有任何右键能力；
 * 现与索引行/历史行/模板行同一件 CellContextMenu：
 * - 一级 4 项：打开（带去向名）+ 复制… / 选择… / 删除…
 * - 二级承接低频与批量动作，能力零删除（卡片常驻钮保持原样）
 * - 菜单挂在文档层（teleport），按坐标弹出；Esc/点遮罩关闭
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';

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
import { topLabels, topButtons, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

const FAV_KEY = 'esquerystudio.favorites.v1';
const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

const ITEMS = [
  { id: 'a', kind: 'dsl', title: '订单慢查询', ts: 1759300000000, payload: { body: '{}' } },
  { id: 'b', kind: 'rest', title: 'GET _cat/indices', ts: 1759300001000, payload: { method: 'GET', path: '/_cat/indices' } },
  { id: 'c', kind: 'sql', title: '按主体统计公告', ts: 1759300002000, tags: ['sql'], payload: { sql: 'SELECT 1' } },
];

async function mountFav(items = ITEMS) {
  localStorage.setItem(FAV_KEY, JSON.stringify(items));
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(FavoritesView) });
  app.use(createPinia());
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }] }));
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 12; i++) await nextTick();
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const cards = () => [...host.querySelectorAll('.fv-card')] as HTMLElement[];

async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 240, clientY: 180 }));
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1144 收藏卡片右键', () => {
  it('右键卡片弹出菜单，标题带收藏名，一级 4 项（打开 + 三个分组）', async () => {
    await mountFav();
    expect(menuRoot(), '未右键前不渲染菜单').toBeNull();
    await rightClick(cards()[0]);
    expect(menuRoot(), '菜单 teleport 到文档层').toBeTruthy();
    expect(document.querySelector('.ccm-hd')!.textContent).toContain('订单慢查询');
    const tops = topLabels();
    expect(tops.length, '一级不再平铺：4 项').toBe(4);
    /* 「打开」把去向写在标签里（收藏可能落到查询工作台/Dev Tools/REST…） */
    expect(tops[0]).toContain('打开（查询工作台 · DSL）');
    expect(tops.slice(1)).toEqual(['复制…', '选择…', '删除…']);
  });

  it('二级承接低频动作且能力零删除（复制/勾选/删除 + 批量）', async () => {
    await mountFav();
    await rightClick(cards()[1]);
    expect(await openGroup('复制…')).toBe(true);
    let subs = subButtons().map(b => (b.textContent ?? '').trim());
    expect(subs).toEqual(['复制内容', '复制标题']);
    expect(await openGroup('选择…')).toBe(true);
    subs = subButtons().map(b => (b.textContent ?? '').trim());
    expect(subs[0]).toBe('勾选此项');
    expect(subs[1], '多条可见时给批量勾选').toBe('勾选当前 3 条');
    expect(await openGroup('删除…')).toBe(true);
    subs = subButtons().map(b => (b.textContent ?? '').trim());
    expect(subs).toEqual(['删除此条收藏']);
  });

  it('勾选动作真实生效（与卡片勾选框同一状态源）', async () => {
    await mountFav();
    await rightClick(cards()[0]);
    expect(await clickMenuItem('勾选此项')).toBe(true);
    await tick();
    expect(menuRoot(), '点项后关菜单').toBeNull();
    expect(cards()[0].classList.contains('fv-sel'), '卡片进入选中态').toBe(true);
    expect((cards()[0].querySelector('.fv-chk') as HTMLInputElement).checked, '勾选框同步').toBe(true);
    /* 再右键同一张卡：文案翻成「取消勾选」（状态即所见） */
    await rightClick(cards()[0]);
    await openGroup('选择…');
    expect(subButtons().map(b => (b.textContent ?? '').trim())).toContain('取消勾选');
  });

  it('有其他选中项时给批量删除、勾选动作按当前过滤集计数', async () => {
    await mountFav();
    /* 先经卡片勾选框选中两条 */
    (cards()[0].querySelector('.fv-chk') as HTMLInputElement).click();
    (cards()[1].querySelector('.fv-chk') as HTMLInputElement).click();
    await tick();
    await rightClick(cards()[2]);
    await openGroup('删除…');
    const subs = subButtons().map(b => (b.textContent ?? '').trim());
    expect(subs).toEqual(['删除此条收藏', '删除选中的 2 条']);
  });

  it('Esc 与点遮罩都能关掉菜单（不误触卡片动作）', async () => {
    await mountFav();
    await rightClick(cards()[0]);
    expect(menuRoot()).toBeTruthy();
    (menuRoot() as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(menuRoot(), 'Esc 关闭').toBeNull();
    await rightClick(cards()[1]);
    (menuRoot() as HTMLElement).click();
    await tick();
    expect(menuRoot(), '点遮罩关闭').toBeNull();
    expect(topButtons().length).toBe(0);
  });
});
