/**
 * R130 一百七十八批：RT/QRT 多列排序（Shift+点列头=追加/翻转次键，链长 ≤3）。
 * 锁定：
 * 1) 普通点击三态循环（227 批 M2 起两表同向：均首击 asc；三击取消回原始序）；
 * 2) Shift+点=追加次键（:m JSON 落盘 + 旧 :f/:d 链首同步向后兼容）；Shift+点链内列=翻转方向；
 * 3) 排序生效：多键字典序（主键相同按次键）；列头显示优先级角标（rt-sort-ord/qrt-sort-ord）；
 * 4) 重挂载从 :m 恢复多链；旧版本单键 :f/:d（无 :m）读回兼容；
 * 5) 次键列被列选隐藏→从链剔除该键（暗状态自愈延续）。
 * 挂载样板照抄 colMenuKeyboard（裸 createApp + pinia + api mock）。
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

const clickTh = (th: Element, shift = false) =>
  th.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: shift }));
const thOf = (t: string) => [...host.querySelectorAll('thead th')].find(x => x.textContent?.includes(t))!;
const colIdx = (t: string) => [...host.querySelectorAll('thead th')].findIndex(x => x.textContent?.includes(t));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 多列排序（一百七十八批）', () => {
  it('普通点击三态不变；Shift+点追加次键+角标+双重落盘', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'ms1' });
    const nameTh = thOf('name'), ageTh = thOf('age');
    clickTh(nameTh); await tick();          // 首击 asc
    clickTh(nameTh); await tick();          // 再击 desc
    /* 主键 name desc 下 age 各异，次键验证需主键同值：banana(2) banana(1) */
    clickTh(nameTh); await tick();          // 三击取消
    clickTh(nameTh); await tick();          // name asc
    clickTh(ageTh, true); await tick();     // Shift+age：追加次键
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:ms1:m') || '[]'))
      .toEqual([{ f: 'name', d: 'asc' }, { f: 'age', d: 'asc' }]);
    /* 旧键同步（链首）——向后兼容 */
    expect(localStorage.getItem('es_tbl_sort:ms1:f')).toBe('name');
    expect(localStorage.getItem('es_tbl_sort:ms1:d')).toBe('asc');
    /* 行序：主键 name asc、次键 age asc → apple(3), banana(1), banana(2)。
       RT 列 0=勾选 1=序号 2=name 3=age；行身份用 name+age 组合（RT 不渲染 _id 列） */
    const names = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[2]?.textContent?.trim());
    expect(names).toEqual(['apple', 'banana', 'banana']);
    const ages = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[3]?.textContent?.trim());
    expect(ages).toEqual(['3', '1', '2']); // apple, banana(age1), banana(age2)
    /* 角标：链内第二键显示 2 */
    expect(ageTh.querySelector('.rt-sort-ord')?.textContent).toBe('2');
    /* Shift+点 name：翻转主键方向 */
    clickTh(nameTh, true); await tick();
    expect(localStorage.getItem('es_tbl_sort:ms1:d')).toBe('desc');
  });

  it('重挂载从 :m 恢复多链；旧版单键 :f/:d（无 :m）读回兼容', async () => {
    localStorage.setItem('es_tbl_sort:ms2:m', JSON.stringify([{ f: 'name', d: 'asc' }, { f: 'age', d: 'desc' }]));
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'ms2' });
    /* name asc 主键 + age desc 次键：banana(2) 在 banana(1) 前（HITS 原序 c 在 a 前，次键生效才有此序） */
    const names2 = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[2]?.textContent?.trim());
    expect(names2).toEqual(['apple', 'banana', 'banana']);
    const ages2 = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[3]?.textContent?.trim());
    expect(ages2).toEqual(['3', '2', '1']);
    /* 旧单键兼容：无 :m，只有 :f/:d */
    localStorage.clear();
    localStorage.setItem('es_tbl_sort:ms3:f', 'age');
    localStorage.setItem('es_tbl_sort:ms3:d', 'desc');
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'ms3' });
    const ages = [...host.querySelectorAll('tbody tr')].map(tr => (tr.children[3] as HTMLElement)?.textContent?.trim());
    expect(ages).toEqual(['3', '2', '1']);
  });

  it('次键列被隐藏→从链剔除（persistSort 同步）', async () => {
    localStorage.setItem('es_cols:ms4', JSON.stringify(['name', 'age']));
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'ms4' });
    clickTh(thOf('name')); await tick();
    clickTh(thOf('age'), true); await tick();
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:ms4:m') || '[]').length).toBe(2);
    /* 列选隐藏 age → 链剩单键 */
    localStorage.setItem('es_cols:ms4', JSON.stringify(['name']));
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'ms4' });
    const chain = JSON.parse(localStorage.getItem('es_tbl_sort:ms4:m') || '[]');
    expect(chain).toEqual([{ f: 'name', d: 'asc' }]);
  });
});

describe('QRT 多列排序（一百七十八批；227 批 M2 方向对齐）', () => {
  it('首击 asc（对齐 RT）；Shift+点追加+字符串落盘+重挂载恢复', async () => {
    await mountTbl(QueryResultTable, { hits: HITS, sortable: true, storageKey: 'qm1' });
    const nameTh = thOf('name'), ageTh = thOf('age');
    clickTh(nameTh); await tick();          // 首击 asc：apple 在前
    clickTh(ageTh, true); await tick();     // Shift+age 追加（新键默认 asc）
    /* 227 批 M2：写侧归一字符串格式（与 RT 同构，:m 从此只有一种载荷形态） */
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:qm1:m') || '[]'))
      .toEqual([{ f: 'name', d: 'asc' }, { f: 'age', d: 'asc' }]);
    /* 主键 name asc：apple(b), banana(1)=c, banana(2)=a → 次键 age asc：1 在 2 前 → b, c, a */
    const rows = [...host.querySelectorAll('tbody tr')].map(tr => tr.children[1]?.textContent?.trim());
    expect(rows).toEqual(['b', 'c', 'a']);
    expect(ageTh.querySelector('.qrt-sort-ord')?.textContent).toBe('2');
    /* 重挂载恢复（读自字符串格式 :m） */
    await mountTbl(QueryResultTable, { hits: HITS, sortable: true, storageKey: 'qm1' });
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:qm1:m') || '[]').length).toBe(2);
  });

  it('旧版单键 :f/:d 读回兼容；普通三击取消清 :m/:f/:d（升→降→取消）', async () => {
    localStorage.setItem('es_tbl_sort:qm2:f', 'age');
    localStorage.setItem('es_tbl_sort:qm2:d', 'asc');
    await mountTbl(QueryResultTable, { hits: HITS, sortable: true, storageKey: 'qm2' });
    const ages = [...host.querySelectorAll('tbody tr')].map(tr => (tr.children[3] as HTMLElement)?.textContent?.trim());
    expect(ages).toEqual(['1', '2', '3']);
    /* 三态循环（227 批起 asc 起步，与 RT 同向）：初始 asc → 击1 desc → 击2 取消 → 击3 asc。
       最终链 [{age asc}] 且 :m/:f/:d 同步（三处一致，无残留） */
    const ageTh = thOf('age');
    clickTh(ageTh); await tick();
    clickTh(ageTh); await tick();
    clickTh(ageTh); await tick();
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:qm2:m') || 'null')).toEqual([{ f: 'age', d: 'asc' }]);
    expect(localStorage.getItem('es_tbl_sort:qm2:f')).toBe('age');
    expect(localStorage.getItem('es_tbl_sort:qm2:d')).toBe('asc');
  });
});
