/**
 * 三百八十六批：useQueryRun 行为级单测——382 批竞态根治（begin 再入 abort 旧信号）
 * 此前只有源码锁，本批用假定时器实测五契约：begin 启动读秒/finish 停止清零/
 * cancel 中止/begin 再入作废旧信号（382 核心语义）/finish 后 cancel 幂等不炸。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useQueryRun } from '../useQueryRun';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useQueryRun 行为契约（386 批）', () => {
  it('begin 启动 running+读秒走动；finish 停止且计时归零停走', async () => {
    vi.useFakeTimers();
    const qr = useQueryRun();
    expect(qr.running.value).toBe(false);
    qr.begin();
    expect(qr.running.value).toBe(true);
    expect(qr.elapsedMs.value).toBe(0);
    await vi.advanceTimersByTimeAsync(1100);
    expect(qr.elapsedMs.value, '读秒走动').toBeGreaterThanOrEqual(1000);
    qr.finish();
    expect(qr.running.value).toBe(false);
    const frozen = qr.elapsedMs.value;
    await vi.advanceTimersByTimeAsync(2000);
    expect(qr.elapsedMs.value, 'finish 后读秒停走').toBe(frozen);
  });

  it('begin 再入：旧 signal 被作废（aborted=true），新 signal 正常——382 竞态根治语义', () => {
    const qr = useQueryRun();
    const s1 = qr.begin();
    expect(s1.aborted).toBe(false);
    const s2 = qr.begin();
    expect(s1.aborted, '旧请求信号作废（AbortError 丢弃）').toBe(true);
    expect(s2.aborted).toBe(false);
  });

  it('cancel 中止当前 signal；finish 后 cancel 幂等不炸', () => {
    const qr = useQueryRun();
    const s = qr.begin();
    qr.cancel();
    expect(s.aborted).toBe(true);
    qr.finish();
    expect(() => qr.cancel(), 'abortCtl 已置 null，optional chaining 幂等').not.toThrow();
  });
});
