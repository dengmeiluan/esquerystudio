import { onUnmounted } from 'vue';

/**
 * W-D：手写 setTimeout 防抖统一件——缺省 250ms（SearchSandboxView lint 划线
 * 既有口径），连发只跑最后一次；组件卸载自动清 timer（原各页手写版卸载后仍会触发
 * 一次，统一件补上清理）。必须在组件 setup 作用域调用（内部挂 onUnmounted）。
 */
export function useDebounceFn<F extends (...args: never[]) => unknown>(fn: F, ms = 250) {
  let t: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (t !== null) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };

  onUnmounted(() => {
    if (t !== null) { clearTimeout(t); t = null; }
  });

  return debounced;
}
