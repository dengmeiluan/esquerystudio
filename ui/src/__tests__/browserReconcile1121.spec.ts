/* 2026-11-21 兼容计划批：浏览器端迁移对账/冲突样本/事件端点与 preflight 增强字段——
 * jobReconcile 双侧 _count（档案缺失/取数失败如实 null）、jobConflicts 样本环口径
 * {samples,total,truncated}、preflight 补 sourceBytes(_stats)/sourceAliases/
 * fieldTypeCounts/recommended。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jobConflicts, jobReconcile, preflight } from '../platform/browserXmigrate';

const SRC_CONN = { scheme: 'http', host: 'src.local', port: 9200 };
const JOBS_KEY = 'esquerystudio.xmigrate.jobs';

describe('xmigrate 对账与冲突样本（2026-11-21 兼容计划批）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  function seedJob(over: Record<string, any> = {}) {
    localStorage.setItem(JOBS_KEY, JSON.stringify([{
      jobId: 'xm-1', sourceIndex: 'orders', destIndex: 'orders-copy', status: 'DONE',
      srcConnId: 'src-profile', migrated: 9, conflicts: 3, errors: 0, createTime: Date.now() - 1000,
      conflictSamples: ['a', 'b'], finishTime: Date.now(),
      ...over,
    }]));
  }

  it('jobReconcile：双侧 _count 对比，源凭据按作业档案从本机档案库解析', async () => {
    seedJob();
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'src-profile', name: 'src', url: 'http://src.local:9200', username: 'u', password: 'p' },
    ]));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const u = new URL(String(input));
      expect(init?.method === 'POST' || u.pathname.includes('_count')).toBe(true);
      return new Response(JSON.stringify({ count: 9 }), { status: 200 });
    });
    const host = vi.fn(async () => ({ count: 7 }));
    const r = await jobReconcile(host as any, 'xm-1');
    expect(r).toEqual({ sourceIndex: 'orders', destIndex: 'orders-copy', sourceCount: 9, destCount: 7, diff: 2 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/orders/_count');
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({ Authorization: expect.stringContaining('Basic ') });
    expect(host).toHaveBeenCalledWith('/orders-copy/_count', 'POST', '{"query":{"match_all":{}}}');
  });

  it('jobReconcile：任一侧取数失败如实 null，不冒充 0', async () => {
    seedJob();
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'src-profile', name: 'src', url: 'http://src.local:9200' },
    ]));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('source down');
    });
    const host = vi.fn(async () => ({ count: 7 }));
    const r = await jobReconcile(host as any, 'xm-1');
    expect(r).toEqual({ sourceIndex: 'orders', destIndex: 'orders-copy', sourceCount: null, destCount: 7, diff: null });
  });

  it('jobReconcile：作业缺源连接档案（历史手输作业）或档案不存在时如实报错', async () => {
    seedJob({ srcConnId: null });
    await expect(jobReconcile(vi.fn() as any, 'xm-1')).rejects.toThrow('未记录源连接档案');
    seedJob();
    await expect(jobReconcile(vi.fn() as any, 'xm-1')).rejects.toThrow('连接档案不存在');
    await expect(jobReconcile(vi.fn() as any, 'nope')).rejects.toThrow('作业不存在');
  });

  it('jobConflicts：{samples,total,truncated} 口径，样本数不足全量时 truncated=true', async () => {
    seedJob();
    expect(await jobConflicts('xm-1')).toEqual({ jobId: 'xm-1', samples: ['a', 'b'], total: 3, truncated: true });
    seedJob({ conflicts: 2 });
    expect(await jobConflicts('xm-1')).toEqual({ jobId: 'xm-1', samples: ['a', 'b'], total: 2, truncated: false });
    await expect(jobConflicts('nope')).rejects.toThrow('作业不存在');
  });
});

describe('xmigrate preflight 增强字段（2026-11-21 兼容计划批）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('sourceBytes(_stats 主分片)/sourceAliases/fieldTypeCounts 可算即回填，recommended 按目标在否给建议', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const u = new URL(String(input));
      if (u.pathname.startsWith('/_cat/indices')) return new Response(JSON.stringify(
        [{ index: 'orders', health: 'green', pri: '3', 'docs.count': '123', 'store.size': '4kb' }]), { status: 200 });
      if (u.pathname.startsWith('/orders/_stats')) return new Response(JSON.stringify({
        indices: { orders: { primaries: { store: { size_in_bytes: 4096 } } } },
      }), { status: 200 });
      if (u.pathname.startsWith('/orders/_alias')) return new Response(JSON.stringify(
        { orders: { aliases: { orders_ro: {}, orders_rw: {} } } }), { status: 200 });
      if (u.pathname.startsWith('/orders/_mapping')) return new Response(JSON.stringify(
        { orders: { mappings: { properties: {
          title: { type: 'text', fields: { kw: { type: 'keyword' } } },
          nested_a: { type: 'nested', properties: { inner: { type: 'keyword' } } },
        } } } }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    const host: any = vi.fn(async (path: string) => {
      if (path === '/orders-copy/_mapping') throw new Error('index_not_found_exception');
      throw new Error('unexpected host call: ' + path);
    });
    const r = await preflight(host, { sourceIndex: 'orders', destIndex: 'orders-copy', conn: SRC_CONN });
    expect(r.sourceBytes).toBe(4096);
    expect(r.sourceAliases).toEqual(['orders_ro', 'orders_rw']);
    expect(r.fieldTypeCounts).toEqual({ text: 1, keyword: 2, nested: 1 });
    expect(r.recommended).toContain('dryRun=true');
    expect(r.destExists).toBe(false);
  });

  it('源侧增强字段取不到如实 null，目标已存在时 recommended 切换为合并语义', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const u = new URL(String(input));
      if (u.pathname.startsWith('/_cat/indices')) return new Response('[]', { status: 200 });
      return new Response('bad json', { status: 500 });
    });
    const host: any = vi.fn(async () => ({ 'orders-copy': {} }));
    const r = await preflight(host, { sourceIndex: 'orders', destIndex: 'orders-copy', conn: SRC_CONN });
    expect(r.sourceBytes).toBeNull();
    expect(r.sourceAliases).toBeNull();
    expect(r.fieldTypeCounts).toBeNull();
    expect(r.destExists).toBe(true);
    expect(r.recommended).toContain('合并语义');
  });
});
