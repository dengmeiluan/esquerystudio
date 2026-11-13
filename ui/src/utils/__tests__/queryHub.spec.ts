import { describe, it, expect } from 'vitest';
import {
  QUERY_MODES, DEFAULT_MODE, normalizeMode, LEGACY_QUERY_PATHS, legacyRedirect,
  QUICK_TASKS, encodeDslParam,
} from '../queryHub';

describe('queryHub 模式元数据', () => {
  it('六个模式 k 唯一且 legacyPath 唯一（深链/重定向契约）', () => {
    const ks = QUERY_MODES.map(m => m.k);
    expect(new Set(ks).size).toBe(ks.length);
    const paths = QUERY_MODES.map(m => m.legacyPath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(ks).toEqual(['dsl', 'sql', 'lucene', 'sandbox', 'pit', 'bridge']);
  });

  it('normalizeMode：合法值原样、非法值回落默认', () => {
    expect(normalizeMode('sql')).toBe('sql');
    expect(normalizeMode('nope')).toBe(DEFAULT_MODE);
    expect(normalizeMode(null)).toBe(DEFAULT_MODE);
    expect(normalizeMode(undefined)).toBe(DEFAULT_MODE);
  });

  it('legacyRedirect：6 条旧路径全覆盖且保留原 query 参数', () => {
    for (const [path, mode] of Object.entries(LEGACY_QUERY_PATHS)) {
      const r = legacyRedirect(path, { idx: 'bond_basic_info', dsl: 'abc' });
      expect(r.path).toBe('/search');
      expect(r.query.mode).toBe(mode);
      expect(r.query.idx).toBe('bond_basic_info');
      expect(r.query.dsl).toBe('abc');
    }
    expect(Object.keys(LEGACY_QUERY_PATHS)).toHaveLength(6);
  });

  it('legacyRedirect：未知路径回落默认模式（防御）', () => {
    expect(legacyRedirect('/whatever', {}).query.mode).toBe(DEFAULT_MODE);
  });
});

describe('queryHub 场景任务', () => {
  it('按 ID 捞文档：多 ID 去空格、滤空', () => {
    const task = QUICK_TASKS.find(t => t.k === 'by-id')!;
    const dsl = JSON.parse(task.build(' a1 , b2 ,, '));
    expect(dsl.query.ids.values).toEqual(['a1', 'b2']);
  });

  it('只数总数：size 0 + track_total_hits（不数到 10000 截断）', () => {
    const task = QUICK_TASKS.find(t => t.k === 'count')!;
    const dsl = JSON.parse(task.build(''));
    expect(dsl.size).toBe(0);
    expect(dsl.track_total_hits).toBe(true);
  });

  it('查字段缺失：must_not exists 语义', () => {
    const task = QUICK_TASKS.find(t => t.k === 'missing')!;
    const dsl = JSON.parse(task.build(' update_time '));
    expect(dsl.query.bool.must_not[0].exists.field).toBe('update_time');
  });

  it('看最新写入：按输入字段倒序', () => {
    const task = QUICK_TASKS.find(t => t.k === 'recent')!;
    const dsl = JSON.parse(task.build('create_time'));
    expect(dsl.sort[0].create_time.order).toBe('desc');
  });

  it('encodeDslParam 与 DslQueryView atob 解码契约互逆（含中文）', () => {
    const src = '{"query":{"match":{"name":"雅戈转债"}}}';
    const decoded = decodeURIComponent(escape(atob(encodeDslParam(src))));
    expect(decoded).toBe(src);
  });
});
