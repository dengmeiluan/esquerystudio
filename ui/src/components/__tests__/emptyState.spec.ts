/* Task 12：EmptyState 看守。该组件 R92-D1 就已建好并自陈「全站统一入口——
 * 替代散落各视图的裸「暂无数据」文案」，但实测 0 个视图在用它，且从无测试。
 * 后续把 21 处各写各的空态替换成本组件之前，先把接口锁住。
 * 范式同 cmdPalette.spec / timeCell.spec：项目无 @vue/test-utils，用 createApp 手工 mount。 */
import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import EmptyState from '../EmptyState.vue';
import { Inbox, Search } from 'lucide-vue-next';

/* props 类型取组件自身的 props，而非 Record<string, unknown>——
 * 后者是被 widen 的索引类型，不满足 h() 的重载签名，vue-tsc 会报 TS2769。 */
type EmptyStateProps = InstanceType<typeof EmptyState>['$props'];

function render(props: EmptyStateProps): HTMLElement {
  const host = document.createElement('div');
  createApp({ render: () => h(EmptyState, props) }).mount(host);
  return host.firstElementChild as HTMLElement;
}

describe('EmptyState', () => {
  it('渲染 text', () => {
    expect(render({ icon: Inbox, text: '暂无数据' }).textContent).toContain('暂无数据');
  });

  it('不传 hint 时不渲染 hint 行', () => {
    expect(render({ icon: Inbox, text: 'x' }).querySelector('.es-hint')).toBeNull();
  });

  it('传 hint 时渲染 hint 行且文案正确', () => {
    const hint = render({ icon: Inbox, text: 'x', hint: '先在左侧填查询' }).querySelector('.es-hint');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('先在左侧填查询');
  });

  /* 不传 actionText 就不该出现按钮——空按钮会留出多余间距，
     而本波的目的正是压缩留白。 */
  it('不传 actionText 时不渲染按钮', () => {
    expect(render({ icon: Inbox, text: 'x' }).querySelector('button')).toBeNull();
  });

  it('传 actionText 时渲染按钮且文案正确', () => {
    const btn = render({ icon: Inbox, text: 'x', actionText: '去创建' }).querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('去创建');
  });

  /* 接线看守：按钮点击必须 emit action。按钮渲染出来但没接 @click，
     调用方的「执行查询」就成了死按钮，而这正是本组件对外的唯一交互。 */
  it('点击按钮触发 action emit', () => {
    let fired = 0;
    const host = document.createElement('div');
    createApp({
      render: () => h(EmptyState, { icon: Inbox, text: 'x', actionText: '去创建', onAction: () => { fired++; } }),
    }).mount(host);
    const btn = host.querySelector('button') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(fired).toBe(1);
  });

  /* icon 是必填 prop 且 21 处调用方全都传它，但删掉整个 <component :is="icon">
     其余 5 条断言照绿——故单独看守。断言取「渲染出的 svg 带 es-icon 且尺寸 26」，
     而非「组件收到了 icon prop」：后者是把实现抄一遍，模板漏渲染时照样绿。 */
  it('渲染 icon 为带 es-icon 的 svg，尺寸 26', () => {
    const svg = render({ icon: Inbox, text: 'x' }).querySelector('svg.es-icon');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('26');
  });

  /* 换 icon 必须换出不同的图形——否则「icon 被忽略、写死某个图标」测不出来 */
  it('icon 按传入组件渲染（不同 icon 出不同图形）', () => {
    const a = render({ icon: Inbox, text: 'x' }).querySelector('svg')!.innerHTML;
    const b = render({ icon: Search, text: 'x' }).querySelector('svg')!.innerHTML;
    expect(a).not.toBe(b);
  });

  /* ── R99-F2 逃生舱（默认插槽）─────────────────────────────────
     动机：#1 DevTools（3 个不同参数的 quickRun + 内联 <kbd>）、
     #2 RemoteClusters（可复制的多行 <pre> JSON）、#3 Favorites（2 个并列去处）
     这三处的差异是「内容形态」，不是「又缺一个 prop」。
     为它们各开一个 prop 等于把「21 处各写各的」从 CSS 层搬到 prop 层，
     故只开一个通用口子，容器（padding / 居中 / 图标）仍归组件。 */
  it('不传插槽时不渲染 es-extra 容器', () => {
    /* 与 actionText 的 v-if 同理：空容器会吃掉一个 flex gap，
       在本波「压缩留白」的目标下是净负收益。 */
    expect(render({ icon: Inbox, text: 'x' }).querySelector('.es-extra')).toBeNull();
  });

  it('传插槽时渲染 es-extra 并放入插槽内容', () => {
    const host = document.createElement('div');
    createApp({
      render: () => h(EmptyState, { icon: Inbox, text: 'x' }, {
        default: () => h('button', { class: 'slotted' }, '试试：集群健康'),
      }),
    }).mount(host);
    const extra = host.querySelector('.es-extra');
    expect(extra).not.toBeNull();
    expect(extra!.querySelector('button.slotted')).not.toBeNull();
    expect(extra!.textContent).toContain('试试：集群健康');
  });

  /* 插槽不得取代 props：三处调用方都仍靠 text 说明现状、靠 icon 给语义。
     若有人把插槽实现成「有插槽就整体接管」，本条变红。 */
  it('插槽与 icon/text/hint 并存，不互相取代', () => {
    const host = document.createElement('div');
    createApp({
      render: () => h(EmptyState, { icon: Search, text: '未配置任何远程集群', hint: '下一步' }, {
        default: () => h('pre', '{ "persistent": {} }'),
      }),
    }).mount(host);
    const root = host.firstElementChild as HTMLElement;
    expect(root.querySelector('svg.es-icon')).not.toBeNull();
    expect(root.querySelector('.es-text')!.textContent).toContain('未配置任何远程集群');
    expect(root.querySelector('.es-hint')!.textContent).toContain('下一步');
    expect(root.querySelector('.es-extra pre')!.textContent).toContain('persistent');
  });

  /* 容器归属看守：插槽内容必须挂在 .empty-state 内部（受组件 padding 约束），
     不能被渲染成根的兄弟节点——否则调用方就绕开了统一留白，
     而这正是本波唯一不许被破的契约。 */
  it('插槽内容位于 .empty-state 容器内部（不得逃出统一 padding）', () => {
    const host = document.createElement('div');
    createApp({
      render: () => h(EmptyState, { icon: Inbox, text: 'x' }, { default: () => h('pre', 'sample') }),
    }).mount(host);
    const root = host.firstElementChild as HTMLElement;
    expect(root.classList.contains('empty-state')).toBe(true);
    /* 从插槽内容往上找最近的 .empty-state，必须就是根节点 */
    const pre = host.querySelector('pre')!;
    expect(pre.closest('.empty-state')).toBe(root);
  });
});
