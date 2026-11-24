/* 纯浏览器模式的监控采样器：用页面定时器 + IndexedDB 复刻服务端的分钟采样、
 * 环形保留与告警事件。页面关闭后不采样（这是浏览器模式的真实边界，UI 不伪造历史）。 */
import { dbAdd, dbAll, dbDeleteMany, metaGet, metaSet, STORE_ALERTS, STORE_MONITOR, STORE_AUDIT } from './browserStore';
import { dataProfile, type BrowserProfile } from './browserProfiles';
const LAST_SAMPLE_KEY = 'esquerystudio.monitor.lastSample';
const ALERT_STATE_KEY = 'monitor.alertState';
const SAMPLE_MS = 60_000;
const MAX_ROWS = 60_000; /* 6万行才能让 1 集群 + 3 节点/分钟 也覆盖 7 天保留窗口 */
const RETENTION_MS = 7 * 24 * 3600_000;
const AUDIT_MAX_ROWS = 20_000;
const AUDIT_TRIM_EVERY_MS = 60_000;

let started = false;
let timer: any = null;
let lastAuditTrimAt = 0;

function profile(): BrowserProfile | null {
  return dataProfile();
}

function authHeaders(p: { username?: string; password?: string; authType?: 'BASIC' | 'API_KEY' }): Record<string, string> {
  if (p.authType === 'API_KEY' && p.password) return { Authorization: 'ApiKey ' + p.password };
  if (!p.username) return {};
  return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(p.username + ':' + (p.password || '')))) };
}

async function esGet(path: string, p: { url: string; username?: string; password?: string }): Promise<any> {
  const res = await fetch(p.url.replace(/\/+$/, '') + path, {
    headers: { Accept: 'application/json', ...authHeaders(p) }, credentials: 'omit', cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && (data.error?.reason || data.message)) || text || ('HTTP ' + res.status));
  return data;
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function lastCluster(connId: string): Promise<any | null> {
  const all = await dbAll<any>(STORE_MONITOR);
  const rows = all.filter(r => r.scope === 'cluster' && r.connId === connId).sort((a, b) => b.timestamp - a.timestamp);
  return rows[0] || null;
}

function alertStateKey(connId: string): string { return ALERT_STATE_KEY + ':' + connId; }
function lastSampleKey(connId: string): string { return LAST_SAMPLE_KEY + ':' + connId; }

function addAlert(list: any[], connId: string, connName: string, level: string, metric: string, value: any, threshold: any, message: string, recovered = false) {
  list.push({ timestamp: Date.now(), connId, connName, env: 'BROWSER', level, metric, value, threshold, message, recovered });
}

export async function sampleMonitorOnce(): Promise<void> {
  const p = profile();
  if (!p) return;
  const connId = p.id || 'browser';
  const startedAt = Date.now();
  let health: any = null, stats: any = null, cat: any[] = [], root: any = null, idxStats: any = null;
  let error = '';
  try {
    /* 只有集群健康是硬依赖：受限账号可能没有 _nodes / _cat / _stats 权限，
       这些是增强项，失败时降级为空而不是把整条采样标成 RED。 */
    [root, health, stats, cat, idxStats] = await Promise.all([
      esGet('/', p).catch(() => null),
      esGet('/_cluster/health', p),
      esGet('/_nodes/stats/jvm,os,fs,indices,thread_pool', p).catch(() => null),
      esGet('/_cat/indices?format=json&h=index,health,docs.count,store.size,pri,rep,docs.deleted,segments.count', p).catch(() => []),
      esGet('/_stats/search,indexing,store,docs?level=indices', p).catch(() => null),
    ]);
  } catch (e: any) {
    error = String(e?.message || e).slice(0, 500);
  }
  const latencyMs = Date.now() - startedAt;
  const connName = String(health?.cluster_name || root?.cluster_name || new URL(p.url).hostname);
  const prev = await lastCluster(connId);
  const now = Date.now();
  const dtSec = prev?.timestamp ? Math.max(1, (now - prev.timestamp) / 1000) : 0;
  const statsNodes = stats && stats.nodes ? Object.values<any>(stats.nodes) : null;
  const statsOk = !!statsNodes;
  const nodes: any[] = statsNodes || [];
  const heapPcts = nodes.map(n => num(n?.jvm?.mem?.heap_used_percent)).filter(n => n > 0);
  const cpuPcts = nodes.map(n => num(n?.os?.cpu?.percent));
  const diskPcts = nodes.map(n => {
    const t = num(n?.fs?.total?.total_in_bytes), a = num(n?.fs?.total?.available_in_bytes);
    return t > 0 ? Math.round(((t - a) / t) * 1000) / 10 : 0;
  });
  const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const searchTotal = sum(nodes.map(n => num(n?.indices?.search?.query_total)));
  const indexTotal = sum(nodes.map(n => num(n?.indices?.indexing?.index_total)));
  const writeRej = sum(nodes.map(n => num(n?.thread_pool?.write?.rejected)));
  const searchRej = sum(nodes.map(n => num(n?.thread_pool?.search?.rejected)));
  const cluster: any = {
    timestamp: now, connId, connName, env: p.env || 'BROWSER', scope: 'cluster',
    status: error ? 'RED' : String(health?.status || 'unknown'),
    latencyMs, esVersion: root?.version?.number,
    nodes: Number(health?.number_of_nodes || nodes.length),
    indices: (cat || []).filter((r: any) => !String(r.index || '').startsWith('.')).length,
    shards: Number(health?.active_shards || 0),
    unassigned: Number(health?.unassigned_shards || 0),
    primaryShards: Number(health?.active_primary_shards || 0),
    nodesMissing: statsOk ? Math.max(0, Number(health?.number_of_nodes || 0) - nodes.length) : 0,
    heapUsedPct: Math.round(avg(heapPcts)),
    cpuPct: Math.round(avg(cpuPcts)),
    diskUsedPct: Math.round(Math.max(0, ...diskPcts)),
    heapUsedMb: Math.round(sum(nodes.map(n => num(n?.jvm?.mem?.heap_used_in_bytes))) / 1048576),
    fielddataMb: Math.round(sum(nodes.map(n => num(n?.indices?.fielddata?.memory_size_in_bytes))) / 1048576),
    docsDeleted: sum((cat || []).map((r: any) => num(r['docs.deleted']))),
    error: error || undefined,
    _searchTotal: searchTotal, _indexTotal: indexTotal, _writeRej: writeRej, _searchRej: searchRej,
  };
  if (dtSec && prev) {
    cluster.qps = Math.round(((searchTotal - num(prev._searchTotal)) / dtSec) * 100) / 100;
    cluster.indexRate = Math.round(((indexTotal - num(prev._indexTotal)) / dtSec) * 100) / 100;
    cluster.writeRejected = Math.round(((writeRej - num(prev._writeRej)) / dtSec) * 60);
    cluster.searchRejected = Math.round(((searchRej - num(prev._searchRej)) / dtSec) * 60);
  }
  const prevCounters: Record<string, any> = prev?.indexCounters || {};
  const nextCounters: Record<string, any> = {};
  const tops: any[] = [];
  for (const [idx, v] of Object.entries<any>(idxStats?.indices || {})) {
    if (String(idx).startsWith('.')) continue;
    const q = num(v?.total?.search?.query_total);
    const i = num(v?.total?.indexing?.index_total);
    nextCounters[idx] = { q, i };
    const pq = prevCounters[idx]?.q, pi = prevCounters[idx]?.i;
    const qps = dtSec && pq != null ? Math.round(((q - pq) / dtSec) * 100) / 100 : undefined;
    const rate = dtSec && pi != null ? Math.round(((i - pi) / dtSec) * 100) / 100 : undefined;
    tops.push({ index: idx, qps, idxRate: rate, storeMb: Math.round(num(v?.total?.store?.size_in_bytes) / 10485.76) / 100, docs: num(v?.total?.docs?.count) });
  }
  tops.sort((a, b) => (b.qps || 0) - (a.qps || 0) || (b.idxRate || 0) - (a.idxRate || 0) || b.storeMb - a.storeMb);
  cluster.topIndexes = tops.slice(0, 12);
  cluster.indexCounters = nextCounters;
  const nodeRows: any[] = [];
  for (const n of nodes) {
    const t = num(n?.fs?.total?.total_in_bytes), a = num(n?.fs?.total?.available_in_bytes);
    const prevNodeRow = prev?.nodesDetail?.find((x: any) => x.nodeName === n.name);
    const wRej = num(n?.thread_pool?.write?.rejected), sRej = num(n?.thread_pool?.search?.rejected);
    nodeRows.push({
      timestamp: now, connId, connName, env: p.env || 'BROWSER', scope: 'node', nodeName: n.name,
      status: error ? 'RED' : String(health?.status || 'unknown'),
      heapUsedPct: num(n?.jvm?.mem?.heap_used_percent), heapUsedMb: Math.round(num(n?.jvm?.mem?.heap_used_in_bytes) / 1048576),
      cpuPct: num(n?.os?.cpu?.percent), esCpuPct: num(n?.os?.cpu?.percent), load1m: num(n?.os?.cpu?.load_average?.['1m']),
      diskUsedPct: t > 0 ? Math.round(((t - a) / t) * 1000) / 10 : 0, fsAvailMb: Math.round(a / 1048576),
      osMemUsedPct: num(n?.os?.mem?.used_percent), fielddataMb: Math.round(num(n?.indices?.fielddata?.memory_size_in_bytes) / 1048576),
      tpWriteActive: num(n?.thread_pool?.write?.active), tpWriteQueue: num(n?.thread_pool?.write?.queue),
      writeRejected: dtSec && prevNodeRow ? Math.round(((wRej - num(prevNodeRow._writeRej)) / dtSec) * 60) : undefined,
      searchRejected: dtSec && prevNodeRow ? Math.round(((sRej - num(prevNodeRow._searchRej)) / dtSec) * 60) : undefined,
      _writeRej: wRej, _searchRej: sRej,
    });
  }
  cluster.nodesDetail = nodeRows;

  const alerts: any[] = [];
  const active: Record<string, any> = {};
  if (!error) {
    if (cluster.status === 'red') active['cluster.status'] = { level: 'CRIT', value: 1, threshold: 0, message: '集群 RED，存在不可用主分片' };
    else if (cluster.status === 'yellow' && cluster.nodes > 1) active['cluster.status'] = { level: 'WARN', value: 1, threshold: 0, message: '集群 YELLOW，副本分片未分配' };
    if (cluster.heapUsedPct >= 85) active['nodes.heap'] = { level: 'WARN', value: cluster.heapUsedPct, threshold: 85, message: '平均 heap 使用率 >= 85%' };
    if (cluster.diskUsedPct >= 85) active['nodes.disk'] = { level: 'CRIT', value: cluster.diskUsedPct, threshold: 85, message: '节点磁盘使用率 >= 85%' };
    if (cluster.cpuPct >= 90) active['nodes.cpu'] = { level: 'WARN', value: cluster.cpuPct, threshold: 90, message: '平均 CPU >= 90%' };
    if (statsOk && cluster.nodesMissing > 0) active['nodes.missing'] = { level: 'CRIT', value: cluster.nodesMissing, threshold: 0, message: '有节点失联' };
  } else {
    active['connection'] = { level: 'CRIT', value: 1, threshold: 0, message: '集群连接失败：' + error };
  }
  const prevState: Record<string, any> = (await metaGet(alertStateKey(connId))) || {};
  for (const [metric, a] of Object.entries<any>(active)) {
    if (!prevState[metric] || prevState[metric].level !== a.level) addAlert(alerts, connId, connName, a.level, metric, a.value, a.threshold, a.message);
  }
  for (const metric of Object.keys(prevState)) {
    if (!active[metric]) addAlert(alerts, connId, connName, 'INFO', metric, 0, 0, '指标已恢复：' + metric, true);
  }
  await metaSet(alertStateKey(connId), active);

  localStorage.setItem('esquerystudio.monitor.connName', connName);
  localStorage.setItem(lastSampleKey(connId), String(now));
  localStorage.setItem(LAST_SAMPLE_KEY, String(now));
  try {
    (globalThis as any).chrome?.storage?.local?.set?.({
      'esquerystudio.monitor.lastSample': now,
      [lastSampleKey(connId)]: now,
      'esquerystudio.browser.profile': p,
    });
  } catch { /* 非扩展环境 */ }
  await dbAdd(STORE_MONITOR, cluster);
  for (const n of nodeRows) await dbAdd(STORE_MONITOR, n);
  for (const a of alerts) await dbAdd(STORE_ALERTS, a);
  localStorage.setItem(lastSampleKey(connId), String(now));

  const all = await dbAll<any>(STORE_MONITOR);
  if (all.length > MAX_ROWS || (all.length && all[0].timestamp < now - RETENTION_MS)) {
    const keep = all.filter(r => r.timestamp >= now - RETENTION_MS);
    const cut = all.length - Math.min(keep.length, MAX_ROWS);
    const doomed = all.sort((a, b) => a.timestamp - b.timestamp).slice(0, Math.max(0, cut)).map(r => r.id);
    await dbDeleteMany(STORE_MONITOR, doomed);
  }
}

export function startBrowserMonitor(): void {
  if (started) return;
  started = true;
  const p = profile();
  const last = Number(localStorage.getItem(p ? lastSampleKey(p.id || 'browser') : LAST_SAMPLE_KEY) || 0);
  if (!last || Date.now() - last > 55_000) setTimeout(() => { void sampleMonitorOnce(); }, 1200);
  timer = setInterval(() => { void sampleMonitorOnce(); }, SAMPLE_MS);
}

export async function queryMonitorMetrics(p: { scope?: string; connId?: string; connName?: string; fromMs?: number; toMs?: number; size?: number; interval?: string; agg?: string }): Promise<{ records: any[] }> {
  const all = (await dbAll<any>(STORE_MONITOR)).filter(r =>
    (!p.scope || r.scope === p.scope)
    && (!p.connId || r.connId === p.connId)
    && (!p.connName || r.connName === p.connName)
    && (!p.fromMs || r.timestamp >= p.fromMs)
    && (!p.toMs || r.timestamp <= p.toMs));
  all.sort((a, b) => a.timestamp - b.timestamp);
  let rows = all;
  const unit: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '1d': 86_400_000 };
  if (p.interval && unit[p.interval]) {
    const bucketMs = unit[p.interval];
    const buckets = new Map<number, any[]>();
    for (const r of rows) {
      const k = Math.floor(r.timestamp / bucketMs) * bucketMs;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }
    const numeric = ['qps', 'indexRate', 'heapUsedPct', 'cpuPct', 'diskUsedPct', 'nodes', 'indices', 'shards', 'unassigned', 'primaryShards', 'nodesMissing', 'tpWriteActive', 'tpWriteQueue', 'docsDeleted', 'heapUsedMb', 'fielddataMb', 'writeRejected', 'searchRejected', 'load1m', 'fsAvailMb', 'osMemUsedPct', 'esCpuPct'];
    rows = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, list]) => {
      const out: any = { ...list[list.length - 1], timestamp: k };
      for (const f of numeric) {
        const vals = list.map(x => x[f]).filter((v: any) => typeof v === 'number');
        if (!vals.length) { delete out[f]; continue; }
        out[f] = p.agg === 'max' ? Math.max(...vals) : Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      }
      return out;
    });
  }
  const size = Math.max(1, Math.min(5000, Number(p.size || 3000)));
  return { records: rows.slice(-size).map(r => { const { nodesDetail, indexCounters, _searchTotal, _indexTotal, _writeRej, _searchRej, ...rest } = r; return rest; }) };
}

export async function queryMonitorHistory(p: { connId?: string; status?: string; fromMs?: number; toMs?: number; size?: number; from?: number }): Promise<{ records: any[] }> {
  const rows = (await dbAll<any>(STORE_MONITOR))
    .filter(r => r.scope === 'cluster')
    .filter(r => (!p.connId || r.connId === p.connId)
      && (!p.status || String(r.status).toUpperCase() === String(p.status).toUpperCase())
      && (!p.fromMs || r.timestamp >= p.fromMs) && (!p.toMs || r.timestamp <= p.toMs))
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(r => ({ timestamp: r.timestamp, connId: r.connId || 'browser', connName: r.connName, env: r.env || 'BROWSER', status: r.status, latencyMs: r.latencyMs, esVersion: r.esVersion, error: r.error }));
  const from = Math.max(0, Number(p.from || 0));
  const size = Math.max(1, Math.min(1000, Number(p.size || 200)));
  return { records: rows.slice(from, from + size) };
}

export async function queryMonitorAlerts(size = 50, fromMs?: number, toMs?: number): Promise<{ records: any[] }> {
  const rows = (await dbAll<any>(STORE_ALERTS))
    .filter(r => (!fromMs || r.timestamp >= fromMs) && (!toMs || r.timestamp <= toMs))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, Math.max(1, Math.min(500, size)));
  return { records: rows };
}

export async function queryTopIndexes(connName?: string, limit = 8): Promise<{ records: any[] }> {
  const rows = (await dbAll<any>(STORE_MONITOR))
    .filter(r => r.scope === 'cluster' && (!connName || r.connName === connName))
    .sort((a, b) => b.timestamp - a.timestamp);
  const latest = rows[0];
  return { records: (latest?.topIndexes || []).slice(0, Math.max(1, Math.min(20, limit))) };
}

export async function monitorRingUsage(): Promise<any> {
  const [mon, alerts, audit] = await Promise.all([dbAll(STORE_MONITOR), dbAll(STORE_ALERTS), dbAll(STORE_AUDIT)]);
  const bytes = (a: any[]) => a.reduce((n, x) => n + JSON.stringify(x).length, 0);
  const monitorBytes = bytes(mon) + bytes(alerts);
  const auditBytes = bytes(audit);
  return {
    auditPrefix: 'browser://local/audit', monitorPrefix: 'browser://local/monitor',
    auditBytes, monitorBytes, totalBytes: auditBytes + monitorBytes, capBytes: 50 * 1024 * 1024,
  };
}

async function trimAuditIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastAuditTrimAt < AUDIT_TRIM_EVERY_MS) return;
  lastAuditTrimAt = now;
  try {
    const rows = await dbAll<any>(STORE_AUDIT);
    if (rows.length <= AUDIT_MAX_ROWS) return;
    const doomed = rows.sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, rows.length - AUDIT_MAX_ROWS)
      .map(r => r.id);
    await dbDeleteMany(STORE_AUDIT, doomed);
  } catch { /* 治理失败不阻断审计写入 */ }
}

export async function recordAudit(entry: { method: string; path: string; status: number; ok: boolean; costMs: number; connId?: string; connName?: string; detail?: string; action?: string }): Promise<void> {
  try {
    await dbAdd(STORE_AUDIT, {
      timestamp: Date.now(), username: 'browser', role: 'ADMIN', source: 'host', action: entry.action || (entry.ok ? 'ES_REQUEST' : 'ES_ERROR'),
      method: entry.method, uri: entry.path, connId: entry.connId || 'browser', connName: entry.connName || '',
      ip: '127.0.0.1', httpStatus: entry.status, costMs: Math.round(entry.costMs), detail: entry.detail || '',
    });
    void trimAuditIfNeeded();
  } catch { /* 审计旁路静默 */ }
}

export async function queryLocalAudit(p: { username?: string; action?: string; size?: number; from?: number; since?: number; connName?: string; uriPrefix?: string; minCostMs?: number; fromMs?: number; toMs?: number }): Promise<any[]> {
  const rows = (await dbAll<any>(STORE_AUDIT))
    .filter(r => (!p.username || r.username === p.username)
      && (!p.action || r.action === p.action)
      && (!p.connName || r.connName === p.connName)
      && (!p.uriPrefix || String(r.uri).startsWith(p.uriPrefix))
      && (p.minCostMs == null || Number(r.costMs) >= p.minCostMs)
      && (!p.since || r.timestamp >= p.since)
      && (!p.fromMs || r.timestamp >= p.fromMs)
      && (!p.toMs || r.timestamp <= p.toMs))
    .sort((a, b) => b.timestamp - a.timestamp);
  const from = Math.max(0, Number(p.from || 0));
  const size = Math.max(1, Math.min(500, Number(p.size || 100)));
  return rows.slice(from, from + size);
}

export async function auditFacetsLocal(): Promise<any> {
  const rows = await dbAll<any>(STORE_AUDIT);
  const count = (field: string) => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = String(r[field] || ''); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([key, n]) => ({ key, count: n }));
  };
  return { actions: count('action'), conns: count('connName'), users: count('username'), uris: count('uri') };
}
