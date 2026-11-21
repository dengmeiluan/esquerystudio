import { describe, it, expect } from 'vitest';
import { diffDocFields, diffSummary } from '../docDiff';

const kinds = (l: unknown, r: unknown) =>
  Object.fromEntries(diffDocFields(l, r).map(d => [d.path, d.kind]));

describe('diffDocFields：平铺字段', () => {
  it('相同值标 same', () => {
    expect(kinds({ a: 1 }, { a: 1 })).toEqual({ a: 'same' });
  });

  it('值不同标 changed 并带两侧值', () => {
    const d = diffDocFields({ a: 1 }, { a: 2 })[0];
    expect(d).toMatchObject({ path: 'a', kind: 'changed', left: 1, right: 2 });
  });

  it('只在左侧标 removed（B 索引缺这个字段）', () => {
    expect(kinds({ a: 1 }, {})).toEqual({ a: 'removed' });
  });

  it('只在右侧标 added', () => {
    expect(kinds({}, { a: 1 })).toEqual({ a: 'added' });
  });

  it('结果按 path 升序，与输入键序无关', () => {
    expect(diffDocFields({ b: 1, a: 1 }, { a: 1, b: 2 }).map(d => d.path)).toEqual(['a', 'b']);
  });
});

describe('diffDocFields：嵌套与数组', () => {
  it('嵌套对象递归展开为点号路径', () => {
    expect(kinds({ u: { n: 'x', t: 1 } }, { u: { n: 'y', t: 1 } }))
      .toEqual({ 'u.n': 'changed', 'u.t': 'same' });
  });

  it('数组整体比较（内容不同即 changed，不逐元素展开）', () => {
    expect(kinds({ a: [1, 2] }, { a: [1, 3] })).toEqual({ a: 'changed' });
  });

  it('数组内容相同标 same', () => {
    expect(kinds({ a: [1, 2] }, { a: [1, 2] })).toEqual({ a: 'same' });
  });

  it('一侧是对象另一侧是标量标 changed，不递归进去', () => {
    expect(kinds({ a: { b: 1 } }, { a: 'x' })).toEqual({ a: 'changed' });
  });
});

describe('diffDocFields：边界', () => {
  it('null 与缺失区分开：null vs 缺失是 removed，null vs null 是 same', () => {
    expect(kinds({ a: null }, {})).toEqual({ a: 'removed' });
    expect(kinds({ a: null }, { a: null })).toEqual({ a: 'same' });
  });

  it('null vs 有值标 changed', () => {
    expect(kinds({ a: null }, { a: 1 })).toEqual({ a: 'changed' });
  });

  it('两侧都非对象时返回空数组，不抛', () => {
    expect(diffDocFields(null, null)).toEqual([]);
    expect(diffDocFields('x', 'y')).toEqual([]);
  });

  it('一侧 null 一侧对象：对象侧字段全部列为 added/removed', () => {
    expect(kinds(null, { a: 1 })).toEqual({ a: 'added' });
    expect(kinds({ a: 1 }, null)).toEqual({ a: 'removed' });
  });
});

describe('diffSummary', () => {
  it('分类计数正确', () => {
    const d = diffDocFields({ a: 1, b: 1, c: 1 }, { a: 1, b: 2, e: 1 });
    expect(diffSummary(d)).toEqual({ same: 1, changed: 1, removed: 1, added: 1 });
  });
});
