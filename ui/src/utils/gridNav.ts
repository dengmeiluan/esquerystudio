/* 网格/矩阵键盘导航：把方向键映射到目标下标（无目标返回 null，不拦截默认行为）。 */
export function gridNext(key: string, index: number, cols: number, count: number): number | null {
  if (count <= 0 || index < 0 || index >= count || cols <= 0) return null;
  switch (key) {
    case 'ArrowRight': return index + 1 < count ? index + 1 : null;
    case 'ArrowLeft': return index - 1 >= 0 ? index - 1 : null;
    case 'ArrowDown': {
      const n = index + cols;
      return n < count ? n : null;
    }
    case 'ArrowUp': return index - cols >= 0 ? index - cols : null;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
