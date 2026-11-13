import { describe, it, expect } from 'vitest';
import { lintDsl } from '../dslLint';

/* 1116：稀疏子句字段体检——regexp/match_phrase_prefix/terms_set 的字段键位，
 rank_feature/distance_feature/percolate 的值位 field，全部纳入 unknown-field 口径；
 子句顶层参数（span_term.boost、terms_set.minimum_should_match_*）不误判为字段。 */
const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'title.keyword', type: 'keyword' },
  { path: 'issuer_name', type: 'keyword' },
  { path: 'risk_score', type: 'rank_feature' },
  { path: 'publish_time', type: 'date' },
  { path: 'queries', type: 'percolator' },
];
const ctx = { fields: FIELDS };
const rules = (body: unknown) => lintDsl(body, ctx).map(f => f.rule);
const unknown = (body: unknown) => lintDsl(body, ctx).filter(f => f.rule === 'unknown-field');

describe('1116 稀疏子句 unknown-field 覆盖', () => {
  it('键位字段：regexp / match_phrase_prefix 拼写错给最近字段', () => {
    for (const [op, bad] of [['regexp', 'titl'], ['match_phrase_prefix', 'titl']] as const) {
      const f = unknown({ query: { [op]: { [bad]: 'es.*' } } });
      expect(f.length, op).toBeGreaterThan(0);
      expect(f[0].suggestion, op).toContain('title');
      expect(f[0].path).toContain(`${op}.${bad}`);
    }
  });

  it('值位字段：rank_feature / distance_feature / percolate 的 field 键', () => {
    const rf = unknown({ query: { rank_feature: { field: 'risk_scor', boost: 2 } } });
    expect(rf[0]?.suggestion).toContain('risk_score');
    const df = unknown({ query: { distance_feature: { field: 'publish_tim', pivot: '7d' } } });
    expect(df[0]?.suggestion).toContain('publish_time');
    const pc = unknown({ query: { percolate: { field: 'queriez', document: {} } } });
    expect(pc[0]?.suggestion).toContain('queries');
  });

  it('顶层参数不是字段：span_term.boost / terms_set.minimum_should_match_* / regexp.flags', () => {
    expect(rules({ query: { span_term: { title: 'es', boost: 2 } } })).not.toContain('unknown-field');
    expect(rules({ query: { terms_set: { issuer_name: ['a'], minimum_should_match_field: 'min_should' } } }))
      .not.toContain('unknown-field');
    expect(rules({ query: { regexp: { title: 'es.*', flags: 'ALL', case_insensitive: true } } }))
      .not.toContain('unknown-field');
  });

  it('合法稀疏子句零误报；无 ctx 零回归', () => {
    expect(unknown({ query: { regexp: { title: 'es.*' } } })).toHaveLength(0);
    expect(unknown({ query: { rank_feature: { field: 'risk_score' } } })).toHaveLength(0);
    expect(unknown({ query: { span_term: { title: 'es' } } })).toHaveLength(0);
    expect(lintDsl({ query: { regexp: { titl: 'es.*' } } }).filter(f => f.rule === 'unknown-field')).toHaveLength(0);
  });
});
