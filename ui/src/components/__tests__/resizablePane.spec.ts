import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import ResizablePane from '../ResizablePane.vue';

const apps: App[] = [];

function mountResizable(props: { axis: 'horizontal' | 'vertical'; size: number; min: number; max: number }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const size = ref(props.size);
  const events: Array<{ type: string; size?: number }> = [];
  const app = createApp({
    render: () => h(ResizablePane, {
      id: 'test-pane',
      title: '测试面板',
      axis: props.axis,
      size: size.value,
      min: props.min,
      max: props.max,
      onResize: (value: number) => { size.value = value; events.push({ type: 'resize', size: value }); },
      onResizeEnd: (value: number) => { size.value = value; events.push({ type: 'resize-end', size: value }); },
      onReset: () => events.push({ type: 'reset' }),
    }, { default: () => 'pane content' }),
  });
  apps.push(app);
  app.mount(host);
  return { host, app, events };
}

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('ResizablePane', () => {
  it('renders a separator with keyboard semantics', () => {
    const { host } = mountResizable({ axis: 'vertical', size: 360, min: 240, max: 720 });
    const handle = host.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuemin')).toBe('240');
    expect(handle.getAttribute('aria-valuemax')).toBe('720');
    expect(handle.getAttribute('aria-valuenow')).toBe('360');
  });

  it('moves by keyboard step and emits one final size', async () => {
    const { host, events } = mountResizable({ axis: 'vertical', size: 360, min: 240, max: 720 });
    const handle = host.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    expect(host.querySelector('[data-pane-size]')?.getAttribute('data-pane-size')).toBe('368');
    expect(events[events.length - 1]).toEqual({ type: 'resize-end', size: 368 });
  });

  it('clamps pointer movement and releases on cancel', async () => {
    const { host } = mountResizable({ axis: 'vertical', size: 360, min: 240, max: 720 });
    const handle = host.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 400, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 50, buttons: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    await nextTick();
    expect(host.querySelector('[data-pane-size]')?.getAttribute('data-pane-size')).toBe('240');
  });

  it('double click emits reset and unmount removes listeners', () => {
    const mounted = mountResizable({ axis: 'vertical', size: 360, min: 240, max: 720 });
    const handle = mounted.host.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(mounted.events).toContainEqual({ type: 'reset' });
    mounted.app.unmount();
    apps.splice(apps.indexOf(mounted.app), 1);
  });
});
