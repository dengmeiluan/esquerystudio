/**
 * 天罗W6 P0：SystemView 结果网格整表换 QueryResultTable（QRT）。
 * 旧手写 cols+rows 网格（syKw 快滤+单击复制+a11y 排序）退役，kw 过滤职责归 QRT
 * 列筛选漏斗（等值/区间）与 Ctrl+F 结果内查找——旧 systemKwFilter.spec 随行为一并退役，
 * 本文件随迁锁定新终态：
 *   1) QRT 表格渲染 hits（表类 .qrt-tbl，行数=命中数），JSON 切换钮保留；
 *   2) 排序走键盘路径（th tabindex + Enter → aria-sort 翻转 + 行序变化）；
 *   3) 列筛选漏斗开合（弹层 teleport body；happy-dom 无法合成 Enter→click，
 *      打开走 click、关闭走 Esc 键盘路径；漏斗钮本身是原生 button=键盘可达）；
 *   4) 「复制整表 JSON」在（五百六十一批随迁：sy-res-bar 独立行退役——seg+复制钮寄居
 *      QRT #bar-prepend 工具行 + :hide-body 视图分档；宿主钮换内核 expose copyTableJson
 *      同函数快捷钮，文案随内核口径；spec 锚随迁 .qrt-bar .seg）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';

const HITS = [
  { _id: 'lock-1', _source: { lockKey: 'alpha-lock', holder: 'node-a', ttl: 30 } },
  { _id: 'lock-2', _source: { lockKey: 'beta-lock', holder: 'node-b', ttl: 20 } },
  { _id: 'lock-3', _source: { lockKey: 'gamma-lock', holder: 'node-c', ttl: 10 } },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      systemInspect: vi.fn(async () => ({ name: 'idx_lock', docCount: HITS.length })),
      systemQuery: vi.fn(async () => ({ total: HITS.length, took: 1, hits: HITS })),
    },
  };
});

/* Monaco 在 happy-dom 下起不来，且与本契约无关 */
vi.mock('../../components/MonacoEditor.vue', () => ({
  default: { name: 'MonacoEditor', props: ['modelValue'], template: '<div class="monaco-stub" />' },
}));

import SystemView from '../SystemView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountAt(hash: string) {
  location.hash = hash;
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: SystemView }],
  });
  const app = createApp({ render: () => h(SystemView) });
  app.use(createPinia());
  app.use(router);
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function bodyRows(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll('table.qrt-tbl tbody tr'))
    .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row')) as HTMLElement[];
}
const thOf = (host: HTMLElement, col: string) =>
  host.querySelector<HTMLTableCellElement>(`table.qrt-tbl thead th[data-col="${col}"]`);

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '';
});

describe('SystemView 结果表换 QRT（天罗W6）', () => {
  it('QRT 渲染 hits 全行；列=QRT hit 型标准（_id + _source 键）；空态文案随迁', async () => {
    const { app, host } = await mountAt('#/system');
    expect(host.querySelector('table.qrt-tbl'), '结果网格必须是 QRT（.qrt-tbl）').toBeTruthy();
    expect(bodyRows(host).length, '3 行命中全渲染').toBe(3);
    const cols = [...host.querySelectorAll('table.qrt-tbl thead th')].map(th => th.getAttribute('data-col'));
    expect(cols).toContain('_id');
    expect(cols).toContain('lockKey');
    expect(cols).toContain('ttl');
    /* 首列序号列无 data-col */
    expect(cols[0]).toBeNull();
    app.unmount();
  });

  it('排序键盘路径：th 聚焦后 Enter → aria-sort 出现且行序按 ttl 升序重排；再 Enter 翻转降序', async () => {
    const { app, host } = await mountAt('#/system');
    const th = thOf(host, 'ttl');
    expect(th, 'ttl 列头必须渲染').toBeTruthy();
    expect(th!.getAttribute('tabindex'), 'QRT 可排序列头键盘可达').toBe('0');
    /* 键盘路径：Enter 触发排序（QRT @keydown.enter → onSort） */
    th!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(th!.getAttribute('aria-sort')).toBe('ascending');
    expect(bodyRows(host)[0].textContent).toContain('gamma-lock');
    th!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(th!.getAttribute('aria-sort')).toBe('descending');
    expect(bodyRows(host)[0].textContent).toContain('alpha-lock');
    app.unmount();
  });

  it('列筛选漏斗：点击弹出值清单（teleport body）；勾选过滤行集；Esc 键盘路径关闭', async () => {
    const { app, host } = await mountAt('#/system');
    const funnel = [...host.querySelectorAll<HTMLButtonElement>('table.qrt-tbl thead .qrt-funnel')]
      .find(b => b.getAttribute('aria-label') === '筛选 holder 列');
    expect(funnel, 'holder 列漏斗钮必须渲染').toBeTruthy();
    expect(funnel!.tagName).toBe('BUTTON');
    funnel!.click();
    await settle(6);
    const pop = document.querySelector('.cfp');
    expect(pop, '漏斗弹出筛选层（teleport body）').not.toBeNull();
    expect(pop!.textContent).toContain('筛选「holder」');
    const vals = [...pop!.querySelectorAll('.cfp-val')].map(s => s.textContent?.trim());
    expect(vals).toEqual(['node-a', 'node-b', 'node-c']);
    /* 勾选 node-a → 只剩 lock-1 一行；漏斗 .on 高亮 */
    (pop!.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await settle(6);
    expect(bodyRows(host).length).toBe(1);
    expect(bodyRows(host)[0].textContent).toContain('alpha-lock');
    expect(funnel!.classList.contains('on')).toBe(true);
    /* Esc 键盘路径关闭弹层 */
    document.querySelector('.cfp-mask')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(4);
    expect(document.querySelector('.cfp')).toBeNull();
    app.unmount();
  });

  it('JSON 切换 seg 寄居 QRT 工具行（561 随迁）+ 复制整表 JSON 在；切 JSON 显高亮 pre，切回表格 QRT 仍在', async () => {
    const { app, host } = await mountAt('#/system');
    expect(host.textContent).toContain('复制整表 JSON');
    /* 561 随迁：seg 随 sy-res-bar 退役寄居 bar-prepend，工具行在 qrt-bar 内 */
    const segBtns = [...host.querySelectorAll<HTMLElement>('.qrt-bar .seg button')];
    segBtns.find(b => b.textContent?.trim() === 'JSON')!.click();
    await settle();
    expect(host.querySelector('pre.json-view'), 'JSON 视图保留').toBeTruthy();
    segBtns.find(b => b.textContent?.trim() === '表格')!.click();
    await settle();
    expect(host.querySelector('table.qrt-tbl'), '切回表格 QRT 仍在').toBeTruthy();
    app.unmount();
  });
});
