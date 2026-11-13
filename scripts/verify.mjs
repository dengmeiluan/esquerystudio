#!/usr/bin/env node
/* 全量验证并行编排：把互不依赖的门禁放到同一时间窗口跑。
 *
 * 依赖关系（不能打乱）：
 *   build ──┬─> backend（antrun 校验 static/esquerystudio/index.html）
 *           ├─> frontend（bundleBudget436 读构建产物）
 *           └─> server（install 后跑独立应用冒烟）
 *   typecheck / perm:scan 与 build 同时起跑。
 *
 * 后端与 server 都会写 target/，必须串行；server 排在 backend 之后。
 * 其余 lane 并行，总时长由前端全量（分片）决定。
 *
 * 用法：
 *   node scripts/verify.mjs                 # 后端 4 fork + 前端 8 分片 + 构建/typecheck/权限扫描
 *   node scripts/verify.mjs --server        # 追加 server 构建与冒烟
 *   node scripts/verify.mjs --serial        # 全部走串行基准（排障用）
 *   node scripts/verify.mjs --online        # Maven 不强制离线
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const consoleDir = join(root, 'ui');
const outDir = join(root, '.tmp', 'verify');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const mvnw = join(root, isWin ? 'mvnw.cmd' : 'mvnw');

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  printHelp();
  process.exit(0);
}

const cores = typeof availableParallelism === 'function' ? availableParallelism() : 4;
const backendForks = opts.backendForks || Math.min(4, Math.max(1, Math.floor(cores / 2)));
const frontendShards = opts.shards || Number(process.env.VITEST_SHARDS) || Math.min(8, Math.max(2, Math.ceil(cores / 3)));
const results = [];
const activeChildren = new Set();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const child of activeChildren) {
      if (isWin && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else child.kill(sig);
    }
    process.exit(130);
  });
}

main().catch((err) => {
  console.error('[verify] 编排器异常:', err);
  process.exit(1);
});

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  console.log(`[verify] ${cores} 核 | 后端 ${opts.serial ? '串行' : `${backendForks} forks`} | 前端 ${opts.serial ? '串行' : `${frontendShards} 分片`}`);
  const manifest = [{ name: 'mode', detail: opts.serial ? 'serial' : `backendForks=${backendForks}, frontendShards=${frontendShards}` }];

  const early = [];
  if (!opts.noDocs) {
    early.push(runLane('docs-links', { cmd: process.execPath, args: ['scripts/check-doc-links.mjs'], cwd: root }));
    early.push(runLane('browser-parity', { cmd: process.execPath, args: ['scripts/check-browser-parity.mjs'], cwd: root }));
  }
  if (!opts.noTypecheck) early.push(runLane('typecheck', npmCmd(['run', 'typecheck'])));
  if (!opts.noPermScan) early.push(runLane('perm-scan', npmCmd(['run', 'perm:scan'])));
  if (!opts.noBuild) early.push(runLane('build', npmCmd(['run', 'build'])));
  /* build 与 typecheck 都完成才启动测试：把 typecheck 叠到 8 分片挂载用例上，
     在共享机器上会放大大用例慢时钟（实测诱发 sweep524 假红）。CI 已把
     typecheck 拆成独立 job，真并行留给 CI；本地优先确定性。 */
  const earlyResults = await Promise.all(early);
  results.push(...earlyResults);

  const build = earlyResults.find((r) => r.name === 'build');
  if (build && !build.ok) {
    console.error('[verify] build 失败，后端/前端/server 不再启动');
    manifest.push(...results);
    finish(started, manifest);
    process.exitCode = 1;
    return;
  }

  const later = [];
  if (!opts.noBackend) later.push(runLane('backend', mvnTestArgs()));
  if (!opts.noFrontend) later.push(runLane('frontend', npmCmd(opts.serial ? ['run', 'test:serial'] : ['test'])));
  if (opts.server) {
    later.push((async () => {
      if (!opts.noBackend) {
        const backend = await later[0];
        if (!backend || !backend.ok) {
          console.error('[verify] backend 未通过，跳过 server');
          return { name: 'server', ok: false, ms: 0, skipped: true, log: '' };
        }
      }
      return runLane('server', serverArgs());
    })());
  }
  const laterResults = await Promise.all(later);
  results.push(...laterResults);
  if (!opts.noBackend && !opts.noFrontend) {
    results.push(await runLane('zero-skipped', {
      cmd: process.execPath, args: ['scripts/check-zero-skipped.mjs'], cwd: root,
    }));
  }
  manifest.push(...results);

  finish(started, manifest);
  process.exitCode = results.every((r) => r.ok || r.skipped) ? 0 : 1;
}

function runLane(name, spec) {
  if (spec.chain) {
    return runChain(name, spec.chain);
  }
  return runProcess(name, spec.cmd, spec.args, spec.env || {}, true, spec.cwd);
}

async function runChain(name, chain) {
  const started = Date.now();
  console.log(`[verify] ${name} 开始（${chain.length} 步）`);
  for (const step of chain) {
    const r = await runProcess(name, step.cmd, step.args, step.env || {}, false, step.cwd);
    if (!r.ok) {
      console.error(`[verify] ${name} FAIL (${fmt(Date.now() - started)})`);
      printTail(r.log, 40);
      return { name, ok: false, ms: Date.now() - started, log: r.log, chain };
    }
  }
  const ms = Date.now() - started;
  console.log(`[verify] ${name} PASS (${fmt(ms)})`);
  return { name, ok: true, ms, log: join(outDir, `${name}.log`) };
}

function runProcess(name, cmd, args, extraEnv, announce = true, cwd = '') {
  const log = join(outDir, `${name}.log`);
  const stream = createWriteStream(log, { flags: 'a' });
  if (announce) console.log(`[verify] ${name} 开始`);
  const started = Date.now();
  const workdir = cwd || (name === 'backend' || name === 'server' ? root : consoleDir);
  return new Promise((resolveRun) => {
    const child = spawnCommand(cmd, args, {
      cwd: workdir,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    activeChildren.add(child);
    child.stdout.pipe(stream, { end: false });
    child.stderr.pipe(stream, { end: false });
    let settled = false;
    const done = (code, signal, error) => {
      if (settled) return;
      settled = true;
      activeChildren.delete(child);
      stream.end();
      const ms = Date.now() - started;
      const ok = code === 0;
      if (announce) {
        if (ok) console.log(`[verify] ${name} PASS (${fmt(ms)})`);
        else console.error(`[verify] ${name} FAIL (${fmt(ms)})`);
      }
      resolveRun({ name, ok, ms, log, code, signal, error: error ? String(error) : undefined });
    };
    child.on('close', (code, signal) => done(code, signal));
    child.on('error', (err) => done(1, null, err));
  });
}

function mvnTestArgs() {
  const args = ['-B'];
  if (!opts.online) args.push('-o');
  args.push('test', '-Dconsole.build.skip=true');
  if (!opts.serial) args.push(`-DforkCount=${backendForks}`);
  return { cmd: mvnw, args };
}

function serverArgs() {
  const install = ['-B', 'install', '-DskipTests', '-Dconsole.build.skip=true'];
  if (!opts.online) install.unshift('-o');
  const test = ['-B', 'test'];
  if (!opts.online) test.unshift('-o');
  return {
    chain: [
      { cmd: mvnw, args: install },
      { cmd: mvnw, args: test, cwd: join(root, 'apps/server') },
    ],
  };
}

function npmCmd(args) {
  const env = {};
  if (args[0] === 'test' && !opts.serial) env.VITEST_SHARDS = String(frontendShards);
  return { cmd: npm, args, env };
}

function finish(started, manifest) {
  const total = Date.now() - started;
  console.log('\n[verify] 汇总');
  for (const r of results) {
    console.log(`  ${String(r.name).padEnd(12)} ${r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'}  ${fmt(r.ms)}  ${r.log ? rel(r.log) : ''}`);
  }
  const failed = results.filter((r) => !r.ok && !r.skipped);
  console.log(`[verify] 总耗时 ${fmt(total)}${failed.length ? `，${failed.length} 个 lane 失败` : '，全绿'}`);
  for (const f of failed) {
    console.error(`\n--- ${f.name} 失败日志尾部 (${rel(f.log)}) ---`);
    printTail(f.log, 40);
  }
  try {
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
      at: new Date().toISOString(),
      totalMs: total,
      manifest,
      results: results.map((r) => ({ name: r.name, ok: r.ok, skipped: !!r.skipped, ms: r.ms, log: r.log ? rel(r.log) : null, code: r.code ?? null })),
    }, null, 2));
  } catch {
    /* ignore */
  }
}

function printTail(log, lines) {
  try {
    const all = readFileSync(log, 'utf8').trimEnd().split('\n');
    console.error(all.slice(-lines).join('\n'));
  } catch {
    /* ignore */
  }
}

function spawnCommand(cmd, args, options) {
  if (!isWin) return spawn(cmd, args, { ...options, shell: false });
  /* Windows 的 npm.cmd/mvnw.cmd 需要 cmd 解释器；显式走 cmd.exe /c，
     不用 shell:true（Node DEP0190：args 不转义只拼接）。参数均为内部常量/路径，
     此处仍按空格/引号做最小转义。 */
  const line = [cmd, ...args].map(quoteWin).join(' ');
  return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', line], { ...options, shell: false });
}

function quoteWin(value) {
  const s = String(value);
  return /[\s"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmt(ms) {
  if (!ms) return '0s';
  return ms >= 60000 ? `${(ms / 60000).toFixed(1)}min` : `${(ms / 1000).toFixed(0)}s`;
}

function rel(file) {
  return relative(root, file).replace(/\\/g, '/');
}

function parseArgs(argv) {
  const out = {
    serial: false, server: false, online: false, help: false,
    noBuild: false, noBackend: false, noFrontend: false, noTypecheck: false, noPermScan: false, noDocs: false,
    shards: 0, backendForks: 0,
  };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--serial') out.serial = true;
    else if (arg === '--server') out.server = true;
    else if (arg === '--standalone') out.server = true;
    else if (arg === '--online') out.online = true;
    else if (arg === '--no-build') out.noBuild = true;
    else if (arg === '--no-backend') out.noBackend = true;
    else if (arg === '--no-frontend') out.noFrontend = true;
    else if (arg === '--no-typecheck') out.noTypecheck = true;
    else if (arg === '--no-perm-scan') out.noPermScan = true;
    else if (arg === '--no-docs') out.noDocs = true;
    else if (arg.startsWith('--shards=')) out.shards = Number(arg.slice('--shards='.length));
    else if (arg.startsWith('--backend-forks=')) out.backendForks = Number(arg.slice('--backend-forks='.length));
    else {
      console.error(`[verify] 未知参数 ${arg}`);
      out.help = true;
    }
  }
  return out;
}

function printHelp() {
  console.log(`用法: node scripts/verify.mjs [选项]

  --server              追加 server 构建与冒烟测试（排在 backend 之后）
  --serial              后端不分 fork、前端串行全量
  --online              Maven 不强制离线（默认 -o）
  --shards=N            前端分片数（默认按核数，最多 8）
  --backend-forks=N     后端 Surefire fork 数（默认最多 4）
  --no-build            跳过 ui 构建（要求产物已存在）
  --no-backend          跳过后端
  --no-frontend         跳过前端全量
  --no-typecheck        跳过 vue-tsc
  --no-perm-scan        跳过权限一致性扫描
  --no-docs             跳过文档相对链接检查
  -h, --help            显示本帮助

日志与汇总: .tmp/verify/`);
}
