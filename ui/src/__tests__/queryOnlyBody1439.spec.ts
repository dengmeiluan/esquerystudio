/**
 * 1439：只收 query 的体（_count / _explain / _validate/query）与模板执行/渲染体。
 *
 * 这些端点此前一律按 search 体处理：根键位给 sort/aggs/size（ES 直接 400），
 * 而真正的根键（count 的 query、模板的 id/source/params）一个都不出。
 * _msearch 是 NDJSON：头行给请求头键、查询体行回落 search；_msearch/template 体行给模板键。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, queryOnlyBodyKeyItems, templateSearchBodyKeyItems, queryWriteRegionAt, rootOnlyRegionAt,
} from '../utils/dslCompletionContext';

describe('1439 query-only / 模板体 / _msearch 分档', () => {
  it('bodyKind：count/explain/validate → query-body；模板 → template-search-body；_msearch → msearch-body', () => {
    for (const p of ['/idx/_count', '/_count', '/idx/_explain/1', '/idx/_validate/query']) {
      expect(bodyKindForPath(p, 'POST'), p).toBe('query-body');
    }
    for (const p of ['/idx/_search/template', '/_render/template', '/idx/_search/template?pretty']) {
      expect(bodyKindForPath(p, 'GET'), p).toBe('template-search-body');
    }
    /* 1439 迁移：_msearch 升 msearch-body（头行键补全）；模板版维持无档 */
    for (const p of ['/_msearch', '/idx/_msearch']) {
      expect(bodyKindForPath(p, 'POST'), p).toBe('msearch-body');
    }
    expect(bodyKindForPath('/idx/_msearch/template', 'POST')).toBe('msearch-template-body');
    /* 相对写法（用户没敲前导斜杠）同样分档——段匹配不是裸 includes */
    expect(bodyKindForPath('_msearch', 'POST')).toBe('msearch-body');
    expect(bodyKindForPath('_msearch/template', 'POST')).toBe('msearch-template-body');
    expect(bodyKindForPath('_count', 'POST')).toBe('query-body');
    expect(bodyKindForPath('logs/_count', 'GET')).toBe('query-body');
    expect(bodyKindForPath('logs/_search/template', 'POST')).toBe('template-search-body');
    expect(bodyKindForPath('/my_count_index/_search', 'POST')).toBe('search');
    expect(bodyKindForPath('/idx/_search', 'POST')).toBe('search');
    expect(bodyKindForPath('/idx/_explainable_thing')).toBe('search');
  });

  it('区域：query-only 的根/query；模板体只有根层', () => {
    const q = (s: string) => queryWriteRegionAt(s, s.length);
    expect(q('{"')).toBe('root');
    expect(q('{"query": {"')).toBe('query');
    expect(q('{"query": {"term": {"f": "x"}}}, "')).toBe('root');
    const r = (s: string) => rootOnlyRegionAt(s, s.length);
    expect(r('{"')).toBe('root');
    expect(r('{"source": {"')).toBe('deep');
    expect(r('{"params": {"')).toBe('deep');
  });

  it('键表：query-only 只有 query；模板体 id/source/params', () => {
    expect(queryOnlyBodyKeyItems().map(i => i.label)).toEqual(['query']);
    expect(templateSearchBodyKeyItems().map(i => i.label)).toEqual(['id', 'source', 'params']);
  });
});
