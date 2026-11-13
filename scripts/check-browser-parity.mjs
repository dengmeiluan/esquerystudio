#!/usr/bin/env node
/*
 * Browser-mode parity gate.
 *
 * Every console endpoint exposed through ui/src/api.ts must have a pure-browser
 * implementation in ui/src/platform/browserApi.ts, or an explicit, reasoned entry
 * in BROWSER_SERVER_ONLY_ENDPOINTS. This is the gate that stops a feature from
 * shipping server-only by accident.
 *
 * The same check also covers the api prefixes declared by the page contract, so a
 * new page cannot be added without browser-mode transport coverage.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const api = read('ui/src/api.ts');
const browser = read('ui/src/platform/browserApi.ts');
const unsupported = read('ui/src/utils/browserUnsupported.ts');
const contract = JSON.parse(read('platform/src/main/resources/META-INF/esquerystudio-pages.json'));

function stripQuery(p) {
  return p.split('?')[0].replace(/\/+$/, '') || '/';
}

function normalizePath(p) {
  let out = stripQuery(p);
  if (out.startsWith('/internal/es/index')) out = out.slice('/internal/es/index'.length) || '/';
  if (out.startsWith('/internal/es/xmigrate')) out = out.slice('/internal/es/xmigrate'.length) || '/';
  return out;
}

/* API paths: quoted literals plus template literals with ${...} placeholders. */
const apiPaths = new Set();
for (const m of api.matchAll(/(['"`])(\/[^'"`\s]+)\1/g)) {
  const raw = m[2];
  if (raw.startsWith('/internal/')) continue; // permission prose, not a transport call
  if (raw === '/' || raw.startsWith('/#') || raw.startsWith('/*')) continue;
  apiPaths.add(normalizePath(raw));
}

/* Backend controllers: every console-facing endpoint must also be covered. */
function controllerFiles(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'target' || entry.name === 'test' || entry.name === 'node_modules') continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) controllerFiles(rel, out);
    else if (entry.name.endsWith('Controller.java')) out.push(rel);
  }
  return out;
}
const backendPaths = new Set();
for (const file of [...controllerFiles('modules'), ...controllerFiles('apps'), ...controllerFiles('platform')]) {
  const src = read(file);
  const classMap = src.match(/@RequestMapping\(([^)]*)\)/);
  let base = '';
  if (classMap) {
    const q = classMap[1].match(/["']([^"']+)["']/);
    if (q) base = q[1].replace(/^\/+|\/+$/g, '');
  }
  const methodMaps = [
    ...[...src.matchAll(/@(?:Get|Post|Put|Delete|Patch)Mapping\(([^)]*)\)/g)].map(m => m[1]),
    /* Method-level @RequestMapping (class-level is the first occurrence and already base). */
    ...[...src.matchAll(/@RequestMapping\(([^)]*)\)/g)].slice(1).map(m => m[1]),
  ];
  for (const args of methodMaps) {
    const q = args.match(/["']([^"']*)["']/);
    if (!q) continue;
    const full = '/' + [base, q[1].replace(/^\/+|\/+$/g, '')].filter(Boolean).join('/');
    if (full.startsWith('/internal/es/')) backendPaths.add(normalizePath(full));
  }
}

/* Browser literals and prefixes. */
const browserLiterals = new Set();
for (const m of browser.matchAll(/path\s*(?:===|==)\s*(['"])(\/[^'"]+)\1/g)) {
  browserLiterals.add(stripQuery(m[2]));
}
const browserPrefixes = [];
for (const m of browser.matchAll(/path\.startsWith\(\s*(['"])(\/[^'"]+)\1\s*\)/g)) {
  browserPrefixes.push(stripQuery(m[2]));
}
const browserRegexes = [];
/* Routing regexes are written as /^...$/.exec(path); a naive literal scan breaks on
   character classes such as [^/], so take the first /^ and the last slash on the line. */
for (const line of browser.split('\n')) {
  if (!line.includes('.exec(path)')) continue;
  const start = line.indexOf('/^');
  const end = line.lastIndexOf('/');
  if (start < 0 || end <= start) continue;
  try { browserRegexes.push(new RegExp(line.slice(start + 1, end))); } catch { /* ignore non-routing regex */ }
}

/* Explicit, reasoned server-only endpoints (should stay exceptional). */
const allowlist = new Map();
const allowBlock = unsupported.match(/export const BROWSER_SERVER_ONLY_ENDPOINTS[^{]*\{([\s\S]*?)\n\};/);
if (allowBlock) {
  for (const m of allowBlock[1].matchAll(/(['"])(\/[^'"]*)\1\s*:\s*(['"])([\s\S]*?)\3/g)) {
    const reason = m[4].trim();
    if (!reason) {
      console.error(`[browser-parity] allowlist entry ${m[2]} has no reason`);
      process.exit(1);
    }
    allowlist.set(stripQuery(m[2]), reason);
  }
}

function concrete(p) {
  return stripQuery(p).replace(/\$\{[^}]+\}/g, 'probe');
}

function isMapped(p) {
  const path = concrete(p);
  if (browserLiterals.has(path)) return true;
  /* A page-contract prefix is covered when a browser literal lives under it
     (e.g. /adhoc-rebuild -> /adhoc-rebuild/prepare). */
  if ([...browserLiterals].some(lit => lit === path || lit.startsWith(path + '/'))) return true;
  if (browserPrefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'))) return true;
  if (browserRegexes.some(re => re.test(path))) return true;
  for (const key of allowlist.keys()) {
    if (path === key || (key !== '/' && path.startsWith(key + '/'))) return true;
  }
  return false;
}

/* Self-test: prove the predicate rejects an intentionally server-only path. */
if (isMapped('/__browser_parity_self_test__')) {
  console.error('[browser-parity] self-test failed: an unmapped synthetic path was accepted');
  process.exit(1);
}
/* Negative control: `--negative-control` must fail with the synthetic endpoint listed. */
if (process.argv.includes('--negative-control')) {
  apiPaths.add('/__browser_parity_negative_control__');
}

if (apiPaths.size < 50 || backendPaths.size < 100) {
  console.error(`[browser-parity] endpoint extraction looks empty (api=${apiPaths.size}, backend=${backendPaths.size}); refusing to pass`);
  process.exit(1);
}
const missingApi = [...apiPaths].filter(p => !isMapped(p)).sort();
const missingBackend = [...backendPaths].filter(p => !isMapped(p)).sort();
const prefixes = new Set();
for (const page of contract.pages || []) {
  for (const prefix of page.apiPrefixes || []) {
    if (prefix.startsWith('/internal/es/')) prefixes.add(normalizePath(prefix));
  }
}
if (prefixes.size < 50) {
  console.error(`[browser-parity] page-contract extraction looks empty (${prefixes.size} prefixes); refusing to pass`);
  process.exit(1);
}
const missingPrefixes = [...prefixes].filter(p => !isMapped(p)).sort();

if (missingApi.length || missingBackend.length || missingPrefixes.length) {
  console.error('[browser-parity] FAILED — server-only transport detected');
  if (missingApi.length) {
    console.error('\nAPI endpoints in ui/src/api.ts without browser implementation:');
    for (const p of missingApi) console.error('  - ' + p);
  }
  if (missingBackend.length) {
    console.error('\nBackend controller endpoints without browser implementation:');
    for (const p of missingBackend) console.error('  - ' + p);
  }
  if (missingPrefixes.length) {
    console.error('\nPage-contract API prefixes without browser implementation:');
    for (const p of missingPrefixes) console.error('  - ' + p);
  }
  console.error('\nFix: implement it in ui/src/platform/browserApi.ts, or add a reasoned');
  console.error('entry to BROWSER_SERVER_ONLY_ENDPOINTS in ui/src/utils/browserUnsupported.ts.');
  process.exit(1);
}

console.log(`[browser-parity] OK — ${apiPaths.size} API paths, ${backendPaths.size} backend endpoints, ${prefixes.size} page-contract prefixes, ${allowlist.size} explicit server-only exception(s)`);
