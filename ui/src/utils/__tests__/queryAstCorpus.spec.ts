/* 998 批：ES 8.x Query DSL 全量语料门禁（探针转正）。
   三条硬契约：
   ① 每一个合法形态 serialize(parse(x)) 深等于 x（往返无损）；
   ② 不落 __raw__ 兜底（结构化覆盖，即「树能编辑」而非丢进通用键值表）；
   ③ 顶层检索键（查询体参数 + sort/_source/highlight/aggs…）全套往返一致。
   语料按 ES 官方 Query DSL 目录逐族枚举：全文 / 词项级 / 地理 / 复合 / 关联 / 跨度 / 向量语义。 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode, parseTree, serializeTree, emptyTree, type QueryNode, type QueryTree } from '../queryAst';
import { SEARCH_PARAMS } from '../queryBodyParams';
import { OPS_META, WRAP_PARAMS } from '../queryAstOps';

const rt = (q: unknown) => serQueryNode(parseQueryNode(q));
const roundTrip = (q: unknown) => expect(rt(q)).toEqual(q);

/* 「落 __raw__ 兜底」= 结构化覆盖的反面 */
function isRaw(n: QueryNode): boolean {
  if (n.type !== 'leaf') return false;
  if (n.op === '__raw__') return true;
  if (n.op === 'match_all' || n.op === 'match_none') return false;
  if (n.field === null && n.raw !== null) return true;
  return false;
}

const CORPUS: Array<[string, unknown]> = [
  /* ---- 全文 ---- */
  ['match', { match: { title: { query: 'hello world', operator: 'and' } } }],
  ['match-scalar', { match: { title: 'hello' } }],
  ['match-expanded-single', { match: { title: { query: 'hello' } } }],
  ['match_bool_prefix', { match_bool_prefix: { title: { query: 'quick brown f', operator: 'and' } } }],
  /* 1045：bitmap_terms（9.0 term-level）——官方 {field, value} 具名形态 */
  ['bitmap_terms', { bitmap_terms: { field: 'product_id', value: 'AQAAAA==' } }],
  ['match_phrase', { match_phrase: { title: { query: 'quick brown', slop: 2 } } }],
  ['match_phrase_prefix', { match_phrase_prefix: { title: { query: 'quick brown f', max_expansions: 10 } } }],
  ['multi_match', { multi_match: { query: 'brown fox', fields: ['title^3', 'body'], type: 'best_fields' } }],
  ['combined_fields', { combined_fields: { query: 'brown fox', fields: ['title', 'body'], operator: 'and' } }],
  ['query_string', { query_string: { query: 'title:foo AND body:bar', default_field: 'title' } }],
  ['simple_query_string', { simple_query_string: { query: 'foo + bar', fields: ['title'], default_operator: 'and' } }],
  ['intervals', { intervals: { title: { match: { query: 'foo', max_gaps: 2, ordered: true } } } }],
  /* 1011：intervals 递归容器 + 位置过滤（专用编辑位覆盖面语料） */
  ['intervals-nested', { intervals: { title: {
    all_of: {
      intervals: [
        { match: { query: 'a' } },
        { any_of: { intervals: [{ prefix: { prefix: 'b' } }, { wildcard: { pattern: 'c*' } }] } },
      ],
      max_gaps: 2, ordered: true,
    } } } }],
  ['intervals-filter', { intervals: { title: {
    match: { query: 'x', filter: { not_containing: { match: { query: 'water' } } } }, _name: 'nm' } } }],
  ['more_like_this', { more_like_this: { fields: ['title'], like: 'once upon a time', min_term_freq: 1 } }],
  /* 1018：like 混合形态（串+文档引用+内联文档）——专用编辑位覆盖面语料 */
  ['more_like_this-mixed', { more_like_this: { fields: ['title'], like: ['free text', { _index: 'i', _id: '1' }, { doc: { title: 'bike' } }] } }],
  ['more_like_this-doc', { more_like_this: { fields: ['title'], like: { _index: 'i', _id: '1' } } }],

  /* ---- 词项级 ---- */
  ['term', { term: { status: { value: 'active', boost: 2 } } }],
  ['term-scalar', { term: { status: 'active' } }],
  ['term-expanded-single', { term: { status: { value: 'active' } } }],
  ['terms', { terms: { tag: ['a', 'b'] } }],
  ['terms-lookup', { terms: { user: { index: 'users', id: '2', path: 'followers' } } }],
  ['terms_set', { terms_set: { codes: { terms: ['a'], minimum_should_match_script: { source: '1' } } } }],
  ['range', { range: { age: { gte: 10, lte: 20, boost: 1.5 } } }],
  ['range-date-math', { range: { ts: { gte: 'now-1d/d', lt: 'now/d' } } }],
  ['exists', { exists: { field: 'user' } }],
  ['prefix', { prefix: { user: { value: 'ki', boost: 2 } } }],
  ['prefix-scalar', { prefix: { user: 'ki' } }],
  ['regexp', { regexp: { user: { value: 'k.*y', flags: 'ALL' } } }],
  ['wildcard', { wildcard: { user: { value: 'ki*y', case_insensitive: true } } }],
  ['fuzzy', { fuzzy: { user: { value: 'ki', fuzziness: 2 } } }],
  ['ids', { ids: { values: ['1', '2'] } }],
  ['parent_id', { parent_id: { type: 'answer', id: '1' } }],
  ['percolate', { percolate: { field: 'query', document: { message: 'hi' } } }],
  ['rank_feature', { rank_feature: { field: 'pagerank', boost: 2, saturation: { pivot: 8 } } }],
  ['distance_feature', { distance_feature: { field: 'date', pivot: '7d', origin: 'now' } }],
  ['script', { script: { script: { source: 'doc["age"].value > 10', lang: 'painless' } } }],
  ['wrapper', { wrapper: { query: 'eyJ0ZXJtIjp7fX0=' } }],
  ['semantic', { semantic: { field: 'inference_field', query: 'what is elastic' } }],
  ['sparse_vector', { sparse_vector: { field: 'emb', query_vector: { token: [0.1, 0.2] } } }],
  ['text_expansion', { text_expansion: { emb: { model_id: 'm', model_text: 'hello' } } }],
  ['weighted_tokens', { weighted_tokens: { emb: { hello: 0.5 } } }],

  /* ---- 地理 ---- */
  ['geo_distance', { geo_distance: { distance: '12km', location: { lat: 40, lon: -70 } } }],
  ['geo_bounding_box', { geo_bounding_box: { location: { top_left: { lat: 42, lon: -72 }, bottom_right: { lat: 40, lon: -74 } } } }],
  /* 1012：bbox 平铺四边形态（专用编辑位覆盖面语料） */
  ['geo_bounding_box-edges', { geo_bounding_box: { location: { top: 40, left: -74, right: -72, bottom: 39 } } }],
  ['geo_polygon', { geo_polygon: { location: { points: [{ lat: 40, lon: -70 }, { lat: 30, lon: -80 }] } } }],
  ['geo_shape', { geo_shape: { location: { shape: { type: 'envelope', coordinates: [[-70, 40], [-60, 50]] }, relation: 'intersects' } } }],
  ['geo_grid', { geo_grid: { location: { geohash: 'u17' } } }],
  ['shape', { shape: { geometry: { shape: { type: 'point', coordinates: [0, 0] }, relation: 'intersects' } } }],

  /* ---- 复合 ---- */
  ['bool', { bool: { must: [{ term: { a: 1 } }], filter: { term: { b: 2 } }, should: [], must_not: [{ exists: { field: 'c' } }], minimum_should_match: 1, boost: 2 } }],
  ['boosting', { boosting: { positive: { term: { a: 1 } }, negative: { term: { b: 2 } }, negative_boost: 0.5 } }],
  ['constant_score', { constant_score: { filter: { term: { a: 1 } }, boost: 1.2 } }],
  ['dis_max', { dis_max: { queries: [{ term: { a: 1 } }, { term: { b: 2 } }], tie_breaker: 0.7 } }],
  ['function_score', { function_score: { query: { match_all: {} }, functions: [{ filter: { term: { a: 1 } }, weight: 2 }], score_mode: 'sum' } }],
  ['script_score', { script_score: { query: { match_all: {} }, script: { source: '_score * 2' } } }],
  ['pinned', { pinned: { ids: ['1', '2'], organic: { term: { a: 1 } } } }],
  /* 999：rule 查询（8.14+ 检索规则）——ruleset_id 主值，match_criteria 走参数表 */
  ['rule', { rule: { ruleset_id: 'my-rules', match_criteria: { release_branch: 'trunk' } } }],

  /* ---- 关联 ---- */
  ['nested', { nested: { path: 'comments', query: { term: { 'comments.author': 'x' } }, score_mode: 'avg' } }],
  ['has_child', { has_child: { type: 'answer', query: { term: { a: 1 } }, score_mode: 'max' } }],
  ['has_parent', { has_parent: { parent_type: 'question', query: { term: { a: 1 } } } }],

  /* ---- 跨度 ---- */
  ['span_term', { span_term: { f: 'v' } }],
  ['span_first', { span_first: { match: { span_term: { f: 'v' } }, end: 3 } }],
  ['span_multi', { span_multi: { match: { prefix: { f: 'v' } } } }],
  ['span_near', { span_near: { clauses: [{ span_term: { f: 'a' } }, { span_term: { f: 'b' } }], slop: 12, in_order: false } }],
  ['span_or', { span_or: { clauses: [{ span_term: { f: 'a' } }] } }],
  ['span_not', { span_not: { include: { span_term: { f: 'a' } }, exclude: { span_term: { f: 'b' } }, dist: 3 } }],
  ['span_containing', { span_containing: { little: { span_term: { f: 'a' } }, big: { span_term: { f: 'b' } } } }],
  ['span_within', { span_within: { little: { span_term: { f: 'a' } }, big: { span_term: { f: 'b' } } } }],
  ['span_field_masking', { span_field_masking: { query: { span_term: { f: 'a' } }, field: 'f' } }],
  /* 999：span_gap——span_near 子句内的间隙占位（span_last 于 1009 撤册：ES 无此算子，
   官方文档 404；存量 DSL 中的 span_last 走未知算子 raw 退化零丢失，见下方退化断言） */
  ['span_gap', { span_gap: { text: 8 } }],
  ['span_near-gap', { span_near: { clauses: [{ span_term: { f: 'a' } }, { span_gap: { text: 8 } }, { span_term: { f: 'b' } }], slop: 12, in_order: true } }],
];

/* 畸形输入单列：只保证「不抛 + 输出仍是对象」，不承诺文本保真（既有 best-effort 归一契约） */
const MALFORMED: Array<[string, unknown]> = [
  ['multi-key-query', { term: { a: 1 }, match_all: {} }],
  ['null-body', { exists: null }],
  ['array-body', { term: [1, 2] }],
];

describe('998 queryAst 全量语料往返无损', () => {
  it.each(CORPUS)('%s 往返一致', (_name, q) => {
    roundTrip(q);
  });
});

/* 一〇〇九：span_last 撤册后的退化契约——未知算子（含曾被误注册的 span_last）落
   raw 叶（op 原名 + raw 权威）零丢失，往返仍一致（GenericNode 递归表可编辑，树富形态不再） */
describe('1009 未知算子零丢失退化', () => {
  it('span_last（ES 无此算子）落 raw 叶且往返一致', () => {
    const q = { span_last: { match: { span_term: { f: 'v' } }, end: 2 } };
    const n = parseQueryNode(q);
    expect(isRaw(n)).toBe(true);
    expect(serQueryNode(n)).toEqual(q);
  });
  /* 1045：geo_distance 串/geohash 坐标（合法 ES 形态）——location 键值位就位，
     富表单可直接编辑；validation_method 兄弟键进 params 不阻断结构化。 */
  it('geo_distance 串坐标与 validation_method 结构化且往返一致', () => {
    const q = { geo_distance: { distance: '12km', location: '40,-70', validation_method: 'IGNORE_MALFORMED' } };
    const n = parseQueryNode(q);
    expect(isRaw(n)).toBe(false);
    expect(n).toMatchObject({ type: 'leaf', op: 'geo_distance', field: 'location', value: '40,-70' });
    expect(serQueryNode(n)).toEqual(q);
  });
});

describe('998 queryAst 结构化覆盖普查（不落 __raw__）', () => {
  it('所有具名算子都有结构化投影', () => {
    const rawOps = CORPUS
      .map(([name, q]) => [name, parseQueryNode(q)] as const)
      .filter(([, n]) => isRaw(n))
      .map(([name]) => name);
    expect(rawOps).toEqual([]);
  });
  it('畸形输入不抛且输出仍是对象', () => {
    for (const [, q] of MALFORMED) {
      let out: unknown;
      expect(() => { out = rt(q); }).not.toThrow();
      expect(out && typeof out === 'object').toBe(true);
    }
  });
});

describe('998 查询体参数一等分账', () => {
  const TOP: Record<string, unknown> = {
    min_score: 0.5,
    track_total_hits: true,
    terminate_after: 100,
    search_after: [1690000000000, 'abc'],
    fields: ['a', 'b'],
    docvalue_fields: ['a', { field: 'b', format: 'date_time' }],
    stored_fields: ['a'],
    indices_boost: [{ idx: 2 }],
    slice: { id: 0, max: 3 },
    pit: { id: 'abc', keep_alive: '1m' },
    explain: true,
    version: true,
    seq_no_primary_term: true,
    track_scores: true,
    timeout: '1s',
    stats: ['probe'],
    profile: false,
    sub_searches: [{ query: { match: { title: 'x' } } }, { query: { match: { body: 'y' } } }],
    rank: { rrf: { rank_constant: 60, rank_window_size: 100 } },
    ext: { plugin_key: { enabled: true } },
  };

  it('注册表覆盖全部探针键（防止新增键漏登记）', () => {
    expect(new Set(SEARCH_PARAMS.map(p => p.key))).toEqual(new Set(Object.keys(TOP)));
  });

  it('顶层键不落 extras', () => {
    const r = parseTree({ query: { match_all: {} }, ...TOP });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.tree.extras)).toEqual([]);
    expect(Object.keys(r.tree.searchParams).sort()).toEqual(Object.keys(TOP).sort());
  });

  it('顶层键往返一致', () => {
    const r = parseTree({ query: { match_all: {} }, ...TOP });
    if (!r.ok) throw new Error(r.reason);
    expect(serializeTree(r.tree)).toEqual({ query: { match_all: {} }, ...TOP });
  });

  it('未注册键仍走 extras（零丢失）', () => {
    const r = parseTree({ query: { match_all: {} }, custom_key: { a: 1 } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.tree.extras).toEqual({ custom_key: { a: 1 } });
    expect(serializeTree(r.tree)).toEqual({ query: { match_all: {} }, custom_key: { a: 1 } });
  });
});

describe('998 顶层形态边界（tree 级）', () => {
  const rtTree = (dsl: Record<string, unknown>) => {
    const r = parseTree(dsl);
    if (!r.ok) throw new Error(r.reason);
    return serializeTree(r.tree);
  };
  it('sort 多键项保真（旧实现丢键）', () => {
    expect(rtTree({ sort: [{ a: { order: 'asc' }, b: { order: 'desc' } }] }))
      .toEqual({ sort: [{ a: { order: 'asc' }, b: { order: 'desc' } }] });
  });
  it('sort 单键对象/字符串/短形态全保真', () => {
    const dsl = { sort: ['_score', { ts: 'desc' }, { price: { order: 'asc', missing: '_last' } }] };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('_source 通配 pattern 保真', () => {
    expect(rtTree({ _source: { includes: ['obj.*'], excludes: ['*.secret'] } }))
      .toEqual({ _source: { includes: ['obj.*'], excludes: ['*.secret'] } });
  });
  it('highlight 完整形态保真', () => {
    const dsl = { highlight: { pre_tags: ['<b>'], fields: { body: { fragment_size: 100, number_of_fragments: 3 } } } };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('collapse + inner_hits 保真', () => {
    const dsl = { collapse: { field: 'user', inner_hits: { name: 'x', size: 3 } } };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('aggs 嵌套 + meta + aggregations 键名保真', () => {
    const dsl = { aggregations: { by_tag: { terms: { field: 'tag' }, aggs: { avg_price: { avg: { field: 'price' } } } } } };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  /* 1022：date_range ranges 行编辑 / filters 命名与匿名桶——一等编辑位覆盖面语料 */
  it('date_range ranges 混合区间保真', () => {
    const dsl = { aggs: { r: { date_range: { field: 'created', format: 'yyyy', ranges: [{ to: 'now-10M/M' }, { from: 100, to: 200, key: 'mid' }] } } } };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('filters 命名桶与匿名数组两形态保真', () => {
    const named = { aggs: { f: { filters: { filters: { errors: { term: { status: 'error' } }, warns: { match: { body: 'warn' } } }, other_bucket: true } } } };
    expect(rtTree(named)).toEqual(named);
    const anon = { aggs: { f: { filters: { filters: [{ match_all: {} }, { term: { status: 'ok' } }] } } } };
    expect(rtTree(anon)).toEqual(anon);
  });
  it('emptyTree 新字段默认空（防消费方 undefined）', () => {
    const t: QueryTree = emptyTree();
    expect(t.searchParams).toEqual({});
    expect(serializeTree(t)).toEqual({});
  });
});

describe('998 数组形态顶层键（多向量 / 多段重打分）', () => {
  const rtTree = (dsl: Record<string, unknown>) => {
    const r = parseTree(dsl);
    if (!r.ok) throw new Error(r.reason);
    return serializeTree(r.tree);
  };
  it('knn 对象形态往返', () => {
    const dsl = { knn: { field: 'v', query_vector: [1, 2], k: 10 } };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('knn 数组形态往返（多向量混合检索）', () => {
    const dsl = { knn: [{ field: 'v', query_vector: [1, 2], k: 10 }, { field: 'w', query_vector: [3, 4], k: 5, boost: 0.4 }] };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('knn 单元素数组保形（不塌成对象）', () => {
    const dsl = { knn: [{ field: 'v', query_vector: [1], k: 3 }] };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('knn 空数组保键', () => {
    expect(rtTree({ knn: [] })).toEqual({ knn: [] });
  });
  it('knn 数组含非法元素 → 整键落 extras 零丢失', () => {
    const dsl = { knn: [{ field: 'v', query_vector: [1], k: 3 }, { field: 42 }] };
    const r = parseTree(dsl);
    if (!r.ok) throw new Error(r.reason);
    expect(r.tree.knn).toBeNull();
    expect(r.tree.extras.knn).toEqual(dsl.knn);
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
  it('rescore 单段往返', () => {
    const dsl = { rescore: { window_size: 10, query: { rescore_query: { match_all: {} }, rescore_query_weight: 2 } } };
    expect(rtTree(dsl)).toEqual(dsl);
  });
  it('rescore 数组多段往返', () => {
    const dsl = {
      rescore: [
        { window_size: 50, query: { rescore_query: { match_phrase: { title: 'x' } }, query_weight: 1 } },
        { window_size: 10, query: { rescore_query: { term: { a: 1 } } } },
      ],
    };
    expect(rtTree(dsl)).toEqual(dsl);
  });
});

/* 999：具名参数 schema 扩充——高频调优参数不再埋进「更多参数」自由表。
   断言形态：按算子点名必须登记的键（enum 档在 GenericParams 升级为下拉）。 */
describe('999 具名参数 schema 扩充', () => {
  const keys = (op: string) => (OPS_META[op].params || []).map(p => p.key);
  it('match 系 / 查询串族登记控制类参数', () => {
    expect(keys('match')).toEqual(expect.arrayContaining(['minimum_should_match', 'analyzer', 'zero_terms_query']));
    expect(keys('multi_match')).toEqual(expect.arrayContaining(['tie_breaker', 'slop', 'minimum_should_match', 'analyzer', 'lenient']));
    expect(keys('query_string')).toEqual(expect.arrayContaining(['tie_breaker', 'minimum_should_match', 'analyze_wildcard', 'phrase_slop', 'lenient']));
    expect(keys('simple_query_string')).toEqual(expect.arrayContaining(['flags', 'minimum_should_match', 'lenient']));
    expect(keys('combined_fields')).toContain('operator');
  });
  it('range / 词项级族登记调优参数', () => {
    expect(keys('range')).toEqual(expect.arrayContaining(['relation', 'time_zone', 'format']));
    expect(keys('regexp')).toEqual(expect.arrayContaining(['flags', 'max_determinized_states', 'case_insensitive']));
    expect(keys('fuzzy')).toEqual(expect.arrayContaining(['prefix_length', 'max_expansions', 'transpositions']));
    expect(keys('prefix')).toContain('case_insensitive');
    expect(keys('exists')).toContain('boost');
    expect(keys('terms')).toContain('boost');
  });
  it('geo / 向量 / 相似族登记校验与权重参数', () => {
    expect(keys('geo_distance')).toContain('validation_method');
    expect(keys('geo_bounding_box')).toContain('validation_method');
    expect(keys('knn')).toContain('boost');
    expect(keys('more_like_this')).toEqual(expect.arrayContaining(['analyzer', 'minimum_should_match', 'max_query_terms', 'min_term_freq']));
  });
  it('enum 档与 ES 官方取值一致', () => {
    const opts = (op: string, key: string) => OPS_META[op].params!.find(p => p.key === key)?.options;
    expect(opts('range', 'relation')).toEqual(['WITHIN', 'INTERSECTS', 'CONTAINS']);
    expect(opts('match', 'zero_terms_query')).toEqual(['none', 'all']);
    expect(opts('geo_distance', 'validation_method')).toEqual(['STRICT', 'IGNORE_MALFORMED', 'COERCE']);
  });
});

/* 999：wrap 容器具名参数表——nested/has_child 等的 score_mode 等从自由表升为下拉 */
describe('999 wrap 容器具名参数表（WRAP_PARAMS）', () => {
  it('容器在册（1009 撤 span_last：ES 无此算子），枚举档与 ES 官方一致', () => {
    expect(new Set(Object.keys(WRAP_PARAMS))).toEqual(new Set(
      ['nested', 'has_child', 'has_parent', 'constant_score', 'function_score', 'script_score', 'span_first']));
    const opts = (op: string, key: string) => WRAP_PARAMS[op].find(p => p.key === key)?.options;
    expect(opts('has_child', 'score_mode')).toEqual(['avg', 'sum', 'max', 'min', 'none']);
    expect(opts('has_parent', 'score_mode')).toEqual(['none', 'score']);
    expect(opts('function_score', 'boost_mode')).toEqual(['multiply', 'replace', 'sum', 'avg', 'max', 'min']);
    expect(opts('function_score', 'score_mode')).toEqual(['multiply', 'sum', 'avg', 'first', 'max', 'min']);
    expect(WRAP_PARAMS.span_first.find(p => p.key === 'end')?.kind).toBe('number');
  });
});
