/* 1067：条件树键盘移动——Alt+↑/↓ 在同 occur / multi 同 key 分区内换位。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, shallowRef } from 'vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import { parseTree, serializeTree, moveSibling, type QueryTree } from '../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r, 0));
const treeOf = (dsl: Record<string, unknown>): QueryTree => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree;
};
const mustKeys = (t: QueryTree): string[] => {
  const out = serializeTree(t) as any;
  return (out.query?.bool?.must || []).map((x: any) => Object.keys(x.term || x.bool || {})[0]);
};

describe('1067 键盘移动纯函数', () => {
  it('同分区上移/下移；边界原样返回', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    const r = t.root as any;
    const [a, b, c] = r.children.map((x: any) => x.node);
    const up = { ...t, root: moveSibling(r, b.id, -1) };
    expect(mustKeys(up)).toEqual(['b', 'a', 'c']);
    expect(moveSibling(r, a.id, -1)).toBe(r);
    expect(moveSibling(r, c.id, 1)).toBe(r);
  });

  it('只在同 occur 分区内换位（不跨 must/should）', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }], should: [{ term: { b: 2 } }, { term: { c: 3 } }] } } });
    const r = t.root as any;
    const must = r.children.find((x: any) => x.occur === 'must').node;
    const should1 = r.children.find((x: any) => x.occur === 'should').node;
    const should2 = r.children.filter((x: any) => x.occur === 'should')[1].node;
    // should 的第二条上移，只在 should 分区内换位
    const out = serializeTree({ ...t, root: moveSibling(r, should2.id, -1) }) as any;
    expect(out.query.bool.must[0]).toEqual({ term: { a: 1 } });
    expect(out.query.bool.should.map((x: any) => Object.keys(x.term)[0])).toEqual(['c', 'b']);
    // should 首条上移=边界（前面只有 must 不同区）
    expect(moveSibling(r, should1.id, -1)).toBe(r);
    expect(must).toBeTruthy();
  });

  it('组按整棵子树移动；multi 同 key 内换位；root 不动', () => {
    const t = treeOf({ query: { bool: { must: [
      { term: { a: 1 } },
      { bool: { should: [{ term: { b: 2 } }] } },
      { term: { c: 3 } },
    ] } } });
    const r = t.root as any;
    const group = r.children[1].node;
    const moved = moveSibling(r, group.id, -1);
    expect((moved as any).children.map((x: any) => x.node.type)).toEqual(['bool', 'leaf', 'leaf']);
    expect(moveSibling(r, r.id, -1)).toBe(r);

    const m = treeOf({ query: { dis_max: { queries: [{ term: { x: 1 } }, { term: { y: 2 } }] } } });
    const mr = m.root as any;
    const q2 = mr.children[1].node;
    const mo = serializeTree({ ...m, root: moveSibling(mr, q2.id, -1) }) as any;
    expect(mo.query.dis_max.queries.map((x: any) => Object.keys(x.term)[0])).toEqual(['y', 'x']);
  });
});

describe('1067 条件树键盘移动交互', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

  function mount(dsl: Record<string, unknown>) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const cur = shallowRef<QueryTree>(treeOf(dsl));
    const app = createApp({
      render: () => h(QueryTreePane, {
        tree: cur.value, fields: ['a', 'b', 'c'], types: { a: 'keyword', b: 'keyword', c: 'keyword' },
        'onUpdate:tree': (x: QueryTree) => { cur.value = x; },
      }),
    });
    app.mount(host);
    return { host, cur };
  }
  const keyAlt = (el: HTMLElement, key: 'ArrowUp' | 'ArrowDown') =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));

  it('焦点行 Alt+↑ 上移，DSL 顺序同步；边界不再移动', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    await tick();
    const fields = [...host.querySelectorAll<HTMLInputElement>('.cn .fs-inp')];
    fields[1].focus();
    keyAlt(fields[1], 'ArrowUp');
    await tick();
    expect(mustKeys(cur.value)).toEqual(['b', 'a', 'c']);
    expect(host.querySelector('.cn-grip')?.getAttribute('title')).toContain('Alt+↑/↓');

    const before = serializeTree(cur.value);
    const first = host.querySelectorAll<HTMLInputElement>('.cn .fs-inp')[0];
    first.focus();
    keyAlt(first, 'ArrowUp');
    await tick();
    expect(serializeTree(cur.value)).toEqual(before);
  });
});
