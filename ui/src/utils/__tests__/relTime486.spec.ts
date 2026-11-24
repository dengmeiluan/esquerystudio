/**
 * 四百八十六批：relTime 边界行为单测——相对时间是全站时间线/历史的高频展示，
 * 边界：未来时间戳（客户端时钟偏差）显示「刚刚」而非负数/跨年显示带年份/
 * 同年只显示月-日/非法输入回落 '-'。
 */
import { describe, it, expect } from 'vitest';
import { relTime } from '../format';

const NOW = new Date(2026, 8, 14, 12, 0, 0).getTime(); // 2026-09-14 12:00 本地

describe('relTime 边界（486 批）', () => {
  it('未来时间戳（时钟偏差）显示「刚刚」不出现负数', () => {
    expect(relTime(NOW + 5 * 60_000, NOW)).toBe('刚刚');
  });

  it('秒/分/时/天/周梯度', () => {
    expect(relTime(NOW - 30_000, NOW)).toBe('30s 前');
    expect(relTime(NOW - 5 * 60_000, NOW)).toBe('5m 前');
    expect(relTime(NOW - 3 * 3600_000, NOW)).toBe('3h 前');
    expect(relTime(NOW - 2 * 86400_000, NOW)).toBe('2d 前');
  });

  it('超一周回落月-日，跨年带年份', () => {
    expect(relTime(NOW - 10 * 86400_000, NOW)).toBe('09-04');
    expect(relTime(new Date(2025, 11, 30, 12).getTime(), NOW)).toBe('2025-12-30');
  });

  it('非法输入回落 -', () => {
    expect(relTime('not-a-date', NOW)).toBe('-');
    expect(relTime(null, NOW)).toBe('-');
  });
});
