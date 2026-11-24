/**
 * 二百二十七批 M7：fmtNum 大整数精度保真。
 * 背景：后端以字符串下发的雪花 ID/长单号/超大数值，此前 Number 化再 toLocaleString
 * 会输出丢精度错值（如 '12345678901234567890' → '12,345,678,901,234,567,000'）。
 * 锁定：超安全整数的纯数字字符串走正则千分位（位数原样）；安全整数/小数串/number 走原路；
 * null/空串仍显示 '-'（R57 语义不回归）。
 */
import { describe, it, expect } from 'vitest';
import { fmtNum } from '../utils/format';

describe('fmtNum 大整数保真（227 批 M7）', () => {
  it('超安全整数的数字字符串：正则千分位，位数零丢失', () => {
    expect(fmtNum('12345678901234567890')).toBe('12,345,678,901,234,567,890');
    expect(fmtNum('-98765432109876543210')).toBe('-98,765,432,109,876,543,210');
  });

  it('安全整数/小数字符串走原路（行为不变）', () => {
    expect(fmtNum('1234')).toBe('1,234');
    expect(fmtNum('1234567')).toBe('1,234,567');
    expect(fmtNum('3.14')).toBe('3.14');
    expect(fmtNum('abc')).toBe('abc');
  });

  it('number 输入行为不变', () => {
    expect(fmtNum(1234567)).toBe('1,234,567');
    expect(fmtNum(0)).toBe('0');
  });

  it('null/空串仍显示 "-"（R57 语义）', () => {
    expect(fmtNum(null)).toBe('-');
    expect(fmtNum(undefined)).toBe('-');
    expect(fmtNum('')).toBe('-');
  });
});
