import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../queryAst';
import { OPS_META, labelOfOp, paramsForOp } from '../queryAstOps';

/* 1152：函数族与官方检索器补充审计。
 1106 已锁一批非常用语法往返；本轮补函数评分（function_score 的各 function 形态，
 含 interpolate 插值）、script_score 全文形态、以及 8.14+ retriever 的多样组合。
 口径同 1106：任何合法 body 经 parse→serialize 必须原样返回（未结构化键允许落 extras）。 */
const CASES: Array<[string, any]> = [
  ['interpolate linear', { query: { function_score: { query: { match_all: {} }, functions: [
    { filter: { range: { ts: { gte: 'now-7d' } } }, weight: 2,
      interpolate: { linear: { ts: { origin: 'now', scale: '10d' }, weight: 2 } } }] } } }],
  ['interpolate exp', { query: { function_score: { functions: [
    { interpolate: { exp: { ts: { origin: 'now', scale: '1d', offset: '1h', decay: 0.5 } } } }] } } }],
  ['interpolate gauss with weight', { query: { function_score: { functions: [
    { interpolate: { gauss: { score: { origin: 1, scale: 0.5 } }, weight: 3 } }] } } }],
  ['random_score', { query: { function_score: { functions: [{ random_score: { seed: 42, field: '_seq_no' } }] } } }],
  ['field_value_factor', { query: { function_score: { functions: [
    { field_value_factor: { field: 'likes', factor: 1.2, modifier: 'sqrt', missing: 1 } }] } } }],
  ['script_score full', { query: { script_score: { query: { match_all: {} },
    script: { source: 'Math.log(2 + doc["likes"].value)', params: { a: 1 } }, min_score: 0.5 } } }],
  ['retriever knn flat + filter', { retriever: { knn: { field: 'v', query_vector: [0.1], k: 5, num_candidates: 20,
    filter: { term: { status: 'open' } } } } }],
  ['retriever rrf with rank_window_size', { retriever: { rrf: { retrievers: [
    { standard: { query: { match_all: {} } } }, { standard: { query: { term: { a: 1 } } } }],
    rank_constant: 20, rank_window_size: 100 } } }],
  ['retriever standard with min_score', { retriever: { standard: { query: { match_all: {} }, min_score: 0.1 } } }],
  ['script_score with boost_mode', { query: { function_score: { query: { match: { title: 'x' } },
    boost: 1.5, boost_mode: 'sum', score_mode: 'max', max_boost: 3, min_score: 0.2 } } }],
];

describe('1152 函数族/检索器往返审计', () => {
  it.each(CASES)('%s', (_name, body) => {
    const p = parseTree(body);
    expect(p.ok, 'parse 应成功').toBe(true);
    if (!p.ok) return;
    expect(serializeTree(p.tree)).toEqual(body);
  });
});

describe('1152 算子注册表完整性', () => {
  it('每个已注册算子都有可读标签（不得回落裸英文 op 名）', () => {
    const raw: string[] = [];
    for (const op of Object.keys(OPS_META)) {
      const label = labelOfOp(op);
      if (!label || label === op) raw.push(op);
    }
    expect(raw, '缺可读标签的算子').toEqual([]);
  });

  it('script_score 参数经 paramsForOp 清洗后保留官方 min_score（wrap 算子真实消费链）', () => {
    /* script_score 属 wrap 族（参数表在 WRAP_OP_PARAMS），UI 换算子走 paramsForOp：
       断言真实链路而不是取错源头（OPS_META 只装叶子算子）。 */
    const kept = paramsForOp('script_score', { min_score: 0.5, bogus: 1 });
    expect(kept).toHaveProperty('min_score', 0.5);
    expect(kept).not.toHaveProperty('bogus');
  });
});
