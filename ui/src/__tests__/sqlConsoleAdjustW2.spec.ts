/**
 * W2 批：SqlConsoleView 三处封死解锁 + SQL 补全单例接入。
 *
 *  ① 模板侧栏可折叠（554 批双钮合一同步更新：工具行常驻单钮 data-sq-rail-toggle，随态换文案）
 *     + 宽度三档（data-sq-rail-w，usePref sql.railW）；
 *  ② 结果表高度档（data-sq-result-h，usePref sql.resultH，默认 500=原写死值）；
 *  ③ DSL 预览高度档（data-sq-code-h，usePref sql.codeH，默认 300=原 .sq-code 写死值）；
 *  ④ SQL 补全单例：onMounted ensure / onBeforeUnmount dispose（源码锁，行为契约在
 *     utils/__tests__/sqlCompletionW2.spec.ts 行级锁定）。
 *
 * MonacoEditor 整体 stub（restComments 范式，斩断 monaco import 链之外不动其它）；
 * QueryResultTable 真件挂载（cols 空不出表格，高度档落 usePref 断言）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

function btn(host: ParentNode, sel: string): HTMLButtonElement {
  const b = host.querySelector<HTMLButtonElement>(sel);
  expect(b, sel + ' 必须在场').toBeTruthy();
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

describe('W2 批：SqlConsole 布局可调 + 补全单例', () => {
  it('① 模板侧栏可折叠：收起→模板卡出 DOM+偏好落盘；展开→恢复（554 双钮合一同步更新：单 toggle 翻转）', async () => {
    const host = await mountView();
    expect(host.querySelector('.sq-samples'), '默认侧栏在').toBeTruthy();
    btn(host, '[data-sq-rail-toggle]').click();
    await settle();
    expect(host.querySelector('.sq-samples'), '收起后模板卡必须出 DOM').toBeNull();
    expect(localStorage.getItem('esquerystudio.pref.sql.railOpen')).toBe('false');
    expect(host.querySelector('.sq-grid')!.classList.contains('rail-off')).toBe(true);
    btn(host, '[data-sq-rail-toggle]').click();
    await settle();
    expect(host.querySelector('.sq-samples'), '展开后模板卡回来').toBeTruthy();
    expect(localStorage.getItem('esquerystudio.pref.sql.railOpen')).toBe('true');
  });

  it('① 宽度三档：默认 300 → 点宽 → 360 落盘 + --sq-rail-w 内联变量', async () => {
    const host = await mountView();
    expect(host.querySelector('.sq-grid')!.getAttribute('style')).toContain('--sq-rail-w: 300px');
    btn(host, '[data-sq-rail-w]').click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.sql.railW')).toBe('360');
    expect(host.querySelector('.sq-grid')!.getAttribute('style')).toContain('--sq-rail-w: 360px');
  });

  it('② 结果表高度档：执行出结果卡 → 默认 500 → 点高 → 800 落盘（max-height 动态绑定源码锁）', async () => {
    const { api } = await import('../api');
    (api.sqlLenient as ReturnType<typeof vi.fn>).mockResolvedValue({ columns: [{ name: 'id', type: 'long' }], rows: [[1]] });
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const host = await mountView();
    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('执行'));
    expect(run, '「执行」按钮必须在场').toBeTruthy();
    run!.click();
    await settle();
    /* 五百四十三批：sq-card 壳退役→结果卡 sq-sec border-top 分节，锁同步更新 */
    expect(host.querySelector('.sq-sec.wide'), '结果卡必须出').toBeTruthy();
    /* 1353/1354：独立高度档钮进「结果表更多 ⋯」菜单（工具栏平铺收口），
       默认档也从 500 改为「填满剩余空间」。本条意图不变：换档要真的落盘并作用到表格上。 */
    btn(host, '[data-test="sq-bar-more"]').click();
    await settle();
    const t = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(t, '默认档必须是填满').toMatch(/useTierCycle\('sql\.resultH', RESULT_H_TIERS, 'fill'\)/);
    /* 选 800 档 */
    const pick800 = Array.from(host.querySelectorAll<HTMLButtonElement>('.sq-bar-more .qrt-mi'))
      .find(b => (b.textContent || '').trim() === '800px');
    expect(pick800, '菜单里必须有 800px 档').toBeTruthy();
    pick800!.click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.sql.resultH')).toBe('800');
    const v = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(v).toContain(':max-height="resultMaxHeight"');
    expect(v).toContain(':min-height="resultMinHeight"');
  });

  it('③ DSL 预览高度档：转 DSL 出卡 → 默认 300 → 点高 → 500 落盘 + 内联 maxHeight', async () => {
    const { api } = await import('../api');
    /* 「转 DSL」按钮 :disabled="!sql.trim()" —— 预置 SQL 草稿（useScopedDraft 草稿通道） */
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const host = await mountView();
    (api.sqlTranslate as ReturnType<typeof vi.fn>).mockClear();
    /* 转 DSL 走文字查找（头部主钮是「执行」） */
    const translate = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('转 DSL'));
    expect(translate, '「转 DSL」按钮必须在场').toBeTruthy();
    translate!.click();
    await settle();
    const code = host.querySelector<HTMLElement>('.sq-code');
    expect(code, 'DSL 预览卡必须出').toBeTruthy();
    expect(code!.style.maxHeight).toBe('300px');
    btn(host, '[data-sq-code-h]').click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.sql.codeH')).toBe('500');
    expect(host.querySelector<HTMLElement>('.sq-code')!.style.maxHeight).toBe('500px');
  });

  it('④ SQL 补全单例接线（源码锁）：挂载 ensure / 卸载 dispose', () => {
    const v = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(v).toContain("sqlCompletion = ensureSqlCompletion(monaco, sqlCtx)");
    expect(v).toMatch(/onBeforeUnmount\(\(\) => \{ sqlCompletion\?\.dispose\(\); sqlCompletion = null; \}\)/);
    /* 1080：字段源从「顶栏选中」改为「FROM 优先」的有效索引 */
    expect(v).toMatch(/const sqlFieldsCtx = useIndexFields\(\(\) => effectiveSqlIndex\.value\)/);
  });
});
