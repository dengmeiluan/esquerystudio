/**
 * DslQueryView 走查三刀（轨6 轮转走查批）：执行链世代守卫 + 文档保存执行体闸 + 死规则退役。
 *
 * 刀① execQuery 世代守卫+选择源快照（与 IndexHubView 检索三链同构）——原实现回包落地
 *    无任何身份判别：切索引后旧拍（a-idx）返回时把旧索引数据写进新索引现场（结果表
 *    index prop 已是 b-idx，hits 却是 a-idx 的=数据错位），跨模式历史 push 读
 *    store.pickedIdx 当前值=记到 b-idx 名下；finally 无条件清 running/abortCtl/
 *    elapsedTimer（形态与 IndexHub 检索链不齐）。修法=runSeq 世代计数+idx 快照判别
 *    （回包落地/降级重试/二次嗅探四处）+AbortError 双支甄别（当前拍=真取消播报；
 *    过期拍=静默）+finally 世代守卫（世代与闸等价，形态统一防未来新通道绕闸时
 *    被旧拍清掉 AbortController）。
 * 刀② saveDoc 执行体闸——保存钮无在途闸，await api.updateDocument 在途窗内连点双发
 *    PUT（成功通知双弹+重复覆盖）；同页 saveNewDoc 已有 newDocSaving 闸=同域两口径。
 *    修法=闸收本体首行+置位前移（第一个 await 之前）+try/finally 复位+钮面 disabled
 *    双保险（937 批同款纪律）。
 * 刀③ .dq-params-sec 死规则退役——542 批把检索参数块迁出独立节后模板零引用
 *    （dqLayoutErgonomics542 负锚 not.toContain class= 在案），style 规则残留。
 *
 * 锚④（用户取消播报）为防过宽对照锚：锁「双支甄别不许吞掉真取消的播报」，落码前
 *    即绿属预期（924 批取消通道甄别契约的既有语义守卫）。
 *
 * 设施：indexHubGateRace945 同款 monaco stub + 只 mock ../api；挂起 helper 可控释放；
 * 切索引走 store.pick（顶栏全局选中即本页 pickedIdx 源）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——最小 editor 面（indexHubGateRace945 同款，斩断真实 monaco 导入链） */
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
const updateDocumentFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      clusterInspect: (...a: any[]) => clusterInspectFn(...a),
      updateDocument: (...a: any[]) => updateDocumentFn(...a),
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
import { useQueryHistoryStore } from '../stores/queryHistory';

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

const btnByText = (host: ParentNode, re: RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => re.test((b.textContent || '').trim()));

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
let pendingDoc: Array<{ res: (v: any) => void }> = [];
function hangUpdateDocument() {
  updateDocumentFn.mockImplementation(() =>
    new Promise((res) => { pendingDoc.push({ res }); }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  pendingQ = [];
  pendingDoc = [];
  clusterInspectFn.mockReset().mockResolvedValue({ mappings: { 'a-idx': { properties: { v: { type: 'keyword' } } } } });
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: [{ _id: '1', _source: { v: 'A' } }], total: 1 });
  updateDocumentFn.mockReset().mockResolvedValue({});
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('DslQuery 执行链三刀（946）', () => {
  it('刀① 查询在途切索引：旧拍回包丢弃，新索引现场零污染+执行钮回位', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, store } = await mountDq('#/');
    const runBtn = host.querySelector<HTMLButtonElement>('.btn-run-lock');
    expect(runBtn, '执行按钮在场').toBeTruthy();
    runBtn!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    expect(clusterQueryFn.mock.calls[0][0], '首拍发到 a-idx').toBe('a-idx');
    /* 切索引：watch 清现场并预载 b-idx mapping；rerun 被本体闸挡（旧拍在途） */
    store.pick('b-idx');
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    /* 释放旧拍（a-idx 数据）：修复前无身份判别，旧回包写进 b 现场 */
    pendingQ.splice(0).forEach(r => r.res({ took: 1, hits: [{ _id: 'old-a', _source: { v: 'old-a-val' } }], total: 7 }));
    await settle(6);
    expect(host.textContent, '过期回包不落新索引现场（结果区维持就绪空态）').not.toContain('old-a-val');
    expect(runBtn!.disabled, '执行钮回位（不卡死）').toBe(false);
    vi.useRealTimers();
  });

  it('刀① 切索引在途拍：跨模式历史不记错索引（选择源快照）', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { pinia, store } = await mountDq('#/');
    const runBtn = btnByText(document.body, /执行/)!;
    runBtn.click();
    await vi.advanceTimersByTimeAsync(0);
    store.pick('b-idx');
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    pendingQ.splice(0).forEach(r => r.res({ took: 1, hits: [], total: 0 }));
    await settle(6);
    const qh = useQueryHistoryStore(pinia);
    expect(qh.items.filter(i => i.index === 'b-idx'), '过期拍不得把 a-idx 的查询记到 b-idx 名下（修复前 push 读当前 pickedIdx=b-idx）').toHaveLength(0);
    /* 本地历史（HIST_KEY）在 begin 同步段已正确记 a-idx，不经跨模式 store——b-idx 零条目即刀面判据全量 */
    vi.useRealTimers();
  });

  it('刀② 文档保存双击单发（执行体闸），落定后闸复位', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    hangUpdateDocument();
    const { host } = await mountDq('#/');
    const setup = (host.querySelector('.dq') as any).__vueParentComponent.setupState;
    setup.openDoc({ _id: 'doc-1', _source: { v: 1 } }, true);
    await settle();
    const saveBtn = btnByText(document.body, /全量覆盖/);
    expect(saveBtn, '保存（全量覆盖 _source）钮在场').toBeTruthy();
    saveBtn!.click();
    saveBtn!.click(); /* 在途窗内二击：闸挡（修复前双发 PUT） */
    await settle(4);
    expect(updateDocumentFn, '在途双击只发一次').toHaveBeenCalledTimes(1);
    pendingDoc.splice(0).forEach(r => r.res({}));
    await settle(6);
    expect(setup.docSaving, '落定后闸复位').toBe(false);
    /* 闸复位后可再发（防过闸死） */
    setup.docOpen = false;
    await settle(2);
    setup.openDoc({ _id: 'doc-2', _source: { v: 2 } }, true);
    await settle(2);
    const saveBtn2 = btnByText(document.body, /全量覆盖/)!;
    hangUpdateDocument();
    saveBtn2.click();
    await settle(4);
    expect(updateDocumentFn, '复位后再次保存可发').toHaveBeenCalledTimes(2);
    pendingDoc.splice(0).forEach(r => r.res({}));
    await settle(4);
  });

  it('刀② 源码锁：saveDoc 闸收本体+置位前移+finally 复位+钮面 disabled', () => {
    expect(dq).toContain('const docSaving = ref(false);');
    expect(dq).toMatch(/if \(!activeDoc\.value \|\| docSaving\.value\) return;/);
    expect(dq).toMatch(/docSaving\.value = true;\s*try \{/);
    expect(dq).toMatch(/finally \{ docSaving\.value = false; \}/);
    expect(dq).toMatch(/:disabled="docSaving"/);
  });

  it('刀①③ 源码锁：execQuery 世代守卫形态 + 死规则退役', () => {
    /* 世代计数+选择源快照 */
    expect(dq).toContain('let runSeq = 0;');
    expect(dq).toMatch(/const seq = \+\+runSeq;/);
    expect(dq).toMatch(/const idx = store\.pickedIdx;/);
    /* 回包身份判别（主拍/降级重试/二次嗅探至少三处） */
    expect(dq.match(/if \(idx !== store\.pickedIdx \|\| seq !== runSeq\) return;/g)?.length ?? 0, '回包判别至少三处').toBeGreaterThanOrEqual(3);
    /* AbortError 双支甄别：当前拍才播报 */
    expect(dq).toMatch(/if \(seq === runSeq\) store\.notify\('info', `已取消查询/);
    /* finally 世代守卫 */
    expect(dq).toMatch(/if \(seq === runSeq\) \{\s*running\.value = false;\s*abortCtl = null;/);
    /* api 调用走 idx 快照（发请求维度不读当前值） */
    expect(dq).toMatch(/api\.clusterQuery\(idx,/);
    expect(dq).toMatch(/api\.profile\(idx,/);
    /* 刀③ 死规则退役（542 负锚族：模板零引用后 style 残留清账） */
    expect(dq).not.toContain('.dq-params-sec');
  });

  it('锚④ 对照锚：用户主动取消播报保留（双支甄别不许吞真取消）', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, store } = await mountDq('#/');
    const spy = vi.spyOn(store, 'notify');
    const runBtn = host.querySelector<HTMLButtonElement>('.btn-run-lock')!;
    runBtn.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    const cancelBtn = btnByText(host, /取消/);
    expect(cancelBtn, '在途取消钮在场').toBeTruthy();
    cancelBtn!.click();
    await settle(6);
    expect(spy.mock.calls.some(c => c[0] === 'info' && String(c[1]).includes('已取消查询')), '真取消播报保留').toBe(true);
    expect(host.querySelector('.err-bar'), '取消零错误条').toBeNull();
    vi.useRealTimers();
  });
});
