/**
 * 五百五十一批轨3：数据表格内核两件——SparkLine 进聚合行 + 显式非语义类型抑制守卫单源。
 * 锁定：
 * ① aggOn 开后数值列 tfoot 含 svg polyline 且 points 非空（双内核同构）；
 * ② 非数值列/对象列无 svg（值形态硬口径天然抑制）；
 * ③ Σ·avg 前缀 contains 回归（wave535:116-138 / wave538:60-118 口径不动）；
 * ④ cap 截断（61 值画 60 点，seriesOf 截前 cap）；
 * ⑤ 缺省 aggOn=false 零 DOM（无 tfoot 无 svg）；
 * ⑥ 显式标 binary 列（值真是数字的矛盾标注）→ 无区间输入 / tfoot 无该列数值格 / 无 sparkline；
 * ⑦ _id 列对照恒无区间；
 * ⑧ 545 采样兜底对照锁仍在场（not 断言防翻转——无 fieldTypes 数值列 Σ/右对齐/走势齐活）；
 * ⑨ filterMode 既有 AND/OR 行为零回归（跑既有 tableKernelWave534 即可，本 spec 不重断言）。
 * 挂载样板照抄 tableKernelWave535/538（裸 createApp + pinia）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import { useColStats } from '../composables/useColStats';
import { useAggRow } from '../composables/useAggRow';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

/* composable 行为 harness（tableShellSecondCut528 同款：setup 内挂，结果镜像到 outer） */
function runSetup(fn: () => void) {
  const app = createApp({ setup() { fn(); return () => h('div'); } });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .cfp-mask, .ccm-mask').forEach(e => e.remove());
});

/** 开某列筛选弹层（QRT qrt-funnel / RT rt-funnel 同 aria-label 语言） */
async function openFilterPop(col: string) {
  const btn = [...host.querySelectorAll('thead th .qrt-funnel, thead th .rt-funnel')]
    .find(b => b.getAttribute('aria-label') === '筛选 ' + col + ' 列') as HTMLButtonElement | undefined;
  expect(btn, '列头漏斗在场').toBeTruthy();
  btn!.click();
  await tick(6);
  return document.querySelector('.cfp') as HTMLElement | null;
}

/* ═══════════ 一、A：SparkLine 进聚合行 ═══════════ */
describe('五百五十一批 A：SparkLine 进聚合行（①②③④⑤）', () => {
  it('①③ QRT：aggOn 开后数值列 tfoot 含 svg polyline 且 points 非空；Σ·avg 前缀 contains 回归', async () => {
    localStorage.setItem('es_tbl_agg:w551q1', '1');
    await mountTbl(QueryResultTable, { cols: ['name', 'v'], rows: [['a', 50], ['b', 80]] as any, storageKey: 'w551q1' });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row') as HTMLElement;
    expect(tfoot, '聚合行渲染').toBeTruthy();
    expect(tfoot.textContent, '既有 Σ/avg 前缀逐字节不动（wave535/538 contains 口径）').toContain('Σ 130 · avg 65.00');
    const pl = tfoot.querySelector('.qrt-agg-spark polyline') as SVGPolylineElement | null;
    expect(pl, '数值列出迷你走势 svg polyline').toBeTruthy();
    expect(pl!.getAttribute('points') ?? '', 'points 非空').not.toBe('');
  });

  it('①③ RT：同构同步（chk/act 占位 cell 保位）', async () => {
    localStorage.setItem('es_tbl_agg:w551r1', '1');
    const HITS = [
      { _id: 'a', _source: { name: 'x', v: 50 } },
      { _id: 'b', _source: { name: 'y', v: 80 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w551r1' });
    const tfoot = host.querySelector('tfoot tr.rt-agg-row') as HTMLElement;
    expect(tfoot, '聚合行渲染').toBeTruthy();
    expect(tfoot.textContent).toContain('Σ 130 · avg 65.00');
    const pl = tfoot.querySelector('.rt-agg-spark polyline') as SVGPolylineElement | null;
    expect(pl, '数值列出迷你走势 svg polyline').toBeTruthy();
    expect(pl!.getAttribute('points') ?? '').not.toBe('');
    const cells = [...tfoot.querySelectorAll('td')];
    expect(cells[0]!.className, 'chk 占位保位').toBe('rt-chk');
    expect(cells[cells.length - 1]!.className, 'act 占位保位').toBe('rt-act');
  });

  it('② 非数值列/对象列无 svg（QRT+RT；对象值硬口径天然抑制）', async () => {
    localStorage.setItem('es_tbl_agg:w551q2', '1');
    await mountTbl(QueryResultTable, {
      cols: ['s', 'o'], rows: [['x', { a: 1 }], ['y', { b: 2 }]] as any, storageKey: 'w551q2',
    });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row') as HTMLElement;
    expect(tfoot, '聚合行渲染').toBeTruthy();
    expect(tfoot.querySelectorAll('td.num-col').length, '无数值格').toBe(0);
    expect(tfoot.querySelectorAll('svg').length, '非数值/对象列无走势').toBe(0);

    localStorage.setItem('es_tbl_agg:w551r2', '1');
    const HITS = [
      { _id: 'a', _source: { s: 'x', o: { a: 1 } } },
      { _id: 'b', _source: { s: 'y', o: { b: 2 } } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w551r2' });
    const rfoot = host.querySelector('tfoot tr.rt-agg-row') as HTMLElement;
    expect(rfoot, 'RT 聚合行渲染').toBeTruthy();
    expect(rfoot.querySelectorAll('svg').length, 'RT 非数值/对象列无走势').toBe(0);
  });

  it('④ cap 截断：61 个数值画 60 点（截前 cap）', async () => {
    localStorage.setItem('es_tbl_agg:w551q4', '1');
    const rows = Array.from({ length: 61 }, (_, i) => ['r' + i, i]) as any;
    await mountTbl(QueryResultTable, { cols: ['name', 'v'], rows, storageKey: 'w551q4' });
    const pl = host.querySelector('tfoot tr.qrt-agg-row .qrt-agg-spark polyline') as SVGPolylineElement | null;
    expect(pl, '走势在场').toBeTruthy();
    const n = (pl!.getAttribute('points') ?? '').trim().split(/\s+/).filter(Boolean).length;
    expect(n, '61 值画 60 点').toBe(60);
  });

  it('⑤ 缺省 aggOn=false 零 DOM（无 tfoot 无 spark 容器）', async () => {
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[1], [2]] as any, storageKey: 'w551q5' });
    expect(host.querySelector('tfoot'), 'QRT 无 tfoot').toBeNull();
    expect(host.querySelector('.qrt-agg-spark')).toBeNull();
    const HITS = [{ _id: 'a', _source: { v: 1 } }, { _id: 'b', _source: { v: 2 } }] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w551r5' });
    expect(host.querySelector('tfoot'), 'RT 无 tfoot').toBeNull();
    expect(host.querySelector('.rt-agg-spark')).toBeNull();
  });
});

/* ═══════════ 二、B：显式非语义类型抑制守卫 ═══════════ */
describe('五百五十一批 B：显式非语义类型抑制（⑥⑦⑧）', () => {
  it('⑥ QRT：显式标 binary 列（值真是数字）→ 无区间输入 / tfoot 无该列数值格 / 无 sparkline', async () => {
    localStorage.setItem('es_tbl_agg:w551q6', '1');
    await mountTbl(QueryResultTable, {
      cols: ['name', 'price'], rows: [['a', 10], ['b', 20]] as any, storageKey: 'w551q6',
      fieldTypes: { price: 'binary' },
    });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row') as HTMLElement;
    expect(tfoot, '聚合行渲染').toBeTruthy();
    expect(tfoot.querySelectorAll('td.num-col').length, '矛盾标注压过采样——无数值格').toBe(0);
    expect(tfoot.querySelectorAll('svg').length, '无 sparkline').toBe(0);
    const pop = await openFilterPop('price');
    expect(pop, '筛选弹层打开').toBeTruthy();
    expect(pop!.querySelector('.cfp-range'), 'binary 列无区间输入').toBeNull();
  });

  it('⑥ QRT 对照：显式标 long 同值 → 区间/数值格/走势齐活（抑制是类型驱动非值驱动）', async () => {
    localStorage.setItem('es_tbl_agg:w551q6b', '1');
    await mountTbl(QueryResultTable, {
      cols: ['name', 'price'], rows: [['a', 10], ['b', 20]] as any, storageKey: 'w551q6b',
      fieldTypes: { price: 'long' },
    });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row') as HTMLElement;
    expect(tfoot!.querySelectorAll('td.num-col').length, 'long 列数值格在场').toBeGreaterThan(0);
    expect(tfoot!.querySelectorAll('svg').length, 'long 列走势在场').toBeGreaterThan(0);
    const pop = await openFilterPop('price');
    expect(pop!.querySelector('.cfp-range'), 'long 列区间输入在场').toBeTruthy();
  });

  it('⑥ RT：显式标 binary 列（值真是数字）→ 无区间输入 / tfoot 无该列数值格 / 无 sparkline / 不右对齐', async () => {
    localStorage.setItem('es_tbl_agg:w551r6', '1');
    const HITS = [
      { _id: 'a', _source: { name: 'x', price: 10 } },
      { _id: 'b', _source: { name: 'y', price: 20 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w551r6', fieldTypes: { price: 'binary' } });
    const tfoot = host.querySelector('tfoot tr.rt-agg-row') as HTMLElement;
    expect(tfoot, '聚合行渲染').toBeTruthy();
    expect(tfoot.querySelectorAll('td.num-col').length, '矛盾标注压过采样——无数值格').toBe(0);
    expect(tfoot.querySelectorAll('svg').length, '无 sparkline').toBe(0);
    const priceCells = [...host.querySelectorAll('td.rt-cell')].filter(td => (td as HTMLElement).dataset.col === 'price');
    expect(priceCells.length, 'price 单元格在场').toBeGreaterThan(0);
    expect(priceCells.every(td => !td.classList.contains('num-col')), 'price 不右对齐（numericCols 显式短路）').toBe(true);
    const pop = await openFilterPop('price');
    expect(pop!.querySelector('.cfp-range'), 'binary 列无区间输入').toBeNull();
  });

  it('⑦ _id 列对照恒无区间（数值列 v 区间在场）', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['_id', 'v'], rows: [['abc', 1], ['def', 2]] as any, storageKey: 'w551q7',
    });
    const popId = await openFilterPop('_id');
    expect(popId, '_id 筛选弹层打开').toBeTruthy();
    expect(popId!.querySelector('.cfp-range'), '_id 恒无区间').toBeNull();
    const popV = await openFilterPop('v');
    expect(popV!.querySelector('.cfp-range'), '数值列 v 区间在场').toBeTruthy();
  });

  it('⑧ 545 采样兜底对照锁仍在场（not 断言防翻转）：无 fieldTypes 数值列 Σ/右对齐/走势齐活', async () => {
    localStorage.setItem('es_tbl_agg:w551q8', '1');
    await mountTbl(QueryResultTable, {
      cols: ['name', 'price'], rows: [['a', 10], ['b', 20]] as any, storageKey: 'w551q8',
    });
    expect(host.querySelectorAll('td.qrt-cell.num-col').length, '采样兜底右对齐不被守卫误伤').not.toBe(0);
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row') as HTMLElement;
    expect(tfoot!.querySelectorAll('td.num-col').length, '采样兜底 Σ 数值格在场').not.toBe(0);
    expect(tfoot!.querySelector('polyline'), '采样兜底走势在场').not.toBeNull();

    localStorage.setItem('es_tbl_agg:w551r8', '1');
    const HITS = [
      { _id: 'a', _source: { price: 10 } },
      { _id: 'b', _source: { price: 20 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w551r8' });
    const rfoot = host.querySelector('tfoot tr.rt-agg-row') as HTMLElement;
    expect(rfoot!.querySelectorAll('td.num-col').length, 'RT 采样兜底 Σ 数值格在场').not.toBe(0);
    expect(rfoot!.querySelector('polyline'), 'RT 采样兜底走势在场').not.toBeNull();
  });
});

/* ═══════════ 三、内核单元：seriesOf 硬口径 + aggSpark 开关守卫 ═══════════ */
describe('五百五十一批单元：useColStats.seriesOf / useAggRow.aggSpark', () => {
  it('seriesOf 硬口径：只收有限 number（NaN/Infinity/串/对象/null 天然抑制），保行序', () => {
    const s = useColStats({
      rows: () => [{ v: 1 }, { v: 'x' }, { v: NaN }, { v: Infinity }, { v: { a: 1 } }, { v: null }, { v: 2.5 }, { v: -0 }],
      getVal: (r: any, c: string) => r[c],
      labelOf: (v: any) => String(v),
    }).seriesOf('v');
    expect(s, '硬口径与 numStats 同源（typeof number && Number.isFinite）').toEqual([1, 2.5, -0]);
  });

  it('seriesOf cap：61 值截前 60；cap 可调', () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({ v: i + 1 }));
    const ucs = useColStats({ rows: () => rows, getVal: (r: any) => r.v, labelOf: (v: any) => String(v) });
    expect(ucs.seriesOf('v').length, '缺省 cap=60').toBe(60);
    expect(ucs.seriesOf('v')[0], '截前 cap（首值保留）').toBe(1);
    expect(ucs.seriesOf('v', 3), 'cap 可调截前 3').toEqual([1, 2, 3]);
  });

  it('aggSpark：aggOn 关闭恒 null 且 seriesOf 零求值；开后按列集出数；非数值列不出', () => {
    let a: any = null;
    const calls: string[] = [];
    const series = (c: string) => { calls.push(c); return c === 'n' ? [1, 2, 3] : null; };
    runSetup(() => { a = useAggRow(ref<string | null>('w551u1'), () => ['n', 's'], () => undefined, series); });
    expect(a.aggOn.value).toBe(false);
    expect(a.aggSpark.value, '关闭恒 null').toBeNull();
    expect(calls.length, '关闭零求值（seriesOf 未被调）').toBe(0);
    a.toggleAggRow();
    expect(a.aggSpark.value, '开后数值列出走势数据').toEqual({ n: [1, 2, 3] });
    expect(a.aggFoot.value, 'aggFoot 形状不涉（无数值列=空对象，528 既有口径）').toEqual({});
  });

  it('aggSpark：三参形态（不传 seriesOf）恒 null——tableShellSecondCut528 既有调用形态零触碰', () => {
    let b: any = null;
    const num = (c: string) => (c === 'n' ? { sum: 3, avg: 1.5, min: 1, max: 2 } : undefined);
    runSetup(() => { b = useAggRow(ref<string | null>(null), () => ['n'], num); });
    b.toggleAggRow();
    expect(b.aggOn.value).toBe(true);
    expect(b.aggFoot.value).toEqual({ n: { sum: 3, avg: 1.5, min: 1, max: 2 } });
    expect(b.aggSpark.value, '未注入 seriesOf 恒 null').toBeNull();
  });
});
