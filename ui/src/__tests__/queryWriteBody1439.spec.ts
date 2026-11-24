/**
 * 1439：按查询删/改（_delete_by_query / _update_by_query）的体补全分档。
 *
 * 两个端点此前被当 search 体：根键位给 query/sort/aggs 全套（sort/aggs 写下去就是 400），
 * 而真正的根键 max_docs/slices/script/pipeline 一个都不出。现在根层给官方键，
 * query 内回落到整棵查询补全（match/term/bool/字段值语义照旧）。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, dbqBodyKeyItems, ubqBodyKeyItems, queryWriteRegionAt,
} from '../utils/dslCompletionContext';

describe('1439 按查询删/改体', () => {
  it('bodyKind：_delete_by_query→dbq、_update_by_query→ubq；普通 _search/_update 不受影响', () => {
    expect(bodyKindForPath('/idx/_delete_by_query', 'POST')).toBe('dbq-body');
    expect(bodyKindForPath('/idx/_update_by_query', 'POST')).toBe('ubq-body');
    expect(bodyKindForPath('/idx/_delete_by_query?conflicts=proceed', 'POST')).toBe('dbq-body');
    expect(bodyKindForPath('/idx/_search', 'POST')).toBe('search');
    expect(bodyKindForPath('/idx/_update/1', 'POST')).toBe('update-body');
  });

  it('区域：根 / query / script / 深层；query 闭合后回根', () => {
    const at = (s: string) => queryWriteRegionAt(s, s.length);
    expect(at('{"')).toBe('root');
    expect(at('{"query": {"')).toBe('query');
    expect(at('{"query": {"bool": {"must": [{"')).toBe('query');
    expect(at('{"query": {"match_all": {}}}, "')).toBe('root');
    expect(at('{"script": {"')).toBe('script');
    expect(at('{"script": {"params": {"')).toBe('deep');
    expect(at('{"max_docs": 10, "')).toBe('root');
  });

  it('键表：DBQ 只有 query/max_docs/slices/slice；UBQ 多 script/pipeline', () => {
    const dbq = dbqBodyKeyItems().map(i => i.label);
    expect(dbq).toEqual(['query', 'max_docs', 'slices', 'slice']);
    expect(dbq).not.toContain('script');
    expect(dbq).not.toContain('pipeline');
    const ubq = ubqBodyKeyItems().map(i => i.label);
    expect(ubq).toEqual(['query', 'script', 'max_docs', 'pipeline', 'slices']);
  });
});
