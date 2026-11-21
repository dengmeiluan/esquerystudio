/* ESQueryStudio extension — pure helpers shared by the UI and guard tests. */
(function (global) {
  'use strict';

  const HISTORY_CAP = 100;
  const FAVORITE_CAP = 50;
  const SAMPLE_CAP = 120;

  function normalizeBaseUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) throw new Error('请输入 Elasticsearch 地址');
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只允许 http/https 地址');
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  }

  function authHeaders(profile) {
    if (!profile || profile.authMode === 'none') return {};
    if (profile.authMode === 'basic') {
      const raw = String(profile.username || '') + ':' + String(profile.password || '');
      return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(raw))) };
    }
    if (profile.authMode === 'apikey' && profile.apiKey) {
      return { Authorization: 'ApiKey ' + String(profile.apiKey).trim() };
    }
    return {};
  }

  async function relay(profile, path, options) {
    const opts = options || {};
    const base = normalizeBaseUrl(profile.baseUrl);
    const url = base + (String(path || '').startsWith('/') ? path : '/' + path);
    const headers = Object.assign({ Accept: 'application/json' }, authHeaders(profile));
    if (opts.body !== undefined && opts.body !== null && opts.body !== '') {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    if (global.chrome && chrome.runtime && chrome.runtime.id) {
      response = await chrome.runtime.sendMessage({
        type: 'esRequest',
        url,
        method: opts.method || 'GET',
        headers,
        body: opts.body === undefined ? undefined : String(opts.body),
      });
      if (!response || !response.ok) throw new Error((response && response.error) || '扩展网络代理不可用');
    } else {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.body === undefined ? undefined : String(opts.body),
        credentials: 'omit',
      });
      response = {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: await res.text(),
      };
    }
    const text = response.body || '';
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (response.status >= 400) {
      const reason = data && data.error
        ? String(data.error.reason || data.error.type || JSON.stringify(data.error))
        : text.slice(0, 500);
      const err = new Error('HTTP ' + response.status + ' · ' + reason);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return { status: response.status, headers: response.headers || {}, data, text };
  }

  function formatBytes(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '—';
    if (v < 1024) return v + ' B';
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let x = v / 1024;
    let i = 0;
    while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
    return (x >= 10 ? x.toFixed(0) : x.toFixed(1)) + ' ' + units[i];
  }

  function formatNumber(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toLocaleString('zh-CN') : '—';
  }

  function formatMs(n) {
    const v = Number(n);
    return Number.isFinite(v) ? (v < 1 ? '<1 ms' : Math.round(v) + ' ms') : '—';
  }

  function csvEscape(value) {
    const text = value === null || value === undefined ? ''
      : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(rows, columns) {
    const cols = columns && columns.length ? columns : ['_id', '_score'];
    const header = cols.map(csvEscape).join(',');
    const body = (rows || []).map((row) => cols.map((c) => {
      if (c === '_id' || c === '_index' || c === '_score') return csvEscape(row[c]);
      const src = row._source || {};
      return csvEscape(src[c]);
    }).join(','));
    return [header].concat(body).join('\n');
  }

  function collectColumns(hits) {
    const seen = new Set();
    const cols = [];
    for (const hit of hits || []) {
      const src = hit._source || {};
      for (const key of Object.keys(src)) {
        if (!seen.has(key) && seen.size < 40) { seen.add(key); cols.push(key); }
      }
    }
    return cols.length ? cols : ['_source'];
  }

  function cellText(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function parseJson(text, fallback) {
    try { return JSON.parse(text); } catch (_) { return fallback; }
  }

  function pushCapped(list, item, cap) {
    const next = Array.isArray(list) ? list.slice() : [];
    next.unshift(item);
    return next.slice(0, cap || HISTORY_CAP);
  }

  function storageBytes(value) {
    try { return new Blob([JSON.stringify(value)]).size; } catch (_) { return 0; }
  }

  global.ESCore = {
    HISTORY_CAP, FAVORITE_CAP, SAMPLE_CAP,
    normalizeBaseUrl, authHeaders, relay,
    formatBytes, formatNumber, formatMs, csvEscape, toCsv, collectColumns, cellText,
    parseJson, pushCapped, storageBytes,
  };
})(typeof window !== 'undefined' ? window : globalThis);
