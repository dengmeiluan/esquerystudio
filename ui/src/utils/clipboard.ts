/* v4：剪贴板架构层统一管线（全站唯一复制出口 format.copyText 委托至此）。
 三层语义，每层可靠性递进：
 ┌ L1 Clipboard API（secure context）——现代标准，最可靠；
 ├ L2 copy 事件劫持——execCommand('copy') 仅作触发器，ClipboardEvent.clipboardData.setData
 │ 做权威写入。事件派发是同步的、写入与选区/焦点错位无关，从机制上消灭
 │ 「toast 已复制但 Ctrl+V 空」的假成功（用户产线实报：http+iframe 下
 │ execCommand 复制了宿主空选区却返回 true）；
 └ L3 焦点门——document.hasFocus() 为假先 window.focus()（同源 iframe 允许自我
 聚焦）；焦点仍拿不到 → 返回 false，由调用方显性报错并引导「点击全选+Ctrl+C」
 （原生系统复制路径，100% 可靠）。 */

let installed = false;
let pendingCopy: string | null = null;

/** 全局安装一次：拦截 copy 事件，把 pendingCopy 权威写入剪贴板。
 pendingCopy 为 null 时直通（绝不劫持用户手动 Ctrl+C）。 */
export function installClipboardInterceptor(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('copy', (e: ClipboardEvent) => {
    if (pendingCopy == null) return;
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', pendingCopy);
      e.preventDefault();
    }
    pendingCopy = null;
  });
}

/** L2：execCommand('copy') 触发同步 copy 事件 → 拦截器 setData 权威写值。
 返回 false = 焦点不在本文档、事件未派发（pendingCopy 已回滚），调用方走 L3。 */
export function copyViaIntercept(text: string): boolean {
  installClipboardInterceptor();
  if (!document.hasFocus()) window.focus();
  if (!document.hasFocus()) return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, text.length);
  pendingCopy = text;
  const ok = document.execCommand('copy');
  /* copy 事件同步派发：执行到这里 pendingCopy 已被拦截器消费；
 仍非 null = 事件未派发（无焦点/无权限），回滚防串包（否则会劫持用户下次手动 Ctrl+C） */
  const dispatched = pendingCopy == null;
  pendingCopy = null;
  document.body.removeChild(ta);
  if (document.activeElement === ta) ta.blur?.();
  return ok && dispatched;
}
