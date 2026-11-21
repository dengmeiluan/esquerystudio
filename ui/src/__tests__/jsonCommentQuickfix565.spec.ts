/* 五百六十五批件①：注释 quickfix 复活（自扫注释范围，不强依赖 diagnostics）。
 *  背景：MonacoEditor.vue setDiagnosticsOptions({ allowComments: true, comments: 'ignore' })，
 *  JSON worker 永不产注释 marker——561 批在 monacoJsonQuickFix 写的「Comments are not
 *  allowed → 删除注释」quickfix 是死代码（无 lint 源）。 jsonc 抽出 findCommentRanges
 *  （字符串感知扫描单源），json provider 对当前模型自扫注释范围，有注释即出「删除注释」。
 *  锁面：
 *   A findCommentRanges：字符串内 // 不误报（URL/转义引号内）、// 与块注释区间正确、
 *     跨行块注释、未闭合块注释钳制；
 *   B stripJsonComments 与 findCommentRanges 同源重构后行为等价；
 *   C json provider 自扫：注释行出「删除注释」且 edit range 正确（独占整行连行删；
 *     行内尾注释删区间本体）；无注释零 action；fake model 缺三件套容错零 action；
 *     已有 comments marker 同区间不重复出 action（561 分支保留零扰动）。 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const caps = vi.hoisted(() => ({
  calls: [] as string[],
  provider: null as any,
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
    getModelMarkers: () => caps.markers,
  },
}));

import { ensureJsonQuickFixes } from '../utils/monacoJsonQuickFix';
import { findCommentRanges, stripJsonComments } from '../utils/jsonc';

const URI = { toString: () => 'inmemory://test/9' };

/** 多行文档 fake model：modelFullText 三件套齐备（自扫通道激活形态） */
function fakeModelLines(lines: string[]) {
  return {
    uri: URI,
    getValue: () => lines.join('\n'),
    getLineContent: (ln: number) => lines[ln - 1],
    getLineCount: () => lines.length,
    getLineMaxColumn: (ln: number) => lines[ln - 1].length + 1,
    getValueInRange: (r: any) => lines[r.startLineNumber - 1].slice(r.startColumn - 1, r.endColumn - 1),
  };
}

/** 单行 fake model（既有 spec 形态：无 getValue/无三件套——自扫须容错零 action） */
function fakeModel(line: string) {
  return {
    uri: URI,
    getValueInRange: (r: any) => line.slice(r.startColumn - 1, r.endColumn - 1),
  };
}

const RANGE_ALL = { startLineNumber: 1, startColumn: 1, endLineNumber: 99, endColumn: 1 };

describe('五百六十五批件① A：findCommentRanges 字符串感知扫描', () => {
  it('字符串内 // 不误报（URL / 简单串），零注释零区间', () => {
    expect(findCommentRanges('{"url": "http://x/a"}')).toEqual([]);
    expect(findCommentRanges('{"a": "// not comment"}')).toEqual([]);
    expect(findCommentRanges('{"a": 1}')).toEqual([]);
  });

  it('转义引号内的 // 不误报（\\\" 后仍处于字符串态）', () => {
    expect(findCommentRanges('{"a": "he said \\"// ok\\""}')).toEqual([]);
  });

  it('// 行注释区间正确（止于换行前），块注释区间含定界符', () => {
    const t1 = '{"a": 1 // tail\n}';
    expect(findCommentRanges(t1)).toEqual([{ start: 8, end: 15 }]);
    const t2 = '{ /* c */ "a": 1 }';
    expect(findCommentRanges(t2)).toEqual([{ start: 2, end: 9 }]);
  });

  it('跨行块注释区间跨行；未闭合块注释钳制到文末', () => {
    const t3 = '{\n/* a\nb */\n"a": 1\n}';
    expect(findCommentRanges(t3)).toEqual([{ start: 2, end: 11 }]);
    const t4 = '{"a": 1} /* open';
    const rs = findCommentRanges(t4);
    expect(rs.length).toBe(1);
    expect(rs[0]!.start).toBe(9);
    expect(rs[0]!.end).toBe(t4.length);
  });

  it('stripJsonComments 同源重构行为等价（字符串内 // 保留、注释剥离）', () => {
    expect(stripJsonComments('{"url": "http://x"} /* c */')).toBe('{"url": "http://x"} ');
    expect(stripJsonComments('{\n// lead\n"a": 1\n}')).toBe('{\n\n"a": 1\n}');
    expect(stripJsonComments('{"a": 1}')).toBe('{"a": 1}');
  });
});

describe('五百六十五批件① C：json provider 自扫注释 quickfix', () => {
  beforeAll(() => { ensureJsonQuickFixes(); });
  beforeEach(() => { caps.markers = []; });

  it('独占整行的行内注释：出「删除注释」且 edit 连整行与行尾换行一并删', () => {
    const model = fakeModelLines(['{', '  // chalk', '  "a": 1', '}']);
    const list = caps.provider.provideCodeActions(model, RANGE_ALL);
    const del = list.actions.filter((a: any) => a.title === '删除注释');
    expect(del.length).toBe(1);
    const edit = del[0].edit.edits[0].textEdit;
    expect(edit.range).toEqual({ startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 1 });
    expect(edit.text).toBe('');
  });

  it('行内尾注释（同行有代码）：删注释区间本体，不动代码', () => {
    const model = fakeModelLines(['{', '  "a": 1 // tail', '}']);
    const list = caps.provider.provideCodeActions(model, RANGE_ALL);
    const del = list.actions.filter((a: any) => a.title === '删除注释');
    expect(del.length).toBe(1);
    const edit = del[0].edit.edits[0].textEdit;
    /* 注释本体 '// tail' 在第 2 行列 10-17（1 基） */
    expect(edit.range).toEqual({ startLineNumber: 2, startColumn: 10, endLineNumber: 2, endColumn: 17 });
    expect(edit.text).toBe('');
  });

  it('无注释文档且无 marker：零 action（既有行为不漂移）', () => {
    const list = caps.provider.provideCodeActions(fakeModelLines(['{', '  "a": 1', '}']), RANGE_ALL);
    expect(list.actions).toEqual([]);
  });

  it('fake model 缺 modelFullText 三件套（既有单行形态）：容错零 action', () => {
    const list = caps.provider.provideCodeActions(fakeModel('{ // x }'), RANGE_ALL);
    expect(list.actions).toEqual([]);
  });

  it('已有 comments marker 同区间：561 分支出 action、自扫不重复（去重）', () => {
    caps.markers = [{
      startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 12,
      message: 'Comments are not allowed in JSON', severity: 8, owner: 'json',
    }];
    const model = fakeModelLines(['{', '  // chalk', '  "a": 1', '}']);
    const list = caps.provider.provideCodeActions(model, RANGE_ALL);
    const del = list.actions.filter((a: any) => a.title === '删除注释');
    expect(del.length).toBe(1);
  });
});
