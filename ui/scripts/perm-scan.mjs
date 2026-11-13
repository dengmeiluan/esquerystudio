#!/usr/bin/env node
/**
 * 权限一致性扫描器（可复跑，CI 可接）。
 *
 * 解决的是这一类漂移：后端拦截器的关键词表 / 共享端点表 / 页面契约，与前端
 * auth.ts 的镜像表、各视图 canEndpoint 的能力档、页 key 之间**没有任何编译期约束**。
 * 历史事故形态：前端说可点、后端 403（有权限的人被拦）；或前端按 write 档放行、
 * 后端按 rank3 拒绝（越权承诺）。
 *
 * 本脚本以**后端源码为唯一真源**，反向校验前端：
 *   1) auth.ts SHARED_WRITE_PAGE_KEYS / SHARED_READ_PAGE_KEYS 与 Java 两表逐条一致；
 *   2) 视图里 canEndpoint(cap, method, path) 的能力档与路径真实档位一致
 *      （过宽=安全洞，过严=误拦）；
 *   3) canPage(pageKey) 的 pageKey 必须存在于页面契约；
 *   4) 写方法调用点所在文件必须有权限门（缺门=能点不能动）。
 *
 * 用法：node scripts/perm-scan.mjs [--quiet]
 * 退出码：0=无问题；1=发现不一致（可挂 CI）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONSOLE = path.resolve(HERE, '..');
const ROOT = path.resolve(CONSOLE, '..');
const INTERCEPTOR = path.join(ROOT, 'modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/auth/ConsoleAuthInterceptor.java');
const CONTRACT = path.join(ROOT, 'platform/src/main/resources/META-INF/esquerystudio-pages.json');
const API_TS = path.join(CONSOLE, 'src/api.ts');
const AUTH_TS = path.join(CONSOLE, 'src/stores/auth.ts');
const SRC = path.join(CONSOLE, 'src');

const quiet = process.argv.includes('--quiet');
const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

function read(p) {
  if (!fs.existsSync(p)) throw new Error('缺少文件: ' + p);
  return fs.readFileSync(p, 'utf8');
}

/* ── 1. 后端关键词表 ─────────────────────────────────────────────── */
const java = read(INTERCEPTOR);

function javaList(name) {
  const m = java.match(new RegExp(`(?:private|public|protected)?\\s*static\\s+final\\s+List<String>\\s+${name}\\s*=\\s*Arrays\\.asList\\(([\\s\\S]*?)\\);`));
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

function javaSharedMap(fieldName) {
  const m = java.match(new RegExp(`${fieldName}\\s*;\\s*static\\s*\\{([\\s\\S]*?)\\n\\s*${fieldName}\\s*=`));
  if (!m) return null;
  const out = new Map();
  const body = m[1];
  /* 逐条从 m.put( 扫到配对的 ");"——页集列表常跨行，按行切会漏掉多行条目 */
  let i = 0;
  while ((i = body.indexOf('m.put', i)) >= 0) {
    const open = body.indexOf('(', i);
    const close = body.indexOf(');', open);
    if (open < 0 || close < 0) break;
    const call = body.slice(open + 1, close); // 去掉 put 自身的左括号
    i = close + 2;
    const key = call.match(/^\s*"([^"]+)"/);
    if (!key) continue;
    const pages = [...call.matchAll(/"([^"]*)"/g)].map((x) => x[1]).slice(1);
    out.set(key[1], pages);
  }
  return out;
}

const ADMIN_KW = javaList('ADMIN_KEYWORDS') ?? [];
const SYSTEM_ADMIN_KW = javaList('SYSTEM_ADMIN_KEYWORDS') ?? [];
const REBUILD_KW = javaList('REBUILD_KEYWORDS') ?? [];
const CLUSTER_KW = javaList('CLUSTER_KEYWORDS') ?? [];
const AUDIT_KW = javaList('AUDIT_KEYWORDS') ?? [];
const READONLY_KW = javaList('READONLY_POST_KEYWORDS') ?? [];
const CLUSTER_SCOPE_KW = javaList('CLUSTER_SCOPE_WRITE_KEYWORDS') ?? [];
const SHARED_WRITE = javaSharedMap('SHARED_WRITE_PAGES');
const SHARED_READ = javaSharedMap('SHARED_READ_PAGES');

if (!SHARED_WRITE || SHARED_WRITE.size === 0) fail('解析 SHARED_WRITE_PAGES 失败（Java 结构变了？请同步本脚本）');
if (!SHARED_READ || SHARED_READ.size === 0) fail('解析 SHARED_READ_PAGES 失败（Java 结构变了？请同步本脚本）');
if (READONLY_KW.length === 0) fail('解析 READONLY_POST_KEYWORDS 失败');

/* ── 2. 页面契约 ─────────────────────────────────────────────────── */
const contract = JSON.parse(read(CONTRACT));
const pageKeys = new Set(contract.pages.map((p) => p.key));
const pagePrefixes = new Map(contract.pages.map((p) => [p.key, p.apiPrefixes ?? []]));

/* ── 3. 后端路径 → 真实档位 ──────────────────────────────────────── */
const matches = (uri, kw) => {
  const prefixKw = kw.endsWith('/');
  let at = uri.indexOf(kw);
  while (at >= 0) {
    const end = at + kw.length;
    const prevOk = at === 0 || uri.charAt(at - 1) === '/' || kw.charAt(0) === '/';
    const endOk = prefixKw || end === uri.length
      || ['/', '?', ';'].includes(uri.charAt(end));
    if (prevOk && endOk) return true;
    at = uri.indexOf(kw, at + 1);
  }
  return false;
};
const anyKw = (uri, list) => list.some((kw) => matches(uri, kw));

/** 期望能力档：admin > ops(rank3) > write(rank2) > undefined(只读/自助) */
function expectedCap(method, p) {
  const m = String(method).toUpperCase();
  const read = m === 'GET' || m === 'HEAD';
  if (anyKw(p, ADMIN_KW)) return 'admin';
  if (!read && anyKw(p, [...REBUILD_KW, ...CLUSTER_KW])) return 'ops';
  if (anyKw(p, AUDIT_KW) && !p.endsWith('/auth/ops-audit/mine')) return 'ops';
  if (read) return undefined;
  if (anyKw(p, READONLY_KW)) return undefined;
  return 'write';
}

/* ── 4. 前端镜像表一致性 ────────────────────────────────────────── */
const authTs = read(AUTH_TS);

function tsPageMap(constName) {
  const idx = authTs.indexOf(constName);
  if (idx < 0) return null;
  const start = authTs.indexOf('{', idx);
  const end = authTs.indexOf('\n  };', start);
  const body = authTs.slice(start, end < 0 ? authTs.length : end);
  const out = new Map();
  for (const line of body.split('\n')) {
    const m = line.match(/'([^']+)':\s*\[([^\]]*)\]/);
    if (!m) continue;
    out.set(m[1], [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  }
  return out;
}

function diffMaps(label, javaMap, tsMap) {
  if (!tsMap) { fail(`${label}: 前端未找到镜像表`); return; }
  for (const [k, v] of javaMap) {
    const tv = tsMap.get(k);
    if (!tv) { fail(`${label}: 前端缺 "${k}"（后端 ${v.join('/')}）`); continue; }
    const a = [...new Set(v)].sort().join(',');
    const b = [...new Set(tv)].sort().join(',');
    if (a !== b) fail(`${label}: "${k}" 页集不一致 后端[${a}] 前端[${b}]`);
  }
  for (const k of tsMap.keys()) {
    if (!javaMap.has(k)) fail(`${label}: 前端多出 "${k}"（后端未登记=前端承诺后端必 403）`);
  }
}

diffMaps('SHARED_WRITE_PAGES', SHARED_WRITE, tsPageMap('SHARED_WRITE_PAGE_KEYS'));
diffMaps('SHARED_READ_PAGES', SHARED_READ, tsPageMap('SHARED_READ_PAGE_KEYS'));

/* ── 5. 扫描视图 / composables ──────────────────────────────────── */
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (f === '__tests__' || f === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(vue|ts)$/.test(f)) out.push(p);
  }
  return out;
}
const files = walk(SRC);

/* 5a. canEndpoint 档位与真实档位比对 */
const CAP_ORDER = { write: 2, ops: 3, admin: 4 };
const capRank = (c) => CAP_ORDER[c] ?? 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/canEndpoint\(\s*'([a-z]+)'\s*,\s*'([A-Z]+)'\s*,\s*(['"`])([^'"`]+)\3/g)) {
    const [, declared, method, , p] = m;
    if (!p.startsWith('/internal/es/')) continue;
    const exp = expectedCap(method, p);
    const expRank = exp ? capRank(exp) : 0;
    const declRank = capRank(declared);
    const rel = path.relative(CONSOLE, f).replace(/\\/g, '/');
    if (declRank < expRank) {
      fail(`${rel}: canEndpoint('${declared}','${method}','${p}') 过宽——后端要求 ${exp}（会亮出必 403 的按钮）`);
    }
    /* 读请求的 cap 在 canEndpoint 里不参与裁决（读只看页可见性），不做过严提示 */
  }
  /* 5b. canPage 的 pageKey 必须在契约里 */
  for (const m of s.matchAll(/canPage\(\s*'([a-z]+)'\s*,\s*'([a-z0-9-]+)'/g)) {
    if (!pageKeys.has(m[2])) {
      notes.push(`${path.relative(CONSOLE, f).replace(/\\/g, '/')}: canPage 引用了契约外的页 key "${m[2]}"`);
    }
  }
}

/* 5c. 写方法调用必须有门（文件粒度：有写调用却完全没有门 token） */
const apiTs = read(API_TS).split('\n');
const apiBlocks = new Map();
let cur = null;
for (const line of apiTs) {
  const mm = line.match(/^\s{2}([A-Za-z0-9_]+)\s*[:(]/);
  if (mm) { cur = mm[1]; apiBlocks.set(cur, ''); }
  if (cur) apiBlocks.set(cur, apiBlocks.get(cur) + line + '\n');
}
const writeMethods = new Set();
for (const [name, block] of apiBlocks) {
  if (!/\b(post|put|del)\(/.test(block)) continue;
  /* 只读 POST（DSL/SQL/analyze 等）不算写调用：后端按 VIEWER 放行，前端无门是正确的。
     api.ts 里既有 '/internal/es/index/...' 字面量，也有 `/cluster/query?${q(...)}` 模板字面量，
     两种引号都要收；关键词表本身就是 /cluster/** 形态，相对路径同样可判。 */
  const paths = [...block.matchAll(/['"`](\/[^'"`]*)['"`]/g)].map((x) => x[1].split('?')[0].split('#')[0]);
  const allReadonly = paths.length > 0 && paths.every((p) => anyKw(p, READONLY_KW)
    || /\/index\/(query|system-query)$/.test(p) || p === '/system-query' || p.endsWith('/probe'));
  if (allReadonly) continue;
  writeMethods.add(name);
}
const GATE = /canEndpoint|canPage|canWriteOn|GuardedActionButton|canOps|canWrite|canAdmin|canEmitWrite|canClusterScope|canCap|\bcan\(/;
for (const f of files.filter((x) => /[\\/](views|components)[\\/]/.test(x))) {
  const s = fs.readFileSync(f, 'utf8');
  const used = [...writeMethods].filter((w) => new RegExp(`api\\.${w}\\b`).test(s));
  if (used.length && !GATE.test(s)) {
    notes.push(`${path.relative(CONSOLE, f).replace(/\\/g, '/')}: 有写调用 [${used.join(',')}] 但文件内无任何权限门 token`);
  }
}

/* 5d. 共享表引用的页 key 必须存在 */
for (const [k, v] of [...SHARED_WRITE, ...SHARED_READ]) {
  for (const page of v) if (!pageKeys.has(page)) fail(`共享表 "${k}" 引用契约外页 key "${page}"`);
}

/* 5e. 集群级动作必须在页契约里有归属前缀（否则静态模型靠关键词、连接模型靠共享表，容易漂） */
const apiRelative = (p) => p.replace(/^\/internal\/es(\/index)?/, '');
for (const kw of CLUSTER_SCOPE_KW) {
  const owned = [...pagePrefixes].some(([, prefixes]) => prefixes.some((pre) => {
    const rel = apiRelative(pre);
    return rel.endsWith('/') ? kw.startsWith(rel) : (kw === rel || kw.startsWith(rel + '/'));
  }));
  if (!owned) notes.push(`集群级动作 "${kw}" 没有页面前缀归属（仅靠关键词 + 共享表裁决，请确认是有意）`);
}

/* 5f. 回放通道不得直调执行函数（1124）：`if (runIt) xxx()` 的载荷来自一次性 carry/历史，
   可能是上一账号/旧 target 的现场——必须走「身份已落地 + 目标可读」的自动门包装
   （约定命名 `xxxAuto()`），否则探测窗口里会把旧请求先发出去（只读也会串结果到新账号界面）。
   命名约定可机械判定：直调执行体与门控包装必须可区分，否则规则会退化成人工检查。 */
const AUTO_WRAPPER = /^[A-Za-z_$][\w$]*Auto$/;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const rel = path.relative(CONSOLE, f).replace(/\\/g, '/');
  for (const m of s.matchAll(/if \(runIt\)\s*([A-Za-z_$][\w$]*)\(\)/g)) {
    if (AUTO_WRAPPER.test(m[1])) continue;
    fail(`${rel}: 回放通道 if (runIt) ${m[1]}() 直调执行函数——须改走 xxxAuto()（身份/读页门）`);
  }
}

/* 5g. DevTools 跨页 carry 必须带入口门（1124）：写 `esquerystudio.devtools.open` 的页面
   （含 `run: true` 自动执行档）必须持有 DevTools/REST 写能力判定，否则只读身份会被送进
   一个「点了只会被拒」的页面。DevToolsView 自身的二次拦截是最后一道，不是唯一一道。
   收藏回放这类通用件用 `canOpen(path)` 注入页面门（/devtools 可见性=conn:devtools|w:rest，
   与 DevTools 入口能力同源），同样算已门控。
   ★ 门必须出现在**写入点附近**（1500 字符窗口），并且必须是**使用**而不是定义：
   只匹配 `canDevtools` 会被 `const canDevtools = computed(...)` 定义行本身满足——
   删掉调用处的 `if (!canDevtools.value)` 仍然绿（实测踩过两次）。定义形态是
   `canDevtools =`、使用形态是 `canDevtools.value` / `canDevtools(`，两者可区分。
   注入式页面门（收藏回放的 `canOpen(dest)` 回调）在调用点可能离写入点很远，
   单独按「**调用**形态」放行：声明是 `canOpen?: (`，调用是 `canOpen(`。
   页面读门 `canReadPage('devtools', target)`（1132：TemplatesView 的「在 DevTools 打开」）
   与 canDevtools 同一裁决源，也必须按**使用**形态认；只认字面量 'devtools' 这第一实参，
   不把任何 canReadPage 调用都当门（否则别的页面读门也能蒙混过关）。 */
const DEVTOOLS_GATE = /canDevtools\s*(?:\.value|\(|&&|\|\|)/;
const DEVTOOLS_PAGE_GATE = /canReadPage\s*\(\s*['"]devtools['"]/;
const CARRY_KEY = 'esquerystudio.devtools.open';
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const rel = path.relative(CONSOLE, f).replace(/\\/g, '/');
  if (f.includes('DevToolsView.vue')) continue; /* 消费方，不是来源 */
  let at = s.indexOf(CARRY_KEY);
  if (at < 0) continue;
  /* 注入门必须真的被调用（声明形态 `canOpen?: (` 不算） */
  const injectedGateCalled = /(?:^|[^\w$])canOpen\s*\(/.test(s.replace(/canOpen\?:/g, 'canOpen_:'));
  while (at >= 0) {
    const window = s.slice(Math.max(0, at - 1500), at);
    if (!DEVTOOLS_GATE.test(window) && !DEVTOOLS_PAGE_GATE.test(window) && !injectedGateCalled) {
      const line = s.slice(0, at).split('\n').length;
      fail(`${rel}:${line}: 写 ${CARRY_KEY} 前 1500 字符内没有 canDevtools 前置门，`
        + '且文件中没有实际调用注入式页面门（canOpen(...)）');
      break;
    }
    at = s.indexOf(CARRY_KEY, at + CARRY_KEY.length);
  }
}

/* ── ⑤ 视图/组件层的写调用必须带能力门 ────────────────────────────
   机器扫描（1129 审计）：任何 .vue 里出现变更型 api.* 调用，同一文件（去掉模板后的脚本区）
   必须出现至少一处能力判定。缺了就是「页面能点到、后端才拦」的缺口。
   为什么按文件而非按函数：全项目 30 个写调用文件已逐个人工核对过执行体首行都有门，
   这条规则的作用是防回潮——新增写调用时不必再靠人记得加判定。

   ⚠ 强度边界（1132 实测）：本规则只能发现「整个文件都没有门」。单删某个函数的门判不出来
   ——已注入验证：删掉 SynonymsManagerView.doReload 的首行 gate 后本条仍通过（文件里其他
   函数还有门）。按行距收紧也做不到：gate 到调用的真实距离最大 185 行（CmdPalette），任何
   能覆盖它的窗口都等于退回文件级。**别把这条当函数级保障。**
   函数级的安全网不在视图层而在 api.request() 的写硬门（main.ts 注入 canEmitWrite，
   fetch 前裁决、拒绝时零网络请求并派发 CLIENT_WRITE_DENIED）：视图层缺门只会让
   「点了才报错」而非「越权发出」。该硬门的行为覆盖见 permHarden979.spec.ts。 */
const WRITE_CALL = /api\.(cancelTask|deleteByQuery|updateByQuery|bulk|putDoc|updateDoc|updateDocument|deleteById|createIndex|deleteIndex|clusterForceMerge|putClusterSettings|updateSettings|updateIndexSettings|aliasActions|putMapping|painlessExecute|putStoredScript|deleteStoredScript|snapshotCreate|snapshotDelete|snapshotRestore|ilmStart|ilmStop|ilmMove|ilmPolicyPut|ilmPolicyDelete|rerouteRetryFailed|synonymsUpsert|analysisUpdate|reloadAnalyzers|slmExecute|putTemplate|deleteTemplate|clustersSave|clustersDelete|reindexAdvanced|devtoolsExecute|raw)\(/;
const CAP_GATE = /canEndpoint|canAdminOps|canAdmin|canReadPage|requestInScope|canWrite(?:On)?|canOps|canDevtools|canFullAlias|canApply|canRun|canValidate|canMove|canCreate|canAlias|canRebind|canWriteUsers|canForceMerge|canCreateIdx|canSettings|canMutateJob|canPullSrc|canJobOps|canDestOps|canDeleteDoc/;
let writeFiles = 0;
for (const dirName of ['views', 'components']) {
  const dir = path.join(SRC, dirName);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { continue; }
  for (const name of names) {
    if (!name.endsWith('.vue')) continue;
    const rel = dirName + '/' + name;
    const src = read(path.join(dir, name));
    const script = src.replace(/<template>[\s\S]*?<\/template>/, '');
    if (!WRITE_CALL.test(script)) continue;
    writeFiles++;
    if (!CAP_GATE.test(script)) fail(`写调用缺少能力门：${rel}（含 api 写调用，但全文无 canEndpoint/canXxx 判定）`);
  }
}

/* ── ⑥ 客户端写门必须在入口真装配 ────────────────────────────────
   `api.request` 的写门是「无权限零网络请求」的唯一保证，但它靠 main.ts 注入：
   `setApiWriteGuard(...)` 一旦被删/改名，守卫变量保持 null，**整条客户端写门静默失效**，
   而所有现有单测仍绿（测试自己调 setApiWriteGuard 装桩）。
   这是典型的「门在、线没接」，必须机械盯住。 */
const MAIN_TS = path.join(SRC, 'main.ts');
if (fs.existsSync(MAIN_TS)) {
  const mainSrc = read(MAIN_TS);
  if (!/setApiWriteGuard\s*\(/.test(mainSrc)) {
    fail('main.ts 未装配 setApiWriteGuard：客户端写门静默失效（api 层守卫为 null 时不拦任何写）');
  }
  if (!/canEmitWrite/.test(mainSrc)) {
    fail('main.ts 装配的写门未指向 auth.canEmitWrite：客户端写门判据缺失');
  }
} else {
  fail('找不到 console/src/main.ts：无法确认客户端写门已装配');
}

/* ── 输出 ───────────────────────────────────────────────────────── */
const summary = [
  `后端关键词: admin=${ADMIN_KW.length} systemAdmin=${SYSTEM_ADMIN_KW.length} rank3=${REBUILD_KW.length + CLUSTER_KW.length} readonly=${READONLY_KW.length} clusterScope=${CLUSTER_SCOPE_KW.length}`,
  `共享表: write=${SHARED_WRITE?.size ?? 0} read=${SHARED_READ?.size ?? 0}；页契约=${pageKeys.size} 页；扫描文件=${files.length}；写调用文件=${writeFiles}`,
];
if (!quiet) console.log(summary.join('\n') + '\n');

if (notes.length) {
  console.log(`提示 ${notes.length} 条：`);
  for (const n of notes) console.log('  · ' + n);
  console.log('');
}
if (problems.length) {
  console.error(`不一致 ${problems.length} 条：`);
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log('权限一致性扫描通过：前后端映射同源、能力档无过宽、页 key 无越界。');
