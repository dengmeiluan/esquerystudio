/**
 * R130 第六十一批：跨模式历史 store 单条删除守卫 + 回放联动口径。
 * 背景：此前只有 clear() 全清，错条/敏感条只能连坐清除；QueryHub 历史抽屉
 * del 动作（QueryHistoryPanel actions）接线 hist.removeOne(row.id)。
 * 锁定：
 * 1) removeOne 按 id 精确单删，其余条目不动，且持久化到 localStorage；
 * 2) 未知 id / undefined 入参静默无变化（容错不抛）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import { useQueryHistoryStore } from '../stores/queryHistory';

const KEY = 'es_query_hist_v2';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('1071 SQL 参数快照入历史', () => {
  it('参数随条目持久化，重载后仍还原', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { mode: 'sql', query: 'SELECT * FROM t WHERE a = ?', ts: 1, params: ' ["宁德时代"] ' },
    ]));
    setActivePinia(createPinia());
    const s = useQueryHistoryStore();
    expect(s.items[0].params).toBe('["宁德时代"]');
    s.push('sql', 'SELECT 2', undefined, undefined, true, '["z"]');
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]').find((x: any) => x.query === 'SELECT 2');
    expect(saved.params).toBe('["z"]');
  });

  it('同 SQL 不同参数是不同历史现场，不互相覆盖', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT * FROM t WHERE a = ?', 'idx', undefined, true, '["a"]');
    s.push('sql', 'SELECT * FROM t WHERE a = ?', 'idx', undefined, true, '["b"]');
    expect(s.items.length).toBe(2);
    expect(s.items.map(it => it.params).sort()).toEqual(['["a"]', '["b"]']);
  });

  it('同 mode+query+index+params 才去重（重复执行只前置，不新增）', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT ?', 'idx', undefined, true, '["a"]');
    s.push('dsl', 'SELECT ?', 'idx'); // 无参数条目与带参数条目互不干扰
    s.items[1].ts = 1;
    s.push('sql', 'SELECT ?', 'idx', 12, true, '["a"]');
    expect(s.items.length).toBe(2);
    expect(s.items[0].query).toBe('SELECT ?');
    expect(s.items[0].params).toBe('["a"]');
    expect(s.items[0].took).toBe(12);
  });
});

describe('queryHistory store removeOne（六十一批）', () => {
  it('按 id 精确单删，其余条目不动，并同步持久化', () => {
    const s = useQueryHistoryStore();
    s.push('dsl', 'A', 'idx-a');
    s.push('sql', 'B');
    s.push('lucene', 'C', 'idx-c');
    const target = s.items[1]; // B
    expect(target.query).toBe('B');
    s.removeOne(target.id);
    expect(s.items.length).toBe(2);
    expect(s.items.some(it => it.query === 'B')).toBe(false);
    expect(s.items.map(it => it.query)).toEqual(['C', 'A']);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]').length).toBe(2);
  });

  it('未知 id 与 undefined 入参静默无变化', () => {
    const s = useQueryHistoryStore();
    s.push('dsl', 'A');
    s.removeOne('no-such-id');
    s.removeOne(undefined);
    expect(s.items.length).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]').length).toBe(1);
  });
});

describe('1122 SQL 失败历史留存', () => {
  it('失败条目记录 ok=false + 错误摘要，重载后仍在', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT bad', 'idx', undefined, false, '["a"]', { fetch_size: 100 }, 'line 1:8: Unknown column [bad]');
    const it = s.items[0];
    expect(it.ok).toBe(false);
    expect(it.error).toContain('Unknown column');
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]')[0];
    expect(saved.ok).toBe(false);
    expect(saved.error).toContain('Unknown column');
    setActivePinia(createPinia());
    const s2 = useQueryHistoryStore();
    expect(s2.items[0].ok, '刷新后失败红点不丢（normalize 保留 ok）').toBe(false);
    expect(s2.items[0].error).toContain('Unknown column');
  });

  it('同查询重跑成功清掉错误摘要', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT x', 'idx', undefined, false, undefined, undefined, 'boom');
    s.push('sql', 'SELECT x', 'idx', 12, true);
    expect(s.items[0].ok).toBe(true);
    expect(s.items[0].error).toBeUndefined();
  });
});
