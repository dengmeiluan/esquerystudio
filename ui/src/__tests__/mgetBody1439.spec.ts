/**
 * 1439：多文档取回（_mget）体补全。
 *
 * 此前 _mget 落 none 档：根键位零候选、docs[] 元素内也零候选，用户只能凭记忆写
 * _index/_id/routing/_source。现在根层给 docs/ids，docs 元素对象内给官方文档级键，
 * ids 数组与更深层不出键（ids 是纯字符串数组）。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, mgetBodyKeyItems, mgetDocKeyItems, mgetRegionAt,
} from '../utils/dslCompletionContext';

describe('1439 _mget 体', () => {
  it('bodyKind：三种写法都归 mget-body；_msearch/_update 不被吞', () => {
    for (const p of ['/idx/_mget', '/_mget', '_mget', '/idx/_mget?pretty']) {
      expect(bodyKindForPath(p, 'POST'), p).toBe('mget-body');
    }
    expect(bodyKindForPath('/idx/_msearch', 'POST')).toBe('msearch-body');
    expect(bodyKindForPath('/idx/_update/1', 'POST')).toBe('update-body');
    expect(bodyKindForPath('/idx/_search', 'POST')).toBe('search');
  });

  it('区域：根 / docs 元素 / ids 数组与更深层', () => {
    const at = (s: string) => mgetRegionAt(s, s.length);
    expect(at('{"')).toBe('root');
    expect(at('{"docs": [{')).toBe('doc');
    expect(at('{"docs": [{"_id": "1", "')).toBe('doc');
    expect(at('{"docs": [{"_id": "1"}, {')).toBe('doc');
    expect(at('{"docs": [{"_source": {"')).toBe('deep');
    expect(at('{"ids": ["')).toBe('deep');
    expect(at('{"docs": [{"_id": "1"}]}')).toBe('root');
  });

  it('键表：根 docs/ids；文档项七个官方键', () => {
    expect(mgetBodyKeyItems().map(i => i.label)).toEqual(['docs', 'ids']);
    expect(mgetDocKeyItems().map(i => i.label)).toEqual([
      '_index', '_id', 'routing', '_source', 'stored_fields', 'version', 'version_type',
    ]);
  });
});
