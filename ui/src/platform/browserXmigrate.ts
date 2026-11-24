/* 纯浏览器模式的跨集群迁移：源集群用表单连接串/档案现场连接，目标恒为当前插件连接的
 * 宿主 ES。数据面用 sliced scroll + _bulk 搬运（不依赖宿主 reindex.remote.whitelist），
 * 最多 4 路并行（浏览器连接数有限，不照搬服务端线程池规模）；bulk 用 create 语义，
 * 重跑/续跑已写文档按 409 跳过（对齐服务端 SliceWorker）。作业状态存本机
 * localStorage，写入按 500ms 节流合并（终态立即落盘）；页面关闭后搬运停止——
 * 不伪造后台进度。 */
import { readStoredJson, writeStoredRaw } from '../utils/safeJson';
import { dataProfile, profileById } from './browserProfiles';

export type HostCall = (path: string, method?: string, body?: string) => Promise<any>;

const JOBS_KEY = 'esquerystudio.xmigrate.jobs';
const BATCH_DEFAULT = 500;
/* 浏览器端并行路数上限：每路 slice 独立持有 scroll 游标与 bulk 请求，
 * 路数过高会打满浏览器对同源 ES 的并发连接，压到 4 封顶（服务端无此限制） */
const MAX_SLICES = 4;
/* localStorage 台账写节流窗口：并行搬运期间进度高频变化，合并写避免写风暴；
 * 终态（DONE/FAILED/ABORTED）不走节流、立即落盘 */
const LEDGER_WRITE_INTERVAL_MS = 500;
/* 作业事件环容量（轮次/切片/409/终态），服务端事件时间线同口径滚动截断 */
const EVENT_RING_MAX = 200;
/* 版本冲突 _id 样本环容量（与服务端 conflictSamples 环同上限） */
const CONFLICT_SAMPLES_MAX = 1000;
let hostCall: HostCall | null = null;
let running = false;
const stopFlags = new Set<string>();
const activeJobs = new Set<string>();
/* 运行中作业的动态限速（docs/s）：throttle 端点写入，runJob 搬运循环逐批读取；
 * 页面内 Map（作业中断即失效）+ 作业台账 throttleRps 字段（展示/回放）双写 */
const THROTTLE_RPS = new Map<string, number>();

function enc(v: string): string { return encodeURIComponent(v); }
function jobs(): any[] {
  try { const a = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function saveJobs(a: any[]): void { writeStoredRaw(localStorage, JOBS_KEY, JSON.stringify(a.slice(0, 30))); }
function putJob(j: any): any { const a = jobs(); const i = a.findIndex(x => x.jobId === j.jobId); if (i >= 0) a[i] = j; else a.unshift(j); saveJobs(a); return j; }

/* 作业事件时间线（口径对齐服务端 {ts,stage,message,level}）：容量 200 滚动截断 */
function pushEvent(j: any, stage: string, message: string, level = 'info'): void {
  (j.events ||= []).push({ ts: Date.now(), stage, message, level });
  if (j.events.length > EVENT_RING_MAX) j.events.splice(0, j.events.length - EVENT_RING_MAX);
}

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

/* _cat 行字段转数字：docs.count/pri 缺列或空串（close 索引无 docs.count）返回 null，不误报 0 */
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* 迁移前预检（双侧）：字段口径对齐服务端 CrossClusterMigrateService.preflight——
 * srcDocCount/srcShards/destShards/estSeconds 同名同义（尽力而为，取不到如实 null，
 * 不阻断启动）；health/store.size 为浏览器侧 _cat 顺带可得的服务端没有的补充字段。
 * estSeconds 恒 null：浏览器模式无调优档速率模型（tuneMode 仍忽略），不虚构耗时预估。 */
export async function preflight(host: HostCall, req: any): Promise<any> {
  let destExists = false;
  try { await host('/' + enc(req.destIndex) + '/_mapping'); destExists = true; } catch { /* 不存在 */ }
  /* 源侧检查：req.conn 未填（服务端同语义）静默跳过；填了但取数失败（连通/凭据问题）
   * 也只置 null，预检契约是尽力而为 */
  let srcDocCount: number | null = null;
  let srcShards: number | null = null;
  let sourceHealth: string | null = null;
  let sourceStoreSize: string | null = null;
  if (req.conn) {
    try {
      const rows: any[] = await sourceCall(req.conn, '/_cat/indices?format=json&h=index,health,status,pri,docs.count,store.size');
      const row = (rows || []).find((r: any) => String(r.index) === String(req.sourceIndex));
      if (row) {
        srcDocCount = numOrNull(row['docs.count']);
        srcShards = numOrNull(row.pri);
        sourceHealth = row.health ? String(row.health) : null;
        sourceStoreSize = row['store.size'] ? String(row['store.size']) : null;
      }
    } catch { /* 源侧取数失败不阻断，字段保持 null */ }
  }
  /* 目标侧补充：目标存在时才读（同服务端 destShards 口径） */
  let destShards: number | null = null;
  let destHealth: string | null = null;
  if (destExists) {
    try {
      const rows: any[] = await host('/_cat/indices?format=json&h=index,health,pri');
      const row = (rows || []).find((r: any) => String(r.index) === String(req.destIndex));
      if (row) {
        destShards = numOrNull(row.pri);
        destHealth = row.health ? String(row.health) : null;
      }
    } catch { /* 取不到置 null，不打断预检 */ }
  }
  /* 源侧结构增强（浏览器端可算）：存储字节数（_stats 主分片口径）、别名清单、
   * 字段类型分布（mapping 递归统计，含 multi-field），取不到如实 null */
  let sourceBytes: number | null = null;
  let sourceAliases: string[] | null = null;
  let fieldTypeCounts: Record<string, number> | null = null;
  if (req.conn) {
    try {
      const stats = await sourceCall(req.conn, '/' + enc(req.sourceIndex) + '/_stats/store');
      sourceBytes = Number(Object.values<any>(stats?.indices || {})[0]?.primaries?.store?.size_in_bytes) || null;
    } catch { /* _stats 读不到置 null */ }
    try {
      const aliasRaw = await sourceCall(req.conn, '/' + enc(req.sourceIndex) + '/_alias');
      sourceAliases = Object.keys(Object.values<any>(aliasRaw || {})[0]?.aliases || {});
    } catch { sourceAliases = null; }
    try {
      const mapRaw = await sourceCall(req.conn, '/' + enc(req.sourceIndex) + '/_mapping');
      const counts: Record<string, number> = {};
      const walk = (bucket: any): void => {
        for (const def of Object.values<any>(bucket || {})) {
          if (!def || typeof def !== 'object') continue;
          const t = def.type || (def.properties ? 'object' : null);
          if (t) counts[t] = (counts[t] || 0) + 1;
          if (def.properties) walk(def.properties);
          if (def.fields) walk(def.fields);
        }
      };
      walk(propsOf(Object.values<any>(mapRaw || {})[0]?.mappings || {}));
      fieldTypeCounts = counts;
    } catch { fieldTypeCounts = null; }
  }
  /* 迁移建议（前端可判定的事实）：目标在否决定合并语义与结构同步入口 */
  const recommended = destExists
    ? '目标索引已存在：本次为合并语义（create 409 跳过已写文档）；结构差异可先用 sync_structure dryRun=true 预览'
    : '目标索引不存在：建议先 sync_structure dryRun=true 预览兼容剔除计划，确认后再建索引迁移';
  return {
    sourceIndex: req.sourceIndex, destIndex: req.destIndex, destExists,
    srcDocCount, srcShards, destShards, estSeconds: null,
    sourceHealth, sourceStoreSize, destHealth,
    sourceBytes, sourceAliases, fieldTypeCounts, recommended,
  };
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

/* 建索引（start 的 COPY_FROM_SOURCE/REBUILD 路径）：拉源 settings/mapping → 剔内部键
 * （SYNC_VOLATILE_SETTINGS 五键，含 index.version.upgraded，对齐服务端 STRIPPED_SETTING_KEYS）
 * → 按目标（宿主）探测快照跑兼容矩阵（vendor-private 剔除与插件级联降级，同
 * sync_structure 的 planned 预剔除）；矩阵/探测失败降级为原样继续建索引（预判增强，
 * 不阻断迁移——目标真不支持时由 PUT 报错如实暴露）。 */
async function ensureDest(host: HostCall, req: any, conn: any): Promise<void> {
  if (req.destCreateMode === 'NONE') return;
  if (req.destCreateMode === 'FROM_ENTITY') throw new Error('浏览器模式没有业务实体注册表，请改用「按源结构建」或「已存在」');
  const cfg = await fetchConfig(conn, req.sourceIndex);
  if (req.destCreateMode === 'REBUILD') { try { await host('/' + enc(req.destIndex), 'DELETE'); } catch { /* 不存在 */ } }
  const strippedSettings = (): Record<string, any> => {
    const s = parseSettings(cfg.settings);
    for (const key of SYNC_VOLATILE_SETTINGS) delete s[key];
    return s;
  };
  let putBody: any = { settings: strippedSettings(), mappings: { properties: propsOf(JSON.parse(cfg.mapping || '{}')) } };
  try {
    const settings = strippedSettings();
    const analysis = syncSplitAnalysis(settings);
    const props = propsOf(JSON.parse(cfg.mapping || '{}'));
    const targetCaps = await probeSide((p) => host(p)).catch(() => null);
    /* ILM 策略预查：源带 index.lifecycle.name 时探测目标是否存在（仅 404 判缺） */
    const missingIlmPolicies = new Set<string>();
    const ilmName = typeof settings['index.lifecycle.name'] === 'string' ? settings['index.lifecycle.name'].trim() : '';
    if (ilmName && targetCaps) {
      try { await host('/_ilm/policy/' + enc(ilmName)); }
      catch (e: any) {
        if (Number(e?.status) === 404 || /404|not_?found/i.test(String(e?.message || ''))) missingIlmPolicies.add(ilmName);
      }
    }
    applyCompatMatrix({
      settings, analysis, props,
      targetPlugins: targetCaps?.plugins ?? null,
      dataNodeCount: targetCaps?.dataNodeCount ?? null,
      missingIlmPolicies,
      targetVendor: targetCaps?.vendor?.id ?? null,
      targetVersion: targetCaps?.version ?? null,
    });
    const nested = syncNestSettings(settings, analysis);
    putBody = { ...(nested ? { settings: nested } : {}), mappings: { properties: props } };
  } catch { /* 矩阵/探测失败：降级为原样建索引（不阻断） */ }
  try {
    await host('/' + enc(req.destIndex), 'PUT', JSON.stringify(putBody));
  } catch (e: any) {
    if (req.destCreateMode === 'COPY_FROM_SOURCE' && /resource_already_exists/.test(String(e?.message))) return;
    throw e;
  }
}

/* 解析并行路数：非正数/缺省回退 1，浏览器上限 MAX_SLICES（超出静默压到上限） */
function sliceCount(v: any): number {
  const n = Math.floor(Number(v));
  if (!(n > 0)) return 1;
  return Math.min(n, MAX_SLICES);
}

/* 搬运主体。opts.baseline 仅续跑传入：历史 migrated/conflicts/errors 作为基线，
 * 本次重扫的计数在其上累加（重扫靠 create 409 跳过已写文档，无法按文档去重，
 * 只能整体基线 + 本次增量合成全局口径）。opts.startMessage 覆盖默认启动提示。 */
async function runJob(job: any, req: any, conn: any, opts?: { baseline?: { migrated: number; conflicts: number; errors: number }; startMessage?: string }): Promise<void> {
  const host = hostCall!;
  activeJobs.add(job.jobId);
  const batch = Math.max(50, Math.min(5000, Number(req.batchSize || BATCH_DEFAULT)));
  const slices = sliceCount(req.slices);
  job.slices = slices;
  job.status = 'RUNNING'; job.message = opts?.startMessage || '准备迁移'; putJob(job);
  const baseline = opts?.baseline;
  let migrated = baseline?.migrated || 0, conflicts = baseline?.conflicts || 0, errors = baseline?.errors || 0;
  let scanTotal: number | null = null; /* 各 slice 首页 hits.total 之和（sliced scroll 下每路只报自己那份） */
  let failed = false; /* 任一 slice 抛错后其余 slice 尽快收手，最终由该错误定 FAILED 终态 */
  let lastLedgerWrite = 0;
  /* 限速窗口（作业级，各 slice 共享）：窗口满睡到窗尾再发下一批 */
  let throttleWindowStart = 0;
  let throttleWindowSent = 0;
  const persistJob = (force = false): void => {
    const now = Date.now();
    if (force || now - lastLedgerWrite >= LEDGER_WRITE_INTERVAL_MS) { lastLedgerWrite = now; putJob(job); }
  };

  const runSlice = async (sliceId: number): Promise<'done' | 'aborted'> => {
    let scrollId = '';
    pushEvent(job, 'SLICE', 'slice ' + sliceId + ' 开始扫描（批 ' + batch + ' 条）');
    try {
      for (;;) {
        if (stopFlags.has(job.jobId)) return 'aborted';
        if (failed) return 'done';
        const page = scrollId
          ? await sourceCall(conn, '/_search/scroll', 'POST', JSON.stringify({ scroll: '1m', scroll_id: scrollId }))
          : await sourceCall(conn, '/' + enc(req.sourceIndex) + '/_search?scroll=1m', 'POST', JSON.stringify({
              size: batch, sort: ['_doc'], track_total_hits: true,
              /* 单路时不带 slice（同服务端 SliceWorker.firstPage），行为与旧单线程版本一致 */
              ...(slices > 1 ? { slice: { id: sliceId, max: slices } } : {}),
            }));
        if (!scrollId) {
          const t = page?.hits?.total?.value ?? (typeof page?.hits?.total === 'number' ? page.hits.total : null);
          if (t != null) scanTotal = (scanTotal || 0) + Number(t);
        }
        scrollId = page?._scroll_id || scrollId;
        const hits = page?.hits?.hits || [];
        if (!hits.length) break;
        const lines: string[] = [];
        for (const h of hits) {
          /* create 幂等写：目标已有同 _id 文档按 409 计 conflicts 跳过（重跑/续跑安全） */
          lines.push(JSON.stringify({ create: { _index: req.destIndex, _id: h._id } }));
          lines.push(JSON.stringify(h._source));
        }
        const r = await host('/_bulk?refresh=false', 'POST', lines.join('\n') + '\n');
        let pageConflicts = 0;
        for (const it of r?.items || []) {
          const op: any = Object.values<any>(it)[0] || {};
          if (Number(op.status) < 300) migrated++;
          else if (Number(op.status) === 409) {
            conflicts++; pageConflicts++;
            /* 冲突 _id 样本环（排障定位，容量截断；全量计数见 conflicts 字段） */
            if (op._id != null) {
              (job.conflictSamples ||= []).push(String(op._id));
              if (job.conflictSamples.length > CONFLICT_SAMPLES_MAX) job.conflictSamples.splice(0, job.conflictSamples.length - CONFLICT_SAMPLES_MAX);
            }
          } else errors++;
        }
        if (pageConflicts > 0) pushEvent(job, 'CONFLICT', '该批 ' + pageConflicts + ' 条 409 跳过（目标已存在同 _id 文档）', 'warn');
        job.migrated = migrated; job.conflicts = conflicts; job.errors = errors;
        job.total = scanTotal || job.total || migrated;
        job.message = '已迁移 ' + migrated + ' 条';
        persistJob();
        /* 批粒度限速（throttle 端点运行中可调）：每秒窗口最多 rps 条，窗口满睡到窗尾；
         * 精度以批大小为下限（batch 500 时单批即占满低 rps 窗口，表现为按批间歇） */
        const rpsLimit = THROTTLE_RPS.get(job.jobId) ?? (Number(job.throttleRps) > 0 ? Number(job.throttleRps) : 0);
        if (rpsLimit > 0) {
          const now = Date.now();
          if (now - throttleWindowStart >= 1000) { throttleWindowStart = now; throttleWindowSent = 0; }
          throttleWindowSent += hits.length;
          if (throttleWindowSent >= rpsLimit && now - throttleWindowStart < 1000) {
            await new Promise(r => setTimeout(r, 1000 - (now - throttleWindowStart)));
            throttleWindowStart = 0;
            throttleWindowSent = 0;
          }
        }
      }
      return 'done';
    } finally {
      /* 游标清理：正常扫完、中止、异常退出都尽力释放，失败忽略（scroll 到期自清） */
      try { if (scrollId) await sourceCall(conn, '/_search/scroll', 'DELETE', JSON.stringify({ scroll_id: scrollId })); } catch { /* ignore */ }
    }
  };

  try {
    await ensureDest(host, req, conn);
    const outcomes = await Promise.allSettled(Array.from({ length: slices }, (_, i) => runSlice(i)));
    /* 终态归因：任一 slice 异常 → FAILED（并行下首个错误定案）；否则任一路报告中止 →
     * ABORTED；全路扫完 → DONE */
    const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
    if (failure) {
      job.status = 'FAILED'; job.message = String(failure.reason?.message || failure.reason);
    } else if (stopFlags.has(job.jobId) || outcomes.some(o => o.status === 'fulfilled' && o.value === 'aborted')) {
      job.status = 'ABORTED'; job.message = '已中止（已搬运数据保留）';
    } else {
      job.status = 'DONE'; job.message = '迁移完成：' + migrated + ' 条';
    }
    pushEvent(job, job.status, job.message, job.status === 'DONE' ? 'info' : job.status === 'ABORTED' ? 'warn' : 'error');
    job.finishTime = Date.now(); putJob(job);
  } catch (e: any) {
    job.status = 'FAILED'; job.message = String(e?.message || e);
    pushEvent(job, 'FAILED', job.message, 'error');
    job.finishTime = Date.now(); putJob(job);
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
    slices: sliceCount(req.slices),
  };
  pushEvent(job, 'START', '迁移作业启动（源 ' + req.sourceIndex + ' → 目标 ' + req.destIndex + '，' + job.slices + ' 路 slice）');
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
    pushEvent(j, 'INTERRUPTED', j.message, 'warn');
  }
  return j;
}
export async function abort(jobId: string): Promise<any> {
  stopFlags.add(jobId);
  const j = jobs().find(x => x.jobId === jobId);
  if (j && j.status === 'RUNNING') { j.status = 'ABORTED'; j.message = '已中止（已搬运数据保留）'; putJob(j); }
  return { aborted: jobId };
}
export async function resume(host: HostCall, jobId: string, conn: any): Promise<any> {
  hostCall = host;
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  /* scroll 游标会过期、无法持久，续跑=全量重扫：create 409 跳过已写文档，
   * 历史 migrated/conflicts/errors 保留为基线，本次扫描结果在其上累加 */
  const baseline = {
    migrated: Math.max(0, Number(j.migrated) || 0),
    conflicts: Math.max(0, Number(j.conflicts) || 0),
    errors: Math.max(0, Number(j.errors) || 0),
  };
  j.status = 'RUNNING';
  const startMessage = '续跑：从已迁移 ' + baseline.migrated + ' 条基线续扫（已存在文档跳过）';
  j.message = startMessage;
  pushEvent(j, 'RESUME', startMessage);
  putJob(j);
  running = true;
  void runJob(j, { sourceIndex: j.sourceIndex, destIndex: j.destIndex, destCreateMode: 'NONE', batchSize: BATCH_DEFAULT, slices: j.slices }, conn, { baseline, startMessage });
  return { jobId };
}

/* 历史治理（对齐 adhoc 口径）：单条删除终态记录；本页活动中的作业拒绝删除（先中止再清理） */
export async function deleteJob(jobId: string): Promise<void> {
  const list = jobs();
  const j = list.find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (activeJobs.has(jobId)) throw new Error('作业进行中，不可删除记录（请先中止或等待终态）');
  saveJobs(list.filter(x => x.jobId !== jobId));
}

/* 批量清理 N 天前终态记录（finishTime 早于截点即删；进行中与无收尾时刻的记录保留） */
export async function cleanupJobs(olderThanDays: number): Promise<{ deleted: number }> {
  const days = Number(olderThanDays);
  if (!(days > 0)) throw new Error('olderThanDays 必须为正整数');
  const cut = Date.now() - days * 86400000;
  const list = jobs();
  const keep = list.filter(j => !((j.status !== 'RUNNING' || !activeJobs.has(j.jobId)) && Number(j.finishTime || 0) > 0 && Number(j.finishTime || 0) < cut));
  const deleted = list.length - keep.length;
  if (deleted > 0) saveJobs(keep);
  return { deleted };
}

/* 作业事件时间线读取（REST jobs/{id}/events）：旧台账无事件环时如实返回空集 */
export async function jobEvents(jobId: string): Promise<any> {
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  return { jobId, events: Array.isArray(j.events) ? j.events : [] };
}

/* 版本冲突 _id 样本（REST jobs/{id}/conflicts，服务端 {samples,total,truncated} 同口径） */
export async function jobConflicts(jobId: string): Promise<any> {
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  const samples: string[] = Array.isArray(j.conflictSamples) ? j.conflictSamples : [];
  const total = Number(j.conflicts) || 0;
  return { jobId, samples, total, truncated: total > samples.length };
}

/* 双侧文档数对账（REST jobs/{id}/reconcile，服务端 {sourceCount,destCount,diff} 同口径）：
 * 源连接按作业记录的 srcConnId 从本机档案取密；任一侧取数失败如实 null，不冒充 0 */
export async function jobReconcile(host: HostCall, jobId: string): Promise<any> {
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  const srcConnId = String(j.srcConnId || '').trim();
  if (!srcConnId) throw new Error('该作业未记录源连接档案，无法对账（历史手输连接的作业不支持）: ' + jobId);
  const p = profileById(srcConnId);
  if (!p) throw Object.assign(new Error('连接档案不存在: ' + srcConnId), { code: 'CONN_NOT_FOUND' });
  const conn = { url: p.url, username: p.username, password: p.password };
  let sourceCount: number | null = null;
  let destCount: number | null = null;
  try { sourceCount = Number((await sourceCall(conn, '/' + enc(j.sourceIndex) + '/_count', 'POST', '{"query":{"match_all":{}}}'))?.count) || null; }
  catch { /* 源侧取数失败置 null（预检「尽力而为」契约同款） */ }
  try { destCount = Number((await host('/' + enc(j.destIndex) + '/_count', 'POST', '{"query":{"match_all":{}}}'))?.count) || null; }
  catch { /* 目标侧取数失败置 null */ }
  return {
    sourceIndex: j.sourceIndex, destIndex: j.destIndex,
    sourceCount, destCount,
    diff: sourceCount != null && destCount != null ? sourceCount - destCount : null,
  };
}

/* ================= 结构同步·兼容性自适应（sync-structure） =================
 * 跨集群同步索引结构：源（常见为阿里云 ES）settings/mapping 推到目标（宿主）索引。
 * 双层剔除：planned 为兼容矩阵（COMPAT_MATRIX）预剔除——按双侧能力探测（版本/
 * 发行版/厂商/插件/节点规模）在 PUT 之前预判不兼容项；reactive 为目标 400 报错
 * 兜底剔除，≤20 轮收敛；字段保留、仅降级其分析属性。dryRun=true 只出计划不写
 * 目标（不 PUT、不进确认门）；syncAliases=true 建成后别名随迁。
 * 与服务端 sync-structure 同口径（含不覆盖既有索引：resource_already_exists 直接报错）。 */

const SYNC_MAX_ROUNDS = 20;
/* 别名定义里随迁时原样保留的元数据键（与服务端 ALIAS_META_KEYS 同表）：filter/路由。
 * _alias 响应里带这些键的别名，随迁 add 里逐键透传，不静默丢失 */
const ALIAS_META_KEYS = ['filter', 'index_routing', 'search_routing', 'routing'];
/* ES 生成/内部键，跨集群复刻必剔（flat_settings 形态的完整键名） */
const SYNC_VOLATILE_SETTINGS = ['index.uuid', 'index.creation_date', 'index.provided_name', 'index.version.created', 'index.version.upgraded'];
/* 字段级可降级的分析属性：值是 analysis 组件名（analyzer/normalizer 族） */
const SYNC_FIELD_ANALYSIS_ATTRS = ['analyzer', 'search_analyzer', 'normalizer'];

/* ---------------- 集群能力探测（probe_capabilities） ----------------
 * GET /（版本/发行版）→ _nodes/plugins（插件并集）→ _cluster/health（节点规模），
 * 据此推断厂商（阿里云/腾讯云/AWS/Elastic/开源自建），为兼容矩阵预剔除提供依据。
 * GET / 失败直接抛错（探测不通）；插件清单/健康取不到降级为空/null（受限账号常见）。 */
export const VENDOR_LABELS: Record<string, string> = {
  aliyun: '阿里云 ES', tencent: '腾讯云 ES', aws: 'AWS ES',
  elastic: 'Elastic Cloud', oss: '开源自建', unknown: '未知',
};
/* 厂商特征关键字（插件名按 token 边界命中或 distribution 子串命中即视为该厂商证据，按序优先判定）。
 * aws 证据只用 com.amazonaws/cloud-aws/repository-s3——宽泛的 amazon/aws 子串会把
 * mapper-forensicsaws 这类无关插件误判成 AWS（口径对齐服务端 pluginKeywordHit）。 */
const VENDOR_EVIDENCE_KEYWORDS: Array<{ id: string; keywords: string[] }> = [
  { id: 'aliyun', keywords: ['aliyun', 'apack', 'aliws'] },
  { id: 'tencent', keywords: ['tencent', 'qcloud', 'tc-'] },
  { id: 'aws', keywords: ['com.amazonaws', 'cloud-aws', 'repository-s3'] },
  { id: 'elastic', keywords: ['elastic-cloud', 'ece'] },
];
/* 插件 id 分词：非字母数字边界切开（mapper-forensicsaws → [mapper, forensicsaws]）；
 * keyword 同样分词后按连续 token 序列匹配，避免子串误命中 */
function vendorTokens(s: string): string[] {
  return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function pluginKeywordHit(pluginTokens: string[], keyword: string): boolean {
  const kw = vendorTokens(keyword);
  if (!kw.length || kw.length > pluginTokens.length) return false;
  outer: for (let i = 0; i + kw.length <= pluginTokens.length; i++) {
    for (let j = 0; j < kw.length; j++) {
      if (pluginTokens[i + j] !== kw[j]) continue outer;
    }
    return true;
  }
  return false;
}
export function inferVendor(plugins: string[], distribution: string | null): { id: string; label: string; evidence: string[] } {
  const evidence: string[] = [];
  const dist = String(distribution || '').toLowerCase();
  const collect = (kw: string): boolean => {
    let hit = false;
    for (const p of plugins) {
      const id = String(p).toLowerCase();
      if (pluginKeywordHit(vendorTokens(id), kw)) { evidence.push('plugin:' + id); hit = true; }
    }
    if (dist && dist.includes(kw)) { evidence.push('distribution:' + dist); hit = true; }
    return hit;
  };
  for (const vendor of VENDOR_EVIDENCE_KEYWORDS) {
    if (vendor.keywords.some(kw => collect(kw))) {
      return { id: vendor.id, label: VENDOR_LABELS[vendor.id], evidence: [...new Set(evidence)] };
    }
  }
  /* 无云特征且发行版为 default → 开源自建；其余（含读不到发行版）为未知。
   * evidence 一律记小写化值（口径对齐服务端 matchVendor 的记法） */
  if (dist === 'default') return { id: 'oss', label: VENDOR_LABELS.oss, evidence: ['distribution:default'] };
  return { id: 'unknown', label: VENDOR_LABELS.unknown, evidence: [...new Set(evidence)] };
}

/* 单侧能力探测：call 为 GET 通道（源侧 sourceCall / 目标侧宿主 host），返回探测报告。
 * GET / 失败直接抛错（探测不通）；插件清单读取失败置 null（未知，与「真没插件」的
 * 空集区分——未知时兼容矩阵跳过 plugin-analysis，避免受限账号被误删分析组件）。 */
export async function probeSide(call: (path: string) => Promise<any>): Promise<any> {
  const root = await call('/');
  const version = root?.version?.number ? String(root.version.number) : null;
  /* 发行版只认 version.distribution（不回退 build_flavor；缺失即 null → 厂商判 unknown） */
  const distribution = root?.version?.distribution || null;
  let plugins: string[] | null = null;
  let pluginsReliable = false;
  try {
    const nodes = (await call('/_nodes/plugins'))?.nodes || {};
    const set = new Set<string>();
    for (const n of Object.values<any>(nodes)) for (const p of n?.plugins || []) if (p?.name) set.add(String(p.name));
    plugins = [...set].sort();
    pluginsReliable = true;
  } catch { /* 插件清单读不到保持 null（未知，pluginsReliable=false），厂商推断退化为 distribution 证据 */ }
  let nodeCount: number | null = null;
  let dataNodeCount: number | null = null;
  try {
    const h = await call('/_cluster/health');
    nodeCount = Number(h?.number_of_nodes) || null;
    dataNodeCount = Number(h?.number_of_data_nodes) || null;
  } catch { /* 节点规模取不到如实 null */ }
  const vendor = inferVendor(plugins || [], distribution);
  return {
    clusterName: root?.cluster_name ?? root?.name ?? null,
    version, distribution, vendor, plugins, pluginsReliable, nodeCount, dataNodeCount,
    managed: ['aliyun', 'tencent', 'aws', 'elastic'].includes(vendor.id),
  };
}

/* 索引画像（probe_capabilities 带 index 时附加，字段名对齐服务端 indexProfile）：
 * sourceAliases/sourceBytes/srcShards/srcDocCount/fieldTypeCounts，各子项失败逐项
 * 置空/null 不整体抛出（探测尽力而为契约，同 preflight 取数路径） */
async function indexProfile(call: (path: string) => Promise<any>, index: string): Promise<any> {
  const out: any = { sourceAliases: [], sourceBytes: null, srcShards: null, srcDocCount: null, fieldTypeCounts: {} };
  try {
    const aliasRaw = await call('/' + enc(index) + '/_alias');
    out.sourceAliases = Object.keys(Object.values<any>(aliasRaw || {})[0]?.aliases || {});
  } catch { /* 别名清单读不到按空集 */ }
  try {
    const stats = await call('/' + enc(index) + '/_stats/store');
    out.sourceBytes = Number(Object.values<any>(stats?.indices || {})[0]?.primaries?.store?.size_in_bytes) || null;
  } catch { /* 存储字节量读不到如实 null */ }
  try {
    const rows: any[] = await call('/_cat/indices?format=json&h=index,pri,docs.count');
    const row = (rows || []).find((r: any) => String(r.index) === index);
    out.srcShards = numOrNull(row?.pri);
    out.srcDocCount = numOrNull(row?.['docs.count']);
  } catch { /* 分片/文档数读不到如实 null */ }
  try {
    const mapRaw = await call('/' + enc(index) + '/_mapping');
    const counts: Record<string, number> = {};
    const walk = (bucket: any): void => {
      for (const def of Object.values<any>(bucket || {})) {
        if (!def || typeof def !== 'object') continue;
        const t = def.type || (def.properties ? 'object' : null);
        if (t) counts[t] = (counts[t] || 0) + 1;
        if (def.properties) walk(def.properties);
        if (def.fields) walk(def.fields);
      }
    };
    walk(propsOf(Object.values<any>(mapRaw || {})[0]?.mappings || {}));
    out.fieldTypeCounts = counts;
  } catch { /* mapping 读不到按空计数 */ }
  return out;
}

/** 探测一个连接的集群能力：connection 原样回显，call 为该连接的 GET 通道；
 * index 给出时附索引画像（别名/字节量/分片/文档数/字段类型计数，字段名对齐服务端 indexProfile）。 */
export async function probeCapabilities(call: (path: string) => Promise<any>, connection: string, index?: string): Promise<any> {
  const idx = String(index || '').trim();
  return { connection, ...(await probeSide(call)), ...(idx ? await indexProfile(call, idx) : {}) };
}

/* ---------------- 兼容矩阵（COMPAT_MATRIX） ----------------
 * 结构同步 PUT 前的预剔除规则表（规则 id 与 reason 文案和服务端逐字一致）：
 * 五条剔除规则产出 planned 清单，shards/replicas/store 三条只产 advice（不剔除）。 */
export const COMPAT_MATRIX: Array<{ id: string; kind: 'setting' | 'analysis' | 'advice'; note: string }> = [
  { id: 'apack-private', kind: 'setting', note: '阿里云 apack 私有设置，跨环境不可迁移' },
  { id: 'vendor-private', kind: 'setting', note: '跨厂商私有设置（aliyun/tencent/aws 前缀表），目标厂商不同即剔除' },
  { id: 'ttl-legacy', kind: 'setting', note: '已废弃的 TTL 设置' },
  { id: 'routing-attrs', kind: 'setting', note: '节点属性路由依赖源集群节点标签，跨集群无法匹配，将导致分片不分配' },
  { id: 'plugin-analysis', kind: 'analysis', note: '目标集群缺少插件时分析组件不可用' },
  { id: 'ilm-missing', kind: 'setting', note: '目标集群不存在 ILM 策略' },
  { id: 'shards-advise', kind: 'advice', note: '源分片数超过目标数据节点数 3 倍时建议收敛' },
  { id: 'auto-replicas', kind: 'advice', note: 'auto_expand_replicas 跨集群可能失控，建议显式副本数' },
  { id: 'store-advise', kind: 'advice', note: 'niofs/simplefs 显式存储类型建议移除' },
  /* 智能同步批新增两条剔除规则（id/reason 文案与服务端逐字一致，不动既有规则） */
  { id: 'version-floor', kind: 'setting', note: '目标版本低于设置最低引入版本时剔除（地板表）' },
  { id: 'store-type-vendor', kind: 'setting', note: '阿里云特有 store 类型（hybridfs）跨厂商剔除；目标厂商未知不剔、记建议' },
];
/* 厂商私有设置前缀表（键归属模型）：键命中归属厂商 owner 的前缀、目标厂商已知且 ≠owner
 * 即剔除（reason=`vendor private setting (${owner}) not supported by target vendor ${target}`，
 * 不要求源厂商=owner）；目标厂商未知时不剔、记 warning 留给目标报错兜底 */
const VENDOR_PRIVATE_PREFIXES: Array<{ vendor: string; prefixes: string[] }> = [
  { vendor: 'aliyun', prefixes: ['index.apack.', 'index.aliyun.'] },
  { vendor: 'tencent', prefixes: ['index.tencent.', 'index.qcloud.'] },
  { vendor: 'aws', prefixes: ['index.cloud_aws.'] },
];
/* settings 键归属的厂商：命中私有前缀表返回归属厂商 id，否则 null */
function vendorPrivateOwner(key: string): string | null {
  for (const v of VENDOR_PRIVATE_PREFIXES) {
    if (v.prefixes.some(p => key.startsWith(p))) return v.vendor;
  }
  return null;
}
/* version-floor 地板表：设置的最低引入版本（目标版本已知且低于地板 → 剔除，
 * reason 注明地板版本；目标版本未知不剔）。SNAPSHOT 后缀按 parseInt 取前导数字段 */
const VERSION_FLOOR_SETTINGS: Record<string, string> = {
  'index.search.idle.after': '7.0.0',
  'index.hidden': '7.7.0',
  'index.final_pipeline': '7.12.0',
};
/* 语义化版本 a<b（逐段数值比较，解析失败段按 0） */
function versionLt(a: string, b: string): boolean {
  const pa = String(a).split('.').map(s => parseInt(s, 10) || 0);
  const pb = String(b).split('.').map(s => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}
/* 插件强依赖的分析组件名（目标缺对应插件则不可用） */
const COMPAT_PLUGIN_ANALYSIS_NAMES = ['ik_max_word', 'ik_smart', 'aliws', 'aliws_tokenizer', 'pinyin', 'stconvert', 'thulac', 'smartcn', 'ansj', 'hanlp'];
/* 组件名 → 必需插件名；未列出的组件按「目标插件名包含组件名」判定 */
const COMPAT_PLUGIN_REQUIRED: Record<string, string> = {
  ik_max_word: 'analysis-ik', ik_smart: 'analysis-ik',
  pinyin: 'analysis-pinyin', stconvert: 'analysis-stconvert', smartcn: 'analysis-smartcn',
};

/* 插件是否覆盖矩阵已知具名分析组件（与目标插件覆盖判定反向同口径）：能力对比时用于
 * 判定缺失插件可被 sync_structure 自动剔除/降级，据此对 action 分档建议 */
export function coversKnownComponent(pluginId: string): boolean {
  const p = String(pluginId).toLowerCase();
  return COMPAT_PLUGIN_ANALYSIS_NAMES.some(c => {
    const fixed = COMPAT_PLUGIN_REQUIRED[c];
    return fixed != null ? p === fixed : p.includes(c);
  });
}

/* 字段级引用降级共用路径（planned 与 reactive 同一实现）：properties 中分析属性值
 * 命中 names 的字段改写为 fallback（normalizer 恒剔除；无 fallback 剔除属性），
 * 字段本体保留，逐条记入 downgraded；返回降级条数 */
function downgradeRefsByNames(
  props: Record<string, any>, names: string[], fallback: string | undefined,
  downgraded: any[], reasonOf: (from: string, to: string | null) => string,
  rule?: string,
): number {
  let n = 0;
  const walk = (bucket: Record<string, any>, prefix: string): void => {
    for (const [field, def] of Object.entries<any>(bucket || {})) {
      if (!def || typeof def !== 'object') continue;
      const path = prefix ? prefix + '.' + field : field;
      for (const attr of SYNC_FIELD_ANALYSIS_ATTRS) {
        if (!names.includes(def[attr])) continue;
        const from = def[attr];
        const to = fallback && attr !== 'normalizer' ? fallback : null;
        if (to) def[attr] = to; else delete def[attr];
        downgraded.push({ field: path, attr, from, to, reason: reasonOf(from, to), ...(rule ? { rule } : {}) });
        n++;
      }
      if (def.properties) walk(def.properties, path);
      if (def.fields) walk(def.fields, path);
    }
  };
  walk(props, '');
  return n;
}

/* 节点属性路由的四个子域前缀（include/exclude/require/initial_recovery 之外的
 * index.routing.allocation.* 键——如 total_shards_per_node——是跨集群仍生效的
 * 分配设置，不剔；属性名末段以 _ 开头的系统属性目标集群自解释，也不剔） */
const ROUTING_SUBDOMAINS = [
  'index.routing.allocation.include.', 'index.routing.allocation.exclude.',
  'index.routing.allocation.require.', 'index.routing.allocation.initial_recovery.',
];

/* 兼容矩阵应用：按规则预剔除 settings/analysis 中的不兼容项并级联降级引用字段
 * （直接 mutate 传入对象，PUT 前生效）；targetPlugins=null 表示目标插件未知，
 * 跳过 plugin-analysis（避免探测失败误删），dataNodeCount=null 同理不出分片建议；
 * fallback 缺省 standard（ES 全版本内置）。字段降级 reason：目标厂商已知用英文模板
 * `target vendor X lacks plugin Y; analyzer Z -> <fallback>`，未知退中文缺失文案；
 * 源/目标厂商均已知且不同（跨厂商）且实际发生剔除/降级时逐插件出 plugin_install 建议。 */
export function applyCompatMatrix(ctx: {
  settings: Record<string, any>;
  analysis: Record<string, any> | null;
  props: Record<string, any>;
  targetPlugins: string[] | null;
  dataNodeCount: number | null;
  missingIlmPolicies: Set<string>;
  fallback?: string;
  sourceVendor?: string | null;
  targetVendor?: string | null;
  targetVersion?: string | null;
  /** withRules=true 时清单条目附 rule（矩阵规则 id）溯源——smart_sync 路径专用；
   * 缺省 false 保持 sync_structure 旧路径返回结构不变 */
  withRules?: boolean;
}): { removedSettings: any[]; removedAnalysis: any[]; downgradedFields: any[]; advice: any[]; warnings: string[] } {
  const removedSettings: any[] = [];
  const removedAnalysis: any[] = [];
  const rawDowngraded: any[] = [];
  const advice: any[] = [];
  const warnings: string[] = [];
  const { settings, analysis, props, targetPlugins, dataNodeCount, missingIlmPolicies,
    sourceVendor = null, targetVendor = null, targetVersion = null } = ctx;
  const withRules = ctx.withRules === true;
  const fallback = ctx.fallback != null && String(ctx.fallback).trim() !== ''
    ? String(ctx.fallback).trim() : 'standard';
  const crossVendor = !!sourceVendor && sourceVendor !== 'unknown'
    && !!targetVendor && targetVendor !== 'unknown' && targetVendor !== sourceVendor;
  const targetVendorKnown = !!targetVendor && targetVendor !== 'unknown';
  /* vendor-private / apack-private / ttl-legacy / routing-attrs / version-floor /
   * store-type-vendor：按键名前缀（或地板表/键值特征）整段预剔除
   * （vendor-private 按键归属先判，命中即不再走 apack 文案——一键一 reason；目标厂商
   * 未知时 vendor-private 跳过、未被其他规则剔除的键记 warning；routing 只匹配四子域前缀；
   * version-floor 目标版本未知不剔；store-type-vendor 仅 hybridfs 且目标厂商已知≠aliyun 剔） */
  for (const key of Object.keys(settings)) {
    let reason: string | null = null;
    let rule: string | null = null;
    const owner = vendorPrivateOwner(key);
    if (owner && targetVendorKnown && owner !== targetVendor) {
      reason = `vendor private setting (${owner}) not supported by target vendor ${targetVendor}`;
      rule = 'vendor-private';
    } else if (key.startsWith('index.apack.')) {
      reason = '阿里云 apack 私有设置，跨环境不可迁移';
      rule = 'apack-private';
    } else if (key.startsWith('index.ttl')) {
      reason = '已废弃的 TTL 设置';
      rule = 'ttl-legacy';
    } else {
      const prefix = ROUTING_SUBDOMAINS.find(p => key.startsWith(p));
      if (prefix) {
        const attr = key.slice(prefix.length);
        const lastDot = attr.lastIndexOf('.');
        const lastSegment = lastDot >= 0 ? attr.slice(lastDot + 1) : attr;
        /* 属性名末段以 _ 开头（如 _name/_ip/_tier_preference）是 ES 内建属性，目标自解释，不剔 */
        if (!lastSegment.startsWith('_')) {
          reason = '节点属性路由依赖源集群节点标签，跨集群无法匹配，将导致分片不分配';
          rule = 'routing-attrs';
        }
      } else if (targetVersion && Object.prototype.hasOwnProperty.call(VERSION_FLOOR_SETTINGS, key)
        && versionLt(targetVersion, VERSION_FLOOR_SETTINGS[key])) {
        reason = `目标 ${targetVersion} 低于该设置最低版本 ${VERSION_FLOOR_SETTINGS[key]}`;
        rule = 'version-floor';
      } else if (key === 'index.store.type' && String(settings[key]) === 'hybridfs'
        && targetVendorKnown && targetVendor !== 'aliyun') {
        reason = `hybridfs 为阿里云特有 store 类型，目标为 ${targetVendor}`;
        rule = 'store-type-vendor';
      }
    }
    if (reason) {
      delete settings[key];
      removedSettings.push({ key, reason, ...(ctx.withRules && rule ? { rule } : {}) });
    }
    else if (owner) warnings.push(`目标厂商未知，厂商私有设置 ${key} 暂不预剔除（留给目标报错兜底）`);
  }
  /* plugin-analysis：目标缺插件的分析组件剔除，三步级联（口径对齐服务端 applyPluginAnalysisRule）——
   * ① 定义本体 type 命中缺失组件：删定义并级联剔除引用该定义的自定义 analyzer、字段引用降级；
   * ② 自定义 analyzer 直接引用缺失组件名（tokenizer 等值 / filter、char_filter 列表项）；
   * ③ 字段直接引用缺失组件名（组件无定义也降级，如 analyzer:ik_smart）与被剔 analyzer 名。
   * 触发过剔除/降级的插件记入 touched（按插件去重，首个组件代表），供跨厂商 plugin_install 建议 */
  if (targetPlugins) {
    const lowerPlugins = targetPlugins.map(p => String(p).toLowerCase());
    const hasPlugin = (component: string): boolean => {
      const required = COMPAT_PLUGIN_REQUIRED[component];
      return required != null
        ? lowerPlugins.includes(required.toLowerCase())
        : lowerPlugins.some(p => p.includes(component));
    };
    const pluginMissingReason = (component: string): string => {
      const pluginLabel = COMPAT_PLUGIN_REQUIRED[component] || component;
      return `目标集群缺少插件 ${pluginLabel}，组件 ${component} 不可用`;
    };
    /* 字段降级条目 reason：目标厂商已知用英文模板（对齐服务端 pluginFieldReason），未知退中文 */
    const pluginFieldReason = (component: string): string => {
      if (!targetVendorKnown) return pluginMissingReason(component);
      return `target vendor ${targetVendor} lacks plugin ${COMPAT_PLUGIN_REQUIRED[component] || component}; analyzer ${component} -> ${fallback}`;
    };
    const requiredPlugin = (component: string): string => COMPAT_PLUGIN_REQUIRED[component] || component;
    const touchedPlugins = new Map<string, string>();
    const markTouched = (component: string): void => {
      const plugin = requiredPlugin(component);
      if (!touchedPlugins.has(plugin)) touchedPlugins.set(plugin, component);
    };
    const missing = COMPAT_PLUGIN_ANALYSIS_NAMES.filter(n => !hasPlugin(n));
    if (missing.length) {
      for (const kind of ['analyzer', 'tokenizer', 'filter', 'char_filter', 'normalizer']) {
        const defs = analysis?.[kind];
        if (!defs) continue;
        for (const name of Object.keys(defs)) {
          const hit = missing.find(n => n === defs[name]?.type);
          if (!hit) continue;
          delete defs[name];
          const reason = pluginMissingReason(hit);
          removedAnalysis.push({ kind, name, reason, ...(withRules ? { rule: 'plugin-analysis' } : {}) });
          markTouched(hit);
          /* 级联：引用被剔定义的自定义 analyzer 在目标不可构建，一并剔（tokenizer 等值 /
           * filter、char_filter 列表包含），被剔 analyzer 名一并进字段降级集合 */
          const removedNames = [name];
          if (kind !== 'analyzer' && analysis?.analyzer) {
            for (const aName of Object.keys(analysis.analyzer)) {
              const aDef: any = analysis.analyzer[aName];
              if (!aDef || typeof aDef !== 'object') continue;
              const ref = aDef.tokenizer === name && kind === 'tokenizer'
                || ['filter', 'char_filter'].includes(kind) && Array.isArray(aDef[kind]) && aDef[kind].includes(name);
              if (!ref) continue;
              delete analysis.analyzer[aName];
              removedAnalysis.push({ kind: 'analyzer', name: aName, reason: `analyzer 引用了目标不可用的 ${kind} [${name}]: ${reason}`, ...(withRules ? { rule: 'plugin-analysis' } : {}) });
              removedNames.push(aName);
            }
          }
          downgradeRefsByNames(props, removedNames, fallback, rawDowngraded, () => pluginFieldReason(hit), withRules ? 'plugin-analysis' : undefined);
        }
      }
      /* ② 自定义 analyzer 的引用值直接命中缺失组件名（定义名与组件名不同时 ① 覆盖不到） */
      const cascadedReasons: Array<[string, string]> = [];
      if (analysis?.analyzer) {
        for (const name of Object.keys(analysis.analyzer)) {
          const def: any = analysis.analyzer[name];
          if (!def || typeof def !== 'object') continue;
          let component: string | null = typeof def.tokenizer === 'string' && missing.includes(def.tokenizer) ? def.tokenizer : null;
          if (!component) {
            for (const listKind of ['filter', 'char_filter']) {
              const list = def[listKind];
              if (!Array.isArray(list)) continue;
              component = list.find((item: any) => typeof item === 'string' && missing.includes(item)) || null;
              if (component) break;
            }
          }
          if (!component) continue;
          delete analysis.analyzer[name];
          const reason = `analyzer 引用了目标不可用的组件 ${component}: ${pluginMissingReason(component)}`;
          cascadedReasons.push([name, component]);
          removedAnalysis.push({ kind: 'analyzer', name, reason, ...(withRules ? { rule: 'plugin-analysis' } : {}) });
          markTouched(component);
        }
      }
      /* ③ 字段直接引用缺失组件名（无定义也降级）与被剔 analyzer 名：逐个降级 */
      for (const component of missing) {
        if (downgradeRefsByNames(props, [component], fallback, rawDowngraded, () => pluginFieldReason(component), withRules ? 'plugin-analysis' : undefined) > 0) {
          markTouched(component);
        }
      }
      for (const [name, component] of cascadedReasons) {
        if (downgradeRefsByNames(props, [name], fallback, rawDowngraded, () => pluginFieldReason(component), withRules ? 'plugin-analysis' : undefined) > 0) {
          markTouched(component);
        }
      }
      /* 跨厂商且实际发生剔除/降级：逐插件建议目标装插件或接受 standard 回退（文案对齐服务端） */
      if (crossVendor) {
        for (const [plugin, component] of touchedPlugins) {
          advice.push({
            kind: 'plugin_install', key: plugin, component,
            message: `target vendor ${targetVendor} lacks plugin ${plugin}; install it on target or accept standard fallback`,
          });
        }
      }
    }
  }
  /* ilm-missing：目标不存在的 ILM 策略整键剔除 */
  const ilmName = typeof settings['index.lifecycle.name'] === 'string' ? settings['index.lifecycle.name'].trim() : '';
  if (ilmName && missingIlmPolicies.has(ilmName)) {
    delete settings['index.lifecycle.name'];
    removedSettings.push({ key: 'index.lifecycle.name', reason: `目标集群不存在 ILM 策略 ${ilmName}`, ...(withRules ? { rule: 'ilm-missing' } : {}) });
  }
  /* shards-advise：源分片数 > 3×目标数据节点数 */
  const shards = Number(settings['index.number_of_shards']);
  if (shards > 0 && dataNodeCount != null && dataNodeCount > 0 && shards > 3 * dataNodeCount) {
    advice.push({ kind: 'shards', key: 'index.number_of_shards', message: `目标数据节点 ${dataNodeCount} 个，源分片 ${shards} 片过碎，建议 ≤ ${3 * dataNodeCount}` });
  }
  /* auto-replicas：显式副本数建议 */
  if (Object.prototype.hasOwnProperty.call(settings, 'index.auto_expand_replicas')) {
    advice.push({ kind: 'replicas', key: 'index.auto_expand_replicas', message: 'auto_expand_replicas 跨集群可能失控（如 0-all），建议显式副本数' });
  }
  /* store-advise：niofs/simplefs 建议回落目标默认存储；hybridfs 在目标厂商未知时
   * 不剔（store-type-vendor 的 unknown 分支），改记建议留给目标报错兜底 */
  const storeType = String(settings['index.store.type'] || '');
  if (storeType === 'niofs' || storeType === 'simplefs') {
    advice.push({ kind: 'store', key: 'index.store.type', message: '目标默认存储类型更稳妥，建议移除显式 store.type' });
  } else if (storeType === 'hybridfs' && !targetVendorKnown) {
    advice.push({ kind: 'store', key: 'index.store.type', message: 'hybridfs 为阿里云特有 store 类型，目标厂商未知，建议人工确认目标集群是否支持' });
  }
  /* planned 的降级清单不带 attr（与服务端报告 v2 形态一致）；withRules 时附 rule 溯源 */
  return {
    removedSettings, removedAnalysis,
    downgradedFields: rawDowngraded.map(({ field, from, to, reason, rule }) => ({ field, from, to, reason, ...(withRules && rule ? { rule } : {}) })),
    advice, warnings,
  };
}

/* 源连接解析：显式 conn（host/url 在场）优先；否则按 srcConnId 从本机档案库取
 * （口径同 fetch-config 的档案解析：档案不存在报 404 CONN_NOT_FOUND，不静默回落） */
function syncSourceConn(req: any): any {
  if (req?.conn && (req.conn.url || String(req.conn.host || '').trim())) return req.conn;
  const id = String(req?.srcConnId || '').trim();
  if (!id) throw new Error('缺少源集群连接：请填写 conn 或 srcConnId');
  const p = profileById(id);
  if (!p) throw Object.assign(new Error('连接档案不存在: ' + id), { code: 'CONN_NOT_FOUND' });
  return { url: p.url, username: p.username, password: p.password };
}

/* flat_settings 响应里取第一个索引的 settings 平铺键值表 */
function syncFlatSettings(raw: any): Record<string, any> {
  const s = Object.values<any>(raw || {})[0]?.settings;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

/* 从平铺 settings 中摘出 analysis 段：兼容「index.analysis 嵌套对象」与
 * 「index.analysis.* 点号平铺」两种返回形态，摘出后从 settings 移除原键 */
function syncSplitAnalysis(settings: Record<string, any>): Record<string, any> | null {
  const analysis: Record<string, any> = {};
  let found = false;
  const nested = settings['index.analysis'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    Object.assign(analysis, nested);
    found = true;
    delete settings['index.analysis'];
  }
  const prefix = 'index.analysis.';
  for (const key of Object.keys(settings)) {
    if (!key.startsWith(prefix)) continue;
    found = true;
    const rest = key.slice(prefix.length);
    if (!rest) continue;
    const parts = rest.split('.');
    let cur: Record<string, any> = analysis;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = settings[key];
    delete settings[key];
  }
  return found ? analysis : null;
}

/* 平铺 settings 按点号重组为建索引用的嵌套形态（键自带 index. 前缀，重组后即 {index:{...}}，
 * analysis 剔空后并入 index.analysis）；全空返回 null，避免 PUT 空 settings 段 */
function syncNestSettings(settings: Record<string, any>, analysis: Record<string, any> | null): Record<string, any> | null {
  const root: Record<string, any> = {};
  for (const [key, value] of Object.entries(settings)) {
    const parts = key.split('.');
    let cur: Record<string, any> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  if (analysis && Object.entries(analysis).some(([, defs]) => defs && Object.keys(defs).length)) {
    (root.index ||= {}).analysis = analysis;
  }
  return Object.keys(root).length ? root : null;
}

/* 剔除目标不识别的 setting：unknown setting [key] / private index setting [key]。
 * key 分别按带/不带 index. 前缀尝试匹配；一条都没剔到返回 false（该轮无进展） */
function syncRemoveSettings(text: string, settings: Record<string, any>, removed: any[]): boolean {
  let applied = false;
  const matches = [
    ...text.matchAll(/unknown setting \[([^\]]+)\]/g),
    ...text.matchAll(/private index setting \[([^\]]+)\]/gi),
  ];
  for (const m of matches) {
    const reported = m[1];
    const key = [reported, reported.startsWith('index.') ? reported.slice('index.'.length) : 'index.' + reported]
      .find(k => Object.prototype.hasOwnProperty.call(settings, k));
    if (!key) continue;
    delete settings[key];
    removed.push({ key, reason: m[0] });
    applied = true;
  }
  return applied;
}

/* 剔除目标不识别的 analysis 组件，并把字段级引用（analyzer/search_analyzer/normalizer
 * 属性值等于该组件名）一并降级：给了 downgradedAnalyzerFallback 则回退为该分析器，
 * 否则剔除属性——字段本体保留。返回该轮是否有进展 */
function syncRemoveAnalysis(
  text: string,
  analysis: Record<string, any> | null,
  props: Record<string, any>,
  fallback: string | undefined,
  removed: any[],
  downgraded: any[],
): boolean {
  const hits: Array<{ kind: string; name: string; quote: string }> = [];
  for (const m of text.matchAll(/[Uu]nknown (tokenizer|char_filter|filter|analyzer) \[([^\]]+)\]/g)) {
    hits.push({ kind: m[1], name: m[2], quote: m[0] });
  }
  for (const m of text.matchAll(/(tokenizer|char_filter|filter|analyzer) \[([^\]]+)\] not found/g)) {
    hits.push({ kind: m[1], name: m[2], quote: m[0] });
  }
  if (!hits.length) return false;
  let applied = false;
  for (const hit of hits) {
    const defs = analysis?.[hit.kind];
    if (defs && Object.prototype.hasOwnProperty.call(defs, hit.name)) {
      delete defs[hit.name];
      removed.push({ kind: hit.kind, name: hit.name, reason: hit.quote });
      applied = true;
    }
    if (downgradeRefsByNames(props, [hit.name], fallback, downgraded, (from, to) =>
      `引用的 ${hit.kind} ${from} 在目标集群不可用，${to ? '已回退为 ' + to : '已剔除该属性'}（字段保留）`) > 0) {
      applied = true;
    }
  }
  return applied;
}

/* 归一源 mappings body：含 properties/dynamic_templates/_meta 之一则整体保留（ES7 无类型，
 * dynamic_templates/_meta/_source/dynamic 等顶层键一并透传），否则取单 type body（ES6）；
 * _all 为 ES7 已移除键剔除（口径对齐服务端）。 */
function syncMappingBody(idx: any): any {
  let body: any = {};
  const mappings = idx?.mappings;
  if (mappings && typeof mappings === 'object' && Object.keys(mappings).length) {
    if (mappings.properties || mappings.dynamic_templates || mappings._meta) body = { ...mappings };
    else body = { ...Object.values<any>(mappings)[0] };
  }
  delete body._all;
  return body;
}

/* ---------------- 计划摘要（planDigest） ----------------
 * canonical JSON：键全序排序的稳定序列化（同输入同输出）；摘要取 SHA-256 前 16 hex，
 * 浏览器 http 环境无 crypto.subtle（或摘要失败）时降级确定性简单 hash，保证稳定性。 */
function canonicalJson(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
async function planDigestOf(payload: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    try {
      const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    } catch { /* 摘要失败降级确定性 hash */ }
  }
  /* FNV-1a 两段 32bit 拼接（确定性降级，仅保证同输入同输出，无密码学意义） */
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i++) {
    h1 = Math.imul(h1 ^ payload.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + h1, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}

/* sync_structure / diff_structure / smart_sync 共用的兼容计划准备：拉源 settings(flat)/mapping →
 * 剔内部键 → 双侧能力探测 → ILM 预查 → 兼容矩阵预剔除（mutate 传入源结构）；
 * opts.withRules=true 时 planned 清单条目附矩阵规则 id 溯源（smart_sync 专用） */
async function compatPlan(host: HostCall, conn: any, sourceIndex: string, fallback?: string, opts?: { withRules?: boolean }): Promise<{
  settings: Record<string, any>;
  analysis: Record<string, any> | null;
  props: Record<string, any>;
  mappingBody: any;
  sourceCaps: any;
  targetCaps: any;
  planned: any;
  advice: any[];
  planWarnings: string[];
}> {
  const [settingsRaw, mappingRaw] = await Promise.all([
    sourceCall(conn, '/' + enc(sourceIndex) + '/_settings?flat_settings=true'),
    sourceCall(conn, '/' + enc(sourceIndex) + '/_mapping'),
  ]);
  const settings = syncFlatSettings(settingsRaw);
  for (const key of SYNC_VOLATILE_SETTINGS) delete settings[key];
  const analysis = syncSplitAnalysis(settings);
  /* 归一 mappings body 后取 properties：剔除循环只动 properties，其余顶层键原样透传 */
  const mappingBody = syncMappingBody(Object.values<any>(mappingRaw || {})[0]);
  const props = mappingBody.properties || {};
  const [sourceCaps, targetCaps] = await Promise.all([
    probeSide((p) => sourceCall(conn, p)).catch(() => null),
    probeSide((p) => host(p)).catch(() => null),
  ]);
  /* ILM 策略预查：源带 index.lifecycle.name 时探测目标是否存在（仅 404 判缺） */
  const missingIlmPolicies = new Set<string>();
  const ilmName = typeof settings['index.lifecycle.name'] === 'string' ? settings['index.lifecycle.name'].trim() : '';
  if (ilmName && targetCaps) {
    try { await host('/_ilm/policy/' + enc(ilmName)); }
    catch (e: any) {
      if (Number(e?.status) === 404 || /404|not_?found/i.test(String(e?.message || ''))) missingIlmPolicies.add(ilmName);
    }
  }
  /* 兼容矩阵预剔除（planned）：直接改写 settings/analysis/props，随后按剩余内容 PUT */
  const { advice, warnings: planWarnings, ...planned } = applyCompatMatrix({
    settings, analysis, props,
    targetPlugins: targetCaps?.plugins ?? null,
    dataNodeCount: targetCaps?.dataNodeCount ?? null,
    missingIlmPolicies, fallback,
    sourceVendor: sourceCaps?.vendor?.id ?? null,
    targetVendor: targetCaps?.vendor?.id ?? null,
    targetVersion: targetCaps?.version ?? null,
    ...(opts?.withRules ? { withRules: true } : {}),
  });
  return { settings, analysis, props, mappingBody, sourceCaps, targetCaps, planned, advice, planWarnings };
}

/* 结构同步主体 v3：v2 双层剔除（planned 预剔除 + reactive 兜底）之上，报告新增
 * planDigest（canonical {settings,mappings,aliases} 摘要）与 body（适配后 create body，
 * dryRun 与执行都返回）、destConnId（浏览器模式目标恒为当前宿主连接，回显请求值）；
 * 执行时可带 expectPlanDigest 做 plan drift 校验（不匹配直接拒绝，不 PUT）。 */
export async function syncStructure(host: HostCall, req: any): Promise<any> {
  const conn = syncSourceConn(req);
  const sourceIndex = String(req?.sourceIndex || '').trim();
  if (!sourceIndex) throw new Error('sourceIndex 不能为空');
  const destIndex = String(req?.destIndex || '').trim() || sourceIndex;
  const destConnId = req?.destConnId != null && String(req.destConnId).trim() !== '' ? String(req.destConnId) : null;
  /* 引用降级目标缺省 standard（ES 全版本内置；显式传值用传值），normalizer 恒剔除属性 */
  const fallback = String(req?.downgradedAnalyzerFallback || '').trim() || 'standard';
  const dryRun = req?.dryRun === true;
  const syncAliases = req?.syncAliases === true;
  const { settings, analysis, props, mappingBody, sourceCaps, targetCaps, planned, advice, planWarnings } =
    await compatPlan(host, conn, sourceIndex, fallback);
  const warnings: string[] = [...planWarnings];
  /* 版本对比只看 major.minor（7.10.2 vs 7.10.2-SNAPSHOT 不误报，口径对齐服务端 compareVersions） */
  if (sourceCaps && targetCaps && sourceCaps.version && targetCaps.version) {
    const sv = String(sourceCaps.version).trim().split('.');
    const tv = String(targetCaps.version).trim().split('.');
    if (sv.length >= 2 && tv.length >= 2 && (sv[0] !== tv[0] || sv[1] !== tv[1])) {
      warnings.push(`源集群版本 ${sourceCaps.version} 与目标集群版本 ${targetCaps.version} 主/次版本不一致，跨版本建索引的字段解析与默认行为可能存在差异`);
    }
  }
  if (!sourceCaps || !targetCaps) {
    warnings.push('能力探测未完成（' + [!sourceCaps && '源', !targetCaps && '目标'].filter(Boolean).join('/') + '侧不可达），依赖插件/节点清单的兼容规则按未知跳过');
  } else if (targetCaps.plugins == null) {
    warnings.push('目标插件清单读取失败，plugin-analysis 预剔除按未知跳过（PUT 报错仍会兜底剔除）');
  }
  /* 源别名清单先读（planDigest 的 aliases 输入 + 随迁计划共用）；保留完整定义（元数据随迁用）；
   * 读取失败如实告警 */
  let sourceAliases: string[] = [];
  let sourceAliasMeta: Record<string, any> = {};
  try {
    const aliasRaw = await sourceCall(conn, '/' + enc(sourceIndex) + '/_alias');
    sourceAliasMeta = Object.values<any>(aliasRaw || {})[0]?.aliases || {};
    sourceAliases = Object.keys(sourceAliasMeta);
  } catch { warnings.push('源索引别名清单读取失败，别名随迁清单为空'); }
  /* 计划 body 与 planDigest：PUT 循环每轮重建 body，此处先固化计划口径（reactive 兜底
   * 剔除属计划外收敛，不回写 planDigest） */
  const buildCreateBody = (): any => {
    const body: any = { mappings: { ...mappingBody, properties: props } };
    const nested = syncNestSettings(settings, analysis);
    if (nested) body.settings = nested;
    return body;
  };
  const planBody = buildCreateBody();
  const planDigest = await planDigestOf(canonicalJson({
    settings: planBody.settings ?? null, mappings: planBody.mappings, aliases: sourceAliases,
  }));
  /* plan drift 门：expectPlanDigest 只配 dryRun=false 执行（预览不存在计划漂移校验，带了明确拒绝）；
   * 执行时携带的期望摘要与当前计划不一致 → 拒绝（不 PUT） */
  const expectPlanDigest = String(req?.expectPlanDigest || '').trim();
  if (dryRun && expectPlanDigest) {
    throw new Error('expectPlanDigest only valid with dryRun=false');
  }
  if (!dryRun && expectPlanDigest && expectPlanDigest !== planDigest) {
    throw Object.assign(
      new Error(`计划摘要不匹配，拒绝执行：期望 ${expectPlanDigest}，实际 ${planDigest}（source structure drifted, re-run dryRun）`),
      { code: 'PLAN_DRIFT' },
    );
  }
  const reactive = { removedSettings: [] as any[], removedAnalysis: [] as any[], downgradedFields: [] as any[] };
  let rounds = 0;
  let created = false;
  let lastError: string | null = null;
  if (!dryRun) {
    while (rounds < SYNC_MAX_ROUNDS) {
      rounds++;
      const body = buildCreateBody();
      try {
        await host('/' + enc(destIndex), 'PUT', JSON.stringify(body));
        created = true;
        break;
      } catch (e: any) {
        const text = String(e?.message || e);
        if (/resource_already_exists/.test(text)) {
          throw Object.assign(new Error('目标索引已存在：本能力不覆盖既有索引'), { code: 'DEST_EXISTS' });
        }
        const settingRemoved = syncRemoveSettings(text, settings, reactive.removedSettings);
        const analysisRemoved = syncRemoveAnalysis(text, analysis, props, fallback, reactive.removedAnalysis, reactive.downgradedFields);
        if (!settingRemoved && !analysisRemoved) { lastError = text; break; }
      }
    }
    if (!created && lastError == null) lastError = `自适应剔除 ${SYNC_MAX_ROUNDS} 轮未收敛，最后一轮仍被目标拒绝`;
  }
  /* 别名随迁计划/执行（守恒：skipped+synced=源别名总数）——dryRun=true 按意图列计划：
   * syncAliases=true 计划全同步（synced=全集），false 全跳过（skipped=全集）；dryRun=false
   * 建成且勾选时逐个执行（失败进 skipped），未建成/未勾选全量记 skipped */
  const aliasesSynced: string[] = [];
  const aliasesSkipped: string[] = [];
  if (dryRun) {
    if (syncAliases) aliasesSynced.push(...sourceAliases);
    else aliasesSkipped.push(...sourceAliases);
  } else if (created && syncAliases) {
    for (const alias of sourceAliases) {
      try {
        /* 元数据随迁：源别名带 filter/路由定义时原样透传（与服务端 syncAliasesTo 同口径） */
        const add: Record<string, any> = { index: destIndex, alias };
        const def = sourceAliasMeta[alias];
        if (def && typeof def === 'object') {
          for (const meta of ALIAS_META_KEYS) {
            if (def[meta] !== undefined) add[meta] = def[meta];
          }
        }
        await host('/_aliases', 'POST', JSON.stringify({ actions: [{ add }] }));
        aliasesSynced.push(alias);
      } catch (e: any) {
        warnings.push('别名 ' + alias + ' 随迁失败：' + String(e?.message || e));
      }
    }
    aliasesSkipped.push(...sourceAliases.filter(a => !aliasesSynced.includes(a)));
  } else {
    aliasesSkipped.push(...sourceAliases);
  }
  /* 报告两侧块（口径对齐服务端 sideBlock）：vendor 只留 {id,label}，plugins 探测失败如实 null */
  const sideBlock = (index: string, caps: any): any => ({
    index,
    version: caps?.version ?? null,
    vendor: { id: caps?.vendor?.id ?? 'unknown', label: caps?.vendor?.label ?? VENDOR_LABELS.unknown },
    plugins: caps?.plugins ?? null,
  });
  return {
    created, dryRun, destIndex, destConnId, rounds, planDigest,
    /* body.aliases 按 synced 口径：dryRun=计划口径（syncAliases=true 计划随迁名单/false 空），
     * 执行=实际成功名单——body 语义内聚为「将 PUT/已 PUT 的内容」 */
    body: { settings: planBody.settings ?? {}, mappings: planBody.mappings, aliases: aliasesSynced },
    source: sideBlock(sourceIndex, sourceCaps),
    target: sideBlock(destIndex, targetCaps),
    planned, reactive,
    aliases: { skipped: aliasesSkipped, synced: aliasesSynced },
    advice, warnings,
    ...(!created && lastError ? { lastError } : {}),
  };
}

/* ---------------- 智能同步（smart_sync，es_xmigrate 第 20 个 action） ----------------
 * 一句话完成「探目标集群能力 → 源索引结构按兼容矩阵整形（剔非兼容）→ 可选落盘」：
 * apply=false（缺省）为只读预览（免写门/MRTR），apply=true 落盘建索引（需写门/MRTR，
 * 可带 expectPlanDigest 做 plan drift 校验）。autoTune=true 时源分片数超过目标数据节点数
 * 收敛为 min(src,dn)（目标数据节点不可靠则跳过并加 warning）。verdict 三态：
 * PLANNED（预览）/ APPLIED（建成）/ PLAN_DRIFT（携带的期望摘要与当前计划不一致，拒绝落盘）。 */
export async function smartSync(host: HostCall, req: any): Promise<any> {
  const conn = syncSourceConn(req);
  const sourceIndex = String(req?.sourceIndex || '').trim();
  if (!sourceIndex) throw new Error('sourceIndex 不能为空');
  /* destConnId 必填：目标/UAT 连接（"host"=宿主）；浏览器模式目标恒为当前激活连接，
   * 校验与回落由 REST 桥层完成（与 sync-structure 同款），此处只拒绝缺参 */
  const destConnId = String(req?.destConnId ?? '').trim();
  if (!destConnId) throw new Error('destConnId 不能为空（目标/UAT 连接，host=宿主集群）');
  const destIndex = String(req?.destIndex || '').trim() || sourceIndex;
  const syncAliases = req?.syncAliases === true;
  const fallback = String(req?.downgradedAnalyzerFallback || '').trim() || 'standard';
  const autoTune = req?.autoTune === true;
  const apply = req?.apply === true;
  const expectPlanDigest = String(req?.expectPlanDigest || '').trim();
  if (!apply && expectPlanDigest) {
    throw new Error('expectPlanDigest only valid with apply=true');
  }
  /* savePlan=true：把本次预览报告存为同步计划，响应回显 planId。只在预览时可用，
   * 拒绝文案与服务端相同。 */
  const savePlan = req?.savePlan === true;
  if (savePlan && apply) {
    throw Object.assign(new Error('savePlan 仅预览形态可用'), { code: 'BAD_REQUEST' });
  }
  /* 计划只记录源连接档案 id，不保存凭据，执行时再按档案取密。手输连接没有档案 id，
   * 存下的计划之后无法执行，所以预览前直接拒绝。 */
  if (savePlan && !String(req?.srcConnId || '').trim()) {
    throw Object.assign(
      new Error('保存同步计划需要已存的源连接档案（手输连接无法再次使用）：请先把源集群保存为连接档案'),
      { code: 'BAD_REQUEST' },
    );
  }
  /* 目标侧模式：create（缺省）=目标新建索引；incremental=目标已有索引、生产新增
   * 字段后补同步（PUT _mapping 合并 + 动态 settings 白名单更新 + 补别名）。 */
  const mode = String(req?.mode || '').trim().toLowerCase() || 'create';
  if (mode !== 'create' && mode !== 'incremental') {
    throw Object.assign(new Error('mode 必须为 create 或 incremental: ' + String(req?.mode ?? '')), { code: 'BAD_REQUEST' });
  }
  if (mode === 'incremental') {
    return finishSmartSync(req, await smartSyncIncremental(host, conn, req, sourceIndex, destIndex, destConnId,
      syncAliases, fallback, autoTune, apply, expectPlanDigest), savePlan);
  }
  const { settings, analysis, props, mappingBody, sourceCaps, targetCaps, planned, advice, planWarnings } =
    await compatPlan(host, conn, sourceIndex, fallback, { withRules: true });
  const warnings: string[] = [...planWarnings];
  /* 版本对比只看 major.minor（与 sync_structure 版本告警同口径） */
  if (sourceCaps && targetCaps && sourceCaps.version && targetCaps.version) {
    const sv = String(sourceCaps.version).trim().split('.');
    const tv = String(targetCaps.version).trim().split('.');
    if (sv.length >= 2 && tv.length >= 2 && (sv[0] !== tv[0] || sv[1] !== tv[1])) {
      warnings.push(`源集群版本 ${sourceCaps.version} 与目标集群版本 ${targetCaps.version} 主/次版本不一致，跨版本建索引的字段解析与默认行为可能存在差异`);
    }
  }
  if (!sourceCaps || !targetCaps) {
    warnings.push('能力探测未完成（' + [!sourceCaps && '源', !targetCaps && '目标'].filter(Boolean).join('/') + '侧不可达），依赖插件/节点清单的兼容规则按未知跳过');
  } else if (targetCaps.plugins == null) {
    warnings.push('目标插件清单读取失败，plugin-analysis 预剔除按未知跳过（PUT 报错仍会兜底剔除）');
  }
  /* autoTune：源分片数高于目标数据节点数时收敛 min(src,dn)。判据与文案与服务端逐字
   * 对齐：数据节点数 ≥1 且插件探测可信才动；不可靠跳过并如实加 warning，不凭空调 */
  const autoTuned: Array<{ key: string; from: number, to: number; reason: string }> = [];
  if (autoTune) {
    const shards = Number(settings['index.number_of_shards']);
    const dn = targetCaps?.dataNodeCount ?? null;
    const reliable = !!targetCaps?.pluginsReliable;
    if (dn == null || dn < 1 || !reliable) {
      warnings.push(`目标数据节点数不可靠（${dn == null ? '探不到' : dn + ' 个'}，插件探测${reliable ? '可信' : '失败'}），未自动收敛分片数，请人工确认 index.number_of_shards`);
    } else if (shards > 0 && shards > dn) {
      const to = Math.min(shards, dn);
      settings['index.number_of_shards'] = String(to);
      autoTuned.push({ key: 'index.number_of_shards', from: shards, to, reason: `源分片 ${shards} 片高于目标数据节点数 ${dn}，按目标数据节点数收敛为 ${to}` });
    }
  }
  /* 源别名清单（planDigest 的 aliases 输入 + 随迁计划共用），读取失败如实告警 */
  let sourceAliases: string[] = [];
  let sourceAliasMeta: Record<string, any> = {};
  try {
    const aliasRaw = await sourceCall(conn, '/' + enc(sourceIndex) + '/_alias');
    sourceAliasMeta = Object.values<any>(aliasRaw || {})[0]?.aliases || {};
    sourceAliases = Object.keys(sourceAliasMeta);
  } catch { warnings.push('源索引别名清单读取失败，别名随迁清单为空'); }
  const buildCreateBody = (): any => {
    const body: any = { mappings: { ...mappingBody, properties: props } };
    const nested = syncNestSettings(settings, analysis);
    if (nested) body.settings = nested;
    return body;
  };
  const planBody = buildCreateBody();
  const planDigest = await planDigestOf(canonicalJson({
    settings: planBody.settings ?? null, mappings: planBody.mappings, aliases: sourceAliases,
  }));
  /* 双侧能力块（视图「源/目标集群卡」消费：vendor/version/distribution/节点数/pluginsReliable） */
  const sideBlock = (index: string, caps: any, connection: string): any => ({
    index, connection,
    version: caps?.version ?? null,
    distribution: caps?.distribution ?? null,
    clusterName: caps?.clusterName ?? null,
    vendor: { id: caps?.vendor?.id ?? 'unknown', label: caps?.vendor?.label ?? VENDOR_LABELS.unknown },
    plugins: caps?.plugins ?? null,
    pluginsReliable: !!caps?.pluginsReliable,
    nodeCount: caps?.nodeCount ?? null,
    dataNodeCount: caps?.dataNodeCount ?? null,
  });
  /* apply=true 且携带期望摘要：与当前计划不一致 → 拒绝（不 PUT）。通道口径与三端
   * sync_structure v3 及服务端 smart_sync 一致——409/错误形态 PLAN_DRIFT，不出
   * 200+verdict 体（MCP 客户端按错误统一识别拒绝，不要求解析载荷） */
  if (apply && expectPlanDigest && expectPlanDigest !== planDigest) {
    throw Object.assign(
      new Error(`计划摘要不匹配，拒绝执行：期望 ${expectPlanDigest}，实际 ${planDigest}（source structure drifted, re-run smart-sync preview）`),
      { code: 'PLAN_DRIFT' },
    );
  }
  /* 落盘执行（apply=true）：双层剔除循环 + 别名随迁（与 sync_structure 同款收敛语义，
   * 不覆盖既有索引：resource_already_exists 直接报错） */
  const reactive = { removedSettings: [] as any[], removedAnalysis: [] as any[], downgradedFields: [] as any[] };
  let rounds = 0;
  let created = false;
  let lastError: string | null = null;
  const aliasesSynced: string[] = [];
  const aliasesSkipped: string[] = [];
  if (apply) {
    while (rounds < SYNC_MAX_ROUNDS) {
      rounds++;
      const body = buildCreateBody();
      try {
        await host('/' + enc(destIndex), 'PUT', JSON.stringify(body));
        created = true;
        break;
      } catch (e: any) {
        const text = String(e?.message || e);
        if (/resource_already_exists/.test(text)) {
          throw Object.assign(new Error('目标索引已存在：智能同步不覆盖既有索引'), { code: 'DEST_EXISTS' });
        }
        const settingRemoved = syncRemoveSettings(text, settings, reactive.removedSettings);
        const analysisRemoved = syncRemoveAnalysis(text, analysis, props, fallback, reactive.removedAnalysis, reactive.downgradedFields);
        if (!settingRemoved && !analysisRemoved) { lastError = text; break; }
      }
    }
    if (!created && lastError == null) lastError = `自适应剔除 ${SYNC_MAX_ROUNDS} 轮未收敛，最后一轮仍被目标拒绝`;
    /* 别名随迁（建成且勾选才执行，失败进 skipped 并告警——守恒口径同 sync_structure） */
    if (created && syncAliases) {
      for (const alias of sourceAliases) {
        try {
          const add: Record<string, any> = { index: destIndex, alias };
          const def = sourceAliasMeta[alias];
          if (def && typeof def === 'object') {
            for (const meta of ALIAS_META_KEYS) {
              if (def[meta] !== undefined) add[meta] = def[meta];
            }
          }
          await host('/_aliases', 'POST', JSON.stringify({ actions: [{ add }] }));
          aliasesSynced.push(alias);
        } catch (e: any) {
          warnings.push('别名 ' + alias + ' 随迁失败：' + String(e?.message || e));
        }
      }
      aliasesSkipped.push(...sourceAliases.filter(a => !aliasesSynced.includes(a)));
    } else {
      aliasesSkipped.push(...sourceAliases);
    }
  } else if (syncAliases) {
    aliasesSynced.push(...sourceAliases);
  } else {
    aliasesSkipped.push(...sourceAliases);
  }
  return finishSmartSync(req, {
    /* 三态与服务端同口径：apply 未落成如实 FAILED（不冒充 APPLIED），尾部 applied/lastError 如实随报告 */
    verdict: !apply ? 'PLANNED' : created ? 'APPLIED' : 'FAILED',
    mode: 'create',
    planDigest, destIndex, destConnId,
    /* body.aliases 按 synced 口径：预览=计划口径（勾选随迁=全集/未勾=空），执行=实际成功名单 */
    body: { settings: planBody.settings ?? {}, mappings: planBody.mappings, aliases: aliasesSynced },
    source: sideBlock(sourceIndex, sourceCaps, String(req?.srcConnId || '')),
    target: sideBlock(destIndex, targetCaps, destConnId),
    planned: { ...planned, advice },
    autoTuned, warnings, reactive,
    applied: apply && created,
    ...(!created && lastError ? { lastError } : {}),
  }, savePlan);
}

/* smart_sync 收尾：savePlan=true 时把预览报告存为同步计划并回显 planId；未要求保存则原样返回。 */
function finishSmartSync(req: any, report: any, savePlan: boolean): any {
  if (savePlan) report.planId = savePlanRecord(req, report).planId;
  return report;
}

/* ---------------- 智能同步增量模式（smart_sync mode=incremental） ----------------
 * 目标索引已存在时的补同步：不动既有数据与静态结构，按「mapping 增量合并 + 动态
 * settings 白名单更新 + 补别名」推进（语义与 Java StructureSyncService 的 12 参
 * smartSync 重载一致）。计划五清单（incremental 块）：addedFields 源有目标无的字段
 * （兼容矩阵照跑——新增字段引用目标缺失分析组件时按既有机制降级/剔除）；
 * skippedConflicts 双侧都有但 type/核心定义冲突的字段（PUT _mapping 无法改既有
 * 字段，只报告不修）；updatedSettings 动态白名单内的 settings 差异（update-settings
 * 可在线生效）；staticBlocked 白名单外的 settings 差异（只建议不动）；addedAliases
 * 源有目标无的别名。apply=false 纯预览零写（verdict=PLANNED）；apply=true 经
 * expectPlanDigest 漂移门后按序执行 PUT _mapping → PUT _settings → 补别名，每步
 * 结果进 executed。目标索引不存在/不可读抛 DEST_NOT_FOUND（与 diff_structure 同通道）。 */

/* 增量模式可在线更新（update-settings）的动态 settings 白名单：精确键 + 前缀键族，
 * 与 Java DYNAMIC_SETTING_KEYS / DYNAMIC_SETTING_PREFIXES 逐项一致 */
const INCREMENTAL_DYNAMIC_SETTING_KEYS = [
  'index.refresh_interval', 'index.number_of_replicas', 'index.max_result_window',
  'index.unassigned.node_left.delayed_timeout', 'index.translog.durability', 'index.search.idle.after',
];
const INCREMENTAL_DYNAMIC_SETTING_PREFIXES = ['index.merge.policy.'];
function isIncrementalDynamicSetting(key: string): boolean {
  return INCREMENTAL_DYNAMIC_SETTING_KEYS.includes(key)
    || INCREMENTAL_DYNAMIC_SETTING_PREFIXES.some(p => key.startsWith(p));
}

/* 从源 properties 树裁出仅含新增字段（目标无此路径）的子树；目标已有但新增了子字段的
 * 中间对象节点保留为仅含新子字段的骨架，供 PUT _mapping 的 merge 语义使用。 */
function buildAddedProperties(propertiesNode: any, prefix: string, dstFields: Map<string, Record<string, any>>): Record<string, any> {
  const out: Record<string, any> = {};
  if (!propertiesNode || typeof propertiesNode !== 'object') return out;
  for (const [name, raw] of Object.entries<any>(propertiesNode)) {
    if (!raw || typeof raw !== 'object') continue;
    const path = prefix ? prefix + '.' + name : name;
    if (!dstFields.has(path)) {
      out[name] = raw;
      continue;
    }
    const nested: Record<string, any> = {};
    const childProps = buildAddedProperties(raw.properties, path, dstFields);
    if (Object.keys(childProps).length) nested.properties = childProps;
    const childFields = buildAddedProperties(raw.fields, path, dstFields);
    if (Object.keys(childFields).length) nested.fields = childFields;
    if (Object.keys(nested).length) out[name] = nested;
  }
  return out;
}

async function smartSyncIncremental(
  host: HostCall, conn: any, req: any,
  sourceIndex: string, destIndex: string, destConnId: string,
  syncAliases: boolean, fallback: string, autoTune: boolean, apply: boolean, expectPlanDigest: string,
): Promise<any> {
  /* 目标既有索引读取：settings/mapping 任一失败即明确报错（404/连通性都如实上抛）；
   * 别名单独宽容读取（与 Java readIndexAliases 同口径，见下方 targetAliasRaw 段） */
  let targetSettingsRaw: any;
  let targetMappingRaw: any;
  try {
    [targetSettingsRaw, targetMappingRaw] = await Promise.all([
      host('/' + enc(destIndex) + '/_settings?flat_settings=true'),
      host('/' + enc(destIndex) + '/_mapping'),
    ]);
  } catch (e: any) {
    throw Object.assign(
      new Error('目标索引不存在或不可读 [' + destIndex + ']: ' + String(e?.message || e)),
      { code: 'DEST_NOT_FOUND' },
    );
  }
  /* 源侧兼容计划（与 create 模式同款：双侧探测 + 矩阵预剔除/降级，新增字段引用目标
     缺失组件时同样降级） */
  const { settings, analysis, props, mappingBody, sourceCaps, targetCaps, planned, advice, planWarnings } =
    await compatPlan(host, conn, sourceIndex, fallback, { withRules: true });
  const warnings: string[] = [...planWarnings];
  if (sourceCaps && targetCaps && sourceCaps.version && targetCaps.version) {
    const sv = String(sourceCaps.version).trim().split('.');
    const tv = String(targetCaps.version).trim().split('.');
    if (sv.length >= 2 && tv.length >= 2 && (sv[0] !== tv[0] || sv[1] !== tv[1])) {
      warnings.push(`源集群版本 ${sourceCaps.version} 与目标集群版本 ${targetCaps.version} 主/次版本不一致，跨版本建索引的字段解析与默认行为可能存在差异`);
    }
  }
  if (!sourceCaps || !targetCaps) {
    warnings.push('能力探测未完成（' + [!sourceCaps && '源', !targetCaps && '目标'].filter(Boolean).join('/') + '侧不可达），依赖插件/节点清单的兼容规则按未知跳过');
  } else if (targetCaps.plugins == null) {
    warnings.push('目标插件清单读取失败，plugin-analysis 预剔除按未知跳过（PUT 报错仍会兜底剔除）');
  }
  /* 分片数为静态设置：incremental 不做 autoTune 收敛，差异如实进 staticBlocked 呈报 */
  if (autoTune) {
    warnings.push('incremental 模式不自动调整分片数（index.number_of_shards 为静态设置，差异进 staticBlocked 呈报）');
  }
  /* 源别名清单（完整定义保留，补别名时元数据透传）；读取失败如实告警 */
  let sourceAliases: string[] = [];
  let sourceAliasMeta: Record<string, any> = {};
  try {
    const aliasRaw = await sourceCall(conn, '/' + enc(sourceIndex) + '/_alias');
    sourceAliasMeta = Object.values<any>(aliasRaw || {})[0]?.aliases || {};
    sourceAliases = Object.keys(sourceAliasMeta);
  } catch { warnings.push('源索引别名清单读取失败，别名随迁清单为空'); }
  /* 目标别名清单：宽容读取（与 Java readIndexAliases 同口径——失败仅进 warnings 按空处理，
   * 不影响目标索引存在性判定，别名 404 不误报 DEST_NOT_FOUND） */
  let targetAliasRaw: any = {};
  try {
    targetAliasRaw = await host('/' + enc(destIndex) + '/_alias');
  } catch (e: any) {
    warnings.push('读取目标别名失败，别名清单按空处理: ' + String(e?.message || e));
  }
  const targetAliases: Record<string, any> = Object.values<any>(targetAliasRaw || {})[0]?.aliases || {};
  const targetSettings: Record<string, any> = syncFlatSettings(targetSettingsRaw);
  for (const key of SYNC_VOLATILE_SETTINGS) delete targetSettings[key];
  /* 目标侧 analysis 摘出归一（嵌套/平铺两形态同源侧处理），供 index.analysis 差异对比 */
  const targetAnalysis = syncSplitAnalysis(targetSettings);

  /* 计划五清单：addedFields / skippedConflicts（字段语义属性对比，与 diff_structure
     同一套属性表）；updatedSettings / staticBlocked（动态白名单分流）；addedAliases */
  const srcFields = new Map<string, Record<string, any>>();
  collectFieldSemantics(props, '', srcFields);
  const dstFields = new Map<string, Record<string, any>>();
  collectFieldSemantics(propsOf(syncMappingBody(Object.values<any>(targetMappingRaw || {})[0])), '', dstFields);
  const addedFields: Array<{ field: string; type: any }> = [];
  const skippedConflicts: Array<{ field: string; sourceType: any; targetType: any; detail: string }> = [];
  for (const path of [...srcFields.keys()].sort()) {
    const s = srcFields.get(path)!;
    const d = dstFields.get(path);
    if (d == null) {
      addedFields.push({ field: path, type: s.type ?? null });
    } else if (!sameFieldSemantics(s, d)) {
      skippedConflicts.push({ field: path, sourceType: s.type ?? null, targetType: d.type ?? null, detail: fieldSemanticDetail(s, d) });
    }
  }
  const updatedSettings: Array<{ key: string; sourceValue: any; targetValue: any }> = [];
  const staticBlocked: Array<{ key: string; sourceValue: any; targetValue: any; reason: string }> = [];
  const settingsIncrement: Record<string, any> = {};
  /* 源 analysis（矩阵剔除后的剩余组件）按 Java 口径并入对比：settings 平铺键表本含
   * index.analysis 单键（Java 侧如此），摘出后此处等价还原——分析组件无法在线重建，
   * 差异进 staticBlocked 呈报（值给组件名集合摘要）；双侧一致不报 */
  const analysisKeys = analysis && Object.keys(analysis).length ? ['index.analysis'] : [];
  const analysisSummary = (node: any): string | null => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
    const names = Object.entries<any>(node).flatMap(([kind, defs]) =>
      defs && typeof defs === 'object' && !Array.isArray(defs)
        ? Object.keys(defs).map((n) => `${kind}.${n}`) : []);
    return names.length ? names.sort().join(',') : null;
  };
  for (const key of [...Object.keys(settings), ...analysisKeys].sort()) {
    if (key === 'index.analysis') {
      if (!deepSettingEq(analysis, targetAnalysis)) {
        staticBlocked.push({
          key, sourceValue: analysisSummary(analysis), targetValue: analysisSummary(targetAnalysis),
          reason: '静态设置无法在线更新，仅建议：如需对齐请重建索引或人工评估',
        });
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(targetSettings, key)
      && deepSettingEq(settings[key], targetSettings[key])) {
      continue; // 双侧一致：无需动作
    }
    const targetValue = Object.prototype.hasOwnProperty.call(targetSettings, key) ? targetSettings[key] : null;
    if (isIncrementalDynamicSetting(key)) {
      updatedSettings.push({ key, sourceValue: settings[key], targetValue });
      settingsIncrement[key] = settings[key];
    } else {
      staticBlocked.push({ key, sourceValue: settings[key], targetValue, reason: '静态设置无法在线更新，仅建议：如需对齐请重建索引或人工评估' });
    }
  }
  const addedAliases: string[] = [];
  for (const alias of sourceAliases) {
    if (!(alias in targetAliases)) addedAliases.push(alias);
  }
  const mappingIncrement: Record<string, any> = {};
  if (addedFields.length) {
    mappingIncrement.properties = buildAddedProperties(props, '', dstFields);
  }
  const nestedSettingsIncrement = Object.keys(settingsIncrement).length
    ? (syncNestSettings(settingsIncrement, null) ?? {}) : {};

  /* 增量计划摘要：canonical {settings,mappings,aliases}（计划 PUT 的增量体 + 补加别名
     名单）SHA-256 前 16 hex，预览与执行同点计算（与 create 模式的 planDigestOf 同款） */
  const planDigest = await planDigestOf(canonicalJson({
    settings: nestedSettingsIncrement, mappings: mappingIncrement, aliases: addedAliases,
  }));
  if (apply && expectPlanDigest && expectPlanDigest !== planDigest) {
    throw Object.assign(
      new Error(`计划摘要不匹配，拒绝执行：期望 ${expectPlanDigest}，实际 ${planDigest}（source structure drifted, re-run smart-sync preview）`),
      { code: 'PLAN_DRIFT' },
    );
  }

  /* 执行序：PUT _mapping（merge）→ PUT _settings（动态键）→ 补别名；单步失败如实记录
     并继续其余步骤（与 Java executeStep 同口径：成功 status 200 detail acknowledged，
     异常 status null detail 错误消息） */
  const executed: Array<{ step: string; status: number | null; detail: string }> = [];
  const syncedAliases: string[] = [];
  let allStepsOk = true;
  if (apply) {
    if (addedFields.length) {
      try {
        await host('/' + enc(destIndex) + '/_mapping', 'PUT', JSON.stringify(mappingIncrement));
        executed.push({ step: 'put_mapping', status: 200, detail: 'acknowledged' });
      } catch (e: any) {
        executed.push({ step: 'put_mapping', status: null, detail: String(e?.message || e) });
        allStepsOk = false;
      }
    }
    if (Object.keys(settingsIncrement).length) {
      try {
        await host('/' + enc(destIndex) + '/_settings', 'PUT', JSON.stringify(nestedSettingsIncrement));
        executed.push({ step: 'put_settings', status: 200, detail: 'acknowledged' });
      } catch (e: any) {
        executed.push({ step: 'put_settings', status: null, detail: String(e?.message || e) });
        allStepsOk = false;
      }
    }
    if (syncAliases && addedAliases.length) {
      for (const alias of addedAliases) {
        try {
          const add: Record<string, any> = { index: destIndex, alias };
          const def = sourceAliasMeta[alias];
          if (def && typeof def === 'object') {
            for (const meta of ALIAS_META_KEYS) {
              if (def[meta] !== undefined) add[meta] = def[meta];
            }
          }
          await host('/_aliases', 'POST', JSON.stringify({ actions: [{ add }] }));
          syncedAliases.push(alias);
        } catch (e: any) {
          warnings.push('别名 ' + alias + ' 随迁失败：' + String(e?.message || e));
        }
      }
      const okCount = syncedAliases.length;
      executed.push({ step: 'add_aliases', status: okCount === addedAliases.length ? 200 : 400, detail: okCount + '/' + addedAliases.length + ' 个别名写成功' });
      if (okCount < addedAliases.length) allStepsOk = false;
    }
  }
  const verdict = !apply ? 'PLANNED' : allStepsOk ? 'APPLIED' : 'FAILED';
  /* 别名守恒：skipped + synced = 源别名总数（预览 synced=计划补加名单，执行 synced=事实成功名单） */
  const executedAliases = !apply ? addedAliases : syncedAliases;
  const sideBlock = (index: string, caps: any, connection: string): any => ({
    index, connection,
    version: caps?.version ?? null,
    distribution: caps?.distribution ?? null,
    clusterName: caps?.clusterName ?? null,
    vendor: { id: caps?.vendor?.id ?? 'unknown', label: caps?.vendor?.label ?? VENDOR_LABELS.unknown },
    plugins: caps?.plugins ?? null,
    pluginsReliable: !!caps?.pluginsReliable,
    nodeCount: caps?.nodeCount ?? null,
    dataNodeCount: caps?.dataNodeCount ?? null,
  });
  return {
    verdict,
    mode: 'incremental',
    applied: apply && allStepsOk,
    apply,
    destConnId,
    destIndex,
    planDigest,
    rounds: 0,
    source: sideBlock(sourceIndex, sourceCaps, String(req?.srcConnId || '')),
    target: sideBlock(destIndex, targetCaps, destConnId),
    planned: { ...planned, advice },
    reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
    autoTuned: [],
    incremental: { addedFields, skippedConflicts, updatedSettings, staticBlocked, addedAliases },
    executed,
    body: { settings: nestedSettingsIncrement, mappings: mappingIncrement, aliases: addedAliases },
    aliases: { skipped: sourceAliases.filter(a => !executedAliases.includes(a)), synced: executedAliases },
    warnings,
    ...(apply && !allStepsOk ? { lastError: '增量执行存在失败步骤，详见 executed 与 warnings' } : {}),
  };
}

/* ---------------- 同步计划台账（smart_sync savePlan / plan_list / plan_apply） ----------------
 * 预览时保存的计划存本机 localStorage，之后可以按计划直接执行（关掉页面再打开仍然可用）。
 * 记录字段与服务端 PlanRecord 相同（13 个字段加预览快照），不保存任何凭据：源集群只记连接档案 id，
 * 执行时按档案取密。最多保留 50 条，超出时删掉保存时间最早的一条。
 * 写入 localStorage 失败（存储空间满、隐私模式）时，计划只保留在当前页面的内存里并照常可用，
 * 响应 warnings 会说明；页面刷新后这些计划不再存在。 */

export const PLANS_KEY = 'xm-plans-v1';
/* 台账容量上限（与服务端 PlanStore.CAP 相同）。 */
export const PLANS_CAP = 50;
/* 计划不存在时的错误文案前缀（与服务端 PlanStore.NOT_FOUND_PREFIX 相同）。 */
export const PLAN_NOT_FOUND_PREFIX = '同步计划不存在: ';

/** 同步计划记录（与服务端 PlanRecord 字段相同；snapshot 为保存时的预览报告）。 */
export interface SyncPlanRecord {
  planId: string;
  srcConnId: string;
  sourceIndex: string;
  destConnId: string;
  destIndex: string;
  mode: string;
  syncAliases: boolean;
  fallbackAnalyzer: string | null;
  autoTune: boolean;
  planDigest: string | null;
  savedAtMs: number;
  appliedAtMs: number | null;
  appliedCount: number;
  snapshot?: any;
}

/* 写入本机存储失败的计划放在这里（planId → 记录）；之后任意一次写入成功即清空。 */
const memoryPlans = new Map<string, SyncPlanRecord>();

function textOf(value: any): string {
  return value == null ? '' : String(value).trim();
}

/** 16 位随机十六进制串（与服务端计划 id 的随机段等长，无法被猜到）；没有 WebCrypto 时用 Math.random。 */
function randomHex16(): string {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* 读台账。键不存在表示从未保存过计划，返回空列表；键存在但内容解析不了才算读取失败，
 * 此时带 warning 返回，不把读取失败显示成「没有计划」。 */
function readPlans(): { rows: SyncPlanRecord[]; warning: string | null } {
  const stored = readStoredJson<SyncPlanRecord[] | null>(localStorage, PLANS_KEY, null, Array.isArray);
  if (stored) return { rows: stored.filter(row => row && typeof row === 'object' && row.planId), warning: null };
  let present = false;
  try { present = localStorage.getItem(PLANS_KEY) != null; } catch { present = false; }
  return {
    rows: [],
    warning: present ? '同步计划台账读取失败，仅返回当前页面内保存的计划' : null,
  };
}

function newestFirst(rows: SyncPlanRecord[]): SyncPlanRecord[] {
  return [...rows].sort((a, b) => (Number(b.savedAtMs) || 0) - (Number(a.savedAtMs) || 0));
}

/* 全部计划：台账记录并入页面内副本（同一计划以副本为准，它比台账新），按保存时间倒序，
 * 最多返回容量上限条。页面内副本是最近写入的，排在前面：同一毫秒保存的多条计划里，
 * 最近写入的在前。 */
function allPlans(): { rows: SyncPlanRecord[]; warning: string | null } {
  const read = readPlans();
  const merged = new Map<string, SyncPlanRecord>();
  for (const row of memoryPlans.values()) merged.set(row.planId, row);
  for (const row of read.rows) if (!merged.has(row.planId)) merged.set(row.planId, row);
  return { rows: newestFirst([...merged.values()]).slice(0, PLANS_CAP), warning: read.warning };
}

export function findPlan(planId: string): SyncPlanRecord | null {
  const local = memoryPlans.get(planId);
  if (local) return local;
  return readPlans().rows.find(row => row.planId === planId) || null;
}

/* 新建或覆盖一条计划。返回是否已写入本机存储；失败时留在页面内副本里。 */
function putPlan(record: SyncPlanRecord): boolean {
  const rows = newestFirst([record, ...allPlans().rows.filter(row => row.planId !== record.planId)]).slice(0, PLANS_CAP);
  const persisted = writeStoredRaw(localStorage, PLANS_KEY, JSON.stringify(rows));
  if (persisted) memoryPlans.clear();
  else memoryPlans.set(record.planId, record);
  return persisted;
}

function appendPlanWarning(report: any, warning: string): void {
  report.warnings = [...(Array.isArray(report.warnings) ? report.warnings : []), warning];
}

/** 由 smart_sync 预览报告生成计划记录并入台账：参数按请求原值记录，目标索引、模式、计划摘要
 *  取报告里的值，报告另存为快照（与服务端 PlanRecord.of 的做法相同）。目标连接是唯一例外：
 *  destConnId 为 host/空时落库前解析为数据面当前目标档案 id——计划按具体档案记录，顶栏切走
 *  目标后再按计划执行，会被桥层「请先切换目标连接」如实挡住（host 常量在 apply 校验里永远
 *  放行，存 host 等于放弃目标校验）；本机没有档案可解析时保持原值。 */
function savePlanRecord(req: any, report: any): SyncPlanRecord {
  const sourceIndex = textOf(req?.sourceIndex);
  const destIndex = textOf(report?.destIndex) || textOf(req?.destIndex) || sourceIndex;
  const rawDestConnId = textOf(req?.destConnId);
  const destConnId = !rawDestConnId || rawDestConnId === 'host'
    ? (dataProfile()?.id ?? rawDestConnId)
    : rawDestConnId;
  const record: SyncPlanRecord = {
    /* 与迁移作业 id 同规则：目标索引名 + 毫秒时间戳 + 16 位随机段 */
    planId: destIndex + '_' + Date.now() + '_' + randomHex16(),
    srcConnId: textOf(req?.srcConnId),
    sourceIndex,
    destConnId,
    destIndex,
    mode: textOf(report?.mode) || 'create',
    syncAliases: req?.syncAliases === true,
    fallbackAnalyzer: textOf(req?.downgradedAnalyzerFallback) || null,
    autoTune: req?.autoTune === true,
    planDigest: textOf(report?.planDigest) || null,
    savedAtMs: Date.now(),
    appliedAtMs: null,
    appliedCount: 0,
    snapshot: { ...report },
  };
  if (!putPlan(record)) {
    appendPlanWarning(report, '同步计划未能写入本机存储，仅保留在当前页面内（页面刷新后失效）');
  }
  return record;
}

/** 计划列表行（与服务端 PlanRecord.toSummary 字段相同、顺序相同）。 */
function planSummary(plan: SyncPlanRecord): Record<string, any> {
  return {
    planId: plan.planId,
    srcConnId: plan.srcConnId,
    sourceIndex: plan.sourceIndex,
    destConnId: plan.destConnId,
    destIndex: plan.destIndex,
    mode: plan.mode,
    autoTune: plan.autoTune,
    syncAliases: plan.syncAliases,
    planDigest: plan.planDigest,
    savedAtMs: plan.savedAtMs,
    appliedAtMs: plan.appliedAtMs ?? null,
    appliedCount: plan.appliedCount ?? 0,
  };
}

/** 已存同步计划列表：按保存时间倒序，附容量上限 cappedAt；台账读取失败时另带 warning。
 *  redact=true 时删去每行的 srcConnId（服务端对低于 REBUILD_OP 的身份同样不返回源档案 id）。 */
export function listPlans(redact = false): { plans: Record<string, any>[]; cappedAt: number; warning?: string } {
  const { rows, warning } = allPlans();
  const out: { plans: Record<string, any>[]; cappedAt: number; warning?: string } = {
    plans: rows.map(planSummary),
    cappedAt: PLANS_CAP,
  };
  if (warning) out.warning = warning;
  if (redact) for (const row of out.plans) delete row.srcConnId;
  return out;
}

/** 单个计划的记录与保存时的预览快照（供 esquerystudio://xmigrate/plan/{id} 资源读取）。
 *  redact=true 时删去 srcConnId，快照里回显的源连接标识一并删去。计划不存在时抛出
 *  「同步计划不存在: <id>」。 */
export function planSnapshot(planId: string, redact = false): Record<string, any> {
  const plan = findPlan(planId);
  if (!plan) throw Object.assign(new Error(PLAN_NOT_FOUND_PREFIX + planId), { code: 'PLAN_NOT_FOUND' });
  const snapshot: Record<string, any> = plan.snapshot && typeof plan.snapshot === 'object' && !Array.isArray(plan.snapshot)
    ? { ...plan.snapshot } : {};
  const out: Record<string, any> = { ...planSummary(plan), fallbackAnalyzer: plan.fallbackAnalyzer ?? null, snapshot };
  if (redact) {
    delete out.srcConnId;
    if (snapshot.source && typeof snapshot.source === 'object') {
      snapshot.source = { ...snapshot.source };
      delete snapshot.source.connection;
    }
  }
  return out;
}

/** 按已存计划执行：按计划保存的参数重跑 smart_sync 的执行形态，漂移校验用的摘要取
 *  expectPlanDigest，没给就用计划保存时的 planDigest；源结构与保存时不一致时抛出 PLAN_DRIFT，
 *  不会写入目标集群。执行成功后记录执行时间和累计次数，返回执行报告并回显 planId。 */
export async function applyPlan(host: HostCall, req: any): Promise<any> {
  const planId = textOf(req?.planId);
  if (!planId) throw new Error('planId 不能为空');
  const plan = findPlan(planId);
  if (!plan) throw Object.assign(new Error(PLAN_NOT_FOUND_PREFIX + planId), { code: 'PLAN_NOT_FOUND' });
  const expected = textOf(req?.expectPlanDigest) || textOf(plan.planDigest);
  if (!expected) {
    /* 没有基准摘要就无法判断源结构是否变化，不能直接执行。 */
    throw Object.assign(new Error('同步计划缺少计划摘要，无法校验漂移: ' + planId), { code: 'BAD_REQUEST' });
  }
  const report = await smartSync(host, {
    srcConnId: plan.srcConnId,
    sourceIndex: plan.sourceIndex,
    destConnId: plan.destConnId,
    destIndex: plan.destIndex,
    syncAliases: plan.syncAliases === true,
    ...(plan.fallbackAnalyzer ? { downgradedAnalyzerFallback: plan.fallbackAnalyzer } : {}),
    autoTune: plan.autoTune === true,
    mode: plan.mode || 'create',
    apply: true,
    expectPlanDigest: expected,
  });
  if (report?.applied === true || report?.verdict === 'APPLIED') {
    if (!putPlan({ ...plan, appliedAtMs: Date.now(), appliedCount: (Number(plan.appliedCount) || 0) + 1 })) {
      appendPlanWarning(report, '同步计划已执行，但执行次数未能写回本机存储（仅保留在当前页面内）');
    }
  }
  report.planId = planId;
  return report;
}

/* ---------------- 集群能力对比（compare_capabilities） ----------------
 * 源（直连）与目标（宿主）各探测一次，产出版本差/厂商切换/插件差/节点规模与风险矩阵；
 * 只读，不触碰任何索引。 */
export async function compareCapabilities(host: HostCall, req: any): Promise<any> {
  const conn = syncSourceConn(req);
  const sourceIndex = String(req?.sourceIndex || '').trim();
  /* destIndex 缺省回退 sourceIndex 名（对齐服务端 echo）；destConnId 可选（浏览器桥层
   * auto-fill 当前激活档案 id，直调时未传如实 null 回显） */
  const destIndex = String(req?.destIndex || '').trim() || sourceIndex;
  const destConnId = String(req?.destConnId || '').trim() || null;
  const [source, target] = await Promise.all([
    probeSide((p) => sourceCall(conn, p)),
    probeSide((p) => host(p)),
  ]);
  /* sourceIndex 给出时顺带取源分片数（shard_oversize 判定输入；不进 source 报告块） */
  let srcShards: number | null = null;
  if (sourceIndex) {
    try {
      const rows: any[] = await sourceCall(conn, '/_cat/indices?format=json&h=index,pri');
      const row = (rows || []).find((r: any) => String(r.index) === sourceIndex);
      srcShards = numOrNull(row?.pri);
    } catch { /* 分片数取不到不判 shard_oversize */ }
  }
  const block = (caps: any, connection: string | null, index: string | null): any => ({
    connection,
    index,
    version: caps?.version ?? null,
    distribution: caps?.distribution ?? null,
    clusterName: caps?.clusterName ?? null,
    vendor: { id: caps?.vendor?.id ?? 'unknown', label: caps?.vendor?.label ?? VENDOR_LABELS.unknown },
    evidence: Array.isArray(caps?.vendor?.evidence) ? caps.vendor.evidence : [],
    plugins: caps?.plugins ?? null,
    managed: !!caps?.managed,
    nodeCount: caps?.nodeCount ?? null,
    dataNodeCount: caps?.dataNodeCount ?? null,
    pluginsReliable: !!caps?.pluginsReliable,
  });
  /* 版本差只看 major.minor（与 sync_structure 版本告警同口径，SNAPSHOT 后缀不误报） */
  const majorMinor = (v: string): string => {
    const parts = String(v).trim().split('.');
    return parts.length >= 2 ? parts[0] + '.' + parts[1] : String(v);
  };
  const versionGap = source.version && target.version && majorMinor(source.version) !== majorMinor(target.version)
    ? `${source.version} -> ${target.version}`
    : null;
  const vendorChanged = source.vendor.id !== target.vendor.id
    && source.vendor.id !== 'unknown' && target.vendor.id !== 'unknown';
  /* 插件差：任一侧清单未知（null）不比较（受限账号常见，不冒充空集） */
  const pluginsOnlyInSource = source.plugins && target.plugins
    ? source.plugins.filter((p: string) => !target.plugins!.includes(p))
    : [];
  const pluginsOnlyInTarget = source.plugins && target.plugins
    ? target.plugins.filter((p: string) => !source.plugins!.includes(p))
    : [];
  const risks: Array<{ kind: string; severity: string; message: string; action: string }> = [];
  for (const plugin of pluginsOnlyInSource) {
    /* 已知具名组件插件：sync_structure 可自动剔除/降级；未知插件只能目标安装或从计划排除 */
    const known = coversKnownComponent(plugin);
    risks.push({
      kind: 'plugin_missing', severity: 'high',
      message: `目标集群缺少插件 ${plugin}（源在用），相关分析组件在 sync_structure 中会被自动剔除或降级`,
      action: known
        ? 'auto-strip on sync_structure; or install plugin on target'
        : 'install the plugin on target or exclude the component from the sync plan',
    });
  }
  if (source.version && target.version
    && Number(String(target.version).split('.')[0]) < Number(String(source.version).split('.')[0])) {
    risks.push({
      kind: 'version_downgrade', severity: 'medium',
      message: `目标版本 ${target.version} 大版本低于源 ${source.version}，跨大版本回迁的字段解析与默认行为可能不兼容`,
      action: 'align target major version first; or run sync_structure dryRun=true and review mapping downgrades',
    });
  }
  if (vendorChanged) {
    risks.push({
      kind: 'vendor_change', severity: 'low',
      message: `厂商从 ${source.vendor.id} 切换到 ${target.vendor.id}，厂商私有设置（如 apack/qcloud/cloud_aws 前缀）将被剔除`,
      action: 'run sync_structure dryRun=true to review vendor-private removals',
    });
  }
  if (srcShards != null && target.dataNodeCount != null && target.dataNodeCount > 0
    && srcShards > 3 * target.dataNodeCount) {
    risks.push({
      kind: 'shard_oversize', severity: 'medium',
      message: `源索引 ${srcShards} 片超过目标 ${target.dataNodeCount} 个数据节点的 3 倍，目标侧分片过碎`,
      action: `reduce source shards to <= ${3 * target.dataNodeCount} or scale target data nodes before sync`,
    });
  }
  return {
    source: block(source, String(req?.srcConnId || ''), sourceIndex || null),
    target: block(target, destConnId, destIndex || null),
    diff: {
      versionGap, vendorChanged, pluginsOnlyInSource, pluginsOnlyInTarget,
      nodeScale: { sourceDataNodes: source.dataNodeCount ?? null, targetDataNodes: target.dataNodeCount ?? null },
      risks,
    },
  };
}

/* ---------------- 结构 diff（diff_structure） ----------------
 * 源 vs 目标（宿主）的 settings/mapping 对比：先按兼容矩阵算 expectedRemovals（计划剔除
 * 豁免表），计划外差异进 unexpected，compatible=无 unexpected。目标不存在直接报错。 */
const DIFF_IGNORED_SETTING_KEYS = ['index.provided_name', 'index.creation_date', 'index.uuid', 'index.number_of_replicas'];
const DIFF_IGNORED_SETTING_PREFIXES = ['index.version.'];
/* settings 值深比较（键序无关）——与服务端 Objects.equals 同语义。String() 比较对对象值
 * 恒为 "[object Object]"，嵌套值差异会漏报（如 analysis filter 的 stopwords 数组） */
function deepSettingEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepSettingEq(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every(k => k in (b as Record<string, unknown>) && deepSettingEq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
function diffComparableSettings(flat: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(flat || {})) {
    if (DIFF_IGNORED_SETTING_KEYS.includes(key)) continue;
    if (DIFF_IGNORED_SETTING_PREFIXES.some(p => key.startsWith(p))) continue;
    out[key] = value;
  }
  return out;
}
/* 字段语义属性（diff 只比这些，其余如 copy_to/store 等暂不比；口径对齐服务端 FIELD_SEMANTIC_ATTRS） */
const DIFF_FIELD_SEMANTIC_ATTRS = ['type', 'analyzer', 'search_analyzer', 'normalizer'];
/* 字段收集（含嵌套对象与 multi-field，全路径名 → 语义属性表：在场的 type/analyzer/
 * search_analyzer/normalizer，缺席属性不入表——两侧缺席不构成差异） */
function collectFieldSemantics(props: any, prefix: string, out: Map<string, Record<string, any>>): void {
  for (const [name, def] of Object.entries<any>(props || {})) {
    if (!def || typeof def !== 'object') continue;
    const path = prefix ? prefix + '.' + name : name;
    const semantic: Record<string, any> = {};
    for (const attr of DIFF_FIELD_SEMANTIC_ATTRS) {
      if (def[attr] !== undefined) semantic[attr] = def[attr];
    }
    out.set(path, semantic);
    if (def.properties) collectFieldSemantics(def.properties, path, out);
    for (const [sub, sd] of Object.entries<any>(def.fields || {})) {
      const subPath = path + '.' + sub;
      const subSemantic: Record<string, any> = {};
      if (sd && typeof sd === 'object') {
        for (const attr of DIFF_FIELD_SEMANTIC_ATTRS) {
          if (sd[attr] !== undefined) subSemantic[attr] = sd[attr];
        }
      }
      out.set(subPath, subSemantic);
      if (sd?.properties) collectFieldSemantics(sd.properties, subPath, out);
    }
  }
}
/* 两侧语义属性表是否等价（逐属性值比对，缺席侧记 (absent)） */
function sameFieldSemantics(a: Record<string, any>, b: Record<string, any>): boolean {
  const attrs = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const attr of attrs) {
    if (String(a[attr]) !== String(b[attr])) return false;
  }
  return true;
}
/* 字段语义属性差异摘要（如 `analyzer: ik_max_word -> standard`；缺失侧记 (absent)） */
function fieldSemanticDetail(source: Record<string, any>, target: Record<string, any>): string {
  const attrs = [...new Set([...Object.keys(source), ...Object.keys(target)])].sort();
  const parts: string[] = [];
  for (const attr of attrs) {
    const s = source[attr];
    const d = target[attr];
    if (String(s) !== String(d)) {
      parts.push(`${attr}: ${s == null ? '(absent)' : s} -> ${d == null ? '(absent)' : d}`);
    }
  }
  return parts.join('; ');
}
export async function diffStructure(host: HostCall, req: any): Promise<any> {
  const conn = syncSourceConn(req);
  const sourceIndex = String(req?.sourceIndex || '').trim();
  if (!sourceIndex) throw new Error('sourceIndex 不能为空');
  /* destIndex 缺省回退 sourceIndex（与 sync_structure 同形）；destConnId 可选（浏览器桥层
   * auto-fill 当前激活档案 id，直调时未传如实 null 回显） */
  const destIndex = String(req?.destIndex || '').trim() || sourceIndex;
  const destConnId = req?.destConnId != null && String(req.destConnId).trim() !== '' ? String(req.destConnId) : null;
  /* 豁免回传参数（可选，来自上次 smart_sync/sync_structure 报告）：autoTunedShards=
     autoTune 收敛后的分片数；removedKeys=上次计划内剔除/变更键清单。非正数/非字符串
     数组/空元素如实报错；空数组视同缺省（与 Java 6 参 diffStructure 重载同口径） */
  const autoTunedShardsRaw = req?.autoTunedShards;
  let autoTunedShards: number | null = null;
  if (autoTunedShardsRaw != null) {
    const n = Number(autoTunedShardsRaw);
    if (!Number.isFinite(n) || Math.floor(n) !== n || n <= 0) {
      throw Object.assign(new Error('autoTunedShards 需为正整数，实际: ' + String(autoTunedShardsRaw)), { code: 'BAD_REQUEST' });
    }
    autoTunedShards = n;
  }
  const removedKeysRaw = req?.removedKeys;
  let removedKeySet: Set<string> | null = null;
  if (removedKeysRaw != null) {
    if (!Array.isArray(removedKeysRaw)) {
      throw Object.assign(new Error('removedKeys 需为字符串数组，实际: ' + String(removedKeysRaw)), { code: 'BAD_REQUEST' });
    }
    const list: string[] = [];
    for (const item of removedKeysRaw) {
      if (item == null || String(item).trim() === '') {
        throw Object.assign(new Error('removedKeys 数组元素必须为非空字符串'), { code: 'BAD_REQUEST' });
      }
      list.push(String(item).trim());
    }
    removedKeySet = list.length ? new Set(list) : null;
  }
  /* 兼容计划（expectedRemovals 的来源）：与 sync_structure 同一套矩阵预剔除 */
  const plan = await compatPlan(host, conn, sourceIndex);
  const expectedRemovals: Array<{ area: string; key: string; reason: string }> = [
    ...plan.planned.removedSettings.map((s: any) => ({ area: 'settings', key: s.key, reason: s.reason })),
    ...plan.planned.removedAnalysis.map((a: any) => ({ area: 'analysis', key: `${a.kind}.${a.name}`, reason: a.reason })),
    ...plan.planned.downgradedFields.map((d: any) => ({ area: 'mappings', key: d.field, reason: d.reason })),
  ];
  /* 目标必须已存在：mapping/settings 任一读取失败即明确报错（404/连通性都如实上抛） */
  let destSettingsRaw: any;
  let destMappingRaw: any;
  try {
    [destSettingsRaw, destMappingRaw] = await Promise.all([
      host('/' + enc(destIndex) + '/_settings?flat_settings=true'),
      host('/' + enc(destIndex) + '/_mapping'),
    ]);
  } catch (e: any) {
    throw Object.assign(
      new Error('目标索引不存在或不可读，无法 diff（先用 sync_structure 建成目标）: ' + destIndex + ' — ' + String(e?.message || e)),
      { code: 'DEST_NOT_FOUND' },
    );
  }
  /* 源侧重新取原始 flat settings（compatPlan 返回的是已剔/已拆版本，diff 要原始形态） */
  const [srcSettingsRaw, srcMappingRaw] = await Promise.all([
    sourceCall(conn, '/' + enc(sourceIndex) + '/_settings?flat_settings=true'),
    sourceCall(conn, '/' + enc(sourceIndex) + '/_mapping'),
  ]);
  const srcSettings = diffComparableSettings(syncFlatSettings(srcSettingsRaw));
  const dstSettings = diffComparableSettings(syncFlatSettings(destSettingsRaw));
  const settingsDiff = {
    onlyInSource: Object.keys(srcSettings).filter(k => !(k in dstSettings))
      .map(k => ({ key: k, sourceValue: srcSettings[k] })),
    onlyInTarget: Object.keys(dstSettings).filter(k => !(k in srcSettings))
      .map(k => ({ key: k, targetValue: dstSettings[k] })),
    valueChanged: Object.keys(srcSettings).filter(k => k in dstSettings && !deepSettingEq(srcSettings[k], dstSettings[k]))
      .map(k => ({ key: k, sourceValue: srcSettings[k], targetValue: dstSettings[k] })),
  };
  const srcFields = new Map<string, Record<string, any>>();
  collectFieldSemantics(propsOf(syncMappingBody(Object.values<any>(srcMappingRaw || {})[0])), '', srcFields);
  const dstFields = new Map<string, Record<string, any>>();
  collectFieldSemantics(propsOf(syncMappingBody(Object.values<any>(destMappingRaw || {})[0])), '', dstFields);
  const mappingsDiff = {
    fieldAdded: [...dstFields].filter(([f]) => !srcFields.has(f))
      .map(([field, sem]) => ({ field, type: sem.type ?? 'object' })),
    fieldRemoved: [...srcFields].filter(([f]) => !dstFields.has(f))
      .map(([field, sem]) => ({ field, type: sem.type ?? 'object' })),
    fieldChanged: [...srcFields].flatMap(([field, sem]) => {
      const dst = dstFields.get(field);
      if (!dst || sameFieldSemantics(sem, dst)) return [];
      return [{
        field, sourceType: sem.type ?? 'object', targetType: dst.type ?? 'object',
        detail: fieldSemanticDetail(sem, dst),
      }];
    }),
  };
  /* unexpected：计划外差异（settings 三清单 + mappings 三清单全量计入）。settings 侧
   * onlyInSource 命中 expectedRemovals（settings 整键或 analysis 组件平铺前缀
   * index.analysis.{kind}.{name}）豁免；mappings 侧字段差异命中 downgradedFields 字段名
   * 豁免（降级保字段，但同类字段的其他差异仍按计划外报告）。
   * 豁免回传命中（autoTunedShards=分片收敛值 / removedKeys=上次计划内变更键）按计划内
   * 豁免进 expectedRemovals（reason 与 Java 逐字一致），复检不被自己的计划内优化误报 */
  const expectedSettingKeys = new Set(expectedRemovals.filter(r => r.area === 'settings').map(r => r.key));
  const expectedAnalysisPrefixes = expectedRemovals.filter(r => r.area === 'analysis')
    .map(r => 'index.analysis.' + r.key + '.');
  const expectedAnalysisSet = new Set(expectedRemovals.filter(r => r.area === 'analysis').map(r => r.key));
  /* 嵌套形态（标准 ES flat 响应）下 analysis 挂在 index.analysis 单键——计划剔除组件表现为
   * 整键 valueChanged 或整键 onlyInSource；按组件级差集（源有目标无 ⊆ 计划剔除集）豁免，
   * 组件定义被改（双侧都有但定义不同）仍照报 */
  const analysisComponents = (v: unknown): Set<string> => {
    const out = new Set<string>();
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    for (const [kind, defs] of Object.entries(v as Record<string, unknown>)) {
      if (!defs || typeof defs !== 'object' || Array.isArray(defs)) continue;
      for (const name of Object.keys(defs as Record<string, unknown>)) out.add(`${kind}.${name}`);
    }
    return out;
  };
  const analysisDiffExplained = (srcV: unknown, dstV: unknown): boolean => {
    const srcComps = analysisComponents(srcV);
    const dstComps = analysisComponents(dstV);
    for (const c of srcComps) {
      if (!dstComps.has(c) && !expectedAnalysisSet.has(c)) return false;
    }
    return true;
  };
  const exemptRemovalReason = (key: string): string | null => {
    if (autoTunedShards != null && key === 'index.number_of_shards') return 'autoTune 分片收敛(计划改写)';
    if (removedKeySet != null && removedKeySet.has(key)) return '上次同步计划内变更';
    return null;
  };
  const expectedFieldKeys = new Set(expectedRemovals.filter(r => r.area === 'mappings').map(r => r.key));
  const unexpected: Array<{ area: string; key: string; message: string }> = [];
  for (const { key, sourceValue } of settingsDiff.onlyInSource) {
    if (expectedSettingKeys.has(key)) continue;
    if (expectedAnalysisPrefixes.some(p => key.startsWith(p))) continue;
    if (key === 'index.analysis' && analysisDiffExplained(sourceValue, null)) continue;
    const exemptReason = exemptRemovalReason(key);
    if (exemptReason) {
      expectedRemovals.push({ area: 'settings', key, reason: exemptReason });
      continue;
    }
    unexpected.push({ area: 'settings', key, message: `源设置 ${key} 未出现在目标索引，且不在兼容矩阵预期剔除清单内` });
  }
  for (const { key } of settingsDiff.onlyInTarget) {
    unexpected.push({ area: 'settings', key, message: `目标设置 ${key} 不在源索引中（计划外新增）` });
  }
  for (const { key, sourceValue, targetValue } of settingsDiff.valueChanged) {
    if (key === 'index.analysis' && analysisDiffExplained(sourceValue, targetValue)) continue;
    if (autoTunedShards != null && key === 'index.number_of_shards') {
      expectedRemovals.push({ area: 'settings', key: 'index.number_of_shards', reason: 'autoTune 分片收敛(计划改写)' });
      continue;
    }
    unexpected.push({ area: 'settings', key, message: `设置 ${key} 取值不一致：${String(sourceValue)} -> ${String(targetValue)}` });
  }
  for (const f of mappingsDiff.fieldAdded) {
    if (expectedFieldKeys.has(f.field)) continue;
    unexpected.push({ area: 'mappings', key: f.field, message: `目标存在源没有的字段 ${f.field}（计划外新增）` });
  }
  for (const f of mappingsDiff.fieldRemoved) {
    if (expectedFieldKeys.has(f.field)) continue;
    unexpected.push({ area: 'mappings', key: f.field, message: `源字段 ${f.field} 在目标索引缺失（不在预期剔除清单内）` });
  }
  for (const f of mappingsDiff.fieldChanged) {
    /* 豁免：字段命中计划降级清单且 type 未变（差异仅在 analysis 引用属性，与服务端同口径）；
     * 降级后 type 仍变的差异按计划外报告 */
    if (expectedFieldKeys.has(f.field) && f.sourceType === f.targetType) continue;
    unexpected.push({ area: 'mappings', key: f.field, message: `字段 ${f.field} 定义不一致：${f.detail}` });
  }
  return {
    sourceIndex, destIndex, destConnId,
    settingsDiff, mappingsDiff,
    expectedRemovals, unexpected,
    compatible: unexpected.length === 0,
  };
}

/* ---------------- 迁移后等价性验证（verify_equivalence） ----------------
 * 源（直连档案）vs 目标（宿主）的文档级等价性抽样验证（只读），语义与返回键名对齐
 * 服务端 StructureSyncService.verifyEquivalence：双侧 _count(match_all) → 源 _doc 序
 * 抽样 _id（_source:false 只要 id，size=min(钳制后 sampleSize, count)）→ 双侧 mget 取
 * _source → sampleFields 投影（点号路径）后 canonicalJson SHA-256 前 16 hex 摘要逐 id
 * 对比（http 无 crypto.subtle 环境走 planDigestOf 确定性降级并记 warning）；aggField
 * 给出时附 terms 聚合对比。任一侧取数失败如实 null/告警；verdict：count 未知或样本/
 * 聚合取数失败 → INCONCLUSIVE，总数一致+样本无缺无错配+聚合（若做）match → EQUIVALENT，
 * 其余 DIVERGENT。jobId 形态从本机作业台账补 srcConnId/sourceIndex/destIndex（对账同款）。 */
/* 样本差异清单回显上限（missingInDest/mismatched 各 ≤20，超限置 truncated 标记，与服务端 VERIFY_DETAIL_LIMIT 同值） */
const VERIFY_DETAIL_LIMIT = 20;
const VERIFY_SAMPLE_MIN = 10, VERIFY_SAMPLE_MAX = 500;
const VERIFY_AGG_MIN = 1, VERIFY_AGG_MAX = 50;
/* 点号路径取值（a.b.c）；路径中断/值缺席返回 null（与服务端 pickPath 同口径） */
function pickPath(doc: any, path: string): any {
  let cur = doc;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return null;
    cur = cur[part];
    if (cur == null) return null;
  }
  return cur;
}
export async function verifyEquivalence(host: HostCall, req: any): Promise<any> {
  const warnings: string[] = [];
  /* jobId 形态：台账取参（srcConnId/sourceIndex/destIndex）；台账无此作业如实报错
   * （对账/冲突样本同款文案），显式传参优先于台账 */
  const jobId = String(req?.jobId || '').trim();
  let srcConnId = String(req?.srcConnId || '').trim();
  let sourceIndex = String(req?.sourceIndex || '').trim();
  let destIndex = String(req?.destIndex || '').trim();
  if (!jobId && !srcConnId) throw new Error('jobId 与 srcConnId 必须二选一');
  /* jobId 形态提升作业台账引用：验证结论落定后向该作业事件环写 VERIFY 事件
   * （与服务端事件时间线同通道，视图时间线「门禁」档可见） */
  let jobDoc: any = null;
  if (jobId) {
    jobDoc = jobs().find(x => x.jobId === jobId);
    if (!jobDoc) throw new Error('作业不存在：' + jobId);
    srcConnId = srcConnId || String(jobDoc.srcConnId || '').trim();
    sourceIndex = sourceIndex || String(jobDoc.sourceIndex || '').trim();
    destIndex = destIndex || String(jobDoc.destIndex || '').trim();
    if (!srcConnId) {
      throw new Error('该作业未记录源连接档案，无法验证等价性（历史手输连接的作业不支持）: ' + jobId);
    }
  }
  if (!sourceIndex) throw new Error('sourceIndex 不能为空');
  destIndex = destIndex || sourceIndex;
  const conn = syncSourceConn({ conn: req?.conn, srcConnId });
  const destConnId = req?.destConnId != null && String(req.destConnId).trim() !== '' ? String(req.destConnId) : null;
  /* 纯结构验证开关（structureOnly=true）：跳过 count/样本/聚合（纯结构同步无数据可对），
     切双侧结构 canonical 摘要对比（jobId 形态已在此前从台账补齐源/目标参数） */
  const structureOnlyRaw = req?.structureOnly;
  if (structureOnlyRaw != null && typeof structureOnlyRaw !== 'boolean') {
    throw Object.assign(new Error('structureOnly 需为布尔值，实际: ' + String(structureOnlyRaw)), { code: 'BAD_REQUEST' });
  }
  if (structureOnlyRaw === true) {
    return verifyStructureEquivalence(host, conn, sourceIndex, destIndex, destConnId, warnings);
  }
  /* 数值钳制并如实记 warning（未给/非法回退缺省不告警；与服务端 clampWithWarning 同款文案）；
   * aggSize 只在 aggField 给出时钳制告警（未做聚合不打扰） */
  const clampWithWarning = (v: any, dft: number, lo: number, hi: number, what: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dft;
    const floored = Math.floor(n);
    const clamped = Math.min(hi, Math.max(lo, floored));
    if (clamped !== floored) warnings.push(what + ' 已从 ' + floored + ' 钳制为 ' + clamped + '（有效范围 ' + lo + '..' + hi + '）');
    return clamped;
  };
  const sampleSize = clampWithWarning(req?.sampleSize, 100, VERIFY_SAMPLE_MIN, VERIFY_SAMPLE_MAX, 'sampleSize');
  const aggField = String(req?.aggField || '').trim() || null;
  const aggSize = aggField ? clampWithWarning(req?.aggSize, 10, VERIFY_AGG_MIN, VERIFY_AGG_MAX, 'aggSize') : 10;
  /* 样本投影字段归一（数组或逗号串、去空白项、去重），全空=整 _source 对比 */
  const projection = (Array.isArray(req?.sampleFields)
    ? req.sampleFields.map((f: any) => String(f ?? '').trim())
    : String(req?.sampleFields || '').split(',').map(f => f.trim())
  ).filter((f: string, i: number, a: string[]) => f && a.indexOf(f) === i);
  const projectSource = (src: any): any => {
    if (!projection.length || !src || typeof src !== 'object') return src ?? null;
    const out: Record<string, any> = {};
    for (const f of projection) {
      const v = pickPath(src, f);
      if (v != null) out[f] = v;
    }
    return out;
  };
  /* 摘要降级说明：planDigestOf 在无 crypto.subtle 的环境内部降级确定性 hash，此处显式告警 */
  if (!globalThis.crypto?.subtle) {
    warnings.push('当前环境无 crypto.subtle，内容摘要降级为确定性非加密 hash（同输入同输出，仅用于等价比对）');
  }
  /* 双侧 _count：任一侧失败如实 null（count=0 是有效值，不与 null 混同）；404 与其他
   * 失败分开告警（文案对齐服务端 countOf） */
  const countOf = async (call: (p: string, m?: string, b?: string) => Promise<any>, index: string, side: string): Promise<number | null> => {
    try {
      const raw = await call('/' + enc(index) + '/_count', 'POST', '{"query":{"match_all":{}}}');
      const n = Number(raw?.count);
      return Number.isFinite(n) ? n : null;
    } catch (e: any) {
      if (Number(e?.status) === 404 || /404|not_?found/i.test(String(e?.message || e))) {
        warnings.push(side + '索引不存在（404）: ' + index);
      } else {
        warnings.push(side + '索引 _count 取数失败: ' + String(e?.message || e));
      }
      return null;
    }
  };
  const sourceCount = await countOf((p, m, b) => sourceCall(conn, p, m, b), sourceIndex, '源');
  const destCount = await countOf(host, destIndex, '目标');
  const countsMatch = sourceCount != null && destCount != null ? sourceCount === destCount : null;
  /* 样本逐 id 内容比对：目标缺文档记 missing，其余投影后摘要对比记 matched/mismatch；
   * 请求失败如实告警并作废本次样本（sampleOk=false → INCONCLUSIVE，不冒充比对过） */
  const missingInDest: string[] = [];
  const mismatched: Array<{ id: string; reason: string }> = [];
  let checked = 0;
  let matched = 0;
  let missingTotal = 0;
  let mismatchTotal = 0;
  let sampleOk = true;
  const projectionSeen = new Set<string>();
  if (sourceCount != null && destCount != null && sourceCount > 0) {
    try {
      const size = Math.min(sampleSize, sourceCount);
      const page = await sourceCall(conn, '/' + enc(sourceIndex) + '/_search', 'POST', JSON.stringify({
        size, sort: ['_doc'], _source: false, query: { match_all: {} },
      }));
      const ids: string[] = (page?.hits?.hits || []).map((h: any) => h?._id).filter((id: any) => id != null).map(String);
      checked = ids.length;
      if (ids.length) {
        const idsBody = JSON.stringify({ ids });
        /* mget 只收 _source 在场的文档（与服务端 mgetSources 同口径：不判 found 只看 _source） */
        const sourcesOf = (resp: any): Map<string, any> => {
          const m = new Map<string, any>();
          for (const d of resp?.docs || []) {
            if (d?._id != null && d?._source != null) m.set(String(d._id), d._source);
          }
          return m;
        };
        const [srcSources, dstSources] = await Promise.all([
          sourcesOf(await sourceCall(conn, '/' + enc(sourceIndex) + '/_mget', 'POST', idsBody)),
          sourcesOf(await host('/' + enc(destIndex) + '/_mget', 'POST', idsBody)),
        ]);
        for (const id of ids) {
          if (!dstSources.has(id)) {
            missingTotal++;
            if (missingInDest.length < VERIFY_DETAIL_LIMIT) missingInDest.push(id);
            continue;
          }
          const srcSource = srcSources.get(id) ?? null;
          for (const f of projection) if (pickPath(srcSource, f) != null) projectionSeen.add(f);
          const a = await planDigestOf(canonicalJson(projectSource(srcSource)));
          const b = await planDigestOf(canonicalJson(projectSource(dstSources.get(id))));
          if (a === b) matched++;
          else {
            mismatchTotal++;
            if (mismatched.length < VERIFY_DETAIL_LIMIT) mismatched.push({ id, reason: 'content_mismatch' });
          }
        }
        for (const f of projection) {
          if (!projectionSeen.has(f)) warnings.push('投影字段 ' + f + ' 在源样本中均未出现（请检查字段名）');
        }
      }
    } catch (e: any) {
      warnings.push('样本对比请求失败: ' + String(e?.message || e));
      sampleOk = false;
      checked = 0; matched = 0; missingTotal = 0; mismatchTotal = 0;
      missingInDest.length = 0; mismatched.length = 0;
    }
  }
  /* 可选 terms 聚合对比（agg 名 eq_verify，对齐服务端）：按桶 key 集差与计数差判 match；
   * 请求失败如实告警并置 aggOk=false（→ INCONCLUSIVE，不冒充对比过） */
  let aggregation: any = null;
  let aggOk = true;
  if (aggField && sourceCount != null && destCount != null) {
    try {
      const aggBody = JSON.stringify({ size: 0, aggs: { eq_verify: { terms: { field: aggField, size: aggSize } } } });
      const [srcAgg, dstAgg] = await Promise.all([
        sourceCall(conn, '/' + enc(sourceIndex) + '/_search', 'POST', aggBody),
        host('/' + enc(destIndex) + '/_search', 'POST', aggBody),
      ]);
      const bucketsOf = (resp: any): Array<{ key: string; count: number }> =>
        (resp?.aggregations?.eq_verify?.buckets || []).map((b: any) => ({ key: String(b.key), count: Number(b.doc_count) || 0 }));
      const sourceBuckets = bucketsOf(srcAgg);
      const destBuckets = bucketsOf(dstAgg);
      const srcCounts = new Map(sourceBuckets.map(b => [b.key, b.count]));
      const dstCounts = new Map(destBuckets.map(b => [b.key, b.count]));
      const onlyInSource = sourceBuckets.filter(b => !dstCounts.has(b.key)).map(b => ({ key: b.key, count: b.count }));
      const onlyInDest = destBuckets.filter(b => !srcCounts.has(b.key)).map(b => ({ key: b.key, count: b.count }));
      const countDiffs = sourceBuckets
        .filter(b => dstCounts.has(b.key) && dstCounts.get(b.key) !== b.count)
        .map(b => ({ key: b.key, sourceCount: b.count, destCount: dstCounts.get(b.key) }));
      aggregation = {
        field: aggField, requestedSize: aggSize,
        match: onlyInSource.length === 0 && onlyInDest.length === 0 && countDiffs.length === 0,
        sourceBuckets, destBuckets, onlyInSource, onlyInDest, countDiffs,
      };
    } catch (e: any) {
      warnings.push('聚合对比请求失败: ' + String(e?.message || e));
      aggOk = false;
      aggregation = null;
    }
  }
  /* verdict（判定用全量计数，回显才截断）：count 未知或样本/聚合取数失败 → INCONCLUSIVE；
   * 总数一致 + 样本无缺无错配 + 聚合（若做）match → EQUIVALENT（双 0 时样本恒空、
   * countsMatch=true，自然落 EQUIVALENT）；其余 DIVERGENT */
  const inconclusive = countsMatch == null || !sampleOk || (aggField != null && !aggOk);
  const equivalent = countsMatch === true && missingTotal === 0 && mismatchTotal === 0
    && (aggregation == null || aggregation.match === true);
  const verdict = inconclusive ? 'INCONCLUSIVE' : equivalent ? 'EQUIVALENT' : 'DIVERGENT';
  /* 验证结论落作业事件线（仅 jobId 形态——显式传参无台账归属不落）：VERIFY 事件带
   * verdict + 双侧计数 + 样本匹配摘要；DIVERGENT 记 error / INCONCLUSIVE 记 warn */
  if (jobId && jobDoc) {
    const verdictZhText = verdict === 'EQUIVALENT' ? '等价' : verdict === 'DIVERGENT' ? '有分歧' : '无法判定';
    const fmtC = (v: number | null) => v == null ? '计数未知' : String(v);
    const parts = [
      '等价验证 ' + verdictZhText + '（' + verdict + '）',
      '源 ' + fmtC(sourceCount) + ' / 目标 ' + fmtC(destCount),
    ];
    if (checked > 0) parts.push('样本匹配 ' + matched + '/' + checked);
    pushEvent(jobDoc, 'VERIFY', parts.join('，'),
      verdict === 'DIVERGENT' ? 'error' : verdict === 'INCONCLUSIVE' ? 'warn' : 'info');
    putJob(jobDoc);
  }
  return {
    source: { index: sourceIndex, count: sourceCount },
    dest: { index: destIndex, count: destCount, destConnId },
    countsMatch,
    sample: {
      requested: sampleSize, checked, matched,
      missingInDest,
      mismatched,
      missingTruncated: missingTotal > missingInDest.length,
      mismatchTruncated: mismatchTotal > mismatched.length,
    },
    aggregation,
    verdict,
    warnings,
  };
}

/* ---------------- 纯结构等价性验证（verify_equivalence structureOnly=true） ----------------
 * 双侧 settings/mappings 各取 canonical（键全层排序）SHA-256 前 16 hex 摘要对比；
 * 单侧读取失败（含索引不存在）记 warning 并判 INCONCLUSIVE（摘要 null 如实回显，
 * 不冒充等价/分化）。差异清单在 DIVERGENT 时逐键呈报（settings 平铺键 + mapping
 * 字段路径，≤20 上限 + truncated），与 Java verifyStructureEquivalence 同构。 */
async function verifyStructureEquivalence(
  host: HostCall, conn: any,
  sourceIndex: string, destIndex: string, destConnId: string | null, warnings: string[],
): Promise<any> {
  if (!globalThis.crypto?.subtle) {
    warnings.push('当前环境无 crypto.subtle，内容摘要降级为确定性非加密 hash（同输入同输出，仅用于等价比对）');
  }
  /* 单侧 settings+mappings 顺序读取：settings 成功 mapping 失败时保留已得值（摘要如实
     覆盖半结构），整体失败记 warning 判 INCONCLUSIVE */
  let srcSettings: Record<string, any> | null = null;
  let srcMappings: any = null;
  try {
    srcSettings = syncFlatSettings(await sourceCall(conn, '/' + enc(sourceIndex) + '/_settings?flat_settings=true'));
    for (const key of SYNC_VOLATILE_SETTINGS) delete srcSettings[key];
    srcMappings = syncMappingBody(Object.values<any>(await sourceCall(conn, '/' + enc(sourceIndex) + '/_mapping') || {})[0]);
  } catch (e: any) {
    warnings.push('源索引结构读取失败 [' + sourceIndex + ']: ' + String(e?.message || e));
  }
  let dstSettings: Record<string, any> | null = null;
  let dstMappings: any = null;
  try {
    dstSettings = syncFlatSettings(await host('/' + enc(destIndex) + '/_settings?flat_settings=true'));
    for (const key of SYNC_VOLATILE_SETTINGS) delete dstSettings[key];
    dstMappings = syncMappingBody(Object.values<any>(await host('/' + enc(destIndex) + '/_mapping') || {})[0]);
  } catch (e: any) {
    warnings.push('目标索引结构读取失败 [' + destIndex + ']: ' + String(e?.message || e));
  }
  const digestOf = async (settings: Record<string, any> | null, mappings: any): Promise<string | null> =>
    settings == null ? null : planDigestOf(canonicalJson({ settings, mappings }));
  const srcDigest = await digestOf(srcSettings, srcMappings);
  const dstDigest = await digestOf(dstSettings, dstMappings);
  const structuresMatch = srcDigest != null && srcDigest === dstDigest;
  const verdict = srcDigest == null || dstDigest == null ? 'INCONCLUSIVE' : structuresMatch ? 'EQUIVALENT' : 'DIVERGENT';
  const differences: string[] = [];
  let truncated = false;
  if (structuresMatch) {
    // 摘要一致：无差异清单
  } else if (srcSettings != null && dstSettings != null) {
    for (const key of [...new Set([...Object.keys(srcSettings), ...Object.keys(dstSettings)])].sort()) {
      if (!deepSettingEq(srcSettings[key], dstSettings[key])) differences.push('settings.' + key);
    }
    const srcFields = new Map<string, Record<string, any>>();
    collectFieldSemantics(propsOf(srcMappings), '', srcFields);
    const dstFields = new Map<string, Record<string, any>>();
    collectFieldSemantics(propsOf(dstMappings), '', dstFields);
    const sameSemantic = (a: Record<string, any> | undefined, b: Record<string, any> | undefined): boolean =>
      a === b || (a != null && b != null
        && Object.keys(a).length === Object.keys(b).length
        && Object.keys(a).every(k => k in b && deepSettingEq(a[k], b[k])));
    for (const path of [...new Set([...srcFields.keys(), ...dstFields.keys()])].sort()) {
      if (!sameSemantic(srcFields.get(path), dstFields.get(path))) differences.push('mappings.' + path);
    }
    if (differences.length > VERIFY_DETAIL_LIMIT) {
      truncated = true;
      differences.length = VERIFY_DETAIL_LIMIT;
    }
  }
  return {
    structureOnly: true,
    verdict,
    structuresMatch: srcDigest == null || dstDigest == null ? null : structuresMatch,
    source: { index: sourceIndex, structureDigest: srcDigest },
    dest: { index: destIndex, destConnId, structureDigest: dstDigest },
    differences,
    truncated,
    warnings,
  };
}

/* ---------------- 运行中作业调速（throttle） ----------------
 * 浏览器 xmigrate 作业为本页内的 scroll+bulk 循环（无 _reindex task），调速真实生效：
 * 限速按批粒度（每秒窗口 ≤ rps 条，窗口满睡到窗尾）。rps=-1 恢复不限速；0 与小于 -1
 * 均非法（对齐 adhoc throttle 的防误填口径）。仅本页 RUNNING 作业可调——页面关闭后作业
 * 已中断（INTERRUPTED），调速无意义，如实报错。 */
export async function throttleJob(jobId: string, rps: number): Promise<{ ok: boolean; jobId: string; rps: number; appliedAt: number }> {
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (j.status !== 'RUNNING' || !activeJobs.has(jobId)) {
    throw new Error('作业不在本页运行中，无法调速（页面关闭后作业已中断，请重新发起或续跑）: ' + jobId);
  }
  const v = Number(rps);
  if (!Number.isFinite(v)) throw new Error('rps 需为数字（-1 恢复不限速）');
  if (v === 0) throw new Error('rps 不得为 0：不限速请传 -1');
  if (v < -1) throw new Error('rps 不得小于 -1：不限速请传 -1');
  const applied = v;
  THROTTLE_RPS.set(jobId, applied);
  j.throttleRps = applied > 0 ? applied : null;
  pushEvent(j, 'THROTTLE', applied > 0 ? '调速为 ' + applied + ' docs/s（批粒度限速）' : '恢复不限速');
  putJob(j);
  return { ok: true, jobId, rps: applied, appliedAt: Date.now() };
}
