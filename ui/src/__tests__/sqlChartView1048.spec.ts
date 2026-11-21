/* 1048：SQL 结果区聚合分布图 + 行详情入口。
   两列 label+count 自动出图；三列明细不出图（不猜业务形状）。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

const sqlLenient = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      sqlLenient: (...a: any[]) => sqlLenient(...a),
      sqlTranslate: vi.fn(() => Promise.resolve({ size: 100, query: { match_all: {} } })),
      resolveSchema: vi.fn(() => Promise.resolve({ warnings: [] })),
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import SqlConsoleView from '../views/SqlConsoleView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const settle = async (n = 24) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView() {
  const app = createApp({ render: () => h(SqlConsoleView) });
  apps.push(app);
  app.use(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady(); app.use(router);
  const host = document.createElement('div'); document.body.appendChild(host); app.mount(host); await settle();
  return host;
}
const btn = (host: ParentNode, text: string) => {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(x => x.textContent?.includes(text));
  expect(b, `「${text}」按钮必须在场`).toBeTruthy();
  return b!;
};

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); localStorage.setItem('esquerystudio.pref.sql.lenient', 'true'); sessionStorage.clear(); sqlLenient.mockReset(); });
afterEach(() => { apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); apps.length = 0; });

describe('1048 SQL 聚合分布图', () => {
  it('两列 label+count → 分布图出现，标出组数与合计', async () => {
    sqlLenient.mockResolvedValue({
      columns: [{ name: 'industry', type: 'keyword' }, { name: 'cnt', type: 'long' }],
      rows: [['制造业', 42], ['金融业', 18]],
    });
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT industry, COUNT(*) AS cnt FROM "i" GROUP BY industry');
    const host = await mountView();
    btn(host, '执行').click(); await settle();
    const chart = host.querySelector('.sq-chart');
    expect(chart).toBeTruthy();
    expect(chart!.querySelectorAll('svg rect.agg-bar').length, '两根柱').toBe(2);
    expect(chart!.querySelector('.sq-chart-meta')!.textContent).toContain('industry → cnt');
    expect(chart!.querySelector('.sq-chart-meta')!.textContent).toContain('合计 60');
    expect(chart!.querySelector('svg'), 'AggBarChart SVG 在场').toBeTruthy();
  });

  it('三列明细结果不出图；折叠钮可收起图体', async () => {
    sqlLenient.mockResolvedValue({
      columns: [{ name: 'industry', type: 'keyword' }, { name: 'cnt', type: 'long' }, { name: 'note', type: 'text' }],
      rows: [['A', 1, 'x'], ['B', 2, 'y']],
    });
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT * FROM "i"');
    const host = await mountView();
    btn(host, '执行').click(); await settle();
    expect(host.querySelector('.sq-chart')).toBeNull();

    sqlLenient.mockResolvedValue({
      columns: [{ name: 'industry', type: 'keyword' }, { name: 'cnt', type: 'long' }],
      rows: [['A', 1], ['B', 2]],
    });
    btn(host, '执行').click(); await settle();
    const chart = host.querySelector('.sq-chart')!;
    const body = chart.querySelector('.sq-chart-body') as HTMLElement;
    expect(body.style.display).not.toBe('none');
    btn(chart, '收起').click(); await settle();
    expect(body.style.display).toBe('none');
    btn(chart, '展开').click(); await settle();
    expect(body.style.display).not.toBe('none');
  });

  it('1050：SELECT * 无 LIMIT → 成本提示；一键补 LIMIT 写回草稿', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const key = draftStorageKey({ route: 'sql-console' }, 'sql');
    sessionStorage.setItem(key, 'SELECT * FROM "i"');
    const host = await mountView();
    const hint = host.querySelector('.sq-cost-hint');
    expect(hint?.textContent).toContain('SELECT *');
    expect(hint?.textContent).toContain('未加 LIMIT');
    btn(hint!, '补 LIMIT 1000').click();
    await settle();
    expect(sessionStorage.getItem(key)).toContain('LIMIT 1000');
  });

  it('结果表开启 row-drawer（右键行详情入口由通用表承接）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(src).toMatch(/<QueryResultTable[\s\S]*?row-drawer/);
  });
});
