import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform/browserApi', () => ({ browserFetch: vi.fn(), abortAllEsRequests: vi.fn() }));
import { browserFetch, abortAllEsRequests } from '../platform/browserApi';
import {
  handleMcpRequest, isMcpRestReadOnly, mcpCallTool, MCP_DESTRUCTIVE_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES,
  MCP_STATIC_RESOURCES, MCP_TOOLS, MCP_TOOL_GROUPS, MCP_TOOL_PACKS, MCP_WRITE_TOOLS, MCP_GROUP_ACTIONS, setBrowserMcpWriteAllowed,
} from '../platform/browserMcp';

const fetchMock = browserFetch as unknown as ReturnType<typeof vi.fn>;
const reply = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('browser MCP bridge', () => {
  beforeEach(() => { fetchMock.mockReset(); setBrowserMcpWriteAllowed(false); localStorage.removeItem('esquerystudio.mcp.tasks.v1'); });

  it('initializes and advertises the same tool family as server mode', async () => {
    const init = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(init.result.protocolVersion).toBe('2026-07-28');
    const legacy = await handleMcpRequest({
      jsonrpc: '2.0', id: 11, method: 'initialize', params: { protocolVersion: '2025-06-18' },
    });
    expect(legacy.result.protocolVersion).toBe('2025-06-18');
    const discover = await handleMcpRequest({ jsonrpc: '2.0', id: 12, method: 'server/discover' });
    expect(discover.result.supportedVersions).toEqual(['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
    expect(discover.result.recommendedTools).toHaveLength(17);
    expect(discover.result.maxRecommendedTools).toBe(17);
    expect(init.result.serverInfo).toMatchObject({ name: 'ESQueryStudio', mode: 'browser' });
    const list = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.result.tools.map((t: any) => t.name)).toEqual(Object.keys(MCP_GROUP_ACTIONS));
  });

  it('dispatches action-typed group tools to the underlying handlers', async () => {
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 31, method: 'tools/call',
      params: { name: 'es_connections', arguments: { action: 'list' } },
    });
    expect(out.result.isError).toBe(false);
    expect(out.result.content[0].text).toBe('[]');
  });

  it('rejects retired per-tool names and group calls without action', async () => {
    const direct = await handleMcpRequest({
      jsonrpc: '2.0', id: 32, method: 'tools/call',
      params: { name: 'es_get_doc', arguments: { index: 'i', id: '1' } },
    });
    expect(direct.result.isError).toBe(true);
    expect(direct.result.content[0].text).toContain('Unknown tool es_get_doc');
    expect(direct.result.content[0].text).toContain('es_connections');
    const noAction = await handleMcpRequest({
      jsonrpc: '2.0', id: 33, method: 'tools/call',
      params: { name: 'es_search', arguments: { index: 'i' } },
    });
    expect(noAction.result.isError).toBe(true);
    expect(noAction.result.content[0].text).toContain('Missing action for es_search');
    await expect(mcpCallTool('es_get_mapping', { index: 'i' })).rejects.toThrow('Unknown tool es_get_mapping');
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
      params: { name: 'es_cluster', arguments: { action: 'health' } },
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
      params: { name: 'es_batch', arguments: { ...args, action: 'delete_by_query' } },
    });
    expect(first.result.resultType).toBe('input_required');
    expect(first.result.inputRequests.confirm.method).toBe('elicitation/create');
    expect(fetchMock).not.toHaveBeenCalled();
    const state = first.result.requestState;
    const declined = await handleMcpRequest({
      jsonrpc: '2.0', id: 62, method: 'tools/call', _meta: meta,
      params: {
        name: 'es_batch', arguments: { ...args, action: 'delete_by_query' },
        inputResponses: { confirm: { action: 'decline' } }, requestState: state,
      },
    });
    expect(declined.result.structuredContent).toMatchObject({ cancelled: true });
    expect(fetchMock).not.toHaveBeenCalled();
    const tampered = await handleMcpRequest({
      jsonrpc: '2.0', id: 63, method: 'tools/call', _meta: meta,
      params: {
        name: 'es_batch', arguments: { ...args, action: 'delete_by_query' },
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
        arguments: {
          action: 'search', index: 'research_report', query: '{"query":{"term":{"status":"published"}},"size":99}' },
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
          action: 'search',
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
      params: { name: 'es_rest', arguments: { action: 'call', method: 'POST', path: '/research/_search', body: {} } },
    });
    expect(read.result.isError).toBe(false);
    const write = await handleMcpRequest({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'es_rest', arguments: { action: 'call', method: 'POST', path: '/_bulk', body: {} } },
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
      params: { name: 'es_indices', arguments: { action: 'create', index: 'new_idx' } },
    });
    expect(blocked.result.isError).toBe(true);
    expect(blocked.result.content[0].text).toContain('未启用');

    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ acknowledged: true }));
    const created = await handleMcpRequest({
      jsonrpc: '2.0', id: 21, method: 'tools/call',
      params: {
        name: 'es_indices',
        arguments: {
          action: 'create', index: 'new_idx', settings: { number_of_shards: 1 }, mappings: { properties: { title: { type: 'text' } } } },
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
      params: { name: 'es_indices', arguments: { action: 'alias', actions: [{ add: { index: 'new_idx', alias: 'new_alias' } }] } },
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
        name: 'es_batch',
        arguments: {
          action: 'update_by_query', index: 'research', query: { term: { status: 'draft' } }, script: { source: 'ctx._source.x = 1' } },
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
      params: { name: 'es_batch', arguments: { action: 'delete_by_query', index: 'research' } },
    });
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toContain('query');

    fetchMock.mockResolvedValue(reply({ created: 2 }));
    const reindexed = await handleMcpRequest({
      jsonrpc: '2.0', id: 32, method: 'tools/call',
      params: { name: 'es_batch', arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } }, slices: 2 } },
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
      params: { name: 'es_cluster', arguments: { action: 'settings' } },
    });
    expect(read.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/settings');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 41, method: 'tools/call',
      params: { name: 'es_snapshots', arguments: { action: 'create', repo: 'repo1', name: 's1', body: { indices: 'research' } } },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cluster/snapshot/create?repo=repo1&name=s1');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ indices: 'research' });

    await handleMcpRequest({
      jsonrpc: '2.0', id: 42, method: 'tools/call',
      params: { name: 'es_lifecycle', arguments: { action: 'ilm_start' } },
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/cluster/ilm/start');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 43, method: 'tools/call',
      params: { name: 'es_automation', arguments: { action: 'script_put', id: 's1', script: { script: { lang: 'painless', source: '1' } } } },
    });
    expect(String(fetchMock.mock.calls[3][0])).toContain('/cluster/scripts/put?id=s1');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ script: { lang: 'painless', source: '1' } });

    await handleMcpRequest({
      jsonrpc: '2.0', id: 44, method: 'tools/call',
      params: { name: 'es_cluster', arguments: { action: 'task_detail', taskId: 'node:1' } },
    });
    expect(String(fetchMock.mock.calls[4][0])).toContain('/cluster/task-detail?taskId=node%3A1');
  });

  it('routes diagnostics and SLM tools through the browser transport', async () => {
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ ok: true }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 50, method: 'tools/call',
      params: { name: 'es_search', arguments: { action: 'validate', index: 'research', body: { query: { match_all: {} } } } },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cluster/validate-query?index=research');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 51, method: 'tools/call',
      params: { name: 'es_documents', arguments: { action: 'term_vectors', index: 'research', id: '1', fields: 'title' } },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cluster/term-vectors?index=research&id=1&fields=title');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 52, method: 'tools/call',
      params: { name: 'es_indices', arguments: { action: 'detail', index: 'research', sampleSize: 1 } },
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/cluster/inspect?index=research&sampleSize=1');

    await handleMcpRequest({
      jsonrpc: '2.0', id: 53, method: 'tools/call',
      params: { name: 'es_lifecycle', arguments: { action: 'slm_execute', policyId: 'nightly' } },
    });
    expect(String(fetchMock.mock.calls[3][0])).toContain('/cluster/slm/execute?policyId=nightly');
  });

  it('keeps full per-search bodies in msearch', async () => {
    fetchMock.mockResolvedValue(reply({ responses: [] }));
    await handleMcpRequest({
      jsonrpc: '2.0', id: 61, method: 'tools/call',
      params: {
        name: 'es_search',
        arguments: {
          action: 'msearch',
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
        name: 'es_documents',
        arguments: {
          action: 'bulk',
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
      params: { name: 'es_search', arguments: { action: 'mget', index: 'research', ids: ['1', '2'] } },
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
      params: { name: 'es_data_streams', arguments: { action: 'list' } },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).path).toBe('/_data_stream');
    setBrowserMcpWriteAllowed(true);
    await handleMcpRequest({
      jsonrpc: '2.0', id: 42, method: 'tools/call',
      params: { name: 'es_data_streams', arguments: { action: 'create', name: 'logs-app' } },
    });
    const createBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(createBody.method).toBe('PUT');
    expect(createBody.path).toBe('/_data_stream/logs-app');
    await handleMcpRequest({
      jsonrpc: '2.0', id: 43, method: 'tools/call',
      params: { name: 'es_indices', arguments: { action: 'clone', index: 'orders', target: 'orders-clone', body: { settings: { number_of_shards: 1 } } } },
    });
    const cloneBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(cloneBody.method).toBe('POST');
    expect(cloneBody.path).toBe('/orders/_clone/orders-clone');
    expect(cloneBody.body).toContain('number_of_shards');
    await handleMcpRequest({
      jsonrpc: '2.0', id: 44, method: 'tools/call',
      params: { name: 'es_templates', arguments: { action: 'component_list' } },
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).path).toBe('/_component_template');
  });

  it('keeps browser write tools opt-in', async () => {
    setBrowserMcpWriteAllowed(false);
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'es_documents', arguments: { action: 'index', index: 'i', id: '1', document: { a: 1 } } },
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
      params: { name: 'es_indices', arguments: { action: 'mapping' } },
    });
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('index');
  });

  it('reads the managed rebuild event timeline from the local job store', async () => {
    localStorage.removeItem('esquerystudio.adhoc.jobs');
    localStorage.setItem('esquerystudio.adhoc.jobs', JSON.stringify([{
      jobId: 'aj-1', status: 'SUCCESS', stage: 'DONE', strategy: 'INCREMENTAL',
      createTime: 1000, finishedAt: 5000,
      rounds: [{ ts: 2000, phase: 'CATCHUP', label: '追平', created: 3, updated: 1, versionConflicts: 0 }],
    }]));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 70, method: 'tools/call',
      params: { name: 'es_adhoc_rebuild', arguments: { action: 'events', jobId: 'aj-1' } },
    });
    expect(out.result.isError).toBe(false);
    const events = out.result.structuredContent.events;
    expect(events.map((e: any) => e.status)).toEqual(['STARTED', 'ROUND_DONE', 'SUCCESS']);
    expect(events.map((e: any) => e.ts)).toEqual([1000, 2000, 5000]);
  });

  it('replays the migration job event timeline through the jobs/{id}/events transport', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(reply({
      jobId: 'xj-1',
      events: [
        { ts: 100, stage: 'prepare', message: '开始搬运', level: 'info' },
        { ts: 200, stage: 'switch', message: '切换完成', level: 'info' },
      ],
    })));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 71, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'events', jobId: 'xj-1' } },
    });
    expect(out.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/internal/es/xmigrate/jobs/xj-1/events');
    expect(out.result.structuredContent.jobId).toBe('xj-1');
    expect(out.result.structuredContent.events.map((e: any) => e.message)).toEqual(['开始搬运', '切换完成']);
  });

  it('checks xmigrate source connectivity and resolves the stored profile', async () => {
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'old', name: 'Old cluster', url: 'http://old.example:9200', username: 'u', password: 'p' },
    ]));
    fetchMock.mockResolvedValue(reply([
      { index: 'orders', health: 'green', 'docs.count': '120', 'store.size': '1mb' },
    ]));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 71, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'connect_check', srcConnId: 'old' } },
    });
    expect(out.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/internal/es/xmigrate/connect-check');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ url: 'http://old.example:9200', username: 'u' });
    expect(out.result.structuredContent.result[0]).toMatchObject({ index: 'orders', 'docs.count': '120' });

    fetchMock.mockResolvedValue(reply({ scheme: 'http', host: 'old.example', port: 9200, username: 'u', passwordResolved: true }));
    const resolved = await handleMcpRequest({
      jsonrpc: '2.0', id: 72, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'resolve_preview', srcConnId: 'old' } },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/internal/es/xmigrate/resolve-preview');
    expect(resolved.result.structuredContent).toMatchObject({ host: 'old.example', passwordResolved: true });

    const missing = await handleMcpRequest({
      jsonrpc: '2.0', id: 73, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'connect_check', srcConnId: 'nope' } },
    });
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toContain('连接档案不存在');
  });

  it('lists xmigrate dest-side indices from the host connection', async () => {
    fetchMock.mockResolvedValue(reply([
      { index: 'orders_v2', health: 'green', 'docs.count': '9', 'store.size': '1kb' },
    ]));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 74, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'dest_indices' } },
    });
    expect(out.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/internal/es/xmigrate/dest-indices');
    expect(out.result.structuredContent.result[0]).toMatchObject({ index: 'orders_v2' });
  });

  it('deletes terminal xmigrate job records behind the write switch', async () => {
    expect(MCP_WRITE_TOOLS).toContain('es_xmigrate_delete_jobs');
    const blocked = await handleMcpRequest({
      jsonrpc: '2.0', id: 75, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'delete_jobs', jobId: 'xj-1' } },
    });
    expect(blocked.result.isError).toBe(true);
    expect(blocked.result.content[0].text).toContain('未启用');

    setBrowserMcpWriteAllowed(true);
    localStorage.removeItem('esquerystudio.xmigrate.jobs');
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([
      { jobId: 'xj-1', status: 'SUCCESS', finishTime: Date.now() },
      { jobId: 'xj-2', status: 'SUCCESS', finishTime: Date.now() - 40 * 86400000 },
    ]));
    const single = await handleMcpRequest({
      jsonrpc: '2.0', id: 76, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'delete_jobs', jobId: 'xj-1' } },
    });
    expect(single.result.isError).toBe(false);
    expect(single.result.structuredContent).toEqual({ jobId: 'xj-1', deleted: true });
    expect(JSON.parse(localStorage.getItem('esquerystudio.xmigrate.jobs')!).map((j: any) => j.jobId)).toEqual(['xj-2']);

    const cleanup = await handleMcpRequest({
      jsonrpc: '2.0', id: 77, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'delete_jobs', olderThanDays: 30 } },
    });
    expect(cleanup.result.isError).toBe(false);
    expect(cleanup.result.structuredContent).toEqual({ deleted: 1 });
    expect(JSON.parse(localStorage.getItem('esquerystudio.xmigrate.jobs')!)).toEqual([]);
  });

  it('reports honest errors for missing jobs and ambiguous delete arguments', async () => {
    setBrowserMcpWriteAllowed(true);
    localStorage.removeItem('esquerystudio.adhoc.jobs');
    const missingEvents = await handleMcpRequest({
      jsonrpc: '2.0', id: 78, method: 'tools/call',
      params: { name: 'es_adhoc_rebuild', arguments: { action: 'events', jobId: 'nope' } },
    });
    expect(missingEvents.result.isError).toBe(true);
    expect(missingEvents.result.content[0].text).toContain('作业不存在');

    localStorage.removeItem('esquerystudio.xmigrate.jobs');
    const missingDelete = await handleMcpRequest({
      jsonrpc: '2.0', id: 79, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'delete_jobs', jobId: 'nope' } },
    });
    expect(missingDelete.result.isError).toBe(true);
    expect(missingDelete.result.content[0].text).toContain('作业不存在');

    const ambiguous = await handleMcpRequest({
      jsonrpc: '2.0', id: 80, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'delete_jobs' } },
    });
    expect(ambiguous.result.isError).toBe(true);
    expect(ambiguous.result.content[0].text).toContain('二选一');
  });

  it('syncs index structure behind the write switch via the stored source profile', async () => {
    expect(MCP_WRITE_TOOLS).toContain('es_xmigrate_sync_structure');
    const blocked = await handleMcpRequest({
      jsonrpc: '2.0', id: 81, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'sync_structure', srcConnId: 'old', sourceIndex: 'orders' } },
    });
    expect(blocked.result.isError).toBe(true);
    expect(blocked.result.content[0].text).toContain('未启用');

    setBrowserMcpWriteAllowed(true);
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'old', name: 'Old cluster', url: 'http://old.example:9200', username: 'u', password: 'p' },
    ]));
    fetchMock.mockResolvedValue(reply({
      created: true, destIndex: 'orders', rounds: 3,
      removedSettings: [{ key: 'index.apack.knn', reason: 'unknown setting [index.apack.knn]' }],
      removedAnalysis: [{ kind: 'tokenizer', name: 'ik_max_word', reason: 'Unknown tokenizer [ik_max_word]' }],
      downgradedFields: [{ field: 'title', attr: 'analyzer', from: 'ik_max_word', to: null, reason: 'x' }],
      warnings: [], sourceVersion: '7.10.2', targetVersion: '8.13.0',
    }));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 82, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'sync_structure', srcConnId: 'old', sourceIndex: 'orders', downgradedAnalyzerFallback: 'standard' } },
    });
    expect(out.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/internal/es/xmigrate/sync-structure');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      conn: { url: 'http://old.example:9200', username: 'u' },
      sourceIndex: 'orders',
      downgradedAnalyzerFallback: 'standard',
    });
    expect(out.result.structuredContent.rounds).toBe(3);
    expect(out.result.structuredContent.removedAnalysis[0].name).toBe('ik_max_word');
  });

  it('routes capability comparison and structure diff (read-only) through the browser transport', async () => {
    /* 只读工具：不进写清单，写开关关闭时可直接调用 */
    expect(MCP_WRITE_TOOLS).not.toContain('es_xmigrate_compare_capabilities');
    expect(MCP_WRITE_TOOLS).not.toContain('es_xmigrate_diff_structure');
    fetchMock.mockResolvedValue(reply({
      source: { connection: 'old', version: '8.9.0', vendor: { id: 'aliyun', label: '阿里云 ES' } },
      target: { connection: 'host', version: '7.10.2', vendor: { id: 'tencent', label: '腾讯云 ES' } },
      diff: { versionGap: '8.9.0 -> 7.10.2', vendorChanged: true, risks: [] },
    }));
    const compare = await handleMcpRequest({
      jsonrpc: '2.0', id: 83, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'compare_capabilities', srcConnId: 'old', destConnId: 'host', sourceIndex: 'orders' } },
    });
    expect(compare.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/internal/es/xmigrate/compare-capabilities');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      srcConnId: 'old', destConnId: 'host', sourceIndex: 'orders',
    });
    expect(compare.result.structuredContent.diff.versionGap).toBe('8.9.0 -> 7.10.2');

    fetchMock.mockResolvedValue(reply({
      sourceIndex: 'orders', destIndex: 'orders-v2',
      settingsDiff: { onlyInSource: [], onlyInTarget: [], valueChanged: [] },
      mappingsDiff: { fieldAdded: [], fieldRemoved: [], fieldChanged: [] },
      expectedRemovals: [], unexpected: [], compatible: true,
    }));
    const diff = await handleMcpRequest({
      jsonrpc: '2.0', id: 84, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'diff_structure', srcConnId: 'old', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-v2' } },
    });
    expect(diff.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/internal/es/xmigrate/diff-structure');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      srcConnId: 'old', sourceIndex: 'orders', destConnId: 'host', destIndex: 'orders-v2',
    });
    expect(diff.result.structuredContent.compatible).toBe(true);
  });

  it('gates xmigrate throttle behind the write switch and posts jobId/rps', async () => {
    expect(MCP_WRITE_TOOLS).toContain('es_xmigrate_throttle');
    const blocked = await handleMcpRequest({
      jsonrpc: '2.0', id: 85, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'throttle', jobId: 'xj-9', rps: 100 } },
    });
    expect(blocked.result.isError).toBe(true);
    expect(blocked.result.content[0].text).toContain('未启用');

    setBrowserMcpWriteAllowed(true);
    fetchMock.mockResolvedValue(reply({ ok: true, jobId: 'xj-9', rps: 100, appliedAt: 1732190400000 }));
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 86, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'throttle', jobId: 'xj-9', rps: 100 } },
    });
    expect(out.result.isError).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/internal/es/xmigrate/throttle');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ jobId: 'xj-9', rps: 100 });
    expect(out.result.structuredContent).toMatchObject({ ok: true, rps: 100 });
  });

  it('runs tasks asynchronously and lets tasks/cancel truly abort the in-flight call', async () => {
    const abortMock = abortAllEsRequests as unknown as ReturnType<typeof vi.fn>;
    abortMock.mockClear();
    setBrowserMcpWriteAllowed(true);
    let release: (value: any) => void = () => {};
    fetchMock.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const envelope = { _meta: { 'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } } } };
    const created = await handleMcpRequest({
      jsonrpc: '2.0', id: 90, method: 'tools/call',
      params: { name: 'es_batch', arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } } }, ...envelope },
    });
    /* 立刻回 working，不把调用方挂在这条长请求上。 */
    expect(created.result.resultType).toBe('task');
    expect(created.result.status).toBe('working');
    const taskId = created.result.taskId;
    const cancelled = await handleMcpRequest({ jsonrpc: '2.0', id: 91, method: 'tasks/cancel', params: { taskId } });
    expect(cancelled.result.status).toBe('cancelled');
    expect(cancelled.result.cancelReason).toBe('CLIENT');
    /* 取消必须打到传输层：abortAllEsRequests 撤掉 fetch 的 AbortSignal。 */
    expect(abortMock).toHaveBeenCalledTimes(1);
    release(reply({ ok: true }));
    await new Promise(r => setTimeout(r, 10));
    const after = await handleMcpRequest({ jsonrpc: '2.0', id: 92, method: 'tasks/get', params: { taskId } });
    expect(after.result.status).toBe('cancelled');
  });

  it('notifications/cancelled cancels by request id and stays silent', async () => {
    const abortMock = abortAllEsRequests as unknown as ReturnType<typeof vi.fn>;
    abortMock.mockClear();
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const created = await handleMcpRequest({
      jsonrpc: '2.0', id: 93, method: 'tools/call',
      params: {
        name: 'es_batch', arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } } },
        _meta: {
          'io.modelcontextprotocol/requestId': 'req-93',
          'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } },
        },
      },
    });
    const taskId = created.result.taskId;
    const notice = await handleMcpRequest({
      jsonrpc: '2.0', method: 'notifications/cancelled',
      params: { requestId: 'req-93', reason: 'user aborted' },
    });
    /* 通知无响应体——返回 null，不能伪造一个 JSON-RPC result。 */
    expect(notice).toBeNull();
    expect(abortMock).toHaveBeenCalledTimes(1);
    const after = await handleMcpRequest({ jsonrpc: '2.0', id: 94, method: 'tasks/get', params: { taskId } });
    expect(after.result.status).toBe('cancelled');
  });

  it('a client that never declares Tasks can still cancel its in-flight call', async () => {
    const abortMock = abortAllEsRequests as unknown as ReturnType<typeof vi.fn>;
    abortMock.mockClear();
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    /* 不声明任何扩展：这是最普通的 MCP 客户端。 */
    const pending = handleMcpRequest({
      jsonrpc: '2.0', id: 95, method: 'tools/call',
      params: {
        name: 'es_batch',
        arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } } },
        _meta: { 'io.modelcontextprotocol/requestId': 'plain-req-95' },
      },
    });
    await new Promise(r => setTimeout(r, 20));
    /* 核心取消必须命中普通同步调用（此前它压根没进台账，通知永远匹配不到）。 */
    await handleMcpRequest({
      jsonrpc: '2.0', method: 'notifications/cancelled',
      params: { requestId: 'plain-req-95', reason: 'user aborted' },
    });
    const out = await pending;
    expect(out.result.structuredContent).toMatchObject({ cancelled: true, cancelReason: 'CLIENT' });
    expect(out.result.isError).toBe(false);
    expect(abortMock).toHaveBeenCalledTimes(1);
  });

  it('tasks/list exposes live tasks without result bodies and feeds the console view', async () => {
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const created = await handleMcpRequest({
      jsonrpc: '2.0', id: 96, method: 'tools/call',
      params: {
        name: 'es_batch', arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } } },
        _meta: {
          'io.modelcontextprotocol/requestId': 'live-96',
          'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } },
        },
      },
    });
    const taskId = created.result.taskId;
    const list = await handleMcpRequest({ jsonrpc: '2.0', id: 97, method: 'tasks/list', params: { limit: 10 } });
    const row = (list.result.tasks || []).find((t: any) => t.taskId === taskId);
    expect(row, '刚创建的任务必须出现在清单里').toBeTruthy();
    expect(row.status).toBe('working');
    expect(typeof row.elapsedMs).toBe('number');
    expect(typeof row.remainingMs).toBe('number');
    expect(row.result, '列表不下发结果体').toBeUndefined();
    expect(list.result.callTimeoutMs).toBe(180000);
    /* activeOnly 过滤：取消后不应再出现在「运行中」清单里。 */
    await handleMcpRequest({ jsonrpc: '2.0', id: 98, method: 'tasks/cancel', params: { taskId } });
    const active = await handleMcpRequest({ jsonrpc: '2.0', id: 99, method: 'tasks/list', params: { activeOnly: true } });
    expect((active.result.tasks || []).some((t: any) => t.taskId === taskId)).toBe(false);
  });

  it('tasks/list polling stays out of the browser audit trail', async () => {
    setBrowserMcpWriteAllowed(false);
    fetchMock.mockResolvedValue(reply([]));
    await handleMcpRequest({ jsonrpc: '2.0', id: 100, method: 'tools/call', params: { name: 'es_connections', arguments: { action: 'list' } } });
    for (let i = 0; i < 3; i++) {
      await handleMcpRequest({ jsonrpc: '2.0', id: 101 + i, method: 'tasks/list', params: { limit: 5 } });
      await handleMcpRequest({ jsonrpc: '2.0', id: 111 + i, method: 'tasks/get', params: { taskId: 'nope' } });
    }
    const discover = await handleMcpRequest({ jsonrpc: '2.0', id: 120, method: 'server/discover' });
    const methods = (discover.result.recentCalls || []).map((c: any) => c.method);
    expect(methods, 'tools/call 应留档').toContain('tools/call');
    expect(methods, 'tasks/list 轮询不得写审计').not.toContain('tasks/list');
    expect(methods, 'tasks/get 轮询不得写审计').not.toContain('tasks/get');
  });

  it('task resources expose active list and a single task without the result body', async () => {
    setBrowserMcpWriteAllowed(true);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const created = await handleMcpRequest({
      jsonrpc: '2.0', id: 130, method: 'tools/call',
      params: {
        name: 'es_batch', arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } } },
        _meta: {
          'io.modelcontextprotocol/requestId': 'res-130',
          'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } },
        },
      },
    });
    const taskId = created.result.taskId;
    const active = await handleMcpRequest({
      jsonrpc: '2.0', id: 131, method: 'resources/read',
      params: { uri: 'esquerystudio://tasks/active' },
    });
    const activeText = active.result.contents[0].text;
    expect(activeText).toContain(taskId);
    expect(activeText).not.toContain('"result":');
    const single = await handleMcpRequest({
      jsonrpc: '2.0', id: 132, method: 'resources/read',
      params: { uri: 'esquerystudio://task/' + taskId },
    });
    const singlePayload = JSON.parse(single.result.contents[0].text);
    expect(singlePayload.status).toBe('working');
    expect(singlePayload.result).toBeUndefined();
    const missing = await handleMcpRequest({
      jsonrpc: '2.0', id: 133, method: 'resources/read',
      params: { uri: 'esquerystudio://task/nope' },
    });
    expect(missing.error?.code).toBe(-32602);
  });

  it('task ledger survives a page reload: completed results stay readable, in-flight becomes an honest RELOAD cancel', async () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    const base = Date.now();
    localStorage.setItem('esquerystudio.mcp.tasks.v1', JSON.stringify([
      {
        taskId: 't-done', tool: 'es_search', owner: 'browser', requestId: 'r-done', status: 'completed', stage: 'completed',
        createdAt: iso(base - 5000), lastUpdatedAt: iso(base - 4000), deadlineAt: iso(base + 60_000),
        result: { content: [{ type: 'text', text: '{"ok":true}' }], structuredContent: { ok: true }, isError: false },
      },
      {
        taskId: 't-live', tool: 'es_sql', owner: 'browser', requestId: 'r-live', status: 'working', stage: 'running',
        createdAt: iso(base - 2000), lastUpdatedAt: iso(base - 1000), deadlineAt: iso(base + 60_000),
      },
    ]));
    vi.resetModules();
    const fresh: any = await import('../platform/browserMcp');
    try {
      const done = await fresh.handleMcpRequest({ jsonrpc: '2.0', id: 81, method: 'tasks/get', params: { taskId: 't-done' } });
      expect(done.result.status).toBe('completed');
      expect(done.result.result.structuredContent).toEqual({ ok: true });
      const live = await fresh.handleMcpRequest({ jsonrpc: '2.0', id: 82, method: 'tasks/get', params: { taskId: 't-live' } });
      expect(live.result.status).toBe('cancelled');
      expect(live.result.cancelReason).toBe('RELOAD');
      expect(live.result.note).toContain('ES 侧可能已执行');
      const list = await fresh.handleMcpRequest({ jsonrpc: '2.0', id: 83, method: 'tasks/list', params: { limit: 10 } });
      expect((list.result.tasks || []).map((t: any) => t.taskId).sort()).toEqual(['t-done', 't-live']);
      /* 恢复结论必须重新落盘（下次刷新仍是 cancelled/RELOAD，不会翻回 working） */
      const stored = JSON.parse(localStorage.getItem('esquerystudio.mcp.tasks.v1') || '[]');
      expect(stored.find((t: any) => t.taskId === 't-live').cancelReason).toBe('RELOAD');
      expect(JSON.parse(localStorage.getItem('esquerystudio.mcp.tasks.v1') || '[]')
        .find((t: any) => t.taskId === 't-done').status).toBe('completed');
    } finally {
      localStorage.removeItem('esquerystudio.mcp.tasks.v1');
    }
  });
});
