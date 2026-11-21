/**
 * 五百三十八批 W3（轨3 数据表格内核三件）。
 * 锁定：
 * 1) tfoot 聚合行补 count 档（append-only）——useColStats.statsOf 零成本派生非空值计数
 *    （count = rows - empty，empty 旁同源），AggNum 补可选 count（调用方组装，可选形态保
 *    tableShellSecondCut528 四值字面构造与 toEqual 形状锁零触碰）；双内核 tfoot 在既有
 *    「Σ … · avg … · min … · max …」之后 append「 · count N」（rt-agg-cnt / qrt-agg-cnt
 *    小字 span；wave535/diagTableAgg/healthTablesGraft contains 前缀锁兼容）；RT tfoot 的
 *    chk/act 占位 cell 保位不动；
 * 2) remoteSort 内核侧审计（535 消费侧前置缺口修复）——sortBy/onSort remote 分支纯 emit
 *    535 已锁正确；审计逮住「挂载初读/维度切换重读仍从 LS 恢复本地排序」的残留缺口
 *    （remoteSort=true + LS 旧排序 → 挂载瞬间本地仍排+箭头在场，违「远端档视觉归宿主」契约）
 *    ——双内核 sortSpec 初始化与维度重读改为 remote 档恒空（客户端档逐字节不变）；
 * 3) --sp 精确等值收口（双内核+双弹层）——padding/margin/gap 系中恰好等于 --sp 档位值
 *    （2/4/6/8/10/12/16/24/32，theme.css:102-103）的 px 字面量归档 var(--sp-N)；
 *    1px 边框/3px/5px/7px/14px 刻意值豁免保字面；width/height/top/left 等 layout 系不收。
 *    反锁：档位值裸 px 计数恒 0（防回潮）+ 豁免字面仍保（防过度合并）。
 * 挂载样板照抄 tableKernelWave534/535（裸 createApp + pinia）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import { useColStats } from '../composables/useColStats';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
/* 六百零三批同步更新：538 T2 remote 恒空守卫锁随机器走 tableSort.useSortChain 新家 */
const tableSortSrc = readFileSync(join(__dirname, '../composables/tableSort.ts'), 'utf-8');
/* 554 批工蚁1 同步更新：.rt-bar-r 规则自 RT 内核迁 TableShell 壳级（scopeId 不传播死规则迁出），
   形态代表锚同步更新新家（锁意图不变=右簇 gap 的 --sp 合并纪律） */
const shell = readFileSync(join(__dirname, '../components/TableShell.vue'), 'utf-8');
const cdm = readFileSync(join(__dirname, '../components/ColDetailModal.vue'), 'utf-8');
const cfp = readFileSync(join(__dirname, '../components/ColFilterPopover.vue'), 'utf-8');
const ucs = readFileSync(join(__dirname, '../composables/useColStats.ts'), 'utf-8');
const uar = readFileSync(join(__dirname, '../composables/useAggRow.ts'), 'utf-8');
/* 五百六十一批同步更新：tfoot 聚合行合并 TableAggFoot 片段组件（cnt span/agg 样式字面新家） */
const aggFootSrc = readFileSync(join(__dirname, '../components/TableAggFoot.vue'), 'utf-8');

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
  document.querySelectorAll('.cfp, .ccm-mask, .n-drawer, .n-drawer-container').forEach(e => e.remove());
});

/* ═══════════ 一、tfoot 聚合行 count 档（append-only） ═══════════ */
describe('五百三十八批 T1：聚合 footer 行补 count 档（Σ/avg 前缀行为锁兼容）', () => {
  it('useColStats 单元：count=非空值计数（rows-empty 零成本派生）；全空列 count 0；numeric 子对象形状不变', () => {
    const base = {
      rows: () => [{ v: 50 }, { v: null }, { v: 80 }, { v: '' }],
      getVal: (r: any, c: string) => r[c],
      labelOf: (v: any) => String(v),
    };
    const s = useColStats(base).statsOf('v');
    expect(s.count, '非空值计数=4 行 - 2 空（null/\'\'）').toBe(2);
    expect(s.empty).toBe(2);
    /* toEqual 精确形状：numeric 本体不带 count（count 在 AggNum 组装层注入，统计内核不混装） */
    expect(s.numeric).toEqual({ sum: 130, avg: 65, min: 50, max: 80 });
    const sAllEmpty = useColStats({ ...base, rows: () => [{ v: null }, { v: '' }] }).statsOf('v');
    expect(sAllEmpty.count).toBe(0);
    expect(sAllEmpty.numeric).toBeNull();
  });

  it('源码锁：statsOf 零成本口径 + AggNum 可选 count + 双内核 numericOf 组装 + cnt span 在场', () => {
    expect(ucs).toMatch(/count: number;/);
    expect(ucs).toContain('count: vals.length - empty');
    expect(uar).toMatch(/count\?: number/);
    for (const src of [qrt, rt]) {
      expect(src).toContain('return s.numeric ? { ...s.numeric, count: s.count } : null;');
    }
    /* 五百六十一批锚同步更新：tfoot 聚合行合并 TableAggFoot 片段组件（prefix 参数化类名）——
       cnt span 字面同步更新组件源（模板形态逐字保形），双内核装配 return 行字面零触 */
    expect(aggFootSrc).toMatch(/<span :class="prefix \+ '-agg-cnt'"> · count \{\{ fmtNum\(foot\[c\]\.count\) \}\}<\/span>/);
  });

  it('QRT：aggOn 开启后 tfoot=「Σ … · avg … · min … · max … · count …」（前缀回归+count append）', async () => {
    localStorage.setItem('es_tbl_agg:w538a1', '1');
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[50], [null], [80], ['']] as any, storageKey: 'w538a1' });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row');
    expect(tfoot, '落盘播种直接出 tfoot').toBeTruthy();
    expect(tfoot!.textContent, '535/edge 前缀逐字节不动').toContain('Σ 130 · avg 65.00');
    expect(tfoot!.textContent).toContain(' · min 50 · max 80');
    expect(tfoot!.textContent, 'count=非空值计数（null/\'\' 不计）').toContain(' · count 2');
  });

  it('RT：同构同步（chk/act 占位 cell 保位；count append 后前缀 contains 锁仍兼容）', async () => {
    localStorage.setItem('es_tbl_agg:w538a2', '1');
    const HITS = [
      { _id: 'a', _source: { v: 50 } },
      { _id: 'b', _source: { v: null } },
      { _id: 'c', _source: { v: 80 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w538a2' });
    const tfoot = host.querySelector('tfoot tr.rt-agg-row');
    expect(tfoot, '落盘播种直接出 tfoot').toBeTruthy();
    expect(tfoot!.textContent).toContain('Σ 130 · avg 65.00');
    expect(tfoot!.textContent).toContain(' · min 50 · max 80');
    expect(tfoot!.textContent).toContain(' · count 2');
    /* chk/act 占位 cell 保位（首尾 aria-hidden 占位不动） */
    const cells = [...tfoot!.querySelectorAll('td')];
    expect(cells[0].className).toBe('rt-chk');
    expect(cells[cells.length - 1].className).toBe('rt-act');
  });
});

/* ═══════════ 二、remoteSort 内核侧审计（挂载/维度重读残留缺口修复） ═══════════ */
describe('五百三十八批 T2：remoteSort 审计——remote 档挂载不读排序落盘（sortSpec 恒空）', () => {
  it('源码锁：remote 档挂载/维度重读恒空守卫（六百零三批同步更新=守卫合并 tableSort.useSortChain 机内 init+reload 同口径，双内核只剩 chain 接线；客户端档逐字节不变）', () => {
    expect(tableSortSrc, '机内初始化 remote 恒空（538 审计口径）').toMatch(/opts\.isRemote\(\) \? \[\] : readLs\(\)/);
    expect(tableSortSrc, '机内 reload 同口径（换维度重读守卫）').toMatch(/function reload\(\) \{ sortSpec\.value = opts\.isRemote\(\) \? \[\] : readLs\(\); \}/);
    for (const src of [qrt, rt]) {
      expect(src, '内核 sortSpec=机器单一出处').toContain('const sortSpec = chain.sortSpec;');
      expect(src, '内核换维度重读走机器').toContain('chain.reload()');
    }
  });

  it('RT：remoteSort=true + LS 预置排序链——挂载行序不变、无排序指示、落盘保留；同键客户端档挂载恢复本地排序', async () => {
    localStorage.setItem('es_tbl_sort:w538rs1:m', JSON.stringify([{ f: 'n', d: 'desc' }]));
    localStorage.setItem('es_tbl_sort:w538rs1:f', 'n');
    localStorage.setItem('es_tbl_sort:w538rs1:d', 'desc');
    const HITS = [
      { _id: 'a', _source: { n: 10 } },
      { _id: 'b', _source: { n: 30 } },
      { _id: 'c', _source: { n: 20 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w538rs1', remoteSort: true });
    const firstCell = host.querySelector('tbody td.rt-cell') as HTMLElement;
    expect(firstCell.textContent?.trim(), '挂载不读盘：本地行序不变（原始序 10 排首）').toBe('10');
    expect(host.querySelector('thead th[aria-sort]'), '排序指示不复活（视觉归宿主）').toBeNull();
    expect(localStorage.getItem('es_tbl_sort:w538rs1:m'), 'remote 档不删宿主落盘（回客户端档可恢复）').not.toBeNull();

    await mountTbl(ResultTable, { hits: HITS, total: 3, index: 'w538rs1' });
    const firstCell2 = host.querySelector('tbody td.rt-cell') as HTMLElement;
    expect(firstCell2.textContent?.trim(), '客户端档（缺省）LS desc 恢复：30 排首（回归）').toBe('30');
  });

  it('QRT：remoteSort=true + LS 预置——挂载行序不变（同构回归）', async () => {
    localStorage.setItem('es_tbl_sort:w538rs2:m', JSON.stringify([{ f: 'n', d: 'desc' }]));
    localStorage.setItem('es_tbl_sort:w538rs2:f', 'n');
    localStorage.setItem('es_tbl_sort:w538rs2:d', 'desc');
    await mountTbl(QueryResultTable, { cols: ['n'], rows: [[10], [30], [20]] as any, sortable: true, storageKey: 'w538rs2', remoteSort: true });
    const firstCell = host.querySelector('tbody tr td.qrt-cell') as HTMLElement;
    expect(firstCell.textContent?.trim(), '挂载不读盘：原始序 10 排首').toBe('10');
    expect(host.querySelector('thead th[aria-sort]')).toBeNull();
  });
});

/* ═══════════ 三、--sp 精确等值收口（双内核+双弹层） ═══════════ */
describe('五百三十八批 T3：--sp 收口（档位值 px 归档；豁免值保字面）', () => {
  /* padding/margin/gap 系声明段中的裸 px 值提取（整段吃进再全提，多值声明不漏） */
  const SP_TIERS = new Set([2, 4, 6, 8, 10, 12, 16, 24, 32]);
  const spacingDecls = (src: string) => src.match(/(?:padding|margin|gap)[a-z-]*\s*:\s*[^;{}"']*/g) ?? [];
  const tierLits = (src: string): number[] => spacingDecls(src)
    .flatMap(d => [...d.matchAll(/(\d+)px/g)].map(m => Number(m[1])))
    .filter(n => SP_TIERS.has(n));

  it('反锁：四组件 padding/margin/gap 系档位值裸 px 计数恒 0（防回潮）', () => {
    for (const [name, src] of [['RT', rt], ['QRT', qrt], ['CDM', cdm], ['CFP', cfp]] as const) {
      expect(tierLits(src), `${name} 档位值（2/4/6/8/10/12/16/24/32）裸 px 应为 var(--sp-N)`).toEqual([]);
    }
  });

  it('代表性已收锚：RT/QRT/CDM/CFP 各锁一处（形态防漂移）', () => {
    /* 554 批同步更新：.rt-bar-r 形态锚迁 TableShell（字面扩 nowrap+shrink 纪律，gap 的 --sp 档不变） */
    expect(shell).toContain('.rt-bar-r, .qrt-bar-r { display: flex; gap: var(--sp-1); align-items: center; flex-wrap: nowrap; flex-shrink: 0; }');
    /* 五百六十一批同步更新：rt-agg-row td 字面新家=TableAggFoot 全局单源（字面逐字保形） */
    expect(aggFootSrc).toContain('.rt-agg-row td { background: var(--bg2); border-top: 1px solid var(--line-strong); font-size: var(--fs-xs); padding: var(--sp-1) var(--sp-2); white-space: nowrap; }');
    expect(qrt).toContain('.qrt-tbl th, .qrt-tbl td { padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line); text-align: left; }');
    expect(qrt).toContain('padding: 5px var(--sp-2h); background: var(--bg1); border: 1px solid var(--line); border-bottom: 0;');
    expect(cdm).toContain('.rt-cd-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2h); }');
    expect(cfp).toContain('.cfp-row { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2h); border-radius: var(--r-s); font-size: var(--fs-sm); cursor: pointer; }');
  });

  it('豁免锁：1px/3px/5px/14px 刻意值与 layout 系保字面（防过度合并）', () => {
    expect(rt, '3px 刻意值保字面').toContain('gap: 3px;');
    expect(rt, '5px 刻意值保字面').toContain('gap: 5px;');
    expect(rt, '14px 刻意值保字面').toContain('gap: 14px;');
    expect(rt, '1px 边框语义豁免（分隔条 margin）').toContain('margin: 0 3px;');
    expect(cfp, 'CFP 头 margin 3px 保字面').toContain('margin-bottom: 3px;');
  });
});
