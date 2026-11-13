/**
 * 五百六十五批件④：QRT useGridSearch 补 colType（563 批 date 列第三遍归一消费接线）。
 * 563 已交付：useGridSearch 可选 colType 参——date 列且两侧都呈日期形态时第三遍分隔符
 * 归一（/ . 与 - 互认，useGridSearch 内建）；未接线证据：QRT useGridSearch(...) 未传
 * colType——date 列「2024/01/15」搜「2024-01-15」零命中。
 * 接线：colType: (ci) => effType(shownCols.value[ci] ?? '')（与列头徽标/统计面同一
 * 读取口径）。⚠semPref（es_tbl_sem）开着时 date 列显示被本地化为 dash 形态、kw 走第一遍
 * 即命中——spec 显式关掉语义格式化锁「原始串分隔符归一」第三遍路径。
 * 锁定：
 * 1) date 列：slash/dot 形态原始串搜 dash 形态 kw → 命中（第三遍归一）；
 * 2) 非 date 列行为零变：keyword 列 slash 串搜 dash 形态 kw 不命中（colType 非列型不放行）；
 * 3) 既有两遍契约零回退：普通字面 kw 照常命中（229 批 includes 第一遍）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const FHITS = [
  { _id: '1', _source: { d: '2024/01/15', name: 'alpha' } },
  { _id: '2', _source: { d: '2024-03-02', name: 'beta' } },
  { _id: '3', _source: { d: '2024.05.06', name: 'ab/cd' } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const waitMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

async function qrtSearch(q: string) {
  const root = host.querySelector('.qrt') as HTMLElement;
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ctrlKey: true }));
  await tick(4);
  const inp = host.querySelector('.hn-inp') as HTMLInputElement;
  expect(inp, 'Ctrl+F 打开结果内查找').toBeTruthy();
  inp.value = q;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await waitMs(320); /* 150ms 防抖 + 余量 */
  await tick(6);
}

const hitCells = () => [...host.querySelectorAll('td.qrt-cell.qrt-hit')] as HTMLElement[];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  /* 关语义格式化：锁「date 原始串（slash/dot 形态）」第三遍归一路径
     （开着时显示层本地化为 dash 形态、kw 走第一遍 includes 即命中，锁不到本件） */
  localStorage.setItem('esquerystudio.pref.es_tbl_sem', 'false');
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .cfp-mask').forEach(e => e.remove());
});

const PROPS = {
  hits: FHITS, storageKey: 'qds565',
  fieldTypes: { d: 'date', name: 'keyword' },
};

describe('五百六十五批件④：QRT date 列搜索归一（useGridSearch colType 接线）', () => {
  it('date 列：slash 形态原始串搜 dash 形态 kw 命中（第三遍分隔符归一）', async () => {
    await mountTbl(PROPS);
    await qrtSearch('2024-01-15');
    expect(hitCells().length, '「2024/01/15」命中 kw「2024-01-15」').toBe(1);
    expect(hitCells()[0]!.textContent).toContain('2024/01/15');
  });

  it('非 date 列行为零变：keyword 列 slash 串搜 dash 形态 kw 不命中（colType 列型门槛）', async () => {
    await mountTbl(PROPS);
    await qrtSearch('ab-cd');
    expect(hitCells().length, 'keyword 列不走 date 归一——「ab/cd」不命中「ab-cd」').toBe(0);
  });

  it('既有两遍契约零回退：普通字面 kw 照常命中（第一遍 includes）', async () => {
    await mountTbl(PROPS);
    await qrtSearch('beta');
    expect(hitCells().length).toBe(1);
    expect(hitCells()[0]!.textContent).toContain('beta');
  });

  it('源码锁：useGridSearch 注入 colType（effType 同一口径读取）', () => {
    expect(qrt).toContain("colType: (ci) => effType(shownCols.value[ci] ?? '')");
  });
});
