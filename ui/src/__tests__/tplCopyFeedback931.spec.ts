/**
 * 九百三十一批（轨6 走查批 · SearchTemplatesView 复制反馈刀）：
 * copyRendered 对 copyText 的 false 返回值不甄别、恒报「已复制 DSL」——剪贴板
 * 被拒（无权限/无焦点）时用户得到假成功反馈；同文件 replayTplRow 已按 ok 分支
 * 报「复制失败」=同文件两口径。修=copyRendered 与 replayTplRow 同语言：
 * ok ? '已复制 DSL' : '复制失败'。
 *   A copyText=false → error「复制失败」，零 success。
 *   B copyText=true → success「已复制 DSL」。
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

vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: vi.fn(async () => false) };
});

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
      listStoredScripts: vi.fn(() => Promise.resolve({ scripts: {} })),
      renderTemplate: vi.fn(() => Promise.resolve({ template_output: { size: 1, query: { match_all: {} } } })),
    },
  };
});

import SearchTemplatesView from '../views/SearchTemplatesView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountWithRendered() {
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
  const renderBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('预览渲染'));
  expect(renderBtn, '预览渲染钮在场').toBeTruthy();
  renderBtn!.click();
  await settle();
  const copyBtn = host.querySelector<HTMLButtonElement>('button[aria-label="复制 DSL"]');
  expect(copyBtn, '渲染卡「复制 DSL」钮在场（渲染成功前提）').toBeTruthy();
  return { host, store, copyBtn: copyBtn! };
}

beforeEach(async () => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/?idx=idx-a';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/?idx=idx-a');
  const { api } = await import('../api');
  (api.renderTemplate as ReturnType<typeof vi.fn>).mockClear();
  const fmt = await import('../utils/format');
  (fmt.copyText as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('复制 DSL 反馈随 copyText 真值（九百三十一批）', () => {
  it('A · copyText=false → error「复制失败」，零 success', async () => {
    const { store, copyBtn } = await mountWithRendered();
    copyBtn.click();
    await settle();
    const calls = (store.notify as ReturnType<typeof vi.fn>).mock.calls as any[];
    expect(calls.some(c => c[0] === 'success' && String(c[1]).includes('已复制 DSL')), '失败不得报成功').toBe(false);
    const err = calls.find(c => c[0] === 'error');
    expect(err, '失败须 error 出声').toBeTruthy();
    expect(String(err![1]), '失败文案=复制失败').toContain('复制失败');
  });

  it('B · copyText=true → success「已复制 DSL」', async () => {
    const fmt = await import('../utils/format');
    (fmt.copyText as ReturnType<typeof vi.fn>).mockImplementation(async () => true);
    const { store, copyBtn } = await mountWithRendered();
    copyBtn.click();
    await settle();
    const calls = (store.notify as ReturnType<typeof vi.fn>).mock.calls as any[];
    expect(calls.some(c => c[0] === 'success' && String(c[1]).includes('已复制 DSL')), '成功报已复制').toBe(true);
  });
});
