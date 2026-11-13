/* 范式同 emptyState.spec.ts。组容器是构建器的编排核心：occur 分区显隐、
   加条件/子组、解散入口显隐、拖拽落点→bus.move。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import BoolGroupNode from '../builder/BoolGroupNode.vue';
import { TREE_BUS, DRAG_EVENT } from '../builder/treeBus';
import { parseQueryNode } from '../../utils/queryAst';
import type { BoolNode } from '../../utils/queryAst';

const apps: App[] = [];

const SRC = { bool: { must: [{ term: { a: 1 } }], must_not: [{ term: { b: 2 } }] } };

function mount(src: unknown = SRC, opts: { canDissolve?: boolean; onDissolve?: () => void } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const node = ref(parseQueryNode(src) as BoolNode);
  const moves: unknown[][] = [];
  const app = createApp({
    render: () => h(BoolGroupNode, {
      node: node.value,
      fields: ['a', 'b', 'd'], types: { a: 'keyword', b: 'keyword', d: 'date' },
      canDissolve: opts.canDissolve,
      'onUpdate:node': (n: BoolNode) => { node.value = n; },
      onDissolve: () => opts.onDissolve?.(),
    }),
  });
  app.provide(TREE_BUS, { move: (...args: unknown[]) => moves.push(args), toggleDisabled: () => {}, defineRuntime: () => false });
  apps.push(app);
  app.mount(host);
  return { host, node, moves };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); delete (window as any).__qtpDragId; });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('BoolGroupNode', () => {
  it('只渲染有子句的分区 + must 始终显示', () => {
    const { host } = mount();
    expect(host.querySelectorAll('.bgn-part').length).toBe(2);   // must + must_not
    expect(host.textContent).toContain('必须');
    expect(host.textContent).toContain('排除');
  });

  it('空分区可手动展开', async () => {
    const { host } = mount({ bool: { must: [{ term: { a: 1 } }] } });
    expect(host.querySelectorAll('.bgn-part').length).toBe(1);
    const more = [...host.querySelectorAll('.bgn-more button')] as HTMLElement[];
    expect(more.length).toBe(3);   // filter/should/must_not
    more[1].click();
    await new Promise(r => setTimeout(r));
    expect(host.querySelectorAll('.bgn-part').length).toBe(2);
    expect(host.querySelector('.bgn-part.o-should')).not.toBeNull();
  });

  it('「+ 条件」在对应 occur 追加默认叶子（字段列表首字段 + term）', async () => {
    const { host, node } = mount();
    const part = host.querySelector('.bgn-part.o-must_not') as HTMLElement;
    (part.querySelector('.bgn-occur button') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    const mn = node.value.children.filter(c => c.occur === 'must_not');
    expect(mn.length).toBe(2);
    expect((mn[1].node as any).op).toBe('term');
    expect((mn[1].node as any).field).toBe('a');
  });

  it('「+ 子组」追加嵌套 bool 并递归渲染 .bgn', async () => {
    const { host, node } = mount();
    const part = host.querySelector('.bgn-part.o-must') as HTMLElement;
    (part.querySelectorAll('.bgn-occur button')[1] as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(node.value.children.filter(c => c.occur === 'must')[1].node.type).toBe('bool');
    expect(host.querySelectorAll('.bgn').length).toBe(2);
  });

  it('drop 调 bus.move（dragId 取自 window 暂存），拖到自身忽略', async () => {
    const { host, node, moves } = mount();
    (window as any).__qtpDragId = 'drag-x';
    (host.querySelector('.bgn-part.o-must') as HTMLElement).dispatchEvent(new Event('drop', { bubbles: true }));
    await new Promise(r => setTimeout(r));
    expect(moves.length).toBe(1);
    expect(moves[0][0]).toBe('drag-x');
    expect(moves[0][1]).toBe(node.value.id);
    expect(moves[0][2]).toBe('must');
    (window as any).__qtpDragId = node.value.id;
    (host.querySelector('.bgn-part.o-must') as HTMLElement).dispatchEvent(new Event('drop', { bubbles: true }));
    expect(moves.length).toBe(1);   // 未新增
  });

  it('拖拽广播期间亮出全部空分区作落点', async () => {
    const { host } = mount();
    window.dispatchEvent(new CustomEvent(DRAG_EVENT, { detail: { on: true } }));
    await new Promise(r => setTimeout(r));
    expect(host.querySelectorAll('.bgn-part').length).toBe(4);
    window.dispatchEvent(new CustomEvent(DRAG_EVENT, { detail: { on: false } }));
    await new Promise(r => setTimeout(r));
    expect(host.querySelectorAll('.bgn-part').length).toBe(2);
  });

  it('canDissolve=false 不显示解散钮', () => {
    const { host } = mount(SRC, { canDissolve: false });
    expect(host.querySelector('[title^="解散"]')).toBeNull();
  });

  it('canDissolve=true 且无组参数时显示解散钮并 emit dissolve', () => {
    let fired = 0;
    const { host } = mount(SRC, { canDissolve: true, onDissolve: () => { fired++; } });
    const btn = host.querySelector('[title^="解散"]') as HTMLElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(fired).toBe(1);
  });

  /* ==== 【W3b】折叠态按 node.id 进 useScopedDraft（sessionStorage）持久化：
     KeepAlive 淘汰重挂不丢；重解析 nid() 出新 id = 天然 stamp，重挂即重置 ==== */

  const FIXED: BoolNode = {
    id: 'fixb1', type: 'bool',
    children: [{ occur: 'must', node: { id: 'fx1', type: 'leaf', op: 'term', field: 'a', value: 1, params: {}, raw: null } }],
    params: {}, arrForm: { must: true },
  };
  const FOLD_KEY = 'esquerystudio.draft2:query-builder:host:-:-:bgn-fold:fixb1';

  function mountFixed(node: BoolNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(node);
    const app = createApp({
      render: () => h(BoolGroupNode, {
        node: cur.value,
        fields: ['a', 'b', 'd'], types: { a: 'keyword', b: 'keyword', d: 'date' },
        'onUpdate:node': (n: BoolNode) => { cur.value = n; },
      }),
    });
    app.provide(TREE_BUS, { move: () => {}, toggleDisabled: () => {}, defineRuntime: () => false });
    apps.push(app);
    app.mount(host);
    return { host };
  }

  it('折叠写入 scoped draft（key 按 node.id），重挂恢复折叠态', async () => {
    sessionStorage.clear();
    const { host } = mountFixed(FIXED);
    const foldBtn = () => host.querySelector('button[aria-label="折叠或展开整组"]') as HTMLElement;
    foldBtn().click();
    await new Promise(r => setTimeout(r));
    expect(host.querySelector('.bgn-sum'), '折叠态组头出摘要').not.toBeNull();
    expect(sessionStorage.getItem(FOLD_KEY), '折叠态落 scoped draft').toBe('1');
    /* 重挂（模拟 KeepAlive 淘汰后重进）：同 id 恢复折叠 */
    const h2 = mountFixed(FIXED).host;
    await new Promise(r => setTimeout(r));
    expect(h2.querySelector('.bgn-sum'), '重挂即恢复折叠，不丢').not.toBeNull();
  });

  it('展开清除草稿键（回到默认=清除，不留陈稿）', async () => {
    sessionStorage.clear();
    const { host } = mountFixed(FIXED);
    (host.querySelector('button[aria-label="折叠或展开整组"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(sessionStorage.getItem(FOLD_KEY)).toBe('1');
    (host.querySelector('button[aria-label="折叠或展开整组"]') as HTMLElement).click();
    await new Promise(r => setTimeout(r));
    expect(host.querySelector('.bgn-part'), '展开恢复分区体').not.toBeNull();
    expect(sessionStorage.getItem(FOLD_KEY), '展开=默认态，草稿键清除').toBeNull();
  });
});
