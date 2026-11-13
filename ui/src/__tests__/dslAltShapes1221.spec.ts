/**
 * 1221：**生产文档真实形态**的往返锁（补 1181 骨架表的盲区）。
 *
 * 1181 用 `QUERY_SNIPPETS` 的官方骨架跑往返——那是"最小合法体"。但真实生产查询里，
 * 同一个算子常带骨架里没有的可选参数（`terms.order`、`regexp.flags`、
 * `simple_query_string.flags`、`nested.score_mode`…）。骨架表覆盖不到这些组合，
 * 所以本 spec 直接拿 ES 官方文档里**带可选参数的真实形态**再跑一遍 parse→serialize。
 *
 * 这轮的起点是我三次误判，记下来防复发：
 *  ① `WRAP_PARAMS.nested` 里没有 `path` → 以为 nested 不可用。**错**：
 *     `WRAP_META.nested = { fieldKey: 'path' }`，路由字段位单独建模，不是普通参数。
 *  ② `AGG_BODY_PARAMS.terms` 里没有 `order` → 以为 terms 排不了序。**错**：
 *     `AggOrderPanel`(1031) 专管 order，支持 `_count`/`_key`/子聚合路径，数组与单键对象两形态无损写回。
 *  ③ 用 `r.ok` 判 parse 结果 → 全部 FAIL-PARSE。**错**：`parseQueryNode` 直接返回节点。
 * 结论：**"参数表里没有" ≠ "UI 里填不了"**，路由字段位/专用面板/通用键值通道都会兜底。
 * 判覆盖只能靠行为（往返 + 渲染），不能靠读注册表推断。
 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode } from '../utils/queryAst';

/* 键序无关的稳定序列化（数组保序——ES 里数组顺序有语义） */
const stable = (v: any): string => Array.isArray(v)
  ? '[' + v.map(stable).join(',') + ']'
  : (v && typeof v === 'object')
    ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
    : JSON.stringify(v);

/** 取自 ES 官方文档的「带可选参数」真实形态 */
const SHAPES: Record<string, any> = {
  'terms + order':            { terms: { field: 'tag', size: 10, order: { _count: 'desc' } } },
  'terms + include/exclude':  { terms: { field: 'tag', include: ['a.*'], exclude: ['b'] } },
  'terms + missing':          { terms: { field: 'tag', missing: 'N/A' } },
  'nested + path/score_mode': { nested: { path: 'comments', query: { term: { 'comments.x': 1 } }, score_mode: 'avg' } },
  'has_child + min_children': { has_child: { type: 'c', query: { match_all: {} }, min_children: 2 } },
  'function_score + functions': { function_score: { query: { match_all: {} }, functions: [{ weight: 2 }], score_mode: 'sum' } },
  'multi_terms':              { multi_terms: { terms: [{ field: 'a' }, { field: 'b' }], size: 5 } },
  'wildcard + case_insensitive': { wildcard: { 'title.keyword': { value: 'x*', case_insensitive: true } } },
  'prefix + case_insensitive': { prefix: { 'title.keyword': { value: 'ab', case_insensitive: true } } },
  'distance_feature':         { distance_feature: { field: 'loc', pivot: '1km', origin: '0,0' } },
  'span_or':                  { span_or: { clauses: [{ span_term: { f: 'a' } }, { span_term: { f: 'b' } }] } },
  'range + boost':            { range: { field: 'n', gte: 1, lte: 5, boost: 2 } },
  'regexp + flags':           { regexp: { f: { value: 'a.*', flags: 'ALL', case_insensitive: true } } },
  'simple_query_string + flags': { simple_query_string: { query: 'a b', fields: ['t'], default_operator: 'and', flags: 'ALL' } },
};

describe('1221 真实形态往返（带可选参数）', () => {
  it('每个形态都认得出结构位（不落 __raw__）并把可选参数带回去', () => {
    const raw: string[] = [];
    const drift: string[] = [];
    for (const [name, body] of Object.entries(SHAPES)) {
      const n: any = parseQueryNode(body);
      if (n.op === '__raw__') { raw.push(name); continue; }
      const back: any = serQueryNode(n);
      if (stable(back) !== stable(body)) drift.push(`${name}：${stable(back)} ≠ ${stable(body)}`);
    }
    expect(raw, '落进 raw 权威（树里没有语义位）:\n' + raw.join('\n')).toEqual([]);
    expect(drift, '可选参数没带回去:\n' + drift.join('\n')).toEqual([]);
  });

  it('样本量护栏（防止有人删案让上一条空转）', () => {
    expect(Object.keys(SHAPES).length).toBe(14);
  });
});
