import { describe, it, expect } from 'vitest';
import { parseSqlErrorPos } from '../sqlErrorPos';

/* 1109：ES SQL 错误锚点解析——只认 1-based 正整数，取首个命中，非法/缺失零锚点。 */
describe('1109 parseSqlErrorPos', () => {
  it('ES SQL 主形态 line X:Y', () => {
    expect(parseSqlErrorPos('line 1:8: Unknown column [bond_cod]')).toEqual({ line: 1, column: 8 });
    expect(parseSqlErrorPos('SQLParseException: line 12:30: mismatched input')).toEqual({ line: 12, column: 30 });
    expect(parseSqlErrorPos('line 3:5')).toEqual({ line: 3, column: 5 });
  });

  it('大小写/空格变体与 column 形态', () => {
    expect(parseSqlErrorPos('LINE 2 : 4: oops')).toEqual({ line: 2, column: 4 });
    expect(parseSqlErrorPos('line 3, column 7: bad')).toEqual({ line: 3, column: 7 });
    expect(parseSqlErrorPos('line 3 column 7')).toEqual({ line: 3, column: 7 });
  });

  it('取首个错误锚点（ES 只报首个），不取后文数字', () => {
    expect(parseSqlErrorPos('line 1:8: Unknown column; line 2:2: other')).toEqual({ line: 1, column: 8 });
  });

  it('JSON 串化后的字面 \\n 形态（错误面板 reason 常见）', () => {
    expect(parseSqlErrorPos('{"error":{"reason":"Found 1 problem\\nline 1:8: Unknown function [X]"}}'))
      .toEqual({ line: 1, column: 8 });
    expect(parseSqlErrorPos('Found 1 problem\nline 4:9: Unknown column [x]')).toEqual({ line: 4, column: 9 });
  });

  it('无锚点/词尾误命中/0 值一律 null', () => {
    expect(parseSqlErrorPos('')).toBeNull();
    expect(parseSqlErrorPos('no position here')).toBeNull();
    expect(parseSqlErrorPos('deadline 5:6')).toBeNull();
    expect(parseSqlErrorPos('online 5:6')).toBeNull();
    expect(parseSqlErrorPos('line 0:3: bad')).toBeNull();
    expect(parseSqlErrorPos('line 4:0: bad')).toBeNull();
  });
});
