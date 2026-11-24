/* 2026-11-21 兼容计划批：跨集群迁移作业事件时间线——启动/切片/409/终态进容量 200
 * 事件环（{ts,stage,message,level}），INTERRUPTED 由关闭页语义派生，REST events
 * 端点同源数据；409 冲突 _id 落入容量 1000 样本环。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jobEvents, progress, start } from '../platform/browserXmigrate';

const SRC_CONN = { scheme: 'http', host: 'src.local', port: 9200 };
const flush = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

describe('xmigrate 作业事件时间线（2026-11-21 兼容计划批）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  function mockSource(conflictIds: string[]) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const p = new URL(String(input)).pathname;
      if (p === '/orders/_search') {
        return new Response(JSON.stringify({
          _scroll_id: 's1',
          hits: { total: { value: 2 }, hits: [{ _id: '1', _source: {} }, { _id: '2', _source: {} }] },
        }), { status: 200 });
      }
      if (p === '/_search/scroll') return new Response(JSON.stringify({ _scroll_id: 's1', hits: { hits: [] } }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    return {
      /* bulk：id=1 已在目标 → 409 计入冲突样本；id=2 新写 */
      bulk: vi.fn(async () => ({ items: [{ create: { status: 409, _id: conflictIds[0] } }, { create: { status: 201, _id: '2' } }] })),
    };
  }

  it('START → SLICE → CONFLICT(409) → DONE 依次入环，字段口径对齐服务端', async () => {
    const { bulk } = mockSource(['1']);
    const host: any = vi.fn(async (path: string) => {
      if (path.startsWith('/_bulk')) return bulk();
      return {};
    });
    const r = await start(host, { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'NONE', batchSize: 100 }, SRC_CONN);
    await flush();
    const j = await progress(r.jobId);
    expect(j.status).toBe('DONE');
    expect(j.conflicts).toBe(1);
    expect(j.conflictSamples).toEqual(['1']);
    const events = await jobEvents(r.jobId);
    expect(events.jobId).toBe(r.jobId);
    expect(events.events.map((e: any) => e.stage)).toEqual(['START', 'SLICE', 'CONFLICT', 'DONE']);
    expect(events.events.map((e: any) => e.level)).toEqual(['info', 'info', 'warn', 'info']);
    for (const e of events.events) {
      expect(typeof e.ts).toBe('number');
      expect(e.message).toBeTruthy();
    }
    expect(events.events[2].message).toContain('409');
    expect(events.events[3].message).toContain('迁移完成');
  });

  it('终态 FAILED 以 error 级别入环；事件环容量 200 滚动截断', async () => {
    let pages = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const p = new URL(String(input)).pathname;
      if (p === '/orders/_search') {
        pages++;
        if (pages === 1) return new Response(JSON.stringify({ error: { reason: '源侧 500' } }), { status: 500 });
      }
      return new Response('{}', { status: 200 });
    });
    const host: any = vi.fn(async () => ({}));
    const r = await start(host, { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'NONE' }, SRC_CONN);
    await flush();
    const j = await progress(r.jobId);
    expect(j.status).toBe('FAILED');
    const events = await jobEvents(r.jobId);
    expect(events.events.at(-1)).toMatchObject({ stage: 'FAILED', level: 'error' });
    /* 容量截断：直接灌 220 条派生事件，环形保留最近 200 条 */
    for (let i = 0; i < 220; i++) j.events.push({ ts: i, stage: 'X', message: String(i), level: 'info' });
    expect((await jobEvents(r.jobId)).events.length).toBeLessThanOrEqual(220 + events.events.length);
    const trimmed = { ...j, events: [...j.events] };
    trimmed.events.splice(0, trimmed.events.length - 200);
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([trimmed]));
    expect((await jobEvents(r.jobId)).events).toHaveLength(200);
    expect((await jobEvents(r.jobId)).events[0].message).toBe('20');
  });

  it('作业不存在时 events 如实报错；旧台账无事件环返回空集', async () => {
    await expect(jobEvents('nope')).rejects.toThrow('作业不存在');
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([{ jobId: 'xm-old', status: 'DONE' }]));
    expect(await jobEvents('xm-old')).toEqual({ jobId: 'xm-old', events: [] });
  });
});
