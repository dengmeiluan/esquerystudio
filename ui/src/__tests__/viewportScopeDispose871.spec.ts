/**
 * 横切审计第七轮族C 记档加固落地：useViewportProfile 挂接作用域卸载通道。
 *
 * 现状：清理完全依赖调用方手动 dispose（现役唯一调用方 WorkbenchLayout
 * onBeforeUnmount 在场齐整）；未来新增调用方漏调即泄漏 ResizeObserver+
 * window resize 监听。加固=组合式函数内 onScopeDispose(dispose)（幂等，
 * 手动 dispose 并存无害；getCurrentScope 守卫=useTreeDslSync/useTermsSuggest
 * 既定 idioms，作用域外调用静默跳过零行为变化）。
 *
 * 行为锚：宿主组件零手动 dispose，挂载期经 window 回退通道注册 resize
 * 监听（happy-dom 无 ResizeObserver，显式 stub 钉死该路径），卸载后监听
 * 必须随作用域回收——修复前 removeEventListener('resize') 零调用（红）。
 */
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { useViewportProfile } from '../composables/useViewportProfile';

async function settle(n = 8) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* 带 target 挂载（无 target 路径 observe(undefined) 早退、从不注册监听——
 resize 监听只经由 target 观测失败回落 window 的通道注册）：happy-dom 无
 ResizeObserver，显式 stub 钉死 window 回退路径。 */
function mountHost() {
  const app = createApp({
    setup() {
      const target = ref<HTMLElement>(document.createElement('div'));
      useViewportProfile(target);
      return () => h('div', { class: 'vp-scope-host' });
    },
  });
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return app;
}

describe('useViewportProfile 作用域卸载自动回收', () => {
  it('宿主卸载回收 resize 监听（调用方零手动 dispose；修复前泄漏=红）', async () => {
    const original = window.ResizeObserver;
    window.ResizeObserver = undefined as unknown as typeof ResizeObserver;
    try {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const app = mountHost();
      await settle(2);
      expect(addSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
      app.unmount();
      await settle(2);
      expect(removeSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
    } finally {
      window.ResizeObserver = original;
    }
  });
});
