/**
 * DslQueryView 主动通道在途反馈闸（984）：执行在途时，编辑器快捷键/RT 刷新/直方图刷选/
 * 表头排序四类主动通道直调 runQuery/onBrush/onHitsSortChange，最终都被 execQuery 本体闸
 * 静默挡下——动作无任何反馈；其中刷选与表头排序在调执行前已改写 DSL/排序态/范围条
 * （界面状态与数据现场脱节）。修法=三个主动通道函数体首行加在途闸+轻提示（与取消
 * 播报同 info 语言）；自动通道（定时重查/映射预载重查）保持 execQuery 本体静默挡
 * （dqGateRace946 行为锚声称的「切索引 rerun 被本体闸挡」语义不变，对照锚锁定）。
 *
 * 挂具=dqGateRace946 同款（monaco stub + 只 mock ../api + mountDq）；mapping mock
 * 带 ts:date 字段供 guessDateField 命中（直方图刷选动线有效性前提）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——最小 editor 面（dqGateRace946 同款，斩断真实 monaco 导入链） */
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
const clusterInspectFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      clusterInspect: (...a: any[]) => clusterInspectFn(...a),
      mappingDetail: () => Promise.resolve({ index: 'a-idx', raw: { properties: {} } }),
      indexSettings: () => Promise.resolve({ index: { refresh_interval: '1s' } }),
      shards: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      deleteById: () => Promise.resolve({}),
      count: () => Promise.resolve({ count: 0 }),
      deleteByQuery: () => Promise.resolve({ deleted: 0 }),
      progress: () => Promise.resolve({ status: 'COMPLETED', total: 0 }),
      pitOpen: () => Promise.resolve({ id: 'pit-x' }),
      pitSearch: () => Promise.resolve({ hits: { hits: [], total: 0 } }),
      pitClose: () => Promise.resolve({}),
      profile: () => Promise.resolve({ took: 1, hits: [], total: 0 }),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import DslQueryView from '../views/DslQueryView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { useAppStore } from '../stores/app';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountDq(hash: string) {
  history.replaceState(null, '', hash);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DslQueryView as any) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, router, pinia, store: useAppStore(pinia) };
}

const setupOf = (host: HTMLElement) =>
  (host.querySelector('.dq') as any).__vueParentComponent.setupState;

/* 挂起 helper：signal abort 即以 AbortError reject（fetch 取消语义同构） */
let pendingQ: Array<{ res: (v: any) => void }> = [];
function hangClusterQuery() {
  clusterQueryFn.mockImplementation((_idx: any, _b: any, _s: any, signal?: AbortSignal) =>
    new Promise((res, rej) => {
      pendingQ.push({ res });
      signal?.addEventListener('abort', () => {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        rej(e);
      });
    }));
}

const notified = (spy: { mock: { calls: any[][] } }, msg: string) =>
  spy.mock.calls.some(c => c[0] === 'info' && String(c[1]).includes(msg));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  pendingQ = [];
  clusterInspectFn.mockReset().mockResolvedValue({
    mappings: { 'a-idx': { properties: { v: { type: 'keyword' }, ts: { type: 'date' } } } },
  });
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: [{ _id: '1', _source: { v: 'A' } }], total: 1 });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('DslQuery 主动通道在途反馈闸（984）', () => {
  it('A runQuery 在途触发：info 轻提示 + 不发新拍', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, store } = await mountDq('#/');
    const spy = vi.spyOn(store, 'notify');
    host.querySelector<HTMLButtonElement>('.btn-run-lock')!.click();
    await settle(4);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    setupOf(host).runQuery();
    await settle(2);
    expect(notified(spy, '查询执行中'), '在途主动触发须有轻提示（此前被本体闸静默吞掉）').toBe(true);
    expect(clusterQueryFn, '在途闸挡下不重发').toHaveBeenCalledTimes(1);
    pendingQ.splice(0).forEach(r => r.res({ took: 1, hits: [], total: 0 }));
    await settle(4);
  });

  it('B onBrush 在途触发：DSL 与范围条零改写 + info 轻提示', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, store } = await mountDq('#/');
    const spy = vi.spyOn(store, 'notify');
    host.querySelector<HTMLButtonElement>('.btn-run-lock')!.click();
    await settle(4);
    const setup = setupOf(host);
    expect(setup.mappingDateFields, '动线有效性前提：mapping date 字段就绪').toContain('ts');
    const dslBefore = setup.dsl;
    setup.onBrush({ key: 1000, key_as_string: '2023-11-15' }, { key: 2000, key_as_string: '2023-11-16' });
    await settle(2);
    expect(setup.dsl, '在途刷选不得改写 DSL（此前先改写后被闸挡=现场脱节）').toBe(dslBefore);
    expect(setup.brushRange, '在途刷选不得置范围条').toBe('');
    expect(notified(spy, '查询执行中'), '在途刷选须有轻提示').toBe(true);
    pendingQ.splice(0).forEach(r => r.res({ took: 1, hits: [], total: 0 }));
    await settle(4);
  });

  it('C onHitsSortChange 在途触发：排序态与 DSL 零改写 + info 轻提示', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, store } = await mountDq('#/');
    const spy = vi.spyOn(store, 'notify');
    host.querySelector<HTMLButtonElement>('.btn-run-lock')!.click();
    await settle(4);
    const setup = setupOf(host);
    const dslBefore = setup.dsl;
    setup.onHitsSortChange({ f: 'v', d: 'asc' });
    await settle(2);
    expect(setup.hitsSort, '在途排序不得写排序态').toBeNull();
    expect(setup.dsl, '在途排序不得写 DSL sort 子句').toBe(dslBefore);
    expect(notified(spy, '查询执行中'), '在途排序须有轻提示').toBe(true);
    pendingQ.splice(0).forEach(r => r.res({ took: 1, hits: [], total: 0 }));
    await settle(4);
  });

  it('D 对照锚：execQuery 直调（自动通道形态）在途静默零提示', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, store } = await mountDq('#/');
    const spy = vi.spyOn(store, 'notify');
    host.querySelector<HTMLButtonElement>('.btn-run-lock')!.click();
    await settle(4);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    setupOf(host).execQuery();
    await settle(2);
    expect(notified(spy, '查询执行中'), '自动通道保持静默（定时重查错过一拍不提示）').toBe(false);
    expect(clusterQueryFn, '本体闸静默挡语义不变').toHaveBeenCalledTimes(1);
    pendingQ.splice(0).forEach(r => r.res({ took: 1, hits: [], total: 0 }));
    await settle(4);
  });

  it('E 对照锚：正常态主动触发零提示且正常发拍（闸只在在途生效）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host, store } = await mountDq('#/');
    const spy = vi.spyOn(store, 'notify');
    host.querySelector<HTMLButtonElement>('.btn-run-lock')!.click();
    await settle(6);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    expect(notified(spy, '查询执行中'), '正常执行不出提示').toBe(false);
  });

  it('F 源码锁：三主动通道闸收体首 + 统一话术 + 本体静默保持', () => {
    expect(dq.match(/查询执行中，请等待完成或先取消/g)?.length, '三通道同话术').toBe(3);
    expect(dq).toMatch(/async function runQuery\(\) \{[\s\S]{0,200}?if \(running\.value\) \{/);
    expect(dq).toMatch(/function onBrush\([\s\S]{0,120}?if \(running\.value\) \{/);
    expect(dq).toMatch(/function onHitsSortChange\([\s\S]{0,120}?if \(running\.value\) \{/);
    expect(dq).toContain('if (running.value) return;');
  });
});
