/* smart_sync mode=incremental 浏览器端全链（es_xmigrate 新参镜像批）：
 *   ① 五清单语义复刻 Java StructureSyncService：addedFields 源有目标无（矩阵降级照跑）、
 *      skippedConflicts 双侧都有但语义属性冲突（只报告不修）、updatedSettings 动态白名单
 *      差异、staticBlocked 静态差异只建议、addedAliases 源有目标无；
 *   ② apply=false 纯预览零写（executed 空、不发任何 PUT）；
 *   ③ apply=true 经 expectPlanDigest 漂移门后按序执行 PUT _mapping → PUT _settings →
 *      补别名（每步结果进 executed，任一步失败 verdict=FAILED）；
 *   ④ 目标索引不存在 → DEST_NOT_FOUND 同形；mode 非法 → BAD_REQUEST 拒绝；
 *   ⑤ MCP 组调用（handleMcpRequest）把 mode 透传到浏览器桥，出参带 mode=incremental。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { smartSync } from '../platform/browserXmigrate';
import { handleMcpRequest, setBrowserMcpWriteAllowed } from '../platform/browserMcp';
import { __resetBrowserProfilesForTests } from '../platform/browserProfiles';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const SRC_URL = 'http://src.local:9200';
const HOST_URL = 'http://es.local:9200';

/* 源（orders）：分片 5、refresh 1s、search.idle.after 30s（两键均为动态白名单键）、
 * 一个自定义静态键；mapping title(text)+status(keyword)；别名 orders_ro 与 new_alias */
const SRC_SETTINGS: Record<string, string> = {
  'index.number_of_shards': '5',
  'index.number_of_replicas': '1',
  'index.refresh_interval': '1s',
  'index.search.idle.after': '30s',
  'index.custom.private': 'keep-me',
};
function mockSourceFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const p = new URL(String(input)).pathname;
    if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
    if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
    if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
    if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { ...SRC_SETTINGS } } });
    if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: {
      title: { type: 'text' }, status: { type: 'keyword' },
    } } } });
    if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: { orders_ro: {}, new_alias: {} } } });
    throw new Error('unexpected source call: ' + p);
  });
}

/* 目标（orders-copy，已存在的既有索引）：title 已在但 type 冲突（text→keyword）、status 缺失
 * （新增字段样本）、分片 2≠5（静态差异样本）、refresh/idle.after 缺失（动态差异样本）、
 * 别名只有 orders_ro（new_alias 为补加样本） */
function incrementalHost(puts?: any[], aliases?: string[]) {
  return vi.fn(async (path: string, method = 'GET', body?: string) => {
    const route = path.split('?')[0];
    if (route === '/') return { version: { number: '7.17.10', distribution: 'default' } };
    if (route.startsWith('/_nodes/plugins')) return { nodes: {} };
    if (route.startsWith('/_cluster/health')) return { number_of_nodes: 2, number_of_data_nodes: 2 };
    if (route === '/orders-copy/_settings' && method === 'GET') {
      return { 'orders-copy': { settings: { 'index.number_of_shards': '2', 'index.number_of_replicas': '1' } } };
    }
    if (route === '/orders-copy/_mapping' && method === 'GET') {
      return { 'orders-copy': { mappings: { properties: { title: { type: 'keyword' } } } } };
    }
    if (route === '/orders-copy/_alias' && method === 'GET') {
      return { 'orders-copy': { aliases: Object.fromEntries((aliases ?? ['orders_ro']).map(a => [a, {}])) } };
    }
    if (method === 'PUT') {
      puts?.push({ path: route, body: JSON.parse(body || '{}') });
      return { acknowledged: true };
    }
    if (route === '/_aliases' && method === 'POST') {
      puts?.push({ path: route, body: JSON.parse(body || '{}') });
      return { acknowledged: true };
    }
    throw new Error('unexpected host call: ' + path + ' ' + method);
  });
}

const CONN = { scheme: 'http', host: 'src.local', port: 9200 };
const REQ = { conn: CONN, srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host-1' };

describe('smart_sync mode=incremental：五清单计划与预览零写', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('apply 缺省 false：五清单如实呈报，executed 空、一次 PUT 都不发', async () => {
    mockSourceFetch();
    const puts: any[] = [];
    const r = await smartSync(incrementalHost(puts), { ...REQ, mode: 'incremental' });
    expect(r.verdict).toBe('PLANNED');
    expect(r.mode).toBe('incremental');
    expect(r.applied).toBe(false);
    expect(r.rounds).toBe(0);
    expect(r.planDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(r.incremental.addedFields).toEqual([{ field: 'status', type: 'keyword' }]);
    expect(r.incremental.skippedConflicts).toEqual([{
      field: 'title', sourceType: 'text', targetType: 'keyword', detail: 'type: text -> keyword',
    }]);
    const updatedKeys = r.incremental.updatedSettings.map((s: any) => s.key);
    expect(updatedKeys).toContain('index.refresh_interval');
    expect(updatedKeys).toContain('index.search.idle.after');
    expect(r.incremental.staticBlocked.map((s: any) => s.key)).toEqual(['index.custom.private', 'index.number_of_shards']);
    expect(r.incremental.staticBlocked.find((s: any) => s.key === 'index.number_of_shards').reason)
      .toBe('静态设置无法在线更新，仅建议：如需对齐请重建索引或人工评估');
    expect(r.incremental.addedAliases).toEqual(['new_alias']);
    expect(r.executed).toEqual([]);
    expect(puts).toEqual([]);
    /* 计划体只含增量：mapping 增量只带新增字段子树；settings 增量为嵌套形态 */
    expect(r.body.mappings.properties.status).toEqual({ type: 'keyword' });
    expect(r.body.mappings.properties.title).toBeUndefined();
    expect(r.body.settings.index.refresh_interval).toBe('1s');
    expect(r.body.aliases).toEqual(['new_alias']);
    /* autoTune=true 只告警不动（分片是静态设置，与 Java incremental 同口径文案） */
    const tunedWarn = await smartSync(incrementalHost(), { ...REQ, mode: 'incremental', autoTune: true });
    expect(tunedWarn.autoTuned).toEqual([]);
    expect(tunedWarn.warnings.join()).toContain('incremental 模式不自动调整分片数');
  });

  it('apply=true 且摘要一致：按序 PUT _mapping → PUT _settings → 补别名，executed 全 200', async () => {
    mockSourceFetch();
    const previewPuts: any[] = [];
    const preview = await smartSync(incrementalHost(previewPuts), { ...REQ, mode: 'incremental' });
    mockSourceFetch();
    const puts: any[] = [];
    const r = await smartSync(incrementalHost(puts), {
      ...REQ, mode: 'incremental', apply: true, expectPlanDigest: preview.planDigest, syncAliases: true,
    });
    expect(r.verdict).toBe('APPLIED');
    expect(r.applied).toBe(true);
    expect(r.executed).toEqual([
      { step: 'put_mapping', status: 200, detail: 'acknowledged' },
      { step: 'put_settings', status: 200, detail: 'acknowledged' },
      { step: 'add_aliases', status: 200, detail: '1/1 个别名写成功' },
    ]);
    /* 执行序与请求体：mapping 增量（merge 语义）→ settings 动态键增量 → 别名 */
    expect(puts.map(p => p.path)).toEqual(['/orders-copy/_mapping', '/orders-copy/_settings', '/_aliases']);
    expect(puts[0].body.properties).toEqual({ status: { type: 'keyword' } });
    expect(puts[1].body.index.refresh_interval).toBe('1s');
    expect(puts[2].body.actions).toEqual([{ add: { index: 'orders-copy', alias: 'new_alias' } }]);
    expect(r.aliases.synced).toEqual(['new_alias']);
    expect(r.aliases.skipped).toEqual(['orders_ro']);
  });

  it('apply=true 携带过期 expectPlanDigest → PLAN_DRIFT 拒绝，零写；单步失败 → FAILED 且如实记录', async () => {
    mockSourceFetch();
    const puts: any[] = [];
    await expect(smartSync(incrementalHost(puts), {
      ...REQ, mode: 'incremental', apply: true, expectPlanDigest: 'deadbeefdeadbeef',
    })).rejects.toMatchObject({ code: 'PLAN_DRIFT' });
    expect(puts).toEqual([]);
    /* put_settings 失败：其余步骤照常尝试，verdict=FAILED + lastError */
    mockSourceFetch();
    const failingHost = incrementalHost(puts);
    failingHost.mockImplementation(async (path: string, method = 'GET', body?: string) => {
      if (path === '/orders-copy/_settings' && method === 'PUT') throw new Error('cluster read_only');
      return (incrementalHost(puts) as any).getMockImplementation()(path, method, body);
    });
    const failed = await smartSync(failingHost, { ...REQ, mode: 'incremental', apply: true, syncAliases: true });
    expect(failed.verdict).toBe('FAILED');
    expect(failed.applied).toBe(false);
    expect(failed.executed.find((e: any) => e.step === 'put_settings')).toEqual({
      step: 'put_settings', status: null, detail: 'cluster read_only',
    });
    expect(failed.lastError).toBe('增量执行存在失败步骤，详见 executed 与 warnings');
  });

  it('目标索引不存在 → DEST_NOT_FOUND 同形；mode 非法 → BAD_REQUEST 拒绝', async () => {
    mockSourceFetch();
    const missingHost = vi.fn(async () => { throw new Error('index_not_found_exception'); });
    await expect(smartSync(missingHost, { ...REQ, mode: 'incremental' }))
      .rejects.toMatchObject({ code: 'DEST_NOT_FOUND' });
    mockSourceFetch();
    await expect(smartSync(incrementalHost(), { ...REQ, mode: 'merge' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('mode 必须为 create 或 incremental') });
  });

  it('index.analysis 组件差异进 staticBlocked（组件名集合摘要），双侧一致不报', async () => {
    /* 源 settings 带 index.analysis 嵌套对象（filter.my_lower 引用内置 lowercase，矩阵不剔）；
     * 目标无 analysis → 与 Java 同口径报一条 staticBlocked（值给组件名集合摘要） */
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const p = new URL(String(input)).pathname;
      if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
      if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
      if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
      if (p.startsWith('/orders/_settings')) return json({ orders: { settings: {
        ...SRC_SETTINGS,
        'index.analysis': { filter: { my_lower: { type: 'lowercase' } } },
      } } });
      if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: {
        title: { type: 'text' }, status: { type: 'keyword' },
      } } } });
      if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
      throw new Error('unexpected source call: ' + p);
    });
    const r = await smartSync(incrementalHost(), { ...REQ, mode: 'incremental' });
    expect(r.incremental.staticBlocked).toEqual([
      {
        key: 'index.analysis', sourceValue: 'filter.my_lower', targetValue: null,
        reason: '静态设置无法在线更新，仅建议：如需对齐请重建索引或人工评估',
      },
      {
        key: 'index.custom.private', sourceValue: 'keep-me', targetValue: null,
        reason: '静态设置无法在线更新，仅建议：如需对齐请重建索引或人工评估',
      },
      {
        key: 'index.number_of_shards', sourceValue: '5', targetValue: '2',
        reason: '静态设置无法在线更新，仅建议：如需对齐请重建索引或人工评估',
      },
    ]);
    /* 目标带相同组件：双侧一致，index.analysis 不再呈报 */
    const sameAnalysisHost = vi.fn(async (path: string, method = 'GET', body?: string) => {
      const route = path.split('?')[0];
      if (route === '/orders-copy/_settings' && method === 'GET') {
        return { 'orders-copy': { settings: {
          'index.number_of_shards': '2', 'index.number_of_replicas': '1',
          'index.analysis': { filter: { my_lower: { type: 'lowercase' } } },
        } } };
      }
      return (incrementalHost() as any).getMockImplementation()(path, method, body);
    });
    const r2 = await smartSync(sameAnalysisHost, { ...REQ, mode: 'incremental' });
    expect(r2.incremental.staticBlocked.map((s: any) => s.key)).toEqual(['index.custom.private', 'index.number_of_shards']);
  });

  it('目标别名读取 404 只进 warnings 按空处理，不误报 DEST_NOT_FOUND', async () => {
    mockSourceFetch();
    const inner = incrementalHost();
    const alias404Host = vi.fn(async (path: string, method = 'GET', body?: string) => {
      if (path.split('?')[0] === '/orders-copy/_alias' && method === 'GET') {
        throw new Error('index_not_found_exception');
      }
      return inner(path, method, body);
    });
    const r = await smartSync(alias404Host, { ...REQ, mode: 'incremental' });
    expect(r.verdict).toBe('PLANNED');
    expect(r.warnings.join()).toContain('读取目标别名失败，别名清单按空处理');
    /* 目标别名按空：源别名全部计入 addedAliases */
    expect(r.incremental.addedAliases).toEqual(['orders_ro', 'new_alias']);
  });
});

describe('smart_sync mode=incremental：MCP 组调用透传', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetBrowserProfilesForTests();
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'src-1', name: 'src', url: SRC_URL },
      { id: 'host-1', name: 'host', url: HOST_URL },
    ]));
    localStorage.setItem('esquerystudio.browser.active', 'host-1');
    vi.restoreAllMocks();
    setBrowserMcpWriteAllowed(false);
  });
  afterEach(() => { vi.unstubAllGlobals(); setBrowserMcpWriteAllowed(false); });

  it('写门关闭时 mode=incremental 预览放行，出参带 mode=incremental 与五清单', async () => {
    vi.stubGlobal('fetch', async (input: any) => {
      const url = String(input);
      const p = new URL(url).pathname;
      if (url.startsWith(SRC_URL)) {
        if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
        if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
        if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
        if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { ...SRC_SETTINGS } } });
        if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
        if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
      }
      if (url.startsWith(HOST_URL)) {
        if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
        if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
        if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
        if (p === '/orders-copy/_settings') return json({ 'orders-copy': { settings: { 'index.number_of_shards': '2' } } });
        if (p === '/orders-copy/_mapping') return json({ 'orders-copy': { mappings: { properties: {} } } });
        if (p === '/orders-copy/_alias') return json({ 'orders-copy': { aliases: {} } });
      }
      throw new Error('unexpected call: ' + url);
    });
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'smart_sync', srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy', mode: 'incremental' } },
    });
    expect(out.result.isError).toBe(false);
    expect(out.result.structuredContent.mode).toBe('incremental');
    expect(out.result.structuredContent.incremental.addedFields).toEqual([{ field: 'title', type: 'text' }]);
  });
});
