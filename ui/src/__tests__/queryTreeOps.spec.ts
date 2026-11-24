/* 树不可变操作契约：返回新树、原树不变；root 永不缺失（删 root 回退 match_all）；
   拖拽防环（不能移进自身/后代）；解散 bool 只在无参数时允许（防丢 minimum_should_match）。 */
import { describe, it, expect } from 'vitest';
import {
  parseQueryNode, serQueryNode, nid,
  updateNodeById, removeNodeById, moveNode, wrapInBool, dissolveBool, insertChild, findNode,
} from '../utils/queryAst';
import type { BoolNode, LeafNode, WrapNode } from '../utils/queryAst';

const SRC = {
  bool: {
    must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }, { term: { c: 3 } }] } }],
    filter: [{ range: { d: { gte: 1 } } }],
  },
};
const kids = (n: unknown) => (n as BoolNode).children;

describe('queryAst 树操作', () => {
  it('updateNodeById 不可变更新，原树不变', () => {
    const root = parseQueryNode(SRC);
    const a = kids(root)[0].node as LeafNode;
    const next = updateNodeById(root, a.id, n => ({ ...(n as LeafNode), value: 9 }));
    expect(serQueryNode(next)).toEqual({
      bool: {
        must: [{ term: { a: 9 } }, { bool: { should: [{ term: { b: 2 } }, { term: { c: 3 } }] } }],
        filter: [{ range: { d: { gte: 1 } } }],
      },
    });
    expect(serQueryNode(root)).toEqual(SRC);
  });

  it('removeNodeById 删除 bool 子节点', () => {
    const root = parseQueryNode(SRC);
    const next = removeNodeById(root, kids(root)[0].node.id);
    expect(serQueryNode(next)).toEqual({
      bool: {
        must: [{ bool: { should: [{ term: { b: 2 } }, { term: { c: 3 } }] } }],
        filter: [{ range: { d: { gte: 1 } } }],
      },
    });
  });

  it('removeNodeById 删除 wrap 的 child → child=null，序列化回 match_all', () => {
    const root = parseQueryNode({ nested: { path: 'items', query: { term: { 'items.sku': 'A' } } } });
    const next = removeNodeById(root, (root as WrapNode).child!.id) as WrapNode;
    expect(next.child).toBeNull();
    expect(serQueryNode(next)).toEqual({ nested: { path: 'items', query: { match_all: {} } } });
  });

  it('removeNodeById 命中 root → 回退 match_all（root 永不缺失）', () => {
    const root = parseQueryNode({ term: { a: 1 } });
    expect(serQueryNode(removeNodeById(root, root.id))).toEqual({ match_all: {} });
  });

  it('moveNode 跨 occur 移动子句', () => {
    const root = parseQueryNode(SRC);
    const next = moveNode(root, kids(root)[0].node.id, root.id, 'must_not');
    expect(serQueryNode(next)).toEqual({
      bool: {
        must: [{ bool: { should: [{ term: { b: 2 } }, { term: { c: 3 } }] } }],
        filter: [{ range: { d: { gte: 1 } } }],
        must_not: [{ term: { a: 1 } }],
      },
    });
  });

  it('moveNode 拖进嵌套 bool', () => {
    const root = parseQueryNode(SRC);
    const inner = kids(root)[1].node as BoolNode;
    const next = moveNode(root, kids(root)[2].node.id, inner.id, 'should');
    expect(serQueryNode(next)).toEqual({
      bool: {
        must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }, { term: { c: 3 } }, { range: { d: { gte: 1 } } }] } }],
      },
    });
  });

  it('moveNode 移到自身或自身后代被拒绝（防环）', () => {
    const root = parseQueryNode(SRC);
    const inner = kids(root)[1].node;
    expect(serQueryNode(moveNode(root, root.id, inner.id, 'must'))).toEqual(SRC);
    expect(serQueryNode(moveNode(root, inner.id, inner.id, 'must'))).toEqual(SRC);
  });

  it('wrapInBool 包成 bool 组', () => {
    const root = parseQueryNode(SRC);
    const next = wrapInBool(root, kids(root)[0].node.id);
    expect(serQueryNode(next)).toEqual({
      bool: {
        must: [{ bool: { must: [{ term: { a: 1 } }] } }, { bool: { should: [{ term: { b: 2 } }, { term: { c: 3 } }] } }],
        filter: [{ range: { d: { gte: 1 } } }],
      },
    });
  });

  it('dissolveBool 并层，子句按各自 occur 并入父组原位置', () => {
    const root = parseQueryNode(SRC);
    const next = dissolveBool(root, kids(root)[1].node.id);
    expect(serQueryNode(next)).toEqual({
      bool: {
        must: [{ term: { a: 1 } }],
        should: [{ term: { b: 2 } }, { term: { c: 3 } }],
        filter: [{ range: { d: { gte: 1 } } }],
      },
    });
  });

  it('dissolveBool 有参数的子 bool 拒绝解散（防丢 minimum_should_match）', () => {
    const src = { bool: { must: [{ bool: { should: [{ term: { b: 2 } }], minimum_should_match: 1 } }] } };
    const root = parseQueryNode(src);
    expect(serQueryNode(dissolveBool(root, kids(root)[0].node.id))).toEqual(src);
  });

  it('insertChild 追加到指定 occur 末尾', () => {
    const root = parseQueryNode({ bool: { must: [{ term: { a: 1 } }] } });
    const n: LeafNode = { id: nid(), type: 'leaf', op: 'term', field: 'x', value: 1, params: {}, raw: null };
    expect(serQueryNode(insertChild(root, root.id, 'filter', n))).toEqual({
      bool: { must: [{ term: { a: 1 } }], filter: [{ term: { x: 1 } }] },
    });
  });

  it('findNode 深度查找与未命中', () => {
    const root = parseQueryNode(SRC);
    const c = (kids(root)[1].node as BoolNode).children[1].node;
    expect(findNode(root, c.id)?.id).toBe(c.id);
    expect(findNode(root, 'nope')).toBeNull();
  });

  it('moveNode 目标为 leaf 时拒绝（防子句静默丢失）', () => {
    const root = parseQueryNode(SRC);
    const a = kids(root)[0].node;
    const leafB = (kids(root)[1].node as BoolNode).children[0].node;   // inner bool 的 should 子句 {term:{b:2}}
    expect(serQueryNode(moveNode(root, a.id, leafB.id, 'must'))).toEqual(SRC);
  });

  it('moveNode 拖进隔代后代被拒绝（isDescendant 严格后代）', () => {
    const src = { bool: { must: [{ bool: { must: [{ bool: { must: [{ term: { x: 1 } }] } }] } }] } };
    const root = parseQueryNode(src);
    const l2 = kids(root)[0].node;                        // 中间层 bool（非 root，绕过 root 守卫）
    const l3 = (l2 as BoolNode).children[0].node;         // l2 的直接子 bool → isDescendant 拦截
    expect(serQueryNode(moveNode(root, l2.id, l3.id, 'must'))).toEqual(src);
  });

  it('dissolveBool 解散空 bool 后空分区 arrForm 一并清理', () => {
    const root = parseQueryNode({ bool: { must: [{ bool: {} }] } });
    const inner = kids(root)[0].node;
    expect(serQueryNode(dissolveBool(root, inner.id))).toEqual({ bool: {} });
  });
});
