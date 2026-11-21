/**
 * 一千四百三十三批：lint 误报普查——合法 DSL 必须零 finding。
 *
 * 用户目标是「所有 DSL 语法全支持」。lint 一旦对**合法写法**报错，用户会：
 * ① 以为自己写错，改掉本来正确的查询；② 长期无视 lint（狼来了）。
 * 已有规格逐个规则测「该报的报了吗」，缺的是反向普查：「完全合法的写法会不会被报」。
 *
 * 本批用一组生产级合法 DSL（含各种少见但完全合规的写法），断言 findings 为空。
 * 若某条红了，说明该规则边界过宽——那正是要修的。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const MAP: Record<string, string> = {
  title: 'text', title_keyword: 'keyword', status: 'keyword', amount: 'double',
  publish_time: 'date', issuer_name: 'keyword', tags: 'keyword',
  'title.keyword': 'keyword', content: 'text', flag: 'boolean',
  location: 'geo_point', products: 'nested', 'products.color': 'keyword',
};

const LEGIT: Array<[string, any]> = [
  ['term 精确匹配', { query: { term: { status: 'ACTIVE' } } }],
  ['terms 多值', { query: { terms: { status: ['A', 'B'] } } }],
  ['terms 带 boost', { query: { terms: { status: ['A'], boost: 2 } } }],
  ['match 带 operator', { query: { match: { title: { query: 'a b', operator: 'and' } } } }],
  ['match_phrase 带 slop', { query: { match_phrase: { title: { query: 'a b', slop: 2 } } } }],
  ['match_phrase_prefix', { query: { match_phrase_prefix: { title: { query: 'ab' } } } }],
  ['match_bool_prefix', { query: { match_bool_prefix: { title: { query: 'ab' } } } }],
  ['multi_match 多字段', { query: { multi_match: { query: 'x', fields: ['title', 'content'] } } }],
  ['multi_match 带权重', { query: { multi_match: { query: 'x', fields: ['title^2', 'content'] } } }],
  ['query_string', { query: { query_string: { query: 'title:x AND status:y' } } }],
  ['simple_query_string', { query: { simple_query_string: { query: '+a -b', fields: ['title'] } } }],
  ['combined_fields', { query: { combined_fields: { query: 'x', fields: ['title', 'content'] } } }],
  ['range 日期', { query: { range: { publish_time: { gte: 'now-7d', lte: 'now' } } } }],
  ['range 数值', { query: { range: { amount: { gte: 10, lt: 100 } } } }],
  ['range 单边界', { query: { range: { amount: { gt: 0 } } } }],
  ['exists', { query: { exists: { field: 'issuer_name' } } }],
  ['prefix', { query: { prefix: { status: 'ACT' } } }],
  /* wildcard 打 keyword（合法且正确）；打 text 会被 text-term 提示——
     那是**正确**的技术判断（倒排里是分词后词项，整串通配基本匹配不到），
     属有帮助的告警，不算误报。 */
  ['wildcard', { query: { wildcard: { status: 'a*b?' } } }],
  ['regexp', { query: { regexp: { status: 'a.*' } } }],
  ['fuzzy', { query: { fuzzy: { title: { value: 'abc', fuzziness: 'AUTO' } } } }],
  ['ids', { query: { ids: { values: ['1', '2'] } } }],
  ['match_all', { query: { match_all: {} } }],
  ['match_none', { query: { match_none: {} } }],
  ['bool 四分区', { query: { bool: { must: [{ term: { status: 'A' } }], filter: [{ exists: { field: 'title' } }], should: [{ match: { title: 'x' } }], must_not: [{ term: { status: 'B' } }] } } }],
  ['bool 单 should 无 msm', { query: { bool: { should: [{ term: { status: 'A' } }, { term: { status: 'B' } }] } } }],
  ['bool should + msm', { query: { bool: { should: [{ term: { a: '1' } }], minimum_should_match: 1 } } }],
  ['bool 空 filter 数组', { query: { bool: { must: [{ match_all: {} }], filter: [] } } }],
  ['nested', { query: { nested: { path: 'products', query: { term: { 'products.color': 'red' } } } } }],
  ['nested 带 inner_hits', { query: { nested: { path: 'products', query: { match_all: {} }, inner_hits: {} } } }],
  ['constant_score', { query: { constant_score: { filter: { term: { status: 'A' } }, boost: 1.2 } } }],
  ['function_score', { query: { function_score: { query: { match_all: {} }, boost: 1.5, boost_mode: 'multiply' } } }],
  ['dis_max', { query: { dis_max: { queries: [{ match: { title: 'x' } }], tie_breaker: 0.3 } } }],
  ['boosting', { query: { boosting: { positive: { term: { a: '1' } }, negative: { term: { b: '2' } }, negative_boost: 0.2 } } }],
  ['geo_distance', { query: { geo_distance: { distance: '10km', location: { lat: 1, lon: 2 } } } }],
  ['sort 多键', { query: { match_all: {} }, sort: [{ publish_time: { order: 'desc' } }, { _score: { order: 'desc' } }] }],
  ['sort 简写', { query: { match_all: {} }, sort: ['publish_time', { amount: 'asc' }] }],
  ['_source includes', { query: { match_all: {} }, _source: { includes: ['title'], excludes: ['content'] } }],
  ['_source 数组', { query: { match_all: {} }, _source: ['title', 'status'] }],
  ['highlight', { query: { match: { title: 'x' } }, highlight: { pre_tags: ['<em>'], post_tags: ['</em>'], fields: { title: {}, content: { number_of_fragments: 2 } } } }],
  ['aggs terms', { query: { match_all: {} }, aggs: { by_status: { terms: { field: 'status', size: 10 } } } }],
  ['aggs 嵌套', { query: { match_all: {} }, aggs: { a: { terms: { field: 'status', size: 5 }, aggs: { avg_amt: { avg: { field: 'amount' } } } } } }],
  ['aggs date_histogram calendar', { query: { match_all: {} }, aggs: { h: { date_histogram: { field: 'publish_time', calendar_interval: 'day' } } } }],
  ['aggs date_histogram fixed', { query: { match_all: {} }, aggs: { h: { date_histogram: { field: 'publish_time', fixed_interval: '30s' } } } }],
  ['aggs 多指标', { query: { match_all: {} }, aggs: { s: { stats: { field: 'amount' } }, c: { cardinality: { field: 'status' } }, p: { percentiles: { field: 'amount' } } } }],
  ['collapse', { query: { match_all: {} }, collapse: { field: 'issuer_name' } }],
  ['collapse inner_hits', { query: { match_all: {} }, collapse: { field: 'issuer_name', inner_hits: { name: 'x', size: 1 } } }],
  ['post_filter', { query: { match_all: {} }, post_filter: { term: { status: 'A' } } }],
  ['from/size/terminate_after', { query: { match_all: {} }, from: 0, size: 20, terminate_after: 1000 }],
  ['track_total_hits bool', { query: { match_all: {} }, track_total_hits: true }],
  ['track_total_hits 数字', { query: { match_all: {} }, track_total_hits: 10000 }],
  ['min_score', { query: { match: { title: 'x' } }, min_score: 0.5 }],
  ['script_fields', { query: { match_all: {} }, script_fields: { x: { script: { source: 'doc["amount"].value * 2' } } } }],
  ['runtime_mappings', { query: { match_all: {} }, runtime_mappings: { day: { type: 'keyword', script: { source: 'emit(doc["status"].value)' } } } }],
  ['knn', { knn: { field: 'vec', query_vector: [1, 2], k: 10, num_candidates: 100 } }],
  ['suggest', { query: { match_all: {} }, suggest: { s: { text: 'x', term: { field: 'title' } } } }],
  ['rescore', { query: { match: { title: 'x' } }, rescore: { window_size: 50, query: { rescore_query: { match_phrase: { title: 'x' } }, query_weight: 1, rescore_query_weight: 2 } } }],
  /* ── 1439：官方罕见子句（形状按 8.15 文档逐条核对）──────────────────────────
     这批不是「应该能解析」的期望，而是「官方文档就是这么写」的合法输入：
     lint 若对它们出声，就是边界过宽。 */
  ['geo_grid（官方形状：字段键 + geohash）', { query: { geo_grid: { location: { geohash: 'u0' } } } }],
  ['geo_grid geotile + precision', { query: { geo_grid: { location: { geotile: { precision: 4 } } } } }],
  ['geo_polygon', { query: { geo_polygon: { location: { points: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { lat: 5, lon: 6 }] } } } }],
  ['geo_bounding_box', { query: { geo_bounding_box: { location: { top_left: [1, 2], bottom_right: [3, 4] } } } }],
  ['shape envelope', { query: { shape: { location: { type: 'envelope', coordinates: [[1, 2], [3, 4]] } } } }],
  ['intervals all_of + gap', { query: { intervals: { content: { all_of: { ordered: true, intervals: [{ match: { query: 'a' } }, { gap: { width: 5 } }] } } } } }],
  ['intervals any_of', { query: { intervals: { content: { any_of: { intervals: [{ match: { query: 'a' } }, { wildcard: { pattern: 'b*' } }] } } } } }],
  ['rank_feature + saturation', { query: { rank_feature: { amount: { boost: 2, saturation: { pivot: 3 } } } } }],
  ['distance_feature', { query: { distance_feature: { field: 'location', origin: 'now-1d', pivot: '7d', boost: 2 } } }],
  ['sparse_vector', { query: { sparse_vector: { field: 'vec', query_vector: { a: 1, b: 2 } } } }],
  ['text_expansion', { query: { text_expansion: { 'ml.tokens': { model_id: '.elser_model_2', model_text: 'hi' } } } }],
  ['terms_set + script', { query: { terms_set: { tags: { terms: ['a', 'b'], minimum_should_match_script: { source: '1' } } } } }],
  ['terms lookup', { query: { terms: { tags: { index: 'other', id: '1', path: 'tags' } } } }],
  ['percolate document', { query: { percolate: { field: 'query', document: { a: 1 } } } }],
  ['more_like_this', { query: { more_like_this: { fields: ['title'], like: ['a b'], min_term_freq: 2 } } }],
  ['pinned', { query: { pinned: { ids: ['1', '2'], organic: { match: { title: 'x' } } } } }],
  ['rule', { query: { rule: { match_criteria: { status: 'A' }, ruleset_id: 'rs-1', organic: { match: { title: 'x' } } } } }],
  ['type 查询（已弃用但仍合法）', { query: { type: { value: 'doc' } } }],
  ['wrapper', { query: { wrapper: { query: 'eyJ0ZXJtIjp7ImEiOjF9fQ==' } } }],
  ['script 查询 + params', { query: { script: { script: { source: 'doc["amount"].value > params.n', params: { n: 1 } } } } }],
  ['script_score', { query: { script_score: { query: { match_all: {} }, script: { source: '_score * 2' } } } }],
  ['has_child', { query: { has_child: { type: 'reply', query: { match_all: {} }, score_mode: 'max' } } }],
  ['has_parent', { query: { has_parent: { parent_type: 'post', query: { match_all: {} } } } }],
  ['parent_id', { query: { parent_id: { type: 'reply', id: '1' } } }],
  ['span_near', { query: { span_near: { clauses: [{ span_term: { title: 'a' } }, { span_term: { title: 'b' } }], slop: 2, in_order: true } } }],
  ['span_not', { query: { span_not: { include: { span_term: { title: 'a' } }, exclude: { span_term: { title: 'b' } } } } }],
  ['multi_terms agg', { query: { match_all: {} }, aggs: { mt: { multi_terms: { terms: [{ field: 'status' }, { field: 'issuer_name' }] } } } }],
  ['auto_date_histogram agg', { query: { match_all: {} }, aggs: { h: { auto_date_histogram: { field: 'publish_time', buckets: 10 } } } }],
  ['filters agg', { query: { match_all: {} }, aggs: { f: { filters: { filters: { a: { term: { status: 'A' } }, b: { term: { status: 'B' } } } } } } }],
  ['significant_terms agg', { query: { match_all: {} }, aggs: { st: { significant_terms: { field: 'status' } } } }],
  ['top_hits agg', { query: { match_all: {} }, aggs: { th: { top_hits: { size: 3, _source: ['title'] } } } }],
  ['rare_terms agg', { query: { match_all: {} }, aggs: { rt: { rare_terms: { field: 'status' } } } }],
  ['composite agg', { query: { match_all: {} }, aggs: { c: { composite: { sources: [{ s: { terms: { field: 'status' } } }] } } } }],
  ['pipeline agg bucket_sort', { query: { match_all: {} }, aggs: { a: { terms: { field: 'status' }, aggs: { bs: { bucket_sort: { sort: [{ _count: { order: 'desc' } }] } } } } } }],
  ['nested + reverse_nested', { query: { nested: { path: 'products', query: { match_all: {} } } }, aggs: { p: { nested: { path: 'products' }, aggs: { r: { reverse_nested: {} } } } } }],
];

describe('1433 lint 对合法 DSL 零误报', () => {
  /* match-all 是**性能告警**（「全量扫描会遍历全索引」），对不带过滤条件的查询本来就会提示，
     属设计内行为，不算误报。除此之外的规则若对合法写法出声，才是边界过宽。
     1439：agg-size-default 同理——「terms 未写 size 默认只回 10 桶」是事实且可操作，
     对真·terms 聚合提示属设计内（composite 的 sources 不是聚合体，必须不提示，见下条）。 */
  const PERF_ADVISORY = new Set(['match-all', 'missing-filter', 'deep-paging', 'huge-size', 'agg-size-default']);

  it('生产级合法写法逐条扫描：除性能告警外不得有任何 finding', () => {
    const bad: string[] = [];
    for (const [label, dsl] of LEGIT) {
      const fs = lintDsl(dsl, { fields: Object.entries(MAP).map(([path, type]) => ({ path, type })) })
        .filter(f => !PERF_ADVISORY.has(f.rule));
      if (fs.length) bad.push(`${label} → ${fs.map(f => f.rule + '(' + f.message.slice(0, 40) + ')').join('; ')}`);
    }
    expect(bad, '合法写法被误报：\n' + bad.join('\n')).toEqual([]);
  });

  it('composite 的 sources.terms 不是聚合体，不得提示「未写 size」', () => {
    const ctx = { fields: Object.entries(MAP).map(([path, type]) => ({ path, type })) };
    const composite = { query: { match_all: {} }, aggs: { c: { composite: { sources: [{ s: { terms: { field: 'status' } } }], size: 100 } } } };
    const fs1 = lintDsl(composite, ctx).filter(f => f.rule === 'agg-size-default');
    expect(fs1, 'composite 的取值源不支持 size，提示属误报').toEqual([]);
    /* 对照：真·terms 聚合缺 size 仍要提示（证明上面的豁免没有把规则整体关掉） */
    const plain = { query: { match_all: {} }, aggs: { by_status: { terms: { field: 'status' } } } };
    expect(lintDsl(plain, ctx).some(f => f.rule === 'agg-size-default'), '真 terms 聚合必须仍提示').toBe(true);
    /* 嵌套 terms（aggs.a.aggs.b.terms）同样仍提示 */
    const nested = { query: { match_all: {} }, aggs: { a: { terms: { field: 'status', size: 5 }, aggs: { b: { terms: { field: 'issuer_name' } } } } } };
    expect(lintDsl(nested, ctx).some(f => f.rule === 'agg-size-default'), '嵌套 terms 必须仍提示').toBe(true);
  });

  it('负控：确实有问题的写法必须仍被报出（证明上面的零误报不是「规则全哑」）', () => {
    const cases: Array<[string, any, string]> = [
      ['text 字段 term', { query: { term: { title: 'x' } } }, 'text-term'],
      ['sort 方向拼错', { query: { match_all: {} }, sort: [{ publish_time: { order: 'descc' } }] }, 'sort-order-typo'],
      ['nested 缺 path', { query: { nested: { query: { match_all: {} } } } }, 'nested-path'],
      ['root 裸子句', { match: { title: 'x' } }, 'root-bare-clause'],
      ['range 操作符拼错', { query: { range: { amount: { gtee: 1 } } } }, 'range-op-typo'],
      ['bool 键拼错', { query: { bool: { musst: [{ match_all: {} }] } } }, 'bool-key-typo'],
      ['date_histogram 缺间隔', { query: { match_all: {} }, aggs: { h: { date_histogram: { field: 'publish_time' } } } }, 'agg-interval-key'],
      ['from 非数字', { query: { match_all: {} }, from: 'abc' }, 'body-value-type'],
    ];
    const missing: string[] = [];
    for (const [label, dsl, rule] of cases) {
      const fs = lintDsl(dsl, { fields: Object.entries(MAP).map(([path, type]) => ({ path, type })) });
      if (!fs.some(f => f.rule === rule)) missing.push(`${label} 未报 ${rule}（实际：${fs.map(f => f.rule).join(',') || '无'}）`);
    }
    expect(missing, '负控失效：\n' + missing.join('\n')).toEqual([]);
  });
});
