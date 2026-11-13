/**
 * 五百六十三批·用户实报③「文档 diff 只改一个字段变更超多」:LCS 行对齐 diff 纯函数锁。
 * 原按下标硬对齐在任意位置插入一行后全量错位(一行真实变更放大成整篇 -/+)。
 */
import { describe, it, expect } from 'vitest';
import { lcsDiffLines } from '../utils/lcsDiff';

const lines = (...xs: string[]) => xs;

describe('563 实报③:lcsDiffLines 行对齐(真实变更不再放大)', () => {
  it('中间插入一行:后续行对齐为 eq(不再全量错位)', () => {
    const a = lines('a', 'b', 'c', 'd');
    const b = lines('a', 'b', 'X', 'c', 'd');
    const out = lcsDiffLines(a, b);
    expect(out.filter(l => l.op === 'add')).toEqual([{ op: 'add', tx: 'X' }]);
    expect(out.filter(l => l.op === 'del')).toEqual([]);
    expect(out.filter(l => l.op === 'eq').length).toBe(4);
  });
  it('文档场景:数组加一个元素,del 恰 1 行且后续行不再错位——用户实报形态', () => {
    const a = lines('{', '  "bondUniCodes": [],', '  "deleted": 0,', '  "tagTypes": [', '  ]', '}');
    const b = lines('{', '  "bondUniCodes": [', '    2000020261', '  ],', '  "deleted": 0,', '  "tagTypes": [', '  ]', '}');
    const out = lcsDiffLines(a, b);
    const dels = out.filter(l => l.op === 'del').map(l => l.tx.trim());
    expect(dels).toEqual(['"bondUniCodes": [],']);
    expect(out.filter(l => l.op === 'add').map(l => l.tx.trim())).toEqual(['"bondUniCodes": [', '2000020261', '],']);
    /* 错位根治证据:最后一个 del 之后零 del(后续 add=数组展开的合法新增;deleted/tagTypes/
       闭合括号这些未动行不再被误判成 del+add 成对) */
    const ops = out.map(l => l.op);
    expect(ops.slice(ops.lastIndexOf('del') + 1).every(o => o !== 'del')).toBe(true);
  });
  it('空对非空=全 add;非空对空=全 del;完全相同=全 eq', () => {
    expect(lcsDiffLines([], ['x']).every(l => l.op === 'add')).toBe(true);
    expect(lcsDiffLines(['x'], []).every(l => l.op === 'del')).toBe(true);
    expect(lcsDiffLines(['a', 'b'], ['a', 'b']).every(l => l.op === 'eq')).toBe(true);
  });
});
