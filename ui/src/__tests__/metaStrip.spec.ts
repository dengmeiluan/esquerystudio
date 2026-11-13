/**
 * MetaStrip 统一件 spec：inline 元信息串（IndexHubView .ih-meta 范式合并）。
 * 覆盖：渲染（值/标签/单位/分隔符）、tone 语义档、tip 兜底、to 点击跳转、默认插槽。
 */
import { describe, it, expect, beforeEach } from 'vitest';

async function mountStrip(items: unknown[], withSlot = false) {
  const { createApp, h, nextTick } = await import('vue');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const MetaStrip = (await import('../components/MetaStrip.vue')).default;

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(MetaStrip, { items } as any, withSlot ? { default: () => h('span', { class: 'slot-probe' }, '自定义段') } : {}),
  });
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  await nextTick();
  return { router, host, cleanup: () => app.unmount() };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('MetaStrip 统一件', () => {
  it('渲染：值加粗 + 标签暗色 + 独立单位 + · 分隔 + 默认插槽自定义段', async () => {
    const { host, cleanup } = await mountStrip([
      { label: '别名', value: 12 },
      { label: '总存储', value: '1.2', unit: 'GB' },
    ], true);
    const values = host.querySelectorAll('.ms b');
    expect(values.length).toBe(2);
    expect(values[0].textContent).toBe('12');
    expect(values[1].textContent).toBe('1.2');
    expect(host.querySelector('.ms-unit')?.textContent).toBe('GB');
    const labels = host.querySelectorAll('.ms i');
    expect(labels[0].textContent).toBe('别名');
    expect(labels[1].textContent).toBe('总存储');
    /* 525 批：默认插槽前自动补一枚 ms-sep（items 间 1 枚 + items→插槽 1 枚 = 2） */
    expect(host.querySelectorAll('.ms-sep').length).toBe(2);
    expect(host.querySelector('.slot-probe')?.textContent).toBe('自定义段');
    cleanup();
  });

  it('label 缺省只渲染值（warn 角标等纯值段形态）', async () => {
    const { host, cleanup } = await mountStrip([{ value: '⚠ 插件未全节点装齐', tone: 'warn' }]);
    expect(host.querySelectorAll('.ms b').length).toBe(1);
    expect(host.querySelector('.ms i')).toBeNull();
    cleanup();
  });

  it('tone：语义 token 档 ms-ok/ms-warn/ms-err/ms-info，无 tone 不挂色档类', async () => {
    const { host, cleanup } = await mountStrip([
      { label: 'a', value: 1, tone: 'ok' },
      { label: 'b', value: 2, tone: 'warn' },
      { label: 'c', value: 3, tone: 'err' },
      { label: 'd', value: 4, tone: 'info' },
      { label: 'e', value: 5 },
    ]);
    const bs = Array.from(host.querySelectorAll('.ms b'));
    expect(bs[0].classList.contains('ms-ok')).toBe(true);
    expect(bs[1].classList.contains('ms-warn')).toBe(true);
    expect(bs[2].classList.contains('ms-err')).toBe(true);
    expect(bs[3].classList.contains('ms-info')).toBe(true);
    expect(bs[4].getAttribute('class') || '').toBe('');
    cleanup();
  });

  it('tip 走 :title 兜底；有 tip 无 to 的段带 help 光标类', async () => {
    const { host, cleanup } = await mountStrip([
      { label: '待处理任务', value: 7, tip: '待处理任务 7（master 队列，>5 警告 >20 严重）' },
      { label: '无提示', value: 1 },
    ]);
    const segs = host.querySelectorAll('.ms-i');
    expect((segs[0] as HTMLElement).title).toContain('master 队列');
    expect(segs[0].classList.contains('help')).toBe(true);
    expect((segs[1] as HTMLElement).title).toBe('');
    expect(segs[1].classList.contains('help')).toBe(false);
    cleanup();
  });

  it('to：role=link + 键盘可达（tabindex），点击 push 路由（dispatchEvent + 宏任务）', async () => {
    const { host, router, cleanup } = await mountStrip([
      { label: '索引数', value: 3, to: '/indices' },
    ]);
    const link = host.querySelector('.ms-i.link') as HTMLElement;
    expect(link.getAttribute('role')).toBe('link');
    expect(link.getAttribute('tabindex')).toBe('0');
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe('/indices');
    cleanup();
  });

  it('无 to 的段不进链接语义（无 role/tabindex、无 link 类）', async () => {
    const { host, cleanup } = await mountStrip([{ label: '节点', value: 2 }]);
    const seg = host.querySelector('.ms-i') as HTMLElement;
    expect(seg.getAttribute('role')).toBeNull();
    expect(seg.getAttribute('tabindex')).toBeNull();
    expect(seg.classList.contains('link')).toBe(false);
    cleanup();
  });
});
