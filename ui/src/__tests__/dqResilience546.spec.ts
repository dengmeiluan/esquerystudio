/**
 * 五百四十六批工蚁2·轨1：DslQueryView 韧性守卫行为锁（544 批交接在册 prod 炸点修复）。
 *
 *  背景（544 批联合树交接）：DslQueryView 空 fields mock 态 prod 渲染
 *  「Cannot read properties of undefined (reading 'map')」——DslQueryView 模板 tree 视图
 *  `resp.hits.map(...)` 在 v-show 下无论视图恒求值，api.clusterQuery 返回缺 hits 键
 *  （mock/后端异常形态）即炸；且 870/888/911 三处 clusterQuery 结果**裸赋值**绕过
 *  normalizeResp 归一（ES 原始双层包裹与 Java 转换行数组双形态此前只有 profile 路径归一）。
 *
 *  锁定：
 *  A hits 缺键不炸（行为锁）：clusterQuery 应答无 hits 键 → 执行→渲染管线零错误（errorHandler
 *    捕获面），视图存活可继续执行；
 *  B normalizeResp 双形态归一（行为锁）：Java 转换形态（hits 已是行数组）与 ES 原始双层包裹
 *    （hits.hits）都归一为 SearchResp——卡片视图 DOM 出行（rows 透传），ES 包裹形态不回归；
 *  C 历史/收藏 localStorage 坏值容错（行为锁）：非数组 JSON / 损坏串 → 挂载与历史弹窗零崩溃
 *    （DevToolsView histAllRead 的 try+Array.isArray 先例同口径）；
 *  D execQuery 并发重入守卫（行为锁）：执行中二次触发（Monaco @execute / eventBus 路径）不再
 *    重入——clusterQuery 恰一次，执行完释放后可再次执行（window 全局键路径 :1834 既有守卫，
 *    补的是 execQuery 体首行）；
 *  E 源锚：模板 hits 兜底、guard 首行、fieldList 同族守卫、normalizeResp Array.isArray 分流。
 *
 * 挂载范式同 monacoDslAssist.spec ⑧（monaco stub + 真实 naive-ui + memory router）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub（monacoDslAssist 同范式——斩断真实 monaco 导入链；注册捕获供 F 段 suggest 用） */
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
      registerHoverProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
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

/* api mock：clusterQuery/profile 可编程（其余网络出口按 monacoDslAssist 冒烟配方堵死） */
const clusterQueryMock = vi.fn();
const profileMock = vi.fn();
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
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterQuery: (...args: any[]) => clusterQueryMock(...args),
      profile: (...args: any[]) => profileMock(...args),
    },
  };
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import DslQueryView from '../views/DslQueryView.vue';
import { useAppStore } from '../stores/app';

const registrations = () => (monacoStub as any).__registrations as Reg[];

const SRC = join(__dirname, '..');
const viewSrc = readFileSync(join(SRC, 'views/DslQueryView.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const errors: any[] = [];
let pendingResolvers: ((v: any) => void)[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

interface MountRt { host: HTMLElement; store: ReturnType<typeof useAppStore> }
async function mountView(): Promise<MountRt> {
  localStorage.setItem('es_picked', 'idx-a');
  /* DSL 草稿：合法 match_all（execQuery 的 tryParse 门必需；useScopedDraft 无持久稿 → 读 es_dsl:<idx> 旧键） */
  localStorage.setItem('es_dsl:idx-a', '{"query":{"match_all":{}}}');
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DslQueryView) });
  app.use(pinia);
  app.use(router);
  app.config.errorHandler = (err) => { errors.push(err); };
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle();
  return { host, store: useAppStore(pinia) };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear(); /* qwSession（查询现场会话恢复）跨测试残留会让 firstRun 在挂载期自动执行、污染调用计数 */
  document.body.innerHTML = '';
  errors.length = 0;
  pendingResolvers = [];
  clusterQueryMock.mockReset();
  profileMock.mockReset();
  registrations().length = 0; /* 跨测试注册残留——suggest546 按 [0] 取 provider，必须只留本用例挂载的那份 */
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('A hits 缺键不炸（544 交接 prod 炸点·行为锁）', () => {
  it('clusterQuery 应答缺 hits 键：执行→渲染零错误，视图存活可继续执行', async () => {
    clusterQueryMock.mockResolvedValue({ took: 5 }); /* 缺 hits 键的异常应答形态 */
    const { host, store } = await mountView();
    expect(host.querySelector('.monaco-host'), '前置：编辑器区已渲染').toBeTruthy();
    store.emit('run-query');
    await settle();
    expect(clusterQueryMock, '执行已发出').toHaveBeenCalledTimes(1);
    expect(errors, '缺 hits 键不应产生渲染错误（tree 视图 v-show 下 resp.hits.map 恒求值）').toEqual([]);
    /* 视图存活：再触发一次执行仍可达 api（渲染树未崩） */
    store.emit('run-query');
    await settle();
    expect(clusterQueryMock).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([]);
  });
});

describe('B normalizeResp 双形态归一（870/888/911 裸赋值退役·行为锁）', () => {
  it('Java 转换形态（hits=行数组）：rows 透传进卡片视图 DOM，total 归一非 NaN', async () => {
    clusterQueryMock.mockResolvedValue({ hits: [{ _id: 'a', _index: 'idx-a', _source: { f: 1 } }], total: 1, took: 3 });
    const { host, store } = await mountView();
    store.emit('run-query');
    await settle();
    expect(errors).toEqual([]);
    expect(clusterQueryMock).toHaveBeenCalledTimes(1);
    /* 卡片视图 v-show 常渲（display:none）——rows 归一进 resp.hits 的端到端 DOM 证据 */
    expect(host.querySelectorAll('.dq-card').length).toBe(1);
  });

  it('ES 原始双层包裹形态（hits.hits）：此前 clusterQuery 裸赋值即炸，归一后同卡出行', async () => {
    clusterQueryMock.mockResolvedValue({
      hits: { total: { value: 2, relation: 'gte' }, hits: [{ _id: 'b', _source: { g: 'x' } }, { _id: 'c', _source: { g: 'y' } }] },
      took: 2,
    });
    const { host, store } = await mountView();
    store.emit('run-query');
    await settle();
    expect(errors, '双层包裹形态经归一不再炸 v-for/Object.keys').toEqual([]);
    expect(host.querySelectorAll('.dq-card').length).toBe(2);
  });
});

describe('C 历史/收藏 localStorage 坏值容错（Array.isArray 守卫·行为锁）', () => {
  it('es_query_hist 存非数组 JSON：历史弹窗打开零崩溃、空态可见', async () => {
    localStorage.setItem('es_query_hist', '{"bad": 1}');
    const { store } = await mountView();
    store.emit('open-history');
    await settle();
    expect(errors, '非数组历史值不应炸 histRows 映射').toEqual([]);
    /* NModal Teleport 到 body——空态从 document.body 找（面板空态类 .qhp-empty） */
    expect(document.body.querySelector('.qhp-empty'), '历史面板空态可见（条目集归一为 []）').toBeTruthy();
  });

  it('es_query_saved 存损坏 JSON 串：挂载零崩溃（setup 期 JSON.parse 不抛）', async () => {
    localStorage.setItem('es_query_saved', 'not-json{');
    const { host } = await mountView();
    expect(errors, '损坏收藏值不应炸 setup 期解析').toEqual([]);
    expect(host.querySelector('.monaco-host')).toBeTruthy();
  });
});

describe('D execQuery 并发重入守卫（行为锁）', () => {
  it('执行中二次触发不重入（clusterQuery 恰一次）；执行完释放后可再次执行', async () => {
    clusterQueryMock.mockImplementation(() => new Promise(r => { pendingResolvers.push(r); }));
    const { store } = await mountView();
    store.emit('run-query');
    await settle();
    expect(clusterQueryMock).toHaveBeenCalledTimes(1);
    /* 执行中（running=true）再触发：Monaco @execute / RT @refresh 等路径共享 execQuery 体——
       首行 running 守卫拦截，不再覆盖 abortCtl 丢请求 */
    store.emit('run-query');
    await settle();
    expect(clusterQueryMock, '执行中二次触发必须被守卫拦截').toHaveBeenCalledTimes(1);
    /* 放行首轮 → 守卫释放 → 第三次触发可达 api（守卫不是死锁） */
    pendingResolvers.forEach(r => r({ took: 1 }));
    await settle();
    store.emit('run-query');
    await settle();
    expect(clusterQueryMock).toHaveBeenCalledTimes(2);
    pendingResolvers.forEach(r => r({ took: 1 }));
    await settle();
  });
});

describe('E 源锚（守卫接线形态）', () => {
  it('模板 hits 兜底 / execQuery 首行 running 守卫 / normalizeResp Array.isArray 分流 / fieldList 同族守卫', () => {
    expect(viewSrc).toContain('(resp.hits || []).map');
    expect(viewSrc).toContain('if (running.value) return;');
    expect(viewSrc).toContain('Array.isArray(hitsWrap)');
    expect(viewSrc).toContain('(resp.value?.hits || []).forEach');
    /* 历史/收藏读侧统一过 Array.isArray 守卫（DevToolsView histAllRead 先例同口径） */
    expect(viewSrc).toContain('Array.isArray(r) ? r : []');
  });
});

/* ═══ F 五百四十六批任务5：sort/_source 数组位字段名补全（行为锁，monaco stub 直挂 MonacoEditor） ═══ */
import MonacoEditor from '../components/MonacoEditor.vue';

const FIELDS546 = [
  { path: 'title', type: 'text' },
  { path: 'price', type: 'long' },
  { path: 'created', type: 'date' },
];

function mountBareEditor() {
  const app = createApp({ render: () => h(MonacoEditor as any, { modelValue: '{}', dslAssist: { fields: () => FIELDS546 } }) });
  app.use(createPinia());
  const hostEl = document.createElement('div');
  document.body.appendChild(hostEl);
  app.mount(hostEl);
  apps.push(app);
}

function suggest546(doc: string, offset = doc.length): any[] {
  const reg = registrations().filter(r => {
    const tc = r.provider?.triggerCharacters;
    return Array.isArray(tc) && tc.length === 1 && tc[0] === '"';
  })[0];
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
  return reg!.provider.provideCompletionItems(model, {}).suggestions;
}

/** {lineNumber,column} → offset（monacoDslAssist 同口径逆运算） */
function posToOffset546(doc: string, lineNumber: number, column: number): number {
  let off = 0;
  for (let l = 1; l < lineNumber; l++) off = doc.indexOf('\n', off) + 1;
  return off + column - 1;
}
/** 模拟接受建议：range 区间替换为 insertText（snippet 字面量替换形态） */
function accept546(doc: string, item: any): string {
  const s = posToOffset546(doc, item.range.startLineNumber, item.range.startColumn);
  const e = posToOffset546(doc, item.range.endLineNumber, item.range.endColumn);
  return doc.slice(0, s) + item.insertText + doc.slice(e);
}

describe('F sort/_source 数组位字段名补全（任务5·行为锁）', () => {
  beforeEach(() => { mountBareEditor(); });

  it('sort 元素对象键位（"sort": [{ " ）→ 字段候选，插入=字段键+order 值骨架', () => {
    const items = suggest546('{"sort": [{ "');
    expect(items.map(i => i.label)).toEqual(['title', 'price', 'created']);
    for (const i of items) {
      expect(i.insertText).toBe('"' + i.label + '": { "order": "${1|desc,asc|}" }');
      expect(i.detail).toBe(FIELDS546.find(f => f.path === i.label)!.type);
      expect(i.insertTextRules).toBe(4 /* InsertAsSnippet */);
    }
  });

  it('_source 元素串位：首元素位（"["左邻）与续元素位（","左邻）同出字段候选（Value 档）', () => {
    for (const doc of ['{"_source": ["', '{"_source": ["a", "']) {
      const items = suggest546(doc);
      expect(items.map(i => i.label), doc).toEqual(['title', 'price', 'created']);
      for (const i of items) expect(i.insertText, doc).toBe('"' + i.label + '"');
    }
    /* 接受后整串干净替换、JSON 合法（首元素位端到端） */
    const after = accept546('{"_source": [', suggest546('{"_source": ["').find(i => i.label === 'title'));
    expect(after).toBe('{"_source": ["title"');
    expect(() => JSON.parse(after + ']}')).not.toThrow();
  });

  it('压制面零回归：terms 值数组首元素位（540 钉）/ must 续元素位（544 钉）/ 插件私有容器不出候选', () => {
    expect(suggest546('{"query": {"terms": {"host": ["19')).toEqual([]);
    expect(suggest546('{"query": {"bool": {"must": ["match", "')).toEqual([]);
    /* 哨兵迁移史：sort 值对象键位 → sort-opt-key；highlight 字段配置 → 本轮升为一等档。
       压制面改 pin 插件私有顶层容器（既非 query/aggs，也不在体键/建议器/检索器/字段数组）。 */
    expect(suggest546('{"my_plugin": {"x": {')).toEqual([]);
  });

  it('1439：sort 值对象键位出排序参数（原 ⑦ 压制 pin 的正向替换）', () => {
    const items = suggest546('{"sort": [{"@timestamp": {"').map(i => i.label);
    expect(items).toEqual(expect.arrayContaining(['order', 'mode', 'missing', 'unmapped_type', 'nested']));
  });

  it('白名单外数组元素对象键位既有出档零变化：must 元素对象键位仍 query-type 骨架', () => {
    const items = suggest546('{"query": {"bool": {"must": [{ "');
    expect(items.map(i => i.label)).toContain('match');
  });
});
