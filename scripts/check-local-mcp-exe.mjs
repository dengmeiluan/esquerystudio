#!/usr/bin/env node
/*
 * 本地 stdio MCP 的「单文件可执行」门禁。
 *
 * 为什么需要它：文档里写「支持 Windows .exe」很容易，用户拿到的却可能是一个
 * 需要 Node 才能跑的壳。这个门禁只认三件事实：
 *   1) 构建脚本真的存在且走 Node SEA（不是文档口头承诺）；
 *   2) 面板配置生成器真的会输出「只有一个可执行路径」的 stdio 配置；
 *   3) 产物若存在，必须是真可执行且 MCP 握手成功（有 self-check 元数据）。
 *
 * 用法：node scripts/check-local-mcp-exe.mjs
 * 产物缺失时只校验 1+2（源码契约），产物存在时额外校验 3（真实二进制）。
 */
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { signatureInfo } from './lib/windows-sign.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name + (detail ? ': ' + detail : ''));
};

const buildScript = join(root, 'scripts', 'build-local-mcp-exe.mjs');
check('构建脚本存在', existsSync(buildScript));
const build = existsSync(buildScript) ? readFileSync(buildScript, 'utf8') : '';
check('使用 Node SEA', /--experimental-sea-config/.test(build));
check('注入 NODE_SEA_BLOB', /NODE_SEA_BLOB/.test(build) && /postject/.test(build));
check('产物自带 MCP 握手自检', /initialize/.test(build) && /serverInfo/.test(build));
check('构建期接入代码签名', /signExecutable/.test(build) && /detectSigningConfig/.test(build));

const panel = readFileSync(join(root, 'ui', 'src', 'components', 'McpPanel.vue'), 'utf8');
check('面板提供单文件 exe 客户端', /id:\s*'local-exe'/.test(panel));
check('exe 配置只有一个可执行路径', /localDialectConfig\(onboardingClient\.value, command, commandPosix, args\)/.test(panel)
  && /esquerystudio-mcp\.exe/.test(panel));
check('exe 复用客户端方言（品牌 + exe 开关）', /onboardingExe/.test(panel)
  && /if \(id === 'codex'\)/.test(panel) && /if \(id === 'continue'\)/.test(panel));
check('exe 安装命令指向构建脚本', /build-local-mcp-exe\.mjs/.test(panel));

const docs = join(root, 'docs', 'mcp.md');
const docText = existsSync(docs) ? readFileSync(docs, 'utf8') : '';
check('文档说明 exe 形态与构建方式', /单文件|\.exe/.test(docText) && /build-local-mcp-exe/.test(docText));
check('文档说明代码签名接入', /WINDOWS_SIGN_PFX_BASE64|ESQ_WIN_SIGN_PFX/.test(docText) && /signtool|Verify/.test(docText));

const cli = readFileSync(join(root, 'mcp', 'esquerystudio-mcp-cli.mjs'), 'utf8');
check('CLI 支持 --exe 单文件形态', /has\('--exe'\)/.test(cli) && /esquerystudio-mcp\.exe/.test(cli));

const meta = join(root, 'dist', 'mcp', 'esquerystudio-mcp.json');
const exeName = process.platform === 'win32' ? 'esquerystudio-mcp.exe' : 'esquerystudio-mcp';
const exe = join(root, 'dist', 'mcp', exeName);
if (existsSync(exe)) {
  const info = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : {};
  check('产物非空', statSync(exe).size > 10 * 1024 * 1024, String(statSync(exe).size));
  check('元数据记录握手信息', Boolean(info.handshake?.name), JSON.stringify(info.handshake || null));
  check('元数据带 SHA-256', /^[0-9a-f]{64}$/.test(String(info.sha256 || '')));
  check('元数据记录签名状态', Boolean(info.signature?.status), JSON.stringify(info.signature || null));
  const sig = info.signature || {};
  if (sig.status === 'signed') {
    const live = signatureInfo(exe);
    check('受信任签名可验证', live.status === 'Valid', live.status + ' ' + (live.message || ''));
    check('签名含可信时间戳', Boolean(live.timestamped), String(live.timestamped));
    check('签名主体与元数据一致', Boolean(live.subject) && live.subject === sig.subject, live.subject || '');
    check('签名指纹与元数据一致', Boolean(live.thumbprint) && live.thumbprint === sig.thumbprint, live.thumbprint || '');
  } else if (sig.status === 'self-signed') {
    const live = signatureInfo(exe);
    check('自签产物确实带签名', live.status !== 'NotSigned', live.status + ' ' + (live.message || ''));
  } else {
    check('未配置证书时不冒充已签名', sig.status === 'unsigned');
    if (String(process.env.ESQ_REQUIRE_SIGNED || '').toLowerCase() === 'true' || process.env.ESQ_REQUIRE_SIGNED === '1') {
      check('发布要求受信任签名', false, 'ESQ_REQUIRE_SIGNED 已开启但产物未签名');
    }
  }
  /* 真跑一次：给一份临时配置（无需真实集群），只发 initialize 读第一行。 */
  const cfg = join(root, 'dist', 'mcp', '.gate-selfcheck.json');
  writeFileSync(cfg, JSON.stringify({
    defaultConnection: 'gate',
    connections: [{ id: 'gate', name: 'gate', url: 'http://127.0.0.1:9' }],
  }), 'utf8');
  try {
    const run = spawnSync(exe, ['--config', cfg], {
      input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-07-28' } }) + '\n',
      encoding: 'utf8', timeout: 60_000,
    });
    const line = String(run.stdout || '').split('\n').find((row) => row.trim().startsWith('{'));
    let handshake = null;
    try { handshake = JSON.parse(line || '{}'); } catch { /* 落到失败分支 */ }
    check('产物真能完成 MCP 握手', Boolean(handshake?.result?.serverInfo?.name),
      String(line || run.stderr || '').slice(0, 200));
    const vendor = String(handshake?.result?.serverInfo?.name || '');
    check('握手身份是 ESQueryStudio', vendor.includes('ESQueryStudio'), vendor);
  /* --version 必须可用且带版本：客户端/doctor 靠它识别这条 stdio 命令。 */
  const ver = spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 60_000 });
  const verText = String(ver.stdout || '').trim();
  check('产物 --version 可识别（含版本号）', ver.status === 0 && /ESQueryStudio Local MCP \d+\.\d+\.\d+/.test(verText), verText.slice(0, 120));
  } finally {
    rmSync(cfg, { force: true });
  }
} else {
  checks.push({ name: '产物二进制（跳过：未构建）', ok: true, detail: '运行 node scripts/build-local-mcp-exe.mjs 后可校验二进制' });
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  — ' + c.detail : ''}`);
if (failures.length) {
  console.error(`\n[check-local-mcp-exe] ${failures.length} 项失败`);
  process.exit(1);
}
console.log(`\n[check-local-mcp-exe] ${checks.length} 项通过`);