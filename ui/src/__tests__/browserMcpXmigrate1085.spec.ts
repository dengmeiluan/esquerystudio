/* es_xmigrate 新参的 MCP 面契约（es_xmigrate 新参镜像批）：
 *   ① 组描述与 Java McpController.groupDescription 逐字一致（parity 门禁外的运行时锁定）；
 *   ② tools/list 的 es_xmigrate 组参数表含 mode/autoTunedShards/removedKeys/structureOnly，
 *      action 描述附「新参语义」；annotations 携带 readOnlyActions（smart_sync 在名单、
 *      delete_jobs/sync_structure 不在；es_rest:call 自然落入——缺省调用形态只读）；
 *   ③ 资源面：templates/list 含 xmigrate/jobs 与 xmigrate/job/{id}/events 两个新模板
 *      （共 10 个），resources/list 含静态 xmigrate/jobs 条目，read 可读本机台账；
 *   ④ completion：srcConnId/destConnId 复用连接目录、sourceIndex/destIndex 复用索引清单、
 *      jobId 读本机台账前 20 条；
 *   ⑤ tools/call 失败附 structuredContent {code,message}（与 Java toolError 同判定口径）；
 *   ⑥ cross_cloud_structure_sync 提示词正文三端逐字一致（浏览器桥 / 本地 Node / docs 同要点）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  handleMcpRequest, MCP_GROUP_DESCRIPTIONS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES,
  MCP_STATIC_RESOURCES, MCP_READ_ONLY_ACTIONS, MCP_WRITE_TOOLS,
} from '../platform/browserMcp';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const local = read('../../../mcp/esquerystudio-local-mcp.mjs');
const java = read('../../../modules/mcp-server/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpServerCore.java');
const docs = read('../../../docs/mcp.md');

describe('es_xmigrate 新参 MCP 面：组描述与参数表', () => {
  it('组描述与 Java McpController 逐字一致（含 readOnlyActions 与新参语义口径）', () => {
    const m = java.match(/case "es_xmigrate": return "([^"]+)";/);
    expect(m, 'Java 端应能解析出 es_xmigrate 组描述').not.toBeNull();
    expect(MCP_GROUP_DESCRIPTIONS.es_xmigrate).toBe(m![1]);
    /* 关键语义锚：readOnlyActions 收录口径 + mode=incremental + 豁免回传 + structureOnly */
    expect(MCP_GROUP_DESCRIPTIONS.es_xmigrate).toContain('smart_sync is listed in annotations.readOnlyActions');
    expect(MCP_GROUP_DESCRIPTIONS.es_xmigrate).toContain('mode=incremental targets an existing index');
    expect(MCP_GROUP_DESCRIPTIONS.es_xmigrate).toContain('pass autoTunedShards/removedKeys from the previous sync report');
    expect(MCP_GROUP_DESCRIPTIONS.es_xmigrate).toContain('structureOnly=true compares structure digests only');
  });

  it('tools/list：es_xmigrate 组参数表含四个新参，action 描述附新参语义', async () => {
    const out = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const group = out.result.tools.find((t: any) => t.name === 'es_xmigrate');
    expect(group).toBeTruthy();
    const props = group.inputSchema.properties;
    expect(props.mode.type).toBe('string');
    expect(props.mode.description).toContain('incremental=目标已有索引、生产新增字段后补同步');
    expect(props.autoTunedShards.type).toBe('number');
    expect(props.removedKeys.type).toBe('array');
    expect(props.structureOnly.type).toBe('boolean');
    expect(props.structureOnly.description).toContain('纯结构同步的终局验证');
    expect(group.inputSchema.properties.action.description).toContain('新参语义：smart_sync 支持 mode=create');
  });

  it('annotations.readOnlyActions：smart_sync 在名单（缺省 apply=false 只读），写 action 不在', () => {
    const xmigrate = MCP_READ_ONLY_ACTIONS.es_xmigrate;
    expect(xmigrate).toContain('smart_sync');
    expect(xmigrate).toContain('diff_structure');
    expect(xmigrate).toContain('verify_equivalence');
    for (const write of ['delete_jobs', 'sync_structure', 'start', 'resume', 'abort', 'throttle']) {
      expect(xmigrate).not.toContain(write);
    }
    /* es_rest:call 实现名不在写清单 → 自然落入只读名单（缺省 GET 只读的裁决口径） */
    expect(MCP_READ_ONLY_ACTIONS.es_rest).toContain('call');
    /* 名单生成规则：实现名不在 MCP_WRITE_TOOLS 的 action 全集 + es_xmigrate 显式补 smart_sync */
    const esRestImpl = 'es_rest';
    expect(MCP_WRITE_TOOLS).not.toContain(esRestImpl);
  });
});

describe('es_xmigrate 新参 MCP 面：资源清单', () => {
  it('templates/list 13 个模板，含 xmigrate/jobs 与 xmigrate/job/{id}/events 与任务资源', async () => {
    expect(MCP_RESOURCE_TEMPLATES.map(t => t.uriTemplate)).toEqual([
      'esquerystudio://connection/{connection}',
      'esquerystudio://cluster/{connection}',
      'esquerystudio://indices/{connection}',
      'esquerystudio://aliases/{connection}',
      'esquerystudio://data_streams/{connection}',
      'esquerystudio://component_templates/{connection}',
      'esquerystudio://index/{connection}/{index}',
      'esquerystudio://index/{connection}/{index}/mapping',
      'esquerystudio://xmigrate/jobs',
      'esquerystudio://xmigrate/job/{id}/events',
      'esquerystudio://xmigrate/plan/{id}',
      'esquerystudio://tasks/active',
      'esquerystudio://task/{id}',
    ]);
    const out = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'resources/templates/list' });
    expect(out.result.resourceTemplates).toHaveLength(13);
    expect(out.result.resourceTemplates.find((t: any) => t.uriTemplate === 'esquerystudio://xmigrate/job/{id}/events').description)
      .toContain('与 REST /jobs/{id}/events 同构');
    expect(MCP_STATIC_RESOURCES.map(r => r.uri)).toEqual(['esquerystudio://connections']);
  });

  it('resources/list 含静态 xmigrate/jobs 条目；resources/read 读本机台账（行形态对齐服务端同键）', async () => {
    localStorage.clear();
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([{
      jobId: 'job-1085', status: 'DONE', srcConnId: 'src-1', sourceIndex: 'orders',
      destIndex: 'orders-copy', createTime: 1700000000000, finishTime: 1700000001000,
    }]));
    const list = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
    const jobsResource = list.result.resources.find((r: any) => r.uri === 'esquerystudio://xmigrate/jobs');
    expect(jobsResource).toBeTruthy();
    expect(jobsResource.name).toBe('迁移作业摘要');
    const read = await handleMcpRequest({
      jsonrpc: '2.0', id: 4, method: 'resources/read',
      params: { uri: 'esquerystudio://xmigrate/jobs' },
    });
    const rows = JSON.parse(read.result.contents[0].text);
    expect(rows).toEqual([{
      jobId: 'job-1085', state: 'DONE', srcConnId: 'src-1', sourceIndex: 'orders',
      destConnId: 'host', destIndex: 'orders-copy', updatedMs: 1700000001000,
    }]);
    /* 事件流资源走 REST /jobs/{id}/events（台账无事件环时如实空集） */
    const events = await handleMcpRequest({
      jsonrpc: '2.0', id: 5, method: 'resources/read',
      params: { uri: 'esquerystudio://xmigrate/job/job-1085/events' },
    });
    expect(JSON.parse(events.result.contents[0].text)).toEqual({ jobId: 'job-1085', events: [] });
  });
});

describe('es_xmigrate 新参 MCP 面：completion 新参数', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('esquerystudio.browser.profiles', JSON.stringify([
      { id: 'src-1', name: 'src', url: 'http://src.local:9200' },
      { id: 'uat-1', name: 'uat', url: 'http://uat.local:9200' },
    ]));
    localStorage.setItem('esquerystudio.xmigrate.jobs', JSON.stringify([
      { jobId: 'job-a', status: 'DONE' },
      { jobId: 'job-b', status: 'RUNNING' },
    ]));
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('srcConnId/destConnId 复用连接目录；jobId 读本机台账', async () => {
    const src = await handleMcpRequest({
      jsonrpc: '2.0', id: 6, method: 'completion/complete',
      params: { argument: { name: 'srcConnId', value: 's' } },
    });
    expect(src.result.completion.values).toEqual(['src-1']);
    const jobs = await handleMcpRequest({
      jsonrpc: '2.0', id: 7, method: 'completion/complete',
      params: { argument: { name: 'jobId', value: 'job-b' } },
    });
    expect(jobs.result.completion.values).toEqual(['job-b']);
  });
});

describe('es_xmigrate 新参 MCP 面：tools/call 结构化错误码', () => {
  it('参数缺失 → structuredContent {code:"BAD_REQUEST", message}', async () => {
    const out = await handleMcpRequest({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'es_xmigrate', arguments: { action: 'smart_sync' } },
    });
    expect(out.result.isError).toBe(true);
    expect(out.result.structuredContent.code).toBe('BAD_REQUEST');
    expect(out.result.structuredContent.message).toContain('Missing required argument');
  });
});

describe('cross_cloud_structure_sync 提示词：三端正文逐字一致', () => {
  it('浏览器桥与本地 Node 桥的正文逐字一致，且含增量模式教学五要点', () => {
    const sliceFrom = (source: string): string => {
      const i = source.indexOf('首选一步式 smart_sync');
      const j = source.indexOf('终局验证。', i);
      return i < 0 || j < 0 ? '' : source.slice(i, j + '终局验证。'.length);
    };
    const tsBody = sliceFrom(read('../platform/browserMcp.ts'));
    expect(tsBody, '浏览器桥应含升级后的正文').not.toBe('');
    expect(sliceFrom(local), '本地 Node 桥正文与浏览器桥逐字一致').toBe(tsBody);
    /* 增量模式教学要点：mode=incremental 补字段 / UAT 跟随 / expectPlanDigest 守恒 /
       autoTunedShards/removedKeys 防自误报 / structureOnly 终局验证 */
    for (const token of ['mode=incremental', 'addedFields', 'skippedConflicts', 'updatedSettings',
      'staticBlocked', 'addedAliases', 'PUT _mapping 合并补字段', 'DEST_NOT_FOUND',
      'apply 前后计划摘要守恒', 'autoTunedShards/removedKeys', 'structureOnly=true', '终局验证']) {
      expect(tsBody).toContain(token);
    }
  });

  it('提示词目录（prompts/list）与 docs 的 cross_cloud 行同步覆盖新要点', () => {
    expect(MCP_PROMPTS.find(p => p.name === 'cross_cloud_structure_sync')).toBeTruthy();
    const docsRow = docs.match(/\| `cross_cloud_structure_sync` \|[^|]*\|[^|]*\|/);
    expect(docsRow, 'docs 应有 cross_cloud_structure_sync 表行').not.toBeNull();
    for (const token of ['mode=incremental', 'autoTunedShards', 'removedKeys', 'structureOnly']) {
      expect(docsRow![0]).toContain(token);
    }
  });
});
