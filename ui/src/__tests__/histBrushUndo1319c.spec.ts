/**
 * 一千三百一十九批 c：清除刷选不得连用户手改的 DSL 一起回滚。
 *
 * 旧实现：`if (!brushRange.value) preBrushDsl = dsl.value` 只在**首次**刷选前存一份全文快照，
 * 清除刷选时整份写回。于是这条动线丢工作且无提示：
 *
 *   拖选直方图 → 再手动改 query（加条件 / 改 size）→ 点「清除刷选」
 *   ⇒ 手动改的内容被静默抹掉，回到刷选之前那一版。
 *
 * 新实现记住「注入前的 query」与「注入后的 query」，清除时只摘掉那一条 range：
 *  - query 仍是注入形状 → 恢复注入前的 query，其它字段（size/sort/aggs）原样保留；
 *  - query 已被用户改过 → **不动 DSL**，只清范围条并提示，不猜、不覆盖。
 *
 * 负控：把 clearBrush 改回「有快照就整份回滚」→ 第 2 条必红。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: {
    defineTheme: () => {},
    create: () => ({
      onDidChangeModelContent: () => ({ dispose() {} }),
      addAction: () => {}, getValue: () => '', setValue: () => {},
      updateOptions: () => {}, getAction: () => null, getSelection: () => null,
      executeEdits: () => {}, focus: () => {}, deltaDecorations: () => [],
      getModel: () => null, dispose: () => {},
    }),
    setTheme: () => {}, setModelMarkers: () => {},
  },
  languages: {
    registerCompletionItemProvider: () => ({ dispose() {} }),
    registerHoverProvider: () => ({ dispose() {} }),
    register: () => {}, setMonarchTokensProvider: () => {}, setLanguageConfiguration: () => {},
    registerCodeActionProvider: () => ({ dispose() {} }),
    json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
    CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  },
  Range: class {}, KeyMod: { CtrlCmd: 2048 }, KeyCode: { Enter: 3 },
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
      mappingDetail: () => Promise.resolve({ index: 'a-idx', raw: { properties: { ts: { type: 'date' } } } }),
      indexSettings: () => Promise.resolve({ index: { refresh_interval: '1s' } }),
      shards: () => Promise.resolve([]), aliases: () => Promise.resolve([]),
      deleteById: () => Promise.resolve({}), count: () => Promise.resolve({ count: 0 }),
      deleteByQuery: () => Promise.resolve({ deleted: 0 }),
      progress: () => Promise.resolve({ status: 'COMPLETED', total: 0 }),
      pitOpen: () => Promise.resolve({ id: 'pit-x' }),
      pitSearch: () => Promise.resolve({ hits: { hits: [], total: 0 } }),
      pitClose: () => Promise.resolve({}),
      profile: () => Promise.resolve({ took: 1, hits: [], total: 0 }),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]), overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import DslQueryView from '../views/DslQueryView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { useAppStore } from '../stores/app';

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountDq() {
  history.replaceState(null, '', '#/');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DslQueryView as any) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia); app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, store: useAppStore(pinia) };
}
const setupOf = (host: HTMLElement) =>
  (host.querySelector('.dq') as any).__vueParentComponent.setupState;

/* 一个桶（date_histogram 语义：key = 区间起点） */
const b1 = { key: 1788220800000, key_as_string: '2026-09-01T00:00:00.000Z', doc_count: 3 };
const b2 = { key: 1788307200000, key_as_string: '2026-09-02T00:00:00.000Z', doc_count: 5 };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('es_picked', 'a-idx');
  __clearFieldCache();
  clusterQueryFn.mockReset().mockResolvedValue({ took: 1, hits: [], total: 0, aggregations: {} });
  clusterInspectFn.mockReset().mockResolvedValue({
    mappings: { 'a-idx': { properties: { ts: { type: 'date' }, title: { type: 'text' } } } },
  });
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

describe('1319c 清除刷选的撤销语义', () => {
  it('未手改：清除后恢复注入前的 query，且 size/其他字段原样保留', async () => {
    const { host } = await mountDq();
    const s = setupOf(host);
    s.dsl = JSON.stringify({ query: { match_all: {} }, size: 7 }, null, 2);
    await settle();
    s.onBrush(b1, b2, 1788393600000); // 选中第 1 桶，右开边界=第 3 桶起点
    await settle();
    const afterBrush = JSON.parse(s.dsl);
    /* match_all 会被包成 bool.must + filter[range]，这是既有设计（保留原 query） */
    expect(JSON.stringify(afterBrush.query), '刷选应注入 range').toContain('range');
    expect(afterBrush.size, '刷选不得动 size').toBe(7);

    s.clearBrush();
    await settle();
    const afterClear = JSON.parse(s.dsl);
    expect(afterClear.query, '应恢复成注入前的 match_all').toEqual({ match_all: {} });
    expect(afterClear.size, 'size 必须原样保留').toBe(7);
    expect(s.brushRange, '范围条必须清空').toBe('');
  });

  it('刷选后又手改 DSL → 清除**不得**吞掉手改内容（核心回归）', async () => {
    const { host, store } = await mountDq();
    const spy = vi.spyOn(store, 'notify');
    const s = setupOf(host);
    s.dsl = JSON.stringify({ query: { match_all: {} }, size: 7 }, null, 2);
    await settle();
    s.onBrush(b1, b2, 1788393600000);
    await settle();
    /* 用户手动修改：加了一条 term 条件（形状已非注入态） */
    s.dsl = JSON.stringify({
      query: { bool: { must: [{ match_all: {} }], filter: [{ range: { ts: { gte: b1.key, lt: 1788393600000 } } }, { term: { title: 'x' } }] } },
      size: 7,
    }, null, 2);
    await settle();
    const before = JSON.parse(s.dsl);

    s.clearBrush();
    await settle();
    const after = JSON.parse(s.dsl);
    expect(after, '用户手改的 term 条件不得被静默抹掉').toEqual(before);
    expect(s.brushRange, '范围条仍要清空').toBe('');
    expect(spy.mock.calls.some(c => String(c[1]).includes('未自动回滚')), '必须提示原因，不静默').toBe(true);
  });

  it('连刷两次后清除：回到最初 query（不是回到中间那次）', async () => {
    const { host } = await mountDq();
    const s = setupOf(host);
    s.dsl = JSON.stringify({ query: { match_all: {} } }, null, 2);
    await settle();
    s.onBrush(b1, b2, 1788393600000);
    await settle();
    const mid = JSON.parse(s.dsl).query;
    s.onBrush(b2, b2, 1788470400000);
    await settle();
    expect(JSON.parse(s.dsl).query, '第二次刷选应改写 query').not.toEqual(mid);
    s.clearBrush();
    await settle();
    expect(JSON.parse(s.dsl).query, '应回到最初 match_all，而非中间那次刷选态').toEqual({ match_all: {} });
  });
});
