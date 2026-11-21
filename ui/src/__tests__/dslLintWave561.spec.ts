/**
 * 五百六十一批：dslLint 三新规则 + monacoJsonQuickFix 两新增通道。
 *
 *  A agg-type-typo：aggs.<名>.<类型> 的类型键不在聚合白名单（AGG_SNIPPETS 既有 11 键为基础
 *    补常规聚合族），nearestKey 编辑距离 ≤2 报 warning「最接近：xxx」（bool-key-typo 同消息
 *    形态，供 quickfix 改名复用）；实例名位（距 aggs 容器一层）/深层键位/meta 伴随键豁免，
 *    距离 >2 不报（宁少勿噪音）。
 *  B date-term-value：term/match_phrase 打 date 系字段且值为非日期串（如「昨天」）→ warning
 *    （isLegalDateValue 白名单复用：ISO / now 日期数学 / ||复合 / epoch 毫秒放行）；
 *    对象值形态与缺 ctx 不判（零 ctx 零回归）。
 *  C should-in-filter：bool 节点仅含 should 键、无 minimum_should_match、处于 filter/must_not
 *    语境（walk 递归带语境传递，数组元素同透）→ hint「filter 语境 should 不计分，需
 *    minimum_should_match 才生效」；query 语境 / 有 must 等伴键 / 带 msm 豁免。
 *  D quickfix：agg-type-typo 接改名 action（bool-key-typo 同形态，nearestOf 拆「最接近：」）；
 *    json 通道白名单新增「Comments are not allowed in JSON」→ 删注释 action（行内删注释本体、
 *    整行只剩注释连同换行删、末行删到行尾、跨行块注释只删区间）。
 *
 * stub 范式同 quickFixDslLint534（vi.hoisted caps + editor.api mock）。
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

import { lintDsl } from '../utils/dslLint';
import { ensureJsonQuickFixes, ensureDslLintQuickFixes, recordDslLintMarkers } from '../utils/monacoJsonQuickFix';

const DATE_CTX = { fields: [{ path: 'created', type: 'date' }, { path: 'status', type: 'keyword' }] };
const rulesOf = (dsl: unknown, ctx?: typeof DATE_CTX) => lintDsl(dsl, ctx).map(f => f.rule);

describe('A 五百六十一批规则① agg-type-typo：聚合类型拼写', () => {
  it('aggs.<名>.<类型> 拼错（termz）→ warning，消息带「最接近：terms」，锚点=类型键', () => {
    const fs = lintDsl({ aggs: { g: { termz: { field: 'status' } } } });
    const f = fs.find(x => x.rule === 'agg-type-typo');
    expect(f, '应产出 agg-type-typo finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.message).toContain('termz');
    expect(f!.message).toContain('最接近：terms');
    expect(f!.anchor).toBe('termz');
    expect(f!.path).toBe('aggs.g.termz');
  });

  it('aggregations 双拼写同判；嵌套 aggs 深层聚合体同判（路径带嵌套链）', () => {
    expect(rulesOf({ aggregations: { h: { avvg: { field: 'x' } } } })).toContain('agg-type-typo');
    const fs = lintDsl({ aggs: { g: { terms: { field: 'status', size: 5 }, aggs: { i: { avvg: { field: 'status' } } } } } });
    const f = fs.find(x => x.rule === 'agg-type-typo');
    expect(f, '嵌套聚合体的类型键也应命中').toBeTruthy();
    expect(f!.path).toBe('aggs.g.aggs.i.avvg');
  });

  it('常规聚合族在册不报；meta 伴随键与实例名位豁免', () => {
    const okTypes = ['terms', 'avg', 'sum', 'min', 'max', 'stats', 'cardinality', 'value_count',
      'date_histogram', 'histogram', 'range', 'date_range', 'filter', 'filters', 'nested',
      'reverse_nested', 'top_hits', 'composite', 'multi_terms', 'percentiles', 'rare_terms',
      'significant_terms', 'cumulative_sum', 'extended_stats', 'auto_date_histogram', 'sampler'];
    for (const t of okTypes) {
      expect(rulesOf({ aggs: { g: { [t]: {} } } }), `${t} 在册不报`).not.toContain('agg-type-typo');
    }
    expect(rulesOf({ aggs: { g: { terms: { field: 'f', size: 1 }, meta: { who: 'me' } } } }))
      .not.toContain('agg-type-typo');
    expect(rulesOf({ aggs: { termz: { terms: { field: 'f', size: 1 } } } }))
      .not.toContain('agg-type-typo');
  });

  it('编辑距离 >2 不报（宁少勿噪音）；query 子句与 aggs 共存互不影响', () => {
    expect(rulesOf({ aggs: { g: { qqqqqq: {} } } })).not.toContain('agg-type-typo');
    expect(rulesOf({ query: { match_all: {} }, aggs: { g: { termz: {} } } })).toContain('agg-type-typo');
  });
});

describe('B 五百六十一批规则② date-term-value：term/match_phrase 打 date 字段收非日期串', () => {
  it('term 值「昨天」→ warning，消息含字段与坏值，锚点=字段名', () => {
    const fs = lintDsl({ query: { term: { created: '昨天' } } }, DATE_CTX);
    const f = fs.find(x => x.rule === 'date-term-value');
    expect(f, '应产出 date-term-value finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.message).toContain('created');
    expect(f!.message).toContain('昨天');
    expect(f!.anchor).toBe('created');
    expect(f!.path).toBe('query.term.created');
  });

  it('match_phrase 同判', () => {
    expect(rulesOf({ query: { match_phrase: { created: '上周' } } }, DATE_CTX)).toContain('date-term-value');
  });

  it('合法日期值放行：ISO / now 日期数学 / epoch 毫秒（数字与数字串）', () => {
    expect(rulesOf({ query: { term: { created: '2026-01-01' } } }, DATE_CTX)).not.toContain('date-term-value');
    expect(rulesOf({ query: { term: { created: 'now-1d/d' } } }, DATE_CTX)).not.toContain('date-term-value');
    expect(rulesOf({ query: { term: { created: 1700000000000 } } }, DATE_CTX)).not.toContain('date-term-value');
    expect(rulesOf({ query: { term: { created: '1700000000000' } } }, DATE_CTX)).not.toContain('date-term-value');
  });

  it('对象值形态（value/boost 参数）与缺 ctx 均不判（零 ctx 零回归）', () => {
    expect(rulesOf({ query: { term: { created: { value: '昨天' } } } }, DATE_CTX)).not.toContain('date-term-value');
    expect(rulesOf({ query: { term: { created: '昨天' } } })).not.toContain('date-term-value');
  });
});

describe('C 五百六十一批规则③ should-in-filter：filter/must_not 语境纯 should', () => {
  it('bool.filter 内纯 should（无 minimum_should_match）→ hint「filter 语境 should 不计分」', () => {
    const fs = lintDsl({ query: { bool: { filter: { bool: { should: [{ term: { a: 1 } }] } } } } });
    const f = fs.find(x => x.rule === 'should-in-filter');
    expect(f, '应产出 should-in-filter finding').toBeTruthy();
    expect(f!.severity).toBe('hint');
    expect(f!.message).toContain('filter 语境 should 不计分');
    expect(f!.message).toContain('minimum_should_match');
    expect(f!.anchor).toBe('should');
    expect(f!.path).toBe('query.bool.filter.bool.should');
  });

  it('must_not 语境与 filter 数组元素同判（语境传递穿数组）', () => {
    expect(rulesOf({ query: { bool: { must_not: { bool: { should: [{ term: { a: 1 } }] } } } } }))
      .toContain('should-in-filter');
    expect(rulesOf({ query: { bool: { filter: [{ bool: { should: [{ term: { a: 1 } }] } }] } } }))
      .toContain('should-in-filter');
  });

  it('query 语境纯 should 不报；filter 语境 bool 带 must 伴键不报；带 minimum_should_match 不报', () => {
    expect(rulesOf({ query: { bool: { should: [{ term: { a: 1 } }] } } })).not.toContain('should-in-filter');
    expect(rulesOf({ query: { bool: { filter: { bool: { must: [{ term: { a: 1 } }], should: [{ term: { a: 2 } }] } } } } }))
      .not.toContain('should-in-filter');
    expect(rulesOf({ query: { bool: { filter: { bool: { should: [{ term: { a: 1 } }], minimum_should_match: 1 } } } } }))
      .not.toContain('should-in-filter');
  });
});

/* ═══ D：quickfix 通道（stub 范式同 quickFixDslLint534）═══ */
const URI_STR = 'inmemory://dsl-lint-561/1';
const URI = { toString: () => URI_STR };
const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 9, endColumn: 200 };

/** 多行文档 fake model（删注释分支需 getLineContent 按行 + getLineCount） */
function fakeModel(lines: string[]) {
  const lineOf = (ln: number) => lines[ln - 1] ?? '';
  return {
    uri: URI,
    getValueInRange: (r: any) => lineOf(r.startLineNumber).slice(r.startColumn - 1, r.endColumn - 1),
    getLineContent: (ln: number) => lineOf(ln),
    getLineCount: () => lines.length,
    getLineMaxColumn: (ln: number) => lineOf(ln).length + 1,
  };
}
function markerAt(sl: number, sc: number, el: number, ec: number, patch: Record<string, any> = {}) {
  return {
    owner: 'es-dsl-lint', startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec,
    message: '', severity: 4, code: { value: 'es-dsl-lint:anchored' }, ...patch,
  };
}
function entry(sl: number, sc: number, el: number, ec: number, rule: string, message: string) {
  return { startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec, finding: { rule, message, suggestion: 's', anchor: 'a' } };
}
const dslProvider = () => caps.providers[caps.providers.length - 1];
const jsonProvider = () => caps.providers[0];

describe('D quickfix：agg-type-typo 改名 + Comments 不允许 删注释', () => {
  beforeAll(() => { ensureJsonQuickFixes(); ensureDslLintQuickFixes(); });
  beforeEach(() => { caps.markers = []; caps.filter = null; });

  it('agg-type-typo →「键改为「terms」」：marker 即坏类型键本体，整段改名（bool-key-typo 同形态）', () => {
    const model = fakeModel(['{"aggs":{"g":{"termz":{"field":"x"}}}}']);
    caps.markers = [markerAt(1, 15, 1, 21)]; /* 覆盖 "termz" */
    recordDslLintMarkers(URI_STR, [entry(1, 15, 1, 21, 'agg-type-typo', '聚合类型「termz」疑似拼写错误（最接近：terms）——未知聚合类型 ES 拒绝请求（400）')]);
    const acts = dslProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.map((a: any) => a.title)).toEqual(['键改为「terms」']);
    expect(acts[0].kind).toBe('quickfix');
    expect(acts[0].edit.edits[0].textEdit.text).toBe('"terms"');
    expect(acts[0].edit.edits[0].textEdit.range).toEqual(markerAt(1, 15, 1, 21));
  });

  it('行内注释：只删注释本体（marker 区间原样删除）', () => {
    caps.markers = [{
      owner: 'json', startLineNumber: 1, startColumn: 11, endLineNumber: 1, endColumn: 15,
      message: 'Comments are not allowed in JSON.', severity: 8,
    }];
    const model = fakeModel(['{"a": 1} // c']);
    const acts = jsonProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.map((a: any) => a.title)).toEqual(['删除注释']);
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('');
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 11, endLineNumber: 1, endColumn: 15 });
  });

  it('整行只剩注释：连同行尾换行一并删（不留空行）', () => {
    caps.markers = [{
      owner: 'json', startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 6,
      message: 'Comments are not allowed in JSON.', severity: 8,
    }];
    const model = fakeModel(['{"a": 1,', '// c', '"b": 2}']);
    const acts = jsonProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.map((a: any) => a.title)).toEqual(['删除注释']);
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe('');
    expect(te.range).toEqual({ startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 1 });
  });

  it('末行整行注释：无换行可吞，删到行尾', () => {
    caps.markers = [{
      owner: 'json', startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 5,
      message: 'Comments are not allowed in JSON.', severity: 8,
    }];
    const model = fakeModel(['{"a": 1,', '// c']);
    const acts = jsonProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.map((a: any) => a.title)).toEqual(['删除注释']);
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.range).toEqual({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 5 });
  });

  it('跨行块注释：只删注释区间本体（不吞行）', () => {
    caps.markers = [{
      owner: 'json', startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 3,
      message: 'Comments are not allowed in JSON.', severity: 8,
    }];
    const model = fakeModel(['{ /* c', '*/ "a": 1}']);
    const acts = jsonProvider().provideCodeActions(model, RANGE).actions;
    expect(acts.map((a: any) => a.title)).toEqual(['删除注释']);
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 3 });
  });
});
