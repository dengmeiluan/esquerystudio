/* 987 批：构建器交互质感三小刀契约——
   ① 折叠态组头恒可见（折叠组成一行不可见空白的触屏死角修复）
   ② FieldSelect 未知字段护栏黄点（mapping 在场才亮，零降级不提示）
   ③ stale 冻结 inert（.froz 只挡鼠标，键盘 Tab 仍可写树覆盖手改 DSL 的漏洞封堵） */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

import BoolGroupNode from '../builder/BoolGroupNode.vue';
import FieldSelect from '../builder/FieldSelect.vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import { emptyTree, parseTree } from '../../utils/queryAst';
import type { BoolNode, LeafNode } from '../../utils/queryAst';

const leaf = (patch: Partial<LeafNode> = {}): LeafNode =>
  ({ id: 'c1', type: 'leaf', op: 'term', field: 'status', value: 'active', params: {}, raw: null, ...patch });
const group = (): BoolNode => ({
  id: 'g1', type: 'bool',
  children: [{ occur: 'must', node: leaf() }],
  params: {}, arrForm: { must: true },
});

function mount(comp: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp as never, props as never) });
  app.mount(host);
  return host;
}
/* FieldSelect/QueryTreePane 的响应场景挂载：props 字面量在 render 闭包内求值（ref 变更
 才能驱动重渲染——静态对象字面量会把 props 钉死在首帧值） */
function mountReactive(comp: unknown, props: () => Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp as never, props() as never) });
  app.mount(host);
  return host;
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

describe('987 折叠态组头恒可见', () => {
  it('点折叠钮后根节点挂 .folded（样式锁定面：.bgn.folded > .bgn-hd opacity 1）', async () => {
    const host = mount(BoolGroupNode, { node: group(), fields: ['status'], types: { status: 'keyword' } });
    await Promise.resolve();
    const root = host.querySelector('.bgn') as HTMLElement;
    expect(root.className).not.toContain('folded');
    (root.querySelector('button[aria-label="折叠或展开整组"]') as HTMLElement).click();
    await Promise.resolve();
    expect(root.className, '折叠后必须挂 .folded（组头脱离 hover-only）').toContain('folded');
    expect(root.querySelector('.bgn-sum'), '折叠摘要随常显组头可见').not.toBeNull();
    (root.querySelector('button[aria-label="折叠或展开整组"]') as HTMLElement).click();
    await Promise.resolve();
    expect(root.className).not.toContain('folded');
  });
});

describe('987 FieldSelect 未知字段护栏', () => {
  it('mapping 在场 + 输入不在 mapping → 黄点在场带全语义 title；已知字段不亮', () => {
    const host = mount(FieldSelect, { modelValue: 'ghost', fields: ['a', 'b'], types: { a: 'keyword' } });
    const unk = host.querySelector('.fs-unk') as HTMLElement;
    expect(unk, '未知字段必须亮护栏黄点').not.toBeNull();
    expect(unk.title).toContain('字段不在当前索引 mapping');
    /* 1113：黄点是 8px 圆点，语义只走 title/aria-label——可见文案会逐字竖排溢出压住邻行 */
    expect(unk.textContent?.trim(), '黄点内不得有可见文案').toBe('');
    expect(unk.getAttribute('aria-label')).toContain('字段不在 mapping');
    const h2 = mount(FieldSelect, { modelValue: 'a', fields: ['a', 'b'], types: { a: 'keyword' } });
    expect(h2.querySelector('.fs-unk'), '已知字段不亮').toBeNull();
  });
  it('零降级：无 mapping（fields 空）不提示——自由手输是合法路径', () => {
    const host = mount(FieldSelect, { modelValue: 'anything', fields: [], types: {} });
    expect(host.querySelector('.fs-unk')).toBeNull();
  });
});

describe('987 stale 冻结 inert', () => {
  it('stale=true 面板挂 inert（键盘/AT 全通道封堵）；false 摘除', async () => {
    const t = parseTree({ query: { match_all: {} } });
    if (!t.ok) throw new Error('parse failed');
    const stale = ref(true);
    const host = mountReactive(QueryTreePane, () => ({
      tree: t.tree,
      fields: ['status'], types: { status: 'keyword' }, stale: stale.value,
    }));
    await nextTick();
    const pane = host.querySelector('.qtp') as HTMLElement;
    expect(pane.hasAttribute('inert'), '冻结期必须 inert（挡键盘 Tab 写树）').toBe(true);
    expect(pane.className).toContain('froz');
    stale.value = false;
    await nextTick();
    await nextTick();
    expect(pane.hasAttribute('inert'), '恢复后摘除 inert').toBe(false);
  });
});
