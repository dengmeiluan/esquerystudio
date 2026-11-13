/**
 * 1439：runtime_mappings 运行时字段补全。
 *
 * 字段配置的键（type/script）此前已有；type 的值位与 SQL 体里的 runtime 配置仍是空白。
 * 现在：type 值位给官方 runtime 类型目录；SQL 体的 runtime 字段配置跳过 W6，
 * 走通用 runtime 键/值档（键 type/script、值类型目录）。
 */
import { describe, it, expect } from 'vitest';
import { RUNTIME_FIELD_TYPES, runtimeFieldTypeAt, inRuntimeMappingsAt } from '../utils/dslCompletionContext';

describe('1439 runtime_mappings 类型位', () => {
  it('类型目录为官方 runtime 字段类型全集', () => {
    expect(RUNTIME_FIELD_TYPES.map(t => t.label)).toEqual([
      'boolean', 'composite', 'date', 'double', 'geo_point', 'ip', 'keyword', 'long', 'lookup',
    ]);
    for (const t of RUNTIME_FIELD_TYPES) expect(t.detail).toBeTruthy();
  });

  it('runtimeFieldTypeAt：仅 runtime_mappings.<字段>.type 值位为真', () => {
    expect(runtimeFieldTypeAt('{"runtime_mappings": {"day": {"type": "')).toBe(true);
    /* source.runtime_mappings（_reindex）同样命中 */
    expect(runtimeFieldTypeAt('{"source": {"runtime_mappings": {"d": {"type": "')).toBe(true);
    /* 非 type 键/映射字段 type/普通 mapping 均不命中 */
    expect(runtimeFieldTypeAt('{"runtime_mappings": {"day": {"script": "')).toBe(false);
    expect(runtimeFieldTypeAt('{"mappings": {"properties": {"a": {"type": "')).toBe(false);
    expect(runtimeFieldTypeAt('{"runtime_mappings": {"day": {')).toBe(false);
  });

  it('inRuntimeMappingsAt：进入 runtime_mappings 的对象后为真（值位/别处为假）', () => {
    expect(inRuntimeMappingsAt('{"runtime_mappings": {')).toBe(true);
    expect(inRuntimeMappingsAt('{"runtime_mappings": {"day": {"')).toBe(true);
    expect(inRuntimeMappingsAt('{"runtime_mappings": {"day": {"script": {"')).toBe(true);
    expect(inRuntimeMappingsAt('{"runtime_mappings": "')).toBe(false);
    expect(inRuntimeMappingsAt('{"mappings": {"properties": {"a": {"')).toBe(false);
  });
});
