/**
 * 九百二十九批（轨6 走查批 · IndexSettings/Mapping 复制兜底链同构刀）：
 * 两页 copyRaw 失败 toast 的「全选内容」动作以 new MouseEvent('click') 直调
 * selectAllRaw——构造事件的 currentTarget 恒为 null（事件未派发），
 * Range.selectNodeContents(null) 抛 TypeError：全选不执行、pre.focus 被跳过、
 * 异常冒泡全局 errorHandler 弹「渲染异常」（剪贴板被拦场景点兜底动作=二次失败）。
 * 修=selectAllRaw 事件实参 currentTarget 为空时回落 rawPreEl（主通道语义零变，
 * 构造直调通道走同一 ref 真身）。
 *   A IndexSettings 全链行为锚：展开 raw 面→点「复制全部」（copyText=false）→
 *     error toast action.onClick 不抛错+焦点在场；pre 本体点击主通道回归（rangeCount 在场）。
 *   B Mapping 同构全链（n-modal 内容 teleport 到 body，断言通道=document.body）。
 *   C 源码锁：两页 selectAllRaw 函数体含 currentTarget 空回落 rawPreEl 字面。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* monaco editor.api stub——MappingView 静态 import 链斩断（661 spec 谱系照抄） */
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
      clusterInspect: vi.fn(() => Promise.resolve({
        mappings: { properties: { title: { type: 'text' } } },
        settings: { index: { number_of_replicas: '1' } },
      })),
      indexSettings: vi.fn(() => Promise.resolve({
        'idx-a': { settings: { index: { number_of_replicas: '1' } }, defaults: { index: { refresh_interval: '1s' } } },
      })),
      insight: { ...actual.api.insight, settingsImpact: vi.fn(() => Promise.resolve({ items: [] })) },
    },
  };
});
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: vi.fn(async () => false) };
});

import IndexSettingsView from '../views/IndexSettingsView.vue';
import MappingView from '../views/MappingView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(view: unknown) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(view as never) });
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

function errorAction(store: { notify: unknown }): { onClick: () => void } {
  const calls = (store.notify as ReturnType<typeof vi.fn>).mock.calls as any[];
  const errCall = calls.find(c => c[0] === 'error');
  expect(errCall, '复制失败必须 error 出声').toBeTruthy();
  const action = errCall![2]?.action;
  expect(action?.onClick, '错误 toast 须携带「全选内容」动作').toBeTypeOf('function');
  return action;
}

beforeEach(async () => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/?idx=idx-a';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/?idx=idx-a');
  const { api } = await import('../api');
  (api.clusterInspect as ReturnType<typeof vi.fn>).mockClear();
  (api.indexSettings as ReturnType<typeof vi.fn>).mockClear();
  (api.resolveSchema as ReturnType<typeof vi.fn>).mockClear();
  const fmt = await import('../utils/format');
  (fmt.copyText as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('复制兜底链：失败 toast「全选内容」动作真实全选', () => {
  it('A · IndexSettings：兜底动作不抛错+焦点在场；pre 本体点击主通道回归', async () => {
    const { host, store } = await mountView(IndexSettingsView);
    const hd = host.querySelector<HTMLElement>('.is-raw-hd .card-t');
    expect(hd, '完整 settings 头行在场').toBeTruthy();
    hd!.click();
    await settle();
    const pre = host.querySelector<HTMLElement>('pre.is-raw-pre');
    expect(pre, '展开后完整 settings pre 在场').toBeTruthy();
    pre!.click();
    expect(document.getSelection()!.rangeCount, 'pre 本体点击主通道全选在场').toBeGreaterThan(0);
    document.getSelection()!.removeAllRanges();
    const focusSpy = vi.spyOn(pre!, 'focus');
    const copyBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => (b.title || '').includes('复制完整 settings'));
    expect(copyBtn, '复制全部钮在场').toBeTruthy();
    copyBtn!.click();
    await settle();
    const action = errorAction(store);
    expect(() => action.onClick(), '兜底动作不得抛错（构造事件 currentTarget 为空须回落 rawPre）').not.toThrow();
    expect(focusSpy, '全选后焦点回归 pre').toHaveBeenCalled();
  });

  it('B · Mapping 同构：raw 弹层（body 通道）兜底动作不抛错+焦点在场', async () => {
    const { store } = await mountView(MappingView);
    const rawBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('原始 JSON'));
    expect(rawBtn, '原始 JSON 钮在场').toBeTruthy();
    expect(rawBtn!.disabled, 'inspect 有数据后钮可点').toBe(false);
    rawBtn!.click();
    await settle();
    const pre = document.body.querySelector<HTMLElement>('pre.mp-raw');
    expect(pre, 'raw 弹层 pre teleport 到 body').toBeTruthy();
    const focusSpy = vi.spyOn(pre!, 'focus');
    const copyBtn = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('复制全部'));
    expect(copyBtn, '弹层内复制全部钮在场').toBeTruthy();
    copyBtn!.click();
    await settle();
    const action = errorAction(store);
    expect(() => action.onClick(), 'Mapping 同构：兜底动作不得抛错').not.toThrow();
    expect(focusSpy, '全选后焦点回归 pre').toHaveBeenCalled();
  });

  it('C · 源码锁：两页 selectAllRaw 构造事件通道回落 rawPre（主通道语义零变）', () => {
    for (const f of ['IndexSettingsView.vue', 'MappingView.vue']) {
      const src = readFileSync(join(__dirname, '../views', f), 'utf-8');
      expect(src, f + ' selectAllRaw 须含 currentTarget 空回落 rawPreEl 字面')
        .toContain('?? rawPreEl.value');
    }
  });
});
