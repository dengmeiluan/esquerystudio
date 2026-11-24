/**
 * 三百八十三批：useAutoRefresh 行为级单测——310/358/375 等十余视图收编了它，
 * 但此前的锁定全是源码正则（改实现即碎、测不出时序行为）。本批用 vi.useFakeTimers
 * 实测四个核心契约：开关×间隔双门控/guard 跳轮/restart 重估间隔/stop 清定时器。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAutoRefresh } from '../useAutoRefresh';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAutoRefresh 行为契约（383 批）', () => {
  it('setOn(true)+ms>0 后按间隔重复执行；stop 后停', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const r = useAutoRefresh(fn, { ms: () => 1000 });
    r.setOn(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn, '启动即跑首轮（setInterval 立刻语义下首 tick 在 1s，启动时刻不跑）').toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);
    r.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn, 'stop 后不再执行').toHaveBeenCalledTimes(3);
  });

  it('ms=0 不启动；间隔 getter 变化后 restart 重排', async () => {
    vi.useFakeTimers();
    let ms = 0;
    const fn = vi.fn();
    const r = useAutoRefresh(fn, { ms: () => ms });
    r.setOn(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fn, 'ms=0 全程不跑').toHaveBeenCalledTimes(0);
    ms = 500;
    r.restart();
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('guard=false 跳轮不执行（恢复后继续）', async () => {
    vi.useFakeTimers();
    let ok = false;
    const fn = vi.fn();
    const r = useAutoRefresh(fn, { ms: () => 100, guard: () => ok });
    r.setOn(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(fn, 'guard 拒绝期不执行').toHaveBeenCalledTimes(0);
    ok = true;
    await vi.advanceTimersByTimeAsync(300);
    expect(fn, 'guard 放行后恢复执行').toHaveBeenCalledTimes(3);
  });

  it('setOn(false) 关闸：即使 ms>0 也不执行', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const r = useAutoRefresh(fn, { ms: () => 100 });
    r.setOn(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    r.setOn(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn, '关闸后停').toHaveBeenCalledTimes(1);
  });
});
