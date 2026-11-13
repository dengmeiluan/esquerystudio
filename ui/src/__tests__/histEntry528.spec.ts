/**
 * 五百二十八批：「只写不显」四视图页内历史入口 + BulkEditor 回填钮补挂 + PIT 索引锁
 * + ClauseNode 值输入历史候选 + painless 脚本面 42vh 弹性档。
 *
 * 契约：
 * ① SearchSandboxView / LuceneQueryView / SqlConsoleView / SearchTemplatesView 页头「历史」钮
 *    （data-test="open-hist"）→ n-modal + QueryHistoryPanel：条目按本页 mode 单档过滤
 *    （sandbox/lucene/sql/template），actions=['play','fill','copy','del']、importable=false；
 *    play=回填草稿并执行（DslQueryView replayRow 范式）、fill=仅回填；del=store.removeOne。
 * ② SearchTemplatesView 回放裁决：历史条目含 {{占位符}}=模板源快照 → 回填 source 草稿；
 *    纯 JSON=渲染产物无法逆向 → 复制查询体 + toast（不静默假装回填）。
 * ③ BulkEditorView 补挂「用当前索引」回填钮（525 批 C 类统一范式第六页）：
 *    pickedIdx 空不渲染；pickedIdx 变化不静默覆写手填稿；点击显式覆盖。
 * ④ PitScrollView：pitId 有值后 IndexPicker 锁定（inert 包裹层 + 外层 title 提示）；
 *    关 PIT 解锁。
 * ⑤ ClauseNode 值输入历史候选（term/terms/prefix）：候选空/无 pinia 裸挂载静默无 datalist
 *    （源码锁 getActivePinia 护栏）；有历史时出候选（JSON/lucene 双形态 + keyword 子字段互认）。
 * ⑥ Reindex/UBQ painless 脚本面 28vh→42vh 弹性档 + usePref 记忆（源码锁）。
 *
 * 设施：vue-router 真 memory 实例 + hash 深链；NModal stub 直渲染（luceneInputPenetration
 * 同款，show=false 不渲染）；MonacoEditor stub 回显 modelValue（断言草稿回填用）。
 * 用例顺序敏感：ClauseNode 裸挂载判空必须在文件内任何 pinia 挂载之前（pinia install 会
 * 全局 setActivePinia 残留，裸判空语义只在「从未装过 pinia」的进程内成立——clauseNode.spec
 * 单文件内即天然如此；本文件靠 describe 排序复现同前提）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia, getActivePinia } from 'pinia';
import ClauseNode from '../components/builder/ClauseNode.vue';

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

/* MonacoEditor stub：回显 modelValue（草稿回填断言锚），data-height 透传（档位断言备用） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) {
      return () => h('div', { class: 'monaco-stub', 'data-height': props.height }, String(props.modelValue ?? ''));
    },
  }),
}));

/* 五百七十二批：monaco editor.api stub（dqResilience546 同范式斩断真实 monaco 导入链）——
   SqlConsoleView 挂载链 onMounted 里 ensureSqlCompletion(monaco, …) 需要注册面与 Kind 枚举，
   真实 monaco ESM 巨图让本文件稳定处在 3~8s/用例量级，双文件并发/满载即破 5s testTimeout
   （基线长期临界红的真因）。历史面板行为断言不涉编辑器内核，stub 后零语义损失。 */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: { setModelMarkers: () => {}, create: () => ({ dispose() {} }) },
  languages: {
    registerCompletionItemProvider: () => ({ dispose() {} }),
    CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
  },
  Range: class {},
  Uri: { parse: (v: string) => ({ toString: () => v }) },
}));

const searchDslFn = vi.fn();
const luceneSearchFn = vi.fn();
const pitOpenFn = vi.fn();
const pitCloseFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchDsl: (...a: any[]) => searchDslFn(...a),
      luceneSearch: (...a: any[]) => luceneSearchFn(...a),
      pitOpen: (...a: any[]) => pitOpenFn(...a),
      pitClose: (...a: any[]) => pitCloseFn(...a),
      /* 防御性 stub 挡真实 fetch 噪音（IndexPicker/FieldPicker/模板清单/store 初始化） */
      listStoredScripts: () => Promise.resolve({ scripts: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
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
  const { useAppStore } = await import('../stores/app');
  return { host, store: useAppStore(), unmount: () => app.unmount() };
}

function seedHist(items: Array<Partial<{ id: string; mode: string; query: string; index: string; ts: number }>>) {
  localStorage.setItem('es_query_hist_v2', JSON.stringify(
    items.map((it, i) => ({ id: it.id ?? 'qh-' + i, mode: it.mode, query: it.query, index: it.index, ts: it.ts ?? 1700000000000 + i })),
  ));
}
function findBtn(root: ParentNode, sel: string, attr = 'aria-label'): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(sel)).find(b => b.getAttribute(attr));
}
function textBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  searchDslFn.mockReset().mockResolvedValue({ took: 3, hits: { hits: [], total: { value: 0 } } });
  luceneSearchFn.mockReset().mockResolvedValue({ took: 3, hits: { hits: [] }, _shards: { total: 1, successful: 1 } });
  pitOpenFn.mockReset().mockResolvedValue({ id: 'pit-1' });
  pitCloseFn.mockReset().mockResolvedValue({});
});

afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

/* ═══════════ ⑤ ClauseNode 值输入历史候选（须排在所有 pinia 挂载之前） ═══════════ */
describe('ClauseNode：值输入历史候选（528 批 P1-3a）', () => {
  const leaf = { id: 't1', type: 'leaf', op: 'term', field: 'status', value: 'x', params: {}, raw: null };
  function mountClause(withPinia: boolean) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(ClauseNode as any, { node: leaf, fields: ['status'], types: { status: 'keyword' } }) });
    if (withPinia) app.use(createPinia());
    app.config.warnHandler = () => {};
    app.mount(host);
    apps.push(app);
    return host;
  }

  it('裸挂载（本进程从未装 pinia）静默无 datalist', async () => {
    const bare = mountClause(false);
    await settle();
    expect(bare.querySelector('datalist'), '无 pinia 环境零降级静默').toBeNull();
  });

  it('有历史时出候选：JSON 串/数组 + lucene 双形态解析，keyword 子字段互认，通配值/当前值不入候选', async () => {
    seedHist([
      { id: 'a', mode: 'dsl', query: '{"term":{"status":"ACTIVE"}}' },
      { id: 'b', mode: 'dsl', query: '{"terms":{"status":["RED","BLUE"]}}' },
      { id: 'c', mode: 'lucene', query: 'status:open AND user.name:jo*' },
      { id: 'd', mode: 'sandbox', query: '{"term":{"status.keyword":"done"}}' },
    ]);
    const host = mountClause(true);
    await settle();
    const dl = host.querySelector('datalist');
    expect(dl, '有历史出候选 datalist').toBeTruthy();
    const vals = [...host.querySelectorAll('datalist option')].map(o => o.getAttribute('value'));
    expect(vals).toEqual(['ACTIVE', 'RED', 'BLUE', 'open', 'done']);
  });
});

/* ═══════════ ① 四视图历史入口（挂载型） ═══════════ */
describe('SearchSandboxView：页内历史入口（528 批）', () => {
  it('开面板只出 mode=sandbox 条目；fill 回填草稿不执行；play 回填并执行且面板关', async () => {
    seedHist([
      { id: 'a', mode: 'sandbox', query: '{"term":{"status":"ACTIVE"}}' },
      { id: 'b', mode: 'sandbox', query: '{"query":{"ids":{"values":["DOC-42"]}}}' },
      { id: 'c', mode: 'lucene', query: 'status:ACTIVE' },
    ]);
    const { host, unmount } = await mountView((await import('../views/SearchSandboxView.vue')).default);
    const open = host.querySelector<HTMLButtonElement>('[data-test="open-hist"]');
    expect(open, '页头历史钮必须在').toBeTruthy();
    open!.click();
    await settle();
    let items = host.querySelectorAll('.nm-stub .qhp-item');
    expect(items.length, '三条历史只出 sandbox 两档').toBe(2);
    /* fill：仅回填草稿（Monaco stub 文本回显），不触发执行 */
    findBtn(items[1] as ParentNode, 'button[aria-label="仅填入"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('DOC-42');
    expect(searchDslFn, 'fill 只回填不执行').not.toHaveBeenCalled();
    expect(host.querySelector('.nm-stub'), '面板随回填关闭').toBeNull();
    /* play：回填 + 执行（searchDsl 收到的 body 即回填稿） */
    open!.click();
    await settle();
    items = host.querySelectorAll('.nm-stub .qhp-item');
    findBtn(items[0] as ParentNode, 'button[aria-label="回放/执行"]')!.click();
    await settle();
    await wait(20);
    expect(searchDslFn, 'play=回填并执行').toHaveBeenCalledTimes(1);
    expect(String(searchDslFn.mock.calls[0][1])).toContain('ACTIVE');
    expect(host.querySelector('.nm-stub')).toBeNull();
    unmount();
  });
});

describe('LuceneQueryView：页内历史入口（528 批）', () => {
  it('开面板只出 mode=lucene 条目；play 回填 ?q= 现场并执行', async () => {
    seedHist([
      { id: 'a', mode: 'lucene', query: '+status:ACTIVE' },
      { id: 'b', mode: 'dsl', query: '{"match_all":{}}' },
    ]);
    location.hash = '#/?idx=logs-1';
    const { host, unmount } = await mountView((await import('../views/LuceneQueryView.vue')).default);
    const open = host.querySelector<HTMLButtonElement>('[data-test="open-hist"]');
    expect(open, '页头历史钮必须在').toBeTruthy();
    open!.click();
    await settle();
    const items = host.querySelectorAll('.nm-stub .qhp-item');
    expect(items.length, '两条历史只出 lucene 一档').toBe(1);
    findBtn(items[0] as ParentNode, 'button[aria-label="回放/执行"]')!.click();
    await settle();
    await wait(20);
    expect(luceneSearchFn, 'play=回填 query_string 并执行').toHaveBeenCalledTimes(1);
    expect(luceneSearchFn.mock.calls[0][1]).toBe('+status:ACTIVE');
    unmount();
  });
});

describe('SqlConsoleView：页内历史入口（528 批）', () => {
  it('开面板只出 mode=sql 条目；fill 回填 SQL 草稿不执行', async () => {
    seedHist([
      { id: 'a', mode: 'sql', query: 'SELECT 1' },
      { id: 'b', mode: 'sandbox', query: '{"match_all":{}}' },
    ]);
    const { host, unmount } = await mountView((await import('../views/SqlConsoleView.vue')).default);
    const open = host.querySelector<HTMLButtonElement>('[data-test="open-hist"]');
    expect(open, '页头历史钮必须在').toBeTruthy();
    open!.click();
    await settle();
    const items = host.querySelectorAll('.nm-stub .qhp-item');
    expect(items.length, '两条历史只出 sql 一档').toBe(1);
    findBtn(items[0] as ParentNode, 'button[aria-label="仅填入"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent).toBe('SELECT 1');
    unmount();
  });
});

/* ═══════════ ② SearchTemplatesView 回放裁决 ═══════════ */
describe('SearchTemplatesView：模板历史回放裁决（528 批）', () => {
  it('模板源快照条目（含 {{}}）fill=回填 source 草稿', async () => {
    seedHist([{ id: 'a', mode: 'template', query: '{"query":{"bool":{"must":[{"term":{"bond_id":"{{bondId}}"}}]}}}' }]);
    const { host, unmount } = await mountView((await import('../views/SearchTemplatesView.vue')).default);
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    findBtn(host.querySelector('.nm-stub')!, 'button[aria-label="仅填入"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('bondId');
    unmount();
  });

  it('渲染产物条目（纯 JSON）fill/play=复制查询体+toast，不假装回填源编辑器', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
    });
    seedHist([{ id: 'a', mode: 'template', query: '{"size":10,"query":{"match_all":{}}}' }]);
    const { host, store, unmount } = await mountView((await import('../views/SearchTemplatesView.vue')).default);
    const notify = vi.spyOn(store, 'notify');
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    findBtn(host.querySelector('.nm-stub')!, 'button[aria-label="仅填入"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent, '渲染产物不得进模板源编辑器').not.toContain('"match_all"');
    expect(notify).toHaveBeenCalledWith('success', expect.stringContaining('已复制渲染 DSL'));
    /* play 同裁决（渲染产物无执行通道）：再复制一次 */
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    findBtn(host.querySelector('.nm-stub')!, 'button[aria-label="回放/执行"]')!.click();
    await settle();
    expect(notify).toHaveBeenCalledTimes(2);
    unmount();
  });
});

/* ═══════════ ③ BulkEditorView 回填钮 ═══════════ */
describe('BulkEditorView：「用当前索引」回填钮（528 批补挂第六页）', () => {
  it('532 改用同步更新：picked 空双不渲染；picked 就位 chip 回显+钮在场；点钮显式带入目标索引（手填链路随 IndexPicker 退役）', async () => {
    const { host, store, unmount } = await mountView((await import('../views/BulkEditorView.vue')).default);
    expect(host.querySelector('[data-test="use-current-idx"]'), 'pickedIdx 为空时钮不渲染').toBeNull();
    expect(host.querySelector('.be-idx-row .cic'), 'pickedIdx 为空时只读 chip 同不渲染（根 v-if 同款）').toBeNull();
    store.pick('bulk_idx');
    await settle();
    await wait(20);
    expect(host.querySelector('.be-idx-row .cic-nm')?.textContent, 'chip 回显顶栏选中').toBe('bulk_idx');
    const btn = host.querySelector<HTMLButtonElement>('[data-test="use-current-idx"]');
    expect(btn, 'pickedIdx 在场钮必须在（有稿也在）').toBeTruthy();
    expect(btn!.getAttribute('aria-label')).toBeTruthy();
    /* 手填稿（.ixp-inp）链路已随 532 批页内 IndexPicker 退役——「目标索引」改由
       PickCurrentIdxBtn 显式固定（@pick="index = store.pickedIdx"），固定后切顶栏
       不再随变（写类页无 follow）。判别链=点钮固定→切顶栏→点「生成范例」：
       生成走 index.value || store.pickedIdx fallback，若点钮未固定住 index，
       范例会落 other_idx（新 pickedIdx），断言即抓到（body 回显在 monaco stub） */
    expect(textBtn(host, '去查询验证'), '结果区未出时跳转链不渲染（九十六批下钻联动）').toBeUndefined();
    btn!.click();
    await settle();
    store.pick('other_idx');
    await settle();
    await wait(20);
    expect(host.querySelector('.be-idx-row .cic-nm')?.textContent, 'chip 恒回显顶栏选中（只读件语义）').toBe('other_idx');
    textBtn(host, '生成范例')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')?.textContent, '点钮显式固定目标索引：切顶栏后范例仍用已固定值').toContain('bulk_idx');
    unmount();
  });
});

/* ═══════════ ④ PitScrollView 索引锁（Lead 裁决 b） ═══════════ */
describe('PitScrollView：PIT 生命周期内 index 锁定（528 批）', () => {
  it('532 改用同步更新：只读 chip 回显顶栏选中；inert 锁定包裹层退役（锁定语义搬 useIdxState follow 停跟）；开/关 PIT 流程正常', async () => {
    localStorage.setItem('es_picked', 'logs-1');
    location.hash = '#/?idx=logs-1';
    const { host, unmount } = await mountView((await import('../views/PitScrollView.vue')).default);
    /* 528 批的 pit-idx-cell/pit-idx-lock inert 包裹层已随 532 批页内 IndexPicker 整段退役——
       「PIT 会话进行中切顶栏不跟随」锁定语义搬进 useIdxState follow () => !pitId（页面内部
       ref，DOM 无回显，行为契约由 532 批自有 spec 接管）；本用例锁改用后形态+开/关流程 */
    expect(host.querySelector('[data-test="pit-idx-lock"]'), 'inert 锁定包裹层随 532 退役').toBeNull();
    expect(host.querySelector('.pt-lb .cic-nm')?.textContent, 'chip 回显当前索引').toBe('logs-1');
    textBtn(host, '开 PIT')!.click();
    await settle();
    await wait(20);
    await settle();
    expect(pitOpenFn).toHaveBeenCalledTimes(1);
    textBtn(host, '关 PIT')!.click();
    await settle();
    await wait(20);
    await settle();
    expect(pitCloseFn).toHaveBeenCalledTimes(1);
    unmount();
  });
});

/* ═══════════ ⑥ Reindex/UBQ painless 42vh 弹性档 + usePref（源码锁） ═══════════ */
describe('528 批卫生：painless 脚本面 42vh 弹性档 + usePref 记忆', () => {
  const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
  it('两视图 height 换 :height="scriptH"（558 批合并 useTierCycle：ra/ubq.scriptH，默认 max(110px, 42vh)），28vh 不残留', () => {
    const ra = read('../views/ReindexAdvancedView.vue');
    const ubq = read('../views/UpdateByQueryView.vue');
    for (const [s, key] of [[ra, 'ra.scriptH'], [ubq, 'ubq.scriptH']] as const) {
      expect(s, key + ' 三档默认 42vh').toMatch(/SCRIPT_H_TIERS = \['max\(110px, 42vh\)', 'max\(150px, 56vh\)', 'max\(220px, 72vh\)'\]/);
      expect(s, key + ' 走 useTierCycle（558 击穿同步更新改锚：键名/档值/默认档不变，零迁移）').toMatch(new RegExp("useTierCycle\\('" + key.replace('.', '\\.') + "', SCRIPT_H_TIERS\\)"));
      expect(s, 'Monaco 高度换动态绑定').toMatch(/:height="scriptH"/);
      expect(s, '28vh 旧档退役（字面高度串不残留；备案注释字样豁免）').not.toMatch(/max\(110px,\s*28vh\)/);
      expect(s, '档位循环钮在').toMatch(/@click="cycleScriptH"/);
    }
    expect(getActivePinia(), '环境自检：前序挂载已建立 pinia').toBeTruthy();
  });
});
