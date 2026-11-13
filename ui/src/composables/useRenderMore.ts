import { ref, computed, watch } from 'vue';

/* ═══ W-A：TableShell 第二刀——双内核「渲染截断+增量续渲」逻辑单一出处 ═══
 QRT（ M4 + 增量 + 滚动续渲）≡ RT（ + 平移）逐字同构段
 抽取；MAX_RENDER=2000 / 行集变化自动回首批 / 截断判定 / 续渲 / 截断提示行哨兵
 IntersectionObserver（root=表格滚动根、80px 预载边距、happy-dom 无实现早退）。
 行为零变化：两内核只接线（行源 + IO 根 getter），模板截断行/文案/按钮保位不动
 （autoRenderMore446/rtRenderMore525/qrtRenderMore303 源码锁同步更新至本院+内核接线行）。 */

/* M4：渲染截断保护——超此数只渲染前 N 行（万行 DOM 拖死交互）；
 排序/筛选/导出仍作用于全量（内核「导出不受截断影响」口径，模板尾行文案保位） */
export const MAX_RENDER = 2000;

export function useRenderMore<T>(sorted: () => T[], root: () => HTMLElement | null) {
  /* 增量渲染——截断行内「继续渲染下 2000 行」，浏览万级结果不必只能导出；
 行集变化（新查询/换页）自动回到首批 2000 行 */
  const renderLimit = ref(MAX_RENDER);
  watch(() => sorted().length, () => { renderLimit.value = MAX_RENDER; });
  /* 渲染/键盘导航/右键取行走截断后行集（所见即所操作）；导出走内核全量口径 */
  const rows = computed(() => sorted().slice(0, renderLimit.value));
  const truncated = computed(() => sorted().length > renderLimit.value);
  function renderMore() { renderLimit.value += MAX_RENDER; }

  /* 之后新增：滚动到底自动续渲——用户滚到截断提示行时自动渲染下一批，
 不再必须精确点击按钮（按钮保留作为兜底/显式触发）。表格隐藏或数据重置时观察自然失效 */
  const truncSentinel = ref<HTMLElement | null>(null);
  let autoMoreObserver: IntersectionObserver | null = null;
  watch(truncSentinel, (el, _old, onCleanup) => {
    autoMoreObserver?.disconnect();
    autoMoreObserver = null;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    autoMoreObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) { renderMore(); break; }
      }
    }, { root: root(), rootMargin: '80px' });
    autoMoreObserver.observe(el);
    onCleanup(() => autoMoreObserver?.disconnect());
  });

  return { renderLimit, rows, truncated, renderMore, truncSentinel };
}
