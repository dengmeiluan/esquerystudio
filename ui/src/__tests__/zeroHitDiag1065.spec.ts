/* 1065：零命中诊断——叶子级探针收集与最小查询体（去掉聚合/排序/翻页旁路）。 */
import { describe, it, expect } from 'vitest';
import { collectAblationTargets, buildAblationBody } from '../utils/zeroHitDiag';
import { parseTree, type QueryTree } from '../utils/queryAst';

const treeOf = (dsl: Record<string, unknown>): QueryTree => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree;
};

describe('1065 零命中探针收集', () => {
  it('只收启用叶子（组/容器不单独停用，match_all/disabled 跳过）', () => {
    const t = treeOf({ query: { bool: { must: [
      { term: { title: 'x' } },
      { bool: { should: [{ term: { status: 'ACTIVE' } }] } },
      { match_all: {} },
    ] } } });
    const { targets, total } = collectAblationTargets(t.root);
    expect(total).toBe(2);
    expect(targets.map(x => x.label).join(' | ')).toContain('title');
    expect(targets.some(x => x.label.includes('status'))).toBe(true);
    expect(targets.every(x => !x.label.includes('match_all'))).toBe(true);

    const root = t.root as any;
    root.children[0].node.disabled = true;
    expect(collectAblationTargets(t.root).total).toBe(1);
  });

  it('上限 cap 截断但 total 报真实数量', () => {
    const must = Array.from({ length: 20 }, (_, i) => ({ term: { [`f${i}`]: i } }));
    const t = treeOf({ query: { bool: { must } } });
    const { targets, total } = collectAblationTargets(t.root, 12);
    expect(total).toBe(20);
    expect(targets.length).toBe(12);
  });
});

describe('1065 探针查询体', () => {
  it('停用目标叶子、去掉聚合/排序/翻页，size=0 + track_total_hits', () => {
    const t = treeOf({
      query: { bool: { must: [{ term: { title: 'x' } }, { term: { status: 'ACTIVE' } }] } },
      size: 20, from: 40, sort: [{ ts: 'desc' }], aggs: { a: { terms: { field: 'status' } } },
    });
    const id = (t.root as any).children[0].node.id;
    const body = JSON.parse(buildAblationBody(t, id)!);
    expect(body.size).toBe(0);
    expect(body.track_total_hits).toBe(true);
    expect(body.aggs).toBeUndefined();
    expect(body.sort).toBeUndefined();
    expect(body.from).toBeUndefined();
    expect(JSON.stringify(body.query)).not.toContain('"title"');
    expect(JSON.stringify(body.query)).toContain('"status"');
  });

  it('空树返回 null', () => {
    const t = treeOf({ query: { match_all: {} } });
    expect(buildAblationBody(t, 'nope')).toBeTruthy(); // 无该 id 时等价原查询（防御）
    expect(buildAblationBody({ ...t, root: null }, 'nope')).toBeNull();
  });
});
