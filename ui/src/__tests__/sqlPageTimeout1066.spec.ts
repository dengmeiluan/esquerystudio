/* 1066：SQL page_timeout——默认不写键，选择后进入请求 body；cursor 续页由 ES 忽略。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

const sqlLenient = vi.fn();
const sqlCursor = vi.fn();
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
      sqlCursor: (...a: any[]) => sqlCursor(...a),
      sqlClose: vi.fn(() => Promise.resolve({})),
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
const btn = (host: ParentNode, text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent?.includes(text))!;
const timeoutSelect = (host: ParentNode) => host.querySelector<HTMLSelectElement>('select.sq-to-i')!;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear(); localStorage.setItem('esquerystudio.pref.sql.lenient', 'true'); sessionStorage.clear();
  sqlLenient.mockReset(); sqlCursor.mockReset();
  sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT * FROM "i" LIMIT 5');
});
afterEach(() => { apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); apps.length = 0; });

describe('1066 SQL page_timeout', () => {
  it('选 30s → body 带 page_timeout', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const host = await mountView();
    const s = timeoutSelect(host);
    expect(s, 'page_timeout 选择器必须在场').toBeTruthy();
    s.value = '30s'; s.dispatchEvent(new Event('change'));
    await settle(4);
    btn(host, '执行').click(); await settle();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect(body.page_timeout).toBe('30s');
  });

  it('默认 → 不伪造 page_timeout 键', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const host = await mountView();
    expect(timeoutSelect(host).value).toBe('');
    btn(host, '执行').click(); await settle();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect('page_timeout' in body).toBe(false);
  });

  it('cursor 续页契约不变（只带 cursor + time_zone）', async () => {
    sqlLenient.mockResolvedValue({ columns: [{ name: 'n', type: 'long' }], rows: [[1]], cursor: 'c1' });
    sqlCursor.mockResolvedValue({ rows: [], cursor: null });
    const host = await mountView();
    const s = timeoutSelect(host); s.value = '1m'; s.dispatchEvent(new Event('change')); await settle(4);
    btn(host, '执行').click(); await settle();
    btn(host, '下一页').click(); await settle();
    expect(sqlCursor).toHaveBeenCalledWith('c1', undefined, undefined);
  });
});
