/** ux2 Task 4：JSON quick fix CodeActionProvider（全仓首注册）。
 *  - 528 →「键加双引号」：textEdit 包裹、isPreferred、diagnostics 回挂、幂等剥壳（已带半个引号不产双引号）；
 *  - 519 →「删除尾逗号」：textEdit 空串、不设 isPreferred；
 *  - 2.6.0 Task 10：514 Expected comma →「补逗号」（修复点=上一非空行行尾零宽插入，不设 isPreferred）；
  *    513=PropertyExpected 负向钉（误配会在双逗号场景越修越坏）；514 {value} 归一形态；
 *    528 剥壳扩单引号（'match → "match"；值位单引号不做——json LS 报 Value expected，range 不覆盖串本体）；
 *  - 行不相交 marker 不出 action；getModelMarkers 过滤面钉死 { resource, owner:'json' }；
 *  - code 联合类型 {value} 归一 + code 缺席 message 兜底；无关 marker 不出；
 *  - ensureJsonQuickFixes 模块级幂等（二次调用零重复注册）。
 *  stub：vi.hoisted caps + editor.api mock（与 monacoLanguages.spec 同范式）。 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const caps = vi.hoisted(() => ({
  calls: [] as string[],
  provider: null as any,
  filter: null as any,
  markers: [] as any[],
}));

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  languages: {
    registerCodeActionProvider: (lang: string, p: any) => {
      caps.calls.push(lang);
      caps.provider = p;
      return { dispose() {} };
    },
  },
  editor: {
    getModelMarkers: (filter: any) => { caps.filter = filter; return caps.markers; },
  },
}));

import { ensureJsonQuickFixes } from '../utils/monacoJsonQuickFix';

const URI = { toString: () => 'inmemory://test/1' };

/** 单行文档 fake model：getValueInRange 按 1 基列切片（marker range 当 IRange 用） */
function fakeModel(line: string) {
  return {
    uri: URI,
    getValueInRange: (r: any) => line.slice(r.startColumn - 1, r.endColumn - 1),
  };
}

/** 多行文档 fake model：补 getLineContent（513 修复点计算用） */
function fakeModelLines(lines: string[]) {
  return {
    uri: URI,
    getValueInRange: (r: any) => lines[r.startLineNumber - 1].slice(r.startColumn - 1, r.endColumn - 1),
    getLineContent: (ln: number) => lines[ln - 1],
    getLineCount: () => lines.length,
  };
}

function marker(patch: Record<string, any>) {
  return {
    startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 7,
    message: '', severity: 8, owner: 'json', ...patch,
  };
}

/* 覆盖整行的触发选区（provideCodeActions 第二参） */
const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 30 };

describe('monacoJsonQuickFix', () => {
  beforeAll(() => { ensureJsonQuickFixes(); });
  beforeEach(() => { caps.markers = []; caps.filter = null; });

  it('注册面：json 恰注册一次（ensureJsonQuickFixes 幂等，二次调用零重复）', () => {
    ensureJsonQuickFixes();
    expect(caps.calls).toEqual(['json']);
    expect(caps.provider).toBeTruthy();
  });

  it('528 →「键加双引号」：textEdit 包裹、isPreferred、diagnostics 回挂、过滤面 owner=json', () => {
    /* 文档 `{match: 1}`：裸键 match 占列 2-7（1 基） */
    const m = marker({ message: 'Property keys must be doublequoted', code: '528' });
    caps.markers = [m];
    const list = caps.provider.provideCodeActions(fakeModel('{match: 1}'), RANGE);
    expect(caps.filter, 'getModelMarkers 必须按 owner json 过滤（es-dsl-lint marker 天然隔开）')
      .toEqual({ resource: URI, owner: 'json' });
    expect(list.actions.length).toBe(1);
    const a = list.actions[0];
    expect(a.title).toBe('键加双引号');
    expect(a.kind).toBe('quickfix');
    expect(a.isPreferred).toBe(true);
    expect(a.diagnostics).toEqual([m]);
    const edit = a.edit.edits[0];
    expect(edit.resource).toBe(URI);
    expect(edit.textEdit.range).toBe(m);
    expect(edit.textEdit.text, 'getValueInRange 切片出 match 后包裹').toBe('"match"');
  });

  it('528 幂等剥壳：marker range 已含半个引号（"match）→ 先剥再裹不产双引号', () => {
    const m = marker({ message: 'Property keys must be doublequoted', code: '528', startColumn: 2, endColumn: 8 });
    caps.markers = [m];
    /* 文档 `{"match: 1}`：列 2-8 切片出 '"match' */
    const a = caps.provider.provideCodeActions(fakeModel('{"match: 1}'), RANGE).actions[0];
    expect(a.edit.edits[0].textEdit.text).toBe('"match"');
  });

  it('528 键内含双引号/反斜杠时必须转义（否则修复产出非法 JSON）(1432)', () => {
    /* 单引号壳内嵌双引号：{'a"b': 1} —— 切片 = 'a"b'（1 基列 2..7） */
    const m1 = marker({ message: 'Property keys must be doublequoted', code: '528', startColumn: 2, endColumn: 7 });
    caps.markers = [m1];
    const a1 = caps.provider.provideCodeActions(fakeModel('{\'a"b\': 1}'), RANGE).actions[0];
    expect(a1.edit.edits[0].textEdit.text).toBe('"a\\"b"');

    /* 键内含反斜杠：{'a\b': 1} → 反斜杠要成对，否则 \" 会被读成转义引号 */
    const m2 = marker({ message: 'Property keys must be doublequoted', code: '528', startColumn: 2, endColumn: 7 });
    caps.markers = [m2];
    const a2 = caps.provider.provideCodeActions(fakeModel('{\'a\\b\': 1}'), RANGE).actions[0];
    expect(a2.edit.edits[0].textEdit.text).toBe('"a\\\\b"');

    /* 负控：普通裸键不受影响（不多加反斜杠） */
    const m3 = marker({ message: 'Property keys must be doublequoted', code: '528', startColumn: 2, endColumn: 7 });
    caps.markers = [m3];
    const a3 = caps.provider.provideCodeActions(fakeModel('{match: 1}'), RANGE).actions[0];
    expect(a3.edit.edits[0].textEdit.text).toBe('"match"');
  });

  it('519（code 形态 {value} 归一）→「删除尾逗号」：textEdit 空串、不设 isPreferred', () => {
    const m = marker({ message: 'Trailing comma', code: { value: '519' }, startColumn: 9, endColumn: 10 });
    caps.markers = [m];
    const list = caps.provider.provideCodeActions(fakeModel('{"a": 1,}'), RANGE);
    expect(list.actions.length).toBe(1);
    expect(list.actions[0].title).toBe('删除尾逗号');
    expect(list.actions[0].edit.edits[0].textEdit.text).toBe('');
    expect(list.actions[0].isPreferred, '519 不设首选').toBeUndefined();
  });

  it('行不相交 marker 不出 action', () => {
    const m = marker({ message: 'Property keys must be doublequoted', code: '528', startLineNumber: 5, endLineNumber: 5 });
    caps.markers = [m];
    expect(caps.provider.provideCodeActions(fakeModel('{match: 1}'), RANGE).actions).toEqual([]);
  });

  it('message 兜底：code 缺席但 message 命中仍出对应 fix；无关 marker 不出', () => {
    const noCode = marker({ message: 'Property keys must be doublequoted' });
    const trailing = marker({ message: 'Trailing comma', startColumn: 9, endColumn: 10 });
    const noise = marker({ message: 'Incorrect type. Expected "number".', code: '500' });
    caps.markers = [noCode, trailing, noise];
    const titles = caps.provider.provideCodeActions(fakeModel('{"a": 1,}'), RANGE)
      .actions.map((a: any) => a.title);
    expect(titles).toEqual(['键加双引号', '删除尾逗号']);
  });

  it('Expected comma →「补逗号」：上一非空行行尾零宽插入，不设 isPreferred（2.6.0）', () => {
    /* 文档：1:{"a": 1  2:  "b": 2}——marker 标在第 2 行键位（期望逗号处）。
       触发选区覆盖 1-2 行：行相交过滤要求选区与 marker 行相交（模拟在 marker 行触发）。 */
    const m = marker({ message: 'Expected comma', code: '514', startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 6 });
    caps.markers = [m];
    const model = fakeModelLines(['{"a": 1', '  "b": 2}']);
    const range2 = { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 30 };
    const list = caps.provider.provideCodeActions(model, range2);
    const a = list.actions.find((x: any) => x.title === '补逗号');
    expect(a, 'Expected comma 出补逗号 action').toBeTruthy();
    expect(a.kind).toBe('quickfix');
    expect(a.isPreferred, '不设 isPreferred（与 519 同口径防误顶）').toBeUndefined();
    const te = a.edit.edits[0].textEdit;
    expect(te.text).toBe(',');
    /* 修复点：第 1 行行尾（`{"a": 1` 长 7，1 基零宽插列=8） */
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 8 });
  });

  it('513 PropertyExpected 不出「补逗号」（负向钉：前导/双逗号场景误配会越修越坏）', () => {
    const m = marker({ message: 'Property expected', code: '513', startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4 });
    caps.markers = [m];
    const model = fakeModelLines(['{"a": 1,', '  , "b": 2}']);
    const range2 = { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 30 };
    const list = caps.provider.provideCodeActions(model, range2);
    expect(list.actions.find((x: any) => x.title === '补逗号'), '513 绝不出补逗号').toBeUndefined();
  });

  it('514 code {value} 归一形态同出「补逗号」（联合类型防漂移）', () => {
    const m = marker({ message: 'Expected comma', code: { value: '514' }, startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 6 });
    caps.markers = [m];
    const model = fakeModelLines(['{"a": 1', '  "b": 2}']);
    const range2 = { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 30 };
    const a = caps.provider.provideCodeActions(model, range2).actions.find((x: any) => x.title === '补逗号');
    expect(a).toBeTruthy();
    expect(a.edit.edits[0].textEdit.range).toEqual({ startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 8 });
  });

  it('Expected comma 上一非空行跳空白行（修复点落在有内容行尾）', () => {
    const m = marker({ message: 'Expected comma', startLineNumber: 4, startColumn: 3, endLineNumber: 4, endColumn: 6 });
    caps.markers = [m];
    const model = fakeModelLines(['{"a": 1', '', '   ', '  "b": 2}']);
    const range4 = { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 30 };
    const te = caps.provider.provideCodeActions(model, range4).actions
      .find((x: any) => x.title === '补逗号').edit.edits[0].textEdit;
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 8 });
  });

  it('上一行已带逗号时不出「补逗号」（1432：否则补出 ,,，把合法 JSON 改坏）', () => {
    /* 真实退化路径：用户刚补完逗号、marker 还没重建，再点一次就补出 ,, */
    const m = marker({ message: 'Expected comma', startLineNumber: 3, startColumn: 3, endLineNumber: 3, endColumn: 6 });
    caps.markers = [m];
    const model = fakeModelLines(['{', '  "a": 1,', '  "b": 2}', '}']);
    const range3 = { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 30 };
    const titles = caps.provider.provideCodeActions(model, range3).actions.map((x: any) => x.title);
    expect(titles, '已带逗号时不得再补').not.toContain('补逗号');
    /* 负控：把上一行逗号去掉 → 必须重新出现（证明判据打中的是「上一行内容」，
       而不是恰好这次没生成任何 action） */
    const model2 = fakeModelLines(['{', '  "a": 1', '  "b": 2}', '}']);
    const titles2 = caps.provider.provideCodeActions(model2, range3).actions.map((x: any) => x.title);
    expect(titles2, '缺逗号时应给修复').toContain('补逗号');
  });

  it('528 剥壳扩单引号：\'match 键位 → "match"（2.6.0）', () => {
    const m = marker({ message: 'Property keys must be doublequoted', code: '528', startColumn: 2, endColumn: 8 });
    caps.markers = [m];
    const a = caps.provider.provideCodeActions(fakeModel("{'match: 1}"), RANGE).actions[0];
    expect(a.title).toBe('键加双引号');
    expect(a.edit.edits[0].textEdit.text).toBe('"match"');
  });
});
