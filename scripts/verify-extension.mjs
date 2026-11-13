#!/usr/bin/env node
/* Guard for the ESQueryStudio MV3 extension: manifest, broker allowlist, local assets,
 * required surfaces and old-name/remote-code absence. Run from the repository root. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const EXT = join(ROOT, 'extensions/chrome');
const read = (p) => readFileSync(join(EXT, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'ui/package.json'), 'utf8'));

assert.equal(manifest.manifest_version, 3, 'MV3 required');
assert.match(manifest.name, /ESQueryStudio/, 'brand in manifest');
assert.match(manifest.name, /Elasticsearch/, 'domain in manifest name');
assert.equal(manifest.version, pkg.version, 'extension and UI share a version');
assert.equal(manifest.background?.service_worker, 'background.js');
const optionalHosts = manifest.optional_host_permissions || [];
assert.ok(optionalHosts.includes('http://*/*'), 'runtime host permission covers http');
assert.ok(optionalHosts.includes('https://*/*'), 'runtime host permission covers https');
assert.ok(!manifest.host_permissions, 'no install-time broad host access');
assert.ok(!manifest.content_scripts, 'no content-script injection');
assert.ok(!manifest.web_accessible_resources, 'no broad web-accessible resources');
for (const size of [16, 48, 128]) assert.ok(existsSync(join(EXT, `icons/icon${size}.png`)), `icon${size}`);

const background = read('background.js');
for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']) {
  assert.ok(background.includes(`'${method}'`), `broker allows ${method}`);
}
assert.ok(background.includes('http:') && background.includes('https:'), 'protocol allowlist');
assert.ok(background.includes('MAX_BODY_BYTES'), 'body cap');
assert.ok(background.includes('chrome.contextMenus.create'), 'context menu integration');
assert.ok(background.includes('credentials: \'omit\''), 'no ambient cookies');
assert.ok(!background.includes('eval('), 'no eval in broker');

const html = read('index.html');
assert.ok(!/(src|href)="https?:/i.test(html), 'no remote assets');
for (const id of ['baseUrl', 'connectBtn', 'indexSelect', 'queryInput', 'runBtn',
  'resultArea', 'monitorChart', 'historyList', 'favoriteList']) {
  assert.ok(html.includes(`id="${id}"`), `UI id ${id}`);
}
for (const mode of ['dsl', 'lucene', 'sql', 'pit']) {
  assert.ok(html.includes(`data-mode="${mode}"`), `mode ${mode}`);
}

const app = read('app.js');
const query = read('query.js');
const monitor = read('monitor.js');
assert.ok(app.includes('chrome.permissions.request'), 'requests optional host permission at connect time');
const vueBundle = readdirSync(join(EXT, 'app/assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => read(join('app/assets', f)))
  .join('\n');
assert.ok(vueBundle.includes('ESQueryStudioMCP'), 'browser-mode MCP bridge is bundled');
assert.ok(vueBundle.includes('密钥与用量'), 'MCP key/usage management UI is bundled');
assert.ok(app.includes('esquerystudio.ext.history'), 'history storage key');
assert.ok(query.includes('/_sql?format=json'), 'ES-SQL direct call');
assert.ok(query.includes('_explain'), 'explain direct call');
assert.ok(query.includes('_pit?keep_alive=1m'), 'PIT open');
assert.ok(query.includes('search_after'), 'PIT pagination');
assert.ok(query.includes('toCsv'), 'CSV export');
assert.ok(monitor.includes('/_cluster/health'), 'health sampling');
assert.ok(monitor.includes('/_nodes/stats'), 'node stats sampling');
assert.ok(monitor.includes('state.cap'), 'bounded samples');
assert.ok(monitor.includes('monitorInterval'), 'configurable sampling interval');
assert.ok(query.includes('openPrefill'), 'deep-link prefill');
assert.ok(query.includes('DRAFT_KEY') && query.includes('saveDrafts'), 'per-mode draft persistence');
assert.ok(read('reindex.js').includes('_reindex') && read('reindex.js').includes('_tasks/'), 'guided reindex task flow');
assert.ok(existsSync(join(EXT, 'app/index.html')), 'native Vue app bundle');
assert.ok(background.includes('app/index.html'), 'action opens native Vue app');
/* 页面关闭后的采样要与页面侧同形状：集群 + 每节点 + Top 索引，而不是只剩健康行。 */
for (const token of ["scope: 'node'", 'topIndexes', '/_stats/search,indexing,store,docs', 'dbTrimMonitor()', 'dbAddAlert', 'monitor.alertState:', 'statsOk']) {
  assert.ok(background.includes(token), `service-worker sampling keeps ${token}`);
}
assert.ok(existsSync(join(ROOT, 'ui/src/platform/browserApi.ts')), 'browser transport exists');
assert.ok(readFileSync(join(ROOT, 'ui/src/api.ts'), 'utf8').includes('isBrowserMode'), 'API switches transport by mode');
{
  const bridge = readFileSync(join(ROOT, 'ui/src/platform/browserApi.ts'), 'utf8');
  for (const ep of ['/cluster/templates', '/cluster/snapshot/repos', '/cluster/ilm/policies', '/cluster/reindex-advanced', '/cluster/resolve-schema', '/cluster/health-report']) {
    assert.ok(bridge.includes(ep), `browser bridge maps ${ep}`);
  }
  for (const ep of ["path === '/progress'", '/insight/settings-impact', 'insightAction']) {
    assert.ok(bridge.includes(ep), `browser bridge handles ${ep}`);
  }
  /* 首屏门禁互斥：浏览器模式只能出现 BrowserConnect；LoginOverlay/SetupWizard 若同时挂载
     会叠三层全屏遮罩并抢焦点（实测集群录入后狂闪/不可用）。 */
  const appVue = readFileSync(join(ROOT, 'ui/src/App.vue'), 'utf8');
  assert.match(appVue, /<LoginOverlay v-if="!isBrowserMode(?: && !isDemoMode)?" \/>/, 'browser mode hides LoginOverlay');
  assert.match(appVue, /<SetupWizard v-if="!isBrowserMode(?: && !isDemoMode)?" \/>/, 'browser mode hides SetupWizard');
  assert.ok(appVue.includes('<BrowserConnect v-if="isBrowserMode" />'), 'browser mode mounts BrowserConnect only');
  const apiTs = readFileSync(join(ROOT, 'ui/src/api.ts'), 'utf8');
  assert.ok(apiTs.includes('browserSetupProbe'), 'browser /auth/me 401 does not open the login overlay');
  const connectVue = readFileSync(join(ROOT, 'ui/src/components/BrowserConnect.vue'), 'utf8');
  assert.ok(connectVue.includes('.permissions.request'), 'connect dialog requests optional host permission');
  assert.ok(connectVue.includes('需要授权访问该集群地址'), 'connect dialog explains a denied host grant');
  assert.ok(bridge.includes('BROWSER_MODE_SERVER_ONLY'), 'server-only endpoints are labelled, not silently faked');
  assert.ok(existsSync(join(ROOT, 'ui/src/components/BrowserServerOnly.vue')), 'server-only page notice exists');
  for (const f of ['browserStore.ts', 'browserMonitor.ts', 'browserAdhoc.ts', 'browserXmigrate.ts', 'browserInsight.ts', 'browserProfiles.ts']) {
    assert.ok(existsSync(join(ROOT, 'ui/src/platform', f)), `browser persistence module ${f} exists`);
  }
  const insight = readFileSync(join(ROOT, 'ui/src/platform/browserInsight.ts'), 'utf8');
  assert.ok(insight.includes('APPLY_INDEX_SETTINGS') && insight.includes('confirmToken'), 'local guarded-action protocol exists');
  assert.ok(insight.includes("es('/' + enc(index) + '/_settings', 'PUT'"), 'guarded execute writes real index settings');
  const profiles = readFileSync(join(ROOT, 'ui/src/platform/browserProfiles.ts'), 'utf8');
  assert.ok(profiles.includes('esquerystudio.browser.profiles') && profiles.includes('esquerystudio.browser.active'), 'multi-profile local storage exists');
  assert.ok(bridge.includes('profiles().map(connView)'), 'connection list uses local profiles');
  assert.ok(manifest.permissions.includes('alarms'), 'background monitor alarm permission');
  const bg = readFileSync(join(ROOT, 'extensions/chrome/background.js'), 'utf8');
  assert.ok(bg.includes('esq-monitor') && bg.includes('sampleMonitor'), 'service worker samples monitor history');
  assert.ok(bg.includes('sampleProfile') && bg.includes('PROFILES_KEY'), 'service worker samples every saved profile');
}
assert.ok(monitor.includes('setInterval(sample, state.interval)'), 'live loop uses configured interval');
assert.ok(monitor.includes('state.samples.shift()'), 'ring buffer eviction');

const all = [background, html, app, query, monitor, read('core.js')].join('\n');
for (const old of ['searchdeck', 'sharddesk', 'SearchDeck', 'ShardDesk']) {
  assert.ok(!all.includes(old), `old brand removed: ${old}`);
}
assert.ok(!/google-analytics|gtag\(|sentry|mixpanel/i.test(all), 'no telemetry');
console.log('[extension] OK — MV3, local assets, broker allowlist, 6 query surfaces, bounded monitor');
