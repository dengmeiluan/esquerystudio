/**
 * 弹出层视口碰撞自适应单一真源（。
 *
 * 背景：CellContextMenu 等弹出层固定落在光标点 (x,y)，右/下溢出直接被视口裁掉——
 * 实报「索引列表首行右键看不到菜单，要滚动下去右键才能看全」。
 * 此处收口：给定期望点与实测尺寸，算出视口内的安全位置（右溢左翻、底溢上翻、四向钳位）。
 * 纯函数可无 DOM 单测；调用方（CellContextMenu 等）nextTick 实测后调用。
 */

/**
 * 视口内安全落点：
 * - 右缘溢出（x+w 超出）→ 向左翻到 x-w；
 * - 底缘溢出（y+h 超出）→ 向上翻到 y-h；
 * - 最终四向钳位在 [M, vw/vh - w/h - M]（菜单大于视口时贴 M 边，由 CSS 限高内滚兜底）。
 * 尺寸为 0（happy-dom 等无布局环境）数学上不翻，落点=期望点（与旧行为一致）。
 */
export function fitPopupPos(
  x: number, y: number, w: number, h: number,
  vw: number, vh: number, M = 8,
): { x: number; y: number } {
  let px = x, py = y;
  if (px + w > vw - M) px = Math.max(M, px - w);
  if (py + h > vh - M) py = Math.max(M, py - h);
  px = Math.min(Math.max(px, M), Math.max(M, vw - w - M));
  py = Math.min(Math.max(py, M), Math.max(M, vh - h - M));
  return { x: px, y: py };
}
