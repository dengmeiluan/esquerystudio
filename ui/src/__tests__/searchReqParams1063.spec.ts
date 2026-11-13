/* 1063：请求级 URL 参数与 body 分账——preference/allow_partial 不再冒充 body 键。 */
import { describe, it, expect } from 'vitest';
import { REQUEST_PARAMS, REQUEST_PARAM_KEYS, SEARCH_PARAM_KEYS } from '../utils/queryBodyParams';
import { parseTree, serializeTree } from '../utils/queryAst';

describe('1063 搜索请求参数分账', () => {
  it('六个 URL 参数单列；preference/allow_partial 不再出现在 body 注册表', () => {
    expect([...REQUEST_PARAM_KEYS]).toEqual([
      'routing', 'preference', 'search_type', 'allow_partial_search_results', 'ignore_unavailable', 'expand_wildcards',
    ]);
    expect(SEARCH_PARAM_KEYS.has('preference')).toBe(false);
    expect(SEARCH_PARAM_KEYS.has('allow_partial_search_results')).toBe(false);
    expect(REQUEST_PARAMS.every(p => p.label && p.hint)).toBe(true);
  });

  it('旧稿 body 里误写的 preference 仍原样往返（零丢失，但 UI 不再提供 body 入口）', () => {
    const dsl = { query: { match_all: {} }, preference: '_local', allow_partial_search_results: false };
    const r = parseTree(dsl);
    if (!r.ok) throw new Error(r.reason);
    const out = serializeTree(r.tree) as any;
    expect(out.preference).toBe('_local');
    expect(out.allow_partial_search_results).toBe(false);
  });
});
