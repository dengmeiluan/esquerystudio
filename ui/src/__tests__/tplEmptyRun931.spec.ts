/**
 * 九百三十一批（轨6 走查批 · SearchTemplatesView 0 命中空态刀）：
 * 结果表面层以 hits.length 门控，执行成功但 0 命中时 QRT（内建「无命中」空态
 * 与 empty-text/empty-hint 道具）整块不渲染，回落到开屏引导空态
 * 「把常用查询存成模板…」——刚执行完查询的用户看到新手引导，语义错位；
 * QRT 空态道具成死道具（LuceneQueryView 按 viewMode 门控=QRT 可空态呈现的既有范式）。
 * 修=ran 门控：执行过查询（含 0 命中）即由 QRT 呈现，0 命中走其内建空态；
 * 开屏引导仅在「未执行且未渲染」时出现；pick/newTemplate 复位 ran 回引导态。
 *   A 初始态：引导空态在场、QRT 空态缺席。
 *   B 0 命中执行：QRT 内建「无命中」空态在场、引导空态退场。
 *   C 新建模板复位：引导空态回归、QRT 空态退场。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* monaco editor.api stub——MonacoEditor 静态 import 链斩断（661 spec 谱系照抄） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const fakeEditor = {
    onDidChangeModelContent: () => ({ dispose() {} }),
    addAction: () => {},
    getValue: () => '',
    setValue: () => {},
    updateOptions: () => {},
    getAction: () => null,
    getSelection: () => null,
    executeEdits: () => {},
    focus: () => {},
    deltaDecorations: () => [],
    getModel: () => null,
    dispose: () => {},
  };
  return {
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      registerHoverProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {},
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/format/browser/formatActions', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/comment/browser/comment', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));

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
      resolveSchema: vi.fn(() => Promise.resolve({ warnings: [] })),
      listStoredScripts: vi.fn(() => Promise.resolve({
        scripts: { 'tpl-a': { lang: 'mustache', source: '{"query":{"match_all":{}}}' } },
      })),
      searchTemplate: vi.fn(() => Promise.resolve({ took: 3, hits: { total: { value: 0 }, hits: [] } })),
    },
  };
});

import SearchTemplatesView from '../views/SearchTemplatesView.vue';
import { useAppStore } from '../stores/app';

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
  const app = createApp({ render: () => h(SearchTemplatesView as never) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  const store = useAppStore(pinia);
  vi.spyOn(store, 'notify');
  return { host, store };
}

const ONBOARD = '把常用查询存成模板';
const EMPTY_HIT = '无命中';

beforeEach(async () => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/?idx=idx-a';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/?idx=idx-a');
  const { api } = await import('../api');
  (api.listStoredScripts as ReturnType<typeof vi.fn>).mockClear();
  (api.searchTemplate as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('0 命中执行走 QRT 内建空态，开屏引导仅未执行时在场（九百三十一批）', () => {
  it('A · 初始态：引导空态在场、QRT 空态缺席', async () => {
    const { host } = await mountView();
    expect(host.textContent, '开屏引导空态在场').toContain(ONBOARD);
    expect(host.textContent, '未执行不得出现「无命中」').not.toContain(EMPTY_HIT);
  });

  it('B · 0 命中执行：QRT「无命中」空态在场、引导空态退场', async () => {
    const { host } = await mountView();
    const inp = host.querySelector<HTMLInputElement>('.st-param-in');
    expect(inp, '默认模板参数行在场').toBeTruthy();
    inp!.value = '1';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    const runBtn = host.querySelector<HTMLButtonElement>('button.btn-run-lock');
    expect(runBtn, '执行查询钮在场且可点').toBeTruthy();
    expect(runBtn!.disabled, 'index 已从 URL 取到，钮可点').toBe(false);
    runBtn!.click();
    await settle();
    const { api } = await import('../api');
    expect(api.searchTemplate, '执行请求已发出').toHaveBeenCalledTimes(1);
    expect(host.textContent, '0 命中走 QRT 内建空态').toContain(EMPTY_HIT);
    expect(host.textContent, '刚执行完不得回落开屏引导').not.toContain(ONBOARD);
  });

  it('C · 新建模板复位：引导空态回归、QRT 空态退场', async () => {
    const { host } = await mountView();
    const inp = host.querySelector<HTMLInputElement>('.st-param-in')!;
    inp.value = '1';
    inp.dispatchEvent(new Event('input'));
    await settle();
    host.querySelector<HTMLButtonElement>('button.btn-run-lock')!.click();
    await settle();
    expect(host.textContent).toContain(EMPTY_HIT);
    const newBtn = host.querySelector<HTMLButtonElement>('button[aria-label="新建模板"]');
    expect(newBtn, '新建模板钮在场').toBeTruthy();
    newBtn!.click();
    await settle();
    expect(host.textContent, '复位后开屏引导回归').toContain(ONBOARD);
    expect(host.textContent, '复位后 QRT 空态退场').not.toContain(EMPTY_HIT);
  });
});
