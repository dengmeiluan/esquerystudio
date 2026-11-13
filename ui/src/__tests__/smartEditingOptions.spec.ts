/** ux2 Task 2：editor.create 智能编辑 options 钉（全实例共享）+ ensureLanguages 随 onMounted 触发。
 *  stub 捕获 create options 逐键断言；languages.register 捕获钉语言层接线。 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const caps = vi.hoisted(() => ({ options: [] as any[], langs: [] as string[] }));

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const fakeEditor = {
    onDidChangeModelContent: () => ({ dispose() {} }),
    addAction: () => {},
    getValue: () => '',
    setValue: () => {},
    updateOptions: () => {},
    dispose: () => {},
  };
  return {
    editor: {
      defineTheme: () => {},
      create: (_host: any, o: any) => { caps.options.push(o); return fakeEditor; },
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      register: (d: { id: string }) => { caps.langs.push(d.id); },
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }), /* ux2 Task 4：quick fix 注册面 */
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));
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

import MonacoEditor from '../components/MonacoEditor.vue';

const apps: ReturnType<typeof createApp>[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  caps.options.length = 0;
  caps.langs.length = 0;
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('smartEditingOptions', () => {
  it('editor.create 携带智能编辑六件套 + quickSuggestions.strings 解锁', async () => {
    const app = createApp({ render: () => h(MonacoEditor as any, { modelValue: '{}' }) });
    apps.push(app);
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    expect(caps.options.length).toBe(1);
    const o = caps.options[0];
    expect(o.autoClosingBrackets, '敲 { 自动补 }').toBe('languageDefined');
    expect(o.autoClosingQuotes, '敲 " 自动补闭引号').toBe('languageDefined');
    expect(o.autoSurround, '选中敲 "/括号自动包裹').toBe('languageDefined');
    expect(o.autoIndent).toBe('full');
    expect(o.formatOnPaste).toBe(true);
    expect(o.formatOnType).toBe(true);
    expect(o.bracketPairColorization).toEqual({ enabled: true });
    expect(o.quickSuggestions, '串内自动弹补全是关键解锁').toEqual({ other: true, strings: true, comments: false });
  });

  it('onMounted 触发 ensureLanguages（四自研语言注册）', async () => {
    /* ensureLanguages 模块级幂等（Task 1 已钉死二次调用零注册）——用例 1 的 mount 已消费唯一一次注册，
       故本用例 resetModules 重置 done 标志后动态取全新组件，独立观察首次注册。 */
    vi.resetModules();
    const { default: FreshMonacoEditor } = await import('../components/MonacoEditor.vue');
    const app = createApp({ render: () => h(FreshMonacoEditor as any, { modelValue: '{}' }) });
    apps.push(app);
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    expect(caps.langs).toEqual(['lucene', 'painless', 'ndjson', 'synonyms']);
  });
});
