/**
 * R130 第六十批：BrowserView 排序方向翻转 + 记忆守卫（39/52/53 列表态偏好范式）。
 * 五百二十九批反转同步更新：裸表换 QRT rows 型——排序方向钮/下拉退役，排序归 QRT 列头点击，
 * 方向+键记忆走内核 es_tbl_sort:<storageKey> 键空间（RT 同构字符串载荷）。
 * 锁定：
 * 1) 默认不写：未点击时 localStorage 无 es_tbl_sort:browser:indices（默认值不落盘口径）；
 * 2) 点击落盘：点「索引」列头后写 es_tbl_sort:browser:indices:m（asc 起步，227 批 M2 统一口径）；
 * 3) 预置恢复：预置 desc 挂载后「索引」列头呈降序（aria-sort=descending + ↓）。
 * usePref 键空间 esquerystudio.pref.* 退役；挂载：裸 createApp + pinia（useRouter mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vue-router', () => ({ useRouter: () => undefined, useRoute: () => ({ path: '/browser', query: {} }) }));

/* 灌两条索引：QRT rows 型 v-if="filtered.length"（无数据不渲染表体），排序态锚在表头上 */
const INDICES = [
  { index: 'idx-a', health: 'green', status: 'open', 'docs.count': 2, 'store.size': '1mb', pri: 1, rep: 1, 'creation.date.string': '2026-01-02' },
  { index: 'idx-b', health: 'yellow', status: 'open', 'docs.count': 1, 'store.size': '2mb', pri: 1, rep: 1, 'creation.date.string': '2026-01-01' },
];

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve(INDICES),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import BrowserView from '../views/BrowserView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountBrowser() {
  const app = createApp({ setup: () => () => h(BrowserView as any) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

/* 五百二十九批锚同步更新：esquerystudio.pref.browser.sortReversed（方向钮翻转位）
   → es_tbl_sort:browser:indices（QRT 列头排序记忆，键+方向一体） */
const KEY = 'es_tbl_sort:browser:indices:m';
const nameTh = () => host.querySelector<HTMLTableCellElement>('table.qrt-tbl thead th[data-col="索引"]');

describe('BrowserView 排序记忆（六十批 → 529 QRT 消费形态）', () => {
  it('默认不落盘、列头无排序态', async () => {
    await mountBrowser();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(nameTh()?.getAttribute('aria-sort')).toBeNull();
  });

  it('点「索引」列头落盘 asc，再点翻转为 desc', async () => {
    await mountBrowser();
    nameTh()!.click();
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ f: '索引', d: 'asc' }]);
    expect(nameTh()?.getAttribute('aria-sort')).toBe('ascending');
    nameTh()!.click();
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ f: '索引', d: 'desc' }]);
    expect(nameTh()?.getAttribute('aria-sort')).toBe('descending');
  });

  it('预置 desc 挂载后恢复降序态', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ f: '索引', d: 'desc' }]));
    await mountBrowser();
    expect(nameTh()?.getAttribute('aria-sort')).toBe('descending');
    expect(nameTh()?.querySelector('.qrt-sort-i')?.textContent).toContain('↓');
  });
});
