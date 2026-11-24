/**
 * 五百三十五批 W3：ReindexPreview Ctrl+Enter + 页内历史出口；IndexHub 查询 tab 页内历史。
 *
 * 契约（挂载型行为面；源码锁在 rebuildFlat534 尾块与 indexHubQueryTab 尾块）：
 * ① ReindexPreview：页头 data-test="open-hist" → n-modal + QueryHistoryPanel，
 *    mode=reindex-preview 单档过滤，actions=['play','fill','copy','del']、importable/clearable 关；
 *    play/fill 同语义=回填 queryBody 草稿（§6u 裁决：不自动跑）；
 * ② run 成功入史：took=performance.now 端到端实测（含网络往返），index=当前源，ok=true；
 *    失败不占史位（runErr 红条承担重试）；
 * ③ Ctrl+Enter：JsonArea submit 透传直连 run（!source 早退守卫不消失）；空态 hint 提示快捷键；
 * ④ IndexHub 查询 tab：open-hist 出 mode=dsl 全量条目（不做 index 过滤，Lead 裁决简单优先）；
 *    fill=仅回填 dsl 草稿不执行；
 * ⑤ play=回填 dsl 草稿走 runDslNew→runDsl 既有 JSON 合法性门与 from/size 注入草稿路径
 *    （push 存的是编辑器原文，回放安全）；非法 JSON 被门拦下不执行。
 *
 * 设施：histEntry528 同款——NModal stub 直渲染（show=false 不渲染）+ MonacoEditor stub 回显
 * modelValue（click=execute 模拟 Ctrl+Enter，经 JsonArea @execute→@submit 透传链）；
 * vue-router 真 memory 实例；seedHist 直写 es_query_hist_v2。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';

/* NModal：teleport/定位非测试目标——show=true 直渲染、false 不渲染 */
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    NModal: defineComponent({
      name: 'NModal',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () => (props.show ? h('div', { class: 'nm-stub' }, slots.default ? slots.default() : []) : null);
      },
    }),
  };
});

/* MonacoEditor stub：回显 modelValue（草稿回填断言锚）；click=execute（Ctrl+Enter 代理，
   经 JsonArea @execute="emit('submit')" 透传到视图 @submit） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }) {
      return () => h('div', { class: 'monaco-stub', onClick: () => emit('execute') }, String(props.modelValue ?? ''));
    },
  }),
}));

const reindexPreviewFn = vi.fn();
const clusterQueryFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexPreview: (...a: any[]) => reindexPreviewFn(...a),
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      /* 防御性 stub 挡真实 fetch 噪音（IndexPicker/字段源/store 初始化） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      indexSettings: () => Promise.resolve({ index: {} }),
      shards: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any) {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await settle();
  await wait(20);
  await settle();
  return { host, unmount: () => app.unmount() };
}

function seedHist(items: Array<Partial<{ id: string; mode: string; query: string; index: string; ts: number }>>) {
  localStorage.setItem('es_query_hist_v2', JSON.stringify(
    items.map((it, i) => ({ id: it.id ?? 'qh-' + i, mode: it.mode, query: it.query, index: it.index, ts: it.ts ?? 1700000000000 + i })),
  ));
}
function histStore(): Array<any> {
  return JSON.parse(localStorage.getItem('es_query_hist_v2') || '[]');
}
function findBtn(root: ParentNode, sel: string, attr = 'aria-label'): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(sel)).find(b => b.getAttribute(attr));
}
function textBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '#/');
  sessionStorage.clear();
  localStorage.clear();
  reindexPreviewFn.mockReset().mockResolvedValue({ docs: 0 });
  clusterQueryFn.mockReset().mockResolvedValue({ took: 3, hits: [], total: 0 });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

/* ═══════════ ①②③ ReindexPreviewView ═══════════ */
describe('ReindexPreviewView：页内历史 + Ctrl+Enter（535 批 W3）', () => {
  it('open-hist 只出 mode=reindex-preview 条目；play/fill 只回填草稿不执行（面板随回填关）', async () => {
    seedHist([
      { id: 'a', mode: 'reindex-preview', query: '{"query":{"range":{"@timestamp":{"gte":"now-7d/d"}}}}' },
      { id: 'b', mode: 'reindex-preview', query: '{"query":{"ids":{"values":["DOC-42"]}}}' },
      { id: 'c', mode: 'dsl', query: '{"match_all":{}}' },
    ]);
    const { host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    const open = host.querySelector<HTMLButtonElement>('[data-test="open-hist"]');
    expect(open, '页头历史钮必须在').toBeTruthy();
    open!.click();
    await settle();
    let items = host.querySelectorAll('.nm-stub .qhp-item');
    expect(items.length, '三条历史只出 reindex-preview 两档').toBe(2);
    /* fill：仅回填草稿（Monaco stub 文本回显），不触发执行 */
    findBtn(items[1] as ParentNode, 'button[aria-label="仅填入"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('DOC-42');
    expect(reindexPreviewFn, 'fill 只回填不执行').not.toHaveBeenCalled();
    expect(host.querySelector('.nm-stub'), '面板随回填关闭').toBeNull();
    /* play：同语义回填草稿（§6u 裁决：预估页回放不自动跑） */
    open!.click();
    await settle();
    items = host.querySelectorAll('.nm-stub .qhp-item');
    findBtn(items[0] as ParentNode, 'button[aria-label="回放/执行"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('now-7d/d');
    expect(reindexPreviewFn, 'play 同语义=仅回填草稿，不自动跑').not.toHaveBeenCalled();
    unmount();
  });

  it('run 成功端到端实测入史（mode/index/took/ok 随条目）；失败不占史位', async () => {
    history.replaceState(null, '', '#/?idx=logs-1');
    let { host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    textBtn(host, '运行预估')!.click();
    await vi.waitFor(() => { expect(reindexPreviewFn).toHaveBeenCalledTimes(1); });
    await settle();
    expect(reindexPreviewFn.mock.calls[0][0], '源索引随条目入史').toBe('logs-1');
    const items = histStore();
    expect(items.length, '成功恰好入史一条').toBe(1);
    expect(items[0].mode).toBe('reindex-preview');
    expect(items[0].index).toBe('logs-1');
    expect(items[0].ok).toBe(true);
    expect(typeof items[0].took).toBe('number');
    expect(items[0].took).toBeGreaterThanOrEqual(0);
    expect(items[0].query).toContain('match_all');
    /* 面板出这条史 */
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    expect(host.querySelectorAll('.nm-stub .qhp-item').length).toBe(1);
    unmount();

    /* 失败分支：runErr 红条承担重试，不占史位 */
    reindexPreviewFn.mockReset().mockRejectedValue(new Error('boom'));
    history.replaceState(null, '', '#/?idx=logs-2');
    ({ host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default));
    textBtn(host, '运行预估')!.click();
    await vi.waitFor(() => { expect(host.querySelector('[role="alert"]')).toBeTruthy(); });
    await settle();
    expect(reindexPreviewFn).toHaveBeenCalledTimes(1);
    expect(histStore().some(i => i.index === 'logs-2'), '失败不入史').toBe(false);
    unmount();
  });

  it('Ctrl+Enter 经 JsonArea submit 直连 run（无源早退守卫；空态 hint 提示快捷键）', async () => {
    /* 无源：submit 触发 run 但 !source 早退，零网络 */
    let { host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    expect(host.querySelector('.es-hint')?.textContent, '空态 hint 补快捷键提示').toContain('Ctrl+Enter');
    (host.querySelector('.monaco-stub') as HTMLElement)!.click();
    await settle();
    await wait(20);
    expect(reindexPreviewFn, '无源早退守卫不消失').not.toHaveBeenCalled();
    unmount();

    /* 有源：submit → run → reindexPreview 收到当前草稿 */
    history.replaceState(null, '', '#/?idx=logs-1');
    ({ host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default));
    (host.querySelector('.monaco-stub') as HTMLElement)!.click();
    await vi.waitFor(() => { expect(reindexPreviewFn).toHaveBeenCalledTimes(1); });
    expect(String(reindexPreviewFn.mock.calls[0][1])).toContain('match_all');
    unmount();
  });
});

/* ═══════════ ④⑤ IndexHubView 查询 tab ═══════════ */
describe('IndexHubView 查询 tab：页内历史（535 批 W3）', () => {
  async function mountQueryTab() {
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/?tab=query');
    return mountView((await import('../views/IndexHubView.vue')).default);
  }

  it('open-hist 出 mode=dsl 全量条目（不做 index 过滤）；fill 只回填草稿不执行', async () => {
    seedHist([
      { id: 'a', mode: 'dsl', query: '{"query":{"term":{"status":"A"}}}', index: 'other-idx' },
      { id: 'b', mode: 'dsl', query: '{"query":{"ids":{"values":["DOC-42"]}}}', index: 'a-idx' },
      { id: 'c', mode: 'sql', query: 'SELECT 1' },
    ]);
    const { host, unmount } = await mountQueryTab();
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    const items = host.querySelectorAll('.nm-stub .qhp-item');
    expect(items.length, 'dsl 全量两档（other-idx 不被索引维度滤掉），sql 不入').toBe(2);
    /* fill：仅回填草稿，不触发执行 */
    findBtn(items[1] as ParentNode, 'button[aria-label="仅填入"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('DOC-42');
    expect(clusterQueryFn, 'fill 只回填不执行').not.toHaveBeenCalled();
    expect(host.querySelector('.nm-stub'), '面板随回填关闭').toBeNull();
    unmount();
  });

  it('play=回填草稿走 runDslNew：JSON 门放行 + from/size 注入草稿路径', async () => {
    seedHist([{ id: 'a', mode: 'dsl', query: '{"query":{"term":{"status":"A"}}}', index: 'other-idx' }]);
    const { host, unmount } = await mountQueryTab();
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    findBtn(host.querySelector('.nm-stub')!, 'button[aria-label="回放/执行"]')!.click();
    await vi.waitFor(() => { expect(clusterQueryFn).toHaveBeenCalledTimes(1); });
    await settle();
    /* 回放走了 runDsl 草稿路径：编辑器原文经 JSON 门 → from/size 顶层注入 → clusterQuery */
    const call = clusterQueryFn.mock.calls[0];
    expect(call[0]).toBe('a-idx');
    const body = JSON.parse(call[1]);
    expect(body.query).toEqual({ term: { status: 'A' } });
    expect(body.from, '草稿路径注入 from=0（未绕过 runDsl）').toBe(0);
    expect(body.size, '草稿路径注入 size=20（未绕过 runDsl）').toBe(20);
    expect(call[2]).toBe(20);
    expect(host.querySelector('.nm-stub'), '回放后面板关').toBeNull();
    unmount();
  });

  it('非法 JSON 回放被 runDsl 合法性门拦下：不执行（不绕门），草稿带回编辑器', async () => {
    seedHist([{ id: 'z', mode: 'dsl', query: 'not-json{{', index: 'a-idx' }]);
    const { host, unmount } = await mountQueryTab();
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    findBtn(host.querySelector('.nm-stub')!, 'button[aria-label="回放/执行"]')!.click();
    await settle();
    await wait(20);
    expect(clusterQueryFn, '非法 JSON 被门拦下不执行').not.toHaveBeenCalled();
    expect(host.querySelector('.nm-stub'), '门拦截后面板仍关（草稿已带回编辑器修）').toBeNull();
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('not-json');
    unmount();
  });
});
