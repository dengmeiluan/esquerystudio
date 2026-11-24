import { describe, it, expect } from 'vitest';
import { pushSample, trendTip, TREND_MAX } from '../trendHist';

/* 二百一十七批：诊断节点趋势采样纯逻辑——滚动窗口采样 + 悬浮摘要（HEAP/CPU 双列共用） */

describe('pushSample：滚动窗口采样', () => {
  it('按 key 推入并保留顺序', () => {
    const m = new Map<string, number[]>();
    pushSample(m, 'node-a', 10);
    pushSample(m, 'node-a', 20);
    pushSample(m, 'node-a', 30);
    expect(m.get('node-a')).toEqual([10, 20, 30]);
  });
  it('null / undefined / 非有限数按 0 兜底（214 批同口径）', () => {
    const m = new Map<string, number[]>();
    pushSample(m, 'n', null);
    pushSample(m, 'n', undefined);
    pushSample(m, 'n', Number('x'));
    expect(m.get('n')).toEqual([0, 0, 0]);
  });
  it('超出上限滚动丢弃最旧点（默认 TREND_MAX=30）', () => {
    const m = new Map<string, number[]>();
    for (let i = 1; i <= TREND_MAX + 5; i++) pushSample(m, 'n', i);
    const arr = m.get('n')!;
    expect(arr).toHaveLength(TREND_MAX);
    expect(arr[0]).toBe(6); // 1..5 已被滚动丢弃
    expect(arr[arr.length - 1]).toBe(TREND_MAX + 5);
  });
  it('自定义 max 生效', () => {
    const m = new Map<string, number[]>();
    for (let i = 1; i <= 4; i++) pushSample(m, 'n', i, 3);
    expect(m.get('n')).toEqual([2, 3, 4]);
  });
  it('多 key 互不影响（节点维度隔离）', () => {
    const m = new Map<string, number[]>();
    pushSample(m, 'a', 1);
    pushSample(m, 'b', 9);
    pushSample(m, 'a', 2);
    expect(m.get('a')).toEqual([1, 2]);
    expect(m.get('b')).toEqual([9]);
  });
});

describe('trendTip：趋势悬浮摘要', () => {
  it('undefined / 不足 2 点给「采样中」指引', () => {
    expect(trendTip(undefined)).toContain('采样中');
    expect(trendTip([])).toContain('采样中');
    expect(trendTip([42])).toContain('采样中');
    expect(trendTip([42])).toContain('满 2 次');
  });
  it('满 2 点给 近 N 次 min~max · 最新值', () => {
    expect(trendTip([10, 30, 20])).toBe('近 3 次采样：10% ~ 30% · 最新 20%');
  });
  it('数值取整展示（小数位纯噪音）', () => {
    expect(trendTip([10.4, 30.6])).toBe('近 2 次采样：10% ~ 31% · 最新 31%');
  });
  it('单点窗口恰好 2 点即可出线（min=max 也照显）', () => {
    expect(trendTip([55, 55])).toBe('近 2 次采样：55% ~ 55% · 最新 55%');
  });
  it('自定义单位', () => {
    expect(trendTip([1, 2], 'ms')).toBe('近 2 次采样：1ms ~ 2ms · 最新 2ms');
  });
});
