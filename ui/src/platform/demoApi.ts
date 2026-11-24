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
  /* 688：只有 _class/sentimentId/title 的索引（对齐产线直方图空态截图）——
     无 date、无低基 keyword、无 .keyword 子字段：演示「字段诊断 + 手动选 ID 出词条图」 */
  { index: 'sentiment_title', health: 'green', status: 'open', 'docs.count': '2', 'store.size': '10kb', pri: '1' },
];

const HITS = [
  ['rr-0001', '2026 Q3 半导体行业深度研报', '华泰证券', '2026-10-12', 3.42],
  ['rr-0002', '新能源车产业链专题：固态电池拐点', '中信建投', '2026-10-09', 3.18],
  ['rr-0003', 'AI 算力基础设施年度展望', '国泰君安', '2026-10-06', 2.97],
  ['rr-0004', '消费复苏跟踪：白酒渠道库存', '招商证券', '2026-09-28', 2.71],
  ['rr-0005', '高股息策略：公用事业配置价值', '广发证券', '2026-09-21', 2.55],
];

/* 迁移演示作业与事件时间线（合成数据）：页面「事件时间线 → 回放」可在演示站直接体验 */
const DEMO_XM_JOBS = [{
  jobId: 'demo-xm-20261124', status: 'DONE', sourceIndex: 'research_report', destIndex: 'research_report_uat',
  remoteEndpoint: 'http://prod-es.internal:9200', srcConnId: 'demo-src',
  migrated: 12800, total: 12800, conflicts: 0, errors: 0,
  createTime: now - 9 * 60_000, startedAtMs: now - 8 * 60_000, finishedAtMs: now - 60_000,
  sliceStatus: { '0': 'DONE', '1': 'DONE', '2': 'DONE' },
  sliceMigrated: { '0': 4267, '1': 4267, '2': 4266 }, sliceErrors: { '0': 0, '1': 0, '2': 0 },
  destCreateMode: 'CREATE', tuneMode: 'GENTLE', slices: 3, batchSize: 500,
}];
const DEMO_XM_EVENTS = [
  { ts: now - 8 * 60_000, stage: 'STARTED', level: 'info', message: '迁移作业已启动：research_report → research_report_uat（3 分片，批量 500）' },
  { ts: now - 7 * 60_000 - 20_000, stage: 'RESOLVE', level: 'info', message: '源索引与目标索引解析完成，目标映射兼容性预检通过' },
  { ts: now - 5 * 60_000, stage: 'COPY', level: 'info', message: '已迁移 4,267 / 12,800（33%），当前速率 860 docs/s' },
  { ts: now - 3 * 60_000 - 30_000, stage: 'THROTTLE', level: 'warn', message: '检测到目标写入延迟升高，速率自适应下调至 420 docs/s' },
  { ts: now - 2 * 60_000, stage: 'COPY', level: 'info', message: '已迁移 12,800 / 12,800（100%），等待切片收尾' },
  { ts: now - 90_000, stage: 'GATE_SWITCH', level: 'warn', message: '别名切换确认门：等待人工放行（pauseBeforeSwitch=true）' },
  { ts: now - 75_000, stage: 'RECONCILE', level: 'info', message: '双侧文档数对账一致：源 12,800 / 目标 12,800' },
  { ts: now - 60_000, stage: 'DONE', level: 'info', message: '迁移完成，别名已指向目标索引；可执行等价验证复核' },
];

/* 安全中心演示数据：审计流水 / 用户 / 连接档案（全部合成，供演示站直接体验可读性与连接管理） */
const DEMO_USERS = [
  { username: 'demo', displayName: '演示用户', role: 'ADMIN', updatedAt: now - 2 * 3600e3 },
  { username: 'zhangfei', displayName: '张飞鸿', role: 'VIEWER', updatedAt: now - 26 * 3600e3 },
  { username: 'luowen', displayName: '罗淑文', role: 'OPERATOR', updatedAt: now - 52 * 3600e3 },
];
const DEMO_CONNS = [
  {
    id: 'demo-qa', name: '演示集群 · QA', scheme: 'http', host: '127.0.0.1', port: 9200,
    username: 'elastic', hasPassword: true, env: 'QA', authType: 'BASIC', minRole: 'VIEWER',
    connectTimeoutMs: null, socketTimeoutMs: null, esVersion: '8.13.0', syncState: 'SYNCED',
    health: { status: 'GREEN', latencyMs: 12, version: '8.13.0' },
  },
  {
    id: 'demo-uat', name: '演示集群 · UAT', scheme: 'https', host: 'es-uat.internal', port: 9243,
    username: 'es_uat', hasPassword: true, env: 'STAGING', authType: 'BASIC', minRole: 'VIEWER',
    connectTimeoutMs: 5000, socketTimeoutMs: 60000, esVersion: '7.10.2', syncState: 'SYNCED',
    health: { status: 'GREEN', latencyMs: 48, version: '7.10.2' },
  },
  {
    id: 'demo-prod', name: '演示集群 · 生产', scheme: 'https', host: 'es-prod.internal', port: 9243,
    username: 'es_prod', hasPassword: true, env: 'PROD', authType: 'API_KEY', minRole: 'VIEWER',
    connectTimeoutMs: null, socketTimeoutMs: null, esVersion: '8.13.0', syncState: 'SYNCED',
    health: { status: 'UNKNOWN' },
  },
];
const AUDIT_AUTHORS = [
  ['demo', '演示用户', 'ADMIN'],
  ['zhangfei', '张飞鸿', 'VIEWER'],
  ['luowen', '罗淑文', 'OPERATOR'],
] as const;
const AUDIT_ACTIONS = [
  ['LOGIN', '-', '-', 200, '宿主委托会话'],
  ['WRITE', 'PUT', '/internal/es/index/research_report/_doc/rr-0009', 200, '{"docs":1,"refresh":"wait_for"}'],
  ['HIGH_RISK', 'POST', '/cluster/raw', 200, 'raw=POST /_cluster/reroute'],
  ['PAGE_DENIED', 'GET', '/internal/es/auth/users', 403, 'denied: page security.users (role VIEWER)'],
  ['READ', 'GET', '/internal/es/index/research_report/_search', 200, '{"query":{"match_all":{}},"size":20}'],
  ['WRITE', 'POST', '/internal/es/config-lab/validate', 200, '{"valid":true,"warnings":0}'],
] as const;
const DEMO_AUDIT = Array.from({ length: 14 }, (_, i) => {
  const [username, displayName, role] = AUDIT_AUTHORS[i % AUDIT_AUTHORS.length]!;
  const [action, method, uri, httpStatus, detail] = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length]!;
  const conn = DEMO_CONNS[i % DEMO_CONNS.length]!;
  return {
    timestamp: now - i * 47 * 60_000,
    username, displayName, role, source: i % 5 === 0 ? 'host' : 'console',
    action, method, uri,
    connId: conn.id, connName: conn.name,
    ip: i % 2 ? '192.168.10.128' : '192.168.10.175',
    httpStatus, costMs: 14 + i * 7, detail,
  };
});
/* 688：审计分面由 demoAuditFacetsNow() 从内存态实时派生（写动作后立即反映） */

/* ═══ 688：演示站交互层 ═══
 演示站的写动作在内存里模拟并立即反映到后续读取（刷新回初始快照）；长任务（托管重建/
 跨集群迁移）按读取时钟 1.6s 推进到终态，让「启动 → 监控 → 事件回放 → 对账」整条动线
 都能点出来评审。页面顶部横幅已注明全部数据为合成数据。 */
const DEMO_ALIASES = [
  { alias: 'research_report', index: 'research_report_v1', isWriteIndex: true, filter: null, routing: null },
  { alias: 'research_report', index: 'research_report_v2', isWriteIndex: false, filter: null, routing: null },
  { alias: 'bond_live', index: 'bond_issuer', isWriteIndex: true, filter: '{"term":{"status":"ACTIVE"}}', routing: null },
];
const demoState = {
  conns: DEMO_CONNS.map(c => ({ ...c })) as any[],
  users: DEMO_USERS.map(u => ({ ...u })) as any[],
  audit: [...DEMO_AUDIT] as any[],
  aliases: DEMO_ALIASES.map(a => ({ ...a })) as any[],
  adhoc: [] as any[],
  xm: DEMO_XM_JOBS.map(j => ({ ...j, events: [...DEMO_XM_EVENTS] })) as any[],
  plans: [{
    planId: 'demo-plan-1', srcConnId: 'demo-prod', sourceIndex: 'research_report',
    destConnId: 'demo-uat', destIndex: 'research_report_uat', mode: 'SMART_SYNC',
    autoTune: true, syncAliases: true, planDigest: 'demo-digest-1',
    savedAtMs: now - 3 * 3600e3, appliedAtMs: null, appliedCount: 0,
  }] as any[],
  seq: 0,
};
const DEMO_JOB_MS = 1600;
function demoNewId(prefix: string) { return `${prefix}-${(++demoState.seq).toString(36)}`; }
function demoAdvanceAdhoc(job: any) {
  if (!job || job.status !== 'RUNNING') return job;
  const elapsed = Date.now() - (job._startedAt || 0);
  job.created = Math.min(job.total, Math.round(job.total * Math.min(1, elapsed / DEMO_JOB_MS)));
  job.tookMs = elapsed;
  if (elapsed >= DEMO_JOB_MS) {
    job.status = 'SUCCEEDED'; job.stage = 'DONE'; job.created = job.total; job.tookMs = elapsed;
    job.finishedAt = Date.now();
    (job.events ||= []).push({ ts: Date.now(), stage: 'DONE', level: 'info', message: '演示作业完成：别名已切换（合成数据）' });
  }
  return job;
}
function demoAdhocStart(req: any) {
  const src = String(req?.index || 'research_report');
  const dest = String(req?.destIndex || `${src}_adhoc_demo`);
  const job: any = {
    jobId: demoNewId('demo-arb'), status: 'RUNNING', stage: 'FULL_REINDEX',
    logicalName: src, strategy: req?.strategy || 'ALIAS_SWAP',
    sourceIndex: src, sourcePhysical: src, destIndex: dest, destPhysical: dest, alias: src,
    total: 12800, created: 0, updated: 0, startedAt: Date.now(), tookMs: 0,
    pauseBeforeSwitch: !!req?.pauseBeforeSwitch, deleteOldIndex: !!req?.deleteOldIndex,
    rounds: [], _startedAt: Date.now(),
    events: [
      { ts: Date.now(), stage: 'STARTED', level: 'info', message: `演示作业启动：${src} → ${dest}（合成数据）` },
      { ts: Date.now(), stage: 'FULL_REINDEX', level: 'info', message: '全量写入开始（模拟 12,800 文档）' },
    ],
  };
  demoState.adhoc.unshift(job);
  return job;
}
function demoAdvanceXm(job: any) {
  if (!job || job.status !== 'RUNNING') return job;
  const elapsed = Date.now() - (job._startedAt || 0);
  const p = Math.min(1, elapsed / DEMO_JOB_MS);
  job.migrated = Math.round(job.total * p);
  job.sliceMigrated = { '0': Math.round(job.migrated / 2), '1': job.migrated - Math.round(job.migrated / 2) };
  if (p >= 1) {
    job.status = 'DONE'; job.migrated = job.total; job.conflicts = 2;
    job.conflictSamples = ['rr-0003', 'rr-0007'];
    job.finishedAtMs = Date.now();
    job.sliceStatus = { '0': 'DONE', '1': 'DONE' };
    (job.events ||= []).push({ ts: Date.now(), stage: 'DONE', level: 'info', message: '演示迁移完成：目标计数与源一致（合成数据）' });
  }
  return job;
}
function demoXmStart(req: any) {
  const src = String(req?.sourceIndex || 'research_report');
  const job: any = {
    jobId: demoNewId('demo-xm'), status: 'RUNNING', sourceIndex: src,
    destIndex: String(req?.destIndex || `${src}_uat`),
    remoteEndpoint: String(req?.remoteEndpoint || 'http://prod-es.internal:9200'),
    srcConnId: req?.srcConnId || 'demo-prod', destConnId: req?.destConnId || 'demo-uat',
    migrated: 0, total: 12800, conflicts: 0, errors: 0,
    createTime: Date.now(), startedAtMs: Date.now(),
    sliceStatus: { '0': 'RUNNING', '1': 'RUNNING' }, sliceMigrated: { '0': 0, '1': 0 }, sliceErrors: { '0': 0, '1': 0 },
    destCreateMode: req?.destCreateMode || 'CREATE', tuneMode: req?.tuneMode || 'GENTLE',
    slices: 2, batchSize: 500, _startedAt: Date.now(),
    events: [
      { ts: Date.now(), stage: 'STARTED', level: 'info', message: '演示迁移已启动（合成数据）' },
      { ts: Date.now(), stage: 'COPY', level: 'info', message: '开始搬运 12,800 文档（2 分片）' },
    ],
  };
  demoState.xm.unshift(job);
  return job;
}
function demoJobBy(list: any[], jobId: string | null) { return list.find(j => j.jobId === jobId) || null; }
function demoBody(s: string): any { try { return s ? JSON.parse(s) : {}; } catch { return {}; } }
function demoPort(u: URL | null, fallback = 9200) { return Number(u?.port || (u?.protocol === 'https:' ? 9243 : fallback)); }
function demoAuditFacetsNow() {
  const acts = [...new Set(demoState.audit.map(r => r.action))];
  return {
    actions: acts.map(key => ({ key, count: demoState.audit.filter(r => r.action === key).length })),
    conns: demoState.conns.map(c => ({ key: c.name, count: demoState.audit.filter(r => r.connName === c.name).length })),
    users: [...new Set(demoState.audit.map(r => r.username))].map(key => ({ key, count: demoState.audit.filter(r => r.username === key).length })),
    uris: [...new Set(demoState.audit.map(r => r.uri))].filter(x => x !== '-').map(key => ({ key, count: demoState.audit.filter(r => r.uri === key).length })),
  };
}

const sourceOf = ([, title, issuer, date, score]: any[]) => ({
  title, status: 'ACTIVE', issuer_name: issuer, publish_time: date, score,
  region: '上海', amount: 500000000, tags: ['研报', '深度'],
});

/* 688：直方图空态复现索引（产线 bond_management_sentiment_title 同形） */
const TITLE_ONLY_PROPERTIES: Record<string, any> = {
  _class: { type: 'keyword' },
  sentimentId: { type: 'keyword' },
  title: { type: 'text' },
};
const TITLE_ONLY_DOCS = [
  { _class: 'com.innodealing.onshore.bond.management.model.es.SentimentTitleEs', sentimentId: '2024062400006803602', title: '方正宏观：哪些专项债未披露“一案两书”？' },
  { _class: 'com.innodealing.onshore.bond.management.model.es.SentimentTitleEs', sentimentId: '2024121600007523062', title: '平阴县低空经济特许经营权出让项目中止招标' },
];
const propsFor = (index: string) => index === 'sentiment_title' ? TITLE_ONLY_PROPERTIES : PROPERTIES;

/* 688：直方图聚合演示——按 __hist 的聚合类型返回桶，让「自动时间/词条/数值/手动选择」都能出图 */
function demoHistAggs(index: string, body: string): Record<string, unknown> {
  if (!body.includes('"__hist"')) return {};
  if (index === 'sentiment_title' && body.includes('"terms"')) {
    return { __hist: { buckets: TITLE_ONLY_DOCS.map(d => ({ key: String(d.sentimentId), doc_count: 1 })) } };
  }
  if (body.includes('"terms"')) {
    return { __hist: { buckets: [{ key: 'ACTIVE', doc_count: 3 }, { key: 'ARCHIVED', doc_count: 1 }, { key: 'DRAFT', doc_count: 1 }] } };
  }
  if (body.includes('"histogram"')) {
    return { __hist: { buckets: [2.55, 2.71, 2.97, 3.18, 3.42].map(v => ({ key: v, doc_count: 1 })) } };
  }
  const start = Date.UTC(2026, 9, 6);
  return { __hist: { buckets: [3, 5, 8, 6, 4, 2].map((n, i) => ({
    key: start + i * 86400000, key_as_string: new Date(start + i * 86400000).toISOString(), doc_count: n,
  })) } };
}

const searchHits = (index: string) => (index === 'sentiment_title' ? TITLE_ONLY_DOCS.map((doc, i) => ({
  _id: 'sent-' + i, _index: index, _score: 1, _source: doc,
})) : HITS.map((row, i) => {
  const [id, title, , , score] = row as any[];
  return {
    _id: id, _index: index || 'research_report', _score: score,
    _source: sourceOf(row), highlight: { title: [`<em class="hl">${String(title).slice(0, 8)}</em>${String(title).slice(8)}`] },
  };
}));

const rawHits = (index: string, explain: boolean) => (index === 'sentiment_title' ? TITLE_ONLY_DOCS.map((doc, i) => ({
  _id: 'sent-' + i, _index: index, _score: 1, _source: doc,
})) : HITS.map((row, i) => {
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
}));

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
  /* 安全中心（688：演示站烘全只读面 + 可点击写动作，内存态立即反映到后续读取） */
  if (method === 'GET' && p.endsWith('/auth/ops-audit')) {
    const username = u.searchParams.get('username') || '';
    const action = u.searchParams.get('action') || '';
    const connName = u.searchParams.get('connName') || '';
    const rows = demoState.audit.filter(r =>
      (!username || r.username === username) && (!action || r.action === action) && (!connName || r.connName === connName));
    return json({ records: rows });
  }
  if (method === 'GET' && p.endsWith('/auth/ops-audit/mine')) return json({ records: demoState.audit.filter(r => r.username === 'demo') });
  if (method === 'GET' && p.endsWith('/auth/audit-facets')) return json(demoAuditFacetsNow());
  if (method === 'GET' && p.endsWith('/auth/users')) return json(demoState.users);
  if (method === 'POST' && p.endsWith('/auth/users/upsert')) {
    const b = demoBody(body);
    const ex = demoState.users.find(x => x.username === b.username);
    if (ex) Object.assign(ex, { role: b.role || ex.role, updatedAt: Date.now() });
    else demoState.users.push({ username: b.username, displayName: b.username, role: b.role || 'VIEWER', updatedAt: Date.now() });
    return json({ ok: true });
  }
  if (method === 'POST' && p.endsWith('/auth/users/delete')) {
    const username = u.searchParams.get('username') || '';
    demoState.users = demoState.users.filter(x => x.username !== username);
    return json({ ok: true });
  }
  /* 连接档案：保存/删除即时生效（同页列表/切换器立即反映）；测试/探活恒成功 */
  if (method === 'GET' && p.endsWith('/clusters')) return json(demoState.conns);
  if (method === 'POST' && p.endsWith('/clusters/save')) {
    const b = demoBody(body);
    let parsed: URL | null = null;
    try { parsed = new URL(String(b.url || '')); } catch {}
    const fields = {
      name: b.name || '演示连接', scheme: (parsed?.protocol || 'http:').replace(':', ''),
      host: parsed?.hostname || '127.0.0.1', port: demoPort(parsed), username: b.username || '',
      hasPassword: !!b.password, env: b.env || '', authType: b.authType || 'BASIC',
      minRole: b.minRole || 'VIEWER', connectTimeoutMs: b.connectTimeoutMs ?? null,
      socketTimeoutMs: b.socketTimeoutMs ?? null, syncState: 'SYNCED', health: { status: 'UNKNOWN' },
    };
    const ex = demoState.conns.find(c => c.id === b.id);
    if (ex) Object.assign(ex, fields);
    else demoState.conns.push({ id: demoNewId('demo-conn'), esVersion: '8.13.0', ...fields });
    return json({ ok: true });
  }
  if (method === 'POST' && p.endsWith('/clusters/delete')) {
    const id = u.searchParams.get('id');
    demoState.conns = demoState.conns.filter(c => c.id !== id);
    return json({ ok: true });
  }
  if (method === 'POST' && p.endsWith('/clusters/test')) return json({ ok: true, clusterName: '演示集群（合成数据）', version: '8.13.0', status: 'GREEN', nodes: 2 });
  if (method === 'POST' && /\/clusters\/[^/]+\/probe$/.test(p)) return json({ status: 'GREEN', latencyMs: 12, version: '8.13.0' });
  /* 别名写动作：内存态生效，刷新别名表可见 */
  if (method === 'POST' && p.endsWith('/cluster/alias-actions')) {
    const b = demoBody(body);
    const alias = String(b.alias || '');
    const index = String(b.index || '');
    for (const a of demoState.aliases.filter(x => x.alias === alias && x.isWriteIndex)) a.isWriteIndex = false;
    if (b.action === 'remove' || b.action === 'delete') demoState.aliases = demoState.aliases.filter(x => !(x.alias === alias && x.index === index));
    else demoState.aliases.push({ alias, index, isWriteIndex: !!b.writeIndex, filter: b.filter || null, routing: b.routing || null });
    return json({ ok: true, applied: 1 });
  }
  /* Watcher / 远程集群 / 模板：演示站给出可点样例 */
  if (method === 'GET' && p.endsWith('/cluster/watcher')) return json({
    available: true,
    watches: { hits: { hits: [{ _id: 'demo-watch-latency', _source: {
      trigger: { schedule: { interval: '5m' } },
      input: { search: { request: { indices: ['research_report'], body: { query: { match_all: {} } } } } },
      condition: { compare: { 'ctx.payload.hits.total': { gt: 100 } } },
      actions: { notify: { webhook: { method: 'POST', url: 'https://hooks.example.com/demo' } } },
      metadata: { demo: true },
    } }] } },
    stats: { total: 1, active: 1 },
  });
  if (method === 'GET' && p.endsWith('/cluster/remote-clusters')) return json([
    { name: 'uat-remote', seeds: ['10.0.0.12:9300'], mode: 'sniff', connected: true, nodes: 3, skipUnavailable: false },
  ]);
  if (method === 'GET' && p.endsWith('/cluster/snapshot/repos')) return json([{ name: 'demo-backup', type: 'fs', settings: { location: '/demo/backup' } }]);
  if (method === 'GET' && p.endsWith('/cluster/templates')) return json({
    index_templates: [{
      name: 'research_report_template', index_patterns: ['research_report*'], composed_of: [], priority: 100,
      template: { settings: { number_of_shards: 3, number_of_replicas: 1 }, mappings: { properties: PROPERTIES } },
    }],
    component_templates: [{ name: 'base_component', template: { settings: { 'index.refresh_interval': '1s' } } }],
    legacy: false,
  });
  /* ═══ 688：托管重建（演示站可点全动线：探测 → 启动 → 监控 → 中止/限速/放行 → 事件回放）═══ */
  if (p.includes('/adhoc-rebuild/')) {
    const jobId = u.searchParams.get('jobId');
    const mEvents = p.match(/\/adhoc-rebuild\/jobs\/([^/]+)\/events$/);
    const mThrottle = p.match(/\/adhoc-rebuild\/jobs\/([^/]+)\/throttle$/);
    const mDelete = p.match(/\/adhoc-rebuild\/jobs\/([^/]+)$/);
    if (method === 'GET' && p.endsWith('/adhoc-rebuild/prepare')) {
      const index = u.searchParams.get('index') || 'research_report';
      return json({
        index, physical: index, exists: true, docs: 128,
        settingsJson: JSON.stringify({ index: { number_of_shards: 3, number_of_replicas: 1, refresh_interval: '1s' } }, null, 2),
        mappingJson: JSON.stringify({ properties: PROPERTIES }, null, 2),
        suggestedDest: index + '_adhoc_demo', timeFieldCandidates: [{ field: 'publish_time', type: 'date' }],
        aliases: [index],
      });
    }
    if (method === 'POST' && p.endsWith('/adhoc-rebuild/start')) {
      const j = demoAdhocStart(demoBody(body));
      return json({ jobId: j.jobId, job: j });
    }
    if (method === 'GET' && p.endsWith('/adhoc-rebuild/status')) return json(demoAdvanceAdhoc(demoJobBy(demoState.adhoc, jobId)) || {});
    if (method === 'POST' && p.endsWith('/adhoc-rebuild/abort')) {
      const j = demoJobBy(demoState.adhoc, jobId);
      if (j) { j.status = 'ABORTED'; j.stage = 'ABORTED'; (j.events ||= []).push({ ts: Date.now(), stage: 'ABORTED', level: 'warn', message: '演示：中止已受理（合成数据）' }); }
      return json(j || {});
    }
    if (method === 'POST' && p.endsWith('/adhoc-rebuild/confirm-switch')) {
      const j = demoJobBy(demoState.adhoc, jobId);
      if (j) { j.status = 'SUCCEEDED'; j.stage = 'DONE'; j.created = j.total; j.tookMs = Date.now() - (j._startedAt || Date.now()); }
      return json(j || {});
    }
    if (method === 'POST' && p.endsWith('/adhoc-rebuild/retry')) {
      const b = demoBody(body);
      const src = demoJobBy(demoState.adhoc, String(b.jobId || ''));
      const j = demoAdhocStart({ index: src?.logicalName, strategy: src?.strategy, destIndex: src?.destIndex, ...(b.overrides || {}) });
      return json({ jobId: j.jobId, job: j });
    }
    if (method === 'GET' && p.endsWith('/adhoc-rebuild/jobs')) return json(demoState.adhoc.map(demoAdvanceAdhoc));
    if (mEvents) { const j = demoJobBy(demoState.adhoc, decodeURIComponent(mEvents[1])); return json({ events: j?.events || [] }); }
    if (mThrottle && method === 'POST') {
      const j = demoJobBy(demoState.adhoc, decodeURIComponent(mThrottle[1]));
      if (j) { j.throttleRps = demoBody(body).requestsPerSecond; (j.events ||= []).push({ ts: Date.now(), stage: 'THROTTLE', level: 'info', message: '演示：限速已调整（合成数据）' }); }
      return json(j || {});
    }
    if (mDelete && method === 'DELETE') { demoState.adhoc = demoState.adhoc.filter(j => j.jobId !== decodeURIComponent(mDelete[1])); return json({}); }
    if (method === 'DELETE' && p.endsWith('/adhoc-rebuild/jobs')) {
      const n = demoState.adhoc.length;
      demoState.adhoc = [];
      return json({ deleted: n });
    }
  }

  /* ═══ 688：跨集群迁移（列表/详情/事件/对账/冲突/预检/结构同步/智能同步/计划）═══ */
  if (p.includes('/xmigrate/')) {
    const xm = demoState.xm;
    const jobId = u.searchParams.get('jobId');
    const m = p.match(/\/xmigrate\/jobs\/([^/]+)\/(events|reconcile|conflicts)$/);
    if (method === 'GET' && /\/xmigrate\/jobs$/.test(p)) return json(xm.map(demoAdvanceXm));
    if (method === 'GET' && /\/xmigrate\/progress$/.test(p)) return json(demoAdvanceXm(demoJobBy(xm, jobId)) || {});
    if (m) {
      const j = demoJobBy(xm, decodeURIComponent(m[1]));
      if (!j) return json({});
      if (m[2] === 'events') return json({ events: j.events || [] });
      if (m[2] === 'reconcile') return json({ sourceCount: j.total, destCount: j.migrated, diff: j.total - j.migrated, conflicts: j.conflicts ?? 0, conflictSamples: j.conflictSamples || [] });
      return json({ samples: (j.conflictSamples || []).map((_id: string) => ({ _id })), nextCursor: null, total: j.conflicts || 0 });
    }
    if (method === 'POST' && /\/xmigrate\/start$/.test(p)) { const j = demoXmStart(demoBody(body)); return json({ jobId: j.jobId, job: j }); }
    if (method === 'POST' && /\/xmigrate\/preflight$/.test(p)) return json({
      destExists: false, sourceDocs: 12800,
      fieldTypeCounts: { text: 2, keyword: 4, date: 1, double: 2, object: 1 },
      sourceAliases: ['research_report'], advice: [{ kind: 'shard', message: '目标数据节点 3 个：建议分片数 ≤ 3' }],
      recommended: { slices: 2, batchSize: 500 },
      warnings: ['演示：目标为腾讯云 7.10，部分 8.x 设置将被剔除（合成数据）'],
    });
    if (method === 'POST' && /\/xmigrate\/connect-check$/.test(p)) return json(INDICES.map(x => ({ index: x.index, docs: Number(x['docs.count']), size: x['store.size'], health: x.health })));
    if (method === 'POST' && /\/xmigrate\/resolve-preview$/.test(p)) return json({ sourceIndex: 'research_report', destIndex: 'research_report_uat', docs: 12800, aliases: ['research_report'] });
    if (method === 'POST' && /\/xmigrate\/fetch-config$/.test(p)) return json({ mapping: { properties: PROPERTIES }, settings: { index: { number_of_shards: '3', number_of_replicas: '1' } }, aliases: ['research_report'] });
    if (method === 'GET' && /\/xmigrate\/dest-indices$/.test(p)) return json(INDICES.map(x => x.index));
    if (method === 'POST' && /\/xmigrate\/abort$/.test(p)) { const j = demoJobBy(xm, jobId); if (j) { j.status = 'ABORTED'; (j.events ||= []).push({ ts: Date.now(), stage: 'ABORTED', level: 'warn', message: '演示：迁移已中止（合成数据）' }); } return json(j || {}); }
    if (method === 'POST' && /\/xmigrate\/resume$/.test(p)) { const j = demoJobBy(xm, jobId); if (j) { j.status = 'RUNNING'; j._startedAt = Date.now(); } return json({ jobId: j?.jobId, job: j }); }
    if (method === 'POST' && /\/xmigrate\/throttle$/.test(p)) return json({ ok: true, jobId, rps: demoBody(body).rps, appliedAt: Date.now() });
    if (method === 'POST' && /\/xmigrate\/sync-structure$/.test(p)) {
      const b = demoBody(body);
      return json({
        created: !b.dryRun, dryRun: !!b.dryRun, destIndex: b.destIndex || b.sourceIndex, rounds: 1, planDigest: 'demo-digest-1',
        source: { version: '8.13.0', vendor: { id: 'aliyun', label: '阿里云', evidence: 'distribution:default' } },
        target: { version: '7.10.2', vendor: { id: 'tencent', label: '腾讯云', evidence: 'plugin:analysis-ik' } },
        planned: { removedSettings: [{ key: 'index.downsample', reason: '目标 7.10 不支持 downsample（合成数据）' }], removedAnalysis: [], downgradedFields: [] },
        reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
        advice: [{ kind: 'replica', message: '目标副本可设 1' }],
        aliases: { synced: b.syncAliases ? ['research_report'] : [], skipped: [] },
        warnings: ['演示：自动剔除非兼容属性（合成数据）'],
      });
    }
    if (method === 'POST' && /\/xmigrate\/smart-sync$/.test(p)) {
      const b = demoBody(body);
      return json({
        verdict: b.apply ? 'APPLIED' : 'PLANNED', applied: !!b.apply, destIndex: b.destIndex || b.sourceIndex,
        planDigest: 'demo-digest-1', planId: b.savePlan ? 'demo-plan-2' : undefined, rounds: 1,
        source: { version: '8.13.0', vendor: { id: 'aliyun', label: '阿里云' } },
        target: { version: '7.10.2', vendor: { id: 'tencent', label: '腾讯云' } },
        planned: { removedSettings: [{ key: 'index.downsample', reason: '目标 7.10 不支持（合成数据）' }], removedAnalysis: [], downgradedFields: [] },
        reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
        advice: [], aliases: { synced: b.syncAliases ? ['research_report'] : [], skipped: [] }, warnings: [],
        body: { settings: { index: { number_of_shards: 2 } }, mappings: { properties: PROPERTIES } },
      });
    }
    if (method === 'GET' && /\/xmigrate\/plans$/.test(p)) return json({ plans: demoState.plans, cappedAt: 50 });
    if (method === 'POST' && /\/xmigrate\/plans\/apply$/.test(p)) {
      const b = demoBody(body);
      const plan = demoState.plans.find(x => x.planId === b.planId);
      if (plan) { plan.appliedAtMs = Date.now(); plan.appliedCount = (plan.appliedCount || 0) + 1; }
      return json({
        verdict: 'APPLIED', applied: true, planId: b.planId, destIndex: plan?.destIndex || 'research_report_uat', rounds: 1,
        source: { version: '8.13.0', vendor: { id: 'aliyun', label: '阿里云' } },
        target: { version: '7.10.2', vendor: { id: 'tencent', label: '腾讯云' } },
        planned: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
        reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
        advice: [], aliases: { synced: ['research_report'], skipped: [] }, warnings: [],
      });
    }
    if (method === 'POST' && /\/xmigrate\/diff-structure$/.test(p)) return json({ sourceIndex: 'research_report', destIndex: 'research_report', compatible: true, diffs: [], expectedRemovals: [], summary: { settings: 0, mapping: 0 } });
    if (method === 'POST' && /\/xmigrate\/compare-capabilities$/.test(p)) return json({
      src: { vendor: { id: 'aliyun', label: '阿里云' }, version: '8.13.0' },
      dest: { vendor: { id: 'tencent', label: '腾讯云' }, version: '7.10.2' },
      diff: { risks: [{ severity: 'warn', message: '目标版本 7.10 不支持部分 8.x 设置（合成数据）' }], blocked: [] },
    });
    if (method === 'POST' && /\/xmigrate\/verify-equivalence$/.test(p)) {
      const b = demoBody(body);
      const j = demoJobBy(xm, b.jobId);
      return json({ verdict: 'EQUIVALENT', srcCount: j?.total ?? 12800, destCount: j?.migrated ?? 12800, sampled: 50, fields: ['title', 'issuer_name'], mismatches: [], aggs: [] });
    }
  }

  /* 配置实验室 / 重建预估 / 智能动作 / 计划：可点通并给出合成结果 */
  if (method === 'GET' && p.endsWith('/config-lab/drift/keys')) return json([{ indexKey: 'research_report', driftCount: 2, checkedAt: now - 3600e3 }]);
  if (method === 'GET' && p.endsWith('/config-lab/drift')) return json({ indexKey: u.searchParams.get('indexKey') || 'research_report', baselineAt: now - 86400e3, items: [{ path: 'index.refresh_interval', baseline: '1s', current: '5s' }] });
  if (method === 'POST' && p.endsWith('/config-lab/drift-reset')) return json({ ok: true });
  if (method === 'POST' && p.endsWith('/config-lab/validate')) return json({ valid: true, findings: [], advice: [], dryRun: true });
  if (method === 'POST' && p.endsWith('/reindex-preview')) return json({ docs: 12800, bytes: 734003200, source: 'research_report', warnings: ['演示：预估为合成数据'] });
  if (method === 'POST' && p.endsWith('/reindex-advanced')) return json({ taskId: 'demo-task-1', accepted: true, ok: true, status: 'accepted' });
  if (method === 'POST' && p.endsWith('/insight/settings-impact')) return json({ warnings: [], estimated: { shards: 3 }, impact: '低风险（演示）' });
  if (method === 'POST' && p.includes('/insight/actions/')) {
    if (p.endsWith('/estimate')) return json({ estimatedMs: 1200, estimatedDocs: 12800 });
    if (p.endsWith('/dry-run')) return json({ ok: true, confirmToken: 'demo-confirm', warnings: [] });
    if (p.endsWith('/execute')) return json({ ok: true, receipt: 'demo-receipt-1' });
  }

  if (p.includes('/adhoc-rebuild/jobs')) return json([]);

  /* Cluster overview */
  if (p.endsWith('/cluster/indices')) return json(INDICES);
  if (p.endsWith('/cluster/health')) return json({ status: 'green', version: '8.13.0', unassigned_shards: 0, cluster_name: '演示集群（合成数据）' });
  if (p.endsWith('/cluster/shards')) return json([
    { index: 'research_report', shard: 0, prirep: 'p', state: 'STARTED', docs: 128, storeBytes: 3145728, node: 'node-1', ip: '127.0.0.1' },
    { index: 'research_report', shard: 0, prirep: 'r', state: 'STARTED', docs: 128, storeBytes: 3145728, node: 'node-2', ip: '127.0.0.2' },
    { index: 'bond_issuer', shard: 0, prirep: 'p', state: 'STARTED', docs: 64, storeBytes: 1048576, node: 'node-1', ip: '127.0.0.1' },
  ]);
  if (p.endsWith('/overview')) return json({});
  if (p.endsWith('/cluster/aliases')) return json(demoState.aliases);
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
  if (p.endsWith('/cluster/inspect')) return json({ mappings: {
    research_report: { properties: PROPERTIES }, bond_issuer: { properties: PROPERTIES },
    sentiment_title: { properties: TITLE_ONLY_PROPERTIES },
  }, settings: {}, sample: [] });
  if (p.endsWith('/cluster/mapping-detail')) {
    const props = propsFor(u.searchParams.get('index') || 'research_report');
    const tree = Object.entries(props).map(([name, d]: any) => ({
      name, type: d.type || (d.properties ? 'object' : 'unknown'),
      multiFields: d.fields ? Object.keys(d.fields).map(k => ({ name: k, type: d.fields[k].type })) : undefined,
      children: d.properties ? Object.entries(d.properties).map(([n, x]: any) => ({ name: n, type: x.type })) : undefined,
    }));
    return json({ raw: { properties: props }, tree, stats: { total: Object.keys(props).length, text: 2 } });
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
    const total = index === 'sentiment_title' ? 2 : 128;
    return json({ total, totalGte: false, took: 2, shards: { total: 1, successful: 1, failed: 0 }, hits: searchHits(index),
      aggregations: demoHistAggs(index, body) });
  }
  if (p.includes('/cluster/search-dsl')) {
    const index = u.searchParams.get('index') || 'research_report';
    const size = Math.min(Number((body.match(/"size"\s*:\s*(\d+)/) || [])[1] || 3), 5);
    const total = index === 'sentiment_title' ? 2 : 128;
    return json({
      took: 2, timed_out: false, _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: total, relation: 'eq' }, max_score: 3.42, hits: rawHits(index, u.searchParams.get('explain') === 'true').slice(0, size) },
      aggregations: demoHistAggs(index, body),
    });
  }
  if (p.includes('/cluster/search-raw')) {
    const index = u.searchParams.get('index') || 'research_report';
    const size = Math.min(Number((body.match(/"size"\s*:\s*(\d+)/) || [])[1] || 5), 5);
    const total = index === 'sentiment_title' ? 2 : 128;
    return json({
      took: 2, timed_out: false, _shards: { total: 1, successful: 1, failed: 0 },
      hits: { total: { value: total, relation: 'eq' }, max_score: 3.42, hits: rawHits(index, body.includes('"explain":true')).slice(0, size) },
      aggregations: demoHistAggs(index, body),
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
