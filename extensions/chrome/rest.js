/* ESQueryStudio extension — raw REST console. Reindex/tasks/snapshots are exposed
 * deliberately: the user owns the cluster credentials and accepts the risk. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PRESETS = {
    health: { method: 'GET', path: '/_cluster/health', body: '' },
    indices: { method: 'GET', path: '/_cat/indices?format=json&v', body: '' },
    reindex: {
      method: 'POST', path: '/_reindex?wait_for_completion=false',
      body: JSON.stringify({ source: { index: 'old-index' }, dest: { index: 'new-index' } }, null, 2),
    },
    tasks: { method: 'GET', path: '/_tasks?group_by=parents&detailed=true', body: '' },
    snapshots: { method: 'GET', path: '/_snapshot?pretty', body: '' },
  };

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    $('restMethod').value = p.method;
    $('restPath').value = p.path;
    $('restBody').value = p.body;
    $('restStatus').textContent = '待发送';
    $('restResult').textContent = '点击「发送」执行请求';
  }

  async function send() {
    const method = $('restMethod').value;
    const path = $('restPath').value.trim();
    if (!path) { window.ESApp.toast('请输入请求路径', true); return; }
    let body = $('restBody').value.trim();
    if (body && method !== 'GET' && method !== 'HEAD') {
      try { JSON.parse(body); } catch (e) { window.ESApp.toast('请求体 JSON 不合法：' + e.message, true); return; }
    } else { body = ''; }
    $('restStatus').textContent = '请求中…';
    $('restMeta').textContent = method + ' ' + path;
    const started = performance.now();
    try {
      const res = await window.ESApp.es(path, { method, body: body || undefined });
      const elapsed = Math.round(performance.now() - started);
      $('restStatus').textContent = 'HTTP ' + res.status;
      $('restMeta').textContent = method + ' ' + path + ' · ' + elapsed + ' ms';
      $('restResult').textContent = JSON.stringify(res.data, null, 2);
    } catch (err) {
      $('restStatus').textContent = err.status ? 'HTTP ' + err.status : '失败';
      $('restResult').textContent = String(err.message || err);
      window.ESApp.toast(String(err.message || err), true);
    }
  }

  function init() {
    $('restSend').onclick = send;
    document.querySelectorAll('[data-rest-preset]').forEach((b) => {
      b.onclick = () => applyPreset(b.dataset.restPreset);
    });
    applyPreset('health');
  }
  window.ESRest = { init, send, applyPreset };
})();
