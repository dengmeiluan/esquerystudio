/**
 * 546 批轨1：es-dsl-lint CodeAction 第二波 4 条（unknown-field / sort-unknown-field /
 * agg-text-field / mapping-type）行为锁。
 *
 *  照 quickFixDslLint534.spec 形态（vi.hoisted caps + editor.api mock + 单行 fake model），
 *  构造 marker → provideCodeActions → 应用 textEdit → 改写结果断言（执行级验证）：
 *   - unknown-field（multi_match fields 与 lintFieldUsage 两分支同文案）：marker 即坏字段
 *     本体（anchor 带引号定位），消息拆「最接近：」候选整段改名；
 *   - sort-unknown-field：同款改名（消息文案「sort 字段「x」不在…」同一拆取口径）；
 *   - agg-text-field：坏字段追加 .keyword 子字段（消息建议文案同源）；
 *   - mapping-type：锚点钉 'type' 键名，坏类型值锚后右扫改名（sort-order-typo 同款）。
 *  负向：marker 未覆盖坏字段本体 / 消息拆不出「最接近：」→ 零 action（宁缺勿错；
 *  与 quickFixDslLint534.spec B 段 unknown-field 零 action 构造同形态互证不破）。
 *  注册面零增量：provider 仍 json + es-dsl-lint 各一份。
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

const URI_STR = 'inmemory://dsl-546/1';
const URI = { toString: () => URI_STR };

/** 单行文档 fake model（quickFixDslLint534 同款）+ apply：把 action 的 textEdit 应用到文档串（执行级改写）。 */
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

describe('A 四条新 action（marker→getAction→执行→改写结果）', () => {
  it('unknown-field：字段名改名「userr」→「user」（marker 即坏字段本体，整段改名）', () => {
    const doc = '{"query": {"term": {"userr": "x"}}}';
    caps.markers = [markerAt(21, 28)]; /* 覆盖 "userr" */
    recordDslLintMarkers(URI_STR, [entry(21, 28, 'unknown-field', '字段「userr」不在当前索引 mapping 中（最接近：user）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('字段改为「user」');
    expect(acts[0].kind).toBe('quickfix');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('"user"');
    expect(te.range).toEqual(markerAt(21, 28)); /* marker 本体即修复点（整段改名） */
    expect(applyEdit(doc, acts[0]), '执行改写后字段名修正').toBe('{"query": {"term": {"user": "x"}}}');
  });

  it('sort-unknown-field：同款改名（「sort 字段「x」不在…」同一拆取口径）', () => {
    const doc = '{"sort": [{"userr": "ascending"}]}';
    caps.markers = [markerAt(12, 19)]; /* 覆盖 "userr" */
    recordDslLintMarkers(URI_STR, [entry(12, 19, 'sort-unknown-field', 'sort 字段「userr」不在当前索引 mapping 中（最接近：user）——ES 对无 mapping 的排序字段直接拒绝请求（400）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('字段改为「user」');
    expect(acts[0].edit.edits[0].textEdit.text).toBe('"user"');
    expect(applyEdit(doc, acts[0])).toBe('{"sort": [{"user": "ascending"}]}');
  });

  it('agg-text-field：坏字段追加 .keyword 子字段（消息建议文案同源）', () => {
    const doc = '{"aggs": {"by": {"terms": {"field": "msg"}}}}';
    caps.markers = [markerAt(37, 42)]; /* 覆盖 "msg"（anchor=字段值本体） */
    recordDslLintMarkers(URI_STR, [entry(37, 42, 'agg-text-field', '聚合 field 打在 text 字段 msg：聚合需要 fielddata，text 字段默认禁用（请求大概率 400）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('字段改为「msg.keyword」');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('"msg.keyword"');
    expect(te.range).toEqual(markerAt(37, 42)); /* marker 本体即修复点（整段替换） */
    expect(applyEdit(doc, acts[0])).toBe('{"aggs": {"by": {"terms": {"field": "msg.keyword"}}}}');
  });

  it('mapping-type：坏类型值锚后右扫改名「txet」→「text」（sort-order-typo 同款形态）', () => {
    const doc = '{"properties": {"user": {"type": "txet", "enabled": true}}}';
    caps.markers = [markerAt(26, 32)]; /* 覆盖 "type"（anchor=type 键名） */
    recordDslLintMarkers(URI_STR, [entry(26, 32, 'mapping-type', '字段 user 的类型「txet」疑似拼写错误（最接近：text）——未知类型 ES 拒绝请求（400）')]);
    const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toBe('类型改为「text」');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('"text"');
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 34, endLineNumber: 1, endColumn: 40 });
    expect(applyEdit(doc, acts[0])).toBe('{"properties": {"user": {"type": "text", "enabled": true}}}');
  });
});

describe('B 负向：证据闸（宁缺勿错）', () => {
  it('marker 未覆盖坏字段本体 → 零 action（quickFixDslLint534 B 段 unknown-field 零 action 构造同形态，不破）', () => {
    const model = fakeModel('{"anchor": {}}');
    caps.markers = [markerAt(2, 9)]; /* 覆盖 "anchor"，消息却说 userr：无证据 */
    recordDslLintMarkers(URI_STR, [entry(2, 9, 'unknown-field', '字段「userr」不在当前索引 mapping 中（最接近：user）')]);
    expect(dslProvider().provideCodeActions(model, RANGE).actions).toEqual([]);
  });

  it('消息拆不出「最接近：」候选或坏字段名 → 零 action（改名类三规则同闸）', () => {
    const doc = '{"query": {"term": {"userr": "x"}}}';
    for (const [rule, msg] of [
      ['unknown-field', '字段「userr」不在当前索引 mapping 中'],
      ['sort-unknown-field', 'sort 字段「userr」拼写存疑（最接近：user）'],
      ['agg-text-field', '聚合 field 打在 text 字段：聚合需要 fielddata'],
    ] as [string, string][]) {
      caps.markers = [markerAt(21, 28)];
      recordDslLintMarkers(URI_STR, [entry(21, 28, rule, msg)]);
      const acts = dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions;
      expect(acts.map((a: any) => a.title), `${rule} 拆不出候选必须零 action`).toEqual([]);
    }
  });

  it('mapping-type 拆不出「最接近」→ 零 action；坏类型值不在场（firstMatchAfter 无命中）→ 零 action', () => {
    const doc = '{"properties": {"user": {"type": "txet"}}}';
    caps.markers = [markerAt(26, 32)];
    recordDslLintMarkers(URI_STR, [entry(26, 32, 'mapping-type', '字段 user 的类型「txet」疑似拼写错误——未知类型 ES 拒绝请求（400）')]);
    expect(dslProvider().provideCodeActions(fakeModel(doc), RANGE).actions).toEqual([]);
    /* 消息含候选但文档里没有坏类型值本体（第一参 doc 无 "txet"）：右扫无命中不出 */
    caps.markers = [markerAt(26, 32)];
    recordDslLintMarkers(URI_STR, [entry(26, 32, 'mapping-type', '字段 user 的类型「txet」疑似拼写错误（最接近：text）——未知类型 ES 拒绝请求（400）')]);
    expect(dslProvider().provideCodeActions(fakeModel('{"properties": {}}'), RANGE).actions).toEqual([]);
  });
});

describe('C 注册面零增量', () => {
  it('provider 仍 json + es-dsl-lint 各一份（幂等，新 4 条走 es-dsl-lint 白名单内增量）', () => {
    expect(caps.calls).toEqual(['json', 'json']);
    expect(caps.providers.length).toBe(2);
  });
});
