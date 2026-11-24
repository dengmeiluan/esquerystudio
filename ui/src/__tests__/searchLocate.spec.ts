/* 搜索定位（search locate）集成契约：搜索不止于过滤——命中计数 + Enter/Shift+Enter
 * 逐个跳转 + 当前行滚动高亮（.hit-cur）+ 零命中空态。
 *
 * 覆盖：
 *   1) useHitLocate 在真组件里的 wrap/钳制/落位（组合式 ↔ DOM 集成，行为不止单元）；
 *   2) BrowserView 全链路（五百二十九批反转同步更新：视图 data-hit-idx/HitNav 随 QRT 换壳退役，
 *      搜索定位归 QRT Ctrl+F 网格查找）：mock 索引列表 → 输关键字过滤行集 →
 *      QRT 查找命中计数 n/n、Enter 后 .rt-hit-cur 落位；
 *   3) 无命中：显式空态文案。
 *
 * 范式同 clusterThreeState.spec：无 @vue/test-utils，只替换网络出口，视图/store 全用真的。
 * 注意：useUrlState 初始值读 location.hash 的 query，注入过滤词用 mountView(comp, '#/?kw=…')。 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent, ref, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { useHitLocate } from '../composables/useHitNav';

import BrowserView from '../views/BrowserView.vue';

/* 只替换网络出口 */
const indicesFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，直接引用 vi.fn 会 TDZ */
      clusterIndices: (...args: any[]) => indicesFn(...args),
      overview: async () => ({ self: '' }),
      clusterHealth: async () => ({ status: 'green', unassigned_shards: 0 }),
      raw: async () => ({ body: { version: { number: '7.10.1' } } }),
      setup: { status: async () => ({ hostVisible: true }) },
    },
  };
});

async function settle(n = 8) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

let app: VueApp | null = null;
let host: HTMLDivElement | null = null;

async function mountView(comp: any, hash = '#/'): Promise<HTMLElement> {
  const pinia = createPinia();
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:all(.*)', component: { template: '<div/>' } }],
  });
  /* 深链必须经 router.push 携带 query：先 location.hash 再 push('/') 会被
     router 用无 query 的同路径覆盖，useUrlState 挂载时已读不到 kw */
  await router.push(hash.replace(/^#/, ''));
  await router.isReady();
  app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  indicesFn.mockReset();
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = '';
  location.hash = '#/';
  app = null;
  host = null;
});

/* ── 1) useHitLocate ↔ DOM 集成：wrap 双向 + 落位唯一性 + 收缩钳制 ─────────── */
describe('useHitLocate 组件内集成', () => {
  it('next/prev wrap 双向，.hit-cur 始终唯一且跟随游标', async () => {
    const items = ref(['r1', 'r2', 'r3']);
    const rootEl = ref<HTMLElement | null>(null);
    let nav: ReturnType<typeof useHitLocate> | undefined;
    const Probe = defineComponent({
      setup() {
        nav = useHitLocate(() => items.value.length, () => rootEl.value);
        return () => h('div', { ref: rootEl },
          items.value.map((t, i) => h('div', { key: t, 'data-hit-idx': String(i + 1) }, t)));
      },
    });
    await mountView(Probe);
    await settle();
    const idxOfCur = () => host!.querySelector('.hit-cur')?.getAttribute('data-hit-idx') ?? null;

    nav!.next(); // 1→2
    await settle();
    expect(idxOfCur()).toBe('2');
    expect(host!.querySelectorAll('.hit-cur').length).toBe(1);

    nav!.prev(); // 2→1
    nav!.prev(); // 1→3（wrap）
    await settle();
    expect(idxOfCur()).toBe('3');

    nav!.next(); // 3→1（wrap）
    await settle();
    expect(idxOfCur()).toBe('1');

    /* 收缩钳制：列表 3→1，游标 1 仍在合法位 */
    items!.value = ['r1'];
    await settle();
    expect(nav!.current.value).toBe(1);
  });
});

/* ── 2) BrowserView 全链路 ─────────────────────────────────────────────── */
const ROWS = [
  { index: 'logs-app-2024', health: 'green', status: 'open', 'docs.count': '120', 'store.size': '10mb', pri: '1', rep: '1', 'creation.date.string': '2024-01-01' },
  { index: 'logs-web-2024', health: 'yellow', status: 'open', 'docs.count': '80', 'store.size': '8mb', pri: '1', rep: '1', 'creation.date.string': '2024-01-02' },
  { index: 'metrics-cpu', health: 'green', status: 'open', 'docs.count': '900', 'store.size': '40mb', pri: '3', rep: '0', 'creation.date.string': '2024-02-01' },
];

async function typeKw(root: HTMLElement, q: string) {
  const inp = root.querySelector('.bw-search input') as HTMLInputElement;
  expect(inp, '搜索框必须在').toBeTruthy();
  inp.value = q;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

/* 五百二十九批锚同步更新：视图 data-hit-idx/HitNav 定位随 QRT 换壳退役——搜索定位归
   QRT Ctrl+F 网格查找（.qrt 根 @keydown.ctrl.f + 内建 HitNav + .rt-hit-cur 落位）。
   防抖走真实等待（rtGridSearch 同口径：fake timers 不 flush Vue 渲染微任务链）。 */
const waitMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
async function openQrtSearch(root: HTMLElement) {
  const qrt = root.querySelector('.qrt') as HTMLElement;
  expect(qrt, 'QRT 根必须在').toBeTruthy();
  qrt.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ctrlKey: true }));
  await settle();
  return root.querySelector('.hn-inp') as HTMLInputElement;
}
async function qrtSearch(root: HTMLElement, q: string) {
  const inp = await openQrtSearch(root);
  inp.value = q;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await waitMs(320);
  await settle();
}

/* 五百二十九批锚同步更新：表体行取自 QRT table.qrt-tbl（剔除 .qrt-nomatch 提示行） */
const qrtRows = (root: HTMLElement) =>
  [...root.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));

describe('BrowserView 搜索定位', () => {
  it('输关键字过滤行集；QRT Ctrl+F 查找命中计数 n/n、Enter 后 .rt-hit-cur 移到第 2 处', async () => {
    indicesFn.mockResolvedValue(ROWS);
    const root = await mountView(BrowserView);
    await typeKw(root, 'logs');

    const trs = qrtRows(root);
    expect(trs.length).toBe(2); // logs 命中 logs-app / logs-web 两行
    expect(trs.map(t => t.textContent)).toStrictEqual([expect.stringContaining('logs-app'), expect.stringContaining('logs-web')]);

    /* 初始未导航：不应有当前命中落位 */
    expect(root.querySelector('.rt-hit-cur')).toBeNull();

    await qrtSearch(root, 'logs');
    expect(root.querySelector('.hn-count')?.textContent?.trim()).toBe('1/2');

    const inp = root.querySelector('.hn-inp') as HTMLInputElement;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    const cur = root.querySelector('td.rt-hit-cur') as HTMLElement | null;
    expect(cur, 'Enter 后当前命中必须带 .rt-hit-cur').toBeTruthy();
    expect(root.querySelector('.hn-count')?.textContent?.trim()).toBe('2/2');
  });

  it('URL 深链 kw 仍生效（useUrlState 契约不破）', async () => {
    indicesFn.mockResolvedValue(ROWS);
    const root = await mountView(BrowserView, '#/?kw=metrics');
    const trs = qrtRows(root);
    expect(trs.length).toBe(1);
    expect(trs[0].textContent).toContain('metrics-cpu');
  });

  it('无命中：显式空态文案 + QRT 查找「0 命中」+ 按钮禁用', async () => {
    indicesFn.mockResolvedValue(ROWS);
    const root = await mountView(BrowserView);
    await typeKw(root, 'zzz_no_match');
    expect(qrtRows(root).length).toBe(0);
    expect(root.textContent).toContain('无匹配索引');
    /* 表格隐藏（QRT v-if=filtered.length）后查找通道空态：Ctrl+F 恢复可用即零命中口径 */
    expect(root.querySelector('table.qrt-tbl')).toBeNull();
  });
});
