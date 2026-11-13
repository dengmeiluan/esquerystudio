/**
 * 二百三十批 P1-7：shardsHint 纯函数（部分分片失败文案）。
 * 锁定：failed/timed_out>0 才提示；两者都有合并；total 展示；缺失/全成功返回 null。
 */
import { describe, it, expect } from 'vitest';
import { shardsHint } from '../utils/shardsHint';

describe('shardsHint（230 批 P1-7）', () => {
  it('缺失/全成功返回 null（不出黄条）', () => {
    expect(shardsHint(null)).toBeNull();
    expect(shardsHint(undefined)).toBeNull();
    expect(shardsHint({ total: 5, failed: 0, timed_out: 0 })).toBeNull();
    expect(shardsHint({})).toBeNull();
  });

  it('只失败/只超时分别提示；都有合并；total 展示', () => {
    expect(shardsHint({ total: 6, failed: 2, timed_out: 0 })).toBe('部分分片未完成：2 个失败（共 6 个分片）——当前结果可能不完整');
    expect(shardsHint({ timed_out: 1 })).toBe('部分分片未完成：1 个超时——当前结果可能不完整');
    expect(shardsHint({ total: 6, failed: 2, timed_out: 1 })).toContain('2 个失败、1 个超时（共 6 个分片）');
  });
});
