/**
 * 1439：词项向量体（_termvectors、_mtermvectors）。
 *
 * 两端点此前误落 search 体：根键位给 query/sort/aggs，真正的 fields/doc/offsets/
 * term_statistics 一个不出。现在单文档给配置键，多文档根层给 docs/ids、
 * docs 元素给 _index/_id + 配置键；fields 值位给查询字段名。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, termvectorsKeyItems, mtermvectorsBodyKeyItems, mtermvectorsDocKeyItems,
} from '../utils/dslCompletionContext';

describe('1439 词项向量体', () => {
  it('bodyKind：_mtermvectors 先判、_termvectors 不吞多文档；不再落 search', () => {
    expect(bodyKindForPath('/idx/_mtermvectors', 'POST')).toBe('mtermvectors-body');
    expect(bodyKindForPath('_mtermvectors', 'POST')).toBe('mtermvectors-body');
    expect(bodyKindForPath('/idx/_termvectors/1', 'GET')).toBe('termvectors-body');
    expect(bodyKindForPath('idx/_termvectors/1', 'POST')).toBe('termvectors-body');
    expect(bodyKindForPath('/idx/_search', 'POST')).toBe('search');
  });

  it('键表：单文档十一键；多文档根 docs/ids；元素 = _index/_id + 单文档配置', () => {
    const tv = termvectorsKeyItems().map(i => i.label);
    expect(tv).toEqual([
      'fields', 'doc', 'filter', 'offsets', 'positions', 'term_statistics', 'field_statistics',
      'per_field_analyzer', 'routing', 'version', 'version_type',
    ]);
    expect(mtermvectorsBodyKeyItems().map(i => i.label)).toEqual(['docs', 'ids']);
    const doc = mtermvectorsDocKeyItems().map(i => i.label);
    expect(doc.slice(0, 2)).toEqual(['_index', '_id']);
    expect(doc.slice(2)).toEqual(tv);
  });
});
