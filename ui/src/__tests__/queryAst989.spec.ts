/* 989 批：构建树能力续作三线之一（AST 层）——suggest 顶层键一等化。
   形态：{ sugName: { text, <suggester 类型键>: {…} } }，text 是高频骨架键单独投影，
   其余键（term/phrase/completion/prefix 等 suggester 类型键）整体落 rest 原样；
   任一项 body 非对象 → 整键落 extras 零丢失。往返无损契约与 985/987 同构。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, emptyTree } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

describe('989 suggest 一等解析往返无损', () => {
  roundTrip('term 建议', { suggest: { mySuggest: { text: 'tring', term: { field: 'body' } } } });
  roundTrip('phrase 建议', { suggest: { ph: { text: 'tring', phrase: { field: 'body', size: 3 } } } });
  roundTrip('completion 建议（prefix 对象形态）', { suggest: { comp: { prefix: { value: 'tri', skip_duplicates: true }, completion: { field: 'title' } } } });
  roundTrip('completion 建议（prefix 字符串形态）', { suggest: { comp: { prefix: 'tri', completion: { field: 'title' } } } });
  roundTrip('多建议项混排', { suggest: { a: { text: 'x', term: { field: 'f' } }, b: { completion: { field: 't', prefix: 'y' } } } });
  roundTrip('缺 text 形态', { suggest: { comp: { completion: { field: 't' } } } });
  roundTrip('全局 text + 项级覆盖', { suggest: { text: 'global', a: { text: 'own', term: { field: 'f' } } } });
  roundTrip('仅全局 text 无建议项', { suggest: { text: 'g' } });

  it('parse 投影：name/text/hasText/rest 分账', () => {
    const r = parseTree({ suggest: { my: { text: 'tw', term: { field: 'f', size: 2 } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.suggest).not.toBeNull();
    expect(r.tree.suggest!.items.length).toBe(1);
    const it0 = r.tree.suggest!.items[0];
    expect(it0.name).toBe('my');
    expect(it0.text).toBe('tw');
    expect(it0.hasText).toBe(true);
    expect(it0.rest).toEqual({ term: { field: 'f', size: 2 } });
  });
  it('全局 text 投影为 globalText（与建议项同名层，parse 特判不吞项）', () => {
    const r = parseTree({ suggest: { text: 'g', a: { term: { field: 'f' } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.suggest!.hasGlobalText).toBe(true);
    expect(r.tree.suggest!.globalText).toBe('g');
    expect(r.tree.suggest!.items.map(i => i.name)).toEqual(['a']);
  });
  it('全局顶层 text 不进项级（原样保留在 rest 外？——顶层 text 是 suggest 级参数）', () => {
    const r = parseTree({ suggest: { text: 'g', a: { term: { field: 'f' } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual({ suggest: { text: 'g', a: { term: { field: 'f' } } } });
  });
  it('畸形：项 body 非对象整键落 extras 零丢失', () => {
    const r = parseTree({ suggest: { bad: 'str' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.suggest).toBeNull();
    expect(r.tree.extras.suggest).toEqual({ bad: 'str' });
    expect(serializeTree(r.tree)).toEqual({ suggest: { bad: 'str' } });
  });
  it('畸形：suggest 非对象整键落 extras', () => {
    const r = parseTree({ suggest: ['x'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.suggest).toBeNull();
    expect(r.tree.extras.suggest).toEqual(['x']);
  });
  it('空树字段归位：emptyTree().suggest === null', () => {
    expect(emptyTree().suggest).toBeNull();
  });
});
