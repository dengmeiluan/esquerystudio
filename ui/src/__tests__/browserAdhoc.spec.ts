import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { adhocPrepare, adhocStart, adhocStatus, adhocJobs } from '../platform/browserAdhoc';

const calls: { path: string; method: string; body?: string }[] = [];
let taskDone = false;

function fakeEs(path: string, method = 'GET', body?: string) {
  calls.push({ path, method, body });
  if (path.startsWith('/_alias/')) return Promise.resolve({ 'orders-2026': { aliases: { orders: { is_write_index: true } } } });
  if (path === '/orders-2026/_mapping') return Promise.resolve({ 'orders-2026': { mappings: { properties: { order_id: { type: 'keyword' }, created_at: { type: 'date' } } } } });
  if (path === '/orders-2026/_settings?flat_settings=true') return Promise.resolve({ 'orders-2026': { settings: { 'index.number_of_shards': '1', 'index.uuid': 'x', 'index.refresh_interval': '1s' } } });
  if (path === '/orders-2026/_count') return Promise.resolve({ count: 10 });
  if (path === '/_reindex?wait_for_completion=false&slices=auto&refresh=true') return Promise.resolve({ task: 'n1:1' });
  if (path.startsWith('/_tasks/')) return Promise.resolve({ completed: taskDone, task: { status: { total: 10, created: taskDone ? 10 : 5, updated: 0 } } });
  return Promise.resolve({ acknowledged: true });
}

describe('browser adhoc rebuild orchestration', () => {
  beforeEach(() => {
    localStorage.clear(); calls.length = 0; taskDone = false;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('prepare 解析别名 write 索引并给出 settings/mapping/字段候选', async () => {
    const p = await adhocPrepare(fakeEs as any, 'orders');
    expect(p).toMatchObject({ isAlias: true, sourcePhysical: 'orders-2026', docCount: 10 });
    expect(p.timeFieldCandidates).toContain('created_at');
    expect(JSON.parse(p.settingsJson)).toEqual({ number_of_shards: '1', refresh_interval: '1s' });
  });

  it('start -> status 推进 -> 完成后原子切别名', async () => {
    const r = await adhocStart(fakeEs as any, { index: 'orders', strategy: 'INCREMENTAL', destIndex: 'orders-new', confirmDirectSwap: true });
    expect(r.job).toMatchObject({ status: 'RUNNING', sourcePhysical: 'orders-2026', destPhysical: 'orders-new' });
    const running = await adhocStatus(fakeEs as any, r.jobId);
    expect(running).toMatchObject({ status: 'RUNNING', created: 5 });
    taskDone = true;
    const done = await adhocStatus(fakeEs as any, r.jobId);
    expect(done).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE', created: 10 });
    const aliasCall = calls.find(c => c.path === '/_aliases');
    expect(aliasCall?.body).toContain('"add"');
    expect(aliasCall?.body).toContain('orders-new');
    const list = await adhocJobs(fakeEs as any);
    expect(list[0].jobId).toBe(r.jobId);
  });
});
