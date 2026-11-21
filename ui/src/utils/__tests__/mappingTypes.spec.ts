import { describe, it, expect } from 'vitest';
import { walkMappingTypes } from '../mappingTypes';

describe('walkMappingTypes', () => {
  it('平铺字段收集名称与类型', () => {
    const r = walkMappingTypes({ title: { type: 'text' }, id: { type: 'keyword' } });
    expect(r.fields.sort()).toEqual(['id', 'title']);
    expect(r.types).toEqual({ title: 'text', id: 'keyword' });
    expect(r.dates).toEqual([]);
  });

  it('date 字段同时进 dates 与 types', () => {
    const r = walkMappingTypes({ at: { type: 'date' } });
    expect(r.dates).toEqual(['at']);
    expect(r.types.at).toBe('date');
  });

  it('嵌套 properties 用点号拼路径，父节点也进 fields 但无类型', () => {
    const r = walkMappingTypes({ u: { properties: { n: { type: 'text' } } } });
    expect(r.fields.sort()).toEqual(['u', 'u.n']);
    expect(r.types).toEqual({ 'u.n': 'text' });
  });

  it('多层嵌套', () => {
    const r = walkMappingTypes({ a: { properties: { b: { properties: { c: { type: 'long' } } } } } });
    expect(r.types).toEqual({ 'a.b.c': 'long' });
  });

  it('prefix 参与拼接', () => {
    expect(walkMappingTypes({ b: { type: 'ip' } }, 'a').types).toEqual({ 'a.b': 'ip' });
  });

  it('空 / null / 非对象输入不抛', () => {
    expect(walkMappingTypes(null)).toEqual({ fields: [], dates: [], types: {} });
    expect(walkMappingTypes(undefined)).toEqual({ fields: [], dates: [], types: {} });
    expect(walkMappingTypes('x')).toEqual({ fields: [], dates: [], types: {} });
  });

  /* 与被替换的 DslQueryView 内联 walk 行为等价性钉死：
     fields 的收集顺序必须是「父先于子、按 Object.entries 顺序」，
     因为 mappingFields 由 [...new Set(fields)].sort() 产出，
     而 mappingDateFields 由 [...new Set(dates)] 产出（不排序，依赖遍历顺序）。 */
  it('fields 保持父先子后的深度优先顺序', () => {
    const r = walkMappingTypes({
      z: { type: 'keyword' },
      u: { properties: { b: { type: 'text' }, a: { type: 'text' } } },
    });
    expect(r.fields).toEqual(['z', 'u', 'u.b', 'u.a']);
  });

  it('dates 保持遍历顺序且不去重排序', () => {
    const r = walkMappingTypes({
      t2: { type: 'date' },
      nest: { properties: { t1: { type: 'date' } } },
      t0: { type: 'date' },
    });
    expect(r.dates).toEqual(['t2', 'nest.t1', 't0']);
  });

  it('multi-fields（fields 子键）不进 fields，与原实现一致', () => {
    const r = walkMappingTypes({ name: { type: 'text', fields: { raw: { type: 'keyword' } } } });
    expect(r.fields).toEqual(['name']);
    expect(r.types).toEqual({ name: 'text' });
  });

  it('null 子节点不抛且被跳过', () => {
    const r = walkMappingTypes({ ok: { type: 'keyword' }, bad: null });
    expect(r.fields).toEqual(['ok', 'bad']);
    expect(r.types).toEqual({ ok: 'keyword' });
  });

  it('非字符串 type 不进 types', () => {
    const r = walkMappingTypes({ weird: { type: 42 } });
    expect(r.fields).toEqual(['weird']);
    expect(r.types).toEqual({});
  });
});
