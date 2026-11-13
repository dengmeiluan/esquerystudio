import { describe, it, expect } from 'vitest';
import { OPS_META } from '../queryAstOps';

/* 1099：全文本族参数补齐。MLT 的文档频率/词长/停用词、simple_query_string 的
 * 通配与模糊档、combined_fields 的同义词开关此前只能手写；补进 schema 后可发现、
 * 带正确控件（数值/布尔/文本），解析/序列化语义不变。 */
const keys = (op: string) => (OPS_META[op].params || []).map(p => p.key);

describe('1099 全文本参数补齐', () => {
  it('more_like_this 文档频率/词长/停用词', () => {
    for (const k of ['min_doc_freq', 'max_doc_freq', 'min_word_length', 'max_word_length', 'stop_words', 'boost']) {
      expect(keys('more_like_this')).toContain(k);
    }
  });

  it('simple_query_string 通配/模糊/引号后缀', () => {
    for (const k of ['analyze_wildcard', 'fuzzy_prefix_length', 'fuzzy_max_expansions', 'fuzzy_transpositions', 'quote_field_suffix', 'auto_generate_synonyms_phrase_query']) {
      expect(keys('simple_query_string')).toContain(k);
    }
  });

  it('match_bool_prefix 模糊档与 combined_fields 同义词开关', () => {
    for (const k of ['lenient', 'prefix_length', 'max_expansions', 'fuzzy_transpositions', 'fuzzy_rewrite']) {
      expect(keys('match_bool_prefix')).toContain(k);
    }
    expect(keys('combined_fields')).toContain('auto_generate_synonyms_phrase_query');
  });
});
