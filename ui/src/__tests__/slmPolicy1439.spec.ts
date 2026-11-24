/**
 * 1439：SLM 策略体（PUT /_slm/policy/<id>）。
 *
 * 体是 {schedule,name,repository,config,retention}；config 与创建快照体同源语义，
 * retention 只有 expire_after/min_count/max_count。此前落 search 档，根键给 query/aggs。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, slmPolicyBodyKeyItems, slmConfigKeyItems, slmRetentionKeyItems,
  slmPolicyBodyRootKeys, slmConfigKeys, slmRetentionKeys, slmPolicyRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

describe('1439 SLM 策略体分档', () => {
  it('路径分派：PUT /_slm/policy/<id> 才进本档；GET/DELETE 不抢', () => {
    expect(bodyKindForPath('/_slm/policy/nightly', 'PUT')).toBe('slm-policy-body');
    expect(bodyKindForPath('/_slm/policy/nightly', 'GET')).toBe('search');
    expect(bodyKindForPath('/_slm/policy/nightly', 'DELETE')).toBe('search');
    expect(bodyKindForPath('/_slm/status', 'GET')).toBe('search');
  });

  it('根键五项；config 与快照内容同源；retention 三键', () => {
    expect(slmPolicyBodyRootKeys).toEqual(['schedule', 'name', 'repository', 'config', 'retention']);
    expect(slmConfigKeys).toEqual(['indices', 'ignore_unavailable', 'include_global_state', 'partial', 'metadata', 'feature_states']);
    expect(slmRetentionKeys).toEqual(['expire_after', 'min_count', 'max_count']);
    expect(slmPolicyBodyKeyItems().find(i => i.label === 'name')?.detail).toContain('日期数学');
    expect(slmRetentionKeyItems().find(i => i.label === 'expire_after')?.detail).toContain('30d');
  });

  it('区域：根层 / config / retention / 更深', () => {
    const at = (s: string) => slmPolicyRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"config": {')).toBe('config');
    expect(at('{"retention": {')).toBe('retention');
    expect(at('{"config": {"metadata": {')).toBe('deep');
  });

  it('lint：合法体静默；根键/配置/保留段拼错分别点名', () => {
    expect(lintStructuredBody('slm-policy-body', JSON.stringify({
      schedule: '0 30 1 * * ?',
      name: '<snapshot-{now/d}>',
      repository: 'my_repo',
      config: { indices: 'logs-*', include_global_state: false },
      retention: { expire_after: '30d', min_count: 5, max_count: 50 },
    }))).toEqual([]);

    const root = lintStructuredBody('slm-policy-body', JSON.stringify({ repositry: 'x' }));
    expect(root.some(f => f.message.includes('SLM 策略体') && f.message.includes('最接近：repository'))).toBe(true);

    const cfg = lintStructuredBody('slm-policy-body', JSON.stringify({ config: { indicesx: '*' } }));
    expect(cfg.some(f => f.message.includes('SLM 快照配置') && f.message.includes('最接近：indices'))).toBe(true);

    const rt = lintStructuredBody('slm-policy-body', JSON.stringify({ retention: { expire_afterr: '30d' } }));
    expect(rt.some(f => f.message.includes('SLM 保留策略') && f.message.includes('最接近：expire_after'))).toBe(true);
  });

  it('负控：search 根键在 SLM 体被拒', () => {
    const f = lintStructuredBody('slm-policy-body', JSON.stringify({ query: {}, schedule: '* * * * * ?' }));
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('query');
  });
});
