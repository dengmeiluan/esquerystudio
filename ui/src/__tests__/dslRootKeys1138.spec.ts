import { describe, it, expect } from 'vitest';
import { dslContext, ROOT_KEYS, ROOT_KEY_SNIPPETS } from '../utils/dslCompletionContext';

/* 1138：树已支持但原始 DSL 根键补全缺失的结构化顶层键；
 * 以及 post_filter / 顶层 knn.filter 两个合法查询容器里的 query-type 识别。 */
describe('1138 DSL 根键补全与 post_filter/knn.filter 查询位', () => {
  it('前八键顺序不动，新增树已支持的顶层结构键', () => {
    expect(ROOT_KEYS.slice(0, 8)).toEqual(['query', 'sort', 'aggs', '_source', 'highlight', 'from', 'size', 'track_total_hits']);
    for (const k of ['post_filter', 'knn', 'collapse', 'rescore', 'retriever', 'suggest', 'script_fields', 'runtime_mappings', 'search_after', 'min_score']) {
      expect(ROOT_KEYS, k).toContain(k);
    }
  });

  it('每个根键都有骨架，恒等替换后仍是合法 JSON 对象', () => {
    expect(Object.keys(ROOT_KEY_SNIPPETS).sort()).toEqual([...ROOT_KEYS].sort());
    for (const [k, snip] of Object.entries(ROOT_KEY_SNIPPETS)) {
      expect(snip.detail, k + ' detail').toBeTruthy();
      expect(snip.text.startsWith('"' + k + '":'), k + ' 顶层键').toBe(true);
      const filled = snip.text.replace(/\$\{0\}/g, '"field": "value"').replace(/\$\{[^}]*\}/g, '0');
      expect(() => JSON.parse('{' + filled + '}'), k + ' 非法 JSON：' + filled).not.toThrow();
    }
  });

  it('post_filter 内部识别为查询位（query-type / 字段位）', () => {
    const doc = '{\n  "post_filter": {\n    \n  }\n}';
    expect(dslContext(doc, doc.indexOf('    \n') + 4).kind).toBe('query-type');
    const withTerm = '{\n  "post_filter": {\n    "term": {\n      "\n    }\n  }\n}';
    expect(dslContext(withTerm, withTerm.indexOf('      "\n') + 7).kind).toBe('field');
  });

  it('顶层 knn.filter 内部识别为查询位；knn 自身键位不误判', () => {
    const filtered = '{\n  "knn": {\n    "filter": {\n      \n    }\n  }\n}';
    expect(dslContext(filtered, filtered.indexOf('      \n') + 6).kind).toBe('query-type');
    const top = '{\n  "knn": {\n    \n  }\n}';
    expect(dslContext(top, top.indexOf('    \n') + 4).kind).not.toBe('query-type');
  });
});
