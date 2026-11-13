/**
 * W7·P2：row-actions slot（消费方行级行动注入位）。
 * 锁定：RT 操作列 td 内注入（作用域插值 hit/ri 可用）；QRT 行尾格注入（row/ri）；
 * 无注入零占位（不渲染任何多余节点）。
 * RT 挂载样板照抄 rtDslCopy；QRT 照抄 QueryResultTable.spec。
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

async function mountTbl(comp: any, props: Record<string, any>, slots?: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props, slots) });
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

describe('RT row-actions slot（W7）', () => {
  const HITS: SearchHit[] = [
    { _id: 'a', _source: { name: 'banana' } },
    { _id: 'b', _source: { name: 'apple' } },
  ] as any;

  it('注入作用域插槽：每行操作列渲染自定义钮，hit/ri 作用域可用', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'rs1' }, {
      'row-actions': (p: any) => h('button', { class: 'x-act', 'data-id': p.hit._id, 'data-ri': String(p.ri) }, 'ACT'),
    });
    await tick();
    const acts = [...host.querySelectorAll('td.rt-act .x-act')] as HTMLElement[];
    expect(acts.length, '每行操作列一个注入钮').toBe(2);
    expect(acts[0].getAttribute('data-id')).toBe('a');
    expect(acts[1].getAttribute('data-ri')).toBe('1');
  });

  it('无注入零占位：操作列只有内建钮，无空壳占位节点', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'rs2' });
    await tick();
    expect(host.querySelector('.x-act')).toBeNull();
    /* 内建钮仍在（查看文档/行展开），无 slot 时无多余渲染 */
    const act = host.querySelector('td.rt-act') as HTMLElement;
    expect(act.querySelector('[aria-label="查看文档"]')).toBeTruthy();
    expect(act.querySelector('.rt-row-expand')).toBeTruthy();
  });
});

describe('QRT row-actions slot（W7）', () => {
  it('行尾格注入：row/ri 作用域可用；每行仅一份（不随单元格重复）', async () => {
    await mountTbl(QueryResultTable, { cols: ['a', 'b'], rows: [['x', 'y'], ['z', 'w']] }, {
      'row-actions': (p: any) => h('button', { class: 'x-act', 'data-ri': String(p.ri) }, `ROW:${p.row.length}`),
    });
    await tick();
    const acts = [...host.querySelectorAll('.x-act')] as HTMLElement[];
    expect(acts.length, '每行行尾一个注入钮').toBe(2);
    expect(acts[0].textContent).toBe('ROW:2');
    expect(acts[1].getAttribute('data-ri')).toBe('1');
    /* 注入钮落在行尾格内 */
    const lastCell = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td.qrt-cell')[1];
    expect(lastCell.querySelector('.x-act')).toBeTruthy();
  });

  it('无注入零占位', async () => {
    await mountTbl(QueryResultTable, { cols: ['a'], rows: [['x']] });
    await tick();
    expect(host.querySelector('.x-act')).toBeNull();
  });
});
