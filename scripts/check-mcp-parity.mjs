#!/usr/bin/env node
/*
 * MCP 工具契约对齐门（单轨口径）：服务端 McpController、纯前端 browserMcp.ts、
 * 本地 Node stdio MCP 与 docs/mcp.md 必须暴露同一份「17 个 action 组 / 167 个 action」工具面。
 *
 * 对齐面：
 *   a) 17 个 action 组三端一致（组名集合、组序、每组 action → 内部实现名映射、组描述）。
 *   b) 内部实现名三端一致：服务端 callTool 的 case 分派名、浏览器 MCP_TOOLS 定义名、
 *      本地 TOOL_DEFINITIONS 注册名，且等于组映射的全部值——防止某个能力
 *      「有实现却没进组」或「进了组却没有实现」而静默消失。
 *   c) WRITE_TOOLS / DESTRUCTIVE_TOOLS 三端一致，ADMIN_ONLY_TOOLS 服务端与浏览器一致。
 *   d) MRTR_CONFIRM_TOOLS / TASK_TOOLS 三端一致（本批纳入，防二次确认与任务化清单漂移）。
 *   e) docs/mcp.md 的工具表 = 17 组行，每组 action 枚举与三端一致。
 *   f) 组级 annotations 静态表三端全等（readOnlyHint/destructiveHint/idempotentHint/
 *      openWorldHint），且与按 WRITE/DESTRUCTIVE 清单派生的期望值一致（防表漂移）。
 *   g) negative-control：裁剪任一对齐面后必须失败，防止门禁自欺。
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

/* ---------- a) 17 个 action 组 ---------- */
function parseJavaGroups(source) {
  const start = source.indexOf('private static Map<String, Map<String, String>> buildGroupActions()');
  const end = source.indexOf('private static Map<String, String> actions', start);
  if (start < 0 || end < 0) throw new Error('McpController 未找到 buildGroupActions()');
  const out = {};
  for (const match of source.slice(start, end).matchAll(/groups\.put\("([a-z0-9_]+)", actions\(([^;]*)\)\);/g)) {
    const actions = {};
    for (const pair of match[2].matchAll(/"([a-z0-9_]+)", "([a-z0-9_]+)"/g)) actions[pair[1]] = pair[2];
    if (!Object.keys(actions).length) throw new Error(`服务端分组 ${match[1]} 解析不到 action`);
    out[match[1]] = actions;
  }
  return out;
}
function parseTsStyleGroups(block, label) {
  const out = {};
  for (const match of block.matchAll(/'([a-z0-9_]+)': \{([\s\S]*?)\n  \},/g)) {
    const actions = {};
    for (const pair of match[2].matchAll(/'([a-z0-9_]+)': '([a-z0-9_]+)'/g)) actions[pair[1]] = pair[2];
    if (!Object.keys(actions).length) throw new Error(`${label} 分组 ${match[1]} 解析不到 action`);
    out[match[1]] = actions;
  }
  return out;
}
function parseTsGroups(source) {
  const start = source.indexOf('export const MCP_GROUP_ACTIONS');
  const end = source.indexOf('export const MCP_GROUP_DESCRIPTIONS', start);
  if (start < 0 || end < 0) throw new Error('browserMcp.ts 未找到 MCP_GROUP_ACTIONS');
  return parseTsStyleGroups(source.slice(start, end), 'browserMcp');
}
function parseLocalGroups(source) {
  const start = source.indexOf('const GROUP_ACTIONS');
  const end = source.indexOf('const GROUP_DESCRIPTIONS', start);
  if (start < 0 || end < 0) throw new Error('esquerystudio-local-mcp.mjs 未找到 GROUP_ACTIONS');
  return parseTsStyleGroups(source.slice(start, end), '本地 Node');
}
function parseJavaGroupDescriptions(source) {
  const start = source.indexOf('private static String groupDescription(String name)');
  const end = source.indexOf('default:', start);
  if (start < 0 || end < 0) throw new Error('McpController 未找到 groupDescription');
  const out = {};
  for (const match of source.slice(start, end).matchAll(/case "([a-z0-9_]+)": return "([^"]+)";/g)) out[match[1]] = match[2];
  return out;
}
function parseRecordDescriptions(source, marker, label) {
  const start = source.indexOf(marker);
  const end = source.indexOf('};', start);
  if (start < 0 || end < 0) throw new Error(`${label} 未找到组描述表`);
  const out = {};
  for (const match of source.slice(start, end).matchAll(/'([a-z0-9_]+)': '([^']+)'/g)) out[match[1]] = match[2];
  return out;
}

/* ---------- b) 内部实现名锚 ---------- */
/* 服务端：callTool 的 switch 分派名集合（组面归一后按内部实现名执行）。 */
function parseJavaImplNames(source) {
  const start = source.indexOf('private Map<String, Object> callTool(');
  const end = source.indexOf('default:', start);
  if (start < 0 || end < 0) throw new Error('McpController 未找到 callTool 分派');
  const names = [...source.slice(start, end).matchAll(/case "([a-z0-9_]+)":/g)].map((m) => m[1]);
  return [...new Set(names)];
}
/* 浏览器：MCP_TOOLS 是实现层定义（dispatchBrowserTool 的执行清单）。 */
function parseTsImplNames(source) {
  const start = source.indexOf('export const MCP_TOOLS');
  const end = source.indexOf('];', start);
  if (start < 0 || end < 0) throw new Error('browserMcp.ts 未找到 MCP_TOOLS 数组');
  const seen = new Set();
  const names = [...source.slice(start, end).matchAll(/name:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
  for (const name of names) {
    if (seen.has(name)) throw new Error(`browserMcp 实现名重复：${name}`);
    seen.add(name);
  }
  return names;
}
/* 本地 Node：TOOL_DEFINITIONS 是实现层注册（callTool 的执行清单）。 */
function parseLocalImplNames(source) {
  const start = source.indexOf('const TOOL_DEFINITIONS');
  const end = source.indexOf('];', start);
  if (start < 0 || end < 0) throw new Error('esquerystudio-local-mcp.mjs 未找到 TOOL_DEFINITIONS');
  const seen = new Set();
  const names = [...source.slice(start, end).matchAll(/\btool\('([a-z0-9_]+)', /g)].map((m) => m[1]);
  for (const name of names) {
    if (seen.has(name)) throw new Error(`本地 Node 实现名重复：${name}`);
    seen.add(name);
  }
  return names;
}

/* ---------- c/d) 静态分类清单 ---------- */
function arrayNames(source, marker, endToken, label) {
  const start = source.indexOf(marker);
  const end = source.indexOf(endToken, start);
  if (start < 0 || end < 0) throw new Error(`无法定位清单：${label}`);
  return [...source.slice(start, end).matchAll(/'([a-z0-9_]+)'|"([a-z0-9_]+)"/g)].map((m) => m[1] || m[2]);
}
function setNames(source, marker, label) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`无法定位清单：${label}`);
  const tail = source.slice(start);
  const match = tail.match(/new Set\(\[([\s\S]*?)\]\)/) || tail.match(/Arrays\.asList\(([\s\S]*?)\)\)/);
  if (!match) throw new Error(`无法定位清单：${label}`);
  return [...match[1].matchAll(/'([a-z0-9_]+)'|"([a-z0-9_]+)"/g)].map((m) => m[1] || m[2]);
}

/* ---------- f) 组级 annotations 静态表 ---------- */
/* 服务端：buildToolAnnotations 内逐组 out.put("组", annotations(readOnly, destructive)); */
function parseJavaAnnotations(source) {
  const start = source.indexOf('private static Map<String, Map<String, Object>> buildToolAnnotations()');
  const end = source.indexOf('return Collections.unmodifiableMap(out);', start);
  if (start < 0 || end < 0) throw new Error('McpController 未找到 buildToolAnnotations');
  const out = {};
  for (const m of source.slice(start, end).matchAll(/out\.put\("([a-z0-9_]+)", annotations\((true|false), (true|false)\)\);/g)) {
    out[m[1]] = { readOnlyHint: m[2] === 'true', destructiveHint: m[3] === 'true', idempotentHint: m[2] === 'true', openWorldHint: true };
  }
  return out;
}
/* 浏览器/本地：Record/Object 字面量逐组 '组': { readOnlyHint: .., destructiveHint: .., idempotentHint: .., openWorldHint: .. } */
function parseLiteralAnnotations(source, marker, label) {
  const start = source.indexOf(marker);
  const end = source.indexOf('};', start);
  if (start < 0 || end < 0) throw new Error(`${label} 未找到 annotations 静态表`);
  const out = {};
  for (const m of source.slice(start, end).matchAll(/'([a-z0-9_]+)': \{ readOnlyHint: (true|false), destructiveHint: (true|false), idempotentHint: (true|false), openWorldHint: (true|false) \}/g)) {
    out[m[1]] = { readOnlyHint: m[2] === 'true', destructiveHint: m[3] === 'true', idempotentHint: m[4] === 'true', openWorldHint: m[5] === 'true' };
  }
  return out;
}

/* ---------- e) docs 工具表 ---------- */
function parseDocsGroups(source) {
  const section = source.slice(source.indexOf('## 工具'));
  if (!section.includes('| 工具（组） |')) throw new Error('docs/mcp.md 缺少 17 组工具表');
  const out = {};
  for (const row of section.matchAll(/^\|\s*`(es_[a-z0-9_]+)`\s*\|\s*((?:`[a-z0-9_]+`(?:,\s*)?)+)\s*\|/gm)) {
    const actions = [...row[2].matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]);
    if (!actions.length) throw new Error(`docs/mcp.md 分组 ${row[1]} 的 action 列解析为空`);
    out[row[1]] = actions;
  }
  return out;
}

function collect() {
  return {
    javaGroups: parseJavaGroups(java),
    tsGroups: parseTsGroups(ts),
    localGroups: parseLocalGroups(local),
    javaDescs: parseJavaGroupDescriptions(java),
    tsDescs: parseRecordDescriptions(ts, 'export const MCP_GROUP_DESCRIPTIONS', 'browserMcp'),
    localDescs: parseRecordDescriptions(local, 'const GROUP_DESCRIPTIONS', '本地 Node'),
    javaImpl: parseJavaImplNames(java),
    tsImpl: parseTsImplNames(ts),
    localImpl: parseLocalImplNames(local),
    javaWrites: arrayNames(java, 'WRITE_TOOLS = ', '));', '服务端 WRITE_TOOLS'),
    tsWrites: arrayNames(ts, 'MCP_WRITE_TOOLS = [', '];', 'browserMcp MCP_WRITE_TOOLS'),
    localWrites: arrayNames(local, 'const WRITE_TOOLS = [', '];', '本地 Node WRITE_TOOLS'),
    javaDestructive: arrayNames(java, 'DESTRUCTIVE_TOOLS = ', '));', '服务端 DESTRUCTIVE_TOOLS'),
    tsDestructive: arrayNames(ts, 'MCP_DESTRUCTIVE_TOOLS = [', '];', 'browserMcp MCP_DESTRUCTIVE_TOOLS'),
    localDestructive: arrayNames(local, 'const DESTRUCTIVE_TOOLS = [', '];', '本地 Node DESTRUCTIVE_TOOLS'),
    javaAdminOnly: arrayNames(java, 'ADMIN_ONLY_TOOLS = ', '));', '服务端 ADMIN_ONLY_TOOLS'),
    tsAdminOnly: arrayNames(ts, 'MCP_ADMIN_ONLY_TOOLS = [', '];', 'browserMcp MCP_ADMIN_ONLY_TOOLS'),
    javaMrtr: setNames(java, 'MRTR_CONFIRM_TOOLS = ', '服务端 MRTR_CONFIRM_TOOLS'),
    tsMrtr: setNames(ts, 'MCP_MRTR_CONFIRM_TOOLS = ', 'browserMcp MCP_MRTR_CONFIRM_TOOLS'),
    localMrtr: setNames(local, 'const MRTR_CONFIRM_TOOLS = ', '本地 Node MRTR_CONFIRM_TOOLS'),
    javaTasks: setNames(java, 'TASK_TOOLS = ', '服务端 TASK_TOOLS'),
    tsTasks: setNames(ts, 'MCP_TASK_TOOLS = ', 'browserMcp MCP_TASK_TOOLS'),
    localTasks: setNames(local, 'const TASK_TOOLS = ', '本地 Node TASK_TOOLS'),
    javaAnnotations: parseJavaAnnotations(java),
    tsAnnotations: parseLiteralAnnotations(ts, 'export const MCP_TOOL_ANNOTATIONS', 'browserMcp'),
    localAnnotations: parseLiteralAnnotations(local, 'const TOOL_ANNOTATIONS', '本地 Node'),
    docsGroups: parseDocsGroups(docs),
  };
}

function runChecks(data) {
  /* a) 17 组三端一致：组名顺序、action → 实现名映射、组描述。 */
  const groupNames = Object.keys(data.javaGroups);
  if (groupNames.length !== 17) throw new Error(`服务端分组数异常：${groupNames.length} != 17`);
  for (const [label, groups] of [['浏览器', data.tsGroups], ['本地 Node', data.localGroups]]) {
    if (JSON.stringify(data.javaGroups) !== JSON.stringify(groups)) {
      throw new Error(`分组映射不一致（服务端 vs ${label}）：
  服务端 ${JSON.stringify(data.javaGroups)}
  ${label} ${JSON.stringify(groups)}`);
    }
  }
  for (const [label, descs] of [['浏览器', data.tsDescs], ['本地 Node', data.localDescs]]) {
    if (JSON.stringify(data.javaDescs) !== JSON.stringify(descs)) {
      throw new Error(`组描述不一致（服务端 vs ${label}）`);
    }
  }

  /* b) 内部实现名三端一致，且组映射必须覆盖全部实现名（双向不漏）。 */
  const mapped = Object.values(data.javaGroups).flatMap((actions) => Object.values(actions));
  if (new Set(mapped).size !== mapped.length) throw new Error('组映射存在重复的实现名');
  for (const [label, impl] of [['浏览器', data.tsImpl], ['本地 Node', data.localImpl]]) {
    if (JSON.stringify([...data.javaImpl].sort()) !== JSON.stringify([...impl].sort())) {
      const onlyJava = data.javaImpl.filter((n) => !impl.includes(n));
      const onlyOther = impl.filter((n) => !data.javaImpl.includes(n));
      throw new Error(`内部实现名不一致（服务端 vs ${label}）：仅服务端 ${onlyJava.join(', ')} / 仅${label} ${onlyOther.join(', ')}`);
    }
  }
  const missingInGroups = data.javaImpl.filter((name) => !mapped.includes(name));
  if (missingInGroups.length) throw new Error(`分组未覆盖实现名：${missingInGroups.join(', ')}`);
  const missingImpl = mapped.filter((name) => !data.javaImpl.includes(name));
  if (missingImpl.length) throw new Error(`分组映射到不存在的实现名：${missingImpl.join(', ')}`);

  /* 单轨注册面锚：三端 tools/list 只产自组表，不得回退细粒度注册。 */
  if (java.includes('public static final List<String> TOOL_NAMES')) {
    throw new Error('McpController 不得恢复细粒度工具名总表（客户端面只应是 17 个 action 组）');
  }
  if (!ts.includes('tools: browserGroupTools(),')) throw new Error('browserMcp 的页面入口必须挂 browserGroupTools() 组面');
  if (!local.includes('return groupTools();')) throw new Error('本地 Node 的 tools() 必须返回 groupTools() 组面');

  /* c) 写 / 破坏性 / 系统管理清单一致。 */
  for (const [label, list] of [['浏览器', data.tsWrites], ['本地 Node', data.localWrites]]) {
    if (JSON.stringify(data.javaWrites) !== JSON.stringify(list)) {
      throw new Error(`写工具清单不一致：服务端 ${data.javaWrites.length} / ${label} ${list.length}`);
    }
  }
  for (const name of data.javaWrites) {
    if (!data.javaImpl.includes(name)) throw new Error(`写工具不在实现名集合中：${name}`);
  }
  for (const [label, list] of [['浏览器', data.tsDestructive], ['本地 Node', data.localDestructive]]) {
    if (JSON.stringify(data.javaDestructive) !== JSON.stringify(list)) {
      throw new Error(`破坏性工具清单不一致：服务端 ${data.javaDestructive.length} / ${label} ${list.length}`);
    }
  }
  for (const name of data.javaDestructive) {
    /* es_rest 的读写由 path 语义动态判定，不在静态写清单内。 */
    if (name !== 'es_rest' && !data.javaWrites.includes(name)) {
      throw new Error(`破坏性工具必须是写工具：${name}`);
    }
  }
  if (JSON.stringify(data.javaAdminOnly) !== JSON.stringify(data.tsAdminOnly)) {
    throw new Error(`系统管理工具清单不一致：服务端 ${data.javaAdminOnly.length} / 前端 ${data.tsAdminOnly.length}`);
  }
  for (const name of data.javaAdminOnly) {
    if (!data.javaImpl.includes(name)) throw new Error(`系统管理工具不在实现名集合中：${name}`);
  }

  /* d) MRTR 二次确认与 Tasks 任务化清单三端一致。 */
  for (const [label, list] of [['浏览器', data.tsMrtr], ['本地 Node', data.localMrtr]]) {
    if (JSON.stringify(data.javaMrtr) !== JSON.stringify(list)) {
      throw new Error(`MRTR 确认清单不一致：服务端 ${data.javaMrtr.length} / ${label} ${list.length}`);
    }
  }
  for (const name of data.javaMrtr) {
    if (!data.javaImpl.includes(name)) throw new Error(`MRTR 确认工具不在实现名集合中：${name}`);
  }
  for (const [label, list] of [['浏览器', data.tsTasks], ['本地 Node', data.localTasks]]) {
    if (JSON.stringify(data.javaTasks) !== JSON.stringify(list)) {
      throw new Error(`Tasks 工具清单不一致：服务端 ${data.javaTasks.length} / ${label} ${list.length}`);
    }
  }
  for (const name of data.javaTasks) {
    if (!data.javaImpl.includes(name)) throw new Error(`Tasks 工具不在实现名集合中：${name}`);
  }

  /* e) docs 工具表 = 17 组行，每组 action 枚举与三端一致。 */
  const docsNames = Object.keys(data.docsGroups);
  if (JSON.stringify(groupNames) !== JSON.stringify(docsNames)) {
    const missing = groupNames.filter((n) => !docsNames.includes(n));
    const extra = docsNames.filter((n) => !groupNames.includes(n));
    throw new Error(`docs/mcp.md 工具表与 17 组不一致：缺 ${missing.join(', ') || '无'} / 多 ${extra.join(', ') || '无'}`);
  }
  for (const group of groupNames) {
    const expected = Object.keys(data.javaGroups[group]);
    if (JSON.stringify(expected) !== JSON.stringify(data.docsGroups[group])) {
      throw new Error(`docs/mcp.md 分组 ${group} 的 action 枚举不一致：
  实现 ${expected.join(', ')}
  文档 ${data.docsGroups[group].join(', ')}`);
    }
  }

  /* f) 组级 annotations 静态表三端全等，且与按 WRITE/DESTRUCTIVE 清单派生的期望值一致。 */
  const annotationKeys = Object.keys(data.javaAnnotations);
  if (JSON.stringify(annotationKeys) !== JSON.stringify(groupNames)) {
    throw new Error(`服务端 annotations 表与 17 组不一致：${annotationKeys.length} 组 vs ${groupNames.length} 组`);
  }
  for (const [label, table] of [['浏览器', data.tsAnnotations], ['本地 Node', data.localAnnotations]]) {
    if (JSON.stringify(data.javaAnnotations) !== JSON.stringify(table)) {
      throw new Error(`annotations 静态表不一致（服务端 vs ${label}）`);
    }
  }
  /* 派生自检：readOnlyHint=组内全部零写（非 WRITE 且非 es_rest），destructiveHint=组内
     含 DESTRUCTIVE，idempotentHint 同 readOnlyHint，openWorldHint=true——静态表与真实
     分类清单漂移时在此失败，防止 annotations 谎报。 */
  for (const group of groupNames) {
    const impls = Object.values(data.javaGroups[group]);
    const derived = {
      readOnlyHint: impls.every((n) => !data.javaWrites.includes(n) && n !== 'es_rest'),
      destructiveHint: impls.some((n) => data.javaDestructive.includes(n)),
      idempotentHint: impls.every((n) => !data.javaWrites.includes(n) && n !== 'es_rest'),
      openWorldHint: true,
    };
    if (JSON.stringify(derived) !== JSON.stringify(data.javaAnnotations[group])) {
      throw new Error(`annotations 表与清单派生值不一致：${group} 表 ${JSON.stringify(data.javaAnnotations[group])} vs 派生 ${JSON.stringify(derived)}`);
    }
  }
}

runChecks(collect());

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
const access = read('modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpAccessService.java');
for (const [label, source] of [['browserMcp', ts], ['localMcp', local], ['McpAccessService', access]]) {
  for (const field of ['requestId', 'transport']) {
    if (!source.includes(field)) throw new Error(`${label} 调用留档缺少字段：${field}`);
  }
}
for (const [label, source] of [['browserMcp', ts], ['localMcp', local]]) {
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

if (process.argv.includes('--negative-control')) {
  const mustFail = (label, mutate) => {
    const data = collect();
    mutate(data);
    let failed = false;
    try {
      runChecks(data);
    } catch {
      failed = true;
    }
    if (!failed) throw new Error(`negative control 未触发：${label}`);
  };
  mustFail('少一个组', (data) => {
    const first = Object.keys(data.javaGroups)[0];
    delete data.javaGroups[first];
  });
  mustFail('组的 action 少一个', (data) => {
    const group = Object.keys(data.javaGroups)[0];
    const actions = Object.keys(data.javaGroups[group]);
    delete data.javaGroups[group][actions[0]];
  });
  mustFail('实现名少一个（分派覆盖断言）', (data) => {
    data.javaImpl = data.javaImpl.slice(0, -1);
  });
  mustFail('写清单少一项', (data) => {
    data.javaWrites = data.javaWrites.slice(0, -1);
  });
  mustFail('MRTR 清单少一项', (data) => {
    data.javaMrtr = data.javaMrtr.slice(0, -1);
  });
  mustFail('Tasks 清单少一项', (data) => {
    data.javaTasks = data.javaTasks.slice(0, -1);
  });
  mustFail('docs 少一组行', (data) => {
    const first = Object.keys(data.docsGroups)[0];
    delete data.docsGroups[first];
  });
  mustFail('annotations 表少一组', (data) => {
    const first = Object.keys(data.javaAnnotations)[0];
    delete data.javaAnnotations[first];
  });
  mustFail('annotations 翻转一个布尔', (data) => {
    const group = data.javaAnnotations.es_xmigrate;
    group.destructiveHint = !group.destructiveHint;
  });
  if (JSON.stringify(javaResources.slice(0, -1)) === JSON.stringify(tsResources)) {
    throw new Error('negative control 未触发：少一个资源 URI 仍被判为对齐');
  }
  if (JSON.stringify(javaPrompts.slice(0, -1)) === JSON.stringify(tsPrompts)) {
    throw new Error('negative control 未触发：少一个提示词仍被判为对齐');
  }
  console.log('[mcp-parity] negative control OK — 少一个组/action/实现名/清单项/annotations 布尔/资源/提示词/docs 行在任一接入面都会被判失败');
}

const data = collect();
console.log(`[mcp-parity] OK — ${Object.keys(data.javaGroups).length} action groups (${data.javaImpl.length} actions) `
  + `+ ${javaPrompts.length} prompts + ${javaResources.length} resource URIs aligned across server / browser / local Node / docs`);
