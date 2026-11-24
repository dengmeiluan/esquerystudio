/* 行级右键菜单的键盘入口——菜单键 / Shift+F10 与鼠标右键打开同一菜单。
 锚点取聚焦行盒左下角 +12px，与各页既有鼠标/键盘菜单的位置口径一致。 */
export function isMenuKey(e: KeyboardEvent): boolean {
  return e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey);
}

export function menuKeyAnchor(e: { currentTarget: EventTarget | null }, dx = 12): { x: number; y: number } {
  const r = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect();
  if (!r) return { x: 0, y: 0 };
  return { x: r.left + dx, y: r.bottom };
}
