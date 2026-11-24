/**
 * 1439：EQL 检索体（POST /<索引>/_eql/search）。
 *
 * 默认路径分派把 _eql/search 当普通 search——query 值位给 DSL 算子、根键给 size/sort/aggs，
 * 但 EQL 的 query 是**字符串**、filter 才是 Query DSL，照着补全写下去 ES 直接解析失败。
 * 本批单列 eql-body：根键目录 + query 串骨架/关键字 + filter 回落整棵查询 + 根键 lint。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, eqlBodyKeyItems, eqlBodyRootKeys, eqlFilterRegionAt,
  EQL_VALUE_SNIPPETS, EQL_KEYWORD_SNIPPETS, dslContext,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

describe('1439 EQL 体分档', () => {
  it('路径分派：_eql/search → eql-body；普通 _search 不受影响', () => {
    expect(bodyKindForPath('/logs/_eql/search', 'POST')).toBe('eql-body');
    expect(bodyKindForPath('/_eql/search', 'POST')).toBe('eql-body');
    expect(bodyKindForPath('/logs/_search', 'POST')).toBe('search');
    expect(bodyKindForPath('/_search', 'POST')).toBe('search');
  });

  it('根键目录：query/filter + 时间字段/分页/异步保留', () => {
    expect(eqlBodyRootKeys).toEqual([
      'query', 'filter', 'case_sensitive', 'event_category_field', 'timestamp_field', 'tiebreaker_field',
      'size', 'fields', 'max_samples_per_key', 'keep_alive', 'keep_on_completion',
      'wait_for_completion_timeout', 'allow_partial_sequence_results', 'result_position',
      'runtime_mappings',
    ]);
    expect(eqlBodyKeyItems().find(i => i.label === 'filter')?.detail).toContain('Query DSL');
  });

  it('EQL 串骨架：any/process/sequence/sample 四类起步；关键字可中段插入', () => {
    expect(EQL_VALUE_SNIPPETS.map(s => s.label)).toEqual(['any where', 'process where', 'sequence by', 'sample by']);
    for (const k of ['where', 'and', 'or', 'not', 'by', 'with maxspan=', 'until']) {
      expect(EQL_KEYWORD_SNIPPETS.map(s => s.label), k).toContain(k);
    }
  });

  it('filter 区域：根层给根键；filter 内回落 Query DSL；其余子对象不出键', () => {
    expect(eqlFilterRegionAt('{}', 1)).toBe('root');
    expect(eqlFilterRegionAt('{"filter": {', 12)).toBe('query');
    expect(eqlFilterRegionAt('{"query": "any where true"', 27)).toBe('root');
    expect(eqlFilterRegionAt('{"filter": {"range": {', 20)).toBe('query');
    const deep = '{"runtime_mappings": {"f": {';
    expect(eqlFilterRegionAt(deep, deep.length)).toBe('deep');
    /* 根层值位仍是 root（区域只描述位置；值位由 W6 的「值位不出键」守卫压住） */
    expect(eqlFilterRegionAt('{"size": 10', 10)).toBe('root');
    /* filter 内确实是 Query DSL 上下文（match/term 等算子可出） */
    const ctx = dslContext('{"filter": {', 12);
    expect(ctx.kind).toBe('query-type');
  });

  it('根键 lint：官方键静默；拼错给「EQL 体」+ 最接近键', () => {
    expect(lintStructuredBody('eql-body', JSON.stringify({
      query: 'any where true',
      filter: { term: { 'event.category': 'process' } },
      size: 10,
    }))).toEqual([]);
    const f = lintStructuredBody('eql-body', JSON.stringify({ query: 'any where true', sizee: 10 }));
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('EQL 体');
    expect(f[0].message).toContain('最接近：size');
  });

  it('负控：EQL 体不套用 search 根键（sort/aggs 在这里是非法键）', () => {
    const f = lintStructuredBody('eql-body', JSON.stringify({ query: 'any where true', aggs: {} }));
    expect(f.length).toBe(1);
    expect(f[0].message).toContain('aggs');
  });
});
