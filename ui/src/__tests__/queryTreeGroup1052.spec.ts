/* 1052：条件树多选包组——同父同分区无损加括号；跨组/跨分区/结构化槽禁用。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, shallowRef } from 'vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import {
  parseTree, serializeTree, canGroupByIds, groupNodesByIds,
  type QueryTree, type QueryNode,
} from '../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r, 0));
const treeOf = (dsl: Record<string, unknown>): QueryTree => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree;
};
const kids = (n: QueryNode): any[] => (n as any).children.map((c: any) => c.node);

describe('1052 包组纯函数', () => {
  it('同分区两兄弟 → 原位包组，组内按原 occur，位置不变', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    const [a, b] = kids(t.root!);
    const ids = new Set([a.id, b.id]);
    expect(canGroupByIds(t.root!, ids)).toBe(true);
    const r = serializeTree({ ...t, root: groupNodesByIds(t.root!, ids) }) as any;
    expect(r.query.bool.must[0]).toEqual({ bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } });
    expect(r.query.bool.must[1]).toEqual({ term: { c: 3 } });
  });

  it('嵌套组内的同分区兄弟 → 在该组内包组', () => {
    const t = treeOf({ query: { bool: { must: [{ bool: { should: [{ term: { a: 1 } }, { term: { b: 2 } }] } }] } } });
    const nested = kids(t.root!)[0];
    const [a, b] = kids(nested);
    const ids = new Set([a.id, b.id]);
    expect(canGroupByIds(t.root!, ids)).toBe(true);
    const r = serializeTree({ ...t, root: groupNodesByIds(t.root!, ids) }) as any;
    expect(r.query.bool.must[0].bool.should[0]).toEqual({ bool: { should: [{ term: { a: 1 } }, { term: { b: 2 } }] } });
  });

  it('跨分区/跨父组/结构化槽 → 禁用且原树不动', () => {
    const mixed = treeOf({ query: { bool: { must: [{ term: { a: 1 } }], must_not: [{ term: { b: 2 } }] } } });
    const m = mixed.root as any;
    const mixedIds = new Set([m.children[0].node.id, m.children[1].node.id]);
    expect(canGroupByIds(mixed.root!, mixedIds)).toBe(false);
    expect(groupNodesByIds(mixed.root!, mixedIds)).toBe(mixed.root);

    const nested = treeOf({ query: { bool: { must: [{ term: { c: 3 } }, { bool: { should: [{ term: { b: 2 } }] } }] } } });
    const n = nested.root as any;
    const inner = n.children[1].node.children[0].node;
    const crossIds = new Set([n.children[0].node.id, inner.id]);
    expect(canGroupByIds(nested.root!, crossIds)).toBe(false);

    const wrapped = treeOf({ query: { bool: { must: [{ constant_score: { filter: { term: { a: 1 } } } }] } } });
    const wleaf = ((wrapped.root as any).children[0].node as any).child;
    expect(canGroupByIds(wrapped.root!, new Set([wleaf.id]))).toBe(false);
  });

  it('排除分区(must_not)兄弟 → 禁用（包组会双重否定）', () => {
    const t = treeOf({ query: { bool: { must_not: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    const [a, b] = kids(t.root!);
    expect(canGroupByIds(t.root!, new Set([a.id, b.id]))).toBe(false);
    expect(groupNodesByIds(t.root!, new Set([a.id, b.id]))).toBe(t.root);
  });

  it('should 可包组；父组设 minimum_should_match 时禁用', () => {
    const plain = treeOf({ query: { bool: { should: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    const [pa, pb] = kids(plain.root!);
    expect(canGroupByIds(plain.root!, new Set([pa.id, pb.id]))).toBe(true);

    const msm = treeOf({ query: { bool: { should: [{ term: { a: 1 } }, { term: { b: 2 } }], minimum_should_match: 1 } } });
    const [ma, mb] = kids(msm.root!);
    expect(canGroupByIds(msm.root!, new Set([ma.id, mb.id]))).toBe(false);
  });

  it('filter 分区可包组（等价嵌套）', () => {
    const t = treeOf({ query: { bool: { filter: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    const [a, b] = kids(t.root!);
    const r = serializeTree({ ...t, root: groupNodesByIds(t.root!, new Set([a.id, b.id])) }) as any;
    expect(r.query.bool.filter[0]).toEqual({ bool: { filter: [{ term: { a: 1 } }, { term: { b: 2 } }] } });
  });

  it('单叶根节点 → 可包成 bool.must 单子组', () => {
    const t = treeOf({ query: { term: { a: 1 } } });
    expect(canGroupByIds(t.root!, new Set([t.root!.id]))).toBe(true);
    const r = serializeTree({ ...t, root: groupNodesByIds(t.root!, new Set([t.root!.id])) }) as any;
    expect(r.query).toEqual({ bool: { must: [{ term: { a: 1 } }] } });
  });
});

describe('1052 条件树多选包组交互', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

  function mount(dsl: Record<string, unknown>) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const cur = shallowRef<QueryTree>(treeOf(dsl));
    const app = createApp({
      render: () => h(QueryTreePane, {
        tree: cur.value, fields: ['a', 'b', 'c'], types: {},
        'onUpdate:tree': (x: QueryTree) => { cur.value = x; },
      }),
    });
    app.mount(host);
    return { host, cur };
  }
  const btn = (host: ParentNode, text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text);

  it('勾选同分区两叶 → 包组 → 新组头出现、选择保留', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    await tick();
    btn(host, '多选')!.click(); await tick();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.cn .nsb input')];
    boxes[0].click(); boxes[1].click(); await tick();

    const groupBtn = btn(host, '包组')!;
    expect(groupBtn.disabled).toBe(false);
    groupBtn.click(); await tick();

    const r = serializeTree(cur.value) as any;
    expect(r.query.bool.must[0]).toEqual({ bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } });
    expect(r.query.bool.must[1]).toEqual({ term: { c: 3 } });
    expect(host.querySelectorAll('.bgn-hd').length).toBe(2);
    expect(host.textContent).toContain('已选 2');
  });

  it('跨分区选中 → 包组禁用并给出原因', async () => {
    const { host } = mount({ query: { bool: { must: [{ term: { a: 1 } }], must_not: [{ term: { b: 2 } }] } } });
    await tick();
    btn(host, '多选')!.click(); await tick();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.cn .nsb input')];
    boxes[0].click(); boxes[1].click(); await tick();
    const groupBtn = btn(host, '包组')!;
    expect(groupBtn.disabled).toBe(true);
    expect(groupBtn.title).toContain('同一分组、同一逻辑');
  });
});
