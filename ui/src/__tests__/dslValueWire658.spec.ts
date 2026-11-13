/**
 * 六百五十八批（轨1 · Monaco DSL 值位动态候选 P2 接线）：
 * 655 设计备案 §7 红点第 5 组「注册契约」落地 + P2 接线源锚——
 *   A 源锚：MonacoEditor 契约扩 terms / import util 工厂 / terms 在场守卫注册块 /
 *     DslQueryView 注入 useTermsSuggest.suggestAsync 闭包（D4 首发消费面=QueryHub dsl 模式面板）；
 *   B 行为（monacoDslAssist stub 范式挂真组件）：
 *     terms 缺席→补全注册恰 2（json+ndjson 主 provider）；terms 在场→恰 4
 *     （+2 动态 provider 无 triggerCharacters——655-C1 先例安全位：dslRegs ['"'] 过滤器不认，
 *     monacoDslAssist ②⑧⑬ 计数零扰动）；卸载 dispose 全量对称；
 *     动态 provider 功能冒烟（props.terms 闭包真达工厂：keyword 值位出 top 值候选）；
 *     DslQueryView 挂载冒烟（视图 terms 注入真达 MonacoEditor）。
 * P0 解冻门：20260926 17:45 用户令『全部可以开干』=显式裁决移交（接管提交 9e999d7e）；
 * D1~D4 取推荐值（方案 A/动态独占〔架构级零重叠：540/543 静态档仅 doc 档、动态仅 search 档〕/
 * date 不出/首发仅 DqlQueryView）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（monacoDslAssist 同范式逐件复制） */
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

/* contrib/worker 全空 mock——斩断真实 monaco 导入链（monacoDslAssist 同清单） */
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

/* DslQueryView 冒烟用：只堵网络出口（monacoDslAssist ⑧ 同口径） */
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
      mappingDetail: () => Promise.resolve({ raw: { properties: { status: { type: 'keyword' } } } }),
    },
  };
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import MonacoEditor from '../components/MonacoEditor.vue';
import DslQueryView from '../views/DslQueryView.vue';

const registrations = () => (monacoStub as any).__registrations as Reg[];
/* 补全 provider 全集（主+动态+painless），hover 另算。
   口径注：dslAssist 在场时 painless 补全也注册（triggerCharacters ['[','.']）——总数含它。 */
const completionRegs = () => registrations().filter(r => typeof r.provider?.provideCompletionItems === 'function');
/* 动态 provider=无 triggerCharacters 的补全注册（655-C1：主 provider 恰 ['"']、painless ['[','.']、hover 无 provideCompletionItems） */
const dynRegs = () => completionRegs().filter(r => !Array.isArray(r.provider?.triggerCharacters));
/* 主 provider 签名=恰 ['"']（dslRegs 同口径，monacoDslAssist ②⑧⑬） */
const quoteRegs = () => completionRegs().filter(r => Array.isArray(r.provider?.triggerCharacters) && r.provider.triggerCharacters.length === 1 && r.provider.triggerCharacters[0] === '"');

const readSrc = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
function mountEditor(props: Record<string, any>) {
  const app = createApp({ render: () => h(MonacoEditor as any, props) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, host };
}
async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
beforeEach(() => { registrations().length = 0; });
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  registrations().length = 0;
});

/* ---------- A 源锚（readFileSync 字面锁，656 spec C 段同范式） ---------- */
describe('658 批 A 源锚：P2 接线最小 diff', () => {
  it('A1 MonacoEditor 契约扩 terms（签名与设计备案 §8 逐字同形）', () => {
    expect(readSrc('../components/MonacoEditor.vue'))
      .toContain('terms?: (field: string, prefix: string) => Promise<string[]>');
  });
  it('A2 MonacoEditor import 动态工厂（util 单源消费，不复制组装逻辑）', () => {
    expect(readSrc('../components/MonacoEditor.vue'))
      .toContain("import { makeDslValueSuggestProvider } from '../utils/dslValueSuggest';");
  });
  it('A3 terms 在场守卫注册：缺席=零注册（524+1 先例）+dispose 入 dslAssistDisposables 对称释放', () => {
    const src = readSrc('../components/MonacoEditor.vue');
    expect(src).toContain('if (props.dslAssist?.terms) {');
    expect(src).toContain('makeDslValueSuggestProvider({');
    expect(src).toContain("dslAssistDisposables.push(...['json', 'ndjson'].map(lang =>");
    expect(src).toContain('bodyKind: props.dslAssist!.bodyKind,');
  });
  it('A4 DslQueryView 注入 useTermsSuggest.suggestAsync 闭包（D4 首发消费面）', () => {
    const src = readSrc('../views/DslQueryView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const termsSuggest = useTermsSuggest(() => store.pickedIdx);');
    expect(src).toContain('terms: (f: string, p: string) => termsSuggest.suggestAsync(f, p)');
  });
});

/* ---------- B 行为锁（挂真组件，注册计数+dispose+功能冒烟） ---------- */
describe('658 批 B 注册契约（设计备案 §7 红点第 5 组）', () => {
  const FIELDS = [
    { path: 'title', type: 'text' },
    { path: 'status', type: 'keyword' },
  ];

  it('B1 terms 缺席：主签名恰 2+动态通道零注册（painless 补全为 dslAssist 既有第三份）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(quoteRegs().length).toBe(2);
    expect(dynRegs().length).toBe(0);
    for (const r of quoteRegs()) expect(r.provider.triggerCharacters).toEqual(['"']);
  });

  it('B2 terms 在场：新增恰 2 份无 triggerCharacters 的补全注册（655-C1 安全位）且逐语言 json+ndjson', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, terms: async () => ['open'] } });
    expect(dynRegs().length).toBe(2);
    expect(dynRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson']);
    /* dslRegs 契约不回归：['"'] 签名仍恰 2（monacoDslAssist ②⑧⑬ 同口径） */
    expect(quoteRegs().length).toBe(2);
  });

  it('B3 动态 provider 功能冒烟：props.terms 闭包真达工厂（keyword 值位出 top 值候选）', async () => {
    const terms = vi.fn(async () => ['open', 'closed']);
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, terms } });
    const reg = dynRegs()[0];
    expect(reg, '动态 provider 应已注册').toBeTruthy();
    const doc = '{"query": {"term": {"status": "¤"}}}';
    const off = doc.indexOf('¤');
    const clean = doc.replace('¤', '');
    const pos = (() => { let line = 1, last = -1; for (let i = 0; i < off; i++) if (clean[i] === '\n') { line++; last = i; } return { lineNumber: line, column: off - last }; })();
    const model = {
      getValue: () => clean,
      getOffsetAt: () => off,
      getPositionAt: (o: number) => { let line = 1, last = -1; for (let i = 0; i < o; i++) if (clean[i] === '\n') { line++; last = i; } return { lineNumber: line, column: o - last }; },
    };
    const res = await reg.provider.provideCompletionItems(model, pos);
    expect(terms).toHaveBeenCalledWith('status', '');
    expect(res.suggestions.length).toBe(2);
    expect(res.suggestions[0].insertText).toBe('"open"');
    expect(String(res.suggestions[0].detail)).toContain('keyword');
  });

  it('B4 卸载 dispose 全量对称（主+动态+hover 同路）', () => {
    const { app } = mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, terms: async () => [] } });
    expect(registrations().length).toBeGreaterThanOrEqual(4);
    app.unmount();
    expect(registrations().every(r => r.disposed), '全部注册必须随卸载 dispose').toBe(true);
  });

  it('B5 DslQueryView 挂载冒烟：视图 terms 注入真达 MonacoEditor（+2 动态），dslRegs 主签名不回归', async () => {
    localStorage.setItem('es_picked', 'idx-a');
    const pinia = createPinia();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
    await router.push('/');
    await router.isReady();
    const app = createApp({ render: () => h(DslQueryView) });
    apps.push(app);
    app.use(pinia);
    app.use(router);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length, '视图 terms 注入→动态 provider 恰 json+ndjson 两份').toBe(2);
    expect(quoteRegs().length, '主 provider 签名计数不回归（monacoDslAssist ⑧ 同口径）').toBe(2);
  });
});
