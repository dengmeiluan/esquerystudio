#!/usr/bin/env node
/*
 * 本地 stdio MCP 桥 → 单文件可执行（Windows .exe / Linux 二进制）。
 *
 * 为什么要有它：DBX 之类客户端只接受「一个可执行路径」作为 stdio 命令；
 * 要求用户先装 Node 再记住 .mjs 路径，是把部署成本转嫁给使用者。这里用
 * Node 官方 SEA（Single Executable Application）把依赖为零的桥打包进 Node 运行时，
 * 产物与 `node esquerystudio-local-mcp.mjs` 完全同一份代码、同一套 MCP 契约。
 *
 * 用法：
 *   node scripts/build-local-mcp-exe.mjs            # 当前平台
 *   node scripts/build-local-mcp-exe.mjs --all      # win-x64 / linux-x64（需可下载对应 node）
 *
 * 产物：
 *   dist/mcp/esquerystudio-mcp[.exe]
 *
 * 前置：当前 Node 必须支持 --experimental-sea-config（Node >= 20）；
 *       postject 由 npx 获取（仅在构建机需要，产物本身无任何依赖）。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectSigningConfig, signExecutable, stripEmbeddedSignature } from './lib/windows-sign.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'mcp');
const entry = join(root, 'mcp', 'esquerystudio-local-mcp.mjs');
const isWindows = process.platform === 'win32';
/* Windows 上 npx/esbuild 是 .cmd 包装脚本，spawn 不经过 shell 会直接 ENOENT。
   只有明确的 .exe/.com 才能不经 shell 直接执行。 */
const run = (command, args, options = {}) => {
  const needsShell = isWindows && !/\.(exe|com)$/i.test(command);
  return spawnSync(command, args, needsShell ? { ...options, shell: true } : options);
};

/* 直接跑 esbuild 的 JS 入口，避开 Windows .cmd + shell 的引号吞噬（--define 的值带引号）。 */
const esbuildBin = join(root, 'ui', 'node_modules', 'esbuild', 'bin', 'esbuild');

function fail(message) {
  console.error('[build-local-mcp-exe] ' + message);
  process.exit(1);
}

if (!existsSync(entry)) fail('找不到入口 ' + entry);
if (!existsSync(esbuildBin)) fail('需要 ui/node_modules 里的 esbuild：先在 ui 下 npm install');

/* 能力探测：直接看 --help 是否列出 --experimental-sea-config，不去传一个假的配置文件
   （传假配置只会得到「配置文件不存在」的报错，把「支持」误判成「不支持」）。 */
const help = spawnSync(process.execPath, ['--help'], { encoding: 'utf8' });
if (!String(help.stdout || '').includes('--experimental-sea-config')) {
  fail('当前 Node 不支持 --experimental-sea-config（需要 Node >= 20）：' + process.version);
}

const work = join(tmpdir(), 'esq-sea-' + Date.now());
mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

const bundle = join(work, 'local-mcp.cjs');
console.log('[build-local-mcp-exe] 打包入口 → CJS');
const mcpVersion = JSON.parse(readFileSync(join(root, 'mcp', 'package.json'), 'utf8')).version;
const bundled = spawnSync(process.execPath, [esbuildBin, entry, '--bundle', '--platform=node', '--format=cjs',
  '--target=node18', '--outfile=' + bundle, '--log-level=warning',
  '--define:__ESQ_MCP_VERSION__=' + JSON.stringify(mcpVersion)], { stdio: 'inherit' });
if (bundled.status !== 0) fail('esbuild 打包失败（status=' + bundled.status + '）');

const blob = join(work, 'local-mcp.blob');
const seaJson = join(work, 'sea.json');
writeFileSync(seaJson, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
}), 'utf8');
console.log('[build-local-mcp-exe] 生成 SEA blob');
execFileSync(process.execPath, ['--experimental-sea-config', seaJson], { stdio: 'inherit' });

const exeName = isWindows ? 'esquerystudio-mcp.exe' : 'esquerystudio-mcp';
const target = join(outDir, exeName);

const nodeBin = process.execPath;
copyFileSync(nodeBin, target);
console.log('[build-local-mcp-exe] 注入 blob → ' + target);

/* 签名处理：Windows 上复制的是已签名的 node.exe，注入后签名失效（postject 会警告）。
   未签名二进制仍然可运行，只是首次运行可能出现 SmartScreen 提示；企业分发应做代码签名。 */
const postjectArgs = [
  '--yes', 'postject', target, 'NODE_SEA_BLOB', blob,
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (process.platform === 'darwin') postjectArgs.push('--macho-segment-name', 'NODE_SEA');
const injected = run('npx', postjectArgs, { cwd: work, stdio: 'inherit' });
if (injected.status !== 0) fail('postject 注入失败（status=' + injected.status + '）');
/* 注入会让 node.exe 原签名失效；清掉证书目录，避免「带一个坏签名」的产物。 */
try { stripEmbeddedSignature(target); } catch (error) { fail('清理原签名失败：' + (error?.message || error)); }

/* 自检：产物必须真的能应答 MCP 握手，否则这个「可执行桥」只是个大号 Node。 */
const cfg = join(work, 'selfcheck.json');
writeFileSync(cfg, JSON.stringify({
  defaultConnection: 'selfcheck',
  connections: [{ id: 'selfcheck', name: 'selfcheck', url: 'http://127.0.0.1:9' }],
}), 'utf8');
const probe = spawnSync(target, ['--config', cfg], {
  input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-07-28' } }) + '\n',
  encoding: 'utf8',
  timeout: 60_000,
});
const firstLine = String(probe.stdout || '').split('\n').find((line) => line.trim().startsWith('{'));
if (!probe.stdout) fail('产物没有输出：' + String(probe.stderr || '').slice(0, 500));
let handshake = null;
try { handshake = JSON.parse(firstLine || '{}'); } catch { /* 落到下面的失败分支 */ }
if (!handshake?.result?.serverInfo?.name) {
  fail('产物未通过 MCP 握手自检：' + String(firstLine || probe.stderr || '').slice(0, 400));
}

/* 签名在握手之后、计算摘要之前：签名会改写 PE，摘要必须对应最终产物。 */
const signingConfig = detectSigningConfig();
let signature;
try {
  signature = isWindows ? signExecutable(target, signingConfig) : { status: 'unsigned', mode: 'unsupported' };
} catch (error) {
  fail('代码签名失败：' + (error?.message || error));
}
if (signature.status === 'signed') {
  console.log('[build-local-mcp-exe] 代码签名：Valid · ' + (signature.subject || ''));
} else if (signature.status === 'self-signed') {
  console.log('[build-local-mcp-exe] 代码签名：仅自签管线自检（不受信任，不用于发布）');
} else {
  console.log('[build-local-mcp-exe] 代码签名：未配置证书，产物保持未签名（SmartScreen 边界）');
}

const size = statSync(target).size;
const sha256 = execFileSync(process.execPath, ['-e',
  'const {createHash}=require("node:crypto");const fs=require("node:fs");'
  + 'const h=createHash("sha256");h.update(fs.readFileSync(process.argv[1]));process.stdout.write(h.digest("hex"));',
  target], { encoding: 'utf8' }).trim();
writeFileSync(join(outDir, 'esquerystudio-mcp.json'), JSON.stringify({
  name: 'esquerystudio-mcp',
  version: JSON.parse(readFileSync(join(root, 'mcp', 'package.json'), 'utf8')).version,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  file: exeName,
  bytes: size,
  sha256,
  signature,
  handshake: handshake.result.serverInfo,
  builtAt: new Date().toISOString(),
}, null, 2));

console.log('[build-local-mcp-exe] 完成：' + target + '（' + (size / 1024 / 1024).toFixed(1) + ' MB）');
console.log('[build-local-mcp-exe] MCP 自检握手通过：' + handshake.result.serverInfo.name);
/* 清理临时目录（blob 很大，不要留在 tmp 里）。 */
try { rmSync(work, { recursive: true, force: true }); } catch { /* 清理失败不影响产物 */ }