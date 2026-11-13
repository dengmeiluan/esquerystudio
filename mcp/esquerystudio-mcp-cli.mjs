#!/usr/bin/env node
/**
 * ESQueryStudio MCP client installer.
 *
 * Generates or installs MCP server configuration for common agent clients.
 * It never runs another vendor's CLI; clients that only expose a command are
 * printed as copy-paste commands. Unknown clients get a portable `mcpServers`
 * JSON snippet that can be pasted into the client's own MCP settings.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LOCAL_SCRIPT = fileURLToPath(new URL('./esquerystudio-local-mcp.mjs', import.meta.url));

const CLIENTS = [
  { id: 'claude-code', label: 'Claude Code', transport: 'http', format: 'command', command: 'claude mcp add --transport http esquerystudio <url> --header "Authorization: Bearer <token>"' },
  { id: 'cursor', label: 'Cursor', transport: 'http', format: 'mcpServers', configPath: '~/.cursor/mcp.json' },
  { id: 'vscode', label: 'VS Code', transport: 'http', format: 'vscode', configPath: '.vscode/mcp.json' },
  { id: 'windsurf', label: 'Windsurf', transport: 'http', format: 'mcpServers', configPath: '~/.codeium/windsurf/mcp_config.json' },
  { id: 'trae', label: 'TRAE', transport: 'http', format: 'mcpServers', configPath: '.trae/mcp.json' },
  { id: 'codex', label: 'Codex', transport: 'http', format: 'codex', configPath: '~/.codex/config.toml' },
  { id: 'qoder', label: 'Qoder', transport: 'http', format: 'qoder', configPath: '~/.qoder/settings.json' },
  { id: 'codebuddy', label: 'CodeBuddy Code CLI', transport: 'http', format: 'codebuddy', configPath: '~/.codebuddy/.mcp.json' },
  { id: 'zcode', label: 'ZCode', transport: 'http', format: 'zcode', configPath: '~/.zcode/cli/config.json' },
  { id: 'deepseek-harness', label: 'DeepSeek Harness', transport: 'http', format: 'dsh', configPath: null },
  { id: 'opencode', label: 'OpenCode', transport: 'http', format: 'opencode', configPath: '~/.config/opencode/opencode.json' },
  { id: 'pi', label: 'Pi', transport: 'http', format: 'mcpServers', configPath: '~/.pi/agent/mcp.json' },
  { id: 'cherry-studio', label: 'Cherry Studio', transport: 'http', format: 'mcpServers', configPath: null },
  { id: 'workbuddy', label: 'WorkBuddy', transport: 'http', format: 'workbuddy', configPath: '~/.workbuddy/mcp.json' },
  { id: 'antigravity', label: 'Antigravity', transport: 'http', format: 'mcpServers', configPath: '~/.gemini/config/mcp_config.json' },
  { id: 'dbx', label: 'DBX (MCP Server)', transport: 'server', format: 'host', configPath: null },
  { id: 'local', label: 'Local Node (stdio)', transport: 'stdio', format: 'local', configPath: '~/.esquerystudio/mcp.json' },
];

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || '') : fallback;
}
function has(name) { return process.argv.includes(name); }
function expandHome(p) { return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p; }
function serverConfig(url, token) {
  return { url, headers: { Authorization: 'Bearer ' + token } };
}
function isSseUrl(url) {
  return /\/sse\/?$/.test(String(url || '').replace(/\s+$/, ''));
}
function sseUrl(url) {
  const clean = String(url || '').replace(/\/+$/, '');
  if (/\/sse$/.test(clean)) return clean;
  return clean.endsWith('/mcp') ? clean + '/sse' : clean + '/mcp/sse';
}
function transportType(url) {
  return isSseUrl(url) ? 'sse' : 'http';
}
function localServer(connectionConfig) {
  const configPath = connectionConfig.startsWith('~/') ? expandHome(connectionConfig) : path.resolve(connectionConfig);
  return { command: 'node', args: [LOCAL_SCRIPT, '--config', configPath] };
}
function localJsonFor(client, connectionConfig) {
  const server = localServer(connectionConfig);
  if (client.format === 'vscode') return { servers: { esquerystudio: { type: 'stdio', ...server } } };
  if (client.format === 'opencode') {
    return {
      '$schema': 'https://opencode.ai/config.json',
      mcp: { servers: { esquerystudio: { type: 'local', command: [server.command, ...server.args] } } },
    };
  }
  if (client.format === 'zcode') return { mcp: { servers: { esquerystudio: { type: 'stdio', ...server } } } };
  if (client.format === 'qoder' || client.format === 'codebuddy' || client.format === 'workbuddy') {
    return { mcpServers: { esquerystudio: { type: 'stdio', ...server } } };
  }
  return { mcpServers: { esquerystudio: server } };
}
function jsonFor(client, url, token, localMode = false, connectionConfig = '~/.esquerystudio/mcp.json') {
  if (localMode) return localJsonFor(client, connectionConfig);
  if (client.format === 'vscode') return { servers: { esquerystudio: { type: transportType(url), ...serverConfig(url, token) } } };
  if (client.format === 'opencode') {
    return {
      '$schema': 'https://opencode.ai/config.json',
      mcp: {
        servers: {
          esquerystudio: { type: 'remote', ...serverConfig(url, token), oauth: false },
        },
      },
    };
  }
  if (client.format === 'qoder' || client.format === 'codebuddy' || client.format === 'workbuddy') {
    return { mcpServers: { esquerystudio: { type: transportType(url), ...serverConfig(url, token) } } };
  }
  if (client.format === 'zcode') {
    return { mcp: { servers: { esquerystudio: { type: transportType(url), ...serverConfig(url, token) } } } };
  }
  if (client.format === 'local') {
    return {
      defaultConnection: 'prod',
      connections: [{
        id: 'prod', name: 'Production', url: 'http://localhost:9200',
        username: 'elastic', password: '<password>',
      }],
    };
  }
  return { mcpServers: { esquerystudio: { type: transportType(url), ...serverConfig(url, token) } } };
}
function tomlString(value) {
  return JSON.stringify(String(value == null ? '' : value));
}
function codexToml(url, token, localMode, connectionConfig) {
  if (localMode) {
    const configPath = connectionConfig.startsWith('~/') ? expandHome(connectionConfig) : path.resolve(connectionConfig);
    return '[mcp_servers.esquerystudio]\n'
      + 'command = ' + tomlString('node') + '\n'
      + 'args = [' + tomlString(LOCAL_SCRIPT) + ', ' + tomlString('--config') + ', ' + tomlString(configPath) + ']\n';
  }
  return '[mcp_servers.esquerystudio]\n'
    + 'url = ' + tomlString(url) + '\n'
    + 'http_headers = { Authorization = ' + tomlString('Bearer ' + token) + ' }\n';
}
function textFor(client, url, token, localMode = false, connectionConfig = '~/.esquerystudio/mcp.json') {
  if (client.format === 'host') {
    return 'DBX 0.6+ 是 MCP Server（把自己的数据库连接暴露给 AI 客户端），不是 MCP 客户端，不能安装本端点。\n'
      + '若同一个 Agent 要同时使用 DBX 与 ESQueryStudio，请在 Agent 配置里并列注册两个 server；DBX 侧可用 `dbx agent setup` 安装它的官方 Agent Skill。';
  }
  if (client.format === 'local') return JSON.stringify(jsonFor(client, url, token), null, 2);
  if (client.format === 'codex') return codexToml(url, token, localMode, connectionConfig);
  if (localMode && client.format === 'command') {
    const configPath = connectionConfig.startsWith('~/') ? expandHome(connectionConfig) : path.resolve(connectionConfig);
    const script = `"${LOCAL_SCRIPT}"`;
    const cfg = `"${configPath}"`;
    return client.id === 'claude-code'
      ? `claude mcp add --transport stdio esquerystudio -- node ${script} --config ${cfg}`
      : `codex mcp add esquerystudio -- node ${script} --config ${cfg}`;
  }
  if (localMode) return JSON.stringify(localJsonFor(client, connectionConfig), null, 2);
  if (client.format === 'command') {
    let command = client.command.split('<url>').join(url).split('<token>').join(token);
    if (isSseUrl(url)) command = command.replace('--transport http', '--transport sse');
    return command;
  }
  if (client.format === 'dsh') {
    const safeToken = String(token).replace(/'/g, "''");
    return "- id: esquerystudio\n"
      + "  name: '@deepseek-ai/dsh-mcp-client'\n"
      + "  config:\n"
      + "    serverName: esquerystudio\n"
      + "    transport: " + (isSseUrl(url) ? 'sse' : 'streamable-http') + "\n"
      + `    url: ${url}\n`
      + "    headers:\n"
      + `      Authorization: 'Bearer ${safeToken}'\n`;
  }
  return JSON.stringify(jsonFor(client, url, token), null, 2);
}
function printList() {
  console.log('id\tlabel\ttransport\tconfigPath');
  for (const c of CLIENTS) {
    const hint = c.configPath
      || (c.format === 'dsh' ? '(paste YAML into cordis.yml)' : '(paste JSON into MCP settings)');
    console.log([c.id, c.label, c.transport, hint].join('\t'));
  }
}

const CLIENT_COMMANDS = {
  'claude-code': ['claude'], cursor: ['cursor'], vscode: ['code', 'code-insiders'],
  windsurf: ['windsurf'], trae: ['trae'], codex: ['codex'], qoder: ['qoder'],
  codebuddy: ['codebuddy'], zcode: ['zcode'], 'deepseek-harness': ['dsh'],
  opencode: ['opencode'], pi: ['pi'], 'cherry-studio': [], workbuddy: [], antigravity: ['antigravity'],
  dbx: ['dbx'], local: ['node'],
};
function commandAvailable(command) {
  if (!command) return false;
  const finder = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(finder, [command], { stdio: 'ignore' }).status === 0;
}
/* installed 只回答「配置里是否已有 esquerystudio」，读不懂就如实返回 null（unknown），
   不把不存在、不可解析或 GUI 专属配置猜成已接入。 */
function installedState(client) {
  if (!client.configPath || client.id === 'local') return null;
  const file = client.configPath.startsWith('~/') ? expandHome(client.configPath) : path.resolve(client.configPath);
  if (!fs.existsSync(file)) return false;
  try {
    const root = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!root || typeof root !== 'object') return null;
    if (client.format === 'vscode') return !!(root.servers && root.servers.esquerystudio);
    if (client.format === 'opencode' || client.format === 'zcode') {
      return !!(root.mcp && root.mcp.servers && root.mcp.servers.esquerystudio);
    }
    if (client.format === 'mcpServers' || client.format === 'qoder' || client.format === 'codebuddy' || client.format === 'workbuddy') {
      return !!(root.mcpServers && root.mcpServers.esquerystudio);
    }
    return null;
  } catch (e) {
    return null;
  }
}
function detectClients() {
  return CLIENTS.map((client) => {
    const commands = CLIENT_COMMANDS[client.id] || [];
    const command = commands.find(commandAvailable) || '';
    const configPath = client.configPath
      ? (client.configPath.startsWith('~/') ? expandHome(client.configPath) : path.resolve(client.configPath))
      : '';
    return {
      id: client.id, label: client.label, transport: client.transport,
      role: client.transport === 'server' ? 'server' : 'client',
      mode: commands.length ? 'cli' : 'gui',
      command: command || null, commandCandidates: commands,
      configPath: configPath || null,
      commandFound: !!command, configFound: !!configPath && fs.existsSync(configPath),
      installed: installedState(client),
    };
  });
}
function printDetect() {
  const json = process.argv.includes('--json');
  const rows = detectClients();
  if (json) { console.log(JSON.stringify(rows, null, 2)); return; }
  console.log('id	label	mode	command	config	installed');
  for (const row of rows) {
    const installed = row.installed === true ? 'yes' : (row.installed === false ? 'no' : 'unknown');
    console.log([row.id, row.label, row.mode, row.commandFound ? row.command : '-',
      row.configFound ? 'found' : (row.configPath || '-'), installed].join('	'));
  }
}
function findClient(id) {
  const c = CLIENTS.find((item) => item.id === id);
  if (!c) throw new Error('Unknown client "' + id + '". Run: esquerystudio-mcp-cli list');
  return c;
}
function mergeJson(file, client, payload) {
  let root = {};
  try { if (fs.existsSync(file)) root = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new Error('Cannot parse existing ' + file + ': ' + e.message);
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) root = {};
  if (client.format === 'vscode') root.servers = { ...(root.servers || {}), esquerystudio: payload.servers.esquerystudio };
  else if (client.format === 'mcpServers' || client.format === 'qoder' || client.format === 'codebuddy' || client.format === 'workbuddy') {
    root.mcpServers = { ...(root.mcpServers || {}), esquerystudio: payload.mcpServers.esquerystudio };
  } else if (client.format === 'opencode' || client.format === 'zcode') {
    root.mcp = { ...(root.mcp || {}) };
    root.mcp.servers = { ...(root.mcp.servers || {}), esquerystudio: payload.mcp.servers.esquerystudio };
  } else return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(root, null, 2) + '\n', 'utf8');
  return true;
}

const command = process.argv[2] || 'help';
if (command === 'list') {
  printList();
} else if (command === 'detect') {
  printDetect();
} else if (command === 'probe') {
  /* 一条命令验证「端点 + key + 实际权限」：客户端接入排障先跑它，避免盲猜 401/地址写错。 */
  const url = arg('--url');
  const token = arg('--token');
  const asJson = process.argv.includes('--json');
  if (!url || !token) {
    console.error('[esquerystudio-mcp-cli] probe requires --url and --token');
    process.exit(1);
  }
  const headers = {
    Authorization: 'Bearer ' + token.replace(/^Bearer\s+/i, ''),
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  let nextId = 1;
  const rpc = async (method, params = {}) => {
    const res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
      const err = new Error(body?.error?.message || ('HTTP ' + res.status));
      err.code = body?.error?.data;
      err.status = res.status;
      throw err;
    }
    return body.result;
  };
  try {
    const started = Date.now();
    const init = await rpc('initialize', {
      protocolVersion: '2026-07-28', capabilities: {},
      clientInfo: { name: 'esquerystudio-mcp-cli', version: '1.0.0' },
    });
    const toolList = await rpc('tools/list');
    let card = null;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) card = await res.json();
    } catch { /* 服务卡是增强信息，失败不掩盖 initialize 结果 */ }
    const ms = Date.now() - started;
    const toolNames = (toolList?.tools || []).map((t) => t.name);
    /* 服务卡把 role/connections 放在根上（discover 契约）；兼容 scope 包裹与 result 包裹。 */
    const scope = card?.scope || card?.result?.scope
      || (card?.role || card?.connections ? card : (card?.result?.role ? card.result : null));
    const out = {
      ok: true, endpoint: url, protocol: init?.protocolVersion || 'unknown',
      server: init?.serverInfo?.name || 'esquerystudio',
      tools: toolNames, toolCount: toolNames.length,
      role: scope?.role || null,
      connections: scope?.connections || null,
      permissions: scope?.permissions || null,
      connectionPermissions: scope?.connectionPermissions || null,
      recentCalls: (card?.recentCalls || card?.result?.recentCalls || []).slice(0, 3),
      ms,
    };
    if (asJson) { console.log(JSON.stringify(out, null, 2)); }
    else {
      console.log('[probe] OK  ' + ms + 'ms  ' + url);
      console.log('  protocol  ' + out.protocol + '  server ' + out.server);
      console.log('  tools     ' + out.toolCount + '  ' + toolNames.slice(0, 8).join(', ') + (toolNames.length > 8 ? ' …' : ''));
      if (scope) {
        console.log('  key role  ' + (scope.role || '?') + '  connections ' + JSON.stringify(scope.connections || []));
        console.log('  perms     ' + JSON.stringify(scope.permissions || []) + '  per-connection ' + JSON.stringify(scope.connectionPermissions || {}));
      }
      if (out.recentCalls.length) console.log('  last call ' + JSON.stringify(out.recentCalls[0]));
    }
  } catch (e) {
    if (asJson) console.log(JSON.stringify({ ok: false, status: e.status || null, code: e.code || null, message: e.message }, null, 2));
    else console.error('[probe] FAIL  ' + (e.status ? 'HTTP ' + e.status + ' ' : '') + (e.code ? e.code + ': ' : '') + e.message);
    process.exit(1);
  }
} else if (command === 'config' || command === 'install') {
  try {
    const client = findClient(arg('--client'));
    const url = arg('--url');
    const token = arg('--token');
    const localMode = has('--local') || arg('--mode') === 'local';
    const connectionConfig = arg('--connection-config') || '~/.esquerystudio/mcp.json';
    const transport = String(arg('--transport') || 'http').toLowerCase();
    if (transport !== 'http' && transport !== 'sse') {
      throw new Error('--transport must be http or sse');
    }
    if (localMode && transport === 'sse') {
      throw new Error('SSE is an HTTP transport; --local uses stdio');
    }
    if (!localMode && client.transport === 'http' && (!url || !token)) {
      throw new Error('HTTP clients require --url and --token (or set them in the generated config later)');
    }
    const effectiveUrl = transport === 'sse' ? sseUrl(url) : url;
    const text = textFor(client, effectiveUrl, token, localMode, connectionConfig);
    if (command === 'config') {
      console.log(text);
    } else if (client.format === 'host') {
      console.log(text);
    } else if (client.format === 'command') {
      console.log('Run this command in the client terminal:\n\n' + text);
    } else if (client.format === 'local') {
      const file = expandHome(arg('--config') || client.configPath);
      console.log('Local MCP config (save as ' + file + '):\n\n' + text);
    } else {
      const explicit = arg('--config');
      const file = explicit ? path.resolve(explicit) : (client.configPath ? expandHome(client.configPath) : '');
      if (has('--write') && client.format === 'codex') {
        throw new Error('Codex 使用 TOML 配置，--write 不适用；请把输出粘贴到 ~/.codex/config.toml');
      }
      if (has('--write') && file) {
        if (mergeJson(file, client, jsonFor(client, effectiveUrl, token, localMode, connectionConfig))) console.log('Updated ' + file);
        else throw new Error('--write is not supported for client ' + client.id);
      } else {
        console.log('Paste this into ' + (file || 'the client MCP settings') + ':\n\n' + text);
      }
    }
  } catch (e) {
    console.error('[esquerystudio-mcp-cli] ' + e.message);
    process.exit(1);
  }
} else {
  console.log('ESQueryStudio MCP client installer\n\n'
    + 'Usage:\n'
    + '  esquerystudio-mcp-cli list\n'
    + '  esquerystudio-mcp-cli detect [--json]\n'
    + '  esquerystudio-mcp-cli probe --url <mcp-url> --token <key> [--json]\n'
    + '  esquerystudio-mcp-cli config  --client <id> --url <mcp-url> --token <key> [--transport http|sse]\n'
    + '  esquerystudio-mcp-cli install --client <id> --url <mcp-url> --token <key> [--transport http|sse] [--write] [--config file]\n'
    + '  esquerystudio-mcp-cli install --client <id> --local [--connection-config file] [--write]\n'
    + '  esquerystudio-mcp-cli install --client local [--config file]\n\n'
    + '  --transport sse 把 .../mcp 映射为 .../mcp/sse；--local 始终走 stdio。\n\n'
    + 'Examples:\n'
    + '  esquerystudio-mcp-cli install --client cursor --url http://localhost:5601/mcp --token esq_mcp_xxx --write\n'
    + '  esquerystudio-mcp-cli install --client workbuddy --url http://localhost:5601/mcp --token esq_mcp_xxx --transport sse\n'
    + '  esquerystudio-mcp-cli install --client cursor --local --write\n'
    + '  esquerystudio-mcp-cli config --client claude-code --url http://localhost:5601/mcp --token esq_mcp_xxx\n'
    + '  esquerystudio-mcp-cli config --client codex --local\n'
    + '  esquerystudio-mcp-cli config --client local\n'
    + '  esquerystudio-mcp-cli probe --url http://localhost:5601/mcp --token esq_mcp_xxx\n');
}
