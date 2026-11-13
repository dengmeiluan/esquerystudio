import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../queryAst';

/* 1106：非常用 DSL 语法往返审计。
 * 目标不是「树里每个键都有专用控件」，而是任何合法 body 经 parse→serialize 必须原样返回；
 * 未结构化键允许落 extras 保真。这里用一批生产/官方常见组合逐项反锁。 */
const CASES: Array<[string, any]> = [
  ['terms lookup', { query: { terms: { user: { index: 'users', id: '2', path: 'followers' } } } }],
  ['terms_set script', { query: { terms_set: { tags: { terms: ['a', 'b'], minimum_should_match_script: { source: '1' } } } } }],
  ['nested inner_hits', { query: { nested: { path: 'comments', query: { match_all: {} }, inner_hits: { size: 3, name: 'c' }, score_mode: 'avg' } } }],
  ['has_child inner_hits', { query: { has_child: { type: 'reply', query: { match_all: {} }, inner_hits: { size: 2 }, min_children: 1 } } }],
  ['collapse inner_hits', { query: { match_all: {} }, collapse: { field: 'user', inner_hits: { size: 2, name: 'dup' }, max_concurrent_group_searches: 4 } }],
  ['knn filter', { query: { knn: { field: 'vec', query_vector: [0.1, 0.2], k: 5, num_candidates: 20, filter: { term: { status: 'open' } } } } }],
  ['geo_shape relation', { query: { geo_shape: { location: { shape: { type: 'envelope', coordinates: [[0, 0], [1, 1]] }, relation: 'WITHIN' } } } }],
  ['mlt like docs', { query: { more_like_this: { fields: ['title'], like: [{ _index: 'i', _id: '1' }], min_doc_freq: 1, max_doc_freq: 10 } } }],
  ['percolate document', { query: { percolate: { field: 'query', document: { title: 'x' } } } }],
  ['intervals filter', { query: { intervals: { body: { match: { query: 'fox', max_gaps: 2 }, any_of: { intervals: [{ match: { query: 'quick' } }] }, filter: { contained_by: { match: { query: 'dog' } } } } } } }],
  ['span_near', { query: { span_near: { clauses: [{ span_term: { body: 'quick' } }, { span_term: { body: 'fox' } }], slop: 2, in_order: true } } }],
  ['function_score funcs', { query: { function_score: { query: { match_all: {} }, functions: [{ filter: { term: { a: 1 } }, weight: 2 }, { gauss: { ts: { origin: '2026-01-01', scale: '10d' } } }], boost_mode: 'sum', score_mode: 'sum' } } }],
  ['pinned query', { query: { pinned: { ids: ['1', '2'], organic: { match_all: {} } } } }],
  ['rule query', { query: { rule: { ruleset_id: 'r1', match_criteria: { a: 'x' } } } }],
  ['rrf retriever', { retriever: { rrf: { retrievers: [{ standard: { query: { match_all: {} } } }, { knn: { field: 'v', query_vector: [1], k: 3, num_candidates: 9 } }], rank_constant: 60 } } }],
  ['linear retriever', { retriever: { linear: { retrievers: [{ retriever: { standard: { query: { match_all: {} } } }, weight: 2 }], normalizer: 'minmax' } } }],
  ['sub_searches rank', { sub_searches: [{ query: { match_all: {} } }], rank: { rrf: { rank_constant: 60, rank_window_size: 50 } } }],
  ['suggest contexts', { suggest: { s1: { text: 'foo', completion: { field: 'sug', contexts: { cat: ['a'] }, size: 5 } } } }],
  ['highlight arrays', { query: { match_all: {} }, highlight: { pre_tags: ['<b>'], post_tags: ['</b>'], fields: { title: { fragment_size: 50, number_of_fragments: 2 } } } }],
  ['sort advanced', { query: { match_all: {} }, sort: [{ ts: { order: 'desc', missing: '_last', mode: 'max', nested: { path: 'comments' } } }] }],
  ['aggs pipeline', { size: 0, aggs: { by: { terms: { field: 'k' }, aggs: { avg_v: { avg: { field: 'v' } }, max_avg: { max_bucket: { buckets_path: 'by>avg_v' } } } } } }],
  ['fields + docvalue', { query: { match_all: {} }, fields: ['title', 'ts'], docvalue_fields: [{ field: 'ts', format: 'epoch_millis' }], stored_fields: ['_none_'] }],
  ['pit + search_after', { query: { match_all: {} }, pit: { id: 'p1', keep_alive: '1m' }, search_after: [1, 'a'], track_total_hits: false }],
  ['script_fields', { query: { match_all: {} }, script_fields: { total: { script: { source: '1+1' } } } }],
  ['runtime_mappings', { query: { match_all: {} }, runtime_mappings: { day: { type: 'keyword', script: { source: 'emit(doc["ts"].value)' } } } }],
  ['rank_feature', { query: { rank_feature: { field: 'pagerank', saturation: { pivot: 2 }, boost: 1.5 } } }],
  ['distance_feature', { query: { distance_feature: { field: 'ts', pivot: '7d', origin: 'now', boost: 2 } } }],
  ['parent_id', { query: { parent_id: { type: 'answer', id: '1' } } }],
  ['match full params', { query: { match: { title: { query: 'fox', operator: 'and', fuzziness: 'AUTO', prefix_length: 2, zero_terms_query: 'all', auto_generate_synonyms_phrase_query: false } } } }],
  ['type legacy', { query: { type: { value: 'doc' } } }],
  ['unknown extras', { query: { match_all: {} }, _custom_top: { a: [1, { b: true }] } }],
];

describe('1106 非常用 DSL 往返审计', () => {
  it.each(CASES)('%s', (_name, body) => {
    const p = parseTree(body);
    expect(p.ok, 'parse 应成功').toBe(true);
    if (!p.ok) return;
    expect(serializeTree(p.tree)).toEqual(body);
  });
});
