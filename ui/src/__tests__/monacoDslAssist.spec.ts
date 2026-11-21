/**
 * W4 Task 13：MonacoEditor 可选 DSL 补全 provider（dslAssist）接线。
 *
 * 用例清单（controller 裁定）：
 *   ① dslAssist 缺席零影响——mount 不炸、registerCompletionItemProvider 不被调；
 *   ② 传了则注册（'json' + triggerCharacters ['"']），dispose 随卸载调用；
 *   ③ root 键位出 ROOT_KEYS（2.6.0：八键全 Snippet 骨架 + detail + commaAffixes 逗号自适应）；
 *   ④ query-type 键位出全量算子 snippets（Snippet + InsertAsSnippet 规则）；
 *   ⑤ field 键位出 dslAssist.fields() 清单（2.6.0：Snippet 值骨架，detail=type）；
 *      附：第二键位（',' 后开串）仍出——锁定守卫 ',' 分支；
 *   ⑥ 值位/值串内三档均不出（T12 评审守卫）：
 *      {"query":⏎（root 档值位）/ {"query": "he⏎（root 档值串）/
 *      {"query": {"match": "he⏎（query-type 档值串）/ {"query": {"match": {"title": "he⏎（field 档值串）；
 *   ⑦ none 档（非 query/aggs 深层区）恒空（2.6.0 Task 8 起 aggs 容器/实例值键位改出 agg-name/agg-type 档）；
 *   ⑭ 2.6.0 Task 8 聚合档：agg-name（aggs 容器键位，实例名+类型一步骨架）/agg-type（实例值对象键位，
 *      十键聚合骨架 + aggs 嵌套键，逗号自适应）；
 *   ⑧ DslQueryView 冒烟：mount 不炸；W4-T14 渗透后视图主编辑器传 dslAssist → 签名注册恰 1 条。
 *   ⑬ ux2：旧 registerCompletion（['"','.'] 裸词 provider）退役——DslQueryView 挂载后零该签名注册。
 *   ⑨ I-1 回归：range 覆盖闭合串——root 档无闭合引号（{ "que⏎）/ auto-close（{ "que⏎" }）、
 *      field 档两形态，接受后整串干净替换无双引号残壳；
 *   ⑩ M-2：数组裸元素位（"must": [⏎ / ["x", ⏎，栈顶 '['）压住；
 *      元素对象已开（"must": [{⏎，栈顶 '{'）仍出 query-type。
 *   N-1/N-2（T13 复审）：右扫有界——串外裸键位（Ctrl+Space）end=光标纯插入，
 *      不吞后文结构（}, "size" 完好、JSON 合法）；串内右扫遇 \n 即停（JSON 串不跨行），跨行不吞。
 *   ⑪ W5-1（真机复扫观察项①）：三档 sortText 均带 '!' 升权前缀（压过 JSON LS $schema）且组内保序；
 *      filterText 均带 '"' 前缀（敲 " 后过滤 pattern 含引号，无 filterText 拿 label 匹配会被整档过滤）。
 *   ⑫ ux2 裸词左扩（Task 3）：串外裸词位 range 左扩词首——root/field（含点分隔路径整段覆盖）/
 *      query-type（snippet 接受不产 ma"match" 残壳）三档。
 *   W6 bodyKind 分派（dslAssist 契约扩展 bodyKind?: () => BodyKind）：
 *      settings=串内键位出设置键（带 detail），值位（起始引号左侧 ':'）压住；
 *      mapping=键位出 properties 骨架（Snippet + InsertAsSnippet）；none=恒空；
 *      缺省（含显式 undefined）回退 search 三档（W4 现状回归）；bodyKind 闭包每次触发重新取值。
 *
 * stub 范式：vi.mock monaco editor.api（__registrations 捕获注册的 provider 对象，
 * 直接调 provideCompletionItems 断言 suggestions 有/无——守卫行为固化）；
 * CompletionItemKind/InsertTextRule 数值贴 monaco 0.52.2 真实枚举（M-3），断言一律符号引用；
 * contrib/worker 全部空 mock；../api 只堵网络出口（DslQueryView 冒烟用）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

type Reg = { lang: string; provider: any; disposed: boolean };

/* monaco editor.api stub——注册捕获 + 最小 editor 面（onMounted 链路：create/onDidChangeModelContent/addAction） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const registrations: Reg[] = [];
  const langConfs: any[] = []; /* 2.6.0：setLanguageConfiguration 入参捕获 */
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
    __langConfs: langConfs,
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
      /* W3：字段 hover provider 注册面（json+ndjson 各一份，同数组捕获、dispose 同契约） */
      registerHoverProvider: (lang: string, provider: any) => {
        const rec: Reg = { lang, provider, disposed: false };
        registrations.push(rec);
        return { dispose: () => { rec.disposed = true; } };
      },
      /* ux2 Task 2：monacoLanguages 语言层注册面（ensureLanguages 随 onMounted 触发） */
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: (lang: string, conf: any) => { langConfs.push({ lang, conf }); }, /* 2.6.0：捕获语言配置入参（Task 9 注释配置断言用） */
      registerCodeActionProvider: () => ({ dispose() {} }), /* ux2 Task 4：quick fix 注册面 */
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 }, /* M-3：贴 monaco 0.52.2 真实枚举值（2.6.0 值位档补 Value） */
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

/* contrib/worker 全空 mock——斩断真实 monaco 导入链（jsdom/happy-dom 不可用） */
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

/* DslQueryView 冒烟用：只堵网络出口（同 G7 范式，惰性包装防 TDZ） */
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
      /* W4-T14：DslQueryView 新增 useIndexFields（mappingDetail 出口）——堵网络出口 */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import MonacoEditor from '../components/MonacoEditor.vue';
import DslQueryView from '../views/DslQueryView.vue';
import { QUERY_SNIPPETS, ROOT_KEYS } from '../utils/dslCompletionContext';

const registrations = () => (monacoStub as any).__registrations as Reg[];
/* dslAssist provider 签名：triggerCharacters 恰好 ['"']（ux2 Task 5 后旧 ['"','.'] 裸词 provider 已退役——签名过滤保留作防御性区分） */
const dslRegs = () => registrations().filter(r => {
  const tc = r.provider?.triggerCharacters;
  return Array.isArray(tc) && tc.length === 1 && tc[0] === '"';
});

/* W3：hover provider 签名 = 无 triggerCharacters（补全 provider 恰 ['"']） */
const hoverRegs = () => registrations().filter(r => !Array.isArray((r.provider as any)?.triggerCharacters));

/* 枚举符号引用（stub 数值已贴 monaco 0.52.2 真实值）——断言不写死数字 */
const Kind = (monacoStub as any).languages.CompletionItemKind;
const Rule = (monacoStub as any).languages.CompletionItemInsertTextRule;

/** offset → {lineNumber,column}（与真实 ITextModel.getPositionAt 同口径：1 基，\n 换行） */
function offsetToPos(doc: string, off: number) {
  let line = 1, last = -1;
  for (let i = 0; i < off; i++) if (doc[i] === '\n') { line++; last = i; }
  return { lineNumber: line, column: off - last };
}
/** {lineNumber,column} → offset（offsetToPos 逆运算） */
function posToOffset(doc: string, p: { lineNumber: number; column: number }) {
  let off = 0;
  for (let l = 1; l < p.lineNumber; l++) off = doc.indexOf('\n', off) + 1;
  return off + p.column - 1;
}
/** provider 产的 plain range → [起 offset, 止 offset) */
function rangeOffsets(doc: string, range: any): [number, number] {
  return [
    posToOffset(doc, { lineNumber: range.startLineNumber, column: range.startColumn }),
    posToOffset(doc, { lineNumber: range.endLineNumber, column: range.endColumn }),
  ];
}
/** 模拟接受建议：range 区间替换为 insertText（root/field 档均为纯文本） */
function accept(doc: string, item: any): string {
  const [s, e] = rangeOffsets(doc, item.range);
  return doc.slice(0, s) + item.insertText + doc.slice(e);
}
/** 模拟 snippet 接受：占位符落默认值（${1:x}→x、${1|a,b|}→a、${0}→''）后按 range 替换——贴 monaco 真实落文本 */
function acceptSnippet(doc: string, item: any): string {
  const text = (item.insertText as string)
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, s) => String(s).split(',')[0]) /* choice 选项逗号分隔（${1|a,b|}→a） */
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\\([$}\\])/g, '$1'); /* monaco snippet 转义还原：\$→$ \}→} \\→\（field 档动态路径转义的逆口径） */
  const [s, e] = rangeOffsets(doc, item.range);
  return doc.slice(0, s) + text + doc.slice(e);
}

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'price', type: 'long' },
];

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

/** 直接调用捕获的 provider：model stub 供 getValue/getOffsetAt/getPositionAt（光标默认文末） */
function suggest(doc: string, offset = doc.length): any[] {
  const reg = dslRegs()[0];
  expect(reg, 'dslAssist provider 应已注册').toBeTruthy();
  const model = {
    getValue: () => doc,
    getOffsetAt: () => offset,
    getPositionAt: (off: number) => offsetToPos(doc, off),
  };
  return reg.provider.provideCompletionItems(model, {}).suggestions;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  registrations().length = 0;
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('W4-T13 MonacoEditor dslAssist provider 接线', () => {
  it('① dslAssist 缺席：mount 不炸、零注册（零影响回归）', () => {
    mountEditor({ modelValue: '{}' });
    expect(document.querySelector('.monaco-host')).toBeTruthy();
    expect(registrations().length).toBe(0);
  });

  it('②-b json 语言配置显式钉 comments（2.6.0 Task 9 幂等防回归断言，终审 M2）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const confs = (monacoStub as any).__langConfs as any[];
    const json = confs.filter(c => c.lang === 'json');
    expect(json.length).toBeGreaterThan(0);
    expect(json[0].conf).toEqual({ comments: { lineComment: '//', blockComment: ['/*', '*/'] } });
  });

  it('② 传 dslAssist：json+ndjson 各注册一份（triggerCharacters ["]），dispose 随卸载全量', () => {
    const { app } = mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 五百二十一批：provider 抽工厂逐语言注册——ndjson（BulkEditor body 语言）同享补全 */
    expect(dslRegs().length).toBe(2);
    expect(dslRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson']);
    for (const r of dslRegs()) {
      expect(r.provider.triggerCharacters).toEqual(['"']);
      expect(r.disposed).toBe(false);
    }
    app.unmount();
    expect(dslRegs().every(r => r.disposed), '两份注册必须全部随卸载 dispose').toBe(true);
  });

  it('③ root 档：八键全 snippet 骨架 + detail + kind/rule + 接受后 JSON 合法（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const items = suggest('{\n  \n}', 4);
    expect(items.map((i: any) => i.label)).toEqual(ROOT_KEYS);
    for (const i of items) {
      expect(i.kind).toBe(Kind.Snippet);
      expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      expect(i.detail, i.label + ' 带一句话说明').toBeTruthy();
      expect(i.insertText, i.label + ' 骨架含冒号值位').toContain('":');
      /* 端到端：接受后文本必须是合法 JSON（占位符落默认值） */
      const after = acceptSnippet('{\n  \n}', i);
      expect(() => JSON.parse(after), i.label + ' 接受后非法：' + after).not.toThrow();
    }
    /* 键位形态抽查：query 对象骨架 / size 数字 / track_total_hits choice */
    const q = items.find((i: any) => i.label === 'query');
    /* 该位行缩进 2 → 多行骨架后续行叠加缩进（reindentSnippet 同 query-type 档口径） */
    expect(q.insertText).toBe('"query": {\n    ${0}\n  }');
    const sz = items.find((i: any) => i.label === 'size');
    expect(sz.insertText).toBe('"size": ${1:10}');
    const tth = items.find((i: any) => i.label === 'track_total_hits');
    expect(tth.insertText).toBe('"track_total_hits": ${1|true,false|}');
  });

  it('③-b root 档逗号自适应：后跟兄弟键带尾逗号；层尾不带；漏敲前逗号补齐', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 层尾（右邻 }）→ 无尾逗号 */
    const atTail = suggest('{\n  \n}', 4);
    expect(atTail.find((i: any) => i.label === 'query').insertText.endsWith(',')).toBe(false);
    /* 后跟 "size"（右邻 "）→ 尾逗号 */
    const doc2 = '{\n  \n  "size": 10\n}';
    const mid = suggest(doc2, 4);
    const q2 = mid.find((i: any) => i.label === 'query');
    expect(q2.insertText.endsWith(',')).toBe(true);
    const after2 = acceptSnippet(doc2, q2);
    expect(() => JSON.parse(after2), after2).not.toThrow();
    expect(JSON.parse(after2).size).toBe(10);
    /* 漏敲前逗号（左邻值）→ 前逗号补齐。串内位左邻非 {/, 被 dslKeyGuard 压住不可达，
       可达形态是串外裸词位（ux2 左扩同口径）：range 覆盖裸词 query，左邻 '0' → 补 ',' */
    const doc3 = '{"size": 10 query';
    const q3 = suggest(doc3).find((i: any) => i.label === 'query');
    expect(q3.insertText.startsWith(',')).toBe(true);
  });

  it('④ query-type 键位出全量算子 snippet（Snippet + InsertAsSnippet）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const s = suggest('{"query": {"');
    expect(Object.keys(QUERY_SNIPPETS).length).toBe(63);
    expect(s.length).toBe(63);
    for (const i of s) {
      expect(i.kind).toBe(Kind.Snippet);
      expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      expect(i.insertText).toBe((QUERY_SNIPPETS as Record<string, string>)[i.label]);
      /* 1133：63 条英文键旁必须有中文语义，列表可扫读 */
      expect(i.detail, i.label + ' 缺中文语义').toBeTruthy();
      /* 2.6.2：接受即格式化 command 挂载（幂等归一的正解——落位形态随动回滚，规整交给 formatDocument） */
      expect(i.command?.id, i.label + ' 挂接受即格式化 command').toBe('editor.action.formatDocument');
    }
    expect(s.find((i: any) => i.label === 'match')?.detail).toBe('全文匹配');
    expect(s.find((i: any) => i.label === 'nested')?.detail).toBe('嵌套');
    expect(s.find((i: any) => i.label === 'span_near')?.detail).toBe('近邻跨度');
    expect(s.find((i: any) => i.label === 'bool')?.detail).toBe('布尔组合');
  });

  it('④-b 深层嵌套位：snippet 后续行叠加当前行缩进（选关键字后不再塌缩）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 场景贴真机截图：must 数组元素对象内（{␣ 形态，行缩进 8）选 match——
       monaco 多行 snippet 不叠加当前行缩进，裸字面量会塌到固定 2/0 列；
       裸数组位（[⏎）被 dslKeyGuard M-2 压住不出档，真机触发位是元素对象已开形态 */
    const doc = '{\n  "query": {\n    "bool": {\n      "must": [\n        { "\n      ]\n    }\n  }\n}';
    const off = doc.indexOf('"\n      ]') + 1;
    const s = suggest(doc, off);
    const m = s.find(i => i.label === 'match');
    expect(m, '深层位仍出 query snippet 档').toBeTruthy();
    expect(m.insertText, '后续行必须叠加当前行缩进 8（snippet 相对缩进 2/0 保留）')
      .toBe('"match": {\n          "${1:field}": "${2:value}"\n        }');
    /* 落文本口径：field 行 10 列（8+2），收尾 } 与 match 键同列（8）——2.6.2 起规整由接受后 formatDocument 归一 */
    const lines = acceptSnippet(doc, m).split('\n');
    const mi = lines.findIndex(l => l.includes('"match"'));
    expect(lines[mi]).toBe('        { "match": {');
    expect(lines[mi + 1]).toBe('          "field": "value"');
    expect(lines[mi + 2]).toBe('        }');
  });

  it('④-d 接受即格式化 command：全档挂载 formatDocument（2.6.2 幂等归一）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 多行骨架档（query-type）+ 单行档（field 值位骨架）+ root 档全挂——
       落位乱不乱不再依赖触发排版：接受后 formatDocument 统一规整；
       真机场景（单行紧凑文档 {} 内落位脱钩）由 command 归一，lineBreakAffixes 手工推算路线已废弃 */
    for (const [doc, off] of [['{\n  "query": {\n    \n  }\n}', 16], ['{"query": {"match": {"', 21]] as const) {
      const items = suggest(doc, off);
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) {
        expect(i.command?.id, i.label).toBe('editor.action.formatDocument');
      }
    }
    /* must 数组元素 {} 内落文本：reindent 落点兜底（format 前的基本放置），JSON 合法 */
    const doc2 = '{\n  "query": {\n    "bool": {\n      "must": [\n        {""}\n      ]\n    }\n  }\n}';
    const m = suggest(doc2, doc2.indexOf('{""}') + 2).find((i: any) => i.label === 'match');
    expect(m.command?.id).toBe('editor.action.formatDocument');
    expect(() => JSON.parse(acceptSnippet(doc2, m))).not.toThrow();
  });

  it('④-e 常规整行空白键位行为不变（无双换行——2.6.0 口径回归）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  "query": {\n    \n  }\n}';
    /* offset 19=行 3 行尾（行 3 是 4 空格，query 5 字母——真机触发位 strStart 在行缩进后） */
    const m = suggest(doc, 19).find((i: any) => i.label === 'match');
    const lines = acceptSnippet(doc, m).split('\n');
    const mi = lines.findIndex(l => l.includes('"match"'));
    expect(lines[mi]).toBe('    "match": {');
    expect(lines[mi + 1]).toBe('      "field": "value"');
    expect(lines[mi + 2]).toBe('    }');
  });

  it('④-c query-type 档逗号自适应：query 内后跟兄弟子句带尾逗号；层尾不带（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 层尾：{"query": { | } } → 无尾逗号 */
    const tail = suggest('{\n  "query": {\n    \n  }\n}', 16);
    const mTail = tail.find((i: any) => i.label === 'match');
    expect(mTail.insertText.endsWith(',')).toBe(false);
    const afterTail = acceptSnippet('{\n  "query": {\n    \n  }\n}', mTail);
    expect(() => JSON.parse(afterTail), afterTail).not.toThrow();
    /* 后跟兄弟：{"query": { | "term": ... }} → 尾逗号，接受后合法 */
    const doc2 = '{"query": {  "term": {"a": "b"} }}';
    const mid = suggest(doc2, 12);
    const mMid = mid.find((i: any) => i.label === 'match');
    expect(mMid.insertText.endsWith(',')).toBe(true);
    const after2 = acceptSnippet(doc2, mMid);
    expect(() => JSON.parse(after2), after2).not.toThrow();
  });

  it('⑤ field 键位出 fields() 清单（Snippet + detail=type）；第二键位（"," 后）仍出', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    for (const doc of ['{"query": {"match": {"', '{"query": {"match": {"title": "x", "']) {
      const s = suggest(doc);
      expect(s.map(i => i.label)).toEqual(['title', 'price']);
      for (const [idx, i] of s.entries()) {
        expect(i.kind).toBe(Kind.Snippet);
        expect(i.detail).toBe(FIELDS[idx].type);
        expect(i.insertText).toBe('"' + FIELDS[idx].path + '": "${1:value}"'); /* 2.6.0：字段名带值骨架 */
        expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      }
    }
  });

  it('⑤-c field 档：路径含 snippet 特殊字符时 insertText 转义（2.6.0 防御）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [{ path: 'foo$bar', type: 'keyword' }] } });
    const doc = '{\n  "query": {\n    "match": {\n      "\n    }\n  }\n}';
    const t = suggest(doc, 37).find((i: any) => i.label === 'foo$bar');
    expect(t.insertText).toBe('"foo\\$bar": "${1:value}"');
    /* monaco 解 snippet 后 \\$ 还原 $——接受落文本含原名，JSON 合法 */
    const after = acceptSnippet(doc, t);
    expect(after).toContain('foo$bar');
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('⑤-b field 档：值骨架接受后 JSON 合法 + 逗号自适应（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 层尾：match 值对象内唯一键 → 无尾逗号（串内形态：光标在已敲 " 后，offset 37） */
    const doc = '{\n  "query": {\n    "match": {\n      "\n    }\n  }\n}';
    const items = suggest(doc, 37);
    const t = items.find((i: any) => i.label === 'title');
    expect(t.insertText.endsWith(',')).toBe(false);
    const after = acceptSnippet(doc, t);
    expect(() => JSON.parse(after), after).not.toThrow();
    /* 后跟兄弟字段（右邻 "）→ 尾逗号（串外裸键位：光标在 { 后、"price" 前，offset 23） */
    const doc2 = '{"query": {"match": {  "price": 1 }}}';
    const items2 = suggest(doc2, 23);
    const t2 = items2.find((i: any) => i.label === 'title');
    expect(t2.insertText.endsWith(',')).toBe(true);
    expect(() => JSON.parse(acceptSnippet(doc2, t2))).not.toThrow();
  });

  it.each([
    ['{"query":', 'root 档值位（query 值未进入）'],
    ['{"query": "he', 'root 档值串内'],
    ['{"query": {"match": "he', 'query-type 档值串内'],
    ['{"query": {"match": {"title": "he', 'field 档值串内'],
  ])('⑥ 守卫：%s（%s）不出建议', (doc) => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest(doc as string)).toEqual([]);
  });

  it('⑨a I-1 回归：无闭合引号（{ "que⏎）range 覆盖串起始到光标，接受后干净', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{ "que';
    const s = suggest(doc);
    expect(s.length).toBe(ROOT_KEYS.length);
    const item = s.find(i => i.label === 'query');
    /* range = [起始引号 offset 2, 光标 offset 6)——覆盖已敲的 "que 整段（含起始引号） */
    expect(rangeOffsets(doc, item.range)).toEqual([2, doc.length]);
    /* 2.6.0：root 档 snippet 骨架——接受后落 query 对象骨架，整串干净替换不变 */
    expect(acceptSnippet(doc, item)).toBe('{ "query": {\n  \n}');
  });

  it('⑨b I-1 回归：auto-close 形态（{ "que⏎" }）range 止覆盖到闭合引号之后', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{ "que" }';
    const cursor = doc.indexOf('" }'); /* 光标紧贴闭合引号左侧 */
    const s = suggest(doc, cursor);
    const item = s.find(i => i.label === 'query');
    expect(rangeOffsets(doc, item.range)).toEqual([2, cursor + 1]);
    expect(acceptSnippet(doc, item)).toBe('{ "query": {\n  \n} }');
  });

  it('⑨c I-1 回归：field 档两形态——接受后 "price" 干净无双引号', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 无 auto-close：串未闭合，range 止=光标 */
    const doc1 = '{"query": {"match": {"pri';
    const strStart = doc1.length - 4; /* '"pri' 的起始引号 */
    const p1 = suggest(doc1).find(i => i.label === 'price');
    expect(p1.insertText).toBe('"price": "${1:value}"'); /* 2.6.0：字段名带值骨架 */
    expect(rangeOffsets(doc1, p1.range)).toEqual([strStart, doc1.length]);
    const applied1 = accept(doc1, p1);
    expect(applied1).toBe('{"query": {"match": {"price": "${1:value}"');
    expect(applied1).not.toContain('""');
    /* auto-close：闭合引号在光标后，range 止覆盖到其后 */
    const doc2 = '{"query": {"match": {"pri" }';
    const cursor2 = doc2.indexOf('" }');
    const p2 = suggest(doc2, cursor2).find(i => i.label === 'price');
    expect(rangeOffsets(doc2, p2.range)).toEqual([strStart, cursor2 + 1]);
    const applied2 = accept(doc2, p2);
    expect(applied2).toBe('{"query": {"match": {"price": "${1:value}" }');
    expect(applied2).not.toContain('""');
  });

  it('N-1 复审回归：串外裸键位（Ctrl+Space）纯插入不右扫——}, "size" 完好、JSON 合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {}, "size": 10}';
    const cursor = doc.indexOf('{}') + 1; /* {"query": {⏎}, "size": 10}——query 值对象内键位 */
    const s = suggest(doc, cursor);
    expect(s.length).toBe(Object.keys(QUERY_SNIPPETS).length); /* query-type 档照出 */
    const item = s.find(i => i.label === 'match');
    /* range=[光标,光标) 纯插入——无已敲引号（insertText 自带引号正好），不吞 }, " */
    expect(rangeOffsets(doc, item.range)).toEqual([cursor, cursor]);
    const applied = acceptSnippet(doc, item);
    expect(applied).toContain('}, "size": 10}');
    expect(() => JSON.parse(applied)).not.toThrow();
  });

  it('N-2 复审回归：串未闭合右扫遇换行即停——跨行不吞，"size": 10 行完好', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  "que\n  "size": 10\n}';
    const cursor = doc.indexOf('que') + 3; /* "que⏎（串未闭合） */
    const s = suggest(doc, cursor);
    const item = s.find(i => i.label === 'query');
    /* range=[起始引号,光标)——跨行的 "size" 起始引号不可达 */
    expect(rangeOffsets(doc, item.range)).toEqual([doc.indexOf('"que'), cursor]);
    const applied = acceptSnippet(doc, item);
    /* 2.6.0：snippet 骨架叠加行缩进 2 + 右邻 "size" 尾逗号（commaAffixes §3.1），跨行右扫不吞不变 */
    expect(applied).toBe('{\n  "query": {\n    \n  },\n  "size": 10\n}');
    expect(applied).toContain('"size": 10');
    expect(() => JSON.parse(applied), applied).not.toThrow();
  });

  it('⑩ M-2：数组裸元素位压住；元素对象已开（[{）仍出 query-type', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 栈顶 '['：手动 Ctrl+Space 不再出 query-type snippet（接受即数组元素位塞键值对，非法 JSON） */
    expect(suggest('{"query": {"bool": {"must": [')).toEqual([]);
    expect(suggest('{"query": {"bool": {"must": ["match_all", ')).toEqual([]);
    /* 元素对象已开（栈顶 '{'）：既有行为保留，全量 snippet 照出 */
    const s = suggest('{"query": {"bool": {"must": [{');
    expect(s.length).toBe(Object.keys(QUERY_SNIPPETS).length);
    for (const i of s) expect(i.kind).toBe(Kind.Snippet);
  });

  it('⑪ W5-1 排序升权+过滤存活：三档 sortText 带 "!" 前缀压过 $schema、组内保序；filterText 带引号前缀', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const tiers: [string, string][] = [
      ['root', '{"'],
      ['query-type', '{"query": {"'],
      ['field', '{"query": {"match": {"'],
    ];
    for (const [name, doc] of tiers) {
      const s = suggest(doc);
      expect(s.length, `${name} 档应出建议`).toBeGreaterThan(0);
      const sts = s.map(i => i.sortText);
      for (const [idx, i] of s.entries()) {
        /* 排序关：'!'(33) < '$'(36)——monaco 0.52.2 对无 sortText 项回填 label，
           JSON LS 内建 $schema 排序键即 '$schema'；'!' 前缀字典序稳定压过它（'0'=48 压不过） */
        const st = sts[idx];
        expect(st, `${name} 档 ${i.label} 的 sortText 应带 '!' 前缀`).toMatch(/^!\d{3}/);
        expect(st < '$schema', `${name} 档 sortText "${st}" 应排在 $schema 前`).toBe(true);
        /* 过滤关：敲 " 后过滤 pattern='"'（range 覆盖起始引号 → overwriteBefore=1），
           无 filterText 拿 label 匹配 → fuzzyScore undefined → 整档被过滤出列表（真机实锤根因）。
           filterText='"'+label 与 insertText 同形态：pattern '"' 前缀强匹配得分 > FuzzyScore.Default(-100) */
        expect(i.filterText, `${name} 档 ${i.label} 的 filterText 应带 '"' 前缀`).toBe('"' + i.label);
      }
      /* 组内保序：序号三位零填定宽 → sortText 字典序单调递增 ⇔ 展示序=提供序 */
      expect([...sts].sort(), `${name} 档 sortText 应单调递增`).toEqual(sts);
    }
    /* 保序语义坐实：root 档展示序=ROOT_KEYS 序；field 档（match 算子，五百三十一批类型感知）
       text 命中 prio 首位排前、price(long) 殿后——本 fixture 恰与 fields() 原序同形（label 序未被 sortText 打乱） */
    expect(suggest('{"').map(i => i.label)).toEqual(ROOT_KEYS);
    expect(suggest('{"query": {"match": {"').map(i => i.label)).toEqual(['title', 'price']);
  });

  it('⑪-b 五百三十一批 field 档类型感知排序：range 算子 date/long 置前；match 算子 text 置顶；候选集不变', () => {
    const TYPED = [
      { path: 'a_title', type: 'text' },
      { path: 'm_price', type: 'long' },
      { path: 'z_created', type: 'date' },
    ];
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    /* term 算子 keyword 优先：fixture 无 keyword 字段 → 全员同档，保 fields() 序（零增量） */
    expect(suggest('{"query": {"term": {"').map(i => i.label)).toEqual(['a_title', 'm_price', 'z_created']);
    /* match 算子 text 优先：a_title(text) 置顶，其余保 fields() 序 */
    expect(suggest('{"query": {"match": {"').map(i => i.label)).toEqual(['a_title', 'm_price', 'z_created']);
    /* range 算子 date→数值族优先：z_created(date) 置顶、m_price(long) 次之、a_title(text) 殿后 */
    const r = suggest('{"query": {"range": {"');
    expect(r.map(i => i.label)).toEqual(['z_created', 'm_price', 'a_title']);
    /* 候选集不变：三条全在、detail=type 未动；sortText '!' 升权前缀不回退 */
    expect(r.map(i => i.detail)).toEqual(['date', 'long', 'text']);
    for (const i of r) expect(i.sortText).toMatch(/^!\d{3}/);
  });

  it('⑫a ux2 裸词左扩·root 档：串外裸词位 range 左扩词首——敲 que 出 "query"，接受整词替换不产残壳', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{ que';
    const s = suggest(doc);
    expect(s.map(i => i.label), '串外裸词位 root 档照出（守卫 N-1 语义不变）').toEqual(ROOT_KEYS);
    const item = s.find(i => i.label === 'query');
    /* range=[词首 2, 光标 5)——覆盖已敲裸词 que 整段（无引号可含，insertText 自带引号） */
    expect(rangeOffsets(doc, item.range)).toEqual([2, doc.length]);
    expect(acceptSnippet(doc, item)).toBe('{ "query": {\n  \n}');
  });

  it('⑫b 裸词左扩·field 档：点分隔路径 user.na 整段覆盖（自扫 [\\w.] 不依赖 monaco wordPattern）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [{ path: 'user.name', type: 'keyword' }] } });
    const doc = '{"query": {"match": {user.na';
    const item = suggest(doc).find(i => i.label === 'user.name');
    expect(rangeOffsets(doc, item.range)).toEqual([doc.indexOf('user.na'), doc.length]);
    expect(accept(doc, item)).toBe('{"query": {"match": {"user.name": "${1:value}"');
  });

  it('⑫c 裸词左扩·query-type 档：snippet 接受整词替换、不产 ma"match" 残壳', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {ma';
    const item = suggest(doc).find(i => i.label === 'match');
    expect(rangeOffsets(doc, item.range)).toEqual([doc.length - 2, doc.length]);
    const applied = acceptSnippet(doc, item);
    expect(applied).toContain('"match"');
    expect(applied).not.toContain('ma"');
  });

  it('⑦ none 档（非 query/aggs 深层区）恒空', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 哨兵迁移史：{"aggs":{"a":{" → agg-type；sort 深层 → sort-opt-key；
       highlight 字段配置 → 本轮升为一等档（__highlight_field__）。none 档改 pin
       插件私有顶层容器（{"my_plugin":{"x":{）：既非 query/aggs，也不在
       体键表/建议器/检索器/字段数组中，必须继续零候选。 */
    expect(suggest('{"highlight": {"fields": {"title": {"').map(i => i.label))
      .toEqual(expect.arrayContaining(['fragment_size', 'pre_tags']));
    expect(suggest('{"my_plugin": {"x": {')).toEqual([]);
  });

  it('⑧ DslQueryView 冒烟：mount 不炸；W4-T14 渗透后 dslAssist 签名注册恰 1 条', async () => {
    /* 视图编辑器区有 store.pickedIdx 门控（未选索引只渲染引导 EmptyState）——预置工作索引 */
    localStorage.setItem('es_picked', 'idx-a');
    const pinia = createPinia();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    });
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
    /* W4-T14：视图主编辑器已接 dslAssist（fields 闭包 = useIndexFields/mappingDetail 出口）
       → dslAssist 签名注册恒为 2（json+ndjson 逐语言一份，五百二十一批起；ux2：旧 ['"','.'] 裸词 provider 已退役，见 ⑬） */
    expect(dslRegs().length).toBe(2);
  });

  it('⑬ ux2 旧 registerCompletion 退役：DslQueryView 挂载后零 [\'"\',\'.\'] 签名 provider（双打根因清除）', async () => {
    /* 同 ⑧ 挂载路径（视图编辑器区有 store.pickedIdx 门控——预置工作索引） */
    localStorage.setItem('es_picked', 'idx-a');
    const pinia = createPinia();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    });
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
    const legacy = registrations().filter(r => {
      const tc = r.provider?.triggerCharacters;
      return Array.isArray(tc) && tc.length === 2 && tc[0] === '"' && tc[1] === '.';
    });
    expect(legacy, '旧裸词 provider（签名 [\'"\',\'.\']）必须零注册').toEqual([]);
    expect(dslRegs().length, 'dslAssist 仍恰 json+ndjson 两份（⑧ 不回归）').toBe(2);
  });

  it('range-op 档：gte/gt/lt/lte 键位 snippet，接受后合法（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* offset 自核修正：计划给 26 落在 "date 串内（字段名串，出 field 档非 range-op）——
       真实可达键位是栈顶 { 内空白 30/31/32，取 31 */
    const doc = '{"query": {"range": {"date": {  }}}}';
    const items = suggest(doc, 31);
    expect(items.map((i: any) => i.label)).toEqual(['gte', 'gt', 'lt', 'lte']);
    const g = items[0];
    expect(g.kind).toBe(Kind.Snippet);
    expect(() => JSON.parse(acceptSnippet(doc, g))).not.toThrow();
  });

  it('exists-key 档：键位钉死 field 单候选（2.6.0 语义纠错）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {"exists": {  }}}';
    /* offset 自核修正：计划给 20 落在 "exists": 冒号后值位（dslKeyGuard 压住）——真实可达键位是栈顶 { 内空白 22/23/24，取 23 */
    const items = suggest(doc, 23);
    expect(items.length).toBe(1);
    expect(items[0].label).toBe('field');
    const after = acceptSnippet(doc, items[0]);
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('⑭a agg-name 档：实例名+类型一步骨架，接受后合法（2.6.0 Task 8）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"aggs": {  }}';
    /* offset 自核：10 落 "aggs" 值对象 { 后空白键位（串外空位，栈顶 { 内） */
    const items = suggest(doc, 10);
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe(Kind.Snippet);
    const after = acceptSnippet(doc, items[0]);
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('⑭b agg-type 档：十键聚合骨架 + aggs 嵌套键，逗号自适应（2.6.0 Task 8）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"aggs": {"by_user": {  }}}';
    /* offset 自核修正：计划给 21 落实例值 { 之前（agg-name 档位）——真实可达实例值键位是 { 后空白 22/23，取 23 */
    const items = suggest(doc, 23);
    const labels = items.map((i: any) => i.label);
    for (const k of ['terms', 'avg', 'sum', 'min', 'max', 'stats', 'cardinality', 'date_histogram', 'date_range', 'top_hits', 'aggs']) {
      expect(labels).toContain(k);
    }
    const t = items.find((i: any) => i.label === 'terms');
    expect(t.detail, 'H 发现性：带一句话说明').toBeTruthy();
    expect(t.insertText.endsWith(','), '层尾（右邻 }）不带尾逗号——commaAffixes 宁缺毋滥').toBe(false);
    const after = acceptSnippet(doc, t);
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('provider memo：同 doc 同 offset 连调返回同引用；doc 变更重算（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  \n}';
    const r1 = suggest(doc, 4);
    const r2 = suggest(doc, 4);
    expect(r2, 'quickSuggestions 同位重扫直接命中').toBe(r1);
    const r3 = suggest(doc + ' ', 4);
    expect(r3, 'doc 新引用 → 重算新对象').not.toBe(r1);
    expect(r3.map((i: any) => i.label)).toEqual(r1.map((i: any) => i.label));
  });
});

describe('W6 bodyKind 分派', () => {
  it('settings：串内键位出设置键（带 detail），值位（左侧 :）压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'settings' } });
    /* 键位：光标在串内，起始引号左侧最近非空白是 '{' → 出设置键档 */
    const keyDoc = '{\n  "\n}';
    const s = suggest(keyDoc, 5);
    const ri = s.find(i => i.label === 'refresh_interval');
    expect(ri, 'settings 档必须含 refresh_interval（SETTINGS_CATALOG 出口）').toBeTruthy();
    expect(ri.kind, '非 snippet 设置键走 Property').toBe(Kind.Property);
    expect(ri.insertText, 'insertText 自带引号（I-1 同形态）').toBe('"refresh_interval"');
    expect(ri.detail, '设置键必须带中文说明 detail').toBeTruthy();
    /* T2 Minor 加固（W6-T3 评审顺手补）：settings 档同锁 W5-1 真机回归面——
       filterText='"'+label（敲 " 后过滤存活）、sortText '!' 前缀升权（压过 JSON LS $schema） */
    for (const i of s) {
      expect(i.filterText, `settings 档 ${i.label} filterText 必须带 '"' 前缀`).toBe('"' + i.label);
      expect(i.sortText, `settings 档 ${i.label} sortText 必须带 '!' 前缀`).toMatch(/^!/);
    }
    /* 值位：起始引号左侧最近非空白是 ':' → 空列表（守卫同 W4 口径） */
    const valDoc = '{\n  "refresh_interval": "\n}';
    expect(suggest(valDoc, valDoc.indexOf('\n}')), '值位不许出档').toEqual([]);
  });

  it('mapping：键位出 properties 骨架（Snippet + InsertAsSnippet）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'mapping' } });
    const s = suggest('{\n  "\n}', 5);
    const prop = s.find(i => i.label === 'properties');
    expect(prop, 'mapping 档必须含 properties 骨架').toBeTruthy();
    expect(prop.kind).toBe(Kind.Snippet);
    expect(prop.insertTextRules, '骨架必须带 InsertAsSnippet 规则').toBe(Rule.InsertAsSnippet);
    expect(prop.insertText).toContain('${1:field}');
  });

  it('mapping 深层嵌套位：骨架后续行叠加当前行缩进（与 query snippet 同口径）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'mapping' } });
    const doc = '{\n  "mappings": {\n    "\n  }\n}';
    const off = doc.indexOf('"\n  }') + 1;
    const s = suggest(doc, off);
    const prop = s.find(i => i.label === 'properties');
    expect(prop, '深层位仍出 properties 骨架').toBeTruthy();
    expect(prop.insertText, '后续行叠加当前行缩进 4（相对缩进保留）')
      .toBe('"properties": {\n      "${1:field}": { "type": "${2:keyword}" }\n    }');
  });

  it('template：串内键位出模板十键（全 Snippet + W5-1 双关），串外压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'template' } });
    const s = suggest('{\n  "\n}', 5);
    expect(s.map(i => i.label)).toEqual([
      'index_patterns', 'priority', 'template', 'settings', 'mappings', 'aliases', 'composed_of',
      'data_stream', 'version', '_meta',
    ]);
    for (const i of s) {
      expect(i.kind, i.label).toBe(Kind.Snippet);
      expect(i.insertTextRules, i.label).toBe(Rule.InsertAsSnippet);
      expect(i.filterText, `template 档 ${i.label} filterText 必须带 '"' 前缀`).toBe('"' + i.label);
      expect(i.sortText, `template 档 ${i.label} sortText 必须带 '!' 前缀`).toMatch(/^!/);
    }
    /* 串外空位压住——template 与 settings/mapping 同锁 inStr（L218 分支公共守卫） */
    expect(suggest('{  }', 2)).toEqual([]);
  });

  it('none：恒空列表（_bulk NDJSON 体不扰动）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'none' } });
    expect(suggest('{"')).toEqual([]);
  });

  it('bodyKind 缺省（显式 undefined）回退 search——W4 三档现状回归', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: undefined } });
    const s = suggest('{"');
    expect(s.map(i => i.label), '缺省 bodyKind 必须回退 search root 档').toEqual(ROOT_KEYS);
    expect(s.map(i => i.label)).toContain('query');
  });

  it('bodyKind 闭包每次触发重新取值（端点随选随换，不缓存首值）', () => {
    let bk: 'settings' | 'none' = 'settings';
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => bk } });
    expect(suggest('{"').some(i => i.label === 'refresh_interval'), 'bk=settings 出设置键').toBe(true);
    bk = 'none';
    expect(suggest('{"'), 'bk 切 none 后同一位点必须空').toEqual([]);
  });

  it('mapping 档：snippet 骨架 + 后跟兄弟键带尾逗号（2.6.0 三档共享 w6Affix 的组合形态钉住）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mapping' } });
    const doc = '{\n  "\n  "dynamic": "strict"\n}';
    const items = suggest(doc, 5);
    const prop = items.find(i => i.label === 'properties');
    expect(prop.insertTextRules).toBe(Rule.InsertAsSnippet);
    expect(prop.insertText.endsWith(','), 'snippet 档后跟兄弟键带尾逗号（逗号拼在 reindent 骨架外）').toBe(true);
    /* 落文本锚定：骨架多行缩进叠加 + 尾逗号在闭合 } 之后 */
    const after = acceptSnippet(doc, prop);
    expect(after).toContain('"dynamic": "strict"');
    expect(after.indexOf('},')).toBeGreaterThan(-1);
  });

  it('settings 档逗号自适应：后跟兄弟设置键带尾逗号（2.6.0）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'settings' } });
    /* W6 档锁 g.ok && g.inStr（串外裸位压住不出档，同 template「串外压住」口径）——
       逗号用例必须串内形态：光标在已敲 " 后（同上方 settings 键位用例 offset 5）。
       后跟兄弟：end 右扫跳空白落 "number_of_replicas" 起始引号 → 尾逗号 */
    const doc = '{\n  "\n  "number_of_replicas": 1\n}';
    const items = suggest(doc, 5);
    const ri = items.find(i => i.label === 'refresh_interval');
    expect(ri.insertText.endsWith(','), '后跟兄弟设置键必须带尾逗号').toBe(true);
    /* 接受落文本逐字符锚定逗号落点（设置键是裸键无值骨架，续敲 : 值后整体才合法——
       不做 JSON.parse 全量校验，与 root/query/field 档 snippet 带值骨架的形态差异对齐） */
    expect(accept(doc, ri)).toBe('{\n  "refresh_interval",\n  "number_of_replicas": 1\n}');
    /* 层尾（右邻 }）→ 无尾逗号（宁缺毋滥，绝不产 trailing comma） */
    const tail = suggest('{\n  "\n}', 5);
    expect(tail.find(i => i.label === 'refresh_interval').insertText.endsWith(','), '层尾不许带尾逗号').toBe(false);
  });
});

describe('W3 字段 hover provider', () => {
  it('json+ndjson+painless 各注册一份（524 批扩 painless），dispose 随卸载全量；dslAssist 缺席零 hover 注册', () => {
    const { app } = mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 五百二十四批同步更新：dslAssist 在档时 painless 语言加挂四骨架补全 + 字段 hover 各一份——
       hoverRegs 按「无 triggerCharacters」签名过滤，json/ndjson/painless hover 各 1 共 3；
       painless 补全 provider 签名 ['[', '.'] 不进 dslRegs（恰 ['"'] 过滤）也不进 hoverRegs */
    expect(hoverRegs().length).toBe(3);
    expect(hoverRegs().map(r => r.lang).sort()).toEqual(['json', 'ndjson', 'painless']);
    for (const r of hoverRegs()) expect(r.disposed).toBe(false);
    app.unmount();
    expect(hoverRegs().every(r => r.disposed), 'hover 注册必须随卸载 dispose').toBe(true);
    /* 补全注册计数不回归（dslRegs 只按 triggerCharacters 签名过滤，hover 不串档；
       painless 补全签名不同不串档——json+ndjson 恰 2，524 批前后同值） */
    expect(dslRegs().every(r => r.disposed)).toBe(true);
    mountEditor({ modelValue: '{}' });
    expect(hoverRegs().filter(r => !r.disposed).length, 'dslAssist 缺席 = 零 hover 注册').toBe(0);
  });

  it('word 命中 fields() → hover 出「type · 字段名」；未命中/无 fields 静默（null）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const reg = hoverRegs()[0];
    const hit = reg.provider.provideHover({ getWordAtPosition: () => ({ word: 'title' }) }, {});
    expect(hit, '命中字段必须出 hover').toBeTruthy();
    expect(hit.contents[0].value).toBe('text · title');
    expect(reg.provider.provideHover({ getWordAtPosition: () => ({ word: 'ghost' }) }, {}), '未命中的词静默').toBeNull();
    expect(reg.provider.provideHover({ getWordAtPosition: () => null }, {}), '无 word 静默').toBeNull();
    /* fields() 现调现读：空字段表静默（惰性 ensure 场景，挂载零请求态不弹空壳） */
    let list: { path: string; type: string }[] = [];
    /* 本用例首个挂载未卸载（afterEach 才清）——按挂载前基数取本次挂载的注册，
       否则 [0] 会拿到上一挂载（fields=FIELDS）的 provider，「空表静默」断言失真 */
    const undisposedBefore = hoverRegs().filter(r => !r.disposed).length;
    const { app } = mountEditor({ modelValue: '{}', dslAssist: { fields: () => list } });
    const reg2 = hoverRegs().filter(r => !r.disposed)[undisposedBefore];
    expect(reg2.provider.provideHover({ getWordAtPosition: () => ({ word: 'title' }) }, {}), '无 fields 静默').toBeNull();
    list = FIELDS;
    expect(reg2.provider.provideHover({ getWordAtPosition: () => ({ word: 'price' }) }, {})!.contents[0].value)
      .toBe('long · price');
    app.unmount();
  });
});

describe('2.6.0 值位白名单（spec §4.4）', () => {
  it('order 值串位 → asc/desc', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"sort": [{ "date": { "order": "d" } }] }';
    /* offset 自核：indexOf('"d"')=31（"sort"/"date" 无 '"d"' 子串），+2=33 落串内 d 后、闭合引号前 */
    const off = doc.indexOf('"d"') + 2;
    const items = suggest(doc, off);
    expect(items.map((i: any) => i.label)).toEqual(['asc', 'desc']);
    /* 值位档五字段钉：kind=Value + W5-1 filterText/sortText 同手法（防重构改坏静默退化） */
    for (const [idx, i] of items.entries()) {
      expect(i.kind).toBe(Kind.Value);
      expect(i.filterText).toBe('"' + i.label);
      expect(i.sortText).toBe('!' + String(idx).padStart(3, '0') + i.label);
    }
    /* 接受（整串壳替换，insertText 自带引号）后合法 */
    const after = accept(doc, items.find((i: any) => i.label === 'desc'));
    expect(() => JSON.parse(after), after).not.toThrow();
    expect(JSON.parse(after).sort[0].date.order).toBe('desc');
  });

  it('track_total_hits 值串位 → true/false', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"track_total_hits": "t" }';
    /* offset 自核：indexOf('"t"')=21（"track_total_hits" 内无 '"t"' 子串），+2=23 落串内 t 后 */
    const items = suggest(doc, doc.indexOf('"t"') + 2);
    expect(items.map((i: any) => i.label)).toEqual(['true', 'false']);
  });

  it('field 键值串位 → 真实字段名（exists/agg 通吃）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {"exists": {"field": "pr" } } }';
    /* offset 自核：indexOf('"pr"')=31，+3=34 落串内 r 后、闭合引号前 */
    const items = suggest(doc, doc.indexOf('"pr"') + 3);
    expect(items.map((i: any) => i.label)).toEqual(['title', 'price']);
  });

  it('非白名单键值位仍压制（match 值串不出档）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"query": {"match": {"title": "hel" } } }';
    /* offset 自核：indexOf('"hel"')=30，+4=34 落串内 l 后、闭合引号前 */
    const items = suggest(doc, doc.indexOf('"hel"') + 4);
    expect(items).toEqual([]);
  });

  it('W6 加固：settings 体白名单同名键值位仍压制（g.valueKey 一并压，防泄漏退化钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'settings' } });
    const doc = '{\n  "order": "\n}';
    expect(suggest(doc, doc.indexOf('"\n}') + 1)).toEqual([]);
  });
});

describe('JSONC 注释跳过（dslKeyGuard 负向钉）', () => {
  it('行注释内 } 不弹栈：track_total_hits 值位白名单照出 true/false（误压钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* doc 里 '// }' 的 } 在未跳过时弹掉根帧 → topKey=null → 白名单不命中 → 压住 []；
       跳过注释后根帧 intact → lastKey='track_total_hits' → 值位白名单放行 */
    const doc = '{\n  // }\n  "track_total_hits": "t"';
    const off = doc.indexOf('"t"') + 2; /* "t" 串内 t 后（同既有值位用例 offset 复算口径） */
    expect(suggest(doc, off).map((i: any) => i.label)).toEqual(['true', 'false']);
  });

  it('块注释内 } 不弹栈：同上白名单照出（误压钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  /* } */\n  "track_total_hits": "t"';
    const off = doc.indexOf('"t"') + 2;
    expect(suggest(doc, off).map((i: any) => i.label)).toEqual(['true', 'false']);
  });

  it('注释透明：带行注释的 field 位与无注释等价（注释内 } 不弹 query 值对象帧）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    /* 行注释内 } 弹掉 query 值对象 → dslContext 判 none（guard 已 ok）→ []；
       跳过注释 → field 档照出 title/price */
    const doc = '{"query": {\n  // }\n  "match": {';
    expect(suggest(doc).map((i: any) => i.label)).toEqual(['title', 'price']);
  });
});

/* 1439：本批新增的补全档在**提供器层**的接线——
   浏览器验证不进 CI，这里锁住「上下文档 → 候选」这条链，尤其是
   sort 简写方向值必须在 dslKeyGuard 早退之前判定（字段键不在值白名单）。
   全量清单见 aggBodyKeys1439 / retrieverCompletion1439 / suggesterCompletion1439 /
   highlightFields1439 / sortChain1439（纯函数与上下文层）。 */
describe('1439 新补全档（提供器层接线）', () => {
  it('sort 简写方向值给 asc/desc（guard 早退之前的路由）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"sort": [{"@timestamp": "').map((i: any) => i.label)).toEqual(['asc', 'desc']);
  });

  it('sort 字段配置键给 order/mode/missing/unmapped_type/nested/format/numeric_type', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const labels = suggest('{"sort": [{"@timestamp": {').map((i: any) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['order', 'mode', 'missing', 'unmapped_type', 'nested', 'format', 'numeric_type']));
  });

  it('highlight.fields 的键给 mapping 字段', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"highlight": {"fields": {').map((i: any) => i.label)).toEqual(['title', 'price']);
  });

  it('聚合体内部给字段键 + 参数键 + 嵌套 aggs', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const labels = suggest('{"aggs": {"a": {"terms": {').map((i: any) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['field', 'size', 'min_doc_count', 'aggs']));
  });

  it('filter 聚合体给查询子句（体是查询）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"aggs": {"a": {"filter": {').map((i: any) => i.label)).toContain('match');
  });

  it('retriever / suggest 体内给变体清单', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"retriever": {').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['standard', 'rrf', 'linear', 'pinned']));
    /* 1439：类型骨架之外，text/prefix 与类型键同层（官方体）——只给类型会让人误以为
       text 在类型体里；接受 text 后 JSON 必须合法 */
    const sugDoc = '{\n  \"suggest\": {\n    \"s1\": {\n      \n    }\n  }\n}';
    const at = sugDoc.indexOf('      \n') + 6;
    const sug = suggest(sugDoc, at);
    const sugLabels = sug.map((i: any) => i.label);
    expect(sugLabels).toEqual(expect.arrayContaining(['term', 'phrase', 'completion', 'text', 'prefix']));
    const textItem = sug.find((i: any) => i.label === 'text');
    expect(() => JSON.parse(acceptSnippet(sugDoc, textItem)), 'text 接受后非法').not.toThrow();
  });
});

describe('1439 EQL 体（_eql/search）补全', () => {
  const eqlMount = () => mountEditor({
    modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'eql-body' },
  });

  it('根键位给 EQL 目录；普通值位仍压制（不出根键）', () => {
    eqlMount();
    const doc = '{\n  "\n}';
    const s = suggest(doc, 5);
    const labels = s.map(i => i.label);
    for (const k of ['query', 'filter', 'event_category_field', 'timestamp_field', 'runtime_mappings']) {
      expect(labels, k).toContain(k);
    }
    const q = s.find(i => i.label === 'query');
    const after = acceptSnippet(doc, q);
    expect(() => JSON.parse(after), after).not.toThrow();
    const val = '{\n  "keep_alive": "\n}';
    expect(suggest(val, val.indexOf('\n}')), 'keep_alive 值位不出根键').toEqual([]);
  });

  it('query 值位：空串给 EQL 起步骨架，含引号骨架接受后仍是合法 JSON', () => {
    eqlMount();
    const doc = '{"query": ""}';
    const items = suggest(doc, 11);
    expect(items.map(i => i.label)).toEqual(['any where', 'process where', 'sequence by', 'sample by']);
    const proc = items.find(i => i.label === 'process where');
    const after = acceptSnippet(doc, proc);
    expect(() => JSON.parse(after), after).not.toThrow();
    expect(JSON.parse(after).query).toContain('cmd.exe');
  });

  it('query 串中段：关键字在光标处插入，不整串替换', () => {
    eqlMount();
    const doc = '{"query": "any where true"}';
    const items = suggest(doc, doc.indexOf('"', 12));
    expect(items.map(i => i.label)).toContain('and');
    const and = items.find(i => i.label === 'and');
    const after = acceptSnippet(doc, and);
    expect(after, '已输入内容必须保留').toContain('any where true');
    expect(after.endsWith(' and "}'), after).toBe(true);
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('filter 内回落 Query DSL：match 可出（不套 EQL 根键）', () => {
    eqlMount();
    const items = suggest('{"filter": {"');
    const labels = items.map(i => i.label);
    expect(labels).toContain('match');
    expect(labels, 'filter 内不给 EQL 根键').not.toContain('query');
  });

  it('event_category_field / fields 值位给真实字段名', () => {
    eqlMount();
    const cat = suggest('{"event_category_field": "');
    expect(cat.map(i => i.label)).toEqual(['title', 'price']);
    const fields = suggest('{"fields": ["');
    expect(fields.map(i => i.label)).toEqual(['title', 'price']);
  });
});

describe('1439 集群设置体（_cluster/settings）补全', () => {
  const csMount = () => mountEditor({
    modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'cluster-settings-body' },
  });

  it('根键给 persistent/transient；两层内给集群设置键目录；更深值位压住', () => {
    csMount();
    const rootDoc = '{\n  "\n}';
    const root = suggest(rootDoc, 5);
    expect(root.map(i => i.label)).toEqual(['persistent', 'transient']);
    const p = root.find(i => i.label === 'persistent');
    const after = acceptSnippet(rootDoc, p);
    expect(() => JSON.parse(after), after).not.toThrow();

    const inner = '{\n  "persistent": {\n    "\n  }\n}';
    const innerOff = inner.lastIndexOf('"') + 1;
    const keys = suggest(inner, innerOff);
    expect(keys.map(i => i.label)).toContain('cluster.routing.allocation.enable');
    expect(keys.map(i => i.label)).toContain('indices.breaker.total.limit');
    expect(keys.find(i => i.label === 'cluster.routing.allocation.enable')?.detail).toContain('例：');

    const val = '{\n  "persistent": {\n    "cluster.routing.allocation.enable": "\n  }\n}';
    const valOff = val.lastIndexOf('"') + 1;
    expect(suggest(val, valOff), '设置值位不出键').toEqual([]);
  });
});

describe('1439 集群运维体（reroute / allocation explain）补全', () => {
  it('reroute：根键 commands → 命令键 → 命令参数（move 给 from/to）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'reroute-body' } });
    const root = '{\n  "\n}';
    const r = suggest(root, 5);
    expect(r.map(i => i.label)).toEqual(['commands']);
    const after = acceptSnippet(root, r[0]);
    expect(() => JSON.parse(after), after).not.toThrow();

    const cmdDoc = '{\n  "commands": [\n    {\n      "\n    }\n  ]\n}';
    const cmds = suggest(cmdDoc, cmdDoc.lastIndexOf('"') + 1);
    expect(cmds.map(i => i.label)).toEqual(['move', 'cancel', 'allocate_replica', 'allocate_stale_primary', 'allocate_empty_primary']);

    const paramDoc = '{\n  "commands": [\n    {\n      "move": {\n        "\n      }\n    }\n  ]\n}';
    const params = suggest(paramDoc, paramDoc.lastIndexOf('"') + 1);
    expect(params.map(i => i.label)).toContain('from_node');
    expect(params.map(i => i.label)).toContain('to_node');
    expect(params.map(i => i.label)).not.toContain('accept_data_loss');
  });

  it('allocation explain：根键六项；值位压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'allocation-explain-body' } });
    const root = '{\n  "\n}';
    const s = suggest(root, 5).map(i => i.label);
    expect(s).toEqual(['index', 'shard', 'primary', 'current_node', 'include_disk_info', 'include_yes_decisions']);
    const val = '{\n  "index": "\n}';
    expect(suggest(val, val.indexOf('\n}')), 'index 值位不出键').toEqual([]);
  });
});

describe('1439 快照写体（仓库 / 创建 / 恢复）补全', () => {
  it('仓库体：根键三项；type 值位给六类仓库（串内/裸值位均可）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'snapshot-repo-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual(['type', 'settings', 'verify']);
    const strVals = suggest('{"type": "');
    expect(strVals.map(i => i.label)).toEqual(['fs', 'url', 's3', 'gcs', 'azure', 'hdfs']);
    const afterStr = acceptSnippet('{"type": "', strVals[0]);
    expect(afterStr).toContain('"type": "fs"');
    const bareDoc = '{"type": }';
    const bareVals = suggest(bareDoc, bareDoc.indexOf('}'));
    expect(bareVals.map(i => i.label)).toEqual(['fs', 'url', 's3', 'gcs', 'azure', 'hdfs']);
    const afterBare = acceptSnippet(bareDoc, bareVals[0]);
    expect(afterBare).toContain('"type": "fs"');
    expect(() => JSON.parse(afterBare), afterBare).not.toThrow();
  });

  it('创建体：根键六项；布尔裸值位给 true/false', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'snapshot-create-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual([
      'indices', 'ignore_unavailable', 'include_global_state', 'partial', 'metadata', 'feature_states',
    ]);
    const doc = '{"partial": }';
    expect(suggest(doc, doc.indexOf('}')).map(i => i.label)).toEqual(['false', 'true']);
  });

  it('恢复体：根键十项（rename/include_aliases/index_settings 均在）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'snapshot-restore-body' } });
    const root = '{\n  "\n}';
    const labels = suggest(root, 5).map(i => i.label);
    expect(labels).toEqual([
      'indices', 'ignore_unavailable', 'include_global_state', 'partial',
      'rename_pattern', 'rename_replacement', 'include_aliases',
      'index_settings', 'ignore_index_settings', 'feature_states',
    ]);
  });
});

describe('1439 SLM 策略体补全', () => {
  it('根层 → config → retention 三段分派；更深层不出键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'slm-policy-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual(['schedule', 'name', 'repository', 'config', 'retention']);

    const cfg = '{\n  "config": {\n    "\n  }\n}';
    const cfgKeys = suggest(cfg, cfg.lastIndexOf('"') + 1).map(i => i.label);
    expect(cfgKeys).toEqual(['indices', 'ignore_unavailable', 'include_global_state', 'partial', 'metadata', 'feature_states']);

    const rt = '{\n  "retention": {\n    "\n  }\n}';
    const rtKeys = suggest(rt, rt.lastIndexOf('"') + 1).map(i => i.label);
    expect(rtKeys).toEqual(['expire_after', 'min_count', 'max_count']);

    const deep = '{\n  "config": {\n    "metadata": {\n      "\n    }\n  }\n}';
    expect(suggest(deep, deep.lastIndexOf('"') + 1), 'metadata 内不出键').toEqual([]);
  });
});

describe('1439 ILM 策略体补全', () => {
  it('五段区域：根 → policy → phases → 阶段 → actions；更深层压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'ilm-policy-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual(['policy']);

    const pol = '{\n  "policy": {\n    "\n  }\n}';
    expect(suggest(pol, pol.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['phases']);

    const phases = '{\n  "policy": {\n    "phases": {\n      "\n    }\n  }\n}';
    expect(suggest(phases, phases.lastIndexOf('"') + 1).map(i => i.label))
      .toEqual(['hot', 'warm', 'cold', 'frozen', 'delete']);

    const phase = '{\n  "policy": {\n    "phases": {\n      "hot": {\n        "\n      }\n    }\n  }\n}';
    expect(suggest(phase, phase.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['min_age', 'actions']);

    const actions = '{\n  "policy": {\n    "phases": {\n      "hot": {\n        "actions": {\n          "\n        }\n      }\n    }\n  }\n}';
    const labels = suggest(actions, actions.lastIndexOf('"') + 1).map(i => i.label);
    for (const a of ['rollover', 'forcemerge', 'shrink', 'allocate', 'delete', 'set_priority', 'searchable_snapshot']) {
      expect(labels, a).toContain(a);
    }

    const deep = '{\n  "policy": {\n    "phases": {\n      "hot": {\n        "actions": {\n          "rollover": {\n            "\n          }\n        }\n      }\n    }\n  }\n}';
    expect(suggest(deep, deep.lastIndexOf('"') + 1), '动作参数内不出键').toEqual([]);
  });
});

describe('1439 Watcher 体补全', () => {
  it('内联试跑：watch.input.search.request.body 回落整棵查询补全', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'watch-inline-execute-body' } });
    const sb = '{\n  "watch": {\n    "input": {\n      "search": {\n        "request": {\n          "body": {\n            "\n          }\n        }\n      }\n    }\n  }\n}';
    const labels = suggest(sb, sb.lastIndexOf('"') + 1).map(i => i.label);
    expect(labels).toContain('query');
    expect(labels).toContain('aggs');

    const sbQuery = '{\n  "watch": {\n    "input": {\n      "search": {\n        "request": {\n          "body": {\n            "query": {\n              "\n            }\n          }\n        }\n      }\n    }\n  }\n}';
    const qLabels = suggest(sbQuery, sbQuery.lastIndexOf('"') + 1).map(i => i.label);
    expect(qLabels).toContain('match');

    const inlineAct = '{\n  "watch": {\n    "actions": {\n      "notify": {\n        "logging": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(inlineAct, inlineAct.lastIndexOf('"') + 1).map(i => i.label)).toContain('level');
  });

  it('六段：根 → trigger/schedule → input → condition → 动作类型', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'watch-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual([
      'trigger', 'input', 'condition', 'actions', 'metadata', 'throttle_period',
    ]);

    const trg = '{\n  "trigger": {\n    "\n  }\n}';
    expect(suggest(trg, trg.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['schedule', 'chain']);

    const chainItem = '{\n  "trigger": {\n    "chain": [\n      {\n        "\n      }\n    ]\n  }\n}';
    expect(suggest(chainItem, chainItem.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['inputs', 'trigger']);

    const chainTrg = '{\n  "trigger": {\n    "chain": [\n      {\n        "trigger": {\n          "\n        }\n      }\n    ]\n  }\n}';
    expect(suggest(chainTrg, chainTrg.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['schedule']);

    const chainSch = '{\n  "trigger": {\n    "chain": [\n      {\n        "trigger": {\n          "schedule": {\n            "\n          }\n        }\n      }\n    ]\n  }\n}';
    expect(suggest(chainSch, chainSch.lastIndexOf('"') + 1).map(i => i.label)).toContain('interval');

    const sch = '{\n  "trigger": {\n    "schedule": {\n      "\n    }\n  }\n}';
    expect(suggest(sch, sch.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'interval', 'cron', 'daily', 'hourly', 'weekly', 'monthly', 'yearly',
    ]);

    const inp = '{\n  "input": {\n    "\n  }\n}';
    expect(suggest(inp, inp.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['search', 'simple', 'http', 'chain']);

    const si = '{\n  "input": {\n    "search": {\n      "\n    }\n  }\n}';
    expect(suggest(si, si.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['request', 'extract', 'timeout']);

    const sr = '{\n  "input": {\n    "search": {\n      "request": {\n        "\n      }\n    }\n  }\n}';
    const srLabels = suggest(sr, sr.lastIndexOf('"') + 1).map(i => i.label);
    expect(srLabels).toEqual([
      'indices', 'body', 'template', 'search_type', 'indices_options', 'rest_total_hits_as_int',
    ]);

    const hi = '{\n  "input": {\n    "http": {\n      "\n    }\n  }\n}';
    expect(suggest(hi, hi.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'request', 'extract', 'response_content_type',
    ]);

    const hr = '{\n  "input": {\n    "http": {\n      "request": {\n        "\n      }\n    }\n  }\n}';
    expect(suggest(hr, hr.lastIndexOf('"') + 1).map(i => i.label)).toContain('url');

    const chainInp = '{\n  "input": {\n    "chain": {\n      "\n    }\n  }\n}';
    expect(suggest(chainInp, chainInp.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['inputs']);

    const chainNamed = '{\n  "input": {\n    "chain": {\n      "inputs": [\n        {\n          "first": {\n            "\n          }\n        }\n      ]\n    }\n  }\n}';
    expect(suggest(chainNamed, chainNamed.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'search', 'simple', 'http', 'chain',
    ]);

    const searchBody = '{\n  "input": {\n    "search": {\n      "request": {\n        "body": {\n          "\n        }\n      }\n    }\n  }\n}';
    const sbLabels = suggest(searchBody, searchBody.lastIndexOf('"') + 1).map(i => i.label);
    expect(sbLabels).toContain('query');
    expect(sbLabels).toContain('aggs');

    const sbQuery = '{\n  "input": {\n    "search": {\n      "request": {\n        "body": {\n          "query": {\n            "\n          }\n        }\n      }\n    }\n  }\n}';
    const sbqLabels = suggest(sbQuery, sbQuery.lastIndexOf('"') + 1).map(i => i.label);
    expect(sbqLabels).toContain('match');
    expect(sbqLabels).toContain('bool');

    const cond = '{\n  "condition": {\n    "\n  }\n}';
    expect(suggest(cond, cond.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'always', 'never', 'compare', 'array_compare', 'script',
    ]);

    const condParams = '{\n  "condition": {\n    "script": {\n      "\n    }\n  }\n}';
    expect(suggest(condParams, condParams.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'source', 'lang', 'params', 'id',
    ]);

    const arrCmp = '{\n  "condition": {\n    "array_compare": {\n      "ctx.payload.hits.hits": {\n        "\n      }\n    }\n  }\n}';
    expect(suggest(arrCmp, arrCmp.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'path', 'eq', 'not_eq', 'lt', 'gt', 'lte', 'gte',
    ]);

    const arrOp = '{\n  "condition": {\n    "array_compare": {\n      "ctx.payload.hits.hits": {\n        "gte": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(arrOp, arrOp.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['quantifier', 'value']);

    const acts = '{\n  "actions": {\n    "notify": {\n      "\n    }\n  }\n}';
    expect(suggest(acts, acts.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'email', 'webhook', 'index', 'logging', 'slack', 'pagerduty', 'jira',
    ]);

    const logParams = '{\n  "actions": {\n    "notify": {\n      "logging": {\n        "\n      }\n    }\n  }\n}';
    expect(suggest(logParams, logParams.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['level', 'text', 'category']);

    const idxParams = '{\n  "actions": {\n    "notify": {\n      "index": {\n        "\n      }\n    }\n  }\n}';
    expect(suggest(idxParams, idxParams.lastIndexOf('"') + 1).map(i => i.label)).toContain('index');

    const deep = '{\n  "actions": {\n    "notify": {\n      "webhook": {\n        "headers": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(deep, deep.lastIndexOf('"') + 1), '动作参数更深层不出键').toEqual([]);

    const emailBody = '{\n  "actions": {\n    "mail": {\n      "email": {\n        "body": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(emailBody, emailBody.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['text', 'html']);

    const emailAtt = '{\n  "actions": {\n    "mail": {\n      "email": {\n        "attachments": {\n          "report": {\n            "\n          }\n        }\n      }\n    }\n  }\n}';
    expect(suggest(emailAtt, emailAtt.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['http', 'reporting', 'data']);

    const emailAttHttp = '{\n  "actions": {\n    "mail": {\n      "email": {\n        "attachments": {\n          "report": {\n            "http": {\n              "\n            }\n          }\n        }\n      }\n    }\n  }\n}';
    expect(suggest(emailAttHttp, emailAttHttp.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'content_type', 'inline', 'request',
    ]);

    const emailAttReq = '{\n  "actions": {\n    "mail": {\n      "email": {\n        "attachments": {\n          "report": {\n            "http": {\n              "request": {\n                "\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}';
    expect(suggest(emailAttReq, emailAttReq.lastIndexOf('"') + 1).map(i => i.label)).toContain('url');

    const slackMsg = '{\n  "actions": {\n    "chat": {\n      "slack": {\n        "message": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(slackMsg, slackMsg.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'text', 'from', 'to', 'attachments',
    ]);

    const jiraFields = '{\n  "actions": {\n    "ticket": {\n      "jira": {\n        "fields": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(jiraFields, jiraFields.lastIndexOf('"') + 1).map(i => i.label)).toContain('project');

    const hookAuth = '{\n  "actions": {\n    "hook": {\n      "webhook": {\n        "auth": {\n          "basic": {\n            "\n          }\n        }\n      }\n    }\n  }\n}';
    expect(suggest(hookAuth, hookAuth.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['username', 'password']);

    const hookProxy = '{\n  "actions": {\n    "hook": {\n      "webhook": {\n        "proxy": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(hookProxy, hookProxy.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['host', 'port']);

    const pdCtx = '{\n  "actions": {\n    "pd": {\n      "pagerduty": {\n        "contexts": [\n          {\n            "\n          }\n        ]\n      }\n    }\n  }\n}';
    expect(suggest(pdCtx, pdCtx.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['type', 'href', 'src']);

    const slackAtt = '{\n  "actions": {\n    "chat": {\n      "slack": {\n        "message": {\n          "attachments": [\n            {\n              "\n            }\n          ]\n        }\n      }\n    }\n  }\n}';
    const saLabels = suggest(slackAtt, slackAtt.lastIndexOf('"') + 1).map(i => i.label);
    expect(saLabels).toContain('title');
    expect(saLabels).toContain('fields');

    const slackField = '{\n  "actions": {\n    "chat": {\n      "slack": {\n        "message": {\n          "attachments": [\n            {\n              "fields": [\n                {\n                  "\n                }\n              ]\n            }\n          ]\n        }\n      }\n    }\n  }\n}';
    expect(suggest(slackField, slackField.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['short', 'title', 'value']);

    const inputProxy = '{\n  "input": {\n    "http": {\n      "request": {\n        "proxy": {\n          "\n        }\n      }\n    }\n  }\n}';
    expect(suggest(inputProxy, inputProxy.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['host', 'port']);
  });
});

describe('1439 安全体系写体补全', () => {
  it('角色：根六键 → indices 元素 → field_security → applications 元素', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-role-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual([
      'cluster', 'indices', 'applications', 'global', 'run_as', 'metadata', 'transient_metadata',
    ]);

    const ix = '{\n  "indices": [\n    {\n      "\n    }\n  ]\n}';
    expect(suggest(ix, ix.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'names', 'privileges', 'field_security', 'query', 'allow_restricted_indices',
    ]);

    const fs = '{\n  "indices": [\n    {\n      "field_security": {\n        "\n      }\n    }\n  ]\n}';
    expect(suggest(fs, fs.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['grant', 'except']);

    const q = '{\n  "indices": [\n    {\n      "query": {\n        "\n      }\n    }\n  ]\n}';
    const qLabels = suggest(q, q.lastIndexOf('"') + 1).map(i => i.label);
    expect(qLabels).toContain('match');
    expect(qLabels).toContain('bool');

    const app = '{\n  "applications": [\n    {\n      "\n    }\n  ]\n}';
    expect(suggest(app, app.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['application', 'privileges', 'resources']);

    const deep = '{\n  "indices": [\n    {\n      "names": [\n        "\n      ]\n    }\n  ]\n}';
    expect(suggest(deep, deep.lastIndexOf('"') + 1), '索引模式数组位不出键').toEqual([]);
  });

  it('用户：根八键 → role_templates 元素两键；布尔裸值位给 true/false', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-user-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual([
      'password', 'password_hash', 'roles', 'full_name', 'email', 'metadata', 'enabled', 'role_templates',
    ]);
    const rt = '{\n  "role_templates": [\n    {\n      "\n    }\n  ]\n}';
    expect(suggest(rt, rt.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['template', 'format']);
    const en = '{"enabled": }';
    expect(suggest(en, en.indexOf('}')).map(i => i.label)).toEqual(['true', 'false']);
  });

  it('角色映射根键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-role-mapping-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual([
      'roles', 'enabled', 'rules', 'role_templates', 'run_as', 'metadata',
    ]);
  });

  it('用户/映射 role_templates 的 template 给脚本键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-user-body' } });
    const u = '{\n  "role_templates": [\n    {\n      "template": {\n        "\n      }\n    }\n  ]\n}';
    expect(suggest(u, u.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['source', 'lang', 'params', 'id']);

    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-role-mapping-body' } });
    const m = '{\n  "role_templates": [\n    {\n      "template": {\n        "\n      }\n    }\n  ]\n}';
    expect(suggest(m, m.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['source', 'lang', 'params', 'id']);
  });

  it('角色映射 rules 与 all 元素给规则键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-role-mapping-body' } });
    const rules = '{\n  "rules": {\n    "\n  }\n}';
    expect(suggest(rules, rules.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['field', 'all', 'any', 'except']);
    const all = '{\n  "rules": {\n    "all": [\n      {\n        "\n      }\n    ]\n  }\n}';
    expect(suggest(all, all.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['field', 'all', 'any', 'except']);
  });

  it('API Key 根键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-api-key-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual(['name', 'expiration', 'role_descriptors', 'metadata']);
  });

  it('API Key role_descriptors 内给角色体键；动态角色名位不出键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-api-key-body' } });
    const role = '{\n  "role_descriptors": {\n    "admin": {\n      "\n    }\n  }\n}';
    expect(suggest(role, role.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'cluster', 'indices', 'applications', 'global', 'run_as', 'metadata', 'transient_metadata',
    ]);
    const namePos = '{\n  "role_descriptors": {\n    "\n  }\n}';
    expect(suggest(namePos, namePos.lastIndexOf('"') + 1), '角色名是动态键').toEqual([]);
  });

  it('跨集群 Key access[].query 内回落 Query DSL', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-cross-cluster-api-key-body' } });
    const q = '{\n  "access": {\n    "search": [\n      {\n        "query": {\n          "\n        }\n      }\n    ]\n  }\n}';
    const labels = suggest(q, q.lastIndexOf('"') + 1).map(i => i.label);
    expect(labels).toContain('match');
    expect(labels).toContain('bool');
  });

  it('代授 Key api_key.role_descriptors 内给角色体键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'security-api-key-grant-body' } });
    const role = '{\n  "api_key": {\n    "role_descriptors": {\n      "admin": {\n        "\n      }\n    }\n  }\n}';
    expect(suggest(role, role.lastIndexOf('"') + 1).map(i => i.label)).toContain('cluster');
  });
});

describe('1439 Ingest 管道体补全', () => {
  it('根五键；processors/on_failure 元素给处理器类型；参数内不出键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'ingest-pipeline-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual(['description', 'version', 'processors', 'on_failure', '_meta']);

    const procs = '{\n  "processors": [\n    {\n      "\n    }\n  ]\n}';
    const labels = suggest(procs, procs.lastIndexOf('"') + 1).map(i => i.label);
    for (const p of ['set', 'rename', 'remove', 'convert', 'date', 'grok', 'dissect', 'json', 'script', 'pipeline', 'foreach']) {
      expect(labels, p).toContain(p);
    }

    const of = '{\n  "on_failure": {\n    "\n  }\n}';
    expect(suggest(of, of.lastIndexOf('"') + 1).map(i => i.label)).toContain('set');

    const deep = '{\n  "processors": [\n    {\n      "set": {\n        "\n      }\n    }\n  ]\n}';
    expect(suggest(deep, deep.lastIndexOf('"') + 1), '处理器参数内不出键').toEqual([]);
  });
});

describe('1439 Enrich 策略体补全', () => {
  it('根三型 → match/range 键；query 内回落 Query DSL', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'enrich-policy-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual(['match', 'geo_match', 'range']);

    const match = '{\n  "match": {\n    "\n  }\n}';
    expect(suggest(match, match.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'indices', 'query', 'match_field', 'enrich_fields',
    ]);

    const range = '{\n  "range": {\n    "\n  }\n}';
    expect(suggest(range, range.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'indices', 'query', 'field', 'ranges', 'enrich_fields',
    ]);

    const q = '{"match": {"query": {"';
    const qLabels = suggest(q).map(i => i.label);
    expect(qLabels).toContain('match');
    expect(qLabels).toContain('term');

    const deep = '{"match": {"indices": ["';
    expect(suggest(deep).map(i => i.label), 'indices 数组位不出键').toEqual([]);
  });
});

describe('1439 Transform 体补全', () => {
  it('根 → source/dest/pivot/sync(.time)/retention(.time)；source.query 回落查询', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'transform-body' } });
    const root = '{\n  "\n}';
    const rootLabels = suggest(root, 5).map(i => i.label);
    for (const k of ['source', 'dest', 'pivot', 'latest', 'sync', 'retention_policy', 'description', 'settings', 'frequency', 'max_page_search_size', '_meta']) {
      expect(rootLabels, k).toContain(k);
    }

    const src = '{\n  "source": {\n    "\n  }\n}';
    expect(suggest(src, src.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['index', 'query', 'remote']);

    const dest = '{\n  "dest": {\n    "\n  }\n}';
    expect(suggest(dest, dest.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['index', 'pipeline']);

    const pivot = '{\n  "pivot": {\n    "\n  }\n}';
    expect(suggest(pivot, pivot.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['group_by', 'aggregations']);

    const st = '{\n  "sync": {\n    "time": {\n      "\n    }\n  }\n}';
    expect(suggest(st, st.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['field', 'delay']);

    const rt = '{\n  "retention_policy": {\n    "time": {\n      "\n    }\n  }\n}';
    expect(suggest(rt, rt.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['field', 'max_age']);

    const q = '{"source": {"query": {"';
    const qLabels = suggest(q).map(i => i.label);
    expect(qLabels).toContain('match');
    expect(qLabels).toContain('term');

    const deep = '{"source": {"index": ["';
    expect(suggest(deep).map(i => i.label), '索引数组位不出键').toEqual([]);
  });
});

describe('1439 Rollup 作业体补全', () => {
  it('根 → groups → 分组类型 → metrics 元素；更深层压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'rollup-job-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual([
      'index_pattern', 'rollup_index', 'cron', 'page_size', 'groups', 'metrics', 'timeout', 'headers',
    ]);

    const groups = '{\n  "groups": {\n    "\n  }\n}';
    expect(suggest(groups, groups.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'date_histogram', 'terms', 'histogram',
    ]);

    const date = '{\n  "groups": {\n    "date_histogram": {\n      "\n    }\n  }\n}';
    expect(suggest(date, date.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'field', 'calendar_interval', 'fixed_interval', 'time_zone',
    ]);

    const hist = '{\n  "groups": {\n    "histogram": {\n      "\n    }\n  }\n}';
    expect(suggest(hist, hist.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['fields', 'interval']);

    const metric = '{\n  "metrics": [\n    {\n      "\n    }\n  ]\n}';
    expect(suggest(metric, metric.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['field', 'metrics']);

    const deep = '{\n  "groups": {\n    "terms": {\n      "fields": [\n        "\n      ]\n    }\n  }\n}';
    expect(suggest(deep, deep.lastIndexOf('"') + 1), '分组字段数组位不出键').toEqual([]);
  });
});

describe('1439 ML 数据馈送体补全', () => {
  it('根键 → query 回落 → 延迟/分块/索引选项；更深层压住', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'ml-datafeed-body' } });
    const root = '{\n  "\n}';
    const labels = suggest(root, 5).map(i => i.label);
    for (const k of ['job_id', 'indexes', 'query', 'query_delay', 'frequency', 'scroll_size', 'delayed_data_check_config', 'chunking_config', 'indices_options', 'runtime_mappings', 'headers']) {
      expect(labels, k).toContain(k);
    }

    const q = '{"query": {"';
    const qLabels = suggest(q).map(i => i.label);
    expect(qLabels).toContain('match');
    expect(qLabels).toContain('term');

    const delayed = '{\n  "delayed_data_check_config": {\n    "\n  }\n}';
    expect(suggest(delayed, delayed.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['enabled', 'check_window']);

    const chunk = '{\n  "chunking_config": {\n    "\n  }\n}';
    expect(suggest(chunk, chunk.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['mode', 'time_span']);

    const idx = '{\n  "indices_options": {\n    "\n  }\n}';
    expect(suggest(idx, idx.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'expand_wildcards', 'ignore_unavailable', 'allow_no_indices',
    ]);

    const deep = '{"indices_options": {"expand_wildcards": ["';
    expect(suggest(deep).map(i => i.label), '通配展开数组位不出键').toEqual([]);
  });
});

describe('1439 ML 作业体补全', () => {
  it('根 → analysis_config → detectors 元素 → 上限/时间描述；布尔/枚举值位', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'ml-job-body' } });
    const root = '{\n  "\n}';
    const rootLabels = suggest(root, 5).map(i => i.label);
    for (const k of ['analysis_config', 'analysis_limits', 'data_description', 'description', 'groups', 'allow_lazy_open', 'datafeed_config']) {
      expect(rootLabels, k).toContain(k);
    }

    const cfg = '{\n  "analysis_config": {\n    "\n  }\n}';
    const cfgLabels = suggest(cfg, cfg.lastIndexOf('"') + 1).map(i => i.label);
    for (const k of ['bucket_span', 'latency', 'detectors', 'influencers', 'categorization_field_name']) {
      expect(cfgLabels, k).toContain(k);
    }

    const det = '{\n  "analysis_config": {\n    "detectors": [\n      {\n        "\n      }\n    ]\n  }\n}';
    const detLabels = suggest(det, det.lastIndexOf('"') + 1).map(i => i.label);
    for (const k of ['function', 'field_name', 'by_field_name', 'over_field_name', 'partition_field_name', 'exclude_frequent', 'use_null']) {
      expect(detLabels, k).toContain(k);
    }

    const lim = '{\n  "analysis_limits": {\n    "\n  }\n}';
    expect(suggest(lim, lim.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['model_memory_limit', 'categorization_examples_limit']);

    const dd = '{\n  "data_description": {\n    "\n  }\n}';
    expect(suggest(dd, dd.lastIndexOf('"') + 1).map(i => i.label)).toEqual(['time_field', 'time_format']);

    const useNull = '{"use_null": }';
    expect(suggest(useNull, useNull.indexOf('}')).map(i => i.label)).toEqual(['false', 'true']);
    const excl = '{"exclude_frequent": "';
    expect(suggest(excl).map(i => i.label)).toEqual(['all', 'none', 'by', 'over']);

    const deep = '{"analysis_config": {"detectors": [{"function": {';
    expect(suggest(deep).map(i => i.label), 'function 值对象内不出键').toEqual([]);
  });
});

describe('1439 管道试跑体补全', () => {
  it('根三键 → pipeline 复用管道键 → processors 复用处理器目录 → docs 元素键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => [], bodyKind: () => 'ingest-simulate-body' } });
    const root = '{\n  "\n}';
    expect(suggest(root, 5).map(i => i.label)).toEqual(['pipeline', 'docs', 'verbose']);

    const pol = '{\n  "pipeline": {\n    "\n  }\n}';
    expect(suggest(pol, pol.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      'description', 'version', 'processors', 'on_failure', '_meta',
    ]);

    const procs = '{\n  "pipeline": {\n    "processors": [\n      {\n        "\n      }\n    ]\n  }\n}';
    const procLabels = suggest(procs, procs.lastIndexOf('"') + 1).map(i => i.label);
    expect(procLabels).toContain('set');
    expect(procLabels).toContain('grok');

    const docs = '{\n  "docs": [\n    {\n      "\n    }\n  ]\n}';
    expect(suggest(docs, docs.lastIndexOf('"') + 1).map(i => i.label)).toEqual([
      '_index', '_id', '_source', '_routing',
    ]);

    const ver = '{"verbose": }';
    expect(suggest(ver, ver.indexOf('}')).map(i => i.label)).toEqual(['true', 'false']);
  });
});

describe('1439 子句体键位（query-body-key / clause-field-key / retriever-body-key）', () => {
  it('bool 体给 must/filter/should/must_not，接受后 JSON 合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{\n  "query": {\n    "bool": {\n      \n    }\n  }\n}';
    const at = doc.indexOf('      \n') + 6;
    const items = suggest(doc, at);
    const labels = items.map((i: any) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['must', 'filter', 'should', 'must_not', 'minimum_should_match']));
    expect(labels).not.toContain('match');
    for (const it of items) {
      expect(it.kind).toBe(Kind.Property);
      expect(it.insertTextRules).toBe(Rule.InsertAsSnippet);
      const after = acceptSnippet(doc, it);
      expect(() => JSON.parse(after), it.label + ' 接受后非法：' + after).not.toThrow();
    }
  });

  it('bool.must 的元素对象仍是算子档（不过度扩张）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const labels = suggest('{"query":{"bool":{"must":[{"').map((i: any) => i.label);
    expect(labels).toContain('bool');
    expect(labels).not.toContain('must');
  });

  it('nested / multi_match / ids / knn 体给各自的结构键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"query":{"nested":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['path', 'query', 'score_mode', 'inner_hits']));
    expect(suggest('{"query":{"multi_match":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['query', 'fields', 'type']));
    expect(suggest('{"query":{"ids":{"').map((i: any) => i.label)).toEqual(['values']);
    expect(suggest('{"knn":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['field', 'query_vector', 'k', 'num_candidates', 'filter']));
  });

  it('collapse / highlight 体给根层键位', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"collapse":{"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['field', 'inner_hits']));
    expect(suggest('{"highlight":{"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['fields', 'type', 'pre_tags']));
  });

  it('match.<field> 配置对象给 query/operator', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"query":{"match":{"title":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['query', 'operator', 'fuzziness', 'boost']));
  });

  it('retriever.standard 体给 query（此前空档）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const labels = suggest('{"retriever":{"standard":{"').map((i: any) => i.label);
    expect(labels).toContain('query');
    expect(labels).not.toContain('standard');
  });

  it('值位不出键位档（"must": " 恒空）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"query":{"bool":{"must": "')).toEqual([]);
  });
});

describe('1439-b 容器体 / 建议器体 / 字段数组键位', () => {
  it('inner_hits / rescore / pit / match_all 体给结构键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"query":{"nested":{"inner_hits":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['from', 'size', 'name', '_source']));
    expect(suggest('{"rescore":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['window_size', 'query', 'rescore_query', 'score_mode']));
    expect(suggest('{"pit":{"').map((i: any) => i.label)).toEqual(['id', 'keep_alive']);
    expect(suggest('{"query":{"match_all":{"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['boost', '_name']));
  });

  it('script_fields / runtime_mappings 的自由字段体给 script/type', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"script_fields":{"s1":{"').map((i: any) => i.label)).toEqual(['script']);
    expect(suggest('{"script_fields":{"s1":{"script":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['source', 'lang', 'params']));
    expect(suggest('{"runtime_mappings":{"f":{"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['type', 'script']));
  });

  it('suggest.<名>.term 体给 field/text/suggest_mode（不是查询 term 的 value）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const labels = suggest('{"suggest":{"s1":{"term":{"').map((i: any) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['field', 'text', 'prefix', 'suggest_mode']));
    expect(labels).not.toContain('value');
  });

  it('highlight.<字段> 给字段级配置 / fields 数组元素对象给 field+format', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"highlight":{"fields":{"title":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['type', 'fragment_size', 'pre_tags', 'number_of_fragments']));
    expect(suggest('{"fields":[{"').map((i: any) => i.label)).toEqual(['field', 'format']);
    /* fields 串数组（根层 / multi_match）同 _source 轨出字段候选 */
    expect(suggest('{"fields":["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    expect(suggest('{"query":{"multi_match":{"query":"x","fields":["').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['title', 'price']));
  });

  it('_source 对象形态给 includes/excludes，数组元素出字段候选', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"_source":{"').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['includes', 'excludes', 'include', 'exclude']));
    expect(suggest('{"_source":{"includes":["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    expect(suggest('{"_source":{"excludes":["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
  });

  it('stored_fields / docvalue_fields 数组出字段候选（同 _source 轨）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"stored_fields":["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    expect(suggest('{"docvalue_fields":["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    expect(suggest('{"_source":["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
  });
});

describe('1439 mapping 档 type 值位补全', () => {
  it('mapping 档给字段类型目录（含 date_nanos/unsigned_long/dense_vector）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mapping' as const } });
    const doc = '{"properties": {"x": {"type": "';
    const items = suggest(doc);
    const labels = items.map((i: any) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['keyword', 'text', 'long', 'date_nanos', 'unsigned_long', 'dense_vector']));
    for (const i of items) {
      expect(i.kind).toBe(Kind.Value);
      expect(i.insertText).toBe('"' + i.label + '"');
    }
    const after = acceptSnippet(doc, items.find((i: any) => i.label === 'keyword'));
    expect(() => JSON.parse(after + '}}}')).not.toThrow();
  });

  it('search 档同位置不出（7.x type 查询的文档类型名 ≠ 字段类型）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'search' as const } });
    expect(suggest('{"properties": {"x": {"type": "')).toEqual([]);
    expect(suggest('{"query": {"type": {"value": "')).toEqual([]);
  });
});

describe('1439 terms.order 键位补全', () => {
  it('terms 的 order 对象给 _count/_key/_key_as_string（接受后 JSON 合法）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"aggs":{"a":{"terms":{"order":{';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['_count', '_key', '_key_as_string']);
    for (const i of items) {
      expect(() => JSON.parse(acceptSnippet(doc, i) + '}}}}}'), i.label).not.toThrow();
    }
  });

  it('非 terms 聚合体的 order 不出档；multi_terms 出档', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"aggs":{"a":{"histogram":{"order":{')).toEqual([]);
    expect(suggest('{"aggs":{"a":{"multi_terms":{"order":{').map((i: any) => i.label))
      .toEqual(['_count', '_key', '_key_as_string']);
  });

  it('terms 实例下的单值数值子聚合名进 order 键位（桶聚合不列，接受后 JSON 合法）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"aggs":{"by_tag":{"aggs":{"avg_price":{"avg":{"field":"price"}},'
      + '"max_stock":{"max":{"field":"stock"}},"tops":{"top_hits":{}}},'
      + '"terms":{"field":"tag","order":{';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label))
      .toEqual(['avg_price', 'max_stock', '_count', '_key', '_key_as_string']);
    for (const i of items) {
      const after = acceptSnippet(doc, i);
      expect(() => JSON.parse(after + '}}}}}'), i.label + ' 接受后非法：' + after).not.toThrow();
      expect(after).toContain('"' + i.label + '": "');
    }
    const avg = acceptSnippet(doc, items[0]);
    expect(avg).toContain('"avg_price": "desc"');
  });
});

describe('1439 terms.order 方向值补全', () => {
  it('order 对象的值位给 asc/desc（接受后 JSON 合法）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const doc = '{"aggs":{"a":{"terms":{"order":{"_count": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['asc', 'desc']);
    for (const i of items) {
      expect(i.insertText).toBe('"' + i.label + '"');
      expect(() => JSON.parse(acceptSnippet(doc, i) + '}}}}}'), i.label).not.toThrow();
    }
  });

  it('非 terms 聚合的 order 值位不出方向；order 键位仍出三键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"aggs":{"a":{"histogram":{"order":{"_count": "')).toEqual([]);
    expect(suggest('{"aggs":{"a":{"terms":{"order":{').map((i: any) => i.label))
      .toEqual(['_count', '_key', '_key_as_string']);
  });
});

describe('1439 sort 简写串数组出字段候选', () => {
  it('根级 sort 与 top_hits.sort 的串元素给字段名（接受后 JSON 合法）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    const root = suggest('{"sort": ["');
    expect(root.map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    expect(() => JSON.parse(acceptSnippet('{"sort": [', root.find((i: any) => i.label === 'title')) + ']}')).not.toThrow();
    const th = suggest('{"aggs":{"a":{"top_hits":{"sort":["');
    expect(th.map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
  });

  it('负控：非白名单数组（terms 的 field 值数组）不出字段候选', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS } });
    expect(suggest('{"aggs":{"a":{"terms":{"field":["')).toEqual([]);
  });
});

describe('1439 模板体内补全分区', () => {
  it('template.settings 给设置键、template.mappings 给映射键、aliases 不出键档', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'template' as const } });
    const st = suggest('{"template": {"settings": { "').map((i: any) => i.label);
    expect(st).toContain('number_of_shards');
    expect(st).not.toContain('index_patterns');
    const mp = suggest('{"template": {"mappings": { "').map((i: any) => i.label);
    expect(mp).toEqual(expect.arrayContaining(['properties', 'dynamic']));
    expect(mp).not.toContain('index_patterns');
    expect(suggest('{"template": {"aliases": { "')).toEqual([]); /* 命名位不给键档 */
    expect(suggest('{"template": {"aliases": {"old": { "').map((i: any) => i.label)).toContain('filter');
    /* 顶层仍是模板八键 */
    expect(suggest('{"').map((i: any) => i.label)).toContain('index_patterns');
  });
});

describe('1439 mapping 字段配置键位', () => {
  it('properties.<字段> 内给 analyzer/format 等；映射顶层仍给 properties/dynamic', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mapping' as const } });
    const fld = suggest('{"properties": {"title": { "').map((i: any) => i.label);
    expect(fld).toEqual(expect.arrayContaining(['type', 'analyzer', 'format', 'ignore_above', 'doc_values']));
    expect(fld).not.toContain('index_patterns');
    const top = suggest('{"').map((i: any) => i.label);
    expect(top).toEqual(expect.arrayContaining(['properties', 'dynamic', 'type', 'fields']));
    expect(top).not.toContain('analyzer');
  });

  it('嵌套对象与多字段子域的字段配置位同样分派', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mapping' as const } });
    expect(suggest('{"properties": {"a": {"properties": {"b": { "').map((i: any) => i.label)).toContain('analyzer');
    expect(suggest('{"properties": {"a": {"fields": {"raw": { "').map((i: any) => i.label)).toContain('analyzer');
  });
});

describe('1439 创建索引体补全', () => {
  it('根层给 settings/mappings/aliases；各块内给对应键；aliases 不出键档', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'index-body' as const } });
    expect(suggest('{"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['settings', 'mappings', 'aliases']));
    expect(suggest('{"settings": { "').map((i: any) => i.label)).toContain('number_of_shards');
    expect(suggest('{"mappings": { "').map((i: any) => i.label)).toContain('properties');
    expect(suggest('{"mappings": {"properties": {"a": { "').map((i: any) => i.label)).toContain('analyzer');
    expect(suggest('{"aliases": { "')).toEqual([]);
  });
});

describe('1439 别名体补全', () => {
  it('PUT /idx/_alias/<名> 体给 filter/routing/is_write_index', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'alias-body' as const } });
    const labels = suggest('{"').map((i: any) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['filter', 'routing', 'index_routing', 'search_routing', 'is_write_index']));
    const items = suggest('{"');
    expect(() => JSON.parse(acceptSnippet('{', items.find((i: any) => i.label === 'filter')) + '}')).not.toThrow();
  });
});

describe('1439 重建索引体补全', () => {
  it('根层给 source/dest/script；source/dest 体内给各自键；source.query 内回落整棵查询补全', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'reindex-body' as const } });
    expect(suggest('{"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['source', 'dest', 'script', 'conflicts']));
    expect(suggest('{"source": { "').map((i: any) => i.label)).toEqual(expect.arrayContaining(['index', 'query', 'size']));
    expect(suggest('{"dest": { "').map((i: any) => i.label)).toEqual(expect.arrayContaining(['index', 'op_type', 'pipeline']));
    expect(suggest('{"source": {"query": { "').map((i: any) => i.label)).toContain('match');
  });
});

describe('1439 SQL 体补全', () => {
  it('键位给 query/fetch_size；"query": 值位给 SELECT 骨架且接受后 JSON 合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'sql-body' as const } });
    expect(suggest('{"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['query', 'fetch_size', 'time_zone', 'columnar']));
    const doc = '{"query": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(expect.arrayContaining(['SELECT *', 'SELECT WHERE']));
    for (const i of items) {
      const after = acceptSnippet(doc, i);
      expect(() => JSON.parse(after + '}'), i.label + ' 接受后非法：' + after).not.toThrow();
      expect(after).toMatch(/SELECT .* FROM \\"my-index\\"/);
    }
  });
  it('负控：sql-body 非 query 值位仍压制', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'sql-body' as const } });
    expect(suggest('{"time_zone": "')).toEqual([]);
    expect(suggest('{"params": "')).toEqual([]);
  });
  it('负控：settings 档的 query 值位不套 SELECT 骨架', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'settings' as const } });
    expect(suggest('{"query": "')).toEqual([]);
  });
  it('串内已有内容：只给关键字/函数并在光标处插入，绝不用骨架整串替换', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'sql-body' as const } });
    const doc = '{"query": "SELECT * FROM my-index WHERE ';
    const labels = suggest(doc).map((i: any) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['WHERE', 'GROUP BY', 'LIMIT', 'COUNT(*)']));
    expect(labels).not.toContain('SELECT *');
    const w = suggest(doc).find((i: any) => i.label === 'WHERE');
    const after = acceptSnippet(doc, w);
    expect(after).toContain('SELECT * FROM my-index');
    expect(after).toContain('WHERE WHERE ');
    expect(() => JSON.parse(after + '"}')).not.toThrow();
    /* 闭合串、光标在串中也同口径（不吞后文结构） */
    const closed = '{"query": "SELECT * FROM my-index ORDER BY ts "}';
    const off = closed.indexOf('"}');
    const items = suggest(closed, off);
    const lim = items.find((i: any) => i.label === 'LIMIT');
    expect(lim, '闭合串中途应给关键字').toBeTruthy();
    const after2 = acceptSnippet(closed, lim);
    expect(after2).toContain('SELECT * FROM my-index ORDER BY ts');
    expect(() => JSON.parse(after2)).not.toThrow();
  });
  it('负控：search 档的 query 值位不出 SELECT 骨架', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'search' as const } });
    expect(suggest('{"query": "').filter((i: any) => /^SELECT /.test(i.label))).toEqual([]);
  });
});

describe('1439 更新体 / 滚动体键位补全', () => {
  it('update 体：根键七项（接受即合法）；doc/upsert 裸文档零候选；script 内给脚本键且更深层压制', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'update-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label))
      .toEqual(['doc', 'upsert', 'doc_as_upsert', 'script', 'scripted_upsert', 'detect_noop', '_source']);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"doc": {"')).toEqual([]);
    expect(suggest('{"upsert": {"')).toEqual([]);
    expect(suggest('{"script": {"').map((i: any) => i.label)).toEqual(['source', 'lang', 'params', 'id']);
    expect(suggest('{"script": {"params": {"')).toEqual([]);
  });

  it('rollover 体：根块键 / conditions 只给 max_* / settings·mappings·aliases 按区域分派', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'rollover-body' as const } });
    expect(suggest('{"').map((i: any) => i.label)).toEqual(['conditions', 'settings', 'mappings', 'aliases']);
    expect(suggest('{"conditions": {"').map((i: any) => i.label))
      .toEqual(['max_age', 'max_docs', 'max_size', 'max_primary_shard_size', 'max_primary_shard_docs']);
    expect(suggest('{"conditions": {"max_age": "1d", "').map((i: any) => i.label))
      .toContain('max_docs');
    expect(suggest('{"conditions": {"max_age": {"')).toEqual([]);
    const st = suggest('{"settings": {"').map((i: any) => i.label);
    expect(st).toContain('number_of_shards');
    expect(suggest('{"mappings": {"').map((i: any) => i.label)).toContain('properties');
    expect(suggest('{"aliases": {"a": {"').map((i: any) => i.label)).toContain('filter');
    expect(suggest('{"aliases": {"')).toEqual([]);
  });

  it('负控：_doc 裸文档体仍是 doc 档（键位零候选），field 值位白名单不回归', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'doc' as const } });
    expect(suggest('{"')).toEqual([]);
    expect(suggest('{"doc": {"')).toEqual([]);
    expect(suggest('{"field": "').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
  });
});

describe('1439 按查询删/改体键位补全', () => {
  it('ubq 体：根键五项（接受即合法）；query 内回落整棵查询补全；script 内给脚本键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'ubq-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['query', 'script', 'max_docs', 'pipeline', 'slices']);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"query": {"').map((i: any) => i.label)).toContain('match');
    expect(suggest('{"query": {"bool": {"').map((i: any) => i.label)).toContain('must');
    expect(suggest('{"script": {"').map((i: any) => i.label)).toEqual(['source', 'lang', 'params', 'id']);
    expect(suggest('{"script": {"params": {"')).toEqual([]);
    /* 负控：根键位不掺 search 独有键（sort/aggs 写进 UBQ 会被 ES 拒） */
    expect(root.map((i: any) => i.label)).not.toContain('aggs');
    expect(root.map((i: any) => i.label)).not.toContain('sort');
  });

  it('dbq 体：根键四项，不出 script/pipeline；query 内同样回落；深层不出根键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'dbq-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['query', 'max_docs', 'slices', 'slice']);
    expect(root.map((i: any) => i.label)).not.toContain('script');
    expect(root.map((i: any) => i.label)).not.toContain('pipeline');
    expect(suggest('{"query": {"').map((i: any) => i.label)).toContain('match');
    expect(suggest('{"slice": {"')).toEqual([]);
  });
});

describe('1439 query-only / 模板执行体键位补全', () => {
  it('query-body：根键只有 query（不出 sort/aggs/size）；query 内回落整棵查询补全', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'query-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['query']);
    expect(() => JSON.parse(acceptSnippet('{', root[0]) + '}')).not.toThrow();
    expect(suggest('{"query": {"').map((i: any) => i.label)).toContain('match');
    expect(suggest('{"query": {"bool": {"').map((i: any) => i.label)).toContain('must');
    /* 负控：根键位不掺 search 独有键（count/explain 体里 sort/aggs 是非法根键） */
    expect(root.map((i: any) => i.label)).not.toContain('sort');
    expect(root.map((i: any) => i.label)).not.toContain('aggs');
  });

  it('template-search-body：根键 id/source/params；进入子对象后不再出根键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'template-search-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['id', 'source', 'params']);
    expect(root.map((i: any) => i.label)).not.toContain('query');
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"source": {"')).toEqual([]);
    expect(suggest('{"params": {"')).toEqual([]);
  });
});

describe('1439 runtime_mappings 类型位', () => {
  it('search 体：type 值位给 runtime 类型目录（接受即合法）；键位仍给 type/script；mapping type 不受影响', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'search' as const } });
    const doc = '{"runtime_mappings": {"day": {"type": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual([
      'boolean', 'composite', 'date', 'double', 'geo_point', 'ip', 'keyword', 'long', 'lookup',
    ]);
    for (const i of items) {
      expect(() => JSON.parse(acceptSnippet(doc, i) + '}}}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"runtime_mappings": {"day": {"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['type', 'script']));
    expect(suggest('{"mappings": {"properties": {"a": {"type": "').map((i: any) => i.label)).not.toContain('composite');
  });

  it('sql 体：runtime 字段配置跳过 W6——键位给 type/script、值位给类型目录', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'sql-body' as const } });
    expect(suggest('{"runtime_mappings": {"day": {"').map((i: any) => i.label)).toEqual(expect.arrayContaining(['type', 'script']));
    expect(suggest('{"runtime_mappings": {"day": {"type": "').map((i: any) => i.label)).toContain('composite');
  });
});

describe('1439 _rank_eval 补全', () => {
  it('根 requests/metric；评估项 request/ratings；metric 指标键；命名位/深层压制', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'rank-eval-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['requests', 'metric']);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    const item = suggest('{"requests": {"q1": {"');
    expect(item.map((i: any) => i.label)).toEqual(['request', 'ratings']);
    for (const i of item) {
      expect(() => JSON.parse(acceptSnippet('{"requests": {"q1": {"', i) + '}}}'), i.label + ' 接受后非法').not.toThrow();
    }
    const metric = suggest('{"metric": {"');
    expect(metric.map((i: any) => i.label)).toEqual(['dcg', 'ndcg', 'precision', 'recall', 'mean_reciprocal_rank']);
    for (const i of metric) {
      expect(() => JSON.parse(acceptSnippet('{"metric": {"', i) + '}}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"requests": {"')).toEqual([]);
    expect(suggest('{"requests": {"q1": {"request": {"')).toEqual([]);
  });
});

describe('1439 field_caps / terms_enum 补全', () => {
  it('field-caps：根三键（接受即合法）；index_filter 内回落查询；runtime type 值位给目录', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'field-caps-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['fields', 'index_filter', 'runtime_mappings']);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"index_filter": {"').map((i: any) => i.label)).toContain('match');
    expect(suggest('{"index_filter": {"bool": {"').map((i: any) => i.label)).toContain('must');
    expect(suggest('{"runtime_mappings": {"day": {"type": "').map((i: any) => i.label)).toContain('composite');
  });

  it('terms-enum：根七键；field 值位给字段名；index_filter 内回落查询', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'terms-enum-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual([
      'field', 'string', 'size', 'case_insensitive', 'index_filter', 'timeout', 'search_after',
    ]);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"field": "').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    expect(suggest('{"index_filter": {"').map((i: any) => i.label)).toContain('match');
  });
});

describe('1439 _bulk 动作行补全', () => {
  it('动作行给动作键（接受即合法）；文档行不出键；下一对动作行再给键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'bulk-body' as const } });
    const items = suggest('{"');
    expect(items.map((i: any) => i.label)).toEqual(['index', 'create', 'update', 'delete']);
    for (const i of items) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    /* 文档行是裸文档 */
    expect(suggest('{"index":{"_index":"a","_id":"1"}}\n{"')).toEqual([]);
    /* 第二对动作行 */
    expect(suggest('{"index":{"_index":"a"}}\n{"title":"x"}\n{"').map((i: any) => i.label))
      .toEqual(['index', 'create', 'update', 'delete']);
  });

  it('动作内层给元数据键；update 多 retry_on_conflict；顶层动作不含', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'bulk-body' as const } });
    expect(suggest('{"update": {"').map((i: any) => i.label)).toEqual([
      '_index', '_id', 'routing', 'version', 'version_type', 'if_seq_no', 'if_primary_term', 'retry_on_conflict',
    ]);
    const idx = suggest('{"index": {"').map((i: any) => i.label);
    expect(idx).toContain('_index');
    expect(idx).not.toContain('retry_on_conflict');
    const meta = suggest('{"update": {"');
    for (const i of meta) {
      expect(() => JSON.parse(acceptSnippet('{"update": {"', i) + '}}'), i.label + ' 接受后非法').not.toThrow();
    }
  });

  it('动作元数据 "_index" 值位给当前集群索引名（接受即合法）', () => {
    mountEditor({
      modelValue: '{}',
      dslAssist: { fields: () => FIELDS, bodyKind: () => 'bulk-body' as const, indices: () => ['logs-2026', 'metrics'] },
    });
    const doc = '{"index": {"_index": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['logs-2026', 'metrics']);
    for (const i of items) {
      expect(() => JSON.parse(acceptSnippet(doc, i) + '}}'), i.label + ' 接受后非法').not.toThrow();
    }
  });
});

describe('1439 _msearch 头行补全', () => {
  it('头行键给请求头目录（接受即合法）；查询体行回落 search；第二对头行仍给头键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'msearch-body' as const } });
    const doc = '{"';
    const headers = suggest(doc);
    expect(headers.map((i: any) => i.label)).toEqual([
      'index', 'search_type', 'routing', 'preference', 'ignore_unavailable',
      'allow_no_indices', 'expand_wildcards', 'ccs_minimize_roundtrips',
    ]);
    for (const i of headers) {
      expect(() => JSON.parse(acceptSnippet(doc, i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"index":"a"}\n{"query": {"').map((i: any) => i.label)).toContain('match');
    expect(suggest('{"index":"a"}\n{"query": {"bool": {"').map((i: any) => i.label)).toContain('must');
    expect(suggest('{"index":"a"}\n{"query":{}}\n{"').map((i: any) => i.label)).toContain('search_type');
  });

  it('负控：头行值位不出 search 根键/头键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'msearch-body' as const } });
    expect(suggest('{"index": "')).toEqual([]);
  });

  it('头行 "index" 值位给当前集群索引名（接受即合法）', () => {
    mountEditor({
      modelValue: '{}',
      dslAssist: { fields: () => FIELDS, bodyKind: () => 'msearch-body' as const, indices: () => ['logs-2026', 'metrics'] },
    });
    const doc = '{"index": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['logs-2026', 'metrics']);
    for (const i of items) {
      expect(() => JSON.parse(acceptSnippet(doc, i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
  });
});

describe('1439 _msearch/template 头体补全', () => {
  it('头行给请求头键；体行给 id/source/params（接受后该行 JSON 合法）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'msearch-template-body' as const } });
    expect(suggest('{"').map((i: any) => i.label)).toEqual([
      'index', 'search_type', 'routing', 'preference', 'ignore_unavailable',
      'allow_no_indices', 'expand_wildcards', 'ccs_minimize_roundtrips',
    ]);
    const doc = '{"index":"logs"}\n{"';
    const bodyItems = suggest(doc);
    expect(bodyItems.map((i: any) => i.label)).toEqual(['id', 'source', 'params']);
    for (const i of bodyItems) {
      const after = acceptSnippet(doc, i);
      const bodyPart = after.slice(after.indexOf('\n') + 1);
      expect(() => JSON.parse(bodyPart + '}'), i.label + ' 接受后非法').not.toThrow();
    }
  });
});

describe('1439 _mget 体键位补全', () => {
  it('根键 docs/ids（接受即合法）；docs 元素给七个文档级键；ids 数组不出键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mget-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['docs', 'ids']);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    const docKeys = suggest('{"docs": [{"');
    expect(docKeys.map((i: any) => i.label))
      .toEqual(['_index', '_id', 'routing', '_source', 'stored_fields', 'version', 'version_type']);
    for (const i of docKeys) {
      expect(() => JSON.parse(acceptSnippet('{"docs": [{"', i) + '}]}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"ids": ["')).toEqual([]);
    /* 负控：根键位不掺 search/update 的键 */
    expect(root.map((i: any) => i.label)).not.toContain('query');
    expect(root.map((i: any) => i.label)).not.toContain('doc');
  });
});

describe('1439 SQL filter 回落 / 存储脚本体', () => {
  it('sql-body：filter 内回落到整棵查询补全；params 内不出 SQL 根键；根键与 SELECT 骨架仍在', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'sql-body' as const } });
    expect(suggest('{"filter": {"').map((i: any) => i.label)).toContain('match');
    expect(suggest('{"filter": {"bool": {"').map((i: any) => i.label)).toContain('must');
    expect(suggest('{"params": {"')).toEqual([]);
    expect(suggest('{"').map((i: any) => i.label)).toContain('query');
    expect(suggest('{"query": "').map((i: any) => i.label)).toEqual(expect.arrayContaining(['SELECT *']));
  });

  it('stored-script-body：根 script（接受即合法）；script 内 lang/source/params；params 内压制；不出 id', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'stored-script-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['script']);
    expect(() => JSON.parse(acceptSnippet('{', root[0]) + '}')).not.toThrow();
    const inner = suggest('{"script": {"');
    expect(inner.map((i: any) => i.label)).toEqual(['lang', 'source', 'params']);
    expect(inner.map((i: any) => i.label)).not.toContain('id');
    for (const i of inner) {
      expect(() => JSON.parse(acceptSnippet('{"script": {"', i) + '}}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"script": {"params": {"')).toEqual([]);
  });

  it('script-execute：根 script/context/context_setup；context 值位闭集；script 内含 id', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'script-execute-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['script', 'context', 'context_setup']);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"context": "').map((i: any) => i.label)).toEqual(['painless_test', 'score', 'filter']);
    expect(suggest('{"script": {"').map((i: any) => i.label)).toEqual(['source', 'lang', 'params', 'id']);
    expect(suggest('{"context_setup": {"')).toEqual([]);
  });
});

describe('1439 别名批量动作体键位补全', () => {
  it('四层区域：根 actions / 动作三键 / add 配置键 / remove_index 只给索引；深层压制', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'aliases-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['actions']);
    expect(() => JSON.parse(acceptSnippet('{', root[0]) + '}')).not.toThrow();
    expect(suggest('{"actions": [{"').map((i: any) => i.label)).toEqual(['add', 'remove', 'remove_index']);

    const addItems = suggest('{"actions": [{"add": {"');
    expect(addItems.map((i: any) => i.label)).toEqual([
      'index', 'indices', 'alias', 'aliases', 'filter', 'routing', 'index_routing',
      'search_routing', 'is_write_index', 'is_hidden', 'must_exist',
    ]);
    for (const i of addItems) {
      expect(() => JSON.parse(acceptSnippet('{"actions": [{"add": {"', i) + '}}]}'), i.label + ' 接受后非法').not.toThrow();
    }
    const removeLabels = suggest('{"actions": [{"remove": {"').map((i: any) => i.label);
    expect(removeLabels).toEqual(['index', 'indices', 'alias', 'aliases', 'must_exist']);
    expect(removeLabels).not.toContain('filter');
    expect(suggest('{"actions": [{"remove_index": {"').map((i: any) => i.label)).toEqual(['index', 'indices']);
    /* 负控：filter 查询对象内不再给别名配置键 */
    expect(suggest('{"actions": [{"add": {"filter": {"')).toEqual([]);
  });
});

describe('1439 游标翻页 / 清理游标体补全', () => {
  it('scroll 体：根键 scroll/scroll_id（接受即合法）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'scroll-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['scroll', 'scroll_id']);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
  });

  it('clear-scroll 体：只 scroll_id（接受即合法）；不掺翻页体的 scroll', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'clear-scroll-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual(['scroll_id']);
    expect(root.map((i: any) => i.label)).not.toContain('scroll');
    expect(() => JSON.parse(acceptSnippet('{', root[0]) + '}')).not.toThrow();
  });
});

describe('1439 结构化体值位枚举', () => {
  it('mget 文档项的 version_type 值位给 internal/external/external_gte（串值带引号，接受即合法）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mget-body' as const } });
    const doc = '{"docs": [{"version_type": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['internal', 'external', 'external_gte']);
    for (const i of items) {
      const after = acceptSnippet(doc, i);
      expect(after).toContain('"version_type": "' + i.label + '"');
      expect(() => JSON.parse(after + '}]}'), i.label + ' 接受后非法').not.toThrow();
    }
  });

  it('布尔键插裸 true/false（aliases is_write_index）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'aliases-body' as const } });
    const doc = '{"actions": [{"add": {"is_write_index": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['true', 'false']);
    for (const i of items) {
      const after = acceptSnippet(doc, i);
      expect(after).toContain('"is_write_index": ' + i.label);
      expect(after).not.toContain('"true"');
      expect(() => JSON.parse(after + '}}]}'), i.label + ' 接受后非法').not.toThrow();
    }
  });

  it('dbq slices 值位给 auto（串值带引号）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'dbq-body' as const } });
    const doc = '{"slices": "';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['auto']);
    const after = acceptSnippet(doc, items[0]);
    expect(after).toContain('"slices": "auto"');
    expect(() => JSON.parse(after + '}')).not.toThrow();
  });

  it('裸值位布尔键也出 true/false（此前只有敲了开引号才命中）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'aliases-body' as const } });
    const doc = '{"is_write_index": }';
    const items = suggest(doc, doc.indexOf('}'));
    expect(items.map((i: any) => i.label)).toEqual(['true', 'false']);
    const after = acceptSnippet(doc, items[0]);
    expect(() => JSON.parse(after), after).not.toThrow();
    expect(after).toContain('"is_write_index": true');
  });

  it('裸值位串枚举也出档（slices → "auto"，带引号插入）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'dbq-body' as const } });
    const doc = '{"slices": }';
    const items = suggest(doc, doc.indexOf('}'));
    expect(items.map((i: any) => i.label)).toEqual(['auto']);
    const after = acceptSnippet(doc, items[0]);
    expect(after).toContain('"slices": "auto"');
    expect(() => JSON.parse(after), after).not.toThrow();
  });

  it('负控：非枚举键的裸值位仍被压制（不因裸值位改造而泄漏键位档）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'dbq-body' as const } });
    expect(suggest('{"query": }', '{"query": }'.indexOf('}'))).toEqual([]);
  });

  it('负控：search 档同名字段不套结构化枚举表', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'search' as const } });
    expect(suggest('{"_source": "').map((i: any) => i.label)).not.toContain('true');
  });
});

describe('1439 词项向量体键位补全', () => {
  it('termvectors：根键十一项（接受即合法）；fields 值位给字段名；offsets 值位给布尔', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'termvectors-body' as const } });
    const root = suggest('{"');
    expect(root.map((i: any) => i.label)).toEqual([
      'fields', 'doc', 'filter', 'offsets', 'positions', 'term_statistics', 'field_statistics',
      'per_field_analyzer', 'routing', 'version', 'version_type',
    ]);
    for (const i of root) {
      expect(() => JSON.parse(acceptSnippet('{', i) + '}'), i.label + ' 接受后非法').not.toThrow();
    }
    expect(suggest('{"fields": ["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    const en = suggest('{"offsets": "');
    expect(en.map((i: any) => i.label)).toEqual(['false', 'true']);
    const after = acceptSnippet('{"offsets": "', en[0]);
    expect(after).toContain('"offsets": false');
    expect(() => JSON.parse(after + '}')).not.toThrow();
  });

  it('mtermvectors：根 docs/ids；元素给 _index/_id + 配置键；ids 数组与深层不出键', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'mtermvectors-body' as const } });
    expect(suggest('{"').map((i: any) => i.label)).toEqual(['docs', 'ids']);
    const el = suggest('{"docs": [{"').map((i: any) => i.label);
    expect(el.slice(0, 2)).toEqual(['_index', '_id']);
    expect(el).toContain('term_statistics');
    expect(suggest('{"ids": ["')).toEqual([]);
    expect(suggest('{"docs": [{"doc": {"')).toEqual([]);
  });
});

describe('1439 mapping 值通道扩展到建索引体/模板', () => {
  it('index-body 的 mappings 区：type 值目录 + analyzer 实名', () => {
    mountEditor({
      modelValue: '{}',
      dslAssist: { fields: () => FIELDS, bodyKind: () => 'index-body' as const, analyzers: () => ['my_analyzer'] },
    });
    expect(suggest('{"mappings": {"properties": {"a": {"type": "').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['keyword', 'text']));
    expect(suggest('{"mappings": {"properties": {"a": {"analyzer": "').map((i: any) => i.label))
      .toContain('my_analyzer');
  });

  it('template 的 mappings 区同口径给 type 目录', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'template' as const } });
    expect(suggest('{"template": {"mappings": {"properties": {"a": {"type": "').map((i: any) => i.label))
      .toEqual(expect.arrayContaining(['keyword', 'text']));
  });

  it('负控：index-body settings 区不出 type 目录/analyzer 实名', () => {
    mountEditor({
      modelValue: '{}',
      dslAssist: { fields: () => FIELDS, bodyKind: () => 'index-body' as const, analyzers: () => ['my_analyzer'] },
    });
    expect(suggest('{"settings": {"index": {"analyzer": "')).toEqual([]);
    expect(suggest('{"settings": {"x": {"type": "').map((i: any) => i.label)).not.toContain('keyword');
  });
});

describe('1439 _reindex 查询回落 / 脚本键', () => {
  it('source.query 内回落整棵查询补全；根层 script 给脚本键；sort 元素仍压制', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'reindex-body' as const } });
    expect(suggest('{"source": {"query": {"').map((i: any) => i.label)).toContain('match');
    expect(suggest('{"source": {"query": {"bool": {"').map((i: any) => i.label)).toContain('must');
    expect(suggest('{"script": {"').map((i: any) => i.label)).toEqual(['source', 'lang', 'params', 'id']);
    expect(suggest('{"script": {"params": {"')).toEqual([]);
    expect(suggest('{"source": {"sort": [{')).toEqual([]);
    expect(suggest('{"').map((i: any) => i.label)).toContain('source');
    /* 1439：source.sort / source._source 的串元素位给字段名 */
    expect(suggest('{"source": {"sort": ["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    expect(suggest('{"source": {"_source": ["').map((i: any) => i.label)).toEqual(expect.arrayContaining(['title', 'price']));
    const sf = suggest('{"source": {"sort": ["');
    const afterSort = acceptSnippet('{"source": {"sort": ["', sf.find((i: any) => i.label === 'title'));
    expect(() => JSON.parse(afterSort + ']}}')).not.toThrow();
  });
});
