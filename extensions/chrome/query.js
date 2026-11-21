/* ESQueryStudio extension — query workbench: DSL, Lucene, ES-SQL, PIT, explain. */
(function () {
  'use strict';
  const C = window.ESCore;
  const $ = (id) => document.getElementById(id);
  let mode = 'dsl';
  const DRAFT_KEY = 'esquerystudio.ext.drafts';
  let drafts = { dsl: '', lucene: '', sql: '', pit: '' };
  let lastMode = 'dsl';
  let resultView = 'table';
  let pit = null;
  let lastHits = [];
  let lastColumns = [];
  let lastRaw = null;

  const TEMPLATES = {
    dsl: '{\n  "size": 20,\n  "query": {\n    "match_all": {}\n  }\n}',
    lucene: 'status:ACTIVE AND title:研报',
    sql: 'SELECT * FROM "' + 'research_report' + '" LIMIT 100',
  };

  function app() { return window.ESApp; }

  function saveDrafts() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ drafts, mode: lastMode })); } catch (_) { /* ignore */ }
  }
  function readDrafts() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      if (saved.drafts && typeof saved.drafts === 'object') drafts = Object.assign(drafts, saved.drafts);
      if (['dsl','lucene','sql','pit'].includes(saved.mode)) lastMode = saved.mode;
    } catch (_) { /* ignore */ }
  }
  function setMode(next) {
    if (mode && mode !== next && $('queryInput').value.trim()) drafts[mode] = $('queryInput').value;
    mode = next;
    lastMode = next;
    saveDrafts();
    document.querySelectorAll('.mode-tab').forEach((b) => {
      const on = b.dataset.mode === next;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const titles = { dsl: 'Query DSL', lucene: 'Lucene Query', sql: 'ES-SQL', pit: 'PIT Deep Pagination' };
    $('editorTitle').textContent = titles[next];
    $('pitBar').classList.toggle('hidden', next !== 'pit');
    if (next !== 'pit' && pit) closePit(true);
    if (drafts[next]) $('queryInput').value = drafts[next];
    else if (next === 'lucene') $('queryInput').value = TEMPLATES.lucene;
    else if (next === 'sql') $('queryInput').value = TEMPLATES.sql.replace('research_report', app().state.selectedIndex || 'your-index');
    else $('queryInput').value = TEMPLATES.dsl;
    updateHint();
    updateMeta();
  }

  function updateHint() {
    const st = app().state;
    if (!st.selectedIndex) { $('queryHint').textContent = '先连接并选择索引'; return; }
    if (mode === 'sql') { $('queryHint').textContent = 'POST /_sql · 直连 SQL'; return; }
    if (mode === 'lucene') { $('queryHint').textContent = 'query_string 直查 · ' + st.selectedIndex; return; }
    if (mode === 'pit') { $('queryHint').textContent = pit ? 'PIT 已开启 · 可翻页' : '首次执行会打开 PIT（keep_alive=1m）'; return; }
    $('queryHint').textContent = st.selectedIndex + ' · ' + st.fields.length + ' fields · Ctrl/⌘+Enter 执行';
  }

  function parseDsl() {
    const text = $('queryInput').value.trim();
    let body;
    try { body = JSON.parse(text); } catch (e) { throw new Error('DSL JSON 不合法：' + e.message); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('DSL 必须是 JSON 对象');
    return body;
  }

  function stats(text) { $('resultStats').textContent = text; }

  function showError(err) {
    lastHits = [];
    lastRaw = null;
    $('resultArea').innerHTML = '<div class="empty"><div class="empty-icon">!</div><div>' + escapeHtml(String(err.message || err)) + '</div><div class="dim">检查索引、权限、CORS 或请求体</div></div>';
    stats('执行失败');
    app().toast(String(err.message || err), true);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function run() {
    const st = app().state;
    if (st.busy) return;
    if (!st.selectedIndex) { app().toast('请先连接并选择索引', true); return; }
    st.busy = true;
    $('runBtn').disabled = true;
    const started = performance.now();
    try {
      let res;
      if (mode === 'sql') {
        const sql = $('queryInput').value.trim();
        if (!sql) throw new Error('请输入 SQL');
        res = await app().es('/_sql?format=json', { method: 'POST', body: JSON.stringify({ query: sql }) });
        renderSql(res.data);
      } else if (mode === 'lucene') {
        const q = $('queryInput').value.trim();
        if (!q) throw new Error('请输入 Lucene 查询');
        res = await app().es('/' + encodeURIComponent(st.selectedIndex) + '/_search', {
          method: 'POST',
          body: JSON.stringify({ size: 50, query: { query_string: { query: q } } }),
        });
        renderSearch(res.data);
      } else if (mode === 'pit') {
        if (!pit) pit = await openPit(st.selectedIndex);
        res = await pitSearch(false);
      } else {
        const body = parseDsl();
        if ($('profileToggle').getAttribute('aria-pressed') === 'true') body.profile = true;
        res = await app().es('/' + encodeURIComponent(st.selectedIndex) + '/_search', { method: 'POST', body: JSON.stringify(body) });
        renderSearch(res.data);
      }
      const took = res.data && res.data.took != null ? res.data.took : Math.round(performance.now() - started);
      const total = totalOf(res.data);
      stats(mode === 'sql'
        ? 'SQL · ' + ((res.data && res.data.columns || []).length) + ' 列 · ' + ((res.data && res.data.rows || []).length) + ' 行 · ' + took + ' ms'
        : '命中 ' + C.formatNumber(total) + ' · took ' + C.formatMs(took) + (res.data && res.data._shards ? ' · shards ' + res.data._shards.successful + '/' + res.data._shards.total : ''));
      const entry = {
        ts: Date.now(), mode, index: st.selectedIndex,
        query: $('queryInput').value.slice(0, 2000), took,
        total: totalOf(res.data),
      };
      st.lastQuery = entry;
      st.lastResult = res.data;
      await app().addHistory(entry);
    } catch (err) {
      showError(err);
    } finally {
      st.busy = false;
      $('runBtn').disabled = false;
      updateHint();
    }
  }

  function totalOf(data) {
    if (!data) return 0;
    if (data.hits && data.hits.total) return typeof data.hits.total === 'object' ? data.hits.total.value : data.hits.total;
    if (Array.isArray(data.rows)) return data.rows.length;
    return 0;
  }

  async function openPit(index) {
    const res = await app().es('/' + encodeURIComponent(index) + '/_pit?keep_alive=1m', { method: 'POST' });
    const id = res.data && res.data.id;
    if (!id) throw new Error('PIT 响应缺少 id');
    $('pitInfo').textContent = 'PIT ' + id.slice(0, 18) + '…';
    return { id, searchAfter: null, index };
  }

  async function pitSearch(next) {
    const body = parseDsl();
    body.size = body.size || 20;
    body.pit = { id: pit.id };
    if (next && pit.searchAfter) body.search_after = pit.searchAfter;
    const res = await app().es('/_search', { method: 'POST', body: JSON.stringify(body) });
    const hits = (res.data && res.data.hits && res.data.hits.hits) || [];
    const last = hits[hits.length - 1];
    pit.searchAfter = last && last.sort ? last.sort : null;
    $('pitInfo').textContent = 'PIT ' + pit.id.slice(0, 18) + '… · 本批 ' + hits.length + ' 条' + (pit.searchAfter ? ' · 可继续' : ' · 已到末页');
    renderSearch(res.data);
    return res;
  }

  async function closePit(silent) {
    if (!pit) return;
    const current = pit;
    pit = null;
    try { await app().es('/_pit', { method: 'DELETE', body: JSON.stringify({ id: current.id }) }); } catch (_) { /* best effort */ }
    $('pitInfo').textContent = 'PIT 未开启';
    if (!silent) app().toast('PIT 已关闭');
  }

  function renderSearch(data) {
    lastRaw = data;
    lastHits = (data && data.hits && data.hits.hits) || [];
    lastColumns = C.collectColumns(lastHits);
    resultView = 'table';
    renderTable();
  }

  function renderTable() {
    $('viewTableBtn').classList.add('on');
    $('viewJsonBtn').classList.remove('on');
    if (!lastHits.length) {
      $('resultArea').innerHTML = '<div class="empty"><div class="empty-icon">∅</div><div>0 条命中</div></div>';
      return;
    }
    const cols = lastColumns;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['#', '_id', '_score', ...cols, ''].forEach((c) => { const th = document.createElement('th'); th.textContent = c; hr.appendChild(th); });
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    lastHits.forEach((hit, i) => {
      const tr = document.createElement('tr');
      const idx = document.createElement('td'); idx.textContent = String(i + 1); idx.className = 'num'; tr.appendChild(idx);
      const id = document.createElement('td'); id.textContent = hit._id || '-'; tr.appendChild(id);
      const score = document.createElement('td'); score.textContent = hit._score != null ? Number(hit._score).toFixed(3) : '—'; score.className = 'num'; tr.appendChild(score);
      for (const c of cols) {
        const td = document.createElement('td');
        td.textContent = C.cellText(c === '_source' ? hit._source : (hit._source || {})[c]);
        td.title = td.textContent;
        tr.appendChild(td);
      }
      const act = document.createElement('td');
      const btn = document.createElement('button'); btn.className = 'btn ghost xs'; btn.textContent = '解释';
      btn.onclick = () => explain(hit);
      const raw = document.createElement('button'); raw.className = 'btn ghost xs'; raw.textContent = 'JSON';
      raw.onclick = () => openDialog('命中 JSON', JSON.stringify(hit, null, 2));
      act.append(btn, raw);
      tr.appendChild(act);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    $('resultArea').innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'table-wrap'; wrap.appendChild(table);
    $('resultArea').appendChild(wrap);
  }

  function renderSql(data) {
    lastRaw = data;
    lastHits = [];
    lastColumns = (data && data.columns || []).map((c) => c.name || c);
    const rows = data && data.rows || [];
    const table = document.createElement('table');
    const thead = document.createElement('thead'); const hr = document.createElement('tr');
    lastColumns.forEach((c) => { const th = document.createElement('th'); th.textContent = c; hr.appendChild(th); });
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((v) => { const td = document.createElement('td'); td.textContent = C.cellText(v); tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    $('resultArea').innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'table-wrap'; wrap.appendChild(table);
    $('resultArea').appendChild(wrap);
    $('resultStats').textContent = 'SQL · ' + lastColumns.length + ' 列 · ' + rows.length + ' 行';
  }

  function showJson() {
    resultView = 'json';
    $('viewJsonBtn').classList.add('on');
    $('viewTableBtn').classList.remove('on');
    $('resultArea').innerHTML = '<pre class="json-view">' + escapeHtml(JSON.stringify(lastRaw, null, 2)) + '</pre>';
  }

  async function explain(hit) {
    try {
      const body = parseDsl();
      const query = body.query || { match_all: {} };
      const res = await app().es('/' + encodeURIComponent(app().state.selectedIndex) + '/_explain/' + encodeURIComponent(hit._id), {
        method: 'POST', body: JSON.stringify({ query }),
      });
      openDialog('Score explain · ' + hit._id, JSON.stringify(res.data, null, 2));
    } catch (err) { app().toast(String(err.message || err), true); }
  }

  function openDialog(title, text) {
    $('dialogTitle').textContent = title;
    $('dialogBody').textContent = text;
    $('jsonDialog').showModal();
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportCsv() {
    if (!lastHits.length) return app().toast('没有可导出的结果', true);
    download('esquerystudio-' + Date.now() + '.csv', C.toCsv(lastHits, ['_id', '_score', ...lastColumns]), 'text/csv');
  }
  function exportJson() {
    if (!lastRaw) return app().toast('没有可导出的结果', true);
    download('esquerystudio-' + Date.now() + '.json', JSON.stringify(lastRaw, null, 2), 'application/json');
  }

  function openPrefill(nextMode, text) {
    setMode(nextMode === 'dsl' ? 'dsl' : 'lucene');
    $('queryInput').value = String(text || '');
    drafts[mode] = $('queryInput').value;
    saveDrafts();
    updateMeta();
    if (nextMode === 'dsl') {
      try { parseDsl(); } catch (_) { /* keep the text as-is for editing */ }
    }
  }

  function loadEntry(entry) {
    if (!entry) return;
    setMode(entry.mode || 'dsl');
    $('queryInput').value = entry.query || '';
    if (entry.index && app().state.indices.some((i) => i.index === entry.index)) {
      app().state.selectedIndex = entry.index;
      $('indexSelect').value = entry.index;
    }
    updateHint();
  }


  const FIELD_CLAUSES = new Set(['term','match','match_phrase','range','exists','terms','wildcard','prefix','regexp','fuzzy','match_bool_prefix','match_phrase_prefix','ids','geo_distance','geo_bounding_box','geo_shape','shape','rank_feature','distance_feature']);
  const CLAUSE_OPTIONS = new Set(['boost','_name','case_insensitive','rewrite','analyzer','search_analyzer','fuzziness','operator','minimum_should_match','slop','zero_terms_query','lenient','time_zone','format','relation','unit','distance','validation_method','ignore_unmapped']);

  function fieldMap() { return new Map((app().state.fields || []).map((f) => [f.name, f.type])); }
  function fieldType(name) {
    const map = fieldMap();
    if (map.has(name)) return map.get(name);
    const base = String(name || '').split('.').slice(0, -1).join('.');
    return map.get(base) || '';
  }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  function collectFieldIssues(body, issues) {
    const fields = fieldMap();
    if (!fields.size) return;
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (FIELD_CLAUSES.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
          for (const name of Object.keys(value)) {
            if (CLAUSE_OPTIONS.has(name) || name === 'query' || name === 'fields') continue;
            if (name === '_id') continue;
            if (!fields.has(name)) {
              issues.push({ level: 'err', text: '字段不存在: ' + name });
            } else if (fieldType(name) === 'text' && (key === 'term' || key === 'terms' || key === 'prefix' || key === 'wildcard' || key === 'regexp')) {
              issues.push({ level: 'warn', text: name + ' 是 text，精确匹配建议用 ' + name + '.keyword' });
            }
          }
        }
        if (key === 'sort' && Array.isArray(value)) {
          for (const item of value) {
            if (!item || typeof item !== 'object') continue;
            for (const name of Object.keys(item)) {
              if (name === '_score') continue;
              if (!fields.has(name)) issues.push({ level: 'err', text: '排序字段不存在: ' + name });
              else if (fieldType(name) === 'text') issues.push({ level: 'warn', text: name + ' 是 text，排序建议用 .keyword' });
            }
          }
        }
        if ((key === 'aggs' || key === 'aggregations') && value && typeof value === 'object') {
          for (const agg of Object.values(value)) {
            if (!agg || typeof agg !== 'object') continue;
            for (const type of ['terms','date_histogram','histogram','cardinality','avg','sum','min','max']) {
              const def = agg[type];
              if (def && typeof def === 'object' && def.field && !fields.has(def.field)) issues.push({ level: 'err', text: '聚合字段不存在: ' + def.field });
            }
          }
        }
        visit(value);
      }
    };
    visit(body);
  }

  function renderLint(body, error) {
    const bar = $('lintBar');
    if (error) {
      bar.className = 'lint-bar err'; bar.textContent = 'DSL 不合法：' + error.message; return;
    }
    if (mode === 'sql' || mode === 'lucene') { bar.className = 'lint-bar hidden'; return; }
    const issues = [];
    collectFieldIssues(body, issues);
    if (!app().state.fields.length) { bar.className = 'lint-bar'; bar.textContent = 'mapping 未加载，暂不做字段校验'; return; }
    if (!issues.length) { bar.className = 'lint-bar ok'; bar.textContent = '语法 OK · 字段均存在 · 可执行'; return; }
    bar.className = 'lint-bar ' + (issues.some((i) => i.level === 'err') ? 'err' : '');
    bar.textContent = (issues.some((i) => i.level === 'err') ? '错误：' : '提示：')
      + issues.slice(0, 4).map((i) => i.text).join('；') + (issues.length > 4 ? '；…' : '');
  }

  function clauseLabel(name, value) {
    if (!value || typeof value !== 'object') return name;
    if (name === 'bool' || name === 'match_all' || name === 'query_string' || name === 'multi_match') return name;
    const keys = Object.keys(value).filter((k) => !CLAUSE_OPTIONS.has(k) && k !== 'query');
    if (['range','term','match','exists','match_phrase','wildcard','prefix','regexp'].includes(name)) return name + ' ' + (keys[0] || 'field');
    return name + (keys.length ? ' ' + keys[0] : '');
  }

  function renderSummary(body) {
    const box = $('dslSummary');
    if (mode === 'sql') { box.textContent = 'SQL 模式 · 结果列由 _sql 返回'; return; }
    if (mode === 'lucene') { box.textContent = 'Lucene · query_string'; return; }
    if (!body || typeof body !== 'object') { box.textContent = '等待查询'; return; }
    const bits = [];
    const q = body.query;
    if (q && q.bool && typeof q.bool === 'object') {
      bits.push('bool');
      for (const section of ['must','filter','should','must_not']) {
        const arr = q.bool[section];
        if (Array.isArray(arr) && arr.length) {
          bits.push(section + '[' + arr.map((n) => clauseLabel(Object.keys(n)[0] || '?', Object.values(n)[0])).join(', ') + ']');
        }
      }
    } else if (q && typeof q === 'object') {
      const key = Object.keys(q)[0];
      bits.push(clauseLabel(key, q[key]));
    }
    if (body.size != null) bits.push('size=' + body.size);
    if (Array.isArray(body.sort) && body.sort.length) bits.push('sort×' + body.sort.length);
    if (body.aggs || body.aggregations) bits.push('aggs×' + Object.keys(body.aggs || body.aggregations || {}).length);
    box.textContent = bits.length ? '语句 · ' + bits.join('  ·  ') : '语法对象';
  }


  function treeRow(kind, label, detail, depth) {
    const row = document.createElement('div');
    row.className = 'tree-node' + (kind === 'section' ? ' section' : '');
    row.style.paddingLeft = (depth * 14) + 'px';
    const dot = document.createElement('span'); dot.className = 'tn-dot';
    const k = document.createElement('span'); k.className = 'tn-kind'; k.textContent = label;
    row.append(dot, k);
    if (detail) { const d = document.createElement('span'); d.className = 'tn-detail'; d.textContent = detail; row.appendChild(d); }
    return row;
  }

  function renderTree(body) {
    const box = $('dslTree');
    const count = $('treeCount');
    box.innerHTML = '';
    if (!body || typeof body !== 'object' || !body.query) {
      const empty = document.createElement('div'); empty.className = 'tree-empty'; empty.textContent = 'JSON 完整后显示条件树'; box.appendChild(empty);
      count.textContent = '0'; return;
    }
    let clauses = 0;
    const addClause = (name, value, depth) => {
      clauses++;
      const label = Object.keys(value || {})[0] || '?';
      const raw = value && typeof value === 'object' ? value[label] : value;
      const detail = raw === undefined ? '' : JSON.stringify(raw).slice(0, 90);
      box.appendChild(treeRow('clause', name + ' · ' + label, detail, depth));
    };
    const visit = (node, depth) => {
      if (!node || typeof node !== 'object') return;
      const entries = Object.entries(node);
      if (!entries.length) return;
      const [name, value] = entries[0];
      if (name === 'bool' && value && typeof value === 'object') {
        box.appendChild(treeRow('section', 'bool', '', depth));
        for (const section of ['must','filter','should','must_not']) {
          const arr = value[section];
          if (!Array.isArray(arr) || !arr.length) continue;
          box.appendChild(treeRow('section', section, '×' + arr.length, depth + 1));
          for (const clause of arr) {
            const c = Object.keys(clause || {})[0];
            if (c) addClause(c, clause[c], depth + 2);
          }
        }
        return;
      }
      if (name === 'function_score' || name === 'boosting' || name === 'dis_max' || name === 'constant_score') {
        box.appendChild(treeRow('section', name, '', depth));
        const inner = value.query || value.positive || value.queries;
        if (Array.isArray(inner)) inner.forEach((q) => visit(q, depth + 1));
        else if (inner) visit(inner, depth + 1);
        return;
      }
      addClause(name, value, depth);
    };
    visit(body.query, 0);
    const chips = document.createElement('div'); chips.className = 'tree-chips';
    for (const [label, value] of [['size', body.size], ['sort', Array.isArray(body.sort) ? body.sort.length : null], ['aggs', Object.keys(body.aggs || body.aggregations || {}).length]]) {
      if (value == null || (label === 'aggs' && !value)) continue;
      const tag = document.createElement('span'); tag.className = 'chip'; tag.textContent = label + ' ' + value; chips.appendChild(tag);
    }
    if (chips.children.length) box.appendChild(chips);
    count.textContent = String(clauses);
  }

  function updateMeta() {
    const text = $('queryInput').value.trim();
    if (!text) { $('dslSummary').textContent = '等待查询'; $('lintBar').className = 'lint-bar hidden'; renderTree(null); return; }
    if (mode === 'sql' || mode === 'lucene') { renderSummary(null); $('lintBar').className = 'lint-bar hidden'; renderTree(null); return; }
    let body;
    try { body = JSON.parse(text); } catch (e) { $('dslSummary').textContent = '语法未完成'; renderTree(null); renderLint(null, e); return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { $('dslSummary').textContent = 'DSL 必须是对象'; renderLint(null, new Error('DSL 必须是 JSON 对象')); return; }
    renderSummary(body);
    renderTree(body);
    renderLint(body);
  }

  function populateFields() {
    const sel = $('fieldSelect');
    const fields = app().state.fields || [];
    sel.innerHTML = '<option value="">字段…</option>';
    for (const f of fields) {
      const opt = document.createElement('option');
      opt.value = f.name; opt.textContent = f.name + ' · ' + f.type;
      sel.appendChild(opt);
    }
  }

  function insertField() {
    const name = $('fieldSelect').value;
    if (!name) return;
    const el = $('queryInput');
    const start = el.selectionStart || 0;
    el.setRangeText('"' + name + '"', start, el.selectionEnd || start, 'end');
    el.focus();
    $('fieldSelect').value = '';
    updateMeta();
  }

  function init() {
    document.querySelectorAll('.mode-tab').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    $('runBtn').onclick = run;
    $('queryInput').addEventListener('input', debounce(() => {
      drafts[mode] = $('queryInput').value;
      saveDrafts();
      updateMeta();
    }, 180));
    $('fieldSelect').onchange = insertField;
    $('formatBtn').onclick = () => {
      try { $('queryInput').value = JSON.stringify(parseDsl(), null, 2); updateMeta(); }
      catch (e) { app().toast(e.message, true); }
    };
    $('exampleBtn').onclick = () => { $('queryInput').value = TEMPLATES[mode] || TEMPLATES.dsl; updateHint(); updateMeta(); };
    $('profileToggle').onclick = () => {
      const on = $('profileToggle').getAttribute('aria-pressed') === 'true';
      $('profileToggle').setAttribute('aria-pressed', String(!on));
      $('profileToggle').classList.toggle('on', !on);
    };
    $('viewTableBtn').onclick = renderTable;
    $('viewJsonBtn').onclick = showJson;
    $('exportCsvBtn').onclick = exportCsv;
    $('exportJsonBtn').onclick = exportJson;
    $('clearResultBtn').onclick = () => { lastHits = []; lastRaw = null; $('resultArea').innerHTML = '<div class="empty"><div class="empty-icon">⌕</div><div>结果已清空</div></div>'; stats('尚无结果'); };
    $('pitNextBtn').onclick = () => { if (pit) pitSearch(true).catch((e) => app().toast(String(e.message || e), true)); else app().toast('当前没有打开的 PIT', true); };
    $('pitCloseBtn').onclick = () => closePit(false);
    document.querySelectorAll('[data-template]').forEach((b) => {
      b.onclick = () => {
        const t = b.dataset.template;
        const index = app().state.selectedIndex || 'your-index';
        const field = (app().state.fields[0] && app().state.fields[0].name) || 'field';
        const map = {
          match_all: { size: 20, query: { match_all: {} } },
          term: { size: 20, query: { term: { [field]: 'value' } } },
          range: { size: 20, query: { range: { [field]: { gte: 'now-7d' } } } },
          bool: { size: 20, query: { bool: { must: [{ term: { [field]: 'value' } }], filter: [{ exists: { field } }] } } },
          agg: { size: 0, aggs: { top: { terms: { field, size: 10 } } } },
          highlight: { size: 20, query: { match: { [field]: 'keyword' } }, highlight: { fields: { [field]: {} } } },
        };
        $('queryInput').value = JSON.stringify(map[t] || map.match_all, null, 2);
        updateHint();
      };
    });
    readDrafts();
    setMode(lastMode);
    populateFields();
    updateMeta();
  }

  window.ESQuery = { init, run, loadEntry, openPrefill, onIndexChanged: () => { updateHint(); populateFields(); updateMeta(); } };
})();
