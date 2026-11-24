import { describe, expect, it } from 'vitest';
import { resolveSortField } from '../sortField';

describe('sortField 表头排序字段裁决', () => {
  const types = {
    title: 'text', issuer_name: 'text',
    'title.keyword': 'keyword',
    status: 'keyword', amount: 'double',
    publish_time: 'date', is_active: 'boolean',
  };

  it('text 字段有 .keyword 子域 → 改写子域（fielddata 400 预防）', () => {
    expect(resolveSortField('title', types)).toEqual({ field: 'title.keyword', ok: true });
  });

  it('text 字段无 .keyword 子域 → 不可排序并给可行动原因', () => {
    const r = resolveSortField('issuer_name', types);
    expect(r.ok).toBe(false);
    expect(r.field).toBe('issuer_name');
    expect(r.reason).toContain('.keyword');
    expect(r.reason).toContain('text');
  });

  it('keyword/数值/date/boolean 原样放行', () => {
    for (const f of ['status', 'amount', 'publish_time', 'is_active']) {
      expect(resolveSortField(f, types)).toEqual({ field: f, ok: true });
    }
  });

  it('已带子域后缀的列名原样放行（调用方已裁决）', () => {
    expect(resolveSortField('title.keyword', types)).toEqual({ field: 'title.keyword', ok: true });
  });

  it('元字段（_id/_score/_doc）原样放行', () => {
    for (const f of ['_id', '_score', '_doc', '_index']) {
      expect(resolveSortField(f, types)).toEqual({ field: f, ok: true });
    }
  });

  it('mapping 未知（未加载/运行时字段）→ 原样放行，交给 unmapped_type 兜底', () => {
    expect(resolveSortField('dynamic_field', types)).toEqual({ field: 'dynamic_field', ok: true });
    expect(resolveSortField('anything', undefined)).toEqual({ field: 'anything', ok: true });
  });

  it('空列名不可排序', () => {
    expect(resolveSortField('', types).ok).toBe(false);
  });
});
