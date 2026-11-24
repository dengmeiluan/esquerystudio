import { watch, type WatchSource } from 'vue';
import { useAuthStore } from '../stores/auth';

/**
 * 挂载期读取的身份门（1125）。
 *
 * 宿主换 token（飞书换号 / 账号切换）时，`auth.probed` 仍为 false 而 `canEndpoint` 会
 * fail-open——任何「挂载即拉取 / 定时轮询 / carry 回放」的读请求如果门，就会带着上一账号的
 * target 与现场发出去：只读也会 403 审计噪声，结果还会串到新账号界面。
 *
 * 三句式口径（与 DslQuery autoRunAllowed 等既有实现同源）：
 *   1. 后端关闭鉴权 → 放行；
 *   2. 探测尚未启动（独立挂载 / 测试宿主）→ 视同身份已定，放行；
 *   3. 否则必须身份落地且当前目标下该页可读。
 *
 * 注意 fail-closed 方向：**不能**写成 `!auth.probed || ...`（那会在探测完成前放行）。
 */
export function usePageIdentityGate(pageKey: string, targetId?: () => string | null | undefined) {
  const auth = useAuthStore();
  const target = () => (targetId ? targetId() : null);
  const allowed = () => auth.authDisabled
    || !auth.probeStarted
    || (auth.probed && auth.me != null && auth.canReadPage(pageKey, target()));
  return { auth, allowed };
}

/**
 * 门控的挂载期读取：不放行则挂起，身份或目标落地后补跑一次。
 *
 * `run` 必须幂等（通常就是一个 load 函数）。`extraSources` 用于额外触发补跑
 * （如页面自己的 index 选择变化），与身份/目标源合并监听。
 *
 * 返回 `{ allowed, run, pending }`——`run` 是可重复调用的安全入口（手动刷新也走它）。
 */
export function useGatedBootRead(
  pageKey: string,
  run: () => void | Promise<void>,
  opts: { targetId?: () => string | null | undefined; extraSources?: WatchSource[] } = {},
) {
  const { auth, allowed } = usePageIdentityGate(pageKey, opts.targetId);
  let pending = false;
  const flush = () => {
    if (!pending || !allowed()) return;
    pending = false;
    void run();
  };
  /* 手动/重复调用入口：放行即跑，否则挂起等身份落地（不会丢稿） */
  const trigger = () => {
    if (allowed()) { pending = false; void run(); return; }
    pending = true;
  };
  watch(
    () => [auth.probed, auth.authDisabled, auth.me?.username, opts.targetId ? opts.targetId() : null] as const,
    flush,
  );
  if (opts.extraSources?.length) watch(opts.extraSources, flush);
  return { allowed, run: trigger, pending: () => pending };
}
