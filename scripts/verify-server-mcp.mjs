#!/usr/bin/env node
/*
 * 独立 server jar 的真实 MCP HTTP 冒烟：
 * - 无凭证 GET /mcp 必须 401
 * - 服务 token GET /mcp 必须 200，tools/list 与 discovery 均返回同一工具集
 * - annotations 必须与只读/破坏性契约一致
 * 不依赖 Elasticsearch 绑定；控制集群未绑定时验证鉴权与工具目录即可。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/* jar 名随项目版本滚动：从根 pom 读当前版本（版本 bump 后不再踩硬编码 1.0.44 的坑）；
 * ESQ_SERVER_JAR 仍可显式指路 */
function defaultServerJar() {
  try {
    const pom = readFileSync(resolve(ROOT, 'pom.xml'), 'utf8');
    const m = pom.match(/<version>(1\.0\.\d+)<\/version>/);
    if (m) {
      const byVersion = resolve(ROOT, `apps/server/target/esquerystudio-server-${m[1]}.jar`);
      if (existsSync(byVersion)) return byVersion;
    }
  } catch { /* pom 读不到回落旧硬编码路径（报错信息指路 package） */ }
  return resolve(ROOT, 'apps/server/target/esquerystudio-server-1.0.44.jar');
}
const JAR = process.env.ESQ_SERVER_JAR
  ? resolve(ROOT, process.env.ESQ_SERVER_JAR)
  : defaultServerJar();
const TOKEN = 'verify-server-mcp-token';

if (!existsSync(JAR)) {
  console.error(`[server-mcp] missing ${JAR}; run ./mvnw -pl apps/server -am package -DskipTests first`);
  process.exit(2);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitReady(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 401 || response.status === 200) return;
    } catch { /* server is still booting */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('server did not become ready');
}

const port = await freePort();
const child = spawn(process.execPath === '' ? 'java' : 'java', [
  '-jar', JAR,
  `--server.port=${port}`,
  '--esquerystudio.mcp.enabled=true',
  `--esquerystudio.mcp.token=${TOKEN}`,
], { cwd: ROOT, stdio: 'ignore' });

try {
  const base = `http://127.0.0.1:${port}`;
  await waitReady(`${base}/mcp`);

  const denied = await fetch(`${base}/mcp`);
  assert.equal(denied.status, 401, 'missing bearer token must be 401');

  const discoveryResponse = await fetch(`${base}/mcp`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(discoveryResponse.status, 200, 'service token must be accepted');
  const discovery = await discoveryResponse.json();
  assert.equal(discovery.tools.length, 17, 'discovery must expose 17 action groups');
  assert.equal(discovery.tools[0].annotations.readOnlyHint, true);
  assert.equal(discovery.tools.find((tool) => tool.name === 'es_rest').annotations.readOnlyHint, false);
  assert.equal(discovery.tools.find((tool) => tool.name === 'es_indices').annotations.destructiveHint, true);
  assert.equal(discovery.resources[0].uri, 'ui://esquerystudio/tool-console', 'MCP App resource leads the catalog');
  assert.ok(discovery.resources.some((resource) => resource.uri === 'esquerystudio://connections'));
  assert.equal(discovery.prompts.length, 6);
  assert.equal(discovery.transport, 'json-rpc-over-http', 'transport is Streamable HTTP only');

  const rpc = async (id, method, params) => {
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    return response.json();
  };
  const init = await rpc(1, 'initialize');
  assert.equal(init.result.resultType, 'complete');
  assert.equal(init.result.protocolVersion, '2026-07-28');
  assert.deepEqual(init.result.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
  assert.equal(init.result.capabilities.resources.subscribe, false);
  assert.equal(init.result.capabilities.prompts.listChanged, false);
  assert.ok(init.result.instructions.includes('es_connections'));
  const legacyInit = await rpc(11, 'initialize', { protocolVersion: '2025-06-18' });
  assert.equal(legacyInit.result.protocolVersion, '2025-06-18');
  const oldInit = await rpc(13, 'initialize', { protocolVersion: '2024-11-05' });
  assert.equal(oldInit.result.protocolVersion, '2024-11-05');
  const unknownInit = await rpc(14, 'initialize', { protocolVersion: '2099-01-01' });
  assert.equal(unknownInit.result.protocolVersion, '2025-06-18', 'unknown versions must fall back to widely supported 2025-06-18');
  const discover = await rpc(12, 'server/discover');
  assert.deepEqual(discover.result.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
  assert.equal(discover.result.cacheScope, 'private');

  const list = await rpc(2, 'tools/list');
  assert.equal(list.result.ttlMs, 60000);
  assert.equal(list.result.cacheScope, 'private');
  assert.equal(list.result.tools.length, 17, 'tools/list must expose 17 action groups');
  assert.ok(list.result.tools.some((tool) => tool.name === 'es_indices' && tool.inputSchema.properties.action.enum.includes('create')));
  const groupCall = await rpc(31, 'tools/call', { name: 'es_connections', arguments: { action: 'list' } });
  assert.equal(groupCall.result.isError, false, 'group + action call must dispatch to the action handler');
  const retiredCall = await rpc(32, 'tools/call', { name: 'es_get_mapping', arguments: { index: 'i' } });
  assert.equal(retiredCall.result.isError, true, 'retired per-tool name must be rejected');
  assert.ok(String(retiredCall.result.content?.[0]?.text || '').includes('Unknown tool: es_get_mapping'),
    'unknown-tool message must name the rejected tool');
  const audited = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());
  assert.ok(audited.recentCalls.some((call) => call.method === 'tools/list' && call.ip), 'service-token MCP calls must expose recentCalls with IP');
  assert.deepEqual(list.result.tools.map((tool) => tool.name), discovery.tools.map((tool) => tool.name));

  const resources = await rpc(3, 'resources/list');
  assert.equal(resources.result.resources[0].uri, 'ui://esquerystudio/tool-console');
  assert.ok(resources.result.resources.some((resource) => resource.uri === 'esquerystudio://connections'));
  const templates = await rpc(4, 'resources/templates/list');
  assert.equal(templates.result.resourceTemplates.length, 8);
  const prompts = await rpc(5, 'prompts/list');
  assert.deepEqual(prompts.result.prompts.map((prompt) => prompt.name), [
    'diagnose_slow_query', 'design_index_mapping', 'migrate_index',
    'review_cluster_capacity', 'triage_failed_search', 'cross_cloud_structure_sync',
  ]);
  const prompt = await rpc(6, 'prompts/get', {
    name: 'triage_failed_search',
    arguments: { connection: 'host', symptom: 'shard failures' },
  });
  assert.ok(prompt.result.messages[0].content.text.includes('shard failures'));
  const completion = await rpc(7, 'completion/complete', {
    ref: { type: 'ref/prompt' },
    argument: { name: 'connection', value: 'ho' },
  });
  assert.deepEqual(completion.result.completion.values, ['host']);

  console.log(`[server-mcp] OK — real jar: 401 without token, 200 with token, 17 action groups, 6 prompts, 8 resource templates, annotations aligned`);
} finally {
  child.kill();
}
