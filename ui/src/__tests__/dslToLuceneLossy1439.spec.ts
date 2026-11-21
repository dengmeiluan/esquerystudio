/**
 * 1439：DSL → Lucene 的「诚实报告」——query 之外的语义键不许静默丢弃。
 *
 * 语法桥只翻译 query；post_filter / sort / aggs / knn 等以前**一个字都不提示**就被丢掉，
 * 用户拿去看似等价、实际少了过滤/排序/聚合的 Lucene 去执行。
 *
 * 关键在判据不能变成噪音：构建器默认写 `sort: []`、`size: 20`——
 * 空排序和 Lucene 页默认页大小不算丢失，否则每次跳转都弹一条无意义告警。
 */
import { describe, it, expect } from 'vitest';
import { dslToLuceneDetailed } from '../utils/dslToLucene';

const lossyOf = (dsl: any) => dslToLuceneDetailed(dsl).lossy;

describe('1439 语法桥的丢失报告', () => {
  it('只有 query 时不报丢失', () => {
    expect(lossyOf({ query: { match: { title: 'x' } } })).toEqual([]);
  });

  it('构建器默认形态（空 sort / size 20）不算丢失', () => {
    expect(lossyOf({ query: { match_all: {} }, sort: [], size: 20 })).toEqual([]);
  });

  it('post_filter / sort / aggs 真的写了就点名', () => {
    const l = lossyOf({
      query: { match_all: {} },
      post_filter: { term: { status: 'A' } },
      sort: [{ publish_time: 'desc' }],
      aggs: { by: { terms: { field: 'status' } } },
    });
    expect(l.some(s => s.startsWith('post_filter'))).toBe(true);
    expect(l.some(s => s.startsWith('sort'))).toBe(true);
    expect(l.some(s => s.startsWith('aggs'))).toBe(true);
  });

  it('只剩 knn（没有 query）也要点名，而不是静默给 *', () => {
    const r = dslToLuceneDetailed({ knn: { field: 'v', query_vector: [1, 2], k: 10 } });
    expect(r.lucene).toBe('*');
    expect(r.lossy.some(s => s.startsWith('knn'))).toBe(true);
  });

  it('from>0 与 size≠20 点名；from=0 不点', () => {
    expect(lossyOf({ query: { match_all: {} }, from: 0 })).toEqual([]);
    expect(lossyOf({ query: { match_all: {} }, from: 40 }).some(s => s.startsWith('from'))).toBe(true);
    expect(lossyOf({ query: { match_all: {} }, size: 5 }).some(s => s.startsWith('size'))).toBe(true);
  });

  it('查询子句翻不了时仍按老口径报（子句名）', () => {
    const l = lossyOf({ query: { bool: { must: [{ match: { t: 'x' } }, { geo_grid: { loc: { geohash: 'u0' } } }] } } });
    expect(l).toContain('geo_grid');
  });

  it('负控：把 sort 判据改成恒假 → 上面的点名断言必须红', () => {
    /* 用同一份输入验证「判据决定结果」：空 sort 与真 sort 的差别就是它 */
    const empty = lossyOf({ query: { match_all: {} }, sort: [] });
    const real = lossyOf({ query: { match_all: {} }, sort: [{ a: 'asc' }] });
    expect(empty.length).toBe(0);
    expect(real.length).toBeGreaterThan(0);
  });
});
