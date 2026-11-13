import { describe, it, expect } from 'vitest';
import { lintSql } from '../utils/sqlLint';
import { SEARCH_PREDICATES, SQL_FUNC_NAMES, suggestFunctionsFor } from '../utils/sqlCompletion';

/* 1390：LIKE 在 text 字段上跑不了——官方 Like/RLike 页原文：「If the field used with
   LIKE / RLIKE doesn't have an exact not-normalized sub-field (of keyword type)
   Elasticsearch SQL will not be able to run the query.」
   真机实测：`WHERE issuer_name LIKE '%宁德%'`（issuer_name 是 text 且无子域）此前
   只有一条「前置 %」的性能提示，完全没有「这条跑不了」的信息。

   同时补上官方搜索谓词 MATCH / QUERY / SCORE —— 它们才是「想搜正文」的正解，
   此前补全词表里一个都没有，用户只能想到 LIKE。 */
const LIKE_HINT = 'LIKE 在 ES SQL 里跑不了';

describe('1390 LIKE 打在 text 字段上', () => {
  const TYPES = {
    title: 'text', 'title.keyword': 'keyword',   // 有子域 → 合法
    issuer_name: 'text',                          // 无子域 → 必失败
    'issuer_name.keyword': undefined as any,
    status: 'keyword',
    body: 'match_only_text',
    'body.keyword': 'keyword',
  };
  const likeRule = (sql: string) => lintSql(sql, [], TYPES).filter(f => f.message.includes(LIKE_HINT));

  it('无 .keyword 子域的 text → 点名，并给出两条真出路', () => {
    const r = likeRule("SELECT * FROM \"i\" WHERE issuer_name LIKE '%宁德%'");
    expect(r.length).toBe(1);
    expect(r[0]!.message).toContain('issuer_name');
    expect(r[0]!.line).toBe(1);
    /* 出路①：加子域后写全名；出路②：改用 MATCH 做全文检索 */
    expect(r[0]!.suggestion).toContain('issuer_name.keyword');
    expect(r[0]!.suggestion).toContain('MATCH(issuer_name');
  });

  it('有 .keyword 子域 / keyword 字段 / 直接写子域名 → 一个都不报', () => {
    expect(likeRule("SELECT * FROM \"i\" WHERE title LIKE '%a%'")).toEqual([]);
    expect(likeRule("SELECT * FROM \"i\" WHERE status LIKE 'ACT%'")).toEqual([]);
    expect(likeRule("SELECT * FROM \"i\" WHERE \"title.keyword\" LIKE 'a%'")).toEqual([]);
  });

  it('NOT LIKE / RLIKE 同一条规则；未知名不猜；一条 SQL 同字段只报一次', () => {
    expect(likeRule("SELECT * FROM \"i\" WHERE issuer_name NOT LIKE '%x%'").length).toBe(1);
    expect(likeRule("SELECT * FROM \"i\" WHERE issuer_name RLIKE '.*x.*'").length).toBe(1);
    expect(likeRule("SELECT * FROM \"i\" WHERE unknown_col LIKE '%x%'")).toEqual([]);
    expect(likeRule("SELECT * FROM \"i\" WHERE issuer_name LIKE '%a%' OR issuer_name LIKE '%b%'").length).toBe(1);
  });

  it('负控：抹掉子域信息，title 立刻从「不报」变成「报」', () => {
    const noSub = { ...TYPES } as Record<string, string>;
    delete noSub['title.keyword'];
    const r = lintSql("SELECT * FROM \"i\" WHERE title LIKE 'a%'", [], noSub)
      .filter(f => f.message.includes(LIKE_HINT));
    expect(r.length).toBe(1);
    expect(r[0]!.message).toContain('title');
    expect(likeRule("SELECT * FROM \"i\" WHERE title LIKE 'a%'")).toEqual([]);
  });

  it('不传类型表 → 零增量（既有调用方行为逐字不变）', () => {
    expect(lintSql("SELECT * FROM \"i\" WHERE issuer_name LIKE '%x%'")
      .some(f => f.message.includes(LIKE_HINT))).toBe(false);
  });
});

describe('1390 官方搜索谓词进补全与纠错', () => {
  it('MATCH / QUERY / SCORE 在词表里，且 SCORE 直接落完整调用', () => {
    const names = SEARCH_PREDICATES.map(f => f.name);
    expect(names).toEqual(['MATCH', 'QUERY', 'SCORE']);
    expect(SEARCH_PREDICATES.find(f => f.name === 'SCORE')!.insert).toBe('SCORE()');
    /* 无参函数不逼用户补括号；其余落 NAME( 交接参数位补全 */
    expect(SEARCH_PREDICATES.find(f => f.name === 'MATCH')!.insert).toBeUndefined();
  });

  it('敲错 MATCH 时能纠错回 MATCH（进入 SQL_FUNC_NAMES 候选池）', () => {
    expect(SQL_FUNC_NAMES).toEqual(expect.arrayContaining(['MATCH', 'QUERY', 'SCORE']));
    const r = suggestFunctionsFor('line 1:20: Unknown function [MATCHH]');
    expect(r?.suggestions[0]?.name).toBe('MATCH');
  });
});
