/**
 * 五百二十四批 W6：Monaco 智能层三深化。
 * ① BodyKind 'doc' 档：bodyKindForPath 三端点（/_doc/、/_create/、/_source）归 doc、
 *    _update 1439 起单列 update-body（结构化体）；_update_by_query 仍 search（分支顺序安全钉）；
 *    doc 档分派语义——键位零候选、
 *    field 值位白名单出字段候选（Value kind + W5-1 filterText/sortText 双关）；
 *    DiffEditorView（dfEditedAssist）/IndexHubView（docEdit）消费迁移源码锁。
 * ② painless 语言 assist：dslAssist 在档时 painless 补全 +1、hover +1（签名互不串档——
 *    json/ndjson 的 dslRegs 恒 2 既有契约不回归、hoverRegs 由 monacoDslAssist.spec 同步更新 2→3）；
 *    四骨架 snippet（ctx['字段']='值' / doc['字段'].value / params.x / emit）；
 *    painlessFieldAt 纯函数（脱离 Monaco 可断言）；painless hover doc['f']/ctx['f'] → 「type · path」
 *    （fields() 闭包内惰性现调，注册期零预载——519 fieldPickerPenetration 计数契约）。
 * ③ JsonArea setMarkers 透传（真实 JsonArea + 真实 MonacoEditor，editor.api mock 带模型能力）；
 *    SearchSandboxView lint 全档展示（error 红条并列）/划线注入/IndexPicker 合并源码锁。
 *
 * stub 范式照抄 monacoDslAssist.spec（Monaco 在 happy-dom 必炸——editor.api 全 mock，
 * 直接调捕获的 provider 断言 suggestions/hover；纯函数走直接 import）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Reg = { lang: string; provider: any; disposed: boolean; kind: 'completion' | 'hover' };

/* monaco editor.api stub——注册按 kind 捕获 + editor 面可注 model/marker spy（JsonArea 透传链路用） */
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
    MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
  };
});

/* contrib/worker 全空 mock——斩断真实 monaco 导入链（同 monacoDslAssist.spec） */
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
import JsonArea from '../components/JsonArea.vue';
import { bodyKindForPath, painlessFieldAt } from '../utils/dslCompletionContext';

const registrations = () => (monacoStub as any).__registrations as Reg[];
const completionRegs = (lang?: string) => registrations().filter(r => r.kind === 'completion' && (!lang || r.lang === lang));
const hoverRegs = (lang?: string) => registrations().filter(r => r.kind === 'hover' && (!lang || r.lang === lang));
/* json+ndjson 的 dslAssist 签名注册（恰 ['"']）——524 批前后恒 2 的既有契约 */
const jsonNdjsonRegs = () => registrations().filter(r => r.kind === 'completion' && (r.lang === 'json' || r.lang === 'ndjson'));

const Kind = (monacoStub as any).languages.CompletionItemKind;
const Rule = (monacoStub as any).languages.CompletionItemInsertTextRule;

/** offset → {lineNumber,column}（同真实 getPositionAt 口径） */
function offsetToPos(doc: string, off: number) {
  let line = 1, last = -1;
  for (let i = 0; i < off; i++) if (doc[i] === '\n') { line++; last = i; }
  return { lineNumber: line, column: off - last };
}
function posToOffset(doc: string, p: { lineNumber: number; column: number }) {
  let off = 0;
  for (let l = 1; l < p.lineNumber; l++) off = doc.indexOf('\n', off) + 1;
  return off + p.column - 1;
}
function rangeOffsets(doc: string, range: any): [number, number] {
  return [
    posToOffset(doc, { lineNumber: range.startLineNumber, column: range.startColumn }),
    posToOffset(doc, { lineNumber: range.endLineNumber, column: range.endColumn }),
  ];
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

function mountArea(props: Record<string, any>, onRef?: (v: any) => void) {
  const app = createApp({ render: () => h(JsonArea as any, { ...props, ref: onRef }) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, host };
}

/** 直接调用 json 补全 provider（doc 档断言用；光标默认文末） */
function suggest(doc: string, offset = doc.length): any[] {
  const reg = completionRegs('json')[0];
  expect(reg, 'json dslAssist provider 应已注册').toBeTruthy();
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
  (monacoStub as any).__setCurrentModel(null);
  (monacoStub as any).__markerCalls.length = 0;
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('524 ① BodyKind doc 档', () => {
  it('bodyKindForPath：四端点形态归 doc（含 query string 容错与 _source 双保险）', () => {
    expect(bodyKindForPath('/{index}/_doc/1')).toBe('doc');
    expect(bodyKindForPath('/alarm_record-20260524/_doc/abc-123')).toBe('doc');
    expect(bodyKindForPath('/{index}/_create/1')).toBe('doc');
    /* 1439 迁移：_update 体是 {doc/upsert/script…} 的结构化体，单列 update-body 档（不再当裸文档） */
    expect(bodyKindForPath('/{index}/_update/1')).toBe('update-body');
    expect(bodyKindForPath('/{index}/_source/1')).toBe('doc');
    expect(bodyKindForPath('/{index}/_doc/1/_source')).toBe('doc');
    expect(bodyKindForPath('/{index}/_DOC/1?pretty')).toBe('doc');
  });

  it('分支顺序安全钉：_update_by_query/_delete_by_query 不落 update-body/doc（1439 起各有专档）', () => {
    expect(bodyKindForPath('/{index}/_update_by_query')).toBe('ubq-body');
    expect(bodyKindForPath('/{index}/_delete_by_query')).toBe('dbq-body');
    expect(bodyKindForPath('/{index}/_bulk')).toBe('bulk-body');
    expect(bodyKindForPath('/my-index')).toBe('search');
  });

  it('doc 档键位零候选：root 裸词位 / 串内键位一律 []', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'doc' } });
    expect(suggest('{"'), 'root 裸词位不出 ROOT_KEYS').toEqual([]);
    expect(suggest('{\n  "\n}', 5), '串内键位不出档').toEqual([]);
  });

  it('doc 档非白名单值位压住（title 值串不出档）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'doc' } });
    expect(suggest('{"title": "he')).toEqual([]);
  });

  it('doc 档 field 值位白名单：出字段候选（Value kind + 整串 range + W5-1 双关），接受后 JSON 合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => FIELDS, bodyKind: () => 'doc' } });
    const doc = '{"field": "pr';
    const items = suggest(doc);
    expect(items.map((i: any) => i.label)).toEqual(['title', 'price']);
    for (const [idx, i] of items.entries()) {
      expect(i.kind, '值位候选走 Value 同口径').toBe(Kind.Value);
      expect(i.insertText).toBe('"' + FIELDS[idx].path + '"');
      expect(i.filterText, 'W5-1 过滤关：pattern \'"\' 可匹配').toBe('"' + i.label);
      expect(i.sortText, 'W5-1 排序关：\'!\' 前缀升权').toMatch(/^!\d{3}/);
      expect(i.command?.id).toBe('editor.action.formatDocument');
    }
    /* range 覆盖整串（I-1 同形态：起=串起始引号，止=光标），接受后整串干净替换
       （doc 残缺无闭 }，手工补齐后须为合法 JSON——值位替换只动本串） */
    const p = items.find((i: any) => i.label === 'price');
    expect(rangeOffsets(doc, p.range)).toEqual([doc.indexOf('"pr'), doc.length]);
    const after = doc.slice(0, doc.indexOf('"pr')) + p.insertText + '}';
    expect(() => JSON.parse(after), after).not.toThrow();
    expect(JSON.parse(after).field).toBe('price');
  });

  it('DiffEditorView 迁移源码锁：dfEditedAssist bodyKind \'doc\'（\'search\' as const 冒充不回潮）', () => {
    const v = readFileSync(join(__dirname, '../views/DiffEditorView.vue'), 'utf-8');
    expect(v).toContain("const dfEditedAssist = { fields: () => dfIdxFields.value, bodyKind: () => 'doc' as const };");
    expect(v).not.toContain("bodyKind: () => 'search' as const");
  });

  it('IndexHubView 迁移源码锁：docEdit bodyKind \'doc\'（\'none\' 过渡态不回潮；525 批 rows=14 定高改 fill 视口档同步更新）', () => {
    const v = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
    expect(v).toContain('<JsonArea v-model="docEditText" fill :dsl-assist="{ fields: ihDslAssist.fields, bodyKind: () => \'doc\' }" />');
    expect(v).not.toContain("bodyKind: () => 'none'");
  });
});

describe('524 ② painless 语言 assist', () => {
  it('注册计数：dslAssist 在档 → painless 补全+hover 各恰 1；json+ndjson dslAssist 恒 2 不回归；卸载全 dispose', () => {
    const { app } = mountEditor({ modelValue: '', dslAssist: { fields: () => FIELDS } });
    expect(completionRegs('painless').length, 'painless 补全恰 1 份').toBe(1);
    expect(hoverRegs('painless').length, 'painless hover 恰 1 份').toBe(1);
    expect(jsonNdjsonRegs().length, 'json+ndjson 补全恒 2（既有契约不回归）').toBe(2);
    expect(completionRegs('painless')[0].provider.triggerCharacters).toEqual(['[', '.']);
    app.unmount();
    expect(completionRegs('painless')[0].disposed, 'painless 补全随卸载 dispose').toBe(true);
    expect(hoverRegs('painless')[0].disposed, 'painless hover 随卸载 dispose').toBe(true);
    expect(jsonNdjsonRegs().every(r => r.disposed), 'json+ndjson 随卸载全量 dispose').toBe(true);
  });

  it('dslAssist 缺席：painless 零注册（零影响回归）', () => {
    mountEditor({ modelValue: '', language: 'painless' });
    expect(completionRegs('painless').length).toBe(0);
    expect(hoverRegs('painless').length).toBe(0);
    expect(registrations().length).toBe(0);
  });

  it('四骨架 snippet：label/insertText 快照 + InsertAsSnippet 规则', () => {
    mountEditor({ modelValue: '', dslAssist: { fields: () => FIELDS } });
    const reg = completionRegs('painless')[0];
    const model = {
      getValue: () => "doc['price'].value",
      getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 }),
    };
    const s = reg.provider.provideCompletionItems(model, { lineNumber: 1, column: 1 }).suggestions;
    expect(s.map((i: any) => i.label)).toEqual([
      "ctx['字段']='值'", "doc['字段'].value", 'params.x', 'emit(值)',
    ]);
    for (const i of s) {
      expect(i.kind).toBe(Kind.Snippet);
      expect(i.insertTextRules).toBe(Rule.InsertAsSnippet);
      expect(i.detail, i.label + ' 带一句话说明').toBeTruthy();
    }
    expect(s[0].insertText).toBe("ctx['${1:field}'] = '${2:value}'");
    expect(s[1].insertText).toBe("doc['${1:field}'].value");
    expect(s[2].insertText).toBe('params.${2:name}');
    expect(s[3].insertText).toBe('emit(${1:value})');
  });

  it('painlessFieldAt 纯函数：doc/ctx 单引号字段串内光标（含贴闭引号）出 f，其余 null', () => {
    const doc = "doc['price'].value";
    expect(painlessFieldAt(doc, doc.indexOf('price') + 2)).toBe('price');
    expect(painlessFieldAt(doc, doc.indexOf('price'))).toBe('price');            /* 首字符位 */
    expect(painlessFieldAt(doc, doc.indexOf("'price'") + 6)).toBe('price');      /* 贴闭引号 */
    const doc2 = "return ctx['status'] == params.s";
    expect(painlessFieldAt(doc2, doc2.indexOf('status') + 1)).toBe('status');
    /* 负例：params 点引、doc[ 光标在引号前、双引号串、前缀不合、] 后普通位、无引号串 */
    expect(painlessFieldAt(doc2, doc2.indexOf('params.s') + 2)).toBeNull();
    expect(painlessFieldAt("doc['f']", 4)).toBeNull();                            /* 开引号位（cursor<=start） */
    expect(painlessFieldAt('doc["f"]', 6)).toBeNull();                            /* 双引号断点 */
    expect(painlessFieldAt("m['f']", 3)).toBeNull();                              /* 前缀非 doc/ctx */
    expect(painlessFieldAt("doc['price'].value", 14)).toBeNull();                 /* ] 后普通位：左扫遇 ] 断 */
    expect(painlessFieldAt('params.a + 1', 5)).toBeNull();                        /* 无引号串 */
    expect(painlessFieldAt('', 0)).toBeNull();
  });

  it('painless hover：doc/ctx 单引号字段串命中 fields 出「type · path」，空表/未命中/非字段串静默 null', () => {
    mountEditor({ modelValue: '', dslAssist: { fields: () => FIELDS } });
    const reg = hoverRegs('painless')[0];
    const doc = "doc['title'].value";
    const hit = reg.provider.provideHover(
      { getValue: () => doc, getOffsetAt: () => doc.indexOf('title') + 1 }, {});
    expect(hit, '命中字段必须出 hover').toBeTruthy();
    expect(hit.contents[0].value).toBe('text · title');
    const doc2 = "ctx['price'] != null";
    expect(reg.provider.provideHover(
      { getValue: () => doc2, getOffsetAt: () => doc2.indexOf('price') + 1 }, {})!.contents[0].value)
      .toBe('long · price');
    /* fields() 空表静默（惰性 ensure 场景不弹空壳）；未命中字段静默；非 doc/ctx 串静默 */
    let list: { path: string; type: string }[] = [];
    const painlessUndisposed = hoverRegs('painless').filter(r => !r.disposed).length;
    mountEditor({ modelValue: '', dslAssist: { fields: () => list } });
    const reg2 = hoverRegs('painless').filter(r => !r.disposed)[painlessUndisposed];
    expect(reg2.provider.provideHover(
      { getValue: () => doc, getOffsetAt: () => doc.indexOf('title') + 1 }, {}), '空 fields 静默').toBeNull();
    list = FIELDS;
    const ghost = "doc['ghost'].value";
    expect(reg2.provider.provideHover(
      { getValue: () => ghost, getOffsetAt: () => ghost.indexOf('ghost') + 1 }, {}), '未命中静默').toBeNull();
    expect(reg2.provider.provideHover(
      { getValue: () => 'params.a', getOffsetAt: () => 8 }, {}), '非字段串静默').toBeNull();
  });
});

describe('524 ③ JsonArea setMarkers 透传 + SearchSandboxView lint 全档', () => {
  it('JsonArea.setMarkers 透传 MonacoEditor.setMarkers（定位不到降级 unplaced 全量退回）', async () => {
    let jaExposed: any = null;
    mountArea({ modelValue: '{"price": 1}', rows: 4 }, (v) => { jaExposed = v; });
    await nextTick();
    expect(typeof jaExposed?.setMarkers, 'setMarkers 必须在 expose 面（与 focus 并列）').toBe('function');
    expect(typeof jaExposed?.focus).toBe('function');
    /* 定位不到（model 无内容）：placed=0、unplaced 原样退回（DslQueryView 同契约——不静默丢） */
    const findings = [{ message: 'm', suggestion: 's', severity: 'error' as const, anchor: 'price', nth: 0 }];
    const r = jaExposed.setMarkers(findings);
    expect(r).toEqual({ placed: 0, unplaced: findings });
  });

  it('JsonArea.setMarkers 定位命中：marker 注入 model（owner=es-dsl-lint，error 档 severity 映射）', async () => {
    let jaExposed: any = null;
    mountArea({ modelValue: '{"price": 1}', rows: 4 }, (v) => { jaExposed = v; });
    await nextTick();
    (monacoStub as any).__setCurrentModel({
      findMatches: (needle: string) => (needle === '"price"'
        ? [{ range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 9 } }]
        : []),
    });
    const r = jaExposed.setMarkers([{ message: 'terms 收到标量', suggestion: '改数组', severity: 'error', anchor: 'price', nth: 0 }]);
    expect(r!.placed).toBe(1);
    const calls = (monacoStub as any).__markerCalls as { owner: string; markers: any[] }[];
    expect(calls.length).toBe(1);
    expect(calls[0].owner).toBe('es-dsl-lint');
    expect(calls[0].markers[0].severity, 'error → MarkerSeverity.Error（stub 符号值 8）').toBe(8);
    expect(calls[0].markers[0].message).toContain('terms 收到标量');
    expect(calls[0].markers[0].startLineNumber).toBe(1);
  });

  it('SearchSandboxView 源码锁：lint 全档展示（error 红条并列）+ setMarkers 划线注入 + 页内选择器退役换 CurrentIdxChip', () => {
    const v = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');
    /* error 红条并列展示（terms-scalar 等 error 档不再被吞）+ warning/hint/info 黄条 */
    expect(v).toContain('v-if="lintErrors.length"');
    /* 五百六十一批同步更新：ss-lint 族改用 theme.css .lint-bar 单源 */
    expect(v).toMatch(/lintErrors\.length[\s\S]{0,200}lint-bar-err/);
    expect(v).toContain('v-if="lintWarns.length"');
    expect(v).toContain("f.severity === 'error'");
    /* 旧单筛 warning 的 computed 退役（注释提及旧名不算回潮，锁声明形态本身） */
    expect(v).not.toMatch(/const warnFindings/);
    expect(v).not.toContain("lintDsl(o, { fields: ssFields.value }).filter(f => f.severity === 'warning')");
    /* setMarkers 注入编辑器划线（DslQueryView debounce 范式 + info→hint 降级） */
    expect(v).toContain('ref="ssJaRef"');
    expect(v).toContain('ssJaRef.value?.setMarkers?.(');
    expect(v).toContain("f.severity === 'info' ? 'hint' as const : f.severity");
    /* 五百二十五批反转：页内不再有可写索引选择器——IndexPicker 退役换只读 CurrentIdxChip
       （「选索引」唯一可写入口收敛顶栏）；留空=全集群语义保留（chip 只在选中时渲染，
       indexName 空串照旧走 _all），裸 n-select 退役锁继续看守 */
    expect(v).toContain('<CurrentIdxChip />');
    expect(v).not.toContain('<IndexPicker');
    expect(v).not.toContain('<n-select');
    expect(v).not.toMatch(/import \{ NSelect/);
  });
});
