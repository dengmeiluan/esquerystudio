/**
 * 1439：构建器结构操作的双向保证。
 *
 * 单向验证过「解析 → 编辑 → 序列化」，但反向没锁：每个结构操作产出的 DSL 必须
 * 仍能被产品自己的 parseTree 吃下，并且再序列化逐字不变（幂等）。
 *
 * 同时断言操作的**语义**（数量/顺序/嵌套/停用是否真的从查询里消失），
 * 只看文本稳定会把「什么也没做」也判绿。
 */
import { describe, it, expect } from 'vitest';
import {
  parseTree, serializeTree, insertAfter, duplicateNodesByIds, removeNodesByIds,
  setDisabledForIds, groupNodesByIds, moveSibling, type QueryTree,
} from '../utils/queryAst';

const DSL = {
  query: { bool: { must: [{ term: { a: '1' } }, { range: { n: { gte: 1 } } }], should: [{ match: { t: 'x' } }] } },
  sort: [{ n: { order: 'desc' } }], size: 10, aggs: { g: { terms: { field: 'a' } } },
};

function base(): QueryTree {
  const r = parseTree(DSL);
  if (!r.ok) throw new Error('base DSL 解析失败：' + r.reason);
  return r.tree;
}
const mustCount = (dsl: any) => (dsl.query?.bool?.must ?? []).length;
const mustOps = (dsl: any) => (dsl.query?.bool?.must ?? []).map((c: any) => Object.keys(c)[0]);

/** 幂等判据：serialize → parse → serialize 必须逐字一致 */
function assertIdempotent(tree: QueryTree) {
  const dsl = serializeTree(tree);
  const again = parseTree(dsl);
  expect(again.ok, '自家 DSL 必须能被自家解析器吃下：' + JSON.stringify(dsl)).toBe(true);
  if (!again.ok) return dsl;
  expect(serializeTree(again.tree), '再序列化必须逐字不变').toEqual(dsl);
  return dsl;
}

describe('1439 构建器结构操作往返', () => {
  const tree = base();
  const root: any = tree.root;
  const ids = root.children.map((c: any) => c.node.id);

  it('复制条件：多一条、同算子，且往返幂等', () => {
    const next = { ...tree, root: insertAfter(tree.root!, ids[0]) };
    const dsl = assertIdempotent(next);
    expect(mustCount(dsl)).toBe(3);
    expect(mustOps(dsl)[1]).toBe(mustOps(dsl)[0]);
  });

  it('删除条件：少一条、往返幂等', () => {
    const dsl = assertIdempotent({ ...tree, root: removeNodesByIds(tree.root!, new Set([ids[0]])) });
    expect(mustCount(dsl)).toBe(1);
    expect(mustOps(dsl)).toEqual(['range']);
  });

  it('停用：从查询里消失；恢复后原样回来（往返各一次都幂等）', () => {
    const off = { ...tree, root: setDisabledForIds(tree.root!, new Set([ids[0]]), true) };
    const dslOff = assertIdempotent(off);
    expect(mustCount(dslOff), '停用的条件不应出现在发送的 DSL 里').toBe(1);
    expect(mustOps(dslOff)).toEqual(['range']);

    const back = { ...off, root: setDisabledForIds(off.root!, new Set([ids[0]]), false) };
    const dslBack = assertIdempotent(back);
    expect(mustCount(dslBack)).toBe(2);
    expect(mustOps(dslBack)).toEqual(['term', 'range']);
  });

  it('组合：两条 must 收进新的 bool，往返幂等', () => {
    const dsl: any = assertIdempotent({ ...tree, root: groupNodesByIds(tree.root!, new Set([ids[0], ids[1]])) });
    expect(mustCount(dsl)).toBe(1);
    expect(Object.keys(dsl.query.bool.must[0])).toEqual(['bool']);
    expect(dsl.query.bool.must[0].bool.must.length).toBe(2);
  });

  it('排序移动：顺序真的变了，往返幂等', () => {
    const dsl = assertIdempotent({ ...tree, root: moveSibling(tree.root!, ids[0], 1) });
    expect(mustOps(dsl)).toEqual(['range', 'term']);
  });

  it('其它顶层键不被结构操作波及（sort/size/aggs 原样保留）', () => {
    const dsl = assertIdempotent({ ...tree, root: duplicateNodesByIds(tree.root!, new Set([ids[1]])) });
    expect(dsl.sort).toEqual([{ n: { order: 'desc' } }]);
    expect(dsl.size).toBe(10);
    expect(dsl.aggs).toEqual({ g: { terms: { field: 'a' } } });
  });
});
