import { describe, it, expect } from 'vitest';
import { lintDsl } from '../dslLint';

/* 1117：稀疏子句字段类型错配——只判官方语义明确的组合（宁缺勿错）。
 rank_feature→rank_feature、distance_feature→date/date_nanos/geo_point、
 percolate→percolator、sparse_vector→sparse_vector、regexp→keyword/text/wildcard、
 match_phrase_prefix/match_bool_prefix→text/keyword。 */
const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'status', type: 'keyword' },
  { path: 'age', type: 'integer' },
  { path: 'created', type: 'date' },
  { path: 'risk_score', type: 'rank_feature' },
  { path: 'location', type: 'geo_point' },
  { path: 'queries', type: 'percolator' },
  { path: 'vec', type: 'sparse_vector' },
];
const ctx = { fields: FIELDS };
const rare = (body: unknown) => lintDsl(body, ctx).filter(f => f.rule === 'rare-type');

describe('1117 稀疏子句类型错配', () => {
  it('rank_feature / percolate / sparse_vector 的专用类型', () => {
    expect(rare({ query: { rank_feature: { field: 'risk_score' } } })).toHaveLength(0);
    const rf = rare({ query: { rank_feature: { field: 'status' } } });
    expect(rf[0]?.severity).toBe('warning');
    expect(rf[0]?.anchor).toBe('status');
    expect(rf[0]?.suggestion).toContain('rank_feature');
    expect(rare({ query: { percolate: { field: 'queries', document: {} } } })).toHaveLength(0);
    expect(rare({ query: { percolate: { field: 'title', document: {} } } })[0]?.message).toContain('percolator');
    expect(rare({ query: { sparse_vector: { field: 'vec', query_vector: [0.1] } } })).toHaveLength(0);
    expect(rare({ query: { sparse_vector: { field: 'title', query_vector: [0.1] } } })[0]?.message).toContain('sparse_vector');
  });

  it('distance_feature 支持 date/date_nanos/geo_point，不支持数值', () => {
    expect(rare({ query: { distance_feature: { field: 'created', pivot: '7d' } } })).toHaveLength(0);
    expect(rare({ query: { distance_feature: { field: 'location', pivot: '1km' } } })).toHaveLength(0);
    const num = rare({ query: { distance_feature: { field: 'age', pivot: '7d' } } });
    expect(num[0]?.message).toContain('date / date_nanos / geo_point');
  });

  it('regexp / match_phrase_prefix / match_bool_prefix 的文本族', () => {
    expect(rare({ query: { regexp: { status: 'a.*' } } })).toHaveLength(0);
    expect(rare({ query: { regexp: { title: 'a.*' } } })).toHaveLength(0);
    expect(rare({ query: { regexp: { age: '1.*' } } })[0]?.anchor).toBe('age');
    expect(rare({ query: { match_phrase_prefix: { title: 'es' } } })).toHaveLength(0);
    expect(rare({ query: { match_phrase_prefix: { age: '1' } } })[0]?.anchor).toBe('age');
    expect(rare({ query: { match_bool_prefix: { age: '1' } } })[0]?.anchor).toBe('age');
  });

  it('无 ctx 零回归；普通算子不产出 rare-type', () => {
    expect(lintDsl({ query: { rank_feature: { field: 'status' } } }).filter(f => f.rule === 'rare-type')).toHaveLength(0);
    expect(rare({ query: { term: { status: 'a' } } })).toHaveLength(0);
    expect(rare({ query: { range: { age: { gte: 1 } } } })).toHaveLength(0);
  });
});
