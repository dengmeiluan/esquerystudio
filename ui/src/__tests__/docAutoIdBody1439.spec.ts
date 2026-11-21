/**
 * 1439：自增 ID 写入端点 POST /<索引>/_doc 的请求体是裸文档，不是 search 体。
 *
 * 缺陷形态：分档只看 '/_doc/'（带尾斜杠），自增 ID 路径没有 id 段 → 落 search 默认档，
 * 根键补全给 query/sort/aggs，文档字段被根键 lint 误报。目录里 POST /{index}/_doc
 * 又带骨架，用户从目录选中最容易踩中。
 */
import { describe, it, expect } from 'vitest';
import { bodyKindForPath } from '../utils/dslCompletionContext';
import { lintDsl, lintStructuredBody } from '../utils/dslLint';

describe('1439 自增 ID 文档体分档', () => {
  it('POST /<索引>/_doc（无尾斜杠/有尾斜杠/带查询串）都落 doc 档', () => {
    expect(bodyKindForPath('/logs/_doc', 'POST')).toBe('doc');
    expect(bodyKindForPath('/logs/_doc/', 'POST')).toBe('doc');
    expect(bodyKindForPath('/logs/_doc?refresh=wait_for', 'POST')).toBe('doc');
    expect(bodyKindForPath('/logs/_doc/1', 'PUT')).toBe('doc');
  });

  it('回归面：搜索/更新端点不被 doc 规则抢走', () => {
    expect(bodyKindForPath('/logs/_search', 'POST')).toBe('search');
    expect(bodyKindForPath('/logs/_update/1', 'POST')).toBe('update-body');
  });

  it('文档体 lint 零告警；负控：同一体按 search 档会被根键 lint 误报', () => {
    expect(lintStructuredBody('doc', '{"field": "value", "nested": {"k": 1}}')).toEqual([]);
    /* 负控证明修复前（落 search 档）确实会误报，而不是「怎么都绿」 */
    expect(lintDsl({ field: 'value' } as any, { fields: [] }).length).toBeGreaterThan(0);
  });
});
