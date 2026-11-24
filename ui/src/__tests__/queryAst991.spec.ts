/* 991 批 AST 层：①rescore 顶层键一等化（post_filter 姊妹键——window_size + query.rescore_query
   可树编辑 + query_weight/rescore_query_weight 落 params；数组多段/畸形形态落 extras 零丢失）。
   ②moveNode 行级插入：第 4 参 anchorId（可选）——子句拖拽可插到同分区某行之后（null=尾部追加
   既有语义零变）；防环与类型守卫同既有契约。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, parseQueryNode, serQueryNode, moveNode, emptyTree } from '../utils/queryAst';
import type { BoolNode, QueryNode } from '../utils/queryAst';

const serOf = (n: QueryNode) => serQueryNode(n);

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

describe('991 rescore 一等解析往返无损', () => {
  roundTrip('标准单段（window_size + 双权重）', {
    query: { match_all: {} },
    rescore: { window_size: 10, query: { rescore_query: { match_phrase: { title: { query: '债券', slop: 1 } } }, query_weight: 0.7, rescore_query_weight: 0.8 } },
  });
  roundTrip('缺 window_size', { rescore: { query: { rescore_query: { term: { a: 1 } } } } });
  roundTrip('仅 rescore_query 无权重', { rescore: { query: { rescore_query: { term: { a: 1 } } } } });
  roundTrip('rescore_query 为 bool 组', { rescore: { query: { rescore_query: { bool: { must: [{ term: { a: 1 } }] } }, query_weight: 1 } } });
  it('parse 投影：windowSize/rescoreQuery/params 分账', () => {
    const r = parseTree({ rescore: { window_size: 5, query: { rescore_query: { term: { a: 1 } }, query_weight: 0.7 } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.rescore).not.toBeNull();
    expect(r.tree.rescore!.hasWindowSize).toBe(true);
    expect(r.tree.rescore!.windowSize).toBe(5);
    expect(r.tree.rescore!.rescoreQuery?.type).toBe('leaf');
    expect(r.tree.rescore!.params).toEqual({ query_weight: 0.7 });
  });
  it('数组多段形态落 extras 零丢失（首期只结构化单段）', () => {
    const dsl = { rescore: [{ window_size: 10 }, { window_size: 5 }] };
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.rescore).toBeNull();
    expect(r.tree.extras.rescore).toEqual(dsl.rescore);
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
  it('query 缺席/非对象落 extras', () => {
    const r = parseTree({ rescore: { window_size: 10 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.rescore).toBeNull();
    expect(r.tree.extras.rescore).toEqual({ window_size: 10 });
  });
  it('rescore_query 畸形值走 __raw__ 叶无损往返', () => {
    const r = parseTree({ rescore: { query: { rescore_query: 'raw-str', query_weight: 1 } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.rescore!.rescoreQuery?.type).toBe('leaf');
    expect(serializeTree(r.tree)).toEqual({ rescore: { query: { rescore_query: 'raw-str', query_weight: 1 } } });
  });
  it('rescoreQuery null 序列化兜底 match_all（root 永不缺失同款）', () => {
    const r = parseTree({ rescore: { query: { rescore_query: { term: { a: 1 } } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.tree.rescore!.rescoreQuery = null;
    expect(serializeTree(r.tree)).toEqual({ rescore: { query: { rescore_query: { match_all: {} } } } });
  });
  it('emptyTree().rescore === null', () => {
    expect(emptyTree().rescore).toBeNull();
  });
});

describe('991 moveNode 行级插入（anchorId）', () => {
  const SRC = { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }], should: [{ term: { c: 3 } }] } };
  const kids = (n: QueryNode) => (n as BoolNode).children;

  it('anchorId 指定行：插到同分区该行之后', () => {
    const root = parseQueryNode(SRC);
    const must = kids(root).filter(c => c.occur === 'must');
    const drag = kids(root).find(c => c.occur === 'should')!.node;
    const next = moveNode(root, drag.id, root.id, 'must', must[0].node.id);
    expect(serOf(next)).toEqual({ bool: { must: [{ term: { a: 1 } }, { term: { c: 3 } }, { term: { b: 2 } }] } });
  });
  it('anchorId=null 保持尾部追加既有语义', () => {
    const root = parseQueryNode(SRC);
    const drag = kids(root).find(c => c.occur === 'should')!.node;
    const next = moveNode(root, drag.id, root.id, 'must');
    expect(serOf(next)).toEqual({ bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } });
  });
  it('anchorId 为自身 → 原样（防自插死循环）', () => {
    const root = parseQueryNode(SRC);
    const drag = kids(root).find(c => c.occur === 'must')!.node;
    const before = serOf(root);
    expect(serOf(moveNode(root, drag.id, root.id, 'must', drag.id))).toEqual(before);
  });
  it('anchorId 是拖拽节点后代 → 原样（防环）', () => {
    const root = parseQueryNode({ bool: { must: [{ term: { a: 1 } }, SRC] } });
    const outer = root as BoolNode;
    const drag = outer.children[0].node;                       // term a
    const innerBool = (outer.children[1].node as BoolNode);
    const innerKid = innerBool.children[0].node;               // 内层 boosting 正例
    const before = serOf(root);
    expect(serOf(moveNode(root, drag.id, root.id, 'must', innerKid.id)), 'anchor 在别的分区无关拖拽链，允许跨分区锚').not.toEqual(before);
    /* 真防环：拖拽整组时 anchor 选组内后代 → 原样 */
    const grp = outer.children[1].node;
    expect(serOf(moveNode(root, grp.id, root.id, 'must', innerKid.id))).toEqual(before);
  });
  it('anchorId 不在同分区 → 回落尾部追加（宽容不炸）', () => {
    const root = parseQueryNode(SRC);
    const drag = kids(root).find(c => c.occur === 'should')!.node;
    const mustKid = kids(root).filter(c => c.occur === 'must')[0].node.id;
    const next = moveNode(root, drag.id, root.id, 'should', mustKid);
    expect(serOf(next)).toEqual({ bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }], should: [{ term: { c: 3 } }] } });
  });
  it('原树不变（不可变更新）', () => {
    const root = parseQueryNode(SRC);
    const drag = kids(root).find(c => c.occur === 'should')!.node;
    moveNode(root, drag.id, root.id, 'must', kids(root).filter(c => c.occur === 'must')[0].node.id);
    expect(serOf(root)).toEqual(SRC);
  });
});
