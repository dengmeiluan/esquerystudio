/**
 * R130 一百七十五批：列头键盘菜单（键盘可达闭环——ContextMenu 键 / Shift+F10 打开列管理）。
 * 此前列管理只有右键入口，纯键盘用户不可达（th 虽可 focus 但只有排序键）。
 * 锁定：
 * 1) QRT：th 聚焦下 ContextMenu 键打开列管理菜单（.ccm 出现，含列管理项）；Shift+F10 同；
 *    普通键（Enter）不误开（排序路径不受影响）；
 * 2) RT：同款；
 * 3) enter/space 仍走排序（onColMenuKey 放行，排序键 .prevent 独立处理）。
 * 挂载样板照抄 rowNavActions（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
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
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

const keyOn = (th: Element, init: KeyboardEventInit) =>
  th.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
const menuOpen = () => document.querySelector('.ccm') !== null;

describe('列头键盘菜单（一百七十五批）', () => {
  it('QRT：ContextMenu 键打开列管理；Shift+F10 同；Enter 不误开', async () => {
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'ck1' });
    const th = [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes('name'))!;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); // 自检：右键路径通
    await tick();
    expect(menuOpen()).toBe(true);
    expect([...document.querySelectorAll('.ccm-it')].some(b => b.textContent?.includes('隐藏此列'))).toBe(true);
    (document.querySelector('.ccm-mask') as HTMLElement).click();
    await tick();
    expect(menuOpen()).toBe(false);
    keyOn(th, { key: 'ContextMenu' });
    await tick();
    expect(menuOpen()).toBe(true);
    (document.querySelector('.ccm-mask') as HTMLElement).click();
    await tick();
    keyOn(th, { key: 'F10', shiftKey: true });
    await tick();
    expect(menuOpen()).toBe(true);
    (document.querySelector('.ccm-mask') as HTMLElement).click();
    await tick();
    keyOn(th, { key: 'Enter' });
    await tick();
    expect(menuOpen()).toBe(false);
  });

  it('RT：ContextMenu 键打开列管理（含此列置首项）；enter 仍走排序不开菜单', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'ck-rt' });
    const th = [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes('name'))!;
    keyOn(th, { key: 'ContextMenu' });
    await tick();
    expect(menuOpen()).toBe(true);
    expect([...document.querySelectorAll('.ccm-it')].some(b => b.textContent?.includes('此列置首'))).toBe(true);
    (document.querySelector('.ccm-mask') as HTMLElement).click();
    await tick();
    /* enter：排序路径——菜单不开（点击排序三态由既有 spec 锁） */
    keyOn(th, { key: 'Enter' });
    await tick();
    expect(menuOpen()).toBe(false);
  });
});
