/* 996 批 AST 层：script_fields / runtime_mappings 顶层键一等化（命名键+体 同构双键）。
   形态 { itemName: {script:{…}} | {type,…} }——项体原样保真（script source/params、
   type/format 等），任一项 body 非对象 → 整键落 extras 零丢失。 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree, emptyTree } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

describe('996 script_fields 一等解析', () => {
  roundTrip('单项 script source', { script_fields: { bonus: { script: { source: "doc['n'].value * 2" } } } });
  roundTrip('script 带 params', { script_fields: { bonus: { script: { source: 'x * k', params: { k: 3 } } } } });
  roundTrip('多项混排', { script_fields: { a: { script: { source: '1' } }, b: { script: { source: '2' } } } });
  it('parse 投影：name/body 分账', () => {
    const r = parseTree({ script_fields: { bonus: { script: { source: '1' } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.scriptFields?.items.length).toBe(1);
    expect(r.tree.scriptFields!.items[0].name).toBe('bonus');
    expect(r.tree.scriptFields!.items[0].body).toEqual({ script: { source: '1' } });
  });
  it('畸形：项 body 非对象整键落 extras 零丢失', () => {
    const r = parseTree({ script_fields: { bad: 'str' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.scriptFields).toBeNull();
    expect(r.tree.extras.script_fields).toEqual({ bad: 'str' });
    expect(serializeTree(r.tree)).toEqual({ script_fields: { bad: 'str' } });
  });
  it('非对象整键落 extras', () => {
    const r = parseTree({ script_fields: ['x'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.scriptFields).toBeNull();
    expect(r.tree.extras.script_fields).toEqual(['x']);
  });
});

describe('996 runtime_mappings 一等解析', () => {
  roundTrip('script 运行时字段', { runtime_mappings: { double_age: { type: 'long', script: { source: '1' } } } });
  roundTrip('纯映射字段（type+format）', { runtime_mappings: { day: { type: 'keyword' } } });
  roundTrip('多项混排', { runtime_mappings: { a: { type: 'long' }, b: { type: 'keyword', script: { source: 'x' } } } });
  it('parse 投影：name/body 分账', () => {
    const r = parseTree({ runtime_mappings: { f: { type: 'long', script: { source: '1' } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.runtimeMappings?.items[0].name).toBe('f');
    expect(r.tree.runtimeMappings!.items[0].body).toEqual({ type: 'long', script: { source: '1' } });
  });
  it('畸形落 extras 零丢失', () => {
    const r = parseTree({ runtime_mappings: { bad: 5 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.runtimeMappings).toBeNull();
    expect(serializeTree(r.tree)).toEqual({ runtime_mappings: { bad: 5 } });
  });
  it('emptyTree 双键 null', () => {
    expect(emptyTree().scriptFields).toBeNull();
    expect(emptyTree().runtimeMappings).toBeNull();
  });
});
