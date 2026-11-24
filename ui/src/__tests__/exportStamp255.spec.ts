/**
 * 二百五十五批：导出文件名统一——exportStamp 时间戳（yyyyMMdd-HHmmss 本地时）。
 * 全站 downloadText 口径自此一致：可读时间戳替代 epoch 大数，多次导出不互覆、按名可排序；
 * QRT 旧固定名 table-export.csv（多次导出互相覆盖）一并根治。
 */
import { describe, it, expect } from 'vitest';
import { exportStamp } from '../utils/format';

describe('exportStamp（255 批）', () => {
  it('固定日期 → yyyyMMdd-HHmmss 补零', () => {
    expect(exportStamp(new Date(2026, 8, 11, 17, 9, 5))).toBe('20260911-170905');
    expect(exportStamp(new Date(2026, 11, 31, 23, 59, 59))).toBe('20261231-235959');
    expect(exportStamp(new Date(2026, 0, 1, 0, 0, 0))).toBe('20260101-000000');
  });
});
