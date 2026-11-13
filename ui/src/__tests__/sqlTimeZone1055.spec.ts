/* 1055：SQL time_zone——首查/translate 写入 body，cursor 续页原样沿用（ES 续页只认 time_zone）。 */
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
const btn = (host: ParentNode, text: string) => {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(x => x.textContent?.includes(text));
  expect(b, `「${text}」按钮必须在场`).toBeTruthy();
  return b!;
};
const tzSelect = (host: ParentNode) => host.querySelector<HTMLSelectElement>('select.sq-tz-i')!;
async function setTz(host: ParentNode, v: string) {
  const s = tzSelect(host);
  expect(s, 'time_zone 选择器必须在场').toBeTruthy();
  s.value = v; s.dispatchEvent(new Event('change'));
  await settle(4);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear(); localStorage.setItem('esquerystudio.pref.sql.lenient', 'true'); sessionStorage.clear();
  sqlLenient.mockReset(); sqlCursor.mockReset();
  sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT * FROM "i" LIMIT 5');
});
afterEach(() => { apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); apps.length = 0; });

describe('1055 SQL time_zone', () => {
  it('选 Asia/Shanghai → 请求体带 time_zone', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const host = await mountView();
    await setTz(host, 'Asia/Shanghai');
    btn(host, '执行').click(); await settle();
    expect(sqlLenient).toHaveBeenCalled();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect(body.time_zone).toBe('Asia/Shanghai');
    expect(body.query).toContain('SELECT');
  });

  it('默认 UTC → 不伪造 time_zone 键', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const host = await mountView();
    expect(tzSelect(host).value).toBe('');
    btn(host, '执行').click(); await settle();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect('time_zone' in body).toBe(false);
  });

  it('cursor 续页沿用同一 time_zone', async () => {
    sqlLenient.mockResolvedValue({ columns: [{ name: 'n', type: 'long' }], rows: [[1]], cursor: 'c1' });
    sqlCursor.mockResolvedValue({ rows: [[2]], cursor: null });
    const host = await mountView();
    await setTz(host, 'Asia/Shanghai');
    btn(host, '执行').click(); await settle();
    btn(host, '下一页').click(); await settle();
    expect(sqlCursor).toHaveBeenCalledWith('c1', 'Asia/Shanghai', undefined);
  });
});
