/**
 * 五百六十批 轨3：数据表格内核增量。
 * 锁定：
 * 1) tableSort.compareVals 单源比较器——numeric() 双试（任一成功即数值比较：千分位/单位/
 *    时长/科学计数），null/undefined/'' 沉底（方向无关，调用方对沉底档不乘方向系数），
 *    否则 String localeCompare 兜底；numeric() 新档=科学计数（1e6）+ 时长单位（ms|s，归一秒基）；
 * 2) useColFilters.useFilterMode（filterMode 组合档三态循环下沉单源）+ quickFilterRows
 *    （跨可见列 contains 快滤单源，getVal/fullOf 参数化保两内核口径差）；
 * 3) useColFit.frozenStyleOf（冻结列 sticky 内联样式单源——RT 基数 98 / QRT 基数 52，
 *    FROZEN_DEFAULT_W=180 共用）；exportSheets.buildExportSheets（XLSX data+meta 双 sheet
 *    装配单源，meta0 差异字段参数化）；
 * 4) QRT JSON 第五导出钮（aria/命名/matrixText json 口径）+ 双内核接线源码锁
 *    （compareVals/useFilterMode/quickFilterRows/frozenStyleOf/buildExportSheets 接线、
 *    RT md 走 matrixText 私造 esc 退役、RT hlSafe 合并 import）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextTick, reactive } from 'vue';
import { compareVals, numeric } from '../composables/tableSort';
import { useFilterMode, quickFilterRows } from '../composables/useColFilters';
import { FROZEN_DEFAULT_W, frozenStyleOf } from '../composables/useColFit';
import { buildExportSheets } from '../utils/exportSheets';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('compareVals 单源比较器（五百六十批）', () => {
  it('千分位/单位字符串按数值比较（"1,300" > "999"、"1.2gb" > "1mb"）', () => {
    expect(compareVals('1,300', '999')).toBeGreaterThan(0);
    expect(compareVals('1,300', 1300)).toBe(0);
    expect(compareVals('1.2gb', '1mb')).toBeGreaterThan(0);
    expect(compareVals('95%', '50%')).toBeGreaterThan(0);
  });

  it('null/undefined/\'\' 沉底（恒正/负/零——方向无关由调用方保证）', () => {
    expect(compareVals(null, 5)).toBeGreaterThan(0);
    expect(compareVals(5, null)).toBeLessThan(0);
    expect(compareVals(undefined, 'x')).toBeGreaterThan(0);
    expect(compareVals('', 'x')).toBeGreaterThan(0);
    expect(compareVals('x', '')).toBeLessThan(0);
    expect(compareVals(null, undefined)).toBe(0);
    expect(compareVals('', null)).toBe(0);
  });

  it('科学计数/时长档按数值（"1e6" > "999999"；"1500ms" === "1.5s"）', () => {
    expect(compareVals('1e6', '999999')).toBeGreaterThan(0);
    expect(compareVals('1500ms', '1.5s')).toBe(0);
    expect(compareVals('2s', '1500ms')).toBeGreaterThan(0);
  });

  it('非数值回落 String localeCompare 兜底', () => {
    expect(compareVals('apple', 'banana')).toBeLessThan(0);
    expect(compareVals('2024-01-02', '2024-01-10')).toBeLessThan(0);
  });
});

describe('numeric() 新档：科学计数+时长单位（五百六十批）', () => {
  it('科学计数（1e6 / 2.5E-3）；坏尾 fail-closed（"3e" 不误判）', () => {
    expect(numeric('1e6')).toBe(1000000);
    expect(numeric('2.5E-3')).toBeCloseTo(0.0025);
    expect(numeric('1e6')).toBeGreaterThan(numeric('999999'));
    expect(Number.isNaN(numeric('3e'))).toBe(true);
    expect(Number.isNaN(numeric('abc'))).toBe(true);
  });

  it('时长单位 ms|s 归一秒基（"1.5s"=1.5、"1500ms"=1.5、互等）', () => {
    expect(numeric('1.5s')).toBe(1.5);
    expect(numeric('1500ms')).toBe(1.5);
    expect(numeric('1500ms')).toBe(numeric('1.5s'));
    expect(numeric('250ms')).toBeCloseTo(0.25);
  });

  it('既有档不回退（字节族/百分号/千分位）', () => {
    expect(numeric('1.2gb')).toBeCloseTo(1.2 * 1024 ** 3);
    expect(numeric('95%')).toBe(95);
    expect(numeric('3,943')).toBe(3943);
  });
});

describe('useFilterMode 组合档下沉（五百六十批）', () => {
  it('prop 播种初始档；toggle 就地翻转 AND↔OR；prop 变化跟随播种', async () => {
    const props = reactive<{ filterMode?: 'AND' | 'OR' }>({ filterMode: 'OR' });
    const { filterModeLive, toggleFilterMode } = useFilterMode(props);
    expect(filterModeLive.value).toBe('OR');
    toggleFilterMode();
    expect(filterModeLive.value).toBe('AND');
    toggleFilterMode();
    expect(filterModeLive.value).toBe('OR');
    props.filterMode = 'AND';
    await nextTick();
    expect(filterModeLive.value).toBe('AND');
  });

  it('缺省播种 AND（零增量）', () => {
    const { filterModeLive } = useFilterMode({});
    expect(filterModeLive.value).toBe('AND');
  });
});

describe('quickFilterRows 快滤单源（五百六十批）', () => {
  const rows = [{ a: 'Apple', b: null }, { a: 'banana', b: 3 }];
  const getVal = (r: any, c: string) => r[c];
  const fullOf = (v: unknown): string =>
    v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v);

  it('跨列 contains 小写包含命中；数字值 String 化参与', () => {
    expect(quickFilterRows(rows, 'app', ['a', 'b'], getVal, fullOf)).toEqual([rows[0]]);
    expect(quickFilterRows(rows, '3', ['a', 'b'], getVal, fullOf)).toEqual([rows[1]]);
  });

  it('词 trim+小写口径；空值经 fullOf 口径（null→"-"）不误命中裸词', () => {
    expect(quickFilterRows(rows, '  APP  ', ['a', 'b'], getVal, fullOf)).toEqual([rows[0]]);
    expect(quickFilterRows(rows, '-', ['a', 'b'], getVal, fullOf)).toEqual([rows[0]]);
  });

  it('空白词恒等回落（同引用零增量）', () => {
    expect(quickFilterRows(rows, '', ['a', 'b'], getVal, fullOf)).toBe(rows);
    expect(quickFilterRows(rows, undefined, ['a', 'b'], getVal, fullOf)).toBe(rows);
    expect(quickFilterRows(rows, '   ', ['a', 'b'], getVal, fullOf)).toBe(rows);
  });
});

describe('frozenStyleOf 冻结样式单源（五百六十批）', () => {
  const cols = ['c0', 'c1', 'c2'];
  const widths = { c0: 120 };

  it('冻结档：left=基数+前缀累加（未拖宽回落 FROZEN_DEFAULT_W=180）、四件套内联', () => {
    expect(FROZEN_DEFAULT_W).toBe(180);
    /* c1 前缀=c0（拖宽 120）→ left=98+120 */
    expect(frozenStyleOf(cols, widths, 'c1', 2, 98, true)).toEqual({
      left: '218px', width: '180px', maxWidth: '180px', minWidth: '180px',
    });
    /* 首列：left=基数本身，宽取拖宽值 */
    expect(frozenStyleOf(cols, widths, 'c0', 2, 98, true)).toEqual({
      left: '98px', width: '120px', maxWidth: '120px', minWidth: '120px',
    });
    /* QRT 形态：基数 52，前缀 c0（拖宽 120）→ left=172 */
    expect(frozenStyleOf(cols, widths, 'c1', 2, 52, true)?.left).toBe('172px');
  });

  it('非冻结/越界/关档：undefined（回落 colStyle 由调用方兜底）', () => {
    expect(frozenStyleOf(cols, widths, 'c2', 2, 98, true)).toBeUndefined();
    expect(frozenStyleOf(cols, widths, 'c1', 2, 98, false)).toBeUndefined();
    expect(frozenStyleOf(cols, widths, 'zz', 2, 98, true)).toBeUndefined();
  });
});

describe('buildExportSheets 双 sheet 装配单源（五百六十批）', () => {
  it('data 原样直通 + meta=[...meta0, 导出时间, 行数]（key/value 表头）', () => {
    const [data, meta] = buildExportSheets(
      [['索引', 'idx-1'], ['范围', '当前页']],
      { head: ['_id', 'n'], rows: [['a', 1], ['b', 2]] },
    );
    expect(data).toEqual({ name: 'data', head: ['_id', 'n'], rows: [['a', 1], ['b', 2]] });
    expect(meta.name).toBe('meta');
    expect(meta.head).toEqual(['key', 'value']);
    expect(meta.rows[0]).toEqual(['索引', 'idx-1']);
    expect(meta.rows[1]).toEqual(['范围', '当前页']);
    expect(meta.rows[2]?.[0]).toBe('导出时间');
    /* 八百六十三批：导出时间改走 exportStamp 本地时命名档（UTC ISO 比本地钟慢 8 小时，见 exportStampMeta863） */
    expect(String(meta.rows[2]?.[1])).toMatch(/^\d{8}-\d{6}$/);
    expect(meta.rows[3]).toEqual(['行数', 2]);
  });

  it('meta0 空档（QRT 形态）= [导出时间, 行数] 两行', () => {
    const [, meta] = buildExportSheets([], { head: ['c'], rows: [[1]] });
    expect(meta.rows).toHaveLength(2);
    expect(meta.rows[0]?.[0]).toBe('导出时间');
    expect(meta.rows[1]).toEqual(['行数', 1]);
  });
});

/* ═══════════ QRT JSON 第五导出钮 + 双内核接线源码锁 ═══════════ */
describe('五百六十批源码锁：QRT JSON 钮+双内核接线', () => {
  it('QRT JSON 第五导出钮：aria/实现/命名（Braces 已 import；矩阵 json 与 copy-table-json 同口径）', () => {
    expect(qrt).toMatch(/:aria-label="'导出当前视图 JSON'"/);
    expect(qrt).toContain('@click="exportJson(); closeMenus()"');
    expect(qrt).toMatch(/function exportJson\(\)/);
    expect(qrt).toContain("matrixText({ rows, cols: shownCols.value, getVal: (row, c) => qColVal(row, c) }, 'json')");
    expect(qrt).toContain("${props.exportName || 'table-export'}-${exportStamp()}.json");
  });

  it('比较器接线 compareVals（numeric 字面/parseFloat 双试退役；五百六十五批同步更新：sortableGuard 随接线并入同一 import；五百六十七批同步更新：RT 半边对称件同款并入；六百零三批同步更新：useSortChain 状态机并入同一 import）', () => {
    expect(rt).toContain("import { compareVals, sortableGuard, useSortChain } from '../composables/tableSort'");
    expect(qrt).toContain("import { compareVals, sortableGuard, useSortChain } from '../composables/tableSort'");
    expect(rt).toContain('const r = compareVals(va, vb)');
    expect(qrt).toContain('const r = compareVals(av, bv)');
    expect(rt).not.toContain('const an = numeric(va)');
    expect(qrt).not.toContain('parseFloat(av)');
  });

  it('useFilterMode / quickFilterRows 双内核接线（本地三件套字面退役）', () => {
    expect(rt).toContain('useFilterMode(props)');
    expect(qrt).toContain('useFilterMode(props)');
    expect(rt).not.toContain("ref<'AND' | 'OR'>(props.filterMode)");
    expect(qrt).not.toContain("ref<'AND' | 'OR'>(props.filterMode)");
    expect(rt).toContain('quickFilterRows(');
    expect(qrt).toContain('quickFilterRows(');
  });

  it('frozenStyleOf / buildExportSheets 双内核接线（基数 98/52 常参在场）', () => {
    expect(rt).toContain('frozenStyleOf(visibleCols.value, colWidths.value, col, freezeN.value, 98, true)');
    /* 1141：门控从 prefsOn 放宽到 barOn（内存态工具行也可冻结） */
    expect(qrt).toContain('frozenStyleOf(visibleCols.value, colWidths.value, col, freezeN.value, 52, barOn.value)');
    expect(rt).toContain('buildExportSheets(');
    expect(qrt).toContain('buildExportSheets(');
  });

  it('RT md 分支走 matrixText（私造 esc 管道退役）；RT hlSafe 合并 import（本地定义退役）', () => {
    expect(rt).toMatch(/matrixText\(\{\s*rows,\s*cols: \['_id', \.\.\.cols\],[\s\S]*?'md'\)/);
    expect(rt).not.toContain("String(v ?? '').replace(/\\|/g");
    expect(rt).toContain("import { hlSafe } from '../utils/highlightSanitize'");
    expect(rt).not.toMatch(/function hlSafe\(/);
  });
});
