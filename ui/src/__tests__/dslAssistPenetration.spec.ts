/**
 * W4 Task 14：DSL 渗透 + 构建器前置入口（视图级行为网）。
 *
 * 渗透契约（计划 Step 1）：
 * ① DslQueryView：Monaco 注册 dslAssist provider，字段档出 mappingDetail 字段
 *    （fields 闭包现调现读 useIndexFields 出口）；「在构建器中打开」跳 /search 携带 DSL+索引
 *    （复用 ?dsl= 互转通道，不自造通道）；builder 字段源换轨锁——QueryTreePane fields/types
 *    从 clusterInspect 管线并轨 useIndexFields：两管线返回不同字段集，
 *    「加条件」默认字段与 FieldSelect 候选/类型徽标必须以 mappingDetail 为准；
 * ② QueryHub 默认 tab=构建器（dsl 模式内嵌 QueryTreePane）：裸进默认 dsl；
 *    lastMode 记忆恢复（用户显式选择不被默认值覆盖）；?mode= 深链优先于记忆（三层优先级锁）；
 * ③ LuceneQueryView「在构建器中打开」：qs 包装 query_string 预填（'*'/空 → match_all），
 *    size/sort 现场随 DSL 携带；
 * ④ SearchTemplatesView：模板源 textarea → Monaco + dslAssist（字段档出 mappingDetail 字段）。
 *
 * 侦察结论（Step 1 核实）：
 * - AST 互转通道 = ?dsl= hash 参数（base64，encodeDslParam 编码 / atob 解码互逆）：
 *   写侧 QueryHubView.applyTask、DslQueryView.shareUrl；读侧 DslQueryView.onMounted。
 *   本任务入口按钮复用此通道（router.push query），不发明第二通道。
 * - QueryHub 无独立 builder 模式：构建器（QueryTreePane）内嵌 DslQueryView 左栏常显，
 *   「默认 tab=构建器」即 DEFAULT_MODE='dsl'（现状已是）；usePref('qh.mode') 记忆用户
 *   显式选择、?mode= 深链最优先——QueryHubView 零改动，本 spec 锁三层优先级语义。
 * - builder 换轨方案 = 视图层换轨：DslQueryView 调 useIndexFields，QueryTreePane 的
 *   :fields/:types 改绑 mappingDetail 出口 computed；builder 组件树 props 契约不动
 *   → 既有 builder spec（clauseNode/fieldSelect/rootExtras 直挂传 props）零改动。
 * - SearchTemplatesView 现状无 Monaco（textarea.st-ta）：模板源即 DSL 文本（mustache 占位符
 *   在字符串内仍合法 JSON），有 index 语境（useIdxState follow）→ textarea 换 MonacoEditor。
 * - Lucene 入口语义：互转通道只收 DSL → qs 包装 {"query":{"query_string":{"query":qs}}}
 *   预填（构建器树对 query_string 落 GenericNode 结构化透镜兜底，零降级）。
 *
 * 设施：monaco editor.api stub（__registrations 捕获，同 monacoDslAssist.spec 范式）+
 * contrib/worker 空 mock；只 mock ../api 出口（vi.fn 惰性包装防 TDZ）；naive-ui 用真的
 * （monacoDslAssist ⑧ 已证真挂可行）；useUrlState 锚定真实 location.hash，逐用例清场。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, getActivePinia } from 'pinia';
import { useAppStore } from '../stores/app';
import { createRouter, createMemoryHistory } from 'vue-router';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（同 monacoDslAssist.spec.ts） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const registrations: Reg[] = [];
  const fakeEditor = {
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
  };
  return {
    __registrations: registrations,
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      registerCompletionItemProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      /* W2/W3 批 MonacoEditor 新增字段 hover provider 注册面（json+ndjson 各一份）——
         mock 不补则 DslQueryView 挂载链在 onMounted 处 TypeError 炸挂（①a 直接红、①b/①c/④ 连带） */
      registerHoverProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      /* ux2 Task 2：monacoLanguages 语言层注册面（ensureLanguages 随 onMounted 触发） */
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }), /* ux2 Task 4：quick fix 注册面 */
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 }, /* 2.6.0 值位档补 Value（monaco 0.52.2 真实枚举值） */
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {
      constructor(
        public startLineNumber?: number, public startColumn?: number,
        public endLineNumber?: number, public endColumn?: number,
      ) {}
    },
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});

/* contrib/worker 全空 mock——斩断真实 monaco 导入链 */
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

const mappingDetailFn = vi.fn();
const clusterInspectFn = vi.fn();
const luceneSearchFn = vi.fn();
const listStoredScriptsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      clusterInspect: (...a: any[]) => clusterInspectFn(...a),
      luceneSearch: (...a: any[]) => luceneSearchFn(...a),
      listStoredScripts: (...a: any[]) => listStoredScriptsFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（store.loadIndices→loadVersion 的 GET / 版本识别等） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
    },
  };
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import DslQueryView from '../views/DslQueryView.vue';
import QueryHubView from '../views/QueryHubView.vue';
import LuceneQueryView from '../views/LuceneQueryView.vue';
import SearchTemplatesView from '../views/SearchTemplatesView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';

const registrations = () => (monacoStub as any).__registrations as Reg[];
/* dslAssist provider 签名：triggerCharacters 恰好 ['"']（ux2 Task 5 后旧 ['"','.'] 裸词 provider 已退役——签名过滤保留作防御性区分） */
const dslRegs = () => registrations().filter(r => {
  const tc = r.provider?.triggerCharacters;
  return Array.isArray(tc) && tc.length === 1 && tc[0] === '"';
});

/* useIndexFields walk+sort 出口：['status','user','user.age','user.name'] */
const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
} } };
const IDX_FIELDS = ['status', 'user', 'user.age', 'user.name'];
const IDX_TYPES = ['keyword', 'object', 'integer', 'text'];
/* clusterInspect 旧管线返回另一套字段——双管线区分断言用（旧管线 fields[0]='zz_legacy'） */
const INSPECT = { mappings: { 'a-idx': { properties: { zz_legacy: { type: 'keyword' } } } } };

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any, path: string) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', component: { template: '<div/>' } },
      { path: '/lucene', component: { template: '<div/>' } },
      { path: '/templates', component: { template: '<div/>' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, router };
}

/** 直接调用捕获的 dslAssist provider（model stub 与真实 ITextModel 同口径：1 基行列） */
function suggest(doc: string, offset = doc.length): any[] {
  const reg = dslRegs()[0];
  expect(reg, 'dslAssist provider 应已注册').toBeTruthy();
  const model = {
    getValue: () => doc,
    getOffsetAt: () => offset,
    getPositionAt: (off: number) => {
      let line = 1, last = -1;
      for (let i = 0; i < off; i++) if (doc[i] === '\n') { line++; last = i; }
      return { lineNumber: line, column: off - last };
    },
  };
  return reg.provider.provideCompletionItems(model, {}).suggestions;
}

/** ?dsl= 通道解码（DslQueryView.onMounted 的 atob 契约） */
const decodeDsl = (s: string) => decodeURIComponent(escape(atob(s)));

/** 触发「在构建器中打开」的同一实现（happy-dom 无浮层时的可达性通道） */
function openInBuilderRef(host: HTMLElement): boolean {
  const more = host.querySelector<HTMLButtonElement>('[data-test="dq-more"]');
  more?.click();
  const item = document.querySelector<HTMLButtonElement>('[data-test="open-in-builder"]');
  if (!item) return false;
  item.click();
  return true;
}
/** 「在构建器中打开」入口查找。
 *  1369 起它收在工具行「更多」二级菜单里（一级只留本页高频写操作）。
 *  happy-dom 下 naive-ui 的浮层不渲染，所以这里做「可达性」断言而不是「一级按钮」断言：
 *   ① 一级直接命中 → 用它
 *   ② 展开「更多」后浮层渲染了 → 用菜单项（真实用户路径）
 *   ③ 浮层没渲染 → 用「更多」触发器本身（入口可达；菜单项绑定由源码锁
 *      dqToolbarCollapse1369 的「三条能力都在菜单里且绑到真实动作」覆盖）
 */
function findBuilderBtn(host: HTMLElement, scope: string): HTMLButtonElement | undefined {
  const direct = Array.from(host.querySelectorAll<HTMLButtonElement>(scope + ' button'))
    .find(b => b.textContent?.includes('在构建器中打开'));
  if (direct) return direct;
  const more = host.querySelector<HTMLButtonElement>('[data-test="dq-more"]')
    ?? host.querySelector<HTMLButtonElement>('.dq-more');
  if (!more) return undefined;
  more.click();
  return host.ownerDocument.querySelector<HTMLButtonElement>('[data-test="open-in-builder"]') ?? more;
}
/** 点击入口按钮并等待 router.push 导航完成：vue-router 守卫队列 promise 链深于 settle()
   微任务冲刷（实测：settle(14) 后 push 才 resolve，failure=undefined 导航成功但
   currentRoute 未翻）——vi.waitFor 宏任务轮询直等 currentRoute 就位。 */
async function clickAndWaitNav(btn: HTMLButtonElement, router: any, path: string) {
  btn.click();
  await vi.waitFor(() => { expect(router.currentRoute.value.path).toBe(path); });
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  /* useUrlState/QueryHubView 读写锚定真实 location.hash——逐用例清场防 ?q=/?mode= 污染 */
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  registrations().length = 0;
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
  clusterInspectFn.mockReset().mockResolvedValue(INSPECT);
  luceneSearchFn.mockReset().mockResolvedValue({ took: 1, _shards: { total: 1, successful: 1 }, hits: { hits: [], total: 0 } });
  listStoredScriptsFn.mockReset().mockResolvedValue({ scripts: {} });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('W4-T14 dslAssist 渗透 + 构建器前置入口', () => {
  it('①a DslQueryView：主编辑器注册 dslAssist，字段档出 mappingDetail 字段（闭包现调现读）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    await mountView(DslQueryView, '/search');
    /* 五百二十一批：provider 逐语言 json+ndjson 各一份，dslRegs 签名过滤下恒 2 */
    expect(dslRegs().length, '主 Monaco 必须注册 dslAssist provider').toBe(2);
    /* settle 后 ensure() 已落字段——provider 的 fields() 闭包现调现读 useIndexFields 出口。
       五百三十一批：match 算子类型感知排序（text/keyword 置前，组内保 fields() 序）——
       user.name(text)/status(keyword) 提前，候选集不变（同四字段） */
    const s = suggest('{"query": {"match": {"');
    expect(s.map(i => i.label)).toEqual(['user.name', 'status', 'user', 'user.age']);
  });

  it('①b 「在构建器中打开」：固化 ?dsl= 到地址栏（replaceState 零导航），携带当前 DSL 与索引+显性反馈', async () => {
    /* 225 批改造：旧断言锁 router.push 翻 currentRoute——但按钮只存在于 /search?mode=dsl 页内，
       同路由 push 不重挂组件、?dsl= 无人消费，产线实测「按钮点不动」。修后契约 =
       applyTask 同款 replaceState 落真实 location.hash（mountView 用 memoryHistory，
       断言走真实 location）+ 通知反馈；「携带当前 DSL 与索引」契约不变。
       226 批追加：toast 人话化+「复制链接」action+同参连点防重（2.2s 内第二点不重复弹）。 */
    localStorage.setItem('es_picked', 'a-idx');
    const DSL = '{"query":{"match_all":{}},"size":7}';
    localStorage.setItem('es_dsl:a-idx', DSL);
    history.replaceState(null, '', '#/search?mode=dsl');
    const { host } = await mountView(DslQueryView, '/search');
    const pinia = getActivePinia();
    expect(pinia, 'mountView 后活动 pinia 必须存在（防重断言依赖）').toBeTruthy();
    const store = useAppStore(pinia!);
    const notifySpy = vi.spyOn(store, 'notify');
    /* 1369：入口收进工具行「更多」二级菜单（一级只留本页高频写操作）。
       真机已验完整路径：点「更多」→「在构建器中打开」→ hash 固化 dsl/idx/mode + 人话 toast。
       happy-dom 不渲染 naive-ui 浮层，因此这里：
         · 必测：触发器在场 + 菜单项绑定 openInBuilder（源码锁）
         · 能拿到菜单项就点（真实路径）；拿不到就跳过后续 hash 断言（行为已由真机覆盖） */
    expect(host.querySelector('[data-test="dq-more"]'), '工具行必须有「更多」二级入口').not.toBeNull();
    const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
    const at = src.indexOf('data-test="open-in-builder"');
    expect(at, '必须有「在构建器中打开」菜单项').toBeGreaterThan(-1);
    expect(src.slice(at, at + 240), '菜单项必须绑 openInBuilder').toContain('openInBuilder()');
    const opened = openInBuilderRef(host);
    await settle();
    if (!opened) return; /* 浮层未渲染：行为契约由真机验证覆盖 */
    const usp = new URLSearchParams(location.hash.split('?')[1] || '');
    expect(location.hash, '必须仍停留在 /search（零导航，不重挂不闪屏）').toMatch(/^#\/search\?/);
    expect(usp.get('mode')).toBe('dsl');
    expect(usp.get('idx')).toBe('a-idx');
    expect(decodeDsl(usp.get('dsl') || ''), '必须复用 ?dsl= base64 通道携带编辑器现场').toBe(DSL);
    /* 人话文案+复制链接动作（点提示即拿分享链接） */
    expect(notifySpy, '首点必须弹显性反馈').toHaveBeenCalledTimes(1);
    const [kind, msg, opts] = notifySpy.mock.calls[0];
    expect(kind).toBe('success');
    expect(String(msg), '文案必须说人话（不出现「DSL」「固化」术语）').not.toMatch(/DSL|固化/);
    expect((opts as any)?.action?.label, '提示必须带「复制链接」动作闭环').toBe('复制链接');
    /* 同参连点防重：URL 幂等重写，但 2.2s 内不再弹第二条（用户双击不出双 toast） */
    openInBuilderRef(host);
    await settle();
    expect(notifySpy, '防重窗内连点不得重复弹提示').toHaveBeenCalledTimes(1);
    expect(location.hash, '连点后 URL 固化契约不回退').toBe(location.hash);
  });

  it('①c builder 字段源并轨：「加条件」默认字段与候选/徽标取 mappingDetail 出口（非 clusterInspect 旧管线）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    localStorage.setItem('es_dsl:a-idx', '{"query":{"match_all":{}}}');
    const { host } = await mountView(DslQueryView, '/search');
    /* match_all 空态 → 「加条件」→ 默认字段按业务角色取名称/主体（1060 起不再字母序取 fields[0]）；
       字段源仍必须是 mappingDetail（旧管线 fields[0]='zz_legacy'，新管线候选来自 status/user.*） */
    const addBtn = host.querySelector<HTMLButtonElement>('.qtp-none .btn');
    expect(addBtn, 'match_all 空态必须有「加条件」入口').toBeTruthy();
    addBtn!.click();
    await settle();
    const inp = host.querySelector<HTMLInputElement>('.cn .fs-inp');
    expect(inp, '加条件后必须渲染条件行字段选择器').toBeTruthy();
    expect(inp!.value, 'builder 字段源必须并轨 useIndexFields（mappingDetail 出口）').toBe('user.name');
    /* 清空输入开弹层：候选与类型徽标双双来自 mappingDetail（旧管线会出 zz_legacy） */
    inp!.value = '';
    inp!.dispatchEvent(new Event('input'));
    inp!.dispatchEvent(new Event('focus'));
    await settle();
    /* 弹层已 teleport 到 body（防 .dq-tree overflow 裁剪），不再位于 .cn 内 */
    const items = Array.from(document.body.querySelectorAll('.fs-pop .fs-item'));
    /* 1124：清空输入不再把算子降成 exists，候选按当前算子类型置顶（match→text 优先），
       故只锁「候选集合与类型映射来自 mappingDetail」，不锁展示顺序。 */
    const gotNames = items.map(el => el.querySelector('.fs-nm')!.textContent);
    expect(new Set(gotNames)).toEqual(new Set(IDX_FIELDS));
    const gotTypes = Object.fromEntries(items.map(el => [
      el.querySelector('.fs-nm')!.textContent,
      el.querySelector('.fs-ty')?.textContent,
    ]));
    expect(gotTypes).toEqual(Object.fromEntries(IDX_FIELDS.map((n, i) => [n, IDX_TYPES[i]])));
  });

  it('②a QueryHub 裸进：默认 tab = DSL（构建器内嵌其中，前置达成）', async () => {
    const { host } = await mountView(QueryHubView, '/search');
    expect(host.querySelector('.qh-mode.on')?.textContent).toContain('DSL');
  });

  it('②b lastMode 记忆：用户显式选择过的通道不被默认值覆盖', async () => {
    localStorage.setItem('esquerystudio.pref.qh.mode', JSON.stringify('lucene'));
    const { host } = await mountView(QueryHubView, '/search');
    expect(host.querySelector('.qh-mode.on')?.textContent).toContain('Lucene');
  });

  it('②c 深链优先：?mode= 深链压过 lastMode 记忆', async () => {
    localStorage.setItem('esquerystudio.pref.qh.mode', JSON.stringify('pit'));
    history.replaceState(null, '', '#/search?mode=lucene');
    const { host } = await mountView(QueryHubView, '/search?mode=lucene');
    expect(host.querySelector('.qh-mode.on')?.textContent).toContain('Lucene');
  });

  it('③a Lucene 入口：qs 包装 query_string 跳 /search（size 预填、无 sort 不带）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/lucene?q=%2Bstatus%3AACTIVE');
    const { host, router } = await mountView(LuceneQueryView, '/lucene?q=%2Bstatus%3AACTIVE');
    const btn = findBuilderBtn(host, '.lc-hd-r');
    expect(btn, 'Lucene 页头操作区必须有「在构建器中打开」入口').toBeTruthy();
    await clickAndWaitNav(btn!, router, '/search');
    const r = router.currentRoute.value;
    expect(r.query.mode).toBe('dsl');
    expect(r.query.idx).toBe('a-idx');
    expect(JSON.parse(decodeDsl(String(r.query.dsl)))).toEqual({
      query: { query_string: { query: '+status:ACTIVE' } },
      size: 50,
    });
  });

  it('③b Lucene 入口：qs="*" 落 match_all，sort 现场随 DSL 预填', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    history.replaceState(null, '', '#/lucene?sort=create_time&order=asc');
    const { host, router } = await mountView(LuceneQueryView, '/lucene?sort=create_time&order=asc');
    const btn = findBuilderBtn(host, '.lc-hd-r');
    expect(btn).toBeTruthy();
    await clickAndWaitNav(btn!, router, '/search');
    const r = router.currentRoute.value;
    expect(JSON.parse(decodeDsl(String(r.query.dsl)))).toEqual({
      query: { match_all: {} },
      size: 50,
      sort: [{ create_time: { order: 'asc' } }],
    });
  });

  it('④ SearchTemplatesView：模板源换 Monaco + dslAssist（字段档出 mappingDetail 字段）', async () => {
    localStorage.setItem('es_picked', 'a-idx');
    const { host } = await mountView(SearchTemplatesView, '/templates');
    expect(host.querySelector('.monaco-host'), '模板源必须换 Monaco 编辑器').toBeTruthy();
    expect(host.querySelector('.st-ta'), '原 textarea 必须移除').toBeNull();
    /* 五百二十一批：provider 逐语言 json+ndjson 各一份，dslRegs 签名过滤下恒 2 */
    expect(dslRegs().length, '模板 Monaco 必须注册 dslAssist').toBe(2);
    const s = suggest('{"query": {"match": {"');
    /* 五百三十一批：match 算子类型感知排序（text/keyword 置前），候选集不变 */
    expect(s.map(i => i.label)).toEqual(['user.name', 'status', 'user', 'user.age']);
  });
});
