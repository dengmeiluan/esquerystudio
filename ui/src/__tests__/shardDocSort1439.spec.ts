/**
 * 1439：_shard_doc 排序形态（shard-doc-sort）。
 *
 * 官方深分页示例是 PIT + "_shard_doc": "asc"；把这段贴到普通检索、或把方向改成 desc，
 * ES 都直接 400。此前 lint 对 sort 只查 text 字段与方向拼写，这条形态问题没有入口。
 */
import { describe, it, expect } from 'vitest';
import { lintDsl } from '../utils/dslLint';

const hits = (obj: unknown) =>
  lintDsl(obj as any).filter((f: any) => f.rule === 'shard-doc-sort');

const PIT = { id: 'p1', keep_alive: '1m' };

describe('1439 _shard_doc 排序形态', () => {
  it('普通检索（无 pit）用 _shard_doc → error 指名要配 PIT', () => {
    const f = hits({ sort: [{ _shard_doc: 'asc' }], query: { match_all: {} } });
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('error');
    expect(f[0].message).toContain('PIT');
    expect(f[0].anchor).toBe('sort');
  });

  it('desc 方向（无论有没有 pit）→ error 指名只支持 asc', () => {
    for (const dsl of [
      { sort: [{ _shard_doc: 'desc' }] },
      { sort: [{ _shard_doc: { order: 'desc' } }], pit: PIT },
      { sort: [{ _shard_doc: { order: 'desc' } }] },
    ]) {
      const f = hits(dsl);
      expect(f, JSON.stringify(dsl)).toHaveLength(1);
      expect(f[0].message).toContain('asc');
      expect(f[0].severity).toBe('error');
    }
  });

  it('PIT + asc（官方 canonical 深分页形态）→ 零 finding', () => {
    for (const dsl of [
      { sort: [{ _shard_doc: 'asc' }], pit: PIT },
      { sort: [{ _shard_doc: { order: 'asc' } }], pit: PIT },
      { sort: ['_shard_doc'], pit: PIT },
    ]) {
      expect(hits(dsl), JSON.stringify(dsl)).toEqual([]);
    }
  });

  it('普通排序字段 / _doc / 非根级 sort 不判（不误伤）', () => {
    expect(hits({ sort: [{ ts: { order: 'desc' } }] })).toEqual([]);
    expect(hits({ sort: ['_doc'] })).toEqual([]);
    /* top_hits 内的 sort 不是根级排序——本规则不判（结构错由其他规则负责） */
    expect(hits({ aggs: { a: { top_hits: { size: 1, sort: [{ _shard_doc: 'desc' }] } } } })).toEqual([]);
  });

  it('负控：同一判据喂合法形态必须空、喂错误形态必须非空', () => {
    expect(hits({ sort: [{ _shard_doc: 'asc' }], pit: PIT })).toEqual([]);
    expect(hits({ sort: [{ _shard_doc: 'asc' }] }).length).toBe(1);
  });
});
