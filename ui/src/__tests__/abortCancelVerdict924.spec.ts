/**
 * 执行链「用户主动取消」甄别契约（四视图）+ 沙盒 explain/profile 空态示能矛盾。
 *
 * ① 取消甄别：useQueryRun.begin() 的契约注释言明「abort 后旧 fetch 以 AbortError
 *    reject，视图 catch 分支丢弃，不写状态」——DslQuery/IndexHub/SqlBridge/
 *    ReindexPreview/DevTools 消费点已有「已取消 X」info 轻提示甄别，SearchSandbox/
 *    SqlConsole/LuceneQuery/Rest 四消费点的 catch 无甄别：点「取消」后 AbortError
 *    落进失败渲染链，得到「搜索失败 / SQL 执行失败 / Lucene 查询失败 / 请求失败」
 *    红面板或 error toast——主动取消被报成失败，语义与用户动作相反。四页各锚一枚：
 *    取消 → 零错误面板 + 零 error toast + 「已取消」info 轻提示；另以真失败对照锚
 *    防甄别过宽（普通错误仍必须走错误面板 + error toast）。
 * ② 沙盒 explain/profile 视图钮点击即自动勾选请求选项，但旧响应无对应载荷时空态
 *    文案仍是「需勾选 explain 且有命中」——与已勾选状态矛盾（用户明明已勾选，却被
 *    提示去勾选）。已勾选且旧响应在场时改示「重新搜索后生效」+ 一键重跑 action；
 *    无命中时维持原文案（重跑也不会有 explain 数据）。
 *
 * 挂载范式同 sqlConsoleChannel918（MonacoEditor stub + api mock + 按钮点击）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

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
      searchDsl: vi.fn(() => Promise.resolve({})),
      sqlLenient: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
      sqlJson: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
      sqlTranslate: vi.fn(() => Promise.resolve({ size: 100, query: { match_all: {} } })),
      resolveSchema: vi.fn(() => Promise.resolve({ warnings: [] })),
      luceneSearch: vi.fn(() => Promise.resolve({})),
      raw: vi.fn(() => Promise.resolve({})),
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import SearchSandboxView from '../views/SearchSandboxView.vue';
import SqlConsoleView from '../views/SqlConsoleView.vue';
import LuceneQueryView from '../views/LuceneQueryView.vue';
import RestView from '../views/RestView.vue';
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
  const notify = vi.spyOn(store, 'notify');
  return { host, notify };
}

function btnByText(host: ParentNode, text: string): HTMLButtonElement {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(x => x.textContent?.includes(text));
  expect(b, `「${text}」按钮必须在场`).toBeTruthy();
  return b!;
}

const abortErr = () => Object.assign(new Error('canceled'), { name: 'AbortError' });

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('执行链用户主动取消的四视图甄别', () => {
  it('沙盒：取消 → 零错误面板+零 error toast+「已取消搜索」info 轻提示', async () => {
    const { api } = await import('../api');
    (api.searchDsl as ReturnType<typeof vi.fn>).mockRejectedValue(abortErr());
    const { host, notify } = await mountView(SearchSandboxView);
    btnByText(host, '搜索').click();
    await settle();
    expect(host.querySelector('.ss-err'), '主动取消不得进失败红面板').toBeNull();
    expect(notify, '主动取消不得弹 error toast').not.toHaveBeenCalledWith('error', expect.anything());
    expect(notify).toHaveBeenCalledWith('info', expect.stringContaining('已取消搜索'));
  });

  it('沙盒对照：真失败仍走红面板+error toast（防甄别过宽）', async () => {
    const { api } = await import('../api');
    (api.searchDsl as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ES 400 parsing_exception: bad query'));
    const { host, notify } = await mountView(SearchSandboxView);
    btnByText(host, '搜索').click();
    await settle();
    expect(host.querySelector('.ss-err'), '真失败必须进错误面板').toBeTruthy();
    expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('搜索失败'));
  });

  it('SQL 控制台：取消 → 零错误面板+「已取消查询」info 轻提示', async () => {
    const { api } = await import('../api');
    (api.sqlJson as ReturnType<typeof vi.fn>).mockRejectedValue(abortErr());
    sessionStorage.setItem(draftStorageKey({ route: 'sql-console' }, 'sql'), 'SELECT 1');
    const { host, notify } = await mountView(SqlConsoleView);
    btnByText(host, '执行').click();
    await settle();
    expect(host.querySelector('.sq-alert'), '主动取消不得进失败红面板').toBeNull();
    expect(notify).toHaveBeenCalledWith('info', expect.stringContaining('已取消查询'));
  });

  it('Lucene 检索：取消 → 零错误面板+「已取消查询」info 轻提示', async () => {
    const { api } = await import('../api');
    (api.luceneSearch as ReturnType<typeof vi.fn>).mockRejectedValue(abortErr());
    location.hash = '#/?idx=i1';
    history.replaceState(null, '', '#/?idx=i1');
    const { host, notify } = await mountView(LuceneQueryView);
    btnByText(host, '执行').click();
    await settle();
    expect(host.querySelector('.lc-err'), '主动取消不得进失败红面板').toBeNull();
    expect(notify).toHaveBeenCalledWith('info', expect.stringContaining('已取消查询'));
  });

  it('REST 透传：取消 → 零「请求失败」态+「已取消请求」info 轻提示', async () => {
    const { api } = await import('../api');
    (api.raw as ReturnType<typeof vi.fn>).mockRejectedValue(abortErr());
    sessionStorage.setItem(draftStorageKey({ route: 'rest' }, 'path'), '/_cluster/health');
    const { host, notify } = await mountView(RestView);
    btnByText(host, '发送').click();
    await settle();
    expect(host.textContent, '主动取消不得出现「请求失败」态').not.toContain('请求失败');
    expect(notify).toHaveBeenCalledWith('info', expect.stringContaining('已取消请求'));
  });
});

describe('沙盒 explain/profile 空态示能矛盾', () => {
  it('有命中+点击 explain 视图（自动勾选）→ 空态改示「重新搜索后生效」+重跑钮', async () => {
    const { api } = await import('../api');
    (api.searchDsl as ReturnType<typeof vi.fn>).mockResolvedValue({
      took: 5, hits: { total: { value: 1 }, hits: [{ _id: 'a', _index: 'i1', _source: {}, _score: 1.0 }] },
    });
    const { host } = await mountView(SearchSandboxView);
    btnByText(host, '搜索').click();
    await settle();
    btnByText(host, 'explain').click();
    await settle();
    const empty = host.querySelector('.ss-explain-full');
    expect(empty, 'explain 空态面板必须在场').toBeTruthy();
    expect(empty!.textContent, '已自动勾选，空态不得再提示去勾选').not.toContain('需勾选');
    expect(empty!.textContent).toContain('重新搜索后生效');
    btnByText(empty!, '立即重新搜索');
  });

  it('无命中+点击 explain 视图 → 维持「需勾选」原文案且无重跑钮', async () => {
    const { api } = await import('../api');
    (api.searchDsl as ReturnType<typeof vi.fn>).mockResolvedValue({
      took: 5, hits: { total: { value: 0 }, hits: [] },
    });
    const { host } = await mountView(SearchSandboxView);
    btnByText(host, '搜索').click();
    await settle();
    btnByText(host, 'explain').click();
    await settle();
    const empty = host.querySelector('.ss-explain-full');
    expect(empty, 'explain 空态面板必须在场').toBeTruthy();
    expect(empty!.textContent).toContain('需勾选 explain 且有命中');
    expect(Array.from(empty!.querySelectorAll('button')).find(b => b.textContent?.includes('立即重新搜索'))).toBeUndefined();
  });

  it('有响应+点击 profile 视图（自动勾选）→ 空态改示「重新搜索后生效」+重跑钮', async () => {
    const { api } = await import('../api');
    (api.searchDsl as ReturnType<typeof vi.fn>).mockResolvedValue({
      took: 5, hits: { total: { value: 1 }, hits: [{ _id: 'a', _index: 'i1', _source: {}, _score: 1.0 }] },
    });
    const { host } = await mountView(SearchSandboxView);
    btnByText(host, '搜索').click();
    await settle();
    btnByText(host, 'profile').click();
    await settle();
    const empty = host.querySelector('.ss-profile');
    expect(empty, 'profile 空态面板必须在场').toBeTruthy();
    expect(empty!.textContent).toContain('已勾选 profile');
    btnByText(empty!, '立即重新搜索');
  });

  it('重跑动线闭环：explain 空态点重跑 → 停留 explain 视图直接渲染新载荷的解释树', async () => {
    const { api } = await import('../api');
    (api.searchDsl as ReturnType<typeof vi.fn>).mockImplementation(
      (_idx: unknown, _body: unknown, params?: { explain?: boolean }) => Promise.resolve(
        params?.explain
          ? { took: 5, hits: { total: { value: 1 }, hits: [{ _id: 'a', _index: 'i1', _source: {}, _score: 1.0, _explanation: { value: 1.0, description: 'weight(x)', details: [] } }] } }
          : { took: 5, hits: { total: { value: 1 }, hits: [{ _id: 'a', _index: 'i1', _source: {}, _score: 1.0 }] } },
      ),
    );
    const { host } = await mountView(SearchSandboxView);
    btnByText(host, '搜索').click();
    await settle();
    btnByText(host, 'explain').click();
    await settle();
    btnByText(host, '立即重新搜索').click();
    await settle();
    const full = host.querySelector('.ss-explain-full');
    expect(full, '重跑后必须停留在 explain 视图（视图不被强制重置回 hits）').toBeTruthy();
    expect(full!.querySelector('.xt-node'), '重跑请求已带 explain，解释树必须直接渲染').toBeTruthy();
    const explainOn = Array.from(host.querySelectorAll('.ss-result .seg button'))
      .find(b => b.textContent?.includes('explain'))?.classList.contains('on');
    expect(explainOn, 'seg 当前态必须仍在 explain').toBe(true);
  });

  it('视图保留语义：停在 agg 视图重跑无 aggs 查询 → 「无聚合数据」空态兜底', async () => {
    const { api } = await import('../api');
    (api.searchDsl as ReturnType<typeof vi.fn>).mockImplementation((_idx: unknown, body: string) => Promise.resolve(
      String(body).includes('aggs')
        ? { took: 5, hits: { total: { value: 1 }, hits: [{ _id: 'a', _index: 'i1', _source: {}, _score: 1.0 }] }, aggregations: { by_x: { buckets: [] } } }
        : { took: 5, hits: { total: { value: 1 }, hits: [{ _id: 'a', _index: 'i1', _source: {}, _score: 1.0 }] } },
    ));
    const { host } = await mountView(SearchSandboxView);
    const ssHost = host.querySelector('.ss') as HTMLElement & { __vueParentComponent?: { setupState: Record<string, any> } };
    ssHost.__vueParentComponent!.setupState.dslBody = '{"size":0,"aggs":{"by_x":{"terms":{"field":"f"}}}}';
    btnByText(host, '搜索').click();
    await settle();
    /* seg 的 aggs 视图钮必须域定 .ss-result——快捷片段「aggs terms」在文档序更前（859-C1② 同名钮） */
    btnByText(host.querySelector('.ss-result')!, 'aggs').click();
    await settle();
    ssHost.__vueParentComponent!.setupState.dslBody = '{"size":1,"query":{"match_all":{}}}';
    btnByText(host, '搜索').click();
    await settle();
    const agg = host.querySelector('.ss-agg');
    expect(agg, '视图保留语义下必须仍停留在 agg 视图').toBeTruthy();
    expect(agg!.textContent, '新响应无 aggs 时必须有「无聚合数据」空态兜底').toContain('无聚合数据');
  });
});
