import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectCheck, fetchConfig, start, listJobs } from '../platform/browserXmigrate';

let scroll = 0;
function mockSource() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const p = new URL(String(input)).pathname;
    if (p.startsWith('/_cat/indices')) return new Response(JSON.stringify([{ index: 'orders', health: 'green', 'docs.count': '2', 'store.size': '1kb' }]), { status: 200 });
    if (p === '/orders/_mapping') return new Response(JSON.stringify({ orders: { mappings: { properties: { id: { type: 'keyword' } } } } }), { status: 200 });
    if (p === '/orders/_settings') return new Response(JSON.stringify({ orders: { settings: { 'index.number_of_shards': '1' } } }), { status: 200 });
    if (p.startsWith('/orders/_search')) {
      scroll++;
      const hits = scroll === 1 ? [{ _id: '1', _source: { id: '1' } }] : [];
      return new Response(JSON.stringify({ _scroll_id: 's1', hits: { total: { value: 1 }, hits } }), { status: 200 });
    }
    if (p === '/_search/scroll') return new Response(JSON.stringify({ _scroll_id: 's1', hits: { total: { value: 1 }, hits: [] } }), { status: 200 });
    return new Response('{}', { status: 200 });
  });
}

describe('browser cross-cluster migration', () => {
  beforeEach(() => { localStorage.clear(); scroll = 0; vi.restoreAllMocks(); });

  it('source connect/fetch-config 走源集群，不依赖宿主 CORS 配置', async () => {
    mockSource();
    const rows = await connectCheck({ scheme: 'http', host: 'src.local', port: 9200 });
    expect(rows[0].index).toBe('orders');
    const cfg = await fetchConfig({ scheme: 'http', host: 'src.local', port: 9200 }, 'orders');
    expect(JSON.parse(cfg.mapping).properties.id.type).toBe('keyword');
  });

  it('start 用 scroll + bulk 搬运，并写入本机作业列表', async () => {
    mockSource();
    const host: any = vi.fn(async (path: string, method = 'GET') => {
      if (path.startsWith('/_bulk')) return { items: [{ index: { status: 201 } }] };
      if (method === 'PUT') return { acknowledged: true };
      return {};
    });
    const r = await start(host, { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'NONE', batchSize: 100 }, { scheme: 'http', host: 'src.local', port: 9200 });
    await new Promise(resolve => setTimeout(resolve, 20));
    const jobs = await listJobs(host, 10);
    expect(jobs[0].jobId).toBe(r.jobId);
    expect(jobs[0].migrated).toBe(1);
    expect(jobs[0].status).toBe('DONE');
  });
});
