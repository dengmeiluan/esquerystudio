/* 纯浏览器模式的现场智能 / 护栏动作兼容层。
 *
 * 服务端模式用 SettingsChangeAnalyzer + GuardedActionExecutor + ConfirmTokenService；
 * 浏览器模式没有服务端进程，本文件把同一套「外部契约」落到本机：
 *   settings-impact：DYNAMIC/STATIC/ILLEGAL 分类 + L1 值门禁 + 静态项重建耗时预估；
 *   estimate：只读分析，通过后签发本页内存态 confirmToken；
 *   dry-run：零副作用重跑门禁；
 *   execute：校验 token/参数后 PUT /{index}/_settings，返回 receipt 供审计检索。
 *
 * 边界如实标注：分类表按 ES 7.10 整理，L1 只覆盖同款数值门禁；更细的 ES 参数组合
 * 由 execute 的真实请求兜底。token 仅存在当前页面内存，刷新即失效（与服务端 5 分钟
 * 有效期的「过期重看」语义一致，但不等同服务端 HMAC 的跨实例能力）。
 */
export type EsCall = (path: string, method?: string, body?: string) => Promise<any>;

export const APPLY_INDEX_SETTINGS = 'apply-index-settings';

export class BrowserInsightError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/* ES 7.10 索引级 setting 目录（去 index. 前缀口径，逐字对齐服务端
 * Es710IndexSettings，浏览器模式不另造第二套分类）。 */
const DYNAMIC_KEYS = new Set([
  'number_of_replicas', 'auto_expand_replicas', 'refresh_interval',
  'max_result_window', 'max_inner_result_window', 'max_rescore_window',
  'max_docvalue_fields_search', 'max_script_fields',
  'max_ngram_diff', 'max_shingle_diff', 'max_refresh_listeners',
  'max_terms_count', 'max_regex_length', 'max_slices_per_scroll',
  'priority', 'gc_deletes', 'default_pipeline', 'final_pipeline',
  'hidden', 'highlight.max_analyzed_offset',
  'write.wait_for_active_shards',
]);
const DYNAMIC_PREFIXES = [
  'blocks.', 'routing.', 'translog.', 'search.slowlog.', 'indexing.slowlog.',
  'unassigned.', 'merge.', 'mapping.', 'search.idle.', 'lifecycle.',
];
const STATIC_KEYS = new Set([
  'number_of_shards', 'codec', 'routing_partition_size',
  'shard.check_on_startup', 'load_fixed_bitset_filters_eagerly',
  'format', 'queries.cache.enabled', 'number_of_routing_shards',
]);
const STATIC_PREFIXES = [
  'analysis.', 'sort.', 'similarity.', 'store.', 'mapper.', 'soft_deletes.',
];

/** 与 Es710IndexSettings.classify 同语义：精确命中 → 前缀命中 → 非法。 */
export function classifySetting(rawKey: string): 'DYNAMIC' | 'STATIC' | 'ILLEGAL' {
  const key = String(rawKey || '').trim().replace(/^index\./, '');
  if (!key) return 'ILLEGAL';
  if (DYNAMIC_KEYS.has(key)) return 'DYNAMIC';
  if (STATIC_KEYS.has(key)) return 'STATIC';
  if (DYNAMIC_PREFIXES.some(p => key.startsWith(p))) return 'DYNAMIC';
  if (STATIC_PREFIXES.some(p => key.startsWith(p))) return 'STATIC';
  return 'ILLEGAL';
}

function enc(v: string): string { return encodeURIComponent(v); }
function normKey(raw: string): string { return String(raw || '').trim().replace(/^index\./, ''); }

function requireIndex(params: any): string {
  const index = params?.index;
  if (typeof index !== 'string' || !index.trim()) throw new BrowserInsightError(400, 'params.index 必填');
  return index.trim();
}

function requireChanges(params: any): Record<string, any> {
  const changes = params?.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) {
    throw new BrowserInsightError(400, 'params.changes 必填且不能为空');
  }
  return changes;
}

/** L1 值门禁：与 IndexConfigLinter 对 number_of_shards / number_of_replicas 的校验同口径。 */
export function lintSettingChanges(changes: Record<string, any>): any[] {
  const issues: any[] = [];
  for (const [rawKey, value] of Object.entries(changes)) {
    const key = normKey(rawKey);
    if (key !== 'number_of_shards' && key !== 'number_of_replicas') continue;
    const nonNegInt = (typeof value === 'number' && Number.isInteger(value) && value >= 0)
      || (typeof value === 'string' && /^\d+$/.test(value));
    if (!nonNegInt) {
      issues.push({
        layer: 'LINT', severity: 'ERROR', code: 'SETTING_VALUE_TYPE',
        path: 'settings.' + key, message: key + ' 必须是非负整数，实际=' + String(value),
      });
    }
  }
  return issues;
}

/** 静态项重建耗时预估：_count + _stats/store,docs，30 MB/s（服务端同一经验值）。 */
async function rebuildEstimate(es: EsCall, index: string): Promise<any> {
  try {
    const [count, stats] = await Promise.all([
      es('/' + enc(index) + '/_count', 'POST', '{"query":{"match_all":{}}}'),
      es('/' + enc(index) + '/_stats/store,docs'),
    ]);
    const docCount = Number(count?.count || 0);
    let sizeBytes = 0;
    for (const v of Object.values<any>(stats?.indices || {})) {
      sizeBytes += Number(v?.primaries?.store?.size_in_bytes || 0);
    }
    return {
      docCount,
      sizeBytes,
      estimatedMinutes: Math.max(1, Math.ceil(sizeBytes / (30 * 1024 * 1024) / 60)),
    };
  } catch (e: any) {
    return { error: '重建预估失败: ' + String(e?.message || e) };
  }
}

/** 只读影响分析：与服务端 InsightService.settingsImpact 同结构。 */
export async function analyzeSettingsImpact(
  es: EsCall, index: string, changes: Record<string, any>,
): Promise<any> {
  if (!index || !index.trim()) throw new BrowserInsightError(400, 'index 必填');
  if (!changes || !Object.keys(changes).length) throw new BrowserInsightError(400, 'changes 必填且不能为空');

  const gateIssues = lintSettingChanges(changes);
  const items: any[] = [];
  let hasDynamic = false, hasStatic = false, hasIllegal = false;

  for (const [rawKey, value] of Object.entries(changes)) {
    const key = String(rawKey);
    const rel = normKey(key);
    let kind = classifySetting(key);
    const itemIssues = gateIssues.filter(i => i.path === 'settings.' + rel || i.path.startsWith('settings.' + rel + '.'));
    if (itemIssues.some(i => i.severity === 'ERROR') && kind !== 'ILLEGAL') kind = 'ILLEGAL';

    let note: string;
    if (kind === 'DYNAMIC') {
      note = '动态 setting，可热更，立即生效';
      hasDynamic = true;
    } else if (kind === 'STATIC') {
      note = '静态 setting，需关闭索引或零停机重建后生效';
      hasStatic = true;
    } else {
      kind = 'ILLEGAL';
      note = '非法项：未知 setting 键或值校验失败，无法应用';
      hasIllegal = true;
    }

    const item: any = { key, value, kind, note };
    if (itemIssues.length) item.gateIssues = itemIssues;
    items.push(item);
  }

  const out: any = { items, hasDynamic, hasStatic, hasIllegal };
  if (hasStatic) out.rebuildEstimate = await rebuildEstimate(es, index.trim());
  return out;
}

/* ── confirmToken：本页内存态、绑定 actionId + 参数规范串、5 分钟有效 ── */
interface TokenRecord { actionId: string; paramsKey: string; expiresAt: number; }
const tokens = new Map<string, TokenRecord>();
const TOKEN_TTL_MS = 5 * 60 * 1000;

function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  try { globalThis.crypto.getRandomValues(arr); }
  catch { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function issueConfirmToken(actionId: string, params: any): string {
  const now = Date.now();
  for (const [key, rec] of tokens) if (rec.expiresAt <= now) tokens.delete(key);
  const token = randomHex(18);
  tokens.set(token, { actionId, paramsKey: canonical(params), expiresAt: now + TOKEN_TTL_MS });
  return token;
}

export function verifyConfirmToken(actionId: string, params: any, token: string): boolean {
  const rec = tokens.get(String(token || ''));
  if (!rec) return false;
  if (rec.actionId !== actionId || rec.paramsKey !== canonical(params)) return false;
  if (Date.now() > rec.expiresAt) { tokens.delete(String(token)); return false; }
  return true;
}

/** estimate：分析通过才发 token；含 STATIC/ILLEGAL 时与服务端一样直接拒绝。 */
export async function estimateGuardedAction(es: EsCall, actionId: string, params: any): Promise<any> {
  if (actionId !== APPLY_INDEX_SETTINGS) {
    throw new BrowserInsightError(400, '浏览器模式尚未实现该护栏动作：' + actionId, 'ACTION_NOT_IMPLEMENTED');
  }
  const index = requireIndex(params);
  const changes = requireChanges(params);
  const analysis = await analyzeSettingsImpact(es, index, changes);
  if (analysis.hasStatic || analysis.hasIllegal) {
    throw new BrowserInsightError(400, '变更含静态/非法 setting，无法热更：静态项请走零停机重建，非法项请修正后重试');
  }
  return {
    summary: '将对索引 ' + index + ' 热更 ' + Object.keys(changes).length + ' 项动态 setting，立即生效，无需重建',
    analysis,
    confirmToken: issueConfirmToken(actionId, params),
    riskLevel: 'MEDIUM',
    supportsDryRun: true,
  };
}

/** dry-run：零副作用，仅重跑 L1 门禁。 */
export async function dryRunGuardedAction(es: EsCall, actionId: string, params: any): Promise<any> {
  if (actionId !== APPLY_INDEX_SETTINGS) {
    throw new BrowserInsightError(400, '浏览器模式尚未实现该护栏动作：' + actionId, 'ACTION_NOT_IMPLEMENTED');
  }
  const index = requireIndex(params);
  const changes = requireChanges(params);
  const analysis = await analyzeSettingsImpact(es, index, changes);
  const issues: any[] = [];
  for (const item of analysis.items || []) {
    if (Array.isArray(item.gateIssues)) issues.push(...item.gateIssues);
  }
  return { issues, ok: issues.length === 0 && !analysis.hasStatic && !analysis.hasIllegal };
}

/** execute：token 三防线（存在/未过期/参数未篡改）→ 真实写 ES → 回执。 */
export async function executeGuardedAction(es: EsCall, actionId: string, params: any, token: string): Promise<any> {
  if (actionId !== APPLY_INDEX_SETTINGS) {
    throw new BrowserInsightError(400, '浏览器模式尚未实现该护栏动作：' + actionId, 'ACTION_NOT_IMPLEMENTED');
  }
  const index = requireIndex(params);
  const changes = requireChanges(params);
  if (!verifyConfirmToken(actionId, params, token)) {
    throw new BrowserInsightError(403, '确认令牌无效：请先查看影响预估（无 token / 已过期 / 参数与预估时不一致）', 'CONFIRM_TOKEN_INVALID');
  }
  const analysis = await analyzeSettingsImpact(es, index, changes);
  if (analysis.hasStatic || analysis.hasIllegal) {
    throw new BrowserInsightError(400, '变更含静态/非法 setting，无法热更：静态项请走零停机重建，非法项请修正后重试');
  }
  const normalized: Record<string, any> = {};
  for (const [rawKey, value] of Object.entries(changes)) normalized[normKey(rawKey)] = value;
  const esResponse = await es('/' + enc(index) + '/_settings', 'PUT', JSON.stringify({ index: normalized }));
  const receiptId = typeof (globalThis.crypto as any)?.randomUUID === 'function'
    ? (globalThis.crypto as any).randomUUID()
    : randomHex(16);
  return {
    receiptId,
    actionId,
    executedAt: Date.now(),
    result: { index, applied: normalized, esResponse },
    auditHint: '本机审计流水可按 receiptId 检索（仅当前浏览器）',
  };
}
