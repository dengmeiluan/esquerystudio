import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import EventReplayBar from '../EventReplayBar.vue';
import { vTip } from '../../directives/vTip';

/* 1090：回放控制条——播放/步进/倍速/退出事件与键盘语义（全真挂载，无 test-utils 依赖） */
function mountBar(initial: Record<string, any> = {}) {
  document.body.innerHTML = '';
  const calls = { toggle: 0, step: [] as number[], speed: [] as number[], seek: [] as number[], exit: 0 };
  const props = reactive({ count: 10, index: 2, playing: false, progress: 0.25, speed: 1, ...initial });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(EventReplayBar as any, {
      ...props,
      onToggle: () => { calls.toggle++; },
      onStep: (d: number) => { calls.step.push(d); },
      onSpeed: (s: number) => { calls.speed.push(s); },
      onSeek: (p: number) => { calls.seek.push(p); },
      onExit: () => { calls.exit++; },
    }),
  });
  app.directive('tip', vTip);
  app.config.warnHandler = () => {};
  app.mount(host);
  return { app, host, props, calls };
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

beforeEach(() => { document.body.innerHTML = ''; });

describe('1090 EventReplayBar', () => {
  it('位置与播放态呈现；播放钮切换 aria 文案并发出 toggle', async () => {
    const m = mountBar();
    expect(q('[data-test="evr-pos"]')!.textContent).toBe('3/10');
    expect(q('[data-test="evr-toggle"]')!.getAttribute('aria-label')).toBe('播放回放');
    q('[data-test="evr-toggle"]')!.click();
    await nextTick();
    expect(m.calls.toggle).toBe(1);
    m.props.playing = true;
    await nextTick();
    expect(q('[data-test="evr-toggle"]')!.getAttribute('aria-label')).toBe('暂停回放');
    m.app.unmount();
  });

  it('首条/末条边界禁用步进；点击发 step ±1', async () => {
    const m = mountBar({ index: 0 });
    expect((q('[data-test="evr-prev"]') as HTMLButtonElement).disabled).toBe(true);
    q('[data-test="evr-next"]')!.click();
    await nextTick();
    expect(m.calls.step).toEqual([1]);
    m.props.index = 9;
    await nextTick();
    expect((q('[data-test="evr-next"]') as HTMLButtonElement).disabled).toBe(true);
    q('[data-test="evr-prev"]')!.click();
    await nextTick();
    expect(m.calls.step).toEqual([1, -1]);
    m.app.unmount();
  });

  it('倍速芯片当前档高亮，点击发 speed；退出发 exit', async () => {
    const m = mountBar({ speed: 2 });
    expect(q('[data-test="evr-speed-2"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-test="evr-speed-1"]')!.getAttribute('aria-pressed')).toBe('false');
    q('[data-test="evr-speed-8"]')!.click();
    await nextTick();
    expect(m.calls.speed).toEqual([8]);
    q('[data-test="evr-exit"]')!.click();
    await nextTick();
    expect(m.calls.exit).toBe(1);
    m.app.unmount();
  });

  it('键盘：Space 播放暂停、左右步进、Home/End 定位', async () => {
    const m = mountBar({ index: 2 });
    const root = q('[data-test="evr-bar"]')!;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    await nextTick();
    expect(m.calls.toggle).toBe(1);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    expect(m.calls.step).toEqual([1, -1]);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await nextTick();
    expect(m.calls.seek).toEqual([0, 1]);
    m.app.unmount();
  });
});
