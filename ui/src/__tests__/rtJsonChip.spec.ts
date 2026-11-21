/**
 * W7·P1：长 JSON 单元格折叠预览 chip（RT+QRT 同款）。
 * 锁定：plain object 渲染「首键: 短预览 + {…}N 键」chip；预览截断但 title 恒 raw 全串
 * （铁律）；点击 chip=打开既有单元格详情弹窗（复用 detailOpen 通道，不引入第二套展开态）；
 * 数组/空对象/标量不出 chip（回落既有渲染）。
 * RT 挂载样板照抄 rtCellDetail；QRT 照抄 QueryResultTable.spec。
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

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 长 JSON 折叠预览 chip（W7）', () => {
  it('对象格渲染 chip：首键短预览+{…}N 键；预览截断但 title 恒 raw 全串', async () => {
    const obj = { longText: 'x'.repeat(300), b: 2, c: 3 };
    await mountTbl(ResultTable, {
      hits: [
        { _id: 'a', _source: { meta: obj, arr: [1, 2, 3], empty: {}, plain: 'str' } },
      ] as any[],
      total: 1, index: 'jc1',
    });
    const chips = [...host.querySelectorAll('.rt-json-chip')] as HTMLElement[];
    expect(chips.length, '仅 plain object 出 chip（数组/空对象/标量不出）').toBe(1);
    const chip = chips[0];
    expect(chip.textContent).toContain('longText:');
    expect(chip.textContent).toContain('{…}3 键');
    /* 预览短、title 全 */
    expect(chip.querySelector('.rt-json-chip-p')!.textContent!.length).toBeLessThan(40);
    expect(chip.getAttribute('title')).toBe(JSON.stringify(obj));
  });

  it('点击 chip=打开既有单元格详情弹窗（复用 detailOpen 通道）', async () => {
    const obj = { k1: 1, k2: 2, k3: { deep: true } };
    await mountTbl(ResultTable, {
      hits: [{ _id: 'a', _source: { meta: obj } }] as any[],
      total: 1, index: 'jc2',
    });
    const chip = host.querySelector('.rt-json-chip') as HTMLElement;
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    const modal = document.body.querySelector('.rt-d-meta') as HTMLElement | null;
    expect(modal, '点击 chip 应打开单元格详情弹层').toBeTruthy();
    expect(modal!.textContent).toContain('meta');
    expect(modal!.textContent).toContain('3 键');
    const tree = document.body.querySelector('.jtree');
    expect(tree!.textContent, '弹层树含完整对象').toContain('deep');
  });
});

describe('QRT 长 JSON 折叠预览 chip（W7）', () => {
  it('对象格 chip 同款；点击开 QRT 单元格详情弹窗；title 恒 raw', async () => {
    const obj = { longText: 'y'.repeat(300), b: 2 };
    await mountTbl(QueryResultTable, {
      hits: [{ _id: '1', _index: 'i', _source: { meta: obj, arr: [1] } }],
    });
    const chips = [...host.querySelectorAll('.rt-json-chip')] as HTMLElement[];
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('longText:');
    expect(chips[0].textContent).toContain('{…}2 键');
    expect(chips[0].getAttribute('title')).toBe(JSON.stringify(obj));
    chips[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    const modal = document.body.querySelector('.qrt-d-meta') as HTMLElement | null;
    expect(modal, '点击 chip 应打开 QRT 单元格详情弹层').toBeTruthy();
    expect(modal!.textContent).toContain('对象（2 键）');
  });
});
