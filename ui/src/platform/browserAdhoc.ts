/* 纯浏览器模式的托管重建：页面内编排 + 本机作业存储。
 * 有服务端时这套编排由 Java worker 完成；没有服务端时，用 ES 原生 _reindex / _tasks /
 * _aliases 组合完成同一件事。浏览器模式没有跨实例锁，作业会如实标记 lockActive=false。 */
import { writeStoredRaw } from '../utils/safeJson';

export type EsCall = (path: string, method?: string, body?: string) => Promise<any>;

const JOBS_KEY = 'esquerystudio.adhoc.jobs';
const POLL_MS = 2000;
/* 追平收敛口径与服务端 AdhocRebuildService 同构：最多 3 轮，单轮新增 <50 提前收敛 */
const MAX_CATCHUP_ROUNDS = 3;
const CATCHUP_CONVERGE_THRESHOLD = 50;
/* 确认门超时与服务端默认一致：进 AWAIT_CONFIRM 时刻 + 30 分钟，超时自动解除挡写、不执行切换 */
const GATE_TIMEOUT_MS = 30 * 60 * 1000;
/* refreshJob 重入保护：完成态处理含「提交下一轮 task」副作用，并发进入会重复提交 */
const refreshingJobs = new Set<string>();
/* adhocRetry 重入保护：重跑含取消旧 task / 探活 / 重发 reindex 多个网络步骤，
 * 双击或并发重跑会重复提交写请求（同 refreshingJobs 写法） */
const retryingJobs = new Set<string>();
/* _tasks 连续读取失败容忍上限：2s 轮询 × 5 ≈ 10s 才判死，期间作业保持 RUNNING
 * 并标注 degraded=true（UI 可显示「联系 ES 暂失」，读取恢复即清除） */
const TASK_READ_FAIL_LIMIT = 5;
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
  /* 与服务端 suggestDest 同构：先剥净历史重建代后缀（源可能是 ..._adhoc_yyyyMMddHHmmss
     的旧产物，不剥则每重建一代名字叠一层），再拼 {基名}_adhoc_{yyyyMMddHHmmss}；清洗/截断口径保留 */
  let stem = base;
  while (true) {
    const stripped = stem.replace(/_adhoc_\d{8,14}$/, '');
    if (stripped.length === stem.length) break;
    stem = stripped;
  }
  return (stem.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 180)
    + '_adhoc_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())).slice(0, 255);
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
  return { ...j, gateDeadlineMs: j.gateDeadlineMs ?? null, tookMs: j.finishedAt ? j.finishedAt - j.startedAt : -1 };
}

export async function adhocPrepare(es: EsCall, index: string): Promise<any> {
  if (!index.trim()) throw new Error('index 不能为空');
  esCall = es;
  let isAlias = false;
  let physicals: string[] = [];
  let aliasResp: any = null;
  try {
    aliasResp = await es('/_alias/' + enc(index));
    isAlias = Object.values<any>(aliasResp || {}).some(v => v?.aliases?.[index]);
    physicals = isAlias ? Object.keys(aliasResp) : [];
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
  /* 源物理索引所属别名列表（与服务端 prepare 的 memberAliases 同口径）。删除物理索引
     会连带断开其所属别名的成员关系，业务侧查询将失效——向导警示与直连安全门共用；
     反查失败容忍回空列表（信息透出，真门禁在 adhocStart 重查）。直连模式复用上面的
     首次 _alias 响应（source 即 index），别名模式对 write 物理索引再查一次。 */
  let memberAliases: string[] = [];
  const respForSource = isAlias ? await es('/_alias/' + enc(source)).catch(() => null) : aliasResp;
  memberAliases = Object.keys(respForSource?.[source]?.aliases || {});
  const mappingRaw = await es('/' + enc(source) + '/_mapping');
  let mapping: any = {};
  for (const v of Object.values<any>(mappingRaw || {})) { mapping = v?.mappings || {}; break; }
  const settingsRaw = await es('/' + enc(source) + '/_settings?flat_settings=true');
  let settings: any = {};
  for (const v of Object.values<any>(settingsRaw || {})) { settings = v?.settings || {}; break; }
  const count = await es('/' + enc(source) + '/_count', 'POST', '{"query":{"match_all":{}}}');
  return {
    index, isAlias, physicals, sourcePhysical: source, memberAliases,
    settingsJson: cleanedSettings(settings), mappingJson: JSON.stringify({ properties: propsOf(mapping) }, null, 2),
    docCount: Number(count?.count || 0), suggestedDest: jitterName(index),
    timeFieldCandidates: dateFields(propsOf(mapping)),
  };
}

async function destCount(j: any): Promise<number> {
  try { const c = await esCall!('/' + enc(j.destPhysical) + '/_count', 'POST', '{"query":{"match_all":{}}}'); return Number(c?.count || 0); }
  catch { return 0; }
}
/* 删源前探活：目标索引必须可查（_count 成功返回）才允许删旧索引——直连模式下删源后
 * 没有别名指路，dest 已死再删源等于业务断链；别名模式同样以此兜底 */
async function destAlive(j: any): Promise<boolean> {
  try {
    const c = await esCall!('/' + enc(j.destPhysical) + '/_count', 'POST', '{"query":{"match_all":{}}}');
    return Number(c?.count) >= 0;
  } catch { return false; }
}

async function releaseWriteBlock(j: any): Promise<void> {
  if (j.strategy !== 'WRITE_BLOCK' || j.writeBlocked !== true) return;
  try { await esCall!('/' + enc(j.sourcePhysical) + '/_settings', 'PUT', '{"index":{"blocks":{"write":false}}}'); } catch { /* 尽量恢复 */ }
  j.writeBlocked = false;
}

/* _reindex 提交路径：slices 缺省 auto，自定义正整数用该值（全量/追平/终追均异步 task） */
function reindexPath(j: any): string {
  const slices = Number(j.slices) > 0 ? String(Number(j.slices)) : 'auto';
  return '/_reindex?wait_for_completion=false&slices=' + slices + '&refresh=true';
}
function applyRps(j: any, body: any): void {
  if (Number(j.requestsPerSecond) > 0) body.requests_per_second = Number(j.requestsPerSecond);
}
/* 轮次账本：label 口径 full/catchup-N/final；round/phase 补齐服务端 rounds 表格字段 */
function pushRound(j: any, round: number, phase: string, label: string, st: any, tookMs: number): void {
  j.rounds.push({
    round, phase, label, tookMs, ts: Date.now(),
    total: Number(st?.total ?? 0), created: Number(st?.created ?? 0), updated: Number(st?.updated ?? 0),
    versionConflicts: Number(st?.version_conflicts ?? 0),
  });
}
/* 每轮 task 的 status 从 0 重新计数：先快照累计值，展示口径 = 累计 + 当前轮 */
function snapshotRoundBase(j: any): void {
  j.roundBase = { total: j.total || 0, created: j.created || 0, updated: j.updated || 0 };
}
/* 追平轮 body 与服务端 rangeReindex 同构（createOnly 二态）：
 * 切换前追平 createOnly=false——dest 不放 op_type（覆盖式），窗口内被更新的旧文档以新版本
 * 覆盖进 dest，否则多轮追平+终追都冲突跳过、更新永久丢失；
 * 仅切换后终追 createOnly=true 放 op_type=create——不覆盖切换后写入 dest 的新版本。 */
function catchupBody(j: any, fromMs: number, createOnly: boolean): any {
  const body: any = {
    conflicts: 'proceed',
    source: {
      index: j.sourcePhysical,
      query: { range: { [j.timeField]: { gte: new Date(fromMs).toISOString() } } },
    },
    dest: { index: j.destPhysical },
  };
  if (createOnly) body.dest.op_type = 'create';
  applyRps(j, body);
  if (Number(j.batchSize) > 0) body.size = Number(j.batchSize);
  return body;
}
async function submitCatchup(j: any): Promise<void> {
  if (casLost(j)) return; /* 另一标签页已接管：放弃提交下一轮 */
  j.catchupRound = (j.catchupRound || 0) + 1;
  j.catchupRoundStart = Date.now();
  snapshotRoundBase(j);
  j.stage = 'CATCHUP';
  const rr = await esCall!(reindexPath(j), 'POST', JSON.stringify(catchupBody(j, j.catchupBaseMs, false)));
  j.currentTaskId = typeof rr?.task === 'string' ? rr.task : null;
  putJob(j);
}
/* 追平全部收敛后、切换前的确认门。直连模式同样停门：直连+删除旧索引的组合若静默
 * 直切，删除后没有任何别名指路，业务立即断链——必须等人确认（确认侧探活 dest 才放行删除）。
 * 门带 30 分钟截止（gateDeadlineMs，与服务端默认一致），超时自动解除挡写、不执行切换。 */
async function gateOrSwitch(j: any): Promise<void> {
  if (j.pauseBeforeSwitch) {
    j.stage = 'AWAIT_CONFIRM'; j.status = 'RUNNING';
    j.awaitConfirmSince = Date.now();
    j.gateDeadlineMs = j.awaitConfirmSince + GATE_TIMEOUT_MS;
    putJob(j);
  } else {
    await switchAlias(j);
  }
}
/* 门超时收尾（与服务端同语义）：写阻断自动解除、别名切换不执行，作业按失败落终态；
 * 目标索引保留，可经 retry 重跑 */
async function gateTimeout(j: any): Promise<void> {
  if (j.status !== 'RUNNING' || j.stage !== 'AWAIT_CONFIRM') return;
  await releaseWriteBlock(j);
  j.gateOutcome = 'TIMED_OUT';
  j.status = 'FAILED'; j.stage = 'DONE'; j.finishedAt = Date.now();
  j.error = '确认门超时（30 分钟）：已自动解除写阻断，未执行切换';
  j.report = { hint: '确认门超时：写阻断已自动解除、别名切换未执行；目标索引保留，可点「重跑」重新发起' };
  j.awaitConfirmSince = null;
  putJob(j);
}
/* 收尾报告：计数 + MANUAL 回补 DSL 建议（口径对齐服务端 buildReport）。
 * delOutcome 如实描述旧索引处置：deleted 已删 / kept 未选删除 / skipped 探活失败拒绝删 /
 * delete-failed 删除请求失败——hint 与实际行为精确对齐，不伪成功。
 * protectOutcome 描述保留旧索引（kept）时的写保护结果：protected 已加 blocks.write=true /
 * protect-failed 设置失败（如实说明未加上）/ null 不适用（MANUAL 保持旧索引可写） */
function buildReport(j: any, finalCatchupFailed: boolean, delOutcome: 'deleted' | 'kept' | 'skipped' | 'delete-failed', protectOutcome: 'protected' | 'protect-failed' | null = null): any {
  let hint = '浏览器模式完成：数据经 ES _reindex 迁入 ' + j.destPhysical;
  if (j.aliasMode) {
    hint += delOutcome === 'deleted' ? '，别名已原子切换，旧索引已按选项删除'
      : delOutcome === 'skipped' ? '，别名已原子切换；目标索引探活失败，旧索引 ' + j.sourcePhysical + ' 已保留，请人工确认目标索引可查后再删'
        : delOutcome === 'delete-failed' ? '，别名已原子切换；旧索引删除请求失败，已保留'
          : '，别名已原子切换，旧索引保留在别名内只读';
    if (delOutcome === 'kept') {
      hint += protectOutcome === 'protected' ? '（已加写保护 blocks.write=true，防残余直写旧物理名）'
        : protectOutcome === 'protect-failed' ? '；写保护设置失败：旧索引未加上 blocks.write=true，请人工确认无残余直写'
          : '（MANUAL 策略保留旧索引可写，未加写保护）';
    }
  } else {
    hint += delOutcome === 'deleted' ? '；直连模式已按选项删除旧索引 ' + j.sourcePhysical
      : delOutcome === 'skipped' ? '；目标索引探活失败，旧索引 ' + j.sourcePhysical + ' 已保留（直连模式删除后无别名指路，确认目标可查前不删）'
        : delOutcome === 'delete-failed' ? '；旧索引删除请求失败，已保留'
          : '；直连索引模式未自动删源';
  }
  hint += '；无跨实例锁';
  const r: any = { hint, searched: j.total || 0, created: j.created || 0, updated: j.updated || 0 };
  if (j.strategy === 'MANUAL') {
    if (j.timeField) {
      r.suggestedBackfillDsl = 'POST _reindex\n{\n  "conflicts": "proceed",\n  "source": {\n    "index": "'
        + j.sourcePhysical + '",\n    "query": { "range": { "' + j.timeField + '": { "gte": '
        + JSON.stringify(new Date(j.startedAt - j.bufferMs).toISOString())
        + ' } } }\n  },\n  "dest": { "index": "' + j.destPhysical + '", "op_type": "create" }\n}';
      r.hint = hint + '。MANUAL 策略未自动追平：切换期间写入旧索引的增量需回补，切换后按时间窗执行建议 DSL（op_type=create 不会覆盖切换后写入的新版本）';
    } else {
      r.hint = hint + '。MANUAL 策略且无时间字段：请按业务主键自行核对切换期间的增量并回补';
    }
  }
  if (finalCatchupFailed) {
    r.finalCatchupFailed = true;
    r.hint += '；切换后终追失败需人工核对';
  }
  return r;
}
/* 并发收尾尊严守卫：adhocAbort / gateTimeout 可能与本编排的 await 间隙并发落终态
 * （ABORTED，或确认门超时的 FAILED+TIMED_OUT），之后任何收尾覆写（置 SUCCEEDED/
 * 删旧索引/提交新 task/执行切换）都不再执行——盘上已非 RUNNING 或门已判 TIMED_OUT 即拦 */
function abortedOnDisk(j: any): boolean {
  const d = jobs().find(x => x.jobId === j.jobId);
  return !!d && (d.status !== 'RUNNING' || d.gateOutcome === 'TIMED_OUT');
}
/* 多标签页 CAS 守卫：副作用（提交下一轮 reindex / 切换别名 / 删除源索引）执行前重读
 * 作业存储，currentTaskId 已不是本页签看到的旧值（或记录已被删除）即说明另一标签页
 * 已接管推进——放弃本次副作用且不落盘，避免覆写接管页签写下的状态 */
function casLost(j: any): boolean {
  const d = jobs().find(x => x.jobId === j.jobId);
  return !d || d.currentTaskId !== j.currentTaskId;
}
async function switchAlias(j: any): Promise<void> {
  /* 盘上已被并发收尾（中止/门超时/其他终态）即放弃切换 */
  if (abortedOnDisk(j)) return;
  /* 另一标签页已接管（task 已被轮转）即放弃切换 */
  if (casLost(j)) return;
  const actions: any[] = [];
  if (j.aliasMode) {
    /* 与服务端 switchWriteIndex 同语义的 write-index 原子 swap：
     * 新索引加为 write，旧索引保留在别名内只读（不移出别名） */
    actions.push({ add: { index: j.destPhysical, alias: j.logicalName, is_write_index: true } });
    actions.push({ add: { index: j.sourcePhysical, alias: j.logicalName, is_write_index: false } });
  }
  if (actions.length) await esCall!('/_aliases', 'POST', JSON.stringify({ actions }));
  if (abortedOnDisk(j)) return;
  /* 切换成功是既成事实，先于终追/收尾立即落盘（stage 移出 AWAIT_CONFIRM、清门字段）：
   * 否则后续网络等待的窗口内轮询仍可能按门超时把已切换的作业改判成 FAILED「未执行切换」 */
  if (j.stage === 'AWAIT_CONFIRM') {
    j.stage = (j.strategy === 'INCREMENTAL' && j.timeField) ? 'FINAL_CATCHUP' : 'FINALIZE';
  }
  j.awaitConfirmSince = null;
  j.gateDeadlineMs = null;
  putJob(j);
  /* 切换后终追（INCREMENTAL，与服务端同构）：源索引仍在，把 swap 前最后写入的残余补进来；
   * range 从作业起点起整窗重放，op_type=create + conflicts=proceed 幂等。
   * 异步 task 提交（wait_for_completion=false）+ currentTaskId 轮转：adhocConfirm 不会同步
   * 挂数分钟，进度可轮询，FINAL_CATCHUP 期间 abort 也能经 _cancel 取消。 */
  if (j.strategy === 'INCREMENTAL' && j.timeField) {
    j.stage = 'FINAL_CATCHUP';
    j.finalCatchupStart = Date.now();
    snapshotRoundBase(j);
    let rr: any;
    try {
      rr = await esCall!(reindexPath(j), 'POST', JSON.stringify(catchupBody(j, j.startedAt, true)));
    } catch {
      /* 终追提交失败不回滚到门上：切换已发生，按终追失败口径收尾，报告如实注明需人工核对 */
      await finishJob(j, true);
      return;
    }
    j.currentTaskId = typeof rr?.task === 'string' ? rr.task : null;
    putJob(j);
    return;
  }
  await finishJob(j, false);
}
/* 收尾：按 deleteOldIndex 删旧（此时终追已完，源残余已补齐）→ 旧索引处置 → DONE/收尾报告。
 * 删旧只发生在确认门放行（或用户显式选择不停门）之后；删除前先探活目标索引，
 * 目标不可查则拒绝删除并如实写进报告（宁留旧索引，不造无别名指路的断链）。
 * 旧索引处置（与服务端 FINALIZE 同口径）：别名模式未选删除且非 MANUAL 时给保留的旧
 * 物理索引加 blocks.write=true 只读保护，防残余直写悄悄落旧索引；设置失败如实报
 * 「写保护未加上」，不伪成功。WRITE_BLOCK 挡写中的作业保留旧索引时挡写即保护，不再解除。
 * 删旧/写保护与最终 putJob 的写点前都重读盘上状态，并发收尾已落终态即放弃（收尾尊严）。 */
async function finishJob(j: any, finalCatchupFailed: boolean): Promise<void> {
  if (abortedOnDisk(j)) return;
  let delOutcome: 'deleted' | 'kept' | 'skipped' | 'delete-failed' = 'kept';
  if (j.deleteOldIndex && j.sourcePhysical !== j.destPhysical) {
    /* 删源是破坏性副作用：另一标签页已接管即放弃（含整个收尾，终态由接管页签落） */
    if (casLost(j)) return;
    if (!(await destAlive(j))) {
      delOutcome = 'skipped';
    } else {
      try { await esCall!('/' + enc(j.sourcePhysical), 'DELETE'); delOutcome = 'deleted'; }
      catch { delOutcome = 'delete-failed'; /* 留下旧索引，报告如实说明 */ }
    }
  }
  let protectOutcome: 'protected' | 'protect-failed' | null = null;
  const keepOldReadonly = j.aliasMode && !j.deleteOldIndex && j.strategy !== 'MANUAL' && j.sourcePhysical !== j.destPhysical;
  if (keepOldReadonly) {
    if (j.writeBlocked === true) {
      protectOutcome = 'protected';
    } else {
      try {
        await esCall!('/' + enc(j.sourcePhysical) + '/_settings', 'PUT', '{"index":{"blocks":{"write":true}}}');
        protectOutcome = 'protected';
      } catch {
        protectOutcome = 'protect-failed'; /* 报告如实说明写保护未加上 */
      }
    }
  } else {
    await releaseWriteBlock(j);
  }
  j.stage = 'DONE'; j.status = 'SUCCEEDED'; j.finishedAt = Date.now();
  j.awaitConfirmSince = null;
  j.gateDeadlineMs = null;
  j.switchedWithoutLock = true;
  j.report = buildReport(j, finalCatchupFailed, delOutcome, protectOutcome);
  if (abortedOnDisk(j)) return;
  putJob(j);
}

async function refreshJob(j: any): Promise<any> {
  if (!esCall || j.status !== 'RUNNING') return j;
  if (j.stage === 'AWAIT_CONFIRM') {
    /* 停门期间独立检查截止时刻：超时即按失败收尾并解除挡写（服务端同语义） */
    if (j.gateDeadlineMs && Date.now() > Number(j.gateDeadlineMs)) await gateTimeout(j);
    return j;
  }
  if (refreshingJobs.has(j.jobId)) return j;
  if (!j.currentTaskId) { j.status = 'FAILED'; j.error = '缺少 _reindex task id'; putJob(j); return j; }
  refreshingJobs.add(j.jobId);
  try {
    const t = await esCall('/_tasks/' + encodeURIComponent(j.currentTaskId) + '?wait_for_completion=false');
    /* 读取成功即恢复：连续失败计数与降级标注清零 */
    j.taskReadFails = 0;
    j.degraded = false;
    const st = t?.task?.status || {};
    const base = j.roundBase || { total: 0, created: 0, updated: 0 };
    if (st.total != null) j.total = base.total + Number(st.total);
    if (st.created != null) j.created = base.created + Number(st.created);
    if (st.updated != null) j.updated = base.updated + Number(st.updated);
    j.destDocCount = j.created + j.updated;
    j.currentProgress = { total: j.total, created: j.created, updated: j.updated };
    if (!t?.completed) {
      if (j.stage !== 'FINAL_CATCHUP') j.stage = j.catchupRound > 0 ? 'CATCHUP' : 'FULL_REINDEX';
      putJob(j);
      return j;
    }
    if (j.stage === 'FINAL_CATCHUP') {
      /* 终追 task 完成：落账后收尾；task 带 error（终追失败）不反噬重建成功，report 注明人工核对 */
      pushRound(j, MAX_CATCHUP_ROUNDS + 1, 'FINAL', 'final', st, Date.now() - (j.finalCatchupStart || j.startedAt));
      await finishJob(j, t?.error != null);
      return j;
    }
    if (!j.catchupRound) {
      /* 全量轮完成：落账后按策略分流——INCREMENTAL 且有 timeField 进追平，否则直接过门切换 */
      pushRound(j, 0, 'FULL', 'full', st, Date.now() - j.startedAt);
      if (j.strategy === 'INCREMENTAL' && j.timeField) {
        await submitCatchup(j);
        return j;
      }
      await gateOrSwitch(j);
      return j;
    }
    /* 追平轮完成：受影响文档（created+updated，服务端 affected 口径）<50 或已达轮数上限即收敛；
     * 否则按当前轮完成时刻回退 buffer 再来一轮 */
    pushRound(j, j.catchupRound, 'CATCHUP', 'catchup-' + j.catchupRound, st, Date.now() - (j.catchupRoundStart || j.startedAt));
    const affected = Number(st.created ?? 0) + Number(st.updated ?? 0);
    if (affected < CATCHUP_CONVERGE_THRESHOLD || j.catchupRound >= MAX_CATCHUP_ROUNDS) {
      await gateOrSwitch(j);
    } else {
      j.catchupBaseMs = Date.now() - Number(j.bufferMs || 0);
      await submitCatchup(j);
    }
  } catch {
    /* _tasks 读取失败先按联系 ES 暂失容忍：连续失败计数（2s 轮询 × 5 ≈ 10s）内保持
     * RUNNING 并标注 degraded=true，达到上限才落终态，避免单次抖动误杀活作业 */
    j.taskReadFails = (j.taskReadFails || 0) + 1;
    if (j.stage === 'FINAL_CATCHUP') {
      /* 终追 task 不可读不走 destCount 兜底切换（成败无法确认）：连续达到上限才按
       * 终追失败口径收尾（需人工核对），期间保持 RUNNING + degraded */
      if (j.taskReadFails >= TASK_READ_FAIL_LIMIT) {
        j.degraded = false;
        await finishJob(j, true);
      } else {
        j.degraded = true;
        putJob(j);
      }
      return j;
    }
    /* destCount 兜底判活保留：task 可能已完成并从 _tasks 消失，目标文档数达标即照常推进 */
    const n = await destCount(j);
    if (n >= Number(j.sourceDocCount || 0)) {
      j.destDocCount = n; j.created = n;
      j.taskReadFails = 0; j.degraded = false;
      await gateOrSwitch(j);
    } else if (j.taskReadFails >= TASK_READ_FAIL_LIMIT) {
      j.status = 'FAILED'; j.stage = 'DONE'; j.error = '无法读取 _reindex 任务，且目标文档数不足'; j.finishedAt = Date.now(); j.degraded = false; putJob(j);
    } else {
      j.degraded = true; putJob(j);
    }
  } finally {
    refreshingJobs.delete(j.jobId);
  }
  return j;
}

export async function adhocStart(es: EsCall, req: any): Promise<any> {
  esCall = es;
  const prep = await adhocPrepare(es, req.index);
  if (!prep.isAlias && !req.confirmDirectSwap) throw new Error('直连索引重建需确认直接切换风险');
  /* 直连安全门（与服务端 start 同口径，且这里用的是即时重查的 prepare 结果而非前端缓存）：
   * 删除物理索引会连带断开其所属别名的成员关系，业务侧查询将失效——源物理索引还是
   * 别名成员时直连切换会让该别名失去成员、业务查询 404，硬拒并引导改用别名入口。 */
  if (!prep.isAlias && (prep.memberAliases || []).length) {
    throw new Error('源物理索引 ' + req.index + ' 是别名 ' + prep.memberAliases.join('、')
      + ' 的成员——直连重建会在切换时删除该物理索引并连带断开这些别名（业务将查不到数据）。'
      + '请改用别名名（如 ' + prep.memberAliases[0] + '）作为重建入口。');
  }
  const dest = String(req.destIndex || prep.suggestedDest).trim();
  if (!dest || dest === prep.sourcePhysical) throw new Error('目标索引名非法或与源相同');
  if (jobs().some(j => j.status === 'RUNNING' && j.logicalName === req.index)) throw new Error('该索引已有运行中的重建作业');
  const settings = (() => { try { return JSON.parse(req.settingsJson || prep.settingsJson || '{}'); } catch { return {}; } })();
  const mapping = (() => { try { return JSON.parse(req.mappingJson || prep.mappingJson || '{}'); } catch { return {}; } })();
  await es('/' + enc(dest), 'PUT', JSON.stringify({ settings, mappings: { properties: propsOf(mapping) } }));
  const bufferMs = Number(req.bufferMs || 120000);
  const startedAt = Date.now();
  const j: any = {
    jobId: 'adhoc-' + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join(''),
    logicalName: req.index, strategy: String(req.strategy || 'INCREMENTAL'), aliasMode: prep.isAlias,
    sourcePhysical: prep.sourcePhysical, destPhysical: dest, timeField: req.timeField || null,
    bufferMs, deleteOldIndex: !!req.deleteOldIndex,
    pauseBeforeSwitch: !!req.pauseBeforeSwitch,
    catchupRound: 0, catchupBaseMs: startedAt - bufferMs, catchupRoundStart: null,
    roundBase: { total: 0, created: 0, updated: 0 },
    requestsPerSecond: Number(req.requestsPerSecond) > 0 ? Number(req.requestsPerSecond) : null,
    slices: Number.isInteger(Number(req.slices)) && Number(req.slices) > 0 ? Number(req.slices) : null,
    targetId: 'browser', targetName: 'browser', targetEsVersion: '',
    ownerUsername: 'browser', ownerRole: 'ADMIN', ownerLegacy: false,
    awaitConfirmSince: null, gateDeadlineMs: null, gateOutcome: null, switchedWithoutLock: false, lockActive: false,
    stage: 'CREATE_DEST', status: 'RUNNING', error: null, currentTaskId: null,
    startedAt, finishedAt: null, sourceDocCount: prep.docCount, destDocCount: 0,
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
    const fullBody: any = { source: { index: j.sourcePhysical }, dest: { index: dest } };
    applyRps(j, fullBody);
    const rr = await es(reindexPath(j), 'POST', JSON.stringify(fullBody));
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
  /* 与服务端 abort 同口径：确认已赢下确认门后切换必然执行（或已切换完成），此刻的
   * 中止拦不住任何东西——如实硬拒，不把已切换别名的活索引作业改标 ABORTED */
  if (j.gateOutcome === 'CONFIRMED' && ['FINAL_CATCHUP', 'FINALIZE', 'DONE'].includes(String(j.stage))) {
    throw new Error('切换已确认，无法中止（作业正在执行切换/收尾，请等待其完成后按结果处置）');
  }
  if (j.currentTaskId) { try { await es('/_tasks/' + encodeURIComponent(j.currentTaskId) + '/_cancel', 'POST'); } catch { /* task 已结束 */ } }
  /* 与服务端同口径：中止保留目标索引供诊断，不静默删除 */
  await releaseWriteBlock(j);
  j.status = 'ABORTED'; j.stage = 'DONE'; j.finishedAt = Date.now(); j.error = null;
  j.report = { hint: '已中止：目标索引 ' + j.destPhysical + ' 保留供诊断，可手动删除或复用' };
  putJob(j);
  return jobMap(j);
}

export async function adhocConfirm(es: EsCall, jobId: string): Promise<any> {
  esCall = es;
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (j.stage !== 'AWAIT_CONFIRM') throw new Error('作业未处于待确认状态');
  /* 勾选了删除旧索引的确认动作先探活目标索引：目标不可查即拒绝放行（作业留在门上），
   * 先把目标索引救回来（或中止作业），避免确认后才发现删除没有执行 */
  if (j.deleteOldIndex && j.sourcePhysical !== j.destPhysical && !(await destAlive(j))) {
    throw new Error('目标索引 ' + j.destPhysical + ' 探活失败，已拒绝切换删除：请先确认目标索引存在且可查，或中止作业');
  }
  /* 探活的网络等待期间，2s 轮询可能已把确认门按超时收尾（盘上 FAILED/TIMED_OUT）。
   * 执行切换前重读盘上作业：不在门上即拒绝放行——不重读就继续切换会覆写超时终态，
   * 造成「报告未执行切换、别名实际已切换」的伪事实 */
  const onDisk = jobs().find(x => x.jobId === jobId);
  if (!onDisk || onDisk.stage !== 'AWAIT_CONFIRM' || onDisk.gateOutcome) {
    const why = onDisk?.gateOutcome === 'TIMED_OUT' || onDisk?.status === 'FAILED'
      ? '确认门已被超时收尾（写阻断已自动解除、未执行切换）'
      : onDisk?.status === 'ABORTED' ? '作业已被中止，未执行切换'
        : '作业已离开待确认状态，未执行切换';
    throw new Error(why + '；目标索引保留，可点「重跑」重新发起');
  }
  /* 校验通过立即把确认结果落盘抢占裁决（stage 移出 AWAIT_CONFIRM、清截止时刻）：
   * 切换请求在途期间轮询不会再按门超时收尾，终态与切换行为始终一致 */
  j.gateOutcome = 'CONFIRMED';
  j.awaitConfirmSince = null;
  j.gateDeadlineMs = null;
  j.stage = (j.strategy === 'INCREMENTAL' && j.timeField) ? 'FINAL_CATCHUP' : 'FINALIZE';
  putJob(j);
  try {
    await switchAlias(j);
  } catch (e: any) {
    /* 切换请求失败：确认已落盘但切换未发生——解除挡写并按失败如实收尾，
     * 不把作业留在门上冒充仍可确认 */
    await releaseWriteBlock(j);
    j.status = 'FAILED'; j.stage = 'DONE'; j.finishedAt = Date.now();
    j.error = '别名切换请求失败：' + String(e?.message || e) + '（未执行切换，可点「重跑」重新发起）';
    if (!abortedOnDisk(j)) putJob(j);
    throw e;
  }
  return jobMap(j);
}

/* 一键重跑（FAILED/ABORTED 作业，同 jobId 重置）：目标索引存活且有 timeField 时走增量续跑
 * （从作业起点含缓冲重放 range 追平，完成后照常停门/切换）；否则全量重发 _reindex——
 * 目标索引不在时先按源现状重建目标再全量；目标索引已在时同 _id 覆盖重放（conflicts=proceed 幂等）。 */
export async function adhocRetry(es: EsCall, jobId: string, overrides?: {
  requestsPerSecond?: number | null; slices?: number | null; batchSize?: number | null;
} | null): Promise<any> {
  esCall = es;
  if (retryingJobs.has(jobId)) throw new Error('重跑请求正在处理中，请勿重复发起');
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (j.status !== 'FAILED' && j.status !== 'ABORTED') throw new Error('仅失败或已中止的作业可重跑');
  /* 同 logicalName 进行中互斥（与 adhocStart / 服务端 retry 同口径）：另一作业仍在
   * RUNNING 时拒绝重跑，避免两个作业并发写同一个目标索引 */
  const clash = jobs().find(x => x.jobId !== j.jobId && x.status === 'RUNNING' && x.logicalName === j.logicalName);
  if (clash) throw new Error('该索引已有运行中的重建作业（' + clash.jobId + '），请先中止或等它结束');
  /* 运行参数覆盖（与服务端 retry 同口径）：未传沿用作业原值；非法值在动手前拒绝，零 ES 副作用 */
  if (overrides) {
    if (overrides.requestsPerSecond != null) {
      const rps = Number(overrides.requestsPerSecond);
      /* 仅拒 0（-1=不限速合法；ES 语义中 0 等同不限，为防误填按非法输入拒绝），与 throttle 同文案 */
      if (!Number.isFinite(rps)) throw new Error('requestsPerSecond 需为数字');
      if (rps === 0) throw new Error('requestsPerSecond 不得为 0：不限速请传 -1 或省略该字段（ES 语义中 0 等同不限，为防误填按非法输入拒绝）');
      j.requestsPerSecond = rps > 0 ? rps : null;
    }
    if (overrides.slices != null) {
      /* 0/负数不拒绝：归一 null=auto（与 start 同口径，服务端 slices=v>=1?v:0 同语义） */
      const sl = Number(overrides.slices);
      j.slices = Number.isFinite(sl) && sl >= 1 ? Math.floor(sl) : null;
    }
    if (overrides.batchSize != null) {
      const bsz = Number(overrides.batchSize);
      if (!Number.isInteger(bsz) || bsz <= 0) throw new Error('batchSize 必须为正整数');
      j.batchSize = bsz;
    }
  }
  retryingJobs.add(jobId);
  try {
    /* 残留 reindex task 先尽力取消（幂等）：避免旧 task 与重跑轮次同时写同一目标索引 */
    if (j.currentTaskId) { try { await es('/_tasks/' + encodeURIComponent(j.currentTaskId) + '/_cancel', 'POST'); } catch { /* task 已结束 */ } }
    const alive = await destAlive(j);
    j.status = 'RUNNING'; j.error = null; j.finishedAt = null; j.report = null;
    j.gateOutcome = null; j.awaitConfirmSince = null; j.gateDeadlineMs = null;
    j.switchedWithoutLock = false; j.writeBlocked = false;
    snapshotRoundBase(j);
    const fullResend = async () => {
      if (!alive) {
        /* 目标索引不在：按源索引现状重建目标（与服务端全量重跑同口径） */
        const mappingRaw = await es('/' + enc(j.sourcePhysical) + '/_mapping');
        let mapping: any = {};
        for (const v of Object.values<any>(mappingRaw || {})) { mapping = v?.mappings || {}; break; }
        const settingsRaw = await es('/' + enc(j.sourcePhysical) + '/_settings?flat_settings=true');
        let settings: any = {};
        for (const v of Object.values<any>(settingsRaw || {})) { settings = v?.settings || {}; break; }
        await es('/' + enc(j.destPhysical), 'PUT', JSON.stringify({ settings: JSON.parse(cleanedSettings(settings)), mappings: { properties: propsOf(mapping) } }));
      }
      j.stage = 'FULL_REINDEX';
      const fullBody: any = { conflicts: 'proceed', source: { index: j.sourcePhysical }, dest: { index: j.destPhysical } };
      applyRps(j, fullBody);
      if (Number(j.batchSize) > 0) fullBody.size = Number(j.batchSize);
      const rr = await es(reindexPath(j), 'POST', JSON.stringify(fullBody));
      j.currentTaskId = typeof rr?.task === 'string' ? rr.task : null;
    };
    try {
      if (alive && j.strategy === 'INCREMENTAL' && j.timeField) {
        j.catchupRound = (j.catchupRound || 0) + 1;
        j.catchupRoundStart = Date.now();
        j.stage = 'CATCHUP';
        const rr = await es(reindexPath(j), 'POST', JSON.stringify(catchupBody(j, j.startedAt - Number(j.bufferMs || 0), false)));
        j.currentTaskId = typeof rr?.task === 'string' ? rr.task : null;
      } else {
        await fullResend();
      }
    } catch (e: any) {
      j.status = 'FAILED'; j.stage = 'DONE'; j.error = String(e?.message || e); j.finishedAt = Date.now();
      putJob(j);
      throw e;
    }
    putJob(j);
  } finally {
    retryingJobs.delete(jobId);
  }
  ensurePoller();
  return jobMap(j);
}

/* 作业事件时间线（可回放读取）：轮次账本 + 关键时刻派生事件序列，ts 升序。
 * 与服务端 events 端点同形（{jobId, events:[{ts,stage,status,detail}]}）；
 * 旧台账（无 ts 的轮次）按轮次序近似排布，detail 注明时刻未留存。 */
export async function adhocEvents(jobId: string): Promise<any> {
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  const events: any[] = [];
  events.push({ ts: Number(j.createTime || 0), stage: 'CREATE_DEST', status: 'STARTED', detail: '作业创建（策略 ' + (j.strategy || '-') + '）' });
  const rounds: any[] = Array.isArray(j.rounds) ? j.rounds : [];
  rounds.forEach((r, i) => {
    events.push({
      ts: Number(r.ts || (Number(j.catchupRoundStart || j.createTime || 0) + i)),
      stage: String(r.phase || '-'), status: 'ROUND_DONE',
      detail: r.label + '：created ' + Number(r.created || 0) + ' / updated ' + Number(r.updated || 0) + ' / 冲突 ' + Number(r.versionConflicts || 0) + (r.ts ? '' : '（时刻未留存，按轮次序）'),
    });
  });
  if (j.awaitConfirmSince) events.push({ ts: Number(j.awaitConfirmSince), stage: 'AWAIT_CONFIRM', status: 'GATE_OPEN', detail: '切换前确认门开启（30 分钟截止）' });
  if (j.gateOutcome) events.push({ ts: Number(j.finishedAt || 0), stage: 'AWAIT_CONFIRM', status: 'GATE_' + String(j.gateOutcome).toUpperCase(), detail: '确认门结果：' + j.gateOutcome });
  if (j.status !== 'RUNNING' && j.finishedAt) {
    events.push({ ts: Number(j.finishedAt), stage: String(j.stage || 'DONE'), status: j.status, detail: j.error ? String(j.error) : '作业收尾（' + j.status + '）' });
  }
  events.sort((a, b) => Number(a.ts) - Number(b.ts));
  return { jobId, events };
}

/* 删除终态作业记录（localStorage）；进行中作业拒绝删除，先中止再清理 */
export async function adhocDeleteJob(jobId: string): Promise<void> {
  const list = jobs();
  const j = list.find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (j.status === 'RUNNING') throw new Error('作业进行中，不可删除记录（请先中止或等待终态）');
  saveJobs(list.filter(x => x.jobId !== jobId));
}

/* 批量清理 N 天前的终态记录（finishedAt 早于截点即删；进行中与无收尾时刻的记录保留）。
 * olderThanDays 必须为正数（与服务端 deleteOlderThan 同口径）：0/负数会清空全部终态记录，拒绝 */
export async function adhocCleanupJobs(olderThanDays: number): Promise<{ deleted: number }> {
  const days = Number(olderThanDays);
  if (!(days > 0)) throw new Error('olderThanDays 必须为正整数');
  const cut = Date.now() - days * 86400000;
  const list = jobs();
  const keep = list.filter(j => !(j.status !== 'RUNNING' && Number(j.finishedAt || 0) > 0 && Number(j.finishedAt) < cut));
  const deleted = list.length - keep.length;
  if (deleted > 0) saveJobs(keep);
  return { deleted };
}

/* 动态调速：reindex 执行段（全量/追平/终追）直接调 ES 原生 rethrottle，
 * -1 恢复不限速；生效速率写回作业快照 */
export async function adhocThrottle(es: EsCall, jobId: string, requestsPerSecond: number): Promise<any> {
  esCall = es;
  const j = jobs().find(x => x.jobId === jobId);
  if (!j) throw new Error('作业不存在：' + jobId);
  if (j.status !== 'RUNNING') throw new Error('作业不在运行中，无法调速');
  if (!['FULL_REINDEX', 'CATCHUP', 'FINAL_CATCHUP'].includes(String(j.stage))) {
    throw new Error('当前阶段（' + j.stage + '）没有执行中的 reindex task，无法调速');
  }
  if (!j.currentTaskId) throw new Error('缺少 _reindex task id，无法调速');
  const rps = Number(requestsPerSecond);
  if (!Number.isFinite(rps)) throw new Error('速率需为数字（-1 恢复不限速）');
  /* 与服务端 throttle 同口径：0 在 ES 语义中等同不限速，为防误填按非法输入拒绝 */
  if (rps === 0) throw new Error('requestsPerSecond 不得为 0：不限速请传 -1（ES 语义中 0 等同不限，为防误填按非法输入拒绝）');
  const applied = rps < 0 ? -1 : rps;
  await es('/_tasks/' + encodeURIComponent(j.currentTaskId) + '/_rethrottle?requests_per_second=' + applied, 'POST');
  j.requestsPerSecond = applied > 0 ? applied : null;
  putJob(j);
  return jobMap(j);
}

/* 轮询体独立成函数：2s 定时器与 storage 事件共用 */
function pollOnce(): void {
  for (const j of jobs()) {
    if (j.status !== 'RUNNING') continue;
    /* 停门作业不推进 reindex，但要独立盯门截止时刻（超时解除挡写并按失败收尾） */
    if (j.stage === 'AWAIT_CONFIRM') {
      if (j.gateDeadlineMs && Date.now() > Number(j.gateDeadlineMs)) void gateTimeout(j);
      continue;
    }
    void refreshJob(j);
  }
}

let storageBound = false;
function ensurePoller(): void {
  /* 其他标签页改动作业存储时，localStorage 会在本页签触发 storage 事件：立即刷一轮，
   * 本页签的展示与编排推进即时收敛，不等 2s 定时器（测试环境该事件不自动派发，手动 dispatch） */
  if (!storageBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    storageBound = true;
    window.addEventListener('storage', (e: Event) => {
      if ((e as StorageEvent).key === JOBS_KEY) pollOnce();
    });
  }
  if (timer) return;
  timer = setInterval(pollOnce, POLL_MS);
}
