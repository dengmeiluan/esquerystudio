import { describe, it, expect } from 'vitest';
import { parseBytes } from '../format';
import { sortIndices } from '../indexSort';

describe('parseBytes', () => {
  it.each([
    ['0b', 0],
    ['12b', 12],
    ['845.3kb', 845.3 * 1024],
    ['1.2mb', 1.2 * 1024 ** 2],
    ['1.2gb', 1.2 * 1024 ** 3],
    ['1.5tb', 1.5 * 1024 ** 4],
  ])('%s → %d', (s, n) => expect(parseBytes(s as string)).toBeCloseTo(n as number, 5));

  it('大小写/空格容错', () => {
    expect(parseBytes(' 1.2 GB ')).toBeCloseTo(1.2 * 1024 ** 3, 5);
    expect(parseBytes('100KB')).toBe(100 * 1024);
  });

  it('不可解析/空 → NaN', () => {
    expect(parseBytes('')).toBeNaN();
    expect(parseBytes(null)).toBeNaN();
    expect(parseBytes(undefined)).toBeNaN();
    expect(parseBytes('abc')).toBeNaN();
  });
});

describe('sortIndices', () => {
  const rows = [
    { index: 'a', 'docs.count': '10', 'store.size': '1.2gb', health: 'green', pri: '5', rep: '1', 'creation.date.string': '2026-01-01T00:00:00.000Z' },
    { index: 'b', 'docs.count': '100', 'store.size': '845.3kb', health: 'red', pri: '1', rep: '0', 'creation.date.string': '2025-01-01T00:00:00.000Z' },
    { index: 'c', 'docs.count': '50', 'store.size': '100mb', health: 'yellow', pri: '3', rep: '2' }, // 缺创建时间
    { index: 'd', 'docs.count': '7', 'store.size': '0b', health: 'green', pri: '5', rep: '1', 'creation.date.string': '2027-01-01T00:00:00.000Z' },
  ];

  it('索引名升序（默认）', () => {
    expect(sortIndices(rows, 'index', 'asc').map(r => r.index)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('文档数降序', () => {
    expect(sortIndices(rows, 'docs.count', 'desc').map(r => r.index)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('存储大小按字节序非字典序：0b < 845.3kb < 100mb < 1.2gb', () => {
    expect(sortIndices(rows, 'store.size', 'asc').map(r => r.index)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('健康按严重度升序：red < yellow < green', () => {
    expect(sortIndices(rows, 'health', 'asc').map(r => r.index)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('缺创建时间沉底（升序）', () => {
    expect(sortIndices(rows, 'creation.date.string', 'asc').map(r => r.index)).toEqual(['b', 'a', 'd', 'c']);
  });
  it('缺创建时间沉底（降序也不置顶）', () => {
    expect(sortIndices(rows, 'creation.date.string', 'desc').map(r => r.index)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('不 mutate 原数组', () => {
    const copy = rows.map(r => r.index);
    sortIndices(rows, 'docs.count', 'desc');
    expect(rows.map(r => r.index)).toEqual(copy);
  });
});
