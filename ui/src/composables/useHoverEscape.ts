import { watch, onUnmounted } from 'vue';

/**
 * 悬浮态残留兜底（868）：mouseleave 是悬浮态唯一清除通道时会丢——快速移出/
 * 重渲竞态下事件不再发生，十字线+读出永久残留（线上反馈「命中的点不在鼠标
 * 位置」根因）。本巡检在悬浮激活期间挂 document 捕获级 mousemove：任一移动
 * 的坐标落在目标矩形之外即清悬浮并卸载巡检；坐标回内后由元素自身的
 * mousemove 正常重建。isActive 转 false（其他通道已清）时自动卸载。
 */
export function useHoverEscape(
  isActive: () => boolean,
  inside: (e: MouseEvent) => boolean,
  clear: () => void,
): void {
  const onMove = (e: MouseEvent) => {
    if (!isActive()) { detach(); return; }
    if (!inside(e)) { clear(); detach(); }
  };
  const attach = () => document.addEventListener('mousemove', onMove, true);
  const detach = () => document.removeEventListener('mousemove', onMove, true);
  watch(isActive, (on) => { if (on) attach(); else detach(); }, { immediate: true });
  onUnmounted(detach);
}
