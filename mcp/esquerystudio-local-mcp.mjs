#!/usr/bin/env node
/**
 * ESQueryStudio local MCP server (no Spring Boot, no browser tab).
 *
 * A dependency-free Node 18+ MCP stdio server that talks directly to one or more
 * Elasticsearch clusters. This is the "pure local" option for Claude Desktop,
 * Cursor and other local agents: it needs neither the browser extension nor the
 * Spring Boot console process.
 *
 * Config (ESQ_MCP_CONFIG or --config):
 * {
 *   "defaultConnection": "prod",
 *   "connections": [
 *     { "id": "prod", "name": "Production", "url": "http://localhost:9200",
 *       "username": "elastic", "password": "***" },
 *     { "id": "qa", "name": "QA", "url": "https://qa.example:9200",
 *       "apiKey": "base64-id:key" }
 *   ]
 * }
 *
 * Single-connection env fallback:
 *   ESQ_ES_URL=http://localhost:9200 ESQ_ES_USERNAME=elastic ESQ_ES_PASSWORD=***
 *
 * Write tools are disabled unless ESQ_MCP_ALLOW_WRITE=true (or --allow-write).
 * Credentials stay in this process; the MCP stdio channel carries only requests/responses.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';

const LATEST_PROTOCOL_VERSION = '2026-07-28';
const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const LEGACY_COMPAT_PROTOCOL_VERSION = '2025-06-18';
const CACHE_TTL_MS = 60000;
const CACHE_FIELDS = { ttlMs: CACHE_TTL_MS, cacheScope: 'private' };
const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
const TASK_TTL_MS = 3_600_000;
const TASK_POLL_INTERVAL_MS = 1_000;
const TASK_TOOLS = new Set(['es_reindex', 'es_bulk', 'es_update_by_query', 'es_delete_by_query', 'es_create_snapshot', 'es_restore_snapshot', 'es_force_merge', 'es_sql', 'es_rest']);
const TASKS = new Map();
const MRTR_CONFIRM_TOOLS = new Set(['es_delete_by_query', 'es_delete_index', 'es_delete_doc', 'es_delete_data_stream', 'es_rest',
  'es_adhoc_start', 'es_adhoc_abort', 'es_adhoc_confirm_switch',
  'es_adhoc_retry', 'es_adhoc_delete_jobs',
  'es_xmigrate_start', 'es_xmigrate_resume', 'es_xmigrate_abort', 'es_xmigrate_delete_jobs',
  'es_xmigrate_sync_structure']);
const MRTR_TTL_MS = 300_000;
const MRTR_STATES = new Map();
const APPS_EXTENSION = 'io.modelcontextprotocol/ui';
const MCP_APP_URI = 'ui://esquerystudio/tool-console';
const MCP_APP_MIME = 'text/html;profile=mcp-app';
const MCP_APP_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:dark}body{margin:0;background:#0d1718;color:#d9f6f1;font:13px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}
main{max-width:720px;padding:28px 26px}h1{margin:6px 0 8px;font-size:22px;letter-spacing:-.03em}
.eyebrow{color:#4cc9f0;font:10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.16em}
p{color:#8db7b1;max-width:620px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}
.cell{border:1px solid #1c3435;border-radius:6px;padding:10px;background:#102021}
.cell b{display:block;color:#d9f6f1}.cell span{color:#6f9994;font-size:11px}
code{color:#4cc9f0}@media(max-width:520px){.grid{grid-template-columns:1fr}}
</style></head><body><main><div class="eyebrow">ESQUERYSTUDIO / MCP APP</div>
<h1>Elasticsearch control surface</h1><p>This app renders the ESQueryStudio connection, index and diagnostic tools inside an MCP host.
Tool results remain available as text when the host does not support MCP Apps.</p>
<div class="grid"><div class="cell"><b>17 groups</b><span>167 actions</span></div>
<div class="cell"><b>Read / write</b><span>per connection permission</span></div>
<div class="cell"><b>Audited</b><span>IP · UA · requestId</span></div></div>
<p style="margin-top:20px">Use <code>es_connections action=list</code> to discover the scope of your key.</p></main></body></html>`;
function appUiMeta() {
  return {
    csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] },
    permissions: {},
    prefersBorder: true,
  };
}
const RECENT_CALLS = [];
const AUDIT_FILE = join(homedir(), '.esquerystudio', 'mcp-audit.jsonl');
function appendAuditFile(call) {
  try {
    mkdirSync(join(homedir(), '.esquerystudio'), { recursive: true });
    appendFileSync(AUDIT_FILE, JSON.stringify(call) + '\n', 'utf8');
  } catch {
    /* 本地审计是增强信息：磁盘只读/空间满时不影响 MCP 调用本身。 */
  }
}
function recordCall(request, response, elapsedMs) {
  if (!request || request.method === 'notifications/initialized') return;
  const method = String(request.method || '');
  const groupAction = method === 'tools/call' ? String(request.params?.arguments?.action || '').trim() : '';
  const tool = method === 'tools/call'
    ? String(request.params?.name || '') + (groupAction ? ':' + groupAction : '')
    : method;
  const ok = !response?.error && response?.result?.isError !== true;
  const call = {
    method, tool, at: Date.now(), ok, ms: Math.max(0, Math.round(elapsedMs)),
    requestId: `stdio-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    transport: 'stdio', http: 'stdio JSON-RPC', pid: process.pid, host: hostname(),
  };
  RECENT_CALLS.unshift(call);
  appendAuditFile(call);
  if (RECENT_CALLS.length > 100) RECENT_CALLS.length = 100;
}

const DESTRUCTIVE_TOOLS = [
  'es_delete_index', 'es_delete_doc', 'es_delete_by_query', 'es_delete_snapshot',
  'es_restore_snapshot', 'es_delete_template', 'es_delete_data_stream', 'es_delete_transform', 'es_delete_ingest_pipeline', 'es_delete_snapshot_repo', 'es_delete_slm_policy', 'es_delete_watch', 'es_delete_ilm_policy', 'es_delete_script',
  'es_bulk', 'es_rest',
  'es_adhoc_abort', 'es_adhoc_confirm_switch',
  'es_xmigrate_start', 'es_xmigrate_abort',
];
const WRITE_TOOLS = [
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
  'es_xmigrate_sync_structure', 'es_xmigrate_throttle',
];
const TOOL_DEFINITIONS = [
  tool('es_list_connections', 'List connections this MCP client may target.', schema({})),
  tool('es_list_indices', 'List non-system Elasticsearch indices.', schema({})),
  tool('es_cluster_health', 'Return cluster health, version and shard counts.', schema({})),
  tool('es_get_mapping', 'Return the live mapping, field tree and field types for an index.',
    schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_get_doc', 'Get one document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
  }, ['index', 'id'])),
  tool('es_get_settings', 'Return index settings.', schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_get_aliases', 'List aliases and their indices.', schema({})),
  tool('es_list_templates', 'List index templates, with legacy-template normalization.', schema({})),
  tool('es_list_data_streams', 'List data streams and their backing indices.', schema({})),
  tool('es_get_data_stream', 'Get one data stream, its generation and backing indices.',
    schema({ name: val('string', 'Data stream name or wildcard.') }, ['name'])),
  tool('es_data_stream_stats', 'Return document and store statistics for a data stream.',
    schema({ name: val('string', 'Data stream name or wildcard.') }, ['name'])),
  tool('es_create_data_stream', 'Create a data stream; write permission required. Requires a matching data-stream index template.',
    schema({ name: val('string', 'Data stream name.') }, ['name'])),
  tool('es_delete_data_stream', 'Delete a data stream and its backing indices; write permission required.',
    schema({ name: val('string', 'Data stream name.') }, ['name'])),
  tool('es_list_component_templates', 'List composable component templates.', schema({})),
  tool('es_clone_index', 'Clone an index into a new index; write permission required. Source must be read-only.',
    schema({
      index: val('string', 'Source index name.'),
      target: val('string', 'Target index name.'),
      body: val('object', 'Optional settings/aliases body object or JSON object string.'),
    }, ['index', 'target'])),
  tool('es_shrink_index', 'Shrink an index into a target with fewer shards; write permission required. Source must be read-only.',
    schema({
      index: val('string', 'Source index name.'),
      target: val('string', 'Target index name.'),
      body: val('object', 'Optional settings/aliases body object or JSON object string.'),
    }, ['index', 'target'])),
  tool('es_split_index', 'Split an index into a target with more shards; write permission required. Source must be read-only.',
    schema({
      index: val('string', 'Source index name.'),
      target: val('string', 'Target index name.'),
      body: val('object', 'Optional settings/aliases body object or JSON object string.'),
    }, ['index', 'target'])),
  tool('es_list_nodes', 'List cluster nodes and their roles/health.', schema({})),
  tool('es_list_tasks', 'List running cluster tasks.', schema({ actions: val('string', 'Optional task action filter.') })),
  tool('es_index_recovery', 'Return shard recovery status for an index.', schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_cat_shards', 'List shard allocation rows for one or all indices.', schema({ index: val('string', 'Optional index name or wildcard.') })),
  tool('es_cluster_state', 'Return cluster state for selected metrics and an optional index.', schema({
    metrics: val('string', 'Comma-separated metrics (default metadata).'),
    index: val('string', 'Optional index name or wildcard.'),
  })),
  tool('es_mtermvectors', 'Return term vectors for multiple documents in one request.', schema({
    index: val('string', 'Optional default index.'),
    body: val('object', 'Body with docs array, or a JSON object string.'),
  }, ['body'])),
  tool('es_index_segments', 'Return Lucene segment details for an index.', schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_list_transforms', 'List transforms with their status and destination.', schema({})),
  tool('es_get_transform', 'Get one transform definition and metadata.', schema({ id: val('string', 'Transform id.') }, ['id'])),
  tool('es_transform_stats', 'Return transform progress and failure statistics.', schema({ id: val('string', 'Transform id.') }, ['id'])),
  tool('es_put_transform', 'Create or update a transform; write permission required.', schema({
    id: val('string', 'Transform id.'),
    body: val('object', 'Transform body object or JSON object string.'),
  }, ['id', 'body'])),
  tool('es_start_transform', 'Start a transform; write permission required.', schema({ id: val('string', 'Transform id.') }, ['id'])),
  tool('es_stop_transform', 'Stop a transform; write permission required.', schema({ id: val('string', 'Transform id.') }, ['id'])),
  tool('es_delete_transform', 'Delete a transform; write permission required.', schema({ id: val('string', 'Transform id.') }, ['id'])),
  tool('es_search', 'Run an Elasticsearch DSL search and return the raw response.', schema({
    index: val('string', 'Index or alias name.'),
    body: val('object', 'Optional full search body with aggs/sort/search_after/highlight.'),
    query: val('object', 'Elasticsearch query object, or a JSON string.'),
    size: val('integer', 'Number of hits, 1-100.'),
    explain: val('boolean', 'Include _explanation in hits.'),
    profile: val('boolean', 'Include the profile tree.'),
  }, ['index'])),
  tool('es_count', 'Count documents matching a query.', schema({
    index: val('string', 'Index or alias name.'),
    query: val('object', 'Query object, or a JSON string.'),
  }, ['index'])),
  tool('es_sql', 'Run an Elasticsearch SQL query and return columns, rows and cursor.', schema({
    query: val('string', 'SQL text.'),
    fetchSize: val('integer', 'Fetch size, 1-5000.'),
  }, ['query'])),
  tool('es_explain_doc', 'Explain one document against a query using _explain.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
    query: val('object', 'Query object, or a JSON string.'),
  }, ['index', 'id'])),
  tool('es_get_index_stats', 'Return index stats.', schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_msearch', 'Run multiple search requests in one _msearch call.', schema({
    index: val('string', 'Default index or alias for searches that omit index.'),
    searches: val('array', 'Array of {index?, body?, query?, size?} search objects.'),
  }, ['searches'])),
  tool('es_mget', 'Get multiple documents by id in one _mget call.', schema({
    index: val('string', 'Index or alias name.'),
    ids: val('array', 'Document ids.'),
  }, ['index', 'ids'])),
  tool('es_scroll_start', 'Start a scroll search for ES 6/7 compatibility.', schema({
    index: val('string', 'Index or alias name.'),
    scroll: val('string', 'Keep-alive such as 1m (default 1m).'),
    body: val('object', 'Optional full search body.'),
    query: val('object', 'Optional query object or JSON string.'),
    size: val('integer', 'Number of hits, 1-100.'),
  }, ['index'])),
  tool('es_scroll_next', 'Fetch the next page of a scroll search.', schema({
    scrollId: val('string', 'Scroll id returned by es_scroll_start.'),
    scroll: val('string', 'Keep-alive such as 1m.'),
  }, ['scrollId'])),
  tool('es_scroll_clear', 'Clear one or more scroll contexts.', schema({
    scrollId: val('string', 'Optional single scroll id.'),
    scrollIds: val('array', 'Optional scroll id array.'),
  })),
  tool('es_resolve_index', 'Resolve indices, aliases and data streams by name or pattern.', schema({
    name: val('string', 'Index, alias or data stream name or pattern.'),
  }, ['name'])),
  tool('es_search_shards', 'Return shard routing for a search request.', schema({
    index: val('string', 'Index or alias name.'),
    routing: val('string', 'Optional routing value.'),
  }, ['index'])),
  tool('es_rank_eval', 'Evaluate ranked search results with _rank_eval.', schema({
    index: val('string', 'Index or alias name.'),
    body: val('object', 'Rank evaluation body or JSON object string.'),
  }, ['index', 'body'])),
  tool('es_cluster_stats', 'Return cluster-wide statistics.', schema({})),
  tool('es_refresh_index', 'Refresh an index so recent writes become searchable; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
  }, ['index'])),
  tool('es_flush_index', 'Flush an index to disk; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
  }, ['index'])),
  tool('es_index_close', 'Close a concrete index; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
  }, ['index'])),
  tool('es_index_open', 'Open a concrete index; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
  }, ['index'])),
  tool('es_bulk', 'Run a bulk request from an operations array; write permission required.', schema({
    index: val('string', 'Default index or alias for operations that omit index.'),
    operations: val('array', 'Array of {action,index?,id?,document?} operations.'),
    refresh: val('string', 'Optional refresh: true, false or wait_for.'),
    pipeline: val('string', 'Optional ingest pipeline id.'),
    timeout: val('string', 'Optional request timeout.'),
    waitForActiveShards: val('string', 'Optional wait_for_active_shards value.'),
  }, ['operations'])),
  tool('es_terms_enum', 'Enumerate field terms with the _terms_enum API.', schema({
    index: val('string', 'Index or alias name.'),
    field: val('string', 'Field name.'),
    query: val('object', 'Optional query object or JSON string.'),
    size: val('integer', 'Maximum terms, 1-1000.'),
    caseInsensitive: val('boolean', 'Case-insensitive matching.'),
  }, ['index', 'field'])),
  tool('es_field_caps', 'Return field capabilities across one or more indices.', schema({
    index: val('string', 'Index or alias name.'),
    fields: val('string', 'Comma-separated field patterns (default *).'),
  }, ['index'])),
  tool('es_task_cancel', 'Cancel a running cluster task by node:task id; write permission required.', schema({
    taskId: val('string', 'Task id in node:number form.'),
  }, ['taskId'])),
  tool('es_sql_cursor', 'Fetch the next page of an Elasticsearch SQL cursor.', schema({
    cursor: val('string', 'Cursor returned by es_sql.'),
    timeZone: val('string', 'Optional time zone, identical to the first query.'),
    columnar: val('boolean', 'Optional columnar flag, identical to the first query.'),
  }, ['cursor'])),
  tool('es_sql_close', 'Close an Elasticsearch SQL cursor.', schema({
    cursor: val('string', 'Cursor returned by es_sql.'),
  }, ['cursor'])),
  tool('es_sql_translate', 'Translate an SQL query into Elasticsearch DSL.', schema({
    body: val('object', "SQL translate body such as {query:'SELECT ...'}."),
  }, ['body'])),
  tool('es_pit_open', 'Open a point-in-time reader for deep pagination.', schema({
    index: val('string', 'Index or alias name.'),
    keepAlive: val('string', 'Keep-alive such as 5m (default 5m).'),
  }, ['index'])),
  tool('es_pit_search', 'Search a point-in-time reader; body must include pit.id.', schema({
    body: val('object', 'Search body object or JSON string with pit.id.'),
  }, ['body'])),
  tool('es_pit_close', 'Close a point-in-time reader by id.', schema({
    pitId: val('string', 'PIT id returned by es_pit_open.'),
  }, ['pitId'])),
  tool('es_create_index', 'Create a concrete index with optional settings and mappings; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
    settings: val('object', 'Optional settings object or JSON object string.'),
    mappings: val('object', 'Optional mappings object or JSON object string.'),
  }, ['index'])),
  tool('es_delete_index', 'Delete one concrete index; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
  }, ['index'])),
  tool('es_put_mapping', 'Add or update field mappings on an index; write permission required.', schema({
    index: val('string', 'Index or alias name.'),
    mappings: val('object', 'Mappings body such as {properties:{...}}.'),
  }, ['index', 'mappings'])),
  tool('es_update_settings', 'Update dynamic index settings; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
    settings: val('object', 'Settings object, for example {index:{number_of_replicas:2}}.'),
  }, ['index', 'settings'])),
  tool('es_alias', 'Apply atomic alias actions (add/remove); write permission required.', schema({
    actions: val('array', 'Array of alias actions such as {add:{index,alias}} or {remove:{index,alias}}.'),
  }, ['actions'])),
  tool('es_rollover', 'Roll over an alias to a new index, optionally as a dry run; write permission required.', schema({
    alias: val('string', 'Alias to roll over.'),
    conditions: val('object', 'Optional rollover conditions object or JSON object string.'),
    dryRun: val('boolean', 'Only validate conditions without rolling over.'),
  }, ['alias'])),
  tool('es_force_merge', 'Force-merge index segments; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
    maxNumSegments: val('integer', 'Target segment count, 1-1000 (default 1).'),
  }, ['index'])),
  tool('es_put_template', 'Create or update an index or component template; write permission required.', schema({
    name: val('string', 'Template name.'),
    kind: val('string', 'Template kind: index (default) or component.'),
    template: val('object', 'Template body object or JSON object string.'),
  }, ['name', 'template'])),
  tool('es_delete_template', 'Delete an index or component template; write permission required.', schema({
    name: val('string', 'Template name.'),
    kind: val('string', 'Template kind: index (default) or component.'),
  }, ['name'])),
  tool('es_update_by_query', 'Run _update_by_query with an optional query and script; write permission required.', schema({
    index: val('string', 'Index or alias name.'),
    query: val('object', 'Optional query object or JSON string (default match_all).'),
    script: val('object', 'Optional script object or JSON string.'),
    maxDocs: val('integer', 'Optional maximum documents to update.'),
    waitForCompletion: val('boolean', 'Wait for completion instead of returning a task id.'),
    refresh: val('boolean', 'Refresh affected shards after the operation.'),
  }, ['index'])),
  tool('es_delete_by_query', 'Run _delete_by_query with an explicit query; write permission required.', schema({
    index: val('string', 'Index or alias name.'),
    query: val('object', 'Required query object or JSON string.'),
    maxDocs: val('integer', 'Optional maximum documents to delete.'),
    waitForCompletion: val('boolean', 'Wait for completion instead of returning a task id.'),
    refresh: val('boolean', 'Refresh affected shards after the operation.'),
  }, ['index', 'query'])),
  tool('es_reindex', 'Run _reindex with a source/dest body; write permission required.', schema({
    body: val('object', 'Reindex body with source and dest, or a JSON object string.'),
    slices: val('integer', 'Optional number of slices.'),
    waitForCompletion: val('boolean', 'Wait for completion instead of returning a task id.'),
    refresh: val('boolean', 'Refresh affected shards after the operation.'),
    requestsPerSecond: val('number', 'Optional throttle.'),
  }, ['body'])),
  tool('es_analyze', 'Test an analyzer or tokenizer with _analyze.', schema({
    index: val('string', 'Optional index name; omit for the global analyzer.'),
    body: val('object', 'Analyze body such as {analyzer,text} or {tokenizer,text}.'),
  }, ['body'])),
  tool('es_validate_query', 'Validate a query and return Lucene rewrite details.', schema({
    index: val('string', 'Index or alias name.'),
    body: val('object', 'Query body object or JSON object string.'),
  }, ['index', 'body'])),
  tool('es_term_vectors', 'Return term vectors for one document field.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
    fields: val('string', 'Optional comma-separated fields.'),
  }, ['index', 'id'])),
  tool('es_search_template', 'Execute an inline search template against an index.', schema({
    index: val('string', 'Index or alias name.'),
    body: val('object', 'Template body with inline source and params.'),
  }, ['index', 'body'])),
  tool('es_render_template', 'Render an inline search template without executing it.', schema({
    body: val('object', 'Template body with inline source and params.'),
  }, ['body'])),
  tool('es_analysis_settings', 'Return analyzer, tokenizer, filter and normalizer settings for an index.', schema({
    index: val('string', 'Index name.'),
  }, ['index'])),
  tool('es_update_analysis_settings', 'Update analysis settings using a close/update/open sequence; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
    body: val('object', 'Settings body with analysis configuration.'),
  }, ['index', 'body'])),
  tool('es_reload_analyzers', 'Reload search analyzers after synonym or dictionary changes; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
  }, ['index'])),
  tool('es_synonyms_upsert', 'Replace a synonym_graph filter; write permission required.', schema({
    index: val('string', 'Concrete index name.'),
    entries: val('array', 'Synonym rules.'),
    filter: val('string', 'Filter name (default custom_synonyms).'),
    expand: val('boolean', 'Expand equivalent synonyms.'),
  }, ['index', 'entries'])),
  tool('es_reindex_preview', 'Estimate reindex document count and target size without writing.', schema({
    source: val('string', 'Source index or alias name.'),
    query: val('object', 'Optional query object or JSON string.'),
  }, ['source'])),
  tool('es_index_settings_defaults', 'Return index settings including defaults.', schema({
    index: val('string', 'Concrete index name.'),
  }, ['index'])),
  tool('es_index_detail', 'Return mapping, settings, aliases and sample documents for an index.', schema({
    index: val('string', 'Index or alias name.'),
    sampleSize: val('integer', 'Sample documents, 0-20 (default 5).'),
  }, ['index'])),
  tool('es_allocation_explain', 'Explain shard allocation, optionally for one index or shard.', schema({
    body: val('object', 'Optional {index, shard, primary} body.'),
  })),
  tool('es_shard_stores', 'Return shard store allocation and health for an index.', schema({
    index: val('string', 'Index name.'),
    status: val('string', 'Optional status filter such as red,yellow.'),
  }, ['index'])),
  tool('es_pending_tasks', 'List pending master tasks.', schema({})),
  tool('es_slm_policies', 'List snapshot lifecycle management policies.', schema({})),
  tool('es_put_slm_policy', 'Create or update an SLM policy; write permission required.', schema({
    policyId: val('string', 'SLM policy id.'),
    body: val('object', 'SLM policy body object or JSON object string.'),
  }, ['policyId', 'body'])),
  tool('es_delete_slm_policy', 'Delete an SLM policy; write permission required.', schema({
    policyId: val('string', 'SLM policy id.'),
  }, ['policyId'])),
  tool('es_slm_status', 'Return SLM service status and stats.', schema({})),
  tool('es_slm_execute', 'Execute an SLM policy immediately; write permission required.', schema({
    policyId: val('string', 'SLM policy id.'),
  }, ['policyId'])),
  tool('es_nodes_stats', 'Return JVM, filesystem, OS and thread-pool stats per node.', schema({})),
  tool('es_hot_threads', 'Return hot threads, optionally for one node.', schema({
    threads: val('integer', 'Number of threads, 1-100 (default 3).'),
    interval: val('string', 'Sampling interval such as 500ms.'),
    type: val('string', 'wait, block or cpu.'),
    nodeId: val('string', 'Optional node id.'),
  })),
  tool('es_remote_clusters', 'List remote cluster connections and local cluster identity.', schema({})),
  tool('es_plugins', 'Return the installed plugin matrix across nodes.', schema({})),
  tool('es_watcher', 'Return Watcher stats and watches when available.', schema({})),
  tool('es_put_watch', 'Create or update a watch; write permission required.', schema({
    id: val('string', 'Watch id.'),
    body: val('object', 'Watch body object or JSON object string.'),
  }, ['id', 'body'])),
  tool('es_delete_watch', 'Delete a watch; write permission required.', schema({
    id: val('string', 'Watch id.'),
  }, ['id'])),
  tool('es_execute_watch', 'Execute a watch immediately; write permission required.', schema({
    id: val('string', 'Watch id.'),
  }, ['id'])),
  tool('es_ingest_pipelines', 'List ingest pipelines, or one pipeline by id.', schema({
    id: val('string', 'Optional pipeline id.'),
  })),
  tool('es_put_ingest_pipeline', 'Create or update an ingest pipeline; write permission required.', schema({
    id: val('string', 'Pipeline id.'),
    body: val('object', 'Pipeline body object or JSON object string.'),
  }, ['id', 'body'])),
  tool('es_delete_ingest_pipeline', 'Delete an ingest pipeline; write permission required.', schema({
    id: val('string', 'Pipeline id.'),
  }, ['id'])),
  tool('es_cat_allocation', 'Return shard allocation and disk usage by node.', schema({})),
  tool('es_get_cluster_settings', 'Return persistent, transient and default cluster settings.', schema({})),
  tool('es_update_cluster_settings', 'Update persistent or transient cluster settings; write permission required.', schema({
    body: val('object', 'Settings body such as {persistent:{...}} or {transient:{...}}.'),
  }, ['body'])),
  tool('es_reroute', 'Apply cluster reroute commands, optionally as a dry run; write permission required.', schema({
    body: val('object', 'Reroute body such as {commands:[{move:{...}}]}.'),
    dryRun: val('boolean', 'Only validate the commands.'),
    explain: val('boolean', 'Include explanations (default true).'),
    retryFailed: val('boolean', 'Retry failed shard allocations.'),
  }, ['body'])),
  tool('es_list_snapshot_repos', 'List snapshot repositories with secrets masked for non-admin keys.', schema({})),
  tool('es_put_snapshot_repo', 'Create or update a snapshot repository; write permission required.', schema({
    repo: val('string', 'Snapshot repository name.'),
    body: val('object', 'Repository body object or JSON object string.'),
  }, ['repo', 'body'])),
  tool('es_delete_snapshot_repo', 'Delete a snapshot repository; write permission required.', schema({
    repo: val('string', 'Snapshot repository name.'),
  }, ['repo'])),
  tool('es_list_snapshots', 'List snapshots in a repository.', schema({
    repo: val('string', 'Snapshot repository name.'),
  }, ['repo'])),
  tool('es_snapshot_status', 'Return snapshot progress for a repository or snapshot.', schema({
    repo: val('string', 'Optional snapshot repository name.'),
    name: val('string', 'Optional snapshot name.'),
  })),
  tool('es_create_snapshot', 'Create a snapshot; write permission required.', schema({
    repo: val('string', 'Snapshot repository name.'),
    name: val('string', 'Snapshot name.'),
    body: val('object', 'Optional body with indices or include_global_state.'),
  }, ['repo', 'name'])),
  tool('es_delete_snapshot', 'Delete a snapshot; write permission required.', schema({
    repo: val('string', 'Snapshot repository name.'),
    name: val('string', 'Snapshot name.'),
  }, ['repo', 'name'])),
  tool('es_restore_snapshot', 'Restore a snapshot; write permission required.', schema({
    repo: val('string', 'Snapshot repository name.'),
    name: val('string', 'Snapshot name.'),
    body: val('object', 'Optional restore body with indices or rename_pattern.'),
  }, ['repo', 'name'])),
  tool('es_ilm_policies', 'List ILM policies.', schema({})),
  tool('es_ilm_explain', 'Explain the ILM state of an index.', schema({
    index: val('string', 'Index name or pattern.'),
  }, ['index'])),
  tool('es_ilm_status', 'Return the ILM service status.', schema({})),
  tool('es_put_ilm_policy', 'Create or update an ILM policy; write permission required.', schema({
    name: val('string', 'ILM policy name.'),
    policy: val('object', 'Policy body such as {policy:{phases:{...}}}.'),
  }, ['name', 'policy'])),
  tool('es_delete_ilm_policy', 'Delete an ILM policy; write permission required.', schema({
    name: val('string', 'ILM policy name.'),
  }, ['name'])),
  tool('es_ilm_move', 'Move an index to a specific ILM step; write permission required.', schema({
    index: val('string', 'Index name.'),
    body: val('object', 'Move body with current_step and next_step.'),
  }, ['index', 'body'])),
  tool('es_ilm_start', 'Start the ILM service; write permission required.', schema({})),
  tool('es_ilm_stop', 'Stop the ILM service; write permission required.', schema({})),
  tool('es_list_scripts', 'List stored scripts.', schema({})),
  tool('es_put_script', 'Create or update a stored script; write permission required.', schema({
    id: val('string', 'Script id.'),
    script: val('object', 'Script body such as {script:{lang,source}}.'),
  }, ['id', 'script'])),
  tool('es_delete_script', 'Delete a stored script; write permission required.', schema({
    id: val('string', 'Script id.'),
  }, ['id'])),
  tool('es_task_detail', 'Return details for one cluster task by node:task id.', schema({
    taskId: val('string', 'Task id in node:number form.'),
  }, ['taskId'])),
  tool('es_index_doc', 'Create or overwrite a document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
    document: val('object', 'Document body object, or a JSON object string.'),
  }, ['index', 'id', 'document'])),
  tool('es_update_doc', 'Partially update fields of a document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
    document: val('object', 'Partial document object, or a JSON object string.'),
  }, ['index', 'id', 'document'])),
  tool('es_delete_doc', 'Delete a document by id.', schema({
    index: val('string', 'Index or alias name.'),
    id: val('string', 'Document id.'),
  }, ['index', 'id'])),
  tool('es_rest', 'Run a raw Elasticsearch REST request; write methods require write permission.', schema({
    method: val('string', 'GET, HEAD, POST, PUT or DELETE.'),
    path: val('string', 'REST path starting with /.'),
    body: val('object', 'Optional JSON body object or string.'),
  }, ['method', 'path'])),
  tool('es_adhoc_prepare', 'Probe managed rebuild source: alias form, physical indices, settings/mapping, doc count, suggested target name, time-field candidates.',
    schema({ index: val('string', 'Index or alias name.') }, ['index'])),
  tool('es_adhoc_start', 'Start a managed adhoc rebuild job for a logical index (INCREMENTAL, WRITE_BLOCK or MANUAL strategy); write permission required.',
    schema({
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
    }, ['index', 'strategy'])),
  tool('es_adhoc_status', 'Get one managed adhoc rebuild job progress snapshot by job id.',
    schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId'])),
  tool('es_adhoc_abort', 'Request abort of a running managed rebuild job by job id; write permission required.',
    schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId'])),
  tool('es_adhoc_confirm_switch', 'Release the pre-switch pause gate of a managed rebuild job by job id; write permission required.',
    schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId'])),
  tool('es_adhoc_jobs', 'List managed adhoc rebuild jobs, newest first.', schema({})),
  tool('es_adhoc_retry', 'Retry a failed or aborted managed rebuild job by id, reusing its original configuration; write permission required.',
    schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId'])),
  tool('es_adhoc_delete_jobs', 'Delete one terminal managed rebuild job by id, or purge terminal jobs older than a number of days; write permission required.',
    schema({
      jobId: val('string', 'Managed rebuild job id to delete; mutually exclusive with olderThanDays.'),
      olderThanDays: val('number', 'Purge terminal jobs finished before this many days; mutually exclusive with jobId.'),
    })),
  tool('es_adhoc_throttle', 'Rethrottle the in-flight reindex task of a managed rebuild job (requestsPerSecond, -1 for unlimited); write permission required.',
    schema({
      jobId: val('string', 'Managed rebuild job id.'),
      requestsPerSecond: val('number', 'New throttle in docs per second; -1 restores unlimited.'),
    }, ['jobId', 'requestsPerSecond'])),
  tool('es_adhoc_events', 'Read the event timeline of one managed rebuild job by job id: stage transitions with timestamps, newest last.',
    schema({ jobId: val('string', 'Managed rebuild job id.') }, ['jobId'])),
  tool('es_xmigrate_probe_capabilities', '探测目标集群能力：版本/发行版/厂商推断(阿里云·腾讯云·AWS·Elastic·自建)/插件清单/节点规模，为结构同步兼容剔除提供依据.',
    schema({
      connection: val('string', 'Connection id to probe; host or omitted means the default connection.'),
      index: val('string', 'Optional index name to attach an index profile (aliases/bytes/shards/docCount/fieldTypeCounts) to the probe result.'),
    }, ['connection'])),
  tool('es_xmigrate_preflight', 'Cross-cluster migration preflight: report whether the dest index already exists so a merge instead of a clean rebuild is visible before start.',
    schema({
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destIndex: val('string', 'Target index name on the host cluster.'),
    }, ['sourceIndex', 'destIndex'])),
  tool('es_xmigrate_start', 'Start a cross-cluster migration job from a stored source connection profile (srcConnId) into the host cluster; write permission required.',
    schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destIndex: val('string', 'Target index name on the host cluster.'),
      destCreateMode: val('string', 'NONE, COPY_FROM_SOURCE, FROM_ENTITY or REBUILD (default NONE).'),
      tuneMode: val('string', 'AGGRESSIVE or GENTLE (default AGGRESSIVE).'),
      slices: val('integer', 'Sliced scroll workers, capped at 32.'),
      batchSize: val('integer', 'Scroll/bulk batch size, capped at 10000.'),
      forceMerge: val('boolean', 'Force-merge the dest index after completion.'),
    }, ['srcConnId', 'sourceIndex', 'destIndex'])),
  tool('es_xmigrate_status', 'Get one cross-cluster migration job progress snapshot by job id.',
    schema({ jobId: val('string', 'Cross-cluster migration job id.') }, ['jobId'])),
  tool('es_xmigrate_jobs', 'List recent cross-cluster migration jobs, newest first.',
    schema({ limit: val('integer', 'Maximum jobs to return, 1-500 (default 20).') })),
  tool('es_xmigrate_fetch_config', 'Fetch mapping and settings of a source index from the stored source connection profile for preview before creating the dest index.',
    schema({
      srcConnId: val('string', 'Stored source connection profile id; inline credentials are not accepted.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
    }, ['srcConnId', 'sourceIndex'])),
  tool('es_xmigrate_resume', 'Resume a failed or interrupted cross-cluster migration job with the stored source connection profile; write permission required.',
    schema({
      jobId: val('string', 'Cross-cluster migration job id.'),
      srcConnId: val('string', 'Stored source connection profile id of this job.'),
    }, ['jobId', 'srcConnId'])),
  tool('es_xmigrate_abort', 'Abort a running cross-cluster migration job by job id; write permission required.',
    schema({ jobId: val('string', 'Cross-cluster migration job id.') }, ['jobId'])),
  tool('es_xmigrate_reconcile', 'Reconcile document counts between a migration source index on the old cluster and its dest index on the host side: srcCount, destCount and diff in one call.',
    schema({
      srcConnId: val('string', 'Source connection id from the local config connections list.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destConnId: val('string', 'Dest connection id from the local config, or host for the default connection.'),
      destIndex: val('string', 'Target index name on the dest connection.'),
    }, ['srcConnId', 'sourceIndex', 'destConnId', 'destIndex'])),
  tool('es_xmigrate_conflicts', 'Read the version-conflict id sample ring (cap 1000) and total conflict count of one cross-cluster migration job by job id.',
    schema({ jobId: val('string', 'Cross-cluster migration job id.') }, ['jobId'])),
  tool('es_xmigrate_connect_check', 'Probe the stored source connection profile directly: reachability, version and a non-system index sample from the old cluster.',
    schema({ srcConnId: val('string', 'Stored source connection profile id from the local config connections list.') }, ['srcConnId'])),
  tool('es_xmigrate_resolve_preview', 'Echo the parsed URL shape of a stored connection profile with credentials masked, for a pre-flight connectivity review.',
    schema({ srcConnId: val('string', 'Stored source connection profile id from the local config connections list.') }, ['srcConnId'])),
  tool('es_xmigrate_dest_indices', 'List non-system indices on the migration target connection (default: the host/default connection).',
    schema({ destConnId: val('string', 'Dest connection id from the local config; host or omitted means the default connection.') })),
  tool('es_xmigrate_delete_jobs', 'Delete terminal cross-cluster migration jobs from the local job ledger, by job id or by age; write permission required.',
    schema({
      jobId: val('string', 'Cross-cluster migration job id to delete; mutually exclusive with olderThanDays.'),
      olderThanDays: val('number', 'Purge terminal jobs finished before this many days; mutually exclusive with jobId.'),
    })),
  tool('es_xmigrate_sync_structure', 'Sync index structure (settings/mapping) from a stored source connection to the dest connection: compat-matrix planned prune plus per-rejection reactive prune; returns the adapted create body with planDigest; dryRun=true previews the plan without PUT (no --allow-write needed); expectPlanDigest on execute rejects when the source structure drifted since the dry-run; write permission required otherwise.',
    schema({
      srcConnId: val('string', 'Source connection id from the local config connections list.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destIndex: val('string', 'Target index name on the dest connection (default: same as sourceIndex).'),
      destConnId: val('string', 'Dest connection id from the local config; host or omitted means the default connection.'),
      downgradedAnalyzerFallback: val('string', 'Fallback analyzer for downgraded fields; omitted downgrades to the standard analyzer; normalizer attributes are always removed.'),
      dryRun: val('boolean', 'Preview the compat-matrix prune plan without PUT (default false; no --allow-write needed).'),
      syncAliases: val('boolean', 'Carry the source index aliases over to the dest index after creation (default false).'),
      expectPlanDigest: val('string', 'planDigest from a prior dry-run; on execute (dryRun=false) a mismatch rejects the run because the source structure drifted.'),
    }, ['srcConnId', 'sourceIndex'])),
  tool('es_xmigrate_compare_capabilities', 'Compare source and target cluster capabilities (version/vendor/plugins/nodes) into a risk matrix: version gap or downgrade, vendor change, plugins only in source, node scale.',
    schema({
      srcConnId: val('string', 'Source connection id from the local config connections list.'),
      sourceIndex: val('string', 'Optional source index name carried into the report.'),
      destConnId: val('string', 'Dest connection id from the local config; host or omitted means the default connection.'),
      destIndex: val('string', 'Optional dest index name carried into the report.'),
    }, ['srcConnId'])),
  tool('es_xmigrate_diff_structure', 'Diff index structure between a source index on the stored source connection and a dest index: settings/mappings key-level diff, compat-matrix expectedRemovals reconciliation and unexpected deviations; the dest index must exist.',
    schema({
      srcConnId: val('string', 'Source connection id from the local config connections list.'),
      sourceIndex: val('string', 'Source index name on the old cluster.'),
      destConnId: val('string', 'Dest connection id from the local config; host or omitted means the default connection.'),
      destIndex: val('string', 'Target index name on the dest connection (default: same as sourceIndex).'),
    }, ['srcConnId', 'sourceIndex'])),
  tool('es_xmigrate_verify_equivalence', 'Verify data equivalence between a migration source index and its dest index (read-only): both-side _count comparison, sorted-_doc id sample mget with canonical sha256 digest per id, and an optional terms aggregation comparison; returns verdict EQUIVALENT/DIVERGENT/INCONCLUSIVE.',
    schema({
      jobId: val('string', 'Cross-cluster migration job id; its registered srcConnId/sourceIndex/destIndex are reused.'),
      srcConnId: val('string', 'Source connection id from the local config connections list; alternative to jobId (together with sourceIndex).'),
      sourceIndex: val('string', 'Source index name on the old cluster (required with srcConnId).'),
      destConnId: val('string', 'Dest connection id from the local config; host or omitted means the default connection.'),
      destIndex: val('string', 'Target index name on the dest connection (default: same as sourceIndex).'),
      sampleSize: val('number', 'Sample size of sorted-_doc ids to digest-compare, clamped to 10-500 (default 100).'),
      sampleFields: val('string', 'Comma-separated fields included in the digest; omit for the whole _source.'),
      aggField: val('string', 'Optional terms aggregation field compared on both sides.'),
      aggSize: val('number', 'Aggregation bucket size, clamped to 1-50 (default 10).'),
    })),
  tool('es_xmigrate_throttle', 'Rethrottle a running cross-cluster migration job (rps docs per second, -1 restores unlimited); takes effect from the next batch; write permission required.',
    schema({
      jobId: val('string', 'Cross-cluster migration job id.'),
      rps: val('number', 'New throttle in docs per second; -1 restores unlimited.'),
    }, ['jobId', 'rps'])),
  tool('es_connection_probe', 'Probe one stored connection profile for live health: status, latency, version and last error.',
    schema({ connection: val('string', 'Connection id; optional. Use host for the control cluster, or an id returned by discovery.') }, ['connection'])),
  tool('es_monitor_metrics', 'Read collected cluster/node metrics time series for a connection; interval (60s/10m/1h/1d) switches to date_histogram aggregation.',
    schema({
      scope: val('string', 'cluster (default) or node.'),
      interval: val('string', 'Bucket width such as 60s, 10m, 1h or 1d; omit for raw docs.'),
      fromMs: val('number', 'Window start in epoch milliseconds.'),
      toMs: val('number', 'Window end in epoch milliseconds.'),
      size: val('integer', 'Maximum raw records, 1-2000 (default 2000).'),
    })),
  tool('es_monitor_history', 'Read collected connection probe history records for a connection, newest first.',
    schema({
      status: val('string', 'Optional health status filter such as GREEN or RED.'),
      fromMs: val('number', 'Window start in epoch milliseconds.'),
      toMs: val('number', 'Window end in epoch milliseconds.'),
      size: val('integer', 'Maximum records, 1-1000 (default 200).'),
    })),
  tool('es_config_validate', 'Three-layer config lab validation for candidate index settings/mapping (static rules, ES-side live checks when dryRun is set); read-only analysis, it does not create the index.',
    schema({
      settings: val('string', 'Candidate index settings as a JSON string; optional.'),
      mapping: val('string', 'Candidate index mapping as a JSON string; optional.'),
      dryRun: val('boolean', 'Create and delete a temporary index on the target cluster for live validation (default false).'),
    })),
  tool('es_config_drift', 'Read the drift detail of one registered index key: code annotations vs live cluster, normalized JSON plus a diff summary.',
    schema({ indexKey: val('string', 'Registered index key from the config lab drift key list.') }, ['indexKey'])),
  tool('es_ops_audit', 'Read the console operation audit trail, newest first, filterable by user, action, URI prefix, keyword and time window; rank3 (REBUILD_OP+) semantics like the REST endpoint.',
    schema({
      username: val('string', 'Filter by operator username.'),
      action: val('string', 'Filter by audit action.'),
      uriPrefix: val('string', 'Filter by URI prefix.'),
      kw: val('string', 'Keyword filter across audit dimensions.'),
      fromMs: val('number', 'Window start in epoch milliseconds.'),
      toMs: val('number', 'Window end in epoch milliseconds.'),
      size: val('integer', 'Maximum records, 1-1000 (default 100).'),
      from: val('integer', 'Pagination offset, 0-10000 (default 0).'),
    })),
  tool('es_insight_settings_impact', 'Read-only settings change impact analysis for one index: static/dynamic classification, hot-update gates and rebuild cost estimate; same engine as the console editor.',
    schema({
      index: val('string', 'Target index name.'),
      changes: val('object', 'Settings changes as an object, e.g. {"index.number_of_replicas": 2}.'),
    }, ['index', 'changes'])),
  tool('es_ring_usage', 'Read ring governance usage: audit and monitor index family store sizes, totals and the capacity cap (control-plane index prefixes are masked for non-admin identities).',
    schema({})),
];

const GROUP_ACTIONS = {
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
  },
};
const GROUP_DESCRIPTIONS = {
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
  'es_xmigrate': 'Cross-cluster migration lifecycle: connect check, resolve preview, preflight, start, progress, job list, fetch source config, count reconcile, conflict samples, dest index list, resume, abort, job cleanup, adaptive structure sync (proactive compat matrix plus target-error pruning, dry-run plan with planDigest and alias sync), target capability probe (vendor/version/plugins/nodes), capability comparison risk matrix, structure diff verification, data equivalence verification (counts, sample hash, optional aggregation) and running-job throttle.',
};

/** 组级 MCP annotations 静态表（tools/list 逐组输出，三端同表）：readOnlyHint=true 仅限
    零写 action 的组；destructiveHint=true 仅限含破坏性 action 的组；idempotentHint 同
    readOnlyHint；openWorldHint=true 全组。按组静态声明，不随 --allow-write 裁剪变化。 */
const TOOL_ANNOTATIONS = {
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

const RECOMMENDED_TOOL_NAMES = [
  'es_list_connections',
  'es_list_indices', 'es_index_detail', 'es_get_mapping', 'es_get_settings', 'es_get_aliases',
  'es_index_settings_defaults', 'es_get_index_stats',
  'es_cluster_health', 'es_cluster_stats', 'es_list_nodes', 'es_cat_shards',
  'es_search', 'es_count', 'es_msearch', 'es_mget', 'es_get_doc',
  'es_explain_doc', 'es_field_caps', 'es_terms_enum', 'es_search_shards', 'es_rank_eval', 'es_validate_query',
  'es_sql', 'es_sql_cursor', 'es_sql_close', 'es_sql_translate', 'es_analyze',
  'es_list_tasks', 'es_pending_tasks', 'es_shard_stores', 'es_allocation_explain',
];

for (const definition of TOOL_DEFINITIONS) {
  definition.annotations = {
    readOnlyHint: !WRITE_TOOLS.includes(definition.name) && definition.name !== 'es_rest',
    destructiveHint: DESTRUCTIVE_TOOLS.includes(definition.name),
    openWorldHint: false,
  };
}

const STATIC_RESOURCES = [{
  uri: 'esquerystudio://connections',
  name: '连接目录',
  title: 'MCP 连接',
  description: '当前 MCP 身份可访问的连接及读写范围。',
  mimeType: 'application/json',
}];

const RESOURCE_TEMPLATES = [
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

function promptArg(name, description, required) { return { name, description, required }; }

const PROMPTS = [
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
      promptArg('srcConnId', 'Source connection id from the local config connections list.', true),
      promptArg('destConnId', 'Dest connection id, or host for the default connection.', true),
      promptArg('sourceIndex', 'Source index name to sync.', false),
      promptArg('destIndex', 'Target index name; defaults to sourceIndex.', false),
    ],
  },
];

function resources() {
  const out = [{
    uri: MCP_APP_URI,
    name: 'ESQueryStudio Tool Console',
    title: 'ESQueryStudio Tool Console',
    description: 'MCP Apps surface for ESQueryStudio tools.',
    mimeType: MCP_APP_MIME,
    _meta: { ui: appUiMeta() },
  }, ...STATIC_RESOURCES];
  for (const c of config.connections) {
    out.push({
      uri: 'esquerystudio://connection/' + encodeURIComponent(c.id),
      name: '连接 · ' + c.name,
      title: c.name,
      description: '连接 ' + c.name + '（' + c.id + '）的实时健康与统计。',
      mimeType: 'application/json',
    });
  }
  return out;
}

async function readResource(uri) {
  if (uri === MCP_APP_URI) {
    return {
      contents: [{ uri, mimeType: MCP_APP_MIME, text: MCP_APP_HTML, _meta: { ui: appUiMeta() } }],
    };
  }
  const prefix = 'esquerystudio://';
  if (!uri.startsWith(prefix)) throw new Error('Unsupported resource URI: ' + uri);
  const path = uri.slice(prefix.length).replace(/\/+$/, '');
  const parts = path.split('/').map(decodeURIComponent);
  let data;
  if (parts.length === 1 && parts[0] === 'connections') {
    data = await callTool('es_list_connections');
  } else if (parts.length === 2 && parts[0] === 'connection') {
    const connection = parts[1];
    data = {
      connection,
      health: await callTool('es_cluster_health', { connection }),
      stats: await callTool('es_cluster_stats', { connection }),
    };
  } else if (parts.length === 2 && parts[0] === 'cluster') {
    const connection = parts[1];
    data = {
      connection,
      health: await callTool('es_cluster_health', { connection }),
      stats: await callTool('es_cluster_stats', { connection }),
      nodes: await callTool('es_list_nodes', { connection }),
    };
  } else if (parts.length === 2 && parts[0] === 'indices') {
    const connection = parts[1];
    data = await callTool('es_list_indices', { connection });
  } else if (parts.length === 2 && parts[0] === 'aliases') {
    const connection = parts[1];
    data = await callTool('es_get_aliases', { connection });
  } else if (parts.length === 2 && parts[0] === 'data_streams') {
    const connection = parts[1];
    data = await callTool('es_list_data_streams', { connection });
  } else if (parts.length === 2 && parts[0] === 'component_templates') {
    const connection = parts[1];
    data = await callTool('es_list_component_templates', { connection });
  } else if (parts.length >= 3 && parts[0] === 'index') {
    const connection = parts[1];
    const index = parts[2];
    if (parts.length === 4 && parts[3] === 'mapping') {
      data = await callTool('es_get_mapping', { connection, index });
    } else if (parts.length === 3) {
      data = {
        connection,
        index,
        mapping: await callTool('es_get_mapping', { connection, index }),
        settings: await callTool('es_get_settings', { connection, index }),
        aliases: await callTool('es_get_aliases', { connection }),
        stats: await callTool('es_get_index_stats', { connection, index }),
      };
    } else {
      throw new Error('Unsupported resource URI: ' + uri);
    }
  } else {
    throw new Error('Unsupported resource URI: ' + uri);
  }
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] };
}

function getPrompt(name, args = {}) {
  const requiredArg = (key) => {
    const value = args[key] == null ? '' : String(args[key]).trim();
    if (!value) throw new Error('Missing required argument: ' + key);
    return value;
  };
  const optionalArg = (key) => (args[key] == null ? '' : String(args[key]).trim());
  let description;
  let text;
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
    const srcConnId = requiredArg('srcConnId');
    const destConnId = requiredArg('destConnId');
    const sourceIndex = optionalArg('sourceIndex');
    const destIndex = optionalArg('destIndex');
    description = 'Cross-cloud index structure sync workflow: probe both clusters, compare capabilities, plan with dry-run, validate, execute, then verify with structure diff and data equivalence.';
    text = 'Cross-cloud index structure sync from `' + srcConnId + '` to `' + destConnId + '`'
      + (sourceIndex ? ' for index `' + sourceIndex + (destIndex ? '` → `' + destIndex : '') + '`' : '') + '.\n\n'
      + '1. probe_capabilities on source (srcConnId) and target (destConnId) to capture version/vendor/plugins.\n'
      + '2. compare_capabilities {srcConnId, destConnId} for the risk matrix (vendor change, missing plugins, version gap).\n'
      + '3. sync_structure {dryRun:true} to preview removals/downgrades and the adapted create body with planDigest.\n'
      + '4. Optionally es_indices:config_validate on the planned body.\n'
      + '5. sync_structure {dryRun:false, expectPlanDigest} to execute (requires write permission and confirmation).\n'
      + '6. migrate_index with destCreateMode NONE when structure is already synced; monitor with jobs/status; reconcile counts.\n'
      + '7. diff_structure to verify the target matches the plan (expectedRemovals vs unexpected).\n'
      + '8. verify_equivalence {srcConnId, sourceIndex, destConnId, destIndex, sampleSize, aggField?} for the final data check (counts + sample hash + optional aggregation, verdict must be EQUIVALENT).';
  } else {
    throw new Error('Unknown prompt: ' + name);
  }
  return { description, messages: [{ role: 'user', content: { type: 'text', text } }] };
}

function val(type, description) { return { type, description }; }
function schema(properties, required = []) {
  const out = { type: 'object', properties: {
    ...properties,
    connection: val('string', 'Connection id; optional. Defaults to the configured default connection.'),
  } };
  if (required.length) out.required = required;
  return out;
}
function tool(name, description, inputSchema) { return { name, description, inputSchema }; }

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (argv.includes('--help')) {
  process.stderr.write('Usage: node esquerystudio-local-mcp.mjs [--config path] [--allow-write]\n'
    + 'Config can also be provided by ESQ_MCP_CONFIG. Single connection: ESQ_ES_URL/USERNAME/PASSWORD/API_KEY.\n');
  process.exit(0);
}
const allowWrite = argv.includes('--allow-write') || String(process.env.ESQ_MCP_ALLOW_WRITE || '').toLowerCase() === 'true';
const configPath = arg('--config') || process.env.ESQ_MCP_CONFIG || join(homedir(), '.esquerystudio', 'mcp.json');

function fromEnv() {
  const url = String(process.env.ESQ_ES_URL || '').trim();
  if (!url) return null;
  return {
    id: 'env', name: 'Environment connection', url,
    username: process.env.ESQ_ES_USERNAME || '',
    password: process.env.ESQ_ES_PASSWORD || '',
    apiKey: process.env.ESQ_ES_API_KEY || '',
  };
}

function loadConfig() {
  let parsed = null;
  try { parsed = JSON.parse(readFileSync(configPath, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`Cannot read MCP config ${configPath}: ${e.message}`);
  }
  const list = Array.isArray(parsed?.connections) ? parsed.connections : [];
  if (list.length) {
    const connections = list.map((c, i) => normalizeConnection(c, i));
    const defaultConnection = String(parsed.defaultConnection || connections[0].id);
    if (!connections.some((c) => c.id === defaultConnection)) {
      throw new Error(`defaultConnection "${defaultConnection}" is not in connections`);
    }
    return { connections, defaultConnection };
  }
  const env = fromEnv();
  if (env) return { connections: [normalizeConnection(env, 0)], defaultConnection: env.id };
  throw new Error(`No MCP config found at ${configPath} and ESQ_ES_URL is not set`);
}

function normalizeConnection(raw, index) {
  const url = String(raw?.url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error(`Connection #${index + 1}: url must start with http:// or https://`);
  const id = String(raw?.id || `conn-${index + 1}`).trim();
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) throw new Error(`Connection #${index + 1}: invalid id "${id}"`);
  return {
    id,
    name: String(raw?.name || id).trim(),
    url,
    username: raw?.username ? String(raw.username) : '',
    password: raw?.password ? String(raw.password) : '',
    apiKey: raw?.apiKey ? String(raw.apiKey) : '',
  };
}

const config = loadConfig();
const byId = new Map(config.connections.map((c) => [c.id, c]));
const versionCache = new Map();

async function versionOf(conn) {
  if (versionCache.has(conn.id)) return versionCache.get(conn.id);
  try {
    const root = await es(conn, 'GET', '/');
    const version = root?.version?.number ? String(root.version.number) : '';
    versionCache.set(conn.id, version);
    return version;
  } catch {
    versionCache.set(conn.id, '');
    return '';
  }
}
function majorOf(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isFinite(n) ? n : 0;
}

/** composable index/component templates 从 7.8 开始；6.x/7.0-7.7 回退 legacy /_template。 */
async function templateBase(conn, kind) {
  const parts = String(await versionOf(conn) || '').split('.').map((n) => parseInt(n, 10));
  const composable = parts[0] > 7 || (parts[0] === 7 && parts[1] >= 8);
  if (kind === 'component') {
    if (!composable) throw new Error('Component templates require Elasticsearch 7.8+; use kind=index on this cluster');
    return '/_component_template/';
  }
  return composable ? '/_index_template/' : '/_template/';
}

function connectionOf(args) {
  const requested = String(args?.connection || '').trim() || config.defaultConnection;
  const conn = byId.get(requested);
  if (!conn) throw new Error(`Unknown connection: ${requested}`);
  return conn;
}

async function es(conn, method, path, body, contentType) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = contentType || 'application/json';
  if (conn.apiKey) headers.Authorization = `ApiKey ${conn.apiKey}`;
  else if (conn.username) {
    headers.Authorization = 'Basic ' + Buffer.from(`${conn.username}:${conn.password || ''}`).toString('base64');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(conn.url + path, {
      method,
      headers,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const reason = data?.error?.reason || data?.error?.type || data?.message || `HTTP ${res.status}`;
      const err = new Error(String(reason));
      err.httpStatus = res.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function flattenFields(mappings) {
  const fields = [];
  const walk = (props, prefix) => {
    for (const [name, def] of Object.entries(props || {})) {
      const path = prefix ? `${prefix}.${name}` : name;
      fields.push({
        path,
        type: def?.type || (def?.properties ? 'object' : ''),
        analyzer: def?.analyzer || '',
        search_analyzer: def?.search_analyzer || '',
      });
      if (def?.properties) walk(def.properties, path);
      if (def?.fields) walk(def.fields, path);
    }
  };
  for (const value of Object.values(mappings || {})) {
    const m = value?.mappings || {};
    if (m.properties) walk(m.properties, '');
    else if (m._doc?.properties) walk(m._doc.properties, '');
    else for (const typed of Object.values(m)) if (typed?.properties) walk(typed.properties, '');
  }
  return fields;
}

/** 实现层分发：按内部工具名执行；协议入口归一后与资源读取、参数补全等内部调用都走这里。 */
async function callTool(name, args = {}) {
  /* sync_structure 的 dryRun=true 只读预览：绕过 --allow-write 写门（dryRun=false 维持写门） */
  if (WRITE_TOOLS.includes(name) && !allowWrite
    && !(name === 'es_xmigrate_sync_structure' && args?.dryRun === true)) {
    throw new Error('Write tools are disabled: start the local MCP server with --allow-write or ESQ_MCP_ALLOW_WRITE=true');
  }
  const conn = connectionOf(args);
  switch (name) {
    case 'es_list_connections':
      return config.connections.map((c) => ({
        id: c.id, name: c.name, url: c.url.replace(/\/\/[^@/]+@/, '//***@'),
        active: c.id === config.defaultConnection,
      }));
    case 'es_list_indices': {
      const rows = await es(conn, 'GET',
        '/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep,creation.date.string,segments.count,docs.deleted');
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => !String(r.index || '').startsWith('.'))
        .sort((a, b) => String(a.index).localeCompare(String(b.index)));
    }
    case 'es_cluster_health': {
      const health = await es(conn, 'GET', '/_cluster/health');
      try {
        const root = await es(conn, 'GET', '/');
        if (root?.version?.number) health.version = root.version.number;
      } catch { /* version is best-effort */ }
      return health;
    }
    case 'es_get_mapping': {
      const index = required(args, 'index');
      const raw = await es(conn, 'GET', `/${encodeURIComponent(index)}/_mapping`);
      return { index, mapping: raw, fields: flattenFields(raw) };
    }
    case 'es_get_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      return es(conn, 'GET', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`);
    }
    case 'es_get_settings':
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_settings`);
    case 'es_get_aliases':
      return es(conn, 'GET', '/_cat/aliases?format=json');
    case 'es_list_templates':
      try { return await es(conn, 'GET', '/_index_template'); }
      catch (e) {
        if (e.httpStatus === 400 || e.httpStatus === 404 || e.httpStatus === 405) return es(conn, 'GET', '/_template');
        throw e;
      }
    case 'es_list_data_streams':
      return es(conn, 'GET', '/_data_stream');
    case 'es_get_data_stream':
      return es(conn, 'GET', '/_data_stream/' + encodeURIComponent(required(args, 'name')));
    case 'es_data_stream_stats':
      return es(conn, 'GET', '/_data_stream/' + encodeURIComponent(required(args, 'name')) + '/_stats');
    case 'es_create_data_stream':
      return es(conn, 'PUT', '/_data_stream/' + encodeURIComponent(required(args, 'name')));
    case 'es_delete_data_stream':
      return es(conn, 'DELETE', '/_data_stream/' + encodeURIComponent(required(args, 'name')));
    case 'es_list_component_templates':
      return es(conn, 'GET', '/_component_template');
    case 'es_clone_index':
      return es(conn, 'POST', '/' + encodeURIComponent(required(args, 'index'))
        + '/_clone/' + encodeURIComponent(required(args, 'target')), args.body);
    case 'es_shrink_index':
      return es(conn, 'POST', '/' + encodeURIComponent(required(args, 'index'))
        + '/_shrink/' + encodeURIComponent(required(args, 'target')), args.body);
    case 'es_split_index':
      return es(conn, 'POST', '/' + encodeURIComponent(required(args, 'index'))
        + '/_split/' + encodeURIComponent(required(args, 'target')), args.body);
    case 'es_list_nodes':
      return es(conn, 'GET', '/_cat/nodes?format=json');
    case 'es_list_tasks':
      return es(conn, 'GET', '/_tasks?group_by=parents' + (args.actions ? '&actions=' + encodeURIComponent(String(args.actions)) : ''));
    case 'es_index_recovery':
      return es(conn, 'GET', '/' + encodeURIComponent(required(args, 'index')) + '/_recovery');
    case 'es_cat_shards':
      return es(conn, 'GET', '/_cat/shards' + (args.index ? '/' + encodeURIComponent(String(args.index)) : '') + '?format=json');
    case 'es_cluster_state':
      return es(conn, 'GET', '/_cluster/state/' + encodeURIComponent(String(args.metrics || 'metadata'))
        + (args.index ? '/' + encodeURIComponent(String(args.index)) : ''));
    case 'es_mtermvectors':
      return es(conn, 'POST', (args.index ? '/' + encodeURIComponent(String(args.index)) : '') + '/_mtermvectors', args.body);
    case 'es_index_segments':
      return es(conn, 'GET', '/' + encodeURIComponent(required(args, 'index')) + '/_segments');
    case 'es_list_transforms':
      return es(conn, 'GET', '/_transform');
    case 'es_get_transform':
      return es(conn, 'GET', '/_transform/' + encodeURIComponent(required(args, 'id')));
    case 'es_transform_stats':
      return es(conn, 'GET', '/_transform/' + encodeURIComponent(required(args, 'id')) + '/_stats');
    case 'es_put_transform':
      return es(conn, 'PUT', '/_transform/' + encodeURIComponent(required(args, 'id')), args.body);
    case 'es_start_transform':
      return es(conn, 'POST', '/_transform/' + encodeURIComponent(required(args, 'id')) + '/_start');
    case 'es_stop_transform':
      return es(conn, 'POST', '/_transform/' + encodeURIComponent(required(args, 'id')) + '/_stop');
    case 'es_delete_transform':
      return es(conn, 'DELETE', '/_transform/' + encodeURIComponent(required(args, 'id')));
    case 'es_search': {
      const index = required(args, 'index');
      const body = args.body == null ? {} : { ...objectArg(args, 'body') };
      if (args.size != null) body.size = Math.max(1, Math.min(100, Number(args.size) || 10));
      else if (body.size == null) body.size = 10;
      const clause = queryClause(args.query);
      if (clause) body.query = clause;
      else if (body.query == null) body.query = { match_all: {} };
      const qs = `?explain=${args.explain ? 'true' : 'false'}&profile=${args.profile ? 'true' : 'false'}`;
      return es(conn, 'POST', `/${encodeURIComponent(index)}/_search${qs}`, body);
    }
    case 'es_count': {
      const index = required(args, 'index');
      return es(conn, 'POST', `/${encodeURIComponent(index)}/_count`,
        { query: queryClause(args.query) || { match_all: {} } });
    }
    case 'es_sql': {
      const body = { query: required(args, 'query') };
      if (args.fetchSize != null) body.fetch_size = Math.max(1, Math.min(5000, Number(args.fetchSize) || 200));
      const major = majorOf(await versionOf(conn));
      const primary = major > 0 && major < 7 ? '/_xpack/sql?format=json' : '/_sql?format=json';
      const alternate = primary === '/_sql?format=json' ? '/_xpack/sql?format=json' : '/_sql?format=json';
      try { return await es(conn, 'POST', primary, body); }
      catch (e) {
        if (e.httpStatus === 400 || e.httpStatus === 404 || e.httpStatus === 405) {
          return es(conn, 'POST', alternate, body);
        }
        throw e;
      }
    }
    case 'es_explain_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      const query = queryClause(args.query) || { match_all: {} };
      try {
        return await es(conn, 'POST', `/${encodeURIComponent(index)}/_explain/${encodeURIComponent(id)}`, { query });
      } catch (e) {
        /* ES 6.x 的 _explain 路由带 type；先尝试 _doc，再让真实错误上抛。 */
        if (e.httpStatus === 400 && majorOf(await versionOf(conn)) < 7) {
          return es(conn, 'POST', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}/_explain`, { query });
        }
        throw e;
      }
    }
    case 'es_get_index_stats':
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_stats`);
    case 'es_msearch':
      return es(conn, 'POST', '/_msearch', msearchNdjson(args), 'application/x-ndjson');
    case 'es_mget': {
      if (!Array.isArray(args.ids) || !args.ids.length) throw new Error('ids must be a non-empty array');
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_mget`,
        { ids: args.ids.map((id) => String(id)) });
    }
    case 'es_scroll_start': {
      const index = required(args, 'index');
      const body = args.body == null ? {} : { ...objectArg(args, 'body') };
      if (args.size != null) body.size = Math.max(1, Math.min(100, Number(args.size) || 10));
      else if (body.size == null) body.size = 10;
      const clause = queryClause(args.query);
      if (clause) body.query = clause;
      else if (body.query == null) body.query = { match_all: {} };
      const scroll = String(args.scroll || '1m');
      return es(conn, 'POST',
        `/${encodeURIComponent(index)}/_search?scroll=${encodeURIComponent(scroll)}`, body);
    }
    case 'es_scroll_next':
      return es(conn, 'POST', '/_search/scroll', {
        scroll: String(args.scroll || '1m'),
        scroll_id: required(args, 'scrollId'),
      });
    case 'es_scroll_clear': {
      const ids = Array.isArray(args.scrollIds)
        ? args.scrollIds.map((id) => String(id))
        : (args.scrollId ? [String(args.scrollId)] : []);
      if (!ids.length) throw new Error('scrollId or scrollIds is required');
      return es(conn, 'DELETE', '/_search/scroll', { scroll_id: ids });
    }
    case 'es_resolve_index':
      return es(conn, 'GET', '/_resolve/index/' + encodeURIComponent(required(args, 'name')));
    case 'es_search_shards': {
      const qs = args.routing ? '?routing=' + encodeURIComponent(String(args.routing)) : '';
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_search_shards${qs}`);
    }
    case 'es_rank_eval':
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_rank_eval`,
        objectArg(args, 'body'));
    case 'es_cluster_stats':
      return es(conn, 'GET', '/_cluster/stats');
    case 'es_refresh_index':
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_refresh`);
    case 'es_flush_index':
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_flush`);
    case 'es_index_close':
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_close`);
    case 'es_index_open':
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_open`);
    case 'es_bulk': {
      const p = new URLSearchParams();
      for (const key of ['refresh', 'pipeline', 'timeout', 'waitForActiveShards']) {
        const value = args[key];
        if (value == null || String(value).trim() === '') continue;
        p.set(key === 'waitForActiveShards' ? 'wait_for_active_shards' : key, String(value));
      }
      const qs = p.toString();
      return es(conn, 'POST', '/_bulk' + (qs ? '?' + qs : ''), bulkNdjson(args), 'application/x-ndjson');
    }
    case 'es_terms_enum': {
      const body = { field: required(args, 'field') };
      const q = queryClause(args.query);
      if (q) body.query = q;
      if (args.size != null) body.size = Math.max(1, Math.min(1000, Number(args.size) || 100));
      if (args.caseInsensitive) body.case_insensitive = true;
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_terms_enum`, body);
    }
    case 'es_field_caps': {
      const fields = String(args.fields || '*');
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_field_caps?fields=${encodeURIComponent(fields)}`);
    }
    case 'es_task_cancel':
      return es(conn, 'POST', `/_tasks/${encodeURIComponent(required(args, 'taskId'))}/_cancel`);
    case 'es_sql_cursor': {
      const body = { cursor: required(args, 'cursor') };
      if (args.timeZone) body.time_zone = String(args.timeZone);
      if (args.columnar != null) body.columnar = Boolean(args.columnar);
      const major = majorOf(await versionOf(conn));
      return es(conn, 'POST', major > 0 && major < 7 ? '/_xpack/sql?format=json' : '/_sql?format=json', body);
    }
    case 'es_sql_close': {
      const major = majorOf(await versionOf(conn));
      return es(conn, 'POST', (major > 0 && major < 7 ? '/_xpack/sql/close' : '/_sql/close'),
        { cursor: required(args, 'cursor') });
    }
    case 'es_sql_translate': {
      const major = majorOf(await versionOf(conn));
      return es(conn, 'POST', (major > 0 && major < 7 ? '/_xpack/sql/translate' : '/_sql/translate'),
        objectArg(args, 'body'));
    }
    case 'es_pit_open': {
      const ka = args.keepAlive ? '?keep_alive=' + encodeURIComponent(String(args.keepAlive)) : '';
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_pit${ka}`);
    }
    case 'es_pit_search':
      return es(conn, 'POST', '/_search', objectArg(args, 'body'));
    case 'es_pit_close':
      return es(conn, 'DELETE', '/_pit', { id: required(args, 'pitId') });
    case 'es_create_index': {
      const index = required(args, 'index');
      const body = {};
      if (args.settings != null && String(args.settings).trim() !== '') body.settings = objectArg(args, 'settings');
      if (args.mappings != null && String(args.mappings).trim() !== '') {
        const mappings = objectArg(args, 'mappings');
        const major = majorOf(await versionOf(conn));
        /* ES 6.x 建索引要求 mappings 包一层 type；7+ 保持 typeless。 */
        body.mappings = major > 0 && major < 7 ? { _doc: mappings } : mappings;
      }
      const result = await es(conn, 'PUT', `/${encodeURIComponent(index)}`,
        Object.keys(body).length ? body : undefined);
      return { acknowledged: result?.acknowledged !== false, index };
    }
    case 'es_delete_index': {
      const index = required(args, 'index');
      const result = await es(conn, 'DELETE', `/${encodeURIComponent(index)}`);
      return { acknowledged: result?.acknowledged !== false, index };
    }
    case 'es_put_mapping': {
      const index = required(args, 'index');
      const mappings = objectArg(args, 'mappings');
      try {
        return await es(conn, 'PUT', `/${encodeURIComponent(index)}/_mapping`, mappings);
      } catch (e) {
        if (e.httpStatus === 400 && majorOf(await versionOf(conn)) < 7) {
          return es(conn, 'PUT', `/${encodeURIComponent(index)}/_mapping/_doc`, mappings);
        }
        throw e;
      }
    }
    case 'es_update_settings':
      return es(conn, 'PUT', `/${encodeURIComponent(required(args, 'index'))}/_settings`,
        objectArg(args, 'settings'));
    case 'es_alias': {
      if (!Array.isArray(args.actions) || !args.actions.length) throw new Error('actions must be a non-empty array');
      return es(conn, 'POST', '/_aliases', { actions: args.actions });
    }
    case 'es_rollover': {
      const alias = required(args, 'alias');
      const qs = args.dryRun ? '?dry_run=true' : '';
      const body = args.conditions != null && String(args.conditions).trim() !== ''
        ? { conditions: objectArg(args, 'conditions') } : undefined;
      return es(conn, 'POST', `/${encodeURIComponent(alias)}/_rollover${qs}`, body);
    }
    case 'es_force_merge': {
      const segments = args.maxNumSegments == null
        ? 1 : Math.max(1, Math.min(1000, Number(args.maxNumSegments) || 1));
      return es(conn, 'POST',
        `/${encodeURIComponent(required(args, 'index'))}/_forcemerge?max_num_segments=${segments}`);
    }
    case 'es_put_template': {
      const kind = String(args.kind || 'index').toLowerCase() === 'component' ? 'component' : 'index';
      const base = await templateBase(conn, kind);
      return es(conn, 'PUT', base + encodeURIComponent(required(args, 'name')), objectArg(args, 'template'));
    }
    case 'es_delete_template': {
      const kind = String(args.kind || 'index').toLowerCase() === 'component' ? 'component' : 'index';
      const base = await templateBase(conn, kind);
      return es(conn, 'DELETE', base + encodeURIComponent(required(args, 'name')));
    }
    case 'es_update_by_query': {
      const body = {};
      const query = queryClause(args.query);
      if (query) body.query = query;
      if (args.script != null) body.script = objectArg(args, 'script');
      const qs = queryOpts(args);
      return es(conn, 'POST',
        `/${encodeURIComponent(required(args, 'index'))}/_update_by_query${qs ? '?' + qs : ''}`,
        Object.keys(body).length ? body : { query: { match_all: {} } });
    }
    case 'es_delete_by_query': {
      const query = queryClause(args.query);
      if (!query) throw new Error('query is required for delete_by_query');
      const qs = queryOpts(args);
      return es(conn, 'POST',
        `/${encodeURIComponent(required(args, 'index'))}/_delete_by_query${qs ? '?' + qs : ''}`,
        { query });
    }
    case 'es_reindex': {
      const qs = queryOpts(args);
      return es(conn, 'POST', '/_reindex' + (qs ? '?' + qs : ''), objectArg(args, 'body'));
    }
    case 'es_analyze': {
      const index = args.index ? '/' + encodeURIComponent(String(args.index)) : '';
      return es(conn, 'POST', index + '/_analyze', objectArg(args, 'body'));
    }
    case 'es_validate_query':
      return es(conn, 'POST',
        `/${encodeURIComponent(required(args, 'index'))}/_validate/query?explain=true&rewrite=true`,
        objectArg(args, 'body'));
    case 'es_term_vectors': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      const fields = args.fields ? '&fields=' + encodeURIComponent(String(args.fields)) : '';
      const qs = '?term_statistics=true&field_statistics=true&positions=false&offsets=false' + fields;
      try {
        return await es(conn, 'GET',
          `/${encodeURIComponent(index)}/_termvectors/${encodeURIComponent(id)}${qs}`);
      } catch (e) {
        if (e.httpStatus === 400 && majorOf(await versionOf(conn)) < 7) {
          return es(conn, 'GET',
            `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}/_termvectors${qs}`);
        }
        throw e;
      }
    }
    case 'es_search_template':
      return es(conn, 'POST',
        `/${encodeURIComponent(required(args, 'index'))}/_search/template`,
        objectArg(args, 'body'));
    case 'es_render_template':
      return es(conn, 'POST', '/_render/template', objectArg(args, 'body'));
    case 'es_analysis_settings': {
      const index = required(args, 'index');
      const raw = await es(conn, 'GET',
        `/${encodeURIComponent(index)}/_settings?include_defaults=false&flat_settings=false`);
      const out = { index, analysis: {}, summary: { analyzers: 0, tokenizers: 0, filters: 0, charFilters: 0, normalizers: 0 } };
      for (const v of Object.values(raw || {})) {
        const a = v?.settings?.index?.analysis || {};
        out.analysis = a;
        out.summary = {
          analyzers: Object.keys(a.analyzer || {}).length,
          tokenizers: Object.keys(a.tokenizer || {}).length,
          filters: Object.keys(a.filter || {}).length,
          charFilters: Object.keys(a.char_filter || {}).length,
          normalizers: Object.keys(a.normalizer || {}).length,
        };
        break;
      }
      return out;
    }
    case 'es_update_analysis_settings': {
      const index = required(args, 'index');
      const body = objectArg(args, 'body');
      const steps = [];
      try {
        await es(conn, 'POST', `/${encodeURIComponent(index)}/_close`); steps.push('close-ok');
        await es(conn, 'PUT', `/${encodeURIComponent(index)}/_settings`, body); steps.push('put-settings-ok');
      } finally {
        try { await es(conn, 'POST', `/${encodeURIComponent(index)}/_open`); steps.push('open-ok'); }
        catch (e) { steps.push('open-FAILED: ' + e.message); }
      }
      return { steps, ok: steps.includes('put-settings-ok') && steps.includes('open-ok') };
    }
    case 'es_reload_analyzers':
      return es(conn, 'POST', `/${encodeURIComponent(required(args, 'index'))}/_reload_search_analyzers`);
    case 'es_synonyms_upsert': {
      if (!Array.isArray(args.entries)) throw new Error('entries must be an array of synonym rules');
      const index = required(args, 'index');
      const filter = String(args.filter || 'custom_synonyms');
      const body = {
        analysis: { filter: { [filter]: { type: 'synonym_graph', expand: Boolean(args.expand), synonyms: args.entries } } },
      };
      const steps = [];
      try {
        await es(conn, 'POST', `/${encodeURIComponent(index)}/_close`); steps.push('close-ok');
        await es(conn, 'PUT', `/${encodeURIComponent(index)}/_settings`, body); steps.push('put-settings-ok');
      } finally {
        try { await es(conn, 'POST', `/${encodeURIComponent(index)}/_open`); steps.push('open-ok'); }
        catch (e) { steps.push('open-FAILED: ' + e.message); }
      }
      return { steps, ok: steps.includes('put-settings-ok') && steps.includes('open-ok') };
    }
    case 'es_reindex_preview': {
      const source = required(args, 'source');
      const query = args.query == null ? null : queryClause(args.query);
      const countBody = query ? { query } : { query: { match_all: {} } };
      const cnt = await es(conn, 'POST', `/${encodeURIComponent(source)}/_count`, countBody);
      const st = await es(conn, 'GET', `/${encodeURIComponent(source)}/_stats/store,docs`);
      let totalDocs = 0;
      let primaryBytes = 0;
      for (const v of Object.values(st?.indices || {})) {
        totalDocs += Number(v?.primaries?.docs?.count || 0);
        primaryBytes += Number(v?.primaries?.store?.size_in_bytes || 0);
      }
      const avg = totalDocs > 0 ? primaryBytes / totalDocs : 0;
      const docs = Number(cnt?.count || 0);
      return {
        docs, sourceTotalDocs: totalDocs, sourcePrimaryBytes: primaryBytes,
        avgDocBytes: avg, estimatedTargetBytes: Math.round(avg * docs),
      };
    }
    case 'es_index_settings_defaults': {
      const settings = await es(conn, 'GET',
        `/${encodeURIComponent(required(args, 'index'))}/_settings?include_defaults=true&flat_settings=true`);
      return { status: 200, body: settings };
    }
    case 'es_index_detail': {
      const index = required(args, 'index');
      const sampleSize = Math.min(20, Math.max(0, Number(args.sampleSize == null ? 5 : args.sampleSize) || 0));
      const out = { name: index };
      try {
        out.mappings = await es(conn, 'GET', `/${encodeURIComponent(index)}/_mapping`);
      } catch (e) { out.mappingsError = e.message; }
      try {
        out.settings = await es(conn, 'GET', `/${encodeURIComponent(index)}/_settings`);
      } catch (e) { out.settingsError = e.message; }
      try {
        out.aliases = await es(conn, 'GET', `/${encodeURIComponent(index)}/_alias`);
      } catch (e) { out.aliasesError = e.message; }
      if (sampleSize > 0) {
        try {
          const r = await es(conn, 'GET', `/${encodeURIComponent(index)}/_search?size=${sampleSize}`);
          out.sample = (r?.hits?.hits || []).map((h) => ({ _id: h._id, _index: h._index, _source: h._source }));
        } catch (e) { out.sampleError = e.message; }
      }
      return out;
    }
    case 'es_allocation_explain': {
      const body = args.body == null || String(args.body).trim() === '' ? undefined : objectArg(args, 'body');
      return es(conn, 'POST', '/_cluster/allocation/explain', body);
    }
    case 'es_shard_stores': {
      const status = args.status ? '?status=' + encodeURIComponent(String(args.status)) : '';
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_shard_stores${status}`);
    }
    case 'es_pending_tasks':
      return es(conn, 'GET', '/_cluster/pending_tasks');
    case 'es_slm_policies':
      try { return await es(conn, 'GET', '/_slm/policy'); }
      catch (e) { return { available: false, reason: e.message, policies: {} }; }
    case 'es_put_slm_policy':
      return es(conn, 'PUT', '/_slm/policy/' + encodeURIComponent(required(args, 'policyId')), args.body);
    case 'es_delete_slm_policy':
      return es(conn, 'DELETE', '/_slm/policy/' + encodeURIComponent(required(args, 'policyId')));
    case 'es_slm_status':
      try {
        return { status: await es(conn, 'GET', '/_slm/status'), stats: await es(conn, 'GET', '/_slm/stats') };
      } catch (e) { return { available: false, reason: e.message }; }
    case 'es_slm_execute':
      return es(conn, 'POST',
        `/_slm/policy/${encodeURIComponent(required(args, 'policyId'))}/_execute`, {});
    case 'es_nodes_stats': {
      const raw = await es(conn, 'GET', '/_nodes/stats/jvm,fs,os,thread_pool');
      const out = [];
      for (const [nodeId, n] of Object.entries(raw?.nodes || {})) {
        const row = { nodeId, name: n.name, host: n.host, roles: n.roles };
        if (n.jvm?.mem) row.jvm = {
          heapUsedBytes: n.jvm.mem.heap_used_in_bytes,
          heapMaxBytes: n.jvm.mem.heap_max_in_bytes,
          heapUsedPercent: n.jvm.mem.heap_used_percent,
        };
        if (n.fs?.total) row.fs = {
          totalBytes: n.fs.total.total_in_bytes,
          freeBytes: n.fs.total.free_in_bytes,
          availableBytes: n.fs.total.available_in_bytes,
        };
        row.os = { cpuPercent: n.os?.cpu?.percent, loadAverage: n.os?.load_average ?? n.os?.cpu?.load_average };
        const pools = {};
        for (const p of ['search', 'write', 'bulk', 'get', 'flush', 'refresh']) {
          if (n.thread_pool?.[p]) pools[p] = {
            active: n.thread_pool[p].active, queue: n.thread_pool[p].queue,
            rejected: n.thread_pool[p].rejected, completed: n.thread_pool[p].completed,
          };
        }
        row.threadPool = pools;
        out.push(row);
      }
      return out;
    }
    case 'es_hot_threads': {
      const threads = Math.max(1, Math.min(100, Number(args.threads == null ? 3 : args.threads) || 3));
      const nodeId = args.nodeId ? encodeURIComponent(String(args.nodeId)) + '/' : '';
      const qs = `?threads=${threads}`
        + '&interval=' + encodeURIComponent(String(args.interval || '500ms'))
        + '&type=' + encodeURIComponent(String(args.type || 'cpu'));
      return es(conn, 'GET', `/_nodes/${nodeId}hot_threads${qs}`);
    }
    case 'es_remote_clusters': {
      const out = {};
      try {
        const info = await es(conn, 'GET', '/_remote/info');
        out.remotes = info || {};
        out.count = info ? Object.keys(info).length : 0;
      } catch (e) {
        out.remotes = {};
        out.count = 0;
        out.reason = e.message;
      }
      try {
        const self = await es(conn, 'GET', '/');
        out.localClusterName = self?.cluster_name;
        out.localVersion = self?.version;
      } catch { /* local identity is best-effort */ }
      return out;
    }
    case 'es_plugins': {
      let rows;
      try {
        rows = await es(conn, 'GET', '/_cat/plugins?format=json&v=true');
      } catch (e) {
        return { available: false, reason: e.message };
      }
      const byPlugin = new Map();
      const allNodes = new Set();
      for (const r of rows || []) {
        const nn = String(r.name || '');
        const pn = String(r.component || '');
        if (!nn || !pn) continue;
        allNodes.add(nn);
        if (!byPlugin.has(pn)) byPlugin.set(pn, new Set());
        byPlugin.get(pn).add(nn);
      }
      const summary = [...byPlugin.entries()].map(([plugin, set]) => ({
        plugin, installedOn: [...set], count: set.size, complete: set.size === allNodes.size,
      }));
      return {
        available: true, nodes: rows || [], summary,
        mismatches: summary.filter((x) => !x.complete).map((x) => x.plugin),
        nodeCount: allNodes.size, pluginCount: byPlugin.size,
      };
    }
    case 'es_watcher': {
      const out = { available: true };
      try {
        out.stats = await es(conn, 'GET', '/_watcher/stats');
      } catch (e) {
        return { available: false, reason: e.message };
      }
      try {
        out.watches = await es(conn, 'POST', '/.watches/_search', {
          size: 200, _source: ['metadata', 'trigger', 'actions'],
        });
      } catch (e) {
        out.watches = {};
        out.reason = e.message;
      }
      return out;
    }
    case 'es_put_watch':
      return es(conn, 'PUT', '/_watcher/watch/' + encodeURIComponent(required(args, 'id')), args.body);
    case 'es_delete_watch':
      return es(conn, 'DELETE', '/_watcher/watch/' + encodeURIComponent(required(args, 'id')));
    case 'es_execute_watch':
      return es(conn, 'POST', '/_watcher/watch/' + encodeURIComponent(required(args, 'id')) + '/_execute');
    case 'es_ingest_pipelines':
      return es(conn, 'GET', args.id
        ? '/_ingest/pipeline/' + encodeURIComponent(String(args.id))
        : '/_ingest/pipeline');
    case 'es_put_ingest_pipeline':
      return es(conn, 'PUT', '/_ingest/pipeline/' + encodeURIComponent(required(args, 'id')), args.body);
    case 'es_delete_ingest_pipeline':
      return es(conn, 'DELETE', '/_ingest/pipeline/' + encodeURIComponent(required(args, 'id')));
    case 'es_cat_allocation':
      return es(conn, 'GET', '/_cat/allocation?format=json&bytes=b');
    case 'es_get_cluster_settings':
      return es(conn, 'GET', '/_cluster/settings?include_defaults=true&flat_settings=false');
    case 'es_update_cluster_settings':
      return es(conn, 'PUT', '/_cluster/settings', objectArg(args, 'body'));
    case 'es_reroute': {
      const p = new URLSearchParams();
      if (args.dryRun) p.set('dry_run', 'true');
      if (args.explain != null) p.set('explain', args.explain ? 'true' : 'false');
      if (args.retryFailed) p.set('retry_failed', 'true');
      const qs = p.toString();
      return es(conn, 'POST', '/_cluster/reroute' + (qs ? '?' + qs : ''), objectArg(args, 'body'));
    }
    case 'es_list_snapshot_repos': {
      const raw = await es(conn, 'GET', '/_snapshot');
      return Object.entries(raw || {}).map(([name, meta]) => ({
        name, type: meta?.type, settings: meta?.settings,
      }));
    }
    case 'es_put_snapshot_repo':
      return es(conn, 'PUT', '/_snapshot/' + encodeURIComponent(required(args, 'repo')), args.body);
    case 'es_delete_snapshot_repo':
      return es(conn, 'DELETE', '/_snapshot/' + encodeURIComponent(required(args, 'repo')));
    case 'es_list_snapshots': {
      const raw = await es(conn, 'GET',
        `/_snapshot/${encodeURIComponent(required(args, 'repo'))}/_all?ignore_unavailable=true`);
      return Array.isArray(raw?.snapshots) ? raw.snapshots : [];
    }
    case 'es_snapshot_status': {
      const repo = String(args.repo || '').trim();
      const name = String(args.name || '').trim();
      const p = !repo ? '/_snapshot/_status'
        : !name ? `/_snapshot/${encodeURIComponent(repo)}/_current/_status`
        : `/_snapshot/${encodeURIComponent(repo)}/${encodeURIComponent(name)}/_status`;
      return es(conn, 'GET', p);
    }
    case 'es_create_snapshot': {
      const p = `/_snapshot/${encodeURIComponent(required(args, 'repo'))}/${encodeURIComponent(required(args, 'name'))}?wait_for_completion=false`;
      const body = args.body == null || String(args.body).trim() === '' ? undefined : objectArg(args, 'body');
      return es(conn, 'PUT', p, body);
    }
    case 'es_delete_snapshot':
      return es(conn, 'DELETE',
        `/_snapshot/${encodeURIComponent(required(args, 'repo'))}/${encodeURIComponent(required(args, 'name'))}`);
    case 'es_restore_snapshot': {
      const p = `/_snapshot/${encodeURIComponent(required(args, 'repo'))}/${encodeURIComponent(required(args, 'name'))}/_restore?wait_for_completion=false`;
      const body = args.body == null || String(args.body).trim() === '' ? undefined : objectArg(args, 'body');
      return es(conn, 'POST', p, body);
    }
    case 'es_ilm_policies': {
      const raw = await es(conn, 'GET', '/_ilm/policy');
      return Object.entries(raw || {}).map(([name, meta]) => ({ name, ...(meta || {}) }));
    }
    case 'es_ilm_explain':
      return es(conn, 'GET', `/${encodeURIComponent(required(args, 'index'))}/_ilm/explain`);
    case 'es_ilm_status':
      return es(conn, 'GET', '/_ilm/status');
    case 'es_put_ilm_policy':
      return es(conn, 'PUT', `/_ilm/policy/${encodeURIComponent(required(args, 'name'))}`,
        objectArg(args, 'policy'));
    case 'es_delete_ilm_policy':
      return es(conn, 'DELETE', `/_ilm/policy/${encodeURIComponent(required(args, 'name'))}`);
    case 'es_ilm_move':
      return es(conn, 'POST', `/_ilm/move/${encodeURIComponent(required(args, 'index'))}`,
        objectArg(args, 'body'));
    case 'es_ilm_start':
      return es(conn, 'POST', '/_ilm/start', {});
    case 'es_ilm_stop':
      return es(conn, 'POST', '/_ilm/stop', {});
    case 'es_list_scripts': {
      const raw = await es(conn, 'GET',
        '/_cluster/state/metadata?filter_path=metadata.stored_scripts');
      const scripts = raw?.metadata?.stored_scripts || {};
      return { scripts, count: Object.keys(scripts).length };
    }
    case 'es_put_script':
      return es(conn, 'PUT', `/_scripts/${encodeURIComponent(required(args, 'id'))}`,
        objectArg(args, 'script'));
    case 'es_delete_script':
      return es(conn, 'DELETE', `/_scripts/${encodeURIComponent(required(args, 'id'))}`);
    case 'es_task_detail':
      return es(conn, 'GET',
        `/_tasks/${encodeURIComponent(required(args, 'taskId'))}?wait_for_completion=false`);
    case 'es_index_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      const document = objectArg(args, 'document');
      return es(conn, 'PUT', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}?refresh=true`, document);
    }
    case 'es_update_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      const partial = objectArg(args, 'document');
      try {
        return await es(conn, 'POST', `/${encodeURIComponent(index)}/_update/${encodeURIComponent(id)}?refresh=true`, { doc: partial });
      } catch (e) {
        /* ES 6.x 的 _update 路由必须携带 type；_doc 是该版本的单类型约定。 */
        if (e.httpStatus === 400 && majorOf(await versionOf(conn)) < 7) {
          return es(conn, 'POST', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}/_update?refresh=true`, { doc: partial });
        }
        throw e;
      }
    }
    case 'es_delete_doc': {
      const index = required(args, 'index');
      const id = required(args, 'id');
      return es(conn, 'DELETE', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`);
    }
    case 'es_rest': {
      const method = required(args, 'method').toUpperCase();
      const path = required(args, 'path');
      if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error(`Unsupported method: ${method}`);
      if (!path.startsWith('/') || path.includes('..')) throw new Error('path must start with / and must not contain ..');
      if (!isReadRest(method, path) && !allowWrite) {
        throw new Error('Write tools are disabled: raw ' + method + ' ' + path + ' requires --allow-write');
      }
      return es(conn, method, path, args.body);
    }
    /* 托管重建：本地 stdio 编排（scroll+bulk 搬运 + 台账 + 别名切换），不再依赖服务端控制台。 */
    case 'es_adhoc_prepare':
      return adhocPrepare(conn, args);
    case 'es_adhoc_start':
      return adhocStart(conn, args);
    case 'es_adhoc_status':
      return jobSnapshot(requireLedgerJob('adhoc', required(args, 'jobId')));
    case 'es_adhoc_abort':
      return abortLedgerJob('adhoc', required(args, 'jobId'));
    case 'es_adhoc_confirm_switch':
      return adhocConfirmSwitch(conn, args);
    case 'es_adhoc_jobs':
      return jobList('adhoc', args);
    case 'es_adhoc_retry':
      return adhocRetry(conn, args);
    case 'es_adhoc_delete_jobs':
      return deleteLedgerJobs('adhoc', args);
    case 'es_adhoc_throttle': {
      const job = requireLedgerJob('adhoc', required(args, 'jobId'));
      return {
        jobId: job.jobId, status: job.status, supported: false,
        detail: '本地搬运按批节奏推进，没有 task 级调速接口；可通过 abort 后调低 batchSize 再 retry 缓解（retry 按 create 跳过已迁移文档）',
      };
    }
    case 'es_adhoc_events': {
      const job = requireLedgerJob('adhoc', required(args, 'jobId'));
      return { jobId: job.jobId, status: job.status, events: job.events.slice() };
    }
    /* 跨集群迁移：源/目标按本地连接档案直连搬运，不再依赖 reindex.remote 白名单。 */
    case 'es_xmigrate_probe_capabilities':
      return xmigrateProbeCapabilities(args);
    case 'es_xmigrate_preflight':
      return xmigratePreflight(conn, args);
    case 'es_xmigrate_start':
      return xmigrateStart(conn, args);
    case 'es_xmigrate_status':
      return jobSnapshot(requireLedgerJob('xmigrate', required(args, 'jobId')));
    case 'es_xmigrate_jobs':
      return jobList('xmigrate', args);
    case 'es_xmigrate_fetch_config':
      return xmigrateFetchConfig(args);
    case 'es_xmigrate_resume':
      return xmigrateResume(args);
    case 'es_xmigrate_abort':
      return abortLedgerJob('xmigrate', required(args, 'jobId'));
    case 'es_xmigrate_conflicts': {
      const job = requireLedgerJob('xmigrate', required(args, 'jobId'));
      /* 返回形态对齐服务端 McpController：{jobId, conflicts, conflictSamples, sampleCap, note} */
      return {
        jobId: job.jobId,
        conflicts: Number(job.conflicts) || 0,
        conflictSamples: Array.isArray(job.conflictSamples) ? job.conflictSamples.slice() : [],
        sampleCap: CONFLICT_SAMPLES_MAX,
        note: '冲突 _id 样本为环形收集，上限 1000 条；总冲突数见 conflicts 字段',
      };
    }
    case 'es_xmigrate_connect_check':
      return xmigrateConnectCheck(args);
    case 'es_xmigrate_resolve_preview':
      return xmigrateResolvePreview(args);
    case 'es_xmigrate_dest_indices':
      return xmigrateDestIndices(args);
    case 'es_xmigrate_delete_jobs':
      return deleteLedgerJobs('xmigrate', args);
    case 'es_xmigrate_sync_structure':
      return xmigrateSyncStructure(args);
    case 'es_xmigrate_compare_capabilities':
      return xmigrateCompareCapabilities(args);
    case 'es_xmigrate_diff_structure':
      return xmigrateDiffStructure(args);
    case 'es_xmigrate_verify_equivalence':
      return xmigrateVerifyEquivalence(args);
    case 'es_xmigrate_throttle':
      return xmigrateThrottle(args);
    case 'es_xmigrate_reconcile': {
      /* 双 profile 组合对账：源/目标各走一次 low-level _count（跨大版本稳定），
         连接档案来自本地 config，凭据不出本进程。 */
      const srcConnId = required(args, 'srcConnId');
      const srcConn = byId.get(srcConnId);
      if (!srcConn) throw new Error(`Unknown source connection: ${srcConnId}`);
      const destConnId = required(args, 'destConnId');
      const destConn = destConnId === 'host' ? conn : byId.get(destConnId);
      if (!destConn) throw new Error(`Unknown connection: ${destConnId}`);
      const sourceIndex = required(args, 'sourceIndex');
      const destIndex = required(args, 'destIndex');
      const src = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_count`);
      const dst = await es(destConn, 'GET', `/${encodeURIComponent(destIndex)}/_count`);
      const srcCount = Number(src?.count);
      const destCount = Number(dst?.count);
      return {
        sourceIndex, destConnId, destIndex, srcCount, destCount,
        diff: Number.isFinite(srcCount) && Number.isFinite(destCount) ? srcCount - destCount : null,
      };
    }
    case 'es_connection_probe': {
      /* 本地档案直连探活：GET / 测连通与时延（与 ConnHealthProber.pingOnce 同口径），
         顺带尽力读 health 的状态与节点数，失败不阻断探活结果。 */
      const t0 = Date.now();
      const root = await es(conn, 'GET', '/');
      const out = {
        status: 'GREEN',
        latencyMs: Date.now() - t0,
        lastProbeAt: Date.now(),
        error: null,
        version: root?.version?.number || null,
        clusterName: root?.cluster_name ?? null,
        connection: conn.id,
      };
      try {
        const health = await es(conn, 'GET', '/_cluster/health');
        out.health = health?.status ?? null;
        out.nodes = health?.number_of_nodes ?? null;
      } catch { /* 有的账号无 health 权限：info 已通即算连通 */ }
      return out;
    }
    /* 监控时序/探活历史依赖服务端定时采集落库（esquerystudio_monitor-*），
       本地 stdio 没有采集面，诚实报错而不是返回伪造空时序。 */
    case 'es_monitor_metrics':
    case 'es_monitor_history':
      throw new Error('Monitor series are collected by the server console scheduler; use server mode /mcp or the browser bridge');
    /* 配置实验室的校验/漂移规则与代码注解注册表都在服务端控制台（浏览器桥有本机等价物），
       本地 stdio 不移植这套规则面，诚实报错而不是返回伪通过。 */
    case 'es_config_validate':
    case 'es_config_drift':
      throw new Error('Config lab rules and code-annotation registry live in the server console; use server mode /mcp or the browser bridge');
    /* 操作审计流水在服务端控制台的审计存储里（浏览器桥有本地留档等价物），本地 stdio 无台账。 */
    case 'es_ops_audit':
      throw new Error('Ops audit ledger lives in the server console store; use server mode /mcp or the browser bridge');
    /* settings 影响分析的分类表/门禁/预估引擎在服务端（浏览器桥有本机等价物），本地不移植。 */
    case 'es_insight_settings_impact':
      throw new Error('Settings impact analysis rules live in the server console; use server mode /mcp or the browser bridge');
    /* 环形治理用量读的是服务端审计+监控索引族的存储占用，本地 stdio 没有这两个索引族。 */
    case 'es_ring_usage':
      throw new Error('Ring usage reads server-collected audit/monitor index families; use server mode /mcp or the browser bridge');
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/* ================= 本地作业台账与搬运编排 =================
   es_adhoc_rebuild / es_xmigrate 两组 action 的本地实现：数据面用源连接 scroll 分页
   读取 + 目标连接 _bulk 写入（不依赖 reindex.remote 白名单），作业状态持久化在
   ~/.esquerystudio/local-mcp/jobs.json（可用 ESQ_MCP_JOBS_FILE 覆盖，便于测试隔离）。 */

const JOBS_FILE = process.env.ESQ_MCP_JOBS_FILE
  || join(homedir(), '.esquerystudio', 'local-mcp', 'jobs.json');
const LEDGER_MAX_JOBS = 100;
const LEDGER_EVENTS_MAX = 200;
const CONFLICT_SAMPLES_MAX = 1000;
const TRANSFER_SCROLL = '2m';
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** 活跃推进态：进程退出后无法继续，启动加载时标记为中断。 */
const JOB_ACTIVE = new Set(['PREPARING', 'RUNNING', 'SWITCHING']);
const JOB_TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'INTERRUPTED']);
const STOP_FLAGS = new Set();
const LEDGER = { adhoc: [], xmigrate: [] };
let ledgerDurable = true;

function newJobId(type) {
  return `${type === 'adhoc' ? 'adhoc' : 'xmgr'}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function jobEvent(job, stage, status, detail) {
  job.events.push({ ts: Date.now(), stage, status, detail: String(detail ?? '') });
  if (job.events.length > LEDGER_EVENTS_MAX) job.events.splice(0, job.events.length - LEDGER_EVENTS_MAX);
}

/** 加载台账：上次仍在推进的作业标 INTERRUPTED（进程退出即编排停止）。 */
function loadLedger() {
  let raw = null;
  try { raw = JSON.parse(readFileSync(JOBS_FILE, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') ledgerDurable = false;
  }
  for (const type of ['adhoc', 'xmigrate']) {
    const list = Array.isArray(raw?.[type]) ? raw[type] : [];
    for (const job of list) {
      if (JOB_ACTIVE.has(job.status)) {
        job.status = 'INTERRUPTED';
        job.finishedAt = Date.now();
        job.events = Array.isArray(job.events) ? job.events : [];
        jobEvent(job, 'startup', 'INTERRUPTED', '上次进程退出时作业仍在推进，标记为中断；可用 retry/resume 续跑');
      }
    }
    LEDGER[type] = list;
  }
}

function saveLedger() {
  if (!ledgerDurable) return;
  try {
    mkdirSync(join(JOBS_FILE, '..'), { recursive: true });
    writeFileSync(JOBS_FILE, JSON.stringify(LEDGER), 'utf8');
  } catch {
    /* 磁盘只读/受限时降级为内存台账，调用结果里如实说明，不影响编排本身。 */
    ledgerDurable = false;
  }
}

function ledgerJobs(type) { return LEDGER[type] || []; }

function requireLedgerJob(type, jobId) {
  const job = ledgerJobs(type).find((j) => j.jobId === jobId);
  if (!job) throw new Error(`Unknown ${type} job: ${jobId}`);
  return job;
}

function pushJob(type, job) {
  const list = LEDGER[type];
  list.unshift(job);
  if (list.length > LEDGER_MAX_JOBS) list.length = LEDGER_MAX_JOBS;
  saveLedger();
}

function ledgerNote() {
  return ledgerDurable ? null : '台账磁盘不可写，已降级为进程内存台账（进程退出后作业记录丢失）';
}

/** 对外快照：剥离大数组（事件/冲突样本全量），保留计数与最近事件。 */
function jobSnapshot(job) {
  const events = Array.isArray(job.events) ? job.events : [];
  const samples = Array.isArray(job.conflictSamples) ? job.conflictSamples : [];
  const { events: _e, conflictSamples: _c, ...rest } = job;
  return {
    ...rest,
    progressPercent: job.totalDocs > 0 ? Math.min(100, Math.round((job.migrated / job.totalDocs) * 100)) : null,
    eventsCount: events.length,
    recentEvents: events.slice(-5),
    conflictSampleCount: samples.length,
    ...(ledgerNote() ? { ledgerNote: ledgerNote() } : {}),
  };
}

function jobList(type, args) {
  const limit = Math.max(1, Math.min(500, Number(args?.limit) || 20));
  return ledgerJobs(type).slice(0, limit).map(jobSnapshot);
}

function abortLedgerJob(type, jobId) {
  const job = requireLedgerJob(type, jobId);
  if (JOB_TERMINAL.has(job.status)) {
    return { jobId, status: job.status, detail: '作业已处于终态，无需中止' };
  }
  STOP_FLAGS.add(jobId);
  if (job.status === 'AWAIT_CONFIRM') {
    job.status = 'ABORTED';
    job.finishedAt = Date.now();
    job.updatedAt = Date.now();
    jobEvent(job, 'abort', 'ABORTED', '切换确认门前中止');
    saveLedger();
    return { jobId, status: job.status };
  }
  return { jobId, status: job.status, detail: '已登记中止标记，后台搬运在当前页结束后停止' };
}

/** 删除终态作业：jobId 单删或 olderThanDays 按完成时间清理。 */
function deleteLedgerJobs(type, args) {
  const jobId = String(args?.jobId || '').trim();
  const hasAge = args?.olderThanDays != null && String(args.olderThanDays).trim() !== '';
  if ((jobId ? 1 : 0) + (hasAge ? 1 : 0) !== 1) {
    throw new Error('jobId 与 olderThanDays 必须二选一');
  }
  if (jobId) {
    const job = requireLedgerJob(type, jobId);
    if (!JOB_TERMINAL.has(job.status)) {
      throw new Error(`仅终态作业可删除，当前状态 ${job.status}（请先 abort）`);
    }
    LEDGER[type] = ledgerJobs(type).filter((j) => j.jobId !== jobId);
    saveLedger();
    return { deleted: 1, jobId };
  }
  const days = Number(args.olderThanDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error('olderThanDays 必须为正整数');
  const cutoff = Date.now() - days * 86_400_000;
  const keep = [];
  let deleted = 0;
  for (const job of ledgerJobs(type)) {
    if (JOB_TERMINAL.has(job.status) && (job.finishedAt || 0) < cutoff) { deleted += 1; continue; }
    keep.push(job);
  }
  LEDGER[type] = keep;
  saveLedger();
  return { deleted, olderThanDays: days };
}

function baseJob(type, fields) {
  return {
    jobId: newJobId(type), type, status: 'RUNNING', writeMode: 'index',
    createdAt: Date.now(), updatedAt: Date.now(), startedAt: Date.now(), finishedAt: null,
    migrated: 0, conflicts: 0, errors: 0, pages: 0, totalDocs: null,
    conflictSamples: [], events: [], error: null, lastBulkError: null,
    ...fields,
  };
}

function optionalObjectArg(args, key) {
  const value = args?.[key];
  if (value == null || String(value).trim() === '') return null;
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${key} must be an object`);
  return parsed;
}

function batchSizeOf(raw) {
  const n = Number(raw);
  return Math.max(1, Math.min(10000, Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000));
}

/** 时间字段候选：递归收集 mapping 里的 date 字段（INCREMENTAL 追补用）。 */
function dateFieldsOf(props, prefix) {
  const out = [];
  for (const [name, def] of Object.entries(props || {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (def?.type === 'date') out.push(path);
    else if (def?.properties) out.push(...dateFieldsOf(def.properties, path));
  }
  return out;
}

/** _mapping/_settings 响应按物理索引名作 key；别名解析到多个物理索引时不支持单作业重建。 */
function physicalIndexFrom(raw, requested) {
  const keys = Object.keys(raw || {});
  if (!keys.length) throw new Error(`无法解析 ${requested} 对应的物理索引`);
  if (keys.length > 1) throw new Error(`${requested} 解析到多个物理索引（${keys.join(', ')}），一次作业只支持单个物理索引`);
  return keys[0];
}

/** 建目标索引可用的 settings：剔除 ES 生成字段（uuid/creation_date/provided_name/version）。 */
function cleanIndexSettings(settingsRaw, physical) {
  const indexSettings = settingsRaw?.[physical]?.settings?.index || {};
  const out = {};
  for (const [key, value] of Object.entries(indexSettings)) {
    if (key === 'uuid' || key === 'creation_date' || key === 'provided_name' || key === 'version') continue;
    out[key] = value;
  }
  return out;
}

/** mapping 复刻：6.x 原样保留 type 包装；7+ 展开单 type（如 _doc）。 */
function remapMappings(mappings, major) {
  const m = mappings || {};
  if (major > 0 && major < 7) return m;
  const keys = Object.keys(m);
  if (keys.length === 1 && keys[0] !== 'properties' && m[keys[0]]?.properties) return m[keys[0]];
  return m;
}

async function indexExists(conn, index) {
  try {
    await es(conn, 'GET', `/${encodeURIComponent(index)}/_settings`);
    return true;
  } catch (e) {
    if (e.httpStatus === 404) return false;
    throw e;
  }
}

/** 目标索引准备：NONE 要求已存在直接搬入；COPY_FROM_SOURCE 按源 settings/mapping 复刻创建，
    两种模式都不覆盖既有索引（已存在 + COPY_FROM_SOURCE = 报错指路）。
    compat=true（跨集群 xmigrate start 路径）：复刻体建索引前按目标探测快照跑兼容矩阵预剔除
    （vendor-private/缺失插件分析组件/ILM 等，与 sync_structure 同一套矩阵）；探测或矩阵
    任一失败降级为原样复刻，不阻断建索引。 */
async function ensureDestIndex(destConn, srcConn, sourceIndex, destIndex, mode, settingsOverride, mappingOverride, compat = false) {
  const exists = await indexExists(destConn, destIndex);
  if (exists && mode === 'NONE') return { created: false, note: `目标索引已存在: ${destIndex}（NONE 模式直接搬入）` };
  if (exists) {
    throw new Error(`目标索引已存在: ${destIndex}；不覆盖既有索引。请更换 destIndex、改用 destCreateMode=NONE，或 resume/retry 既有作业`);
  }
  if (mode === 'NONE') {
    throw new Error(`目标索引不存在: ${destIndex}（NONE 模式不创建索引；请先建好目标或改用 COPY_FROM_SOURCE）`);
  }
  const settingsRaw = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_settings`);
  const physical = physicalIndexFrom(settingsRaw, sourceIndex);
  const mappingRaw = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_mapping`);
  let settings = settingsOverride && Object.keys(settingsOverride).length
    ? settingsOverride : cleanIndexSettings(settingsRaw, physical);
  const major = majorOf(await versionOf(destConn));
  let mappings = mappingOverride && Object.keys(mappingOverride).length
    ? mappingOverride : remapMappings(mappingRaw?.[physical]?.mappings, major);
  let compatNote = '';
  if (compat && !settingsOverride && !mappingOverride) {
    try {
      const [srcCaps, dstCaps] = await Promise.all([
        probeSide(srcConn).catch(() => null),
        probeSide(destConn).catch(() => null),
      ]);
      if (srcCaps && dstCaps) {
        const flat = {};
        for (const [key, value] of Object.entries(settings)) {
          flat[key.startsWith('index.') ? key : 'index.' + key] = value;
        }
        for (const key of SYNC_VOLATILE_SETTINGS) delete flat[key];
        const analysis = syncSplitAnalysis(flat) || {};
        const missingIlmPolicies = await missingIlmCheck(destConn, flat);
        applyCompatMatrix({
          settings: flat, analysis, props: mappings.properties || {},
          targetPlugins: dstCaps.plugins ?? null,
          dataNodeCount: dstCaps.dataNodeCount ?? null,
          missingIlmPolicies, fallback: 'standard',
          sourceVendor: srcCaps.vendor?.id ?? null,
          targetVendor: dstCaps.vendor?.id ?? null,
        });
        const nested = syncNestSettings(flat, analysis);
        if (nested) settings = nested;
        compatNote = '，已按兼容矩阵预剔除跨集群不兼容项';
      }
    } catch { /* 探测/矩阵失败降级原样复刻，不阻断建索引 */ }
  }
  if (major > 0 && major < 7) mappings = { _doc: mappings };
  const body = {};
  if (settings && Object.keys(settings).length) body.settings = settings;
  if (mappings && Object.keys(mappings).length) body.mappings = mappings;
  await es(destConn, 'PUT', `/${encodeURIComponent(destIndex)}`, Object.keys(body).length ? body : undefined);
  return { created: true, note: `目标索引已创建: ${destIndex}（settings 剔除 uuid/creation_date/provided_name/version，mapping 复刻源${compatNote}）` };
}

/** 搬运内核：源连接 scroll 分页 → 目标连接 _bulk。
    writeMode=index 覆盖式搬运（start）；create 遇目标已存在文档记 409 冲突并跳过（resume/retry 增量路径）。
    后台异步推进：每页写台账，abort 通过 STOP_FLAGS 生效。 */
async function transferLoop(job, srcConn, dstConn) {
  const finishWith = async (status, detail) => {
    job.status = status;
    job.finishedAt = Date.now();
    job.updatedAt = Date.now();
    jobEvent(job, 'transfer', status, detail);
    saveLedger();
  };
  try {
    const first = await es(srcConn, 'POST',
      `/${encodeURIComponent(job.sourceIndex)}/_search?scroll=${TRANSFER_SCROLL}`,
      { size: job.batchSize, query: { match_all: {} } });
    let scrollId = first?._scroll_id || null;
    let hits = first?.hits?.hits || [];
    for (;;) {
      if (STOP_FLAGS.has(job.jobId)) {
        STOP_FLAGS.delete(job.jobId);
        await finishWith('ABORTED', '收到中止请求，搬运停止');
        return;
      }
      if (!hits.length) break;
      const batchStarted = Date.now();
      const lines = [];
      for (const hit of hits) {
        const meta = { _index: job.destIndex };
        if (hit._id != null) meta._id = String(hit._id);
        lines.push(JSON.stringify({ [job.writeMode]: meta }));
        lines.push(JSON.stringify(hit._source ?? {}));
      }
      const bulk = await es(dstConn, 'POST', '/_bulk', lines.join('\n') + '\n', 'application/x-ndjson');
      countBulk(job, bulk, hits);
      job.pages += 1;
      job.updatedAt = Date.now();
      saveLedger();
      /* 节流：每批重读作业对象当前 throttleRps（throttle 运行中改值下一批即生效），
         本批耗时不足目标节拍（本批文档数 / rps）时补足等待 */
      const rps = Number(job.throttleRps);
      if (rps > 0 && hits.length > 0) {
        const targetMs = (hits.length / rps) * 1000;
        const spent = Date.now() - batchStarted;
        if (targetMs > spent) await sleepMs(targetMs - spent);
      }
      if (!scrollId) break;
      const next = await es(srcConn, 'POST', '/_search/scroll', { scroll: TRANSFER_SCROLL, scroll_id: scrollId });
      scrollId = next?._scroll_id || scrollId;
      hits = next?.hits?.hits || [];
    }
    if (scrollId) {
      try { await es(srcConn, 'DELETE', '/_search/scroll', { scroll_id: [scrollId] }); }
      catch { /* scroll 上下文清理失败不影响搬运结果 */ }
    }
    await afterTransfer(job, dstConn);
  } catch (e) {
    await finishWith('FAILED', '搬运失败: ' + String(e?.message || e));
  }
}

/** bulk 响应逐条统计：created/updated 计 migrated；409 计 conflicts（样本环封顶 1000）；其余计 errors。 */
function countBulk(job, bulk, hits) {
  const items = Array.isArray(bulk?.items) ? bulk.items : [];
  if (!items.length) {
    job.migrated += hits.length;
    return;
  }
  items.forEach((item, i) => {
    const op = item?.index || item?.create || {};
    const id = op._id ?? (hits[i]?._id == null ? '' : String(hits[i]._id));
    if (op.status === 409 || String(op?.error?.type || '').includes('version_conflict')) {
      job.conflicts += 1;
      if (id) {
        job.conflictSamples.push(id);
        if (job.conflictSamples.length > CONFLICT_SAMPLES_MAX) job.conflictSamples.shift();
      }
    } else if (op.error) {
      job.errors += 1;
      if (!job.lastBulkError) {
        job.lastBulkError = `${op.error.type || 'bulk_error'}: ${op.error.reason || ''}`;
      }
    } else {
      job.migrated += 1;
    }
  });
}

/** 搬运完成后的收尾：adhoc 走切换门/别名切换；xmigrate 可选 force merge 后直接终态。 */
async function afterTransfer(job, dstConn) {
  if (job.type === 'adhoc') {
    if (job.pauseBeforeSwitch) {
      job.status = 'AWAIT_CONFIRM';
      job.updatedAt = Date.now();
      jobEvent(job, 'transfer', 'AWAIT_CONFIRM', `搬运完成（migrated=${job.migrated}），等待 confirm_switch 释放别名切换`);
      saveLedger();
      return;
    }
    await switchAdhocAliases(job, dstConn);
    return;
  }
  if (job.forceMerge) {
    try {
      await es(dstConn, 'POST', `/${encodeURIComponent(job.destIndex)}/_forcemerge?max_num_segments=1`);
      jobEvent(job, 'transfer', 'RUNNING', '目标索引 force merge 完成');
    } catch (e) {
      jobEvent(job, 'transfer', 'RUNNING', 'force merge 失败（不影响搬运结果）: ' + String(e?.message || e));
    }
  }
  job.status = 'SUCCEEDED';
  job.finishedAt = Date.now();
  job.updatedAt = Date.now();
  jobEvent(job, 'transfer', 'SUCCEEDED', `搬运完成 migrated=${job.migrated} conflicts=${job.conflicts} errors=${job.errors}`);
  saveLedger();
}

/** 别名切换：源索引上的每个别名先 remove 再 add 到目标（读取别名保持不变、顺序保留）；
    源无别名时给目标补一个与源物理名同名的别名；deleteOldIndex 可选删除旧物理索引。 */
async function switchAdhocAliases(job, conn) {
  job.status = 'SWITCHING';
  job.updatedAt = Date.now();
  saveLedger();
  let aliases = {};
  try {
    const raw = await es(conn, 'GET', `/${encodeURIComponent(job.sourcePhysicalIndex)}/_alias`);
    aliases = raw?.[job.sourcePhysicalIndex]?.aliases || {};
  } catch (e) {
    if (e.httpStatus !== 404) throw e;
  }
  const names = Object.keys(aliases);
  const actions = names.length
    ? names.flatMap((alias) => [
      { remove: { index: job.sourcePhysicalIndex, alias } },
      { add: { index: job.destIndex, alias } },
    ])
    : [{ add: { index: job.destIndex, alias: job.sourcePhysicalIndex } }];
  await es(conn, 'POST', '/_aliases', { actions });
  jobEvent(job, 'switch', 'SWITCHING',
    `别名切换完成: ${names.length ? names.join(', ') : `${job.sourcePhysicalIndex}（源无别名，目标补同名别名）`}`);
  if (job.deleteOldIndex) {
    await es(conn, 'DELETE', `/${encodeURIComponent(job.sourcePhysicalIndex)}`);
    jobEvent(job, 'switch', 'SWITCHING', `旧物理索引已删除: ${job.sourcePhysicalIndex}`);
  }
  job.status = 'SUCCEEDED';
  job.finishedAt = Date.now();
  job.updatedAt = Date.now();
  jobEvent(job, 'switch', 'SUCCEEDED', `重建完成 dest=${job.destIndex} migrated=${job.migrated}`);
  saveLedger();
}

/** xmigrate 源连接：只认本地 config 里的连接档案 id，不接受内联凭据。 */
function sourceConnOf(args) {
  const srcConnId = required(args, 'srcConnId');
  const conn = byId.get(srcConnId);
  if (!conn) throw new Error(`Unknown source connection: ${srcConnId}`);
  return conn;
}

/** xmigrate 目标连接：host 或缺省 = 默认连接，否则按 config id 解析。 */
function destConnOf(args) {
  const destConnId = String(args?.destConnId || '').trim();
  if (!destConnId || destConnId === 'host') return connectionOf(args);
  const conn = byId.get(destConnId);
  if (!conn) throw new Error(`Unknown connection: ${destConnId}`);
  return conn;
}

async function adhocPrepare(conn, args) {
  const index = required(args, 'index');
  const mappingRaw = await es(conn, 'GET', `/${encodeURIComponent(index)}/_mapping`);
  const physical = physicalIndexFrom(mappingRaw, index);
  const settingsRaw = await es(conn, 'GET', `/${encodeURIComponent(index)}/_settings`);
  const aliasRaw = await es(conn, 'GET', `/${encodeURIComponent(index)}/_alias`);
  const count = await es(conn, 'GET', `/${encodeURIComponent(index)}/_count`);
  const mappings = mappingRaw?.[physical]?.mappings || {};
  const props = mappings?.properties || mappings?._doc?.properties || {};
  return {
    index,
    physicalIndex: physical,
    aliasForm: Object.keys(aliasRaw?.[physical]?.aliases || {}),
    settings: settingsRaw?.[physical]?.settings?.index || {},
    mappings,
    docCount: Number(count?.count ?? 0),
    suggestedDestIndex: `reindex-${physical}`,
    timeFieldCandidates: dateFieldsOf(props),
    detail: '本地 stdio 编排：start 后 scroll+bulk 搬运，别名切换在搬运完成后执行',
    ...(ledgerNote() ? { ledgerNote: ledgerNote() } : {}),
  };
}

async function adhocStart(conn, args) {
  const index = required(args, 'index');
  const strategy = String(args.strategy || 'INCREMENTAL').toUpperCase();
  if (!['INCREMENTAL', 'WRITE_BLOCK', 'MANUAL'].includes(strategy)) {
    throw new Error('strategy must be INCREMENTAL, WRITE_BLOCK or MANUAL');
  }
  const mappingRaw = await es(conn, 'GET', `/${encodeURIComponent(index)}/_mapping`);
  const physical = physicalIndexFrom(mappingRaw, index);
  const destIndex = String(args.destIndex || '').trim() || `reindex-${physical}`;
  if (destIndex === physical) throw new Error(`destIndex 不能等于源物理索引: ${physical}`);
  const count = await es(conn, 'GET', `/${encodeURIComponent(index)}/_count`);
  const ensure = await ensureDestIndex(conn, conn, physical, destIndex, 'COPY_FROM_SOURCE',
    optionalObjectArg(args, 'settingsJson'), optionalObjectArg(args, 'mappingJson'));
  const job = baseJob('adhoc', {
    connId: conn.id, sourceIndex: physical, sourcePhysicalIndex: physical, destIndex, strategy,
    batchSize: batchSizeOf(args.batchSize),
    pauseBeforeSwitch: args.pauseBeforeSwitch === true,
    deleteOldIndex: args.deleteOldIndex === true,
    timeField: String(args.timeField || '').trim() || null,
    totalDocs: Number(count?.count ?? 0) || null,
  });
  jobEvent(job, 'prepare', 'RUNNING', `源=${physical} 目标=${destIndex}（${ensure.note}）；本地编排按单一路径执行，strategy=${strategy} 仅记录，timeField/bufferMs 增量追补不适用`);
  pushJob('adhoc', job);
  transferLoop(job, conn, conn);
  return {
    jobId: job.jobId, status: job.status, sourceIndex: physical, destIndex, strategy,
    totalDocs: job.totalDocs, batchSize: job.batchSize,
    ...(ledgerNote() ? { detail: ledgerNote() } : {}),
  };
}

async function adhocConfirmSwitch(conn, args) {
  const job = requireLedgerJob('adhoc', required(args, 'jobId'));
  if (job.status !== 'AWAIT_CONFIRM') {
    throw new Error(`作业状态为 ${job.status}，只有 AWAIT_CONFIRM 状态才能确认切换`);
  }
  const jobConn = byId.get(job.connId) || conn;
  await switchAdhocAliases(job, jobConn);
  return jobSnapshot(job);
}

/** retry：终态作业原地续跑，create 模式重扫——目标已存在的文档按 409 跳过，migrated 保留基线。 */
function adhocRetry(conn, args) {
  const job = requireLedgerJob('adhoc', required(args, 'jobId'));
  if (!JOB_TERMINAL.has(job.status)) throw new Error(`作业状态为 ${job.status}，仅终态作业可 retry`);
  const jobConn = byId.get(job.connId) || conn;
  job.status = 'RUNNING';
  job.writeMode = 'create';
  job.error = null;
  job.finishedAt = null;
  job.updatedAt = Date.now();
  jobEvent(job, 'retry', 'RUNNING', `从已迁移 ${job.migrated} 条基线续跑（create 跳过目标已存在文档）`);
  saveLedger();
  transferLoop(job, jobConn, jobConn);
  return { jobId: job.jobId, status: job.status, migratedBaseline: job.migrated };
}

async function xmigrateConnectCheck(args) {
  const srcConn = sourceConnOf(args);
  const out = {
    srcConnId: srcConn.id, name: srcConn.name, reachable: true,
    version: null, clusterName: null, total: 0, indices: [],
  };
  try {
    const root = await es(srcConn, 'GET', '/');
    out.version = root?.version?.number || null;
    out.clusterName = root?.cluster_name ?? null;
    const rows = await es(srcConn, 'GET',
      '/_cat/indices?format=json&h=index,health,status,docs.count,store.size');
    const indices = (Array.isArray(rows) ? rows : [])
      .filter((r) => !String(r.index || '').startsWith('.'))
      .sort((a, b) => String(a.index).localeCompare(String(b.index)));
    out.total = indices.length;
    out.indices = indices.slice(0, 50);
    return out;
  } catch (e) {
    out.reachable = false;
    out.error = String(e?.message || e);
    return out;
  }
}

function xmigrateResolvePreview(args) {
  const srcConn = sourceConnOf(args);
  let parsed = null;
  try { parsed = new URL(srcConn.url); } catch { parsed = null; }
  return {
    srcConnId: srcConn.id,
    url: srcConn.url.replace(/\/\/[^@/]+@/, '//***@'),
    protocol: parsed ? parsed.protocol.replace(':', '') : null,
    host: parsed?.hostname || null,
    port: parsed ? (parsed.port || (parsed.protocol === 'https:' ? '443' : '80')) : null,
    basicAuthConfigured: Boolean(parsed?.username),
    apiKeyConfigured: Boolean(srcConn.apiKey),
  };
}

async function xmigrateDestIndices(args) {
  const destConn = destConnOf(args);
  const rows = await es(destConn, 'GET',
    '/_cat/indices?format=json&h=index,health,status,docs.count,store.size');
  const indices = (Array.isArray(rows) ? rows : [])
    .filter((r) => !String(r.index || '').startsWith('.'))
    .sort((a, b) => String(a.index).localeCompare(String(b.index)));
  return { destConnId: destConn.id, total: indices.length, indices };
}

async function xmigratePreflight(conn, args) {
  const srcConn = sourceConnOf(args);
  const sourceIndex = required(args, 'sourceIndex');
  const destIndex = required(args, 'destIndex');
  const destConn = destConnOf(args);
  const destExists = await indexExists(destConn, destIndex);
  const healthOf = async (c) => {
    try { return await es(c, 'GET', '/_cluster/health'); }
    catch (e) { return { status: null, error: String(e?.message || e) }; }
  };
  const srcHealth = await healthOf(srcConn);
  const destHealth = await healthOf(destConn);
  return {
    srcConnId: srcConn.id, sourceIndex, destConnId: destConn.id, destIndex,
    destExists,
    srcHealthStatus: srcHealth?.status ?? null,
    destHealthStatus: destHealth?.status ?? null,
    advice: destExists
      ? '目标索引已存在：start 的 COPY_FROM_SOURCE 会拒绝覆盖；可用 destCreateMode=NONE 搬入或更换 destIndex'
      : '目标索引不存在：start 将按源 settings/mapping 复刻创建目标',
  };
}

async function xmigrateStart(conn, args) {
  const srcConn = sourceConnOf(args);
  const sourceIndex = required(args, 'sourceIndex');
  const destIndex = required(args, 'destIndex');
  const destConn = destConnOf(args);
  const destCreateMode = String(args.destCreateMode || 'NONE').toUpperCase();
  if (!['NONE', 'COPY_FROM_SOURCE'].includes(destCreateMode)) {
    throw new Error('本地编排仅支持 destCreateMode=NONE（目标已存在，直接搬入）或 COPY_FROM_SOURCE（按源复刻创建）');
  }
  const ensure = await ensureDestIndex(destConn, srcConn, sourceIndex, destIndex, destCreateMode, null, null, true);
  let totalDocs = null;
  try {
    const count = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_count`);
    totalDocs = Number(count?.count ?? 0) || null;
  } catch { /* 源端无 count 权限时不阻断搬运，仅缺进度分母 */ }
  const job = baseJob('xmigrate', {
    srcConnId: srcConn.id, destConnId: destConn.id, sourceIndex, destIndex,
    batchSize: batchSizeOf(args.batchSize), forceMerge: args.forceMerge === true, totalDocs,
  });
  const ignored = [];
  if (args.tuneMode != null) ignored.push(`tuneMode=${args.tuneMode}`);
  if (args.slices != null) ignored.push(`slices=${args.slices}`);
  jobEvent(job, 'prepare', 'RUNNING',
    `源=${srcConn.id}/${sourceIndex} 目标=${destConn.id}/${destIndex}（${ensure.note}）`
    + (ignored.length ? `；${ignored.join('/')} 不适用，本地为单线程分页搬运节奏` : ''));
  pushJob('xmigrate', job);
  transferLoop(job, srcConn, destConn);
  return {
    jobId: job.jobId, status: job.status,
    srcConnId: srcConn.id, sourceIndex, destConnId: destConn.id, destIndex,
    totalDocs: job.totalDocs, batchSize: job.batchSize,
    ...(ledgerNote() ? { detail: ledgerNote() } : {}),
  };
}

/** resume：终态作业原地续跑；srcConnId 必填且须与作业登记的源连接一致，create 模式跳过已迁移文档。 */
function xmigrateResume(args) {
  const job = requireLedgerJob('xmigrate', required(args, 'jobId'));
  if (!JOB_TERMINAL.has(job.status)) throw new Error(`作业状态为 ${job.status}，仅终态作业可 resume`);
  const srcConn = sourceConnOf(args);
  if (srcConn.id !== job.srcConnId) {
    throw new Error(`srcConnId ${srcConn.id} 与作业登记的源连接 ${job.srcConnId} 不一致`);
  }
  const destConn = destConnOf({ destConnId: job.destConnId });
  job.status = 'RUNNING';
  job.writeMode = 'create';
  job.error = null;
  job.finishedAt = null;
  job.updatedAt = Date.now();
  jobEvent(job, 'resume', 'RUNNING', `从已迁移 ${job.migrated} 条基线续跑（create 跳过目标已存在文档）`);
  saveLedger();
  transferLoop(job, srcConn, destConn);
  return { jobId: job.jobId, status: job.status, migratedBaseline: job.migrated };
}

async function xmigrateFetchConfig(args) {
  const srcConn = sourceConnOf(args);
  const sourceIndex = required(args, 'sourceIndex');
  const mapping = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_mapping`);
  const settings = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_settings`);
  return { srcConnId: srcConn.id, sourceIndex, mapping, settings };
}

/* ================= 结构同步·兼容性自适应（sync_structure） =================
   源/目标都是本地 config 里的连接档案（srcConnId + destConnId/host），直连双侧；
   与服务端/浏览器桥同一套口径：剔内部 settings 键 → 双侧能力探测 → 兼容矩阵
   预剔除（planned）→ dryRun=true 只出计划不 PUT → dryRun=false 按目标 400 报错
   自适应剔除（reactive，≤20 轮收敛）→ 别名随迁；不覆盖既有索引。
   v3：适配后 create body（settings/mappings/aliases）与 planDigest（canonical JSON
   SHA-256 前 16 hex）dryRun/执行都返回；执行可带 expectPlanDigest 防源结构漂移。
   一次调用同步返回完整报告（小操作，无后台作业台账）。 */
const SYNC_MAX_ROUNDS = 20;
/* 别名定义里随迁时原样保留的元数据键（与服务端 ALIAS_META_KEYS 同表）：filter/路由 */
const ALIAS_META_KEYS = ['filter', 'index_routing', 'search_routing', 'routing'];
const SYNC_VOLATILE_SETTINGS = ['index.uuid', 'index.creation_date', 'index.provided_name', 'index.version.created', 'index.version.upgraded'];
const SYNC_FIELD_ANALYSIS_ATTRS = ['analyzer', 'search_analyzer', 'normalizer'];

/* ---------------- 集群能力探测（probe_capabilities） ----------------
   GET /（版本/发行版）→ _nodes/plugins（插件并集）→ _cluster/health（节点规模），
   据此推断厂商（阿里云/腾讯云/AWS/Elastic/开源自建）。GET / 失败直接抛错；
   插件清单/健康取不到降级为空/null（受限账号常见）。 */
const VENDOR_LABELS = {
  aliyun: '阿里云 ES', tencent: '腾讯云 ES', aws: 'AWS ES',
  elastic: 'Elastic Cloud', oss: '开源自建', unknown: '未知',
};
const VENDOR_EVIDENCE_KEYWORDS = [
  { id: 'aliyun', keywords: ['aliyun', 'apack', 'aliws'] },
  { id: 'tencent', keywords: ['tencent', 'qcloud', 'tc'] },
  { id: 'aws', keywords: ['com.amazonaws', 'cloud-aws', 'repository-s3'] },
  { id: 'elastic', keywords: ['elastic-cloud', 'ece'] },
];
/** 插件 id 关键字命中（token 边界，杜绝子串误判）：精确相等、组前缀（com.amazonaws:…）
    或 - 段前缀（apack-knn）；仅含子串（如 mapper-forensicsaws）不算命中——自建集群装
    个别含云字的社区插件不应误判为云厂商托管。 */
function pluginKeywordHit(plugin, keyword) {
  return plugin === keyword || plugin.startsWith(keyword + ':') || plugin.startsWith(keyword + '-');
}
function inferVendor(plugins, distribution) {
  const evidence = [];
  const dist = String(distribution || '').toLowerCase();
  const signals = (plugins || []).map((p) => String(p).toLowerCase());
  for (const vendor of VENDOR_EVIDENCE_KEYWORDS) {
    let hit = false;
    for (const plugin of signals) {
      if (vendor.keywords.some((kw) => pluginKeywordHit(plugin, kw))) { evidence.push('plugin:' + plugin); hit = true; }
    }
    if (dist && vendor.keywords.some((kw) => dist === kw || dist.startsWith(kw + ':'))) {
      evidence.push('distribution:' + dist);
      hit = true;
    }
    if (hit) return { id: vendor.id, label: VENDOR_LABELS[vendor.id], evidence: [...new Set(evidence)] };
  }
  /* evidence 一律记小写化值；走到这里说明任何关键字都没命中（即无云特征插件），
     发行版为 default → 开源自建，其余（含读不到发行版）未知 */
  if (dist === 'default') return { id: 'oss', label: VENDOR_LABELS.oss, evidence: ['distribution:default'] };
  return { id: 'unknown', label: VENDOR_LABELS.unknown, evidence: [] };
}

async function probeSide(conn) {
  const root = await es(conn, 'GET', '/');
  const version = root?.version?.number ? String(root.version.number) : null;
  /* 发行版只认 version.distribution（不回退 build_flavor；缺失即 null → 厂商判 unknown） */
  const distribution = root?.version?.distribution || null;
  /* 插件清单读取失败置 null（未知，与「真没插件」的空集区分——未知时兼容矩阵跳过
     plugin-analysis，避免受限账号被误删分析组件）；pluginsReliable 单独表达可靠性 */
  let plugins = null;
  let pluginsReliable = false;
  try {
    const nodes = (await es(conn, 'GET', '/_nodes/plugins'))?.nodes || {};
    const set = new Set();
    /* 插件标识取 id 字段（对齐服务端 probeCluster 的插件 id 聚合口径） */
    for (const n of Object.values(nodes)) for (const p of n?.plugins || []) if (p?.id) set.add(String(p.id).trim());
    plugins = [...set].sort();
    pluginsReliable = true;
  } catch { /* 保持 null（未知，pluginsReliable=false） */ }
  let nodeCount = null;
  let dataNodeCount = null;
  try {
    const h = await es(conn, 'GET', '/_cluster/health');
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

/** 索引画像（probe_capabilities 带 index 时附加，字段名对齐服务端/浏览器端 indexProfile）：
    sourceAliases/sourceBytes/srcShards/srcDocCount/fieldTypeCounts，各子项失败逐项置空/null
    不整体抛出（探测尽力而为契约）。 */
async function indexProfile(conn, index) {
  const out = { sourceAliases: [], sourceBytes: null, srcShards: null, srcDocCount: null, fieldTypeCounts: {} };
  const idxEnc = encodeURIComponent(index);
  try {
    const aliasRaw = await es(conn, 'GET', `/${idxEnc}/_alias`);
    out.sourceAliases = Object.keys(Object.values(aliasRaw || {})[0]?.aliases || {});
  } catch { /* 别名清单读不到按空集 */ }
  try {
    const stats = await es(conn, 'GET', `/${idxEnc}/_stats/store`);
    out.sourceBytes = Number(Object.values(stats?.indices || {})[0]?.primaries?.store?.size_in_bytes) || null;
  } catch { /* 存储字节量读不到如实 null */ }
  try {
    const rows = await es(conn, 'GET', '/_cat/indices?format=json&h=index,pri,docs.count');
    const row = (rows || []).find((r) => String(r.index) === index);
    out.srcShards = row?.pri != null && String(row.pri) !== '' ? Number(row.pri) || null : null;
    out.srcDocCount = row?.['docs.count'] != null && String(row['docs.count']) !== '' ? Number(row['docs.count']) || null : null;
  } catch { /* 分片/文档数读不到如实 null */ }
  try {
    const mapRaw = await es(conn, 'GET', `/${idxEnc}/_mapping`);
    const counts = {};
    const walk = (bucket) => {
      for (const def of Object.values(bucket || {})) {
        if (!def || typeof def !== 'object') continue;
        const t = def.type || (def.properties ? 'object' : null);
        if (t) counts[t] = (counts[t] || 0) + 1;
        if (def.properties) walk(def.properties);
        if (def.fields) walk(def.fields);
      }
    };
    walk(Object.values(mapRaw || {})[0]?.mappings?.properties || {});
    out.fieldTypeCounts = counts;
  } catch { /* mapping 读不到按空计数 */ }
  return out;
}

/** probe_capabilities：connection=host/缺省探测默认连接，否则按本地 config 档案直连；
    index 给出时附索引画像（与浏览器端/服务端同口径）。 */
async function xmigrateProbeCapabilities(args) {
  const connection = required(args, 'connection');
  const conn = connection === 'host' ? connectionOf({}) : byId.get(connection);
  if (!conn) throw new Error(`Unknown connection: ${connection}`);
  const idx = String(args.index || '').trim();
  return { connection, ...(await probeSide(conn)), ...(idx ? await indexProfile(conn, idx) : {}) };
}

/* ---------------- 兼容矩阵（COMPAT_MATRIX，与 browserMcp/服务端同构） ----------------
   结构同步 PUT 前的预剔除规则表（规则 id 与 reason 文案逐字一致）：五条剔除规则
   产出 planned 清单，shards/replicas/store 三条只产 advice（不剔除）。 */
const COMPAT_MATRIX = [
  { id: 'apack-private', kind: 'setting', note: '阿里云 apack 私有设置，跨环境不可迁移' },
  { id: 'vendor-private', kind: 'setting', note: '厂商私有设置前缀表，按键归属厂商与目标厂商判定剔除（与 apack 规则一键一 reason 去重）' },
  { id: 'ttl-legacy', kind: 'setting', note: '已废弃的 TTL 设置' },
  { id: 'routing-attrs', kind: 'setting', note: '节点属性路由依赖源集群节点标签，跨集群无法匹配，将导致分片不分配' },
  { id: 'plugin-analysis', kind: 'analysis', note: '目标集群缺少插件时分析组件不可用' },
  { id: 'ilm-missing', kind: 'setting', note: '目标集群不存在 ILM 策略' },
  { id: 'shards-advise', kind: 'advice', note: '源分片数超过目标数据节点数 3 倍时建议收敛' },
  { id: 'auto-replicas', kind: 'advice', note: 'auto_expand_replicas 跨集群可能失控，建议显式副本数' },
  { id: 'store-advise', kind: 'advice', note: 'niofs/simplefs 显式存储类型建议移除' },
];
const COMPAT_PLUGIN_ANALYSIS_NAMES = ['ik_max_word', 'ik_smart', 'aliws', 'aliws_tokenizer', 'pinyin', 'stconvert', 'thulac', 'smartcn', 'ansj', 'hanlp'];
const COMPAT_PLUGIN_REQUIRED = {
  ik_max_word: 'analysis-ik', ik_smart: 'analysis-ik',
  pinyin: 'analysis-pinyin', stconvert: 'analysis-stconvert', smartcn: 'analysis-smartcn',
};

/** 字段级引用降级共用路径：properties 中分析属性值命中 names 的字段改写为 fallback
    （normalizer 恒剔除；无 fallback 剔除属性），字段本体保留，逐条记入 downgraded。 */
function downgradeRefsByNames(props, names, fallback, downgraded, reasonOf) {
  let n = 0;
  const walk = (bucket, prefix) => {
    for (const [field, def] of Object.entries(bucket || {})) {
      if (!def || typeof def !== 'object') continue;
      const path = prefix ? prefix + '.' + field : field;
      for (const attr of SYNC_FIELD_ANALYSIS_ATTRS) {
        if (!names.includes(def[attr])) continue;
        const from = def[attr];
        const to = fallback && attr !== 'normalizer' ? fallback : null;
        if (to) def[attr] = to; else delete def[attr];
        downgraded.push({ field: path, attr, from, to, reason: reasonOf(from, to) });
        n += 1;
      }
      if (def.properties) walk(def.properties, path);
      if (def.fields) walk(def.fields, path);
    }
  };
  walk(props, '');
  return n;
}

/* 节点属性路由的四个子域前缀（include/exclude/require/initial_recovery 之外的
   index.routing.allocation.* 键——如 total_shards_per_node——是跨集群仍生效的
   分配设置，不剔；属性名末段以 _ 开头的系统属性目标集群自解释，也不剔） */
const ROUTING_SUBDOMAINS = [
  'index.routing.allocation.include.', 'index.routing.allocation.exclude.',
  'index.routing.allocation.require.', 'index.routing.allocation.initial_recovery.',
];
/* 厂商私有设置前缀表（键归属模型）：settings 键命中某厂商私有前缀即归属该厂商，目标厂商
   已知且≠归属厂商时剔除（与源侧探测结论无关）；index.apack.* 同时命中 apack 规则与
   aliyun 前缀——vendor-private 先判，一键一 reason */
const VENDOR_PRIVATE_PREFIXES = {
  aliyun: ['index.apack.', 'index.aliyun.'],
  tencent: ['index.tencent.', 'index.qcloud.'],
  aws: ['index.cloud_aws.'],
};

/** settings 键归属的厂商：命中私有前缀表返回厂商 id，否则 null。 */
function vendorPrivateOwner(key) {
  for (const [vendor, prefixes] of Object.entries(VENDOR_PRIVATE_PREFIXES)) {
    if (prefixes.some((p) => key.startsWith(p))) return vendor;
  }
  return null;
}

/** 兼容矩阵应用（直接 mutate settings/analysis/props）；targetPlugins=null 表示目标
    插件未知，跳过 plugin-analysis（避免探测失败误删），dataNodeCount=null 不出分片建议；
    sourceVendor/targetVendor 供 vendor-private 剔除与降级 reason、plugin_install 建议使用。 */
function applyCompatMatrix({ settings, analysis, props, targetPlugins, dataNodeCount, missingIlmPolicies, fallback, sourceVendor, targetVendor }) {
  const removedSettings = [];
  const removedAnalysis = [];
  const rawDowngraded = [];
  const advice = [];
  const warnings = [];
  const targetVendorKnown = Boolean(targetVendor && targetVendor !== 'unknown');
  const vendorChanged = Boolean(sourceVendor && sourceVendor !== 'unknown'
    && targetVendor && targetVendor !== 'unknown' && sourceVendor !== targetVendor);
  for (const key of Object.keys(settings)) {
    let reason = null;
    const owner = vendorPrivateOwner(key);
    if (owner && targetVendorKnown && owner !== targetVendor) {
      reason = `vendor private setting (${owner}) not supported by target vendor ${targetVendor}`;
    } else if (owner && !targetVendorKnown) {
      /* 目标厂商未知（探测失败）：不断言跨厂商，不剔，留给 PUT 报错兜底 */
      warnings.push(`厂商私有设置 ${key} 因目标厂商未知暂不预剔除（反应式兜底仍会处理）`);
    }
    if (!reason && key.startsWith('index.apack.')) reason = '阿里云 apack 私有设置，跨环境不可迁移';
    if (!reason && key.startsWith('index.ttl')) reason = '已废弃的 TTL 设置';
    if (!reason) {
      const prefix = ROUTING_SUBDOMAINS.find((p) => key.startsWith(p));
      if (prefix) {
        const attr = key.slice(prefix.length);
        const lastDot = attr.lastIndexOf('.');
        const lastSegment = lastDot >= 0 ? attr.slice(lastDot + 1) : attr;
        /* 属性名末段以 _ 开头（如 _name/_ip/_tier_preference）是 ES 内建属性，目标自解释，不剔 */
        if (!lastSegment.startsWith('_')) reason = '节点属性路由依赖源集群节点标签，跨集群无法匹配，将导致分片不分配';
      }
    }
    if (reason) { delete settings[key]; removedSettings.push({ key, reason }); }
  }
  /* plugin-analysis：目标缺插件的分析组件剔除，三步级联（口径对齐服务端 applyPluginAnalysisRule）——
     ① 定义本体 type 命中缺失组件：删定义并级联剔除引用该定义的自定义 analyzer、字段引用降级；
     ② 自定义 analyzer 直接引用缺失组件名（tokenizer 等值 / filter、char_filter 列表项）；
     ③ 字段直接引用缺失组件名（组件无定义也降级，如 analyzer:ik_smart）与被剔 analyzer 名 */
  if (targetPlugins) {
    const lowerPlugins = targetPlugins.map((p) => String(p).toLowerCase());
    const hasPlugin = (component) => {
      const requiredPlugin = COMPAT_PLUGIN_REQUIRED[component];
      return requiredPlugin != null
        ? lowerPlugins.includes(requiredPlugin.toLowerCase())
        : lowerPlugins.some((p) => p.includes(component));
    };
    const requiredPluginOf = (component) => COMPAT_PLUGIN_REQUIRED[component] || component;
    const pluginMissingReason = (component) => `目标集群缺少插件 ${requiredPluginOf(component)}，组件 ${component} 不可用`;
    /* 字段降级条目 reason：目标厂商已知用英文模板（对齐服务端 pluginFieldReason），
       未知退中文缺失文案 */
    const pluginFieldReason = (component) => (targetVendorKnown
      ? `target vendor ${targetVendor} lacks plugin ${requiredPluginOf(component)}; analyzer ${component} -> ${fallback}`
      : `目标集群缺少插件 ${requiredPluginOf(component)}，组件 ${component} 不可用`);
    const missing = COMPAT_PLUGIN_ANALYSIS_NAMES.filter((n) => !hasPlugin(n));
    if (missing.length) {
      /* touched 口径：仅实际发生剔除/降级的组件记入对应插件；跨厂商时逐插件发装插件建议 */
      const touchedPlugins = new Set();
      for (const kind of ['analyzer', 'tokenizer', 'filter', 'char_filter', 'normalizer']) {
        const defs = analysis?.[kind];
        if (!defs) continue;
        for (const name of Object.keys(defs)) {
          const hit = missing.find((n) => n === defs[name]?.type);
          if (!hit) continue;
          delete defs[name];
          const reason = pluginMissingReason(hit);
          removedAnalysis.push({ kind, name, reason });
          touchedPlugins.add(requiredPluginOf(hit));
          /* 级联：引用被剔定义的自定义 analyzer 在目标不可构建，一并剔，被剔名一并进降级集合 */
          const removedNames = [name];
          if (kind !== 'analyzer' && analysis?.analyzer) {
            for (const aName of Object.keys(analysis.analyzer)) {
              const aDef = analysis.analyzer[aName];
              if (!aDef || typeof aDef !== 'object') continue;
              const ref = (aDef.tokenizer === name && kind === 'tokenizer')
                || (['filter', 'char_filter'].includes(kind) && Array.isArray(aDef[kind]) && aDef[kind].includes(name));
              if (!ref) continue;
              delete analysis.analyzer[aName];
              removedAnalysis.push({ kind: 'analyzer', name: aName, reason: `analyzer 引用了目标不可用的 ${kind} [${name}]: ${reason}` });
              removedNames.push(aName);
            }
          }
          downgradeRefsByNames(props, removedNames, fallback, rawDowngraded, () => pluginFieldReason(hit));
        }
      }
      /* ② 自定义 analyzer 的引用值直接命中缺失组件名（定义名与组件名不同时 ① 覆盖不到） */
      const cascadedReasons = [];
      if (analysis?.analyzer) {
        for (const name of Object.keys(analysis.analyzer)) {
          const def = analysis.analyzer[name];
          if (!def || typeof def !== 'object') continue;
          let component = typeof def.tokenizer === 'string' && missing.includes(def.tokenizer) ? def.tokenizer : null;
          if (!component) {
            for (const listKind of ['filter', 'char_filter']) {
              const list = def[listKind];
              if (!Array.isArray(list)) continue;
              component = list.find((item) => typeof item === 'string' && missing.includes(item)) || null;
              if (component) break;
            }
          }
          if (!component) continue;
          delete analysis.analyzer[name];
          const reason = `analyzer 引用了目标不可用的组件 ${component}: ${pluginMissingReason(component)}`;
          cascadedReasons.push([name, component, reason]);
          removedAnalysis.push({ kind: 'analyzer', name, reason });
          touchedPlugins.add(requiredPluginOf(component));
        }
      }
      /* ③ 字段直接引用缺失组件名（无定义也降级）与被剔 analyzer 名：逐个降级 */
      for (const component of missing) {
        if (downgradeRefsByNames(props, [component], fallback, rawDowngraded, () => pluginFieldReason(component)) > 0) {
          touchedPlugins.add(requiredPluginOf(component));
        }
      }
      for (const [name, component] of cascadedReasons) {
        if (downgradeRefsByNames(props, [name], fallback, rawDowngraded, () => pluginFieldReason(component)) > 0) {
          touchedPlugins.add(requiredPluginOf(component));
        }
      }
      if (vendorChanged) {
        for (const plugin of touchedPlugins) {
          advice.push({
            kind: 'plugin_install', key: plugin,
            message: `target vendor ${targetVendor} lacks plugin ${plugin}; install it on target or accept standard fallback`,
          });
        }
      }
    }
  }
  const ilmName = typeof settings['index.lifecycle.name'] === 'string' ? settings['index.lifecycle.name'].trim() : '';
  if (ilmName && missingIlmPolicies.has(ilmName)) {
    delete settings['index.lifecycle.name'];
    removedSettings.push({ key: 'index.lifecycle.name', reason: `目标集群不存在 ILM 策略 ${ilmName}` });
  }
  const shards = Number(settings['index.number_of_shards']);
  if (shards > 0 && dataNodeCount != null && dataNodeCount > 0 && shards > 3 * dataNodeCount) {
    advice.push({ kind: 'shards', key: 'index.number_of_shards', message: `目标数据节点 ${dataNodeCount} 个，源分片 ${shards} 片过碎，建议 ≤ ${3 * dataNodeCount}` });
  }
  if (Object.prototype.hasOwnProperty.call(settings, 'index.auto_expand_replicas')) {
    advice.push({ kind: 'replicas', key: 'index.auto_expand_replicas', message: 'auto_expand_replicas 跨集群可能失控（如 0-all），建议显式副本数' });
  }
  const storeType = String(settings['index.store.type'] || '');
  if (storeType === 'niofs' || storeType === 'simplefs') {
    advice.push({ kind: 'store', key: 'index.store.type', message: '目标默认存储类型更稳妥，建议移除显式 store.type' });
  }
  return {
    removedSettings, removedAnalysis,
    downgradedFields: rawDowngraded.map(({ field, from, to, reason }) => ({ field, from, to, reason })),
    advice, warnings,
  };
}

/** es() 抛错的完整报错文本：root_cause 全量 + error 顶层，多原因一轮内一起处理。 */
function syncErrorText(e) {
  const err = e?.body?.error;
  const parts = [];
  for (const rc of err?.root_cause || []) {
    if (rc?.reason) parts.push(String(rc.reason));
    if (rc?.type) parts.push(String(rc.type));
  }
  if (err?.reason) parts.push(String(err.reason));
  if (err?.type) parts.push(String(err.type));
  return parts.filter(Boolean).join('\n') || String(e?.message || e);
}

function syncFlatSettings(raw) {
  const s = Object.values(raw || {})[0]?.settings;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

/** 从平铺 settings 摘出 analysis 段（兼容「index.analysis 嵌套」与「index.analysis.* 点号平铺」）。 */
function syncSplitAnalysis(settings) {
  const analysis = {};
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
    let cur = analysis;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = settings[key];
    delete settings[key];
  }
  return found ? analysis : null;
}

/** 平铺 settings 按点号重组为建索引用的嵌套形态（键自带 index. 前缀，重组后即 {index:{...}}，
    analysis 剔空后并入 index.analysis）；全空返回 null。 */
function syncNestSettings(settings, analysis) {
  const root = {};
  for (const [key, value] of Object.entries(settings)) {
    const parts = key.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  if (analysis && Object.entries(analysis).some(([, defs]) => defs && Object.keys(defs).length)) {
    root.index = root.index || {};
    root.index.analysis = analysis;
  }
  return Object.keys(root).length ? root : null;
}

/** 归一 mappings body：含 properties/dynamic_templates/_meta 之一则整体保留（ES7 无类型，
    dynamic_templates/_meta/_source/dynamic 等顶层键一并透传），否则取单 type body（ES6）；
    _all 为 ES7 已移除键剔除（口径对齐服务端）。 */
function syncNormalizeMapping(mappingRaw) {
  const rawMappings = Object.values(mappingRaw || {})[0]?.mappings || {};
  const mappingBody = (rawMappings.properties || rawMappings.dynamic_templates || rawMappings._meta)
    ? { ...rawMappings }
    : { ...(Object.values(rawMappings)[0] || {}) };
  delete mappingBody._all;
  return mappingBody;
}

/** ILM 策略预查：源带 index.lifecycle.name 时探测目标是否存在（仅 404 判缺）。 */
async function missingIlmCheck(destConn, settings) {
  const missing = new Set();
  const ilmName = typeof settings['index.lifecycle.name'] === 'string' ? settings['index.lifecycle.name'].trim() : '';
  if (ilmName) {
    try { await es(destConn, 'GET', `/_ilm/policy/${encodeURIComponent(ilmName)}`); }
    catch (e) {
      if (Number(e?.httpStatus) === 404 || /404|not_?found/i.test(String(e?.message || ''))) missing.add(ilmName);
    }
  }
  return missing;
}

/** 剔目标不识别的 setting（unknown setting / private index setting）；该轮无进展返回 false。 */
function syncRemoveSettings(text, settings, removed) {
  let applied = false;
  const matches = [
    ...text.matchAll(/unknown setting \[([^\]]+)\]/g),
    ...text.matchAll(/private index setting \[([^\]]+)\]/gi),
  ];
  for (const m of matches) {
    const reported = m[1];
    const key = [reported, reported.startsWith('index.') ? reported.slice('index.'.length) : 'index.' + reported]
      .find((k) => Object.prototype.hasOwnProperty.call(settings, k));
    if (!key) continue;
    delete settings[key];
    removed.push({ key, reason: m[0] });
    applied = true;
  }
  return applied;
}

/** 剔目标不识别的 analysis 组件并降级字段级引用（字段保留）；该轮无进展返回 false。 */
function syncRemoveAnalysis(text, analysis, props, fallback, removed, downgraded) {
  const hits = [];
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

async function xmigrateSyncStructure(args) {
  const srcConn = sourceConnOf(args);
  const destConn = destConnOf(args);
  const sourceIndex = required(args, 'sourceIndex');
  const destIndex = String(args.destIndex || '').trim() || sourceIndex;
  /* 回退分词器缺省 standard（ES 全版本内置）；normalizer 引用恒剔除（不参与降级） */
  const fallback = String(args.downgradedAnalyzerFallback || '').trim() || 'standard';
  const dryRun = args?.dryRun === true;
  const syncAliases = args?.syncAliases === true;
  const settingsRaw = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_settings?flat_settings=true`);
  const mappingRaw = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_mapping`);
  const settings = syncFlatSettings(settingsRaw);
  for (const key of SYNC_VOLATILE_SETTINGS) delete settings[key];
  const analysis = syncSplitAnalysis(settings);
  const mappingBody = syncNormalizeMapping(mappingRaw);
  const props = mappingBody.properties || {};
  /* 双侧能力探测：任一侧不可达降级为 null 继续同步（跳过依赖插件清单的预剔除） */
  const [sourceCaps, targetCaps] = await Promise.all([
    probeSide(srcConn).catch(() => null),
    probeSide(destConn).catch(() => null),
  ]);
  const warnings = [];
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
  /* ILM 策略预查：源带 index.lifecycle.name 时探测目标是否存在（仅 404 判缺；目标不可达时跳过） */
  const missingIlmPolicies = targetCaps ? await missingIlmCheck(destConn, settings) : new Set();
  /* 兼容矩阵预剔除（planned），随后按剩余内容 PUT */
  const { advice, warnings: planWarnings, ...planned } = applyCompatMatrix({
    settings, analysis, props,
    targetPlugins: targetCaps?.plugins ?? null,
    dataNodeCount: targetCaps?.dataNodeCount ?? null,
    missingIlmPolicies, fallback,
    sourceVendor: sourceCaps?.vendor?.id ?? null,
    targetVendor: targetCaps?.vendor?.id ?? null,
  });
  warnings.push(...planWarnings);
  /* 源别名清单（planDigest 与随迁执行共用），提前到 PUT 前读取；保留完整定义（元数据随迁用） */
  let sourceAliases = [];
  let sourceAliasMeta = {};
  try {
    const aliasRaw = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_alias`);
    sourceAliasMeta = Object.values(aliasRaw || {})[0]?.aliases || {};
    sourceAliases = Object.keys(sourceAliasMeta);
  } catch (e) { warnings.push('读取源别名失败，别名清单按空处理：' + String(e?.message || e)); }
  /* v3 计划快照：适配后 create body 与 planDigest（对 canonical JSON
     {settings,mappings,aliases} 取 SHA-256 前 16 hex；aliases 为源别名全量名单——摘要输入
     与 syncAliases 意图无关，dryRun/执行同输入稳定复现）；deep copy 冻结计划——reactive
     兜底剔除会继续 mutate settings/props，不得回写已定稿的计划体 */
  const planSettings = syncNestSettings(settings, analysis);
  const planBody = {
    settings: planSettings ?? {},
    mappings: JSON.parse(JSON.stringify({ ...mappingBody, properties: props })),
    /* body.aliases 按 synced 口径：dryRun=计划口径（syncAliases=true 随迁名单/false 空），
       执行=事实成功名单（别名执行后回写） */
    aliases: dryRun && syncAliases ? sourceAliases.slice() : [],
  };
  const planDigest = createHash('sha256').update(canonicalMrtrArgs({
    settings: planSettings, mappings: planBody.mappings, aliases: sourceAliases.slice(),
  })).digest('hex').slice(0, 16);
  /* expectPlanDigest 只配对执行：dryRun=true 时带上明确拒绝（预览不存在计划漂移校验） */
  const expectPlanDigest = String(args.expectPlanDigest || '').trim();
  if (expectPlanDigest && dryRun) {
    throw new Error('expectPlanDigest only valid with dryRun=false');
  }
  /* expectPlanDigest（执行时可选）：与本次重算的计划 digest 不一致说明 dryRun 之后源结构
     漂移过，拒绝执行让客户端重新 dryRun 取新 digest */
  if (!dryRun && expectPlanDigest && expectPlanDigest !== planDigest) {
    throw Object.assign(
      new Error(`计划摘要不匹配，拒绝执行：期望 ${expectPlanDigest}，实际 ${planDigest}（source structure drifted, re-run dryRun）`),
      { code: 'PLAN_DRIFT' },
    );
  }
  const reactive = { removedSettings: [], removedAnalysis: [], downgradedFields: [] };
  let rounds = 0;
  let created = false;
  let lastError = null;
  if (!dryRun) {
    while (rounds < SYNC_MAX_ROUNDS) {
      rounds += 1;
      const body = { mappings: { ...mappingBody, properties: props } };
      const nested = syncNestSettings(settings, analysis);
      if (nested) body.settings = nested;
      try {
        await es(destConn, 'PUT', `/${encodeURIComponent(destIndex)}`, body);
        created = true;
        break;
      } catch (e) {
        const text = syncErrorText(e);
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
     syncAliases=true 计划全同步（synced=全集），false 全跳过（skipped=全集）；dryRun=false
     建成且勾选时逐个执行（失败进 skipped），未建成/未勾选全量记 skipped */
  const aliasesSynced = [];
  const aliasesSkipped = [];
  if (dryRun) {
    if (syncAliases) aliasesSynced.push(...sourceAliases);
    else aliasesSkipped.push(...sourceAliases);
  } else if (created && syncAliases) {
    for (const alias of sourceAliases) {
      try {
        /* 元数据随迁：源别名带 filter/路由定义时原样透传（与服务端 syncAliasesTo 同口径） */
        const add = { index: destIndex, alias };
        const def = sourceAliasMeta[alias];
        if (def && typeof def === 'object') {
          for (const meta of ALIAS_META_KEYS) {
            if (def[meta] !== undefined) add[meta] = def[meta];
          }
        }
        await es(destConn, 'POST', '/_aliases', { actions: [{ add }] });
        aliasesSynced.push(alias);
      } catch (e) {
        warnings.push('别名 ' + alias + ' 随迁失败：' + String(e?.message || e));
      }
    }
    aliasesSkipped.push(...sourceAliases.filter((a) => !aliasesSynced.includes(a)));
  } else {
    aliasesSkipped.push(...sourceAliases);
  }
  /* 执行模式 body.aliases 回写事实成功名单（dryRun 已是计划口径，无需动） */
  if (!dryRun) planBody.aliases = aliasesSynced.slice();
  /* 报告两侧块（口径对齐服务端 sideBlock）：vendor 只留 {id,label}，plugins 探测失败如实 null */
  const sideBlock = (index, caps) => ({
    index,
    version: caps?.version ?? null,
    vendor: { id: caps?.vendor?.id ?? 'unknown', label: caps?.vendor?.label ?? VENDOR_LABELS.unknown },
    plugins: caps?.plugins ?? null,
  });
  return {
    destConnId: String(args.destConnId || '').trim() || null,
    created, dryRun, destIndex, rounds,
    source: sideBlock(sourceIndex, sourceCaps),
    target: sideBlock(destIndex, targetCaps),
    planned, reactive,
    planDigest, body: planBody,
    aliases: { skipped: aliasesSkipped, synced: aliasesSynced },
    advice, warnings,
    ...(!created && lastError ? { lastError } : {}),
  };
}

/* ---------------- 能力对比 / 结构比对（compare_capabilities / diff_structure） ---------------- */

/** compare_capabilities：双侧 probeSide 快照 + 风险矩阵（版本降级/厂商切换/插件缺失/节点规模）。
    版本差只看 major.minor（与 sync_structure 版本告警同口径，SNAPSHOT 后缀不误报）；
    sourceIndex 给出时顺带取源分片数（shard_oversize 判定输入，不进 source 报告块）。 */
async function xmigrateCompareCapabilities(args) {
  const srcConn = sourceConnOf(args);
  const destConn = destConnOf(args);
  const sourceIndex = String(args.sourceIndex || '').trim() || null;
  /* target 回显缺省：index 回退 sourceIndex 名，connection 回退 host（默认连接） */
  const destIndex = String(args.destIndex || '').trim() || sourceIndex;
  const destConnId = String(args.destConnId || '').trim() || 'host';
  const [sourceCaps, targetCaps] = await Promise.all([probeSide(srcConn), probeSide(destConn)]);
  let srcShards = null;
  if (sourceIndex) {
    try {
      const rows = await es(srcConn, 'GET', '/_cat/indices?format=json&h=index,pri');
      const row = (Array.isArray(rows) ? rows : []).find((r) => String(r.index) === sourceIndex);
      const pri = Number(row?.pri);
      srcShards = Number.isFinite(pri) && pri > 0 ? pri : null;
    } catch { /* 分片数取不到不判 shard_oversize */ }
  }
  const sideBlock = (connection, index, caps) => ({
    connection, index,
    version: caps.version,
    distribution: caps.distribution,
    clusterName: caps.clusterName,
    vendor: { id: caps.vendor.id, label: caps.vendor.label },
    evidence: Array.isArray(caps.vendor.evidence) ? caps.vendor.evidence : [],
    plugins: caps.plugins,
    managed: caps.managed,
    nodeCount: caps.nodeCount,
    dataNodeCount: caps.dataNodeCount,
    pluginsReliable: caps.pluginsReliable,
  });
  const majorMinor = (v) => {
    const parts = String(v).trim().split('.');
    return parts.length >= 2 ? parts[0] + '.' + parts[1] : String(v);
  };
  const versionGap = sourceCaps.version && targetCaps.version && majorMinor(sourceCaps.version) !== majorMinor(targetCaps.version)
    ? `${sourceCaps.version} -> ${targetCaps.version}`
    : null;
  /* 厂商切换判定排除 unknown（一侧探测不出厂商时不宜断言切换） */
  const vendorChanged = sourceCaps.vendor.id !== targetCaps.vendor.id
    && sourceCaps.vendor.id !== 'unknown' && targetCaps.vendor.id !== 'unknown';
  /* 插件差集：任一侧清单未知（null）时无法计算，如实给空集（受限账号常见，不冒充空集） */
  const pluginsOnlyInSource = sourceCaps.plugins && targetCaps.plugins
    ? sourceCaps.plugins.filter((p) => !targetCaps.plugins.includes(p)) : [];
  const pluginsOnlyInTarget = sourceCaps.plugins && targetCaps.plugins
    ? targetCaps.plugins.filter((p) => !sourceCaps.plugins.includes(p)) : [];
  const risks = [];
  /* 插件缺失分档（与兼容矩阵 coversKnownComponent 同口径）：具名组件（固定映射精确匹配，
     其余插件 id 含组件名）已被矩阵覆盖 → sync_structure 可自动剔除/降级；未知插件只能
     目标安装或从同步计划排除 */
  const coversKnownComponent = (pluginId) => {
    const p = String(pluginId).toLowerCase();
    return COMPAT_PLUGIN_ANALYSIS_NAMES.some((component) => {
      const fixed = COMPAT_PLUGIN_REQUIRED[component];
      return fixed != null ? p === fixed.toLowerCase() : p.includes(component);
    });
  };
  for (const plugin of pluginsOnlyInSource) {
    risks.push({
      kind: 'plugin_missing', severity: 'high',
      message: `目标集群缺少插件 ${plugin}（源在用），相关分析组件在 sync_structure 中会被自动剔除或降级`,
      action: coversKnownComponent(plugin)
        ? 'auto-strip on sync_structure; or install plugin on target'
        : 'install the plugin on target or exclude the component from the sync plan',
    });
  }
  if (sourceCaps.version && targetCaps.version
    && Number(String(targetCaps.version).split('.')[0]) < Number(String(sourceCaps.version).split('.')[0])) {
    risks.push({
      kind: 'version_downgrade', severity: 'medium',
      message: `目标版本 ${targetCaps.version} 大版本低于源 ${sourceCaps.version}，跨大版本回迁的字段解析与默认行为可能不兼容`,
      action: 'align target major version first; or run sync_structure dryRun=true and review mapping downgrades',
    });
  }
  if (vendorChanged) {
    risks.push({
      kind: 'vendor_change', severity: 'low',
      message: `厂商从 ${sourceCaps.vendor.id} 切换到 ${targetCaps.vendor.id}，厂商私有设置（如 apack/qcloud/cloud_aws 前缀）将被剔除`,
      action: 'run sync_structure dryRun=true to review vendor-private removals',
    });
  }
  if (srcShards != null && targetCaps.dataNodeCount != null && targetCaps.dataNodeCount > 0
    && srcShards > 3 * targetCaps.dataNodeCount) {
    risks.push({
      kind: 'shard_oversize', severity: 'medium',
      message: `源索引 ${srcShards} 片超过目标 ${targetCaps.dataNodeCount} 个数据节点的 3 倍，目标侧分片过碎`,
      action: `reduce source shards to <= ${3 * targetCaps.dataNodeCount} or scale target data nodes before sync`,
    });
  }
  return {
    source: sideBlock(srcConn.id, sourceIndex, sourceCaps),
    target: sideBlock(destConnId, destIndex, targetCaps),
    diff: { versionGap, vendorChanged, pluginsOnlyInSource, pluginsOnlyInTarget,
      nodeScale: { sourceDataNodes: sourceCaps.dataNodeCount ?? null, targetDataNodes: targetCaps.dataNodeCount ?? null },
      risks },
  };
}

/** diff_structure 用的 settings 忽略键/前缀：内部生成键与副本数（运行时可变）不算结构漂移。 */
const DIFF_IGNORED_SETTING_KEYS = ['index.provided_name', 'index.creation_date', 'index.uuid', 'index.number_of_replicas'];
const DIFF_IGNORED_SETTING_PREFIXES = ['index.version.'];

/** diff 比对的字段语义属性：类型 + 三个分析引用属性（与服务端 FIELD_SEMANTIC_ATTRS 同表）。 */
const FIELD_SEMANTIC_ATTRS = ['type', 'analyzer', 'search_analyzer', 'normalizer'];

/** 递归收集字段语义属性表（含嵌套对象与 multi-field）：字段全路径 → {type?,analyzer?,
    search_analyzer?,normalizer?}（无该属性的键不出现）。 */
function collectFieldSemantics(props, prefix, out) {
  for (const [name, def] of Object.entries(props || {})) {
    if (!def || typeof def !== 'object') continue;
    const path = prefix ? `${prefix}.${name}` : name;
    const semantic = {};
    for (const attr of FIELD_SEMANTIC_ATTRS) {
      if (Object.prototype.hasOwnProperty.call(def, attr)) semantic[attr] = def[attr];
    }
    out.set(path, semantic);
    if (def.properties) collectFieldSemantics(def.properties, path, out);
    for (const [sub, sd] of Object.entries(def.fields || {})) {
      const subPath = `${path}.${sub}`;
      const subSemantic = {};
      for (const attr of FIELD_SEMANTIC_ATTRS) {
        if (sd && Object.prototype.hasOwnProperty.call(sd, attr)) subSemantic[attr] = sd[attr];
      }
      out.set(subPath, subSemantic);
      if (sd?.properties) collectFieldSemantics(sd.properties, subPath, out);
    }
  }
}

/** 两个字段语义属性表是否一致（逐属性比较，缺失与 null 同视为缺）。 */
const sameFieldSemantics = (a, b) => FIELD_SEMANTIC_ATTRS.every((attr) => (a[attr] ?? null) === (b[attr] ?? null));

/** 字段语义属性差异摘要（如 `analyzer: ik_max_word -> standard`；缺失侧记 (absent)，多属性分号连接）。 */
function fieldSemanticDetail(source, target) {
  const attrs = [...new Set([...Object.keys(source), ...Object.keys(target)])].sort();
  const parts = [];
  for (const attr of attrs) {
    const sv = source[attr] ?? null;
    const tv = target[attr] ?? null;
    if (sv !== tv) parts.push(`${attr}: ${sv == null ? '(absent)' : sv} -> ${tv == null ? '(absent)' : tv}`);
  }
  return parts.join('; ');
}

/** diff_structure：源 vs 目标既有索引的 settings/mappings 对比。先按 CompatMatrix（与
    sync_structure 同一套归一与探测口径）算 expectedRemovals（计划剔除豁免表），计划外差异
    进 unexpected，compatible=无 unexpected；目标不存在/不可读直接明确报错。 */
async function xmigrateDiffStructure(args) {
  const srcConn = sourceConnOf(args);
  const destConn = destConnOf(args);
  const sourceIndex = required(args, 'sourceIndex');
  const destIndex = String(args.destIndex || '').trim() || sourceIndex;
  const destConnId = String(args.destConnId || '').trim() || null;
  const settingsRaw = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_settings?flat_settings=true`);
  const mappingRaw = await es(srcConn, 'GET', `/${encodeURIComponent(sourceIndex)}/_mapping`);
  let destSettingsRaw;
  let destMappingRaw;
  try {
    [destSettingsRaw, destMappingRaw] = await Promise.all([
      es(destConn, 'GET', `/${encodeURIComponent(destIndex)}/_settings?flat_settings=true`),
      es(destConn, 'GET', `/${encodeURIComponent(destIndex)}/_mapping`),
    ]);
  } catch (e) {
    throw Object.assign(
      new Error(`目标索引不存在或不可读，无法 diff（先用 sync_structure 建成目标）: ${destIndex} — ${String(e?.message || e)}`),
      { code: 'DEST_NOT_FOUND' },
    );
  }
  /* 兼容矩阵计划副本（deep copy 隔离，matrix 会 mutate）：与 sync_structure 同一套归一 */
  const planSettings = JSON.parse(JSON.stringify(syncFlatSettings(settingsRaw)));
  for (const key of SYNC_VOLATILE_SETTINGS) delete planSettings[key];
  const planAnalysis = syncSplitAnalysis(planSettings);
  const planMappingBody = JSON.parse(JSON.stringify(syncNormalizeMapping(mappingRaw)));
  const planProps = planMappingBody.properties || {};
  const [sourceCaps, targetCaps] = await Promise.all([
    probeSide(srcConn).catch(() => null),
    probeSide(destConn).catch(() => null),
  ]);
  const missingIlmPolicies = targetCaps ? await missingIlmCheck(destConn, planSettings) : new Set();
  const { advice: _planAdvice, warnings: _planWarnings, ...planned } = applyCompatMatrix({
    settings: planSettings, analysis: planAnalysis, props: planProps,
    targetPlugins: targetCaps?.plugins ?? null,
    dataNodeCount: targetCaps?.dataNodeCount ?? null,
    missingIlmPolicies, fallback: 'standard',
    sourceVendor: sourceCaps?.vendor?.id ?? null,
    targetVendor: targetCaps?.vendor?.id ?? null,
  });
  const expectedRemovals = [
    ...planned.removedSettings.map(({ key, reason }) => ({ area: 'settings', key, reason })),
    ...planned.removedAnalysis.map(({ kind, name, reason }) => ({ area: 'analysis', key: `${kind}.${name}`, reason })),
    ...planned.downgradedFields.map(({ field, reason }) => ({ area: 'mappings', key: field, reason })),
  ];
  /* settings 比对：原始平铺形态（含 index.analysis.* 平铺键），剔忽略键/前缀后逐键比 */
  const comparable = (raw) => {
    const flat = syncFlatSettings(raw);
    const out = {};
    for (const [key, value] of Object.entries(flat)) {
      if (DIFF_IGNORED_SETTING_KEYS.includes(key)) continue;
      if (DIFF_IGNORED_SETTING_PREFIXES.some((p) => key.startsWith(p))) continue;
      out[key] = value;
    }
    return out;
  };
  const srcSettings = comparable(settingsRaw);
  const dstSettings = comparable(destSettingsRaw);
  /* settings 值深比较（键序无关，与服务端 Objects.equals 同语义）——String() 比较对对象值
     恒为 "[object Object]"，嵌套值差异会漏报 */
  const deepSettingEq = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((v, i) => deepSettingEq(v, b[i]));
    }
    if (typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a);
      if (ka.length !== Object.keys(b).length) return false;
      return ka.every((k) => k in b && deepSettingEq(a[k], b[k]));
    }
    return false;
  };
  const settingsDiff = {
    onlyInSource: Object.keys(srcSettings).filter((k) => !(k in dstSettings))
      .map((k) => ({ key: k, sourceValue: srcSettings[k] })),
    onlyInTarget: Object.keys(dstSettings).filter((k) => !(k in srcSettings))
      .map((k) => ({ key: k, targetValue: dstSettings[k] })),
    valueChanged: Object.keys(srcSettings).filter((k) => k in dstSettings && !deepSettingEq(srcSettings[k], dstSettings[k]))
      .map((k) => ({ key: k, sourceValue: srcSettings[k], targetValue: dstSettings[k] })),
  };
  /* mappings 比对：字段全路径 → 语义属性表（type+analyzer+search_analyzer+normalizer，
     与服务端 FIELD_SEMANTIC_ATTRS 同表；分析属性差异不再单靠计划豁免表按字段名对账） */
  const srcFields = new Map();
  collectFieldSemantics(syncNormalizeMapping(mappingRaw).properties || {}, '', srcFields);
  const dstFields = new Map();
  collectFieldSemantics(syncNormalizeMapping(destMappingRaw).properties || {}, '', dstFields);
  const mappingsDiff = {
    fieldAdded: [...dstFields].filter(([f]) => !srcFields.has(f))
      .map(([field, semantic]) => ({ field, type: semantic.type ?? null })),
    fieldRemoved: [...srcFields].filter(([f]) => !dstFields.has(f))
      .map(([field, semantic]) => ({ field, type: semantic.type ?? null })),
    fieldChanged: [...srcFields].filter(([f, s]) => dstFields.has(f) && !sameFieldSemantics(s, dstFields.get(f)))
      .map(([field, s]) => ({
        field, sourceType: s.type ?? null, targetType: dstFields.get(field).type ?? null,
        detail: fieldSemanticDetail(s, dstFields.get(field)),
      })),
  };
  /* unexpected：计划外差异（settings 三类 + mappings 三类全部计入）。settings 侧 onlyInSource
     命中 expectedRemovals（settings 整键或 analysis 组件平铺前缀 index.analysis.{kind}.{name}）
     豁免；onlyInTarget/valueChanged 无豁免通道，直接计入；mappings 侧字段差异命中
     downgradedFields 字段名豁免（降级保字段，但同类字段的其他差异仍按计划外报告） */
  const expectedSettingKeys = new Set(expectedRemovals.filter((r) => r.area === 'settings').map((r) => r.key));
  const expectedAnalysisPrefixes = expectedRemovals.filter((r) => r.area === 'analysis')
    .map((r) => `index.analysis.${r.key}.`);
  const expectedAnalysisSet = new Set(expectedRemovals.filter((r) => r.area === 'analysis').map((r) => r.key));
  /* 嵌套形态（标准 ES flat 响应）下 analysis 挂在 index.analysis 单键——计划剔除组件表现为
     整键 valueChanged 或整键 onlyInSource；按组件级差集（源有目标无 ⊆ 计划剔除集）豁免，
     组件定义被改（双侧都有但定义不同）仍照报 */
  const analysisComponents = (v) => {
    const out = new Set();
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    for (const [kind, defs] of Object.entries(v)) {
      if (!defs || typeof defs !== 'object' || Array.isArray(defs)) continue;
      for (const name of Object.keys(defs)) out.add(`${kind}.${name}`);
    }
    return out;
  };
  const analysisDiffExplained = (srcV, dstV) => {
    const srcComps = analysisComponents(srcV);
    const dstComps = analysisComponents(dstV);
    for (const c of srcComps) {
      if (!dstComps.has(c) && !expectedAnalysisSet.has(c)) return false;
    }
    return true;
  };
  const expectedFieldKeys = new Set(expectedRemovals.filter((r) => r.area === 'mappings').map((r) => r.key));
  const unexpected = [];
  for (const { key, sourceValue } of settingsDiff.onlyInSource) {
    if (expectedSettingKeys.has(key)) continue;
    if (expectedAnalysisPrefixes.some((p) => key.startsWith(p))) continue;
    if (key === 'index.analysis' && analysisDiffExplained(sourceValue, null)) continue;
    unexpected.push({ area: 'settings', key, message: `源设置 ${key} 未出现在目标索引，且不在兼容矩阵预期剔除清单内` });
  }
  for (const { key } of settingsDiff.onlyInTarget) {
    unexpected.push({ area: 'settings', key, message: `目标设置 ${key} 未出现在源索引（计划外新增）` });
  }
  for (const { key, sourceValue, targetValue } of settingsDiff.valueChanged) {
    if (key === 'index.analysis' && analysisDiffExplained(sourceValue, targetValue)) continue;
    unexpected.push({ area: 'settings', key, message: `设置 ${key} 两侧取值不一致` });
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
    /* 豁免：字段命中计划降级清单且 type 未变（差异仅在 analysis 引用属性，与服务端同口径） */
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

/** verify_equivalence：迁移后数据等价抽样验证（只读，与服务端/浏览器桥同一契约）。
    双侧 _count(match_all) 对比 → 源 _doc 序抽样 _id（_source:false 只要 id，
    size 夹取 min(sampleSize,500,count)）→ 双侧 mget 取 _source → canonical JSON
    SHA-256 前 16 hex 摘要逐 id 对比（sampleFields 给出时先投影，支持点号路径）→
    aggField 给出时附 terms 聚合对比。任一侧 count 失败如实 null + INCONCLUSIVE；
    样本或聚合请求失败同样 INCONCLUSIVE（不冒充比对过，与服务端/浏览器同口径）；
    差异清单回显 ≤20 条（missingTruncated/mismatchTruncated 标记截断）。
    jobId 形态从本地作业台账补 srcConnId/sourceIndex/destIndex（显式传参优先）。 */
const VERIFY_LIST_MAX = 20;
async function xmigrateVerifyEquivalence(args) {
  const warnings = [];
  const jobId = String(args?.jobId || '').trim();
  let srcConnId = String(args?.srcConnId || '').trim();
  let sourceIndex = String(args?.sourceIndex || '').trim();
  let destIndex = String(args?.destIndex || '').trim();
  if (!jobId && !srcConnId) throw new Error('jobId 与 srcConnId 必须二选一');
  if (jobId) {
    const job = requireLedgerJob('xmigrate', jobId);
    srcConnId = srcConnId || String(job.srcConnId || '').trim();
    sourceIndex = sourceIndex || String(job.sourceIndex || '').trim();
    destIndex = destIndex || String(job.destIndex || '').trim();
    if (!srcConnId) throw new Error(`该作业未记录源连接档案，无法验证等价性: ${jobId}`);
  }
  if (!sourceIndex) throw new Error('sourceIndex 不能为空');
  destIndex = destIndex || sourceIndex;
  const srcConn = sourceConnOf({ srcConnId });
  const destConn = destConnOf({ destConnId: args?.destConnId });
  const destConnId = String(args?.destConnId || '').trim() || null;
  const clampWarn = (v, lo, hi, dft, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dft;
    const c = Math.min(hi, Math.max(lo, Math.floor(n)));
    if (c !== n) warnings.push(`${name} 已从 ${n} 钳制为 ${c}（有效范围 ${lo}..${hi}）`);
    return c;
  };
  const sampleSize = clampWarn(args?.sampleSize, 10, 500, 100, 'sampleSize');
  const aggSize = clampWarn(args?.aggSize, 1, 50, 10, 'aggSize');
  const aggField = String(args?.aggField || '').trim();
  const sampleFields = String(args?.sampleFields || '').split(',').map((f) => f.trim()).filter(Boolean);
  const seenFields = new Set();
  const pickPath = (obj, dotted) => {
    let cur = obj;
    for (const seg of dotted.split('.')) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[seg];
    }
    return cur;
  };
  const project = (src) => {
    if (!sampleFields.length || !src || typeof src !== 'object') return src ?? null;
    const out = {};
    for (const f of sampleFields) {
      if (f in src) { out[f] = src[f]; seenFields.add(f); }
      else {
        const v = pickPath(src, f);
        if (v !== undefined) { out[f] = v; seenFields.add(f); }
      }
    }
    return out;
  };
  const digestOf = (value) => createHash('sha256')
    .update(canonicalMrtrArgs(value)).digest('hex').slice(0, 16);
  /* 双侧 _count：任一侧失败如实 null（count=0 是有效值，不与 null 混同） */
  const countOf = async (conn, index) => {
    try {
      const raw = await es(conn, 'POST', `/${encodeURIComponent(index)}/_count`,
        '{"query":{"match_all":{}}}');
      const n = Number(raw?.count);
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  };
  const sourceCount = await countOf(srcConn, sourceIndex);
  const destCount = await countOf(destConn, destIndex);
  if (sourceCount == null) warnings.push(`源索引文档数读取失败，无法比对总数: ${sourceIndex}`);
  if (destCount == null) warnings.push(`目标索引不存在或不可读，无法验证等价性: ${destIndex}`);
  const countsMatch = sourceCount != null && destCount != null ? sourceCount === destCount : null;
  /* 样本逐 id 内容比对：源 _doc 序抽样（只取 id）→ 双侧 mget(_source) → 投影后摘要对比 */
  const missingInDest = [];
  const mismatched = [];
  let requested = 0;
  let checked = 0;
  let matched = 0;
  let sampleOk = true;
  if (sourceCount != null && destCount != null) {
    requested = sampleSize;
    const size = Math.min(sampleSize, 500, sourceCount);
    if (size > 0) {
      try {
        const page = await es(srcConn, 'POST', `/${encodeURIComponent(sourceIndex)}/_search`,
          JSON.stringify({ size, sort: ['_doc'], _source: false, query: { match_all: {} } }));
        const ids = (page?.hits?.hits || []).map((h) => h?._id).filter((id) => id != null).map(String);
        if (ids.length) {
          const mgetBody = JSON.stringify({ ids });
          const [srcDocs, dstDocs] = await Promise.all([
            es(srcConn, 'POST', `/${encodeURIComponent(sourceIndex)}/_mget`, mgetBody),
            es(destConn, 'POST', `/${encodeURIComponent(destIndex)}/_mget`, mgetBody),
          ]);
          const byId = (resp) => {
            const m = new Map();
            for (const d of resp?.docs || []) {
              if (d?._id != null && d?._source != null) m.set(String(d._id), d._source);
            }
            return m;
          };
          const srcMap = byId(srcDocs);
          const dstMap = byId(dstDocs);
          for (const id of ids) {
            checked++;
            /* 目标缺（含双侧皆缺，_source 缺失视同缺）→ missingInDest；源缺目标在 →
               content_mismatch；双侧都在 → 投影后摘要比对（与服务端/浏览器同口径） */
            if (!dstMap.has(id)) { missingInDest.push(id); continue; }
            if (!srcMap.has(id)) { mismatched.push({ id, reason: 'content_mismatch' }); continue; }
            if (digestOf(project(srcMap.get(id))) === digestOf(project(dstMap.get(id)))) matched++;
            else mismatched.push({ id, reason: 'content_mismatch' });
          }
        }
      } catch (e) {
        warnings.push('样本对比请求失败，已跳过：' + String(e?.message || e));
        sampleOk = false;
        checked = 0;
        matched = 0;
        missingInDest.length = 0;
        mismatched.length = 0;
      }
    }
    if (sampleOk && sampleFields.length && checked > 0) {
      for (const f of sampleFields) {
        if (!seenFields.has(f)) warnings.push(`投影字段 ${f} 在源样本中均未出现（请检查字段名）`);
      }
    }
  }
  /* 可选 terms 聚合对比：双侧 size:0 + terms(field, aggSize)，按桶 key 集差与计数差判 match；
     读取失败如实告警并判 INCONCLUSIVE（不冒充比对过，与服务端/浏览器同口径） */
  let aggregation = null;
  let aggOk = true;
  if (aggField && sourceCount != null && destCount != null) {
    try {
      const aggBody = JSON.stringify({ size: 0, aggs: { t: { terms: { field: aggField, size: aggSize } } } });
      const [srcAgg, dstAgg] = await Promise.all([
        es(srcConn, 'POST', `/${encodeURIComponent(sourceIndex)}/_search`, aggBody),
        es(destConn, 'POST', `/${encodeURIComponent(destIndex)}/_search`, aggBody),
      ]);
      const bucketsOf = (resp) => (resp?.aggregations?.t?.buckets || [])
        .map((b) => ({ key: String(b.key), count: Number(b.doc_count) || 0 }));
      const sourceBuckets = bucketsOf(srcAgg);
      const destBuckets = bucketsOf(dstAgg);
      const srcCountOf = new Map(sourceBuckets.map((b) => [b.key, b.count]));
      const dstCountOf = new Map(destBuckets.map((b) => [b.key, b.count]));
      const onlyInSource = sourceBuckets.filter((b) => !dstCountOf.has(b.key)).map((b) => b.key);
      const onlyInDest = destBuckets.filter((b) => !srcCountOf.has(b.key)).map((b) => b.key);
      const countDiffs = sourceBuckets
        .filter((b) => dstCountOf.has(b.key) && dstCountOf.get(b.key) !== b.count)
        .map((b) => ({ key: b.key, sourceCount: b.count, destCount: dstCountOf.get(b.key) }));
      aggregation = {
        field: aggField, requestedSize: aggSize,
        match: onlyInSource.length === 0 && onlyInDest.length === 0 && countDiffs.length === 0,
        sourceBuckets, destBuckets, onlyInSource, onlyInDest, countDiffs,
      };
    } catch (e) {
      warnings.push('聚合对比读取失败，已跳过：' + String(e?.message || e));
      aggOk = false;
    }
  }
  /* verdict：任一侧 count 未知 / 样本或聚合取数失败 → INCONCLUSIVE；总数一致 + 样本无缺
     无错配 + 聚合（若请求）match → EQUIVALENT；其余 DIVERGENT（判定的清单用全量，回显才截断） */
  let verdict;
  if (sourceCount == null || destCount == null || !sampleOk || (aggField && !aggOk)) verdict = 'INCONCLUSIVE';
  else if (countsMatch && missingInDest.length === 0 && mismatched.length === 0
    && (aggregation == null || aggregation.match)) verdict = 'EQUIVALENT';
  else verdict = 'DIVERGENT';
  return {
    source: { index: sourceIndex, count: sourceCount },
    dest: { index: destIndex, count: destCount, destConnId },
    countsMatch,
    sample: {
      requested, checked, matched,
      missingInDest: missingInDest.slice(0, VERIFY_LIST_MAX),
      mismatched: mismatched.slice(0, VERIFY_LIST_MAX),
      missingTruncated: missingInDest.length > VERIFY_LIST_MAX,
      mismatchTruncated: mismatched.length > VERIFY_LIST_MAX,
    },
    aggregation,
    verdict,
    warnings,
  };
}

/** throttle：运行中 xmigrate 作业调速（rps docs/s，-1 恢复不限速，0/<-1 非法）；编排内核
    每批重读作业对象当前 throttleRps，运行中调用下一批即生效。 */
function xmigrateThrottle(args) {
  const jobId = required(args, 'jobId');
  const job = requireLedgerJob('xmigrate', jobId);
  if (job.status !== 'RUNNING') throw new Error(`作业状态为 ${job.status}，仅运行中作业可调速: ${jobId}`);
  const rps = Number(args.rps);
  if (!Number.isFinite(rps)) throw new Error('rps 需为数字（-1 恢复不限速）');
  if (rps < -1) throw new Error('rps 不得小于 -1：不限速请传 -1');
  if (rps === 0) throw new Error('rps 不得为 0：不限速请传 -1');
  const applied = rps;
  job.throttleRps = applied > 0 ? applied : null;
  job.updatedAt = Date.now();
  jobEvent(job, 'THROTTLE', 'RUNNING', applied > 0 ? `调速为 ${applied} docs/s（批粒度限速）` : '恢复不限速');
  saveLedger();
  return { ok: true, jobId, rps: applied, appliedAt: Date.now() };
}

loadLedger();

function required(args, key) {
  const value = args?.[key];
  if (value == null || String(value).trim() === '') throw new Error(`Missing required argument: ${key}`);
  return String(value).trim();
}
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
const REST_DELETE_READ = [/^\/_search\/scroll$/, /^\/_pit$/, /^\/_pit\/[^/]+$/, /^\/_sql\/close$/];

function isReadRest(method, path) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  const p = String(path || '').trim().toLowerCase().split('?')[0].replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const patterns = m === 'POST' ? REST_POST_READ : m === 'DELETE' ? REST_DELETE_READ : [];
  return patterns.some((re) => re.test(p));
}

function msearchNdjson(args) {
  const searches = args.searches;
  if (!Array.isArray(searches) || !searches.length) throw new Error('searches must be a non-empty array');
  const defaultIndex = args.index ? String(args.index) : '';
  const lines = [];
  for (const search of searches) {
    if (!search || typeof search !== 'object') throw new Error('each search must be an object');
    const index = String(search.index || defaultIndex || '').trim();
    if (!index) throw new Error('each search needs index');
    lines.push(JSON.stringify({ index }));
    const body = search.body == null ? {} : { ...objectArg(search, 'body') };
    if (search.size != null) body.size = Math.max(1, Math.min(100, Number(search.size) || 10));
    else if (body.size == null) body.size = 10;
    const clause = queryClause(search.query);
    if (clause) body.query = clause;
    else if (body.query == null) body.query = { match_all: {} };
    lines.push(JSON.stringify(body));
  }
  return lines.join('\n') + '\n';
}

function bulkNdjson(args) {
  const operations = args.operations;
  if (!Array.isArray(operations) || !operations.length) throw new Error('operations must be a non-empty array');
  const defaultIndex = args.index ? String(args.index) : '';
  const lines = [];
  for (const op of operations) {
    if (!op || typeof op !== 'object') throw new Error('each operation must be an object');
    const action = String(op.action || 'index').toLowerCase();
    if (!['index', 'create', 'update', 'delete'].includes(action)) throw new Error('unsupported bulk action: ' + action);
    const index = String(op.index || defaultIndex || '').trim();
    if (!index) throw new Error('each operation needs index');
    const meta = { _index: index };
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

function queryClause(raw) {
  if (raw == null) return null;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'query')) {
    return parsed.query;
  }
  return parsed;
}
function objectArg(args, key) {
  const value = args?.[key];
  if (value == null) throw new Error(`Missing required argument: ${key}`);
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${key} must be an object`);
  return parsed;
}

/** _update_by_query / _delete_by_query / _reindex 的 camelCase 参数 → ES 查询参数。 */
function queryOpts(args) {
  const params = new URLSearchParams();
  for (const key of ['conflicts', 'slices', 'refresh', 'waitForCompletion', 'requestsPerSecond',
    'scroll', 'timeout', 'waitForActiveShards', 'maxDocs']) {
    const value = args?.[key];
    if (value == null || String(value).trim() === '') continue;
    params.set(key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()), String(value));
  }
  return params.toString();
}

function groupTools() {
  const out = [];
  for (const [name, actions] of Object.entries(GROUP_ACTIONS)) {
    const allowed = Object.keys(actions).filter((action) => {
      const target = actions[action];
      return allowWrite || !WRITE_TOOLS.includes(target) || target === 'es_rest';
    });
    if (!allowed.length) continue;
    const properties = {
      action: { type: 'string', enum: allowed, description: 'Action to execute. One of: ' + allowed.join(', ') },
      connection: { type: 'string', description: 'Connection id; optional.' },
    };
    for (const field of ['index', 'id', 'name', 'target', 'alias', 'query', 'body', 'document', 'settings',
      'fields', 'method', 'path', 'taskId', 'repo', 'snapshot', 'policy', 'source', 'dest', 'text', 'analyzer',
      'field', 'value', 'params', 'actions', 'script', 'ids', 'documents', 'indexes', 'requests', 'slices',
      'maxDocs', 'refresh', 'pipeline', 'routing', 'size', 'from', 'scroll', 'waitForCompletion']) {
      properties[field] = { type: 'string', description: field + ' (action-specific)' };
    }
    /* es_xmigrate 组的专用参数：sync_structure 的 dry-run/别名随迁/分析器回退/计划摘要校验参数，
       verify_equivalence 的样本与聚合参数，throttle 的速率参数（与服务端/浏览器同表） */
    if (name === 'es_xmigrate') {
      properties.dryRun = { type: 'boolean', description: 'sync_structure: true 时只产出兼容剔除计划（planned/advice），不向目标集群发 PUT' };
      properties.syncAliases = { type: 'boolean', description: 'sync_structure: true 时建索引成功后按源别名逐个随迁（filter/routing 元数据原样）' };
      properties.downgradedAnalyzerFallback = { type: 'string', description: 'sync_structure: 降级字段的回退分析器；缺省回退 standard 分析器（normalizer 属性总是剔除）' };
      properties.expectPlanDigest = { type: 'string', description: 'sync_structure: dryRun 预览返回的 planDigest；仅 dryRun=false 执行时合法，防预览后源结构漂移' };
      properties.srcConnId = { type: 'string', description: '跨集群 action 的源连接档案 id（start/resume/fetch_config/reconcile/verify_equivalence 等）' };
      properties.destConnId = { type: 'string', description: '目标侧连接 id（host=宿主集群；缺省按 action 各自默认）' };
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
      description: GROUP_DESCRIPTIONS[name] + ' Actions: ' + allowed.join(', ')
        + '. Pass action plus the arguments documented for that action.',
      inputSchema: { type: 'object', properties, required: ['action'] },
      annotations: TOOL_ANNOTATIONS[name],
      _meta: { ui: { resourceUri: MCP_APP_URI } },
    });
  }
  return out;
}

/** 单轨归一：客户端只允许 17 个 action 组（action 必填）；组外工具名一律按未知工具报错。 */
function normalizeGroupCall(name, args = {}) {
  const actions = GROUP_ACTIONS[name];
  if (!actions) {
    throw new Error('Unknown tool ' + name + '; the client surface is the action groups: ' + Object.keys(GROUP_ACTIONS).join(', '));
  }
  const action = String(args.action || '').trim();
  if (!action) throw new Error('Missing action for ' + name + '; expected one of ' + Object.keys(actions).join(', '));
  const target = actions[action];
  if (!target) throw new Error('Unknown action ' + action + ' for ' + name + '; expected one of ' + Object.keys(actions).join(', '));
  const rest = { ...args };
  delete rest.action;
  return { name: target, args: rest };
}

function tools() {
  return groupTools();
}

function response(id, result) {
  const body = result && typeof result === 'object' && !Array.isArray(result)
    ? { resultType: 'complete', ...result }
    : result;
  return { jsonrpc: '2.0', id, result: body };
}
function error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

function declaresTasks(request) {
  const meta = request?._meta || request?.params?._meta || {};
  const caps = meta['io.modelcontextprotocol/clientCapabilities'] || {};
  return !!(caps.extensions && caps.extensions[TASKS_EXTENSION]);
}

function declaresElicitation(request) {
  const meta = request?._meta || request?.params?._meta || {};
  const caps = meta['io.modelcontextprotocol/clientCapabilities'] || {};
  return !!caps.elicitation;
}

function canonicalMrtrArgs(value) {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === 'object') {
      const out = {};
      for (const key of Object.keys(input).sort()) out[key] = sort(input[key]);
      return out;
    }
    return input;
  };
  return JSON.stringify(sort(value || {}));
}

function mrtrNeedsConfirmation(toolName, args = {}) {
  if (!MRTR_CONFIRM_TOOLS.has(toolName)) return false;
  if (toolName === 'es_rest') {
    const method = String(args.method || 'GET').trim().toUpperCase();
    return method !== 'GET' && method !== 'HEAD';
  }
  /* sync_structure 的 dryRun=true 只读预览，不进 MRTR 二次确认（dryRun=false 维持确认门） */
  if (toolName === 'es_xmigrate_sync_structure' && args?.dryRun === true) return false;
  return true;
}

function mrtrInputRequired(toolName, args) {
  const now = Date.now();
  for (const [key, entry] of MRTR_STATES) {
    if (entry.expires < now) MRTR_STATES.delete(key);
  }
  const state = `mrtr-${process.pid}-${randomUUID()}`;
  MRTR_STATES.set(state, { tool: toolName, args: canonicalMrtrArgs(args), expires: now + MRTR_TTL_MS });
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
              confirm: { type: 'boolean', title: '确认执行', description: '该操作可能删除或覆盖数据，确认后才会执行。', default: false },
            },
            required: ['confirm'],
          },
        },
      },
    },
    requestState: state,
  };
}

function mrtrVerify(state, toolName, args) {
  const entry = MRTR_STATES.get(state);
  if (!entry || entry.expires < Date.now() || entry.tool !== toolName || entry.args !== canonicalMrtrArgs(args)) {
    return false;
  }
  MRTR_STATES.delete(state);
  return true;
}

function mrtrConfirmed(responses = {}) {
  const confirm = responses.confirm || {};
  return String(confirm.action || '').toLowerCase() === 'accept' && confirm.content?.confirm === true;
}

function mrtrCancelled(toolName) {
  return {
    content: [{ type: 'text', text: `已取消：未执行 ${toolName}` }],
    structuredContent: { cancelled: true, tool: toolName },
    isError: false,
  };
}

function createTask(data) {
  const taskId = `local-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  TASKS.set(taskId, {
    taskId, status: 'completed', createdAt: now, lastUpdatedAt: now,
    ttlMs: TASK_TTL_MS, pollIntervalMs: TASK_POLL_INTERVAL_MS,
    result: {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data },
      isError: false,
    },
  });
  return { taskId, status: 'completed', createdAt: now, lastUpdatedAt: now, ttlMs: TASK_TTL_MS, pollIntervalMs: TASK_POLL_INTERVAL_MS, resultType: 'task' };
}

async function handleRaw(request) {
  if (!request || request.jsonrpc !== '2.0') return error(null, -32600, 'Invalid Request');
  const id = request.id;
  const method = String(request.method || '');
  if (method === 'notifications/initialized') return null;
  if (method === 'initialize') {
    const requested = String(request.params?.protocolVersion || '');
    return response(id, {
      protocolVersion: !requested ? LATEST_PROTOCOL_VERSION
        : (SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LEGACY_COMPAT_PROTOCOL_VERSION),
      supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        extensions: { 'io.modelcontextprotocol/tasks': {}, 'io.modelcontextprotocol/ui': {} },
      },
      serverInfo: { name: 'ESQueryStudio Local', version: '1.0.0', mode: 'local', writes: allowWrite },
      recommendedTools: Object.keys(GROUP_ACTIONS),
      maxRecommendedTools: Object.keys(GROUP_ACTIONS).length,
      instructions: 'ESQueryStudio exposes Elasticsearch tools with per-connection permissions. '
        + 'Call es_connections with action=list first, then pass connection on every call. '
        + 'Read tools require read; writes require write and an explicitly write-enabled key or local switch. '
        + 'The client-facing surface is 17 action-typed tools; every call passes action plus that action arguments. recommendedTools lists the groups to load first (maxRecommendedTools=17). '
        + 'Resources expose connection, cluster and index metadata; prompts provide guided diagnostics. '
        + 'Tool failures are returned as isError results, not protocol errors.',
    });
  }
  if (method === 'server/discover') {
    return response(id, {
      supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        extensions: { 'io.modelcontextprotocol/tasks': {}, 'io.modelcontextprotocol/ui': {} },
      },
      serverInfo: { name: 'ESQueryStudio Local', version: '1.0.0', mode: 'local', writes: allowWrite },
      instructions: 'ESQueryStudio local Node MCP over stdio; per-connection permissions and write opt-in. '
        + 'Load recommendedTools first (maxRecommendedTools=17) when the client has a tool budget.',
      recommendedTools: Object.keys(GROUP_ACTIONS),
      maxRecommendedTools: Object.keys(GROUP_ACTIONS).length,
      recentCalls: RECENT_CALLS.slice(),
      auditRetentionDays: 30,
      auditFile: AUDIT_FILE,
      ...CACHE_FIELDS,
    });
  }
  if (method === 'ping') return response(id, {});
  if (method === 'tools/list') return response(id, { tools: tools(), ...CACHE_FIELDS });
  if (method === 'resources/list') return response(id, { resources: resources(), ...CACHE_FIELDS });
  if (method === 'resources/templates/list') return response(id, { resourceTemplates: RESOURCE_TEMPLATES, ...CACHE_FIELDS });
  if (method === 'resources/read') {
    try {
      return response(id, { ...(await readResource(String(request.params?.uri || ''))), ...CACHE_FIELDS });
    } catch (e) {
      return error(id, -32602, String(e?.message || e));
    }
  }
  if (method === 'prompts/list') return response(id, { prompts: PROMPTS, ...CACHE_FIELDS });
  if (method === 'prompts/get') {
    try {
      return response(id, getPrompt(String(request.params?.name || ''), request.params?.arguments || {}));
    } catch (e) {
      return error(id, -32602, String(e?.message || e));
    }
  }
  if (method === 'completion/complete') {
    const argument = request.params?.argument || {};
    const name = String(argument.name || '');
    const prefix = String(argument.value || '').trim().toLowerCase();
    let values = [];
    if (name === 'connection') {
      values = config.connections.map((c) => c.id);
    } else if (name === 'index' || name === 'source' || name === 'target') {
      try {
        const rows = await callTool('es_list_indices', {});
        values = (Array.isArray(rows) ? rows : []).map((row) => String(row?.index || '')).filter(Boolean);
      } catch { /* 当前连接不可达时返回空补全 */ }
    }
    values = values.filter((value) => !prefix || value.toLowerCase().startsWith(prefix)).slice(0, 50);
    return response(id, { completion: { values, total: values.length, hasMore: false } });
  }
  if (method === 'tasks/get') {
    const taskId = String(request.params?.taskId || '').trim();
    const task = TASKS.get(taskId);
    if (!task) return error(id, -32602, `Unknown task: ${taskId}`);
    return response(id, { ...task });
  }
  if (method === 'tasks/update' || method === 'tasks/cancel') {
    return response(id, {});
  }
  if (method === 'tools/call') {
    const params = request.params || {};
    try {
      const toolName = String(params.name || '');
      const rawArgs = { ...(params.arguments || {}) };
      const normalized = normalizeGroupCall(toolName, rawArgs);
      const callName = normalized.name;
      const callArgs = normalized.args;
      if (declaresElicitation(request) && mrtrNeedsConfirmation(callName, callArgs)) {
        /* 先剥 elicitation 回传键再做 digest 验签：客户端把 inputResponses/requestState
           嵌进 arguments 重发时，剩余参数须与首次请求的干净参数 canonical 一致 */
        const responses = params.inputResponses ?? rawArgs.inputResponses;
        const state = params.requestState ?? rawArgs.requestState;
        delete callArgs.inputResponses;
        delete callArgs.requestState;
        if (responses == null) return response(id, mrtrInputRequired(callName, callArgs));
        if (!mrtrVerify(String(state || ''), callName, callArgs)) {
          return error(id, -32602, 'Invalid or expired confirmation state');
        }
        if (!mrtrConfirmed(responses)) return response(id, mrtrCancelled(callName));
      }
      const data = await callTool(callName, callArgs);
      if (declaresTasks(request) && TASK_TOOLS.has(callName)) {
        return response(id, createTask(data));
      }
      return response(id, {
        content: [{ type: 'text', text: JSON.stringify(data) }],
        structuredContent: data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data },
        isError: false,
      });
    } catch (e) {
      return response(id, { content: [{ type: 'text', text: String(e?.message || e) }], isError: true });
    }
  }
  return error(id, -32601, `Method not found: ${method}`);
}

async function handle(request) {
  const started = Date.now();
  const result = await handleRaw(request);
  recordCall(request, result, Date.now() - started);
  return result;
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const write = (value) => process.stdout.write(JSON.stringify(value) + '\n');
rl.on('line', async (line) => {
  const text = String(line || '').trim();
  if (!text) return;
  let request;
  try { request = JSON.parse(text); }
  catch { write(error(null, -32700, 'Parse error')); return; }
  try {
    const result = await handle(request);
    if (result != null) write(result);
  } catch (e) {
    write(error(request?.id ?? null, -32603, String(e?.message || e)));
  }
});
