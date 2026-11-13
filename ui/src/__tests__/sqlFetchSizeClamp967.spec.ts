/**
 * 九百六十七批·刀③：SQL 控制台 fetch_size 构建体夹取兜底（ES 上限 10000）。
 *
 * 契约（验收锚）：输入框 max=10000 只是 HTML 表单属性，键入/偏好落盘的超限值
 * （v-model.number）会原样进请求体，ES SQL 对超限 fetch_size 直接 400——构建体
 * 时夹到 10000 兜底。上限内的值原样直通，非正数维持「不进构建体」既有语义。
 * ① 超限兜底：键入 99999 → 请求体 fetch_size=10000。
 * ② 上限内直通：默认 200 → fetch_size=200（防过夹回归锚）。
 * ③ 非正数不进构建体：0 → 无 fetch_size 键（既有语义锁）。
 *
 * 挂载范式同 sqlConsoleChannel918（MonacoEditor stub + 草稿 sessionStorage 预置）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

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
      sqlLenient: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
      sqlJson: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
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

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(SqlConsoleView) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function btnByText(host: ParentNode, text: string): HTMLButtonElement {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(x => x.textContent?.includes(text));
  expect(b, `「${text}」按钮必须在场`).toBeTruthy();
  return b!;
}

async function setFetchSize(host: ParentNode, v: string) {
  const input = host.querySelector<HTMLInputElement>('.sq-fs-i');
  expect(input, 'fetch_size 输入框必须在场').toBeTruthy();
  input!.value = v;
  input!.dispatchEvent(new Event('input'));
  await settle();
}

async function runBody(): Promise<any> {
  const { api } = await import('../api');
  return api.sqlLenient as ReturnType<typeof vi.fn>;
}

beforeEach(async () => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear(); localStorage.setItem('esquerystudio.pref.sql.lenient', 'true');
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  /* vi.mock 工厂单例的 mock.calls 跨用例累积——每用例清零，calls[0] 恒为本用例请求 */
  const { api } = await import('../api');
  (api.sqlLenient as ReturnType<typeof vi.fn>).mockClear();
  (api.sqlJson as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('九百六十七批·刀③：fetch_size 构建体夹取兜底', () => {
  it('① 超限兜底：键入 99999 → 请求体 fetch_size=10000', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const host = await mountView();
    await setFetchSize(host, '99999');
    btnByText(host, '执行').click();
    await settle();
    const mock = await runBody();
    expect(mock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mock.mock.calls[0][0]);
    expect(body.fetch_size, '超限值构建时夹到 ES 上限 10000').toBe(10000);
  });

  it('② 上限内直通：默认 200 → fetch_size=200（防过夹）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const host = await mountView();
    btnByText(host, '执行').click();
    await settle();
    const mock = await runBody();
    const body = JSON.parse(mock.mock.calls[0][0]);
    expect(body.fetch_size, '上限内值原样直通').toBe(200);
  });

  it('③ 非正数不进构建体：0 → 无 fetch_size 键（既有语义锁）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const host = await mountView();
    await setFetchSize(host, '0');
    btnByText(host, '执行').click();
    await settle();
    const mock = await runBody();
    const body = JSON.parse(mock.mock.calls[0][0]);
    expect(body, '非正数维持既有语义：不进构建体').not.toHaveProperty('fetch_size');
  });
});
