/**
 * 九百六十七批·刀①：IndexHub DSL 编辑器高度拖柄读数=编辑区真实高度。
 *
 * 契约（验收锚）：SplitHandle 的 aria-valuenow 与拖拽起点锚都消费宿主传入的 :size——
 * 原实现缺省恒给「34% 视口高」，而编辑区实际高度在档位态是档位 px（EDITOR_HEIGHTS
 * S/M/L=200/360/560）、满档是容器 flex 实测高、自定态是拖柄落盘 px。读数错位=
 * 读屏值失真+起拖首拍从错误锚起算（档位态起拖跳变）。
 * ① 档位态：柄读数=当前档位 px（缺省 S=200；切 L=560）。
 * ② 满档：柄读数=容器 ResizeObserver 实测高（stub 注入 411.6→412）。
 * ③ 自定态：柄读数=落盘 px（回归锚，onQryHResize 通道驱动）。
 * ④ 源码锚：qryHandleSize 不再消费 34% 视口高。
 *
 * 设施：indexHubExec534 同款 monaco stub + 只 mock ../api。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——最小 editor 面（indexHubExec534 逐字，斩断真实 monaco 导入链） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: {
    defineTheme: () => {},
    create: () => ({
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
    }),
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
}));
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

const clusterQueryFn = vi.fn();
const mappingDetailFn = vi.fn();
const indexSettingsFn = vi.fn();
const shardsFn = vi.fn();
const aliasesFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      indexSettings: (...a: any[]) => indexSettingsFn(...a),
      shards: (...a: any[]) => shardsFn(...a),
      aliases: (...a: any[]) => aliasesFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

async function settle(n = 10) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountHub() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(IndexHubView as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, router };
}

function handleEl(host: ParentNode): HTMLElement {
  const el = host.querySelector<HTMLElement>('.ih-qry-handle');
  expect(el, '查询 tab 必须有编辑器高度拖柄').toBeTruthy();
  return el!;
}

function viewState(host: ParentNode): any {
  const el = host.querySelector('.ih-dsl-wrap') as any;
  expect(el, '.ih-dsl-wrap 必须在场').toBeTruthy();
  expect(el.__vueParentComponent, 'dev 实例通道必须在场').toBeTruthy();
  return el.__vueParentComponent.setupState;
}

async function setTier(host: ParentNode, label: string) {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('.ih-eh-btn')].find(b => b.textContent?.trim() === label);
  expect(btn, `高度档位钮「${label}」必须在场`).toBeTruthy();
  btn!.click();
  await settle();
}

/* ResizeObserver stub：只记录实例，测试体内手动触发量测（jsdom 无 RO；满档实测通道验证） */
class FakeRO {
  static all: FakeRO[] = [];
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; FakeRO.all.push(this); }
  observe() {} unobserve() {} disconnect() {}
  fire(h: number) { this.cb([{ contentRect: { height: h } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  FakeRO.all = [];
  mappingDetailFn.mockReset().mockResolvedValue({ index: 'a-idx', raw: { properties: {} } });
  indexSettingsFn.mockReset().mockResolvedValue({ index: { refresh_interval: '1s', number_of_replicas: '1' } });
  shardsFn.mockReset().mockResolvedValue([]);
  aliasesFn.mockReset().mockResolvedValue([]);
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: [], total: 0 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('九百六十七批·刀①：拖柄读数=编辑区真实高度', () => {
  it('④ 源码锚：qryHandleSize 不再消费 34% 视口高', () => {
    const line = ih.match(/const qryHandleSize = [^;]+;/)?.[0];
    expect(line, 'qryHandleSize 定义必须在场').toBeTruthy();
    expect(line!, '缺省 34% 视口高读数退役').not.toContain('0.34');
  });

  it('① 档位态：缺省 S 档柄读数=200px（非 34% 视口高 261）', async () => {
    history.replaceState(null, '', '#/?tab=query');
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub();
    expect(handleEl(host).getAttribute('aria-valuenow'), '缺省 S 档柄读数=档位 px').toBe('200');
  });

  it('① 档位态：切 L 档柄读数跟档位=560', async () => {
    history.replaceState(null, '', '#/?tab=query');
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub();
    await setTier(host, 'L');
    expect(handleEl(host).getAttribute('aria-valuenow'), 'L 档柄读数=560').toBe('560');
  });

  it('② 满档：柄读数=容器实测高（RO 411.6→412）', async () => {
    vi.stubGlobal('ResizeObserver', FakeRO as unknown as typeof ResizeObserver);
    history.replaceState(null, '', '#/?tab=query');
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub();
    await setTier(host, '满');
    expect(FakeRO.all.length, '满档必须挂容器量测').toBeGreaterThan(0);
    FakeRO.all.forEach(ro => ro.fire(411.6));
    await settle();
    expect(handleEl(host).getAttribute('aria-valuenow'), '满档柄读数=实测 flex 高').toBe('412');
  });

  it('③ 自定态回归锚：拖柄落盘 px 即读数（onQryHResize 300→300）', async () => {
    history.replaceState(null, '', '#/?tab=query');
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountHub();
    viewState(host).onQryHResize(300);
    await settle();
    expect(handleEl(host).getAttribute('aria-valuenow'), '自定态柄读数=落盘 px').toBe('300');
  });
});
