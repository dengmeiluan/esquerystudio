/**
 * MetaStrip 扩展段（dot 状态点 / text 纯文本段）接线看守——六视图 .sep 手写 meta 串
 * 换装批次新增的两项能力。判据落在**渲染结果**上：
 *   dot：值前圆点必须带传入色值（DiagView 集群状态冗余色标，色盲不只靠 tone 文本色）；
 *   text：暗色纯文本段，不渲染值/标签（DiagView dg-sub 副行收编形态）。
 * 既有 value/label/unit/tone/tip/to 形态一并回归，扩 prop 不许破坏既有调用点。
 * 范式同 timeCell.spec：项目无 @vue/test-utils，用 createApp 手工 mount。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import MetaStrip, { type MetaStripItem } from '../MetaStrip.vue';

function renderStrip(items: MetaStripItem[], withRouter = false): {
  host: HTMLElement; app: ReturnType<typeof createApp>; router: ReturnType<typeof createRouter> | null;
} {
  const host = document.createElement('div');
  const app = createApp({ render: () => h(MetaStrip, { items }) });
  let router: ReturnType<typeof createRouter> | null = null;
  if (withRouter) {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/system', component: { template: '<div/>' } }],
    });
    app.use(router);
  }
  app.mount(host);
  return { host, app, router };
}

describe('MetaStrip 扩展段（dot / text）', () => {
  it('dot：值前渲染圆点且色值直传 background（DiagView 集群状态形态）', () => {
    const { host, app } = renderStrip([{ value: 'green', label: '集群状态', tone: 'ok', dot: 'var(--ok)' }]);
    const dot = host.querySelector('.ms-dot') as HTMLElement;
    expect(dot, '状态点必须渲染').toBeTruthy();
    expect(dot.getAttribute('style')).toContain('var(--ok)');
    /* 冗余色标不抢值语义：点是无文本装饰（aria-hidden 由组件模板保证） */
    expect(dot.textContent).toBe('');
    expect(host.querySelector('b')?.textContent).toBe('green');
    app.unmount();
  });

  it('text：纯文本段渲染暗色文本，不渲染值/标签结构（dg-sub 副行收编形态）', () => {
    const { host, app } = renderStrip([{ text: '节点资源快照 · 热线程采样' }]);
    const t = host.querySelector('.ms-t') as HTMLElement;
    expect(t, 'text 段必须渲染').toBeTruthy();
    expect(t.textContent).toBe('节点资源快照 · 热线程采样');
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('i')).toBeNull();
    app.unmount();
  });

  it('text 与 value 同项时 text 优先（互斥契约，不渲染半截值对）', () => {
    const { host, app } = renderStrip([{ value: 1, label: 'x', text: 'desc' }]);
    expect(host.querySelector('.ms-t')?.textContent).toBe('desc');
    expect(host.querySelector('b')).toBeNull();
    app.unmount();
  });

  it('既有形态回归：value/label/unit/tone/tip 与段间 · 分隔不受扩 prop 影响', () => {
    const { host, app } = renderStrip([
      { value: 3, label: '失败', tone: 'err' },
      { value: 12, unit: 'GB', label: '存储', tip: '12 GB' },
      { value: 'RUNNING', label: '运行状态', tone: 'ok' },
    ]);
    expect(host.querySelectorAll('.ms-sep').length).toBe(2);
    expect(host.querySelector('b.ms-err')?.textContent).toBe('3');
    expect(host.querySelector('b.ms-ok')?.textContent).toBe('RUNNING');
    expect(host.querySelector('.ms-unit')?.textContent).toBe('GB');
    const tipSeg = host.querySelectorAll('.ms-i')[1] as HTMLElement;
    expect(tipSeg.getAttribute('title')).toBe('12 GB');
    app.unmount();
  });

  it('既有 to 跳转回归：role=link 可达且点击跳路由（happy-dom 走 dispatchEvent）', async () => {
    const { host, app, router } = renderStrip([{ value: 5, label: '重建锁', to: '/system' }], true);
    await router!.isReady(); /* vue-router4 挂载不自动 start，首次 push 前必须先就绪 */
    const link = host.querySelector('.ms-i.link') as HTMLElement;
    expect(link.getAttribute('role')).toBe('link');
    expect(link.getAttribute('tabindex')).toBe('0');
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0)); /* go() 内部 void push，让导航 promise 落地 */
    expect(router!.currentRoute.value.path, '点击后必须落到 to 路由').toBe('/system');
    app.unmount();
  });
});
