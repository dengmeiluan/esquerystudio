/**
 * 五百二十批：两表类型感知区间过滤弹层 / 聚合 footer 行 / 复制整列值 / fit 修复三件。
 * 锁定：
 * 1) RT/QRT 筛选弹层对数值·日期列出 min/max 双输入（RT 无映射走 numericCols 采样口径、
 *    QRT 只认 fieldTypes），输入区间行过滤生效，「清除」连带清区间；
 * 2) 聚合 footer 行：列头菜单「聚合行」开关（默认关）→ tfoot 出现且数值列 Σ/avg 读数
 *    （useColStats.statsOf 口径）+ es_tbl_agg:<dim> 落盘与重挂载恢复；无记忆维度仅内存态；
 * 3) 列头菜单「复制整列值」=过滤后行集单列 TSV（含表头行）；
 * 4) QRT fit 菜单项 prefsOn 门控（无记忆维度不再出空操作项）；
 * 5) 静态锁：RT fit-all 合并共享 fitAll()、两表微调钳位引用 useColFit 共享常量。
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
import { toggleViewSwitch, viewSwitch, openViewMenu } from './helpers/viewSwitch'; /* 1143：表格级视图开关归位 */
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 5 } },
  { _id: 'c', _source: { name: 'cherry', age: 9 } },
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
  /* 先卸载再清 LS——卸载链上的 flush watcher 可能同步写偏好键，顺序反了会写回残留 */
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

const thOf = (col: string) => [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes(col)) as HTMLElement;
const dataRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => !tr.className.includes('nomatch') && !tr.className.includes('trunc'));
async function openColMenu(col: string) {
  thOf(col).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  await tick(4);
}
const menuButtons = () => [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];
async function clickMenuItem(text: string) {
  const btn = menuButtons().find(b => b.textContent?.includes(text));
  expect(btn, `菜单应有「${text}」项`).toBeTruthy();
  (btn as HTMLElement).click();
  await tick(6);
}
function typeIn(inp: HTMLInputElement, v: string) {
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('两表筛选弹层区间输入（五百二十批）', () => {
  it('RT：无类型映射数值列（采样口径）出区间输入；min 过滤生效；「清除」连带清区间', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'rRange1' });
    [...host.querySelectorAll('.rt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 age 列')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(4);
    const ins = [...document.querySelectorAll('.cfp .cfp-range-in')] as HTMLInputElement[];
    expect(ins.length, '数值采样列应出 min/max 双输入').toBe(2);
    typeIn(ins[0], '3');
    await tick(6);
    expect(dataRows().length, 'age≥3 → 2 行').toBe(2);
    expect(host.querySelector('.rt-filtered')?.textContent).toContain('已筛选 1 列');
    /* 弹层「清除」按钮连带清区间（行集恢复+提示条消失） */
    (document.querySelector('.cfp .cfp-clear') as HTMLElement).click();
    await tick(6);
    expect(dataRows().length).toBe(3);
    expect(host.querySelector('.rt-filtered')).toBeNull();
  });

  it('RT：date 列（fieldTypes）占位说明含 ISO/epoch 示例', async () => {
    const dateHits = [
      { _id: 'a', _source: { name: 'banana', ts: '2024-01-01' } },
      { _id: 'b', _source: { name: 'apple', ts: '2024-06-15' } },
    ] as any;
    await mountTbl(ResultTable, { hits: dateHits, total: 2, index: 'rRange2', fieldTypes: { ts: 'date' } });
    [...host.querySelectorAll('.rt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 ts 列')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(4);
    const ins = [...document.querySelectorAll('.cfp .cfp-range-in')] as HTMLInputElement[];
    expect(ins[0].placeholder).toContain('2024-01-01 或 epoch 毫秒');
  });

  it('QRT：fieldTypes 数值列出区间输入并过滤生效', async () => {
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'qRange1', fieldTypes: { age: 'long' } });
    [...host.querySelectorAll('.qrt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 age 列')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(4);
    const ins = [...document.querySelectorAll('.cfp .cfp-range-in')] as HTMLInputElement[];
    expect(ins.length, 'fieldTypes 数值列应出 min/max 双输入').toBe(2);
    typeIn(ins[0], '3');
    await tick(6);
    expect(dataRows().length).toBe(2);
    expect(host.querySelector('.qrt-bar')!.textContent).toContain('已筛选 1 列 · 2/3 行');
  });
});

describe('聚合 footer 行（五百二十批）', () => {
  it('RT：菜单开关默认关→开，tfoot 出现且数值列 Σ/avg 读数；es_tbl_agg 落盘并重挂载恢复', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'aggRt1' });
    expect(host.querySelector('tfoot')).toBeNull();
    await toggleViewSwitch('聚合行');
    const foot = host.querySelector('tfoot');
    expect(foot, '开启后应渲染聚合行').not.toBeNull();
    /* HITS age=2/5/9 → Σ16 avg 5.33（statsOf 过滤后行集口径） */
    expect(foot!.textContent).toContain('Σ 16');
    expect(foot!.textContent).toContain('avg 5.33');
    /* 非数值 name 列不出读数（cell 顺序=name,age） */
    const cells = [...foot!.querySelectorAll('.rt-agg-cell')];
    expect(cells[0].textContent?.trim()).toBe('');
    expect(cells[1].textContent).toContain('Σ 16');
    expect(localStorage.getItem('es_tbl_agg:aggRt1')).toBe('1');
    /* 重挂载恢复 */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'aggRt1' });
    expect(host.querySelector('tfoot')?.textContent).toContain('Σ 16');
  });

  it('QRT：prefsOn 落盘同口径；无 storageKey（SQL 通道）开关仅内存态不写 LS', async () => {
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'aggQrt1' });
    expect(host.querySelector('tfoot')).toBeNull();
    await toggleViewSwitch('聚合行');
    expect(host.querySelector('tfoot')?.textContent).toContain('Σ 16');
    expect(localStorage.getItem('es_tbl_agg:aggQrt1')).toBe('1');
    /* 无 storageKey 实例：清掉前半段写入后，开关仍生效（内存态）但不再产生任何 es_tbl_agg 键 */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    localStorage.removeItem('es_tbl_agg:aggQrt1');
    await mountTbl(QueryResultTable, { hits: HITS });
    await toggleViewSwitch('聚合行');
    expect(host.querySelector('tfoot'), '无记忆维度开关仍生效（内存态）').not.toBeNull();
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i)).filter(k => k!.startsWith('es_tbl_agg'))).toEqual([]);
  });
});

describe('列头菜单「复制整列值」（五百二十批）', () => {
  it('RT：复制过滤后行集单列 TSV（含表头行）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'ccvRt' });
    await openColMenu('name');
    await clickMenuItem('复制整列值');
    expect(writeText).toHaveBeenCalledWith('name\nbanana\napple\ncherry');
  });

  it('QRT：复制过滤后行集单列 TSV（含表头行）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'ccvQrt', sortable: true, fieldTypes: { age: 'long' } });
    /* 先按 age 区间筛掉一行，锁「过滤后行集」口径 */
    [...host.querySelectorAll('.qrt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 age 列')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(4);
    typeIn(([...document.querySelectorAll('.cfp .cfp-range-in')] as HTMLInputElement[])[0], '3');
    await tick(6);
    await openColMenu('name');
    await clickMenuItem('复制整列值');
    expect(writeText).toHaveBeenCalledWith('name\napple\ncherry');
  });
});

describe('QRT fit 菜单项 prefsOn 门控（五百二十批修复）', () => {
  it('无 storageKey：fit 两项也在场（1137 内存态生效，不落盘）；聚合行仍可用', async () => {
    await mountTbl(QueryResultTable, { hits: HITS });
    await openColMenu('name');
    expect(menuButtons().some(b => b.textContent?.includes('全列适应内容'))).toBe(true);
    expect(menuButtons().some(b => b.textContent?.includes('此列适应内容'))).toBe(true);
    expect(await toggleViewSwitch('聚合行'), '聚合行开关仍在（已归位工具行「视图 ⋯」）').toBe(true);
    /* 对照：有记忆维度照旧出 fit 两项 */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'fitGate' });
    await openColMenu('name');
    expect(menuButtons().some(b => b.textContent?.includes('全列适应内容'))).toBe(true);
  });
});

describe('QRT 冻结菜单项 prefsOn 门控（遗留清零二批修复）', () => {
  it('无 storageKey：列头菜单不出「冻结到此列/取消冻结」空操作项（与 fit 项同口径）；有记忆维度照旧出', async () => {
    await mountTbl(QueryResultTable, { hits: HITS });
    await openColMenu('name');
    expect(menuButtons().some(b => b.textContent?.includes('冻结到此列'))).toBe(false);
    expect(menuButtons().some(b => b.textContent?.includes('取消冻结'))).toBe(false);
    /* 对照：有记忆维度照旧出冻结项 */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'freezeGate' });
    await openColMenu('name');
    expect(menuButtons().some(b => b.textContent?.includes('冻结到此列'))).toBe(true);
  });
});

describe('fit 修复静态锁（五百二十批）', () => {
  const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
  const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
  const fit = readFileSync(join(__dirname, '../composables/useColFit.ts'), 'utf-8');

  it('RT 格右键 fit-all 合并共享 fitAll()（不再手写循环）；两表微调钳位引用共享常量', () => {
    expect(rt.match(/run: \(\) => fitAll\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(rt).toContain('Math.min(COL_W_MAX, Math.max(COL_W_MIN, cur + delta))');
    expect(qrt).toContain('Math.min(COL_W_MAX, Math.max(COL_W_MIN, cur + delta))');
    expect(fit).toContain('export const COL_W_MIN = 60');
    expect(fit).toContain('export const COL_W_MAX = 600');
  });
});
