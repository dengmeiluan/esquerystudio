import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifySetting, lintSettingChanges, analyzeSettingsImpact,
  estimateGuardedAction, dryRunGuardedAction, executeGuardedAction, BrowserInsightError,
} from '../platform/browserInsight';

const MB = 1024 * 1024;

function fakeEs() {
  const calls: { path: string; method: string; body?: string }[] = [];
  const fn = vi.fn(async (path: string, method = 'GET', body?: string) => {
    calls.push({ path, method, body });
    if (path.endsWith('/_count')) return { count: 100 };
    if (path.includes('/_stats/')) {
      return { indices: { logs: { primaries: { store: { size_in_bytes: 3600 * MB } } } } };
    }
    if (path.endsWith('/_settings') && method === 'PUT') return { acknowledged: true };
    return {};
  });
  return { fn, calls };
}

describe('browser-mode insight guardrail', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('setting 分类与服务端 Es710IndexSettings 同口径', () => {
    expect(classifySetting('index.refresh_interval')).toBe('DYNAMIC');
    expect(classifySetting('blocks.write')).toBe('DYNAMIC');
    expect(classifySetting('index.number_of_shards')).toBe('STATIC');
    expect(classifySetting('analysis.analyzer.my_analyzer')).toBe('STATIC');
    expect(classifySetting('made_up.setting')).toBe('ILLEGAL');
  });

  it('settings-impact 为静态项附带重建预估，为非法项标 ILLEGAL', async () => {
    const es = fakeEs();
    const r = await analyzeSettingsImpact(es.fn as any, 'logs', {
      refresh_interval: '30s',
      number_of_shards: 3,
      'no_such_setting': true,
    });
    expect(r).toMatchObject({ hasDynamic: true, hasStatic: true, hasIllegal: true });
    expect(r.rebuildEstimate).toMatchObject({ docCount: 100, sizeBytes: 3600 * MB, estimatedMinutes: 2 });
    expect(r.items.find((i: any) => i.key === 'number_of_shards').kind).toBe('STATIC');
    expect(r.items.find((i: any) => i.key === 'no_such_setting').kind).toBe('ILLEGAL');
  });

  it('L1 值门禁拒绝负数副本并把该项升级为 ILLEGAL', async () => {
    expect(lintSettingChanges({ number_of_replicas: -1 })).toHaveLength(1);
    expect(lintSettingChanges({ number_of_replicas: '2' })).toHaveLength(0);
    const es = fakeEs();
    const r = await analyzeSettingsImpact(es.fn as any, 'logs', { number_of_replicas: -1 });
    expect(r.hasIllegal).toBe(true);
    expect(r.items[0].gateIssues[0]).toMatchObject({ code: 'SETTING_VALUE_TYPE', severity: 'ERROR' });
  });

  it('estimate 遇到静态项直接拒绝且不发 token；动态项通过后 token 绑定参数', async () => {
    const es = fakeEs();
    await expect(estimateGuardedAction(es.fn as any, 'apply-index-settings', {
      index: 'logs', changes: { number_of_shards: 3 },
    })).rejects.toMatchObject({ status: 400 });

    const params = { index: 'logs', changes: { refresh_interval: '30s', number_of_replicas: 0 } };
    const est = await estimateGuardedAction(es.fn as any, 'apply-index-settings', params);
    expect(est).toMatchObject({ riskLevel: 'MEDIUM', supportsDryRun: true });
    expect(est.summary).toContain('热更 2 项');
    expect(est.analysis.hasIllegal).toBe(false);

    await expect(executeGuardedAction(
      es.fn as any, 'apply-index-settings', { ...params, changes: { refresh_interval: '1s' } }, est.confirmToken,
    )).rejects.toMatchObject({ status: 403, code: 'CONFIRM_TOKEN_INVALID' });

    const receipt = await executeGuardedAction(es.fn as any, 'apply-index-settings', params, est.confirmToken);
    expect(receipt.receiptId).toBeTruthy();
    expect(receipt.result.applied).toEqual({ refresh_interval: '30s', number_of_replicas: 0 });
    const put = es.calls.find(c => c.method === 'PUT' && c.path === '/logs/_settings');
    expect(put?.body).toContain('"index"');
    expect(put?.body).toContain('"refresh_interval":"30s"');
  });

  it('dry-run 只跑 L1 门禁，不产生写请求', async () => {
    const es = fakeEs();
    const r = await dryRunGuardedAction(es.fn as any, 'apply-index-settings', {
      index: 'logs', changes: { number_of_replicas: -1 },
    });
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ code: 'SETTING_VALUE_TYPE' });
    expect(es.calls.some(c => c.method === 'PUT')).toBe(false);
  });

  it('未实现的 actionId 给出可辨识错误而不是伪造成功', async () => {
    const es = fakeEs();
    await expect(estimateGuardedAction(es.fn as any, 'unknown-action', {
      index: 'logs', changes: { refresh_interval: '30s' },
    })).rejects.toBeInstanceOf(BrowserInsightError);
  });
});
