import { computed, getCurrentScope, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue';
import { getViewportProfile, type ViewportProfile } from '../utils/layout';

type ResizeTarget = Ref<HTMLElement | undefined>;

export function useViewportProfile(target?: ResizeTarget): {
  width: Ref<number>;
  height: Ref<number>;
  profile: ComputedRef<ViewportProfile>;
  dispose: () => void;
} {
  const width = ref(typeof window === 'undefined' ? 0 : window.innerWidth);
  const height = ref(typeof window === 'undefined' ? 0 : window.innerHeight);
  const profile = computed(() => getViewportProfile(width.value, height.value));
  const ResizeObserverCtor = typeof window !== 'undefined' ? window.ResizeObserver : undefined;
  let observer: ResizeObserver | undefined;
  let observed: HTMLElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let fallbackActive = false;

  const update = (nextWidth: number, nextHeight: number) => {
    if (disposed) return;
    /* 元素未完成布局（任一维 <1：display:none/iframe 隐藏的整零、路由过渡期
 高已解析宽未解析的半零中间矩形）时忽略之，保持上次实测尺寸——否则宿主切页签
 的瞬间布局按 0 宽重排、切回再弹回，肉眼可见的跳动/闪烁；半零更会把对应维钉 0
（观察元素后窗口兜底已停，下一拍全量矩形送达前无自愈通道） */
    if (nextWidth < 1 || nextHeight < 1) return;
    width.value = Number.isFinite(nextWidth) ? Math.max(0, nextWidth) : 0;
    height.value = Number.isFinite(nextHeight) ? Math.max(0, nextHeight) : 0;
  };

  const updateFromWindow = () => {
    if (observed) {
      const rect = observed.getBoundingClientRect();
      update(rect.width, rect.height);
    } else if (typeof window !== 'undefined') {
      update(window.innerWidth, window.innerHeight);
    }
  };

  const onWindowResize = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      updateFromWindow();
    }, 120);
  };

  const useWindowFallback = () => {
    if (typeof window !== 'undefined' && !fallbackActive) {
      fallbackActive = true;
      window.addEventListener('resize', onWindowResize);
      updateFromWindow();
    }
  };

  const stopWindowFallback = () => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', onWindowResize);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = undefined;
    fallbackActive = false;
  };

  const observe = (element?: HTMLElement) => {
    if (observed === element) return;
    observer?.disconnect();
    observed = element;
    if (observer && element) {
      observer.observe(element);
      const rect = element.getBoundingClientRect();
      update(rect.width, rect.height);
      /* 兜底监听常驻：RO 首拍送达缺席的环境（嵌入容器/后台渲染节流）里，
 元素测量一旦落在未完成布局的中间矩形上就再无重测入口=冻结。任何一次窗口
 resize 都经 onWindowResize 重测元素矩形（非窗口尺寸）=自愈入口，RO 仍是
 元素尺寸变化的主通道；重测质量由 update 的未完成布局守卫兜住 */
      useWindowFallback();
    } else {
      if (element) {
        const rect = element.getBoundingClientRect();
        update(rect.width, rect.height);
      }
      useWindowFallback();
    }
  };

  if (ResizeObserverCtor) {
    observer = new ResizeObserverCtor((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) update(rect.width, rect.height);
    });
  }

  const stopWatch = target ? watch(target, observe, { immediate: true }) : undefined;
  if (!target) observe();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopWatch?.();
    observer?.disconnect();
    observer = undefined;
    observed = undefined;
    stopWindowFallback();
  };

  /* 调用方漏调 dispose 时随宿主作用域卸载兜底回收（幂等，手动 dispose 并存无害；作用域外调用跳过） */
  if (getCurrentScope()) onScopeDispose(dispose);
  return { width, height, profile, dispose };
}
