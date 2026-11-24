/**
 * 1439：_field_caps / _terms_enum 体分档。
 *
 * 两端点此前按 search 体处理（根键给 sort/aggs，真正字段 fields/index_filter 不出）。
 * 现在根层给各自官方键；index_filter 内是 Query DSL，回落到整棵查询补全；
 * terms_enum 的 field 值位给查询字段名。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, dslContext, fieldCapsBodyKeyItems, termsEnumBodyKeyItems, indexFilterRegionAt,
} from '../utils/dslCompletionContext';

describe('1439 field_caps / terms_enum 体', () => {
  it('bodyKind：两端点各自成档；相对写法同档', () => {
    for (const p of ['/idx/_field_caps', '/_field_caps', 'idx/_field_caps']) {
      expect(bodyKindForPath(p, 'POST'), p).toBe('field-caps-body');
    }
    for (const p of ['/idx/_terms_enum', '/_terms_enum', 'idx/_terms_enum']) {
      expect(bodyKindForPath(p, 'POST'), p).toBe('terms-enum-body');
    }
    expect(bodyKindForPath('/idx/_search', 'POST')).toBe('search');
  });

  it('区域：根 / index_filter（查询）/ 深层', () => {
    const at = (s: string) => indexFilterRegionAt(s);
    expect(at('{"')).toBe('root');
    expect(at('{"index_filter": {"')).toBe('query');
    expect(at('{"index_filter": {"bool": {"')).toBe('query');
    expect(at('{"fields": {')).toBe('deep');
    expect(at('{"index_filter": {"term": {"f": "x"}}}, "')).toBe('root');
  });

  it('dslContext：根级 index_filter 是查询容器（字段/算子补全回落）', () => {
    const E = (s: string) => dslContext(s, s.length);
    expect(E('{"index_filter": {')).toMatchObject({ kind: 'query-type' });
    expect(E('{"index_filter": {"match": {')).toMatchObject({ kind: 'field', clause: 'match' });
    expect(E('{"index_filter": {"bool": {"')).toMatchObject({ kind: 'query-body-key', op: 'bool' });
  });

  it('键表：field_caps 三键；terms_enum 七键', () => {
    expect(fieldCapsBodyKeyItems().map(i => i.label)).toEqual(['fields', 'index_filter', 'runtime_mappings']);
    expect(termsEnumBodyKeyItems().map(i => i.label)).toEqual([
      'field', 'string', 'size', 'case_insensitive', 'index_filter', 'timeout', 'search_after',
    ]);
  });
});
