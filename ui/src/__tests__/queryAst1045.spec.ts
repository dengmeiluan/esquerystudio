/* 1045 批：双向映射保真补口——合法但少见的 DSL 形态不再被静默改写或降级 raw。
  覆盖 1009 审计发现的 P0/P1：
  ① 空 bool 不是「全部停用」（语义翻转）；② 必填数组键空数组保键；
  ③ 字段键 + 兄弟参数（terms/boost、term/_name）；④ function_score 无 query；
  ⑤ geo 兄弟参数 / 串坐标回认 location；⑥ highlight 无 fields 不注入 {}；
  ⑦ _source 非数组/扩展键保真；⑧ named/none 主值键缺席不写 undefined。 */
import { describe, it, expect } from 'vitest';
import {
  parseQueryNode, serQueryNode, parseTree, serializeTree, parseTree as parse,
  countUnfilledLeaves, firstUnfilledLeafId,
} from '../utils/queryAst';

const roundTrip = (q: unknown) => {
  const n = parseQueryNode(q);
  return serQueryNode(n);
};

describe('1045 双向映射保真', () => {
  it('空 bool 保形（不当作全部停用删除）', () => {
    const q = { bool: { should: [], minimum_should_match: 1 } };
    expect(roundTrip(q)).toStrictEqual(q);
    const nested = { bool: { must: [{ bool: { should: [], minimum_should_match: '100%' } }] } };
    expect(roundTrip(nested)).toStrictEqual(nested);
  });

  it('多子查询必填数组键空数组保键', () => {
    const q = { dis_max: { queries: [], tie_breaker: 0.1 } };
    expect(roundTrip(q)).toStrictEqual(q);
    const near = { span_near: { clauses: [], slop: 1, in_order: true } };
    expect(roundTrip(near)).toStrictEqual(near);
  });

  it('terms 字段键 + boost 兄弟参数 → 富叶且往返一致', () => {
    const q = { terms: { tag: ['a', 'b'], boost: 2 } };
    const n = parseQueryNode(q);
    expect(n).toMatchObject({ type: 'leaf', op: 'terms', field: 'tag', value: ['a', 'b'], params: { boost: 2 } });
    expect(roundTrip(q)).toStrictEqual(q);
  });

  it('term 展开形态的 _name 保留（命中归因参数）', () => {
    const q = { term: { 'company.keyword': { value: '示例', _name: 'by_company' } } };
    const n = parseQueryNode(q);
    expect(n.type === 'leaf' && n.field === 'company.keyword' && n.params._name === 'by_company').toBe(true);
    expect(roundTrip(q)).toStrictEqual(q);
  });

  it('function_score 无 query 只用 functions 时结构化，不伪造 match_all', () => {
    const q = { function_score: { functions: [{ random_score: {} }], boost_mode: 'replace' } };
    const n = parseQueryNode(q);
    expect(n).toMatchObject({ type: 'wrap', op: 'function_score', child: null });
    expect(roundTrip(q)).toStrictEqual(q);
  });

  it('geo_bounding_box validation_method 兄弟键结构化', () => {
    const q = {
      geo_bounding_box: {
        location: { top_left: { lat: 41, lon: -71 }, bottom_right: { lat: 40, lon: -70 } },
        validation_method: 'IGNORE_MALFORMED',
      },
    };
    const n = parseQueryNode(q);
    expect(n).toMatchObject({ type: 'leaf', op: 'geo_bounding_box', field: 'location', params: { validation_method: 'IGNORE_MALFORMED' } });
    expect(roundTrip(q)).toStrictEqual(q);
  });

  it('highlight 无 fields 时不注入空 fields', () => {
    const treeOf = (dsl: unknown) => {
      const r = parse(dsl);
      if (!r.ok) throw new Error(r.reason);
      return r.tree;
    };
    expect(serializeTree(treeOf({ highlight: { pre_tags: ['<b>'], post_tags: ['</b>'] } })))
      .toStrictEqual({ highlight: { pre_tags: ['<b>'], post_tags: ['</b>'] } });
    expect(serializeTree(treeOf({ highlight: { fields: { title: {} }, pre_tags: ['<b>'] } })))
      .toStrictEqual({ highlight: { pre_tags: ['<b>'], fields: { title: {} } } });
  });

  it('_source 非数组/扩展键保真', () => {
    const treeOf = (dsl: unknown) => {
      const r = parse(dsl);
      if (!r.ok) throw new Error(r.reason);
      return r.tree;
    };
    const a = { _source: { includes: 'obj.*' } };
    expect(serializeTree(treeOf(a))).toStrictEqual(a);
    const b = { _source: { includes: ['a'], exclude: ['b'], custom: 1 } };
    expect(serializeTree(treeOf(b))).toStrictEqual(b);
  });

  it('named/none 主值键缺席不写 undefined 占位（对象级严格相等）', () => {
    const q = { template: { source: '{"query":{"match_all":{}}}' } };
    expect(roundTrip(q)).toStrictEqual(q);
    const k = { knn: { field: 'vec', query_vector_builder: { model_id: 'm', model_text: 't' } } };
    expect(roundTrip(k)).toStrictEqual(k);
    const mlt = { percolate: { field: 'q', document: { a: 1 } } };
    expect(roundTrip(mlt)).toStrictEqual(mlt);
  });

  it('顶层 query 空对象仍往返一致', () => {
    const r = parseTree({ query: {} });
    if (!r.ok) throw new Error(r.reason);
    expect(serializeTree(r.tree)).toStrictEqual({ query: {} });
  });
});

describe('1045 未填值条件读数（构建器/执行行同源）', () => {
  it('空串/空对象/空数组算未填；exists 与停用条件不算', () => {
    const r = parseTree({ query: { bool: { must: [
      { term: { a: '' } },
      { range: { b: {} } },
      { terms: { c: [] } },
      { term: { d: 0 } },          // 0 是有效值
      { exists: { field: 'e' } },  // 无值语义
      { term: { f: 'x' } },
    ], must_not: [{ term: { g: '' } }] } } });
    if (!r.ok) throw new Error(r.reason);
    expect(countUnfilledLeaves(r.tree.root)).toBe(4);
    expect(firstUnfilledLeafId(r.tree.root)).toBeTruthy();
  });

  it('停用条件不计入未填', () => {
    const r = parseTree({ query: { bool: { must: [{ term: { a: '' } }] } } });
    if (!r.ok) throw new Error(r.reason);
    const root: any = r.tree.root;
    root.children[0].node.disabled = true;
    expect(countUnfilledLeaves(root)).toBe(0);
    expect(firstUnfilledLeafId(root)).toBeNull();
  });
});
