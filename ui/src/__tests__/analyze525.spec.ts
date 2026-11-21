/**
 * 五百二十五批 W5b：_analyze body 档 + setLineMarkers 行号直射 marker。
 *
 * ① analyze 档（BodyKind 扩 'analyze'，视图侧 bodyKind: () => 'analyze' 直传）：
 *    键位（串内）出 ANALYZE_KEY_SNIPPETS 八键骨架（analyzer/text/field/tokenizer/
 *    filter/char_filter/normalizer/explain，Snippet+detail+W5-1 双关+逗号自适应）；
 *    值位分派——analyzer/search_analyzer→BUILTIN_ANALYZERS，tokenizer→BUILTIN_TOKENIZERS，
 *    filter→BUILTIN_TOKEN_FILTERS，char_filter→BUILTIN_CHAR_FILTERS（各自 ∪ analyzers() 实名），
 *    normalizer 只出实名组件（无内置）；field 出 fields()；
 *    text 等白名单外值位压住；串外压住（W6 三档同口径）。
 * ② 不回归：search 档 analyzer 值位仍钉空（524+1 既有口径）；mapping 档 analyzers 通道
 *    仍只出实名（内置清单不泄入）。
 * ③ setLineMarkers 契约：行号直射 Warning marker（绕开 setMarkers 的 findMatches 锚点定位），
 *    owner 透传（多 lint 源互不清、与 JSON 诊断 owner 'json' 分离）、行覆盖整行
 *    （endColumn=getLineMaxColumn）、model 缺席早退、owners 随组件卸载清空。
 * ④ monaco 注册计数契约同步更新点名：analyze 档不加新语言 provider——json+ndjson 的
 *    dslAssist 补全恒 2、painless 补全 1、hover（json/ndjson/painless）各 1，524 前后同值。
 *
 * stub 范式照抄 monaco524Assist.spec（editor.api 全 mock + provider 直调断言）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

type Reg = { lang: string; provider: any; disposed: boolean; kind: 'completion' | 'hover' };

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const registrations: Reg[] = [];
  let currentModel: any = null;
  let markerCalls: any[] = [];
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
    getModel: () => currentModel,
    dispose: () => {},
  };
  return {
    __registrations: registrations,
    __setCurrentModel: (m: any) => { currentModel = m; },
    __markerCalls: markerCalls,
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: (_model: any, owner: string, markers: any[]) => { markerCalls.push({ owner, markers }); },
    },
    languages: {
      registerCompletionItemProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false, kind: 'completion' };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      registerHoverProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false, kind: 'hover' };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {},
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
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

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import MonacoEditor from '../components/MonacoEditor.vue';
import { ANALYZE_KEY_SNIPPETS, BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS } from '../utils/dslCompletionContext';

const registrations = () => (monacoStub as any).__registrations as Reg[];
const completionRegs = (lang: string) => registrations().filter(r => r.kind === 'completion' && r.lang === lang);
const hoverRegs = () => registrations().filter(r => r.kind === 'hover');
const markerCalls = () => (monacoStub as any).__markerCalls as { owner: string; markers: any[] }[];
const Kind = (monacoStub as any).languages.CompletionItemKind;
const Rule = (monacoStub as any).languages.CompletionItemInsertTextRule;
const Sev = (monacoStub as any).MarkerSeverity; /* stub 顶层导出（与真 monaco 一致） */

function offsetToPos(doc: string, off: number) {
  let line = 1, last = -1;
  for (let i = 0; i < off; i++) if (doc[i] === '\n') { line++; last = i; }
  return { lineNumber: line, column: off - last };
}

const FIELDS = [{ path: 'title', type: 'text' }, { path: 'price', type: 'long' }];
const apps: ReturnType<typeof createApp>[] = [];

function mountEditor(props: Record<string, any>) {
  const app = createApp({ render: () => h(MonacoEditor as any, props) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return app;
}

function suggest(doc: string, offset = doc.length, dslAssist: any = null): any[] {
  /* 同用例内多次 mount 时取最新一份未 disposed 的 json provider（旧挂载的 bodyKind 闭包是陈旧档） */
  const reg = completionRegs('json').filter(r => !r.disposed).pop();
  expect(reg, 'json dslAssist provider 应已注册').toBeTruthy();
  const model = {
    getValue: () => doc,
    getOffsetAt: () => offset,
    getPositionAt: (off: number) => offsetToPos(doc, off),
  };
  return reg!.provider.provideCompletionItems(model, {}).suggestions;
}

const AZ_ASSIST = { fields: () => FIELDS, bodyKind: () => 'analyze' as const, analyzers: () => ['my_anz'] };

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  registrations().length = 0;
  (monacoStub as any).__setCurrentModel(null);
  (monacoStub as any).__markerCalls.length = 0;
});
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('525 analyze 档数据（dslCompletionContext）', () => {
  it('ANALYZE_KEY_SNIPPETS 八键全 snippet+detail；BUILTIN_ANALYZERS 内置清单含 ik 双实名', () => {
    expect(Object.keys(ANALYZE_KEY_SNIPPETS)).toEqual([
      'analyzer', 'text', 'field', 'tokenizer', 'filter', 'char_filter', 'normalizer', 'explain',
    ]);
    for (const [k, snip] of Object.entries(ANALYZE_KEY_SNIPPETS)) {
      expect(snip.detail, k + ' 带一句话说明').toBeTruthy();
      expect(snip.text, k + ' 骨架自带键引号').toMatch(/^"/);
    }
    for (const a of ['standard', 'simple', 'whitespace', 'stop', 'keyword', 'pattern', 'fingerprint', 'ik_max_word', 'ik_smart']) {
      expect(BUILTIN_ANALYZERS).toContain(a);
    }
  });
});

describe('525 analyze 档分派（MonacoEditor computeSuggestions）', () => {
  it('键位（串内）：八键骨架 Snippet+detail+W5-1 双关，接受后（补全残壳）合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: AZ_ASSIST });
    const doc = '{\n  "\n}';
    const s = suggest(doc, 5);
    expect(s.map(i => i.label)).toEqual(Object.keys(ANALYZE_KEY_SNIPPETS));
    for (const i of s) {
      expect(i.kind).toBe(Kind.Snippet);
      expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      expect(i.detail).toBeTruthy();
      expect(i.filterText).toBe('"' + i.label);
      expect(i.sortText).toMatch(/^!\d{3}/);
      expect(i.command?.id).toBe('editor.action.formatDocument');
    }
    /* 逗号自适应：层尾（右邻 }）不带尾逗号 */
    expect(s.find((i: any) => i.label === 'analyzer').insertText.endsWith(',')).toBe(false);
    /* 后跟兄弟键带尾逗号（接受落文本锚定） */
    const doc2 = '{\n  "\n  "explain": true\n}';
    const az = suggest(doc2, 5).find((i: any) => i.label === 'analyzer');
    expect(az.insertText.endsWith(',')).toBe(true);
  });

  it('analyzer 值位：内置 ∪ analyzers() 实名（Set 去重），Value kind + 整串 range + W5-1 双关', () => {
    mountEditor({ modelValue: '{}', dslAssist: { ...AZ_ASSIST, analyzers: () => ['my_anz', 'standard'] } });
    const doc = '{"analyzer": "ik';
    const s = suggest(doc);
    expect(s.map(i => i.label)).toEqual([...BUILTIN_ANALYZERS, 'my_anz']); /* standard 撞内置被去重 */
    for (const [idx, i] of s.entries()) {
      expect(i.kind).toBe(Kind.Value);
      expect(i.insertText).toBe('"' + i.label + '"');
      expect(i.filterText).toBe('"' + i.label);
      expect(i.sortText).toBe('!' + String(idx).padStart(3, '0') + i.label);
      expect(i.command?.id).toBe('editor.action.formatDocument');
    }
    /* range 覆盖整串：起=值串起始引号，接受后整串干净替换（insertText 自带闭合引号） */
    const p = s.find((i: any) => i.label === 'ik_max_word');
    const after = doc.slice(0, doc.indexOf('"ik')) + p.insertText + '}';
    expect(() => JSON.parse(after), after).not.toThrow();
    expect(JSON.parse(after).analyzer).toBe('ik_max_word');
  });

  it('analyzers() 缺席：analyzer 纯内置；tokenizer/filter/char_filter 各用各自内置表；normalizer 无内置', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'analyze' as const } });
    expect(suggest('{"analyzer": "ik').map(i => i.label)).toEqual(BUILTIN_ANALYZERS);
    expect(suggest('{"search_analyzer": "x').map(i => i.label)).toEqual(BUILTIN_ANALYZERS);
    expect(suggest('{"tokenizer": "x').map(i => i.label)).toEqual(BUILTIN_TOKENIZERS);
    expect(suggest('{"filter": "x').map(i => i.label)).toEqual(BUILTIN_TOKEN_FILTERS);
    expect(suggest('{"char_filter": "x').map(i => i.label)).toEqual(BUILTIN_CHAR_FILTERS);
    /* 数组首元素位（"filter": ["）同样归位 */
    expect(suggest('{"filter": ["').map(i => i.label)).toEqual(BUILTIN_TOKEN_FILTERS);
    expect(suggest('{"char_filter": ["').map(i => i.label)).toEqual(BUILTIN_CHAR_FILTERS);
    expect(suggest('{"normalizer": "x'), 'normalizer 无内置且无实名时压住').toEqual([]);
  });

  it('实名组件并入对应类：tokenizer/filter 各自 ∪ custom，normalizer 只出 custom', () => {
    mountEditor({ modelValue: '{}', dslAssist: { ...AZ_ASSIST, analyzers: () => ['my_tok', 'my_norm'] } });
    expect(suggest('{"tokenizer": "x').map(i => i.label)).toEqual([...BUILTIN_TOKENIZERS, 'my_tok', 'my_norm']);
    expect(suggest('{"filter": "x').map(i => i.label)).toEqual([...BUILTIN_TOKEN_FILTERS, 'my_tok', 'my_norm']);
    expect(suggest('{"normalizer": "x').map(i => i.label)).toEqual(['my_tok', 'my_norm']);
  });

  it('1439：按类别实名通道（analyzers/normalizers/tokenizers/filters/charFilters）各取各的', () => {
    mountEditor({
      modelValue: '{}',
      dslAssist: {
        fields: () => FIELDS, bodyKind: () => 'analyze' as const,
        analyzers: () => ['a1'], normalizers: () => ['n1'], tokenizers: () => ['t1'],
        filters: () => ['f1'], charFilters: () => ['c1'],
      },
    });
    expect(suggest('{"analyzer": "x').map(i => i.label)).toEqual([...BUILTIN_ANALYZERS, 'a1']);
    expect(suggest('{"tokenizer": "x').map(i => i.label)).toEqual([...BUILTIN_TOKENIZERS, 't1']);
    expect(suggest('{"filter": "x').map(i => i.label)).toEqual([...BUILTIN_TOKEN_FILTERS, 'f1']);
    expect(suggest('{"char_filter": "x').map(i => i.label)).toEqual([...BUILTIN_CHAR_FILTERS, 'c1']);
    expect(suggest('{"normalizer": "x').map(i => i.label)).toEqual(['n1']);
  });

  it('1439：mapping 档 normalizer 值位只出 normalizers 通道（不再混 analyzer 实名）', () => {
    mountEditor({
      modelValue: '{}',
      dslAssist: {
        fields: () => FIELDS, bodyKind: () => 'mapping' as const,
        analyzers: () => ['a1'], normalizers: () => ['n1'],
      },
    });
    expect(suggest('{"properties": {"a": {"analyzer": "').map(i => i.label)).toEqual(['a1']);
    expect(suggest('{"properties": {"a": {"normalizer": "').map(i => i.label)).toEqual(['n1']);
  });

  it('field 值位出 fields()；text 值位压住（白名单外不弹）', () => {
    mountEditor({ modelValue: '{}', dslAssist: AZ_ASSIST });
    expect(suggest('{"field": "ti').map(i => i.label)).toEqual(['title', 'price']);
    expect(suggest('{"text": "hello wo')).toEqual([]);
  });

  it('串外压住（W6 三档同口径）；bodyKind 闭包现调现读（analyze↔search 切换即时生效）', () => {
    let bk: 'analyze' | 'search' = 'analyze';
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => bk } });
    expect(suggest('{  }', 2), '串外空位不出档').toEqual([]);
    bk = 'search';
    expect(suggest('{  }', 2).length, '切回 search 后同一位置照旧走 W4 路径').toBeGreaterThan(0);
  });

  it('不回归：search 档 analyzer 值位仍钉空（524+1 口径）；mapping 档 analyzers 通道不出内置', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, analyzers: () => ['my_anz'] } });
    expect(suggest('{"analyzer": "ik'), 'search 档组件名键钉空').toEqual([]);
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mapping' as const, analyzers: () => ['my_anz'] } });
    const labels = suggest('{"analyzer": "ik').map(i => i.label);
    expect(labels).toEqual(['my_anz']);
    expect(labels).not.toContain('standard');
  });
});

describe('525 setLineMarkers 契约（MonacoEditor expose）', () => {
  it('expose 面存在；model 缺席早退（零 marker 调用）', async () => {
    let exposed: any = null;
    const app = createApp({ render: () => h(MonacoEditor as any, { modelValue: '', ref: (v: any) => { exposed = v; } }) });
    apps.push(app);
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    expect(typeof exposed?.setLineMarkers).toBe('function');
    expect(exposed.setLineMarkers([{ line: 1, message: 'x' }], 'es-syn-lint')).toBeUndefined();
    expect(markerCalls().length, 'model 缺席早退').toBe(0);
  });

  it('行号直射：severity 恒 Warning、行覆盖整行（endColumn=getLineMaxColumn）、owner 透传', async () => {
    mountEditor({ modelValue: '' });
    (monacoStub as any).__setCurrentModel({
      getLineMaxColumn: (line: number) => line * 10,
      findMatches: () => [],
    });
    let exposed: any = null;
    const app = createApp({ render: () => h(MonacoEditor as any, { modelValue: '', ref: (v: any) => { exposed = v; } }) });
    apps.push(app);
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    exposed.setLineMarkers([{ line: 3, message: '第 3 行有中文标点' }, { line: 5, message: '=> 右侧空' }], 'es-syn-lint');
    expect(markerCalls().length).toBe(1);
    expect(markerCalls()[0].owner).toBe('es-syn-lint');
    const ms = markerCalls()[0].markers;
    expect(ms.length).toBe(2);
    expect(ms[0].severity).toBe(Sev.Warning);
    expect(ms[0].message).toBe('第 3 行有中文标点');
    expect(ms[0].startLineNumber).toBe(3);
    expect(ms[0].startColumn).toBe(1);
    expect(ms[0].endLineNumber).toBe(3);
    expect(ms[0].endColumn, '行尾列= getLineMaxColumn(3)').toBe(30);
    expect(ms[1].endLineNumber).toBe(5);
  });

  it('1178：行号越界必须先钳位——远端行号（ES 报错 line 4:9）落在 1 行文档上时不得抛错', async () => {
    mountEditor({ modelValue: 'SELECT 1' });
    /* 真 Monaco 越界即抛 `Illegal value for lineNumber`（异常冒到 Vue 渲染层=整页白屏），
       这里用「越界就 throw」的桩把该契约钉死，而不是只比对数字。 */
    (monacoStub as any).__setCurrentModel({
      getLineCount: () => 1,
      getLineMaxColumn: (line: number) => {
        if (line < 1 || line > 1) throw new Error('Illegal value for lineNumber');
        return 9;
      },
      findMatches: () => [],
    });
    let exposed: any = null;
    const app = createApp({ render: () => h(MonacoEditor as any, { modelValue: 'SELECT 1', ref: (v: any) => { exposed = v; } }) });
    apps.push(app);
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();

    expect(() => exposed.setLineMarkers([{ line: 4, message: 'line 4:9: Unknown column [bond_cod]' }], 'es-sql-runerr', 'error'))
      .not.toThrow();
    const mc = markerCalls(); const ms = mc[mc.length - 1].markers;
    expect(ms[0].startLineNumber, '越界行号钳到末行').toBe(1);
    expect(ms[0].endLineNumber).toBe(1);
    expect(ms[0].severity, 'severity 仍按调用方给 error').toBe(Sev.Error);

    /* 合法行号不被打扰（钳位不得改写在界内的行） */
    exposed.setLineMarkers([{ line: 1, message: 'ok' }], 'es-sql-lint');
    const mc2 = markerCalls(); expect(mc2[mc2.length - 1].markers[0].startLineNumber).toBe(1);
  });

  it('多 lint 源互不清（es-syn-lint 与 es-dsl-lint 并存）；卸载清空各 owner', async () => {
    mountEditor({ modelValue: '' });
    (monacoStub as any).__setCurrentModel({
      getLineMaxColumn: () => 4,
      findMatches: (needle: string) => (needle === '"price"' ? [{ range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 9 } }] : []),
    });
    let exposed: any = null;
    const app = createApp({ render: () => h(MonacoEditor as any, { modelValue: '', ref: (v: any) => { exposed = v; } }) });
    apps.push(app);
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    exposed.setLineMarkers([{ line: 2, message: 'syn lint' }], 'es-syn-lint');
    exposed.setMarkers([{ message: 'm', suggestion: 's', severity: 'error' as const, anchor: 'price', nth: 0 }]);
    const owners = markerCalls().map(c => c.owner);
    expect(owners).toEqual(['es-syn-lint', 'es-dsl-lint']); /* 前一调用不被后一调用清掉 */
    /* 卸载只清 setLineMarkers 记账的 owner——setMarkers（es-dsl-lint）不归其列（524 既有契约） */
    const callsBefore = markerCalls().length;
    app.unmount();
    const cleanups = markerCalls().slice(callsBefore);
    expect(cleanups.map(c => c.owner)).toEqual(['es-syn-lint']);
    expect(cleanups[0].markers, '卸载清空 = 空 marker 集').toEqual([]);
  });
});

describe('525 monaco 注册计数契约同步更新点名（analyze 档不加新 provider）', () => {
  it('dslAssist 在档：json+ndjson 补全恒 2、painless 补全 1、hover json/ndjson/painless 各 1——524 前后同值', () => {
    mountEditor({ modelValue: '{}', dslAssist: AZ_ASSIST });
    expect(completionRegs('json').length).toBe(1);
    expect(completionRegs('ndjson').length).toBe(1);
    expect(completionRegs('painless').length).toBe(1);
    expect(hoverRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson', 'painless']);
  });
});
