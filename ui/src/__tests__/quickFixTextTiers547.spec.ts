/**
 * 547 批轨1：es-dsl-lint CodeAction 第三波 3 条（text-sort / text-term / multi-match-fields）
 * 行为锁。照 quickFixWave546.spec 形态（vi.hoisted caps + editor.api mock + 单行 fake model），
 * 构造 marker → provideCodeActions → 应用 textEdit → 改写结果断言（执行级验证）：
 *  - text-sort（dslLint「sort 打在 text 字段 x」）：消息拆坏字段，证据闸=marker 覆盖文本===坏字段
 *    （sort-unknown-field 同款闸形态），修复=整段改名加 .keyword；
 *  - text-term（dslLint「text 字段 term 不匹配分词」——消息不含字段名）：反向证据闸=marker
 *    覆盖文本是带引号字符串字面量且不以 .keyword 结尾（弱闸负向在 B 段钉死），修复=该字段
 *    整段追加 .keyword；
 *  - multi-match-fields（fields 标量分支）：fields 锚后右扫定位 + valueAfterMarker 同形态
 *    提取标量，修复=标量包数组 [x]（terms-scalar 同款）。
 * 证据闸纪律：宁缺勿错——拆不出/证据不符一律零 action。
 * 注册面零增量：provider 仍 json + es-dsl-lint 各一份（quickFixWave546 C 段同款锁）。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const caps = vi.hoisted(() => ({
  calls: [] as string[],
  providers: [] as any[],
  filter: null as any,
  markers: [] as any[],
}));

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  languages: {
    registerCodeActionProvider: (_lang: string, p: any) => {
      caps.calls.push(_lang);
      caps.providers.push(p);
      return { dispose() {} };
    },
  },
  editor: {
    getModelMarkers: (filter: any) => { caps.filter = filter; return caps.markers; },
  },
}));

import { ensureJsonQuickFixes, ensureDslLintQuickFixes, recordDslLintMarkers } from '../utils/monacoJsonQuickFix';

const URI_STR = 'inmemory://dsl-547/1';
const URI = { toString: () => URI_STR };

/** 单行文档 fake model（quickFixWave546 同款）+ apply：把 action 的 textEdit 应用到文档串（执行级改写）。 */
function fakeModel(line: string) {
  const colOf = (idx: number) => idx + 1;
  return {
    uri: URI,
    getValueInRange: (r: any) => line.slice(r.startColumn - 1, r.endColumn - 1),
    getLineContent: () => line,
    getLineCount: () => 1,
    getLineMaxColumn: () => line.length + 1,
    findMatches: (needle: string, scope: any) => {
      const hits: any[] = [];
      let from = 0;
      for (;;) {
        const at = line.indexOf(needle, from);
        if (at < 0) break;
        hits.push({ range: { startLineNumber: 1, startColumn: colOf(at), endLineNumber: 1, endColumn: colOf(at) + needle.length } });
        from = at + 1;
      }
      return hits.filter(h => h.range.startColumn >= scope.startColumn);
    },
  };
}
/** 单 textEdit 执行：返回改写后的整文档串（marker→getAction→执行 的最后一环）。 */
function applyEdit(doc: string, a: any): string {
  const te = a.edit.edits[0].textEdit;
  return doc.slice(0, te.range.startColumn - 1) + te.text + doc.slice(te.range.endColumn - 1);
}

const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 120 };

function markerAt(sc: number, ec: number) {
  return {
    owner: 'es-dsl-lint', startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec,
    message: '', severity: 4, code: { value: 'es-dsl-lint:anchored' },
  };
}
function entry(sc: number, ec: number, rule: string, message: string) {
  return { startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec, finding: { rule, message, suggestion: 's', anchor: 'a' } };
}
const dslProvider = () => caps.providers[caps.providers.length - 1];

beforeAll(() => { ensureJsonQuickFixes(); ensureDslLintQuickFixes(); });
beforeEach(() => { caps.markers = []; caps.filter = null; });

describe('A 三条新 action（marker→getAction→执行→改写结果）', () => {
  it('text-sort：坏字段整段改名加 .keyword（消息拆字段+证据闸，agg-text-field 同形态）', () => {
    const doc = '{"sort": [{"title": "desc"}]}';
    caps.markers = [markerAt(12, 19)]; /* 覆盖 "title" */
    recordDslLintMarkers(URI_STR, [entry(12, 19, 'text-sort', 'sort 打在 text 字段 title：排序需要 fielddata，text 字段默认禁用（请求大概率 400）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('字段改为「title.keyword」');
    expect(acts[0].kind).toBe('quickfix');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('"title.keyword"');
    expect(te.range).toEqual(markerAt(12, 19)); /* marker 本体即修复点（整段改名） */
    expect(applyEdit(doc, acts[0]), '执行改写后排序字段挂 .keyword').toBe('{"sort": [{"title.keyword": "desc"}]}');
  });

  it('text-term：term 子句坏字段整段追加 .keyword（消息不含字段名，反向证据闸）', () => {
    const doc = '{"query": {"term": {"title": "x"}}}';
    caps.markers = [markerAt(21, 28)]; /* 覆盖 "title" */
    recordDslLintMarkers(URI_STR, [entry(21, 28, 'text-term', 'text 字段 term 不匹配分词：倒排里是分词后的词项，整串原值大概率查不到')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('字段改为「title.keyword」');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('"title.keyword"');
    expect(te.range).toEqual(markerAt(21, 28));
    expect(applyEdit(doc, acts[0])).toBe('{"query": {"term": {"title.keyword": "x"}}}');
  });

  it('text-term：wildcard 子句同闸（消息 clause 名不同、闸不看消息）', () => {
    const doc = '{"query": {"wildcard": {"title": "a*"}}}';
    caps.markers = [markerAt(25, 32)]; /* 覆盖 "title" */
    recordDslLintMarkers(URI_STR, [entry(25, 32, 'text-term', 'text 字段 wildcard 不匹配分词：倒排里是分词后的词项，整串原值大概率查不到')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(applyEdit(doc, acts[0])).toBe('{"query": {"wildcard": {"title.keyword": "a*"}}}');
  });

  it('multi-match-fields：fields 标量包数组（fields 锚后右扫 + valueAfterMarker 形态，terms-scalar 同款）', () => {
    const doc = '{"query": {"multi_match": {"query": "x", "fields": "title"}}}';
    caps.markers = [markerAt(12, 25)]; /* 覆盖 "multi_match"（anchor=multi_match 键本体） */
    recordDslLintMarkers(URI_STR, [entry(12, 25, 'multi-match-fields', 'multi_match fields 必须是数组：收到标量「title」，ES 会拒绝请求（400）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('标量包成数组 ["title"]');
    expect(acts[0].edit.edits[0].textEdit.text).toBe('["title"]');
    expect(acts[0].edit.edits[0].textEdit.range).toEqual({ startLineNumber: 1, startColumn: 52, endLineNumber: 1, endColumn: 59 });
    expect(applyEdit(doc, acts[0]), '执行改写后 fields 成数组').toBe('{"query": {"multi_match": {"query": "x", "fields": ["title"]}}}');
  });
});

describe('B 负向：证据闸（宁缺勿错）', () => {
  it('text-sort：marker 覆盖文本 ≠ 消息坏字段 → 零 action（sort-unknown-field 同款闸不破）', () => {
    const model = fakeModel('{"sort": [{"title": "desc"}]}');
    caps.markers = [markerAt(12, 19)]; /* 覆盖 "title"，消息却说 msg：无证据 */
    recordDslLintMarkers(URI_STR, [entry(12, 19, 'text-sort', 'sort 打在 text 字段 msg：排序需要 fielddata，text 字段默认禁用（请求大概率 400）')]);
    expect(dslProvider().provideCodeActions(model, RANGE).actions).toEqual([]);
  });

  it('text-sort：消息拆不出坏字段（文案形态漂移）→ 零 action', () => {
    const model = fakeModel('{"sort": [{"title": "desc"}]}');
    caps.markers = [markerAt(12, 19)];
    recordDslLintMarkers(URI_STR, [entry(12, 19, 'text-sort', 'sort 打在 text 字段：排序需要 fielddata')]);
    expect(dslProvider().provideCodeActions(model, RANGE).actions).toEqual([]);
  });

  it('text-term：字段已带 .keyword → 零 action（弱闸负向钉死：不在串上叠 .keyword）', () => {
    const doc = '{"query": {"term": {"title.keyword": "x"}}}';
    caps.markers = [markerAt(21, 36)]; /* 覆盖 "title.keyword" */
    recordDslLintMarkers(URI_STR, [entry(21, 36, 'text-term', 'text 字段 term 不匹配分词：倒排里是分词后的词项，整串原值大概率查不到')]);
    expect(dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions).toEqual([]);
  });

  it('text-term：marker 不在带引号字符串字面量上 → 零 action（反向证据闸负向钉死）', () => {
    const doc = '{"query": {"term": {"title": "x"}}}';
    caps.markers = [markerAt(22, 27)]; /* 覆盖裸词 title（无引号）：非串零 action */
    recordDslLintMarkers(URI_STR, [entry(22, 27, 'text-term', 'text 字段 term 不匹配分词：倒排里是分词后的词项，整串原值大概率查不到')]);
    expect(dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions).toEqual([]);
  });

  it('multi-match-fields：fields 已是数组 → 零 action（值非标量提不出，不误包双层）', () => {
    const doc = '{"query": {"multi_match": {"query": "x", "fields": ["title"]}}}';
    caps.markers = [markerAt(12, 25)];
    recordDslLintMarkers(URI_STR, [entry(12, 25, 'multi-match-fields', 'multi_match fields 必须是数组：收到标量「title」，ES 会拒绝请求（400）')]);
    expect(dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions).toEqual([]);
  });

  it('multi-match-fields：fields 键不在场（缺 fields 分支）→ 零 action', () => {
    const doc = '{"query": {"multi_match": {"query": "x"}}}';
    caps.markers = [markerAt(12, 25)];
    recordDslLintMarkers(URI_STR, [entry(12, 25, 'multi-match-fields', 'multi_match 缺 fields：不指定检索字段会被 ES 拒绝或零命中')]);
    expect(dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions).toEqual([]);
  });
});

describe('C 注册面零增量', () => {
  it('provider 仍 json + es-dsl-lint 各一份（幂等，新 3 条走 es-dsl-lint 白名单内增量）', () => {
    expect(caps.calls).toEqual(['json', 'json']);
    expect(caps.providers.length).toBe(2);
  });
});
