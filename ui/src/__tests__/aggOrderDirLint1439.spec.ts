/**
 * 1439：聚合 order 方向值拼写（sort-order-typo 的聚合域）。
 *
 * {"aggs":{"a":{"terms":{"field":"x","order":{"_count":"dsc"}}}}} → ES 400：
 * 聚合排序方向与根级 sort 一样只认 asc/desc。此前该规则只看根级 sort。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const dirs = (obj: unknown) =>
  lintDsl(obj as any).filter((f: any) => f.rule === 'sort-order-typo');

describe('1439 聚合 order 方向值', () => {
  it('反向普查：asc/desc 合法、非聚合 order 不误判', () => {
    const legit = [
      { aggs: { a: { terms: { field: 'x', order: { _count: 'desc' } } } } },
      { aggs: { a: { terms: { field: 'x', order: { _key: 'asc' } } } } },
      { aggs: { a: { multi_terms: { terms: [{ field: 'a' }], order: { _key_as_string: 'asc' } } } } },
      /* 子聚合名作排序键 + 方向 */
      { aggs: { a: { terms: { field: 'x' }, aggs: { m: { avg: { field: 'v' } } } }, b: { terms: { field: 'y', order: { m: 'asc' } } } } },
    ];
    for (const dsl of legit) expect(dirs(dsl), JSON.stringify(dsl)).toEqual([]);
  });

  it('dsc / ascendant 等方向写错被点名并给建议', () => {
    const cases: Array<[string, unknown, string]> = [
      ['dsc', { aggs: { a: { terms: { field: 'x', order: { _count: 'dsc' } } } } }, 'desc'],
      ['ascendant', { aggs: { a: { terms: { field: 'x', order: { _key: 'ascendant' } } } } }, 'asc'],
      ['des', { aggs: { a: { terms: { field: 'x', order: { _count: 'des' } } } } }, 'desc'],
    ];
    for (const [name, dsl, near] of cases) {
      const f = dirs(dsl);
      expect(f.length, name).toBe(1);
      expect(f[0].message, name).toContain(near);
      expect(f[0].severity, name).toBe('warning');
    }
  });

  it('顶层 order（非 aggs 语境）不归本规则——避免与根级 sort 规则重复', () => {
    expect(dirs({ order: { _count: 'dsc' } })).toEqual([]);
  });

  it('负控：同一判据喂合法方向必须空、喂错误方向必须非空', () => {
    expect(dirs({ aggs: { a: { terms: { field: 'x', order: { _count: 'asc' } } } } })).toEqual([]);
    expect(dirs({ aggs: { a: { terms: { field: 'x', order: { _count: 'dsc' } } } } }).length).toBe(1);
  });
});
