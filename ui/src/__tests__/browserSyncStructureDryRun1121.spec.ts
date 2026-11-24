/* 2026-11-21 兼容计划批：sync_structure dryRun/syncAliases 语义——dryRun=true 只读
 * 预览（一次 PUT 都不发、reactive 全空、别名只列 skipped）、dryRun=false 走 planned
 * 预剔除 + reactive 兜底双层收敛、syncAliases=true 建成后别名随迁、报告 v3 顶层结构
 * （planDigest/body/destConnId 增量与 expectPlanDigest 漂移拒绝）。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncStructure } from '../platform/browserXmigrate';

const SRC_CONN = { scheme: 'http', host: 'src.local', port: 9200 };

function mockSyncSource() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const u = new URL(String(input));
    if (u.pathname === '/') return new Response(JSON.stringify({ version: { number: '7.10.2' } }), { status: 200 });
    if (u.pathname.startsWith('/_nodes/plugins')) return new Response(JSON.stringify({ nodes: {} }), { status: 200 });
    if (u.pathname.startsWith('/_cluster/health')) return new Response(JSON.stringify({ number_of_nodes: 2, number_of_data_nodes: 2 }), { status: 200 });
    if (u.pathname.startsWith('/orders/_settings')) return new Response(JSON.stringify({ orders: { settings: {
      'index.number_of_shards': '5',
      'index.apack.knn': 'true',
      'index.custom.private': 'x',
      'index.uuid': 'u-9',
      'index.creation_date': '1700000000000',
      'index.provided_name': 'orders',
      'index.version.created': '7100299',
      'index.analysis.tokenizer.ik_max_word.type': 'ik_max_word',
    } } }), { status: 200 });
    if (u.pathname.startsWith('/orders/_mapping')) return new Response(JSON.stringify({ orders: { mappings: {
      properties: { title: { type: 'text', analyzer: 'ik_max_word' } },
    } } }), { status: 200 });
    if (u.pathname.startsWith('/orders/_alias')) return new Response(JSON.stringify({ orders: { aliases: { orders_ro: {} } } }), { status: 200 });
    throw new Error('unexpected source call: ' + u.pathname);
  });
}

/* 目标宿主：无 ik 插件 → planned 预剔除 apack/ik；PUT 首轮拒 index.custom.private
 * （兼容矩阵覆盖不到的键）驱动 reactive 兜底，第二轮建成 */
function layeredHost(putBodies: any[], aliasCalls: any[]): any {
  let round = 0;
  return vi.fn(async (path: string, method = 'GET', body?: string) => {
    if (path === '/') return { version: { number: '8.13.0' } };
    if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
    if (path.startsWith('/_cluster/health')) return { number_of_nodes: 1, number_of_data_nodes: 1 };
    if (path === '/orders-copy' && method === 'PUT') {
      round++;
      putBodies.push(JSON.parse(body || '{}'));
      if (round === 1) {
        throw new Error(JSON.stringify({ error: { root_cause: [{ reason: 'unknown setting [index.custom.private]' }] } }));
      }
      return { acknowledged: true };
    }
    if (path === '/_aliases' && method === 'POST') {
      aliasCalls.push(JSON.parse(body || '{}'));
      return { acknowledged: true };
    }
    throw new Error('unexpected host call: ' + path);
  });
}

describe('sync_structure dryRun/syncAliases（2026-11-21 兼容计划批）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('dryRun=true 不发一次 PUT：报告 v2 结构完整、reactive 全空、别名只列 skipped', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const aliasCalls: any[] = [];
    const r = await syncStructure(layeredHost(putBodies, aliasCalls), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', dryRun: true, syncAliases: true,
    });
    expect(putBodies).toEqual([]);       // 一次 PUT 都不发
    expect(aliasCalls).toEqual([]);      // 别名随迁也不执行
    expect(r.created).toBe(false);
    expect(r.dryRun).toBe(true);
    expect(r.rounds).toBe(0);
    expect(r.destIndex).toBe('orders-copy');
    /* 报告 v3：v2 顶层（planned/reactive/aliases/advice/warnings/双侧能力）之上新增
     * planDigest/body/destConnId，不留旧字段（removedSettings/sourceVersion 等） */
    expect(Object.keys(r).sort()).toEqual(['advice', 'aliases', 'body', 'created', 'destConnId', 'destIndex', 'dryRun',
      'planDigest', 'planned', 'reactive', 'rounds', 'source', 'target', 'warnings'].sort());
    /* v3 增量：destConnId 未传如实 null；planDigest 为 16 hex；body 是适配后 create body
     * （apack/ik 分析段已剔，title.analyzer 已降级剔除，aliases 为源别名全集） */
    expect(r.destConnId).toBeNull();
    expect(r.planDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(r.body.settings.index.apack).toBeUndefined();
    expect(r.body.settings.index.analysis).toBeUndefined();
    expect(r.body.settings.index.number_of_shards).toBe('5');
    expect(r.body.mappings.properties.title).toEqual({ type: 'text', analyzer: 'standard' });
    expect(r.body.aliases).toEqual(['orders_ro']);
    expect(r.source).toMatchObject({ index: 'orders', version: '7.10.2', plugins: [] });
    expect(r.source.vendor).toMatchObject({ id: 'unknown', label: '未知' });
    expect(r.target.version).toBe('8.13.0');
    /* planned：兼容矩阵预剔除；reactive：预览阶段没有报错兜底 */
    expect(r.planned.removedSettings.map((s: any) => s.key)).toContain('index.apack.knn');
    expect(r.planned.removedAnalysis.map((a: any) => a.name)).toEqual(['ik_max_word']);
    expect(r.reactive).toEqual({ removedSettings: [], removedAnalysis: [], downgradedFields: [] });
    /* 分片建议（5 片 > 3×1）与别名计划（dryRun=true + syncAliases=true → 计划全同步：
     * synced=源别名全集、skipped=[]，守恒不破；不实际执行 _aliases） */
    expect(r.advice.map((a: any) => a.kind)).toContain('shards');
    expect(r.aliases).toEqual({ skipped: [], synced: ['orders_ro'] });
    expect(r.lastError).toBeUndefined();
  });

  it('dryRun=false 双层收敛：planned 预剔除 apack/ik，reactive 兜底剔 custom.private 后建成', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const aliasCalls: any[] = [];
    const r = await syncStructure(layeredHost(putBodies, aliasCalls), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy',
    });
    expect(r.created).toBe(true);
    expect(r.rounds).toBe(2);
    /* 第一轮 PUT：apack/ik 已被 planned 预剔除，只带着 custom.private 撞墙 */
    expect(putBodies[0].settings.index.apack).toBeUndefined();
    expect(putBodies[0].settings.index.analysis).toBeUndefined();
    expect(putBodies[0].settings.index.custom).toEqual({ private: 'x' });
    expect(putBodies[1].settings.index.custom).toBeUndefined();
    expect(r.planned.removedSettings.map((s: any) => s.key)).toEqual(['index.apack.knn']);
    expect(r.planned.downgradedFields.map((d: any) => [d.field, d.from, d.to]))
      .toEqual([['title', 'ik_max_word', 'standard']]);
    expect(r.reactive.removedSettings).toEqual([
      expect.objectContaining({ key: 'index.custom.private' }),
    ]);
    /* ik 降级发生在 planned（预剔除阶段），reactive 只兜底 custom.private 一项 */
    expect(r.reactive.downgradedFields).toEqual([]);
    /* syncAliases 缺省 false：别名只记 skipped，不执行 _aliases */
    expect(r.aliases).toEqual({ skipped: ['orders_ro'], synced: [] });
    expect(aliasCalls).toEqual([]);
  });

  it('syncAliases=true 建成后把源别名逐个加到目标索引', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const aliasCalls: any[] = [];
    const r = await syncStructure(layeredHost(putBodies, aliasCalls), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', syncAliases: true,
    });
    expect(r.aliases).toEqual({ skipped: [], synced: ['orders_ro'] });
    expect(aliasCalls).toEqual([{ actions: [{ add: { index: 'orders-copy', alias: 'orders_ro' } }] }]);
  });

  it('目标插件清单读取失败（受限账号）时跳过 plugin-analysis 预剔除并如实告警，不误删分析组件', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const host = vi.fn(async (path: string, method = 'GET', body?: string) => {
      if (path === '/') return { version: { number: '8.13.0' } };
      if (path.startsWith('/_nodes/plugins')) throw new Error('forbidden');
      if (path.startsWith('/_cluster/health')) throw new Error('forbidden');
      if (path === '/orders-copy' && method === 'PUT') {
        putBodies.push(JSON.parse(body || '{}'));
        return { acknowledged: true };
      }
      throw new Error('unexpected host call: ' + path);
    });
    const r = await syncStructure(host, { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', dryRun: true });
    expect(r.planned.removedAnalysis).toEqual([]); // 插件未知（null）→ 不按缺插件误删
    expect(r.warnings.join()).toContain('目标插件清单读取失败');
    expect(r.target.vendor.id).toBe('unknown'); // 厂商推断退化为 distribution 证据
    expect(r.target.plugins).toBeNull();        // 插件清单探测失败如实 null（pluginsReliable=false）
  });

  it('planDigest 同输入稳定：两次 dryRun 同值；destConnId 显式传入原样回显', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const r1 = await syncStructure(layeredHost(putBodies, []), { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', dryRun: true, destConnId: 'qa-1' });
    mockSyncSource();
    const r2 = await syncStructure(layeredHost(putBodies, []), { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', dryRun: true, destConnId: 'host' });
    expect(r1.planDigest).toBe(r2.planDigest); // canonical 输入一致 → 摘要一致
    expect(r1.destConnId).toBe('qa-1');
    expect(r2.destConnId).toBe('host');
  });

  it('expectPlanDigest 漂移拒绝：执行时摘要不一致直接拒绝（不 PUT）；dryRun=true 携带明确拒绝', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    await expect(syncStructure(layeredHost(putBodies, []), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy',
      expectPlanDigest: 'deadbeefdeadbeef',
    })).rejects.toThrow('计划摘要不匹配，拒绝执行');
    expect(putBodies).toEqual([]); // 计划漂移门在 PUT 之前，一次 PUT 都不发
    /* dryRun=true 带 expectPlanDigest：预览不存在计划漂移校验，明确拒绝 */
    mockSyncSource();
    await expect(syncStructure(layeredHost(putBodies, []), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy',
      dryRun: true, expectPlanDigest: 'deadbeefdeadbeef',
    })).rejects.toThrow('expectPlanDigest only valid with dryRun=false');
    /* 摘要一致（先 dryRun 取 planDigest 再执行）→ 正常建成 */
    mockSyncSource();
    const preview = await syncStructure(layeredHost(putBodies, []), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', dryRun: true,
    });
    mockSyncSource();
    const r = await syncStructure(layeredHost(putBodies, []), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', expectPlanDigest: preview.planDigest,
    });
    expect(r.created).toBe(true);
  });
});
