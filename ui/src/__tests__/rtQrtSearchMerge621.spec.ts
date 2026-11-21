/**
 * 六百二十一批：工具行单框双效（620 设计稿 D1~D5 用户裁决落地）。
 * searchable 档 HitNav 挂载点退役——查找并入常驻快筛框：输入即过滤（快）+
 * 行内 mark 点亮（准，词桥驱动 useGridSearch）；Ctrl+F=聚焦常驻框（不再开独立条）；
 * Esc 即时清词回全集（不等 150ms 防抖，closeSearch 语义等值平移）；
 * Enter=桥接滚动下一命中行（D2：过滤后所见行皆命中行，行级滚动）。
 * 非 searchable 档 HitNav 原样保留（229 批「表格必有查找」约定不回退）——由
 * qrtGridSearch269/rtGridSearch 既有用例看守，本 spec 不重复。
 * 防抖走真实 220ms 等待（fake timers 不 flush Vue 渲染微任务链，229 批同口径）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  { _id: 'b', _source: { name: 'apple', age: 31 } },
  { _id: 'c', _source: { name: 'pineapple', age: 3 } },
] as any;

const QHITS = [
  { _id: '1', _source: { name: 'alpha' } },
  { _id: '2', _source: { name: 'beta' } },
  { _id: '3', _source: { name: 'gamma' } },
] as any;

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rtSrc = read('../components/ResultTable.vue');
const qrtSrc = read('../components/QueryResultTable.vue');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const waitDebounce = async () => { await new Promise(r => setTimeout(r, 220)); await tick(); };

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}
const typeKw = (inp: HTMLInputElement, v: string) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 单框双效（621 批·searchable 档）', () => {
  it('HitNav 退役：常驻框在场+独立查找条不在场；Ctrl+F 聚焦常驻框', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'gs1', searchable: true });
    const box = host.querySelector('.rt-qsearch-inp') as HTMLInputElement;
    expect(box, 'searchable 档常驻快筛框在场').toBeTruthy();
    expect(host.querySelector('.hn-inp'), 'HitNav 输入框退役（未打开态）').toBeNull();
    (host.querySelector('.rt') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ctrlKey: true }));
    await tick(2);
    expect(host.querySelector('.hn-inp'), 'Ctrl+F 不再打开独立查找条').toBeNull();
    expect(document.activeElement, 'Ctrl+F 聚焦常驻框').toBe(box);
  });

  it('单框双效：输入即过滤+行内 mark 点亮（同一词同一口径）', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'gs1', searchable: true });
    const box = host.querySelector('.rt-qsearch-inp') as HTMLInputElement;
    typeKw(box, 'an');
    await waitDebounce();
    /* 过滤：'an' 仅 banana → 1 行 */
    const trs = [...host.querySelectorAll('.rt tbody tr')].filter(t => !t.classList.contains('rt-trunc-row'));
    expect(trs.length, '不匹配行移除').toBe(1);
    expect(trs[0]!.textContent).toContain('banana');
    /* 点亮：命中格琥珀底 + mark 切分（此前只滤不亮） */
    expect(host.querySelectorAll('td.rt-hit').length, '命中格高亮').toBe(1);
    expect(host.querySelector('mark.rt-mark'), '行内 mark 点亮「哪段命中」').toBeTruthy();
  });

  it('Esc 即时清词回全集（不等防抖）：行集还原+mark 同步消失', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'gs1', searchable: true });
    const box = host.querySelector('.rt-qsearch-inp') as HTMLInputElement;
    typeKw(box, 'an');
    await waitDebounce();
    expect(host.querySelectorAll('td.rt-hit').length).toBe(1);
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await tick(3); /* 刻意不等 220ms 防抖——清词必须即时清生效词 */
    expect(box.value, 'Esc 清词').toBe('');
    const trs = [...host.querySelectorAll('.rt tbody tr')].filter(t => !t.classList.contains('rt-trunc-row'));
    expect(trs.length, '回全集').toBe(3);
    expect(host.querySelectorAll('td.rt-hit').length, 'mark 即时消失').toBe(0);
    expect(host.querySelector('mark.rt-mark')).toBeNull();
  });

  it('Enter 桥接：滚动到下一个命中行（D2 行级巡航）', async () => {
    const siv = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = siv;
    try {
      await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'gs1', searchable: true });
      const box = host.querySelector('.rt-qsearch-inp') as HTMLInputElement;
      typeKw(box, 'apple'); /* apple + pineapple 两行命中 */
      await waitDebounce();
      /* 相对计数+特征参钉定：组件内另有合法滚动路径（228 批滚动跟随/locateCol），
         断言真实行为=每次 Enter 恰好新增一次 block:'center' 滚动（bridgeNext 专属形态） */
      const before = siv.mock.calls.length;
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await tick(2);
      expect(siv.mock.calls.length, 'Enter 滚动到命中行').toBe(before + 1);
      expect(siv.mock.calls[before]).toEqual([{ block: 'center' }]);
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await tick(2);
      expect(siv.mock.calls.length, '再按 Enter=下一命中行（回绕）').toBe(before + 2);
    } finally {
      delete (HTMLElement.prototype as any).scrollIntoView;
    }
  });
});

describe('QRT 单框双效（621 批·对称件）', () => {
  it('HitNav 退役+Ctrl+F 聚焦常驻框；输入即过滤+mark 点亮；Esc 即时清', async () => {
    await mountTbl(QueryResultTable, { hits: QHITS, storageKey: 'qsm621', searchable: true });
    const box = host.querySelector('.qrt-qsearch-inp') as HTMLInputElement;
    expect(box, '常驻框在场').toBeTruthy();
    expect(host.querySelector('.hn-inp'), 'HitNav 退役').toBeNull();
    (host.querySelector('.qrt') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ctrlKey: true }));
    await tick(2);
    expect(document.activeElement, 'Ctrl+F 聚焦常驻框').toBe(box);
    typeKw(box, 'beta');
    await waitDebounce();
    const trs = [...host.querySelectorAll('table.qrt-tbl tbody tr')].filter(t => !t.classList.contains('qrt-nomatch'));
    expect(trs.length, '过滤到 1 行').toBe(1);
    expect(host.querySelector('td.qrt-hit'), '命中格高亮').toBeTruthy();
    expect(host.querySelector('mark.qrt-mark'), 'mark 点亮').toBeTruthy();
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await tick(3);
    const trs2 = [...host.querySelectorAll('table.qrt-tbl tbody tr')].filter(t => !t.classList.contains('qrt-nomatch'));
    expect(trs2.length, 'Esc 回全集').toBe(3);
    expect(host.querySelector('td.qrt-hit')).toBeNull();
  });

  it('源码锁：HitNav 挂载点 gated 非 searchable 档+词桥+Enter 桥接接线', () => {
    for (const src of [rtSrc, qrtSrc]) {
      expect(src).toMatch(/v-if="searchOpen && !searchable"/);
      expect(src).toMatch(/watch\(searchableKw, \(v\) => \{/);
      expect(src).toContain("if (!v.trim()) searchDeferred.value = '';"); /* 即时清语义锚 */
      expect(src).toMatch(/if \(props\.searchable\) \{/); /* openSearch 分流 */
      expect(src).toContain('@enter="bridgeNext"');
    }
    expect(rtSrc).toMatch(/\.rt-qsearch-inp'/);
    expect(qrtSrc).toMatch(/\.qrt-qsearch-inp'/);
  });
});
