/* 表单型 n-modal 的 Enter=提交（便捷性/快捷性）。
 * ConfirmModal 的 Enter=确认是「中性焦点才接管」（44 批）；表单弹窗语义相反——
 * 焦点通常就停在 input 上，input+Enter=提交是表单惯例，不接管则每次都要鼠标够按钮。
 * 接管条件（全部满足）：
 * - 弹窗可见，且焦点是单行 INPUT 且位于 n-modal 的 body 容器（.n-modal-container）内；
 * TEXTAREA（多行 JSON 要换行）/BUTTON/SELECT/可编辑区一律放行原生行为；
 * - 非 IME 组合输入（isComposing/keyCode 229 的 Enter 是选词确认，不是提交意图）；
 * - can() 可选提交闸，与主按钮 disabled 同口径（JSON 合法性/必填项/请求中），false 不提交。
 * 本钩子只等价于「点击主按钮」：提交函数自身的防重入（creating/saving）与
 * 二次确认（askConfirm）原样生效，钩子不绕过它们。 */
import { onBeforeUnmount, type Ref } from 'vue';
import { confirmState } from './confirm';

export function useModalEnter(show: Ref<boolean>, submit: () => void, can?: () => boolean): void {
  function onKey(e: KeyboardEvent) {
    if (!show.value || e.key !== 'Enter') return;
    if (e.isComposing || e.keyCode === 229) return;
    /* 确认层在场时让路——表单弹窗 Enter 弹出二次确认（askConfirm 或
 模板内 ConfirmModal 实例）后焦点仍停在表单 input 上，此时再按 Enter 用户
 意图是「确认」，若这里再触发 submit，confirm.ts 的旧 resolver 会被按取消
 收掉、确认框重闪（doCreate/doResume 等会二次入队）。让给 ConfirmModal
 自己的 Enter=确认逻辑（44 批）。两层判断：全局确认服务单例 + 任意
 ConfirmModal 实例的 .cf-mask 遮罩（模板内 v-model:show 实例不走 confirmState）。 */
    if (confirmState.show || document.querySelector('.cf-mask')) return;
    const el = document.activeElement as HTMLElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    if (!el.closest('.n-modal-container')) return;
    if (can && !can()) return;
    submit();
  }
  window.addEventListener('keydown', onKey);
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
}
