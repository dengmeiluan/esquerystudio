/**
 * 三百九十八批：queryAst 条件树解析/序列化纯函数直测——W1 设计迭代核心
 * （400+ 行仅被 treeDslSync396 从边角覆盖）。四契约：非对象根拒绝/
 * 全要素往返（query+size+from+sort+_source+highlight+aggs，extras 保真）/
 * bool 嵌套递归（must/should/minimum_should_match）/叶子三态（term/match/range）。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, emptyTree } from '../queryAst';

const roundtrip = (dsl: Record<string, unknown>) => {
  const r = parseTree(dsl);
  if (!r.ok) return { ok: false as const, reason: r.reason };
  return { ok: true as const, out: serializeTree(r.tree) };
};

describe('queryAst 解析/序列化（398 批）', () => {
  it('非对象根拒绝并给 reason', () => {
    for (const bad of [null, 'str', 42, []]) {
      const r = parseTree(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.reason).toContain('JSON 对象');
    }
  });

  it('叶子三态解析回读：term/match/range', () => {
    for (const [op, body] of [
      ['term', { status: 'A' }],
      ['match', { title: 'hello' }],
      ['range', { age: { gte: 1, lte: 9 } }],
    ] as const) {
      const r = roundtrip({ query: { [op]: body } });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(JSON.stringify(r)).toContain(op);
    }
  });

  it('bool 嵌套递归：must/should/minimum_should_match 往返保真', () => {
    const dsl = {
      query: {
        bool: {
          must: [{ term: { a: 1 } }],
          should: [{ term: { b: 2 } }, { match: { c: 'x' } }],
          must_not: [{ range: { d: { gt: 5 } } }],
          minimum_should_match: 1,
        },
      },
      size: 20,
      from: 40,
    };
    const r = roundtrip(dsl);
    expect(r.ok).toBe(true);
    expect(r.ok && r.out).toEqual(dsl);
  });

  it('全要素往返：sort/_source/highlight/aggs 保真，未知键入 extras 不丢', () => {
    const dsl = {
      query: { match_all: {} },
      sort: [{ ts: 'desc' }],
      _source: ['a', 'b'],
      highlight: { fields: { a: {} } },
      aggs: { g: { terms: { field: 'x' } } },
      track_total_hits: true,
    };
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tree.sort, '解析为内部形态（id/field/form）').not.toBeNull();
      expect(r.tree.source).toBeDefined();
      expect(r.tree.highlight).toBeDefined();
      expect(r.tree.aggs).toBeDefined();
      expect(r.tree.aggKey).toBe('aggs');
      /* 998 批起查询体参数一等分账：track_total_hits 等在册键进 searchParams
         （具名控件可编辑），不再落 extras；未在册键仍走 extras 保真 */
      expect(r.tree.searchParams, '在册查询体参数进 searchParams').toEqual({ track_total_hits: true });
      expect(r.tree.extras, '未在册顶层键保真（不丢不炸）').toEqual({});
    }
    /* 最终序列化输出与输入 DSL 深等值（form 记忆原形态还原） */
    expect(roundtrip(dsl)).toEqual({ ok: true, out: dsl });
  });

  it('emptyTree 基态：全 null + searchParams/extras 空', () => {
    const t = emptyTree();
    expect(t.root).toBeNull();
    expect(t.sort).toBeNull();
    expect(t.source).toBeNull();
    expect(t.aggs).toBeNull();
    expect(t.highlight).toBeNull();
    expect(t.searchParams, '998：查询体参数分账容器基态为空对象').toEqual({});
    expect(t.extras).toEqual({});
  });
});
