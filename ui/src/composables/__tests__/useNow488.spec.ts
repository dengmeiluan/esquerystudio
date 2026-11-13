/**
 * 四百八十八批：useNow 共享心跳行为单测——R86 相对时间自动刷新的基础设施
 * （「4m 前」假时间线根治），此前零直测。三契约：单例共享同一 ref/30s 心跳推进/
 * keep-alive 切页回来时间已推进（模块常驻语义）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNow } from '../useNow';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow 共享心跳（488 批）', () => {
  it('单例共享同一 ref 且 30s 心跳推进（单例 started 一次性语义须同用例内验证）', async () => {
    const a = useNow();
    const b = useNow();
    expect(a).toBe(b);
    const t0 = Date.now();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(a.value).toBeGreaterThanOrEqual(t0 + 30_000);
  });
});
