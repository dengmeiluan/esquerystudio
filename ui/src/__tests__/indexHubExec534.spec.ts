/**
 * 五百三十四批·轨2（工蚁 W2）：IndexHub 执行可取消+读秒（P0-A）· 行为网。
 *
 * 契约（验收锚）：
 * ① runDocs/runDsl 补 useQueryRun（DslQueryView L96-99/L817-820 范式同款）：
 *    AbortController signal 传 api.clusterQuery 第四参；100ms tick 读秒
 *    「执行中 X.Xs」句式；取消钮入既有工具行；取消=AbortError 不进错误红条。
 * ② 既有 idx 快照竞态守卫保留（源码锁）。
 * ③ 行级执行（ops raw）同款：opsQr signal 传 api.raw + 执行钮文案换字 + 瞬时取消钮（源码锁）。
 *
 * 设施：indexHubQueryTab 同款 monaco stub + 只 mock ../api；mock timer 驱动读秒（obsProgress533 范式）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——最小 editor 面（indexHubQueryTab 同款，斩断真实 monaco 导入链） */
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

const btnByText = (host: ParentNode, re: RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => re.test((b.textContent || '').trim()));

/* 挂起的 clusterQuery mock：signal abort 即以 AbortError reject（fetch 取消语义同构） */
function hangOnSignal() {
  return clusterQueryFn.mockImplementation((_idx: any, _b: any, _s: any, signal?: AbortSignal) =>
    new Promise((_res, rej) => {
      signal?.addEventListener('abort', () => {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        rej(e);
      });
    }));
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
  vi.useRealTimers();
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('IndexHub 查询 tab：可取消+读秒（五百三十四批 P0-A）', () => {
  it('执行中 100ms tick 读秒「执行中 X.Xs」；signal 传 clusterQuery 第四参；取消后钮回「执行查询」且零错误红条', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/?tab=query');
    hangOnSignal();
    const { host } = await mountHub();

    const runBtn = host.querySelector<HTMLButtonElement>('.btn-run-lock');
    expect(runBtn, '查询 tab 必须有执行按钮').toBeTruthy();
    runBtn!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    /* signal 落第四参（post() init 既有签名） */
    const signal = clusterQueryFn.mock.calls[0][3] as AbortSignal | undefined;
    expect(signal, 'AbortSignal 必须传给 api.clusterQuery').toBeTruthy();
    expect(signal!.aborted).toBe(false);

    /* 100ms tick 读秒：0.3s → 1.0s */
    await vi.advanceTimersByTimeAsync(300);
    expect(runBtn!.textContent).toContain('执行中 0.3s');
    await vi.advanceTimersByTimeAsync(700);
    expect(runBtn!.textContent).toContain('执行中 1.0s');

    /* 取消钮入既有工具行：点击即中止 */
    const cancelBtn = btnByText(host, /^取消$/);
    expect(cancelBtn, '执行中必须出现取消钮').toBeTruthy();
    cancelBtn!.click();
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    expect(signal!.aborted, '取消必须作废 AbortController').toBe(true);
    expect(runBtn!.textContent, '取消后执行钮回位').toContain('执行查询');
    expect(host.querySelector('.ih-qerr'), '用户取消不算错误（不进 qryErr 红条）').toBeNull();
  });

  it('取消后可立即重查（AbortError 不留死锁），重查走正常成功路径', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/?tab=query');
    hangOnSignal();
    const { host } = await mountHub();
    const runBtn = host.querySelector<HTMLButtonElement>('.btn-run-lock')!;
    runBtn.click();
    await vi.advanceTimersByTimeAsync(100);
    btnByText(host, /^取消$/)!.click();
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    expect(runBtn.disabled).toBe(false);

    clusterQueryFn.mockResolvedValue({ took: 5, hits: [{ _id: '1', _source: {} }], total: 1 });
    runBtn.click();
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    expect(clusterQueryFn).toHaveBeenCalledTimes(2);
    expect(runBtn.textContent).toContain('执行查询');
    expect(host.querySelector('.ih-qerr')).toBeNull();
  });
});

describe('IndexHub 文档 tab：可取消+读秒（五百三十四批 P0-A）', () => {
  it('挂载自动检索中读秒「执行中 X.Xs」；取消后回「检索」且不进 docsErr 红条', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    hangOnSignal();
    const { host } = await mountHub(); /* 默认 docs tab：onMounted 即 runDocs */

    await vi.advanceTimersByTimeAsync(400);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    const searchBtn = btnByText(host, /执行中/);
    expect(searchBtn, '检索执行中必须出读秒文案').toBeTruthy();
    expect(searchBtn!.textContent).toContain('执行中 0.4s');
    const signal = clusterQueryFn.mock.calls[0][3] as AbortSignal;
    expect(signal.aborted).toBe(false);

    const cancelBtn = btnByText(host, /^取消$/);
    expect(cancelBtn, '检索执行中必须出现取消钮').toBeTruthy();
    cancelBtn!.click();
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    expect(signal.aborted).toBe(true);
    expect(btnByText(host, /^检索$/), '取消后检索钮回位').toBeTruthy();
    expect(host.querySelector('.err-bar'), '用户取消不算错误（docsErr 红条不出）').toBeNull();
  });
});

describe('行级执行（ops raw）同款接线（五百三十四批 P0-A · 源码锁）', () => {
  it('opsQr signal 传 api.raw + 执行钮 busy 换字 + 瞬时取消钮；idx 快照守卫同步更新零改', () => {
    expect(ih).toContain('const opsQr = useQueryRun();');
    expect(ih).toContain('const signal = opsQr.begin();');
    expect(ih).toContain('await api.raw(method, path, undefined, signal);');
    expect(ih).toMatch(/v-if="opsKey === `\/\$\{cur\}\/_refresh`"/);
    expect(ih).toMatch(/@click="opsQr\.cancel\(\)"/);
    expect(ih).toMatch(/\{\{ opsKey === `\/\$\{cur\}\/_refresh` \? '执行中 ' \+ \(opsQr\.elapsedMs\.value \/ 1000\)\.toFixed\(1\) \+ 's' : '执行' \}\}/);
    /* 既有 idx 快照竞态守卫同步更新零改（runDocs/runDsl 三处 + loadDetail）。
       945 批随批升格：finally 清场由 idx 条件升世代守卫形态（raceGuard858 谱系）——
       idx 条件在「切索引后旧拍返回」时恒假，qryLoading 永久卡死（执行/重试钮永久
       disabled 无自愈）；世代形态=过期拍零写零播，当前拍照常清场 */
    expect(ih).toMatch(/if \(idx !== cur\.value\) return; \/\/ 途中切索引：丢弃过期响应/);
    expect(ih).toMatch(/if \(seq === docsSeq\) \{\s*docsLoading\.value = false;\s*docsQr\.finish\(\);\s*\}/);
    expect(ih).toMatch(/if \(seq === qrySeq\) \{\s*qryLoading\.value = false;\s*qryQr\.finish\(\);\s*\}/);
    expect(ih).toContain('if (idx !== cur.value) return; // 加载途中切了索引：丢弃过期响应');
    /* queryRunRace382 竞态语义随身：begin 即作废上一轮（useQueryRun 统一件内建，源码锁 import 面） */
    expect(ih).toContain("import { useQueryRun } from '../composables/useQueryRun';");
  });
});
