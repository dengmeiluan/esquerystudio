/**
 * 688：直方图字段诊断 + 手动选择（用户实报「直方图呢？」）。
 *
 * 产线索引 bond_management_sentiment_title 的 mapping 只有：
 *   _class(keyword 常量) / sentimentId(keyword，19 位 ID) / title(text，无 .keyword)
 * 自动路径只认 date / 值形态，因此没有直方图是事实；但旧 UI 只给一句笼统「未识别到」。
 * 本批：逐字段诊断 + 手动选字段（keyword=词条、数值=固定桶宽、date=时间直方图）。
 */
import { describe, it, expect } from 'vitest';
import { analyzeHistFields, buildHistAgg, isIdLikeField, niceNumericInterval } from '../utils/histField';

const hit = (source: Record<string, unknown>) => ({ _source: source });

describe('字段诊断（688）', () => {
  it('产线索引：sentimentId 作弱候选（ID），_class 常量与 title text 给出原因', () => {
    const fields = [
      { path: '_class', type: 'keyword' },
      { path: 'sentimentId', type: 'keyword' },
      { path: 'title', type: 'text' },
    ];
    const hits = [
      hit({ _class: 'com.x.SentimentTitleEs', sentimentId: 2024062400006803602, title: 'a' }),
      hit({ _class: 'com.x.SentimentTitleEs', sentimentId: 2024121600007523062, title: 'b' }),
    ];
    const { candidates, rejected } = analyzeHistFields(fields, hits);
    expect(candidates.map(c => c.path)).toEqual(['sentimentId']);
    expect(candidates[0].weak).toBe(true);
    const reasons = Object.fromEntries(rejected.map(r => [r.path, r.reason]));
    expect(reasons._class).toContain('常量');
    expect(reasons.title).toContain('.keyword');
  });

  it('date / 低基 keyword / 数值度量均为候选；数值带桶宽', () => {
    const fields = [
      { path: '@timestamp', type: 'date' },
      { path: 'status', type: 'keyword' },
      { path: 'score', type: 'double' },
    ];
    const hits = [
      hit({ '@timestamp': '2026-01-01T00:00:00Z', status: 'A', score: 1 }),
      hit({ '@timestamp': '2026-01-02T00:00:00Z', status: 'B', score: 9 }),
    ];
    const { candidates } = analyzeHistFields(fields, hits);
    expect(candidates.map(c => [c.path, c.kind])).toEqual([
      ['@timestamp', 'date'], ['status', 'keyword'], ['score', 'numeric'],
    ]);
    expect(candidates.find(c => c.path === 'score')!.interval).toBeGreaterThan(0);
  });

  it('text 有 .keyword 子字段：子字段入选、父字段不重复报错', () => {
    const fields = [{ path: 'title', type: 'text' }, { path: 'title.keyword', type: 'keyword' }];
    const hits = [hit({ title: 'a' }), hit({ title: 'b' })];
    const { candidates, rejected } = analyzeHistFields(fields, hits);
    expect(candidates.map(c => c.path)).toEqual(['title.keyword']);
    expect(rejected.some(r => r.path === 'title')).toBe(false);
  });

  it('ID 类数值 / 数组 / 常量 keyword 不进入自动候选', () => {
    const fields = [
      { path: 'dm_id', type: 'long' },
      { path: 'topicIdArray', type: 'long' },
      { path: 'env', type: 'keyword' },
    ];
    const hits = [hit({ dm_id: 1, topicIdArray: [1, 2], env: 'prod' }), hit({ dm_id: 2, topicIdArray: [3], env: 'prod' })];
    const { candidates, rejected } = analyzeHistFields(fields, hits);
    expect(candidates).toEqual([]);
    expect(rejected.map(r => r.path).sort()).toEqual(['dm_id', 'env', 'topicIdArray']);
  });

  it('isIdLikeField：sentimentId/dm_id/comUniCode 命中；status/score 不误伤', () => {
    expect(isIdLikeField('sentimentId')).toBe(true);
    expect(isIdLikeField('dm_id')).toBe(true);
    expect(isIdLikeField('status')).toBe(false);
    expect(isIdLikeField('score')).toBe(false);
  });

  it('显式数值选择走 histogram 固定桶宽；无 interval 保持旧契约', () => {
    expect(buildHistAgg('score', 'double', false, 5)).toEqual({ histogram: { field: 'score', interval: 5 } });
    expect(buildHistAgg('eventTs', 'long', false)).toEqual({ auto_date_histogram: { field: 'eventTs', buckets: 60 } });
    expect(niceNumericInterval(0, 100)).toBe(5);
  });
});
