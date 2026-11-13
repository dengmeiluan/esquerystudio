/**
 * 1439：highlight.fields 的键是字段名，补全必须给 mapping 字段。
 * 实测：`{"highlight":{"fields":{` 按 Ctrl+Space 只得到 fields / highlight（文档词），
 * 而高亮字段打错就是静默不高亮（ES 不报错，只是没效果）。
 */
import { describe, it, expect } from 'vitest';
import { dslContext } from '../utils/dslCompletionContext';

describe('1439 highlight.fields 字段键位', () => {
  it('highlight → fields → {} 的键位识别为 field-key', () => {
    const doc = '{"highlight":{"fields":{';
    expect(dslContext(doc, doc.length).kind).toBe('field-key');
  });

  it('负控：别的对象字段键位不误判；highlight 一层（对象位）不误判', () => {
    const other = '{"highlight":{"fields":{"title":{}},"other":{';
    expect(dslContext(other, other.length).kind).not.toBe('field-key');
    const top = '{"highlight":{';
    expect(dslContext(top, top.length).kind).not.toBe('field-key');
  });

  it('负控：值位不出 field-key（"fields": " 是值不是键）', () => {
    const value = '{"highlight":{"fields":"';
    expect(dslContext(value, value.length).kind).not.toBe('field-key');
  });
});
