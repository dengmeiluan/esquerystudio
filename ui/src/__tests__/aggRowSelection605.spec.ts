/**
 * 六百零五批：行选择聚合（dbx 差距 #1——聚合行行集参数化「选中∩过滤后」）。
 * 锁定：
 * 1) RT：无选中=全量基（零增量）；勾选行后 Σ/avg 只算选中行 + tfoot 出「选中 N 行」
 *    口径徽标；取消勾选回全量、徽标消失；
 * 2) RT：选中行部分被移出行集（身份失效同构「被筛选掉」场景）→ 徽标「选中 K/N 行」
 *    （K=参与聚合的交集行数），Σ 只算交集——口径诚实不静默回退全量；
 * 3) QRT：rows 矩阵同构切换 + 表头全选徽标；
 * 4) TableAggFoot：selHint 可选 prop 缺省零渲染（562 缺省零增量纪律）；
 * 5) 源码锁：两表 colStats 行基切换行 + sel-hint 接线（防回潮）。
 * 挂载样板照抄 rtRegionAgg（裸 createApp + pinia + api mock）；
 * 聚合行开关走 es_tbl_agg:<storageKey> 落盘预置（readAggPref 挂载时读）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
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
import TableAggFoot from '../components/TableAggFoot.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'n1', age: 2 } },
  { _id: 'b', _source: { name: 'n2', age: 4 } },
  { _id: 'c', _source: { name: 'n3', age: 6 } },
  { _id: 'd', _source: { name: 'n4', age: 8 } },
] as any;

const QROWS = [
  ['n1', 2],
  ['n2', 4],
  ['n3', 6],
  ['n4', 8],
];

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

const aggRow = () => host.querySelector('tfoot tr.rt-agg-row, tfoot tr.qrt-agg-row') as HTMLElement;
const chkBoxes = (sel: string) => [...host.querySelectorAll(`${sel} input[type="checkbox"]`)] as HTMLInputElement[];
const footText = () => (aggRow()?.textContent ?? '');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 行选择聚合（六百零五批）', () => {
  it('无选中=全量基；勾 2 行 Σ 只算选中行+「选中 2 行」徽标；全清回全量徽标消失', async () => {
    localStorage.setItem('es_tbl_agg:agg605rt', '1');
    const props = reactive({ hits: HITS, total: 4, storageKey: 'agg605rt', fieldTypes: { age: 'long', name: 'keyword' }, selectable: true });
    await mountTbl(ResultTable, props);
    const foot = aggRow();
    expect(foot, '落盘预置开启聚合行').toBeTruthy();
    expect(footText()).toContain('Σ 20 · avg 5.00');
    expect(foot.querySelector('.rt-agg-sel'), '无选中不出口径徽标').toBeNull();

    const boxes = chkBoxes('.rt-chk');
    expect(boxes.length).toBe(5); // 表头全选 1 + 数据行 4
    const rows = boxes.slice(1);
    rows[0].click(); rows[2].click();
    await tick();
    expect(footText()).toContain('Σ 8 · avg 4.00');
    expect(foot.querySelector('.rt-agg-sel')?.textContent).toContain('选中 2 行');

    rows[0].click();
    await tick();
    expect(footText()).toContain('Σ 6 · avg 6.00');
    expect(foot.querySelector('.rt-agg-sel')?.textContent).toContain('选中 1 行');

    rows[2].click();
    await tick();
    expect(footText()).toContain('Σ 20 · avg 5.00');
    expect(foot.querySelector('.rt-agg-sel'), '全清后徽标消失').toBeNull();
  });

  it('列筛选收缩选中行集（K<N 真实路径）→「选中 K/N 行」+Σ 只算交集', async () => {
    localStorage.setItem('es_tbl_agg:agg605rt2', '1');
    const props = reactive({ hits: HITS, total: 4, storageKey: 'agg605rt2', fieldTypes: { age: 'long', name: 'keyword' }, selectable: true });
    await mountTbl(ResultTable, props);
    const rows = chkBoxes('.rt-chk').slice(1); // [0]=表头全选钮
    rows[0].click(); rows[1].click(); rows[2].click();
    await tick();
    expect(footText()).toContain('选中 3 行');

    /* age 列筛选只留 2/4/8（筛掉 c 行的 6）——hits 引用不变、勾选保留，
       filteredHits 收缩=「选中∩过滤后」交集只剩 a/b */
    const funnel = [...host.querySelectorAll('thead th .rt-funnel')]
      .find(b => b.getAttribute('aria-label') === '筛选 age 列') as HTMLButtonElement;
    funnel.click();
    await tick(4);
    const pop = document.querySelector('.cfp');
    expect(pop, '点击漏斗应弹出共享筛选层').not.toBeNull();
    const vals = [...pop!.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    vals[0].click(); vals[1].click(); vals[3].click(); // 勾 2/4/8，6 落选
    await tick(6);
    expect(footText()).toContain('Σ 6 · avg 3.00');
    expect(aggRow().querySelector('.rt-agg-sel')?.textContent).toContain('选中 2/3 行');
  });
});

describe('QRT 行选择聚合（六百零五批）', () => {
  it('勾 2 行 Σ 只算选中行+徽标；表头全选=全量口径徽标', async () => {
    localStorage.setItem('es_tbl_agg:agg605q', '1');
    await mountTbl(QueryResultTable, {
      rows: QROWS, cols: ['name', 'age'], storageKey: 'agg605q',
      fieldTypes: { age: 'long', name: 'keyword' }, selectable: true,
    });
    const foot = aggRow();
    expect(foot, '落盘预置开启聚合行').toBeTruthy();
    expect(footText()).toContain('Σ 20 · avg 5.00');

    const boxes = chkBoxes('.qrt-sel-col');
    expect(boxes.length).toBe(5); // 表头全选 1 + 数据行 4
    boxes[1].click(); boxes[3].click();
    await tick();
    expect(footText()).toContain('Σ 8 · avg 4.00');
    expect(foot.querySelector('.qrt-agg-sel')?.textContent).toContain('选中 2 行');

    boxes[0].click(); // 表头全选
    await tick();
    expect(footText()).toContain('Σ 20 · avg 5.00');
    expect(foot.querySelector('.qrt-agg-sel')?.textContent).toContain('选中 4 行');
  });
});

describe('TableAggFoot selHint 提示位（六百零五批）', () => {
  const base = {
    prefix: 'rt', cols: ['age'],
    foot: { age: { sum: 1, avg: 1, min: 1, max: 1 } },
    spark: null, emptyPct: {}, frozenOf: () => false,
  };
  it('缺省不传零渲染；传值渲染徽标（562 缺省零增量纪律）', async () => {
    await mountTbl(TableAggFoot, { ...base });
    expect(host.querySelector('.rt-agg-sel'), '缺省零渲染').toBeNull();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    host.innerHTML = '';
    await mountTbl(TableAggFoot, { ...base, selHint: '选中 3 行' });
    expect(host.querySelector('.rt-agg-sel')?.textContent).toContain('选中 3 行');
  });
});

describe('源码锁（六百零五批防回潮）', () => {
  const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
  const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
  it('两表 colStats 行基=aggBaseRows（选中∩过滤后单源）+ sel-hint 接线在案', () => {
    expect(rt).toContain('rows: () => aggBaseRows.value');
    expect(qrt).toContain('rows: () => aggBaseRows.value');
    expect(rt).toContain(':sel-hint="aggSelHint"');
    expect(qrt).toContain(':sel-hint="aggSelHint"');
  });
});
