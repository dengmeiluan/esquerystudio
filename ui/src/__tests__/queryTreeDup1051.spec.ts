/* 1051：条件树多选批量复制——原件后插副本、父子同选去重、wrap/multi 槽不就地复制。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, shallowRef } from 'vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import {
  parseTree, serializeTree, duplicateNodesByIds,
  type QueryTree, type QueryNode,
} from '../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r, 0));
const treeOf = (dsl: Record<string, unknown>): QueryTree => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree;
};
const leaves = (n: QueryNode): any[] => {
  if (n.type === 'bool') return n.children.flatMap(c => leaves(c.node));
  if (n.type === 'wrap') return n.child ? leaves(n.child) : [];
  if (n.type === 'multi') return n.children.flatMap(c => leaves(c.node));
  return [n];
};
const termKeys = (root: QueryNode): string[] => leaves(root).map(n => String(n.field ?? ''));

describe('1051 批量复制纯函数', () => {
  it('选中两叶 → 各自后插副本，顺序/值保留、id 全新', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    const kids = (t.root as any).children.map((c: any) => c.node);
    const out = duplicateNodesByIds(t.root!, new Set([kids[0].id, kids[1].id]));
    const r = serializeTree({ ...t, root: out }) as any;
    expect(r.query.bool.must.map((x: any) => Object.keys(x.term)[0])).toEqual(['a', 'a', 'b', 'b', 'c']);
    const ids = leaves(out).map(n => n.id);
    expect(new Set(ids).size, '副本 id 不得与原件重复').toBe(ids.length);
  });

  it('父组与子叶同选：只复制父组整棵，子叶不重复复制', () => {
    const t = treeOf({ query: { bool: { must: [
      { term: { c: 3 } },
      { bool: { should: [{ term: { b: 2 } }] } },
    ] } } });
    const nested = (t.root as any).children[1].node;
    const inner = (nested as any).children[0].node;
    const out = duplicateNodesByIds(t.root!, new Set([nested.id, inner.id]));
    expect(termKeys(out), 'c + 两份嵌套组各一条 b').toEqual(['c', 'b', 'b']);
  });

  it('根选中 → 包 bool.must 两份（沿用单行复制语义）', () => {
    const t = treeOf({ query: { term: { a: 1 } } });
    const out = duplicateNodesByIds(t.root!, new Set([t.root!.id]));
    const r = serializeTree({ ...t, root: out }) as any;
    expect(r.query.bool.must).toEqual([{ term: { a: 1 } }, { term: { a: 1 } }]);
  });

  it('wrap 唯一槽/ multi 结构化槽不就地复制', () => {
    const wrapped = treeOf({ query: { bool: { must: [{ constant_score: { filter: { term: { a: 1 } } } }] } } });
    const leaf = leaves(wrapped.root!)[0];
    const wout = duplicateNodesByIds(wrapped.root!, new Set([leaf.id]));
    expect(termKeys(wout)).toEqual(['a']);

    const multi = treeOf({ query: { bool: { must: [{ dis_max: { queries: [{ term: { a: 1 } }] } }] } } });
    const mleaf = leaves(multi.root!)[0];
    const mout = duplicateNodesByIds(multi.root!, new Set([mleaf.id]));
    expect(termKeys(mout)).toEqual(['a']);
  });
});

describe('1051 条件树多选复制交互', () => {
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

  it('勾选两叶 → 复制 → 副本紧跟原件、选择保留', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    await tick();
    btn(host, '多选')!.click(); await tick();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.cn .nsb input')];
    boxes[0].checked = true; boxes[0].dispatchEvent(new Event('change'));
    boxes[1].checked = true; boxes[1].dispatchEvent(new Event('change'));
    await tick();

    const copy = btn(host, '复制')!;
    expect(copy.disabled).toBe(false);
    copy.click(); await tick();

    const r = serializeTree(cur.value) as any;
    expect(r.query.bool.must.map((x: any) => Object.keys(x.term)[0])).toEqual(['a', 'a', 'b', 'b', 'c']);
    expect(host.textContent).toContain('已选 2');
  });
});
