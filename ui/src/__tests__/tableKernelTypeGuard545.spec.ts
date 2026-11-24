/**
 * 五百四十五批轨3：531 遗留「显式非语义类型抑制守卫」核查固化锁（锚点 3 裁决=守卫已在场，补行为锁）。
 * 核查备案（详见批报告，文件:行号）：
 * — semFormat 语境的抑制 534 批已收口（useSemFormat noInfer + 两内核 semRawCols，
 *   tableKernelWave534 源码+运行时+单元三面锁），本 spec 不重复约定；
 * — 数值感知面的抑制是「双机制」：①值形态硬口径（useColStats numStats/RT numericCols 采样
 *   只认 typeof number——对象/数组值天然不计，这是「嵌套 object 列不被误判」的主守卫）；
 *   ②显式类型白名单优先不回落（QRT effType/isNumericCol/isRangeCol、isNumeric 的
 *   `if (t) return NUMERIC_TYPES_RE.test(t)`——显式标非数值类型时压过按值采样档）。
 *   该链此前无行为级锁 → 本 spec 固化（纯测试文件，零内核改动、零行为变更）。
 * 口径备案（本 spec 同步固化）：Σ 统计以值为准——显式非数值标注+真 number 值的矛盾标注
 * 场景，右对齐/区间面被显式白名单抑制，Σ 仍按硬口径计入（真数字可数是容错非误判；
 * RT 统计面本就不消费 fieldTypes，两内核口径各自自洽）。
 * 锁定：
 * 1) QRT rows 型：显式标 object/nested/unknown 且值真是对象 → 三面抑制（无 num-col 右对齐 /
 *    聚合行无数值格 / 列详情无「Σ / avg」块）；
 * 2) QRT 矛盾标注对照：显式 'object'+数字值 → 右对齐仍被显式白名单抑制（压过采样兜底），
 *    而无 mapping 同 rows → 采样兜底契约在场（527 批「显式映射 ∪ 按值采样」设计意图）；
 * 3) RT hit 型：数组值列（不展平、typeof object）全链抑制；age 数字列对照在场
 *    （两内核聚合行首格恒印 Σ 标，行为断言用 td.num-col 计数而非整行文本）；
 * 4) RT 源码锁：isRangeCol 显式类型优先段 + colStats 不注入 isNumeric（硬口径）；
 * 5) useColStats 硬口径单元锁：对象值 numeric=null、count 正确、distinct JSON 归一。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';
import { useColStats } from '../composables/useColStats';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

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

const thOf = (col: string) =>
  [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes(col)) as HTMLElement;

async function openColMenu(col: string) {
  thOf(col).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  await tick(4);
}
const menuButtons = () => [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];

/** 列详情弹窗当前卡片（无则 null） */
const colCard = () => document.body.querySelector('.rt-cd') as HTMLElement | null;

async function openColDetail(col: string) {
  await openColMenu(col);
  const btn = menuButtons().find(b => b.textContent?.includes('列详情'));
  expect(btn, '列头右键应有「列详情」').toBeTruthy();
  btn!.click();
  await tick(6);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.querySelectorAll('.ccm-mask, .rt-cd').forEach(e => e.remove());
});

/* ═══════════ 一、QRT rows 型：显式非语义类型 + 对象值 → 三面抑制 ═══════════ */
describe('QRT 显式非语义类型抑制（五百四十五批）', () => {
  const COLS = ['name', 'price'];
  /* 值真是对象——「嵌套 object 列」的本征形态（非矛盾标注） */
  const ROWS = [['a', { n: 1 }], ['b', { n: 2 }], ['c', { n: 3 }]] as any;

  for (const t of ['object', 'nested', 'unknown']) {
    it(`fieldTypes 显式标 '${t}' 且值为对象 → 无 num-col / 聚合行无数值格 / 列详情无 Σ·avg`, async () => {
      localStorage.setItem('es_tbl_agg:tg545q', '1');
      await mountTbl(QueryResultTable, {
        cols: COLS, rows: ROWS, storageKey: 'tg545q', sortable: true,
        fieldTypes: { price: t },
      });
      /* 面①：右对齐——isNumericCol 走 effType 白名单，显式非数值类型不命中且压过采样 */
      expect(host.querySelectorAll('td.qrt-cell.num-col').length, `'${t}' 列不得右对齐`).toBe(0);
      /* 面②：聚合行——对象值走 numStats 硬口径不计 → statsOf().numeric=null → 无 Σ 数值格 */
      const aggRow = host.querySelector('.qrt-agg-row') as HTMLElement | null;
      expect(aggRow, '聚合行开关已预置应渲染').toBeTruthy();
      expect(aggRow!.querySelectorAll('td.num-col').length, `'${t}' 列不得出 Σ 数值格`).toBe(0);
      /* 面③：列详情——numeric=null 无 Σ·avg 块（去重/高频值仍可看） */
      await openColDetail('price');
      const card = colCard();
      expect(card, '列详情弹窗应打开').toBeTruthy();
      expect(card!.textContent!, `'${t}' 列详情不得出 Σ·avg 块`).not.toContain('Σ / avg');
    });
  }

  it('矛盾标注对照：显式 \'object\'+数字值 → 右对齐仍被显式白名单抑制（压过采样兜底）', async () => {
    await mountTbl(QueryResultTable, {
      cols: COLS, rows: [['r1', 10], ['r2', 20]] as any, storageKey: 'tg545q3', sortable: true,
      fieldTypes: { price: 'object' },
    });
    /* 只断言 price 列（name 文本列与本用例无关）；QRT td 无 data-col，按 shownCols 索引取第 2 格 */
    const priceTds = [...host.querySelectorAll('tr')]
      .map(tr => tr.querySelectorAll('td.qrt-cell')[1])
      .filter(Boolean) as HTMLElement[];
    expect(priceTds.length, 'price 列单元格在场').toBeGreaterThan(0);
    expect(priceTds.every(td => !td.classList.contains('num-col')),
      '显式非数值标注压过采样兜底——即便值全是数字也不右对齐').toBe(true);
  });

  it('对照：无 mapping（不传 fieldTypes）同 rows → 采样兜底契约仍在（527 批设计意图非缺口）', async () => {
    localStorage.setItem('es_tbl_agg:tg545q2', '1');
    await mountTbl(QueryResultTable, {
      cols: COLS, rows: [[1, 10], [2, 20]] as any, storageKey: 'tg545q2', sortable: true,
    });
    expect(host.querySelectorAll('td.qrt-cell.num-col').length, '采样兜底档 price 应右对齐').toBeGreaterThan(0);
    const aggRow = host.querySelector('.qrt-agg-row') as HTMLElement;
    expect(aggRow.querySelectorAll('td.num-col').length, '采样兜底档聚合行应出 Σ 数值格').toBeGreaterThan(0);
  });
});

/* ═══════════ 二、RT hit 型：数组值列（不展平、typeof object）全链抑制 ═══════════ */
describe('RT 非语义值列抑制（五百四十五批）', () => {
  it('obj 列值全为数组 → 无 num-col / 聚合行仅 age 数值格 / 列详情无 Σ·avg；age 数字列对照在场', async () => {
    localStorage.setItem('es_tbl_agg:tg545rt', '1');
    const HITS = [
      { _id: '1', _source: { name: 'x', obj: [1, 2], age: 5 } },
      { _id: '2', _source: { name: 'y', obj: [3, 4], age: 7 } },
    ] as any;
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'tg545rt', fieldTypes: { obj: 'object' } });
    /* 面①：右对齐——numericCols 采样 typeof number 硬判；数组不展平（allCols Array.isArray 跳过），
       name/obj 列天然沉默，数值格只属 age */
    const numTds = [...host.querySelectorAll('td.rt-cell.num-col')] as HTMLElement[];
    expect(numTds.length, 'age 列右对齐在场（防抑制误伤常规数值面）').toBeGreaterThan(0);
    expect(numTds.every(td => td.dataset.col === 'age'), 'name/obj 列不得右对齐').toBe(true);
    /* 面②：聚合行——statsOf 硬口径 numeric=null → 仅 age 出 Σ 数值格 */
    const aggRow = host.querySelector('.rt-agg-row') as HTMLElement;
    expect(aggRow, '聚合行开关已预置应渲染').toBeTruthy();
    const aggNums = [...aggRow.querySelectorAll('td.num-col')] as HTMLElement[];
    expect(aggNums.length, '仅 age 列出 Σ 数值格').toBe(1);
    expect(aggNums[0]!.textContent, 'Σ 数值格即 age（含 Σ 文本）').toContain('Σ');
    /* 面③：列详情——obj 列无 Σ·avg 块 */
    await openColDetail('obj');
    const card = colCard();
    expect(card, '列详情弹窗应打开').toBeTruthy();
    expect(card!.textContent!, 'obj 列详情不得出 Σ·avg 块').not.toContain('Σ / avg');
  });

  it('源码锁：isRangeCol 显式类型优先不回落 + colStats 不注入 isNumeric（硬口径以值为准）', () => {
    /* RT isRangeCol：显式 fieldTypes 在场即按白名单判，非数值类型直接 false（不回落采样）；
       五百五十一批锁同步更新：非语义族短路行插前（isNonSemanticType 更早 false），显式优先序与
       「不回落采样」意图逐字保留，正则只放行新短路行 */
    expect(rt).toMatch(/function isRangeCol\(c: string\): boolean \{\s*const t = props\.fieldTypes\?\.\[c\];\s*if \(t && isNonSemanticType\(t\)\) return false;\s*if \(t\) return NUMERIC_TYPES_RE\.test\(t\) \|\| RANGE_DATE_RE\.test\(t\);\s*return numericCols\.value\.has\(c\);/);
    /* RT colStats 注入段不含 isNumeric——统计面不消费 fieldTypes（硬口径，与 QRT 契约语义档分工） */
    const colStatsBlock = rt.slice(rt.indexOf('const colStats = useColStats'), rt.indexOf('const colDetailStats'));
    expect(colStatsBlock).not.toContain('isNumeric');
  });
});

/* ═══════════ 三、useColStats 硬口径单元锁（两内核数值统计的最终守卫） ═══════════ */
describe('useColStats 对象值硬口径（五百四十五批）', () => {
  it('对象值列 numeric=null、count 正确、distinct 走 JSON 归一', () => {
    const s = useColStats({
      rows: () => [{ v: { a: 1 } }, { v: { b: 2 } }, { v: 'x' }],
      getVal: (r: any) => r.v,
      labelOf: (v: any) => String(v),
    }).statsOf('v');
    expect(s.numeric, '对象值不得计入数值统计').toBeNull();
    expect(s.count).toBe(3);
    expect(s.distinct).toBe(3);
  });
});
