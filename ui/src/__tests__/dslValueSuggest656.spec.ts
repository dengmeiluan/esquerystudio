/**
 * 六百五十六批（轨1 · Monaco DSL 值位动态候选 P1 内核先行）：
 * `utils/dslValueSuggest.ts` 行为锁——依据 655 批设计备案
 * `docs/goal655-monaco-value-dynamic-design.md` §5（判定链/类型册/组装细则）+ §7 红点清单
 * 前四组落 spec（第 5 组「注册契约」挂 MonacoEditor stub，属 P2 期——P0 解冻门未开，
 * 纯 util+spec 零冻结面零运行时消费面，probe 降级合法）。
 *
 *  A 窄守卫 dslDynamicValueAt 位判定（§5.1 六步判定链）：
 *    直挂值位（':' 左邻）/range 四操作符值位/terms 续元素位（',' 左邻+栈顶 '['）出字段；
 *    首元素位（540 契约）/白名单七键（DYNAMIC_EXCLUDE 避让）/time_zone·format 元键/
 *    _source·must·ids 数组/JSONC 注释内/转义引号串内/text·date 类型/fields 查无/aggs 撞名键/
 *    键位/串外/bodyKind 非 search 一律 null。
 *  B SUGGESTABLE_VALUE_TYPES 边界（§5.2：terms agg 可聚合判据——keyword 三员+数值九口径+
 *    boolean+ip 在册；date 族/text 族/object 族/geo_point/alias 不在册）。
 *  C 源锚 parity（§5.3）：DYNAMIC_EXCLUDE_VALUE_KEYS ≡ MonacoEditor.vue VALUE_WHITELIST
 *    字面同集；dslSortText/dslFilterText/scanStringEnd/ACCEPT_FORMAT_COMMAND 四镜像同形；
 *    工厂对象无 triggerCharacters 键（655-C1 先例：dslRegs 过滤器只认 ['"']，省略=天然不入，
 *    monacoDslAssist 计数零扰动）。
 *  D 工厂 makeDslValueSuggestProvider 行为：suggestAsync 消费+item 七字段逐断言
 *    （kind/insertText/range 整串 I-1/filterText/sortText 序/command/detail 中文）+
 *    rankTermsByType 精化序（563 契约：展示层精化）+空值/取消/异常/未选索引/非 search 档
 *    五类终点恒 resolve [] 且零请求。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  dslDynamicValueAt,
  dslDynamicValueGuard,
  DYNAMIC_EXCLUDE_VALUE_KEYS,
  SUGGESTABLE_VALUE_TYPES,
  makeDslValueSuggestProvider,
} from '../utils/dslValueSuggest';
import type { DslValueSuggestDeps } from '../utils/dslValueSuggest';

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  languages: { CompletionItemKind: { Value: 13 } }, /* M-3：贴 monaco 0.52.2 真实枚举（monacoDslAssist 同范式） */
}));

/* ---------- 光标标记：¤ 处即 offset；无 ¤ 则光标在文末 ---------- */
function D(s: string): { doc: string; offset: number } {
  const i = s.indexOf('¤');
  return { doc: s.replace('¤', ''), offset: i === -1 ? s.length : i };
}

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'status', type: 'keyword' },
  { path: 'host', type: 'ip' },
  { path: 'cnt', type: 'long' },
  { path: 'flag', type: 'boolean' },
  { path: 'created', type: 'date' },
  { path: 'w', type: 'wildcard' },
  { path: 'ck', type: 'constant_keyword' },
  /* 白名单键同名边角（设计备案 §5.1 第 4 步 exclude 分支的判别字段——无它则 order 值位
     走 fields 查无也 null，exclude 约定不可证） */
  { path: 'order', type: 'keyword' },
];

describe('A 窄守卫 dslDynamicValueAt：直挂/操作符/续元素三形态出字段', () => {
  it('term 直挂值位出字段与类型', () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toEqual({ field: 'status', type: 'keyword' });
  });
  it('match 直挂同口径（叶子子句族通用）', () => {
    const { doc, offset } = D('{ "match": { "status": "ac¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toEqual({ field: 'status', type: 'keyword' });
  });
  it('wildcard 直挂出 wildcard 类型字段', () => {
    const { doc, offset } = D('{ "wildcard": { "w": "pref¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toEqual({ field: 'w', type: 'wildcard' });
  });
  it('range gte/lte 操作符值位出上层字段', () => {
    const a = D('{ "range": { "cnt": { "gte": "12¤');
    expect(dslDynamicValueAt(a.doc, a.offset, FIELDS)).toEqual({ field: 'cnt', type: 'long' });
    const b = D('{ "range": { "cnt": { "lte": "9¤');
    expect(dslDynamicValueAt(b.doc, b.offset, FIELDS)).toEqual({ field: 'cnt', type: 'long' });
  });
  it('terms 值数组续元素位（, 左邻+栈顶 [）出属主字段', () => {
    const { doc, offset } = D('{ "term": { "status": [ "a", "b¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toEqual({ field: 'status', type: 'keyword' });
  });
  it('wildcard 值数组续元素位出属主字段（ip 类型在册）', () => {
    const { doc, offset } = D('{ "wildcard": { "host": [ "10.0.0.1", "10.0¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toEqual({ field: 'host', type: 'ip' });
  });
  it('串中位（右半截未敲）同口径出字段——守卫只看左链', () => {
    const { doc, offset } = D('{ "term": { "status": "a¤c" } }');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toEqual({ field: 'status', type: 'keyword' });
  });
  it('must 数组内深层子句值位同口径（键链跨层回传）', () => {
    const { doc, offset } = D('{ "bool": { "must": [ { "term": { "status": "ac¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toEqual({ field: 'status', type: 'keyword' });
  });
});

describe('A2 窄守卫压制面：六步判定链任一不满足即 null', () => {
  it('terms 值数组首元素位（[ 左邻）null——540 契约钉死', () => {
    const { doc, offset } = D('{ "term": { "status": [ "a¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toBeNull();
  });
  it('range 元键 time_zone/format null——操作符白名单外不出档', () => {
    const a = D('{ "range": { "cnt": { "time_zone": "+08¤');
    expect(dslDynamicValueAt(a.doc, a.offset, FIELDS)).toBeNull();
    const b = D('{ "range": { "cnt": { "format": "yy¤');
    expect(dslDynamicValueAt(b.doc, b.offset, FIELDS)).toBeNull();
  });
  it('白名单七键 null（DYNAMIC_EXCLUDE 避让——order 挂 terms 下且字段表恰有 order 字段，exclude 分支可证）', () => {
    const cases = [
      '{ "aggs": { "by_host": { "terms": { "order": "as¤',          /* 判别例：parentKey=terms ∈ 子句 → 解析成功，靠 exclude 压制 */
      '{ "track_total_hits": "tr¤',
      '{ "aggs": { "a": { "terms": { "field": "sta¤',               /* 设计备案 §5.1 第 4 步点名的边角 */
      '{ "aggs": { "a": { "terms": { "analyzer": "sta¤',
      '{ "aggs": { "a": { "terms": { "search_analyzer": "ik¤',
      '{ "aggs": { "a": { "terms": { "normalizer": "lc¤',
      '{ "aggs": { "a": { "terms": { "tokenizer": "st¤',
    ];
    for (const c of cases) {
      const { doc, offset } = D(c);
      expect(dslDynamicValueAt(doc, offset, FIELDS)).toBeNull();
    }
  });
  it('_source/must/ids 数组续元素位 null——非字段值数组压制', () => {
    const a = D('{ "_source": ["a", "b¤');
    expect(dslDynamicValueAt(a.doc, a.offset, FIELDS)).toBeNull();
    const b = D('{ "bool": { "must": [ { "term": { "status": "a" } }, "b¤');
    expect(dslDynamicValueAt(b.doc, b.offset, FIELDS)).toBeNull();
    const c = D('{ "ids": { "values": ["a", "b¤');
    expect(dslDynamicValueAt(c.doc, c.offset, FIELDS)).toBeNull();
  });
  it('JSONC 行注释/块注释内 null——注释透明跳过', () => {
    const a = D('{ "term": { "status": "a" } } // "host": "10.0¤');
    expect(dslDynamicValueAt(a.doc, a.offset, FIELDS)).toBeNull();
    const b = D('{ "term": { "status": "a" } } /* "host": "10.0¤');
    expect(dslDynamicValueAt(b.doc, b.offset, FIELDS)).toBeNull();
  });
  it('转义引号串内 null——转义感知归因（naive 扫描会误解析出 status 命中）', () => {
    const { doc, offset } = D('{ "term": { "name": "a\\", "status": "ac¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toBeNull();
  });
  it('text/date 类型 null——SUGGESTABLE 门外类型压制', () => {
    const a = D('{ "term": { "title": "el¤');
    expect(dslDynamicValueAt(a.doc, a.offset, FIELDS)).toBeNull();
    const b = D('{ "term": { "created": "now¤');
    expect(dslDynamicValueAt(b.doc, b.offset, FIELDS)).toBeNull();
  });
  it('fields 查无 null（未收录字段/未选索引降级）', () => {
    const { doc, offset } = D('{ "term": { "ghost": "x¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toBeNull();
  });
  it('aggs 撞名键 null（interval 等聚合结构键解析失败）', () => {
    const { doc, offset } = D('{ "aggs": { "a": { "date_histogram": { "interval": "1d¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toBeNull();
  });
  it('键位 null（{ 左邻键串 / , 左邻+栈顶 { 的键串）', () => {
    const a = D('{ "term": { "sta¤');
    expect(dslDynamicValueAt(a.doc, a.offset, FIELDS)).toBeNull();
    const b = D('{ "term": { "status": "a", "cn¤');
    expect(dslDynamicValueAt(b.doc, b.offset, FIELDS)).toBeNull();
  });
  it('串外（光标不在字符串内）null', () => {
    const { doc, offset } = D('{ "term": { "status": "active" } } ¤');
    expect(dslDynamicValueAt(doc, offset, FIELDS)).toBeNull();
  });
  it('bodyKind 非 search null（doc/settings/mapping/template/analyze/none 六档一律压制）', () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    for (const bk of ['doc', 'settings', 'mapping', 'template', 'analyze', 'none'] as const) {
      expect(dslDynamicValueAt(doc, offset, FIELDS, () => bk)).toBeNull();
    }
  });
  it('dslDynamicValueGuard 位判定裸出口：续元素位带 arrayElem 标记（工厂 prefix/range 复用）', () => {
    const { doc, offset } = D('{ "term": { "status": [ "a", "b¤');
    const g = dslDynamicValueGuard(doc, offset);
    expect(g).not.toBeNull();
    expect(g!.arrayElem).toBe(true);
    expect(g!.valueKey).toBe('status');
    expect(g!.strStart).toBe(doc.lastIndexOf('"b'));
  });
});

describe('B SUGGESTABLE_VALUE_TYPES 边界（terms agg 可聚合判据）', () => {
  const IN = ['keyword', 'constant_keyword', 'wildcard', 'long', 'integer', 'short', 'byte',
    'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'boolean', 'ip'];
  const OUT = ['date', 'date_nanos', 'text', 'annotated_text', 'object', 'nested', 'flattened', 'geo_point', 'alias', 'token_count'];
  it('可聚合十四口径全在册', () => {
    for (const t of IN) expect(SUGGESTABLE_VALUE_TYPES.has(t), t).toBe(true);
  });
  it('不可聚合/语义异形十类型不在册（date 族走静态 date-math 档 §6 D3）', () => {
    for (const t of OUT) expect(SUGGESTABLE_VALUE_TYPES.has(t), t).toBe(false);
  });
});

describe('C 源锚 parity（冻结面镜像看守）', () => {
  const monacoSrc = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');
  const utilSrc = readFileSync(join(__dirname, '../utils/dslValueSuggest.ts'), 'utf-8');

  it('DYNAMIC_EXCLUDE_VALUE_KEYS ≡ MonacoEditor VALUE_WHITELIST 字面同集', () => {
    const m = /const VALUE_WHITELIST = new Set\(\[([^\]]*)\]\)/.exec(monacoSrc);
    expect(m).not.toBeNull();
    const white = m![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    expect(white).toHaveLength(7);
    expect([...DYNAMIC_EXCLUDE_VALUE_KEYS].sort()).toEqual([...white].sort());
  });
  it('dslSortText/dslFilterText 镜像同形（解冻后不强行合并——冻结面 diff 最小化）', () => {
    const SORT_BODY = "return '!' + String(idx).padStart(3, '0') + label;";
    const FILTER_BODY = 'return \'"\' + label;';
    expect(monacoSrc).toContain(SORT_BODY);
    expect(utilSrc).toContain(SORT_BODY);
    expect(monacoSrc).toContain(FILTER_BODY);
    expect(utilSrc).toContain(FILTER_BODY);
  });
  it('scanStringEnd 镜像同形（range 整串右扫口径与主 provider 逐字节等值）', () => {
    const LINES = ['let end = start;', 'if (!isEscapedQuote(doc, i)) { end = i + 1; break; }'];
    for (const l of LINES) {
      expect(monacoSrc).toContain(l);
      expect(utilSrc).toContain(l);
    }
  });
  it('ACCEPT_FORMAT_COMMAND 镜像同形（接受即 formatDocument 幂等归一全站同规）', () => {
    const FMT = "{ id: 'editor.action.formatDocument', title: '接受后格式化' }";
    expect(monacoSrc).toContain(FMT);
    expect(utilSrc).toContain(FMT);
  });
  it('工厂对象无 triggerCharacters 键——655-C1 先例：dslRegs 过滤器只认 [\'"\']，省略=计数零扰动', () => {
    const deps: DslValueSuggestDeps = { fields: () => FIELDS, terms: async () => [] };
    const p = makeDslValueSuggestProvider(deps);
    expect(typeof p.provideCompletionItems).toBe('function');
    expect('triggerCharacters' in p).toBe(false);
  });
});

describe('D 工厂 makeDslValueSuggestProvider：五类终点恒 resolve + item 七字段', () => {
  const mkModel = (doc: string, offset: number) => ({
    getValue: () => doc,
    getOffsetAt: () => offset,
    getPositionAt: (o: number) => ({ lineNumber: 1, column: o + 1 }),
  });
  const base: DslValueSuggestDeps = { fields: () => FIELDS, terms: async () => [] };

  it('resolve 值→item 七字段逐断言（ES 权威序=展示序，keyword 无精化重排）', async () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    const terms = vi.fn(async () => ['Pending', 'active']);
    const p = makeDslValueSuggestProvider({ ...base, terms });
    const r = await p.provideCompletionItems(mkModel(doc, offset), { lineNumber: 1, column: offset + 1 });
    expect(terms).toHaveBeenCalledWith('status', 'ac');
    const s = r.suggestions;
    expect(s).toHaveLength(2);
    const strStart = doc.lastIndexOf('"'); /* '"ac' 未闭合串的开引号 */
    expect(s[0]).toMatchObject({
      label: 'Pending',
      kind: monaco.languages.CompletionItemKind.Value,
      insertText: '"Pending"',
      filterText: '"Pending',
      sortText: '!000Pending',
      detail: '字段值 · keyword · top20',
    });
    expect(s[0].command).toEqual({ id: 'editor.action.formatDocument', title: '接受后格式化' });
    /* range 整串覆盖（I-1）：未闭合串 scanStringEnd 回 cursor——vEnd=offset */
    expect(s[0].range).toEqual({
      startLineNumber: 1, startColumn: strStart + 1, endLineNumber: 1, endColumn: offset + 1,
    });
    expect(s[1].sortText).toBe('!001active');
  });
  it('已闭合串 range 覆盖整串至闭引号后（与主 provider 值位档同形态）', async () => {
    const doc = '{ "term": { "status": "active", "cnt": "1" } }';
    const offset = doc.indexOf('"active') + '"active'.length; /* 光标在 e 后、闭引号前 */
    const p = makeDslValueSuggestProvider({ ...base, terms: async () => ['active'] });
    const r = await p.provideCompletionItems(mkModel(doc, offset), { lineNumber: 1, column: offset + 1 });
    const vEnd = doc.indexOf('"', offset) + 1; /* 闭引号后一位 */
    expect(r.suggestions[0].range.endColumn).toBe(vEnd + 1);
  });
  it('rankTermsByType 精化序生效（long 字段数值形态排前，563 契约展示层消费）', async () => {
    const { doc, offset } = D('{ "term": { "cnt": "x¤');
    const p = makeDslValueSuggestProvider({ ...base, terms: async () => ['abc', '123'] });
    const r = await p.provideCompletionItems(mkModel(doc, offset), { lineNumber: 1, column: offset + 1 });
    expect(r.suggestions.map((x: any) => x.label)).toEqual(['123', 'abc']);
    expect(r.suggestions.map((x: any) => x.sortText)).toEqual(['!000123', '!001abc']);
    expect(r.suggestions[0].detail).toBe('字段值 · long · top20');
  });
  it('空值→[]（suggestAsync 五类终点白得）', async () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    const p = makeDslValueSuggestProvider({ ...base, terms: async () => [] });
    const r = await p.provideCompletionItems(mkModel(doc, offset), { lineNumber: 1, column: offset + 1 });
    expect(r.suggestions).toEqual([]);
  });
  it('bodyKind 非 search→[] 且 terms 零调用（零请求）', async () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    const terms = vi.fn(async () => ['a']);
    const p = makeDslValueSuggestProvider({ fields: () => FIELDS, terms, bodyKind: () => 'doc' });
    const r = await p.provideCompletionItems(mkModel(doc, offset), { lineNumber: 1, column: offset + 1 });
    expect(r.suggestions).toEqual([]);
    expect(terms).not.toHaveBeenCalled();
  });
  it('fields 空（未选索引）→[] 且 terms 零调用（§9.3 天然降级）', async () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    const terms = vi.fn(async () => ['a']);
    const p = makeDslValueSuggestProvider({ fields: () => [], terms });
    const r = await p.provideCompletionItems(mkModel(doc, offset), { lineNumber: 1, column: offset + 1 });
    expect(r.suggestions).toEqual([]);
    expect(terms).not.toHaveBeenCalled();
  });
  it('通道异常恒 resolve []（不 reject——535 契约防御性兜底）', async () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    const p = makeDslValueSuggestProvider({
      ...base,
      terms: async () => { throw new Error('boom'); },
    });
    const r = await p.provideCompletionItems(mkModel(doc, offset), { lineNumber: 1, column: offset + 1 });
    expect(r.suggestions).toEqual([]);
  });
  it('token 取消弃回填→[]', async () => {
    const { doc, offset } = D('{ "term": { "status": "ac¤');
    const p = makeDslValueSuggestProvider({ ...base, terms: async () => ['active'] });
    const r = await p.provideCompletionItems(
      mkModel(doc, offset), { lineNumber: 1, column: offset + 1 }, undefined, { isCancellationRequested: true },
    );
    expect(r.suggestions).toEqual([]);
  });
});
