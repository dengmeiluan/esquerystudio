/* verify_equivalence structureOnly 浏览器端语义（es_xmigrate 新参镜像批）：
 *   ① 双侧 settings/mappings canonical（键全层排序）SHA-256 前 16 hex 摘要对比，
 *      完全一致 → EQUIVALENT（differences 空、digest 相等）；
 *   ② 结构不同 → DIVERGENT：差异清单逐键呈报（settings 平铺键 + mapping 字段路径，
 *      ≤20 条 + truncated 标记），structuresMatch=false；
 *   ③ 任一侧读取失败（含索引不存在）→ INCONCLUSIVE（摘要 null 如实回显，不冒充）；
 *   ④ structureOnly 跳过 count/mget/agg（不发任何 _count/_search/_mget 请求）；
 *      非布尔值如实拒绝（BAD_REQUEST）；
 *   ⑤ MCP 组调用把 structureOnly 透传到浏览器桥。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyEquivalence } from '../platform/browserXmigrate';
import { handleMcpRequest, setBrowserMcpWriteAllowed } from '../platform/browserMcp';
import { __resetBrowserProfilesForTests } from '../platform/browserProfiles';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const SRC_URL = 'http://src.local:9200';
const HOST_URL = 'http://es.local:9200';
const MAPPING = { properties: { title: { type: 'text' }, created: { type: 'date' } } };

function srcSettings(extra: Record<string, string> = {}): Record<string, string> {
  return { 'index.number_of_shards': '5', 'index.number_of_replicas': '1', 'index.refresh_interval': '1s', ...extra };
}
function mockSourceFetch(settings: Record<string, string>, mapping = MAPPING) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const p = new URL(String(input)).pathname;
    if (p.startsWith('/orders/_settings')) return json({ orders: { settings } });
    if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: mapping } });
    throw new Error('unexpected source call: ' + p);
  });
}
function structureHost(settings: Record<string, string>, mapping = MAPPING, calls?: string[]) {
  return vi.fn(async (path: string) => {
    const route = path.split('?')[0];
    calls?.push(route);
    if (route === '/orders-copy/_settings') return { 'orders-copy': { settings } };
    if (route === '/orders-copy/_mapping') return { 'orders-copy': { mappings: mapping } };
    throw new Error('unexpected host call: ' + path);
  });
}

const CONN = { scheme: 'http', host: 'src.local', port: 9200 };
const REQ = { conn: CONN, srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: 'host-1' };

describe('verify_equivalence structureOnly：纯结构摘要对比', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('双侧结构一致 → EQUIVALENT（digest 相等、differences 空、truncated false）', async () => {
    const calls: string[] = [];
    mockSourceFetch(srcSettings());
    const r = await verifyEquivalence(structureHost(srcSettings(), MAPPING, calls), { ...REQ, structureOnly: true });
    expect(r.structureOnly).toBe(true);
    expect(r.verdict).toBe('EQUIVALENT');
    expect(r.structuresMatch).toBe(true);
    expect(r.source.structureDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(r.dest.structureDigest).toBe(r.source.structureDigest);
    expect(r.differences).toEqual([]);
    expect(r.truncated).toBe(false);
    /* 纯结构模式跳过 count/mget/agg：只读双侧 settings/mapping 四次 */
    expect(calls).toEqual(['/orders-copy/_settings', '/orders-copy/_mapping']);
  });

  it('结构不同 → DIVERGENT：settings 平铺键 + mapping 字段路径逐键呈报', async () => {
    mockSourceFetch(srcSettings());
    const r = await verifyEquivalence(structureHost(
      { 'index.number_of_shards': '5', 'index.number_of_replicas': '2', 'index.refresh_interval': '1s' },
      { properties: { title: { type: 'keyword' }, created: { type: 'date' } } },
    ), { ...REQ, structureOnly: true });
    expect(r.verdict).toBe('DIVERGENT');
    expect(r.structuresMatch).toBe(false);
    expect(r.differences).toContain('settings.index.number_of_replicas');
    expect(r.differences).toContain('mappings.title');
    expect(r.truncated).toBe(false);
  });

  it('差异键超过 20 → 截断至 20 条并置 truncated（≤20+truncated 契约）', async () => {
    const extra: Record<string, string> = {};
    for (let i = 0; i < 25; i++) extra['index.custom.key' + i] = String(i);
    mockSourceFetch(srcSettings(extra));
    const r = await verifyEquivalence(structureHost(srcSettings()), { ...REQ, structureOnly: true });
    expect(r.verdict).toBe('DIVERGENT');
    expect(r.differences).toHaveLength(20);
    expect(r.truncated).toBe(true);
    expect(r.differences.every((d: string) => d.startsWith('settings.'))).toBe(true);
  });

  it('目标索引不存在 → INCONCLUSIVE（digest null 如实回显，不冒充等价/分化）', async () => {
    mockSourceFetch(srcSettings());
    const missing = vi.fn(async (path: string) => {
      if (path.split('?')[0] === '/orders-copy/_settings') throw new Error('index_not_found_exception');
      throw new Error('unexpected host call: ' + path);
    });
    const r = await verifyEquivalence(missing, { ...REQ, structureOnly: true });
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(r.structuresMatch).toBe(null);
    expect(r.dest.structureDigest).toBe(null);
    expect(r.warnings.join()).toContain('目标索引结构读取失败');
  });

  it('structureOnly 非布尔值如实拒绝（BAD_REQUEST）；jobId 与 srcConnId 缺一仍报错', async () => {
    mockSourceFetch(srcSettings());
    await expect(verifyEquivalence(structureHost(srcSettings()), { ...REQ, structureOnly: 'yes' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('structureOnly 需为布尔值') });
    await expect(verifyEquivalence(structureHost(srcSettings()), {}))
      .rejects.toThrow('jobId 与 srcConnId 必须二选一');
  });
});

describe('verify_equivalence structureOnly：MCP 组调用透传', () => {
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

  it('structureOnly=true 全链走纯结构对比，出参带 structureOnly 三态报告', async () => {
    vi.stubGlobal('fetch', async (input: any) => {
      const url = String(input);
      const p = new URL(url).pathname;
      if (url.startsWith(SRC_URL)) {
        if (p.startsWith('/orders/_settings')) return json({ orders: { settings: srcSettings() } });
        if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: MAPPING } });
      }
      if (url.startsWith(HOST_URL)) {
        if (p === '/orders-copy/_settings') return json({ 'orders-copy': { settings: srcSettings() } });
        if (p === '/orders-copy/_mapping') return json({ 'orders-copy': { mappings: MAPPING } });
      }
      throw new Error('unexpected call: ' + url);
    });
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'verify_equivalence', srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-copy', structureOnly: true } },
    });
    expect(out.result.isError).toBe(false);
    expect(out.result.structuredContent.structureOnly).toBe(true);
    expect(out.result.structuredContent.verdict).toBe('EQUIVALENT');
  });
});
