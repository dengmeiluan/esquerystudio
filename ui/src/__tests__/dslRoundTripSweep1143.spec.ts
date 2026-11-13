/**
 * DSL 全量算子往返巡检（不依赖手写语料：按注册表自动生成官方形态）。
 *
 * 目的：覆盖缺口最可靠的检测方式——注册了但 parse→serialize 会漂移/丢键的算子，
 * 在构建器里就是「改一下就写坏」的隐形坑。本巡检遍历 OPS_META / WRAP_META /
 * MULTI_META 每个键，按各自的 form 拼出官方最小合法体，断言深等往返。
 *
 * 形态来源（与 ES 官方文档一致）：
 *  - field + wrap:value  → {op:{field:{value:X, ...params}}}
 *  - field + wrap:query  → {op:{field:{query:X, ...params}}}
 *  - field + wrap:none   → {op:{field:{...}}} / {op:{field:X}}（按 valueKey）
 *  - fields              → {op:{mainKey:X, fields:['f1','f2']}}
 *  - named               → {op:{fieldKey:'f', mainKey:X}}
 *  - none                → {op:{mainKey:X}}（mainKey 缺席时给空体）
 *  - wrap                → {op:{fieldKey:'f', childKey:{term:{f:'v'}}}}
 *  - multi               → {op:{key:[子查询…]}}
 */
import { describe, expect, it } from 'vitest';
import { parseQueryNode, serQueryNode, WRAP_META } from '../utils/queryAst';
import { OPS_META, WRAP_LABELS, MULTI_LABELS, MULTI_META, WRAP_PARAMS } from '../utils/queryAstOps';

const rt = (q: unknown) => serQueryNode(parseQueryNode(q));
const CHILD = { term: { f: 'v' } };

/* 直接吃注册表单源（不镜像，防两处漂移） */
const MULTI_KEYS: Record<string, string[]> = Object.fromEntries(
  Object.entries(MULTI_META).map(([op, m]) => [op, m.keys]),
);

/** 按 form 生成该算子的官方最小合法体 */
function bodyOf(op: string): unknown {
  const m = OPS_META[op];
  if (!m) return null;
  if (m.form === 'field') {
    if (m.wrap === 'none') return m.valueKey ? { field: { [m.valueKey]: 'v' } } : { field: { gte: 1, lte: 9 } };
    const k = m.valueKey ?? (m.wrap === 'query' ? 'query' : 'value');
    return { field: { [k]: 'v' } };
  }
  if (m.form === 'fields') return { [m.mainKey ?? 'query']: 'v', fields: ['f1', 'f2'] };
  if (m.form === 'named') return { [m.fieldKey ?? 'field']: 'f', [m.mainKey ?? 'value']: 'v' };
  /* none：mainKey 缺席（match_all/match_none/script 等）给空体 */
  return m.mainKey ? { [m.mainKey]: 'v' } : {};
}

describe('DSL 全量算子往返巡检（注册表驱动）', () => {
  const ops = Object.keys(OPS_META);

  it.each(ops)('leaf %s：官方形态往返无损', (op) => {
    const body = bodyOf(op);
    if (body === null) return;
    const q = { [op]: body };
    expect(rt(q)).toEqual(q);
  });

  it.each(Object.keys(WRAP_META))('wrap %s：官方形态往返无损', (op) => {
    const meta = WRAP_META[op];
    const body: Record<string, unknown> = { [meta.childKey]: CHILD };
    if (meta.fieldKey) body[meta.fieldKey] = 'f';
    const q = { [op]: body };
    expect(rt(q)).toEqual(q);
  });

  it.each(Object.keys(MULTI_KEYS))('multi %s：官方形态往返无损', (op) => {
    const body: Record<string, unknown> = {};
    for (const k of MULTI_KEYS[op]) body[k] = [CHILD];
    const q = { [op]: body };
    expect(rt(q)).toEqual(q);
  });

  /* 参数层最容易静默丢键：每个注册参数（number/text/boolean/enum/json）都要能往返。
     清单来源=各算子 params schema 单源，自动生成，新增字段自动纳入巡检。 */
  const paramCases: Array<[string, string, unknown]> = [];
  for (const [op, m] of Object.entries(OPS_META)) {
    for (const p of m.params ?? []) {
      const v = p.kind === 'number' ? 7 : p.kind === 'boolean' ? true
        : p.kind === 'json' ? { script: { source: '1' } } : (p.options?.[0] ?? 'x');
      paramCases.push([`leaf ${op}.${p.key}`, op, v]);
    }
  }

  it.each(paramCases)('%s：参数往返无损', (_label, op, v) => {
    const m = OPS_META[op];
    const body = bodyOf(op) as Record<string, unknown>;
    const key = _label.split('.').pop()!;
    if (m.form === 'field') {
      const fk = Object.keys(body)[0];
      body[fk] = typeof body[fk] === 'string' ? body[fk] : { ...(body[fk] as object), [key]: v };
    } else body[key] = v;
    const q = { [op]: body };
    expect(rt(q)).toEqual(q);
  });

  /* 包装容器参数（WRAP_PARAMS schema 同源） */
  it.each(Object.entries(WRAP_PARAMS).flatMap(([op, ps]) =>
    ps.map(p => [`wrap ${op}.${p.key}`, op, p.kind === 'number' ? 3 : p.kind === 'boolean' ? true : (p.options?.[0] ?? 'x')] as [string, string, unknown])))(
    '%s：包装参数往返无损', (_label, op, v) => {
      const meta = WRAP_META[op];
      const body: Record<string, unknown> = { [meta.childKey]: CHILD, [_label.split('.').pop()!]: v };
      if (meta.fieldKey) body[meta.fieldKey] = 'f';
      const q = { [op]: body };
      expect(rt(q)).toEqual(q);
    });

  /* 非最小但常用的官方形态（语料驱动巡检抓不到、却最常被用户写到的几类） */
  it.each([
    ['terms lookup', { terms: { user: { index: 'users', id: '2', path: 'followers' } } }],
    ['term 对象形态', { term: { f: { value: 'x' } } }],
    ['range 双向边界', { range: { age: { gte: 10, lt: 20, boost: 1.5 } } }],
    ['terms 数组 + boost', { terms: { f: ['a', 'b'], boost: 2 } }],
    ['exists 带 boost', { exists: { field: 'f', boost: 3 } }],
    ['match 对象形态', { match: { f: { query: 'x', operator: 'and' } } }],
    ['match_phrase slop', { match_phrase: { f: { query: 'a b', slop: 2 } } }],
    ['nested', { nested: { path: 'p', query: { term: { 'p.f': 'v' } }, score_mode: 'avg' } }],
    ['has_child', { has_child: { type: 'c', query: { term: { f: 'v' } }, min_children: 1 } }],
    ['function_score 无 query', { function_score: { functions: [{ weight: 2 }], boost_mode: 'sum' } }],
    ['function_score 带 query', { function_score: { query: { match_all: {} }, functions: [{ field_value_factor: { field: 'n' } }] } }],
    ['constant_score', { constant_score: { filter: { term: { f: 'v' } }, boost: 2 } }],
    ['boosting', { boosting: { positive: { term: { f: 'a' } }, negative: { term: { f: 'b' } }, negative_boost: 0.3 } }],
    ['dis_max 双查询', { dis_max: { queries: [{ term: { a: 1 } }, { term: { b: 2 } }], tie_breaker: 0.7 } }],
    ['span_near', { span_near: { clauses: [{ span_term: { f: 'a' } }, { span_term: { f: 'b' } }], slop: 3, in_order: true } }],
    ['intervals', { intervals: { f: { match: { query: 'x', max_gaps: 2, ordered: true } } } }],
    ['geo_distance', { geo_distance: { distance: '12km', location: { lat: 1, lon: 2 } } }],
    ['knn', { knn: { field: 'v', query_vector: [1, 2], k: 10, num_candidates: 50 } }],
    ['script_score', { script_score: { query: { match_all: {} }, script: { source: '1' } } }],
    ['pinned ids', { pinned: { ids: ['1', '2'], organic: { match_all: {} } } }],
    ['bool 混 occurs', { bool: { must: [{ term: { a: 1 } }], should: [{ term: { b: 2 } }], minimum_should_match: 1 } }],
  ])('%s：真实写法往返无损', (_n, q) => {
    expect(rt(q)).toEqual(q);
  });

  /* 宽松读入的「boost 与字段键同层」写法不是官方形态（官方 boost 在字段值对象内）：
     解析后按官方形态重写属于规范化，不是丢信息——这里锁规范化结果。 */
  it('term 散参数写法 → 规范化为官方嵌套形态（值/参数零丢失）', () => {
    const q = { term: { f: 'x', boost: 2, _name: 'n1' } };
    expect(rt(q)).toEqual({ term: { f: { value: 'x', boost: 2, _name: 'n1' } } });
    expect(rt(rt(q))).toEqual(rt(q));   /* 二次往返稳定 */
  });

  it('标签表与注册表同源覆盖（无孤儿标签）', () => {
    const wrapOrphans = Object.keys(WRAP_LABELS).filter(k => !(k in WRAP_META));
    expect(wrapOrphans, 'WRAP_LABELS 里存在未注册的包装算子').toEqual([]);
    const multiOrphans = Object.keys(MULTI_LABELS).filter(k => !(k in MULTI_KEYS));
    expect(multiOrphans, 'MULTI_LABELS 里存在未注册的多查询算子').toEqual([]);
  });
});
