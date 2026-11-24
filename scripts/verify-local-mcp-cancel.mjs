/* 真取消冒烟：起一个「慢 ES」stub，让 reindex 挂住，再发 tasks/cancel，验证
   (1) 调用立刻回 working，(2) 取消后 stub 上的连接被断开，(3) 任务终态是 cancelled。 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const socketClosed = { at: 0, count: 0 };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/_reindex')) {
    /* 永远不回：模拟一次跑很久的 reindex。 */
    req.on('close', () => { socketClosed.count += 1; socketClosed.at = Date.now(); });
    req.on('aborted', () => { socketClosed.count += 1; socketClosed.at = Date.now(); });
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ version: { number: '7.10.2' }, cluster_name: 'stub' }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const dir = mkdtempSync(join(tmpdir(), 'esq-cancel-'));
const cfg = join(dir, 'mcp.json');
writeFileSync(cfg, JSON.stringify({
  defaultConnection: 'x',
  connections: [{ id: 'x', name: 'Stub', url: `http://127.0.0.1:${port}` }],
}));

const child = spawn(process.execPath, ['mcp/esquerystudio-local-mcp.mjs', '--config', cfg, '--allow-write'],
  {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      ESQ_MCP_TASKS_FILE: join(dir, 'tasks.json'),
      ESQ_MCP_JOBS_FILE: join(dir, 'jobs.json'),
      ESQ_MCP_PLANS_FILE: join(dir, 'plans.json'),
    },
  });
let buf = '';
const lines = [];
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) lines.push(JSON.parse(line));
  }
});
const send = (value) => child.stdin.write(JSON.stringify(value) + '\n');
const waitFor = async (predicate, label, ms = 5000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const hit = lines.find(predicate);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timeout waiting: ' + label);
};

const tasksExt = { 'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/tasks': {} } } };
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-07-28' } });
await waitFor((l) => l.id === 1, 'initialize');

const startedAt = Date.now();
send({
  jsonrpc: '2.0', id: 2, method: 'tools/call',
  params: {
    name: 'es_batch',
    arguments: { action: 'reindex', body: { source: { index: 'src' }, dest: { index: 'dst' } } },
    _meta: { ...tasksExt, 'io.modelcontextprotocol/requestId': 'cancel-smoke-1' },
  },
});
const created = await waitFor((l) => l.id === 2, 'tools/call');
const ackMs = Date.now() - startedAt;
if (created.result?.resultType !== 'task' || created.result?.status !== 'working') {
  throw new Error('expected working task, got ' + JSON.stringify(created.result));
}
if (ackMs > 1500) throw new Error(`tools/call blocked for ${ackMs}ms; should return immediately`);

/* 等 stub 真收到那条挂住的请求，确保取消打中的是「在途连接」。 */
const untilConnected = Date.now() + 3000;
while (socketClosed.count === 0 && Date.now() < untilConnected) await new Promise((r) => setTimeout(r, 20));

send({ jsonrpc: '2.0', id: 3, method: 'tasks/cancel', params: { taskId: created.result.taskId } });
const cancelled = await waitFor((l) => l.id === 3, 'tasks/cancel');
if (cancelled.result?.status !== 'cancelled') {
  throw new Error('expected cancelled, got ' + JSON.stringify(cancelled.result));
}
if (cancelled.result?.cancelReason !== 'CLIENT') {
  throw new Error('expected CLIENT reason, got ' + cancelled.result?.cancelReason);
}

const untilAborted = Date.now() + 3000;
while (socketClosed.count === 0 && Date.now() < untilAborted) await new Promise((r) => setTimeout(r, 20));
if (socketClosed.count === 0) throw new Error('cancel never reached the HTTP connection (socket stayed open)');

/* 取消后同连接仍必须可用：新请求不能被上一轮的 abort 连坐。 */
send({ jsonrpc: '2.0', id: 4, method: 'ping' });
const ping = await waitFor((l) => l.id === 4, 'ping after cancel');
if (!ping.result) throw new Error('ping failed after cancel: ' + JSON.stringify(ping));

console.log(JSON.stringify({
  ok: true, ackMs, socketSocketsClosed: socketClosed.count,
  taskStatus: cancelled.result.status, cancelReason: cancelled.result.cancelReason,
}));
child.stdin.end();
child.kill();
server.close();
process.exit(0);