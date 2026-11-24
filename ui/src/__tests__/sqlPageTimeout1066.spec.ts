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
const timeoutSelect = (host: ParentNode) => host.querySelector('.sq-to-i')!;
const timeoutLabel = (host: ParentNode) => {
  const el = timeoutSelect(host)?.querySelector('.n-base-selection-input, .n-base-selection-label');
  return el?.textContent?.trim() ?? '';
};
/* W3c 随迁：原生 select 升档 NSelect——选项序 ['', 10s, 30s, 1m, 5m]；测试环境浮层
 不渲染、键盘态机可用，ArrowDown×N + Enter 选第 N 项（探针实证） */
const TO_ORDER = ['', '10s', '30s', '1m', '5m'];
async function setTimeoutOpt(host: ParentNode, v: string) {
  const idx = TO_ORDER.indexOf(v);
  expect(idx, `超时档 ${v} 必须在档位表内`).toBeGreaterThan(-1);
  const trig = timeoutSelect(host).querySelector('.n-base-selection') as HTMLElement;
  expect(trig, 'page_timeout 选择器必须在场').toBeTruthy();
  for (let k = 0; k <= idx; k++) {
    trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
  }
  trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle(4);
}

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
    await setTimeoutOpt(host, '30s');
    btn(host, '执行').click(); await settle();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect(body.page_timeout).toBe('30s');
  });

  it('默认 → 不伪造 page_timeout 键', async () => {
    sqlLenient.mockResolvedValue({ columns: [], rows: [] });
    const host = await mountView();
    /* W3c 随迁：默认档显示「默认」（原 select value='' 的档位语义） */
    expect(timeoutLabel(host)).toBe('默认');
    btn(host, '执行').click(); await settle();
    const body = JSON.parse(sqlLenient.mock.calls[0][0]);
    expect('page_timeout' in body).toBe(false);
  });

  it('cursor 续页契约不变（只带 cursor + time_zone）', async () => {
    sqlLenient.mockResolvedValue({ columns: [{ name: 'n', type: 'long' }], rows: [[1]], cursor: 'c1' });
    sqlCursor.mockResolvedValue({ rows: [], cursor: null });
    const host = await mountView();
    await setTimeoutOpt(host, '1m');
    btn(host, '执行').click(); await settle();
    btn(host, '下一页').click(); await settle();
    expect(sqlCursor).toHaveBeenCalledWith('c1', undefined, undefined);
  });
});
