/**
 * 三百九十三批：layout.ts 视口档位与分栏迁移行为单测——四轮响应式的档位内核
 * （getViewportProfile：embedded/compact/wide/standard 四档边界）与
 * clampPaneSize（pane 尺寸钳制：min/max/可用空间收缩）此前零直测。
 */
import { describe, it, expect } from 'vitest';
import { getViewportProfile, clampPaneSize } from '../layout';

describe('getViewportProfile 档位边界（393 批）', () => {
  it('embedded：窄宽或矮宽窗口（<900 / <1000∧<620）', () => {
    expect(getViewportProfile(899, 800)).toBe('embedded');
    expect(getViewportProfile(999, 619)).toBe('embedded');
    expect(getViewportProfile(1000, 619), '宽 1000 但高不足 620 不再 embedded').not.toBe('embedded');
  });

  it('compact：<1100 或高 <560', () => {
    expect(getViewportProfile(1099, 800)).toBe('compact');
    expect(getViewportProfile(1200, 559)).toBe('compact');
  });

  it('wide：≥1600；standard：居中区间', () => {
    expect(getViewportProfile(1600, 800)).toBe('wide');
    expect(getViewportProfile(1920, 1080)).toBe('wide');
    expect(getViewportProfile(1300, 700)).toBe('standard');
  });
});

describe('clampPaneSize 钳制（393 批）', () => {
  it('min/max 硬边界与可用空间收缩', () => {
    const pane = { id: 'p1', defaultSize: 50, min: 200, max: 800, preferred: 500 };
    expect(clampPaneSize(500, pane, 1000)).toBe(500);
    expect(clampPaneSize(100, pane, 1000), '低于 min 抬到 min').toBe(200);
    expect(clampPaneSize(900, pane, 1000), '高于 max 压到 max').toBe(800);
    expect(clampPaneSize(800, pane, 300), '可用空间不足时收缩').toBeLessThanOrEqual(300);
  });
});
