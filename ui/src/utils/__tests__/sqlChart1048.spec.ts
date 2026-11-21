/* 1048：SQL 聚合结果形状识别——只画「两列 + 数值值列」的分布，宁缺勿错。 */
import { describe, it, expect } from 'vitest';
import { sqlAggSeries } from '../sqlChart';

const C = (name: string, type?: string) => ({ name, type });

describe('1048 SQL 聚合分布识别', () => {
  it('两列 label + count → 序列（数字与数字字符串都收）', () => {
    const s = sqlAggSeries(
      [C('industry', 'keyword'), C('cnt', 'long')],
      [['制造业', 42], ['金融业', '18'], ['信息技术', 9]],
    );
    expect(s).toMatchObject({ labelCol: 'industry', valueCol: 'cnt', total: 69 });
    expect(s!.buckets.map(b => b.key)).toEqual(['制造业', '金融业', '信息技术']);
  });

  it('GROUP BY 年/月分桶（数值首列但维度名）允许绘图', () => {
    expect(sqlAggSeries([C('year', 'integer'), C('cnt', 'long')], [[2025, 10], [2026, 12]])).not.toBeNull();
    expect(sqlAggSeries([C('day', 'date')], [])).toBeNull();
  });

  it('id/code 首列、三列、单行、非数值值列 → null', () => {
    expect(sqlAggSeries([C('entity_id', 'keyword'), C('cnt', 'long')], [['a', 1], ['b', 2]])).toBeNull();
    expect(sqlAggSeries([C('code', 'keyword'), C('cnt', 'long')], [['a', 1], ['b', 2]])).toBeNull();
    expect(sqlAggSeries([C('a'), C('b'), C('c')], [[1, 2, 3], [4, 5, 6]])).toBeNull();
    expect(sqlAggSeries([C('industry', 'keyword'), C('cnt', 'long')], [['制造业', 42]])).toBeNull();
    expect(sqlAggSeries([C('industry', 'keyword'), C('title', 'text')], [['a', 'x'], ['b', 'y']])).toBeNull();
  });

  it('纯数值首列且不像时间维度 → null（防 id/金额轴噪音）', () => {
    expect(sqlAggSeries([C('amount', 'double'), C('cnt', 'long')], [[100, 2], [200, 3]])).toBeNull();
  });

  it('畸形行/重复键容错：跳过坏行、同键取首行', () => {
    const s = sqlAggSeries(
      [C('industry', 'keyword'), C('cnt', 'long')],
      [['A', 1], ['A', 9], [null, 3], ['B', 'x'], ['B', 4]],
    );
    expect(s!.buckets).toEqual([{ key: 'A', doc_count: 1 }, { key: 'B', doc_count: 4 }]);
    expect(s!.total).toBe(5);
  });
});
