import { reactive } from 'vue';
import { writeStoredRaw } from '../utils/safeJson';

/**
 * 全局确认服务——原生 window.confirm() 全站禁用后的唯一替代。
 * App.vue 挂唯一 ConfirmModal 宿主消费本状态；视图侧 `await askConfirm({...})` 即可，
 * 无需自己挂组件、管 show 状态。
 *
 * 分级约定：
 * - info 可逆操作
 * - warn 真实写操作（默认）
 * - critical 不可逆毁灭性操作，强制输入 guardText 守卫
 */
/** 高危确认的关键标识符具名行（快照名/别名→索引/taskId 等），渲染在正文与守卫框之间 */
export interface ConfirmFact { label: string; value: string }

export interface ConfirmOptions {
  title: string;
  message?: string;
  level?: 'info' | 'warn' | 'critical';
  guardText?: string;
  okText?: string;
  facts?: ConfirmFact[];
  /**
 * W10：确认频次防呆——会话级「不再询问」开关。
 * 仅 warn/info 由调用方按需显式开启；critical / guardText 永不生效
 * （ConfirmModal 侧不渲染 checkbox，双保险）。开启后弹窗带「本次会话不再询问」，
 * 勾选并确认 → 按 title 哈希写 sessionStorage（es_confirm_skip:<hash>），
 * 本会话内同标题的 askConfirm 直接 resolve true 不再弹。
 * 缺省 false：全站存量调用点零行为变化（按需逐点开启，不批量开）。
 */
  dismissable?: boolean;
}

export const confirmState = reactive({
  show: false,
  title: '',
  message: '',
  level: 'warn' as 'info' | 'warn' | 'critical',
  guardText: '',
  okText: '确认执行',
  facts: [] as ConfirmFact[],
  dismissable: false,
});

/* W10：会话级跳过键前缀。title 可能含动态标识符且可能很长，
 键取 djb2 哈希 base36（sessionStorage 键无可读性诉求，短键防配额浪费） */
const SKIP_PREFIX = 'es_confirm_skip:';

export function confirmTitleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function isConfirmSkipped(title: string): boolean {
  try { return sessionStorage.getItem(SKIP_PREFIX + confirmTitleHash(title)) === '1'; }
  catch { return false; }
}

export function rememberConfirmSkip(title: string): void {
  writeStoredRaw(sessionStorage, SKIP_PREFIX + confirmTitleHash(title), '1');
}

let resolver: ((v: boolean) => void) | null = null;

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  // 极端情况：上一个确认还没落就来了新请求——旧的按「取消」收掉，避免 Promise 悬挂
  resolver?.(false);
  // W10：同标题已被「本次会话不再询问」放过 → 直接 resolve true 不弹。
  // 仅显式 dismissable 的调用参与；critical/guardText 由 ConfirmModal 不给 checkbox 兜底。
  if (opts.dismissable && isConfirmSkipped(opts.title)) return Promise.resolve(true);
  Object.assign(confirmState, { level: 'warn', message: '', guardText: '', okText: '确认执行', facts: [] as ConfirmFact[], dismissable: false }, opts, { show: true });
  // opts.facts 显式 undefined 时 Object.assign 会把数组覆盖回 undefined——统一规范成空数组（防上次残留串扰）
  confirmState.facts = opts.facts ?? [];
  return new Promise<boolean>(res => { resolver = res; });
}

export function resolveConfirm(v: boolean) {
  confirmState.show = false;
  resolver?.(v);
  resolver = null;
}
