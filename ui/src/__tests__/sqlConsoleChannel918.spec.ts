/**
 * SQL 控制台执行链双通道契约 + 执行态归位 + 目标索引提取锚定。
 *
 *  ① 双通道契约：ES SQL 查询级失败（异常直传）必须走 runErr 错误面板（可回看+重试），
 *     「available:false 能力降级」才走不可用自救面板——后端把查询级 400 甄别直传后，
 *     前端两通道各自语义锁死，防止重构串道；
 *  ② 执行态归位：「取消」钮与「执行中（N s）…」读秒标签只随执行链（useQueryRun.running），
 *     字段体检/转 DSL/分页等共享 busy 的旁路操作不再出现示能死钮与误导读秒；
 *  ③ 目标索引提取 FROM 锚定：SELECT 列表的引号串（列名）不作数，字段体检/历史推导
 *     认 FROM 后第一个双引号标识符。
 *
 * 挂载范式同 sqlConsoleAdjustW2（MonacoEditor stub + 草稿 sessionStorage 预置）。
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

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear(); localStorage.setItem('esquerystudio.pref.sql.lenient', 'true');
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('SQL 控制台执行链双通道 + 执行态归位 + 索引提取', () => {
  it('① 异常直传走错误面板：reject → 「SQL 执行失败」面板+重试钮在场，不可用自救面板不在', async () => {
    const { api } = await import('../api');
    (api.sqlLenient as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ES 400 verification_exception: Unknown column [ts]'));
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT * FROM "i" ORDER BY ts');
    const host = await mountView();
    btnByText(host, '执行').click();
    await settle();
    const errPanel = host.querySelector('.sq-alert');
    expect(errPanel, '错误面板必须出场').toBeTruthy();
    expect(errPanel!.textContent).toContain('SQL 执行失败');
    expect(Array.from(errPanel!.querySelectorAll('button')).find(b => b.textContent?.includes('重试'))).toBeTruthy();
    expect(host.textContent!, '不可用自救面板不得串道').not.toContain('_sql 接口不可用');
  });

  it('① 能力降级走自救面板：available:false → 「_sql 接口不可用」面板+探测钮在场', async () => {
    const { api } = await import('../api');
    (api.sqlLenient as ReturnType<typeof vi.fn>).mockResolvedValue({ available: false, reason: '405', hint: '未启用' });
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const host = await mountView();
    btnByText(host, '执行').click();
    await settle();
    const alert = host.querySelector('.sq-alert');
    expect(alert, '不可用自救面板必须出场').toBeTruthy();
    expect(alert!.textContent).toContain('_sql 接口不可用');
    expect(Array.from(alert!.querySelectorAll('button')).find(b => b.textContent?.includes('探测'))).toBeTruthy();
  });

  it('② 字段体检期间不出现「执行中」读秒与取消钮（busy 共享混态归位）', async () => {
    const { api } = await import('../api');
    (api.resolveSchema as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => { /* pending */ }));
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT * FROM "idx-a"');
    const host = await mountView();
    btnByText(host, '字段体检').click();
    await settle();
    const run = btnByText(host, '执行');
    expect(run.textContent, '字段体检不是执行链，不得显示执行中读秒').not.toContain('执行中');
    expect(run.textContent!.trim(), '执行中读秒只随执行链（useQueryRun.running）').toBe('执行 Ctrl+⏎');
    expect(Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('取消')),
      '取消钮只随执行链，字段体检期间不得示能出现').toBeUndefined();
    expect(run.disabled, '并发闸门保留：旁路操作期间执行钮仍须禁用').toBe(true);
  });

  it('② 执行链期间取消钮在场+执行中读秒（既有契约锁）', async () => {
    const { api } = await import('../api');
    (api.sqlLenient as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => { /* pending */ }));
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const host = await mountView();
    btnByText(host, '执行').click();
    await settle();
    expect(btnByText(host, '执行').textContent).toContain('执行中');
    expect(Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('取消'))).toBeTruthy();
  });

  it('③ 目标索引提取 FROM 锚定：SELECT 列表的引号列名不作数', async () => {
    const { api } = await import('../api');
    let captured: string | null = null;
    (api.resolveSchema as ReturnType<typeof vi.fn>).mockImplementation((idx: string) => {
      captured = idx;
      return new Promise(() => { /* pending：停在 busy 便于断言时点 */ });
    });
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'),
      'SELECT "status", COUNT(*) FROM "real-idx" GROUP BY status LIMIT 10');
    const host = await mountView();
    btnByText(host, '字段体检').click();
    await settle();
    expect(captured, '字段体检必须探测 FROM 后的目标索引，而非 SELECT 列表的引号列名').toBe('real-idx');
  });
});
