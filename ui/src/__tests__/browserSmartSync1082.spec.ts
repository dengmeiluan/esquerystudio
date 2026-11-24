/* 2026-11-22 智能同步批：smart_sync 浏览器端全链——
 *   ① REST 桥路由（browserApi xmigrateFetch）：destConnId 必填校验、非宿主/当前档案
 *      拒绝（文案与 sync-structure 同款）、destConnId=host 全链走通；
 *   ② 兼容矩阵两新规则：version-floor 地板表（目标版本低于地板剔、高于保留、版本未知不剔）
 *      与 store-type-vendor（hybridfs 目标厂商已知≠aliyun 剔、未知不剔记建议），
 *      planned 清单条目带 rule/reason 溯源；
 *   ③ autoTune 两态：分片数超目标数据节点数收敛 min(src,dn)、目标数据节点不可靠跳过加警告；
 *   ④ apply 写门与 MRTR 的参数感知豁免（apply=false 免写门/免二次确认，apply=true 维持）；
 *   ⑤ planDigest 形态（16 hex、同输入稳定）与 PLAN_DRIFT 拒绝落盘（不 PUT）。 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { smartSync } from '../platform/browserXmigrate';
import { browserFetch } from '../platform/browserApi';
import { __resetBrowserProfilesForTests } from '../platform/browserProfiles';
import { handleMcpRequest, setBrowserMcpWriteAllowed } from '../platform/browserMcp';

const SRC_URL = 'http://src.local:9200';
const HOST_URL = 'http://es.local:9200';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* 源集群桩：settings 带地板表三键 + hybridfs store + 5 分片；mapping 一个 text 字段；别名一个 */
const SRC_SETTINGS: Record<string, string> = {
  'index.number_of_shards': '5',
  'index.search.idle.after': '30s',
  'index.hidden': 'true',
  'index.final_pipeline': 'enrich-pipe',
  'index.store.type': 'hybridfs',
};
function mockSourceFetch(captured?: any[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const p = new URL(String(input)).pathname;
    if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
    if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
    if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 5, number_of_data_nodes: 5 });
    if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { ...SRC_SETTINGS } } });
    if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
    if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: { orders_ro: {} } } });
    throw new Error('unexpected source call: ' + p);
  });
}

/* 宿主桩（直调通道）：目标 7.6.0 + 开源自建（distribution=default → vendor=oss）+ 2 数据节点；
 * version=null 表示目标不带版本号（探测到集群但版本未知） */
function hostFn(opts: { version?: string | null; distribution?: string | null; dataNodes?: number | null; healthFails?: boolean } = {}, putBodies?: any[]) {
  return vi.fn(async (path: string, method = 'GET', body?: string) => {
    if (path === '/') {
      const version: any = {};
      if (opts.version !== null) version.number = opts.version ?? '7.6.0';
      if (opts.distribution !== null) version.distribution = opts.distribution ?? 'default';
      return { version };
    }
    if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
    if (path.startsWith('/_cluster/health')) {
      if (opts.healthFails) throw new Error('forbidden');
      return { number_of_nodes: 3, number_of_data_nodes: opts.dataNodes ?? 2 };
    }
    if (path === '/orders-copy' && method === 'PUT') {
      putBodies?.push(JSON.parse(body || '{}'));
      return { acknowledged: true };
    }
    if (path === '/_aliases' && method === 'POST') return { acknowledged: true };
    throw new Error('unexpected host call: ' + path);
  });
}

const SRC_CONN = { scheme: 'http', host: 'src.local', port: 9200 };

describe('smart_sync：兼容矩阵两新规则（version-floor / store-type-vendor）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('目标 7.6.0：index.hidden/final_pipeline 低于地板剔除（rule 溯源），idle.after 高于 7.0 保留；hybridfs 目标 oss 剔除', async () => {
    mockSourceFetch();
    const r = await smartSync(hostFn(), { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host' });
    expect(r.verdict).toBe('PLANNED');
    expect(r.applied).toBe(false);
    const byKey: Record<string, any> = {};
    for (const s of r.planned.removedSettings) byKey[s.key] = s;
    /* version-floor：7.6.0 < 7.7.0 / 7.12.0 两键剔，reason 注明地板版本 */
    expect(byKey['index.hidden'].rule).toBe('version-floor');
    expect(byKey['index.hidden'].reason).toBe('目标 7.6.0 低于该设置最低版本 7.7.0');
    expect(byKey['index.final_pipeline'].rule).toBe('version-floor');
    expect(byKey['index.final_pipeline'].reason).toBe('目标 7.6.0 低于该设置最低版本 7.12.0');
    /* idle.after 引入于 7.0.0，目标 7.6.0 不低于地板 → 保留（计划 body 在场） */
    expect(byKey['index.search.idle.after']).toBeUndefined();
    expect(r.body.settings.index['search'] || r.body.settings.index.search).toBeTruthy();
    /* store-type-vendor：hybridfs + 目标 oss → 剔除，reason 注明目标厂商 */
    expect(byKey['index.store.type'].rule).toBe('store-type-vendor');
    expect(byKey['index.store.type'].reason).toBe('hybridfs 为阿里云特有 store 类型，目标为 oss');
  });

  it('目标版本未知（version 缺失）：地板表不剔；厂商 unknown 时 hybridfs 不剔、记 store 建议', async () => {
    mockSourceFetch();
    const r = await smartSync(hostFn({ version: null, distribution: null }), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host',
    });
    const keys = r.planned.removedSettings.map((s: any) => s.key);
    expect(keys, '版本未知地板表不剔').not.toContain('index.hidden');
    expect(keys, '厂商未知 hybridfs 不剔').not.toContain('index.store.type');
    expect(keys).not.toContain('index.final_pipeline');
    /* 目标厂商 unknown → hybridfs 记 advice（留给目标报错兜底） */
    const storeAdvice = r.planned.advice.filter((a: any) => a.kind === 'store');
    expect(storeAdvice.length).toBe(1);
    expect(storeAdvice[0].message).toContain('hybridfs');
  });

  it('既有规则不受新规则影响：目标厂商已知≠aliyun 时 apack 键按 vendor-private 优先剔（一键一 reason）', async () => {
    const settings = { ...SRC_SETTINGS, 'index.apack.knn': 'true' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const p = new URL(String(input)).pathname;
      if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
      if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
      if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
      if (p.startsWith('/orders/_settings')) return json({ orders: { settings } });
      if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
      if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
      throw new Error('unexpected source call: ' + p);
    });
    const r = await smartSync(hostFn({ version: '8.13.0' }), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host',
    });
    const byKey: Record<string, any> = {};
    for (const s of r.planned.removedSettings) byKey[s.key] = s;
    /* 目标 vendor=oss 已知：vendor-private 按键归属优先判（apack 文案不再走，一键一 reason） */
    expect(byKey['index.apack.knn'].reason).toBe('vendor private setting (aliyun) not supported by target vendor oss');
    expect(byKey['index.apack.knn'].rule).toBe('vendor-private');
    /* 目标 8.13.0 高于全部地板、且 vendor 为 oss → store.type 仍被 store-type-vendor 剔 */
    expect(byKey['index.store.type'].rule).toBe('store-type-vendor');
    expect(r.planDigest).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('smart_sync：autoTune 两态', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('autoTune=true：源 5 片超过目标 2 数据节点 → 收敛 min(5,2)=2，autoTuned 带溯源', async () => {
    mockSourceFetch();
    const r = await smartSync(hostFn(), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', autoTune: true,
    });
    expect(r.autoTuned).toEqual([{
      key: 'index.number_of_shards', from: 5, to: 2,
      reason: expect.stringContaining('按目标数据节点数收敛为 2'),
    }]);
    expect(r.body.settings.index.number_of_shards).toBe('2');
  });

  it('autoTune=true 但目标数据节点不可靠（health 读取失败）：跳过收敛、分片原样、如实加警告', async () => {
    mockSourceFetch();
    const r = await smartSync(hostFn({ healthFails: true }), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', autoTune: true,
    });
    expect(r.autoTuned).toEqual([]);
    expect(r.body.settings.index.number_of_shards).toBe('5');
    expect(r.warnings.join()).toContain('目标数据节点数不可靠');
  });

  it('autoTune 缺省 false：分片 5 不收敛（无 autoTuned 清单动作）', async () => {
    mockSourceFetch();
    const r = await smartSync(hostFn(), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host',
    });
    expect(r.autoTuned).toEqual([]);
    expect(r.body.settings.index.number_of_shards).toBe('5');
  });
});

describe('smart_sync：planDigest 形态与 apply 落盘', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('digest 同输入稳定；apply=true 且摘要一致 → APPLIED（PUT 落盘、别名随迁）', async () => {
    mockSourceFetch();
    const r1 = await smartSync(hostFn(), { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host' });
    expect(r1.planDigest).toMatch(/^[0-9a-f]{16}$/);
    mockSourceFetch();
    const r2 = await smartSync(hostFn(), { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host' });
    expect(r2.planDigest).toBe(r1.planDigest);
    const putBodies: any[] = [];
    mockSourceFetch();
    const applied = await smartSync(hostFn({}, putBodies), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host',
      apply: true, expectPlanDigest: r1.planDigest, syncAliases: true,
    });
    expect(applied.verdict).toBe('APPLIED');
    expect(applied.applied).toBe(true);
    expect(putBodies).toHaveLength(1);
    expect(applied.body.aliases).toEqual(['orders_ro']);
  });

  it('apply=true 且 expectPlanDigest 不匹配 → 409 形态 PLAN_DRIFT 拒绝（与三端 sync_structure v3 同通道），一次 PUT 都不发', async () => {
    mockSourceFetch();
    const putBodies: any[] = [];
    await expect(smartSync(hostFn({}, putBodies), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host',
      apply: true, expectPlanDigest: 'deadbeefdeadbeef',
    })).rejects.toMatchObject({ code: 'PLAN_DRIFT' });
    expect(putBodies).toEqual([]);
  });

  it('apply=false 携带 expectPlanDigest 明确拒绝（仅 apply 合法）；destConnId 缺参如实报错', async () => {
    mockSourceFetch();
    await expect(smartSync(hostFn(), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host',
      expectPlanDigest: 'deadbeefdeadbeef',
    })).rejects.toThrow('expectPlanDigest only valid with apply=true');
    await expect(smartSync(hostFn(), { conn: SRC_CONN, sourceIndex: 'orders' }))
      .rejects.toThrow('destConnId 不能为空');
  });
});

describe('smart_sync：REST 桥路由（browserApi xmigrateFetch）', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetBrowserProfilesForTests();
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'src-1', name: 'src', url: SRC_URL },
      { id: 'host-1', name: 'host', url: HOST_URL },
    ]));
    localStorage.setItem('esquerystudio.browser.active', 'host-1');
    vi.restoreAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('destConnId 缺省 → 400（必填校验）；非宿主/当前档案 → 400 同款文案', async () => {
    const resp = await browserFetch('/internal/es/xmigrate/smart-sync', {
      method: 'POST',
      body: JSON.stringify({ srcConnId: 'src-1', sourceIndex: 'orders' }),
    });
    expect(resp.status).toBe(400);
    expect((await resp.json()).message).toContain('destConnId 不能为空');
    const resp2 = await browserFetch('/internal/es/xmigrate/smart-sync', {
      method: 'POST',
      body: JSON.stringify({ srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'other-9' }),
    });
    expect(resp2.status).toBe(400);
    expect((await resp2.json()).message).toBe('浏览器模式目标侧只能是当前激活连接（destConnId 传 host 或当前档案 id），实际: other-9；请先在顶栏切换目标连接');
  });

  it('destConnId=host 全链走通：源直连探测 + 宿主探测 + 兼容整形 → verdict PLANNED 且 destConnId 回显', async () => {
    vi.stubGlobal('fetch', async (input: any) => {
      const url = String(input);
      const p = new URL(url).pathname;
      if (url.startsWith(SRC_URL)) {
        if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
        if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
        if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 5, number_of_data_nodes: 5 });
        if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { ...SRC_SETTINGS } } });
        if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
        if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
      }
      if (url.startsWith(HOST_URL)) {
        if (p === '/') return json({ version: { number: '7.6.0', distribution: 'default' } });
        if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
        if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 3, number_of_data_nodes: 2 });
      }
      throw new Error('unexpected call: ' + url);
    });
    const resp = await browserFetch('/internal/es/xmigrate/smart-sync', {
      method: 'POST',
      body: JSON.stringify({ srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host', autoTune: true }),
    });
    expect(resp.status).toBe(200);
    const r = await resp.json();
    expect(r.verdict).toBe('PLANNED');
    expect(r.destConnId).toBe('host');
    expect(r.autoTuned.map((a: any) => a.to)).toEqual([2]);
    expect(r.planned.removedSettings.map((s: any) => s.key)).toContain('index.hidden');
  });
});

describe('smart_sync：MCP 写门与 MRTR 的 apply 参数感知', () => {
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

  function fullChainStub(): void {
    vi.stubGlobal('fetch', async (input: any) => {
      const url = String(input);
      const p = new URL(url).pathname;
      if (url.startsWith(SRC_URL)) {
        if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
        if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
        if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 5, number_of_data_nodes: 5 });
        if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { 'index.number_of_shards': '5' } } });
        if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
        if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
      }
      if (url.startsWith(HOST_URL)) {
        if (p === '/') return json({ version: { number: '8.13.0', distribution: 'default' } });
        if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
        if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 3, number_of_data_nodes: 2 });
      }
      throw new Error('unexpected call: ' + url);
    });
  }

  it('写门关闭时 apply=false 只读预览放行（es_xmigrate action=smart_sync 全链 PLANNED）', async () => {
    fullChainStub();
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 91, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'smart_sync', srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host' } },
    });
    expect(out.result.isError).toBe(false);
    const data = JSON.parse(out.result.content[0].text);
    expect(data.verdict).toBe('PLANNED');
  });

  it('写门关闭时 apply=true 维持写门拒绝', async () => {
    fullChainStub();
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 92, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'smart_sync', srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', apply: true } },
    });
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('页面内写工具未启用');
  });

  it('写门开启：apply=true 进 MRTR 二次确认（input_required），apply=false 不进', async () => {
    setBrowserMcpWriteAllowed(true);
    fullChainStub();
    const meta = { 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} } };
    const gated = await handleMcpRequest({
      jsonrpc: '2.0', id: 93, method: 'tools/call', _meta: meta,
      params: { name: 'es_xmigrate', arguments: { action: 'smart_sync', srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', apply: true } },
    });
    expect(gated.result.resultType).toBe('input_required');
    expect(gated.result.inputRequests.confirm.method).toBe('elicitation/create');
    const preview = await handleMcpRequest({
      jsonrpc: '2.0', id: 94, method: 'tools/call', _meta: meta,
      params: { name: 'es_xmigrate', arguments: { action: 'smart_sync', srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host' } },
    });
    expect(preview.result.resultType, 'apply=false 只读预览不进二次确认').not.toBe('input_required');
    expect(JSON.parse(preview.result.content[0].text).verdict).toBe('PLANNED');
  });
});
