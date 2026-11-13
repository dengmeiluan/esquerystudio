/**
 * useViewportProfile 半零矩形毒化守卫 + 冻结自愈通道：
 *
 * 其一（半零毒化）：布局根元素首测/RO 送达遇「宽未解析、高已解析」的中间矩形
 * （宽 0 高>0，路由过渡/首帧布局中间态）时，「双零才忽略」守卫拦不住，width
 * 被钉 0——flex 编辑 pane 随 available=0 被钳在 minSize（Workbench 页开屏布局
 * 崩坏：编辑器钉 360px+右侧死空白；真机 1600 视口整页重载一冻一愈=竞态实锚）。
 * 修法=忽略条件升「任一维 <1」，半零与整零同为未完成布局中间态，保持上次实测。
 *
 * 其二（自愈通道）：元素被 RO 观测后窗口 resize 兜底监听被摘除——RO 首拍送达
 * 缺席的环境（嵌入容器/后台渲染节流）里 width 冻结后无任何再测量入口。修法=
 * 兜底监听常驻（其 updateFromWindow 本就重测元素矩形，RO 仍为主通道），任何
 * 一次窗口 resize 都构成自愈入口。
 */
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { useViewportProfile } from '../composables/useViewportProfile';

async function settle(n = 8) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* 受控假 RO：捕获回调，测试内直投 contentRect 模拟送达（happy-dom 无真 RO） */
class FakeRO {
  static cb: (entries: Array<{ contentRect: { width: number; height: number } }>) => void = () => {};
  constructor(cb: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) { FakeRO.cb = cb; }
  observe() {}
  disconnect() {}
  unobserve() {}
  static fire(width: number, height: number) { FakeRO.cb([{ contentRect: { width, height } }]); }
}

function makeEl(w: number, h: number) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ width: w, height: h, x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, toJSON: () => ({}) } as DOMRect);
  return el;
}

function mountWithEl(el: HTMLElement) {
  const target = ref<HTMLElement>(el);
  let vpRef: ReturnType<typeof useViewportProfile> | null = null;
  const app = createApp({
    setup() {
      vpRef = useViewportProfile(target);
      return () => h('div', { class: 'vp-halfzero-host' });
    },
  });
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { app, vp: vpRef! };
}

function mountWith(rect: { w: number; h: number }) {
  return mountWithEl(makeEl(rect.w, rect.h));
}

describe('useViewportProfile 半零矩形毒化守卫 + 冻结自愈通道', () => {
  const originalRO = window.ResizeObserver;
  const fallbackWidth = window.innerWidth;

  function withFakeRO(fn: () => Promise<void>) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeRO;
    return fn().finally(() => {
      (window as unknown as { ResizeObserver: unknown }).ResizeObserver = originalRO;
    });
  }

  it('首测矩形宽 0 高 >0（路由过渡中间态）不毒化 width——保持兜底值（修复前=0 红）', async () => {
    await withFakeRO(async () => {
      const { app, vp } = mountWith({ w: 0, h: 456 });
      await settle(4);
      expect(fallbackWidth).toBeGreaterThan(0);
      expect(vp.width.value, '半零矩形（宽 0 高>0）不得把 width 钉 0').toBe(fallbackWidth);
      app.unmount();
      await settle(2);
    });
  });

  it('RO 全量矩形送达取真值；半零/整零送达均保持上一拍真值（切页签保护保持）', async () => {
    await withFakeRO(async () => {
      const { app, vp } = mountWith({ w: 1312, h: 690 });
      await settle(4);
      expect(vp.width.value).toBe(1312);
      FakeRO.fire(0, 0);
      expect(vp.width.value, '整零矩形忽略（宿主切页签保护）').toBe(1312);
      FakeRO.fire(0, 690);
      expect(vp.width.value, '半零矩形（RO 送达维）忽略，不回 0').toBe(1312);
      FakeRO.fire(1440, 720);
      expect(vp.width.value).toBe(1440);
      app.unmount();
      await settle(2);
    });
  });

  it('元素已被 RO 观测后窗口 resize 兜底保留——重测元素矩形=冻结自愈通道（修复前监听被摘=红）', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const netResize = () =>
      addSpy.mock.calls.filter(([t]) => t === 'resize').length -
      removeSpy.mock.calls.filter(([t]) => t === 'resize').length;
    const netBefore = netResize();
    try {
      await withFakeRO(async () => {
        const el = makeEl(0, 456);
        const { app, vp } = mountWithEl(el);
        await settle(4);
        expect(netResize() - netBefore, '观测元素后窗口 resize 兜底监听保留在场').toBe(1);
        expect(removeSpy.mock.calls.some(([t]) => t === 'resize'), '观测元素路径不得摘除兜底监听').toBe(false);
        el.getBoundingClientRect = () => ({ width: 1312, height: 690, x: 0, y: 0, top: 0, left: 0, right: 1312, bottom: 690, toJSON: () => ({}) } as DOMRect);
        window.dispatchEvent(new Event('resize'));
        await new Promise(r => setTimeout(r, 200));
        expect(vp.width.value, '窗口 resize 经兜底重测元素矩形=冻结自愈').toBe(1312);
        app.unmount();
        await settle(2);
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('嵌入容器 0 尺寸启动（innerWidth=0 初始化）不锁死——容器就位后窗口 resize 自愈', async () => {
    await withFakeRO(async () => {
      const desc = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true, writable: true });
      try {
        const el = makeEl(0, 456);
        const { app, vp } = mountWithEl(el);
        await settle(4);
        expect(vp.width.value, '0 尺寸启动期未测量态').toBe(0);
        el.getBoundingClientRect = () => ({ width: 1312, height: 690, x: 0, y: 0, top: 0, left: 0, right: 1312, bottom: 690, toJSON: () => ({}) } as DOMRect);
        window.dispatchEvent(new Event('resize'));
        await new Promise(r => setTimeout(r, 200));
        expect(vp.width.value, '容器就位后 resize 重测元素矩形=自愈').toBe(1312);
        app.unmount();
        await settle(2);
      } finally {
        if (desc) Object.defineProperty(window, 'innerWidth', desc);
      }
    });
  });
});
