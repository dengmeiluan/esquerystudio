/* 自定义列表/卡片行的键盘行导航：聚焦行内 ↑/↓ 在同级行间移动、Home/End 首末。
 只处理行自身聚焦（模板用 @keydown.self），行内输入框/按钮的按键保持原生。
 行需带 data-row-nav；无同级行时不动，也不拦截滚动。 */
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

export function rowArrowNav(e: KeyboardEvent, selector = '[data-row-nav]'): void {
  if (!NAV_KEYS.has(e.key)) return;
  const cur = e.currentTarget as HTMLElement | null;
  if (!cur?.parentElement) return;
  /* 只认同级行——嵌套列表（如别名组头 vs 组内索引行）不混入同一条移动序列 */
  const rows = Array.from(cur.parentElement.children)
    .filter(el => el.matches(selector) && el.getClientRects().length > 0) as HTMLElement[];
  if (rows.length < 2) return;
  const i = rows.indexOf(cur);
  if (i < 0) return;
  const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
    : Math.max(0, Math.min(rows.length - 1, i + delta));
  e.preventDefault();
  rows[next].focus();
}
