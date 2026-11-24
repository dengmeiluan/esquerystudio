/**
 * 九百六十七批·刀②：IndexHub 切索引清场补 docs 侧错误条（docsErr/docsErrRaw）。
 *
 * 契约（验收锚）：watch(cur) 清场体清了 qryErr/qryResp/docsHits 等，却漏了 docsErr/
 * docsErrRaw——A 索引检索失败的红条在切到 B 索引后仍驻留：新拍在途窗口里展示的是
 * 上个索引的错误（误导），错误条与命中集一样属于「上个索引的检索结果」维度。
 * ① 行为锚：失败红条在场 → 切索引（新拍在途挂起）→ 红条立即消失。
 * ② 行为锚：切索引确实对新索引发出了新拍（证明消失不是没切）。
 * ③ 源码锚：watch(cur) 清场体含 docsErr/docsErrRaw 清场行。
 *
 * 设施：indexHubExec534 同款挂具。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
import { useAppStore } from '../stores/app';
import { __clearFieldCache } from '../composables/useIndexFields';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

async function settle(n = 10) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountHub() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(IndexHubView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, router, store: useAppStore(pinia) };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ index: 'a-idx', raw: { properties: {} } });
  indexSettingsFn.mockReset().mockResolvedValue({ index: { refresh_interval: '1s', number_of_replicas: '1' } });
  shardsFn.mockReset().mockResolvedValue([]);
  aliasesFn.mockReset().mockResolvedValue([]);
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: [], total: 0 });
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('九百六十七批·刀②：切索引清场补 docs 错误条', () => {
  it('③ 源码锚：watch(cur) 清场体含 docsErr/docsErrRaw 清场行', () => {
    const body = ih.match(/watch\(cur, \(\) => \{[\s\S]*?\n\}\);/)?.[0];
    expect(body, '切索引清场体必须在场').toBeTruthy();
    expect(body!, 'docsErr 随切清场').toContain("docsErr.value = ''");
    expect(body!, 'docsErrRaw 随切清场').toContain('docsErrRaw.value = null');
  });

  it('①② 失败红条随切索引即清：新拍在途窗口不残留旧索引错误', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    clusterQueryFn.mockRejectedValueOnce(new Error('ES 400 index_not_found_exception: a-idx'));
    const { host, store } = await mountHub(); /* 默认 docs tab：挂载即首查 */
    await settle();
    expect(host.querySelector('.ih-docs-err'), '前置：a-idx 检索失败红条在场').toBeTruthy();

    /* 切到 b-idx：新拍挂起（在途窗口），旧错误条必须随切即清 */
    clusterQueryFn.mockImplementation(() => new Promise(() => { /* 挂起 */ }));
    store.pick('b-idx');
    await settle(4);
    expect(clusterQueryFn).toHaveBeenCalledTimes(2);
    expect(clusterQueryFn.mock.calls[1][0], '新拍必须发给新索引 b-idx').toBe('b-idx');
    expect(host.querySelector('.ih-docs-err'), '在途窗口不得残留上个索引的红条').toBeNull();
  });
});
