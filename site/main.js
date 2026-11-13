const modes = {
  dsl: {
    label: 'DSL / QUERY BODY',
    state: 'VALID · 2.4ms',
    hits: '192',
    took: 'TOOK 12ms',
    code: `{
  <span class="tok-k">"query"</span>: {
    <span class="tok-k">"bool"</span>: {
      <span class="tok-k">"must"</span>: [
        { <span class="tok-s">"term"</span>:  { <span class="tok-s">"status"</span>: <span class="tok-v">"paid"</span> } },
        { <span class="tok-s">"range"</span>: { <span class="tok-s">"amount"</span>: { <span class="tok-k">"gte"</span>: <span class="tok-n">100</span> } } }
      ]
    }
  },
  <span class="tok-s">"sort"</span>: [{ <span class="tok-s">"paid_at"</span>: <span class="tok-v">"desc"</span> }],
  <span class="tok-s">"size"</span>: <span class="tok-n">20</span>
}`,
  },
  sql: {
    label: 'ES-SQL / STATEMENT',
    state: 'VALID · 4.1ms',
    hits: '192',
    took: 'TOOK 18ms',
    code: `<span class="tok-k">SELECT</span> order_id, amount, paid_at
<span class="tok-k">FROM</span> <span class="tok-v">"research_report"</span>
<span class="tok-k">WHERE</span> status = <span class="tok-v">'paid'</span>
  <span class="tok-k">AND</span> amount &gt;= <span class="tok-n">100</span>
<span class="tok-k">ORDER BY</span> paid_at <span class="tok-k">DESC</span>
<span class="tok-k">LIMIT</span> <span class="tok-n">20</span>`,
  },
  lucene: {
    label: 'LUCENE / EXPRESSION',
    state: 'VALID · 0.8ms',
    hits: '192',
    took: 'TOOK 9ms',
    code: `status:paid
  <span class="tok-k">AND</span> amount:[<span class="tok-n">100</span> <span class="tok-k">TO</span> *]
  <span class="tok-k">AND</span> -refunded:true
  <span class="tok-k">AND</span> title:(<span class="tok-v">"credit spread"</span>~<span class="tok-n">2</span>)`,
  },
  sandbox: {
    label: 'SANDBOX / RAW REQUEST',
    state: '200 OK · 6.2ms',
    hits: '192',
    took: 'TOOK 21ms',
    code: `<span class="tok-k">POST</span> /research_report/_search
{
  <span class="tok-s">"track_total_hits"</span>: <span class="tok-n">true</span>,
  <span class="tok-s">"_source"</span>: [<span class="tok-v">"order_id"</span>, <span class="tok-v">"amount"</span>, <span class="tok-v">"paid_at"</span>],
  <span class="tok-s">"query"</span>: { <span class="tok-s">"match_all"</span>: {} },
  <span class="tok-s">"highlight"</span>: { <span class="tok-s">"fields"</span>: { <span class="tok-s">"title"</span>: {} } }
}`,
  },
  pit: {
    label: 'PIT / SEARCH AFTER',
    state: 'CURSOR ACTIVE · 1.1ms',
    hits: '100',
    took: 'TOOK 14ms',
    code: `<span class="tok-k">POST</span> /research_report/_search
{
  <span class="tok-s">"size"</span>: <span class="tok-n">100</span>,
  <span class="tok-s">"pit"</span>: { <span class="tok-s">"id"</span>: <span class="tok-v">"mF9…"</span>, <span class="tok-s">"keep_alive"</span>: <span class="tok-v">"2m"</span> },
  <span class="tok-s">"search_after"</span>: [<span class="tok-n">1794181860</span>, <span class="tok-n">192</span>],
  <span class="tok-s">"sort"</span>: [{ <span class="tok-s">"paid_at"</span>: <span class="tok-v">"asc"</span> }]
}`,
  },
  bridge: {
    label: 'BRIDGE / SQL → DSL',
    state: 'TRANSLATED · 3 WARNINGS',
    hits: '192',
    took: 'SEMANTIC DIFF',
    code: `<span class="tok-c">-- SQL</span>
<span class="tok-k">SELECT</span> * <span class="tok-k">FROM</span> orders
<span class="tok-k">WHERE</span> amount &gt;= <span class="tok-n">100</span> <span class="tok-k">AND</span> status = <span class="tok-v">'paid'</span>

<span class="tok-c">// DSL</span>
{ <span class="tok-s">"query"</span>: { <span class="tok-s">"bool"</span>: { <span class="tok-s">"filter"</span>: [
  { <span class="tok-s">"range"</span>: { <span class="tok-s">"amount"</span>: { <span class="tok-s">"gte"</span>: <span class="tok-n">100</span> } } },
  { <span class="tok-s">"term"</span>: { <span class="tok-s">"status"</span>: <span class="tok-v">"paid"</span> } }
] } } }
<span class="tok-c">// 语义差异: NULL / 时区 / 排序稳定性</span>`,
  },
};

const rail = document.querySelector('.mode-rail');
const code = document.getElementById('mode-code');
const label = document.getElementById('mode-label');
const state = document.getElementById('mode-state');
const hits = document.getElementById('mode-hits');
const took = document.getElementById('mode-took');
const buttons = Array.from(document.querySelectorAll('.mode'));

function activate(name, focus = false) {
  const data = modes[name];
  if (!data) return;
  buttons.forEach((button) => {
    const active = button.dataset.mode === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  code.innerHTML = data.code;
  label.textContent = data.label;
  state.textContent = data.state;
  hits.textContent = data.hits;
  took.textContent = data.took;
  code.parentElement.classList.remove('mode-flash');
  void code.parentElement.offsetWidth;
  code.parentElement.classList.add('mode-flash');
}

buttons.forEach((button) => {
  button.addEventListener('click', () => activate(button.dataset.mode));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const index = buttons.indexOf(button);
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = buttons[(index + delta + buttons.length) % buttons.length];
    activate(next.dataset.mode, true);
  });
});

if (rail) {
  rail.addEventListener('keydown', (event) => {
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      activate(event.key === 'Home' ? buttons[0].dataset.mode : buttons[buttons.length - 1].dataset.mode, true);
    }
  });
}

activate('dsl');
