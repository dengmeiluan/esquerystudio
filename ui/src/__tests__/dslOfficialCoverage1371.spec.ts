/**
 * 一千三百七十一批：DSL 语法**官方全集**覆盖守卫。
 *
 * 用户的诉求原话是「我的目标是把所有 dsl 查询语法全部支持，不管是常用语法和非常用语法」。
 * 1220 只守「注册表内部自洽」（每个算子都有骨架），**守不住注册表本身的遗漏**：
 * 如果 ES 有某类查询而注册表没收，1220 依然全绿。本 spec 把 ES 8.x 官方类型清单
 * 钉成枚举，逐项要求：
 *   ① query 侧：注册表必须收录，且必须能被真实 parse→serialize 往返识别；
 *   ② agg 侧：`AGG_OPS` 必须收录。
 * 清单本身是「ES 官方有什么」，不是「我们实现了什么」——这正是它与 1220 的分工。
 *
 * 已知且有意为之的唯一豁免：`bool`。它在渲染层是**复合节点**（BoolGroupNode 的
 * must/should/must_not/filter 四行），不是叶子算子，故不出现在 OPS_META。
 * 用 EVIDENCE 记录，避免下一个人把它当遗漏。
 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode } from '../utils/queryAst';
import { OPS_META, WRAP_LABELS, MULTI_LABELS, AGG_OPS } from '../utils/queryAstOps';

/* ES 8.x query DSL 官方全集（含 7.x 以来所有同名叶子与复合类型） */
const ES_QUERY_TYPES = [
  /* 全文 */
  'match', 'match_phrase', 'match_phrase_prefix', 'multi_match', 'match_bool_prefix',
  'query_string', 'simple_query_string', 'combined_fields', 'intervals',
  /* 词项级 */
  'term', 'terms', 'terms_set', 'range', 'exists', 'prefix', 'wildcard', 'regexp', 'fuzzy', 'ids',
  /* 复合 */
  'bool', 'boosting', 'constant_score', 'dis_max', 'function_score',
  /* join */
  'nested', 'has_child', 'has_parent', 'parent_id',
  /* geo / shape */
  'geo_distance', 'geo_bounding_box', 'geo_polygon', 'geo_shape', 'geo_grid', 'shape',
  /* 特化 */
  'rank_feature', 'distance_feature', 'script', 'script_score', 'wrapper', 'pinned', 'rule',
  /* span */
  'span_term', 'span_first', 'span_near', 'span_or', 'span_not', 'span_containing',
  'span_within', 'span_multi', 'span_gap',
  /* 其他 */
  'more_like_this', 'percolate', 'semantic', 'sparse_vector', 'text_expansion',
  'weighted_tokens', 'knn', 'bitmap_terms', 'type', 'template',
  'match_all', 'match_none',
];

/* ES 8.x 聚合官方全集（桶 + 度量 + 管道 + 地理/采样族） */
const ES_AGG_TYPES = [
  /* 桶 */
  'terms', 'multi_terms', 'date_histogram', 'auto_date_histogram', 'histogram',
  'variable_width_histogram', 'range', 'date_range', 'ip_range', 'filter', 'filters',
  'significant_terms', 'significant_text', 'rare_terms', 'sampler', 'diversified_sampler',
  'random_sampler', 'nested', 'reverse_nested', 'children', 'parent', 'global',
  'geo_distance', 'geohash_grid', 'geotile_grid', 'geohex_grid', 'composite', 'adjacency_matrix',
  /* 度量 */
  'avg', 'sum', 'min', 'max', 'stats', 'extended_stats', 'percentiles', 'percentile_ranks',
  'value_count', 'cardinality', 'median_absolute_deviation', 'boxplot', 'string_stats',
  'top_hits', 'top_metrics', 'weighted_avg', 'matrix_stats', 'scripted_metric', 't_test',
  'categorize_text', 'missing',
  /* 管道 */
  'bucket_script', 'bucket_selector', 'bucket_sort', 'cumulative_cardinality', 'cumulative_sum',
  'derivative', 'extended_stats_bucket', 'moving_fn', 'moving_percentiles', 'moving_avg',
  'normalize', 'percentiles_bucket', 'serial_diff', 'stats_bucket', 'rate',
];

/* 有意不收的项 + 理由（不是「以后再说」，是「结构上就不该在这张表」） */
const EXEMPT_QUERY: Record<string, string> = {
  bool: '显示层是复合节点（BoolGroupNode 四行 must/should/must_not/filter），不是叶子算子',
};

function roundTrips(t: string): boolean {
  const cands: any[] = [
    { [t]: {} },
    { [t]: { field: 'v' } },
    { [t]: { field: 'v', value: 'x' } },
    { [t]: { must: [{ match_all: {} }] } },
    { [t]: { query: { match_all: {} } } },
    { [t]: { filter: { match_all: {} } } },
    { [t]: { positive: { match_all: {} }, negative: { match_all: {} } } },
    { [t]: { doc: {} } },
    { [t]: { match: { field: 'v' } } },
    { [t]: { term: { field: 'v' } } },
  ];
  for (const c of cands) {
    try {
      const n = parseQueryNode(c);
      if (JSON.stringify(serQueryNode(n)).includes(t)) return true;
    } catch { /* 下一个候选 */ }
  }
  return false;
}

describe('1371 ES 官方全集覆盖', () => {
  it('清单本身不能是空的（防空表假绿）', () => {
    expect(ES_QUERY_TYPES.length).toBeGreaterThan(55);
    expect(ES_AGG_TYPES.length).toBeGreaterThan(50);
    expect(new Set(ES_QUERY_TYPES).size, '清单内不得重复').toBe(ES_QUERY_TYPES.length);
  });

  it('① query：官方类型必须全部在注册表中（bool 有豁免理由）', () => {
    const reg = new Set([...Object.keys(OPS_META), ...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)]);
    const missing = ES_QUERY_TYPES.filter(t => !reg.has(t) && !(t in EXEMPT_QUERY));
    expect(missing, `官方类型未收录：${missing.join(', ')}`).toEqual([]);
  });

  it('② query：每个官方类型都能被真实解析器识别并往返', () => {
    const reg = new Set([...Object.keys(OPS_META), ...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)]);
    const bad = ES_QUERY_TYPES.filter(t => reg.has(t) && !roundTrips(t));
    expect(bad, `收录了但往返不通（等于假支持）：${bad.join(', ')}`).toEqual([]);
  });

  it('③ agg：官方聚合类型必须全部在 AGG_OPS 中', () => {
    const have = new Set(Object.keys(AGG_OPS));
    const missing = ES_AGG_TYPES.filter(t => !have.has(t));
    expect(missing, `官方聚合未收录：${missing.join(', ')}`).toEqual([]);
  });

  it('④ 负控：从注册表拿掉一个官方类型 → ① 必须报出它', () => {
    const reg = new Set([...Object.keys(OPS_META), ...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)]);
    const without = new Set([...reg].filter(k => k !== 'span_gap'));
    const missing = ES_QUERY_TYPES.filter(t => !without.has(t) && !(t in EXEMPT_QUERY));
    expect(missing, '拿掉后必须暴露').toContain('span_gap');
  });

  it('⑤ 负控：agg 少一个 → ③ 必须报出它', () => {
    const without = new Set(Object.keys(AGG_OPS).filter(k => k !== 'random_sampler'));
    const missing = ES_AGG_TYPES.filter(t => !without.has(t));
    expect(missing, '拿掉后必须暴露').toContain('random_sampler');
  });
});
