/* 1047：多路召回融合结构 lint——sub_searches 与 query/knn 互斥、必须配 rank。 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const rules = (o: unknown) => lintDsl(o).map(f => f.rule);

describe('1047 sub_searches 融合结构', () => {
  it('sub_searches + query 同体 → error（二义请求）', () => {
    const f = lintDsl({
      query: { match_all: {} },
      sub_searches: [{ query: { match_all: {} } }],
      rank: { rrf: {} },
    });
    const conflict = f.find(x => x.rule === 'query-subsearches-conflict');
    expect(conflict?.severity).toBe('error');
    expect(conflict?.anchor).toBe('sub_searches');
  });

  it('sub_searches + knn 同体 → error', () => {
    expect(rules({ knn: { field: 'v', query_vector: [1] }, sub_searches: [{ query: { match_all: {} } }], rank: { rrf: {} } }))
      .toContain('query-subsearches-conflict');
  });

  it('sub_searches 缺 rank → warning；补 rank 后消失', () => {
    expect(rules({ sub_searches: [{ query: { match_all: {} } }] })).toContain('subsearches-no-rank');
    expect(rules({ sub_searches: [{ query: { match_all: {} } }], rank: { rrf: { rank_constant: 60 } } }))
      .not.toContain('subsearches-no-rank');
  });

  it('合法融合体零规则；query/knn 单独使用不受影响', () => {
    expect(rules({
      sub_searches: [{ query: { match_all: {} } }, { query: { match_all: {} } }],
      rank: { rrf: { rank_constant: 60, rank_window_size: 100 } },
    })).toEqual([]);
    expect(rules({ query: { match_all: {} } })).not.toContain('query-subsearches-conflict');
    expect(rules({ knn: { field: 'v', query_vector: [1] } })).not.toContain('query-subsearches-conflict');
  });

  it('retriever 与 query/knn/sub_searches 同体 → error；单独 retriever 合法', () => {
    const f = lintDsl({ query: { match_all: {} }, retriever: { standard: { query: { match_all: {} } } } });
    const c = f.find(x => x.rule === 'retriever-conflict');
    expect(c?.severity).toBe('error');
    expect(c?.anchor).toBe('retriever');
    expect(rules({ retriever: { standard: { query: { match_all: {} } } } })).not.toContain('retriever-conflict');
    expect(rules({ knn: { field: 'v', query_vector: [1] }, retriever: { standard: { query: { match_all: {} } } } }))
      .toContain('retriever-conflict');
  });

  it('sub_searches/rank/ext 不再被根键拼写规则误报', () => {
    expect(rules({ sub_searches: [{ query: { match_all: {} } }], rank: { rrf: {} }, ext: {} }))
      .not.toContain('root-key-typo');
  });
});
