/**
 * 1439：排序链的两处值/键补全。
 * 实测：`{"sort":[{"title":"` 只给文档词（sort/title），`{"sort":[{"title":{` 也只给文档词；
 * 而同链的 key 位（`{"sort":[{`）与 `{"order":"` 值位本来就有候选——同一屏两种待遇。
 */
import { describe, it, expect } from 'vitest';
import { dslContext } from '../utils/dslCompletionContext';

describe('1439 排序链补全', () => {
  it('简写方向值位 → sort-order', () => {
    const doc = '{"sort":[{"title":"';
    expect(dslContext(doc, doc.length).kind).toBe('sort-order');
  });

  it('字段配置键位 → sort-opt-key', () => {
    const doc = '{"sort":[{"title":{';
    expect(dslContext(doc, doc.length).kind).toBe('sort-opt-key');
  });

  it('负控：元素键位仍是字段候选（array-elem-key），不串档', () => {
    const doc = '{"sort":[{';
    expect(dslContext(doc, doc.length).kind).toBe('array-elem-key');
  });

  it('负控：非 sort 的同形结构不误判', () => {
    const other = '{"must":[{"term":"';
    expect(dslContext(other, other.length).kind).not.toBe('sort-order');
    const otherKey = '{"must":[{"term":{';
    expect(dslContext(otherKey, otherKey.length).kind).not.toBe('sort-opt-key');
  });
});
