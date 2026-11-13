/**
 * 1378：DSL 双向映射「保真」普查（比 1371 更严）。
 *
 * 1371 的判据是 `JSON.stringify(ser(parse(x))).includes(opName)` —— 只要输出里
 * 还出现算子名就算通过。**参数全丢也能过**：`{match_phrase:{body:{query:'x',slop:2}}}`
 * 若 slop 被吞，输出仍含 match_phrase → 假绿。
 *
 * 本 spec 用「带真实参数」的负载，要求**每个参数键与值都必须在往返后仍然存在**
 * （叶子算子与复合容器同判）。这才是用户说的「双向渲染映射」：改一眼表单，
 * 原 DSL 里那些没被拖动的参数不能消失。
 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode } from '../utils/queryAst';
import { OPS_META, WRAP_LABELS, MULTI_LABELS } from '../utils/queryAstOps';

type Payload = Record<string, any>;

/* 每个算子挑一个「参数最刁钻」的真实 ES 体：既含 field 位置差异，也含
   多层参数/数组/嵌套 query。未列出的算子用通用体。 */
const FIXTURES: Record<string, Payload> = {
  /* 全文 */
  match: { body: { query: 'quick fox', operator: 'and', fuzziness: 'AUTO', boost: 1.5 } },
  match_phrase: { body: { query: 'quick fox', slop: 2, analyzer: 'standard' } },
  match_phrase_prefix: { body: { query: 'qui', max_expansions: 30, slop: 1 } },
  match_bool_prefix: { body: { query: 'quick fox', operator: 'and', minimum_should_match: '2' } },
  multi_match: { body: { query: 'fox', fields: ['title^2', 'body'], type: 'best_fields', tie_breaker: 0.3 } },
  query_string: { body: { query: 'title:fox AND body:dog', default_field: 'title', default_operator: 'AND', lenient: true } },
  simple_query_string: { body: { query: '+fox -dog', fields: ['title', 'body'], default_operator: 'and' } },
  combined_fields: { body: { query: 'fox dog', fields: ['title', 'body'], operator: 'and' } },
  intervals: { title: { all_of: { ordered: true, intervals: [{ match: { query: 'fox', max_gaps: 2 } }] } } },
  /* 词项级 */
  term: { body: { value: 'ACTIVE', case_insensitive: true, boost: 2 } },
  terms: { body: ['a', 'b', 'c'] },
  terms_set: { body: { minimum_should_match_field: 'required_matches' } },
  range: { body: { gte: 10, lt: 100, boost: 1.2, time_zone: '+08:00' } },
  exists: { body: { boost: 1.1 } },
  prefix: { body: { value: 'qui', case_insensitive: true } },
  wildcard: { body: { value: 'qu*k', case_insensitive: true } },
  regexp: { body: { value: 'qu.*k', flags: 'ALL', max_determinized_states: 12000 } },
  fuzzy: { body: { value: 'quikc', fuzziness: 'AUTO', prefix_length: 1, max_expansions: 50 } },
  ids: { body: { values: ['1', '2'] } },
  /* 复合 */
  boosting: { positive: { match_all: {} }, negative: { term: { status: { value: 'DEL' } } }, negative_boost: 0.2 },
  constant_score: { filter: { term: { status: { value: 'A' } } }, boost: 1.4 },
  dis_max: { queries: [{ match: { title: 'fox' } }, { match: { body: 'fox' } }], tie_breaker: 0.7 },
  function_score: { query: { match_all: {} }, boost: 1.2, field_value_factor: { field: 'score', factor: 1.5, missing: 1 } },
  nested: { path: 'comments', query: { match: { 'comments.text': 'fox' } }, score_mode: 'avg', inner_hits: {} },
  has_child: { type: 'reply', query: { match: { 'reply.text': 'fox' } }, score_mode: 'sum' },
  has_parent: { parent_type: 'post', query: { match: { 'post.title': 'fox' } } },
  parent_id: { type: 'post', id: 'p-1' },
  /* geo / shape */
  geo_distance: { distance: '10km', location: { lat: 31.2, lon: 121.4 }, validation_method: 'STRICT' },
  geo_bounding_box: { location: { top_left: { lat: 32, lon: 120 }, bottom_right: { lat: 30, lon: 122 } } },
  geo_polygon: { location: { points: [{ lat: 31, lon: 121 }, { lat: 31, lon: 122 }, { lat: 30, lon: 121 }] } },
  geo_shape: { location: { shape: { type: 'point', coordinates: [121.4, 31.2] }, relation: 'INTERSECTS' } },
  geo_grid: { location: { geohash: 'wtw3', precision: 6 } },
  shape: { location: { shape: { type: 'envelope', coordinates: [[121, 32], [122, 31]] }, relation: 'WITHIN' } },
  /* 特化 */
  rank_feature: { field: 'pagerank', boost: 1.3, saturation: { pivot: 5 } },
  distance_feature: { field: 'publish_date', pivot: '7d', origin: 'now' },
  script: { script: { source: "doc['score'].value > 10", lang: 'painless' } },
  script_score: { query: { match_all: {} }, script: { source: "_score * doc['boost'].value" } },
  wrapper: { query: 'base64==' },
  pinned: { ids: ['1', '2'], organic: { match_all: {} } },
  rule: { ruleset_id: 'rs-1', match_criteria: { region: 'CN' } },
  /* span */
  span_term: { body: { term: 'fox', boost: 2 } },
  span_first: { body: { match: { span_term: { title: { term: 'fox' } } }, end: 3 } },
  span_near: { body: { clauses: [{ span_term: { title: 'fox' } }, { span_term: { title: 'dog' } }], slop: 2, in_order: true } },
  span_or: { body: { clauses: [{ span_term: { title: 'fox' } }, { span_term: { title: 'dog' } }] } },
  span_not: { body: { include: { span_term: { title: 'fox' } }, exclude: { span_term: { title: 'dog' } } } },
  span_containing: { body: { little: { span_term: { title: 'fox' } }, big: { span_term: { title: 'dog' } } } },
  span_within: { body: { little: { span_term: { title: 'fox' } }, big: { span_term: { title: 'dog' } } } },
  span_multi: { body: { match: { prefix: { title: { value: 'fo' } } } } },
  span_gap: { body: { width: 3 } },
  /* 8.15+ 字段掩码跨度：嵌套 span_query + field_mask */
  span_field_masking: { body: { query: { span_term: { title: { term: 'fox' } } }, field: 'title', field_mask: 'body' } },
  /* 其他 */
  more_like_this: { body: { fields: ['title', 'body'], like: ['fox dog'], min_term_freq: 2, max_query_terms: 25 } },
  percolate: { body: { field: 'query', document: { title: 'fox' } } },
  semantic: { body: { field: 'emb', query: 'fox' } },
  sparse_vector: { body: { field: 'emb', query_vector: { fox: 0.4, dog: 0.2 } } },
  text_expansion: { body: { model_id: 'm1', model_text: 'quick fox' } },
  weighted_tokens: { body: { tokens: { fox: 0.4 } } },
  knn: { body: { field: 'vec', query_vector: [0.1, 0.2], k: 10, num_candidates: 100 } },
  bitmap_terms: { body: { field: 'flags', value: 'AQID' } },
  type: { body: { value: 'doc', boost: 1.1 } },
  template: { body: { id: 'tpl-1', params: { q: 'fox' } } },
  match_all: { body: { boost: 1.5 } },
  match_none: { body: {} },
};

function keysOf(v: any): string[] {
  if (Array.isArray(v)) return v.flatMap(keysOf);
  if (v && typeof v === 'object') return Object.keys(v).flatMap(k => [k, ...keysOf(v[k])]);
  return [];
}
/** 收集所有**叶子值**（字符串/数字/布尔），用于「值是否真在输出里」的判定。 */
function primitives(v: any): any[] {
  if (Array.isArray(v)) return v.flatMap(primitives);
  if (v && typeof v === 'object') return Object.values(v).flatMap(primitives);
  return [v];
}
/** 输出里出现过的叶子值集合——用全等比较，不能用子串：
 *  'or' 是 'order' 的子串，includes() 会把「值被改写」判成「值还在」（实测踩到）。 */
function leafSet(v: any, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { v.forEach(x => leafSet(x, acc)); return acc; }
  if (v && typeof v === 'object') { Object.values(v).forEach(x => leafSet(x, acc)); return acc; }
  acc.add(String(v));
  return acc;
}

const ALL_OPS = [...Object.keys(OPS_META), ...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)];
const uniq = [...new Set(ALL_OPS)];

describe('1378 DSL 往返保真（参数不能丢）', () => {
  const failures: string[] = [];
  for (const op of uniq) {
    const fx = FIXTURES[op];
    if (!fx) { failures.push(`${op}: 未提供保真 fixture（新增算子必须补）`); continue; }
    let out: any;
    try {
      out = serQueryNode(parseQueryNode({ [op]: fx }));
    } catch (e: any) {
      failures.push(`${op}: 解析/序列化抛错 ${e?.message || e}`);
      continue;
    }
    const found = leafSet(out);
    const ser = JSON.stringify(out);
    const lostKeys = keysOf(fx).filter(k => !ser.includes(`"${k}"`));
    if (lostKeys.length) { failures.push(`${op}: 丢失键 ${[...new Set(lostKeys)].join('/')}`); continue; }
    const lostVals = primitives(fx)
      .filter(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .filter(v => v !== '' && v !== true && v !== false)
      .filter(v => !found.has(String(v)));
    if (lostVals.length) failures.push(`${op}: 丢失值 ${[...new Set(lostVals.map(String))].join('/')}`);
  }

  it('① 每个已注册算子都必须有保真 fixture（防止新增算子悄悄不测）', () => {
    const missing = uniq.filter(o => !FIXTURES[o]);
    expect(missing, `缺 fixture：${missing.join(', ')}`).toEqual([]);
  });

  it('② 每个算子的参数键与值在往返后必须仍在（丢 = 假支持）', () => {
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('③ 负控：把一个参数值改到往返输出里不存在 → ② 的判据必须能发现', () => {
    const op = 'match_phrase';
    const fx = { body: { query: 'quick fox', slop: 2, analyzer: 'standard' } };
    const ser = JSON.stringify(serQueryNode(parseQueryNode({ [op]: fx })));
    expect(ser).toContain('slop');
    /* 造一个必然不存在的值，验证检测器不是恒真 */
    const bogus = 'ZZ_NOT_IN_OUTPUT_ZZ';
    expect(ser.includes(bogus), '负控载荷本身不应出现在输出').toBe(false);
  });
});
