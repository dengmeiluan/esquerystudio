/**
 * 五百五十二批轨3：数据表格内核七件（QRT/RT 共享内核，缺省可选 prop 零增量）。
 * 锁定：
 * ① RT pagerDisabled 可选 prop 透传内建 Pagination（缺省 false 不禁用；QRT 525 同名 prop 对位）；
 * ② QRT syncSort 宿主权威排序回填（remote+syncSort 接线档箭头/aria-sort 随宿主态、行序恒宿主
 *    原始序；null 清态；未接线档箭头恒 hint；本地档 sortSpec 权威不动）；
 * ③ QRT skeletonRows/skeletonH 参数化（缺省 3 行 30px=163 批现状；可调）；
 * ④ QRT 列头菜单补「重置列序」（columns 原序对现勾选集重置，保留勾选）；
 * ⑤ 聚合统计 median+空值率：双内核 tfoot append「· med x」（Σ·avg 前缀 contains 锁兼容）；
 *    statsOf.median 奇偶两档（numeric 四值形状逐字节不动——useColStats.spec:25 toEqual 锁）；
 *    statsOf.emptyRate 派生；ColDetailModal 网格「空值率」行；
 * ⑥ contains 包含筛选档：useColFilters.filterRows 尾部 AND 叠加（与等值/区间并存）；
 *    activeFilterCount 并入 contains；弹层 contains 行（可选 prop，缺省零变化）；
 *    QRT 漏斗激活高亮并集口径（等值∪区间∪包含）。
 * 挂载样板照抄 tableKernelWave551（裸 createApp + pinia harness）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import ColFilterPopover from '../components/ColFilterPopover.vue';
import { useColStats } from '../composables/useColStats';
import { useColFilters } from '../composables/useColFilters';

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

/* reactive props 变体：syncSort 回填 watch 需要宿主在挂载后改态（552-② 专用） */
async function mountTblR(comp: any, props: Record<string, any>) {
  const p = reactive(props);
  const app = createApp({ setup: () => () => h(comp as any, p) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
  return p;
}

/* composable 行为 harness（tableShellSecondCut528 同款：setup 内挂，结果镜像到 outer） */
function runSetup(fn: () => void) {
  const app = createApp({ setup() { fn(); return () => h('div'); } });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
}

function lastUnmount() {
  const a = apps.pop();
  try { a?.unmount(); } catch { /* 已卸载 */ }
  host.innerHTML = '';
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .cfp-mask, .ccm-mask').forEach(e => e.remove());
});

const funnelOf = (col: string) =>
  [...host.querySelectorAll('thead th .qrt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 ' + col + ' 列') as HTMLButtonElement;

const thOf = (col: string) =>
  [...host.querySelectorAll('thead th')].find(t => (t as HTMLElement).dataset.col === col) as HTMLElement;

const dataRows = () =>
  [...host.querySelectorAll('tbody tr td.qrt-idx')].map(e => e.textContent);

async function openColMenu(col: string) {
  thOf(col).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  await tick(4);
}
const menuButtons = () => [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];

async function typeIn(inp: HTMLInputElement, v: string) {
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await tick(6);
}

/* ═══════════ 一、内核 prop 面（①②③④） ═══════════ */
describe('五百五十二批 A：内核 prop 面（pagerDisabled/syncSort/骨架/重置列序）', () => {
  it('① RT：内建 Pagination 透传 pagerDisabled（缺省可用 / true 禁用）', async () => {
    const HITS = [{ _id: 'a', _source: { v: 1 } }, { _id: 'b', _source: { v: 2 } }] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 30, page: 1, pageSize: 10, index: 'w552r1' });
    const next = () => host.querySelector('.rt-bar .pgn button[aria-label="下一页"]') as HTMLButtonElement;
    expect(next(), '内建分页器在场').toBeTruthy();
    expect(next()!.disabled, '缺省 pagerDisabled=false 可点').toBe(false);
    lastUnmount();
    await mountTbl(ResultTable, { hits: HITS, total: 30, page: 1, pageSize: 10, pagerDisabled: true, index: 'w552r1b' });
    expect(next()!.disabled, 'pagerDisabled=true 禁用（宿主执行中契约）').toBe(true);
  });

  it('② QRT：syncSort 回填——箭头/aria-sort 随宿主态，行序不动；null 清态', async () => {
    const p = await mountTblR(QueryResultTable, {
      cols: ['v', 'w'], rows: [[3, 'c'], [1, 'a'], [2, 'b']] as any,
      sortable: true, remoteSort: true, syncSort: { f: 'v', d: -1 },
    });
    const th = () => thOf('v');
    expect(th()!.getAttribute('aria-sort'), '宿主降序态回显').toBe('descending');
    expect(th()!.className, '排序列高亮').toContain('on');
    expect(th()!.querySelector('.qrt-sort-i')!.textContent).toBe('↓');
    expect((host.querySelector('tbody tr td.qrt-cell') as HTMLElement).textContent, '行序权威=宿主原始序（显示链不参与排序）').toBe('3');
    p.syncSort = { f: 'v', d: 1 };
    await tick();
    expect(th()!.getAttribute('aria-sort'), '宿主改升序回显').toBe('ascending');
    expect(th()!.querySelector('.qrt-sort-i')!.textContent).toBe('↑');
    p.syncSort = null;
    await tick();
    expect(th()!.getAttribute('aria-sort'), 'null 清态').toBeNull();
    expect(th()!.className).not.toContain('on');
  });

  it('② QRT：未接线档（无 syncSort）箭头恒 hint；本地档 sortSpec 权威不动', async () => {
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[2], [1]] as any, sortable: true, remoteSort: true });
    const th = thOf('v');
    expect(th.getAttribute('aria-sort'), 'remote 未接线档 aria-sort 恒无').toBeNull();
    expect(th.className).not.toContain('on');
    expect(th.querySelector('.qrt-sort-i')!.textContent, '箭头恒 hint').toBe('⇅');
    lastUnmount();
    /* 本地档：syncSort 传入也不接管——显示/行序权威仍是 sortSpec */
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[2], [1]] as any, sortable: true, syncSort: { f: 'v', d: -1 } as any });
    thOf('v').click();
    await tick();
    expect(thOf('v').getAttribute('aria-sort'), '本地档显示链=sortSpec').toBe('ascending');
    expect(dataRows(), '本地点击真的排序了（syncSort 不劫持本地链）').toEqual(['1', '2']);
  });

  it('③ QRT：骨架缺省 3 行 30px（163 批现状逐字节）；skeletonRows/skeletonH 可调', async () => {
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[1]] as any, loading: true });
    const sk = () => [...host.querySelectorAll('.qrt-loading .sk')] as HTMLElement[];
    expect(sk().length, '缺省 3 行').toBe(3);
    expect(sk().every(e => e.style.height === '30px'), '缺省 30px').toBe(true);
    lastUnmount();
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[1]] as any, loading: true, skeletonRows: 2, skeletonH: '44px' });
    expect(sk().length, 'skeletonRows 可调').toBe(2);
    expect(sk().every(e => e.style.height === '44px'), 'skeletonH 可调').toBe(true);
  });

  it('④ QRT：列头菜单「重置列序」——columns 原序对现勾选集重置（保留勾选）', async () => {
    await mountTbl(QueryResultTable, { cols: ['v', 'w'], rows: [[1, 'x'], [2, 'y']] as any, storageKey: 'w552q4' });
    /* 先把 w 置首（列头右键「此列置首」）→ 列序 [w, v] */
    await openColMenu('w');
    (menuButtons().find(b => b.textContent?.includes('此列置首')) as HTMLElement).click();
    await tick(6);
    const heads = () => [...host.querySelectorAll('thead th[data-col]')].map(t => (t as HTMLElement).dataset.col);
    expect(heads(), '置首生效（前置态）').toEqual(['w', 'v']);
    /* 重置列序 → 回 columns 原序，勾选集两列都在 */
    await openColMenu('w');
    const reset = menuButtons().find(b => b.textContent?.includes('重置列序'));
    expect(reset, '列头菜单有「重置列序」项').toBeTruthy();
    reset!.click();
    await tick(6);
    expect(heads(), 'columns 原序重置').toEqual(['v', 'w']);
  });
});

/* ═══════════ 二、聚合统计 median/空值率 + contains 包含筛选档（⑤⑥） ═══════════ */
describe('五百五十二批 B：median/emptyRate + contains 档', () => {
  it('⑤ 双内核 tfoot append「· med」；Σ·avg 前缀 contains 锁兼容', async () => {
    localStorage.setItem('es_tbl_agg:w552q5', '1');
    await mountTbl(QueryResultTable, { cols: ['name', 'v'], rows: [['a', 50], ['b', 80], ['c', 90]] as any, storageKey: 'w552q5' });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row') as HTMLElement;
    expect(tfoot, '聚合行渲染').toBeTruthy();
    expect(tfoot.textContent, '既有 Σ/avg 前缀逐字节不动（wave535/538/551 contains 口径）').toContain('Σ 220 · avg 73.33');
    expect(tfoot.textContent, 'median append 档（奇数取中）').toContain('· med 80');
    lastUnmount();
    localStorage.setItem('es_tbl_agg:w552r5', '1');
    const HITS = [
      { _id: 'a', _source: { v: 50 } }, { _id: 'b', _source: { v: 80 } }, { _id: 'c', _source: { v: 90 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w552r5' });
    const rfoot = host.querySelector('tfoot tr.rt-agg-row') as HTMLElement;
    expect(rfoot, 'RT 聚合行渲染').toBeTruthy();
    expect(rfoot.textContent).toContain('Σ 220 · avg 73.33');
    expect(rfoot.textContent, 'RT 同构 append').toContain('· med 80');
  });

  it('⑤ statsOf.median（奇偶两档；numeric 四值形状逐字节不动）与 emptyRate 派生', () => {
    let s1: any, s2: any, s3: any;
    runSetup(() => {
      const ucs = useColStats({
        rows: () => [{ v: 10 }, { v: 20 }, { v: 30 }, { v: 40 }, { v: '' }, { v: null }],
        getVal: (r: any) => r.v,
        labelOf: (v: any) => String(v),
      });
      s1 = ucs.statsOf('v');
      s2 = useColStats({
        rows: () => [{ v: 10 }, { v: 20 }, { v: 90 }],
        getVal: (r: any) => r.v,
        labelOf: (v: any) => String(v),
      }).statsOf('v');
      s3 = useColStats({
        rows: () => [{ v: 'x' }, { v: null }],
        getVal: (r: any) => r.v,
        labelOf: (v: any) => String(v),
      }).statsOf('v');
    });
    expect(s1.median, '偶数取中间两值均值').toBe(25);
    expect(s1.numeric, '既有 numeric 四值形状不动（useColStats.spec:25 toEqual 锁兼容）').toEqual({ sum: 100, avg: 25, min: 10, max: 40 });
    expect(s1.empty).toBe(2);
    expect(s1.emptyRate, 'emptyRate=empty/(empty+count) 派生').toBeCloseTo(2 / 6, 10);
    expect(s2.median, '奇数取中').toBe(20);
    expect(s3.median, '非数值列 median=null').toBeNull();
    expect(s3.emptyRate, '全空列 emptyRate=1').toBe(0.5);
  });

  it('⑤ ColDetailModal 网格「空值率」行（Math.round 四舍五入 %）', async () => {
    await mountTbl(QueryResultTable, {
      hits: [
        { _id: 'a', _source: { v: 1 } }, { _id: 'b', _source: { v: '' } },
        { _id: 'c', _source: { v: null } }, { _id: 'd', _source: { v: null } },
      ] as any,
      storageKey: 'w552q5b',
    });
    await openColMenu('v');
    (menuButtons().find(b => b.textContent?.includes('列详情')) as HTMLElement).click();
    await tick(6);
    const card = document.body.querySelector('.rt-cd') as HTMLElement | null;
    expect(card, '列详情弹窗打开').toBeTruthy();
    expect(card!.textContent, '网格有「空值率」行').toContain('空值率');
    expect(card!.textContent, '3/4 空值 → 75%').toContain('75%');
  });

  it('⑥ useColFilters：contains 档 filterRows 尾部 AND 叠加；activeFilterCount 并入', () => {
    const ROWS = [
      { id: 1, name: 'banana', level: 'warn' },
      { id: 2, name: 'apple', level: 'info' },
      { id: 3, name: 'banana', level: 'warn' },
      { id: 4, name: 'cherry', level: null },
    ];
    let f: any;
    runSetup(() => {
      f = useColFilters({
        rows: () => ROWS,
        getVal: (row: any, col: string) => row[col],
        labelOf: (v: any) => String(v),
      });
    });
    expect(f.filterRows(ROWS).length, '未设包含档=恒等零增量').toBe(4);
    expect(f.activeFilterCount.value).toBe(0);
    f.setContainsFilter('name', 'AN');
    expect(f.filterRows(ROWS).map((r: any) => r.id), '大小写不敏感 contains').toEqual([1, 3]);
    expect(f.activeFilterCount.value, 'contains 计入已筛选列数').toBe(1);
    /* 与等值勾选 AND 叠加 */
    f.toggleFilterVal('level', 'info');
    expect(f.filterRows(ROWS).length, 'contains∩等值=空集').toBe(0);
    /* OR 档：任一命中即保留（contains 列 ∪ 等值列并集） */
    expect(f.filterRows(ROWS, 'OR').map((r: any) => r.id), 'OR 档并集').toEqual([1, 2, 3]);
    f.clearFilter('level');
    expect(f.filterRows(ROWS).map((r: any) => r.id)).toEqual([1, 3]);
    /* 空白串=该列不设限；null 值不命中 */
    f.setContainsFilter('level', 'null');
    expect(f.filterRows(ROWS).length, 'null 值不参与包含匹配').toBe(0);
    f.clearFilter('level');
    f.setContainsFilter('name', '   ');
    expect(f.filterRows(ROWS).length, '空白包含词不生效').toBe(4);
    expect(f.activeFilterCount.value, '空白包含词不计入').toBe(0);
    f.setContainsFilter('name', 'an');
    f.clearAllFilters();
    expect(f.filterRows(ROWS).length, 'clearAllFilters 连 contains 一并清').toBe(4);
    expect(f.activeFilterCount.value).toBe(0);
  });

  it('⑥ QRT：弹层包含输入行→行过滤+漏斗高亮；区间档同样点亮（并集口径）', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['name', 'n'], rows: [['banana', 1], ['apple', 2], ['cherry', 3]] as any,
      storageKey: 'w552q6', fieldTypes: { n: 'long' },
    });
    /* 包含行：输入 an → 只剩 banana */
    funnelOf('name')!.click();
    await tick(4);
    const pop = document.querySelector('.cfp') as HTMLElement;
    expect(pop, '弹层打开').toBeTruthy();
    const cinp = pop.querySelector('input[aria-label="name 包含文本筛选"]') as HTMLInputElement;
    expect(cinp, '包含筛选输入行在场').toBeTruthy();
    await typeIn(cinp, 'an');
    expect(dataRows(), 'contains 过滤行集').toEqual(['1']);
    expect(funnelOf('name')!.classList.contains('on'), '包含档点亮漏斗').toBe(true);
    expect(host.querySelector('.qrt-bar')!.textContent).toContain('已筛选 1 列');
    /* 清除包含档（弹层「清除」=该列三档同清），再验区间档并集口径 */
    (pop.querySelector('.cfp-clear') as HTMLButtonElement).click();
    await tick(6);
    expect(dataRows(), '清除后恢复全行').toEqual(['1', '2', '3']);
    /* 区间档：此前漏斗只认等值勾选——并集口径修复后同样点亮 */
    funnelOf('n')!.click();
    await tick(4);
    const rpop = document.querySelector('.cfp') as HTMLElement;
    const minp = rpop.querySelector('input[aria-label="n 最小值（含）"]') as HTMLInputElement;
    expect(minp, '数值列区间输入在场').toBeTruthy();
    await typeIn(minp, '2');
    expect(dataRows(), '区间过滤行集（n≥2）').toEqual(['1', '2']);
    expect(funnelOf('n')!.classList.contains('on'), '区间档点亮漏斗（并集口径）').toBe(true);
    expect(host.querySelector('.qrt-bar')!.textContent).toContain('已筛选 1 列');
  });

  it('⑥ ColFilterPopover：缺省（未传 contains）弹层零变化——无包含输入行（554 同步更新：原以 RT 为「未传 contains」载体；554 起 RT 通道接入 contains（isContainsCol 守卫门控），载体缺省零增量语义改由共享件直挂锁定，并同步更新补 RT 守卫面；例不删）', async () => {
    /* 载体同步更新：共享件直挂（Browser/Plugins/Security 通道同形态——不传 contains），
       锁定 552 原意图「未传 contains=无包含行」的壳缺省零增量 */
    const cfpHost = document.createElement('div');
    document.body.appendChild(cfpHost);
    const app2 = createApp({
      setup: () => () => h(ColFilterPopover as any, {
        col: 'name', x: 12, y: 20,
        vals: [{ v: 'banana', n: 2 }, { v: 'apple', n: 1 }],
        total: 2, selected: [], normOf: (v: any) => String(v),
      }),
    });
    app2.use(createPinia());
    app2.mount(cfpHost);
    apps.push(app2);
    await tick(4);
    const pop2 = document.querySelector('.cfp') as HTMLElement;
    expect(pop2, '弹层打开').toBeTruthy();
    expect(pop2.querySelector('input[aria-label="name 包含文本筛选"]'), '未传 contains=无包含行（五通道零增量，原 552 意图保真）').toBeNull();
    lastUnmount();
    /* 554 同步更新补面：RT 通道已接 contains——显式非语义类型（binary）仍无包含行（守卫门控）；
       untyped 列照出包含行（QRT 552:292 'name' 自洽对称件，行为锁随接入翻正） */
    const HITS = [
      { _id: 'a', _source: { name: 'banana', blob: 'AAAA' } }, { _id: 'b', _source: { name: 'apple', blob: 'BBBB' } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w554r6', fieldTypes: { blob: 'binary' } });
    const btn = [...host.querySelectorAll('thead th .rt-funnel')]
      .find(b => b.getAttribute('aria-label') === '筛选 name 列') as HTMLButtonElement;
    expect(btn, 'RT 漏斗在场').toBeTruthy();
    btn.click();
    await tick(6);
    const pop = document.querySelector('.cfp') as HTMLElement;
    expect(pop, '弹层打开').toBeTruthy();
    expect(pop.querySelector('input[aria-label="name 包含文本筛选"]'), 'untyped 列包含行照出（554 RT 接入档）').toBeTruthy();
    const blobBtn = [...host.querySelectorAll('thead th .rt-funnel')]
      .find(b => b.getAttribute('aria-label') === '筛选 blob 列') as HTMLButtonElement;
    blobBtn.click();
    await tick(6);
    const popB = document.querySelector('.cfp') as HTMLElement;
    expect(popB, 'blob 弹层打开').toBeTruthy();
    expect(popB.querySelector('input[aria-label="blob 包含文本筛选"]'), '显式 binary 列无包含行（isContainsCol 守卫）').toBeNull();
  });
});
