import { describe, it, expect } from 'vitest';
import { QUERY_SNIPPETS } from '../utils/dslCompletionContext';
import { OPS_META, WRAP_LABELS, MULTI_LABELS } from '../utils/queryAstOps';

/* 1131：原始 DSL 的 query-type 补全此前只有 8 个常用算子，树/校验/高亮已支持全量
 * 但手写 DSL 时只能盲打。现在补全目录与算子注册表同源对齐（含复合容器/跨度/向量）。 */
describe('1131 DSL query 补全目录全量对齐', () => {
  const expected = [
    ...Object.keys(OPS_META),
    ...Object.keys(WRAP_LABELS),
    ...Object.keys(MULTI_LABELS),
    'bool',
  ];

  it('注册表里的每个查询算子都有 snippet，且没有多余项', () => {
    expect(Object.keys(QUERY_SNIPPETS).sort()).toEqual([...new Set(expected)].sort());
    expect(Object.keys(QUERY_SNIPPETS).length).toBe(63);
  });

  it('高频八员保持原顺序（前缀输入前的首屏稳定）', () => {
    expect(Object.keys(QUERY_SNIPPETS).slice(0, 8)).toEqual([
      'match', 'match_phrase', 'term', 'terms', 'range', 'exists', 'wildcard', 'bool',
    ]);
  });

  it('每条 snippet 的顶层键与算子名一致，占位替换后仍是合法 JSON', () => {
    for (const [op, snip] of Object.entries(QUERY_SNIPPETS)) {
      expect(snip.startsWith('"' + op + '":'), op + ' 顶层键').toBe(true);
      const filled = snip.replace(/\$\{[^}]*\}/g, '0');
      expect(() => JSON.parse('{' + filled + '}'), op + ' snippet 非法 JSON：' + filled).not.toThrow();
    }
  });

  it('稀缺算子有官方体骨架（抽查 rank_feature / terms_set / span_near / knn / semantic）', () => {
    expect(QUERY_SNIPPETS.rank_feature).toContain('"field"');
    expect(QUERY_SNIPPETS.rank_feature).toContain('"boost"');
    expect(QUERY_SNIPPETS.terms_set).toContain('"minimum_should_match_field"');
    expect(QUERY_SNIPPETS.span_near).toContain('"clauses"');
    expect(QUERY_SNIPPETS.span_near).toContain('"slop"');
    expect(QUERY_SNIPPETS.knn).toContain('"query_vector"');
    expect(QUERY_SNIPPETS.knn).toContain('"num_candidates"');
    expect(QUERY_SNIPPETS.semantic).toContain('"field"');
    expect(QUERY_SNIPPETS.semantic).toContain('"query"');
    /* 官方体抽查：geo_grid 是 {field:{geohash|geotile|geohex:key}}；shape 有 shape 包裹层 */
    expect(QUERY_SNIPPETS.geo_grid).toContain('geohash');
    expect(QUERY_SNIPPETS.geo_grid).not.toContain('precision');
    expect(QUERY_SNIPPETS.shape).toContain('"shape": {');
  });
});
