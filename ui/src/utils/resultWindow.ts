/* ES from+size 深分页窗口判定（默认 index.max_result_window=10000）。
   from = (page-1)*size，请求覆盖到的最后一条序号 = from+size；> limit 即被 ES 拒绝。 */
export function exceedsResultWindow(page: number, size: number, limit = 10000): boolean {
  const p = Math.max(1, Math.floor(page) || 1);
  const s = Math.max(1, Math.floor(size) || 1);
  return (p - 1) * s + s > limit;
}
