/**
 * 1439：ILM 策略体（PUT /_ilm/policy/<id>，6.x 兼容 _xpack/ilm）。
 *
 * 体是 {policy:{phases:{hot|warm|cold|frozen|delete:{min_age,actions:{动作:配置}}}}}；
 * 此前落 search 档（根键 query/aggs 全非法）。本批五段区域：根/policy/phases/阶段/actions，
 * 动作白名单与官方阶段名同源，拼错在对应段点名。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, ilmPolicyBodyKeyItems, ilmPolicyKeyItems, ilmPhaseKeyItems,
  ilmPhaseConfigKeyItems, ilmActionKeyItems, ilmPolicyBodyRootKeys, ilmPolicyKeys,
  ILM_PHASE_NAMES, ILM_PHASE_CONFIG_KEYS, ilmActionKeys, ilmPolicyRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const SAMPLE = {
  policy: {
    phases: {
      hot: { actions: { rollover: { max_size: '50gb', max_age: '7d' } } },
      warm: { min_age: '7d', actions: { forcemerge: { max_num_segments: 1 }, set_priority: { priority: 50 } } },
      delete: { min_age: '30d', actions: { delete: {} } },
    },
  },
};

describe('1439 ILM 策略体分档', () => {
  it('路径分派：PUT /_ilm/policy/<id>（含 _xpack）；GET/DELETE 不抢', () => {
    expect(bodyKindForPath('/_ilm/policy/nightly', 'PUT')).toBe('ilm-policy-body');
    expect(bodyKindForPath('/_xpack/ilm/policy/nightly', 'PUT')).toBe('ilm-policy-body');
    expect(bodyKindForPath('/_ilm/policy/nightly', 'GET')).toBe('search');
    expect(bodyKindForPath('/_ilm/policy/nightly', 'DELETE')).toBe('search');
    expect(bodyKindForPath('/_ilm/explain', 'GET')).toBe('search');
  });

  it('目录：根 policy → phases → 五阶段 → min_age/actions → 动作全集', () => {
    expect(ilmPolicyBodyRootKeys).toEqual(['policy']);
    expect(ilmPolicyKeys).toEqual(['phases']);
    expect(ILM_PHASE_NAMES).toEqual(['hot', 'warm', 'cold', 'frozen', 'delete']);
    expect(ILM_PHASE_CONFIG_KEYS).toEqual(['min_age', 'actions']);
    expect(ilmPhaseKeyItems().map(i => i.label)).toEqual([...ILM_PHASE_NAMES]);
    expect(ilmActionKeyItems().map(i => i.label)).toEqual([...ilmActionKeys]);
    expect(ilmActionKeyItems().find(i => i.label === 'rollover')?.detail).toContain('滚动');
    expect(ilmPolicyBodyKeyItems()[0].detail).toContain('phases');
  });

  it('区域：根 / policy / phases / 阶段对象 / actions / 更深', () => {
    const at = (s: string) => ilmPolicyRegionAt(s, s.length);
    expect(at('{')).toBe('root');
    expect(at('{"policy": {')).toBe('policy');
    expect(at('{"policy": {"phases": {')).toBe('phases');
    expect(at('{"policy": {"phases": {"hot": {')).toBe('phase');
    expect(at('{"policy": {"phases": {"hot": {"actions": {')).toBe('actions');
    expect(at('{"policy": {"phases": {"hot": {"actions": {"rollover": {')).toBe('deep');
  });

  it('lint：样例体静默；阶段/动作/阶段配置拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('ilm-policy-body', JSON.stringify(SAMPLE))).toEqual([]);

    const phase = lintStructuredBody('ilm-policy-body', JSON.stringify({ policy: { phases: { hott: {} } } }));
    expect(phase.some(f => f.message.includes('ILM 阶段表') && f.message.includes('最接近：hot'))).toBe(true);

    const cfg = lintStructuredBody('ilm-policy-body', JSON.stringify({
      policy: { phases: { hot: { min_agee: '0ms', actions: {} } } },
    }));
    expect(cfg.some(f => f.message.includes('ILM 阶段 hot') && f.message.includes('最接近：min_age'))).toBe(true);

    const act = lintStructuredBody('ilm-policy-body', JSON.stringify({
      policy: { phases: { hot: { actions: { rolloverr: { max_size: '1gb' } } } } },
    }));
    expect(act.some(f => f.message.includes('ILM 阶段 hot 动作') && f.message.includes('最接近：rollover'))).toBe(true);

    const q = lintStructuredBody('ilm-policy-body', JSON.stringify({ policy: SAMPLE.policy, query: {} }));
    expect(q.some(f => f.message.includes('ILM 策略体') && f.message.includes('query'))).toBe(true);
  });
});
