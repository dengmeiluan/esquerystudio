/* 主面板契约：root 四种形态的渲染与转换、删光回退 match_all、stale 冻结提示、drop 落点→moveNode。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import { DRAG_KEY } from '../builder/treeBus';
import { parseTree, serializeTree, type QueryTree, type BoolNode, type QueryNode } from '../../utils/queryAst';

const apps: App[] = [];

function mount(src: unknown, opts: { stale?: boolean } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = parseTree(src);
  if (!r.ok) throw new Error('bad src');
  const tree = ref(r.tree);
  const app = createApp({
    render: () => h(QueryTreePane, {
      tree: tree.value,
      fields: ['a', 'b', 'c'], types: { a: 'keyword', b: 'keyword', c: 'keyword' },
      stale: opts.stale,
      'onUpdate:tree': (t: QueryTree) => { tree.value = t; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, tree };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); delete (window as any)[DRAG_KEY]; });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('QueryTreePane', () => {
  it('root=null（无 query 键）显示「加查询条件」，点击生成 bool.must', async () => {
    const { host, tree } = mount({ size: 10 });
    expect(host.textContent).toContain('加查询条件');
    (host.querySelector('.qtp-none button') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(tree.value.root?.type).toBe('bool');
    expect(serializeTree(tree.value).query).toBeDefined();
  });

  it('纯 match_all 显示空态，加条件后转条件组', async () => {
    const { host, tree } = mount({ query: { match_all: {} } });
    expect(host.textContent).toContain('全部文档');
    (host.querySelector('.qtp-none button') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(tree.value.root?.type).toBe('bool');
  });

  it('嵌套 bool 递归渲染（.bgn x2）', () => {
    const { host } = mount({ query: { bool: { must: [{ bool: { should: [{ term: { b: 2 } }] } }] } } });
    expect(host.querySelectorAll('.bgn').length).toBe(2);
  });

  it('单叶子 root 显示「转条件组」，点击后原节点进 must[0]', async () => {
    const { host, tree } = mount({ query: { term: { a: 1 } } });
    expect(host.textContent).toContain('转条件组');
    (host.querySelector('.qtp-single-bar button') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    const ser = serializeTree(tree.value) as any;
    expect(ser.query.bool.must.length).toBe(2);
    expect(ser.query.bool.must[0]).toEqual({ term: { a: 1 } });
  });

  it('删光组内子句 → root 自动回退 match_all', async () => {
    const { host, tree } = mount({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    (host.querySelector('.cn [title="删除"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(tree.value.root).toMatchObject({ type: 'leaf', op: 'match_all' });
    expect(serializeTree(tree.value)).toEqual({ query: { match_all: {} } });
  });

  it('drop 落点 → moveNode 跨分区移动子句', async () => {
    const { host, tree } = mount({ query: { bool: { must: [{ term: { a: 1 } }], must_not: [{ term: { c: 3 } }] } } });
    const root = tree.value.root as BoolNode;
    const dragId = root.children.find(c => c.occur === 'must')!.node.id;
    (window as any)[DRAG_KEY] = dragId;
    (host.querySelector('.bgn-part.o-must_not') as HTMLElement).dispatchEvent(new Event('drop', { bubbles: true }));
    await new Promise(r => setTimeout(r));
    expect(serializeTree(tree.value)).toEqual({
      query: { bool: { must_not: [{ term: { c: 3 } }, { term: { a: 1 } }] } },
    });
  });

  it('stale 时显示冻结提示（不锁右侧编辑器）', () => {
    const { host } = mount({ query: { match_all: {} } }, { stale: true });
    expect(host.querySelector('.qtp-stale')?.textContent).toContain('冻结');
  });

  it('单节点 root 的「包成 bool 组」→ wrapRoot', async () => {
    const { host, tree } = mount({ query: { term: { a: 1 } } });
    (host.querySelector('.cn [title="包成 bool 组"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    const ser = serializeTree(tree.value) as any;
    expect(ser.query.bool.must).toEqual([{ term: { a: 1 } }]);
  });

  it('单节点 root 删除 → 回退 match_all（onRootRemove 直路径）', async () => {
    const { host, tree } = mount({ query: { term: { a: 1 } } });
    (host.querySelector('.cn [title="删除"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(tree.value.root).toMatchObject({ type: 'leaf', op: 'match_all' });
  });

  it('props 换树后 drop 基于新树移动（move 闭包无 stale）', async () => {
    const { host, tree } = mount({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    const r2 = parseTree({ query: { bool: { must: [{ term: { b: 2 } }], should: [{ term: { c: 3 } }] } } });
    if (!r2.ok) throw new Error('bad src');
    tree.value = r2.tree;
    await new Promise(r => setTimeout(r));
    const root = tree.value.root as BoolNode;
    const dragId = root.children.find(c => c.occur === 'should')!.node.id;
    (window as any)[DRAG_KEY] = dragId;
    (host.querySelector('.bgn-part.o-must') as HTMLElement).dispatchEvent(new Event('drop', { bubbles: true }));
    await new Promise(r => setTimeout(r));
    expect(serializeTree(tree.value)).toEqual({
      query: { bool: { must: [{ term: { b: 2 } }, { term: { c: 3 } }] } },
    });
  });

  it('stale 时面板禁交互（froz class）', () => {
    const { host } = mount({ query: { match_all: {} } }, { stale: true });
    expect((host.querySelector('.qtp') as HTMLElement).className).toContain('froz');
  });

  /* ==== 五百一十九批：量变管理（徽标分档/折叠全部/过滤定位/批量启停） ==== */

  const mkLeaf = (id: string, disabled?: boolean): QueryNode => ({
    id, type: 'leaf', op: 'term', field: 'a', value: 1, params: {}, raw: null,
    ...(disabled ? { disabled: true } : {}),
  });
  const mkGroup = (id: string, children: QueryNode[], occur: 'must' | 'should' = 'must'): BoolNode => ({
    id, type: 'bool', children: children.map(n => ({ occur, node: n })), params: {}, arrForm: { [occur]: true },
  });

  it('五百一十九批：徽标分档读数「共 N · 停用 M · 嵌套 K」，N≤10 不警示', async () => {
    const { host, tree } = mount({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    tree.value = {
      ...tree.value,
      root: mkGroup('r', [mkLeaf('l1', true), mkLeaf('l2'), mkGroup('nb', [mkLeaf('l3')], 'should')]),
    };
    await new Promise(r => setTimeout(r));
    const cnt = host.querySelector('.qtp-cnt') as HTMLElement;
    expect(cnt.textContent).toContain('共 3 条件');
    expect(cnt.textContent).toContain('停用 1');
    expect(cnt.textContent).toContain('嵌套 1');
    expect(cnt.className, '3 条不进警示档').not.toContain('hot');
  });

  it('五百一十九批：叶子总数 >10 徽标进警示色档（.hot）', async () => {
    const { host, tree } = mount({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    tree.value = {
      ...tree.value,
      root: mkGroup('r', Array.from({ length: 11 }, (_, i) => mkLeaf('l' + i))),
    };
    await new Promise(r => setTimeout(r));
    expect((host.querySelector('.qtp-cnt') as HTMLElement).textContent).toContain('共 11 条件');
    expect((host.querySelector('.qtp-cnt') as HTMLElement).className).toContain('hot');
  });

  it('五百一十九批：折叠全部/展开全部广播所有嵌套组（含根组）', async () => {
    const { host } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }] } }] } } });
    expect(host.querySelectorAll('.bgn').length).toBe(2);
    (host.querySelector('button[title="折叠全部嵌套组"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    /* 根组折叠后 body（含嵌套组）整棵隐藏：可见 .bgn 只剩根组自身，且组头出摘要 */
    expect(host.querySelectorAll('.bgn-sum').length, '根组进折叠态（组头出摘要）').toBe(1);
    expect(host.querySelectorAll('.bgn').length, '嵌套组随根组 body 隐藏').toBe(1);
    (host.querySelector('button[title="展开全部嵌套组"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(host.querySelectorAll('.bgn').length, '展开后嵌套组恢复').toBe(2);
    expect(host.querySelectorAll('.bgn-sum').length, '展开后摘要消失').toBe(0);
  });

  it('五百一十九批：条件搜索定位——命中行柔底高亮并滚动，清空恢复', async () => {
    const { host } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { match: { b: 'x' } }] } } });
    /* 五百五十三批随迁：过滤框收编 SearchFilterBar 第四胞胎后，.qtp-find 是组件壳，
       真 input 在壳内——喂词须取壳内 input（v-model 链 update:modelValue 不变） */
    const find = (host.querySelector('.qtp-find input') || host.querySelector('.qtp-find')) as HTMLInputElement;
    find.value = 'b';
    find.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    const hits = host.querySelectorAll('.cn.qtp-hit');
    expect(hits.length, '只有字段 b 的行命中').toBe(1);
    expect((hits[0].querySelector('.fs-inp') as HTMLInputElement).value).toBe('b');
    find.value = '';
    find.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(host.querySelectorAll('.cn.qtp-hit').length, '清空后高亮全部恢复').toBe(0);
  });

  it('【W3b】过滤导航：计数 N/M + Enter/Shift+Enter 轮转当前命中（.qtp-hit-cur 加重档，柔底保留）', async () => {
    const { host } = mount({ query: { bool: { must: [{ term: { b: 1 } }, { match: { b: 'x' } }, { term: { a: 2 } }] } } });
    /* 五百五十三批随迁：过滤框收编 SearchFilterBar 第四胞胎后，.qtp-find 是组件壳，
       真 input 在壳内——喂词须取壳内 input（v-model 链 update:modelValue 不变） */
    const find = (host.querySelector('.qtp-find input') || host.querySelector('.qtp-find')) as HTMLInputElement;
    find.value = 'b';
    find.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    const hits = () => host.querySelectorAll('.cn.qtp-hit');
    expect(hits().length, '两行字段 b 命中').toBe(2);
    const nav = host.querySelector('.qtp-find-nav') as HTMLElement;
    expect(nav.textContent, '计数 N/M 常显').toBe('1/2');
    expect(host.querySelector('.cn.qtp-hit-cur'), '未导航不打当前档（useHitLocate 同款取舍）').toBeNull();
    const key = (shift = false) =>
      find.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: shift, bubbles: true, cancelable: true }));
    const curOp = () => ((host.querySelector('.cn.qtp-hit-cur') as HTMLElement).querySelector('.cn-op') as HTMLSelectElement).value;
    key();
    await new Promise(r => setTimeout(r));
    expect(nav.textContent).toBe('2/2');
    expect(curOp(), 'Enter 轮转到第二个 b 命中（match 行）').toBe('match');
    key();
    await new Promise(r => setTimeout(r));
    expect(nav.textContent, '到尾回绕到 1').toBe('1/2');
    expect(curOp()).toBe('term');
    key(true);
    await new Promise(r => setTimeout(r));
    expect(nav.textContent, 'Shift+Enter 反向回 2').toBe('2/2');
    find.value = '';
    find.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(host.querySelector('.qtp-find-nav'), '清空后计数条退场').toBeNull();
    expect(host.querySelectorAll('.cn.qtp-hit').length, '清空恢复（既有契约不回归）').toBe(0);
  });

  it('五百一十九批：停用全部/启用全部递归翻所有叶 disabled', async () => {
    const { host, tree } = mount({ query: { bool: { must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }] } }] } } });
    const leavesOf = () => {
      const out: any[] = [];
      const walk = (n: any) => {
        if (n.type === 'bool') n.children.forEach((c: any) => walk(c.node));
        else out.push(n);
      };
      walk(tree.value.root);
      return out;
    };
    (host.querySelector('button[title="全部条件临时停用（不删除，可恢复）"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(leavesOf().length).toBe(2);
    expect(leavesOf().every(l => l.disabled === true), '嵌套叶也一并停用').toBe(true);
    (host.querySelector('button[title="全部条件恢复参与匹配"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(leavesOf().every(l => !l.disabled), '全部恢复参与匹配').toBe(true);
  });
});
