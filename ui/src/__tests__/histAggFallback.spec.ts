/**
 * 直方图 terms 回退分档（「直方图不显示了」事故回归锚）：
 * industry_hotspots_review_es 的 publishDate 是 keyword 型，旧逻辑无条件注入
 * date_histogram → ES 400 → R90 降级剥 __hist → 直方图永久消失。
 * 分档后 keyword 走 terms(_key asc)，date/数值/未知维持 date_histogram 系。
 */
import { describe, it, expect } from 'vitest';
import { buildHistAgg } from '../utils/histField';

describe('buildHistAgg 直方图聚合体分档', () => {
  it('keyword 型（产线事故锚 publishDate）→ terms 桶 60 个按 key 升序', () => {
    expect(buildHistAgg('publishDate', 'keyword', false)).toEqual({
      terms: { field: 'publishDate', size: 60, order: { _key: 'asc' } },
    });
  });

  it('date 型照旧：6.5+ 用 auto_date_histogram 自动桶宽', () => {
    expect(buildHistAgg('@timestamp', 'date', false)).toEqual({
      auto_date_histogram: { field: '@timestamp', buckets: 60 },
    });
  });

  it('date 型老集群（<6.5）退回按天 interval（6.x 只认 interval）', () => {
    expect(buildHistAgg('logTime', 'date', true)).toEqual({
      date_histogram: { field: 'logTime', interval: 'day' },
    });
  });

  it('数值 epoch 型（long）不吃 terms 分档——date_histogram 接受数值字段', () => {
    expect(buildHistAgg('eventTs', 'long', false)).toEqual({
      auto_date_histogram: { field: 'eventTs', buckets: 60 },
    });
  });

  it('mapping 未知（inspect 失败）维持旧行为 date_histogram 系（R90 降级兜底仍有效）', () => {
    expect(buildHistAgg('sniffed', undefined, false)).toEqual({
      auto_date_histogram: { field: 'sniffed', buckets: 60 },
    });
  });
});
