/**
 * 四百七十一批：useNow 行为单测——R86 全站相对时间共享心跳（模块级单例 30s），
 * 此前零直测。契约：单例共享（多次调用同一 ref）/30s 心跳推进/模块常驻不停摆
 * （SPA 生命周期语义——不随组件卸载清定时器，测试用卸载后心跳仍走证明）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const nowModule = await import('../useNow');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useNow 行为契约（471 批）', () => {
  it('单例共享：多次 useNow 返回同一 ref，心跳全局推进', async () => {
    const a = nowModule.useNow();
    const b = nowModule.useNow();
    expect(a).toBe(b);
    const t0 = Date.now(); /* 模块初始化用真实时钟，fake 推进从当前系统时间起算 */
    await vi.advanceTimersByTimeAsync(30_000);
    expect(a.value).toBeGreaterThanOrEqual(t0);
    expect(a.value).toBeGreaterThan(t0 - 1000);
    expect(b.value).toBe(a.value);
  });

  it('组件卸载后心跳仍走（SPA 常驻语义，非组件作用域定时器）', async () => {
    const now1 = nowModule.useNow();
    const base = Date.now();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(now1.value).toBeGreaterThanOrEqual(base + 25_000); /* 60s 窗口至少一次 30s tick，留 5ms fake tick 误差 */
  });
});
