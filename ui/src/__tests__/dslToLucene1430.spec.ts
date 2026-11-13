/**
 * 一千四百三十批：DSL → Lucene 语法桥的两处「错误结果」与五处「可表达却退化」。
 *
 * 这个桥用于「在构建器中打开」与 SQL→Lucene 转换。它的失效模式比一般转换器更危险：
 * 用户以为在做过滤，实际得到的是**一条错误查询**或**全部文档**。
 *
 * 1429 之前它只有 1 个语义规格。本批实测出：
 *  ① `match_phrase` 用官方对象体 `{query, slop}` 时，直接内插对象 →
 *     `title:"[object Object]"`（错误查询，且 lossy 为空不提示）；
 *  ② `bool.must/filter/should/must_not` 写成**单个对象**（ES 合法、构建器 arrForm 也会产出）
 *     → `.forEach is not a function` 直接抛异常，整页报错；
 *  ③ match_phrase_prefix / regexp / fuzzy / ids / query_string 五种 query_string 原生可表达，
 *     却一律退化成 `*`（返回全部）。
 *
 * 判据：能表达的必须**正确表达**（逐字断言），表达不了的必须记名 lossy（不许静默 `*`）。
 */
import { describe, it, expect } from 'vitest';
import { dslToLucene, dslToLuceneDetailed } from '../utils/dslToLucene';

const conv = (query: any) => dslToLuceneDetailed({ query });

describe('1430 DSL→Lucene 语法桥', () => {
  it('① match_phrase 对象体取 query，不再输出 [object Object]', () => {
    const r = conv({ match_phrase: { title: { query: 'a b', slop: 2 } } });
    expect(r.lucene, '不得出现 [object Object]').not.toContain('[object Object]');
    expect(r.lucene).toBe('title:"a b"');
    expect(r.lossy).toEqual([]);
    /* 字符串形态零变化 */
    expect(conv({ match_phrase: { title: 'a b' } }).lucene).toBe('title:"a b"');
    /* 对象但缺 query：记名上报，不猜 */
    const bad = conv({ match_phrase: { title: { slop: 2 } } });
    expect(bad.lucene, '不能退化成 * 假装成功').toBe('*');
    expect(bad.lossy).toContain('match_phrase(缺 query)');
  });

  it('② bool 子句写单对象（非数组）不再抛异常', () => {
    expect(() => conv({ bool: { must: { term: { a: '1' } } } })).not.toThrow();
    expect(conv({ bool: { must: { term: { a: '1' } } } }).lucene).toBe('a:"1"');
    expect(conv({ bool: { filter: { term: { b: '2' } } } }).lucene).toBe('b:"2"');
    expect(conv({ bool: { must_not: { term: { c: '3' } } } }).lucene).toBe('NOT c:"3"');
    expect(conv({ bool: { should: { term: { d: '4' } } } }).lucene).toBe('d:"4"');
    /* 空 bool 仍是 *（零条件 = 全命中，不是错误） */
    expect(conv({ bool: {} }).lucene).toBe('*');
    expect(conv({ bool: { must: [] } }).lucene).toBe('*');
  });

  it('③ 五种可表达形态不再退化成 *（此前返回全部文档）', () => {
    expect(conv({ match_phrase_prefix: { title: { query: 'ab' } } }).lucene).toBe('title:"ab"*');
    expect(conv({ regexp: { name: { value: 'a.*' } } }).lucene).toBe('name:/a.*/');
    expect(conv({ fuzzy: { name: { value: 'abc', fuzziness: 'AUTO' } } }).lucene).toBe('name:abc~');
    expect(conv({ ids: { values: ['1', '2'] } }).lucene).toContain('_id');
    expect(conv({ ids: { values: ['1'] } }).lucene).toBe('_id:"1"');
    expect(conv({ query_string: { query: 'a AND b' } }).lucene).toBe('(a AND b)');
    expect(conv({ simple_query_string: { query: '+a -b' } }).lucene).toBe('(+a -b)');
    /* 缺关键值时不许静默成功 */
    expect(conv({ regexp: { name: {} } }).lossy).toContain('regexp(缺 value)');
    expect(conv({ ids: { values: [] } }).lossy).toContain('ids(空/非数组)');
    expect(conv({ query_string: { query: '  ' } }).lossy).toContain('query_string(缺 query)');
  });

  it('④ 确实表达不了的仍记名上报（诚实降级，不静默返回全部）', () => {
    for (const [q, name] of [
      [{ nested: { path: 'p', query: { match_all: {} } } }, 'nested'],
      [{ knn: { field: 'v', query_vector: [1] } }, 'knn'],
      [{ match_bool_prefix: { t: { query: 'x' } } }, 'match_bool_prefix'],
      [{ terms_set: { f: { terms: ['a'] } } }, 'terms_set'],
    ] as const) {
      const r = conv(q as any);
      expect(r.lucene, name + ' 未表达时必须回落 *').toBe('*');
      expect(r.lossy, name + ' 必须记名').toContain(name);
    }
  });

  it('⑤ bool 组合语义：should 单独 → OR；有 must 时并入并留痕', () => {
    expect(conv({ bool: { should: [{ term: { a: '1' } }, { term: { b: '2' } }] } }).lucene)
      .toBe('(a:"1" OR b:"2")');
    const withMust = conv({ bool: { must: [{ term: { c: '3' } }], should: [{ term: { a: '1' } }] } });
    expect(withMust.lucene, '保守并入必须条件').toBe('c:"3" AND a:"1"');
    expect(withMust.lossy.join(), '必须留痕').toContain('bool.should');
  });

  it('⑥ 旧签名 dslToLucene 仍返回字符串（既有出口零改动）', () => {
    expect(typeof dslToLucene({ query: { term: { a: '1' } } })).toBe('string');
    expect(dslToLucene({ query: { term: { a: '1' } } })).toBe('a:"1"');
    expect(dslToLucene({})).toBe('*');
  });
});
