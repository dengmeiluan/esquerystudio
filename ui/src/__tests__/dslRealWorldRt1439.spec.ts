/**
 * 1439 续：真实世界 DSL 形态的往返（变体，不是官方骨架）。
 * 1181 用 QUERY_SNIPPETS 骨架锁「结构位认对」；这里专攻骨架**不覆盖**的形态：
 * 简写、多值、嵌套组合、可选参数缺省、数组/对象混排。
 * 判据仍是①字段/主值落进语义位（不能靠 raw 原样回写蒙混）②写回同构。
 */
import { describe, it, expect } from 'vitest';
import { parseQueryNode, serQueryNode } from '../utils/queryAst';

const stable = (v: any): string => {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
};

const CASES: Array<[string, string]> = [
  ['term 无 keyword 后缀', '{"term":{"status":"active"}}'],
  ['term 对象体带 boost', '{"term":{"status":{"value":"active","boost":2}}}'],
  ['terms 多值', '{"terms":{"tag":["a","b","c"]}}'],
  ['terms 对象体带 boost', '{"terms":{"tag":{"value":["a","b"],"boost":1.5}}}'],
  ['range 单位参', '{"range":{"t":{"gte":"now-1d/d","lte":"now","format":"strict_date_optional_time"}}}'],
  ['range 带 boost', '{"range":{"p":{"gt":1,"boost":2}}}'],
  ['exists', '{"exists":{"field":"a"}}'],
  ['prefix 对象体', '{"prefix":{"u":{"value":"ki","case_insensitive":true}}}'],
  ['wildcard 多值对象', '{"wildcard":{"u":{"value":"ki*","boost":2}}}'],
  ['regexp', '{"regexp":{"u":{"value":"k.*y","flags":"ALL"}}}'],
  ['fuzzy 对象体', '{"fuzzy":{"u":{"value":"kiwi","fuzziness":2,"prefix_length":1}}}'],
  ['match 对象体', '{"match":{"title":{"query":"quick","operator":"and","fuzziness":"AUTO"}}}'],
  ['match_phrase 对象体', '{"match_phrase":{"title":{"query":"quick fox","slop":2}}}'],
  ['match_phrase_prefix', '{"match_phrase_prefix":{"title":{"query":"quick br","max_expansions":10}}}'],
  ['multi_match 全参', '{"multi_match":{"query":"x","fields":["a^2","b"],"type":"best_fields","tie_breaker":0.3,"operator":"and"}}'],
  ['query_string 完整', '{"query_string":{"query":"a AND b","default_field":"t","analyze_wildcard":true}}'],
  ['simple_query_string', '{"simple_query_string":{"query":"a + b","fields":["x","y"],"default_operator":"and"}}'],
  ['ids', '{"ids":{"values":["1","2","3"]}}'],
  ['bool 全四槽', '{"bool":{"must":[{"term":{"a":1}}],"filter":[{"term":{"b":2}}],"should":[{"term":{"c":3}}],"must_not":[{"term":{"d":4}}],"minimum_should_match":1}}'],
  ['bool should 单对象(非数组)', '{"bool":{"should":{"term":{"a":1}}}}'],
  ['bool 只有 filter', '{"bool":{"filter":[{"range":{"n":{"gte":1}}}]}}'],
  ['nested 带 inner_hits', '{"nested":{"path":"c","query":{"match":{"c.t":"x"}},"inner_hits":{"size":3}}}'],
  ['has_child', '{"has_child":{"type":"reply","query":{"match":{"t":"x"}},"score_mode":"max"}}'],
  ['has_parent', '{"has_parent":{"parent_type":"post","query":{"match_all":{}}}}'],
  ['parent_id', '{"parent_id":{"type":"answer","id":"1"}}'],
  ['constant_score', '{"constant_score":{"filter":{"term":{"a":1}},"boost":2}}'],
  ['dis_max', '{"dis_max":{"queries":[{"match":{"a":"x"}},{"match":{"b":"y"}}],"tie_breaker":0.5}}'],
  ['boosting', '{"boosting":{"positive":{"term":{"a":1}},"negative":{"term":{"b":2}},"negative_boost":0.5}}'],
  ['function_score 完整', '{"function_score":{"query":{"match_all":{}},"functions":[{"filter":{"term":{"a":1}},"weight":2}],"score_mode":"sum","boost_mode":"multiply"}}'],
  ['script_score', '{"script_score":{"query":{"match_all":{}},"script":{"source":"_score * 2"}}}'],
  ['geo_distance', '{"geo_distance":{"distance":"10km","loc":[1,2]}}'],
  ['geo_shape', '{"geo_shape":{"loc":{"shape":{"type":"envelope","coordinates":[[1,2],[3,4]]},"relation":"intersects"}}}'],
  ['shape', '{"shape":{"loc":{"type":"envelope","coordinates":[[1,2],[3,4]]}}}'],
  ['knn 顶层', '{"knn":{"field":"v","query_vector":[1,2],"k":10,"num_candidates":100}}'],
  ['more_like_this', '{"more_like_this":{"fields":["t"],"like":["a b"],"min_term_freq":2}}'],
  ['percolate', '{"percolate":{"field":"q","document":{"a":1}}}'],
  ['rank_feature 对象体', '{"rank_feature":{"field":"p","boost":2,"saturation":{"pivot":3}}}'],
  ['rank_features 多字段', '{"rank_features":{"field":"rf"}}'],
  ['distance_feature 完整', '{"distance_feature":{"field":"loc","origin":"now-1d","pivot":"7d","boost":2}}'],
  ['terms_set', '{"terms_set":{"prog":{"terms":["a","b"],"minimum_should_match_script":{"source":"1"}}}}'],
  ['script 查询', '{"script":{"script":{"source":"doc[\'a\'].value > 1","lang":"painless"}}}'],
  ['wrapper', '{"wrapper":{"query":"<base64>"}}'],
  ['pinned', '{"pinned":{"ids":["1","2"],"organic":{"match":{"t":"x"}}}}'],
  ['combined_fields', '{"combined_fields":{"query":"a b","fields":["t","u"],"operator":"and"}}'],
  ['intervals 多种规则', '{"intervals":{"t":{"any_of":{"intervals":[{"match":{"query":"a"}},{"wildcard":{"pattern":"b*"}}]}}}}'],
  ['exit 的条件 match_all', '{"match_all":{"boost":2}}'],
  ['match_none', '{"match_none":{}}'],
  ['exists 无 field（畸形）', '{"exists":{}}'],
  ['term 多字段并列', '{"term":{"a":1,"b":2}}'],
  /* ── 1439：官方罕见子句（形状按 8.15 文档核对），与 lint 普查同一批输入 ── */
  ['geo_grid（字段键 + geohash）', '{"geo_grid":{"location":{"geohash":"u0"}}}'],
  ['geo_grid geotile', '{"geo_grid":{"location":{"geotile":{"precision":4}}}}'],
  ['geo_polygon', '{"geo_polygon":{"location":{"points":[{"lat":1,"lon":2},{"lat":3,"lon":4}]}}}'],
  ['shape envelope', '{"shape":{"location":{"type":"envelope","coordinates":[[1,2],[3,4]]}}}'],
  ['intervals all_of + gap', '{"intervals":{"content":{"all_of":{"ordered":true,"intervals":[{"match":{"query":"a"}},{"gap":{"width":5}}]}}}}'],
  ['rank_feature 饱和', '{"rank_feature":{"amount":{"boost":2,"saturation":{"pivot":3}}}}'],
  ['distance_feature', '{"distance_feature":{"field":"location","origin":"now-1d","pivot":"7d"}}'],
  ['sparse_vector', '{"sparse_vector":{"field":"vec","query_vector":{"a":1,"b":2}}}'],
  ['text_expansion', '{"text_expansion":{"ml.tokens":{"model_id":".elser_model_2","model_text":"hi"}}}'],
  ['terms lookup', '{"terms":{"tags":{"index":"other","id":"1","path":"tags"}}}'],
  ['percolate document', '{"percolate":{"field":"query","document":{"a":1}}}'],
  ['more_like_this', '{"more_like_this":{"fields":["title"],"like":["a b"],"min_term_freq":2}}'],
  ['pinned', '{"pinned":{"ids":["1","2"],"organic":{"match":{"title":"x"}}}}'],
  ['rule', '{"rule":{"match_criteria":{"status":"A"},"ruleset_id":"rs-1"}}'],
  ['type（已弃用仍合法）', '{"type":{"value":"doc"}}'],
  ['wrapper', '{"wrapper":{"query":"eyJ0ZXJtIjp7ImEiOjF9fQ=="}}'],
  ['script + params', '{"script":{"script":{"source":"doc[\'a\'].value > params.n","params":{"n":1}}}}'],
  ['script_score', '{"script_score":{"query":{"match_all":{}},"script":{"source":"_score*2"}}}'],
  ['has_child', '{"has_child":{"type":"reply","query":{"match_all":{}},"score_mode":"max"}}'],
  ['has_parent', '{"has_parent":{"parent_type":"post","query":{"match_all":{}}}}'],
  ['parent_id', '{"parent_id":{"type":"reply","id":"1"}}'],
  ['span_near', '{"span_near":{"clauses":[{"span_term":{"title":"a"}},{"span_term":{"title":"b"}}],"slop":2,"in_order":true}}'],
  ['span_not', '{"span_not":{"include":{"span_term":{"title":"a"}},"exclude":{"span_term":{"title":"b"}}}}'],
];

describe('1439 真实世界形态 DSL 往返', () => {
  it('每个变体都能解析出语义位并同构写回', () => {
    const problems: string[] = [];
    for (const [name, dsl] of CASES) {
      const body = JSON.parse(dsl);
      const node = parseQueryNode(body);
      if (!node) { problems.push(`${name}：解析返回 null`); continue; }
      const back = serQueryNode(node);
      if (stable(back) !== stable(body)) {
        problems.push(`${name}\n  期望 ${stable(body)}\n  实得 ${stable(back)}`);
      }
    }
    expect(problems, '往返失真：\n' + problems.join('\n')).toEqual([]);
  });

  /* 反作弊：文本相等也可能来自「没认出来 → raw 原样写回」，那种树在界面上
     没有字段选择器/主值输入，用户改不了。所以逐个断言语义位**真的**被填上。 */
  it('语义位真的被填上（不是 raw 原样回写）', () => {
    const problems: string[] = [];
    const expectField = (name: string, dsl: string, field: string) => {
      const node: any = parseQueryNode(JSON.parse(dsl));
      const got = node?.field;
      if (got !== field) problems.push(`${name}：field 期望 ${JSON.stringify(field)}，实得 ${JSON.stringify(got)}`);
    };
    const expectValue = (name: string, dsl: string, value: unknown) => {
      const node: any = parseQueryNode(JSON.parse(dsl));
      const got = node?.value;
      if (stable(got) !== stable(value)) problems.push(`${name}：value 期望 ${stable(value)}，实得 ${stable(got)}`);
    };
    expectField('term', '{"term":{"status":"active"}}', 'status');
    expectValue('term', '{"term":{"status":"active"}}', 'active');
    expectField('terms', '{"terms":{"tag":["a","b"]}}', 'tag');
    expectValue('terms', '{"terms":{"tag":["a","b"]}}', ['a', 'b']);
    expectField('range', '{"range":{"t":{"gte":"now-1d"}}}', 't');
    expectField('exists', '{"exists":{"field":"a"}}', 'a');
    expectField('prefix', '{"prefix":{"u":"ki"}}', 'u');
    expectField('wildcard', '{"wildcard":{"u":"ki*"}}', 'u');
    expectField('regexp', '{"regexp":{"u":"k.*"}}', 'u');
    expectField('fuzzy', '{"fuzzy":{"u":"kiwi"}}', 'u');
    expectField('match', '{"match":{"title":"quick"}}', 'title');
    expectValue('match', '{"match":{"title":"quick"}}', 'quick');
    /* multi_match 的字段落在 fields 数组（多字段语义位），不是单值 field */
    {
      const node: any = parseQueryNode(JSON.parse('{"multi_match":{"query":"x","fields":["a","b"]}}'));
      const got = node?.fields;
      if (stable(got) !== stable(['a', 'b'])) problems.push(`multi_match：fields 期望 ["a","b"]，实得 ${stable(got)}`);
      if (node?.value !== 'x') problems.push(`multi_match：value 期望 "x"，实得 ${JSON.stringify(node?.value)}`);
    }
    expectValue('query_string', '{"query_string":{"query":"a AND b"}}', 'a AND b');
    expectValue('ids', '{"ids":{"values":["1","2"]}}', ['1', '2']);
    expectField('nested', '{"nested":{"path":"c","query":{"match_all":{}}}}', 'c');

    /* ── 1439：官方罕见子句也要落进语义位（否则往返只是 raw 回写）── */
    expectField('geo_grid', '{"geo_grid":{"location":{"geohash":"u0"}}}', 'location');
    expectField('intervals', '{"intervals":{"content":{"all_of":{"ordered":true,"intervals":[{"match":{"query":"a"}}]}}}}', 'content');
    expectField('rank_feature（官方 field 键）', '{"rank_feature":{"field":"amount","boost":2}}', 'amount');
    expectField('distance_feature', '{"distance_feature":{"field":"loc","origin":"now-1d","pivot":"7d"}}', 'loc');
    expectField('sparse_vector', '{"sparse_vector":{"field":"vec","query_vector":{"a":1}}}', 'vec');
    expectField('text_expansion', '{"text_expansion":{"ml.tokens":{"model_id":"m","model_text":"hi"}}}', 'ml.tokens');
    expectField('percolate', '{"percolate":{"field":"query","document":{"a":1}}}', 'query');
    expectField('terms lookup', '{"terms":{"tags":{"index":"other","id":"1","path":"tags"}}}', 'tags');
    expectField('has_child（父类型进字段位）', '{"has_child":{"type":"reply","query":{"match_all":{}}}}', 'reply');
    expectField('has_parent（父类型进字段位）', '{"has_parent":{"parent_type":"post","query":{"match_all":{}}}}', 'post');
    {
      /* 容器类：必须真是 wrap/multi 节点并带子节点，不能整条 raw */
      const wrap = (dsl: string, op: string) => {
        const n: any = parseQueryNode(JSON.parse(dsl));
        if (n?.type !== 'wrap' || n?.op !== op) problems.push(`${op}：期望 wrap/${op}，实得 ${n?.type}/${n?.op}`);
        else if (!n.child) problems.push(`${op}：wrap 节点没有子查询`);
      };
      wrap('{"script_score":{"query":{"match_all":{}},"script":{"source":"_score*2"}}}', 'script_score');
      const multi = (dsl: string, op: string) => {
        const n: any = parseQueryNode(JSON.parse(dsl));
        if (n?.type !== 'multi' || n?.op !== op) problems.push(`${op}：期望 multi/${op}，实得 ${n?.type}/${n?.op}`);
      };
      multi('{"span_near":{"clauses":[{"span_term":{"title":"a"}}],"slop":2}}', 'span_near');
      /* 无值算子：value 位不是必需的（span/rule/type 用参数表达），但必须非 raw */
      for (const [name, dsl] of [
        ['rule', '{"rule":{"match_criteria":{"status":"A"},"ruleset_id":"rs-1"}}'],
        ['type', '{"type":{"value":"doc"}}'],
        ['wrapper', '{"wrapper":{"query":"eyJ0ZXJtIjp7ImEiOjF9fQ=="}}'],
        ['parent_id', '{"parent_id":{"type":"reply","id":"1"}}'],
      ] as Array<[string, string]>) {
        const n: any = parseQueryNode(JSON.parse(dsl));
        if (!n || n.raw) problems.push(`${name}：落回 raw，用户看不到可编辑控件`);
      }
    }
    expect(problems, '语义位未填充：\n' + problems.join('\n')).toEqual([]);
  });
});
