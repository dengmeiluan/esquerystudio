/**
 * 五百四十批 W1（轨1 全站智能提示与高亮）：DSL 字段位排序收口 + 值位类型档（date-math/ip）看守。
 *
 *  A 排序函数收口（任务1）：MonacoEditor 本地 orderFieldsByType 与 dslCompletionContext
 *    orderFieldsByClauseOp 逐行 diff 语义**有差**（亲和族展开维度）——本地直消费
 *    typePriorityForOp 原始序（term 位 type='wildcard' 不命中、range 位 date_nanos 不命中），
 *    共享版走 dslFieldAffinityTypes 族展开（wildcard/constant_keyword/annotated_text/date_nanos 命中）。
 *    按裁走「原样平移」：本地逻辑逐字节等值移入 dslCompletionContext 导出 orderFieldsByTypeForOp
 *    （命名与族展开版区分），MonacoEditor 改 import 删本地；dslFieldPrio538 锁（族展开版）零触碰。
 *  B 值位类型档（任务2）：非白名单值串位按字段类型放行静态候选——date 字段→date-math
 *    （now-1d/d、now-1h/h，sqlCompletion.VAL_FORMAT_HINTS date 档同值平移）、ip 字段→点分形态
 *    （192.168.0.1，LuceneInput 538 批 IP_HINTS 先例）。候选只增不改：既有 root/query-type/field/
 *    值位白名单三档与排序契约零变动；表外类型（text/keyword/boolean/数值族）维持既有压制。
 *  C 值位字段解析纯函数 dslValueFieldAt：叶子子句直挂值位→字段=当前键；range 操作符值位
 *    （限 gte/gt/lt/lte 四键，time_zone/format 等元键不出档）→字段=上层键。
 *
 * MonacoEditor 行为断言走 monaco stub 挂载（monacoDslAssist 同范式）；纯函数/源锚静态断言不挂 Monaco。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dslValueFieldAt, DSL_VALUE_TYPE_HINTS, orderFieldsByTypeForOp, orderFieldsByClauseOp, ROOT_KEYS } from '../utils/dslCompletionContext';

/* ---------- 源锚（收口与档位接线形态） ---------- */
const SRC = join(__dirname, '..');
const monacoSrc = readFileSync(join(SRC, 'components/MonacoEditor.vue'), 'utf-8');
const dccSrc = readFileSync(join(SRC, 'utils/dslCompletionContext.ts'), 'utf-8');

describe('A 排序函数收口：本地 orderFieldsByType → dslCompletionContext.orderFieldsByTypeForOp', () => {
  it('源锚：MonacoEditor 本地函数退役、消费共享导出；queryAstOps 直连 import 同步更新出', () => {
    expect(monacoSrc).not.toContain('function orderFieldsByType(');
    expect(monacoSrc).toContain('orderFieldsByTypeForOp(props.dslAssist!.fields(), ctx.clause)');
    expect(monacoSrc).not.toContain("from '../utils/queryAstOps'");
    expect(dccSrc).toContain('export function orderFieldsByTypeForOp');
  });

  const FIELDS = [
    { path: 'title', type: 'text' },
    { path: 'status', type: 'keyword' },
    { path: 'cnt', type: 'long' },
    { path: 'created', type: 'date' },
    { path: 'flag', type: 'boolean' },
    { path: 'host', type: 'ip' },
  ];
  const paths = (fs: { path: string }[]) => fs.map(f => f.path);

  it('原始序语义：range 位 date 置顶、数值族次之，其余垫底保原序（与平移前逐字节等值）', () => {
    expect(paths(orderFieldsByTypeForOp(FIELDS, 'range'))).toEqual([
      'created', 'cnt', 'title', 'status', 'flag', 'host',
    ]);
  });

  it('原始序语义：term 位仅 keyword 本名命中（text 让位）；候选集不变', () => {
    const out = paths(orderFieldsByTypeForOp(FIELDS, 'term'));
    expect(out[0]).toBe('status');
    expect(out.slice(1)).toEqual(['title', 'cnt', 'created', 'flag', 'host']);
    expect([...out].sort()).toEqual(paths(FIELDS).sort());
  });

  it('未知算子/无倾向算子 → 原序直通；同档稳定（map-index 稳定排序）', () => {
    expect(paths(orderFieldsByTypeForOp(FIELDS, 'exists'))).toEqual(paths(FIELDS));
    expect(paths(orderFieldsByTypeForOp(FIELDS, 'no_such_op'))).toEqual(paths(FIELDS));
  });

  it('与 orderFieldsByClauseOp 语义分界（两函数并存的理由，防"顺手合并"回潮）', () => {
    /* term 位：原始序只命中 keyword 本名（text 与 wildcard 同坠未命中档保原序）；
       族展开后 wildcard 挤到 text 前（keyword 族第二位） */
    const twk = [{ path: 't', type: 'text' }, { path: 'w', type: 'wildcard' }, { path: 'k', type: 'keyword' }];
    expect(paths(orderFieldsByTypeForOp(twk, 'term'))).toEqual(['k', 't', 'w']);
    expect(paths(orderFieldsByClauseOp(twk, 'term'))).toEqual(['k', 'w', 't']);
    /* 548 锁同步更新：range 位 date_nanos——原始序已直出 date_nanos（548 B 约定，紧跟 date），
       两序在此样例上收敛（族展开 date_nanos 排 long 前的既有结论不变）；
       原始序/族展开的语义分界仍由上方 term 位 wildcard 样例承担 */
    const dn = [{ path: 'n', type: 'date_nanos' }, { path: 'c', type: 'long' }];
    expect(paths(orderFieldsByTypeForOp(dn, 'range'))).toEqual(['n', 'c']);
    expect(paths(orderFieldsByClauseOp(dn, 'range'))).toEqual(['n', 'c']);
  });
});

/* ---------- 值位类型档静态表与解析纯函数 ---------- */
describe('B 值位类型档静态表（DSL_VALUE_TYPE_HINTS）与值位字段解析（dslValueFieldAt）', () => {
  it('date/ip 两档：值与语义平移出处同值（sqlCompletion date 档 / LuceneInput IP_HINTS）', () => {
    expect(DSL_VALUE_TYPE_HINTS.date).toEqual({ detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] });
    expect(DSL_VALUE_TYPE_HINTS.ip).toEqual({ detail: '字面提示 · ip', values: ['192.168.0.1'] });
  });

  it('分档边界：表外类型不入表（候选只增 date/ip 两档，其余维持压制）', () => {
    /* 558 批同步更新注记：date_nanos 移出本负锁——558 合并 date_nanos/geo_point 两档入
       DSL_VALUE_TYPE_HINTS（540 regime 收窄后不再成立：姊妹面 sqlCompletion 546/547 批、
       LuceneInput 546/554 批已四批扩档，本表与 sqlCompletion/LuceneInput 对齐），
       geo_point 本就不在本清单。其余类型压制钉死保留。 */
    for (const t of ['text', 'keyword', 'boolean', 'long', 'integer', 'double', 'object']) {
      expect(DSL_VALUE_TYPE_HINTS[t], `类型 ${t} 不在档`).toBeUndefined();
    }
  });

  it('dslValueFieldAt：叶子子句直挂值位 → 字段=当前键', () => {
    expect(dslValueFieldAt('host', 'term', null)).toBe('host');
    expect(dslValueFieldAt('title', 'match', null)).toBe('title');
    expect(dslValueFieldAt('created', 'range', null)).toBe('created');
  });

  it('dslValueFieldAt：range 操作符值位 → 字段=上层键（限四操作符，元键不出）', () => {
    expect(dslValueFieldAt('gte', 'created', 'range')).toBe('created');
    expect(dslValueFieldAt('lt', 'host', 'range')).toBe('host');
    expect(dslValueFieldAt('time_zone', 'created', 'range')).toBeNull();
    expect(dslValueFieldAt('format', 'created', 'range')).toBeNull();
  });

  it('dslValueFieldAt：非字段值位（root 值/query-type 值/深层容器键）→ null 维持压制', () => {
    expect(dslValueFieldAt('query', null, null)).toBeNull();
    expect(dslValueFieldAt('match', 'query', null)).toBeNull();
    expect(dslValueFieldAt('must_not', 'bool', 'query')).toBeNull();
    /* aggs terms/date_histogram 与查询子句撞名：解析层只出「形态上的字段名」，
       是否真字段由消费侧 fields() 精确查表把关（本锚钉解析层行为） */
    expect(dslValueFieldAt('interval', 'terms', null)).toBe('interval');
  });
});

/* ---------- MonacoEditor 行为（monaco stub 同 monacoDslAssist 范式） ---------- */
type Reg = { lang: string; provider: any; disposed: boolean };

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
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } }; /* 只堵网络出口引用面，保 getTarget 等纯导出 */
});

import * as monacoStub from 'monaco-editor/esm/vs/editor/editor.api';
import MonacoEditor from '../components/MonacoEditor.vue';

const registrations = () => (monacoStub as any).__registrations as Reg[];
const Kind = (monacoStub as any).languages.CompletionItemKind;

const TYPED = [
  { path: 'title', type: 'text' },
  { path: 'price', type: 'long' },
  { path: 'created', type: 'date' },
  { path: 'host', type: 'ip' },
  { path: 'status', type: 'keyword' },
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

function suggest(doc: string, offset = doc.length): any[] {
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
  return reg.provider.provideCompletionItems(model, {}).suggestions;
}

/** {lineNumber,column} → offset（monacoDslAssist 同口径逆运算） */
function posToOffset(doc: string, lineNumber: number, column: number): number {
  let off = 0;
  for (let l = 1; l < lineNumber; l++) off = doc.indexOf('\n', off) + 1;
  return off + column - 1;
}
/** 模拟接受建议：range 区间替换为 insertText（值位档 insertText 自带引号，纯文本） */
function accept(doc: string, item: any): string {
  const s = posToOffset(doc, item.range.startLineNumber, item.range.startColumn);
  const e = posToOffset(doc, item.range.endLineNumber, item.range.endColumn);
  return doc.slice(0, s) + item.insertText + doc.slice(e);
}

beforeEach(() => {
  document.body.innerHTML = '';
  registrations().length = 0;
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('C MonacoEditor 值位类型档行为（按 type 分档断言）', () => {
  it('date 字段 range 操作符值位 → date-math 两候选（Value 档五字段钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    const doc = '{"query": {"range": {"created": {"gte": "';
    const items = suggest(doc);
    expect(items.map(i => i.label)).toEqual(['now-1d/d', 'now-1h/h']);
    for (const [idx, i] of items.entries()) {
      expect(i.kind).toBe(Kind.Value);
      expect(i.insertText).toBe('"' + i.label + '"');
      expect(i.detail).toBe('date-math 格式提示 · date');
      expect(i.filterText).toBe('"' + i.label);
      expect(i.sortText).toBe('!' + String(idx).padStart(3, '0') + i.label);
      expect(i.command?.id).toBe('editor.action.formatDocument');
    }
  });

  it('ip 字段 range/term 值位 → 点分 ip 形态候选（单候选）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    expect(suggest('{"query": {"range": {"host": {"lt": "').map(i => i.label)).toEqual(['192.168.0.1']);
    expect(suggest('{"query": {"term": {"host": "').map(i => i.label)).toEqual(['192.168.0.1']);
  });

  it('端到端：已敲半截值接受候选后整串干净替换、JSON 合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    const doc = '{"query": {"range": {"created": {"gte": "now" }}}}';
    const off = doc.indexOf('"now') + 4; /* "now" 串内、闭引号前 */
    const item = suggest(doc, off).find(i => i.label === 'now-1d/d');
    expect(item).toBeTruthy();
    const after = accept(doc, item);
    expect(after).toBe('{"query": {"range": {"created": {"gte": "now-1d/d" }}}}');
    expect(() => JSON.parse(after)).not.toThrow();
    expect(JSON.parse(after).query.range.created.gte).toBe('now-1d/d');
  });

  it('表外类型维持既有压制：text 值串 / 数值 range 值 / keyword 值 / range 元键 / terms 数组元素位', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    expect(suggest('{"query": {"match": {"title": "he')).toEqual([]);
    expect(suggest('{"query": {"range": {"price": {"lt": "')).toEqual([]);
    expect(suggest('{"query": {"term": {"status": "ac')).toEqual([]);
    expect(suggest('{"query": {"range": {"created": {"time_zone": "')).toEqual([]);
    expect(suggest('{"query": {"terms": {"host": ["19')).toEqual([]);
  });

  it('候选只增不改：root 档 / 值位白名单（order）/ field 档类型感知序零变动', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    expect(suggest('{"').map(i => i.label)).toEqual(ROOT_KEYS);
    const orderDoc = '{"sort": [{ "date": { "order": "d" } }] }';
    expect(suggest(orderDoc, orderDoc.indexOf('"d"') + 2).map(i => i.label)).toEqual(['asc', 'desc']);
    /* field 档（收口后仍原始序）：match 位 text 置顶、keyword 次之，其余保 fields() 序 */
    expect(suggest('{"query": {"match": {"').map(i => i.label))
      .toEqual(['title', 'status', 'price', 'created', 'host']);
    /* range 位 date 置顶、数值次之 */
    expect(suggest('{"query": {"range": {"').map(i => i.label))
      .toEqual(['created', 'price', 'title', 'host', 'status']);
  });
});
