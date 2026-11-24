import { describe, it, expect } from 'vitest';
import { OPS_META } from '../queryAstOps';

/* 1092：查询参数可发现性补齐——match/multi_match/query_string 的模糊/同义词控制、
   term 大小写不敏感、geo_shape/shape 关系与方向。未在 schema 的键仍可手输，
   这里补齐的是「可发现、有正确控件」的高频官方参数（不改变解析/序列化语义）。 */
const keys = (op: string) => (OPS_META[op].params || []).map(p => p.key);

describe('1092 DSL 高频参数 schema', () => {
  it('term 支持 case_insensitive', () => {
    expect(keys('term')).toContain('case_insensitive');
  });

  it('match 补齐模糊/同义词参数', () => {
    for (const k of ['lenient', 'prefix_length', 'max_expansions', 'fuzzy_transpositions', 'fuzzy_rewrite', 'auto_generate_synonyms_phrase_query']) {
      expect(keys('match')).toContain(k);
    }
  });

  it('multi_match 补齐 zero_terms/模糊参数', () => {
    for (const k of ['zero_terms_query', 'prefix_length', 'max_expansions', 'fuzzy_transpositions', 'fuzzy_rewrite', 'auto_generate_synonyms_phrase_query']) {
      expect(keys('multi_match')).toContain(k);
    }
  });

  it('query_string 补齐通配/模糊/引号分析器参数', () => {
    for (const k of ['allow_leading_wildcard', 'enable_position_increments', 'fuzzy_prefix_length', 'fuzzy_max_expansions', 'fuzzy_transpositions', 'fuzzy_rewrite', 'quote_analyzer', 'quote_field_suffix', 'auto_generate_synonyms_phrase_query']) {
      expect(keys('query_string')).toContain(k);
    }
  });

  it('geo_shape/shape 补齐关系/方向/未映射容忍', () => {
    for (const op of ['geo_shape', 'shape']) {
      expect(keys(op)).toEqual(expect.arrayContaining(['relation', 'orientation', 'ignore_unmapped']));
      const rel = OPS_META[op].params!.find(p => p.key === 'relation')!;
      expect(rel.kind).toBe('enum');
      expect(rel.options).toEqual(['INTERSECTS', 'DISJOINT', 'WITHIN']);
    }
  });
});
