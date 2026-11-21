/* W1：DSL ↔ 节点树往返无损硬契约。设计文档 §3.1：
   serialize(parse(x)) 必须与 x 深度相等（键序除外）——这是零降级的数学保证。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, parseQueryNode, serQueryNode } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

describe('queryAst 往返无损', () => {
  roundTrip('match_all 空体', { query: { match_all: {} } });
  roundTrip('match_all 带参数', { query: { match_all: { boost: 1.2 } } });
  roundTrip('term 简写', { query: { term: { status: 'active' } } });
  roundTrip('term 完整体', { query: { term: { status: { value: 'active', boost: 2 } } } });
  roundTrip('match 简写', { query: { match: { title: '债券' } } });
  roundTrip('match 带参数', { query: { match: { title: { query: '债券', operator: 'and', fuzziness: 'AUTO' } } } });
  roundTrip('range', { query: { range: { createTime: { gte: 'now-7d/d', lte: 'now' } } } });
  roundTrip('terms', { query: { terms: { tag: ['a', 'b'] } } });
  roundTrip('exists', { query: { exists: { field: 'title' } } });
  roundTrip('bool 数组形态', { query: { bool: { must: [{ term: { a: 1 } }], filter: [{ range: { d: { gte: 1 } } }] } } });
  roundTrip('bool 单子句对象形态', { query: { bool: { must: { term: { a: 1 } } } } });
  roundTrip('bool 带 minimum_should_match', { query: { bool: { should: [{ match: { t: 'x' } }], minimum_should_match: 2 } } });
  roundTrip('bool 三层嵌套', { query: { bool: { must: [{ bool: { should: [{ bool: { must_not: [{ term: { x: 1 } }] } }] } }] } } });
  roundTrip('nested 包装', { query: { nested: { path: 'items', query: { term: { 'items.sku': 'A' } }, score_mode: 'avg' } } });
  roundTrip('script_score 复合包装（985 起一等算子，仍无损）', { query: { script_score: { query: { match_all: {} }, script: { source: 'return 1;' } } } });
  roundTrip('query 多键（非法但须无损）', { query: { match_all: {}, term: { a: 1 } } });
  roundTrip('size/from', { query: { match_all: {} }, size: 20, from: 40 });
  roundTrip('未知顶层键进 extras', { query: { match_all: {} }, track_total_hits: true, collapse: { field: 'uid' } });
  roundTrip('exists 非 string field 落 raw', { query: { exists: { field: 123 } } });
  roundTrip('exists 非对象 body 落 raw', { query: { exists: 'title' } });
  roundTrip('exists 非 field 键落 raw', { query: { exists: { foo: 1 } } });
  roundTrip('match_all 非对象 body 落 raw', { query: { match_all: 5 } });
  roundTrip('bool 空 occur 数组保留', { query: { bool: { must: [] } } });
  roundTrip('query 为 null 无损', { query: null });
  roundTrip('extras 原型链键名不吞', { query: { match_all: {} }, toString: 1 });

  it('非对象输入 ok:false', () => {
    expect(parseTree([1]).ok).toBe(false);
    expect(parseTree('x').ok).toBe(false);
    expect(parseTree(null).ok).toBe(false);
  });

  it('裸叶子查询视为根节点', () => {
    const n = parseQueryNode({ wildcard: { name: 'qa_*' } });
    expect(serQueryNode(n)).toEqual({ wildcard: { name: 'qa_*' } });
  });
});

describe('条件临时停用(disabled)序列化剥离', () => {
  const dsl = { query: { bool: { must: [{ term: { a: '1' } }, { term: { b: '2' } }] } } };

  it('disabled 叶子不参与序列化', () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const root = r.tree.root as any;
    const mustArr = root.children.filter((c: any) => c.occur === 'must');
    mustArr[mustArr.length - 1].node.disabled = true;
    const out = serializeTree(r.tree) as any;
    expect(out.query.bool.must.length).toBe(1);           // 停用条件被剥离
    expect(JSON.stringify(out.query.bool.must)).not.toContain('"b"');
  });

  it('重新启用后序列化恢复', () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const root = r.tree.root as any;
    const must = root.children.find((c: any) => c.occur === 'must');
    must.node.disabled = true;
    must.node.disabled = false;
    const out = serializeTree(r.tree) as any;
    expect(out.query.bool.must.length).toBe(2);           // 恢复后回序列化
  });
});
