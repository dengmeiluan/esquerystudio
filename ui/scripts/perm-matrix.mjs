#!/usr/bin/env node
/**
 * 控制台权限矩阵集成测试（会真实发请求，只读为主）。
 *
 * 用法（凭据只走环境变量，不写进仓库）：
 *   CONSOLE_BASE=http://host:port/acme \
 *   CONSOLE_USER_X1=... CONSOLE_PASS_X1=... \
 *   CONSOLE_USER_X2=... CONSOLE_PASS_X2=... \
 *   CONSOLE_USER_X3=... CONSOLE_PASS_X3=... \
 *   node scripts/perm-matrix.mjs
 *
 * 期望（与 acme 三账号产线口径一致）：
 *   x1 授权用户：至少一个连接可写（测试环境）、至少一个连接只读（生产）；
 *                只读连接上 DevTools 数据面被拒、管理面读被拒；可写连接上数据面放行、管理面仍拒。
 *   x2 超管：连接目录可见、DevTools 管理面读放行。
 *   x3 零授权：连接目录为空、页面集为空、用户管理/全量审计 403、连接目标 403。
 *   宿主登出后：同一 token 再访问控制台必须 401。
 *
 * 退出码 0=全部符合；1=有偏差。只输出状态与计数，不打印 token。
 */
const BASE = (process.env.CONSOLE_BASE || '').replace(/\/$/, '');
const HOST_LOGIN = process.env.CONSOLE_HOST_LOGIN || '/api/auth/login';
const USERS = [
  ['x1', process.env.CONSOLE_USER_X1, process.env.CONSOLE_PASS_X1],
  ['x2', process.env.CONSOLE_USER_X2, process.env.CONSOLE_PASS_X2],
  ['x3', process.env.CONSOLE_USER_X3, process.env.CONSOLE_PASS_X3],
];

if (!BASE || USERS.some(([, u, p]) => !u || !p)) {
  console.error('缺少 CONSOLE_BASE / CONSOLE_USER_X* / CONSOLE_PASS_X*');
  process.exit(2);
}

const results = [];
const failures = [];
function record(group, name, actual, expected) {
  const ok = String(actual) === String(expected);
  results.push({ group, name, actual, expected, ok });
  if (!ok) failures.push(`${group}/${name}: expected ${expected}, got ${actual}`);
}

async function call(method, path, token, body, target) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Es-Host-Token'] = token;
  if (target) headers['X-Es-Target'] = target;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, json, text };
}

async function login(username, password) {
  const r = await call('POST', HOST_LOGIN, null, { username, password });
  const token = r.json?.data?.token;
  if (!token) throw new Error(`登录失败 ${username}: HTTP ${r.status}`);
  return token;
}

async function main() {
  const tokens = {};
  for (const [key, user, pass] of USERS) {
    tokens[key] = await login(user, pass);
    const me = await call('GET', '/internal/es/index/auth/me', tokens[key]);
    record(key, 'me.http', me.status, 200);
    record(key, 'me.username', me.json?.username, user);
    if (key === 'x3') {
      record('x3', 'grantedPages.count', (me.json?.grantedPages || []).length, 0);
    }
    if (key === 'x2') {
      record('x2', 'role', me.json?.role, 'ADMIN');
    }
  }

  const clusters = {};
  for (const key of ['x1', 'x2', 'x3']) {
    const r = await call('GET', '/internal/es/index/clusters', tokens[key]);
    clusters[key] = Array.isArray(r.json) ? r.json : [];
    record(key, 'clusters.http', r.status, 200);
  }
  record('x3', 'clusters.count', clusters.x3.length, 0);
  if (clusters.x2.length < 1) failures.push('x2 超管应至少看到一个连接');

  // x1 每个连接的写页数
  const x1Perm = {};
  for (const c of clusters.x1) {
    const id = c.id || c.connId;
    const r = await call('GET', `/internal/es/index/auth/permissions?target=${encodeURIComponent(id)}`, tokens.x1);
    const pages = (r.json?.groups || []).flatMap((g) => g.pages || []);
    x1Perm[id] = { name: c.name, read: pages.filter((p) => p.read).length, write: pages.filter((p) => p.write).length };
  }
  const writable = Object.entries(x1Perm).filter(([, v]) => v.write > 0);
  const readonly = Object.entries(x1Perm).filter(([, v]) => v.write === 0 && v.read > 0);
  record('x1', 'has-writable-conn', writable.length > 0, true);
  record('x1', 'has-readonly-conn', readonly.length > 0, true);

  // DevTools 探针：可写连接=数据面读 200 / 管理面读 403；只读连接=数据面也 403
  const probe = (token, target, payload) =>
    call('POST', '/internal/es/index/cluster/devtools/execute', token, payload, target);
  const dataRead = { method: 'GET', path: '/_cat/indices?format=json&h=index' };
  const mgmtRead = { method: 'GET', path: '/_nodes' };
  /* 写探针（安全版）：只对**只读连接**发一次 DELETE 不存在索引——
     期望 403（授权层拦住）。若授权被绕过，ES 只会回 404 index_not_found，
     不会创建/删除任何东西，产线零副作用；仍足以区分「拦住了(403)」与「放行了(404)」。
     可写连接不发写探针：成功就真写了，冒烟不该改数据。 */
  const writeProbe = {
    method: 'DELETE',
    path: '/__console_permission_probe__', /* 该索引名不存在，也永远不会被创建 */
  };
  for (const [id] of writable.slice(0, 2)) {
    const a = await probe(tokens.x1, id, dataRead);
    record('x1', `writable[${id}].dataRead`, a.status, 200);
    const b = await probe(tokens.x1, id, mgmtRead);
    record('x1', `writable[${id}].mgmtRead`, b.status, 403);
  }
  for (const [id] of readonly.slice(0, 2)) {
    const a = await probe(tokens.x1, id, dataRead);
    /* 只读=可读不可写；数据面读必须放行（此前误期待 403，会把有权限的人拦成缺陷）。 */
    record('x1', `readonly[${id}].dataRead`, a.status, 200);
    /* 只读连接上的写必须被授权层拒绝（403）。放行会得到 ES 的 404，据此可判定越权。 */
    const w = await probe(tokens.x1, id, writeProbe);
    record('x1', `readonly[${id}].writeDenied`, w.status, 403);
  }

  /* MCP 管理面：有 DevTools 页面授权（含 conn:{id}:devtools）即可查看；零授权用户 403。 */
  const mcpKeysX1 = await call('GET', '/internal/es/index/mcp/keys', tokens.x1);
  record('x1', 'mcp.keys.list', mcpKeysX1.status, 200);
  const mcpToolsX1 = mcpKeysX1.json?.availableTools;
  /* VIEWER 不可签发宿主 key；目录为空是正确结果，但列表本身必须可读（此前 403 是误拦）。 */
  record('x1', 'mcp.keys.availableTools-array', Array.isArray(mcpToolsX1), true);

  // x2 超管：挑一个健康连接（目录里可能有凭据损坏的测试连接，不能拿第一条当基准）
  let healthy = null;
  for (const c of clusters.x2) {
    const id = c.id || c.connId;
    const a = await probe(tokens.x2, id, dataRead);
    if (a.status === 200) { healthy = id; break; }
  }
  record('x2', 'healthy-conn', !!healthy, true);
  if (healthy) {
    const a = await probe(tokens.x2, healthy, mgmtRead);
    record('x2', 'mgmtRead', a.status, 200);
  }

  // x3：目标任何连接都应为 CONN_FORBIDDEN（凭据损坏的连接可能先报 400，属环境问题，
  // 但绝不能返回 200）
  const mcpKeysX3 = await call('GET', '/internal/es/index/mcp/keys', tokens.x3);
  record('x3', 'mcp.keys.list.denied', mcpKeysX3.status, 403);
  const x3Target = healthy || (clusters.x2[0] && (clusters.x2[0].id || clusters.x2[0].connId));
  if (x3Target) {
    const a = await probe(tokens.x3, x3Target, dataRead);
    record('x3', 'target-denied', a.status === 403 || a.status === 400, true);
    record('x3', 'target-not-200', a.status !== 200, true);
  }

  /* 跨身份污染：拿 x1 可见的连接 id 配 x3 的令牌——连接可见性必须只认当前身份，
     不能因为请求带了「别人用过的目标头」就放行（换号后残留目标头的真实形态）。 */
  const x1Target = writable[0] && writable[0][0];
  if (x1Target) {
    const a = await probe(tokens.x3, x1Target, dataRead);
    record('x3', 'cross-identity-target', a.status === 403 || a.status === 400, true);
  }

  /* 根级 _msearch 空头 = 不限索引（全量读）：内核必须拒绝；带索引前缀的同类请求应放行。
     只在可写连接上抽验，避免对只读连接重复证明同一件事。 */
  const msearchRoot = { method: 'POST', path: '/_msearch', body: '{}\n{}\n' };
  /* 索引名不能以下划线开头（ES 规则；守卫也会把这种首段当系统段并拒绝）。
     用「合法但必然不存在」的名字：期望不被授权层 403，真实结果是 ES 回 index_not_found。 */
  const msearchPrefixed = { method: 'POST', path: '/perm-probe-nonexistent/_msearch', body: '{}\n{}\n' };
  const wTarget = writable[0] && writable[0][0];
  if (wTarget) {
    const root = await probe(tokens.x1, wTarget, msearchRoot);
    record('x1', 'msearch.root-denied', root.status, 403);
    /* 前缀形态不带索引名时，ES 会因为索引不存在回 404——重点是不能被守卫当成 403 全拒
       （否则「有权限的人被误拦」）；403 才算失败。 */
    const pfx = await probe(tokens.x1, wTarget, msearchPrefixed);
    record('x1', 'msearch.prefix-not-denied', pfx.status !== 403, true);
  }

  // 宿主登出：acme 的 /api/auth/logout 从 Authorization 读令牌（X-Es-Host-Token
  // 只用于控制台委托），必须同时带 Bearer 才会进 Redis 黑名单。
  const logoutRes = await fetch(BASE + '/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tokens.x2, 'X-Es-Host-Token': tokens.x2 },
  });
  record('x2', 'host-logout.http', logoutRes.status, 200);
  const reuse = await call('GET', '/internal/es/index/auth/me', tokens.x2);
  record('x2', 'host-logout.reuse', reuse.status, 401);

  // 控制台登出必须让自定义委托（只实现 tokenOf、不实现 revoke）的令牌也在本实例失效。
  // 用 x3 新登录取令牌，避免依赖前面已吊销的 x2 会话。
  const x3Fresh = await login(USERS[2][1], USERS[2][2]);
  const consoleLogout = await call('POST', '/internal/es/index/auth/logout', x3Fresh);
  record('x3', 'console-logout.http', consoleLogout.status, 200);
  record('x3', 'console-logout.revoked', consoleLogout.json?.revoked, true);
  const consoleReuse = await call('GET', '/internal/es/index/auth/me', x3Fresh);
  record('x3', 'console-logout.reuse', consoleReuse.status, 401);

  // 输出
  const byGroup = {};
  for (const r of results) (byGroup[r.group] ||= []).push(r);
  for (const [g, rows] of Object.entries(byGroup)) {
    console.log(`\n[${g}]`);
    for (const r of rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name} = ${r.actual}${r.ok ? '' : ` (expect ${r.expected})`}`);
  }
  console.log(`\n合计 ${results.length} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    console.error('\n' + failures.join('\n'));
    /* 只设 exitCode 不 process.exit：fetch 的 keep-alive 套接字仍在事件循环里，
       强退在 Windows 上会触发 libuv 断言（退出码 127 而非 1），CI 读到的状态就错了。
       让事件循环自然收敛，进程按 exitCode 退出。 */
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
}

main().catch((e) => {
  console.error('矩阵执行异常:', e?.message || e);
  process.exitCode = 1;
});
