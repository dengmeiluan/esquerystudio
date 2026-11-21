/**
 * 五百四十三批 W1：DSL 值位形态档（keyword/数值/boolean）+ terms 数组续元素位候选解锁。
 *
 *  A 形态档落姊妹表 DSL_ARRAY_ELEM_TYPE_HINTS（keyword 含 wildcard 通配形态 pref*、数值族八类型
 *    字面数字整 1/浮 1.5、boolean true/false；detail 与 date/ip 档同形 '字面提示 · <type>'）。
 *    **有意不扩共享表 DSL_VALUE_TYPE_HINTS**：dslValueTiers540 B 段把表内容钉死 date/ip 两档
 *    （keyword/boolean/long/integer/double toBeUndefined 断言）、C 段把 term/keyword 与 range/数值
 *    值位压制钉死，且 540 备案「date-math·ip 外值形态（产品裁决）」——':' 值位 regime 冻结；
 *    黑名单外不可改 540，故形态档仅数组元素位链路消费（先查共享表再查姊妹表）。
 *  B 数组元素位字段解析姊妹纯函数 dslArrayElemFieldAt：值数组的元素串位没有「当前键」，
 *    字段=数组属主键（"terms": { "<field>": [ "x", "<光标" ）→ ownerKey ∈ 叶子子句才出字段；
 *    must/ids/_source/sort 等非字段值数组 → null 维持压制。dslValueFieldAt 本体零改动。
 *  C MonacoEditor 行为：terms 值数组续元素位（["x", "<光标）出类型档候选——该位现状是错档
 *    （query-type 的 QUERY_SNIPPETS 落进值数组），归位；首元素位（["<光标）是 540 契约 spec
 *    既有断言钉死的压制面（dslValueTiers540 黑名单外不可改），不在解锁面。
 *
 * MonacoEditor 行为断言走 monaco stub 挂载（dslValueTiers540 同范式）；纯函数/源锚静态断言不挂 Monaco。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DSL_VALUE_TYPE_HINTS, DSL_ARRAY_ELEM_TYPE_HINTS, dslValueFieldAt, dslArrayElemFieldAt, ROOT_KEYS } from '../utils/dslCompletionContext';

/* ---------- 源锚（数组元素位接线形态） ---------- */
const SRC = join(__dirname, '..');
const monacoSrc = readFileSync(join(SRC, 'components/MonacoEditor.vue'), 'utf-8');
const dccSrc = readFileSync(join(SRC, 'utils/dslCompletionContext.ts'), 'utf-8');

describe('源锚：数组续元素位键链口 + 消费侧姊妹解析分派', () => {
  it('guard 回传 arrayElem 标记；消费侧分派且既有值位链路调用式逐字节保留', () => {
    expect(monacoSrc).toContain('arrayElem: true');
    expect(monacoSrc).toContain('dslArrayElemFieldAt(guard.valueKey');
    /* 姊妹表仅在数组元素位路径并入：':' 值位不查姊妹表（540 压制 regime 冻结） */
    expect(monacoSrc).toContain('DSL_VALUE_TYPE_HINTS[fld.type] ?? DSL_ARRAY_ELEM_TYPE_HINTS[fld.type]');
    /* 既有非数组值位路径逐字节不变：dslValueFieldAt 三参调用式原样 */
    expect(monacoSrc).toContain('dslValueFieldAt(guard.valueKey, guard.parentKey ?? null, guard.grandKey ?? null)');
    expect(dccSrc).toContain('export function dslArrayElemFieldAt');
    expect(dccSrc).toContain('export const DSL_ARRAY_ELEM_TYPE_HINTS');
  });
});

/* ---------- 值位形态档（姊妹表；共享表钉死不动） ---------- */
describe('A 值位形态档（DSL_ARRAY_ELEM_TYPE_HINTS 姊妹表）', () => {
  it('共享表 DSL_VALUE_TYPE_HINTS 钉 date/ip 两档（540 B 段契约，558 批后为子集）', () => {
    /* 558 批同步更新注记：date_nanos 移出本负锁（本锁是 540 B 段的同源衍生钉）——558 批
       合并 date_nanos/geo_point 两档入共享表，与 sqlCompletion/LuceneInput 姊妹面对齐
       （540 regime 收窄后不再成立，dslValueTiers540 同批注记修订）；date/ip 档内容
       逐字不变，其余类型压制钉死保留。 */
    expect(DSL_VALUE_TYPE_HINTS.date).toEqual({ detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] });
    expect(DSL_VALUE_TYPE_HINTS.ip).toEqual({ detail: '字面提示 · ip', values: ['192.168.0.1'] });
    for (const t of ['text', 'keyword', 'boolean', 'long', 'integer', 'double', 'object']) {
      expect(DSL_VALUE_TYPE_HINTS[t], `类型 ${t} 不入共享表（540 钉死）`).toBeUndefined();
    }
  });

  it('keyword 族两档：通配形态提示 pref*（wildcard 语义）', () => {
    expect(DSL_ARRAY_ELEM_TYPE_HINTS.keyword).toEqual({ detail: '字面提示 · keyword', values: ['pref*'] });
    expect(DSL_ARRAY_ELEM_TYPE_HINTS.wildcard).toEqual({ detail: '字面提示 · wildcard', values: ['pref*'] });
  });

  it('数值族八档：字面数字形态（整型字面 1 / 浮点字面 1.5）', () => {
    for (const t of ['long', 'integer', 'short', 'byte']) {
      expect(DSL_ARRAY_ELEM_TYPE_HINTS[t]).toEqual({ detail: '字面提示 · ' + t, values: ['1'] });
    }
    for (const t of ['double', 'float', 'half_float', 'scaled_float']) {
      expect(DSL_ARRAY_ELEM_TYPE_HINTS[t]).toEqual({ detail: '字面提示 · ' + t, values: ['1.5'] });
    }
  });

  it('boolean 档：true/false 形态提示', () => {
    expect(DSL_ARRAY_ELEM_TYPE_HINTS.boolean).toEqual({ detail: '字面提示 · boolean', values: ['true', 'false'] });
  });

  it('分档边界：姊妹表表外类型不入表（含亲和族第九种 unsigned_long——点名八类型）', () => {
    for (const t of ['text', 'annotated_text', 'date_nanos', 'unsigned_long', 'constant_keyword', 'object', 'alias']) {
      expect(DSL_ARRAY_ELEM_TYPE_HINTS[t], `类型 ${t} 不在档`).toBeUndefined();
    }
  });
});

/* ---------- 数组元素位字段解析（姊妹纯函数） ---------- */
describe('B 数组元素位字段解析（dslArrayElemFieldAt）', () => {
  it('terms 值数组元素位：字段=数组属主键（elemKey）', () => {
    expect(dslArrayElemFieldAt('host', 'terms')).toBe('host');
    expect(dslArrayElemFieldAt('status', 'terms')).toBe('status');
  });

  it('非字段值数组 → null 维持压制（bool 容器/query 根/根键/无名）', () => {
    expect(dslArrayElemFieldAt('must', 'bool')).toBeNull();
    expect(dslArrayElemFieldAt('ids', 'query')).toBeNull();
    expect(dslArrayElemFieldAt('_source', null)).toBeNull();
    expect(dslArrayElemFieldAt(null, 'terms')).toBeNull();
    expect(dslArrayElemFieldAt('host', null)).toBeNull();
  });

  it('与 dslValueFieldAt 语义分界：值位解析本体零改动（540 B 段断言抽查复钉）', () => {
    expect(dslValueFieldAt('host', 'term', null)).toBe('host');
    expect(dslValueFieldAt('created', 'range', null)).toBe('created');
    expect(dslValueFieldAt('time_zone', 'created', 'range')).toBeNull();
    expect(dslValueFieldAt('interval', 'terms', null)).toBe('interval');
  });
});

/* ---------- MonacoEditor 行为（monaco stub 同 dslValueTiers540 范式） ---------- */
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
  { path: 'ok', type: 'boolean' },
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

/** {lineNumber,column} → offset（dslValueTiers540 同口径逆运算） */
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

describe('C MonacoEditor terms 数组续元素位行为', () => {
  it('ip 字段续元素位 → 点分形态单候选（item 五字段钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    const items = suggest('{"query": {"terms": {"host": ["192.168.0.0", "');
    expect(items.map(i => i.label)).toEqual(['192.168.0.1']);
    for (const [idx, i] of items.entries()) {
      expect(i.kind).toBe(Kind.Value);
      expect(i.insertText).toBe('"192.168.0.1"');
      expect(i.detail).toBe('字面提示 · ip');
      expect(i.filterText).toBe('"192.168.0.1');
      expect(i.sortText).toBe('!' + String(idx).padStart(3, '0') + '192.168.0.1');
      expect(i.command?.id).toBe('editor.action.formatDocument');
    }
  });

  it('keyword/boolean/long 续元素位按类型分档出候选（前元素裸字面不影响解析）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    expect(suggest('{"query": {"terms": {"status": ["a", "').map(i => i.label)).toEqual(['pref*']);
    expect(suggest('{"query": {"terms": {"ok": [true, "').map(i => i.label)).toEqual(['true', 'false']);
    expect(suggest('{"query": {"terms": {"price": [1, "').map(i => i.label)).toEqual(['1']);
  });

  it('端到端：已敲半截续元素接受候选后整串干净替换、JSON 合法', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    const doc = '{"query": {"terms": {"host": ["10.0.0.1", "10" ]}}}';
    const off = doc.lastIndexOf('"10') + 3; /* 第二元素 "10" 串内、闭引号前 */
    const item = suggest(doc, off).find(i => i.label === '192.168.0.1');
    expect(item).toBeTruthy();
    const after = accept(doc, item);
    expect(after).toBe('{"query": {"terms": {"host": ["10.0.0.1", "192.168.0.1" ]}}}');
    expect(() => JSON.parse(after)).not.toThrow();
    expect(JSON.parse(after).query.terms.host).toEqual(['10.0.0.1', '192.168.0.1']);
  });

  it('深层嵌套同口径：bool.filter 内 terms 值数组续元素位出候选', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    expect(suggest('{"query": {"bool": {"filter": [{"terms": {"host": ["a", "').map(i => i.label)).toEqual(['192.168.0.1']);
  });

  it('压制面：首元素位（540 契约）/ 表外 text / 非字段值数组归位 []', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    /* 首元素位 ["<光标 —— dslValueTiers540 C 段既有断言同形复钉（该 spec 黑名单外不可改） */
    expect(suggest('{"query": {"terms": {"host": ["19')).toEqual([]);
    /* 表外类型（text）续元素位维持压制 */
    expect(suggest('{"query": {"terms": {"title": ["x", "he')).toEqual([]);
    /* 非字段值数组归位：must/ids 续元素位原错档（query snippet）→ [] 压制 */
    expect(suggest('{"query": {"bool": {"must": ["match", "')).toEqual([]);
    expect(suggest('{"query": {"ids": ["1", "')).toEqual([]);
  });

  it('候选只增不改：root 档 / 值位白名单 / field 档零变动（540 C 段抽查复钉）', () => {
    mountEditor({ modelValue: '{}', dslAssist: { fields: () => TYPED } });
    expect(suggest('{"').map(i => i.label)).toEqual(ROOT_KEYS);
    const orderDoc = '{"sort": [{ "date": { "order": "d" } }] }';
    expect(suggest(orderDoc, orderDoc.indexOf('"d"') + 2).map(i => i.label)).toEqual(['asc', 'desc']);
    expect(suggest('{"query": {"term": {"host": "').map(i => i.label)).toEqual(['192.168.0.1']);
    expect(suggest('{"query": {"range": {"price": {"lt": "')).toEqual([]);
  });
});
