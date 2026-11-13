/**
 * 1439：_rank_eval 体分档。
 *
 * 此前按 search 体处理：根键位给 query/sort/aggs（ES 拒绝），真正的 requests/metric
 * 一个不出。现在根层给 requests/metric；评估项给 request/ratings；metric 对象给指标键。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, rankEvalBodyKeyItems, rankEvalRequestKeyItems, rankEvalMetricKeyItems, rankEvalRegionAt,
} from '../utils/dslCompletionContext';

describe('1439 _rank_eval 体', () => {
  it('bodyKind：_rank_eval 升 rank-eval-body（含相对写法）', () => {
    expect(bodyKindForPath('/_rank_eval', 'POST')).toBe('rank-eval-body');
    expect(bodyKindForPath('/idx/_rank_eval', 'POST')).toBe('rank-eval-body');
    expect(bodyKindForPath('idx/_rank_eval', 'POST')).toBe('rank-eval-body');
    expect(bodyKindForPath('/idx/_search', 'POST')).toBe('search');
  });

  it('区域：根 / requests 项 / metric 对象 / 深层', () => {
    const at = (s: string) => rankEvalRegionAt(s);
    expect(at('{"')).toBe('root');
    expect(at('{"requests": {"q1": {"')).toBe('request-item');
    expect(at('{"requests": {"q1": {"request": {"')).toBe('deep');
    expect(at('{"requests": {"')).toBe('deep');
    expect(at('{"metric": {"')).toBe('metric');
    expect(at('{"metric": {}}, "')).toBe('root');
  });

  it('键表：根 requests/metric；评估项 request/ratings；metric 五种指标', () => {
    expect(rankEvalBodyKeyItems().map(i => i.label)).toEqual(['requests', 'metric']);
    expect(rankEvalRequestKeyItems().map(i => i.label)).toEqual(['request', 'ratings']);
    expect(rankEvalMetricKeyItems().map(i => i.label)).toEqual([
      'dcg', 'ndcg', 'precision', 'recall', 'mean_reciprocal_rank',
    ]);
  });
});
