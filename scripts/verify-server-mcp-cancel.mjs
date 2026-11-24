/* 服务端 /esmcp（可配）真取消冒烟（先起 server：见 docs/mcp.md 的验证段）：
   1) 起慢 ES stub：/_reindex 只接受 wait_for_completion=false，回 node:num；
   2) 用控制面 setup/apply 把宿主控制集群指向 stub；
   3) 声明 Tasks 调 es_batch:reindex → 必须立刻回 working（不阻塞调用方）；
   4) 轮询读进度，再发 notifications/cancelled（按 X-Request-Id）
      → 必须对 ES 下发 _tasks/node:num/_cancel，任务终态 cancelled/CLIENT。
   任何一步不成立都直接失败，不做「看起来对」的放行。
   自包含：本脚本在空闲端口起自己的 server（隔离 user.home，不碰真实控制面档案），
   结束后关闭；也接受 ESQ_BASE/ESQ_TOKEN 指向已运行的实例。
   需要 apps/server/target/esquerystudio-server-*.jar（先 ./mvnw -DskipTests package）。 */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TOKEN = process.env.ESQ_TOKEN || 'smoke-secret';
let BASE = process.env.ESQ_BASE || '';
let serverProc = null;
let homeDir = null;

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

if (!BASE) {
  const jarDir = join(ROOT, 'apps', 'server', 'target');
  const jar = readdirSync(jarDir).filter((f) => /^esquerystudio-server-.*\.jar$/.test(f) && !/-sources|-javadoc/.test(f)).sort().pop();
  if (!jar) { console.error('[server-mcp-cancel] 找不到 apps/server/target 下的 server jar，请先 ./mvnw -DskipTests package'); process.exit(1); }
  const port = await freePort();
  homeDir = mkdtempSync(join(tmpdir(), 'esq-server-cancel-'));
  BASE = `http://127.0.0.1:${port}`;
  /* 隔离 user.home：控制面档案写到临时目录，绝不污染真实安装。 */
  serverProc = spawn('java', ['-Duser.home=' + homeDir, '-jar', join(jarDir, jar),
    `--server.port=${port}`, '--esquerystudio.mcp.enabled=true', `--esquerystudio.mcp.token=${TOKEN}`],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  serverProc.stdout.on('data', (d) => { log += d.toString(); });
  serverProc.stderr.on('data', (d) => { log += d.toString(); });
  const upBy = Date.now() + 180_000;
  while (Date.now() < upBy) {
    try { const r = await fetch(`${BASE}/internal/es/index/setup/status`); if (r.ok) break; } catch { /* 未就绪 */ }
    if (serverProc.exitCode !== null) { console.error('[server-mcp-cancel] server 提前退出:\n' + log.slice(-1500)); process.exit(1); }
    await new Promise((r) => setTimeout(r, 500));
  }
}
const seen = { submit: 0, poll: 0, cancel: [] };
const stub = http.createServer((req, res) => {
  /* RHLC 的 task 路径会对 id 做 URL 编码（node%3A1），stub 必须解码后再匹配。 */
  const path = decodeURIComponent(req.url);
  /* 异步任务端点：提交必须 wait_for_completion=false 且立刻回 node:num。 */
  if (path.startsWith('/_reindex')) {
    if (!path.includes('wait_for_completion=false')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { reason: 'must be async' } }));
    }
    seen.submit += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ task: 'node:1' }));
  }
  if (path.includes('/_tasks/node:1/_cancel')) {
    seen.cancel.push(req.method);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ nodes: { n: { cancelled: true } } }));
  }
  if (path.startsWith('/_tasks/node:1')) {
    seen.poll += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ task: { node: 'n', id: 1, action: 'indices:data/write/reindex',
      completed: false, status: { total: 100, created: 5, batches: 1 } } }));
  }
  if (path === '/' || path.startsWith('/?') || path.startsWith('/_cluster/health')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ version: { number: '7.10.2' }, cluster_name: 'stub',
      cluster_uuid: 'stub-uuid', tagline: 'You Know, for Search' }));
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const stubUrl = `http://127.0.0.1:${stub.address().port}`;
const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };

/* 控制集群 = 宿主 ES：先看服务端当前绑定状态。 */
const status = await (await fetch(`${BASE}/internal/es/index/setup/status`)).json();
console.log('setup/status:', JSON.stringify(status).slice(0, 200));
/* 端点默认 /esmcp（可配 /mcp 或其他合法路径）：以服务端 setup/status 为准，别再硬编码。 */
const MCP_PATH = (status.mcpPath || '/esmcp').startsWith('/') ? (status.mcpPath || '/esmcp') : `/${status.mcpPath}`;

/* 绑定宿主控制集群到 stub（若已绑定则跳过，直接用现有宿主）。 */
if (!status.bound) {
  const bound = await fetch(`${BASE}/internal/es/index/setup/apply`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: stubUrl, username: '', password: '' }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log('setup/connect:', JSON.stringify(bound).slice(0, 200));
}

const rpc = async (body, headers = {}, expectStatus) => {
  const res = await fetch(`${BASE}${MCP_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (expectStatus && res.status !== expectStatus) {
    throw new Error(`expected HTTP ${expectStatus}, got ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-07-28' } });
check('MCP initialize 握手', init?.result?.serverInfo?.name === 'ESQueryStudio', String(init?.result?.serverInfo?.name));

const tasksMeta = {
  'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } },
  'io.modelcontextprotocol/requestId': 'http-cancel-1',
};
const started = Date.now();
const created = await rpc({
  jsonrpc: '2.0', id: 2, method: 'tools/call',
  params: {
    name: 'es_batch',
    arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } } },
    _meta: tasksMeta,
  },
}, { 'X-Request-Id': 'http-cancel-1' });
const ackMs = Date.now() - started;
const createdResult = created?.result || {};
check('长 action 立刻回 working（不阻塞）', createdResult.status === 'working' && ackMs < 2000,
  `status=${createdResult.status} ackMs=${ackMs}`);
check('回执带 taskId 与取消方法提示', Boolean(createdResult.taskId) && createdResult.cancelMethod === 'tasks/cancel',
  String(createdResult.cancelMethod));

/* tasks/list：在途任务必须可被页面/客户端看到，且不带结果体。 */
const listed = await rpc({ jsonrpc: '2.0', id: 4, method: 'tasks/list', params: { limit: 10 } });
const listedRow = (listed?.result?.tasks || []).find((t) => t.taskId === createdResult.taskId);
check('tasks/list 列出在途任务且不带结果体', Boolean(listedRow) && listedRow.status === 'working'
  && listedRow.result === undefined, JSON.stringify(listedRow || null).slice(0, 160));

/* 必须走异步端点：提交 1 次、至少轮询 1 次，且没有任何阻塞等待。 */
const pollingBy = Date.now() + 5000;
while (seen.poll === 0 && Date.now() < pollingBy) await new Promise((r) => setTimeout(r, 25));
check('批量写走 ES 异步端点（wait_for_completion=false）', seen.submit === 1, `submit=${seen.submit}`);
check('用短轮询读进度而不是阻塞等待', seen.poll > 0, `poll=${seen.poll}`);

const cancelled = await rpc({
  jsonrpc: '2.0', method: 'notifications/cancelled',
  params: { requestId: 'http-cancel-1', reason: 'user aborted' },
}, { 'X-Request-Id': 'http-cancel-1' }, 202);
check('notifications/cancelled 返回 202 且无响应体', cancelled === null, String(cancelled));

const cancelBy = Date.now() + 5000;
while (seen.cancel.length === 0 && Date.now() < cancelBy) await new Promise((r) => setTimeout(r, 25));
check('取消对 ES 任务下发 _tasks/{id}/_cancel（真正停生产写入）', seen.cancel.length > 0,
  `cancelCalls=${seen.cancel.length} method=${seen.cancel[0] || '-'}`);

const after = await rpc({ jsonrpc: '2.0', id: 3, method: 'tasks/get', params: { taskId: createdResult.taskId } });
const task = after?.result || {};
check('任务终态 cancelled', task.status === 'cancelled', `status=${task.status}`);
check('取消原因 CLIENT', task.cancelReason === 'CLIENT', String(task.cancelReason));

/* ===== 未声明 Tasks 的普通客户端：同步调用 + 核心取消也必须生效 ===== */
const plainStarted = Date.now();
const plainPromise = fetch(`${BASE}${MCP_PATH}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'X-Request-Id': 'plain-sync-1' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 9, method: 'tools/call',
    params: {
      name: 'es_batch',
      arguments: { action: 'reindex', body: { source: { index: 'a' }, dest: { index: 'b' } } },
      _meta: { 'io.modelcontextprotocol/requestId': 'plain-sync-1' },
    },
  }),
}).then((r) => r.json());
await new Promise((r) => setTimeout(r, 300));
await rpc({ jsonrpc: '2.0', method: 'notifications/cancelled',
  params: { requestId: 'plain-sync-1' } }, { 'X-Request-Id': 'plain-sync-1' }, 202);
const plain = await plainPromise;
const plainMs = Date.now() - plainStarted;
check('普通客户端同步调用可被取消并即时返回',
  plain?.result?.structuredContent?.cancelled === true && plainMs < 5000,
  `cancelled=${plain?.result?.structuredContent?.cancelled} ms=${plainMs}`);

stub.close();
if (serverProc) {
  serverProc.kill();
  if (homeDir) { try { rmSync(homeDir, { recursive: true, force: true }); } catch { /* Windows 句柄未释放时留给系统清理 */ } }
}
if (fails.length) { console.error('\n[server-mcp-cancel] ' + fails.length + ' 项失败'); process.exit(1); }
console.log('\n[server-mcp-cancel] OK — 立即回执 / 核心取消 / 真断连 / 普通客户端取消 / 终态一致');