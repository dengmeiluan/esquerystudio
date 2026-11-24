/**
 * utils/format 时间/时长单源三函数行为看守：
 *  - fmtHms：HH:mm:ss 24h 补零（epoch/ISO 串/Date 三入口），非法与非正 epoch 恒 '—'；
 *  - fmtMs：semFormat duration 档包装，null/undefined 恒 '—'（无数据不冒充 0ms）；
 *  - fmtElapsed：Xmigrate humanElapsed 原语义（＜1s / 42s / 3m05s / 2h05m / 1d3h）。
 * 时间断言全部经本地时区构造器夹逼（跨时区 CI 确定性），不写死绝对时刻。
 */
import { describe, it, expect } from 'vitest';
import { fmtHms, fmtMs, fmtElapsed } from '../utils/format';

describe('fmtHms（HH:mm:ss 24h 补零）', () => {
  it('epoch 毫秒 → 补零三段（本地时口径）', () => {
    expect(fmtHms(new Date(2026, 0, 15, 9, 5, 3).getTime())).toBe('09:05:03');
    expect(fmtHms(new Date(2026, 0, 15, 23, 59, 59).getTime())).toBe('23:59:59');
    expect(fmtHms(new Date(2026, 0, 15, 0, 0, 0).getTime())).toBe('00:00:00');
  });

  it('ISO 串与 Date 实例同档（三入口一致）', () => {
    const d = new Date(2026, 4, 20, 14, 30, 9);
    expect(fmtHms('2026-05-20T14:30:09')).toBe('14:30:09');
    expect(fmtHms(d)).toBe('14:30:09');
    expect(fmtHms(d.getTime())).toBe('14:30:09');
  });

  it('非法/非正 epoch 恒「—」', () => {
    expect(fmtHms(0)).toBe('—');
    expect(fmtHms(-5)).toBe('—');
    expect(fmtHms(Number.NaN)).toBe('—');
    expect(fmtHms('not-a-date')).toBe('—');
  });
});

describe('fmtMs（semFormat duration 档包装）', () => {
  it('空值恒「—」（无数据不冒充 0ms）', () => {
    expect(fmtMs(null)).toBe('—');
    expect(fmtMs(undefined)).toBe('—');
  });

  it('档位随 duration 单源：<1000 原值 ms、≥1000 一位小数秒', () => {
    expect(fmtMs(0)).toBe('0 ms');
    expect(fmtMs(500)).toBe('500 ms');
    expect(fmtMs(999)).toBe('999 ms');
    expect(fmtMs(1000)).toBe('1.0s');
    expect(fmtMs(90000)).toBe('90.0s');
  });
});

describe('fmtElapsed（耗时人话档，Xmigrate humanElapsed 原语义）', () => {
  it('空值「—」；<1s 恒「<1s」（0 也是进行中瞬时）', () => {
    expect(fmtElapsed(null)).toBe('—');
    expect(fmtElapsed(undefined)).toBe('—');
    expect(fmtElapsed(0)).toBe('<1s');
    expect(fmtElapsed(999)).toBe('<1s');
  });

  it('秒/分秒/时分/天时四档（次级单位补零）', () => {
    expect(fmtElapsed(1000)).toBe('1s');
    expect(fmtElapsed(42000)).toBe('42s');
    expect(fmtElapsed(185000)).toBe('3m05s');
    expect(fmtElapsed(7500000)).toBe('2h05m');
    expect(fmtElapsed(90000000)).toBe('1d1h');
  });
});
