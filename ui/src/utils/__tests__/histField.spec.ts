import { describe, it, expect } from 'vitest';
import { isDateLikeValue, sniffDateField, pickHistField } from '../histField';

/* R90 契约：直方图日期字段选择——值形态驱动，字段名永远不足以入选 */

describe('isDateLikeValue', () => {
  it('ISO 日期字符串', () => {
    expect(isDateLikeValue('2024-06-11')).toBe(true);
    expect(isDateLikeValue('2024-06-11T10:00:00')).toBe(true);
    expect(isDateLikeValue('2024-06-11 10:00:00')).toBe(true);
  });
  it('epoch 毫秒/秒（2000~2100 窗口）', () => {
    expect(isDateLikeValue(1718064000000)).toBe(true);
    expect(isDateLikeValue(1718064000)).toBe(true);
  });
  it('产线事故锚：19 位长整型（parseJsonSafe 保真的字符串形态）不是日期', () => {
    expect(isDateLikeValue('2024061100006753137')).toBe(false);
  });
  it('19 位数字超出 epoch 窗口不是日期', () => {
    expect(isDateLikeValue(2024061100006753137)).toBe(false);
  });
  it('普通文本 / null / 布尔 / 小数字都不是', () => {
    expect(isDateLikeValue('hello')).toBe(false);
    expect(isDateLikeValue(null)).toBe(false);
    expect(isDateLikeValue(true)).toBe(false);
    expect(isDateLikeValue(42)).toBe(false);
  });
  it('形似 ISO 前缀的编号（无分隔）不是日期', () => {
    expect(isDateLikeValue('20240611')).toBe(false);
  });
});

describe('sniffDateField', () => {
  it('R89 产线事故回归锚：sentimentId 名含 time 但值是长 ID，不得入选', () => {
    const hits = [{ _source: { sentimentId: '2024061100006753137', title: '新闻' } }];
    expect(sniffDateField(hits)).toBe('');
  });
  it('值形态入选 + 名字只做优先级加分', () => {
    const hits = [{ _source: { published: '2024-01-01', createTime: '2024-06-11T00:00:00' } }];
    expect(sniffDateField(hits)).toBe('createTime');
  });
  it('无名字加分时退回首个日期形态字段', () => {
    const hits = [{ _source: { published: '2024-01-01', title: 'x' } }];
    expect(sniffDateField(hits)).toBe('published');
  });
  it('epoch 毫秒数值字段可入选', () => {
    const hits = [{ _source: { ts: 1718064000000 } }];
    expect(sniffDateField(hits)).toBe('ts');
  });
  it('空 hits / 空 _source 安全返回空串', () => {
    expect(sniffDateField([])).toBe('');
    expect(sniffDateField([{ _source: {} }])).toBe('');
  });
});

describe('pickHistField', () => {
  it('mapping date 字段最优先且偏好 time/date 名', () => {
    expect(pickHistField(['expireAt', 'createTime'], [])).toBe('createTime');
  });
  it('mapping 无 time/date 名时取首个', () => {
    expect(pickHistField(['expireAt'], [])).toBe('expireAt');
  });
  it('mapping 为空走 hits 嗅探', () => {
    expect(pickHistField([], [{ _source: { d: '2024-01-01' } }])).toBe('d');
  });
  it('mapping 与 hits 都无候选返回空串（不注入聚合）', () => {
    expect(pickHistField([], [{ _source: { sentimentId: '2024061100006753137' } }])).toBe('');
  });
});
