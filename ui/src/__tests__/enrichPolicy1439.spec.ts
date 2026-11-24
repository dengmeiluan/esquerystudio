/**
 * 1439：Enrich 策略体（PUT /_enrich/policy/<name>）。
 *
 * 体是 {match|geo_match|range: {indices,query,match_field/enrich_fields…}}；
 * query 内是 Query DSL（回落整棵查询补全）。此前落 search 档，根键给 query/aggs 全非法。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, enrichPolicyBodyKeyItems, enrichMatchPolicyKeyItems, enrichRangePolicyKeyItems,
  enrichPolicyBodyRootKeys, enrichMatchKeys, enrichRangeKeys, ENRICH_POLICY_TYPES, enrichPolicyRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

describe('1439 Enrich 策略体分档', () => {
  it('路径分派：PUT /_enrich/policy/<name>；_execute/GET 不抢', () => {
    expect(bodyKindForPath('/_enrich/policy/users', 'PUT')).toBe('enrich-policy-body');
    expect(bodyKindForPath('/_enrich/policy/users/_execute', 'POST')).toBe('search');
    expect(bodyKindForPath('/_enrich/policy/users', 'GET')).toBe('search');
  });

  it('目录：三型策略 + match/range 键', () => {
    expect(ENRICH_POLICY_TYPES).toEqual(['match', 'geo_match', 'range']);
    expect(enrichPolicyBodyRootKeys).toEqual(['match', 'geo_match', 'range']);
    expect(enrichMatchKeys).toEqual(['indices', 'query', 'match_field', 'enrich_fields']);
    expect(enrichRangeKeys).toEqual(['indices', 'query', 'field', 'ranges', 'enrich_fields']);
    expect(enrichPolicyBodyKeyItems().find(i => i.label === 'match')?.detail).toContain('等值');
    expect(enrichRangePolicyKeyItems().find(i => i.label === 'ranges')?.detail).toContain('区间');
  });

  it('区域：根 / match / geo_match / range / query / 更深', () => {
    const at = (s: string) => enrichPolicyRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"match": {')).toBe('match');
    expect(at('{"geo_match": {')).toBe('match');
    expect(at('{"range": {')).toBe('range');
    expect(at('{"match": {"query": {')).toBe('query');
    expect(at('{"range": {"query": {"bool": {')).toBe('query');
    expect(at('{"match": {"indices": [')).toBe('deep');
  });

  it('lint：合法体静默；未知策略类型/内层键分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('enrich-policy-body', JSON.stringify({
      match: { indices: ['users'], query: { term: { active: true } }, match_field: 'email', enrich_fields: ['name'] },
    }))).toEqual([]);
    expect(lintStructuredBody('enrich-policy-body', JSON.stringify({
      range: { indices: ['ranges'], field: 'score', ranges: [{ from: 0, to: 100 }], enrich_fields: ['grade'] },
    }))).toEqual([]);

    const match = lintStructuredBody('enrich-policy-body', JSON.stringify({ matchh: {} }));
    expect(match.some(f => f.message.includes('Enrich 策略体') && f.message.includes('最接近：match'))).toBe(true);

    const inner = lintStructuredBody('enrich-policy-body', JSON.stringify({ match: { indicesx: ['x'] } }));
    expect(inner.some(f => f.message.includes('Enrich match 策略') && f.message.includes('最接近：indices'))).toBe(true);

    const range = lintStructuredBody('enrich-policy-body', JSON.stringify({ range: { range: [] } }));
    expect(range.some(f => f.message.includes('Enrich range 策略') && f.message.includes('最接近：ranges'))).toBe(true);

    const q = lintStructuredBody('enrich-policy-body', JSON.stringify({ query: {}, match: {} }));
    expect(q.some(f => f.message.includes('Enrich 策略体') && f.message.includes('query'))).toBe(true);
  });
});
