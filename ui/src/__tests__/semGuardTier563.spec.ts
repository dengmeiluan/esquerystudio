/**
 * 五百六十三批（531 遗留件③收口）：显式非语义类型抑制守卫纯函数单源+消费面。
 * typeTiers.isNonSemanticType（黑名单单源，557/561 两次扩容备案在档）只 import 不改；
 * 新增语义守卫单源 semanticGuard（类型档 ∪ _source 等非业务元字段名档）并接线：
 * 1) useColStats 消费——binary/_source 抑制列 dist 恒 null、seriesOf 恒 []（值形态硬口径
 *    之外的第二道显式标注守卫，typeTiers 551 批备案同源；内核黑名单件内联守卫不动）；
 * 2) tableSort 消费——useTableSort 增可选 sortableOf 抑制档（suppressToggle：显式非语义列
 *    toggle 短路、indicator 保持空；_id/_index/_score 等排序有语义的元字段不收）。
 * 既有 spec 保真：colDetailDist561（无 fieldType 路径）/551 seriesOf 硬口径/
 * tableKernelOffBl558b（numeric/useTableSort 导出+备案锚）/wave560（compareVals）零触碰。
 */
import { describe, it, expect } from 'vitest';
import { isMetaNonBusinessField, typeTierSuppressed } from '../utils/semanticGuard';
import { useColStats } from '../composables/useColStats';
import { sortableGuard } from '../composables/tableSort';

/* ═══════════ 一、守卫纯函数（类型档 ∪ 元字段档） ═══════════ */
describe('semanticGuard 显式非语义守卫（五百六十三批）', () => {
  it('类型档：typeTiers 非语义族判真（binary/nested/object/geo_point/ip_range…）', () => {
    for (const t of ['binary', 'nested', 'object', 'geo_point', 'geo_shape', 'attachment', 'flattened', 'join', 'ip_range']) {
      expect(typeTierSuppressed('col', t), `${t} 应抑制`).toBe(true);
    }
  });

  it('类型档不误伤：数值/日期/keyword/text 语义族与缺类型放行', () => {
    for (const t of ['integer', 'long', 'float', 'double', 'date', 'keyword', 'text', 'boolean', 'ip']) {
      expect(typeTierSuppressed('col', t), `${t} 不得误伤`).toBe(false);
    }
    expect(typeTierSuppressed('col', undefined), '缺类型不抑制（按值采样链不受损）').toBe(false);
    expect(typeTierSuppressed('col', ''), '空类型不抑制').toBe(false);
  });

  it('元字段档：_source 判真；业务名含 _source 子串不误伤；_id/_index/_score 排序有语义不收', () => {
    expect(isMetaNonBusinessField('_source')).toBe(true);
    expect(typeTierSuppressed('_source', undefined), '_source 无显式类型也抑制（raw doc 无分档语义）').toBe(true);
    expect(isMetaNonBusinessField('business_source')).toBe(false);
    expect(typeTierSuppressed('business_source', undefined)).toBe(false);
    for (const m of ['_id', '_index', '_score', '_seq_no']) {
      expect(isMetaNonBusinessField(m), `${m} 排序/定位有语义不收`).toBe(false);
    }
  });
});

/* ═══════════ 二、useColStats 消费：dist/seriesOf 抑制档 ═══════════ */
describe('useColStats 显式非语义抑制（五百六十三批）', () => {
  const NUM_ROWS = [{ v: 1 }, { v: 5 }, { v: 9 }];
  const mk = (fieldType?: (c: string) => string) => useColStats({
    rows: () => NUM_ROWS,
    getVal: (r: any, c: string) => r[c],
    labelOf: String,
    ...(fieldType ? { fieldType } : {}),
  });

  it('binary 显式类型：dist 恒 null、seriesOf 恒 []（Σ/numeric 口径不动——只抑制分档展示）', () => {
    const g = mk(() => 'binary');
    expect(g.statsOf('v').dist, '分布分档展示退役').toBeNull();
    expect(g.seriesOf('v'), '走势采样退役').toEqual([]);
    expect(g.statsOf('v').numeric, 'Σ/avg/min/max 数值口径不涉').not.toBeNull();
  });

  it('_source 元字段（无显式类型）：dist null、seriesOf []', () => {
    const rows = [{ _source: { a: 1 } }, { _source: { a: 2 } }];
    const g = useColStats({ rows: () => rows, getVal: (r: any, c: string) => r[c], labelOf: String });
    expect(g.statsOf('_source').dist).toBeNull();
    expect(g.seriesOf('_source')).toEqual([]);
  });

  it('语义类型/无类型路径零回退：long dist 照出、seriesOf 照采（colDetailDist561/551 锚保真）', () => {
    expect(mk(() => 'long').statsOf('v').dist).not.toBeNull();
    expect(mk().seriesOf('v')).toEqual([1, 5, 9]);
    expect(mk(() => 'long').seriesOf('v')).toEqual([1, 5, 9]);
  });
});

/* ═══════════ 三、tableSort 消费：sortableGuard 抑制守卫 ═══════════ */
describe('tableSort 显式非语义排序抑制（五百六十三批）', () => {
  it('sortableGuard：binary 列判不可排序、long 列放行；元字段档无需类型上下文', () => {
    const g = sortableGuard((c) => (c === 'bin' ? 'binary' : c === 'n' ? 'long' : undefined));
    expect(g('bin')).toBe(false);
    expect(g('n')).toBe(true);
    expect(sortableGuard()('n'), '普通列无类型上下文恒放行（零增量缺省）').toBe(true);
    expect(sortableGuard()('_source'), '_source 走元字段档按名抑制（无需显式类型）').toBe(false);
    expect(sortableGuard(() => 'binary')('_source'), '类型档仍并判').toBe(false);
  });

  it('抑制守卫消费形态（六百零三批同步更新：useTableSort 僵尸壳退役，opts.sortableOf 档随退役——抑制语义由 sortableGuard 单源+双内核入口短路承接，接线锁=tableKernelSortableWire565/567）', () => {
    /* 守卫入口短路语义直演：被抑制列不进委托链、放行列照常（双内核 onSort/sortBy 首行同款守卫） */
    const g = sortableGuard((c) => (c === 'raw' ? 'binary' : undefined));
    const entered: string[] = [];
    for (const k of ['raw', 'n']) { if (g(k)) entered.push(k); }
    expect(entered, '抑制列不入委托链、放行列照常').toEqual(['n']);
    expect(typeof sortableGuard).toBe('function');
  });
});
