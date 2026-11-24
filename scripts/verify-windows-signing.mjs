#!/usr/bin/env node
/* 代码签名管线自检：用临时自签名证书签一份产物副本并验签。
 * 它证明 signtool、证书生成、签名与签名读取链路可用；自签名不受信任，只用于自检。 */
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signExecutable, signatureInfo } from './lib/windows-sign.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exe = join(root, 'dist', 'mcp', process.platform === 'win32' ? 'esquerystudio-mcp.exe' : 'esquerystudio-mcp');

if (process.platform !== 'win32') {
  console.log('[verify-windows-signing] SKIP — 仅 Windows 需要 Authenticode 签名');
  process.exit(0);
}
if (!existsSync(exe)) {
  console.error('[verify-windows-signing] 缺少产物，先运行 node scripts/build-local-mcp-exe.mjs');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'esq-sign-check-'));
const copy = join(work, 'signed-copy.exe');
try {
  copyFileSync(exe, copy);
  const sig = signExecutable(copy, { mode: 'self-signed' });
  const live = signatureInfo(copy);
  if (sig.status !== 'self-signed') throw new Error('期望自签状态 self-signed，实际 ' + sig.status);
  if (!sig.subject || !sig.subject.includes('ESQueryStudio')) throw new Error('签名主体缺失：' + sig.subject);
  if (live.status === 'NotSigned') throw new Error('验签仍为 NotSigned');
  if (!sig.verified && live.status === 'Valid') throw new Error('自签不应被判为受信任');
  console.log('[verify-windows-signing] OK — ' + JSON.stringify({
    signedStatus: sig.status,
    trustStatus: live.status,
    subject: sig.subject,
    thumbprint: sig.thumbprint,
    timestamped: sig.timestamped,
  }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
