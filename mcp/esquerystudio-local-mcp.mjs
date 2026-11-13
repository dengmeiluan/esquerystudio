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
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
const MRTR_CONFIRM_TOOLS = new Set(['es_delete_by_query', 'es_delete_index', 'es_delete_doc', 'es_delete_data_stream', 'es_rest']);
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
<div class="grid"><div class="cell"><b>15 groups</b><span>130 legacy actions</span></div>
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
];

const GROUP_ACTIONS = {
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
const GROUP_DESCRIPTIONS = {
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
    data = await callTool('es_connections', { action: 'list' });
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

async function callTool(name, args = {}) {
  ({ name, args } = normalizeGroupCall(name, args));
  if (WRITE_TOOLS.includes(name) && !allowWrite) {
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

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
      const legacy = actions[action];
      return allowWrite || !WRITE_TOOLS.includes(legacy) || legacy === 'es_rest';
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
    out.push({
      name,
      description: GROUP_DESCRIPTIONS[name] + ' Actions: ' + allowed.join(', ')
        + '. Pass action plus the same arguments as the corresponding legacy tool.',
      inputSchema: { type: 'object', properties, required: ['action'] },
      annotations: {
        readOnlyHint: allowed.every((action) => !WRITE_TOOLS.includes(actions[action]) && actions[action] !== 'es_rest'),
        destructiveHint: allowed.some((action) => WRITE_TOOLS.includes(actions[action]) || actions[action] === 'es_rest'),
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: MCP_APP_URI } },
    });
  }
  return out;
}

function normalizeGroupCall(name, args = {}) {
  const actions = GROUP_ACTIONS[name];
  if (!actions) return { name, args };
  if (args.action == null && TOOL_DEFINITIONS.some(tool => tool.name === name)) return { name, args };
  const action = String(args.action || '').trim();
  const legacy = actions[action];
  if (!legacy) throw new Error('Unknown action ' + action + ' for ' + name + '; expected one of ' + Object.keys(actions).join(', '));
  const rest = { ...args };
  delete rest.action;
  return { name: legacy, args: rest };
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
        + 'The client-facing surface is 15 action-typed tools; call with action plus legacy arguments. recommendedTools lists the groups to load first (maxRecommendedTools=15). '
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
        + 'Load recommendedTools first (maxRecommendedTools=15) when the client has a tool budget.',
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
        const responses = params.inputResponses ?? rawArgs.inputResponses;
        const state = params.requestState ?? rawArgs.requestState;
        if (responses == null) return response(id, mrtrInputRequired(callName, callArgs));
        if (!mrtrVerify(String(state || ''), callName, callArgs)) {
          return error(id, -32602, 'Invalid or expired confirmation state');
        }
        if (!mrtrConfirmed(responses)) return response(id, mrtrCancelled(callName));
        delete callArgs.inputResponses;
        delete callArgs.requestState;
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
