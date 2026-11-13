/**
 * 五百三十批 W-B：QRT 表格内核扩展五件（全部缺省零增量）+ RT semOn 最小接线。
 * 锁定：
 * 1) quickFilter：跨可见列 contains 过滤，与既有列筛选 AND 叠加；生效且 0 行走既有
 *    空态链（EmptyState 文案零改）；不传零增量；
 * 2) selectable：首列勾选/表头全选/tr 挂 qrt-sel/emit selection-change；与 rowClass
 *    并存；缺省零 DOM 零事件；
 * 3) semOn + useSemFormat：bytes/duration/percent 三型（纯函数分档 tone）；显示加工、
 *    title 恒 raw；QRT/RT 缺省不传全链零变化；
 * 4) exportRowFilter：csvBlock 行级过滤（CSV/MD/XLSX 三管道同收口）；
 * 5) 单元格右键「仅筛选当前结果（不改查询）」：等价点列头筛选并勾入该值；仅 rows 型 sortable 可用。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../../components/QueryResultTable.vue';
import { findMenuItem } from '../../__tests__/helpers/ctxMenu'; /* 1142：二级菜单取项 */
import ResultTable from '../../components/ResultTable.vue';
import { semFormat } from '../../composables/useSemFormat';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const COLS = ['name', 'n'];
const ROWS = [
  ['apple', 12288],
  ['banana', 1024],
  ['cherry', 7],
] as any;

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(comp: any, props: Record<string, any>, tblRef?: ReturnType<typeof ref>) {
  const p: Record<string, any> = tblRef ? { ...props, ref: tblRef } : props;
  const app = createApp({ setup: () => () => h(comp as any, p) });
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
  document.querySelectorAll('.cfp, .ccm-mask').forEach(e => e.remove());
});

const dataRows = () => [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
/* 1142：动作项住分组二级——helper 按需展开分组 */
const ctxMenuBtn = (label: string) => findMenuItem(label) as Promise<HTMLButtonElement | null>;
const cellMenu = async (td: HTMLElement, x = 10, y = 10) => {
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  await tick(4);
};

/* ═══════════ 一、useSemFormat 纯函数（三型+分档 tone） ═══════════ */
describe('useSemFormat.semFormat（五百三十批 W-B）', () => {
  it('bytes：effType 标注（bytes/byte_size）→ 1024 进制档位制全量；无标注裸数字不 bytes 化', () => {
    expect(semFormat(12288, 'bytes')).toEqual({ text: '12.0 KB' });
    expect(semFormat(1319414, 'bytes')!.text).toMatch(/^1\.3 MB$/);
    expect(semFormat(500, 'bytes')!.text).toBe('500 B');
    expect(semFormat('2048', 'byte_size')!.text).toBe('2.0 KB');
    expect(semFormat(-5, 'bytes')).toBeNull();
    expect(semFormat(12288, '')!.text).toBe('12.3s'); /* 裸数字归 duration 推断（bytes 不裸推） */
  });
  it('duration：纯数字≥1000 视为 ms → 1.2s；已有 s/ms 后缀原样（null 回落）；effType 标注小值出 ms', () => {
    expect(semFormat(1223, '')).toEqual({ text: '1.2s' });
    expect(semFormat(999, '')).toBeNull();            /* 按值推断门槛 */
    expect(semFormat('1.2s', '')).toBeNull();         /* 已有后缀原样 */
    expect(semFormat('300ms', '')).toBeNull();
    expect(semFormat(250, 'duration_ms')!.text).toBe('250 ms');
    expect(semFormat(1223, 'duration_ms')!.text).toBe('1.2s');
  });
  it('percent：0..1 数字与 % 结尾串分档 tone（≥0.9 红/≥0.7 黄/其余绿）；effType=percent 裸数字 0..100 全量；越界不命中', () => {
    expect(semFormat(0.85, '')).toEqual({ text: '85%', tone: 'y' });
    expect(semFormat(0.95, '')!.tone).toBe('r');
    expect(semFormat(0.5, '')).toEqual({ text: '50%', tone: 'g' });
    expect(semFormat('85%', '')).toEqual({ text: '85%', tone: 'y' });
    expect(semFormat(85, 'percent')!.text).toBe('85%');
    expect(semFormat(150, 'percent')).toBeNull();
    expect(semFormat(1.5, '')).toBeNull();            /* 裸数字 1..100 无标注不 percent 化 */
  });
});

/* ═══════════ 二、QRT quickFilter ═══════════ */
describe('QRT quickFilter 跨可见列 contains 过滤', () => {
  it('contains 命中过滤行集；不传/空白=全量（零增量）', async () => {
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, quickFilter: 'AN' }); /* 大小写不敏感 contains */
    expect(dataRows().length).toBe(1); /* 仅 banana */
    expect(dataRows()[0].textContent).toContain('banana');
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, quickFilter: '   ' });
    expect(dataRows().length).toBe(3);
  });
  it('与既有列筛选 AND 叠加（列筛选在 quickFilter 之前收窄，交集 0 行落空态链）', async () => {
    await mountTbl(QueryResultTable, { cols: ['name', 'grp'], rows: [['a1', 'x'], ['a2', 'x'], ['b1', 'y']], sortable: true, quickFilter: 'a1' });
    expect(dataRows().length).toBe(1); /* quick 先收 a1 */
    /* 通过列筛选弹层勾 grp=y → AND 后 0 行 → EmptyState（两链 AND 叠加） */
    const funnel = [...host.querySelectorAll('thead th .qrt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 grp 列') as HTMLButtonElement;
    funnel.click(); await tick(4);
    const pop = document.querySelector('.cfp')!;
    expect(pop).not.toBeNull();
    ([...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[])[1].click(); /* 勾 y */
    await tick(6);
    expect(host.querySelector('.qrt-wrap')).toBeNull();
    expect(host.querySelector('.empty-state')).not.toBeNull();
    expect(host.querySelector('.qrt-nomatch')).toBeNull();
  });
  it('生效且 0 行 → 走既有空态链（EmptyState 文案零改）；不生效时列筛选 0 行仍走 qrt-nomatch 既有链', async () => {
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, quickFilter: 'zzz', emptyText: '无数据' });
    expect(host.querySelector('.qrt-wrap')).toBeNull();
    expect(host.querySelector('.empty-state .es-text')!.textContent).toBe('无数据');
    expect(host.querySelector('.qrt-nomatch')).toBeNull();
  });
});

/* ═══════════ 三、QRT selectable 行多选 ═══════════ */
describe('QRT selectable 行多选通道', () => {
  it('首列勾选：tr 挂 qrt-sel + emit selection-change（原始行对象）', async () => {
    const got: unknown[][] = [];
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, selectable: true, onSelectionChange: (r: unknown[]) => got.push(r) });
    const boxes = [...host.querySelectorAll('tbody .qrt-sel-col input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes.length).toBe(3);
    boxes[0].click(); await tick(4);
    expect(dataRows()[0].classList.contains('qrt-sel')).toBe(true);
    expect(got[got.length - 1]).toEqual([['apple', 12288]]);
    boxes[0].click(); await tick(4);
    expect(dataRows()[0].classList.contains('qrt-sel')).toBe(false);
    expect(got[got.length - 1]).toEqual([]);
  });
  it('表头全选=当前视图全量；再点取消全选', async () => {
    const got: unknown[][] = [];
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, selectable: true, onSelectionChange: (r: unknown[]) => got.push(r) });
    const head = host.querySelector('thead .qrt-sel-col input[type="checkbox"]') as HTMLInputElement;
    expect(head, '表头应有全选勾选框').not.toBeNull();
    head.click(); await tick(4);
    expect(dataRows().every(tr => tr.classList.contains('qrt-sel'))).toBe(true);
    expect(got[got.length - 1]!.length).toBe(3);
    head.click(); await tick(4);
    expect(dataRows().every(tr => !tr.classList.contains('qrt-sel'))).toBe(true);
    expect(got[got.length - 1]).toEqual([]);
  });
  it('与 rowClass 类并存（勾选类 + rowClass 返回类同 tr）', async () => {
    await mountTbl(QueryResultTable, {
      cols: COLS, rows: ROWS, selectable: true,
      rowClass: (row: any) => (row[1] === 1024 ? 'rc-y' : undefined),
    });
    const boxes = [...host.querySelectorAll('tbody .qrt-sel-col input[type="checkbox"]')] as HTMLInputElement[];
    boxes[1].click(); await tick(4);
    const tr = dataRows()[1];
    expect(tr.classList.contains('qrt-sel')).toBe(true);
    expect(tr.classList.contains('rc-y')).toBe(true);
  });
  it('缺省 selectable 不渲染勾选列/不挂 qrt-sel（零增量）', async () => {
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS });
    expect(host.querySelectorAll('.qrt-sel-col').length).toBe(0);
    expect(dataRows().every(tr => !tr.classList.contains('qrt-sel'))).toBe(true);
  });
});

/* ═══════════ 四、QRT exportRowFilter（导出三管道行级过滤） ═══════════ */
describe('QRT exportRowFilter 行级导出过滤', () => {
  it('注入谓词过滤 csvBlock 行（MD/XLSX 同走 csvBlock 收口）；不传=全量', async () => {
    const tblRef = ref<any>(null);
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, exportRowFilter: (r: unknown) => (r as any[])[1] >= 1024 }, tblRef);
    const blk = tblRef.value.getCsvBlock();
    expect(blk.rows.length).toBe(2);
    expect(blk.head).toEqual(COLS);
    const tblRef2 = ref<any>(null);
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS }, tblRef2);
    expect(tblRef2.value.getCsvBlock().rows.length).toBe(3);
  });
  it('源码锁：行过滤收口在 csvBlock（CSV/MD/XLSX 三管道共同数据源），显示渲染不走该谓词', () => {
    const src = readFileSync(join(__dirname, '../../components/QueryResultTable.vue'), 'utf-8');
    expect(src).toMatch(/exportRowFilter\?: \(row: unknown\) => boolean;/);
    expect(src).toMatch(/const srcRows = props\.exportRowFilter \? sortedRows\.value\.filter\(r => props\.exportRowFilter!\(r\)\) : sortedRows\.value;/);
  });
});

/* ═══════════ 五、QRT semOn 语义渲染扩展 ═══════════ */
describe('QRT semOn 语义渲染（useSemFormat 接线）', () => {
  it('semOn 命中：percent/bytes 显示格式化 text + tone 类；title 恒 raw', async () => {
    await mountTbl(QueryResultTable, {
      cols: ['p', 'b'], rows: [[0.85, 12288], [0.5, 7]], semOn: true,
      fieldTypes: { p: 'percent', b: 'bytes' },
    });
    const tds = [...host.querySelectorAll('tbody tr:first-child td.qrt-cell')] as HTMLElement[];
    expect(tds[0].textContent?.trim()).toBe('85%');
    expect(tds[0].classList.contains('qrt-sem-y')).toBe(true);
    expect(tds[0].getAttribute('title')).toBe('0.85'); /* raw 恒在 title */
    expect(tds[1].textContent?.trim()).toBe('12.0 KB');
    expect(tds[1].getAttribute('title')).toBe('12288');
    const tds2 = [...host.querySelectorAll('tbody tr:nth-child(2) td.qrt-cell')] as HTMLElement[];
    expect(tds2[0].textContent?.trim()).toBe('50%');
    expect(tds2[0].classList.contains('qrt-sem-g')).toBe(true);
    expect(tds2[1].textContent?.trim()).toBe('7 B');
  });
  it('不传 semOn：文本走既有渲染链（12288 走既有大整数千分位=54 批现状）、无 qrt-sem 类（零增量）', async () => {
    await mountTbl(QueryResultTable, { cols: ['p', 'b'], rows: [[0.85, 12288]] });
    const tds = [...host.querySelectorAll('tbody td.qrt-cell')] as HTMLElement[];
    expect(tds[0].textContent?.trim()).toBe('0.85');
    expect(tds[1].textContent?.trim()).toBe('12,288');
    expect(tds.every(td => ![...td.classList].some(c => c.startsWith('qrt-sem-')))).toBe(true);
  });
});

/* ═══════════ 六、单元格右键「仅筛选当前结果（不改查询）」 ═══════════ */
describe('QRT 单元格右键按此值筛选', () => {
  it('rows 型 sortable：菜单项出现；点击=勾入该值+开既有筛选弹层，行集收窄', async () => {
    await mountTbl(QueryResultTable, { cols: ['name', 'grp'], rows: [['a1', 'x'], ['a2', 'x'], ['b1', 'y']], sortable: true });
    const td = dataRows()[0].querySelectorAll('td.qrt-cell')[1] as HTMLElement; /* grp=x 格 */
    await cellMenu(td, 20, 20);
    const item = await ctxMenuBtn('仅筛选当前结果（不改查询）');
    expect(item, 'rows 型 sortable 应有按此值筛选项').toBeTruthy();
    item!.click(); await tick(6);
    expect(document.querySelector('.cfp')).not.toBeNull(); /* 复用既有列筛选弹层 */
    expect(dataRows().length).toBe(2);                     /* grp=x 两行 */
    expect(dataRows().every(tr => tr.textContent!.includes('x'))).toBe(true);
  });
  it('hits 型隐藏；rows 型非 sortable 隐藏（零增量）', async () => {
    const HITS = [{ _id: 'a', _source: { name: 'apple' } }] as any;
    await mountTbl(QueryResultTable, { hits: HITS, sortable: true });
    await cellMenu(dataRows()[0].querySelectorAll('td.qrt-cell')[0] as HTMLElement);
    expect(await ctxMenuBtn('仅筛选当前结果（不改查询）'), 'hits 型隐藏').toBeNull();
    document.querySelectorAll('.ccm-mask').forEach(e => e.remove());
    await mountTbl(QueryResultTable, { cols: ['name'], rows: [['apple']] }); /* 非 sortable */
    await cellMenu(dataRows()[0].querySelectorAll('td.qrt-cell')[0] as HTMLElement);
    expect(await ctxMenuBtn('仅筛选当前结果（不改查询）'), '非 sortable 隐藏').toBeNull();
    expect(await ctxMenuBtn('加入查询条件并重查'), '未开 useAsCondition 时零增量').toBeNull();
  });
});

/* ═══════════ 七、RT semOn 最小接线 ═══════════ */
describe('RT semOn 语义渲染（最小接线）', () => {
  const HITS = [
    { _id: 'a', _source: { p: 0.85, b: 12288 } },
    { _id: 'b', _source: { p: 0.5, b: 7 } },
  ] as any;
  it('semOn 命中：显示格式化 text + rt-sem tone 类；title 恒 raw', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', semOn: true, fieldTypes: { p: 'percent', b: 'bytes' } });
    const tds = [...host.querySelectorAll('tbody tr:first-child td.rt-cell')] as HTMLElement[];
    expect(tds[0].textContent?.trim()).toBe('85%');
    expect(tds[0].classList.contains('rt-sem-y')).toBe(true);
    expect(tds[0].getAttribute('title')).toBe('0.85');
    expect(tds[1].textContent?.trim()).toBe('12.0 KB');
  });
  it('不传 semOn：文本原样、无 rt-sem 类（零增量）', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i2' });
    const tds = [...host.querySelectorAll('tbody tr:first-child td.rt-cell')] as HTMLElement[];
    expect(tds[0].textContent?.trim()).toBe('0.85');
    expect(tds2NoSem(tds)).toBe(true);
  });
});
function tds2NoSem(tds: HTMLElement[]): boolean {
  return tds.every(td => ![...td.classList].some(c => c.startsWith('rt-sem-')));
}

/* ═══════════ 八、RT 内核三件补齐（五百三十一批 W-B，QRT 530 批同款平移）═══════════ */
describe('RT quickFilter/selectable/exportRowFilter（531 批，全缺省零增量）', () => {
  const HITS = [
    { _id: 'a', _source: { name: 'apple', grp: 'x' } },
    { _id: 'b', _source: { name: 'banana', grp: 'y' } },
    { _id: 'c', _source: { name: 'cherry', grp: 'x' } },
  ] as any;
  it('quickFilter contains 过滤行集（跨可见列，大小写不敏感）；与列筛选同管线 AND', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w531qf', quickFilter: 'AN' });
    expect(dataRows().length).toBe(1); /* 仅 banana */
    expect(dataRows()[0].textContent).toContain('banana');
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w531qf2', quickFilter: '   ' });
    expect(dataRows().length).toBe(3); /* 空白=全量 */
  });
  it('quickFilter 生效且 0 行 → 并入空态链（文案走既有 emptyText）；不生效时列筛选 0 行仍走既有 nomatch 行', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w531qf3', quickFilter: 'zzz', emptyText: '没有文档' });
    expect(host.querySelector('.empty-state .es-text')!.textContent).toBe('没有文档');
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w531qf4', quickFilter: 'apple' });
    expect(host.querySelector('.empty-state')).toBeNull();
    expect(dataRows().length).toBe(1);
  });
  it('selectable：勾选 emit selection-change（原始 hit 数组）；缺省不 emit（零增量）', async () => {
    const got: unknown[][] = [];
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w531sel', selectable: true, onSelectionChange: (r: unknown[]) => got.push(r) });
    const box = host.querySelector('tbody .rt-chk input[type="checkbox"]') as HTMLInputElement;
    box.click(); await tick(4);
    expect(got[got.length - 1]).toEqual([HITS[0]]); /* 原始 hit 对象 */
    (host.querySelector('thead .rt-chk input[type="checkbox"]') as HTMLInputElement).click(); await tick(4);
    expect(got[got.length - 1]!.length).toBe(3);
    /* 缺省 selectable：既有勾选链不 emit */
    const got2: unknown[][] = [];
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w531sel2', onSelectionChange: (r: unknown[]) => got2.push(r) });
    (host.querySelector('tbody .rt-chk input[type="checkbox"]') as HTMLInputElement).click(); await tick(4);
    expect(got2.length).toBe(0);
  });
  it('源码锁：三件可选声明 + 事件缺省静默 + exportRowFilter 矩阵三格式收口（JSON 恒 raw）', () => {
    const src = readFileSync(join(__dirname, '../../components/ResultTable.vue'), 'utf-8');
    expect(src).toMatch(/quickFilter\?: string;/);
    expect(src).toMatch(/selectable\?: boolean;/);
    expect(src).toMatch(/exportRowFilter\?: \(row: unknown\) => boolean;/);
    expect(src).toMatch(/if \(!props\.selectable\) return;/);
    expect(src).toMatch(/const rows = fmt !== 'json' && props\.exportRowFilter\s*\?\s*rows0\.filter\(r => props\.exportRowFilter!\(r\)\)\s*:\s*rows0;/);
    expect(src).toMatch(/v-if="!loading && !effTranspose" v-show="!quickEmpty"/);   /* 锁定行字面零触碰 */
  });
});

/* ═══════════ 九、零增量默认档（源码锁：新 props 全可选） ═══════════ */
describe('内核五件零增量默认档（源码锁）', () => {
  it('QRT 新 props 全部可选声明（? 形态），新 DOM 全部 v-if 门控', () => {
    const src = readFileSync(join(__dirname, '../../components/QueryResultTable.vue'), 'utf-8');
    expect(src).toMatch(/quickFilter\?: string;/);
    expect(src).toMatch(/selectable\?: boolean;/);
    expect(src).toMatch(/semOn\?: boolean;/);
    expect(src).toMatch(/exportRowFilter\?: \(row: unknown\) => boolean;/);
    expect(src).toMatch(/v-if="selectable" class="qrt-sel-col"/);   /* 勾选列 v-if 门控 */
    expect(src).toMatch(/selectable && isSelRow\(ri\) \? 'qrt-sel' : undefined/); /* 缺省 undefined 零附加 */
  });
  /* 五百三十一批 W-B 扩锚：rowDrawer 行详情侧拉（可选 prop + 菜单项门控 + withDefaults 缺省关） */
  it('531 扩锚：rowDrawer 可选声明+菜单项门控展开+缺省 false（零增量）', () => {
    const src = readFileSync(join(__dirname, '../../components/QueryResultTable.vue'), 'utf-8');
    expect(src).toMatch(/rowDrawer\?: boolean;/);
    expect(src).toMatch(/rowDrawer: false,/);
    expect(src).toMatch(/\.\.\.\(props\.rowDrawer \? \[\{ key: 'row-drawer', label: '行详情'/); /* 右键菜单项门控 */
    expect(src).toMatch(/<n-drawer v-model:show="rdwOpen"/);   /* 侧拉面板在（内容随 rdwRow v-if 零渲染） */
  });
  it('531 扩锚：rowDrawer 行为档（缺省关无菜单项；开启后右键出「行详情」→ 侧拉整行键值对）', async () => {
    /* 缺省关：右键菜单无「行详情」项（零增量） */
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, sortable: true });
    await cellMenu(dataRows()[0].querySelectorAll('td.qrt-cell')[0] as HTMLElement);
    expect(await ctxMenuBtn('行详情'), '缺省 rowDrawer 无行详情项').toBeNull();
    document.querySelectorAll('.ccm-mask').forEach(e => e.remove());
    /* 开启：菜单项出现 → 点击开侧拉，整行键值对+逐格复制+复制整行 JSON */
    await mountTbl(QueryResultTable, { cols: COLS, rows: ROWS, sortable: true, rowDrawer: true });
    await cellMenu(dataRows()[1].querySelectorAll('td.qrt-cell')[0] as HTMLElement, 20, 20);
    const item = await ctxMenuBtn('行详情');
    expect(item, 'rowDrawer 开启应有行详情项').toBeTruthy();
    item!.click(); await tick(6);
    const drawer = document.querySelector('.n-drawer');
    expect(drawer, '侧拉抽屉打开').toBeTruthy();
    expect(drawer!.textContent).toContain('行详情');
    expect(drawer!.textContent).toContain('banana');
    expect(drawer!.textContent).toContain('复制整行 JSON');
    expect(drawer!.querySelector('[aria-label="复制 name"]'), '逐格复制按钮在').toBeTruthy();
    document.querySelectorAll('.n-drawer, .n-drawer-container, .ccm-mask').forEach(e => e.remove());
  });
  it('useSemFormat 为独立纯函数件（导出 semFormat，tone 五档全站 pill 语言）', async () => {
    const src = readFileSync(join(__dirname, '../../composables/useSemFormat.ts'), 'utf-8');
    /* 五百三十四批锚随迁（零删用例）：semFormat 扩第三可选参 opts(SemFmtOpts.noInfer)=
       semRawCols 抑制守卫（531 记档兑现），导出纯函数与 tone 五档契约不变 */
    expect(src).toMatch(/export function semFormat\(v: unknown, effType: string(?:, opts\?: SemFmtOpts)?\): SemFmt \| null/);
    expect(src).toMatch(/'g' \| 'y' \| 'r' \| 'b' \| 'n'/);
    expect(semFormat(null, '')).toBeNull();
    expect(semFormat('text', '')).toBeNull();
    expect(semFormat(true, '')).toBeNull();
  });
});
