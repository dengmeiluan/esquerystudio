/* 纯浏览器模式的托管重建：页面内编排 + 本机作业存储。
 * 有服务端时这套编排由 Java worker 完成；没有服务端时，用 ES 原生 _reindex / _tasks /
 * _aliases 组合完成同一件事。浏览器模式没有跨实例锁，作业会如实标记 lockActive=false。 */
import { writeStoredRaw } from '../utils/safeJson';

export type EsCall = (path: string, method?: string, body?: string) => Promise<any>;

const JOBS_KEY = 'esquerystudio.adhoc.jobs';
const POLL_MS = 2000;
let esCall: EsCall | null = null;
let timer: any = null;

function enc(v: string): string { return encodeURIComponent(v); }

function jobs(): any[] {
  try { const a = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function saveJobs(list: any[]): void {
  writeStoredRaw(localStorage, JOBS_KEY, JSON.stringify(list.slice(0, 50)));
}
function putJob(job: any): any {
  const list = jobs();
  const i = list.findIndex(j => j.jobId === job.jobId);
  if (i >= 0) list[i] = job; else list.unshift(job);
  saveJobs(list);
  return job;
}
function jitterName(base: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (base.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 180)
    + '-rebuild-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())).slice(0, 255);
}
function flatten(node: any, prefix: string, out: Record<string, string>): void {
  for (const [k, v] of Object.entries<any>(node || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (v !== undefined && v !== null) out[key] = String(v);
  }
}
function cleanedSettings(settings: any): string {
  const flat: Record<string, string> = {};
  flatten(settings, '', flat);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) {
    const key = k.replace(/^index\./, '');
    if (/^(uuid|creation_date|provided_name|version\.|resize\.|history\.|verified_before_close)/.test(key)) continue;
    out[key] = v;
  }
  return JSON.stringify(out, null, 2);
}
function propsOf(mapping: any): any {
  if (!mapping) return {};
  if (mapping.properties) return mapping.properties;
  if (mapping.mappings?.properties) return mapping.mappings.properties;
  const only: any = Object.values(mapping)[0];
  return only?.mappings?.properties || only?.properties || {};
}
function dateFields(props: any, prefix = '', out: string[] = []): string[] {
  for (const [name, def] of Object.entries<any>(props || {})) {
    const path = prefix ? prefix + '.' + name : name;
    if (String(def?.type).startsWith('date')) out.push(path);
    if (def?.properties) dateFields(def.properties, path, out);
  }
  return out;
}
function jobMap(j: any): any {
  return { ...j, tookMs: j.finishedAt ? j.finishedAt - j.startedAt : -1 };
}

export async function adhocPrepare(es: EsCall, index: string): Promise<any> {
  if (!index.trim()) throw new Error('index 不能为空');
  esCall = es;
  let isAlias = false;
  let physicals: string[] = [];
  try {
    const a = await es('/_alias/' + enc(index));
    isAlias = Object.values<any>(a || {}).some(v => v?.aliases?.[index]);
    physicals = isAlias ? Object.keys(a) : [];
  } catch { /* 不是别名 */ }
  let source = index;
  if (isAlias) {
    source = '';
    for (const [idx, v] of Object.entries<any>(await es('/_alias/' + enc(index)))) {
      if (v?.aliases?.[index]?.is_write_index) source = idx;
    }
    if (!source) source = physicals[0] || '';
    if (!source) throw new Error('别名 ' + index + ' 无法确定唯一 write 物理索引，请先在别名管理中修正');
  }
  const mappingRaw = await es('/' + enc(source) + '/_mapping');
  let mapping: any = {};
  for (const v of Object.values<any>(mappingRaw || {})) { mapping = v?.mappings || {}; break; }
  const settingsRaw = await es('/' + enc(source) + '/_settings?flat_settings=true');
  let settings: any = {};
  for (const v of Object.values<any>(settingsRaw || {})) { settings = v?.settings || {}; break; }
  const count = await es('/' + enc(source) + '/_count', 'POST', '{"query":{"match_all":{}}}');
  return {
    index, isAlias, physicals, sourcePhysical: source,
    settingsJson: cleanedSettings(settings), mappingJson: JSON.stringify({ properties: propsOf(mapping) }, null, 2),
    docCount: Number(count?.count || 0), suggestedDest: jitterName(index),
    timeFieldCandidates: dateFields(propsOf(mapping)),
  };
}

async function destCount(j: any): Promise<number> {
  try { const c = await esCall!('/' + enc(j.destPhysical) + '/_count', 'POST', '{"query":{"match_all":{}}}'); return Number(c?.count || 0); }
  catch { return 0; }
}

async function releaseWriteBlock(j: any): Promise<void> {
  if (j.strategy !== 'WRITE_BLOCK' || j.writeBlocked !== true) return;
  try { await esCall!('/' + enc(j.sourcePhysical) + '/_settings', 'PUT', '{"index":{"blocks":{"write":false}}}'); } catch { /* 尽量恢复 */ }
  j.writeBlocked = false;
}

async function switchAlias(j: any): Promise<void> {
  const actions: any[] = [];
  if (j.aliasMode) {
    actions.push({ remove: { index: j.sourcePhysical, alias: j.logicalName } });
    actions.push({ add: { index: j.destPhysical, alias: j.logicalName, is_write_index: true } });
  }
  if (actions.length) await esCall!('/_aliases', 'POST', JSON.stringify({ actions }));
  if (j.deleteOldIndex && j.sourcePhysical !== j.destPhysical) {
    try { await esCall!('/' + enc(j.sourcePhysical), 'DELETE'); } catch { /* 留下旧索引不掩盖成功 */ }
  }
  await releaseWriteBlock(j);
  j.stage = 'DONE'; j.status = 'SUCCEEDED'; j.finishedAt = Date.now();
  j.awaitConfirmSince = null;
  j.switchedWithoutLock = true;
  j.report = {
    hint: '浏览器模式完成：数据经 ES _reindex 迁入 ' + j.destPhysical + (j.aliasMode ? '，别名已原子切换；无跨实例锁' : '；直连索引模式未自动删源'),
    searched: j.total || 0, created: j.created || 0, updated: j.updated || 0,
  };
  putJob(j);
}

async function refreshJob(j: any): Promise<any> {
  if (!esCall || j.status !== 'RUNNING') return j;
  if (j.stage === 'AWAIT_CONFIRM') return j;
  if (!j.currentTaskId) { j.status = 'FAILED'; j.error = '缺少 _reindex task id'; putJob(j); return j; }
  try {
    const t = await esCall('/_tasks/' + encodeURIComponent(j.currentTaskId) + '?wait_for_completion=false');
    const st = t?.task?.status || {};
    j.total = Number(st.total ?? j.total ?? j.sourceDocCount ?? 0);
    j.created = Number(st.created ?? j.created ?? 0);
    j.updated = Number(st.updated ?? j.updated ?? 0);
    j.destDocCount = j.created + j.updated;
    j.currentProgress = { total: j.total, created: j.created, updated: j.updated };
    j.stage = t?.completed ? 'FINALIZE' : 'FULL_REINDEX';
    putJob(j);
    if (t?.completed) {
      if (j.pauseBeforeSwitch && j.aliasMode) {
        j.stage = 'AWAIT_CONFIRM'; j.status = 'RUNNING'; j.awaitConfirmSince = Date.now(); putJob(j);
      } else {
        await switchAlias(j);
      }
    }
  } catch {
    /* task 可能已完成并从 _tasks 消失：用目标文档数判定 */
    const n = await destCount(j);
    if (n >= Number(j.sourceDocCount || 0)) {
      j.destDocCount = n; j.created = n;
      if (j.pauseBeforeSwitch && j.aliasMode) { j.stage = 'AWAIT_CONFIRM'; j.awaitConfirmSince = Date.now(); putJob(j); }
      else await switchAlias(j);
    } else {
      j.status = 'FAILED'; j.error = '无法读取 _reindex 任务，且目标文档数不足'; j.finishedAt = Date.now(); putJob(j);
    }
  }
  return j;
}

export async function adhocStart(es: EsCall, req: any): Promise<any> {
  esCall = es;
  const prep = await adhocPrepare(es, req.index);
  if (!prep.isAlias && !req.confirmDirectSwap) throw new Error('直连索引重建需确认直接切换风险');
  const dest = String(req.destIndex || prep.suggestedDest).trim();
  if (!dest || dest === prep.sourcePhysical) throw new Error('目标索引名非法或与源相同');
  if (jobs().some(j => j.status === 'RUNNING' && j.logicalName === req.index)) throw new Error('该索引已有运行中的重建作业');
  const settings = (() => { try { return JSON.parse(req.settingsJson || prep.settingsJson || '{}'); } catch { return {}; } })();
  const mapping = (() => { try { return JSON.parse(req.mappingJson || prep.mappingJson || '{}'); } catch { return {}; } })();
  await es('/' + enc(dest), 'PUT', JSON.stringify({ settings, mappings: { properties: propsOf(mapping) } }));
  const j: any = {
    jobId: 'adhoc-' + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join(''),
    logicalName: req.index, strategy: String(req.strategy || 'INCREMENTAL'), aliasMode: prep.isAlias,
    sourcePhysical: prep.sourcePhysical, destPhysical: dest, timeField: req.timeField || null,
    bufferMs: Number(req.bufferMs || 120000), deleteOldIndex: !!req.deleteOldIndex,
    pauseBeforeSwitch: !!req.pauseBeforeSwitch,
    targetId: 'browser', targetName: 'browser', targetEsVersion: '',
    ownerUsername: 'browser', ownerRole: 'ADMIN', ownerLegacy: false,
    awaitConfirmSince: null, gateOutcome: null, switchedWithoutLock: false, lockActive: false,
    stage: 'CREATE_DEST', status: 'RUNNING', error: null, currentTaskId: null,
    startedAt: Date.now(), finishedAt: null, sourceDocCount: prep.docCount, destDocCount: 0,
    currentProgress: { total: prep.docCount, created: 0, updated: 0 },
    total: prep.docCount, created: 0, updated: 0, rounds: [], report: null,
  };
  putJob(j);
  try {
    if (j.strategy === 'WRITE_BLOCK') {
      j.stage = 'WRITE_BLOCK';
      await es('/' + enc(j.sourcePhysical) + '/_settings', 'PUT', '{"index":{"blocks":{"write":true}}}');
      j.writeBlocked = true;
    }
    j.stage = 'FULL_REINDEX';
    const rr = await es('/_reindex?wait_for_completion=false&slices=auto&refresh=true', 'POST', JSON.stringify({ source: { index: j.sourcePhysical }, dest: { index: dest } }));
    j.currentTaskId = typeof rr?.task === 'string' ? rr.task : null;
    putJob(j);
    ensurePoller();
    return { jobId: j.jobId, job: jobMap(j) };
  } catch (e: any) {
    await releaseWriteBlock(j);
    try { await es('/' + enc(dest), 'DELETE'); } catch { /* ignore */ }
    j.status = 'FAILED'; j.stage = 'DONE'; j.error = String(e?.message || e); j.finishedAt = Date.now(); putJob(j);
    throw e;
  }
}

export async function adhocStatus(es: EsCall, jobId: string): Promise<any> {
  esCall = es;
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  ensurePoller();
  return jobMap(await refreshJob(j));
}

export function adhocLocalJobs(): any[] { return jobs(); }

export async function adhocJobs(es: EsCall): Promise<any[]> {
  esCall = es;
  ensurePoller();
  for (const j of jobs()) if (j.status === 'RUNNING') await refreshJob(j);
  return jobs().map(jobMap).sort((a, b) => b.startedAt - a.startedAt);
}

export async function adhocAbort(es: EsCall, jobId: string): Promise<any> {
  esCall = es;
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (j.currentTaskId) { try { await es('/_tasks/' + encodeURIComponent(j.currentTaskId) + '/_cancel', 'POST'); } catch { /* task 已结束 */ } }
  try { await es('/' + enc(j.destPhysical), 'DELETE'); } catch { /* 目标可能不存在 */ }
  await releaseWriteBlock(j);
  j.status = 'ABORTED'; j.stage = 'DONE'; j.finishedAt = Date.now(); j.error = null; putJob(j);
  return jobMap(j);
}

export async function adhocConfirm(es: EsCall, jobId: string): Promise<any> {
  esCall = es;
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (j.stage !== 'AWAIT_CONFIRM') throw new Error('作业未处于待确认状态');
  j.gateOutcome = 'CONFIRMED';
  j.awaitConfirmSince = null;
  await switchAlias(j);
  return jobMap(j);
}

function ensurePoller(): void {
  if (timer) return;
  timer = setInterval(() => {
    for (const j of jobs()) if (j.status === 'RUNNING' && j.stage !== 'AWAIT_CONFIRM') void refreshJob(j);
  }, POLL_MS);
}
