/**
 * G5（UX 轮 II data 组）写链路与三态——行为改动防回归：
 *
 *   UpdateByQueryView：
 *     B1 执行失败 → 错误全文内联面板（version_conflict 长文直显，不过 friendlyEsError）+ 重试可达
 *        （修复前仅 toast，失败原因无界面留存）；失败清旧结果（err-bar 与结果卡互斥，
 *        不残留上次成功伪装——对齐 Bulk 批 12b B1）；notify 保留（内建收敛）；
 *   DiffEditorView：
 *     B3 加载失败 → err-bar 独立顶置（friendlyEsError 收敛 + 重试），不再伪装「尚未加载文档」
 *        空态（R91b 同源）；有旧编辑现场重取失败 → err-bar 在且 df-grid 保留（G2/G3 教训 1）；
 *     C4 URL 带齐自动拉取中 → 「正在加载文档…」，不闪「尚未加载文档」引导空态。
 *
 * Monaco 说明：DiffEditorView 无 Monaco（pre/textarea 自渲染 diff），测试不涉及编辑器实例绕过问题。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';
import { createApp, h, nextTick } from 'vue';
import { createPinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAppStore } from '../stores/app';

/* 只替换网络出口与全局确认服务，视图/组件/工具全用真的 */
const updateByQueryFn = vi.fn();
const deleteByQueryFn = vi.fn();
const searchDslFn = vi.fn();
const getDocFn = vi.fn();
const putDocFn = vi.fn();
const updateDocFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
      updateByQuery: (...args: any[]) => updateByQueryFn(...args),
      deleteByQuery: (...args: any[]) => deleteByQueryFn(...args),
      searchDsl: (...args: any[]) => searchDslFn(...args),
      getDoc: (...args: any[]) => getDocFn(...args),
      putDoc: (...args: any[]) => putDocFn(...args),
      updateDoc: (...args: any[]) => updateDocFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* store.loadIndices 链路出口补齐（本组视图挂载不触发，防御性 stub 挡真实 fetch 噪音） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* ux2 Task 9：UpdateByQuery scriptSource 换 Monaco——jsdom 不可用统一 stub（本组不断言编辑器行为，.uq-ta 零驱动实锤） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import UpdateByQueryView from '../views/UpdateByQueryView.vue';
import DiffEditorView from '../views/DiffEditorView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/task-tree', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

/* UBQ 预置：?idx= 进 URL（useIdxState 读 location.hash），query 进 sessionStorage 草稿（useDraft） */
const UBQ_HASH = '#/update-by-query?idx=logs-*';
/* 草稿：query 草稿按 集群/索引 维度隔离（UBQ_HASH 带 ?idx=logs-*） */
const UBQ_DRAFT_KEY = draftStorageKey({ route: 'update-by-query', index: () => 'logs-*' }, 'query');
/* version_conflict 长文样例：friendlyEsError 会收敛掉 version_conflicts 计数明细，
   断言这些片段在 = 面板全文直显（B1 核心性质） */
const CONFLICT_LONG = 'ResponseException: method [POST], URI [/logs-*/_update_by_query], status line [HTTP/1.1 409 Conflict]\n'
  + '{"took":12,"timed_out":false,"total":100,"updated":0,"version_conflicts":37,'
  + '"failures":[{"index":"logs-2026.08","id":"doc-9","cause":{"type":"version_conflict_engine_exception",'
  + '"reason":"[doc-9]: version conflict, required seqNo [12], primary term [1]. current document has seqNo [15]"}}]}';

const DOC = { _version: 3, _seq_no: 12, _primary_term: 1, _source: { a: 1, b: 'x' } };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  updateByQueryFn.mockReset().mockResolvedValue({ taskId: 'task-1', updated: 3 });
  deleteByQueryFn.mockReset().mockResolvedValue({ taskId: 'task-2', deleted: 5 });
  searchDslFn.mockReset().mockResolvedValue({ hits: { total: { value: 42 } } });
  getDocFn.mockReset().mockResolvedValue(DOC);
  putDocFn.mockReset().mockResolvedValue({});
  updateDocFn.mockReset().mockResolvedValue({});
  askConfirmFn.mockReset().mockResolvedValue(true);
});

describe('G5 UpdateByQueryView：写链路失败全文面板（B1，计划点名最高价值项）', () => {
  it('执行失败 → 错误全文面板在（含 version_conflict 长文明细）+ 重试可达 + notify error 保留', async () => {
    sessionStorage.setItem(UBQ_DRAFT_KEY, '{ "match_all": {} }');
    updateByQueryFn.mockRejectedValue(new Error(CONFLICT_LONG));
    const { app, host, pinia } = await mountView(UpdateByQueryView, UBQ_HASH);
    const store = useAppStore(pinia as Pinia);
    const spy = vi.spyOn(store, 'notify');
    findBtn(host, '执行')!.click();
    await settle();
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现内联错误面板（不再仅 toast）').toBeTruthy();
    expect(bar!.textContent, '面板必须全文直显——version_conflicts 计数是排障关键，不许被 friendlyEsError 收敛掉')
      .toContain('version_conflicts":37');
    expect(bar!.textContent).toContain('version_conflict_engine_exception');
    expect(host.querySelector('.uq-result'), '失败时无结果卡').toBeNull();
    expect(spy.mock.calls.some(c => c[0] === 'error' && String(c[1]).includes('失败')), 'notify error 必须保留（toast 通道不丢）').toBe(true);
    /* 重试可达：点面板重试 → 重跑 doSubmit（再过确认）→ updateByQuery 二次调用 */
    const retryBtn = findBtn(bar! as HTMLElement, '重试');
    expect(retryBtn, '面板必须含重试按钮').toBeTruthy();
    updateByQueryFn.mockClear();
    retryBtn!.click();
    await settle();
    expect(updateByQueryFn, '重试必须重跑 doSubmit').toHaveBeenCalledTimes(1);
    expect(askConfirmFn, '重试必须再过确认门（复审 M3：首次 1 次 + 重试 1 次，不绕过）').toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('成功后失败 → 旧结果卡消失（err-bar 与结果卡互斥，不残留伪装成功）', async () => {
    sessionStorage.setItem(UBQ_DRAFT_KEY, '{ "match_all": {} }');
    const { app, host } = await mountView(UpdateByQueryView, UBQ_HASH);
    findBtn(host, '执行')!.click();
    await settle();
    expect(host.querySelector('.uq-result'), '成功必须出结果卡').toBeTruthy();
    expect(host.textContent).toContain('task-1');
    expect(host.querySelector('.err-bar'), '成功不出 err-bar').toBeNull();
    updateByQueryFn.mockRejectedValue(new Error('script_compile_exception: cannot resolve symbol [ctx._source.statu]'));
    findBtn(host, '执行')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '再失败必须出 err-bar').toBeTruthy();
    expect(host.textContent).toContain('script_compile_exception');
    expect(host.querySelector('.uq-result'), '失败后旧结果卡必须消失（互斥，不残留伪装成功）').toBeNull();
    expect(host.textContent, '旧 taskId 不许残留').not.toContain('task-1');
    app.unmount();
  });

  it('执行 in-flight 防重入：按钮禁用 + pending 文案且重复点击不双发（复审 M2/M3）', async () => {
    sessionStorage.setItem(UBQ_DRAFT_KEY, '{ "match_all": {} }');
    updateByQueryFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟 in-flight */ }));
    const { app, host } = await mountView(UpdateByQueryView, UBQ_HASH);
    const execBtn = findBtn(host, '执行')!;
    execBtn.click();
    await settle(3);
    expect(updateByQueryFn).toHaveBeenCalledTimes(1);
    expect(execBtn.disabled, 'in-flight 期间按钮必须禁用').toBe(true);
    expect(execBtn.textContent, 'in-flight 期间必须出 pending 文案（对齐 Diff 加载按钮修法）').toContain('执行中');
    execBtn.click();
    await settle(3);
    expect(updateByQueryFn, 'in-flight 期间重复点击不许双发').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('成功路径：结果卡在 + err-bar 不在 + 旧失败面板被清（互斥反向）', async () => {
    sessionStorage.setItem(UBQ_DRAFT_KEY, '{ "match_all": {} }');
    updateByQueryFn.mockRejectedValueOnce(new Error('boom-1'));
    const { app, host } = await mountView(UpdateByQueryView, UBQ_HASH);
    findBtn(host, '执行')!.click();
    await settle();
    expect(host.querySelector('.err-bar')).toBeTruthy();
    /* 第二次成功：面板消、结果出 */
    findBtn(host, '执行')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '成功后旧 err-bar 必须清').toBeNull();
    expect(host.querySelector('.uq-result'), '成功必须出结果卡').toBeTruthy();
    app.unmount();
  });
});

describe('G5 DiffEditorView：加载三态与旧现场保留（B3/C4）', () => {
  it('C4：URL 带齐自动拉取中 → 「正在加载文档…」在，「尚未加载文档」不在', async () => {
    getDocFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟拉取中 */ }));
    const { app, host } = await mountView(DiffEditorView, '#/doc-diff?idx=logs&id=1');
    expect(host.textContent, '拉取中必须给加载中文案').toContain('正在加载文档…');
    expect(host.textContent, '拉取中不许闪「尚未加载文档」引导空态').not.toContain('尚未加载文档');
    app.unmount();
  });

  it('B3：加载失败 → err-bar（收敛文案+重试）在，不伪装「尚未加载文档」（R91b 回归锁）', async () => {
    getDocFn.mockRejectedValue(new Error('index_not_found_exception: no such index [logs]'));
    const { app, host } = await mountView(DiffEditorView, '#/doc-diff?idx=logs&id=1');
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现错误条').toBeTruthy();
    expect(bar!.textContent).toContain('文档加载失败');
    expect(bar!.textContent, '读链路必须过 friendlyEsError 收敛').toContain('索引不存在');
    expect(findBtn(bar! as HTMLElement, '重试'), '错误条必须含重试按钮').toBeTruthy();
    expect(host.textContent, '失败不许伪装空态').not.toContain('尚未加载文档');
    app.unmount();
  });

  it('B3：err-bar 重试可达——点击重跑 doFetch', async () => {
    getDocFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(DiffEditorView, '#/doc-diff?idx=logs&id=1');
    expect(host.querySelector('.err-bar')).toBeTruthy();
    getDocFn.mockClear();
    findBtn(host.querySelector('.err-bar') as HTMLElement, '重试')!.click();
    await settle();
    expect(getDocFn, '重试必须重跑 doFetch').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('成功加载 → df-grid 编辑现场在（version 元信息按后端 _doc 契约渲染），err-bar 不在', async () => {
    const { app, host } = await mountView(DiffEditorView, '#/doc-diff?idx=logs&id=1');
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.df-grid'), '成功必须出编辑区').toBeTruthy();
    expect(host.textContent, '元信息取 _doc 响应顶层字段（后端透传契约）').toContain('3 version');
    expect(host.textContent).toContain('12 seq_no');
    app.unmount();
  });

  it('有旧编辑现场重取失败 → err-bar 在且 df-grid 保留（G2/G3 教训 1：err-bar 独立链外顶置）', async () => {
    const { app, host } = await mountView(DiffEditorView, '#/doc-diff?idx=logs&id=1');
    expect(host.querySelector('.df-grid')).toBeTruthy();
    expect(host.textContent).toContain('3 version');
    getDocFn.mockRejectedValue(new Error('timeout'));
    findBtn(host, '加载文档')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '重取失败必须出现错误条（独立于数据分支）').toBeTruthy();
    expect(host.textContent).toContain('文档加载失败');
    expect(host.querySelector('.df-grid'), '失败时旧编辑现场必须保留').toBeTruthy();
    expect(host.textContent, '旧元信息必须保留').toContain('3 version');
    app.unmount();
  });

  it('默认进入（URL 无 idx/id）→ 手动工作台引导空态在，不自动拉取（MANUAL_WORKBENCH 分类依据锁）', async () => {
    const { app, host } = await mountView(DiffEditorView, '#/doc-diff');
    expect(getDocFn, '默认进入不许自动拉取').not.toHaveBeenCalled();
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.empty-state'), '真空必须出 EmptyState 组件').toBeTruthy();
    expect(host.textContent).toContain('尚未加载文档');
    app.unmount();
  });
});
