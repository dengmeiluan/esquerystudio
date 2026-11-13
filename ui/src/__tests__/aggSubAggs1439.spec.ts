/**
 * 1439：指标/管道聚合带子聚合（agg-sub-aggs）。
 *
 * {"aggs":{"a":{"avg":{"field":"x"},"aggs":{"b":{…}}}}} → ES 400
 * 「Aggregator [avg] cannot accept sub-aggregations」。子聚合只能挂桶聚合。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const subs = (obj: unknown) =>
  lintDsl(obj as any).filter((f: any) => f.rule === 'agg-sub-aggs');

const INNER = { b: { terms: { field: 'x' } } };

describe('1439 指标/管道聚合带子聚合', () => {
  it('反向普查：桶聚合挂子聚合必须零 finding', () => {
    const legit = [
      { aggs: { a: { terms: { field: 'r' }, aggs: INNER } } },
      { aggs: { a: { date_histogram: { field: 'ts', calendar_interval: '1d' }, aggs: INNER } } },
      { aggs: { a: { range: { field: 'v', ranges: [{ to: 1 }] }, aggs: INNER } } },
      { aggs: { a: { filter: { match_all: {} }, aggs: INNER } } },
      { aggs: { a: { filters: { filters: { x: { match_all: {} } } }, aggs: INNER } } },
      { aggs: { a: { nested: { path: 'c' }, aggs: INNER } } },
      { aggs: { a: { global: {}, aggs: INNER } } },
      /* 指标聚合作为叶子（无 aggs）合法 */
      { aggs: { a: { terms: { field: 'r' }, aggs: { m: { avg: { field: 'v' } } } } } },
      /* 根级 aggs 不是「挂在指标下」 */
      { aggs: { a: { avg: { field: 'v' } } } },
    ];
    for (const dsl of legit) expect(subs(dsl), JSON.stringify(dsl)).toEqual([]);
  });

  it('指标/管道/叶子聚合下挂 aggs → error 点名', () => {
    const cases: Array<[string, unknown]> = [
      ['avg', { aggs: { a: { avg: { field: 'v' }, aggs: INNER } } }],
      ['cardinality', { aggs: { a: { cardinality: { field: 'v' }, aggs: INNER } } }],
      ['top_hits', { aggs: { a: { top_hits: { size: 1 }, aggs: INNER } } }],
      ['derivative（管道）', { aggs: { a: { derivative: { buckets_path: 'x>v' }, aggs: INNER } } }],
      ['aggregations 别名', { aggs: { a: { avg: { field: 'v' }, aggregations: INNER } } }],
      ['嵌套一层桶下的指标', { aggs: { t: { terms: { field: 'r' }, aggs: { m: { stats: { field: 'v' }, aggs: INNER } } } } }],
    ];
    for (const [name, dsl] of cases) {
      const f = subs(dsl);
      expect(f, name).toHaveLength(1);
      expect(f[0].severity, name).toBe('error');
      expect(f[0].message, name).toContain('子聚合');
      expect(f[0].anchor, name).toBeTruthy();
    }
  });

  it('负控：同一判据喂桶聚合体必须空、喂指标挂子聚合必须非空', () => {
    expect(subs({ aggs: { a: { terms: { field: 'r' }, aggs: INNER } } })).toEqual([]);
    expect(subs({ aggs: { a: { avg: { field: 'v' }, aggs: INNER } } }).length).toBe(1);
  });
});
