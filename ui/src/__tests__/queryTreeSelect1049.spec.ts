/* 1049：条件树多选批量——父组整棵子树生效、父子同选去重、批量停用/启用/删除。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, shallowRef } from 'vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import {
  parseTree, serializeTree, setDisabledForIds, removeNodesByIds,
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

describe('1049 批量纯函数', () => {
  it('选中组 → 整棵子树停用/启用（组外兄弟不受影响）', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }] } }] } } });
    const group = (t.root as any).children[1].node;
    const off = setDisabledForIds(t.root!, new Set([group.id]), true);
    const offGroup = (off as any).children[1].node;
    expect(leaves(offGroup).every(n => n.disabled === true)).toBe(true);
    expect((off as any).children[0].node.disabled, '组外兄弟不动').toBeFalsy();
    const on = setDisabledForIds(off, new Set([group.id]), false);
    expect(leaves((on as any).children[1].node).every(n => !n.disabled)).toBe(true);

    const allOff = setDisabledForIds(t.root!, new Set([t.root!.id]), true);
    expect(leaves(allOff).every(n => n.disabled === true)).toBe(true);
  });

  it('选中组删除 → 整棵子树移除；根选中 → match_all', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }] } }] } } });
    const group = (t.root as any).children[1].node;
    const r = serializeTree({ ...t, root: removeNodesByIds(t.root!, new Set([group.id])) });
    expect(JSON.stringify(r)).not.toContain('"b":2');
    expect(JSON.stringify(r)).toContain('"a":1');

    const all = removeNodesByIds(t.root!, new Set([t.root!.id]));
    expect(serializeTree({ ...t, root: all })).toEqual({ query: { match_all: {} } });
  });

  it('父组与子叶同选：父组整棵删除，不重复操作', () => {
    const t = treeOf({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    const child = (t.root as any).children[0].node;
    const r = removeNodesByIds(t.root!, new Set([t.root!.id, child.id]));
    expect(r.type).toBe('leaf');
    expect((r as any).op).toBe('match_all');
  });
});

describe('1049 条件树多选交互', () => {
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

  it('进入多选 → 勾选两叶 → 停用；再启用恢复', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }] } } });
    await tick();
    btn(host, '多选')!.click(); await tick();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.cn .nsb input')];
    expect(boxes.length, '三个叶子各一勾选框（组头另算）').toBe(3);
    boxes[0].checked = true; boxes[0].dispatchEvent(new Event('change'));
    boxes[1].checked = true; boxes[1].dispatchEvent(new Event('change'));
    await tick();
    expect(host.textContent).toContain('已选 2');

    btn(host, '停用')!.click(); await tick();
    const ls = leaves(cur.value.root!);
    expect(ls.map(n => !!n.disabled)).toEqual([true, true, false]);

    btn(host, '启用')!.click(); await tick();
    expect(leaves(cur.value.root!).every(n => !n.disabled)).toBe(true);
  });

  it('全选 → 删除 → 根归 match_all；多选退出后复选框消失', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    await tick();
    btn(host, '多选')!.click(); await tick();
    expect(host.querySelectorAll('.nsb input').length).toBe(3); // 根组 + 两叶
    btn(host, '全选')!.click(); await tick();
    expect(host.textContent).toContain('已选 3');
    btn(host, '删除')!.click(); await tick();
    expect(serializeTree(cur.value)).toEqual({ query: { match_all: {} } });
    expect(host.querySelectorAll('.cn').length).toBe(0);
    expect(host.textContent).not.toContain('已选');
    expect(host.querySelectorAll('.nsb input').length, '空树后多选复选框全退').toBe(0);
  });

  it('只选父组 → 停用整组子树（叶子全 disabled）', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }] } }] } } });
    await tick();
    btn(host, '多选')!.click(); await tick();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.bgn-hd .nsb input')];
    // 第一个是根组，第二个是嵌套子组
    const nested = boxes[1];
    expect(nested).toBeTruthy();
    nested.checked = true; nested.dispatchEvent(new Event('change'));
    await tick();
    btn(host, '停用')!.click(); await tick();
    const ls = leaves(cur.value.root!);
    expect(ls.map(n => !!n.disabled)).toEqual([false, true]);
  });
});
