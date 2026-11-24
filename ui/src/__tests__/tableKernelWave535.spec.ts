/**
 * 五百三十五批 W5（轨3 表格内核增量+SqlConsole 接线）。
 * 锁定：
 * 1) T1「复制表头（TSV）」——534 批 P2 备案放弃项落地：双内核列头菜单追加 copy-head-tsv
 *    （空行集走 matrixText 只出表头行，copyMatrix「表头行必含」铁律），列源 QRT=shownCols、
 *    RT=visibleCols；裁决：单元格菜单不加（表头复制归属列头菜单主场，整表 TSV 已含表头行）；
 * 2) T2 tfoot 聚合行补 min~max 小字（append-only）——AggNum 四值 528 批起即齐算，此前只印
 *    Σ/avg；追加段在「Σ … · avg …」之后（diagTableAgg:96 / healthTablesGraft contains
 *    行为锁前缀兼容），双内核同构；
 * 3) T3 remoteSort 远端排序契约（dbx 对标，525 批分页同构）——缺省 false 客户端排序逐字节
 *    不变；true 时表头排序入口只 emit 'sort-change'（{f,d:'asc'|'desc'}|null，null=取消），
 *    本地行序/排序落盘零触碰；载荷方向双内核归一 'asc'|'desc'；
 * 4) T4 SqlConsoleView §6w 半边接线源码锁——sem-on+ :sem-raw-cols="sqlSemRawCols"
 *    （无 type 列 ∪ 名含 ( 或 * 的聚合/桶列入抑制集），sortable 保位、无静态 storage-key；
 * 5) T5 SqlConsoleView errPre 双参改用——errMeta(runErrObj) 旁路（catch 压串行为不动，
 *    原始错误对象留存读 code/endpoint）。
 * 挂载样板照抄 tableKernelWave534/cellMenuColMgmt（裸 createApp + pinia；CellContextMenu
 * 自绘可挂载断言；剪贴板 mock 同款）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import { errPreHtml, errMeta } from '../utils/errPre';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const tableSortSrc = readFileSync(join(__dirname, '../composables/tableSort.ts'), 'utf-8');
const readView = (name: string) => readFileSync(join(__dirname, '../views', name), 'utf-8');
const sqlConsole = readView('SqlConsoleView.vue');
/* tableDimGuard 同款消费标签抽取（防整页误匹配） */
const qrtTagOf = (src: string) => src.split('<script')[0].match(/<QueryResultTable[\s\S]*?(?:\/>|<\/QueryResultTable>)/)?.[0] ?? '';

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

const ctxItems = () => [...document.querySelectorAll('.ccm .ccm-it')] as HTMLButtonElement[];
const ctxItem = (label: string) => ctxItems().find(b => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .ccm-mask, .n-drawer, .n-drawer-container').forEach(e => e.remove());
});

/* ═══════════ 一、T1 复制表头（TSV） ═══════════ */
describe('五百三十五批 T1：列头菜单「复制表头（TSV）」（534 P2 放弃项落地）', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => { Object.assign(navigator.clipboard, { writeText }); writeText.mockClear(); });

  it('RT：列头右键出「复制表头（TSV）」→ 剪贴板=visibleCols 表头行单行 TSV', async () => {
    const HITS = [
      { _id: 'a', _source: { name: 'banana', age: 2 } },
      { _id: 'b', _source: { name: 'apple', age: 3 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w535h1', storageKey: 'w535h1' });
    const th = [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes('name')) as HTMLElement;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(6);
    const item = ctxItem('复制表头（TSV）');
    expect(item, 'RT 列头菜单含复制表头项').toBeTruthy();
    item!.click();
    await tick(6);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0], '空行集 matrixText 只出表头行').toBe('name\tage');
  });

  it('QRT：列头右键同款（列源=shownCols，随列选隐藏收窄）；隐藏一列后表头行同步收窄', async () => {
    localStorage.setItem('es_cols:w535h2', JSON.stringify(['age']));
    await mountTbl(QueryResultTable, { cols: ['name', 'age'], rows: [['x', 1], ['y', 2]] as any, storageKey: 'w535h2' });
    const th = host.querySelector('thead th[data-col="age"]') as HTMLElement;
    expect(th, '隐藏 name 后只剩 age 列头').toBeTruthy();
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(6);
    const item = ctxItem('复制表头（TSV）');
    expect(item, 'QRT 列头菜单含复制表头项').toBeTruthy();
    item!.click();
    await tick(6);
    expect(writeText).toHaveBeenCalledWith('age');
  });

  it('裁决锁：单元格菜单不加复制表头项（归属列头菜单主场；整表 TSV 已含表头行）', async () => {
    const HITS = [{ _id: 'a', _source: { name: 'banana' } }] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 1, index: 'w535h3' });
    (host.querySelector('td.rt-cell') as HTMLElement)
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick(6);
    expect(ctxItem('复制表头（TSV）'), 'RT 单元格菜单无复制表头项').toBeUndefined();
    await mountTbl(QueryResultTable, { cols: ['name'], rows: [['x']] as any });
    (host.querySelector('td.qrt-cell') as HTMLElement)
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick(6);
    expect(ctxItem('复制表头（TSV）'), 'QRT 单元格菜单无复制表头项').toBeUndefined();
  });
});

/* ═══════════ 二、T2 tfoot 聚合行 min~max（append-only） ═══════════ */
describe('五百三十五批 T2：聚合 footer 行补 min~max（Σ/avg 前缀行为锁兼容）', () => {
  it('QRT：aggOn 开启后 tfoot=「Σ … · avg … · min … · max …」（contains 前缀不动）', async () => {
    localStorage.setItem('es_tbl_agg:w535a1', '1');
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[50], [80]] as any, storageKey: 'w535a1' });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row');
    expect(tfoot, '落盘播种直接出 tfoot').toBeTruthy();
    expect(tfoot!.textContent, '既有 Σ/avg 前缀逐字节不动（diagTableAgg:96 同口径）').toContain('Σ 130 · avg 65.00');
    expect(tfoot!.textContent, '追加 min~max 小字').toContain(' · min 50 · max 80');
  });

  it('RT：同构同步（chk/act 占位 cell 保位，四值齐印）', async () => {
    localStorage.setItem('es_tbl_agg:w535a2', '1');
    const HITS = [
      { _id: 'a', _source: { v: 50 } },
      { _id: 'b', _source: { v: 80 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'w535a2' });
    const tfoot = host.querySelector('tfoot tr.rt-agg-row');
    expect(tfoot, '落盘播种直接出 tfoot').toBeTruthy();
    expect(tfoot!.textContent).toContain('Σ 130 · avg 65.00');
    expect(tfoot!.textContent).toContain(' · min 50 · max 80');
  });
});

/* ═══════════ 三、T3 remoteSort 远端排序契约 ═══════════ */
describe('五百三十五批 T3：remoteSort prop（缺省关=客户端排序逐字节不变）', () => {
  it('源码锁：双内核可选 prop+缺省 false+sort-change emit 声明+排序入口单入口委托（六百零三批同步更新=remote 分支合并状态机机内）', () => {
    for (const [src, entry] of [[qrt, 'onSort'], [rt, 'sortBy']] as const) {
      expect(src).toMatch(/remoteSort\?: boolean;/);
      expect(src).toMatch(/remoteSort: false,/);
      expect(src).toMatch(/\(e: 'sort-change', s: \{ f: string; d: 'asc' \| 'desc' \} \| null\): void;/);
      expect(src).toMatch(new RegExp(`function ${entry}\\(`));
    }
    expect(qrt, 'QRT 表头点击单入口委托状态机').toContain('chain.sortBy(name, undefined, shift)');
    expect(rt, 'RT 表头点击单入口委托状态机').toContain('chain.sortBy(c, directDir, shift)');
    /* 五百六十一批锚同步更新→六百零三批二次同步更新：QRT directSort 直选委托状态机（dir 1|-1 归一
       字符串后入机），直发/循环/镜像全在 tableSort.useSortChain 机内单一出处 */
    expect(qrt).toContain("chain.sortBy(col, dir === 1 ? 'asc' : 'desc')");
    expect(tableSortSrc, '远端意图分支机内单源').toMatch(/if \(opts\.isRemote\(\)\) \{/);
  });

  it('QRT：remoteSort=true 点击表头只 emit asc→desc→null（本地行序/落盘零触碰）', async () => {
    const got: Array<{ f: string; d: 'asc' | 'desc' } | null> = [];
    await mountTbl(QueryResultTable, {
      cols: ['n'], rows: [[30], [10], [20]] as any, sortable: true, remoteSort: true,
      onSortChange: (s: any) => got.push(s),
    });
    const th = host.querySelector('thead th[data-col="n"]') as HTMLElement;
    th.click(); await tick(4);
    th.click(); await tick(4);
    th.click(); await tick(4);
    expect(got, '三态循环：升→降→取消（null）').toEqual([{ f: 'n', d: 'asc' }, { f: 'n', d: 'desc' }, null]);
    const firstCell = host.querySelector('tbody tr td.qrt-cell') as HTMLElement;
    expect(firstCell.textContent?.trim(), '本地行序不变（仍是原始序 30）').toBe('30');
    expect(localStorage.getItem('es_tbl_sort:'), '不写排序落盘').toBeNull();
  });

  it('QRT：缺省（remoteSort=false）客户端排序生效且不 emit sort-change（既有行为锁）', async () => {
    const got: unknown[] = [];
    await mountTbl(QueryResultTable, {
      cols: ['n'], rows: [[30], [10], [20]] as any, sortable: true,
      onSortChange: (s: any) => got.push(s),
    });
    (host.querySelector('thead th[data-col="n"]') as HTMLElement).click();
    await tick(4);
    expect(got, '缺省档静默').toEqual([]);
    const firstCell = host.querySelector('tbody tr td.qrt-cell') as HTMLElement;
    expect(firstCell.textContent?.trim(), '客户端升序生效（10 排首）').toBe('10');
  });

  it('RT：remoteSort=true 点击表头只 emit asc→desc→null；列头菜单「升序排序」直选直发', async () => {
    const got: Array<{ f: string; d: 'asc' | 'desc' } | null> = [];
    const HITS = [
      { _id: 'a', _source: { n: 30 } },
      { _id: 'b', _source: { n: 10 } },
      { _id: 'c', _source: { n: 20 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w535rs', remoteSort: true, onSortChange: (s: any) => got.push(s) });
    const th = [...host.querySelectorAll('thead th.rt-th')].find(t => t.textContent?.includes('n')) as HTMLElement;
    th.click(); await tick(4);
    th.click(); await tick(4);
    th.click(); await tick(4);
    expect(got).toEqual([{ f: 'n', d: 'asc' }, { f: 'n', d: 'desc' }, null]);
    const firstCell = host.querySelector('tbody td.rt-cell') as HTMLElement;
    expect(firstCell.textContent?.trim(), '本地行序不变').toBe('30');
    /* 直选分支：列头右键「升序排序」跳过循环直发 */
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(6);
    ctxItem('升序排序')!.click();
    await tick(6);
    expect(got[got.length - 1], 'directDir 直发 asc').toEqual({ f: 'n', d: 'asc' });
  });
});

/* ═══════════ 四、T4 SqlConsoleView sem-on 接线（§6w 遗留半边） ═══════════ */
describe('五百三十五批 T4：SqlConsoleView sem-on+semRawCols 接线（源码锁）', () => {
  it('QRT 标签：sem-on + :sem-raw-cols 在场；sortable 保位（qrtSortable）；无静态 storage-key（tableDimGuard）', () => {
    const tag = qrtTagOf(sqlConsole);
    expect(tag.length, 'SqlConsole 存在 QRT 消费标签（防空跑）').toBeGreaterThan(0);
    expect(tag).toMatch(/\bsortable\b/);
    expect(tag).toMatch(/\bsem-on\b/);
    expect(tag).toContain(':sem-raw-cols="sqlSemRawCols"');
    expect(tag, '禁加静态 storage-key（记忆维度口径守卫）').not.toMatch(/(?:^|\s)storage-key="[a-zA-Z0-9_:.-]+"/);
  });

  it('sqlSemRawCols computed：SQL 结果列全量抑制按值推断', () => {
    expect(sqlConsole).toMatch(/const sqlSemRawCols = computed<string\[\]>\(\(\) =>/);
    expect(sqlConsole).toContain('const sqlSemRawCols = computed<string[]>(() => cols.value.map(c => c.name));');
  });
});

/* ═══════════ 五、T5 SqlConsoleView errPre 双参改用 ═══════════ */
describe('五百三十五批 T5：SqlConsoleView errPre 双参改用（errMeta 旁路）', () => {
  it('源码锁：双参调用+压串行为不动的原始对象旁路+帮手 import', () => {
    expect(sqlConsole).toContain('errPreHtml(runErr, errMeta(runErrObj))');
    expect(sqlConsole).toContain('runErrObj.value = e;');
    expect(sqlConsole).toContain("import { errPreHtml, errMeta } from '../utils/errPre';");
  });

  it('errMeta 单元：ApiError 形状对象读 code/endpoint；压串/未知类型出空 meta（单参输出不变）', () => {
    expect(errMeta({ code: 'ES_ERROR', endpoint: 'GET /internal/x' })).toEqual({ code: 'ES_ERROR', endpoint: 'GET /internal/x' });
    expect(errMeta('已压串的 message')).toEqual({});
    expect(errPreHtml('boom', errMeta('boom'))).toBe(errPreHtml('boom'));
    const html = errPreHtml('boom', errMeta({ code: 'ES_ERROR', endpoint: 'GET /internal/x' }));
    expect(html).toContain('ES_ERROR');
    expect(html).toContain('失败于 GET /internal/x');
    expect(html).toContain('boom');
  });
});
