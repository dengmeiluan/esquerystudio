/* Pure-browser transport for the Vue console.
 *
 * The same Vue pages call the same `api.ts` methods in both modes:
 *   server mode  -> fetch('/internal/es/index/...') to the Spring backend
 *   browser mode -> this adapter maps those paths to Elasticsearch REST
 *
 * The adapter is deliberately a thin compatibility layer, not a second UI:
 * pages, stores, components and styles stay untouched. Unmapped endpoints
 * return a visible 501 instead of silently faking data.
 */

export const isBrowserMode = import.meta.env.MODE === 'browser';

import {
  startBrowserMonitor, queryMonitorMetrics, queryMonitorHistory, queryMonitorAlerts,
  queryTopIndexes, monitorRingUsage, recordAudit, queryLocalAudit, auditFacetsLocal,
} from './browserMonitor';
import { BROWSER_SERVER_ONLY_ENDPOINTS } from '../utils/browserUnsupported';
import { adhocPrepare, adhocStart, adhocStatus, adhocJobs, adhocAbort, adhocConfirm, adhocLocalJobs } from './browserAdhoc';
import {
  connectCheck as xmConnectCheck, fetchConfig as xmFetchConfig, resolvePreview as xmResolvePreview,
  destIndices as xmDestIndices, preflight as xmPreflight, start as xmStart,
  progress as xmProgress, listJobs as xmListJobs, abort as xmAbort, resume as xmResume,
} from './browserXmigrate';
import { driftKeys as localDriftKeys, drift as localDrift, resetBaseline as resetDriftBaseline } from './browserDrift';
import {
  analyzeSettingsImpact, estimateGuardedAction, dryRunGuardedAction, executeGuardedAction,
  BrowserInsightError,
} from './browserInsight';
import {
  activeProfile, dataProfile, profiles, profileById, upsertProfile, deleteProfile,
  type BrowserProfile,
} from './browserProfiles';

const PREFIX = '/internal/es/index';

/** 数据面档案：顶栏目标优先，未选目标用激活档案。 */
function profile(): BrowserProfile | null {
  return dataProfile();
}

function authHeaders(p: { username?: string; password?: string; authType?: 'BASIC' | 'API_KEY' }): Record<string, string> {
  if (p.authType === 'API_KEY' && p.password) {
    return { Authorization: 'ApiKey ' + p.password };
  }
  if (p.username) {
    return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(p.username + ':' + (p.password || '')))) };
  }
  return {};
}

function auditConn(): { connId: string; connName: string } {
  const p = profile();
  return {
    connId: p?.id || 'browser',
    connName: localStorage.getItem('esquerystudio.monitor.connName') || p?.name || '',
  };
}

function connView(p: BrowserProfile): any {
  let u: URL;
  try { u = new URL(p.url); } catch { u = new URL('http://invalid.local:9200'); }
  return {
    id: p.id, name: p.name || u.hostname || 'Elasticsearch',
    scheme: u.protocol.replace(':', ''), host: u.hostname,
    port: Number(u.port || (u.protocol === 'https:' ? 443 : 9200)),
    username: p.username || '', hasPassword: !!p.password,
    authType: p.authType || 'BASIC', env: p.env || 'BROWSER',
    health: { status: 'UNKNOWN', latencyMs: null, lastProbeAt: null, error: null },
  };
}

async function probeProfile(p: BrowserProfile): Promise<any> {
  const t0 = Date.now();
  try {
    const r = await fetch(p.url.replace(/\/+$/, '') + '/', {
      headers: { Accept: 'application/json', ...authHeaders(p) },
      credentials: 'omit', cache: 'no-store',
    });
    const text = await r.text();
    let d: any = null;
    try { d = text ? JSON.parse(text) : null; } catch { /* 非 JSON 也保留 HTTP 结果 */ }
    if (!r.ok) {
      return { status: 'RED', latencyMs: Date.now() - t0, lastProbeAt: Date.now(), error: 'HTTP ' + r.status };
    }
    return {
      status: 'GREEN', latencyMs: Date.now() - t0, lastProbeAt: Date.now(), error: null,
      version: d?.version?.number || null,
      clusterName: d?.cluster_name || d?.name || 'cluster',
      nodes: Number(d?.number_of_nodes || 0),
    };
  } catch (e: any) {
    return { status: 'RED', latencyMs: Date.now() - t0, lastProbeAt: Date.now(), error: String(e?.message || e) };
  }
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status: number, message: string, code?: string): Response {
  return response({ error: true, message, ...(code ? { code } : {}) }, status);
}

async function esDirect(path: string, method = 'GET', body?: string, contentType = 'application/json'): Promise<{ status: number; data: any; text: string }> {
  const p = profile();
  if (!p) throw new Error('浏览器模式尚未连接 Elasticsearch');
  const base = p.url.replace(/\/+$/, '');
  const res = await fetch(base + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': contentType } : {}),
      ...authHeaders(p),
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    credentials: 'omit',
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text };
}

function bodyOf(init?: RequestInit): any {
  try { return init?.body ? JSON.parse(String(init.body)) : null; } catch { return null; }
}

/** ES 请求失败：保留真实状态码与响应体，交给上层的 ApiError 通道。 */
class EsHttpError extends Error {
  constructor(public status: number, public data: any) {
    super(typeof data === 'string' ? data : JSON.stringify(data));
  }
}

async function must(path: string, method = 'GET', body?: string): Promise<any> {
  const r = await esDirect(path, method, body, /\/_bulk(\?|$)/.test(path) ? 'application/x-ndjson' : 'application/json');
  if (r.status >= 400) throw new EsHttpError(r.status, r.data ?? r.text);
  return r.data;
}

function enc(v: string): string { return encodeURIComponent(v); }

function searchQs(q: URLSearchParams): string {
  const keys = ['routing', 'preference', 'search_type', 'allow_partial_search_results', 'ignore_unavailable', 'expand_wildcards'];
  const out: string[] = [];
  for (const k of keys) {
    const v = q.get(k);
    if (v) out.push(k + '=' + enc(v));
  }
  return out.length ? '&' + out.join('&') : '';
}

function unwrapTypeLayer(m: any): any {
  if (!m || typeof m !== 'object') return m;
  if (m.properties) return m;
  const keys = Object.keys(m);
  if (keys.length === 1 && m[keys[0]] && typeof m[keys[0]] === 'object' && m[keys[0]].properties) {
    return m[keys[0]];
  }
  return m;
}

function fieldTree(props: any): any[] {
  const out: any[] = [];
  for (const [name, raw] of Object.entries<any>(props || {})) {
    if (!raw) continue;
    const type = raw.type || (raw.properties ? 'object' : 'unknown');
    const node: any = { name, type, isNested: type === 'nested', isObject: type === 'object' || !!raw.properties };
    if (raw.analyzer) node.analyzer = raw.analyzer;
    if (raw.search_analyzer) node.searchAnalyzer = raw.search_analyzer;
    if (raw.format) node.format = raw.format;
    if (raw.index !== undefined) node.indexed = raw.index;
    if (raw.doc_values !== undefined) node.docValues = raw.doc_values;
    if (raw.copy_to !== undefined) node.copyTo = raw.copy_to;
    if (raw.null_value !== undefined) node.nullValue = raw.null_value;
    if (raw.fields) {
      node.multiFields = Object.entries<any>(raw.fields).map(([n, d]) => ({
        name: n, type: d?.type, isMultiField: true, ...(d?.analyzer ? { analyzer: d.analyzer } : {}),
      }));
    }
    if (raw.properties) node.children = fieldTree(raw.properties);
    out.push(node);
  }
  return out;
}

function treeStats(tree: any[]): any {
  const s = { total: 0, nested: 0, text: 0, keyword: 0, object: 0 };
  const stk = [...tree];
  while (stk.length) {
    const n = stk.pop();
    s.total++;
    if (n.type === 'nested') s.nested++;
    else if (n.type === 'object') s.object++;
    else if (n.type === 'text') s.text++;
    else if (n.type === 'keyword') s.keyword++;
    if (n.children) stk.push(...n.children);
  }
  return s;
}

function localLockDocs(): any[] {
  return adhocLocalJobs()
    .filter(j => j.status === 'RUNNING')
    .map(j => ({
      _id: j.jobId, _index: 'browser-local-locks',
      _source: {
        jobId: j.jobId, owner: j.ownerUsername || 'browser', logicalName: j.logicalName,
        sourcePhysical: j.sourcePhysical, destPhysical: j.destPhysical,
        stage: j.stage, acquiredAt: j.startedAt, lockActive: false,
        note: '浏览器本机作业锁；不跨页面实例',
      },
    }));
}

async function systemQuery(which: string, dsl: string): Promise<any> {
  const t0 = Date.now();
  let body: any = {};
  try { body = dsl ? JSON.parse(dsl) : {}; } catch { throw new Error('DSL 不是合法 JSON'); }
  let docs = which === 'lock' ? localLockDocs() : [];
  const term = body?.query?.term;
  if (term && typeof term === 'object') {
    const [field, value] = Object.entries<any>(term)[0] || [];
    docs = docs.filter(d => String(field === 'jobId' ? d._source.jobId : d._source[field]) === String(value?.value ?? value));
  }
  return { total: docs.length, took: Date.now() - t0, hits: docs };
}
function lintConfig(settingsText?: string, mappingText?: string): { issues: any[]; settings: any; mapping: any } {
  const issues: any[] = [];
  const add = (severity: string, code: string, path: string, message: string, suggestion?: string) =>
    issues.push({ layer: 'LINT', severity, code, path, message, ...(suggestion ? { suggestion } : {}) });
  let settings: any = {};
  let mapping: any = {};
  try { settings = settingsText ? JSON.parse(settingsText) : {}; } catch { add('ERROR', 'JSON_INVALID', 'settings', 'settings 不是合法 JSON'); }
  try { mapping = mappingText ? JSON.parse(mappingText) : {}; } catch { add('ERROR', 'JSON_INVALID', 'mapping', 'mapping 不是合法 JSON'); }
  if (Array.isArray(settings) || typeof settings !== 'object') add('ERROR', 'SETTINGS_NOT_OBJECT', 'settings', 'settings 顶层必须是对象');
  if (Array.isArray(mapping) || typeof mapping !== 'object') add('ERROR', 'MAPPING_NOT_OBJECT', 'mapping', 'mapping 顶层必须是对象');
  let props = mapping?.properties || mapping?.mappings?.properties;
  if (!props && mapping && Object.keys(mapping).length === 1) {
    const only: any = Object.values(mapping)[0];
    props = only?.mappings?.properties || only?.properties;
  }
  if (!props && mappingText && mappingText.trim()) add('WARN', 'EMPTY_MAPPING', 'mapping', 'mapping 未包含 properties，目标索引将没有显式字段');
  const types = new Set(['text', 'keyword', 'integer', 'long', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'date', 'date_nanos', 'boolean', 'binary', 'object', 'nested', 'geo_point', 'geo_shape', 'ip', 'completion', 'search_as_you_type', 'token_count', 'dense_vector', 'sparse_vector', 'rank_feature', 'rank_features', 'alias', 'join', 'flattened', 'unsigned_long', 'histogram', 'wildcard', 'constant_keyword']);
  const walk = (p: any, prefix: string) => {
    for (const [name, def] of Object.entries<any>(p || {})) {
      const path = prefix ? prefix + '.' + name : name;
      const t = def?.type || (def?.properties ? 'object' : '');
      if (t && !types.has(String(t))) add('ERROR', 'UNKNOWN_FIELD_TYPE', path, '未知字段类型：' + t, '检查 type 拼写；自定义类型需先安装对应插件');
      if (def?.analyzer && !settings?.analysis && !settings?.index?.analysis) add('WARN', 'ANALYZER_UNKNOWN', path, '字段使用 analyzer=' + def.analyzer + '，但 settings 中没有 analysis 定义', '在 settings.analysis 中定义该 analyzer');
      if (def?.properties) walk(def.properties, path);
      for (const [sub, sd] of Object.entries<any>(def?.fields || {})) {
        if (sd?.type && !types.has(String(sd.type))) add('ERROR', 'UNKNOWN_FIELD_TYPE', path + '.' + sub, '未知 multi-field 类型：' + sd.type);
      }
    }
  };
  walk(props, '');
  for (const k of Object.keys(settings || {})) {
    if (k === 'properties' || k === 'mappings' || k === 'type') add('WARN', 'MAPPING_KEY_IN_SETTINGS', k, 'settings 中出现 mapping 形态的键', '把该键移到 mapping 输入框');
  }
  return { issues, settings, mapping };
}

async function validateConfig(settingsText: string | undefined, mappingText: string | undefined, dryRun: boolean): Promise<any> {
  const t0 = Date.now();
  const { issues, settings, mapping } = lintConfig(settingsText, mappingText);
  const errors = () => issues.filter(i => i.severity === 'ERROR').length;
  let dryRunExecuted = false, dryRunPassed = false;
  if (dryRun && !errors()) {
    dryRunExecuted = true;
    const tmp = 'esquerystudio_validate_' + Date.now() + '_' + Math.random().toString(16).slice(2, 6);
    const s: any = { ...(settings || {}) };
    delete s.number_of_shards; delete s.number_of_replicas; delete s['index.number_of_shards']; delete s['index.number_of_replicas'];
    if (s.index && typeof s.index === 'object') { delete s.index.number_of_shards; delete s.index.number_of_replicas; }
    s.number_of_shards = 1; s.number_of_replicas = 0;
    const props = mapping?.properties || mapping?.mappings?.properties || (Object.values<any>(mapping || {})[0]?.mappings?.properties);
    const body: any = { settings: s };
    if (props) body.mappings = { properties: props };
    try {
      await must('/' + tmp, 'PUT', JSON.stringify(body));
      dryRunPassed = true;
    } catch (e: any) {
      issues.push({ layer: 'DRYRUN', severity: 'ERROR', code: 'DRYRUN_FAILED', path: '', message: 'ES 服务端拒绝：' + (e?.message || e), suggestion: '检查 settings/mapping 的字段类型与参数组合' });
    } finally {
      try { await must('/' + tmp, 'DELETE'); } catch { /* 清理失败不掩盖校验结果 */ }
    }
  }
  return {
    valid: errors() === 0, dryRunExecuted, dryRunPassed,
    elapsedMs: Date.now() - t0, errorCount: errors(),
    warnCount: issues.filter(i => i.severity === 'WARN').length,
    infoCount: issues.filter(i => i.severity === 'INFO').length, issues,
  };
}

/** 字段结构探测（SQL/Lucene 能力面板）：mapping 类型 + 样本行实际多值判定。 */
async function resolveSchema(index: string): Promise<any> {
  const mResp = await must('/' + enc(index) + '/_mapping');
  let mappings: any = {};
  for (const v of Object.values<any>(mResp || {})) { mappings = unwrapTypeLayer(v?.mappings || {}); break; }
  const props = mappings?.properties || {};
  const arrayFields = new Set<string>();
  try {
    const sample = await must('/' + enc(index) + '/_search?size=1', 'POST', '{"query":{"match_all":{}}}');
    const src = sample?.hits?.hits?.[0]?._source;
    const scan = (o: any, p: string) => {
      for (const [k, v] of Object.entries<any>(o || {})) {
        const name = p ? p + '.' + k : k;
        if (Array.isArray(v)) arrayFields.add(name);
        else if (v && typeof v === 'object') scan(v, name);
      }
    };
    if (src) scan(src, '');
  } catch { /* 样本失败仅降级 isArray */ }
  const fields: any[] = []; const warnings: string[] = [];
  const walk = (p: any, prefix: string) => {
    for (const [name0, def] of Object.entries<any>(p || {})) {
      const name = prefix ? prefix + '.' + name0 : name0;
      const type = String(def?.type || 'object');
      const isText = type === 'text', isNested = type === 'nested', isKeyword = type === 'keyword';
      const isArray = arrayFields.has(name);
      const supportsSql = !(isArray || isNested);
      fields.push({ name, type, isText, isNested, isKeyword, isArray, supportsSql });
      if (!supportsSql) warnings.push('字段 [' + name + '] 为 ' + (isNested ? 'nested' : 'array') + '，ES-SQL SELECT 将报错，建议改用 Lucene / DSL / PIT');
      for (const [sub, sd] of Object.entries<any>(def?.fields || {})) fields.push({ name: name + '.' + sub, type: sd?.type, isSubField: true, supportsSql: true });
      if (def?.properties) walk(def.properties, name);
    }
  };
  walk(props, '');
  return { index, fields, warnings, arrayFieldCount: arrayFields.size };
}
/** 一键体检：health + 不健康索引 + 节点水位，返回与服务端同构的报告。 */
async function healthReport(): Promise<any> {
  const checks: any[] = [];
  let score = 100;
  const add = (level: string, name: string, message: string) => checks.push({ level, name, message });
  const ch = await must('/_cluster/health');
  const status = String(ch?.status || 'unknown');
  const nodes = Number(ch?.number_of_data_nodes || 0);
  const single = nodes <= 1;
  if (status === 'red') { add('critical', 'cluster.status', '集群状态 RED，存在不可用主分片（数据面事故，立即处置）'); score -= 40; }
  else if (status === 'yellow' && !single) { add('warn', 'cluster.status', '集群状态 YELLOW，副本分片未分配（多节点集群应排查：节点掉线/磁盘水位/分配规则）'); score -= 20; }
  else if (status === 'yellow') add('info', 'cluster.status', '集群状态 YELLOW：单数据节点无法放置副本分片（拓扑常态，非异常）');
  else add('info', 'cluster.status', '集群状态 GREEN');
  const unassigned = Number(ch?.unassigned_shards || 0);
  if (unassigned > 0) add(status === 'red' ? 'critical' : single ? 'info' : 'warn', 'shards.unassigned', unassigned + ' 个分片未分配');
  const pending = Number(ch?.number_of_pending_tasks || 0);
  if (pending > 0) { add(pending > 20 ? 'critical' : 'warn', 'pending.tasks', pending + ' 个 pending task'); score -= pending > 20 ? 25 : 10; }
  const allIdx = await must('/_cat/indices?format=json&h=index,health,pri,rep,docs.count,store.size');
  const unhealthy = (allIdx || []).filter((m: any) => !String(m.index || '').startsWith('.') && ['red', 'yellow'].includes(String(m.health).toLowerCase()));
  if (unhealthy.length) add(unhealthy.some((m: any) => m.health === 'red') ? 'critical' : single ? 'info' : 'warn', 'indices.health', unhealthy.length + ' 个索引非 GREEN');
  else add('info', 'indices.health', '全部索引 GREEN');
  const catNodes = await must('/_cat/nodes?format=json&h=name,heap.percent,cpu,load_1m,disk.used_percent,ram.percent');
  let hot = 0;
  for (const n of catNodes || []) {
    if (Number(n['heap.percent']) >= 85) { hot++; add('warn', 'nodes.heap', n.name + ' heap>=85%'); score -= 10; }
    if (Number(n['disk.used_percent']) >= 85) { hot++; add('critical', 'nodes.disk', n.name + ' 磁盘>=85%'); score -= 25; }
    if (Number(n.cpu) >= 90) { hot++; add('warn', 'nodes.cpu', n.name + ' CPU>=90%'); score -= 10; }
  }
  return {
    generatedAt: new Date().toISOString(), clusterHealth: ch, unhealthyIndices: unhealthy,
    nodes: catNodes || [], summary: { status, unassigned, initializing: ch?.initializing_shards || 0, relocating: ch?.relocating_shards || 0, pending, unhealthyIndices: unhealthy.length, nodes: (catNodes || []).length, hotNodes: hot },
    score: Math.max(0, score), checks,
  };
}
function snapshotSummary(raw: any, repo: string, name: string): any {
  const snap = raw?.snapshots?.[0] || {};
  const idxMap = snap.indices || {};
  const stages = ['INIT', 'STARTED', 'START', 'FINALIZE', 'DONE', 'FAILURE'];
  const indices: any[] = [];
  let total = 0, done = 0, failed = 0;
  for (const [i, v] of Object.entries<any>(idxMap)) {
    const shards = v?.shards || {};
    const stageCounts: any = {};
    for (const k of stages) stageCounts[k] = 0;
    for (const sh of Object.values<any>(shards)) {
      const st = String(sh?.stage || '');
      stageCounts[st] = (stageCounts[st] || 0) + 1;
      total++;
      if (st === 'DONE') done++;
      if (st === 'FAILURE') failed++;
    }
    indices.push({
      index: i, shardsTotal: Object.keys(shards).length,
      shardsDone: stageCounts.DONE, shardsFailed: stageCounts.FAILURE, stageCounts,
    });
  }
  const ss = snap.shards_stats || {};
  const t = Number(ss.total ?? total) || 0;
  const d = Number(ss.done ?? done) || 0;
  return {
    repository: snap.repository || repo, snapshot: snap.snapshot || name,
    state: snap.state || '', startTimeMillis: snap.start_time_millis || 0,
    shardsStats: { total: t, done: d, failed: Number(ss.failed ?? failed) || 0 },
    pct: t ? Math.round((d / t) * 100) : 0, indices,
  };
}

function splitPath(input: RequestInfo | URL): { path: string; query: string } | null {
  const u = new URL(String(input), location.href);
  const i = u.pathname.indexOf(PREFIX);
  if (i < 0) return null;
  return { path: u.pathname.slice(i + PREFIX.length) || '/', query: u.search || '' };
}

async function route(path: string, query: string, method: string, bodyText: string, body: any): Promise<Response> {
  if (path === '/setup/status') {
    const all = profiles();
    const p = activeProfile() || profile();
    return response({
      bound: all.length > 0, mode: all.length ? 'BROWSER' : 'NONE', endpoint: p?.url || null,
      /* 浏览器模式没有服务端宿主集群：切换器只列本机连接档案，不展示「宿主集群」伪目标。 */
      appName: 'ESQueryStudio Browser', hostVisible: false, authEnabled: false,
      builtinLogin: false, setupTokenRequired: false,
    });
  }
  if (path === '/setup/test') {
    const url = String(body?.url || '').trim();
    if (!url) return fail(400, '请输入 Elasticsearch 地址');
    try {
      const r = await fetch(url.replace(/\/+$/, '') + '/', {
        headers: authHeaders({
          username: body?.username, password: body?.password,
          authType: body?.authType === 'API_KEY' ? 'API_KEY' : 'BASIC',
        }),
        credentials: 'omit',
      });
      const d = await r.json();
      return response({ ok: true, clusterName: d.cluster_name || d.name || 'cluster', version: d.version?.number || '—', status: d.tagline ? 'green' : 'green', nodes: 1 });
    } catch (e) {
      return fail(400, String((e as any)?.message || e));
    }
  }
  if (path === '/setup/apply' || path === '/setup/rebind') {
    const url = String(body?.url || '').trim();
    if (!url) return fail(400, '请输入 Elasticsearch 地址');
    let name = url;
    try { name = new URL(url).hostname; } catch { /* 交给上层 URL 校验 */ }
    const saved = upsertProfile({
      id: activeProfile()?.id,
      name, url, username: body?.username || '', password: body?.password || '',
      authType: body?.authType, env: 'BROWSER',
    });
    if (!saved) return fail(400, 'ES 地址格式应为 http://host:9200 或 https://host:9200');
    return response({ bound: true });
  }
  if (path === '/auth/me') {
    if (!profile()) return fail(401, '请先连接 Elasticsearch', 'SETUP_REQUIRED');
    return response({
      username: 'browser', displayName: 'Browser Admin', role: 'ADMIN',
      fallback: false, delegated: false, grantedPages: null,
    });
  }
  if (path === '/auth/login') return response({ token: 'browser' });
  if (path === '/auth/logout') return response({ ok: true });
  if (path === '/auth/change-password') return fail(400, '浏览器模式使用 Elasticsearch 自身账号，控制台不改密');
  if (path === '/auth/permissions') {
    return response({ role: 'ADMIN', username: 'browser', pages: [], raw: true, all: true });
  }
  if (path === '/auth/users') return response([]);
  if (path === '/auth/ops-audit' || path === '/auth/ops-audit/mine') {
    const p = new URLSearchParams(query);
    return response({
      records: await queryLocalAudit({
        username: path.endsWith('/mine') ? 'browser' : (p.get('username') || undefined),
        action: p.get('action') || undefined,
        size: p.get('size') ? Number(p.get('size')) : undefined, from: p.get('from') ? Number(p.get('from')) : undefined,
        since: p.get('since') ? Number(p.get('since')) : undefined,
        connName: p.get('connName') || undefined, uriPrefix: p.get('uriPrefix') || undefined,
        minCostMs: p.get('minCostMs') ? Number(p.get('minCostMs')) : undefined,
        fromMs: p.get('fromMs') ? Number(p.get('fromMs')) : undefined,
        toMs: p.get('toMs') ? Number(p.get('toMs')) : undefined,
      }),
    });
  }
  if (path === '/auth/users/upsert' || path === '/auth/users/delete') return fail(403, '浏览器模式没有服务端用户库');
  if (path === '/auth/audit-facets') return response(await auditFacetsLocal());
  if (path === '/ring-usage') return response(await monitorRingUsage());
  if (path === '/mapping-reconcile/report') {
    /* 浏览器模式没有服务端代码 provider / @Mapping 来源，启动期补全对账不适用。
       返回 reports 空集保持抽屉契约，并显式带 browserMode 让 UI 说明边界。 */
    return response({ reports: [], browserMode: true });
  }
  if (path === '/clusters') {
    return response(profiles().map(connView));
  }
  if (path === '/clusters/save') {
    const url = String(body?.url || '').trim();
    if (!/^https?:\/\//.test(url)) return fail(400, 'URL 格式应为 http://host:9200');
    const saved = upsertProfile({
      id: body?.id ? String(body.id) : undefined,
      name: body?.name, url,
      username: body?.username || '', password: body?.password || '',
      authType: body?.authType, env: body?.env || 'BROWSER',
    });
    if (!saved) return fail(400, '连接档案保存失败');
    return response(connView(saved));
  }
  if (path === '/clusters/delete') {
    const p = new URLSearchParams(query);
    const id = String(p.get('id') || body?.id || '');
    if (!id) return fail(400, '缺少连接 id');
    return response({ ok: deleteProfile(id) });
  }
  if (path === '/clusters/test') {
    const id = String(body?.id || '');
    const stored = id ? profileById(id) : null;
    const url = String(body?.url || stored?.url || profile()?.url || '').trim();
    if (!url) return fail(400, '请输入 Elasticsearch 地址');
    const probe: BrowserProfile = {
      id: stored?.id || 'test', name: stored?.name || url, url,
      username: body?.username !== undefined ? String(body.username) : stored?.username,
      password: body?.password || stored?.password,
      authType: (body?.authType || stored?.authType || 'BASIC') as 'BASIC' | 'API_KEY',
      env: stored?.env || 'BROWSER',
    };
    const h = await probeProfile(probe);
    return response(h.status === 'GREEN'
      ? { ok: true, clusterName: h.clusterName, version: h.version || '—', status: 'green', nodes: h.nodes || 1 }
      : { ok: false, message: h.error || '连接失败' });
  }
  const probeMatch = /^\/clusters\/([^/]+)\/probe$/.exec(path);
  if (probeMatch) {
    const id = decodeURIComponent(probeMatch[1]);
    const p = profileById(id);
    if (!p) return fail(404, '连接档案不存在：' + id);
    return response(await probeProfile(p));
  }
  if (path === '/clusters/sync') return response(null);
  if (path === '/clusters/sync/run') return response({ checkedAt: Date.now(), changes: [], errors: [] });
  if (path === '/health') return response({ status: 'green', mode: 'browser' });
  if (path === '/keys') return response([]);
  /* 浏览器模式用本机 IndexedDB 复刻服务端监控环形存储；无样本时返回空集而不是假数据。 */
  if (path === '/monitor-history') {
    const p = new URLSearchParams(query);
    return response(await queryMonitorHistory({
      connId: p.get('connId') || undefined, status: p.get('status') || undefined,
      fromMs: p.get('fromMs') ? Number(p.get('fromMs')) : undefined,
      toMs: p.get('toMs') ? Number(p.get('toMs')) : undefined,
      size: p.get('size') ? Number(p.get('size')) : undefined, from: p.get('from') ? Number(p.get('from')) : undefined,
    }));
  }
  if (path === '/monitor-alerts') {
    const p = new URLSearchParams(query);
    return response(await queryMonitorAlerts(Number(p.get('size') || 50), p.get('fromMs') ? Number(p.get('fromMs')) : undefined, p.get('toMs') ? Number(p.get('toMs')) : undefined));
  }
  if (path === '/monitor-metrics') {
    const p = new URLSearchParams(query);
    return response(await queryMonitorMetrics({
      scope: p.get('scope') || undefined, connId: p.get('connId') || undefined,
      connName: p.get('connName') || undefined,
      fromMs: p.get('fromMs') ? Number(p.get('fromMs')) : undefined,
      toMs: p.get('toMs') ? Number(p.get('toMs')) : undefined,
      size: p.get('size') ? Number(p.get('size')) : undefined,
      interval: p.get('interval') || undefined, agg: p.get('agg') || undefined,
    }));
  }
  if (path === '/monitor-metrics/top-indexes') {
    const p = new URLSearchParams(query);
    return response(await queryTopIndexes(p.get('connName') || undefined, Number(p.get('limit') || 8)));
  }
  if (path === '/ring-usage') return response(await monitorRingUsage());
  if (path === '/overview') {
    const cat = await esDirect('/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep&s=index');
    const health = await esDirect('/_cluster/health');
    return response({ indices: cat.data || [], health: health.data || {}, mode: 'browser' });
  }
  if (path === '/ui/config') return response({});
  if (path === '/adhoc-rebuild/prepare') return response(await adhocPrepare(must, String(new URLSearchParams(query).get('index') || '')));
  if (path === '/adhoc-rebuild/start') return response(await adhocStart(must, body || {}));
  if (path === '/adhoc-rebuild/status') return response(await adhocStatus(must, String(new URLSearchParams(query).get('jobId') || '')));
  if (path === '/adhoc-rebuild/abort') return response(await adhocAbort(must, String(new URLSearchParams(query).get('jobId') || '')));
  if (path === '/adhoc-rebuild/confirm-switch') return response(await adhocConfirm(must, String(new URLSearchParams(query).get('jobId') || '')));
  if (path === '/adhoc-rebuild/jobs') return response(await adhocJobs(must));
  if (path === '/config-lab/validate') {
    return response(await validateConfig(body?.settings, body?.mapping, !!body?.dryRun));
  }
  if (path === '/config-lab/drift/keys') return response(await localDriftKeys(must));
  if (path === '/config-lab/drift') {
    const p = new URLSearchParams(query);
    return response(await localDrift(must, String(p.get('indexKey') || '')));
  }
  if (path === '/config-lab/drift-reset') {
    const p = new URLSearchParams(query);
    return response(await resetDriftBaseline(String(p.get('indexKey') || '')));
  }
  if (path === '/system-inspect') {
    const which = String(new URLSearchParams(query).get('which') || 'lock');
    const docs = which === 'lock' ? localLockDocs() : [];
    return response({
      name: 'browser-local-locks-' + which,
      mappings: { properties: { jobId: { type: 'keyword' }, owner: { type: 'keyword' }, logicalName: { type: 'keyword' }, stage: { type: 'keyword' }, acquiredAt: { type: 'long' } } },
      settings: {}, docCount: docs.length, sample: docs,
    });
  }
  if (path === '/system-query') {
    const p = new URLSearchParams(query);
    return response(await systemQuery(String(p.get('which') || 'lock'), bodyText));
  }
  /* 任务进度：服务端 ReindexProgress 同构（RUNNING/COMPLETED/UNKNOWN + 计数）。
     ES 任务完成后会从 _tasks 消失（404）——这是完成常态，不渲染成失败。 */
  if (path === '/progress') {
    const taskId = String(new URLSearchParams(query).get('taskId') || '');
    const empty = { total: null, created: null, updated: null, deleted: null, versionConflicts: null };
    if (taskId.lastIndexOf(':') <= 0) {
      return response({ completed: false, status: 'UNKNOWN', detail: 'invalid taskId: ' + taskId, ...empty });
    }
    const r = await esDirect('/_tasks/' + enc(taskId));
    if (r.status === 404) {
      return response({ completed: true, status: 'COMPLETED', detail: 'task not found (likely completed)', ...empty });
    }
    if (r.status >= 400) return response(r.data ?? r.text, r.status);
    const st = r.data?.task?.status;
    const statusMap = st && typeof st === 'object' ? st : null;
    const asLong = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return response({
      completed: !!r.data?.completed,
      status: r.data?.completed ? 'COMPLETED' : 'RUNNING',
      detail: statusMap ? JSON.stringify(statusMap) : 'running',
      total: asLong(statusMap?.total),
      created: asLong(statusMap?.created),
      updated: asLong(statusMap?.updated),
      deleted: asLong(statusMap?.deleted),
      versionConflicts: asLong(statusMap?.version_conflicts),
    });
  }
  /* 现场智能：服务端 SettingsChangeAnalyzer + 护栏协议的本机等价物。
     有损边界：分类表/L1 门禁/静态预估按服务端同口径移植，token 只在当前页面内存有效。 */
  if (path === '/insight/settings-impact') {
    try {
      return response(await analyzeSettingsImpact(
        must, String(body?.index || ''),
        body?.changes && typeof body.changes === 'object' && !Array.isArray(body.changes) ? body.changes : {},
      ));
    } catch (e: any) {
      if (e instanceof BrowserInsightError) return fail(e.status, e.message, e.code);
      return fail(400, String(e?.message || e));
    }
  }
  const insightAction = /^\/insight\/actions\/([^/]+)\/(estimate|dry-run|execute)$/.exec(path);
  if (insightAction) {
    const actionId = decodeURIComponent(insightAction[1]);
    try {
      if (insightAction[2] === 'estimate') return response(await estimateGuardedAction(must, actionId, body || {}));
      if (insightAction[2] === 'dry-run') return response(await dryRunGuardedAction(must, actionId, body || {}));
      const t0 = Date.now();
      const result = await executeGuardedAction(must, actionId, body?.params || {}, String(body?.confirmToken || ''));
      const conn = auditConn();
      void recordAudit({
        method: 'POST', path: path + query, status: 200, ok: true,
        costMs: Date.now() - t0,
        connId: conn.connId, connName: conn.connName,
        action: 'GUARDED_ACTION',
        detail: JSON.stringify({ receiptId: result.receiptId, actionId, params: body?.params, result: result.result }).slice(0, 2000),
      });
      return response(result);
    } catch (e: any) {
      if (e instanceof BrowserInsightError) return fail(e.status, e.message, e.code);
      return fail(400, String(e?.message || e));
    }
  }
  if (path.startsWith('/config-lab') || path.startsWith('/xb') || path.startsWith('/insight')
      || path.startsWith('/system-') || path === '/force-merge' || path === '/replicas' || path === '/status' || path === '/progress') {
    return fail(501, '该能力依赖服务端控制台进程/存储，请使用服务端模式：' + path, 'BROWSER_MODE_SERVER_ONLY');
  }
  /* Explicit endpoint-level exceptions are real errors with a written reason,
     not an opaque "unmapped" 501. */
  for (const [endpoint, reason] of Object.entries(BROWSER_SERVER_ONLY_ENDPOINTS)) {
    if (path === endpoint || (endpoint !== '/' && path.startsWith(endpoint + '/'))) {
      return fail(501, reason, 'BROWSER_MODE_SERVER_ONLY');
    }
  }
  if (!path.startsWith('/cluster/')) return fail(501, '浏览器模式暂未映射端点：' + path, 'BROWSER_MODE_UNMAPPED');

  const q = new URLSearchParams(query);
  const index = q.get('index') || '';
  const idx = index ? '/' + encodeURIComponent(index) : '';
  if (path === '/cluster/hot-threads') {
    const nodeId = q.get('nodeId');
    const p = '/_nodes/' + (nodeId ? enc(nodeId) + '/' : '') + 'hot_threads?threads=' + Number(q.get('threads') || 3)
      + '&interval=' + enc(q.get('interval') || '500ms') + '&type=' + enc(q.get('type') || 'cpu');
    const r = await esDirect(p);
    return new Response(r.text, { status: r.status, headers: { 'content-type': 'text/plain;charset=UTF-8' } });
  }
  if (path === '/cluster/health') return response((await esDirect('/_cluster/health')).data);
  if (path === '/cluster/indices') {
    const list = (await esDirect('/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep,creation.date.string,segments.count,docs.deleted')).data || [];
    const rows = (Array.isArray(list) ? list : []).filter((r: any) => !String(r.index || '').startsWith('.'));
    rows.sort((a: any, b: any) => String(a.index).localeCompare(String(b.index)));
    return response(rows);
  }
  if (path === '/cluster/inspect') {
    const out: any = { name: index };
    try {
      const m = await must('/' + enc(index) + '/_mapping');
      const by: any = {};
      for (const [i, v] of Object.entries<any>(m)) by[i] = unwrapTypeLayer(v?.mappings || {});
      out.mappings = by;
    } catch (e: any) { out.mappingsError = e.message; }
    try {
      const s = await must('/' + enc(index) + '/_settings?flat_settings=true');
      const by: any = {};
      for (const [i, v] of Object.entries<any>(s)) by[i] = v?.settings || {};
      out.settings = by;
    } catch (e: any) { out.settingsError = e.message; }
    try { out.docCount = (await must('/' + enc(index) + '/_count', 'POST', '{"query":{"match_all":{}}}')).count; }
    catch (e: any) { out.docCountError = e.message; }
    try {
      const a = await must('/' + enc(index) + '/_alias');
      const by: any = {};
      for (const [i, v] of Object.entries<any>(a)) by[i] = Object.keys(v?.aliases || {});
      out.aliases = by;
    } catch (e: any) { out.aliasesError = e.message; }
    const sampleSize = Math.min(50, Math.max(0, Number(new URLSearchParams(query).get('sampleSize') || 5)));
    if (sampleSize > 0) {
      try {
        const r = await must('/' + enc(index) + '/_search?size=' + sampleSize);
        out.sample = (r?.hits?.hits || []).map((h: any) => ({ _id: h._id, _index: h._index, _source: h._source }));
      } catch (e: any) { out.sampleError = e.message; }
    }
    return response(out);
  }
  if (path === '/cluster/mapping-detail') {
    const raw = await must('/' + enc(index) + '/_mapping');
    const out: any = { index };
    for (const [, v] of Object.entries<any>(raw)) {
      const mappings = unwrapTypeLayer(v?.mappings || {});
      const tree = fieldTree(mappings?.properties || {});
      out.tree = tree; out.raw = mappings; out.stats = treeStats(tree);
      break;
    }
    return response(out);
  }
  if (path === '/cluster/index-settings') {
    const r = await esDirect(idx + '/_settings?include_defaults=true&flat_settings=false');
    return response(r.data, r.status);
  }
  if (path === '/cluster/index-settings-defaults') {
    const r = await esDirect(idx + '/_settings?include_defaults=true&flat_settings=true');
    return response({ status: r.status, body: r.text });
  }
  if (path === '/cluster/shards') {
    const p = index ? '/_cat/shards/' + enc(index) : '/_cat/shards';
    const rows = (await must(p + '?format=json&bytes=b&h=index,shard,prirep,state,docs,store,node,ip')) || [];
    return response((Array.isArray(rows) ? rows : [])
      .filter((r: any) => !String(r.index || '').startsWith('.'))
      .map((r: any) => ({
        index: r.index, shard: Number(r.shard), prirep: r.prirep, state: r.state,
        docs: r.docs == null ? null : Number(r.docs), storeBytes: r.store == null ? null : Number(r.store),
        node: r.node, ip: r.ip,
      })));
  }
  if (path === '/cluster/aliases') {
    const raw = await must('/_alias');
    const out: any[] = [];
    for (const [i, v] of Object.entries<any>(raw)) {
      if (i.startsWith('.')) continue;
      for (const [alias, meta] of Object.entries<any>(v?.aliases || {})) {
        out.push({ alias, index: i, isWriteIndex: meta?.is_write_index, filter: meta?.filter, routing: meta?.index_routing });
      }
    }
    out.sort((a, b) => a.alias.localeCompare(b.alias) || a.index.localeCompare(b.index));
    return response(out);
  }
  if (path === '/cluster/query') {
    const size = Math.max(0, Math.min(100, Number(q.get('size') || 10)));
    const r = await esDirect(idx + '/_search?size=' + size + searchQs(q), 'POST', bodyText || '{}');
    if (r.status >= 400) return response(r.data, r.status);
    const h = r.data?.hits || {};
    return response({
      total: h.total?.value ?? h.total ?? 0,
      totalGte: h.total?.relation === 'gte',
      took: r.data?.took ?? 0,
      shards: r.data?._shards,
      hits: h.hits || [],
    });
  }
  if (path === '/cluster/search-raw') {
    const r = await esDirect(idx + '/_search', 'POST', bodyText || '{}');
    return response(r.data, r.status);
  }
  if (path === '/cluster/search-dsl') {
    let bodyObj: any = {};
    try { bodyObj = bodyText ? JSON.parse(bodyText) : {}; } catch { bodyObj = {}; }
    if (q.get('profile') === 'true') bodyObj.profile = true;
    const explain = q.get('explain') === 'true' ? '?explain=true' : '';
    const r = await esDirect(idx + '/_search' + explain, 'POST', JSON.stringify(bodyObj));
    return response(r.data, r.status);
  }
  if (path === '/cluster/profile') {
    let b: any = {};
    try { b = bodyText ? JSON.parse(bodyText) : {}; } catch { b = {}; }
    b.profile = true;
    const r = await esDirect(idx + '/_search' + searchQs(q), 'POST', JSON.stringify(b));
    return response(r.data, r.status);
  }
  if (path === '/cluster/sql') {
    const sql = typeof body === 'string' ? body : String(body?.query || body || '');
    const r = await esDirect('/_sql?format=json', 'POST', JSON.stringify({ query: sql }));
    return response(r.data, r.status);
  }
  if (path === '/cluster/analyze') {
    return response((await esDirect(idx + '/_analyze', 'POST', bodyText || '{}')).data);
  }
  if (path === '/cluster/count') {
    let countBody = '{"query":{"match_all":{}}}';
    try { const d = bodyText ? JSON.parse(bodyText) : null; if (d?.query) countBody = JSON.stringify({ query: d.query }); } catch { /* 交给 ES 报错 */ }
    return response(await must(idx + '/_count', 'POST', countBody));
  }
  if (path === '/cluster/doc') {
    const id = enc(q.get('id') || '');
    if (method === 'GET') return response((await esDirect(idx + '/_doc/' + id)).data);
    const refresh = q.get('refresh');
    return response(await must(idx + '/_doc/' + id + (refresh ? '?refresh=' + enc(refresh) : ''), 'PUT', bodyText));
  }
  if (path === '/cluster/delete-by-id') {
    const r = await esDirect(idx + '/_doc/' + enc(q.get('id') || ''), 'DELETE');
    return response(r.data, r.status);
  }
  if (path === '/cluster/update-document') {
    const refresh = q.get('refresh');
    return response(await must(idx + '/_doc/' + enc(q.get('id') || '') + (refresh ? '?refresh=' + enc(refresh) : ''), 'PUT', bodyText));
  }
  if (path === '/cluster/update-partial') {
    return response(await must(idx + '/_update/' + enc(q.get('id') || '') + '?refresh=true', 'POST', '{"doc":' + (bodyText || '{}') + '}'));
  }
  if (path === '/cluster/doc/update') {
    const refresh = q.get('refresh');
    return response(await must(idx + '/_update/' + enc(q.get('id') || '') + (refresh ? '?refresh=' + enc(refresh) : ''), 'POST', bodyText));
  }
  if (path === '/cluster/explain-doc') {
    return response((await esDirect(idx + '/_explain/' + encodeURIComponent(q.get('id') || ''), 'POST', bodyText || '{}')).data);
  }
  if (path === '/cluster/terms-enum' || path === '/cluster/field-caps') {
    return response((await esDirect(idx + '/_field_caps?fields=*')).data);
  }
  if (path === '/cluster/tasks') {
    const detailed = q.get('detailed') !== 'false';
    const actions = q.get('actions');
    const raw = await must('/_tasks?detailed=' + detailed + (actions ? '&actions=' + enc(actions) : ''));
    const out: any[] = [];
    for (const [nodeId, nodeInfo] of Object.entries<any>(raw?.nodes || {})) {
      for (const [taskId, t] of Object.entries<any>(nodeInfo?.tasks || {})) {
        const nanos = Number(t.running_time_in_nanos);
        out.push({
          taskId, node: nodeInfo?.name || nodeId, action: t.action, description: t.description,
          parentTaskId: t.parent_task_id, startTimeMillis: t.start_time_in_millis,
          runningTimeNanos: t.running_time_in_nanos, tookMs: Number.isFinite(nanos) ? Math.floor(nanos / 1e6) : -1,
          cancellable: t.cancellable, status: t.status,
        });
      }
    }
    return response(out);
  }
  if (path === '/cluster/tasks/cancel') {
    return response(await must('/_tasks/' + enc(q.get('taskId') || '') + '/_cancel', 'POST'));
  }
  if (path === '/cluster/task-detail') {
    return response(await must('/_tasks/' + enc(q.get('taskId') || '') + '?wait_for_completion=false'));
  }
  if (path === '/cluster/pending-tasks') return response((await esDirect('/_cluster/pending_tasks')).data);
  if (path === '/cluster/nodes-stats') {
    const raw = await must('/_nodes/stats/jvm,fs,os,thread_pool');
    const out: any[] = [];
    for (const [nodeId, n] of Object.entries<any>(raw?.nodes || {})) {
      const row: any = { nodeId, name: n.name, host: n.host, roles: n.roles };
      if (n.jvm?.mem) row.jvm = { heapUsedBytes: n.jvm.mem.heap_used_in_bytes, heapMaxBytes: n.jvm.mem.heap_max_in_bytes, heapUsedPercent: n.jvm.mem.heap_used_percent };
      if (n.fs?.total) row.fs = { totalBytes: n.fs.total.total_in_bytes, freeBytes: n.fs.total.free_in_bytes, availableBytes: n.fs.total.available_in_bytes };
      const load = n.os?.load_average ?? n.os?.cpu?.load_average;
      row.os = { cpuPercent: n.os?.cpu?.percent, loadAverage: load };
      const pools: any = {};
      for (const p of ['search', 'write', 'bulk', 'get', 'flush', 'refresh']) {
        if (n.thread_pool?.[p]) pools[p] = { active: n.thread_pool[p].active, queue: n.thread_pool[p].queue, rejected: n.thread_pool[p].rejected, completed: n.thread_pool[p].completed };
      }
      row.threadPool = pools;
      out.push(row);
    }
    return response(out);
  }
  if (path === '/cluster/nodes-stats-brief') {
    const raw = await must('/_nodes/stats/jvm,os,fs,indices,thread_pool?filter_path=nodes.*.name,nodes.*.host,nodes.*.roles,'
      + 'nodes.*.jvm.mem.heap_used_percent,nodes.*.jvm.mem.heap_used_in_bytes,nodes.*.jvm.mem.heap_max_in_bytes,'
      + 'nodes.*.os.cpu.percent,nodes.*.os.cpu.load_average,nodes.*.fs.total.total_in_bytes,nodes.*.fs.total.free_in_bytes,'
      + 'nodes.*.fs.total.available_in_bytes,nodes.*.indices.docs.count,nodes.*.indices.store.size_in_bytes,'
      + 'nodes.*.indices.indexing.index_total,nodes.*.indices.search.query_total,'
      + 'nodes.*.thread_pool.search.active,nodes.*.thread_pool.search.queue');
    const out: any[] = [];
    for (const [nodeId, n] of Object.entries<any>(raw?.nodes || {})) {
      out.push({
        nodeId, name: n.name, host: n.host, roles: n.roles,
        heapPct: n.jvm?.mem?.heap_used_percent, heapUsed: n.jvm?.mem?.heap_used_in_bytes, heapMax: n.jvm?.mem?.heap_max_in_bytes,
        cpuPct: n.os?.cpu?.percent, load: n.os?.cpu?.load_average,
        diskTotal: n.fs?.total?.total_in_bytes, diskFree: n.fs?.total?.free_in_bytes, diskAvail: n.fs?.total?.available_in_bytes,
        docCount: n.indices?.docs?.count, storeSize: n.indices?.store?.size_in_bytes,
        indexTotal: n.indices?.indexing?.index_total, queryTotal: n.indices?.search?.query_total,
        tpSearchActive: n.thread_pool?.search?.active, tpSearchQueue: n.thread_pool?.search?.queue,
      });
    }
    return response(out);
  }
  if (path === '/cluster/validate-query') {
    return response((await esDirect(idx + '/_validate/query?explain=true', 'POST', bodyText || '{}')).data);
  }
  if (path === '/cluster/raw' || path === '/cluster/devtools/execute') {
    const b = body || {};
    const target = String(b.path || '/');
    const r = await esDirect(target, String(b.method || 'GET').toUpperCase(), b.body || undefined);
    return response({ status: r.status, body: r.data }, r.status);
  }
  if (path === '/cluster/allocation-explain') {
    return response((await esDirect('/_cluster/allocation/explain', 'POST', bodyText || '{}')).data);
  }
  /* ── 索引运维：建/删索引、Mapping、Settings、merge、rollover、reroute、别名原子操作 ── */
  if (path === '/cluster/create-index') {
    const b = body || {};
    const bodyObj: any = {};
    try { if (b.settings) bodyObj.settings = typeof b.settings === 'string' ? JSON.parse(b.settings) : b.settings; } catch { /* 交给 ES 报错 */ }
    try { if (b.mapping) bodyObj.mappings = typeof b.mapping === 'string' ? JSON.parse(b.mapping) : b.mapping; } catch { /* 交给 ES 报错 */ }
    return response(await must('/' + enc(index), 'PUT', Object.keys(bodyObj).length ? JSON.stringify(bodyObj) : undefined));
  }
  if (path === '/cluster/delete-index') {
    const r = await esDirect('/' + enc(index), 'DELETE');
    return response(r.data, r.status);
  }
  if (path === '/cluster/put-mapping' || path === '/cluster/mapping-put') {
    return response(await must('/' + enc(index) + '/_mapping', 'PUT', bodyText));
  }
  if (path === '/cluster/update-settings' || path === '/cluster/index-settings/update') {
    return response(await must('/' + enc(index) + '/_settings', 'PUT', bodyText));
  }
  if (path === '/cluster/force-merge') {
    const n = Math.max(1, Number(q.get('maxSegments') || 1));
    return response(await must('/' + enc(index) + '/_forcemerge?max_num_segments=' + n, 'POST'));
  }
  if (path === '/cluster/rollover') {
    const alias = String(q.get('alias') || index || '');
    const dry = q.get('dryRun') === 'true';
    return response(await must('/' + enc(alias) + '/_rollover' + (dry ? '?dry_run=true' : ''), 'POST', bodyText || undefined));
  }
  if (path === '/cluster/reroute') {
    const qs2: string[] = [];
    if (q.get('dryRun') === 'true') qs2.push('dry_run=true');
    if (q.get('explain') !== 'false') qs2.push('explain=true');
    if (q.get('retryFailed') === 'true') qs2.push('retry_failed=true');
    return response(await must('/_cluster/reroute' + (qs2.length ? '?' + qs2.join('&') : ''), 'POST', bodyText || '{"commands":[]}'));
  }
  if (path === '/cluster/reroute/retry-failed') {
    return response(await must('/_cluster/reroute?retry_failed=true', 'POST', '{"commands":[]}'));
  }
  if (path === '/cluster/alias-actions') {
    return response(await must('/_aliases', 'POST', bodyText));
  }
  if (path === '/cluster/settings') return response((await esDirect('/_cluster/settings?include_defaults=true')).data);
  if (path === '/cluster/settings/put') return response(await must('/_cluster/settings', 'PUT', bodyText));
  /* ── 模板 / 快照 ── */
  if (path === '/cluster/templates') {
    try {
      const a = await must('/_index_template');
      const b = await must('/_component_template');
      return response({ index_templates: a?.index_templates || [], component_templates: b?.component_templates || [] });
    } catch (e) {
      const legacy = await must('/_template');
      return response({
        index_templates: Object.entries<any>(legacy || {}).map(([name, v]) => ({ name, index_template: v })),
        component_templates: [], legacy: true,
      });
    }
  }
  if (path === '/cluster/templates/put') {
    const kind = q.get('kind') === 'component' ? 'component' : 'index';
    const base = kind === 'component' ? '/_component_template/' : '/_index_template/';
    return response(await must(base + enc(q.get('name') || ''), 'PUT', bodyText));
  }
  if (path === '/cluster/templates/delete') {
    const kind = q.get('kind') === 'component' ? 'component' : 'index';
    const base = kind === 'component' ? '/_component_template/' : '/_index_template/';
    return response(await must(base + enc(q.get('name') || ''), 'DELETE'));
  }
  if (path === '/cluster/snapshot/repos') {
    const raw = await must('/_snapshot');
    return response(Object.entries<any>(raw || {}).map(([name, v]) => ({ name, type: v?.type, settings: v?.settings })));
  }
  if (path === '/cluster/snapshot/list') {
    const repo = enc(q.get('repo') || '');
    const raw = await must('/_snapshot/' + repo + '/_all?ignore_unavailable=true');
    return response(raw?.snapshots || []);
  }
  if (path === '/cluster/snapshot/create') {
    return response(await must('/_snapshot/' + enc(q.get('repo') || '') + '/' + enc(q.get('name') || '') + '?wait_for_completion=false', 'PUT', bodyText || undefined));
  }
  if (path === '/cluster/snapshot/restore') {
    return response(await must('/_snapshot/' + enc(q.get('repo') || '') + '/' + enc(q.get('name') || '') + '/_restore?wait_for_completion=false', 'POST', bodyText || undefined));
  }
  if (path === '/cluster/snapshot/delete') {
    return response(await must('/_snapshot/' + enc(q.get('repo') || '') + '/' + enc(q.get('name') || ''), 'DELETE'));
  }
  if (path === '/cluster/snapshot/status') {
    const repo = q.get('repo'); const name = q.get('name');
    const p = !repo ? '/_snapshot/_status'
      : !name ? '/_snapshot/' + enc(repo) + '/_current/_status'
      : '/_snapshot/' + enc(repo) + '/' + enc(name) + '/_status';
    const raw = await must(p);
    if (q.get('summary') !== 'true') return response(raw);
    return response(snapshotSummary(raw, repo || '', name || ''));
  }
  /* ── ILM / SLM / Watcher / 远程集群 / 插件 / 脚本 / Painless ── */
  if (path === '/cluster/ilm/policies') {
    const raw = await must('/_ilm/policy');
    return response(Object.entries<any>(raw || {}).map(([name, v]) => ({ name, ...(v || {}) })));
  }
  if (path === '/cluster/ilm/policy') {
    const p = '/_ilm/policy/' + enc(q.get('name') || '');
    return response(method === 'DELETE' ? await must(p, 'DELETE') : await must(p, 'PUT', bodyText));
  }
  if (path === '/cluster/ilm/explain') return response(await must('/' + enc(index) + '/_ilm/explain'));
  if (path === '/cluster/ilm/move') return response(await must('/_ilm/move/' + enc(index), 'POST', bodyText));
  if (path === '/cluster/ilm/start') return response(await must('/_ilm/start', 'POST', '{}'));
  if (path === '/cluster/ilm/stop') return response(await must('/_ilm/stop', 'POST', '{}'));
  if (path === '/cluster/ilm/status') return response(await must('/_ilm/status'));
  if (path === '/cluster/slm/policies') return response(await must('/_slm/policy'));
  if (path === '/cluster/slm/execute') return response(await must('/_slm/policy/' + enc(q.get('policyId') || '') + '/_execute', 'POST', '{}'));
  if (path === '/cluster/slm/status') return response({ status: await must('/_slm/status'), stats: await must('/_slm/stats') });
  if (path === '/cluster/watcher') {
    const out: any = { available: true };
    try { out.stats = await must('/_watcher/stats'); } catch (e: any) { return response({ available: false, reason: e.message }); }
    try { out.watches = await must('/.watches/_search', 'POST', JSON.stringify({ size: 200, _source: ['metadata', 'trigger', 'actions'] })); }
    catch (e: any) { out.watches = {}; out.reason = e.message; }
    return response(out);
  }
  if (path === '/cluster/remote-clusters') {
    const out: any = { remotes: {}, count: 0 };
    try { out.remotes = await must('/_remote/info'); out.count = Object.keys(out.remotes || {}).length; } catch (e: any) { out.reason = e.message; }
    try { const self = await must('/'); out.localClusterName = self.cluster_name; out.localVersion = self.version; } catch { /* 本端信息可缺 */ }
    return response(out);
  }
  if (path === '/cluster/plugins') {
    let rows: any[];
    try { rows = await must('/_cat/plugins?format=json&v=true') || []; } catch (e: any) { return response({ available: false, reason: e.message }); }
    const byPlugin: Record<string, Set<string>> = {};
    const allNodes = new Set<string>();
    for (const r of rows) { const nn = String(r.name); const pn = String(r.component); allNodes.add(nn); (byPlugin[pn] ||= new Set()).add(nn); }
    const summary = Object.entries(byPlugin).map(([plugin, set]) => ({ plugin, installedOn: [...set], count: set.size, complete: set.size === allNodes.size }));
    const mismatches = summary.filter(x => !x.complete).map(x => x.plugin + ' 缺少节点：' + [...allNodes].filter(n => !x.installedOn.includes(n)).join(','));
    return response({ available: true, nodes: rows, summary, mismatches, nodeCount: allNodes.size, pluginCount: Object.keys(byPlugin).length });
  }
  if (path === '/cluster/scripts') {
    const raw = await must('/_cluster/state/metadata?filter_path=metadata.stored_scripts');
    const scripts = raw?.metadata?.stored_scripts || {};
    return response({ scripts, count: Object.keys(scripts).length });
  }
  if (path === '/cluster/scripts/put') return response(await must('/_scripts/' + enc(q.get('id') || ''), 'PUT', bodyText));
  if (path === '/cluster/scripts/delete') return response(await must('/_scripts/' + enc(q.get('id') || ''), 'DELETE'));
  if (path === '/cluster/painless/execute') {
    try { return response(await must('/_scripts/painless/_execute', 'POST', bodyText)); }
    catch (e: any) { return response({ available: false, reason: e.message, hint: '当前集群未启用 painless _execute（可能是 OSS 或权限不足）' }); }
  }
  /* ── Reindex / 批量 / SQL 全通道 / Lucene / PIT / schema / termvectors ── */
  if (path === '/cluster/reindex-preview') {
    const source = q.get('source') || index;
    const cntBody = bodyText && bodyText.trim() ? bodyText : '{"query":{"match_all":{}}}';
    const cnt = await must('/' + enc(source) + '/_count', 'POST', cntBody);
    const st = await must('/' + enc(source) + '/_stats/store,docs');
    let totalDocs = 0, primaryBytes = 0;
    for (const v of Object.values<any>(st?.indices || {})) {
      totalDocs += Number(v?.primaries?.docs?.count || 0);
      primaryBytes += Number(v?.primaries?.store?.size_in_bytes || 0);
    }
    const avg = totalDocs > 0 ? primaryBytes / totalDocs : 0;
    return response({ docs: Number(cnt?.count || 0), sourceTotalDocs: totalDocs, sourcePrimaryBytes: primaryBytes, avgDocBytes: avg, estimatedTargetBytes: Math.round(avg * Number(cnt?.count || 0)) });
  }
  if (path === '/cluster/reindex-advanced') {
    const map: Record<string, string> = { slices: 'slices', refresh: 'refresh', waitForCompletion: 'wait_for_completion', requestsPerSecond: 'requests_per_second', scroll: 'scroll', timeout: 'timeout', waitForActiveShards: 'wait_for_active_shards' };
    const qs2: string[] = [];
    for (const [from, to] of Object.entries(map)) { const v = q.get(from); if (v) qs2.push(to + '=' + enc(v)); }
    const p = '/_reindex' + (qs2.length ? '?' + qs2.join('&') : '');
    const data = await must(p, 'POST', bodyText);
    return response({ ...(data || {}), taskId: data?.task == null ? undefined : String(data.task), finalPath: p });
  }
  if (path === '/cluster/update-by-query' || path === '/cluster/delete-by-query') {
    const qs2: string[] = [];
    for (const k of ['conflicts', 'slices', 'refresh', 'waitForCompletion', 'requestsPerSecond', 'scroll', 'timeout', 'waitForActiveShards', 'maxDocs']) {
      const v = q.get(k); if (v) qs2.push((k === 'waitForCompletion' ? 'wait_for_completion' : k === 'requestsPerSecond' ? 'requests_per_second' : k === 'waitForActiveShards' ? 'wait_for_active_shards' : k === 'maxDocs' ? 'max_docs' : k) + '=' + enc(v));
    }
    const suffix = path.endsWith('delete-by-query') ? '_delete_by_query' : '_update_by_query';
    const p = '/' + enc(index) + '/' + suffix + (qs2.length ? '?' + qs2.join('&') : '');
    const data = await must(p, 'POST', bodyText || '{"query":{"match_all":{}}}');
    return response({ ...(data || {}), taskId: data?.task == null ? undefined : String(data.task), finalPath: p });
  }
  if (path === '/cluster/bulk') {
    const p = (q.get('index') ? '/' + enc(String(q.get('index'))) : '') + '/_bulk';
    const r = await esDirect(p, 'POST', bodyText, 'application/x-ndjson');
    if (r.status >= 400) return response(r.data, r.status);
    const items = r.data?.items || [];
    let ok = 0, err = 0; const failed: any[] = [];
    for (const it of items) {
      const op = Object.values<any>(it)[0] || {};
      if (Number(op.status) < 300) ok++; else { err++; if (failed.length < 20) failed.push(op); }
    }
    return response({ took: r.data?.took, errors: r.data?.errors, okCount: ok, errCount: err, total: items.length, failedSample: failed, finalPath: p });
  }
  if (path === '/cluster/sql/query' || path === '/cluster/sql/lenient') {
    let payload = bodyText || '{}';
    if (path.endsWith('lenient')) {
      try { const o = JSON.parse(payload); if (!('field_multi_value_leniency' in o)) payload = JSON.stringify({ field_multi_value_leniency: true, ...o }); } catch { /* 原样 */ }
    }
    const r = await esDirect('/_sql?format=json', 'POST', payload);
    if (r.status >= 400 && (r.status === 404 || r.status === 405)) {
      return response({ available: false, reason: r.text, hint: '当前集群未启用 _sql，或该查询违反 SQL 限制；建议改用 Lucene / DSL 接口' });
    }
    return response(r.data, r.status);
  }
  if (path === '/cluster/sql/translate') {
    const r = await esDirect('/_sql/translate', 'POST', bodyText || '{}');
    return response(r.data, r.status);
  }
  if (path === '/cluster/sql/cursor') {
    const b: any = { cursor: q.get('cursor') || '' };
    const tz = q.get('timeZone'); if (tz) b.time_zone = tz;
    if (q.get('columnar') === 'true') b.columnar = true;
    const r = await esDirect('/_sql?format=json', 'POST', JSON.stringify(b));
    return response(r.data, r.status);
  }
  if (path === '/cluster/sql/close') {
    const r = await esDirect('/_sql/close', 'POST', JSON.stringify({ cursor: q.get('cursor') || '' }));
    return response(r.data, r.status);
  }
  if (path === '/cluster/lucene-search') {
    const qs2 = ['q=' + enc(q.get('q') || '*'), 'size=' + Number(q.get('size') || 100), 'from=' + Number(q.get('from') || 0)];
    const sf = q.get('sortField'); if (sf) qs2.push('sort=' + enc(sf + ':' + (q.get('sortOrder') === 'asc' ? 'asc' : 'desc')));
    qs2.push('lenient=true', 'analyze_wildcard=true', 'track_total_hits=true');
    return response(await must('/' + enc(index) + '/_search?' + qs2.join('&')));
  }
  if (path === '/cluster/pit/open') {
    return response(await must('/' + enc(index) + '/_pit?keep_alive=' + enc(q.get('keepAlive') || '5m'), 'POST'));
  }
  if (path === '/cluster/pit/search') return response(await must('/_search', 'POST', bodyText));
  if (path === '/cluster/pit/close') {
    return response(await must('/_pit', 'DELETE', JSON.stringify({ id: q.get('pitId') || '' })));
  }
  if (path === '/cluster/resolve-schema') {
    return response(await resolveSchema(index));
  }
  if (path === '/cluster/field-caps' || path === '/cluster/terms-enum') {
    return response(await must('/' + enc(index) + '/_field_caps?fields=*'));
  }
  if (path === '/cluster/term-vectors') {
    const fields = q.get('fields');
    return response(await must('/' + enc(index) + '/_termvectors/' + enc(q.get('id') || '')
      + '?term_statistics=true&field_statistics=true&positions=false&offsets=false' + (fields ? '&fields=' + enc(fields) : '')));
  }
  /* ── Analysis / 同义词 / 模板渲染 / 体检 / date 形态采样 ── */
  if (path === '/cluster/analysis-settings') {
    const raw = await must('/' + enc(index) + '/_settings?include_defaults=false&flat_settings=false');
    const out: any = { index, analysis: {}, summary: { analyzers: 0, tokenizers: 0, filters: 0, charFilters: 0, normalizers: 0 } };
    for (const v of Object.values<any>(raw || {})) {
      const a = v?.settings?.index?.analysis || {};
      out.analysis = a;
      out.summary = {
        analyzers: Object.keys(a.analyzer || {}).length, tokenizers: Object.keys(a.tokenizer || {}).length,
        filters: Object.keys(a.filter || {}).length, charFilters: Object.keys(a.char_filter || {}).length,
        normalizers: Object.keys(a.normalizer || {}).length,
      };
      break;
    }
    return response(out);
  }
  if (path === '/cluster/analysis-update') {
    const steps: string[] = [];
    try {
      await must('/' + enc(index) + '/_close', 'POST'); steps.push('close-ok');
      await must('/' + enc(index) + '/_settings', 'PUT', bodyText); steps.push('put-settings-ok');
    } finally {
      try { await must('/' + enc(index) + '/_open', 'POST'); steps.push('open-ok'); } catch (e: any) { steps.push('open-FAILED: ' + e.message); }
    }
    return response({ steps, ok: steps.includes('put-settings-ok') && steps.includes('open-ok') });
  }
  if (path === '/cluster/reload-analyzers') return response(await must('/' + enc(index) + '/_reload_search_analyzers', 'POST'));
  if (path === '/cluster/synonyms-upsert') {
    const entries = (() => { try { return JSON.parse(bodyText || '[]'); } catch { return []; } })();
    const filter = q.get('filter') || 'custom_synonyms';
    const expand = q.get('expand') === 'true';
    const body = JSON.stringify({ analysis: { filter: { [filter]: { type: 'synonym_graph', expand, synonyms: entries } } } });
    const steps: string[] = [];
    try {
      await must('/' + enc(index) + '/_close', 'POST'); steps.push('close-ok');
      await must('/' + enc(index) + '/_settings', 'PUT', body); steps.push('put-settings-ok');
    } finally {
      try { await must('/' + enc(index) + '/_open', 'POST'); steps.push('open-ok'); } catch (e: any) { steps.push('open-FAILED: ' + e.message); }
    }
    return response({ steps, ok: steps.includes('put-settings-ok') && steps.includes('open-ok') });
  }
  if (path === '/cluster/render-template') return response(await must('/_render/template', 'POST', bodyText));
  if (path === '/cluster/search-template') return response(await must('/' + enc(index) + '/_search/template', 'POST', bodyText));
  if (path === '/cluster/health-report') return response(await healthReport());
  if (path === '/cluster/date-forms') {
    const size = Math.min(500, Math.max(1, Number(q.get('size') || 50)));
    const dsl = JSON.stringify({ query: { function_score: { query: { match_all: {} }, random_score: {} } } });
    const resp = await must('/' + enc(index) + '/_search?size=' + size, 'POST', dsl);
    const sources = (resp?.hits?.hits || []).map((h: any) => h._source || {});
    const mp = await must('/' + enc(index) + '/_mapping');
    const dateFields: string[] = [];
    for (const v of Object.values<any>(mp || {})) {
      const p = unwrapTypeLayer(v?.mappings || {})?.properties || {};
      for (const [n, d] of Object.entries<any>(p)) if (String(d?.type).startsWith('date')) dateFields.push(n);
    }
    const forms: any = {}; const samples: any = {};
    for (const f of dateFields) {
      forms[f] = {}; 
      for (const src of sources) {
        const v = src[f];
        if (v === undefined || v === null) continue;
        const form = typeof v === 'number' ? (String(v).length === 13 ? 'epoch_millis' : 'epoch_seconds')
          : typeof v === 'string' ? (/^\d{4}-\d{2}-\d{2}/.test(v) ? 'iso_string' : 'string') : 'other';
        forms[f][form] = (forms[f][form] || 0) + 1;
        if (form === 'other') { (samples[f] ||= {})[form] = [...((samples[f]?.[form]) || []), String(v)].slice(0, 5); }
      }
    }
    return response({ index, physicalIndex: index, sampled: sources.length, total: resp?.hits?.total?.value ?? resp?.hits?.total ?? 0, sampling: 'random_score', dateFields, forms, samples });
  }
  return fail(501, '浏览器模式暂未映射端点：' + path, 'BROWSER_MODE_UNMAPPED');
}

async function xmigrateFetch(u: URL, method: string, body: any): Promise<Response> {
  const i = u.pathname.indexOf('/internal/es/xmigrate');
  const path = u.pathname.slice(i + '/internal/es/xmigrate'.length) || '/';
  const q = new URLSearchParams(u.search);
  try {
    if (path === '/connect-check') return response(await xmConnectCheck(body || {}));
    if (path === '/fetch-config') return response(await xmFetchConfig(body || {}, q.get('sourceIndex') || ''));
    if (path === '/resolve-preview') return response(await xmResolvePreview(body || {}));
    if (path === '/dest-indices') return response(await xmDestIndices(must));
    if (path === '/preflight') return response(await xmPreflight(must, body || {}));
    if (path === '/start') {
      if (!body?.conn) throw new Error('浏览器模式请直接填写源集群连接信息（手工连接）');
      return response(await xmStart(must, body, body.conn));
    }
    if (path === '/progress') return response(await xmProgress(q.get('jobId') || ''));
    if (path === '/jobs') return response(await xmListJobs(must, Number(q.get('limit') || 20)));
    if (path === '/abort') return response(await xmAbort(q.get('jobId') || ''));
    if (path === '/resume') {
      if (!body) throw new Error('浏览器模式续跑需要重新提供源集群连接信息');
      return response(await xmResume(must, q.get('jobId') || '', body));
    }
    return fail(501, '浏览器模式暂未映射迁移端点：' + path, 'BROWSER_MODE_UNMAPPED');
  } catch (e: any) {
    return fail(400, String(e?.message || e), 'XMIGRATE_FAILED');
  }
}

export async function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  /* 跨集群迁移有独立 base；由浏览器兼容层用源集群凭据现场搬运。 */
  try {
    const u = new URL(String(input), location.href);
    if (u.pathname.includes('/internal/es/xmigrate')) {
      return await xmigrateFetch(u, String(init?.method || 'GET').toUpperCase(), bodyOf(init));
    }
  } catch { /* 非法 URL 交给下方原逻辑 */ }
  const target = splitPath(input);
  if (!target) return fetch(input, init);
  const method = String(init?.method || 'GET').toUpperCase();
  const bodyText = init?.body == null ? '' : String(init.body);
  const startedAt = performance.now();
  try {
    const res = await route(target.path, target.query, method, bodyText, bodyOf(init));
    const quiet = /^\/(monitor-|auth\/me|auth\/ops-audit|auth\/audit-facets|clusters|health|setup|ui\/config|adhoc-rebuild\/jobs)/.test(target.path);
    if (!quiet) {
      const conn = auditConn();
      void recordAudit({
        method, path: target.path + target.query, status: res.status, ok: res.ok,
        costMs: performance.now() - startedAt, connId: conn.connId, connName: conn.connName,
        detail: bodyText.slice(0, 400),
      });
    }
    return res;
  } catch (e) {
    if (e instanceof EsHttpError) {
      const conn = auditConn();
      void recordAudit({
        method, path: target.path + target.query, status: e.status, ok: false,
        costMs: performance.now() - startedAt, connId: conn.connId, connName: conn.connName,
        detail: typeof e.data === 'string' ? e.data.slice(0, 400) : JSON.stringify(e.data ?? '').slice(0, 400),
      });
      return response(e.data, e.status);
    }
    return fail(500, String((e as any)?.message || e), 'BROWSER_BRIDGE_FAILED');
  }
}
