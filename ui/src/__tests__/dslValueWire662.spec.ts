/**
 * 六百六十二批（轨1 · Monaco DSL 值位动态候选消费面三程·第二批）：
 * 658 首发（DqlQueryView）+660 二程（DevTools/IndexHub DSL tab/Rest）+661 三程第一批
 * （QueryXray/RankDebug/ScoreExplain/SearchSandbox/Aliases filter）的姊妹刀——
 * 工具面六件接线（⑥661 头号候选，661 范式照抄：每面=useTermsSuggest 实例+terms 闭包一行刀，
 * 索引源与 fields 同源现调现读）：
 *   PitScrollView（filter）/ProfileFlameView/MatchMatrixView/UpdateByQueryView（query 段）/
 *   ReindexAdvancedView（raQueryAssist+raBodyAssist 双件）/ReindexPreviewView。
 * ⚠661-C1 纪律：「挂了 assist」≠「fields 拉到了」——每面 A 锚含 ensure 调用链在场断言
 *   （PitScroll/ProfileFlame/MatchMatrix=fields 闭包内 lazy ensure 形态；
 *   UpdateByQuery/ReindexAdvanced/ReindexPreview=watch immediate 形态，528/554 范式）。
 * SearchTemplatesView（模板源参数化值位语义）另议维持；零语义面裁决备案 661 已闭册。
 *   A 源锚（readFileSync 字面锁，661 spec A 段同范式）：六面 import/实例/闭包+fields 源+ensure 链。
 *   B 挂载冒烟（661 B 段范式，六面均挂载即渲无须先造条件）：六视图 terms 注入真达
 *     JsonArea→MonacoEditor——动态恰 json+ndjson 两份且无 triggerCharacters（655-C1 安全位：
 *     dslRegs ['"'] 过滤器不认=monacoDslAssist 计数零扰动）+主签名 ['"'] 恰 2 不回归。
 *     ⚠UpdateByQuery/ReindexAdvanced 另有 painless 面（骨架补全签名 ['[', '.'] 长度 2≠1 且
 *     首字符非 '"'）——dynRegs/quoteRegs 过滤器天然不误捕，计数断言安全（655-C1 同理）。
 *   C 下界计数锁（650-C2 计数册实测口径）：全站视图 terms 闭包 ≥15（661 后 9+ 6），
 *     三程后续批（SearchTemplates 另议/Monaco 三程低优收尾）只增不减。
 * 同步更新（650-C3 全目录 grep 实证）：零——六面 assist 行无 spec 直锁（模板行锁
 *     freeEditorTiers530/rebuildFlat534/qrtPagerExportTranspose525 锁模板属性名零触；
 *     monacoLanguagePenetration ②④⑤ 行为锁 fields/bodyKind 函数与 search 档语义，
 *     terms 追加零回退；assistLintWave533 ra 锁 ref/watch/lint 链零触）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（661 spec 同范式逐件复制） */
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

/* contrib/worker 全空 mock——斩断真实 monaco 导入链（658/660/661 spec 同清单） */
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

/* 六视图挂载冒烟用：堵挂载期网络出口（661 spec 同口径） */
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
import PitScrollView from '../views/PitScrollView.vue';
import ProfileFlameView from '../views/ProfileFlameView.vue';
import MatchMatrixView from '../views/MatchMatrixView.vue';
import UpdateByQueryView from '../views/UpdateByQueryView.vue';
import ReindexAdvancedView from '../views/ReindexAdvancedView.vue';
import ReindexPreviewView from '../views/ReindexPreviewView.vue';

const registrations = () => (monacoStub as any).__registrations as Reg[];
const completionRegs = () => registrations().filter(r => typeof r.provider?.provideCompletionItems === 'function');
/* 动态 provider=无 triggerCharacters 的补全注册（655-C1：主 provider 恰 ['"']、painless ['[','.'] 均不误捕） */
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

/* ---------- A 源锚（readFileSync 字面锁；每面含 ensure 链在场锚=661-C1 纪律） ---------- */
describe('662 批 A 源锚：六消费面接线（661 范式照抄）', () => {
  it('A1 PitScrollView 接线：useTermsSuggest（索引源=index，与 assistFields 同源）+ dslAssist terms 闭包（fields 惰性 ensure 形态保持=661-C1 在场锚；662-C1 裁决：lazy-only 首触时滞为 524 批既定契约形态〔真机 UX=首键空二键满〕，与 watch immediate 姊妹形态并存合法，探针判据=二次触发，不加 watch 避破 fieldPickerPenetration 挂载零请求计数锁）', () => {
    const src = readSrc('../views/PitScrollView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const ptTerms = useTermsSuggest(() => index.value);');
    expect(src).toContain('terms: (f: string, p: string) => ptTerms.suggestAsync(f, p)');
    expect(src).toContain('const { fields: assistFields, ensure: ensureAssistFields } = useIndexFields(() => index.value);');
    expect(src).toContain('if (!assistFields.value.length) ensureAssistFields();');
  });

  it('A2 ProfileFlameView 接线：useTermsSuggest（索引源=index，与 assistFields 同源）+ dslAssist terms 闭包（惰性 ensure+watch immediate 双锚在场）', () => {
    const src = readSrc('../views/ProfileFlameView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const pfTerms = useTermsSuggest(() => index.value);');
    expect(src).toContain('terms: (f: string, p: string) => pfTerms.suggestAsync(f, p)');
    expect(src).toContain('watch(index, () => { void ensureAssistFields(); }, { immediate: true });');
  });

  it('A3 MatchMatrixView 接线：useTermsSuggest（索引源=index，与 assistFields 同源）+ dslAssist terms 闭包（惰性 ensure+watch immediate 双锚在场）', () => {
    const src = readSrc('../views/MatchMatrixView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const mmTerms = useTermsSuggest(() => index.value);');
    expect(src).toContain('terms: (f: string, p: string) => mmTerms.suggestAsync(f, p)');
    expect(src).toContain('watch(index, () => { void ensureAssistFields(); }, { immediate: true });');
  });

  it('A4 UpdateByQueryView 接线：useTermsSuggest（索引源=index，与 uqIdxFields 同源）+ uqQueryAssist terms 闭包（watch immediate ensure 在场=661-C1 在场锚）', () => {
    const src = readSrc('../views/UpdateByQueryView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const uqTerms = useTermsSuggest(() => index.value);');
    expect(src).toContain('terms: (f: string, p: string) => uqTerms.suggestAsync(f, p)');
    expect(src).toContain('const { fields: uqIdxFields, ensure: ensureUqFields } = useIndexFields(() => index.value);');
    expect(src).toContain('watch(index, () => { void ensureUqFields(); }, { immediate: true });');
  });

  it('A5 ReindexAdvancedView 接线：useTermsSuggest（索引源=srcIndex，与 raSrcFields 同源）+ raQueryAssist/raBodyAssist 双件 terms 闭包（watch immediate ensure 在场）', () => {
    const src = readSrc('../views/ReindexAdvancedView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain('const raTerms = useTermsSuggest(() => srcIndex.value);');
    expect(src).toContain('terms: (f: string, p: string) => raTerms.suggestAsync(f, p)');
    expect(src).toContain('const { fields: raSrcFields, ensure: ensureRaFields } = useIndexFields(() => srcIndex.value);');
    expect(src).toContain('watch(srcIndex, () => { if (!srcRemote.value) void ensureRaFields(); }, { immediate: true });');
  });

  it('A6 ReindexPreviewView 接线：useTermsSuggest（索引源=source||pickedIdx，与 rpFields 同源）+ rpAssist terms 闭包（watch immediate ensure 在场）', () => {
    const src = readSrc('../views/ReindexPreviewView.vue');
    expect(src).toContain("import { useTermsSuggest } from '../composables/useTermsSuggest';");
    expect(src).toContain("const rpTerms = useTermsSuggest(() => source.value || store.pickedIdx || '');");
    expect(src).toContain('terms: (f: string, p: string) => rpTerms.suggestAsync(f, p)');
    expect(src).toContain("const { fields: rpFields, ensure: ensureRpFields } = useIndexFields(() => source.value || store.pickedIdx || '');");
    expect(src).toContain('watch(source, () => { ensureRpFields(); }, { immediate: true });');
  });
});

/* ---------- B 挂载冒烟（661 B 段范式：六面均挂载即渲，terms 注入真达 JsonArea→MonacoEditor） ---------- */
describe('662 批 B 挂载冒烟：六视图动态通道真达 + 主签名不回归', () => {
  it('B1 PitScrollView：动态恰 json+ndjson 两份无 triggerCharacters（655-C1 安全位），主签名恰 2 不回归', async () => {
    const { host } = await mountView(PitScrollView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length, '视图 terms 注入→动态 provider 恰 json+ndjson 两份').toBe(2);
    expect(dynRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson']);
    expect(quoteRegs().length, '主 provider 签名计数不回归').toBe(2);
  });

  it('B2 ProfileFlameView：同上双通道', async () => {
    const { host } = await mountView(ProfileFlameView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(2);
    expect(quoteRegs().length).toBe(2);
  });

  it('B3 MatchMatrixView：同上双通道', async () => {
    const { host } = await mountView(MatchMatrixView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(2);
    expect(quoteRegs().length).toBe(2);
  });

  it('B4 UpdateByQueryView：query JsonArea+script painless 两枚编辑器（均挂 uqQueryAssist）→ 动态 2 实例×json+ndjson 逐语言=4 份（658 注册契约每实例口径），主签名 4 不回归', async () => {
    const { host } = await mountView(UpdateByQueryView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(4);
    expect(dynRegs().map(r => r.lang).sort()).toEqual(['json', 'json', 'ndjson', 'ndjson']);
    expect(quoteRegs().length).toBe(4);
  });

  it('B5 ReindexAdvancedView：raQueryAssist 双件同源——query JsonArea+script painless 两枚编辑器同挂 → 动态 4 份，主签名 4 不回归（body JsonArea 折叠未渲=4 非 6 实证）', async () => {
    const { host } = await mountView(ReindexAdvancedView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(4);
    expect(dynRegs().map(r => r.lang).sort()).toEqual(['json', 'json', 'ndjson', 'ndjson']);
    expect(quoteRegs().length).toBe(4);
  });

  it('B6 ReindexPreviewView：rpAssist search 档双通道', async () => {
    const { host } = await mountView(ReindexPreviewView);
    await settle();
    expect(host.querySelector('.monaco-host')).toBeTruthy();
    expect(dynRegs().length).toBe(2);
    expect(quoteRegs().length).toBe(2);
  });
});

/* ---------- C 下界计数锁（650-C2 计数册口径） ---------- */
describe('662 批 C 全站 terms 闭包下界计数', () => {
  it('C1 全站视图 terms 闭包 ≥15（658+660 四面+661 五面+六面；三程后续批只增不减）', () => {
    const dir = join(__dirname, '../views');
    const files = readdirSync(dir).filter(f => f.endsWith('.vue'));
    let n = 0;
    for (const f of files) {
      n += (readFileSync(join(dir, f), 'utf-8').match(/terms: \(f: string, p: string\) => \w+\.suggestAsync\(f, p\)/g) || []).length;
    }
    expect(n).toBeGreaterThanOrEqual(15);
  });
});
