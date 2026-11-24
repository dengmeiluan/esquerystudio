/* 迁移后等价性验证（verify_equivalence）浏览器端全链：
 *   ① 直调 browserXmigrate.verifyEquivalence——双侧 _count、源 _doc 序抽样、双侧 mget
 *      canonicalJson 摘要逐 id 对比、可选 terms 聚合对比与 verdict 判定；
 *   ② 桥层 browserApi 路由——destConnId 缺省 auto-fill 当前激活档案、非宿主/当前档案
 *      按同款文案拒绝 400；
 *   ③ jobId 形态——本机作业台账补 srcConnId/sourceIndex/destIndex，台账无此作业如实报错。
 * 返回键名与服务端 REST 契约逐字对齐（source/dest/countsMatch/sample/aggregation/verdict/warnings）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyEquivalence } from '../platform/browserXmigrate';
import { browserFetch } from '../platform/browserApi';
import { __resetBrowserProfilesForTests } from '../platform/browserProfiles';

const JOBS_KEY = 'esquerystudio.xmigrate.jobs';
const SRC_URL = 'http://src.local:9200';
const HOST_URL = 'http://es.local:9200';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* 源集群 fetch 桩：_count/_search(样本与聚合)/_mget 三类，按需捕获请求体 */
function mockSource(opts: {
  count: number;
  docs?: Record<string, any>;
  aggBuckets?: Array<{ key: string; doc_count: number }>;
  searchBodies?: any[];
}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const p = new URL(String(input)).pathname;
    const method = String(init?.method || 'GET').toUpperCase();
    const body = JSON.parse(String(init?.body || '{}'));
    if (p === '/orders/_count') return json({ count: opts.count });
    if (p === '/orders/_search' && method === 'POST') {
      opts.searchBodies?.push(body);
      if (body.aggs) return json({ hits: { total: { value: opts.count }, hits: [] }, aggregations: { eq_verify: { buckets: opts.aggBuckets || [] } } });
      const ids = Object.keys(opts.docs || {}).slice(0, Number(body.size) || 0);
      return json({ hits: { total: { value: opts.count }, hits: ids.map(id => ({ _id: id })) } });
    }
    if (p === '/orders/_mget' && method === 'POST') {
      const docs = (body.ids || []).map((id: string) => ({
        _index: 'orders', _id: id, found: true, _source: (opts.docs || {})[id],
      }));
      return json({ docs });
    }
    throw new Error('unexpected source call: ' + p);
  });
}

/* 目标（宿主）通道桩：_count/_mget/_search(聚合) */
function mockHost(opts: {
  count?: number | null;
  docs?: Record<string, any> | ((id: string) => any);
  aggBuckets?: Array<{ key: string; doc_count: number }>;
}) {
  return vi.fn(async (path: string, _m?: string, bodyText?: string) => {
    const body = JSON.parse(String(bodyText || '{}'));
    if (path === '/orders-copy/_count') {
      if (opts.count == null) throw new Error('index_not_found_exception: no such index [orders-copy]');
      return { count: opts.count };
    }
    if (path === '/orders-copy/_mget') {
      const docs = (body.ids || []).map((id: string) => {
        const src = typeof opts.docs === 'function' ? opts.docs(id) : (opts.docs || {})[id];
        return src === undefined ? { _index: 'orders-copy', _id: id, found: false } : { _index: 'orders-copy', _id: id, found: true, _source: src };
      });
      return { docs };
    }
    if (path === '/orders-copy/_search') {
      return { hits: { total: { value: 0 }, hits: [] }, aggregations: { eq_verify: { buckets: opts.aggBuckets || [] } } };
    }
    throw new Error('unexpected host call: ' + path);
  });
}

describe('xmigrate verifyEquivalence（直调）', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetBrowserProfilesForTests();
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'src-1', name: 'src', url: SRC_URL },
    ]));
    localStorage.setItem('esquerystudio.browser.active', 'src-1');
    vi.restoreAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('happy path：计数一致 + 样本逐 id 摘要一致 + 聚合一致 → EQUIVALENT（键名逐字）', async () => {
    const docs = { a: { status: 'open', title: 't1' }, b: { status: 'open', title: 't2' } };
    mockSource({ count: 2, docs, aggBuckets: [{ key: 'open', doc_count: 2 }] });
    const r = await verifyEquivalence(mockHost({ count: 2, docs, aggBuckets: [{ key: 'open', doc_count: 2 }] }), {
      srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy',
      sampleSize: 100, sampleFields: ['status', 'title'], aggField: 'status',
    });
    expect(r.source).toEqual({ index: 'orders', count: 2 });
    expect(r.dest).toEqual({ index: 'orders-copy', count: 2, destConnId: null });
    expect(r.countsMatch).toBe(true);
    expect(r.sample).toEqual({
      requested: 100, checked: 2, matched: 2,
      missingInDest: [], mismatched: [], missingTruncated: false, mismatchTruncated: false,
    });
    expect(r.aggregation).toEqual({
      field: 'status', requestedSize: 10, match: true,
      sourceBuckets: [{ key: 'open', count: 2 }], destBuckets: [{ key: 'open', count: 2 }],
      onlyInSource: [], onlyInDest: [], countDiffs: [],
    });
    expect(r.verdict).toBe('EQUIVALENT');
    expect(r.warnings).toEqual([]);
  });

  it('目标样本内容不同 → mismatched[{id,reason:"content_mismatch"}]；目标缺文档 → missingInDest；DIVERGENT', async () => {
    const docs = { a: { title: 't1' }, b: { title: 't2' } };
    mockSource({ count: 2, docs });
    const r = await verifyEquivalence(mockHost({
      count: 2,
      docs: (id: string) => (id === 'a' ? undefined : { title: 't2-changed' }),
    }), { srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy' });
    expect(r.countsMatch).toBe(true);
    expect(r.sample.checked).toBe(2);
    expect(r.sample.matched).toBe(0);
    expect(r.sample.missingInDest).toEqual(['a']);
    expect(r.sample.mismatched).toEqual([{ id: 'b', reason: 'content_mismatch' }]);
    expect(r.verdict).toBe('DIVERGENT');
  });

  it('目标索引 404/不可读 → dest.count=null + warning + INCONCLUSIVE（不冒充 0，不做样本/聚合）', async () => {
    mockSource({ count: 2, docs: { a: { title: 't1' } } });
    const host = mockHost({});
    const r = await verifyEquivalence(host, {
      srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', aggField: 'status',
    });
    expect(r.source).toEqual({ index: 'orders', count: 2 });
    expect(r.dest).toEqual({ index: 'orders-copy', count: null, destConnId: null });
    expect(r.countsMatch).toBeNull();
    expect(r.sample).toMatchObject({ requested: 100, checked: 0, matched: 0 });
    expect(r.aggregation).toBeNull();
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(r.warnings).toContain('目标索引不存在（404）: orders-copy');
  });

  it('jobId 形态：台账补 srcConnId/sourceIndex/destIndex；台账无此作业按同款文案报错', async () => {
    localStorage.setItem(JOBS_KEY, JSON.stringify([{
      jobId: 'xm-v1', srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy',
      status: 'DONE', migrated: 2, conflicts: 0, errors: 0, createTime: Date.now() - 1000,
    }]));
    const docs = { a: { title: 't1' } };
    mockSource({ count: 1, docs });
    const r = await verifyEquivalence(mockHost({ count: 1, docs }), { jobId: 'xm-v1' });
    expect(r.source).toEqual({ index: 'orders', count: 1 });
    expect(r.dest.index).toBe('orders-copy');
    expect(r.verdict).toBe('EQUIVALENT');
    await expect(verifyEquivalence(mockHost({}), { jobId: 'xm-none' }))
      .rejects.toThrow('作业不存在：xm-none');
  });

  it('sampleFields 投影（逗号串、去重、点号路径）：投影外字段差异不算 mismatch，点号路径差异算，未出现字段告警', async () => {
    mockSource({
      count: 2,
      docs: {
        a: { title: 't1', ts: 1, meta: { lvl: 'x' } },
        b: { title: 't2', ts: 2, meta: { lvl: 'y' } },
      },
    });
    const r = await verifyEquivalence(mockHost({
      count: 2,
      docs: {
        a: { title: 't1', ts: 999, meta: { lvl: 'x' } },
        b: { title: 't2', ts: 888, meta: { lvl: 'Z' } },
      },
    }), {
      srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy',
      sampleFields: 'title, meta.lvl, title, nope,',
    });
    /* a：仅投影外的 ts 不同 → 匹配；b：投影内 meta.lvl（点号路径）不同 → 错配 */
    expect(r.sample).toMatchObject({ checked: 2, matched: 1 });
    expect(r.sample.mismatched).toEqual([{ id: 'b', reason: 'content_mismatch' }]);
    expect(r.verdict).toBe('DIVERGENT');
    expect(r.warnings).toContain('投影字段 nope 在源样本中均未出现（请检查字段名）');
  });

  it('聚合桶差/计数差如实进 onlyInSource/onlyInDest/countDiffs，match=false 拉低 verdict', async () => {
    const docs = { a: { title: 't1' } };
    mockSource({ count: 1, docs, aggBuckets: [{ key: 'open', doc_count: 2 }, { key: 'closed', doc_count: 1 }] });
    const r = await verifyEquivalence(mockHost({
      count: 1, docs, aggBuckets: [{ key: 'open', doc_count: 3 }, { key: 'pending', doc_count: 5 }],
    }), { srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', aggField: 'status', aggSize: 5 });
    expect(r.aggregation).toMatchObject({
      field: 'status', requestedSize: 5, match: false,
      onlyInSource: [{ key: 'closed', count: 1 }], onlyInDest: [{ key: 'pending', count: 5 }],
      countDiffs: [{ key: 'open', sourceCount: 2, destCount: 3 }],
    });
    expect(r.verdict).toBe('DIVERGENT');
  });

  it('双侧计数均为 0 → 无样本可抽，countsMatch=true → EQUIVALENT', async () => {
    const spy = mockSource({ count: 0, docs: {} });
    const r = await verifyEquivalence(mockHost({ count: 0 }), {
      srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy',
    });
    expect(r.countsMatch).toBe(true);
    expect(r.sample).toMatchObject({ requested: 100, checked: 0, matched: 0 });
    expect(r.verdict).toBe('EQUIVALENT');
    /* 计数已知为 0 时不发样本请求 */
    expect(spy.mock.calls.some(c => String(c[0]).includes('/_search'))).toBe(false);
  });

  it('sampleSize 钳制 10..500 并如实告警：传 5 钳为 10 发样本请求', async () => {
    const docs = Object.fromEntries(Array.from({ length: 800 }, (_, i) => ['id-' + i, { title: 't' }]));
    const searchBodies: any[] = [];
    mockSource({ count: 800, docs, searchBodies });
    const r = await verifyEquivalence(mockHost({ count: 800, docs }), {
      srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', sampleSize: 5,
    });
    expect(r.warnings).toContain('sampleSize 已从 5 钳制为 10（有效范围 10..500）');
    const sampleSearch = searchBodies.find(b => !b.aggs);
    expect(sampleSearch.size).toBe(10);
    expect(sampleSearch.sort).toEqual(['_doc']);
    expect(sampleSearch._source).toBe(false);
    expect(r.sample.requested).toBe(10);
    expect(r.sample.checked).toBe(10);
    expect(r.sample.missingTruncated).toBe(false);
    expect(r.sample.mismatchTruncated).toBe(false);
  });

  it('聚合请求失败 → 告警 + INCONCLUSIVE（不冒充对比过）；样本请求失败同款', async () => {
    mockSource({ count: 1, docs: { a: { title: 't1' } }, aggBuckets: [] });
    const host = vi.fn(async (path: string) => {
      if (path === '/orders-copy/_count') return { count: 1 };
      if (path === '/orders-copy/_mget') return { docs: [{ _index: 'orders-copy', _id: 'a', found: true, _source: { title: 't1' } }] };
      if (path === '/orders-copy/_search') throw new Error('agg socket blew up');
      throw new Error('unexpected host call: ' + path);
    });
    const r = await verifyEquivalence(host, {
      srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy', aggField: 'status',
    });
    expect(r.sample).toMatchObject({ checked: 1, matched: 1 });
    expect(r.aggregation).toBeNull();
    expect(r.warnings).toContain('聚合对比请求失败: agg socket blew up');
    expect(r.verdict).toBe('INCONCLUSIVE');
  });

  it('摘要确定性：同内容两算一致——同输入两次验证结果逐字段相同', async () => {
    const docs = { a: { title: 't1', n: 7 }, b: { title: 't2', n: 8 } };
    const run = () => {
      mockSource({ count: 2, docs, aggBuckets: [{ key: 'open', doc_count: 2 }] });
      return verifyEquivalence(mockHost({ count: 2, docs, aggBuckets: [{ key: 'open', doc_count: 2 }] }), {
        srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy',
        sampleFields: ['title', 'n'], aggField: 'status',
      });
    };
    const r1 = await run();
    const r2 = await run();
    expect(r1).toEqual(r2);
    expect(r1.verdict).toBe('EQUIVALENT');
  });
});

/* 桥层（browserApi xmigrateFetch 路由）：destConnId auto-fill 与非宿主/当前档案拒绝 */
describe('xmigrate verifyEquivalence（browserApi 桥）', () => {
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

  it('destConnId 非宿主/当前档案 → 400，文案与 sync-structure 同款逐字一致', async () => {
    const resp = await browserFetch('/internal/es/xmigrate/verify-equivalence', {
      method: 'POST',
      body: JSON.stringify({ srcConnId: 'src-1', sourceIndex: 'orders', destConnId: 'other-9' }),
    });
    expect(resp.status).toBe(400);
    const data = await resp.json();
    expect(data.message).toBe('浏览器模式目标侧只能是当前激活连接（destConnId 传 host 或当前档案 id），实际: other-9；请先在顶栏切换目标连接');
  });

  it('destConnId 缺省 auto-fill 当前激活档案 id 并回显，全链走通 → EQUIVALENT', async () => {
    const docs = { a: { title: 't1' } };
    vi.stubGlobal('fetch', async (input: any, init?: any) => {
      const url = String(input);
      const p = new URL(url).pathname;
      const method = String(init?.method || 'GET').toUpperCase();
      const body = JSON.parse(String(init?.body || '{}'));
      if (url.startsWith(SRC_URL)) {
        if (p === '/orders/_count') return json({ count: 1 });
        if (p === '/orders/_search') return json({ hits: { total: { value: 1 }, hits: [{ _id: 'a' }] } });
        if (p === '/orders/_mget') return json({ docs: [{ _index: 'orders', _id: 'a', found: true, _source: docs.a }] });
      }
      if (url.startsWith(HOST_URL)) {
        if (p === '/orders-copy/_count') return json({ count: 1 });
        if (p === '/orders-copy/_mget' && method === 'POST') {
          return json({ docs: [{ _index: 'orders-copy', _id: 'a', found: true, _source: docs.a }] });
        }
      }
      throw new Error('unexpected call: ' + method + ' ' + url);
    });
    const resp = await browserFetch('/internal/es/xmigrate/verify-equivalence', {
      method: 'POST',
      body: JSON.stringify({ srcConnId: 'src-1', sourceIndex: 'orders', destIndex: 'orders-copy' }),
    });
    expect(resp.status).toBe(200);
    const r = await resp.json();
    expect(r.dest.destConnId).toBe('host-1');
    expect(r.verdict).toBe('EQUIVALENT');
    expect(r.sample).toMatchObject({ checked: 1, matched: 1 });
  });
});
