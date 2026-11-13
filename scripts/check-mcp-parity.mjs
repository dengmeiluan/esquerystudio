#!/usr/bin/env node
/*
 * MCP 工具契约对齐门：服务端 McpController、纯前端 browserMcp.ts、
 * 本地 Node stdio MCP、docs/mcp.md 必须暴露同一组工具名与描述。
 * 任何一侧新增/改名/漏文档都会在此处失败。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const java = read('modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpController.java');
const ts = read('ui/src/platform/browserMcp.ts');
const local = read('mcp/esquerystudio-local-mcp.mjs');
const docs = read('docs/mcp.md');

function dedupe(list, label) {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.name)) throw new Error(`${label} 工具重复：${item.name}`);
    seen.add(item.name);
  }
  return list;
}

const javaTools = dedupe([...java.matchAll(/\btool\("([a-z0-9_]+)"\s*,\s*"([^"]*)"/g)]
  .map((m) => ({ name: m[1], description: m[2] })), 'McpController');

const tsBlockStart = ts.indexOf('export const MCP_TOOLS');
const tsBlockEnd = ts.indexOf('];', tsBlockStart);
if (tsBlockStart < 0 || tsBlockEnd < 0) throw new Error('browserMcp.ts 未找到 MCP_TOOLS 数组');
const tsTools = dedupe([...ts.slice(tsBlockStart, tsBlockEnd)
  .matchAll(/name:\s*'([a-z0-9_]+)'\s*,\s*description:\s*'([^']*)'/g)]
  .map((m) => ({ name: m[1], description: m[2] })), 'browserMcp');

const localTools = dedupe([...local.matchAll(/\btool\('([a-z0-9_]+)', '([^']*)'/g)]
  .map((m) => ({ name: m[1], description: m[2] })), 'esquerystudio-local-mcp.mjs');

const docsToolSection = docs.slice(docs.indexOf('## 工具', docs.indexOf('### action 型工具')));
const docsTools = dedupe([...docsToolSection.matchAll(/^\|\s*`(es_[a-z0-9_]+)`\s*\|/gm)]
  .map((m) => ({ name: m[1] })), 'docs/mcp.md');

function assertSame(reference, actual, label) {
  const refNames = reference.map((t) => t.name);
  const actualNames = actual.map((t) => t.name);
  if (JSON.stringify(refNames) !== JSON.stringify(actualNames)) {
    throw new Error(`${label} 工具集不一致：\n  基准 ${refNames.join(', ')}\n  实际 ${actualNames.join(', ')}`);
  }
  for (let i = 0; i < reference.length; i++) {
    if (reference[i].description && actual[i].description && actual[i].description !== reference[i].description) {
      throw new Error(`${label} 工具 ${reference[i].name} 描述不一致：\n  基准 ${reference[i].description}\n  实际 ${actual[i].description}`);
    }
  }
}

function assertHandlers(reference, source, label, pattern) {
  const handlers = new Set([...source.matchAll(pattern)].map((m) => m[1]));
  for (const tool of reference) {
    if (!handlers.has(tool.name)) throw new Error(`${label} 缺少工具处理器：${tool.name}`);
  }
}

function writeNames(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`无法定位写工具清单：${startMarker}`);
  return [...source.slice(start, end).matchAll(/'([a-z0-9_]+)'|"([a-z0-9_]+)"/g)]
    .map((m) => m[1] || m[2]);
}

assertSame(javaTools, tsTools, '服务端 vs 纯前端');
assertSame(javaTools, localTools, '服务端 vs 本地 Node');
assertSame(javaTools, docsTools, '服务端 vs 文档');
assertHandlers(javaTools, java, 'McpController', /case\s+"([a-z0-9_]+)"\s*:/g);
assertHandlers(javaTools, ts, 'browserMcp', /case\s+'([a-z0-9_]+)'\s*:/g);
assertHandlers(javaTools, local, 'esquerystudio-local-mcp', /case\s+'([a-z0-9_]+)'\s*:/g);

const javaWrites = writeNames(java, 'WRITE_TOOLS', 'DESTRUCTIVE_TOOLS');
const tsWrites = writeNames(ts, 'MCP_WRITE_TOOLS', '];');
const localWrites = writeNames(local, 'const WRITE_TOOLS', '];');
if (JSON.stringify(javaWrites) !== JSON.stringify(tsWrites)
  || JSON.stringify(javaWrites) !== JSON.stringify(localWrites)) {
  throw new Error(`写工具清单不一致：服务端 ${javaWrites.length} / 前端 ${tsWrites.length} / 本地 ${localWrites.length}`);
}
for (const name of javaWrites) {
  if (!javaTools.some((tool) => tool.name === name)) throw new Error(`写工具不在工具契约中：${name}`);
}
const javaAdminOnly = writeNames(java, 'ADMIN_ONLY_TOOLS', '));');
const tsAdminOnly = writeNames(ts, 'MCP_ADMIN_ONLY_TOOLS', '];');
if (JSON.stringify(javaAdminOnly) !== JSON.stringify(tsAdminOnly)) {
  throw new Error(`系统管理工具清单不一致：服务端 ${javaAdminOnly.length} / 前端 ${tsAdminOnly.length}`);
}
for (const name of javaAdminOnly) {
  if (!javaTools.some((tool) => tool.name === name)) {
    throw new Error(`系统管理工具不在工具契约中：${name}`);
  }
}
const javaDestructive = writeNames(java, 'DESTRUCTIVE_TOOLS', '));');
const tsDestructive = writeNames(ts, 'MCP_DESTRUCTIVE_TOOLS', '];');
const localDestructive = writeNames(local, 'const DESTRUCTIVE_TOOLS', '];');
if (JSON.stringify(javaDestructive) !== JSON.stringify(tsDestructive)
  || JSON.stringify(javaDestructive) !== JSON.stringify(localDestructive)) {
  throw new Error(`破坏性工具清单不一致：${javaDestructive.length}/${tsDestructive.length}/${localDestructive.length}`);
}
for (const name of javaDestructive) {
  /* es_rest 的读写由 path 语义动态判定，不在静态 WRITE_TOOLS 清单内。 */
  if (name !== 'es_rest' && !javaWrites.includes(name)) {
    throw new Error(`破坏性工具必须是写工具：${name}`);
  }
}
if (tsTools.length < 6) throw new Error(`MCP 工具数异常（${tsTools.length} < 6），解析可能失效`);
const tsSchemas = (ts.slice(tsBlockStart, tsBlockEnd).match(/inputSchema:/g) || []).length;
if (tsSchemas !== tsTools.length) throw new Error(`browserMcp.ts inputSchema 数量 ${tsSchemas} != 工具数 ${tsTools.length}`);

/* 资源与提示词：三个接入面必须暴露同一组 URI 模板与提示词名，并出现在文档里。 */
const javaResourceBlock = java.slice(java.indexOf('RESOURCE_URIS'), java.indexOf('));', java.indexOf('RESOURCE_URIS')));
const javaResources = [...javaResourceBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const tsResourceBlock = ts.slice(ts.indexOf('export const MCP_STATIC_RESOURCES'), ts.indexOf('export const MCP_PROMPTS'));
const tsResources = [...tsResourceBlock.matchAll(/uri(?:Template)?:\s*'([^']+)'/g)].map((m) => m[1]);
const localResourceBlock = local.slice(local.indexOf('const STATIC_RESOURCES'), local.indexOf('function promptArg'));
const localResources = [...localResourceBlock.matchAll(/uri(?:Template)?:\s*'([^']+)'/g)].map((m) => m[1]);
if (JSON.stringify(javaResources) !== JSON.stringify(tsResources)
  || JSON.stringify(javaResources) !== JSON.stringify(localResources)) {
  throw new Error(`资源 URI 不一致：\n  服务端 ${javaResources.join(', ')}\n  前端 ${tsResources.join(', ')}\n  本地 ${localResources.join(', ')}`);
}

const javaPromptBlock = java.slice(java.indexOf('PROMPT_NAMES'), java.indexOf('));', java.indexOf('PROMPT_NAMES')));
const javaPrompts = [...javaPromptBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
const tsPromptBlock = ts.slice(ts.indexOf('export const MCP_PROMPTS'), ts.indexOf('function mcpResources'));
const tsPrompts = [...tsPromptBlock.matchAll(/name:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
const localPromptBlock = local.slice(local.indexOf('const PROMPTS = ['), local.indexOf('function resources()'));
const localPrompts = [...localPromptBlock.matchAll(/name:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
if (JSON.stringify(javaPrompts) !== JSON.stringify(tsPrompts)
  || JSON.stringify(javaPrompts) !== JSON.stringify(localPrompts)) {
  throw new Error(`提示词清单不一致：\n  服务端 ${javaPrompts.join(', ')}\n  前端 ${tsPrompts.join(', ')}\n  本地 ${localPrompts.join(', ')}`);
}

for (const [label, source] of [['服务端', java], ['纯前端', ts], ['本地 Node', local]]) {
  for (const method of ['server/discover', 'resources/list', 'resources/templates/list', 'resources/read', 'prompts/list', 'prompts/get', 'completion/complete']) {
    if (!source.includes(method)) throw new Error(`${label} 缺少 MCP 方法：${method}`);
  }
}
for (const uri of javaResources) {
  if (!docs.includes(uri)) throw new Error(`docs/mcp.md 缺少资源 URI：${uri}`);
}
for (const prompt of javaPrompts) {
  if (!docs.includes(prompt)) throw new Error(`docs/mcp.md 缺少提示词：${prompt}`);
}

/* 调用留档三面同形：每面都要有 requestId/transport，浏览器/本地同样保留最近 100 条，
   不能一边 20 条、一边 100 条造成排障时「刚发生就丢了」。 */
const browserMcp = read('ui/src/platform/browserMcp.ts');
const localMcp = read('mcp/esquerystudio-local-mcp.mjs');
const access = read('modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpAccessService.java');
for (const [label, source] of [['browserMcp', browserMcp], ['localMcp', localMcp], ['McpAccessService', access]]) {
  for (const field of ['requestId', 'transport']) {
    if (!source.includes(field)) throw new Error(`${label} 调用留档缺少字段：${field}`);
  }
}
for (const [label, source] of [['browserMcp', browserMcp], ['localMcp', localMcp]]) {
  if (!/(?:length > 100|length = 100|slice\(0, 100\))/.test(source)) {
    throw new Error(`${label} 调用留档保留条数不是 100`);
  }
}
if (!access.includes('"transport"')) throw new Error('McpAccessService 未持久化 transport');

/* 客户端接入目录：面板标签行必须覆盖 CLI 的全部客户端，CLI 不得出现面板之外的品牌客户端；
   面板额外只允许通用 HTTP / stdio 桥 / 浏览器页面内桥这三类接入方式。 */
const panel = read('ui/src/components/McpPanel.vue');
const cli = read('mcp/esquerystudio-mcp-cli.mjs');
const panelClientBlock = panel.slice(panel.indexOf('const onboardingClients'), panel.indexOf('const onboardingNotes'));
const panelClients = [...panelClientBlock.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
const cliClientBlock = cli.slice(cli.indexOf('const CLIENTS'), cli.indexOf('];', cli.indexOf('const CLIENTS')));
const cliClients = [...cliClientBlock.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
if (new Set(panelClients).size !== panelClients.length) throw new Error('McpPanel 客户端标签重复');
const missingPanelClients = cliClients.filter((id) => !panelClients.includes(id));
if (missingPanelClients.length) throw new Error(`McpPanel 缺少 CLI 客户端：${missingPanelClients.join(', ')}`);
const panelOnlyClients = panelClients.filter((id) => !cliClients.includes(id)
  && !['http', 'stdio', 'browser'].includes(id));
if (panelOnlyClients.length) throw new Error(`McpPanel 出现 CLI 未收录的客户端：${panelOnlyClients.join(', ')}`);

/* action 型分组工具：Java / 浏览器 / 本地 Node 必须是同一组组名、同一 action→legacy 映射，
   且映射必须覆盖全部 130 个细粒度工具，避免“分组后某个能力静默消失”。 */
function parseJavaGroups(source) {
  const start = source.indexOf('private static Map<String, Map<String, String>> buildGroupActions()');
  const end = source.indexOf('private static Map<String, String> actions', start);
  const block = source.slice(start, end);
  const out = {};
  for (const match of block.matchAll(/groups\.put\("([a-z0-9_]+)", actions\(([^;]*)\)\);/g)) {
    const actions = {};
    for (const pair of match[2].matchAll(/"([a-z0-9_]+)", "([a-z0-9_]+)"/g)) actions[pair[1]] = pair[2];
    out[match[1]] = actions;
  }
  return out;
}
function parseTsGroups(source) {
  const start = source.indexOf('export const MCP_GROUP_ACTIONS');
  const end = source.indexOf('export const MCP_GROUP_DESCRIPTIONS', start);
  const block = source.slice(start, end);
  const out = {};
  for (const match of block.matchAll(/'([a-z0-9_]+)': \{([\s\S]*?)\n  \},/g)) {
    const actions = {};
    for (const pair of match[2].matchAll(/'([a-z0-9_]+)': '([a-z0-9_]+)'/g)) actions[pair[1]] = pair[2];
    out[match[1]] = actions;
  }
  return out;
}
function parseLocalGroups(source) {
  const start = source.indexOf('const GROUP_ACTIONS');
  const end = source.indexOf('const GROUP_DESCRIPTIONS', start);
  return parseTsGroups(source.slice(start, end).replace('const GROUP_ACTIONS', 'export const MCP_GROUP_ACTIONS'));
}
const javaGroups = parseJavaGroups(java);
const tsGroups = parseTsGroups(ts);
const localGroups = parseLocalGroups(local);
if (Object.keys(javaGroups).length !== 15) throw new Error(`服务端分组数异常：${Object.keys(javaGroups).length} != 15`);
if (JSON.stringify(javaGroups) !== JSON.stringify(tsGroups)) {
  throw new Error(`分组映射不一致：
  服务端 ${JSON.stringify(javaGroups)}
  浏览器 ${JSON.stringify(tsGroups)}`);
}
if (JSON.stringify(javaGroups) !== JSON.stringify(localGroups)) {
  throw new Error(`分组映射不一致：
  服务端 ${JSON.stringify(javaGroups)}
  本地 ${JSON.stringify(localGroups)}`);
}
const mappedLegacy = new Set(Object.values(javaGroups).flatMap((actions) => Object.values(actions)));
const missingMapped = javaTools.map((tool) => tool.name).filter((name) => !mappedLegacy.has(name));
if (missingMapped.length) throw new Error(`分组未覆盖工具：${missingMapped.join(', ')}`);
for (const group of Object.keys(javaGroups)) {
  if (!docs.includes(group)) throw new Error(`docs/mcp.md 缺少分组工具：${group}`);
}

if (process.argv.includes('--negative-control')) {
  for (const [label, actual] of [['纯前端', tsTools], ['本地 Node', localTools]]) {
    let failed = false;
    try {
      assertSame(javaTools.slice(0, -1), actual, '负控');
    } catch {
      failed = true;
    }
    if (!failed) throw new Error(`negative control 未触发：${label} 少一个工具仍被判为对齐`);
  }
  if (JSON.stringify(javaResources.slice(0, -1)) === JSON.stringify(tsResources)) {
    throw new Error('negative control 未触发：少一个资源 URI 仍被判为对齐');
  }
  if (JSON.stringify(javaPrompts.slice(0, -1)) === JSON.stringify(tsPrompts)) {
    throw new Error('negative control 未触发：少一个提示词仍被判为对齐');
  }
  console.log(`[mcp-parity] negative control OK — 少一个工具/资源/提示词在任一接入面都会被判失败`);
}

console.log(`[mcp-parity] OK — ${javaTools.length} legacy tools / ${Object.keys(javaGroups).length} action groups + ${javaPrompts.length} prompts + ${javaResources.length} resource URIs aligned across server / browser / local Node / docs`);
