/**
 * Browser-mode MCP bridge.
 *
 * A browser tab cannot listen on TCP, so pure front-end mode exposes a real MCP
 * JSON-RPC handler to in-page agents through `window.ESQueryStudioMCP`. External
 * MCP clients that require a process transport should use server mode (`/mcp`)
 * or the optional local bridge described in docs/mcp.md. The tool contracts are
 * intentionally the same as the server implementation.
 */
import { browserFetch } from './browserApi';
import { activeProfile, profiles } from './browserProfiles';

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
const SERVER_INFO = { name: 'ESQueryStudio', version: '1.0.64', mode: 'browser' as const };
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
  + '<div class="grid"><div class="cell"><b>15 groups</b><span>130 legacy actions</span></div>'
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
const BROWSER_TASKS = new Map<string, Record<string, any>>();
/** MRTR：高危写操作在声明 elicitation 的 2026 客户端上二次确认。 */
const MCP_MRTR_CONFIRM_TOOLS = new Set(['es_delete_by_query', 'es_delete_index', 'es_delete_doc', 'es_delete_data_stream', 'es_rest']);
const MCP_MRTR_TTL_MS = 300_000;
const BROWSER_MRTR_STATES = new Map<string, { tool: string; args: string; expires: number }>();
const MCP_INSTRUCTIONS = 'ESQueryStudio exposes Elasticsearch tools with per-connection permissions. '
  + 'Call es_connections with action=list first, then pass connection on every call. '
  + 'Read tools require read; writes require write and an explicitly write-enabled key or local switch. '
  + 'The client-facing surface is 15 action-typed tools; call with action plus legacy arguments. recommendedTools lists the groups to load first (maxRecommendedTools=15). '
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
function recordBrowserCall(request: any, response: any, elapsedMs: number): void {
  if (!request || request.method === 'notifications/initialized') return;
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
];

/** 可能删除/覆盖数据或中断集群状态的工具；与服务端 DESTRUCTIVE_TOOLS 同口径。 */
export const MCP_DESTRUCTIVE_TOOLS = [
  'es_delete_index', 'es_delete_doc', 'es_delete_by_query', 'es_delete_snapshot',
  'es_restore_snapshot', 'es_delete_template', 'es_delete_data_stream', 'es_delete_transform', 'es_delete_ingest_pipeline', 'es_delete_snapshot_repo', 'es_delete_slm_policy', 'es_delete_watch', 'es_delete_ilm_policy', 'es_delete_script',
  'es_bulk', 'es_rest',
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
  { id: 'connections', label: '连接与发现', tools: ['es_list_connections'] },
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
      'es_get_cluster_settings', 'es_update_cluster_settings', 'es_reroute',
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
    description: '全部工具；仅建议脚本或一次性运维使用，客户端可能加载超时。',
    tools: MCP_TOOLS.map(tool => tool.name),
  },
];

export const MCP_GROUP_ACTIONS: Record<string, Record<string, string>> = {
  'es_connections': {
    'list': 'es_list_connections',
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
};
export const MCP_GROUP_DESCRIPTIONS: Record<string, string> = {
  'es_connections': 'List or inspect MCP connections.',
  'es_search': 'Search, count, multi-search, explain, scroll, PIT and search-time helpers.',
  'es_sql': 'Run ES-SQL, cursors and SQL-to-DSL translation.',
  'es_documents': 'Read and mutate documents, bulk operations and term vectors.',
  'es_indices': 'Index catalog, settings, mappings, aliases and index lifecycle.',
  'es_data_streams': 'Data stream catalog and lifecycle.',
  'es_templates': 'Index templates and component templates.',
  'es_analysis': 'Analyze text, analysis settings, reload analyzers and synonyms.',
  'es_cluster': 'Cluster health, nodes, shard diagnostics, settings, reroute and tasks.',
  'es_batch': 'Batch update, delete, reindex and reindex preview.',
  'es_transforms': 'Transform lifecycle.',
  'es_snapshots': 'Snapshot repositories and snapshots.',
  'es_lifecycle': 'ILM and SLM lifecycle policies.',
  'es_automation': 'Watcher, ingest pipelines and stored scripts.',
  'es_rest': 'Raw Elasticsearch REST passthrough; write methods need write permission.',
};

function browserGroupTools(): any[] {
  const out: any[] = [];
  for (const [name, actions] of Object.entries(MCP_GROUP_ACTIONS)) {
    const allowed = Object.keys(actions).filter(action => {
      const legacy = actions[action];
      return isBrowserMcpWriteAllowed() || !MCP_WRITE_TOOLS.includes(legacy);
    });
    if (!allowed.length) continue;
    const properties: Record<string, any> = {
      action: { type: 'string', enum: allowed, description: 'Action to execute. One of: ' + allowed.join(', ') },
      connection: { type: 'string', description: 'Connection id; optional in browser mode.' },
    };
    for (const field of ['index', 'id', 'name', 'target', 'alias', 'query', 'body', 'document', 'settings',
      'fields', 'method', 'path', 'taskId', 'repo', 'snapshot', 'policy', 'source', 'dest', 'text', 'analyzer',
      'field', 'value', 'params', 'actions', 'script', 'ids', 'documents', 'indexes', 'requests', 'slices',
      'maxDocs', 'refresh', 'pipeline', 'routing', 'size', 'from', 'scroll', 'waitForCompletion']) {
      properties[field] = { type: 'string', description: field + ' (action-specific)' };
    }
    out.push({
      name,
      description: MCP_GROUP_DESCRIPTIONS[name] + ' Actions: ' + allowed.join(', ')
        + '. Pass action plus the same arguments as the corresponding legacy tool.',
      inputSchema: { type: 'object', properties, required: ['action'] },
      annotations: {
        readOnlyHint: allowed.every(action => !MCP_WRITE_TOOLS.includes(actions[action]) && actions[action] !== 'es_rest'),
        destructiveHint: allowed.some(action => MCP_WRITE_TOOLS.includes(actions[action]) || actions[action] === 'es_rest'),
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: MCP_APP_URI } },
    });
  }
  return out;
}

function normalizeBrowserGroupCall(name: string, args: Record<string, any>): { name: string; args: Record<string, any> } {
  const actions = MCP_GROUP_ACTIONS[name];
  if (!actions) return { name, args };
  if (args?.action == null && MCP_TOOLS.some(tool => tool.name === name)) return { name, args };
  const action = String(args?.action || '').trim();
  const legacy = actions[action];
  if (!legacy) throw new Error('Unknown action ' + action + ' for ' + name + '; expected one of ' + Object.keys(actions).join(', '));
  const rest = { ...args };
  delete rest.action;
  return { name: legacy, args: rest };
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
];

/** 浏览器模式的连接就是本机档案；只把当前激活档案作为可读资源，避免偷换数据面。 */
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
    data = await mcpCallTool('es_list_connections');
  } else if (parts.length === 2 && parts[0] === 'connection') {
    requireActiveProfile(parts[1]);
    data = {
      connection: parts[1],
      health: await mcpCallTool('es_cluster_health'),
      stats: await mcpCallTool('es_cluster_stats'),
    };
  } else if (parts.length === 2 && parts[0] === 'cluster') {
    requireActiveProfile(parts[1]);
    data = {
      connection: parts[1],
      health: await mcpCallTool('es_cluster_health'),
      stats: await mcpCallTool('es_cluster_stats'),
      nodes: await mcpCallTool('es_list_nodes'),
    };
  } else if (parts.length === 2 && parts[0] === 'indices') {
    requireActiveProfile(parts[1]);
    data = await mcpCallTool('es_list_indices');
  } else if (parts.length === 2 && parts[0] === 'aliases') {
    requireActiveProfile(parts[1]);
    data = await mcpCallTool('es_get_aliases');
  } else if (parts.length === 2 && parts[0] === 'data_streams') {
    requireActiveProfile(parts[1]);
    data = await mcpCallTool('es_list_data_streams');
  } else if (parts.length === 2 && parts[0] === 'component_templates') {
    requireActiveProfile(parts[1]);
    data = await mcpCallTool('es_list_component_templates');
  } else if (parts.length >= 3 && parts[0] === 'index') {
    requireActiveProfile(parts[1]);
    const index = parts[2];
    if (parts.length === 4 && parts[3] === 'mapping') {
      data = await mcpCallTool('es_get_mapping', { index });
    } else if (parts.length === 3) {
      data = {
        connection: parts[1],
        index,
        mapping: await mcpCallTool('es_get_mapping', { index }),
        settings: await mcpCallTool('es_get_settings', { index }),
        aliases: await mcpCallTool('es_get_aliases'),
        stats: await mcpCallTool('es_get_index_stats', { index }),
      };
    } else {
      throw new Error('Unsupported resource URI: ' + uri);
    }
  } else {
    throw new Error('Unsupported resource URI: ' + uri);
  }
  return {
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }],
  };
}

function requireActiveProfile(connection: string): void {
  const active = activeProfile();
  if (!active) throw new Error('No browser connection profile is active; create one first.');
  if (active.id !== connection) {
    throw new Error('Browser mode reads the active connection only; switch to ' + connection + ' in the top bar first.');
  }
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
      + '3. Execute with `es_reindex` (or `es_rest` for cross-cluster), then poll `es_task_detail`.\n'
      + '4. Verify document counts with `es_count`, sampled content with `es_search`, and alias cutover with `es_alias`.\n'
      + '5. State the cutover order, validation gates and rollback. Do not delete the source until verification passes.\n\n'
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

export async function mcpCallTool(name: string, args: Record<string, any> = {}): Promise<any> {
  ({ name, args } = normalizeBrowserGroupCall(name, args));
  if (MCP_WRITE_TOOLS.includes(name) && !isBrowserMcpWriteAllowed()) {
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
    default:
      throw new Error('Unknown tool: ' + name);
  }
  return data;
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

function browserMrtrCancelled(toolName: string): Record<string, any> {
  return {
    content: [{ type: 'text', text: `已取消：未执行 ${toolName}` }],
    structuredContent: { cancelled: true, tool: toolName },
    isError: false,
  };
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
      const payload = await readMcpResource(String(params.uri || ''));
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
    const params = request.params || {};
    const argument = params.argument || {};
    const name = String(argument.name || '');
    const prefix = String(argument.value || '').trim().toLowerCase();
    let values: string[] = [];
    if (name === 'connection') {
      values = profiles().map(profile => profile.id);
    } else if (name === 'index' || name === 'source' || name === 'target') {
      try {
        const rows = await mcpCallTool('es_list_indices');
        values = (Array.isArray(rows) ? rows : []).map((row: any) => String(row?.index || '')).filter(Boolean);
      } catch { /* 当前连接不可达时返回空补全 */ }
    }
    values = values.filter(value => !prefix || value.toLowerCase().startsWith(prefix)).slice(0, 50);
    return { jsonrpc: '2.0', id, result: { completion: { values, total: values.length, hasMore: false } } };
  }
  if (method === 'tasks/get') {
    const taskId = String(request.params?.taskId || '').trim();
    const task = BROWSER_TASKS.get(taskId);
    if (!task) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown task: ' + taskId } };
    return { jsonrpc: '2.0', id, result: { ...task, resultType: 'complete' } };
  }
  if (method === 'tasks/update' || method === 'tasks/cancel') {
    return { jsonrpc: '2.0', id, result: { resultType: 'complete' } };
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
        if (responses == null) {
          return { jsonrpc: '2.0', id, result: browserMrtrInputRequired(callName, callArgs) };
        }
        if (!browserMrtrVerify(String(state || ''), callName, callArgs)) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid or expired confirmation state' } };
        }
        if (!browserMrtrConfirmed(responses)) {
          return { jsonrpc: '2.0', id, result: browserMrtrCancelled(callName) };
        }
        delete callArgs.inputResponses;
        delete callArgs.requestState;
      }
      const data = await mcpCallTool(callName, callArgs);
      if (browserDeclaresTasks(request) && MCP_TASK_TOOLS.has(callName)) {
        return { jsonrpc: '2.0', id, result: browserCreateTask(data) };
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
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: String(e?.message || e) }], isError: true },
      };
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
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
    tools: MCP_TOOLS,
    recentCalls: BROWSER_RECENT_CALLS,
    handle: handleMcpRequest,
    callTool: mcpCallTool,
  };
}
