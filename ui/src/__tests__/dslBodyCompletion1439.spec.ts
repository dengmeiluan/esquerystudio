/**
 * 1439：子句体内的键位补全。
 *
 * 实测（真实补全上下文函数）：在 `{"query":{"bool":{` / `nested` / `multi_match` /
 * `query_string` / `ids` 等子句体里敲引号，返回的一律是 query-type——弹窗列出
 * match/term/bool 等**算子骨架**，写进子句体就是非法键（bool 体只认 must/filter/should）。
 * 同一缺口还有三处：字段配置对象（match.<field>.{query}）、根层 collapse/highlight/knn、
 * retriever 变体体（standard.{query}）。
 *
 * 本档钉两件事：这些位置出的键必须是**该子句体的键**（结构键 + 参数表并集）；
 * 而真正该出算子的位置（bool.must 的元素对象、nested 的内层 query）必须保持 query-type。
 */
import { describe, it, expect } from 'vitest';
import {
  dslContext, queryBodyKeys, clauseValueKeys, retrieverBodyKeys, suggesterBodyKeys,
  QUERY_BODY_KEYS, CLAUSE_VALUE_KEYS, SUGGEST_BODY_KEYS,
} from '../utils/dslCompletionContext';

/** [名字, 光标前文本, 期望 kind, 期望 op（可选）] */
const BODY_CASES: Array<[string, string, string, string?]> = [
  ['bool 空体', '{"query":{"bool":{"', 'query-body-key', 'bool'],
  ['bool 已有一键', '{"query":{"bool":{"minimum_should_match":1,"', 'query-body-key', 'bool'],
  ['constant_score', '{"query":{"constant_score":{"', 'query-body-key', 'constant_score'],
  ['dis_max', '{"query":{"dis_max":{"', 'query-body-key', 'dis_max'],
  ['function_score', '{"query":{"function_score":{"', 'query-body-key', 'function_score'],
  ['functions 元素', '{"query":{"function_score":{"functions":[{"', 'query-body-key', '__function__'],
  ['boosting', '{"query":{"boosting":{"', 'query-body-key', 'boosting'],
  ['script_score', '{"query":{"script_score":{"', 'query-body-key', 'script_score'],
  ['pinned', '{"query":{"pinned":{"', 'query-body-key', 'pinned'],
  ['nested', '{"query":{"nested":{"', 'query-body-key', 'nested'],
  ['has_child', '{"query":{"has_child":{"', 'query-body-key', 'has_child'],
  ['has_parent', '{"query":{"has_parent":{"', 'query-body-key', 'has_parent'],
  ['multi_match', '{"query":{"multi_match":{"', 'query-body-key', 'multi_match'],
  ['query_string', '{"query":{"query_string":{"', 'query-body-key', 'query_string'],
  ['simple_query_string', '{"query":{"simple_query_string":{"', 'query-body-key', 'simple_query_string'],
  ['combined_fields', '{"query":{"combined_fields":{"', 'query-body-key', 'combined_fields'],
  ['more_like_this', '{"query":{"more_like_this":{"', 'query-body-key', 'more_like_this'],
  ['ids', '{"query":{"ids":{"', 'query-body-key', 'ids'],
  ['script', '{"query":{"script":{"', 'query-body-key', 'script'],
  ['wrapper', '{"query":{"wrapper":{"', 'query-body-key', 'wrapper'],
  ['percolate', '{"query":{"percolate":{"', 'query-body-key', 'percolate'],
  ['rule', '{"query":{"rule":{"', 'query-body-key', 'rule'],
  ['template', '{"query":{"template":{"', 'query-body-key', 'template'],
  ['parent_id', '{"query":{"parent_id":{"', 'query-body-key', 'parent_id'],
  ['type', '{"query":{"type":{"', 'query-body-key', 'type'],
  ['rank_feature', '{"query":{"rank_feature":{"', 'query-body-key', 'rank_feature'],
  ['distance_feature', '{"query":{"distance_feature":{"', 'query-body-key', 'distance_feature'],
  ['knn（query 内）', '{"query":{"knn":{"', 'query-body-key', 'knn'],
  ['knn（顶层）', '{"knn":{"', 'query-body-key', 'knn'],
  ['semantic', '{"query":{"semantic":{"', 'query-body-key', 'semantic'],
  ['sparse_vector', '{"query":{"sparse_vector":{"', 'query-body-key', 'sparse_vector'],
  ['bitmap_terms', '{"query":{"bitmap_terms":{"', 'query-body-key', 'bitmap_terms'],
  ['span_near', '{"query":{"span_near":{"', 'query-body-key', 'span_near'],
  ['span_not', '{"query":{"span_not":{"', 'query-body-key', 'span_not'],
  ['collapse', '{"collapse":{"', 'query-body-key', 'collapse'],
  ['highlight', '{"highlight":{"', 'query-body-key', 'highlight'],
  ['retriever.standard', '{"retriever":{"standard":{"', 'retriever-body-key', 'standard'],
  ['retriever.knn', '{"retriever":{"knn":{"', 'retriever-body-key', 'knn'],
  ['match 字段配置', '{"query":{"match":{"title":{"', 'clause-field-key', 'match'],
  ['fuzzy 字段配置', '{"query":{"fuzzy":{"title":{"', 'clause-field-key', 'fuzzy'],
  ['term 字段配置', '{"query":{"term":{"title":{"', 'clause-field-key', 'term'],
  /* 根层/嵌套容器与函数体 */
  ['inner_hits（nested 内）', '{"query":{"nested":{"inner_hits":{"', 'query-body-key', 'inner_hits'],
  ['inner_hits（collapse 内）', '{"collapse":{"inner_hits":{"', 'query-body-key', 'inner_hits'],
  ['rescore', '{"rescore":{"', 'query-body-key', 'rescore'],
  ['pit', '{"pit":{"', 'query-body-key', 'pit'],
  ['match_all', '{"query":{"match_all":{"', 'query-body-key', 'match_all'],
  ['gauss 字段体', '{"query":{"function_score":{"functions":[{"gauss":{"price":{"', 'query-body-key', 'gauss'],
  ['random_score 体', '{"query":{"function_score":{"functions":[{"random_score":{"', 'query-body-key', 'random_score'],
  ['script_fields 字段体', '{"script_fields":{"s1":{"', 'query-body-key', '__script_field__'],
  ['script 对象体', '{"script_fields":{"s1":{"script":{"', 'query-body-key', '__script__'],
  ['runtime_mappings 字段体', '{"runtime_mappings":{"f":{"', 'query-body-key', '__runtime_field__'],
  ['highlight 字段级配置', '{"highlight":{"fields":{"title":{"', 'query-body-key', '__highlight_field__'],
  ['fields 数组元素对象', '{"fields":[{"', 'array-elem-key'],
  ['_source 对象形态', '{"_source":{"', 'query-body-key', '_source'],
];

/** 建议器体（suggest.<名>.<类型>.{}）——另一张表，键与查询子句不同名 */
const SUGGEST_CASES: Array<[string, string, string]> = [
  ['suggest.term 体', '{"suggest":{"s1":{"term":{"', 'term'],
  ['suggest.phrase 体', '{"suggest":{"s1":{"phrase":{"', 'phrase'],
  ['suggest.completion 体', '{"suggest":{"s1":{"completion":{"', 'completion'],
];

/** 1439：字段形态子句（体是字段名对象）——此前只有 9 个在册，其余给算子骨架 */
const FIELD_CLAUSE_CASES: Array<[string, string, string]> = [
  ['match_phrase_prefix', '{"query":{"match_phrase_prefix":{"', 'match_phrase_prefix'],
  ['match_bool_prefix', '{"query":{"match_bool_prefix":{"', 'match_bool_prefix'],
  ['intervals', '{"query":{"intervals":{"', 'intervals'],
  ['span_term', '{"query":{"span_term":{"', 'span_term'],
  ['text_expansion', '{"query":{"text_expansion":{"', 'text_expansion'],
  ['weighted_tokens', '{"query":{"weighted_tokens":{"', 'weighted_tokens'],
  ['geo_distance', '{"query":{"geo_distance":{"', 'geo_distance'],
  ['geo_shape', '{"query":{"geo_shape":{"', 'geo_shape'],
  ['shape', '{"query":{"shape":{"', 'shape'],
];

/** 真正该出算子的位置——不能被上面的判定吞掉 */
const STILL_QUERY_TYPE: Array<[string, string]> = [
  ['bool.must 元素对象', '{"query":{"bool":{"must":[{"'],
  ['bool.must 单对象', '{"query":{"bool":{"must":{"'],
  ['nested 内层 query', '{"query":{"nested":{"query":{"'],
  ['has_child 内层 query', '{"query":{"has_child":{"query":{"'],
  ['must 数组裸元素位', '{"query":{"bool":{"must":['],
  ['knn.filter 内', '{"knn":{"filter":{"'],
  ['post_filter', '{"post_filter":{"'],
];

function ctxAt(doc: string) {
  return dslContext(doc, doc.length);
}

function offenders(cases: Array<[string, string]>): string[] {
  return cases.filter(([, doc]) => ctxAt(doc).kind === 'query-type').map(([name]) => name);
}

describe('1439 子句体键位判定', () => {
  it('清单内每个位置都出子句体档（不是 query-type）', () => {
    for (const [name, doc, kind, op] of BODY_CASES) {
      const c = ctxAt(doc) as any;
      expect(c.kind, name).toBe(kind);
      if (op) expect(c.op, name).toBe(op);
    }
  });

  it('字段形态子句出字段档（clause=子句名）', () => {
    for (const [name, doc, op] of FIELD_CLAUSE_CASES) {
      const c = ctxAt(doc) as any;
      expect(c.kind, name).toBe('field');
      expect(c.clause, name).toBe(op);
    }
  });

  it('建议器体出 suggester-body-key（不落到同名查询子句表）', () => {
    for (const [name, doc, op] of SUGGEST_CASES) {
      const c = ctxAt(doc) as any;
      expect(c.kind, name).toBe('suggester-body-key');
      expect(c.op, name).toBe(op);
    }
    /* 建议器名层仍给三种类型（term/phrase/completion），不是体键 */
    expect(ctxAt('{"suggest":{"s1":{"')).toEqual({ kind: 'suggester-type' });
  });

  it('该出算子的位置仍是 query-type（不过度扩张）', () => {
    for (const [name, doc] of STILL_QUERY_TYPE) {
      expect(ctxAt(doc).kind, name).toBe('query-type');
    }
  });

  it('负控：探针能点名仍落 query-type 的「本应出子句体」位置', () => {
    expect(offenders(BODY_CASES.map(([n, d]) => [n, d] as [string, string]))).toEqual([]);
    const mixed: Array<[string, string]> = [...BODY_CASES.map(([n, d]) => [n, d] as [string, string]), ...STILL_QUERY_TYPE];
    expect(offenders(mixed)).toEqual(STILL_QUERY_TYPE.map(([n]) => n));
  });
});

/** 键表自洽：不重复、骨架以键名开头（接受后至少写对键） */
function tableProblems(table: Record<string, Array<{ key: string; insert: string }>>): string[] {
  const out: string[] = [];
  for (const [op, keys] of Object.entries(table)) {
    const seen = new Set<string>();
    for (const k of keys) {
      if (seen.has(k.key)) out.push(op + ' 重复键 ' + k.key);
      seen.add(k.key);
      if (!k.insert.startsWith('"' + k.key + '"')) out.push(op + ' 骨架与键不符 ' + k.key);
    }
  }
  return out;
}

describe('1439 子句体键表', () => {
  it('结构键表自洽（无重复、骨架键名一致）', () => {
    expect(tableProblems(QUERY_BODY_KEYS)).toEqual([]);
    expect(tableProblems(CLAUSE_VALUE_KEYS)).toEqual([]);
    expect(tableProblems(SUGGEST_BODY_KEYS)).toEqual([]);
  });

  it('负控：键表自洽探针能抓到重复/错键', () => {
    const broken = { x: [{ key: 'must', insert: '"must": []' }, { key: 'must', insert: '"mst": []' }] };
    expect(tableProblems(broken)).toEqual(['x 重复键 must', 'x 骨架与键不符 must']);
  });

  it('参数表并集：结构键之外补上官方参数', () => {
    const bool = queryBodyKeys('bool').map(k => k.key);
    expect(bool).toEqual(expect.arrayContaining(['must', 'filter', 'should', 'must_not', 'minimum_should_match', 'boost']));
    const nested = queryBodyKeys('nested').map(k => k.key);
    expect(nested).toEqual(expect.arrayContaining(['path', 'query', 'score_mode', 'inner_hits', 'ignore_unmapped']));
    const mm = queryBodyKeys('multi_match').map(k => k.key);
    expect(mm).toEqual(expect.arrayContaining(['query', 'fields', 'type', 'operator', 'fuzziness', 'boost']));
    const fn = queryBodyKeys('__function__').map(k => k.key);
    expect(fn).toEqual(expect.arrayContaining(['filter', 'weight', 'random_score', 'script_score', 'gauss']));
    expect(queryBodyKeys('ids').map(k => k.key)).toContain('values');
    expect(clauseValueKeys('match').map(k => k.key)).toEqual(expect.arrayContaining(['query', 'operator', 'fuzziness', 'boost']));
    expect(retrieverBodyKeys('knn').map(k => k.key)).toEqual(expect.arrayContaining(['field', 'query_vector', 'k', 'filter']));
    expect(retrieverBodyKeys('rrf').map(k => k.key)).toEqual(expect.arrayContaining(['retrievers', 'rank_constant', 'rank_window_size']));
  });

  it('未登记算子返回空表（不臆造键）', () => {
    expect(queryBodyKeys('no_such_clause')).toEqual([]);
    expect(clauseValueKeys('no_such_clause')).toEqual([]);
    expect(retrieverBodyKeys('no_such_retriever')).toEqual([]);
  });
});
