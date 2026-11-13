/**
 * 二百二十七批 M2：RT/QRT 排序记忆互读（es_tbl_sort:<dim>:m 同键空间）。
 * 背景：此前 RT 存 'asc'/'desc' 字符串载荷、QRT 存 1/-1 数字载荷，同维度下
 * 对方写的链被整条丢弃（静默丢排序）。现双向兼容读 + QRT 写侧归一字符串格式。
 * 锁定：
 * 1) RT 能读 QRT 数字载荷（1/-1）并按其方向排序；
 * 2) QRT 能读 RT 字符串载荷（'asc'/'desc'）并按其方向排序；
 * 3) RT 读入数字载荷后再排序落盘 → 归一为字符串格式（写侧单向收敛）。
 * 挂载样板照抄 multiSort（裸 createApp + pinia + api mock）。
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
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'banana', age: 1 } },
  { _id: 'a', _source: { name: 'banana', age: 2 } },
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

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT/QRT 排序记忆互读（227 批 M2）', () => {
  it('RT 读 QRT 数字载荷（1/-1）——降序生效且行序正确', async () => {
    localStorage.setItem('es_tbl_sort:sc1:m', JSON.stringify([{ f: 'age', d: -1 }]));
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'sc1' });
    /* RT 列 0=勾选 1=序号 2=name 3=age；age 降序 → 3(b), 2(a), 1(c) */
    const ages = [...host.querySelectorAll('tbody tr')].map(tr => (tr.children[3] as HTMLElement)?.textContent?.trim());
    expect(ages).toEqual(['3', '2', '1']);
    /* RT 再排序落盘 → 写侧归一字符串格式 */
    const nameTh = [...host.querySelectorAll('thead th')].find(x => x.textContent?.includes('name'))!;
    nameTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:sc1:m') || 'null')).toEqual([{ f: 'name', d: 'asc' }]);
  });

  it('QRT 读 RT 字符串载荷（asc/desc）——降序生效且行序正确', async () => {
    localStorage.setItem('es_tbl_sort:sc2:m', JSON.stringify([{ f: 'age', d: 'desc' }]));
    await mountTbl(QueryResultTable, { hits: HITS, sortable: true, storageKey: 'sc2' });
    /* QRT hits 型：children[3]=age；age 降序 → 3,2,1 */
    const ages = [...host.querySelectorAll('tbody tr')].map(tr => (tr.children[3] as HTMLElement)?.textContent?.trim());
    expect(ages).toEqual(['3', '2', '1']);
    /* QRT 再落盘仍为字符串格式（写侧归一） */
    const nameTh = [...host.querySelectorAll('thead th')].find(x => x.textContent?.includes('name'))!;
    nameTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:sc2:m') || 'null')).toEqual([{ f: 'name', d: 'asc' }]);
  });
});
