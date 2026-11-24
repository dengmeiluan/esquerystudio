/* Windows 代码签名：PFX、Trusted Signing 与仅用于管线自检的自签名。
 * 正式发布必须使用受信任证书；自签名只验证 signtool/证书/校验链路，不冒充受信任签名。 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_TIMESTAMP = 'http://timestamp.digicert.com';

export function detectSigningConfig(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return { mode: 'unsupported' };
  const has = (v) => typeof v === 'string' && v.trim() !== '';
  if (env.ESQ_WIN_SIGN_SELFSIGNED === '1') return { mode: 'self-signed' };
  if (has(env.ESQ_WIN_SIGN_PFX_BASE64) || has(env.ESQ_WIN_SIGN_PFX)) {
    return {
      mode: 'pfx',
      pfxBase64: has(env.ESQ_WIN_SIGN_PFX_BASE64) ? env.ESQ_WIN_SIGN_PFX_BASE64.trim() : '',
      pfxPath: has(env.ESQ_WIN_SIGN_PFX) ? env.ESQ_WIN_SIGN_PFX.trim() : '',
      password: env.ESQ_WIN_SIGN_PASSWORD || '',
      timestampUrl: env.ESQ_WIN_SIGN_TIMESTAMP_URL || DEFAULT_TIMESTAMP,
      expectedSubject: env.ESQ_WIN_SIGN_SUBJECT || '',
    };
  }
  if (has(env.ESQ_TRUSTED_SIGNING_DLIB) && has(env.ESQ_TRUSTED_SIGNING_ENDPOINT)
    && has(env.ESQ_TRUSTED_SIGNING_ACCOUNT) && has(env.ESQ_TRUSTED_SIGNING_CERT_PROFILE)) {
    return {
      mode: 'trusted-signing',
      dlib: env.ESQ_TRUSTED_SIGNING_DLIB.trim(),
      endpoint: env.ESQ_TRUSTED_SIGNING_ENDPOINT.trim(),
      account: env.ESQ_TRUSTED_SIGNING_ACCOUNT.trim(),
      profile: env.ESQ_TRUSTED_SIGNING_PROFILE || '',
      certProfile: env.ESQ_TRUSTED_SIGNING_CERT_PROFILE.trim(),
      correlationId: env.ESQ_TRUSTED_SIGNING_CORRELATION_ID || '',
      timestampUrl: env.ESQ_WIN_SIGN_TIMESTAMP_URL || '',
      expectedSubject: env.ESQ_WIN_SIGN_SUBJECT || '',
    };
  }
  return { mode: 'none' };
}

export function findSigntool(env = process.env) {
  if (env.ESQ_SIGNTOOL && existsSync(env.ESQ_SIGNTOOL)) return env.ESQ_SIGNTOOL;
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (existsSync(kits)) {
    const versions = readdirSync(kits)
      .filter((name) => /^\d+\.\d+\.\d+\.\d+$/.test(name))
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
        }
        return 0;
      });
    for (const version of versions) {
      const candidate = join(kits, version, 'x64', 'signtool.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('找不到 signtool.exe：安装 Windows SDK 或设置 ESQ_SIGNTOOL');
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { encoding: 'utf8', env, windowsHide: true, timeout: 120_000 });
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function powershell(script, env) {
  const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], env);
  if (result.status !== 0) throw new Error('PowerShell 失败：' + (result.stderr || result.stdout).slice(0, 600));
  return result.stdout.trim();
}

/* SEA 注入会保留 node.exe 的证书目录指针但破坏签名内容，signtool 会报 0x800700C1。
 * 在签名前把 PE 的 Security 目录（index 4）与校验和清零，让文件回到“未签名 PE”。 */
export function stripEmbeddedSignature(exePath) {
  const buf = readFileSync(exePath);
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return false;
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.toString('ascii', pe, pe + 4) !== 'PE\u0000\u0000') return false;
  const optional = pe + 24;
  const magic = buf.readUInt16LE(optional);
  const dirStart = magic === 0x20b ? optional + 112 : optional + 96;
  const security = dirStart + 4 * 8;
  if (security + 8 > buf.length) return false;
  const address = buf.readUInt32LE(security);
  const size = buf.readUInt32LE(security + 4);
  if (!address || !size) return false;
  buf.writeUInt32LE(0, security);
  buf.writeUInt32LE(0, security + 4);
  const checksum = optional + 64;
  if (checksum + 4 <= buf.length) buf.writeUInt32LE(0, checksum);
  writeFileSync(exePath, buf);
  return true;
}

export function signatureInfo(exePath) {
  const script = [
    '$s = Get-AuthenticodeSignature -FilePath $env:ESQ_SIGN_EXE;',
    '$c = $s.SignerCertificate;',
    '[pscustomobject]@{',
    'status = [string]$s.Status;',
    'message = [string]$s.StatusMessage;',
    'subject = if ($c) { $c.Subject } else { $null };',
    'issuer = if ($c) { $c.Issuer } else { $null };',
    'thumbprint = if ($c) { $c.Thumbprint } else { $null };',
    'notAfter = if ($c) { $c.NotAfter.ToString("o") } else { $null };',
    'timestamped = [bool]$s.TimeStamperCertificate',
    '} | ConvertTo-Json -Compress',
  ].join(' ');
  try {
    const out = powershell(script, { ...process.env, ESQ_SIGN_EXE: exePath });
    return JSON.parse(out);
  } catch (error) {
    return { status: 'UnknownError', message: error.message, subject: null, issuer: null, thumbprint: null, notAfter: null, timestamped: false };
  }
}

function createSelfSigned(pfxPath, password) {
  const script = [
    '$ErrorActionPreference = "Stop";',
    '$pwd = ConvertTo-SecureString -String $env:ESQ_SIGN_PFX_PASSWORD -Force -AsPlainText;',
    '$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=ESQueryStudio Local Dev"',
    '-CertStoreLocation Cert:\\CurrentUser\\My -NotAfter (Get-Date).AddDays(2) -KeyExportPolicy Exportable;',
    'Export-PfxCertificate -Cert $cert -FilePath $env:ESQ_SIGN_PFX_PATH -Password $pwd | Out-Null;',
    'Write-Output $cert.Thumbprint;',
  ].join(' ');
  const out = powershell(script, {
    ...process.env,
    ESQ_SIGN_PFX_PATH: pfxPath,
    ESQ_SIGN_PFX_PASSWORD: password,
  });
  return out.split(/\r?\n/).filter(Boolean).pop() || '';
}

function removeCert(thumbprint) {
  if (!thumbprint) return;
  try {
    powershell('Remove-Item -Path ("Cert:\\CurrentUser\\My\\" + $env:ESQ_SIGN_THUMB) -Force -ErrorAction SilentlyContinue', {
      ...process.env,
      ESQ_SIGN_THUMB: thumbprint,
    });
  } catch { /* 清理失败不影响产物；证书两天后自然过期 */ }
}

export function signExecutable(exePath, config, options = {}) {
  if (!config || config.mode === 'none') return { status: 'unsigned', mode: 'none' };
  if (config.mode === 'unsupported') return { status: 'unsigned', mode: 'unsupported' };
  const signtool = findSigntool();
  let work = null;
  let pfxPath = config.pfxPath || '';
  let password = config.password || '';
  let selfSignedThumbprint = '';

  try {
    if (config.mode === 'self-signed') {
      work = mkdtempSync(join(tmpdir(), 'esq-sign-'));
      pfxPath = join(work, 'self-signed.pfx');
      password = 'esq-selfsigned-' + Date.now();
      selfSignedThumbprint = createSelfSigned(pfxPath, password);
    } else if (config.mode === 'pfx' && config.pfxBase64) {
      work = mkdtempSync(join(tmpdir(), 'esq-sign-'));
      pfxPath = join(work, 'signing.pfx');
      writeFileSync(pfxPath, Buffer.from(config.pfxBase64, 'base64'));
    }
    if (!pfxPath && config.mode !== 'trusted-signing') throw new Error('缺少签名证书路径');
    stripEmbeddedSignature(exePath);

    const args = ['sign', '/fd', 'SHA256'];
    if (config.mode !== 'self-signed' && config.timestampUrl) {
      args.push('/tr', config.timestampUrl, '/td', 'SHA256');
    }
    if (config.mode === 'trusted-signing') {
      work = work || mkdtempSync(join(tmpdir(), 'esq-sign-'));
      const metadata = join(work, 'trusted-signing.json');
      writeFileSync(metadata, JSON.stringify({
        Endpoint: config.endpoint,
        CodeSigningAccountName: config.account,
        CertificateProfileName: config.certProfile,
        ...(config.correlationId ? { CorrelationId: config.correlationId } : {}),
      }), 'utf8');
      args.push('/dlib', config.dlib, '/dmdf', metadata);
    } else {
      args.push('/f', pfxPath, '/p', password);
    }
    args.push(exePath);
    const signed = run(signtool, args);
    if (signed.status !== 0) {
      throw new Error('signtool 签名失败：' + (signed.stderr || signed.stdout).slice(0, 800));
    }

    const info = signatureInfo(exePath);
    const trusted = info.status === 'Valid';
    if (config.mode === 'self-signed') {
      if (info.status === 'NotSigned') throw new Error('自签后仍未检测到签名');
    } else {
      if (!trusted) throw new Error('签名校验未通过：status=' + info.status + ' ' + (info.message || ''));
      if (config.expectedSubject && info.subject && !info.subject.includes(config.expectedSubject)) {
        throw new Error('签名主体不匹配：期望包含 ' + config.expectedSubject + '，实际 ' + info.subject);
      }
      if (config.timestampUrl && !info.timestamped) throw new Error('缺少可信时间戳');
    }

    return {
      status: config.mode === 'self-signed' ? 'self-signed' : 'signed',
      mode: config.mode,
      verified: trusted,
      trustStatus: info.status,
      message: info.message,
      subject: info.subject,
      issuer: info.issuer,
      thumbprint: info.thumbprint,
      notAfter: info.notAfter,
      timestamped: Boolean(info.timestamped),
      timestampUrl: config.timestampUrl || '',
    };
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
    removeCert(selfSignedThumbprint);
  }
}
