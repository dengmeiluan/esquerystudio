import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useQueryHistoryStore } from '../queryHistory';

/* R100：跨模式查询历史 store 纯逻辑——push 去重/上限、clear、坏值回落、旧 DSL 历史迁移。 */

const KEY = 'es_query_hist_v2';
const LEGACY_KEY = 'es_query_hist';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('queryHistory push', () => {
  it('新条目 unshift 到最前并带 id/mode/query/index/ts', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT * FROM "a"', 'a');
    expect(s.items).toHaveLength(1);
    const it = s.items[0];
    expect(it.mode).toBe('sql');
    expect(it.query).toBe('SELECT * FROM "a"');
    expect(it.index).toBe('a');
    expect(typeof it.id).toBe('string');
    expect(typeof it.ts).toBe('number');
  });

  it('同 mode+query+index 去重：移到最前并刷新 ts，不新增', () => {
    const s = useQueryHistoryStore();
    s.push('lucene', 'status:ACTIVE', 'i1');
    s.push('dsl', '{"query":{"match_all":{}}}', 'i1');
    const before = s.items.length;
    s.push('lucene', 'status:ACTIVE', 'i1');
    expect(s.items).toHaveLength(before);
    expect(s.items[0].mode).toBe('lucene');
    expect(s.items[0].query).toBe('status:ACTIVE');
  });

  it('同 query 不同 index 不去重', () => {
    const s = useQueryHistoryStore();
    s.push('lucene', '*', 'i1');
    s.push('lucene', '*', 'i2');
    expect(s.items).toHaveLength(2);
  });

  it('上限 100 条：超出丢弃最旧', () => {
    const s = useQueryHistoryStore();
    for (let n = 0; n < 120; n++) s.push('dsl', 'q' + n, 'i');
    expect(s.items).toHaveLength(100);
    expect(s.items[0].query).toBe('q119');
    expect(s.items[99].query).toBe('q20');
  });

  it('空 index 归一为 undefined', () => {
    const s = useQueryHistoryStore();
    s.push('dsl', '{}', '');
    expect(s.items[0].index).toBeUndefined();
  });

  it('push 持久化：新 store 实例能读回', () => {
    const s = useQueryHistoryStore();
    s.push('sql', 'SELECT 1', 'i1');
    setActivePinia(createPinia());
    const s2 = useQueryHistoryStore();
    expect(s2.items).toHaveLength(1);
    expect(s2.items[0].query).toBe('SELECT 1');
  });
});

describe('queryHistory clear', () => {
  it('清空并持久化', () => {
    const s = useQueryHistoryStore();
    s.push('dsl', '{}', 'i1');
    s.clear();
    expect(s.items).toHaveLength(0);
    setActivePinia(createPinia());
    expect(useQueryHistoryStore().items).toHaveLength(0);
  });
});

describe('queryHistory 坏值回落', () => {
  it('v2 存非 JSON 回落 []', () => {
    localStorage.setItem(KEY, '{{{not json');
    const s = useQueryHistoryStore();
    expect(s.items).toEqual([]);
  });

  it('v2 存非数组回落 []', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    const s = useQueryHistoryStore();
    expect(s.items).toEqual([]);
  });

  it('v2 条目中非法项被过滤', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'x', mode: 'dsl', query: '{}', ts: 1 },
      { mode: 'sql', query: 123 },           // query 非字符串
      'garbage',                              // 非对象
    ]));
    const s = useQueryHistoryStore();
    expect(s.items).toHaveLength(1);
    expect(s.items[0].mode).toBe('dsl');
  });
});

describe('queryHistory 旧 DSL 历史迁移', () => {
  it('v2 为空时把 es_query_hist 转成 mode=dsl 条目并入', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([
      { dsl: '{"query":{"match_all":{}}}', ts: 123, idx: 'i1', name: 'n' },
      { dsl: '{"size":0}', ts: 456, idx: '' },
    ]));
    const s = useQueryHistoryStore();
    expect(s.items).toHaveLength(2);
    expect(s.items[0].mode).toBe('dsl');
    expect(s.items[0].query).toBe('{"query":{"match_all":{}}}');
    expect(s.items[0].index).toBe('i1');
    expect(s.items[0].ts).toBe(123);
    expect(s.items[1].index).toBeUndefined();
  });

  it('迁移只做一次：后续旧历史不再倒灌', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ dsl: 'old', ts: 1 }]));
    useQueryHistoryStore();
    // 改旧历史内容 + 换新 pinia（模拟刷新）
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ dsl: 'newer', ts: 2 }]));
    setActivePinia(createPinia());
    const s = useQueryHistoryStore();
    expect(s.items).toHaveLength(1);
    expect(s.items[0].query).toBe('old');
  });

  it('v2 已有内容时不迁移（不覆盖新数据）', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'a', mode: 'sql', query: 'SELECT 1', ts: 9 }]));
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ dsl: 'old', ts: 1 }]));
    const s = useQueryHistoryStore();
    expect(s.items).toHaveLength(1);
    expect(s.items[0].mode).toBe('sql');
  });
});
