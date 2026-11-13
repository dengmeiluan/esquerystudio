/**
 * 六百零六批：全选/反选口径收口——RT 对齐 QRT「当前视图全部行」约定语义（轨3 双内核同构）。
 * 背景：RT allChecked/toggleAll/invertSel 三函数旧口径=props.hits 全量（含被列筛掉/quickFilter
 * 滤掉的不可见行），QRT 同族=allSel/toggleAllSel 基于 sortedRows 当前视图（其全选钮
 * aria-label「全选当前视图行」+title「当前视图全部行」=已约定话术）。分裂后果=筛态全选后
 * 勾选集含不可见行：批量删除 emit 全量 N（确认框「文档数 N」）而导出/复制选中行走可见交集 K
 * （currentExportRows 已收口）——同份勾选四条链两种口径；「反选」按钮 title 写「反选当前页」
 * 代码却遍历全量 hits（连自家话术都对不上）。
 * 锁定：
 * 1) RT 零回归锚：无筛选表头全选=勾全部行（sortedHits≡hits 同引用链，行为不变）；
 * 2) RT 核心：列筛选态点表头全选→只勾可见行+徽标「选中 K 行」；清筛选后勾选保留=此前可见 K 行
 *    （旧口径此处=全量 N 行+「选中 N 行」=判别点）；
 * 3) RT 反选同口径：筛态反选只翻可见行（旧口径会把不可见未勾行也勾上=判别点）；
 * 4) 源码锁：RT 三函数口径=sortedHits+全选钮可达性话术；QRT allSel/toggleAllSel=sortedRows
 *    对称锁（防未来漂移）。
 * 挂载样板照抄 aggRowSelection605（裸 createApp + pinia + api mock；聚合开关 es_tbl_agg 落盘预置）。
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
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'n1', age: 2 } },
  { _id: 'b', _source: { name: 'n2', age: 4 } },
  { _id: 'c', _source: { name: 'n3', age: 6 } },
  { _id: 'd', _source: { name: 'n4', age: 8 } },
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

const aggRow = () => host.querySelector('tfoot tr.rt-agg-row, tfoot tr.qrt-agg-row') as HTMLElement;
const chkBoxes = (sel: string) => [...host.querySelectorAll(`${sel} input[type="checkbox"]`)] as HTMLInputElement[];
const footText = () => (aggRow()?.textContent ?? '');

/* 列筛选漏斗范式（colFilterPopover524/aggRowSelection605 同构）：点 age 列漏斗→.cfp 勾值。
   vals 顺序=age 去重值升序 2/4/6/8；CFP 值 checkbox=白名单语义（colFilters 空数组=不过滤，
   勾选值=保留该值行），keepIdx=要勾选（保留）的值下标集，未在集内且已勾的取消。 */
async function filterAgeKeep(keepIdx: number[]) {
  const funnel = [...host.querySelectorAll('thead th .rt-funnel')]
    .find(b => b.getAttribute('aria-label') === '筛选 age 列') as HTMLButtonElement;
  funnel.click();
  await tick(4);
  const pop = document.querySelector('.cfp');
  if (!pop) throw new Error('点击漏斗应弹出共享筛选层');
  const vals = [...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
  vals.forEach((v, i) => { if (keepIdx.includes(i) !== v.checked) v.click(); });
  await tick(6);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 全选/反选口径收口（六百零六批）', () => {
  it('零回归锚：无筛选表头全选=勾全部 4 行+徽标「选中 4 行」+Σ 全量', async () => {
    localStorage.setItem('es_tbl_agg:agg606rt1', '1');
    const props = reactive({ hits: HITS, total: 4, storageKey: 'agg606rt1', fieldTypes: { age: 'long', name: 'keyword' }, selectable: true });
    await mountTbl(ResultTable, props);
    expect(aggRow(), '落盘预置开启聚合行').toBeTruthy();

    const boxes = chkBoxes('.rt-chk');
    expect(boxes.length).toBe(5); // 表头全选 1 + 数据行 4
    boxes[0].click(); // 表头全选
    await tick();
    expect(chkBoxes('.rt-chk').slice(1).every(b => b.checked), '4 数据行全勾').toBe(true);
    expect(footText()).toContain('Σ 20 · avg 5.00');
    expect(aggRow().querySelector('.rt-agg-sel')?.textContent).toContain('选中 4 行');
  });

  it('列筛选态表头全选=只勾可见行+「选中 3 行」；清筛选后勾选保留=此前可见 3 行（旧口径此处勾满 4 行）', async () => {
    localStorage.setItem('es_tbl_agg:agg606rt2', '1');
    const props = reactive({ hits: HITS, total: 4, storageKey: 'agg606rt2', fieldTypes: { age: 'long', name: 'keyword' }, selectable: true });
    await mountTbl(ResultTable, props);

    // 筛选：age 保留 2/4/8（下标 0/1/3），筛掉 c 行的 6
    await filterAgeKeep([0, 1, 3]);
    await tick();
    expect(chkBoxes('.rt-chk').length).toBe(4); // 表头 1 + 可见数据行 3

    chkBoxes('.rt-chk')[0].click(); // 筛选态表头全选
    await tick();
    const visBoxes = chkBoxes('.rt-chk').slice(1);
    expect(visBoxes.every(b => b.checked), '可见 3 行全勾').toBe(true);
    expect(footText()).toContain('Σ 14 · avg 4.67');
    expect(aggRow().querySelector('.rt-agg-sel')?.textContent).toContain('选中 3 行');

    // 清筛选（6 值勾回）——勾选集必须是全选时勾的 3 行，不渗入此前不可见的 c
    await filterAgeKeep([0, 1, 2, 3]);
    await tick();
    expect(footText()).toContain('Σ 14 · avg 4.67');
    expect(aggRow().querySelector('.rt-agg-sel')?.textContent).toContain('选中 3 行');
    const allRows = chkBoxes('.rt-chk').slice(1);
    expect(allRows.map(b => b.checked)).toEqual([true, true, false, true]); // c 未勾
  });

  it('筛态反选=只翻可见行（旧口径会把不可见未勾行也勾上）；反选话术=当前视图', async () => {
    localStorage.setItem('es_tbl_agg:agg606rt3', '1');
    const props = reactive({ hits: HITS, total: 4, storageKey: 'agg606rt3', fieldTypes: { age: 'long', name: 'keyword' }, selectable: true });
    await mountTbl(ResultTable, props);

    await filterAgeKeep([0, 1, 3]); // 可见 a/b/d，c 被筛掉
    // 反选钮 v-if=selected.size——先勾可见第 1 行（a）使钮渲染
    chkBoxes('.rt-chk').slice(1)[0].click();
    await tick();
    const invBtn = [...host.querySelectorAll('button')]
      .find(b => b.textContent?.trim() === '反选') as HTMLButtonElement;
    expect(invBtn, '反选钮在场').toBeTruthy();
    expect(invBtn.getAttribute('title')).toContain('反选当前视图行');
    invBtn.click();
    await tick();
    // 新口径：只翻可见 {a(勾),b,d}→next={b,d} Σ=12 avg 6.00 徽标「选中 2 行」；
    // 旧口径：遍历全量 hits→不可见 c 未勾被勾上→{b,c,d} Σ=18「选中 3 行」（判别点）
    expect(footText()).toContain('Σ 12 · avg 6.00');
    expect(aggRow().querySelector('.rt-agg-sel')?.textContent).toContain('选中 2 行');
  });
});

describe('源码锁（六百零六批防回潮）', () => {
  it('RT 勾选动作三函数口径=sortedHits 当前视图+全选钮可达性话术；QRT allSel/toggleAllSel=sortedRows 对称在案', () => {
    const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
    expect(rt).toContain('const allChecked = computed(() => sortedHits.value.length > 0 && sortedHits.value.every(h => selected.value.has(h._id)))');
    expect(rt).toContain('new Set(sortedHits.value.map(h => h._id))');
    expect(rt).toContain('new Set(sortedHits.value.map(h => h._id))');
    expect(rt).toContain('sortedHits.value.forEach(h => { if (!selected.value.has(h._id)) next.add(h._id); })');
    expect(rt).toContain('aria-label="全选当前视图行"');
    expect(rt).toContain('反选当前视图行');
    const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
    expect(qrt).toContain('sortedRows.value.every(row => {');
    expect(qrt).toContain('for (const row of sortedRows.value)');
  });
});
