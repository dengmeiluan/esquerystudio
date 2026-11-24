/* 弹窗焦点陷阱——Tab/Shift+Tab 循环锁在弹窗容器内，
 键盘用户不会 Tab 到遮罩背后的页面元素（自建 dialog 的 a11y 基线，
 ConfirmModal / GuardedActionButton / CmdPalette 共用）。 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 在容器的 keydown（或 window 级 keydown）里调用：拦下 Tab 并把焦点圈在 container 内 */
export function trapTabKey(container: HTMLElement, e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(n => !n.hasAttribute('hidden') && n.getAttribute('aria-hidden') !== 'true');
  if (!nodes.length) { e.preventDefault(); return; }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const cur = document.activeElement as HTMLElement | null;
  const inside = !!cur && container.contains(cur);
  if (e.shiftKey) {
    /* 反向：焦点在首个（或已逃逸）→ 圈回末个 */
    if (!inside || cur === first) { e.preventDefault(); last.focus(); }
  } else {
    /* 正向：焦点在末个（或已逃逸）→ 圈回首个 */
    if (!inside || cur === last) { e.preventDefault(); first.focus(); }
  }
}
