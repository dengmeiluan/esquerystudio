#!/usr/bin/env node
/* Smoke test for mcp/esquerystudio-mcp-cli.mjs: client recognition, config shapes and safe JSON merge. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = join(ROOT, 'mcp/esquerystudio-mcp-cli.mjs');
const LOCAL_MCP = join(ROOT, 'mcp/esquerystudio-local-mcp.mjs');
const URL_VALUE = 'http://localhost:5601/mcp';
const TOKEN = 'esq_mcp_test.token';

function run(args, env) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: env || process.env });
  assert.equal(result.status, 0, `${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

const list = run(['list']);
for (const client of ['claude-code', 'cursor', 'vscode', 'windsurf', 'trae', 'codex', 'qoder',
  'codebuddy', 'zcode', 'deepseek-harness', 'opencode', 'pi', 'cherry-studio', 'workbuddy', 'antigravity', 'dbx', 'local']) {
  assert.ok(list.includes(client), `client list missing ${client}`);
}

const detected = JSON.parse(run(['detect', '--json']));
assert.equal(detected.length, 17);
assert.ok(detected.every((row) => 'commandFound' in row && 'configFound' in row
  && 'installed' in row && 'mode' in row && Array.isArray(row.commandCandidates)));
assert.equal(detected.find((row) => row.id === 'cherry-studio').mode, 'gui');
assert.equal(detected.find((row) => row.id === 'cursor').mode, 'cli');
assert.equal(detected.find((row) => row.id === 'dbx').role, 'server');
const dbx = run(['config', '--client', 'dbx']);
assert.ok(dbx.includes('MCP Server') && dbx.includes('不是 MCP 客户端'));
/* detect 的 installed 必须读真实配置，而不是靠命令存在与否猜测。 */
const fakeHome = mkdtempSync(join(tmpdir(), 'esq-mcp-detect-'));
mkdirSync(join(fakeHome, '.cursor'), { recursive: true });
writeFileSync(join(fakeHome, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { other: { url: 'http://x' } } }));
const detectEnv = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
const beforeInstall = JSON.parse(run(['detect', '--json'], detectEnv));
assert.equal(beforeInstall.find((row) => row.id === 'cursor').installed, false);
writeFileSync(join(fakeHome, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { esquerystudio: { url: URL_VALUE } } }));
const afterInstall = JSON.parse(run(['detect', '--json'], detectEnv));
assert.equal(afterInstall.find((row) => row.id === 'cursor').installed, true);
rmSync(fakeHome, { recursive: true, force: true });

const cursor = JSON.parse(run(['config', '--client', 'cursor', '--url', URL_VALUE, '--token', TOKEN]));
assert.equal(cursor.mcpServers.esquerystudio.url, URL_VALUE);
assert.equal(cursor.mcpServers.esquerystudio.headers.Authorization, 'Bearer ' + TOKEN);

const claude = run(['config', '--client', 'claude-code', '--url', URL_VALUE, '--token', TOKEN]);
assert.ok(claude.includes('claude mcp add') && claude.includes(URL_VALUE));

/* Codex 官方 MCP 配置是 config.toml，不是 mcpServers JSON；HTTP 用 http_headers。 */
const codex = run(['config', '--client', 'codex', '--url', URL_VALUE, '--token', TOKEN]);
assert.ok(codex.includes('[mcp_servers.esquerystudio]'));
assert.ok(codex.includes('url = ' + JSON.stringify(URL_VALUE)));
assert.ok(codex.includes('http_headers = { Authorization = "Bearer ' + TOKEN + '" }'));
assert.ok(!codex.includes('--bearer-token'));
const codexLocal = run(['config', '--client', 'codex', '--local']);
assert.ok(codexLocal.includes('command = "node"') && codexLocal.includes('esquerystudio-local-mcp.mjs'));

const cursorLocal = JSON.parse(run(['config', '--client', 'cursor', '--local']));
assert.equal(cursorLocal.mcpServers.esquerystudio.command, 'node');
assert.ok(cursorLocal.mcpServers.esquerystudio.args[0].endsWith('esquerystudio-local-mcp.mjs'));
const claudeLocal = run(['config', '--client', 'claude-code', '--local']);
assert.ok(claudeLocal.includes('--transport stdio') && claudeLocal.includes('esquerystudio-local-mcp.mjs'));

const vscode = JSON.parse(run(['config', '--client', 'vscode', '--url', URL_VALUE, '--token', TOKEN]));
assert.equal(vscode.servers.esquerystudio.type, 'http');
assert.equal(vscode.servers.esquerystudio.url, URL_VALUE);

const qoder = JSON.parse(run(['config', '--client', 'qoder', '--url', URL_VALUE, '--token', TOKEN]));
assert.equal(qoder.mcpServers.esquerystudio.type, 'http');
assert.equal(qoder.mcpServers.esquerystudio.url, URL_VALUE);

const codebuddy = JSON.parse(run(['config', '--client', 'codebuddy', '--url', URL_VALUE, '--token', TOKEN]));
assert.equal(codebuddy.mcpServers.esquerystudio.type, 'http');
const workbuddy = JSON.parse(run(['config', '--client', 'workbuddy', '--url', URL_VALUE, '--token', TOKEN]));
assert.equal(workbuddy.mcpServers.esquerystudio.type, 'http');
const zcode = JSON.parse(run(['config', '--client', 'zcode', '--url', URL_VALUE, '--token', TOKEN]));
assert.equal(zcode.mcp.servers.esquerystudio.type, 'http');

/* SSE transport: URL 自动映射到 /mcp/sse，type 与 CLI 命令同步切换。 */
const workbuddySse = JSON.parse(run(['config', '--client', 'workbuddy', '--url', URL_VALUE, '--token', TOKEN, '--transport', 'sse']));
assert.equal(workbuddySse.mcpServers.esquerystudio.type, 'sse');
assert.equal(workbuddySse.mcpServers.esquerystudio.url, URL_VALUE + '/sse');
const claudeSse = run(['config', '--client', 'claude-code', '--url', URL_VALUE, '--token', TOKEN, '--transport', 'sse']);
assert.ok(claudeSse.includes('--transport sse') && claudeSse.includes(URL_VALUE + '/sse'));
const dshSse = run(['config', '--client', 'deepseek-harness', '--url', URL_VALUE, '--token', TOKEN, '--transport', 'sse']);
assert.ok(dshSse.includes('transport: sse') && dshSse.includes(URL_VALUE + '/sse'));
const cursorSse = JSON.parse(run(['config', '--client', 'cursor', '--url', URL_VALUE, '--token', TOKEN, '--transport', 'sse']));
assert.equal(cursorSse.mcpServers.esquerystudio.type, 'sse');

const opencode = JSON.parse(run(['config', '--client', 'opencode', '--url', URL_VALUE, '--token', TOKEN]));
assert.equal(opencode.mcp.servers.esquerystudio.type, 'remote');
assert.equal(opencode.mcp.servers.esquerystudio.url, URL_VALUE);
assert.equal(opencode.mcp.servers.esquerystudio.oauth, false);

const dsh = run(['config', '--client', 'deepseek-harness', '--url', URL_VALUE, '--token', TOKEN]);
assert.ok(dsh.includes('@deepseek-ai/dsh-mcp-client') && dsh.includes('transport: streamable-http') && dsh.includes(URL_VALUE));

const local = JSON.parse(run(['config', '--client', 'local']));
assert.equal(local.defaultConnection, 'prod');
assert.ok(Array.isArray(local.connections));

const dir = mkdtempSync(join(tmpdir(), 'esq-mcp-cli-'));
const file = join(dir, 'mcp.json');
writeFileSync(file, JSON.stringify({ mcpServers: { keep: { command: 'keep' } } }), 'utf8');
try {
  run(['install', '--client', 'cursor', '--url', URL_VALUE, '--token', TOKEN, '--write', '--config', file]);
  const merged = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(merged.mcpServers.keep, 'existing MCP server must be preserved');
  assert.equal(merged.mcpServers.esquerystudio.url, URL_VALUE);
  const opencodeFile = join(dir, 'opencode.json');
  writeFileSync(opencodeFile, JSON.stringify({ theme: 'keep', mcp: { servers: { keep: { type: 'remote', url: 'https://keep' } } } }), 'utf8');
  run(['install', '--client', 'opencode', '--url', URL_VALUE, '--token', TOKEN, '--write', '--config', opencodeFile]);
  const opencodeMerged = JSON.parse(readFileSync(opencodeFile, 'utf8'));
  assert.equal(opencodeMerged.theme, 'keep');
  assert.ok(opencodeMerged.mcp.servers.keep, 'existing OpenCode MCP server must be preserved');
  assert.equal(opencodeMerged.mcp.servers.esquerystudio.url, URL_VALUE);
  const localFile = join(dir, 'local.json');
  writeFileSync(localFile, JSON.stringify({ mcpServers: { keep: { command: 'keep' } } }), 'utf8');
  run(['install', '--client', 'cursor', '--local', '--write', '--config', localFile]);
  const localMerged = JSON.parse(readFileSync(localFile, 'utf8'));
  assert.ok(localMerged.mcpServers.keep, 'existing local MCP server must be preserved');
  assert.equal(localMerged.mcpServers.esquerystudio.command, 'node');
  const connections = join(dir, 'connections.json');
  writeFileSync(connections, JSON.stringify({
    defaultConnection: 'probe',
    connections: [{ id: 'probe', name: 'Probe', url: 'http://127.0.0.1:1' }],
  }), 'utf8');
  const handshake = spawnSync(process.execPath, [LOCAL_MCP, '--config', connections], {
    encoding: 'utf8',
    timeout: 15000,
    input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n'
      + JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping', params: {} }) + '\n'
      + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'server/discover', params: {} }) + '\n',
  });
  assert.equal(handshake.status, 0, handshake.stderr);
  const replies = handshake.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(replies.find((reply) => reply.id === 1).result.protocolVersion, '2026-07-28');
  assert.ok(Array.isArray(replies.find((reply) => reply.id === 2).result.recentCalls));
  /* probe：真实 initialize + tools/list + 服务卡；必须打出协议/工具数/key 作用域。 */
const mock = createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ role: 'OPERATOR', connections: ['host'], permissions: ['read'],
      connectionPermissions: { host: ['read'] }, recentCalls: [] }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let method = '';
    try { method = JSON.parse(body).method; } catch { /* ignore */ }
    const result = method === 'initialize'
      ? { protocolVersion: '2026-07-28', serverInfo: { name: 'esquerystudio' } }
      : method === 'tools/list' ? { tools: [{ name: 'es_search' }] } : {};
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  });
});
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const port = mock.address().port;
const probeOutput = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [CLI, 'probe', '--url', `http://127.0.0.1:${port}/mcp`, '--token', TOKEN], { encoding: 'utf8' });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { out += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(out) : reject(new Error('probe failed: ' + out)));
});
mock.close();
assert.ok(probeOutput.includes('[probe] OK') && probeOutput.includes('tools     1'), probeOutput);
assert.ok(probeOutput.includes('OPERATOR'), probeOutput);

console.log('[mcp-cli] OK — client list, HTTP/Local/stdio configs, stdio bridge handshake, Qoder/CodeBuddy/ZCode/WorkBuddy/OpenCode/DeepSeekHarness, safe merge, probe');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
