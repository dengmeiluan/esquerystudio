/**
 * 六百六十一批（轨1 · Monaco DSL 值位动态候选消费面三程·第一批）：
 * 658 首发刀（DqlQueryView）+660 二程（DevTools/IndexHub DSL tab/Rest）的姊妹三程——
 * 轨1 四查询面（QueryXray/RankDebug/ScoreExplain/SearchSandbox）+ AliasesView filter
 * （⑥660-2 点名件，filter=查询子句组合语义 528 批已约定）五面接线（660 范式照抄：
 * 每面=useTermsSuggest 实例+terms 闭包一小刀，索引源与 fields 同源现调现读）。
 * ⚠655 §1.3 消费面清单勘误（开工 grep 实锚）：该清单漏 QueryXray/RankDebug/
 * ScoreExplain/SearchSandbox/PitScroll/ProfileFlame/MatchMatrix/UpdateByQuery/Reindex 系/
 * ReindexPreview/SearchTemplates/System/SqlBridge/MappingView/MappingDesigner/PainlessLab
 * 等面——接线五面属其缺口；零语义面（analyze/settings/mapping/none/readonly/painless）
 * 全量裁决备案见状态档案 ⑥661（不接线不占运行时面）。
 *   A 源锚（readFileSync 字面锁，660 spec A 段同范式）：五面 import/实例/闭包三行。
 *   B 挂载冒烟（658 B5 DqlQueryView 同范式）：五视图 terms 注入真达 JsonArea→
 *     MonacoEditor——动态恰 json+ndjson 两份且无 triggerCharacters（655-C1 安全位：
 *     dslRegs ['"'] 过滤器不认=monacoDslAssist 计数零扰动）+主签名 ['"'] 恰 2 不回归；
 *     AliasesView filter 编辑器在写操作面板（v-if="panel"）内——先造条件点开（660-C3），
 *     canOps 在 me==null 时恒 true（auth.canEndpoint 首行短路）无须 auth 造数。
 *   C 下界计数锁（650-C2 计数册实测口径）：全站视图 terms 闭包 ≥9（658+660 四面+五面），
 *     662 三程第二批（PitScroll/ProfileFlame/MatchMatrix/UpdateByQuery/Reindex 系/ReindexPreview）
 *     只增不减。
 * 同步更新（566-C4 纪律，唯一字面锁撞面）：suggestWave554 F1 两断言 qx/rd 的 dslAssist
 *     行字面随 terms 追加同步升形（fields 纯读语义零回退，ensure 仍由 watch immediate 承担）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（660 spec 同范式逐件复制） */
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

/* contrib/worker 全空 mock——斩断真实 monaco 导入链（658/660 spec 同清单） */
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

/* 五视图挂载冒烟用：堵挂载期网络出口（658 spec 同口径 + AliasesView load 的 aliases 面） */
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
      aliases: () => Promise.resolve([]),
    },
  };
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import QueryXrayView from '../views/QueryXrayView.vue';
import RankDebugView from '../views/RankDebugView.vue';
import ScoreExplainView from '../views/ScoreExplainView.vue';
import SearchSandboxView from '../views/SearchSandboxView.vue';
import AliasesView from '../views/AliasesView.vue';

const registrations = () => (monacoStub as any).__registrations as Reg[];
const completionRegs = () => registrations().filter(r => typeof r.provider?.provideCompletionItems === 'function');
/* 动态 provider=无 triggerCharacters 的补全注册（655-C1：主 provider 恰 ['"']） */
const dynRegs = () => completionRegs().filter(r => !Array.isArray(r.provider?.triggerCharacters));
/* 主 provider 签名=恰 ['"']（dslRegs 同口径，monacoDslAssist ②⑧⑬） */
const quoteRegs = () => completionRegs().filter(r => Array.isArray(r.provider?.triggerCharacters) && r.provider.triggerCharacters.length === 1 && r.provider.triggerCharacters[0] === '"');

const readSrc = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
async function mountView(view: any) {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(view) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
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

/* ---------- A 源锚（readFileSync 字面锁） ---------- */
describe('661 批 A 源锚：五消费面接线（660 范式照抄）', () => {
  it('A1 QueryXrayView 接线：useTermsSuggest（索引源=index，与 assistFields 同源）+ dslAssist terms 闭包', () => {
    const src = readSrc('../views/QueryXrayView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const qxTerms = useTermsSuggest(() => index.value);');
    expect(src).toContain('terms: (f: string, p: string) => qxTerms.suggestAsync(f, p)');
  });

  it('A2 RankDebugView 接线：useTermsSuggest（索引源=index，与 assistFields 同源）+ dslAssist terms 闭包', () => {
    const src = readSrc('../views/RankDebugView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const rdTerms = useTermsSuggest(() => index.value);');
    expect(src).toContain('terms: (f: string, p: string) => rdTerms.suggestAsync(f, p)');
  });

  it('A3 ScoreExplainView 接线：useTermsSuggest（索引源=index，与 assistFields 同源）+ dslAssist terms 闭包（fields 惰性 ensure 形态保持）', () => {
    const src = readSrc('../views/ScoreExplainView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const seTerms = useTermsSuggest(() => index.value);');
    expect(src).toContain('terms: (f: string, p: string) => seTerms.suggestAsync(f, p)');
  });

  it('A4 SearchSandboxView 接线：useTermsSuggest（索引源=indexName，与 ssFields 同源）+ dslAssist terms 闭包', () => {
    const src = readSrc('../views/SearchSandboxView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain("const ssTerms = useTermsSuggest(() => indexName.value || '');");
    expect(src).toContain('terms: (f: string, p: string) => ssTerms.suggestAsync(f, p)');
  });

  it('A5 AliasesView 接线：useTermsSuggest（索引源=cIndex=新建面板选中物理索引，与 filterFields 同源）+ filterAssist terms 闭包（528 filter=search 档语义）+ fields 实拉 ensure 接线（661-C1：528 存量缺角——仅解构 fields 未 ensure，字段/词项候选恒空的根因；554 immediate 范式补齐）', () => {
    const src = readSrc('../views/AliasesView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const alvTerms = useTermsSuggest(() => cIndex.value);');
    expect(src).toContain('terms: (f: string, p: string) => alvTerms.suggestAsync(f, p)');
    expect(src).toContain('const { fields: filterFields, ensure: ensureFilterFields } = useIndexFields(() => cIndex.value);');
    expect(src).toContain('watch(cIndex, () => { void ensureFilterFields(); }, { immediate: true });');
  });
});

/* ---------- B 挂载冒烟（658 B5 范式：视图 terms 注入真达 JsonArea→MonacoEditor） ---------- */
describe('661 批 B 挂载冒烟：五视图动态通道真达 + 主签名不回归', () => {
  it('B1 QueryXrayView：动态恰 json+ndjson 两份无 triggerCharacters（655-C1 安全位），主签名恰 2 不回归', async () => {
    const { host } = await mountView(QueryXrayView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length, '视图 terms 注入→动态 provider 恰 json+ndjson 两份').toBe(2);
    expect(dynRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson']);
    expect(quoteRegs().length, '主 provider 签名计数不回归').toBe(2);
  });

  it('B2 RankDebugView：同上双通道', async () => {
    const { host } = await mountView(RankDebugView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(2);
    expect(quoteRegs().length).toBe(2);
  });

  it('B3 ScoreExplainView：同上双通道', async () => {
    const { host } = await mountView(ScoreExplainView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(2);
    expect(quoteRegs().length).toBe(2);
  });

  it('B4 SearchSandboxView：同上双通道', async () => {
    const { host } = await mountView(SearchSandboxView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(2);
    expect(quoteRegs().length).toBe(2);
  });

  it('B5 AliasesView：filter 编辑器在写面板内——先造条件点开（660-C3），面板开后双通道真达', async () => {
    const { host } = await mountView(AliasesView);
    await settle();
    expect(host.querySelector('.monaco-host'), '面板未开时编辑器不在场').toBeNull();
    const btn = [...host.querySelectorAll('button')].find(b => (b.textContent || '').includes('新建别名'));
    expect(btn, '新建别名钮在场（canOps 于 me==null 恒 true）').toBeTruthy();
    (btn as HTMLButtonElement).click();
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(2);
    expect(quoteRegs().length).toBe(2);
  });
});

/* ---------- C 下界计数锁（650-C2 计数册口径） ---------- */
describe('661 批 C 全站 terms 闭包下界计数', () => {
  it('C1 全站视图 terms 闭包 ≥9（658+660 四面+五面；662 三程第二批只增不减）', () => {
    const dir = join(__dirname, '../views');
    const files = readdirSync(dir).filter(f => f.endsWith('.vue'));
    let n = 0;
    for (const f of files) {
      n += (readFileSync(join(dir, f), 'utf-8').match(/terms: \(f: string, p: string\) => \w+\.suggestAsync\(f, p\)/g) || []).length;
    }
    expect(n).toBeGreaterThanOrEqual(9);
  });
});
