/**
 * 1182：同一算子的「另一种官方合法写法」也要进树并原样写回。
 *
 * 1181 锁的是每个算子的**官方骨架**；但 ES 的同一个算子常有多种合法体：
 * `term` 可简写可展开、`terms` 可带 lookup、`geo_distance` 的坐标可字符串/对象/数组、
 * `percolate` 可给 document 也可给 id、`dis_max.queries` 可单对象也可数组、
 * `function_score` 可无 query、`bool.must` 可单对象也可数组……
 * 这些正是「非常用语法」：生产里偶尔出现，一旦落 raw，用户在构建器里就只剩一张键值表。
 *
 * 锁：① 结构位认对（字段位/主值位/容器分区）；② 写回同构（忽略键序，数组保序）；
 * ③ 几条形状记忆的抽查（expand 记忆、单对象 queries、percolate id 形态）。
 * 负控：同一算子里塞两个字段键（非法体）必须落 raw——证明这套判据不是恒真。
 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode, WRAP_META, type QueryNode } from '../utils/queryAst';
import { OPS_META } from '../utils/queryAstOps';

function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const MULTI_OPS = new Set(['boosting', 'dis_max', 'span_near', 'span_or', 'span_not', 'span_containing', 'span_within']);

/* expectField: 该写法下唯一可能的字段名（null = 无字段位） */
const CASES: Array<{ name: string; body: any; field?: string | null }> = [
  { name: 'term 展开形态', body: { term: { f: { value: 'x', boost: 2 } } }, field: 'f' },
  { name: 'term 数值标量', body: { term: { f: 123 } }, field: 'f' },
  { name: 'terms 带 boost（参数与字段同层）', body: { terms: { f: ['a', 'b'], boost: 2 } }, field: 'f' },
  { name: 'terms lookup（值位整体是对象）', body: { terms: { f: { index: 'idx', id: '1', path: 'tags' } } }, field: 'f' },
  { name: 'range 多界', body: { range: { f: { gte: 1, lt: 2, boost: 2 } } }, field: 'f' },
  { name: 'range 日期 math', body: { range: { f: { gte: 'now-1d/d', format: 'yyyy-MM-dd' } } }, field: 'f' },
  { name: 'prefix 展开', body: { prefix: { f: { value: 'ab', case_insensitive: true } } }, field: 'f' },
  { name: 'wildcard 展开', body: { wildcard: { f: { value: 'a*b', rewrite: 'top_terms_blended_freqs_10' } } }, field: 'f' },
  { name: 'regexp 展开', body: { regexp: { f: { value: 'a.*', flags: 'ALL', max_determinized_states: 10000 } } }, field: 'f' },
  { name: 'fuzzy 展开', body: { fuzzy: { f: { value: 'ab', fuzziness: 2 } } }, field: 'f' },
  { name: 'match 展开', body: { match: { f: { query: 'x', operator: 'and' } } }, field: 'f' },
  { name: 'multi_match 缺 fields', body: { multi_match: { query: 'x', type: 'best_fields' } }, field: null },
  { name: 'query_string 缺 default_field', body: { query_string: { query: 'x' } }, field: null },
  { name: 'simple_query_string 缺 fields', body: { simple_query_string: { query: 'x' } }, field: null },
  { name: 'bool 单对象 must', body: { bool: { must: { term: { f: 'x' } }, minimum_should_match: 1 } }, field: null },
  { name: 'bool 空体', body: { bool: {} }, field: null },
  { name: 'nested 带 inner_hits/score_mode', body: { nested: { path: 'p', query: { match_all: {} }, inner_hits: { size: 1 }, score_mode: 'avg' } }, field: 'p' },
  { name: 'has_child 带 score_mode', body: { has_child: { type: 'c', query: { match_all: {} }, score_mode: 'max' } }, field: 'c' },
  { name: 'function_score 无 query', body: { function_score: { functions: [{ weight: 2 }], boost_mode: 'multiply' } }, field: null },
  { name: 'dis_max 单对象 queries', body: { dis_max: { queries: { match_all: {} } } }, field: null },
  { name: 'pinned ids 形态', body: { pinned: { ids: ['1'], organic: { match_all: {} } } }, field: null },
  { name: 'geo_distance 字符串坐标', body: { geo_distance: { distance: '10km', location: '41,-87' } }, field: 'location' },
  { name: 'geo_distance 对象坐标', body: { geo_distance: { distance: '10km', location: { lat: 41, lon: -87 } } }, field: 'location' },
  { name: 'geo_bounding_box 两角', body: { geo_bounding_box: { f: { top_left: { lat: 2, lon: 1 }, bottom_right: { lat: 0, lon: 0 } } } }, field: 'f' },
  { name: 'template id 形态', body: { template: { id: 't', params: { a: 1 } } }, field: null },
  { name: 'rule 带 match_criteria', body: { rule: { ruleset_id: 'r', match_criteria: { g: 'x' } } }, field: null },
  { name: 'knn 带 filter', body: { knn: { field: 'v', query_vector: [0.1, 0.2], k: 10, filter: { term: { f: 'x' } } } }, field: 'v' },
  { name: 'percolate 给 id（不给 document）', body: { percolate: { field: 'q', id: '1' } }, field: 'q' },
  { name: 'more_like_this like 混合数组', body: { more_like_this: { fields: ['t'], like: ['a', { _index: 'i', _id: '1' }] } }, field: null },
  { name: 'intervals all_of', body: { intervals: { f: { all_of: { ordered: true, intervals: [{ match: { query: 'x' } }] } } } }, field: 'f' },
  { name: 'terms_set script', body: { terms_set: { f: ['a', 'b'], minimum_should_match_script: { source: '1' } } }, field: 'f' },
  { name: 'rank_feature saturation', body: { rank_feature: { field: 'f', boost: 1, saturation: { pivot: 2 } } }, field: 'f' },
  { name: 'ids 字符串单值', body: { ids: { values: '1' } }, field: null },
  { name: 'script_score 带 min_score', body: { script_score: { query: { match_all: {} }, script: { source: 'x' }, min_score: 1 } }, field: null },
];

function shapeProblem(op: string, n: QueryNode): string | null {
  if (op === 'bool') return n.type === 'bool' ? null : `期望 bool，得到 ${n.type}`;
  if (MULTI_OPS.has(op)) return n.type === 'multi' && n.op === op ? null : `期望 multi/${op}，得到 ${n.type}`;
  if (op in WRAP_META) return n.type === 'wrap' && n.op === op ? null : `期望 wrap/${op}，得到 ${n.type}`;
  if (n.type !== 'leaf') return `期望叶子，得到 ${n.type}`;
  if (n.op !== op) return `算子记成了 ${n.op}`;
  /* 落 raw 的叶子：field/主值都没接住（官方体不该走这条路） */
  if (n.field === null && n.raw !== null && (OPS_META[op]?.form ?? 'field') !== 'none') return 'field 形态没认出字段位';
  return null;
}

describe('1182 同一算子的备选官方写法', () => {
  it(`${CASES.length} 条备选写法全部进树、结构位认对、写回同构`, () => {
    const gaps: string[] = [];
    for (const c of CASES) {
      const op = Object.keys(c.body)[0];
      const n = parseQueryNode(c.body);
      const p = shapeProblem(op, n);
      if (p) { gaps.push(`${c.name}｜${p}`); continue; }
      /* 容器节点（bool/multi）没有 field 位，只对叶子比字段位 */
      if (c.field !== undefined && n.type === 'leaf' && (n.field ?? null) !== c.field) {
        gaps.push(`${c.name}｜字段位应为 ${c.field}，实为 ${n.field}`);
        continue;
      }
      const back = serQueryNode(n);
      if (stable(back) !== stable(c.body)) gaps.push(`${c.name}｜写回 ${stable(back)} ≠ ${stable(c.body)}`);
    }
    expect(gaps, '\n' + gaps.join('\n')).toEqual([]);
  });

  it('形状记忆：展开体不被洗成简写，单对象 queries 不擅自变数组', () => {
    const exp = parseQueryNode({ term: { f: { value: 'x' } } }) as any;
    expect(exp.expanded, 'term 的 {value} 形态要记住').toBe(true);
    expect(serQueryNode(exp)).toEqual({ term: { f: { value: 'x' } } });
    const single = parseQueryNode({ dis_max: { queries: { match_all: {} } } }) as any;
    expect(single.arrForm.queries).toBe(false);
    expect(serQueryNode(single)).toEqual({ dis_max: { queries: { match_all: {} } } });
  });

  it('percolate 给 id 时：主值键缺席记成 hasMain=false，id 留在参数位', () => {
    const n = parseQueryNode({ percolate: { field: 'q', id: '1' } }) as any;
    expect(n.field).toBe('q');
    expect(n.hasMain).toBe(false);
    expect(n.params).toEqual({ id: '1' });
  });

  it('负控：同一算子塞两个字段键是非法体，字段位必须接不住（raw 权威）', () => {
    const bad = parseQueryNode({ range: { a: { gte: 1 }, b: { lte: 2 } } }) as any;
    expect(bad.type, '仍是 range 叶子——但只有 raw 是权威').toBe('leaf');
    expect(bad.field, '两个字段键时不得猜字段').toBeNull();
    expect(bad.raw).toEqual({ a: { gte: 1 }, b: { lte: 2 } });
    expect(shapeProblem('range', bad), '结构位体检必须报错').not.toBeNull();
  });
});
