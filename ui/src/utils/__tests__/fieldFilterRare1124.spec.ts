import { describe, it, expect } from 'vitest';
import { typeFilterForOp, opsForType } from '../queryAstOps';

/* 1124：稀疏算子字段选择器类型收窄——修正被漏掉的合法类型（rank_features/geo_point），
 并让 percolator/semantic_text/稀疏向量/文本扩展只列对应字段；普通全文/精确算子仍不过滤。 */
describe('1124 稀疏算子字段类型过滤', () => {
  it('rank_feature 含 rank_features；distance_feature 含 geo_point', () => {
    expect(typeFilterForOp('rank_feature')).toEqual(['rank_feature', 'rank_features']);
    expect(typeFilterForOp('distance_feature')).toEqual(['date', 'date_nanos', 'geo_point']);
  });

  it('percolate / semantic / 向量与文本扩展收窄到专属类型', () => {
    expect(typeFilterForOp('percolate')).toEqual(['percolator']);
    expect(typeFilterForOp('semantic')).toEqual(['semantic_text']);
    expect(typeFilterForOp('sparse_vector')).toEqual(['sparse_vector']);
    expect(typeFilterForOp('weighted_tokens')).toEqual(['sparse_vector']);
    expect(typeFilterForOp('text_expansion')).toEqual(['text', 'sparse_vector']);
  });

  it('普通全文/精确算子保持只置顶不过滤（字段选择器不收窄）', () => {
    for (const op of ['term', 'terms', 'range', 'match', 'regexp', 'match_phrase_prefix']) {
      expect(typeFilterForOp(op), op).toBeUndefined();
    }
  });

  it('类型 → 推荐算子入口同步（semantic_text/percolator/rank_features）', () => {
    expect(opsForType('semantic_text')).toContain('semantic');
    expect(opsForType('percolator')).toContain('percolate');
    expect(opsForType('rank_features')).toContain('rank_feature');
  });
});
