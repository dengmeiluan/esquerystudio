/**
 * 242 批 P2-8：文档 diff 多目标扩展锁定。
 * 复用 Wave 2 底座 diffDocFields（MISSING 哨兵语义），锁定合并层行为：
 * 1) 双/三文档 → path 并集行表，格级 kind 与行级聚合状态正确；
 * 2) 换基准=换入参重算（same 输入不同基准结果对称）；
 * 3) Markdown 复制含缺席占位 — 与竖线转义。
 */
import { describe, it, expect } from 'vitest';
import { docDiffMulti, docDiffToMarkdown } from '../utils/docDiffMulti';

describe('docDiffMulti（242 批 P2-8）', () => {
  it('双文档：same/changed/only-base/only-target 四态齐备', () => {
    const a = { _id: 'a', _source: { t: 'x', n: 1, keep: 'k', gone: 'g' } };
    const b = { _id: 'b', _source: { t: 'y', n: 1, keep: 'k', born: 'b' } };
    const d = docDiffMulti(a._source, [b._source]);
    const by = Object.fromEntries(d.rows.map(r => [r.path, r]));
    expect(by['t'].status).toBe('changed');
    expect(by['t'].base).toBe('x');
    expect(by['t'].targets[0]).toBe('y');
    expect(by['t'].kinds[0]).toBe('changed');
    expect(by['n'].status).toBe('same');
    expect(by['gone'].status).toBe('only-base');
    expect(by['gone'].kinds[0]).toBe('removed');
    expect(by['born'].status).toBe('only-target');
    expect(by['born'].kinds[0]).toBe('added');
    expect(by['born'].base).toBeUndefined();
    expect(d.same).toBe(2); // n + keep
    expect(d.changed).toBe(1);
    expect(d.onlyBase).toBe(1);
    expect(d.onlyTarget).toBe(1);
  });

  it('三文档：双目标并排，混合态按格级 kinds 保留', () => {
    const a = { t: 'x', m: 1 };
    const b = { t: 'y', m: 2 };
    const c = { t: 'x', m: 1 };
    const d = docDiffMulti(a, [b, c]);
    const by = Object.fromEntries(d.rows.map(r => [r.path, r]));
    /* t：b 侧 changed、c 侧 same → 行级 changed */
    expect(by['t'].kinds).toEqual(['changed', 'same']);
    expect(by['t'].status).toBe('changed');
    /* m：双目标都 changed */
    expect(by['m'].status).toBe('changed');
    expect(by['m'].targets).toEqual([2, 1]);
  });

  it('换基准=换入参重算：only-base/only-target 对称翻转', () => {
    const a = { p: 1, onlyA: 'a' };
    const b = { p: 2, onlyB: 'b' };
    const ab = docDiffMulti(a, [b]);
    const ba = docDiffMulti(b, [a]);
    const byAb = Object.fromEntries(ab.rows.map(r => [r.path, r]));
    const byBa = Object.fromEntries(ba.rows.map(r => [r.path, r]));
    expect(byAb['onlyA'].status).toBe('only-base');
    expect(byBa['onlyA'].status).toBe('only-target');
    expect(byBa['onlyB'].status).toBe('only-base');
    expect(ab.changed).toBe(ba.changed);
  });

  it('嵌套 dot-path：底座 walk 展平后行表路径正确', () => {
    const a = { meta: { author: 'tom', tags: ['x'] } };
    const b = { meta: { author: 'jerry', tags: ['x'] } };
    const d = docDiffMulti(a, [b]);
    const by = Object.fromEntries(d.rows.map(r => [r.path, r]));
    expect(by['meta.author'].status).toBe('changed');
    expect(by['meta.tags'].status).toBe('same');
  });

  it('Markdown：缺席 —、竖线转义、含基准标注', () => {
    const d = docDiffMulti({ p: 'a|b' }, [{ q: 1 }]);
    const md = docDiffToMarkdown('A', ['B'], d);
    expect(md).toContain('| 字段 | A（基准） | B |');
    expect(md).toContain('a\\|b');
    expect(md).toContain('—');
  });
});
