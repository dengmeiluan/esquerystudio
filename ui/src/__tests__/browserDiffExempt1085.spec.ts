/* diff_structure 豁免回传（autoTunedShards/removedKeys）浏览器端语义（es_xmigrate 新参镜像批）：
 *   ① autoTunedShards=上次收敛值：index.number_of_shards 的 onlyInSource/valueChanged 差异
 *      按计划内豁免进 expectedRemovals（reason「autoTune 分片收敛(计划改写)」，与 Java 逐字）；
 *   ② removedKeys=上次计划内剔除/变更键：命中 onlyInSource 差异豁免
 *      （reason「上次同步计划内变更」）；valueChanged 不吃 removedKeys（与 Java 同口径）；
 *   ③ 参数校验：非正数/非字符串数组/空元素如实拒绝（BAD_REQUEST）；
 *   ④ MCP 组调用把豁免参数透传到浏览器桥，复检不再被自己的计划内优化误报。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diffStructure } from '../platform/browserXmigrate';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* 源（orders）：分片 5、refresh 1s、一个计划剔除键；mapping 单字段 */
const SRC_SETTINGS: Record<string, string> = {
  'index.number_of_shards': '5',
  'index.number_of_replicas': '1',
  'index.refresh_interval': '1s',
  'index.custom.private': 'x',
};
function mockSourceFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const p = new URL(String(input)).pathname;
    if (p === '/') return json({ version: { number: '7.17.10', distribution: 'default' } });
    if (p.startsWith('/_nodes/plugins')) return json({ nodes: {} });
    if (p.startsWith('/_cluster/health')) return json({ number_of_nodes: 2, number_of_data_nodes: 2 });
    if (p.startsWith('/orders/_settings')) return json({ orders: { settings: { ...SRC_SETTINGS } } });
    if (p.startsWith('/orders/_mapping')) return json({ orders: { mappings: { properties: { title: { type: 'text' } } } } });
    if (p.startsWith('/orders/_alias')) return json({ orders: { aliases: {} } });
    throw new Error('unexpected source call: ' + p);
  });
}

/* 目标（orders-copy）：分片收敛为 2（autoTune 样本）、refresh/custom 缺失（计划剔除样本） */
function diffHost() {
  return vi.fn(async (path: string) => {
    const route = path.split('?')[0];
    if (route === '/') return { version: { number: '7.17.10', distribution: 'default' } };
    if (route.startsWith('/_nodes/plugins')) return { nodes: {} };
    if (route.startsWith('/_cluster/health')) return { number_of_nodes: 2, number_of_data_nodes: 2 };
    if (route === '/orders-copy/_settings') {
      return { 'orders-copy': { settings: { 'index.number_of_shards': '2', 'index.number_of_replicas': '1' } } };
    }
    if (route === '/orders-copy/_mapping') {
      return { 'orders-copy': { mappings: { properties: { title: { type: 'text' } } } } };
    }
    throw new Error('unexpected host call: ' + path);
  });
}

const CONN = { scheme: 'http', host: 'src.local', port: 9200 };
const REQ = { conn: CONN, srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', destConnId: null };

describe('diff_structure：豁免回传 autoTunedShards/removedKeys', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('无豁免基线：分片差异与源独有键都进 unexpected，compatible=false', async () => {
    mockSourceFetch();
    const r = await diffStructure(diffHost(), { ...REQ });
    const keys = r.unexpected.map((u: any) => u.key);
    expect(keys).toContain('index.number_of_shards');
    expect(keys).toContain('index.refresh_interval');
    expect(keys).toContain('index.custom.private');
    expect(r.compatible).toBe(false);
  });

  it('autoTunedShards+removedKeys 回传：计划内差异全部进 expectedRemovals，unexpected 清零', async () => {
    mockSourceFetch();
    const r = await diffStructure(diffHost(), {
      ...REQ, autoTunedShards: 2, removedKeys: ['index.refresh_interval', 'index.custom.private'],
    });
    expect(r.unexpected).toEqual([]);
    expect(r.compatible).toBe(true);
    expect(r.expectedRemovals.find((e: any) => e.key === 'index.number_of_shards'))
      .toEqual({ area: 'settings', key: 'index.number_of_shards', reason: 'autoTune 分片收敛(计划改写)' });
    expect(r.expectedRemovals.find((e: any) => e.key === 'index.refresh_interval').reason)
      .toBe('上次同步计划内变更');
    expect(r.expectedRemovals.find((e: any) => e.key === 'index.custom.private').reason)
      .toBe('上次同步计划内变更');
  });

  it('removedKeys 只豁免 onlyInSource：分片 valueChanged 不吃 removedKeys（仍需 autoTunedShards）', async () => {
    mockSourceFetch();
    const r = await diffStructure(diffHost(), {
      ...REQ, removedKeys: ['index.number_of_shards', 'index.refresh_interval', 'index.custom.private'],
    });
    /* 分片两侧都在（5 vs 2）属 valueChanged：removedKeys 命中不了，仍按计划外报告 */
    expect(r.unexpected.map((u: any) => u.key)).toEqual(['index.number_of_shards']);
    expect(r.compatible).toBe(false);
    expect(r.expectedRemovals.find((e: any) => e.key === 'index.number_of_shards')).toBeUndefined();
  });

  it('参数校验：非正数/非字符串数组/空元素如实拒绝（BAD_REQUEST）', async () => {
    mockSourceFetch();
    await expect(diffStructure(diffHost(), { ...REQ, autoTunedShards: 0 }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('autoTunedShards 需为正整数') });
    mockSourceFetch();
    await expect(diffStructure(diffHost(), { ...REQ, autoTunedShards: 2.5 }))
      .rejects.toThrow('autoTunedShards 需为正整数');
    mockSourceFetch();
    await expect(diffStructure(diffHost(), { ...REQ, removedKeys: 'index.refresh_interval' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('removedKeys 需为字符串数组') });
    mockSourceFetch();
    await expect(diffStructure(diffHost(), { ...REQ, removedKeys: [''] }))
      .rejects.toThrow('removedKeys 数组元素必须为非空字符串');
    /* 空数组视同缺省（与 Java optionalNonEmptyStringList 同口径） */
    mockSourceFetch();
    const empty = await diffStructure(diffHost(), { ...REQ, removedKeys: [] });
    expect(empty.unexpected.map((u: any) => u.key)).toContain('index.refresh_interval');
  });
});
