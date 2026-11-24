/* 2026-11-21 sync v3 批：compare_capabilities 风险矩阵与 diff_structure 结构对账——
 * 源（阿里云形态）vs 目标（腾讯云形态）双侧探测产出版本差/厂商切换/插件差/分片过碎风险；
 * diff 按兼容矩阵计划豁免 expectedRemovals，计划外差异进 unexpected 并给 compatible 判定；
 * throttle 为本页 scroll+bulk 循环的批粒度限速（守卫语义：非本页运行/非法 rps 如实报错）。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compareCapabilities, diffStructure, start as xmStart, throttleJob } from '../platform/browserXmigrate';

const SRC_CONN = { scheme: 'http', host: 'src.local', port: 9200 };

function mockFetchOnce(routes: Record<string, any>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const u = new URL(String(input));
    for (const [prefix, body] of Object.entries(routes)) {
      /* '/' 根路径精确匹配（前缀写法会吞掉所有 pathname），其余按前缀匹配 */
      if (prefix === '/' ? u.pathname === '/' : u.pathname.startsWith(prefix)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    throw new Error('unexpected source call: ' + u.pathname);
  });
}

describe('compare_capabilities（2026-11-21 sync v3 批）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  function sourceRoutes(): Record<string, any> {
    return {
      '/': { version: { number: '8.9.0' }, cluster_name: 'src-cluster' },
      '/_nodes/plugins': { nodes: { n1: { plugins: [{ name: 'analysis-ik' }, { name: 'apack' }] } } },
      '/_cluster/health': { number_of_nodes: 3, number_of_data_nodes: 3 },
      '/_cat/indices': [{ index: 'orders', pri: '30' }],
    };
  }
  function targetHost(): any {
    return vi.fn(async (path: string) => {
      if (path === '/') return { version: { number: '7.10.2' }, cluster_name: 'tgt-cluster' };
      if (path.startsWith('/_nodes/plugins')) return { nodes: { n1: { plugins: [{ name: 'qcloud-es' }] } } };
      if (path.startsWith('/_cluster/health')) return { number_of_nodes: 2, number_of_data_nodes: 2 };
      throw new Error('unexpected host call: ' + path);
    });
  }

  it('跨厂商对比：版本差/厂商切换/仅源插件/分片过碎全量风险矩阵', async () => {
    mockFetchOnce(sourceRoutes());
    const r = await compareCapabilities(targetHost(), {
      conn: SRC_CONN, srcConnId: 'old', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-v2',
    });
    /* source/target 报告块：契约字段全集（version/vendor/evidence/plugins/managed/节点规模） */
    expect(r.source).toMatchObject({
      connection: 'old', index: 'orders', version: '8.9.0', distribution: null,
      clusterName: 'src-cluster', managed: true, nodeCount: 3, dataNodeCount: 3, pluginsReliable: true,
    });
    expect(r.source.vendor).toMatchObject({ id: 'aliyun', label: '阿里云 ES' });
    expect(r.source.evidence).toContain('plugin:apack');
    expect(r.source.plugins).toEqual(['analysis-ik', 'apack']);
    expect(r.target).toMatchObject({
      connection: 'host', index: 'orders-v2', version: '7.10.2',
      clusterName: 'tgt-cluster', managed: true, nodeCount: 2, dataNodeCount: 2,
    });
    expect(r.target.vendor.id).toBe('tencent');
    /* diff：major.minor 不等 → versionGap；厂商 aliyun→tencent；插件差按清单排序 */
    expect(r.diff.versionGap).toBe('8.9.0 -> 7.10.2');
    expect(r.diff.vendorChanged).toBe(true);
    expect(r.diff.pluginsOnlyInSource).toEqual(['analysis-ik', 'apack']);
    expect(r.diff.pluginsOnlyInTarget).toEqual(['qcloud-es']); // 仅目标有的插件同样如实列出
    expect(r.diff.nodeScale).toEqual({ sourceDataNodes: 3, targetDataNodes: 2 });
    /* risks：仅源插件逐项 plugin_missing(high，action 逐字) + 大版本降级 + 厂商切换 + 分片过碎 */
    const kinds = r.diff.risks.map((x: any) => [x.kind, x.severity]);
    expect(kinds).toEqual([
      ['plugin_missing', 'high'], ['plugin_missing', 'high'],
      ['version_downgrade', 'medium'], ['vendor_change', 'low'], ['shard_oversize', 'medium'],
    ]);
    expect(r.diff.risks[0]).toMatchObject({
      kind: 'plugin_missing', action: 'auto-strip on sync_structure; or install plugin on target',
    });
    /* apack 非矩阵已知具名组件插件：action 提示目标安装或从同步计划排除 */
    expect(r.diff.risks[1]).toMatchObject({
      kind: 'plugin_missing', action: 'install the plugin on target or exclude the component from the sync plan',
    });
    expect(r.diff.risks[1].message).toContain('apack');
    expect(r.diff.risks[2].message).toContain('7.10.2');
    expect(r.diff.risks[4].message).toContain('30');
  });

  it('同版本同厂商且插件一致：versionGap null、无风险（双侧 unknown 不冒充厂商切换）', async () => {
    mockFetchOnce({
      '/': { version: { number: '7.10.2' }, cluster_name: 'a' },
      '/_cluster/health': { number_of_nodes: 1, number_of_data_nodes: 1 },
      /* _nodes/plugins 抛不出——mockOnce 全 200，用无 nodes 键模拟受限账号：plugins 空集可靠 */
      '/_nodes/plugins': { nodes: {} },
    });
    const host = vi.fn(async (path: string) => {
      if (path === '/') return { version: { number: '7.10.2' } };
      if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
      if (path.startsWith('/_cluster/health')) return { number_of_nodes: 1, number_of_data_nodes: 1 };
      throw new Error('unexpected host call: ' + path);
    });
    const r = await compareCapabilities(host, { conn: SRC_CONN, destConnId: 'host' });
    expect(r.diff.versionGap).toBeNull();
    expect(r.diff.vendorChanged).toBe(false); // 双侧 unknown 不冒充厂商切换
    expect(r.diff.risks).toEqual([]);
    expect(r.source.index).toBeNull(); // sourceIndex 未给如实 null
  });

  it('分片不过碎（≤3×目标数据节点）不出 shard_oversize；源索引清单读不到不阻断', async () => {
    const routes = sourceRoutes();
    routes['/_cat/indices'] = [{ index: 'orders', pri: '6' }]; // 6 ≤ 3×2
    mockFetchOnce(routes);
    const r = await compareCapabilities(targetHost(), { conn: SRC_CONN, sourceIndex: 'orders', destConnId: 'host' });
    expect(r.diff.risks.map((x: any) => x.kind)).not.toContain('shard_oversize');
  });
});

describe('diff_structure（2026-11-21 sync v3 批）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  const srcSettings = {
    'index.number_of_shards': '1',
    'index.number_of_replicas': '1',
    'index.uuid': 'u-9',
    'index.version.created': '7100299',
    'index.apack.knn': 'true',
    'index.custom.private': 'x',
    'index.analysis.tokenizer.ik_max_word.type': 'ik_max_word',
  };
  const srcMapping = { orders: { mappings: { properties: {
    title: { type: 'text', analyzer: 'ik_max_word' },
    created: { type: 'date' },
    extra: { type: 'keyword' },
  } } } };

  function mockSource(settings: any, mapping: any): void {
    mockFetchOnce({
      '/': { version: { number: '7.10.2' } },
      '/_nodes/plugins': { nodes: {} },
      '/_cluster/health': { number_of_nodes: 1, number_of_data_nodes: 1 },
      '/orders/_settings': { orders: { settings } },
      '/orders/_mapping': mapping,
    });
  }
  function diffHost(destSettings: any, destMapping: any): any {
    return vi.fn(async (path: string) => {
      if (path === '/') return { version: { number: '8.13.0' } };
      if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
      if (path.startsWith('/_cluster/health')) return { number_of_nodes: 1, number_of_data_nodes: 1 };
      if (path.startsWith('/target/_settings')) return { target: { settings: destSettings } };
      if (path.startsWith('/target/_mapping')) return { target: { mappings: destMapping } };
      throw new Error('unexpected host call: ' + path);
    });
  }

  it('计划剔除豁免：apack/ik 走 expectedRemovals 不算 unexpected，计划外差异如实报告', async () => {
    mockSource(srcSettings, srcMapping);
    const r = await diffStructure(diffHost({
      'index.number_of_shards': '1',
      'index.number_of_replicas': '2',
      'index.custom.extra': 'y',
    }, { properties: { title: { type: 'text' }, created: { type: 'date' } } }), {
      conn: SRC_CONN, sourceIndex: 'orders', destConnId: 'host', destIndex: 'target',
    });
    expect(r.sourceIndex).toBe('orders');
    expect(r.destIndex).toBe('target');
    expect(r.destConnId).toBe('host');
    /* settingsDiff：忽略键（replicas/uuid/version/provided_name/creation_date）不进对比 */
    expect(r.settingsDiff.onlyInSource.map((s: any) => s.key)).toEqual(['index.apack.knn', 'index.custom.private', 'index.analysis.tokenizer.ik_max_word.type']);
    expect(r.settingsDiff.onlyInTarget).toEqual([{ key: 'index.custom.extra', targetValue: 'y' }]);
    expect(r.settingsDiff.valueChanged).toEqual([]);
    /* mappingsDiff：目标缺 extra 字段；title 的 analyzer 语义属性差异进 fieldChanged
     * （detail 逐属性呈报，缺失侧记 (absent)），但命中降级豁免不算 unexpected */
    expect(r.mappingsDiff.fieldAdded).toEqual([]);
    expect(r.mappingsDiff.fieldRemoved).toEqual([{ field: 'extra', type: 'keyword' }]);
    expect(r.mappingsDiff.fieldChanged).toEqual([
      { field: 'title', sourceType: 'text', targetType: 'text', detail: 'analyzer: ik_max_word -> (absent)' },
    ]);
    /* expectedRemovals：兼容矩阵计划（apack 设置/ik 分词器定义/title 字段降级） */
    expect(r.expectedRemovals).toEqual([
      { area: 'settings', key: 'index.apack.knn', reason: '阿里云 apack 私有设置，跨环境不可迁移' },
      { area: 'analysis', key: 'tokenizer.ik_max_word', reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用' },
      { area: 'mappings', key: 'title', reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用' },
    ]);
    /* unexpected：custom.private（源独有 settings）+ custom.extra（目标独有 settings）+
     * extra（mappings）；apack/analysis/title 命中豁免 */
    expect(r.unexpected).toEqual([
      { area: 'settings', key: 'index.custom.private', message: expect.stringContaining('index.custom.private') },
      { area: 'settings', key: 'index.custom.extra', message: expect.stringContaining('index.custom.extra') },
      { area: 'mappings', key: 'extra', message: expect.stringContaining('extra') },
    ]);
    expect(r.compatible).toBe(false);
  });

  it('目标与计划一致：unexpected 空 → compatible true；值漂移进 valueChanged', async () => {
    mockSource(srcSettings, srcMapping);
    const r = await diffStructure(diffHost({
      'index.number_of_shards': '1',
      'index.custom.private': 'x',
    }, { properties: { title: { type: 'text' }, created: { type: 'date' }, extra: { type: 'keyword' } } }), {
      conn: SRC_CONN, sourceIndex: 'orders', destConnId: 'host', destIndex: 'target',
    });
    expect(r.unexpected).toEqual([]);
    expect(r.compatible).toBe(true);
    /* 值漂移场景：分片数不同 → valueChanged（不算 unexpected）但 settings 结构一致 */
    mockSource(srcSettings, srcMapping);
    const drifted = await diffStructure(diffHost({
      'index.number_of_shards': '3',
      'index.custom.private': 'x',
    }, { properties: { title: { type: 'text' }, created: { type: 'date' }, extra: { type: 'keyword' } } }), {
      conn: SRC_CONN, sourceIndex: 'orders', destConnId: 'host', destIndex: 'target',
    });
    expect(drifted.settingsDiff.valueChanged).toEqual([
      { key: 'index.number_of_shards', sourceValue: '1', targetValue: '3' },
    ]);
    /* 值漂移计入 unexpected（onlyInTarget/valueChanged 同为计划外差异）→ 判不兼容 */
    expect(drifted.unexpected).toEqual([
      { area: 'settings', key: 'index.number_of_shards', message: expect.stringContaining('index.number_of_shards') },
    ]);
    expect(drifted.compatible).toBe(false);
  });

  it('嵌套 index.analysis 单键形态：计划剔除组件的整键 valueChanged 按组件级差集豁免，不误报不兼容', async () => {
    /* 标准 ES flat 响应：analysis 挂 index.analysis 单键（嵌套对象）。ik_max_word 被矩阵计划
     * 剔除、keep_stop 保留——目标建成时少 ik_max_word 子树 → 整键 valueChanged；差集
     * {tokenizer.ik_max_word} ⊆ 计划剔除集 → 豁免 unexpected，sync→verify 闭环不误报 */
    mockSource({
      'index.number_of_shards': '1',
      'index.analysis': { tokenizer: { ik_max_word: { type: 'ik_max_word' }, keep_stop: { type: 'stop' } } },
    }, { orders: { mappings: { properties: { title: { type: 'text', analyzer: 'ik_max_word' } } } } });
    const r = await diffStructure(diffHost({
      'index.number_of_shards': '1',
      'index.analysis': { tokenizer: { keep_stop: { type: 'stop' } } },
    }, { properties: { title: { type: 'text', analyzer: 'standard' } } }), {
      conn: SRC_CONN, sourceIndex: 'orders', destConnId: 'host', destIndex: 'target',
    });
    expect(r.expectedRemovals.map((x: any) => [x.area, x.key])).toEqual([
      ['analysis', 'tokenizer.ik_max_word'],
      ['mappings', 'title'],
    ]);
    /* 结构差异照报（豁免只作用于 unexpected），保留组件 keep_stop 双侧一致 */
    expect(r.settingsDiff.valueChanged.map((v: any) => v.key)).toEqual(['index.analysis']);
    expect(r.mappingsDiff.fieldChanged.map((f: any) => f.field)).toEqual(['title']);
    expect(r.unexpected).toEqual([]);
    expect(r.compatible).toBe(true);
  });

  it('目标索引不存在：明确报错（DEST_NOT_FOUND），不虚构空 diff', async () => {
    mockSource(srcSettings, srcMapping);
    const host = vi.fn(async (path: string) => {
      if (path === '/') return { version: { number: '8.13.0' } };
      if (path.startsWith('/_nodes/plugins')) return { nodes: {} };
      if (path.startsWith('/_cluster/health')) return { number_of_nodes: 1, number_of_data_nodes: 1 };
      if (path.startsWith('/target/')) throw Object.assign(new Error('index_not_found_exception: no such index [target]'), { status: 404 });
      throw new Error('unexpected host call: ' + path);
    });
    await expect(diffStructure(host, {
      conn: SRC_CONN, sourceIndex: 'orders', destConnId: 'host', destIndex: 'target',
    })).rejects.toThrow('目标索引不存在');
  });
});

describe('throttle（2026-11-21 sync v3 批）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('守卫语义：作业不存在/非本页运行/0 速率如实报错；运行中调速与恢复不限速生效', async () => {
    await expect(throttleJob('xm-none', 100)).rejects.toThrow('作业不存在');
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([
      { jobId: 'xm-done', status: 'DONE', finishTime: 1 },
    ]));
    await expect(throttleJob('xm-done', 100)).rejects.toThrow('不在本页运行中');
    /* 运行中作业：源 scroll 用手动释放门挂住搬运循环，作业停留 RUNNING 窗口供调速 */
    let releaseScroll!: () => void;
    const gate = new Promise<void>(r => { releaseScroll = r; });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const u = new URL(String(input));
      if (u.pathname === '/') return new Response(JSON.stringify({ version: { number: '7.10.2' } }), { status: 200 });
      if (u.pathname.startsWith('/_nodes/plugins')) return new Response(JSON.stringify({ nodes: {} }), { status: 200 });
      if (u.pathname.startsWith('/_cluster/health')) return new Response(JSON.stringify({ number_of_nodes: 1, number_of_data_nodes: 1 }), { status: 200 });
      if (u.pathname.startsWith('/orders/_search')) {
        await gate;
        return new Response(JSON.stringify({ _scroll_id: 's1', hits: { total: { value: 1 }, hits: [{ _id: '1', _source: { a: 1 } }] } }), { status: 200 });
      }
      if (u.pathname.startsWith('/_search/scroll')) return new Response(JSON.stringify({ hits: { hits: [] } }), { status: 200 });
      throw new Error('unexpected source call: ' + u.pathname);
    });
    const host = vi.fn(async (path: string) => {
      if (path === '/dest/_bulk') return { errors: false, items: [{ create: { status: 201 } }] };
      throw new Error('unexpected host call: ' + path);
    });
    const { jobId } = await xmStart(host, {
      sourceIndex: 'orders', destIndex: 'dest', destCreateMode: 'NONE', batchSize: 50,
    }, SRC_CONN);
    await expect(throttleJob(jobId, 0)).rejects.toThrow('不得为 0');
    await expect(throttleJob(jobId, -2)).rejects.toThrow('不得小于 -1'); // 小于 -1 拒绝（不再归一）
    const t = await throttleJob(jobId, 50);
    expect(t).toMatchObject({ ok: true, jobId, rps: 50 });
    expect(typeof t.appliedAt).toBe('number');
    /* 台账留痕 + 事件时间线记录调速 */
    const stored = JSON.parse(localStorage.getItem('esquerystudio.xmigrate.jobs') || '[]').find((j: any) => j.jobId === jobId);
    expect(stored.throttleRps).toBe(50);
    expect(stored.events.some((e: any) => e.stage === 'THROTTLE' && e.message.includes('50'))).toBe(true);
    const off = await throttleJob(jobId, -1);
    expect(off).toMatchObject({ ok: true, rps: -1 });
    releaseScroll();
  });
});
