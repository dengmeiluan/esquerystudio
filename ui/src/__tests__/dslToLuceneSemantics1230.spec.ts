/**
 * 1230：DSL→Lucene 语法桥的**语义**锁。
 *
 * 此前只有接线锁（`dqWave561` 验「按钮在、会话键写对」），**没有任何一条验翻译对不对**，
 * 于是两处会给出错误结果的行为长期没被发现：
 *  ① `bool.should` 与 must 一起用 `AND` 拼——should 是"任一满足"，拼成 AND 会**收紧**语义；
 *  ② `terms` / `prefix` / `multi_match` / `nested` 等一律静默丢弃并整体回退 `*`
 *     （**返回全部文档**），用户以为在过滤其实没过滤。
 *
 * 修复后（本文锁定）：
 *  · should（无 must）→ `(a OR b)`；
 *  · should + must → 保守并入必须条件，并记 `lossy`（query_string 没有"加分"概念）；
 *  · terms → OR 组；prefix → `k:v*`；multi_match → 各字段 OR；
 *  · 表达不了的（nested/geo/knn/script…）记入 `lossy`，不再静默变 `*`。
 *
 * 调用方必须用 `dslToLuceneDetailed` 并向用户提示 `lossy`；
 * `dslToLucene` 保持旧签名（返回字符串），给不需要提示的出口用。
 */
import { describe, it, expect } from 'vitest';
import { dslToLucene, dslToLuceneDetailed } from '../utils/dslToLucene';

const L = (q: any) => dslToLuceneDetailed({ query: q });

describe('1230 DSL→Lucene 语义', () => {
  it('基础叶子：term / match / match_phrase / range / wildcard / exists', () => {
    expect(L({ term: { s: 'A' } }).lucene).toBe('s:"A"');
    expect(L({ match: { t: '债' } }).lucene).toBe('t:债');
    expect(L({ match_phrase: { t: '债券违约' } }).lucene).toBe('t:"债券违约"');
    expect(L({ range: { n: { gte: 1, lte: 9 } } }).lucene).toBe('n:[1 TO 9]');
    expect(L({ wildcard: { c: '04*' } }).lucene).toBe('c:04*');
    expect(L({ exists: { field: 'tags' } }).lucene).toBe('_exists_:tags');
  });

  it('terms 是"任一命中"→ OR 组（不是 AND、更不是 *）', () => {
    expect(L({ terms: { s: ['A', 'B'] } }).lucene).toBe('(s:"A" OR s:"B")');
    expect(L({ terms: { s: ['A'] } }).lucene).toBe('s:"A"');
  });

  it('prefix → k:v*；multi_match → 各字段 OR', () => {
    expect(L({ prefix: { c: '04' } }).lucene).toBe('c:04*');
    expect(L({ multi_match: { query: '债', fields: ['t', 'c'] } }).lucene).toBe('(t:债 OR c:债)');
  });

  it('should（无 must）→ OR 组，不是 AND', () => {
    const r = L({ bool: { should: [{ term: { a: 1 } }, { term: { b: 2 } }] } });
    expect(r.lucene).toBe('(a:"1" OR b:"2")');
    expect(r.lossy).toEqual([]);
  });

  it('must_not 取反', () => {
    expect(L({ bool: { must: [{ match: { t: 'x' } }], must_not: [{ term: { s: 'y' } }] } }).lucene)
      .toBe('t:x AND NOT s:"y"');
  });

  it('should + must：保守并入必须条件并记 lossy（query_string 无"加分"概念）', () => {
    const r = L({ bool: { must: [{ match: { t: 'x' } }], should: [{ term: { a: 1 } }] } });
    expect(r.lucene).toBe('t:x AND a:"1"');
    expect(r.lossy.length).toBe(1);
    expect(r.lossy[0]).toContain('should');
  });

  it('表达不了的子句记名上报（不再静默丢条件）', () => {
    const nested = L({ nested: { path: 'c', query: { term: { 'c.x': 1 } } } });
    expect(nested.lucene).toBe('*');
    expect(nested.lossy).toEqual(['nested']);

    const mixed = L({ bool: { must: [{ match: { t: 'x' } }, { geo_distance: {} }] } });
    expect(mixed.lucene).toBe('t:x');
    expect(mixed.lossy).toContain('geo_distance');
  });

  it('旧签名 dslToLucene 仍返回字符串（既有出口零破坏）', () => {
    expect(dslToLucene({ query: { term: { s: 'A' } } })).toBe('s:"A"');
    expect(typeof dslToLucene({})).toBe('string');
  });

  it('两个消费方都接了 lossy 提示（不只修内核）', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    for (const rel of ['views/DslQueryView.vue', 'components/CmdPalette.vue']) {
      const s = fs.readFileSync(path.join(root, rel), 'utf-8');
      expect(s, rel + ' 应使用 dslToLuceneDetailed').toContain('dslToLuceneDetailed');
      expect(s, rel + ' 应把 lossy 告知用户').toContain('无法用 query_string 表达');
    }
  });
});
