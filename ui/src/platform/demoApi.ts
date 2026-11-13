/**
 * Demo transport: the same Vue console, backed by synthetic in-browser fixtures.
 *
 * Selected only by `vite build --mode demo` (GitHub Pages). It never talks to a
 * real Elasticsearch and never reads credentials. All data below is generated
 * for the public demo and is labelled as synthetic in the UI.
 */
export const isDemoMode = import.meta.env.MODE === 'demo';

const now = Date.now();

const PROPERTIES: Record<string, any> = {
  title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  issuer_name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  bond_code: { type: 'keyword' },
  publish_time: { type: 'date' },
  score: { type: 'double' },
  region: { type: 'keyword' },
  amount: { type: 'double' },
  status: { type: 'keyword' },
  tags: { type: 'keyword' },
  publisher: { properties: { org_name: { type: 'keyword' }, org_code: { type: 'keyword' } } },
};

const INDICES = [
  { index: 'research_report', health: 'green', status: 'open', 'docs.count': '128', 'store.size': '3mb', pri: '1' },
  { index: 'bond_issuer', health: 'green', status: 'open', 'docs.count': '64', 'store.size': '1mb', pri: '1' },
];

const HITS = [
  ['rr-0001', '2026 Q3 半导体行业深度研报', '华泰证券', '2026-10-12', 3.42],
  ['rr-0002', '新能源车产业链专题：固态电池拐点', '中信建投', '2026-10-09', 3.18],
  ['rr-0003', 'AI 算力基础设施年度展望', '国泰君安', '2026-10-06', 2.97],
  ['rr-0004', '消费复苏跟踪：白酒渠道库存', '招商证券', '2026-09-28', 2.71],
  ['rr-0005', '高股息策略：公用事业配置价值', '广发证券', '2026-09-21', 2.55],
];

const sourceOf = ([, title, issuer, date, score]: any[]) => ({
  title, status: 'ACTIVE', issuer_name: issuer, publish_time: date, score,
  region: '上海', amount: 500000000, tags: ['研报', '深度'],
});

const searchHits = (index: string) => HITS.map((row, i) => {
  const [id, title, , , score] = row as any[];
  return {
    _id: id, _index: index || 'research_report', _score: score,
    _source: sourceOf(row), highlight: { title: [`<em class="hl">${String(title).slice(0, 8)}</em>${String(title).slice(8)}`] },
  };
});

const rawHits = (index: string, explain: boolean) => HITS.map((row, i) => {
  const [id, title, , , score] = row as any[];
  const hit: any = { _id: id, _index: index || 'research_report', _score: score, _source: sourceOf(row) };
  if (explain) {
    hit._explanation = {
      value: score, description: 'sum of:', details: [
        { value: Number((score * 0.47).toFixed(3)), description: `weight(title:${title} in ${i}) [PerFieldSimilarity], result of:`, details: [
          { value: Number((score * 0.47).toFixed(3)), description: 'score(freq=1.0), computed as boost * idf * tf from:', details: [] },
        ] },
        { value: Number((score * 0.53).toFixed(3)), description: 'tfNorm, computed from:', details: [] },
      ],
    };
  }
  return hit;
});

const sqlColumns = [
  { name: 'title', type: 'text' }, { name: 'issuer_name', type: 'text' }, { name: 'bond_code', type: 'keyword' },
  { name: 'publish_time', type: 'date' }, { name: 'score', type: 'double' }, { name: 'region', type: 'keyword' },
  { name: 'amount', type: 'double' }, { name: 'status', type: 'keyword' },
];
const sqlRows = [
  ['宁德时代2026年第一期中期票据募集说明书', '宁德时代新能源科技股份有限公司', '042600001.IB', '2026-01-18T09:00:00Z', 0.9321, '福建', 500000000, '存续'],
  ['中国工商银行2025年度报告摘要', '中国工商银行股份有限公司', '113052.SH', '2026-03-28T16:30:00Z', 0.8814, '北京', 1200000000, '已披露'],
  ['城投债区域信用利差跟踪周报', '中诚信国际信用评级有限责任公司', 'CNTY2026-0412', '2026-04-12T08:00:00Z', 0.7642, '全国', 0, '已发布'],
  ['新能源车产业链景气度观察', '申万宏源证券有限公司', 'RPT2026-1188', '2026-04-20T10:15:00Z', 0.6550, '上海', 0, '已发布'],
  ['某省交通投资集团主体评级报告', '联合资信评估股份有限公司', 'CR2026-0021', '2026-02-09T11:20:00Z', 0.7125, '湖北', 0, '存续'],
];

const tasks = [
  { action: 'indices:data/write/reindex', taskId: 'node-1:101', type: 'transport', startTimeInMillis: now - 5200, runningTimeNanos: 5_200_000_000, description: 'reindex from [research_report] to [research_report_v2]', node: 'node-1' },
  { action: 'indices:data/read/search', taskId: 'node-1:102', type: 'direct', startTimeInMillis: now - 800, runningTimeNanos: 120_000_000, description: 'search research_report', node: 'node-1' },
];

const monitorRecords = Array.from({ length: 12 }, (_, i) => {
  const ts = now - (11 - i) * 5000;
  return {
    ts, timestamp: ts, scope: 'cluster', connId: 'demo', connName: '演示集群',
    clusterName: '演示集群', qps: 30 + i * 2, idxRate: 4 + (i % 3), lat: 10 + (i % 5), docs: 192,
    storeBytes: 4194304, jvmHeapUsedPct: 0.42, cpuPct: 0.18, diskUsedPct: 0.55,
  };
});

const json = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const error = (reason: string, type = 'verification_exception') =>
  json({ error: { type, reason }, status: 400 }, 400);

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(rawUrl, window.location.href);
  const p = u.pathname;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let body = '';
  if (typeof init?.body === 'string') body = init.body;
  else if (input instanceof Request) body = await input.clone().text().catch(() => '');

  /* Control plane */
  if (p.endsWith('/auth/me')) {
    return json({ username: 'demo', displayName: '演示用户', role: 'ADMIN', delegated: true, grantedPages: null });
  }
  if (p.endsWith('/setup/status')) {
    return json({ authEnabled: false, hostVisible: true, builtinLogin: true, bound: true, appName: 'ESQueryStudio 演示集群' });
  }
  if (p.endsWith('/ui/config')) {
    return json({ product: { name: 'ESQueryStudio', tagline: '演示集群 · 合成数据' }, packs: [], disabledPages: [] });
  }
  if (p.endsWith('/clusters')) return json([]);
  if (p.includes('/adhoc-rebuild/jobs') || p.includes('/xmigrate/jobs')) return json([]);

  /* Cluster overview */
  if (p.endsWith('/cluster/indices')) return json(INDICES);
  if (p.endsWith('/cluster/health')) return json({ status: 'green', version: '8.13.0', unassigned_shards: 0, cluster_name: '演示集群（合成数据）' });
  if (p.endsWith('/cluster/shards')) return json([
    { index: 'research_report', shard: 0, prirep: 'p', state: 'STARTED', docs: 128, storeBytes: 3145728, node: 'node-1', ip: '127.0.0.1' },
    { index: 'research_report', shard: 0, prirep: 'r', state: 'STARTED', docs: 128, storeBytes: 3145728, node: 'node-2', ip: '127.0.0.2' },
    { index: 'bond_issuer', shard: 0, prirep: 'p', state: 'STARTED', docs: 64, storeBytes: 1048576, node: 'node-1', ip: '127.0.0.1' },
  ]);
  if (p.endsWith('/overview')) return json({});
  if (p.endsWith('/cluster/aliases')) return json([
    { alias: 'research_report', index: 'research_report_v1', isWriteIndex: true, filter: null, routing: null },
    { alias: 'research_report', index: 'research_report_v2', isWriteIndex: false, filter: null, routing: null },
    { alias: 'bond_live', index: 'bond_issuer', isWriteIndex: true, filter: '{"term":{"status":"ACTIVE"}}', routing: null },
  ]);
  if (p.endsWith('/cluster/pending-tasks')) return json([
    { priority: 'URGENT', source: 'reindex:research_report', time_in_queue: '1.2s', time_in_queue_millis: 1200 },
    { priority: 'HIGH', source: 'shard_snapshot[research_report][0]', time_in_queue_millis: 830 },
  ]);

  /* Monitoring */
  if (p.includes('/monitor-metrics/top-indexes')) return json({ records: [
    { cluster: '演示集群', index: 'research_report', connId: 'demo', qps: 42, idxRate: 7, lat: 12, latencyMs: 12 },
    { cluster: '演示集群', index: 'bond_issuer', connId: 'demo', qps: 11, idxRate: 2, lat: 31, latencyMs: 31 },
  ] });
  if (p.includes('/monitor-history')) return json({ records: Array.from({ length: 6 }, (_, i) => ({
    timestamp: now - i * 60000, connId: 'demo', connName: '演示集群', env: 'demo', status: 'green', latencyMs: 12, esVersion: '8.13.0',
  })) });
  if (p.includes('/monitor-alerts')) return json({ records: [] });
  if (p.includes('/monitor-metrics')) return json({ records: monitorRecords });

  /* Mapping / settings */
  if (p.endsWith('/cluster/inspect')) return json({ mappings: { research_report: { properties: PROPERTIES }, bond_issuer: { properties: PROPERTIES } }, settings: {}, sample: [] });
  if (p.endsWith('/cluster/mapping-detail')) {
    const tree = Object.entries(PROPERTIES).map(([name, d]: any) => ({
      name, type: d.type || (d.properties ? 'object' : 'unknown'),
      multiFields: d.fields ? Object.keys(d.fields).map(k => ({ name: k, type: d.fields[k].type })) : undefined,
      children: d.properties ? Object.entries(d.properties).map(([n, x]: any) => ({ name: n, type: x.type })) : undefined,
    }));
    return json({ raw: { properties: PROPERTIES }, tree, stats: { total: Object.keys(PROPERTIES).length, text: 2 } });
  }
  if (p.endsWith('/cluster/index-settings')) return json({ research_report: { settings: { index: { refresh_interval: '1s', number_of_replicas: '1', number_of_shards: '1', codec: 'default' } } } });
  if (p.endsWith('/cluster/analysis-settings')) return json({ analysis: {
    analyzer: { default: { type: 'standard' }, title_analyzer: { type: 'custom', tokenizer: 'standard', filter: ['lowercase'] } },
    tokenizer: { edge_ngram_tk: { type: 'edge_ngram', min_gram: 2, max_gram: 10 } },
    filter: { my_synonyms: { type: 'synonym', synonyms: ['研报,研究报告'] } },
    char_filter: { html_strip_cf: { type: 'html_strip' } },
    normalizer: { lower_norm: { type: 'custom', filter: ['lowercase'] } },
  } });
  if (p.endsWith('/cluster/scripts') && method === 'GET') return json({ scripts: {
    score_by_recency: { lang: 'painless', source: "double s = doc['rank_score'].value; return s * 2;" },
    gate_by_status: { lang: 'painless', source: "return doc['status.keyword'].value == 'ACTIVE' ? 1.0 : 0.0;" },
  } });
  if (p.includes('/cluster/analyze')) {
    let text = '';
    try { text = String(JSON.parse(body || '{}').text ?? ''); } catch { /* empty */ }
    const tokens = [...text.matchAll(/\S+/g)].map((m, i) => ({ token: m[0], type: '<ALPHANUM>', position: i, start_offset: m.index, end_offset: (m.index || 0) + m[0].length }));
    return json({ tokens });
  }

  /* Query workbench */
  if (p.includes('/cluster/query')) {
    const index = u.searchParams.get('index') || 'research_report';
    return json({ total: 128, totalGte: false, took: 2, shards: { total: 1, successful: 1, failed: 0 }, hits: searchHits(index) });
  }
  if (p.includes('/cluster/search-dsl')) {
    const index = u.searchParams.get('index') || 'research_report';
    const size = Math.min(Number((body.match(/"size"\s*:\s*(\d+)/) || [])[1] || 3), 5);
    return json({
      took: 2, timed_out: false, _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 128, relation: 'eq' }, max_score: 3.42, hits: rawHits(index, u.searchParams.get('explain') === 'true').slice(0, size) },
    });
  }
  if (p.includes('/cluster/search-raw')) {
    const index = u.searchParams.get('index') || 'research_report';
    const size = Math.min(Number((body.match(/"size"\s*:\s*(\d+)/) || [])[1] || 5), 5);
    return json({
      took: 2, timed_out: false, _shards: { total: 1, successful: 1, failed: 0 },
      hits: { total: { value: 128, relation: 'eq' }, max_score: 3.42, hits: rawHits(index, body.includes('"explain":true')).slice(0, size) },
    });
  }
  if (p.includes('/cluster/explain-doc')) {
    return json({ matched: true, _index: u.searchParams.get('index') || 'research_report', explanation: {
      value: 3.42, description: 'sum of:', details: [
        { value: 1.6, description: 'weight(title:研报) [PerFieldSimilarity], result of:', details: [
          { value: 1.6, description: 'score(freq=1.0), computed as boost * idf * tf from:', details: [] },
        ] },
        { value: 1.82, description: 'tfNorm, computed from:', details: [] },
      ],
    } });
  }
  if (p.includes('/cluster/validate-query')) return json({ ok: true, issues: [] });

  /* SQL */
  if (p.endsWith('/cluster/sql/translate')) return json([{ size: 10 }]);
  if (p.includes('/cluster/sql/cursor')) return json({ columns: [{ name: 'title', type: 'text' }], rows: [['第二页结果']], cursor: null });
  if (p.includes('/cluster/sql/query') || p.includes('/cluster/sql/lenient')) {
    if (body.includes('ARRAYERR') && !p.includes('/lenient')) return error('Arrays are not supported for field [tags]');
    return json({ columns: sqlColumns, rows: sqlRows, cursor: null });
  }

  /* Tasks / lifecycle / observability */
  if (p.includes('/cluster/tasks')) return json(tasks);
  if (p.includes('/cluster/snapshot/status')) return json({ repositories: 1, snapshots: 2, running: 0 });
  if (p.includes('/cluster/snapshot/repos')) return json([{ name: 'demo-backup', type: 'fs', settings: { location: '/demo/backup' } }]);
  if (p.includes('/cluster/snapshot/list')) return json([
    { snapshot: 'daily-2026-11-05', repository: 'demo-backup', state: 'SUCCESS', startTimeInMillis: now - 86400000, endTimeInMillis: now - 86340000, durationInMillis: 60000, indices: ['research_report', 'bond_issuer'], shards: { total: 4, failed: 0, successful: 4 } },
    { snapshot: 'daily-2026-11-04', repository: 'demo-backup', state: 'PARTIAL', startTimeInMillis: now - 172800000, endTimeInMillis: now - 172740000, durationInMillis: 60000, indices: ['research_report'], shards: { total: 4, failed: 1, successful: 3 } },
  ]);
  if (p.includes('/cluster/slm/policies')) return json([{ name: 'nightly-backup', schedule: '0 30 1 * * ?', repository: 'demo-backup', config: { indices: ['*'] }, retention: { expireAfter: '30d', minCount: 5, maxCount: 50 }, stats: { snapshotsTaken: 42, snapshotsFailed: 1, lastSuccess: { snapshotName: 'daily-2026-11-05', time: '2026-11-05T01:30:00Z' } } }]);
  if (p.includes('/cluster/ilm/policies') && method === 'GET') return json([
    { name: 'logs-hot-warm', version: 3, modified_date: '2026-10-20T10:00:00.000Z', policy: { phases: { hot: { min_age: '0ms', actions: { rollover: { max_primary_shard_size: '30gb' } } }, warm: { min_age: '7d', actions: { forcemerge: { max_num_segments: 1 } } }, delete: { min_age: '30d', actions: { delete: {} } } } } },
  ]);
  if (p.includes('/cluster/health-report')) return json({ generatedAt: new Date().toISOString(), status: 'yellow', sections: [{ id: 'shards', title: '分片', level: 'warn', items: [{ label: '未分配分片', value: '0', hint: '演示集群无未分配分片' }] }], summary: { green: 6, yellow: 2, red: 0 } });
  if (p.includes('/cluster/plugins')) return json({ nodes: ['node-1', 'node-2'], plugins: [{ name: 'analysis-icu', version: '9.1.0', description: 'ICU analysis', components: ['Analysis'], hosts: ['node-1', 'node-2'] }] });
  if (p.includes('/cluster/templates')) return json({ index_templates: [], component_templates: [], legacy: false });

  /* Devtools / raw REST */
  if (p.includes('/cluster/raw')) return json({ status: 200, body: { acknowledged: true, demo: true } });
  if (p.endsWith('/cluster/devtools/execute')) return json({ status: 200, body: { acknowledged: true, demo: true } });

  /* Generic list/object fallbacks keep the remaining pages navigable. */
  if (method === 'GET') return json([]);
  return json({});
}
