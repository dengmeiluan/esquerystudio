/*
 * ESQueryStudio Chrome extension — network broker.
 *
 * The extension page never calls a remote origin directly. All Elasticsearch
 * requests go through this service worker, which uses the granted optional
 * host permission to bypass the page's CORS restrictions. The allowlist and
 * protocol checks are intentionally small: this is a query console, not a
 * general-purpose proxy.
 */

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'HEAD']);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

chrome.action.onClicked.addListener(() => {
  /* 原生 Vue 控制台（browser 构建）是插件主界面；直连单页保留给右键菜单。 */
  chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'esq-lucene', title: '用选中文本发起 Lucene 查询', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'esq-dsl', title: '把选中内容作为 DSL 打开', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'esq-workbench', title: '打开直连工作台', contexts: ['action'] });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'esq-workbench') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    return;
  }
  const text = String(info.selectionText || '').slice(0, 20000);
  const mode = info.menuItemId === 'esq-dsl' ? 'dsl' : 'lucene';
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') + '?mode=' + mode + '&prefill=' + encodeURIComponent(text) });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'esRequest') return false;

  (async () => {
    try {
      const url = new URL(String(message.url || ''));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only http/https Elasticsearch endpoints are allowed.');
      }
      const method = String(message.method || 'GET').toUpperCase();
      if (!ALLOWED_METHODS.has(method)) {
        throw new Error('HTTP method is not allowed by the extension broker.');
      }
      const body = message.body == null ? undefined : String(message.body);
      if (body && body.length > MAX_BODY_BYTES) {
        throw new Error('Request body exceeds the 8 MB extension limit.');
      }
      const headers = {};
      for (const [key, value] of Object.entries(message.headers || {})) {
        if (typeof value === 'string') headers[key] = value;
      }
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store',
      });
      const text = await response.text();
      sendResponse({
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
      });
    } catch (error) {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  })();

  return true;
});

/* ── 后台监控采样：页面关闭后仍每分钟取一次集群健康 ─────────────────────
 * 原生 Vue 控制台的 browserApi 在页面打开时做完整采样；这里是无页面时的兜底，
 * 写集群级 + 每节点 + Top 索引行（QPS/索引速率按前后两次计数差计算），存进同一
 * IndexedDB。保持与页面采样同形状，页面重新打开后能读到关闭期间的节点历史。
 * 不伪造历史：拿不到集群就写一条带 error 的 RED 行，页面会如实显示。 */
const MONITOR_ALARM = 'esq-monitor';
const MONITOR_DB = 'esquerystudio.browser';
const PROFILE_KEY = 'esquerystudio.browser.profile';
const PROFILES_KEY = 'esquerystudio.browser.profiles';
const ACTIVE_KEY = 'esquerystudio.browser.active';
const LAST_SAMPLE_PREFIX = 'esquerystudio.monitor.lastSample:';
const MONITOR_MAX_ROWS = 60_000; /* 与页面采样同口径：集群 + 节点行覆盖 7 天 */
const MONITOR_RETENTION_MS = 7 * 24 * 3600_000;

function ensureMonitorAlarm() {
  try {
    chrome.alarms.get(MONITOR_ALARM, (a) => {
      if (!a) chrome.alarms.create(MONITOR_ALARM, { periodInMinutes: 1 });
    });
  } catch { /* 旧版 Chrome */ }
}
chrome.runtime.onInstalled.addListener(ensureMonitorAlarm);
chrome.runtime.onStartup.addListener(ensureMonitorAlarm);
ensureMonitorAlarm();
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === MONITOR_ALARM) void sampleMonitor();
});

function openMonitorDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(MONITOR_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ['monitor', 'alerts', 'audit']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function dbAddMonitor(record) {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction('monitor', 'readwrite');
      tx.objectStore('monitor').add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  }));
}

function dbTrimMonitor() {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction('monitor', 'readwrite');
      const store = tx.objectStore('monitor');
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).sort((a, b) => a.timestamp - b.timestamp);
        const cutoff = Date.now() - MONITOR_RETENTION_MS;
        const keepFrom = Math.max(0, rows.length - MONITOR_MAX_ROWS);
        rows.forEach((row, i) => { if (i < keepFrom || row.timestamp < cutoff) store.delete(row.id); });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  }));
}

function dbMetaGet(key) {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  }));
}

function dbMetaPut(key, value) {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  }));
}

function dbAddAlert(record) {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction('alerts', 'readwrite');
      tx.objectStore('alerts').add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  }));
}

function dbLatestMonitor(connId) {
  return openMonitorDb().then(db => new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const req = db.transaction('monitor', 'readonly').objectStore('monitor').getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).filter(r => r.scope === 'cluster' && r.connId === connId);
        resolve(rows.length ? rows[rows.length - 1] : null);
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  }));
}

function monitorAuth(p) {
  if (p && p.authType === 'API_KEY' && p.password) return { Authorization: 'ApiKey ' + p.password };
  if (!p || !p.username) return {};
  return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(p.username + ':' + (p.password || '')))) };
}

async function monitorFetch(p, path) {
  const res = await fetch(String(p.url).replace(/\/+$/, '') + path, {
    headers: { Accept: 'application/json', ...monitorAuth(p) }, credentials: 'omit', cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && (data.error?.reason || data.message)) || text || ('HTTP ' + res.status));
  return data;
}

async function sampleProfile(p, saved) {
  if (!p || !p.url) return;
  const connId = p.id || 'browser';
  const lastKey = LAST_SAMPLE_PREFIX + connId;
  const now = Date.now();
  const last = Number(saved[lastKey] || (connId === 'browser' ? saved['esquerystudio.monitor.lastSample'] : 0) || 0);
  if (last && now - last < 55000) return;
  const started = Date.now();
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  let root = null, health = null, stats = null, cat = [], idxStats = null;
  let error = '';
  try {
    /* 只有集群健康是硬依赖：受限账号可能没有 _nodes / _cat / _stats 权限，
       这些是增强项，失败时降级为空而不是把整条采样标成 RED。 */
    [root, health, stats, cat, idxStats] = await Promise.all([
      monitorFetch(p, '/').catch(() => null),
      monitorFetch(p, '/_cluster/health'),
      monitorFetch(p, '/_nodes/stats/indices,jvm,os,fs,thread_pool').catch(() => null),
      monitorFetch(p, '/_cat/indices?format=json&h=index,health,docs.count,store.size,pri,rep,docs.deleted').catch(() => []),
      monitorFetch(p, '/_stats/search,indexing,store,docs?level=indices').catch(() => null),
    ]);
  } catch (e) {
    error = String(e && e.message ? e.message : e).slice(0, 500);
  }
  const prev = await dbLatestMonitor(connId);
  const statsNodes = stats && stats.nodes ? Object.values(stats.nodes) : null;
  const statsOk = !!statsNodes;
  const nodes = statsNodes || [];
  const sum = (fn) => nodes.reduce((n, x) => n + (Number(fn(x)) || 0), 0);
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const connName = (health && health.cluster_name) || (root && root.cluster_name) || p.name || 'cluster';
  const dt = prev ? Math.max(1, (now - prev.timestamp) / 1000) : 0;
  const searchTotal = sum(x => x?.indices?.search?.query_total);
  const indexTotal = sum(x => x?.indices?.indexing?.index_total);
  const writeRej = sum(x => x?.thread_pool?.write?.rejected);
  const searchRej = sum(x => x?.thread_pool?.search?.rejected);
  const heapPcts = nodes.map(x => num(x?.jvm?.mem?.heap_used_percent)).filter(x => x > 0);
  const cpuPcts = nodes.map(x => num(x?.os?.cpu?.percent));
  const diskPcts = nodes.map(x => {
    const t = num(x?.fs?.total?.total_in_bytes), a = num(x?.fs?.total?.available_in_bytes);
    return t > 0 ? Math.round(((t - a) / t) * 1000) / 10 : 0;
  });
  const nodeRows = nodes.map(n => {
    const t = num(n?.fs?.total?.total_in_bytes), a = num(n?.fs?.total?.available_in_bytes);
    const prevNode = prev?.nodesDetail?.find(x => x.nodeName === n.name);
    const wRej = num(n?.thread_pool?.write?.rejected), sRej = num(n?.thread_pool?.search?.rejected);
    return {
      timestamp: now, connId, connName, env: p.env || 'BROWSER', scope: 'node', nodeName: n.name,
      status: error ? 'RED' : String((health && health.status) || 'unknown'),
      heapUsedPct: num(n?.jvm?.mem?.heap_used_percent), heapUsedMb: Math.round(num(n?.jvm?.mem?.heap_used_in_bytes) / 1048576),
      cpuPct: num(n?.os?.cpu?.percent), esCpuPct: num(n?.os?.cpu?.percent), load1m: num(n?.os?.cpu?.load_average?.['1m']),
      diskUsedPct: t > 0 ? Math.round(((t - a) / t) * 1000) / 10 : 0, fsAvailMb: Math.round(a / 1048576),
      osMemUsedPct: num(n?.os?.mem?.used_percent), fielddataMb: Math.round(num(n?.indices?.fielddata?.memory_size_in_bytes) / 1048576),
      tpWriteActive: num(n?.thread_pool?.write?.active), tpWriteQueue: num(n?.thread_pool?.write?.queue),
      writeRejected: dt && prevNode ? Math.round(((wRej - num(prevNode._writeRej)) / dt) * 60) : undefined,
      searchRejected: dt && prevNode ? Math.round(((sRej - num(prevNode._searchRej)) / dt) * 60) : undefined,
      _writeRej: wRej, _searchRej: sRej,
    };
  });
  const prevCounters = prev?.indexCounters || {};
  const nextCounters = {};
  const tops = [];
  for (const [idx, v] of Object.entries((idxStats && idxStats.indices) || {})) {
    if (String(idx).startsWith('.')) continue;
    const q = num(v?.total?.search?.query_total), i = num(v?.total?.indexing?.index_total);
    nextCounters[idx] = { q, i };
    const pq = prevCounters[idx]?.q, pi = prevCounters[idx]?.i;
    tops.push({
      index: idx,
      qps: dt && pq != null ? Math.round(((q - pq) / dt) * 100) / 100 : undefined,
      idxRate: dt && pi != null ? Math.round(((i - pi) / dt) * 100) / 100 : undefined,
      storeMb: Math.round(num(v?.total?.store?.size_in_bytes) / 10485.76) / 100,
      docs: num(v?.total?.docs?.count),
    });
  }
  tops.sort((a, b) => (b.qps || 0) - (a.qps || 0) || (b.idxRate || 0) - (a.idxRate || 0) || b.storeMb - a.storeMb);
  const rec = {
    timestamp: now, connId, connName, env: p.env || 'BROWSER', scope: 'cluster',
    status: error ? 'RED' : String((health && health.status) || 'unknown'),
    latencyMs: Date.now() - started,
    esVersion: root && root.version ? root.version.number : undefined,
    nodes: Number((health && health.number_of_nodes) || nodes.length),
    indices: (cat || []).filter(r => !String(r.index || '').startsWith('.')).length,
    shards: Number((health && health.active_shards) || 0),
    unassigned: Number((health && health.unassigned_shards) || 0),
    primaryShards: Number((health && health.active_primary_shards) || 0),
    nodesMissing: statsOk ? Math.max(0, Number((health && health.number_of_nodes) || 0) - nodes.length) : 0,
    heapUsedPct: Math.round(avg(heapPcts)),
    cpuPct: Math.round(avg(cpuPcts)),
    diskUsedPct: Math.round(Math.max(0, ...diskPcts)),
    heapUsedMb: Math.round(sum(x => x?.jvm?.mem?.heap_used_in_bytes) / 1048576),
    fielddataMb: Math.round(sum(x => x?.indices?.fielddata?.memory_size_in_bytes) / 1048576),
    docsDeleted: (cat || []).reduce((n, r) => n + num(r['docs.deleted']), 0),
    topIndexes: tops.slice(0, 12),
    nodesDetail: nodeRows,
    indexCounters: nextCounters,
    error: error || undefined,
    _searchTotal: searchTotal, _indexTotal: indexTotal, _writeRej: writeRej, _searchRej: searchRej,
  };
  if (dt && prev) {
    rec.qps = Math.round(((searchTotal - Number(prev._searchTotal || 0)) / dt) * 100) / 100;
    rec.indexRate = Math.round(((indexTotal - Number(prev._indexTotal || 0)) / dt) * 100) / 100;
    rec.writeRejected = Math.round(((writeRej - Number(prev._writeRej || 0)) / dt) * 60);
    rec.searchRejected = Math.round(((searchRej - Number(prev._searchRej || 0)) / dt) * 60);
  }
  /* 页面关闭后也要继续做阈值判定，否则告警历史只覆盖「控制台标签页开着」的时间。 */
  const active = {};
  if (error) {
    active.connection = { level: 'CRIT', value: 1, threshold: 0, message: '集群连接失败：' + error };
  } else {
    if (rec.status === 'red') active['cluster.status'] = { level: 'CRIT', value: 1, threshold: 0, message: '集群 RED，存在不可用主分片' };
    else if (rec.status === 'yellow' && rec.nodes > 1) active['cluster.status'] = { level: 'WARN', value: 1, threshold: 0, message: '集群 YELLOW，副本分片未分配' };
    if (rec.heapUsedPct >= 85) active['nodes.heap'] = { level: 'WARN', value: rec.heapUsedPct, threshold: 85, message: '平均 heap 使用率 >= 85%' };
    if (rec.diskUsedPct >= 85) active['nodes.disk'] = { level: 'CRIT', value: rec.diskUsedPct, threshold: 85, message: '节点磁盘使用率 >= 85%' };
    if (rec.cpuPct >= 90) active['nodes.cpu'] = { level: 'WARN', value: rec.cpuPct, threshold: 90, message: '平均 CPU >= 90%' };
    if (statsOk && rec.nodesMissing > 0) active['nodes.missing'] = { level: 'CRIT', value: rec.nodesMissing, threshold: 0, message: '有节点失联' };
  }
  const stateKey = 'monitor.alertState:' + connId;
  const prevState = (await dbMetaGet(stateKey)) || {};
  const alerts = [];
  for (const [metric, a] of Object.entries(active)) {
    if (!prevState[metric] || prevState[metric].level !== a.level) {
      alerts.push({ timestamp: now, connId, connName, env: p.env || 'BROWSER', level: a.level, metric, value: a.value, threshold: a.threshold, message: a.message, recovered: false });
    }
  }
  for (const metric of Object.keys(prevState)) {
    if (!active[metric]) alerts.push({ timestamp: now, connId, connName, env: p.env || 'BROWSER', level: 'INFO', metric, value: 0, threshold: 0, message: '指标已恢复：' + metric, recovered: true });
  }
  await dbMetaPut(stateKey, active);
  await dbAddMonitor(rec);
  for (const row of nodeRows) await dbAddMonitor(row);
  for (const a of alerts) await dbAddAlert(a);
  void dbTrimMonitor();
  await chrome.storage.local.set({ [lastKey]: now, 'esquerystudio.monitor.lastSample': now });
}

/* 后台采集器：遍历所有已存连接（服务端多集群采样的有损本机等价物）。
   - 页面打开时，同 profile 的 55s 节流键由页面和本函数共享，避免双写；
   - 页面关闭后，alarm 仍按分钟为每条连接写集群健康行；
   - 单条连接失败只记该连接的 RED 行，不影响其他连接。 */
async function sampleMonitor() {
  const saved = await chrome.storage.local.get([
    PROFILES_KEY, ACTIVE_KEY, PROFILE_KEY, 'esquerystudio.monitor.lastSample',
  ]);
  let list = Array.isArray(saved[PROFILES_KEY]) ? saved[PROFILES_KEY] : [];
  if (!list.length && saved[PROFILE_KEY] && saved[PROFILE_KEY].url) {
    list = [{ ...saved[PROFILE_KEY], id: saved[PROFILE_KEY].id || 'browser', env: saved[PROFILE_KEY].env || 'BROWSER' }];
  }
  const seen = new Set();
  for (const p of list) {
    if (!p || !p.url) continue;
    const id = p.id || 'browser';
    if (seen.has(id)) continue;
    seen.add(id);
    await sampleProfile(p, saved);
  }
}
