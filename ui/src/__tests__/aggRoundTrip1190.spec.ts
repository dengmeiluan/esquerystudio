/**
 * 1190：聚合（aggs）也有全目录往返锁——此前只有查询子句有。
 *
 * 1181/1182 把「查询算子全量双向」钉住了，聚合侧一直只有零散用例。
 * 聚合是另一个独立的注册表（68 个类型：桶/度量/管道/地理网格），
 * 且真实写法会带 meta、嵌套子聚合、`aggregations` 别名键——任何一处丢键，
 * 用户在树里改完一跑就少一段。
 *
 * 实测：68 个类型 + 嵌套+meta 组合全部无损（唯一差异是对象键序，ES 不认键序）。
 * 这里固化：类型从 AGG_OPS 自动取，新增聚合类型自动纳入，不用改本文件。
 */
import { describe, it, expect } from 'vitest';
import { parseTree, serializeTree } from '../utils/queryAst';
import { AGG_OPS } from '../utils/queryAstOps';

/* 键序无关的稳定序列化（数组保序） */
function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
function roundTrip(body: any): { back: any; backStable: string } {
  const r = parseTree(body);
  expect(r.ok, '解析失败：' + JSON.stringify(body)).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  const back = serializeTree(r.tree);
  return { back, backStable: stable(back) };
}

describe('1190 聚合全类型往返', () => {
  it(`${Object.keys(AGG_OPS).length} 个注册聚合类型逐个无损`, () => {
    const bad: string[] = [];
    for (const op of Object.keys(AGG_OPS)) {
      const body = { size: 0, aggs: { a: { [op]: { field: 'f' } } } };
      const { backStable } = roundTrip(body);
      if (backStable !== stable(body)) bad.push(op + '：' + backStable);
    }
    expect(bad, '写回不一致：\n' + bad.join('\n')).toEqual([]);
  });

  it('嵌套子聚合 + meta 一起保留', () => {
    const body = { size: 0, aggs: { a: { terms: { field: 'x' }, meta: { k: 1 }, aggs: { b: { avg: { field: 'y' } } } } } };
    const { backStable } = roundTrip(body);
    expect(backStable).toBe(stable(body));
    /* 结构断言：子聚合确实落在 children 上（不是被塞进 body 原样保留） */
    const r = parseTree(body);
    if (r.ok) {
      const a = r.tree.aggs?.[0];
      expect(a?.op).toBe('terms');
      expect(a?.children?.[0]?.name).toBe('b');
      expect(a?.hasMeta).toBe(true);
    }
  });

  it('aggregations 别名键原样写回', () => {
    const body = { size: 0, aggregations: { a: { avg: { field: 'f' } } } };
    const { back, backStable } = roundTrip(body);
    expect(backStable).toBe(stable(body));
    expect(Object.keys(back as any)).toContain('aggregations');
    expect(Object.keys(back as any)).not.toContain('aggs');
  });

  it('负控：丢掉子聚合时不再同构（这组锁不是恒真）', () => {
    const body = { size: 0, aggs: { a: { terms: { field: 'x' }, aggs: { b: { avg: { field: 'y' } } } } } };
    const { back } = roundTrip(body);
    const broken = JSON.parse(JSON.stringify(back));
    delete broken.aggs.a.aggs;
    expect(stable(broken)).not.toBe(stable(body));
  });
});
