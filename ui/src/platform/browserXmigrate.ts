/* 纯浏览器模式的跨集群迁移：源集群用表单连接串/档案现场连接，目标恒为当前插件连接的
 * 宿主 ES。数据面用 scroll + _bulk 搬运（不依赖宿主 reindex.remote.whitelist），
 * 作业状态存本机 localStorage；页面关闭后搬运停止——不伪造后台进度。 */
import { writeStoredRaw } from '../utils/safeJson';

export type HostCall = (path: string, method?: string, body?: string) => Promise<any>;

const JOBS_KEY = 'esquerystudio.xmigrate.jobs';
const BATCH_DEFAULT = 500;
let hostCall: HostCall | null = null;
let running = false;
const stopFlags = new Set<string>();
const activeJobs = new Set<string>();

function enc(v: string): string { return encodeURIComponent(v); }
function jobs(): any[] {
  try { const a = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function saveJobs(a: any[]): void { writeStoredRaw(localStorage, JOBS_KEY, JSON.stringify(a.slice(0, 30))); }
function putJob(j: any): any { const a = jobs(); const i = a.findIndex(x => x.jobId === j.jobId); if (i >= 0) a[i] = j; else a.unshift(j); saveJobs(a); return j; }

function sourceBase(conn: any): string {
  if (conn?.url) return String(conn.url).replace(/\/+$/, '');
  const scheme = String(conn?.scheme || 'http').replace(/:$/, '');
  const host = String(conn?.host || '').trim();
  if (!host) throw new Error('源集群 host 不能为空');
  const port = conn?.port ? ':' + conn.port : '';
  return scheme + '://' + host + port;
}
function sourceAuth(conn: any): Record<string, string> {
  if (!conn?.username) return {};
  return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(conn.username + ':' + (conn.password || '')))) };
}
async function sourceCall(conn: any, path: string, method = 'GET', body?: string): Promise<any> {
  const res = await fetch(sourceBase(conn) + path, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...sourceAuth(conn) },
    body: method === 'GET' ? undefined : body,
    credentials: 'omit', cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && (data.error?.reason || data.message)) || text || ('HTTP ' + res.status));
  return data;
}

export async function connectCheck(conn: any): Promise<any[]> {
  const rows = await sourceCall(conn, '/_cat/indices?format=json&h=index,health,docs.count,store.size');
  return (rows || []).filter((r: any) => !String(r.index || '').startsWith('.'));
}

export async function fetchConfig(conn: any, sourceIndex: string): Promise<any> {
  const [m, s] = await Promise.all([
    sourceCall(conn, '/' + enc(sourceIndex) + '/_mapping'),
    sourceCall(conn, '/' + enc(sourceIndex) + '/_settings?flat_settings=true&include_defaults=false'),
  ]);
  let mapping: any = {};
  for (const v of Object.values<any>(m || {})) { mapping = v?.mappings || {}; break; }
  let settings: any = {};
  for (const v of Object.values<any>(s || {})) { settings = v?.settings || {}; break; }
  return { mapping: JSON.stringify(mapping, null, 2), settings: JSON.stringify(settings, null, 2) };
}

export async function resolvePreview(conn: any): Promise<any> {
  const u = new URL(sourceBase(conn));
  return { scheme: u.protocol.replace(':', ''), host: u.hostname, port: Number(u.port || 9200), username: conn?.username || '', passwordResolved: !!conn?.password };
}

export async function destIndices(host: HostCall): Promise<any[]> {
  const rows = await host('/_cat/indices?format=json&h=index,health,docs.count,store.size');
  return (rows || []).filter((r: any) => !String(r.index || '').startsWith('.'));
}

export async function preflight(host: HostCall, req: any): Promise<any> {
  let destExists = false;
  try { await host('/' + enc(req.destIndex) + '/_mapping'); destExists = true; } catch { /* 不存在 */ }
  return { destExists, sourceIndex: req.sourceIndex, destIndex: req.destIndex };
}

function parseSettings(s: string): any {
  try { const o = JSON.parse(s || '{}'); return o; } catch { return {}; }
}
function propsOf(mapping: any): any {
  if (mapping?.properties) return mapping.properties;
  if (mapping?.mappings?.properties) return mapping.mappings.properties;
  const only: any = Object.values(mapping || {})[0];
  return only?.mappings?.properties || only?.properties || {};
}

async function ensureDest(host: HostCall, req: any, conn: any): Promise<void> {
  if (req.destCreateMode === 'NONE') return;
  if (req.destCreateMode === 'FROM_ENTITY') throw new Error('浏览器模式没有业务实体注册表，请改用「按源结构建」或「已存在」');
  const cfg = await fetchConfig(conn, req.sourceIndex);
  if (req.destCreateMode === 'REBUILD') { try { await host('/' + enc(req.destIndex), 'DELETE'); } catch { /* 不存在 */ } }
  const settings = parseSettings(cfg.settings);
  delete settings['index.uuid'];
  delete settings['index.creation_date'];
  delete settings['index.provided_name'];
  delete settings['index.version.created'];
  const mapping = JSON.parse(cfg.mapping || '{}');
  try {
    await host('/' + enc(req.destIndex), 'PUT', JSON.stringify({ settings, mappings: { properties: propsOf(mapping) } }));
  } catch (e: any) {
    if (req.destCreateMode === 'COPY_FROM_SOURCE' && /resource_already_exists/.test(String(e?.message))) return;
    throw e;
  }
}

async function runJob(job: any, req: any, conn: any): Promise<void> {
  const host = hostCall!;
  activeJobs.add(job.jobId);
  const batch = Math.max(50, Math.min(5000, Number(req.batchSize || BATCH_DEFAULT)));
  job.status = 'RUNNING'; job.message = '准备迁移'; putJob(job);
  try {
    await ensureDest(host, req, conn);
    let scrollId = '';
    let migrated = 0, conflicts = 0, errors = 0;
    do {
      if (stopFlags.has(job.jobId)) { job.status = 'ABORTED'; job.message = '已中止（已搬运数据保留）'; break; }
      const page = scrollId
        ? await sourceCall(conn, '/_search/scroll', 'POST', JSON.stringify({ scroll: '1m', scroll_id: scrollId }))
        : await sourceCall(conn, '/' + enc(req.sourceIndex) + '/_search?scroll=1m', 'POST', JSON.stringify({ size: batch, sort: ['_doc'], track_total_hits: true }));
      scrollId = page?._scroll_id || scrollId;
      const hits = page?.hits?.hits || [];
      if (!scrollId) job.total = page?.hits?.total?.value ?? page?.hits?.total ?? 0;
      if (!hits.length) { try { if (scrollId) await sourceCall(conn, '/_search/scroll', 'DELETE', JSON.stringify({ scroll_id: scrollId })); } catch { /* ignore */ } break; }
      const lines: string[] = [];
      for (const h of hits) {
        lines.push(JSON.stringify({ index: { _index: req.destIndex, _id: h._id } }));
        lines.push(JSON.stringify(h._source));
      }
      const r = await host('/_bulk?refresh=false', 'POST', lines.join('\n') + '\n');
      const items = r?.items || [];
      for (const it of items) {
        const op: any = Object.values<any>(it)[0] || {};
        if (Number(op.status) < 300) migrated++;
        else if (Number(op.status) === 409) conflicts++;
        else errors++;
      }
      job.migrated = migrated; job.conflicts = conflicts; job.errors = errors;
      job.total = job.total || page?.hits?.total?.value || migrated;
      job.message = '已迁移 ' + migrated + ' 条';
      putJob(job);
    } while (scrollId);
    if (job.status !== 'ABORTED') { job.status = 'DONE'; job.message = '迁移完成：' + migrated + ' 条'; }
    job.finishTime = Date.now(); putJob(job);
  } catch (e: any) {
    job.status = 'FAILED'; job.message = String(e?.message || e); job.finishTime = Date.now(); putJob(job);
  } finally {
    activeJobs.delete(job.jobId);
    running = false;
  }
}

export async function start(host: HostCall, req: any, conn: any): Promise<any> {
  hostCall = host;
  const jobId = 'xm-' + Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('');
  const job: any = {
    jobId, sourceIndex: req.sourceIndex, destIndex: req.destIndex, status: 'RUNNING', migrated: 0,
    total: 0, conflicts: 0, errors: 0, createTime: Date.now(), message: '启动中',
    remoteEndpoint: sourceBase(conn), srcConnId: req.srcConnId || null,
  };
  putJob(job);
  running = true;
  void runJob(job, req, conn);
  return { jobId };
}

export async function progress(jobId: string): Promise<any> {
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  return markIfStale(j);
}
export async function listJobs(host: HostCall, limit = 20): Promise<any[]> {
  hostCall = host;
  const list = jobs();
  for (const j of list) markIfStale(j);
  saveJobs(list);
  return list.slice(0, Math.max(1, Math.min(500, limit)));
}
function markIfStale(j: any): any {
  if (j.status === 'RUNNING' && !activeJobs.has(j.jobId)) {
    j.status = 'INTERRUPTED'; j.message = '页面已关闭，搬运中断；已写入目标的数据保留，可重新发起或续跑';
  }
  return j;
}
export async function abort(jobId: string): Promise<any> {
  stopFlags.add(jobId);
  const j = jobs().find(x => x.jobId === jobId);
  if (j && j.status === 'RUNNING') { j.status = 'ABORTED'; j.message = '已中止（已搬运数据保留）'; putJob(j); }
  return { aborted: jobId };
}
export async function resume(_host: HostCall, jobId: string, conn: any): Promise<any> {
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  j.status = 'RUNNING'; j.message = '续跑（重新扫描，已存在文档跳过）'; putJob(j);
  running = true;
  void runJob(j, { sourceIndex: j.sourceIndex, destIndex: j.destIndex, destCreateMode: 'NONE', batchSize: BATCH_DEFAULT }, conn);
  return { jobId };
}
