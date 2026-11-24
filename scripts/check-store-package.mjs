#!/usr/bin/env node
/* Chrome Web Store readiness gate: manifest limits, optional host access, icons,
 * screenshots, listing copy length and the packaged zip. Run from the repo root. */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const EXT = join(ROOT, 'extensions', 'chrome');
const STORE = join(EXT, 'store');
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));

assert.equal(manifest.manifest_version, 3, 'MV3 required');
assert.ok([...manifest.name].length <= 45, 'store name <= 45 chars');
assert.ok([...manifest.description].length <= 132, 'manifest description <= 132 chars');
assert.ok(manifest.optional_host_permissions?.includes('http://*/*'), 'optional http host');
assert.ok(manifest.optional_host_permissions?.includes('https://*/*'), 'optional https host');
assert.ok(!manifest.host_permissions, 'no install-time host permissions');

function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.readUInt32BE(0), 0x89504e47, `${path} is PNG`);
  assert.equal(b.readUInt32BE(4), 0x0d0a1a0a, `${path} PNG signature`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

for (const [size, w, h] of [[16, 16, 16], [48, 48, 48], [128, 128, 128]]) {
  const p = join(EXT, 'icons', `icon${size}.png`);
  assert.ok(existsSync(p), `icon${size} exists`);
  assert.deepEqual(pngSize(p), { w, h }, `icon${size} is ${w}x${h}`);
}

const shotsDir = join(STORE, 'screenshots');
assert.ok(existsSync(shotsDir), 'store screenshots directory exists');
const shots = readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort();
assert.ok(shots.length >= 1, 'at least one store screenshot');
for (const f of shots) {
  assert.deepEqual(pngSize(join(shotsDir, f)), { w: 1280, h: 800 }, `${f} is 1280x800`);
}

assert.ok(existsSync(join(STORE, 'promo', 'small-tile-440x280.png')), 'small promo tile exists');
assert.deepEqual(pngSize(join(STORE, 'promo', 'small-tile-440x280.png')), { w: 440, h: 280 }, 'tile 440x280');
assert.ok(existsSync(join(ROOT, 'docs', 'privacy-policy.md')), 'privacy policy exists');
assert.ok(existsSync(join(EXT, 'STORE-SUBMISSION.md')), 'submission guide exists');

const listing = readFileSync(join(EXT, 'store-listing.md'), 'utf8');
function section(start, end) {
  const i = listing.indexOf(start);
  const j = listing.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `listing section ${start}`);
  return listing.slice(i + start.length, j).trim();
}
const en = section('## Detailed description (English, 1320 max)', '## Chinese localization');
const zh = section('## Detailed description (Chinese, optional localization)', '## Single purpose');
assert.ok([...en].length <= 1320, `English description ${en.length} <= 1320`);
assert.ok([...zh].length <= 1320, `Chinese description ${zh.length} <= 1320`);

const zip = join(ROOT, 'dist', `esquerystudio-extension-${manifest.version}.zip`);
assert.ok(existsSync(zip), `store zip exists: ${zip}`);
assert.ok(statSync(zip).size > 1_000_000, 'store zip looks complete');

console.log(`[store] OK — ${manifest.name} v${manifest.version}, ${shots.length} screenshots, EN ${en.length}/1320, ZH ${zh.length}/1320, zip ${(statSync(zip).size / 1048576).toFixed(2)} MB`);
