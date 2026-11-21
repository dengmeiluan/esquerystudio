/**
 * 天罗W6 P2：MatchMatrixView 矩阵表补表头排序 + 表格 max-height 归档 --vh-offset 口径。
 * 五百三十二批反转：矩阵裸表换壳 QRT rows 型——本文件锚同步迁新形态：
 * 1) _id/得分列头排序归 QRT 内核（同键翻转/换键重置；二百二十七批 M2 起升序，
 *    键盘路径 Enter/Space 触发 + aria-sort 由内核渲染）；
 * 2) 子句列（✔/·）随内核一并可排（旧手写壳「子句列不挂排序」差异随壳退役）；
 * 3) 统计条 clauseStats 仍按全量 hits 计（排序不改统计——内核排序不动宿主 hits）；
 * 4) 源码锁：max-height 走 var(--vh-offset) token（裸 420px 不回潮，迁 max-height
 *    prop）+ mm-tbl/useTableSort 退役不回潮 + 冻结左两列播种 + xray 下钻 carry。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HITS = [
  { _id: 'doc-a', _score: 1.5, matched_queries: ['q1'] },
  { _id: 'doc-b', _score: 3.0, matched_queries: [] },
  { _id: 'doc-c', _score: 2.0, matched_queries: ['q1', 'q2'] },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      searchRaw: vi.fn(async () => ({ hits: { hits: HITS }, hits_total: { value: 3 } })),
    },
  };
});

/* JsonArea 内嵌 Monaco，happy-dom 起不来且与本契约无关 */
vi.mock('../../components/JsonArea.vue', () => ({
  default: { name: 'JsonArea', props: ['modelValue'], template: '<div class="ja-stub" />' },
}));

import MatchMatrixView from '../MatchMatrixView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountMm() {
  location.hash = '#/match-matrix?idx=t1';
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: MatchMatrixView }],
  });
  const app = createApp({ render: () => h(MatchMatrixView) });
  app.use(createPinia());
  app.use(router);
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* QRT rows 型：数据行=排除 nomatch/截断行；_id 格=行内首个业务格（序号列后） */
const dataRows = (host: HTMLElement) =>
  [...host.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
const rowIds = (host: HTMLElement) =>
  dataRows(host).map(tr => tr.querySelector('td.qrt-cell')?.textContent?.trim());
const thOf = (host: HTMLElement, kw: string) =>
  [...host.querySelectorAll<HTMLTableCellElement>('table.qrt-tbl thead th')].find(th => th.textContent?.includes(kw));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '';
});

describe('MatchMatrix 矩阵表排序（天罗W6 立；532 换壳 QRT 内核随迁）', () => {
  it('跑矩阵出表（默认 ES 返回序）；得分列键盘 Enter → 升序起步（内核 227 批 M2 口径）+ aria-sort', async () => {
    const { app, host } = await mountMm();
    const runBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('跑矩阵'));
    expect(runBtn, '跑矩阵钮必须渲染').toBeTruthy();
    expect(runBtn!.disabled, 'index 已由 ?idx=t1 注入，按钮可用').toBe(false);
    runBtn!.click();
    await settle(8);
    expect(rowIds(host), '默认 ES 返回序').toEqual(['doc-a', 'doc-b', 'doc-c']);
    const th = thOf(host, '得分');
    expect(th, '得分列头必须渲染').toBeTruthy();
    expect(th!.getAttribute('tabindex')).toBe('0');
    /* 键盘路径：Enter 触发排序（内核升序起步） */
    th!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(th!.getAttribute('aria-sort')).toBe('ascending');
    expect(rowIds(host), '升序：1.5 → 2.0 → 3.0').toEqual(['doc-a', 'doc-c', 'doc-b']);
    th!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(th!.getAttribute('aria-sort')).toBe('descending');
    expect(rowIds(host), '降序：3.0 → 2.0 → 1.5').toEqual(['doc-b', 'doc-c', 'doc-a']);
    app.unmount();
  });

  it('_id 列可排序；排序不改统计条（clauseStats 仍按全量 hits 计）', async () => {
    const { app, host } = await mountMm();
    const runBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('跑矩阵'));
    runBtn!.click();
    await settle(8);
    const statsBefore = [...host.querySelectorAll('.mm-stat b')].map(b => b.textContent);
    const th = thOf(host, '_id');
    expect(th, '_id 列头必须渲染').toBeTruthy();
    th!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(rowIds(host), '_id 升序').toEqual(['doc-a', 'doc-b', 'doc-c']);
    th!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(rowIds(host), '_id 降序').toEqual(['doc-c', 'doc-b', 'doc-a']);
    expect([...host.querySelectorAll('.mm-stat b')].map(b => b.textContent), '统计不随排序变化').toEqual(statsBefore);
    app.unmount();
  });

  it('源码锁：max-height 归档 --vh-offset 迁 QRT prop（裸 420px 不回潮）+ mm-tbl/useTableSort 退役 + 冻结播种 + xray 下钻', () => {
    const src = readFileSync(join(__dirname, '../MatchMatrixView.vue'), 'utf-8');
    expect(src).toMatch(/max-height="calc\(100vh - var\(--vh-offset\) - 210px\)"/);
    expect(src).not.toContain('calc(100vh - 420px)');
    expect(src, '手写 mm-tbl 裸表不回潮').not.toMatch(/<table class="mm-tbl"/);
    expect(src).not.toContain("from '../composables/tableSort'");
    /* 冻结左两列：首访播种 es_tbl_freeze_n:mm=2（用户显式取消后不代劳），内核 sticky 承接旧行为 */
    expect(src).toContain("localStorage.getItem('es_tbl_freeze_n:mm') == null");
    /* _id 下钻：useLinkCarry('xray') 现成键（{index,id} 与 DslQueryView 发送侧同构） */
    expect(src).toContain("useLinkCarry<{ index: string; id: string }>('xray')");
    expect(src).toContain("router.push('/query-xray')");
  });
});
