import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/browserApi', () => ({ browserFetch: vi.fn() }));
import { browserFetch } from '../platform/browserApi';
import {
  handleMcpRequest, isMcpRestReadOnly, MCP_DESTRUCTIVE_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES,
  MCP_STATIC_RESOURCES, MCP_TOOLS, MCP_TOOL_GROUPS, MCP_TOOL_PACKS, MCP_WRITE_TOOLS, MCP_GROUP_ACTIONS, setBrowserMcpWriteAllowed,
} from '../platform/browserMcp';

const fetchMock = browserFetch as unknown as ReturnType<typeof vi.fn>;
const reply = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('browser MCP bridge', () => {
  beforeEach(() => { fetchMock.mockReset(); setBrowserMcpWriteAllowed(false); });

  it('initializes and advertises the same tool family as server mode', async () => {
    const init = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(init.result.protocolVersion).toBe('2026-07-28');
    const legacy = await handleMcpRequest({
      jsonrpc: '2.0', id: 11, method: 'initialize', params: { protocolVersion: '2025-06-18' },
    });
    expect(legacy.result.protocolVersion).toBe('2025-06-18');
    const discover = await handleMcpRequest({ jsonrpc: '2.0', id: 12, method: 'server/discover' });
    expect(discover.result.supportedVersions).toEqual(['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
    expect(discover.result.recommendedTools).toHaveLength(15);
    expect(discover.result.maxRecommendedTools).toBe(15);
    expect(init.result.serverInfo).toMatchObject({ name: 'ESQueryStudio', mode: 'browser' });
    const list = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.result.tools.map((t: any) => t.name)).toEqual(Object.keys(MCP_GROUP_ACTIONS));
  });

  it('dispatches action-typed group tools to legacy handlers', async () => {
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 31, method: 'tools/call',
      params: { name: 'es_connections', arguments: { action: 'list' } },
    });
    expect(out.result.isError).toBe(false);
    expect(out.result.content[0].text).toBe('[]');
  });

  it('keeps the default core tool pack under the 80-tool client budget', () => {
    const core = MCP_TOOL_PACKS.find(pack => pack.id === 'core')!;
    const names = new Set(MCP_TOOLS.map(tool => tool.name));
    expect(core.tools.length).toBeGreaterThan(15);
    expect(core.tools.length).toBeLessThanOrEqual(80);
    expect(new Set(core.tools).size).toBe(core.tools.length);
    for (const tool of core.tools) expect(names.has(tool)).toBe(true);
    expect(MCP_TOOL_PACKS.find(pack => pack.id === 'full')!.tools.length).toBe(MCP_TOOLS.length);
  });

  it('advertises resources and prompts alongside tools', async () => {    const init = await handleMcpRequest({ jsonrpc: '2.0', id: 21, method: 'initialize' });
    expect(init.result.capabilities).toMatchObject({
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    });
    expect(init.result.capabilities.extensions).toMatchObject({
      'io.modelcontextprotocol/tasks': {},
      'io.modelcontextprotocol/ui': {},
    });
    expect(init.result.instructions).toContain('es_connections');
    const prompts = await handleMcpRequest({ jsonrpc: '2.0', id: 22, method: 'prompts/list' });
    expect(prompts.result.prompts.map((p: any) => p.name)).toEqual(MCP_PROMPTS.map(p => p.name));
    const templates = await handleMcpRequest({ jsonrpc: '2.0', id: 23, method: 'resources/templates/list' });
    expect(templates.result.resourceTemplates.map((r: any) => r.uriTemplate))
      .toEqual(MCP_RESOURCE_TEMPLATES.map(r => r.uriTemplate));
  });

  it('completes connection arguments from local profiles', async () => {
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'qa', name: 'QA', url: 'http://localhost:9200' },
      { id: 'prod', name: 'Prod', url: 'http://localhost:9201' },
    ]));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 30, method: 'completion/complete',
      params: { ref: { type: 'ref/prompt' }, argument: { name: 'connection', value: 'q' } },
    });
    expect(out.result.completion.values).toEqual(['qa']);
    expect(out.result.completion.hasMore).toBe(false);
  });

  it('lists connection resources and reads the active connection only', async () => {
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'qa', name: 'QA', url: 'http://localhost:9200' },
      { id: 'prod', name: 'Prod', url: 'http://localhost:9201' },
    ]));
    localStorage.removeItem('esquerystudio.browser.active');
    const list = await handleMcpRequest({ jsonrpc: '2.0', id: 24, method: 'resources/list' });
    expect(list.result.resources[0]).toMatchObject({
      uri: 'ui://esquerystudio/tool-console',
      mimeType: 'text/html;profile=mcp-app',
      _meta: { ui: { prefersBorder: true } },
    });
    expect(list.result.resources[1]).toMatchObject({ uri: MCP_STATIC_RESOURCES[0].uri, name: '连接目录' });
    expect(list.result.resources.map((r: any) => r.uri)).toContain('esquerystudio://connection/qa');
    expect(list.result.resources.map((r: any) => r.uri)).not.toContain('esquerystudio://connection/prod');
    const activeResource = list.result.resources.find((r: any) => r.uri === 'esquerystudio://connection/qa');
    expect(activeResource.name).toBe('连接 · QA');
    expect(activeResource.name).not.toContain('connection-qa');

    const app = await handleMcpRequest({
      jsonrpc: '2.0', id: 241, method: 'resources/read',
      params: { uri: 'ui://esquerystudio/tool-console' },
    });
    expect(app.result.contents[0]).toMatchObject({
      uri: 'ui://esquerystudio/tool-console',
      mimeType: 'text/html;profile=mcp-app',
      _meta: { ui: { csp: { connectDomains: [] }, prefersBorder: true } },
    });
    expect(app.result.contents[0].text).toContain('ESQUERYSTUDIO / MCP APP');
    const tools = await handleMcpRequest({ jsonrpc: '2.0', id: 242, method: 'tools/list' });
    for (const tool of tools.result.tools) {
      expect(tool._meta.ui.resourceUri).toBe('ui://esquerystudio/tool-console');
    }

    const connections = await handleMcpRequest({
      jsonrpc: '2.0', id: 25, method: 'resources/read',
      params: { uri: 'esquerystudio://connections' },
    });
    expect(JSON.parse(connections.result.contents[0].text).map((c: any) => c.id)).toEqual(['qa', 'prod']);

    const wrong = await handleMcpRequest({
      jsonrpc: '2.0', id: 26, method: 'resources/read',
      params: { uri: 'esquerystudio://connection/prod' },
    });
    expect(wrong.error.code).toBe(-32602);
    expect(wrong.error.message).toContain('active connection');

    fetchMock.mockResolvedValue(reply({ orders: { mappings: {} } }));
    const mapping = await handleMcpRequest({
      jsonrpc: '2.0', id: 27, method: 'resources/read',
      params: { uri: 'esquerystudio://index/qa/orders/mapping' },
    });
    expect(JSON.parse(mapping.result.contents[0].text)).toMatchObject({ orders: { mappings: {} } });
    expect(String(fetchMock.mock.calls[0][0])).toContain('mapping-detail');
  });

  it('renders guided prompts and rejects missing arguments', async () => {
    const got = await handleMcpRequest({
      jsonrpc: '2.0', id: 28, method: 'prompts/get',
      params: { name: 'diagnose_slow_query', arguments: { connection: 'qa', index: 'orders' } },
    });
    const text = got.result.messages[0].content.text;
    expect(text).toContain('`qa`');
    expect(text).toContain('`orders`');
    expect(text).toContain('es_search');
    const missing = await handleMcpRequest({
      jsonrpc: '2.0', id: 29, method: 'prompts/get',
      params: { name: 'diagnose_slow_query', arguments: {} },
    });
    expect(missing.error).toMatchObject({ code: -32602 });
    expect(missing.error.message).toContain('Missing required argument: connection');
  });

  it('routes tools/call through the browser transport and returns text content', async () => {
    fetchMock.mockResolvedValue(reply({ status: 'green', version: '8.13.0' }));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'es_cluster_health', arguments: {} },
    });
    expect(out.result.isError).toBe(false);
    expect(JSON.parse(out.result.content[0].text)).toMatchObject({ status: 'green' });
    expect(out.result.structuredContent).toMatchObject({ status: 'green' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/health');
  });

  it('requires MRTR elicitation confirmation before destructive browser writes', async () => {
    setBrowserMcpWriteAllowed(true);
    const meta = { 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} } };
    const args = { index: 'orders', query: { match_all: {} } };
    const first = await handleMcpRequest({
      jsonrpc: '2.0', id: 61, method: 'tools/call', _meta: meta,
      params: { name: 'es_delete_by_query', arguments: args },
    });
    expect(first.result.resultType).toBe('input_required');
    expect(first.result.inputRequests.confirm.method).toBe('elicitation/create');
    expect(fetchMock).not.toHaveBeenCalled();
    const state = first.result.requestState;
    const declined = await handleMcpRequest({
      jsonrpc: '2.0', id: 62, method: 'tools/call', _meta: meta,
      params: {
        name: 'es_delete_by_query', arguments: args,
        inputResponses: { confirm: { action: 'decline' } }, requestState: state,
      },
    });
    expect(declined.result.structuredContent).toMatchObject({ cancelled: true });
    expect(fetchMock).not.toHaveBeenCalled();
    const tampered = await handleMcpRequest({
      jsonrpc: '2.0', id: 63, method: 'tools/call', _meta: meta,
      params: {
        name: 'es_delete_by_query', arguments: args,
        inputResponses: { confirm: { action: 'accept', content: { confirm: true } } },
        requestState: 'tampered',
      },
    });
    expect(tampered.error.code).toBe(-32602);
  });

  it('accepts a full search body string and sends its query clause', async () => {
    fetchMock.mockResolvedValue(reply({ hits: { hits: [] } }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: {
        name: 'es_search',
        arguments: { index: 'research_report', query: '{"query":{"term":{"status":"published"}},"size":99}' },
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toEqual({ term: { status: 'published' } });
    expect(body.size).toBe(10);

    await handleMcpRequest({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: {
        name: 'es_search',
        arguments: {
          index: 'research_report',
          body: { aggs: { by_status: { terms: { field: 'status' } } }, sort: [{ created_at: 'desc' }] },
          size: 2,
          query: { term: { status: 'published' } },
        },
      },
    });
    const fullBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fullBody).toMatchObject({
      size: 2,
      query: { term: { status: 'published' } },
      aggs: { by_status: { terms: { field: 'status' } } },
      sort: [{ created_at: 'desc' }],
    });
  });

  it('classifies raw REST by operation, not just HTTP method', async () => {
    expect(isMcpRestReadOnly('GET', '/_cluster/health')).toBe(true);
    expect(isMcpRestReadOnly('POST', '/research/_search')).toBe(true);
    expect(isMcpRestReadOnly('POST', '/_sql')).toBe(true);
    expect(isMcpRestReadOnly('POST', '/_bulk')).toBe(false);
    setBrowserMcpWriteAllowed(false);
    fetchMock.mockResolvedValue(reply({ raw: 'ok' }));
    const read = await handleMcpRequest({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'es_rest', arguments: { method: 'POST', path: '/research/_search', body: {} } },
    });
    expect(read.result.isError).toBe(false);
    const write = await handleMcpRequest({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'es_rest', arguments: { method: 'POST', path: '/_bulk', body: {} } },
    });
    expect(write.result.isError).toBe(true);
    expect(write.result.content[0].text).toContain('未启用');
  });

  it('gates index lifecycle tools behind the write switch and maps them to browser endpoints', async () => {
    for (const name of ['es_create_index', 'es_delete_index', 'es_put_mapping', 'es_update_settings',
      'es_alias', 'es_rollover', 'es_force_merge', 'es_put_template', 'es_delete_template']) {
      expect(MCP_WRITE_TOOLS).toContain(name);
    }
    const blocked = await handleMcpRequest({
      jsonrpc: '2.0', id: 20, method: 'tools/call',
      params: { name: 'es_create_index', arguments: { index: 'new_idx' } },
    });
    expect(blocked.result.isError).toBe(true);
    expect(blocked.result.content[0].text).toContain('未启用');

    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ acknowledged: true }));
    const created = await handleMcpRequest({
      jsonrpc: '2.0', id: 21, method: 'tools/call',
      params: {
        name: 'es_create_index',
        arguments: { index: 'new_idx', settings: { number_of_shards: 1 }, mappings: { properties: { title: { type: 'text' } } } },
      },
    });
    expect(created.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/create-index?index=new_idx');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      settings: { number_of_shards: 1 },
      mapping: { properties: { title: { type: 'text' } } },
    });

    await handleMcpRequest({
      jsonrpc: '2.0', id: 22, method: 'tools/call',
      params: { name: 'es_alias', arguments: { actions: [{ add: { index: 'new_idx', alias: 'new_alias' } }] } },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cluster/alias-actions');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      actions: [{ add: { index: 'new_idx', alias: 'new_alias' } }],
    });
  });

  it('routes batch data tools and requires an explicit delete query', async () => {
    for (const name of ['es_update_by_query', 'es_delete_by_query', 'es_reindex']) {
      expect(MCP_WRITE_TOOLS).toContain(name);
    }
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ updated: 2 }));
    const updated = await handleMcpRequest({
      jsonrpc: '2.0', id: 30, method: 'tools/call',
      params: {
        name: 'es_update_by_query',
        arguments: { index: 'research', query: { term: { status: 'draft' } }, script: { source: 'ctx._source.x = 1' } },
      },
    });
    expect(updated.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/update-by-query?index=research');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      query: { term: { status: 'draft' } },
      script: { source: 'ctx._source.x = 1' },
    });

    const missing = await handleMcpRequest({
      jsonrpc: '2.0', id: 31, method: 'tools/call',
      params: { name: 'es_delete_by_query', arguments: { index: 'research' } },
    });
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toContain('query');

    fetchMock.mockResolvedValue(reply({ created: 2 }));
    const reindexed = await handleMcpRequest({
      jsonrpc: '2.0', id: 32, method: 'tools/call',
      params: { name: 'es_reindex', arguments: { body: { source: { index: 'a' }, dest: { index: 'b' } }, slices: 2 } },
    });
    expect(reindexed.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cluster/reindex-advanced?slices=2');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ source: { index: 'a' }, dest: { index: 'b' } });
  });

  it('routes cluster, snapshot, ILM and script tools', async () => {
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ ok: true }));
    const read = await handleMcpRequest({
      jsonrpc: '2.0', id: 40, method: 'tools/call',
      params: { name: 'es_get_cluster_settings', arguments: {} },
    });
    expect(read.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/settings');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 41, method: 'tools/call',
      params: { name: 'es_create_snapshot', arguments: { repo: 'repo1', name: 's1', body: { indices: 'research' } } },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cluster/snapshot/create?repo=repo1&name=s1');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ indices: 'research' });

    await handleMcpRequest({
      jsonrpc: '2.0', id: 42, method: 'tools/call',
      params: { name: 'es_ilm_start', arguments: {} },
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/cluster/ilm/start');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 43, method: 'tools/call',
      params: { name: 'es_put_script', arguments: { id: 's1', script: { script: { lang: 'painless', source: '1' } } } },
    });
    expect(String(fetchMock.mock.calls[3][0])).toContain('/cluster/scripts/put?id=s1');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ script: { lang: 'painless', source: '1' } });

    await handleMcpRequest({
      jsonrpc: '2.0', id: 44, method: 'tools/call',
      params: { name: 'es_task_detail', arguments: { taskId: 'node:1' } },
    });
    expect(String(fetchMock.mock.calls[4][0])).toContain('/cluster/task-detail?taskId=node%3A1');
  });

  it('routes diagnostics and SLM tools through the browser transport', async () => {
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ ok: true }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 50, method: 'tools/call',
      params: { name: 'es_validate_query', arguments: { index: 'research', body: { query: { match_all: {} } } } },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/validate-query?index=research');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 51, method: 'tools/call',
      params: { name: 'es_term_vectors', arguments: { index: 'research', id: '1', fields: 'title' } },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cluster/term-vectors?index=research&id=1&fields=title');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 52, method: 'tools/call',
      params: { name: 'es_index_detail', arguments: { index: 'research', sampleSize: 1 } },
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/cluster/inspect?index=research&sampleSize=1');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 53, method: 'tools/call',
      params: { name: 'es_slm_execute', arguments: { policyId: 'nightly' } },
    });
    expect(String(fetchMock.mock.calls[3][0])).toContain('/cluster/slm/execute?policyId=nightly');
  });

  it('keeps full per-search bodies in msearch', async () => {
    fetchMock.mockResolvedValue(reply({ responses: [] }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 61, method: 'tools/call',
      params: {
        name: 'es_msearch',
        arguments: {
          searches: [{
            index: 'research',
            body: { aggs: { by_status: { terms: { field: 'status' } } } },
            size: 2,
          }],
        },
      },
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    const lines = String(request.body).trim().split('\n');
    const body = JSON.parse(lines[1]);
    expect(body.aggs).toEqual({ by_status: { terms: { field: 'status' } } });
    expect(body.size).toBe(2);
    expect(body.query).toEqual({ match_all: {} });
  });

  it('passes bulk pipeline and timeout options through the raw transport', async () => {
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ errors: false, items: [] }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 62, method: 'tools/call',
      params: {
        name: 'es_bulk',
        arguments: {
          index: 'research',
          operations: [{ action: 'index', id: '1', document: { title: 'x' } }],
          pipeline: 'enrich',
          timeout: '30s',
          waitForActiveShards: '1',
        },
      },
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.path).toBe('/_bulk?pipeline=enrich&timeout=30s&wait_for_active_shards=1');
    expect(request.body).toContain('{"index":{"_index":"research","_id":"1"}}');
  });

  it('routes mget through the browser raw transport', async () => {
    fetchMock.mockResolvedValue(reply({ docs: [{ _id: '1' }, { _id: '2' }] }));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 60, method: 'tools/call',
      params: { name: 'es_mget', arguments: { index: 'research', ids: ['1', '2'] } },
    });
    expect(out.result.isError).toBe(false);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.path).toBe('/research/_mget');
    expect(JSON.parse(request.body)).toEqual({ ids: ['1', '2'] });
  });

  it('routes data stream, component template and index topology tools', async () => {
    fetchMock.mockResolvedValue(reply({ acknowledged: true }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 41, method: 'tools/call',
      params: { name: 'es_list_data_streams', arguments: {} },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).path).toBe('/_data_stream');
    setBrowserMcpWriteAllowed(true);
    await handleMcpRequest({
      jsonrpc: '2.0', id: 42, method: 'tools/call',
      params: { name: 'es_create_data_stream', arguments: { name: 'logs-app' } },
    });
    const createBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(createBody.method).toBe('PUT');
    expect(createBody.path).toBe('/_data_stream/logs-app');
    await handleMcpRequest({
      jsonrpc: '2.0', id: 43, method: 'tools/call',
      params: { name: 'es_clone_index', arguments: { index: 'orders', target: 'orders-clone', body: { settings: { number_of_shards: 1 } } } },
    });
    const cloneBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(cloneBody.method).toBe('POST');
    expect(cloneBody.path).toBe('/orders/_clone/orders-clone');
    expect(cloneBody.body).toContain('number_of_shards');
    await handleMcpRequest({
      jsonrpc: '2.0', id: 44, method: 'tools/call',
      params: { name: 'es_list_component_templates', arguments: {} },
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).path).toBe('/_component_template');
  });

  it('keeps browser write tools opt-in', async () => {
    setBrowserMcpWriteAllowed(false);
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'es_index_doc', arguments: { index: 'i', id: '1', document: { a: 1 } } },
    });
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('未启用');
  });

  it('categorizes every MCP tool exactly once', () => {
    const grouped = MCP_TOOL_GROUPS.flatMap(group => group.tools);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(MCP_TOOLS.map(tool => tool.name).sort());
    expect(MCP_TOOL_GROUPS.every(group => group.label.trim() && group.tools.length > 0)).toBe(true);
  });

  it('annotates read-only and destructive tools for MCP clients', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.annotations?.readOnlyHint).toBe(!MCP_WRITE_TOOLS.includes(tool.name) && tool.name !== 'es_rest');
      expect(tool.annotations?.destructiveHint).toBe(MCP_DESTRUCTIVE_TOOLS.includes(tool.name));
      expect(tool.annotations?.openWorldHint).toBe(false);
    }
  });

  it('keeps the list-indices schema honest (no unsupported includeSystem switch)', () => {
    const tool = MCP_TOOLS.find(t => t.name === 'es_list_indices');
    expect(tool?.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('returns an MCP tool error instead of throwing', async () => {
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'es_get_mapping', arguments: {} },
    });
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('index');
  });
});
