/**
 * Browser-mode MCP bridge.
 *
 * A browser tab cannot listen on TCP, so pure front-end mode exposes a real MCP
 * JSON-RPC handler to in-page agents through `window.ESQueryStudioMCP`. External
 * MCP clients that require a process transport should use server mode (`/mcp`)
 * or the optional local bridge described in docs/mcp.md. The tool contracts are
 * intentionally the same as the server implementation.
 */
import { abortAllEsRequests, browserFetch } from './browserApi';
import { activeProfile, profiles } from './browserProfiles';
import { adhocEvents } from './browserAdhoc';
import { cleanupJobs as xmCleanupJobs, deleteJob as xmDeleteJob, planSnapshot as xmPlanSnapshot } from './browserXmigrate';
import { roleRank } from '../utils/capability';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  annotations?: Record<string, any>;
}

const MCP_PROTOCOL_VERSION = '2026-07-28';
const MCP_SUPPORTED_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MCP_LEGACY_COMPAT_VERSION = '2025-06-18';
const MCP_CACHE_TTL_MS = 60000;
/* 版本走构建期 define（读 pom），与页面版本显示同源——此前硬编码字面量在版本
 递增时漏改，被 907 契约测试以外打进产物触发 CI 红 */
const SERVER_INFO = { name: 'ESQueryStudio', version: __STARTER_VERSION__, mode: 'browser' as const };
const MCP_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
  prompts: { listChanged: false },
  extensions: { 'io.modelcontextprotocol/tasks': {}, 'io.modelcontextprotocol/ui': {} },
};
const MCP_TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui';
const MCP_APP_URI = 'ui://esquerystudio/tool-console';
const MCP_APP_MIME = 'text/html;profile=mcp-app';
/** MCP Apps 扩展：与服务器同文案的只读面板，宿主不支持 Apps 时仍回退为普通工具结果。 */
const MCP_APP_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1"><style>'
  + ':root{color-scheme:dark}body{margin:0;background:#0d1718;color:#d9f6f1;font:13px/1.55 system-ui,-apple-system,\'Segoe UI\',sans-serif}'
  + 'main{max-width:720px;padding:28px 26px}h1{margin:6px 0 8px;font-size:22px;letter-spacing:-.03em}'
  + '.eyebrow{color:#4cc9f0;font:10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.16em}'
  + 'p{color:#8db7b1;max-width:620px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}'
  + '.cell{border:1px solid #1c3435;border-radius:6px;padding:10px;background:#102021}'
  + '.cell b{display:block;color:#d9f6f1}.cell span{color:#6f9994;font-size:11px}'
  + 'code{color:#4cc9f0}@media(max-width:520px){.grid{grid-template-columns:1fr}}'
  + '</style></head><body><main><div class="eyebrow">ESQUERYSTUDIO / MCP APP</div>'
  + '<h1>Elasticsearch control surface</h1><p>This app renders the ESQueryStudio connection, index and diagnostic tools inside an MCP host. '
  + 'Tool results remain available as text when the host does not support MCP Apps.</p>'
  + '<div class="grid"><div class="cell"><b>17 groups</b><span>171 actions</span></div>'
  + '<div class="cell"><b>Read / write</b><span>per connection permission</span></div>'
  + '<div class="cell"><b>Audited</b><span>IP · UA · requestId</span></div></div>'
  + '<p style="margin-top:20px">Use <code>es_connections action=list</code> to discover the scope of your key.</p></main></body></html>';
function appUiMeta(): Record<string, any> {
  return {
    csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] },
    permissions: {},
    prefersBorder: true,
  };
}
const MCP_TASK_TTL_MS = 3_600_000;
const MCP_TASK_POLL_INTERVAL_MS = 1_000;
const MCP_TASK_TOOLS = new Set(['es_reindex', 'es_bulk', 'es_update_by_query', 'es_delete_by_query', 'es_create_snapshot', 'es_restore_snapshot', 'es_force_merge', 'es_sql', 'es_rest']);
/**
 * 浏览器任务台账：与 Java {@code McpTaskRegistry} 同语义。
 * 三个不可省略的行为：立刻回 working（不堵调用方）、3 分钟死线到点自动掐断、tasks/cancel 真中断。
 * 取消在浏览器里的物理手段是 {@link abortAllEsRequests}：把 fetch 的 AbortSignal 撤掉，
 * 对端 ES 会看到连接断开（长任务本身仍可能被 ES 继续执行到分片结束，这是浏览器直连的边界，
 * 因此同时提供「去集群任务页 cancel」的可观测出口，而不是假装已经停止写入）。
 */
const MCP_TASK_TIMEOUT_MS = 180_000;
const BROWSER_TASKS = new Map<string, Record<string, any>>();

interface BrowserTaskControl {
  cancelled: () => boolean;
  cancelReason: () => string;
  stage: (s: string) => void;
}

function browserTaskView(task: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {
    taskId: task.taskId,
    status: task.status,
    stage: task.stage,
    createdAt: task.createdAt,
    lastUpdatedAt: task.lastUpdatedAt,
    deadlineAt: task.deadlineAt,
    ttlMs: MCP_TASK_TTL_MS,
    pollIntervalMs: MCP_TASK_POLL_INTERVAL_MS,
    tool: task.tool,
    resultType: task.status === 'completed' ? 'complete' : 'task',
  };
  if (task.cancelReason) out.cancelReason = task.cancelReason;
  if (task.note) out.note = task.note;
  if (task.resultDropped) out.resultDropped = true;
  if (task.result) out.result = task.result;
  if (task.error) out.error = task.error;
  return out;
}

function browserSubmitTask(
  tool: string,
  owner: string,
  requestId: string,
  work: (control: BrowserTaskControl) => Promise<any>,
  exposeAsTask = true,
): Record<string, any> {
  const taskId = globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();
  const task: Record<string, any> = {
    taskId,
    tool,
    owner,
    requestId,
    status: 'working',
    stage: 'queued',
    createdAt: new Date(now).toISOString(),
    lastUpdatedAt: new Date(now).toISOString(),
    deadlineAt: new Date(now + MCP_TASK_TIMEOUT_MS).toISOString(),
    cancelReason: null,
    result: null,
    error: null,
    exposeAsTask,
  };
  BROWSER_TASKS.set(taskId, task);
  persistBrowserTasks();
  const control: BrowserTaskControl = {
    cancelled: () => task.status === 'cancelled',
    cancelReason: () => task.cancelReason || '',
    stage: (s: string) => { task.stage = s; task.lastUpdatedAt = new Date().toISOString(); persistBrowserTasks(); },
  };
  /* 异步执行：调用方立即拿到 taskId；刷新后台账从 localStorage 恢复——
     completed 结果仍可按 id 读；working 会恢复为 cancelled/RELOAD（连接已断，不冒充仍在跑）。 */
  void (async () => {
    const deadline = setTimeout(() => {
      if (task.status === 'working') {
        task.status = 'cancelled';
        task.cancelReason = 'DEADLINE';
        task.stage = 'cancelled';
        task.lastUpdatedAt = new Date().toISOString();
        abortAllEsRequests();
        persistBrowserTasks();
      }
    }, MCP_TASK_TIMEOUT_MS);
    try {
      control.stage('running');
      const data = await work(control);
      if (task.status === 'cancelled') return; /* 取消优先：不把已完成结果翻回成功。 */
      task.raw = data; /* 同步路径要拿原始形状（数组不能被包成 {result:[...]}）。 */
      task.result = {
        content: [{ type: 'text', text: JSON.stringify(data) }],
        structuredContent: data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data },
        isError: false,
      };
      task.status = 'completed';
      task.stage = 'completed';
    } catch (e: any) {
      if (task.status === 'cancelled') return;
      task.status = 'failed';
      task.stage = 'failed';
      task.error = { code: browserToolErrorCode(e), message: String(e?.message || e) };
    } finally {
      clearTimeout(deadline);
      task.lastUpdatedAt = new Date().toISOString();
      persistBrowserTasks();
    }
  })();
  /* 同步路径只回内部 id：调用方靠它取结果，但不把 task 协议面暴露给未声明扩展的客户端。 */
  return exposeAsTask ? browserTaskView(task) : { taskId: task.taskId };
}

/** 同步路径等待内部台账任务；取消优先，失败回抛原始错误码。 */
async function browserWaitTask(taskId: string): Promise<any> {
  const task = BROWSER_TASKS.get(taskId);
  if (!task) throw new Error('unknown internal task ' + taskId);
  while (task.status === 'working') await new Promise(r => setTimeout(r, 25));
  if (task.status === 'cancelled') return { __cancelled: true, __cancelReason: task.cancelReason };
  if (task.status === 'failed') {
    const e: any = new Error(String(task.error?.message || 'task failed'));
    e.code = task.error?.code;
    throw e;
  }
  return task.raw ?? null;
}

/** 浏览器任务台账跨刷新持久化：completed/failed 结果重开页面仍可读；
 *  working 在刷新时连接已断，恢复为 cancelled/RELOAD（不冒充仍在跑）。 */
const BROWSER_TASKS_KEY = 'esquerystudio.mcp.tasks.v1';
const BROWSER_TASKS_MAX = 100;
const BROWSER_TASK_RESULT_MAX_CHARS = 300_000;
const BROWSER_TASKS_STORAGE_MAX_CHARS = 1_500_000;

function persistBrowserTasks(): void {
  try {
    const cutoff = Date.now() - MCP_TASK_TTL_MS;
    let rows: Record<string, any>[] = [...BROWSER_TASKS.values()]
      .filter(t => Date.parse(String(t.lastUpdatedAt || t.createdAt)) >= cutoff)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, BROWSER_TASKS_MAX)
      .map(t => {
        const copy: Record<string, any> = { ...t };
        delete copy.raw;
        if (copy.result && JSON.stringify(copy).length > BROWSER_TASK_RESULT_MAX_CHARS) {
          copy.result = null;
          copy.resultDropped = true;
        }
        return copy;
      });
    let text = JSON.stringify(rows);
    while (text.length > BROWSER_TASKS_STORAGE_MAX_CHARS && rows.length > 1) {
      rows = rows.slice(0, -1);
      text = JSON.stringify(rows);
    }
    localStorage.setItem(BROWSER_TASKS_KEY, text);
  } catch {
    /* 配额满/隐私模式：台账退回页面内存，不阻断工具调用 */
  }
}

function restoreBrowserTasks(): void {
  let rows: Record<string, any>[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(BROWSER_TASKS_KEY) || '[]');
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return;
  }
  const now = Date.now();
  const cutoff = now - MCP_TASK_TTL_MS;
  let changed = false;
  for (const row of rows) {
    if (!row || typeof row.taskId !== 'string') continue;
    if (Date.parse(String(row.lastUpdatedAt || row.createdAt)) < cutoff) { changed = true; continue; }
    if (BROWSER_TASKS.has(row.taskId)) continue;
    if (row.status === 'working') {
      row.status = 'cancelled';
      row.stage = 'cancelled';
      row.cancelReason = 'RELOAD';
      row.lastUpdatedAt = new Date(now).toISOString();
      row.note = '页面刷新或关闭时该调用仍在途：连接已断，ES 侧可能已执行；请用只读查询核对结果，写操作确认后按幂等键重试。';
      changed = true;
    }
    BROWSER_TASKS.set(row.taskId, row);
  }
  if (changed) persistBrowserTasks();
}

restoreBrowserTasks();

function browserCancelTask(taskId: string, owner: string, reason: string): Record<string, any> | null {
  const task = BROWSER_TASKS.get(taskId);
  if (!task || task.owner !== owner) return null;
  if (task.status === 'working') {
    task.status = 'cancelled';
    task.cancelReason = reason;
    task.stage = 'cancelled';
    task.lastUpdatedAt = new Date().toISOString();
    abortAllEsRequests();
    persistBrowserTasks();
  }
  return browserTaskView(task);
}
/** MRTR：高危写操作在声明 elicitation 的 2026 客户端上二次确认。 */
const MCP_MRTR_CONFIRM_TOOLS = new Set(['es_delete_by_query', 'es_delete_index', 'es_delete_doc', 'es_delete_data_stream', 'es_rest',
  'es_adhoc_start', 'es_adhoc_abort', 'es_adhoc_confirm_switch',
  'es_adhoc_retry', 'es_adhoc_delete_jobs',
  'es_xmigrate_start', 'es_xmigrate_resume', 'es_xmigrate_abort', 'es_xmigrate_delete_jobs',
  'es_xmigrate_sync_structure',
  'es_xmigrate_smart_sync', 'es_xmigrate_plan_apply']);
const MCP_MRTR_TTL_MS = 300_000;
const BROWSER_MRTR_STATES = new Map<string, { tool: string; args: string; expires: number }>();
const MCP_INSTRUCTIONS = 'ESQueryStudio exposes Elasticsearch tools with per-connection permissions. '
  + 'Call es_connections with action=list first, then pass connection on every call. '
  + 'Read tools require read; writes require write and an explicitly write-enabled key or local switch. '
  + 'The client-facing surface is 17 action-typed tools; every call passes action plus that action arguments. recommendedTools lists the groups to load first (maxRecommendedTools=17). '
  + 'Resources expose connection, cluster and index metadata; prompts provide guided diagnostics. '
  + 'Tool failures are returned as isError results, not protocol errors.';
const MCP_CACHE = { ttlMs: MCP_CACHE_TTL_MS, cacheScope: 'private' as const };
/* 浏览器桥没有服务端审计库，但同样要能跨刷新排障：localStorage 保留 30 天（最低 7 天），
   每次调用一条，上限 2000 条防止把扩展存储写满。 */
const BROWSER_AUDIT_KEY = 'esquerystudio.mcp.audit.v1';
const BROWSER_AUDIT_RETENTION_DAYS = 30;
const BROWSER_AUDIT_MAX = 2000;
function readBrowserCalls(): Array<Record<string, any>> {
  try {
    const raw = globalThis.localStorage?.getItem(BROWSER_AUDIT_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - BROWSER_AUDIT_RETENTION_DAYS * 86_400_000;
    return Array.isArray(rows) ? rows.filter((r: any) => Number(r?.at) >= cutoff).slice(0, BROWSER_AUDIT_MAX) : [];
  } catch { return []; }
}
const BROWSER_RECENT_CALLS: Array<Record<string, any>> = readBrowserCalls();
function persistBrowserCalls(): void {
  try { globalThis.localStorage?.setItem(BROWSER_AUDIT_KEY, JSON.stringify(BROWSER_RECENT_CALLS.slice(0, BROWSER_AUDIT_MAX))); }
  catch { /* 存储满/隐私模式：内存态仍可用 */ }
}
const BROWSER_QUIET_METHODS = new Set(['notifications/initialized', 'notifications/cancelled', 'tasks/get', 'tasks/list', 'tasks/update']);
function recordBrowserCall(request: any, response: any, elapsedMs: number): void {
  if (!request || BROWSER_QUIET_METHODS.has(String(request.method || ''))) return;
  const method = String(request.method || '');
  const groupAction = method === 'tools/call' ? String(request.params?.arguments?.action || '').trim() : '';
  const tool = method === 'tools/call'
    ? String(request.params?.name || '') + (groupAction ? ':' + groupAction : '')
    : method;
  const ok = !response?.error && response?.result?.isError !== true;
  const requestId = globalThis.crypto?.randomUUID?.()
    || `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  BROWSER_RECENT_CALLS.unshift({
    method, tool, at: Date.now(), ok, ms: Math.max(0, Math.round(elapsedMs)),
    requestId, transport: 'browser', http: 'in-page handle()',
    origin: typeof location === 'undefined' ? '' : location.origin,
  });
  const cutoff = Date.now() - BROWSER_AUDIT_RETENTION_DAYS * 86_400_000;
  for (let i = BROWSER_RECENT_CALLS.length - 1; i >= 0; i--) {
    if (Number(BROWSER_RECENT_CALLS[i]?.at) < cutoff) BROWSER_RECENT_CALLS.splice(i, 1);
  }
  if (BROWSER_RECENT_CALLS.length > BROWSER_AUDIT_MAX) BROWSER_RECENT_CALLS.length = BROWSER_AUDIT_MAX;
  persistBrowserCalls();
}

function schema(properties: Record<string, any>, required: string[] = []): Record<string, any> {
  const out: Record<string, any> = { type: 'object', properties };
  if (required.length) out.required = required;
  return out;
}

function val(type: string, description: string): Record<string, any> {
  return { type, description };
}

export const MCP_WRITE_TOOLS = [
  'es_index_doc', 'es_update_doc', 'es_delete_doc', 'es_bulk', 'es_task_cancel',
  'es_create_index', 'es_delete_index', 'es_put_mapping', 'es_update_settings',
  'es_alias', 'es_rollover', 'es_force_merge', 'es_put_template', 'es_delete_template',
  'es_create_data_stream', 'es_delete_data_stream', 'es_clone_index', 'es_shrink_index', 'es_split_index',
  'es_put_transform', 'es_start_transform', 'es_stop_transform', 'es_delete_transform',
  'es_update_by_query', 'es_delete_by_query', 'es_reindex',
  'es_refresh_index', 'es_flush_index', 'es_index_close', 'es_index_open',
  'es_update_analysis_settings', 'es_reload_analyzers', 'es_synonyms_upsert',
  'es_put_watch', 'es_delete_watch', 'es_execute_watch',
  'es_put_slm_policy', 'es_delete_slm_policy',
  'es_put_ingest_pipeline', 'es_delete_ingest_pipeline',
  'es_slm_execute',
  'es_update_cluster_settings', 'es_reroute',
  'es_create_snapshot', 'es_delete_snapshot', 'es_restore_snapshot', 'es_put_snapshot_repo', 'es_delete_snapshot_repo',
  'es_put_ilm_policy', 'es_delete_ilm_policy', 'es_ilm_move', 'es_ilm_start', 'es_ilm_stop',
  'es_put_script', 'es_delete_script',
  'es_adhoc_start', 'es_adhoc_abort', 'es_adhoc_confirm_switch',
  'es_adhoc_retry', 'es_adhoc_delete_jobs', 'es_adhoc_throttle',
  'es_xmigrate_start', 'es_xmigrate_resume', 'es_xmigrate_abort', 'es_xmigrate_delete_jobs',
  'es_xmigrate_sync_structure', 'es_xmigrate_smart_sync', 'es_xmigrate_throttle',
  'es_xmigrate_plan_apply',
];
/** 服务端模式下仅 ADMIN 角色 key 可签发/调用的系统管理工具；纯前端直连 ES 不套用角色。 */
export const MCP_ADMIN_ONLY_TOOLS = [
  'es_cluster_state',
  'es_ingest_pipelines', 'es_put_ingest_pipeline', 'es_delete_ingest_pipeline',
  'es_list_transforms', 'es_get_transform', 'es_transform_stats',
  'es_put_transform', 'es_start_transform', 'es_stop_transform', 'es_delete_transform',
  'es_put_watch', 'es_delete_watch', 'es_execute_watch',
  'es_put_snapshot_repo', 'es_delete_snapshot_repo',
  'es_put_slm_policy', 'es_delete_slm_policy',
];

const WRITE_FLAG = 'esquerystudio.mcp.allowWrite';

/** 页面内写工具默认关闭；用户在 MCP 面板显式打开后才会执行。 */
export function isBrowserMcpWriteAllowed(): boolean {
  try { return localStorage.getItem(WRITE_FLAG) === 'true'; } catch { return false; }
}

export function setBrowserMcpWriteAllowed(value: boolean): void {
  try { localStorage.setItem(WRITE_FLAG, value ? 'true' : 'false'); } catch { /* 隐私模式禁用存储时保持内存态 */ }
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'es_list_connections',
    description: 'List connections this MCP client may target.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_indices',
    description: 'List non-system Elasticsearch indices.',
    inputSchema: schema({}),
  },
  {
    name: 'es_cluster_health',
    description: 'Return cluster health, version and shard counts.',
    inputSchema: schema({}),
  },
  {
    name: 'es_get_mapping',
    description: 'Return the live mapping, field tree and field types for an index.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_get_doc',
    description: 'Get one document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
    }, ['index', 'id']),
  },
  {
    name: 'es_get_settings',
    description: 'Return index settings.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_get_aliases',
    description: 'List aliases and their indices.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_templates',
    description: 'List index templates, with legacy-template normalization.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_data_streams',
    description: 'List data streams and their backing indices.',
    inputSchema: schema({}),
  },
  {
    name: 'es_get_data_stream',
    description: 'Get one data stream, its generation and backing indices.',
    inputSchema: schema({ name: val('string', 'Data stream name or wildcard.') }, ['name']),
  },
  {
    name: 'es_data_stream_stats',
    description: 'Return document and store statistics for a data stream.',
    inputSchema: schema({ name: val('string', 'Data stream name or wildcard.') }, ['name']),
  },
  {
    name: 'es_create_data_stream',
    description: 'Create a data stream; write permission required. Requires a matching data-stream index template.',
    inputSchema: schema({ name: val('string', 'Data stream name.') }, ['name']),
  },
  {
    name: 'es_delete_data_stream',
    description: 'Delete a data stream and its backing indices; write permission required.',
    inputSchema: schema({ name: val('string', 'Data stream name.') }, ['name']),
  },
  {
    name: 'es_list_component_templates',
    description: 'List composable component templates.',
    inputSchema: schema({}),
  },
  {
    name: 'es_clone_index',
    description: 'Clone an index into a new index; write permission required. Source must be read-only.',
    inputSchema: schema({
      index: val('string', 'Source index name.'),
      target: val('string', 'Target index name.'),
      body: val('object', 'Optional settings/aliases body object or JSON object string.'),
    }, ['index', 'target']),
  },
  {
    name: 'es_shrink_index',
    description: 'Shrink an index into a target with fewer shards; write permission required. Source must be read-only.',
    inputSchema: schema({
      index: val('string', 'Source index name.'),
      target: val('string', 'Target index name.'),
      body: val('object', 'Optional settings/aliases body object or JSON object string.'),
    }, ['index', 'target']),
  },
  {
    name: 'es_split_index',
    description: 'Split an index into a target with more shards; write permission required. Source must be read-only.',
    inputSchema: schema({
      index: val('string', 'Source index name.'),
      target: val('string', 'Target index name.'),
      body: val('object', 'Optional settings/aliases body object or JSON object string.'),
    }, ['index', 'target']),
  },
  {
    name: 'es_list_nodes',
    description: 'List cluster nodes and their roles/health.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_tasks',
    description: 'List running cluster tasks.',
    inputSchema: schema({ actions: val('string', 'Optional task action filter.') }),
  },
  {
    name: 'es_index_recovery',
    description: 'Return shard recovery status for an index.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_cat_shards',
    description: 'List shard allocation rows for one or all indices.',
    inputSchema: schema({ index: val('string', 'Optional index name or wildcard.') }),
  },
  {
    name: 'es_cluster_state',
    description: 'Return cluster state for selected metrics and an optional index.',
    inputSchema: schema({
      metrics: val('string', 'Comma-separated metrics (default metadata).'),
      index: val('string', 'Optional index name or wildcard.'),
    }),
  },
  {
    name: 'es_mtermvectors',
    description: 'Return term vectors for multiple documents in one request.',
    inputSchema: schema({
      index: val('string', 'Optional default index.'),
      body: val('object', 'Body with docs array, or a JSON object string.'),
    }, ['body']),
  },
  {
    name: 'es_index_segments',
    description: 'Return Lucene segment details for an index.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_list_transforms',
    description: 'List transforms with their status and destination.',
    inputSchema: schema({}),
  },
  {
    name: 'es_get_transform',
    description: 'Get one transform definition and metadata.',
    inputSchema: schema({ id: val('string', 'Transform id.') }, ['id']),
  },
  {
    name: 'es_transform_stats',
    description: 'Return transform progress and failure statistics.',
    inputSchema: schema({ id: val('string', 'Transform id.') }, ['id']),
  },
  {
    name: 'es_put_transform',
    description: 'Create or update a transform; write permission required.',
    inputSchema: schema({
      id: val('string', 'Transform id.'),
      body: val('object', 'Transform body object or JSON object string.'),
    }, ['id', 'body']),
  },
  {
    name: 'es_start_transform',
    description: 'Start a transform; write permission required.',
    inputSchema: schema({ id: val('string', 'Transform id.') }, ['id']),
  },
  {
    name: 'es_stop_transform',
    description: 'Stop a transform; write permission required.',
    inputSchema: schema({ id: val('string', 'Transform id.') }, ['id']),
  },
  {
    name: 'es_delete_transform',
    description: 'Delete a transform; write permission required.',
    inputSchema: schema({ id: val('string', 'Transform id.') }, ['id']),
  },
  {
    name: 'es_search',
    description: 'Run an Elasticsearch DSL search and return the raw response.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      body: val('object', 'Optional full search body with aggs/sort/search_after/highlight.'),
      query: val('object', 'Elasticsearch query object, or a JSON string.'),
      size: val('integer', 'Number of hits, 1-100.'),
      explain: val('boolean', 'Include _explanation in hits.'),
      profile: val('boolean', 'Include the profile tree.'),
    }, ['index']),
  },
  {
    name: 'es_count',
    description: 'Count documents matching a query.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      query: val('object', 'Query object, or a JSON string.'),
    }, ['index']),
  },
  {
    name: 'es_sql',
    description: 'Run an Elasticsearch SQL query and return columns, rows and cursor.',
    inputSchema: schema({
      query: val('string', 'SQL text.'),
      fetchSize: val('integer', 'Fetch size, 1-5000.'),
    }, ['query']),
  },
  {
    name: 'es_explain_doc',
    description: 'Explain one document against a query using _explain.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
      query: val('object', 'Query object, or a JSON string.'),
    }, ['index', 'id']),
  },
  {
    name: 'es_get_index_stats',
    description: 'Return index stats.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_msearch',
    description: 'Run multiple search requests in one _msearch call.',
    inputSchema: schema({
      index: val('string', 'Default index or alias for searches that omit index.'),
      searches: val('array', 'Array of {index?, body?, query?, size?} search objects.'),
    }, ['searches']),
  },
  {
    name: 'es_mget',
    description: 'Get multiple documents by id in one _mget call.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      ids: val('array', 'Document ids.'),
    }, ['index', 'ids']),
  },
  {
    name: 'es_scroll_start',
    description: 'Start a scroll search for ES 6/7 compatibility.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      scroll: val('string', 'Keep-alive such as 1m (default 1m).'),
      body: val('object', 'Optional full search body.'),
      query: val('object', 'Optional query object or JSON string.'),
      size: val('integer', 'Number of hits, 1-100.'),
    }, ['index']),
  },
  {
    name: 'es_scroll_next',
    description: 'Fetch the next page of a scroll search.',
    inputSchema: schema({
      scrollId: val('string', 'Scroll id returned by es_scroll_start.'),
      scroll: val('string', 'Keep-alive such as 1m.'),
    }, ['scrollId']),
  },
  {
    name: 'es_scroll_clear',
    description: 'Clear one or more scroll contexts.',
    inputSchema: schema({
      scrollId: val('string', 'Optional single scroll id.'),
      scrollIds: val('array', 'Optional scroll id array.'),
    }),
  },
  {
    name: 'es_resolve_index',
    description: 'Resolve indices, aliases and data streams by name or pattern.',
    inputSchema: schema({ name: val('string', 'Index, alias or data stream name or pattern.') }, ['name']),
  },
  {
    name: 'es_search_shards',
    description: 'Return shard routing for a search request.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      routing: val('string', 'Optional routing value.'),
    }, ['index']),
  },
  {
    name: 'es_rank_eval',
    description: 'Evaluate ranked search results with _rank_eval.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      body: val('object', 'Rank evaluation body or JSON object string.'),
    }, ['index', 'body']),
  },
  {
    name: 'es_cluster_stats',
    description: 'Return cluster-wide statistics.',
    inputSchema: schema({}),
  },
  {
    name: 'es_refresh_index',
    description: 'Refresh an index so recent writes become searchable; write permission required.',
    inputSchema: schema({ index: val('string', 'Concrete index name.') }, ['index']),
  },
  {
    name: 'es_flush_index',
    description: 'Flush an index to disk; write permission required.',
    inputSchema: schema({ index: val('string', 'Concrete index name.') }, ['index']),
  },
  {
    name: 'es_index_close',
    description: 'Close a concrete index; write permission required.',
    inputSchema: schema({ index: val('string', 'Concrete index name.') }, ['index']),
  },
  {
    name: 'es_index_open',
    description: 'Open a concrete index; write permission required.',
    inputSchema: schema({ index: val('string', 'Concrete index name.') }, ['index']),
  },
  {
    name: 'es_bulk',
    description: 'Run a bulk request from an operations array; write permission required.',
    inputSchema: schema({
      index: val('string', 'Default index or alias for operations that omit index.'),
      operations: val('array', 'Array of {action,index?,id?,document?} operations.'),
      refresh: val('string', 'Optional refresh: true, false or wait_for.'),
      pipeline: val('string', 'Optional ingest pipeline id.'),
      timeout: val('string', 'Optional request timeout.'),
      waitForActiveShards: val('string', 'Optional wait_for_active_shards value.'),
    }, ['operations']),
  },
  {
    name: 'es_terms_enum',
    description: 'Enumerate field terms with the _terms_enum API.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      field: val('string', 'Field name.'),
      query: val('object', 'Optional query object or JSON string.'),
      size: val('integer', 'Maximum terms, 1-1000.'),
      caseInsensitive: val('boolean', 'Case-insensitive matching.'),
    }, ['index', 'field']),
  },
  {
    name: 'es_field_caps',
    description: 'Return field capabilities across one or more indices.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      fields: val('string', 'Comma-separated field patterns (default *).'),
    }, ['index']),
  },
  {
    name: 'es_task_cancel',
    description: 'Cancel a running cluster task by node:task id; write permission required.',
    inputSchema: schema({ taskId: val('string', 'Task id in node:number form.') }, ['taskId']),
  },
  {
    name: 'es_sql_cursor',
    description: 'Fetch the next page of an Elasticsearch SQL cursor.',
    inputSchema: schema({
      cursor: val('string', 'Cursor returned by es_sql.'),
      timeZone: val('string', 'Optional time zone, identical to the first query.'),
      columnar: val('boolean', 'Optional columnar flag, identical to the first query.'),
    }, ['cursor']),
  },
  {
    name: 'es_sql_close',
    description: 'Close an Elasticsearch SQL cursor.',
    inputSchema: schema({ cursor: val('string', 'Cursor returned by es_sql.') }, ['cursor']),
  },
  {
    name: 'es_sql_translate',
    description: 'Translate an SQL query into Elasticsearch DSL.',
    inputSchema: schema({
      body: val('object', "SQL translate body such as {query:'SELECT ...'}."),
    }, ['body']),
  },
  {
    name: 'es_pit_open',
    description: 'Open a point-in-time reader for deep pagination.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      keepAlive: val('string', 'Keep-alive such as 5m (default 5m).'),
    }, ['index']),
  },
  {
    name: 'es_pit_search',
    description: 'Search a point-in-time reader; body must include pit.id.',
    inputSchema: schema({
      body: val('object', 'Search body object or JSON string with pit.id.'),
    }, ['body']),
  },
  {
    name: 'es_pit_close',
    description: 'Close a point-in-time reader by id.',
    inputSchema: schema({ pitId: val('string', 'PIT id returned by es_pit_open.') }, ['pitId']),
  },
  {
    name: 'es_create_index',
    description: 'Create a concrete index with optional settings and mappings; write permission required.',
    inputSchema: schema({
      index: val('string', 'Concrete index name.'),
      settings: val('object', 'Optional settings object or JSON object string.'),
      mappings: val('object', 'Optional mappings object or JSON object string.'),
    }, ['index']),
  },
  {
    name: 'es_delete_index',
    description: 'Delete one concrete index; write permission required.',
    inputSchema: schema({ index: val('string', 'Concrete index name.') }, ['index']),
  },
  {
    name: 'es_put_mapping',
    description: 'Add or update field mappings on an index; write permission required.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      mappings: val('object', 'Mappings body such as {properties:{...}}.'),
    }, ['index', 'mappings']),
  },
  {
    name: 'es_update_settings',
    description: 'Update dynamic index settings; write permission required.',
    inputSchema: schema({
      index: val('string', 'Concrete index name.'),
      settings: val('object', 'Settings object, for example {index:{number_of_replicas:2}}.'),
    }, ['index', 'settings']),
  },
  {
    name: 'es_alias',
    description: 'Apply atomic alias actions (add/remove); write permission required.',
    inputSchema: schema({
      actions: val('array', 'Array of alias actions such as {add:{index,alias}} or {remove:{index,alias}}.'),
    }, ['actions']),
  },
  {
    name: 'es_rollover',
    description: 'Roll over an alias to a new index, optionally as a dry run; write permission required.',
    inputSchema: schema({
      alias: val('string', 'Alias to roll over.'),
      conditions: val('object', 'Optional rollover conditions object or JSON object string.'),
      dryRun: val('boolean', 'Only validate conditions without rolling over.'),
    }, ['alias']),
  },
  {
    name: 'es_force_merge',
    description: 'Force-merge index segments; write permission required.',
    inputSchema: schema({
      index: val('string', 'Concrete index name.'),
      maxNumSegments: val('integer', 'Target segment count, 1-1000 (default 1).'),
    }, ['index']),
  },
  {
    name: 'es_put_template',
    description: 'Create or update an index or component template; write permission required.',
    inputSchema: schema({
      name: val('string', 'Template name.'),
      kind: val('string', 'Template kind: index (default) or component.'),
      template: val('object', 'Template body object or JSON object string.'),
    }, ['name', 'template']),
  },
  {
    name: 'es_delete_template',
    description: 'Delete an index or component template; write permission required.',
    inputSchema: schema({
      name: val('string', 'Template name.'),
      kind: val('string', 'Template kind: index (default) or component.'),
    }, ['name']),
  },
  {
    name: 'es_update_by_query',
    description: 'Run _update_by_query with an optional query and script; write permission required.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      query: val('object', 'Optional query object or JSON string (default match_all).'),
      script: val('object', 'Optional script object or JSON string.'),
      maxDocs: val('integer', 'Optional maximum documents to update.'),
      waitForCompletion: val('boolean', 'Wait for completion instead of returning a task id.'),
      refresh: val('boolean', 'Refresh affected shards after the operation.'),
    }, ['index']),
  },
  {
    name: 'es_delete_by_query',
    description: 'Run _delete_by_query with an explicit query; write permission required.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      query: val('object', 'Required query object or JSON string.'),
      maxDocs: val('integer', 'Optional maximum documents to delete.'),
      waitForCompletion: val('boolean', 'Wait for completion instead of returning a task id.'),
      refresh: val('boolean', 'Refresh affected shards after the operation.'),
    }, ['index', 'query']),
  },
  {
    name: 'es_reindex',
    description: 'Run _reindex with a source/dest body; write permission required.',
    inputSchema: schema({
      body: val('object', 'Reindex body with source and dest, or a JSON object string.'),
      slices: val('integer', 'Optional number of slices.'),
      waitForCompletion: val('boolean', 'Wait for completion instead of returning a task id.'),
      refresh: val('boolean', 'Refresh affected shards after the operation.'),
      requestsPerSecond: val('number', 'Optional throttle.'),
    }, ['body']),
  },
  {
    name: 'es_analyze',
    description: 'Test an analyzer or tokenizer with _analyze.',
    inputSchema: schema({
      index: val('string', 'Optional index name; omit for the global analyzer.'),
      body: val('object', 'Analyze body such as {analyzer,text} or {tokenizer,text}.'),
    }, ['body']),
  },
  {
    name: 'es_validate_query',
    description: 'Validate a query and return Lucene rewrite details.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      body: val('object', 'Query body object or JSON object string.'),
    }, ['index', 'body']),
  },
  {
    name: 'es_term_vectors',
    description: 'Return term vectors for one document field.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
      fields: val('string', 'Optional comma-separated fields.'),
    }, ['index', 'id']),
  },
  {
    name: 'es_search_template',
    description: 'Execute an inline search template against an index.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      body: val('object', 'Template body with inline source and params.'),
    }, ['index', 'body']),
  },
  {
    name: 'es_render_template',
    description: 'Render an inline search template without executing it.',
    inputSchema: schema({
      body: val('object', 'Template body with inline source and params.'),
    }, ['body']),
  },
  {
    name: 'es_analysis_settings',
    description: 'Return analyzer, tokenizer, filter and normalizer settings for an index.',
    inputSchema: schema({ index: val('string', 'Index name.') }, ['index']),
  },
  {
    name: 'es_update_analysis_settings',
    description: 'Update analysis settings using a close/update/open sequence; write permission required.',
    inputSchema: schema({
      index: val('string', 'Concrete index name.'),
      body: val('object', 'Settings body with analysis configuration.'),
    }, ['index', 'body']),
  },
  {
    name: 'es_reload_analyzers',
    description: 'Reload search analyzers after synonym or dictionary changes; write permission required.',
    inputSchema: schema({ index: val('string', 'Concrete index name.') }, ['index']),
  },
  {
    name: 'es_synonyms_upsert',
    description: 'Replace a synonym_graph filter; write permission required.',
    inputSchema: schema({
      index: val('string', 'Concrete index name.'),
      entries: val('array', 'Synonym rules.'),
      filter: val('string', 'Filter name (default custom_synonyms).'),
      expand: val('boolean', 'Expand equivalent synonyms.'),
    }, ['index', 'entries']),
  },
  {
    name: 'es_reindex_preview',
    description: 'Estimate reindex document count and target size without writing.',
    inputSchema: schema({
      source: val('string', 'Source index or alias name.'),
      query: val('object', 'Optional query object or JSON string.'),
    }, ['source']),
  },
  {
    name: 'es_index_settings_defaults',
    description: 'Return index settings including defaults.',
    inputSchema: schema({ index: val('string', 'Concrete index name.') }, ['index']),
  },
  {
    name: 'es_index_detail',
    description: 'Return mapping, settings, aliases and sample documents for an index.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      sampleSize: val('integer', 'Sample documents, 0-20 (default 5).'),
    }, ['index']),
  },
  {
    name: 'es_allocation_explain',
    description: 'Explain shard allocation, optionally for one index or shard.',
    inputSchema: schema({
      body: val('object', 'Optional {index, shard, primary} body.'),
    }),
  },
  {
    name: 'es_shard_stores',
    description: 'Return shard store allocation and health for an index.',
    inputSchema: schema({
      index: val('string', 'Index name.'),
      status: val('string', 'Optional status filter such as red,yellow.'),
    }, ['index']),
  },
  {
    name: 'es_pending_tasks',
    description: 'List pending master tasks.',
    inputSchema: schema({}),
  },
  {
    name: 'es_slm_policies',
    description: 'List snapshot lifecycle management policies.',
    inputSchema: schema({}),
  },
  {
    name: 'es_put_slm_policy',
    description: 'Create or update an SLM policy; write permission required.',
    inputSchema: schema({
      policyId: val('string', 'SLM policy id.'),
      body: val('object', 'SLM policy body object or JSON object string.'),
    }, ['policyId', 'body']),
  },
  {
    name: 'es_delete_slm_policy',
    description: 'Delete an SLM policy; write permission required.',
    inputSchema: schema({ policyId: val('string', 'SLM policy id.') }, ['policyId']),
  },
  {
    name: 'es_slm_status',
    description: 'Return SLM service status and stats.',
    inputSchema: schema({}),
  },
  {
    name: 'es_slm_execute',
    description: 'Execute an SLM policy immediately; write permission required.',
    inputSchema: schema({ policyId: val('string', 'SLM policy id.') }, ['policyId']),
  },
  {
    name: 'es_nodes_stats',
    description: 'Return JVM, filesystem, OS and thread-pool stats per node.',
    inputSchema: schema({}),
  },
  {
    name: 'es_hot_threads',
    description: 'Return hot threads, optionally for one node.',
    inputSchema: schema({
      threads: val('integer', 'Number of threads, 1-100 (default 3).'),
      interval: val('string', 'Sampling interval such as 500ms.'),
      type: val('string', 'wait, block or cpu.'),
      nodeId: val('string', 'Optional node id.'),
    }),
  },
  {
    name: 'es_remote_clusters',
    description: 'List remote cluster connections and local cluster identity.',
    inputSchema: schema({}),
  },
  {
    name: 'es_plugins',
    description: 'Return the installed plugin matrix across nodes.',
    inputSchema: schema({}),
  },
  {
    name: 'es_watcher',
    description: 'Return Watcher stats and watches when available.',
    inputSchema: schema({}),
  },
  {
    name: 'es_put_watch',
    description: 'Create or update a watch; write permission required.',
    inputSchema: schema({
      id: val('string', 'Watch id.'),
      body: val('object', 'Watch body object or JSON object string.'),
    }, ['id', 'body']),
  },
  {
    name: 'es_delete_watch',
    description: 'Delete a watch; write permission required.',
    inputSchema: schema({ id: val('string', 'Watch id.') }, ['id']),
  },
  {
    name: 'es_execute_watch',
    description: 'Execute a watch immediately; write permission required.',
    inputSchema: schema({ id: val('string', 'Watch id.') }, ['id']),
  },
  {
    name: 'es_ingest_pipelines',
    description: 'List ingest pipelines, or one pipeline by id.',
    inputSchema: schema({ id: val('string', 'Optional pipeline id.') }),
  },
  {
    name: 'es_put_ingest_pipeline',
    description: 'Create or update an ingest pipeline; write permission required.',
    inputSchema: schema({
      id: val('string', 'Pipeline id.'),
      body: val('object', 'Pipeline body object or JSON object string.'),
    }, ['id', 'body']),
  },
  {
    name: 'es_delete_ingest_pipeline',
    description: 'Delete an ingest pipeline; write permission required.',
    inputSchema: schema({ id: val('string', 'Pipeline id.') }, ['id']),
  },
  {
    name: 'es_cat_allocation',
    description: 'Return shard allocation and disk usage by node.',
    inputSchema: schema({}),
  },
  {
    name: 'es_get_cluster_settings',
    description: 'Return persistent, transient and default cluster settings.',
    inputSchema: schema({}),
  },
  {
    name: 'es_update_cluster_settings',
    description: 'Update persistent or transient cluster settings; write permission required.',
    inputSchema: schema({
      body: val('object', 'Settings body such as {persistent:{...}} or {transient:{...}}.'),
    }, ['body']),
  },
  {
    name: 'es_reroute',
    description: 'Apply cluster reroute commands, optionally as a dry run; write permission required.',
    inputSchema: schema({
      body: val('object', 'Reroute body such as {commands:[{move:{...}}]}.'),
      dryRun: val('boolean', 'Only validate the commands.'),
      explain: val('boolean', 'Include explanations (default true).'),
      retryFailed: val('boolean', 'Retry failed shard allocations.'),
    }, ['body']),
  },
  {
    name: 'es_list_snapshot_repos',
    description: 'List snapshot repositories with secrets masked for non-admin keys.',
    inputSchema: schema({}),
  },
  {
    name: 'es_put_snapshot_repo',
    description: 'Create or update a snapshot repository; write permission required.',
    inputSchema: schema({
      repo: val('string', 'Snapshot repository name.'),
      body: val('object', 'Repository body object or JSON object string.'),
    }, ['repo', 'body']),
  },
  {
    name: 'es_delete_snapshot_repo',
    description: 'Delete a snapshot repository; write permission required.',
    inputSchema: schema({ repo: val('string', 'Snapshot repository name.') }, ['repo']),
  },
  {
    name: 'es_list_snapshots',
    description: 'List snapshots in a repository.',
    inputSchema: schema({ repo: val('string', 'Snapshot repository name.') }, ['repo']),
  },
  {
    name: 'es_snapshot_status',
    description: 'Return snapshot progress for a repository or snapshot.',
    inputSchema: schema({
      repo: val('string', 'Optional snapshot repository name.'),
      name: val('string', 'Optional snapshot name.'),
    }),
  },
  {
    name: 'es_create_snapshot',
    description: 'Create a snapshot; write permission required.',
    inputSchema: schema({
      repo: val('string', 'Snapshot repository name.'),
      name: val('string', 'Snapshot name.'),
      body: val('object', 'Optional body with indices or include_global_state.'),
    }, ['repo', 'name']),
  },
  {
    name: 'es_delete_snapshot',
    description: 'Delete a snapshot; write permission required.',
    inputSchema: schema({
      repo: val('string', 'Snapshot repository name.'),
      name: val('string', 'Snapshot name.'),
    }, ['repo', 'name']),
  },
  {
    name: 'es_restore_snapshot',
    description: 'Restore a snapshot; write permission required.',
    inputSchema: schema({
      repo: val('string', 'Snapshot repository name.'),
      name: val('string', 'Snapshot name.'),
      body: val('object', 'Optional restore body with indices or rename_pattern.'),
    }, ['repo', 'name']),
  },
  {
    name: 'es_ilm_policies',
    description: 'List ILM policies.',
    inputSchema: schema({}),
  },
  {
    name: 'es_ilm_explain',
    description: 'Explain the ILM state of an index.',
    inputSchema: schema({ index: val('string', 'Index name or pattern.') }, ['index']),
  },
  {
    name: 'es_ilm_status',
    description: 'Return the ILM service status.',
    inputSchema: schema({}),
  },
  {
    name: 'es_put_ilm_policy',
    description: 'Create or update an ILM policy; write permission required.',
    inputSchema: schema({
      name: val('string', 'ILM policy name.'),
      policy: val('object', 'Policy body such as {policy:{phases:{...}}}.'),
    }, ['name', 'policy']),
  },
  {
    name: 'es_delete_ilm_policy',
    description: 'Delete an ILM policy; write permission required.',
    inputSchema: schema({ name: val('string', 'ILM policy name.') }, ['name']),
  },
  {
    name: 'es_ilm_move',
    description: 'Move an index to a specific ILM step; write permission required.',
    inputSchema: schema({
      index: val('string', 'Index name.'),
      body: val('object', 'Move body with current_step and next_step.'),
    }, ['index', 'body']),
  },
  {
    name: 'es_ilm_start',
    description: 'Start the ILM service; write permission required.',
    inputSchema: schema({}),
  },
  {
    name: 'es_ilm_stop',
    description: 'Stop the ILM service; write permission required.',
    inputSchema: schema({}),
  },
  {
    name: 'es_list_scripts',
    description: 'List stored scripts.',
    inputSchema: schema({}),
  },
  {
    name: 'es_put_script',
    description: 'Create or update a stored script; write permission required.',
    inputSchema: schema({
      id: val('string', 'Script id.'),
      script: val('object', 'Script body such as {script:{lang,source}}.'),
    }, ['id', 'script']),
  },
  {
    name: 'es_delete_script',
    description: 'Delete a stored script; write permission required.',
    inputSchema: schema({ id: val('string', 'Script id.') }, ['id']),
  },
  {
    name: 'es_task_detail',
    description: 'Return details for one cluster task by node:task id.',
    inputSchema: schema({ taskId: val('string', 'Task id in node:number form.') }, ['taskId']),
  },
  {
    name: 'es_index_doc',
    description: 'Create or overwrite a document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
      document: val('object', 'Document body object, or a JSON object string.'),
    }, ['index', 'id', 'document']),
  },
  {
    name: 'es_update_doc',
    description: 'Partially update fields of a document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
      document: val('object', 'Partial document object, or a JSON object string.'),
    }, ['index', 'id', 'document']),
  },
  {
    name: 'es_delete_doc',
    description: 'Delete a document by id.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      id: val('string', 'Document id.'),
    }, ['index', 'id']),
  },
  {
    name: 'es_rest',
    description: 'Run a raw Elasticsearch REST request; write methods require write permission.',
    inputSchema: schema({
      method: val('string', 'GET, HEAD, POST, PUT or DELETE.'),
      path: val('string', 'REST path starting with /.'),
      body: val('object', 'Optional JSON body object or string.'),
    }, ['method', 'path']),
  },
  {
    name: 'es_adhoc_prepare',
    description: 'Probe managed rebuild source: alias form, physical indices, settings/mapping, doc count, suggested target name, time-field candidates.',
    inputSchema: schema({ index: val('string', 'Index or alias name.') }, ['index']),
  },
  {
    name: 'es_adhoc_start',
    description: 'Start a managed adhoc rebuild job for a logical index (INCREMENTAL, WRITE_BLOCK or MANUAL strategy); write permission required.',
    inputSchema: schema({
      index: val('string', 'Index or alias name.'),
      strategy: val('string', 'INCREMENTAL, WRITE_BLOCK or MANUAL.'),
      timeField: val('string', 'Time field used by the INCREMENTAL strategy to catch up.'),
      destIndex: val('string', 'Optional target physical index name; defaults to a suggested name.'),
      settingsJson: val('object', 'Optional settings JSON object or string; defaults to the source settings.'),
      mappingJson: val('object', 'Optional mapping JSON object or string; defaults to the source mapping.'),
      bufferMs: val('number', 'Incremental catch-up buffer window in milliseconds.'),
      deleteOldIndex: val('boolean', 'Delete the old physical index after the switch.'),
      confirmDirectSwap: val('boolean', 'Confirm the direct physical-index swap window when the source is not an alias.'),
      pauseBeforeSwitch: val('boolean', 'Pause before the alias switch for manual confirmation.'),
    }, ['index', 'strategy']),
  },
  {
    name: 'es_adhoc_status',
    description: 'Get one managed adhoc rebuild job progress snapshot by job id.',
    inputSchema: schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId']),
  },
  {
    name: 'es_adhoc_abort',
    description: 'Request abort of a running managed rebuild job by job id; write permission required.',
    inputSchema: schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId']),
  },
  {
    name: 'es_adhoc_confirm_switch',
    description: 'Release the pre-switch pause gate of a managed rebuild job by job id; write permission required.',
    inputSchema: schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId']),
  },
  {
    name: 'es_adhoc_jobs',
    description: 'List managed adhoc rebuild jobs, newest first.',
    inputSchema: schema({}),
  },
  {
    name: 'es_adhoc_retry',
    description: 'Retry a failed or aborted managed rebuild job by id, reusing its original configuration; write permission required.',
    inputSchema: schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId']),
  },
  {
    name: 'es_adhoc_delete_jobs',
    description: 'Delete one terminal managed rebuild job by id, or purge terminal jobs older than a number of days; write permission required.',
    inputSchema: schema({
      jobId: val('string', 'Managed rebuild job id to delete; mutually exclusive with olderThanDays.'),
      olderThanDays: val('number', 'Purge terminal jobs finished before this many days; mutually exclusive with jobId.'),
    }),
  },
  {
    name: 'es_adhoc_throttle',
    description: 'Rethrottle the in-flight reindex task of a managed rebuild job (requestsPerSecond, -1 for unlimited); write permission required.',
    inputSchema: schema({
      jobId: val('string', 'Managed rebuild job id.'),
      requestsPerSecond: val('number', 'New throttle in docs per second; -1 restores unlimited.'),
    }, ['jobId', 'requestsPerSecond']),
  },
  {
    name: 'es_adhoc_events',
    description: '读取托管重建作业的事件时间线（作业创建、轮次账本、确认门与收尾，ts 升序），按 jobId 回放。',
    inputSchema: schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId']),
  },
  {
    name: 'es_xmigrate_probe_capabilities',
    description: '探测目标集群能力：版本/发行版/厂商推断(阿里云·腾讯云·AWS·Elastic·自建)/插件清单/节点规模，为结构同步兼容剔除提供依据。',
    inputSchema: schema({
      connection: val('string', 'Connection id to probe; use host for the active host connection.'),
      index: val('string', 'Optional index name to attach an index profile (aliases/bytes/shards/docCount/fieldTypeCounts) to the probe result.'),
    }, ['connection']),
  },
  {
    name: 'es_xmigrate_preflight',
    description: 'Cross-cluster migration preflight: report whether the dest index already exists so a merge instead of a clean rebuild is visible before start.',
    inputSchema: schema({
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destIndex: val('string', 'Target index name on the host cluster.'),
    }, ['sourceIndex', 'destIndex']),
  },
  {
    name: 'es_xmigrate_start',
    description: 'Start a cross-cluster migration job from a stored source connection profile (srcConnId) into the host cluster; write permission required.',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destIndex: val('string', 'Target index name on the host cluster.'),
      destCreateMode: val('string', 'NONE, COPY_FROM_SOURCE, FROM_ENTITY or REBUILD (default NONE).'),
      tuneMode: val('string', 'AGGRESSIVE or GENTLE (default AGGRESSIVE).'),
      slices: val('integer', 'Sliced scroll workers, capped at 32.'),
      batchSize: val('integer', 'Scroll/bulk batch size, capped at 10000.'),
      forceMerge: val('boolean', 'Force-merge the dest index after completion.'),
    }, ['srcConnId', 'sourceIndex', 'destIndex']),
  },
  {
    name: 'es_xmigrate_status',
    description: 'Get one cross-cluster migration job progress snapshot by job id.',
    inputSchema: schema({ jobId: val('string', 'Cross-cluster migration job id.') }, ['jobId']),
  },
  {
    name: 'es_xmigrate_jobs',
    description: 'List recent cross-cluster migration jobs, newest first.',
    inputSchema: schema({ limit: val('integer', 'Maximum jobs to return, 1-500 (default 20).') }),
  },
  {
    name: 'es_xmigrate_fetch_config',
    description: 'Fetch mapping and settings of a source index from the stored source connection profile for preview before creating the dest index.',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
    }, ['srcConnId', 'sourceIndex']),
  },
  {
    name: 'es_xmigrate_resume',
    description: 'Resume a failed or interrupted cross-cluster migration job with the stored source connection profile; write permission required.',
    inputSchema: schema({
      jobId: val('string', 'Cross-cluster migration job id.'),
      srcConnId: val('string', 'Stored source connection profile id of this job.'),
    }, ['jobId', 'srcConnId']),
  },
  {
    name: 'es_xmigrate_abort',
    description: 'Abort a running cross-cluster migration job by job id; write permission required.',
    inputSchema: schema({ jobId: val('string', 'Cross-cluster migration job id.') }, ['jobId']),
  },
  {
    name: 'es_xmigrate_reconcile',
    description: 'Reconcile document counts between a migration source index on the old cluster and its dest index on the host side: srcCount, destCount and diff in one call.',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destConnId: val('string', 'Host-side connection id for the dest count (host, or an id from discovery).'),
      destIndex: val('string', 'Target index name on the host side.'),
    }, ['srcConnId', 'sourceIndex', 'destConnId', 'destIndex']),
  },
  {
    name: 'es_xmigrate_conflicts',
    description: 'Read the version-conflict id sample ring (cap 1000) and total conflict count of one cross-cluster migration job by job id.',
    inputSchema: schema({ jobId: val('string', 'Cross-cluster migration job id.') }, ['jobId']),
  },
  {
    name: 'es_xmigrate_events',
    description: '回放一个跨集群迁移作业的事件时间线（ts/stage/message/level，升序，环容量 200）：断线重连或事后复盘时按 jobId 读取推进过程。',
    inputSchema: schema({ jobId: val('string', 'Cross-cluster migration job id.') }, ['jobId']),
  },
  {
    name: 'es_xmigrate_connect_check',
    description: '用存储的源连接档案检查旧集群连通性并返回源侧非系统索引清单（健康、文档数与存储大小）。',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
    }, ['srcConnId']),
  },
  {
    name: 'es_xmigrate_resolve_preview',
    description: '预览源连接档案解析后的连接形态（scheme、host、port、用户名与凭据是否已存），不回显明文密码。',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
    }, ['srcConnId']),
  },
  {
    name: 'es_xmigrate_dest_indices',
    description: '列出宿主集群（迁移目标侧）的非系统索引清单，用于目标索引名核对与补全。',
    inputSchema: schema({}),
  },
  {
    name: 'es_xmigrate_delete_jobs',
    description: '删除一条终态跨集群迁移作业记录，或按 olderThanDays 批量清理终态记录；写权限。',
    inputSchema: schema({
      jobId: val('string', 'Cross-cluster migration job id to delete; mutually exclusive with olderThanDays.'),
      olderThanDays: val('number', 'Purge terminal migration jobs finished before this many days; mutually exclusive with jobId.'),
    }),
  },
  {
    name: 'es_xmigrate_sync_structure',
    description: '把存储源连接档案上的索引结构（settings/mapping）同步到宿主集群目标索引：兼容矩阵预剔除（planned）+ 目标报错兜底剔除（reactive）；dryRun=true 只出计划不写目标（无需写权限，报告含 planDigest 与适配后 create body），dryRun=false 需写权限并逐轮重试，可带 expectPlanDigest 做 plan drift 校验；写权限。',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destIndex: val('string', 'Target index name on the host cluster (default: same as sourceIndex).'),
      destConnId: val('string', 'Host-side connection id of the sync target (host, or an id from discovery; default host).'),
      downgradedAnalyzerFallback: val('string', 'Fallback analyzer for downgraded fields; omitted downgrades to the standard analyzer; normalizer attributes are always removed.'),
      dryRun: val('boolean', 'Preview the compat-matrix prune plan without PUT (default false; no write permission needed).'),
      syncAliases: val('boolean', 'Carry the source index aliases over to the dest index after creation (default false).'),
      expectPlanDigest: val('string', 'planDigest from a prior dry-run; on execute the request is rejected when the plan drifted.'),
    }, ['srcConnId', 'sourceIndex']),
  },
  {
    name: 'es_xmigrate_smart_sync',
    description: '智能结构同步一步式（es_xmigrate 第 20 个 action）：探测目标集群能力后按兼容矩阵整形源索引结构（含 version-floor/store-type-vendor 剔除与插件级联降级），apply=false（缺省）只读预览（免写门/免确认，报告含 planDigest 与适配后 create body、planned 三清单带 rule/reason 溯源、autoTuned 分片收敛清单），apply=true 落盘建索引（需写权限与二次确认，可带 expectPlanDigest 做 plan drift 校验，verdict PLANNED/APPLIED/PLAN_DRIFT）；写权限（apply=true 时）。',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id (source/production cluster); inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destConnId: val('string', 'Target/UAT connection id; "host" means the host cluster the plugin connects to (required).'),
      destIndex: val('string', 'Target index name on the target cluster (default: same as sourceIndex).'),
      syncAliases: val('boolean', 'Carry the source index aliases over after creation (default false).'),
      downgradedAnalyzerFallback: val('string', 'Fallback analyzer for downgraded fields; default the standard analyzer (normalizer attributes are always removed).'),
      autoTune: val('boolean', 'Shrink source shards to min(src, data nodes) when they exceed the target data-node count; skipped with a warning when the target data-node count is unreliable (default false).'),
      apply: val('boolean', 'false (default) = read-only preview (no write gate, no confirmation); true = create the index on the target (write gate + confirmation required).'),
      expectPlanDigest: val('string', 'planDigest from a prior preview; only valid with apply=true, the request is rejected (verdict PLAN_DRIFT) when the plan drifted.'),
      savePlan: val('boolean', 'smart_sync only: true stores this preview as a saved sync plan and returns planId (reusable through plan_list / plan_apply); preview only (apply=false), rejected with apply=true.'),
    }, ['srcConnId', 'sourceIndex', 'destConnId']),
  },
  {
    name: 'es_xmigrate_plan_list',
    description: '已存同步计划列表（es_xmigrate 第 21 个 action，只读）：列出 smart_sync 预览时保存的同步计划，按保存时间倒序，最多 50 条（cappedAt）。每行 12 键：planId/srcConnId/sourceIndex/destConnId/destIndex/mode/autoTune/syncAliases/planDigest/savedAtMs/appliedAtMs/appliedCount；身份低于 REBUILD_OP 时不返回 srcConnId。台账读取失败时附 warning，不把读取失败显示成「没有计划」。',
    inputSchema: schema({}),
  },
  {
    name: 'es_xmigrate_plan_apply',
    description: '按已存同步计划执行（es_xmigrate 第 22 个 action，写 + 二次确认）：按计划保存的参数重跑 smart_sync 的执行形态；漂移校验缺省用计划保存时的 planDigest，expectPlanDigest 可覆盖，源结构与保存时不一致时在写入前以 PLAN_DRIFT 拒绝；执行成功后记录 appliedAtMs/appliedCount，返回执行报告并回显 planId；计划不存在报 PLAN_NOT_FOUND。',
    inputSchema: schema({
      planId: val('string', 'Saved sync plan id returned by smart_sync with savePlan=true.'),
      expectPlanDigest: val('string', 'Optional expected plan digest; defaults to the digest stored with the plan, a mismatch is rejected as PLAN_DRIFT before any write.'),
    }, ['planId']),
  },
  {
    name: 'es_xmigrate_compare_capabilities',
    description: '对比源/目标集群能力并给出风险矩阵：版本差（versionGap）、厂商切换（vendor_change）、仅源有的插件（plugin_missing/high）、源分片过碎（shard_oversize），为跨厂商结构同步预判风险。',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Optional source index name to evaluate the shard-oversize risk.'),
      destConnId: val('string', 'Host-side connection id of the target cluster (host, or an id from discovery; defaults to the active connection).'),
      destIndex: val('string', 'Optional target index name; defaults to sourceIndex.'),
    }, ['srcConnId']),
  },
  {
    name: 'es_xmigrate_diff_structure',
    description: '对比源索引与目标索引的 settings/mapping 结构差异：先按兼容矩阵计划得出 expectedRemovals（豁免清单），计划外差异进 unexpected 并给出 compatible 判定；目标索引不存在时如实报错。',
    inputSchema: schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destConnId: val('string', 'Host-side connection id of the target cluster (host, or an id from discovery; defaults to the active connection).'),
      destIndex: val('string', 'Target index name on the host side; defaults to sourceIndex.'),
    }, ['srcConnId', 'sourceIndex']),
  },
  {
    name: 'es_xmigrate_verify_equivalence',
    description: '校验迁移源/目标索引的数据等价（只读）：双侧 _count 对比、_doc 序 id 样本 mget 后按 canonical 摘要逐 id 对比、可选 terms 聚合对比；返回 verdict EQUIVALENT/DIVERGENT/INCONCLUSIVE。',
    inputSchema: schema({
      jobId: val('string', 'Cross-cluster migration job id; its registered srcConnId/sourceIndex/destIndex are reused.'),
      srcConnId: val('string', 'Source connection profile id; alternative to jobId (together with sourceIndex).'),
      sourceIndex: val('string', 'Source index name on the old cluster (required with srcConnId).'),
      destConnId: val('string', 'Dest connection id (host, or an id from discovery; defaults to the active connection).'),
      destIndex: val('string', 'Target index name; defaults to sourceIndex.'),
      sampleSize: val('number', 'Sample size of sorted-_doc ids to hash-compare, clamped to 10-500 (default 100).'),
      sampleFields: val('string', 'Comma-separated fields included in the digest; omit for the whole _source.'),
      aggField: val('string', 'Optional terms aggregation field compared on both sides.'),
      aggSize: val('number', 'Aggregation bucket size, clamped to 1-50 (default 10).'),
    }),
  },
  {
    name: 'es_xmigrate_throttle',
    description: '调节运行中的跨集群迁移作业速率（docs/s；-1 恢复不限速）；写权限。浏览器桥为批粒度限速（每秒窗口按 rps 截流）。',
    inputSchema: schema({
      jobId: val('string', 'Cross-cluster migration job id.'),
      rps: val('number', 'New throttle in docs per second; -1 restores unlimited.'),
    }, ['jobId', 'rps']),
  },
  {
    name: 'es_connection_probe',
    description: 'Probe one stored connection profile for live health: status, latency, version and last error.',
    inputSchema: schema({ connection: val('string', 'Connection id; optional. Use host for the control cluster, or an id returned by discovery.') }, ['connection']),
  },
  {
    name: 'es_monitor_metrics',
    description: 'Read collected cluster/node metrics time series for a connection; interval (60s/10m/1h/1d) switches to date_histogram aggregation.',
    inputSchema: schema({
      scope: val('string', 'cluster (default) or node.'),
      interval: val('string', 'Bucket width such as 60s, 10m, 1h or 1d; omit for raw docs.'),
      fromMs: val('number', 'Window start in epoch milliseconds.'),
      toMs: val('number', 'Window end in epoch milliseconds.'),
      size: val('integer', 'Maximum raw records, 1-2000 (default 2000).'),
    }),
  },
  {
    name: 'es_monitor_history',
    description: 'Read collected connection probe history records for a connection, newest first.',
    inputSchema: schema({
      status: val('string', 'Optional health status filter such as GREEN or RED.'),
      fromMs: val('number', 'Window start in epoch milliseconds.'),
      toMs: val('number', 'Window end in epoch milliseconds.'),
      size: val('integer', 'Maximum records, 1-1000 (default 200).'),
    }),
  },
  {
    name: 'es_config_validate',
    description: 'Three-layer config lab validation for candidate index settings/mapping (static rules, ES-side live checks when dryRun is set); read-only analysis, it does not create the index.',
    inputSchema: schema({
      settings: val('string', 'Candidate index settings as a JSON string; optional.'),
      mapping: val('string', 'Candidate index mapping as a JSON string; optional.'),
      dryRun: val('boolean', 'Create and delete a temporary index on the target cluster for live validation (default false).'),
    }),
  },
  {
    name: 'es_config_drift',
    description: 'Read the drift detail of one registered index key: code annotations vs live cluster, normalized JSON plus a diff summary.',
    inputSchema: schema({ indexKey: val('string', 'Registered index key from the config lab drift key list.') }, ['indexKey']),
  },
  {
    name: 'es_ops_audit',
    description: 'Read the console operation audit trail, newest first, filterable by user, action, URI prefix, keyword and time window; rank3 (REBUILD_OP+) semantics like the REST endpoint.',
    inputSchema: schema({
      username: val('string', 'Filter by operator username.'),
      action: val('string', 'Filter by audit action.'),
      uriPrefix: val('string', 'Filter by URI prefix.'),
      kw: val('string', 'Keyword filter across audit dimensions.'),
      fromMs: val('number', 'Window start in epoch milliseconds.'),
      toMs: val('number', 'Window end in epoch milliseconds.'),
      size: val('integer', 'Maximum records, 1-1000 (default 100).'),
      from: val('integer', 'Pagination offset, 0-10000 (default 0).'),
    }),
  },
  {
    name: 'es_insight_settings_impact',
    description: 'Read-only settings change impact analysis for one index: static/dynamic classification, hot-update gates and rebuild cost estimate; same engine as the console editor.',
    inputSchema: schema({
      index: val('string', 'Target index name.'),
      changes: val('object', 'Settings changes as an object, e.g. {"index.number_of_replicas": 2}.'),
    }, ['index', 'changes']),
  },
  {
    name: 'es_ring_usage',
    description: 'Read ring governance usage: audit and monitor index family store sizes, totals and the capacity cap (control-plane index prefixes are masked for non-admin identities).',
    inputSchema: schema({}),
  },
];

/** 可能删除/覆盖数据或中断集群状态的工具；与服务端 DESTRUCTIVE_TOOLS 同口径。 */
export const MCP_DESTRUCTIVE_TOOLS = [
  'es_delete_index', 'es_delete_doc', 'es_delete_by_query', 'es_delete_snapshot',
  'es_restore_snapshot', 'es_delete_template', 'es_delete_data_stream', 'es_delete_transform', 'es_delete_ingest_pipeline', 'es_delete_snapshot_repo', 'es_delete_slm_policy', 'es_delete_watch', 'es_delete_ilm_policy', 'es_delete_script',
  'es_bulk', 'es_rest',
  'es_adhoc_abort', 'es_adhoc_confirm_switch',
  'es_xmigrate_start', 'es_xmigrate_abort',
];

for (const tool of MCP_TOOLS) {
  tool.annotations = {
    readOnlyHint: !MCP_WRITE_TOOLS.includes(tool.name) && tool.name !== 'es_rest',
    destructiveHint: MCP_DESTRUCTIVE_TOOLS.includes(tool.name),
    openWorldHint: false,
  };
}

/** 工具分类：面板目录、密钥签发勾选与文档计数共用同一份分组，避免 UI 分类漂移。 */
export interface McpToolGroup {
  id: string;
  label: string;
  tools: string[];
}

export const MCP_TOOL_GROUPS: McpToolGroup[] = [
  { id: 'connections', label: '连接与发现', tools: ['es_list_connections', 'es_connection_probe'] },
  {
    id: 'search',
    label: '搜索与查询',
    tools: [
      'es_search', 'es_count', 'es_msearch', 'es_mget', 'es_scroll_start', 'es_scroll_next', 'es_scroll_clear',
      'es_search_shards', 'es_rank_eval', 'es_sql', 'es_sql_cursor', 'es_sql_close', 'es_sql_translate', 'es_explain_doc',
      'es_terms_enum', 'es_field_caps', 'es_analyze', 'es_validate_query', 'es_term_vectors', 'es_mtermvectors',
      'es_pit_open', 'es_pit_search', 'es_pit_close',
    ],
  },
  {
    id: 'documents',
    label: '文档',
    tools: ['es_get_doc', 'es_index_doc', 'es_update_doc', 'es_delete_doc', 'es_bulk'],
  },
  {
    id: 'indices',
    label: '索引与 mapping',
    tools: [
      'es_list_indices', 'es_get_mapping', 'es_get_settings', 'es_get_aliases', 'es_get_index_stats',
      'es_index_detail', 'es_index_settings_defaults', 'es_resolve_index', 'es_create_index', 'es_delete_index', 'es_put_mapping', 'es_update_settings',
      'es_alias', 'es_rollover', 'es_force_merge', 'es_refresh_index', 'es_flush_index', 'es_index_close', 'es_index_open',
      'es_list_data_streams', 'es_get_data_stream', 'es_data_stream_stats', 'es_create_data_stream', 'es_delete_data_stream',
      'es_clone_index', 'es_shrink_index', 'es_split_index', 'es_index_recovery', 'es_index_segments',
      'es_config_validate', 'es_config_drift',
    ],
  },
  {
    id: 'batch',
    label: '批量数据',
    tools: ['es_update_by_query', 'es_delete_by_query', 'es_reindex', 'es_reindex_preview',
      'es_list_transforms', 'es_get_transform', 'es_transform_stats', 'es_put_transform', 'es_start_transform', 'es_stop_transform', 'es_delete_transform'],
  },
  {
    id: 'cluster',
    label: '集群与任务',
    tools: [
      'es_cluster_health', 'es_list_nodes', 'es_list_tasks', 'es_task_detail', 'es_task_cancel',
      'es_allocation_explain', 'es_shard_stores', 'es_pending_tasks', 'es_cluster_stats', 'es_cat_shards', 'es_cluster_state',
      'es_get_cluster_settings', 'es_update_cluster_settings', 'es_reroute', 'es_monitor_metrics', 'es_monitor_history',
      'es_ops_audit', 'es_insight_settings_impact', 'es_ring_usage',
    ],
  },
  {
    id: 'analysis',
    label: '分词与同义词',
    tools: ['es_analysis_settings', 'es_update_analysis_settings', 'es_reload_analyzers', 'es_synonyms_upsert'],
  },
  {
    id: 'observability',
    label: '观测与插件',
    tools: ['es_nodes_stats', 'es_hot_threads', 'es_remote_clusters', 'es_plugins', 'es_watcher',
      'es_put_watch', 'es_delete_watch', 'es_execute_watch', 'es_ingest_pipelines', 'es_put_ingest_pipeline', 'es_delete_ingest_pipeline', 'es_cat_allocation'],
  },
  {
    id: 'backup',
    label: '快照 / ILM / SLM',
    tools: [
      'es_list_snapshot_repos', 'es_put_snapshot_repo', 'es_delete_snapshot_repo', 'es_list_snapshots', 'es_snapshot_status',
      'es_create_snapshot', 'es_delete_snapshot', 'es_restore_snapshot',
      'es_ilm_policies', 'es_ilm_explain', 'es_ilm_status', 'es_put_ilm_policy',
      'es_delete_ilm_policy', 'es_ilm_move', 'es_ilm_start', 'es_ilm_stop',
      'es_slm_policies', 'es_put_slm_policy', 'es_delete_slm_policy', 'es_slm_status', 'es_slm_execute',
    ],
  },
  {
    id: 'templates',
    label: '模板与脚本',
    tools: [
      'es_list_templates', 'es_put_template', 'es_delete_template', 'es_list_component_templates',
      'es_search_template', 'es_render_template',
      'es_list_scripts', 'es_put_script', 'es_delete_script',
    ],
  },
  { id: 'adhoc', label: '托管重建', tools: ['es_adhoc_prepare', 'es_adhoc_start', 'es_adhoc_status', 'es_adhoc_abort', 'es_adhoc_confirm_switch', 'es_adhoc_jobs', 'es_adhoc_retry', 'es_adhoc_delete_jobs', 'es_adhoc_throttle', 'es_adhoc_events'] },
  { id: 'xmigrate', label: '跨集群迁移', tools: ['es_xmigrate_preflight', 'es_xmigrate_start', 'es_xmigrate_status', 'es_xmigrate_jobs', 'es_xmigrate_fetch_config', 'es_xmigrate_resume', 'es_xmigrate_abort', 'es_xmigrate_reconcile', 'es_xmigrate_conflicts', 'es_xmigrate_events', 'es_xmigrate_connect_check', 'es_xmigrate_resolve_preview', 'es_xmigrate_dest_indices', 'es_xmigrate_delete_jobs', 'es_xmigrate_sync_structure', 'es_xmigrate_smart_sync', 'es_xmigrate_probe_capabilities', 'es_xmigrate_compare_capabilities', 'es_xmigrate_diff_structure', 'es_xmigrate_verify_equivalence', 'es_xmigrate_throttle', 'es_xmigrate_plan_list', 'es_xmigrate_plan_apply'] },
  { id: 'rest', label: '原始 REST', tools: ['es_rest'] },
];

export interface McpToolPack {
  id: string;
  label: string;
  description: string;
  tools: string[];
}

/* 客户端一次加载 130 个工具会超时/超限（WorkBuddy 实测 >80 就加载不完）。
   默认只签发「核心查询」包；其余工具按域或全量由使用者显式选择。 */
const MCP_CORE_TOOL_NAMES = [
  'es_list_connections',
  'es_list_indices', 'es_index_detail', 'es_get_mapping', 'es_get_settings', 'es_get_aliases',
  'es_index_settings_defaults', 'es_get_index_stats',
  'es_cluster_health', 'es_cluster_stats', 'es_list_nodes', 'es_cat_shards',
  'es_search', 'es_count', 'es_msearch', 'es_mget', 'es_get_doc',
  'es_explain_doc', 'es_field_caps', 'es_terms_enum', 'es_search_shards', 'es_rank_eval', 'es_validate_query',
  'es_sql', 'es_sql_cursor', 'es_sql_close', 'es_sql_translate', 'es_analyze',
  'es_list_tasks', 'es_pending_tasks', 'es_shard_stores', 'es_allocation_explain',
];
const MCP_CORE_WRITE_NAMES = [
  'es_index_doc', 'es_update_doc', 'es_delete_doc', 'es_bulk',
  'es_create_index', 'es_delete_index', 'es_put_mapping', 'es_update_settings',
  'es_alias', 'es_rollover', 'es_refresh_index', 'es_flush_index', 'es_index_open', 'es_index_close',
  'es_clone_index', 'es_shrink_index', 'es_split_index',
  'es_update_by_query', 'es_delete_by_query', 'es_reindex', 'es_force_merge',
];
export const MCP_TOOL_PACKS: McpToolPack[] = [
  {
    id: 'core',
    label: '核心查询',
    description: '连接、搜索、SQL、Mapping 与集群健康；默认包，低于客户端 80 工具上限。',
    tools: MCP_CORE_TOOL_NAMES,
  },
  {
    id: 'write',
    label: '核心 + 写入',
    description: '核心查询包加上文档写入与索引运维工具。',
    tools: [...MCP_CORE_TOOL_NAMES, ...MCP_CORE_WRITE_NAMES],
  },
  {
    id: 'readonly',
    label: '只读全量',
    description: '除管理工具外的全部只读工具，适合分析型 Agent。',
    tools: MCP_TOOLS.filter(tool => !MCP_WRITE_TOOLS.includes(tool.name) && tool.name !== 'es_rest')
      .map(tool => tool.name),
  },
  {
    id: 'full',
    label: '全量',
    description: '全部工具，常青包：服务端新增 action 自动纳入本 key（读写边界照常约束），免每次发版后补勾；仅建议脚本或一次性运维使用，客户端可能加载超时。',
    tools: MCP_TOOLS.map(tool => tool.name),
  },
];

export const MCP_GROUP_ACTIONS: Record<string, Record<string, string>> = {
  'es_connections': {
    'list': 'es_list_connections',
    'probe': 'es_connection_probe',
  },
  'es_search': {
    'search': 'es_search',
    'count': 'es_count',
    'msearch': 'es_msearch',
    'mget': 'es_mget',
    'explain': 'es_explain_doc',
    'search_shards': 'es_search_shards',
    'rank_eval': 'es_rank_eval',
    'terms_enum': 'es_terms_enum',
    'field_caps': 'es_field_caps',
    'validate': 'es_validate_query',
    'search_template': 'es_search_template',
    'render_template': 'es_render_template',
    'scroll_start': 'es_scroll_start',
    'scroll_next': 'es_scroll_next',
    'scroll_clear': 'es_scroll_clear',
    'pit_open': 'es_pit_open',
    'pit_search': 'es_pit_search',
    'pit_close': 'es_pit_close',
  },
  'es_sql': {
    'query': 'es_sql',
    'cursor': 'es_sql_cursor',
    'close': 'es_sql_close',
    'translate': 'es_sql_translate',
  },
  'es_documents': {
    'get': 'es_get_doc',
    'index': 'es_index_doc',
    'update': 'es_update_doc',
    'delete': 'es_delete_doc',
    'bulk': 'es_bulk',
    'term_vectors': 'es_term_vectors',
    'mtermvectors': 'es_mtermvectors',
  },
  'es_indices': {
    'list': 'es_list_indices',
    'detail': 'es_index_detail',
    'stats': 'es_get_index_stats',
    'settings': 'es_get_settings',
    'update_settings': 'es_update_settings',
    'settings_defaults': 'es_index_settings_defaults',
    'mapping': 'es_get_mapping',
    'put_mapping': 'es_put_mapping',
    'aliases': 'es_get_aliases',
    'alias': 'es_alias',
    'create': 'es_create_index',
    'delete': 'es_delete_index',
    'clone': 'es_clone_index',
    'shrink': 'es_shrink_index',
    'split': 'es_split_index',
    'refresh': 'es_refresh_index',
    'flush': 'es_flush_index',
    'close': 'es_index_close',
    'open': 'es_index_open',
    'force_merge': 'es_force_merge',
    'rollover': 'es_rollover',
    'resolve': 'es_resolve_index',
    'recovery': 'es_index_recovery',
    'segments': 'es_index_segments',
    'config_validate': 'es_config_validate',
    'config_drift': 'es_config_drift',
  },
  'es_data_streams': {
    'list': 'es_list_data_streams',
    'get': 'es_get_data_stream',
    'stats': 'es_data_stream_stats',
    'create': 'es_create_data_stream',
    'delete': 'es_delete_data_stream',
  },
  'es_templates': {
    'list': 'es_list_templates',
    'put': 'es_put_template',
    'delete': 'es_delete_template',
    'component_list': 'es_list_component_templates',
  },
  'es_analysis': {
    'analyze': 'es_analyze',
    'settings': 'es_analysis_settings',
    'update_settings': 'es_update_analysis_settings',
    'reload': 'es_reload_analyzers',
    'synonyms_upsert': 'es_synonyms_upsert',
  },
  'es_cluster': {
    'health': 'es_cluster_health',
    'stats': 'es_cluster_stats',
    'state': 'es_cluster_state',
    'nodes': 'es_list_nodes',
    'nodes_stats': 'es_nodes_stats',
    'cat_shards': 'es_cat_shards',
    'cat_allocation': 'es_cat_allocation',
    'allocation_explain': 'es_allocation_explain',
    'shard_stores': 'es_shard_stores',
    'pending_tasks': 'es_pending_tasks',
    'hot_threads': 'es_hot_threads',
    'remote_clusters': 'es_remote_clusters',
    'plugins': 'es_plugins',
    'settings': 'es_get_cluster_settings',
    'update_settings': 'es_update_cluster_settings',
    'reroute': 'es_reroute',
    'tasks': 'es_list_tasks',
    'task_detail': 'es_task_detail',
    'task_cancel': 'es_task_cancel',
    'monitor_metrics': 'es_monitor_metrics',
    'monitor_history': 'es_monitor_history',
    'ops_audit': 'es_ops_audit',
    'insight_impact': 'es_insight_settings_impact',
    'ring_usage': 'es_ring_usage',
  },
  'es_batch': {
    'update_by_query': 'es_update_by_query',
    'delete_by_query': 'es_delete_by_query',
    'reindex': 'es_reindex',
    'reindex_preview': 'es_reindex_preview',
  },
  'es_transforms': {
    'list': 'es_list_transforms',
    'get': 'es_get_transform',
    'stats': 'es_transform_stats',
    'put': 'es_put_transform',
    'start': 'es_start_transform',
    'stop': 'es_stop_transform',
    'delete': 'es_delete_transform',
  },
  'es_snapshots': {
    'repos': 'es_list_snapshot_repos',
    'repo_put': 'es_put_snapshot_repo',
    'repo_delete': 'es_delete_snapshot_repo',
    'list': 'es_list_snapshots',
    'status': 'es_snapshot_status',
    'create': 'es_create_snapshot',
    'delete': 'es_delete_snapshot',
    'restore': 'es_restore_snapshot',
  },
  'es_lifecycle': {
    'ilm_policies': 'es_ilm_policies',
    'ilm_explain': 'es_ilm_explain',
    'ilm_status': 'es_ilm_status',
    'ilm_put': 'es_put_ilm_policy',
    'ilm_delete': 'es_delete_ilm_policy',
    'ilm_move': 'es_ilm_move',
    'ilm_start': 'es_ilm_start',
    'ilm_stop': 'es_ilm_stop',
    'slm_policies': 'es_slm_policies',
    'slm_put': 'es_put_slm_policy',
    'slm_delete': 'es_delete_slm_policy',
    'slm_status': 'es_slm_status',
    'slm_execute': 'es_slm_execute',
  },
  'es_automation': {
    'watchers': 'es_watcher',
    'watch_put': 'es_put_watch',
    'watch_delete': 'es_delete_watch',
    'watch_execute': 'es_execute_watch',
    'ingest_list': 'es_ingest_pipelines',
    'ingest_put': 'es_put_ingest_pipeline',
    'ingest_delete': 'es_delete_ingest_pipeline',
    'scripts': 'es_list_scripts',
    'script_put': 'es_put_script',
    'script_delete': 'es_delete_script',
  },
  'es_rest': {
    'call': 'es_rest',
  },
  'es_adhoc_rebuild': {
    'prepare': 'es_adhoc_prepare',
    'start': 'es_adhoc_start',
    'status': 'es_adhoc_status',
    'abort': 'es_adhoc_abort',
    'confirm_switch': 'es_adhoc_confirm_switch',
    'jobs': 'es_adhoc_jobs',
    'retry': 'es_adhoc_retry',
    'delete_jobs': 'es_adhoc_delete_jobs',
    'throttle': 'es_adhoc_throttle',
    'events': 'es_adhoc_events',
  },
  'es_xmigrate': {
    'preflight': 'es_xmigrate_preflight',
    'start': 'es_xmigrate_start',
    'status': 'es_xmigrate_status',
    'jobs': 'es_xmigrate_jobs',
    'fetch_config': 'es_xmigrate_fetch_config',
    'resume': 'es_xmigrate_resume',
    'abort': 'es_xmigrate_abort',
    'reconcile': 'es_xmigrate_reconcile',
    'conflicts': 'es_xmigrate_conflicts',
    'events': 'es_xmigrate_events',
    'connect_check': 'es_xmigrate_connect_check',
    'resolve_preview': 'es_xmigrate_resolve_preview',
    'dest_indices': 'es_xmigrate_dest_indices',
    'delete_jobs': 'es_xmigrate_delete_jobs',
    'sync_structure': 'es_xmigrate_sync_structure',
    'probe_capabilities': 'es_xmigrate_probe_capabilities',
    'compare_capabilities': 'es_xmigrate_compare_capabilities',
    'diff_structure': 'es_xmigrate_diff_structure',
    'verify_equivalence': 'es_xmigrate_verify_equivalence',
    'throttle': 'es_xmigrate_throttle',
    'smart_sync': 'es_xmigrate_smart_sync',
    'plan_list': 'es_xmigrate_plan_list',
    'plan_apply': 'es_xmigrate_plan_apply',
  },
};
export const MCP_GROUP_DESCRIPTIONS: Record<string, string> = {
  'es_connections': 'List or inspect MCP connections; probe one stored profile.',
  'es_search': 'Search, count, multi-search, explain, scroll, PIT and search-time helpers.',
  'es_sql': 'Run ES-SQL, cursors and SQL-to-DSL translation.',
  'es_documents': 'Read and mutate documents, bulk operations and term vectors.',
  'es_indices': 'Index catalog, settings, mappings, aliases, index lifecycle and config lab validation/drift.',
  'es_data_streams': 'Data stream catalog and lifecycle.',
  'es_templates': 'Index templates and component templates.',
  'es_analysis': 'Analyze text, analysis settings, reload analyzers and synonyms.',
  'es_cluster': 'Cluster health, nodes, shard diagnostics, settings, reroute, tasks, collected monitor series, ops audit, settings impact and ring usage.',
  'es_batch': 'Batch update, delete, reindex and reindex preview.',
  'es_transforms': 'Transform lifecycle.',
  'es_snapshots': 'Snapshot repositories and snapshots.',
  'es_lifecycle': 'ILM and SLM lifecycle policies.',
  'es_automation': 'Watcher, ingest pipelines and stored scripts.',
  'es_rest': 'Raw Elasticsearch REST passthrough; write methods need write permission.',
  'es_adhoc_rebuild': 'Managed adhoc rebuild lifecycle: probe source, start, status, abort, confirm switch, job list, retry, throttle and events.',
  'es_xmigrate': 'Cross-cluster migration lifecycle: connect check, resolve preview, preflight, start, progress, job list, fetch source config, count reconcile, conflict samples, job event timeline replay (ts/stage/message/level, owner-or-ADMIN), dest index list, resume, abort, job cleanup, adaptive structure sync (proactive compat matrix plus target-error pruning, dry-run plan with planDigest and alias sync), one-shot smart sync (probe, compare, plan and apply in a single call; apply=false is a read-only preview that needs no write permission — smart_sync is listed in annotations.readOnlyActions for that default read-only shape, while apply=true turns it into a write that needs write permission and confirmation; mode=incremental targets an existing index and back-fills newly added production fields via mapping merge; savePlan=true on a preview persists that plan and returns planId), saved-plan reuse (plan_list lists saved sync plans newest first, read-only, capped at 50; plan_apply re-runs a saved plan by planId behind the same planDigest drift gate as smart_sync apply — expectPlanDigest optionally overrides the stored digest, a stale plan is rejected as PLAN_DRIFT before any write, a missing planId is PLAN_NOT_FOUND — and needs write permission and confirmation; the esquerystudio://xmigrate/plan/{id} resource returns the saved plan with its preview snapshot), target capability probe (vendor/version/plugins/nodes), capability comparison risk matrix, structure diff verification (pass autoTunedShards/removedKeys from the previous sync report to exempt planned changes), data equivalence verification (counts, sample hash, optional aggregation; structureOnly=true compares structure digests only, the final gate for pure structure sync) and running-job throttle.',
};

/** 组级 MCP annotations 静态表（tools/list 逐组输出，三端同表）：readOnlyHint=true 仅限
    零写 action 的组；destructiveHint=true 仅限含破坏性 action 的组；idempotentHint 同
    readOnlyHint；openWorldHint=true 全组。按组静态声明，不随写开关裁剪变化。 */
export const MCP_TOOL_ANNOTATIONS: Record<string, Record<string, boolean>> = {
  'es_connections': { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  'es_search': { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  'es_sql': { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  'es_documents': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_indices': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_data_streams': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_templates': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_analysis': { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  'es_cluster': { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  'es_batch': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_transforms': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_snapshots': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_lifecycle': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_automation': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_rest': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_adhoc_rebuild': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  'es_xmigrate': { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};

/** 组级「只读 action 名单」（tools/list 逐组随 annotations.readOnlyActions 下发，静态全量
 *  不随写开关裁剪，与 Java READ_ONLY_ACTIONS 同生成规则）：action 的实现名不在
 *  MCP_WRITE_TOOLS 即只读；es_rest:call（实现名不在写清单，缺省 GET 只读）自然落入；
 *  es_xmigrate:smart_sync（实现名在写清单，缺省 apply=false 只读预览）显式补入；
 *  es_xmigrate:delete_jobs 是写动作，绝不在只读名单。 */
export const MCP_READ_ONLY_ACTIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(MCP_GROUP_ACTIONS).map(([group, actions]) => {
    const readOnly = Object.keys(actions).filter(action => !MCP_WRITE_TOOLS.includes(actions[action]));
    if (group === 'es_xmigrate') readOnly.push('smart_sync');
    return [group, readOnly];
  }),
);

/** 客户端可见的组级工具面：17 个 action 组；写开关关闭时收起写 action。 */
export function browserGroupTools(writeAllowed: boolean = isBrowserMcpWriteAllowed()): any[] {
  const out: any[] = [];
  for (const [name, actions] of Object.entries(MCP_GROUP_ACTIONS)) {
    const allowed = Object.keys(actions).filter(action => {
      const target = actions[action];
      return writeAllowed || !MCP_WRITE_TOOLS.includes(target);
    });
    if (!allowed.length) continue;
    const properties: Record<string, any> = {
      action: { type: 'string', enum: allowed, description: 'Action to execute. One of: ' + allowed.join(', ') },
      connection: { type: 'string', description: 'Connection id; optional in browser mode.' },
    };
    /* es_xmigrate 组的 action 描述附新参语义（与服务端 groupTool 同文案，三端逐字） */
    if (name === 'es_xmigrate') {
      properties.action.description = 'Action to execute. One of: ' + allowed.join(', ')
        + '. 新参语义：smart_sync 支持 mode=create（缺省，目标新建索引）/ incremental'
        + '（目标已有索引、生产新增字段后补同步）；diff_structure 可回传上次同步报告的'
        + ' autoTunedShards/removedKeys，计划内变更豁免不误报；verify_equivalence 支持'
        + ' structureOnly=true 做纯结构同步后的终局结构验证；smart_sync 预览可携 savePlan=true'
        + ' 把计划落盘并返回 planId；plan_list（只读）列出已存计划，plan_apply 按 planId 执行'
        + ' 已存计划（写，需二次确认，漂移门与 smart_sync apply 相同）。';
    }
    for (const field of ['index', 'id', 'name', 'target', 'alias', 'query', 'body', 'document', 'settings',
      'fields', 'method', 'path', 'taskId', 'repo', 'snapshot', 'policy', 'source', 'dest', 'text', 'analyzer',
      'field', 'value', 'params', 'actions', 'script', 'ids', 'documents', 'indexes', 'requests', 'slices',
      'maxDocs', 'refresh', 'pipeline', 'routing', 'size', 'from', 'scroll', 'waitForCompletion']) {
      properties[field] = { type: 'string', description: field + ' (action-specific)' };
    }
    /* es_xmigrate 组的专用参数：sync_structure 的 dry-run/别名随迁/分析器回退/计划摘要校验参数，
       smart_sync 的一步式执行/自动整形/目标侧模式参数，diff_structure 的豁免回传参数，
       verify_equivalence 的样本/聚合/纯结构参数，throttle 的速率参数（与服务端 groupTool 同表） */
    if (name === 'es_xmigrate') {
      properties.dryRun = { type: 'boolean', description: 'sync_structure: true 时只产出兼容剔除计划（planned/advice），不向目标集群发 PUT' };
      properties.apply = { type: 'boolean', description: 'smart_sync: true 时执行同步（需写权限与二次确认）；缺省 false 只读预览计划（免写权限）' };
      properties.savePlan = { type: 'boolean', description: 'smart_sync: true 时把本次预览计划落盘并在响应里返回 planId（供 plan_list / plan_apply 复用）；仅预览形态可用（apply=false，缺省），apply=true 时带上报 400' };
      properties.planId = { type: 'string', description: 'plan_apply: 已存同步计划 id（smart_sync savePlan=true 返回）；计划不存在报 PLAN_NOT_FOUND' };
      properties.mode = { type: 'string', description: 'smart_sync 目标侧模式：create（缺省）=目标新建索引；incremental=目标已有索引、生产新增字段后补同步（PUT _mapping 合并 + 动态 settings 白名单更新 + 补别名；目标索引不存在报 DEST_NOT_FOUND）' };
      properties.autoTune = { type: 'boolean', description: 'smart_sync: true 时按目标硬件规格自动整形（分片数超目标数据节点数时收敛）；缺省 false' };
      properties.autoTunedShards = { type: 'number', description: 'diff_structure: 回传上次 smart_sync 报告的 autoTune 收敛后分片数，分片差异按计划内豁免不误报 unexpected' };
      properties.removedKeys = { type: 'array', description: 'diff_structure: 回传上次 smart_sync/sync_structure 报告的计划内剔除/变更键清单（字符串数组），命中 onlyInSource 差异按计划内豁免，复检不被自己的优化误报' };
      properties.structureOnly = { type: 'boolean', description: 'verify_equivalence: true=纯结构摘要对比（双侧 settings/mappings canonical 摘要，纯结构同步的终局验证）；缺省 false 做数据等价校验（count+样本摘要+可选聚合）' };
      properties.syncAliases = { type: 'boolean', description: 'sync_structure/smart_sync: true 时建索引成功后按源别名逐个随迁（filter/routing 元数据原样）' };
      properties.downgradedAnalyzerFallback = { type: 'string', description: 'sync_structure/smart_sync: 降级字段的回退分析器；缺省回退 standard 分析器（normalizer 属性总是剔除）' };
      properties.expectPlanDigest = { type: 'string', description: 'sync_structure/smart_sync: 预览返回的 planDigest；仅执行时合法（dryRun=false / apply=true），防预览后源结构漂移；plan_apply: 可选，缺省用计划保存时的 planDigest 做漂移门' };
      properties.srcConnId = { type: 'string', description: '跨集群 action 的源连接档案 id（start/resume/fetch_config/reconcile/verify_equivalence 等）' };
      properties.destConnId = { type: 'string', description: '目标侧连接 id（host=宿主集群；缺省按 action 各自默认，smart_sync 必填）' };
      properties.sourceIndex = { type: 'string', description: '源索引名（旧集群侧）' };
      properties.destIndex = { type: 'string', description: '目标索引名（缺省多与 sourceIndex 同名）' };
      properties.jobId = { type: 'string', description: '迁移作业 id（status/resume/abort/conflicts/throttle/verify_equivalence）' };
      properties.sampleSize = { type: 'number', description: 'verify_equivalence: _doc 序取样条数，钳制 10-500（缺省 100）' };
      properties.sampleFields = { type: 'string', description: 'verify_equivalence: 参与摘要对比的字段，逗号分隔' };
      properties.aggField = { type: 'string', description: 'verify_equivalence: 可选 terms 聚合对比字段' };
      properties.aggSize = { type: 'number', description: 'verify_equivalence: 聚合桶数，钳制 1-50（缺省 10）' };
      properties.rps = { type: 'string', description: 'throttle: 每秒文档数，-1 表示不限速' };
    }
    out.push({
      name,
      description: MCP_GROUP_DESCRIPTIONS[name] + ' Actions: ' + allowed.join(', ')
        + '. Pass action plus the arguments documented for that action.',
      inputSchema: { type: 'object', properties, required: ['action'] },
      /* 组级 annotations 四提示维持既有口径（有写 action 的组 readOnlyHint=false）；
         readOnlyActions 是组内只读 action 名单（混合组的免确认白名单粒度，静态全量
         不随写开关裁剪——smart_sync 缺省 apply=false 只读预览，显式在名单）。 */
      annotations: { ...MCP_TOOL_ANNOTATIONS[name], readOnlyActions: MCP_READ_ONLY_ACTIONS[name] },
      _meta: { ui: { resourceUri: MCP_APP_URI } },
    });
  }
  return out;
}

/** 单轨归一：客户端只允许 17 个 action 组（action 必填）；组外工具名一律按未知工具报错。 */
function normalizeBrowserGroupCall(name: string, args: Record<string, any>): { name: string; args: Record<string, any> } {
  const actions = MCP_GROUP_ACTIONS[name];
  if (!actions) {
    throw new Error('Unknown tool ' + name + '; the client surface is the action groups: ' + Object.keys(MCP_GROUP_ACTIONS).join(', '));
  }
  const action = String(args?.action || '').trim();
  if (!action) throw new Error('Missing action for ' + name + '; expected one of ' + Object.keys(actions).join(', '));
  const target = actions[action];
  if (!target) throw new Error('Unknown action ' + action + ' for ' + name + '; expected one of ' + Object.keys(actions).join(', '));
  const rest = { ...args };
  delete rest.action;
  return { name: target, args: rest };
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
  _meta?: Record<string, any>;
}

export interface McpResourceTemplateDefinition {
  uriTemplate: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export const MCP_APP_RESOURCE: McpResourceDefinition = {
  uri: MCP_APP_URI,
  name: 'ESQueryStudio Tool Console',
  title: 'MCP App · Tool Console',
  description: 'MCP Apps surface for ESQueryStudio tools.',
  mimeType: MCP_APP_MIME,
  _meta: { ui: appUiMeta() },
};

export interface McpPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface McpPromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: McpPromptArgument[];
}

/** 与 Java McpController.RESOURCE_URIS / PROMPT_NAMES 同步；纯前端模式只读、不占工具配额。 */
export const MCP_STATIC_RESOURCES: McpResourceDefinition[] = [
  {
    uri: 'esquerystudio://connections',
    name: '连接目录',
    title: 'MCP 连接',
    description: '当前 MCP 身份可访问的连接及读写范围。',
    mimeType: 'application/json',
  },
];

export const MCP_RESOURCE_TEMPLATES: McpResourceTemplateDefinition[] = [
  {
    uriTemplate: 'esquerystudio://connection/{connection}',
    name: '连接详情',
    title: 'Connection detail',
    description: '单个连接的实时健康与统计。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://cluster/{connection}',
    name: '集群概览',
    title: 'Cluster overview',
    description: '单个连接的健康、统计与节点信息。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://indices/{connection}',
    name: '索引目录',
    title: 'Index catalog',
    description: '单个连接的非系统索引清单。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://aliases/{connection}',
    name: '别名目录',
    title: 'Alias catalog',
    description: '单个连接的索引别名清单。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://data_streams/{connection}',
    name: '数据流目录',
    title: 'Data stream catalog',
    description: '单个连接的数据流及其后备索引。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://component_templates/{connection}',
    name: '组件模板目录',
    title: 'Component template catalog',
    description: '单个连接的可组合组件模板。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://index/{connection}/{index}',
    name: '索引详情',
    title: 'Index detail',
    description: '单个索引的 Mapping、设置、别名与统计。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://index/{connection}/{index}/mapping',
    name: '索引 Mapping',
    title: 'Index mapping',
    description: '单个索引的实时 Mapping 与扁平字段树。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://xmigrate/jobs',
    name: '迁移作业摘要',
    title: 'Migrate jobs',
    description: '跨集群迁移作业摘要（每作业一行：jobId/state/srcConnId/sourceIndex/destConnId/destIndex/updatedMs；终态与运行中都在；读取需 es_xmigrate:jobs 权限）。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://xmigrate/job/{id}/events',
    name: '迁移作业事件流',
    title: 'Migrate job events',
    description: '单个迁移作业的事件时间线（{ts,stage,message,level}，与 REST /jobs/{id}/events 同构；读取需 es_xmigrate:status 权限且作业归属为创建者本人或 ADMIN）。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://xmigrate/plan/{id}',
    name: '同步计划快照',
    title: 'Smart sync plan',
    description: '单个 smart_sync 同步计划的记录与预览快照（保存时的参数、planDigest、执行记账，以及 planned 清单 / autoTuned / advice / warnings / body 或增量五清单全量；读取需 es_xmigrate:plan_list 权限；浏览器读本机计划台账）。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://tasks/active',
    name: '在途任务',
    title: 'Active MCP tasks',
    description: '当前页面内桥在途 MCP 任务（状态/阶段/耗时/剩余预算，不含结果体）。',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'esquerystudio://task/{id}',
    name: '任务详情',
    title: 'MCP task',
    description: '按 taskId 读取单个 MCP 任务（状态/阶段/进度/终态；结果体不下发）。',
    mimeType: 'application/json',
  },

];

function promptArg(name: string, description: string, required: boolean): McpPromptArgument {
  return { name, description, required };
}

export const MCP_PROMPTS: McpPromptDefinition[] = [
  {
    name: 'diagnose_slow_query',
    title: 'Diagnose a slow query',
    description: 'Evidence-first latency diagnosis using profile, shard timing and cluster pressure.',
    arguments: [
      promptArg('connection', 'Connection id to investigate.', true),
      promptArg('index', 'Target index or alias; omit for a cluster-wide triage.', false),
      promptArg('query', 'The query or DSL to diagnose; omit to start from symptoms.', false),
    ],
  },
  {
    name: 'design_index_mapping',
    title: 'Design an index mapping',
    description: 'Propose a mapping and index settings from sample documents and access patterns.',
    arguments: [
      promptArg('index', 'Index name or purpose.', true),
      promptArg('sample', 'One or more sample documents or a field list.', false),
      promptArg('access', 'Known filters, sorts, aggregations and retention.', false),
    ],
  },
  {
    name: 'migrate_index',
    title: 'Plan an index migration',
    description: 'Plan and verify a reindex or cross-cluster migration with zero-surprise cutover.',
    arguments: [
      promptArg('source', 'Source index and optional connection (connection:index).', true),
      promptArg('target', 'Target index and optional connection (connection:index).', true),
      promptArg('notes', 'Mapping changes, downtime budget or validation rules.', false),
    ],
  },
  {
    name: 'review_cluster_capacity',
    title: 'Review cluster capacity',
    description: 'Rank capacity, shard and thread-pool risks with concrete next actions.',
    arguments: [
      promptArg('connection', 'Connection id to review.', true),
      promptArg('window', 'Observation window or traffic context.', false),
    ],
  },
  {
    name: 'triage_failed_search',
    title: 'Triage a failed search',
    description: 'Diagnose failures and partial shard results with allocation and shard evidence.',
    arguments: [
      promptArg('connection', 'Connection id to investigate.', true),
      promptArg('index', 'Index or alias that failed.', false),
      promptArg('symptom', 'Error message, status code or observed behavior.', true),
    ],
  },
  {
    name: 'cross_cloud_structure_sync',
    title: 'Cross-cloud structure sync',
    description: 'Cross-cloud index structure sync workflow: probe both clusters, compare capabilities, plan with dry-run, validate, execute, then verify with structure diff and data equivalence.',
    arguments: [
      promptArg('srcConnId', 'Stored source connection profile id (old cluster).', true),
      promptArg('destConnId', 'Target-side connection id (host, or an id from discovery).', true),
      promptArg('sourceIndex', 'Source index name.', false),
      promptArg('destIndex', 'Target index name; defaults to sourceIndex.', false),
    ],
  },
  {
    name: 'deploy_and_connect',
    title: 'Deploy and connect',
    description: 'One-shot AI onboarding: deploy ESQueryStudio (server jar, host embed, Chrome extension, Windows exe or local Node) and connect an MCP client with verified permissions.',
    arguments: [
      promptArg('mode', 'Deployment mode: server | host | browser | local-exe | local-node; defaults to server.', false),
      promptArg('client', 'Target MCP client id, e.g. claude-code, cursor, qoder, workbuddy; defaults to generic.', false),
      promptArg('endpoint', 'Console base URL for server/host modes; defaults to http://localhost:5601.', false),
      promptArg('os', 'Target OS: windows | macos | linux; defaults to auto.', false),
    ],
  },
];

/** 浏览器模式的连接就是本机档案；只把当前激活档案作为可读资源，避免偷换数据面。
 * 迁移作业摘要资源读本机台账（与服务端 xmigrate/jobs 资源同形）。 */
function mcpResources(): McpResourceDefinition[] {
  const out: McpResourceDefinition[] = [MCP_APP_RESOURCE, ...MCP_STATIC_RESOURCES];
  const active = activeProfile();
  if (active) {
    out.push({
      uri: 'esquerystudio://connection/' + encodeURIComponent(active.id),
      name: '连接 · ' + active.name,
      title: active.name,
      description: '连接 ' + active.name + '（' + active.id + '）的实时健康与统计。',
      mimeType: 'application/json',
    });
  }
  out.push({
    uri: 'esquerystudio://xmigrate/jobs',
    name: '迁移作业摘要',
    title: 'Migrate jobs',
    description: '跨集群迁移作业摘要（每作业一行：jobId/state/srcConnId/sourceIndex/destConnId/destIndex/updatedMs；终态与运行中都在；读取需 es_xmigrate:jobs 权限）。',
    mimeType: 'application/json',
  });
  return out;
}

async function readMcpResource(uri: string): Promise<any> {
  if (uri === MCP_APP_URI) {
    return {
      contents: [{
        uri,
        mimeType: MCP_APP_MIME,
        text: MCP_APP_HTML,
        _meta: { ui: appUiMeta() },
      }],
    };
  }
  const prefix = 'esquerystudio://';
  if (!uri.startsWith(prefix)) throw new Error('Unsupported resource URI: ' + uri);
  const path = uri.slice(prefix.length).replace(/\/+$/, '');
  const parts = path.split('/').map(decodeURIComponent);
  let data: any;
  if (parts.length === 1 && parts[0] === 'connections') {
    data = await dispatchBrowserTool('es_list_connections');
  } else if (parts.length === 2 && parts[0] === 'connection') {
    requireActiveProfile(parts[1]);
    data = {
      connection: parts[1],
      health: await dispatchBrowserTool('es_cluster_health'),
      stats: await dispatchBrowserTool('es_cluster_stats'),
    };
  } else if (parts.length === 2 && parts[0] === 'cluster') {
    requireActiveProfile(parts[1]);
    data = {
      connection: parts[1],
      health: await dispatchBrowserTool('es_cluster_health'),
      stats: await dispatchBrowserTool('es_cluster_stats'),
      nodes: await dispatchBrowserTool('es_list_nodes'),
    };
  } else if (parts.length === 2 && parts[0] === 'indices') {
    requireActiveProfile(parts[1]);
    data = await dispatchBrowserTool('es_list_indices');
  } else if (parts.length === 2 && parts[0] === 'aliases') {
    requireActiveProfile(parts[1]);
    data = await dispatchBrowserTool('es_get_aliases');
  } else if (parts.length === 2 && parts[0] === 'data_streams') {
    requireActiveProfile(parts[1]);
    data = await dispatchBrowserTool('es_list_data_streams');
  } else if (parts.length === 2 && parts[0] === 'tasks' && parts[1] === 'active') {
    /* 在途任务资源：Agent 用 URI 直接读，不必反复调 tasks/list。 */
    const rows = [...BROWSER_TASKS.values()]
      .filter(t => t.owner === BROWSER_TASK_OWNER && t.status === 'working')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 20)
      .map(t => { const v = browserTaskView(t); delete v.result; return v; });
    data = { tasks: rows, count: rows.length, callTimeoutMs: MCP_TASK_TIMEOUT_MS };
  } else if (parts.length === 2 && parts[0] === 'task') {
    const t = BROWSER_TASKS.get(parts[1]);
    if (!t || t.owner !== BROWSER_TASK_OWNER) throw new Error('任务不存在或不属于当前凭证: ' + parts[1]);
    data = browserTaskView(t);
    delete data.result;
  } else if (parts.length === 2 && parts[0] === 'component_templates') {
    requireActiveProfile(parts[1]);
    data = await dispatchBrowserTool('es_list_component_templates');
  } else if (parts.length >= 3 && parts[0] === 'index') {
    requireActiveProfile(parts[1]);
    const index = parts[2];
    if (parts.length === 4 && parts[3] === 'mapping') {
      data = await dispatchBrowserTool('es_get_mapping', { index });
    } else if (parts.length === 3) {
      data = {
        connection: parts[1],
        index,
        mapping: await dispatchBrowserTool('es_get_mapping', { index }),
        settings: await dispatchBrowserTool('es_get_settings', { index }),
        aliases: await dispatchBrowserTool('es_get_aliases'),
        stats: await dispatchBrowserTool('es_get_index_stats', { index }),
      };
    } else {
      throw new Error('Unsupported resource URI: ' + uri);
    }
  } else if (parts.length === 2 && parts[0] === 'xmigrate' && parts[1] === 'jobs') {
    /* 迁移作业摘要：本机台账前 20 条，逐作业映射为服务端同键行形态 */
    const rows = await dispatchBrowserTool('es_xmigrate_jobs', { limit: 20 });
    data = (Array.isArray(rows) ? rows : []).map((row: any) => ({
      jobId: row?.jobId ?? null,
      state: row?.status ?? null,
      srcConnId: row?.srcConnId ?? null,
      sourceIndex: row?.sourceIndex ?? null,
      destConnId: 'host',
      destIndex: row?.destIndex ?? null,
      updatedMs: Number(row?.finishTime ?? row?.createTime ?? 0) || null,
    }));
  } else if (parts.length === 4 && parts[0] === 'xmigrate' && parts[1] === 'job' && parts[3] === 'events') {
    /* 迁移作业事件时间线：REST /jobs/{id}/events（本机台账事件环） */
    data = await jsonFetch('/internal/es/xmigrate/jobs/' + encodeURIComponent(parts[2]) + '/events');
  } else if (parts.length === 3 && parts[0] === 'xmigrate' && parts[1] === 'plan') {
    /* 同步计划快照：本机计划台账里的记录 + 保存时的预览报告全量；计划不存在如实报错 */
    data = xmPlanSnapshot(parts[2], await planViewRedacts());
  } else {
    throw new Error('Unsupported resource URI: ' + uri);
  }
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }],
  };
}

/** 计划读取是否需要隐藏源连接档案 id（与服务端 xmigratePlanView 的规则相同）：当前身份低于
 *  REBUILD_OP 时返回 true。浏览器模式的身份来自页面内的 /auth/me；取不到身份时按最低档处理。 */
async function planViewRedacts(): Promise<boolean> {
  try {
    const me = await jsonFetch('/internal/es/index/auth/me');
    return roleRank(me?.role) < roleRank('REBUILD_OP');
  } catch {
    return true;
  }
}

function requireActiveProfile(connection: string): void {
  const active = activeProfile();
  if (!active) throw new Error('No browser connection profile is active; create one first.');
  if (active.id !== connection) {
    throw new Error('Browser mode reads the active connection only; switch to ' + connection + ' in the top bar first.');
  }
}

/** 一键搭建 / 接入提示词（与 prompts/get、AGENT_SETUP.md 同一份正文）。
 *  导出成纯函数供控制台直接生成：页面无需凭证、演示站也能看到真实文案。 */
export function buildDeployAndConnectPrompt(args: Record<string, any> = {}): { description: string; text: string } {
  const optionalArg = (key: string): string => (args[key] == null ? '' : String(args[key]).trim());
  const mode = optionalArg('mode') || 'server';
  const client = optionalArg('client') || 'generic';
  const endpoint = optionalArg('endpoint') || 'http://localhost:5601';
  const os = optionalArg('os') || 'auto';
  const rawMount = optionalArg('mcpPath') || '/esmcp';
  let mountPath = rawMount.startsWith('/') ? rawMount : '/' + rawMount;
  while (mountPath.length > 1 && mountPath.endsWith('/')) mountPath = mountPath.slice(0, -1);
  const labels: Record<string, string> = {
    server: 'Spring Boot 独立服务端（java -jar）',
    host: '嵌入现有 Spring Boot 宿主（console / platform starter）',
    browser: 'Chrome MV3 扩展（纯前端直连 ES）',
    'local-exe': 'Windows 单文件 stdio MCP（esquerystudio-mcp.exe）',
    'local-node': '本地 Node stdio MCP（mcp/ 目录）',
  };
  const modeLabel = labels[mode] || (mode + '（未知形态，按仓库文档核对）');
  const remote = mode === 'server' || mode === 'host';
  const endpointLine = remote
    ? 'MCP 端点 `' + endpoint + mountPath + '`（宿主有 context-path 时按宿主前缀，如 QuoteHub 为 `' + endpoint + '/quotehub' + mountPath + '`）；控制台 `' + endpoint + '/esquerystudio.html`'
    : mode === 'browser'
      ? '本形态没有可被外部进程连接的 HTTP 端点；页面内 Agent 使用 `window.ESQueryStudioMCP`。'
      : '本形态走 stdio，不需要 HTTP 端点；连接凭据留在本机。';
  const mcpEndpoint = remote ? endpoint + mountPath : '(stdio，无 HTTP 端点)';
  const modeSteps: Record<string, string> = {
    server: '下载 `esquerystudio-server-<ver>.jar` → `java -jar esquerystudio-server-<ver>.jar`（默认端口 5601）→ 打开 `' + endpoint + '/esquerystudio.html`。',
    host: '宿主二选一：完整控制台（Boot 2.7）引入 `esquerystudio-console` + `esquerystudio-platform`，或任意 Boot 2.3–4.2 宿主引入 `esquerystudio-boot-support`（查询工作台 + 17 组 MCP，服务 token）→ 放行 `/esquerystudio.html` 与 `' + mountPath + '` → 重启宿主；QuoteHub 的 context-path 为 `/quotehub`，MCP 端点是 `' + endpoint + '/quotehub' + mountPath + '`。',
    browser: '下载 `esquerystudio-chrome-<ver>.zip` → 解压 → 打开 `chrome://extensions` 并启用开发者模式 → 「加载已解压的扩展程序」→ 打开控制台并添加本机 ES 连接。',
    'local-exe': '下载 `esquerystudio-mcp.exe` → 准备本机 `mcp.json` 连接档案 → 客户端 `command` 指向该 exe；写工具需加 `--allow-write`。',
    'local-node': '取得仓库 `mcp/` 目录 → `cd mcp && npm install -g .` → `esquerystudio-mcp --config <path>`；写工具需加 `--allow-write`。',
  };
  const step = modeSteps[mode] || modeSteps.server;
  const consoleCheck = remote
    ? '`GET ' + endpoint + '/esquerystudio.html` 返回 200；登录后「MCP 接入」页的协议自检通过。'
    : mode === 'browser'
      ? '扩展页打开后「MCP 接入」页的协议自检通过（页面内桥）。'
      : '`esquerystudio-mcp --version` 输出版本；客户端 `tools/list` 能看到 17 组 action 工具。';
  const description = 'One-shot AI onboarding: deploy ESQueryStudio (server jar, host embed, Chrome extension, Windows exe or local Node) and connect an MCP client with verified permissions.';
  const text = '你是 ESQueryStudio 的部署与接入助手。目标：在 ' + os + ' 上以「' + modeLabel + '」方式完成搭建，并把「' + client + '」接入为 MCP 客户端。只做必要动作；每一步都验证并回报证据，失败时给出原始错误与下一步，禁止伪成功。\n\n'
    + '【产品事实】\n'
    + '- 仓库与唯一滚动 Release：https://github.com/dengmeiluan/esquerystudio （`releases/latest`；资产名含版本号，先列资产再下载，不要猜文件名）。\n'
    + '- 工具面：17 个 action 组 / 171 个 action、14 个只读资源 + 1 个 MCP App、7 个引导提示词；精简面保留 17 组工具但 0 资源 / 0 提示词。\n'
    + '- 长调用：单次工具调用硬预算 180 秒，到点返回 `cancelled/DEADLINE`；reindex / update-by-query / delete-by-query / restore 等长任务用异步端点或 `tasks/get` 续传，不要阻塞等待；`tasks/cancel` 与 `notifications/cancelled` 会真中断（断连接 / 撤 ES 任务）。\n'
    + '- 凭据：MCP key 只在控制台「MCP 接入 → 密钥」或管理 API 签发；key 不写入仓库、日志、截图或终端历史。\n\n'
    + '【本次选择】\n'
    + '- 形态：' + modeLabel + '\n'
    + '- 客户端：' + client + '\n'
    + '- 端点 / 上下文：' + endpointLine + '\n'
    + '- 操作系统：' + os + '\n\n'
    + '【执行步骤】\n'
    + '0. 预检：确认 OS / 架构、JDK（server 需 8+）/ Node（local-node 需 18+）/ Chrome（browser 需 MV3）、端口占用与 GitHub 可达；记录实际值。\n'
    + '1. 取资产：`GET https://api.github.com/repos/dengmeiluan/esquerystudio/releases/latest`，按名称选择资产并核对 `SHA256SUMS`（或 API digest）。\n'
    + '2. 安装并启动：' + step + '\n'
    + '3. 打开控制台并确认可登录：' + consoleCheck + '\n'
    + '4. 签发 MCP key：ADMIN 登录 → MCP 接入 → 密钥 → 签发；按用途选择只读 / QA-UAT 可写 / 批量写，逐连接设置 read/write，记录过期与配额。管理 API 形态：`POST {context-path}/internal/es/index/mcp/keys`。\n'
    + '5. 配置客户端（优先 CLI，失败再手写）：\n'
    + '   `node mcp/esquerystudio-mcp-cli.mjs install --client ' + client + ' --url ' + mcpEndpoint + ' --token <key> --write`\n'
    + '   本地 stdio：`node mcp/esquerystudio-mcp-cli.mjs install --client ' + client + ' --local --write`\n'
    + '   Windows 单文件：把 `esquerystudio-mcp.exe` 的绝对路径写进客户端 `command`（对标 `dbx-mcp.exe`）。\n'
    + '6. 验证：`esquerystudio-mcp-cli probe --url ' + mcpEndpoint + ' --token <key> --json`；再真实往返 `server/discover`、`tools/list`、`resources/list`、`prompts/list`，确认 17 组 / 171 action / 14 资源 + 1 App / 7 提示词（精简面 0 资源 / 0 提示词），并做一次只读工具调用。\n'
    + '7. 回报：版本、端点、客户端配置文件路径、验证输出、实际权限边界、回滚方式。\n\n'
    + '【其他形态速查】\n'
    + '- server：下载 `esquerystudio-server-<ver>.jar` → `java -jar` → `http://localhost:5601/esquerystudio.html`。\n'
    + '- host：完整控制台（Boot 2.7）引入 `esquerystudio-console` / `esquerystudio-platform`；任意 Boot 2.3–4.2 宿主引入 `esquerystudio-boot-support`（含 17 组 `/esmcp`，服务 token）。放行 `/esquerystudio.html` 与 `' + mountPath + '`；QuoteHub 的 MCP 端点是 `<host>/quotehub' + mountPath + '`。\n'
    + '- browser：解压扩展 → `chrome://extensions` 加载已解压的扩展程序 → 页面内使用 `window.ESQueryStudioMCP`。\n'
    + '- local-exe：Windows 下载 `esquerystudio-mcp.exe`；签名状态见同目录 `esquerystudio-mcp.json` 的 `signature`（未签名时首次可能触发 SmartScreen；只从官方 Release 下载并核对摘要）。\n'
    + '- local-node：`cd mcp && npm install -g .`（或直接 `node esquerystudio-mcp.mjs`），写工具需 `--allow-write`。\n\n'
    + '【安全与边界】\n'
    + '- 生产默认只读；写操作需显式授权与 MRTR 二次确认。跨云结构同步先 `smart_sync` `apply=false` 预览，确认 `planDigest` 后再 `apply=true`。\n'
    + '- 不把 key 打印到终端历史；使用环境变量或客户端密钥存储。\n'
    + '- 浏览器模式没有外部 HTTP 端点；本地模式连接凭据留在本机。';
  return { description, text };
}

function getMcpPrompt(name: string, args: Record<string, any> = {}): any {
  const requiredArg = (key: string): string => {
    const value = args[key] == null ? '' : String(args[key]).trim();
    if (!value) throw new Error('Missing required argument: ' + key);
    return value;
  };
  const optionalArg = (key: string): string => (args[key] == null ? '' : String(args[key]).trim());
  let description: string;
  let text: string;
  if (name === 'diagnose_slow_query') {
    const connection = requiredArg('connection');
    const index = optionalArg('index');
    const query = optionalArg('query');
    description = 'Diagnose a slow query with profile and shard evidence.';
    text = 'Act as an Elasticsearch performance engineer. Diagnose latency on connection `' + connection + '`'
      + (index ? ' against index `' + index + '`' : '') + '.\n\n'
      + '1. Call `es_get_mapping` and `es_field_caps` to confirm field types, analyzers and sortability.\n'
      + '2. Call `es_search` with `profile=true` (or `es_explain_doc`) and inspect the profile tree.\n'
      + '3. Call `es_search_shards` and `es_nodes_stats` to separate query cost from shard/thread-pool pressure.\n'
      + '4. If a rewrite looks promising, compare it with `es_rank_eval` and validate it with `es_validate_query`.\n'
      + '5. Report root cause, the smallest safe change, expected gain, verification query and rollback.\n\n'
      + 'Query or symptoms: ' + (query || '(not provided; ask for the slow query or inspect logs)');
  } else if (name === 'design_index_mapping') {
    const index = requiredArg('index');
    const sample = optionalArg('sample');
    const access = optionalArg('access');
    description = 'Design a mapping and settings proposal with validation steps.';
    text = 'Act as an Elasticsearch index-modeling expert. Design the mapping for `' + index + '`.\n\n'
      + 'Start from the sample documents/fields and access patterns below. Cover: field types, doc_values, '
      + 'analyzer choice, multi-fields, runtime fields, dynamic mapping policy, shard/replica sizing and retention.\n'
      + 'Use `es_index_settings_defaults` and `es_get_settings` to ground settings in the live cluster, '
      + 'then propose a concrete create-index body and validate representative queries with `es_validate_query`.\n\n'
      + 'Sample documents or fields: ' + (sample || '(not provided; ask for one)') + '\n'
      + 'Access patterns: ' + (access || '(not provided; ask for filters, sorts, aggregations and retention)');
  } else if (name === 'migrate_index') {
    const source = requiredArg('source');
    const target = requiredArg('target');
    const notes = optionalArg('notes');
    description = 'Plan a reindex or cross-cluster migration with verified cutover.';
    text = 'Plan and verify a migration from `' + source + '` to `' + target + '`.\n\n'
      + '1. Compare mappings with `es_get_mapping` and run `es_reindex_preview` for incompatible fields.\n'
      + '2. Check target settings (`es_get_settings`, `es_index_settings_defaults`) and disk/alias state.\n'
      + '3. 结构兼容：跨集群（尤其跨厂商，如生产阿里云 ES → UAT 腾讯云 ES）先用 es_xmigrate 的 probe_capabilities 探测源/目标厂商、版本与插件；再用 sync_structure 且 dryRun=true 预览兼容剔除计划——planned 为兼容矩阵预剔除（如阿里云 apack 私有设置、目标缺失插件的分析组件、节点属性路由），reactive 为建索引报错兜底剔除，advice 为分片数/副本/ILM 建议；确认计划后以 dryRun=false 执行（需 MRTR 二次确认），执行时携带 dryRun 预览返回的 planDigest（expectPlanDigest）防源结构漂移，需别名随迁时加 syncAliases=true。\n'
      + '4. Execute with `es_reindex` for same-cluster moves, or cross-cluster via `es_xmigrate` (`action=preflight`, then `start`, then poll `status`); same-cluster reindex progress comes from `es_task_detail`.\n'
      + '5. Verify equivalence with `es_xmigrate` `action=verify_equivalence` (jobId form after a migration job, or srcConnId+sourceIndex+destConnId+destIndex form): it compares document counts, hashes a sorted-_doc id sample and an optional terms aggregation (aggField), and returns verdict EQUIVALENT/DIVERGENT/INCONCLUSIVE; switch aliases with `es_alias` only after EQUIVALENT.\n'
      + '6. State the cutover order, validation gates and rollback. Do not delete the source until verification passes.\n\n'
      + 'Extra constraints: ' + (notes || '(none provided)');
  } else if (name === 'review_cluster_capacity') {
    const connection = requiredArg('connection');
    const window = optionalArg('window');
    description = 'Rank cluster capacity, shard and thread-pool risks.';
    text = 'Review capacity for connection `' + connection + '`' + (window ? ' (' + window + ')' : '') + '.\n\n'
      + 'Collect `es_cluster_health`, `es_cluster_stats`, `es_cat_allocation`, `es_nodes_stats`, '
      + '`es_allocation_explain`, `es_shard_stores`, `es_hot_threads` and `es_pending_tasks`.\n'
      + 'Rank risks by user impact: unassigned shards, disk watermark, JVM/heap pressure, hot threads, '
      + 'shard imbalance and oversized indices. For each risk give evidence, the smallest safe action, '
      + 'the expected effect and how to verify it afterwards.';
  } else if (name === 'triage_failed_search') {
    const connection = requiredArg('connection');
    const index = optionalArg('index');
    const symptom = requiredArg('symptom');
    description = 'Triage failed searches with allocation and shard evidence.';
    text = 'Triage a failed search on connection `' + connection + '`'
      + (index ? ' for index `' + index + '`' : '') + '.\n\n'
      + 'Symptom: ' + symptom + '\n\n'
      + '1. Reproduce with `es_search` or `es_count`, capturing partial shard failures.\n'
      + '2. Call `es_cluster_health`, `es_cat_allocation`, `es_shard_stores` and `es_allocation_explain` '
      + 'to distinguish missing shards, mapping conflicts, circuit breakers and node loss.\n'
      + '3. Check `es_pending_tasks` and `es_hot_threads` before assuming data loss.\n'
      + '4. Return the root cause, the exact recovery action, verification and a prevention check.';
  } else if (name === 'cross_cloud_structure_sync') {
    /* 提示词正文三端逐字一致（本地 Node 桥 / docs 同文案）：
       一步式 smart_sync 教学在前（含 mode=incremental 增量补同步），原分步八步保留为进阶 */
    const srcConnId = requiredArg('srcConnId');
    const destConnId = requiredArg('destConnId');
    const sourceIndex = optionalArg('sourceIndex');
    const destIndex = optionalArg('destIndex');
    description = 'Cross-cloud index structure sync: one-shot smart_sync (read-only plan preview, then apply with '
      + 'planDigest), or step-by-step probe, compare, sync_structure, diff and equivalence verification.';
    text = 'Cross-cloud index structure sync from `' + srcConnId + '` to `' + destConnId + '`'
      + (sourceIndex ? ' for index `' + sourceIndex
        + (destIndex ? '` → `' + destIndex : '') + '`' : '') + '.\n\n'
      + '首选一步式 smart_sync：一句话描述意图——把生产索引结构自动同步到 UAT，自动剔除非兼容属性。'
      + 'smart_sync {srcConnId, sourceIndex, destConnId, destIndex?, syncAliases?, downgradedAnalyzerFallback?, autoTune?, mode?, apply} '
      + '一次完成双侧探测、能力对比、计划生成与执行：apply=false（缺省）只读预览同步计划，'
      + '返回 verdict PLANNED 与 planDigest（免写权限、免二次确认），计划剔除/降级条目带规则 id 溯源'
      + '（version-floor 目标版本地板 / store-type-vendor 厂商特有存储类型 / plugin-analysis 缺插件分析组件）；'
      + '确认计划后 apply=true 并携带 expectPlanDigest 执行（需写权限与二次确认，apply 前后计划摘要守恒，'
      + '源结构漂移时返回 PLAN_DRIFT 拒绝执行）；autoTune=true 时按目标硬件规格自动整形'
      + '（如分片数超目标数据节点数时收敛）。目标索引已存在时改用 mode=incremental：生产新增字段后让 '
      + 'UAT 跟随同步——计划五清单如实呈报（addedFields 新增字段 / skippedConflicts 冲突字段跳过 / '
      + 'updatedSettings 动态 settings 差异 / staticBlocked 静态设置差异只建议不动 / addedAliases 补加别名），'
      + 'apply=true 时经漂移门后按序执行 PUT _mapping 合并补字段 → PUT _settings 更新动态白名单键 → 补别名，'
      + '每步结果进 executed；目标索引不存在返回 DEST_NOT_FOUND。预览时可携 savePlan=true 保存同步计划（响应回显 planId）；'
      + '跨会话用 plan_list 查看已存计划，plan_apply {planId} 直接按计划执行——漂移门自动采用保存时的计划摘要，'
      + '源结构已变化即 409 PLAN_DRIFT 拒绝，重新 smart_sync 预览即可。\n\n'
      + '进阶（需要逐步控制或诊断细节时分步执行）：\n'
      + '1. probe_capabilities on source (srcConnId) and target (destConnId) to capture version/vendor/plugins.\n'
      + '2. compare_capabilities {srcConnId, destConnId} for the risk matrix (vendor change, missing plugins, version gap).\n'
      + '3. sync_structure {dryRun:true} to preview removals/downgrades and the adapted create body with planDigest.\n'
      + '4. Optionally es_indices:config_validate on the planned body.\n'
      + '5. sync_structure {dryRun:false, expectPlanDigest} to execute (requires write permission and confirmation).\n'
      + '6. migrate_index with destCreateMode NONE when structure is already synced; monitor with jobs/status; reconcile counts.\n'
      + '7. diff_structure to verify the target matches the plan (expectedRemovals vs unexpected)；autoTune 收敛过或'
      + '上次计划剔除过的键可回传 autoTunedShards/removedKeys（上次同步报告值），计划内变更豁免不误报 unexpected。\n'
      + '8. verify_equivalence {srcConnId, sourceIndex, destConnId, destIndex, sampleSize, aggField?} for the final data check '
      + '(counts + sample hash + optional aggregation, verdict must be EQUIVALENT)；纯结构同步场景用 structureOnly=true '
      + '只比双侧结构摘要，是纯结构同步的终局验证。';
  } else if (name === 'deploy_and_connect') {
    const built = buildDeployAndConnectPrompt(args);
    description = built.description;
    text = built.text;
  } else {
    throw new Error('Unknown prompt: ' + name);
  }
  return {
    description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

function required(args: Record<string, any>, key: string): string {
  const value = args[key];
  if (value == null || String(value).trim() === '') throw new Error(`Missing required argument: ${key}`);
  return String(value).trim();
}

/** 接受查询子句对象或 JSON 字符串（子句本身或完整 {"query":...} 搜索体）。 */
function queryClause(raw: any): any {
  if (raw == null) return null;
  const parsed = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : null) : raw;
  if (parsed == null) return null;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('query must be an object or a JSON object string');
  return Object.prototype.hasOwnProperty.call(parsed, 'query') ? parsed.query : parsed;
}

/* 与 McpRestClassifier 同口径：ES 的查询大量走 POST，不能用方法粗判读写。 */
const REST_POST_READ = [
  /^\/(?:[^/]+\/)?_search(?:\/.*)?$/,
  /^\/(?:[^/]+\/)?_count$/,
  /^\/_msearch(?:\/template)?$/,
  /^\/(?:[^/]+\/)?_mget$/,
  /^\/(?:[^/]+\/)?_search\/template$/,
  /^\/_search\/scroll$/,
  /^\/_search\/scroll\/[^/]+$/,
  /^\/_search_shards$/,
  /^\/_render\/template$/,
  /^\/_sql(?:\/(?:translate|close))?$/,
  /^\/_xpack\/sql(?:\/(?:translate|close))?$/,
  /^\/(?:[^/]+\/)?_field_caps$/,
  /^\/(?:[^/]+\/)?_analyze$/,
  /^\/(?:[^/]+\/)?_validate\/query$/,
  /^\/(?:[^/]+\/)?_explain\/[^/]+$/,
  /^\/(?:[^/]+\/)?_terms_enum$/,
  /^\/(?:[^/]+\/)?_termvectors(?:\/[^/]+)?$/,
  /^\/(?:[^/]+\/)?_mtermvectors$/,
  /^\/(?:[^/]+\/)?_rank_eval$/,
  /^\/_pit$/,
  /^\/_pit\/[^/]+$/,
  /^\/_scripts\/painless\/_execute$/,
];
const REST_DELETE_READ = [
  /^\/_search\/scroll$/,
  /^\/_pit$/,
  /^\/_pit\/[^/]+$/,
  /^\/_sql\/close$/,
];

export function isMcpRestReadOnly(method: string, path: string): boolean {
  const m = String(method || 'GET').trim().toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  const p = String(path || '').trim().toLowerCase().split('?')[0].replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const patterns = m === 'POST' ? REST_POST_READ : m === 'DELETE' ? REST_DELETE_READ : [];
  return patterns.some((re) => re.test(p));
}

function msearchNdjson(args: Record<string, any>): string {
  const searches = args.searches;
  if (!Array.isArray(searches) || !searches.length) throw new Error('searches must be a non-empty array');
  const defaultIndex = args.index ? String(args.index) : '';
  const lines: string[] = [];
  for (const search of searches) {
    if (!search || typeof search !== 'object') throw new Error('each search must be an object');
    const index = String(search.index || defaultIndex || '').trim();
    if (!index) throw new Error('each search needs index');
    lines.push(JSON.stringify({ index }));
    const body: Record<string, any> = search.body == null ? {} : { ...objectValue(search.body, 'body') };
    if (search.size != null) body.size = Math.max(1, Math.min(100, Number(search.size) || 10));
    else if (body.size == null) body.size = 10;
    const clause = queryClause(search.query);
    if (clause) body.query = clause;
    else if (body.query == null) body.query = { match_all: {} };
    lines.push(JSON.stringify(body));
  }
  return lines.join('\n') + '\n';
}

function bulkNdjson(args: Record<string, any>): string {
  const operations = args.operations;
  if (!Array.isArray(operations) || !operations.length) throw new Error('operations must be a non-empty array');
  const defaultIndex = args.index ? String(args.index) : '';
  const lines: string[] = [];
  for (const op of operations) {
    if (!op || typeof op !== 'object') throw new Error('each operation must be an object');
    const action = String(op.action || 'index').toLowerCase();
    if (!['index', 'create', 'update', 'delete'].includes(action)) throw new Error('unsupported bulk action: ' + action);
    const index = String(op.index || defaultIndex || '').trim();
    if (!index) throw new Error('each operation needs index');
    const meta: Record<string, any> = { _index: index };
    if (op.id != null && String(op.id).trim()) meta._id = String(op.id).trim();
    lines.push(JSON.stringify({ [action]: meta }));
    if (action !== 'delete') {
      if (op.document == null) throw new Error('bulk ' + action + ' needs document');
      const doc = typeof op.document === 'string' ? JSON.parse(op.document) : op.document;
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('bulk document must be an object');
      lines.push(JSON.stringify(action === 'update' ? { doc } : doc));
    }
  }
  return lines.join('\n') + '\n';
}

function documentBody(args: Record<string, any>, key: string): string {
  const raw = args[key];
  if (raw == null) throw new Error(`Missing required argument: ${key}`);
  return JSON.stringify(objectValue(raw, key));
}

function objectValue(raw: any, key: string): Record<string, any> {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${key} must be an object or a JSON object string`);
  }
  return parsed;
}

function searchBody(args: Record<string, any>): string {
  const body: Record<string, any> = args.body == null ? {} : { ...objectValue(args.body, 'body') };
  if (args.size != null) body.size = Math.max(1, Math.min(100, Number(args.size) || 10));
  else if (body.size == null) body.size = 10;
  const clause = queryClause(args.query);
  if (clause) body.query = clause;
  else if (body.query == null) body.query = { match_all: {} };
  return JSON.stringify(body);
}

async function rawTool(method: string, path: string, body?: any): Promise<any> {
  return jsonFetch('/internal/es/index/cluster/raw', {
    method: 'POST',
    body: JSON.stringify({
      method,
      path,
      body: typeof body === 'string' ? body : JSON.stringify(body || {}),
    }),
  });
}

async function jsonFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await browserFetch(path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error?.reason || `HTTP ${res.status}`);
  return data;
}

/** MCP xmigrate 浏览器形态：源连接只认本机连接档案（与 REST/MCP 只认 srcConnId 同口径），
    凭据从 browserProfiles 取、现场直连旧集群；档案不存在如实报错，不静默回落当前激活档案。 */
function xmigrateBrowserConn(srcConnId: string): Record<string, any> {
  const profile = profiles().find(p => p.id === srcConnId);
  if (!profile) throw new Error('连接档案不存在: ' + srcConnId);
  return { url: profile.url, username: profile.username, password: profile.password };
}

/** 实现层分发：按内部工具名执行；协议入口归一后与资源读取、参数补全等内部调用都走这里。 */
async function dispatchBrowserTool(name: string, args: Record<string, any> = {}): Promise<any> {
  /* sync_structure 的 dryRun=true 只读预览与 smart_sync 的 apply=false 预览：
   * 不受页面写开关限制（dryRun=false / apply=true 维持写门） */
  if (MCP_WRITE_TOOLS.includes(name) && !isBrowserMcpWriteAllowed()
    && !(name === 'es_xmigrate_sync_structure' && args?.dryRun === true)
    && !(name === 'es_xmigrate_smart_sync' && args?.apply !== true)) {
    throw new Error('页面内写工具未启用：请在 Dev Tools → MCP 面板显式打开「允许页面内写工具」');
  }
  let data: any;
  switch (name) {
    case 'es_list_connections': {
      const active = activeProfile()?.id;
      data = profiles().map(profile => ({
        id: profile.id,
        name: profile.name,
        env: profile.env,
        active: profile.id === active,
      }));
      break;
    }
    case 'es_list_indices':
      data = await jsonFetch('/internal/es/index/cluster/indices');
      break;
    case 'es_cluster_health':
      data = await jsonFetch('/internal/es/index/cluster/health');
      break;
    case 'es_get_mapping':
      data = await jsonFetch('/internal/es/index/cluster/mapping-detail?index=' + encodeURIComponent(required(args, 'index')));
      break;
    case 'es_get_doc':
      data = await jsonFetch('/internal/es/index/cluster/doc?index=' + encodeURIComponent(required(args, 'index'))
        + '&id=' + encodeURIComponent(required(args, 'id')));
      break;
    case 'es_get_settings':
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_settings');
      break;
    case 'es_get_aliases':
      data = await rawTool('GET', '/_cat/aliases?format=json');
      break;
    case 'es_list_templates':
      try { data = await rawTool('GET', '/_index_template'); }
      catch { data = await rawTool('GET', '/_template'); }
      break;
    case 'es_list_data_streams':
      data = await rawTool('GET', '/_data_stream');
      break;
    case 'es_get_data_stream':
      data = await rawTool('GET', '/_data_stream/' + encodeURIComponent(required(args, 'name')));
      break;
    case 'es_data_stream_stats':
      data = await rawTool('GET', '/_data_stream/' + encodeURIComponent(required(args, 'name')) + '/_stats');
      break;
    case 'es_create_data_stream':
      data = await rawTool('PUT', '/_data_stream/' + encodeURIComponent(required(args, 'name')));
      break;
    case 'es_delete_data_stream':
      data = await rawTool('DELETE', '/_data_stream/' + encodeURIComponent(required(args, 'name')));
      break;
    case 'es_list_component_templates':
      data = await rawTool('GET', '/_component_template');
      break;
    case 'es_clone_index':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index'))
        + '/_clone/' + encodeURIComponent(required(args, 'target')), args.body);
      break;
    case 'es_shrink_index':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index'))
        + '/_shrink/' + encodeURIComponent(required(args, 'target')), args.body);
      break;
    case 'es_split_index':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index'))
        + '/_split/' + encodeURIComponent(required(args, 'target')), args.body);
      break;
    case 'es_list_nodes':
      data = await rawTool('GET', '/_cat/nodes?format=json');
      break;
    case 'es_list_tasks':
      data = await rawTool('GET', '/_tasks?group_by=parents' + (args.actions ? '&actions=' + encodeURIComponent(String(args.actions)) : ''));
      break;
    case 'es_index_recovery':
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_recovery');
      break;
    case 'es_cat_shards':
      data = await rawTool('GET', '/_cat/shards'
        + (args.index ? '/' + encodeURIComponent(String(args.index)) : '') + '?format=json');
      break;
    case 'es_cluster_state':
      data = await rawTool('GET', '/_cluster/state/'
        + encodeURIComponent(String(args.metrics || 'metadata'))
        + (args.index ? '/' + encodeURIComponent(String(args.index)) : ''));
      break;
    case 'es_mtermvectors':
      data = await rawTool('POST', (args.index ? '/' + encodeURIComponent(String(args.index)) : '') + '/_mtermvectors', args.body);
      break;
    case 'es_index_segments':
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_segments');
      break;
    case 'es_list_transforms':
      data = await rawTool('GET', '/_transform');
      break;
    case 'es_get_transform':
      data = await rawTool('GET', '/_transform/' + encodeURIComponent(required(args, 'id')));
      break;
    case 'es_transform_stats':
      data = await rawTool('GET', '/_transform/' + encodeURIComponent(required(args, 'id')) + '/_stats');
      break;
    case 'es_put_transform':
      data = await rawTool('PUT', '/_transform/' + encodeURIComponent(required(args, 'id')), args.body);
      break;
    case 'es_start_transform':
      data = await rawTool('POST', '/_transform/' + encodeURIComponent(required(args, 'id')) + '/_start');
      break;
    case 'es_stop_transform':
      data = await rawTool('POST', '/_transform/' + encodeURIComponent(required(args, 'id')) + '/_stop');
      break;
    case 'es_delete_transform':
      data = await rawTool('DELETE', '/_transform/' + encodeURIComponent(required(args, 'id')));
      break;
    case 'es_search':
      data = await jsonFetch(
        '/internal/es/index/cluster/search-dsl?index=' + encodeURIComponent(required(args, 'index'))
          + '&explain=' + (args.explain ? 'true' : 'false')
          + '&profile=' + (args.profile ? 'true' : 'false'),
        { method: 'POST', body: searchBody(args) },
      );
      break;
    case 'es_get_index_stats':
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_stats');
      break;
    case 'es_count':
      data = await jsonFetch('/internal/es/index/cluster/count?index=' + encodeURIComponent(required(args, 'index')), {
        method: 'POST',
        body: JSON.stringify({ query: queryClause(args.query) || { match_all: {} } }),
      });
      break;
    case 'es_sql':
      data = await jsonFetch('/internal/es/index/cluster/sql/query', {
        method: 'POST',
        body: JSON.stringify({
          query: required(args, 'query'),
          fetch_size: args.fetchSize ? Math.max(1, Math.min(5000, Number(args.fetchSize) || 200)) : undefined,
        }),
      });
      break;
    case 'es_explain_doc': {
      const query = queryClause(args.query) || { match_all: {} };
      data = await jsonFetch(
        '/internal/es/index/cluster/explain-doc?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')),
        { method: 'POST', body: JSON.stringify({ query }) },
      );
      break;
    }
    case 'es_msearch':
      data = await rawTool('POST', '/_msearch', msearchNdjson(args));
      break;
    case 'es_mget': {
      if (!Array.isArray(args.ids) || !args.ids.length) throw new Error('ids must be a non-empty array');
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_mget',
        { ids: args.ids.map((id: any) => String(id)) });
      break;
    }
    case 'es_scroll_start': {
      const scroll = String(args.scroll || '1m');
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index'))
        + '/_search?scroll=' + encodeURIComponent(scroll), searchBody(args));
      break;
    }
    case 'es_scroll_next':
      data = await rawTool('POST', '/_search/scroll', {
        scroll: String(args.scroll || '1m'),
        scroll_id: required(args, 'scrollId'),
      });
      break;
    case 'es_scroll_clear': {
      const ids = Array.isArray(args.scrollIds)
        ? args.scrollIds.map((id: any) => String(id))
        : (args.scrollId ? [String(args.scrollId)] : []);
      if (!ids.length) throw new Error('scrollId or scrollIds is required');
      data = await rawTool('DELETE', '/_search/scroll', { scroll_id: ids });
      break;
    }
    case 'es_resolve_index':
      data = await rawTool('GET', '/_resolve/index/' + encodeURIComponent(required(args, 'name')));
      break;
    case 'es_search_shards': {
      const qs = args.routing ? '?routing=' + encodeURIComponent(String(args.routing)) : '';
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_search_shards' + qs);
      break;
    }
    case 'es_rank_eval':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_rank_eval',
        documentBody(args, 'body'));
      break;
    case 'es_cluster_stats':
      data = await rawTool('GET', '/_cluster/stats');
      break;
    case 'es_refresh_index':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_refresh');
      break;
    case 'es_flush_index':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_flush');
      break;
    case 'es_index_close':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_close');
      break;
    case 'es_index_open':
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_open');
      break;
    case 'es_bulk': {
      const p = new URLSearchParams();
      for (const key of ['refresh', 'pipeline', 'timeout', 'waitForActiveShards']) {
        if (args[key] != null && String(args[key]).trim() !== '') {
          p.set(key === 'waitForActiveShards' ? 'wait_for_active_shards' : key, String(args[key]));
        }
      }
      const qs = p.toString();
      data = await rawTool('POST', '/_bulk' + (qs ? '?' + qs : ''), bulkNdjson(args));
      break;
    }
    case 'es_terms_enum': {
      const body: Record<string, any> = { field: required(args, 'field') };
      const q = queryClause(args.query);
      if (q) body.query = q;
      if (args.size != null) body.size = Math.max(1, Math.min(1000, Number(args.size) || 100));
      if (args.caseInsensitive) body.case_insensitive = true;
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_terms_enum', body);
      break;
    }
    case 'es_field_caps': {
      const fields = String(args.fields || '*');
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index'))
        + '/_field_caps?fields=' + encodeURIComponent(fields));
      break;
    }
    case 'es_task_cancel':
      data = await rawTool('POST', '/_tasks/' + encodeURIComponent(required(args, 'taskId')) + '/_cancel');
      break;
    case 'es_sql_cursor': {
      const p = '/internal/es/index/cluster/sql/cursor?cursor=' + encodeURIComponent(required(args, 'cursor'))
        + (args.timeZone ? '&timeZone=' + encodeURIComponent(String(args.timeZone)) : '')
        + (args.columnar != null ? '&columnar=' + (args.columnar ? 'true' : 'false') : '');
      data = await jsonFetch(p);
      break;
    }
    case 'es_sql_close':
      data = await jsonFetch('/internal/es/index/cluster/sql/close?cursor='
        + encodeURIComponent(required(args, 'cursor')), { method: 'POST' });
      break;
    case 'es_sql_translate':
      data = await jsonFetch('/internal/es/index/cluster/sql/translate', {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    case 'es_pit_open': {
      const ka = args.keepAlive ? '?keep_alive=' + encodeURIComponent(String(args.keepAlive)) : '';
      data = await rawTool('POST', '/' + encodeURIComponent(required(args, 'index')) + '/_pit' + ka);
      break;
    }
    case 'es_pit_search':
      data = await rawTool('POST', '/_search', documentBody(args, 'body'));
      break;
    case 'es_pit_close':
      data = await rawTool('DELETE', '/_pit', { id: required(args, 'pitId') });
      break;
    case 'es_create_index': {
      const body: Record<string, any> = {};
      if (args.settings != null && String(args.settings).trim() !== '') body.settings = objectValue(args.settings, 'settings');
      if (args.mappings != null && String(args.mappings).trim() !== '') body.mapping = objectValue(args.mappings, 'mappings');
      data = await jsonFetch(
        '/internal/es/index/cluster/create-index?index=' + encodeURIComponent(required(args, 'index')),
        { method: 'POST', body: JSON.stringify(body) },
      );
      break;
    }
    case 'es_delete_index':
      data = await jsonFetch(
        '/internal/es/index/cluster/delete-index?index=' + encodeURIComponent(required(args, 'index')),
        { method: 'POST' },
      );
      break;
    case 'es_put_mapping':
      data = await jsonFetch(
        '/internal/es/index/cluster/put-mapping?index=' + encodeURIComponent(required(args, 'index')),
        { method: 'POST', body: documentBody(args, 'mappings') },
      );
      break;
    case 'es_update_settings':
      data = await jsonFetch(
        '/internal/es/index/cluster/update-settings?index=' + encodeURIComponent(required(args, 'index')),
        { method: 'POST', body: documentBody(args, 'settings') },
      );
      break;
    case 'es_alias': {
      if (!Array.isArray(args.actions) || !args.actions.length) throw new Error('actions must be a non-empty array');
      data = await jsonFetch('/internal/es/index/cluster/alias-actions', {
        method: 'POST', body: JSON.stringify({ actions: args.actions }),
      });
      break;
    }
    case 'es_rollover': {
      const qs = '?alias=' + encodeURIComponent(required(args, 'alias'))
        + (args.dryRun ? '&dryRun=true' : '');
      const init: RequestInit = { method: 'POST' };
      if (args.conditions != null && String(args.conditions).trim() !== '') {
        init.body = JSON.stringify({ conditions: objectValue(args.conditions, 'conditions') });
      }
      data = await jsonFetch('/internal/es/index/cluster/rollover' + qs, init);
      break;
    }
    case 'es_force_merge': {
      const segments = args.maxNumSegments == null ? 1 : Math.max(1, Math.min(1000, Number(args.maxNumSegments) || 1));
      data = await jsonFetch(
        '/internal/es/index/cluster/force-merge?index=' + encodeURIComponent(required(args, 'index'))
          + '&maxSegments=' + segments,
        { method: 'POST' },
      );
      break;
    }
    case 'es_put_template':
      data = await jsonFetch(
        '/internal/es/index/cluster/templates/put?name=' + encodeURIComponent(required(args, 'name'))
          + '&kind=' + encodeURIComponent(String(args.kind || 'index')),
        { method: 'POST', body: documentBody(args, 'template') },
      );
      break;
    case 'es_delete_template':
      data = await jsonFetch(
        '/internal/es/index/cluster/templates/delete?name=' + encodeURIComponent(required(args, 'name'))
          + '&kind=' + encodeURIComponent(String(args.kind || 'index')),
        { method: 'POST' },
      );
      break;
    case 'es_update_by_query': {
      const body: Record<string, any> = {};
      const query = queryClause(args.query);
      if (query) body.query = query;
      if (args.script != null) body.script = objectValue(args.script, 'script');
      const p = new URLSearchParams({ index: required(args, 'index') });
      for (const key of ['maxDocs', 'waitForCompletion', 'refresh', 'conflicts', 'slices',
        'requestsPerSecond', 'scroll', 'timeout', 'waitForActiveShards']) {
        if (args[key] != null && String(args[key]).trim() !== '') p.set(key, String(args[key]));
      }
      data = await jsonFetch('/internal/es/index/cluster/update-by-query?' + p.toString(), {
        method: 'POST', body: JSON.stringify(body),
      });
      break;
    }
    case 'es_delete_by_query': {
      const query = queryClause(args.query);
      if (!query) throw new Error('query is required for delete_by_query');
      const p = new URLSearchParams({ index: required(args, 'index') });
      for (const key of ['maxDocs', 'waitForCompletion', 'refresh', 'conflicts', 'slices',
        'requestsPerSecond', 'scroll', 'timeout', 'waitForActiveShards']) {
        if (args[key] != null && String(args[key]).trim() !== '') p.set(key, String(args[key]));
      }
      data = await jsonFetch('/internal/es/index/cluster/delete-by-query?' + p.toString(), {
        method: 'POST', body: JSON.stringify({ query }),
      });
      break;
    }
    case 'es_reindex': {
      const p = new URLSearchParams();
      for (const key of ['slices', 'waitForCompletion', 'refresh', 'requestsPerSecond', 'scroll',
        'timeout', 'waitForActiveShards']) {
        if (args[key] != null && String(args[key]).trim() !== '') p.set(key, String(args[key]));
      }
      const qs = p.toString();
      data = await jsonFetch('/internal/es/index/cluster/reindex-advanced' + (qs ? '?' + qs : ''), {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    }
    case 'es_analyze': {
      const index = args.index ? '?index=' + encodeURIComponent(String(args.index)) : '';
      data = await jsonFetch('/internal/es/index/cluster/analyze' + index, {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    }
    case 'es_validate_query':
      data = await jsonFetch(
        '/internal/es/index/cluster/validate-query?index=' + encodeURIComponent(required(args, 'index')),
        { method: 'POST', body: documentBody(args, 'body') },
      );
      break;
    case 'es_term_vectors':
      data = await jsonFetch(
        '/internal/es/index/cluster/term-vectors?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id'))
          + (args.fields ? '&fields=' + encodeURIComponent(String(args.fields)) : ''),
      );
      break;
    case 'es_search_template':
      data = await jsonFetch(
        '/internal/es/index/cluster/search-template?index=' + encodeURIComponent(required(args, 'index')),
        { method: 'POST', body: documentBody(args, 'body') },
      );
      break;
    case 'es_render_template':
      data = await jsonFetch('/internal/es/index/cluster/render-template', {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    case 'es_analysis_settings':
      data = await jsonFetch('/internal/es/index/cluster/analysis-settings?index='
        + encodeURIComponent(required(args, 'index')));
      break;
    case 'es_update_analysis_settings':
      data = await jsonFetch('/internal/es/index/cluster/analysis-update?index='
        + encodeURIComponent(required(args, 'index')), {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    case 'es_reload_analyzers':
      data = await jsonFetch('/internal/es/index/cluster/reload-analyzers?index='
        + encodeURIComponent(required(args, 'index')), { method: 'POST' });
      break;
    case 'es_synonyms_upsert': {
      if (!Array.isArray(args.entries)) throw new Error('entries must be an array of synonym rules');
      data = await jsonFetch(
        '/internal/es/index/cluster/synonyms-upsert?index=' + encodeURIComponent(required(args, 'index'))
          + '&filter=' + encodeURIComponent(String(args.filter || 'custom_synonyms'))
          + '&expand=' + (args.expand ? 'true' : 'false'),
        { method: 'POST', body: JSON.stringify(args.entries) },
      );
      break;
    }
    case 'es_reindex_preview': {
      const clause = queryClause(args.query);
      const body = clause ? JSON.stringify({ query: clause }) : '{"query":{"match_all":{}}}';
      data = await jsonFetch('/internal/es/index/cluster/reindex-preview?source='
        + encodeURIComponent(required(args, 'source')), { method: 'POST', body });
      break;
    }
    case 'es_index_settings_defaults':
      data = await jsonFetch('/internal/es/index/cluster/index-settings-defaults?index='
        + encodeURIComponent(required(args, 'index')));
      break;
    case 'es_index_detail': {
      const sample = args.sampleSize == null ? 5 : Math.max(0, Math.min(20, Number(args.sampleSize) || 0));
      data = await jsonFetch(
        '/internal/es/index/cluster/inspect?index=' + encodeURIComponent(required(args, 'index'))
          + '&sampleSize=' + sample,
      );
      break;
    }
    case 'es_allocation_explain': {
      const init: RequestInit = { method: 'POST' };
      if (args.body != null && String(args.body).trim() !== '') init.body = documentBody(args, 'body');
      data = await jsonFetch('/internal/es/index/cluster/allocation-explain', init);
      break;
    }
    case 'es_shard_stores': {
      const qs = args.status ? '?status=' + encodeURIComponent(String(args.status)) : '';
      data = await rawTool('GET', '/' + encodeURIComponent(required(args, 'index')) + '/_shard_stores' + qs);
      break;
    }
    case 'es_pending_tasks':
      data = await jsonFetch('/internal/es/index/cluster/pending-tasks');
      break;
    case 'es_slm_policies':
      data = await jsonFetch('/internal/es/index/cluster/slm/policies');
      break;
    case 'es_put_slm_policy':
      data = await rawTool('PUT', '/_slm/policy/' + encodeURIComponent(required(args, 'policyId')), args.body);
      break;
    case 'es_delete_slm_policy':
      data = await rawTool('DELETE', '/_slm/policy/' + encodeURIComponent(required(args, 'policyId')));
      break;
    case 'es_slm_status':
      data = await jsonFetch('/internal/es/index/cluster/slm/status');
      break;
    case 'es_slm_execute':
      data = await jsonFetch('/internal/es/index/cluster/slm/execute?policyId='
        + encodeURIComponent(required(args, 'policyId')), { method: 'POST' });
      break;
    case 'es_nodes_stats':
      data = await jsonFetch('/internal/es/index/cluster/nodes-stats');
      break;
    case 'es_hot_threads': {
      const p = new URLSearchParams();
      p.set('threads', String(args.threads == null ? 3 : Math.max(1, Math.min(100, Number(args.threads) || 3))));
      if (args.interval) p.set('interval', String(args.interval));
      if (args.type) p.set('type', String(args.type));
      if (args.nodeId) p.set('nodeId', String(args.nodeId));
      const res = await browserFetch('/internal/es/index/cluster/hot-threads?' + p.toString());
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      data = { raw: text };
      break;
    }
    case 'es_remote_clusters':
      data = await jsonFetch('/internal/es/index/cluster/remote-clusters');
      break;
    case 'es_plugins':
      data = await jsonFetch('/internal/es/index/cluster/plugins');
      break;
    case 'es_watcher':
      data = await jsonFetch('/internal/es/index/cluster/watcher');
      break;
    case 'es_put_watch':
      data = await rawTool('PUT', '/_watcher/watch/' + encodeURIComponent(required(args, 'id')), args.body);
      break;
    case 'es_delete_watch':
      data = await rawTool('DELETE', '/_watcher/watch/' + encodeURIComponent(required(args, 'id')));
      break;
    case 'es_execute_watch':
      data = await rawTool('POST', '/_watcher/watch/' + encodeURIComponent(required(args, 'id')) + '/_execute');
      break;
    case 'es_ingest_pipelines': {
      const path = args.id ? '/_ingest/pipeline/' + encodeURIComponent(String(args.id)) : '/_ingest/pipeline';
      data = await rawTool('GET', path);
      break;
    }
    case 'es_put_ingest_pipeline':
      data = await rawTool('PUT', '/_ingest/pipeline/' + encodeURIComponent(required(args, 'id')), args.body);
      break;
    case 'es_delete_ingest_pipeline':
      data = await rawTool('DELETE', '/_ingest/pipeline/' + encodeURIComponent(required(args, 'id')));
      break;
    case 'es_cat_allocation':
      data = await rawTool('GET', '/_cat/allocation?format=json&bytes=b');
      break;
    case 'es_get_cluster_settings':
      data = await jsonFetch('/internal/es/index/cluster/settings');
      break;
    case 'es_update_cluster_settings':
      data = await jsonFetch('/internal/es/index/cluster/settings/put', {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    case 'es_reroute': {
      const p = new URLSearchParams();
      if (args.dryRun) p.set('dryRun', 'true');
      if (args.explain != null) p.set('explain', args.explain ? 'true' : 'false');
      if (args.retryFailed) p.set('retryFailed', 'true');
      const qs = p.toString();
      data = await jsonFetch('/internal/es/index/cluster/reroute' + (qs ? '?' + qs : ''), {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    }
    case 'es_list_snapshot_repos':
      data = await jsonFetch('/internal/es/index/cluster/snapshot/repos');
      break;
    case 'es_put_snapshot_repo':
      data = await rawTool('PUT', '/_snapshot/' + encodeURIComponent(required(args, 'repo')), args.body);
      break;
    case 'es_delete_snapshot_repo':
      data = await rawTool('DELETE', '/_snapshot/' + encodeURIComponent(required(args, 'repo')));
      break;
    case 'es_list_snapshots':
      data = await jsonFetch('/internal/es/index/cluster/snapshot/list?repo='
        + encodeURIComponent(required(args, 'repo')));
      break;
    case 'es_snapshot_status': {
      const p = new URLSearchParams();
      if (args.repo) p.set('repo', String(args.repo));
      if (args.name) p.set('name', String(args.name));
      const qs = p.toString();
      data = await jsonFetch('/internal/es/index/cluster/snapshot/status' + (qs ? '?' + qs : ''));
      break;
    }
    case 'es_create_snapshot': {
      const init: RequestInit = { method: 'POST' };
      if (args.body != null && String(args.body).trim() !== '') init.body = documentBody(args, 'body');
      data = await jsonFetch('/internal/es/index/cluster/snapshot/create?repo='
        + encodeURIComponent(required(args, 'repo'))
        + '&name=' + encodeURIComponent(required(args, 'name')), init);
      break;
    }
    case 'es_delete_snapshot':
      data = await jsonFetch('/internal/es/index/cluster/snapshot/delete?repo='
        + encodeURIComponent(required(args, 'repo'))
        + '&name=' + encodeURIComponent(required(args, 'name')), { method: 'POST' });
      break;
    case 'es_restore_snapshot': {
      const init: RequestInit = { method: 'POST' };
      if (args.body != null && String(args.body).trim() !== '') init.body = documentBody(args, 'body');
      data = await jsonFetch('/internal/es/index/cluster/snapshot/restore?repo='
        + encodeURIComponent(required(args, 'repo'))
        + '&name=' + encodeURIComponent(required(args, 'name')), init);
      break;
    }
    case 'es_ilm_policies':
      data = await jsonFetch('/internal/es/index/cluster/ilm/policies');
      break;
    case 'es_ilm_explain':
      data = await jsonFetch('/internal/es/index/cluster/ilm/explain?index='
        + encodeURIComponent(required(args, 'index')));
      break;
    case 'es_ilm_status':
      data = await jsonFetch('/internal/es/index/cluster/ilm/status');
      break;
    case 'es_put_ilm_policy':
      data = await jsonFetch('/internal/es/index/cluster/ilm/policy?name='
        + encodeURIComponent(required(args, 'name')), {
        method: 'PUT', body: documentBody(args, 'policy'),
      });
      break;
    case 'es_delete_ilm_policy':
      data = await jsonFetch('/internal/es/index/cluster/ilm/policy?name='
        + encodeURIComponent(required(args, 'name')), { method: 'DELETE' });
      break;
    case 'es_ilm_move':
      data = await jsonFetch('/internal/es/index/cluster/ilm/move?index='
        + encodeURIComponent(required(args, 'index')), {
        method: 'POST', body: documentBody(args, 'body'),
      });
      break;
    case 'es_ilm_start':
      data = await jsonFetch('/internal/es/index/cluster/ilm/start', { method: 'POST' });
      break;
    case 'es_ilm_stop':
      data = await jsonFetch('/internal/es/index/cluster/ilm/stop', { method: 'POST' });
      break;
    case 'es_list_scripts':
      data = await jsonFetch('/internal/es/index/cluster/scripts');
      break;
    case 'es_put_script':
      data = await jsonFetch('/internal/es/index/cluster/scripts/put?id='
        + encodeURIComponent(required(args, 'id')), {
        method: 'POST', body: documentBody(args, 'script'),
      });
      break;
    case 'es_delete_script':
      data = await jsonFetch('/internal/es/index/cluster/scripts/delete?id='
        + encodeURIComponent(required(args, 'id')), { method: 'POST' });
      break;
    case 'es_task_detail':
      data = await jsonFetch('/internal/es/index/cluster/task-detail?taskId='
        + encodeURIComponent(required(args, 'taskId')));
      break;
    case 'es_index_doc':
      data = await jsonFetch(
        '/internal/es/index/cluster/doc?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')) + '&refresh=true',
        { method: 'POST', body: documentBody(args, 'document') },
      );
      break;
    case 'es_update_doc':
      data = await jsonFetch(
        '/internal/es/index/cluster/update-partial?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')),
        { method: 'POST', body: documentBody(args, 'document') },
      );
      break;
    case 'es_delete_doc':
      data = await jsonFetch(
        '/internal/es/index/cluster/delete-by-id?index=' + encodeURIComponent(required(args, 'index'))
          + '&id=' + encodeURIComponent(required(args, 'id')),
        { method: 'POST' },
      );
      break;
    case 'es_rest': {
      const method = required(args, 'method').toUpperCase();
      const path = required(args, 'path');
      if (!path.startsWith('/') || path.includes('..')) throw new Error('path must start with / and must not contain ..');
      if (!isMcpRestReadOnly(method, path) && !isBrowserMcpWriteAllowed()) {
        throw new Error('页面内写工具未启用：raw ' + method + ' ' + path + ' 需要打开「允许页面内写工具」');
      }
      data = await jsonFetch('/internal/es/index/cluster/raw', {
        method: 'POST',
        body: JSON.stringify({
          method,
          path,
          body: typeof args.body === 'string' ? args.body : JSON.stringify(args.body || {}),
        }),
      });
      break;
    }
    case 'es_adhoc_prepare':
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/prepare?index='
        + encodeURIComponent(required(args, 'index')));
      break;
    case 'es_adhoc_start': {
      const req: Record<string, any> = {};
      for (const key of ['index', 'strategy', 'timeField', 'destIndex', 'settingsJson',
        'mappingJson', 'bufferMs', 'deleteOldIndex', 'confirmDirectSwap', 'pauseBeforeSwitch']) {
        if (args[key] !== undefined) req[key] = args[key];
      }
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/start', {
        method: 'POST', body: JSON.stringify(req),
      });
      break;
    }
    case 'es_adhoc_status':
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/status?jobId='
        + encodeURIComponent(required(args, 'jobId')));
      break;
    case 'es_adhoc_abort':
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/abort?jobId='
        + encodeURIComponent(required(args, 'jobId')), { method: 'POST' });
      break;
    case 'es_adhoc_confirm_switch':
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/confirm-switch?jobId='
        + encodeURIComponent(required(args, 'jobId')), { method: 'POST' });
      break;
    case 'es_adhoc_jobs':
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/jobs');
      break;
    case 'es_adhoc_retry':
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/retry', {
        method: 'POST', body: JSON.stringify({ jobId: required(args, 'jobId') }),
      });
      break;
    case 'es_adhoc_delete_jobs': {
      if (args.jobId != null) {
        data = await jsonFetch('/internal/es/index/adhoc-rebuild/jobs/'
          + encodeURIComponent(required(args, 'jobId')), { method: 'DELETE' });
      } else if (args.olderThanDays != null) {
        data = await jsonFetch('/internal/es/index/adhoc-rebuild/jobs?olderThanDays='
          + encodeURIComponent(String(args.olderThanDays)), { method: 'DELETE' });
      } else {
        throw new Error('Missing required argument: jobId or olderThanDays');
      }
      break;
    }
    case 'es_adhoc_throttle':
      data = await jsonFetch('/internal/es/index/adhoc-rebuild/jobs/'
        + encodeURIComponent(required(args, 'jobId')) + '/throttle', {
        method: 'POST', body: JSON.stringify({ requestsPerSecond: args.requestsPerSecond }),
      });
      break;
    case 'es_adhoc_events':
      /* 事件时间线读本机台账即可回放，不需要 ES 连接；作业不存在如实报错 */
      data = await adhocEvents(required(args, 'jobId'));
      break;
    case 'es_xmigrate_preflight':
      data = await jsonFetch('/internal/es/xmigrate/preflight', {
        method: 'POST',
        body: JSON.stringify({
          sourceIndex: required(args, 'sourceIndex'),
          destIndex: required(args, 'destIndex'),
        }),
      });
      break;
    case 'es_xmigrate_start': {
      const srcConnId = required(args, 'srcConnId');
      const req: Record<string, any> = { srcConnId, conn: xmigrateBrowserConn(srcConnId) };
      for (const key of ['sourceIndex', 'destIndex', 'destCreateMode', 'tuneMode', 'slices', 'batchSize', 'forceMerge']) {
        if (args[key] !== undefined) req[key] = args[key];
      }
      data = await jsonFetch('/internal/es/xmigrate/start', {
        method: 'POST', body: JSON.stringify(req),
      });
      break;
    }
    case 'es_xmigrate_status':
      data = await jsonFetch('/internal/es/xmigrate/progress?jobId='
        + encodeURIComponent(required(args, 'jobId')));
      break;
    case 'es_xmigrate_jobs':
      data = await jsonFetch('/internal/es/xmigrate/jobs?limit='
        + (args.limit == null ? 20 : Math.max(1, Math.min(500, Number(args.limit) || 20))));
      break;
    case 'es_xmigrate_fetch_config':
      data = await jsonFetch('/internal/es/xmigrate/fetch-config?sourceIndex='
        + encodeURIComponent(required(args, 'sourceIndex'))
        + '&connId=' + encodeURIComponent(required(args, 'srcConnId')), {
        method: 'POST', body: '{}',
      });
      break;
    case 'es_xmigrate_resume': {
      const resumeConnId = required(args, 'srcConnId');
      data = await jsonFetch('/internal/es/xmigrate/resume?jobId='
        + encodeURIComponent(required(args, 'jobId'))
        + '&connId=' + encodeURIComponent(resumeConnId), {
        method: 'POST', body: JSON.stringify(xmigrateBrowserConn(resumeConnId)),
      });
      break;
    }
    case 'es_xmigrate_abort':
      data = await jsonFetch('/internal/es/xmigrate/abort?jobId='
        + encodeURIComponent(required(args, 'jobId')), { method: 'POST' });
      break;
    case 'es_xmigrate_reconcile': {
      /* 双侧计数组合：源侧用本机档案直连旧集群的索引清单（connect-check 带 docs.count），
         目标侧走当前激活连接的 /cluster/count（与服务端 destConnId=宿主连接语义对齐，
         浏览器模式宿主侧即当前档案）。 */
      const reconcileSrcConnId = required(args, 'srcConnId');
      const reconcileSourceIndex = required(args, 'sourceIndex');
      const reconcileDestConnId = String(args.destConnId || 'host').trim();
      const reconcileDestIndex = required(args, 'destIndex');
      const activeId = activeProfile()?.id;
      if (reconcileDestConnId !== 'host' && reconcileDestConnId !== activeId) {
        throw new Error('浏览器模式目标侧只能是当前激活连接（destConnId 传 host 或当前档案 id），实际: '
          + reconcileDestConnId + '；请先在顶栏切换目标连接');
      }
      const srcRows = await jsonFetch('/internal/es/xmigrate/connect-check', {
        method: 'POST', body: JSON.stringify(xmigrateBrowserConn(reconcileSrcConnId)),
      });
      const srcRow = (Array.isArray(srcRows) ? srcRows : []).find((r: any) => r && r.index === reconcileSourceIndex);
      if (!srcRow) throw new Error('源集群索引清单中找不到该索引: ' + reconcileSourceIndex);
      const srcCount = Number(srcRow['docs.count']);
      const destCounted = await jsonFetch('/internal/es/index/cluster/count?index='
        + encodeURIComponent(reconcileDestIndex), {
        method: 'POST', body: JSON.stringify({ query: { match_all: {} } }),
      });
      const destCount = Number(destCounted?.count);
      data = {
        sourceIndex: reconcileSourceIndex,
        destConnId: reconcileDestConnId,
        destIndex: reconcileDestIndex,
        srcCount,
        destCount,
        diff: srcCount - destCount,
      };
      break;
    }
    case 'es_xmigrate_conflicts': {
      const conflictJob = await jsonFetch('/internal/es/xmigrate/progress?jobId='
        + encodeURIComponent(required(args, 'jobId')));
      data = {
        jobId: conflictJob?.jobId ?? null,
        conflicts: conflictJob?.conflicts ?? null,
        conflictSamples: Array.isArray(conflictJob?.conflictSamples) ? conflictJob.conflictSamples : [],
        sampleCap: 1000,
        note: '冲突 _id 样本为环形收集，上限 1000 条；总冲突数见 conflicts 字段',
      };
      break;
    }
    case 'es_xmigrate_events':
      /* 事件时间线走 REST 同构端点（浏览器模式读本机作业台账事件环），断线后可按 jobId 回放 */
      data = await jsonFetch('/internal/es/xmigrate/jobs/'
        + encodeURIComponent(required(args, 'jobId')) + '/events');
      break;
    case 'es_xmigrate_connect_check':
      /* 源连接只认本机档案（与 start/resume 同口径），凭据从档案解析后现场连通检查 */
      data = await jsonFetch('/internal/es/xmigrate/connect-check', {
        method: 'POST', body: JSON.stringify(xmigrateBrowserConn(required(args, 'srcConnId'))),
      });
      break;
    case 'es_xmigrate_resolve_preview':
      data = await jsonFetch('/internal/es/xmigrate/resolve-preview', {
        method: 'POST', body: JSON.stringify(xmigrateBrowserConn(required(args, 'srcConnId'))),
      });
      break;
    case 'es_xmigrate_dest_indices':
      data = await jsonFetch('/internal/es/xmigrate/dest-indices');
      break;
    case 'es_xmigrate_delete_jobs': {
      /* 直调本机台账（jobId 单删回 {jobId, deleted:true}，olderThanDays 批量回 {deleted:N}，
         与 adhoc delete_jobs 的服务端口径一致），不经 REST DELETE 端点 */
      if (args.jobId != null) {
        await xmDeleteJob(required(args, 'jobId'));
        data = { jobId: args.jobId, deleted: true };
      } else if (args.olderThanDays != null) {
        data = await xmCleanupJobs(Number(args.olderThanDays));
      } else {
        throw new Error('jobId 与 olderThanDays 必须二选一');
      }
      break;
    }
    case 'es_xmigrate_probe_capabilities':
      /* 集群能力探测走 REST probe-capabilities 端点（浏览器桥内按 connection 选择
         宿主通道或本机档案直连源集群），返回版本/发行版/厂商/插件/节点规模 */
      data = await jsonFetch('/internal/es/xmigrate/probe-capabilities', {
        method: 'POST',
        body: JSON.stringify({
          connection: required(args, 'connection'),
          ...(args.index != null ? { index: String(args.index) } : {}),
        }),
      });
      break;
    case 'es_xmigrate_sync_structure': {
      /* 源连接按本机档案解析（与 start/connect_check 同口径），结构同步主体走 REST
         sync-structure 端点（浏览器桥内为源直连 + 目标宿主连接的双层剔除循环；
         dryRun=true 时 REST 侧不 PUT，MCP 写门/MRTR 也已在入口放行） */
      const syncReq: Record<string, any> = { conn: xmigrateBrowserConn(required(args, 'srcConnId')) };
      for (const key of ['sourceIndex', 'destIndex', 'destConnId', 'downgradedAnalyzerFallback', 'dryRun', 'syncAliases', 'expectPlanDigest']) {
        if (args[key] !== undefined) syncReq[key] = args[key];
      }
      data = await jsonFetch('/internal/es/xmigrate/sync-structure', {
        method: 'POST', body: JSON.stringify(syncReq),
      });
      break;
    }
    case 'es_xmigrate_smart_sync': {
      /* 智能同步一步式：源连接按本机档案解析（与 sync_structure 同口径），REST
       * smart-sync 端点内完成探目标 → 兼容矩阵整形（含 version-floor/store-type-vendor）
       * → apply 时的双层剔除落盘；apply !== true 的预览在 MCP 写门/MRTR 入口已放行 */
      const smartReq: Record<string, any> = {
        conn: xmigrateBrowserConn(required(args, 'srcConnId')),
        destConnId: required(args, 'destConnId'),
      };
      /* srcConnId 一并透传：报告的 source.connection 回显档案 id；savePlan=true 时计划记录
       * 也按它保存（计划里只有档案 id，不保存凭据） */
      for (const key of ['srcConnId', 'sourceIndex', 'destIndex', 'syncAliases', 'downgradedAnalyzerFallback', 'autoTune', 'apply', 'expectPlanDigest', 'mode', 'savePlan']) {
        if (args[key] !== undefined) smartReq[key] = args[key];
      }
      data = await jsonFetch('/internal/es/xmigrate/smart-sync', {
        method: 'POST', body: JSON.stringify(smartReq),
      });
      break;
    }
    case 'es_xmigrate_plan_list': {
      /* 已存同步计划列表（只读）：REST /plans（浏览器桥读本机计划台账 xm-plans-v1）；
       * 身份低于 REBUILD_OP 时每行删去 srcConnId */
      const redact = await planViewRedacts();
      data = await jsonFetch('/internal/es/xmigrate/plans');
      if (redact) for (const row of data?.plans ?? []) delete row.srcConnId;
      break;
    }
    case 'es_xmigrate_plan_apply':
      /* 按已存计划执行（写 + MRTR 二次确认）：REST /plans/apply，漂移校验与 smart_sync apply 相同 */
      data = await jsonFetch('/internal/es/xmigrate/plans/apply', {
        method: 'POST',
        body: JSON.stringify({
          planId: required(args, 'planId'),
          ...(args.expectPlanDigest != null ? { expectPlanDigest: args.expectPlanDigest } : {}),
        }),
      });
      break;
    case 'es_xmigrate_compare_capabilities':
      /* 集群能力对比（只读）：REST compare-capabilities（浏览器桥内源直连 + 目标宿主
         各探测一次后本地产风险矩阵），destConnId 可选——未传时桥层 auto-fill 当前激活档案 */
      data = await jsonFetch('/internal/es/xmigrate/compare-capabilities', {
        method: 'POST',
        body: JSON.stringify({
          srcConnId: required(args, 'srcConnId'),
          ...(args.destConnId != null ? { destConnId: String(args.destConnId) } : {}),
          ...(args.sourceIndex != null ? { sourceIndex: String(args.sourceIndex) } : {}),
          ...(args.destIndex != null ? { destIndex: String(args.destIndex) } : {}),
        }),
      });
      break;
    case 'es_xmigrate_diff_structure':
      /* 结构 diff（只读）：REST diff-structure（目标侧为宿主连接，目标不存在如实报错）；
         destConnId 可选 auto-fill、destIndex 缺省回退 sourceIndex（与 sync_structure 同形）；
         autoTunedShards/removedKeys 为上次同步报告的豁免回传（计划内变更不算 unexpected） */
      data = await jsonFetch('/internal/es/xmigrate/diff-structure', {
        method: 'POST',
        body: JSON.stringify({
          srcConnId: required(args, 'srcConnId'),
          sourceIndex: required(args, 'sourceIndex'),
          ...(args.destConnId != null ? { destConnId: String(args.destConnId) } : {}),
          ...(args.destIndex != null ? { destIndex: String(args.destIndex) } : {}),
          ...(args.autoTunedShards != null ? { autoTunedShards: args.autoTunedShards } : {}),
          ...(args.removedKeys !== undefined ? { removedKeys: args.removedKeys } : {}),
        }),
      });
      break;
    case 'es_xmigrate_verify_equivalence': {
      /* 数据等价校验（只读）：REST verify-equivalence（浏览器桥内源直连 + 目标宿主的
         双侧 count/_doc 序样本摘要/可选聚合对比，verdict 三态）；jobId 形态由桥内从
         本机作业台账补 srcConnId/sourceIndex/destIndex，srcConnId 形态需显式 sourceIndex */
      const verifyReq: Record<string, any> = args.jobId != null
        ? { jobId: String(args.jobId) }
        : { srcConnId: required(args, 'srcConnId'), sourceIndex: required(args, 'sourceIndex') };
      for (const key of ['sourceIndex', 'destConnId', 'destIndex', 'sampleSize', 'sampleFields', 'aggField', 'aggSize', 'structureOnly']) {
        if (args[key] !== undefined) verifyReq[key] = args[key];
      }
      data = await jsonFetch('/internal/es/xmigrate/verify-equivalence', {
        method: 'POST', body: JSON.stringify(verifyReq),
      });
      break;
    }
    case 'es_xmigrate_throttle':
      /* 运行中作业调速（写）：REST throttle（浏览器桥内为本页 scroll+bulk 循环的批粒度限速） */
      data = await jsonFetch('/internal/es/xmigrate/throttle', {
        method: 'POST',
        body: JSON.stringify({ jobId: required(args, 'jobId'), rps: args.rps }),
      });
      break;
    case 'es_connection_probe':
      data = await jsonFetch('/internal/es/index/clusters/'
        + encodeURIComponent(required(args, 'connection')) + '/probe', { method: 'POST' });
      break;
    case 'es_monitor_metrics': {
      const metricsQs = new URLSearchParams();
      const metricsConn = String(args.connection || '').trim();
      if (metricsConn && metricsConn !== 'host') metricsQs.set('connId', metricsConn);
      if (args.scope != null) metricsQs.set('scope', String(args.scope));
      if (args.interval != null) metricsQs.set('interval', String(args.interval));
      if (args.fromMs != null) metricsQs.set('fromMs', String(args.fromMs));
      if (args.toMs != null) metricsQs.set('toMs', String(args.toMs));
      if (args.size != null) metricsQs.set('size', String(args.size));
      data = await jsonFetch('/internal/es/index/monitor-metrics?' + metricsQs.toString());
      break;
    }
    case 'es_monitor_history': {
      const historyQs = new URLSearchParams();
      const historyConn = String(args.connection || '').trim();
      if (historyConn && historyConn !== 'host') historyQs.set('connId', historyConn);
      if (args.status != null) historyQs.set('status', String(args.status));
      if (args.fromMs != null) historyQs.set('fromMs', String(args.fromMs));
      if (args.toMs != null) historyQs.set('toMs', String(args.toMs));
      if (args.size != null) historyQs.set('size', String(args.size));
      data = await jsonFetch('/internal/es/index/monitor-history?' + historyQs.toString());
      break;
    }
    case 'es_config_validate':
      data = await jsonFetch('/internal/es/index/config-lab/validate', {
        method: 'POST',
        body: JSON.stringify({
          settings: args.settings == null ? null : String(args.settings),
          mapping: args.mapping == null ? null : String(args.mapping),
          dryRun: args.dryRun === true,
        }),
      });
      break;
    case 'es_config_drift':
      data = await jsonFetch('/internal/es/index/config-lab/drift?indexKey='
        + encodeURIComponent(required(args, 'indexKey')));
      break;
    case 'es_ops_audit': {
      /* 与 REST /auth/ops-audit 同参：按人/动作/URI 前缀/关键词/时间窗过滤，
         浏览器模式走本地审计留档（browserApi queryLocalAudit 同口径）。 */
      const auditQs = new URLSearchParams();
      if (args.username != null) auditQs.set('username', String(args.username));
      if (args.action != null) auditQs.set('action', String(args.action));
      if (args.uriPrefix != null) auditQs.set('uriPrefix', String(args.uriPrefix));
      if (args.kw != null) auditQs.set('kw', String(args.kw));
      if (args.fromMs != null) auditQs.set('fromMs', String(args.fromMs));
      if (args.toMs != null) auditQs.set('toMs', String(args.toMs));
      if (args.size != null) auditQs.set('size', String(args.size));
      if (args.from != null) auditQs.set('from', String(args.from));
      data = await jsonFetch('/internal/es/index/auth/ops-audit?' + auditQs.toString());
      break;
    }
    case 'es_insight_settings_impact':
      data = await jsonFetch('/internal/es/index/insight/settings-impact', {
        method: 'POST',
        body: JSON.stringify({
          index: required(args, 'index'),
          changes: args.changes && typeof args.changes === 'object' && !Array.isArray(args.changes)
            ? args.changes : {},
        }),
      });
      break;
    case 'es_ring_usage':
      data = await jsonFetch('/internal/es/index/ring-usage');
      break;
    default:
      throw new Error('Unknown tool: ' + name);
  }
  return data;
}

/** 页面内单轨入口（window.ESQueryStudioMCP.callTool 与面板试跑共用）：先过 17 组归一，再进实现层。 */
export async function mcpCallTool(name: string, args: Record<string, any> = {}): Promise<any> {
  const normalized = normalizeBrowserGroupCall(name, args);
  return dispatchBrowserTool(normalized.name, normalized.args);
}

function browserDeclaresTasks(request: any): boolean {
  const meta = request?._meta || request?.params?._meta || {};
  const caps = meta['io.modelcontextprotocol/clientCapabilities'] || {};
  return !!(caps.extensions && caps.extensions[MCP_TASKS_EXTENSION]);
}

function browserDeclaresElicitation(request: any): boolean {
  const meta = request?._meta || request?.params?._meta || {};
  const caps = meta['io.modelcontextprotocol/clientCapabilities'] || {};
  return !!caps.elicitation;
}

function canonicalMrtrArgs(value: any): string {
  const sort = (input: any): any => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === 'object') {
      const out: Record<string, any> = {};
      for (const key of Object.keys(input).sort()) out[key] = sort(input[key]);
      return out;
    }
    return input;
  };
  return JSON.stringify(sort(value || {}));
}

function browserMrtrNeedsConfirmation(toolName: string, args: Record<string, any>): boolean {
  if (!MCP_MRTR_CONFIRM_TOOLS.has(toolName)) return false;
  if (toolName === 'es_rest') {
    const method = String(args?.method || 'GET').trim().toUpperCase();
    return method !== 'GET' && method !== 'HEAD';
  }
  /* sync_structure 的 dryRun=true 与 smart_sync 的 apply=false 只读预览，
   * 不进 MRTR 二次确认（dryRun=false / apply=true 维持确认门） */
  if (toolName === 'es_xmigrate_sync_structure' && args?.dryRun === true) return false;
  if (toolName === 'es_xmigrate_smart_sync' && args?.apply !== true) return false;
  return true;
}

function browserMrtrInputRequired(toolName: string, args: Record<string, any>): Record<string, any> {
  const now = Date.now();
  for (const [key, entry] of BROWSER_MRTR_STATES) {
    if (entry.expires < now) BROWSER_MRTR_STATES.delete(key);
  }
  const state = globalThis.crypto?.randomUUID?.() || `mrtr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  BROWSER_MRTR_STATES.set(state, {
    tool: toolName,
    args: canonicalMrtrArgs(args),
    expires: now + MCP_MRTR_TTL_MS,
  });
  return {
    resultType: 'input_required',
    inputRequests: {
      confirm: {
        method: 'elicitation/create',
        params: {
          message: `工具 ${toolName} 是高危写操作，是否继续？`,
          requestedSchema: {
            type: 'object',
            properties: {
              confirm: {
                type: 'boolean',
                title: '确认执行',
                description: '该操作可能删除或覆盖数据，确认后才会执行。',
                default: false,
              },
            },
            required: ['confirm'],
          },
        },
      },
    },
    requestState: state,
  };
}

function browserMrtrVerify(state: string, toolName: string, args: Record<string, any>): boolean {
  const entry = BROWSER_MRTR_STATES.get(state);
  if (!entry || entry.expires < Date.now() || entry.tool !== toolName || entry.args !== canonicalMrtrArgs(args)) {
    return false;
  }
  BROWSER_MRTR_STATES.delete(state);
  return true;
}

function browserMrtrConfirmed(responses: any): boolean {
  const confirm = responses?.confirm || {};
  return String(confirm.action || '').toLowerCase() === 'accept' && confirm.content?.confirm === true;
}

/** 浏览器桥没有服务端 key 概念：同一页面的调用方共享一个台账归属。 */
const BROWSER_TASK_OWNER = 'browser';

function isAbortError(e: any): boolean {
  return String(e?.name || '') === 'AbortError' || /aborted|abort/i.test(String(e?.message || ''));
}

function browserCancelledEnvelope(id: any, tool: string, reason: string): Record<string, any> {
  return {
    jsonrpc: '2.0', id,
    result: {
      content: [{ type: 'text', text: `已取消：未完成 ${tool}${reason === 'DEADLINE' ? '（超过单次调用 3 分钟预算，已自动掐断）' : '（客户端取消）'}` }],
      structuredContent: { cancelled: true, tool, cancelReason: reason },
      isError: false,
    },
  };
}

function browserMrtrCancelled(toolName: string): Record<string, any> {
  return {
    content: [{ type: 'text', text: `已取消：未执行 ${toolName}` }],
    structuredContent: { cancelled: true, tool: toolName },
    isError: false,
  };
}

/** tools/call 失败的结构化错误码（与 Java toolErrorCode 同判定口径）：桥层显式 code
 *  优先（浏览器 xmigrate 实现已按通道打 PLAN_DRIFT/DEST_NOT_FOUND/DEST_EXISTS/
 *  BAD_REQUEST）；REST 层丢失 code 的按消息模板恢复（服务层消息为固定文案，前缀/
 *  包含规则与 Java 逐字同构）；其余兜底 INTERNAL。 */
const MCP_TOOL_ERROR_CODES = ['BAD_REQUEST', 'CONN_FORBIDDEN', 'PLAN_DRIFT', 'PLAN_NOT_FOUND',
  'DEST_NOT_FOUND', 'DEST_EXISTS', 'REMOTE_CONNECT_FAILED', 'JOB_STATE', 'DEST_INDEX', 'RULE_REJECTED'];
function browserToolErrorCode(e: any): string {
  const explicit = String(e?.code || '').trim();
  if (explicit === 'INTERNAL' || MCP_TOOL_ERROR_CODES.includes(explicit)) return explicit;
  const msg = String(e?.message || e);
  if (msg.startsWith('计划摘要不匹配，拒绝执行')) return 'PLAN_DRIFT';
  if (msg.startsWith('同步计划不存在: ')) return 'PLAN_NOT_FOUND';
  if (msg.startsWith('目标索引不存在或不可读')) return 'DEST_NOT_FOUND';
  if (msg.startsWith('目标索引已存在')) return 'DEST_EXISTS';
  if (msg.includes('连接旧集群失败')) return 'REMOTE_CONNECT_FAILED';
  if (msg.includes('仍在运行') || msg.includes('已完成')) return 'JOB_STATE';
  if (msg.includes('目标索引') || msg.includes('源索引不存在')) return 'DEST_INDEX';
  /* 参数守卫形态（与 Java requiredString/optionalXxx 抛 IllegalArgumentException 的
     BAD_REQUEST 分流规则相同，消息为三端同源模板）；savePlan 与计划摘要两条是同步计划的
     参数守卫（服务端同样按 BAD_REQUEST 返回），REST 层不带 code，按文案前缀恢复 */
  if (msg.startsWith('Missing required argument') || msg.includes('必须二选一')
    || msg.startsWith('mode 必须为') || msg.includes('only valid with')
    || msg.includes('仅预览形态可用') || msg.startsWith('同步计划缺少计划摘要')
    || /需为(正整数|布尔值|字符串数组)/.test(msg) || /不能为空/.test(msg)) {
    return 'BAD_REQUEST';
  }
  return 'INTERNAL';
}

function browserCreateTask(data: any): Record<string, any> {
  const taskId = globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const task = {
    taskId, status: 'completed', createdAt: now, lastUpdatedAt: now,
    ttlMs: MCP_TASK_TTL_MS, pollIntervalMs: MCP_TASK_POLL_INTERVAL_MS,
    result: {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data },
      isError: false,
    },
  };
  BROWSER_TASKS.set(taskId, task);
  persistBrowserTasks();
  return { ...task, result: undefined, resultType: 'task' };
}

async function handleMcpRequestRaw(request: any): Promise<any> {
  if (!request || request.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  const id = request.id;
  const method = String(request.method || '');
  if (method === 'notifications/initialized') return null;
  if (method === 'initialize') {
    const requested = String(request.params?.protocolVersion || '');
    return {
      jsonrpc: '2.0', id, result: {
        protocolVersion: !requested ? MCP_PROTOCOL_VERSION
          : (MCP_SUPPORTED_VERSIONS.includes(requested) ? requested : MCP_LEGACY_COMPAT_VERSION),
        supportedVersions: MCP_SUPPORTED_VERSIONS,
        capabilities: MCP_CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: MCP_INSTRUCTIONS,
        recommendedTools: Object.keys(MCP_GROUP_ACTIONS),
        maxRecommendedTools: Object.keys(MCP_GROUP_ACTIONS).length,
      },
    };
  }
  if (method === 'server/discover') {
    return { jsonrpc: '2.0', id, result: { supportedVersions: MCP_SUPPORTED_VERSIONS, capabilities: MCP_CAPABILITIES, serverInfo: SERVER_INFO, instructions: MCP_INSTRUCTIONS, recommendedTools: Object.keys(MCP_GROUP_ACTIONS), maxRecommendedTools: Object.keys(MCP_GROUP_ACTIONS).length, recentCalls: BROWSER_RECENT_CALLS.slice(0, 100), auditCalls: BROWSER_RECENT_CALLS.slice(), auditRetentionDays: BROWSER_AUDIT_RETENTION_DAYS, auditSource: 'localStorage', ...MCP_CACHE } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: browserGroupTools(), ...MCP_CACHE } };
  }
  if (method === 'resources/list') {
    return { jsonrpc: '2.0', id, result: { resources: mcpResources(), ...MCP_CACHE } };
  }
  if (method === 'resources/templates/list') {
    return { jsonrpc: '2.0', id, result: { resourceTemplates: MCP_RESOURCE_TEMPLATES, ...MCP_CACHE } };
  }
  if (method === 'resources/read') {
    const params = request.params || {};
    try {
      const payload = await withResourceBudget(String(id ?? ''), () => readMcpResource(String(params.uri || '')));
      return { jsonrpc: '2.0', id, result: { ...payload, ...MCP_CACHE } };
    } catch (e: any) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: String(e?.message || e) } };
    }
  }
  if (method === 'prompts/list') {
    return { jsonrpc: '2.0', id, result: { prompts: MCP_PROMPTS, ...MCP_CACHE } };
  }
  if (method === 'prompts/get') {
    const params = request.params || {};
    try {
      return { jsonrpc: '2.0', id, result: getMcpPrompt(String(params.name || ''), params.arguments || {}) };
    } catch (e: any) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: String(e?.message || e) } };
    }
  }
  if (method === 'completion/complete') {
    try {
    const params = request.params || {};
    const argument = params.argument || {};
    const name = String(argument.name || '');
    const prefix = String(argument.value || '').trim().toLowerCase();
    let values: string[] = [];
    if (name === 'connection' || name === 'srcConnId' || name === 'destConnId') {
      /* xmigrate 形态的连接参数复用同一数据源：本机连接档案目录 */
      values = profiles().map(profile => profile.id);
    } else if (name === 'index' || name === 'source' || name === 'target' || name === 'sourceIndex' || name === 'destIndex') {
      try {
        const rows = await withResourceBudget(String(id ?? ''), () => dispatchBrowserTool('es_list_indices'));
        values = (Array.isArray(rows) ? rows : []).map((row: any) => String(row?.index || '')).filter(Boolean);
      } catch (e: any) {
        /* 预算到点 / 客户端取消必须如实报错；只有连接不可达才返回空补全。 */
        if (String(e?.message || e).startsWith('MCP_CALL_')) throw e;
      }
    } else if (name === 'jobId') {
      /* 迁移作业 id 清单：读本机台账前 20 条（与 es_xmigrate:jobs 同可见口径） */
      try {
        const rows = await dispatchBrowserTool('es_xmigrate_jobs', { limit: 20 });
        values = (Array.isArray(rows) ? rows : []).map((row: any) => String(row?.jobId || '')).filter(Boolean);
      } catch { /* 台账不可用时返回空补全 */ }
    }
    values = values.filter(value => !prefix || value.toLowerCase().startsWith(prefix)).slice(0, 50);
    return { jsonrpc: '2.0', id, result: { completion: { values, total: values.length, hasMore: false } } };
    } catch (e: any) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: String(e?.message || e) } };
    }
  }
  if (method === 'tasks/get') {
    const taskId = String(request.params?.taskId || '').trim();
    const task = BROWSER_TASKS.get(taskId);
    if (!task || task.owner !== BROWSER_TASK_OWNER) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown task: ' + taskId } };
    }
    return { jsonrpc: '2.0', id, result: browserTaskView(task) };
  }
  if (method === 'tasks/list') {
    const params = request.params || {};
    const activeOnly = params.activeOnly === true;
    const limit = Number.isFinite(Number(params.limit)) ? Math.min(Number(params.limit), 200) : 20;
    const rows = [...BROWSER_TASKS.values()]
      .filter(t => t.owner === BROWSER_TASK_OWNER && (!activeOnly || t.status === 'working'))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map(t => {
        const view = browserTaskView(t);
        delete view.result;
        view.elapsedMs = Math.max(0, Date.now() - Date.parse(String(t.createdAt)));
        view.remainingMs = Math.max(0, Date.parse(String(t.deadlineAt)) - Date.now());
        return view;
      });
    return { jsonrpc: '2.0', id, result: { tasks: rows, count: rows.length, callTimeoutMs: MCP_TASK_TIMEOUT_MS } };
  }
  if (method === 'tasks/cancel') {
    const taskId = String(request.params?.taskId || '').trim();
    if (!taskId) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'taskId 不能为空' } };
    const view = browserCancelTask(taskId, BROWSER_TASK_OWNER, 'CLIENT');
    if (!view) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown task: ' + taskId } };
    return { jsonrpc: '2.0', id, result: view };
  }
  if (method === 'tasks/update') {
    return { jsonrpc: '2.0', id, result: { resultType: 'complete' } };
  }
  if (method === 'notifications/cancelled') {
    const requestId = String(request.params?.requestId || '').trim();
    if (requestId) {
      RESOURCE_CANCELS.get(requestId)?.('CLIENT');
      for (const task of BROWSER_TASKS.values()) {
        if (task.requestId === requestId && task.status === 'working') {
          browserCancelTask(task.taskId, BROWSER_TASK_OWNER, 'CLIENT');
        }
      }
    }
    return null; /* 通知没有响应体。 */
  }
  if (method === 'tools/call') {
    const params = request.params || {};
    try {
      const toolName = String(params.name || '');
      const rawArgs: Record<string, any> = { ...(params.arguments || {}) };
      const normalized = normalizeBrowserGroupCall(toolName, rawArgs);
      let callName = normalized.name;
      let callArgs = normalized.args;
      if (browserDeclaresElicitation(request) && browserMrtrNeedsConfirmation(callName, callArgs)) {
        const responses = params.inputResponses ?? rawArgs.inputResponses;
        const state = params.requestState ?? rawArgs.requestState;
        /* 验签前先从参数里去掉这两个回传键：确认状态绑定的是业务参数的摘要，客户端把
         * inputResponses / requestState 放在 arguments 里重发时，带着它们的摘要永远对不上
         * （服务端与本地 Node 桥都是先去掉再验签）。 */
        delete callArgs.inputResponses;
        delete callArgs.requestState;
        if (responses == null) {
          return { jsonrpc: '2.0', id, result: browserMrtrInputRequired(callName, callArgs) };
        }
        if (!browserMrtrVerify(String(state || ''), callName, callArgs)) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid or expired confirmation state' } };
        }
        if (!browserMrtrConfirmed(responses)) {
          return { jsonrpc: '2.0', id, result: browserMrtrCancelled(callName) };
        }
      }
      if (browserDeclaresTasks(request) && MCP_TASK_TOOLS.has(callName)) {
        /* 长 action 立刻回 working：不占住调用方，客户端可按 taskId 续传/取消。 */
        const requestId = String(request?.params?._meta?.['io.modelcontextprotocol/requestId'] || '');
        const task = browserSubmitTask(callName, BROWSER_TASK_OWNER, requestId,
          () => dispatchBrowserTool(callName, callArgs));
        return { jsonrpc: '2.0', id, result: task };
      }
      /* 未声明 Tasks 的调用同样要可取消：注册内部在途台账（不对外暴露 taskId），
         这样 notifications/cancelled 才能按 requestId 找到并 abort 它。 */
      const syncRequestId = String(request?.params?._meta?.['io.modelcontextprotocol/requestId'] || '');
      const syncTask = browserSubmitTask(callName, BROWSER_TASK_OWNER, syncRequestId,
        () => dispatchBrowserTool(callName, callArgs), false);
      const data = await browserWaitTask(syncTask.taskId);
      if (data && data.__cancelled) {
        return browserCancelledEnvelope(id, callName, String(data.__cancelReason || 'CLIENT'));
      }
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          structuredContent: data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data },
          isError: false,
        },
      };
    } catch (e: any) {
      if (isAbortError(e)) {
        return browserCancelledEnvelope(id, String(params.name || ''), 'CLIENT');
      }
      /* 工具失败结果附 structuredContent {code,message}（与 Java toolError 同构），
         客户端可按 code 精确分支而不解析中文文本 */
      const text = String(e?.message || e);
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text }],
          structuredContent: { code: browserToolErrorCode(e), message: text },
          isError: true,
        },
      };
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
}

/** 资源读取与补全也会打 ES：与 tools/call 共用 180s 死线；到点或客户端取消时
 *  撤掉本页在途 ES 请求（浏览器桥没有进程内工作线程，abort fetch 是唯一的真中断）。 */
const RESOURCE_CANCELS = new Map<string, (reason: 'DEADLINE' | 'CLIENT') => void>();
async function withResourceBudget<T>(requestId: string, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let reason = '';
  const abort = (why: 'DEADLINE' | 'CLIENT') => {
    reason = why;
    abortAllEsRequests();
  };
  if (requestId) RESOURCE_CANCELS.set(requestId, abort);
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          abort('DEADLINE');
          reject(new Error('MCP_CALL_TIMEOUT: 超过 ' + MCP_TASK_TIMEOUT_MS + 'ms 预算，已断开本页 ES 请求'));
        }, MCP_TASK_TIMEOUT_MS);
      }),
    ]);
  } catch (e: any) {
    if (reason === 'CLIENT') throw new Error('MCP_CALL_CANCELLED: 客户端已取消');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    if (requestId) RESOURCE_CANCELS.delete(requestId);
  }
}

export async function handleMcpRequest(request: any): Promise<any> {
  const started = Date.now();
  const response = await handleMcpRequestRaw(request);
  if (response?.result && typeof response.result === 'object' && response.result !== null && response.result.resultType === undefined) {
    response.result.resultType = 'complete';
  }
  recordBrowserCall(request, response, Date.now() - started);
  return response;
}

declare global {
  interface Window {
    ESQueryStudioMCP?: {
      protocolVersion: string;
      tools: McpToolDefinition[];
      recentCalls: Array<Record<string, any>>;
      handle: (request: any) => Promise<any>;
      callTool: (name: string, args?: Record<string, any>) => Promise<any>;
    };
  }
}

export function installBrowserMcp(): void {
  if (typeof window === 'undefined') return;
  window.ESQueryStudioMCP = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    tools: browserGroupTools(),
    recentCalls: BROWSER_RECENT_CALLS,
    handle: handleMcpRequest,
    callTool: mcpCallTool,
  };
}
