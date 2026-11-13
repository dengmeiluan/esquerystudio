import { describe, it, expect } from 'vitest';
import { dslToLucene } from '../dslToLucene';

describe('dslToLucene（语法桥 DSL→Lucene 启发式）', () => {
  it('空/无 query → *', () => {
    expect(dslToLucene(null)).toBe('*');
    expect(dslToLucene({})).toBe('*');
    expect(dslToLucene({ query: undefined })).toBe('*');
  });

  it('match_all → *', () => {
    expect(dslToLucene({ query: { match_all: {} } })).toBe('*');
  });

  it('叶子子句：term/match/match_phrase/range/wildcard/exists', () => {
    expect(dslToLucene({ query: { term: { status: 'ACTIVE' } } })).toBe('status:"ACTIVE"');
    expect(dslToLucene({ query: { match: { title: 'hello' } } })).toBe('title:hello');
    expect(dslToLucene({ query: { match_phrase: { title: 'hello world' } } })).toBe('title:"hello world"');
    expect(dslToLucene({ query: { range: { score: { gte: 60, lte: 100 } } } })).toBe('score:[60 TO 100]');
    expect(dslToLucene({ query: { range: { score: { gt: 0 } } } })).toBe('score:[0 TO *]');
    expect(dslToLucene({ query: { wildcard: { name: 'a*' } } })).toBe('name:a*');
    expect(dslToLucene({ query: { exists: { field: 'update_time' } } })).toBe('_exists_:update_time');
  });

  it('term 值对象形态取 .value', () => {
    expect(dslToLucene({ query: { term: { status: { value: 'ACTIVE' } } } })).toBe('status:"ACTIVE"');
  });

  it('match 值对象形态取 .query', () => {
    expect(dslToLucene({ query: { match: { title: { query: 'hello' } } } })).toBe('title:hello');
  });

  it('bool must/filter 组合 → AND 连接', () => {
    const dsl = { query: { bool: { must: [{ term: { status: 'ACTIVE' } }, { range: { score: { gte: 60 } } }] } } };
    expect(dslToLucene(dsl)).toBe('status:"ACTIVE" AND score:[60 TO *]');
  });

  it('bool must_not → NOT 前缀', () => {
    const dsl = { query: { bool: { must_not: [{ term: { deleted: 'true' } }] } } };
    expect(dslToLucene(dsl)).toBe('NOT deleted:"true"');
  });

  it('无法识别的叶子静默跳过（不产空段）', () => {
    expect(dslToLucene({ query: { bool: { must: [{ geo_distance: { location: 'x' } }] } } })).toBe('*');
  });
});
