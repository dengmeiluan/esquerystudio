/* ESQueryStudio extension — live cluster monitor (bounded, in-memory only). */
(function () {
  'use strict';
  const C = window.ESCore;
  const $ = (id) => document.getElementById(id);
  const state = { timer: null, samples: [], live: false, totals: null, busy: false, cap: 120, interval: 5000 };
  const PREF_KEY = 'esquerystudio.ext.monitor';

  function app() { return window.ESApp; }

  async function sample() {
    if (state.busy) return;
    state.busy = true;
    try {
      const health = await app().es('/_cluster/health', { method: 'GET' });
      const h = health.data || {};
      let nodes = {};
      try {
        const stats = await app().es('/_nodes/stats?filter_path=nodes.*.jvm.mem.heap_used_percent,nodes.*.os.cpu.percent,nodes.*.indices.search.query_total,nodes.*.indices.indexing.index_total', { method: 'GET' });
        nodes = (stats.data && stats.data.nodes) || {};
      } catch (_) {
        nodes = {};
      }
      let queryTotal = 0;
      let indexTotal = 0;
      let heapSum = 0;
      let heapCount = 0;
      let cpuSum = 0;
      let cpuCount = 0;
      for (const node of Object.values(nodes)) {
        const search = node && node.indices && node.indices.search;
        const indexing = node && node.indices && node.indices.indexing;
        if (search && Number.isFinite(Number(search.query_total))) queryTotal += Number(search.query_total);
        if (indexing && Number.isFinite(Number(indexing.index_total))) indexTotal += Number(indexing.index_total);
        const heap = node && node.jvm && node.jvm.mem && Number(node.jvm.mem.heap_used_percent);
        if (Number.isFinite(heap)) { heapSum += heap; heapCount++; }
        const cpu = node && node.os && Number(node.os.cpu && node.os.cpu.percent);
        if (Number.isFinite(cpu)) { cpuSum += cpu; cpuCount++; }
      }
      const prev = state.totals;
      const now = Date.now();
      const qps = prev ? Math.max(0, (queryTotal - prev.queryTotal) / Math.max(0.001, (now - prev.ts) / 1000)) : 0;
      const indexRate = prev ? Math.max(0, (indexTotal - prev.indexTotal) / Math.max(0.001, (now - prev.ts) / 1000)) : 0;
      state.totals = { queryTotal, indexTotal, ts: now };
      const row = {
        ts: now, status: h.status || 'unknown',
        qps: Math.round(qps * 10) / 10,
        indexRate: Math.round(indexRate * 10) / 10,
        heap: heapCount ? Math.round(heapSum / heapCount) : null,
        cpu: cpuCount ? Math.round(cpuSum / cpuCount) : null,
        active: h.active_shards != null ? h.active_shards : null,
        unassigned: h.unassigned_shards != null ? h.unassigned_shards : null,
        nodes: h.number_of_nodes != null ? h.number_of_nodes : null,
        cluster: h.cluster_name || (app().cluster && app().cluster.name) || '—',
      };
      state.samples.push(row);
      if (state.samples.length > state.cap) state.samples.shift();
      render(row);
    } catch (err) {
      stop();
      app().toast('监控采样失败：' + String(err.message || err), true);
    } finally {
      state.busy = false;
    }
  }

  function render(row) {
    $('mStatus').textContent = row.status;
    $('mStatus').style.color = row.status === 'green' ? '#34d399' : row.status === 'yellow' ? '#fbbf24' : '#f87171';
    $('mCluster').textContent = row.cluster + (row.nodes != null ? ' · ' + row.nodes + ' nodes' : '');
    $('mQps').textContent = C.formatNumber(row.qps);
    $('mIndexRate').textContent = C.formatNumber(row.indexRate);
    $('mHeap').textContent = row.heap == null ? '—' : row.heap + '%';
    $('mCpu').textContent = row.cpu == null ? '—' : row.cpu + '%';
    $('mShards').textContent = row.active == null ? '—' : String(row.active);
    $('mShardsSub').textContent = 'active / unassigned ' + (row.unassigned == null ? '—' : row.unassigned);
    $('sampleCount').textContent = state.samples.length + ' / ' + state.cap + ' · ≈' + Math.round(state.cap * state.interval / 60000) + ' 分钟';
    draw();
    renderTable();
  }

  function draw() {
    const canvas = $('monitorChart');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 1200;
    const height = 180;
    if (canvas.width !== Math.floor(width * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#1b292a'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 16 + (height - 40) * i / 4;
      ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(width - 12, y); ctx.stroke();
    }
    const data = state.samples.slice(-state.cap);
    if (data.length < 2) {
      ctx.fillStyle = '#6f8580'; ctx.font = '12px Inter, sans-serif';
      ctx.fillText('等待采样…', 16, 30);
      return;
    }
    const max = Math.max(1, ...data.map((d) => Math.max(d.qps, d.indexRate)));
    const plot = (key, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      data.forEach((d, i) => {
        const x = 12 + (width - 24) * i / Math.max(1, data.length - 1);
        const y = height - 24 - (height - 44) * Math.min(1, d[key] / max);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    plot('qps', '#2dd4bf');
    plot('indexRate', '#8b5cf6');
    ctx.fillStyle = '#6f8580'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('max ' + max, 12, height - 8);
  }

  function renderTable() {
    const tbody = $('monitorTable').querySelector('tbody');
    tbody.innerHTML = '';
    for (const row of state.samples.slice(-12).reverse()) {
      const tr = document.createElement('tr');
      const cells = [
        new Date(row.ts).toLocaleTimeString('zh-CN', { hour12: false }),
        row.status, C.formatNumber(row.qps), C.formatNumber(row.indexRate),
        row.heap == null ? '—' : row.heap + '%', row.cpu == null ? '—' : row.cpu + '%',
        (row.active == null ? '—' : row.active) + ' / ' + (row.unassigned == null ? '—' : row.unassigned),
      ];
      cells.forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (i >= 2) td.className = 'num';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  function start() {
    if (state.timer) return;
    state.live = true;
    $('livePill').textContent = 'LIVE 运行中';
    $('livePill').className = 'pill ok';
    $('monitorToggleBtn').textContent = '停止采集';
    sample();
    state.timer = setInterval(sample, state.interval);
  }
  function stop() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.live = false;
    $('livePill').textContent = 'LIVE 停止';
    $('livePill').className = 'pill off';
    $('monitorToggleBtn').textContent = '开始采集';
  }
  function toggle() {
    if (state.live) { stop(); app().toast('监控已停止'); }
    else if (!app().state.cluster) app().toast('请先连接集群', true);
    else start();
  }
  function clear() {
    state.samples = []; state.totals = null;
    $('mQps').textContent = '—'; $('mIndexRate').textContent = '—'; $('mHeap').textContent = '—'; $('mCpu').textContent = '—';
    $('mShards').textContent = '—'; $('sampleCount').textContent = '0 / ' + state.cap;
    draw(); renderTable(); app().toast('采样已清空');
  }
  function onOpen() { draw(); renderTable(); }
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ cap: state.cap, interval: state.interval })); } catch (_) { /* ignore */ }
  }
  function readPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if ([60, 120, 240].includes(Number(p.cap))) state.cap = Number(p.cap);
      if ([3000, 5000, 10000, 30000].includes(Number(p.interval))) state.interval = Number(p.interval);
    } catch (_) { /* ignore */ }
    $('monitorCap').value = String(state.cap);
    $('monitorInterval').value = String(state.interval);
  }
  function init() {
    readPrefs();
    $('monitorToggleBtn').onclick = toggle;
    $('monitorClearBtn').onclick = clear;
    $('monitorCap').onchange = () => {
      state.cap = Number($('monitorCap').value) || 120;
      while (state.samples.length > state.cap) state.samples.shift();
      savePrefs(); render(state.samples[state.samples.length - 1] || {});
    };
    $('monitorInterval').onchange = () => {
      state.interval = Number($('monitorInterval').value) || 5000;
      savePrefs();
      if (state.live) { stop(); start(); }
      else render(state.samples[state.samples.length - 1] || {});
    };
    draw();
  }
  window.ESMonitor = { init, onOpen, start, stop, sample, clear };
})();
