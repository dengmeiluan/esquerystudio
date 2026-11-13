#!/usr/bin/env node
/* 前端全量并发 runner：按文件把 spec 切成 N 份，各起一个 vitest 进程并行跑。
 *
 * 背景：vitest.config.ts 里 fileParallelism:false 是 242 批的稳定性决定
 * （同进程多 worker 会让 naive-ui 挂载用例内存/CPU 放大而超时）。本 runner
 * 不改这个决定：每个分片进程内仍串行，只把「进程数」提上去。
 *
 * 并发慢时钟下挂载用例实测 6~14s，因此分片跑使用 vitest.parallel.config.ts
 * （20s 超时）。仍失败的文件会在所有分片退出后串行复验一次——此时机器已空，
 * 用原始 5s 超时的 vitest.config.ts 跑；复验通过 = 并发慢导致的伪失败，
 * 会在汇总里如实标注，不是静默放行。
 *
 * 用法：
 *   node scripts/test-parallel.mjs                 # 自动分片（28 核 → 8）
 *   VITEST_SHARDS=12 npm test                      # 指定分片数
 *   node scripts/test-parallel.mjs --shards=4
 *   node scripts/test-parallel.mjs --serial        # 走原始串行全量
 *   node scripts/test-parallel.mjs src/a.spec.ts   # 定向文件（单进程）
 *   node scripts/test-parallel.mjs --only-shard=1/8 # CI 矩阵：只跑第 1/8 片
 *   VITEST_TEST_TIMEOUT=5000 node scripts/test-parallel.mjs  # 覆盖并发超时
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const consoleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(consoleDir, '.tmp', 'vitest-parallel');
const vitestBin = join(consoleDir, 'node_modules', 'vitest', 'vitest.mjs');
const parallelConfig = join(consoleDir, 'vitest.parallel.config.ts');
const serialConfig = join(consoleDir, 'vitest.config.ts');

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  printHelp();
  process.exit(0);
}
if (!existsSync(vitestBin)) {
  console.error(`[test:parallel] 找不到 ${vitestBin}，请先在 console/ 执行 npm ci`);
  process.exit(1);
}

const activeChildren = new Set();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const child of activeChildren) {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        child.kill(sig);
      }
    }
    process.exit(130);
  });
}

main().catch((err) => {
  console.error('[test:parallel] 运行器异常:', err);
  process.exit(1);
});

async function main() {
  if (opts.serial) {
    process.exitCode = await runInherit([vitestBin, 'run', ...opts.files]);
    return;
  }

  const timeout = opts.timeout || Number(process.env.VITEST_TEST_TIMEOUT) || 20000;
  if (opts.onlyShard) {
    await runOnlyShard(opts.onlyShard, timeout);
    return;
  }

  const cores = typeof availableParallelism === 'function' ? availableParallelism() : 4;
  let shards = opts.shards || Number(process.env.VITEST_SHARDS) || Math.min(8, Math.max(2, Math.ceil(cores / 3)));
  if (!Number.isFinite(shards) || shards < 1) shards = 1;
  if (opts.files.length) shards = Math.min(shards, opts.files.length);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  console.log(`[test:parallel] ${cores} 核，${shards} 个分片，并发超时 ${timeout}ms`);
  const started = Date.now();
  let finished = 0;
  const ticker = setInterval(() => {
    if (process.stdout.isTTY) {
      console.log(`[test:parallel] 已完成 ${finished}/${shards} 个分片，耗时 ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
  }, 20000);
  ticker.unref();

  const runs = [];
  for (let i = 1; i <= shards; i++) {
    runs.push(runShard(i, shards, timeout).then((r) => {
      finished++;
      return r;
    }));
  }
  const results = await Promise.all(runs);
  clearInterval(ticker);

  const elapsed = (Date.now() - started) / 1000;
  const counts = { files: 0, tests: 0, passed: 0, failed: 0, skipped: 0 };
  const failures = [];
  const brokenShards = [];

  for (const r of results) {
    const report = readJson(r.report);
    if (!report) {
      brokenShards.push(r);
      continue;
    }
    counts.files += (report.testResults || []).length;
    counts.tests += report.numTotalTests || 0;
    counts.passed += report.numPassedTests || 0;
    counts.failed += report.numFailedTests || 0;
    counts.skipped += report.numPendingTests || 0;
    failures.push(...failuresOf(report));
  }

  printShardTable(results);

  if (brokenShards.length) {
    console.error(`\n[test:parallel] ${brokenShards.length} 个分片没有产出 JSON 报告（进程崩溃/启动失败）：`);
    for (const r of brokenShards) {
      console.error(`  shard ${r.index}/${shards} exit=${r.code ?? r.signal} log=${r.logPath}`);
      printTail(r.logPath, 30);
    }
    writeSummary({ shards, elapsed, counts, failures, revalidation: null, brokenShards: brokenShards.map((r) => r.index) });
    process.exitCode = 1;
    return;
  }

  console.log(`\n[test:parallel] ${counts.files} 个文件 / ${counts.tests} 例（通过 ${counts.passed}，跳过 ${counts.skipped}，失败 ${counts.failed}），耗时 ${elapsed.toFixed(1)}s`);

  if (!failures.length) {
    console.log('[test:parallel] 全绿');
    writeSummary({ shards, elapsed, counts, failures: [], revalidation: null, brokenShards: [] });
    return;
  }

  if (opts.noRevalidate) {
    reportFailures(failures, 'error');
    console.error(`[test:parallel] 共 ${uniqueFiles(failures).length} 个失败文件（--no-revalidate，未做串行复验）`);
    writeSummary({ shards, elapsed, counts, failures, revalidation: null, brokenShards: [] });
    process.exitCode = 1;
    return;
  }

  const files = uniqueFiles(failures);
  console.log(`\n[test:parallel] ${failures.length} 例失败，${files.length} 个文件；分片全部退出后用串行基准复验...`);
  for (const f of files) console.log(`  复验: ${rel(f)}`);

  const revalidation = await revalidate(files);
  const real = revalidation.failures;
  if (!real.length && revalidation.code === 0) {
    console.log(`[test:parallel] 串行复验通过（${revalidation.elapsed.toFixed(1)}s）——上述失败仅由并发慢时钟造成`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::warning::${files.length} 个 spec 在 ${shards} 分片并发下超时/抖动，串行复验已通过；详见 console/.tmp/vitest-parallel/revalidate.log`);
    }
    writeSummary({ shards, elapsed, counts, failures, revalidation, brokenShards: [] });
    return;
  }

  reportFailures(real.length ? real : [{ file: '<revalidation>', name: 'revalidation', messages: [`exit=${revalidation.code}`] }], 'error');
  console.error(`[test:parallel] 串行复验仍失败（${revalidation.elapsed.toFixed(1)}s），判定为真实失败`);
  writeSummary({ shards, elapsed, counts, failures, revalidation, brokenShards: [] });
  process.exitCode = 1;
}

function runShard(index, count, timeout) {
  const report = join(outDir, `shard-${index}.json`);
  const logPath = join(outDir, `shard-${index}.log`);
  const args = [
    vitestBin, 'run',
    '--config', parallelConfig,
    `--shard=${index}/${count}`,
    '--reporter=dot',
    '--reporter=json',
    `--outputFile=${report}`,
    ...opts.files,
  ];
  return runChild(args, logPath, {
    VITEST_TEST_TIMEOUT: String(timeout),
    VITEST_SHARD_INDEX: String(index),
    VITEST_SHARD_COUNT: String(count),
  }).then((r) => ({ ...r, index }));
}

async function runOnlyShard(specText, timeout) {
  const matched = /^(\d+)\/(\d+)$/.exec(String(specText));
  if (!matched) {
    console.error(`[test:parallel] --only-shard 需要 I/N 形态，收到 "${specText}"`);
    process.exitCode = 1;
    return;
  }
  const index = Number(matched[1]);
  const count = Number(matched[2]);
  if (index < 1 || count < 1 || index > count) {
    console.error(`[test:parallel] --only-shard=${specText} 不合法（要求 1 <= I <= N）`);
    process.exitCode = 1;
    return;
  }
  if (opts.files.length && opts.files.length < count) {
    console.error(`[test:parallel] 定向文件数 ${opts.files.length} 小于分片数 ${count}，无法分片`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const prefix = `only-${index}-of-${count}`;
  console.log(`[test:parallel] 单分片 ${index}/${count}，并发超时 ${timeout}ms`);
  const started = Date.now();
  const r = await runChild(
    [
      vitestBin, 'run',
      '--config', parallelConfig,
      `--shard=${index}/${count}`,
      '--reporter=dot',
      '--reporter=json',
      `--outputFile=${join(outDir, `${prefix}.json`)}`,
      ...opts.files,
    ],
    join(outDir, `${prefix}.log`),
    {
      VITEST_TEST_TIMEOUT: String(timeout),
      VITEST_SHARD_INDEX: String(index),
      VITEST_SHARD_COUNT: String(count),
    },
  );
  const report = readJson(r.report);
  if (!report) {
    console.error(`[test:parallel] 分片 ${index}/${count} 没有产出 JSON 报告（进程崩溃/启动失败），exit=${r.code ?? r.signal}`);
    printTail(r.logPath, 40);
    writeSummary({ shard: index, shardCount: count, elapsed: (Date.now() - started) / 1000, counts: {}, failures: [], revalidation: null, brokenShards: [index] }, `${prefix}-summary.json`);
    process.exitCode = 1;
    return;
  }

  const failures = failuresOf(report);
  const counts = {
    files: (report.testResults || []).length,
    tests: report.numTotalTests || 0,
    passed: report.numPassedTests || 0,
    failed: Math.max(report.numFailedTests || 0, failures.length),
    skipped: report.numPendingTests || 0,
  };
  const elapsed = (Date.now() - started) / 1000;
  console.log(`[test:parallel] shard ${index}/${count}: ${counts.files} 文件 / ${counts.tests} 例（通过 ${counts.passed}，跳过 ${counts.skipped}，失败 ${counts.failed}），${elapsed.toFixed(1)}s`);

  if (!failures.length) {
    console.log('[test:parallel] 分片全绿');
    writeSummary({ shard: index, shardCount: count, elapsed, counts, failures: [], revalidation: null, brokenShards: [] }, `${prefix}-summary.json`);
    return;
  }

  if (opts.noRevalidate) {
    reportFailures(failures, 'error');
    writeSummary({ shard: index, shardCount: count, elapsed, counts, failures, revalidation: null, brokenShards: [] }, `${prefix}-summary.json`);
    process.exitCode = 1;
    return;
  }

  const files = uniqueFiles(failures);
  console.log(`[test:parallel] ${failures.length} 例失败，${files.length} 个文件；本分片退出后串行复验...`);
  const revalidation = await revalidate(files, `${prefix}-revalidate`);
  const real = revalidation.failures;
  if (!real.length && revalidation.code === 0) {
    console.log(`[test:parallel] 串行复验通过（${revalidation.elapsed.toFixed(1)}s）——失败仅由并发慢时钟造成`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::warning::shard ${index}/${count}: ${files.length} 个 spec 并发超时/抖动，串行复验已通过`);
    }
    writeSummary({ shard: index, shardCount: count, elapsed, counts, failures, revalidation, brokenShards: [] }, `${prefix}-summary.json`);
    return;
  }

  reportFailures(real.length ? real : [{ file: '<revalidation>', name: 'revalidation', messages: [`exit=${revalidation.code}`] }], 'error');
  console.error(`[test:parallel] 分片 ${index}/${count} 串行复验仍失败，判定为真实失败`);
  writeSummary({ shard: index, shardCount: count, elapsed, counts, failures, revalidation, brokenShards: [] }, `${prefix}-summary.json`);
  process.exitCode = 1;
}

async function revalidate(files, prefix = 'revalidate') {
  if (!files.length) {
    return {
      code: 1,
      failures: [{ file: '<revalidation>', name: 'no-files', messages: ['没有可复验的 spec 路径'] }],
      elapsed: 0,
      logPath: '',
    };
  }
  const report = join(outDir, `${prefix}.json`);
  const logPath = join(outDir, `${prefix}.log`);
  const started = Date.now();
  const args = [
    vitestBin, 'run',
    '--config', serialConfig,
    '--reporter=dot',
    '--reporter=json',
    `--outputFile=${report}`,
    ...files,
  ];
  const r = await runChild(args, logPath, {});
  const parsed = readJson(report);
  const failures = parsed ? failuresOf(parsed) : [];
  if (!parsed && r.code === 0) {
    failures.push({ file: '<revalidation>', name: 'report', messages: ['串行复验退出码 0 但没有 JSON 报告'] });
  }
  return { ...r, failures, elapsed: (Date.now() - started) / 1000, logPath };
}

function runChild(args, logPath, extraEnv) {
  return new Promise((resolveRun) => {
    const log = createWriteStream(logPath);
    const started = Date.now();
    const child = spawn(process.execPath, args, {
      cwd: consoleDir,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    activeChildren.add(child);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let settled = false;
    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      activeChildren.delete(child);
      log.end();
      resolveRun({ code, signal, error, ms: Date.now() - started, logPath, report: reportOfArgs(args) });
    };
    child.on('close', (code, signal) => finish(code, signal));
    child.on('error', (err) => finish(1, null, err));
  });
}

function reportOfArgs(args) {
  const hit = args.find((a) => a.startsWith('--outputFile='));
  return hit ? hit.slice('--outputFile='.length) : '';
}

function failuresOf(report) {
  const out = [];
  for (const f of report.testResults || []) {
    const failed = (f.assertionResults || []).filter((a) => a.status === 'failed');
    for (const a of failed) out.push({ file: f.name, name: a.fullName || a.title || '<unnamed>', messages: a.failureMessages || [] });
    if (!failed.length && (f.status === 'failed' || (f.message && f.status !== 'passed'))) {
      out.push({ file: f.name, name: '<file>', messages: [String(f.message || 'file failed')] });
    }
  }
  return out;
}

function uniqueFiles(failures) {
  return Array.from(new Set(
    failures
      .map((f) => resolveFile(f.file))
      .filter((f) => f && !f.startsWith('<')),
  ));
}

function resolveFile(file) {
  if (!file || file.startsWith('<')) return file;
  return isAbsolute(file) ? file : resolve(consoleDir, file);
}

function reportFailures(failures, level) {
  const limit = 50;
  for (const f of failures.slice(0, limit)) {
    const msg = (f.messages[0] || '').split('\n').slice(0, 4).join(' | ');
    const line = `${rel(f.file)} :: ${f.name} :: ${msg}`;
    console.error(`FAIL ${line}`);
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::${level}::${ghEscape(line)}`);
  }
  if (failures.length > limit) console.error(`... 其余 ${failures.length - limit} 例见 console/.tmp/vitest-parallel/*.log`);
}

function printShardTable(results) {
  console.log('');
  for (const r of results) {
    const report = readJson(r.report);
    const n = report ? (report.testResults || []).length : 0;
    const t = report ? report.numTotalTests || 0 : 0;
    const ok = r.code === 0 ? 'PASS' : `FAIL(${r.code ?? r.signal})`;
    console.log(`  shard ${String(r.index).padStart(2)}/${results.length}  ${ok.padEnd(8)} ${String(n).padStart(4)} 文件 ${String(t).padStart(5)} 例 ${(r.ms / 1000).toFixed(1)}s  ${rel(r.logPath)}`);
  }
}

function printTail(logPath, lines) {
  try {
    const all = readFileSync(logPath, 'utf8').trimEnd().split('\n');
    console.error(all.slice(-lines).join('\n'));
  } catch {
    /* ignore */
  }
}

function writeSummary(summary, filename = 'summary.json') {
  try {
    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, filename);
    const payload = {
      at: new Date().toISOString(),
      cores: typeof availableParallelism === 'function' ? availableParallelism() : null,
      ...summary,
      failures: summary.failures.map((f) => ({ file: rel(f.file), name: f.name, message: (f.messages[0] || '').split('\n')[0] })),
      revalidation: summary.revalidation ? {
        code: summary.revalidation.code,
        elapsed: summary.revalidation.elapsed,
        failures: summary.revalidation.failures.map((f) => ({ file: rel(f.file), name: f.name, message: (f.messages[0] || '').split('\n')[0] })),
      } : null,
    };
    writeFileSync(path, JSON.stringify(payload, null, 2));
  } catch {
    /* summary 写失败不影响结论 */
  }
}

function rel(file) {
  if (!file || file.startsWith('<')) return file;
  const abs = isAbsolute(file) ? file : resolve(consoleDir, file);
  return relative(consoleDir, abs).replace(/\\/g, '/');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function ghEscape(s) {
  return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function runInherit(args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, { cwd: consoleDir, stdio: 'inherit', windowsHide: true });
    child.on('close', (code, signal) => resolveRun(code ?? (signal ? 1 : 0)));
    child.on('error', () => resolveRun(1));
  });
}

function parseArgs(argv) {
  const out = { shards: 0, timeout: 0, files: [], serial: false, noRevalidate: false, onlyShard: '', help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--serial') out.serial = true;
    else if (arg === '--no-revalidate') out.noRevalidate = true;
    else if (arg.startsWith('--shards=')) out.shards = Number(arg.slice('--shards='.length));
    else if (arg.startsWith('--timeout=')) out.timeout = Number(arg.slice('--timeout='.length));
    else if (arg.startsWith('--only-shard=')) out.onlyShard = arg.slice('--only-shard='.length);
    else if (arg.startsWith('--')) {
      console.error(`[test:parallel] 未知参数 ${arg}`);
      out.help = true;
    } else out.files.push(arg);
  }
  return out;
}

function printHelp() {
  console.log(`用法: node scripts/test-parallel.mjs [选项] [spec 文件...]

  --shards=N        分片数（默认按核数：min(8, max(2, ceil(cores/3)))；也可用 VITEST_SHARDS）
  --timeout=MS      分片内单测超时（默认 20000；也可用 VITEST_TEST_TIMEOUT）
  --serial          走原始串行全量（vitest.config.ts，5s 超时）
  --no-revalidate   分片失败后不做串行复验，直接判红
  --only-shard=I/N  只跑第 I/N 个分片（CI 矩阵用；失败文件在本作业内串行复验）
  -h, --help        显示本帮助

产物: console/.tmp/vitest-parallel/shard-*.log|json、revalidate.log|json、summary.json`);
}
