/**
 * 六百六十批（轨1 · Monaco DSL 值位动态候选消费面二程）：
 * 658 批 DqlQueryView 首发的姊妹刀——DevTools / IndexHub（DSL 查询 tab）/ Rest 三面接线
 * （⑥659 头号候选；655 设计备案 §9-4：DevTools body 索引随 path 变，terms 闭包索引绑定
 * 是视图责任，与 fields() 同源闭包现调现读）。
 *   A 源锚（readFileSync 字面锁，658 spec A 段同范式）：
 *     A1 DevToolsView——useTermsSuggest 实例（索引源=dtPathIdx||pickedIdx，与 dtFields 同源）
 *        + dslAssist 扩 terms 闭包；
 *     A2 IndexHubView——useTermsSuggest（索引源=cur）+ ihDslAssist 扩 terms 闭包
 *        （仅 DSL 查询 tab 消费；doc 档两面只复用 .fields 不受涉）；
 *     A3 RestView——useTermsSuggest（索引源=pickedIdx，与 rtFields 同源）+ dslAssist 扩 terms 闭包；
 *     A4 JsonArea 契约补 terms 可选字段（533 analyzers 先例：与 MonacoEditor 同名契约对齐）。
 *   B 行为（658 spec monaco stub 范式挂 JsonArea——IH DSL tab 的中间透传件，三面中唯一
 *     非 MonacoEditor 直挂的链路）：
 *     B1 terms 缺席→主签名恰 2+动态零注册（透传链现状锁）；
 *     B2 terms 在场→整体透传真达内层 Monaco：动态恰 json+ndjson 两份且无 triggerCharacters
 *        （655-C1 安全位：dslRegs ['"'] 过滤器不认=monacoDslAssist 计数零扰动）+主签名不回归；
 *     B3 卸载 dispose 全量对称（JsonArea→MonacoEditor 既有 dispose 链白得）。
 * 零同步更新预判：三视图 dslAssist 行无 spec 字面锚（650-C3 全 __tests__ 目录 grep 实证）；
 * assistLintWave533:133 的 analyzers 锁是 toContain 形态，同行追加 terms? 不破。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（658 spec 同范式逐件复制） */
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

/* contrib/worker 全空 mock——斩断真实 monaco 导入链（658 spec 同清单） */
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

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import JsonArea from '../components/JsonArea.vue';

const registrations = () => (monacoStub as any).__registrations as Reg[];
const completionRegs = () => registrations().filter(r => typeof r.provider?.provideCompletionItems === 'function');
/* 动态 provider=无 triggerCharacters 的补全注册（655-C1：主 provider 恰 ['"']） */
const dynRegs = () => completionRegs().filter(r => !Array.isArray(r.provider?.triggerCharacters));
/* 主 provider 签名=恰 ['"']（dslRegs 同口径，monacoDslAssist ②⑧⑬） */
const quoteRegs = () => completionRegs().filter(r => Array.isArray(r.provider?.triggerCharacters) && r.provider.triggerCharacters.length === 1 && r.provider.triggerCharacters[0] === '"');

const readSrc = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
function mountJsonArea(props: Record<string, any>) {
  const app = createApp({ render: () => h(JsonArea as any, props) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, host };
}
beforeEach(() => { registrations().length = 0; });
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  registrations().length = 0;
});

/* ---------- A 源锚（readFileSync 字面锁） ---------- */
describe('660 批 A 源锚：三消费面接线 + JsonArea 契约对齐', () => {
  it('A1 DevToolsView 接线：useTermsSuggest（索引源=dtPathIdx||pickedIdx，与 dtFields 同源——655 §9-4 视图责任）+ dslAssist terms 闭包', () => {
    const src = readSrc('../views/DevToolsView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain("const dtTerms = useTermsSuggest(() => dtPathIdx.value || store.pickedIdx || '');");
    expect(src).toContain('terms: (f: string, p: string) => dtTerms.suggestAsync(f, p)');
  });

  it('A2 IndexHubView 接线：useTermsSuggest（索引源=cur）+ ihDslAssist terms 闭包（DSL 查询 tab 消费）', () => {
    const src = readSrc('../views/IndexHubView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const ihTerms = useTermsSuggest(() => cur.value);');
    expect(src).toContain('terms: (f: string, p: string) => ihTerms.suggestAsync(f, p)');
  });

  it('A3 RestView 接线：useTermsSuggest（索引源=pickedIdx，与 rtFields 同源）+ dslAssist terms 闭包', () => {
    const src = readSrc('../views/RestView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain("const rtTerms = useTermsSuggest(() => store.pickedIdx || '');");
    expect(src).toContain('terms: (f: string, p: string) => rtTerms.suggestAsync(f, p)');
  });

  it('A4 JsonArea 契约补 terms 可选字段（533 analyzers 先例：与 MonacoEditor 同名契约对齐）', () => {
    expect(readSrc('../components/JsonArea.vue'))
      .toContain('terms?: (field: string, prefix: string) => Promise<string[]>');
  });
});

/* ---------- B 行为锁（挂 JsonArea，透传链注册计数+dispose） ---------- */
describe('660 批 B 注册契约（JsonArea 中间透传件——IH DSL tab 链路）', () => {
  const FIELDS = [
    { path: 'title', type: 'text' },
    { path: 'status', type: 'keyword' },
  ];

  it('B1 terms 缺席：主签名恰 2+动态通道零注册（透传链现状锁）', () => {
    mountJsonArea({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(quoteRegs().length).toBe(2);
    expect(dynRegs().length).toBe(0);
    for (const r of quoteRegs()) expect(r.provider.triggerCharacters).toEqual(['"']);
  });

  it('B2 terms 在场：整体透传真达内层 Monaco——动态恰 json+ndjson 两份无 triggerCharacters（655-C1 安全位），主签名不回归', () => {
    mountJsonArea({ modelValue: '{}', dslAssist: { fields: () => FIELDS, terms: async () => ['open'] } });
    expect(dynRegs().length).toBe(2);
    expect(dynRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson']);
    for (const r of dynRegs()) expect(r.provider.triggerCharacters).toBeUndefined();
    /* dslRegs 契约不回归：['"'] 签名仍恰 2（monacoDslAssist ②⑧⑬ 同口径） */
    expect(quoteRegs().length).toBe(2);
  });

  it('B3 卸载 dispose 全量对称（JsonArea→MonacoEditor 既有 dispose 链白得）', () => {
    const { app } = mountJsonArea({ modelValue: '{}', dslAssist: { fields: () => FIELDS, terms: async () => [] } });
    expect(registrations().length).toBeGreaterThanOrEqual(4);
    app.unmount();
    expect(registrations().every(r => r.disposed), '全部注册必须随卸载 dispose').toBe(true);
  });
});
