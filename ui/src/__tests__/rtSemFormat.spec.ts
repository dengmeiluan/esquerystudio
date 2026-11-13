/**
 * W7·P1：单元格语义类型渲染（RT+QRT 同口径）。
 * 锁定：① date 类型字段 ISO 串→本地「YYYY-MM-DD HH:mm:ss」（epoch 毫秒走既有通道）；
 * ② 数值列 fmtNum 千分位（右对齐经既有 num-col 类）；③ ip 列等宽（ip-col 类）；
 * 列头菜单「语义格式化」开关默认开、usePref 全局键 es_tbl_sem 记忆；
 * 铁律：title 恒 raw 原文（格式化只动显示层）。
 * RT 挂载样板照抄 rtDslCopy；QRT 照抄 QueryResultTable.spec。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toggleViewSwitch, viewSwitch, openViewMenu } from './helpers/viewSwitch'; /* 1143 */
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

const LOCAL_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

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
const menuItem = (label: string) =>
  [...document.body.querySelectorAll('.ccm-it') as any].find(b => b.textContent?.includes(label));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 语义格式化（W7 es_tbl_sem）', () => {
  const HITS: SearchHit[] = [
    { _id: 'a', _source: { created: '2024-03-05T10:20:30Z', price: 1234567, ip: '10.0.0.7', note: 'plain' } },
  ] as any;
  const TYPES = { created: 'date', price: 'long', ip: 'ip' };

  function cellByCol(col: string): HTMLElement {
    return [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === col) as HTMLElement;
  }

  it('date 类型 ISO 串→本地格式；数值列千分位；ip 列挂等宽类；title 恒 raw', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 1, index: 'sf1', fieldTypes: TYPES });
    const created = cellByCol('created');
    expect(created.textContent?.trim()).toMatch(LOCAL_RE);
    expect(created.textContent, '不应再是 ISO 原串').not.toContain('T');
    expect(cellByCol('price').textContent?.trim()).toBe('1,234,567');
    expect(cellByCol('price').classList.contains('num-col'), '数值列右对齐经既有 num-col').toBe(true);
    expect(cellByCol('ip').classList.contains('ip-col'), 'ip 列应挂等宽类').toBe(true);
    expect(cellByCol('note').classList.contains('ip-col')).toBe(false);
    /* 铁律：title 恒 raw 原文 */
    expect(created.getAttribute('title')).toBe('2024-03-05T10:20:30Z');
    expect(cellByCol('price').getAttribute('title')).toBe('1234567');
  });

  it('列头菜单开关：关→回落原样显示；落盘 esquerystudio.pref.es_tbl_sem；新实例读盘保持关', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 1, index: 'sf2', fieldTypes: TYPES });
    /* 1143：语义格式化已归位工具行「视图 ⋯」（不再需要先开列头菜单） */
    expect(await openViewMenu(), '视图 ⋯ 必须可达').toBe(true);
    const onItem = viewSwitch('语义格式化');
    expect(onItem, '视图菜单应有语义格式化开关（默认开）').toBeTruthy();
    onItem!.click();
    await tick();
    expect(localStorage.getItem('esquerystudio.pref.es_tbl_sem')).toBe('false');
    expect(cellByCol('price').textContent?.trim(), '关后回落原样').toBe('1234567');
    /* 新实例读盘：保持关 */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(ResultTable, { hits: HITS, total: 1, index: 'sf2b', fieldTypes: TYPES });
    expect(cellByCol('created').textContent?.trim(), '跨实例记忆关态').toBe('2024-03-05T10:20:30Z');
  });

  it('epoch 毫秒仍走既有 epochText 通道（不受开关影响）', async () => {
    await mountTbl(ResultTable, {
      hits: [{ _id: 'e', _source: { ts: 1709641230000 } }] as any[],
      total: 1, index: 'sf3',
    });
    const td = cellByCol('ts');
    expect(td.textContent?.trim()).toMatch(LOCAL_RE);
  });
});

describe('QRT 语义格式化（W7 RT 镜像）', () => {
  it('date 类型本地化+数值千分位+ip 类；title 恒 raw；开关同款落盘', async () => {
    await mountTbl(QueryResultTable, {
      hits: [{ _id: '1', _index: 'i', _source: { created: '2024-03-05T10:20:30Z', price: 1234, big: 1234567, ip: '10.0.0.7' } }],
      fieldTypes: { created: 'date', price: 'long', big: 'long', ip: 'ip' },
      storageKey: 'sfq1',
    });
    const rows = [...host.querySelectorAll('tbody tr')] as HTMLElement[];
    const tds = [...rows[0].querySelectorAll('td.qrt-cell')] as HTMLElement[];
    /* 列序：_id/_index/created/price/big/ip */
    expect(tds[2].textContent?.trim()).toMatch(LOCAL_RE);
    expect(tds[3].textContent?.trim(), '数值类型列千分位（semOn）').toBe('1,234');
    expect(tds[4].textContent?.trim(), '≥1e4 大整数千分位为既有行为').toBe('1,234,567');
    expect(tds[3].classList.contains('num-col')).toBe(true);
    expect(tds[5].classList.contains('ip-col')).toBe(true);
    expect(tds[2].getAttribute('title')).toBe('2024-03-05T10:20:30Z');
    expect(tds[3].getAttribute('title')).toBe('1234');
    /* 开关：列头右键→关——语义千分位回落，既有 ≥1e4 大整数格式化保留（54 批口径不动） */
    const th = host.querySelectorAll('thead th')[3] as HTMLElement;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick();
    await toggleViewSwitch('语义格式化');
    await tick();
    const after = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td.qrt-cell');
    expect(after[3].textContent?.trim(), '关后小数值回落原样').toBe('1234');
    expect(after[4].textContent?.trim(), '既有大整数格式化不受开关影响').toBe('1,234,567');
    expect(localStorage.getItem('esquerystudio.pref.es_tbl_sem')).toBe('false');
  });
});
