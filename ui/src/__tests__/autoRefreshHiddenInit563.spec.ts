/**
 * 五百六十三批（轨5 自适应与全栈）：useAutoRefresh「挂载即隐藏」初始化盲区收口。
 * 533 批发现的静默失效类②（hidden 短路缺失）之初始化路径变体：composable 此前
 * pageVisible 恒初始化 true——后台标签页首载（document.hidden 已为 true）时没有
 * visibilitychange 事件可听，首个 tick 起轮询照跑，直到用户切回标签页才停。
 * 修复：初始化改读 document.hidden 实值（composables/useAutoRefresh.ts），
 * hidden 短路在首轮 tick 前即生效；恢复可见走既有 onVis 重排路径续跑。
 * 与既有 useAutoRefresh.spec/383/556 契约锁零重叠（它们全部在 hidden=false 下挂载）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAutoRefresh } from '../composables/useAutoRefresh';

afterEach(() => {
  vi.useRealTimers();
  /* 还原 document.hidden，防污染同进程其它用例（既有 spec 同款 defineProperty 口径） */
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

describe('五百六十三批：useAutoRefresh 挂载即隐藏初始化盲区（533 类②变体）', () => {
  it('挂载时 document.hidden=true：setOn(true) 后轮询静默，恢复可见（visibilitychange）后续跑', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const fn = vi.fn();
    const r = useAutoRefresh(fn, { ms: () => 100 });
    r.setOn(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(fn, '挂载即隐藏：hidden 短路须在首轮 tick 前生效（修复前 pageVisible 恒 true 照跑）')
      .toHaveBeenCalledTimes(0);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(250);
    expect(fn, '恢复可见后经 onVis 重排定时器续跑').toHaveBeenCalledTimes(2);
    r.stop();
  });

  it('挂载时可见（常态）：行为与既有契约零回归——setOn(true) 按周期触发', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const r = useAutoRefresh(fn, { ms: () => 100 });
    r.setOn(true);
    await vi.advanceTimersByTimeAsync(350);
    expect(fn).toHaveBeenCalledTimes(3);
    r.stop();
  });
});
