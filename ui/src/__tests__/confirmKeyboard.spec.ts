import { describe, expect, it, beforeEach } from 'vitest';

/**
 * 第四十四批守卫：确认弹窗 Enter=确认（快捷性）。
 * 三条边界：中性焦点接管 / critical 守卫未满足不触发 / 焦点在按钮上不双触发。
 * 挂载用裸 createApp（项目无 @vue/test-utils）；teleport 断言查 document。
 */
const emits: string[] = [];
let app: any = null;

const mountModal = async (props: Record<string, unknown> = {}) => {
  const { createApp, h, nextTick } = await import('vue');
  const Modal = (await import('../components/ConfirmModal.vue')).default;
  app = createApp({
    render() {
      return h(Modal as any, {
        show: true,
        title: '确认操作',
        message: '确认执行此操作？',
        ...props,
        onConfirm: () => emits.push('confirm'),
      });
    },
  });
  app.mount(document.createElement('div'));
  await nextTick();
};

const pressEnter = (target?: HTMLElement) => {
  const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  Object.defineProperty(e, 'target', { value: target ?? document.body });
  window.dispatchEvent(e);
};

const confirmCount = () => emits.filter((x) => x === 'confirm').length;

beforeEach(async () => {
  emits.length = 0;
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
});

describe('ConfirmModal Enter 确认', () => {
  it('中性焦点（body）按 Enter 触发确认', async () => {
    await mountModal();
    /* 七十四批起弹出即聚焦确认按钮;此用例模拟焦点被外部移回 body 的场景(仍要接管) */
    (document.activeElement as HTMLElement)?.blur();
    pressEnter(document.body);
    expect(confirmCount()).toBe(1);
  });

  it('critical 守卫未满足时 Enter 不触发（ok() 自拦）', async () => {
    await mountModal({ level: 'critical', guardText: 'old-index' });
    pressEnter(document.body);
    expect(confirmCount()).toBe(0);
  });

  it('焦点在弹窗按钮上时 Enter 不接管（防双触发）', async () => {
    await mountModal();
    const btn = document.querySelector('.cf-foot .btn:last-child') as HTMLElement;
    btn.focus();
    pressEnter(btn);
    expect(confirmCount()).toBe(0);
  });

  /* 七十四批：warn 弹出即聚焦确认按钮——此前不移动焦点，外部表单 input 焦点下
     Enter 落空（中性焦点判断失效、按钮又无焦点），用户必须鼠标点确认。聚焦后
     原生 Enter=点击，且 Tab 循环从确认钮开始（无障碍）。 */
  it('warn 弹出自动聚焦确认按钮（原生 Enter 可确认）', async () => {
    await mountModal({ level: 'warn' });
    await new Promise(r => setTimeout(r, 0));
    const active = document.activeElement as HTMLElement | null;
    expect(active?.classList.contains('btn')).toBe(true);
    expect(active?.textContent).not.toBe('取消');
    /* 原生按钮焦点 Enter=click → ok() → confirm */
    active!.click();
    expect(confirmCount()).toBe(1);
  });

  it('critical 仍聚焦守卫输入框（guardRef 优先）', async () => {
    await mountModal({ level: 'critical', guardText: 'old-index' });
    await new Promise(r => setTimeout(r, 0));
    expect((document.activeElement as HTMLInputElement)?.placeholder).toBe('old-index');
  });
});
