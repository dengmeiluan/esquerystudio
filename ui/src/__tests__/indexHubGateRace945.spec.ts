/**
 * IndexHubView 走查三刀（轨6 轮转走查批）：执行链世代守卫 + 新查询归页语义。
 *
 * 刀① runDslNew 页码≠1 只归页不执行——原实现 `if (qryPage.value !== 1) qryPage.value = 1;
 *    else void runDsl();` 是异或语义：非首页点「执行查询」/Ctrl+Enter/历史回放三通道
 *    全部只把页码拨回 1 而零请求，必须再点一次才真正执行（docs 侧 runDocsNew 是
 *    「归页+执行」正确形态=同页两口径）。修法=归页后无条件 runDsl（对齐 docs 形态）。
 * 刀② runDsl 切索引在途拍 qryLoading 永久卡死——finally 清场条件 `idx === cur.value`
 *    在「切索引后旧拍返回」时恒假，qryLoading 恒 true：执行/重试钮永久 disabled、
 *    取消钮常驻，无任何自愈路径（docs 链有切索引自动重拉自愈，query 链没有）。
 *    修法=世代守卫清场（seq===qrySeq 才清，raceGuard858 谱系；qry 本体闸保证同刻
 *    至多一拍在途，世代形态与 docs/ops 链同构）。
 * 刀③ runDocs/opRaw 假「已取消」播报 + 读数竞写——旧拍被新拍 begin() 作废时
 *    AbortError 落 catch 被「用户主动取消」分支吞并，播假「已取消检索/已取消操作」
 *    toast；过期拍 finally 无条件清 opsKey / 清 qryQr 句柄（finish 清掉在途新拍的
 *    AbortController=新拍取消钮失效，useQueryRun begin 清旧柄/finish 只清自己的
 *    契约要求过期拍不得 finish）。修法=docsSeq/opsSeq 世代计数+AbortError 双支
 *    甄别（当前拍=真取消播报；过期拍=静默）+finally/finish 全部世代守卫。
 *
 * 设施：indexHubExec534 同款 monaco stub + 只 mock ../api；挂起 helper 可控释放；
 * 切索引走 memory router push query（useUrlState route.query watcher 驱动）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub——最小 editor 面（indexHubExec534 同款，斩断真实 monaco 导入链） */
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
const rawFn = vi.fn();
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
      raw: (...a: any[]) => rawFn(...a),
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      indexSettings: (...a: any[]) => indexSettingsFn(...a),
      shards: (...a: any[]) => shardsFn(...a),
      aliases: (...a: any[]) => aliasesFn(...a),
      updateIndexSettings: () => Promise.resolve({}),
      deleteIndex: () => Promise.resolve({}),
      deleteById: () => Promise.resolve({}),
      updateDocument: () => Promise.resolve({}),
      profile: () => Promise.resolve({ took: 1, hits: [], total: 0 }),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { useAppStore } from '../stores/app';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

const QRESP = { took: 3, hits: [{ _id: '1', _source: { status: 'A' } }], total: 45 };

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountHub(hash: string) {
  history.replaceState(null, '', hash); /* tab/idx 深链统一入口（useUrlState 挂载时读 hash） */
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(IndexHubView as any) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, router, store: useAppStore(pinia) };
}

const btnByText = (host: ParentNode, re: RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => re.test((b.textContent || '').trim()));

/* 挂起 helper：signal abort 即以 AbortError reject（fetch 取消语义同构）；
   释放走 pendingQ 尾部 res（过期拍已被 abort，res 调用无效） */
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
let pendingRaw: Array<{ res: (v: any) => void }> = [];
function hangRaw() {
  rawFn.mockImplementation((_m: any, _p: any, _b: any, signal?: AbortSignal) =>
    new Promise((res, rej) => {
      pendingRaw.push({ res });
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
  pendingQ = [];
  pendingRaw = [];
  mappingDetailFn.mockReset().mockResolvedValue({ index: 'a-idx', raw: { properties: {} } });
  indexSettingsFn.mockReset().mockResolvedValue({ index: { refresh_interval: '1s', number_of_replicas: '1' } });
  shardsFn.mockReset().mockResolvedValue([]);
  aliasesFn.mockReset().mockResolvedValue([]);
  clusterQueryFn.mockReset().mockResolvedValue(QRESP);
  rawFn.mockReset().mockResolvedValue({});
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('IndexHub 执行链三刀（945）', () => {
  it('刀① 非首页点执行：归页即重查（from=0 真请求），不再只拨页码零请求', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/?tab=query');
    const { host } = await mountHub('#/?tab=query');
    const runBtn = host.querySelector<HTMLButtonElement>('.btn-run-lock');
    expect(runBtn, '查询 tab 必须有执行按钮').toBeTruthy();
    runBtn!.click();
    await vi.waitFor(() => { expect(clusterQueryFn).toHaveBeenCalledTimes(1); });
    await settle();
    /* 翻到第 2 页（from=20） */
    const next = host.querySelector<HTMLButtonElement>('[aria-label="下一页"]');
    expect(next).toBeTruthy();
    next!.click();
    await vi.waitFor(() => { expect(clusterQueryFn).toHaveBeenCalledTimes(2); });
    await settle();
    /* 非首页（page=2）点执行：必须真正发请求且 from=0（修复前只归页零请求） */
    runBtn!.click();
    await vi.waitFor(() => { expect(clusterQueryFn).toHaveBeenCalledTimes(3); });
    await settle();
    const body3 = JSON.parse(clusterQueryFn.mock.calls[2][1]);
    expect(body3.from, '新查询归第 1 页（from=0）').toBe(0);
  });

  it('刀① 源码锁：runDslNew 归页+执行无条件同发（异或形态退役）', () => {
    expect(ih).toMatch(/function runDslNew\(\) \{\s*qryPage\.value = 1;\s*void runDsl\(\);\s*\}/);
    expect(ih).not.toContain('else void runDsl();');
  });

  it('刀② 查询在途切索引：旧拍返回后执行钮回位（qryLoading 不卡死）', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, router } = await mountHub('#/?tab=query');
    const runBtn = host.querySelector<HTMLButtonElement>('.btn-run-lock')!;
    runBtn.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    expect(runBtn.textContent).toContain('执行中');
    /* 切索引：旧拍（a-idx）仍挂起 */
    await router.push({ query: { idx: 'b-idx', tab: 'query' } });
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    /* 释放旧拍：resolve 返回后走 idx!==cur 早退 → finally */
    pendingQ.splice(0).forEach(r => r.res({ took: 1, hits: [], total: 0 }));
    await settle(6);
    expect(runBtn.disabled, '切索引后执行钮必须回位（世代清场，修复前 idx 条件恒假卡死）').toBe(false);
    expect(runBtn.textContent, '执行钮文案回位').toContain('执行查询');
    expect(host.querySelector('.ih-qerr'), '过期拍零错误红条').toBeNull();
    vi.useRealTimers();
  });

  it('刀③ docs 检索在途切索引：新拍取代旧拍零假「已取消检索」播报，新拍照常落表', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    hangClusterQuery();
    const { host, router, store } = await mountHub('#/');
    const spy = vi.spyOn(store, 'notify');
    await vi.advanceTimersByTimeAsync(0);
    expect(clusterQueryFn).toHaveBeenCalledTimes(1); /* 挂载自动检索（a-idx） */
    /* 切索引：watch(cur) 清场并自动重拉（新拍 begin 作废旧拍） */
    await router.push({ query: { idx: 'b-idx' } });
    await vi.advanceTimersByTimeAsync(0);
    await settle(6);
    expect(clusterQueryFn).toHaveBeenCalledTimes(2); /* 新拍（b-idx）已发 */
    pendingQ.splice(0).forEach(r => r.res({ took: 2, hits: [{ _id: '9', _source: { v: 'b' } }], total: 1 }));
    await settle(6);
    /* 旧拍被作废 ≠ 用户取消：不得播「已取消检索」（修复前假 toast） */
    expect(spy.mock.calls.some(c => c[1] === '已取消检索'), '作废拍静默（假取消播报退役）').toBe(false);
    /* 新拍数据照常落表 */
    expect(host.textContent).toContain('9');
    vi.useRealTimers();
  });

  it('刀③ ops 行级执行双击：第二拍取代第一拍零假「已取消操作」，取消钮保持在场', async () => {
    vi.useFakeTimers();
    localStorage.setItem('es_picked', 'a-idx');
    hangRaw();
    const { host, store } = await mountHub('#/?tab=ops');
    const spy = vi.spyOn(store, 'notify');
    await vi.advanceTimersByTimeAsync(0);
    const execBtn = btnByText(host, /^执行$/);
    expect(execBtn, 'refresh 卡执行钮在场').toBeTruthy();
    execBtn!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(rawFn).toHaveBeenCalledTimes(1);
    /* 执行中钮文案换字（534 既有语义）且仍可点（无 disabled 面）——二击穿透 */
    const busyBtn = btnByText(host, /执行中/);
    expect(busyBtn).toBeTruthy();
    busyBtn!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(rawFn).toHaveBeenCalledTimes(2);
    await settle(6);
    /* 第一拍被第二拍作废：零假播报（修复前「已取消操作」） */
    expect(spy.mock.calls.some(c => c[1] === '已取消操作'), '作废拍静默（假取消播报退役）').toBe(false);
    /* 过期拍不得清 opsKey：第二拍在途取消钮仍在场（修复前被过期拍 finally 清掉） */
    expect(btnByText(host, /^取消$/), '第二拍在途取消钮保持').toBeTruthy();
    /* 释放第二拍：成功落定后 opsKey 清场、取消钮退役 */
    pendingRaw.splice(0).forEach(r => r.res({}));
    await settle(6);
    expect(spy.mock.calls.some(c => c[0] === 'success'), '第二拍成功反馈').toBe(true);
    expect(btnByText(host, /^取消$/), '落定后取消钮退役').toBeFalsy();
    vi.useRealTimers();
  });

  it('刀②③ 源码锁：三条执行链世代守卫形态（seq 计数+AbortError 双支+finish 世代）', () => {
    /* runDocs：世代计数 + 当前拍才播「已取消检索」+ 世代清 loading + 世代 finish */
    expect(ih).toMatch(/const seq = \+\+docsSeq;/);
    expect(ih).toMatch(/if \(seq === docsSeq\) store\.notify\('info', '已取消检索'\);/);
    expect(ih).toMatch(/if \(seq === docsSeq\) \{\s*docsLoading\.value = false;\s*docsQr\.finish\(\);\s*\}/);
    /* runDsl：世代计数 + 世代清 loading + 世代 finish */
    expect(ih).toMatch(/const seq = \+\+qrySeq;/);
    expect(ih).toMatch(/if \(seq === qrySeq\) \{\s*qryLoading\.value = false;\s*qryQr\.finish\(\);\s*\}/);
    /* opRaw：世代计数 + 当前拍才播「已取消操作」+ 世代清 opsKey + 世代 finish */
    expect(ih).toMatch(/const seq = \+\+opsSeq;/);
    expect(ih).toMatch(/if \(seq === opsSeq\) store\.notify\('info', '已取消操作'\);/);
    expect(ih).toMatch(/if \(seq === opsSeq\) \{\s*opsKey\.value = '';\s*opsQr\.finish\(\);\s*\}/);
    /* 世代变量三件在场 */
    expect(ih).toContain('let docsSeq = 0;');
    expect(ih).toContain('let qrySeq = 0;');
    expect(ih).toContain('let opsSeq = 0;');
  });
});
