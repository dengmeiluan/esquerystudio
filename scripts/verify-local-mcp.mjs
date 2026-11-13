#!/usr/bin/env node
/* Smoke test for mcp/esquerystudio-local-mcp.mjs against a mock Elasticsearch.
 * Proves: stdio MCP handshake, multi-connection discovery, read tools, write
 * opt-in, and real HTTP calls without Spring Boot or a browser. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function mockEs() {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
      if (req.url.startsWith('/_cluster/health')) return send({ status: 'green', number_of_nodes: 1 });
      if (req.url === '/' || req.url === '') return send({ version: { number: '8.13.0' } });
      if (req.url.startsWith('/_cat/indices')) return send([{ index: 'research' }, { index: '.system' }]);
      if (req.url.startsWith('/_data_stream')) return send(req.method === 'GET' ? { data_streams: [{ name: 'logs-app' }] } : { acknowledged: true });
      if (req.url.startsWith('/_component_template')) return send({ component_templates: [{ name: 'base' }] });
      if (req.url.includes('/_clone/') || req.url.includes('/_shrink/') || req.url.includes('/_split/')) return send({ acknowledged: true });
      if (req.url.startsWith('/research/_mapping')) {
        return req.method === 'PUT'
          ? send({ acknowledged: true })
          : send({ research: { mappings: { properties: { title: { type: 'text' } } } } });
      }
      if (req.url.startsWith('/research/_settings')) return send({ acknowledged: true });
      if (req.url.startsWith('/research/_forcemerge')) return send({ _shards: { total: 1, successful: 1, failed: 0 } });
      if (req.url.startsWith('/research/_search')) return send({ hits: { hits: [] } });
      if (req.url.startsWith('/research/_mget')) return send({ docs: [{ _id: '1' }, { _id: '2' }] });
      if (req.url.startsWith('/research/_update_by_query')) return send({ updated: 2 });
      if (req.url.startsWith('/research/_delete_by_query')) return send({ deleted: 1 });
      if (req.url.startsWith('/_reindex')) return send({ created: 2 });
      if (req.url.startsWith('/research/_analyze')) return send({ tokens: [{ token: 'x', position: 0 }] });
      if (req.url.startsWith('/research/_validate/query')) return send({ valid: true, explanations: [] });
      if (req.url.startsWith('/research/_termvectors/1')) return send({ term_vectors: {} });
      if (req.url.startsWith('/research/_search/template')) return send({ hits: { hits: [] } });
      if (req.url.startsWith('/_render/template')) return send({ template_output: {} });
      if (req.url.startsWith('/research/_alias')) return send({ research: { aliases: {} } });
      if (req.url.startsWith('/_cluster/allocation/explain')) return send({ index: 'research', shard: 0 });
      if (req.url.startsWith('/research/_shard_stores')) return send({ indices: { research: { shards: {} } } });
      if (req.url.startsWith('/_cluster/pending_tasks')) return send({ tasks: [] });
      if (req.url.startsWith('/_slm/policy')) return send(req.method === 'GET' ? { policies: {} } : { acknowledged: true });
      if (req.url.startsWith('/_slm/status')) return send({ operation_mode: 'RUNNING' });
      if (req.url.startsWith('/_slm/stats')) return send({ snapshots_taken: 1 });
      if (req.url.startsWith('/_cluster/settings')) return send(req.method === 'PUT' ? { acknowledged: true } : { persistent: {}, transient: {}, defaults: {} });
      if (req.url.startsWith('/_cluster/reroute')) return send({ acknowledged: true });
      if (req.url.startsWith('/_snapshot/repo1/_all')) return send({ snapshots: [{ snapshot: 's1' }] });
      if (req.url.startsWith('/_snapshot/repo1/s1/_status')) return send({ snapshots: [{ snapshot: 's1' }] });
      if (req.url.startsWith('/_snapshot/repo1/s2')) return send({ acknowledged: true });
      if (req.url.startsWith('/_snapshot')) return send({ repo1: { type: 'fs', settings: {} } });
      if (req.url.startsWith('/research/_ilm/explain')) return send({ indices: { research: { phase: 'hot' } } });
      if (req.url.startsWith('/_ilm/policy')) return send(req.method === 'GET' ? { policy1: { version: 1 } } : { acknowledged: true });
      if (req.url.startsWith('/_ilm/start')) return send({ acknowledged: true });
      if (req.url.startsWith('/_ilm/status')) return send({ operation_mode: 'RUNNING' });
      if (req.url.startsWith('/_cluster/state/metadata')) return send({ metadata: { stored_scripts: { s1: {} } } });
      if (req.url.startsWith('/_scripts/s1')) return send({ acknowledged: true });
      if (req.url.startsWith('/_tasks/')) return send({ task: { id: 'node:1' } });
      if (req.url.startsWith('/_sql')) return send({ columns: [], rows: [] });
      if (req.url.startsWith('/research/_doc/1')) return send({ result: 'updated', _id: '1' });
      if (req.url.startsWith('/research_new')) return send({ acknowledged: true, index: 'research_new' });
      if (req.url.startsWith('/research_alias/_rollover')) return send({ acknowledged: true, new_index: 'research-000002' });
      if (req.url.startsWith('/_aliases')) return send({ acknowledged: true });
      if (req.url.startsWith('/_index_template/tpl')) return send({ acknowledged: true });
      res.statusCode = 404;
      send({ error: { type: 'not_found', reason: req.url } });
    });
  });
}

function runLocal(configPath, extra = []) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [
      join(ROOT, 'mcp/esquerystudio-local-mcp.mjs'), '--config', configPath, ...extra,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', reject);
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'es_list_connections', arguments: {} } },
      { jsonrpc: '2.0', id: 68, method: 'tools/call', params: { name: 'es_connections', arguments: { action: 'list' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'es_list_indices', arguments: {} } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'es_cluster_health', arguments: {} } },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'es_rest', arguments: { method: 'POST', path: '/research/_search', body: {} } } },
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'es_rest', arguments: { method: 'POST', path: '/_bulk', body: {} } } },
      { jsonrpc: '2.0', id: 51, method: 'resources/list' },
      { jsonrpc: '2.0', id: 52, method: 'resources/templates/list' },
      { jsonrpc: '2.0', id: 53, method: 'resources/read', params: { uri: 'esquerystudio://connections' } },
      { jsonrpc: '2.0', id: 54, method: 'resources/read', params: { uri: 'esquerystudio://index/prod/research/mapping' } },
      { jsonrpc: '2.0', id: 55, method: 'prompts/list' },
      { jsonrpc: '2.0', id: 56, method: 'prompts/get', params: { name: 'diagnose_slow_query', arguments: { connection: 'prod', index: 'research' } } },
      { jsonrpc: '2.0', id: 57, method: 'tools/call', params: { name: 'es_list_data_streams', arguments: {} } },
      { jsonrpc: '2.0', id: 58, method: 'tools/call', params: { name: 'es_get_data_stream', arguments: { name: 'logs-app' } } },
      { jsonrpc: '2.0', id: 59, method: 'tools/call', params: { name: 'es_data_stream_stats', arguments: { name: 'logs-app' } } },
      { jsonrpc: '2.0', id: 60, method: 'tools/call', params: { name: 'es_list_component_templates', arguments: {} } },
      { jsonrpc: '2.0', id: 66, method: 'completion/complete', params: { ref: { type: 'ref/prompt' }, argument: { name: 'connection', value: 'p' } } },
      { jsonrpc: '2.0', id: 67, method: 'completion/complete', params: { ref: { type: 'ref/prompt' }, argument: { name: 'index', value: 'res' } } },
      {
        jsonrpc: '2.0', id: 69, method: 'tools/call',
        _meta: { 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} } },
        params: { name: 'es_delete_by_query', arguments: { index: 'research', query: { match_all: {} } } },
      },
    ];
    if (extra.includes('--allow-write')) {
      requests.push(
        {
          jsonrpc: '2.0', id: 6, method: 'tools/call',
          params: { name: 'es_index_doc', arguments: { index: 'research', id: '1', document: { title: 'x' } } },
        },
        {
          jsonrpc: '2.0', id: 9, method: 'tools/call',
          params: { name: 'es_create_index', arguments: { index: 'research_new', settings: { number_of_shards: 1 }, mappings: { properties: { title: { type: 'text' } } } } },
        },
        {
          jsonrpc: '2.0', id: 10, method: 'tools/call',
          params: { name: 'es_put_mapping', arguments: { index: 'research', mappings: { properties: { tag: { type: 'keyword' } } } } },
        },
        {
          jsonrpc: '2.0', id: 11, method: 'tools/call',
          params: { name: 'es_update_settings', arguments: { index: 'research', settings: { index: { number_of_replicas: 1 } } } },
        },
        {
          jsonrpc: '2.0', id: 12, method: 'tools/call',
          params: { name: 'es_alias', arguments: { actions: [{ add: { index: 'research', alias: 'research_alias' } }] } },
        },
        {
          jsonrpc: '2.0', id: 13, method: 'tools/call',
          params: { name: 'es_rollover', arguments: { alias: 'research_alias', dryRun: true } },
        },
        {
          jsonrpc: '2.0', id: 14, method: 'tools/call',
          params: { name: 'es_force_merge', arguments: { index: 'research', maxNumSegments: 1 } },
        },
        {
          jsonrpc: '2.0', id: 15, method: 'tools/call',
          params: { name: 'es_put_template', arguments: { name: 'tpl', template: { index_patterns: ['research-*'], template: { settings: { number_of_shards: 1 } } } } },
        },
        {
          jsonrpc: '2.0', id: 16, method: 'tools/call',
          params: { name: 'es_delete_template', arguments: { name: 'tpl' } },
        },
        {
          jsonrpc: '2.0', id: 17, method: 'tools/call',
          params: { name: 'es_delete_index', arguments: { index: 'research_new' } },
        },
        {
          jsonrpc: '2.0', id: 18, method: 'tools/call',
          params: { name: 'es_update_by_query', arguments: { index: 'research', query: { term: { status: 'draft' } }, script: { source: 'ctx._source.x = 1' }, maxDocs: 10 } },
        },
        {
          jsonrpc: '2.0', id: 19, method: 'tools/call',
          params: { name: 'es_delete_by_query', arguments: { index: 'research', query: { term: { status: 'draft' } } } },
        },
        {
          jsonrpc: '2.0', id: 20, method: 'tools/call',
          params: { name: 'es_reindex', arguments: { body: { source: { index: 'research' }, dest: { index: 'research_copy' } } } },
        },
        {
          jsonrpc: '2.0', id: 21, method: 'tools/call',
          params: { name: 'es_analyze', arguments: { index: 'research', body: { analyzer: 'standard', text: 'hello' } } },
        },
        { jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'es_get_cluster_settings', arguments: {} } },
        { jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'es_list_snapshot_repos', arguments: {} } },
        { jsonrpc: '2.0', id: 24, method: 'tools/call', params: { name: 'es_list_snapshots', arguments: { repo: 'repo1' } } },
        { jsonrpc: '2.0', id: 25, method: 'tools/call', params: { name: 'es_snapshot_status', arguments: { repo: 'repo1', name: 's1' } } },
        { jsonrpc: '2.0', id: 26, method: 'tools/call', params: { name: 'es_ilm_policies', arguments: {} } },
        { jsonrpc: '2.0', id: 27, method: 'tools/call', params: { name: 'es_list_scripts', arguments: {} } },
        { jsonrpc: '2.0', id: 28, method: 'tools/call', params: { name: 'es_task_detail', arguments: { taskId: 'node:1' } } },
        { jsonrpc: '2.0', id: 29, method: 'tools/call', params: { name: 'es_update_cluster_settings', arguments: { body: { persistent: { 'cluster.routing.allocation.enable': 'all' } } } } },
        { jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'es_reroute', arguments: { body: { commands: [] }, dryRun: true } } },
        { jsonrpc: '2.0', id: 31, method: 'tools/call', params: { name: 'es_create_snapshot', arguments: { repo: 'repo1', name: 's2' } } },
        { jsonrpc: '2.0', id: 32, method: 'tools/call', params: { name: 'es_delete_snapshot', arguments: { repo: 'repo1', name: 's2' } } },
        { jsonrpc: '2.0', id: 33, method: 'tools/call', params: { name: 'es_put_ilm_policy', arguments: { name: 'policy1', policy: { policy: { phases: {} } } } } },
        { jsonrpc: '2.0', id: 34, method: 'tools/call', params: { name: 'es_delete_ilm_policy', arguments: { name: 'policy1' } } },
        { jsonrpc: '2.0', id: 35, method: 'tools/call', params: { name: 'es_put_script', arguments: { id: 's1', script: { script: { lang: 'painless', source: '1' } } } } },
        { jsonrpc: '2.0', id: 36, method: 'tools/call', params: { name: 'es_delete_script', arguments: { id: 's1' } } },
        { jsonrpc: '2.0', id: 37, method: 'tools/call', params: { name: 'es_ilm_start', arguments: {} } },
        { jsonrpc: '2.0', id: 38, method: 'tools/call', params: { name: 'es_ilm_status', arguments: {} } },
        { jsonrpc: '2.0', id: 39, method: 'tools/call', params: { name: 'es_validate_query', arguments: { index: 'research', body: { query: { match_all: {} } } } } },
        { jsonrpc: '2.0', id: 40, method: 'tools/call', params: { name: 'es_term_vectors', arguments: { index: 'research', id: '1', fields: 'title' } } },
        { jsonrpc: '2.0', id: 41, method: 'tools/call', params: { name: 'es_search_template', arguments: { index: 'research', body: { source: { query: { match_all: {} } } } } } },
        { jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 'es_render_template', arguments: { body: { source: { query: { match_all: {} } } } } } },
        { jsonrpc: '2.0', id: 43, method: 'tools/call', params: { name: 'es_index_detail', arguments: { index: 'research', sampleSize: 1 } } },
        { jsonrpc: '2.0', id: 44, method: 'tools/call', params: { name: 'es_allocation_explain', arguments: { body: { index: 'research', shard: 0 } } } },
        { jsonrpc: '2.0', id: 45, method: 'tools/call', params: { name: 'es_shard_stores', arguments: { index: 'research', status: 'red,yellow' } } },
        { jsonrpc: '2.0', id: 46, method: 'tools/call', params: { name: 'es_pending_tasks', arguments: {} } },
        { jsonrpc: '2.0', id: 47, method: 'tools/call', params: { name: 'es_slm_policies', arguments: {} } },
        { jsonrpc: '2.0', id: 48, method: 'tools/call', params: { name: 'es_slm_status', arguments: {} } },
        { jsonrpc: '2.0', id: 49, method: 'tools/call', params: { name: 'es_slm_execute', arguments: { policyId: 'nightly' } } },
        { jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'es_mget', arguments: { index: 'research', ids: ['1', '2'] } } },
        { jsonrpc: '2.0', id: 61, method: 'tools/call', params: { name: 'es_create_data_stream', arguments: { name: 'logs-app' } } },
        { jsonrpc: '2.0', id: 62, method: 'tools/call', params: { name: 'es_clone_index', arguments: { index: 'research', target: 'research_clone', body: { settings: { number_of_shards: 1 } } } } },
        { jsonrpc: '2.0', id: 63, method: 'tools/call', params: { name: 'es_shrink_index', arguments: { index: 'research', target: 'research_shrink' } } },
        { jsonrpc: '2.0', id: 64, method: 'tools/call', params: { name: 'es_split_index', arguments: { index: 'research', target: 'research_split' } } },
        { jsonrpc: '2.0', id: 65, method: 'tools/call', params: { name: 'es_delete_data_stream', arguments: { name: 'logs-app' } } },
      );
    }
    child.stdin.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
    setTimeout(() => { child.kill(); resolveRun(out); }, 3500);
  });
}

function responses(text) {
  return text.split('\n').filter((line) => line.trim().startsWith('{')).map((line) => JSON.parse(line));
}
function toolResult(responsesList, id) {
  const hit = responsesList.find((r) => r.id === id);
  assert.ok(hit?.result?.content?.[0]?.text, `response ${id} must be a tool result`);
  return JSON.parse(hit.result.content[0].text);
}

const server = mockEs();
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const dir = mkdtempSync(join(tmpdir(), 'esq-local-mcp-'));
const configPath = join(dir, 'mcp.json');
writeFileSync(configPath, JSON.stringify({
  defaultConnection: 'prod',
  connections: [
    { id: 'prod', name: 'Production', url: `http://127.0.0.1:${port}`, username: 'elastic', password: 'secret' },
    { id: 'qa', name: 'QA', url: `http://127.0.0.1:${port}`, apiKey: 'id:key' },
  ],
}), 'utf8');

try {
  const readOnly = responses(await runLocal(configPath));
  const init = readOnly.find((r) => r.id === 1)?.result;
  assert.equal(init.resultType, 'complete');
  assert.equal(init.protocolVersion, '2026-07-28');
  assert.deepEqual(init.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
  assert.equal(init.recommendedTools.length, 15);
  assert.equal(init.maxRecommendedTools, 15);
  assert.equal(init.serverInfo.mode, 'local');
  assert.equal(init.serverInfo.writes, false);
  assert.ok(init.instructions.includes('es_connections'));

  const listedTools = readOnly.find((r) => r.id === 2).result.tools;
  const readTools = listedTools.map((t) => t.name);
  assert.equal(listedTools.length, 15, 'client-facing tool surface must be 15 action groups');
  assert.equal(listedTools.find((t) => t.name === 'es_rest').annotations.readOnlyHint, false);
  assert.ok(readTools.includes('es_connections'));
  assert.ok(readTools.includes('es_search') && readTools.includes('es_indices'), 'read groups stay visible');
  const readDocs = listedTools.find((t) => t.name === 'es_documents');
  const readDocsActions = readDocs.inputSchema.properties.action.enum;
  assert.ok(readDocsActions.includes('get') && !readDocsActions.includes('index'),
    'write actions must be hidden without --allow-write');
  const readIndices = listedTools.find((t) => t.name === 'es_indices');
  assert.ok(readIndices.inputSchema.properties.action.enum.includes('list'));
  assert.ok(!readIndices.inputSchema.properties.action.enum.includes('create'));
  assert.deepEqual(toolResult(readOnly, 3).map((c) => c.id), ['prod', 'qa']);
  assert.deepEqual(toolResult(readOnly, 68).map((c) => c.id), ['prod', 'qa']);
  assert.deepEqual(toolResult(readOnly, 4).map((i) => i.index), ['research']);
  assert.equal(toolResult(readOnly, 5).status, 'green');
  assert.equal(toolResult(readOnly, 5).version, '8.13.0');
  const rawRead = readOnly.find((r) => r.id === 7)?.result;
  assert.equal(rawRead?.isError, false, 'POST _search is a read query and must pass without --allow-write');
  const rawWrite = readOnly.find((r) => r.id === 8)?.result;
  assert.equal(rawWrite?.isError, true, 'POST _bulk must stay blocked without --allow-write');

  assert.deepEqual(readOnly.find((r) => r.id === 51).result.resources.map((r) => r.uri),
    ['ui://esquerystudio/tool-console', 'esquerystudio://connections', 'esquerystudio://connection/prod', 'esquerystudio://connection/qa']);
  assert.equal(readOnly.find((r) => r.id === 51).result.resources[0].mimeType, 'text/html;profile=mcp-app');
  assert.equal(readOnly.find((r) => r.id === 51).result.resources[1].name, '连接目录');
  const localConnectionResource = readOnly.find((r) => r.id === 51).result.resources
    .find((r) => r.uri === 'esquerystudio://connection/prod');
  assert.equal(localConnectionResource.name, '连接 · Production');
  assert.ok(!localConnectionResource.name.includes('connection-prod'), 'resource names must be human-readable');
  assert.equal(readOnly.find((r) => r.id === 52).result.resourceTemplates.length, 8);
  const mrtr = readOnly.find((r) => r.id === 69)?.result;
  assert.equal(mrtr?.resultType, 'input_required', 'MRTR must return input_required before destructive write');
  assert.equal(mrtr?.inputRequests?.confirm?.method, 'elicitation/create');
  assert.ok(mrtr?.requestState, 'MRTR must return a requestState');
  assert.equal(readOnly.find((r) => r.id === 52).result.resourceTemplates[0].name, '连接详情');
  assert.deepEqual(JSON.parse(readOnly.find((r) => r.id === 53).result.contents[0].text).map((c) => c.id),
    ['prod', 'qa']);
  assert.equal(JSON.parse(readOnly.find((r) => r.id === 54).result.contents[0].text).index, 'research');
  assert.deepEqual(readOnly.find((r) => r.id === 55).result.prompts.map((p) => p.name),
    ['diagnose_slow_query', 'design_index_mapping', 'migrate_index', 'review_cluster_capacity', 'triage_failed_search']);
  const guided = readOnly.find((r) => r.id === 56).result.messages[0].content.text;
  assert.ok(guided.includes('`prod`') && guided.includes('`research`') && guided.includes('es_search'));
  assert.ok(toolResult(readOnly, 57).data_streams);
  assert.equal(toolResult(readOnly, 58).data_streams[0].name, 'logs-app');
  assert.ok(toolResult(readOnly, 59).data_streams);
  assert.equal(toolResult(readOnly, 60).component_templates[0].name, 'base');
  const completion = readOnly.find((r) => r.id === 66).result.completion;
  assert.deepEqual(completion.values, ['prod']);
  assert.equal(completion.hasMore, false);
  const indexCompletion = readOnly.find((r) => r.id === 67).result.completion;
  assert.deepEqual(indexCompletion.values, ['research']);

  const writable = responses(await runLocal(configPath, ['--allow-write']));
  const writableGroups = writable.find((r) => r.id === 2).result.tools;
  const docsActions = writableGroups.find((t) => t.name === 'es_documents').inputSchema.properties.action.enum;
  for (const action of ['index', 'update', 'delete', 'bulk']) {
    assert.ok(docsActions.includes(action), `${action} must be visible with --allow-write`);
  }
  const indexActions = writableGroups.find((t) => t.name === 'es_indices').inputSchema.properties.action.enum;
  for (const action of ['create', 'delete', 'put_mapping', 'update_settings', 'alias', 'rollover', 'force_merge']) {
    assert.ok(indexActions.includes(action), `${action} must be visible with --allow-write`);
  }
  const templateActions = writableGroups.find((t) => t.name === 'es_templates').inputSchema.properties.action.enum;
  assert.ok(templateActions.includes('put') && templateActions.includes('delete'));
  assert.equal(toolResult(writable, 6).result, 'updated');
  assert.equal(toolResult(writable, 9).index, 'research_new');
  assert.equal(toolResult(writable, 10).acknowledged, true);
  assert.equal(toolResult(writable, 11).acknowledged, true);
  assert.equal(toolResult(writable, 12).acknowledged, true);
  assert.equal(toolResult(writable, 13).new_index, 'research-000002');
  assert.equal(toolResult(writable, 14)._shards.total, 1);
  assert.equal(toolResult(writable, 15).acknowledged, true);
  assert.equal(toolResult(writable, 16).acknowledged, true);
  assert.equal(toolResult(writable, 17).index, 'research_new');
  assert.equal(toolResult(writable, 18).updated, 2);
  assert.equal(toolResult(writable, 19).deleted, 1);
  assert.equal(toolResult(writable, 20).created, 2);
  assert.equal(toolResult(writable, 21).tokens[0].token, 'x');
  assert.deepEqual(toolResult(writable, 22).persistent, {});
  assert.equal(toolResult(writable, 23)[0].name, 'repo1');
  assert.equal(toolResult(writable, 24)[0].snapshot, 's1');
  assert.equal(toolResult(writable, 25).snapshots[0].snapshot, 's1');
  assert.equal(toolResult(writable, 26)[0].name, 'policy1');
  assert.equal(toolResult(writable, 27).count, 1);
  assert.equal(toolResult(writable, 28).task.id, 'node:1');
  assert.equal(toolResult(writable, 29).acknowledged, true);
  assert.equal(toolResult(writable, 30).acknowledged, true);
  assert.equal(toolResult(writable, 31).acknowledged, true);
  assert.equal(toolResult(writable, 32).acknowledged, true);
  assert.equal(toolResult(writable, 33).acknowledged, true);
  assert.equal(toolResult(writable, 34).acknowledged, true);
  assert.equal(toolResult(writable, 35).acknowledged, true);
  assert.equal(toolResult(writable, 36).acknowledged, true);
  assert.equal(toolResult(writable, 37).acknowledged, true);
  assert.equal(toolResult(writable, 38).operation_mode, 'RUNNING');
  assert.equal(toolResult(writable, 39).valid, true);
  assert.ok(toolResult(writable, 40).term_vectors);
  assert.ok(toolResult(writable, 41).hits);
  assert.ok(toolResult(writable, 42).template_output);
  assert.equal(toolResult(writable, 43).name, 'research');
  assert.equal(toolResult(writable, 44).index, 'research');
  assert.ok(toolResult(writable, 45).indices);
  assert.ok(Array.isArray(toolResult(writable, 46).tasks));
  assert.ok(toolResult(writable, 47).policies);
  assert.equal(toolResult(writable, 48).status.operation_mode, 'RUNNING');
  assert.equal(toolResult(writable, 49).acknowledged, true);
  assert.equal(toolResult(writable, 50).docs.length, 2);
  assert.equal(toolResult(writable, 61).acknowledged, true);
  assert.equal(toolResult(writable, 62).acknowledged, true);
  assert.equal(toolResult(writable, 63).acknowledged, true);
  assert.equal(toolResult(writable, 64).acknowledged, true);
  assert.equal(toolResult(writable, 65).acknowledged, true);

  console.log('[local-mcp] OK — stdio handshake, 2 connections, read tools, write opt-in, resources/prompts, data streams/index topology, direct ES HTTP, index lifecycle, batch data ops, cluster/snapshot/ILM/scripts/diagnostics');
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
