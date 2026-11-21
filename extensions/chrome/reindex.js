/* ESQueryStudio extension — guided _reindex with async task polling/cancel. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { task: '', timer: null, running: false };

  function app() { return window.ESApp; }

  function stopPolling() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function setState(text, cls) {
    const el = $('reindexState');
    el.textContent = text;
    el.className = 'chip ' + (cls || '');
  }

  function show(data) {
    $('reindexResult').textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  function progressText(task) {
    if (!task) return '';
    const t = task.task || task;
    const st = t.status || {};
    const total = st.total || 0;
    const done = st.created + st.updated + st.deleted + st.version_conflicts + (st.noops || 0);
    const parts = [];
    if (total) parts.push(done + '/' + total);
    if (st.created != null) parts.push('created ' + st.created);
    if (st.updated != null) parts.push('updated ' + st.updated);
    if (st.deleted != null) parts.push('deleted ' + st.deleted);
    if (st.failures && st.failures.length) parts.push('failures ' + st.failures.length);
    return parts.join(' · ');
  }

  async function poll() {
    if (!state.task) return;
    try {
      const res = await app().es('/_tasks/' + encodeURIComponent(state.task), { method: 'GET' });
      const data = res.data || {};
      const t = data.task || data;
      show(data);
      $('reindexMeta').textContent = progressText(data);
      if (t.completed) {
        stopPolling();
        state.running = false;
        setState('已完成', 'ok');
        $('reindexCancel').classList.add('hidden');
        app().toast('Reindex 任务完成');
      }
    } catch (err) {
      stopPolling();
      state.running = false;
      setState('轮询失败', 'bad');
      app().toast('任务轮询失败：' + String(err.message || err), true);
    }
  }

  async function run() {
    if (state.running) return;
    const source = $('reindexSource').value.trim();
    const dest = $('reindexDest').value.trim();
    if (!source || !dest) { app().toast('请填写源索引和目标索引', true); return; }
    if (source === dest) { app().toast('源索引与目标索引不能相同', true); return; }
    let query = null;
    const queryText = $('reindexQuery').value.trim();
    if (queryText) {
      try { query = JSON.parse(queryText); } catch (e) { app().toast('query JSON 不合法：' + e.message, true); return; }
    }
    const async = $('reindexAsync').checked;
    const body = { source: { index: source }, dest: { index: dest } };
    if (query) body.source.query = query;
    if ($('reindexSlices').value !== 'auto') body.slices = Number($('reindexSlices').value);
    if (async) body.wait_for_completion = false;
    state.running = true;
    setState('执行中…');
    $('reindexRun').disabled = true;
    try {
      const res = await app().es('/_reindex?wait_for_completion=' + (!async), { method: 'POST', body: JSON.stringify(body) });
      show(res.data);
      const task = res.data && (res.data.task || res.data.task_id);
      if (async && task) {
        state.task = String(task);
        $('reindexCancel').classList.remove('hidden');
        $('reindexMeta').textContent = 'task ' + state.task;
        stopPolling();
        state.timer = setInterval(poll, 2000);
        poll();
      } else {
        state.running = false;
        setState('已完成', 'ok');
        app().toast('Reindex 已提交');
      }
    } catch (err) {
      state.running = false;
      setState('失败', 'bad');
      show(String(err.message || err));
      app().toast(String(err.message || err), true);
    } finally {
      $('reindexRun').disabled = false;
    }
  }

  async function cancel() {
    if (!state.task) return;
    try {
      const res = await app().es('/_tasks/' + encodeURIComponent(state.task) + '/_cancel', { method: 'POST' });
      show(res.data);
      app().toast('已请求取消任务');
    } catch (err) { app().toast(String(err.message || err), true); }
  }

  function init() {
    $('reindexRun').onclick = run;
    $('reindexCancel').onclick = cancel;
  }
  window.ESReindex = { init };
})();
