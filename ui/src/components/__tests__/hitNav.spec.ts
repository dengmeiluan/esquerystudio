/* 搜索定位导航条（HitNav）契约：
 * — 计数器渲染 current/count，零命中显示「0 命中」；
 * — Enter → next，Shift+Enter → prev（输入框内）；
 * — 按钮 click → prev/next，count=0 时禁用；
 * — 不传 modelValue 不渲染输入框（调用方复用自有输入框的紧凑档）。
 * 范式同 cmdPalette.spec：无 @vue/test-utils，createApp + pinia + router 手工 mount。 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import HitNav from '../HitNav.vue';

let app: VueApp | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = '';
  app = null;
  host = null;
});

type HitNavProps = InstanceType<typeof HitNav>['$props'];

async function mountHitNav(props: HitNavProps, handlers?: Record<string, () => void>): Promise<HTMLElement> {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:all(.*)', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(HitNav, { ...props, ...handlers } as any) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  return host;
}

function pressEnter(el: HTMLElement, shift = false) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: shift, bubbles: true, cancelable: true }));
}

describe('HitNav 渲染', () => {
  it('计数器显示 current/count', async () => {
    const root = await mountHitNav({ count: 5, current: 2 });
    expect(root.querySelector('.hn-count')!.textContent!.trim()).toBe('2/5');
  });

  it('零命中显示「0 命中」', async () => {
    const root = await mountHitNav({ count: 0, current: 0 });
    expect(root.querySelector('.hn-count')!.textContent!.trim()).toBe('0 命中');
  });

  it('不传 modelValue 不渲染输入框（紧凑挂法：只计数+按钮）', async () => {
    const root = await mountHitNav({ count: 3, current: 1 });
    expect(root.querySelector('input')).toBeNull();
    expect(root.querySelectorAll('button').length).toBe(2);
  });

  it('传 modelValue 渲染输入框并回显搜索词', async () => {
    const root = await mountHitNav({ count: 3, current: 1, modelValue: 'title' });
    const inp = root.querySelector('input') as HTMLInputElement;
    expect(inp).toBeTruthy();
    expect(inp.value).toBe('title');
  });

  it('两个按钮都带 title（icon-only 无障碍可达）', async () => {
    const root = await mountHitNav({ count: 3, current: 1, compact: true });
    const titles = [...root.querySelectorAll('button')].map(b => b.getAttribute('title'));
    expect(titles.some(t => t!.includes('上一个'))).toBe(true);
    expect(titles.some(t => t!.includes('下一个'))).toBe(true);
  });
});

describe('HitNav 键盘与按钮接线', () => {
  it('输入框 Enter → next；Shift+Enter → prev', async () => {
    const fired: string[] = [];
    const root = await mountHitNav(
      { count: 4, current: 1, modelValue: 'x' },
      { onNext: () => fired.push('next'), onPrev: () => fired.push('prev') },
    );
    const inp = root.querySelector('input')!;
    pressEnter(inp, false);
    expect(fired).toEqual(['next']);
    pressEnter(inp, true);
    expect(fired).toEqual(['next', 'prev']);
  });

  it('按钮 click → prev / next', async () => {
    const fired: string[] = [];
    const root = await mountHitNav(
      { count: 4, current: 2 },
      { onNext: () => fired.push('next'), onPrev: () => fired.push('prev') },
    );
    const [prevBtn, nextBtn] = [...root.querySelectorAll('button')] as HTMLButtonElement[];
    nextBtn.click();
    prevBtn.click();
    expect(fired).toEqual(['next', 'prev']);
  });

  it('count=0 时两个按钮禁用，点击不发事件', async () => {
    const fired: string[] = [];
    const root = await mountHitNav(
      { count: 0, current: 0 },
      { onNext: () => fired.push('next'), onPrev: () => fired.push('prev') },
    );
    const btns = [...root.querySelectorAll('button')] as HTMLButtonElement[];
    expect(btns.every(b => b.disabled)).toBe(true);
    btns.forEach(b => b.click());
    expect(fired).toEqual([]);
  });

  it('输入框输入 → update:modelValue', async () => {
    const got: string[] = [];
    const root = await mountHitNav(
      { count: 4, current: 1, modelValue: '' },
      { 'onUpdate:modelValue': (v: string) => { got.push(v); } } as any,
    );
    const inp = root.querySelector('input')!;
    inp.value = 'foo';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(got).toEqual(['foo']);
  });
});
