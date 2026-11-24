/**
 * 二百二十七批：buildDsl 纯函数矩阵——单元格值 → 查询 DSL 的类型路由。
 * 锁定：_id→ids、多值去重→terms、text→match、其余→term、空值剔除、
 * 对象值 stringify、特殊字符 JSON round-trip、epoch 原值不被人性化转换。
 */
import { describe, it, expect } from 'vitest';
import { buildDsl } from '../utils/dslFromCell';

describe('buildDsl 类型路由（227 批）', () => {
  it('单值 keyword/未知类型 → term；数值原样', () => {
    expect(buildDsl('level', ['warn'])).toEqual({ term: { level: 'warn' } });
    expect(buildDsl('age', [2], 'long')).toEqual({ term: { age: 2 } });
    expect(buildDsl('ok', [true], 'boolean')).toEqual({ term: { ok: true } });
  });

  it('单值 text 字段 → match（term 查不到分词字段）', () => {
    expect(buildDsl('msg', ['hello world'], 'text')).toEqual({ match: { msg: 'hello world' } });
  });

  it('_id → ids（单值也是 ids）', () => {
    expect(buildDsl('_id', ['abc'])).toEqual({ ids: { values: ['abc'] } });
  });

  it('多值去重 → terms；顺序保持首现', () => {
    expect(buildDsl('level', ['warn', 'info', 'warn'])).toEqual({ terms: { level: ['warn', 'info'] } });
  });

  it('text 字段多值 → bool.should+match（terms 打 text 要 fielddata，必然 400）', () => {
    expect(buildDsl('title', ['a b', 'c d'], 'text')).toEqual({
      bool: { should: [{ match: { title: 'a b' } }, { match: { title: 'c d' } }], minimum_should_match: 1 },
    });
    /* 去重后只剩一个 → 回落单值 match（不包 bool） */
    expect(buildDsl('title', ['a b', 'a b'], 'text')).toEqual({ match: { title: 'a b' } });
    /* keyword 多值仍走 terms（零变化） */
    expect(buildDsl('status', ['A', 'B'], 'keyword')).toEqual({ terms: { status: ['A', 'B'] } });
  });

  it('_id 多值仍走 ids 且去重', () => {
    expect(buildDsl('_id', ['a', 'b', 'a'])).toEqual({ ids: { values: ['a', 'b'] } });
  });

  it('null/undefined/空串剔除；全空返回 null', () => {
    expect(buildDsl('level', [null, undefined, ''])).toBeNull();
    expect(buildDsl('level', [])).toBeNull();
    expect(buildDsl('level', [null, 'x'])).toEqual({ term: { level: 'x' } });
  });

  it('对象值不参与查询生成（1431：ES 不会把对象索引成那个 JSON 串，旧行为必然零命中）', () => {
    /* 227 批原有断言是 term:{meta:'{"a":1}'}——"与复制值口径一致"。
       但 ES 里对象字段没有「值」，term 打上去永远零命中，用户以为在过滤。
       改为返回 null（调用方不提供该入口 / 提示改用子字段）；复制值仍是原 JSON。 */
    expect(buildDsl('meta', [{ a: 1 }])).toBeNull();
    expect(buildDsl('meta', [{ a: 1 }, { b: 2 }])).toBeNull();
    /* 与标量混选时整条不生成（不能只查标量、静默丢掉对象值那几行） */
    expect(buildDsl('meta', [{ a: 1 }, 'x'])).toBeNull();
  });

  it('epoch 毫秒原值不被人性化转换（显示层职责不入侵 DSL）', () => {
    const ms = 1725945600000;
    expect(buildDsl('ts', [ms], 'date')).toEqual({ term: { ts: 1725945600000 } });
  });

  it('特殊字符值 JSON.stringify 可 round-trip 且与原值相等', () => {
    const v = 'a"b\\c\nd【中文】😀';
    const q = buildDsl('s', [v])!;
    expect(JSON.parse(JSON.stringify(q))).toEqual({ term: { s: v } });
  });

  it('数值 1 与字符串 "1" 类型不同不去重合并', () => {
    expect(buildDsl('v', [1, '1'])).toEqual({ terms: { v: [1, '1'] } });
  });
});

/* 二百五十三批：exists 查询——字段存在性检索语义 */
import { buildExistsDsl } from '../utils/dslFromCell';
describe('buildExistsDsl（253 批）', () => {
  it('业务列 → exists；_id/空名 → null（_id 恒存在无意义）', () => {
    expect(buildExistsDsl('tags')).toEqual({ exists: { field: 'tags' } });
    expect(buildExistsDsl('msg')).toEqual({ exists: { field: 'msg' } });
    expect(buildExistsDsl('_id')).toBeNull();
    expect(buildExistsDsl('')).toBeNull();
  });
});
