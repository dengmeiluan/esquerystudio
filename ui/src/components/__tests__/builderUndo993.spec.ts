/* 993 批：构建树 undo/redo 历史栈契约。
   甄别机制：本面板写路径全部汇聚 setRoot（emit 前记 lastEmitted 引用）——props.tree
   回流 === lastEmitted = 内部写（push undo）；≠ = DSL 解析/外部换树（清栈防跨源串撤销）。
   键盘 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 面板内增强；栈深 50 截断。
   1002 扩域：栈快照从 root 升整树——extras 域（排序/查询参数/检索器…）经 DslQueryView
   路由进 commitTree（defineExpose），与条件树编辑共用同一条撤销流。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref, shallowRef } from 'vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import BoolGroupNode from '../builder/BoolGroupNode.vue';
import { parseTree, serializeTree } from '../../utils/queryAst';
import type { QueryTree } from '../../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r));

function mount(dsl: Record<string, unknown>) {
  const t = parseTree(dsl);
  if (!t.ok) throw new Error('parse failed');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = shallowRef<QueryTree>(t.tree);   // 生产 useTreeDslSync 同构（shallowRef 引用恒等，ref 深包装会破坏 lastEmitted 甄别）
  const app = createApp({
    render: () => h(QueryTreePane, {
      tree: cur.value, fields: ['a', 'b', 'c'], types: {},
      'onUpdate:tree': (x: QueryTree) => { cur.value = x; },
    }),
  });
  app.mount(host);
  return { host, cur };
}
const ser = (cur: { value: QueryTree }) => JSON.stringify(serializeTree(cur.value));
const btn = (host: HTMLElement, title: string) => host.querySelector<HTMLButtonElement>(`button[title^="${title}"]`);

/* 1002：带面板实例 ref 的挂具——extras 域写通道 commitTree 直接调用（生产由
   DslQueryView 把 RootExtrasPane 的 update:tree 路由进来） */
function mountX(dsl: Record<string, unknown>) {
  const t = parseTree(dsl);
  if (!t.ok) throw new Error('parse failed');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = shallowRef<QueryTree>(t.tree);
  const pane = ref<{ commitTree: (t: QueryTree) => void } | null>(null);
  const app = createApp({
    render: () => h(QueryTreePane, {
      ref: pane, tree: cur.value, fields: ['a', 'b', 'c'], types: {},
      'onUpdate:tree': (x: QueryTree) => { cur.value = x; },
    }),
  });
  app.mount(host);
  return { host, cur, pane };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

describe('993 undo/redo 历史栈', () => {
  it('写路径入栈：删条件 → 撤销恢复 → 重做再删；栈空钮禁用', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    await tick();
    const undo = btn(host, '撤销');
    const redo = btn(host, '重做');
    expect(undo!.disabled, '初态无历史可撤').toBe(true);
    expect(redo!.disabled, '初态无历史可重做').toBe(true);
    /* 写：删第一条件 */
    (host.querySelector('.bgn-part.o-must .cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    expect(ser(cur)).toContain('"b":2');
    expect(undo!.disabled, '有写历史后可撤').toBe(false);
    /* 撤销 → 恢复双条件 */
    undo!.click();
    await tick();
    expect(ser(cur)).toContain('"a":1');
    expect(redo!.disabled, '撤销后可重做').toBe(false);
    /* 重做 → 再删 */
    redo!.click();
    await tick();
    expect(ser(cur)).not.toContain('"a":1');
    expect(undo!.disabled).toBe(false);
    expect(redo!.disabled, '重做耗尽后禁用').toBe(true);
  });

  it('多级撤销逐级回退；新写动作清空重做分支', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    await tick();
    /* 写1：转条件组之前先删，再加组——两次写 */
    (host.querySelector('.cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    const addBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('加条件')) as HTMLElement;
    addBtn.click();
    await tick();
    /* 撤销两次回初态 */
    (btn(host, '撤销') as HTMLElement).click();
    await tick();
    (btn(host, '撤销') as HTMLElement).click();
    await tick();
    expect(ser(cur)).toEqual(JSON.stringify({ query: { bool: { must: [{ term: { a: 1 } }] } } }));
    /* 新写后重做分支必须清空 */
    (host.querySelector('.cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    expect(btn(host, '重做')!.disabled, '新写清空重做').toBe(true);
  });

  it('外部换树（DSL 解析侧）清栈防跨源串撤销', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    await tick();
    (host.querySelector('.cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    expect(btn(host, '撤销')!.disabled).toBe(false);
    /* 外部换树（非本面板 emit 的引用）→ 栈清空 */
    const t2 = parseTree({ query: { match_all: {} } });
    if (!t2.ok) throw new Error('bad');
    cur.value = t2.tree;
    await tick();
    expect(btn(host, '撤销')!.disabled, '外部换树必须清栈').toBe(true);
  });

  it('键盘 Ctrl+Z 撤销 / Ctrl+Shift+Z 重做（面板内冒泡承接）', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    await tick();
    (host.querySelector('.cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    const pane = host.querySelector('.qtp') as HTMLElement;
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await tick();
    expect(ser(cur)).toContain('"a":1');
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await tick();
    expect(ser(cur)).not.toContain('"a":1');
  });
});

describe('1002 extras 域撤销（排序/查询参数/检索器编辑入同一条历史流）', () => {
  it('extras 编辑可撤销且不清条件树历史（跨域单栈逐级回退）', async () => {
    const { host, cur, pane } = mountX({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    await tick();
    const undo = btn(host, '撤销');
    expect(undo!.disabled, '初态无历史').toBe(true);
    /* 条件树域写：删第一条件 */
    (host.querySelector('.bgn-part.o-must .cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    expect(undo!.disabled).toBe(false);
    /* extras 域写（RootExtrasPane 的 update:tree 形态：加排序） */
    pane.value!.commitTree({ ...cur.value, sort: [{ id: 's1', field: 'a', form: 'str', params: {} }] });
    await tick();
    expect(ser(cur)).toContain('"sort"');
    expect(undo!.disabled, 'extras 写入即有历史（旧 bug：extras 写清栈）').toBe(false);
    /* 撤销一次 → 回到 extras 写之前（排序消失、删除保持） */
    undo!.click();
    await tick();
    expect(ser(cur)).not.toContain('"sort"');
    expect(ser(cur), '删除仍生效（逐级回退不串域）').not.toContain('"a":1');
    /* 再撤销 → 回到删除之前 */
    undo!.click();
    await tick();
    expect(ser(cur)).toContain('"a":1');
    expect(ser(cur)).not.toContain('"sort"');
  });

  it('无根树的 extras 编辑同样可撤销（排序/参数-only 现场不再栈死）', async () => {
    const { host, cur, pane } = mountX({ sort: ['a'] });
    await tick();
    expect(btn(host, '撤销'), '无根无历史=空态干净（头行隐藏）').toBeNull();
    pane.value!.commitTree({ ...cur.value, size: 10 });
    await tick();
    const undo = btn(host, '撤销')!;
    expect(undo.disabled, 'extras 写入即有历史（头行随历史出现）').toBe(false);
    undo.click();
    await tick();
    expect(ser(cur)).not.toContain('"size"');
    expect(ser(cur)).toContain('"sort"');
  });
});

describe('993 高级算子菜单 ↑↓ 键盘导航', () => {
  function mountGroup() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const group: any = { id: 'g1', type: 'bool', children: [{ occur: 'must', node: { id: 'c1', type: 'leaf', op: 'term', field: 'a', value: 1, params: {}, raw: null } }], params: {}, arrForm: { must: true } };
    const cur = ref(group);
    let last: any = null;
    const app = createApp({
      render: () => h(BoolGroupNode, { node: cur.value, fields: ['a'], types: { a: 'keyword' }, 'onUpdate:node': (n: any) => { last = n; } }),
    });
    app.mount(host);
    return { host, last: () => last };
  }
  const key = (el: HTMLElement, k: string, shift = false) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));

  it('打开菜单输入过滤 → ↓ 游标高亮 → Enter 插游标项（非首个命中）', async () => {
    const { host, last } = mountGroup();
    await tick();
    const advBtn = host.querySelector('button[title^="高级算子"]') as HTMLButtonElement;
    advBtn.click();
    await tick();
    const q = document.body.querySelector('.adv-q') as HTMLInputElement;
    q.value = 's';
    q.dispatchEvent(new Event('input'));
    await tick();
    const items = () => [...document.body.querySelectorAll('.adv-i')].map(b => b.textContent || '');
    expect(items().length, '过滤 s 命中多项').toBeGreaterThan(1);
    key(q, 'ArrowDown');
    await tick();
    const act1 = document.body.querySelector('.adv-i.act');
    expect(act1, '↓ 后首项高亮').not.toBeNull();
    const firstLabel = act1!.textContent;
    key(q, 'ArrowDown');
    await tick();
    const act2 = document.body.querySelector('.adv-i.act');
    expect(act2!.textContent, '再 ↓ 游标移次项').not.toBe(firstLabel);
    key(q, 'Enter');
    await tick();
    expect(last(), 'Enter 插入游标项（次项）').not.toBeNull();
    expect(document.body.querySelector('.adv-pop'), '插入后菜单关').toBeNull();
  });
  it('未导航 Enter 仍首个命中（既有语义不回归）', async () => {
    const { host, last } = mountGroup();
    await tick();
    (host.querySelector('button[title^="高级算子"]') as HTMLButtonElement).click();
    await tick();
    const q = document.body.querySelector('.adv-q') as HTMLInputElement;
    q.value = 'geo_dis';
    q.dispatchEvent(new Event('input'));
    await tick();
    key(q, 'Enter');
    await tick();
    expect(last()?.children.length).toBe(2);
    expect((last()?.children[1].node as any).op).toBe('geo_distance');
  });
});

/* 1045：连续输入合并——30 字公司名不再吃光 50 格撤销栈 */
describe('1045 输入级撤销合并', () => {
  it('同一条叶子 1.2s 内连续输入只占一步撤销', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 'x' } }] } } });
    await tick();
    const inp = host.querySelector('.cn .cn-val') as HTMLInputElement;
    inp.value = 'xy';
    inp.dispatchEvent(new Event('input'));
    await tick();
    inp.value = 'xyz';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(ser(cur)).toContain('"xyz"');
    (btn(host, '撤销') as HTMLElement).click();
    await tick();
    expect(ser(cur), '一次撤销回到输入前，而不是只退一个字符').toContain('"a":"x"');
  });

  it('结构编辑与输入不合并：删条件仍单独一步', async () => {
    const { host, cur } = mount({ query: { bool: { must: [{ term: { a: 'x' } }, { term: { b: 2 } }] } } });
    await tick();
    const inp = host.querySelector('.cn .cn-val') as HTMLInputElement;
    inp.value = 'xy';
    inp.dispatchEvent(new Event('input'));
    await tick();
    (host.querySelector('.bgn-part.o-must .cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    (btn(host, '撤销') as HTMLElement).click();
    await tick();
    expect(ser(cur), '撤销删除恢复两条').toContain('"a":"xy"');
    (btn(host, '撤销') as HTMLElement).click();
    await tick();
    expect(ser(cur), '再撤一步回到输入前').toContain('"a":"x"');
  });
});
