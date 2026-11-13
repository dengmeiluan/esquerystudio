/**
 * 四百七十七批：SplitHandle 键盘调宽直测——WorkbenchLayout 可调节性的键盘面
 * （此前只源码锁）。契约：ArrowLeft/Right 微调 ±8、Shift 大步 ±32、Home/End
 * 到两端、R/Enter 重置、钳位在 min/max 内；resize 与 resize-end 成对 emit。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, defineComponent, h, ref, nextTick } from 'vue';
import SplitHandle from '../SplitHandle.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function mountHandle(size: number, min = 200, max = 800, axis = 'vertical' as 'vertical' | 'horizontal') {
  const events: { resize: number[]; end: number[]; reset: number } = { resize: [], end: [], reset: 0 };
  const Host = defineComponent({
    setup() {
      const cur = ref(size);
      return () => h(SplitHandle, {
        axis, size: cur.value, min, max, label: '请求体',
        onResize: (v: number) => { cur.value = v; events.resize.push(v); },
        onResizeEnd: (v: number) => { events.end.push(v); },
        onReset: () => { events.reset++; cur.value = size; },
      });
    },
  });
  const app = createApp(Host);
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return { host, events };
}

function press(host: HTMLElement, key: string, mods: { shift?: boolean } = {}) {
  const handle = host.querySelector('.split-handle') as HTMLElement;
  handle.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: !!mods.shift, bubbles: true, cancelable: true }));
}

afterEach(() => {
  apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  document.body.innerHTML = '';
});

describe('SplitHandle 键盘调宽（497 批）', () => {
  it('ArrowRight/Left 微调 ±8，resize 与 resize-end 成对（每键独立挂载防双触发污染）', async () => {
    const { host: h1, events: e1 } = await mountHandle(500);
    press(h1, 'ArrowRight');
    expect(e1.resize, '→ +8').toEqual([508]);
    expect(e1.end).toEqual([508]);
    const { host: h2, events: e2 } = await mountHandle(500);
    press(h2, 'ArrowLeft');
    expect(e2.resize, '← -8').toEqual([492]);
    expect(e2.end).toEqual([492]);
  });

  it('Shift 大步 ±32', async () => {
    const { host, events } = await mountHandle(500);
    press(host, 'ArrowRight', { shift: true });
    expect(events.resize).toEqual([532]);
  });

  it('Home/End 到两端', async () => {
    const { host, events } = await mountHandle(500);
    press(host, 'Home');
    expect(events.resize).toEqual([200]);
    press(host, 'End');
    expect(events.resize[events.resize.length - 1]).toBe(800);
  });

  it('R 重置触发 reset 事件；钳位在 min/max 内', async () => {
    const { host, events } = await mountHandle(500);
    press(host, 'r');
    expect(events.reset).toBe(1);
    press(host, 'ArrowLeft');
    press(host, 'ArrowLeft'); // 500-16=484，继续减到 min 边界由 clamp 兜底
    for (let i = 0; i < 40; i++) press(host, 'ArrowLeft');
    expect(Math.min(...events.resize.filter(v => v < 500))).toBeGreaterThanOrEqual(200);
  });

  it('aria separator 语义与 valuemin/max 在场', async () => {
    const { host } = await mountHandle(500);
    const el = host.querySelector('.split-handle') as HTMLElement;
    expect(el.getAttribute('role')).toBe('separator');
    expect(el.getAttribute('aria-valuemin')).toBe('200');
    expect(el.getAttribute('aria-valuemax')).toBe('800');
  });
});
