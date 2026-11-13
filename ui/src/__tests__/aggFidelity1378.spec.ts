/**
 * 1378b：聚合「真实参数」往返保真。
 *
 * 1190 的判据很严（stable() 字节级比对），但每个聚合都只用 `{field:'f'}` 这种
 * 平凡体——真实 DSL 里 date_histogram 有 calendar_interval/time_zone/min_doc_count、
 * percentiles 有 percents+keyed、composite 有 sources+after……这些参数一旦在
 * 树上被吞，用户跑起来就少一段。本 spec 给每个聚合配一个**接近真实**的体，
 * 逐条断言键和值都还在。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';
import { AGG_OPS } from '../utils/queryAstOps';

const FIXTURES: Record<string, any> = {
  /* 桶 */
  terms: { field: 'region', size: 20, order: { _count: 'desc' }, min_doc_count: 2, missing: 'N/A' },
  multi_terms: { terms: [{ field: 'a' }, { field: 'b' }], size: 10 },
  date_histogram: { field: 'publish_time', calendar_interval: 'month', time_zone: '+08:00', min_doc_count: 0, format: 'yyyy-MM' },
  auto_date_histogram: { field: 'publish_time', buckets: 30, format: 'yyyy-MM-dd' },
  histogram: { field: 'score', interval: 10, min_doc_count: 1, offset: 5 },
  variable_width_histogram: { field: 'score', buckets: 20 },
  range: { field: 'amount', ranges: [{ to: 100 }, { from: 100, to: 500 }, { from: 500 }], keyed: true },
  date_range: { field: 'publish_time', ranges: [{ to: 'now-1y' }, { from: 'now-1y' }], format: 'yyyy-MM-dd' },
  ip_range: { field: 'ip', ranges: [{ to: '10.0.0.5' }, { from: '10.0.0.5' }] },
  filter: { term: { status: 'ACTIVE' } },
  filters: { filters: { active: { term: { status: 'A' } }, closed: { term: { status: 'C' } } }, other_bucket: true },
  significant_terms: { field: 'issuer', size: 5, min_doc_count: 2, background_filter: { term: { status: 'A' } } },
  significant_text: { field: 'body', size: 5, min_doc_count: 2 },
  rare_terms: { field: 'region', max_doc_count: 1 },
  sampler: { shard_size: 200 },
  diversified_sampler: { field: 'issuer', shard_size: 100, max_docs_per_value: 2 },
  random_sampler: { probability: 0.1, seed: 42 },
  nested: { path: 'comments' },
  reverse_nested: { path: 'post' },
  children: { type: 'reply' },
  parent: { type: 'post' },
  global: {},
  geo_distance: { field: 'location', origin: { lat: 31.2, lon: 121.4 }, unit: 'km', ranges: [{ to: 10 }, { from: 10, to: 50 }] },
  geohash_grid: { field: 'location', precision: 5 },
  geotile_grid: { field: 'location', precision: 6, size: 100 },
  geohex_grid: { field: 'location', precision: 4 },
  composite: { size: 10, sources: [{ region: { terms: { field: 'region' } } }, { month: { date_histogram: { field: 'publish_time', calendar_interval: 'month' } } }], after: { region: 'CN' } },
  adjacency_matrix: { filters: { a: { term: { status: 'A' } }, c: { term: { status: 'C' } } } },
  /* 度量 */
  avg: { field: 'amount', missing: 0 },
  sum: { field: 'amount' },
  min: { field: 'publish_time', format: 'yyyy-MM-dd' },
  max: { field: 'publish_time' },
  stats: { field: 'amount', missing: 0 },
  extended_stats: { field: 'amount', sigma: 3 },
  percentiles: { field: 'amount', percents: [50, 90, 99], keyed: true },
  percentile_ranks: { field: 'amount', values: [100, 500], keyed: false },
  value_count: { field: 'issuer' },
  cardinality: { field: 'issuer', precision_threshold: 3000 },
  median_absolute_deviation: { field: 'amount', compression: 100 },
  boxplot: { field: 'amount' },
  string_stats: { field: 'title', show_distribution: true },
  top_hits: { size: 3, _source: ['title', 'issuer_name'], sort: [{ publish_time: { order: 'desc' } }] },
  top_metrics: { metrics: [{ field: 'amount', metric: 'max' }], size: 3, sort: [{ publish_time: { order: 'desc' } }] },
  weighted_avg: { value: { field: 'amount' }, weight: { field: 'weight' } },
  matrix_stats: { fields: ['amount', 'score'] },
  scripted_metric: { init_script: 'state.t = 0', map_script: 'state.t += doc["amount"].value', combine_script: 'return state.t', reduce_script: 'return states.sum()' },
  t_test: { a: { field: 'amount' }, b: { field: 'score' }, type: 'trend' },
  categorize_text: { field: 'body', size: 5 },
  missing: { field: 'amount' },
  /* 管道 */
  bucket_script: { buckets_path: { total: '_count' }, script: 'params.total * 2' },
  bucket_selector: { buckets_path: { total: '_count' }, script: 'params.total > 10' },
  bucket_sort: { sort: [{ _count: { order: 'desc' } }], size: 5 },
  cumulative_cardinality: { buckets_path: 'issuer#uv' },
  cumulative_sum: { buckets_path: 'amount' },
  derivative: { buckets_path: 'amount', unit: 'day' },
  extended_stats_bucket: { buckets_path: 'amount' },
  moving_fn: { buckets_path: 'amount', window: 5, script: 'MovingFunctions.sum(values)' },
  moving_percentiles: { buckets_path: 'amount', window: 5, percents: [50, 95] },
  moving_avg: { buckets_path: 'amount', window: 5, model: 'simple' },
  normalize: { buckets_path: 'amount', method: 'percent_of_sum' },
  percentiles_bucket: { buckets_path: 'amount', percents: [50, 95] },
  serial_diff: { buckets_path: 'amount', lag: 2 },
  stats_bucket: { buckets_path: 'amount' },
  avg_bucket: { buckets_path: 'sales_per_month>sales', gap_policy: 'skip', format: '0.00' },
  sum_bucket: { buckets_path: 'sales_per_month>sales', gap_policy: 'skip' },
  min_bucket: { buckets_path: 'sales_per_month>sales' },
  max_bucket: { buckets_path: 'sales_per_month>sales' },
  rate: { buckets_path: 'amount', unit: 'month' },
  geo_bounds: { field: 'location', wrap_longitude: true },
  geo_centroid: { field: 'location' },
  geo_line: { field: 'location', point: { lat: 31.2, lon: 121.4 }, sort: { publish_time: 'asc' } },
  frequent_item_sets: { fields: 'tags', size: 5, minimum_set_size: 2, minimum_support: 0.01 },
  inference: { model_id: 'm1', field_mappings_schema: { title: { properties: { text_field: { type: 'text' } } } }, inference_config: { results_field: 'pred' } },
};

function keysOf(v: any): string[] {
  if (Array.isArray(v)) return v.flatMap(keysOf);
  if (v && typeof v === 'object') return Object.keys(v).flatMap(k => [k, ...keysOf(v[k])]);
  return [];
}
function prims(v: any): any[] {
  if (Array.isArray(v)) return v.flatMap(prims);
  if (v && typeof v === 'object') return Object.values(v).flatMap(prims);
  return [v];
}
/** 输出叶子值全等集合——子串判定会把 'or' 认成 'order' 的一部分（实测踩到） */
function leafSet(v: any, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { v.forEach(x => leafSet(x, acc)); return acc; }
  if (v && typeof v === 'object') { Object.values(v).forEach(x => leafSet(x, acc)); return acc; }
  acc.add(String(v));
  return acc;
}

describe('1378b 聚合真实参数往返保真', () => {
  const ops = Object.keys(AGG_OPS);
  const failures: string[] = [];
  for (const op of ops) {
    const fx = FIXTURES[op];
    if (!fx) { failures.push(`${op}: 未提供 fixture`); continue; }
    const body = { size: 0, aggs: { a: { [op]: fx } } };
    const r = parseTree(body);
    if (!r.ok) { failures.push(`${op}: 解析失败`); continue; }
    const back = serializeTree(r.tree);
    const ser = JSON.stringify(back);
    const found = leafSet(back);
    const lostKeys = [...new Set(keysOf(fx))].filter(k => !ser.includes(`"${k}"`));
    if (lostKeys.length) { failures.push(`${op}: 丢键 ${lostKeys.join('/')}`); continue; }
    const lostVals = [...new Set(prims(fx))]
      .filter(v => ['string', 'number'].includes(typeof v) && v !== '')
      .filter(v => !found.has(String(v)));
    if (lostVals.length) failures.push(`${op}: 丢值 ${lostVals.map(String).join('/')}`);
  }

  it('① 每个注册聚合都要有真实体 fixture', () => {
    const missing = ops.filter(o => !FIXTURES[o]);
    expect(missing, `缺 fixture：${missing.join(', ')}`).toEqual([]);
  });

  it('② 真实参数往返后键与值都必须在', () => {
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('③ 负控：fixture 里造一个必然不存在的值 → 检测器必须判定为丢', () => {
    const op = 'date_histogram';
    const body = { size: 0, aggs: { a: { [op]: FIXTURES[op] } } };
    const r = parseTree(body);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ser = JSON.stringify(serializeTree(r.tree));
    expect(ser.includes('ZZ_NEG_ZZ')).toBe(false);
    expect(ser.includes('calendar_interval'), '真实参数确实在输出里（判据非恒假）').toBe(true);
  });
});
