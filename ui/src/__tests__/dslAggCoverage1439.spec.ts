/**
 * 1439：聚合语法覆盖契约。
 *
 * 与查询覆盖契约同口径——官方聚合类型逐员两轴点验：
 *   ① 可新建：AGG_OPS（AggTreeNode 类型下拉 / 建议表）；
 *   ② 可补全：AGG_SNIPPETS（手写 type 键的骨架）。
 * 骨架自身「接受即合法」由 dslSnippetValidity1439 总闸守；本文件只查覆盖。
 */
import { describe, it, expect } from 'vitest';
import { AGG_OPS } from '../utils/queryAstOps';
import { AGG_SNIPPETS } from '../utils/dslCompletionContext';
import { lintDsl } from '../utils/dslLint';

/** 官方聚合清单（桶 / 指标 / 管道三族；ES 8.x 文档目录 + 本仓已覆盖的扩展族） */
const OFFICIAL = [
  /* 桶 */
  'adjacency_matrix', 'auto_date_histogram', 'children', 'composite', 'date_histogram',
  'date_range', 'diversified_sampler', 'filter', 'filters', 'frequent_item_sets',
  'geo_distance', 'geohash_grid', 'geohex_grid', 'geotile_grid', 'global', 'histogram',
  'ip_range', 'missing', 'multi_terms', 'nested', 'parent', 'range', 'rare_terms',
  'reverse_nested', 'sampler', 'significant_terms', 'significant_text', 'terms',
  'variable_width_histogram', 'random_sampler', 'categorize_text', 'inference',
  /* 指标 */
  'avg', 'boxplot', 'cardinality', 'extended_stats', 'geo_bounds', 'geo_centroid',
  'geo_line', 'matrix_stats', 'max', 'median_absolute_deviation', 'min',
  'percentile_ranks', 'percentiles', 'rate', 'scripted_metric', 'stats', 'string_stats',
  'sum', 't_test', 'top_hits', 'top_metrics', 'value_count', 'weighted_avg',
  /* 管道 */
  'avg_bucket', 'sum_bucket', 'min_bucket', 'max_bucket', 'bucket_script',
  'bucket_selector', 'bucket_sort', 'cumulative_cardinality', 'cumulative_sum',
  'derivative', 'extended_stats_bucket', 'moving_fn', 'moving_percentiles', 'normalize',
  'percentiles_bucket', 'serial_diff', 'stats_bucket',
];

describe('1439 聚合覆盖契约', () => {
  it('官方清单每一员都「可新建」', () => {
    expect(OFFICIAL.filter(a => !(a in AGG_OPS))).toEqual([]);
  });

  it('官方清单每一员都「可补全」', () => {
    expect(OFFICIAL.filter(a => !(a in AGG_SNIPPETS))).toEqual([]);
  });

  it('lint 拼写白名单派生自 AGG_OPS：每个已注册聚合都不被 agg-type-typo 误报', () => {
    const flagged = Object.keys(AGG_OPS).filter(t =>
      lintDsl({ aggs: { a: { [t]: {} } } }).some(f => f.rule === 'agg-type-typo'));
    expect(flagged, '这些已注册聚合被误判成拼写错：' + flagged.join(', ')).toEqual([]);
  });

  it('真实拼写错仍然报；rate 旧误报案例回归（官方聚合被判「最接近 range」）', () => {
    const msg = (t: string) => lintDsl({ aggs: { a: { [t]: {} } } })
      .filter(f => f.rule === 'agg-type-typo').map(f => f.message).join(' | ');
    expect(msg('termss')).toContain('terms');
    expect(msg('rate'), 'rate 是官方管道/指标聚合，不得报拼写').toBe('');
  });

  it('负控：清单混入不存在聚合 → 两轴都点名；真实聚合两轴都过', () => {
    const fake = 'definitely_not_an_agg';
    expect(fake in AGG_OPS).toBe(false);
    expect(fake in AGG_SNIPPETS).toBe(false);
    expect('terms' in AGG_OPS && 'terms' in AGG_SNIPPETS).toBe(true);
    expect('avg_bucket' in AGG_OPS && 'avg_bucket' in AGG_SNIPPETS, '本轮补的四员').toBe(true);
  });
});
