/**
 * 五百三十四批 W3：表格内核第三波（数据表格内核三件）。
 * 锁定：
 * 1) P0-1 semRawCols 显式非语义类型抑制守卫——两内核 `semRawCols?: string[]`（缺省 undefined
 *    零增量），命中列跳过 semFormat「按值推断」链（≥1000 判 ms / 0..1 判 percent 误伤面），
 *    显式 fieldTypes 语义标注不受影响；useSemFormat noInfer 抑制档 + bytes 带单位字节串档
 *    （'1.2mb' → 1.2 MB，BrowserView 存储:bytes 通道平移前置）；DiagView 三槽 / BrowserView
 *    #cell-存储 槽退役换 prop 消费（源码锁）；
 * 2) P0-2 rowDrawer 行详情侧拉平移 RT（QRT 531 批同款）——缺省关零增量；开启后右键出
 *    「行详情」→ n-drawer 整行键值逐格+复制整行 JSON；
 * 3) P1-1 filterMode 跨列筛选组合档——缺省 'AND' 逐字节不变；'OR'=任一筛选列命中即保留
 *    （跨列并集）；提示行/筛选弹层注入位切换钮就地翻转；
 * 4) P2——QRT pagerOn 键盘翻页（PageUp/PageDown/Ctrl+Home/Ctrl+End 只 emit update:page）；
 *    P2「复制表头（TSV）」原放弃备案——五百三十五批单独批落地：cellMenuColMgmt:188 exact
 *    锚同步更新 15 项，下方反向锁同步翻转正锁（toContain）。
 * 挂载样板照抄 tableKernelWave531/qrtColFilter（裸 createApp + pinia；CellContextMenu
 * 自绘可挂载断言；n-drawer teleport 到 body 查 document）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import { findMenuItem } from './helpers/ctxMenu'; /* 1142：二级菜单取项 */
import { semFormat } from '../composables/useSemFormat';
import { useColFilters } from '../composables/useColFilters';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
/* 五百六十五批同步更新：QRT 弹层组合档钮退役换 ColFilterPopover 内建 chip，「组合：X」字面
   随组件单源（下方 P2 锚改读本文件） */
const cfp = readFileSync(join(__dirname, '../components/ColFilterPopover.vue'), 'utf-8');
const usf = readFileSync(join(__dirname, '../composables/useSemFormat.ts'), 'utf-8');
const ucf = readFileSync(join(__dirname, '../composables/useColFilters.ts'), 'utf-8');
const readView = (name: string) => readFileSync(join(__dirname, '../views', name), 'utf-8');
const browser = readView('BrowserView.vue');
const diag = readView('DiagView.vue');

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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  /* n-drawer teleport 到 body 的残留容器（tableKernelWave531 同款清理） */
  document.querySelectorAll('.n-drawer, .n-drawer-container, .n-drawer-body-content-wrapper, .cfp, .ccm-mask').forEach(e => e.remove());
});

/* ═══════════ 一、源码锁：semRawCols / filterMode / rowDrawer 全缺省零增量 ═══════════ */
describe('五百三十四批源码锁：两内核新 prop 在场+缺省零增量', () => {
  it('QRT：semRawCols 声明+withDefaults 缺省 undefined；消费走 semRawSet.has noInfer', () => {
    expect(qrt).toMatch(/semRawCols\?: string\[\];/);
    expect(qrt, 'withDefaults 缺省 undefined（零增量源码锁）').toMatch(/semRawCols: undefined,/);
    expect(qrt).toMatch(/semFormat\(cell, effType\(col\) \?\? '', \{ noInfer: semRawSet\.value\.has\(col\) \}\)/);
    expect(qrt).toMatch(/const semRawSet = computed\(\(\) => new Set\(props\.semRawCols \?\? \[\]\)\);/);
  });

  it('RT：semRawCols 声明在场；withDefaults 不覆盖（天然 undefined）；semText/semToneCls 消费', () => {
    expect(rt).toMatch(/semRawCols\?: string\[\];/);
    const defaults = rt.match(/>\(\), \{([\s\S]*?)\}\);/)?.[1] ?? '';
    expect(defaults, 'RT withDefaults 不得覆盖 semRawCols（缺省 undefined）').not.toContain('semRawCols');
    expect(rt).toMatch(/semFormat\(v, props\.fieldTypes\?\.\[c\] \?\? '', \{ noInfer: semRawSet\.value\.has\(c\) \}\)/);
  });

  it('filterMode 声明+缺省 AND 字面（两内核）；管线 pass filterModeLive', () => {
    expect(qrt).toMatch(/filterMode\?: 'AND' \| 'OR';/);
    expect(rt).toMatch(/filterMode\?: 'AND' \| 'OR';/);
    expect(qrt, 'QRT withDefaults 缺省 AND 字面').toMatch(/filterMode: 'AND',/);
    expect(rt, 'RT withDefaults 缺省 AND 字面').toMatch(/filterMode: 'AND',/);
    expect(qrt).toMatch(/filters\.filterRows\(rawRows\.value, filterModeLive\.value\)/);
    expect(rt).toMatch(/filterRows\(props\.hits, filterModeLive\.value\)/);
  });

  it('RT：rowDrawer prop+缺省 false+n-drawer 段+右键菜单门控（QRT 531 批同款形态）', () => {
    expect(rt).toMatch(/rowDrawer\?: boolean;/);
    expect(rt).toMatch(/rowDrawer: false,/);
    expect(rt).toMatch(/<n-drawer v-model:show="rdwOpen" :width="rdwW" placement="right">/);
    expect(rt).toMatch(/\.\.\.\(props\.rowDrawer \? \[\{ key: 'row-drawer', label: '行详情'/);
  });

  it('useSemFormat：SemFmtOpts.noInfer 抑制档收口；useColFilters：filterRows 组合档参数', () => {
    expect(usf).toMatch(/^interface SemFmtOpts \{ noInfer\?: boolean \}/m);
    expect(usf).toMatch(/opts\?: SemFmtOpts/);
    expect(usf).toMatch(/if \(opts\?\.noInfer\) return null;/);
    expect(ucf).toMatch(/function filterRows<T>\(rows: T\[\], mode: 'AND' \| 'OR' = 'AND'\)/);
  });

  it('P2：组合档切换钮双注入位（提示行/弹层槽）+QRT 键盘翻页接线（五百三十五批：复制表头项已落地，反向锁翻正锁——cellMenuColMgmt 188 行 exact 锚同步更新 15 项）（五百六十五批同步更新：QRT 手搓槽钮退役换 ColFilterPopover 内建 chip——双注入位语义等价，「组合：X」字面随组件单源）（五百六十七批同步更新：RT 手搓槽钮对称退役同换内建 chip）', () => {
    expect(qrt).toContain('copy-head-tsv');
    expect(rt).toContain('copy-head-tsv');
    /* 五百六十五批同步更新：QRT 侧手搓钮字面（class="qrt-fmode mono"/组合：{{ filterModeLive }}）
       退役换内建 chip 接线（prop+emit 同串）；提示行注入位（TableFilteredHint fmode-cls）不动
       五百六十七批同步更新：RT 侧对称退役（同串迁移 filterModeToggle561 行为锚原样通过） */
    expect(qrt).toMatch(/:filter-mode="filterModeLive" @toggle-filter-mode="toggleFilterMode"/);
    expect(cfp).toMatch(/组合：\{\{ filterMode \}\}/);
    expect(rt).toMatch(/:filter-mode="filterModeLive" @toggle-filter-mode="toggleFilterMode"/);
    expect(rt, 'RT 手搓槽钮字面对称退役').not.toMatch(/class="rt-fmode mono"/);
    expect(qrt).toMatch(/e\.key === 'PageUp'/);
  });

  it('视图平移锁：BrowserView sem-on+sem-raw-cols 接线、#cell-存储 槽退役；DiagView 三槽退役换 prop', () => {
    expect(browser).toMatch(/sem-on :sem-raw-cols="BW_SEM_RAW_COLS"/);
    expect(browser).toMatch(/const BW_SEM_RAW_COLS = \['文档数'\];/);
    expect(browser, 'BW_TYPES 显式标注不动（文档数恒 long、存储恒 bytes）')
      .toContain('const BW_TYPES: Record<string, string> = { 文档数: \'long\', 存储: \'bytes\' };');
    expect(browser, '#cell-存储 槽退役（prop 消费接管）').not.toMatch(/<template #cell-存储=/);
    expect(browser, 'storeSizeText 槽内化解退役').not.toContain('storeSizeText');
    expect(diag).toMatch(/sortable sem-on :sem-raw-cols="SEM_RAW_COLS"/);
    expect(diag, 'SEM_RAW_COLS 三槽退役').not.toMatch(/#\[`cell-`\+rc\]/);
    expect(diag).toMatch(/const SEM_RAW_COLS = \['Load1', 'Search 拒绝', 'Bulk 拒绝'\];/);
  });
});

/* ═══════════ 二、semRawCols 运行时锁：命中列保原值不判 ms/percent ═══════════ */
describe('五百三十四批运行时锁：semRawCols 抑制按值推断', () => {
  const COLS = ['n', 'm'];
  const ROWS = [
    [1500, 1500],
    [0.5, 0.5],
  ] as any;

  const qrtCells = (col: string) =>
    [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'))
      .map(tr => [...tr.querySelectorAll('td.qrt-cell')][COLS.indexOf(col)] as HTMLElement);

  it('QRT rows 型：semRawCols 命中列 1500 显 1,500 不判「1.5s」、0.5 显 0.5 不判「50%」；未命中列照旧推断', async () => {
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, semOn: true, semRawCols: ['n'] });
    expect(qrtCells('n')[0].textContent?.trim(), '命中列 ≥1000 不判 ms').toBe('1,500');
    expect(qrtCells('n')[1].textContent?.trim(), '命中列 0..1 不判 percent').toBe('0.5');
    expect(qrtCells('m')[0].textContent?.trim(), '未命中列照旧判 ms').toBe('1.5s');
    expect(qrtCells('m')[1].textContent?.trim(), '未命中列照旧判 percent').toBe('50%');
  });

  it('RT hit 型：semRawCols 命中列不判 ms；未命中列照旧', async () => {
    const HITS = [{ _id: 'a', _source: { n: 1500, m: 1500 } }] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 1, index: 'w534raw', semOn: true, semRawCols: ['n'] });
    const cellOf = (col: string) => [...host.querySelectorAll('td.rt-cell')]
      .find(td => (td as HTMLElement).dataset.col === col) as HTMLElement;
    expect(cellOf('n').textContent?.trim()).toBe('1,500');
    expect(cellOf('m').textContent?.trim()).toBe('1.5s');
  });

  it('semFormat 单元：noInfer 抑制档+显式标注不受影响+bytes 带单位字节串档', () => {
    /* 按值推断链（缺省开 / noInfer 抑制） */
    expect(semFormat(1500, '')?.text).toBe('1.5s');
    expect(semFormat(1500, '', { noInfer: true })).toBeNull();
    expect(semFormat(0.5, '', { noInfer: true })).toBeNull();
    expect(semFormat(0.5, '')?.text).toBe('50%');
    /* 显式三型标注不受 noInfer 影响（守卫只压推断不压标注） */
    expect(semFormat(2048, 'bytes', { noInfer: true })?.text).toBe('2.0 KB');
    expect(semFormat(1500, 'millis', { noInfer: true })?.text).toBe('1.5s');
    expect(semFormat(0.9, 'ratio', { noInfer: true })?.text).toBe('90%');
    /* bytes 带单位字节串档（BrowserView 存储:bytes 通道平移前置） */
    expect(semFormat('1.2mb', 'bytes')?.text).toBe('1.2 MB');
    expect(semFormat('10.5 gb', 'bytes')?.text).toBe('10.5 GB');
    expect(semFormat('512b', 'bytes')?.text).toBe('512 B');
    expect(semFormat('12,345', 'bytes'), '非字节串不误伤').toBeNull();
  });
});

/* ═══════════ 三、RT rowDrawer 运行时锁 ═══════════ */
describe('五百三十四批运行时锁：RT rowDrawer 行详情侧拉（QRT 531 同款平移）', () => {
  const RHITS = [
    { _id: 'a', _source: { name: 'banana', age: 2 } },
    { _id: 'b', _source: { name: 'apple', age: 3 } },
  ] as any;

  /* 1142：动作项住分组二级——helper 按需展开分组 */
  const ctxMenuBtn = (label: string) => findMenuItem(label) as Promise<HTMLButtonElement | null>;

  it('缺省关（零增量）：右键无「行详情」项、无侧拉 DOM', async () => {
    await mountTbl(ResultTable, { hits: RHITS, total: 2, index: 'w534rdwoff' });
    (host.querySelector('td.rt-cell') as HTMLElement)
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick(4);
    expect(await ctxMenuBtn('行详情'), '缺省无行详情菜单项').toBeNull();
    expect(document.querySelector('.n-drawer'), '缺省无侧拉 DOM').toBeNull();
  });

  it('开启后右键出「行详情」→ n-drawer 整行键值+逐格复制+「复制整行 JSON」', async () => {
    await mountTbl(ResultTable, { hits: RHITS, total: 2, index: 'w534rdwon', rowDrawer: true });
    (host.querySelector('td.rt-cell') as HTMLElement)
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick(4);
    const item = await ctxMenuBtn('行详情');
    expect(item, '开启后有行详情菜单项').toBeTruthy();
    item!.click();
    await tick(6);
    const drawer = document.querySelector('.n-drawer');
    expect(drawer, '侧拉 DOM（teleport body）').not.toBeNull();
    expect(drawer!.textContent).toContain('行详情');
    expect(drawer!.textContent).toContain('banana');
    expect(drawer!.textContent).toContain('name');
    expect(drawer!.textContent).toContain('复制整行 JSON');
    expect(drawer!.querySelectorAll('.rt-rdw-row').length, '整行可见列逐格键值').toBe(2);
  });
});

/* ═══════════ 四、filterMode OR 档运行时锁 ═══════════ */
describe('五百三十四批运行时锁：filterMode 跨列 OR 并集+缺省 AND 回归', () => {
  const FHITS = [
    { _id: 'a', _source: { name: 'banana', age: 2 } },
    { _id: 'b', _source: { name: 'apple', age: 3 } },
    { _id: 'c', _source: { name: 'cherry', age: 1 } },
  ] as any;

  const qrtFunnel = (col: string) => [...host.querySelectorAll('thead th .qrt-funnel')]
    .find(b => b.getAttribute('aria-label') === '筛选 ' + col + ' 列') as HTMLButtonElement;
  const rtFunnel = (col: string) => [...host.querySelectorAll('thead th .rt-funnel')]
    .find(b => b.getAttribute('aria-label') === '筛选 ' + col + ' 列') as HTMLButtonElement;
  const checkFirst = async () => {
    const pop = document.querySelector('.cfp')!;
    ([...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])[0].click();
    await tick(6);
  };
  const checkIdx = async (i: number) => {
    const pop = document.querySelector('.cfp')!;
    ([...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])[i].click();
    await tick(6);
  };
  const qrtDataRows = () => [...host.querySelectorAll('tbody tr')]
    .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
  const rtDataRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('td.rt-cell'));

  it('useColFilters 单元：缺省 AND 交集；OR 并集', () => {
    const ROWS2 = [{ a: 'x', b: 'p' }, { a: 'y', b: 'q' }, { a: 'z', b: 'p' }];
    const f = useColFilters({ rows: () => ROWS2, getVal: (r, c) => (r as any)[c], labelOf: (v) => String(v) });
    f.toggleFilterVal('a', 'x');
    f.toggleFilterVal('b', 'q');
    expect(f.filterRows(ROWS2), '缺省 AND=交集（空）').toEqual([]);
    expect(f.filterRows(ROWS2, 'AND')).toEqual([]);
    expect(f.filterRows(ROWS2, 'OR').map(r => (r as any).a), 'OR=跨列并集').toEqual(['x', 'y']);
  });

  it('QRT：缺省 AND 两列筛选=交集 0 行（回归）；提示行切换钮就地翻转 OR=并集 2 行', async () => {
    await mountTbl(QueryResultTable, { hits: FHITS, storageKey: 'w534fm1' });
    qrtFunnel('name')!.click(); await tick(4); await checkFirst();   /* name=banana */
    qrtFunnel('age')!.click(); await tick(4); await checkIdx(1);     /* age=3 */
    expect(qrtDataRows().length, '缺省 AND：banana∧age=3 无交集').toBe(0);
    expect(host.querySelector('.qrt-nomatch')).not.toBeNull();
    /* 提示行切换钮：AND → OR 就地翻转（prop 缺省播种零跳转） */
    const toggle = host.querySelector('.qrt-filtered .qrt-fmode') as HTMLButtonElement;
    expect(toggle.textContent?.trim()).toBe('AND');
    toggle.click();
    await tick(6);
    expect(toggle.textContent?.trim()).toBe('OR');
    expect(qrtDataRows().length, 'OR：name=banana ∪ age=3 并集 2 行').toBe(2);
  });

  it('QRT：filterMode="OR" 播种——两列筛选直接并集', async () => {
    await mountTbl(QueryResultTable, { hits: FHITS, storageKey: 'w534fm2', filterMode: 'OR' });
    qrtFunnel('name')!.click(); await tick(4); await checkFirst();
    qrtFunnel('age')!.click(); await tick(4); await checkIdx(1);
    const names = qrtDataRows().map(tr => tr.querySelectorAll('td.qrt-cell')[1]?.textContent?.trim());
    expect(names.sort()).toEqual(['apple', 'banana']);
  });

  it('RT：缺省 AND 回归+filterMode="OR" 并集', async () => {
    await mountTbl(ResultTable, { hits: FHITS, total: 3, index: 'w534rtand' });
    rtFunnel('name')!.click(); await tick(4); await checkFirst();
    rtFunnel('age')!.click(); await tick(4); await checkIdx(1);
    expect(rtDataRows().length, '缺省 AND：交集 0 行').toBe(0);
    expect(host.querySelector('.rt-filtered')!.textContent).toContain('已筛选 2 列');

    await mountTbl(ResultTable, { hits: FHITS, total: 3, index: 'w534rtor', filterMode: 'OR' });
    rtFunnel('name')!.click(); await tick(4); await checkFirst();
    rtFunnel('age')!.click(); await tick(4); await checkIdx(1);
    expect(rtDataRows().length, 'OR：并集 2 行').toBe(2);
    expect((host.querySelector('.rt-filtered .rt-fmode') as HTMLElement).textContent?.trim()).toBe('OR');
  });
});

/* ═══════════ 五、P2 运行时锁：QRT pagerOn 键盘翻页 ═══════════ */
describe('五百三十四批运行时锁：QRT pagerOn 键盘翻页（只 emit 意图）', () => {
  it('PageDown/PageUp 逐页 emit update:page；Ctrl+End 跳末页；输入态让路', async () => {
    const got: number[] = [];
    const ROWS50 = Array.from({ length: 50 }, (_, i) => [i + 1]) as any;
    await mountTbl(QueryResultTable, {
      cols: ['c'], rows: ROWS50, sortable: true,
      page: 1, pageSize: 20, total: 95,
      'onUpdate:page': (p: number) => got.push(p),
    });
    const root = host.querySelector('.qrt') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
    await tick(4);
    expect(got).toEqual([2]);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true }));
    await tick(4);
    expect(got).toEqual([2, 5]);
    /* PageUp 在第 1 页（宿主未回填 page）钳 1 不重复 emit */
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }));
    await tick(4);
    expect(got).toEqual([2, 5]);
  });

  it('缺省（无分页 prop）PageUp/PageDown 不 emit 不接管', async () => {
    const got: number[] = [];
    await mountTbl(QueryResultTable, {
      cols: ['c'], rows: [[1], [2]] as any, sortable: true,
      'onUpdate:page': (p: number) => got.push(p),
    });
    const root = host.querySelector('.qrt') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
    await tick(4);
    expect(got, 'pagerOn 关时键盘翻页静默').toEqual([]);
  });
});
