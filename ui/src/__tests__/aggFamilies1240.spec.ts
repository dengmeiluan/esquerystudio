/**
 * 聚合算子族分类覆盖：AGG_OPS 的每一项都必须且只能归入一族。
 *
 * 背景：AggTreeNode 的聚合类型此前是一个平铺 68 项的原生 datalist——
 * 「先选大类、再选具体算子」的二段式没有元数据可用。这里把族分类落成显式表，
 * 并锁住「新增算子忘了归类 → 立刻红」，而不是静默落进「其他」。
 */
import { describe, it, expect } from 'vitest';
import { AGG_OPS } from '../utils/queryAstOps';
import { aggFamilyOf, groupAggOps, AGG_FAMILY_LABELS } from '../utils/aggFamilies';

describe('聚合算子族分类', () => {
  it('AGG_OPS 每一项都有族归属（漏归类必须红）', () => {
    const unclassified = Object.keys(AGG_OPS).filter(op => aggFamilyOf(op) === null);
    expect(unclassified, '这些算子忘了归类：' + unclassified.join(', ')).toEqual([]);
  });

  it('分类里没有 AGG_OPS 不存在的算子（防止族表写错字/留旧名）', () => {
    const orphans = groupAggOps(AGG_OPS)
      .flatMap(g => g.items.map(i => i.op))
      .filter(op => !(op in AGG_OPS));
    expect(orphans, '族表里这些算子不在 AGG_OPS：' + orphans.join(', ')).toEqual([]);
  });

  it('三族合并后与 AGG_OPS 键集完全相等（不重不漏）', () => {
    const grouped = groupAggOps(AGG_OPS).flatMap(g => g.items.map(i => i.op));
    expect(new Set(grouped).size, '有重复归类').toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(AGG_OPS).sort());
  });

  it('三族都非空，且各有中文标签', () => {
    const groups = groupAggOps(AGG_OPS);
    expect(groups.map(g => g.fam)).toEqual(['bucket', 'metric', 'pipeline']);
    for (const g of groups) {
      expect(g.items.length, g.fam + ' 族不能为空').toBeGreaterThan(0);
      expect(AGG_FAMILY_LABELS[g.fam]).toBeTruthy();
    }
  });

  it('常见算子归到用户预期的那一族（口语心智对齐）', () => {
    expect(aggFamilyOf('terms')).toBe('bucket');
    expect(aggFamilyOf('date_histogram')).toBe('bucket');
    expect(aggFamilyOf('avg')).toBe('metric');
    expect(aggFamilyOf('cardinality')).toBe('metric');
    expect(aggFamilyOf('bucket_script')).toBe('pipeline');
    expect(aggFamilyOf('derivative')).toBe('pipeline');
  });

  it('未登记的算子返回 null（不猜，交给调用方显示自定义）', () => {
    expect(aggFamilyOf('some_future_agg')).toBeNull();
    expect(aggFamilyOf('')).toBeNull();
  });
});
