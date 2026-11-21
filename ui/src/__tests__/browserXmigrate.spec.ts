import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectCheck, fetchConfig, preflight, progress, resume, start, listJobs, syncStructure } from '../platform/browserXmigrate';

const SRC_CONN = { scheme: 'http', host: 'src.local', port: 9200 };
const JOBS_KEY = 'esquerystudio.xmigrate.jobs';
const flush = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

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
    const r = await start(host, { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'NONE', batchSize: 100 }, SRC_CONN);
    await flush(20);
    const jobs = await listJobs(host, 10);
    expect(jobs[0].jobId).toBe(r.jobId);
    expect(jobs[0].migrated).toBe(1);
    expect(jobs[0].status).toBe('DONE');
  });
});

/* sliced scroll 并行搬运：每路独立游标循环，计数聚合到同一作业 */
describe('xmigrate sliced parallel migration', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  function mockSlicedSource() {
    const searchBodies: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const p = new URL(String(input)).pathname;
      const method = String(init?.method || 'GET').toUpperCase();
      if (p === '/orders/_search') {
        const body = JSON.parse(String(init?.body || '{}'));
        searchBodies.push(body);
        const id = Number(body?.slice?.id ?? 0);
        return new Response(JSON.stringify({
          _scroll_id: 'sl-' + id,
          hits: { total: { value: 2 }, hits: [{ _id: id + '-a', _source: { id } }, { _id: id + '-b', _source: { id } }] },
        }), { status: 200 });
      }
      if (p === '/_search/scroll' && method === 'POST') {
        return new Response(JSON.stringify({ _scroll_id: 'x', hits: { total: { value: 2 }, hits: [] } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    return searchBodies;
  }
  function bulkAwareHost(bulkBatches: number[]): any {
    return vi.fn(async (path: string, _method?: string, body?: string) => {
      if (path.startsWith('/_bulk')) {
        const docs = String(body || '').split('\n').filter(Boolean).length / 2;
        bulkBatches.push(docs);
        return { items: Array.from({ length: docs }, () => ({ create: { status: 201 } })) };
      }
      return {};
    });
  }

  it('slices=2 时每路起始查询带 slice:{id,max}，两路计数聚合', async () => {
    const searchBodies = mockSlicedSource();
    const bulkBatches: number[] = [];
    const setItem = vi.spyOn(localStorage, 'setItem');
    const r = await start(bulkAwareHost(bulkBatches), { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'NONE', batchSize: 100, slices: 2 }, SRC_CONN);
    await flush();
    const j = await progress(r.jobId);
    expect(j.status).toBe('DONE');
    expect(j.slices).toBe(2);
    expect(j.migrated).toBe(4);
    expect(j.total).toBe(4); // 各 slice 首页 hits.total 只报自己那份，求和为全局
    const sliceBodies = searchBodies.filter(b => b.slice);
    expect(sliceBodies.map(b => b.slice.id).sort()).toEqual([0, 1]);
    expect(sliceBodies.every(b => b.slice.max === 2)).toBe(true);
    expect(bulkBatches.slice().sort((a, b) => a - b)).toEqual([2, 2]);
    /* 台账写节流：两路各一次 bulk 进度写合并进同一 500ms 窗口，
       总写入次数 ≤ 启动 + 准备 + 一个进度窗 + 终态 */
    const ledgerWrites = setItem.mock.calls.filter(c => String(c[0]) === JOBS_KEY).length;
    expect(ledgerWrites).toBeLessThanOrEqual(4);
  });

  it('浏览器并行路数封顶 4：请求 9 路压到 4', async () => {
    const searchBodies = mockSlicedSource();
    const bulkBatches: number[] = [];
    const r = await start(bulkAwareHost(bulkBatches), { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'NONE', batchSize: 100, slices: 9 }, SRC_CONN);
    await flush();
    const j = await progress(r.jobId);
    expect(j.slices).toBe(4);
    expect(j.migrated).toBe(8); // 4 路 × 每路 2 条
    expect(searchBodies.filter(b => b.slice).every(b => b.slice.max === 4)).toBe(true);
  });

  it('某 slice 源侧请求失败时作业落 FAILED 终态并带原始错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const p = new URL(String(input)).pathname;
      if (p === '/orders/_search') {
        const body = JSON.parse(String(init?.body || '{}'));
        if (Number(body?.slice?.id) === 1) return new Response(JSON.stringify({ error: { reason: 'slice-1 爆了' } }), { status: 500 });
        return new Response(JSON.stringify({ _scroll_id: 'ok-0', hits: { total: { value: 1 }, hits: [{ _id: 'a', _source: { id: 0 } }] } }), { status: 200 });
      }
      if (p === '/_search/scroll') return new Response(JSON.stringify({ _scroll_id: 'x', hits: { total: { value: 1 }, hits: [] } }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    const host: any = vi.fn(async (path: string, _m?: string, body?: string) => {
      if (path.startsWith('/_bulk')) {
        const docs = String(body || '').split('\n').filter(Boolean).length / 2;
        return { items: Array.from({ length: docs }, () => ({ create: { status: 201 } })) };
      }
      return {};
    });
    const r = await start(host, { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'NONE', batchSize: 100, slices: 2 }, SRC_CONN);
    await flush();
    const j = await progress(r.jobId);
    expect(j.status).toBe('FAILED');
    expect(j.message).toContain('slice-1 爆了');
  });
});

/* preflight 双侧检查：字段口径对齐服务端 CrossClusterMigrateService.preflight */
describe('xmigrate preflight', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('源侧 _cat 行 + 目标不存在：srcDocCount/srcShards/health 如实，destShards 为 null', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify([{ index: 'orders', health: 'green', status: 'open', pri: '3', 'docs.count': '123', 'store.size': '4kb' }]),
      { status: 200 },
    ));
    const host: any = vi.fn(async (path: string) => {
      if (path === '/orders-copy/_mapping') throw new Error('index_not_found_exception');
      throw new Error('unexpected host call: ' + path);
    });
    const r = await preflight(host, { sourceIndex: 'orders', destIndex: 'orders-copy', conn: SRC_CONN });
    expect(r.sourceIndex).toBe('orders');
    expect(r.destIndex).toBe('orders-copy');
    expect(r.destExists).toBe(false);
    expect(r.srcDocCount).toBe(123);
    expect(r.srcShards).toBe(3);
    expect(r.sourceHealth).toBe('green');
    expect(r.sourceStoreSize).toBe('4kb');
    expect(r.destShards).toBeNull(); // 目标不存在不读（同服务端口径）
    expect(r.destHealth).toBeNull();
    expect(r.estSeconds).toBeNull(); // 浏览器无调优速率模型，不虚构耗时预估
  });

  it('目标已存在时补 destShards/destHealth；req.conn 未填时源侧静默置 null', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('[]', { status: 200 }));
    const host: any = vi.fn(async (path: string) => {
      if (path === '/orders-copy/_mapping') return { 'orders-copy': {} };
      if (path.startsWith('/_cat/indices')) return [{ index: 'orders-copy', health: 'yellow', pri: '2' }];
      throw new Error('unexpected host call: ' + path);
    });
    const r = await preflight(host, { sourceIndex: 'orders', destIndex: 'orders-copy', conn: SRC_CONN });
    expect(r.destExists).toBe(true);
    expect(r.destShards).toBe(2);
    expect(r.destHealth).toBe('yellow');
    const noConn = await preflight(host, { sourceIndex: 'orders', destIndex: 'orders-copy' });
    expect(noConn.srcDocCount).toBeNull();
    expect(noConn.srcShards).toBeNull();
    expect(noConn.sourceHealth).toBeNull();
    expect(noConn.sourceStoreSize).toBeNull();
    expect(noConn.destExists).toBe(true);
  });
});

/* resume 基线：scroll 游标不可持久，续跑=全量重扫 + create 409 跳过，
 * 历史计数保留为基线，本次扫描在其上累加 */
describe('xmigrate resume baseline', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('老台账无 slices 字段可续跑：migrated/conflicts 从基线累加', async () => {
    localStorage.setItem(JOBS_KEY, JSON.stringify([{
      jobId: 'xm-old', sourceIndex: 'orders', destIndex: 'orders-copy', status: 'INTERRUPTED',
      migrated: 7, conflicts: 1, errors: 0, total: 9, createTime: Date.now() - 60000,
      message: '页面已关闭，搬运中断；已写入目标的数据保留，可重新发起或续跑',
    }]));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const p = new URL(String(input)).pathname;
      const method = String(init?.method || 'GET').toUpperCase();
      if (p === '/orders/_search') {
        return new Response(JSON.stringify({
          _scroll_id: 'rs1',
          hits: { total: { value: 2 }, hits: [{ _id: '1', _source: { id: '1' } }, { _id: '2', _source: { id: '2' } }] },
        }), { status: 200 });
      }
      if (p === '/_search/scroll' && method === 'POST') {
        return new Response(JSON.stringify({ _scroll_id: 'rs1', hits: { total: { value: 2 }, hits: [] } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    const bulkBodies: string[] = [];
    const host: any = vi.fn(async (path: string, _m?: string, body?: string) => {
      if (path.startsWith('/_bulk')) {
        bulkBodies.push(String(body || ''));
        /* id=1 上轮已写 → create 409 跳过；id=2 新文档 → 201 */
        return { items: [{ create: { status: 409 } }, { create: { status: 201 } }] };
      }
      return {};
    });
    await resume(host, 'xm-old', SRC_CONN);
    const early = await progress('xm-old');
    expect(early.status).toBe('RUNNING');
    expect(early.message).toContain('从已迁移 7 条基线续扫');
    await flush();
    const j = await progress('xm-old');
    expect(j.status).toBe('DONE');
    expect(j.migrated).toBe(8);  // 7 基线 + 1 新写
    expect(j.conflicts).toBe(2); // 1 基线 + 1 个 409 跳过
    expect(j.errors).toBe(0);
    expect(j.slices).toBe(1);    // 老台账无 slice 字段 → 默认单路
    expect(bulkBodies[0]).toContain('"create"'); // bulk 用 create 幂等写
    /* 老台账展示兼容：listJobs 不因缺 slice 字段报错 */
    const list = await listJobs(host, 10);
    expect(list[0].jobId).toBe('xm-old');
    expect(list[0].migrated).toBe(8);
  });
});

/* 结构同步·兼容性自适应 v2：源（阿里云形态：厂商私有 setting + ik 分词器）→
 * 兼容矩阵 planned 预剔除（目标缺 analysis-ik 插件）→ 一轮 PUT 建成；
 * 反应式兜底与 dryRun/syncAliases 语义见 browserSyncStructureDryRun1121.spec.ts */
describe('xmigrate syncStructure', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  function mockSyncSource() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const u = new URL(String(input));
      if (u.pathname === '/') return new Response(JSON.stringify({ version: { number: '7.10.2' } }), { status: 200 });
      if (u.pathname.startsWith('/_nodes/plugins')) return new Response(JSON.stringify({ nodes: {} }), { status: 200 });
      if (u.pathname.startsWith('/_cluster/health')) return new Response(JSON.stringify({ number_of_nodes: 2, number_of_data_nodes: 2 }), { status: 200 });
      if (u.pathname.startsWith('/orders/_settings')) return new Response(JSON.stringify({ orders: { settings: {
        'index.number_of_shards': '1',
        'index.number_of_replicas': '1',
        'index.uuid': 'u-9',
        'index.creation_date': '1700000000000',
        'index.provided_name': 'orders',
        'index.version.created': '7100299',
        'index.apack.knn': 'true',
        'index.analysis.tokenizer.ik_max_word.type': 'ik_max_word',
      } } }), { status: 200 });
      if (u.pathname.startsWith('/orders/_mapping')) return new Response(JSON.stringify({ orders: { mappings: {
        dynamic_templates: [{ match: 'title_*', mapping: { type: 'keyword' } }],
        properties: {
          title: { type: 'text', analyzer: 'ik_max_word' },
          created: { type: 'date' },
        },
      } } }), { status: 200 });
      if (u.pathname.startsWith('/orders/_alias')) return new Response(JSON.stringify({ orders: { aliases: {} } }), { status: 200 });
      throw new Error('unexpected source call: ' + u.pathname);
    });
  }
  /* 目标宿主：无 ik 插件（/_nodes/plugins 空集）→ planned 预剔除 apack.knn 与 ik 分词器；
     PUT 按调用序回 errors 中错误（默认首轮即建成） */
  function sequenceHost(putBodies: any[], errors: string[] = []): any {
    return vi.fn(async (path: string, method = 'GET', body?: string) => {
      if (path === '/') return { version: { number: '8.13.0' } };
      if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
      if (path.startsWith('/_cluster/health')) return { number_of_nodes: 1, number_of_data_nodes: 1 };
      if (path === '/orders-copy' && method === 'PUT') {
        putBodies.push(JSON.parse(body || '{}'));
        const err = errors[putBodies.length - 1];
        if (err) throw new Error(JSON.stringify({ error: { root_cause: [{ type: 'illegal_argument_exception', reason: err }] } }));
        return { acknowledged: true };
      }
      throw new Error('unexpected host call: ' + path);
    });
  }

  it('planned 预剔除后一轮建成：apack 私有键与 ik 分词器不进 PUT，字段引用降级（字段保留）', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const r = await syncStructure(sequenceHost(putBodies), { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy' });
    expect(r.created).toBe(true);
    expect(r.rounds).toBe(1);
    expect(r.destIndex).toBe('orders-copy');
    expect(r.planned.removedSettings.map((s: any) => s.key)).toEqual(['index.apack.knn']);
    expect(r.planned.removedSettings[0].reason).toContain('阿里云 apack 私有设置');
    expect(r.planned.removedAnalysis.map((a: any) => [a.kind, a.name])).toEqual([['tokenizer', 'ik_max_word']]);
    expect(r.planned.removedAnalysis[0].reason).toContain('目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用');
    expect(r.planned.downgradedFields).toHaveLength(1);
    expect(r.planned.downgradedFields[0]).toMatchObject({ field: 'title', from: 'ik_max_word', to: 'standard' });
    expect(r.source.version).toBe('7.10.2');
    expect(r.target.version).toBe('8.13.0');
    expect(r.warnings).toHaveLength(1); // 双侧版本不一致如实记入 warnings
    /* 内部键与预剔除项（apack/ik 分词器）不进第一轮 PUT；title.analyzer 已降级 standard（缺省回退） */
    const firstIndex = putBodies[0].settings.index;
    expect(firstIndex.number_of_shards).toBe('1');
    expect(firstIndex.uuid).toBeUndefined();
    expect(firstIndex.apack).toBeUndefined();
    expect(firstIndex.analysis).toBeUndefined();
    expect(putBodies[0].mappings.properties.title).toEqual({ type: 'text', analyzer: 'standard' });
    expect(putBodies[0].mappings.properties.created).toEqual({ type: 'date' });
    /* mappings 顶层键（dynamic_templates）随 PUT 透传，不被静默丢弃 */
    expect(putBodies[0].mappings.dynamic_templates).toEqual([{ match: 'title_*', mapping: { type: 'keyword' } }]);
  });

  it('downgradedAnalyzerFallback 给定时字段属性回退为该分析器而不是剔除', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const r = await syncStructure(sequenceHost(putBodies), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy', downgradedAnalyzerFallback: 'standard',
    });
    expect(r.created).toBe(true);
    expect(r.planned.downgradedFields[0]).toMatchObject({ field: 'title', from: 'ik_max_word', to: 'standard' });
    expect(putBodies[0].mappings.properties.title).toEqual({ type: 'text', analyzer: 'standard' });
  });

  it('目标索引已存在直接报错（resource_already_exists，对齐服务端 409 语义）', async () => {
    mockSyncSource();
    const host = vi.fn(async (path: string, method = 'GET') => {
      if (path === '/') return { version: { number: '8.13.0' } };
      if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
      if (path.startsWith('/_cluster/health')) return { number_of_nodes: 1, number_of_data_nodes: 1 };
      if (path === '/orders-copy' && method === 'PUT') {
        throw new Error(JSON.stringify({ error: { type: 'resource_already_exists_exception', reason: 'index [orders-copy/xyz] already exists' } }));
      }
      throw new Error('unexpected host call: ' + path);
    });
    await expect(syncStructure(host, { conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy' }))
      .rejects.toThrow('目标索引已存在：本能力不覆盖既有索引');
  });

  it('不可识别的错误如实返回 created=false + 最后错误，不虚构成功', async () => {
    mockSyncSource();
    const putBodies: any[] = [];
    const r = await syncStructure(sequenceHost(putBodies, ['some opaque rejection']), {
      conn: SRC_CONN, sourceIndex: 'orders', destIndex: 'orders-copy',
    });
    expect(r.created).toBe(false);
    expect(r.rounds).toBe(1);
    expect(r.lastError).toContain('some opaque rejection');
    expect(r.destIndex).toBe('orders-copy');
  });
});

/* ensureDest（start 的 COPY_FROM_SOURCE/REBUILD 建索引路径）接兼容矩阵：
 * 建索引前按目标探测快照预剔除（同 sync_structure 的 planned 侧），内部键五连剔
 * （含 index.version.upgraded）；探测/矩阵失败降级原样继续建索引（不阻断迁移） */
describe('xmigrate ensureDest compat matrix', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('COPY_FROM_SOURCE 建索引前跑矩阵：apack 剔除、ik 引用降级 standard、内部键（含 version.upgraded）不进 PUT', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const u = new URL(String(input));
      if (u.pathname === '/') return new Response(JSON.stringify({ version: { number: '7.10.2' } }), { status: 200 });
      if (u.pathname.startsWith('/_nodes/plugins')) return new Response(JSON.stringify({ nodes: {} }), { status: 200 });
      if (u.pathname.startsWith('/_cluster/health')) return new Response(JSON.stringify({ number_of_nodes: 1, number_of_data_nodes: 1 }), { status: 200 });
      if (u.pathname.startsWith('/orders/_settings')) return new Response(JSON.stringify({ orders: { settings: {
        'index.number_of_shards': '1',
        'index.uuid': 'u-9',
        'index.creation_date': '1700000000000',
        'index.provided_name': 'orders',
        'index.version.created': '7100299',
        'index.version.upgraded': '7170099',
        'index.apack.knn': 'true',
      } } }), { status: 200 });
      if (u.pathname.startsWith('/orders/_mapping')) return new Response(JSON.stringify({ orders: { mappings: {
        properties: { title: { type: 'text', analyzer: 'ik_max_word' } },
      } } }), { status: 200 });
      if (u.pathname.startsWith('/orders/_search')) {
        return new Response(JSON.stringify({ _scroll_id: 's1', hits: { total: { value: 0 }, hits: [] } }), { status: 200 });
      }
      throw new Error('unexpected source call: ' + u.pathname);
    });
    const putBodies: any[] = [];
    const host: any = vi.fn(async (path: string, method = 'GET', body?: string) => {
      if (path === '/') return { version: { number: '8.13.0' } };
      if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
      if (path.startsWith('/_cluster/health')) return { number_of_nodes: 1, number_of_data_nodes: 1 };
      if (path === '/orders-copy' && method === 'PUT') {
        putBodies.push(JSON.parse(body || '{}'));
        return { acknowledged: true };
      }
      if (path.startsWith('/_bulk')) return { items: [] };
      throw new Error('unexpected host call: ' + path);
    });
    const r = await start(host, { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'COPY_FROM_SOURCE' }, SRC_CONN);
    await flush();
    expect(putBodies).toHaveLength(1);
    /* 矩阵生效：apack 私有键不进 PUT（目标厂商未知 → apack-private 兜底剔）；
       ik 引用降级 standard；内部键五连剔（version.* 整对象不进 PUT） */
    expect(putBodies[0].settings.index.apack).toBeUndefined();
    expect(putBodies[0].settings.index.uuid).toBeUndefined();
    expect(putBodies[0].settings.index.version).toBeUndefined();
    expect(putBodies[0].settings.index.number_of_shards).toBe('1');
    expect(putBodies[0].mappings.properties.title).toEqual({ type: 'text', analyzer: 'standard' });
    const j = await progress(r.jobId);
    expect(j.status).toBe('DONE'); // 预剔除不阻断搬运
  });

  it('宿主探测全失败：矩阵按未知目标降级运行，无可剔内容原样建索引（不阻断）', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const u = new URL(String(input));
      if (u.pathname.startsWith('/orders/_settings')) return new Response(JSON.stringify({ orders: { settings: {
        'index.number_of_shards': '1', 'index.version.upgraded': '7170099',
      } } }), { status: 200 });
      if (u.pathname.startsWith('/orders/_mapping')) return new Response(JSON.stringify({ orders: { mappings: {
        properties: { title: { type: 'keyword' } },
      } } }), { status: 200 });
      if (u.pathname.startsWith('/orders/_search')) {
        return new Response(JSON.stringify({ _scroll_id: 's1', hits: { total: { value: 0 }, hits: [] } }), { status: 200 });
      }
      throw new Error('unexpected source call: ' + u.pathname);
    });
    const putBodies: any[] = [];
    const host: any = vi.fn(async (path: string, method = 'GET', body?: string) => {
      if (path === '/orders-copy' && method === 'PUT') {
        putBodies.push(JSON.parse(body || '{}'));
        return { acknowledged: true };
      }
      if (path.startsWith('/_bulk')) return { items: [] };
      throw new Error('probe fail: ' + path); // 探测路径全失败 → 矩阵按未知目标运行
    });
    const r = await start(host, { sourceIndex: 'orders', destIndex: 'orders-copy', destCreateMode: 'COPY_FROM_SOURCE' }, SRC_CONN);
    await flush();
    expect(putBodies).toHaveLength(1);
    /* 可迁移键原样保留、无插件依赖字段不动；version.upgraded 仍剔（内部键与探测无关） */
    expect(putBodies[0].settings.index.number_of_shards).toBe('1');
    expect(putBodies[0].settings.index.version).toBeUndefined();
    expect(putBodies[0].mappings.properties.title).toEqual({ type: 'keyword' });
    const j = await progress(r.jobId);
    expect(j.status).toBe('DONE');
  });
});
