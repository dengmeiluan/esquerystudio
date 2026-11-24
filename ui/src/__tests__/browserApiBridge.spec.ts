import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserFetch } from '../platform/browserApi';
import { __resetBrowserProfilesForTests } from '../platform/browserProfiles';

const base = 'http://es.local:9200';

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('browserApi bridge', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetBrowserProfilesForTests();
    localStorage.setItem('esquerystudio.browser.profile', JSON.stringify({ url: base }));
    vi.restoreAllMocks();
  });

  it('cluster indices 过滤系统索引并按名排序', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([
      { index: 'b' }, { index: '.security' }, { index: 'a' },
    ]));
    const r = await browserFetch('/internal/es/index/cluster/indices');
    expect(await r.json()).toEqual([{ index: 'a' }, { index: 'b' }]);
    expect(String(spy.mock.calls[0][0])).toContain('/_cat/indices');
  });

  it('服务端独占端点返回有原因的 BROWSER_MODE_SERVER_ONLY，而不是静默或泛化 501', async () => {
    const r = await browserFetch('/internal/es/index/rebuild-empty', { method: 'POST' });
    expect(r.status).toBe(501);
    const body = await r.json();
    expect(body.code).toBe('BROWSER_MODE_SERVER_ONLY');
    expect(body.message).toContain('provider');
  });

  it('tasks 平铺 nodes/tasks 并换算 tookMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      nodes: { n1: { name: 'node-1', tasks: { 'n1:1': { action: 'x', running_time_in_nanos: 5_000_000, cancellable: true } } } },
    }));
    const r = await browserFetch('/internal/es/index/cluster/tasks?detailed=true');
    expect(await r.json()).toEqual([expect.objectContaining({ taskId: 'n1:1', node: 'node-1', tookMs: 5, cancellable: true })]);
  });

  it('templates 合并 index/component 两棵清单', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ index_templates: [{ name: 'i' }] }))
      .mockResolvedValueOnce(json({ component_templates: [{ name: 'c' }] }));
    const r = await browserFetch('/internal/es/index/cluster/templates');
    expect(await r.json()).toMatchObject({ index_templates: [{ name: 'i' }], component_templates: [{ name: 'c' }] });
  });

  it('文档写入使用 PUT _doc，删除使用 DELETE', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ result: 'updated' }));
    await browserFetch('/internal/es/index/cluster/doc?index=logs&id=1', { method: 'POST', body: '{"a":1}' });
    expect(spy.mock.calls[0][1]?.method).toBe('PUT');
    await browserFetch('/internal/es/index/cluster/delete-by-id?index=logs&id=1', { method: 'POST' });
    expect(spy.mock.calls[1][1]?.method).toBe('DELETE');
  });

  it('SQL cursor 从查询串组装续页 body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ rows: [] }));
    await browserFetch('/internal/es/index/cluster/sql/cursor?cursor=abc&timeZone=Asia%2FShanghai', { method: 'POST' });
    const init = spy.mock.calls[0][1]!;
    expect(String(init.body)).toContain('"cursor":"abc"');
    expect(String(init.body)).toContain('"time_zone":"Asia/Shanghai"');
  });

  it('配置校验：未知字段类型报错，dry-run 建临时索引后清理', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ acknowledged: true }));
    const bad = await browserFetch('/internal/es/index/config-lab/validate', {
      method: 'POST', body: JSON.stringify({ mapping: JSON.stringify({ properties: { a: { type: 'nope' } } }), dryRun: false }),
    });
    expect((await bad.json()).issues.some((i: any) => i.code === 'UNKNOWN_FIELD_TYPE')).toBe(true);

    const ok = await browserFetch('/internal/es/index/config-lab/validate', {
      method: 'POST', body: JSON.stringify({ settings: '{"refresh_interval":"1s"}', mapping: '{"properties":{"a":{"type":"keyword"}}}', dryRun: true }),
    });
    const report = await ok.json();
    expect(report).toMatchObject({ valid: true, dryRunExecuted: true, dryRunPassed: true });
    const methods = spy.mock.calls.map(c => c[1]?.method);
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('progress 映射 ES task status 为 ReindexProgress；任务消失按完成处理', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({
      completed: false,
      task: { status: { total: 10, created: 3, updated: 1, deleted: 0, version_conflicts: 2 } },
    }));
    const running = await browserFetch('/internal/es/index/progress?taskId=n1%3A9');
    expect(await running.json()).toMatchObject({
      completed: false, status: 'RUNNING', total: 10, created: 3, updated: 1, versionConflicts: 2,
    });
    expect(String(spy.mock.calls[0][0])).toContain('/_tasks/n1%3A9');

    spy.mockResolvedValueOnce(json({ error: { type: 'resource_not_found_exception' } }, 404));
    const gone = await browserFetch('/internal/es/index/progress?taskId=n1%3A10');
    expect(await gone.json()).toMatchObject({ completed: true, status: 'COMPLETED' });
  });

  it('SQL bridge 保留数组与 boolean 原始值（不把数组压成首值）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      columns: [
        { name: 'vel1CodeArray', type: 'long' },
        { name: 'international', type: 'boolean' },
      ],
      rows: [[[410000, 270000], 0]],
    }));
    const r = await browserFetch('/internal/es/index/cluster/sql/query', {
      method: 'POST', body: JSON.stringify({ query: 'SELECT * FROM demo' }),
    });
    const body = await r.json();
    expect(body.rows[0][0]).toEqual([410000, 270000]);
    expect(body.rows[0][1]).toBe(0);
    expect(body.columns.map((c: any) => c.type)).toEqual(['long', 'boolean']);
  });

  it('连接档案：可保存多条，探活返回 ConnHealth 契约（GREEN/latency/lastProbeAt）', async () => {
    /* 本用例从空白档案开始（beforeEach 的旧单档留给其余窄用例做迁移覆盖）。 */
    localStorage.removeItem('esquerystudio.browser.profile');
    __resetBrowserProfilesForTests();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      cluster_name: 'demo', version: { number: '7.10.2' }, number_of_nodes: 3,
    }));
    const a = await (await browserFetch('/internal/es/index/clusters/save', {
      method: 'POST', body: JSON.stringify({ name: 'A', url: 'http://es-a:9200' }),
    })).json();
    const b = await (await browserFetch('/internal/es/index/clusters/save', {
      method: 'POST', body: JSON.stringify({ name: 'B', url: 'http://es-b:9200', authType: 'API_KEY', password: 'k' }),
    })).json();
    expect(a.id).toBeTruthy();
    expect(b.id).not.toBe(a.id);

    const list = await (await browserFetch('/internal/es/index/clusters')).json();
    expect(list).toHaveLength(2);
    expect(list.map((x: any) => x.name)).toEqual(['A', 'B']);

    const probe = await (await browserFetch(`/internal/es/index/clusters/${a.id}/probe`)).json();
    expect(probe).toMatchObject({ status: 'GREEN', error: null, nodes: 3 });
    expect(typeof probe.latencyMs).toBe('number');
    expect(typeof probe.lastProbeAt).toBe('number');
  });

  it('insight 护栏：estimate 发 token，execute 走同一设置写端点', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: RequestInit) => {
      const p = new URL(String(input)).pathname;
      if (p.endsWith('/_settings') && init?.method === 'PUT') return json({ acknowledged: true });
      return json({});
    });
    const params = { index: 'logs', changes: { refresh_interval: '30s' } };
    const est = await browserFetch('/internal/es/index/insight/actions/apply-index-settings/estimate', {
      method: 'POST', body: JSON.stringify(params),
    });
    const estimate = await est.json();
    expect(estimate).toMatchObject({ riskLevel: 'MEDIUM', supportsDryRun: true });
    expect(estimate.confirmToken).toBeTruthy();
    expect(estimate.analysis.items[0].kind).toBe('DYNAMIC');

    const done = await browserFetch('/internal/es/index/insight/actions/apply-index-settings/execute', {
      method: 'POST', body: JSON.stringify({ params, confirmToken: estimate.confirmToken }),
    });
    expect(done.status).toBe(200);
    const receipt = await done.json();
    expect(receipt.receiptId).toBeTruthy();
    expect(spy.mock.calls.some(c => {
      const p = new URL(String(c[0])).pathname;
      return p === '/logs/_settings' && c[1]?.method === 'PUT';
    })).toBe(true);
  });
});
